import os
import sqlite3
import json
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__,
            template_folder='webapp/templates',
            static_folder='webapp/static')
CORS(app)

# Конфигурация
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
app.config['DATABASE'] = 'shop.db'


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


# ========== API ДЛЯ WEB APP ==========
@app.route('/api/products')
def api_products():
    """Получить список товаров"""
    category = request.args.get('category', 'all')
    db = get_db()

    if category != 'all':
        products = db.execute(
            'SELECT * FROM products WHERE category = ? AND stock > 0',
            (category,)
        ).fetchall()
    else:
        products = db.execute(
            'SELECT * FROM products WHERE stock > 0'
        ).fetchall()

    db.close()
    return jsonify([dict(product) for product in products])


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


# ========== API ДЛЯ АДМИНКИ ==========
@app.route('/api/admin/stats')
def admin_stats():
    """Статистика для админки"""
    db = get_db()

    total_products = db.execute('SELECT COUNT(*) FROM products').fetchone()[0]
    total_orders = db.execute('SELECT COUNT(*) FROM orders').fetchone()[0]
    pending_orders = db.execute(
        "SELECT COUNT(*) FROM orders WHERE status = 'pending'"
    ).fetchone()[0]

    revenue_result = db.execute(
        'SELECT SUM(total_price) FROM orders WHERE status = "completed"'
    ).fetchone()[0]
    total_revenue = revenue_result if revenue_result else 0

    db.close()

    return jsonify({
        'total_products': total_products,
        'total_orders': total_orders,
        'pending_orders': pending_orders,
        'total_revenue': total_revenue
    })


@app.route('/api/admin/products', methods=['GET', 'POST', 'PUT', 'DELETE'])
def admin_products():
    """Управление товарами"""
    db = get_db()

    if request.method == 'GET':
        products = db.execute(
            'SELECT * FROM products ORDER BY created_at DESC'
        ).fetchall()
        db.close()
        return jsonify([dict(product) for product in products])

    elif request.method == 'POST':
        data = request.json
        try:
            db.execute('''
                       INSERT INTO products (name, description, price, image_url, category, stock)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ''', (
                           data['name'],
                           data['description'],
                           data['price'],
                           data.get('image_url', ''),
                           data.get('category', ''),
                           data.get('stock', 0)
                       ))
            db.commit()
            product_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
            db.close()
            return jsonify({'success': True, 'id': product_id})
        except Exception as e:
            db.close()
            return jsonify({'success': False, 'error': str(e)}), 500

    elif request.method == 'PUT':
        data = request.json
        product_id = request.args.get('id')

        try:
            db.execute('''
                       UPDATE products
                       SET name        = ?,
                           description = ?,
                           price       = ?,
                           image_url   = ?,
                           category    = ?,
                           stock       = ?
                       WHERE id = ?
                       ''', (
                           data['name'],
                           data['description'],
                           data['price'],
                           data.get('image_url', ''),
                           data.get('category', ''),
                           data.get('stock', 0),
                           product_id
                       ))
            db.commit()
            db.close()
            return jsonify({'success': True})
        except Exception as e:
            db.close()
            return jsonify({'success': False, 'error': str(e)}), 500

    elif request.method == 'DELETE':
        product_id = request.args.get('id')
        try:
            db.execute('DELETE FROM products WHERE id = ?', (product_id,))
            db.commit()
            db.close()
            return jsonify({'success': True})
        except Exception as e:
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


@app.route('/api/admin/orders/<int:order_id>/status', methods=['PUT'])
def update_order_status(order_id):
    """Обновить статус заказа"""
    data = request.json
    db = get_db()

    try:
        db.execute(
            'UPDATE orders SET status = ? WHERE id = ?',
            (data['status'], order_id)
        )
        db.commit()
        db.close()
        return jsonify({'success': True})
    except Exception as e:
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== ЗАПУСК ==========
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)