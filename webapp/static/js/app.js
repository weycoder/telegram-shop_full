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

        // Назначаем обработчики
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
        console.log(`🗑️ Удаление товара #${productId} из корзины`);

        // Находим товар перед удалением для уведомления
        const item = this.cart.find(item => item.id == productId);

        // Фильтруем корзину (используем == вместо === для безопасности типов)
        this.cart = this.cart.filter(item => item.id != productId);

        console.log(`📊 В корзине осталось: ${this.cart.length} товаров`);

        this.saveCart();
        this.updateCartCount();

        // ОБЯЗАТЕЛЬНО обновляем отображение корзины
        this.updateCartDisplay();

        // Показываем уведомление только если товар был найден
        if (item) {
            this.showNotification(`🗑️ "${item.name}" удален из корзины`, 'info');
        }

        // Если корзина стала пустой, показываем отдельное уведомление
        if (this.cart.length === 0) {
            setTimeout(() => {
                this.showNotification('🛒 Корзина пуста', 'info');
            }, 500);
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
        this.updateCartItem(productId, quantity);
    }

    clearCart() {
        if (this.cart.length === 0) {
            this.showNotification('🛒 Корзина уже пуста', 'info');
            return;
        }

        if (confirm('Вы уверены, что хотите очистить корзину?')) {
            this.cart = [];
            this.saveCart();
            this.updateCartCount();

            // СРАЗУ обновляем отображение корзины
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
        console.log(`🔄 Обновление отображения корзины. Товаров: ${this.cart.length}`);
        
        const cartItems = document.getElementById('cartItems');
        const cartTotal = document.getElementById('cartTotal');
        const emptyCart = document.getElementById('emptyCart');

        if (!cartItems || !cartTotal || !emptyCart) {
            console.error('❌ Элементы корзины не найдены');
            return;
        }

        // Всегда проверяем состояние корзины
        if (this.cart.length === 0) {
            console.log('🛒 Корзина пуста - показываем блок "Корзина пуста"');

            // Очищаем список товаров
            cartItems.innerHTML = '';

            // ПОКАЗЫВАЕМ сообщение о пустой корзине
            emptyCart.style.display = 'flex';

            // Обнуляем сумму
            cartTotal.textContent = '0 ₽';
            return;
        }

        console.log(`📦 В корзине ${this.cart.length} товаров, обновляем список...`);

        // Если товары есть - СКРЫВАЕМ блок "Корзина пуста"
        emptyCart.style.display = 'none';

        // Сортируем по дате добавления (новые сверху)
        const sortedCart = [...this.cart].sort((a, b) =>
            new Date(b.addedAt || 0) - new Date(a.addedAt || 0)
        );

        // Генерируем HTML для каждого товара
        const itemsHTML = sortedCart.map(item => {
            console.log(`📝 Генерация карточки для товара: ${item.name}, количество: ${item.quantity}`);
            return `
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
            `;
        }).join('');

        // ВСТАВЛЯЕМ сгенерированный HTML
        cartItems.innerHTML = itemsHTML;

        // Считаем общую сумму
        const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotal.textContent = `${this.formatPrice(total)} ₽`;

        console.log('✅ Отображение корзины обновлено');
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


    toggleCart() {
        // Всегда обновляем отображение перед открытием
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

// Экспортируем класс для использования в других файлах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TelegramShop;
}