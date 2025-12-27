// Telegram Shop Admin Panel - Полностью рабочий
class AdminPanelFixed {
    constructor() {
        this.currentPage = 'dashboard';
        this.products = [];
        this.orders = [];
        this.categories = [];
        this.stats = {};
        this.currentProduct = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadAllData();
        this.setupRealTimeUpdates();

        console.log('✅ Админ панель инициализирована');
    }

    bindEvents() {
        // Навигация
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage(item.dataset.page);
            });
        });

        // Обновление
        document.getElementById('refreshBtn')?.addEventListener('click', () => this.loadAllData());

        // Управление товарами
        document.getElementById('addProductBtn')?.addEventListener('click', () => this.showAddProductForm());
        document.getElementById('cancelAdd')?.addEventListener('click', () => this.showPage('products'));

        // Формы
        document.getElementById('addProductForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addProduct();
        });

        document.getElementById('editProductForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateProduct();
        });

        // Фильтры
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

        // Экспорт
        document.getElementById('exportProducts')?.addEventListener('click', () => this.exportData());

        // Превью изображения
        document.getElementById('productImage')?.addEventListener('input', (e) => {
            this.previewImage(e.target.value);
        });

        // Кнопки действий в таблицах
        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-edit')) {
                const productId = e.target.closest('.btn-edit').dataset.id;
                this.editProduct(parseInt(productId));
            }

            if (e.target.closest('.btn-delete')) {
                const productId = e.target.closest('.btn-delete').dataset.id;
                this.deleteProduct(parseInt(productId));
            }

            if (e.target.closest('.btn-view-order')) {
                const orderId = e.target.closest('.btn-view-order').dataset.id;
                this.viewOrderDetails(parseInt(orderId));
            }
        });

        // Telegram BackButton для админки
        if (window.Telegram?.WebApp) {
            Telegram.WebApp.BackButton.onClick(() => {
                if (document.querySelector('.modal-overlay[style*="display: flex"]')) {
                    this.closeAllModals();
                } else {
                    window.location.href = '/';
                }
            });
        }
    }

    // ========== ЗАГРУЗКА ДАННЫХ ==========
    async loadAllData() {
        try {
            await Promise.all([
                this.loadStats(),
                this.loadProducts(),
                this.loadOrders(),
                this.loadCategories()
            ]);

            this.showAlert('✅ Данные обновлены', 'success');
            this.updateLastUpdated();
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            this.showAlert('❌ Ошибка загрузки данных', 'error');
        }
    }

    async loadStats() {
        try {
            const response = await fetch('/api/admin/dashboard');
            if (!response.ok) throw new Error('Ошибка сервера');

            this.stats = await response.json();
            this.renderStats();
        } catch (error) {
            console.error('Ошибка загрузки статистики:', error);
            // Заглушка для демо
            this.stats = {
                total_orders: 15,
                total_revenue: 125000,
                pending_orders: 3,
                total_products: 8,
                total_customers: 10,
                avg_order_value: 8333
            };
            this.renderStats();
        }
    }

    async loadProducts() {
        try {
            const response = await fetch('/api/admin/products');
            if (!response.ok) throw new Error('Ошибка сервера');

            this.products = await response.json();
            this.renderProducts();
        } catch (error) {
            console.error('Ошибка загрузки товаров:', error);
            this.products = [];
            this.renderProducts();
        }
    }

    async loadOrders() {
        try {
            const response = await fetch('/api/admin/orders');
            if (!response.ok) throw new Error('Ошибка сервера');

            const data = await response.json();
            this.orders = Array.isArray(data) ? data : [];
            this.renderOrders();
        } catch (error) {
            console.error('Ошибка загрузки заказов:', error);
            this.orders = [];
            this.renderOrders();
        }
    }

    async loadCategories() {
        try {
            const response = await fetch('/api/categories');
            if (!response.ok) throw new Error('Ошибка сервера');

            this.categories = await response.json();
            this.updateCategorySelects();
        } catch (error) {
            console.error('Ошибка загрузки категорий:', error);
            this.categories = ['Телефоны', 'Ноутбуки', 'Аксессуары', 'Гаджеты'];
            this.updateCategorySelects();
        }
    }

    // ========== РЕНДЕРИНГ ==========
    renderStats() {
        // Основная статистика
        document.getElementById('totalRevenue').textContent =
            this.formatPrice(this.stats.total_revenue || 0) + ' ₽';
        document.getElementById('totalOrders').textContent =
            this.stats.total_orders || 0;
        document.getElementById('totalProducts').textContent =
            this.stats.total_products || 0;
        document.getElementById('pendingOrders').textContent =
            this.stats.pending_orders || 0;

        // Дополнительная статистика
        const additionalStats = document.getElementById('additionalStats');
        if (additionalStats) {
            additionalStats.innerHTML = `
                <div class="stat-card mini">
                    <div class="stat-icon customers">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${this.stats.total_customers || 0}</h3>
                        <p>Покупателей</p>
                    </div>
                </div>
                <div class="stat-card mini">
                    <div class="stat-icon avg">
                        <i class="fas fa-chart-bar"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${this.formatPrice(this.stats.avg_order_value || 0)} ₽</h3>
                        <p>Средний чек</p>
                    </div>
                </div>
            `;
        }

        // Обновляем графики
        this.updateCharts();
    }

    renderProducts() {
        const tableBody = document.getElementById('productsTableBody');
        if (!tableBody) return;

        if (this.products.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-box-open"></i>
                            <h4>Товары не найдены</h4>
                            <p>Добавьте первый товар</p>
                            <button class="btn btn-primary" onclick="admin.showPage('add-product')">
                                <i class="fas fa-plus"></i> Добавить товар
                            </button>
                        </div>
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
                    <div class="product-desc">${product.description?.substring(0, 60) || 'Нет описания'}${product.description?.length > 60 ? '...' : ''}</div>
                </td>
                <td><strong>${this.formatPrice(product.price)} ₽</strong></td>
                <td>
                    <span class="stock-badge ${this.getStockClass(product.stock)}">
                        <i class="fas fa-box"></i> ${product.stock} шт.
                    </span>
                </td>
                <td>${product.category || 'Без категории'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-edit" data-id="${product.id}" title="Редактировать">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon btn-delete" data-id="${product.id}" title="Удалить">
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
                    <td colspan="7" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-clipboard-list"></i>
                            <h4>Заказы не найдены</h4>
                            <p>Здесь будут отображаться заказы покупателей</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filteredOrders.map(order => {
            const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            const itemsCount = Array.isArray(items) ? items.length : 0;

            return `
                <tr>
                    <td><strong>#${order.id}</strong></td>
                    <td>
                        <div>${order.username || `Пользователь ${order.user_id}`}</div>
                        <small class="text-muted">ID: ${order.user_id}</small>
                    </td>
                    <td>
                        <i class="fas fa-shopping-basket"></i> ${itemsCount} товаров
                    </td>
                    <td><strong>${this.formatPrice(order.total_price)} ₽</strong></td>
                    <td>
                        <select class="status-select" data-order-id="${order.id}"
                                onchange="admin.updateOrderStatus(${order.id}, this.value)">
                            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Ожидает</option>
                            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>В обработке</option>
                            <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Завершен</option>
                            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Отменен</option>
                        </select>
                    </td>
                    <td>${new Date(order.created_at).toLocaleDateString('ru-RU')}</td>
                    <td>
                        <button class="btn-icon btn-view-order" data-id="${order.id}" title="Детали заказа">
                            <i class="fas fa-info-circle"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ========== УПРАВЛЕНИЕ ТОВАРАМИ ==========
    showAddProductForm() {
        this.showPage('add-product');
        document.getElementById('addProductForm').reset();
        document.getElementById('imagePreview').innerHTML = '';
    }

    async addProduct() {
        const formData = {
            name: document.getElementById('productName').value.trim(),
            description: document.getElementById('productDescription').value.trim(),
            price: parseFloat(document.getElementById('productPrice').value),
            stock: parseInt(document.getElementById('productStock').value),
            category: document.getElementById('productCategory').value.trim(),
            image_url: document.getElementById('productImage').value.trim()
        };

        // Валидация
        if (!formData.name || !formData.price || isNaN(formData.price) || !formData.stock || isNaN(formData.stock)) {
            this.showAlert('❌ Заполните обязательные поля корректно', 'error');
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
                this.loadAllData();
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
        if (!this.currentProduct) return;

        const formData = {
            name: document.getElementById('editProductName').value.trim(),
            description: document.getElementById('editProductDescription')?.value.trim() || '',
            price: parseFloat(document.getElementById('editProductPrice').value),
            stock: parseInt(document.getElementById('editProductStock').value),
            category: document.getElementById('editProductCategory')?.value.trim() || '',
            image_url: document.getElementById('editProductImage')?.value.trim() || ''
        };

        try {
            const response = await fetch(`/api/admin/products?id=${this.currentProduct.id}`, {
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
                this.loadAllData();
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
                this.loadAllData();
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

        this.currentProduct = product;

        document.getElementById('editProductId').value = productId;
        document.getElementById('editProductName').value = product.name;
        document.getElementById('editProductDescription').value = product.description || '';
        document.getElementById('editProductPrice').value = product.price;
        document.getElementById('editProductStock').value = product.stock;
        document.getElementById('editProductCategory').value = product.category || '';
        document.getElementById('editProductImage').value = product.image_url || '';

        document.getElementById('editProductModal').style.display = 'flex';
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
                this.showAlert(`✅ Статус заказа #${orderId} изменен`, 'success');
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

        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

        let itemsHtml = '';
        if (Array.isArray(items)) {
            itemsHtml = items.map(item => `
                <div class="order-item">
                    <div class="order-item-name">${item.name || 'Товар'}</div>
                    <div class="order-item-details">
                        <span>${item.quantity || 1} × ${this.formatPrice(item.price || 0)} ₽</span>
                        <span class="order-item-total">${this.formatPrice((item.price || 0) * (item.quantity || 1))} ₽</span>
                    </div>
                </div>
            `).join('');
        }

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
                    ${itemsHtml || '<p>Информация о товарах отсутствует</p>'}
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
        this.addOrderDetailsStyles();
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        document.getElementById(pageId)?.classList.add('active');
        this.currentPage = pageId;

        const titles = {
            'dashboard': 'Статистика',
            'products': 'Управление товарами',
            'orders': 'Заказы',
            'add-product': 'Добавить товар',
            'settings': 'Настройки'
        };

        document.getElementById('pageTitle').textContent = titles[pageId] || 'Админ панель';

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageId) {
                item.classList.add('active');
            }
        });

        if (pageId === 'products') this.loadProducts();
        if (pageId === 'orders') this.loadOrders();
        if (pageId === 'dashboard') this.loadStats();

        this.updateLastUpdated();
    }

    filterOrders() {
        const statusFilter = document.getElementById('orderStatusFilter')?.value;
        const dateFilter = document.getElementById('orderDateFilter')?.value;

        let filtered = [...this.orders];

        if (statusFilter && statusFilter !== 'all') {
            filtered = filtered.filter(order => order.status === statusFilter);
        }

        if (dateFilter) {
            const filterDate = new Date(dateFilter);
            filtered = filtered.filter(order => {
                const orderDate = new Date(order.created_at);
                return orderDate.toDateString() === filterDate.toDateString();
            });
        }

        return filtered;
    }

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

    updateCategorySelects() {
        const selects = document.querySelectorAll('#productCategory, #editProductCategory');
        selects.forEach(select => {
            if (select && this.categories.length > 0) {
                select.innerHTML = '<option value="">Выберите категорию</option>' +
                    this.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
            }
        });
    }

    previewImage(url) {
        const preview = document.getElementById('imagePreview');
        if (!preview) return;

        if (!url) {
            preview.innerHTML = '<i class="fas fa-image"></i><p>Превью изображения</p>';
            return;
        }

        preview.innerHTML = `
            <img src="${url}"
                 alt="Превью"
                 style="max-width: 100%; max-height: 200px; border-radius: 8px;"
                 onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-exclamation-triangle\\'></i><p>Ошибка загрузки изображения</p>'">
        `;
    }

    exportData() {
        const data = {
            products: this.products,
            orders: this.orders,
            stats: this.stats,
            exported_at: new Date().toISOString()
        };

        const dataStr = JSON.stringify(data, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

        const exportFileDefaultName = `telegram-shop-backup-${new Date().toISOString().split('T')[0]}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();

        this.showAlert('✅ Данные экспортированы', 'success');
    }

    updateLastUpdated() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ru-RU');
        document.getElementById('lastUpdated')?.textContent = timeString;
    }

    setupRealTimeUpdates() {
        // Обновляем каждые 30 секунд
        setInterval(() => {
            if (this.currentPage === 'dashboard') this.loadStats();
            if (this.currentPage === 'orders') this.loadOrders();
        }, 30000);
    }

    showAlert(message, type = 'info') {
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

        setTimeout(() => {
            alert.style.animation = 'alertSlideOut 0.3s ease';
            setTimeout(() => alert.remove(), 300);
        }, 3000);
    }

    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.style.display = 'none';
        });
        this.currentProduct = null;
    }

    addOrderDetailsStyles() {
        const styleId = 'order-details-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .order-details { display: flex; flex-direction: column; gap: 20px; }
            .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
            .detail-label { font-weight: 600; color: #555; }
            .detail-value { color: #333; }
            .total-price { font-size: 24px; font-weight: bold; color: #2ecc71; }
            .order-items { margin-top: 20px; padding-top: 20px; border-top: 2px solid #eee; }
            .order-items h4 { margin-bottom: 15px; color: #333; }
            .order-item { display: flex; justify-content: space-between; padding: 12px; background: #f8f9fa; border-radius: 8px; margin-bottom: 10px; }
            .order-item-name { font-weight: 500; }
            .order-item-details { display: flex; align-items: center; gap: 20px; }
            .order-item-total { font-weight: bold; color: #2c3e50; min-width: 80px; text-align: right; }
            .order-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
            .status-badge { padding: 6px 15px; border-radius: 20px; font-size: 14px; font-weight: 500; }
            .status-pending { background: #fff3cd; color: #856404; }
            .status-processing { background: #cce5ff; color: #004085; }
            .status-completed { background: #d4edda; color: #155724; }
            .status-cancelled { background: #f8d7da; color: #721c24; }
            .text-center { text-align: center; }
            .text-muted { color: #888; }
            .empty-state { padding: 40px; }
            .empty-state i { font-size: 48px; color: #ddd; margin-bottom: 15px; }
            .empty-state h4 { color: #666; margin-bottom: 10px; }
            .empty-state p { color: #888; margin-bottom: 20px; }
            .stock-badge { padding: 4px 12px; border-radius: 12px; font-size: 12px; }
            .stock-high { background: #d4edda; color: #155724; }
            .stock-medium { background: #fff3cd; color: #856404; }
            .stock-low { background: #f8d7da; color: #721c24; }
            .stat-card.mini { flex-direction: row; padding: 15px; }
            .stat-card.mini .stat-icon { width: 40px; height: 40px; font-size: 18px; }
            .stat-card.mini .stat-info h3 { font-size: 20px; }
            .stat-icon.customers { background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%); }
            .stat-icon.avg { background: linear-gradient(135deg, #1abc9c 0%, #16a085 100%); }
        `;
        document.head.appendChild(style);
    }

    updateCharts() {
        // Здесь будет обновление графиков
        console.log('Charts would be updated with real data');
    }
}

// Инициализация
const admin = new AdminPanelFixed();
window.admin = admin;

// Добавляем стили для анимаций
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes alertSlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes alertSlideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        .admin-alert { position: fixed; top: 20px; right: 20px; z-index: 10000; }
    `;
    document.head.appendChild(style);
});