// Telegram Shop - Полная версия с всеми функциями
console.log('🟢 app.js начал загружаться');

function getTelegramParams() {
    try {
        const urlParams = new URLSearchParams(window.location.search);

        // 1. Пробуем получить из URL
        let userId = parseInt(urlParams.get('user_id')) || 0;
        let username = urlParams.get('username') || 'Гость';

        console.log('🔗 Параметры из URL:', { userId, username });

        // 2. Если userId = 0, пробуем получить из localStorage
        if (userId === 0) {
            const savedId = localStorage.getItem('telegram_user_id');
            const savedUsername = localStorage.getItem('telegram_username');

            if (savedId && savedId !== '0') {
                userId = parseInt(savedId);
                username = savedUsername || 'Пользователь';
                console.log('💾 Восстановлено из localStorage:', { userId, username });
            }
        }

        // 3. Если все еще 0, но есть Telegram Web App данные
        if (userId === 0 && window.Telegram?.WebApp?.initDataUnsafe?.user) {
            const tgUser = Telegram.WebApp.initDataUnsafe.user;
            userId = tgUser.id || 0;
            username = tgUser.username || tgUser.first_name || 'Telegram User';
            console.log('🤖 Получено из Telegram WebApp:', { userId, username });

            // Сохраняем в localStorage
            localStorage.setItem('telegram_user_id', userId);
            localStorage.setItem('telegram_username', username);
        }

        console.log('✅ Итоговые параметры пользователя:', { userId, username });

        return {
            userId: userId,
            username: username
        };
    } catch (error) {
        console.error('❌ Ошибка получения параметров Telegram:', error);
        return {
            userId: 0,
            username: 'Гость'
        };
    }
}

class TelegramShop {
    constructor() {
        this.cart = this.loadCart();
        this.currentProduct = null;
        this.products = [];
        this.categories = [];
        this.isInitialized = false;
        this.deliveryData = {
            type: null,
            address_id: null,
            pickup_point: null,
            address_details: null
        };
        this.discounts = [];
        this.promo_codes = [];

        // Новые свойства для весовых товаров
        this.selectedWeight = 0.1;
        this.selectedWeightPrice = 0;

        // Получаем параметры Telegram
        const params = getTelegramParams();
        this.userId = params.userId;
        this.username = params.username;

        this.saveUserToLocalStorage();
        console.log('🛍️ Telegram Shop создан для пользователя:', this.username, 'ID:', this.userId);
    }


    async init() {
        if (this.isInitialized) return;

        console.log('🚀 Инициализация магазина...');

        this.addStyles();
        this.bindEvents();

        // Загружаем данные параллельно
        await Promise.all([
            this.loadProducts(),
            this.loadCategories(),
            this.loadDiscounts(),  // ДОБАВЛЕНО
            this.loadPromoCodes()  // ДОБАВЛЕНО
        ]);

        this.updateCartCount();

        // Telegram Web App интеграция
        if (window.Telegram && Telegram.WebApp) {
            this.initTelegramWebApp();
        }

        this.isInitialized = true;
        console.log('✅ Магазин инициализирован');
    }

    // ДОБАВЬ ЭТИ МЕТОДЫ В КЛАСС:
    saveUserToLocalStorage() {
        if (this.userId && this.userId !== 0) {
            localStorage.setItem('telegram_user_id', this.userId);
            localStorage.setItem('telegram_username', this.username);
            console.log('💾 Пользователь сохранен в localStorage:', { id: this.userId, username: this.username });
        }
    }

    loadUserFromLocalStorage() {
        const savedId = localStorage.getItem('telegram_user_id');
        const savedUsername = localStorage.getItem('telegram_username');

        if (savedId && savedId !== '0') {
            this.userId = parseInt(savedId);
            this.username = savedUsername || 'Пользователь';
            console.log('🔍 Пользователь восстановлен из localStorage:', { id: this.userId, username: this.username });
            return true;
        }
        return false;
    }

        // Методы для работы со скидками
    async loadDiscounts() {
        try {
            console.log('🏷️ Загрузка скидок...');
            const response = await fetch('/api/discounts');  // Измененный путь
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.discounts = await response.json();
            console.log(`✅ Загружено ${this.discounts.length} скидок`);
        } catch (error) {
            console.error('❌ Ошибка загрузки скидок:', error);
            this.discounts = [];
        }
    }

    async loadPromoCodes() {
        try {
            console.log('🎟️ Загрузка промокодов...');
            const response = await fetch('/api/promo-codes');  // Измененный путь
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.promo_codes = await response.json();
            console.log(`✅ Загружено ${this.promo_codes.length} промокодов`);
        } catch (error) {
            console.error('❌ Ошибка загрузки промокодов:', error);
            this.promo_codes = [];
        }
    }

        // Расчет цены со скидкой
    calculateDiscountedPrice(originalPrice, discount) {
        if (!discount) return originalPrice;

        let discountedPrice = originalPrice;

        switch (discount.discount_type) {
            case 'percentage':
                discountedPrice = originalPrice * (1 - discount.value / 100);
                break;

            case 'fixed':
                discountedPrice = originalPrice - discount.value;
                break;

            case 'bogo':
                // "Купи 1 получи 2" - не меняем цену здесь, показываем отдельно
                return originalPrice;

            case 'free_delivery':
                // Бесплатная доставка - не влияет на цену товара
                return originalPrice;
        }

        // Цена не может быть меньше 0
        return Math.max(discountedPrice, 0);
    }

    // Форматирование скидки для отображения
    formatDiscountInfo(discount) {
        if (!discount) return '';

        switch (discount.discount_type) {
            case 'percentage':
                return `-${discount.value}%`;
            case 'fixed':
                return `-${this.formatPrice(discount.value)} ₽`;
            case 'bogo':
                return '2 по цене 1';
            case 'free_delivery':
                return 'Бесплатная доставка';
            default:
                return discount.discount_type;
        }
    }

    // Расчет скидки для товара
    calculateProductDiscount(product) {
        if (!this.discounts || this.discounts.length === 0) {
            return null;
        }

        const now = new Date();
        const activeDiscounts = this.discounts.filter(discount =>
            discount.is_active &&
            (!discount.start_date || new Date(discount.start_date) <= now) &&
            (!discount.end_date || new Date(discount.end_date) >= now)
        );

        for (const discount of activeDiscounts) {
            let applies = false;

            switch (discount.apply_to) {
                case 'all':
                    applies = true;
                    break;

                case 'category':
                    applies = product.category === discount.target_category;
                    break;

                case 'product':
                    applies = product.id === discount.target_product_id;
                    break;
            }

            if (applies) {
                return discount;
            }
        }

        return null;
    }


    async createOrder(orderData) {
        if (this.userId && this.userId !== 0) {
            localStorage.setItem('telegram_user_id', this.userId);
            localStorage.setItem('telegram_username', this.username || 'Пользователь');
            console.log('💾 Пользователь сохранен в localStorage:', { id: this.userId, username: this.username });
        } else {
            // Если userId = 0, пробуем получить из localStorage
            const savedId = localStorage.getItem('telegram_user_id');
            const savedUsername = localStorage.getItem('telegram_username');

            if (savedId && savedId !== '0') {
                this.userId = parseInt(savedId);
                this.username = savedUsername || 'Пользователь';
                console.log('🔍 Восстановлен пользователь из localStorage:', { id: this.userId, username: this.username });
            }
        }

        // УБЕДИТЕСЬ, что total - это ЧИСЛО, а не строка
        if (orderData.total && typeof orderData.total === 'string') {
            orderData.total = parseFloat(orderData.total);
        }

        // Также преобразуем user_id в число
        orderData.user_id = parseInt(this.userId) || 0;
        orderData.username = this.username || 'Гость';

        // Преобразуем все числа в товарах
        if (orderData.items && Array.isArray(orderData.items)) {
            orderData.items = orderData.items.map(item => ({
                ...item,
                id: parseInt(item.id) || 0,
                quantity: parseInt(item.quantity) || 1,
                price: parseFloat(item.price) || 0
            }));
        }

        console.log('📦 Создание заказа с данными:', orderData);

        try {
            const response = await fetch('/api/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            return await response.json();
        } catch (error) {
            console.error('❌ Ошибка создания заказа:', error);
            throw error;
        }
    }

    // Обновленный bindEvents
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

        // Показываем приветствие
        if (this.userId && this.userId !== 0) {
            const welcomeElement = document.getElementById('welcome-text');
            if (welcomeElement) {
                welcomeElement.innerText = `👋 Привет, ${this.username}!`;
            }
        }

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

        // ДЕЛЕГИРОВАНИЕ ДЛЯ КНОПОК "ПОДРОБНЕЕ"
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
                expand: function () { console.log('[Stub] WebApp расширен'); },
                setHeaderColor: function () { console.log('[Stub] Цвет заголовка изменен'); },
                setBackgroundColor: function () { console.log('[Stub] Фон изменен'); },
                enableClosingConfirmation: function () { console.log('[Stub] Подтверждение закрытия включено'); },
                close: function () {
                    console.log('[Stub] Закрытие WebApp');
                    if (confirm('Закрыть приложение?')) {
                        window.close();
                    }
                },
                BackButton: {
                    isVisible: false,
                    show: function () {
                        console.log('[Stub] Кнопка "Назад" показана');
                        this.isVisible = true;
                    },
                    hide: function () {
                        console.log('[Stub] Кнопка "Назад" скрыта');
                        this.isVisible = false;
                    },
                    onClick: function (callback) {
                        console.log('[Stub] Обработчик кнопки "Назад" установлен');
                        this.callback = callback;
                    }
                },
                colorScheme: 'light'
            };
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

            // Скрываем footer корзины если есть
            const cartFooter = document.querySelector('.cart-footer');
            if (cartFooter) {
                cartFooter.style.display = 'none';
            }

            return;
        }

        // ЕСЛИ В КОРЗИНЕ ЕСТЬ ТОВАРЫ
        console.log(`📦 В корзине ${this.cart.length} товаров`);

        // Генерируем HTML для товаров
        let itemsHTML = '';

        // ИСПРАВЛЕНИЕ: используем this.cart вместо this.cartItems
        this.cart.forEach(item => {
            const priceToShow = item.discounted_price || item.price;
            const totalPrice = priceToShow * item.quantity;

            itemsHTML += `
                <div class="cart-item" data-id="${item.id}">
                    ${item.discount_info ? `
                        <div class="cart-item-discount">
                            <span class="discount-tag-cart">-${this.formatDiscountInfo(item.discount_info)}</span>
                        </div>
                    ` : ''}
                    <img src="${item.image || 'https://via.placeholder.com/80'}"
                         alt="${item.name}"
                         class="cart-item-image">
                    <div class="cart-item-info">
                        <div class="cart-item-header">
                            <h4 class="cart-item-name">${item.name}</h4>
                            <button class="remove-item" onclick="shop.removeFromCart('${item.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        <div class="cart-item-pricing">
                            ${item.discounted_price && item.discounted_price < item.price ? `
                                <div class="cart-price-discounted">
                                    <span class="cart-item-original-price">${this.formatPrice(item.price)} ₽</span>
                                    <span class="cart-item-price">${this.formatPrice(item.discounted_price)} ₽</span>
                                </div>
                            ` : `
                                <div class="cart-item-price">${this.formatPrice(item.price)} ₽</div>
                            `}
                        </div>
                        <div class="cart-item-controls">
                            <div class="quantity-selector small">
                                <button class="qty-btn" onclick="shop.updateCartItemQuantity('${item.id}', ${item.quantity - 1})"
                                        ${item.quantity <= 1 ? 'disabled' : ''}>
                                    <i class="fas fa-minus"></i>
                                </button>
                                <span class="quantity">${item.quantity} шт.</span>
                                <button class="qty-btn" onclick="shop.updateCartItemQuantity('${item.id}', ${item.quantity + 1})">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                            <div class="cart-item-total">
                                ${this.formatPrice(totalPrice)} ₽
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

        // Показываем footer корзины
        const cartFooter = document.querySelector('.cart-footer');
        if (cartFooter) {
            cartFooter.style.display = 'block';
        }

        console.log('✅ Корзина обновлена');
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
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            this.products = await response.json();
            console.log(`✅ Загружено ${this.products.length} товаров`);

            // СРАЗУ применяем скидки к товарам
            await this.applyDiscountsToProducts();

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

    async applyDiscountsToProducts() {
        try {
            // Загружаем активные скидки
            if (this.discounts.length === 0) {
                await this.loadDiscounts();
            }

            // Применяем скидки к каждому товару
            this.products = this.products.map(product => {
                const discount = this.calculateProductDiscount(product);
                if (discount) {
                    // Добавляем информацию о скидке в объект товара
                    product.discount = discount;
                    product.has_discount = true;
                    product.discounted_price = this.calculateDiscountedPrice(product.price, discount);
                    product.original_price = product.price;
                } else {
                    product.has_discount = false;
                    product.discounted_price = product.price;
                }
                return product;
            });

            console.log(`🏷️ Скидки применены к ${this.products.length} товарам`);

        } catch (error) {
            console.error('❌ Ошибка применения скидок:', error);
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
        const inStock = product.stock > 0 || product.stock_weight > 0;
        const isWeightProduct = product.product_type === 'weight';

        // Используем уже рассчитанные значения скидки
        const hasDiscount = product.has_discount === true;
        const discount = product.discount;
        const discountedPrice = product.discounted_price || product.price;
        const originalPrice = product.original_price || product.price;

        return `
            <div class="product-card ${hasDiscount ? 'has-discount' : ''}">
                ${hasDiscount ? `
                    <div class="discount-badge">
                        ${this.formatDiscountInfo(discount)}
                    </div>
                ` : ''}

                <div class="product-image-container">
                    <img src="${product.image_url || 'https://via.placeholder.com/300x200'}"
                         alt="${product.name}"
                         class="product-image"
                         onerror="this.src='https://via.placeholder.com/300x200'">
                    ${!inStock ? '<div class="out-of-stock">Нет в наличии</div>' : ''}
                </div>
                <div class="product-info">
                    <h3 class="product-title">${product.name}</h3>
                    ${isWeightProduct ? `
                        <div class="weight-product-badge">
                            <i class="fas fa-weight-hanging"></i> Весовой товар
                        </div>
                    ` : ''}

                    <div class="product-pricing">
                        ${hasDiscount ? `
                            <div class="price-container">
                                <div class="original-price">
                                    ${this.formatPrice(originalPrice)} ₽
                                </div>
                                <div class="discounted-price">
                                    ${this.formatPrice(discountedPrice)} ₽
                                </div>
                            </div>
                        ` : `
                            <div class="product-price">
                                ${isWeightProduct ?
                                    `${this.formatPrice(product.price_per_kg || product.price)} ₽/кг` :
                                    `${this.formatPrice(product.price)} ₽`
                                }
                            </div>
                        `}
                    </div>

                    <div class="product-stock ${inStock ? '' : 'stock-unavailable'}">
                        <i class="fas ${inStock ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        ${isWeightProduct ?
                            `В наличии: ${product.stock_weight || 0} кг` :
                            `В наличии: ${product.stock} шт.`
                        }
                    </div>
                    <button class="btn-block" onclick="shop.viewProduct(${product.id})"
                            ${!inStock ? 'disabled' : ''}>
                        <i class="fas ${isWeightProduct ? 'fa-weight' : 'fa-eye'}"></i>
                        ${isWeightProduct ? 'Выбрать вес' : 'Подробнее'}
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

    setExactWeight(weight) {
        const input = document.getElementById('exactWeight');
        const slider = document.getElementById('weightSlider');
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);

        if (weight < min) weight = min;
        if (weight > max) weight = max;

        input.value = weight.toFixed(2);
        slider.value = weight;
        this.updateWeightFromInput();
    }


    updateWeightFromInput() {
        const input = document.getElementById('exactWeight');
        const slider = document.getElementById('weightSlider');
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);

        let value = parseFloat(input.value) || min;
        if (value < min) value = min;
        if (value > max) value = max;

        input.value = value.toFixed(2);
        slider.value = value;

        const currentWeightSpan = document.getElementById('currentWeightValue');
        const selectedWeightSpan = document.getElementById('selectedWeight');
        const calculatedPriceSpan = document.getElementById('calculatedPrice');

        const unit = this.currentProduct?.unit || 'кг';
        const pricePerKg = this.currentProduct?.price_per_kg || 0;
        const price = Math.floor(value * pricePerKg); // Округляем вниз

        currentWeightSpan.textContent = value.toFixed(2) + ' ' + unit;
        selectedWeightSpan.textContent = value.toFixed(2) + ' ' + unit;
        calculatedPriceSpan.textContent = this.formatPrice(price) + ' ₽';

        this.selectedWeight = value;
        this.selectedWeightPrice = price;
    }

    // Метод добавления весового товара в корзину
    addWeightProductToCart(productId) {
        if (!this.currentProduct) return;

        const weight = this.selectedWeight || this.currentProduct.min_weight || 0.1;
        const price = this.selectedWeightPrice || 0;

        if (weight <= 0) {
            this.showNotification('❌ Выберите вес товара', 'error');
            return;
        }

        this.addToCart(
            productId,
            `${this.currentProduct.name} (${weight.toFixed(2)} ${this.currentProduct.unit || 'кг'})`,
            price,
            1, // Количество всегда 1 для весового товара
            this.currentProduct.image_url
        );

        this.closeProductModal();
    }




        // Методы для работы с весом
    adjustWeight(delta) {
        const input = document.getElementById('exactWeight');
        const slider = document.getElementById('weightSlider');
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);

        let currentValue = parseFloat(input.value) || min;
        let newValue = currentValue + delta;

        if (newValue < min) newValue = min;
        if (newValue > max) newValue = max;

        input.value = newValue.toFixed(2);
        slider.value = newValue;

        this.updateWeightFromInput();
    }



        // Новый метод для отображения весового товара
    renderWeightProductModal(product) {
        const modal = document.getElementById('productModal');
        if (!modal) {
            console.error('❌ Модальное окно не найдено');
            return;
        }

        const pricePerKg = product.price_per_kg || 0;
        const minWeight = product.min_weight || 0.1;
        const maxWeight = product.max_weight || 5.0;
        const stepWeight = product.step_weight || 0.1;
        const stockWeight = product.stock_weight || 0;
        const unit = product.unit || 'кг';

        // Округляем до целых рублей
        const calculatePrice = (weight) => {
            const exactPrice = weight * pricePerKg;
            return Math.floor(exactPrice); // Округляем вниз до целых рублей
        };

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

                        <div class="weight-product-label">
                            <i class="fas fa-weight-hanging"></i> Весовой товар
                        </div>

                        <div class="product-modal-pricing">
                            <div class="price-per-unit">
                                <span class="price-label">Цена за ${unit}:</span>
                                <span class="price-value">${this.formatPrice(pricePerKg)} ₽</span>
                            </div>
                        </div>

                        <div class="product-modal-description">
                            <h4><i class="fas fa-info-circle"></i> Описание:</h4>
                            <p>${product.description || 'Описание отсутствует'}</p>
                        </div>

                        <div class="weight-selector-section">
                            <h4><i class="fas fa-balance-scale"></i> Выберите вес:</h4>

                            <div class="weight-info">
                                <div class="weight-limits">
                                    <span>От: ${minWeight} ${unit}</span>
                                    <span>До: ${Math.min(maxWeight, stockWeight)} ${unit}</span>
                                </div>
                                ${stockWeight > 0 ? `
                                    <div class="stock-weight">
                                        <i class="fas fa-box"></i>
                                        В наличии: ${stockWeight} ${unit}
                                    </div>
                                ` : ''}
                            </div>

                            <!-- Ползунок для выбора веса -->
                            <div class="weight-slider-container">
                                <input type="range"
                                       id="weightSlider"
                                       min="${minWeight}"
                                       max="${Math.min(maxWeight, stockWeight)}"
                                       step="${stepWeight}"
                                       value="${minWeight}"
                                       class="weight-slider">
                                <div class="slider-labels">
                                    <span>${minWeight} ${unit}</span>
                                    <span id="currentWeightValue">${minWeight} ${unit}</span>
                                    <span>${Math.min(maxWeight, stockWeight)} ${unit}</span>
                                </div>
                            </div>

                            <!-- Точный ввод веса -->
                            <div class="weight-input-container">
                                <label for="exactWeight">Точный вес (${unit}):</label>
                                <div class="weight-input-group">
                                    <button class="weight-btn" onclick="shop.adjustWeight(-${stepWeight})">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <input type="number"
                                           id="exactWeight"
                                           value="${minWeight}"
                                           min="${minWeight}"
                                           max="${Math.min(maxWeight, stockWeight)}"
                                           step="${stepWeight}"
                                           onchange="shop.updateWeightFromInput()">
                                    <button class="weight-btn" onclick="shop.adjustWeight(${stepWeight})">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Быстрый выбор -->
                            <div class="quick-weight-selection">
                                <h5>Быстрый выбор:</h5>
                                <div class="quick-weights">
                                    ${[0.1, 0.25, 0.5, 1, 2, 3, 5]
                                        .filter(w => w >= minWeight && w <= Math.min(maxWeight, stockWeight))
                                        .map(w => `
                                        <button class="quick-weight-btn" onclick="shop.setExactWeight(${w})">
                                            ${w} ${unit}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <div class="weight-price-summary">
                            <div class="weight-selected">
                                <span>Выбрано:</span>
                                <span id="selectedWeight">${minWeight} ${unit}</span>
                            </div>
                            <div class="price-calculated">
                                <span>Стоимость:</span>
                                <span id="calculatedPrice" class="total-price">${this.formatPrice(calculatePrice(minWeight))} ₽</span>
                            </div>
                            <div class="price-note">
                                <small><i class="fas fa-info-circle"></i> Цена округляется до целых рублей</small>
                            </div>
                        </div>

                        ${stockWeight > 0 ? `
                            <button class="btn btn-primary" id="addWeightToCart" onclick="shop.addWeightProductToCart(${product.id})">
                                <i class="fas fa-cart-plus"></i> Добавить в корзину
                            </button>
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

        // Инициализация ползунка
        const weightSlider = document.getElementById('weightSlider');
        const exactWeightInput = document.getElementById('exactWeight');
        const currentWeightSpan = document.getElementById('currentWeightValue');
        const selectedWeightSpan = document.getElementById('selectedWeight');
        const calculatedPriceSpan = document.getElementById('calculatedPrice');

        const updateDisplay = () => {
            const weight = parseFloat(weightSlider.value);
            const price = calculatePrice(weight);

            currentWeightSpan.textContent = weight.toFixed(2) + ' ' + unit;
            selectedWeightSpan.textContent = weight.toFixed(2) + ' ' + unit;
            calculatedPriceSpan.textContent = this.formatPrice(price) + ' ₽';
            exactWeightInput.value = weight.toFixed(2);

            // Сохраняем выбранный вес
            this.selectedWeight = weight;
            this.selectedWeightPrice = price;
        };

        weightSlider.addEventListener('input', () => {
            exactWeightInput.value = weightSlider.value;
            updateDisplay();
        });

        exactWeightInput.addEventListener('input', () => {
            let value = parseFloat(exactWeightInput.value) || minWeight;
            if (value < minWeight) value = minWeight;
            if (value > Math.min(maxWeight, stockWeight)) value = Math.min(maxWeight, stockWeight);

            weightSlider.value = value;
            updateDisplay();
        });

        // Инициализация
        updateDisplay();

        // Назначаем обработчики
        this.bindEvent('closeProductModal', 'click', () => this.closeProductModal());
    }



    async viewProduct(productId) {
        try {
            console.log(`👁️ Загрузка товара #${productId}...`);
            this.openProductModalLoading();

            const response = await fetch(`/api/products/${productId}`);
            const product = await response.json();

            if (product.error) {
                throw new Error(product.error);
            }

            console.log('✅ Товар загружен:', product);
            this.currentProduct = product;

            // Если это весовой товар, показываем специальное модальное окно
            if (product.product_type === 'weight') {
                this.renderWeightProductModal(product);
            } else {
                this.renderProductModal(product);
            }

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

        const discount = this.calculateProductDiscount(product);
        const discountedPrice = discount ? this.calculateDiscountedPrice(product.price, discount) : product.price;
        const hasDiscount = discount && discountedPrice < product.price;

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
                        ${hasDiscount ? `
                            <div class="discount-badge-large">
                                ${this.formatDiscountInfo(discount)}
                            </div>
                        ` : ''}
                        <img src="${product.image_url || 'https://via.placeholder.com/400x300'}"
                             alt="${product.name}"
                             class="product-modal-image"
                             onerror="this.src='https://via.placeholder.com/400x300'">
                    </div>
                    <div class="product-modal-info">
                        <h3 class="product-modal-title">${product.name}</h3>

                        <div class="product-modal-pricing">
                            ${hasDiscount ? `
                                <div class="price-container-modal">
                                    <div class="original-price-modal">
                                        ${this.formatPrice(product.price)} ₽
                                    </div>
                                    <div class="discounted-price-modal">
                                        ${this.formatPrice(discountedPrice)} ₽
                                    </div>
                                    <div class="discount-savings">
                                        <i class="fas fa-piggy-bank"></i>
                                        Экономия: ${this.formatPrice(product.price - discountedPrice)} ₽
                                    </div>
                                </div>
                            ` : `
                                <div class="product-modal-price">${this.formatPrice(product.price)} ₽</div>
                            `}
                        </div>

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
        // В методе addToCart добавьте обработку весовых товаров:
    addToCart(productId, name, price, quantity = 1, image = null) {
        // Для весовых товаров проверяем тип
        const product = this.products.find(p => p.id === productId);
        const isWeightProduct = product?.product_type === 'weight';

        const discount = product ? this.calculateProductDiscount(product) : null;
        const discountedPrice = discount ? this.calculateDiscountedPrice(price, discount) : price;

        // Для весовых товаров создаем уникальный ID с весом
        const cartItemId = isWeightProduct ? `${productId}_${Date.now()}` : productId;

        const existingIndex = this.cart.findIndex(item => item.id === cartItemId);

        if (existingIndex !== -1) {
            // Для весовых товаров не увеличиваем количество, а создаем новую запись
            if (isWeightProduct) {
                this.cart.push({
                    id: `${productId}_${Date.now() + 1}`, // Уникальный ID
                    name: name,
                    price: price,
                    discounted_price: discountedPrice,
                    discount_info: discount,
                    quantity: 1,
                    image: image || 'https://via.placeholder.com/100',
                    weight: this.selectedWeight,
                    is_weight: true,
                    original_product_id: productId,
                    addedAt: new Date().toISOString()
                });
            } else {
                // Для штучных товаров увеличиваем количество
                this.cart[existingIndex].quantity += quantity;
                this.cart[existingIndex].discounted_price = discountedPrice;
                this.cart[existingIndex].discount_info = discount;
            }
        } else {
            this.cart.push({
                id: cartItemId,
                name: name,
                price: price,
                discounted_price: discountedPrice,
                discount_info: discount,
                quantity: isWeightProduct ? 1 : quantity,
                image: image || 'https://via.placeholder.com/100',
                weight: isWeightProduct ? this.selectedWeight : null,
                is_weight: isWeightProduct,
                original_product_id: productId,
                addedAt: new Date().toISOString()
            });
        }

        this.saveCart();
        this.updateCartCount();

        if (this.isCartOpen()) {
            this.updateCartDisplay();
        }

        this.showCartNotification(name, isWeightProduct ? 1 : quantity);
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

        // Рассчитываем сумму с доставкой для всплывающей подсказки
        const itemsTotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        let deliveryCost = 0;

        if (this.deliveryData.type === 'courier' && itemsTotal < 1000) {
            deliveryCost = 100;
        }

        const totalWithDelivery = itemsTotal + deliveryCost;

        if (cartCount) {
            cartCount.textContent = totalItems;
            cartCount.style.display = totalItems > 0 ? 'flex' : 'none';

            // Добавляем подсказку с суммой
            cartCount.title = `Товаров: ${totalItems} шт.\nСумма: ${this.formatPrice(itemsTotal)} ₽\nДоставка: ${deliveryCost > 0 ? deliveryCost + ' ₽' : 'Бесплатно'}\nИтого: ${this.formatPrice(totalWithDelivery)} ₽`;
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
            const priceToShow = item.discounted_price || item.price;
            const totalPrice = priceToShow * item.quantity;

            itemsHTML += `
                <div class="cart-item" data-id="${item.id}">
                    ${item.discount_info ? `
                        <div class="cart-item-discount">
                            <span class="discount-tag-cart">-${this.formatDiscountInfo(item.discount_info)}</span>
                        </div>
                    ` : ''}
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
                        <div class="cart-item-pricing">
                            ${item.discounted_price && item.discounted_price < item.price ? `
                                <div class="cart-price-discounted">
                                    <span class="cart-item-original-price">${this.formatPrice(item.price)} ₽</span>
                                    <span class="cart-item-price">${this.formatPrice(item.discounted_price)} ₽</span>
                                </div>
                            ` : `
                                <div class="cart-item-price">${this.formatPrice(item.price)} ₽</div>
                            `}
                        </div>
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
                                ${this.formatPrice(totalPrice)} ₽
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

        // Рассчитываем стоимость
        const itemsTotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        let deliveryCost = 0;

        if (itemsTotal < 1000) {
            deliveryCost = 100;
        }

        cartOverlay.innerHTML = `
            <div class="cart-modal" style="padding: 0;">
                <div class="cart-header" style="background: linear-gradient(135deg, #4CAF50, #388E3C); color: white; border: none;">
                    <h2><i class="fas fa-truck"></i> Способ доставки</h2>
                    <button class="close-cart" id="closeDeliverySelection" style="color: white; background: rgba(255,255,255,0.2);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="delivery-content" style="padding: 20px; max-height: calc(100vh - 180px); overflow-y: auto;">
                    <!-- Способ 1: Курьер -->
                    <div class="delivery-method active" id="courierOption">
                        <div class="method-check">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="method-icon" style="background: #4CAF50;">
                            <i class="fas fa-truck fa-lg"></i>
                        </div>
                        <div class="method-info">
                            <h3>Доставка курьером</h3>
                            <p>Привезем прямо к вашей двери</p>
                            <div class="method-price ${itemsTotal >= 1000 ? 'price-free' : 'price-paid'}">
                                <i class="fas ${itemsTotal >= 1000 ? 'fa-gift' : 'fa-tag'}"></i>
                                ${itemsTotal >= 1000 ? 'Бесплатно' : '100 ₽'}
                            </div>
                        </div>
                        <i class="fas fa-chevron-right method-arrow"></i>
                    </div>

                    <!-- Способ 2: Самовывоз -->
                    <div class="delivery-method" id="pickupOption">
                        <div class="method-check">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="method-icon" style="background: #FF9800;">
                            <i class="fas fa-store fa-lg"></i>
                        </div>
                        <div class="method-info">
                            <h3>Самовывоз</h3>
                            <p>Заберите из ближайшей точки</p>
                            <div class="method-price price-free">
                                <i class="fas fa-gift"></i>
                                Бесплатно
                            </div>
                        </div>
                        <i class="fas fa-chevron-right method-arrow"></i>
                    </div>

                    <!-- Информация о заказе (компактная) -->
                    <div class="order-summary-card">
                        <div class="summary-header">
                            <i class="fas fa-receipt"></i>
                            <h4>Сумма заказа</h4>
                        </div>
                        <div class="summary-items">
                            <div class="summary-item">
                                <span>Товары:</span>
                                <span class="item-value">${this.formatPrice(itemsTotal)} ₽</span>
                            </div>
                            <div class="summary-item">
                                <span>Доставка:</span>
                                <span class="item-value ${itemsTotal >= 1000 ? 'value-free' : ''}">
                                    ${itemsTotal >= 1000 ? 'Бесплатно' : '100 ₽'}
                                </span>
                            </div>
                        </div>
                        <div class="summary-total">
                            <span>Итого:</span>
                            <span class="total-value">${this.formatPrice(itemsTotal + deliveryCost)} ₽</span>
                        </div>

                        ${itemsTotal < 1000 ? `
                            <div class="free-shipping-hint">
                                <i class="fas fa-info-circle"></i>
                                Добавьте товаров на ${this.formatPrice(1000 - itemsTotal)} ₽ для бесплатной доставки
                            </div>
                        ` : `
                            <div class="free-shipping-badge">
                                <i class="fas fa-check-circle"></i>
                                Ура! Доставка бесплатная
                            </div>
                        `}
                    </div>
                </div>

                <div class="delivery-footer">
                    <button class="btn-back" onclick="shop.returnToCartFromDelivery()">
                        <i class="fas fa-arrow-left"></i> Назад в корзину
                    </button>
                </div>
            </div>
        `;

                // Назначаем обработчики событий
        document.getElementById('courierOption').addEventListener('click', () => {
            // Добавляем класс active
            document.querySelectorAll('.delivery-method').forEach(m => m.classList.remove('active'));
            document.getElementById('courierOption').classList.add('active');

            // Вызываем метод выбора доставки через 100мс
            setTimeout(() => this.selectDeliveryType('courier'), 100);
        });

        document.getElementById('pickupOption').addEventListener('click', () => {
            // Добавляем класс active
            document.querySelectorAll('.delivery-method').forEach(m => m.classList.remove('active'));
            document.getElementById('pickupOption').classList.add('active');

            // Вызываем метод выбора доставки через 100мс
            setTimeout(() => this.selectDeliveryType('pickup'), 100);
        });

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

        // TelegramShop class - добавьте этот метод
    showCashPaymentModal(totalAmount) {
        // Создаем модальное окно для оплаты наличными
        const modal = document.createElement('div');
        modal.className = 'modal-overlay cash-payment-modal';
        modal.innerHTML = `
            <div class="modal-content cash-payment-content">
                <div class="modal-header">
                    <h3><i class="fas fa-money-bill-wave"></i> Оплата наличными</h3>
                    <button class="close-modal" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="cash-payment-info">
                        <div class="total-amount-display">
                            <div class="total-label">Сумма к оплате:</div>
                            <div class="total-value">${this.formatPrice(totalAmount)} ₽</div>
                        </div>

                        <div class="form-group">
                            <label for="cashAmount">
                                <i class="fas fa-money-bill"></i>
                                Сколько дал клиент (₽):
                            </label>
                            <div class="cash-input-group">
                                <button class="cash-btn minus" onclick="shop.adjustCashAmount(-100)">
                                    <i class="fas fa-minus"></i> 100
                                </button>
                                <input
                                    type="number"
                                    id="cashAmount"
                                    min="${totalAmount}"
                                    step="1"
                                    value="${Math.ceil(totalAmount / 100) * 100}"
                                    oninput="shop.calculateChange()"
                                    placeholder="Введите сумму">
                                <button class="cash-btn plus" onclick="shop.adjustCashAmount(100)">
                                    <i class="fas fa-plus"></i> 100
                                </button>
                            </div>
                            <div class="cash-quick-buttons">
                                <button class="quick-cash-btn" onclick="shop.setExactCashAmount(${Math.ceil(totalAmount / 100) * 100})">
                                    ${Math.ceil(totalAmount / 100) * 100} ₽
                                </button>
                                <button class="quick-cash-btn" onclick="shop.setExactCashAmount(${Math.ceil(totalAmount / 500) * 500})">
                                    ${Math.ceil(totalAmount / 500) * 500} ₽
                                </button>
                                <button class="quick-cash-btn" onclick="shop.setExactCashAmount(${Math.ceil(totalAmount / 1000) * 1000})">
                                    ${Math.ceil(totalAmount / 1000) * 1000} ₽
                                </button>
                            </div>
                        </div>

                        <div class="change-result" id="changeResult">
                            <div class="change-header">
                                <i class="fas fa-calculator"></i>
                                <h4>Сдача:</h4>
                            </div>
                            <div class="change-display">
                                <div id="changeAmount" class="change-amount">0 ₽</div>
                                <div class="change-breakdown" id="changeBreakdown"></div>
                            </div>
                            <div class="change-notes" id="changeNotes">
                                <i class="fas fa-info-circle"></i>
                                <span>Выдайте клиенту следующее:</span>
                            </div>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
                            <i class="fas fa-times"></i> Отмена
                        </button>
                        <button class="btn btn-primary" id="confirmCashPayment" disabled
                                onclick="shop.confirmCashPayment(${totalAmount})">
                            <i class="fas fa-check-circle"></i> Подтвердить оплату
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Сразу рассчитываем сдачу
        setTimeout(() => this.calculateChange(), 100);
    }

        // Метод для корректировки суммы
    adjustCashAmount(delta) {
        const cashInput = document.getElementById('cashAmount');
        if (!cashInput) return;

        let currentValue = parseInt(cashInput.value) || 0;
        const totalAmount = parseFloat(document.querySelector('.total-value').textContent.replace(/\s/g, '').replace('₽', '')) || 0;

        let newValue = currentValue + delta;

        // Не позволяем ввести сумму меньше суммы заказа
        if (newValue < totalAmount) {
            newValue = Math.ceil(totalAmount / delta) * delta;
        }

        cashInput.value = newValue;
        this.calculateChange();
    }

        // Метод для установки точной суммы
    setExactCashAmount(amount) {
        const cashInput = document.getElementById('cashAmount');
        if (cashInput) {
            cashInput.value = amount;
            this.calculateChange();
        }
    }


        // Метод расчета сдачи
    calculateChange() {
        const totalElement = document.querySelector('.cash-payment-info .total-value');
        const cashInput = document.getElementById('cashAmount');
        const changeResult = document.getElementById('changeResult');
        const changeAmount = document.getElementById('changeAmount');
        const changeBreakdown = document.getElementById('changeBreakdown');
        const changeNotes = document.getElementById('changeNotes');
        const confirmBtn = document.getElementById('confirmCashPayment');

        if (!totalElement || !cashInput || !changeResult) return;

        // Получаем сумму заказа
        const totalAmountText = totalElement.textContent.replace(/\s/g, '').replace('₽', '');
        const totalAmount = parseFloat(totalAmountText) || 0;

        // Получаем введенную сумму
        const cashAmount = parseFloat(cashInput.value) || 0;

        if (cashAmount >= totalAmount) {
            const change = cashAmount - totalAmount;

            // Показываем блок с сдачей
            changeResult.style.display = 'block';
            changeAmount.textContent = `${this.formatPrice(change)} ₽`;

            if (change > 0) {
                // Рассчитываем купюры для сдачи
                const breakdown = this.calculateCashBreakdown(change);
                changeBreakdown.innerHTML = breakdown;
                changeNotes.style.display = 'flex';
            } else {
                changeBreakdown.innerHTML = '<div class="no-change">Сдачи не требуется</div>';
                changeNotes.style.display = 'none';
            }

            // Активируем кнопку подтверждения
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `<i class="fas fa-check-circle"></i> Подтвердить (сдача: ${this.formatPrice(change)} ₽)`;
        } else {
            // Скрываем блок с сдачей
            changeResult.style.display = 'none';
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<i class="fas fa-check-circle"></i> Подтвердить оплату`;
        }
    }

        // Метод расчета разменных купюр
    calculateCashBreakdown(amount) {
        if (amount <= 0) return '';

        const denominations = [
            { value: 5000, name: '5000 ₽' },
            { value: 2000, name: '2000 ₽' },
            { value: 1000, name: '1000 ₽' },
            { value: 500, name: '500 ₽' },
            { value: 200, name: '200 ₽' },
            { value: 100, name: '100 ₽' },
            { value: 50, name: '50 ₽' },
            { value: 10, name: '10 ₽' },
            { value: 5, name: '5 ₽' },
            { value: 2, name: '2 ₽' },
            { value: 1, name: '1 ₽' }
        ];

        let remaining = Math.round(amount);
        let result = [];
        let html = '<div class="breakdown-grid">';

        for (const denom of denominations) {
            if (remaining >= denom.value) {
                const count = Math.floor(remaining / denom.value);
                remaining = remaining % denom.value;

                if (count > 0) {
                    result.push(`${count} × ${denom.name}`);

                    // Добавляем в HTML с иконками
                    const icon = denom.value >= 100 ? 'fa-money-bill' : 'fa-coins';
                    html += `
                        <div class="breakdown-item">
                            <div class="denomination-icon">
                                <i class="fas ${icon}"></i>
                            </div>
                            <div class="denomination-info">
                                <span class="denomination-count">${count}</span>
                                <span class="denomination-sign">×</span>
                                <span class="denomination-value">${denom.name}</span>
                            </div>
                        </div>
                    `;
                }
            }
        }

        html += '</div>';

        // Если осталась мелочь (меньше рубля)
        if (remaining > 0) {
            html += `<div class="small-change">Мелкая сдача: ${remaining} коп.</div>`;
        }

        return html;
    }

    // Метод подтверждения оплаты наличными
    confirmCashPayment(totalAmount) {
        const cashInput = document.getElementById('cashAmount');
        const changeElement = document.getElementById('changeAmount');

        if (!cashInput || !changeElement) return;

        const cashAmount = parseFloat(cashInput.value);
        const changeText = changeElement.textContent.replace(/\s/g, '').replace('₽', '');
        const change = parseFloat(changeText) || 0;

        // Сохраняем информацию о наличной оплате
        this.cashPaymentInfo = {
            total: totalAmount,
            received: cashAmount,
            change: change,
            payment_method: 'cash',
            timestamp: new Date().toISOString(),
            breakdown: this.calculateCashBreakdown(change)
        };

        // Закрываем модальное окно
        const modal = document.querySelector('.cash-payment-modal');
        if (modal) {
            modal.remove();
        }

        // Продолжаем оформление заказа с информацией о наличных
        this.confirmOrderWithCash();
    }

    async confirmOrderWithCash() {
        try {
            console.log('💰 Информация об оплате наличными:', this.cashPaymentInfo);

            // Добавляем информацию о наличной оплате к данным заказа
            this.deliveryData.cash_payment = this.cashPaymentInfo;
            this.deliveryData.payment_method = 'cash';

            // Продолжаем оформление заказа
            await this.confirmOrder();

        } catch (error) {
            console.error('❌ Ошибка подтверждения оплаты наличными:', error);
            this.showNotification('❌ Ошибка обработки оплаты', 'error');
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
            // Используем this.userId из конструктора
            const userId = this.userId;

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
                        <button class="btn btn-primary" onclick="shop.showAddressForm(${this.userId})">
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
            await this.showAddressForm(this.userId);
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
            const addressData = {
                user_id: this.userId,
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

            if (this.userId === 0) {
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
        if (method === 'cash') {
            // Рассчитываем общую сумму заказа
            const itemsTotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            let deliveryCost = 0;

            // Добавляем стоимость доставки если нужно
            if (this.deliveryData.type === 'courier' && itemsTotal < 1000) {
                deliveryCost = 100;
            }

            const totalWithDelivery = itemsTotal + deliveryCost;

            // Показываем модальное окно для наличной оплаты
            this.showCashPaymentModal(totalWithDelivery);
        } else {
            // Для других методов оплаты
            this.deliveryData.payment_method = method;

            const methodNames = {
                'cash': 'Наличные',
                'transfer': 'Перевод курьеру',
                'terminal': 'Терминал'
            };

            this.showNotification(`✅ Выбрана оплата: ${methodNames[method]}`, 'success');

            // Переходим к оформлению заказа
            this.confirmOrder();
        }
    }

    async selectAddress(addressId) {
        try {
            console.log('📍 Выбран адрес ID:', addressId, 'для пользователя ID:', this.userId);

            if (this.userId === 0) {
                // Для гостя
                this.deliveryData.address_id = `guest_${addressId}`;

                // Получаем полные данные адреса
                const guestAddresses = JSON.parse(localStorage.getItem('guest_addresses') || '[]');
                const addressIndex = addressId; // addressId уже индекс для гостей
                this.deliveryData.address_details = guestAddresses[addressIndex] || null;

                console.log('🏠 Адресные данные гостя:', this.deliveryData.address_details);
            } else {
                // Для зарегистрированного пользователя
                this.deliveryData.address_id = addressId;

                // Загружаем полные данные адреса с сервера
                try {
                    const response = await fetch(`/api/user/addresses?user_id=${this.userId}`);
                    if (response.ok) {
                        const addresses = await response.json();
                        const selectedAddress = addresses.find(addr => addr.id === addressId);
                        this.deliveryData.address_details = selectedAddress || null;
                        console.log('👤 Адресные данные с сервера:', this.deliveryData.address_details);
                    }
                } catch (error) {
                    console.warn('⚠️ Не удалось загрузить детали адреса:', error);
                }
            }

            // ВМЕСТО confirmOrder() -> показываем выбор оплаты
            await this.showPaymentSelection();

        } catch (error) {
            console.error('❌ Ошибка выбора адреса:', error);
            this.showNotification('❌ Ошибка выбора адреса', 'error');
        }
    }

    // ========== НОВЫЕ ФУНКЦИИ ДЛЯ БОТА И УВЕДОМЛЕНИЙ ==========

    async notifyBotAboutOrder(orderId, status) {
        // Отправить уведомление боту о статусе заказа
        try {
            const response = await fetch('/api/notify-bot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    order_id: orderId,
                    status: status,
                    user_id: this.userId
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log(`📢 Уведомление для заказа #${orderId} отправлено в бот (статус: ${status})`);
            } else {
                console.warn(`⚠️ Ошибка отправки уведомления: ${result.error}`);
            }

            return result.success;

        } catch (error) {
            console.error('❌ Ошибка связи с ботом:', error);
            return false;
        }
    }

    async confirmOrder() {
        try {
            console.log('🔍 Начинаем оформление заказа...');
            console.log('📊 Данные пользователя:', { userId: this.userId, username: this.username });
            console.log('🚚 Данные доставки:', this.deliveryData);
            console.log('🛒 Товары в корзине:', this.cart.length);

            // Подготавливаем данные о доставке и оплате
            let deliveryDetails = {};
            let recipient_name = "";
            let phone_number = "";
            let deliveryCost = 0; // ДОБАВЬТЕ ЭТО - объявите переменную!

            if (this.deliveryData.type === 'courier' && this.deliveryData.address_id) {
                if (this.deliveryData.address_id.toString().startsWith('guest_')) {
                    const guestAddresses = JSON.parse(localStorage.getItem('guest_addresses') || '[]');
                    const addressIndex = parseInt(this.deliveryData.address_id.split('_')[1]);
                    deliveryDetails = guestAddresses[addressIndex] || {};
                    recipient_name = deliveryDetails.recipient_name || '';
                    phone_number = deliveryDetails.phone || '';
                    console.log('🏠 Адрес гостя:', deliveryDetails);
                } else {
                    deliveryDetails = this.deliveryData.address_details || {};
                    recipient_name = deliveryDetails.recipient_name || '';
                    phone_number = deliveryDetails.phone || deliveryDetails.phone_number || '';
                    console.log('👤 Адрес пользователя:', deliveryDetails);
                }

                if (!recipient_name || recipient_name.trim() === '') {
                    this.showNotification('❌ Укажите имя получателя', 'error');
                    this.showAddressSelection();
                    return;
                }

                if (!phone_number || phone_number.trim() === '') {
                    this.showNotification('❌ Укажите телефон для связи', 'error');
                    this.showAddressSelection();
                    return;
                }
            } else if (this.deliveryData.type === 'pickup' && this.deliveryData.pickup_point) {
                deliveryDetails = { pickup_point_id: this.deliveryData.pickup_point };
                recipient_name = this.username || 'Гость';
                phone_number = 'Будет указан при получении';
            }

            // Формируем items для заказа - УБЕДИТЕСЬ, что все числа
            const orderItems = this.cart.map(item => ({
                id: item.id,
                name: item.name,
                price: parseFloat(item.price) || 0, // ПРЕОБРАЗУЙТЕ в число
                quantity: parseInt(item.quantity) || 1 // ПРЕОБРАЗУЙТЕ в число
            }));

            // Рассчитываем стоимость
            const itemsTotal = this.cart.reduce((sum, item) => {
                const price = parseFloat(item.price) || 0;
                const quantity = parseInt(item.quantity) || 1;
                return sum + (price * quantity);
            }, 0);

            console.log(`💰 Сумма товаров: ${itemsTotal} (тип: ${typeof itemsTotal})`);

            // ========== РАСЧЕТ СТОИМОСТИ ДОСТАВКИ ==========
            if (this.deliveryData.type === 'courier') {
                if (itemsTotal < 1000) {
                    deliveryCost = 100; // Теперь переменная объявлена
                    console.log(`💰 Доставка платная: +${deliveryCost} руб (сумма заказа: ${itemsTotal} руб)`);
                } else {
                    console.log(`✅ Доставка бесплатная (сумма заказа: ${itemsTotal} руб)`);
                }
            } else {
                deliveryCost = 0; // Для самовывоза доставка бесплатная
            }

            const totalWithDelivery = itemsTotal + deliveryCost;
            // ========== КОНЕЦ РАСЧЕТА ==========

            // Подготавливаем данные заказа
            const orderData = {
                user_id: parseInt(this.userId) || 0,
                username: this.username || 'Гость',
                items: orderItems,
                total: itemsTotal,  // Теперь точно число
                delivery_type: this.deliveryData.type,
                delivery_address: JSON.stringify(deliveryDetails),
                pickup_point: this.deliveryData.pickup_point,
                payment_method: this.deliveryData.payment_method || 'cash',
                recipient_name: recipient_name,
                phone_number: phone_number
            };

            console.log('📤 Отправка заказа на сервер:', orderData);
            console.log(`💰 Итоговая сумма: ${totalWithDelivery} руб (товары: ${itemsTotal} руб + доставка: ${deliveryCost} руб)`);

            // Используем метод createOrder класса
            const result = await this.createOrder(orderData);
            console.log('📥 Ответ сервера:', result);

            if (result.success) {
                // Отправляем уведомление боту
                await this.notifyBotAboutOrder(result.order_id, 'created');

                // ========== ИЗМЕНЕННОЕ ПОДТВЕРЖДЕНИЕ ЗАКАЗА ==========
                this.showOrderConfirmation(result.order_id, itemsTotal, deliveryCost, totalWithDelivery);

                // Очищаем корзину ПОСЛЕ показа подтверждения
                this.cart = [];
                this.saveCart();
                this.updateCartCount();

                // Очищаем данные доставки
                this.deliveryData = {
                    type: null,
                    address_id: null,
                    pickup_point: null,
                    address_details: null
                };

            } else {
                throw new Error(result.error || 'Неизвестная ошибка сервера');
            }

        } catch (error) {
            console.error('❌ Ошибка оформления заказа:', error);
            this.showNotification(`❌ Ошибка: ${error.message}`, 'error');
            this.showPaymentSelection();
        }
        }

    showOrderConfirmation(orderId, itemsTotal = 0, deliveryCost = 0, totalWithDelivery = 0) {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        const deliveryText = this.deliveryData.type === 'courier'
            ? 'Доставка курьером'
            : 'Самовывоз';

        const paymentMethods = {
            'cash': 'Наличные',
            'transfer': 'Перевод курьеру',
            'terminal': 'Терминал'
        };

        const paymentText = paymentMethods[this.deliveryData.payment_method] || 'Наличные';

        // ========== ИЗМЕНЕННОЕ ОТОБРАЖЕНИЕ С УЧЕТОМ ДОСТАВКИ ==========
        let deliveryInfo = '';
        if (this.deliveryData.type === 'courier') {
            if (deliveryCost > 0) {
                deliveryInfo = `
                    <div class="price-breakdown">
                        <p><strong>Товары:</strong> ${this.formatPrice(itemsTotal)} ₽</p>
                        <p><strong>Доставка:</strong> ${this.formatPrice(deliveryCost)} ₽</p>
                        <p style="font-size: 12px; color: #666;">* Бесплатная доставка при заказе от 1000 ₽</p>
                    </div>
                `;
            } else {
                deliveryInfo = `
                    <div class="price-breakdown">
                        <p><strong>Товары:</strong> ${this.formatPrice(itemsTotal)} ₽</p>
                        <p><strong>Доставка:</strong> Бесплатно 🎉</p>
                    </div>
                `;
            }
        }

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
                        ${deliveryInfo}
                        <p><strong>Итого к оплате:</strong> <span style="font-size: 18px; font-weight: bold;">${this.formatPrice(totalWithDelivery)} ₽</span></p>
                        <p><strong>Статус:</strong> <span class="status-processing">Ожидает курьера</span></p>
                    </div>
                    <div class="confirmation-message processing">
                        <p><i class="fas fa-info-circle"></i> Заказ передан на обработку</p>
                        ${this.deliveryData.type === 'courier' ?
                            '<p><strong>🚚 Курьер будет назначен в течение 15 минут</strong></p>' :
                            '<p>Вы можете забрать заказ в течение 2 часов</p>'}
                        <p><strong>📱 Вы получите уведомления в Telegram боте о статусе доставки!</strong></p>
                    </div>
                    <button class="btn btn-primary" id="closeCartAndReturn">
                        <i class="fas fa-home"></i> Вернуться в магазин
                    </button>
                </div>
            </div>
        `;

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

        // Проверяем, есть ли пользователь Telegram
        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
            const user = Telegram.WebApp.initDataUnsafe.user;
            console.log(`👤 Пользователь Telegram: ${user.first_name} (ID: ${user.id})`);
            console.log('📱 Пользователь будет получать уведомления о статусе заказа в боте');
        }

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

console.log('✅ app.js полностью загружен, класс TelegramShop определен');

window.TelegramShop = TelegramShop;