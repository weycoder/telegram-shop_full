import os
import sqlite3
import json
import uuid
import requests
import telebot
import telegram
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
import base64
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__,
            template_folder='webapp/templates',
            static_folder='webapp/static')
CORS(app)

# ========== КОНФИГУРАЦИЯ ==========
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
app.config['DATABASE'] = 'shop.db'
app.config['UPLOAD_FOLDER'] = 'webapp/static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

# ========== КОНФИГУРАЦИЯ ДЛЯ TELEGRAM БОТА ==========
TELEGRAM_BOT_TOKEN = '8201597495:AAHLsTZJHatNU4z8gdjTIom_s_mSHKTnJ50'
TELEGRAM_BOT = telebot.TeleBot(TELEGRAM_BOT_TOKEN) if TELEGRAM_BOT_TOKEN else None

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Создаем папку для загрузок если её нет
UPLOAD_PATH = app.config['UPLOAD_FOLDER']
if not os.path.exists(UPLOAD_PATH):
    os.makedirs(UPLOAD_PATH)
    print(f"📁 Создана папка для загрузок: {UPLOAD_PATH}")


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ========== БАЗА ДАННЫХ ==========
def get_db():
    conn = sqlite3.connect(app.config['DATABASE'])
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with app.app_context():
        db = get_db()
        cursor = db.cursor()

        # УДАЛЯЕМ старые проблемные таблицы если они существуют
        cursor.execute("DROP TABLE IF EXISTS discount_applications")
        cursor.execute("DROP TABLE IF EXISTS product_categories")
        cursor.execute("DROP TABLE IF EXISTS promo_codes")
        cursor.execute("DROP TABLE IF EXISTS discounts")

        # Существующие таблицы (НЕ ТРОГАЕМ)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS couriers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                full_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                vehicle_type TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS order_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                courier_id INTEGER NOT NULL,
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'assigned',
                delivery_started TIMESTAMP,
                delivered_at TIMESTAMP,
                photo_proof TEXT,
                customer_signature TEXT,
                delivery_notes TEXT,
                FOREIGN KEY (order_id) REFERENCES orders (id),
                FOREIGN KEY (courier_id) REFERENCES couriers (id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pending_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id BIGINT NOT NULL,
                order_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                courier_name TEXT,
                courier_phone TEXT,
                sent INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                price REAL NOT NULL,
                image_url TEXT,
                category TEXT,
                category_id INTEGER,
                stock INTEGER DEFAULT 0,
                product_type TEXT DEFAULT 'piece',
                unit TEXT DEFAULT 'шт',
                weight_unit TEXT DEFAULT 'кг',
                price_per_unit DECIMAL(10, 2),
                min_weight DECIMAL(10, 3) DEFAULT 0.1,
                step_weight DECIMAL(10, 3) DEFAULT 0.1,
                stock_weight DECIMAL(10, 3),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # ========== ИСПРАВЛЕННАЯ ТАБЛИЦА ORDERS ==========
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                username TEXT,
                items TEXT NOT NULL,
                total_price REAL NOT NULL,
                delivery_cost REAL DEFAULT 0,
                status TEXT DEFAULT 'pending',
                delivery_type TEXT,
                delivery_address TEXT,
                pickup_point TEXT,
                payment_method TEXT DEFAULT 'cash',
                recipient_name TEXT,
                phone_number TEXT,
                discount_id INTEGER,
                promo_code_id INTEGER,
                discount_amount DECIMAL(10, 2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_addresses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                city TEXT NOT NULL,
                street TEXT NOT NULL,
                house TEXT NOT NULL,
                apartment TEXT,
                floor TEXT,
                doorcode TEXT,
                recipient_name TEXT NOT NULL,
                phone TEXT,
                is_default INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_push_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                device_type TEXT,
                token TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pickup_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                working_hours TEXT,
                phone TEXT,
                latitude REAL,
                longitude REAL,
                is_active INTEGER DEFAULT 1
            )
        ''')

        # ========== НОВЫЕ ТАБЛИЦЫ ДЛЯ УВЕДОМЛЕНИЙ ==========
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS telegram_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id BIGINT UNIQUE NOT NULL,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notification_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                telegram_id BIGINT NOT NULL,
                status TEXT NOT NULL,
                message TEXT,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                success INTEGER DEFAULT 0,
                error_message TEXT
            )
        ''')

        # ========== ИСПРАВЛЕННЫЕ ТАБЛИЦЫ ДЛЯ СКИДОК И ПРОМОКОДОВ ==========

        # 1. Таблица скидок с правильной структурой
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS discounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed', 'free_delivery', 'bogo')),
                value DECIMAL(10, 2),
                min_order_amount DECIMAL(10, 2) DEFAULT 0,
                apply_to TEXT CHECK (apply_to IN ('all', 'category', 'product')),
                target_category TEXT,
                target_product_id INTEGER,
                start_date TIMESTAMP,
                end_date TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                used_count INTEGER DEFAULT 0
            )
        ''')

        # 2. Таблица промокодов с правильной структурой
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS promo_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed', 'free_delivery', 'bogo')),
                value DECIMAL(10, 2),
                usage_limit INTEGER,
                used_count INTEGER DEFAULT 0,
                min_order_amount DECIMAL(10, 2) DEFAULT 0,
                start_date TIMESTAMP,
                end_date TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                one_per_customer BOOLEAN DEFAULT 0,
                exclude_sale_items BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 3. Таблица категорий с древовидной структурой
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS product_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                parent_id INTEGER,
                discount_id INTEGER,
                sort_order INTEGER DEFAULT 0,
                description TEXT,
                icon TEXT,
                color TEXT DEFAULT '#667eea',
                seo_title TEXT,
                seo_description TEXT,
                seo_keywords TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_id) REFERENCES product_categories (id),
                FOREIGN KEY (discount_id) REFERENCES discounts (id)
            )
        ''')

        # Тестовые курьеры
        if cursor.execute("SELECT COUNT(*) FROM couriers").fetchone()[0] == 0:
            cursor.executemany('''
                INSERT INTO couriers (username, password, full_name, phone, vehicle_type)
                VALUES (?, ?, ?, ?, ?)
            ''', [
                ('courier1', '123456', 'Иван Курьеров', '+79991112233', 'car'),
                ('courier2', '123456', 'Петр Доставкин', '+79992223344', 'bike'),
                ('courier3', '123456', 'Сергей Экспрессов', '+79993334455', 'car')
            ])

        # Тестовые товары
        if cursor.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            test_products = [
                ('iPhone 15 Pro', 'Новый Apple смартфон с камерой 48 Мп', 99999,
                 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-7inch?wid=5120&hei=2880&fmt=webp&qlt=70&.v=1693009279096',
                 'Телефоны', 10),
                ('Samsung Galaxy S23', 'Флагман Samsung с камерой 200 Мп', 89999,
                 'https://images.samsung.com/is/image/samsung/p6pim/ru/2302/gallery/ru-galaxy-s23-s911-sm-s911bzadeub-534866168',
                 'Телефоны', 15),
                ('Наушники Sony WH-1000XM5', 'Беспровные с шумоподавлением, 30 часов работы', 34999,
                 'https://sony.scene7.com/is/image/sonyglobalsolutions/WH-1000XM5-B_primary-image', 'Аксессуары', 20),
                ('MacBook Air M2', 'Ультратонкий ноутбук Apple, 13.6 дюймов', 129999,
                 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/macbook-air-midnight-select-20220606',
                 'Ноутбуки', 8),
                ('Клавиатура Logitech', 'Игровая клавиатура с RGB подсветкой', 8999,
                 'https://resource.logitechg.com/w_386,ar_1.0,c_limit,f_auto,q_auto,dpr_2.0/d_transparent.gif/content/dam/gaming/en/products/pro-x/pro-x-keyboard-gallery-1.png',
                 'Аксессуары', 30),
                ('Мышь Razer DeathAdder', 'Игровая мышь, 20000 DPI, 8 кнопок', 6999,
                 'https://assets2.razerzone.com/images/og-image/razer-deathadder-v3-pro-og-1200x630.jpg', 'Аксессуары', 25),
                ('Монитор Samsung 27"', 'Игровой монитор 144 Гц, 4K', 45999,
                 'https://images.samsung.com/is/image/samsung/p6pim/ru/ls27bg402eixci/gallery/ru-odyssey-g4-gaming-ls27bg402eixci-533006960',
                 'Мониторы', 12),
                ('Ноутбук ASUS ROG', 'Игровой ноутбук, RTX 4060, 16 ГБ ОЗУ', 149999,
                 'https://dlcdnwebimgs.asus.com/gain/CFCAFBB1-3CF8-4036-B9F0-79D36C0725E8/w1000/h732', 'Ноутбуки', 7)
            ]
            cursor.executemany(
                'INSERT INTO products (name, description, price, image_url, category, stock) VALUES (?, ?, ?, ?, ?, ?)',
                test_products)

        # Тестовые точки самовывоза
        if cursor.execute("SELECT COUNT(*) FROM pickup_points").fetchone()[0] == 0:
            pickup_points = [
                ('Магазин на Ленина', 'ул. Ленина, 15', '09:00-21:00', '+7 (999) 123-45-67'),
                ('ТЦ Центральный', 'пр. Мира, 42, 2 этаж', '10:00-22:00', '+7 (999) 765-43-21'),
                ('Склад на Заводской', 'ул. Заводская, 7', '08:00-20:00', '+7 (999) 555-55-55')
            ]
            cursor.executemany('INSERT INTO pickup_points (name, address, working_hours, phone) VALUES (?, ?, ?, ?)',
                               pickup_points)

        # Тестовые категории
        if cursor.execute("SELECT COUNT(*) FROM product_categories").fetchone()[0] == 0:
            test_categories = [
                ('Телефоны', None, None, 1, 'Мобильные телефоны и смартфоны', 'fas fa-mobile-alt', '#4CAF50',
                 'Купить телефон недорого', 'Лучшие телефоны по выгодным ценам', 'телефоны, смартфоны, купить телефон'),
                ('Ноутбуки', None, None, 2, 'Ноутбуки и ультрабуки', 'fas fa-laptop', '#2196F3',
                 'Купить ноутбук', 'Широкий выбор ноутбуков', 'ноутбуки, купить ноутбук, ультрабук'),
                ('Аксессуары', None, None, 3, 'Аксессуары для техники', 'fas fa-headphones', '#FF9800',
                 'Аксессуары для гаджетов', 'Чехлы, наушники, зарядные устройства', 'аксессуары, наушники, чехлы'),
                ('Мониторы', None, None, 4, 'Мониторы и дисплеи', 'fas fa-desktop', '#9C27B0',
                 'Мониторы для игр и работы', 'Игровые и профессиональные мониторы', 'мониторы, игровые мониторы, купить монитор')
            ]
            cursor.executemany('''
                INSERT INTO product_categories (name, parent_id, discount_id, sort_order, description, icon, color, seo_title, seo_description, seo_keywords)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', test_categories)

        # Тестовые скидки
        if cursor.execute("SELECT COUNT(*) FROM discounts").fetchone()[0] == 0:
            test_discounts = [
                ('Летняя распродажа', 'percentage', 15.00, 1000.00, 'all', None, None,
                 '2025-06-01 00:00:00', '2025-08-31 23:59:59', 1),
                ('Скидка на телефоны', 'percentage', 10.00, 0.00, 'category', 'Телефоны', None,
                 '2025-01-01 00:00:00', '2025-12-31 23:59:59', 1),
                ('Фиксированная скидка', 'fixed', 5000.00, 20000.00, 'all', None, None,
                 None, None, 1),
                ('Бесплатная доставка', 'free_delivery', 0.00, 1000.00, 'all', None, None,
                 '2025-01-01 00:00:00', '2025-12-31 23:59:59', 1)
            ]
            cursor.executemany('''
                INSERT INTO discounts (name, discount_type, value, min_order_amount, apply_to, target_category, target_product_id, start_date, end_date, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', test_discounts)

        # Тестовые промокоды
        if cursor.execute("SELECT COUNT(*) FROM promo_codes").fetchone()[0] == 0:
            test_promo_codes = [
                ('SUMMER2025', 'percentage', 20.00, 100, 0, 0.00,
                 '2025-06-01 00:00:00', '2025-08-31 23:59:59', 1, 0, 0),
                ('WELCOME10', 'percentage', 10.00, 1000, 0, 0.00,
                 '2025-01-01 00:00:00', '2025-12-31 23:59:59', 1, 1, 0),
                ('FREESHIP', 'free_delivery', 0.00, 500, 0, 0.00,
                 None, None, 1, 0, 0),
                ('SALE5000', 'fixed', 5000.00, 200, 0, 50000.00,
                 '2025-01-01 00:00:00', '2025-12-31 23:59:59', 1, 0, 1)
            ]
            cursor.executemany('''
                INSERT INTO promo_codes (code, discount_type, value, usage_limit, used_count, min_order_amount, start_date, end_date, is_active, one_per_customer, exclude_sale_items)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', test_promo_codes)

        # Обновляем товары, чтобы связать их с категориями
        cursor.execute("UPDATE products SET category_id = 1 WHERE category = 'Телефоны'")
        cursor.execute("UPDATE products SET category_id = 2 WHERE category = 'Ноутбуки'")
        cursor.execute("UPDATE products SET category_id = 3 WHERE category = 'Аксессуары'")
        cursor.execute("UPDATE products SET category_id = 4 WHERE category = 'Мониторы'")

        db.commit()
        db.close()
        print("✅ База данных инициализирована с исправленной структурой")

init_db()


# ========== НОВЫЕ ФУНКЦИИ ДЛЯ УВЕДОМЛЕНИЙ ==========


def send_telegram_notification_sync(telegram_id, order_id, status, courier_name=None, courier_phone=None):
    """Отправка уведомления через HTTP запрос к Telegram API"""
    try:
        BOT_TOKEN = '8201597495:AAHLsTZJHatNU4z8gdjTIom_s_mSHKTnJ50'

        if not telegram_id or telegram_id == 0:
            print(f"⚠️ Неверный telegram_id: {telegram_id}")
            return False

        # Функция для экранирования спецсимволов MarkdownV2
        def escape_markdown(text):
            if not text:
                return ""
            # Список специальных символов для MarkdownV2
            escape_chars = r'_*[]()~`>#+-=|{}.!'
            for char in escape_chars:
                text = text.replace(char, f'\\{char}')
            return text

        # Форматируем сообщение
        status_messages = {
            'created': {
                'title': '✅ Заказ принят!',
                'message': f'Заказ #{order_id} успешно создан и передан на обработку.'
            },
            'assigned': {
                'title': '👤 Курьер назначен!',
                'message': f'Заказ #{order_id} принят курьером и скоро будет доставлен.'
            },
            'picked_up': {
                'title': '📦 Товар у курьера!',
                'message': f'Курьер забрал заказ #{order_id} и уже мчится к вам!'
            },
            'on_the_way': {
                'title': '🚗 Курьер едет к вам!',
                'message': f'Заказ #{order_id} уже в пути\\. Прибудет в ближайшее время!'
            },
            'delivered': {
                'title': '🎉 Заказ доставлен!',
                'message': f'Заказ #{order_id} успешно передан\\. Спасибо за покупку!'
            }
        }

        status_info = status_messages.get(status, {
            'title': f'📦 Статус заказа #{order_id} изменен',
            'message': f'Новый статус: {status}'
        })

        # Экранируем текст
        title_escaped = escape_markdown(status_info['title'])
        message_escaped = escape_markdown(status_info['message'])
        courier_name_escaped = escape_markdown(courier_name) if courier_name else ""
        courier_phone_escaped = escape_markdown(courier_phone) if courier_phone else ""

        # Собираем сообщение с MarkdownV2 форматированием
        message = f"*{title_escaped}*\n\n{message_escaped}\n\n"

        if courier_name_escaped:
            message += f"👤 *Курьер:* {courier_name_escaped}\n"

        if courier_phone_escaped:
            message += f"📱 *Телефон:* `{courier_phone_escaped}`\n"

        # Отправляем HTTP запрос
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': telegram_id,
            'text': message,
            'parse_mode': 'MarkdownV2',
            'disable_web_page_preview': True
        }

        response = requests.post(url, json=data, timeout=10)

        if response.status_code == 200:
            print(f"✅ Telegram уведомление отправлено пользователю {telegram_id}")
            return True
        else:
            print(f"❌ Ошибка Telegram API: {response.status_code}")
            print(f"❌ Ответ: {response.text}")

            # Пробуем отправить без форматирования
            try:
                # Простое сообщение без Markdown
                simple_message = f"Заказ #{order_id}\n\n"
                if status == 'created':
                    simple_message += "✅ Мы успешно приняли ваш заказ!\n"
                elif status == 'assigned':
                    simple_message += "👤 Курьер был назначен!\n"
                elif status == 'picked_up':
                    simple_message += "📦 Товар у курьера!\n"
                elif status == 'on_the_way':
                    simple_message += "🚗 Курьер едет к вам!\n"
                elif status == 'delivered':
                    simple_message += "🎉 Ваш заказ был успешно доставлен!\n"

                if courier_name:
                    simple_message += f"\n👤 Курьер: {courier_name}\n"

                if courier_phone:
                    simple_message += f"📱 Телефон: {courier_phone}\n"

                data_simple = {
                    'chat_id': telegram_id,
                    'text': simple_message,
                    'disable_web_page_preview': True
                }

                response_simple = requests.post(url, json=data_simple, timeout=10)
                if response_simple.status_code == 200:
                    print(f"✅ Простое уведомление отправлено пользователю {telegram_id}")
                    return True
                else:
                    print(f"❌ Ошибка простого сообщения: {response_simple.status_code}")
                    return False

            except Exception as e2:
                print(f"❌ Ошибка отправки простого сообщения: {e2}")
                return False

    except Exception as e:
        print(f"❌ Ошибка отправки Telegram уведомления: {e}")
        return False


def send_order_notification(order_id, status, courier_id=None):
    """Отправка уведомлений покупателю через Telegram бота напрямую"""
    db = None
    try:
        db = get_db()

        # Получаем информацию о заказе
        order = db.execute('SELECT * FROM orders WHERE id = ?', (order_id,)).fetchone()

        if not order:
            print(f"⚠️ Заказ #{order_id} не найден")
            return False

        order_dict = dict(order)

        # user_id должен быть telegram_id
        telegram_id = order_dict.get('user_id')

        if not telegram_id or telegram_id == 0:
            print(f"⚠️ У заказа #{order_id} нет telegram_id (user_id)")
            return False

        # Получаем информацию о курьере если есть
        courier_name = None
        courier_phone = None

        if courier_id:
            courier = db.execute('SELECT full_name, phone FROM couriers WHERE id = ?',
                                 (courier_id,)).fetchone()
            if courier:
                courier = dict(courier)
                courier_name = courier.get('full_name')
                courier_phone = courier.get('phone')

        # Отправляем уведомление через Telegram API
        success = send_telegram_notification_sync(
            telegram_id=telegram_id,
            order_id=order_id,
            status=status,
            courier_name=courier_name,
            courier_phone=courier_phone
        )

        if success:
            print(f"✅ Уведомление для заказа #{order_id} отправлено (статус: {status})")
        else:
            print(f"⚠️ Уведомление для заказа #{order_id} не отправлено")

        return success

    except Exception as e:
        print(f"❌ Критическая ошибка отправки уведомления: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        if db:
            db.close()


def assign_order_to_courier(order_id, delivery_type):
    """Автоматически назначить заказ курьеру"""
    db = get_db()
    try:
        # Получаем случайного активного курьера
        couriers = db.execute(
            'SELECT id, full_name FROM couriers WHERE is_active = 1 ORDER BY RANDOM() LIMIT 1'
        ).fetchall()

        if not couriers:
            print(f"⚠️ Нет активных курьеров для заказа #{order_id}")
            return None

        courier_id = couriers[0]['id']
        courier_name = couriers[0]['full_name']

        # Создаем назначение
        db.execute('''
                   INSERT INTO order_assignments (order_id, courier_id, status)
                   VALUES (?, ?, 'assigned')
                   ''', (order_id, courier_id))

        db.commit()
        print(f"✅ Заказ #{order_id} назначен курьеру #{courier_id} ({courier_name})")

        # Отправляем уведомление о назначении курьера
        send_order_notification(order_id, 'assigned', courier_id)

        return courier_id

    except Exception as e:
        print(f"❌ Ошибка назначения курьера: {e}")
        return None
    finally:
        db.close()


# ========== ГЛАВНЫЕ СТРАНИЦЫ ==========
@app.route('/')
def index():
    return render_template('webapp.html')


@app.route('/webapp')
def webapp_page():
    return render_template('webapp.html')


@app.route('/admin')
def admin_page():
    return render_template('admin.html')


@app.route('/courier')
def courier_panel():
    return render_template('courier.html')


# ========== API ДЛЯ МАГАЗИНА ==========
@app.route('/api/products')
def api_products():
    db = get_db()
    try:
        category = request.args.get('category', 'all')
        if category and category != 'all':
            products = db.execute('SELECT * FROM products WHERE stock > 0 AND category = ? ORDER BY created_at DESC',
                                  (category,)).fetchall()
        else:
            products = db.execute('SELECT * FROM products WHERE stock > 0 ORDER BY created_at DESC').fetchall()
        return jsonify([dict(product) for product in products])
    except Exception as e:
        print(f"❌ Ошибка получения товаров: {e}")
        return jsonify([])
    finally:
        db.close()


@app.route('/api/products/<int:product_id>')
def api_product_detail(product_id):
    """Получить детали товара по ID"""
    db = get_db()
    try:
        product = db.execute('SELECT * FROM products WHERE id = ?', (product_id,)).fetchone()
        if product:
            return jsonify(dict(product))
        return jsonify({'error': 'Товар не найден'}), 404
    except Exception as e:
        print(f"❌ Ошибка получения товара {product_id}: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/categories')
def api_categories():
    db = get_db()
    try:
        categories = db.execute(
            'SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != "" ORDER BY category').fetchall()
        return jsonify([row['category'] for row in categories])
    except Exception as e:
        return jsonify([])
    finally:
        db.close()

@app.route('/api/categories/tree', methods=['GET'])
def get_categories_tree():
    """Получить дерево категорий"""
    db = get_db()
    try:
        categories = db.execute('''
            SELECT pc.*,
                   d.name as discount_name
            FROM product_categories pc
            LEFT JOIN discounts d ON pc.discount_id = d.id
            ORDER BY pc.sort_order, pc.name
        ''').fetchall()

        # Строим дерево
        categories_dict = {}
        root_categories = []

        for cat in categories:
            cat_dict = dict(cat)
            cat_dict['children'] = []
            # Получаем количество товаров в категории
            product_count = db.execute(
                'SELECT COUNT(*) FROM products WHERE category = ? OR category_id = ?',
                (cat_dict['name'], cat_dict['id'])
            ).fetchone()[0]
            cat_dict['product_count'] = product_count
            cat_dict['has_products'] = product_count > 0
            categories_dict[cat_dict['id']] = cat_dict

        for cat_id, cat in categories_dict.items():
            if cat['parent_id']:
                if cat['parent_id'] in categories_dict:
                    categories_dict[cat['parent_id']]['children'].append(cat)
            else:
                root_categories.append(cat)

        db.close()
        return jsonify(root_categories)
    except Exception as e:
        db.close()
        print(f"❌ Ошибка получения дерева категорий: {e}")
        return jsonify([])

@app.route('/api/create-order', methods=['POST'])
def api_create_order():
    data = request.json

    print("=" * 50)
    print("📦 ПОЛУЧЕН ЗАПРОС НА СОЗДАНИЕ ЗАКАЗА")
    print("=" * 50)
    print(f"📋 user_id: {data.get('user_id', 'НЕТ!')}")
    print(f"👤 username: {data.get('username', 'НЕТ!')}")
    print(f"📦 items: {len(data.get('items', []))} товаров")
    print(f"💰 total: {data.get('total', 0)} руб.")
    print(f"🚚 delivery_type: {data.get('delivery_type')}")
    print("=" * 50)

    db = get_db()
    try:
        delivery_type = data.get('delivery_type')
        payment_method = data.get('payment_method', 'cash')
        delivery_address = data.get('delivery_address', '{}')

        # ========== РАСЧЕТ СТОИМОСТИ ДОСТАВКИ ==========
        order_total = float(data.get('total', 0))
        delivery_cost = 0.0

        if delivery_type == 'courier':
            if order_total < 1000:
                delivery_cost = 100.0  # Доставка 100 руб для заказов до 1000 руб
                print(f"💰 Доставка платная: +{delivery_cost} руб (сумма заказа: {order_total} руб)")
            else:
                print(f"✅ Доставка бесплатная (сумма заказа: {order_total} руб)")

        # Общая сумма заказа с учетом доставки
        total_with_delivery = order_total + delivery_cost
        print(
            f"📊 Итоговая сумма: {total_with_delivery} руб (товары: {order_total} руб + доставка: {delivery_cost} руб)")
        # ========== КОНЕЦ РАСЧЕТА ==========

        # ИСПРАВЛЕННАЯ ОБРАБОТКА АДРЕСА (оставляем как было)
        address_obj = {}
        if isinstance(delivery_address, str):
            try:
                if delivery_address and delivery_address != '{}':
                    address_obj = json.loads(delivery_address)
            except:
                print("⚠️ Не удалось распарсить delivery_address")
                address_obj = {}
        elif isinstance(delivery_address, dict):
            address_obj = delivery_address

        recipient_name = ""
        phone_number = ""

        if isinstance(address_obj, dict):
            recipient_name = address_obj.get('recipient_name', '')
            phone_number = address_obj.get('phone', '') or address_obj.get('phone_number', '')

        if not recipient_name:
            recipient_name = data.get('recipient_name', '')
        if not phone_number:
            phone_number = data.get('phone_number', '')

        if not recipient_name:
            recipient_name = data.get('username', 'Гость')
        if not phone_number:
            phone_number = 'Не указан'

        user_id = data.get('user_id', 0)
        username = data.get('username', 'Гость')

        if user_id == 0:
            print("⚠️ ВНИМАНИЕ: user_id = 0! Пробуем альтернативные методы...")
            telegram_data = request.headers.get('X-Telegram-Init-Data')
            if telegram_data:
                try:
                    import urllib.parse
                    parsed = urllib.parse.parse_qs(telegram_data)
                    if 'user' in parsed:
                        user_json = json.loads(parsed['user'][0])
                        user_id = user_json.get('id', 0)
                        username = user_json.get('username', username)
                        print(f"✅ Найден telegram_id из Web App: {user_id}")
                except Exception as e:
                    print(f"⚠️ Не удалось распарсить Telegram данные: {e}")

            if user_id == 0 and username != 'Гость':
                user_record = db.execute('SELECT telegram_id FROM telegram_users WHERE username = ?',
                                         (username,)).fetchone()
                if user_record:
                    user_id = user_record['telegram_id']
                    print(f"✅ Найден user_id по username: {user_id}")

            if user_id == 0:
                import random
                user_id = random.randint(100000000, 999999999)
                print(f"⚠️ Сгенерирован временный user_id: {user_id}")

        print(f"👤 Используемый user_id: {user_id}")
        print(f"👤 Используемый username: {username}")

        # Сохраняем стоимость доставки в заказе
        cursor = db.execute('''
                            INSERT INTO orders (user_id, username, items, total_price, delivery_cost, status,
                                                delivery_type,
                                                delivery_address, pickup_point, payment_method, recipient_name,
                                                phone_number)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                user_id,
                                username,
                                json.dumps(data['items'], ensure_ascii=False),
                                order_total,  # Стоимость товаров
                                delivery_cost,  # Стоимость доставки
                                'pending',
                                delivery_type,
                                json.dumps(address_obj if address_obj else {}, ensure_ascii=False),
                                data.get('pickup_point'),
                                payment_method,
                                recipient_name,
                                phone_number
                            ))

        for item in data['items']:
            db.execute('UPDATE products SET stock = stock - ? WHERE id = ?', (item['quantity'], item['id']))

        db.commit()
        order_id = cursor.lastrowid

        # ========== ИЗМЕНЕНИЕ: НЕ НАЗНАЧАЕМ КУРЬЕРА АВТОМАТИЧЕСКИ ==========
        if delivery_type == 'courier':
            # Только создаем заказ, но не назначаем курьера
            print(f"📋 Создан заказ #{order_id} для доставки курьером (ожидает назначения)")

            # Отправляем уведомление об успешном создании заказа
            send_order_notification(order_id, 'created')
        else:
            send_order_notification(order_id, 'created')
            print(f"✅ Уведомление о создании заказа #{order_id} отправлено")

        db.close()

        print(f"✅ Создан заказ #{order_id} для user_id={user_id}")
        print("=" * 50)
        return jsonify({'success': True, 'order_id': order_id, 'delivery_cost': delivery_cost,
                        'total_with_delivery': total_with_delivery})

    except Exception as e:
        db.close()
        print(f"❌ Ошибка создания заказа: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/courier/available-orders', methods=['GET'])
def get_available_orders():
    """Получить список заказов, доступных для взятия курьером"""
    try:
        db = get_db()

        # Заказы с доставкой курьером, которые еще не назначены
        available_orders = db.execute('''
                                      SELECT o.id,
                                             o.username,
                                             o.items,
                                             o.total_price,
                                             o.delivery_cost,
                                             o.delivery_type,
                                             o.delivery_address,
                                             o.recipient_name,
                                             o.phone_number,
                                             o.created_at,
                                             (o.total_price + COALESCE(o.delivery_cost, 0)) as total_with_delivery
                                      FROM orders o
                                               LEFT JOIN order_assignments a ON o.id = a.order_id
                                      WHERE o.delivery_type = 'courier'
                                        AND o.status = 'pending'
                                        AND a.id IS NULL                       -- Не назначен
                                        AND DATE (o.created_at) = DATE ('now') -- Сегодняшние заказы
                                      ORDER BY o.created_at DESC
                                      ''').fetchall()

        processed_orders = []
        for order in available_orders:
            order_dict = dict(order)

            # Парсим JSON поля
            try:
                order_dict['items_list'] = json.loads(order_dict['items'])
            except:
                order_dict['items_list'] = []

            # Парсим адрес доставки
            if order_dict.get('delivery_address'):
                try:
                    order_dict['delivery_address_obj'] = json.loads(order_dict['delivery_address'])
                except:
                    order_dict['delivery_address_obj'] = {}
            else:
                order_dict['delivery_address_obj'] = {}

            processed_orders.append(order_dict)

        db.close()
        return jsonify({'success': True, 'available_orders': processed_orders})

    except Exception as e:
        print(f"❌ Ошибка получения доступных заказов: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/courier/take-order', methods=['POST'])
def courier_take_order():
    """Курьер берет заказ в доставку"""
    try:
        data = request.json
        order_id = data.get('order_id')
        courier_id = data.get('courier_id')

        if not order_id or not courier_id:
            return jsonify({'success': False, 'error': 'Не указан ID заказа или курьера'}), 400

        db = get_db()

        # Проверяем, не взят ли уже заказ
        existing = db.execute('SELECT id FROM order_assignments WHERE order_id = ?', (order_id,)).fetchone()
        if existing:
            db.close()
            return jsonify({'success': False, 'error': 'Заказ уже взят другим курьером'}), 400

        # Назначаем заказ курьеру
        db.execute('''
                   INSERT INTO order_assignments (order_id, courier_id, status, assigned_at)
                   VALUES (?, ?, 'assigned', CURRENT_TIMESTAMP)
                   ''', (order_id, courier_id))

        # Обновляем статус заказа
        db.execute('UPDATE orders SET status = ? WHERE id = ?', ('processing', order_id))

        db.commit()
        db.close()

        print(f"✅ Заказ #{order_id} взят курьером #{courier_id}")

        # Отправляем уведомление покупателю
        send_order_notification(order_id, 'assigned', courier_id)

        return jsonify({'success': True, 'message': 'Заказ успешно взят в доставку'})

    except Exception as e:
        print(f"❌ Ошибка взятия заказа: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== API ДЛЯ КУРЬЕРОВ ==========
@app.route('/api/courier/login', methods=['POST'])
def courier_login():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'success': False, 'error': 'Введите логин и пароль'}), 400

        db = get_db()
        courier = db.execute('SELECT * FROM couriers WHERE username = ? AND is_active = 1', (username,)).fetchone()
        db.close()

        if not courier:
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        if courier['password'] != password:
            return jsonify({'success': False, 'error': 'Неверный пароль'}), 401

        courier_data = dict(courier)
        courier_data.pop('password', None)

        token = f"courier_{courier['id']}_{datetime.now().timestamp()}"

        return jsonify({
            'success': True,
            'courier': courier_data,
            'token': token
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/courier/orders', methods=['GET'])
def get_courier_orders():
    """Получить заказы курьера"""
    try:
        courier_id = request.args.get('courier_id', type=int)
        if not courier_id:
            return jsonify({'success': False, 'error': 'Не указан ID курьера'}), 400

        db = get_db()

        # Активные заказы - ДОБАВИМ ВСЕ НЕОБХОДИМЫЕ ПОЛЯ
        active_orders = db.execute('''
                                   SELECT o.id,
                                          o.user_id,
                                          o.username,
                                          o.items,
                                          o.total_price,
                                          o.status as order_status,
                                          o.delivery_type,
                                          o.delivery_address,
                                          o.pickup_point,
                                          o.payment_method,
                                          o.recipient_name,
                                          o.phone_number,
                                          o.created_at,
                                          a.status as assignment_status,
                                          a.assigned_at,
                                          a.delivery_started,
                                          a.delivered_at,
                                          a.photo_proof,
                                          a.delivery_notes
                                   FROM orders o
                                            JOIN order_assignments a ON o.id = a.order_id
                                   WHERE a.courier_id = ?
                                     AND a.status IN ('assigned', 'picked_up')
                                     AND o.status NOT IN ('delivered', 'cancelled')
                                   ORDER BY a.assigned_at DESC
                                   ''', (courier_id,)).fetchall()

        # Завершенные заказы
        completed_orders = db.execute('''
                                      SELECT o.id,
                                             o.user_id,
                                             o.username,
                                             o.items,
                                             o.total_price,
                                             o.status as order_status,
                                             o.delivery_type,
                                             o.delivery_address,
                                             o.pickup_point,
                                             o.payment_method,
                                             o.recipient_name,
                                             o.phone_number,
                                             o.created_at,
                                             a.status as assignment_status,
                                             a.assigned_at,
                                             a.delivered_at,
                                             a.photo_proof,
                                             a.delivery_notes
                                      FROM orders o
                                               JOIN order_assignments a ON o.id = a.order_id
                                      WHERE a.courier_id = ?
                                        AND a.status = 'delivered'
                                      ORDER BY a.delivered_at DESC LIMIT 50
                                      ''', (courier_id,)).fetchall()

        # Заказы на сегодня
        today_orders = db.execute('''
                                  SELECT o.id,
                                         o.user_id,
                                         o.username,
                                         o.items,
                                         o.total_price,
                                         o.status as order_status,
                                         o.delivery_type,
                                         o.delivery_address,
                                         o.pickup_point,
                                         o.payment_method,
                                         o.recipient_name,
                                         o.phone_number,
                                         o.created_at,
                                         a.status as assignment_status
                                  FROM orders o
                                           JOIN order_assignments a ON o.id = a.order_id
                                  WHERE a.courier_id = ?
                                    AND DATE (a.assigned_at) = DATE ('now')
                                  ORDER BY o.created_at DESC
                                  ''', (courier_id,)).fetchall()

        db.close()

        # Функция для преобразования заказов
        def process_orders(orders):
            processed = []
            for order in orders:
                order_dict = dict(order)
                # Парсим JSON поля
                try:
                    order_dict['items_list'] = json.loads(order_dict['items'])
                except:
                    order_dict['items_list'] = []

                # Парсим адрес доставки
                if order_dict.get('delivery_address'):
                    try:
                        order_dict['delivery_address_obj'] = json.loads(order_dict['delivery_address'])
                    except:
                        order_dict['delivery_address_obj'] = {}
                else:
                    order_dict['delivery_address_obj'] = {}

                processed.append(order_dict)
            return processed

        return jsonify({
            'success': True,
            'active_orders': process_orders(active_orders),
            'completed_orders': process_orders(completed_orders),
            'today_orders': process_orders(today_orders)
        })

    except Exception as e:
        print(f"❌ Ошибка получения заказов курьера: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/courier/update-status', methods=['POST'])
def update_delivery_status():
    """Обновить статус доставки"""
    db = None
    try:
        data = request.json
        order_id = data.get('order_id')
        courier_id = data.get('courier_id')
        status = data.get('status')
        photo_data = data.get('photo_data')
        notes = data.get('notes', '')

        db = get_db()

        # Проверяем назначение
        assignment = db.execute('SELECT * FROM order_assignments WHERE order_id = ? AND courier_id = ?',
                                (order_id, courier_id)).fetchone()

        if not assignment:
            return jsonify({'success': False, 'error': 'Назначение не найдено'}), 404

        # Сохраняем фото, если есть
        photo_url = None
        if photo_data and status == 'delivered':
            try:
                if ',' in photo_data:
                    photo_data = photo_data.split(',')[1]

                image_data = base64.b64decode(photo_data)
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                filename = f"delivery_{order_id}_{timestamp}.jpg"
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

                with open(filepath, 'wb') as f:
                    f.write(image_data)

                photo_url = f"/static/uploads/{filename}"
                print(f"✅ Фото доставки сохранено: {filename}")
            except Exception as e:
                print(f"⚠️ Ошибка сохранения фото: {e}")

        # Обновляем статус
        if status == 'picked_up':
            db.execute(
                'UPDATE order_assignments SET status = ?, delivery_started = CURRENT_TIMESTAMP WHERE order_id = ? AND courier_id = ?',
                (status, order_id, courier_id))
        elif status == 'delivered':
            db.execute(
                'UPDATE order_assignments SET status = ?, delivered_at = CURRENT_TIMESTAMP, photo_proof = ?, delivery_notes = ? WHERE order_id = ? AND courier_id = ?',
                (status, photo_url, notes, order_id, courier_id))
            db.execute('UPDATE orders SET status = "delivered" WHERE id = ?', (order_id,))
        else:
            db.execute('UPDATE order_assignments SET status = ? WHERE order_id = ? AND courier_id = ?',
                       (status, order_id, courier_id))

        db.commit()

        # Получаем информацию о курьере ДО закрытия базы
        courier = db.execute('SELECT full_name, phone FROM couriers WHERE id = ?', (courier_id,)).fetchone()
        courier_name = courier['full_name'] if courier else None
        courier_phone = courier['phone'] if courier else None

        # ЗАКРЫВАЕМ базу данных ПЕРЕД отправкой уведомления
        if db:
            db.close()

        # Отправляем уведомление в бот
        send_order_notification(order_id, status, courier_id)

        return jsonify({'success': True, 'photo_url': photo_url})

    except Exception as e:
        print(f"❌ Ошибка обновления статуса: {e}")
        if db:
            db.close()
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== НОВЫЕ API ДЛЯ АДМИНКИ - ДЕТАЛИЗАЦИЯ ЗАКАЗОВ ==========

# ========== НОВЫЕ API ДЛЯ АДМИНКИ - ДЕТАЛИЗАЦИЯ ЗАКАЗОВ ==========

@app.route('/api/admin/orders/<int:order_id>', methods=['GET'])
def admin_get_order_details(order_id):
    """Получить детали заказа для админки"""
    db = get_db()
    try:
        order = db.execute('SELECT * FROM orders WHERE id = ?', (order_id,)).fetchone()
        if not order:
            db.close()
            return jsonify({'error': 'Заказ не найден'}), 404

        order_dict = dict(order)

        # Парсим JSON поля
        if order_dict.get('items'):
            try:
                order_dict['items'] = json.loads(order_dict['items'])
            except:
                order_dict['items'] = []

        if order_dict.get('delivery_address'):
            try:
                order_dict['delivery_address'] = json.loads(order_dict['delivery_address'])
            except:
                order_dict['delivery_address'] = {}

        # Добавляем поле updated_at для совместимости
        if 'updated_at' not in order_dict:
            order_dict['updated_at'] = order_dict['created_at']

        db.close()
        return jsonify(order_dict)

    except Exception as e:
        if db:
            db.close()
        print(f"❌ Ошибка получения деталей заказа #{order_id}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/orders/<int:order_id>/status', methods=['PUT'])
def admin_update_order_status(order_id):
    """Изменить статус заказа в админке - БЕЗ УВЕДОМЛЕНИЙ"""
    db = get_db()
    try:
        data = request.get_json()
        new_status = data.get('status')

        if new_status not in ['pending', 'processing', 'delivering', 'completed', 'cancelled']:
            db.close()
            return jsonify({'error': 'Некорректный статус'}), 400

        # Обновляем статус заказа (только обновляем, без уведомлений)
        db.execute('UPDATE orders SET status = ? WHERE id = ?',
                   (new_status, order_id))
        db.commit()
        db.close()

        print(f"✅ Статус заказа #{order_id} изменен на '{new_status}' (без уведомления клиенту)")

        return jsonify({'success': True, 'status': new_status})

    except Exception as e:
        if db:
            db.close()
        print(f"❌ Ошибка обновления статуса заказа #{order_id}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/orders/<int:order_id>/cancel', methods=['PUT'])
def admin_cancel_order(order_id):
    """Отменить заказ в админке - БЕЗ УВЕДОМЛЕНИЙ"""
    db = get_db()
    try:
        # Получаем текущий статус
        order = db.execute('SELECT status FROM orders WHERE id = ?', (order_id,)).fetchone()
        if not order:
            db.close()
            return jsonify({'error': 'Заказ не найден'}), 404

        if order['status'] == 'completed':
            db.close()
            return jsonify({'error': 'Нельзя отменить завершенный заказ'}), 400

        # Обновляем статус (только отменяем, без уведомлений)
        db.execute('UPDATE orders SET status = "cancelled" WHERE id = ?',
                   (order_id,))
        db.commit()
        db.close()

        print(f"✅ Заказ #{order_id} отменен (без уведомления клиенту)")

        return jsonify({'success': True})

    except Exception as e:
        if db:
            db.close()
        print(f"❌ Ошибка отмены заказа #{order_id}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/courier/order/<int:order_id>', methods=['GET'])
def get_order_details(order_id):
    """Получить детали заказа для курьера"""
    try:
        db = get_db()
        order = db.execute('''
                           SELECT o.*,
                                  a.status    as assignment_status,
                                  a.assigned_at,
                                  a.delivery_started,
                                  a.delivered_at,
                                  a.photo_proof,
                                  a.delivery_notes,
                                  c.full_name as courier_name,
                                  c.phone     as courier_phone
                           FROM orders o
                                    LEFT JOIN order_assignments a ON o.id = a.order_id
                                    LEFT JOIN couriers c ON a.courier_id = c.id
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

        if not order:
            db.close()
            return jsonify({'success': False, 'error': 'Заказ не найден'}), 404

        order_dict = dict(order)

        # Парсим JSON поля
        try:
            order_dict['items_list'] = json.loads(order_dict['items'])
        except:
            order_dict['items_list'] = []

        if order_dict.get('delivery_address'):
            try:
                order_dict['delivery_address_obj'] = json.loads(order_dict['delivery_address'])
            except:
                order_dict['delivery_address_obj'] = {}
        else:
            order_dict['delivery_address_obj'] = {}

        db.close()
        return jsonify({'success': True, 'order': order_dict})

    except Exception as e:
        print(f"❌ Ошибка получения деталей заказа: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/courier/profile', methods=['GET', 'PUT'])
def courier_profile():
    db = get_db()
    try:
        if request.method == 'GET':
            courier_id = request.args.get('courier_id', type=int)
            if not courier_id:
                return jsonify({'success': False, 'error': 'Не указан ID курьера'}), 400

            courier = db.execute(
                'SELECT id, username, full_name, phone, vehicle_type, is_active, created_at FROM couriers WHERE id = ?',
                (courier_id,)).fetchone()

            if not courier:
                return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

            return jsonify({'success': True, 'profile': dict(courier)})

        elif request.method == 'PUT':
            data = request.json
            courier_id = data.get('courier_id')

            if not courier_id:
                return jsonify({'success': False, 'error': 'Не указан ID курьера'}), 400

            db.execute('UPDATE couriers SET full_name = ?, phone = ?, vehicle_type = ? WHERE id = ?',
                       (data.get('full_name', ''), data.get('phone', ''), data.get('vehicle_type', ''), courier_id))
            db.commit()

            updated = db.execute(
                'SELECT id, username, full_name, phone, vehicle_type, is_active, created_at FROM couriers WHERE id = ?',
                (courier_id,)).fetchone()

            return jsonify({'success': True, 'message': 'Профиль обновлен', 'profile': dict(updated)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/courier/change-password', methods=['POST'])
def courier_change_password():
    db = get_db()
    try:
        data = request.json
        courier_id = data.get('courier_id')
        old_password = data.get('old_password')
        new_password = data.get('new_password')

        if not courier_id or not old_password or not new_password:
            return jsonify({'success': False, 'error': 'Заполните все поля'}), 400

        if len(new_password) < 6:
            return jsonify({'success': False, 'error': 'Новый пароль должен быть не менее 6 символов'}), 400

        courier = db.execute('SELECT password FROM couriers WHERE id = ?', (courier_id,)).fetchone()
        if not courier:
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        if courier['password'] != old_password:
            return jsonify({'success': False, 'error': 'Неверный текущий пароль'}), 401

        db.execute('UPDATE couriers SET password = ? WHERE id = ?', (new_password, courier_id))
        db.commit()

        return jsonify({'success': True, 'message': 'Пароль успешно изменен'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/assign-courier', methods=['POST'])
def assign_courier():
    """Назначить курьера на заказ"""
    try:
        data = request.json
        order_id = data.get('order_id')

        if not order_id:
            return jsonify({'success': False, 'error': 'Не указан ID заказа'}), 400

        db = get_db()

        # Проверяем, не назначен ли уже курьер
        existing = db.execute('SELECT courier_id FROM order_assignments WHERE order_id = ?', (order_id,)).fetchone()
        if existing:
            db.close()
            return jsonify({'success': False, 'error': 'Курьер уже назначен'}), 400

        # Получаем случайного активного курьера
        courier = db.execute('''
                             SELECT id, full_name, phone
                             FROM couriers
                             WHERE is_active = 1
                             ORDER BY RANDOM() LIMIT 1
                             ''').fetchone()

        if not courier:
            db.close()
            return jsonify({'success': False, 'error': 'Нет доступных курьеров'}), 404

        # Назначаем заказ
        db.execute('''
                   INSERT INTO order_assignments (order_id, courier_id, status)
                   VALUES (?, ?, 'assigned')
                   ''', (order_id, courier['id']))

        db.commit()
        db.close()

        print(f"✅ Заказ #{order_id} назначен курьеру #{courier['id']} ({courier['full_name']})")

        return jsonify({
            'success': True,
            'courier_id': courier['id'],
            'courier_name': courier['full_name'],
            'courier_phone': courier['phone']
        })

    except Exception as e:
        print(f"❌ Ошибка назначения курьера: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== API ДЛЯ АДМИНА ==========
@app.route('/api/admin/dashboard')
def admin_dashboard():
    db = get_db()
    try:
        stats = db.execute('''
                           SELECT (SELECT COUNT(*) FROM orders)                          as total_orders,
                                  COALESCE(SUM(total_price), 0)                          as total_revenue,
                                  (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
                                  (SELECT COUNT(*) FROM products)                        as total_products,
                                  (SELECT COUNT(DISTINCT user_id) FROM orders)           as total_customers
                           FROM orders
                           ''').fetchone()

        recent_orders = db.execute('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10').fetchall()

        result = {
            'total_orders': stats['total_orders'] if stats else 0,
            'total_revenue': stats['total_revenue'] if stats else 0,
            'pending_orders': stats['pending_orders'] if stats else 0,
            'total_products': stats['total_products'] if stats else 0,
            'total_customers': stats['total_customers'] if stats else 0,
            'recent_orders': [dict(row) for row in recent_orders]
        }

        db.close()
        return jsonify(result)
    except Exception as e:
        db.close()
        return jsonify({
            'total_orders': 0, 'total_revenue': 0, 'pending_orders': 0,
            'total_products': 0, 'total_customers': 0, 'recent_orders': []
        })


# ========== API ДЛЯ ВЕСОВЫХ ТОВАРОВ И СКИДОК ==========

@app.route('/api/discounts', methods=['GET'])
def get_discounts():
    """Получить все активные скидки"""
    db = get_db()
    try:
        discounts = db.execute('''
                               SELECT d.*,
                                      (SELECT COUNT(*) FROM orders WHERE discount_id = d.id) as used_count
                               FROM discounts d
                               ORDER BY d.created_at DESC
                               ''').fetchall()

        result = [dict(discount) for discount in discounts]
        db.close()
        return jsonify(result)
    except Exception as e:
        db.close()
        print(f"❌ Ошибка получения скидок: {e}")
        return jsonify([])


@app.route('/api/admin/discounts', methods=['GET', 'POST'])
def admin_discounts():
    """Управление скидками - получение списка и создание"""
    db = get_db()
    try:
        if request.method == 'GET':
            # Получить все скидки
            discounts = db.execute('''
                                   SELECT d.*,
                                          (SELECT COUNT(*) FROM orders WHERE discount_id = d.id) as used_count
                                   FROM discounts d
                                   ORDER BY d.created_at DESC
                                   ''').fetchall()

            return jsonify([dict(discount) for discount in discounts])

        elif request.method == 'POST':
            # Создать новую скидку
            data = request.json

            # Валидация
            if not data.get('name'):
                return jsonify({'success': False, 'error': 'Введите название скидки'}), 400

            if not data.get('discount_type'):
                return jsonify({'success': False, 'error': 'Выберите тип скидки'}), 400

            if data.get('discount_type') in ['percentage', 'fixed'] and not data.get('value'):
                return jsonify({'success': False, 'error': 'Укажите размер скидки'}), 400

            if not data.get('apply_to'):
                return jsonify({'success': False, 'error': 'Выберите область применения'}), 400

            # Вставляем скидку
            cursor = db.execute('''
                                INSERT INTO discounts (name, discount_type, value, min_order_amount,
                                                       apply_to, target_category, target_product_id,
                                                       start_date, end_date, is_active)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (
                                    data.get('name'),
                                    data.get('discount_type'),
                                    data.get('value', 0),
                                    data.get('min_order_amount', 0),
                                    data.get('apply_to', 'all'),
                                    data.get('target_category'),
                                    data.get('target_product_id'),
                                    data.get('start_date'),
                                    data.get('end_date'),
                                    data.get('is_active', True)
                                ))

            discount_id = cursor.lastrowid
            db.commit()

            return jsonify({'success': True, 'id': discount_id})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/discounts/<int:id>', methods=['GET', 'PUT', 'DELETE'])
def admin_discount_detail(id):
    """Управление конкретной скидкой"""
    db = get_db()
    try:
        if request.method == 'GET':
            # Получить скидку по ID
            discount = db.execute('SELECT * FROM discounts WHERE id = ?', (id,)).fetchone()

            if not discount:
                return jsonify({'success': False, 'error': 'Скидка не найдена'}), 404

            discount_dict = dict(discount)

            # Получаем использования скидки
            used_count = db.execute('SELECT COUNT(*) FROM orders WHERE discount_id = ?', (id,)).fetchone()[0]
            discount_dict['used_count'] = used_count

            return jsonify(discount_dict)

        elif request.method == 'PUT':
            # Обновить скидку
            data = request.json

            # Проверяем существование скидки
            discount = db.execute('SELECT id FROM discounts WHERE id = ?', (id,)).fetchone()
            if not discount:
                return jsonify({'success': False, 'error': 'Скидка не найдена'}), 404

            # Валидация
            if not data.get('name'):
                return jsonify({'success': False, 'error': 'Введите название скидки'}), 400

            if not data.get('discount_type'):
                return jsonify({'success': False, 'error': 'Выберите тип скидки'}), 400

            if data.get('discount_type') in ['percentage', 'fixed'] and not data.get('value'):
                return jsonify({'success': False, 'error': 'Укажите размер скидки'}), 400

            if not data.get('apply_to'):
                return jsonify({'success': False, 'error': 'Выберите область применения'}), 400

            # Обновляем скидку
            db.execute('''
                UPDATE discounts
                SET name = ?, discount_type = ?, value = ?, min_order_amount = ?,
                    apply_to = ?, target_category = ?, target_product_id = ?,
                    start_date = ?, end_date = ?, is_active = ?
                WHERE id = ?
            ''', (
                data.get('name'),
                data.get('discount_type'),
                data.get('value', 0),
                data.get('min_order_amount', 0),
                data.get('apply_to', 'all'),
                data.get('target_category'),
                data.get('target_product_id'),
                data.get('start_date'),
                data.get('end_date'),
                data.get('is_active', True),
                id
            ))

            db.commit()
            return jsonify({'success': True})

        elif request.method == 'DELETE':
            # Удалить скидку
            discount = db.execute('SELECT id FROM discounts WHERE id = ?', (id,)).fetchone()
            if not discount:
                return jsonify({'success': False, 'error': 'Скидка не найдена'}), 404

            # Проверяем, используется ли скидка в заказах
            usage_count = db.execute('SELECT COUNT(*) FROM orders WHERE discount_id = ?', (id,)).fetchone()[0]
            if usage_count > 0:
                return jsonify({'success': False, 'error': 'Нельзя удалить скидку, которая уже использовалась в заказах'}), 400

            # Удаляем скидку
            db.execute('DELETE FROM discounts WHERE id = ?', (id,))
            db.commit()

            return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/admin/discounts/<int:id>/status', methods=['PUT'])
def admin_discount_status(id):
    """Изменить статус скидки (активна/неактивна)"""
    db = get_db()
    try:
        data = request.json
        is_active = data.get('is_active')

        if is_active is None:
            return jsonify({'success': False, 'error': 'Не указан статус'}), 400

        # Проверяем существование скидки
        discount = db.execute('SELECT id FROM discounts WHERE id = ?', (id,)).fetchone()
        if not discount:
            return jsonify({'success': False, 'error': 'Скидка не найдена'}), 404

        # Обновляем статус
        db.execute('UPDATE discounts SET is_active = ? WHERE id = ?', (is_active, id))
        db.commit()

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/products/update', methods=['PUT'])
def admin_update_product():
    """Обновить товар с поддержкой весовых товаров"""
    db = get_db()
    try:
        product_id = request.args.get('id')
        data = request.json

        if not product_id:
            return jsonify({'success': False, 'error': 'Не указан ID товара'}), 400

        # Проверяем тип товара
        product_type = data.get('product_type', 'piece')

        if product_type == 'weight':
            # Для весовых товаров
            db.execute('''
                       UPDATE products
                       SET name           = ?,
                           description    = ?,
                           price          = ?,
                           image_url      = ?,
                           category       = ?,
                           product_type   = ?,
                           unit           = ?,
                           weight_unit    = ?,
                           price_per_unit = ?,
                           min_weight     = ?,
                           step_weight    = ?,
                           stock          = ?,
                           stock_weight   = ?
                       WHERE id = ?
                       ''', (
                           data.get('name', ''),
                           data.get('description', ''),
                           data.get('price', 0),
                           data.get('image_url', ''),
                           data.get('category', ''),
                           'weight',
                           data.get('unit', 'кг'),
                           data.get('weight_unit', 'кг'),
                           data.get('price_per_unit', 0),
                           data.get('min_weight', 0.1),
                           data.get('step_weight', 0.1),
                           data.get('stock', 0),
                           data.get('stock_weight', 0)
                       ))
        else:
            # Для штучных товаров
            db.execute('''
                       UPDATE products
                       SET name         = ?,
                           description  = ?,
                           price        = ?,
                           image_url    = ?,
                           category     = ?,
                           product_type = ?,
                           unit         = ?,
                           stock        = ?
                       WHERE id = ?
                       ''', (
                           data.get('name', ''),
                           data.get('description', ''),
                           data.get('price', 0),
                           data.get('image_url', ''),
                           data.get('category', ''),
                           'piece',
                           data.get('unit', 'шт'),
                           data.get('stock', 0)
                       ))

        db.commit()
        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/products/create', methods=['POST'])
def admin_create_product():
    """Создать товар с поддержкой весовых товаров"""
    db = get_db()
    try:
        data = request.json

        # Проверяем обязательные поля
        if not data.get('name') or data.get('price') is None:
            return jsonify({'success': False, 'error': 'Заполните обязательные поля'}), 400

        product_type = data.get('product_type', 'piece')

        if product_type == 'weight':
            # Для весовых товаров
            cursor = db.execute('''
                                INSERT INTO products (name, description, price, image_url, category,
                                                      product_type, unit, weight_unit, price_per_unit,
                                                      min_weight, step_weight, stock, stock_weight)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (
                                    data.get('name', ''),
                                    data.get('description', ''),
                                    data.get('price', 0),
                                    data.get('image_url', ''),
                                    data.get('category', ''),
                                    'weight',
                                    data.get('unit', 'кг'),
                                    data.get('weight_unit', 'кг'),
                                    data.get('price_per_unit', 0),
                                    data.get('min_weight', 0.1),
                                    data.get('step_weight', 0.1),
                                    data.get('stock', 0),
                                    data.get('stock_weight', 0)
                                ))
        else:
            # Для штучных товаров
            cursor = db.execute('''
                                INSERT INTO products (name, description, price, image_url, category,
                                                      product_type, unit, stock)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (
                                    data.get('name', ''),
                                    data.get('description', ''),
                                    data.get('price', 0),
                                    data.get('image_url', ''),
                                    data.get('category', ''),
                                    'piece',
                                    data.get('unit', 'шт'),
                                    data.get('stock', 0)
                                ))

        product_id = cursor.lastrowid
        db.commit()

        return jsonify({'success': True, 'id': product_id})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/promo-codes', methods=['GET', 'POST', 'PUT', 'DELETE'])
def admin_promo_codes():
    """Управление промокодами"""
    db = get_db()
    try:
        if request.method == 'GET':
            # Получить все промокоды
            promo_codes = db.execute('''
                                     SELECT pc.*, d.name as discount_name, d.discount_type, d.value
                                     FROM promo_codes pc
                                              LEFT JOIN discounts d ON pc.discount_id = d.id
                                     ORDER BY pc.created_at DESC
                                     ''').fetchall()

            return jsonify([dict(pc) for pc in promo_codes])

        elif request.method == 'POST':
            # Создать промокод
            data = request.json

            if not data.get('code') or not data.get('discount_id'):
                return jsonify({'success': False, 'error': 'Заполните обязательные поля'}), 400

            # Проверяем уникальность кода
            existing = db.execute('SELECT id FROM promo_codes WHERE code = ?', (data['code'],)).fetchone()
            if existing:
                return jsonify({'success': False, 'error': 'Такой промокод уже существует'}), 400

            cursor = db.execute('''
                                INSERT INTO promo_codes (code, discount_id, usage_limit, is_active)
                                VALUES (?, ?, ?, ?)
                                ''', (
                                    data['code'],
                                    data['discount_id'],
                                    data.get('usage_limit'),
                                    data.get('is_active', True)
                                ))

            db.commit()
            return jsonify({'success': True, 'id': cursor.lastrowid})

        elif request.method == 'PUT':
            # Обновить промокод
            promo_id = request.args.get('id')
            data = request.json

            if not promo_id:
                return jsonify({'success': False, 'error': 'Не указан ID промокода'}), 400

            db.execute('''
                       UPDATE promo_codes
                       SET code        = ?,
                           discount_id = ?,
                           usage_limit = ?,
                           is_active   = ?
                       WHERE id = ?
                       ''', (
                           data.get('code'),
                           data.get('discount_id'),
                           data.get('usage_limit'),
                           data.get('is_active', True),
                           promo_id
                       ))

            db.commit()
            return jsonify({'success': True})

        elif request.method == 'DELETE':
            # Удалить промокод
            promo_id = request.args.get('id')

            if not promo_id:
                return jsonify({'success': False, 'error': 'Не указан ID промокода'}), 400

            db.execute('DELETE FROM promo_codes WHERE id = ?', (promo_id,))
            db.commit()
            return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/categories/tree', methods=['GET', 'POST', 'PUT', 'DELETE'])
def admin_categories_tree():
    """Управление деревом категорий"""
    db = get_db()
    try:
        if request.method == 'GET':
            # Получить дерево категорий
            categories = db.execute('''
                                    SELECT pc.*, d.name as discount_name
                                    FROM product_categories pc
                                             LEFT JOIN discounts d ON pc.discount_id = d.id
                                    ORDER BY pc.sort_order, pc.name
                                    ''').fetchall()

            # Строим дерево
            categories_dict = {}
            root_categories = []

            for cat in categories:
                cat_dict = dict(cat)
                cat_dict['children'] = []
                categories_dict[cat_dict['id']] = cat_dict

            for cat_id, cat in categories_dict.items():
                if cat['parent_id']:
                    if cat['parent_id'] in categories_dict:
                        categories_dict[cat['parent_id']]['children'].append(cat)
                else:
                    root_categories.append(cat)

            return jsonify(root_categories)

        elif request.method == 'POST':
            # Создать категорию
            data = request.json

            if not data.get('name'):
                return jsonify({'success': False, 'error': 'Введите название категории'}), 400

            cursor = db.execute('''
                                INSERT INTO product_categories (name, parent_id, discount_id, sort_order)
                                VALUES (?, ?, ?, ?)
                                ''', (
                                    data['name'],
                                    data.get('parent_id'),
                                    data.get('discount_id'),
                                    data.get('sort_order', 0)
                                ))

            db.commit()
            return jsonify({'success': True, 'id': cursor.lastrowid})

        elif request.method == 'PUT':
            # Обновить категорию
            category_id = request.args.get('id')
            data = request.json

            if not category_id:
                return jsonify({'success': False, 'error': 'Не указан ID категории'}), 400

            db.execute('''
                       UPDATE product_categories
                       SET name        = ?,
                           parent_id   = ?,
                           discount_id = ?,
                           sort_order  = ?
                       WHERE id = ?
                       ''', (
                           data.get('name'),
                           data.get('parent_id'),
                           data.get('discount_id'),
                           data.get('sort_order', 0),
                           category_id
                       ))

            db.commit()
            return jsonify({'success': True})

        elif request.method == 'DELETE':
            # Удалить категорию
            category_id = request.args.get('id')

            if not category_id:
                return jsonify({'success': False, 'error': 'Не указан ID категории'}), 400

            # Проверяем, есть ли товары в этой категории
            products_count = db.execute(
                'SELECT COUNT(*) FROM products WHERE category = (SELECT name FROM product_categories WHERE id = ?)',
                (category_id,)
            ).fetchone()[0]

            if products_count > 0:
                return jsonify({'success': False, 'error': 'Нельзя удалить категорию с товарами'}), 400

            # Проверяем, есть ли подкатегории
            children_count = db.execute(
                'SELECT COUNT(*) FROM product_categories WHERE parent_id = ?',
                (category_id,)
            ).fetchone()[0]

            if children_count > 0:
                return jsonify({'success': False, 'error': 'Нельзя удалить категорию с подкатегориями'}), 400

            db.execute('DELETE FROM product_categories WHERE id = ?', (category_id,))
            db.commit()
            return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/check-discount', methods=['POST'])
def check_discount():
    """Проверить скидки для товаров в корзине"""
    try:
        data = request.json
        items = data.get('items', [])

        if not items:
            return jsonify({'discounts': [], 'total_discount': 0})

        db = get_db()

        # Получаем все активные скидки
        discounts = db.execute('''
                               SELECT d.*, da.product_id, da.category, da.apply_to_all
                               FROM discounts d
                                        LEFT JOIN discount_applications da ON d.id = da.discount_id
                               WHERE d.is_active = 1
                                 AND (d.start_date IS NULL OR d.start_date <= CURRENT_TIMESTAMP)
                                 AND (d.end_date IS NULL OR d.end_date >= CURRENT_TIMESTAMP)
                               ''').fetchall()

        # Применяем скидки к товарам
        item_discounts = []
        total_discount = 0

        for item in items:
            product_id = item.get('id')
            quantity = item.get('quantity', 1)
            price = item.get('price', 0)

            # Ищем скидки для этого товара
            item_discount = 0

            for discount in discounts:
                discount_dict = dict(discount)

                # Проверяем применение скидки
                applies = False

                if discount_dict['apply_to_all']:
                    applies = True
                elif discount_dict['product_id'] and discount_dict['product_id'] == product_id:
                    applies = True
                elif discount_dict['category']:
                    # Получаем категорию товара
                    product = db.execute('SELECT category FROM products WHERE id = ?', (product_id,)).fetchone()
                    if product and product['category'] == discount_dict['category']:
                        applies = True

                if applies:
                    # Рассчитываем скидку
                    discount_value = 0
                    if discount_dict['discount_type'] == 'percentage':
                        discount_value = price * quantity * (discount_dict['value'] / 100)
                        # Проверяем максимальную скидку
                        if discount_dict['max_discount']:
                            discount_value = min(discount_value, discount_dict['max_discount'])
                    elif discount_dict['discount_type'] == 'fixed':
                        discount_value = discount_dict['value'] * quantity

                    item_discount += discount_value

            item_discounts.append({
                'product_id': product_id,
                'discount': item_discount
            })

            total_discount += item_discount

        db.close()

        return jsonify({
            'discounts': item_discounts,
            'total_discount': total_discount
        })

    except Exception as e:
        print(f"Ошибка проверки скидок: {e}")
        return jsonify({'discounts': [], 'total_discount': 0})


@app.route('/api/check-promo-code', methods=['POST'])
def check_promo_code():
    """Проверить промокод"""
    try:
        data = request.json
        code = data.get('code', '').strip().upper()

        if not code:
            return jsonify({'success': False, 'error': 'Введите промокод'})

        db = get_db()

        # Ищем промокод
        promo = db.execute('''
                           SELECT pc.*, d.discount_type, d.value, d.max_discount
                           FROM promo_codes pc
                                    LEFT JOIN discounts d ON pc.discount_id = d.id
                           WHERE pc.code = ?
                             AND pc.is_active = 1
                           ''', (code,)).fetchone()

        if not promo:
            return jsonify({'success': False, 'error': 'Промокод не найден'})

        promo_dict = dict(promo)

        # Проверяем лимит использования
        if promo_dict['usage_limit'] and promo_dict['used_count'] >= promo_dict['usage_limit']:
            return jsonify({'success': False, 'error': 'Промокод закончился'})

        db.close()

        return jsonify({
            'success': True,
            'promo_code': promo_dict,
            'discount_type': promo_dict['discount_type'],
            'value': promo_dict['value'],
            'max_discount': promo_dict['max_discount']
        })

    except Exception as e:
        print(f"Ошибка проверки промокода: {e}")
        return jsonify({'success': False, 'error': 'Ошибка проверки промокода'})


@app.route('/api/promo-codes', methods=['GET'])
def get_promo_codes():
    """Получить все промокоды"""
    db = get_db()
    try:
        promo_codes = db.execute('SELECT * FROM promo_codes ORDER BY created_at DESC').fetchall()
        result = [dict(pc) for pc in promo_codes]
        db.close()
        return jsonify(result)
    except Exception as e:
        db.close()
        print(f"❌ Ошибка получения промокодов: {e}")
        return jsonify([])

@app.route('/api/products/with-discounts', methods=['GET'])
def get_products_with_discounts():
    """Получить товары со скидками"""
    db = get_db()
    try:
        category = request.args.get('category', 'all')

        # Получаем товары
        if category and category != 'all':
            products = db.execute('''
                                  SELECT *
                                  FROM products
                                  WHERE stock > 0
                                    AND category = ?
                                  ORDER BY created_at DESC
                                  ''', (category,)).fetchall()
        else:
            products = db.execute('''
                                  SELECT *
                                  FROM products
                                  WHERE stock > 0
                                  ORDER BY created_at DESC
                                  ''').fetchall()

        # Получаем активные скидки
        discounts = db.execute('''
                               SELECT d.*, da.product_id, da.category, da.apply_to_all
                               FROM discounts d
                                        LEFT JOIN discount_applications da ON d.id = da.discount_id
                               WHERE d.is_active = 1
                                 AND (d.start_date IS NULL OR d.start_date <= CURRENT_TIMESTAMP)
                                 AND (d.end_date IS NULL OR d.end_date >= CURRENT_TIMESTAMP)
                               ''').fetchall()

        # Применяем скидки к товарам
        result = []

        for product in products:
            product_dict = dict(product)

            # Рассчитываем скидку для товара
            product_discount = 0
            discounted_price = product_dict['price']

            for discount in discounts:
                discount_dict = dict(discount)

                # Проверяем применение скидки
                applies = False

                if discount_dict['apply_to_all']:
                    applies = True
                elif discount_dict['product_id'] and discount_dict['product_id'] == product_dict['id']:
                    applies = True
                elif discount_dict['category'] and product_dict['category'] == discount_dict['category']:
                    applies = True

                if applies:
                    if discount_dict['discount_type'] == 'percentage':
                        discount_amount = product_dict['price'] * (discount_dict['value'] / 100)
                        if discount_dict['max_discount']:
                            discount_amount = min(discount_amount, discount_dict['max_discount'])
                        product_discount += discount_amount
                    elif discount_dict['discount_type'] == 'fixed':
                        product_discount += discount_dict['value']

            if product_discount > 0:
                discounted_price = max(0, product_dict['price'] - product_discount)
                product_dict['original_price'] = product_dict['price']
                product_dict['discount'] = product_discount
                product_dict['discount_percentage'] = round((product_discount / product_dict['price']) * 100, 1)

            product_dict['final_price'] = discounted_price
            result.append(product_dict)

        return jsonify(result)

    except Exception as e:
        print(f"Ошибка получения товаров со скидками: {e}")
        # Возвращаем товары без скидок при ошибке
        if 'products' in locals():
            return jsonify([dict(p) for p in products])
        return jsonify([])
    finally:
        db.close()


@app.route('/api/admin/products', methods=['GET', 'POST', 'PUT', 'DELETE'])
def admin_products():
    db = get_db()
    try:
        if request.method == 'GET':
            products = db.execute('SELECT * FROM products ORDER BY created_at DESC').fetchall()
            return jsonify([dict(product) for product in products])

        elif request.method == 'POST':
            data = request.json
            if not data or 'name' not in data or 'price' not in data:
                return jsonify({'success': False, 'error': 'Отсутствуют обязательные поля'}), 400

            db.execute(
                'INSERT INTO products (name, description, price, image_url, category, stock) VALUES (?, ?, ?, ?, ?, ?)',
                (data.get('name', ''), data.get('description', ''), data.get('price', 0),
                 data.get('image_url', ''), data.get('category', ''), data.get('stock', 0)))
            db.commit()
            product_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
            return jsonify({'success': True, 'id': product_id})

        elif request.method == 'PUT':
            product_id = request.args.get('id')
            data = request.json

            if not product_id:
                return jsonify({'success': False, 'error': 'Не указан ID товара'}), 400

            db.execute(
                'UPDATE products SET name = ?, description = ?, price = ?, image_url = ?, category = ?, stock = ? WHERE id = ?',
                (data.get('name', ''), data.get('description', ''), data.get('price', 0),
                 data.get('image_url', ''), data.get('category', ''), data.get('stock', 0), product_id))
            db.commit()
            return jsonify({'success': True})

        elif request.method == 'DELETE':
            product_id = request.args.get('id')
            if not product_id:
                return jsonify({'success': False, 'error': 'Не указан ID товара'}), 400

            db.execute('DELETE FROM products WHERE id = ?', (product_id,))
            db.commit()
            return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/orders', methods=['GET'])
def admin_orders():
    db = get_db()
    orders = db.execute('SELECT * FROM orders ORDER BY created_at DESC').fetchall()
    db.close()
    return jsonify([dict(order) for order in orders])


@app.route('/api/admin/categories/manage', methods=['GET', 'POST', 'DELETE'])
def admin_manage_categories():
    db = get_db()
    try:
        if request.method == 'GET':
            categories = db.execute(
                'SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != "" ORDER BY category').fetchall()
            return jsonify([row['category'] for row in categories])

        elif request.method == 'POST':
            data = request.get_json()
            new_category = data.get('name', '').strip()

            if not new_category:
                return jsonify({'success': False, 'error': 'Название категории не может быть пустым'}), 400

            existing = db.execute('SELECT COUNT(*) as count FROM products WHERE LOWER(category) = LOWER(?)',
                                  (new_category,)).fetchone()
            if existing['count'] > 0:
                return jsonify({'success': False, 'error': 'Такая категория уже существует'}), 400

            db.execute(
                'INSERT INTO products (name, description, price, image_url, category, stock) VALUES (?, ?, ?, ?, ?, ?)',
                (f'Товар категории {new_category}', f'Автоматически созданный товар', 1000,
                 'https://via.placeholder.com/300x200', new_category, 10))
            db.commit()
            return jsonify({'success': True, 'message': f'Категория "{new_category}" создана'})

        elif request.method == 'DELETE':
            category_name = request.args.get('name', '').strip()
            if not category_name:
                return jsonify({'success': False, 'error': 'Не указана категория'}), 400

            db.execute('UPDATE products SET category = "" WHERE LOWER(category) = LOWER(?)', (category_name,))
            db.commit()
            return jsonify({'success': True, 'message': f'Категория "{category_name}" удалена'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


# ========== ДОПОЛНИТЕЛЬНЫЕ ЭНДПОИНТЫ ==========
@app.route('/api/pickup-points', methods=['GET'])
def get_pickup_points():
    db = get_db()
    try:
        points = db.execute('SELECT * FROM pickup_points WHERE is_active = 1 ORDER BY name').fetchall()
        return jsonify([dict(point) for point in points])
    except Exception as e:
        return jsonify([])
    finally:
        db.close()


@app.route('/api/user/addresses', methods=['GET', 'POST'])
def user_addresses():
    db = get_db()
    try:
        if request.method == 'GET':
            user_id = request.args.get('user_id', type=int)
            if not user_id or user_id == 0:
                return jsonify([])

            addresses = db.execute(
                'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
                (user_id,)).fetchall()
            return jsonify([dict(addr) for addr in addresses])

        elif request.method == 'POST':
            data = request.json
            user_id = data.get('user_id', 0)

            if user_id == 0:
                return jsonify({'success': True, 'id': 0, 'message': 'Адрес сохранен локально для гостя'})

            required_fields = ['city', 'street', 'house', 'recipient_name']
            for field in required_fields:
                if not data.get(field):
                    return jsonify({'success': False, 'error': f'Отсутствует обязательное поле: {field}'}), 400

            count = db.execute('SELECT COUNT(*) FROM user_addresses WHERE user_id = ?', (user_id,)).fetchone()[0]
            is_default = 1 if count == 0 else data.get('is_default', 0)

            cursor = db.execute('''
                                INSERT INTO user_addresses (user_id, city, street, house, apartment, floor, doorcode,
                                                            recipient_name, phone, is_default)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (
                                    user_id, data['city'], data['street'], data['house'],
                                    data.get('apartment', ''), data.get('floor', ''), data.get('doorcode', ''),
                                    data['recipient_name'], data.get('phone', ''), is_default
                                ))

            if is_default:
                db.execute('UPDATE user_addresses SET is_default = 0 WHERE user_id = ? AND id != ?',
                           (user_id, cursor.lastrowid))

            db.commit()
            return jsonify({'success': True, 'id': cursor.lastrowid})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


# ========== НОВЫЕ ENDPOINTS ДЛЯ БОТА ==========

@app.route('/api/bot/register-user', methods=['POST'])
def bot_register_user():
    """Регистрация пользователя Telegram для уведомлений"""
    try:
        data = request.json
        telegram_id = data.get('telegram_id')
        username = data.get('username')
        first_name = data.get('first_name')
        last_name = data.get('last_name')

        if not telegram_id:
            return jsonify({'success': False, 'error': 'Отсутствует telegram_id'}), 400

        db = get_db()

        # Проверяем существует ли пользователь
        existing = db.execute('SELECT id FROM telegram_users WHERE telegram_id = ?', (telegram_id,)).fetchone()

        if existing:
            # Обновляем информацию
            db.execute('''
                       UPDATE telegram_users
                       SET username   = ?,
                           first_name = ?,
                           last_name  = ?,
                           last_seen  = CURRENT_TIMESTAMP
                       WHERE telegram_id = ?
                       ''', (username, first_name, last_name, telegram_id))
        else:
            # Создаем нового пользователя
            db.execute('''
                       INSERT INTO telegram_users (telegram_id, username, first_name, last_name)
                       VALUES (?, ?, ?, ?)
                       ''', (telegram_id, username, first_name, last_name))

        db.commit()
        db.close()

        print(f"✅ Зарегистрирован пользователь Telegram: {first_name} (ID: {telegram_id})")
        return jsonify({'success': True, 'message': 'Пользователь зарегистрирован'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/bot/get-orders/<int:telegram_id>')
def bot_get_user_orders(telegram_id):
    """Получить заказы пользователя для бота"""
    try:
        db = get_db()

        orders = db.execute('''
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
                            ORDER BY o.created_at DESC LIMIT 10
                            ''', (telegram_id,)).fetchall()

        result = [dict(order) for order in orders]

        db.close()
        return jsonify({'success': True, 'orders': result})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/bot/order-status/<int:order_id>')
def bot_get_order_status(order_id):
    """Получить статус конкретного заказа для бота"""
    try:
        db = get_db()

        order = db.execute('''
                           SELECT o.*,
                                  a.status    as delivery_status,
                                  a.delivered_at,
                                  c.full_name as courier_name,
                                  c.phone     as courier_phone
                           FROM orders o
                                    LEFT JOIN order_assignments a ON o.id = a.order_id
                                    LEFT JOIN couriers c ON a.courier_id = c.id
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

        if not order:
            return jsonify({'success': False, 'error': 'Заказ не найден'}), 404

        order_dict = dict(order)
        try:
            order_dict['items_list'] = json.loads(order_dict['items'])
        except:
            order_dict['items_list'] = []

        if order_dict.get('delivery_address'):
            try:
                order_dict['delivery_address_obj'] = json.loads(order_dict['delivery_address'])
            except:
                order_dict['delivery_address_obj'] = {}

        db.close()
        return jsonify({'success': True, 'order': order_dict})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== УТИЛИТЫ ==========
@app.route('/api/test')
def test():
    return jsonify({'status': 'OK', 'message': 'Сервер работает'})


@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'Файл не выбран'})

    file = request.files['image']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'Файл не выбран'})

    if not allowed_file(file.filename):
        return jsonify({'success': False, 'error': 'Недопустимый формат файла'})

    try:
        filename = f"{uuid.uuid4().hex[:8]}_{secure_filename(file.filename)}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        image_url = f'/static/uploads/{filename}'
        return jsonify({'success': True, 'url': image_url, 'filename': filename})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/static/uploads/<filename>')
def uploaded_file(filename):
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        return jsonify({'error': 'Файл не найден'}), 404



# ========== API ДЛЯ ПРОМОКОДОВ ==========
@app.route('/api/admin/promo-codes', methods=['GET', 'POST'])
def admin_promo_codes_api():
    """Управление промокодами - получение списка и создание"""
    db = get_db()
    try:
        if request.method == 'GET':
            # Получить все промокоды
            promo_codes = db.execute('SELECT * FROM promo_codes ORDER BY created_at DESC').fetchall()
            return jsonify([dict(pc) for pc in promo_codes])

        elif request.method == 'POST':
            # Создать новый промокод
            data = request.json

            # Валидация
            if not data.get('code'):
                return jsonify({'success': False, 'error': 'Введите код промокода'}), 400

            if not data.get('discount_type'):
                return jsonify({'success': False, 'error': 'Выберите тип скидки'}), 400

            if data.get('discount_type') in ['percentage', 'fixed'] and not data.get('value'):
                return jsonify({'success': False, 'error': 'Укажите размер скидки'}), 400

            # Проверяем уникальность кода
            existing = db.execute('SELECT id FROM promo_codes WHERE code = ?', (data['code'].upper(),)).fetchone()
            if existing:
                return jsonify({'success': False, 'error': 'Такой промокод уже существует'}), 400

            # Создаем промокод
            cursor = db.execute('''
                INSERT INTO promo_codes (
                    code, discount_type, value, usage_limit,
                    min_order_amount, start_date, end_date,
                    is_active, one_per_customer, exclude_sale_items
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data.get('code').upper(),
                data.get('discount_type'),
                data.get('value', 0),
                data.get('usage_limit'),
                data.get('min_order_amount', 0),
                data.get('start_date'),
                data.get('end_date'),
                data.get('is_active', True),
                data.get('one_per_customer', False),
                data.get('exclude_sale_items', False)
            ))

            promo_id = cursor.lastrowid
            db.commit()

            return jsonify({'success': True, 'id': promo_id})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/admin/promo-codes/<int:id>', methods=['GET', 'PUT', 'DELETE'])
def admin_promo_code_detail(id):
    """Управление конкретным промокодом"""
    db = get_db()
    try:
        if request.method == 'GET':
            # Получить промокод по ID
            promo_code = db.execute('SELECT * FROM promo_codes WHERE id = ?', (id,)).fetchone()

            if not promo_code:
                return jsonify({'success': False, 'error': 'Промокод не найден'}), 404

            return jsonify(dict(promo_code))

        elif request.method == 'PUT':
            # Обновить промокод
            data = request.json

            # Проверяем существование промокода
            promo_code = db.execute('SELECT id FROM promo_codes WHERE id = ?', (id,)).fetchone()
            if not promo_code:
                return jsonify({'success': False, 'error': 'Промокод не найдена'}), 404

            # Валидация
            if not data.get('code'):
                return jsonify({'success': False, 'error': 'Введите код промокода'}), 400

            if not data.get('discount_type'):
                return jsonify({'success': False, 'error': 'Выберите тип скидки'}), 400

            if data.get('discount_type') in ['percentage', 'fixed'] and not data.get('value'):
                return jsonify({'success': False, 'error': 'Укажите размер скидки'}), 400

            # Проверяем уникальность кода (если изменился)
            existing = db.execute('SELECT id FROM promo_codes WHERE code = ? AND id != ?',
                                (data['code'].upper(), id)).fetchone()
            if existing:
                return jsonify({'success': False, 'error': 'Такой промокод уже существует'}), 400

            # Обновляем промокод
            db.execute('''
                UPDATE promo_codes
                SET code = ?, discount_type = ?, value = ?, usage_limit = ?,
                    min_order_amount = ?, start_date = ?, end_date = ?,
                    is_active = ?, one_per_customer = ?, exclude_sale_items = ?
                WHERE id = ?
            ''', (
                data.get('code').upper(),
                data.get('discount_type'),
                data.get('value', 0),
                data.get('usage_limit'),
                data.get('min_order_amount', 0),
                data.get('start_date'),
                data.get('end_date'),
                data.get('is_active', True),
                data.get('one_per_customer', False),
                data.get('exclude_sale_items', False),
                id
            ))

            db.commit()
            return jsonify({'success': True})

        elif request.method == 'DELETE':
            # Удалить промокод
            promo_code = db.execute('SELECT id FROM promo_codes WHERE id = ?', (id,)).fetchone()
            if not promo_code:
                return jsonify({'success': False, 'error': 'Промокод не найден'}), 404

            # Проверяем, используется ли промокод в заказах
            usage_count = db.execute('SELECT COUNT(*) FROM orders WHERE promo_code_id = ?', (id,)).fetchone()[0]
            if usage_count > 0:
                return jsonify({'success': False, 'error': 'Нельзя удалить промокод, который уже использовался в заказах'}), 400

            # Удаляем промокод
            db.execute('DELETE FROM promo_codes WHERE id = ?', (id,))
            db.commit()

            return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/promo-codes/<int:id>/status', methods=['PUT'])
def admin_promo_code_status_api(id):
    """Изменить статус промокода (активен/неактивен)"""
    db = get_db()
    try:
        data = request.json
        is_active = data.get('is_active')

        if is_active is None:
            return jsonify({'success': False, 'error': 'Не указан статус'}), 400

        # Проверяем существование промокода
        promo_code = db.execute('SELECT id FROM promo_codes WHERE id = ?', (id,)).fetchone()
        if not promo_code:
            return jsonify({'success': False, 'error': 'Промокод не найден'}), 404

        # Обновляем статус
        db.execute('UPDATE promo_codes SET is_active = ? WHERE id = ?', (is_active, id))
        db.commit()

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

# ========== API ДЛЯ ДЕРЕВА КАТЕГОРИЙ ==========

@app.route('/api/admin/categories/tree', methods=['GET', 'POST'])
def admin_categories_tree_api():
    """Управление деревом категорий"""
    db = get_db()
    try:
        if request.method == 'GET':
            # Получить дерево категорий
            categories = db.execute('''
                SELECT pc.*,
                       d.name as discount_name
                FROM product_categories pc
                LEFT JOIN discounts d ON pc.discount_id = d.id
                ORDER BY pc.sort_order, pc.name
            ''').fetchall()

            # Строим дерево
            categories_dict = {}
            root_categories = []

            for cat in categories:
                cat_dict = dict(cat)
                cat_dict['children'] = []
                # Получаем количество товаров в категории
                product_count = db.execute(
                    'SELECT COUNT(*) FROM products WHERE category = ? OR category_id = ?',
                    (cat_dict['name'], cat_dict['id'])
                ).fetchone()[0]
                cat_dict['product_count'] = product_count
                cat_dict['has_products'] = product_count > 0
                categories_dict[cat_dict['id']] = cat_dict

            for cat_id, cat in categories_dict.items():
                if cat['parent_id']:
                    if cat['parent_id'] in categories_dict:
                        categories_dict[cat['parent_id']]['children'].append(cat)
                else:
                    root_categories.append(cat)

            return jsonify(root_categories)

        elif request.method == 'POST':
            # Создать новую категорию
            data = request.json

            # Валидация
            if not data.get('name'):
                return jsonify({'success': False, 'error': 'Введите название категории'}), 400

            # Проверяем уникальность имени
            existing = db.execute(
                'SELECT id FROM product_categories WHERE name = ?',
                (data['name'],)
            ).fetchone()

            if existing:
                return jsonify({'success': False, 'error': 'Категория с таким именем уже существует'}), 400

            # Создаем категорию
            cursor = db.execute('''
                INSERT INTO product_categories (
                    name, parent_id, discount_id, sort_order,
                    description, icon, color,
                    seo_title, seo_description, seo_keywords
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data.get('name'),
                data.get('parent_id'),
                data.get('discount_id'),
                data.get('sort_order', 0),
                data.get('description'),
                data.get('icon'),
                data.get('color', '#667eea'),
                data.get('seo_title'),
                data.get('seo_description'),
                data.get('seo_keywords')
            ))

            category_id = cursor.lastrowid
            db.commit()

            return jsonify({'success': True, 'id': category_id})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


app.route('/api/admin/categories/tree/<int:id>', methods=['GET', 'PUT', 'DELETE'])
def admin_category_tree_detail_api(id):
    """Управление конкретной категорией в дереве"""
    db = get_db()
    try:
        if request.method == 'GET':
            # Получить категорию по ID
            category = db.execute('''
                SELECT pc.*,
                       d.name as discount_name
                FROM product_categories pc
                LEFT JOIN discounts d ON pc.discount_id = d.id
                WHERE pc.id = ?
            ''', (id,)).fetchone()

            if not category:
                return jsonify({'success': False, 'error': 'Категория не найдена'}), 404

            category_dict = dict(category)
            # Получаем количество товаров в категории
            product_count = db.execute(
                'SELECT COUNT(*) FROM products WHERE category = ? OR category_id = ?',
                (category_dict['name'], id)
            ).fetchone()[0]
            category_dict['product_count'] = product_count
            category_dict['has_products'] = product_count > 0

            # Получаем детей категории
            children = db.execute('''
                SELECT pc.*,
                       d.name as discount_name
                FROM product_categories pc
                LEFT JOIN discounts d ON pc.discount_id = d.id
                WHERE pc.parent_id = ?
                ORDER BY pc.sort_order, pc.name
            ''', (id,)).fetchall()

            for child in children:
                child_dict = dict(child)
                child_product_count = db.execute(
                    'SELECT COUNT(*) FROM products WHERE category = ? OR category_id = ?',
                    (child_dict['name'], child_dict['id'])
                ).fetchone()[0]
                child_dict['product_count'] = child_product_count
                child_dict['has_products'] = child_product_count > 0

            category_dict['children'] = [dict(child) for child in children]

            return jsonify(category_dict)

        elif request.method == 'PUT':
            # Обновить категорию
            data = request.json

            # Проверяем существование категории
            category = db.execute('SELECT id FROM product_categories WHERE id = ?', (id,)).fetchone()
            if not category:
                return jsonify({'success': False, 'error': 'Категория не найдена'}), 404

            # Валидация
            if not data.get('name'):
                return jsonify({'success': False, 'error': 'Введите название категории'}), 400

            # Проверяем уникальность имени
            existing = db.execute(
                'SELECT id FROM product_categories WHERE name = ? AND id != ?',
                (data['name'], id)
            ).fetchone()

            if existing:
                return jsonify({'success': False, 'error': 'Категория с таким именем уже существует'}), 400

            # Обновляем категорию
            db.execute('''
                UPDATE product_categories
                SET name = ?, parent_id = ?, discount_id = ?, sort_order = ?,
                    description = ?, icon = ?, color = ?,
                    seo_title = ?, seo_description = ?, seo_keywords = ?
                WHERE id = ?
            ''', (
                data.get('name'),
                data.get('parent_id'),
                data.get('discount_id'),
                data.get('sort_order', 0),
                data.get('description'),
                data.get('icon'),
                data.get('color', '#667eea'),
                data.get('seo_title'),
                data.get('seo_description'),
                data.get('seo_keywords'),
                id
            ))

            db.commit()
            return jsonify({'success': True})

        elif request.method == 'DELETE':
            # Удалить категорию
            category = db.execute('SELECT id FROM product_categories WHERE id = ?', (id,)).fetchone()
            if not category:
                return jsonify({'success': False, 'error': 'Категория не найдена'}), 404

            # Проверяем, есть ли товары в этой категории
            product_count = db.execute(
                'SELECT COUNT(*) FROM products WHERE category = ? OR category_id = ?',
                (category['name'], id)
            ).fetchone()[0]
            if product_count > 0:
                return jsonify({'success': False, 'error': 'Нельзя удалить категорию с товарами'}), 400

            # Проверяем, есть ли подкатегории
            children_count = db.execute(
                'SELECT COUNT(*) FROM product_categories WHERE parent_id = ?',
                (id,)
            ).fetchone()[0]
            if children_count > 0:
                return jsonify({'success': False, 'error': 'Нельзя удалить категорию с подкатегориями'}), 400

            # Удаляем категорию
            db.execute('DELETE FROM product_categories WHERE id = ?', (id,))
            db.commit()

            return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/apply-discounts', methods=['POST'])
def apply_discounts():
    """Рассчитать скидки для товаров"""
    try:
        data = request.json
        items = data.get('items', [])

        if not items:
            return jsonify({'discounted_items': [], 'total_discount': 0, 'final_total': 0})

        db = get_db()

        # Получаем все активные скидки
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        discounts = db.execute('''
                               SELECT *
                               FROM discounts
                               WHERE is_active = 1
                                 AND (start_date IS NULL OR start_date <= ?)
                                 AND (end_date IS NULL OR end_date >= ?)
                               ''', (now, now)).fetchall()

        discounted_items = []
        total_discount = 0
        original_total = 0

        for item in items:
            product_id = item.get('id')
            quantity = item.get('quantity', 1)
            price = item.get('price', 0)

            # Ищем скидку для товара
            best_discount = None
            best_discount_value = 0

            for discount in discounts:
                discount_dict = dict(discount)

                # Проверяем применение скидки
                applies = False

                if discount_dict['apply_to'] == 'all':
                    applies = True
                elif discount_dict['apply_to'] == 'category':
                    # Получаем категорию товара
                    product = db.execute('SELECT category FROM products WHERE id = ?', (product_id,)).fetchone()
                    if product and product['category'] == discount_dict['target_category']:
                        applies = True
                elif discount_dict['apply_to'] == 'product':
                    if product_id == discount_dict['target_product_id']:
                        applies = True

                if applies:
                    # Рассчитываем скидку
                    discount_value = 0
                    if discount_dict['discount_type'] == 'percentage':
                        discount_value = price * quantity * (discount_dict['value'] / 100)
                    elif discount_dict['discount_type'] == 'fixed':
                        discount_value = discount_dict['value'] * quantity

                    # Если это лучшая скидка для товара
                    if discount_value > best_discount_value:
                        best_discount_value = discount_value
                        best_discount = discount_dict

            discounted_price = price - (best_discount_value / quantity) if best_discount_value > 0 else price
            item_discount = best_discount_value

            discounted_items.append({
                'id': product_id,
                'name': item.get('name'),
                'original_price': price,
                'discounted_price': discounted_price,
                'quantity': quantity,
                'discount': item_discount,
                'discount_info': best_discount
            })

            total_discount += item_discount
            original_total += price * quantity

        final_total = original_total - total_discount

        db.close()

        return jsonify({
            'discounted_items': discounted_items,
            'total_discount': total_discount,
            'original_total': original_total,
            'final_total': final_total
        })

    except Exception as e:
        print(f"❌ Ошибка расчета скидок: {e}")
        return jsonify({'error': str(e)}), 500

# ========== ЗАПУСК ==========
if __name__ == '__main__':
    print("=" * 50)
    print("🚀 Telegram Shop запущен!")
    print("=" * 50)
    print("🌐 Доступные страницы:")
    print("   Магазин:     http://localhost:5000/")
    print("   Админка:     http://localhost:5000/admin")
    print("   Курьер:      http://localhost:5000/courier")
    print("=" * 50)
    print("📱 Система уведомлений:")
    print("   Статусы будут отправляться в Telegram бота")
    print("=" * 50)
    print("🔑 Данные для входа:")
    print("   Курьеры: courier1 / 123456")
    print("   Курьеры: courier2 / 123456")
    print("   Курьеры: courier3 / 123456")
    print("   Админ:   admin / admin123")
    print("=" * 50)

    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)