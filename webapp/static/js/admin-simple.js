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
            this.products = [];
            this.renderProducts();
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
            this.orders = [];
            this.renderOrders();
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
            this.categories = [];
            this.renderCategories();
        }
    }

    async loadDashboardData() {
        console.log('📊 Загрузка статистики...');

        try {
            const response = await fetch('/admin/api/stats');
            const result = await response.json();

            if (result.success) {
                document.getElementById('totalRevenue').textContent = (result.total_revenue || 0) + ' ₽';
                document.getElementById('totalOrders').textContent = result.total_orders || 0;
                document.getElementById('totalProducts').textContent = result.total_products || 0;
                document.getElementById('pendingOrders').textContent = result.pending_orders || 0;

                // Обновляем время
                const now = new Date();
                document.getElementById('lastUpdated').textContent =
                    now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            }
        } catch (error) {
            console.error('Ошибка загрузки статистики:', error);
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
                this.showAlert('❌ Ошибка удаления товара: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('Ошибка удаления товара:', error);
            this.showAlert('❌ Ошибка удаления товара', 'error');
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
                this.showAlert('❌ Ошибка добавления категории: ' + (result.error || ''), 'error');
            }
        } catch (error) {
            console.error('Ошибка добавления категории:', error);
            this.showAlert('❌ Ошибка добавления категории', 'error');
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
                    <button class="btn-small btn-delete" onclick="admin.deleteCategory(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
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
                this.editingProductId = id;

                document.querySelector('#add-product h2').textContent = 'Редактировать товар';
                const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-save"></i> Обновить товар';
                }

                this.showPage('add-product');
            } else {
                this.showAlert('❌ Товар не найден', 'error');
            }
        } catch (error) {
            console.error('Ошибка загрузки товара:', error);
            this.showAlert('❌ Ошибка загрузки данных товара', 'error');
        }
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
                this.showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }

        } catch (error) {
            console.error('Ошибка:', error);
            this.showAlert('❌ Ошибка соединения с сервером', 'error');
        }
    }

    async deleteCategory(index) {
        const category = this.categories[index];
        if (!category) return;

        const categoryName = category.name || category;
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
                this.showAlert('❌ Ошибка удаления категории', 'error');
            }
        } catch (error) {
            console.error('Ошибка удаления категории:', error);
            this.showAlert('❌ Ошибка удаления категории', 'error');
        }
    }

    // ========== СКИДКИ И ПРОМОКОДЫ (заглушки) ==========

    async loadDiscounts() {
        console.log('🏷️ Загрузка скидок...');
        // TODO: Реализовать
        this.showAlert('Функция скидок в разработке', 'info');
    }

    async loadPromoCodes() {
        console.log('🎟️ Загрузка промокодов...');
        // TODO: Реализовать
        this.showAlert('Функция промокодов в разработке', 'info');
    }

    async loadCategoriesTree() {
        console.log('🌳 Загрузка дерева категорий...');
        // TODO: Реализовать
        this.showAlert('Функция дерева категорий в разработке', 'info');
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