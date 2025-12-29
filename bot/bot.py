import os
import logging
import sqlite3
import asyncio
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes, CallbackQueryHandler, MessageHandler, filters
from dotenv import load_dotenv
import threading
import queue

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


def save_user_for_notifications(telegram_id, username, first_name, last_name):
    """Сохранить пользователя для уведомлений"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        # Проверяем существует ли пользователь
        cursor.execute('SELECT id FROM users WHERE telegram_id = ?', (telegram_id,))
        user = cursor.fetchone()

        if not user:
            # Создаем пользователя
            cursor.execute('''
                           INSERT INTO users (telegram_id, username, first_name, last_name, created_at)
                           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                           ''', (telegram_id, username, first_name, last_name))
        else:
            # Обновляем информацию
            cursor.execute('''
                           UPDATE users
                           SET username   = ?,
                               first_name = ?,
                               last_name  = ?,
                               last_seen  = CURRENT_TIMESTAMP
                           WHERE telegram_id = ?
                           ''', (username, first_name, last_name, telegram_id))

        conn.commit()
        logger.info(f"✅ Пользователь {telegram_id} сохранен для уведомлений")

    except Exception as e:
        logger.error(f"❌ Ошибка сохранения пользователя: {e}")
    finally:
        conn.close()


# ========== СИСТЕМА УВЕДОМЛЕНИЙ О СТАТУСАХ ==========

def send_order_status_notification(order_id, status, courier_name=None, courier_phone=None):
    """Добавить уведомление о статусе в очередь"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Получаем информацию о заказе и пользователе
        cursor.execute('''
                       SELECT o.user_id, o.recipient_name, o.total_price, u.telegram_id
                       FROM orders o
                                LEFT JOIN users u ON o.user_id = u.id
                       WHERE o.id = ?
                       ''', (order_id,))

        order = cursor.fetchone()

        if order and order['telegram_id']:
            notification_data = {
                'telegram_id': order['telegram_id'],
                'order_id': order_id,
                'status': status,
                'courier_name': courier_name,
                'courier_phone': courier_phone,
                'order_info': dict(order)
            }

            notification_queue.put(notification_data)
            logger.info(f"📨 Уведомление для заказа #{order_id} добавлено в очередь (статус: {status})")

            # Сохраняем в базу
            cursor.execute('''
                           INSERT INTO order_notifications (order_id, user_id, status, created_at)
                           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                           ''', (order_id, order['user_id'], status))

            conn.commit()

            return True
        else:
            logger.warning(f"⚠️ Пользователь для заказа #{order_id} не найден или не имеет telegram_id")
            return False

    except Exception as e:
        logger.error(f"❌ Ошибка подготовки уведомления: {e}")
        return False
    finally:
        conn.close()


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

    # Клавиатура с Web App кнопкой
    keyboard = [
        [InlineKeyboardButton(
            text="🛒 ОТКРЫТЬ МАГАЗИН",
            web_app=WebAppInfo(url=f"{WEBAPP_URL}/webapp")
        )],
        [InlineKeyboardButton("📦 МОИ ЗАКАЗЫ", callback_data="my_orders"),
         InlineKeyboardButton("🚚 ТРЕК ЗАКАЗА", callback_data="track_order")],
        [InlineKeyboardButton("❓ ПОМОЩЬ", callback_data="help")]
    ]

    # Если пользователь админ
    if user.id in ADMIN_IDS:
        keyboard.append([
            InlineKeyboardButton(
                text="👨‍💼 ПАНЕЛЬ АДМИНИСТРАТОРА",
                web_app=WebAppInfo(url=f"{WEBAPP_URL}/admin")
            )
        ])

    # Если пользователь курьер
    if is_user_courier(user.id):
        keyboard.append([
            InlineKeyboardButton("🚚 ПАНЕЛЬ КУРЬЕРА", web_app=WebAppInfo(url=f"{WEBAPP_URL}/courier"))
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
    """Показать все заказы пользователя"""
    user = update.effective_user

    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        cursor.execute('''
                       SELECT o.id,
                              o.total_price,
                              o.status,
                              o.created_at,
                              a.status    as delivery_status,
                              c.full_name as courier_name
                       FROM orders o
                                LEFT JOIN order_assignments a ON o.id = a.order_id
                                LEFT JOIN couriers c ON a.courier_id = c.id
                       WHERE o.user_id = ?
                       ORDER BY o.created_at DESC
                       ''', (user.id,))

        orders = cursor.fetchall()

        if not orders:
            await update.message.reply_text(
                "📭 *У вас пока нет заказов.*\n\n"
                "Нажмите кнопку '🛒 ОТКРЫТЬ МАГАЗИН' чтобы сделать первый заказ!",
                parse_mode='Markdown'
            )
            return

        message = "📋 *Ваши заказы:*\n\n"

        for order in orders:
            status_icon = get_status_icon(order['status'])
            delivery_icon = get_delivery_icon(order['delivery_status'])

            message += f"{status_icon} *Заказ #{order['id']}*\n"
            message += f"💵 Сумма: {order['total_price']} ₽\n"
            message += f"📊 Статус: {get_order_status_text(order['status'])}\n"
            message += f"🚚 Доставка: {delivery_icon} {get_delivery_status_text(order['delivery_status'])}\n"

            if order['courier_name']:
                message += f"👤 Курьер: {order['courier_name']}\n"

            message += f"📅 Дата: {order['created_at'][:10]}\n"

            # Кнопка для отслеживания этого заказа
            keyboard = [[
                InlineKeyboardButton(
                    f"📦 Отследить заказ #{order['id']}",
                    callback_data=f"track_{order['id']}"
                )
            ]]

            await update.message.reply_text(
                message,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )

            message = ""  # Сбрасываем для следующего заказа

    except Exception as e:
        logger.error(f"Ошибка получения заказов: {e}")
        await update.message.reply_text(
            "❌ Произошла ошибка при загрузке заказов.",
            parse_mode='Markdown'
        )
    finally:
        conn.close()


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


# ========== ОБРАБОТЧИКИ КНОПОК ==========

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик нажатий на кнопки"""
    query = update.callback_query
    await query.answer()

    data = query.data

    if data == "my_orders":
        await myorders_command(query, context)

    elif data == "track_order":
        await query.edit_message_text(
            "📝 *Введите номер заказа для отслеживания:*\n\n"
            "Используйте команду: /track <номер_заказа>\n\n"
            "Пример: /track 123",
            parse_mode='Markdown'
        )

    elif data.startswith("track_"):
        order_id = data.replace("track_", "")
        await show_order_status(query, query.from_user.id, order_id)

    elif data.startswith("refresh_"):
        order_id = data.replace("refresh_", "")
        await show_order_status(query, query.from_user.id, order_id)

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
    bot_app.add_handler(CommandHandler("myorders", myorders_command))

    # Обработчик кнопок
    bot_app.add_handler(CallbackQueryHandler(button_handler))

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
    main()