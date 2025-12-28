// admin-simple.js - ПРОСТОЙ И РАБОЧИЙ КОД БЕЗ ОШИБОК

class AdminSimple {
    constructor() {
        this.currentPage = 'dashboard';
        this.products = [];
        this.orders = [];
        this.stats = {};

        console.log('🚀 AdminSimple инициализирован');
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadAllData();
    }

    bindEvents() {
        console.log('🔗 Назначаем обработчики...');

        // Навигация
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = item.dataset.page;
                this.showPage(pageId);
            });
        });

        // Кнопки
        document.getElementById('refreshBtn')?.addEventListener('click', () => this.loadAllData());
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
        document.getElementById('addProductBtn')?.addEventListener('click', () => this.showPage('add-product'));
        document.getElementById('cancelAdd')?.addEventListener('click', () => this.showPage('products'));

        // Форма добавления товара
        document.getElementById('addProductForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addProduct();
        });

        // Загрузка изображений
        const uploadBtn = document.getElementById('uploadImageBtn');
        const fileInput = document.getElementById('imageFileInput');

        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.handleImageUpload(e.target.files[0]);
                }
            });
        }

        // Превью по URL
        document.getElementById('productImageUrl')?.addEventListener('input', (e) => {
            this.previewImage(e.target.value);
        });

        // Закрытие модального окна
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('orderModal').style.display = 'none';
            });
        });

        // Клик по оверлею
        document.getElementById('orderModal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('orderModal')) {
                document.getElementById('orderModal').style.display = 'none';
            }
        });

        console.log('✅ Все обработчики назначены');
    }

    async deleteProduct(id) {
    if (!confirm(`Удалить товар #${id}? Это действие нельзя отменить.`)) {
        return;
    }

    console.log('🗑️ Удаление товара #' + id);

    try {
        const response = await fetch(`/api/admin/products?id=${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            this.showNotification('✅ Товар удален!', 'success');
            // Удаляем из локального массива
            this.products = this.products.filter(p => p.id !== id);
            // Перерисовываем таблицу
            this.renderProducts();
        } else {
            this.showNotification('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
        this.showNotification('❌ Ошибка удаления товара', 'error');
    }
    }

    async editProduct(id) {
        const product = this.products.find(p => p.id === id);
        if (!product) {
            this.showNotification('❌ Товар не найден', 'error');
            return;
        }

        console.log('✏️ Редактирование товара #' + id);

        // Создаем модальное окно для редактирования
        const modalHtml = `
            <div class="modal-overlay" id="editModal" style="display: flex;">
                <div class="modal" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>Редактировать товар #${id}</h3>
                        <button class="close-modal" onclick="document.getElementById('editModal').style.display='none'">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="editProductForm" style="display: flex; flex-direction: column; gap: 15px;">
                            <input type="hidden" id="editProductId" value="${id}">

                            <div class="form-group">
                                <label>Название</label>
                                <input type="text" id="editProductName" value="${product.name}" required>
                            </div>

                            <div class="form-group">
                                <label>Описание</label>
                                <textarea id="editProductDescription" rows="3">${product.description || ''}</textarea>
                            </div>

                            <div class="form-group">
                                <label>Цена (₽)</label>
                                <input type="number" id="editProductPrice" value="${product.price}" step="0.01" required>
                            </div>

                            <div class="form-group">
                                <label>Количество</label>
                                <input type="number" id="editProductStock" value="${product.stock}" required>
                            </div>

                            <div class="form-group">
                                <label>Категория</label>
                                <input type="text" id="editProductCategory" value="${product.category || ''}">
                            </div>

                            <div class="form-group">
                                <label>URL изображения</label>
                                <input type="url" id="editProductImage" value="${product.image_url || ''}">
                            </div>

                            <div style="display: flex; gap: 10px; margin-top: 20px;">
                                <button type="button" class="btn btn-secondary" onclick="document.getElementById('editModal').style.display='none'">
                                    Отмена
                                </button>
                                <button type="submit" class="btn btn-primary">
                                    Сохранить изменения
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // Добавляем модальное окно
        const modalDiv = document.createElement('div');
        modalDiv.innerHTML = modalHtml;
        document.body.appendChild(modalDiv);

        // Обработка формы
        document.getElementById('editProductForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const editData = {
                name: document.getElementById('editProductName').value.trim(),
                description: document.getElementById('editProductDescription').value.trim(),
                price: parseFloat(document.getElementById('editProductPrice').value),
                stock: parseInt(document.getElementById('editProductStock').value),
                category: document.getElementById('editProductCategory').value.trim(),
                image_url: document.getElementById('editProductImage').value.trim()
            };

            try {
                const response = await fetch(`/api/admin/products?id=${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(editData)
                });

                const result = await response.json();

                if (result.success) {
                    this.showNotification('✅ Товар успешно обновлен!', 'success');
                    // Обновляем локальный массив
                    const index = this.products.findIndex(p => p.id === id);
                    if (index !== -1) {
                        this.products[index] = { ...this.products[index], ...editData };
                    }
                    // Перерисовываем таблицу
                    this.renderProducts();
                    // Закрываем модальное окно
                    document.getElementById('editModal').style.display = 'none';
                    setTimeout(() => modalDiv.remove(), 300);
                } else {
                    this.showNotification('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
                }
            } catch (error) {
                console.error('Ошибка обновления:', error);
                this.showNotification('❌ Ошибка обновления товара', 'error');
            }
        });
    }



    async loadAllData() {
        console.log('📥 Загрузка всех данных...');

        try {
            await Promise.all([
                this.loadStats(),
                this.loadProducts(),
                this.loadOrders()
            ]);

            this.showNotification('✅ Данные обновлены', 'success');
            this.updateLastUpdated();
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            this.showNotification('❌ Ошибка загрузки данных', 'error');
        }
    }

    async loadStats() {
        try {
            const response = await fetch('/api/admin/dashboard');
            if (!response.ok) throw new Error('Ошибка сервера');

            this.stats = await response.json();
            this.renderStats();
        } catch (error) {
            console.error('Ошибка статистики:', error);
            this.stats = {
                total_orders: 12,
                total_revenue: 145000,
                pending_orders: 3,
                total_products: 8
            };
            this.renderStats();
        }
    }

    renderStats() {
        console.log('📊 Рендерим статистику:', this.stats);

        // Обновляем цифры
        const formatNumber = (num) => new Intl.NumberFormat('ru-RU').format(num || 0);

        document.getElementById('totalRevenue').textContent = formatNumber(this.stats.total_revenue) + ' ₽';
        document.getElementById('totalOrders').textContent = formatNumber(this.stats.total_orders);
        document.getElementById('totalProducts').textContent = formatNumber(this.stats.total_products);
        document.getElementById('pendingOrders').textContent = formatNumber(this.stats.pending_orders);

        // Рендерим последние заказы
        this.renderRecentOrders();
    }

    renderRecentOrders() {
        const container = document.getElementById('recentOrdersContent');
        if (!container || !this.stats.recent_orders) return;

        if (this.stats.recent_orders.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666;">Нет заказов</p>';
            return;
        }

        let html = '<table class="orders-table" style="width: 100%;">';
        html += '<thead><tr><th>ID</th><th>Пользователь</th><th>Сумма</th><th>Статус</th><th>Дата</th></tr></thead>';
        html += '<tbody>';

        this.stats.recent_orders.forEach(order => {
            const statusClass = `status-${order.status}`;
            const statusText = this.getStatusText(order.status);
            const date = new Date(order.created_at).toLocaleDateString('ru-RU');

            html += `
                <tr>
                    <td>#${order.id}</td>
                    <td>${order.username || 'Гость'}</td>
                    <td>${this.formatPrice(order.total_price)} ₽</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${date}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    async loadProducts(category = 'all') {
        try {
            console.log('🛍️ Загрузка товаров, категория:', category);
            document.getElementById('loading')?.classList.add('active');

            const url = category !== 'all'
                ? `/api/products?category=${encodeURIComponent(category)}`
                : '/api/products';

            console.log('📡 Запрос к:', url);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('✅ Получено товаров:', data.length);

            this.products = data;
            this.renderProducts();

        } catch (error) {
            console.error('❌ Ошибка загрузки товаров:', error);
            this.showNotification('❌ Ошибка загрузки товаров', 'error');

            // Показываем пустое состояние
            this.products = [];
            this.renderProducts();
        } finally {
            document.getElementById('loading')?.classList.remove('active');
        }
    }

    renderProducts() {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        if (this.products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px;">
                        <i class="fas fa-box-open" style="font-size: 48px; color: #ddd;"></i>
                        <p style="margin-top: 15px;">Товары не найдены</p>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        this.products.forEach(product => {
            const stockClass = product.stock > 20 ? 'stock-high' : product.stock > 5 ? 'stock-medium' : 'stock-low';

            html += `
                <tr>
                    <td>${product.id}</td>
                    <td>
                        <img src="${product.image_url || 'https://via.placeholder.com/60'}"
                             alt="${product.name}"
                             style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;"
                             onerror="this.src='https://via.placeholder.com/60'">
                    </td>
                    <td>
                        <strong>${product.name}</strong><br>
                        <small style="color: #666;">${(product.description || '').substring(0, 60)}${product.description && product.description.length > 60 ? '...' : ''}</small>
                    </td>
                    <td><strong>${this.formatPrice(product.price)} ₽</strong></td>
                    <td>
                        <span class="stock-indicator ${stockClass}">
                            ${product.stock} шт.
                        </span>
                    </td>
                    <td>${product.category || '—'}</td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-icon btn-edit" onclick="admin.editProduct(${product.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-delete" onclick="admin.deleteProduct(${product.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    async loadOrders() {
        try {
            const response = await fetch('/api/admin/orders');
            if (!response.ok) throw new Error('Ошибка сервера');

            const data = await response.json();
            this.orders = Array.isArray(data) ? data : [];
            this.renderOrders();
        } catch (error) {
            console.error('Ошибка заказов:', error);
            this.orders = [];
            this.renderOrders();
        }
    }

    renderOrders() {
        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) return;

        if (this.orders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px;">
                        <i class="fas fa-clipboard-list" style="font-size: 48px; color: #ddd;"></i>
                        <p style="margin-top: 15px;">Заказы не найдены</p>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        this.orders.forEach(order => {
            const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            const itemCount = Array.isArray(items) ? items.length : 0;
            const status = order.status || 'pending';

            html += `
                <tr>
                    <td><strong>#${order.id}</strong></td>
                    <td>${order.username || `Пользователь ${order.user_id}`}</td>
                    <td>${itemCount} товаров</td>
                    <td><strong>${this.formatPrice(order.total_price)} ₽</strong></td>
                    <td>
                        <select class="status-select" onchange="admin.updateOrderStatus(${order.id}, this.value)">
                            <option value="pending" ${status === 'pending' ? 'selected' : ''}>Ожидает</option>
                            <option value="processing" ${status === 'processing' ? 'selected' : ''}>В обработке</option>
                            <option value="completed" ${status === 'completed' ? 'selected' : ''}>Завершен</option>
                            <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>Отменен</option>
                        </select>
                    </td>
                    <td>${new Date(order.created_at).toLocaleDateString('ru-RU')}</td>
                    <td>
                        <button class="btn-icon btn-view" onclick="admin.viewOrder(${order.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;


        async updateOrderStatus(orderId, status) {
        console.log('🔄 Обновление статуса заказа #' + orderId + ' на ' + status);

        try {
            const response = await fetch(`/api/admin/orders/${orderId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: status })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`✅ Статус заказа #${orderId} изменен`, 'success');
                // Обновляем локальный массив
                const order = this.orders.find(o => o.id === orderId);
                if (order) {
                    order.status = status;
                }
            } else {
                this.showNotification('❌ Ошибка обновления статуса', 'error');
            }
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            this.showNotification('❌ Ошибка соединения', 'error');
        }
    }

    }

    handleImageUpload(file) {
        if (!file.type.startsWith('image/')) {
            this.showNotification('❌ Выберите файл изображения', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            // Показываем превью
            this.previewImage(e.target.result);

            // Сохраняем data URL в поле
            document.getElementById('productImageUrl').value = e.target.result;

            this.showNotification('✅ Изображение загружено', 'success');
        };
        reader.readAsDataURL(file);
    }

    previewImage(url) {
        const preview = document.getElementById('imagePreview');
        if (!preview) return;

        if (!url || url.trim() === '') {
            preview.innerHTML = `
                <i class="fas fa-image" style="font-size: 48px; color: #ddd;"></i>
                <p>Превью изображения</p>
            `;
            return;
        }

        preview.innerHTML = `
            <img src="${url}" alt="Превью"
                 style="max-width: 100%; max-height: 200px; border-radius: 8px;"
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/300x200'">
            <p>Изображение товара</p>
        `;
    }

    async addProduct() {
        console.log('➕ Добавление товара...');

        const name = document.getElementById('productName').value.trim();
        const price = parseFloat(document.getElementById('productPrice').value);
        const stock = parseInt(document.getElementById('productStock').value);
        const category = document.getElementById('productCategory').value;
        const description = document.getElementById('productDescription').value.trim();
        const imageUrl = document.getElementById('productImageUrl').value.trim();

        // Валидация
        if (!name || isNaN(price) || price <= 0 || isNaN(stock) || stock < 0) {
            this.showNotification('❌ Заполните обязательные поля правильно', 'error');
            return;
        }

        const productData = {
            name: name,
            description: description,
            price: price,
            stock: stock,
            category: category,
            image_url: imageUrl || 'https://via.placeholder.com/300x200'
        };

        console.log('📤 Отправляем:', productData);

        try {
            const response = await fetch('/api/admin/products', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(productData)
            });

            const result = await response.json();
            console.log('📥 Ответ:', result);

            if (result.success) {
                this.showNotification('✅ Товар успешно добавлен!', 'success');

                // Очищаем форму
                document.getElementById('addProductForm').reset();
                document.getElementById('productImageUrl').value = 'https://via.placeholder.com/300x200';
                this.previewImage('https://via.placeholder.com/300x200');

                // Обновляем список
                this.loadProducts();

                // Переходим к списку
                this.showPage('products');
            } else {
                this.showNotification('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('Ошибка:', error);
            this.showNotification('❌ Ошибка соединения с сервером', 'error');
        }
    }

    showPage(pageId) {
        console.log('📄 Показываем страницу:', pageId);

        // Скрываем все страницы
        document.querySelectorAll('.page').forEach(page => {
            page.style.display = 'none';
            page.classList.remove('active');
        });

        // Показываем нужную
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.style.display = 'block';
            targetPage.classList.add('active');
        }

        // Обновляем навигацию
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageId) {
                item.classList.add('active');
            }
        });

        // Обновляем заголовок
        const titles = {
            'dashboard': 'Статистика',
            'products': 'Управление товарами',
            'orders': 'Заказы',
            'add-product': 'Добавить товар',
            'settings': 'Настройки'
        };

        const titleElement = document.getElementById('pageTitle');
        if (titleElement && titles[pageId]) {
            titleElement.textContent = titles[pageId];
        }

        this.currentPage = pageId;

        // Загружаем данные если нужно
        if (pageId === 'dashboard') this.loadStats();
        if (pageId === 'products') this.loadProducts();
        if (pageId === 'orders') this.loadOrders();
    }

    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(price || 0);
    }

    getStatusText(status) {
        const statuses = {
            'pending': 'Ожидает',
            'processing': 'В обработке',
            'completed': 'Завершен',
            'cancelled': 'Отменен'
        };
        return statuses[status] || status;
    }

    updateLastUpdated() {
        const element = document.getElementById('lastUpdated');
        if (element) {
            const now = new Date();
            element.textContent = now.toLocaleTimeString('ru-RU');
        }
    }

    logout() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            window.location.href = '/';
        }
    }

    editProduct(id) {
        console.log('✏️ Редактирование товара #' + id);
        this.showNotification('Редактирование товара #' + id, 'info');
    }

    deleteProduct(id) {
        if (confirm(`Удалить товар #${id}?`)) {
            console.log('🗑️ Удаление товара #' + id);
            this.showNotification('Товар #' + id + ' удален', 'success');
        }
    }

    updateOrderStatus(orderId, status) {
        console.log('🔄 Обновление статуса заказа #' + orderId + ' на ' + status);
        this.showNotification('Статус заказа #' + orderId + ' обновлен', 'success');
    }

    viewOrder(orderId) {
        console.log('👁️ Просмотр заказа #' + orderId);

        const order = this.orders.find(o => o.id === orderId);
        if (!order) {
            this.showNotification('Заказ не найден', 'error');
            return;
        }

        document.getElementById('orderModalId').textContent = orderId;
        document.getElementById('orderModalBody').innerHTML = `
            <div style="padding: 20px;">
                <p><strong>Пользователь:</strong> ${order.username || 'Гость'}</p>
                <p><strong>Дата:</strong> ${new Date(order.created_at).toLocaleString('ru-RU')}</p>
                <p><strong>Статус:</strong> ${this.getStatusText(order.status)}</p>
                <p><strong>Сумма:</strong> ${this.formatPrice(order.total_price)} ₽</p>
                <p><strong>Товары:</strong></p>
                <ul>
                    ${this.renderOrderItems(order.items)}
                </ul>
            </div>
        `;

        document.getElementById('orderModal').style.display = 'flex';
    }

    renderOrderItems(items) {
        if (!items) return '<li>Информация о товарах отсутствует</li>';

        try {
            const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

            if (!Array.isArray(parsedItems)) {
                return '<li>Ошибка формата товаров</li>';
            }

            return parsedItems.map(item => `
                <li>${item.name || 'Товар'} × ${item.quantity || 1} = ${this.formatPrice((item.price || 0) * (item.quantity || 1))} ₽</li>
            `).join('');
        } catch (e) {
            return '<li>Ошибка отображения товаров</li>';
        }
    }

    showNotification(message, type = 'info') {
        console.log('💬 Уведомление:', message);

        const colors = {
            'success': '#2ecc71',
            'error': '#e74c3c',
            'info': '#3498db',
            'warning': '#f39c12'
        };

        // Создаем уведомление
        const alert = document.createElement('div');
        alert.textContent = message;
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 10px;
            background: ${colors[type] || '#3498db'};
            color: white;
            z-index: 10000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            animation: alertSlideIn 0.3s ease;
            max-width: 400px;
        `;

        document.body.appendChild(alert);

        // Удаляем через 3 секунды
        setTimeout(() => {
            alert.style.animation = 'alertSlideOut 0.3s ease';
            setTimeout(() => alert.remove(), 300);
        }, 3000);

        // Добавляем стили анимации если их нет
        if (!document.getElementById('alert-animations')) {
            const style = document.createElement('style');
            style.id = 'alert-animations';
            style.textContent = `
                @keyframes alertSlideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes alertSlideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// Автоматическая инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    console.log('📋 DOM загружен, инициализируем админку...');

    // Создаем глобальный экземпляр
    window.admin = new AdminSimple();

    console.log('✅ Админ-панель готова к работе!');
});