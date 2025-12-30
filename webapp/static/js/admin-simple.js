// Telegram Shop Админ Панель
console.log('🚀 Админ панель загружается...');

class AdminPanel {
    constructor() {
        this.currentPage = 'dashboard';
        this.products = [];
        this.orders = [];
        this.categories = [];
        this.selectedFile = null;
        this.uploadProgress = 0;
        this.imageSourceType = 'url'; // 'url' или 'file'
        this.isEditing = false;
        this.editingProductId = null;

        console.log('✅ Админ панель инициализирована');
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadInitialData();
        this.bindFileUploadEvents();
        this.addAlertStyles();
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

            // Клик по строке заказа
        document.addEventListener('click', (e) => {
            const orderRow = e.target.closest('.order-row');
            if (orderRow) {
                const orderId = orderRow.dataset.orderId;
                this.showOrderDetails(orderId);
            }
        });

        // Закрытие модального окна
        document.getElementById('orderDetailsModal')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay') || e.target.closest('.close-modal')) {
                this.closeOrderDetails();
            }
        });

        // Escape для закрытия
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeOrderDetails();
            }
        });


        document.querySelectorAll('.toggle-option input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.imageSourceType = e.target.value;
                this.updateImageSourceUI();
            });
        });

        // Кнопка обновить
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.refreshCurrentPage();
        });

        // Кнопка выхода
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.logout();
        });

        // Кнопка добавления товара (в шапке)
        document.getElementById('addProductBtn')?.addEventListener('click', () => {
            this.showAddProduct();
        });

        // Кнопка отмены в форме
        document.getElementById('cancelAdd')?.addEventListener('click', () => {
            this.showPage('products');
        });

        // Форма добавления товара
        const productForm = document.getElementById('addProductForm');
        if (productForm) {
            productForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleProductSubmit(e);
            });
        }

        // Кнопка добавления категории
        document.getElementById('addCategoryBtn')?.addEventListener('click', () => {
            this.addCategory();
        });

        // Enter для добавления категории
        document.getElementById('newCategory')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addCategory();
            }
        });

        console.log('✅ Все обработчики назначены');
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadStats(),
                this.loadProducts(),
                this.loadOrders(),
                this.loadCategories()
            ]);

            this.updateLastUpdated();
            this.showAlert('✅ Данные загружены', 'success');

        } catch (error) {
            console.error('❌ Ошибка загрузки данных:', error);
            this.showAlert('❌ Ошибка загрузки данных', 'error');
        }
    }

    async loadStats() {
        try {
            console.log('📊 Загрузка статистики...');
            const response = await fetch('/api/admin/dashboard');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Обновляем статистику
            const formatPrice = (price) => {
                return new Intl.NumberFormat('ru-RU').format(price || 0);
            };

            if (document.getElementById('totalRevenue')) {
                document.getElementById('totalRevenue').textContent = `${formatPrice(data.total_revenue)} ₽`;
            }
            if (document.getElementById('totalOrders')) {
                document.getElementById('totalOrders').textContent = formatPrice(data.total_orders);
            }
            if (document.getElementById('totalProducts')) {
                document.getElementById('totalProducts').textContent = formatPrice(data.total_products);
            }
            if (document.getElementById('pendingOrders')) {
                document.getElementById('pendingOrders').textContent = formatPrice(data.pending_orders);
            }

        } catch (error) {
            console.error('Ошибка загрузки статистики:', error);
        }
    }

    async loadProducts() {
        try {
            console.log('🛍️ Загрузка товаров...');
            const response = await fetch('/api/admin/products');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.products = await response.json();
            this.renderProducts();

        } catch (error) {
            console.error('Ошибка загрузки товаров:', error);
            this.products = [];
            this.renderProducts();
        }
    }



    async showOrderDetails(orderId) {
        try {
            console.log(`📋 Загрузка деталей заказа #${orderId}...`);

            const response = await fetch(`/api/admin/orders/${orderId}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const order = await response.json();
            this.renderOrderDetails(order);

        } catch (error) {
            console.error('Ошибка загрузки деталей заказа:', error);
            this.showAlert('❌ Ошибка загрузки деталей заказа', 'error');
        }
    }

        // Метод для изменения статуса заказа
    async changeOrderStatus(orderId, newStatus) {
        if (!confirm(`Изменить статус заказа #${orderId} на "${newStatus}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/orders/${orderId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: newStatus })
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert(`✅ Статус заказа обновлен на "${newStatus}"`, 'success');
                this.closeOrderDetails();

                // Перезагружаем заказы
                await this.loadOrders();
            } else {
                this.showAlert(`❌ Ошибка: ${result.error || 'Неизвестная ошибка'}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка изменения статуса:', error);
            this.showAlert('❌ Ошибка изменения статуса', 'error');
        }
    }


    // Метод для отмены заказа
    async cancelOrder(orderId) {
        if (!confirm(`Отменить заказ #${orderId}? Это действие нельзя отменить.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/orders/${orderId}/cancel`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Заказ отменен', 'success');
                this.closeOrderDetails();

                // Перезагружаем заказы
                await this.loadOrders();
            } else {
                this.showAlert(`❌ Ошибка: ${result.error || 'Неизвестная ошибка'}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка отмены заказа:', error);
            this.showAlert('❌ Ошибка отмены заказа', 'error');
        }
    }

    // Метод для закрытия модального окна
    closeOrderDetails() {
        const modal = document.getElementById('orderDetailsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }


        // Метод для рендеринга деталей заказа
    renderOrderDetails(order) {
        const modal = document.getElementById('orderDetailsModal');
        const content = document.getElementById('orderDetailsContent');

        if (!modal || !content) return;

        // Парсим данные
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || [];
        const deliveryAddress = typeof order.delivery_address === 'string'
            ? JSON.parse(order.delivery_address)
            : order.delivery_address || {};

        const paymentMethods = {
            'cash': 'Наличные',
            'transfer': 'Перевод курьеру',
            'terminal': 'Терминал'
        };

        const statusTexts = {
            'pending': 'Ожидает обработки',
            'processing': 'В обработке',
            'delivering': 'Доставляется',
            'completed': 'Завершен',
            'cancelled': 'Отменен'
        };

        const deliveryTypes = {
            'courier': 'Доставка курьером',
            'pickup': 'Самовывоз'
        };

        // Рассчитываем общую сумму
        const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Генерируем HTML для товаров
        let itemsHTML = '';
        items.forEach(item => {
            itemsHTML += `
                <div class="order-item">
                    <div class="item-name">${item.name}</div>
                    <div class="item-quantity">${item.quantity} × ${this.formatPrice(item.price)} ₽</div>
                    <div class="item-total">${this.formatPrice(item.price * item.quantity)} ₽</div>
                </div>
            `;
        });

        // Генерируем HTML для адреса
        let addressHTML = '';
        if (order.delivery_type === 'courier' && deliveryAddress) {
            addressHTML = `
                <div class="address-section">
                    <h4><i class="fas fa-map-marker-alt"></i> Адрес доставки</h4>
                    <div class="address-details">
                        ${deliveryAddress.city ? `<p><strong>Город:</strong> ${deliveryAddress.city}</p>` : ''}
                        ${deliveryAddress.street ? `<p><strong>Улица:</strong> ${deliveryAddress.street}, ${deliveryAddress.house || ''}</p>` : ''}
                        ${deliveryAddress.apartment ? `<p><strong>Квартира:</strong> ${deliveryAddress.apartment}</p>` : ''}
                        ${deliveryAddress.floor ? `<p><strong>Этаж:</strong> ${deliveryAddress.floor}</p>` : ''}
                        ${deliveryAddress.doorcode ? `<p><strong>Домофон:</strong> ${deliveryAddress.doorcode}</p>` : ''}
                        ${deliveryAddress.recipient_name ? `<p><strong>Получатель:</strong> ${deliveryAddress.recipient_name}</p>` : ''}
                        ${deliveryAddress.phone ? `<p><strong>Телефон:</strong> ${deliveryAddress.phone}</p>` : ''}
                    </div>
                </div>
            `;
        }

        content.innerHTML = `
            <div class="modal-header">
                <h2><i class="fas fa-clipboard-list"></i> Заказ #${order.id}</h2>
                <button class="close-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="modal-body">
                <!-- Основная информация -->
                <div class="order-info-grid">
                    <div class="info-card">
                        <h4><i class="fas fa-user"></i> Информация о клиенте</h4>
                        <p><strong>Имя:</strong> ${order.username || `Пользователь ${order.user_id}`}</p>
                        <p><strong>Telegram ID:</strong> ${order.user_id || 'Не указан'}</p>
                        ${order.phone_number ? `<p><strong>Телефон:</strong> ${order.phone_number}</p>` : ''}
                    </div>

                    <div class="info-card">
                        <h4><i class="fas fa-truck"></i> Доставка и оплата</h4>
                        <p><strong>Способ:</strong> ${deliveryTypes[order.delivery_type] || order.delivery_type}</p>
                        <p><strong>Оплата:</strong> ${paymentMethods[order.payment_method] || order.payment_method}</p>
                    </div>

                    <div class="info-card">
                        <h4><i class="fas fa-history"></i> Статус и даты</h4>
                        <p><strong>Статус:</strong>
                            <span class="status-badge status-${order.status}">
                                ${statusTexts[order.status] || order.status}
                            </span>
                        </p>
                        <p><strong>Создан:</strong> ${new Date(order.created_at).toLocaleString('ru-RU')}</p>
                        ${order.updated_at ? `<p><strong>Обновлен:</strong> ${new Date(order.updated_at).toLocaleString('ru-RU')}</p>` : ''}
                    </div>
                </div>

                <!-- Адрес доставки -->
                ${addressHTML}

                <!-- Список товаров -->
                <div class="items-section">
                    <h4><i class="fas fa-shopping-cart"></i> Состав заказа</h4>
                    <div class="items-list">
                        ${itemsHTML}
                    </div>
                    <div class="items-total">
                        <div class="total-row">
                            <span>Товары:</span>
                            <span>${this.formatPrice(totalAmount)} ₽</span>
                        </div>
                        ${order.delivery_type === 'courier' && totalAmount < 1000 ? `
                            <div class="total-row">
                                <span>Доставка:</span>
                                <span>100 ₽</span>
                            </div>
                        ` : ''}
                        <div class="total-row grand-total">
                            <span><strong>Итого к оплате:</strong></span>
                            <span><strong>${this.formatPrice(order.total_price || totalAmount + (totalAmount < 1000 && order.delivery_type === 'courier' ? 100 : 0))} ₽</strong></span>
                        </div>
                    </div>
                </div>

                <!-- Действия с заказом -->
                <div class="order-actions">
                    <h4><i class="fas fa-cogs"></i> Управление заказом</h4>
                    <div class="action-buttons">
                        <button class="btn-action btn-status ${order.status === 'pending' ? 'active' : ''}"
                                onclick="admin.changeOrderStatus(${order.id}, 'processing')">
                            <i class="fas fa-play"></i> В обработку
                        </button>
                        <button class="btn-action btn-status ${order.status === 'processing' ? 'active' : ''}"
                                onclick="admin.changeOrderStatus(${order.id}, 'delivering')">
                            <i class="fas fa-truck"></i> В доставку
                        </button>
                        <button class="btn-action btn-status ${order.status === 'delivering' ? 'active' : ''}"
                                onclick="admin.changeOrderStatus(${order.id}, 'completed')">
                            <i class="fas fa-check"></i> Завершить
                        </button>
                        <button class="btn-action btn-danger"
                                onclick="admin.cancelOrder(${order.id})">
                            <i class="fas fa-times"></i> Отменить
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    }

    renderProducts() {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        if (!this.products || this.products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px;">
                        <i class="fas fa-box-open" style="font-size: 48px; color: #ddd;"></i>
                        <p style="margin-top: 15px; color: #6c757d;">Товары не найдены</p>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';

        this.products.forEach(product => {
            // Определяем класс для остатка
            let stockClass = 'stock-high';
            let stockText = 'Много';

            if (product.stock <= 5) {
                stockClass = 'stock-low';
                stockText = 'Мало';
            } else if (product.stock <= 20) {
                stockClass = 'stock-medium';
                stockText = 'Средне';
            }

            // Обрезаем описание если оно слишком длинное
            const description = product.description || '';
            const shortDescription = description.length > 60
                ? description.substring(0, 60) + '...'
                : description;

            html += `
                <tr>
                    <td style="font-weight: 600; color: #2c3e50;">#${product.id}</td>
                    <td>
                        <img src="${product.image_url || 'https://via.placeholder.com/60'}"
                             alt="${product.name}"
                             style="width: 60px; height: 60px; object-fit: cover; border-radius: 10px; border: 2px solid #e9ecef;"
                             onerror="this.src='https://via.placeholder.com/60'">
                    </td>
                    <td>
                        <div style="font-weight: 600; color: #2c3e50; margin-bottom: 5px;">${product.name}</div>
                        <div style="color: #6c757d; font-size: 14px;">${shortDescription}</div>
                    </td>
                    <td style="font-weight: 700; color: #667eea;">${this.formatPrice(product.price)} ₽</td>
                    <td>
                        <span class="stock-indicator ${stockClass}">
                            <i class="fas ${product.stock > 0 ? 'fa-box' : 'fa-box-open'}"></i>
                            ${product.stock} шт.
                        </span>
                    </td>
                    <td>
                        <span style="background: #e3f2fd; color: #1976d2; padding: 6px 12px; border-radius: 20px; font-size: 14px; font-weight: 500;">
                            ${product.category || 'Без категории'}
                        </span>
                    </td>
                    <td>
                        <div style="display: flex; gap: 10px;">
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
            console.log('📋 Загрузка заказов...');
            const response = await fetch('/api/admin/orders');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.orders = await response.json();
            this.renderOrders();

        } catch (error) {
            console.error('Ошибка загрузки заказов:', error);
            this.orders = [];
            this.renderOrders();
        }
    }

    renderOrders() {
        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) return;

        if (!this.orders || this.orders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px;">
                        <i class="fas fa-clipboard-list" style="font-size: 48px; color: #ddd;"></i>
                        <p style="margin-top: 15px; color: #6c757d;">Заказы не найдены</p>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';

        this.orders.forEach(order => {
            // Парсим товары
            let items = [];
            try {
                items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            } catch (e) {
                items = [];
            }

            const itemCount = Array.isArray(items) ? items.length : 0;
            const status = order.status || 'pending';

            // Цвета статусов
            const statusColors = {
                'pending': { bg: '#fff3cd', color: '#856404', text: 'Ожидает' },
                'processing': { bg: '#cce5ff', color: '#004085', text: 'В обработке' },
                'completed': { bg: '#d4edda', color: '#155724', text: 'Завершен' },
                'cancelled': { bg: '#f8d7da', color: '#721c24', text: 'Отменен' }
            };

            const statusInfo = statusColors[status] || statusColors.pending;

            html += `
                <tr class="order-row" data-order-id="${order.id}" style="cursor: pointer;">
                    <td style="font-weight: 600; color: #2c3e50;">#${order.id}</td>
                    <td>
                        <div style="font-weight: 600; color: #2c3e50;">${order.username || `Пользователь ${order.user_id}`}</div>
                        <div style="color: #6c757d; font-size: 14px;">${itemCount} товаров</div>
                    </td>
                    <td style="font-weight: 700; color: #667eea;">${this.formatPrice(order.total_price)} ₽</td>
                    <td>
                        <span style="background: ${statusInfo.bg}; color: ${statusInfo.color}; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 500;">
                            ${statusInfo.text}
                        </span>
                    </td>
                    <td>
                        ${new Date(order.created_at).toLocaleDateString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    bindFileUploadEvents() {
        const fileInput = document.getElementById('productImageFile');
        const uploadArea = document.getElementById('fileUploadArea');
        const urlInput = document.getElementById('productImageUrl');

        if (!fileInput || !uploadArea || !urlInput) return;

        // Клик по области загрузки
        uploadArea.addEventListener('click', (e) => {
            if (!e.target.closest('.file-info')) {
                fileInput.click();
            }
        });

        // Выбор файла
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleFileSelect(file);
            }
        });

        // Drag & Drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#5a67d8';
            uploadArea.style.background = 'rgba(102, 126, 234, 0.1)';
        });

        uploadArea.addEventListener('dragleave', (e) => {
            uploadArea.style.borderColor = '#667eea';
            uploadArea.style.background = 'rgba(102, 126, 234, 0.05)';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#667eea';
            uploadArea.style.background = 'rgba(102, 126, 234, 0.05)';

            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleFileSelect(file);
            } else {
                this.showAlert('❌ Пожалуйста, выберите файл изображения', 'error');
            }
        });

        // Предпросмотр URL
        urlInput.addEventListener('input', (e) => {
            this.updateImagePreview(e.target.value);
        });
    }

        // Обработка выбора файла
    handleFileSelect(file) {
        if (!file.type.startsWith('image/')) {
            this.showAlert('❌ Пожалуйста, выберите файл изображения', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) { // 10MB лимит
            this.showAlert('❌ Файл слишком большой (макс. 10MB)', 'error');
            return;
        }

        this.selectedFile = file;

        // Показываем информацию о файле
        const fileInfo = document.getElementById('fileInfo');
        const fileName = document.getElementById('fileName');
        const filePreview = document.getElementById('filePreview');

        fileName.textContent = file.name;

        // Создаем превью
        const reader = new FileReader();
        reader.onload = (e) => {
            filePreview.src = e.target.result;
            this.updateImagePreview(e.target.result);
        };
        reader.readAsDataURL(file);

        fileInfo.style.display = 'flex';

        // Автоматически переключаемся на режим файла
        this.imageSourceType = 'file';
        this.updateImageSourceUI();

        this.showAlert(`✅ Файл "${file.name}" выбран`, 'success');
    }

        // Удаление файла
    removeFile() {
        this.selectedFile = null;

        const fileInfo = document.getElementById('fileInfo');
        const fileInput = document.getElementById('productImageFile');

        fileInfo.style.display = 'none';
        fileInput.value = '';

        this.updateImagePreview('');
        this.showAlert('🗑️ Файл удален', 'info');
    }

        // Обновление UI источника изображения
    updateImageSourceUI() {
        const fileSection = document.getElementById('fileUploadArea');
        const urlInput = document.getElementById('productImageUrl');

        if (this.imageSourceType === 'file') {
            fileSection.parentElement.style.display = 'block';
            urlInput.parentElement.style.display = 'none';
        } else {
            fileSection.parentElement.style.display = 'none';
            urlInput.parentElement.style.display = 'block';
        }
    }


    // Обновление предпросмотра
    updateImagePreview(src) {
        const previewContainer = document.getElementById('imagePreviewContainer');
        const preview = document.getElementById('imagePreview');

        if (src) {
            preview.src = src;
            previewContainer.style.display = 'block';
        } else {
            previewContainer.style.display = 'none';
        }
    }


    async loadCategories() {
        try {
            console.log('📂 Загрузка категорий...');
            const response = await fetch('/api/admin/categories/manage');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.categories = await response.json();
            this.renderCategories();
            this.updateCategorySelect();

        } catch (error) {
            console.error('Ошибка загрузки категорий:', error);
            this.categories = [];
            this.renderCategories();
        }
    }


    renderCategories() {
        const list = document.getElementById('categoriesList');
        if (!list) return;

        if (!this.categories || this.categories.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #6c757d;">
                    <i class="fas fa-tags" style="font-size: 32px; opacity: 0.3; margin-bottom: 10px;"></i>
                    <p>Категорий пока нет</p>
                </div>
            `;
            return;
        }

        let html = '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';

        this.categories.forEach(category => {
            html += `
                <div class="category-tag">
                    <i class="fas fa-tag"></i>
                    <span>${category}</span>
                    <button onclick="admin.deleteCategory('${category}')" title="Удалить категорию">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });

        html += '</div>';
        list.innerHTML = html;
    }

    updateCategorySelect() {
        const select = document.getElementById('productCategory');
        if (!select) return;

        // Сохраняем текущее значение
        const currentValue = select.value;

        // Очищаем и добавляем опции
        select.innerHTML = '<option value="">Выберите категорию</option>';

        this.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });

        // Восстанавливаем выбранное значение
        if (currentValue) {
            select.value = currentValue;
        }
    }

    async addCategory() {
        const input = document.getElementById('newCategory');
        const categoryName = input.value.trim();

        if (!categoryName) {
            this.showAlert('❌ Введите название категории', 'error');
            return;
        }

        if (categoryName.length < 2) {
            this.showAlert('❌ Название должно быть не менее 2 символов', 'error');
            return;
        }

        // Проверяем, нет ли уже такой категории
        if (this.categories.includes(categoryName)) {
            this.showAlert('❌ Такая категория уже существует', 'error');
            return;
        }

        try {
            console.log(`➕ Добавление категории: ${categoryName}`);

            const response = await fetch('/api/admin/categories/manage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: categoryName })
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert(`✅ Категория "${categoryName}" успешно создана!`, 'success');
                input.value = '';

                // Перезагружаем категории
                await this.loadCategories();

            } else {
                this.showAlert(`❌ Ошибка: ${result.error || 'Неизвестная ошибка'}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка добавления категории:', error);
            this.showAlert('❌ Ошибка соединения с сервером', 'error');
        }
    }

    async deleteCategory(categoryName) {
        if (!confirm(`Удалить категорию "${categoryName}"?\n\nТовары этой категории будут перемещены в "без категории".`)) {
            return;
        }

        try {
            console.log(`🗑️ Удаление категории: ${categoryName}`);

            const response = await fetch(`/api/admin/categories/manage?name=${encodeURIComponent(categoryName)}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert(`✅ Категория "${categoryName}" удалена`, 'success');

                // Перезагружаем категории и товары
                await Promise.all([
                    this.loadCategories(),
                    this.loadProducts()
                ]);

            } else {
                this.showAlert(`❌ Ошибка: ${result.error || 'Неизвестная ошибка'}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка удаления категории:', error);
            this.showAlert('❌ Ошибка соединения с сервером', 'error');
        }
    }

    async handleProductSubmit(e) {
        e.preventDefault();

        const name = document.getElementById('productName').value.trim();
        const price = parseFloat(document.getElementById('productPrice').value);
        const stock = parseInt(document.getElementById('productStock').value);
        const category = document.getElementById('productCategory').value;
        const description = document.getElementById('productDescription').value.trim();
        const imageUrl = document.getElementById('productImageUrl').value.trim();

        // Валидация
        if (!name || isNaN(price) || price <= 0 || isNaN(stock) || stock < 0) {
            this.showAlert('❌ Заполните обязательные поля правильно', 'error');
            return;
        }

        let finalImageUrl = imageUrl || 'https://via.placeholder.com/300x200';

        // Если выбран файл, загружаем его
        if (this.imageSourceType === 'file' && this.selectedFile) {
            try {
                this.showAlert('📤 Загрузка изображения...', 'info');
                finalImageUrl = await this.uploadFile(this.selectedFile);
            } catch (error) {
                console.error('Ошибка загрузки файла:', error);
                this.showAlert('❌ Ошибка загрузки изображения. Используйте URL или попробуйте позже.', 'error');
                return;
            }
        }

        const productData = {
            name: name,
            description: description,
            price: price,
            stock: stock,
            category: category,
            image_url: finalImageUrl
        };

        console.log('📤 Отправляем товар:', productData);

        try {
            let response;

            if (this.isEditing && this.editingProductId) {
                // Редактирование существующего товара
                response = await fetch(`/api/admin/products?id=${this.editingProductId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(productData)
                });
            } else {
                // Добавление нового товара
                response = await fetch('/api/admin/products', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(productData)
                });
            }

            const result = await response.json();

            if (result.success) {
                const message = this.isEditing
                    ? '✅ Товар успешно обновлен!'
                    : '✅ Товар успешно добавлен!';

                this.showAlert(message, 'success');

                // Сбрасываем форму
                this.resetProductForm();

                // Переходим к товарам
                this.showPage('products');

                // Перезагружаем товары
                await this.loadProducts();

            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }

        } catch (error) {
            console.error('Ошибка:', error);
            this.showAlert('❌ Ошибка соединения с сервером', 'error');
        }
    }


        // Показать прогресс загрузки
    showUploadProgress(percent) {
        let progressContainer = document.getElementById('uploadProgressContainer');

        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.id = 'uploadProgressContainer';
            progressContainer.className = 'upload-progress';
            progressContainer.innerHTML = `
                <div>Загрузка: <span id="uploadPercent">0</span>%</div>
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
            `;

            const form = document.getElementById('addProductForm');
            form.insertBefore(progressContainer, form.querySelector('.form-actions'));
        }

        document.getElementById('uploadPercent').textContent = Math.round(percent);
        document.getElementById('progressFill').style.width = percent + '%';
    }

    // Скрыть прогресс загрузки
    hideUploadProgress() {
        const progressContainer = document.getElementById('uploadProgressContainer');
        if (progressContainer) {
            progressContainer.remove();
        }
    }

        // Метод для загрузки файла на сервер
    async uploadFile(file) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);

            // Создаем прогресс-бар
            this.showUploadProgress(0);

            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    this.showUploadProgress(percentComplete);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (response.success) {
                            this.showUploadProgress(100);
                            setTimeout(() => {
                                this.hideUploadProgress();
                            }, 1000);
                            resolve(response.file_url);
                        } else {
                            reject(new Error(response.error || 'Ошибка сервера'));
                        }
                    } catch (e) {
                        reject(new Error('Ошибка парсинга ответа'));
                    }
                } else {
                    reject(new Error(`HTTP ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Ошибка сети'));
            });

            xhr.open('POST', '/api/admin/upload');
            xhr.send(formData);
        });
    }

       // Обновленный метод editProduct
    editProduct(id) {
        const product = this.products.find(p => p.id === id);
        if (!product) {
            this.showAlert('❌ Товар не найден', 'error');
            return;
        }

        console.log(`✏️ Редактирование товара #${id}`);

        // Заполняем форму
        document.getElementById('productName').value = product.name;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productStock').value = product.stock;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productImageUrl').value = product.image_url || '';

        // Устанавливаем категорию
        const categorySelect = document.getElementById('productCategory');
        if (categorySelect && product.category) {
            categorySelect.value = product.category;
        }

        // Сбрасываем файл
        this.selectedFile = null;
        document.getElementById('fileInfo').style.display = 'none';

        // Показываем предпросмотр из URL
        this.updateImagePreview(product.image_url);

        // Определяем тип источника (файл или URL)
        if (product.image_url && product.image_url.startsWith('http')) {
            this.imageSourceType = 'url';
        } else {
            this.imageSourceType = 'file';
        }
        this.updateImageSourceUI();

        // Устанавливаем режим редактирования
        this.isEditing = true;
        this.editingProductId = id;

        // Меняем заголовок и кнопку
        document.querySelector('#add-product h2').textContent = 'Редактировать товар';
        const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Обновить товар';

        // Показываем страницу
        this.showPage('add-product');
    }

    async deleteProduct(id) {
        if (!confirm(`Удалить товар #${id}? Это действие нельзя отменить.`)) {
            return;
        }

        console.log(`🗑️ Удаление товара #${id}`);

        try {
            const response = await fetch(`/api/admin/products?id=${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Товар удален!', 'success');
                await this.loadProducts();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('Ошибка удаления:', error);
            this.showAlert('❌ Ошибка удаления товара', 'error');
        }
    }

    showAddProduct() {
        // Сбрасываем форму
        this.resetProductForm();

        // Снимаем режим редактирования
        this.isEditing = false;
        this.editingProductId = null;

        // Восстанавливаем заголовок и кнопку
        document.querySelector('#add-product h2').textContent = 'Добавить новый товар';
        const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Сохранить товар';

        // Показываем страницу
        this.showPage('add-product');
    }

    // Обновленный метод resetProductForm
    resetProductForm() {
        const form = document.getElementById('addProductForm');
        if (form) {
            form.reset();
            document.getElementById('productImageUrl').value = '';

            // Сбрасываем файл
            this.selectedFile = null;
            document.getElementById('fileInfo').style.display = 'none';
            document.getElementById('productImageFile').value = '';

            // Скрываем предпросмотр
            document.getElementById('imagePreviewContainer').style.display = 'none';

            // Сбрасываем тип источника
            this.imageSourceType = 'url';
            this.updateImageSourceUI();

            // Скрываем прогресс
            this.hideUploadProgress();
        }
    }


    showPage(pageId) {
        console.log(`📄 Показываем страницу: ${pageId}`);

        // Скрываем все страницы
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
            page.style.display = 'none';
        });

        // Показываем нужную страницу
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.style.display = 'block';
            setTimeout(() => {
                targetPage.classList.add('active');
            }, 10);
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
            'categories': 'Управление категориями'
        };

        const titleElement = document.getElementById('pageTitle');
        if (titleElement && titles[pageId]) {
            titleElement.textContent = titles[pageId];
        }

        this.currentPage = pageId;

        // Загружаем данные для страницы
        if (pageId === 'products') {
            this.loadProducts();
        } else if (pageId === 'categories') {
            this.loadCategories();
        }
    }

    refreshCurrentPage() {
        this.showAlert('🔄 Обновление данных...', 'info');

        if (this.currentPage === 'dashboard') {
            this.loadStats();
        } else if (this.currentPage === 'products') {
            this.loadProducts();
        } else if (this.currentPage === 'orders') {
            this.loadOrders();
        } else if (this.currentPage === 'categories') {
            this.loadCategories();
        }

        this.updateLastUpdated();
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

    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(price || 0);
    }

    showAlert(message, type = 'info') {
        console.log(`💬 [${type.toUpperCase()}] ${message}`);

        // Удаляем предыдущие уведомления
        document.querySelectorAll('.admin-alert').forEach(alert => alert.remove());

        // Создаем уведомление
        const alert = document.createElement('div');
        alert.className = `admin-alert alert-${type}`;
        alert.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' :
                             type === 'error' ? 'exclamation-circle' :
                             'info-circle'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(alert);

        // Автоматическое скрытие через 4 секунды
        setTimeout(() => {
            alert.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.parentNode.removeChild(alert);
                }
            }, 300);
        }, 4000);
    }

    addAlertStyles() {
        if (!document.getElementById('admin-alert-styles')) {
            const style = document.createElement('style');
            style.id = 'admin-alert-styles';
            style.textContent = `
                .admin-alert {
                    position: fixed;
                    top: 30px;
                    right: 30px;
                    padding: 20px 30px;
                    border-radius: 15px;
                    z-index: 10000;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
                    animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    max-width: 400px;
                }

                .alert-success {
                    background: linear-gradient(135deg, #51cf66 0%, #27ae60 100%);
                    color: white;
                }

                .alert-error {
                    background: linear-gradient(135deg, #ff4757 0%, #c0392b 100%);
                    color: white;
                }

                .alert-info {
                    background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%);
                    color: white;
                }

                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                @keyframes slideOutRight {
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
}

// Запуск при загрузке страницы
let admin = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('📋 DOM загружен, запускаем админ панель...');

    try {
        admin = new AdminPanel();
        window.admin = admin; // Делаем доступным глобально

        console.log('✅ Админ панель готова!');

    } catch (error) {
        console.error('❌ Ошибка инициализации админ панели:', error);

        // Показываем сообщение об ошибке
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            padding: 20px;
            text-align: center;
        `;
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 60px; color: #ff4757; margin-bottom: 20px;"></i>
            <h2 style="color: #2c3e50; margin-bottom: 10px;">Ошибка загрузки админ панели</h2>
            <p style="color: #6c757d; margin-bottom: 20px;">Пожалуйста, обновите страницу</p>
            <button onclick="location.reload()" style="
                background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%);
                color: white;
                border: none;
                padding: 14px 28px;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
            ">
                <i class="fas fa-redo"></i> Обновить страницу
            </button>
        `;
        document.body.appendChild(errorDiv);
    }
});