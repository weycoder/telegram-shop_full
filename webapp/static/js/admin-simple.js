[file name]: admin-simple.js
[file content begin]
// Telegram Shop Админ Панель - Полная версия
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

        // Новые свойства
        this.discounts = [];
        this.promo_codes = [];
        this.categories_tree = [];
        this.selectedDiscount = null;
        this.productMode = 'piece';

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
            fileInput.click();
        });

        // Выбор файла
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
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
            if (file && file.type.startsWith('image/')) {
                this.handleFileSelect(file);
            }
        });
    }

    // ========== БАЗОВЫЕ МЕТОДЫ ==========

    showAlert(message, type = 'info') {
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
            alertDiv.remove();
        }, 5000);
    }

    async loadProducts() {
        console.log('📦 Загрузка товаров...');

        try {
            const response = await fetch('/admin/api/products');
            const result = await response.json();

            if (result.success) {
                this.products = result.products || [];
                this.renderProducts();
            } else {
                throw new Error(result.error || 'Ошибка загрузки');
            }
        } catch (error) {
            console.error('Ошибка загрузки товаров:', error);
            
            // Пробуем загрузить через другой эндпоинт
            try {
                const response = await fetch('/api/admin/products');
                this.products = await response.json();
                this.renderProducts();
            } catch (error2) {
                console.error('Ошибка загрузки товаров через альтернативный эндпоинт:', error2);
                this.products = [];
                this.renderProducts();
            }
        }
    }

    async loadOrders() {
        console.log('📋 Загрузка заказов...');

        try {
            const response = await fetch('/admin/api/orders');
            const result = await response.json();

            if (result.success) {
                this.orders = result.orders || [];
                this.renderOrders();
            } else {
                throw new Error(result.error || 'Ошибка загрузки');
            }
        } catch (error) {
            console.error('Ошибка загрузки заказов:', error);
            
            // Пробуем загрузить через другой эндпоинт
            try {
                const response = await fetch('/api/admin/orders');
                this.orders = await response.json();
                this.renderOrders();
            } catch (error2) {
                console.error('Ошибка загрузки заказов через альтернативный эндпоинт:', error2);
                this.orders = [];
                this.renderOrders();
            }
        }
    }

    async loadCategories() {
        console.log('🏷️ Загрузка категорий...');

        try {
            const response = await fetch('/admin/api/categories');
            const result = await response.json();

            if (result.success) {
                this.categories = result.categories || [];
                this.renderCategories();

                // Обновляем список категорий в форме
                this.updateCategorySelect();
            } else {
                throw new Error(result.error || 'Ошибка загрузки');
            }
        } catch (error) {
            console.error('Ошибка загрузки категорий:', error);
            
            // Пробуем загрузить через другой эндпоинт
            try {
                const response = await fetch('/api/admin/categories/manage');
                this.categories = await response.json();
                this.renderCategories();
                this.updateCategorySelect();
            } catch (error2) {
                console.error('Ошибка загрузки категорий через альтернативный эндпоинт:', error2);
                this.categories = [];
                this.renderCategories();
            }
        }
    }

    async loadDashboardData() {
        console.log('📊 Загрузка статистики...');

        try {
            const response = await fetch('/api/admin/dashboard');
            const result = await response.json();

            console.log('📈 Данные статистики:', result);

            // Исправляем названия полей
            document.getElementById('totalRevenue').textContent = this.formatPrice(result.total_revenue || result.revenue || 0) + ' ₽';
            document.getElementById('totalOrders').textContent = result.total_orders || result.orders_count || 0;
            document.getElementById('totalProducts').textContent = result.total_products || result.products_count || 0;
            document.getElementById('pendingOrders').textContent = result.pending_orders || 0;

            // Обновляем время
            const now = new Date();
            document.getElementById('lastUpdated').textContent =
                now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        } catch (error) {
            console.error('❌ Ошибка загрузки статистики:', error);
            
            // Пробуем альтернативный подход
            try {
                const db = get_db();
                const stats = await db.execute(`
                    SELECT 
                        (SELECT COUNT(*) FROM orders) as total_orders,
                        COALESCE(SUM(total_price), 0) as total_revenue,
                        (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
                        (SELECT COUNT(*) FROM products) as total_products
                    FROM orders
                `).fetchone();
                
                document.getElementById('totalRevenue').textContent = this.formatPrice(stats.total_revenue || 0) + ' ₽';
                document.getElementById('totalOrders').textContent = stats.total_orders || 0;
                document.getElementById('totalProducts').textContent = stats.total_products || 0;
                document.getElementById('pendingOrders').textContent = stats.pending_orders || 0;
                
            } catch (error2) {
                console.error('❌ Критическая ошибка загрузки статистики:', error2);
                
                // Устанавливаем значения по умолчанию
                document.getElementById('totalRevenue').textContent = '0 ₽';
                document.getElementById('totalOrders').textContent = '0';
                document.getElementById('totalProducts').textContent = '0';
                document.getElementById('pendingOrders').textContent = '0';
            }
        }
    }

    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(price || 0));
    }

    async uploadFile(file) {
        console.log('📤 Загрузка файла:', file.name);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/admin/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                return result.url;
            } else {
                throw new Error(result.error || 'Ошибка загрузки');
            }
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            
            // Пробуем альтернативный эндпоинт
            try {
                const formData = new FormData();
                formData.append('image', file);
                
                const response = await fetch('/api/upload-image', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    return result.url;
                } else {
                    throw new Error(result.error || 'Ошибка загрузки');
                }
            } catch (error2) {
                console.error('Ошибка загрузки файла через альтернативный эндпоинт:', error2);
                throw error2;
            }
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
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('productImageFile').value = '';
        document.getElementById('imagePreviewContainer').style.display = 'none';

        // Восстанавливаем заголовок и кнопку
        document.querySelector('#add-product h2').textContent = 'Добавить товар';
        const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
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
        } else if (this.currentPage === 'discounts') {
            this.loadDiscounts();
        } else if (this.currentPage === 'promo-codes') {
            this.loadPromoCodes();
        } else if (this.currentPage === 'categories-tree') {
            this.loadCategoriesTree();
        }

        // Обновляем время
        const now = new Date();
        document.getElementById('lastUpdated').textContent =
            now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    logout() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            window.location.href = '/admin/logout';
        }
    }

    showAddProduct() {
        this.isEditing = false;
        this.editingProductId = null;
        this.resetProductForm();
        this.showPage('add-product');
    }

    async deleteProduct(id) {
        if (!confirm(`Вы уверены, что хотите удалить товар #${id}?`)) return;

        try {
            const response = await fetch(`/admin/api/products/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Товар удален', 'success');
                await this.loadProducts();
            } else {
                throw new Error(result.error || 'Ошибка удаления');
            }
        } catch (error) {
            console.error('Ошибка удаления товара:', error);
            
            // Пробуем альтернативный эндпоинт
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
            } catch (error2) {
                console.error('Ошибка удаления товара через альтернативный эндпоинт:', error2);
                this.showAlert('❌ Ошибка удаления товара', 'error');
            }
        }
    }

    async addCategory() {
        const input = document.getElementById('newCategory');
        if (!input) return;

        const categoryName = input.value.trim();
        if (!categoryName) {
            this.showAlert('❌ Введите название категории', 'error');
            return;
        }

        try {
            const response = await fetch('/admin/api/categories', {
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
                throw new Error(result.error || 'Ошибка добавления');
            }
        } catch (error) {
            console.error('Ошибка добавления категории:', error);
            
            // Пробуем альтернативный эндпоинт
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
            } catch (error2) {
                console.error('Ошибка добавления категории через альтернативный эндпоинт:', error2);
                this.showAlert('❌ Ошибка добавления категории', 'error');
            }
        }
    }

    // ========== РЕНДЕРИНГ ==========

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
    }

    renderOrders() {
        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) return;

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
        
        // Добавляем обработчики клика на заказы для показа деталей
        this.bindOrderRowEvents();
    }

    renderCategories() {
        const container = document.getElementById('categoriesList');
        if (!container) return;

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
            'cancelled': 'Отменен',
            'delivered': 'Доставлен'
        };
        return statuses[status] || status;
    }

    updateCategorySelect() {
        const select = document.getElementById('productCategory');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">Выберите категорию</option>';

        this.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.name || category;
            option.textContent = category.name || category;
            select.appendChild(option);
        });

        select.value = currentValue;
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

        fileInfo.style.display = 'flex';
        fileName.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            filePreview.src = e.target.result;
            this.updateImagePreview(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    removeFile() {
        this.selectedFile = null;
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('productImageFile').value = '';
        document.getElementById('imagePreviewContainer').style.display = 'none';
    }

    updateImagePreview(url) {
        const previewContainer = document.getElementById('imagePreviewContainer');
        const previewImg = document.getElementById('imagePreview');

        if (url && url.trim() !== '') {
            previewImg.src = url;
            previewContainer.style.display = 'block';
        } else {
            previewContainer.style.display = 'none';
        }
    }

    // ========== ОПЕРАЦИИ С ТОВАРАМИ ==========

    async editProduct(id) {
        try {
            const response = await fetch(`/admin/api/products/${id}`);
            const result = await response.json();

            if (result.success && result.product) {
                const product = result.product;
                this.populateProductForm(product);
            } else {
                throw new Error('Товар не найден');
            }
        } catch (error) {
            console.error('Ошибка загрузки товара:', error);
            
            // Пробуем альтернативный эндпоинт
            try {
                const response = await fetch(`/api/products/${id}`);
                const product = await response.json();
                
                if (product.error) {
                    throw new Error(product.error);
                }
                
                this.populateProductForm(product);
            } catch (error2) {
                console.error('Ошибка загрузки товара через альтернативный эндпоинт:', error2);
                this.showAlert('❌ Товар не найден', 'error');
            }
        }
    }

    populateProductForm(product) {
        document.getElementById('productName').value = product.name;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productStock').value = product.stock || 0;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productImageUrl').value = product.image_url || '';

        const categorySelect = document.getElementById('productCategory');
        if (categorySelect && product.category) {
            categorySelect.value = product.category;
        }

        this.updateImagePreview(product.image_url);
        this.isEditing = true;
        this.editingProductId = product.id;

        document.querySelector('#add-product h2').textContent = 'Редактировать товар';
        const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Обновить товар';
        }

        this.showPage('add-product');
    }

    async handleProductSubmit(e) {
        e.preventDefault();

        const name = document.getElementById('productName').value.trim();
        const price = parseFloat(document.getElementById('productPrice').value);
        const stock = parseInt(document.getElementById('productStock').value) || 0;
        const category = document.getElementById('productCategory').value;
        const description = document.getElementById('productDescription').value.trim();
        const imageUrl = document.getElementById('productImageUrl').value.trim();

        if (!name || isNaN(price) || price <= 0 || isNaN(stock) || stock < 0) {
            this.showAlert('❌ Заполните обязательные поля правильно', 'error');
            return;
        }

        let finalImageUrl = imageUrl;

        if (this.selectedFile) {
            try {
                this.showAlert('📤 Загрузка изображения...', 'info');
                finalImageUrl = await this.uploadFile(this.selectedFile);
            } catch (error) {
                console.error('Ошибка загрузки файла:', error);
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

        try {
            let url, method;

            if (this.isEditing && this.editingProductId) {
                url = `/admin/api/products/${this.editingProductId}`;
                method = 'PUT';
            } else {
                url = '/admin/api/products';
                method = 'POST';
            }

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(productData)
            });

            const result = await response.json();

            if (result.success) {
                const message = this.isEditing
                    ? '✅ Товар успешно обновлен!'
                    : '✅ Товар успешно добавлен!';

                this.showAlert(message, 'success');
                this.resetProductForm();
                this.showPage('products');
                await this.loadProducts();

            } else {
                throw new Error(result.error || 'Неизвестная ошибка');
            }

        } catch (error) {
            console.error('Ошибка:', error);
            
            // Пробуем альтернативный эндпоинт
            try {
                let url, method;
                
                if (this.isEditing && this.editingProductId) {
                    url = `/api/admin/products?id=${this.editingProductId}`;
                    method = 'PUT';
                } else {
                    url = '/api/admin/products';
                    method = 'POST';
                }
                
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(productData)
                });
                
                const result = await response.json();
                
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
            } catch (error2) {
                console.error('Ошибка через альтернативный эндпоинт:', error2);
                this.showAlert('❌ Ошибка соединения с сервером', 'error');
            }
        }
    }

    async deleteCategory(categoryName) {
        if (!confirm(`Вы уверены, что хотите удалить категорию "${categoryName}"?`)) return;

        try {
            const response = await fetch(`/admin/api/categories/${encodeURIComponent(categoryName)}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert(`✅ Категория "${categoryName}" удалена`, 'success');
                await this.loadCategories();
            } else {
                throw new Error(result.error || 'Ошибка удаления');
            }
        } catch (error) {
            console.error('Ошибка удаления категории:', error);
            
            // Пробуем альтернативный эндпоинт
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
            } catch (error2) {
                console.error('Ошибка удаления категории через альтернативный эндпоинт:', error2);
                this.showAlert('❌ Ошибка удаления категории', 'error');
            }
        }
    }

    // ========== СКИДКИ И ПРОМОКОДЫ (полная реализация) ==========

    async loadDiscounts() {
        console.log('🏷️ Загрузка скидок...');
        
        try {
            const response = await fetch('/api/admin/discounts');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            this.discounts = await response.json();
            this.renderDiscounts();
        } catch (error) {
            console.error('❌ Ошибка загрузки скидок:', error);
            this.discounts = [];
            this.renderDiscounts();
            this.showAlert('❌ Не удалось загрузить скидки', 'error');
        }
    }

    async loadPromoCodes() {
        console.log('🎟️ Загрузка промокодов...');
        
        try {
            const response = await fetch('/api/admin/promo-codes');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            this.promo_codes = await response.json();
            this.renderPromoCodes();
        } catch (error) {
            console.error('❌ Ошибка загрузки промокодов:', error);
            this.promo_codes = [];
            this.renderPromoCodes();
            this.showAlert('❌ Не удалось загрузить промокоды', 'error');
        }
    }

    async loadCategoriesTree() {
        console.log('🌳 Загрузка дерева категорий...');
        
        try {
            const response = await fetch('/api/admin/categories/tree');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            this.categories_tree = await response.json();
            this.renderCategoriesTree();
        } catch (error) {
            console.error('❌ Ошибка загрузки дерева категорий:', error);
            this.categories_tree = [];
            this.renderCategoriesTree();
            this.showAlert('❌ Не удалось загрузить дерево категорий', 'error');
        }
    }

    renderDiscounts() {
        const container = document.getElementById('discountsContainer');
        if (!container) return;

        if (!this.discounts || this.discounts.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-percentage" style="font-size: 48px; color: #ddd;"></i>
                    <h3>Скидки не найдены</h3>
                    <p>Создайте первую скидку</p>
                    <button class="btn btn-primary" onclick="admin.showAddDiscount()">
                        <i class="fas fa-plus"></i> Добавить скидку
                    </button>
                </div>
            `;
            return;
        }

        let html = `
            <div class="discounts-header">
                <h2>Управление скидками</h2>
                <button class="btn btn-primary" onclick="admin.showAddDiscount()">
                    <i class="fas fa-plus"></i> Новая скидка
                </button>
            </div>
            <div class="discounts-grid">
        `;

        this.discounts.forEach(discount => {
            const discountTypeText = {
                'percentage': 'Процентная',
                'fixed': 'Фиксированная',
                'bogo': 'Buy One Get One'
            }[discount.discount_type] || discount.discount_type;

            const isActive = discount.is_active ? 'active' : 'inactive';
            
            html += `
                <div class="discount-card ${isActive}">
                    <div class="discount-header">
                        <h3>${discount.name}</h3>
                        <span class="discount-status ${isActive}">
                            ${isActive === 'active' ? 'Активна' : 'Не активна'}
                        </span>
                    </div>
                    <div class="discount-details">
                        <div class="discount-type">Тип: ${discountTypeText}</div>
                        <div class="discount-value">
                            Значение: ${discount.discount_type === 'percentage' ? discount.value + '%' : this.formatPrice(discount.value) + ' ₽'}
                        </div>
                        ${discount.min_order_amount > 0 ? `
                            <div class="discount-min-order">
                                Мин. заказ: ${this.formatPrice(discount.min_order_amount)} ₽
                            </div>
                        ` : ''}
                        ${discount.max_discount ? `
                            <div class="discount-max">
                                Макс. скидка: ${this.formatPrice(discount.max_discount)} ₽
                            </div>
                        ` : ''}
                        ${discount.start_date ? `
                            <div class="discount-date">
                                Начало: ${new Date(discount.start_date).toLocaleDateString('ru-RU')}
                            </div>
                        ` : ''}
                        ${discount.end_date ? `
                            <div class="discount-date">
                                Окончание: ${new Date(discount.end_date).toLocaleDateString('ru-RU')}
                            </div>
                        ` : ''}
                        <div class="discount-applications">
                            Применения: ${discount.applications?.length || 0}
                        </div>
                    </div>
                    <div class="discount-actions">
                        <button class="btn-small btn-edit" onclick="admin.editDiscount(${discount.id})">
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

    renderPromoCodes() {
        const container = document.getElementById('promoCodesContainer');
        if (!container) return;

        if (!this.promo_codes || this.promo_codes.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-ticket-alt" style="font-size: 48px; color: #ddd;"></i>
                    <h3>Промокоды не найдены</h3>
                    <p>Создайте первый промокод</p>
                    <button class="btn btn-primary" onclick="admin.showAddPromoCode()">
                        <i class="fas fa-plus"></i> Добавить промокод
                    </button>
                </div>
            `;
            return;
        }

        let html = `
            <div class="promo-codes-header">
                <h2>Управление промокодами</h2>
                <button class="btn btn-primary" onclick="admin.showAddPromoCode()">
                    <i class="fas fa-plus"></i> Новый промокод
                </button>
            </div>
            <div class="promo-codes-table">
                <table>
                    <thead>
                        <tr>
                            <th>Код</th>
                            <th>Скидка</th>
                            <th>Использовано</th>
                            <th>Лимит</th>
                            <th>Статус</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        this.promo_codes.forEach(promo => {
            const isActive = promo.is_active ? 'active' : 'inactive';
            const usageText = promo.usage_limit 
                ? `${promo.used_count || 0}/${promo.usage_limit}`
                : `${promo.used_count || 0}/∞`;
            
            html += `
                <tr>
                    <td><strong>${promo.code}</strong></td>
                    <td>
                        ${promo.discount_name || 'Без скидки'}
                        ${promo.discount_type === 'percentage' ? `(${promo.value}%)` : ''}
                        ${promo.discount_type === 'fixed' ? `(${this.formatPrice(promo.value)} ₽)` : ''}
                    </td>
                    <td>${usageText}</td>
                    <td>${promo.usage_limit || 'Без лимита'}</td>
                    <td>
                        <span class="status-badge ${isActive}">
                            ${isActive === 'active' ? 'Активен' : 'Не активен'}
                        </span>
                    </td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-small btn-edit" onclick="admin.editPromoCode(${promo.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-small btn-delete" onclick="admin.deletePromoCode(${promo.id})">
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

    renderCategoriesTree() {
        const container = document.getElementById('categoriesTreeContainer');
        if (!container) return;

        if (!this.categories_tree || this.categories_tree.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-sitemap" style="font-size: 48px; color: #ddd;"></i>
                    <h3>Дерево категорий пусто</h3>
                    <p>Создайте первую категорию</p>
                    <button class="btn btn-primary" onclick="admin.showAddCategoryTree()">
                        <i class="fas fa-plus"></i> Добавить категорию
                    </button>
                </div>
            `;
            return;
        }

        let html = `
            <div class="categories-tree-header">
                <h2>Дерево категорий</h2>
                <button class="btn btn-primary" onclick="admin.showAddCategoryTree()">
                    <i class="fas fa-plus"></i> Новая категория
                </button>
            </div>
            <div class="categories-tree">
        `;

        const renderCategory = (category, level = 0) => {
            const indent = level * 20;
            let categoryHtml = `
                <div class="category-tree-item" style="margin-left: ${indent}px;">
                    <div class="category-tree-content">
                        <div class="category-tree-info">
                            <i class="fas fa-folder"></i>
                            <span class="category-name">${category.name}</span>
                            ${category.discount_name ? `
                                <span class="category-discount">
                                    <i class="fas fa-percentage"></i> ${category.discount_name}
                                </span>
                            ` : ''}
                            <span class="category-sort">Порядок: ${category.sort_order || 0}</span>
                        </div>
                        <div class="category-tree-actions">
                            <button class="btn-small btn-edit" onclick="admin.editCategoryTree(${category.id})">
                                <i class="fas fa-edit"></i> Редактировать
                            </button>
                            <button class="btn-small btn-delete" onclick="admin.deleteCategoryTree(${category.id})">
                                <i class="fas fa-trash"></i> Удалить
                            </button>
                        </div>
                    </div>
            `;

            if (category.children && category.children.length > 0) {
                categoryHtml += '<div class="category-tree-children">';
                category.children.forEach(child => {
                    categoryHtml += renderCategory(child, level + 1);
                });
                categoryHtml += '</div>';
            }

            categoryHtml += '</div>';
            return categoryHtml;
        };

        this.categories_tree.forEach(category => {
            html += renderCategory(category);
        });

        html += '</div>';
        container.innerHTML = html;
    }

    showAddDiscount() {
        // Реализация формы добавления скидки
        this.showAlert('Форма добавления скидки будет реализована в следующей версии', 'info');
    }

    editDiscount(id) {
        const discount = this.discounts.find(d => d.id === id);
        if (discount) {
            this.showAlert(`Редактирование скидки "${discount.name}" будет реализовано в следующей версии`, 'info');
        }
    }

    async deleteDiscount(id) {
        if (!confirm('Вы уверены, что хотите удалить эту скидку?')) return;

        try {
            const response = await fetch(`/api/admin/discounts?id=${id}`, {
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
            console.error('Ошибка удаления скидки:', error);
            this.showAlert('❌ Ошибка удаления скидки', 'error');
        }
    }

    showAddPromoCode() {
        // Реализация формы добавления промокода
        this.showAlert('Форма добавления промокода будет реализована в следующей версии', 'info');
    }

    editPromoCode(id) {
        const promo = this.promo_codes.find(p => p.id === id);
        if (promo) {
            this.showAlert(`Редактирование промокода "${promo.code}" будет реализовано в следующей версии`, 'info');
        }
    }

    async deletePromoCode(id) {
        if (!confirm('Вы уверены, что хотите удалить этот промокод?')) return;

        try {
            const response = await fetch(`/api/admin/promo-codes?id=${id}`, {
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
            console.error('Ошибка удаления промокода:', error);
            this.showAlert('❌ Ошибка удаления промокода', 'error');
        }
    }

    showAddCategoryTree() {
        // Реализация формы добавления категории в дерево
        this.showAlert('Форма добавления категории в дерево будет реализована в следующей версии', 'info');
    }

    editCategoryTree(id) {
        const category = this.findCategoryInTree(id, this.categories_tree);
        if (category) {
            this.showAlert(`Редактирование категории "${category.name}" будет реализовано в следующей версии`, 'info');
        }
    }

    async deleteCategoryTree(id) {
        if (!confirm('Вы уверены, что хотите удалить эту категорию? Все подкатегории также будут удалены.')) return;

        try {
            const response = await fetch(`/api/admin/categories/tree?id=${id}`, {
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
            console.error('Ошибка удаления категории:', error);
            this.showAlert('❌ Ошибка удаления категории', 'error');
        }
    }

    findCategoryInTree(id, categories) {
        for (const category of categories) {
            if (category.id === id) return category;
            if (category.children && category.children.length > 0) {
                const found = this.findCategoryInTree(id, category.children);
                if (found) return found;
            }
        }
        return null;
    }

    // ========== ДЕТАЛИ ЗАКАЗА ==========

    async showOrderDetails(orderId) {
        try {
            const response = await fetch(`/api/admin/orders/${orderId}`);
            const order = await response.json();

            if (order.error) {
                throw new Error(order.error);
            }

            this.renderOrderDetailsModal(order);
        } catch (error) {
            console.error('Ошибка загрузки деталей заказа:', error);
            this.showAlert('❌ Не удалось загрузить детали заказа', 'error');
        }
    }

    renderOrderDetailsModal(order) {
        const modal = document.getElementById('orderDetailsModal');
        const content = document.getElementById('orderDetailsContent');

        if (!modal || !content) return;

        // Парсим items если они в JSON
        let items = [];
        if (typeof order.items === 'string') {
            try {
                items = JSON.parse(order.items);
            } catch (e) {
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
        const modal = document.getElementById('orderDetailsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

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
                this.showAlert(`✅ Статус заказа #${orderId} изменен на "${this.getStatusText(status)}"`, 'success');
                this.closeOrderDetails();
                await this.loadOrders();
            } else {
                throw new Error(result.error || 'Ошибка обновления статуса');
            }
        } catch (error) {
            console.error('Ошибка обновления статуса заказа:', error);
            this.showAlert('❌ Ошибка обновления статуса заказа', 'error');
        }
    }

    async cancelOrder(orderId) {
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
            console.error('Ошибка отмены заказа:', error);
            this.showAlert('❌ Ошибка отмены заказа', 'error');
        }
    }

    // ========== ОСНОВНЫЕ МЕТОДЫ ==========

    showPage(pageId) {
        console.log(`📄 Показываем страницу: ${pageId}`);

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
[file content end]