// Telegram Shop Admin Panel - JavaScript

class AdminPanel {
    constructor() {
        this.currentPage = 'dashboard';
        this.products = [];
        this.orders = [];
        this.stats = {};
        this.editProductId = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadStats();
        this.loadProducts();
        this.loadOrders();
        this.setupCharts();

        // Автообновление каждые 30 секунд
        setInterval(() => this.refreshData(), 30000);

        console.log('✅ Admin Panel initialized');
    }

    bindEvents() {
        // Навигация
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage(item.dataset.page);
            });
        });

        // Обновление данных
        document.getElementById('refreshBtn')?.addEventListener('click', () => this.refreshData());

        // Управление товарами
        document.getElementById('addProductBtn')?.addEventListener('click', () => this.showPage('add-product'));
        document.getElementById('cancelAdd')?.addEventListener('click', () => this.showPage('products'));

        // Форма добавления товара
        document.getElementById('addProductForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addProduct();
        });

        // Форма редактирования товара
        document.getElementById('editProductForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateProduct();
        });

        // Фильтр заказов
        document.getElementById('orderStatusFilter')?.addEventListener('change', () => this.filterOrders());
        document.getElementById('orderDateFilter')?.addEventListener('change', () => this.filterOrders());

        // Закрытие модальных окон
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals());
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeAllModals();
            }
        });

        // Обработка Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeAllModals();
        });

        // Экспорт товаров
        document.getElementById('exportProducts')?.addEventListener('click', () => this.exportProducts());

        // Превью изображения
        document.getElementById('productImage')?.addEventListener('input', (e) => {
            this.previewImage(e.target.value);
        });
    }

    // ========== НАВИГАЦИЯ ==========
    showPage(pageId) {
        // Скрываем все страницы
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // Показываем выбранную страницу
        document.getElementById(pageId)?.classList.add('active');
        this.currentPage = pageId;

        // Обновляем заголовок
        const titles = {
            'dashboard': 'Статистика',
            'products': 'Управление товарами',
            'orders': 'Заказы',
            'add-product': 'Добавить товар',
            'settings': 'Настройки'
        };

        document.getElementById('pageTitle').textContent = titles[pageId] || 'Админ панель';

        // Обновляем активный пункт меню
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageId) {
                item.classList.add('active');
            }
        });

        // Обновляем данные если нужно
        if (pageId === 'products') this.loadProducts();
        if (pageId === 'orders') this.loadOrders();
        if (pageId === 'dashboard') this.loadStats();

        // Обновляем время последнего обновления
        this.updateLastUpdated();
    }

    // ========== ЗАГРУЗКА ДАННЫХ ==========
    async loadStats() {
        try {
            const response = await fetch('/api/admin/stats');
            this.stats = await response.json();
            this.renderStats();
            this.updateCharts();
        } catch (error) {
            console.error('Ошибка загрузки статистики:', error);
            this.showAlert('❌ Ошибка загрузки статистики', 'error');
        }
    }

    async loadProducts() {
        try {
            const response = await fetch('/api/admin/products');
            this.products = await response.json();
            this.renderProducts();
        } catch (error) {
            console.error('Ошибка загрузки товаров:', error);
            this.showAlert('❌ Ошибка загрузки товаров', 'error');
        }
    }

    async loadOrders() {
        try {
            const response = await fetch('/api/admin/orders');
            this.orders = await response.json();
            this.renderOrders();
        } catch (error) {
            console.error('Ошибка загрузки заказов:', error);
            this.showAlert('❌ Ошибка загрузки заказов', 'error');
        }
    }

    refreshData() {
        this.loadStats();
        if (this.currentPage === 'products') this.loadProducts();
        if (this.currentPage === 'orders') this.loadOrders();
        this.showAlert('✅ Данные обновлены', 'success');
        this.updateLastUpdated();
    }

    // ========== РЕНДЕРИНГ ==========
    renderStats() {
        document.getElementById('totalRevenue').textContent = this.formatPrice(this.stats.total_revenue || 0) + ' ₽';
        document.getElementById('totalOrders').textContent = this.stats.total_orders || 0;
        document.getElementById('totalProducts').textContent = this.stats.total_products || 0;
        document.getElementById('pendingOrders').textContent = this.stats.pending_orders || 0;
    }

    renderProducts() {
        const tableBody = document.getElementById('productsTableBody');
        if (!tableBody) return;

        if (this.products.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px;">
                        <i class="fas fa-box-open" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <h3 style="color: #666; margin-bottom: 10px;">Товары не найдены</h3>
                        <p style="color: #888;">Добавьте первый товар</p>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = this.products.map(product => `
            <tr>
                <td>${product.id}</td>
                <td>
                    <img src="${product.image_url || 'https://via.placeholder.com/100'}"
                         alt="${product.name}"
                         class="product-image-small"
                         onerror="this.src='https://via.placeholder.com/100'">
                </td>
                <td>
                    <div class="product-name">${product.name}</div>
                    <div class="product-desc">${product.description?.substring(0, 50) || ''}${product.description?.length > 50 ? '...' : ''}</div>
                </td>
                <td><strong>${this.formatPrice(product.price)} ₽</strong></td>
                <td>
                    <span class="stock-indicator ${this.getStockClass(product.stock)}">
                        <i class="fas fa-box"></i> ${product.stock} шт.
                    </span>
                </td>
                <td>${product.category || 'Без категории'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-edit" onclick="admin.editProduct(${product.id})" title="Редактировать">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon btn-delete" onclick="admin.deleteProduct(${product.id})" title="Удалить">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="btn-icon btn-view" onclick="admin.viewProduct(${product.id})" title="Просмотр">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderOrders() {
        const tableBody = document.getElementById('ordersTableBody');
        if (!tableBody) return;

        const filteredOrders = this.filterOrders();

        if (filteredOrders.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px;">
                        <i class="fas fa-clipboard-list" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <h3 style="color: #666; margin-bottom: 10px;">Заказы не найдены</h3>
                        <p style="color: #888;">Здесь будут отображаться заказы</p>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filteredOrders.map(order => {
            const items = JSON.parse(order.items);
            const itemsText = items.map(item => `${item.name} (×${item.quantity})`).join(', ');

            return `
                <tr>
                    <td><strong>#${order.id}</strong></td>
                    <td>
                        <div>${order.username || `Пользователь ${order.user_id}`}</div>
                        <small style="color: #888;">ID: ${order.user_id}</small>
                    </td>
                    <td title="${itemsText}">
                        <i class="fas fa-shopping-basket"></i> ${items.length} товаров
                    </td>
                    <td><strong>${this.formatPrice(order.total_price)} ₽</strong></td>
                    <td>
                        <select class="status-select" data-order-id="${order.id}" onchange="admin.updateOrderStatus(${order.id}, this.value)">
                            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Ожидает</option>
                            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>В обработке</option>
                            <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Завершен</option>
                            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Отменен</option>
                        </select>
                    </td>
                    <td>${new Date(order.created_at).toLocaleDateString('ru-RU')}</td>
                    <td>
                        <button class="btn-icon btn-view" onclick="admin.viewOrderDetails(${order.id})" title="Детали">
                            <i class="fas fa-info-circle"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ========== ФИЛЬТРАЦИЯ ЗАКАЗОВ ==========
    filterOrders() {
        const statusFilter = document.getElementById('orderStatusFilter')?.value;
        const dateFilter = document.getElementById('orderDateFilter')?.value;

        let filtered = [...this.orders];

        // Фильтр по статусу
        if (statusFilter && statusFilter !== 'all') {
            filtered = filtered.filter(order => order.status === statusFilter);
        }

        // Фильтр по дате
        if (dateFilter) {
            const filterDate = new Date(dateFilter);
            filtered = filtered.filter(order => {
                const orderDate = new Date(order.created_at);
                return orderDate.toDateString() === filterDate.toDateString();
            });
        }

        return filtered;
    }

    // ========== УПРАВЛЕНИЕ ТОВАРАМИ ==========
    async addProduct() {
        const formData = {
            name: document.getElementById('productName').value,
            description: document.getElementById('productDescription').value,
            price: parseFloat(document.getElementById('productPrice').value),
            stock: parseInt(document.getElementById('productStock').value),
            category: document.getElementById('productCategory').value,
            image_url: document.getElementById('productImage').value
        };

        // Валидация
        if (!formData.name || !formData.price || !formData.stock) {
            this.showAlert('❌ Заполните обязательные поля', 'error');
            return;
        }

        try {
            const response = await fetch('/api/admin/products', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Товар успешно добавлен!', 'success');
                document.getElementById('addProductForm').reset();
                document.getElementById('imagePreview').innerHTML = '';
                this.loadProducts();
                this.loadStats();
                this.showPage('products');
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('Ошибка добавления товара:', error);
            this.showAlert('❌ Ошибка добавления товара', 'error');
        }
    }

    async updateProduct() {
        const formData = {
            name: document.getElementById('editProductName').value,
            price: parseFloat(document.getElementById('editProductPrice').value),
            stock: parseInt(document.getElementById('editProductStock').value)
        };

        try {
            const response = await fetch(`/api/admin/products?id=${this.editProductId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Товар успешно обновлен!', 'success');
                this.closeAllModals();
                this.loadProducts();
                this.loadStats();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('Ошибка обновления товара:', error);
            this.showAlert('❌ Ошибка обновления товара', 'error');
        }
    }

    async deleteProduct(productId) {
        if (!confirm('Вы уверены, что хотите удалить этот товар? Это действие нельзя отменить.')) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/products?id=${productId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Товар удален!', 'success');
                this.loadProducts();
                this.loadStats();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('Ошибка удаления товара:', error);
            this.showAlert('❌ Ошибка удаления товара', 'error');
        }
    }

    editProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        this.editProductId = productId;
        document.getElementById('editProductId').value = productId;
        document.getElementById('editProductName').value = product.name;
        document.getElementById('editProductPrice').value = product.price;
        document.getElementById('editProductStock').value = product.stock;

        document.getElementById('editProductModal').style.display = 'flex';
    }

    viewProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        alert(`Просмотр товара #${productId}\n\n` +
              `Название: ${product.name}\n` +
              `Цена: ${this.formatPrice(product.price)} ₽\n` +
              `Остаток: ${product.stock} шт.\n` +
              `Категория: ${product.category || 'Не указана'}\n` +
              `Описание: ${product.description || 'Отсутствует'}`);
    }

    // ========== УПРАВЛЕНИЕ ЗАКАЗАМИ ==========
    async updateOrderStatus(orderId, status) {
        try {
            const response = await fetch(`/api/admin/orders/${orderId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status })
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert(`✅ Статус заказа #${orderId} изменен на "${status}"`, 'success');
                this.loadOrders();
                this.loadStats();
            }
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            this.showAlert('❌ Ошибка обновления статуса заказа', 'error');
        }
    }

    async viewOrderDetails(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;

        const items = JSON.parse(order.items);
        const itemsHtml = items.map(item => `
            <div class="order-item">
                <div class="order-item-name">${item.name}</div>
                <div class="order-item-details">
                    <span>${item.quantity} × ${this.formatPrice(item.price)} ₽</span>
                    <span class="order-item-total">${this.formatPrice(item.price * item.quantity)} ₽</span>
                </div>
            </div>
        `).join('');

        document.getElementById('orderDetailsId').textContent = orderId;
        document.getElementById('orderDetailsBody').innerHTML = `
            <div class="order-details">
                <div class="detail-row">
                    <span class="detail-label">Пользователь:</span>
                    <span class="detail-value">${order.username || `ID: ${order.user_id}`}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Дата заказа:</span>
                    <span class="detail-value">${new Date(order.created_at).toLocaleString('ru-RU')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Статус:</span>
                    <span class="detail-value status-badge status-${order.status}">
                        ${this.getStatusText(order.status)}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Общая сумма:</span>
                    <span class="detail-value total-price">${this.formatPrice(order.total_price)} ₽</span>
                </div>

                <div class="order-items">
                    <h4>Товары в заказе:</h4>
                    ${itemsHtml}
                </div>

                <div class="order-actions">
                    <button class="btn btn-primary" onclick="admin.updateOrderStatus(${orderId}, 'processing')">
                        Взять в обработку
                    </button>
                    <button class="btn btn-success" onclick="admin.updateOrderStatus(${orderId}, 'completed')">
                        Завершить заказ
                    </button>
                    <button class="btn btn-danger" onclick="admin.updateOrderStatus(${orderId}, 'cancelled')">
                        Отменить заказ
                    </button>
                </div>
            </div>
        `;

        document.getElementById('orderDetailsModal').style.display = 'flex';

        // Добавляем стили
        this.addOrderDetailsStyles();
    }

    // ========== ГРАФИКИ ==========
    setupCharts() {
        // График продаж
        const salesCtx = document.getElementById('salesChart')?.getContext('2d');
        if (salesCtx) {
            this.salesChart = new Chart(salesCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Продажи (₽)',
                        data: [],
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: 'Динамика продаж'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return value.toLocaleString('ru-RU') + ' ₽';
                                }
                            }
                        }
                    }
                }
            });
        }

        // График по категориям
        const categoriesCtx = document.getElementById('categoriesChart')?.getContext('2d');
        if (categoriesCtx) {
            this.categoriesChart = new Chart(categoriesCtx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            '#2ecc71', '#3498db', '#9b59b6', '#f1c40f',
                            '#e74c3c', '#1abc9c', '#34495e', '#95a5a6'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'right',
                        },
                        title: {
                            display: true,
                            text: 'Продажи по категориям'
                        }
                    }
                }
            });
        }
    }

    updateCharts() {
        // Обновляем график продаж (демо данные)
        if (this.salesChart) {
            const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
            const salesData = days.map(() => Math.floor(Math.random() * 100000) + 50000);

            this.salesChart.data.labels = days;
            this.salesChart.data.datasets[0].data = salesData;
            this.salesChart.update();
        }

        // Обновляем график по категориям (демо данные)
        if (this.categoriesChart) {
            const categories = ['Телефоны', 'Ноутбуки', 'Аксессуары', 'Гаджеты'];
            const categoryData = categories.map(() => Math.floor(Math.random() * 100) + 20);

            this.categoriesChart.data.labels = categories;
            this.categoriesChart.data.datasets[0].data = categoryData;
            this.categoriesChart.update();
        }
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(price);
    }

    getStockClass(stock) {
        if (stock > 20) return 'stock-high';
        if (stock > 5) return 'stock-medium';
        return 'stock-low';
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

    previewImage(url) {
        const preview = document.getElementById('imagePreview');
        if (!preview) return;

        if (!url) {
            preview.innerHTML = '<i class="fas fa-image" style="font-size: 48px; color: #ddd;"></i><p>Превью изображения</p>';
            return;
        }

        preview.innerHTML = `
            <img src="${url}"
                 alt="Превью"
                 style="max-width: 100%; max-height: 200px; border-radius: 8px;"
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/300x200';">
        `;
    }

    exportProducts() {
        const dataStr = JSON.stringify(this.products, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

        const exportFileDefaultName = `products-${new Date().toISOString().split('T')[0]}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();

        this.showAlert('✅ Товары экспортированы в JSON', 'success');
    }

    updateLastUpdated() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        document.getElementById('lastUpdated')?.textContent = timeString;
    }

    showAlert(message, type = 'info') {
        // Создаем алерт
        const alert = document.createElement('div');
        alert.className = `admin-alert admin-alert-${type}`;
        alert.textContent = message;
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 10px;
            background: ${type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : '#3498db'};
            color: white;
            z-index: 10000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            animation: alertSlideIn 0.3s ease;
            max-width: 400px;
            word-break: break-word;
        `;

        document.body.appendChild(alert);

        // Удаляем через 3 секунды
        setTimeout(() => {
            alert.style.animation = 'alertSlideOut 0.3s ease';
            setTimeout(() => alert.remove(), 300);
        }, 3000);

        // Добавляем стили для анимации
        if (!document.querySelector('#alert-animations')) {
            const style = document.createElement('style');
            style.id = 'alert-animations';
            style.textContent = `
                @keyframes alertSlideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                @keyframes alertSlideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    addOrderDetailsStyles() {
        const styleId = 'order-details-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .order-details {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .detail-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid #eee;
            }

            .detail-label {
                font-weight: 600;
                color: #555;
            }

            .detail-value {
                color: #333;
            }

            .total-price {
                font-size: 24px;
                font-weight: bold;
                color: #2ecc71;
            }

            .order-items {
                margin-top: 20px;
                padding-top: 20px;
                border-top: 2px solid #eee;
            }

            .order-items h4 {
                margin-bottom: 15px;
                color: #333;
            }

            .order-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                background: #f8f9fa;
                border-radius: 8px;
                margin-bottom: 10px;
            }

            .order-item-name {
                font-weight: 500;
            }

            .order-item-details {
                display: flex;
                align-items: center;
                gap: 20px;
            }

            .order-item-total {
                font-weight: bold;
                color: #2c3e50;
                min-width: 80px;
                text-align: right;
            }

            .order-actions {
                display: flex;
                gap: 10px;
                margin-top: 20px;
                flex-wrap: wrap;
            }

            .status-badge {
                padding: 6px 15px;
                border-radius: 20px;
                font-size: 14px;
                font-weight: 500;
                display: inline-block;
            }

            .status-pending { background: #fff3cd; color: #856404; }
            .status-processing { background: #cce5ff; color: #004085; }
            .status-completed { background: #d4edda; color: #155724; }
            .status-cancelled { background: #f8d7da; color: #721c24; }
        `;
        document.head.appendChild(style);
    }

    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.style.display = 'none';
        });
        this.editProductId = null;
    }
}

// Создаем глобальный экземпляр админки
const admin = new AdminPanel();

// Делаем доступным глобально
window.admin = admin;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    // Добавляем стили для алертов если их нет
    if (!document.querySelector('#alert-animations')) {
        const style = document.createElement('style');
        style.id = 'alert-animations';
        style.textContent = `
            @keyframes alertSlideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes alertSlideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
});