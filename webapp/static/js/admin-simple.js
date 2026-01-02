// Telegram Shop Админ Панель - Расширенная версия с весовыми товарами и скидками
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

        // Новые свойства для весовых товаров и скидок
        this.discounts = [];
        this.promo_codes = [];
        this.categories_tree = [];
        this.selectedDiscount = null;

        // Режим товара: 'piece' (штучный) или 'weight' (весовой)
        this.productMode = 'piece';

        console.log('✅ Админ панель инициализирована');
        this.init();
    }

    init() {
        this.bindEvents();
        this.bindFileUploadEvents();
        this.addAlertStyles();
        this.addProductModeToggle();
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

        // ДОБАВЛЯЕМ НОВЫЕ ССЫЛКИ В НАВИГАЦИЮ
        this.addNavigationLinks();

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

    // ========== НОВЫЕ МЕТОДЫ ДЛЯ ВЕСОВЫХ ТОВАРОВ И СКИДОК ==========

    addNavigationLinks() {
        // Добавляем новые ссылки в сайдбар если их еще нет
        const nav = document.querySelector('.admin-nav');
        if (!nav) return;

        // Проверяем, есть ли уже ссылки на скидки
        if (!nav.querySelector('[data-page="discounts"]')) {
            nav.innerHTML += `
                <a href="#" class="nav-item" data-page="discounts">
                    <i class="fas fa-percentage"></i>
                    <span>Скидки</span>
                </a>
                <a href="#" class="nav-item" data-page="promo-codes">
                    <i class="fas fa-ticket-alt"></i>
                    <span>Промокоды</span>
                </a>
                <a href="#" class="nav-item" data-page="categories-tree">
                    <i class="fas fa-sitemap"></i>
                    <span>Дерево категорий</span>
                </a>
            `;
        }
    }

    addProductModeToggle() {
        // Добавляем переключатель типа товара в форму
        const form = document.getElementById('addProductForm');
        if (!form) return;

        // Находим секцию с основной информацией
        const mainSection = form.querySelector('.form-section:first-child');
        if (mainSection) {
            // Добавляем переключатель после заголовка
            const toggleHTML = `
                <div class="form-group">
                    <label>Тип товара:</label>
                    <div class="product-mode-toggle">
                        <button type="button" class="mode-btn ${this.productMode === 'piece' ? 'active' : ''}"
                                onclick="admin.setProductMode('piece')">
                            <i class="fas fa-cube"></i> Штучный
                        </button>
                        <button type="button" class="mode-btn ${this.productMode === 'weight' ? 'active' : ''}"
                                onclick="admin.setProductMode('weight')">
                            <i class="fas fa-weight-hanging"></i> Весовой
                        </button>
                    </div>
                </div>
            `;

            // Вставляем после первого form-group
            const firstFormGroup = mainSection.querySelector('.form-group:first-child');
            if (firstFormGroup) {
                firstFormGroup.insertAdjacentHTML('afterend', toggleHTML);
            } else {
                mainSection.querySelector('.form-grid')?.insertAdjacentHTML('beforebegin', toggleHTML);
            }
        }

        // Добавляем стили для переключателя
        if (!document.getElementById('product-mode-styles')) {
            const style = document.createElement('style');
            style.id = 'product-mode-styles';
            style.textContent = `
                .product-mode-toggle {
                    display: flex;
                    gap: 10px;
                    margin-top: 10px;
                }

                .mode-btn {
                    flex: 1;
                    padding: 12px 20px;
                    border: 2px solid #e9ecef;
                    border-radius: 10px;
                    background: white;
                    color: #495057;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: all 0.3s;
                }

                .mode-btn:hover {
                    border-color: #667eea;
                    color: #667eea;
                }

                .mode-btn.active {
                    background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%);
                    border-color: #667eea;
                    color: white;
                }

                .weight-fields {
                    display: none;
                }

                .weight-fields.active {
                    display: block;
                }
            `;
            document.head.appendChild(style);
        }
    }

    setProductMode(mode) {
        this.productMode = mode;

        // Обновляем активные кнопки
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`.mode-btn[onclick*="${mode}"]`)?.classList.add('active');

        // Показываем/скрываем поля для весового товара
        const weightFields = document.querySelector('.weight-fields');
        if (!weightFields) {
            this.createWeightFields();
        } else {
            if (mode === 'weight') {
                weightFields.classList.add('active');
            } else {
                weightFields.classList.remove('active');
            }
        }
    }

    createWeightFields() {
        // Находим форму и добавляем поля для весового товара
        const form = document.getElementById('addProductForm');
        if (!form) return;

        // Находим секцию с ценой
        const priceSection = form.querySelector('.form-section:nth-child(2)');
        if (!priceSection) return;

        // Добавляем поля для весового товара
        const weightFieldsHTML = `
            <div class="weight-fields ${this.productMode === 'weight' ? 'active' : ''}">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="pricePerUnit">Цена за единицу (₽)</label>
                        <input type="number" id="pricePerUnit" step="0.01" placeholder="150">
                        <small>Цена за кг/литр/метр</small>
                    </div>

                    <div class="form-group">
                        <label for="unit">Единица измерения</label>
                        <select id="unit">
                            <option value="кг">Килограмм (кг)</option>
                            <option value="г">Грамм (г)</option>
                            <option value="л">Литр (л)</option>
                            <option value="мл">Миллилитр (мл)</option>
                            <option value="м">Метр (м)</option>
                            <option value="см">Сантиметр (см)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="minWeight">Минимальный вес</label>
                        <input type="number" id="minWeight" step="0.001" value="0.1" placeholder="0.1">
                        <small>Минимальное количество для заказа</small>
                    </div>

                    <div class="form-group">
                        <label for="stepWeight">Шаг взвешивания</label>
                        <input type="number" id="stepWeight" step="0.001" value="0.1" placeholder="0.1">
                        <small>С каким шагом можно заказывать</small>
                    </div>
                </div>
            </div>
        `;

        // Вставляем после основной цены
        const priceGrid = priceSection.querySelector('.form-grid');
        if (priceGrid) {
            priceGrid.insertAdjacentHTML('afterend', weightFieldsHTML);
        }
    }

    // ========== ОБНОВЛЕННЫЙ МЕТОД РЕНДЕРИНГА ТОВАРОВ ==========

    renderProducts() {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        if (!this.products || this.products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px;">
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

            // Определяем тип товара
            const productType = product.product_type || 'piece';
            const unit = product.unit || (productType === 'weight' ? 'кг' : 'шт');
            const stockDisplay = productType === 'weight'
                ? `${product.stock_weight || 0} ${unit}`
                : `${product.stock} ${unit}`;

            // Определяем цену
            let priceDisplay = `${this.formatPrice(product.price)} ₽`;
            if (productType === 'weight' && product.price_per_unit) {
                priceDisplay = `${this.formatPrice(product.price_per_unit)} ₽/${unit}`;
            }

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
                        <div style="font-size: 12px; color: #667eea; margin-top: 5px;">
                            <i class="fas ${productType === 'weight' ? 'fa-weight-hanging' : 'fa-cube'}"></i>
                            ${productType === 'weight' ? 'Весовой товар' : 'Штучный товар'}
                        </div>
                    </td>
                    <td style="font-weight: 700; color: #667eea;">${priceDisplay}</td>
                    <td>
                        <span class="stock-indicator ${stockClass}">
                            <i class="fas ${(product.stock > 0 || product.stock_weight > 0) ? 'fa-box' : 'fa-box-open'}"></i>
                            ${stockDisplay}
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

    // ========== ОБНОВЛЕННЫЙ МЕТОД EDITPRODUCT ==========

    editProduct(id) {
        const product = this.products.find(p => p.id === id);
        if (!product) {
            this.showAlert('❌ Товар не найден', 'error');
            return;
        }

        console.log(`✏️ Редактирование товара #${id}`);

        // Определяем тип товара
        const productType = product.product_type || 'piece';
        this.setProductMode(productType);

        // Заполняем форму
        document.getElementById('productName').value = product.name;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productStock').value = product.stock || 0;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productImageUrl').value = product.image_url || '';

        // Заполняем поля для весового товара
        if (productType === 'weight') {
            document.getElementById('pricePerUnit').value = product.price_per_unit || product.price;
            document.getElementById('unit').value = product.unit || 'кг';
            document.getElementById('minWeight').value = product.min_weight || 0.1;
            document.getElementById('stepWeight').value = product.step_weight || 0.1;
        }

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


    bindFileUploadEvents() {
        console.log('📁 Настраиваем загрузку файлов...');

        const fileUploadArea = document.getElementById('fileUploadArea');
        const fileInput = document.getElementById('productImageFile');

        if (!fileUploadArea || !fileInput) {
            console.log('ℹ️ Элементы загрузки файлов не найдены');
            return;
        }

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
        fileUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploadArea.classList.add('dragover');
        });

        fileUploadArea.addEventListener('dragleave', () => {
            fileUploadArea.classList.remove('dragover');
        });

        fileUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploadArea.classList.remove('dragover');

            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleFileSelect(file);
            } else {
                this.showAlert('❌ Пожалуйста, выберите изображение', 'error');
            }
        });
    }

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

        // Показываем информацию о файле
        document.getElementById('fileInfo').style.display = 'flex';
        document.getElementById('fileName').textContent = file.name;

        // Показываем превью
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('filePreview').src = e.target.result;
            this.updateImagePreview(e.target.result);
        };
        reader.readAsDataURL(file);

        // Устанавливаем тип источника как "файл"
        this.imageSourceType = 'file';
        this.updateImageSourceUI();
    }

    updateImageSourceUI() {
        // Обновляем UI в зависимости от выбранного типа источника
        const toggleOptions = document.querySelectorAll('.toggle-option input[type="radio"]');
        toggleOptions.forEach(option => {
            option.checked = option.value === this.imageSourceType;
        });
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

    // ========== ОБНОВЛЕННЫЙ МЕТОД HANDLEPRODUCTSUBMIT ==========

    async handleProductSubmit(e) {
        e.preventDefault();

        const name = document.getElementById('productName').value.trim();
        const price = parseFloat(document.getElementById('productPrice').value);
        const stock = parseInt(document.getElementById('productStock').value) || 0;
        const category = document.getElementById('productCategory').value;
        const description = document.getElementById('productDescription').value.trim();
        const imageUrl = document.getElementById('productImageUrl').value.trim();

        // Валидация
        if (!name || isNaN(price) || price <= 0) {
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

        // Подготавливаем данные в зависимости от типа товара
        let productData = {
            name: name,
            description: description,
            price: price,
            stock: stock,
            category: category,
            image_url: finalImageUrl,
            product_type: this.productMode
        };

        // Добавляем данные для весового товара
        if (this.productMode === 'weight') {
            const pricePerUnit = parseFloat(document.getElementById('pricePerUnit').value) || price;
            const unit = document.getElementById('unit').value;
            const minWeight = parseFloat(document.getElementById('minWeight').value) || 0.1;
            const stepWeight = parseFloat(document.getElementById('stepWeight').value) || 0.1;

            productData = {
                ...productData,
                unit: unit,
                price_per_unit: pricePerUnit,
                min_weight: minWeight,
                step_weight: stepWeight,
                stock_weight: stock // Для весовых используем stock_weight
            };
        }

        console.log('📤 Отправляем товар:', productData);

        try {
            let response;

            if (this.isEditing && this.editingProductId) {
                // Редактирование существующего товара с новым API
                response = await fetch(`/api/admin/products/update?id=${this.editingProductId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(productData)
                });
            } else {
                // Создание нового товара с новым API
                response = await fetch('/api/admin/products/create', {
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

    // ========== НОВЫЕ МЕТОДЫ ДЛЯ СКИДОК ==========

    async loadDiscounts() {
        try {
            console.log('🏷️ Загрузка скидок...');
            const response = await fetch('/api/admin/discounts');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.discounts = await response.json();
            this.renderDiscounts();

        } catch (error) {
            console.error('Ошибка загрузки скидок:', error);
            this.discounts = [];
            this.renderDiscounts();
        }
    }

    renderDiscounts() {
        const container = document.getElementById('discountsContainer');
        if (!container) return;

        if (!this.discounts || this.discounts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-percentage"></i>
                    <h3>Скидок пока нет</h3>
                    <p>Создайте первую скидку</p>
                    <button class="btn btn-primary" onclick="admin.showCreateDiscountForm()">
                        <i class="fas fa-plus"></i> Создать скидку
                    </button>
                </div>
            `;
            return;
        }

        let html = `
            <div class="discounts-header">
                <h3>Активные скидки</h3>
                <button class="btn btn-primary" onclick="admin.showCreateDiscountForm()">
                    <i class="fas fa-plus"></i> Новая скидка
                </button>
            </div>
            <div class="discounts-grid">
        `;

        this.discounts.forEach(discount => {
            const discountTypeText = {
                'percentage': '%',
                'fixed': '₽',
                'bogo': '1+1'
            }[discount.discount_type] || discount.discount_type;

            const valueDisplay = discount.discount_type === 'percentage'
                ? `${discount.value}%`
                : `${this.formatPrice(discount.value)} ₽`;

            const statusClass = discount.is_active ? 'active' : 'inactive';
            const statusText = discount.is_active ? 'Активна' : 'Неактивна';

            let applicationsText = '';
            if (discount.applications && discount.applications.length > 0) {
                const app = discount.applications[0];
                if (app.apply_to_all) {
                    applicationsText = 'На все товары';
                } else if (app.product_id) {
                    applicationsText = 'На конкретный товар';
                } else if (app.category) {
                    applicationsText = `На категорию: ${app.category}`;
                }
            }

            html += `
                <div class="discount-card ${statusClass}">
                    <div class="discount-header">
                        <div class="discount-type-badge ${discount.discount_type}">
                            ${discountTypeText}
                        </div>
                        <div class="discount-actions">
                            <button class="btn-icon btn-edit" onclick="admin.editDiscount(${discount.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-delete" onclick="admin.deleteDiscount(${discount.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <div class="discount-body">
                        <h4>${discount.name}</h4>
                        <div class="discount-value">${valueDisplay}</div>
                        <div class="discount-info">
                            <p><i class="fas fa-tag"></i> ${applicationsText || 'Без применения'}</p>
                            <p><i class="fas fa-clock"></i> Срок: ${discount.start_date ? new Date(discount.start_date).toLocaleDateString('ru-RU') : 'Не ограничен'}</p>
                        </div>
                    </div>

                    <div class="discount-footer">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        <span class="discount-id">ID: ${discount.id}</span>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    // ========== ОБНОВЛЕННЫЙ МЕТОД SHOWPAGE ==========

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
        if (pageId === 'products') {
            this.loadProducts();
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

    // ========== НОВЫЕ МЕТОДЫ ДЛЯ РАБОТЫ СО СКИДКАМИ ==========

    showCreateDiscountForm() {
        const container = document.getElementById('discountsContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="create-discount-form">
                <div class="form-header">
                    <h3><i class="fas fa-plus-circle"></i> Создать новую скидку</h3>
                    <button class="btn btn-outline" onclick="admin.showDiscountsPage()">
                        <i class="fas fa-arrow-left"></i> Назад
                    </button>
                </div>

                <form id="discountForm" onsubmit="event.preventDefault(); admin.saveDiscount()">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="discountName">Название скидки *</label>
                            <input type="text" id="discountName" required placeholder="Летняя распродажа">
                        </div>

                        <div class="form-group">
                            <label for="discountType">Тип скидки *</label>
                            <select id="discountType" required>
                                <option value="">Выберите тип</option>
                                <option value="percentage">Процентная (%)</option>
                                <option value="fixed">Фиксированная сумма (₽)</option>
                                <option value="bogo">1+1 (два по цене одного)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="discountValue">Значение скидки *</label>
                            <input type="number" id="discountValue" step="0.01" required placeholder="15">
                            <small id="valueHelp">Для %: 15 = 15%</small>
                        </div>

                        <div class="form-group">
                            <label for="maxDiscount">Максимальная сумма скидки</label>
                            <input type="number" id="maxDiscount" step="0.01" placeholder="1000">
                            <small>Оставьте пустым, если нет ограничения</small>
                        </div>
                    </div>

                    <div class="form-section">
                        <h4>Условия применения</h4>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="minOrderAmount">Минимальная сумма заказа</label>
                                <input type="number" id="minOrderAmount" step="0.01" placeholder="0">
                                <small>0 = без ограничений</small>
                            </div>

                            <div class="form-group">
                                <label for="startDate">Дата начала</label>
                                <input type="datetime-local" id="startDate">
                            </div>

                            <div class="form-group">
                                <label for="endDate">Дата окончания</label>
                                <input type="datetime-local" id="endDate">
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h4>Применение скидки</h4>
                        <div class="form-group">
                            <div class="radio-group">
                                <label>
                                    <input type="radio" name="applyTo" value="all" checked>
                                    <span>На все товары</span>
                                </label>
                                <label>
                                    <input type="radio" name="applyTo" value="category">
                                    <span>На категорию</span>
                                </label>
                                <label>
                                    <input type="radio" name="applyTo" value="product">
                                    <span>На конкретный товар</span>
                                </label>
                            </div>
                        </div>

                        <div class="form-group" id="categorySelect" style="display: none;">
                            <label for="selectedCategory">Выберите категорию</label>
                            <select id="selectedCategory">
                                <option value="">Выберите категорию</option>
                            </select>
                        </div>

                        <div class="form-group" id="productSelect" style="display: none;">
                            <label for="selectedProduct">Выберите товар</label>
                            <select id="selectedProduct">
                                <option value="">Выберите товар</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="admin.showDiscountsPage()">
                            Отмена
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Сохранить скидку
                        </button>
                    </div>
                </form>
            </div>
        `;

        // Назначаем обработчики для переключателей
        document.querySelectorAll('input[name="applyTo"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                document.getElementById('categorySelect').style.display = 'none';
                document.getElementById('productSelect').style.display = 'none';

                if (e.target.value === 'category') {
                    document.getElementById('categorySelect').style.display = 'block';
                    this.loadCategoriesForDiscount();
                } else if (e.target.value === 'product') {
                    document.getElementById('productSelect').style.display = 'block';
                    this.loadProductsForDiscount();
                }
            });
        });

        // Обновляем подсказку при изменении типа скидки
        document.getElementById('discountType').addEventListener('change', (e) => {
            const helpText = document.getElementById('valueHelp');
            if (e.target.value === 'percentage') {
                helpText.textContent = 'Для %: 15 = 15%';
            } else if (e.target.value === 'fixed') {
                helpText.textContent = 'Сумма в рублях: 100 = 100 ₽';
            } else if (e.target.value === 'bogo') {
                helpText.textContent = 'Для 1+1 оставьте 0';
            }
        });
    }

    async loadCategoriesForDiscount() {
        try {
            const response = await fetch('/api/admin/categories/manage');
            const categories = await response.json();

            const select = document.getElementById('selectedCategory');
            select.innerHTML = '<option value="">Выберите категорию</option>';

            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Ошибка загрузки категорий:', error);
        }
    }

    async loadProductsForDiscount() {
        try {
            const response = await fetch('/api/admin/products');
            const products = await response.json();

            const select = document.getElementById('selectedProduct');
            select.innerHTML = '<option value="">Выберите товар</option>';

            products.forEach(product => {
                const option = document.createElement('option');
                option.value = product.id;
                option.textContent = `${product.name} (${this.formatPrice(product.price)} ₽)`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Ошибка загрузки товаров:', error);
        }
    }

    async saveDiscount() {
        try {
            const name = document.getElementById('discountName').value.trim();
            const discountType = document.getElementById('discountType').value;
            const value = parseFloat(document.getElementById('discountValue').value);
            const maxDiscount = document.getElementById('maxDiscount').value ? parseFloat(document.getElementById('maxDiscount').value) : null;
            const minOrderAmount = document.getElementById('minOrderAmount').value ? parseFloat(document.getElementById('minOrderAmount').value) : 0;
            const startDate = document.getElementById('startDate').value || null;
            const endDate = document.getElementById('endDate').value || null;
            const applyTo = document.querySelector('input[name="applyTo"]:checked').value;

            // Валидация
            if (!name || !discountType || isNaN(value) || value < 0) {
                this.showAlert('❌ Заполните обязательные поля правильно', 'error');
                return;
            }

            // Подготавливаем данные применения
            const applications = [];
            let applicationData = { apply_to_all: false };

            if (applyTo === 'all') {
                applicationData.apply_to_all = true;
            } else if (applyTo === 'category') {
                const category = document.getElementById('selectedCategory').value;
                if (!category) {
                    this.showAlert('❌ Выберите категорию', 'error');
                    return;
                }
                applicationData.category = category;
            } else if (applyTo === 'product') {
                const productId = document.getElementById('selectedProduct').value;
                if (!productId) {
                    this.showAlert('❌ Выберите товар', 'error');
                    return;
                }
                applicationData.product_id = parseInt(productId);
            }

            applications.push(applicationData);

            const discountData = {
                name: name,
                discount_type: discountType,
                value: value,
                max_discount: maxDiscount,
                min_order_amount: minOrderAmount,
                start_date: startDate,
                end_date: endDate,
                is_active: true,
                applications: applications
            };

            console.log('📤 Отправляем скидку:', discountData);

            const response = await fetch('/api/admin/discounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(discountData)
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('✅ Скидка успешно создана!', 'success');
                this.showDiscountsPage();
                await this.loadDiscounts();
            } else {
                this.showAlert(`❌ Ошибка: ${result.error || 'Неизвестная ошибка'}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка создания скидки:', error);
            this.showAlert('❌ Ошибка создания скидки', 'error');
        }
    }

    showDiscountsPage() {
        // Создаем контейнер для страницы скидок если его нет
        const content = document.querySelector('.admin-content');
        if (!content) return;

        // Проверяем, есть ли уже страница скидок
        let discountsPage = document.getElementById('discounts');
        if (!discountsPage) {
            discountsPage = document.createElement('div');
            discountsPage.id = 'discounts';
            discountsPage.className = 'page';
            discountsPage.innerHTML = `
                <div class="discounts-container" id="discountsContainer">
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Загрузка скидок...</p>
                    </div>
                </div>
            `;
            content.appendChild(discountsPage);
        }

        this.showPage('discounts');
    }

    // Добавляем в конец файла до вызова new AdminPanel()
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