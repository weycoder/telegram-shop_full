import os
import logging
from datetime import datetime

import requests
import sys
import asyncio

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.error import BadRequest
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
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
    except:
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
    """Показать заказы пользователя с товарами в блоке"""
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

        for idx, order in enumerate(orders, 1):
            status = order.get('status', 'pending')
            status_text = {
                'pending': '⏳ Ожидает',
                'processing': '🔄 В обработке',
                'delivering': '🚚 Доставляется',
                'completed': '✅ Завершен',
                'cancelled': '❌ Отменен'
            }.get(status, status)

            text += f"━━━━━━━━━━━━━━━━━━━━\n"
            text += f"📦 *ЗАКАЗ #{order['id']}*\n"
            text += f"━━━━━━━━━━━━━━━━━━━━\n"
            text += f"📊 Статус: {status_text}\n"
            text += f"💰 Сумма: {order.get('total_price', 0)} ₽\n"
            text += f"📅 Дата: {order.get('created_at', '')[:10]}\n\n"

            # Получаем товары
            try:
                response = requests.get(f"{API_BASE_URL}/api/bot/get-order/{order['id']}/{user.id}", timeout=3)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('success'):
                        order_details = data.get('order', {})
                        items_list = order_details.get('items_list', [])

                        if items_list:
                            text += "📦 *СОСТАВ ЗАКАЗА:*\n"
                            text += "┌───────────────────────\n"

                            total_items = 0
                            for item in items_list:
                                name = item.get('name', 'Товар')
                                quantity = item.get('quantity', 1)
                                price = item.get('price', 0)
                                total_items += quantity

                                # Форматируем строку
                                item_name = name[:20] + "..." if len(name) > 20 else name

                                if item.get('is_weight') and item.get('weight'):
                                    text += f"│ • {item_name}\n"
                                    text += f"│   {quantity}шт × {item['weight']}кг = {price}₽\n"
                                else:
                                    text += f"│ • {item_name}\n"
                                    text += f"│   {quantity}шт × {price / quantity if quantity > 0 else price}₽ = {price}₽\n"

                            text += "└───────────────────────\n\n"

            except Exception as e:
                print(f"⚠️ Ошибка получения товаров заказа: {e}")
                text += "📦 Товары: _(информация не загружена)_\n\n"

        text += f"_🕒 Обновлено: {datetime.now().strftime('%H:%M:%S')}_"

        keyboard = [
            [InlineKeyboardButton("🛒 ОТКРЫТЬ МАГАЗИН",
                                  web_app=WebAppInfo(url=f"{WEBAPP_URL}/webapp?user_id={user.id}"))],
            [InlineKeyboardButton("🔄 ОБНОВИТЬ", callback_data="my_orders")]
        ]

    if update.callback_query:
        await safe_edit_message(query, text, keyboard)
    else:
        await update.message.reply_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )


async def safe_edit_message(query, text, keyboard, parse_mode='Markdown'):
    """Безопасное редактирование сообщения с обработкой ошибки 'Message is not modified'"""
    try:
        await query.edit_message_text(
            text=text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=parse_mode
        )
        return True
    except BadRequest as e:
        if "Message is not modified" in str(e):
            # Игнорируем эту ошибку - это нормально
            print(f"ℹ️ Сообщение не изменилось (но это не ошибка)")
            return True
        else:
            print(f"⚠️ Ошибка редактирования сообщения: {e}")
            # Пытаемся отправить новое сообщение
            try:
                await query.message.reply_text(
                    text=text,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode=parse_mode
                )
                return True
            except Exception as e2:
                print(f"❌ Не удалось отправить новое сообщение: {e2}")
                return False
    except Exception as e:
        print(f"❌ Неизвестная ошибка при редактировании сообщения: {e}")
        return False


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


async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик кнопок"""
    query = update.callback_query
    await query.answer()

    data = query.data

    if data == "my_orders":
        await my_orders(update, context)

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
            parse_mode='Markdown'
        )

    elif data.startswith("track_"):
        order_id = data.replace("track_", "")
        user = query.from_user

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

                    await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard),
                                                  parse_mode='Markdown')
                    return

            await query.edit_message_text(f"❌ Заказ #{order_id} не найден.", parse_mode='Markdown')

        except Exception as e:
            logger.error(f"Ошибка получения заказа: {e}")
            await query.edit_message_text("❌ Ошибка получения информации о заказе.", parse_mode='Markdown')


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