import os
import logging
import sqlite3
import asyncio
from datetime import datetime

import telegram
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes, CallbackQueryHandler, MessageHandler, filters
from dotenv import load_dotenv
import threading
import queue
import json
# Загружаем переменные окружения
load_dotenv()

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Конфигурация
BOT_TOKEN = os.getenv('BOT_TOKEN')
ADMIN_IDS = list(map(int, os.getenv('ADMIN_IDS', '').split(','))) if os.getenv('ADMIN_IDS') else []
WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://telegram-shop-full.onrender.com/')

# Очередь для уведомлений
notification_queue = queue.Queue()

# Глобальное приложение бота
bot_app = None
# ========== БАЗА ДАННЫХ ==========

def get_db_connection():
    """Создание подключения к базе данных"""
    conn = sqlite3.connect('shop.db')
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Инициализация базы данных"""
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()

    # Таблица пользователей для уведомлений
    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS users
                   (
                       id
                       INTEGER
                       PRIMARY
                       KEY
                       AUTOINCREMENT,
                       telegram_id
                       INTEGER
                       UNIQUE,
                       username
                       TEXT,
                       first_name
                       TEXT,
                       last_name
                       TEXT,
                       created_at
                       TIMESTAMP
                       DEFAULT
                       CURRENT_TIMESTAMP,
                       last_seen
                       TIMESTAMP
                       DEFAULT
                       CURRENT_TIMESTAMP
                   )
                   ''')

    # Таблица уведомлений
    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS order_notifications
                   (
                       id
                       INTEGER
                       PRIMARY
                       KEY
                       AUTOINCREMENT,
                       order_id
                       INTEGER,
                       user_id
                       INTEGER,
                       status
                       TEXT,
                       created_at
                       TIMESTAMP
                       DEFAULT
                       CURRENT_TIMESTAMP
                   )
                   ''')

    conn.commit()
    conn.close()
    logger.info("✅ База данных инициализирована")


def save_user_for_notifications(telegram_id, username, first_name, last_name):
    """Сохраняем пользователя для уведомлений"""
    conn = sqlite3.connect("shop.db")
    cursor = conn.cursor()

    try:
        # Сохраняем в таблицу users (или telegram_users)
        cursor.execute('''
            INSERT OR REPLACE INTO users (telegram_id, username, first_name, last_name, last_seen)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (telegram_id, username, first_name, last_name))

        conn.commit()
        logger.info(f"✅ Пользователь {first_name} сохранен для уведомлений (telegram_id: {telegram_id})")

    except Exception as e:
        logger.error(f"❌ Ошибка сохранения пользователя: {e}")
    finally:
        conn.close()


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Статистика для админов"""
    user = update.effective_user

    if user.id not in ADMIN_IDS:
        await update.message.reply_text("❌ Эта команда только для администраторов!")
        return

    db = get_db_connection()

    try:
        stats = db.execute('''
                           SELECT COUNT(*)                as total_orders,
                                  SUM(total_price)        as total_revenue,
                                  AVG(total_price)        as avg_order,
                                  COUNT(DISTINCT user_id) as unique_customers,
                                  (SELECT COUNT(*) FROM orders WHERE DATE (created_at) = DATE ('now')) as today_orders, (
                           SELECT SUM (total_price)
                           FROM orders
                           WHERE DATE (created_at) = DATE ('now')) as today_revenue
                           FROM orders
                           ''').fetchone()

        recent_orders = db.execute('''
                                   SELECT id, user_id, total_price, status, created_at
                                   FROM orders
                                   ORDER BY created_at DESC LIMIT 5
                                   ''').fetchall()

        message = f"""📊 *Статистика магазина*

📦 Всего заказов: *{stats['total_orders']}*
💰 Общая выручка: *{stats['total_revenue'] or 0} ₽*
📈 Средний чек: *{stats['avg_order'] or 0:.2f} ₽*
👥 Уникальных клиентов: *{stats['unique_customers']}*

📅 *Сегодня:*
🛒 Заказов: *{stats['today_orders'] or 0}*
💵 Выручка: *{stats['today_revenue'] or 0} ₽*

🔄 *Последние заказы:*
"""

        for order in recent_orders:
            message += f"\n📦 #{order['id']} - {order['total_price']} ₽ - {order['status']}"

        await update.message.reply_text(message, parse_mode='Markdown')

    finally:
        db.close()


# ========== СИСТЕМА УВЕДОМЛЕНИЙ О СТАТУСАХ ==========

def escape_markdown_v2(text: str) -> str:
    """Экранировать спецсимволы для MarkdownV2"""
    if not text:
        return ""

    # Спецсимволы в Telegram MarkdownV2
    escape_chars = r'_*[]()~`>#+-=|{}.!'
    for char in escape_chars:
        text = text.replace(char, f'\\{char}')

    return text

async def process_notifications():
    """Обработка очереди уведомлений"""
    while True:
        try:
            if not notification_queue.empty():
                notification = notification_queue.get()

                await send_telegram_status_update(
                    notification['telegram_id'],
                    notification['order_id'],
                    notification['status'],
                    notification['courier_name'],
                    notification['courier_phone']
                )

                # Помечаем как обработанное
                notification_queue.task_done()

            await asyncio.sleep(1)  # Проверяем каждую секунду

        except Exception as e:
            logger.error(f"❌ Ошибка обработки уведомлений: {e}")
            await asyncio.sleep(5)


async def send_telegram_status_update(telegram_id, order_id, status, courier_name=None, courier_phone=None):
    """Отправить обновление статуса в Telegram"""
    try:
        if not bot_app:
            logger.error("❌ Бот не инициализирован")
            return

        # Тексты для разных статусов
        status_messages = {
            'created': {
                'title': '✅ *Заказ принят!*',
                'message': f'Заказ #{order_id} успешно создан и передан на обработку.'
            },
            'assigned': {
                'title': '👤 *Курьер назначен!*',
                'message': f'Заказ #{order_id} принят курьером и скоро будет доставлен.'
            },
            'picking_up': {
                'title': '🏪 *Курьер едет в магазин*',
                'message': f'Заказ #{order_id}: курьер направляется за вашим товаром.'
            },
            'picked_up': {
                'title': '📦 *Товар у курьера!*',
                'message': f'Заказ #{order_id} собран и готов к доставке.'
            },
            'on_the_way': {
                'title': '🚗 *Курьер едет к вам!*',
                'message': f'Заказ #{order_id} уже в пути. Прибудет в ближайшее время!'
            },
            'arrived': {
                'title': '📍 *Курьер прибыл!*',
                'message': f'Заказ #{order_id} уже у вас. Встречайте курьера!'
            },
            'delivered': {
                'title': '🎉 *Заказ доставлен!*',
                'message': f'Заказ #{order_id} успешно передан. Спасибо за покупку!'
            }
        }

        status_info = status_messages.get(status, {
            'title': f'📦 *Статус заказа #{order_id} изменен*',
            'message': f'Новый статус: {status}'
        })

        # Формируем сообщение
        message = f"{status_info['title']}\n\n"
        message += f"{status_info['message']}\n\n"
        message += f"📦 *Номер заказа:* #{order_id}\n"

        if courier_name:
            message += f"👤 *Ваш курьер:* {courier_name}\n"

        if courier_phone:
            message += f"📱 *Телефон курьера:* {courier_phone}\n"

        message += "\n💡 *Вы можете отслеживать заказ через команду:*\n"
        message += f"/track_{order_id} или /myorders"

        # Создаем клавиатуру
        keyboard = []

        if courier_phone:
            keyboard.append([
                InlineKeyboardButton(
                    f"📞 Позвонить курьеру",
                    callback_data=f"call_{courier_phone}"
                )
            ])

        keyboard.append([
            InlineKeyboardButton("📦 ОТСЛЕДИТЬ ЗАКАЗ", callback_data=f"track_{order_id}"),
            InlineKeyboardButton("🛒 НОВЫЙ ЗАКАЗ", web_app=WebAppInfo(url=f"{WEBAPP_URL}/webapp"))
        ])

        # Отправляем сообщение
        await bot_app.bot.send_message(
            chat_id=telegram_id,
            text=message,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )

        logger.info(f"📢 Уведомление отправлено пользователю {telegram_id} (заказ #{order_id}, статус: {status})")

    except Exception as e:
        logger.error(f"❌ Ошибка отправки уведомления: {e}")


# ========== КОМАНДЫ БОТА ==========

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start"""
    user = update.effective_user

    # Сохраняем user_id для уведомлений
    save_user_for_notifications(user.id, user.username, user.first_name, user.last_name)

    # Сохраняем в контексте
    context.user_data['telegram_id'] = user.id

    # ВАЖНО: Передаем user_id и username в URL веб-приложения!
    web_app_url = f"{WEBAPP_URL}/webapp?user_id={user.id}&username={user.username or user.first_name}"

    # Клавиатура с Web App кнопкой
    keyboard = [
        [InlineKeyboardButton(
            text="🛒 ОТКРЫТЬ МАГАЗИН",
            web_app=WebAppInfo(url=web_app_url)
        )],
        [InlineKeyboardButton("📦 МОИ ЗАКАЗЫ", callback_data="my_orders")],
        [InlineKeyboardButton("❓ ПОМОЩЬ", callback_data="help")]
    ]

    # Если пользователь админ
    if user.id in ADMIN_IDS:
        admin_url = f"{WEBAPP_URL}/admin?user_id={user.id}"
        keyboard.append([
            InlineKeyboardButton(
                text="👨‍💼 ПАНЕЛЬ АДМИНИСТРАТОРА",
                web_app=WebAppInfo(url=admin_url)
            )
        ])

    # Если пользователь курьер
    if is_user_courier(user.id):
        courier_url = f"{WEBAPP_URL}/courier?user_id={user.id}"
        keyboard.append([
            InlineKeyboardButton(
                "🚚 ПАНЕЛЬ КУРЬЕРА",
                web_app=WebAppInfo(url=courier_url)
            )
        ])

    welcome_text = f"""
    👋 Привет, {user.first_name}!

    🛍️ Добро пожаловать в наш магазин!

    *Теперь вы будете получать уведомления:*
    📱 О статусах ваших заказов
    🚚 О движении курьера
    ✅ О доставке заказа

    *Как сделать заказ:*
    1. Нажмите "🛒 ОТКРЫТЬ МАГАЗИН"
    2. Выберите товары
    3. Оформите доставку
    4. Следите за статусом здесь!
    """

    await update.message.reply_text(
        welcome_text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик нажатий на кнопки - ИСПРАВЛЕННЫЙ"""
    query = update.callback_query
    await query.answer()  # Убираем "часики" на кнопке

    data = query.data
    user = query.from_user

    if data == "my_orders":
        await myorders_command(update, context)

    elif data == "refresh_orders":
        await myorders_command(update, context)

    elif data.startswith("track_"):
        order_id = data.replace("track_", "")
        await show_order_status(query, user.id, order_id)

    elif data.startswith("refresh_"):
        order_id = data.replace("refresh_", "")
        await show_order_status(query, user.id, order_id)

    elif data.startswith("call_"):
        phone = data.replace("call_", "")
        await query.edit_message_text(
            f"📞 *Номер курьера:* `{phone}`\n\n"
            "Вы можете позвонить по этому номеру для уточнения деталей доставки.",
            parse_mode='Markdown'
        )

    elif data == "help":
        await query.edit_message_text(
            "❓ *Помощь*\n\n"
            "*Основные команды:*\n"
            "/start - Запустить бота\n"
            "/track <номер> - Отследить заказ\n"
            "/myorders - Мои заказы\n\n"
            "*Уведомления:*\n"
            "Бот автоматически присылает уведомления:\n"
            "✅ Когда заказ принят\n"
            "👤 Когда назначен курьер\n"
            "🏪 Когда курьер едет в магазин\n"
            "📦 Когда курьер забрал товар\n"
            "🚗 Когда курьер едет к вам\n"
            "📍 Когда курьер прибыл\n"
            "🎉 Когда заказ доставлен",
            parse_mode='Markdown'
        )

    elif data == "support":
        await query.edit_message_text(
            "📞 *Поддержка*\n\n"
            "🕒 Работаем круглосуточно\n\n"
            "*Телефон:* +7 (999) 123-45-67\n"
            "*Email:* support@example.com\n\n"
            "Напишите ваш вопрос, и мы ответим в ближайшее время!",
            parse_mode='Markdown'
        )

def is_user_courier(telegram_id):
    """Проверить, является ли пользователь курьером"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM couriers WHERE telegram_id = ?', (telegram_id,))
        courier = cursor.fetchone()
        return courier is not None
    except:
        return False
    finally:
        conn.close()


async def track_order_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Отслеживание заказа по номеру"""
    if not context.args:
        await update.message.reply_text(
            "📝 *Использование:* /track <номер_заказа>\n\n"
            "Пример: /track 123\n\n"
            "Или нажмите кнопку '📦 МОИ ЗАКАЗЫ' для просмотра всех заказов.",
            parse_mode='Markdown'
        )
        return

    order_id = context.args[0]
    user = update.effective_user

    await show_order_status(update, user.id, order_id)


async def myorders_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Показать все заказы пользователя - ИСПРАВЛЕННАЯ ВЕРСИЯ"""
    try:
        # Определяем тип обновления и получаем пользователя
        user = None
        chat_id = None
        message_id = None
        is_callback = False
        query = None

        if update.message:
            # Команда из текстового сообщения
            user = update.effective_user
            chat_id = update.effective_chat.id
            message_id = update.message.message_id
            is_callback = False
        elif update.callback_query:
            # Команда из кнопки
            query = update.callback_query
            user = query.from_user
            chat_id = query.message.chat_id if query.message else user.id
            message_id = query.message.message_id if query.message else None
            is_callback = True
            await query.answer()  # Убираем "часики" на кнопке
        else:
            logger.error("❌ Неизвестный тип обновления")
            return

        if not user:
            logger.error("❌ Не удалось определить пользователя")
            return

        logger.info(f"📋 Получение заказов для пользователя {user.id} ({user.username or 'без username'})")

        # Подключаемся к базе данных
        conn = sqlite3.connect("shop.db")
        conn.row_factory = sqlite3.Row

        try:
            cursor = conn.cursor()

            # ВАЖНО: Ищем заказы напрямую по telegram_id в таблице orders
            # user_id в orders = telegram_id пользователя
            cursor.execute('''
                           SELECT o.id,
                                  o.total_price,
                                  o.status,
                                  o.created_at,
                                  o.delivery_type,
                                  o.recipient_name,
                                  o.phone_number,
                                  o.delivery_address,
                                  a.status    as delivery_status,
                                  c.full_name as courier_name,
                                  c.phone     as courier_phone
                           FROM orders o
                                    LEFT JOIN order_assignments a ON o.id = a.order_id
                                    LEFT JOIN couriers c ON a.courier_id = c.id
                           WHERE o.user_id = ? -- здесь user_id = telegram_id
                           ORDER BY o.created_at DESC LIMIT 10
                           ''', (user.id,))  # передаем telegram_id напрямую

            orders = cursor.fetchall()

            if not orders:
                response = "📭 *У вас пока нет заказов.*\n\nНажмите кнопку '🛒 ОТКРЫТЬ МАГАЗИН' чтобы сделать первый заказ!"
                keyboard = [[
                    InlineKeyboardButton(
                        "🛒 Открыть магазин",
                        web_app=WebAppInfo(
                            url=f"{WEBAPP_URL}/webapp?user_id={user.id}&username={user.username or user.first_name}")
                    )
                ]]

                if is_callback:
                    try:
                        await query.edit_message_text(
                            response,
                            parse_mode='Markdown',
                            reply_markup=InlineKeyboardMarkup(keyboard)
                        )
                    except Exception as e:
                        # Если не можем отредактировать (например, старое сообщение), отправляем новое
                        await context.bot.send_message(
                            chat_id=chat_id,
                            text=response,
                            parse_mode='Markdown',
                            reply_markup=InlineKeyboardMarkup(keyboard)
                        )
                else:
                    await context.bot.send_message(
                        chat_id=chat_id,
                        text=response,
                        parse_mode='Markdown',
                        reply_markup=InlineKeyboardMarkup(keyboard)
                    )
                return

            # Формируем список заказов
            orders_text = "📋 *Ваши заказы:*\n\n"

            for order in orders:
                order_dict = dict(order)

                # Форматируем адрес
                address = "Адрес не указан"
                recipient = order_dict.get('recipient_name') or "Не указан"
                phone = order_dict.get('phone_number') or "Телефон не указан"

                if order_dict.get('delivery_address'):
                    try:
                        addr_data = json.loads(order_dict['delivery_address'])
                        if isinstance(addr_data, dict):
                            addr_parts = []
                            if addr_data.get('city'):
                                addr_parts.append(str(addr_data['city']))
                            if addr_data.get('street'):
                                addr_parts.append(f"ул. {addr_data['street']}")
                            if addr_data.get('house'):
                                addr_parts.append(f"д. {addr_data['house']}")
                            if addr_data.get('apartment'):
                                addr_parts.append(f"кв. {addr_data['apartment']}")
                            address = ', '.join(addr_parts) if addr_parts else "Адрес не указан"
                        else:
                            address = str(addr_data)
                    except Exception as e:
                        address = str(order_dict.get('delivery_address', 'Адрес не указан'))

                # Информация о курьере
                courier_info = ""
                if order_dict.get('courier_name'):
                    courier_info = f"\n🚚 Курьер: {order_dict['courier_name']}"
                    if order_dict.get('courier_phone'):
                        courier_info += f" (📞 {order_dict['courier_phone']})"

                # Статус доставки
                delivery_status = ""
                if order_dict.get('delivery_status'):
                    delivery_status = f"\n📍 Доставка: {get_delivery_status_text(order_dict['delivery_status'])}"

                orders_text += f"📦 *Заказ #{order_dict['id']}*\n"
                orders_text += f"💵 Сумма: {order_dict['total_price']} ₽\n"
                orders_text += f"📊 Статус: {get_order_status_text(order_dict['status'])}{delivery_status}\n"
                orders_text += f"👤 Получатель: {recipient}\n"
                orders_text += f"📞 Телефон: {phone}\n"
                orders_text += f"📍 Адрес: {address}\n"
                orders_text += f"📅 Дата: {order_dict['created_at'][:10]}{courier_info}\n\n"

            # Клавиатура
            keyboard = [
                [
                    InlineKeyboardButton(
                        "🛒 Открыть магазин",
                        web_app=WebAppInfo(
                            url=f"{WEBAPP_URL}/webapp?user_id={user.id}&username={user.username or user.first_name}")
                    )
                ],
                [InlineKeyboardButton("🔄 Обновить", callback_data="my_orders")]
            ]

            if is_callback:
                try:
                    await query.edit_message_text(
                        orders_text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode='Markdown'
                    )
                except Exception as e:
                    logger.error(f"❌ Ошибка редактирования сообщения: {e}")
                    # Если не можем отредактировать, отправляем новое сообщение
                    await context.bot.send_message(
                        chat_id=chat_id,
                        text=orders_text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode='Markdown'
                    )
            else:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=orders_text,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )

        except Exception as e:
            logger.error(f"❌ Ошибка получения заказов: {e}")
            error_msg = "❌ Произошла ошибка при загрузке заказов. Пожалуйста, попробуйте позже."

            if is_callback:
                try:
                    await query.edit_message_text(error_msg, parse_mode='Markdown')
                except:
                    await context.bot.send_message(chat_id=chat_id, text=error_msg)
            else:
                await context.bot.send_message(chat_id=chat_id, text=error_msg)

        finally:
            conn.close()

    except Exception as e:
        logger.error(f"❌ Критическая ошибка в myorders_command: {e}")


def format_order_message(order):
    """Форматировать сообщение о заказе"""
    order = dict(order)
    status_icon = get_status_icon(order['status'])

    return f"""{status_icon} *Заказ #{order['id']}*
💵 Сумма: {order['total_price']} ₽
📊 Статус: {get_order_status_text(order['status'])}
📅 Дата: {order['created_at'][:10]}
"""



async def show_order_status(update, user_id, order_id):
    """Показать статус конкретного заказа"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        cursor.execute('''
                       SELECT o.*,
                              a.status    as delivery_status,
                              a.delivered_at,
                              c.full_name as courier_name,
                              c.phone     as courier_phone
                       FROM orders o
                                LEFT JOIN order_assignments a ON o.id = a.order_id
                                LEFT JOIN couriers c ON a.courier_id = c.id
                       WHERE o.id = ?
                         AND o.user_id = ?
                       ''', (order_id, user_id))

        order = cursor.fetchone()

        if not order:
            if isinstance(update, Update):
                await update.message.reply_text(
                    f"❌ Заказ #{order_id} не найден.",
                    parse_mode='Markdown'
                )
            else:  # callback query
                await update.edit_message_text(
                    f"❌ Заказ #{order_id} не найден.",
                    parse_mode='Markdown'
                )
            return

        # Формируем сообщение
        message = format_order_status_message(order)

        # Создаем клавиатуру
        keyboard = []

        if order['courier_phone']:
            keyboard.append([
                InlineKeyboardButton(
                    f"📞 Позвонить курьеру",
                    callback_data=f"call_{order['courier_phone']}"
                )
            ])

        keyboard.append([
            InlineKeyboardButton("🔄 ОБНОВИТЬ", callback_data=f"refresh_{order_id}"),
            InlineKeyboardButton("📞 ПОДДЕРЖКА", callback_data="support")
        ])

        if isinstance(update, Update):
            await update.message.reply_text(
                message,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
        else:  # callback query
            await update.edit_message_text(
                message,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )

    except Exception as e:
        logger.error(f"Ошибка получения статуса заказа: {e}")
        error_msg = "❌ Произошла ошибка при получении статуса заказа."
        if isinstance(update, Update):
            await update.message.reply_text(error_msg, parse_mode='Markdown')
        else:
            await update.edit_message_text(error_msg, parse_mode='Markdown')
    finally:
        conn.close()


def format_order_status_message(order):
    """Форматировать сообщение о статусе заказа"""
    order = dict(order)

    # Иконки статусов
    status_icons = {
        'pending': '⏳',
        'processing': '🔄',
        'confirmed': '✅',
        'delivered': '🎉',
        'cancelled': '❌'
    }

    delivery_icons = {
        'assigned': '👤',
        'picking_up': '🏪',
        'picked_up': '📦',
        'on_the_way': '🚗',
        'arrived': '📍',
        'delivered': '✅'
    }

    status = order.get('status', 'pending')
    delivery_status = order.get('delivery_status')

    message = f"{status_icons.get(status, '📦')} *Заказ #{order['id']}*\n\n"

    # Информация о статусе
    message += "*📊 Статус заказа:*\n"
    message += f"{get_order_status_text(status)}\n\n"

    if delivery_status:
        message += "*🚚 Статус доставки:*\n"
        message += f"{delivery_icons.get(delivery_status, '🕒')} {get_delivery_status_text(delivery_status)}\n\n"

    # Информация о курьере
    if order.get('courier_name'):
        message += "*👤 Информация о курьере:*\n"
        message += f"Имя: {order['courier_name']}\n"
        if order.get('courier_phone'):
            message += f"Телефон: {order['courier_phone']}\n"
        message += "\n"

    # Детали заказа
    message += "*📦 Детали заказа:*\n"
    message += f"Сумма: {order.get('total_price', 0)} ₽\n"
    message += f"Дата: {order.get('created_at', '')[:10]}\n"

    if order.get('delivered_at'):
        message += f"Доставлено: {order['delivered_at'][:16]}\n"

    return message
# ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

def get_status_icon(status):
    icons = {
        'pending': '⏳',
        'processing': '🔄',
        'confirmed': '✅',
        'delivered': '🎉',
        'cancelled': '❌'
    }
    return icons.get(status, '📦')


def get_delivery_icon(status):
    icons = {
        'assigned': '👤',
        'picking_up': '🏪',
        'picked_up': '📦',
        'on_the_way': '🚗',
        'arrived': '📍',
        'delivered': '✅'
    }
    return icons.get(status, '🕒')


def get_order_status_text(status):
    statuses = {
        'pending': '⏳ Ожидает обработки',
        'processing': '🔄 В обработке',
        'confirmed': '✅ Подтвержден',
        'delivered': '🎉 Доставлен',
        'cancelled': '❌ Отменен'
    }
    return statuses.get(status, status)


def get_delivery_status_text(status):
    statuses = {
        'assigned': '👤 Курьер назначен',
        'picking_up': '🏪 Едет в магазин',
        'picked_up': '📦 Забрал заказ',
        'on_the_way': '🚗 Едет к вам',
        'arrived': '📍 Уже у вас',
        'delivered': '✅ Доставлен'
    }
    return statuses.get(status, status or 'Ожидает курьера')


# ========== ЗАПУСК БОТА ==========

async def start_notification_processor():
    """Запустить обработчик уведомлений"""
    while True:
        await process_notifications()


def main():
    """Запуск бота"""
    global bot_app

    if not BOT_TOKEN:
        logger.error("❌ BOT_TOKEN не установлен!")
        return

    # Создаем приложение
    bot_app = Application.builder().token(BOT_TOKEN).build()

    # Добавляем обработчики команд
    bot_app.add_handler(CommandHandler("start", start_command))
    bot_app.add_handler(CommandHandler("track", track_order_command))
    bot_app.add_handler(CommandHandler("stats", stats_command))
    bot_app.add_handler(CommandHandler("myorders", myorders_command))

    # Обработчик кнопок
    bot_app.add_handler(CallbackQueryHandler(callback_handler))

    # Запускаем обработчик уведомлений в отдельной задаче
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # Создаем задачу для обработки уведомлений
    notification_task = loop.create_task(start_notification_processor())

    # Запускаем бота
    logger.info("🤖 Бот запускается...")
    print("=" * 50)
    print("✅ Бот успешно запущен!")
    print("📢 Система уведомлений активна")
    print(f"🌐 Web App URL: {WEBAPP_URL}")
    print("=" * 50)

    bot_app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    init_database()  # Добавьте эту строку
    main()
