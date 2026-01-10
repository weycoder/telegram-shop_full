import os
import logging
import sqlite3
import asyncio
import requests
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
API_BASE_URL = WEBAPP_URL.rstrip('/')  # Базовый URL API

# Глобальное приложение бота
bot_app = None


# ========== API КЛИЕНТ ==========

def call_api(endpoint, method='GET', data=None):
    """Вызов API вашего приложения"""
    try:
        url = f"{API_BASE_URL}/api/bot/{endpoint}"

        if method == 'GET':
            response = requests.get(url, timeout=10)
        elif method == 'POST':
            response = requests.post(url, json=data, timeout=10)

        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"❌ API ошибка {response.status_code}: {response.text}")
            return None

    except Exception as e:
        logger.error(f"❌ Ошибка вызова API {endpoint}: {e}")
        return None


def get_user_orders(telegram_id):
    """Получить заказы пользователя через API"""
    result = call_api(f'get-orders/{telegram_id}')
    if result and result.get('success'):
        return result.get('orders', [])
    return []


def get_order_details(order_id, telegram_id):
    """Получить детали заказа через API"""
    result = call_api(f'get-order/{order_id}/{telegram_id}')
    if result and result.get('success'):
        return result.get('order')
    return None


def register_user(telegram_id, username, first_name, last_name):
    """Зарегистрировать пользователя через API"""
    data = {
        'telegram_id': telegram_id,
        'username': username,
        'first_name': first_name,
        'last_name': last_name
    }
    result = call_api('register-user', 'POST', data)
    return result and result.get('success')


# ========== КОМАНДЫ БОТА ==========

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start"""
    user = update.effective_user

    # Регистрируем пользователя через API
    register_user(user.id, user.username, user.first_name, user.last_name)

    # Сохраняем в контексте
    context.user_data['telegram_id'] = user.id

    # URL веб-приложения
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


async def myorders_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Показать все заказы пользователя - использует API"""
    try:
        # Определяем тип обновления
        if update.callback_query:
            query = update.callback_query
            user = query.from_user
            await query.answer()
            is_callback = True
        else:
            user = update.effective_user
            is_callback = False
            query = None

        logger.info(f"📋 Получение заказов для пользователя {user.id}")

        # Получаем заказы через API
        orders = get_user_orders(user.id)

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
                await query.edit_message_text(response, parse_mode='Markdown',
                                              reply_markup=InlineKeyboardMarkup(keyboard))
            else:
                await update.message.reply_text(response, parse_mode='Markdown',
                                                reply_markup=InlineKeyboardMarkup(keyboard))
            return

        # Формируем сообщение
        orders_text = "📋 *Ваши заказы:*\n\n"

        for order in orders:
            orders_text += f"📦 *Заказ #{order['id']}*\n"
            orders_text += f"💵 Сумма: {order.get('total_price', 0)} ₽\n"
            orders_text += f"📊 Статус: {get_order_status_text(order.get('status', 'pending'))}\n"

            if order.get('delivery_status'):
                orders_text += f"📍 Доставка: {get_delivery_status_text(order['delivery_status'])}\n"

            if order.get('address_formatted') and order['address_formatted'] != 'Адрес не указан':
                orders_text += f"📍 Адрес: {order['address_formatted']}\n"

            if order.get('courier_name'):
                orders_text += f"🚚 Курьер: {order['courier_name']}"
                if order.get('courier_phone'):
                    orders_text += f" (📞 {order['courier_phone']})"
                orders_text += "\n"

            orders_text += f"📅 Дата: {order.get('created_at', '')[:10]}\n\n"

        # Клавиатура
        keyboard = [
            [InlineKeyboardButton(
                "🛒 Открыть магазин",
                web_app=WebAppInfo(
                    url=f"{WEBAPP_URL}/webapp?user_id={user.id}&username={user.username or user.first_name}")
            )],
            [InlineKeyboardButton("🔄 Обновить", callback_data="my_orders")]
        ]

        if is_callback:
            await query.edit_message_text(
                orders_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
        else:
            await update.message.reply_text(
                orders_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )

    except Exception as e:
        logger.error(f"❌ Ошибка получения заказов: {e}")
        error_msg = "❌ Произошла ошибка при загрузке заказов. Пожалуйста, попробуйте позже."

        if is_callback:
            await query.edit_message_text(error_msg, parse_mode='Markdown')
        else:
            await update.message.reply_text(error_msg, parse_mode='Markdown')


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


async def show_order_status(update, user_id, order_id):
    """Показать статус конкретного заказа"""
    try:
        # Получаем детали заказа через API
        order = get_order_details(order_id, user_id)

        if not order:
            if isinstance(update, Update):
                await update.message.reply_text(f"❌ Заказ #{order_id} не найден.", parse_mode='Markdown')
            else:
                await update.edit_message_text(f"❌ Заказ #{order_id} не найден.", parse_mode='Markdown')
            return

        # Формируем сообщение
        message = format_order_status_message(order)

        # Создаем клавиатуру
        keyboard = []

        if order.get('courier_phone'):
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
        else:
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


def format_order_status_message(order):
    """Форматировать сообщение о статусе заказа"""
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
        await myorders_command(update, context)

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

    # Запускаем бота
    logger.info("🤖 Бот запускается...")
    print("=" * 50)
    print("✅ Бот успешно запущен!")
    print(f"🌐 Web App URL: {WEBAPP_URL}")
    print(f"🔗 API Base URL: {API_BASE_URL}")
    print("=" * 50)

    bot_app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()