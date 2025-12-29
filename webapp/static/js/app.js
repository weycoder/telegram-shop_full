// Telegram Shop - Полная версия с всеми функциями

class TelegramShop {
    constructor() {
        this.cart = this.loadCart();
        this.currentProduct = null;
        this.products = [];
        this.categories = [];
        this.isInitialized = false;
        this.deliveryData = {
            type: null, // 'courier' или 'pickup'
            address_id: null,
            pickup_point: null,
            address_details: null
        };


        console.log('🛍️ Telegram Shop создан');
    }

    async init() {
        if (this.isInitialized) return;

        console.log('🚀 Инициализация магазина...');

        this.addStyles();
        this.bindEvents();

        // Загружаем данные параллельно
        await Promise.all([
            this.loadProducts(),
            this.loadCategories()
        ]);

        this.updateCartCount();

        // Telegram Web App интеграция
        if (window.Telegram && Telegram.WebApp) {
            this.initTelegramWebApp();
        }

        this.isInitialized = true;
        console.log('✅ Магазин инициализирован');
    }

        bindEvents() {
            console.log('🔗 Назначаем обработчики событий...');

            // Корзина
            this.bindEvent('cartBtn', 'click', () => this.toggleCart());
            this.bindEvent('closeCart', 'click', () => this.closeCart());
            this.bindEvent('clearCart', 'click', () => this.clearCart());
            this.bindEvent('checkoutBtn', 'click', () => this.checkout());

            // Модальное окно товара
            this.bindEvent('closeProductModal', 'click', () => this.closeProductModal());

            // Закрытие по клику на оверлей
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('cart-overlay')) this.closeCart();
                if (e.target.classList.contains('product-modal-overlay')) this.closeProductModal();
            });

            // Escape для закрытия
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeCart();
                    this.closeProductModal();
                }
            });

            // Категории (делегирование)
            const categoriesContainer = document.getElementById('categories');
            if (categoriesContainer) {
                categoriesContainer.addEventListener('click', (e) => {
                    const categoryBtn = e.target.closest('.category-btn');
                    if (categoryBtn) {
                        e.preventDefault();
                        this.filterByCategory(categoryBtn);
                    }
                });
            }

            // ДЕЛЕГИРОВАНИЕ ДЛЯ КНОПОК "ПОДРОБНЕЕ" - ДОБАВЬТЕ ЭТОТ КОД
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-block');
                if (btn && btn.textContent.includes('Подробнее')) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Получаем productId из атрибута onclick
                    const onclickAttr = btn.getAttribute('onclick');
                    if (onclickAttr && onclickAttr.includes('shop.viewProduct')) {
                        const match = onclickAttr.match(/shop\.viewProduct\((\d+)\)/);
                        if (match && match[1]) {
                            const productId = parseInt(match[1]);
                            console.log('🖱️ Нажата кнопка "Подробнее" для товара ID:', productId);
                            this.viewProduct(productId);
                        }
                    }
                }
            });

            console.log('✅ Все обработчики назначены');
        }

    bindEvent(id, event, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    initTelegramWebApp() {
        try {
            // Проверяем, что Telegram Web App действительно существует
            if (window.Telegram && Telegram.WebApp) {
                console.log('✅ Telegram Web App доступен');

                // Расширяем на весь экран
                if (Telegram.WebApp.expand) Telegram.WebApp.expand();

                // Настраиваем цвета
                if (Telegram.WebApp.setHeaderColor) Telegram.WebApp.setHeaderColor('#667eea');
                if (Telegram.WebApp.setBackgroundColor) Telegram.WebApp.setBackgroundColor('#f5f7fa');

                // Включаем подтверждение закрытия
                if (Telegram.WebApp.enableClosingConfirmation) Telegram.WebApp.enableClosingConfirmation();

                // Проверяем BackButton
                if (Telegram.WebApp.BackButton) {
                    // Скрываем кнопку "Назад" по умолчанию
                    if (Telegram.WebApp.BackButton.hide) Telegram.WebApp.BackButton.hide();

                    // Добавляем обработчик
                    Telegram.WebApp.BackButton.onClick(() => {
                        console.log('🔙 Нажата кнопка "Назад"');
                        if (this.isCartOpen()) {
                            this.closeCart();
                        } else if (this.isProductModalOpen()) {
                            this.closeProductModal();
                        } else {
                            if (Telegram.WebApp.close) Telegram.WebApp.close();
                        }
                    });
                } else {
                    console.warn('⚠️ Telegram.WebApp.BackButton недоступен');
                }

            } else {
                console.log('ℹ️ Telegram Web App недоступен, работаем в браузере');
                // Создаем заглушку для отладки в браузере
                this.createWebAppStub();
            }
        } catch (error) {
            console.warn('⚠️ Ошибка инициализации Telegram Web App:', error);
            this.createWebAppStub();
        }
    }

    createWebAppStub() {
        // Создаем заглушку для работы в браузере
        if (!window.Telegram) window.Telegram = {};
        if (!window.Telegram.WebApp) {
            window.Telegram.WebApp = {
                expand: function() { console.log('[Stub] WebApp расширен'); },
                setHeaderColor: function() { console.log('[Stub] Цвет заголовка изменен'); },
                setBackgroundColor: function() { console.log('[Stub] Фон изменен'); },
                enableClosingConfirmation: function() { console.log('[Stub] Подтверждение закрытия включено'); },
                close: function() {
                    console.log('[Stub] Закрытие WebApp');
                    if (confirm('Закрыть приложение?')) {
                        window.close();
                    }
                },
                BackButton: {
                    isVisible: false,
                    show: function() {
                        console.log('[Stub] Кнопка "Назад" показана');
                        this.isVisible = true;
                    },
                    hide: function() {
                        console.log('[Stub] Кнопка "Назад" скрыта');
                        this.isVisible = false;
                    },
                    onClick: function(callback) {
                        console.log('[Stub] Обработчик кнопки "Назад" установлен');
                        this.callback = callback;
                    }
                },
                colorScheme: 'light'
            };
        }
    }

    updateBackButton() {
        if (window.Telegram?.WebApp?.BackButton) {
            try {
                if (this.isCartOpen() || this.isProductModalOpen()) {
                    if (Telegram.WebApp.BackButton.show) Telegram.WebApp.BackButton.show();
                } else {
                    if (Telegram.WebApp.BackButton.hide) Telegram.WebApp.BackButton.hide();
                }
            } catch (error) {
                console.warn('⚠️ Ошибка обновления BackButton:', error);
            }
        }
    }

    isCartOpen() {
        const cart = document.getElementById('cartOverlay');
        return cart && cart.style.display === 'flex';
    }

    isProductModalOpen() {
        const modal = document.getElementById('productModal');
        return modal && modal.style.display === 'flex';
    }

    // ========== ПРОДУКТЫ И КАТЕГОРИИ ==========
    async loadProducts(category = 'all') {
        try {
            console.log(`📥 Загрузка товаров${category !== 'all' ? ` категории "${category}"` : ''}...`);

            this.showLoading(true);

            const url = category !== 'all'
                ? `/api/products?category=${encodeURIComponent(category)}`
                : '/api/products';

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.products = await response.json();
            console.log(`✅ Загружено ${this.products.length} товаров`);

            this.renderProducts();

        } catch (error) {
            console.error('❌ Ошибка загрузки товаров:', error);
            this.showNotification('❌ Не удалось загрузить товары', 'error');
            this.products = [];
            this.renderProducts();
        } finally {
            this.showLoading(false);
        }
    }

    // Добавьте эту функцию в класс TelegramShop
    forceCartRefresh() {
        console.log('🔄 Принудительное обновление корзины');
        this.updateCartDisplay();

        // Также обновляем счетчик
        this.updateCartCount();

        // Проверяем состояние
        console.log(`Состояние корзины: ${this.cart.length} товаров`);
        console.log('Содержимое корзины:', this.cart);
    }

    async loadCategories() {
        try {
            console.log('📂 Загрузка категорий...');

            const response = await fetch('/api/categories');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.categories = await response.json();
            console.log(`✅ Загружено ${this.categories.length} категорий`);

            this.renderCategories();

        } catch (error) {
            console.error('❌ Ошибка загрузки категорий:', error);
            this.categories = [];
        }
    }

    renderProducts() {
        const productsGrid = document.getElementById('products');
        if (!productsGrid) {
            console.error('❌ Контейнер товаров не найден');
            return;
        }

        if (this.products.length === 0) {
            productsGrid.innerHTML = `
                <div class="no-products" style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--gray-color);">
                    <i class="fas fa-box-open" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                    <h3 style="margin: 0 0 8px 0;">Товары не найдены</h3>
                    <p style="margin: 0;">Попробуйте выбрать другую категорию</p>
                </div>
            `;
            return;
        }

        // Используем сетку 2 в ряд
        let html = '';
        this.products.forEach(product => {
            html += this.createProductCard(product);
        });

        productsGrid.innerHTML = html;
    }

    createProductCard(product) {
        const inStock = product.stock > 0;
        return `
            <div class="product-card">
                <div class="product-image-container">
                    <img src="${product.image_url || 'https://via.placeholder.com/300x200'}"
                         alt="${product.name}"
                         class="product-image"
                         onerror="this.src='https://via.placeholder.com/300x200'">
                    ${!inStock ? '<div class="out-of-stock">Нет в наличии</div>' : ''}
                </div>
                <div class="product-info">
                    <h3 class="product-title">${product.name}</h3>
                    <div class="product-price">${this.formatPrice(product.price)} ₽</div>
                    <div class="product-stock ${inStock ? '' : 'stock-unavailable'}">
                        <i class="fas ${inStock ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        ${inStock ? `В наличии: ${product.stock} шт.` : 'Нет в наличии'}
                    </div>
                    <button class="btn-block" onclick="shop.viewProduct(${product.id})"
                            ${!inStock ? 'disabled' : ''}>
                        <i class="fas fa-eye"></i> Подробнее
                    </button>
                </div>
            </div>
        `;
    }

    renderCategories() {
        const container = document.getElementById('categories');
        if (!container) return;

        // Находим кнопку "Все товары"
        const allButton = container.querySelector('.category-btn[data-category="all"]');
        const buttons = allButton ? [allButton.outerHTML] : [];

        // Добавляем остальные категории
        this.categories.forEach(category => {
            buttons.push(`
                <button class="category-btn" data-category="${category}">
                    <i class="fas fa-tag"></i> ${category}
                </button>
            `);
        });

        container.innerHTML = buttons.join('');
    }

    filterByCategory(categoryBtn) {
        const category = categoryBtn.dataset.category;

        // Обновляем активную кнопку
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        categoryBtn.classList.add('active');

        // Загружаем товары выбранной категории
        this.loadProducts(category);
    }

        async viewProduct(productId) {
            try {
                console.log(`👁️ Загрузка товара #${productId}...`);

                // Показываем загрузку в модальном окне
                this.openProductModalLoading();

                const response = await fetch(`/api/products/${productId}`);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ Сервер вернул:', response.status, errorText);

                    if (response.status === 404) {
                        console.log('🛠️ Проверяем доступность API...');
                    }

                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const product = await response.json();

                if (product.error) {
                    throw new Error(product.error);
                }

                console.log('✅ Товар загружен:', product);
                this.currentProduct = product;

                // ВЫЗЫВАЕМ метод рендеринга модального окна
                this.renderProductModal(product);

            } catch (error) {
                console.error('❌ Ошибка загрузки товара:', error);
                this.showNotification('❌ Не удалось загрузить товар', 'error');
                this.closeProductModal();
            }
        }

    async testAllEndpoints() {
        const endpoints = [
            '/api/products',
            '/api/products/1',
            '/api/products/2',
            '/api/products/3',
            '/api/products/4',
            '/api/products/5',
            '/api/products/6',
            '/api/categories',
            '/api/test'
        ];

        for (let endpoint of endpoints) {
            try {
                const response = await fetch(endpoint);
                console.log(`${endpoint}: ${response.status} ${response.ok ? '✅' : '❌'}`);
            } catch (e) {
                console.log(`${endpoint}: ❌ Ошибка ${e.message}`);
            }
        }
    }

    openProductModalLoading() {
        const modal = document.getElementById('productModal');
        if (!modal) return;

        modal.innerHTML = `
            <div class="product-modal">
                <div class="modal-content">
                    <div class="loading-modal">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Загрузка товара...</p>
                    </div>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
    }

        renderProductModal(product) {
            console.log('🎨 Рендерим модальное окно товара:', product.name);

            const modal = document.getElementById('productModal');
            if (!modal) {
                console.error('❌ Модальное окно не найдено');
                return;
            }

            modal.innerHTML = `
                <div class="product-modal">
                    <button class="close-product-modal" id="closeProductModal">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="product-modal-content">
                        <div class="product-modal-image-container">
                            <img src="${product.image_url || 'https://via.placeholder.com/400x300'}"
                                 alt="${product.name}"
                                 class="product-modal-image"
                                 onerror="this.src='https://via.placeholder.com/400x300'">
                        </div>
                        <div class="product-modal-info">
                            <h3 class="product-modal-title">${product.name}</h3>
                            <div class="product-modal-price">${this.formatPrice(product.price)} ₽</div>

                            <div class="product-modal-description">
                                <h4><i class="fas fa-info-circle"></i> Описание:</h4>
                                <p>${product.description || 'Описание отсутствует'}</p>
                            </div>

                            <div class="product-modal-stock ${product.stock > 0 ? 'in-stock' : 'out-of-stock'}">
                                <i class="fas ${product.stock > 0 ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                                ${product.stock > 0 ? `В наличии: ${product.stock} шт.` : 'Нет в наличии'}
                            </div>

                            ${product.stock > 0 ? `
                                <div class="product-modal-actions">
                                    <div class="quantity-selector">
                                        <h4><i class="fas fa-sort-amount-up"></i> Количество:</h4>
                                        <button class="qty-btn minus" id="qtyMinus">
                                            <i class="fas fa-minus"></i>
                                        </button>
                                        <input type="number"
                                               id="quantity"
                                               value="1"
                                               min="1"
                                               max="${product.stock}"
                                               onchange="shop.validateQuantity(${product.stock})">
                                        <button class="qty-btn plus" id="qtyPlus">
                                            <i class="fas fa-plus"></i>
                                        </button>
                                    </div>

                                    <button class="btn btn-primary" id="addToCartModal">
                                        <i class="fas fa-cart-plus"></i> Добавить в корзину
                                    </button>
                                </div>
                            ` : `
                                <button class="btn btn-secondary" disabled>
                                    <i class="fas fa-times-circle"></i> Товар закончился
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;

            modal.style.display = 'flex';

            // Назначаем обработчики событий
            this.bindModalEvents(product);
            this.updateBackButton();
        }

    bindModalEvents(product) {
        // Закрытие модального окна
        this.bindEvent('closeProductModal', 'click', () => this.closeProductModal());

        // Кнопки +/-
        this.bindEvent('qtyMinus', 'click', () => this.changeQuantity(-1));
        this.bindEvent('qtyPlus', 'click', () => this.changeQuantity(1));

        // Добавление в корзину
        this.bindEvent('addToCartModal', 'click', () => {
            const quantityInput = document.getElementById('quantity');
            const quantity = quantityInput ? parseInt(quantityInput.value) || 1 : 1;
            this.addToCartFromModal(product, quantity);
        });

        // Валидация количества при прямом вводе
        const quantityInput = document.getElementById('quantity');
        if (quantityInput) {
            quantityInput.addEventListener('input', () => {
                this.validateQuantity(product.stock);
            });
        }
    }

    validateQuantity(maxStock) {
        const input = document.getElementById('quantity');
        if (!input) return;

        let value = parseInt(input.value) || 1;

        if (value < 1) value = 1;
        if (value > maxStock) value = maxStock;

        input.value = value;
    }

    changeQuantity(delta) {
        const input = document.getElementById('quantity');
        if (!input) return;

        let currentValue = parseInt(input.value) || 1;
        let newValue = currentValue + delta;

        // Проверяем минимальное и максимальное значение
        const max = parseInt(input.max) || 100;
        const min = parseInt(input.min) || 1;

        if (newValue < min) newValue = min;
        if (newValue > max) newValue = max;

        input.value = newValue;
    }

    addToCartFromModal(product, quantity) {
        if (!product || quantity < 1) {
            this.showNotification('❌ Неверное количество', 'error');
            return;
        }

        if (quantity > product.stock) {
            this.showNotification(`❌ Доступно только ${product.stock} шт.`, 'error');
            return;
        }

        this.addToCart(
            product.id,
            product.name,
            product.price,
            quantity,
            product.image_url
        );

        this.closeProductModal();
    }

    closeProductModal() {
        const modal = document.getElementById('productModal');
        if (modal) {
            modal.style.display = 'none';
            modal.innerHTML = '';
        }
        this.currentProduct = null;
        this.updateBackButton();
    }

    // ========== КОРЗИНА ==========
    addToCart(productId, name, price, quantity = 1, image = null) {
        // Ищем товар в корзине
        const existingIndex = this.cart.findIndex(item => item.id === productId);

        if (existingIndex !== -1) {
            // Обновляем количество существующего товара
            this.cart[existingIndex].quantity += quantity;
        } else {
            // Добавляем новый товар
            this.cart.push({
                id: productId,
                name: name,
                price: price,
                quantity: quantity,
                image: image || 'https://via.placeholder.com/100',
                addedAt: new Date().toISOString()
            });
        }

        this.saveCart();
        this.updateCartCount();

        // ОБНОВЛЯЕМ отображение корзины, если она открыта
        if (this.isCartOpen()) {
            this.updateCartDisplay();
        }

        // Показываем уведомление с кнопкой перехода в корзину
        this.showCartNotification(name, quantity);
    }


    showCartNotification(name, quantity) {
        const notification = document.createElement('div');
        notification.className = 'cart-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-message">
                    <i class="fas fa-check-circle"></i>
                    <span>${name} × ${quantity} добавлен в корзину!</span>
                </div>
                <button class="notification-action" onclick="shop.toggleCart()">
                    <i class="fas fa-shopping-cart"></i> Перейти в корзину
                </button>
            </div>
        `;

        document.body.appendChild(notification);

        // Анимация появления
        setTimeout(() => notification.classList.add('show'), 10);

        // Автоматическое скрытие через 5 секунд
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    removeFromCart(productId) {
        console.log('🗑️ Удаление товара ID:', productId);

        // Удаляем товар
        this.cart = this.cart.filter(item => item.id != productId);

        // Сохраняем
        localStorage.setItem('telegram_shop_cart', JSON.stringify(this.cart));

        // Обновляем счетчик
        this.updateCartCount();

        // Всегда обновляем отображение корзины
        this.updateCartDisplay();

        // Показываем уведомление
        this.showNotification('🗑️ Товар удален из корзины', 'info');

        // Если корзина стала пустой, дополнительное сообщение
        if (this.cart.length === 0) {
            setTimeout(() => {
                this.showNotification('🛒 Корзина пуста', 'info');
            }, 300);
        }
    }

    updateCartItem(productId, quantity) {
        const itemIndex = this.cart.findIndex(item => item.id === productId);

        if (itemIndex !== -1) {
            if (quantity < 1) {
                this.removeFromCart(productId);
            } else {
                this.cart[itemIndex].quantity = quantity;
                this.saveCart();
                this.updateCartCount();

                // СРАЗУ обновляем отображение корзины
                this.updateCartDisplay();
            }
        }
    }


    updateCartItemQuantity(productId, quantity) {
        const itemIndex = this.cart.findIndex(item => item.id.toString() === productId.toString());

        if (itemIndex !== -1) {
            if (quantity < 1) {
                this.removeFromCart(productId);
            } else {
                this.cart[itemIndex].quantity = quantity;
                this.saveCart();
                this.updateCartCount();

                // Обновляем отображение
                if (this.isCartOpen()) {
                    this.updateCartDisplay();
                }
            }
        }
    }

        // ОСТАЛЬНЫЕ ФУНКЦИИ КОРЗИНЫ ОСТАВЛЯЕМ КАК БЫЛИ
    clearCart() {
        if (this.cart.length === 0) {
            this.showNotification('Корзина уже пуста', 'info');
            return;
        }

        if (confirm('Вы уверены, что хотите очистить корзину?')) {
            this.cart = [];
            localStorage.setItem('telegram_shop_cart', JSON.stringify(this.cart));
            this.updateCartCount();
            this.updateCartDisplay();
            this.showNotification('🗑️ Корзина очищена', 'info');
        }
    }

    saveCart() {
        try {
            localStorage.setItem('telegram_shop_cart', JSON.stringify(this.cart));
        } catch (error) {
            console.error('❌ Ошибка сохранения корзины:', error);
        }
    }

    loadCart() {
        try {
            const cartData = localStorage.getItem('telegram_shop_cart');
            return cartData ? JSON.parse(cartData) : [];
        } catch (error) {
            console.error('❌ Ошибка загрузки корзины:', error);
            return [];
        }
    }

    updateCartCount() {
        const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        const cartCount = document.getElementById('cartCount');

        if (cartCount) {
            cartCount.textContent = totalItems;
            cartCount.style.display = totalItems > 0 ? 'flex' : 'none';
        }
    }

    updateCartDisplay() {
        console.log('🔄 Обновление корзины...');

        const cartItems = document.getElementById('cartItems');
        const cartTotal = document.getElementById('cartTotal');

        if (!cartItems || !cartTotal) {
            console.error('❌ Элементы корзины не найдены!');
            return;
        }

        // ЕСЛИ КОРЗИНА ПУСТА
        if (this.cart.length === 0) {
            console.log('🛒 Корзина пуста - показываем сообщение');

            // Просто показываем сообщение прямо в cartItems
            cartItems.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Корзина пуста</p>
                    <p>Добавьте товары из каталога</p>
                </div>
            `;

            // Обнуляем сумму
            cartTotal.textContent = '0 ₽';

            return;
        }

        // ЕСЛИ В КОРЗИНЕ ЕСТЬ ТОВАРЫ
        console.log(`📦 В корзине ${this.cart.length} товаров`);

        // Генерируем HTML для товаров
        let itemsHTML = '';

        this.cart.forEach(item => {
            itemsHTML += `
                <div class="cart-item" data-id="${item.id}">
                    <img src="${item.image || 'https://via.placeholder.com/80'}"
                         alt="${item.name}"
                         class="cart-item-image">
                    <div class="cart-item-info">
                        <div class="cart-item-header">
                            <h4 class="cart-item-name">${item.name}</h4>
                            <button class="remove-item" onclick="shop.removeFromCart(${item.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        <div class="cart-item-price">${this.formatPrice(item.price)} ₽</div>
                        <div class="cart-item-controls">
                            <div class="quantity-selector small">
                                <button class="qty-btn" onclick="shop.updateCartItemQuantity(${item.id}, ${item.quantity - 1})"
                                        ${item.quantity <= 1 ? 'disabled' : ''}>
                                    <i class="fas fa-minus"></i>
                                </button>
                                <span class="quantity">${item.quantity} шт.</span>
                                <button class="qty-btn" onclick="shop.updateCartItemQuantity(${item.id}, ${item.quantity + 1})">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                            <div class="cart-item-total">
                                ${this.formatPrice(item.price * item.quantity)} ₽
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        // Вставляем HTML
        cartItems.innerHTML = itemsHTML;

        // Обновляем сумму
        const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotal.textContent = `${this.formatPrice(total)} ₽`;

        console.log('✅ Корзина обновлена');
    }



        // Добавьте эту вспомогательную функцию для очистки уведомлений
    clearCartNotifications() {
        const notifications = document.querySelectorAll('.notification');
        notifications.forEach(notification => {
            const text = notification.textContent || '';
            if (text.includes('Корзина уже пуста') || text.includes('Товар удален')) {
                notification.remove();
            }
        });
    }

        // Добавить в класс TelegramShop
    resetCartInterface() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        // Сбрасываем к стандартному виду корзины
        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="cart-header">
                    <h2><i class="fas fa-shopping-cart"></i> Корзина</h2>
                    <button class="close-cart" id="closeCart" title="Закрыть">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="cart-items" id="cartItems">
                    <!-- Товары будут здесь -->
                </div>

                <div class="cart-footer">
                    <div class="cart-summary">
                        <div class="cart-total">
                            <span>Итого:</span>
                            <span class="total-price" id="cartTotal">0 ₽</span>
                        </div>
                        <div class="cart-actions">
                            <button class="btn btn-outline" id="clearCart">
                                <i class="fas fa-trash"></i> Очистить
                            </button>
                            <button class="btn btn-primary" id="checkoutBtn">
                                <i class="fas fa-paper-plane"></i> Купить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Назначаем обработчики
        this.bindEvent('closeCart', 'click', () => this.closeCart());
        this.bindEvent('clearCart', 'click', () => this.clearCart());
        this.bindEvent('checkoutBtn', 'click', () => this.checkout());
    }


    toggleCart() {
        // ОЧИЩАЕМ все данные о доставке и предыдущих состояниях
        this.deliveryData = {
            type: null,
            address_id: null,
            pickup_point: null,
            address_details: null
        };

        // ВСЕГДА показываем обычную корзину, а не окно подтверждения
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        // Сбрасываем содержимое корзины к стандартному виду
        this.updateCartDisplay();

        // Устанавливаем стандартный HTML для корзины
        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="cart-header">
                    <h2><i class="fas fa-shopping-cart"></i> Корзина</h2>
                    <button class="close-cart" id="closeCart" title="Закрыть">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="cart-items" id="cartItems">
                    <!-- Товары будут загружены через updateCartDisplay() -->
                </div>

                <div class="cart-footer">
                    <div class="cart-summary">
                        <div class="cart-total">
                            <span>Итого:</span>
                            <span class="total-price" id="cartTotal">0 ₽</span>
                        </div>
                        <div class="cart-actions">
                            <button class="btn btn-outline" id="clearCart">
                                <i class="fas fa-trash"></i> Очистить
                            </button>
                            <button class="btn btn-primary" id="checkoutBtn">
                                <i class="fas fa-paper-plane"></i> Купить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Обновляем отображение товаров
        this.updateCartDisplay();

        // Назначаем обработчики
        this.bindEvent('closeCart', 'click', () => this.closeCart());
        this.bindEvent('clearCart', 'click', () => this.clearCart());
        this.bindEvent('checkoutBtn', 'click', () => this.checkout());

        // Показываем корзину
        cartOverlay.style.display = 'flex';
        this.updateBackButton();
    }

    closeCart() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (cartOverlay) {
            cartOverlay.style.display = 'none';
            this.updateBackButton();
        }
    }

    async checkout() {
        if (this.cart.length === 0) {
            this.showNotification('❌ Корзина пуста!', 'error');
            return;
        }

        // Проверяем наличие товаров (оставляем старую проверку)
        const unavailableItems = [];
        for (const item of this.cart) {
            try {
                const response = await fetch(`/api/products/${item.id}`);
                if (response.ok) {
                    const product = await response.json();
                    if (product.stock < item.quantity) {
                        unavailableItems.push({
                            name: item.name,
                            available: product.stock,
                            requested: item.quantity
                        });
                    }
                }
            } catch (error) {
                console.error(`Ошибка проверки товара ${item.id}:`, error);
            }
        }

        if (unavailableItems.length > 0) {
            let message = 'Некоторые товары недоступны в запрошенном количестве:\n';
            unavailableItems.forEach(item => {
                message += `• ${item.name}: доступно ${item.available}, запрошено ${item.requested}\n`;
            });
            this.showNotification(message, 'error');
            return;
        }

        // ЕСЛИ ВСЕ ТОВАРЫ ДОСТУПНЫ - ПОКАЗЫВАЕМ ВЫБОР ДОСТАВКИ
        await this.showDeliverySelection();
    }

    async showDeliverySelection() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="cart-header">
                    <h2><i class="fas fa-shipping-fast"></i> Способ получения</h2>
                    <button class="close-cart" id="closeDeliverySelection">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="delivery-options">
                    <button class="delivery-option" id="courierOption">
                        <div class="option-icon">
                            <i class="fas fa-truck"></i>
                        </div>
                        <div class="option-info">
                            <h3>🚗 Доставка курьером</h3>
                            <p>Привезем прямо к вашей двери</p>
                        </div>
                        <i class="fas fa-chevron-right"></i>
                    </button>

                    <button class="delivery-option" id="pickupOption">
                        <div class="option-icon">
                            <i class="fas fa-store"></i>
                        </div>
                        <div class="option-info">
                            <h3>🏪 Самовывоз</h3>
                            <p>Заберите из ближайшей точки</p>
                        </div>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                <div class="delivery-actions">
                    <!-- ИЗМЕНЕНИЕ ЗДЕСЬ: вызываем returnToCartFromDelivery() -->
                    <button class="btn btn-outline" onclick="shop.returnToCartFromDelivery()">
                        <i class="fas fa-arrow-left"></i> Назад
                    </button>
                </div>
            </div>
        `;

        // Назначаем обработчики
        document.getElementById('courierOption').addEventListener('click', () => this.selectDeliveryType('courier'));
        document.getElementById('pickupOption').addEventListener('click', () => this.selectDeliveryType('pickup'));
        document.getElementById('closeDeliverySelection').addEventListener('click', () => this.closeCart());
    }

    async selectDeliveryType(type) {
        this.deliveryData.type = type;

        if (type === 'courier') {
            await this.showAddressSelection();
        } else if (type === 'pickup') {
            await this.showPickupPoints();
        }
    }

    returnToCartFromDelivery() {
        console.log('🔙 Возврат в корзину из выбора доставки');

        // Сбрасываем данные доставки
        this.deliveryData = {
            type: null,
            address_id: null,
            pickup_point: null,
            address_details: null
        };

        // Закрываем текущее окно выбора доставки
        this.closeCart();

        // Даём время на анимацию закрытия (300ms)
        setTimeout(() => {
            // Восстанавливаем обычный интерфейс корзины
            this.resetCartInterface();

            // Обновляем отображение товаров
            this.updateCartDisplay();

            // ОТКРЫВАЕМ корзину снова
            const cartOverlay = document.getElementById('cartOverlay');
            if (cartOverlay) {
                cartOverlay.style.display = 'flex';
                this.updateBackButton();
            }
        }, 300);
    }

    async showAddressSelection() {
        try {
            const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0;

            // ЕСЛИ userId = 0 (гость), все равно проверяем localStorage
            let addresses = [];

            if (userId !== 0) {
                // Загружаем с сервера для зарегистрированных
                const response = await fetch(`/api/user/addresses?user_id=${userId}`);
                if (response.ok) {
                    addresses = await response.json();
                }
            } else {
                // Для гостей пробуем получить из localStorage
                const guestAddresses = localStorage.getItem('guest_addresses');
                if (guestAddresses) {
                    addresses = JSON.parse(guestAddresses);
                }
            }

            const cartOverlay = document.getElementById('cartOverlay');
            if (!cartOverlay) return;

            let addressesHTML = '';
            let hasAddresses = addresses.length > 0;

            if (hasAddresses) {
                addresses.forEach((addr, index) => {
                    addressesHTML += `
                        <div class="address-card" onclick="shop.selectAddress(${userId === 0 ? index : addr.id})">
                            <div class="address-header">
                                <h3>${addr.recipient_name || 'Адрес'}</h3>
                                ${addr.is_default ? '<span class="default-badge">По умолчанию</span>' : ''}
                            </div>
                            <div class="address-details">
                                <p><i class="fas fa-city"></i> ${addr.city}</p>
                                <p><i class="fas fa-road"></i> ${addr.street}, ${addr.house}</p>
                                ${addr.apartment ? `<p><i class="fas fa-door-closed"></i> Кв. ${addr.apartment}</p>` : ''}
                                ${addr.phone ? `<p><i class="fas fa-phone"></i> ${addr.phone}</p>` : ''}
                            </div>
                            ${userId === 0 ? `
                                <div class="address-actions">
                                    <button class="btn-small" onclick="event.stopPropagation(); shop.removeGuestAddress(${index})">
                                        Удалить
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });
            }

            cartOverlay.innerHTML = `
                <div class="cart-modal">
                    <div class="cart-header">
                        <h2><i class="fas fa-map-marker-alt"></i> Выберите адрес</h2>
                        <button class="close-cart" onclick="shop.closeCart()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="addresses-list">
                        ${hasAddresses ? addressesHTML : `
                            <div class="no-addresses">
                                <i class="fas fa-map-marker-slash"></i>
                                <h3>Нет сохраненных адресов</h3>
                                <p>Добавьте адрес для доставки</p>
                            </div>
                        `}
                    </div>

                    <div class="delivery-actions">
                        <button class="btn btn-primary" onclick="shop.showAddressForm(${userId})">
                            <i class="fas fa-plus"></i> Добавить новый адрес
                        </button>
                        <button class="btn btn-outline" onclick="shop.showDeliverySelection()">
                            <i class="fas fa-arrow-left"></i> Назад
                        </button>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('❌ Ошибка загрузки адресов:', error);
            // Показываем форму для ввода адреса
            const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0;
            await this.showAddressForm(userId);
        }
    }

        // Добавить в класс TelegramShop
    saveGuestAddress(addressData) {
        try {
            // Получаем текущие адреса гостя
            const guestAddresses = JSON.parse(localStorage.getItem('guest_addresses') || '[]');

            // Добавляем новый адрес
            guestAddresses.push({
                ...addressData,
                id: guestAddresses.length + 1,
                is_default: guestAddresses.length === 0 // Первый адрес по умолчанию
            });

            // Сохраняем в localStorage
            localStorage.setItem('guest_addresses', JSON.stringify(guestAddresses));

            return { success: true, id: guestAddresses.length };
        } catch (error) {
            console.error('Ошибка сохранения адреса гостя:', error);
            return { success: false, error: error.message };
        }
    }

    removeGuestAddress(index) {
        try {
            const guestAddresses = JSON.parse(localStorage.getItem('guest_addresses') || '[]');

            if (index >= 0 && index < guestAddresses.length) {
                guestAddresses.splice(index, 1);
                localStorage.setItem('guest_addresses', JSON.stringify(guestAddresses));

                // Обновляем отображение
                this.showAddressSelection();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка удаления адреса гостя:', error);
            return false;
        }
    }

    async showAddressForm() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="cart-header">
                    <h2><i class="fas fa-address-card"></i> Новый адрес</h2>
                    <button class="close-cart" onclick="shop.closeCart()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="address-form">
                    <div class="form-group">
                        <label><i class="fas fa-user"></i> Имя получателя *</label>
                        <input type="text" id="recipientName" placeholder="Иван Иванов" required>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-phone"></i> Телефон</label>
                        <input type="tel" id="recipientPhone" placeholder="+7 (999) 123-45-67">
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-city"></i> Город *</label>
                        <input type="text" id="city" placeholder="Москва" required>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-road"></i> Улица *</label>
                        <input type="text" id="street" placeholder="Ленина" required>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label><i class="fas fa-home"></i> Дом *</label>
                            <input type="text" id="house" placeholder="15" required>
                        </div>

                        <div class="form-group">
                            <label><i class="fas fa-door-closed"></i> Квартира</label>
                            <input type="text" id="apartment" placeholder="24">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label><i class="fas fa-stairs"></i> Этаж</label>
                            <input type="text" id="floor" placeholder="2">
                        </div>

                        <div class="form-group">
                            <label><i class="fas fa-key"></i> Домофон</label>
                            <input type="text" id="doorcode" placeholder="123">
                        </div>
                    </div>
                </div>
                <div class="delivery-actions">
                    <button class="btn btn-primary" onclick="shop.saveAddress()">
                        <i class="fas fa-save"></i> Сохранить адрес
                    </button>
                    <!-- ТОЛЬКО НАЗАД -->
                    <button class="btn btn-outline" onclick="shop.showAddressSelection()">
                        <i class="fas fa-arrow-left"></i> Назад
                    </button>
                </div>
            </div>
        `;
    }
    returnToCart() {
        console.log('↩️ Возврат в корзину');

        // Очищаем данные о доставке
        this.deliveryData = {
            type: null,
            address_id: null,
            pickup_point: null,
            address_details: null
        };

        // Обновляем отображение корзины
        this.updateCartDisplay();

        // Показываем уведомление (опционально)
        this.showNotification('Возвращено в корзину', 'info');
    }

    async saveAddress() {
        try {
            const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0;
            const addressData = {
                user_id: userId,
                city: document.getElementById('city').value,
                street: document.getElementById('street').value,
                house: document.getElementById('house').value,
                apartment: document.getElementById('apartment').value,
                floor: document.getElementById('floor').value,
                doorcode: document.getElementById('doorcode').value,
                recipient_name: document.getElementById('recipientName').value,
                phone: document.getElementById('recipientPhone').value
            };

            // Проверка обязательных полей
            if (!addressData.city || !addressData.street || !addressData.house || !addressData.recipient_name) {
                this.showNotification('❌ Заполните обязательные поля', 'error');
                return;
            }

            let result;

            if (userId === 0) {
                // Для гостя сохраняем в localStorage
                result = this.saveGuestAddress(addressData);
            } else {
                // Для зарегистрированных пользователей - на сервер
                const response = await fetch('/api/user/addresses', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(addressData)
                });
                result = await response.json();
            }

            if (result.success) {
                this.deliveryData.address_id = result.id;
                this.showNotification('✅ Адрес сохранен', 'success');

                // ВМЕСТО confirmOrder() -> возвращаем к выбору адреса
                setTimeout(() => {
                    this.showAddressSelection();
                }, 1000);

            } else {
                throw new Error(result.error || 'Ошибка сохранения');
            }

        } catch (error) {
            console.error('Ошибка сохранения адреса:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        }
    }

    async showPickupPoints() {
        try {
            const response = await fetch('/api/pickup-points');
            const points = await response.json();

            const cartOverlay = document.getElementById('cartOverlay');
            if (!cartOverlay) return;

            let pointsHTML = '';

            points.forEach(point => {
                pointsHTML += `
                    <div class="pickup-card" onclick="shop.selectPickupPoint(${point.id})">
                        <div class="pickup-header">
                            <h3>${point.name}</h3>
                            <span class="pickup-status">🟢 Открыто</span>
                        </div>
                        <div class="pickup-details">
                            <p><i class="fas fa-map-marker-alt"></i> ${point.address}</p>
                            <p><i class="fas fa-clock"></i> ${point.working_hours || 'Ежедневно 10:00-22:00'}</p>
                            ${point.phone ? `<p><i class="fas fa-phone"></i> ${point.phone}</p>` : ''}
                        </div>
                    </div>
                `;
            });

            cartOverlay.innerHTML = `
                <div class="cart-modal">
                    <div class="cart-header">
                        <h2><i class="fas fa-store"></i> Выберите точку самовывоза</h2>
                        <button class="close-cart" onclick="shop.closeCart()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="pickup-list">
                        ${pointsHTML}
                    </div>

                    <div class="delivery-actions">
                        <button class="btn btn-outline" onclick="shop.showDeliverySelection()">
                            <i class="fas fa-arrow-left"></i> Назад
                        </button>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Ошибка загрузки точек:', error);
            this.showNotification('❌ Ошибка загрузки точек самовывоза', 'error');
        }
    }

    async selectPickupPoint(pointId) {
        this.deliveryData.pickup_point = pointId;
        await this.showPaymentSelection();
    }

    async showPaymentSelection() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        const totalAmount = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="cart-header">
                    <h2><i class="fas fa-credit-card"></i> Способ оплаты</h2>
                    <button class="close-cart" id="closePaymentSelection">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="order-summary">
                    <h3><i class="fas fa-receipt"></i> Сумма к оплате:</h3>
                    <div class="total-amount">${this.formatPrice(totalAmount)} ₽</div>
                </div>

                <div class="payment-options">
                    <button class="payment-option" id="cashOption">
                        <div class="payment-icon">
                            <i class="fas fa-money-bill-wave"></i>
                        </div>
                        <div class="payment-info">
                            <h3>Наличные</h3>
                            <p>Оплата наличными при получении</p>
                        </div>
                        <i class="fas fa-chevron-right"></i>
                    </button>

                    <button class="payment-option" id="transferOption">
                        <div class="payment-icon">
                            <i class="fas fa-mobile-alt"></i>
                        </div>
                        <div class="payment-info">
                            <h3>Перевод курьеру</h3>
                            <p>Перевод на карту курьеру</p>
                        </div>
                        <i class="fas fa-chevron-right"></i>
                    </button>

                    <button class="payment-option" id="terminalOption">
                        <div class="payment-icon">
                            <i class="fas fa-credit-card"></i>
                        </div>
                        <div class="payment-info">
                            <h3>Терминал</h3>
                            <p>Оплата картой через терминал</p>
                        </div>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>

                <div class="payment-actions">
                    <button class="btn btn-outline" id="backToAddressBtn">
                        <i class="fas fa-arrow-left"></i> Назад
                    </button>
                </div>
            </div>
        `;

        // Назначаем обработчики
        document.getElementById('cashOption').addEventListener('click', () => this.selectPaymentMethod('cash'));
        document.getElementById('transferOption').addEventListener('click', () => this.selectPaymentMethod('transfer'));
        document.getElementById('terminalOption').addEventListener('click', () => this.selectPaymentMethod('terminal'));

        document.getElementById('backToAddressBtn').addEventListener('click', () => {
            // Возвращаемся к выбору адреса или точки самовывоза
            if (this.deliveryData.type === 'courier') {
                this.showAddressSelection();
            } else {
                this.showPickupPoints();
            }
        });

        document.getElementById('closePaymentSelection').addEventListener('click', () => this.closeCart());
    }

    selectPaymentMethod(method) {
        this.deliveryData.payment_method = method;

        // Показываем уведомление о выборе
        const methodNames = {
            'cash': 'Наличные',
            'transfer': 'Перевод курьеру',
            'terminal': 'Терминал'
        };

        this.showNotification(`✅ Выбрана оплата: ${methodNames[method]}`, 'success');

        // Переходим к оформлению заказа
        this.confirmOrder();
    }

    async selectAddress(addressId) {
        try {
            const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0;

            if (userId === 0) {
                this.deliveryData.address_id = `guest_${addressId}`;
                this.deliveryData.address_details = localStorage.getItem('guest_addresses')
                    ? JSON.parse(localStorage.getItem('guest_addresses'))[addressId]
                    : null;
            } else {
                this.deliveryData.address_id = addressId;
            }

            // ВМЕСТО confirmOrder() -> показываем выбор оплаты
            await this.showPaymentSelection();

        } catch (error) {
            console.error('Ошибка выбора адреса:', error);
            this.showNotification('❌ Ошибка выбора адреса', 'error');
        }
    }

    async setDefaultAddress(addressId, userId) {
        try {
            event.stopPropagation(); // Останавливаем всплытие

            const response = await fetch('/api/user/addresses/set-default', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: userId,
                    address_id: addressId
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('✅ Адрес установлен по умолчанию', 'success');
                // Обновляем список адресов
                setTimeout(() => {
                    this.showAddressSelection();
                }, 1000);
            } else {
                throw new Error(result.error || 'Ошибка установки адреса');
            }

        } catch (error) {
            console.error('Ошибка установки адреса:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        }
    }

    async confirmOrder() {
        try {
            let userData = {
                user_id: 0,
                username: 'Гость',
                first_name: '',
                last_name: ''
            };

            if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
                const user = Telegram.WebApp.initDataUnsafe.user;
                userData = {
                    user_id: user.id || 0,
                    username: user.username || '',
                    first_name: user.first_name || '',
                    last_name: user.last_name || ''
                };
            }

            // Подготавливаем данные о доставке и оплате
            let deliveryDetails = {};

            if (this.deliveryData.type === 'courier' && this.deliveryData.address_id) {
                if (this.deliveryData.address_id.toString().startsWith('guest_')) {
                    const guestAddresses = JSON.parse(localStorage.getItem('guest_addresses') || '[]');
                    const addressIndex = parseInt(this.deliveryData.address_id.split('_')[1]);
                    deliveryDetails = guestAddresses[addressIndex] || {};
                } else {
                    deliveryDetails = { address_id: this.deliveryData.address_id };
                }
            }

            // Подготавливаем данные заказа С СПОСОБОМ ОПЛАТЫ
            const orderData = {
                ...userData,
                items: this.cart.map(item => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity
                })),
                total: this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
                delivery_type: this.deliveryData.type,
                delivery_address: JSON.stringify(deliveryDetails),
                pickup_point: this.deliveryData.pickup_point,
                payment_method: this.deliveryData.payment_method || 'cash', // по умолчанию наличные
                recipient_name: deliveryDetails.recipient_name || '',
                phone_number: deliveryDetails.phone || '',
                created_at: new Date().toISOString()
            };

            console.log('📤 Отправка заказа с оплатой:', orderData);

            const response = await fetch('/api/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderData)
            });

            const result = await response.json();
            console.log('📥 Ответ сервера:', result);

            if (result.success) {
                // Показываем подтверждение с информацией об оплате
                await this.showOrderConfirmation(result.order_id);

                // Очищаем корзину ПОСЛЕ показа подтверждения
                this.cart = [];
                this.saveCart();
                this.updateCartCount();

            } else {
                throw new Error(result.error || 'Неизвестная ошибка сервера');
            }

        } catch (error) {
            console.error('❌ Ошибка оформления заказа:', error);
            this.showNotification(`❌ Ошибка: ${error.message}`, 'error');
            // Возвращаем к выбору оплаты
            this.showPaymentSelection();
        }
    }

    showOrderConfirmation(orderId) {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        const totalAmount = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        const deliveryText = this.deliveryData.type === 'courier'
            ? 'Доставка курьером'
            : 'Самовывоз';

        // Названия способов оплаты
        const paymentMethods = {
            'cash': 'Наличные',
            'transfer': 'Перевод курьеру',
            'terminal': 'Терминал'
        };

        const paymentText = paymentMethods[this.deliveryData.payment_method] || 'Наличные';

        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="order-confirmation">
                    <div class="confirmation-icon processing">
                        <i class="fas fa-clock"></i>
                    </div>
                    <h2>Заказ принят!</h2>
                    <div class="order-details">
                        <p><strong>Номер заказа:</strong> #${orderId}</p>
                        <p><strong>Способ получения:</strong> ${deliveryText}</p>
                        <p><strong>Способ оплаты:</strong> ${paymentText}</p>
                        <p><strong>Сумма:</strong> ${this.formatPrice(totalAmount)} ₽</p>
                        <p><strong>Статус:</strong> <span class="status-processing">Ожидает обработки</span></p>
                    </div>
                    <div class="confirmation-message processing">
                        <p><i class="fas fa-info-circle"></i> Заказ передан на обработку</p>
                        <p>Наш менеджер свяжется с вами в ближайшее время для подтверждения заказа</p>
                    </div>
                    <button class="btn btn-primary" id="closeCartAndReturn">
                        <i class="fas fa-home"></i> Вернуться в магазин
                    </button>
                </div>
            </div>
        `;

        // Обработчик кнопки
        document.getElementById('closeCartAndReturn').addEventListener('click', () => {
            this.cart = [];
            this.saveCart();
            this.updateCartCount();
            this.closeCart();
            setTimeout(() => {
                this.resetCartInterface();
            }, 300);
        });
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(price || 0));
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = show ? 'block' : 'none';
        }
    }

    showNotification(message, type = 'info') {
        console.log(`💬 [${type.toUpperCase()}] ${message}`);

        // Создаем контейнер для уведомлений если его нет
        let container = document.getElementById('notifications');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notifications';
            document.body.appendChild(container);
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas fa-${type === 'success' ? 'check-circle' :
                                 type === 'error' ? 'exclamation-circle' :
                                 type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            </div>
            <div class="notification-content">${message}</div>
        `;

        container.appendChild(notification);

        // Анимация появления
        setTimeout(() => notification.classList.add('show'), 10);

        // Автоматическое скрытие
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, type === 'error' ? 5000 : 3000);
    }

    // ========== СТИЛИ ==========
    addStyles() {
        // Стили уже в style.css, ничего не добавляем
        console.log('🎨 Стили уже подключены через style.css');
    }
}

// Автоматическая инициализация при загрузке страницы
let shopInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📋 DOM загружен, запускаем магазин...');

    try {
        shopInstance = new TelegramShop();
        window.shop = shopInstance;

        await shopInstance.init();

        console.log('🚀 Telegram Shop готов к работе!');

    } catch (error) {
        console.error('❌ Ошибка инициализации магазина:', error);

        // Показываем сообщение об ошибке пользователю
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
            <i class="fas fa-exclamation-triangle" style="font-size: 60px; color: #e74c3c; margin-bottom: 20px;"></i>
            <h2 style="color: #2c3e50; margin-bottom: 10px;">Ошибка загрузки магазина</h2>
            <p style="color: #7f8c8d; margin-bottom: 20px;">Пожалуйста, обновите страницу или попробуйте позже</p>
            <button onclick="location.reload()" style="
                background: #667eea;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
            ">
                <i class="fas fa-redo"></i> Обновить страницу
            </button>
        `;
        document.body.appendChild(errorDiv);
    }
});

window.TelegramShop = TelegramShop;