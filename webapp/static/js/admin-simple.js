console.log('🚀 Админ панель загружается...');

let currentPage = 'dashboard';
let products = [];
let orders = [];

// ========== ОСНОВНЫЕ ФУНКЦИИ ==========

function showPage(pageId) {
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
        setTimeout(() => targetPage.classList.add('active'), 10);
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
        'add-product': 'Добавить товар'
    };

    const titleElement = document.getElementById('pageTitle');
    if (titleElement && titles[pageId]) {
        titleElement.textContent = titles[pageId];
    }

    currentPage = pageId;

    // Загружаем данные если нужно
    if (pageId === 'dashboard') loadStats();
    if (pageId === 'products') loadProducts();
    if (pageId === 'orders') loadOrders();
    if (pageId === 'add-product') loadCategories();
}

async function loadStats() {
    try {
        console.log('📊 Загрузка статистики...');
        const response = await fetch('/api/admin/dashboard');

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        console.log('📈 Статистика:', data);

        // Обновляем значения
        document.getElementById('totalRevenue').textContent = formatPrice(data.total_revenue || 0) + ' ₽';
        document.getElementById('totalOrders').textContent = data.total_orders || 0;
        document.getElementById('totalProducts').textContent = data.total_products || 0;
        document.getElementById('pendingOrders').textContent = data.pending_orders || 0;

        updateLastUpdated();
        showAlert('✅ Статистика обновлена', 'success');

    } catch (error) {
        console.error('❌ Ошибка загрузки статистики:', error);
        showAlert('❌ Ошибка загрузки статистики', 'error');
    }
}

async function loadProducts() {
    try {
        console.log('🛍️ Загрузка товаров...');
        const response = await fetch('/api/admin/products');
        if (!response.ok) throw new Error('Ошибка загрузки товаров');

        const data = await response.json();
        products = Array.isArray(data) ? data : [];
        renderProducts();

    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        products = [];
        renderProducts();
        showAlert('❌ Ошибка загрузки товаров', 'error');
    }
}

function renderProducts() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    if (products.length === 0) {
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
    products.forEach(product => {
        const stockClass = product.stock > 20 ? 'stock-high' : product.stock > 5 ? 'stock-medium' : 'stock-low';
        const stockText = product.stock > 20 ? 'Много' : product.stock > 5 ? 'Мало' : 'Очень мало';

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
                <td><strong>${formatPrice(product.price)} ₽</strong></td>
                <td>
                    <span class="stock-indicator ${stockClass}" style="padding: 4px 12px; border-radius: 12px; font-size: 12px;">
                        ${product.stock} шт. (${stockText})
                    </span>
                </td>
                <td>${product.category || '—'}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-icon btn-edit" onclick="editProduct(${product.id})" style="
                            width: 36px; height: 36px; border-radius: 8px; border: none; cursor: pointer;
                            background: #3498db; color: white; display: flex; align-items: center; justify-content: center;
                        ">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon btn-delete" onclick="deleteProduct(${product.id})" style="
                            width: 36px; height: 36px; border-radius: 8px; border: none; cursor: pointer;
                            background: #e74c3c; color: white; display: flex; align-items: center; justify-content: center;
                        ">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function loadOrders() {
    try {
        console.log('📋 Загрузка заказов...');
        const response = await fetch('/api/admin/orders');
        if (!response.ok) throw new Error('Ошибка загрузки заказов');

        const data = await response.json();
        orders = Array.isArray(data) ? data : [];
        renderOrders();

    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
        orders = [];
        renderOrders();
    }
}

function renderOrders() {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;

    if (!orders || orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px;">
                    <i class="fas fa-clipboard-list" style="font-size: 48px; color: #ddd;"></i>
                    <p style="margin-top: 15px;">Заказы не найдены</p>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    orders.forEach(order => {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        const itemCount = Array.isArray(items) ? items.length : 0;
        const status = order.status || 'pending';

        const statusText = {
            'pending': 'Ожидает',
            'processing': 'В обработке',
            'completed': 'Завершен',
            'cancelled': 'Отменен'
        }[status] || status;

        html += `
            <tr>
                <td><strong>#${order.id}</strong></td>
                <td>${order.username || `Пользователь ${order.user_id}`}</td>
                <td>${itemCount} товаров</td>
                <td><strong>${formatPrice(order.total_price)} ₽</strong></td>
                <td>${statusText}</td>
                <td>${new Date(order.created_at).toLocaleDateString('ru-RU')}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function loadCategories() {
    try {
        console.log('📂 Загрузка категорий...');
        const response = await fetch('/api/admin/categories/manage');
        if (!response.ok) throw new Error('Ошибка сервера');

        const categories = await response.json();
        console.log('✅ Категории загружены:', categories);

        renderCategoriesList(categories);
        updateCategorySelect(categories);

    } catch (error) {
        console.error('❌ Ошибка загрузки категорий:', error);
        document.getElementById('categoriesList').innerHTML =
            '<p style="color: #dc3545; text-align: center;">Ошибка загрузки категорий</p>';
    }
}

function renderCategoriesList(categories) {
    const list = document.getElementById('categoriesList');
    if (!list) return;

    if (!categories || categories.length === 0) {
        list.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">Категорий пока нет</p>';
        return;
    }

    let html = '';
    categories.forEach(category => {
        html += `
            <div class="category-tag">
                <span>${category}</span>
                <button onclick="deleteCategory('${category}')" title="Удалить категорию">
                    ×
                </button>
            </div>
        `;
    });

    list.innerHTML = html;
}

function updateCategorySelect(categories) {
    const select = document.getElementById('productCategory');
    if (!select) return;

    let options = '<option value="">Выберите категорию</option>';
    categories.forEach(category => {
        options += `<option value="${category}">${category}</option>`;
    });
    select.innerHTML = options;
}

async function addCategory() {
    const input = document.getElementById('newCategory');
    const categoryName = input.value.trim();

    if (!categoryName) {
        showAlert('❌ Введите название категории', 'error');
        return;
    }

    if (categoryName.length < 2) {
        showAlert('❌ Название должно быть не менее 2 символов', 'error');
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
            showAlert(`✅ Категория "${categoryName}" успешно создана!`, 'success');
            input.value = '';

            // Перезагружаем категории
            setTimeout(() => loadCategories(), 500);

        } else {
            showAlert(`❌ Ошибка: ${result.error || 'Неизвестная ошибка'}`, 'error');
        }

    } catch (error) {
        console.error('Ошибка добавления категории:', error);
        showAlert('❌ Ошибка соединения с сервером', 'error');
    }
}

async function deleteCategory(categoryName) {
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
            showAlert(`✅ Категория "${categoryName}" удалена`, 'success');
            setTimeout(() => loadCategories(), 500);

        } else {
            showAlert(`❌ Ошибка: ${result.error || 'Неизвестная ошибка'}`, 'error');
        }

    } catch (error) {
        console.error('Ошибка удаления категории:', error);
        showAlert('❌ Ошибка соединения с сервером', 'error');
    }
}

async function addProduct(e) {
    if (e) e.preventDefault();

    console.log('➕ Добавление товара...');

    const name = document.getElementById('productName').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const stock = parseInt(document.getElementById('productStock').value);
    const category = document.getElementById('productCategory').value;
    const description = document.getElementById('productDescription').value.trim();
    const imageUrl = document.getElementById('productImageUrl').value.trim();

    // Валидация
    if (!name || isNaN(price) || price <= 0 || isNaN(stock) || stock < 0) {
        showAlert('❌ Заполните обязательные поля правильно', 'error');
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

        if (result.success) {
            showAlert('✅ Товар успешно добавлен!', 'success');

            // Очищаем форму
            document.getElementById('addProductForm').reset();
            document.getElementById('productImageUrl').value = 'https://via.placeholder.com/300x200';
            previewImage('https://via.placeholder.com/300x200');

            // Переходим к списку
            showPage('products');
            loadProducts();
        } else {
            showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showAlert('❌ Ошибка соединения с сервером', 'error');
    }
}

async function deleteProduct(id) {
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
            showAlert('✅ Товар удален!', 'success');
            loadProducts();
        } else {
            showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showAlert('❌ Ошибка удаления товара', 'error');
    }
}

async function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) {
        showAlert('❌ Товар не найден', 'error');
        return;
    }

    console.log('✏️ Редактирование товара #' + id);

    // Заполняем форму данными товара
    document.getElementById('productName').value = product.name;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productStock').value = product.stock;
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productImageUrl').value = product.image_url || '';

    // Обновляем категорию
    if (product.category) {
        const select = document.getElementById('productCategory');
        if (select) {
            select.value = product.category;
        }
    }

    // Показываем превью
    previewImage(product.image_url || 'https://via.placeholder.com/300x200');

    // Переходим на страницу добавления товара
    showPage('add-product');

    // Меняем текст кнопки
    const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
    submitBtn.innerHTML = '<i class="fas fa-save"></i> Обновить товар';

    // Сохраняем ID для обновления
    submitBtn.onclick = async function(e) {
        e.preventDefault();

        const updatedData = {
            name: document.getElementById('productName').value.trim(),
            description: document.getElementById('productDescription').value.trim(),
            price: parseFloat(document.getElementById('productPrice').value),
            stock: parseInt(document.getElementById('productStock').value),
            category: document.getElementById('productCategory').value,
            image_url: document.getElementById('productImageUrl').value.trim()
        };

        try {
            const response = await fetch(`/api/admin/products?id=${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedData)
            });

            const result = await response.json();

            if (result.success) {
                showAlert('✅ Товар успешно обновлен!', 'success');

                // Сбрасываем форму
                document.getElementById('addProductForm').reset();
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Сохранить товар';
                submitBtn.onclick = addProduct;

                // Переходим к списку
                showPage('products');
                loadProducts();
            } else {
                showAlert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('Ошибка обновления:', error);
            showAlert('❌ Ошибка обновления товара', 'error');
        }
    };
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU').format(price || 0);
}

function updateLastUpdated() {
    const element = document.getElementById('lastUpdated');
    if (element) {
        const now = new Date();
        element.textContent = now.toLocaleTimeString('ru-RU');
    }
}

function previewImage(url) {
    const preview = document.getElementById('imagePreview');
    if (!preview) return;

    if (!url || url.trim() === '') {
        url = 'https://via.placeholder.com/300x200';
    }

    preview.innerHTML = `
        <img src="${url}" alt="Превью"
             style="max-width: 100%; max-height: 200px; border-radius: 8px;"
             onerror="this.onerror=null; this.src='https://via.placeholder.com/300x200'">
        <p style="margin-top: 10px; color: #7f8c8d;">Изображение товара</p>
    `;
}

async function uploadImage(file) {
    console.log('📤 Загрузка изображения:', file.name);

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch('/api/upload-image', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            console.log('✅ Изображение загружено:', result.url);
            document.getElementById('productImageUrl').value = result.url;
            previewImage(result.url);
            showAlert('✅ Изображение успешно загружено!', 'success');
        } else {
            throw new Error(result.error || 'Неизвестная ошибка');
        }

    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
        showAlert('❌ Ошибка загрузки изображения: ' + error.message, 'error');
    }
}

function showAlert(message, type = 'info') {
    const colors = {
        'success': '#2ecc71',
        'error': '#e74c3c',
        'info': '#3498db',
        'warning': '#f39c12'
    };

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
        font-weight: 500;
    `;

    document.body.appendChild(alert);

    setTimeout(() => {
        alert.style.animation = 'alertSlideOut 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM загружен, инициализируем...');

    // Назначаем обработчики навигации
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const pageId = this.getAttribute('data-page');
            showPage(pageId);
        });
    });

    // Кнопки
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        if (currentPage === 'dashboard') loadStats();
        if (currentPage === 'products') loadProducts();
        if (currentPage === 'orders') loadOrders();
        showAlert('🔄 Данные обновляются...', 'info');
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите выйти?')) {
            window.location.href = '/';
        }
    });

    document.getElementById('addProductBtn')?.addEventListener('click', () => {
        showPage('add-product');
    });

    document.getElementById('cancelAdd')?.addEventListener('click', () => {
        showPage('products');
    });

    // Управление категориями
    document.getElementById('addCategoryBtn')?.addEventListener('click', addCategory);
    document.getElementById('newCategory')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCategory();
        }
    });

    // Загрузка изображений
    const imageUploadArea = document.getElementById('imageUploadArea');
    const imageFileInput = document.getElementById('imageFileInput');

    if (imageUploadArea && imageFileInput) {
        imageUploadArea.addEventListener('click', () => imageFileInput.click());

        imageUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageUploadArea.style.borderColor = '#2ecc71';
        });

        imageUploadArea.addEventListener('dragleave', () => {
            imageUploadArea.style.borderColor = '#3498db';
        });

        imageUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            imageUploadArea.style.borderColor = '#3498db';

            if (e.dataTransfer.files.length) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith('image/')) {
                    uploadImage(file);
                } else {
                    showAlert('❌ Выберите файл изображения', 'error');
                }
            }
        });

        imageFileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                const file = e.target.files[0];
                if (file.type.startsWith('image/')) {
                    uploadImage(file);
                } else {
                    showAlert('❌ Выберите файл изображения', 'error');
                }
            }
        });
    }

    // Превью изображения
    document.getElementById('productImageUrl')?.addEventListener('input', function(e) {
        previewImage(e.target.value);
    });

    // Форма добавления товара
    document.getElementById('addProductForm')?.addEventListener('submit', addProduct);

    // Показываем первую страницу
    showPage('dashboard');

    console.log('🚀 Админ панель готова!');
});

// Добавляем глобальные функции
window.showPage = showPage;
window.loadCategories = loadCategories;
window.addCategory = addCategory;
window.deleteCategory = deleteCategory;
window.loadProducts = loadProducts;
window.showAlert = showAlert;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.addProduct = addProduct;