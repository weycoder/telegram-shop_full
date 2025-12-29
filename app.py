import os
import sqlite3
import json
import uuid
from flask import Flask, render_template, jsonify, request, send_from_directory, session
from flask_cors import CORS
import hashlib
import base64
import os
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__,
            template_folder='webapp/templates',
            static_folder='webapp/static')
CORS(app)

# ========== КОНФИГУРАЦИЯ ==========
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
app.config['DATABASE'] = 'shop.db'
app.config['UPLOAD_FOLDER'] = 'webapp/static/uploads'  # ИЗМЕНИЛ здесь!
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


# Хэширование пароля
def hash_password(password):
    salt = "telegram_shop_salt"
    return f"sha256${salt}${hashlib.sha256((salt + password).encode()).hexdigest()}"

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
                           password_hash
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

        # Тестовые курьеры
        if cursor.execute("SELECT COUNT(*) FROM couriers").fetchone()[0] == 0:
            # Пароль: 123456 (sha256 hash)
            cursor.executemany('''
                               INSERT INTO couriers (username, password_hash, full_name, phone, vehicle_type)
                               VALUES (?, ?, ?, ?, ?)
                               ''', [
                                   ('courier1',
                                    'sha256$salt$8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
                                    'Иван Курьеров', '+79991112233', 'car'),
                                   ('courier2',
                                    'sha256$salt$8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
                                    'Петр Доставкин', '+79992223344', 'bike'),
                                   ('courier3',
                                    'sha256$salt$8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
                                    'Алексей Развозов', '+79993334455', 'foot')
                               ])

        # Таблица товаров
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                price REAL NOT NULL,
                image_url TEXT,
                category TEXT,
                stock INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        # Таблица для адресов пользователей
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

        # Таблица для точек самовывоза
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

        # Тестовые товары
        cursor.execute("SELECT COUNT(*) FROM products")
        if cursor.fetchone()[0] == 0:
            test_products = [
                ('iPhone 15 Pro', 'Новый Apple смартфон', 99999,
                 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-7inch?wid=5120&hei=2880&fmt=webp&qlt=70&.v=1693009279096',
                 'Телефоны', 10),
                ('Samsung Galaxy S23', 'Флагман Samsung', 89999,
                 'https://images.samsung.com/is/image/samsung/p6pim/ru/2302/gallery/ru-galaxy-s23-s911-sm-s911bzadeub-534866168?$650_519_PNG$',
                 'Телефоны', 15),
                ('Наушники Sony WH-1000XM5', 'Беспроводные с шумоподавлением', 34999,
                 'https://sony.scene7.com/is/image/sonyglobalsolutions/WH-1000XM5-B_primary-image?$categorypdpnav$&fmt=png-alpha',
                 'Аксессуары', 20),
                ('MacBook Air M2', 'Ультратонкий ноутбук Apple', 129999,
                 'https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/macbook-air-midnight-select-20220606?wid=904&hei=840&fmt=jpeg&qlt=90&.v=1653084303665',
                 'Ноутбуки', 8)
            ]

            cursor.executemany('''
                INSERT INTO products (name, description, price, image_url, category, stock)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', test_products)

        # Тестовые точки самовывоза
        cursor.execute("SELECT COUNT(*) FROM pickup_points")
        if cursor.fetchone()[0] == 0:
            pickup_points = [
                ('Магазин на Ленина', 'ул. Ленина, 15', '09:00-21:00', '+7 (999) 123-45-67'),
                ('ТЦ Центральный', 'пр. Мира, 42, 2 этаж', '10:00-22:00', '+7 (999) 765-43-21'),
                ('Склад на Заводской', 'ул. Заводская, 7', '08:00-20:00', '+7 (999) 555-55-55')
            ]

            cursor.executemany('''
                INSERT INTO pickup_points (name, address, working_hours, phone)
                VALUES (?, ?, ?, ?)
            ''', pickup_points)

        db.commit()
        db.close()
        print("✅ База данных инициализирована")

# Инициализируем БД при старте
init_db()

# ========== ГЛАВНЫЕ СТРАНИЦЫ ==========
@app.route('/')
def index():
    """Главная страница (перенаправляем на магазин)"""
    return render_template('webapp.html')

@app.route('/webapp')
def webapp_page():
    """Web App магазин"""
    return render_template('webapp.html')

@app.route('/admin')
def admin_page():
    """Админ панель"""
    return render_template('admin.html')


@app.route('/api/user/addresses', methods=['GET', 'POST', 'DELETE'])
def user_addresses():
    """Управление адресами пользователя"""
    db = get_db()

    try:
        if request.method == 'GET':
            user_id = request.args.get('user_id', type=int)

            if not user_id or user_id == 0:
                # Для гостей или без user_id возвращаем пустой список
                return jsonify([])

            addresses = db.execute('''
                                   SELECT *
                                   FROM user_addresses
                                   WHERE user_id = ?
                                   ORDER BY is_default DESC, created_at DESC
                                   ''', (user_id,)).fetchall()

            return jsonify([dict(addr) for addr in addresses])

        elif request.method == 'POST':
            data = request.json

            # Для гостей (user_id = 0) не сохраняем в БД
            user_id = data.get('user_id', 0)

            if user_id == 0:
                return jsonify({
                    'success': True,
                    'id': 0,
                    'message': 'Адрес сохранен локально для гостя'
                })

            # Проверяем обязательные поля
            required_fields = ['city', 'street', 'house', 'recipient_name']
            for field in required_fields:
                if not data.get(field):
                    return jsonify({
                        'success': False,
                        'error': f'Отсутствует обязательное поле: {field}'
                    }), 400

            # Если это первый адрес, делаем его адресом по умолчанию
            count = db.execute(
                'SELECT COUNT(*) FROM user_addresses WHERE user_id = ?',
                (user_id,)
            ).fetchone()[0]

            is_default = 1 if count == 0 else data.get('is_default', 0)

            # Сохраняем адрес в БД
            cursor = db.execute('''
                                INSERT INTO user_addresses
                                (user_id, city, street, house, apartment, floor, doorcode, recipient_name, phone,
                                 is_default)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (
                                    user_id,
                                    data['city'],
                                    data['street'],
                                    data['house'],
                                    data.get('apartment', ''),
                                    data.get('floor', ''),
                                    data.get('doorcode', ''),
                                    data['recipient_name'],
                                    data.get('phone', ''),
                                    is_default
                                ))

            # Если этот адрес стал адресом по умолчанию, сбрасываем default у других адресов
            if is_default:
                db.execute('''
                           UPDATE user_addresses
                           SET is_default = 0
                           WHERE user_id = ?
                             AND id != ?
                           ''', (user_id, cursor.lastrowid))

            db.commit()
            return jsonify({'success': True, 'id': cursor.lastrowid})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/user/addresses/set-default', methods=['POST'])
def set_default_address():
    """Установить адрес по умолчанию"""
    db = get_db()

    try:
        data = request.json
        user_id = data.get('user_id')
        address_id = data.get('address_id')

        if not user_id or not address_id:
            return jsonify({'success': False, 'error': 'Не указаны user_id или address_id'}), 400

        # Сначала сбрасываем все адреса пользователя
        db.execute('''
            UPDATE user_addresses 
            SET is_default = 0 
            WHERE user_id = ?
        ''', (user_id,))

        # Устанавливаем выбранный адрес как адрес по умолчанию
        db.execute('''
            UPDATE user_addresses 
            SET is_default = 1 
            WHERE id = ? AND user_id = ?
        ''', (address_id, user_id))

        db.commit()
        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

@app.route('/api/pickup-points', methods=['GET'])
def get_pickup_points():
    """Получить все точки самовывоза"""
    db = get_db()

    try:
        points = db.execute('''
            SELECT * FROM pickup_points 
            WHERE is_active = 1 
            ORDER BY name
        ''').fetchall()

        return jsonify([dict(point) for point in points])
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/courier/login', methods=['POST'])
def courier_login():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'success': False, 'error': 'Введите логин и пароль'}), 400

        db = get_db()
        courier = db.execute(
            'SELECT * FROM couriers WHERE username = ? AND is_active = 1',
            (username,)
        ).fetchone()
        db.close()

        if not courier:
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        # Проверяем пароль (упрощенная проверка для демо)
        expected_hash = f"sha256$salt${hashlib.sha256(('salt' + password).encode()).hexdigest()}"
        if courier['password_hash'] != expected_hash:
            return jsonify({'success': False, 'error': 'Неверный пароль'}), 401

        # Успешная авторизация
        courier_data = dict(courier)
        courier_data.pop('password_hash', None)  # Не отправляем хэш пароля

        return jsonify({
            'success': True,
            'courier': courier_data,
            'token': f"courier_{courier['id']}_{datetime.now().timestamp()}"
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# Получить заказы для курьера
@app.route('/api/courier/orders', methods=['GET'])
def get_courier_orders():
    try:
        courier_id = request.args.get('courier_id', type=int)

        if not courier_id:
            return jsonify({'success': False, 'error': 'Не указан ID курьера'}), 400

        db = get_db()

        # Активные заказы (назначенные курьеру)
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

        # Выполненные заказы
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

        # Заказы на сегодня
        today_orders = db.execute('''
                                  SELECT o.*, a.status as assignment_status
                                  FROM orders o
                                           JOIN order_assignments a ON o.id = a.order_id
                                  WHERE a.courier_id = ?
                                    AND DATE (a.assigned_at) = DATE ('now')
                                  ORDER BY a.assigned_at DESC
                                  ''', (courier_id,)).fetchall()

        db.close()

        return jsonify({
            'success': True,
            'active_orders': [dict(order) for order in active_orders],
            'completed_orders': [dict(order) for order in completed_orders],
            'today_orders': [dict(order) for order in today_orders]
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# Назначить заказ курьеру (для админа)
@app.route('/api/courier/assign-order', methods=['POST'])
def assign_order_to_courier():
    try:
        data = request.json
        order_id = data.get('order_id')
        courier_id = data.get('courier_id')

        if not order_id or not courier_id:
            return jsonify({'success': False, 'error': 'Не указан ID заказа или курьера'}), 400

        db = get_db()

        # Проверяем, что заказ существует и не назначен
        order = db.execute(
            'SELECT * FROM orders WHERE id = ? AND status = "pending"',
            (order_id,)
        ).fetchone()

        if not order:
            return jsonify({'success': False, 'error': 'Заказ не найден или уже обработан'}), 404

        # Проверяем курьера
        courier = db.execute(
            'SELECT * FROM couriers WHERE id = ? AND is_active = 1',
            (courier_id,)
        ).fetchone()

        if not courier:
            return jsonify({'success': False, 'error': 'Курьер не найден'}), 404

        # Назначаем заказ
        cursor = db.execute('''
                            INSERT INTO order_assignments (order_id, courier_id, status)
                            VALUES (?, ?, 'assigned')
                            ''', (order_id, courier_id))

        db.commit()
        db.close()

        return jsonify({'success': True, 'assignment_id': cursor.lastrowid})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# Обновить статус доставки
@app.route('/api/courier/update-status', methods=['POST'])
def update_delivery_status():
    try:
        data = request.json
        assignment_id = data.get('assignment_id')
        order_id = data.get('order_id')
        courier_id = data.get('courier_id')
        status = data.get('status')
        photo_data = data.get('photo_data')  # base64 encoded
        notes = data.get('notes', '')

        db = get_db()

        # Проверяем права курьера
        assignment = db.execute('''
                                SELECT *
                                FROM order_assignments
                                WHERE id = ?
                                  AND courier_id = ?
                                  AND order_id = ?
                                ''', (assignment_id, courier_id, order_id)).fetchone()

        if not assignment:
            return jsonify({'success': False, 'error': 'Назначение не найдено'}), 404

        # Сохраняем фото если есть
        photo_url = None
        if photo_data and status == 'delivered':
            # Декодируем base64 и сохраняем файл
            try:
                # Удаляем префикс data:image/...;base64,
                if ',' in photo_data:
                    photo_data = photo_data.split(',')[1]

                # Декодируем
                image_data = base64.b64decode(photo_data)

                # Генерируем имя файла
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                filename = f"delivery_{order_id}_{timestamp}.jpg"
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

                # Сохраняем файл
                with open(filepath, 'wb') as f:
                    f.write(image_data)

                photo_url = f"/static/uploads/{filename}"

            except Exception as e:
                print(f"Ошибка сохранения фото: {e}")

        # Обновляем статус
        if status == 'picked_up':
            db.execute('''
                       UPDATE order_assignments
                       SET status           = ?,
                           delivery_started = CURRENT_TIMESTAMP
                       WHERE id = ?
                       ''', (status, assignment_id))

        elif status == 'delivered':
            db.execute('''
                       UPDATE order_assignments
                       SET status         = ?,
                           delivered_at   = CURRENT_TIMESTAMP,
                           photo_proof    = ?,
                           delivery_notes = ?
                       WHERE id = ?
                       ''', (status, photo_url, notes, assignment_id))

            # Обновляем статус заказа
            db.execute('''
                       UPDATE orders
                       SET status = 'processing'
                       WHERE id = ?
                       ''', (order_id,))

        else:
            db.execute('''
                       UPDATE order_assignments
                       SET status = ?
                       WHERE id = ?
                       ''', (status, assignment_id))

        db.commit()
        db.close()

        return jsonify({'success': True, 'photo_url': photo_url})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# Загрузить фото (отдельный endpoint)
@app.route('/api/courier/upload-photo', methods=['POST'])
def upload_delivery_photo():
    try:
        if 'photo' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

        file = request.files['photo']
        order_id = request.form.get('order_id', 'unknown')

        if file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

        # Проверяем тип файла
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        if not ('.' in file.filename and
                file.filename.rsplit('.', 1)[1].lower() in allowed_extensions):
            return jsonify({'success': False, 'error': 'Недопустимый формат файла'}), 400

        # Генерируем имя файла
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"delivery_{order_id}_{timestamp}.{file.filename.rsplit('.', 1)[1].lower()}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        # Сохраняем файл
        file.save(filepath)

        # URL для доступа
        photo_url = f"/static/uploads/{filename}"

        return jsonify({
            'success': True,
            'photo_url': photo_url,
            'filename': filename
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# Получить детали заказа
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
            return jsonify({'success': False, 'error': 'Заказ не найден'}), 404

        # Декодируем items
        order_dict = dict(order)
        try:
            order_dict['items_list'] = json.loads(order_dict['items'])
        except:
            order_dict['items_list'] = []

        # Декодируем адрес доставки если есть
        if order_dict.get('delivery_address'):
            try:
                order_dict['delivery_address_obj'] = json.loads(order_dict['delivery_address'])
            except:
                order_dict['delivery_address_obj'] = {}

        db.close()

        return jsonify({'success': True, 'order': order_dict})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/courier')
def courier_panel():
    """Курьерская панель"""
    return render_template('courier.html')

@app.route('/api/create-order', methods=['POST'])
def api_create_order():
    """Создать заказ с доставкой и оплатой"""
    data = request.json
    db = get_db()

    try:
        # Извлекаем данные
        delivery_type = data.get('delivery_type')
        payment_method = data.get('payment_method', 'cash')

        # Обрабатываем адрес доставки
        delivery_address = data.get('delivery_address', '{}')
        if isinstance(delivery_address, str):
            try:
                delivery_address = json.loads(delivery_address)
            except:
                delivery_address = {}

        # Извлекаем данные для сохранения
        recipient_name = delivery_address.get('recipient_name', data.get('recipient_name', ''))
        phone_number = delivery_address.get('phone', data.get('phone_number', ''))

        # ВАЖНО: статус всегда 'pending' (ожидает обработки)
        status = 'pending'

        # Сохраняем заказ
        cursor = db.execute('''
                            INSERT INTO orders
                            (user_id, username, items, total_price, status,
                             delivery_type, delivery_address, pickup_point, payment_method,
                             recipient_name, phone_number)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                data.get('user_id', 0),
                                data.get('username', 'Гость'),
                                json.dumps(data['items'], ensure_ascii=False),
                                data['total'],
                                status,  # Всегда 'pending' при создании
                                delivery_type,
                                json.dumps(delivery_address, ensure_ascii=False),
                                data.get('pickup_point'),
                                payment_method,
                                recipient_name,
                                phone_number
                            ))

        # Обновляем остатки товаров
        for item in data['items']:
            db.execute(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                (item['quantity'], item['id'])
            )

        db.commit()
        order_id = cursor.lastrowid
        db.close()

        return jsonify({'success': True, 'order_id': order_id})
    except Exception as e:
        db.close()
        print(f"❌ Ошибка создания заказа: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/admin/orders/<int:order_id>/update-status', methods=['POST'])
def update_order_status(order_id):
    """Обновить статус заказа (для админа/менеджера)"""
    db = get_db()

    try:
        data = request.json
        new_status = data.get('status')
        manager_notes = data.get('notes', '')

        # Разрешенные статусы
        allowed_statuses = ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled']

        if new_status not in allowed_statuses:
            return jsonify({'success': False, 'error': 'Неверный статус'}), 400

        # Обновляем статус
        db.execute('''
                   UPDATE orders
                   SET status     = ?,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?
                   ''', (new_status, order_id))

        # Можно также сохранять историю статусов в отдельной таблице
        db.execute('''
                   INSERT INTO order_status_history
                       (order_id, status, notes, changed_at)
                   VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                   ''', (order_id, new_status, manager_notes))

        db.commit()
        db.close()

        return jsonify({'success': True, 'message': f'Статус обновлен на: {new_status}'})

    except Exception as e:
        db.close()
        print(f"❌ Ошибка обновления статуса: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== API ДЛЯ АДМИНИСТРИРОВАНИЯ ТОЧЕК САМОВЫВОЗА ==========
@app.route('/api/admin/pickup-points', methods=['GET', 'POST', 'PUT', 'DELETE'])
def admin_pickup_points():
    """Управление точками самовывоза"""
    db = get_db()

    if request.method == 'GET':
        try:
            points = db.execute(
                'SELECT * FROM pickup_points ORDER BY name'
            ).fetchall()
            return jsonify([dict(point) for point in points])
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    elif request.method == 'POST':
        try:
            data = request.json

            db.execute('''
                INSERT INTO pickup_points (name, address, working_hours, phone, latitude, longitude)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                data.get('name', ''),
                data.get('address', ''),
                data.get('working_hours', ''),
                data.get('phone', ''),
                data.get('latitude'),
                data.get('longitude')
            ))

            db.commit()
            point_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
            return jsonify({'success': True, 'id': point_id})

        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    elif request.method == 'PUT':
        try:
            point_id = request.args.get('id', type=int)
            data = request.json

            if not point_id:
                return jsonify({'success': False, 'error': 'Не указан ID точки'}), 400

            db.execute('''
                UPDATE pickup_points
                SET name = ?, address = ?, working_hours = ?, phone = ?,
                    latitude = ?, longitude = ?, is_active = ?
                WHERE id = ?
            ''', (
                data.get('name', ''),
                data.get('address', ''),
                data.get('working_hours', ''),
                data.get('phone', ''),
                data.get('latitude'),
                data.get('longitude'),
                data.get('is_active', 1),
                point_id
            ))

            db.commit()
            return jsonify({'success': True})

        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    elif request.method == 'DELETE':
        try:
            point_id = request.args.get('id', type=int)

            if not point_id:
                return jsonify({'success': False, 'error': 'Не указан ID точки'}), 400

            # Проверяем, есть ли заказы на эту точку
            orders_count = db.execute(
                'SELECT COUNT(*) FROM orders WHERE pickup_point LIKE ?',
                (f'%{point_id}%',)
            ).fetchone()[0]

            if orders_count > 0:
                # Деактивируем вместо удаления
                db.execute(
                    'UPDATE pickup_points SET is_active = 0 WHERE id = ?',
                    (point_id,)
                )
            else:
                # Удаляем полностью
                db.execute('DELETE FROM pickup_points WHERE id = ?', (point_id,))

            db.commit()
            return jsonify({'success': True})

        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    db.close()
    return jsonify({'success': False, 'error': 'Метод не поддерживается'}), 405

# ========== ОСТАЛЬНЫЕ API ФУНКЦИИ (без изменений) ==========
@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    """Загрузка изображения на сервер"""
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'Файл не выбран'})

    file = request.files['image']

    if file.filename == '':
        return jsonify({'success': False, 'error': 'Файл не выбран'})

    if not allowed_file(file.filename):
        return jsonify({'success': False, 'error': 'Недопустимый формат файла. Разрешены: PNG, JPG, JPEG, GIF, WEBP'})

    try:
        # Генерируем уникальное имя файла
        filename = f"{uuid.uuid4().hex[:8]}_{secure_filename(file.filename)}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        # Сохраняем файл
        file.save(filepath)

        # Возвращаем URL для доступа к файлу
        image_url = f'/static/uploads/{filename}'

        print(f"✅ Изображение загружено: {filename}")

        return jsonify({
            'success': True,
            'url': image_url,
            'filename': filename
        })

    except Exception as e:
        print(f"❌ Ошибка загрузки изображения: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/static/uploads/<filename>')
def uploaded_file(filename):
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        print(f"❌ Ошибка загрузки файла {filename}: {e}")
        return jsonify({'error': 'Файл не найден'}), 404

@app.route('/api/admin/products', methods=['GET', 'POST', 'PUT', 'DELETE'])
def admin_products():
    """Управление товарами (с поддержкой DELETE)"""
    print(f"📦 API products called: {request.method}")

    db = get_db()

    if request.method == 'GET':
        try:
            products = db.execute(
                'SELECT * FROM products ORDER BY created_at DESC'
            ).fetchall()
            db.close()
            print(f"✅ GET: Found {len(products)} products")
            return jsonify([dict(product) for product in products])
        except Exception as e:
            print(f"❌ Error in GET products: {e}")
            db.close()
            return jsonify([])

    elif request.method == 'POST':
        try:
            data = request.json
            print(f"📝 POST data received: {data}")

            # Проверка данных
            if not data or 'name' not in data or 'price' not in data:
                print("❌ Missing required fields")
                return jsonify({'success': False, 'error': 'Отсутствуют обязательные поля'}), 400

            db.execute('''
                INSERT INTO products (name, description, price, image_url, category, stock)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                data.get('name', ''),
                data.get('description', ''),
                data.get('price', 0),
                data.get('image_url', ''),
                data.get('category', ''),
                data.get('stock', 0)
            ))
            db.commit()
            product_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
            db.close()

            print(f"✅ Product created with ID: {product_id}")
            return jsonify({'success': True, 'id': product_id})

        except Exception as e:
            print(f"❌ Error creating product: {e}")
            db.close()
            return jsonify({'success': False, 'error': str(e)}), 500

    elif request.method == 'PUT':
        try:
            product_id = request.args.get('id')
            data = request.json

            if not product_id:
                return jsonify({'success': False, 'error': 'Не указан ID товара'}), 400

            db.execute('''
                UPDATE products
                SET name = ?,
                    description = ?,
                    price = ?,
                    image_url = ?,
                    category = ?,
                    stock = ?
                WHERE id = ?
            ''', (
                data.get('name', ''),
                data.get('description', ''),
                data.get('price', 0),
                data.get('image_url', ''),
                data.get('category', ''),
                data.get('stock', 0),
                product_id
            ))
            db.commit()
            db.close()

            return jsonify({'success': True})

        except Exception as e:
            print(f"❌ Error updating product: {e}")
            db.close()
            return jsonify({'success': False, 'error': str(e)}), 500

    elif request.method == 'DELETE':
        try:
            product_id = request.args.get('id')
            print(f"🗑️ DELETE request for product ID: {product_id}")

            if not product_id:
                return jsonify({'success': False, 'error': 'Не указан ID товара'}), 400

            # Проверяем, есть ли заказы с этим товаром
            orders_with_product = db.execute('''
                SELECT COUNT(*)
                FROM orders
                WHERE items LIKE ?
            ''', ('%' + str(product_id) + '%',)).fetchone()[0]

            if orders_with_product > 0:
                db.close()
                return jsonify({
                    'success': False,
                    'error': 'Нельзя удалить товар, так как он есть в заказах'
                }), 400

            # Удаляем товар
            db.execute('DELETE FROM products WHERE id = ?', (product_id,))
            db.commit()
            db.close()

            print(f"✅ Product {product_id} deleted")
            return jsonify({'success': True})

        except Exception as e:
            print(f"❌ Error deleting product: {e}")
            db.close()
            return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/orders', methods=['GET'])
def admin_orders():
    """Получить все заказы"""
    db = get_db()
    orders = db.execute(
        'SELECT * FROM orders ORDER BY created_at DESC'
    ).fetchall()
    db.close()
    return jsonify([dict(order) for order in orders])

@app.route('/api/products')
def api_products():
    """Получить все товары для магазина"""
    db = get_db()
    try:
        category = request.args.get('category', 'all')

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

        db.close()
        return jsonify([dict(product) for product in products])
    except Exception as e:
        print(f"Error in api_products: {e}")
        db.close()
        return jsonify([])

def get_unique_categories():
    """Получить все уникальные категории из БД"""
    db = get_db()
    try:
        categories = db.execute('''
            SELECT DISTINCT category
            FROM products
            WHERE category IS NOT NULL
            AND category != ''
            ORDER BY category
        ''').fetchall()
        return [row['category'] for row in categories]
    except Exception as e:
        print(f"Error getting categories: {e}")
        return []
    finally:
        db.close()

@app.route('/api/admin/categories/add', methods=['POST'])
def add_category():
    """Добавить новую категорию"""
    db = get_db()
    try:
        data = request.json
        category_name = data.get('name', '').strip()

        if not category_name:
            return jsonify({'success': False, 'error': 'Название категории не может быть пустым'})

        # Добавляем тестовый товар для новой категории
        db.execute('''
            INSERT INTO products (name, description, price, image_url, category, stock)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            f'Товар категории {category_name}',
            f'Автоматически созданный товар для категории {category_name}',
            100,
            'https://via.placeholder.com/300x200',
            category_name,
            10
        ))

        db.commit()
        return jsonify({'success': True, 'message': f'Категория "{category_name}" добавлена'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        db.close()

@app.route('/api/admin/categories/manage', methods=['GET', 'POST', 'DELETE'])
def admin_manage_categories():
    """Управление категориями (для админа)"""
    db = get_db()

    if request.method == 'GET':
        # Получаем все уникальные категории
        try:
            categories = db.execute('''
                SELECT DISTINCT category
                FROM products
                WHERE category IS NOT NULL
                AND category != ''
                ORDER BY category
            ''').fetchall()
            db.close()
            return jsonify([row['category'] for row in categories])
        except Exception as e:
            print(f"Error getting categories: {e}")
            db.close()
            return jsonify([])

    elif request.method == 'POST':
        # Добавить новую категорию
        try:
            data = request.get_json()
            if not data:
                return jsonify({'success': False, 'error': 'Нет данных'}), 400

            new_category = data.get('name', '').strip()
            print(f"📝 Добавление категории: {new_category}")

            if not new_category:
                return jsonify({'success': False, 'error': 'Название категории не может быть пустым'}), 400

            # Проверяем, существует ли уже такая категория
            existing = db.execute(
                'SELECT COUNT(*) as count FROM products WHERE LOWER(category) = LOWER(?)',
                (new_category,)
            ).fetchone()

            if existing['count'] > 0:
                return jsonify({'success': False, 'error': 'Такая категория уже существует'}), 400

            # Добавляем тестовый товар с этой категорией
            db.execute('''
                INSERT INTO products (name, description, price, image_url, category, stock)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                f'Товар категории {new_category}',
                f'Это тестовый товар для категории {new_category}',
                100,
                'https://via.placeholder.com/300x200',
                new_category,
                10
            ))

            db.commit()
            db.close()

            return jsonify({'success': True, 'message': f'Категория "{new_category}" успешно создана'})

        except Exception as e:
            print(f"❌ Ошибка создания категории: {e}")
            db.close()
            return jsonify({'success': False, 'error': str(e)}), 500

    elif request.method == 'DELETE':
        # Удалить категорию
        try:
            category_name = request.args.get('name', '').strip()

            if not category_name:
                return jsonify({'success': False, 'error': 'Не указана категория'}), 400

            print(f"🗑️ Удаление категории: {category_name}")

            # Перемещаем товары этой категории в "без категории"
            db.execute(
                'UPDATE products SET category = ? WHERE LOWER(category) = LOWER(?)',
                ('', category_name)
            )

            db.commit()
            db.close()

            return jsonify({'success': True, 'message': f'Категория "{category_name}" удалена'})

        except Exception as e:
            print(f"❌ Ошибка удаления категории: {e}")
            db.close()
            return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/categories')
def api_categories():
    """Получить список категорий"""
    categories = get_unique_categories()
    return jsonify(categories)

@app.route('/api/products/<int:product_id>')
def api_product_detail(product_id):
    """Получить информацию о конкретном товаре"""
    db = get_db()
    try:
        product = db.execute(
            'SELECT * FROM products WHERE id = ?',
            (product_id,)
        ).fetchone()
        db.close()
        if product:
            return jsonify(dict(product))
        return jsonify({'error': 'Товар не найден'}), 404
    except Exception as e:
        print(f"Error in api_product_detail: {e}")
        db.close()
        return jsonify({'error': str(e)}), 500

# ========== ПОЛНОЕ API ДЛЯ АДМИНКИ ==========
@app.route('/api/admin/dashboard')
def admin_dashboard():
    """Полная статистика для дашборда"""
    db = get_db()

    try:
        # Исправленный запрос статистики
        stats = db.execute('''
            SELECT 
                (SELECT COUNT(*) FROM orders) as total_orders,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN total_price ELSE 0 END), 0) as total_revenue,
                (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
                (SELECT COUNT(*) FROM products) as total_products,
                (SELECT COUNT(DISTINCT user_id) FROM orders) as total_customers,
                COALESCE(AVG(CASE WHEN status = 'completed' THEN total_price END), 0) as avg_order_value
            FROM orders
        ''').fetchone()

        # Последние заказы
        recent_orders = db.execute('''
            SELECT id, username, total_price, status, delivery_type, created_at
            FROM orders 
            ORDER BY created_at DESC 
            LIMIT 10
        ''').fetchall()

        # Берем данные из результата или используем 0 по умолчанию
        result = {
            'total_orders': stats['total_orders'] if stats and stats['total_orders'] is not None else 0,
            'total_revenue': stats['total_revenue'] if stats and stats['total_revenue'] is not None else 0,
            'pending_orders': stats['pending_orders'] if stats and stats['pending_orders'] is not None else 0,
            'total_products': stats['total_products'] if stats and stats['total_products'] is not None else 0,
            'total_customers': stats['total_customers'] if stats and stats['total_customers'] is not None else 0,
            'avg_order_value': stats['avg_order_value'] if stats and stats['avg_order_value'] is not None else 0,
            'recent_orders': [dict(row) for row in recent_orders] if recent_orders else []
        }

        db.close()
        print(f"📊 Статистика: {result}")
        return jsonify(result)

    except Exception as e:
        print(f"❌ Error in admin_dashboard: {e}")
        db.close()
        return jsonify({
            'total_orders': 0,
            'total_revenue': 0,
            'pending_orders': 0,
            'total_products': 0,
            'total_customers': 0,
            'avg_order_value': 0,
            'recent_orders': []
        })

@app.route('/api/admin/orders/<int:order_id>/status', methods=['PUT'])
def update_order_status(order_id):
    """Обновить статус заказа"""
    db = get_db()

    try:
        data = request.json
        new_status = data.get('status')

        if new_status not in ['pending', 'processing', 'completed', 'cancelled']:
            db.close()
            return jsonify({'success': False, 'error': 'Неверный статус'}), 400

        # Обновляем статус
        db.execute(
            'UPDATE orders SET status = ? WHERE id = ?',
            (new_status, order_id)
        )

        db.commit()
        db.close()
        return jsonify({'success': True})

    except Exception as e:
        db.close()
        print(f"Error in update_order_status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/categories', methods=['GET'])
def admin_categories():
    """Получить все категории для админки"""
    db = get_db()
    try:
        categories = db.execute('''
            SELECT DISTINCT category
            FROM products
            WHERE category IS NOT NULL
            AND category != ''
            ORDER BY category
        ''').fetchall()

        return jsonify([c['category'] for c in categories])
    except Exception as e:
        print(f"Ошибка получения категорий: {e}")
        return jsonify([])
    finally:
        db.close()

@app.route('/api/admin/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'Файл не найден'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

    if file and allowed_file(file.filename):
        # Создаем уникальное имя файла
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = secure_filename(file.filename)
        unique_filename = f"{timestamp}_{filename}"

        # Сохраняем файл
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(file_path)

        # URL для доступа к файлу
        file_url = f"/static/uploads/{unique_filename}"

        print(f"✅ Файл загружен: {unique_filename} -> {file_url}")

        return jsonify({
            'success': True,
            'file_url': file_url,
            'filename': unique_filename
        })

    return jsonify({'success': False, 'error': 'Недопустимый формат файла'}), 400

@app.route('/api/admin/cleanup', methods=['POST'])
def admin_cleanup():
    """Очистить старые/тестовые данные"""
    db = get_db()

    try:
        # Удаляем товары с нулевым остатком (опционально)
        # db.execute('DELETE FROM products WHERE stock = 0')

        # Удаляем старые отмененные заказы (старше 30 дней)
        db.execute('''
            DELETE FROM orders
            WHERE status = 'cancelled'
            AND created_at < DATE('now', '-30 days')
        ''')

        db.commit()
        db.close()
        return jsonify({'success': True, 'message': 'Очистка выполнена'})

    except Exception as e:
        db.close()
        print(f"Error in admin_cleanup: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== ЗАПУСК ==========
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)