# check_routes.py
import requests


def check_admin_routes():
    base_url = "https://telegram-shop-full.onrender.com"

    admin_routes = [
        '/api/admin/dashboard',
        '/api/admin/products',
        '/api/admin/orders',
        '/api/admin/orders/<int:order_id>',
        '/api/admin/orders/<int:order_id>/status',
        '/api/admin/orders/<int:order_id>/cancel',
        '/api/admin/products/update',
        '/api/admin/products/create',
        '/api/admin/categories/manage',
        '/api/admin/categories/tree',
        '/api/admin/categories/tree/<int:id>',
        '/api/admin/discounts',
        '/api/admin/discounts/<int:id>',
        '/api/admin/discounts/<int:id>/status',
        '/api/admin/promo-codes',
        '/api/admin/promo-codes/<int:id>',
        '/api/admin/promo-codes/<int:id>/status',
        '/api/admin/couriers',
        '/api/admin/couriers/<int:courier_id>',
        '/api/admin/chats',
        '/api/admin/chat/messages/<int:order_id>',
        '/api/admin/chat/send',
        '/api/security/logs',
        '/api/security/clear-failed-logins',
        '/api/test-admin'
    ]
    print("🔍 Проверяем админ-маршруты...")
    print("=" * 60)

    for route in admin_routes:
        try:
            response = requests.get(base_url + route, timeout=5)

            if response.status_code == 404:
                print(f"❌ 404 - {route}")
            elif response.status_code == 200:
                print(f"✅ 200 - {route}")
                # Проверим что возвращает
                try:
                    data = response.json()
                    if isinstance(data, dict) and 'error' in data:
                        print(f"   ⚠️ Возвращает ошибку: {data.get('error')}")
                    elif isinstance(data, list):
                        print(f"   📊 Возвращает список ({len(data)} элементов)")
                    elif isinstance(data, dict):
                        print(f"   📊 Возвращает объект")
                except:
                    print(f"   📄 Возвращает не JSON")
            else:
                print(f"⚠️ {response.status_code} - {route}")

        except Exception as e:
            print(f"🚫 Ошибка - {route}: {e}")


if __name__ == "__main__":
    check_admin_routes()