import os
import logging
from datetime import datetime

from telegram.ext import filters
import requests
import sys
import asyncio

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.error import BadRequest
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler
from dotenv import load_dotenv

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
WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://telegram-shop-full.onrender.com/')
API_BASE_URL = WEBAPP_URL.rstrip('/')

print(f"🔍 Токен бота: {BOT_TOKEN}")


# ========== API КЛИЕНТ ==========

def get_user_orders(telegram_id):
    """Получить заказы пользователя через API"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/bot/get-orders/{telegram_id}", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data.get('orders', [])
        return []
    except Exception as e:
        logger.error(f"Ошибка получения заказов: {e}")
        return []


def get_order_details(order_id, user_id):
    """Получить детали заказа через API"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/bot/get-order/{order_id}/{user_id}", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data.get('order', {})
        return {}
    except Exception as e:
        logger.error(f"Ошибка получения деталей заказа: {e}")
        return {}


async def send_chat_message(user_id, order_id, message, is_admin=False):
    """Отправить сообщение в чат через API"""
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/chat/send",
            json={
                'order_id': int(order_id),
                'user_id': user_id,
                'message': message,
                'sender_type': 'admin' if is_admin else 'customer'
            },
            timeout=5
        )
        return response.status_code == 200
    except Exception as e:
        logger.error(f"Ошибка отправки сообщения: {e}")
        return False


def get_admin_chats():
    """Получить активные чаты для администратора"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/admin/chats", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data.get('chats', [])
        return []
    except Exception as e:
        logger.error(f"Ошибка получения чатов: {e}")
        return []


def get_all_orders():
    """Получить все заказы для администратора"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/admin/orders", timeout=5)
        if response.status_code == 200:
            return response.json()
        return []
    except Exception as e:
        logger.error(f"Ошибка получения заказов: {e}")
        return []


def get_couriers():
    """Получить список курьеров"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/admin/couriers", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data.get('couriers', [])
        return []
    except Exception as e:
        logger.error(f"Ошибка получения курьеров: {e}")
        return []


def get_courier_stats():
    """Получить статистику курьеров"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/admin/couriers/stats", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data.get('stats', {})
        return {}
    except Exception as e:
        logger.error(f"Ошибка получения статистики: {e}")
        return {}


def get_available_orders():
    """Получить доступные заказы для курьеров"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/courier/available-orders", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data.get('available_orders', [])
        return []
    except Exception as e:
        logger.error(f"Ошибка получения доступных заказов: {e}")
        return []


def get_courier_orders(courier_id):
    """Получить заказы курьера"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/courier/orders?courier_id={courier_id}", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data
        return {'active_orders': [], 'completed_orders': [], 'today_orders': []}
    except Exception as e:
        logger.error(f"Ошибка получения заказов курьера: {e}")
        return {'active_orders': [], 'completed_orders': [], 'today_orders': []}


def get_courier_profile(courier_id):
    """Получить профиль курьера"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/courier/profile/{courier_id}", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data.get('profile', {})
        return {}
    except Exception as e:
        logger.error(f"Ошибка получения профиля курьера: {e}")
        return {}


def get_chat_messages(order_id):
    """Получить сообщения чата"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/chat/messages?order_id={order_id}", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data.get('messages', [])
        return []
    except Exception as e:
        logger.error(f"Ошибка получения сообщений чата: {e}")
        return []


# ========== КОМАНДЫ БОТА ==========

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /start"""
    user = update.effective_user
    web_app_url = f"{WEBAPP_URL}/webapp?user_id={user.id}&username={user.username or user.first_name}"

    keyboard = [
        [InlineKeyboardButton("🛒 ОТКРЫТЬ МАГАЗИН", web_app=WebAppInfo(url=web_app_url))],
        [InlineKeyboardButton("📦 МОИ ЗАКАЗЫ", callback_data="my_orders")],
        [InlineKeyboardButton("❓ ПОМОЩЬ", callback_data="help")]
    ]

    await update.message.reply_text(
        f"👋 Привет, {user.first_name}!\n\n"
        "🛍️ Добро пожаловать в наш магазин!\n\n"
        "*Как сделать заказ:*\n"
        "1. Нажмите '🛒 ОТКРЫТЬ МАГАЗИН'\n"
        "2. Выберите товары\n"
        "3. Оформите доставку\n"
        "4. Следите за статусом здесь!\n\n"
        "*Вы будете получать уведомления:*\n"
        "✅ Когда заказ принят\n"
        "👤 Когда назначен курьер\n"
        "🚚 Когда курьер едет к вам\n"
        "🎉 Когда заказ доставлен",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def my_orders(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Показать заказы пользователя"""
    if update.callback_query:
        query = update.callback_query
        user = query.from_user
        await query.answer()
    else:
        user = update.effective_user

    orders = get_user_orders(user.id)

    if not orders:
        text = "📭 *У вас пока нет заказов.*\n\nНажмите кнопку '🛒 ОТКРЫТЬ МАГАЗИН' чтобы сделать первый заказ!"
        keyboard = [[InlineKeyboardButton(
            "🛒 Открыть магазин",
            web_app=WebAppInfo(url=f"{WEBAPP_URL}/webapp?user_id={user.id}")
        )]]
    else:
        text = "📋 *ВАШИ ЗАКАЗЫ*\n\n"

        for order in orders:
            status = order.get('status', 'pending')
            status_text = {
                'pending': '⏳ *Ожидает обработки*',
                'processing': '🔄 *В обработке*',
                'delivering': '🚚 *Доставляется*',
                'delivered': '✅ *Доставлен*',
                'completed': '🎉 *Завершен*',
                'cancelled': '❌ *Отменен*',
                'picked_up': '📦 *Курьер забрал заказ*'
            }.get(status, f"📊 *{status}*")

            text += f"━━━━━━━━━━━━━━━━━━━━\n"
            text += f"📦 *ЗАКАЗ #{order['id']}*\n"
            text += f"━━━━━━━━━━━━━━━━━━━━\n"
            text += f"{status_text}\n"
            text += f"💰 *Сумма:* {order.get('total_price', 0)} ₽\n"
            text += f"📅 *Дата:* {order.get('created_at', '')[:10]}\n"

            # Получаем детали заказа
            try:
                response = requests.get(f"{API_BASE_URL}/api/bot/get-order/{order['id']}/{user.id}", timeout=3)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('success'):
                        order_details = data.get('order', {})
                        items_list = order_details.get('items_list', [])

                        if items_list:
                            text += f"\n📦 *Товары ({len(items_list)}):*\n"
                            text += "```\n"

                            for item in items_list:
                                name = item.get('name', 'Товар')
                                quantity = item.get('quantity', 1)
                                price = item.get('price', 0)

                                # Обрезаем длинные названия
                                if len(name) > 20:
                                    name = name[:18] + "..."

                                if item.get('is_weight') and item.get('weight'):
                                    text += f"• {name}\n"
                                    text += f"  {quantity}шт × {item['weight']}кг = {price}₽\n"
                                else:
                                    text += f"• {name}\n"
                                    text += f"  {quantity}шт × {price}₽\n"

                            text += "```\n"

            except Exception as e:
                print(f"⚠️ Ошибка получения товаров заказа: {e}")

        text += f"\n_🕒 Обновлено: {datetime.now().strftime('%H:%M:%S')}_"

        keyboard = [
            [InlineKeyboardButton("🛒 ОТКРЫТЬ МАГАЗИН",
                                  web_app=WebAppInfo(url=f"{WEBAPP_URL}/webapp?user_id={user.id}"))],
            [InlineKeyboardButton("🔄 ОБНОВИТЬ", callback_data="my_orders")]
        ]

    if update.callback_query:
        try:
            await query.edit_message_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
        except Exception as e:
            if "Message is not modified" not in str(e):
                print(f"⚠️ Ошибка редактирования сообщения: {e}")
    else:
        await update.message.reply_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )


async def track_order(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Отслеживание заказа"""
    if not context.args:
        await update.message.reply_text(
            "📝 *Использование:* /track <номер_заказа>\n\n"
            "Пример: /track 123",
            parse_mode='Markdown'
        )
        return

    order_id = context.args[0]
    user = update.effective_user

    try:
        response = requests.get(f"{API_BASE_URL}/api/bot/get-order/{order_id}/{user.id}", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                order = data.get('order', {})

                status_text = {
                    'pending': '⏳ Ожидает обработки',
                    'processing': '🔄 В обработке',
                    'delivering': '🚚 Доставляется',
                    'completed': '✅ Завершен',
                    'cancelled': '❌ Отменен'
                }.get(order.get('status', 'pending'), order.get('status', 'pending'))

                text = f"📦 *Заказ #{order['id']}*\n\n"
                text += f"📊 Статус: {status_text}\n"
                text += f"💰 Сумма: {order.get('total_price', 0)} ₽\n"
                text += f"📅 Дата: {order.get('created_at', '')[:10]}\n"

                if order.get('courier_name'):
                    text += f"\n👤 Курьер: {order['courier_name']}"
                    if order.get('courier_phone'):
                        text += f"\n📱 Телефон: {order['courier_phone']}"

                keyboard = [[InlineKeyboardButton("🔄 Обновить", callback_data=f"track_{order_id}")]]

                await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard),
                                                parse_mode='Markdown')
                return

        await update.message.reply_text(f"❌ Заказ #{order_id} не найден.", parse_mode='Markdown')

    except Exception as e:
        logger.error(f"Ошибка получения заказа: {e}")
        await update.message.reply_text("❌ Ошибка получения информации о заказе.", parse_mode='Markdown')


# ========== АДМИН ПАНЕЛЬ ==========

async def check_admin(telegram_id):
    """Проверка, является ли пользователь администратором"""
    admin_ids = os.getenv('ADMIN_IDS', '').split(',')
    return str(telegram_id) in admin_ids


async def admin_panel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Панель администратора"""
    if update.callback_query:
        query = update.callback_query
        user = query.from_user
        await query.answer()
    else:
        user = update.effective_user

    # Проверяем, является ли пользователь администратором
    if not await check_admin(user.id):
        if update.callback_query:
            await query.edit_message_text("❌ У вас нет прав для доступа к панели администратора.")
        else:
            await update.message.reply_text("❌ У вас нет прав для доступа к панели администратора.")
        return

    keyboard = [
        [
            InlineKeyboardButton("📋 Все заказы", callback_data="admin_all_orders"),
            InlineKeyboardButton("💬 Активные чаты", callback_data="admin_active_chats")
        ],
        [
            InlineKeyboardButton("🚚 Курьеры", callback_data="admin_couriers"),
            InlineKeyboardButton("📊 Статистика", callback_data="admin_stats")
        ],
        [
            InlineKeyboardButton("🛒 Товары", callback_data="admin_products"),
            InlineKeyboardButton("🎫 Промокоды", callback_data="admin_promocodes")
        ]
    ]

    if update.callback_query:
        await query.edit_message_text(
            "👨‍💼 *ПАНЕЛЬ АДМИНИСТРАТОРА*\n\n"
            "Выберите раздел для управления:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    else:
        await update.message.reply_text(
            "👨‍💼 *ПАНЕЛЬ АДМИНИСТРАТОРА*\n\n"
            "Выберите раздел для управления:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )


async def admin_all_orders(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Показать все заказы администратору"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    orders = get_all_orders()

    if not orders:
        text = "📭 *Заказов пока нет*"
    else:
        text = "📋 *ПОСЛЕДНИЕ ЗАКАЗЫ*\n\n"

        for order in orders[:10]:
            status = order.get('status', 'pending')
            status_text = {
                'pending': '⏳ Ожидает',
                'processing': '🔄 В обработке',
                'delivering': '🚚 Доставляется',
                'delivered': '✅ Доставлен',
                'completed': '🎉 Завершен',
                'cancelled': '❌ Отменен'
            }.get(status, status)

            text += f"━━━━━━━━━━━━━━━━━━━━\n"
            text += f"📦 *Заказ #{order['id']}*\n"
            text += f"📊 Статус: {status_text}\n"
            text += f"👤 Клиент: {order.get('username', 'Гость')}\n"
            text += f"💰 Сумма: {order.get('total_price', 0)} ₽\n"
            text += f"📅 Дата: {order.get('created_at', '')[:10]}\n"

            # Добавляем кнопку для управления заказом
            keyboard = [[
                InlineKeyboardButton("📝 Управлять", callback_data=f"admin_order_{order['id']}")
            ]]

            await query.message.reply_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            text = ""

        text += f"\n📊 Всего заказов: {len(orders)}"

    keyboard = [
        [
            InlineKeyboardButton("💬 Активные чаты", callback_data="admin_active_chats"),
            InlineKeyboardButton("🚚 Курьеры", callback_data="admin_couriers")
        ],
        [
            InlineKeyboardButton("🔄 Обновить", callback_data="admin_all_orders"),
            InlineKeyboardButton("🏠 Назад", callback_data="admin_panel")
        ]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_active_chats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Показать активные чаты администратору"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    chats = get_admin_chats()

    if not chats:
        text = "💬 *Активных чатов нет*"
    else:
        text = "💬 *АКТИВНЫЕ ЧАТЫ*\n\n"

        for chat in chats[:5]:
            unread = chat.get('unread_count', 0)
            unread_badge = f" 🔴({unread})" if unread > 0 else ""

            text += f"━━━━━━━━━━━━━━━━━━━━\n"
            text += f"📦 *Заказ #{chat['order_id']}*{unread_badge}\n"
            text += f"👤 Клиент: {chat.get('customer_name', 'Клиент')}\n"
            text += f"📊 Статус: {chat.get('order_status', 'Неизвестно')}\n"

            if chat.get('last_message_short'):
                text += f"💬 {chat['last_message_short']}\n"

        text += f"\n💬 Всего активных чатов: {len(chats)}"

    keyboard = []

    # Кнопки для каждого чата
    for chat in chats[:3]:
        unread = chat.get('unread_count', 0)
        btn_text = f"💬 Заказ #{chat['order_id']}"
        if unread > 0:
            btn_text = f"🔴 {btn_text} ({unread})"

        keyboard.append([
            InlineKeyboardButton(btn_text, callback_data=f"admin_open_chat_{chat['order_id']}")
        ])

    keyboard.append([
        InlineKeyboardButton("🔄 Обновить", callback_data="admin_active_chats"),
        InlineKeyboardButton("🏠 Назад", callback_data="admin_panel")
    ])

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_manage_couriers(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Управление курьерами - главное меню"""
    if update.callback_query:
        query = update.callback_query
        user = query.from_user
        await query.answer()
        message_func = query.edit_message_text
    else:
        user = update.effective_user
        message_func = update.message.reply_text

    # Проверяем права администратора
    if not await check_admin(user.id):
        await message_func("❌ У вас нет прав администратора")
        return

    keyboard = [
        [
            InlineKeyboardButton("📋 Список курьеров", callback_data="admin_couriers_list"),
            InlineKeyboardButton("➕ Добавить курьера", callback_data="admin_add_courier")
        ],
        [
            InlineKeyboardButton("📊 Статистика", callback_data="admin_couriers_stats"),
            InlineKeyboardButton("🏠 В панель", callback_data="admin_panel")
        ]
    ]

    await message_func(
        "🚚 *УПРАВЛЕНИЕ КУРЬЕРАМИ*\n\n"
        "Выберите действие:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_couriers_list(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Список всех курьеров"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    couriers = get_couriers()

    if not couriers:
        text = "🚚 *Курьеров пока нет*\n\nНажмите '➕ Добавить курьера' чтобы создать первого курьера."
        keyboard = [[
            InlineKeyboardButton("➕ Добавить курьера", callback_data="admin_add_courier"),
            InlineKeyboardButton("🔄 Обновить", callback_data="admin_couriers_list")
        ]]

        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        return

    text = "🚚 *ВСЕ КУРЬЕРЫ*\n\n"
    for courier in couriers[:5]:
        status = "✅ Активен" if courier.get('is_active') else "❌ Неактивен"
        telegram_status = "📱 Telegram: Есть" if courier.get('has_telegram') else "📵 Telegram: Нет"

        text += f"━━━━━━━━━━━━━━━━━━━━\n"
        text += f"👤 *{courier.get('full_name', 'Не указано')}*\n"
        text += f"🆔 ID: {courier.get('id')}\n"
        text += f"📞 {courier.get('phone', 'Не указан')}\n"
        text += f"🚗 {courier.get('vehicle_type', 'Не указан')}\n"
        text += f"{status} | {telegram_status}\n"

        if courier.get('active_orders', 0) > 0:
            text += f"📦 Активных заказов: {courier['active_orders']}\n"

    text += f"\n📊 Показано {min(len(couriers), 5)} из {len(couriers)} курьеров"

    keyboard = [
        [
            InlineKeyboardButton("➕ Добавить курьера", callback_data="admin_add_courier"),
            InlineKeyboardButton("🔄 Обновить", callback_data="admin_couriers_list")
        ]
    ]

    # Кнопки для навигации
    if len(couriers) > 5:
        keyboard.append([
            InlineKeyboardButton("➡️ Показать еще", callback_data="admin_couriers_more")
        ])

    keyboard.append([
        InlineKeyboardButton("🏠 В панель", callback_data="admin_panel")
    ])

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_couriers_more(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Показать больше курьеров"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    couriers = get_couriers()

    if len(couriers) <= 5:
        await query.edit_message_text("📊 Все курьеры показаны", parse_mode='Markdown')
        await admin_couriers_list(update, context)
        return

    text = "🚚 *ВСЕ КУРЬЕРЫ (продолжение)*\n\n"
    for courier in couriers[5:10]:
        status = "✅ Активен" if courier.get('is_active') else "❌ Неактивен"
        telegram_status = "📱 Telegram: Есть" if courier.get('has_telegram') else "📵 Telegram: Нет"

        text += f"━━━━━━━━━━━━━━━━━━━━\n"
        text += f"👤 *{courier.get('full_name', 'Не указано')}*\n"
        text += f"🆔 ID: {courier.get('id')}\n"
        text += f"📞 {courier.get('phone', 'Не указан')}\n"
        text += f"🚗 {courier.get('vehicle_type', 'Не указан')}\n"
        text += f"{status} | {telegram_status}\n"

        if courier.get('active_orders', 0) > 0:
            text += f"📦 Активных заказов: {courier['active_orders']}\n"

    text += f"\n📊 Показано {min(len(couriers), 10)} из {len(couriers)} курьеров"

    keyboard = [
        [
            InlineKeyboardButton("◀️ Назад к списку", callback_data="admin_couriers_list"),
            InlineKeyboardButton("🔄 Обновить", callback_data="admin_couriers_more")
        ],
        [
            InlineKeyboardButton("🏠 В панель", callback_data="admin_panel")
        ]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_add_courier(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Добавление нового курьера"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    # Запрашиваем данные для создания курьера
    context.user_data['adding_courier'] = True
    context.user_data['courier_data'] = {}
    context.user_data['courier_step'] = 1

    await query.edit_message_text(
        "➕ *ДОБАВЛЕНИЕ НОВОГО КУРЬЕРА*\n\n"
        "Шаг 1/5\n"
        "Введите *логин* курьера (на английском, без пробелов):",
        parse_mode='Markdown'
    )


async def admin_edit_courier(update: Update, context: ContextTypes.DEFAULT_TYPE, courier_id):
    """Редактирование курьера"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    try:
        response = requests.get(f"{API_BASE_URL}/api/admin/couriers/{courier_id}", timeout=5)

        if response.status_code == 200:
            data = response.json()

            if data.get('success'):
                courier = data.get('courier', {})

                text = f"✏️ *РЕДАКТИРОВАНИЕ КУРЬЕРА #{courier_id}*\n\n"
                text += f"👤 *ФИО:* {courier.get('full_name', 'Не указано')}\n"
                text += f"📞 *Телефон:* {courier.get('phone', 'Не указан')}\n"
                text += f"🚗 *Транспорт:* {courier.get('vehicle_type', 'Не указан')}\n"
                text += f"📱 *Telegram ID:* {courier.get('telegram_id', 'Не привязан')}\n"

                if courier.get('stats'):
                    stats = courier['stats']
                    text += f"\n📊 *СТАТИСТИКА:*\n"
                    text += f"✅ Завершенных заказов: {stats.get('completed_orders', 0)}\n"
                    text += f"📦 Активных заказов: {stats.get('active_orders', 0)}\n"
                    text += f"💰 Общая выручка: {stats.get('total_revenue', 0)} ₽\n"

                keyboard = [
                    [
                        InlineKeyboardButton("✏️ Изменить данные", callback_data=f"admin_update_courier_{courier_id}"),
                        InlineKeyboardButton("🔐 Сменить пароль", callback_data=f"admin_change_pass_{courier_id}")
                    ],
                    [
                        InlineKeyboardButton(f"{'❌ Деактивировать' if courier.get('is_active') else '✅ Активировать'}",
                                             callback_data=f"admin_toggle_courier_{courier_id}"),
                        InlineKeyboardButton("🗑️ Удалить", callback_data=f"admin_confirm_delete_{courier_id}")
                    ],
                    [
                        InlineKeyboardButton("📋 Назад к списку", callback_data="admin_couriers_list"),
                        InlineKeyboardButton("🏠 В панель", callback_data="admin_panel")
                    ]
                ]

                await query.edit_message_text(
                    text,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )

    except Exception as e:
        logger.error(f"Ошибка получения информации о курьере: {e}")
        await query.edit_message_text(
            "❌ Ошибка получения информации о курьере",
            parse_mode='Markdown'
        )


async def admin_delete_courier_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE, courier_id):
    """Подтверждение удаления курьера"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    keyboard = [
        [
            InlineKeyboardButton("✅ Да, удалить", callback_data=f"admin_delete_confirm_{courier_id}"),
            InlineKeyboardButton("❌ Нет, отмена", callback_data=f"admin_edit_courier_{courier_id}")
        ]
    ]

    await query.edit_message_text(
        f"⚠️ *ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ*\n\n"
        f"Вы уверены, что хотите удалить курьера #{courier_id}?\n\n"
        f"*Внимание:* Это действие нельзя отменить!",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_delete_courier_execute(update: Update, context: ContextTypes.DEFAULT_TYPE, courier_id):
    """Выполнение удаления курьера"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    try:
        response = requests.delete(f"{API_BASE_URL}/api/admin/couriers/{courier_id}", timeout=5)

        if response.status_code == 200:
            data = response.json()

            if data.get('success'):
                await query.edit_message_text(
                    f"✅ Курьер #{courier_id} успешно удален",
                    parse_mode='Markdown'
                )
                # Возвращаемся к списку курьеров через 2 секунды
                await asyncio.sleep(2)
                await admin_couriers_list(update, context)
            else:
                await query.edit_message_text(
                    f"❌ Ошибка: {data.get('error', 'Не удалось удалить курьера')}",
                    parse_mode='Markdown'
                )
        else:
            await query.edit_message_text(
                f"❌ Ошибка сервера: {response.status_code}",
                parse_mode='Markdown'
            )

    except Exception as e:
        logger.error(f"Ошибка удаления курьера: {e}")
        await query.edit_message_text(
            "❌ Ошибка удаления курьера",
            parse_mode='Markdown'
        )


async def admin_open_chat(update: Update, context: ContextTypes.DEFAULT_TYPE, order_id):
    """Открыть чат с клиентом"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    messages = get_chat_messages(order_id)

    text = f"💬 *ЧАТ ПО ЗАКАЗУ #{order_id}*\n\n"

    if not messages:
        text += "Сообщений пока нет. Напишите первое сообщение!\n\n"
    else:
        for msg in messages[-10:]:
            sender = msg.get('sender_name', 'Неизвестно')
            time = msg.get('time_formatted', '')
            message = msg.get('message', '')

            text += f"*{sender}* ({time}):\n"
            text += f"{message}\n\n"

    keyboard = [
        [
            InlineKeyboardButton("💬 Ответить", callback_data=f"chat_reply_{order_id}"),
            InlineKeyboardButton("📦 Заказ", callback_data=f"admin_order_{order_id}")
        ],
        [
            InlineKeyboardButton("💬 Назад к чатам", callback_data="admin_active_chats"),
            InlineKeyboardButton("🏠 В панель", callback_data="admin_panel")
        ]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_order_detail(update: Update, context: ContextTypes.DEFAULT_TYPE, order_id):
    """Показать детали заказа для админа"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    try:
        response = requests.get(f"{API_BASE_URL}/api/admin/orders/{order_id}", timeout=5)
        if response.status_code == 200:
            order = response.json()
        else:
            order = {}
    except:
        order = {}

    if not order:
        text = f"📦 *ЗАКАЗ #{order_id}*\n\n"
        text += "❌ Заказ не найден"
    else:
        status = order.get('status', 'pending')
        status_text = {
            'pending': '⏳ Ожидает обработки',
            'processing': '🔄 В обработке',
            'delivering': '🚚 Доставляется',
            'delivered': '✅ Доставлен',
            'completed': '🎉 Завершен',
            'cancelled': '❌ Отменен'
        }.get(status, status)

        text = f"📦 *ЗАКАЗ #{order_id}*\n\n"
        text += f"📊 Статус: {status_text}\n"
        text += f"💰 Сумма: {order.get('total_price', 0)} ₽\n"
        text += f"📅 Дата: {order.get('created_at', '')[:10]}\n"
        text += f"👤 Клиент: {order.get('username', 'Гость')}\n"
        text += f"📱 Телефон: {order.get('phone_number', 'Не указан')}\n"

        # Адрес доставки
        if order.get('delivery_address'):
            try:
                addr = json.loads(order['delivery_address'])
                if isinstance(addr, dict):
                    address_parts = []
                    if addr.get('city'):
                        address_parts.append(addr['city'])
                    if addr.get('street'):
                        address_parts.append(f"ул. {addr['street']}")
                    if addr.get('house'):
                        address_parts.append(f"д. {addr['house']}")
                    if addr.get('apartment'):
                        address_parts.append(f"кв. {addr['apartment']}")

                    if address_parts:
                        text += f"📍 Адрес: {', '.join(address_parts)}\n"
            except:
                text += f"📍 Адрес: {order['delivery_address']}\n"

        # Товары
        if order.get('items'):
            try:
                items = json.loads(order['items'])
                text += f"\n📦 *Товары ({len(items)}):*\n"
                for item in items:
                    name = item.get('name', 'Товар')
                    quantity = item.get('quantity', 1)
                    price = item.get('price', 0)

                    if item.get('is_weight') and item.get('weight'):
                        text += f"• {name} ({quantity} шт, {item['weight']} кг) - {price} ₽\n"
                    else:
                        text += f"• {name} × {quantity} шт - {price} ₽\n"
            except:
                pass

    keyboard = [
        [
            InlineKeyboardButton("💬 Ответить в чат", callback_data=f"chat_reply_{order_id}"),
            InlineKeyboardButton("📝 Изменить статус", callback_data=f"admin_update_{order_id}")
        ],
        [
            InlineKeyboardButton("🗑️ Отменить заказ", callback_data=f"admin_cancel_{order_id}"),
            InlineKeyboardButton("🚚 Назначить курьера", callback_data=f"admin_assign_courier_{order_id}")
        ],
        [
            InlineKeyboardButton("◀️ Назад к заказам", callback_data="admin_all_orders"),
            InlineKeyboardButton("🏠 В панель", callback_data="admin_panel")
        ]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_update_order_status(update: Update, context: ContextTypes.DEFAULT_TYPE, order_id):
    """Изменение статуса заказа"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    keyboard = [
        [
            InlineKeyboardButton("⏳ Ожидает", callback_data=f"admin_set_status_{order_id}_pending"),
            InlineKeyboardButton("🔄 Обработка", callback_data=f"admin_set_status_{order_id}_processing")
        ],
        [
            InlineKeyboardButton("🚚 Доставляется", callback_data=f"admin_set_status_{order_id}_delivering"),
            InlineKeyboardButton("✅ Доставлен", callback_data=f"admin_set_status_{order_id}_delivered")
        ],
        [
            InlineKeyboardButton("🎉 Завершен", callback_data=f"admin_set_status_{order_id}_completed"),
            InlineKeyboardButton("❌ Отменен", callback_data=f"admin_set_status_{order_id}_cancelled")
        ],
        [
            InlineKeyboardButton("◀️ Назад", callback_data=f"admin_order_{order_id}")
        ]
    ]

    await query.edit_message_text(
        f"📝 *ИЗМЕНЕНИЕ СТАТУСА ЗАКАЗА #{order_id}*\n\n"
        "Выберите новый статус:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_set_order_status(update: Update, context: ContextTypes.DEFAULT_TYPE, order_id, status):
    """Установить статус заказа"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    status_names = {
        'pending': '⏳ Ожидает обработки',
        'processing': '🔄 В обработке',
        'delivering': '🚚 Доставляется',
        'delivered': '✅ Доставлен',
        'completed': '🎉 Завершен',
        'cancelled': '❌ Отменен'
    }

    try:
        response = requests.put(
            f"{API_BASE_URL}/api/admin/orders/{order_id}/status",
            json={'status': status},
            timeout=5
        )

        if response.status_code == 200:
            await query.edit_message_text(
                f"✅ Статус заказа #{order_id} изменен на: {status_names.get(status, status)}",
                parse_mode='Markdown'
            )
            # Возвращаемся к деталям заказа
            await asyncio.sleep(2)
            await admin_order_detail(update, context, order_id)
        else:
            await query.edit_message_text(
                f"❌ Ошибка изменения статуса",
                parse_mode='Markdown'
            )
    except Exception as e:
        logger.error(f"Ошибка изменения статуса: {e}")
        await query.edit_message_text(
            f"❌ Ошибка изменения статуса: {e}",
            parse_mode='Markdown'
        )


async def admin_cancel_order(update: Update, context: ContextTypes.DEFAULT_TYPE, order_id):
    """Отменить заказ"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    try:
        response = requests.put(
            f"{API_BASE_URL}/api/admin/orders/{order_id}/cancel",
            timeout=5
        )

        if response.status_code == 200:
            await query.edit_message_text(
                f"✅ Заказ #{order_id} отменен",
                parse_mode='Markdown'
            )
            # Возвращаемся к деталям заказа
            await asyncio.sleep(2)
            await admin_order_detail(update, context, order_id)
        else:
            await query.edit_message_text(
                f"❌ Ошибка отмены заказа",
                parse_mode='Markdown'
            )
    except Exception as e:
        logger.error(f"Ошибка отмены заказа: {e}")
        await query.edit_message_text(
            f"❌ Ошибка отмены заказа: {e}",
            parse_mode='Markdown'
        )


async def admin_assign_courier(update: Update, context: ContextTypes.DEFAULT_TYPE, order_id):
    """Назначить курьера на заказ"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    couriers = get_couriers()
    active_couriers = [c for c in couriers if c.get('is_active')]

    if not active_couriers:
        await query.edit_message_text(
            f"❌ Нет активных курьеров для назначения",
            parse_mode='Markdown'
        )
        return

    keyboard = []
    row = []
    for i, courier in enumerate(active_couriers[:6]):
        row.append(InlineKeyboardButton(
            f"👤 {courier['full_name'][:10]}",
            callback_data=f"admin_assign_{order_id}_{courier['id']}"
        ))
        if len(row) == 2 or i == len(active_couriers[:6]) - 1:
            keyboard.append(row)
            row = []

    keyboard.append([
        InlineKeyboardButton("◀️ Назад", callback_data=f"admin_order_{order_id}")
    ])

    await query.edit_message_text(
        f"🚚 *НАЗНАЧЕНИЕ КУРЬЕРА НА ЗАКАЗ #{order_id}*\n\n"
        f"Выберите курьера:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_do_assign_courier(update: Update, context: ContextTypes.DEFAULT_TYPE, order_id, courier_id):
    """Выполнить назначение курьера"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    try:
        response = requests.post(
            f"{API_BASE_URL}/api/assign-courier",
            json={'order_id': order_id},
            timeout=5
        )

        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                await query.edit_message_text(
                    f"✅ Курьер #{data.get('courier_id')} назначен на заказ #{order_id}\n"
                    f"👤 Имя: {data.get('courier_name')}\n"
                    f"📱 Телефон: {data.get('courier_phone')}",
                    parse_mode='Markdown'
                )
                # Возвращаемся к деталям заказа
                await asyncio.sleep(3)
                await admin_order_detail(update, context, order_id)
            else:
                await query.edit_message_text(
                    f"❌ Ошибка: {data.get('error', 'Неизвестная ошибка')}",
                    parse_mode='Markdown'
                )
        else:
            await query.edit_message_text(
                f"❌ Ошибка сервера: {response.status_code}",
                parse_mode='Markdown'
            )
    except Exception as e:
        logger.error(f"Ошибка назначения курьера: {e}")
        await query.edit_message_text(
            f"❌ Ошибка назначения курьера: {e}",
            parse_mode='Markdown'
        )


async def admin_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Статистика магазина"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    try:
        response = requests.get(f"{API_BASE_URL}/api/admin/dashboard", timeout=5)
        if response.status_code == 200:
            stats = response.json()
        else:
            stats = {}
    except:
        stats = {}

    text = "📊 *СТАТИСТИКА МАГАЗИНА*\n\n"
    text += f"📦 Всего заказов: {stats.get('total_orders', 0)}\n"
    text += f"💰 Общая выручка: {stats.get('total_revenue', 0)} ₽\n"
    text += f"⏳ Ожидают обработки: {stats.get('pending_orders', 0)}\n"
    text += f"🛒 Всего товаров: {stats.get('total_products', 0)}\n"
    text += f"👥 Всего клиентов: {stats.get('total_customers', 0)}\n"

    keyboard = [
        [InlineKeyboardButton("🔄 Обновить", callback_data="admin_stats")],
        [InlineKeyboardButton("🏠 В панель", callback_data="admin_panel")]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_couriers_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Статистика курьеров"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    stats = get_courier_stats()

    text = "📊 *СТАТИСТИКА КУРЬЕРОВ*\n\n"
    text += f"👥 Всего курьеров: {stats.get('total_couriers', 0)}\n"
    text += f"✅ Активных: {stats.get('active_couriers', 0)}\n"
    text += f"❌ Неактивных: {stats.get('inactive_couriers', 0)}\n"
    text += f"📦 Всего заказов: {stats.get('total_orders', 0)}\n"
    text += f"💰 Общая выручка: {stats.get('total_revenue', 0)} ₽\n"

    keyboard = [
        [InlineKeyboardButton("🔄 Обновить", callback_data="admin_couriers_stats")],
        [InlineKeyboardButton("🏠 В панель", callback_data="admin_panel")]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def admin_products(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Управление товарами"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    text = "🛒 *УПРАВЛЕНИЕ ТОВАРАМИ*\n\n"
    text += "Управление товарами осуществляется через веб-панель.\n\n"
    text += f"[🌐 Открыть веб-панель]({WEBAPP_URL}/admin)"

    keyboard = [
        [InlineKeyboardButton("🏠 В панель", callback_data="admin_panel")]
    ]

    await query.edit_message_text(
        text,
        parse_mode='Markdown',
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def admin_promocodes(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Управление промокодами"""
    query = update.callback_query
    await query.answer()
    user = query.from_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await query.edit_message_text("❌ У вас нет прав администратора")
        return

    text = "🎫 *УПРАВЛЕНИЕ ПРОМОКОДАМИ*\n\n"
    text += "Управление промокодами осуществляется через веб-панель.\n\n"
    text += f"[🌐 Открыть веб-панель]({WEBAPP_URL}/admin)"

    keyboard = [
        [InlineKeyboardButton("🏠 В панель", callback_data="admin_panel")]
    ]

    await query.edit_message_text(
        text,
        parse_mode='Markdown',
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ========== ПАНЕЛЬ КУРЬЕРА ==========

async def courier_panel_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда для курьеров: /courier"""
    user = update.effective_user

    if update.callback_query:
        query = update.callback_query
        await query.answer()
        message_func = query.edit_message_text
    else:
        message_func = update.message.reply_text

    # Проверяем, является ли пользователь курьером
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/courier/telegram/by-telegram/{user.id}",
            timeout=5
        )

        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                # Пользователь - курьер
                courier_info = data.get('courier_info', {})

                keyboard = [
                    [
                        InlineKeyboardButton("📦 Активные заказы",
                                             callback_data=f"courier_active_{courier_info['courier_id']}"),
                        InlineKeyboardButton("✅ Завершенные",
                                             callback_data=f"courier_completed_{courier_info['courier_id']}")
                    ],
                    [
                        InlineKeyboardButton("👤 Профиль",
                                             callback_data=f"courier_profile_{courier_info['courier_id']}"),
                        InlineKeyboardButton("🚚 Сегодня", callback_data=f"courier_today_{courier_info['courier_id']}")
                    ],
                    [
                        InlineKeyboardButton("🚀 Взять заказ", callback_data="courier_available"),
                        InlineKeyboardButton("❓ Помощь", callback_data="courier_help")
                    ]
                ]

                text = (
                    f"🚚 *ПАНЕЛЬ КУРЬЕРА*\n\n"
                    f"👤 *Имя:* {courier_info.get('full_name', 'Не указано')}\n"
                    f"📱 *Телефон:* {courier_info.get('phone', 'Не указан')}\n\n"
                    f"Выберите действие:"
                )

                if update.callback_query:
                    await query.edit_message_text(
                        text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode='Markdown'
                    )
                else:
                    await update.message.reply_text(
                        text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode='Markdown'
                    )
                return
    except Exception as e:
        logger.error(f"Ошибка проверки курьера: {e}")

    # Если не курьер, предлагаем зарегистрироваться
    keyboard = [[
        InlineKeyboardButton("📝 Регистрация курьера", callback_data="courier_register")
    ]]

    text = (
        "🚚 *ДОБРО ПОЖАЛОВАТЬ В СИСТЕМУ КУРЬЕРОВ*\n\n"
        "Для доступа к панели курьера необходимо зарегистрироваться.\n\n"
        "Если вы уже курьер, обратитесь к администратору."
    )

    if update.callback_query:
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    else:
        await update.message.reply_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )


async def courier_register(user, query):
    """Регистрация курьера через бота"""
    # Проверяем, не зарегистрирован ли уже пользователь
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/courier/telegram/by-telegram/{user.id}",
            timeout=5
        )

        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                # Уже зарегистрирован
                await query.edit_message_text(
                    "✅ *Вы уже зарегистрированы как курьер!*\n\n"
                    f"Используйте /courier для доступа к панели.",
                    parse_mode='Markdown'
                )
                return
    except:
        pass

    # Запрашиваем данные для регистрации
    text = (
        "🚚 *РЕГИСТРАЦИЯ КУРЬЕРА*\n\n"
        "Для регистрации вам потребуется:\n"
        "1. Ваш ID курьера (выдается администратором)\n"
        "2. Логин и пароль от курьерской системы\n\n"
        "Свяжитесь с администратором для получения доступа.\n\n"
        "Администратор: @ваш_админ"
    )

    keyboard = [[
        InlineKeyboardButton("📞 Связаться с админом", url="https://t.me/ваш_админ"),
        InlineKeyboardButton("🏠 Назад", callback_data="start")
    ]]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def show_courier_active_orders(user, query, courier_id):
    """Показать активные заказы курьера"""
    try:
        orders_data = get_courier_orders(courier_id)
        active_orders = orders_data.get('active_orders', [])
        today_orders = orders_data.get('today_orders', [])

        if not active_orders:
            text = "📭 *У вас нет активных заказов*\n\n"
        else:
            text = f"📦 *ВАШИ АКТИВНЫЕ ЗАКАЗЫ ({len(active_orders)})*\n\n"

            for order in active_orders[:5]:
                status = order.get('assignment_status', 'assigned')
                status_text = {
                    'assigned': '👤 Назначен',
                    'picked_up': '📦 Забран со склада',
                    'delivering': '🚚 В пути',
                    'delivered': '✅ Доставлен'
                }.get(status, status)

                text += f"━━━━━━━━━━━━━━━━━━━━\n"
                text += f"📦 *Заказ #{order['id']}*\n"
                text += f"📊 Статус: {status_text}\n"
                text += f"👤 Клиент: {order.get('username', 'Клиент')}\n"
                text += f"💰 Сумма: {order.get('total_price', 0)} ₽\n"

                # Добавляем кнопки для каждого заказа
                keyboard = [[
                    InlineKeyboardButton(f"📦 Управлять", callback_data=f"courier_order_{order['id']}"),
                    InlineKeyboardButton("🔄 Обновить статус", callback_data=f"courier_update_{order['id']}")
                ]]

                # Отправляем отдельное сообщение для каждого заказа
                if order != active_orders[0]:
                    await query.message.reply_text(
                        text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode='Markdown'
                    )
                    text = ""

        # Добавляем статистику
        if today_orders:
            text += f"\n📊 *СЕГОДНЯ ({len(today_orders)}):*\n"
            for order in today_orders[:3]:
                text += f"• Заказ #{order['id']} - {order.get('total_price', 0)} ₽\n"

        # Общие кнопки
        keyboard = [
            [
                InlineKeyboardButton("🔄 Обновить", callback_data=f"courier_active_{courier_id}"),
                InlineKeyboardButton("✅ Завершенные", callback_data=f"courier_completed_{courier_id}")
            ],
            [
                InlineKeyboardButton("🚀 Взять новый", callback_data="courier_available"),
                InlineKeyboardButton("👤 Профиль", callback_data=f"courier_profile_{courier_id}")
            ],
            [
                InlineKeyboardButton("🏠 В начало", callback_data="start")
            ]
        ]

        if active_orders:
            await query.edit_message_text(
                text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
        else:
            await query.edit_message_text(
                text + "\n\nЧтобы взять новый заказ, нажмите '🚀 Взять новый'",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )

    except Exception as e:
        logger.error(f"Ошибка получения заказов курьера: {e}")
        await query.edit_message_text(
            "❌ Ошибка получения ваших заказов",
            parse_mode='Markdown'
        )


async def courier_completed_orders(user, query, courier_id):
    """Показать завершенные заказы курьера"""
    try:
        orders_data = get_courier_orders(courier_id)
        completed_orders = orders_data.get('completed_orders', [])

        if not completed_orders:
            text = "✅ *ЗАВЕРШЕННЫЕ ЗАКАЗЫ*\n\n"
            text += "У вас пока нет завершенных заказов."
        else:
            text = f"✅ *ЗАВЕРШЕННЫЕ ЗАКАЗЫ ({len(completed_orders)})*\n\n"

            for order in completed_orders[:10]:
                text += f"━━━━━━━━━━━━━━━━━━━━\n"
                text += f"📦 Заказ #{order['id']}\n"
                text += f"💰 Сумма: {order.get('total_price', 0)} ₽\n"
                text += f"📅 Дата: {order.get('completed_at', order.get('created_at', ''))[:10]}\n"
                text += f"👤 Клиент: {order.get('username', 'Клиент')}\n"

        keyboard = [
            [InlineKeyboardButton("◀️ Назад", callback_data=f"courier_active_{courier_id}")],
            [InlineKeyboardButton("🔄 Обновить", callback_data=f"courier_completed_{courier_id}")]
        ]

        await query.edit_message_text(
            text,
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )

    except Exception as e:
        logger.error(f"Ошибка получения завершенных заказов: {e}")
        await query.edit_message_text(
            f"✅ *Завершенные заказы курьера*\n\n"
            "Не удалось загрузить завершенные заказы.",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Назад", callback_data=f"courier_active_{courier_id}")]
            ])
        )


async def courier_profile(user, query, courier_id):
    """Показать профиль курьера"""
    try:
        profile = get_courier_profile(courier_id)

        text = f"👤 *ПРОФИЛЬ КУРЬЕРА*\n\n"
        text += f"👤 Имя: {profile.get('full_name', 'Не указано')}\n"
        text += f"📱 Телефон: {profile.get('phone', 'Не указан')}\n"
        text += f"🚗 Транспорт: {profile.get('vehicle_type', 'Не указан')}\n"
        text += f"📊 Статус: {'✅ Активен' if profile.get('is_active') else '❌ Неактивен'}\n\n"

        # Получаем статистику через заказы
        orders_data = get_courier_orders(courier_id)
        completed_orders = orders_data.get('completed_orders', [])
        active_orders = orders_data.get('active_orders', [])
        today_orders = orders_data.get('today_orders', [])

        text += f"📈 *СТАТИСТИКА:*\n"
        text += f"✅ Завершенных заказов: {len(completed_orders)}\n"
        text += f"📦 Активных заказов: {len(active_orders)}\n"
        text += f"🚚 Сегодня: {len(today_orders)} заказов\n"

        total_revenue = sum(order.get('total_price', 0) for order in completed_orders)
        text += f"💰 Общая выручка: {total_revenue} ₽\n"

        keyboard = [
            [InlineKeyboardButton("◀️ Назад", callback_data=f"courier_active_{courier_id}")],
            [InlineKeyboardButton("🔄 Обновить", callback_data=f"courier_profile_{courier_id}")]
        ]

        await query.edit_message_text(
            text,
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )

    except Exception as e:
        logger.error(f"Ошибка получения профиля курьера: {e}")
        await query.edit_message_text(
            f"👤 *Профиль курьера*\n\n"
            "Не удалось загрузить профиль.",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Назад", callback_data=f"courier_active_{courier_id}")]
            ])
        )


async def courier_today(user, query, courier_id):
    """Показать заказы курьера на сегодня"""
    try:
        orders_data = get_courier_orders(courier_id)
        today_orders = orders_data.get('today_orders', [])

        text = f"🚚 *ЗАКАЗЫ НА СЕГОДНЯ*\n\n"
        text += f"📅 Дата: {datetime.now().strftime('%d.%m.%Y')}\n\n"

        if not today_orders:
            text += "На сегодня заказов нет."
        else:
            text += f"📦 Всего заказов: {len(today_orders)}\n"

            total_amount = sum(order.get('total_price', 0) for order in today_orders)
            text += f"💰 Сумма: {total_amount} ₽\n\n"

            for order in today_orders[:5]:
                status = order.get('assignment_status', 'unknown')
                status_text = {
                    'assigned': '⏳',
                    'picked_up': '📦',
                    'delivering': '🚚',
                    'delivered': '✅',
                    'completed': '🎉'
                }.get(status, '📊')

                text += f"{status_text} Заказ #{order['id']} - {order.get('total_price', 0)} ₽\n"

        keyboard = [
            [InlineKeyboardButton("◀️ Назад", callback_data=f"courier_active_{courier_id}")],
            [InlineKeyboardButton("🔄 Обновить", callback_data=f"courier_today_{courier_id}")]
        ]

        await query.edit_message_text(
            text,
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )

    except Exception as e:
        logger.error(f"Ошибка получения заказов на сегодня: {e}")
        await query.edit_message_text(
            f"🚚 *Заказы на сегодня*\n\n"
            "Не удалось загрузить заказы на сегодня.",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Назад", callback_data=f"courier_active_{courier_id}")]
            ])
        )


async def courier_available_orders(user, query):
    """Показать доступные заказы для курьера"""
    try:
        available_orders = get_available_orders()

        if not available_orders:
            text = "🚀 *ДОСТУПНЫЕ ЗАКАЗЫ*\n\n"
            text += "Сейчас нет доступных заказов.\n\n"
            text += "Проверьте позже или обновите список."

            keyboard = [
                [InlineKeyboardButton("🔄 Обновить", callback_data="courier_available")],
                [InlineKeyboardButton("◀️ Назад", callback_data="courier_panel")]
            ]

            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            return

        text = f"🚀 *ДОСТУПНЫЕ ЗАКАЗЫ ({len(available_orders)})*\n\n"

        for order in available_orders[:5]:
            text += f"━━━━━━━━━━━━━━━━━━━━\n"
            text += f"📦 *Заказ #{order['id']}*\n"
            text += f"💰 Сумма: {order.get('total_price', 0)} ₽\n"

            # Форматируем адрес
            address = "Адрес не указан"
            if order.get('delivery_address_obj'):
                addr = order['delivery_address_obj']
                address_parts = []
                if addr.get('city'):
                    address_parts.append(addr['city'])
                if addr.get('street'):
                    address_parts.append(f"ул. {addr['street']}")
                if addr.get('house'):
                    address_parts.append(f"д. {addr['house']}")

                if address_parts:
                    address = ', '.join(address_parts)

            text += f"📍 Адрес: {address[:30]}...\n"
            text += f"📅 Создан: {order.get('created_at', '')[:10]}\n"

            # Кнопка для взятия заказа
            keyboard = [[
                InlineKeyboardButton("✅ Взять заказ", callback_data=f"courier_take_{order['id']}")
            ]]

            await query.message.reply_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            text = ""

        if len(available_orders) > 5:
            text += f"\n📊 Показано 5 из {len(available_orders)} заказов"

        keyboard = [
            [InlineKeyboardButton("🔄 Обновить", callback_data="courier_available")],
            [InlineKeyboardButton("◀️ Назад", callback_data="courier_panel")]
        ]

        if available_orders:
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
        else:
            await query.edit_message_text(
                text,
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )

    except Exception as e:
        logger.error(f"Ошибка получения доступных заказов: {e}")
        await query.edit_message_text(
            f"🚀 *Доступные заказы*\n\n"
            "Ошибка при загрузке доступных заказов.",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Назад", callback_data="courier_panel")]
            ])
        )


async def courier_take_order(user, query, order_id):
    """Курьер берет заказ"""
    try:
        # Получаем информацию о курьере
        response = requests.get(
            f"{API_BASE_URL}/api/courier/telegram/by-telegram/{user.id}",
            timeout=5
        )

        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                courier_info = data.get('courier_info', {})
                courier_id = courier_info['courier_id']

                # Берем заказ
                take_response = requests.post(
                    f"{API_BASE_URL}/api/courier/take-order",
                    json={
                        'order_id': int(order_id),
                        'courier_id': courier_id
                    },
                    timeout=5
                )

                if take_response.status_code == 200:
                    take_data = take_response.json()

                    if take_data.get('success'):
                        await query.edit_message_text(
                            f"✅ *Вы взяли заказ #{order_id}*\n\n"
                            f"Заказ добавлен в ваши активные заказы.\n\n"
                            f"*Далее:*\n"
                            f"1. Получите товары на складе\n"
                            f"2. Подтвердите получение в панели курьера\n"
                            f"3. Доставьте клиенту\n"
                            f"4. Подтвердите доставку с фото",
                            parse_mode='Markdown',
                            reply_markup=InlineKeyboardMarkup([[
                                InlineKeyboardButton("🚀 КУРЬЕР ПАНЕЛЬ", callback_data="courier_panel"),
                                InlineKeyboardButton("📦 Детали заказа", callback_data=f"courier_details_{order_id}")
                            ]])
                        )
                    else:
                        await query.edit_message_text(
                            f"❌ Ошибка: {take_data.get('error', 'Не удалось взять заказ')}",
                            parse_mode='Markdown'
                        )
                else:
                    await query.edit_message_text(
                        "❌ Ошибка сервера при взятии заказа",
                        parse_mode='Markdown'
                    )
            else:
                await query.edit_message_text(
                    "❌ Вы не зарегистрированы как курьер",
                    parse_mode='Markdown'
                )
        else:
            await query.edit_message_text(
                "❌ Ошибка проверки курьера",
                parse_mode='Markdown'
            )

    except Exception as e:
        logger.error(f"Ошибка взятия заказа курьером: {e}")
        await query.edit_message_text(
            "❌ Ошибка взятия заказа",
            parse_mode='Markdown'
        )


async def courier_order_details(user, query, order_id):
    """Показать детали заказа для курьера"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/courier/order/{order_id}", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                order = data.get('order', {})

                text = f"📦 *ДЕТАЛИ ЗАКАЗА #{order_id}*\n\n"
                text += f"👤 *Клиент:* {order.get('username', 'Клиент')}\n"
                text += f"📱 *Телефон:* {order.get('phone_number', 'Не указан')}\n"
                text += f"💰 *Сумма:* {order.get('total_price', 0)} ₽\n"

                # Адрес
                if order.get('delivery_address_obj'):
                    addr = order['delivery_address_obj']
                    address_parts = []
                    if addr.get('city'):
                        address_parts.append(addr['city'])
                    if addr.get('street'):
                        address_parts.append(f"ул. {addr['street']}")
                    if addr.get('house'):
                        address_parts.append(f"д. {addr['house']}")
                    if addr.get('apartment'):
                        address_parts.append(f"кв. {addr['apartment']}")

                    if address_parts:
                        text += f"📍 *Адрес:* {', '.join(address_parts)}\n"

                # Товары
                if order.get('items_list'):
                    text += f"\n📦 *Товары:*\n"
                    for item in order['items_list']:
                        name = item.get('name', 'Товар')
                        quantity = item.get('quantity', 1)

                        if item.get('is_weight') and item.get('weight'):
                            text += f"• {name} ({quantity} шт, {item['weight']} кг)\n"
                        else:
                            text += f"• {name} × {quantity} шт\n"

                # Кнопки управления
                keyboard = [
                    [
                        InlineKeyboardButton("📦 Забрал заказ", callback_data=f"courier_status_{order_id}_picked_up"),
                        InlineKeyboardButton("🚚 В пути", callback_data=f"courier_status_{order_id}_delivering")
                    ],
                    [
                        InlineKeyboardButton("✅ Доставил", callback_data=f"courier_status_{order_id}_delivered"),
                        InlineKeyboardButton("◀️ Назад", callback_data="courier_panel")
                    ]
                ]

                await query.edit_message_text(
                    text,
                    parse_mode='Markdown',
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return

        await query.edit_message_text(
            f"❌ Заказ #{order_id} не найден",
            parse_mode='Markdown'
        )

    except Exception as e:
        logger.error(f"Ошибка получения деталей заказа: {e}")
        await query.edit_message_text(
            f"❌ Ошибка получения деталей заказа",
            parse_mode='Markdown'
        )


async def courier_update_status(user, query, order_id, status):
    """Обновить статус заказа курьером"""
    try:
        # Получаем информацию о курьере
        response = requests.get(
            f"{API_BASE_URL}/api/courier/telegram/by-telegram/{user.id}",
            timeout=5
        )

        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                courier_info = data.get('courier_info', {})
                courier_id = courier_info['courier_id']

                # Обновляем статус
                update_response = requests.post(
                    f"{API_BASE_URL}/api/courier/update-status",
                    json={
                        'order_id': int(order_id),
                        'courier_id': courier_id,
                        'status': status
                    },
                    timeout=5
                )

                if update_response.status_code == 200:
                    update_data = update_response.json()

                    if update_data.get('success'):
                        status_names = {
                            'picked_up': '📦 Забрал заказ',
                            'delivering': '🚚 В пути',
                            'delivered': '✅ Доставил'
                        }

                        await query.edit_message_text(
                            f"✅ *Статус обновлен!*\n\n"
                            f"Заказ #{order_id} теперь: {status_names.get(status, status)}",
                            parse_mode='Markdown',
                            reply_markup=InlineKeyboardMarkup([[
                                InlineKeyboardButton("◀️ Назад", callback_data=f"courier_order_{order_id}")
                            ]])
                        )
                    else:
                        await query.edit_message_text(
                            f"❌ Ошибка: {update_data.get('error', 'Не удалось обновить статус')}",
                            parse_mode='Markdown'
                        )
                else:
                    await query.edit_message_text(
                        "❌ Ошибка сервера при обновлении статуса",
                        parse_mode='Markdown'
                    )
            else:
                await query.edit_message_text(
                    "❌ Вы не зарегистрированы как курьер",
                    parse_mode='Markdown'
                )
        else:
            await query.edit_message_text(
                "❌ Ошибка проверки курьера",
                parse_mode='Markdown'
            )

    except Exception as e:
        logger.error(f"Ошибка обновления статуса: {e}")
        await query.edit_message_text(
            "❌ Ошибка обновления статуса",
            parse_mode='Markdown'
        )


async def courier_help(user, query):
    """Помощь для курьеров"""
    text = "❓ *ПОМОЩЬ ДЛЯ КУРЬЕРОВ*\n\n"
    text += "*Основные функции:*\n"
    text += "📦 Активные заказы - Ваши текущие заказы\n"
    text += "✅ Завершенные - История выполненных заказов\n"
    text += "👤 Профиль - Ваши данные и статистика\n"
    text += "🚚 Сегодня - Заказы на сегодняшний день\n"
    text += "🚀 Взять новый - Доступные для взятия заказы\n\n"
    text += "*Как работать с заказами:*\n"
    text += "1. Возьмите заказ из списка доступных\n"
    text += "2. Получите товары на складе\n"
    text += "3. Подтвердите получение в приложении\n"
    text += "4. Доставьте заказ клиенту\n"
    text += "5. Подтвердите доставку с фото\n\n"
    text += "*Команды:*\n"
    text += "/courier - Панель курьера\n"
    text += "/start - Главное меню"

    keyboard = [[
        InlineKeyboardButton("◀️ Назад", callback_data="courier_panel")
    ]]

    await query.edit_message_text(
        text,
        parse_mode='Markdown',
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ========== ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ==========

async def show_order_details(user, query, order_id):
    """Показать детали заказа"""
    try:
        order = get_order_details(int(order_id), user.id)

        if not order:
            await query.edit_message_text(f"❌ Заказ #{order_id} не найден")
            return

        status = order.get('status', 'pending')
        status_text = {
            'pending': '⏳ Ожидает обработки',
            'processing': '🔄 В обработке',
            'delivering': '🚚 Доставляется',
            'delivered': '✅ Доставлен',
            'completed': '🎉 Завершен',
            'cancelled': '❌ Отменен'
        }.get(status, status)

        text = f"📦 *ЗАКАЗ #{order_id}*\n\n"
        text += f"📊 Статус: {status_text}\n"
        text += f"💰 Сумма: {order.get('total_price', 0)} ₽\n"
        text += f"📅 Дата: {order.get('created_at', '')[:10]}\n"
        text += f"👤 Клиент: {order.get('recipient_name', order.get('username', 'Клиент'))}\n"
        text += f"📱 Телефон: {order.get('phone_number', 'Не указан')}\n"

        # Адрес доставки
        if order.get('delivery_address_obj'):
            addr = order['delivery_address_obj']
            address_parts = []
            if addr.get('city'):
                address_parts.append(addr['city'])
            if addr.get('street'):
                address_parts.append(f"ул. {addr['street']}")
            if addr.get('house'):
                address_parts.append(f"д. {addr['house']}")
            if addr.get('apartment'):
                address_parts.append(f"кв. {addr['apartment']}")

            if address_parts:
                text += f"📍 Адрес: {', '.join(address_parts)}\n"

        # Курьер
        if order.get('courier_name'):
            text += f"\n🚚 Курьер: {order['courier_name']}\n"
            if order.get('courier_phone'):
                text += f"📱 Телефон курьера: {order['courier_phone']}\n"

        # Товары
        if order.get('items_list'):
            text += f"\n📦 *Товары ({len(order['items_list'])}):*\n"
            for item in order['items_list']:
                name = item.get('name', 'Товар')
                quantity = item.get('quantity', 1)
                price = item.get('price', 0)

                if item.get('is_weight') and item.get('weight'):
                    text += f"• {name} ({quantity} шт, {item['weight']} кг) - {price} ₽\n"
                else:
                    text += f"• {name} × {quantity} шт - {price} ₽\n"

        # Кнопки действий
        keyboard = []

        # Для администратора
        if await check_admin(user.id):
            keyboard.append([
                InlineKeyboardButton("💬 Ответить в чат", callback_data=f"chat_reply_{order_id}"),
                InlineKeyboardButton("📝 Изменить статус", callback_data=f"admin_update_{order_id}")
            ])

        # Общие кнопки
        keyboard.append([
            InlineKeyboardButton("🔄 Обновить", callback_data=f"view_order_{order_id}"),
            InlineKeyboardButton("📦 Мои заказы", callback_data="my_orders")
        ])

        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )

    except Exception as e:
        logger.error(f"Ошибка получения деталей заказа: {e}")
        await query.edit_message_text(
            "❌ Ошибка получения информации о заказе",
            parse_mode='Markdown'
        )


async def chat_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /chat_<order_id> для ответа в чате"""
    user = update.effective_user

    # Проверяем права администратора
    if not await check_admin(user.id):
        await update.message.reply_text("❌ У вас нет прав для этой команды")
        return

    # Проверяем формат команды
    if not context.args:
        await update.message.reply_text(
            "📝 *Использование:* /chat_<номер_заказа> <сообщение>\n\n"
            "Пример: /chat_123 Здравствуйте! Ваш заказ готовится.",
            parse_mode='Markdown'
        )
        return

    # Получаем order_id из команды
    command_text = update.message.text
    if '_' in command_text:
        try:
            # Извлекаем order_id из команды вида /chat_123
            parts = command_text.split('_')
            if len(parts) >= 2:
                order_id = parts[1].split()[0]
                message = ' '.join(command_text.split()[1:])

                if not message:
                    # Если сообщение пустое, просим ввести
                    context.user_data['awaiting_chat_reply'] = order_id
                    await update.message.reply_text(
                        f"💬 *Введите сообщение для заказа #{order_id}:*",
                        parse_mode='Markdown'
                    )
                    return

                # Отправляем сообщение через API
                success = await send_chat_message(user.id, order_id, message, is_admin=True)
                if success:
                    await update.message.reply_text(f"✅ Сообщение отправлено в чат заказа #{order_id}")
                else:
                    await update.message.reply_text("❌ Ошибка отправки сообщения")
                return

        except Exception as e:
            logger.error(f"Ошибка обработки команды чата: {e}")

    await update.message.reply_text(
        "❌ Неверный формат команды. Используйте: /chat_123 <сообщение>",
        parse_mode='Markdown'
    )


# ========== ОБРАБОТЧИК КНОПОК ==========

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик кнопок"""
    query = update.callback_query
    await query.answer()

    data = query.data
    user = query.from_user

    logger.info(f"Обработка callback: {data} от пользователя {user.id}")

    # Основные команды пользователя
    if data == "my_orders":
        await my_orders(update, context)
        return

    elif data == "help":
        await query.edit_message_text(
            "❓ *Помощь*\n\n"
            "*Основные команды:*\n"
            "/start - Запустить бота\n"
            "/track <номер> - Отследить заказ\n"
            "/myorders - Мои заказы\n\n"
            "*Кнопки:*\n"
            "🛒 ОТКРЫТЬ МАГАЗИН - Открыть интернет-магазин\n"
            "📦 МОИ ЗАКАЗЫ - Посмотреть ваши заказы\n\n"
            "*Уведомления:*\n"
            "Бот автоматически отправляет уведомления о статусе заказов.",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Назад", callback_data="back_to_start")]
            ])
        )
        return

    elif data == "back_to_start":
        # Возвращаемся к начальному сообщению
        web_app_url = f"{WEBAPP_URL}/webapp?user_id={user.id}&username={user.username or user.first_name}"

        keyboard = [
            [InlineKeyboardButton("🛒 ОТКРЫТЬ МАГАЗИН", web_app=WebAppInfo(url=web_app_url))],
            [InlineKeyboardButton("📦 МОИ ЗАКАЗЫ", callback_data="my_orders")],
            [InlineKeyboardButton("❓ ПОМОЩЬ", callback_data="help")]
        ]

        await query.edit_message_text(
            f"👋 Привет, {user.first_name}!\n\n"
            "🛍️ Добро пожаловать в наш магазин!\n\n"
            "*Как сделать заказ:*\n"
            "1. Нажмите '🛒 ОТКРЫТЬ МАГАЗИН'\n"
            "2. Выберите товары\n"
            "3. Оформите доставку\n"
            "4. Следите за статусом здесь!\n\n"
            "*Вы будете получать уведомления:*\n"
            "✅ Когда заказ принят\n"
            "👤 Когда назначен курьер\n"
            "🚚 Когда курьер едет к вам\n"
            "🎉 Когда заказ доставлен",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        return

    elif data == "open_shop":
        # Кнопка "Открыть магазин" из уведомления о заказе
        web_app_url = f"{WEBAPP_URL}/webapp?user_id={user.id}"

        await query.edit_message_text(
            "🛒 *Откройте магазин для новых покупок:*",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🛒 ОТКРЫТЬ МАГАЗИН", web_app=WebAppInfo(url=web_app_url))],
                [InlineKeyboardButton("📦 МОИ ЗАКАЗЫ", callback_data="my_orders")],
                [InlineKeyboardButton("🏠 В начало", callback_data="back_to_start")]
            ]),
            parse_mode='Markdown'
        )
        return

    elif data.startswith("track_"):
        order_id = data.replace("track_", "")

        try:
            response = requests.get(f"{API_BASE_URL}/api/bot/get-order/{order_id}/{user.id}", timeout=5)
            if response.status_code == 200:
                response_data = response.json()
                if response_data.get('success'):
                    order = response_data.get('order', {})

                    status_text = {
                        'pending': '⏳ Ожидает обработки',
                        'processing': '🔄 В обработке',
                        'delivering': '🚚 Доставляется',
                        'completed': '✅ Завершен',
                        'cancelled': '❌ Отменен'
                    }.get(order.get('status', 'pending'), order.get('status', 'pending'))

                    text = f"📦 *Заказ #{order['id']}*\n\n"
                    text += f"📊 Статус: {status_text}\n"
                    text += f"💰 Сумма: {order.get('total_price', 0)} ₽\n"
                    text += f"📅 Дата: {order.get('created_at', '')[:10]}\n"

                    # Добавляем товары если есть
                    if order.get('items_list'):
                        text += "\n📦 *Товары:*\n"
                        for item in order['items_list']:
                            name = item.get('name', 'Товар')
                            quantity = item.get('quantity', 1)
                            price = item.get('price', 0)

                            if item.get('is_weight') and item.get('weight'):
                                text += f"• {name} ({quantity} шт, {item['weight']} кг) - {price} ₽\n"
                            else:
                                text += f"• {name} × {quantity} шт - {price} ₽\n"

                    if order.get('courier_name'):
                        text += f"\n👤 Курьер: {order['courier_name']}"
                        if order.get('courier_phone'):
                            text += f"\n📱 Телефон: {order['courier_phone']}"

                    # Кнопка "Обновить" обновляет данные о заказе
                    keyboard = [
                        [InlineKeyboardButton("🔄 Обновить", callback_data=f"track_{order_id}")],
                        [InlineKeyboardButton("🛒 Открыть магазин", callback_data="open_shop")],
                        [InlineKeyboardButton("📦 Все заказы", callback_data="my_orders")]
                    ]

                    await query.edit_message_text(
                        text,
                        reply_markup=InlineKeyboardMarkup(keyboard),
                        parse_mode='Markdown'
                    )
                    return

            await query.edit_message_text(
                f"❌ Заказ #{order_id} не найден.",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("📦 Все заказы", callback_data="my_orders")],
                    [InlineKeyboardButton("🏠 В начало", callback_data="back_to_start")]
                ]),
                parse_mode='Markdown'
            )

        except Exception as e:
            logger.error(f"Ошибка получения заказа: {e}")
            await query.edit_message_text(
                "❌ Ошибка получения информации о заказе.",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("📦 Все заказы", callback_data="my_orders")],
                    [InlineKeyboardButton("🏠 В начало", callback_data="back_to_start")]
                ]),
                parse_mode='Markdown'
            )
        return

    # Команды администратора
    elif data == "admin_panel":
        await admin_panel(update, context)
        return

    elif data == "admin_all_orders":
        await admin_all_orders(update, context)
        return

    elif data == "admin_active_chats":
        await admin_active_chats(update, context)
        return

    elif data == "admin_couriers":
        await admin_manage_couriers(update, context)
        return

    elif data == "admin_couriers_list":
        await admin_couriers_list(update, context)
        return

    elif data == "admin_couriers_more":
        await admin_couriers_more(update, context)
        return

    elif data == "admin_add_courier":
        await admin_add_courier(update, context)
        return

    elif data.startswith("admin_edit_courier_"):
        courier_id = data.replace("admin_edit_courier_", "")
        await admin_edit_courier(update, context, courier_id)
        return

    elif data.startswith("admin_delete_courier_"):
        courier_id = data.replace("admin_delete_courier_", "")
        await admin_delete_courier_confirm(update, context, courier_id)
        return

    elif data.startswith("admin_confirm_delete_"):
        courier_id = data.replace("admin_confirm_delete_", "")
        await admin_delete_courier_execute(update, context, courier_id)
        return

    elif data.startswith("admin_open_chat_"):
        order_id = data.replace("admin_open_chat_", "")
        await admin_open_chat(update, context, order_id)
        return

    elif data.startswith("admin_order_"):
        order_id = data.replace("admin_order_", "")
        await admin_order_detail(update, context, order_id)
        return

    elif data.startswith("admin_update_"):
        order_id = data.replace("admin_update_", "")
        await admin_update_order_status(update, context, order_id)
        return

    elif data.startswith("admin_set_status_"):
        parts = data.replace("admin_set_status_", "").split("_")
        if len(parts) == 2:
            order_id, status = parts
            await admin_set_order_status(update, context, order_id, status)
        return

    elif data.startswith("admin_cancel_"):
        order_id = data.replace("admin_cancel_", "")
        await admin_cancel_order(update, context, order_id)
        return

    elif data.startswith("admin_assign_courier_"):
        order_id = data.replace("admin_assign_courier_", "")
        await admin_assign_courier(update, context, order_id)
        return

    elif data.startswith("admin_assign_"):
        parts = data.replace("admin_assign_", "").split("_")
        if len(parts) == 2:
            order_id, courier_id = parts
            await admin_do_assign_courier(update, context, order_id, courier_id)
        return

    elif data == "admin_stats":
        await admin_stats(update, context)
        return

    elif data == "admin_couriers_stats":
        await admin_couriers_stats(update, context)
        return

    elif data == "admin_products":
        await admin_products(update, context)
        return

    elif data == "admin_promocodes":
        await admin_promocodes(update, context)
        return

    # Обработчики для чата
    elif data.startswith("chat_reply_"):
        order_id = data.replace("chat_reply_", "")
        context.user_data['awaiting_chat_reply'] = order_id
        await query.edit_message_text(
            f"💬 *Введите ответ для заказа #{order_id}:*",
            parse_mode='Markdown'
        )
        return

    elif data.startswith("view_order_"):
        order_id = data.replace("view_order_", "")
        await show_order_details(user, query, order_id)
        return

    # Обработчики для курьеров
    elif data == "courier_panel":
        await courier_panel_command(update, context)
        return

    elif data.startswith("courier_active_"):
        courier_id = data.replace("courier_active_", "")
        await show_courier_active_orders(user, query, courier_id)
        return

    elif data.startswith("courier_completed_"):
        courier_id = data.replace("courier_completed_", "")
        await courier_completed_orders(user, query, courier_id)
        return

    elif data.startswith("courier_profile_"):
        courier_id = data.replace("courier_profile_", "")
        await courier_profile(user, query, courier_id)
        return

    elif data.startswith("courier_today_"):
        courier_id = data.replace("courier_today_", "")
        await courier_today(user, query, courier_id)
        return

    elif data == "courier_available":
        await courier_available_orders(user, query)
        return

    elif data.startswith("courier_take_"):
        order_id = data.replace("courier_take_", "")
        await courier_take_order(user, query, order_id)
        return

    elif data.startswith("courier_order_"):
        order_id = data.replace("courier_order_", "")
        await courier_order_details(user, query, order_id)
        return

    elif data.startswith("courier_details_"):
        order_id = data.replace("courier_details_", "")
        await courier_order_details(user, query, order_id)
        return

    elif data.startswith("courier_update_"):
        order_id = data.replace("courier_update_", "")
        await courier_order_details(user, query, order_id)
        return

    elif data.startswith("courier_status_"):
        parts = data.replace("courier_status_", "").split("_")
        if len(parts) == 2:
            order_id, status = parts
            await courier_update_status(user, query, order_id, status)
        return

    elif data == "courier_register":
        await courier_register(user, query)
        return

    elif data == "courier_help":
        await courier_help(user, query)
        return

    # Другие обработчики
    elif data.startswith("admin_courier_tg_"):
        courier_id = data.replace("admin_courier_tg_", "")
        await query.edit_message_text(
            f"📱 *Telegram курьера #{courier_id}*\n\n"
            "Функция управления Telegram аккаунтом курьера доступна в веб-панели.\n\n"
            f"[🌐 Открыть веб-панель]({WEBAPP_URL}/admin)",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Назад", callback_data=f"admin_edit_courier_{courier_id}")]
            ])
        )
        return

    elif data.startswith("admin_update_courier_"):
        courier_id = data.replace("admin_update_courier_", "")
        await query.edit_message_text(
            f"✏️ *Изменение данных курьера #{courier_id}*\n\n"
            "Для изменения данных курьера используйте веб-панель.\n\n"
            f"[🌐 Открыть веб-панель]({WEBAPP_URL}/admin)",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Назад", callback_data=f"admin_edit_courier_{courier_id}")]
            ])
        )
        return

    elif data.startswith("admin_change_pass_"):
        courier_id = data.replace("admin_change_pass_", "")
        await query.edit_message_text(
            f"🔐 *Смена пароля курьера #{courier_id}*\n\n"
            "Для смены пароля используйте веб-панель.\n\n"
            f"[🌐 Открыть веб-панель]({WEBAPP_URL}/admin)",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Назад", callback_data=f"admin_edit_courier_{courier_id}")]
            ])
        )
        return

    elif data.startswith("admin_toggle_courier_"):
        courier_id = data.replace("admin_toggle_courier_", "")
        try:
            # Получаем текущий статус курьера
            response = requests.get(f"{API_BASE_URL}/api/admin/couriers/{courier_id}", timeout=5)
            if response.status_code == 200:
                data_resp = response.json()
                if data_resp.get('success'):
                    courier = data_resp.get('courier', {})
                    current_status = courier.get('is_active', False)

                    # Меняем статус
                    new_status = not current_status
                    update_response = requests.put(
                        f"{API_BASE_URL}/api/admin/couriers/{courier_id}",
                        json={'is_active': new_status},
                        timeout=5
                    )

                    if update_response.status_code == 200:
                        status_text = "✅ активирован" if new_status else "❌ деактивирован"
                        await query.edit_message_text(
                            f"🔄 *Статус курьера #{courier_id} изменен!*\n\n"
                            f"Курьер успешно {status_text}.",
                            parse_mode='Markdown',
                            reply_markup=InlineKeyboardMarkup([
                                [InlineKeyboardButton("◀️ Назад", callback_data=f"admin_edit_courier_{courier_id}")]
                            ])
                        )
                        return
        except Exception as e:
            logger.error(f"Ошибка изменения статуса курьера: {e}")

        await query.edit_message_text(
            f"🔄 *Изменение статуса курьера #{courier_id}*\n\n"
            "Ошибка изменения статуса. Попробуйте позже.",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Назад", callback_data=f"admin_edit_courier_{courier_id}")]
            ])
        )
        return

    elif data == "contact_admin":
        await query.edit_message_text(
            "👨‍💼 *СВЯЗЬ С АДМИНИСТРАТОРОМ*\n\n"
            "Для связи с администратором:\n"
            "📞 Телефон: +7 (XXX) XXX-XX-XX\n"
            "📱 Telegram: @ваш_админ\n"
            "✉️ Email: admin@example.com\n\n"
            "Рабочее время: 9:00 - 18:00",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🏠 В начало", callback_data="back_to_start")]
            ])
        )
        return

    # Если callback не обработан
    await query.edit_message_text(
        "🔄 *Функция в разработке*\n\n"
        "Эта функция еще не реализована.",
        parse_mode='Markdown',
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🏠 В начало", callback_data="back_to_start")]
        ])
    )


# ========== ОБРАБОТЧИК ТЕКСТОВЫХ СООБЩЕНИЙ ==========

async def handle_text_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик текстовых сообщений"""
    user = update.effective_user
    message_text = update.message.text

    # 1. Проверяем, ожидается ли ответ в чате
    if 'awaiting_chat_reply' in context.user_data:
        order_id = context.user_data['awaiting_chat_reply']

        # Проверяем права (только админ может отвечать через чат)
        is_admin = await check_admin(user.id)

        # Отправляем сообщение
        success = await send_chat_message(user.id, order_id, message_text, is_admin=is_admin)

        if success:
            await update.message.reply_text(
                f"✅ Сообщение отправлено в чат заказа #{order_id}"
            )
        else:
            await update.message.reply_text(
                "❌ Ошибка отправки сообщения"
            )

        # Очищаем состояние
        del context.user_data['awaiting_chat_reply']
        return

    # 2. Проверяем, создается ли курьер
    elif 'adding_courier' in context.user_data and context.user_data['adding_courier']:
        if not await check_admin(user.id):
            await update.message.reply_text("❌ У вас нет прав для этой операции")
            del context.user_data['adding_courier']
            return

        courier_data = context.user_data.get('courier_data', {})
        step = context.user_data.get('courier_step', 1)

        if step == 1:
            # Шаг 1: Логин
            courier_data['username'] = message_text
            context.user_data['courier_data'] = courier_data
            context.user_data['courier_step'] = 2
            await update.message.reply_text(
                f"Шаг 2/5\nВведите *пароль* курьера:",
                parse_mode='Markdown'
            )

        elif step == 2:
            # Шаг 2: Пароль
            courier_data['password'] = message_text
            context.user_data['courier_data'] = courier_data
            context.user_data['courier_step'] = 3
            await update.message.reply_text(
                f"Шаг 3/5\nВведите *ФИО* курьера:",
                parse_mode='Markdown'
            )

        elif step == 3:
            # Шаг 3: ФИО
            courier_data['full_name'] = message_text
            context.user_data['courier_data'] = courier_data
            context.user_data['courier_step'] = 4
            await update.message.reply_text(
                f"Шаг 4/5\nВведите *телефон* курьера:",
                parse_mode='Markdown'
            )

        elif step == 4:
            # Шаг 4: Телефон
            courier_data['phone'] = message_text
            context.user_data['courier_data'] = courier_data
            context.user_data['courier_step'] = 5
            await update.message.reply_text(
                f"Шаг 5/5\nВведите *тип транспорта* (авто, мото, вело, пеший):",
                parse_mode='Markdown'
            )

        elif step == 5:
            # Шаг 5: Транспорт
            courier_data['vehicle_type'] = message_text
            context.user_data['courier_data'] = courier_data

            # Создаем курьера через API
            try:
                response = requests.post(
                    f"{API_BASE_URL}/api/admin/couriers",
                    json=courier_data,
                    timeout=5
                )

                if response.status_code == 200:
                    data = response.json()

                    if data.get('success'):
                        courier_id = data.get('id')

                        # Очищаем состояние
                        del context.user_data['adding_courier']
                        del context.user_data['courier_data']
                        del context.user_data['courier_step']

                        await update.message.reply_text(
                            f"✅ Курьер успешно создан!\n\n"
                            f"*Данные курьера:*\n"
                            f"🆔 ID: {courier_id}\n"
                            f"👤 ФИО: {courier_data['full_name']}\n"
                            f"📞 Телефон: {courier_data['phone']}\n"
                            f"🚗 Транспорт: {courier_data['vehicle_type']}\n\n"
                            f"Сообщите курьеру его логин и пароль для входа.",
                            parse_mode='Markdown'
                        )
                    else:
                        await update.message.reply_text(
                            f"❌ Ошибка: {data.get('error', 'Неизвестная ошибка')}"
                        )
                else:
                    await update.message.reply_text(
                        f"❌ Ошибка сервера: {response.status_code}"
                    )

            except Exception as e:
                logger.error(f"Ошибка создания курьера: {e}")
                await update.message.reply_text("❌ Ошибка создания курьера")

        return

    # 3. Обычное текстовое сообщение
    await update.message.reply_text(
        "👋 Для навигации используйте команды:\n\n"
        "/start - Главное меню\n"
        "/admin - Панель администратора\n"
        "/courier - Панель курьера\n"
        "/track <номер> - Отследить заказ\n"
        "/myorders - Мои заказы\n\n"
        "Или используйте кнопки в меню."
    )


async def delete_courier_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда для удаления курьера /delete_courier <id>"""
    user = update.effective_user

    if not await check_admin(user.id):
        await update.message.reply_text("❌ Только администратор может использовать эту команду")
        return

    if not context.args:
        await update.message.reply_text(
            "📝 Использование: /delete_courier <id>\n"
            "Пример: /delete_courier 1"
        )
        return

    courier_id = context.args[0]

    try:
        response = requests.delete(f"{API_BASE_URL}/api/admin/couriers/{courier_id}", timeout=5)

        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                await update.message.reply_text(f"✅ Курьер #{courier_id} удален")
            else:
                await update.message.reply_text(f"❌ Ошибка: {data.get('error', 'Не удалось удалить курьера')}")
        else:
            await update.message.reply_text(f"❌ Ошибка сервера: {response.status_code}")
    except Exception as e:
        await update.message.reply_text(f"❌ Ошибка: {str(e)}")




# ========== ЗАПУСК БОТА ==========

async def main_async():
    """Асинхронная функция запуска бота"""
    if not BOT_TOKEN:
        logger.error("❌ BOT_TOKEN не установлен!")
        return

    # Проверяем API
    try:
        response = requests.get(f"{API_BASE_URL}/api/test", timeout=5)
        if response.status_code == 200:
            logger.info(f"✅ API доступен: {API_BASE_URL}")
        else:
            logger.warning(f"⚠️ API не отвечает: {response.status_code}")
    except Exception as e:
        logger.warning(f"⚠️ Не удалось подключиться к API: {e}")

    # Создаем приложение
    application = Application.builder().token(BOT_TOKEN).build()

    # Добавляем обработчики
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("track", track_order))
    application.add_handler(CommandHandler("admin", admin_panel))
    application.add_handler(CommandHandler("courier", courier_panel_command))
    application.add_handler(CommandHandler("chat", chat_command))
    application.add_handler(CommandHandler("dc", delete_courier_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text_message))
    application.add_handler(CommandHandler("myorders", my_orders))
    application.add_handler(CallbackQueryHandler(button_handler))

    # Запускаем бота
    logger.info("🤖 Бот запускается...")
    print("=" * 50)
    print("✅ Бот успешно запущен!")
    print(f"🌐 Web App URL: {WEBAPP_URL}")
    print(f"🔗 API Base URL: {API_BASE_URL}")
    print("=" * 50)

    await application.initialize()
    await application.start()
    await application.updater.start_polling()

    # Ожидаем остановки
    stop_event = asyncio.Event()
    await stop_event.wait()


def main():
    """Запуск бота с учетом изменений в Python 3.14"""
    # В Python 3.14 нужно явно создавать event loop
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(main_async())
    except KeyboardInterrupt:
        logger.info("🤖 Бот остановлен пользователем")
    except Exception as e:
        logger.error(f"❌ Ошибка запуска бота: {e}")
    finally:
        if loop:
            loop.close()


if __name__ == '__main__':
    main()