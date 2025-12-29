import os
import sqlite3
import json
import uuid
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
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB лимит

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Создаем папку для загрузок если её нет
UPLOAD_PATH = app.config['UPLOAD_FOLDER']
if not os.path.exists(UPLOAD_PATH):
    os.makedirs(UPLOAD_PATH)
    print(f"📁 Создана папка для загрузок: {UPLOAD_PATH}")


def allowed_file(filename):
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ========== БАЗА ДАННЫХ ==========
def get_db():
    """Подключение к БД"""
    conn = sqlite3.connect(app.config['DATABASE'])
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Инициализация БД"""
    with app.app_context():
        db = get_db()
        cursor = db.cursor()

        # Таблица курьеров (ПАРОЛЬ ХРАНИМ В ОТКРЫТОМ ВИДЕ!)
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
                           NULL, -- Пароль в открытом виде
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

        # Таблица назначений заказов
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

        # Тестовые курьеры (пароль в открытом виде)
        if cursor.execute("SELECT COUNT(*) FROM couriers").fetchone()[0] == 0:
            cursor.executemany('''
                               INSERT INTO couriers (username, password, full_name, phone, vehicle_type)
                               VALUES (?, ?, ?, ?, ?)
                               ''', [
                                   ('courier1', '123456', 'Иван Курьеров', '+79991112233', 'car'),
                                   ('courier2', '123456', 'Петр Доставкин', '+79992223344', 'bike'),
                                   ('courier3', '123456', 'Алексей Развозов', '+79993334455', 'foot'),
                                   ('admin', 'admin123', 'Администратор', '+79990000000', 'car')
                               ])
            print("✅ Созданы тестовые курьеры")

        # Таблица товаров
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
                           stock
                           INTEGER
                           DEFAULT
                           0,
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP
                       )
                       ''')

        # Таблица заказов
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
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP
                       )
                       ''')

        # Таблица адресов пользователей
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

        # Таблица точек самовывоза
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

        # Таблица истории статусов заказов
        cursor.execute('''
                       CREATE TABLE IF NOT EXISTS order_status_history
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
                           status
                           TEXT
                           NOT
                           NULL,
                           notes
                           TEXT,
                           changed_at
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

        # Тестовые товары
        if cursor.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            test_products = [
                ('iPhone 15 Pro', 'Новый Apple смартфон', 99999,
                 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-7inch?wid=5120&hei=2880&fmt=webp&qlt=70&.v=1693009279096',
                 'Телефоны', 10),
                ('Samsung Galaxy S23', 'Флагман Samsung', 89999,
                 'https://images.samsung.com/is/image/samsung/p6pim/ru/2302/gallery/ru-galaxy-s23-s911-sm-s911bzadeub-534866168?$650_519_PNG$',
                 'Телефоны', 15),
                ('Наушники Sony WH-1000XM5', 'Беспровные с шумоподавлением', 34999,
                 'https://sony.scene7.com/is/image/sonyglobalsolutions/WH-1000XM5-B_primary-image?$categorypdpnav$&fmt=png-alpha',
                 'Аксессуары', 20),
                ('MacBook Air M2', 'Ультратонкий ноутбук Apple', 129999,
                 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/macbook-air-midnight-select-20220606?wid=904&hei=840&fmt=jpeg&qlt=90&.v=1653084303665',
                 'Ноутбуки', 8),
                ('Клавиатура Logitech', 'Игровая клавиатура', 8999,
                 'https://resource.logitechg.com/w_386,ar_1.0,c_limit,f_auto,q_auto,dpr_2.0/d_transparent.gif/content/dam/gaming/en/products/pro-x/pro-x-keyboard-gallery-1.png?v=1',
                 'Аксессуары', 30),
                ('Мышь Razer DeathAdder', 'Игровая мышь', 6999,
                 'https://assets2.razerzone.com/images/og-image/razer-deathadder-v3-pro-og-1200x630.jpg', 'Аксессуары',
                 25)
            ]
            cursor.executemany(
                'INSERT INTO products (name, description, price, image_url, category, stock) VALUES (?, ?, ?, ?, ?, ?)',
                test_products)
            print("✅ Созданы тестовые товары")

        # Тестовые точки самовывоза
        if cursor.execute("SELECT COUNT(*) FROM pickup_points").fetchone()[0] == 0:
            pickup_points = [
                ('Магазин на Ленина', 'ул. Ленина, 15', '09:00-21:00', '+7 (999) 123-45-67'),
                ('ТЦ Центральный', 'пр. Мира, 42, 2 этаж', '10:00-22:00', '+7 (999) 765-43-21'),
                ('Склад на Заводской', 'ул. Заводская, 7', '08:00-20:00', '+7 (999) 555-55-55')
            ]
            cursor.executemany('INSERT INTO pickup_points (name, address, working_hours, phone) VALUES (?, ?, ?, ?)',
                               pickup_points)
            print("✅ Созданы точки самовывоза")

        db.commit()
        db.close()
        print("✅ База данных инициализирована")


# Инициализируем БД при старте
init_db()


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


@app.route('/api/categories')
def api_categories():
    db = get_db()
    try:
        categories = db.execute(
            'SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != "" ORDER BY category').fetchall()
        return jsonify([row['category'] for row in categories])
    except Exception as e:
        print(f"❌ Ошибка получения категорий: {e}")
        return jsonify([])
    finally:
        db.close()


@app.route('/api/create-order', methods=['POST'])
def api_create_order():
    data = request.json
    db = get_db()
    try:
        delivery_type = data.get('delivery_type')
        payment_method = data.get('payment_method', 'cash')
        delivery_address = data.get('delivery_address', '{}')

        if isinstance(delivery_address, str):
            try:
                delivery_address = json.loads(delivery_address)
            except:
                delivery_address = {}

        recipient_name = delivery_address.get('recipient_name', data.get('recipient_name', ''))
        phone_number = delivery_address.get('phone', data.get('phone_number', ''))

        cursor = db.execute('''
                            INSERT INTO orders (user_id, username, items, total_price, status, delivery_type,
                                                delivery_address, pickup_point, payment_method, recipient_name,
                                                phone_number)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                data.get('user_id', 0),
                                data.get('username', 'Гость'),
                                json.dumps(data['items'], ensure_ascii=False),
                                data['total'],
                                'pending',
                                delivery_type,
                                json.dumps(delivery_address, ensure_ascii=False),
                                data.get('pickup_point'),
                                payment_method,
                                recipient_name,
                                phone_number
                            ))

        for item in data['items']:
            db.execute('UPDATE products SET stock = stock - ? WHERE id = ?', (item['quantity'], item['id']))

        db.commit()
        order_id = cursor.lastrowid
        db.close()

        print(f"✅ Создан заказ #{order_id} на сумму {data['total']} руб.")
        return jsonify({'success': True, 'order_id': order_id})
    except Exception as e:
        db.close()
        print(f"❌ Ошибка создания заказа: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== API ДЛЯ КУРЬЕРОВ (БЕЗ ХЭШИРОВАНИЯ) ==========
@app.route('/api/courier/login', methods=['POST'])
def courier_login():
    """Вход курьера - ПРОСТАЯ ПРОВЕРКА БЕЗ ХЭШИРОВАНИЯ"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        print(f"📱 Попытка входа: {username} / {password}")

        if not username or not password:
            return jsonify({'success': False, 'error': 'Введите логин и пароль'}), 400

        db = get_db()
        courier = db.execute('SELECT * FROM couriers WHERE username = ? AND is_active = 1', (username,)).fetchone()
        db.close()

        if not courier:
            print(f"❌ Курьер не найден: {username}")
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        # ПРОСТАЯ ПРОВЕРКА ПАРОЛЯ (без хэширования)
        if courier['password'] != password:
            print(f"❌ Неверный пароль для {username}. Ожидалось: {courier['password']}, получено: {password}")
            return jsonify({'success': False, 'error': 'Неверный пароль'}), 401

        # Успешная авторизация
        courier_data = dict(courier)
        courier_data.pop('password', None)  # Не отправляем пароль в ответе

        token = f"courier_{courier['id']}_{datetime.now().timestamp()}"
        print(f"✅ Успешный вход: {username}, токен: {token}")

        return jsonify({
            'success': True,
            'courier': courier_data,
            'token': token
        })
    except Exception as e:
        print(f"❌ Ошибка входа: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/courier/orders', methods=['GET'])
def get_courier_orders():
    try:
        courier_id = request.args.get('courier_id', type=int)
        if not courier_id:
            return jsonify({'success': False, 'error': 'Не указан ID курьера'}), 400

        db = get_db()

        active_orders = db.execute('''
                                   SELECT o.*,
                                          a.status as assignment_status,
                                          a.assigned_at,
                                          a.delivery_started,
                                          a.delivered_at
                                   FROM orders o
                                            JOIN order_assignments a ON o.id = a.order_id
                                   WHERE a.courier_id = ?
                                     AND a.status IN ('assigned', 'picked_up')
                                     AND o.status = 'pending'
                                   ORDER BY a.assigned_at DESC
                                   ''', (courier_id,)).fetchall()

        completed_orders = db.execute('''
                                      SELECT o.*,
                                             a.status as assignment_status,
                                             a.assigned_at,
                                             a.delivered_at,
                                             a.photo_proof
                                      FROM orders o
                                               JOIN order_assignments a ON o.id = a.order_id
                                      WHERE a.courier_id = ?
                                        AND a.status = 'delivered'
                                      ORDER BY a.delivered_at DESC LIMIT 50
                                      ''', (courier_id,)).fetchall()

        db.close()

        return jsonify({
            'success': True,
            'active_orders': [dict(order) for order in active_orders],
            'completed_orders': [dict(order) for order in completed_orders]
        })
    except Exception as e:
        print(f"❌ Ошибка получения заказов курьера: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/courier/update-status', methods=['POST'])
def update_delivery_status():
    """Обновить статус доставки"""
    try:
        data = request.json
        order_id = data.get('order_id')
        courier_id = data.get('courier_id')
        status = data.get('status')
        photo_data = data.get('photo_data')
        notes = data.get('notes', '')

        print(f"🔄 Обновление статуса: заказ {order_id}, курьер {courier_id}, статус {status}")

        db = get_db()

        # Находим назначение
        assignment = db.execute('''
                                SELECT *
                                FROM order_assignments
                                WHERE order_id = ?
                                  AND courier_id = ?
                                ''', (order_id, courier_id)).fetchone()

        if not assignment:
            db.close()
            return jsonify({'success': False, 'error': 'Назначение не найдено'}), 404

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
                print(f"✅ Фото сохранено: {filename}")
            except Exception as e:
                print(f"⚠️ Ошибка сохранения фото: {e}")

        # Обновляем статус доставки
        if status == 'picked_up':
            db.execute('''
                       UPDATE order_assignments
                       SET status           = ?,
                           delivery_started = CURRENT_TIMESTAMP
                       WHERE order_id = ?
                         AND courier_id = ?
                       ''', (status, order_id, courier_id))
            print(f"✅ Заказ {order_id} взят в доставку")

        elif status == 'delivered':
            db.execute('''
                       UPDATE order_assignments
                       SET status         = ?,
                           delivered_at   = CURRENT_TIMESTAMP,
                           photo_proof    = ?,
                           delivery_notes = ?
                       WHERE order_id = ?
                         AND courier_id = ?
                       ''', (status, photo_url, notes, order_id, courier_id))

            db.execute('UPDATE orders SET status = "delivered" WHERE id = ?', (order_id,))
            print(f"✅ Заказ {order_id} доставлен")

        else:
            db.execute('''
                       UPDATE order_assignments
                       SET status = ?
                       WHERE order_id = ?
                         AND courier_id = ?
                       ''', (status, order_id, courier_id))

        db.commit()
        db.close()

        return jsonify({'success': True, 'photo_url': photo_url})
    except Exception as e:
        print(f"❌ Ошибка обновления статуса: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/courier/order/<int:order_id>')
def get_order_details(order_id):
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
                                  c.full_name as courier_name
                           FROM orders o
                                    LEFT JOIN order_assignments a ON o.id = a.order_id
                                    LEFT JOIN couriers c ON a.courier_id = c.id
                           WHERE o.id = ?
                           ''', (order_id,)).fetchone()

        if not order:
            db.close()
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
        print(f"❌ Ошибка получения деталей заказа: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/courier/assign-order', methods=['POST'])
def assign_order_to_courier():
    """Назначить заказ курьеру"""
    try:
        data = request.json
        order_id = data.get('order_id')
        courier_id = data.get('courier_id')

        if not order_id or not courier_id:
            return jsonify({'success': False, 'error': 'Не указан ID заказа или курьера'}), 400

        db = get_db()

        order = db.execute('SELECT * FROM orders WHERE id = ? AND status = "pending"', (order_id,)).fetchone()
        if not order:
            db.close()
            return jsonify({'success': False, 'error': 'Заказ не найден или уже обработан'}), 404

        courier = db.execute('SELECT * FROM couriers WHERE id = ? AND is_active = 1', (courier_id,)).fetchone()
        if not courier:
            db.close()
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        cursor = db.execute('INSERT INTO order_assignments (order_id, courier_id, status) VALUES (?, ?, "assigned")',
                            (order_id, courier_id))
        db.commit()
        assignment_id = cursor.lastrowid
        db.close()

        print(f"✅ Заказ {order_id} назначен курьеру {courier_id}")
        return jsonify({'success': True, 'assignment_id': assignment_id})
    except Exception as e:
        print(f"❌ Ошибка назначения заказа: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== API ДЛЯ АДРЕСОВ ==========
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
        print(f"❌ Ошибка работы с адресами: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


# ========== API ДЛЯ ТОЧЕК САМОВЫВОЗА ==========
@app.route('/api/pickup-points', methods=['GET'])
def get_pickup_points():
    db = get_db()
    try:
        points = db.execute('SELECT * FROM pickup_points WHERE is_active = 1 ORDER BY name').fetchall()
        return jsonify([dict(point) for point in points])
    except Exception as e:
        print(f"❌ Ошибка получения точек самовывоза: {e}")
        return jsonify([])
    finally:
        db.close()


@app.route('/api/admin/categories/manage', methods=['GET', 'POST', 'DELETE'])
def admin_manage_categories():
    """Управление категориями"""
    db = get_db()
    try:
        if request.method == 'GET':
            categories = db.execute('''
                                    SELECT DISTINCT category
                                    FROM products
                                    WHERE category IS NOT NULL
                                      AND category != ''
                                    ORDER BY category
                                    ''').fetchall()
            return jsonify([row['category'] for row in categories])

        elif request.method == 'POST':
            data = request.get_json()
            new_category = data.get('name', '').strip()

            if not new_category:
                return jsonify({'success': False, 'error': 'Название категории не может быть пустым'}), 400

            # Проверяем, есть ли уже такая категория
            existing = db.execute(
                'SELECT COUNT(*) as count FROM products WHERE LOWER(category) = LOWER(?)',
                (new_category,)
            ).fetchone()

            if existing['count'] > 0:
                return jsonify({'success': False, 'error': 'Такая категория уже существует'}), 400

            # Добавляем тестовый товар
            db.execute('''
                       INSERT INTO products (name, description, price, image_url, category, stock)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ''', (
                           f'Товар категории {new_category}',
                           f'Автоматически созданный товар',
                           1000,
                           'https://via.placeholder.com/300x200',
                           new_category,
                           10
                       ))

            db.commit()
            return jsonify({'success': True, 'message': f'Категория "{new_category}" создана'})

        elif request.method == 'DELETE':
            category_name = request.args.get('name', '').strip()
            if not category_name:
                return jsonify({'success': False, 'error': 'Не указана категория'}), 400

            # Удаляем категорию у товаров
            db.execute(
                'UPDATE products SET category = "" WHERE LOWER(category) = LOWER(?)',
                (category_name,)
            )
            db.commit()
            return jsonify({'success': True, 'message': f'Категория "{category_name}" удалена'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/courier/change-password', methods=['POST'])
def courier_change_password():
    """Сменить пароль курьера"""
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

        # Проверяем старый пароль
        courier = db.execute('SELECT password FROM couriers WHERE id = ?', (courier_id,)).fetchone()
        if not courier:
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        if courier['password'] != old_password:
            return jsonify({'success': False, 'error': 'Неверный текущий пароль'}), 401

        # Обновляем пароль
        db.execute('UPDATE couriers SET password = ? WHERE id = ?', (new_password, courier_id))
        db.commit()

        return jsonify({'success': True, 'message': 'Пароль успешно изменен'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/courier/profile', methods=['GET', 'PUT'])
def courier_profile():
    """Получить/обновить профиль курьера"""
    db = get_db()
    try:
        if request.method == 'GET':
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

            return jsonify({'success': True, 'profile': dict(courier)})

        elif request.method == 'PUT':
            data = request.json
            courier_id = data.get('courier_id')

            if not courier_id:
                return jsonify({'success': False, 'error': 'Не указан ID курьера'}), 400

            # Проверяем, что курьер существует
            courier = db.execute('SELECT id FROM couriers WHERE id = ?', (courier_id,)).fetchone()
            if not courier:
                return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

            # Обновляем данные
            db.execute('''
                       UPDATE couriers
                       SET full_name    = ?,
                           phone        = ?,
                           vehicle_type = ?
                       WHERE id = ?
                       ''', (
                           data.get('full_name', ''),
                           data.get('phone', ''),
                           data.get('vehicle_type', ''),
                           courier_id
                       ))

            db.commit()

            # Возвращаем обновленный профиль
            updated = db.execute('''
                                 SELECT id, username, full_name, phone, vehicle_type, is_active, created_at
                                 FROM couriers
                                 WHERE id = ?
                                 ''', (courier_id,)).fetchone()

            return jsonify({
                'success': True,
                'message': 'Профиль обновлен',
                'profile': dict(updated)
            })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


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
        print(f"❌ Ошибка дашборда: {e}")
        db.close()
        return jsonify({
            'total_orders': 0, 'total_revenue': 0, 'pending_orders': 0,
            'total_products': 0, 'total_customers': 0, 'recent_orders': []
        })


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

            print(f"✅ Товар добавлен: {data.get('name')} (ID: {product_id})")
            return jsonify({'success': True, 'id': product_id})

        elif request.method == 'PUT':
            product_id = request.args.get('id')
            data = request.json

            if not product_id:
                return jsonify({'success': False, 'error': 'Не указан ID товара'}), 400

            db.execute('''
                       UPDATE products
                       SET name        = ?,
                           description = ?,
                           price       = ?,
                           image_url   = ?,
                           category    = ?,
                           stock       = ?
                       WHERE id = ?
                       ''', (data.get('name', ''), data.get('description', ''), data.get('price', 0),
                             data.get('image_url', ''), data.get('category', ''), data.get('stock', 0), product_id))
            db.commit()

            print(f"✅ Товар обновлен: ID {product_id}")
            return jsonify({'success': True})

        elif request.method == 'DELETE':
            product_id = request.args.get('id')
            if not product_id:
                return jsonify({'success': False, 'error': 'Не указан ID товара'}), 400

            # Получаем название товара перед удалением
            product_name = db.execute('SELECT name FROM products WHERE id = ?', (product_id,)).fetchone()
            product_name = product_name['name'] if product_name else 'Неизвестный товар'

            db.execute('DELETE FROM products WHERE id = ?', (product_id,))
            db.commit()

            print(f"🗑️ Товар удален: {product_name} (ID: {product_id})")
            return jsonify({'success': True})
    except Exception as e:
        print(f"❌ Ошибка работы с товарами: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/orders', methods=['GET'])
def admin_orders():
    db = get_db()
    orders = db.execute('SELECT * FROM orders ORDER BY created_at DESC').fetchall()
    db.close()
    return jsonify([dict(order) for order in orders])


@app.route('/api/admin/orders/<int:order_id>/status', methods=['PUT'])
def admin_update_order_status(order_id):
    db = get_db()
    try:
        data = request.json
        new_status = data.get('status')

        if new_status not in ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled']:
            return jsonify({'success': False, 'error': 'Неверный статус'}), 400

        db.execute('UPDATE orders SET status = ? WHERE id = ?', (new_status, order_id))
        db.execute('INSERT INTO order_status_history (order_id, status, notes) VALUES (?, ?, ?)',
                   (order_id, new_status, data.get('notes', '')))
        db.commit()

        print(f"✅ Статус заказа {order_id} изменен на '{new_status}'")
        return jsonify({'success': True, 'message': f'Статус обновлен на: {new_status}'})
    except Exception as e:
        print(f"❌ Ошибка обновления статуса: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


# ========== УТИЛИТЫ ==========
@app.route('/api/reset-db', methods=['GET'])
def reset_database():
    """Сбросить базу данных (для тестирования)"""
    try:
        if os.path.exists('shop.db'):
            os.remove('shop.db')
            print("🗑️ Удалена старая база данных")

        init_db()
        return jsonify({'success': True, 'message': 'База данных сброшена'})
    except Exception as e:
        print(f"❌ Ошибка сброса БД: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/test-login', methods=['GET'])
def test_login():
    """Тест входа - возвращает список курьеров"""
    db = get_db()
    try:
        couriers = db.execute('SELECT id, username, password, full_name FROM couriers').fetchall()
        result = [dict(courier) for courier in couriers]
        db.close()
        return jsonify({'success': True, 'couriers': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== ФУНКЦИИ ДЛЯ ЗАГРУЗКИ ФАЙЛОВ ==========
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
        print(f"✅ Изображение загружено: {filename}")
        return jsonify({'success': True, 'url': image_url, 'filename': filename})
    except Exception as e:
        print(f"❌ Ошибка загрузки изображения: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/static/uploads/<filename>')
def uploaded_file(filename):
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        return jsonify({'error': 'Файл не найден'}), 404


# ========== ЗАПУСК ==========
if __name__ == '__main__':
    print("=" * 50)
    print("🚀 Магазин запускается...")
    print("=" * 50)
    print("🌐 Ссылки для доступа:")
    print("   Магазин:     http://localhost:5000/")
    print("   Админка:     http://localhost:5000/admin")
    print("   Курьер:      http://localhost:5000/courier")
    print("=" * 50)
    print("🔑 Тестовые данные для входа курьеров:")
    print("   Логин: courier1 / Пароль: 123456")
    print("   Логин: courier2 / Пароль: 123456")
    print("   Логин: courier3 / Пароль: 123456")
    print("   Логин: admin    / Пароль: admin123")
    print("=" * 50)

    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)