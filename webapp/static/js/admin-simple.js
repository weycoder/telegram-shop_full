// Telegram Shop Админ Панель - Исправленная версия
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

        console.log('✅ Админ панель инициализирована');
        this.init();
    }

    init() {
        this.bindEvents();
        // Показываем дашборд сразу после инициализации
        this.showPage('dashboard');
    }

    bindEvents() {
        console.log('🔗 Назначаем обработчики...');

        // Навигация
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = item.dataset.page;
                console.log('Клик по навигации:', pageId);
                this.showPage(pageId);
            });
        });

        // Кнопка обновить
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            console.log('Клик по обновить');
            this.refreshCurrentPage();
        });

        // Кнопка выхода
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            console.log('Клик по выходу');
            this.logout();
        });

        // Кнопка добавления товара (в шапке)
        document.getElementById('addProductBtn')?.addEventListener('click', (e) => {
            console.log('Клик по добавить товар');
            e.preventDefault();
            this.showAddProduct();
        });

        // Кнопка отмены в форме
        document.getElementById('cancelAdd')?.addEventListener('click', (e) => {
            console.log('Клик по отмене');
            e.preventDefault();
            this.showPage('products');
        });

        // Форма добавления товара
        const productForm = document.getElementById('addProductForm');
        if (productForm) {
            productForm.addEventListener('submit', (e) => {
                e.preventDefault();
                console.log('Отправка формы товара');
                this.handleProductSubmit(e);
            });
        }

        // Кнопка добавления категории
        document.getElementById('addCategoryBtn')?.addEventListener('click', (e) => {
            console.log('Клик по добавлению категории');
            e.preventDefault();
            this.addCategory();
        });

        // Enter для добавления категории
        document.getElementById('newCategory')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                console.log('Enter для добавления категории');
                this.addCategory();
            }
        });

        // Загрузка файлов
        this.bindFileUploadEvents();

        console.log('✅ Все обработчики назначены');
    }

    bindFileUploadEvents() {
        const fileUploadArea = document.getElementById('fileUploadArea');
        const fileInput = document.getElementById('productImageFile');

        if (!fileUploadArea || !fileInput) return;

        // Клик по области загрузки
        fileUploadArea.addEventListener('click', () => {
            console.log('Клик по области загрузки файла');
            fileInput.click();
        });

        // Выбор файла
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            console.log('Выбран файл:', file?.name);
            if (file) {
                this.handleFileSelect(file);
            }
        });

        // Drag and drop
        ['dragover', 'dragleave', 'drop'].forEach(event => {
            fileUploadArea.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        fileUploadArea.addEventListener('dragover', () => {
            fileUploadArea.style.backgroundColor = '#f0f0f0';
        });

        fileUploadArea.addEventListener('dragleave', () => {
            fileUploadArea.style.backgroundColor = '';
        });

        fileUploadArea.addEventListener('drop', (e) => {
            fileUploadArea.style.backgroundColor = '';
            const file = e.dataTransfer.files[0];
            console.log('Файл перетащен:', file?.name);
            if (file && file.type.startsWith('image/')) {
                this.handleFileSelect(file);
            }
        });
    }

    // ========== БАЗОВЫЕ МЕТОДЫ ==========

    showAlert(message, type = 'info') {
        console.log(`Показываем алерт: ${message}, тип: ${type}`);
        // Удаляем старые алерты
        document.querySelectorAll('.alert').forEach(alert => alert.remove());

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        document.querySelector('.admin-main').prepend(alertDiv);

        // Автоматическое скрытие через 5 секунд
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    async loadProducts() {
        console.log('📦 Загрузка товаров...');

        try {
            const response = await fetch('/api/admin/products');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const products = await response.json();
            console.log('✅ Загружено товаров:', products.length);
            this.products = products;
            this.renderProducts();
        } catch (error) {
            console.error('❌ Ошибка загрузки товаров:', error);
            this.showAlert('❌ Ошибка загрузки товаров', 'error');
            this.products = [];
            this.renderProducts();
        }
    }

    async loadOrders() {
        console.log('📋 Загрузка заказов...');

        try {
            const response = await fetch('/api/admin/orders');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const orders = await response.json();
            console.log('✅ Загружено заказов:', orders.length);
            this.orders = orders;
            this.renderOrders();
        } catch (error) {
            console.error('❌ Ошибка загрузки заказов:', error);
            this.showAlert('❌ Ошибка загрузки заказов', 'error');
            this.orders = [];
            this.renderOrders();
        }
    }

    async loadCategories() {
        console.log('🏷️ Загрузка категорий...');

        try {
            const response = await fetch('/api/admin/categories/manage');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const categories = await response.json();
            console.log('✅ Загружено категорий:', categories.length);
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
        console.log('📊 Загрузка статистики...');

        try {
            const response = await fetch('/api/admin/dashboard');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const stats = await response.json();
            console.log('📈 Данные статистики:', stats);

            // Исправляем: правильные поля из ответа сервера
            const totalRevenue = stats.total_revenue || stats.revenue || 0;
            const totalOrders = stats.total_orders || stats.orders_count || 0;
            const totalProducts = stats.total_products || stats.products_count || 0;
            const pendingOrders = stats.pending_orders || 0;

            console.log(`💰 Выручка: ${totalRevenue}, Заказы: ${totalOrders}, Товары: ${totalProducts}, Ожидают: ${pendingOrders}`);

            // Обновляем DOM
            const totalRevenueEl = document.getElementById('totalRevenue');
            const totalOrdersEl = document.getElementById('totalOrders');
            const totalProductsEl = document.getElementById('totalProducts');
            const pendingOrdersEl = document.getElementById('pendingOrders');

            if (totalRevenueEl) totalRevenueEl.textContent = this.formatPrice(totalRevenue) + ' ₽';
            if (totalOrdersEl) totalOrdersEl.textContent = totalOrders;
            if (totalProductsEl) totalProductsEl.textContent = totalProducts;
            if (pendingOrdersEl) pendingOrdersEl.textContent = pendingOrders;

            // Обновляем время
            const now = new Date();
            const lastUpdatedEl = document.getElementById('lastUpdated');
            if (lastUpdatedEl) {
                lastUpdatedEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            }

        } catch (error) {
            console.error('❌ Ошибка загрузки статистики:', error);

            // Пробуем посчитать вручную
            try {
                console.log('🔄 Пробуем посчитать статистику вручную...');

                // Загружаем товары и заказы
                const [productsResponse, ordersResponse] = await Promise.all([
                    fetch('/api/admin/products'),
                    fetch('/api/admin/orders')
                ]);

                const products = await productsResponse.json();
                const orders = await ordersResponse.json();

                // Считаем статистику
                const totalRevenue = orders.reduce((sum, order) => sum + (order.total_price || 0), 0);
                const totalOrders = orders.length;
                const totalProducts = products.length;
                const pendingOrders = orders.filter(order => order.status === 'pending').length;

                console.log(`🔢 Рассчитано вручную: Выручка: ${totalRevenue}, Заказы: ${totalOrders}, Товары: ${totalProducts}, Ожидают: ${pendingOrders}`);

                // Обновляем DOM
                const totalRevenueEl = document.getElementById('totalRevenue');
                const totalOrdersEl = document.getElementById('totalOrders');
                const totalProductsEl = document.getElementById('totalProducts');
                const pendingOrdersEl = document.getElementById('pendingOrders');

                if (totalRevenueEl) totalRevenueEl.textContent = this.formatPrice(totalRevenue) + ' ₽';
                if (totalOrdersEl) totalOrdersEl.textContent = totalOrders;
                if (totalProductsEl) totalProductsEl.textContent = totalProducts;
                if (pendingOrdersEl) pendingOrdersEl.textContent = pendingOrders;

            } catch (error2) {
                console.error('❌ Не удалось рассчитать статистику:', error2);

                // Устанавливаем значения по умолчанию
                const totalRevenueEl = document.getElementById('totalRevenue');
                const totalOrdersEl = document.getElementById('totalOrders');
                const totalProductsEl = document.getElementById('totalProducts');
                const pendingOrdersEl = document.getElementById('pendingOrders');

                if (totalRevenueEl) totalRevenueEl.textContent = '0 ₽';
                if (totalOrdersEl) totalOrdersEl.textContent = '0';
                if (totalProductsEl) totalProductsEl.textContent = '0';
                if (pendingOrdersEl) pendingOrdersEl.textContent = '0';
            }
        }
    }

    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(price || 0));
    }

    async uploadFile(file) {
        console.log('📤 Загрузка файла:', file.name);

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch('/api/upload-image', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                console.log('✅ Файл загружен:', result.url);
                return result.url;
            } else {
                throw new Error(result.error || 'Ошибка загрузки');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки файла:', error);
            throw error;
        }
    }

    resetProductForm() {
        const form = document.getElementById('addProductForm');
        if (form) {
            form.reset();
        }
        this.selectedFile = null;
        this.isEditing = false;
        this.editingProductId = null;

        // Сбрасываем UI загрузки файла
        const fileInfo = document.getElementById('fileInfo');
        const fileInput = document.getElementById('productImageFile');
        const previewContainer = document.getElementById('imagePreviewContainer');

        if (fileInfo) fileInfo.style.display = 'none';
        if (fileInput) fileInput.value = '';
        if (previewContainer) previewContainer.style.display = 'none';

        // Восстанавливаем заголовок и кнопку
        const title = document.querySelector('#add-product h2');
        const submitBtn = document.querySelector('#addProductForm button[type="submit"]');

        if (title) title.textContent = 'Добавить товар';
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Сохранить товар';
        }
    }

    refreshCurrentPage() {
        console.log('🔄 Обновление текущей страницы:', this.currentPage);

        if (this.currentPage === 'dashboard') {
            this.loadDashboardData();
        } else if (this.currentPage === 'products') {
            this.loadProducts();
        } else if (this.currentPage === 'orders') {
            this.loadOrders();
        } else if (this.currentPage === 'categories') {
            this.loadCategories();
        }

        // Обновляем время
        const now = new Date();
        const lastUpdatedEl = document.getElementById('lastUpdated');
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
    }

    logout() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            window.location.href = '/admin/logout';
        }
    }

    showAddProduct() {
        console.log('Показываем форму добавления товара');
        this.isEditing = false;
        this.editingProductId = null;
        this.resetProductForm();
        this.showPage('add-product');
    }

    async deleteProduct(id) {
        if (!confirm(`Вы уверены, что хотите удалить товар #${id}?`)) return;

        try {
            const response = await fetch(`/api/admin/products?id=${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Товар удален', 'success');
                await this.loadProducts();
            } else {
                this.showAlert('❌ Ошибка удаления товара: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка удаления товара:', error);
            this.showAlert('❌ Ошибка удаления товара', 'error');
        }
    }

    async addCategory() {
        const input = document.getElementById('newCategory');
        if (!input) return;

        const categoryName = input.value.trim();
        console.log('Добавляем категорию:', categoryName);

        if (!categoryName) {
            this.showAlert('❌ Введите название категории', 'error');
            return;
        }

        try {
            const response = await fetch('/api/admin/categories/manage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: categoryName })
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert(`✅ Категория "${categoryName}" добавлена`, 'success');
                input.value = '';
                await this.loadCategories();
            } else {
                this.showAlert('❌ Ошибка добавления категории: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка добавления категории:', error);
            this.showAlert('❌ Ошибка добавления категории', 'error');
        }
    }

    // ========== РЕНДЕРИНГ ==========

    renderProducts() {
        console.log('Рендерим товары:', this.products.length);
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) {
            console.error('❌ Не найден tbody для товаров');
            return;
        }

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
            console.log('Рендерим товар:', product.id, product.name);
            html += `
                <tr>
                    <td style="font-weight: 600; color: #2c3e50;">#${product.id}</td>
                    <td>
                        <img src="${product.image_url || 'https://via.placeholder.com/60'}"
                             alt="${product.name}"
                             style="width: 60px; height: 60px; object-fit: cover; border-radius: 10px;"
                             onerror="this.src='https://via.placeholder.com/60'">
                    </td>
                    <td>
                        <div style="font-weight: 600; color: #2c3e50; margin-bottom: 5px;">${product.name}</div>
                        <div style="color: #6c757d; font-size: 14px;">${(product.description || '').substring(0, 60)}${product.description && product.description.length > 60 ? '...' : ''}</div>
                    </td>
                    <td style="font-weight: 700; color: #667eea;">${this.formatPrice(product.price)} ₽</td>
                    <td>${product.stock || 0}</td>
                    <td>${product.category || 'Без категории'}</td>
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
        console.log('✅ Товары отрендерены');
    }

    renderOrders() {
        console.log('Рендерим заказы:', this.orders.length);
        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) {
            console.error('❌ Не найден tbody для заказов');
            return;
        }

        if (!this.orders || this.orders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 40px;">
                        <i class="fas fa-clipboard-list" style="font-size: 48px; color: #ddd;"></i>
                        <p style="margin-top: 15px; color: #6c757d;">Заказы не найдены</p>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        this.orders.forEach(order => {
            const statusClass = `status-${order.status || 'pending'}`;
            const statusText = this.getStatusText(order.status);

            html += `
                <tr class="order-row" data-order-id="${order.id}" style="cursor: pointer;">
                    <td style="font-weight: 600; color: #2c3e50;">#${order.id}</td>
                    <td>${order.username || 'Гость'}</td>
                    <td style="font-weight: 700; color: #667eea;">${this.formatPrice(order.total_price)} ₽</td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>
                    <td>${new Date(order.created_at).toLocaleDateString('ru-RU')}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Добавляем обработчики клика на заказы
        this.bindOrderRowEvents();
        console.log('✅ Заказы отрендерены');
    }

    renderCategories() {
        console.log('Рендерим категории:', this.categories.length);
        const container = document.getElementById('categoriesList');
        if (!container) {
            console.error('❌ Не найден контейнер для категорий');
            return;
        }

        if (!this.categories || this.categories.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #6c757d;">
                    <i class="fas fa-tags" style="font-size: 48px; opacity: 0.3;"></i>
                    <p>Категории не найдены</p>
                </div>
            `;
            return;
        }

        let html = '<div class="categories-grid">';
        this.categories.forEach((category, index) => {
            const categoryName = category.name || category;
            html += `
                <div class="category-item">
                    <span>${categoryName}</span>
                    <button class="btn-small btn-delete" onclick="admin.deleteCategory('${categoryName}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
        console.log('✅ Категории отрендерены');
    }

    bindOrderRowEvents() {
        document.querySelectorAll('.order-row').forEach(row => {
            row.addEventListener('click', (e) => {
                const orderId = row.dataset.orderId;
                if (!e.target.closest('button')) {
                    this.showOrderDetails(orderId);
                }
            });
        });
    }

    getStatusText(status) {
        const statuses = {
            'pending': 'Ожидает',
            'processing': 'В обработке',
            'delivering': 'Доставляется',
            'completed': 'Завершен',
            'cancelled': 'Отменен'
        };
        return statuses[status] || status;
    }

    updateCategorySelect() {
        const select = document.getElementById('productCategory');
        if (!select) {
            console.error('❌ Не найден select для категорий');
            return;
        }

        console.log('Обновляем select категорий, всего:', this.categories.length);
        const currentValue = select.value;

        // Очищаем select
        while (select.options.length > 0) {
            select.remove(0);
        }

        // Добавляем опцию по умолчанию
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Выберите категорию';
        select.appendChild(defaultOption);

        // Добавляем категории
        this.categories.forEach(category => {
            const categoryName = typeof category === 'string' ? category : (category.name || category);
            const option = document.createElement('option');
            option.value = categoryName;
            option.textContent = categoryName;
            select.appendChild(option);
        });

        // Восстанавливаем значение если было
        if (currentValue) {
            select.value = currentValue;
        }
    }

    // ========== ОБРАБОТКА ФАЙЛОВ ==========

    handleFileSelect(file) {
        console.log('📁 Выбран файл:', file.name);

        if (!file.type.startsWith('image/')) {
            this.showAlert('❌ Пожалуйста, выберите изображение', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            this.showAlert('❌ Файл слишком большой (макс. 5МБ)', 'error');
            return;
        }

        this.selectedFile = file;

        const fileInfo = document.getElementById('fileInfo');
        const fileName = document.getElementById('fileName');
        const filePreview = document.getElementById('filePreview');

        if (fileInfo) fileInfo.style.display = 'flex';
        if (fileName) fileName.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            if (filePreview) filePreview.src = e.target.result;
            this.updateImagePreview(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    removeFile() {
        console.log('Удаляем файл');
        this.selectedFile = null;
        const fileInfo = document.getElementById('fileInfo');
        const fileInput = document.getElementById('productImageFile');
        const previewContainer = document.getElementById('imagePreviewContainer');

        if (fileInfo) fileInfo.style.display = 'none';
        if (fileInput) fileInput.value = '';
        if (previewContainer) previewContainer.style.display = 'none';
    }

    updateImagePreview(url) {
        const previewContainer = document.getElementById('imagePreviewContainer');
        const previewImg = document.getElementById('imagePreview');

        if (url && url.trim() !== '' && previewContainer && previewImg) {
            previewImg.src = url;
            previewContainer.style.display = 'block';
        } else if (previewContainer) {
            previewContainer.style.display = 'none';
        }
    }

    // ========== ОПЕРАЦИИ С ТОВАРАМИ ==========

    async editProduct(id) {
        console.log('Редактируем товар:', id);
        try {
            const response = await fetch(`/api/products/${id}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const product = await response.json();

            if (product.error) {
                throw new Error(product.error);
            }

            console.log('Товар для редактирования:', product);

            // Заполняем форму
            const nameInput = document.getElementById('productName');
            const priceInput = document.getElementById('productPrice');
            const stockInput = document.getElementById('productStock');
            const descInput = document.getElementById('productDescription');
            const imageUrlInput = document.getElementById('productImageUrl');
            const categorySelect = document.getElementById('productCategory');

            if (nameInput) nameInput.value = product.name || '';
            if (priceInput) priceInput.value = product.price || 0;
            if (stockInput) stockInput.value = product.stock || 0;
            if (descInput) descInput.value = product.description || '';
            if (imageUrlInput) imageUrlInput.value = product.image_url || '';

            if (categorySelect && product.category) {
                categorySelect.value = product.category;
            }

            this.updateImagePreview(product.image_url);
            this.isEditing = true;
            this.editingProductId = id;

            // Обновляем заголовок и кнопку
            const title = document.querySelector('#add-product h2');
            const submitBtn = document.querySelector('#addProductForm button[type="submit"]');

            if (title) title.textContent = 'Редактировать товар';
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Обновить товар';
            }

            this.showPage('add-product');

        } catch (error) {
            console.error('❌ Ошибка загрузки товара:', error);
            this.showAlert('❌ Товар не найден', 'error');
        }
    }

    async handleProductSubmit(e) {
        console.log('Обработка submit формы товара');
        e.preventDefault();

        const name = document.getElementById('productName')?.value?.trim();
        const price = parseFloat(document.getElementById('productPrice')?.value);
        const stock = parseInt(document.getElementById('productStock')?.value) || 0;
        const category = document.getElementById('productCategory')?.value;
        const description = document.getElementById('productDescription')?.value?.trim();
        const imageUrl = document.getElementById('productImageUrl')?.value?.trim();

        console.log('Данные формы:', { name, price, stock, category, description, imageUrl });

        if (!name || isNaN(price) || price <= 0 || isNaN(stock) || stock < 0) {
            this.showAlert('❌ Заполните обязательные поля правильно', 'error');
            return;
        }

        let finalImageUrl = imageUrl;

        if (this.selectedFile) {
            try {
                this.showAlert('📤 Загрузка изображения...', 'info');
                finalImageUrl = await this.uploadFile(this.selectedFile);
                console.log('Изображение загружено:', finalImageUrl);
            } catch (error) {
                console.error('❌ Ошибка загрузки файла:', error);
                this.showAlert('❌ Ошибка загрузки изображения', 'error');
                return;
            }
        }

        const productData = {
            name: name,
            price: price,
            stock: stock,
            category: category,
            description: description,
            image_url: finalImageUrl
        };

        console.log('Отправляем данные товара:', productData);

        try {
            let url, method;

            if (this.isEditing && this.editingProductId) {
                url = `/api/admin/products?id=${this.editingProductId}`;
                method = 'PUT';
                console.log('Редактирование товара:', this.editingProductId);
            } else {
                url = '/api/admin/products';
                method = 'POST';
                console.log('Создание нового товара');
            }

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(productData)
            });

            const result = await response.json();
            console.log('Ответ сервера:', result);

            if (result.success) {
                const message = this.isEditing
                    ? '✅ Товар успешно обновлен!'
                    : '✅ Товар успешно добавлен!';

                this.showAlert(message, 'success');
                this.resetProductForm();
                this.showPage('products');
                await this.loadProducts();

            } else {
                this.showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }

        } catch (error) {
            console.error('❌ Ошибка:', error);
            this.showAlert('❌ Ошибка соединения с сервером', 'error');
        }
    }

    async deleteCategory(categoryName) {
        console.log('Удаляем категорию:', categoryName);
        if (!confirm(`Вы уверены, что хотите удалить категорию "${categoryName}"?`)) return;

        try {
            const response = await fetch(`/api/admin/categories/manage?name=${encodeURIComponent(categoryName)}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert(`✅ Категория "${categoryName}" удалена`, 'success');
                await this.loadCategories();
            } else {
                this.showAlert('❌ Ошибка удаления категории: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка удаления категории:', error);
            this.showAlert('❌ Ошибка удаления категории', 'error');
        }
    }

    // ========== ДЕТАЛИ ЗАКАЗА ==========

    async showOrderDetails(orderId) {
        console.log('Показываем детали заказа:', orderId);
        try {
            const response = await fetch(`/api/admin/orders/${orderId}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const order = await response.json();

            if (order.error) {
                throw new Error(order.error);
            }

            this.renderOrderDetailsModal(order);
        } catch (error) {
            console.error('❌ Ошибка загрузки деталей заказа:', error);
            this.showAlert('❌ Не удалось загрузить детали заказа', 'error');
        }
    }

    renderOrderDetailsModal(order) {
        console.log('Рендерим модальное окно заказа:', order.id);
        const modal = document.getElementById('orderDetailsModal');
        const content = document.getElementById('orderDetailsContent');

        if (!modal || !content) {
            console.error('❌ Не найдено модальное окно');
            return;
        }

        // Парсим items если они в JSON
        let items = [];
        if (typeof order.items === 'string') {
            try {
                items = JSON.parse(order.items);
            } catch (e) {
                console.error('Ошибка парсинга items:', e);
                items = [];
            }
        } else {
            items = order.items || [];
        }

        let itemsHtml = '';
        if (items.length > 0) {
            items.forEach(item => {
                itemsHtml += `
                    <div class="order-item">
                        <div class="item-name">${item.name || 'Товар'}</div>
                        <div class="item-quantity">${item.quantity} шт.</div>
                        <div class="item-price">${this.formatPrice(item.price)} ₽</div>
                        <div class="item-total">${this.formatPrice(item.price * item.quantity)} ₽</div>
                    </div>
                `;
            });
        }

        // Парсим адрес доставки
        let deliveryAddress = '';
        if (order.delivery_address) {
            try {
                const address = typeof order.delivery_address === 'string'
                    ? JSON.parse(order.delivery_address)
                    : order.delivery_address;

                if (address.city) deliveryAddress += address.city;
                if (address.street) deliveryAddress += `, ${address.street}`;
                if (address.house) deliveryAddress += `, д. ${address.house}`;
                if (address.apartment) deliveryAddress += `, кв. ${address.apartment}`;
            } catch (e) {
                console.error('Ошибка парсинга адреса:', e);
                deliveryAddress = order.delivery_address || '';
            }
        }

        content.innerHTML = `
            <div class="modal-header">
                <h2>Заказ #${order.id}</h2>
                <button class="close-modal" onclick="admin.closeOrderDetails()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="order-info-section">
                    <h3>Информация о заказе</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Статус:</label>
                            <span class="status-badge status-${order.status || 'pending'}">
                                ${this.getStatusText(order.status)}
                            </span>
                        </div>
                        <div class="info-item">
                            <label>Дата создания:</label>
                            <span>${new Date(order.created_at).toLocaleString('ru-RU')}</span>
                        </div>
                        <div class="info-item">
                            <label>Пользователь:</label>
                            <span>${order.username || 'Гость'} (ID: ${order.user_id || 'неизвестно'})</span>
                        </div>
                        <div class="info-item">
                            <label>Способ доставки:</label>
                            <span>${order.delivery_type === 'courier' ? 'Курьер' : 'Самовывоз'}</span>
                        </div>
                        <div class="info-item">
                            <label>Способ оплаты:</label>
                            <span>${order.payment_method === 'cash' ? 'Наличные' : 'Карта'}</span>
                        </div>
                        <div class="info-item">
                            <label>Получатель:</label>
                            <span>${order.recipient_name || 'Не указан'}</span>
                        </div>
                        <div class="info-item">
                            <label>Телефон:</label>
                            <span>${order.phone_number || 'Не указан'}</span>
                        </div>
                        ${deliveryAddress ? `
                            <div class="info-item full-width">
                                <label>Адрес доставки:</label>
                                <span>${deliveryAddress}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="order-items-section">
                    <h3>Товары в заказе</h3>
                    ${items.length > 0 ? `
                        <div class="order-items">
                            ${itemsHtml}
                            <div class="order-total">
                                <div class="total-label">Итого:</div>
                                <div class="total-price">${this.formatPrice(order.total_price)} ₽</div>
                            </div>
                        </div>
                    ` : '<p class="no-items">Товары не найдены</p>'}
                </div>

                <div class="order-actions">
                    <h3>Действия</h3>
                    <div class="actions-grid">
                        <button class="btn ${order.status === 'pending' ? 'btn-primary' : 'btn-secondary'}"
                                onclick="admin.updateOrderStatus(${order.id}, 'processing')"
                                ${order.status !== 'pending' ? 'disabled' : ''}>
                            <i class="fas fa-cog"></i> В обработку
                        </button>
                        <button class="btn ${order.status === 'processing' ? 'btn-primary' : 'btn-secondary'}"
                                onclick="admin.updateOrderStatus(${order.id}, 'delivering')"
                                ${order.status !== 'processing' ? 'disabled' : ''}>
                            <i class="fas fa-truck"></i> В доставку
                        </button>
                        <button class="btn ${order.status === 'delivering' ? 'btn-primary' : 'btn-secondary'}"
                                onclick="admin.updateOrderStatus(${order.id}, 'completed')"
                                ${order.status !== 'delivering' ? 'disabled' : ''}>
                            <i class="fas fa-check-circle"></i> Завершить
                        </button>
                        <button class="btn btn-danger"
                                onclick="admin.cancelOrder(${order.id})"
                                ${order.status === 'completed' || order.status === 'cancelled' ? 'disabled' : ''}>
                            <i class="fas fa-times-circle"></i> Отменить
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    }

    closeOrderDetails() {
        console.log('Закрываем детали заказа');
        const modal = document.getElementById('orderDetailsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async updateOrderStatus(orderId, status) {
        console.log('Обновляем статус заказа:', orderId, 'на', status);
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
                this.showAlert(`✅ Статус заказа #${orderId} изменен на "${this.getStatusText(status)}"`, 'success');
                this.closeOrderDetails();
                await this.loadOrders();
            } else {
                throw new Error(result.error || 'Ошибка обновления статуса');
            }
        } catch (error) {
            console.error('❌ Ошибка обновления статуса заказа:', error);
            this.showAlert('❌ Ошибка обновления статуса заказа', 'error');
        }
    }

    async cancelOrder(orderId) {
        console.log('Отменяем заказ:', orderId);
        if (!confirm(`Вы уверены, что хотите отменить заказ #${orderId}?`)) return;

        try {
            const response = await fetch(`/api/admin/orders/${orderId}/cancel`, {
                method: 'PUT'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert(`✅ Заказ #${orderId} отменен`, 'success');
                this.closeOrderDetails();
                await this.loadOrders();
            } else {
                throw new Error(result.error || 'Ошибка отмены заказа');
            }
        } catch (error) {
            console.error('❌ Ошибка отмены заказа:', error);
            this.showAlert('❌ Ошибка отмены заказа', 'error');
        }
    }

    // ========== ОСНОВНЫЕ МЕТОДЫ ==========

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

        // Обновляем активную навигацию
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
            'add-product': this.isEditing ? 'Редактировать товар' : 'Добавить товар',
            'categories': 'Управление категориями'
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

        // Добавляем обработчики для кнопок в таблице (через делегирование)
        document.addEventListener('click', function(e) {
            // Обработка кнопок редактирования товара
            if (e.target.closest('.btn-edit') || e.target.closest('.fa-edit')) {
                const btn = e.target.closest('.btn-edit') || e.target.closest('.fa-edit');
                const row = btn.closest('tr');
                if (row) {
                    const productId = row.querySelector('td:first-child')?.textContent?.replace('#', '');
                    if (productId && admin) {
                        admin.editProduct(parseInt(productId));
                    }
                }
            }

            // Обработка кнопок удаления товара
            if (e.target.closest('.btn-delete') || e.target.closest('.fa-trash')) {
                const btn = e.target.closest('.btn-delete') || e.target.closest('.fa-trash');
                const row = btn.closest('tr');
                if (row) {
                    const productId = row.querySelector('td:first-child')?.textContent?.replace('#', '');
                    if (productId && admin) {
                        admin.deleteProduct(parseInt(productId));
                    }
                }
            }
        });

    } catch (error) {
        console.error('❌ Ошибка инициализации админ панели:', error);
        alert('Ошибка загрузки админ панели. Обновите страницу.');
    }
});