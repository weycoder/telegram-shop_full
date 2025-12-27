import os
import sqlite3
import json
import uuid

from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime

from werkzeug.utils import secure_filename

app = Flask(__name__,
            template_folder='webapp/templates',
            static_folder='webapp/static')
CORS(app)

# Конфигурация
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
app.config['DATABASE'] = 'shop.db'
# Создай папку для загрузок
UPLOAD_FOLDER = 'webapp/static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB




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
                           created_at
                           TIMESTAMP
                           DEFAULT
                           CURRENT_TIMESTAMP
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

        db.commit()
        db.close()
        print("✅ База данных инициализирована")


# Инициализируем БД при старте
init_db()


# ========== ГЛАВНЫЕ СТРАНИЦЫ ==========
@app.route('/')
def index():
    """Главная страница"""
    return render_template('base.html')


@app.route('/webapp')
def webapp_page():
    """Web App магазин"""
    return render_template('webapp.html')


@app.route('/admin')
def admin_page():
    """Админ панель"""
    return render_template('admin.html')


@app.route('/api/admin/upload-image', methods=['POST'])
def upload_image():
    """Загрузка изображения для товара"""
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'Файл не выбран'})

    file = request.files['image']

    if file.filename == '':
        return jsonify({'success': False, 'error': 'Файл не выбран'})

    if not allowed_file(file.filename):
        return jsonify({'success': False, 'error': 'Недопустимый формат файла'})

    try:
        # Генерируем уникальное имя файла
        filename = str(uuid.uuid4())[:8] + '_' + secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        # Создаем папку если нет
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

        # Сохраняем файл
        file.save(filepath)

        # Возвращаем URL для доступа к файлу
        image_url = f'/static/uploads/{filename}'

        return jsonify({
            'success': True,
            'url': image_url,
            'filename': filename
        })
    except Exception as e:
        print(f"Ошибка загрузки изображения: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# Добавь статический маршрут для загрузок
@app.route('/static/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/categories')
def api_categories():
    """Получить список категорий"""
    db = get_db()
    categories = db.execute(
        'SELECT DISTINCT category FROM products WHERE category IS NOT NULL'
    ).fetchall()
    db.close()
    return jsonify([row['category'] for row in categories])


@app.route('/api/create-order', methods=['POST'])
def api_create_order():
    """Создать заказ"""
    data = request.json
    db = get_db()

    try:
        db.execute('''
                   INSERT INTO orders (user_id, username, items, total_price, status)
                   VALUES (?, ?, ?, ?, 'pending')
                   ''', (
                       data.get('user_id', 0),
                       data.get('username', 'Гость'),
                       json.dumps(data['items'], ensure_ascii=False),
                       data['total']
                   ))

        # Обновляем остатки
        for item in data['items']:
            db.execute(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                (item['quantity'], item['id'])
            )

        db.commit()
        order_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
        db.close()

        return jsonify({'success': True, 'order_id': order_id})
    except Exception as e:
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/admin/products', methods=['GET', 'POST', 'PUT', 'DELETE'])
def admin_products():
    """Управление товарами"""
    print(f"📦 API products called: {request.method}")

    db = get_db()

    if request.method == 'GET':
        products = db.execute(
            'SELECT * FROM products ORDER BY created_at DESC'
        ).fetchall()
        db.close()
        print(f"✅ GET: Found {len(products)} products")
        return jsonify([dict(product) for product in products])

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


@app.route('/api/admin/orders', methods=['GET'])
def admin_orders():
    """Получить все заказы"""
    db = get_db()
    orders = db.execute(
        'SELECT * FROM orders ORDER BY created_at DESC'
    ).fetchall()
    db.close()
    return jsonify([dict(order) for order in orders])



# ========== ПОЛНОЕ API ДЛЯ АДМИНКИ ==========

@app.route('/api/admin/dashboard')
def admin_dashboard():
    """Полная статистика для дашборда"""
    db = get_db()

    try:
        # Основная статистика
        stats = db.execute('''
                           SELECT COUNT(DISTINCT o.id)                                                             as total_orders,
                                  COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_price ELSE 0 END),
                                           0)                                                                      as total_revenue,
                                  COUNT(CASE WHEN o.status = 'pending' THEN 1 END)                                 as pending_orders,
                                  COUNT(DISTINCT p.id)                                                             as total_products,
                                  COUNT(DISTINCT o.user_id)                                                        as total_customers,
                                  COALESCE(AVG(CASE WHEN o.status = 'completed' THEN o.total_price END),
                                           0)                                                                      as avg_order_value
                           FROM orders o,
                                products p
                           ''').fetchone()

        # Продажи по дням (последние 7 дней)
        sales_by_day = db.execute('''
                                  SELECT
                                      DATE (created_at) as date, COUNT (*) as orders_count, COALESCE (SUM (total_price), 0) as revenue
                                  FROM orders
                                  WHERE status = 'completed'
                                    AND created_at >= DATE ('now'
                                      , '-7 days')
                                  GROUP BY DATE (created_at)
                                  ORDER BY date
                                  ''').fetchall()

        # Продажи по категориям
        category_sales = db.execute('''
                                    SELECT p.category,
                                           COUNT(DISTINCT o.id)            as order_count,
                                           COALESCE(SUM(o.total_price), 0) as revenue
                                    FROM orders o,
                                         json_each(o.items) j
                                             LEFT JOIN products p ON json_extract(j.value, '$.id') = p.id
                                    WHERE o.status = 'completed'
                                    GROUP BY p.category
                                    ORDER BY revenue DESC
                                    ''').fetchall()

        # Последние заказы
        recent_orders = db.execute('''
                                   SELECT id,
                                          user_id,
                                          username,
                                          total_price,
                                          status,
                                          created_at,
                                          (SELECT COUNT(*) FROM json_each(items)) as items_count
                                   FROM orders
                                   ORDER BY created_at DESC LIMIT 10
                                   ''').fetchall()

        result = {
            'total_orders': stats['total_orders'] or 0,
            'total_revenue': stats['total_revenue'] or 0,
            'pending_orders': stats['pending_orders'] or 0,
            'total_products': stats['total_products'] or 0,
            'total_customers': stats['total_customers'] or 0,
            'avg_order_value': stats['avg_order_value'] or 0,
            'sales_by_day': [dict(row) for row in sales_by_day],
            'category_sales': [dict(row) for row in category_sales],
            'recent_orders': [dict(row) for row in recent_orders]
        }

        db.close()
        return jsonify(result)

    except Exception as e:
        db.close()
        print(f"Error in admin_dashboard: {e}")
        return jsonify({
            'total_orders': 0,
            'total_revenue': 0,
            'pending_orders': 0,
            'total_products': 0,
            'total_customers': 0,
            'avg_order_value': 0,
            'sales_by_day': [],
            'category_sales': [],
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


# ========== ДОПОЛНИТЕЛЬНЫЕ API ==========

@app.route('/api/admin/categories')
def admin_categories():
    """Получить список категорий с количеством товаров"""
    db = get_db()

    try:
        categories = db.execute('''
                                SELECT category,
                                       COUNT(*)   as product_count,
                                       SUM(stock) as total_stock,
                                       AVG(price) as avg_price
                                FROM products
                                WHERE category IS NOT NULL
                                  AND category != ''
                                GROUP BY category
                                ORDER BY product_count DESC
                                ''').fetchall()

        db.close()
        return jsonify([dict(row) for row in categories])
    except Exception as e:
        db.close()
        print(f"Error in admin_categories: {e}")
        return jsonify([])


@app.route('/api/admin/cleanup', methods=['POST'])
def admin_cleanup():
    """Очистить старые/тестовые данные"""
    db = get_db()

    try:
        # Удаляем товары с нулевым остатком (опционально)
        # db.execute('DELETE FROM products WHERE stock = 0')

        # Удаляем старые отмененные заказы (старше 30 дней)
        db.execute('''
                   DELETE
                   FROM orders
                   WHERE status = 'cancelled'
                     AND created_at < DATE ('now'
                       , '-30 days')
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