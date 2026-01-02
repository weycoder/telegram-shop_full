
// Telegram Shop Админ Панель - Полная версия с скидками
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
        this.allProducts = []; // Для выбора товаров в скидках

        console.log('✅ Админ панель инициализирована');
        this.init();
    }

    init() {
        this.bindEvents();
        this.showPage('dashboard');
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

        // Кнопка обновить
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.refreshCurrentPage();
        });

        // Кнопка выхода
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.logout();
        });

        // Кнопка добавления товара (в шапке)
        document.getElementById('addProductBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showAddProduct();
        });

        // Кнопка отмены в форме
        document.getElementById('cancelAdd')?.addEventListener('click', (e) => {
            e.preventDefault();
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
        document.getElementById('addCategoryBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.addCategory();
        });

        // Enter для добавления категории
        document.getElementById('newCategory')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addCategory();
            }
        });

        // Загрузка файлов
        this.bindFileUploadEvents();

        console.log('✅ Все обработчики назначены');
    }

    // ========== ОСНОВНЫЕ МЕТОДЫ ==========

    showAlert(message, type = 'info') {
        document.querySelectorAll('.alert').forEach(alert => alert.remove());

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
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

    // ========== ЗАГРУЗКА ДАННЫХ ==========

    async loadProducts() {
        try {
            const response = await fetch('/api/admin/products');
            const products = await response.json();
            this.products = products;
            this.renderProducts();
        } catch (error) {
            console.error('❌ Ошибка загрузки товаров:', error);
            this.products = [];
            this.renderProducts();
        }
    }

    async loadOrders() {
        try {
            const response = await fetch('/api/admin/orders');
            const orders = await response.json();
            this.orders = orders;
            this.renderOrders();
        } catch (error) {
            console.error('❌ Ошибка загрузки заказов:', error);
            this.orders = [];
            this.renderOrders();
        }
    }

    async loadCategories() {
        try {
            const response = await fetch('/api/admin/categories/manage');
            const categories = await response.json();
            this.categories = categories;
            this.renderCategories();
            this.updateCategorySelect();
        } catch (error) {
            console.error('❌ Ошибка загрузки категорий:', error);
            this.categories = [];
            this.renderCategories();
        }
    }

    async loadDashboardData() {
        try {
            const response = await fetch('/api/admin/dashboard');
            const stats = await response.json();

            const totalRevenueEl = document.getElementById('totalRevenue');
            const totalOrdersEl = document.getElementById('totalOrders');
            const totalProductsEl = document.getElementById('totalProducts');
            const pendingOrdersEl = document.getElementById('pendingOrders');

            if (totalRevenueEl) totalRevenueEl.textContent = this.formatPrice(stats.total_revenue || 0) + ' ₽';
            if (totalOrdersEl) totalOrdersEl.textContent = stats.total_orders || 0;
            if (totalProductsEl) totalProductsEl.textContent = stats.total_products || 0;
            if (pendingOrdersEl) pendingOrdersEl.textContent = stats.pending_orders || 0;

            const now = new Date();
            const lastUpdatedEl = document.getElementById('lastUpdated');
            if (lastUpdatedEl) {
                lastUpdatedEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            }

        } catch (error) {
            console.error('❌ Ошибка загрузки статистики:', error);
        }
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

    // ========== СКИДКИ ==========

    async loadDiscounts() {
        console.log('🏷️ Загрузка скидок...');
        try {
            const response = await fetch('/api/admin/discounts');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
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
                    <i class="fas fa-percentage" style="font-size: 48px; color: #ddd;"></i>
                    <h3>Скидки не найдены</h3>
                    <p>Создайте первую скидку</p>
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
                        ${discount.start_date ? `
                            <div class="discount-date">Начало: ${new Date(discount.start_date).toLocaleDateString('ru-RU')}</div>
                        ` : ''}
                        ${discount.end_date ? `
                            <div class="discount-date">Окончание: ${new Date(discount.end_date).toLocaleDateString('ru-RU')}</div>
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
                        <button class="btn-small ${discount.is_active ? 'btn-secondary' : 'btn-success'}" 
                                onclick="admin.toggleDiscountStatus(${discount.id}, ${!discount.is_active})">
                            <i class="fas fa-power-off"></i> ${discount.is_active ? 'Деактивировать' : 'Активировать'}
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    showAddDiscountForm() {
        const container = document.getElementById('discountsContainer');
        if (!container) return;

        // Загружаем все товары для выбора
        this.loadAllProducts().then(() => {
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
                                    <input type="text" id="discountName" required placeholder="Черная пятница, Летняя распродажа">
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
                                        <input type="number" id="discountValue" step="0.01" placeholder="10" required>
                                        <span id="discountUnit">%</span>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="minOrderAmount">Минимальная сумма заказа</label>
                                    <input type="number" id="minOrderAmount" step="0.01" placeholder="0 (без ограничений)">
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

                        <div class="form-section">
                            <h3>Срок действия</h3>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="startDate">Дата начала</label>
                                    <input type="datetime-local" id="startDate">
                                </div>
                                <div class="form-group">
                                    <label for="endDate">Дата окончания</label>
                                    <input type="datetime-local" id="endDate">
                                </div>
                                <div class="form-group">
                                    <label for="isActive">Статус</label>
                                    <select id="isActive">
                                        <option value="1">Активна</option>
                                        <option value="0">Не активна</option>
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
        });
    }

    onDiscountTypeChange() {
        const type = document.getElementById('discountType').value;
        const valueGroup = document.getElementById('discountValueGroup');
        const unit = document.getElementById('discountUnit');
        const valueInput = document.getElementById('discountValue');

        if (type === 'free_delivery' || type === 'bogo') {
            valueGroup.style.display = 'none';
            valueInput.removeAttribute('required');
        } else {
            valueGroup.style.display = 'block';
            valueInput.setAttribute('required', 'required');
            
            if (type === 'percentage') {
                unit.textContent = '%';
                valueInput.placeholder = '10';
            } else if (type === 'fixed') {
                unit.textContent = '₽';
                valueInput.placeholder = '1000';
            }
        }
    }

    onApplyToChange() {
        const applyTo = document.getElementById('applyTo').value;
        const categoryGroup = document.getElementById('targetCategoryGroup');
        const productGroup = document.getElementById('targetProductGroup');

        categoryGroup.style.display = applyTo === 'category' ? 'block' : 'none';
        productGroup.style.display = applyTo === 'product' ? 'block' : 'none';
    }

    async handleDiscountSubmit(e) {
        e.preventDefault();

        const formData = {
            name: document.getElementById('discountName').value,
            discount_type: document.getElementById('discountType').value,
            value: parseFloat(document.getElementById('discountValue').value) || 0,
            min_order_amount: parseFloat(document.getElementById('minOrderAmount').value) || 0,
            apply_to: document.getElementById('applyTo').value,
            target_category: document.getElementById('targetCategory').value || null,
            target_product_id: document.getElementById('targetProductId').value || null,
            start_date: document.getElementById('startDate').value || null,
            end_date: document.getElementById('endDate').value || null,
            is_active: document.getElementById('isActive').value === '1'
        };

        // Валидация
        if (!formData.name) {
            this.showAlert('❌ Введите название скидки', 'error');
            return;
        }

        if (!formData.discount_type) {
            this.showAlert('❌ Выберите тип скидки', 'error');
            return;
        }

        if ((formData.discount_type === 'percentage' || formData.discount_type === 'fixed') && !formData.value) {
            this.showAlert('❌ Укажите размер скидки', 'error');
            return;
        }

        if (!formData.apply_to) {
            this.showAlert('❌ Выберите область применения', 'error');
            return;
        }

        if (formData.apply_to === 'category' && !formData.target_category) {
            this.showAlert('❌ Выберите категорию', 'error');
            return;
        }

        if (formData.apply_to === 'product' && !formData.target_product_id) {
            this.showAlert('❌ Выберите товар', 'error');
            return;
        }

        try {
            const response = await fetch('/api/admin/discounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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

    async showEditDiscountForm(discountId) {
        try {
            const response = await fetch(`/api/admin/discounts/${discountId}`);
            const discount = await response.json();

            if (!discount) {
                throw new Error('Скидка не найдена');
            }

            // Загружаем все товары для выбора
            await this.loadAllProducts();

            let productsOptions = '';
            this.allProducts.forEach(product => {
                const selected = product.id === discount.target_product_id ? 'selected' : '';
                productsOptions += `<option value="${product.id}" ${selected}>${product.name} (${this.formatPrice(product.price)} ₽)</option>`;
            });

            let categoriesOptions = '';
            this.categories.forEach(category => {
                const categoryName = typeof category === 'string' ? category : (category.name || category);
                const selected = categoryName === discount.target_category ? 'selected' : '';
                categoriesOptions += `<option value="${categoryName}" ${selected}>${categoryName}</option>`;
            });

            const container = document.getElementById('discountsContainer');
            container.innerHTML = `
                <div class="discount-form-container">
                    <div class="form-header">
                        <h2><i class="fas fa-edit"></i> Редактирование скидки</h2>
                        <button class="btn btn-outline" onclick="admin.loadDiscounts()">
                            <i class="fas fa-arrow-left"></i> Назад к списку
                        </button>
                    </div>
                    
                    <form id="discountForm" onsubmit="return admin.handleDiscountUpdate(event, ${discount.id})">
                        <div class="form-section">
                            <h3>Основная информация</h3>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="discountName">Название скидки *</label>
                                    <input type="text" id="discountName" value="${discount.name}" required>
                                </div>
                                <div class="form-group">
                                    <label for="discountType">Тип скидки *</label>
                                    <select id="discountType" required onchange="admin.onDiscountTypeChange()">
                                        <option value="">Выберите тип</option>
                                        <option value="percentage" ${discount.discount_type === 'percentage' ? 'selected' : ''}>Процентная скидка</option>
                                        <option value="fixed" ${discount.discount_type === 'fixed' ? 'selected' : ''}>Фиксированная сумма</option>
                                        <option value="free_delivery" ${discount.discount_type === 'free_delivery' ? 'selected' : ''}>Бесплатная доставка</option>
                                        <option value="bogo" ${discount.discount_type === 'bogo' ? 'selected' : ''}>Купи 1 получи 2</option>
                                    </select>
                                </div>
                                <div class="form-group" id="discountValueGroup">
                                    <label for="discountValue">Размер скидки *</label>
                                    <div class="input-with-unit">
                                        <input type="number" id="discountValue" value="${discount.value || 0}" step="0.01" required>
                                        <span id="discountUnit">${discount.discount_type === 'percentage' ? '%' : '₽'}</span>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="minOrderAmount">Минимальная сумма заказа</label>
                                    <input type="number" id="minOrderAmount" value="${discount.min_order_amount || 0}" step="0.01">
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
                                        <option value="all" ${discount.apply_to === 'all' ? 'selected' : ''}>Ко всем товарам</option>
                                        <option value="category" ${discount.apply_to === 'category' ? 'selected' : ''}>К определенной категории</option>
                                        <option value="product" ${discount.apply_to === 'product' ? 'selected' : ''}>К конкретному товару</option>
                                    </select>
                                </div>
                                <div class="form-group" id="targetCategoryGroup" style="${discount.apply_to === 'category' ? 'display: block;' : 'display: none;'}">
                                    <label for="targetCategory">Категория</label>
                                    <select id="targetCategory">
                                        ${categoriesOptions}
                                    </select>
                                </div>
                                <div class="form-group" id="targetProductGroup" style="${discount.apply_to === 'product' ? 'display: block;' : 'display: none;'}">
                                    <label for="targetProductId">Товар</label>
                                    <select id="targetProductId">
                                        ${productsOptions}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="form-section">
                            <h3>Срок действия</h3>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="startDate">Дата начала</label>
                                    <input type="datetime-local" id="startDate" value="${discount.start_date ? discount.start_date.replace(' ', 'T').substring(0, 16) : ''}">
                                </div>
                                <div class="form-group">
                                    <label for="endDate">Дата окончания</label>
                                    <input type="datetime-local" id="endDate" value="${discount.end_date ? discount.end_date.replace(' ', 'T').substring(0, 16) : ''}">
                                </div>
                                <div class="form-group">
                                    <label for="isActive">Статус</label>
                                    <select id="isActive">
                                        <option value="1" ${discount.is_active ? 'selected' : ''}>Активна</option>
                                        <option value="0" ${!discount.is_active ? 'selected' : ''}>Не активна</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="admin.loadDiscounts()">
                                Отмена
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-save"></i> Обновить скидку
                            </button>
                        </div>
                    </form>
                </div>
            `;

            // Обновляем видимость поля значения
            this.onDiscountTypeChange();

        } catch (error) {
            console.error('❌ Ошибка загрузки скидки:', error);
            this.showAlert('❌ Не удалось загрузить данные скидки', 'error');
        }
    }

    async handleDiscountUpdate(e, discountId) {
        e.preventDefault();

        const formData = {
            name: document.getElementById('discountName').value,
            discount_type: document.getElementById('discountType').value,
            value: parseFloat(document.getElementById('discountValue').value) || 0,
            min_order_amount: parseFloat(document.getElementById('minOrderAmount').value) || 0,
            apply_to: document.getElementById('applyTo').value,
            target_category: document.getElementById('targetCategory').value || null,
            target_product_id: document.getElementById('targetProductId').value || null,
            start_date: document.getElementById('startDate').value || null,
            end_date: document.getElementById('endDate').value || null,
            is_active: document.getElementById('isActive').value === '1'
        };

        try {
            const response = await fetch(`/api/admin/discounts/${discountId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Скидка успешно обновлена', 'success');
                await this.loadDiscounts();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка обновления скидки:', error);
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

    async toggleDiscountStatus(id, isActive) {
        try {
            const response = await fetch(`/api/admin/discounts/${id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ is_active: isActive })
            });

            const result = await response.json();

            if (result.success) {
                const message = isActive ? '✅ Скидка активирована' : '✅ Скидка деактивирована';
                this.showAlert(message, 'success');
                await this.loadDiscounts();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка изменения статуса скидки:', error);
            this.showAlert('❌ Ошибка изменения статуса', 'error');
        }
    }

    // ========== ПРОМОКОДЫ ==========

    async loadPromoCodes() {
        console.log('🎟️ Загрузка промокодов...');
        try {
            const response = await fetch('/api/admin/promo-codes');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            this.promo_codes = await response.json();
            this.renderPromoCodes();
        } catch (error) {
            console.error('❌ Ошибка загрузки промокодов:', error);
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
                    <i class="fas fa-ticket-alt" style="font-size: 48px; color: #ddd;"></i>
                    <h3>Промокоды не найдены</h3>
                    <p>Создайте первый промокод</p>
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
                            <th>Значение</th>
                            <th>Лимит</th>
                            <th>Использовано</th>
                            <th>Статус</th>
                            <th>Срок действия</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        this.promo_codes.forEach(promo => {
            const typeText = {
                'percentage': 'Процент',
                'fixed': 'Сумма',
                'free_delivery': 'Доставка',
                'bogo': '2 по цене 1'
            }[promo.discount_type] || promo.discount_type;

            const valueText = promo.discount_type === 'percentage' 
                ? `${promo.value}%` 
                : promo.discount_type === 'fixed' 
                    ? `${this.formatPrice(promo.value)} ₽`
                    : promo.discount_type === 'free_delivery'
                        ? 'Бесплатно'
                        : '2 по цене 1';

            const usageText = promo.usage_limit 
                ? `${promo.used_count || 0}/${promo.usage_limit}`
                : `${promo.used_count || 0}/∞`;

            const statusClass = promo.is_active ? 'active' : 'inactive';
            const statusText = promo.is_active ? 'Активен' : 'Не активен';

            let expiresText = '';
            if (promo.end_date) {
                const endDate = new Date(promo.end_date);
                const now = new Date();
                if (endDate < now) {
                    expiresText = `<span style="color: #dc3545;">Истек: ${endDate.toLocaleDateString('ru-RU')}</span>`;
                } else {
                    expiresText = `До: ${endDate.toLocaleDateString('ru-RU')}`;
                }
            } else {
                expiresText = 'Без срока';
            }

            html += `
                <tr>
                    <td><strong style="font-family: monospace; font-size: 16px;">${promo.code}</strong></td>
                    <td>${typeText}</td>
                    <td>${valueText}</td>
                    <td>${promo.usage_limit || '∞'}</td>
                    <td>${usageText}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${expiresText}</td>
                    <td>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button class="btn-small btn-edit" onclick="admin.showEditPromoCodeForm(${promo.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-small btn-delete" onclick="admin.deletePromoCode(${promo.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                            <button class="btn-small ${promo.is_active ? 'btn-secondary' : 'btn-success'}" 
                                    onclick="admin.togglePromoCodeStatus(${promo.id}, ${!promo.is_active})">
                                <i class="fas fa-power-off"></i>
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

    showAddPromoCodeForm() {
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
                                <div class="input-with-button">
                                    <input type="text" id="promoCode" required placeholder="SUMMER2024" style="font-family: monospace; font-size: 16px;">
                                    <button type="button" class="btn-small" onclick="admin.generatePromoCode()">
                                        <i class="fas fa-dice"></i> Сгенерировать
                                    </button>
                                </div>
                                <small style="color: #666; margin-top: 5px; display: block;">
                                    Используйте буквы и цифры, рекомендуется 6-12 символов
                                </small>
                            </div>
                            <div class="form-group">
                                <label for="promoType">Тип скидки *</label>
                                <select id="promoType" required onchange="admin.onPromoTypeChange()">
                                    <option value="">Выберите тип</option>
                                    <option value="percentage">Процентная скидка</option>
                                    <option value="fixed">Фиксированная сумма</option>
                                    <option value="free_delivery">Бесплатная доставка</option>
                                    <option value="bogo">Купи 1 получи 2</option>
                                </select>
                            </div>
                            <div class="form-group" id="promoValueGroup">
                                <label for="promoValue">Размер скидки *</label>
                                <div class="input-with-unit">
                                    <input type="number" id="promoValue" step="0.01" placeholder="10" required>
                                    <span id="promoUnit">%</span>
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="usageLimit">Лимит использований</label>
                                <input type="number" id="usageLimit" min="1" placeholder="100 (0 = без лимита)">
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h3>Срок действия</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="promoStartDate">Дата начала</label>
                                <input type="datetime-local" id="promoStartDate">
                            </div>
                            <div class="form-group">
                                <label for="promoEndDate">Дата окончания</label>
                                <input type="datetime-local" id="promoEndDate">
                            </div>
                            <div class="form-group">
                                <label for="minOrderAmountPromo">Мин. сумма заказа</label>
                                <input type="number" id="minOrderAmountPromo" step="0.01" placeholder="0 (без ограничений)">
                            </div>
                            <div class="form-group">
                                <label for="isActivePromo">Статус</label>
                                <select id="isActivePromo">
                                    <option value="1">Активен</option>
                                    <option value="0">Не активен</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h3>Ограничения</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="onePerCustomer">Одноразовый для пользователя</label>
                                <select id="onePerCustomer">
                                    <option value="0">Нет</option>
                                    <option value="1">Да</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="excludeSaleItems">Исключать товары со скидкой</label>
                                <select id="excludeSaleItems">
                                    <option value="0">Нет</option>
                                    <option value="1">Да</option>
                                </select>
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

        // Генерируем код по умолчанию
        this.generatePromoCode();
    }

    generatePromoCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        document.getElementById('promoCode').value = code;
    }

    onPromoTypeChange() {
        const type = document.getElementById('promoType').value;
        const valueGroup = document.getElementById('promoValueGroup');
        const unit = document.getElementById('promoUnit');
        const valueInput = document.getElementById('promoValue');

        if (type === 'free_delivery' || type === 'bogo') {
            valueGroup.style.display = 'none';
            valueInput.removeAttribute('required');
        } else {
            valueGroup.style.display = 'block';
            valueInput.setAttribute('required', 'required');
            
            if (type === 'percentage') {
                unit.textContent = '%';
                valueInput.placeholder = '10';
            } else if (type === 'fixed') {
                unit.textContent = '₽';
                valueInput.placeholder = '1000';
            }
        }
    }

    async handlePromoCodeSubmit(e) {
        e.preventDefault();

        const formData = {
            code: document.getElementById('promoCode').value.toUpperCase(),
            discount_type: document.getElementById('promoType').value,
            value: parseFloat(document.getElementById('promoValue').value) || 0,
            usage_limit: parseInt(document.getElementById('usageLimit').value) || null,
            min_order_amount: parseFloat(document.getElementById('minOrderAmountPromo').value) || 0,
            start_date: document.getElementById('promoStartDate').value || null,
            end_date: document.getElementById('promoEndDate').value || null,
            is_active: document.getElementById('isActivePromo').value === '1',
            one_per_customer: document.getElementById('onePerCustomer').value === '1',
            exclude_sale_items: document.getElementById('excludeSaleItems').value === '1'
        };

        // Валидация
        if (!formData.code) {
            this.showAlert('❌ Введите код промокода', 'error');
            return;
        }

        if (!formData.discount_type) {
            this.showAlert('❌ Выберите тип промокода', 'error');
            return;
        }

        if ((formData.discount_type === 'percentage' || formData.discount_type === 'fixed') && !formData.value) {
            this.showAlert('❌ Укажите размер скидки', 'error');
            return;
        }

        try {
            const response = await fetch('/api/admin/promo-codes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Промокод успешно создан', 'success');
                await this.loadPromoCodes();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка создания промокода:', error);
            this.showAlert('❌ Ошибка соединения с сервером', 'error');
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

    async togglePromoCodeStatus(id, isActive) {
        try {
            const response = await fetch(`/api/admin/promo-codes/${id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ is_active: isActive })
            });

            const result = await response.json();

            if (result.success) {
                const message = isActive ? '✅ Промокод активирован' : '✅ Промокод деактивирован';
                this.showAlert(message, 'success');
                await this.loadPromoCodes();
            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка изменения статуса промокода:', error);
            this.showAlert('❌ Ошибка изменения статуса', 'error');
        }
    }

    // ========== ДЕРЕВО КАТЕГОРИЙ ==========

    async loadCategoriesTree() {
        console.log('🌳 Загрузка дерева категорий...');
        try {
            const response = await fetch('/api/admin/categories/tree');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
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
                    <i class="fas fa-sitemap" style="font-size: 48px; color: #ddd;"></i>
                    <h3>Дерево категорий пусто</h3>
                    <p>Создайте первую категорию</p>
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
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-primary" onclick="admin.showAddCategoryTreeForm()">
                        <i class="fas fa-plus"></i> Новая категория
                    </button>
                    <button class="btn btn-outline" onclick="admin.exportCategoriesTree()">
                        <i class="fas fa-download"></i> Экспорт
                    </button>
                    <button class="btn btn-outline" onclick="admin.importCategoriesTree()">
                        <i class="fas fa-upload"></i> Импорт
                    </button>
                </div>
            </div>
            <div class="categories-tree-container">
                <div class="tree-controls">
                    <input type="text" id="searchCategory" placeholder="Поиск категории..." 
                           onkeyup="admin.searchCategoriesTree(this.value)">
                    <button class="btn-small" onclick="admin.expandAllCategories()">
                        <i class="fas fa-expand"></i> Развернуть все
                    </button>
                    <button class="btn-small" onclick="admin.collapseAllCategories()">
                        <i class="fas fa-compress"></i> Свернуть все
                    </button>
                </div>
                <div class="categories-tree" id="categoriesTree">
        `;

        const renderCategory = (category, level = 0) => {
            const indent = level * 30;
            const hasChildren = category.children && category.children.length > 0;
            
            return `
                <div class="category-tree-item" data-id="${category.id}" style="margin-left: ${indent}px;">
                    <div class="category-tree-content">
                        <div class="category-tree-toggle" onclick="admin.toggleCategoryTree(${category.id})" 
                             style="visibility: ${hasChildren ? 'visible' : 'hidden'}">
                            <i class="fas fa-chevron-right"></i>
                        </div>
                        <div class="category-tree-info">
                            <i class="fas fa-folder${category.has_products ? '-open' : ''}"></i>
                            <span class="category-name">${category.name}</span>
                            ${category.product_count ? `
                                <span class="category-count">${category.product_count} товаров</span>
                            ` : ''}
                            ${category.discount_name ? `
                                <span class="category-discount">
                                    <i class="fas fa-percentage"></i> ${category.discount_name}
                                </span>
                            ` : ''}
                            <span class="category-sort">Порядок: ${category.sort_order || 0}</span>
                        </div>
                        <div class="category-tree-actions">
                            <button class="btn-small btn-edit" onclick="admin.showEditCategoryTreeForm(${category.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-small btn-success" onclick="admin.addSubCategory(${category.id})">
                                <i class="fas fa-plus-circle"></i>
                            </button>
                            <button class="btn-small btn-delete" onclick="admin.deleteCategoryTree(${category.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="category-tree-children" id="children-${category.id}" style="display: none;">
                        ${hasChildren ? category.children.map(child => renderCategory(child, level + 1)).join('') : ''}
                    </div>
                </div>
            `;
        };

        this.categories_tree.forEach(category => {
            html += renderCategory(category);
        });

        html += `
                </div>
                <div class="tree-stats">
                    <div class="stat-item">
                        <i class="fas fa-layer-group"></i>
                        <span>Всего категорий: <strong id="totalCategories">${this.countCategories(this.categories_tree)}</strong></span>
                    </div>
                    <div class="stat-item">
                        <i class="fas fa-sitemap"></i>
                        <span>Уровней вложенности: <strong id="treeDepth">${this.getTreeDepth(this.categories_tree)}</strong></span>
                    </div>
                    <div class="stat-item">
                        <i class="fas fa-tags"></i>
                        <span>Товаров в категориях: <strong id="totalProductsInCategories">${this.countProductsInTree(this.categories_tree)}</strong></span>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    countCategories(tree) {
        let count = 0;
        const countRecursive = (categories) => {
            categories.forEach(category => {
                count++;
                if (category.children && category.children.length > 0) {
                    countRecursive(category.children);
                }
            });
        };
        countRecursive(tree);
        return count;
    }

    getTreeDepth(tree) {
        let maxDepth = 0;
        const getDepth = (categories, depth) => {
            maxDepth = Math.max(maxDepth, depth);
            categories.forEach(category => {
                if (category.children && category.children.length > 0) {
                    getDepth(category.children, depth + 1);
                }
            });
        };
        getDepth(tree, 1);
        return maxDepth;
    }

    countProductsInTree(tree) {
        let count = 0;
        const countRecursive = (categories) => {
            categories.forEach(category => {
                count += category.product_count || 0;
                if (category.children && category.children.length > 0) {
                    countRecursive(category.children);
                }
            });
        };
        countRecursive(tree);
        return count;
    }

    toggleCategoryTree(categoryId) {
        const children = document.getElementById(`children-${categoryId}`);
        const toggle = children.previousElementSibling.querySelector('.category-tree-toggle i');
        
        if (children.style.display === 'none') {
            children.style.display = 'block';
            toggle.classList.remove('fa-chevron-right');
            toggle.classList.add('fa-chevron-down');
        } else {
            children.style.display = 'none';
            toggle.classList.remove('fa-chevron-down');
            toggle.classList.add('fa-chevron-right');
        }
    }

    expandAllCategories() {
        document.querySelectorAll('.category-tree-children').forEach(el => {
            el.style.display = 'block';
            const toggle = el.previousElementSibling.querySelector('.category-tree-toggle i');
            if (toggle) {
                toggle.classList.remove('fa-chevron-right');
                toggle.classList.add('fa-chevron-down');
            }
        });
    }

    collapseAllCategories() {
        document.querySelectorAll('.category-tree-children').forEach(el => {
            el.style.display = 'none';
            const toggle = el.previousElementSibling.querySelector('.category-tree-toggle i');
            if (toggle) {
                toggle.classList.remove('fa-chevron-down');
                toggle.classList.add('fa-chevron-right');
            }
        });
    }

    searchCategoriesTree(query) {
        const items = document.querySelectorAll('.category-tree-item');
        const searchTerm = query.toLowerCase().trim();
        
        items.forEach(item => {
            const name = item.querySelector('.category-name').textContent.toLowerCase();
            if (searchTerm === '' || name.includes(searchTerm)) {
                item.style.display = 'flex';
                // Показываем родителей найденных элементов
                let parent = item.parentElement.closest('.category-tree-children');
                while (parent) {
                    parent.style.display = 'block';
                    const parentItem = parent.previousElementSibling.closest('.category-tree-item');
                    if (parentItem) {
                        const toggle = parentItem.querySelector('.category-tree-toggle i');
                        if (toggle) {
                            toggle.classList.remove('fa-chevron-right');
                            toggle.classList.add('fa-chevron-down');
                        }
                    }
                    parent = parent.parentElement.closest('.category-tree-children');
                }
            } else {
                item.style.display = 'none';
            }
        });
    }

    showAddCategoryTreeForm(parentId = null) {
        const container = document.getElementById('categoriesTreeContainer');
        if (!container) return;

        let parentOptions = '<option value="">Нет (корневая категория)</option>';
        
        const buildOptions = (categories, level = 0) => {
            categories.forEach(category => {
                const prefix = '— '.repeat(level);
                parentOptions += `<option value="${category.id}">${prefix}${category.name}</option>`;
                if (category.children && category.children.length > 0) {
                    buildOptions(category.children, level + 1);
                }
            });
        };
        
        buildOptions(this.categories_tree);

        // Загружаем доступные скидки
        let discountOptions = '<option value="">Нет скидки</option>';
        this.discounts.forEach(discount => {
            if (discount.is_active) {
                discountOptions += `<option value="${discount.id}">${discount.name} (${discount.discount_type === 'percentage' ? discount.value + '%' : discount.value + '₽'})</option>`;
            }
        });

        container.innerHTML = `
            <div class="category-form-container">
                <div class="form-header">
                    <h2><i class="fas fa-folder-plus"></i> ${parentId ? 'Добавить подкатегорию' : 'Создание новой категории'}</h2>
                    <button class="btn btn-outline" onclick="admin.loadCategoriesTree()">
                        <i class="fas fa-arrow-left"></i> Назад к дереву
                    </button>
                </div>
                
                <form id="categoryTreeForm" onsubmit="return admin.handleCategoryTreeSubmit(event)">
                    ${parentId ? `<input type="hidden" id="parentId" value="${parentId}">` : ''}
                    
                    <div class="form-section">
                        <h3>Основная информация</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="categoryNameTree">Название категории *</label>
                                <input type="text" id="categoryNameTree" required placeholder="Электроника, Одежда, Продукты">
                            </div>
                            <div class="form-group">
                                <label for="parentCategoryId">Родительская категория</label>
                                <select id="parentCategoryId">
                                    ${parentOptions}
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="sortOrder">Порядок сортировки</label>
                                <input type="number" id="sortOrder" value="0" min="0">
                            </div>
                            <div class="form-group">
                                <label for="categoryDiscountId">Скидка для категории</label>
                                <select id="categoryDiscountId">
                                    ${discountOptions}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h3>Описание и настройки</h3>
                        <div class="form-grid">
                            <div class="form-group full-width">
                                <label for="categoryDescription">Описание категории</label>
                                <textarea id="categoryDescription" rows="3" placeholder="Описание для SEO и пользователей"></textarea>
                            </div>
                            <div class="form-group">
                                <label for="categoryIcon">Иконка (Font Awesome)</label>
                                <input type="text" id="categoryIcon" placeholder="fas fa-mobile-alt">
                                <small style="color: #666;">Например: fas fa-mobile-alt, fas fa-tshirt</small>
                            </div>
                            <div class="form-group">
                                <label for="categoryColor">Цвет категории</label>
                                <input type="color" id="categoryColor" value="#667eea">
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h3>SEO настройки</h3>
                        <div class="form-grid">
                            <div class="form-group full-width">
                                <label for="seoTitle">SEO заголовок</label>
                                <input type="text" id="seoTitle" placeholder="Купить электронику недорого">
                            </div>
                            <div class="form-group full-width">
                                <label for="seoDescription">SEO описание</label>
                                <textarea id="seoDescription" rows="2" placeholder="Описание для поисковых систем"></textarea>
                            </div>
                            <div class="form-group full-width">
                                <label for="seoKeywords">Ключевые слова</label>
                                <input type="text" id="seoKeywords" placeholder="электроника, техника, гаджеты">
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

        // Если передан parentId, выбираем его в селекте
        if (parentId) {
            document.getElementById('parentCategoryId').value = parentId;
        }
    }

    async handleCategoryTreeSubmit(e) {
        e.preventDefault();

        const formData = {
            name: document.getElementById('categoryNameTree').value,
            parent_id: document.getElementById('parentCategoryId').value || null,
            sort_order: parseInt(document.getElementById('sortOrder').value) || 0,
            discount_id: document.getElementById('categoryDiscountId').value || null,
            description: document.getElementById('categoryDescription').value || null,
            icon: document.getElementById('categoryIcon').value || null,
            color: document.getElementById('categoryColor').value || null,
            seo_title: document.getElementById('seoTitle').value || null,
            seo_description: document.getElementById('seoDescription').value || null,
            seo_keywords: document.getElementById('seoKeywords').value || null
        };

        if (!formData.name) {
            this.showAlert('❌ Введите название категории', 'error');
            return;
        }

        try {
            const response = await fetch('/api/admin/categories/tree', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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

    addSubCategory(parentId) {
        this.showAddCategoryTreeForm(parentId);
    }

    async deleteCategoryTree(id) {
        if (!confirm('Вы уверены, что хотите удалить эту категорию? Все подкатегории также будут удалены.')) return;

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

    exportCategoriesTree() {
        const data = JSON.stringify(this.categories_tree, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'categories-tree.json';
        a.click();
        URL.revokeObjectURL(url);
        this.showAlert('✅ Дерево категорий экспортировано', 'success');
    }

    importCategoriesTree() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (confirm('Импортировать дерево категорий? Существующие категории будут перезаписаны.')) {
                        // Здесь можно добавить логику импорта на сервер
                        this.showAlert('✅ Дерево категорий импортировано', 'success');
                    }
                } catch (error) {
                    this.showAlert('❌ Ошибка чтения файла', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // ========== ОБЩИЕ МЕТОДЫ ==========

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

        // Загружаем данные для страницы
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