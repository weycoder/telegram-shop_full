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


    appliedPromoCode = null;

    async applyPromoCode() {
        const codeInput = document.getElementById('promoCodeInput')
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

    getPromoMessage(promo, discount) {
        if (!promo) return '';

        switch (promo.discount_type) {
            case 'percentage':
                return `Скидка ${promo.value}%`;
            case 'fixed':
                return `Скидка ${this.formatPrice(promo.value)} ₽`;
            case 'free_delivery':
                return 'Бесплатная доставка';
            case 'bogo':
                return '2 по цене 1';
            default:
                return 'Скидка';
        }
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
        const cartFooter = document.querySelector('.cart-footer');

        if (!cartItems || !cartTotal) {
            console.error('❌ Элементы корзины не найдены!');
            return;
        }

        // ЕСЛИ КОРЗИНА ПУСТА
        if (this.cart.length === 0) {
            console.log('🛒 Корзина пуста - показываем сообщение');

            // Скрываем промокод если был применен
            this.appliedPromoCode = null;

            cartItems.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Корзина пуста</p>
                    <p>Добавьте товары из каталога</p>
                </div>
            `;

            cartTotal.textContent = '0 ₽';

            if (cartFooter) {
                cartFooter.style.display = 'none';
            }

            return;
        }

        // ЕСЛИ В КОРЗИНЕ ЕСТЬ ТОВАРЫ
        console.log(`📦 В корзине ${this.cart.length} товаров`);

        // Рассчитываем сумму корзины
        const itemsSubtotal = this.cart.reduce((sum, item) => {
            const priceToShow = item.discounted_price || item.price;
            return sum + (priceToShow * item.quantity);
        }, 0);

        // Применяем промокод если есть
        let promoDiscount = 0;
        let promoMessage = '';
        let finalTotal = itemsSubtotal;

        if (this.appliedPromoCode) {
            promoDiscount = this.calculatePromoDiscount(itemsSubtotal, this.appliedPromoCode);
            finalTotal = Math.max(itemsSubtotal - promoDiscount, 0);
            promoMessage = this.getPromoMessage(this.appliedPromoCode, promoDiscount);
        }

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

        // Добавляем блок с промокодом
        itemsHTML += `
            <div class="cart-promo-section">
                <div class="promo-code-input-container">
                    <input type="text"
                           id="cartPromoCodeInput"
                           placeholder="Введите промокод"
                           value="${this.appliedPromoCode?.code || ''}"
                           ${this.appliedPromoCode ? 'readonly' : ''}
                           class="promo-code-input">
                    ${!this.appliedPromoCode ? `
                        <button id="applyCartPromoBtn" class="btn-apply-promo">
                            <i class="fas fa-check"></i> Применить
                        </button>
                    ` : `
                        <button id="removeCartPromoBtn" class="btn-remove-promo">
                            <i class="fas fa-times"></i> Удалить
                        </button>
                    `}
                </div>
                ${promoMessage ? `
                    <div class="promo-applied-message success">
                        <i class="fas fa-check-circle"></i> ${promoMessage}
                    </div>
                ` : ''}
                <div id="promoErrorMessage" class="promo-error-message"></div>
            </div>
        `;

        cartItems.innerHTML = itemsHTML;

        // Обновляем итоговую сумму с учетом промокода
        cartTotal.textContent = `${this.formatPrice(finalTotal)} ₽`;

        // Показываем блок с детализацией сумм
        const summaryHTML = `
            <div class="cart-summary">
                <div class="summary-details">
                    <div class="summary-row">
                        <span>Сумма товаров:</span>
                        <span>${this.formatPrice(itemsSubtotal)} ₽</span>
                    </div>

                    ${this.appliedPromoCode ? `
                        <div class="summary-row promo-discount-row">
                            <span>Скидка по промокоду:</span>
                            <span class="discount-amount">-${this.formatPrice(promoDiscount)} ₽</span>
                        </div>
                    ` : ''}

                    <div class="summary-row total-row">
                        <span><strong>Итого к оплате:</strong></span>
                        <span class="total-amount"><strong>${this.formatPrice(finalTotal)} ₽</strong></span>
                    </div>
                </div>

                <div class="cart-actions">
                    <button class="btn btn-outline" id="clearCart">
                        <i class="fas fa-trash"></i> Очистить
                    </button>
                    <button class="btn btn-primary" id="checkoutBtn">
                        <i class="fas fa-paper-plane"></i> Перейти к оплате
                    </button>
                </div>
            </div>
        `;

        if (cartFooter) {
            cartFooter.innerHTML = summaryHTML;
            cartFooter.style.display = 'block';

            // Назначаем обработчики для кнопок промокода
            if (!this.appliedPromoCode) {
                document.getElementById('applyCartPromoBtn').addEventListener('click', () => {
                    this.applyPromoCodeInCart();
                });

                document.getElementById('cartPromoCodeInput').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.applyPromoCodeInCart();
                    }
                });
            } else {
                document.getElementById('removeCartPromoBtn').addEventListener('click', () => {
                    this.removePromoCodeFromCart();
                });
            }

            // Назначаем обработчики для других кнопок
            this.bindEvent('clearCart', 'click', () => this.clearCart());
            this.bindEvent('checkoutBtn', 'click', () => this.checkout());
        }

        console.log('✅ Корзина обновлена с промокодом:', this.appliedPromoCode?.code || 'нет');
    }


    calculatePromoDiscount(subtotal, promo) {
        if (!promo) return 0;

        switch (promo.discount_type) {
            case 'percentage':
                return subtotal * (promo.value / 100);

            case 'fixed':
                return Math.min(promo.value, subtotal); // Не больше суммы заказа

            case 'free_delivery':
                // Для бесплатной доставки возвращаем стоимость доставки как скидку
                const deliveryCost = (subtotal < 1000) ? 100 : 0;
                return deliveryCost;

            case 'bogo':
                // Для "Купи 1 получи 2" - скидка 50% на самый дорогой товар
                if (this.cart.length > 0) {
                    const mostExpensive = Math.max(...this.cart.map(item =>
                        (item.discounted_price || item.price) * item.quantity));
                    return mostExpensive * 0.5;
                }
                return 0;

            default:
                return 0;
        }
    }


    removePromoCodeFromCart() {
        this.appliedPromoCode = null;
        console.log('🗑️ Промокод удален');

        // Показываем сообщение об удалении
        const notification = document.createElement('div');
        notification.className = 'promo-applied-message info';
        notification.innerHTML = `
            <i class="fas fa-info-circle"></i>
            Промокод удален
        `;

        const promoSection = document.querySelector('.cart-promo-section');
        if (promoSection) {
            const oldMessage = promoSection.querySelector('.promo-applied-message');
            if (oldMessage) oldMessage.remove();
            promoSection.appendChild(notification);
        }

        // Обновляем отображение
        setTimeout(() => {
            this.updateCartDisplay();
        }, 500);
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


    async applyPromoCodeInCart() {
        const input = document.getElementById('cartPromoCodeInput');
        const code = input?.value.trim().toUpperCase();
        const errorMessage = document.getElementById('promoErrorMessage');

        if (!code) {
            if (errorMessage) {
                errorMessage.textContent = '❌ Введите промокод';
                errorMessage.style.display = 'block';
            }
            return;
        }

        try {
            console.log(`🎟️ Проверка промокода: ${code}`);

            const response = await fetch('/api/check-promo-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code: code })
            });

            const result = await response.json();

            if (result.success) {
                // Проверяем минимальную сумму заказа
                const itemsSubtotal = this.cart.reduce((sum, item) => {
                    const priceToShow = item.discounted_price || item.price;
                    return sum + (priceToShow * item.quantity);
                }, 0);

                if (result.promo_code.min_order_amount > 0 &&
                    itemsSubtotal < result.promo_code.min_order_amount) {
                    const minAmount = this.formatPrice(result.promo_code.min_order_amount);
                    const currentAmount = this.formatPrice(itemsSubtotal);
                    if (errorMessage) {
                        errorMessage.innerHTML = `
                            ❌ Промокод требует минимальную сумму заказа ${minAmount} ₽<br>
                            <small>Ваша текущая сумма: ${currentAmount} ₽</small>
                        `;
                        errorMessage.style.display = 'block';
                    }
                    return;
                }

                // Проверяем лимит использований
                if (result.promo_code.usage_limit &&
                    result.promo_code.used_count >= result.promo_code.usage_limit) {
                    if (errorMessage) {
                        errorMessage.textContent = '❌ Промокод уже использован максимальное количество раз';
                        errorMessage.style.display = 'block';
                    }
                    return;
                }

                // Проверяем срок действия
                if (result.promo_code.end_date) {
                    const endDate = new Date(result.promo_code.end_date);
                    const now = new Date();
                    if (endDate < now) {
                        if (errorMessage) {
                            errorMessage.textContent = '❌ Срок действия промокода истек';
                            errorMessage.style.display = 'block';
                        }
                        return;
                    }
                }

                // Сохраняем промокод
                this.appliedPromoCode = {
                    ...result.promo_code,
                    code: code
                };

                // Показываем успешное сообщение
                const promoMessage = document.querySelector('.promo-applied-message') ||
                                    document.createElement('div');
                promoMessage.className = 'promo-applied-message success';
                promoMessage.innerHTML = `
                    <i class="fas fa-check-circle"></i>
                    Промокод "${code}" успешно применен!
                `;

                const promoSection = document.querySelector('.cart-promo-section');
                if (promoSection) {
                    promoSection.insertBefore(promoMessage, errorMessage);
                }

                if (errorMessage) {
                    errorMessage.style.display = 'none';
                }

                console.log('✅ Промокод применен:', this.appliedPromoCode);

                // Обновляем отображение корзины
                setTimeout(() => {
                    this.updateCartDisplay();
                }, 500);

            } else {
                if (errorMessage) {
                    errorMessage.textContent = `❌ ${result.error}`;
                    errorMessage.style.display = 'block';
                }
                console.log('❌ Ошибка промокода:', result.error);
            }

        } catch (error) {
            console.error('❌ Ошибка проверки промокода:', error);
            if (errorMessage) {
                errorMessage.textContent = '❌ Ошибка соединения с сервером';
                errorMessage.style.display = 'block';
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
        const itemsTotal = this.cart.reduce((sum, item) => {
            const priceToShow = item.discounted_price || item.price;
            return sum + (priceToShow * item.quantity);
        }, 0);

        // Рассчитываем стоимость доставки
        let deliveryCost = 0;
        let deliveryMessage = 'Бесплатно';

        // Если промокод на бесплатную доставку
        const hasFreeDeliveryPromo = this.appliedPromoCode?.discount_type === 'free_delivery';

        if (!hasFreeDeliveryPromo && itemsTotal < 1000) {
            deliveryCost = 100;
            deliveryMessage = '100 ₽';
        }

        // Рассчитываем скидку от промокода если есть
        const promoDiscount = this.appliedPromoCode ?
            this.calculatePromoDiscount(itemsTotal, this.appliedPromoCode) : 0;
        const finalTotal = itemsTotal + deliveryCost - promoDiscount;

        cartOverlay.innerHTML = `
            <div class="cart-modal" style="padding: 0;">
                <div class="cart-header" style="background: linear-gradient(135deg, #4CAF50, #388E3C); color: white; border: none; padding: 12px 15px;">
                    <h2 style="margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-truck"></i> Доставка
                    </h2>
                    <button class="close-cart" id="closeDeliverySelection"
                            style="color: white; background: rgba(255,255,255,0.2); width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-times" style="font-size: 14px;"></i>
                    </button>
                </div>
                <div class="delivery-content" style="padding: 12px; max-height: calc(100vh - 140px); overflow-y: auto;">
                    <div class="compact-promo-section" style="margin-bottom: 12px; padding: 10px; background: #f8f9fa; border-radius: 8px; max-width: 100%; box-sizing: border-box;">
                        <div style="padding: 0; max-width: 100%; box-sizing: border-box;">
                            <div style="margin-bottom: 16px; background: white; border-radius: 12px; padding: 12px; border: 1px solid #e0e0e0;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <i class="fas fa-ticket-alt" style="color: #667eea; font-size: 16px;"></i>
                                    <span style="font-weight: 600; color: #333; font-size: 14px;">Промокод</span>
                                </div>

                                ${!this.appliedPromoCode ? `
                                    <div style="display: flex; gap: 8px;">
                                        <input type="text"
                                               id="compactPromoCodeInput"
                                               placeholder="Введите код"
                                               style="flex: 1; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; height: 40px; box-sizing: border-box;">
                                        <button id="applyPromoBtnCompact"
                                                style="width: 60px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px; height: 40px;">
                                            OK
                                        </button>
                                    </div>
                                ` : `
                                    <div style="display: flex; justify-content: space-between; align-items: center; background: #e8f5e9; padding: 10px 12px; border-radius: 8px;">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <i class="fas fa-check-circle" style="color: #4CAF50;"></i>
                                            <div>
                                                <div style="font-weight: 600; color: #2e7d32; font-size: 14px;">${this.appliedPromoCode.code}</div>
                                                <div style="font-size: 12px; color: #388E3C; margin-top: 2px;">
                                                    ${this.getPromoMessage(this.appliedPromoCode, promoDiscount)}
                                                </div>
                                            </div>
                                        </div>
                                        <button id="removePromoBtnCompact"
                                                style="background: none; border: none; color: #dc3545; cursor: pointer; padding: 4px 8px;">
                                            <i class="fas fa-times"></i>
                                        </button>
                                    </div>
                                `}

                                <div id="compactPromoMessage" style="margin-top: 6px; font-size: 12px; min-height: 16px;"></div>
                            </div>

                            <!-- СПОСОБ ДОСТАВКИ -->
                            <div style="margin-bottom: 16px;">
                                <div style="margin-bottom: 8px; font-weight: 600; color: #333; font-size: 14px;">
                                    Способ получения
                                </div>

                                <!-- КУРЬЕР -->
                                <div id="courierOption"
                                     style="margin-bottom: 8px; padding: 12px; border: ${this.deliveryData.type === 'courier' ? '2px solid #667eea' : '1px solid #e0e0e0'};
                                            border-radius: 10px; background: white; cursor: pointer;
                                            ${this.deliveryData.type === 'courier' ? 'background: #f8f9ff;' : ''}">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div style="display: flex; align-items: center; gap: 12px;">
                                            <div style="width: 40px; height: 40px; background: ${this.deliveryData.type === 'courier' ? '#667eea' : '#6c757d'};
                                                 border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                                <i class="fas fa-truck" style="color: white; font-size: 18px;"></i>
                                            </div>
                                            <div>
                                                <div style="font-weight: 600; color: #333; font-size: 16px;">Курьер</div>
                                                <div style="font-size: 13px; color: #666; margin-top: 2px;">До двери, 30-60 мин</div>
                                            </div>
                                        </div>
                                        <div style="font-weight: 600; color: ${hasFreeDeliveryPromo || itemsTotal >= 1000 ? '#28a745' : '#dc3545'}; font-size: 16px;">
                                            ${hasFreeDeliveryPromo || itemsTotal >= 1000 ? 'Бесплатно' : '100 ₽'}
                                        </div>
                                    </div>
                                </div>

                                <!-- САМОВЫВОЗ -->
                                <div id="pickupOption"
                                     style="padding: 12px; border: ${this.deliveryData.type === 'pickup' ? '2px solid #667eea' : '1px solid #e0e0e0'};
                                            border-radius: 10px; background: white; cursor: pointer;
                                            ${this.deliveryData.type === 'pickup' ? 'background: #f8f9ff;' : ''}">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div style="display: flex; align-items: center; gap: 12px;">
                                            <div style="width: 40px; height: 40px; background: ${this.deliveryData.type === 'pickup' ? '#667eea' : '#6c757d'};
                                                 border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                                <i class="fas fa-store" style="color: white; font-size: 18px;"></i>
                                            </div>
                                            <div>
                                                <div style="font-weight: 600; color: #333; font-size: 16px;">Самовывоз</div>
                                                <div style="font-size: 13px; color: #666; margin-top: 2px;">Из точки, 15-30 мин</div>
                                            </div>
                                        </div>
                                        <div style="font-weight: 600; color: #28a745; font-size: 16px;">
                                            Бесплатно
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- СУММА -->
                            <div style="background: white; border-radius: 12px; padding: 16px; border: 1px solid #e0e0e0; margin-bottom: 16px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span style="color: #666; font-size: 14px;">Товары:</span>
                                    <span style="font-weight: 500; font-size: 14px;">${this.formatPrice(itemsTotal)} ₽</span>
                                </div>

                                ${promoDiscount > 0 ? `
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                        <span style="color: #28a745; font-size: 14px;">Скидка:</span>
                                        <span style="color: #28a745; font-weight: 500; font-size: 14px;">-${this.formatPrice(promoDiscount)} ₽</span>
                                    </div>
                                ` : ''}

                                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                    <span style="color: #666; font-size: 14px;">Доставка:</span>
                                    <span style="color: ${hasFreeDeliveryPromo || itemsTotal >= 1000 || this.deliveryData.type === 'pickup' ? '#28a745' : '#dc3545'};
                                          font-weight: 500; font-size: 14px;">
                                        ${hasFreeDeliveryPromo || itemsTotal >= 1000 || this.deliveryData.type === 'pickup' ? 'Бесплатно' : '100 ₽'}
                                    </span>
                                </div>

                                <div style="border-top: 1px solid #eee; padding-top: 12px;">
                                    <div style="display: flex; justify-content: space-between;">
                                        <span style="font-weight: 600; font-size: 16px;">Итого:</span>
                                        <span style="font-weight: 700; font-size: 18px; color: #2c3e50;">${this.formatPrice(finalTotal)} ₽</span>
                                    </div>
                                </div>
                            </div>

                            <!-- КНОПКА НАЗАД -->
                            <button onclick="shop.returnToCartFromDelivery()"
                                    style="width: 100%; padding: 14px; background: white; color: #333; border: 1px solid #ddd;
                                           border-radius: 10px; cursor: pointer; font-weight: 500; font-size: 15px;
                                           display: flex; align-items: center; justify-content: center; gap: 8px;">
                                <i class="fas fa-arrow-left" style="font-size: 16px;"></i>
                                <span>Назад в корзину</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => {
            // Курьер
            const courierBtn = document.getElementById('courierOption');
            const pickupBtn = document.getElementById('pickupOption');

            if (courierBtn) {
                courierBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🚚 Курьер выбран');
                    this.deliveryData.type = 'courier';
                    this.showDeliverySelection();
                });
            }

            if (pickupBtn) {
                pickupBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🏪 Самовывоз выбран');
                    this.deliveryData.type = 'pickup';
                    this.showDeliverySelection();
                });
            }

            // Промокод
            if (!this.appliedPromoCode) {
                const applyBtn = document.getElementById('applyPromoBtnCompact');
                const promoInput = document.getElementById('compactPromoCodeInput');

                if (applyBtn) {
                    applyBtn.addEventListener('click', () => this.applyCompactPromoCode());
                }

                if (promoInput) {
                    promoInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') this.applyCompactPromoCode();
                    });
                }
            } else {
                const removeBtn = document.getElementById('removePromoBtnCompact');
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => this.removeCompactPromoCode());
                }
            }

            // Кнопка "Назад"
            const backBtn = document.querySelector('button[onclick="shop.returnToCartFromDelivery()"]');
            if (backBtn) {
                backBtn.addEventListener('click', () => this.returnToCartFromDelivery());
            }

            // Кнопка закрытия
            const closeBtn = document.getElementById('closeDeliverySelection');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeCart());
            }

            console.log('✅ Обработчики назначены');}, 100);
    }

    async applyCompactPromoCode() {
        const input = document.getElementById('compactPromoCodeInput');
        const messageDiv = document.getElementById('compactPromoMessage');
        const code = input?.value.trim().toUpperCase();

        if (!code) {
            this.showCompactPromoMessage('Введите промокод', 'error');
            return;
        }

        try {
            this.showCompactPromoMessage('<i class="fas fa-spinner fa-spin"></i> Проверка...', 'loading');

            const response = await fetch('/api/check-promo-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code })
            });

            const result = await response.json();

            if (result.success) {
                const itemsTotal = this.cart.reduce((sum, item) => {
                    return sum + ((item.discounted_price || item.price) * item.quantity);
                }, 0);

                const promo = result.promo_code;

                // Проверка минимальной суммы
                if (promo.min_order_amount > 0 && itemsTotal < promo.min_order_amount) {
                    this.showCompactPromoMessage(`Минимум ${this.formatPrice(promo.min_order_amount)} ₽`, 'error');
                    return;
                }

                // Сохраняем промокод
                this.appliedPromoCode = { ...promo, code: code };
                this.showCompactPromoMessage('✅ Промокод применен!', 'success');

                // Обновляем отображение
                setTimeout(() => this.showDeliverySelection(), 800);
            } else {
                this.showCompactPromoMessage(`❌ ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка:', error);
            this.showCompactPromoMessage('❌ Ошибка соединения', 'error');
        }
    }

    removeCompactPromoCode() {
        this.appliedPromoCode = null;
        console.log('🗑️ Удален компактный промокод');

        // Обновляем отображение
        this.showDeliverySelection();
    }

    showCompactPromoMessage(message, type = 'info') {
        const messageDiv = document.getElementById('compactPromoMessage');
        if (!messageDiv) return;

        messageDiv.innerHTML = message;
        messageDiv.style.padding = '4px 0';

        // Стили по типу сообщения
        if (type === 'error') {
            messageDiv.style.color = '#dc3545';
        } else if (type === 'success') {
            messageDiv.style.color = '#28a745';
        } else if (type === 'loading') {
            messageDiv.style.color = '#0c5460';
        } else {
            messageDiv.style.color = '#6c757d';
        }

        // Автоматическое скрытие успешных сообщений
        if (type === 'success') {
            setTimeout(() => {
                if (messageDiv.textContent.includes('✅')) {
                    messageDiv.innerHTML = '';
                }
            }, 2000);
        }
    }

    async applyUserPromoCode() {
        const input = document.getElementById('userPromoCodeInput');
        const messageDiv = document.getElementById('userPromoMessage');
        const code = input?.value.trim().toUpperCase();

        if (!code) {
            this.showUserPromoMessage('❌ Введите промокод', 'error');
            return;
        }

        try {
            console.log(`🎟️ Пользователь проверяет промокод: ${code}`);

            // Показываем загрузку
            this.showUserPromoMessage('<i class="fas fa-spinner fa-spin"></i> Проверка промокода...', 'loading');

            const response = await fetch('/api/check-promo-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code: code })
            });

            const result = await response.json();

            if (result.success) {
                // Проверяем минимальную сумму заказа
                const itemsTotal = this.cart.reduce((sum, item) => {
                    const priceToShow = item.discounted_price || item.price;
                    return sum + (priceToShow * item.quantity);
                }, 0);

                const promo = result.promo_code;

                // Проверка минимальной суммы
                if (promo.min_order_amount > 0 && itemsTotal < promo.min_order_amount) {
                    this.showUserPromoMessage(
                        `❌ Минимальная сумма заказа для этого промокода: ${this.formatPrice(promo.min_order_amount)} ₽`,
                        'error'
                    );
                    return;
                }

                // Проверка срока действия
                if (promo.end_date) {
                    const endDate = new Date(promo.end_date);
                    const now = new Date();
                    if (endDate < now) {
                        this.showUserPromoMessage('❌ Срок действия промокода истек', 'error');
                        return;
                    }
                }

                // Проверка лимита использований
                if (promo.usage_limit && promo.used_count >= promo.usage_limit) {
                    this.showUserPromoMessage('❌ Промокод уже использован максимальное количество раз', 'error');
                    return;
                }

                // Проверка "один на пользователя"
                if (promo.one_per_customer) {
                    // TODO: Проверка, использовал ли пользователь уже этот промокод
                    console.log('⚠️ Проверка one_per_customer не реализована');
                }

                // Сохраняем промокод
                this.appliedPromoCode = {
                    ...promo,
                    code: code
                };

                // Рассчитываем скидку
                const discount = this.calculatePromoDiscount(itemsTotal, this.appliedPromoCode);
                const discountMessage = this.getPromoMessage(this.appliedPromoCode, discount);

                // Показываем успех
                this.showUserPromoMessage(
                    `✅ Промокод "${code}" успешно применен! ${discountMessage}`,
                    'success'
                );

                // Обновляем отображение
                setTimeout(() => {
                    this.showDeliverySelection();
                }, 1000);

                console.log('✅ Промокод применен пользователем:', this.appliedPromoCode);

            } else {
                this.showUserPromoMessage(`❌ ${result.error}`, 'error');
                console.log('❌ Ошибка промокода:', result.error);
            }

        } catch (error) {
            console.error('❌ Ошибка проверки промокода:', error);
            this.showUserPromoMessage('❌ Ошибка соединения с сервером', 'error');
        }
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
        // Создаем модальное окно
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 10px;
        `;

        modal.innerHTML = `
            <div style="background: white; border-radius: 10px; width: 100%; max-width: 320px; max-height: 90vh; overflow-y: auto;">
                <div style="padding: 15px; border-bottom: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 16px; color: #333;">
                            <i class="fas fa-money-bill-wave"></i> Наличные
                        </h3>
                        <button onclick="this.parentElement.parentElement.parentElement.remove()"
                                style="background: none; border: none; color: #666; cursor: pointer; font-size: 16px; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div style="padding: 15px;">
                    <!-- Сумма к оплате -->
                    <div style="text-align: center; margin-bottom: 15px;">
                        <div style="font-size: 13px; color: #666; margin-bottom: 4px;">К оплате:</div>
                        <div style="font-size: 24px; font-weight: bold; color: #2c3e50;">${this.formatPrice(totalAmount)} ₽</div>
                    </div>

                    <!-- Ввод суммы -->
                    <div style="margin-bottom: 15px;">
                        <div style="font-size: 13px; color: #666; margin-bottom: 6px;">Сумма от клиента:</div>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="number"
                                   id="cashAmountCompact"
                                   value="${Math.ceil(totalAmount / 100) * 100}"
                                   style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; text-align: center;">
                        </div>

                        <!-- Быстрые кнопки -->
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px;">
                            <button onclick="shop.adjustCashAmountCompact(100)"
                                    style="padding: 8px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                +100 ₽
                            </button>
                            <button onclick="shop.adjustCashAmountCompact(500)"
                                    style="padding: 8px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                +500 ₽
                            </button>
                            <button onclick="shop.adjustCashAmountCompact(1000)"
                                    style="padding: 8px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                +1000 ₽
                            </button>
                        </div>
                    </div>

                    <!-- Сдача -->
                    <div id="changeResultCompact" style="display: none; margin-bottom: 15px;">
                        <div style="background: #f8f9fa; border-radius: 6px; padding: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="font-size: 13px; color: #666;">Сдача:</div>
                                <div id="changeAmountCompact" style="font-size: 18px; font-weight: bold; color: #28a745;">0 ₽</div>
                            </div>
                            <div id="changeBreakdownCompact" style="font-size: 11px; color: #666;"></div>
                        </div>
                    </div>

                    <!-- Кнопки действий -->
                    <div style="display: flex; gap: 8px;">
                        <button onclick="this.parentElement.parentElement.parentElement.remove()"
                                style="flex: 1; padding: 12px; background: #f8f9fa; color: #333; border: 1px solid #dee2e6; border-radius: 6px; cursor: pointer; font-weight: 500;">
                            Отмена
                        </button>
                        <button id="confirmCashCompact"
                                onclick="shop.confirmCashPaymentCompact(${totalAmount})"
                                style="flex: 1; padding: 12px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                            Готово
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Инициализация
        const cashInput = document.getElementById('cashAmountCompact');
        cashInput.addEventListener('input', () => this.calculateChangeCompact(totalAmount));

        // Рассчитываем сдачу сразу
        setTimeout(() => this.calculateChangeCompact(totalAmount), 100);
    }

    confirmCashPaymentCompact(totalAmount) {
        const cashInput = document.getElementById('cashAmountCompact');
        const changeElement = document.getElementById('changeAmountCompact');

        if (!cashInput || !changeElement) return;

        const cashAmount = parseFloat(cashInput.value);
        const change = parseFloat(changeElement.textContent.replace(' ₽', '').replace(/\s/g, '')) || 0;

        // Сохраняем информацию
        this.cashPaymentInfo = {
            total: totalAmount,
            received: cashAmount,
            change: change,
            payment_method: 'cash',
            timestamp: new Date().toISOString()
        };

        // Закрываем модальное окно
        const modal = document.querySelector('.modal-overlay');
        if (modal) {
            modal.remove();
        }

        // Продолжаем оформление
        this.confirmOrderWithCash();
    }

    adjustCashAmountCompact(amount) {
        const cashInput = document.getElementById('cashAmountCompact');
        if (!cashInput) return;

        let currentValue = parseInt(cashInput.value) || 0;
        cashInput.value = currentValue + amount;

        // Рассчитываем сдачу
        const totalAmount = parseFloat(cashInput.dataset.totalAmount) || 0;
        this.calculateChangeCompact(totalAmount);
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
    calculateChangeCompact(totalAmount) {
        const cashInput = document.getElementById('cashAmountCompact');
        const changeResult = document.getElementById('changeResultCompact');
        const changeAmount = document.getElementById('changeAmountCompact');
        const changeBreakdown = document.getElementById('changeBreakdownCompact');
        const confirmBtn = document.getElementById('confirmCashCompact');

        if (!cashInput || !changeResult) return;

        const cashAmount = parseFloat(cashInput.value) || 0;

        if (cashAmount >= totalAmount) {
            const change = cashAmount - totalAmount;

            changeResult.style.display = 'block';
            changeAmount.textContent = `${this.formatPrice(change)} ₽`;

            if (change > 0) {
                const breakdown = this.calculateCashBreakdown(change);
                changeBreakdown.innerHTML = breakdown;
            } else {
                changeBreakdown.innerHTML = '<div style="text-align: center; color: #28a745;">Без сдачи</div>';
            }

            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `Готово`;
        } else {
            changeResult.style.display = 'none';
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `Готово`;
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

            // Рассчитываем сумму товаров
            const itemsTotal = this.cart.reduce((sum, item) => {
                const priceToShow = item.discounted_price || item.price;
                return sum + (priceToShow * item.quantity);
            }, 0);

            // РАССЧИТЫВАЕМ СКИДКУ ОТ ПРОМОКОДА
            let promoDiscount = 0;
            if (this.appliedPromoCode) {
                promoDiscount = this.calculatePromoDiscount(itemsTotal, this.appliedPromoCode);
                console.log(`🎟️ Скидка от промокода "${this.appliedPromoCode.code}": ${promoDiscount} руб`);
            }

            // Рассчитываем стоимость доставки
            let deliveryCost = 0;

            // ЕСЛИ ПРОМОКОД НА БЕСПЛАТНУЮ ДОСТАВКУ
            if (this.appliedPromoCode?.discount_type === 'free_delivery') {
                deliveryCost = 0;
                console.log('🚚 Доставка бесплатная по промокоду');
            } else if (this.deliveryData.type === 'courier' && itemsTotal < 1000) {
                deliveryCost = 100;
                console.log(`💰 Доставка платная: +${deliveryCost} руб (сумма заказа: ${itemsTotal} руб)`);
            } else {
                console.log(`✅ Доставка бесплатная (сумма заказа: ${itemsTotal} руб)`);
            }

            const totalWithDelivery = itemsTotal + deliveryCost - promoDiscount;
            const cashPayment = this.deliveryData.cash_payment || {};
            const orderData = {
                        user_id: parseInt(this.userId) || 0,
                        username: this.username || 'Гость',
                        items: orderItems,
                        total: itemsTotal,  // Сумма без скидок и доставки
                        delivery_type: this.deliveryData.type,
                        delivery_address: JSON.stringify(deliveryDetails),
                        pickup_point: this.deliveryData.pickup_point,
                        payment_method: this.deliveryData.payment_method || 'cash',
                        recipient_name: recipient_name,
                        phone_number: phone_number,
                        cash_payment: cashPayment,
                        // Добавляем информацию о промокоде
                        promo_code: this.appliedPromoCode?.code || null,
                        promo_code_id: this.appliedPromoCode?.id || null,
                        discount_amount: promoDiscount || 0,
                        delivery_cost: deliveryCost,
                        total_with_delivery: totalWithDelivery
                    };

            if (this.deliveryData.cash_payment) {
                orderData.cash_details = this.deliveryData.cash_payment;
                console.log('💰 Добавлены данные о наличных в заказ:', this.deliveryData.cash_payment);
            }

            console.log('📤 Отправка заказа на сервер:', orderData);
            console.log(`💰 Итоговая сумма: ${totalWithDelivery} руб (товары: ${numericItemsTotal} руб + доставка: ${deliveryCost} руб)`);

            // Используем метод createOrder класса
            const result = await this.createOrder(orderData);
            console.log('📥 Ответ сервера:', result);

            if (result.success) {
                // Отправляем уведомление боту
                await this.notifyBotAboutOrder(result.order_id, 'created');

                // Показываем подтверждение заказа
                this.showOrderConfirmation(result.order_id, numericItemsTotal, deliveryCost, totalWithDelivery);

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