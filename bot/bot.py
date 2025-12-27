import os
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes
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
ADMIN_IDS = list(map(int, os.getenv('ADMIN_IDS', '').split(','))) if os.getenv('ADMIN_IDS') else []
WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://ваш-проект.onrender.com')


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start"""
    user = update.effective_user

    # Клавиатура с Web App кнопкой
    keyboard = [
        [InlineKeyboardButton(
            text="🛒 ОТКРЫТЬ МАГАЗИН",
            web_app=WebAppInfo(url=f"{WEBAPP_URL}/webapp")
        )]
    ]

    # Если пользователь админ - добавляем кнопку админки
    if user.id in ADMIN_IDS:
        keyboard.append([
            InlineKeyboardButton(
                text="👨‍💼 ПАНЕЛЬ АДМИНИСТРАТОРА",
                web_app=WebAppInfo(url=f"{WEBAPP_URL}/admin")
            )
        ])

    welcome_text = f"""
    👋 Привет, {user.first_name}!

    🛍️ Добро пожаловать в наш магазин!

    Нажмите кнопку ниже, чтобы открыть каталог товаров 
    и сделать заказ прямо в Telegram.

    💰 У нас лучшие цены!
    🚚 Быстрая доставка!
    ⭐ Гарантия качества!
    """

    await update.message.reply_text(
        welcome_text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='HTML'
    )


async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /admin"""
    user = update.effective_user

    if user.id in ADMIN_IDS:
        keyboard = [[
            InlineKeyboardButton(
                text="📊 УПРАВЛЕНИЕ МАГАЗИНОМ",
                web_app=WebAppInfo(url=f"{WEBAPP_URL}/admin")
            )
        ]]

        await update.message.reply_text(
            "🔐 Панель администратора:\n\n"
            "Здесь вы можете управлять товарами, "
            "просматривать заказы и статистику.",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
    else:
        await update.message.reply_text(
            "⛔ У вас нет прав администратора.\n"
            "Обратитесь к владельцу магазина."
        )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /help"""
    help_text = """
    🤖 *Команды бота:*

    /start - Запустить бота и открыть магазин
    /admin - Панель администратора (только для админов)
    /help - Показать это сообщение

    💡 *Как пользоваться магазином:*
    1. Нажмите /start
    2. Нажмите кнопку "ОТКРЫТЬ МАГАЗИН"
    3. Выбирайте товары и добавляйте в корзину
    4. Оформляйте заказ прямо в Telegram!

    ❓ *Проблемы?*
    Если магазин не открывается, убедитесь что:
    - У вас последняя версия Telegram
    - Бот запущен и работает
    - Интернет соединение стабильное
    """

    await update.message.reply_text(help_text, parse_mode='Markdown')


def main():
    """Запуск бота"""
    if not BOT_TOKEN:
        logger.error("❌ BOT_TOKEN не установлен!")
        logger.info("Установите переменную окружения BOT_TOKEN")
        return

    # Создаем приложение
    application = Application.builder().token(BOT_TOKEN).build()

    # Добавляем обработчики команд
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("admin", admin_command))
    application.add_handler(CommandHandler("help", help_command))

    # Запускаем бота
    logger.info("🤖 Бот запускается...")
    print("=" * 50)
    print("✅ Бот успешно запущен!")
    print(f"🌐 Web App URL: {WEBAPP_URL}")
    print("📱 Отправьте /start в Telegram для теста")
    print("=" * 50)

    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()