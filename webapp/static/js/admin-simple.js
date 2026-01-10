// admin.js
console.log('🚀 Админ панель загружается...');

class AdminPanel {
    constructor() {
        this.currentPage = 'dashboard';
        this.products = [];
        this.orders = [];
        this.categories = [];
        this.selectedFile = null;
        this.uploadProgress = 0;
        this.imageSourceType = 'url';
        this.isEditing = false;
        this.editingProductId = null;
        this.showNotification = this.showNotification.bind(this);

        // Свойства для новых функций
        this.discounts = [];
        this.promo_codes = [];
        this.categories_tree = [];
        this.selectedDiscount = null;
        this.selectedPromoCode = null;
        this.selectedCategoryTree = null;
        this.allProducts = [];

        console.log('✅ Админ панель инициализирована');
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadProducts();
        this.loadOrders();
        this.loadCategories();
        this.loadDashboardData();
    }

    bindEvents() {
        console.log('🔗 Назначаем обработчики...');

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = item.dataset.page;
                this.showPage(pageId);
                if (pageId === 'add-product') {
                    setTimeout(() => {
                        this.showAddProduct();
                    }, 50);
                }
            });
        });

        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.refreshCurrentPage();
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('addProductBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showAddProduct();
        });

        document.getElementById('addCategoryBtn')?.addEventListener('click', () => {
            this.addCategory();
        });

        document.getElementById('newCategoryName')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addCategory();
            }
        });

        console.log('✅ Все обработчики назначены');
    }


    showNotification(message, type = 'info') {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = `admin-notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas fa-${type === 'success' ? 'check-circle' :
                                 type === 'error' ? 'exclamation-circle' :
                                 type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            </div>
            <div class="notification-content">${message}</div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }


    // ========== ОСНОВНЫЕ МЕТОДЫ ==========

    showAlert(message, type = 'info') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;

        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
        alertDiv.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        `;

        document.querySelector('.admin-main').prepend(alertDiv);

        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(price || 0));
    }

    logout() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            window.location.href = '/';
        }
    }

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
            page.style.display = 'none';
        });

        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.style.display = 'block';
            setTimeout(() => {
                targetPage.classList.add('active');
            }, 10);
        }

        if (pageId === 'promo-codes') {
            setTimeout(() => {
                this.initializePromoCodesPage();
            }, 50);
        }

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageId) {
                item.classList.add('active');
            }
        });

        const titles = {
            'dashboard': 'Статистика',
            'products': 'Управление товарами',
            'orders': 'Заказы',
            'add-product': this.isEditing ? 'Редактировать товар' : 'Добавить товар',
            'categories': 'Управление категориями',
            'discounts': 'Скидки',
            'promo-codes': 'Промокоды',
            'categories-tree': 'Дерево категорий'
        };

        const titleElement = document.getElementById('pageTitle');
        if (titleElement && titles[pageId]) {
            titleElement.textContent = titles[pageId];
        }

        this.currentPage = pageId;

        setTimeout(() => {
            if (pageId === 'dashboard') {
                this.loadDashboardData();
            } else if (pageId === 'products') {
                this.loadProducts();
            } else if (pageId === 'orders') {
                this.loadOrders();
            } else if (pageId === 'categories') {
                this.loadCategories();
            } else if (pageId === 'discounts') {
                this.loadDiscounts();
            } else if (pageId === 'promo-codes') {
                this.loadPromoCodes();
            } else if (pageId === 'categories-tree') {
                this.loadCategoriesTree();
            }
        }, 50);
    }



    refreshCurrentPage() {
        if (this.currentPage === 'dashboard') {
            this.loadDashboardData();
        } else if (this.currentPage === 'products') {
            this.loadProducts();
        } else if (this.currentPage === 'orders') {
            this.loadOrders();
        } else if (this.currentPage === 'categories') {
            this.loadCategories();
        } else if (this.currentPage === 'discounts') {
            this.loadDiscounts();
        } else if (this.currentPage === 'promo-codes') {
            this.loadPromoCodes();
        } else if (this.currentPage === 'categories-tree') {
            this.loadCategoriesTree();
        }

        const now = new Date();
        const lastUpdatedEl = document.getElementById('lastUpdated');
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
    }

    // ========== ЗАГРУЗКА ДАННЫХ ==========

    async loadProducts() {
        try {
            const response = await fetch('/api/admin/products');
            const products = await response.json();
            this.products = Array.isArray(products) ? products : [];
            this.renderProducts();
        } catch (error) {
            console.error('❌ Ошибка загрузки товаров:', error);
            this.showAlert('❌ Ошибка загрузки товаров', 'error');
            this.products = [];
            this.renderProducts();
        }
    }

    renderProducts() {
        const container = document.getElementById('productsTableBody');
        if (!container) return;

        if (this.products.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="7" class="no-data">
                        <i class="fas fa-box"></i>
                        <h3>Товары не найдены</h3>
                        <button class="btn btn-primary" onclick="admin.showAddProduct()">
                            <i class="fas fa-plus"></i> Добавить товар
                        </button>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        this.products.forEach(product => {
            const imageUrl = product.image_url && product.image_url.trim() !== ''
                ? product.image_url
                : 'https://via.placeholder.com/50x50?text=No+Image';
            const category = product.category || 'Без категории';

            html += `
                <tr>
                    <td><strong>#${product.id}</strong></td>
                    <td>
                        <img src="${imageUrl}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;" onerror="this.src='https://via.placeholder.com/50x50?text=Error'">
                    </td>
                    <td>
                        <div>
                            <strong>${product.name}</strong>
                            <small style="display: block; color: #666; margin-top: 5px;">
                                ${product.description ? product.description.substring(0, 50) + '...' : 'Нет описания'}
                            </small>
                        </div>
                    </td>
                    <td><strong>${this.formatPrice(product.price)} ₽</strong></td>
                    <td>${product.stock || 0} шт.</td>
                    <td><span class="category-badge">${category}</span></td>
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

        container.innerHTML = html;
    }

    async loadOrders() {
        try {
            console.log('📥 Загрузка заказов...');

            const response = await fetch('/api/admin/orders');
            const orders = await response.json();

            console.log('📦 Получены заказы:', orders);

            await this.renderOrders(orders);

        } catch (error) {
            console.error('❌ Ошибка загрузки заказов:', error);
            this.showNotification('❌ Не удалось загрузить заказы', 'error');
        }
    }

    async renderOrders(orders) {
        try {
            console.log('📋 Рендеринг таблицы заказов...');

            const ordersTableBody = document.getElementById('ordersTableBody');
            if (!ordersTableBody) {
                console.error('❌ ordersTableBody не найден!');
                return;
            }

            // Проверяем, действительно ли есть заказы
            if (!orders || orders.length === 0) {
                console.log('⚠️ Нет заказов для отображения');
                ordersTableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="empty-state">
                            <i class="fas fa-box-open"></i>
                            <p>Заказов нет</p>
                            <small>Ожидайте поступления новых заказов</small>
                        </td>
                    </tr>
                `;
                return;
            }

            console.log('🔄 Начинаем рендеринг таблицы...');
            let html = '';

            // Проходим по каждому заказу
            orders.forEach((order, index) => {
                console.log(`--- Заказ #${index + 1} ---`, order);

                // ПАРСИМ ITEMS
                let items = [];
                let itemsText = '';
                try {
                    if (typeof order.items === 'string') {
                        items = JSON.parse(order.items);
                    } else if (Array.isArray(order.items)) {
                        items = order.items;
                    }

                    // Формируем текст для отображения в таблице
                    if (items.length > 0) {
                        // Берем только первые 2-3 товара для компактного отображения
                        const displayItems = items.slice(0, 2);
                        itemsText = displayItems.map(item => {
                            const name = item.name || 'Товар';
                            const quantity = item.quantity || 1;
                            return `${name} × ${quantity}`;
                        }).join(', ');

                        if (items.length > 2) {
                            itemsText += ` и ещё ${items.length - 2}...`;
                        }
                    }
                } catch (error) {
                    console.error('❌ Ошибка парсинга items:', error);
                    itemsText = 'Ошибка загрузки товаров';
                }

                // Форматируем дату
                const orderDate = new Date(order.created_at || order.order_date || Date.now());
                const formattedDate = orderDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                // Определяем статус
                const statusConfig = {
                    'pending': { text: 'Ожидает', color: '#f59e0b', class: 'status-pending' },
                    'processing': { text: 'В обработке', color: '#3b82f6', class: 'status-processing' },
                    'delivering': { text: 'Доставляется', color: '#8b5cf6', class: 'status-delivering' },
                    'completed': { text: 'Завершен', color: '#10b981', class: 'status-completed' },
                    'cancelled': { text: 'Отменен', color: '#ef4444', class: 'status-cancelled' }
                };

                const status = statusConfig[order.status] || statusConfig.pending;

                // Форматируем сумму
                const totalAmount = this.formatPrice(order.total || 0);

                // Получаем имя клиента
                const clientName = order.username || order.recipient_name || 'Гость';

                // Собираем HTML для строки таблицы
                html += `
                    <tr data-order-id="${order.id}">
                        <td><strong>#${order.id}</strong></td>
                        <td>
                            <div class="client-info">
                                <i class="fas fa-user"></i>
                                <span>${clientName}</span>
                            </div>
                        </td>
                        <td>
                            <div class="order-items-preview">
                                <i class="fas fa-box"></i>
                                <span>${itemsText || 'Товары не указаны'}</span>
                            </div>
                        </td>
                        <td><strong>${totalAmount} ₽</strong></td>
                        <td>
                            <span class="order-status ${status.class}" style="color: ${status.color};">
                                <i class="fas fa-circle"></i>
                                ${status.text}
                            </span>
                        </td>
                        <td>${formattedDate}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-view-order" onclick="admin.viewOrderDetails(${order.id})"
                                        title="Просмотреть детали">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn-edit-order" onclick="admin.editOrder(${order.id})"
                                        title="Редактировать" ${order.status === 'completed' || order.status === 'cancelled' ? 'disabled' : ''}>
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-complete-order" onclick="admin.changeOrderStatus(${order.id}, 'completed')"
                                        title="Завершить заказ" ${order.status === 'completed' || order.status === 'cancelled' ? 'disabled' : ''}>
                                    <i class="fas fa-check"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            ordersTableBody.innerHTML = html;
            console.log('✅ Таблица заказов отрендерена, строк:', orders.length);

        } catch (error) {
            console.error('❌ Ошибка рендеринга заказов:', error);
            const ordersTableBody = document.getElementById('ordersTableBody');
            if (ordersTableBody) {
                ordersTableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="error-state">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Ошибка загрузки заказов</p>
                            <small>${error.message}</small>
                            <button class="btn btn-sm btn-outline" onclick="admin.loadOrders()">
                                <i class="fas fa-redo"></i> Попробовать снова
                            </button>
                        </td>
                    </tr>
                `;
            }
        }
    }

    async viewOrderDetails(orderId) {
        try {
            console.log('🔍 Просмотр заказа #', orderId);

            const response = await fetch(`/api/admin/orders/${orderId}`);
            const responseText = await response.text();
            console.log('📥 Ответ сервера (текст):', responseText);

            let order;
            try {
                order = JSON.parse(responseText);
            } catch (parseError) {
                console.error('❌ Ошибка парсинга JSON:', parseError);
                // Попробуем очистить
                const cleanedText = responseText.trim();
                if (cleanedText.startsWith('"') && cleanedText.endsWith('"')) {
                    order = JSON.parse(JSON.parse(cleanedText));
                } else {
                    throw new Error('Не удалось распарсить данные заказа');
                }
            }

            console.log('📦 Полученный заказ:', order);

            // Проверяем данные заказа
            console.log('🔍 Проверка данных заказа:');
            console.log('Total:', order.total);
            console.log('Items:', order.items);

            const modal = document.getElementById('orderDetailsModal');
            const modalContent = document.getElementById('orderDetailsContent');

            if (!modal || !modalContent) return;

            // ПАРСИМ ITEMS
            let items = [];
            let itemsTotal = 0;

            try {
                if (order.items) {
                    if (typeof order.items === 'string') {
                        items = JSON.parse(order.items);
                    } else if (Array.isArray(order.items)) {
                        items = order.items;
                    }

                    // ПРАВИЛЬНО считаем сумму товаров
                    items.forEach(item => {
                        const price = parseFloat(item.discounted_price || item.price || 0);
                        const quantity = parseInt(item.quantity || 1);
                        const itemTotal = price * quantity;
                        itemsTotal += itemTotal;

                        console.log(`📊 Товар: ${item.name}, Цена: ${price}, Кол-во: ${quantity}, Итого: ${itemTotal}`);
                    });
                }
            } catch (error) {
                console.error('❌ Ошибка парсинга items:', error);
                items = [];
            }

            console.log('💰 Итоговая сумма товаров:', itemsTotal);
            console.log('💰 Сумма из заказа:', order.total);

            // Используем правильную сумму
            const displayTotal = order.total && order.total > 0 ? order.total : itemsTotal;

            // Форматируем дату
            let formattedDate = 'Дата не указана';
            try {
                const orderDate = new Date(order.created_at || order.order_date || Date.now());
                formattedDate = orderDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (dateError) {
                console.error('❌ Ошибка форматирования даты:', dateError);
            }

            // Определяем статус
            const statusConfig = {
                'pending': { text: 'Ожидает', color: '#f59e0b' },
                'processing': { text: 'В обработке', color: '#3b82f6' },
                'delivering': { text: 'Доставляется', color: '#8b5cf6' },
                'completed': { text: 'Завершен', color: '#10b981' },
                'cancelled': { text: 'Отменен', color: '#ef4444' }
            };

            const status = statusConfig[order.status] || statusConfig.pending;

            // Получаем данные клиента
            const clientName = order.username || order.recipient_name || 'Гость';
            const phoneNumber = order.phone_number || 'Не указан';

            // ПРАВИЛЬНО парсим адрес
            let deliveryAddress = 'Не указан';
            try {
                if (order.delivery_address) {
                    if (typeof order.delivery_address === 'string') {
                        const parsedAddress = JSON.parse(order.delivery_address);
                        if (parsedAddress && typeof parsedAddress === 'object') {
                            // Форматируем адрес в читаемый вид
                            const addressParts = [];
                            if (parsedAddress.street) addressParts.push(`ул. ${parsedAddress.street}`);
                            if (parsedAddress.house) addressParts.push(`д. ${parsedAddress.house}`);
                            if (parsedAddress.apartment) addressParts.push(`кв. ${parsedAddress.apartment}`);
                            if (parsedAddress.city) addressParts.unshift(parsedAddress.city);

                            deliveryAddress = addressParts.join(', ');
                        } else {
                            deliveryAddress = order.delivery_address;
                        }
                    } else {
                        deliveryAddress = order.delivery_address;
                    }
                }
            } catch (addressError) {
                console.error('❌ Ошибка парсинга адреса:', addressError);
                deliveryAddress = order.delivery_address || 'Не указан';
            }

            // Создаем HTML для модального окна
            let itemsHTML = '';
            let calculatedItemsTotal = 0;

            if (items.length > 0) {
                items.forEach(item => {
                    const price = parseFloat(item.discounted_price || item.price || 0);
                    const quantity = parseInt(item.quantity || 1);
                    const itemTotal = price * quantity;
                    calculatedItemsTotal += itemTotal;

                    // ПРАВИЛЬНОЕ отображение цены товара
                    itemsHTML += `
                        <div class="order-detail-item">
                            <div class="item-name">${item.name || 'Товар'}</div>
                            <div class="item-details">
                                <span>${this.formatPrice(price)} ₽ × ${quantity}</span>
                                <span class="item-total">${this.formatPrice(itemTotal)} ₽</span>
                            </div>
                            ${item.is_weight ? `<div class="item-weight"><i class="fas fa-weight-hanging"></i> ${item.weight || 0} кг</div>` : ''}
                        </div>
                    `;
                });
            } else {
                itemsHTML = '<p class="no-items">Товары не указаны</p>';
            }

            // Используем правильную сумму из заказа или пересчитанную
            const finalTotal = order.total && order.total > 0 ? order.total : calculatedItemsTotal;
            const deliveryCost = order.delivery_cost || 0;
            const promoDiscount = order.promo_discount || 0;

            // ПРАВИЛЬНЫЙ расчет итоговой суммы
            const totalToPay = finalTotal;

            modalContent.innerHTML = `
                <div class="modal-header">
                    <h3><i class="fas fa-shopping-cart"></i> Детали заказа #${order.id}</h3>
                    <button class="close-modal" onclick="this.closest('.modal-overlay').style.display='none'">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="modal-body">
                    <div class="order-info-grid">
                        <div class="info-section">
                            <h4><i class="fas fa-info-circle"></i> Информация о заказе</h4>
                            <div class="info-row">
                                <span>Статус:</span>
                                <span class="order-status" style="color: ${status.color}; font-weight: 500;">
                                    ${status.text}
                                </span>
                            </div>
                            <div class="info-row">
                                <span>Дата:</span>
                                <span>${formattedDate}</span>
                            </div>
                            <div class="info-row">
                                <span>Способ доставки:</span>
                                <span>${order.delivery_type === 'courier' ? 'Курьер' :
                                       order.delivery_type === 'pickup' ? 'Самовывоз' : 'Не указан'}</span>
                            </div>
                            <div class="info-row">
                                <span>Способ оплаты:</span>
                                <span>${order.payment_method === 'cash' ? 'Наличные' :
                                       order.payment_method === 'transfer' ? 'Перевод' :
                                       order.payment_method === 'terminal' ? 'Терминал' : 'Не указан'}</span>
                            </div>
                            <div class="info-row">
                                <span>Итого:</span>
                                <span style="font-weight: bold; color: #2c3e50;">${this.formatPrice(totalToPay)} ₽</span>
                            </div>
                        </div>

                        <div class="info-section">
                            <h4><i class="fas fa-user"></i> Информация о клиенте</h4>
                            <div class="info-row">
                                <span>Имя:</span>
                                <span>${clientName}</span>
                            </div>
                            <div class="info-row">
                                <span>Телефон:</span>
                                <span>${phoneNumber}</span>
                            </div>
                            <div class="info-row">
                                <span>Адрес:</span>
                                <span>${deliveryAddress}</span>
                            </div>
                        </div>
                    </div>

                    <div class="order-items-section">
                        <h4><i class="fas fa-box"></i> Товары (${items.length})</h4>
                        <div class="items-list">
                            ${itemsHTML}
                        </div>

                        ${items.length > 0 ? `
                        <div class="order-total-section">
                            <div class="total-row">
                                <span>Сумма товаров:</span>
                                <span>${this.formatPrice(calculatedItemsTotal)} ₽</span>
                            </div>
                            ${deliveryCost > 0 ? `
                            <div class="total-row">
                                <span>Доставка:</span>
                                <span>${this.formatPrice(deliveryCost)} ₽</span>
                            </div>
                            ` : ''}
                            ${promoDiscount > 0 ? `
                            <div class="total-row discount">
                                <span>Скидка по промокоду:</span>
                                <span>-${this.formatPrice(promoDiscount)} ₽</span>
                            </div>
                            ` : ''}
                            <div class="total-row grand-total">
                                <span>Итого к оплате:</span>
                                <span style="font-weight: bold; color: #2c3e50;">${this.formatPrice(totalToPay)} ₽</span>
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <div class="modal-actions">
                        <div class="status-actions">
                            <button class="btn btn-outline" onclick="admin.changeOrderStatus(${order.id}, 'processing')"
                                    ${order.status === 'completed' || order.status === 'cancelled' ? 'disabled' : ''}>
                                <i class="fas fa-cog"></i> В обработку
                            </button>
                            <button class="btn btn-outline" onclick="admin.changeOrderStatus(${order.id}, 'delivering')"
                                    ${order.status === 'completed' || order.status === 'cancelled' || order.delivery_type !== 'courier' ? 'disabled' : ''}>
                                <i class="fas fa-truck"></i> В доставку
                            </button>
                            <button class="btn btn-success" onclick="admin.changeOrderStatus(${order.id}, 'completed')"
                                    ${order.status === 'completed' || order.status === 'cancelled' ? 'disabled' : ''}>
                                <i class="fas fa-check"></i> Завершить
                            </button>
                            <button class="btn btn-danger" onclick="admin.changeOrderStatus(${order.id}, 'cancelled')"
                                    ${order.status === 'completed' || order.status === 'cancelled' ? 'disabled' : ''}>
                                <i class="fas fa-times"></i> Отменить
                            </button>
                        </div>
                    </div>
                </div>
            `;

            modal.style.display = 'flex';

        } catch (error) {
            console.error('❌ Ошибка загрузки деталей заказа:', error);
            this.showNotification(`❌ Ошибка: ${error.message}`, 'error');
        }
    }

    // Добавь метод editOrder в класс AdminPanel:

    async editOrder(orderId) {
        try {
            console.log('✏️ Редактирование заказа #', orderId);

            // Загружаем данные заказа
            const response = await fetch(`/api/admin/orders/${orderId}`);
            const responseText = await response.text();

            let order;
            try {
                order = JSON.parse(responseText);
            } catch (parseError) {
                console.error('❌ Ошибка парсинга JSON:', parseError);
                throw new Error('Не удалось загрузить данные заказа');
            }

            // Создаем модальное окно редактирования
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
                padding: 20px;
            `;

            modal.innerHTML = `
                <div style="background: white; border-radius: 12px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto;">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: #2c3e50;">
                            <i class="fas fa-edit"></i> Редактирование заказа #${order.id}
                        </h3>
                        <button class="close-modal"
                                style="background: none; border: none; font-size: 20px; color: #64748b; cursor: pointer; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            &times;
                        </button>
                    </div>

                    <div style="padding: 20px;">
                        <form id="editOrderForm">
                            <div style="margin-bottom: 20px;">
                                <h4 style="margin: 0 0 15px 0; color: #334155;">Основная информация</h4>

                                <div style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #475569;">Статус заказа *</label>
                                    <select id="editOrderStatus" required style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                                        <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Ожидает</option>
                                        <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>В обработке</option>
                                        <option value="delivering" ${order.status === 'delivering' ? 'selected' : ''}>Доставляется</option>
                                        <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Завершен</option>
                                        <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Отменен</option>
                                    </select>
                                </div>

                                <div style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #475569;">Сумма заказа (₽) *</label>
                                    <input type="number" id="editOrderTotal"
                                           value="${order.total || 0}"
                                           step="0.01"
                                           min="0"
                                           required
                                           style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                                </div>

                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                    <div>
                                        <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #475569;">Тип доставки</label>
                                        <select id="editDeliveryType" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                                            <option value="courier" ${order.delivery_type === 'courier' ? 'selected' : ''}>Курьер</option>
                                            <option value="pickup" ${order.delivery_type === 'pickup' ? 'selected' : ''}>Самовывоз</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #475569;">Способ оплаты</label>
                                        <select id="editPaymentMethod" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                                            <option value="cash" ${order.payment_method === 'cash' ? 'selected' : ''}>Наличные</option>
                                            <option value="transfer" ${order.payment_method === 'transfer' ? 'selected' : ''}>Перевод</option>
                                            <option value="terminal" ${order.payment_method === 'terminal' ? 'selected' : ''}>Терминал</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
                                <h4 style="margin: 0 0 15px 0; color: #334155;">Информация о клиенте</h4>

                                <div style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #475569;">Имя получателя *</label>
                                    <input type="text" id="editRecipientName"
                                           value="${order.recipient_name || order.username || ''}"
                                           required
                                           style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                                </div>

                                <div style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #475569;">Телефон</label>
                                    <input type="tel" id="editPhoneNumber"
                                           value="${order.phone_number || ''}"
                                           placeholder="+7 (999) 123-45-67"
                                           style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                                </div>
                            </div>

                            <div style="margin-bottom: 20px;">
                                <h4 style="margin: 0 0 15px 0; color: #334155;">Промокод и скидки</h4>

                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                    <div>
                                        <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #475569;">Промокод</label>
                                        <input type="text" id="editPromoCode"
                                               value="${order.promo_code || ''}"
                                               placeholder="Введите промокод"
                                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                                    </div>

                                    <div>
                                        <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #475569;">Скидка по промокоду (₽)</label>
                                        <input type="number" id="editPromoDiscount"
                                               value="${order.promo_discount || 0}"
                                               step="0.01"
                                               min="0"
                                               style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                                    </div>
                                </div>

                                <div style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #475569;">Стоимость доставки (₽)</label>
                                    <input type="number" id="editDeliveryCost"
                                           value="${order.delivery_cost || 0}"
                                           step="0.01"
                                           min="0"
                                           style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                                </div>
                            </div>

                            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                                <button type="button" class="cancel-edit"
                                        style="padding: 10px 20px; border: 1px solid #e2e8f0; background: white; border-radius: 6px; color: #475569; cursor: pointer;">
                                    Отмена
                                </button>
                                <button type="submit"
                                        style="padding: 10px 20px; border: none; background: #667eea; color: white; border-radius: 6px; cursor: pointer; font-weight: 500;">
                                    Сохранить изменения
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Обработчики событий
            modal.querySelector('.close-modal').onclick = () => modal.remove();
            modal.querySelector('.cancel-edit').onclick = () => modal.remove();

            modal.querySelector('#editOrderForm').onsubmit = async (e) => {
                e.preventDefault();

                try {
                    const formData = {
                        status: document.getElementById('editOrderStatus').value,
                        total: parseFloat(document.getElementById('editOrderTotal').value),
                        delivery_type: document.getElementById('editDeliveryType').value,
                        payment_method: document.getElementById('editPaymentMethod').value,
                        recipient_name: document.getElementById('editRecipientName').value,
                        phone_number: document.getElementById('editPhoneNumber').value,
                        promo_code: document.getElementById('editPromoCode').value || null,
                        promo_discount: parseFloat(document.getElementById('editPromoDiscount').value) || 0,
                        delivery_cost: parseFloat(document.getElementById('editDeliveryCost').value) || 0
                    };

                    // Валидация
                    if (!formData.recipient_name.trim()) {
                        this.showNotification('❌ Введите имя получателя', 'error');
                        return;
                    }

                    if (formData.total <= 0) {
                        this.showNotification('❌ Сумма заказа должна быть больше 0', 'error');
                        return;
                    }

                    console.log('📤 Отправка изменений заказа:', formData);

                    const updateResponse = await fetch(`/api/admin/orders/${orderId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(formData)
                    });

                    const result = await updateResponse.json();

                    if (result.success) {
                        this.showNotification('✅ Заказ успешно обновлен', 'success');
                        modal.remove();

                        // Обновляем таблицу заказов
                        await this.loadOrders();
                    } else {
                        throw new Error(result.error || 'Ошибка обновления заказа');
                    }

                } catch (error) {
                    console.error('❌ Ошибка обновления заказа:', error);
                    this.showNotification(`❌ ${error.message}`, 'error');
                }
            };

        } catch (error) {
            console.error('❌ Ошибка редактирования заказа:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        }
    }

    async changeOrderStatus(orderId, newStatus) {
        try {
            console.log(`🔄 Изменение статуса заказа #${orderId} на ${newStatus}`);

            if (!confirm(`Вы уверены, что хотите изменить статус заказа #${orderId} на "${newStatus}"?`)) {
                return;
            }

            const response = await fetch(`/api/admin/orders/${orderId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: newStatus })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`✅ Статус заказа #${orderId} изменен на "${newStatus}"`, 'success');

                // Обновляем таблицу
                await this.loadOrders();

                // Закрываем модальное окно если оно открыто
                const modal = document.getElementById('orderDetailsModal');
                if (modal) {
                    modal.style.display = 'none';
                }
            } else {
                throw new Error(result.error || 'Ошибка изменения статуса');
            }

        } catch (error) {
            console.error('❌ Ошибка изменения статуса заказа:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        }
    }


    async loadCategories() {
        try {
            const response = await fetch('/api/admin/categories/manage');
            const categories = await response.json();
            this.categories = Array.isArray(categories) ? categories : [];
            this.renderCategories();
            this.updateCategorySelect();
        } catch (error) {
            console.error('❌ Ошибка загрузки категорий:', error);
            this.categories = [];
            this.renderCategories();
        }
    }

    renderCategories() {
        const container = document.getElementById('categoriesList');
        if (!container) return;

        if (this.categories.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-tags"></i>
                    <h3>Категории не найдены</h3>
                </div>
            `;
            return;
        }

        let html = '<div class="categories-grid">';
        this.categories.forEach(category => {
            const categoryName = typeof category === 'string' ? category : (category.name || category);
            html += `
                <div class="category-item">
                    <span>${categoryName}</span>
                    <div class="category-actions">
                        <button class="btn-icon btn-delete" onclick="admin.deleteCategory('${categoryName}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    async loadDashboardData() {
        try {
            const response = await fetch('/api/admin/dashboard');
            const stats = await response.json();

            document.getElementById('totalRevenue').textContent = this.formatPrice(stats.total_revenue || 0) + ' ₽';
            document.getElementById('totalOrders').textContent = stats.total_orders || 0;
            document.getElementById('totalProducts').textContent = stats.total_products || 0;
            document.getElementById('pendingOrders').textContent = stats.pending_orders || 0;

            const now = new Date();
            const lastUpdatedEl = document.getElementById('lastUpdated');
            if (lastUpdatedEl) {
                lastUpdatedEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки статистики:', error);
        }
    }

    // ========== ТОВАРЫ ==========

    showAddProduct() {
        this.isEditing = false;
        this.editingProductId = null;
        this.showPage('add-product');

        setTimeout(() => {
            try {
                this.resetProductForm();
                this.selectProductType('piece');

                if (this.categories.length === 0) {
                    this.loadCategories().then(() => {
                        this.updateCategorySelect();
                    });
                } else {
                    this.updateCategorySelect();
                }

                const fileInput = document.getElementById('productImageFile');
                if (fileInput) {
                    fileInput.addEventListener('change', (e) => this.handleImageUpload(e));
                }

                const form = document.getElementById('addProductForm');
                if (form) {
                    form.onsubmit = (e) => {
                        e.preventDefault();
                        this.handleProductSubmit(e);
                    };
                }
            } catch (error) {
                console.error('❌ Ошибка инициализации формы:', error);
            }
        }, 300);
    }

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const preview = document.getElementById('filePreview');
        if (preview) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.innerHTML = `
                    <img src="${e.target.result}" style="max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 10px;">
                    <p style="color: #666; margin-top: 5px;">${file.name} (${(file.size / 1024).toFixed(2)} KB)</p>
                `;
            };
            reader.readAsDataURL(file);
        }
    }

    selectProductType(type) {
        const typeButtons = document.querySelectorAll('.type-btn');
        typeButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.type === type) {
                btn.classList.add('active');
            }
        });

        const pieceFields = document.querySelectorAll('.product-type-piece');
        const weightFields = document.querySelectorAll('.product-type-weight');

        if (type === 'piece') {
            pieceFields.forEach(el => el.style.display = 'block');
            weightFields.forEach(el => el.style.display = 'none');

            const priceInput = document.getElementById('productPrice');
            const stockInput = document.getElementById('productStock');
            if (priceInput) priceInput.required = true;
            if (stockInput) stockInput.required = true;
        } else {
            weightFields.forEach(el => el.style.display = 'block');
            pieceFields.forEach(el => el.style.display = 'none');

            const pricePerKgInput = document.getElementById('pricePerKg');
            if (pricePerKgInput) pricePerKgInput.required = true;
        }
    }

    resetProductForm() {
        const fields = [
            'productName', 'productPrice', 'pricePerKg', 'productStock',
            'stockWeight', 'productCategory', 'unit', 'minWeight',
            'maxWeight', 'stepWeight', 'productDescription'
        ];

        fields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                if (element.type === 'select-one') {
                    element.value = fieldId === 'unit' ? 'кг' : '';
                } else if (fieldId === 'minWeight') {
                    element.value = '0.1';
                } else if (fieldId === 'maxWeight') {
                    element.value = '5.0';
                } else if (fieldId === 'stepWeight') {
                    element.value = '0.1';
                } else {
                    element.value = '';
                }
            }
        });

        const filePreview = document.getElementById('filePreview');
        if (filePreview) filePreview.innerHTML = '';

        const fileInput = document.getElementById('productImageFile');
        if (fileInput) fileInput.value = '';
    }

    async handleProductSubmit(e) {
        e.preventDefault();

        const activeTypeBtn = document.querySelector('.type-btn.active');
        const productType = activeTypeBtn ? activeTypeBtn.dataset.type : 'piece';

        const fileInput = document.getElementById('productImageFile');
        let imageFile = null;
        if (fileInput && fileInput.files.length > 0) {
            imageFile = fileInput.files[0];
        }

        if (!imageFile) {
            this.showAlert('❌ Загрузите изображение товара', 'error');
            return;
        }

        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(imageFile.type)) {
            this.showAlert('❌ Неподдерживаемый формат файла', 'error');
            return;
        }

        if (imageFile.size > 10 * 1024 * 1024) {
            this.showAlert('❌ Файл слишком большой. Максимальный размер 10MB', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('image', imageFile);

        try {
            const uploadResponse = await fetch('/api/upload-image', {
                method: 'POST',
                body: formData
            });
            const uploadResult = await uploadResponse.json();

            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'Ошибка загрузки файла');
            }

            const imageUrl = uploadResult.url;
            let productData = {};

            if (productType === 'piece') {
                productData = {
                    name: document.getElementById('productName').value,
                    description: document.getElementById('productDescription').value,
                    price: parseFloat(document.getElementById('productPrice').value) || 0,
                    stock: parseInt(document.getElementById('productStock').value) || 0,
                    image_url: imageUrl,
                    category: document.getElementById('productCategory').value,
                    product_type: 'piece'
                };
            } else {
                productData = {
                    name: document.getElementById('productName').value,
                    description: document.getElementById('productDescription').value,
                    price: 0,
                    stock: 0,
                    image_url: imageUrl,
                    category: document.getElementById('productCategory').value,
                    product_type: 'weight',
                    unit: document.getElementById('unit').value || 'кг',
                    price_per_kg: parseFloat(document.getElementById('pricePerKg').value) || 0,
                    min_weight: parseFloat(document.getElementById('minWeight').value) || 0.1,
                    max_weight: parseFloat(document.getElementById('maxWeight').value) || 5.0,
                    step_weight: parseFloat(document.getElementById('stepWeight').value) || 0.1,
                    stock_weight: parseFloat(document.getElementById('stockWeight').value) || 0
                };
            }

            let url = '/api/admin/products';
            let method = 'POST';

            if (this.isEditing && this.editingProductId) {
                url = `/api/admin/products?id=${this.editingProductId}`;
                method = 'PUT';
            }

            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(productData)
            });

            const result = await response.json();

            if (result.success) {
                const message = this.isEditing ? '✅ Товар успешно обновлен' : '✅ Товар успешно создан';
                this.showAlert(message, 'success');

                setTimeout(() => {
                    this.showPage('products');
                    this.loadProducts();
                }, 1000);
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка сохранения товара:', error);
            this.showAlert('❌ Ошибка соединения с сервером: ' + error.message, 'error');
        }
    }

    async editProduct(productId) {
        this.isEditing = true;
        this.editingProductId = productId;
        this.showPage('add-product');

        setTimeout(() => {
            this.loadProductForEdit(productId);
        }, 100);
    }

    async loadProductForEdit(productId) {
        try {
            const response = await fetch(`/api/admin/products?id=${productId}`);
            const product = await response.json();

            if (product) {
                document.getElementById('productName').value = product.name || '';
                document.getElementById('productDescription').value = product.description || '';
                document.getElementById('productPrice').value = product.price || 0;
                document.getElementById('productStock').value = product.stock || 0;

                if (product.category) {
                    document.getElementById('productCategory').value = product.category;
                }

                const filePreview = document.getElementById('filePreview');
                if (filePreview && product.image_url) {
                    filePreview.innerHTML = `
                        <img src="${product.image_url}" style="max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 10px;">
                        <p style="color: #666; margin-top: 5px;">Текущее изображение</p>
                    `;
                }

                this.selectProductType(product.product_type || 'piece');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки товара:', error);
            this.showAlert('❌ Ошибка загрузки данных товара', 'error');
        }
    }

    async deleteProduct(productId) {
        if (!confirm('Вы уверены, что хотите удалить этот товар?')) return;

        try {
            const response = await fetch(`/api/admin/products?id=${productId}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Товар удален', 'success');
                this.loadProducts();
            } else {
                this.showAlert('❌ Ошибка удаления товара: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка удаления товара:', error);
            this.showAlert('❌ Ошибка удаления товара', 'error');
        }
    }

    // ========== КАТЕГОРИИ ==========

    updateCategorySelect() {
        const select = document.getElementById('productCategory');
        if (select) {
            let options = '<option value="">Выберите категорию</option>';
            this.categories.forEach(category => {
                const categoryName = typeof category === 'string' ? category : (category.name || category);
                options += `<option value="${categoryName}">${categoryName}</option>`;
            });
            select.innerHTML = options;
        }
    }

    async addCategory() {
        const input = document.getElementById('newCategoryName');
        const categoryName = input?.value.trim();

        if (!categoryName) {
            this.showAlert('❌ Введите название категории', 'error');
            return;
        }

        if (this.categories.includes(categoryName)) {
            this.showAlert('❌ Такая категория уже существует', 'error');
            return;
        }

        try {
            const response = await fetch('/api/admin/categories/manage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: categoryName })
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Категория успешно создана', 'success');
                input.value = '';
                await this.loadCategories();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка создания категории:', error);
            this.showAlert('❌ Ошибка соединения с сервером', 'error');
        }
    }

    async deleteCategory(categoryName) {
        if (!confirm(`Вы уверены, что хотите удалить категорию "${categoryName}"?`)) return;

        try {
            const response = await fetch(`/api/admin/categories/manage?name=${encodeURIComponent(categoryName)}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Категория удалена', 'success');
                await this.loadCategories();
            } else {
                this.showAlert('❌ Ошибка удаления категории: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка удаления категории:', error);
            this.showAlert('❌ Ошибка удаления категории', 'error');
        }
    }

    // ========== ЗАКАЗЫ ==========

    async editOrderStatus(orderId) {
        const newStatus = prompt('Введите новый статус (pending, processing, delivering, completed, cancelled):', 'processing');

        if (!newStatus || !['pending', 'processing', 'delivering', 'completed', 'cancelled'].includes(newStatus)) {
            this.showAlert('❌ Неверный статус', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/admin/orders/${orderId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Статус заказа обновлен', 'success');
                this.loadOrders();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка обновления статуса заказа:', error);
            this.showAlert('❌ Ошибка обновления статуса заказа', 'error');
        }
    }

    // ========== СКИДКИ ==========

    async loadDiscounts() {
        try {
            const response = await fetch('/api/admin/discounts');
            this.discounts = await response.json();
            this.renderDiscounts();
        } catch (error) {
            console.error('❌ Ошибка загрузки скидок:', error);
            this.discounts = [];
            this.renderDiscounts();
        }
    }

    renderDiscounts() {
        const container = document.getElementById('discountsContainer');
        if (!container) return;

        if (this.discounts.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-percentage"></i>
                    <h3>Скидки не найдены</h3>
                    <button class="btn btn-primary" onclick="admin.showAddDiscountForm()">
                        <i class="fas fa-plus"></i> Добавить скидку
                    </button>
                </div>
            `;
            return;
        }

        let html = `
            <div class="discounts-header">
                <h2>Управление скидками</h2>
                <button class="btn btn-primary" onclick="admin.showAddDiscountForm()">
                    <i class="fas fa-plus"></i> Новая скидка
                </button>
            </div>
            <div class="discounts-grid">
        `;

        this.discounts.forEach(discount => {
            const typeText = {
                'percentage': 'Процентная',
                'fixed': 'Фиксированная',
                'free_delivery': 'Бесплатная доставка',
                'bogo': 'Купи 1 получи 2'
            }[discount.discount_type] || discount.discount_type;

            const valueText = discount.discount_type === 'percentage'
                ? `${discount.value}%`
                : discount.discount_type === 'fixed'
                    ? `${this.formatPrice(discount.value)} ₽`
                    : discount.discount_type === 'free_delivery'
                        ? 'Бесплатная доставка'
                        : 'Купи 1 получи 2';

            const applyToText = discount.apply_to === 'all' ? 'Все товары' :
                              discount.apply_to === 'category' ? 'Категория' :
                              discount.apply_to === 'product' ? 'Конкретный товар' : 'Не указано';

            const targetText = discount.apply_to === 'category'
                ? discount.target_category
                : discount.apply_to === 'product'
                    ? `Товар #${discount.target_product_id}`
                    : '';

            const statusClass = discount.is_active ? 'active' : 'inactive';
            const statusText = discount.is_active ? 'Активна' : 'Не активна';

            html += `
                <div class="discount-card ${statusClass}">
                    <div class="discount-header">
                        <h3>${discount.name}</h3>
                        <span class="discount-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="discount-details">
                        <div class="discount-type">Тип: <strong>${typeText}</strong></div>
                        <div class="discount-value">Размер: <strong>${valueText}</strong></div>
                        <div class="discount-apply">Применяется к: ${applyToText}</div>
                        ${targetText ? `<div class="discount-target">${targetText}</div>` : ''}
                        ${discount.min_order_amount > 0 ? `
                            <div class="discount-min">Мин. заказ: ${this.formatPrice(discount.min_order_amount)} ₽</div>
                        ` : ''}
                        <div class="discount-stats">
                            <span>Использовано: ${discount.used_count || 0} раз</span>
                        </div>
                    </div>
                    <div class="discount-actions">
                        <button class="btn-small btn-edit" onclick="admin.showEditDiscountForm(${discount.id})">
                            <i class="fas fa-edit"></i> Редактировать
                        </button>
                        <button class="btn-small btn-delete" onclick="admin.deleteDiscount(${discount.id})">
                            <i class="fas fa-trash"></i> Удалить
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    async showAddDiscountForm() {
        const container = document.getElementById('discountsContainer');
        if (!container) return;

        await this.loadAllProducts();

        let productsOptions = '';
        this.allProducts.forEach(product => {
            productsOptions += `<option value="${product.id}">${product.name} (${this.formatPrice(product.price)} ₽)</option>`;
        });

        let categoriesOptions = '';
        this.categories.forEach(category => {
            const categoryName = typeof category === 'string' ? category : (category.name || category);
            categoriesOptions += `<option value="${categoryName}">${categoryName}</option>`;
        });

        container.innerHTML = `
            <div class="discount-form-container">
                <div class="form-header">
                    <h2><i class="fas fa-percentage"></i> Создание новой скидки</h2>
                    <button class="btn btn-outline" onclick="admin.loadDiscounts()">
                        <i class="fas fa-arrow-left"></i> Назад к списку
                    </button>
                </div>

                <form id="discountForm" onsubmit="return admin.handleDiscountSubmit(event)">
                    <div class="form-section">
                        <h3>Основная информация</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="discountName">Название скидки *</label>
                                <input type="text" id="discountName" required>
                            </div>
                            <div class="form-group">
                                <label for="discountType">Тип скидки *</label>
                                <select id="discountType" required onchange="admin.onDiscountTypeChange()">
                                    <option value="">Выберите тип</option>
                                    <option value="percentage">Процентная скидка</option>
                                    <option value="fixed">Фиксированная сумма</option>
                                    <option value="free_delivery">Бесплатная доставка</option>
                                    <option value="bogo">Купи 1 получи 2</option>
                                </select>
                            </div>
                            <div class="form-group" id="discountValueGroup">
                                <label for="discountValue">Размер скидки *</label>
                                <div class="input-with-unit">
                                    <input type="number" id="discountValue" step="0.01" required>
                                    <span id="discountUnit">%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h3>Применение скидки</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="applyTo">Применять к *</label>
                                <select id="applyTo" required onchange="admin.onApplyToChange()">
                                    <option value="">Выберите область применения</option>
                                    <option value="all">Ко всем товарам</option>
                                    <option value="category">К определенной категории</option>
                                    <option value="product">К конкретному товару</option>
                                </select>
                            </div>
                            <div class="form-group" id="targetCategoryGroup" style="display: none;">
                                <label for="targetCategory">Категория</label>
                                <select id="targetCategory">
                                    ${categoriesOptions}
                                </select>
                            </div>
                            <div class="form-group" id="targetProductGroup" style="display: none;">
                                <label for="targetProductId">Товар</label>
                                <select id="targetProductId">
                                    ${productsOptions}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="admin.loadDiscounts()">
                            Отмена
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Сохранить скидку
                        </button>
                    </div>
                </form>
            </div>
        `;
    }

    async handleDiscountSubmit(e) {
        e.preventDefault();

        const formData = {
            name: document.getElementById('discountName').value,
            discount_type: document.getElementById('discountType').value,
            value: parseFloat(document.getElementById('discountValue').value) || 0,
            apply_to: document.getElementById('applyTo').value,
            target_category: document.getElementById('targetCategory').value || null,
            target_product_id: document.getElementById('targetProductId').value || null,
            is_active: true
        };

        try {
            const response = await fetch('/api/admin/discounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Скидка успешно создана', 'success');
                await this.loadDiscounts();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка создания скидки:', error);
            this.showAlert('❌ Ошибка соединения с сервером', 'error');
        }
    }

    async deleteDiscount(id) {
        if (!confirm('Вы уверены, что хотите удалить эту скидку?')) return;

        try {
            const response = await fetch(`/api/admin/discounts/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Скидка удалена', 'success');
                await this.loadDiscounts();
            } else {
                this.showAlert('❌ Ошибка удаления скидки: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка удаления скидки:', error);
            this.showAlert('❌ Ошибка удаления скидки', 'error');
        }
    }

    // ========== ПРОМОКОДЫ ==========

    async initializePromoCodesPage() {
        await Promise.all([
            this.loadPromoCodes(),
            this.loadDiscounts()
        ]);

        if (this.currentPage === 'promo-codes') {
            this.renderPromoCodes();
        }
    }

    async loadPromoCodes() {
        try {
            const response = await fetch('/api/promo-codes');
            const data = await response.json();
            this.promo_codes = Array.isArray(data) ? data : [];
            this.renderPromoCodes();
        } catch (error) {
            console.error('❌ Ошибка загрузки промокодов:', error);
            this.showAlert('❌ Ошибка загрузки промокодов', 'error');
            this.promo_codes = [];
            this.renderPromoCodes();
        }
    }

    renderPromoCodes() {
        const container = document.getElementById('promoCodesContainer');
        if (!container) return;

        if (this.promo_codes.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-ticket-alt"></i>
                    <h3>Промокоды не найдены</h3>
                    <button class="btn btn-primary" onclick="admin.showAddPromoCodeForm()">
                        <i class="fas fa-plus"></i> Добавить промокод
                    </button>
                </div>
            `;
            return;
        }

        let html = `
            <div class="promo-codes-header">
                <h2>Управление промокодами</h2>
                <button class="btn btn-primary" onclick="admin.showAddPromoCodeForm()">
                    <i class="fas fa-plus"></i> Новый промокод
                </button>
            </div>
            <div class="promo-codes-table-container">
                <table class="promo-codes-table">
                    <thead>
                        <tr>
                            <th>Код</th>
                            <th>Тип</th>
                            <th>Скидка</th>
                            <th>Использовано</th>
                            <th>Статус</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        this.promo_codes.forEach(promo => {
            const isExpired = promo.end_date && new Date(promo.end_date) < new Date();
            const statusClass = isExpired ? 'expired' : (promo.is_active ? 'active' : 'inactive');
            const statusText = isExpired ? 'Истек' : (promo.is_active ? 'Активен' : 'Неактивен');

            const valueText = promo.discount_type === 'percentage'
                ? `${promo.value}%`
                : promo.discount_type === 'fixed'
                    ? `${this.formatPrice(promo.value)} ₽`
                    : promo.discount_type === 'free_delivery'
                        ? 'Бесплатная доставка'
                        : 'Купи 1 получи 2';

            html += `
                <tr>
                    <td><strong>${promo.code}</strong></td>
                    <td>${promo.discount_type}</td>
                    <td>${valueText}</td>
                    <td>${promo.used_count || 0} раз</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon btn-delete" onclick="admin.deletePromoCode(${promo.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    }

    async showAddPromoCodeForm() {
        const container = document.getElementById('promoCodesContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="promo-code-form-container">
                <div class="form-header">
                    <h2><i class="fas fa-ticket-alt"></i> Создание нового промокода</h2>
                    <button class="btn btn-outline" onclick="admin.loadPromoCodes()">
                        <i class="fas fa-arrow-left"></i> Назад к списку
                    </button>
                </div>

                <form id="promoCodeForm" onsubmit="return admin.handlePromoCodeSubmit(event)">
                    <div class="form-section">
                        <h3>Основная информация</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="promoCode">Код промокода *</label>
                                <input type="text" id="promoCode" required placeholder="SUMMER2024">
                            </div>
                            <div class="form-group">
                                <label for="promoType">Тип скидки *</label>
                                <select id="promoType" required>
                                    <option value="">Выберите тип</option>
                                    <option value="percentage">Процентная скидка</option>
                                    <option value="fixed">Фиксированная сумма</option>
                                    <option value="free_delivery">Бесплатная доставка</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="promoValue">Размер скидки *</label>
                                <input type="number" id="promoValue" step="0.01" required>
                            </div>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="admin.loadPromoCodes()">
                            Отмена
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Сохранить промокод
                        </button>
                    </div>
                </form>
            </div>
        `;
    }


    async handlePromoCodeSubmit(e) {
        e.preventDefault();

        const formData = {
            code: document.getElementById('promoCode').value.toUpperCase(),
            discount_type: document.getElementById('promoType').value,
            value: parseFloat(document.getElementById('promoValue').value) || 0,
            is_active: true
        };

        try {
            const response = await fetch('/api/admin/promo-codes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Промокод успешно создан', 'success');
                setTimeout(() => {
                    this.loadPromoCodes();
                }, 1000);
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка создания промокода:', error);
            this.showAlert('❌ Ошибка соединения с сервером: ' + error.message, 'error');
        }
    }

    async deletePromoCode(id) {
        if (!confirm('Вы уверены, что хотите удалить этот промокод?')) return;

        try {
            const response = await fetch(`/api/admin/promo-codes/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Промокод удален', 'success');
                await this.loadPromoCodes();
            } else {
                this.showAlert('❌ Ошибка удаления промокода: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка удаления промокода:', error);
            this.showAlert('❌ Ошибка удаления промокода', 'error');
        }
    }

    // ========== ДЕРЕВО КАТЕГОРИЙ ==========

    async loadCategoriesTree() {
        try {
            const response = await fetch('/api/admin/categories/tree');
            this.categories_tree = await response.json();
            this.renderCategoriesTree();
        } catch (error) {
            console.error('❌ Ошибка загрузки дерева категорий:', error);
            this.categories_tree = [];
            this.renderCategoriesTree();
        }
    }

    renderCategoriesTree() {
        const container = document.getElementById('categoriesTreeContainer');
        if (!container) return;

        if (this.categories_tree.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-sitemap"></i>
                    <h3>Дерево категорий пусто</h3>
                    <button class="btn btn-primary" onclick="admin.showAddCategoryTreeForm()">
                        <i class="fas fa-plus"></i> Добавить категорию
                    </button>
                </div>
            `;
            return;
        }

        let html = `
            <div class="categories-tree-header">
                <h2>Дерево категорий</h2>
                <button class="btn btn-primary" onclick="admin.showAddCategoryTreeForm()">
                    <i class="fas fa-plus"></i> Новая категория
                </button>
            </div>
            <div class="categories-tree">
        `;

        const renderCategory = (category, level = 0) => {
            const indent = level * 30;
            const hasChildren = category.children && category.children.length > 0;

            return `
                <div class="category-tree-item" data-id="${category.id}" style="margin-left: ${indent}px;">
                    <div class="category-tree-content">
                        <div class="category-tree-info">
                            <i class="fas fa-folder${category.has_products ? '-open' : ''}"></i>
                            <span class="category-name">${category.name}</span>
                            ${category.product_count ? `
                                <span class="category-count">${category.product_count} товаров</span>
                            ` : ''}
                        </div>
                        <div class="category-tree-actions">
                            <button class="btn-icon btn-delete" onclick="admin.deleteCategoryTree(${category.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        };

        this.categories_tree.forEach(category => {
            html += renderCategory(category);
        });

        html += '</div>';
        container.innerHTML = html;
    }

    async showAddCategoryTreeForm() {
        const container = document.getElementById('categoriesTreeContainer');
        if (!container) return;

        let parentOptions = '<option value="">Нет (корневая категория)</option>';

        container.innerHTML = `
            <div class="category-form-container">
                <div class="form-header">
                    <h2><i class="fas fa-folder-plus"></i> Создание новой категории</h2>
                    <button class="btn btn-outline" onclick="admin.loadCategoriesTree()">
                        <i class="fas fa-arrow-left"></i> Назад к дереву
                    </button>
                </div>

                <form id="categoryTreeForm" onsubmit="return admin.handleCategoryTreeSubmit(event)">
                    <div class="form-section">
                        <h3>Основная информация</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="categoryNameTree">Название категории *</label>
                                <input type="text" id="categoryNameTree" required>
                            </div>
                            <div class="form-group">
                                <label for="parentCategoryId">Родительская категория</label>
                                <select id="parentCategoryId">
                                    ${parentOptions}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="admin.loadCategoriesTree()">
                            Отмена
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Сохранить категорию
                        </button>
                    </div>
                </form>
            </div>
        `;
    }

    async handleCategoryTreeSubmit(e) {
        e.preventDefault();

        const formData = {
            name: document.getElementById('categoryNameTree').value,
            parent_id: document.getElementById('parentCategoryId').value || null
        };

        try {
            const response = await fetch('/api/admin/categories/tree', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Категория успешно создана', 'success');
                await this.loadCategoriesTree();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка создания категории:', error);
            this.showAlert('❌ Ошибка соединения с сервером', 'error');
        }
    }

    async deleteCategoryTree(id) {
        if (!confirm('Вы уверены, что хотите удалить эту категорию?')) return;

        try {
            const response = await fetch(`/api/admin/categories/tree/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Категория удалена', 'success');
                await this.loadCategoriesTree();
            } else {
                this.showAlert('❌ Ошибка удаления категории: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка удаления категории:', error);
            this.showAlert('❌ Ошибка удаления категории', 'error');
        }
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

    onDiscountTypeChange() {
        const type = document.getElementById('discountType').value;
        const valueGroup = document.getElementById('discountValueGroup');
        const unit = document.getElementById('discountUnit');

        if (type === 'free_delivery' || type === 'bogo') {
            valueGroup.style.display = 'none';
        } else {
            valueGroup.style.display = 'block';
            unit.textContent = type === 'percentage' ? '%' : '₽';
        }
    }

    onApplyToChange() {
        const applyTo = document.getElementById('applyTo').value;
        const categoryGroup = document.getElementById('targetCategoryGroup');
        const productGroup = document.getElementById('targetProductGroup');

        categoryGroup.style.display = applyTo === 'category' ? 'block' : 'none';
        productGroup.style.display = applyTo === 'product' ? 'block' : 'none';
    }

    async loadAllProducts() {
        try {
            const response = await fetch('/api/products');
            this.allProducts = await response.json();
        } catch (error) {
            console.error('❌ Ошибка загрузки всех товаров:', error);
            this.allProducts = [];
        }
    }
}

// Запуск при загрузке страницы
let admin = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('📋 DOM загружен, запускаем админ панель...');

    try {
        admin = new AdminPanel();
        window.admin = admin;
        console.log('✅ Админ панель готова!');
    } catch (error) {
        console.error('❌ Ошибка инициализации админ панели:', error);
        alert('Ошибка загрузки админ панели. Обновите страницу.');
    }
});