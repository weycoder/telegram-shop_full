// Telegram Shop - Полная версия с всеми функциями

class TelegramShop {
    constructor() {
        this.cart = this.loadCart();
        this.currentProduct = null;
        this.products = [];
        this.categories = [];
        this.isInitialized = false;

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
                <div class="no-products">
                    <i class="fas fa-box-open"></i>
                    <h3>Товары не найдены</h3>
                    <p>Попробуйте выбрать другую категорию</p>
                </div>
            `;
            return;
        }

        // Создаем строки по 2 товара в каждой
        let html = '';
        for (let i = 0; i < this.products.length; i += 2) {
            html += '<div class="products-row">';

            // Первый товар в строке
            const product1 = this.products[i];
            html += this.createProductCard(product1);

            // Второй товар в строке (если есть)
            if (i + 1 < this.products.length) {
                const product2 = this.products[i + 1];
                html += this.createProductCard(product2);
            } else {
                // Если товаров нечетное количество, добавляем пустую ячейку
                html += '<div class="product-card empty"></div>';
            }

            html += '</div>';
        }

        productsGrid.innerHTML = html;
    }

    createProductCard(product) {
        return `
            <div class="product-card">
                <div class="product-image-container">
                    <img src="${product.image_url || 'https://via.placeholder.com/300x200'}"
                         alt="${product.name}"
                         class="product-image"
                         onerror="this.src='https://via.placeholder.com/300x200'">
                    ${product.stock <= 0 ? '<div class="out-of-stock">Нет в наличии</div>' : ''}
                </div>
                <div class="product-info">
                    <h3 class="product-title">${product.name}</h3>
                    <p class="product-description">
                        ${product.description?.substring(0, 100) || 'Описание отсутствует'}
                        ${product.description?.length > 100 ? '...' : ''}
                    </p>
                    <div class="product-price">${this.formatPrice(product.price)} ₽</div>
                    <div class="product-stock">
                        <i class="fas ${product.stock > 0 ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        ${product.stock > 0 ? `В наличии: ${product.stock} шт.` : 'Нет в наличии'}
                    </div>
                    <button class="btn btn-primary btn-block" onclick="shop.viewProduct(${product.id})"
                            ${product.stock <= 0 ? 'disabled' : ''}>
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

    // ========== ПРОСМОТР ТОВАРА ==========
    async viewProduct(productId) {
        try {
            console.log(`👁️ Загрузка товара #${productId}...`);

            // Показываем загрузку в модальном окне
            this.openProductModalLoading();

            const response = await fetch(`/api/products/${productId}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const product = await response.json();

            if (product.error) {
                throw new Error(product.error);
            }

            this.currentProduct = product;
            this.renderProductModal(product);

        } catch (error) {
            console.error('❌ Ошибка загрузки товара:', error);
            this.showNotification('❌ Не удалось загрузить товар', 'error');
            this.closeProductModal();
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
        const modal = document.getElementById('productModal');
        if (!modal) return;

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
                            <h4>Описание:</h4>
                            <p>${product.description || 'Описание отсутствует'}</p>
                        </div>

                        <div class="product-modal-stock ${product.stock > 0 ? 'in-stock' : 'out-of-stock'}">
                            <i class="fas ${product.stock > 0 ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${product.stock > 0 ? `В наличии: ${product.stock} шт.` : 'Нет в наличии'}
                        </div>

                        ${product.stock > 0 ? `
                            <div class="product-modal-actions">
                                <div class="quantity-selector">
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

                                <button class="btn btn-primary btn-block" id="addToCartModal">
                                    <i class="fas fa-cart-plus"></i> Добавить в корзину
                                </button>
                            </div>
                        ` : `
                            <button class="btn btn-secondary btn-block" disabled>
                                <i class="fas fa-times-circle"></i> Товар закончился
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;

        // Назначаем обработчики для нового модального окна
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
        this.updateCartDisplay();
        this.updateCartCount();

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
        this.cart = this.cart.filter(item => item.id !== productId);
        this.saveCart();
        this.updateCartDisplay();
        this.updateCartCount();
        this.showNotification('🗑️ Товар удален из корзины', 'info');
    }

    updateCartItem(productId, quantity) {
        const itemIndex = this.cart.findIndex(item => item.id === productId);

        if (itemIndex !== -1) {
            if (quantity < 1) {
                this.removeFromCart(productId);
            } else {
                this.cart[itemIndex].quantity = quantity;
                this.saveCart();
                this.updateCartDisplay();
                this.updateCartCount();
            }
        }
    }

    updateCartItemQuantity(productId, quantity) {
        this.updateCartItem(productId, quantity);
    }

    clearCart() {
        if (this.cart.length === 0) {
            this.showNotification('Корзина уже пуста', 'info');
            return;
        }

        if (confirm('Вы уверены, что хотите очистить корзину?')) {
            this.cart = [];
            this.saveCart();
            this.updateCartDisplay();
            this.updateCartCount();
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
        const cartItems = document.getElementById('cartItems');
        const cartTotal = document.getElementById('cartTotal');
        const emptyCart = document.getElementById('emptyCart');

        if (!cartItems || !cartTotal || !emptyCart) return;

        if (this.cart.length === 0) {
            cartItems.innerHTML = '';
            emptyCart.style.display = 'block';
            cartTotal.textContent = '0 ₽';
            return;
        }

        emptyCart.style.display = 'none';

        // Сортируем по дате добавления (новые сверху)
        const sortedCart = [...this.cart].sort((a, b) =>
            new Date(b.addedAt || 0) - new Date(a.addedAt || 0)
        );

        cartItems.innerHTML = sortedCart.map(item => `
            <div class="cart-item" data-id="${item.id}">
                <img src="${item.image || 'https://via.placeholder.com/80'}"
                     alt="${item.name}"
                     class="cart-item-image"
                     onerror="this.src='https://via.placeholder.com/80'">
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
        `).join('');

        const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotal.textContent = `${this.formatPrice(total)} ₽`;
    }

    toggleCart() {
        this.updateCartDisplay();
        const cartOverlay = document.getElementById('cartOverlay');
        if (cartOverlay) {
            cartOverlay.style.display = 'flex';
            this.updateBackButton();
        }
    }

    closeCart() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (cartOverlay) {
            cartOverlay.style.display = 'none';
            this.updateBackButton();
        }
    }

    // ========== ОФОРМЛЕНИЕ ЗАКАЗА ==========
    async checkout() {
        if (this.cart.length === 0) {
            this.showNotification('❌ Корзина пуста!', 'error');
            return;
        }

        // Проверяем наличие товаров
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

        try {
            let userData = {
                user_id: 0,
                username: 'Гость',
                first_name: '',
                last_name: ''
            };

            // Получаем данные пользователя из Telegram
            if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
                const user = Telegram.WebApp.initDataUnsafe.user;
                userData = {
                    user_id: user.id || 0,
                    username: user.username || '',
                    first_name: user.first_name || '',
                    last_name: user.last_name || ''
                };
            }

            const orderData = {
                ...userData,
                items: this.cart.map(item => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity
                })),
                total: this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
                created_at: new Date().toISOString()
            };

            console.log('📤 Отправка заказа:', orderData);

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
                // Очищаем корзину
                this.cart = [];
                this.saveCart();
                this.updateCartDisplay();
                this.updateCartCount();
                this.closeCart();

                // Показываем уведомление
                let message = `✅ Заказ #${result.order_id} успешно оформлен!`;
                if (window.Telegram?.WebApp) {
                    Telegram.WebApp.showAlert(message);
                }
                this.showNotification(message, 'success');

                // Обновляем список товаров (могли измениться остатки)
                this.loadProducts();

            } else {
                throw new Error(result.error || 'Неизвестная ошибка сервера');
            }

        } catch (error) {
            console.error('❌ Ошибка оформления заказа:', error);
            this.showNotification(`❌ Ошибка оформления заказа: ${error.message}`, 'error');
        }
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
        if (document.getElementById('telegram-shop-styles')) return;

        const style = document.createElement('style');
        style.id = 'telegram-shop-styles';
        style.textContent = `
            /* Общие стили магазина */
            .products-grid {
                display: flex;
                flex-direction: column;
                gap: 20px;
                margin: 20px 0;
            }

            .products-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
            }

            @media (max-width: 768px) {
                .products-row {
                    grid-template-columns: 1fr;
                }
            }

            .product-card {
                background: white;
                border-radius: 15px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                transition: transform 0.3s, box-shadow 0.3s;
                display: flex;
                flex-direction: column;
                height: 100%;
            }

            .product-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
            }

            .product-card.empty {
                visibility: hidden;
            }

            .product-image-container {
                position: relative;
                height: 180px;
                overflow: hidden;
            }

            .product-image {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.3s;
            }

            .product-card:hover .product-image {
                transform: scale(1.05);
            }

            .out-of-stock {
                position: absolute;
                top: 10px;
                right: 10px;
                background: rgba(231, 76, 60, 0.9);
                color: white;
                padding: 5px 10px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 500;
            }

            .product-info {
                padding: 15px;
                flex: 1;
                display: flex;
                flex-direction: column;
            }

            .product-title {
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 8px 0;
                color: #2c3e50;
                line-height: 1.3;
            }

            .product-description {
                font-size: 14px;
                color: #7f8c8d;
                margin: 0 0 12px 0;
                line-height: 1.4;
                flex: 1;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
            }

            .product-price {
                font-size: 20px;
                font-weight: 700;
                color: #667eea;
                margin: 8px 0;
            }

            .product-stock {
                font-size: 13px;
                margin: 8px 0 15px 0;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .product-stock i {
                font-size: 14px;
            }

            .product-stock .fa-check-circle {
                color: #2ecc71;
            }

            .product-stock .fa-times-circle {
                color: #e74c3c;
            }

            /* Модальное окно товара */
            .product-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 1000;
                padding: 20px;
                backdrop-filter: blur(5px);
            }

            .product-modal {
                background: white;
                border-radius: 20px;
                width: 100%;
                max-width: 800px;
                max-height: 90vh;
                overflow: hidden;
                position: relative;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
            }

            .close-product-modal {
                position: absolute;
                top: 15px;
                right: 15px;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: white;
                border: none;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                cursor: pointer;
                z-index: 10;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                color: #666;
                transition: all 0.2s;
            }

            .close-product-modal:hover {
                background: #f8f9fa;
                transform: scale(1.1);
            }

            .product-modal-content {
                display: grid;
                grid-template-columns: 1fr 1fr;
                min-height: 400px;
            }

            @media (max-width: 768px) {
                .product-modal-content {
                    grid-template-columns: 1fr;
                }
            }

            .product-modal-image-container {
                background: #f8f9fa;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }

            .product-modal-image {
                width: 100%;
                height: 300px;
                object-fit: contain;
                border-radius: 10px;
            }

            .product-modal-info {
                padding: 30px;
                display: flex;
                flex-direction: column;
                gap: 15px;
                overflow-y: auto;
                max-height: 70vh;
            }

            .product-modal-title {
                font-size: 24px;
                font-weight: 700;
                color: #2c3e50;
                margin: 0;
            }

            .product-modal-price {
                font-size: 28px;
                font-weight: 700;
                color: #667eea;
            }

            .product-modal-description {
                margin: 10px 0;
            }

            .product-modal-description h4 {
                font-size: 16px;
                color: #7f8c8d;
                margin-bottom: 8px;
            }

            .product-modal-description p {
                font-size: 15px;
                line-height: 1.6;
                color: #555;
            }

            .product-modal-stock {
                padding: 10px 15px;
                border-radius: 10px;
                font-size: 15px;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .product-modal-stock.in-stock {
                background: rgba(46, 204, 113, 0.1);
                color: #27ae60;
                border: 1px solid rgba(46, 204, 113, 0.3);
            }

            .product-modal-stock.out-of-stock {
                background: rgba(231, 76, 60, 0.1);
                color: #c0392b;
                border: 1px solid rgba(231, 76, 60, 0.3);
            }

            .product-modal-actions {
                margin-top: auto;
                display: flex;
                flex-direction: column;
                gap: 15px;
            }

            .quantity-selector {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 15px;
                margin: 10px 0;
            }

            .qty-btn {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 2px solid #667eea;
                background: white;
                color: #667eea;
                font-size: 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .qty-btn:hover:not(:disabled) {
                background: #667eea;
                color: white;
            }

            .qty-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            #quantity {
                width: 60px;
                height: 40px;
                text-align: center;
                font-size: 18px;
                font-weight: 600;
                border: 2px solid #e9ecef;
                border-radius: 10px;
                background: #f8f9fa;
            }

            /* Корзина */
            .cart-item {
                display: flex;
                gap: 15px;
                padding: 15px;
                border-bottom: 1px solid #eee;
                align-items: center;
            }

            .cart-item:last-child {
                border-bottom: none;
            }

            .cart-item-image {
                width: 80px;
                height: 80px;
                object-fit: cover;
                border-radius: 10px;
            }

            .cart-item-info {
                flex: 1;
            }

            .cart-item-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 5px;
            }

            .cart-item-name {
                font-size: 16px;
                font-weight: 600;
                margin: 0;
                color: #2c3e50;
            }

            .remove-item {
                background: none;
                border: none;
                color: #e74c3c;
                cursor: pointer;
                font-size: 16px;
                padding: 5px;
            }

            .cart-item-price {
                font-size: 14px;
                color: #667eea;
                font-weight: 500;
                margin-bottom: 10px;
            }

            .cart-item-controls {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .quantity-selector.small {
                gap: 10px;
            }

            .quantity-selector.small .qty-btn {
                width: 30px;
                height: 30px;
                font-size: 12px;
            }

            .quantity {
                font-size: 14px;
                font-weight: 600;
                min-width: 40px;
                text-align: center;
            }

            .cart-item-total {
                font-size: 16px;
                font-weight: 700;
                color: #2c3e50;
            }

            /* Уведомления */
            #notifications {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
            }

            .notification {
                background: white;
                border-radius: 12px;
                padding: 15px 20px;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
                display: flex;
                align-items: center;
                gap: 15px;
                transform: translateX(120%);
                transition: transform 0.3s ease;
                border-left: 4px solid #3498db;
            }

            .notification.show {
                transform: translateX(0);
            }

            .notification-success {
                border-left-color: #2ecc71;
            }

            .notification-error {
                border-left-color: #e74c3c;
            }

            .notification-warning {
                border-left-color: #f39c12;
            }

            .notification-icon {
                font-size: 20px;
            }

            .notification-success .notification-icon {
                color: #2ecc71;
            }

            .notification-error .notification-icon {
                color: #e74c3c;
            }

            .notification-warning .notification-icon {
                color: #f39c12;
            }

            .notification-content {
                flex: 1;
                font-size: 14px;
                line-height: 1.4;
            }

            /* Уведомление корзины */
            .cart-notification {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: white;
                border-radius: 12px;
                padding: 15px;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
                z-index: 9998;
                transform: translateY(100%);
                opacity: 0;
                transition: transform 0.3s ease, opacity 0.3s ease;
                max-width: 350px;
            }

            .cart-notification.show {
                transform: translateY(0);
                opacity: 1;
            }

            .notification-content {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .notification-message {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 14px;
                color: #2c3e50;
            }

            .notification-message i {
                color: #2ecc71;
                font-size: 18px;
            }

            .notification-action {
                background: #667eea;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 10px 15px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: background 0.2s;
            }

            .notification-action:hover {
                background: #5a67d8;
            }

            /* Состояния загрузки */
            .loading-modal {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 50px;
                color: #667eea;
            }

            .loading-modal i {
                font-size: 40px;
                margin-bottom: 15px;
            }

            .loading-modal p {
                font-size: 16px;
            }

            .no-products {
                text-align: center;
                padding: 50px 20px;
                color: #7f8c8d;
            }

            .no-products i {
                font-size: 60px;
                margin-bottom: 15px;
                opacity: 0.3;
            }

            .no-products h3 {
                font-size: 20px;
                margin-bottom: 10px;
                color: #666;
            }

            /* Анимации */
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }

            @keyframes fadeIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `;

        document.head.appendChild(style);
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

// Экспортируем класс для использования в других файлах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TelegramShop;
}