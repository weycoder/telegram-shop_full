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
            const response = await fetch('/api/admin/orders');
            const orders = await response.json();
            this.orders = Array.isArray(orders) ? orders : [];
            this.renderOrders();
        } catch (error) {
            console.error('❌ Ошибка загрузки заказов:', error);
            this.showAlert('❌ Ошибка загрузки заказов', 'error');
        }
    }

    renderOrders() {
        const tbody = document.querySelector('#ordersTableBody');
        if (!tbody) return;

        if (this.orders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="no-data">
                        <i class="fas fa-inbox"></i>
                        <h3>Нет заказов</h3>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        this.orders.forEach(order => {
            const statusClass = {
                'pending': 'status-pending',
                'processing': 'status-processing',
                'delivering': 'status-delivering',
                'completed': 'status-completed',
                'cancelled': 'status-cancelled'
            }[order.status] || 'status-pending';

            const statusText = {
                'pending': 'Ожидает',
                'processing': 'В обработке',
                'delivering': 'Доставляется',
                'completed': 'Выполнен',
                'cancelled': 'Отменен'
            }[order.status] || order.status;

            const date = new Date(order.created_at || order.timestamp).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Форматирование списка товаров
            let productsHtml = 'Нет товаров';
            if (order.items && order.items.length > 0) {
                productsHtml = order.items.map(item =>
                    `${item.name || 'Товар'}: ${item.quantity || 1} × ${this.formatPrice(item.price || 0)} ₽`
                ).join('<br>');
            } else if (order.products && order.products.length > 0) {
                productsHtml = order.products.map(product =>
                    `${product.name}: ${product.quantity || 1} шт`
                ).join('<br>');
            }

            html += `
                <tr>
                    <td><strong>#${order.id || 'N/A'}</strong></td>
                    <td>${order.username || order.user_id || 'Гость'}</td>
                    <td><small>${productsHtml}</small></td>
                    <td><strong>${this.formatPrice(order.total_with_delivery || order.total_price || 0)} ₽</strong></td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${date}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon btn-edit" onclick="admin.editOrderStatus(${order.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
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