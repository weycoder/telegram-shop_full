import os
import sqlite3
import json
import uuid
import requests
import secrets
import time
import telebot
import telegram
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
import base64
from functools import wraps 
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


def get_db_connection():
    conn = sqlite3.connect('shop.db')
    conn.row_factory = sqlite3.Row
    return conn


# ========== ХЕЛПЕР ДЛЯ БЕЗОПАСНЫХ ЗАПРОСОВ ==========
# app.py - исправленный декоратор
def rate_limit(max_requests=30, window=60):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Проверяем, существует ли _ip_blocks
            if '_ip_blocks' not in globals():
                globals()['_ip_blocks'] = {}

            ip = request.remote_addr
            current_time = time.time()

            # Инициализируем счетчик для IP если его нет
            if ip not in _ip_blocks:
                _ip_blocks[ip] = {'count': 1, 'window_start': current_time}
            else:
                # Проверяем не истекло ли окно времени
                if current_time - _ip_blocks[ip]['window_start'] > window:
                    # Сбрасываем счетчик
                    _ip_blocks[ip] = {'count': 1, 'window_start': current_time}
                else:
                    # Увеличиваем счетчик
                    _ip_blocks[ip]['count'] += 1

            # Проверяем не превышен ли лимит
            if _ip_blocks[ip]['count'] > max_requests:
                return jsonify({'error': 'Превышен лимит запросов. Попробуйте позже.'}), 429

            return f(*args, **kwargs)

        return decorated_function

    return decorator


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

import atexit

def setup_webhook_on_start():
    """Настроить вебхук при запуске приложения"""
    try:
        import time
        # Ждем немного чтобы приложение успело запуститься
        time.sleep(3)
        print("🔄 Настраиваю Telegram вебхук...")
        if setup_telegram_webhook():
            print("✅ Telegram вебхук успешно настроен")
        else:
            print("⚠️ Не удалось настроить Telegram вебхук")
    except Exception as e:
        print(f"❌ Ошибка настройки вебхука: {e}")

# Запускаем настройку вебхука в отдельном потоке после запуска приложения
import threading
timer = threading.Timer(5.0, setup_webhook_on_start)
timer.start()

# Регистрируем очистку при выходе
atexit.register(lambda: timer.cancel())


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
                           building
                           TEXT,
                           entrance
                           TEXT,
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
                           comment
                           TEXT,
                           is_default
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
                           user_id
                       ) REFERENCES users
                       (
                           id
                       ) ON DELETE CASCADE
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
                ('Смоф Щербинка', 'ул. Любучанский переулок 1к3 ', '09:00-22:00', '+7 (929) 544-95-88', None, None)
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


def send_order_details_notification(telegram_id, order_id, items, status, delivery_type,
                                    courier_name=None, courier_phone=None):
    """Отправить уведомление клиенту - ИСПРАВЛЕННАЯ ВЕРСИЯ"""
    try:
        BOT_TOKEN = os.getenv('BOT_TOKEN')
        WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://telegram-shop-full.onrender.com/')

        print(f"📤 Уведомление клиенту #{order_id}")
        print(f"   👤 ID: {telegram_id}")

        if not telegram_id or telegram_id == 0:
            print("❌ Неверный telegram_id")
            return False

        if not BOT_TOKEN:
            print("❌ BOT_TOKEN не установлен")
            return False

        # Если статус 'delivered' - проверяем есть ли фото
        if status == 'delivered':
            db = get_db()
            try:
                assignment = db.execute('SELECT photo_proof FROM order_assignments WHERE order_id = ?', (order_id,)).fetchone()
                if assignment and assignment['photo_proof']:
                    # Есть фото - отправляем отдельное уведомление
                    photo_url = assignment['photo_proof']
                    return send_order_delivered_with_photo_notification(
                        telegram_id=telegram_id,
                        order_id=order_id,
                        courier_name=courier_name,
                        courier_phone=courier_phone,
                        photo_url=photo_url
                    )
            except Exception as e:
                print(f"⚠️ Ошибка проверки фото: {e}")
            finally:
                db.close()

        # Получаем данные заказа с ВСЕМИ полями адреса
        db = get_db()
        try:
            order = db.execute('''
                               SELECT o.*,
                                      json_extract(o.delivery_address, '$.city')      as city,
                                      json_extract(o.delivery_address, '$.street')    as street,
                                      json_extract(o.delivery_address, '$.house')     as house,
                                      json_extract(o.delivery_address, '$.building')  as building,
                                      json_extract(o.delivery_address, '$.entrance')  as entrance,
                                      json_extract(o.delivery_address, '$.apartment') as apartment,
                                      json_extract(o.delivery_address, '$.floor')     as floor,
                                      json_extract(o.delivery_address, '$.doorcode')  as doorcode,
                                      json_extract(o.delivery_address, '$.comment')   as address_comment,
                                      (o.total_price + COALESCE(o.delivery_cost, 0) -
                                       COALESCE(o.discount_amount, 0))                as total_amount
                               FROM orders o
                               WHERE o.id = ?
                               ''', (order_id,)).fetchone()

            if not order:
                print(f"❌ Заказ #{order_id} не найден")
                db.close()
                return False

            order_data = dict(order)
        except Exception as e:
            print(f"❌ Ошибка получения заказа: {e}")
            db.close()
            return False
        finally:
            db.close()

        # Если items не переданы, берем из базы
        if not items:
            try:
                if order_data.get('items'):
                    items = json.loads(order_data['items'])
            except:
                items = []

        # Форматируем ПОЛНЫЙ адрес для уведомления
        address_parts = []
        if order_data.get('city'):
            address_parts.append(f"{order_data['city']}")
        if order_data.get('street'):
            address_parts.append(f"ул. {order_data['street']}")
        if order_data.get('house'):
            address_parts.append(f"д. {order_data['house']}")
        if order_data.get('building'):
            address_parts.append(f"к{order_data['building']}")
        if order_data.get('entrance'):
            address_parts.append(f"п{order_data['entrance']}")
        if order_data.get('apartment'):
            address_parts.append(f"кв{order_data['apartment']}")

        address = ', '.join(address_parts) if address_parts else "Адрес не указан"

        # Дополнительные детали
        address_details = []
        if order_data.get('floor'):
            address_details.append(f"Этаж: {order_data['floor']}")
        if order_data.get('doorcode'):
            address_details.append(f"Домофон: {order_data['doorcode']}")
        if order_data.get('address_comment'):
            address_details.append(f"Комментарий: {order_data['address_comment']}")

        # Эмодзи статусов
        status_emojis = {
            'created': '🆕',
            'assigned': '👤',
            'processing': '⚙️',
            'ready_for_pickup': '📦',
            'picked_up': '🚚',
            'delivering': '⚡',
            'delivered': '✅',
            'completed': '🏆',
            'pending': '⏳'
        }

        status_emoji = status_emojis.get(status, '📊')
        discount_amount = order_data.get('discount_amount', 0)
        delivery_cost = order_data.get('delivery_cost', 0)
        total_amount = order_data.get('total_amount', 0)

        # Заголовок
        message = f"{status_emoji} *ЗАКАЗ #{order_id}*\n\n"

        # Статус с дополнительной информацией
        status_texts = {
            'assigned': '📞 Курьер назначен',
            'picked_up': '⚡ Курьер забрал заказ',
            'delivering': '🚚 В пути к вам',
            'ready_for_pickup': '📦 Готов к выдаче',
            'delivered': '✅ Доставлен',
            'completed': '🏆 Завершен'
        }

        message += f"📊 *Статус:* {status_texts.get(status, 'В обработке')}\n"

        # ПОЛНЫЙ адрес
        message += f"📍 *Адрес:* {address}\n"

        # Детали адреса если есть
        if address_details:
            message += f"\n📋 *Детали доставки:*\n"
            for detail in address_details:
                message += f"• {detail}\n"

        # Курьер
        if courier_name:
            safe_name = courier_name.replace('*', '\\*')
            message += f"\n👤 *Курьер:* {safe_name}\n"
            if courier_phone:
                message += f"📱 *Телефон курьера:* {courier_phone}\n"

        # Товары (компактно)
        if items:
            message += "\n📦 *Товары:*\n"
            for item in items:
                name = item.get('name', 'Товар')
                if len(name) > 30:
                    name = name[:27] + "..."

                safe_name = name.replace('*', '\\*')

                if item.get('is_weight'):
                    weight = item.get('weight', 0)
                    price = item.get('price', 0)
                    message += f"• {safe_name}\n  ⚖️ {weight} кг = {price} ₽\n"
                else:
                    quantity = item.get('quantity', 1)
                    price = item.get('price', 0)
                    item_total = price * quantity
                    message += f"• {safe_name}\n  🧮 {quantity} шт × {price} ₽ = {item_total} ₽\n"

        # Расчет
        message += "\n🧮 *Расчет:*\n"
        if discount_amount > 0:
            message += f"🎁 Скидка: -{discount_amount:.2f} ₽\n"

        if delivery_type == 'courier':
            if delivery_cost > 0:
                message += f"🚚 Доставка: {delivery_cost:.2f} ₽\n"
            else:
                message += f"🚚 Доставка: 🎉 Бесплатно\n"
        else:
            message += f"🏪 Самовывоз: Бесплатно\n"

        message += f"━━━━━━━━━━━━━━━━━━━━\n"
        message += f"💰 *Итого: {total_amount:.2f} ₽*"

        # Дополнительные советы
        tips = {
            'assigned': "\n\n💡 Курьер скоро заберет ваш заказ. Будьте на связи!",
            'picked_up': "\n\n💡 Курьер уже в пути! Будьте готовы к встрече.",
            'delivering': "\n\n💡 Курьер едет к вам! Будьте на связи.",
            'ready_for_pickup': "\n\n💡 Заказ готов! Заберите в удобное время.",
            'delivered': "\n\n💡 Заказ доставлен! Спасибо за покупку!",
            'completed': "\n\n💡 Заказ завершен! Ждем вас снова! 🛍️"
        }

        message += tips.get(status, "\n\n💡 Следите за статусом в разделе 'Мои заказы'")

        # Кнопки
        webapp_url = f"{WEBAPP_URL.rstrip('/')}/webapp?user_id={telegram_id}"

        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "📦 Мои заказы", "callback_data": "my_orders"},
                    {"text": "📍 Отследить", "callback_data": f"track_{order_id}"}
                ],
                [
                    {
                        "text": "🛒 Открыть магазин",
                        "web_app": {"url": webapp_url}
                    }
                ]
            ]
        }

        # Отправка
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': int(telegram_id),
            'text': message,
            'parse_mode': 'Markdown',
            'disable_web_page_preview': True,
            'reply_markup': json.dumps(keyboard)
        }

        print(f"   📤 Отправка клиенту {telegram_id}...")
        response = requests.post(url, json=data, timeout=10)

        if response.status_code == 200:
            print(f"   ✅ Уведомление отправлено клиенту {telegram_id}")
            return True
        else:
            print(f"   ❌ Ошибка: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Ошибка отправки уведомления: {e}")
        import traceback
        traceback.print_exc()
        return False



def send_order_notification(order_id, status, courier_id=None, photo_url=None):
    """Универсальная функция отправки уведомлений о заказе"""
    try:
        db = get_db()

        # Получаем информацию о заказе
        order = db.execute('''
                           SELECT o.*, c.full_name as courier_name, c.phone as courier_phone
                           FROM orders o
                                    LEFT JOIN order_assignments a ON o.id = a.order_id
                                    LEFT JOIN couriers c ON a.courier_id = c.id
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

        if not order:
            print(f"❌ Заказ #{order_id} не найден")
            return False

        order_dict = dict(order)

        # Получаем информацию о курьере если не передан
        courier_name = order_dict.get('courier_name')
        courier_phone = order_dict.get('courier_phone')

        # Если передан courier_id, получаем его данные
        if courier_id and not courier_name:
            courier = db.execute('SELECT full_name, phone FROM couriers WHERE id = ?', (courier_id,)).fetchone()
            if courier:
                courier_name = courier['full_name']
                courier_phone = courier['phone']

        # Парсим items
        items_list = []
        if order_dict.get('items'):
            try:
                items_list = json.loads(order_dict['items'])
            except:
                items_list = []

        db.close()

        # Если это доставка и есть фото - отправляем уведомление с фото
        if status == 'delivered' and photo_url:
            return send_order_delivered_with_photo_notification(
                telegram_id=order_dict['user_id'],
                order_id=order_id,
                courier_name=courier_name,
                courier_phone=courier_phone,
                photo_url=photo_url
            )
        else:
            # Отправляем обычное уведомление
            return send_order_details_notification(
                telegram_id=order_dict['user_id'],
                order_id=order_id,
                items=items_list,
                status=status,
                delivery_type=order_dict.get('delivery_type', 'courier'),
                courier_name=courier_name,
                courier_phone=courier_phone
            )

    except Exception as e:
        print(f"❌ Ошибка в send_order_notification: {e}")
        import traceback
        traceback.print_exc()
        return False


def send_order_delivered_with_photo_notification(telegram_id, order_id, courier_name, courier_phone, photo_url):
    """Отправить уведомление клиенту о доставке с фото"""
    try:
        BOT_TOKEN = os.getenv('BOT_TOKEN')
        WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://telegram-shop-full.onrender.com/')

        print(f"📤 Уведомление о доставке #{order_id} с фото")
        print(f"   👤 ID: {telegram_id}")
        print(f"   📷 Фото: {photo_url}")

        if not telegram_id or telegram_id == 0:
            print("❌ Неверный telegram_id")
            return False

        if not BOT_TOKEN:
            print("❌ BOT_TOKEN не установлен")
            return False

        # Получаем полный URL для фото
        full_photo_url = f"{WEBAPP_URL.rstrip('/')}{photo_url}" if photo_url.startswith('/') else photo_url

        # Формируем сообщение
        message = f"""✅ *ЗАКАЗ #{order_id} ДОСТАВЛЕН!*

🎉 Ваш заказ успешно доставлен!

👤 *Курьер:* {courier_name}
📱 *Телефон курьера:* {courier_phone}

📸 *Фото подтверждения доставки:*
Фотография прикреплена к этому сообщению.

💝 *Спасибо за покупку!*
Надеемся, всё понравилось. Ждём вас снова!"""

        # URL для веб-приложения
        webapp_url = f"{WEBAPP_URL.rstrip('/')}/webapp?user_id={telegram_id}"

        # Кнопки
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "⭐ Оценить заказ", "callback_data": f"rate_order_{order_id}"},
                    {"text": "📦 Мои заказы", "callback_data": "my_orders"}
                ],
                [
                    {
                        "text": "🛒 Открыть магазин",
                        "web_app": {"url": webapp_url}
                    }
                ]
            ]
        }

        # Сначала отправляем фото с подписью
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto'
        photo_data = {
            'chat_id': int(telegram_id),
            'photo': full_photo_url,
            'caption': message,
            'parse_mode': 'Markdown',
            'reply_markup': json.dumps(keyboard)
        }

        print(f"   📤 Отправка фото клиенту {telegram_id}...")
        response = requests.post(url, json=photo_data, timeout=10)

        if response.status_code == 200:
            print(f"   ✅ Уведомление с фото отправлено клиенту {telegram_id}")
            return True
        else:
            print(f"   ❌ Ошибка отправки фото: {response.text}")

            # Если не удалось отправить фото, отправляем текстовое сообщение
            text_url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
            text_data = {
                'chat_id': int(telegram_id),
                'text': f"✅ *ЗАКАЗ #{order_id} ДОСТАВЛЕН!*\n\n" +
                        f"🎉 Ваш заказ успешно доставлен!\n\n" +
                        f"👤 *Курьер:* {courier_name}\n" +
                        f"📱 *Телефон:* {courier_phone}\n\n" +
                        f"📸 *Фото подтверждения:* {full_photo_url}\n\n" +
                        f"💝 Спасибо за покупку!",
                'parse_mode': 'Markdown',
                'reply_markup': json.dumps(keyboard)
            }

            text_response = requests.post(text_url, json=text_data, timeout=10)
            if text_response.status_code == 200:
                print(f"   ✅ Текстовое уведомление отправлено клиенту {telegram_id}")
                return True
            else:
                print(f"   ❌ Ошибка отправки текста: {text_response.text}")
                return False

    except Exception as e:
        print(f"❌ Ошибка отправки уведомления с фото: {e}")
        import traceback
        traceback.print_exc()
        return False


@app.route('/api/admin/orders/<int:order_id>/ready', methods=['PUT'])
def admin_mark_order_ready(order_id):
    """Пометить заказ как готовый к выдаче (для самовывоза)"""
    db = get_db()
    try:
        # Получаем заказ
        order = db.execute('SELECT * FROM orders WHERE id = ?', (order_id,)).fetchone()
        if not order:
            return jsonify({'success': False, 'error': 'Заказ не найден'}), 404

        order_dict = dict(order)

        # Проверяем что это самовывоз
        if order_dict.get('delivery_type') != 'pickup':
            return jsonify({'success': False, 'error': 'Это не заказ на самовывоз'}), 400

        # Обновляем статус
        db.execute('UPDATE orders SET status = ? WHERE id = ?',
                   ('ready_for_pickup', order_id))
        db.commit()

        # Отправляем уведомление клиенту
        send_order_notification(order_id, 'ready_for_pickup')

        return jsonify({'success': True, 'message': 'Заказ помечен как готовый к выдаче'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

def send_chat_notification_to_telegram(telegram_id, order_id, message, sender_name, is_admin=False):
    """Отправить уведомление о новом сообщении в Telegram"""
    try:
        BOT_TOKEN = '8325707242:AAHklanhfvOEUN9EaD9XyB4mB7AMPNZZnsM'
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
@rate_limit(max_requests=30)
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
    """Отправить уведомление курьерам"""
    try:
        BOT_TOKEN = '8325707242:AAHklanhfvOEUN9EaD9XyB4mB7AMPNZZnsM'
        if not BOT_TOKEN:
            return False

        db = get_db()
        # 🚨 ИСПРАВЛЕНИЕ: Добавляем извлечение building и entrance
        order = db.execute('''
                           SELECT o.*,
                                  json_extract(o.delivery_address, '$.city')           as city,
                                  json_extract(o.delivery_address, '$.street')         as street,
                                  json_extract(o.delivery_address, '$.house')          as house,
                                  json_extract(o.delivery_address, '$.building')       as building,
                                  json_extract(o.delivery_address, '$.entrance')       as entrance,
                                  json_extract(o.delivery_address, '$.apartment')      as apartment,
                                  json_extract(o.delivery_address, '$.floor')          as floor,
                                  json_extract(o.delivery_address, '$.doorcode')       as doorcode,
                                  json_extract(o.delivery_address, '$.comment')        as address_comment,
                                  json_extract(o.delivery_address, '$.recipient_name') as recipient_name_full,
                                  json_extract(o.delivery_address, '$.phone')          as phone_full
                           FROM orders o
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

        if not order:
            db.close()
            return False

        order_dict = dict(order)

        # АДРЕС ДЛЯ ОТОБРАЖЕНИЯ
        address_parts = []
        if order_dict.get('city'):
            address_parts.append(order_dict['city'])
        if order_dict.get('street'):
            address_parts.append(f"ул. {order_dict['street']}")
        if order_dict.get('house'):
            address_parts.append(f"д. {order_dict['house']}")
        if order_dict.get('building'):
            address_parts.append(f"к{order_dict['building']}")
        if order_dict.get('entrance'):
            address_parts.append(f"п{order_dict['entrance']}")
        if order_dict.get('apartment'):
            address_parts.append(f"кв{order_dict['apartment']}")

        address_full = ', '.join(address_parts) if address_parts else "Адрес не указан"

        # АДРЕС ДЛЯ НАВИГАТОРА (без кв)
        nav_parts = []
        if order_dict.get('city'):
            nav_parts.append(order_dict['city'])
        if order_dict.get('street'):
            nav_parts.append(f"улица {order_dict['street']}")
        if order_dict.get('house'):
            nav_parts.append(f"дом {order_dict['house']}")
        if order_dict.get('building'):
            nav_parts.append(f"корпус {order_dict['building']}")
        if order_dict.get('entrance'):
            nav_parts.append(f"подъезд {order_dict['entrance']}")

        nav_address = ', '.join(nav_parts)

        # ДЕТАЛИ
        address_details = []
        if order_dict.get('floor'):
            address_details.append(f"Этаж: {order_dict['floor']}")
        if order_dict.get('doorcode'):
            address_details.append(f"Домофон: {order_dict['doorcode']}")

        # СООБЩЕНИЕ
        text = f"🚚 *НОВЫЙ ЗАКАЗ ДЛЯ ДОСТАВКИ*\n\n"
        text += f"📦 *Заказ:* #{order_id}\n"
        text += f"👤 *Получатель:* {order_dict.get('recipient_name_full', order_dict.get('recipient_name', order_dict.get('username', 'Клиент')))}\n"
        text += f"📱 *Телефон:* {order_dict.get('phone_full', order_dict.get('phone_number', 'Не указан'))}\n"
        text += f"📍 *Адрес:* {address_full}\n"

        if address_details:
            text += f"\n📋 *Детали адреса:*\n"
            for detail in address_details:
                text += f"• {detail}\n"

        if order_dict.get('address_comment'):
            text += f"\n📝 *Комментарий к заказу:* {order_dict['address_comment']}\n"

        # ПРОДОЛЖАЕМ
        items_list = json.loads(order_dict['items']) if order_dict.get('items') else []
        text += f"\n📦 *Товаров:* {len(items_list)} шт\n"
        text += f"💰 *Сумма заказа:* {order_dict.get('total_price', 0)} ₽\n"

        if order_dict.get('payment_method') == 'cash':
            if order_dict.get('cash_received', 0) > 0:
                text += f"💵 *Оплата наличными:* {order_dict['cash_received']} ₽\n"
                if order_dict.get('cash_change', 0) > 0:
                    text += f"💰 *Сдача:* {order_dict['cash_change']} ₽\n"
            else:
                text += f"💵 *Оплата:* Наличными при получении\n"
        else:
            text += f"💳 *Оплата:* Картой онлайн\n"

        text += f"\n⏰ *Создан:* {order_dict.get('created_at', '')[:16]}\n"

        # КНОПКИ
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "✅ ВЗЯТЬ ЗАКАЗ", "callback_data": f"courier_take_{order_id}"},
                    {"text": "🚀 КУРЬЕР ПАНЕЛЬ", "callback_data": "courier_panel"}
                ]
            ]
        }

        if nav_address:
            keyboard["inline_keyboard"].append([
                {"text": "📍 ОТКРЫТЬ В НАВИГАТОРЕ",
                 "url": f"https://yandex.ru/maps/?text={nav_address.replace(' ', '+')}"}
            ])

        # ОТПРАВКА КУРЬЕРАМ
        couriers = db.execute('''
                              SELECT c.id, c.full_name, ct.telegram_id
                              FROM couriers c
                                       LEFT JOIN courier_telegram ct ON c.id = ct.courier_id
                              WHERE c.is_active = 1
                                AND ct.telegram_id IS NOT NULL
                              ''').fetchall()

        db.close()

        success_count = 0
        for courier in couriers:
            try:
                response = requests.post(
                    f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage',
                    json={
                        'chat_id': int(courier['telegram_id']),
                        'text': text,
                        'parse_mode': 'Markdown',
                        'reply_markup': json.dumps(keyboard)
                    },
                    timeout=10
                )
                if response.status_code == 200:
                    success_count += 1
            except:
                pass

        return success_count > 0

    except Exception as e:
        print(f"❌ Ошибка отправки курьерам: {e}")
        return False

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


def send_order_ready_notification(order_id):
    """Отправить уведомление клиенту что заказ готов к выдаче"""
    try:
        db = get_db()

        # Получаем информацию о заказе
        order = db.execute('''
                           SELECT o.*,
                                  (o.total_price + COALESCE(o.delivery_cost, 0) -
                                   COALESCE(o.discount_amount, 0)) as total_amount
                           FROM orders o
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

        if not order:
            print(f"❌ Заказ #{order_id} не найден")
            db.close()
            return False

        order_data = dict(order)
        telegram_id = order_data.get('user_id')

        if not telegram_id or telegram_id == 0:
            print(f"❌ У заказа #{order_id} нет telegram_id")
            db.close()
            return False

        # Получаем информацию о пункте выдачи
        pickup_display = order_data.get('pickup_point', '')
        if order_data.get('pickup_point'):
            try:
                if str(order_data['pickup_point']).isdigit():
                    pickup_info = db.execute(
                        'SELECT name, address, working_hours, phone FROM pickup_points WHERE id = ?',
                        (int(order_data['pickup_point']),)
                    ).fetchone()
                    if pickup_info:
                        pickup_display = f"{pickup_info['name']} - {pickup_info['address']}"
                        if pickup_info.get('working_hours'):
                            pickup_display += f"\n   ⌚ Часы работы: {pickup_info['working_hours']}"
                        if pickup_info.get('phone'):
                            pickup_display += f"\n   📞 Телефон: {pickup_info['phone']}"
                elif '|' in order_data['pickup_point']:
                    parts = order_data['pickup_point'].split('|')
                    if len(parts) >= 2:
                        pickup_display = f"{parts[1]} - {parts[2] if len(parts) > 2 else ''}"
            except Exception as e:
                print(f"⚠️ Ошибка получения информации о пункте выдачи: {e}")

        db.close()

        BOT_TOKEN = os.getenv('BOT_TOKEN', '8325707242:AAHklanhfvOEUN9EaD9XyB4mB7AMPNZZnsM')
        if not BOT_TOKEN:
            print("❌ BOT_TOKEN не установлен")
            return False

        # Формируем сообщение
        message = f"""✅ *ВАШ ЗАКАЗ ГОТОВ К ВЫДАЧЕ!*

📦 *Заказ №{order_id}*
💰 *Сумма:* {order_data.get('total_amount', 0):.2f} ₽

📍 *Пункт выдачи:*
{pickup_display}

⚠️ *ВАЖНО:*
• Заказ будет ждать вас в течение 24 часов
• При себе необходимо иметь номер заказа ({order_id})
• Оплата производится на месте (если не оплачено онлайн)

⏰ *Рекомендуем забрать заказ как можно скорее!*

🎉 *Спасибо за покупку!*"""

        # Кнопки для клиента
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "✅ ПОНЯЛ, ЗАБЕРУ", "callback_data": f"order_ack_{order_id}"}
                ],
                [
                    {"text": "📦 МОИ ЗАКАЗЫ", "callback_data": "my_orders"}
                ]
            ]
        }

        # Отправляем уведомление
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': int(telegram_id),
            'text': message,
            'parse_mode': 'Markdown',
            'reply_markup': json.dumps(keyboard)
        }

        print(f"📤 Отправка уведомления о готовности заказа #{order_id} клиенту {telegram_id}")
        response = requests.post(url, json=data, timeout=10)

        if response.status_code == 200:
            print(f"✅ Уведомление о готовности отправлено клиенту {telegram_id}")
            return True
        else:
            print(f"❌ Ошибка отправки уведомления о готовности: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Ошибка отправки уведомления о готовности: {e}")
        import traceback
        traceback.print_exc()
        return False

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
@rate_limit(max_requests=30, window=60)
@validate_json_request
def api_create_order():
    data = request.json
    db = get_db()
    order_id = None

    try:
        delivery_type = data.get('delivery_type')
        payment_method = data.get('payment_method', 'cash')
        delivery_address = data.get('delivery_address', '{}')
        promo_code = data.get('promo_code')

        # ========== ВАЛИДАЦИЯ ДАННЫХ ==========
        # Проверяем обязательные поля
        if not data.get('items') or len(data['items']) == 0:
            return jsonify({'success': False, 'error': 'Корзина пуста'}), 400

        if delivery_type not in ['courier', 'pickup']:
            return jsonify({'success': False, 'error': 'Неверный тип доставки'}), 400

        if delivery_type == 'courier':
            if not delivery_address or delivery_address == '{}':
                return jsonify({'success': False, 'error': 'Для курьерской доставки укажите адрес'}), 400

        if delivery_type == 'pickup' and not data.get('pickup_point'):
            return jsonify({'success': False, 'error': 'Для самовывоза выберите пункт выдачи'}), 400

        print("=" * 80)
        print("🎯 ПОЛНЫЙ ДЕБАГ ВХОДНЫХ ДАННЫХ:")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        print("=" * 80)

        # ========== ПРОВЕРКА ПРОМОКОДА ==========
        discount_amount = 0.0
        promo_code_id = None
        promo_dict = None

        if promo_code:
            try:
                promo_result = db.execute('''
                                          SELECT id,
                                                 discount_type,
                                                 value,
                                                 min_order_amount,
                                                 usage_limit,
                                                 used_count,
                                                 exclude_sale_items,
                                                 is_active
                                          FROM promo_codes
                                          WHERE code = ?
                                            AND is_active = 1
                                          ''', (promo_code.upper(),)).fetchone()

                if promo_result:
                    promo_dict = dict(promo_result)

                    if promo_dict['usage_limit'] and promo_dict['used_count'] >= promo_dict['usage_limit']:
                        print(f"⚠️ Промокод {promo_code} достиг лимита использований")
                    else:
                        items_total = 0.0
                        for item in data['items']:
                            price = float(item.get('price', 0))
                            quantity = float(item.get('quantity', 1))

                            if item.get('is_weight'):
                                items_total += float(item.get('price', 0))
                            else:
                                items_total += price * quantity

                        if promo_dict['min_order_amount'] and items_total < float(promo_dict['min_order_amount']):
                            print(f"⚠️ Промокод {promo_code} требует мин. сумму {promo_dict['min_order_amount']}")
                        else:
                            promo_code_id = promo_dict['id']

                            if promo_dict['discount_type'] == 'percentage':
                                discount_amount = items_total * (float(promo_dict['value']) / 100)
                            elif promo_dict['discount_type'] == 'fixed':
                                discount_amount = float(promo_dict['value'])
                            elif promo_dict['discount_type'] == 'free_delivery':
                                discount_amount = 0

                            print(f"✅ Применен промокод {promo_code}, скидка: {discount_amount} руб")
            except Exception as e:
                print(f"⚠️ Ошибка обработки промокода: {e}")
                discount_amount = 0.0

        # ========== РАСЧЕТ СТОИМОСТИ ==========
        try:
            order_total = 0.0

            for item in data['items']:
                if item.get('is_weight'):
                    item_total = float(item.get('price', 0))
                    order_total += item_total
                else:
                    price = float(item.get('price', 0))
                    quantity = float(item.get('quantity', 1))
                    item_total = price * quantity
                    order_total += item_total

            print(f"\n💰 ИТОГО ТОВАРЫ: {order_total} ₽")

            if discount_amount > 0:
                order_total = max(0, order_total - discount_amount)
                print(f"💰 Применена скидка по промокоду: {discount_amount} руб")
                print(f"💰 Сумма после скидки: {order_total} руб")

        except Exception as e:
            print(f"❌ Ошибка расчета: {e}")
            import traceback
            traceback.print_exc()
            order_total = 0.0

        # ========== РАСЧЕТ ДОСТАВКИ ==========
        delivery_cost = 0.0

        if delivery_type == 'courier':
            print(f"💰 Проверяем доставку: заказ {order_total} руб")

            if promo_code and promo_dict and promo_dict['discount_type'] == 'free_delivery':
                print(f"✅ Доставка бесплатная по промокоду {promo_code}")
            elif order_total < 1000.0:
                delivery_cost = 100.0
                print(f"💰 Доставка платная: +{delivery_cost} руб")
            else:
                print(f"✅ Доставка бесплатная (сумма заказа: {order_total} руб)")

        total_with_delivery = order_total + delivery_cost
        print(
            f"📊 Итоговая сумма: {total_with_delivery} руб (товары: {order_total} руб + доставка: {delivery_cost} руб)")

        # ========== ОПЛАТА НАЛИЧНЫМИ ==========
        cash_payment = data.get('cash_payment', {}) or {}
        cash_received = cash_payment.get('received', 0)
        cash_change = cash_payment.get('change', 0)

        try:
            cash_received = float(cash_received) if cash_received not in [None, '', 0] else 0.0
            cash_change = float(cash_change) if cash_change not in [None, '', 0] else 0.0
        except (ValueError, TypeError):
            cash_received = 0.0
            cash_change = 0.0

        if payment_method == 'cash' and cash_received == 0:
            cash_received = math.ceil(total_with_delivery / 500) * 500
            cash_change = cash_received - total_with_delivery
            print(f"💵 Авторасчет наличных: получено={cash_received}, сдача={cash_change}")

        cash_details = json.dumps(cash_payment, ensure_ascii=False) if cash_payment else None

        # ========== ОБРАБОТКА АДРЕСА - ИСПРАВЛЕННАЯ ВЕРСИЯ ==========
        address_obj = {}

        # Выводим для отладки
        print("📦 delivery_address содержимое:")
        print(f"Тип: {type(delivery_address)}")
        print(f"Значение: {delivery_address}")
        print("=" * 80)

        if isinstance(delivery_address, str):
            try:
                if delivery_address and delivery_address != '{}':
                    address_obj = json.loads(delivery_address)
                else:
                    address_obj = {}
            except json.JSONDecodeError as e:
                print(f"⚠️ Не удалось распарсить delivery_address как JSON: {e}")
                print(f"   Содержимое: {delivery_address}")
                address_obj = {}
        elif isinstance(delivery_address, dict):
            address_obj = delivery_address
        else:
            address_obj = {}

        print(f"📋 Распаршенный адрес: {json.dumps(address_obj, ensure_ascii=False, indent=2)}")

        # Извлекаем информацию из адреса
        recipient_name = ""
        phone_number = ""
        address_comment = ""

        if isinstance(address_obj, dict):
            recipient_name = address_obj.get('recipient_name', '')
            phone_number = address_obj.get('phone', '') or address_obj.get('phone_number', '')
            address_comment = address_obj.get('comment', '') or address_obj.get('address_comment', '')

        # ОБЯЗАТЕЛЬНЫЕ ПОЛЯ ДЛЯ АДРЕСА (только адресные данные)
        if delivery_type == 'courier':
            required_address_fields = ['city', 'street', 'house']
            missing_fields = []

            for field in required_address_fields:
                if not address_obj.get(field):
                    missing_fields.append(field)

            if missing_fields:
                error_messages = {
                    'city': 'город',
                    'street': 'улицу',
                    'house': 'номер дома'
                }
                errors = [error_messages.get(f, f) for f in missing_fields]
                return jsonify({
                    'success': False,
                    'error': f'Для доставки заполните: {", ".join(errors)}'
                }), 400

        # ПОИСК ИМЕНИ ПОЛУЧАТЕЛЯ (может быть в разных местах)
        print("🔍 Поиск recipient_name в данных:")

        # 1. Проверяем отдельное поле recipient_name в данных
        if not recipient_name:
            recipient_name = data.get('recipient_name', '')
            print(f"   В data.recipient_name: {recipient_name}")

        # 2. Проверяем delivery_data если есть
        if not recipient_name:
            delivery_data = data.get('delivery_data', {})
            if isinstance(delivery_data, dict):
                recipient_name = delivery_data.get('recipient_name', '')
                print(f"   В data.delivery_data: {recipient_name}")

        # 3. Проверяем в delivery_details
        if not recipient_name:
            delivery_details = data.get('delivery_details', {})
            if isinstance(delivery_details, dict):
                recipient_name = delivery_details.get('recipient_name', '')
                print(f"   В data.delivery_details: {recipient_name}")

        # 4. Берем из username если ничего не нашли
        if not recipient_name:
            recipient_name = data.get('username', 'Гость')
            print(f"   Используем username: {recipient_name}")

        # ПОИСК ТЕЛЕФОНА
        if not phone_number:
            phone_number = data.get('phone_number', '')
            if not phone_number:
                phone_number = data.get('phone', '')

        if not phone_number:
            phone_number = 'Не указан'

        # Проверяем что имя получателя есть
        if not recipient_name or recipient_name == 'Гость':
            return jsonify({
                'success': False,
                'error': 'Укажите имя получателя'
            }), 400

        print(f"✅ Найден recipient_name: {recipient_name}")
        print(f"✅ Найден phone_number: {phone_number}")
        print(f"✅ Комментарий: {address_comment}")

        # ДОБАВЛЯЕМ НЕДОСТАЮЩИЕ ПОЛЯ В ОБЪЕКТ АДРЕСА
        full_address_obj = address_obj.copy() if isinstance(address_obj, dict) else {}

        if 'recipient_name' not in full_address_obj:
            full_address_obj['recipient_name'] = recipient_name

        if 'phone' not in full_address_obj and phone_number != 'Не указан':
            full_address_obj['phone'] = phone_number

        if 'comment' not in full_address_obj and address_comment:
            full_address_obj['comment'] = address_comment

        print(f"📦 Финальный объект адреса для сохранения: {json.dumps(full_address_obj, ensure_ascii=False, indent=2)}")

        # ========== ОБРАБОТКА ПОЛЬЗОВАТЕЛЯ ==========
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

        # ========== СОХРАНЕНИЕ ЗАКАЗА ==========
        cursor = db.execute('''
                            INSERT INTO orders (user_id, username, items, total_price, delivery_cost, status,
                                                delivery_type, delivery_address, pickup_point,
                                                payment_method, recipient_name, phone_number,
                                                cash_received, cash_change, cash_details,
                                                promo_code_id, discount_amount)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                user_id,
                                username,
                                json.dumps(data['items'], ensure_ascii=False),
                                order_total,
                                delivery_cost,
                                'pending',
                                delivery_type,
                                json.dumps(full_address_obj, ensure_ascii=False),
                                data.get('pickup_point'),
                                payment_method,
                                recipient_name,
                                phone_number,
                                cash_received,
                                cash_change,
                                cash_details,
                                promo_code_id,
                                discount_amount
                            ))

        # ========== ОБНОВЛЕНИЕ ПРОМОКОДА ==========
        if promo_code_id:
            try:
                db.execute('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?',
                           (promo_code_id,))
                print(f"✅ Обновлен счетчик использований промокода #{promo_code_id}")
            except Exception as e:
                print(f"⚠️ Не удалось обновить счетчик промокода: {e}")

        # Получаем ID созданного заказа
        order_id = cursor.lastrowid
        print(f"✅ Заказ создан с ID: {order_id}")

        # Обновляем остатки товаров
        for item in data['items']:
            try:
                quantity = int(item.get('quantity', 1))
                product_id = item.get('id')

                if product_id:
                    if item.get('is_weight'):
                        weight = item.get('weight', 0)
                        if weight > 0:
                            db.execute('UPDATE products SET stock_weight = stock_weight - ? WHERE id = ?',
                                       (weight, product_id))
                    else:
                        db.execute('UPDATE products SET stock = stock - ? WHERE id = ?',
                                   (quantity, product_id))
            except Exception as e:
                print(f"⚠️ Ошибка обновления остатков для товара {item.get('id')}: {e}")

        db.commit()

        # Создаем активный чат для нового заказа
        try:
            db.execute('INSERT OR IGNORE INTO active_chats (order_id, customer_id, status) VALUES (?, ?, "active")',
                       (order_id, user_id))
            db.commit()
            print(f"✅ Создан активный чат для заказа #{order_id}")
        except Exception as e:
            print(f"⚠️ Не удалось создать чат: {e}")

        # ========== ОБРАБОТКА УВЕДОМЛЕНИЙ ==========
        if delivery_type == 'pickup':
            print(f"📦 ЗАКАЗ #{order_id} - САМОВЫВОЗ")

            if user_id and user_id > 0:
                try:
                    send_pickup_order_notification(
                        telegram_id=user_id,
                        order_id=order_id,
                        items=data.get('items', []),
                        pickup_point=data.get('pickup_point', ''),
                        order_total=order_total,
                        discount_amount=discount_amount,
                        username=username,
                        total_with_delivery=total_with_delivery
                    )
                except Exception as e:
                    print(f"   ❌ Ошибка отправки уведомления клиенту (самовывоз): {e}")

            try:
                send_admin_pickup_notification(order_id)
            except Exception as e:
                print(f"   ❌ Ошибка отправки уведомления админу (самовывоз): {e}")

        else:
            print(f"🚚 ЗАКАЗ #{order_id} - КУРЬЕРСКАЯ ДОСТАВКА")

            if user_id and user_id > 0:
                try:
                    send_order_details_notification(
                        telegram_id=user_id,
                        order_id=order_id,
                        items=data.get('items', []),
                        status='created',
                        delivery_type=delivery_type
                    )
                except Exception as e:
                    print(f"   ❌ Ошибка отправки клиенту (доставка): {e}")

            try:
                send_admin_order_notification(order_id)
            except Exception as e:
                print(f"   ❌ Ошибка отправки админу: {e}")

            if delivery_type == 'courier':
                try:
                    send_courier_order_notification(order_id)
                except Exception as e:
                    print(f"   ❌ Ошибка отправки курьерам: {e}")

        print(f"✅ Создан заказ #{order_id} для user_id={user_id}")
        print(f"💰 Итоговая сумма: {total_with_delivery} руб")
        print(f"📊 Скидка по промокоду: {discount_amount} руб")
        print(f"💵 Наличные: получено {cash_received} руб, сдача {cash_change} руб")

        print("\n📋 ИНФОРМАЦИЯ О ЗАКАЗЕ:")
        print(f"   Получатель: {recipient_name}")
        print(f"   Телефон: {phone_number}")
        print(f"   Тип доставки: {delivery_type}")

        if delivery_type == 'courier':
            print(
                f"   Адрес: {full_address_obj.get('city', '')}, ул. {full_address_obj.get('street', '')}, д. {full_address_obj.get('house', '')}")
            if full_address_obj.get('building'):
                print(f"   Корпус: {full_address_obj['building']}")
            if full_address_obj.get('entrance'):
                print(f"   Подъезд: {full_address_obj['entrance']}")
            if full_address_obj.get('apartment'):
                print(f"   Квартира: {full_address_obj['apartment']}")
            if full_address_obj.get('comment'):
                print(f"   Комментарий: {full_address_obj['comment']}")
        else:
            print(f"   Пункт выдачи: {data.get('pickup_point', 'Не указан')}")

        print("=" * 80)

        return jsonify({
            'success': True,
            'order_id': order_id,
            'delivery_cost': delivery_cost,
            'total_with_delivery': total_with_delivery,
            'discount_amount': discount_amount,
            'order_total': order_total
        })

    except Exception as e:
        print(f"❌ Ошибка создания заказа: {e}")
        import traceback
        traceback.print_exc()

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


def send_admin_order_notification(order_id):
    """Отправить уведомление админу о новом заказе"""
    try:
        BOT_TOKEN = '8325707242:AAHklanhfvOEUN9EaD9XyB4mB7AMPNZZnsM'
        ADMIN_TELEGRAM_IDS = 7331765165

        if not BOT_TOKEN:
            return False

        db = get_db()
        # 🚨 ИСПРАВЬТЕ И ЭТОТ ЗАПРОС:
        order = db.execute('''
                           SELECT o.*,
                                  json_extract(o.delivery_address, '$.city')           as city,
                                  json_extract(o.delivery_address, '$.street')         as street,
                                  json_extract(o.delivery_address, '$.house')          as house,
                                  json_extract(o.delivery_address, '$.building')       as building,  # ДОБАВЬТЕ
                                  json_extract(o.delivery_address, '$.entrance')       as entrance,  # ДОБАВЬТЕ
                                  json_extract(o.delivery_address, '$.apartment')      as apartment,
                                  json_extract(o.delivery_address, '$.floor')          as floor,
                                  json_extract(o.delivery_address, '$.doorcode')       as doorcode,
                                  json_extract(o.delivery_address, '$.comment')        as address_comment,
                                  json_extract(o.delivery_address, '$.recipient_name') as recipient_name_full,
                                  json_extract(o.delivery_address, '$.phone')          as phone_full,
                                  (o.total_price + COALESCE(o.delivery_cost, 0) -
                                   COALESCE(o.discount_amount, 0))                     as total_amount
                           FROM orders o
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

        if not order:
            db.close()
            return False

        order_data = dict(order)
        db.close()

        # ФОРМИРУЕМ АДРЕС
        address_parts = []
        if order_data.get('city'):
            address_parts.append(order_data['city'])
        if order_data.get('street'):
            address_parts.append(f"ул. {order_data['street']}")
        if order_data.get('house'):
            address_parts.append(f"д. {order_data['house']}")
        if order_data.get('building'):
            address_parts.append(f"к{order_data['building']}")
        if order_data.get('entrance'):
            address_parts.append(f"п{order_data['entrance']}")
        if order_data.get('apartment'):
            address_parts.append(f"кв{order_data['apartment']}")

        address_full = ', '.join(address_parts) if address_parts else "Адрес не указан"

        # ДЕТАЛИ АДРЕСА
        address_details = []
        if order_data.get('floor'):
            address_details.append(f"Этаж: {order_data['floor']}")
        if order_data.get('doorcode'):
            address_details.append(f"Домофон: {order_data['doorcode']}")

        # ТЕКСТ СООБЩЕНИЯ
        text = f"🆕 *НОВЫЙ ЗАКАЗ #{order_id}*\n\n"
        text += f"👤 *Получатель:* {order_data.get('recipient_name_full', order_data.get('recipient_name', order_data.get('username', 'Гость')))}\n"
        text += f"📱 *Телефон:* {order_data.get('phone_full', order_data.get('phone_number', 'Не указан'))}\n"

        if order_data.get('delivery_type') == 'courier':
            text += f"🚚 *Тип:* Доставка курьером\n"
            text += f"📍 *Адрес:* {address_full}\n"

            if address_details:
                text += f"\n📋 *Детали адреса:*\n"
                for detail in address_details:
                    text += f"• {detail}\n"

            # КОММЕНТАРИЙ ЕСЛИ ЕСТЬ
            if order_data.get('address_comment'):
                text += f"\n📝 *Комментарий к заказу:* {order_data['address_comment']}\n"
        else:
            text += f"🏪 *Тип:* Самовывоз\n"

        # ПРОДОЛЖАЕМ СООБЩЕНИЕ
        text += f"\n📦 *Товаров:* {len(json.loads(order_data['items'])) if order_data.get('items') else 0} шт\n"
        text += f"💰 *Сумма:* {order_data.get('total_amount', 0):.2f} ₽\n"
        text += f"💳 *Оплата:* {order_data.get('payment_method', 'cash')}\n"

        if order_data.get('discount_amount', 0) > 0:
            text += f"🎁 *Скидка:* {order_data.get('discount_amount', 0)} ₽\n"

        if order_data.get('cash_received', 0) > 0:
            text += f"💵 *Наличные:* получено {order_data.get('cash_received', 0)} ₽"
            if order_data.get('cash_change', 0) > 0:
                text += f", сдача {order_data.get('cash_change', 0)} ₽"
            text += "\n"

        text += f"⏰ *Создан:* {order_data.get('created_at', '')[:16]}\n"

        # КНОПКИ
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "📋 ДЕТАЛИ ЗАКАЗА", "callback_data": f"admin_order_{order_id}"},
                    {"text": "👨‍💼 АДМИН ПАНЕЛЬ", "callback_data": "admin_panel"}
                ]
            ]
        }

        # ОТПРАВКА
        admin_ids = []
        if isinstance(ADMIN_TELEGRAM_IDS, (int, float)):
            admin_ids = [int(ADMIN_TELEGRAM_IDS)]

        success_count = 0
        for admin_id in admin_ids:
            try:
                response = requests.post(
                    f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage',
                    json={
                        'chat_id': int(admin_id),
                        'text': text,
                        'parse_mode': 'Markdown',
                        'reply_markup': json.dumps(keyboard)
                    },
                    timeout=10
                )
                if response.status_code == 200:
                    success_count += 1
            except:
                pass

        return success_count > 0

    except Exception as e:
        print(f"❌ Ошибка отправки админу: {e}")
        return False



def handle_order_ready_callback(call):
    """Обработчик нажатия на кнопку 'Заказ готов'"""
    try:
        order_id = int(call.data.replace('order_ready_', ''))

        # Обновляем статус заказа
        db = get_db()
        db.execute('UPDATE orders SET status = ? WHERE id = ?',
                   ('ready_for_pickup', order_id))
        db.commit()
        db.close()

        # Отправляем уведомление клиенту
        send_order_ready_notification(order_id)

        # Отправляем ответ админу
        BOT_TOKEN = '8325707242:AAHklanhfvOEUN9EaD9XyB4mB7AMPNZZnsM'
        if BOT_TOKEN:
            url = f'https://api.telegram.org/bot{BOT_TOKEN}/answerCallbackQuery'
            data = {
                'callback_query_id': call.id,
                'text': f'✅ Заказ #{order_id} помечен как готовый. Клиент уведомлен!',
                'show_alert': True
            }
            requests.post(url, json=data)

            # Обновляем сообщение админа
            url = f'https://api.telegram.org/bot{BOT_TOKEN}/editMessageText'
            data = {
                'chat_id': call.message.chat.id,
                'message_id': call.message.message_id,
                'text': f"✅ *ЗАКАЗ #{order_id} ГОТОВ*\n\nКлиент получил уведомление о готовности заказа.",
                'parse_mode': 'Markdown'
            }
            requests.post(url, json=data)

    except Exception as e:
        print(f"❌ Ошибка обработки callback 'order_ready': {e}")

def send_admin_pickup_notification(order_id):
    """Отправить админу уведомление о заказе на самовывоз"""
    try:
        BOT_TOKEN = os.getenv('BOT_TOKEN')
        ADMIN_TELEGRAM_IDS = 7331765165

        print(f"👨‍💼 ОТПРАВКА АДМИНУ УВЕДОМЛЕНИЯ О САМОВЫВОЗЕ #{order_id}")

        if not BOT_TOKEN:
            print("❌ BOT_TOKEN не установлен")
            return False

        # Получаем ID админов
        admin_ids = []
        if ADMIN_TELEGRAM_IDS:
            try:
                # Если ADMIN_TELEGRAM_IDS это строка (несколько ID через запятую)
                if isinstance(ADMIN_TELEGRAM_IDS, str):
                    for admin_id in ADMIN_TELEGRAM_IDS.split(','):
                        admin_id = admin_id.strip()
                        if admin_id and admin_id.isdigit():
                            admin_ids.append(int(admin_id))
                # Если это уже число (один ID)
                elif isinstance(ADMIN_TELEGRAM_IDS, (int, float)):
                    admin_ids.append(int(ADMIN_TELEGRAM_IDS))
                # Если это список
                elif isinstance(ADMIN_TELEGRAM_IDS, list):
                    admin_ids = [int(id) for id in ADMIN_TELEGRAM_IDS if str(id).isdigit()]
            except Exception as e:
                print(f"⚠️ Ошибка обработки ADMIN_IDS: {e}")
                return False

        if not admin_ids:
            print("⚠️ Нет валидных ID админов для отправки уведомлений")
            return False

        db = get_db()

        # Получаем информацию о заказе
        order = db.execute('''
                           SELECT o.*,
                                  (o.total_price + COALESCE(o.delivery_cost, 0) -
                                   COALESCE(o.discount_amount, 0)) as total_amount
                           FROM orders o
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

        if not order:
            print(f"❌ Заказ #{order_id} не найден")
            db.close()
            return False

        order_data = dict(order)

        # Получаем информацию о пункте выдачи
        pickup_display = order_data.get('pickup_point', '')
        if order_data.get('pickup_point'):
            try:
                # Проверяем, является ли pickup_point числом (ID пункта выдачи)
                pickup_point_value = order_data['pickup_point']
                if str(pickup_point_value).isdigit():
                    pickup_info = db.execute(
                        'SELECT name, address, working_hours, phone FROM pickup_points WHERE id = ?',
                        (int(pickup_point_value),)
                    ).fetchone()
                    if pickup_info:
                        pickup_display = f"{pickup_info['name']}\n   📍 Адрес: {pickup_info['address']}"
                        if pickup_info.get('working_hours'):
                            pickup_display += f"\n   ⌚ Часы работы: {pickup_info['working_hours']}"
                        if pickup_info.get('phone'):
                            pickup_display += f"\n   📞 Телефон: {pickup_info['phone']}"
                        # ИСПРАВЛЕНИЕ: Если это Row объект, получаем значения по ключу
                        elif isinstance(pickup_info, sqlite3.Row):
                            pickup_display = f"{pickup_info['name']}\n   📍 Адрес: {pickup_info['address']}"
                            if pickup_info['working_hours']:
                                pickup_display += f"\n   ⌚ Часы работы: {pickup_info['working_hours']}"
                            if pickup_info['phone']:
                                pickup_display += f"\n   📞 Телефон: {pickup_info['phone']}"
                elif '|' in str(pickup_point_value):
                    parts = str(pickup_point_value).split('|')
                    if len(parts) >= 2:
                        pickup_display = f"{parts[1]}\n   📍 Адрес: {parts[2] if len(parts) > 2 else ''}"
            except Exception as e:
                print(f"⚠️ Ошибка получения информации о пункте выдачи: {e}")
                # Добавим более детальную информацию об ошибке
                import traceback
                traceback.print_exc()

        db.close()

        # Парсим товары
        items_list = []
        items_count = 0
        if order_data.get('items'):
            try:
                items_list = json.loads(order_data['items'])
                items_count = sum(item.get('quantity', 1) for item in items_list)
            except:
                items_list = []

        # Формируем сообщение для админа
        text = f"🏪 *НОВЫЙ ЗАКАЗ НА САМОВЫВОЗ #{order_id}*\n\n"
        text += f"👤 *Клиент:* {order_data.get('username', 'Гость')}\n"
        text += f"📱 *Телефон:* {order_data.get('phone_number', 'Не указан')}\n"
        text += f"📍 *Пункт выдачи:*\n{pickup_display}\n"
        text += f"📦 *Товаров:* {items_count} шт\n"
        text += f"💰 *Сумма:* {order_data.get('total_amount', 0):.2f} ₽\n"

        if order_data.get('discount_amount', 0) > 0:
            text += f"🎁 *Скидка:* {order_data.get('discount_amount', 0)} ₽\n"

        if order_data.get('cash_received', 0) > 0:
            text += f"💵 *Наличные:* {order_data.get('cash_received', 0)} ₽"
            if order_data.get('cash_change', 0) > 0:
                text += f" (сдача {order_data.get('cash_change', 0)} ₽)"
            text += "\n"

        text += f"⏰ *Создан:* {order_data.get('created_at', '')[:16]}\n"
        text += f"\n⚡ *Заказ готовится к выдаче!*"

        # Кнопки для админа (добавил кнопку "ГОТОВ")
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "📋 ДЕТАЛИ ЗАКАЗА", "callback_data": f"admin_order_{order_id}"},
                    {"text": "✅ ЗАКАЗ ГОТОВ", "callback_data": f"order_ready_{order_id}"}
                ],
                [
                    {"text": "👨‍💼 АДМИН ПАНЕЛЬ", "callback_data": "admin_panel"}]
            ]
        }

        # Отправляем всем админам
        success_count = 0
        for admin_id in admin_ids:
            try:
                url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
                data = {
                    'chat_id': int(admin_id),
                    'text': text,
                    'parse_mode': 'Markdown',
                    'reply_markup': json.dumps(keyboard)
                }

                print(f"   Отправка админу {admin_id}...")
                response = requests.post(url, json=data, timeout=10)

                if response.status_code == 200:
                    print(f"   ✅ Уведомление отправлено админу {admin_id}")
                    success_count += 1
                else:
                    print(f"   ❌ Ошибка отправки админу {admin_id}: {response.text}")

            except Exception as e:
                print(f"   ❌ Исключение при отправке админу {admin_id}: {e}")

        print(f"📨 Итог: отправлено {success_count}/{len(admin_ids)} админам")
        return success_count > 0

    except Exception as e:
        print(f"❌ Критическая ошибка в send_admin_pickup_notification: {e}")
        import traceback
        traceback.print_exc()
        return False

def send_pickup_order_notification(telegram_id, order_id, items, pickup_point, order_total, discount_amount, username,
                                   total_with_delivery):
    """Отправить специальное уведомление для заказа с самовывозом"""
    try:
        BOT_TOKEN = os.getenv('BOT_TOKEN')
        WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://telegram-shop-full.onrender.com/')

        print(f"📦 ОТПРАВКА УВЕДОМЛЕНИЯ О САМОВЫВОЗЕ ЗАКАЗА #{order_id}")

        if not telegram_id or telegram_id == 0:
            print("❌ Неверный telegram_id клиента")
            return False

        if not BOT_TOKEN:
            print("❌ BOT_TOKEN не установлен")
            return False

        # Получаем информацию о пункте выдачи из базы данных
        db = get_db()
        pickup_info = None
        if pickup_point:
            try:
                # Если pickup_point это ID (число), получаем данные из базы
                if pickup_point.isdigit():
                    pickup_info = db.execute(
                        'SELECT name, address, working_hours, phone FROM pickup_points WHERE id = ?',
                        (int(pickup_point),)
                    ).fetchone()
                else:
                    # Иначе используем как есть (текст)
                    pickup_info = {'name': pickup_point, 'address': pickup_point}
            except Exception as e:
                print(f"⚠️ Ошибка получения информации о пункте выдачи: {e}")
                pickup_info = None
        db.close()

        # Форматируем информацию о пункте выдачи
        pickup_text = ""
        if pickup_info:
            if isinstance(pickup_info, dict):
                # Если это словарь (уже имеет данные)
                pickup_text = f"📍 *Пункт выдачи:* {pickup_info.get('name', pickup_point)}\n"
                if pickup_info.get('address'):
                    pickup_text += f"   Адрес: {pickup_info['address']}\n"
                if pickup_info.get('working_hours'):
                    pickup_text += f"   Часы работы: {pickup_info['working_hours']}\n"
                if pickup_info.get('phone'):
                    pickup_text += f"   Телефон: {pickup_info['phone']}\n"
            else:
                # Если это объект Row из SQLite
                pickup_text = f"📍 *Пункт выдачи:* {pickup_info['name']}\n"
                if pickup_info['address']:
                    pickup_text += f"   Адрес: {pickup_info['address']}\n"
                if pickup_info['working_hours']:
                    pickup_text += f"   Часы работы: {pickup_info['working_hours']}\n"
                if pickup_info['phone']:
                    pickup_text += f"   Телефон: {pickup_info['phone']}\n"
        else:
            pickup_text = f"📍 *Пункт выдачи:* {pickup_point}\n"

        # Форматируем товары
        items_text = "📦 *Ваш заказ:*\n"
        total_items_value = 0

        for item in items:
            name = item.get('name', 'Товар')
            safe_name = name.replace('*', '\\*').replace('_', '\\_').replace('`', '\\`')

            if item.get('is_weight'):
                weight = item.get('weight', 0)
                price = item.get('price', 0)
                items_text += f"• *{safe_name}* = *{price} ₽*\n"
                total_items_value += price
            else:
                quantity = item.get('quantity', 1)
                price = item.get('price', 0)
                item_total = price * quantity
                items_text += f"• *{safe_name}* × {quantity} шт - *{item_total} ₽*\n"
                total_items_value += item_total

        # Скидка
        discount_info = ""
        if discount_amount > 0:
            discount_info = f"\n🎁 *Скидка:* -{discount_amount} ₽\n"

        # Итоговая сумма
        final_total = total_with_delivery

        # Формируем сообщение
        message = f"""🏪 *ВАШ ЗАКАЗ НА САМОВЫВОЗ #{order_id}*
        
{items_text}
{discount_info}
━━━━━━━━━━━━━━━━━━━━
💰 *ИТОГО: {final_total:.2f} ₽*

{pickup_text}
⏰ *Статус:* Ожидает сборки
📝 *Заберите заказ в течение 30 минут после уведомления о готовности*

🎯 *Заказ будет собран в ближайшее время! Мы уведомим вас, когда он будет готов к выдаче.*"""

        # URL для веб-приложения
        webapp_url = f"{WEBAPP_URL.rstrip('/')}/webapp?user_id={telegram_id}"

        # Кнопки для клиента
        keyboard = {
            "inline_keyboard": [
                [
                    {
                        "text": "🛒 ОТКРЫТЬ МАГАЗИН",
                        "web_app": {"url": webapp_url}
                    }],

                    [{"text": "📦 МОИ ЗАКАЗЫ", "callback_data": "my_orders"}]
            ]
        }

        # Отправляем
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': int(telegram_id),
            'text': message,
            'parse_mode': 'Markdown',
            'disable_web_page_preview': True,
            'reply_markup': json.dumps(keyboard)
        }

        print(f"   Отправка клиенту {telegram_id}...")
        response = requests.post(url, json=data, timeout=10)

        if response.status_code == 200:
            print(f"   ✅ Уведомление о самовывозе отправлено клиенту {telegram_id}")
            return True
        else:
            print(f"   ❌ Ошибка отправки клиенту: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Ошибка отправки уведомления о самовывозе: {e}")
        import traceback
        traceback.print_exc()
        return False


def send_pickup_order_notification(telegram_id, order_id, items, pickup_point, order_total, discount_amount, username,
                                   total_with_delivery):
    """Отправить специальное уведомление для заказа с самовывозом"""
    try:
        BOT_TOKEN = os.getenv('BOT_TOKEN')
        WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://telegram-shop-full.onrender.com/')

        print(f"📦 ОТПРАВКА УВЕДОМЛЕНИЯ О САМОВЫВОЗЕ ЗАКАЗА #{order_id}")

        if not telegram_id or telegram_id == 0:
            print("❌ Неверный telegram_id клиента")
            return False

        if not BOT_TOKEN:
            print("❌ BOT_TOKEN не установлен")
            return False

        # Получаем информацию о пункте выдачи из базы данных
        db = get_db()
        pickup_info = None
        pickup_display = pickup_point  # По умолчанию используем то, что пришло

        if pickup_point:
            try:
                # Если pickup_point это ID (число), получаем данные из базы
                if str(pickup_point).isdigit():
                    pickup_info = db.execute(
                        'SELECT name, address, working_hours, phone FROM pickup_points WHERE id = ?',
                        (int(pickup_point),)
                    ).fetchone()
                    if pickup_info:
                        # Форматируем для отображения
                        pickup_display = f"{pickup_info['name']} - {pickup_info['address']}"
                # Если это строка с форматом "id|name|address", парсим её
                elif '|' in pickup_point:
                    parts = pickup_point.split('|')
                    if len(parts) >= 2:
                        pickup_display = f"{parts[1]} - {parts[2] if len(parts) > 2 else ''}"
            except Exception as e:
                print(f"⚠️ Ошибка получения информации о пункте выдачи: {e}")
                pickup_info = None

        db.close()

        # Форматируем товары (правильно)
        items_text = "📦 *Ваш заказ:*\n"
        total_items_value = 0

        for item in items:
            name = item.get('name', 'Товар')
            # Убираем лишние повторы в названии
            if ' (' in name and ')' in name:
                # Убираем дублирование в названии типа "Бананы (3.00 кг) (3.00 кг)"
                name_parts = name.split(' (')
                if len(name_parts) > 1:
                    # Берем только первую часть до первой скобки
                    name = name_parts[0].strip()

            safe_name = name.replace('*', '\\*').replace('_', '\\_').replace('`', '\\`')

            if item.get('is_weight'):
                weight = item.get('weight', 0)
                price = item.get('price', 0)
                items_text += f"• *{safe_name}* = *{price} ₽*\n"
                total_items_value += price
            else:
                quantity = item.get('quantity', 1)
                price = item.get('price', 0)
                item_total = price * quantity
                items_text += f"• *{safe_name}* × {quantity} шт = *{item_total} ₽*\n"
                total_items_value += item_total

        # Скидка
        discount_info = ""
        if discount_amount > 0:
            discount_info = f"\n🎁 *Скидка:* -{discount_amount} ₽\n"

        # Итоговая сумма
        final_total = total_with_delivery

        # Формируем сообщение
        message = f"""🏪 *ВАШ ЗАКАЗ НА САМОВЫВОЗ #{order_id}*

{items_text}
{discount_info}
━━━━━━━━━━━━━━━━━━━━
💰 *ИТОГО: {final_total:.2f} ₽*

📍 *Пункт выдачи:* {pickup_display}

⏰ *Статус:* Ожидает сборки
📝 *Заберите заказ в течение 30 минут после уведомления о готовности*

🎯 *Заказ будет собран в ближайшее время! Мы уведомим вас, когда он будет готов к выдаче.*"""

        # URL для веб-приложения
        webapp_url = f"{WEBAPP_URL.rstrip('/')}/webapp?user_id={telegram_id}"

        # Кнопки для клиента
        keyboard = {
            "inline_keyboard": [
                [
                    {
                        "text": "🛒 ОТКРЫТЬ МАГАЗИН",
                        "web_app": {"url": webapp_url}
                    }],

                [{"text": "📦 МОИ ЗАКАЗЫ", "callback_data": "my_orders"}]
            ]
        }

        # Отправляем
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': int(telegram_id),
            'text': message,
            'parse_mode': 'Markdown',
            'disable_web_page_preview': True,
            'reply_markup': json.dumps(keyboard)
        }

        print(f"   Отправка клиенту {telegram_id}...")
        response = requests.post(url, json=data, timeout=10)

        if response.status_code == 200:
            print(f"   ✅ Уведомление о самовывозе отправлено клиенту {telegram_id}")
            return True
        else:
            print(f"   ❌ Ошибка отправки клиенту: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Ошибка отправки уведомления о самовывозе: {e}")
        import traceback
        traceback.print_exc()
        return False


def send_order_ready_notification(order_id):
    """Отправить уведомление клиенту что заказ готов к выдаче"""
    try:
        db = get_db()

        # Получаем информацию о заказе
        order = db.execute('''
                           SELECT o.*,
                                  (o.total_price + COALESCE(o.delivery_cost, 0) -
                                   COALESCE(o.discount_amount, 0)) as total_amount
                           FROM orders o
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

        if not order:
            print(f"❌ Заказ #{order_id} не найден")
            db.close()
            return False

        order_data = dict(order)
        telegram_id = order_data.get('user_id')

        if not telegram_id or telegram_id == 0:
            print(f"❌ У заказа #{order_id} нет telegram_id")
            db.close()
            return False

        # Получаем информацию о пункте выдачи
        pickup_display = order_data.get('pickup_point', '')
        if order_data.get('pickup_point'):
            try:
                if str(order_data['pickup_point']).isdigit():
                    pickup_info = db.execute(
                        'SELECT name, address, working_hours, phone FROM pickup_points WHERE id = ?',
                        (int(order_data['pickup_point']),)
                    ).fetchone()
                    if pickup_info:
                        pickup_display = f"{pickup_info['name']} - {pickup_info['address']}"
                        if pickup_info.get('working_hours'):
                            pickup_display += f"\n   ⌚ Часы работы: {pickup_info['working_hours']}"
                        if pickup_info.get('phone'):
                            pickup_display += f"\n   📞 Телефон: {pickup_info['phone']}"
                elif '|' in order_data['pickup_point']:
                    parts = order_data['pickup_point'].split('|')
                    if len(parts) >= 2:
                        pickup_display = f"{parts[1]} - {parts[2] if len(parts) > 2 else ''}"
            except Exception as e:
                print(f"⚠️ Ошибка получения информации о пункте выдачи: {e}")

        db.close()

        BOT_TOKEN = os.getenv('BOT_TOKEN')
        if not BOT_TOKEN:
            print("❌ BOT_TOKEN не установлен")
            return False

        # Формируем сообщение
        message = f"""✅ *ВАШ ЗАКАЗ ГОТОВ К ВЫДАЧЕ!*

📦 *Заказ №{order_id}*
💰 *Сумма:* {order_data.get('total_amount', 0):.2f} ₽

📍 *Пункт выдачи:*
{pickup_display}

⚠️ *ВАЖНО:*
• Заказ будет ждать вас в течение 24 часов
• При себе необходимо иметь номер заказа ({order_id})
• Оплата производится на месте (если не оплачено онлайн)

⏰ *Рекомендуем забрать заказ как можно скорее!*

🎉 *Спасибо за покупку!*"""

        # Отправляем уведомление
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': int(telegram_id),
            'text': message,
            'parse_mode': 'Markdown'}

        print(f"📤 Отправка уведомления о готовности заказа #{order_id} клиенту {telegram_id}")
        response = requests.post(url, json=data, timeout=10)

        if response.status_code == 200:
            print(f"✅ Уведомление о готовности отправлено клиенту {telegram_id}")
            return True
        else:
            print(f"❌ Ошибка отправки уведомления о готовности: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Ошибка отправки уведомления о готовности: {e}")
        import traceback
        traceback.print_exc()
        return False

@app.route('/api/admin/orders/<int:order_id>/ready-for-pickup', methods=['POST'])
def admin_mark_order_ready_for_pickup(order_id):
    """Пометить заказ как готовый к выдаче (самовывоз)"""
    db = get_db()
    try:
        # Получаем заказ
        order = db.execute('SELECT * FROM orders WHERE id = ?', (order_id,)).fetchone()
        if not order:
            return jsonify({'success': False, 'error': 'Заказ не найден'}), 404

        order_dict = dict(order)

        # Проверяем что это самовывоз
        if order_dict.get('delivery_type') != 'pickup':
            return jsonify({'success': False, 'error': 'Это не заказ на самовывоз'}), 400

        # Обновляем статус заказа
        db.execute('UPDATE orders SET status = ? WHERE id = ?',
                   ('ready_for_pickup', order_id))

        db.commit()

        # Отправляем уведомление клиенту что заказ готов
        send_order_ready_notification(order_id)

        return jsonify({
            'success': True,
            'message': 'Заказ помечен как готовый к выдаче. Клиент получил уведомление.'
        })

    except Exception as e:
        print(f"❌ Ошибка пометки заказа как готового: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/pickup-points-with-details', methods=['GET'])
def get_pickup_points_with_details():
    """Получить точки самовывоза с полной информацией"""
    db = get_db()
    try:
        points = db.execute('''
                            SELECT id,
                                   name,
                                   address,
                                   working_hours,
                                   phone,
                                   latitude,
                                   longitude,
                                   is_active
                            FROM pickup_points
                            WHERE is_active = 1
                            ORDER BY name
                            ''').fetchall()

        result = []
        for point in points:
            point_dict = dict(point)
            # Форматируем для фронтенда
            point_dict['display_name'] = f"{point_dict['name']} - {point_dict['address']}"
            result.append(point_dict)

        return jsonify(result)
    except Exception as e:
        print(f"❌ Ошибка получения точек самовывоза: {e}")
        return jsonify([])
    finally:
        db.close()

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
@rate_limit(max_requests=30)
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
def api_update_order_status():
    try:
        data = request.get_json()
        order_id = data.get('order_id')
        courier_id = data.get('courier_id')
        status = data.get('status')
        photo_data = data.get('photo_data')
        notes = data.get('notes')

        conn = get_db_connection()

        if status == 'delivered':
            # Обновляем заказ в основной таблице
            conn.execute('''
                         UPDATE orders
                         SET status       = 'delivered',
                             delivered_at = CURRENT_TIMESTAMP
                         WHERE id = ?
                         ''', (order_id,))

            # Обновляем assignment - ИСПРАВЛЕНО: courier_assignments → order_assignments
            conn.execute('''
                         UPDATE order_assignments
                         SET status       = 'delivered',
                             photo_proof  = ?,
                             delivered_at = CURRENT_TIMESTAMP
                         WHERE order_id = ?
                           AND courier_id = ?
                         ''', (photo_data, order_id, courier_id))

        elif status == 'picked_up':
            # Обновляем только статус
            conn.execute('''
                         UPDATE order_assignments 
                         SET status       = 'picked_up',
                             delivery_started = CURRENT_TIMESTAMP 
                         WHERE order_id = ?
                           AND courier_id = ?
                         ''', (order_id, courier_id))

        else:
            # Простое обновление статуса
            conn.execute('''
                         UPDATE order_assignments
                         SET status = ?
                         WHERE order_id = ?
                           AND courier_id = ?
                         ''', (status, order_id, courier_id))

        conn.commit()
        conn.close()

        return jsonify({'success': True, 'message': f'Статус обновлен на {status}'})

    except Exception as e:
        print(f"Error updating status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== НОВЫЕ API ДЛЯ АДМИНКИ - ДЕТАЛИЗАЦИЯ ЗАКАЗОВ ==========
@app.route('/api/admin/orders/<int:order_id>', methods=['GET'])
@rate_limit(max_requests=30)
def admin_get_order_details(order_id):
    """Получить детали заказа для админки"""
    db = get_db()
    try:
        order = db.execute('''
                           SELECT o.*,
                                  pc.code as promo_code
                           FROM orders o
                                    LEFT JOIN promo_codes pc ON o.promo_code_id = pc.id
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

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
                   o.cash_details,
                   o.discount_amount,
                   pc.code as promo_code,
                   (o.total_price + COALESCE(o.delivery_cost, 0) - COALESCE(o.discount_amount, 0)) as total_with_discount
            FROM orders o
                LEFT JOIN order_assignments a ON o.id = a.order_id
                LEFT JOIN couriers c ON a.courier_id = c.id
                LEFT JOIN promo_codes pc ON o.promo_code_id = pc.id
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
@app.route('/api/admin/dashboard', methods=['GET'])
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


@app.route('/api/courier/complete-delivery', methods=['POST'])
def api_complete_delivery():
    try:
        data = request.get_json()
        order_id = data.get('order_id')
        courier_id = data.get('courier_id')
        photo_data = data.get('photo_data')
        delivery_notes = data.get('delivery_notes')
        delivered_at = data.get('delivered_at')

        # Обновляем заказ
        conn = get_db_connection()

        # Сначала обновляем основную таблицу заказов
        conn.execute('''
                     UPDATE orders
                     SET status         = 'delivered',
                         delivered_at   = ?,
                         delivery_notes = ?
                     WHERE id = ?
                     ''', (delivered_at, delivery_notes, order_id))

        # Затем обновляем assignment - ИСПРАВЛЕНО: courier_assignments → order_assignments
        conn.execute('''
                     UPDATE order_assignments 
                     SET status       = 'delivered',
                         delivered_at = ?,
                         photo_proof  = ?
                     WHERE order_id = ?
                       AND courier_id = ?
                     ''', (delivered_at, photo_data, order_id, courier_id))

        conn.commit()
        conn.close()

        return jsonify({'success': True, 'message': 'Доставка подтверждена'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


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


@app.route('/api/admin/promo-codes', methods=['POST'])
def create_promo_code():
    """Создание нового промокода"""
    db = get_db()
    try:
        data = request.json
        if not data:
            return jsonify({"success": False, "error": "Нет данных"}), 400

        required_fields = ['code', 'discount_type', 'value']
        for field in required_fields:
            if field not in data:
                return jsonify({"success": False, "error": f"Отсутствует поле: {field}"}), 400

        # Генерация кода, если не предоставлен
        code = data['code'].upper().strip()
        discount_type = data['discount_type']
        value = float(data['value'])

        # Проверка существования кода
        existing = db.execute('SELECT id FROM promo_codes WHERE code = ?', (code,)).fetchone()
        if existing:
            return jsonify({"success": False, "error": "Такой промокод уже существует"}), 400

        # Создание промокода
        cursor = db.execute('''
            INSERT INTO promo_codes (
                code, discount_type, value, usage_limit, used_count,
                min_order_amount, start_date, end_date, is_active,
                one_per_customer, exclude_sale_items, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (
            code,
            discount_type,
            value,
            data.get('usage_limit'),
            data.get('used_count', 0),
            data.get('min_order_amount', 0),
            data.get('start_date'),
            data.get('end_date'),
            data.get('is_active', True),
            data.get('one_per_customer', False),
            data.get('exclude_sale_items', False)
        ))

        promo_id = cursor.lastrowid
        db.commit()

        return jsonify({
            "success": True,
            "message": "Промокод создан",
            "id": promo_id
        }), 201

    except Exception as e:
        print(f"❌ Ошибка создания промокода: {e}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        db.close()

@app.route('/api/admin/promo-codes/<int:promo_id>', methods=['DELETE'])
def delete_promo_code(promo_id):
    """Удаление промокода"""
    db = get_db()
    try:
        # Проверяем существование промокода
        promo = db.execute('SELECT id FROM promo_codes WHERE id = ?', (promo_id,)).fetchone()
        if not promo:
            return jsonify({"success": False, "error": "Промокод не найден"}), 404

        # Проверяем, используется ли промокод в заказах
        usage_count = db.execute('SELECT COUNT(*) FROM orders WHERE promo_code_id = ?', (promo_id,)).fetchone()[0]
        if usage_count > 0:
            return jsonify({
                "success": False,
                "error": "Нельзя удалить промокод, который уже использовался в заказах"
            }), 400

        # Удаляем промокод
        db.execute('DELETE FROM promo_codes WHERE id = ?', (promo_id,))
        db.commit()

        return jsonify({"success": True, "message": "Промокод удален"})

    except Exception as e:
        print(f"❌ Ошибка удаления промокода: {e}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        db.close()

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
            # Проблема: нужно добавить поддержку весовых товаров
            products = db.execute('''
                                  SELECT p.*,
                                         pc.name as category_name,
                                         CASE
                                             WHEN p.product_type = 'weight' AND p.stock_weight > 0 THEN p.stock_weight
                                             ELSE p.stock
                                             END as display_stock,
                                         CASE
                                             WHEN p.product_type = 'weight' AND p.price_per_kg > 0 THEN p.price_per_kg
                                             ELSE p.price
                                             END as display_price
                                  FROM products p
                                           LEFT JOIN product_categories pc ON p.category_id = pc.id
                                  ORDER BY p.created_at DESC
                                  ''').fetchall()

            return jsonify([dict(product) for product in products])
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
@rate_limit(max_requests=30)
def api_admin_orders():
    """API для админки - получение заказов"""
    try:
        db = get_db()

        # Получаем все заказы с информацией о курьере и промокоде
        orders = db.execute('''
            SELECT o.*,
                   a.status    as assignment_status,
                   c.full_name as courier_name,
                   c.phone     as courier_phone,
                   pc.code as promo_code,
                   (o.total_price + COALESCE(o.delivery_cost, 0) - COALESCE(o.discount_amount, 0)) as total_with_discount
            FROM orders o
            LEFT JOIN order_assignments a ON o.id = a.order_id
            LEFT JOIN couriers c ON a.courier_id = c.id
            LEFT JOIN promo_codes pc ON o.promo_code_id = pc.id
            ORDER BY o.created_at DESC LIMIT 100
        ''').fetchall()

        if not orders:
            return jsonify([])

        orders_list = []
        for order in orders:
            order_dict = dict(order)

            # Парсим items
            try:
                if order_dict.get('items'):
                    order_dict['items'] = json.loads(order_dict['items'])
                else:
                    order_dict['items'] = []
            except:
                order_dict['items'] = []

            # Парсим адрес доставки
            if order_dict.get('delivery_address'):
                try:
                    order_dict['delivery_address'] = json.loads(order_dict['delivery_address'])
                except:
                    order_dict['delivery_address'] = {}

            # Форматируем дату
            if order_dict.get('created_at'):
                try:
                    dt = datetime.strptime(order_dict['created_at'], '%Y-%m-%d %H:%M:%S')
                    order_dict['created_at_formatted'] = dt.strftime('%d.%m.%Y %H:%M')
                except:
                    order_dict['created_at_formatted'] = order_dict['created_at'][:16]

            orders_list.append(order_dict)

        return jsonify(orders_list)

    except Exception as e:
        print(f"❌ Ошибка получения заказов для админки: {e}")
        return jsonify([])
    finally:
        if 'db' in locals():
            db.close()

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

            # 🚨 ИСПРАВЛЕНИЕ: Добавляем недостающие поля building, entrance и comment
            cursor = db.execute('''
                                INSERT INTO user_addresses (
                                    user_id, city, street, house, 
                                    building, entrance, apartment, floor, doorcode,
                                    recipient_name, phone, comment, is_default
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (
                                    user_id,
                                    data['city'],
                                    data['street'],
                                    data['house'],
                                    # 🚨 ДОБАВЛЯЕМ ПРОПУЩЕННЫЕ ПОЛЯ:
                                    data.get('building', ''),
                                    data.get('entrance', ''),
                                    data.get('apartment', ''),
                                    data.get('floor', ''),
                                    data.get('doorcode', ''),
                                    data['recipient_name'],
                                    data.get('phone', ''),
                                    data.get('comment', ''),
                                    is_default
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


@app.route('/api/admin/categories/tree/<int:id>', methods=['GET', 'PUT', 'DELETE'])
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


def handle_order_completed_callback_webhook(call):
    """Обработка кнопки 'Заказ выдан' через вебхук"""
    try:
        order_id = int(call['data'].replace('order_completed_', ''))

        # Обновляем статус заказа
        db = get_db()
        db.execute('UPDATE orders SET status = ? WHERE id = ?',
                   ('completed', order_id))
        db.commit()

        # Получаем информацию о заказе для отправки уведомления клиенту
        order = db.execute('''
                           SELECT o.*, u.username
                           FROM orders o
                           LEFT JOIN telegram_users u ON o.user_id = u.telegram_id
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()
        db.close()

        if order:
            telegram_id = order['user_id']
            if telegram_id:
                # Отправляем уведомление клиенту, что заказ выдан
                BOT_TOKEN = os.getenv('BOT_TOKEN', '8325707242:AAHklanhfvOEUN9EaD9XyB4mB7AMPNZZnsM')
                if BOT_TOKEN:
                    message = f"✅ *ЗАКАЗ #{order_id} ВЫДАН*\n\n" \
                              f"Ваш заказ был успешно выдан. Спасибо за покупку!\n\n" \
                              f"Если у вас есть вопросы, свяжитесь с нами."

                    url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
                    requests.post(url, json={
                        'chat_id': int(telegram_id),
                        'text': message,
                        'parse_mode': 'Markdown'
                    }, timeout=5)

        # Ответ админу
        BOT_TOKEN = os.getenv('BOT_TOKEN', '8325707242:AAHklanhfvOEUN9EaD9XyB4mB7AMPNZZnsM')
        if BOT_TOKEN:
            # Ответ на callback query
            answer_url = f'https://api.telegram.org/bot{BOT_TOKEN}/answerCallbackQuery'
            requests.post(answer_url, json={
                'callback_query_id': call['id'],
                'text': f'✅ Заказ #{order_id} помечен как выданный.',
                'show_alert': True
            }, timeout=5)

            # Обновляем сообщение админа
            message = call['message']
            edit_url = f'https://api.telegram.org/bot{BOT_TOKEN}/editMessageText'
            requests.post(edit_url, json={
                'chat_id': message['chat']['id'],
                'message_id': message['message_id'],
                'text': f"✅ *ЗАКАЗ #{order_id} ЗАВЕРШЕН*\n\nЗаказ был выдан клиенту.",
                'parse_mode': 'Markdown'
            }, timeout=5)

        return jsonify({'ok': True})

    except Exception as e:
        print(f"❌ Ошибка в handle_order_completed_callback_webhook: {e}")
        return jsonify({'ok': False, 'error': str(e)})

def handle_order_ready_callback_webhook(call):
    """Обработка кнопки 'Заказ готов' через вебхук"""
    try:
        order_id = int(call['data'].replace('order_ready_', ''))

        # Обновляем статус заказа
        db = get_db()
        db.execute('UPDATE orders SET status = ? WHERE id = ?',
                   ('ready_for_pickup', order_id))
        db.commit()

        # Отправляем уведомление клиенту что заказ готов
        send_order_ready_notification(order_id)

        # Ответ админу
        BOT_TOKEN = os.getenv('BOT_TOKEN', '8325707242:AAHklanhfvOEUN9EaD9XyB4mB7AMPNZZnsM')
        if BOT_TOKEN:
            # Ответ на callback query
            answer_url = f'https://api.telegram.org/bot{BOT_TOKEN}/answerCallbackQuery'
            requests.post(answer_url, json={
                'callback_query_id': call['id'],
                'text': f'✅ Заказ #{order_id} помечен как готовый. Клиент уведомлен!',
                'show_alert': True
            }, timeout=5)

            # Обновляем сообщение админа с новыми кнопками
            message = call['message']
            edit_url = f'https://api.telegram.org/bot{BOT_TOKEN}/editMessageText'
            requests.post(edit_url, json={
                'chat_id': message['chat']['id'],
                'message_id': message['message_id'],
                'text': f"✅ *ЗАКАЗ #{order_id} ГОТОВ К ВЫДАЧЕ*\n\nКлиент получил уведомление о готовности заказа.\n\nНажмите '✅ ВЫДАН' когда клиент заберет заказ.",
                'parse_mode': 'Markdown',
                'reply_markup': json.dumps({
                    "inline_keyboard": [
                        [
                            {"text": "📋 ДЕТАЛИ ЗАКАЗА", "callback_data": f"admin_order_{order_id}"},
                            {"text": "✅ ВЫДАН", "callback_data": f"order_completed_{order_id}"}
                        ],
                        [
                            {"text": "👨‍💼 АДМИН ПАНЕЛЬ", "callback_data": "admin_panel"}
                        ]
                    ]
                })
            }, timeout=5)

        return jsonify({'ok': True})

    except Exception as e:
        print(f"❌ Ошибка в handle_order_ready_callback_webhook: {e}")
        return jsonify({'ok': False, 'error': str(e)})

# ========== НАСТРОЙКА TELEGRAM WEBHOOK ==========
@app.route('/api/telegram-webhook', methods=['POST'])
def telegram_webhook():
    """Обработчик вебхуков от Telegram"""
    try:
        data = request.get_json()
        print(f"📥 Telegram webhook received: {json.dumps(data, ensure_ascii=False)[:500]}...")

        # Обработка callback query
        if 'callback_query' in data:
            call = data['callback_query']
            call_data = call.get('data', '')

            print(f"🔄 Processing callback: {call_data}")

            # Обработка нажатия на кнопку "Заказ готов" для самовывоза
            if call_data.startswith('order_ready_'):
                return handle_order_ready_callback_webhook(call)

            # Обработка нажатия на кнопку "Заказ выдан" для самовывоза
            elif call_data.startswith('order_completed_'):
                return handle_order_completed_callback_webhook(call)

        # Обработка обычных сообщений (если нужно)
        elif 'message' in data:
            message = data['message']
            text = message.get('text', '')
            chat_id = message['chat']['id']

            print(f"💬 Message from {chat_id}: {text}")

            # Обработка команд
            if text.startswith('/'):
                return handle_telegram_command(chat_id, text)

        return jsonify({'ok': True})

    except Exception as e:
        print(f"❌ Ошибка в обработчике вебхука: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'ok': False, 'error': str(e)}), 500


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