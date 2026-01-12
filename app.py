import os
import sqlite3
import json
import uuid
import requests
import secrets
import telebot
import telegram
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
import base64
import math
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
ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', secrets.token_hex(32))
API_KEY = os.environ.get('API_KEY', secrets.token_hex(32))

# ========== КОНФИГУРАЦИЯ ДЛЯ TELEGRAM БОТА ==========
TELEGRAM_BOT_TOKEN = os.getenv('BOT_TOKEN')
TELEGRAM_BOT = telebot.TeleBot(TELEGRAM_BOT_TOKEN) if TELEGRAM_BOT_TOKEN else None

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Создаем папку для загрузок если её нет
UPLOAD_PATH = app.config['UPLOAD_FOLDER']
if not os.path.exists(UPLOAD_PATH):
    os.makedirs(UPLOAD_PATH)
    print(f"📁 Создана папка для загрузок: {UPLOAD_PATH}")


def validate_admin_token():
    """Проверка токена администратора"""
    token = request.headers.get('X-Admin-Token')
    if not token:
        return False
    return secrets.compare_digest(token, ADMIN_TOKEN)


def rate_limit(max_per_minute=60):
    """Декоратор для ограничения запросов"""

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            ip = request.remote_addr

            # Проверка блокировки
            if ip in _ip_blocks and _ip_blocks[ip] > time.time():
                return jsonify({'success': False, 'error': 'Rate limit exceeded'}), 429

            current_time = time.time()

            # Очистка старых запросов
            _request_counts[ip] = [t for t in _request_counts[ip]
                                   if current_time - t < 60]

            # Проверка лимита
            if len(_request_counts[ip]) >= max_per_minute:
                _ip_blocks[ip] = current_time + 300  # Блокировка на 5 минут
                return jsonify({'success': False, 'error': 'Rate limit exceeded'}), 429

            _request_counts[ip].append(current_time)
            return f(*args, **kwargs)

        return decorated_function

    return decorator


def admin_required(f):
    """Декоратор для проверки прав администратора"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not validate_admin_token():
            return jsonify({'success': False, 'error': 'Admin access required'}), 403
        return f(*args, **kwargs)

    return decorated_function


def sanitize_input(data):
    """Очистка входных данных от опасных символов"""
    if isinstance(data, str):
        # Удаляем опасные SQL символы
        data = data.replace("'", "''").replace('"', '""')
        # Удаляем опасные HTML/JS символы
        data = data.replace('<', '&lt;').replace('>', '&gt;')
        data = data.replace('&', '&amp;')
    elif isinstance(data, dict):
        return {k: sanitize_input(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_input(item) for item in data]
    return data


def validate_json_request(f):
    """Валидация JSON запросов"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method in ['POST', 'PUT', 'PATCH']:
            if not request.is_json:
                return jsonify({'success': False, 'error': 'Content-Type must be application/json'}), 400
            try:
                request.get_json()
            except:
                return jsonify({'success': False, 'error': 'Invalid JSON'}), 400
        return f(*args, **kwargs)

    return decorated_function

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


print(f"🔍 Текущий BOT_TOKEN: {os.getenv('BOT_TOKEN')}")

# ========== БАЗА ДАННЫХ ==========
def get_db():
    conn = sqlite3.connect(app.config['DATABASE'])
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        # ПРОВЕРЯЕМ, СУЩЕСТВУЕТ ЛИ УЖЕ БАЗА
        try:
            # Проверяем существование таблицы orders
            cursor.execute("SELECT 1 FROM orders LIMIT 1")
            print("✅ База данных уже существует и содержит данные")
            db.close()
            return
        except sqlite3.OperationalError:
            print("🆕 База данных не найдена или пустая. Создаем структуру...")

        # ========== СНАЧАЛА СОЗДАЕМ ВСЕ ТАБЛИЦЫ С ПРАВИЛЬНОЙ СТРУКТУРОЙ ==========

        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS chat_messages
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           order_id
                           INTEGER
                           NOT
                           NULL,
                           user_id
                           INTEGER
                           NOT
                           NULL,
                           message
                           TEXT
                           NOT
                           NULL,
                           sender_type
                           TEXT
                           CHECK (
                           sender_type
                           IN
                       (
                           'customer',
                           'admin',
                           'courier'
                       )),
                           is_read INTEGER DEFAULT 0,
                           file_url TEXT,
                           file_type TEXT,
                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                           FOREIGN KEY
                       (
                           order_id
                       ) REFERENCES orders
                       (
                           id
                       )
                           )
                       ''')

        # 15. Активные чаты
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS active_chats
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           order_id
                           INTEGER
                           UNIQUE
                           NOT
                           NULL,
                           customer_id
                           INTEGER
                           NOT
                           NULL,
                           admin_id
                           INTEGER,
                           courier_id
                           INTEGER,
                           status
                           TEXT
                           DEFAULT
                           'active',
                           last_message_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP,
                           unread_admin
                           INTEGER
                           DEFAULT
                           0,
                           unread_customer
                           INTEGER
                           DEFAULT
                           0,
                           unread_courier
                           INTEGER
                           DEFAULT
                           0,
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP,
                           FOREIGN
                           KEY
                       (
                           order_id
                       ) REFERENCES orders
                       (
                           id
                       )
                           )
                       ''')

        # 16. Telegram ID курьеров
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS courier_telegram
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           courier_id
                           INTEGER
                           NOT
                           NULL
                           UNIQUE,
                           telegram_id
                           BIGINT
                           NOT
                           NULL
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
                           FOREIGN
                           KEY
                       (
                           courier_id
                       ) REFERENCES couriers
                       (
                           id
                       )
                           )
                       ''')

        # 1. Курьеры
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS couriers
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           username
                           TEXT
                           UNIQUE
                           NOT
                           NULL,
                           password
                           TEXT
                           NOT
                           NULL,
                           full_name
                           TEXT
                           NOT
                           NULL,
                           phone
                           TEXT
                           NOT
                           NULL,
                           vehicle_type
                           TEXT,
                           is_active
                           INTEGER
                           DEFAULT
                           1,
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP
                       )
                       ''')

        # 2. Заказы (сначала, чтобы другие таблицы могли ссылаться)
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS orders
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           user_id
                           INTEGER
                           NOT
                           NULL,
                           username
                           TEXT,
                           items
                           TEXT
                           NOT
                           NULL,
                           total_price
                           REAL
                           NOT
                           NULL,
                           delivery_cost
                           REAL
                           DEFAULT
                           0,
                           status
                           TEXT
                           DEFAULT
                           'pending',
                           delivery_type
                           TEXT,
                           delivery_address
                           TEXT,
                           pickup_point
                           TEXT,
                           payment_method
                           TEXT
                           DEFAULT
                           'cash',
                           recipient_name
                           TEXT,
                           phone_number
                           TEXT,
                           discount_id
                           INTEGER,
                           promo_code_id
                           INTEGER,
                           discount_amount
                           DECIMAL(10,2) DEFAULT 0,
                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                           cash_received DECIMAL(10,2),
                           cash_change DECIMAL(10,2),
                           cash_details TEXT)
                       ''')

        # 3. Назначения заказов
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS order_assignments
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           order_id
                           INTEGER
                           NOT
                           NULL,
                           courier_id
                           INTEGER
                           NOT
                           NULL,
                           assigned_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP,
                           status
                           TEXT
                           DEFAULT
                           'assigned',
                           delivery_started
                           TIMESTAMP,
                           delivered_at
                           TIMESTAMP,
                           photo_proof
                           TEXT,
                           customer_signature
                           TEXT,
                           delivery_notes
                           TEXT,
                           FOREIGN
                           KEY
                       (
                           order_id
                       ) REFERENCES orders
                       (
                           id
                       ),
                           FOREIGN KEY
                       (
                           courier_id
                       ) REFERENCES couriers
                       (
                           id
                       )
                           )
                       ''')

        # 4. Уведомления
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS pending_notifications
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           telegram_id
                           BIGINT
                           NOT
                           NULL,
                           order_id
                           INTEGER
                           NOT
                           NULL,
                           status
                           TEXT
                           NOT
                           NULL,
                           courier_name
                           TEXT,
                           courier_phone
                           TEXT,
                           sent
                           INTEGER
                           DEFAULT
                           0,
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP
                       )
                       ''')

        # 5. СКИДКИ (очень важно - создаем ДО продуктов)
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS discounts
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           name
                           TEXT
                           NOT
                           NULL,
                           discount_type
                           TEXT
                           CHECK (
                           discount_type
                           IN
                       (
                           'percentage',
                           'fixed',
                           'free_delivery',
                           'bogo'
                       )),
                           value DECIMAL
                       (
                           10,
                           2
                       ),
                           min_order_amount DECIMAL
                       (
                           10,
                           2
                       ) DEFAULT 0,
                           apply_to TEXT CHECK
                       (
                           apply_to
                           IN
                       (
                           'all',
                           'category',
                           'product'
                       )),
                           target_category TEXT,
                           target_product_id INTEGER,
                           start_date TIMESTAMP,
                           end_date TIMESTAMP,
                           is_active BOOLEAN DEFAULT 1,
                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                           used_count INTEGER DEFAULT 0
                           )
                       ''')

        # 6. ПРОМОКОДЫ
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS promo_codes
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           code
                           TEXT
                           UNIQUE
                           NOT
                           NULL,
                           discount_type
                           TEXT
                           CHECK (
                           discount_type
                           IN
                       (
                           'percentage',
                           'fixed',
                           'free_delivery',
                           'bogo'
                       )),
                           value DECIMAL
                       (
                           10,
                           2
                       ),
                           usage_limit INTEGER,
                           used_count INTEGER DEFAULT 0,
                           min_order_amount DECIMAL
                       (
                           10,
                           2
                       ) DEFAULT 0,
                           start_date TIMESTAMP,
                           end_date TIMESTAMP,
                           is_active BOOLEAN DEFAULT 1,
                           one_per_customer BOOLEAN DEFAULT 0,
                           exclude_sale_items BOOLEAN DEFAULT 0,
                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                           )
                       ''')

        # 7. КАТЕГОРИИ товаров
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS product_categories
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           name
                           TEXT
                           NOT
                           NULL
                           UNIQUE,
                           parent_id
                           INTEGER,
                           discount_id
                           INTEGER,
                           sort_order
                           INTEGER
                           DEFAULT
                           0,
                           description
                           TEXT,
                           icon
                           TEXT,
                           color
                           TEXT
                           DEFAULT
                           '#667eea',
                           seo_title
                           TEXT,
                           seo_description
                           TEXT,
                           seo_keywords
                           TEXT,
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP,
                           FOREIGN
                           KEY
                       (
                           parent_id
                       ) REFERENCES product_categories
                       (
                           id
                       ),
                           FOREIGN KEY
                       (
                           discount_id
                       ) REFERENCES discounts
                       (
                           id
                       )
                           )
                       ''')

        # 8. ТОВАРЫ (с поддержкой весовых товаров)
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS products
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           name
                           TEXT
                           NOT
                           NULL,
                           description
                           TEXT,
                           price
                           REAL
                           NOT
                           NULL,
                           image_url
                           TEXT,
                           category
                           TEXT,
                           category_id
                           INTEGER,
                           stock
                           INTEGER
                           DEFAULT
                           0,
                           product_type
                           TEXT
                           DEFAULT
                           'piece',
                           unit
                           TEXT
                           DEFAULT
                           'шт',
                           weight_unit
                           TEXT
                           DEFAULT
                           'кг',
                           price_per_kg
                           DECIMAL
                       (
                           10,
                           2
                       ),
                           min_weight DECIMAL
                       (
                           10,
                           3
                       ) DEFAULT 0.1,
                           max_weight DECIMAL
                       (
                           10,
                           3
                       ) DEFAULT 5.0,
                           step_weight DECIMAL
                       (
                           10,
                           3
                       ) DEFAULT 0.1,
                           stock_weight DECIMAL
                       (
                           10,
                           3
                       ),
                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                           )
                       ''')

        # 9. Адреса пользователей
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS user_addresses
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           user_id
                           INTEGER
                           NOT
                           NULL,
                           city
                           TEXT
                           NOT
                           NULL,
                           street
                           TEXT
                           NOT
                           NULL,
                           house
                           TEXT
                           NOT
                           NULL,
                           apartment
                           TEXT,
                           floor
                           TEXT,
                           doorcode
                           TEXT,
                           recipient_name
                           TEXT
                           NOT
                           NULL,
                           phone
                           TEXT,
                           is_default
                           INTEGER
                           DEFAULT
                           0,
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP
                       )
                       ''')

        # 10. Токены для уведомлений
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS user_push_tokens
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           user_id
                           INTEGER
                           NOT
                           NULL,
                           device_type
                           TEXT,
                           token
                           TEXT
                           NOT
                           NULL,
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP
                       )
                       ''')

        # 11. Точки самовывоза
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS pickup_points
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           name
                           TEXT
                           NOT
                           NULL,
                           address
                           TEXT
                           NOT
                           NULL,
                           working_hours
                           TEXT,
                           phone
                           TEXT,
                           latitude
                           REAL,
                           longitude
                           REAL,
                           is_active
                           INTEGER
                           DEFAULT
                           1
                       )
                       ''')

        # 12. Пользователи Telegram
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS telegram_users
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           telegram_id
                           BIGINT
                           UNIQUE
                           NOT
                           NULL,
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

        # 13. Логи уведомлений
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS notification_logs
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           order_id
                           INTEGER
                           NOT
                           NULL,
                           telegram_id
                           BIGINT
                           NOT
                           NULL,
                           status
                           TEXT
                           NOT
                           NULL,
                           message
                           TEXT,
                           sent_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP,
                           success
                           INTEGER
                           DEFAULT
                           0,
                           error_message
                           TEXT
                       )
                       ''')

        # ========== ДОБАВЛЯЕМ ТЕСТОВЫЕ ДАННЫЕ ==========

        # 1. Курьеры
        if cursor.execute("SELECT COUNT(*) FROM couriers").fetchone()[0] == 0:
            cursor.executemany('''
                               INSERT INTO couriers (username, password, full_name, phone, vehicle_type)
                               VALUES (?, ?, ?, ?, ?)
                               ''', [
                                   ('courier1', '123456', 'Иван Курьеров', '+79991112233', 'car'),
                                   ('courier2', '123456', 'Петр Доставкин', '+79992223344', 'bike'),
                                   ('courier3', '123456', 'Сергей Экспрессов', '+79993334455', 'car')
                               ])

        # 2. Категории
        if cursor.execute("SELECT COUNT(*) FROM product_categories").fetchone()[0] == 0:
            test_categories = [
                # id, name, parent_id, discount_id, sort_order, description, icon, color, seo_title, seo_description, seo_keywords
                ('Телефоны', None, None, 1, 'Мобильные телефоны и смартфоны', 'fas fa-mobile-alt', '#4CAF50',
                 'Купить телефон недорого', 'Лучшие телефоны по выгодным ценам', 'телефоны, смартфоны, купить телефон'),
                ('Ноутбуки', None, None, 2, 'Ноутбуки и ультрабуки', 'fas fa-laptop', '#2196F3',
                 'Купить ноутбук', 'Широкий выбор ноутбуков', 'ноутбуки, купить ноутбук, ультрабук'),
                ('Аксессуары', None, None, 3, 'Аксессуары для техники', 'fas fa-headphones', '#FF9800',
                 'Аксессуары для гаджетов', 'Чехлы, наушники, зарядные устройства', 'аксессуары, наушники, чехлы'),
                ('Мониторы', None, None, 4, 'Мониторы и дисплеи', 'fas fa-desktop', '#9C27B0',
                 'Мониторы для игр и работы', 'Игровые и профессиональные мониторы',
                 'мониторы, игровые мониторы, купить монитор'),
                ('Продукты', None, None, 5, 'Продукты питания', 'fas fa-utensils', '#8BC34A',
                 'Продукты питания', 'Свежие продукты', 'продукты, еда, продукты питания'),
                ('Фрукты', 5, None, 1, 'Свежие фрукты', 'fas fa-apple-alt', '#FF9800',
                 'Купить фрукты', 'Свежие фрукты и ягоды', 'фрукты, ягоды, свежие фрукты'),
                ('Овощи', 5, None, 2, 'Свежие овощи', 'fas fa-carrot', '#4CAF50',
                 'Купить овощи', 'Свежие овощи', 'овощи, свежие овощи'),
                ('Мясо', 5, None, 3, 'Мясные продукты', 'fas fa-drumstick-bite', '#F44336',
                 'Купить мясо', 'Свежее мясо', 'мясо, курица, говядина'),
                ('Электроника', None, None, 6, 'Электроника и техника', 'fas fa-plug', '#673AB7',
                 'Электроника', 'Техника и электроника', 'электроника, техника, гаджеты')
            ]
            cursor.executemany('''
                               INSERT INTO product_categories (name, parent_id, discount_id, sort_order, description,
                                                               icon, color, seo_title, seo_description, seo_keywords)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ''', test_categories)

        # 3. Скидки
        if cursor.execute("SELECT COUNT(*) FROM discounts").fetchone()[0] == 0:
            test_discounts = [
                # name, discount_type, value, min_order_amount, apply_to, target_category, target_product_id, start_date, end_date, is_active
                ('Летняя распродажа', 'percentage', 15.00, 1000.00, 'all', None, None,
                 '2025-06-01 00:00:00', '2025-08-31 23:59:59', 1),
                ('Скидка на телефоны', 'percentage', 10.00, 0.00, 'category', 'Телефоны', None,
                 '2025-01-01 00:00:00', '2025-12-31 23:59:59', 1),
                ('Фиксированная скидка', 'fixed', 5000.00, 20000.00, 'all', None, None,
                 None, None, 1),
                ('Бесплатная доставка', 'free_delivery', 0.00, 1000.00, 'all', None, None,
                 '2025-01-01 00:00:00', '2025-12-31 23:59:59', 1),
                ('Скидка на аксессуары', 'percentage', 20.00, 0.00, 'category', 'Аксессуары', None,
                 '2025-01-01 00:00:00', '2025-12-31 23:59:59', 1)
            ]
            cursor.executemany('''
                               INSERT INTO discounts (name, discount_type, value, min_order_amount, apply_to,
                                                      target_category, target_product_id, start_date, end_date,
                                                      is_active)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ''', test_discounts)

        # 4. Промокоды
        if cursor.execute("SELECT COUNT(*) FROM promo_codes").fetchone()[0] == 0:
            test_promo_codes = [
                # code, discount_type, value, usage_limit, used_count, min_order_amount, start_date, end_date, is_active, one_per_customer, exclude_sale_items
                ('SUMMER2025', 'percentage', 20.00, 100, 0, 0.00,
                 '2025-06-01 00:00:00', '2025-08-31 23:59:59', 1, 0, 0),
                ('WELCOME10', 'percentage', 10.00, 1000, 0, 0.00,
                 '2025-01-01 00:00:00', '2025-12-31 23:59:59', 1, 1, 0),
                ('FREESHIP', 'free_delivery', 0.00, 500, 0, 0.00,
                 None, None, 1, 0, 0),
                ('SALE5000', 'fixed', 5000.00, 200, 0, 50000.00,
                 '2025-01-01 00:00:00', '2025-12-31 23:59:59', 1, 0, 1),
                ('NEWYEAR2025', 'percentage', 25.00, 50, 0, 5000.00,
                 '2024-12-20 00:00:00', '2025-01-10 23:59:59', 1, 1, 0)
            ]
            cursor.executemany('''
                               INSERT INTO promo_codes (code, discount_type, value, usage_limit, used_count,
                                                        min_order_amount, start_date, end_date, is_active,
                                                        one_per_customer, exclude_sale_items)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ''', test_promo_codes)

        # 5. Товары (штучные и весовые)
        if cursor.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            test_products = [
                # ШТУЧНЫЕ ТОВАРЫ
                # name, description, price, image_url, category, stock, product_type, unit, weight_unit, price_per_kg, min_weight, max_weight, step_weight, stock_weight
                ('Наушники Sony WH-1000XM5', 'Беспровные с шумоподавлением, 30 часов работы', 34999,
                 'https://sony.scene7.com/is/image/sonyglobalsolutions/WH-1000XM5-B_primary-image',
                 'Аксессуары', 20, 'piece', 'шт', 'шт', 0, 0, 0, 0, 0),
                ('MacBook Air M2', 'Ультратонкий ноутбук Apple, 13.6 дюймов', 129999,
                 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/macbook-air-midnight-select-20220606',
                 'Ноутбуки', 8, 'piece', 'шт', 'шт', 0, 0, 0, 0, 0),

                # ВЕСОВЫЕ ТОВАРЫ
                ('Яблоки Голден', 'Сладкие желтые яблоки', 0,
                 'https://cdn.pixabay.com/photo/2014/02/01/17/28/apple-256261_1280.jpg',
                 'Фрукты', 0, 'weight', 'кг', 'кг', 199.90, 0.1, 5.0, 0.1, 50.0),
                ('Бананы', 'Свежие спелые бананы', 0,
                 'https://cdn.pixabay.com/photo/2016/01/03/17/59/bananas-1119790_1280.jpg',
                 'Фрукты', 0, 'weight', 'кг', 'кг', 129.90, 0.1, 3.0, 0.1, 30.0),
                ('Помидоры', 'Свежие красные помидоры', 0,
                 'https://cdn.pixabay.com/photo/2014/04/10/11/24/tomatoes-320860_1280.jpg',
                 'Овощи', 0, 'weight', 'кг', 'кг', 189.90, 0.1, 5.0, 0.1, 40.0)
            ]

            cursor.executemany('''
                               INSERT INTO products (name, description, price, image_url, category, stock,
                                                     product_type, unit, weight_unit, price_per_kg,
                                                     min_weight, max_weight, step_weight, stock_weight)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ''', test_products)

        # 6. Точки самовывоза
        if cursor.execute("SELECT COUNT(*) FROM pickup_points").fetchone()[0] == 0:
            pickup_points = [
                ('Смофф Щербинка', 'ул. Любучанский переулок 1к3 ', '09:00-22:00', '+7 (929) 544-95-88', None, None)
            ]
            cursor.executemany('''
                               INSERT INTO pickup_points (name, address, working_hours, phone, latitude, longitude)
                               VALUES (?, ?, ?, ?, ?, ?)
                               ''', pickup_points)

        # ========== ОБНОВЛЯЕМ СВЯЗИ МЕЖДУ ТАБЛИЦАМИ ==========

        # Обновляем товары, чтобы связать их с категориями
        categories_map = {
            'Телефоны': 1,
            'Ноутбуки': 2,
            'Аксессуары': 3,
            'Мониторы': 4,
            'Фрукты': 6,
            'Овощи': 7,
            'Мясо': 8
        }

        for category_name, category_id in categories_map.items():
            cursor.execute(
                'UPDATE products SET category_id = ? WHERE category = ?',
                (category_id, category_name)
            )

        db.commit()
        db.close()

init_db()


def init_security():
    """Инициализация таблиц безопасности"""
    db = get_db()
    cursor = db.cursor()

    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS security_logs
                   (
                       id
                       INTEGER
                       PRIMARY
                       KEY
                       AUTOINCREMENT,
                       ip_address
                       TEXT
                       NOT
                       NULL,
                       endpoint
                       TEXT
                       NOT
                       NULL,
                       method
                       TEXT
                       NOT
                       NULL,
                       user_agent
                       TEXT,
                       created_at
                       TIMESTAMP
                       DEFAULT
                       CURRENT_TIMESTAMP
                   )
                   ''')

    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS failed_logins
                   (
                       id
                       INTEGER
                       PRIMARY
                       KEY
                       AUTOINCREMENT,
                       username
                       TEXT,
                       ip_address
                       TEXT
                       NOT
                       NULL,
                       attempt_time
                       TIMESTAMP
                       DEFAULT
                       CURRENT_TIMESTAMP
                   )
                   ''')

    db.commit()
    db.close()
    print("✅ Таблицы безопасности созданы")


# Вызовите после init_db()
init_security()


# ========== НОВЫЕ ФУНКЦИИ ДЛЯ УВЕДОМЛЕНИЙ ==========
@app.before_request
def security_middleware():
    """Проверки безопасности перед каждым запросом"""
    # Блокировка опасных User-Agent
    user_agent = request.headers.get('User-Agent', '')
    if any(x in user_agent.lower() for x in ['sqlmap', 'nikto', 'hydra', 'metasploit']):
        return jsonify({'success': False, 'error': 'Access denied'}), 403

    # Защита от базовых атак
    path = request.path.lower()
    if any(x in path for x in ['/php', '/admin/', '/wp-', '/cgi-bin', '/.git', '/.env']):
        return jsonify({'success': False, 'error': 'Not found'}), 404

    # Логирование запросов к админке
    if '/api/admin/' in request.path:
        db = get_db()
        try:
            db.execute('''
                       INSERT INTO security_logs (ip_address, endpoint, method, user_agent)
                       VALUES (?, ?, ?, ?)
                       ''', (request.remote_addr, request.path, request.method, user_agent))
            db.commit()
        except:
            pass
        finally:
            db.close()




@app.route('/api/bot/get-orders/<int:telegram_id>', methods=['GET'])
def api_bot_get_orders(telegram_id):
    """API для получения заказов пользователя (для бота)"""
    db = get_db()
    try:
        orders = db.execute('''
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
                            WHERE o.user_id = ?
                            ORDER BY o.created_at DESC LIMIT 10
                            ''', (telegram_id,)).fetchall()

        orders_list = []
        for order in orders:
            order_dict = dict(order)

            # Парсим адрес для красивого отображения
            if order_dict.get('delivery_address'):
                try:
                    addr_data = json.loads(order_dict['delivery_address'])
                    if isinstance(addr_data, dict):
                        address_parts = []
                        if addr_data.get('city'):
                            address_parts.append(addr_data['city'])
                        if addr_data.get('street'):
                            address_parts.append(f"ул. {addr_data['street']}")
                        if addr_data.get('house'):
                            address_parts.append(f"д. {addr_data['house']}")
                        if addr_data.get('apartment'):
                            address_parts.append(f"кв. {addr_data['apartment']}")
                        order_dict['address_formatted'] = ', '.join(address_parts)
                        order_dict['address_object'] = addr_data
                except:
                    order_dict['address_formatted'] = order_dict.get('delivery_address', 'Адрес не указан')
                    order_dict['address_object'] = {}
            else:
                order_dict['address_formatted'] = 'Адрес не указан'
                order_dict['address_object'] = {}

            orders_list.append(order_dict)

        return jsonify({'success': True, 'orders': orders_list})

    except Exception as e:
        print(f"❌ Ошибка получения заказов для бота: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/bot/get-order/<int:order_id>/<int:telegram_id>', methods=['GET'])
def api_bot_get_order_detail(order_id, telegram_id):
    """API для получения деталей конкретного заказа (для бота)"""
    db = get_db()
    try:
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
                             AND o.user_id = ?
                           ''', (order_id, telegram_id)).fetchone()

        if not order:
            return jsonify({'success': False, 'error': 'Заказ не найден'}), 404

        order_dict = dict(order)

        # Парсим items
        try:
            order_dict['items_list'] = json.loads(order_dict['items'])
        except:
            order_dict['items_list'] = []

        # Парсим адрес
        if order_dict.get('delivery_address'):
            try:
                order_dict['delivery_address_obj'] = json.loads(order_dict['delivery_address'])
            except:
                order_dict['delivery_address_obj'] = {}

        return jsonify({'success': True, 'order': order_dict})

    except Exception as e:
        print(f"❌ Ошибка получения деталей заказа: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


def send_order_details_notification(telegram_id, order_id, items, status, total_amount, delivery_type,
                                    courier_name=None, courier_phone=None):
    """Отправить уведомление с корректными статусами"""
    try:
        BOT_TOKEN = os.getenv('BOT_TOKEN')
        WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://telegram-shop-full.onrender.com/')

        if not telegram_id or telegram_id == 0:
            print(f"⚠️ Неверный telegram_id: {telegram_id}")
            return False

        if not BOT_TOKEN:
            print(f"⚠️ BOT_TOKEN не установлен")
            return False

        # Корректные тексты статусов для уведомлений
        status_texts = {
            'created': '🔄 *СОЗДАН И ОЖИДАЕТ ОБРАБОТКИ*',
            'assigned': '👤 *КУРЬЕР НАЗНАЧЕН*',
            'processing': '⚙️ *В ОБРАБОТКЕ*',
            'picked_up': '📦 *КУРЬЕР ЗАБРАЛ ЗАКАЗ И УЖЕ МЧИТСЯ К ВАМ*',
            'delivering': '🚚 *В ПУТИ К ВАМ*',
            'delivered': '✅ *ДОСТАВЛЕН*',
            'completed': '🎉 *ЗАКАЗ ЗАВЕРШЕН*',
            'pending': '⏳ *ОЖИДАЕТ ОБРАБОТКИ*'
        }

        status_text = status_texts.get(status, f"📊 *{status.upper()}*")

        # Безопасное форматирование товаров
        items_text = "📦 *СОСТАВ ЗАКАЗА:*\n"
        for item in items:
            name = item.get('name', 'Товар')
            quantity = item.get('quantity', 1)
            price = item.get('price', 0)

            # Безопасное имя (экранируем спецсимволы Markdown)
            safe_name = name.replace('*', '\\*').replace('_', '\\_').replace('`', '\\`').replace('[', '\\[').replace(
                ']', '\\]')

            if item.get('is_weight') and item.get('weight'):
                items_text += f"• *{safe_name}* ({quantity} шт, {item['weight']} кг) - *{price} ₽*\n"
            else:
                items_text += f"• *{safe_name}* × {quantity} шт - *{price} ₽*\n"

        # Добавляем информацию о курьере если есть
        courier_info = ""
        if courier_name:
            # Экранируем имя курьера
            safe_courier_name = courier_name.replace('*', '\\*').replace('_', '\\_').replace('`', '\\`')
            courier_info = f"\n👤 *КУРЬЕР:* {safe_courier_name}"
            if courier_phone:
                courier_info += f"\n📱 *ТЕЛЕФОН:* {courier_phone}"

        # Добавляем дополнительный текст для статуса picked_up
        extra_info = ""
        if status == 'picked_up':
            extra_info = "\n\n⚡ *Курьер уже в пути! Приготовьтесь к встрече.*"

        # Формируем сообщение
        message = f"""🎯 *ВАШ ЗАКАЗ #{order_id}*

{status_text}{extra_info}

{items_text}
━━━━━━━━━━━━━━━━━━━━
💰 *ИТОГО: {total_amount} ₽*
📦 *ТИП ДОСТАВКИ:* {delivery_type.upper() if delivery_type else 'НЕ УКАЗАН'}{courier_info}

⏳ *Следующее обновление будет при изменении статуса*"""

        # URL для веб-приложения
        webapp_url = f"{WEBAPP_URL.rstrip('/')}/webapp?user_id={telegram_id}"

        # Создаем кнопки (inline клавиатура)
        keyboard = {
            "inline_keyboard": [
                [
                    {
                        "text": "🛒 ОТКРЫТЬ МАГАЗИН",
                        "web_app": {"url": webapp_url}
                    }
                ],
                [
                    {"text": "📦 МОИ ЗАКАЗЫ", "callback_data": "my_orders"},
                    {"text": "🚚 ОТСЛЕДИТЬ", "callback_data": f"track_{order_id}"}
                ]
            ]
        }

        # Отправляем
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': int(telegram_id),
            'text': message,
            'parse_mode': 'Markdown',
            'disable_web_page_preview': True,
            'reply_markup': keyboard
        }

        response = requests.post(url, json=data, timeout=10)

        if response.status_code == 200:
            print(f"✅ Уведомление отправлено пользователю {telegram_id} (статус: {status})")
            return True
        else:
            print(f"❌ Ошибка отправки: {response.text}")
            # Пробуем без форматирования
            try:
                # Простое сообщение без Markdown
                simple_message = f"""ВАШ ЗАКАЗ #{order_id}

{status_text.replace('*', '')}{extra_info.replace('*', '')}

СОСТАВ ЗАКАЗА:"""

                for item in items:
                    name = item.get('name', 'Товар')
                    quantity = item.get('quantity', 1)
                    price = item.get('price', 0)

                    if item.get('is_weight') and item.get('weight'):
                        simple_message += f"\n• {name} ({quantity} шт, {item['weight']} кг) - {price} ₽"
                    else:
                        simple_message += f"\n• {name} × {quantity} шт - {price} ₽"

                simple_message += f"\n\n━━━━━━━━━━━━━━━━━━━━"
                simple_message += f"\nИТОГО: {total_amount} ₽"
                simple_message += f"\nТИП ДОСТАВКИ: {delivery_type.upper() if delivery_type else 'НЕ УКАЗАН'}"

                if courier_name:
                    simple_message += f"\nКУРЬЕР: {courier_name}"
                    if courier_phone:
                        simple_message += f"\nТЕЛЕФОН: {courier_phone}"

                simple_message += f"\n\nСледующее обновление будет при изменении статуса"

                data['text'] = simple_message
                data.pop('parse_mode', None)

                response = requests.post(url, json=data, timeout=10)
                return response.status_code == 200

            except Exception as e2:
                print(f"❌ Ошибка при попытке простого сообщения: {e2}")
                return False

    except Exception as e:
        print(f"❌ Ошибка отправки уведомления: {e}")
        return False


def send_chat_notification_to_telegram(telegram_id, order_id, message, sender_name, is_admin=False):
    """Отправить уведомление о новом сообщении в Telegram"""
    try:
        BOT_TOKEN = os.getenv('BOT_TOKEN')
        if not BOT_TOKEN or not telegram_id:
            return False

        # Определяем тип отправителя
        if is_admin:
            sender_prefix = "👨‍💼 АДМИНИСТРАТОР"
        else:
            sender_prefix = "👤 КЛИЕНТ"

        # Обрезаем длинное сообщение
        short_message = message[:200] + "..." if len(message) > 200 else message

        # Формируем сообщение
        text = f"💬 *НОВОЕ СООБЩЕНИЕ В ЧАТЕ*\n\n"
        text += f"📦 *Заказ:* #{order_id}\n"
        text += f"{sender_prefix} ({sender_name}):\n"
        text += f"_{short_message}_\n\n"
        text += f"📝 *Ответить:* /chat_{order_id}"

        # Кнопки для быстрого ответа
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "💬 Ответить", "callback_data": f"chat_reply_{order_id}"},
                    {"text": "📦 Просмотр заказа", "callback_data": f"view_order_{order_id}"}
                ]
            ]
        }

        # Отправляем сообщение
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': int(telegram_id),
            'text': text,
            'parse_mode': 'Markdown',
            'reply_markup': json.dumps(keyboard)
        }

        response = requests.post(url, json=data, timeout=10)
        if response.status_code == 200:
            print(f"✅ Уведомление чата отправлено пользователю {telegram_id}")
            return True
        else:
            print(f"❌ Ошибка отправки уведомления чата: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Ошибка отправки уведомления чата: {e}")
        return False


@app.route('/api/chat/send', methods=['POST'])
def api_send_chat_message():
    """Отправить сообщение в чат"""
    db = get_db()
    try:
        data = request.json
        order_id = data.get('order_id')
        user_id = data.get('user_id')
        message = data.get('message', '').strip()
        sender_type = data.get('sender_type', 'customer')
        file_url = data.get('file_url')
        file_type = data.get('file_type')

        if not order_id or not user_id or not message:
            return jsonify({'success': False, 'error': 'Не указаны обязательные поля'}), 400

        # Получаем информацию о заказе
        order = db.execute('SELECT * FROM orders WHERE id = ?', (order_id,)).fetchone()
        if not order:
            return jsonify({'success': False, 'error': 'Заказ не найден'}), 404

        order_dict = dict(order)

        # Определяем отправителя
        is_admin = sender_type == 'admin'
        sender_name = "Администратор" if is_admin else order_dict.get('username', 'Клиент')

        # Сохраняем сообщение в БД
        cursor = db.execute('''
                            INSERT INTO chat_messages (order_id, user_id, message, sender_type, file_url, file_type)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ''', (order_id, user_id, message, sender_type, file_url, file_type))

        message_id = cursor.lastrowid

        # Обновляем или создаем активный чат
        chat = db.execute('SELECT * FROM active_chats WHERE order_id = ?', (order_id,)).fetchone()

        if not chat:
            # Создаем новый активный чат
            db.execute('''
                       INSERT INTO active_chats (order_id, customer_id, last_message_at)
                       VALUES (?, ?, CURRENT_TIMESTAMP)
                       ''', (order_id, order_dict['user_id']))
        else:
            # Обновляем счетчик непрочитанных
            if sender_type == 'customer':
                db.execute('''
                           UPDATE active_chats
                           SET last_message_at = CURRENT_TIMESTAMP,
                               unread_admin    = unread_admin + 1
                           WHERE order_id = ?
                           ''', (order_id,))
            elif sender_type == 'admin':
                db.execute('''
                           UPDATE active_chats
                           SET last_message_at = CURRENT_TIMESTAMP,
                               unread_customer = unread_customer + 1
                           WHERE order_id = ?
                           ''', (order_id,))

        db.commit()

        # Отправляем уведомление получателю
        if sender_type == 'customer':
            # Клиент написал - уведомляем администратора
            admin_telegram_id = os.getenv('ADMIN_IDS')
            if admin_telegram_id:
                send_chat_notification_to_telegram(
                    int(admin_telegram_id),
                    order_id,
                    message,
                    sender_name,
                    is_admin=False
                )
        elif sender_type == 'admin':
            # Администратор написал - уведомляем клиента
            send_chat_notification_to_telegram(
                order_dict['user_id'],
                order_id,
                message,
                sender_name,
                is_admin=True
            )

        return jsonify({
            'success': True,
            'message_id': message_id,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })

    except Exception as e:
        print(f"❌ Ошибка отправки сообщения чата: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/couriers', methods=['GET', 'POST', 'PUT', 'DELETE'])
@admin_required
@rate_limit(max_per_minute=30)
@validate_json_request
def api_admin_couriers():
    """Управление курьерами - получение списка, создание, обновление, удаление"""
    db = get_db()
    try:
        if request.method == 'GET':
            # Получить всех курьеров
            couriers = db.execute('''
                                  SELECT c.*,
                                         CASE WHEN ct.telegram_id IS NOT NULL THEN 1 ELSE 0 END as has_telegram,
                                         (SELECT COUNT(*)
                                          FROM order_assignments oa
                                          WHERE oa.courier_id = c.id
                                            AND oa.status != 'delivered') as active_orders
                                  FROM couriers c
                                      LEFT JOIN courier_telegram ct
                                  ON c.id = ct.courier_id
                                  ORDER BY c.is_active DESC, c.full_name
                                  ''').fetchall()

            couriers_list = []
            for courier in couriers:
                courier_dict = dict(courier)
                couriers_list.append(courier_dict)

            return jsonify({
                'success': True,
                'couriers': couriers_list
            })

        elif request.method == 'POST':
            # Создать нового курьера
            data = request.json

            # Валидация
            if not data.get('username'):
                return jsonify({'success': False, 'error': 'Введите логин курьера'}), 400
            if not data.get('password'):
                return jsonify({'success': False, 'error': 'Введите пароль курьера'}), 400
            if not data.get('full_name'):
                return jsonify({'success': False, 'error': 'Введите ФИО курьера'}), 400
            if not data.get('phone'):
                return jsonify({'success': False, 'error': 'Введите телефон курьера'}), 400

            # Проверяем уникальность логина
            existing = db.execute('SELECT id FROM couriers WHERE username = ?',
                                  (data['username'],)).fetchone()
            if existing:
                return jsonify({'success': False, 'error': 'Курьер с таким логином уже существует'}), 400

            # Создаем курьера
            cursor = db.execute('''
                                INSERT INTO couriers (username, password, full_name, phone, vehicle_type, is_active)
                                VALUES (?, ?, ?, ?, ?, ?)
                                ''', (
                                    data['username'],
                                    data['password'],
                                    data['full_name'],
                                    data['phone'],
                                    data.get('vehicle_type', 'car'),
                                    data.get('is_active', True)
                                ))

            courier_id = cursor.lastrowid
            db.commit()

            return jsonify({
                'success': True,
                'id': courier_id,
                'message': 'Курьер успешно создан'
            })

        elif request.method == 'PUT':
            # Обновить курьера
            courier_id = request.args.get('id', type=int)
            data = request.json

            if not courier_id:
                return jsonify({'success': False, 'error': 'Не указан ID курьера'}), 400

            # Проверяем существование курьера
            courier = db.execute('SELECT id FROM couriers WHERE id = ?', (courier_id,)).fetchone()
            if not courier:
                return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

            # Обновляем данные
            db.execute('''
                       UPDATE couriers
                       SET full_name    = ?,
                           phone        = ?,
                           vehicle_type = ?,
                           is_active    = ?
                       WHERE id = ?
                       ''', (
                           data.get('full_name', ''),
                           data.get('phone', ''),
                           data.get('vehicle_type', 'car'),
                           data.get('is_active', True),
                           courier_id
                       ))

            db.commit()

            return jsonify({
                'success': True,
                'message': 'Курьер успешно обновлен'
            })

        elif request.method == 'DELETE':
            # Удалить курьера
            courier_id = request.args.get('id', type=int)

            if not courier_id:
                return jsonify({'success': False, 'error': 'Не указан ID курьера'}), 400

            # Проверяем существование курьера
            courier = db.execute('SELECT id FROM couriers WHERE id = ?', (courier_id,)).fetchone()
            if not courier:
                return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

            # Проверяем, есть ли активные заказы у курьера
            active_orders = db.execute('''
                                       SELECT COUNT(*)
                                       FROM order_assignments
                                       WHERE courier_id = ?
                                         AND status != 'delivered'
                                       ''', (courier_id,)).fetchone()[0]

            if active_orders > 0:
                return jsonify({
                    'success': False,
                    'error': 'Нельзя удалить курьера с активными заказами'
                }), 400

            # Удаляем курьера
            db.execute('DELETE FROM couriers WHERE id = ?', (courier_id,))
            db.execute('DELETE FROM courier_telegram WHERE courier_id = ?', (courier_id,))
            db.commit()

            return jsonify({
                'success': True,
                'message': 'Курьер успешно удален'
            })

    except Exception as e:
        print(f"❌ Ошибка управления курьерами: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/couriers/<int:courier_id>', methods=['GET'])
def api_admin_courier_detail(courier_id):
    """Получить детальную информацию о курьере"""
    db = get_db()
    try:
        courier = db.execute('''
                             SELECT c.*, ct.telegram_id, ct.username as telegram_username
                             FROM couriers c
                                      LEFT JOIN courier_telegram ct ON c.id = ct.courier_id
                             WHERE c.id = ?
                             ''', (courier_id,)).fetchone()

        if not courier:
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        # Получаем статистику курьера
        stats = db.execute('''
                           SELECT COUNT(CASE WHEN oa.status = 'delivered' THEN 1 END)  as completed_orders,
                                  COUNT(CASE WHEN oa.status != 'delivered' THEN 1 END) as active_orders,
                                  COALESCE(SUM(o.total_price), 0)                      as total_revenue
                           FROM order_assignments oa
                                    LEFT JOIN orders o ON oa.order_id = o.id
                           WHERE oa.courier_id = ?
                           ''', (courier_id,)).fetchone()

        courier_dict = dict(courier)
        courier_dict['stats'] = dict(stats) if stats else {
            'completed_orders': 0,
            'active_orders': 0,
            'total_revenue': 0
        }

        return jsonify({
            'success': True,
            'courier': courier_dict
        })

    except Exception as e:
        print(f"❌ Ошибка получения информации о курьере: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/courier/profile', methods=['GET'])
def api_courier_profile():
    """Получить профиль курьера"""
    db = get_db()
    try:
        courier_id = request.args.get('courier_id', type=int)

        if not courier_id:
            return jsonify({'success': False, 'error': 'Не указан ID курьера'}), 400

        courier = db.execute('''
                             SELECT id, username, full_name, phone, vehicle_type, is_active, created_at
                             FROM couriers
                             WHERE id = ?
                             ''', (courier_id,)).fetchone()

        if not courier:
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        return jsonify({
            'success': True,
            'profile': dict(courier)
        })

    except Exception as e:
        print(f"❌ Ошибка получения профиля курьера: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/chat/messages', methods=['GET'])
def api_get_chat_messages():
    """Получить сообщения чата для заказа"""
    db = get_db()
    try:
        order_id = request.args.get('order_id', type=int)
        user_id = request.args.get('user_id', type=int)

        if not order_id:
            return jsonify({'success': False, 'error': 'Не указан ID заказа'}), 400

        # Получаем сообщения
        messages = db.execute('''
                              SELECT cm.*,
                                     CASE
                                         WHEN cm.sender_type = 'admin' THEN 'Администратор'
                                         WHEN cm.sender_type = 'courier' THEN 'Курьер'
                                         ELSE o.username
                                         END as sender_name
                              FROM chat_messages cm
                                       LEFT JOIN orders o ON cm.order_id = o.id
                              WHERE cm.order_id = ?
                              ORDER BY cm.created_at ASC
                              ''', (order_id,)).fetchall()

        # Помечаем сообщения как прочитанные
        if user_id:
            db.execute('''
                       UPDATE chat_messages
                       SET is_read = 1
                       WHERE order_id = ?
                         AND sender_type != 'customer'
                       ''', (order_id,))

            # Сбрасываем счетчик непрочитанных для этого пользователя
            if user_id == db.execute('SELECT customer_id FROM active_chats WHERE order_id = ?', (order_id,)).fetchone()[
                'customer_id']:
                db.execute('UPDATE active_chats SET unread_customer = 0 WHERE order_id = ?', (order_id,))

        db.commit()

        messages_list = []
        for msg in messages:
            msg_dict = dict(msg)
            # Форматируем дату
            if msg_dict.get('created_at'):
                try:
                    dt = datetime.strptime(msg_dict['created_at'], '%Y-%m-%d %H:%M:%S')
                    msg_dict['time_formatted'] = dt.strftime('%H:%M')
                    msg_dict['date_formatted'] = dt.strftime('%d.%m.%Y')
                except:
                    msg_dict['time_formatted'] = msg_dict['created_at'][11:16]
                    msg_dict['date_formatted'] = msg_dict['created_at'][:10]

            messages_list.append(msg_dict)

        return jsonify({
            'success': True,
            'messages': messages_list,
            'order_id': order_id
        })

    except Exception as e:
        print(f"❌ Ошибка получения сообщений чата: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


def send_courier_order_notification(order_id):
    """Отправить уведомление всем курьерам о новом заказе"""
    try:
        BOT_TOKEN = os.getenv('BOT_TOKEN')
        if not BOT_TOKEN:
            print("⚠️ BOT_TOKEN не установлен")
            return False

        db = get_db()

        # Получаем информацию о заказе
        order = db.execute('''
                           SELECT o.*,
                                  json_extract(o.delivery_address, '$.city')      as city,
                                  json_extract(o.delivery_address, '$.street')    as street,
                                  json_extract(o.delivery_address, '$.house')     as house,
                                  json_extract(o.delivery_address, '$.apartment') as apartment
                           FROM orders o
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

        if not order:
            print(f"⚠️ Заказ #{order_id} не найден")
            return False

        order_dict = dict(order)

        # Форматируем адрес
        address_parts = []
        if order_dict.get('city'):
            address_parts.append(order_dict['city'])
        if order_dict.get('street'):
            address_parts.append(f"ул. {order_dict['street']}")
        if order_dict.get('house'):
            address_parts.append(f"д. {order_dict['house']}")
        if order_dict.get('apartment'):
            address_parts.append(f"кв. {order_dict['apartment']}")

        address = ', '.join(address_parts) if address_parts else "Адрес не указан"

        # Парсим товары
        items_list = []
        total_items = 0
        if order_dict.get('items'):
            try:
                items_list = json.loads(order_dict['items'])
                total_items = sum(item.get('quantity', 1) for item in items_list)
            except:
                pass

        # Получаем всех курьеров с telegram_id
        couriers = db.execute('''
                              SELECT c.id, c.full_name, ct.telegram_id
                              FROM couriers c
                                       LEFT JOIN courier_telegram ct ON c.id = ct.courier_id
                              WHERE c.is_active = 1
                                AND ct.telegram_id IS NOT NULL
                              ''').fetchall()

        if not couriers:
            print("⚠️ Нет курьеров с Telegram ID")
            return False

        # Формируем сообщение для курьера
        text = f"🚚 *НОВЫЙ ЗАКАЗ ДЛЯ ДОСТАВКИ*\n\n"
        text += f"📦 *Заказ:* #{order_id}\n"
        text += f"👤 *Клиент:* {order_dict.get('recipient_name', order_dict.get('username', 'Клиент'))}\n"
        text += f"📱 *Телефон:* {order_dict.get('phone_number', 'Не указан')}\n"
        text += f"📍 *Адрес:* {address}\n"
        text += f"📊 *Товаров:* {total_items} шт\n"
        text += f"💰 *Сумма:* {order_dict.get('total_price', 0)} ₽\n"

        if order_dict.get('cash_received', 0) > 0:
            text += f"💵 *Оплата наличными:* {order_dict['cash_received']} ₽\n"
            if order_dict.get('cash_change', 0) > 0:
                text += f"💰 *Сдача:* {order_dict['cash_change']} ₽\n"

        text += f"\n⏰ *Создан:* {order_dict.get('created_at', '')[:16]}"

        # Кнопки для курьера
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "✅ ВЗЯТЬ ЗАКАЗ", "callback_data": f"courier_take_{order_id}"},
                    {"text": "🚀 КУРЬЕР ПАНЕЛЬ", "callback_data": "courier_panel"}
                ]
            ]
        }

        # Отправляем сообщение всем курьерам
        success_count = 0
        for courier in couriers:
            try:
                telegram_id = courier['telegram_id']

                url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
                data = {
                    'chat_id': int(telegram_id),
                    'text': text,
                    'parse_mode': 'Markdown',
                    'reply_markup': json.dumps(keyboard)
                }

                response = requests.post(url, json=data, timeout=10)
                if response.status_code == 200:
                    print(f"✅ Уведомление отправлено курьеру {courier['full_name']} ({telegram_id})")
                    success_count += 1
                else:
                    print(f"❌ Ошибка отправки курьеру {courier['full_name']}: {response.text}")

            except Exception as e:
                print(f"❌ Ошибка отправки курьеру {courier['full_name']}: {e}")

        print(f"📨 Уведомления отправлены: {success_count}/{len(couriers)} курьерам")
        return success_count > 0

    except Exception as e:
        print(f"❌ Ошибка отправки уведомлений курьерам: {e}")
        return False
    finally:
        if 'db' in locals():
            db.close()


@app.route('/api/courier/register-telegram', methods=['POST'])
def api_register_courier_telegram():
    """Зарегистрировать Telegram ID курьера"""
    db = get_db()
    try:
        data = request.json
        courier_id = data.get('courier_id')
        telegram_id = data.get('telegram_id')
        username = data.get('username')
        first_name = data.get('first_name')
        last_name = data.get('last_name')

        if not courier_id or not telegram_id:
            return jsonify({'success': False, 'error': 'Не указаны обязательные поля'}), 400

        # Проверяем существование курьера
        courier = db.execute('SELECT id FROM couriers WHERE id = ?', (courier_id,)).fetchone()
        if not courier:
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        # Регистрируем или обновляем Telegram ID
        existing = db.execute('SELECT id FROM courier_telegram WHERE courier_id = ? OR telegram_id = ?',
                              (courier_id, telegram_id)).fetchone()

        if existing:
            db.execute('''
                       UPDATE courier_telegram
                       SET telegram_id = ?,
                           username    = ?,
                           first_name  = ?,
                           last_name   = ?
                       WHERE id = ?
                       ''', (telegram_id, username, first_name, last_name, existing['id']))
        else:
            db.execute('''
                       INSERT INTO courier_telegram (courier_id, telegram_id, username, first_name, last_name)
                       VALUES (?, ?, ?, ?, ?)
                       ''', (courier_id, telegram_id, username, first_name, last_name))

        db.commit()

        return jsonify({
            'success': True,
            'message': 'Telegram ID зарегистрирован'
        })

    except Exception as e:
        print(f"❌ Ошибка регистрации Telegram ID курьера: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/courier/telegram/<int:courier_id>', methods=['GET'])
def api_get_courier_telegram(courier_id):
    """Получить Telegram ID курьера"""
    db = get_db()
    try:
        courier = db.execute('''
                             SELECT ct.*, c.full_name, c.phone
                             FROM courier_telegram ct
                                      JOIN couriers c ON ct.courier_id = c.id
                             WHERE ct.courier_id = ?
                             ''', (courier_id,)).fetchone()

        if not courier:
            return jsonify({'success': False, 'error': 'Telegram ID не найден'}), 404

        return jsonify({
            'success': True,
            'telegram_info': dict(courier)
        })

    except Exception as e:
        print(f"❌ Ошибка получения Telegram ID курьера: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

def send_order_notification(order_id, status, courier_id=None):
    """Отправка уведомлений покупателю через Telegram бота - ИСПРАВЛЕННАЯ"""
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

        # Парсим items для детализированного уведомления
        items_list = []
        if order_dict.get('items'):
            try:
                items_list = json.loads(order_dict['items'])
            except:
                items_list = []

        total_amount = order_dict.get('total_price', 0)
        delivery_type = order_dict.get('delivery_type', 'courier')

        # Отправляем уведомление
        status_sent = send_order_details_notification(
            telegram_id=telegram_id,
            order_id=order_id,
            items=items_list,
            status=status,
            total_amount=total_amount,
            delivery_type=delivery_type,
            courier_name=courier_name,
            courier_phone=courier_phone
        )

        if status_sent:
            print(f"✅ Уведомление для заказа #{order_id} отправлено (статус: {status})")
        else:
            print(f"⚠️ Уведомление для заказа #{order_id} не отправлено")

        return status_sent

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


@app.route('/api/products')
def get_products():
    """Получить товары для клиентского магазина"""
    db = get_db()
    try:
        # Получаем параметр категории из запроса
        category = request.args.get('category', 'all')

        # Базовый запрос
        query = '''
                SELECT id, \
                       name, \
                       description, \
                       CASE \
                           WHEN product_type = 'weight' AND price_per_kg > 0 THEN price_per_kg \
                           ELSE price \
                           END as price, \
                       CASE \
                           WHEN image_url IS NOT NULL AND image_url != '' THEN image_url \
                           ELSE 'https://via.placeholder.com/300x200?text=No+Image' \
                           END as image_url, \
                       category, \
                       CASE \
                           WHEN product_type = 'weight' AND stock_weight > 0 THEN stock_weight \
                           ELSE stock \
                           END as stock, \
                       product_type, \
                       unit, \
                       weight_unit, \
                       price_per_kg, \
                       min_weight, \
                       max_weight, \
                       step_weight, \
                       stock_weight
                FROM products
                WHERE (
                          (product_type = 'piece' AND stock > 0)
                              OR
                          (product_type = 'weight' AND stock_weight > 0)
                          ) \
                '''

        # Добавляем фильтр по категории если нужно
        params = []
        if category and category != 'all':
            query += ' AND category = ?'
            params.append(category)

        # Сортируем по дате добавления
        query += ' ORDER BY created_at DESC'

        products = db.execute(query, params).fetchall()

        result = []
        for product in products:
            product_dict = dict(product)

            # Для весовых товаров устанавливаем правильные единицы измерения
            if product_dict.get('product_type') == 'weight':
                # Устанавливаем display_price как price_per_kg для отображения
                product_dict['display_price'] = product_dict.get('price_per_kg', product_dict['price'])
                # Устанавливаем display_stock как stock_weight
                product_dict['display_stock'] = product_dict.get('stock_weight', 0)
                # Для удобства фронтенда
                product_dict['is_weight'] = True
                product_dict['price_per_kg'] = product_dict.get('price_per_kg', 0)
            else:
                product_dict['display_price'] = product_dict['price']
                product_dict['display_stock'] = product_dict['stock']
                product_dict['is_weight'] = False

            result.append(product_dict)

        db.close()
        return jsonify(result)

    except Exception as e:
        print(f"❌ Ошибка получения товаров: {e}")
        import traceback
        traceback.print_exc()
        if db:
            db.close()
        return jsonify([])

    except Exception as e:
        print(f"❌ Ошибка получения товаров: {e}")
        import traceback
        traceback.print_exc()
        if db:
            db.close()
        return jsonify([])

    except Exception as e:
        print(f"❌ Ошибка получения товаров: {e}")
        import traceback
        traceback.print_exc()
        if db:
            db.close()
        return jsonify([])


@app.route('/api/products/<int:product_id>')
def api_product_detail(product_id):
    """Получить детали товара по ID для фронтенда"""
    db = get_db()
    try:
        product = db.execute('''
                             SELECT id,
                                    name,
                                    description,
                                    price,
                                    price_per_kg,
                                    image_url,
                                    category,
                                    stock,
                                    stock_weight,
                                    product_type,
                                    unit,
                                    min_weight,
                                    max_weight,
                                    step_weight
                             FROM products
                             WHERE id = ?
                             ''', (product_id,)).fetchone()

        if not product:
            db.close()
            return jsonify({'error': 'Товар не найден'}), 404

        product_dict = dict(product)

        # Добавляем недостающие поля
        product_dict['display_price'] = product_dict['price']
        product_dict['display_stock'] = product_dict['stock']

        # Для весовых товаров
        if product_dict['product_type'] == 'weight':
            product_dict['is_weight'] = True
            if product_dict['price_per_kg']:
                product_dict['display_price'] = product_dict['price_per_kg']
            product_dict['display_stock'] = product_dict.get('stock_weight', 0)
            product_dict['weight_unit'] = product_dict.get('unit', 'кг')
        else:
            product_dict['is_weight'] = False
            product_dict['weight_unit'] = None

        # Если нет изображения - ставим заглушку
        if not product_dict.get('image_url'):
            product_dict['image_url'] = 'https://via.placeholder.com/300x200?text=No+Image'

        # Гарантируем, что все нужные поля есть
        required_fields = ['stock', 'stock_weight', 'min_weight', 'max_weight', 'step_weight']
        for field in required_fields:
            if field not in product_dict:
                product_dict[field] = 0 if field in ['min_weight', 'max_weight', 'step_weight'] else None

        db.close()
        return jsonify(product_dict)

    except Exception as e:
        print(f"❌ Ошибка получения товара {product_id}: {e}")
        if db:
            db.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/products/<int:product_id>/availability')
def check_product_availability(product_id):
    """Проверить наличие товара"""
    db = get_db()
    try:
        product = db.execute('''
                             SELECT id,
                                    name,
                                    product_type,
                                    stock,
                                    stock_weight
                             FROM products
                             WHERE id = ?
                             ''', (product_id,)).fetchone()

        if not product:
            db.close()
            return jsonify({'available': False, 'error': 'Товар не найден'})

        product_data = dict(product)

        if product_data['product_type'] == 'weight':
            available = product_data['stock_weight'] > 0 if product_data['stock_weight'] is not None else False
            quantity = product_data['stock_weight'] or 0
            unit = 'кг'
        else:
            available = product_data['stock'] > 0 if product_data['stock'] is not None else False
            quantity = product_data['stock'] or 0
            unit = 'шт'

        db.close()
        return jsonify({
            'available': available,
            'quantity': quantity,
            'unit': unit,
            'product_type': product_data['product_type']
        })

    except Exception as e:
        print(f"❌ Ошибка проверки наличия товара {product_id}: {e}")
        if db:
            db.close()
        return jsonify({'available': False, 'error': str(e)})
    


@app.route('/api/categories')
def api_categories():
    """Получить список категорий"""
    db = get_db()
    try:
        # Получаем только категории, в которых есть товары
        categories = db.execute('''
                                SELECT DISTINCT category
                                FROM products
                                WHERE category IS NOT NULL
                                  AND category != '' 
              AND (
                (product_type = 'piece' AND stock > 0) 
                OR 
                (product_type = 'weight' AND stock_weight > 0)
              )
                                ORDER BY category
                                ''').fetchall()

        # Преобразуем в список названий
        category_list = [row['category'] for row in categories if row['category']]

        db.close()
        return jsonify(category_list)

    except Exception as e:
        print(f"❌ Ошибка получения категорий: {e}")
        if db:
            db.close()
        return jsonify([])

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
@rate_limit(max_per_minute=20)
@validate_json_request
def api_create_order():
    data = request.json
    db = get_db()
    order_id = None  # Объявляем переменную заранее

    try:
        delivery_type = data.get('delivery_type')
        payment_method = data.get('payment_method', 'cash')
        delivery_address = data.get('delivery_address', '{}')

        # Получаем данные о наличной оплате
        cash_payment = data.get('cash_payment', {}) or {}
        cash_received = cash_payment.get('received', 0)
        cash_change = cash_payment.get('change', 0)
        cash_details = json.dumps(cash_payment, ensure_ascii=False) if cash_payment else None

        # Преобразуем данные о наличных в числа
        try:
            cash_received = float(cash_received) if cash_received not in [None, '', 0] else 0.0
            cash_change = float(cash_change) if cash_change not in [None, '', 0] else 0.0
        except (ValueError, TypeError):
            cash_received = 0.0
            cash_change = 0.0

        # ========== РАСЧЕТ СТОИМОСТИ ДОСТАВКИ ==========
        try:
            order_total = float(data.get('total', 0))
        except (ValueError, TypeError):
            print("⚠️ Ошибка преобразования total в float, используем 0")
            order_total = 0.0

        delivery_cost = 0.0

        if delivery_type == 'courier':
            print(f"💰 Проверяем доставку: заказ {order_total} руб, тип {type(order_total)}")

            if order_total < 1000.0:
                delivery_cost = 100.0
                print(f"💰 Доставка платная: +{delivery_cost} руб (сумма заказа: {order_total} руб)")
            else:
                print(f"✅ Доставка бесплатная (сумма заказа: {order_total} руб)")

        total_with_delivery = order_total + delivery_cost
        print(
            f"📊 Итоговая сумма: {total_with_delivery} руб (товары: {order_total} руб + доставка: {delivery_cost} руб)")

        # Если оплата наличными и нет данных о полученной сумме, рассчитываем ее
        if payment_method == 'cash' and cash_received == 0:
            # Округляем до ближайших 500 рублей
            cash_received = math.ceil(total_with_delivery / 500) * 500
            cash_change = cash_received - total_with_delivery
            print(f"💵 Авторасчет наличных: получено={cash_received}, сдача={cash_change}")

        print(f"💵 Наличные: получено={cash_received} руб, сдача={cash_change} руб")

        # ОБРАБОТКА АДРЕСА
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
        print(f"💵 Данные наличной оплаты: received={cash_received}, change={cash_change}")

        # Вставляем заказ с дополнительными полями для наличных
        cursor = db.execute('''
                            INSERT INTO orders (user_id, username, items, total_price, delivery_cost, status,
                                                delivery_type, delivery_address, pickup_point,
                                                payment_method, recipient_name, phone_number,
                                                cash_received, cash_change, cash_details)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                user_id,
                                username,
                                json.dumps(data['items'], ensure_ascii=False),
                                order_total,
                                delivery_cost,
                                'pending',
                                delivery_type,
                                json.dumps(address_obj if address_obj else {}, ensure_ascii=False),
                                data.get('pickup_point'),
                                payment_method,
                                recipient_name,
                                phone_number,
                                cash_received,
                                cash_change,
                                cash_details
                            ))

        # Получаем ID созданного заказа
        order_id = cursor.lastrowid
        print(f"✅ Заказ создан с ID: {order_id}")

        # Обновляем остатки товаров
        for item in data['items']:
            try:
                quantity = int(item.get('quantity', 1))
                product_id = item.get('id')

                if product_id:
                    # Для весовых товаров
                    if item.get('is_weight'):
                        weight = item.get('weight', 0)
                        if weight > 0:
                            db.execute('UPDATE products SET stock_weight = stock_weight - ? WHERE id = ?',
                                       (weight, product_id))
                    else:
                        # Для штучных товаров
                        db.execute('UPDATE products SET stock = stock - ? WHERE id = ?',
                                   (quantity, product_id))
            except (ValueError, TypeError) as e:
                print(f"⚠️ Ошибка обновления остатков для товара {item.get('id')}: {e}")
            except Exception as e:
                print(f"⚠️ Общая ошибка обновления остатков: {e}")

        db.commit()

        # Создаем активный чат для нового заказа
        try:
            db.execute('''
                       INSERT
                       OR IGNORE INTO active_chats (order_id, customer_id, status)
                VALUES (?, ?, 'active')
                       ''', (order_id, user_id))
            db.commit()
            print(f"✅ Создан активный чат для заказа #{order_id}")
        except Exception as e:
            print(f"⚠️ Не удалось создать чат: {e}")
            # Продолжаем выполнение, даже если чат не создался

        # Отправляем уведомления
        if delivery_type == 'courier':
            print(f"📋 Создан заказ #{order_id} для доставки курьером")

            # Отправляем уведомление покупателю
            try:
                send_order_notification(order_id, 'created')
            except Exception as e:
                print(f"⚠️ Не удалось отправить уведомление покупателю: {e}")

            # Отправляем уведомления курьерам
            try:
                send_courier_order_notification(order_id)
            except Exception as e:
                print(f"⚠️ Не удалось отправить уведомления курьерам: {e}")
        else:
            # Для самовывоза
            try:
                send_order_notification(order_id, 'created')
                print(f"✅ Уведомление о создании заказа #{order_id} отправлено")
            except Exception as e:
                print(f"⚠️ Не удалось отправить уведомление: {e}")

        print(f"✅ Создан заказ #{order_id} для user_id={user_id}")
        print(f"💰 Сумма: {total_with_delivery} руб")
        print(f"💵 Наличные: получено {cash_received} руб, сдача {cash_change} руб")
        print("=" * 50)

        return jsonify({
            'success': True,
            'order_id': order_id,
            'delivery_cost': delivery_cost,
            'total_with_delivery': total_with_delivery
        })

    except Exception as e:
        print(f"❌ Ошибка создания заказа: {e}")
        import traceback
        traceback.print_exc()

        # Пытаемся откатить изменения
        try:
            if order_id:
                db.execute('DELETE FROM orders WHERE id = ?', (order_id,))
                db.commit()
                print(f"⚠️ Заказ #{order_id} удален из-за ошибки")
        except:
            pass

        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        try:
            db.close()
        except:
            pass


@app.route('/api/admin/chats', methods=['GET'])
def api_admin_chats():
    """Получить список активных чатов для администратора"""
    db = get_db()
    try:
        # Получаем активные чаты с непрочитанными сообщениями
        chats = db.execute('''
                           SELECT ac.*,
                                  o.username                       as customer_name,
                                  o.status                         as order_status,
                                  o.total_price,
                                  o.created_at                     as order_created,
                                  (SELECT COUNT(*)
                                   FROM chat_messages
                                   WHERE order_id = ac.order_id
                                     AND is_read = 0
                                     AND sender_type = 'customer') as unread_count,
                                  (SELECT message
                                   FROM chat_messages
                                   WHERE order_id = ac.order_id
                                   ORDER BY created_at DESC           LIMIT 1) as last_message
                           FROM active_chats ac
                               JOIN orders o
                           ON ac.order_id = o.id
                           WHERE ac.status = 'active'
                           ORDER BY ac.last_message_at DESC
                           ''').fetchall()

        chats_list = []
        for chat in chats:
            chat_dict = dict(chat)

            # Форматируем последнее сообщение
            if chat_dict.get('last_message') and len(chat_dict['last_message']) > 50:
                chat_dict['last_message_short'] = chat_dict['last_message'][:50] + '...'

            chats_list.append(chat_dict)

        return jsonify({
            'success': True,
            'chats': chats_list
        })

    except Exception as e:
        print(f"❌ Ошибка получения чатов администратора: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/chat/messages/<int:order_id>', methods=['GET'])
def api_admin_chat_messages(order_id):
    """Получить сообщения чата для администратора"""
    db = get_db()
    try:
        messages = db.execute('''
                              SELECT cm.*,
                                     CASE
                                         WHEN cm.sender_type = 'admin' THEN '👨‍💼 Администратор'
                                         WHEN cm.sender_type = 'courier' THEN '🚚 Курьер'
                                         ELSE o.username
                                         END as sender_name,
                                     CASE
                                         WHEN cm.sender_type = 'admin' THEN 'admin'
                                         WHEN cm.sender_type = 'courier' THEN 'courier'
                                         ELSE 'customer'
                                         END as sender_role
                              FROM chat_messages cm
                                       LEFT JOIN orders o ON cm.order_id = o.id
                              WHERE cm.order_id = ?
                              ORDER BY cm.created_at ASC
                              ''', (order_id,)).fetchall()

        # Помечаем сообщения как прочитанные
        db.execute('UPDATE chat_messages SET is_read = 1 WHERE order_id = ? AND sender_type = "customer"',
                   (order_id,))
        db.execute('UPDATE active_chats SET unread_admin = 0 WHERE order_id = ?', (order_id,))
        db.commit()

        messages_list = []
        for msg in messages:
            msg_dict = dict(msg)
            # Форматируем дату
            if msg_dict.get('created_at'):
                try:
                    dt = datetime.strptime(msg_dict['created_at'], '%Y-%m-%d %H:%M:%S')
                    msg_dict['time_formatted'] = dt.strftime('%H:%M')
                    msg_dict['date_formatted'] = dt.strftime('%d.%m.%Y')
                except:
                    msg_dict['time_formatted'] = msg_dict['created_at'][11:16]
                    msg_dict['date_formatted'] = msg_dict['created_at'][:10]

            messages_list.append(msg_dict)

        return jsonify({
            'success': True,
            'messages': messages_list
        })

    except Exception as e:
        print(f"❌ Ошибка получения сообщений чата: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


# ========== API ДЛЯ РЕГИСТРАЦИИ КУРЬЕРА В ТЕЛЕГРАМ ==========

@app.route('/api/courier/telegram/by-telegram/<int:telegram_id>', methods=['GET'])
def api_get_courier_by_telegram(telegram_id):
    """Получить информацию о курьере по Telegram ID"""
    db = get_db()
    try:
        courier = db.execute('''
                             SELECT ct.*, c.full_name, c.phone, c.vehicle_type, c.is_active
                             FROM courier_telegram ct
                                      JOIN couriers c ON ct.courier_id = c.id
                             WHERE ct.telegram_id = ?
                             ''', (telegram_id,)).fetchone()

        if not courier:
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        return jsonify({
            'success': True,
            'courier_info': dict(courier)
        })

    except Exception as e:
        print(f"❌ Ошибка получения курьера по Telegram ID: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/admin/chat/send', methods=['POST'])
def api_admin_send_message():
    """Администратор отправляет сообщение в чат"""
    db = get_db()
    try:
        data = request.json
        order_id = data.get('order_id')
        message = data.get('message', '').strip()

        if not order_id or not message:
            return jsonify({'success': False, 'error': 'Не указаны обязательные поля'}), 400

        # Получаем информацию о заказе
        order = db.execute('SELECT * FROM orders WHERE id = ?', (order_id,)).fetchone()
        if not order:
            return jsonify({'success': False, 'error': 'Заказ не найден'}), 404

        order_dict = dict(order)

        # Сохраняем сообщение от администратора
        db.execute('''
                   INSERT INTO chat_messages (order_id, user_id, message, sender_type)
                   VALUES (?, 0, ?, 'admin')
                   ''', (order_id, message))

        # Обновляем счетчик непрочитанных для клиента
        db.execute('''
                   UPDATE active_chats
                   SET last_message_at = CURRENT_TIMESTAMP,
                       unread_customer = unread_customer + 1
                   WHERE order_id = ?
                   ''', (order_id,))

        db.commit()

        # Отправляем уведомление клиенту
        send_chat_notification_to_telegram(
            order_dict['user_id'],
            order_id,
            message,
            "Администратор",
            is_admin=True
        )

        return jsonify({
            'success': True,
            'message': 'Сообщение отправлено'
        })

    except Exception as e:
        print(f"❌ Ошибка отправки сообщения администратора: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


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
                                             o.payment_method,   
                                             o.cash_received,    
                                             o.cash_change,    
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

            # Парсим cash_details если есть
            if order_dict.get('cash_details'):
                try:
                    order_dict['cash_details_obj'] = json.loads(order_dict['cash_details'])
                except:
                    order_dict['cash_details_obj'] = {}

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
@rate_limit(max_per_minute=10)
@validate_json_request
def courier_login():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        ip = request.remote_addr
        db = get_db()
        failed_attempts = db.execute('''
                                     SELECT COUNT(*)
                                     FROM failed_logins
                                     WHERE ip_address = ?
                                       AND attempt_time > datetime('now', '-5 minutes')
                                     ''', (ip,)).fetchone()[0]

        if failed_attempts > 5:
            return jsonify({'success': False, 'error': 'Too many failed attempts. Try again later.'}), 429

        if not username or not password:
            return jsonify({'success': False, 'error': 'Введите логин и пароль'}), 400

        db = get_db()
        courier = db.execute('SELECT * FROM couriers WHERE username = ? AND is_active = 1', (username,)).fetchone()
        db.close()

        if not courier:
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        if courier['password'] != password:
            return jsonify({'success': False, 'error': 'Неверный пароль'}), 401

        if not courier or courier['password'] != password:
            db.execute('INSERT INTO failed_logins (username, ip_address) VALUES (?, ?)',
                       (username, ip))
            db.commit()

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
                                          o.delivery_cost,  
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
                                          a.delivery_notes,
                                          o.cash_received, 
                                          o.cash_change,   
                                          o.cash_details   
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
                                             o.delivery_cost,  
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
                                             a.delivery_notes,
                                             o.cash_received, 
                                             o.cash_change,   
                                             o.cash_details 
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
                                         o.delivery_cost,  
                                         o.status as order_status,
                                         o.delivery_type,
                                         o.delivery_address,
                                         o.pickup_point,
                                         o.payment_method, 
                                         o.recipient_name,
                                         o.phone_number,
                                         o.created_at,
                                         a.status as assignment_status,
                                         o.cash_received,  
                                         o.cash_change,   
                                         o.cash_details   
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

                # Парсим cash_details если есть
                if order_dict.get('cash_details'):
                    try:
                        order_dict['cash_details_obj'] = json.loads(order_dict['cash_details'])
                    except:
                        order_dict['cash_details_obj'] = {}

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
            # Для пользователя меняем статус на 'delivering'
            db.execute('UPDATE orders SET status = "delivering" WHERE id = ?', (order_id,))

        elif status == 'delivered':
            db.execute(
                'UPDATE order_assignments SET status = ?, delivered_at = CURRENT_TIMESTAMP, photo_proof = ?, delivery_notes = ? WHERE order_id = ? AND courier_id = ?',
                (status, photo_url, notes, order_id, courier_id))
            db.execute('UPDATE orders SET status = "delivered" WHERE id = ?', (order_id,))
        else:
            db.execute('UPDATE order_assignments SET status = ? WHERE order_id = ? AND courier_id = ?',
                       (status, order_id, courier_id))

        db.commit()

        # Получаем информацию о курьере
        courier = db.execute('SELECT full_name, phone FROM couriers WHERE id = ?', (courier_id,)).fetchone()
        courier_name = courier['full_name'] if courier else None
        courier_phone = courier['phone'] if courier else None

        # Закрываем базу перед отправкой уведомления
        if db:
            db.close()

        # Отправляем уведомление в бот с правильным статусом
        # Если статус 'picked_up', отправляем 'picked_up' для специального текста
        send_order_notification(order_id, status if status == 'picked_up' else status, courier_id)

        return jsonify({'success': True, 'photo_url': photo_url})

    except Exception as e:
        print(f"❌ Ошибка обновления статуса: {e}")
        if db:
            db.close()
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== НОВЫЕ API ДЛЯ АДМИНКИ - ДЕТАЛИЗАЦИЯ ЗАКАЗОВ ==========

@app.route('/api/admin/orders/<int:order_id>', methods=['GET'])
@admin_required
@rate_limit(max_per_minute=60)
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
                                  c.phone     as courier_phone,
                                  o.cash_received,
                                  o.cash_change,      
                                  o.cash_details     
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

        # Парсим cash_details если есть
        if order_dict.get('cash_details'):
            try:
                order_dict['cash_details_obj'] = json.loads(order_dict['cash_details'])
            except:
                order_dict['cash_details_obj'] = {}

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


@app.route('/api/products/weight', methods=['POST'])
def create_weight_product():
    """Создать весовой товар"""
    db = get_db()
    try:
        data = request.json

        if not data.get('name') or data.get('price_per_kg') is None:
            return jsonify({'success': False, 'error': 'Заполните обязательные поля'}), 400

        cursor = db.execute('''
                            INSERT INTO products (name, description, price, image_url, category,
                                                  product_type, unit, weight_unit, price_per_kg,
                                                  min_weight, max_weight, step_weight, stock, stock_weight)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                data.get('name', ''),
                                data.get('description', ''),
                                0,  # Цена будет рассчитываться динамически
                                data.get('image_url', ''),
                                data.get('category', ''),
                                'weight',  # Тип товара
                                data.get('unit', 'кг'),
                                data.get('weight_unit', 'кг'),
                                data.get('price_per_kg', 0),
                                data.get('min_weight', 0.1),
                                data.get('max_weight', 5.0),
                                data.get('step_weight', 0.1),
                                data.get('stock', 0),
                                data.get('stock_weight', 0)
                            ))

        product_id = cursor.lastrowid
        db.commit()

        return jsonify({'success': True, 'id': product_id})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/products/<int:product_id>/weight', methods=['PUT'])
def update_weight_product(product_id):
    """Обновить весовой товар"""
    db = get_db()
    try:
        data = request.json

        db.execute('''
                   UPDATE products
                   SET name         = ?,
                       description  = ?,
                       image_url    = ?,
                       category     = ?,
                       unit         = ?,
                       weight_unit  = ?,
                       price_per_kg = ?,
                       min_weight   = ?,
                       max_weight   = ?,
                       step_weight  = ?,
                       stock        = ?,
                       stock_weight = ?
                   WHERE id = ?
                   ''', (
                       data.get('name', ''),
                       data.get('description', ''),
                       data.get('image_url', ''),
                       data.get('category', ''),
                       data.get('unit', 'кг'),
                       data.get('weight_unit', 'кг'),
                       data.get('price_per_kg', 0),
                       data.get('min_weight', 0.1),
                       data.get('max_weight', 5.0),
                       data.get('step_weight', 0.1),
                       data.get('stock', 0),
                       data.get('stock_weight', 0),
                       product_id
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


@app.route('/api/admin/orders/<int:order_id>', methods=['PUT'])
def update_order(order_id):
    try:
        data = request.json

        # Валидация данных
        required_fields = ['status', 'total', 'recipient_name']
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'error': f'Поле {field} обязательно'}), 400

        # Обновляем заказ в базе данных
        db.update_order(order_id, data)

        # Отправляем уведомление в Telegram если статус изменился
        if 'status' in data:
            order = db.get_order(order_id)
            if order and order.user_id:
                send_telegram_notification(
                    order.user_id,
                    f'📦 Статус вашего заказа #{order_id} изменен на: {get_status_name(data["status"])}'
                )

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def get_status_name(status):
    status_names = {
        'pending': 'Ожидает обработки',
        'processing': 'В обработке',
        'delivering': 'Доставляется',
        'completed': 'Завершен',
        'cancelled': 'Отменен'
    }
    return status_names.get(status, status)

@app.route('/api/admin/promo-codes', methods=['GET'])
def get_promo_codes_admin():
    """Получить все промокоды для админки"""
    db = get_db()
    try:
        promo_codes = db.execute('''
                                 SELECT pc.*,
                                        d.name as discount_name,
                                        d.discount_type,
                                        d.value
                                 FROM promo_codes pc
                                          LEFT JOIN discounts d ON pc.discount_id = d.id
                                 ORDER BY pc.created_at DESC
                                 ''').fetchall()

        result = []
        for promo in promo_codes:
            promo_dict = dict(promo)
            # Преобразуем типы данных
            if promo_dict.get('value'):
                promo_dict['value'] = float(promo_dict['value'])
            if promo_dict.get('min_order_amount'):
                promo_dict['min_order_amount'] = float(promo_dict['min_order_amount'])
            if promo_dict.get('used_count'):
                promo_dict['used_count'] = int(promo_dict['used_count'])
            if promo_dict.get('usage_limit'):
                promo_dict['usage_limit'] = int(promo_dict['usage_limit'])

            result.append(promo_dict)

        db.close()
        return jsonify(result)

    except Exception as e:
        db.close()
        print(f"❌ Ошибка получения промокодов: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


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
    db = None
    try:
        data = request.json
        print(f"🎟️ Проверка промокода: {data}")

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        code = data.get('code', '').strip().upper()

        if not code:
            return jsonify({'success': False, 'error': 'Введите промокод'}), 400

        db = get_db()

        # Получаем промокод
        promo = db.execute('''
                           SELECT *
                           FROM promo_codes
                           WHERE code = ?
                             AND is_active = 1
                           ''', (code,)).fetchone()

        if not promo:
            return jsonify({'success': False, 'error': 'Промокод не найден'}), 404

        promo_dict = dict(promo)
        print(f"✅ Найден промокод: {promo_dict}")

        # Проверяем срок действия
        now = datetime.now()
        if promo_dict.get('end_date'):
            try:
                end_date = datetime.strptime(promo_dict['end_date'], '%Y-%m-%d %H:%M:%S')
                if end_date < now:
                    return jsonify({'success': False, 'error': 'Срок действия промокода истек'}), 400
            except Exception as e:
                print(f"⚠️ Ошибка парсинга даты: {e}")

        # Проверяем лимит использований
        if promo_dict.get('usage_limit') and promo_dict.get('used_count', 0) >= promo_dict['usage_limit']:
            return jsonify({'success': False, 'error': 'Промокод закончился'}), 400

        # Проверяем дату начала
        if promo_dict.get('start_date'):
            try:
                start_date = datetime.strptime(promo_dict['start_date'], '%Y-%m-%d %H:%M:%S')
                if start_date > now:
                    return jsonify({'success': False, 'error': 'Промокод еще не активен'}), 400
            except Exception as e:
                print(f"⚠️ Ошибка парсинга даты начала: {e}")

        # Конвертируем типы данных
        promo_dict['value'] = float(promo_dict.get('value', 0)) if promo_dict.get('value') else 0
        promo_dict['min_order_amount'] = float(promo_dict.get('min_order_amount', 0)) if promo_dict.get(
            'min_order_amount') else 0
        promo_dict['used_count'] = int(promo_dict.get('used_count', 0))
        promo_dict['usage_limit'] = int(promo_dict.get('usage_limit', 0)) if promo_dict.get('usage_limit') else None

        return jsonify({
            'success': True,
            'promo_code': promo_dict
        })

    except Exception as e:
        print(f"❌ Ошибка проверки промокода: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500
    finally:
        if db:
            db.close()


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

            # Общие обязательные поля
            if not data or 'name' not in data:
                return jsonify({'success': False, 'error': 'Введите название товара'}), 400

            product_type = data.get('product_type', 'piece')

            if product_type == 'piece':
                # ШТУЧНЫЙ ТОВАР
                if 'price' not in data:
                    return jsonify({'success': False, 'error': 'Укажите цену товара'}), 400

                db.execute(
                    '''INSERT INTO products (name, description, price, image_url, category, stock,
                                             product_type, unit)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                    (data.get('name', ''),
                     data.get('description', ''),
                     data.get('price', 0),
                     data.get('image_url', ''),  
                     data.get('category', ''),
                     data.get('stock', 0),
                     'piece',
                     data.get('unit', 'шт')))

            else:
                # ВЕСОВОЙ ТОВАР - ИСПРАВЛЕННАЯ ВЕРСИЯ
                if 'price_per_kg' not in data:
                    return jsonify({'success': False, 'error': 'Укажите цену за кг'}), 400

                # Получаем значения для весового товара
                price_per_kg = float(data.get('price_per_kg', 0))
                stock_weight = float(data.get('stock_weight', 0))

                db.execute(
                    '''INSERT INTO products (name, description, price, image_url, category, stock,
                                             product_type, unit, weight_unit, price_per_kg,
                                             min_weight, max_weight, step_weight, stock_weight)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (data.get('name', ''),
                     data.get('description', ''),
                     price_per_kg,
                     data.get('image_url', ''),
                     data.get('category', ''),
                     stock_weight,
                     'weight',
                     data.get('unit', 'кг'),
                     data.get('weight_unit', 'кг'),
                     price_per_kg,
                     data.get('min_weight', 0.1),
                     data.get('max_weight', 5.0),
                     data.get('step_weight', 0.1),
                     stock_weight))

            db.commit()
            product_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
            return jsonify({'success': True, 'id': product_id})

        elif request.method == 'PUT':
            product_id = request.args.get('id')
            data = request.json

            if not product_id:
                return jsonify({'success': False, 'error': 'Не указан ID товара'}), 400

            product_type = data.get('product_type', 'piece')

            if product_type == 'piece':
                # ШТУЧНЫЙ ТОВАР
                db.execute(
                    '''UPDATE products
                       SET name         = ?,
                           description  = ?,
                           price        = ?,
                           image_url    = ?,
                           category     = ?,
                           stock        = ?,
                           product_type = ?,
                           unit         = ?
                       WHERE id = ?''',
                    (data.get('name', ''),
                     data.get('description', ''),
                     data.get('price', 0),
                     data.get('image_url', ''),
                     data.get('category', ''),
                     data.get('stock', 0),
                     'piece',
                     data.get('unit', 'шт'),
                     product_id))
            else:
                # ВЕСОВОЙ ТОВАР - ИСПРАВЛЕНО ДЛЯ РЕДАКТИРОВАНИЯ
                # Получаем значения для весового товара
                price_per_kg = float(data.get('price_per_kg', 0))
                stock_weight = float(data.get('stock_weight', 0))

                db.execute(
                    '''UPDATE products
                       SET name        = ?,
                           description = ?,
                           price       = ?,
                           # Используем price_per_kg как price
                           image_url    = ?,  # URL может быть пустым
                           category     = ?,
                           stock        = ?,  # Используем stock_weight как stock
                           product_type = ?,
                           unit         = ?,
                           weight_unit  = ?,
                           price_per_kg = ?,
                           min_weight   = ?,
                           max_weight   = ?,
                           step_weight  = ?,
                           stock_weight = ?
                       WHERE id = ?''',
                    (data.get('name', ''),
                     data.get('description', ''),
                     price_per_kg,
                     data.get('image_url', ''),
                     data.get('category', ''),
                     stock_weight,
                     'weight',
                     data.get('unit', 'кг'),
                     data.get('weight_unit', 'кг'),
                     price_per_kg,
                     data.get('min_weight', 0.1),
                     data.get('max_weight', 5.0),
                     data.get('step_weight', 0.1),
                     stock_weight,
                     product_id))

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
def api_bot_register_user():
    """Регистрация пользователя от бота"""
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
                SET name        = ?,parent_id = ?,discount_id = ?,sort_order = ?,
                    description = ?,icon = ?,color = ?,
                    seo_title   = ?,seo_description = ?,seo_keywords = ?
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
@app.route('/api/security/logs', methods=['GET'])
@admin_required
def get_security_logs():
    """Получить логи безопасности (только для админа)"""
    try:
        db = get_db()
        logs = db.execute('''
            SELECT * FROM security_logs 
            ORDER BY created_at DESC 
            LIMIT 100
        ''').fetchall()
        db.close()
        return jsonify([dict(log) for log in logs])
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/security/clear-failed-logins', methods=['POST'])
@admin_required
def clear_failed_logins():
    """Очистить записи о неудачных попытках входа"""
    try:
        db = get_db()
        db.execute('DELETE FROM failed_logins WHERE attempt_time < datetime("now", "-1 hour")')
        db.commit()
        db.close()
        return jsonify({'success': True, 'message': 'Cleared old failed login attempts'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== ХЕЛПЕР ДЛЯ БЕЗОПАСНЫХ ЗАПРОСОВ ==========

def execute_safe_query(query, params=()):
    """Безопасное выполнение SQL запроса"""
    db = get_db()
    try:
        cursor = db.execute(query, params)
        result = cursor.fetchall()
        return [dict(row) for row in result]
    except Exception as e:
        print(f"❌ SQL Error: {e}")
        return []
    finally:
        db.close()


# ========== ЗАПУСК С БЕЗОПАСНОСТЬЮ ==========
if __name__ == '__main__':
    # Настройки безопасности
    app.config.update(
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        PERMANENT_SESSION_LIFETIME=1800,
        MAX_CONTENT_LENGTH=16 * 1024 * 1024  # 16MB максимум
    )

    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)  # debug=False для продакшена