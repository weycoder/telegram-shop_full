// Telegram Shop - Полная версия
console.log('🟢 Telegram Shop загружается...');

function getTelegramParams() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        let userId = parseInt(urlParams.get('user_id')) || 0;
        let username = urlParams.get('username') || 'Гость';

        if (userId === 0) {
            const savedId = localStorage.getItem('telegram_user_id');
            const savedUsername = localStorage.getItem('telegram_username');
            if (savedId && savedId !== '0') {
                userId = parseInt(savedId);
                username = savedUsername || 'Пользователь';
            }
        }

        if (userId === 0 && window.Telegram?.WebApp?.initDataUnsafe?.user) {
            const tgUser = Telegram.WebApp.initDataUnsafe.user;
            userId = tgUser.id || 0;
            username = tgUser.username || tgUser.first_name || 'Telegram User';
            localStorage.setItem('telegram_user_id', userId);
            localStorage.setItem('telegram_username', username);
        }

        return { userId, username };
    } catch (error) {
        console.error('❌ Ошибка получения параметров:', error);
        return { userId: 0, username: 'Гость' };
    }
}


class TelegramShop {
    constructor() {
        this.cart = this.loadCart();
        this.currentProduct = null;
        this.products = [];
        this.categories = [];
        this.discounts = [];
        this.promo_codes = [];
        this.appliedPromoCode = null;
        this.deliveryData = {
            type: null,
            address_id: null,
            pickup_point: null,
            address_details: null,
            payment_method: null
        };
        this.selectedWeight = 0.1;
        this.selectedWeightPrice = 0;
        this.isInitialized = false;

        const params = getTelegramParams();
        this.userId = params.userId;
        this.username = params.username;
        this.saveUserToLocalStorage();

        console.log('🛍️ Telegram Shop создан для:', this.username, 'ID:', this.userId);
    }

    async init() {
            if (this.isInitialized) return;
            console.log('🚀 Инициализация магазина...');

            this.bindEvents();
            await Promise.all([
                this.loadProducts(),
                this.loadCategories(),
                this.loadDiscounts(),
                this.loadPromoCodes()
            ]);

            this.updateCartCount();
            this.initTelegramWebApp();
            this.isInitialized = true;
            console.log('✅ Магазин инициализирован');
        }
    // ========== ОСНОВНЫЕ МЕТОДЫ ==========

    bindEvents() {
        console.log('🔗 Назначаем обработчики...');

        this.bindEvent('cartBtn', 'click', () => this.toggleCart());
        this.bindEvent('closeCart', 'click', () => this.closeCart());
        this.bindEvent('clearCart', 'click', () => this.clearCart());
        this.bindEvent('checkoutBtn', 'click', () => this.checkout());
        this.bindEvent('closeProductModal', 'click', () => this.closeProductModal());

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('cart-overlay')) this.closeCart();
            if (e.target.classList.contains('product-modal-overlay')) this.closeProductModal();
        });

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

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-block');
            if (btn && btn.textContent.includes('Подробнее')) {
                e.preventDefault();
                e.stopPropagation();
                const onclickAttr = btn.getAttribute('onclick');
                if (onclickAttr && onclickAttr.includes('shop.viewProduct')) {
                    const match = onclickAttr.match(/shop\.viewProduct\((\d+)\)/);
                    if (match && match[1]) {
                        this.viewProduct(parseInt(match[1]));
                    }
                }
            }
        });

        console.log('✅ Все обработчики назначены');
    }

    bindEvent(id, event, handler) {
        const element = document.getElementById(id);
        if (element) element.addEventListener(event, handler);
    }

    initTelegramWebApp() {
        if (window.Telegram && Telegram.WebApp) {
            Telegram.WebApp.expand();
            Telegram.WebApp.setHeaderColor('#667eea');
            Telegram.WebApp.setBackgroundColor('#f5f7fa');
            Telegram.WebApp.enableClosingConfirmation();

            if (Telegram.WebApp.BackButton) {
                Telegram.WebApp.BackButton.hide();
                Telegram.WebApp.BackButton.onClick(() => {
                    if (this.isCartOpen()) {
                        this.closeCart();
                    } else if (this.isProductModalOpen()) {
                        this.closeProductModal();
                    } else {
                        Telegram.WebApp.close();
                    }
                });
            }
        }
    }

    updateBackButton() {
        if (window.Telegram?.WebApp?.BackButton) {
            if (this.isCartOpen() || this.isProductModalOpen()) {
                Telegram.WebApp.BackButton.show();
            } else {
                Telegram.WebApp.BackButton.hide();
            }
        }
    }


    // Проверка открыта ли корзина
    isCartOpen() {
        const cartOverlay = document.getElementById('cartOverlay');
        return cartOverlay && cartOverlay.style.display === 'flex';
    }

    isProductModalOpen() {
        const modal = document.getElementById('productModal');
        return modal && modal.style.display === 'flex';
    }

    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(price || 0));
    }

    showNotification(message, type = 'info') {
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

        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    createNotificationsContainer() {
        const container = document.createElement('div');
        container.id = 'notifications';
        document.body.appendChild(container);
        return container;
    }

    // ========== ТОВАРЫ И КАТЕГОРИИ ==========

    async loadProducts(category = 'all') {
        try {
            console.log(`📥 Загрузка товаров${category !== 'all' ? ` категории "${category}"` : ''}...`);
            this.showLoading(true);

            const url = category !== 'all'
                ? `/api/products?category=${encodeURIComponent(category)}`
                : '/api/products';

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            this.products = await response.json();
            console.log(`✅ Загружено ${this.products.length} товаров`);
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

    async loadCategories() {
        try {
            const response = await fetch('/api/categories');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.categories = await response.json();
            console.log(`✅ Загружено ${this.categories.length} категорий`);
            this.renderCategories();
        } catch (error) {
            console.error('❌ Ошибка загрузки категорий:', error);
            this.categories = [];
        }
    }

    async loadDiscounts() {
        try {
            const response = await fetch('/api/discounts');
            this.discounts = await response.json();
            console.log(`✅ Загружено ${this.discounts.length} скидок`);
        } catch (error) {
            console.error('❌ Ошибка загрузки скидок:', error);
            this.discounts = [];
        }
    }

    async loadPromoCodes() {
        try {
            const response = await fetch('/api/promo-codes');
            this.promo_codes = await response.json();
            console.log(`✅ Загружено ${this.promo_codes.length} промокодов`);
        } catch (error) {
            console.error('❌ Ошибка загрузки промокодов:', error);
            this.promo_codes = [];
        }
    }

    async applyDiscountsToProducts() {
        try {
            if (this.discounts.length === 0) {
                await this.loadDiscounts();
            }

            this.products = this.products.map(product => {
                const discount = this.calculateProductDiscount(product);
                if (discount) {
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
        } catch (error) {
            console.error('❌ Ошибка применения скидок:', error);
        }
    }

    calculateProductDiscount(product) {
        if (!this.discounts || this.discounts.length === 0) return null;

        const now = new Date();
        const activeDiscounts = this.discounts.filter(discount =>
            discount.is_active &&
            (!discount.start_date || new Date(discount.start_date) <= now) &&
            (!discount.end_date || new Date(discount.end_date) >= now)
        );

        for (const discount of activeDiscounts) {
            let applies = false;
            switch (discount.apply_to) {
                case 'all': applies = true; break;
                case 'category': applies = product.category === discount.target_category; break;
                case 'product': applies = product.id === discount.target_product_id; break;
            }
            if (applies) return discount;
        }
        return null;
    }

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
        }
        return Math.max(discountedPrice, 0);
    }

    formatDiscountInfo(discount) {
        if (!discount) return '';
        switch (discount.discount_type) {
            case 'percentage': return `-${discount.value}%`;
            case 'fixed': return `-${this.formatPrice(discount.value)} ₽`;
            case 'bogo': return '2 по цене 1';
            case 'free_delivery': return 'Бесплатная доставка';
            default: return discount.discount_type;
        }
    }

    renderProducts() {
        const productsGrid = document.getElementById('products');
        if (!productsGrid) return;

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

        let html = '';
        this.products.forEach(product => {
            html += this.createProductCard(product);
        });
        productsGrid.innerHTML = html;
    }

    createProductCard(product) {
        const inStock = product.stock > 0 || product.stock_weight > 0;
        const isWeightProduct = product.product_type === 'weight';
        const hasDiscount = product.has_discount === true;
        const discount = product.discount;
        const discountedPrice = product.discounted_price || product.price;
        const originalPrice = product.original_price || product.price;

        return `
            <div class="product-card ${hasDiscount ? 'has-discount' : ''}">
                ${hasDiscount ? `
                    <div class="discount-badge">${this.formatDiscountInfo(discount)}</div>
                ` : ''}

                <div class="product-image-container">
                    <img src="${product.image_url || 'https://via.placeholder.com/300x200?text=No+Image'}"
                         alt="${product.name}"
                         class="product-image"
                         onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'">
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
                                <div class="original-price">${this.formatPrice(originalPrice)} ₽</div>
                                <div class="discounted-price">${this.formatPrice(discountedPrice)} ₽</div>
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

        const allButton = container.querySelector('.category-btn[data-category="all"]');
        const buttons = allButton ? [allButton.outerHTML] : [];

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
        document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
        categoryBtn.classList.add('active');
        this.loadProducts(category);
    }

    async viewProduct(productId) {
        try {
            this.openProductModalLoading();
            const response = await fetch(`/api/products/${productId}`);
            const product = await response.json();
            if (product.error) throw new Error(product.error);

            this.currentProduct = product;
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

    // ========== КОРЗИНА ==========

    loadCart() {
        try {
            const cartData = localStorage.getItem('telegram_shop_cart');
            if (!cartData) return [];

            const parsedData = JSON.parse(cartData);
            console.log('📥 Загружена корзина:', parsedData.length, 'товаров');
            return Array.isArray(parsedData) ? parsedData : [];
        } catch (error) {
            console.error('❌ Ошибка загрузки корзины:', error);
            return [];
        }
    }

    saveCart() {
        try {
            localStorage.setItem('telegram_shop_cart', JSON.stringify(this.cart));
            console.log('💾 Корзина сохранена:', this.cart.length, 'товаров');
        } catch (error) {
            console.error('❌ Ошибка сохранения корзины:', error);
        }
    }

    addToCart(productId, name, price, quantity = 1, image = null) {
        console.log('🛒 === ДОБАВЛЕНИЕ В КОРЗИНУ ===');
        console.log('📥 Параметры:', { productId, name, price, quantity });

        if (!productId || quantity < 1) {
            console.error('❌ Неверные параметры');
            return;
        }

        // Ищем товар в базе для проверки типа
        const product = this.products.find(p => p.id === productId);
        const isWeightProduct = product?.product_type === 'weight';

        // Применяем скидку если есть
        const discount = product ? this.calculateProductDiscount(product) : null;
        const discountedPrice = discount ? this.calculateDiscountedPrice(price, discount) : price;

        let cartItemId;

        if (isWeightProduct) {
            // Для весового товара - уникальный ID (productId + timestamp)
            cartItemId = `${productId}_weight_${Date.now()}`;

            // Проверяем вес
            const weight = this.selectedWeight || 0.1;
            if (weight <= 0) {
                this.showNotification('❌ Выберите вес товара', 'error');
                return;
            }

            // Добавляем как новый товар (весовые всегда новые позиции)
            const cartItem = {
               id: cartItemId,
                name: `${name} ${weight.toFixed(2)} кг`,
                price: price, // Цена за весь вес
                discounted_price: discountedPrice,
                discount_info: discount,
                quantity: 1, // Весовой товар всегда количество = 1
                image: image || 'https://via.placeholder.com/100',
                weight: weight,
                is_weight: true,
                original_product_id: productId,
                addedAt: new Date().toISOString()
            };

            this.cart.push(cartItem);
            console.log('➕ Добавлен весовой товар:', cartItem);

        } else {
            // Для обычного товара
            cartItemId = productId.toString();

            // Ищем существующий товар в корзине
            const existingIndex = this.cart.findIndex(item =>
                item.id.toString() === cartItemId && !item.is_weight
            );

            if (existingIndex !== -1) {
                // Увеличиваем количество существующего товара
                this.cart[existingIndex].quantity += quantity;
                this.cart[existingIndex].discounted_price = discountedPrice;
                this.cart[existingIndex].discount_info = discount;
                console.log(`📈 Увеличено количество до ${this.cart[existingIndex].quantity}`);
            } else {
                // Добавляем новый товар
                const cartItem = {
                    id: cartItemId,
                    name: name,
                    price: price,
                    discounted_price: discountedPrice,
                    discount_info: discount,
                    quantity: quantity,
                    image: image || 'https://via.placeholder.com/100',
                    is_weight: false,
                    original_product_id: productId,
                    addedAt: new Date().toISOString()
                };

                this.cart.push(cartItem);
                console.log('➕ Добавлен новый товар:', cartItem);
            }
        }

        this.saveCart();
        this.updateCartCount();

        // Показываем уведомление
        const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        this.showCartNotification(name, isWeightProduct ? 1 : quantity, totalItems);

        console.log('✅ === ТОВАР ДОБАВЛЕН ===');
        console.log('📊 Текущая корзина:', this.cart);
    }


    showCartNotification(name, quantity, totalItems) {
        const notification = document.createElement('div');
        notification.className = 'cart-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-message">
                    <i class="fas fa-check-circle"></i>
                    <span>${name} × ${quantity} добавлен в корзину!</span>
                </div>
                <button class="notification-action" onclick="shop.openCart()">
                    <i class="fas fa-shopping-cart"></i> Открыть корзину (${totalItems})
                </button>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    removeFromCart(cartItemId) {
        console.log('🗑️ Удаление товара:', cartItemId);

        // Находим товар для уведомления
        const itemToRemove = this.cart.find(item => item.id.toString() === cartItemId.toString());

        if (!itemToRemove) {
            console.error('❌ Товар не найден');
            return;
        }

        // Удаляем товар
        const initialLength = this.cart.length;
        this.cart = this.cart.filter(item => item.id.toString() !== cartItemId.toString());

        if (this.cart.length < initialLength) {
            this.saveCart();
            this.updateCartCount();

            // Обновляем отображение если корзина открыта
            if (this.isCartOpen()) {
                this.updateCartDisplay();
            }

            this.showNotification(`🗑️ "${itemToRemove.name}" удален из корзины`, 'info');
            console.log('✅ Товар удален');
        }
    }


        // Новый метод для изменения веса весового товара
    async updateWeightProductWeight(cartItemId, newWeight) {
        console.log('⚖️ Изменение веса:', { cartItemId, newWeight });

        const itemIndex = this.cart.findIndex(item => item.id.toString() === cartItemId.toString());
        if (itemIndex === -1 || !this.cart[itemIndex].is_weight) {
            console.error('❌ Весовой товар не найден');
            return;
        }

        const item = this.cart[itemIndex];

        try {
            // Получаем актуальную информацию о товаре
            const response = await fetch(`/api/products/${item.original_product_id}`);
            if (response.ok) {
                const product = await response.json();

                // Проверяем границы веса
                const maxWeight = Math.min(
                    product.stock_weight || 5.0,
                    product.max_weight || 5.0
                );
                const minWeight = product.min_weight || 0.1;

                if (newWeight < minWeight) newWeight = minWeight;
                if (newWeight > maxWeight) newWeight = maxWeight;

                // Обновляем вес и пересчитываем цену
                item.weight = parseFloat(newWeight.toFixed(2));
                const pricePerKg = product.price_per_kg || product.price;
                item.price = Math.floor(item.weight * pricePerKg);

                // Обновляем имя для отображения
                item.name = `${product.name} (${item.weight.toFixed(2)} ${product.unit || 'кг'})`;

                // Пересчитываем скидку если есть
                if (item.discount_info) {
                    item.discounted_price = this.calculateDiscountedPrice(item.price, item.discount_info);
                } else {
                    item.discounted_price = item.price;
                }

                this.saveCart();
                this.updateCartCount();

                // Обновляем отображение
                if (this.isCartOpen()) {
                    this.updateCartDisplay();
                }

                this.showNotification(`✅ Вес обновлен: ${item.weight.toFixed(2)} кг`, 'success');
            }
        } catch (error) {
            console.error('❌ Ошибка обновления веса:', error);
            this.showNotification('❌ Ошибка обновления веса', 'error');
        }
    }

    async updateCartItemQuantity(cartItemId, newQuantity) {
        const itemIndex = this.cart.findIndex(item => item.id.toString() === cartItemId.toString());
        if (itemIndex === -1) return;

        const item = this.cart[itemIndex];

        // Для весовых товаров - всегда 1
        if (item.is_weight) {
            this.showNotification('ℹ️ Для весового товара нельзя изменить количество', 'info');
            return;
        }

        // Для обычных товаров проверяем наличие
        try {
            const response = await fetch(`/api/products/${item.original_product_id}`);
            if (response.ok) {
                const product = await response.json();

                // Проверяем наличие
                const stock = product.stock || 0;
                if (newQuantity > stock) {
                    this.showNotification(`❌ Доступно только ${stock} шт.`, 'error');
                    newQuantity = stock;
                }

                if (stock === 0) {
                    this.removeFromCart(cartItemId);
                    this.showNotification('❌ Товар закончился', 'error');
                    return;
                }
            }
        } catch (error) {
            console.error('❌ Ошибка проверки наличия:', error);
        }

        // Обновляем
        if (newQuantity < 1) {
            this.removeFromCart(cartItemId);
        } else {
            this.cart[itemIndex].quantity = newQuantity;
            this.saveCart();
            this.updateCartCount();

            if (this.isCartOpen()) {
                this.updateCartDisplay();
            }
        }
    }

    updateCartCount() {
        const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        const cartCount = document.getElementById('cartCount');

        if (cartCount) {
            cartCount.textContent = totalItems;
            cartCount.style.display = totalItems > 0 ? 'flex' : 'none';
        }

        console.log('📊 Обновлен счетчик корзины:', totalItems, 'товаров');
    }

    // Вспомогательные методы
    hideCartButtons() {
        const cartActions = document.querySelector('.cart-actions');
        if (cartActions) cartActions.style.display = 'none';
    }

    showCartButtons() {
        const cartActions = document.querySelector('.cart-actions');
        if (cartActions) cartActions.style.display = 'flex';
    }

    async editWeight(cartItemId) {
        const item = this.cart.find(item => item.id.toString() === cartItemId.toString());
        if (!item || !item.is_weight) return;

        try {
            // Получаем информацию о товаре
            const response = await fetch(`/api/products/${item.original_product_id}`);
            if (!response.ok) throw new Error('Товар не найден');

            const product = await response.json();

            // Создаем модальное окно для редактирования веса
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 320px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-edit"></i> Изменить вес</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Товар: ${product.name}</label>
                            <div class="weight-input-group">
                                <input type="number"
                                       id="editWeightInput"
                                       value="${item.weight}"
                                       min="${product.min_weight || 0.1}"
                                       max="${Math.min(product.stock_weight || 5.0, product.max_weight || 5.0)}"
                                       step="0.1">
                                <span>${product.unit || 'кг'}</span>
                            </div>
                            <div class="weight-slider-container">
                                <input type="range"
                                       id="editWeightSlider"
                                       min="${product.min_weight || 0.1}"
                                       max="${Math.min(product.stock_weight || 5.0, product.max_weight || 5.0)}"
                                       step="0.1"
                                       value="${item.weight}">
                            </div>
                            <div class="price-preview">
                                Будет стоить: <span id="editWeightPrice">${this.formatPrice(item.price)} ₽</span>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-outline cancel-edit">Отмена</button>
                            <button class="btn btn-primary save-edit">Сохранить</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Обработчики событий
            const weightInput = document.getElementById('editWeightInput');
            const weightSlider = document.getElementById('editWeightSlider');
            const priceSpan = document.getElementById('editWeightPrice');

            const updatePrice = () => {
                const weight = parseFloat(weightInput.value);
                const pricePerKg = product.price_per_kg || product.price;
                const price = Math.floor(weight * pricePerKg);
                priceSpan.textContent = `${this.formatPrice(price)} ₽`;
            };

            weightInput.addEventListener('input', () => {
                weightSlider.value = weightInput.value;
                updatePrice();
            });

            weightSlider.addEventListener('input', () => {
                weightInput.value = weightSlider.value;
                updatePrice();
            });

            // Кнопки
            modal.querySelector('.close-modal').onclick = () => modal.remove();
            modal.querySelector('.cancel-edit').onclick = () => modal.remove();
            modal.querySelector('.save-edit').onclick = async () => {
                const newWeight = parseFloat(weightInput.value);
                await this.updateWeightProductWeight(cartItemId, newWeight);
                modal.remove();
            };

        } catch (error) {
            console.error('❌ Ошибка редактирования веса:', error);
            this.showNotification('❌ Не удалось изменить вес', 'error');
        }
    }


    updateCartDisplay() {
        console.log('🔄 Обновление отображения корзины');

        const cartItems = document.getElementById('cartItems');
        const cartTotal = document.getElementById('cartTotal');

        if (!cartItems || !cartTotal) {
            console.error('❌ Элементы корзины не найдены');
            return;
        }

        // Очищаем контейнер
        cartItems.innerHTML = '';

        // Проверяем пустую корзину
        if (!this.cart || this.cart.length === 0) {
            cartItems.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Корзина пуста</p>
                    <p>Добавьте товары из каталога</p>
                </div>
            `;
            cartTotal.textContent = '0 ₽';
            this.hideCartButtons();
            return;
        }

        let subtotal = 0;
        let discountedSubtotal = 0;

        // Рендерим каждый товар
        this.cart.forEach(item => {
            const originalPrice = item.price || 0;
            const discountedPrice = item.discounted_price || item.price;
            const hasDiscount = item.discount_info && discountedPrice < originalPrice;
            const priceToShow = hasDiscount ? discountedPrice : originalPrice;
            const totalPrice = priceToShow * item.quantity;

            subtotal += originalPrice * item.quantity;
            discountedSubtotal += priceToShow * item.quantity;

            // Создаем HTML для товара
            const cartItemHTML = `
                <div class="cart-item" data-id="${item.id}">
                    ${hasDiscount ? `
                        <div class="cart-item-discount">
                            ${this.formatDiscountInfo(item.discount_info)}
                        </div>
                    ` : ''}

                    <img src="${item.image || 'https://via.placeholder.com/100'}"
                         alt="${item.name}"
                         class="cart-item-image"
                         onerror="this.src='https://via.placeholder.com/100'">

                    <div class="cart-item-info">
                        <div class="cart-item-header">
                            <h4 class="cart-item-name">${item.name}</h4>
                            <button class="remove-item" onclick="shop.removeFromCart('${item.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>

                        <div class="cart-item-pricing">
                            ${hasDiscount ? `
                                <div class="cart-price-discounted">
                                    <span class="cart-item-original-price">${this.formatPrice(originalPrice)} ₽</span>
                                    <span class="cart-item-price discounted">${this.formatPrice(discountedPrice)} ₽</span>
                                </div>
                            ` : `
                                <div class="cart-item-price">${this.formatPrice(originalPrice)} ₽</div>
                            `}
                        </div>

                        <div class="cart-item-controls">
                            ${!item.is_weight ? `
                                <div class="quantity-selector small">
                                    <button class="qty-btn minus-btn" onclick="shop.updateCartItemQuantity('${item.id}', ${item.quantity - 1})">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <span class="quantity">${item.quantity} шт.</span>
                                    <button class="qty-btn plus-btn" onclick="shop.updateCartItemQuantity('${item.id}', ${item.quantity + 1})">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                            ` : `
                                <div class="quantity-display weight-display">
                                    <button class="edit-weight-btn" onclick="shop.editWeight('${item.id}')" title="Изменить вес">
                                        <i class="fas fa-edit"></i> Изменить вес
                                    </button>
                                </div>
                            `}
                            <div class="cart-item-total ${hasDiscount ? 'discounted' : ''}">
                                ${this.formatPrice(totalPrice)} ₽
                            </div>
                        </div>
                    </div>
                </div>
            `;

            cartItems.innerHTML += cartItemHTML;
        });

        // Обновляем итоговую сумму
        cartTotal.textContent = `${this.formatPrice(discountedSubtotal)} ₽`;

        // Показываем кнопки
        this.showCartButtons();
    }
        // Выносим рендеринг в отдельный метод
    renderCartItems(cartItems, cartTotal) {
        console.log('🛒 Рендеринг корзины, товаров:', this.cart.length);

        // Очищаем контейнер
        cartItems.innerHTML = '';

        // Проверяем пустоту корзины
        if (!this.cart || this.cart.length === 0) {
            cartItems.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Корзина пуста</p>
                    <p>Добавьте товары из каталога</p>
                </div>
            `;
            cartTotal.textContent = '0 ₽';
            this.hideCartButtons();
            return;
        }

        let subtotal = 0;
        let discountedSubtotal = 0;

        // Отображаем каждый товар
        this.cart.forEach(item => {
            console.log('📦 Товар в корзине:', item);

            const originalPrice = item.price || 0;
            const discountedPrice = item.discounted_price || item.price;
            const hasDiscount = item.discount_info && discountedPrice < originalPrice;
            const priceToShow = hasDiscount ? discountedPrice : originalPrice;
            const totalPrice = priceToShow * item.quantity;

            subtotal += originalPrice * item.quantity;
            discountedSubtotal += priceToShow * item.quantity;

            // Создаем HTML для товара
            const cartItemHTML = `
                <div class="cart-item" data-id="${item.id}">
                    ${hasDiscount ? `
                        <div class="cart-item-discount">
                            ${this.formatDiscountInfo(item.discount_info)}
                        </div>
                    ` : ''}

                    <img src="${item.image || 'https://via.placeholder.com/100'}"
                         alt="${item.name}"
                         class="cart-item-image"
                         onerror="this.src='https://via.placeholder.com/100'">

                    <div class="cart-item-info">
                        <div class="cart-item-header">
                            <h4 class="cart-item-name">${item.name || 'Товар'}</h4>
                            <button class="remove-item" onclick="shop.removeFromCart('${item.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>

                        <div class="cart-item-pricing">
                            ${hasDiscount ? `
                                <div class="cart-price-discounted">
                                    <span class="cart-item-original-price">${this.formatPrice(originalPrice)} ₽</span>
                                    <span class="cart-item-price discounted">${this.formatPrice(discountedPrice)} ₽</span>
                                </div>
                            ` : `
                                <div class="cart-item-price">${this.formatPrice(originalPrice)} ₽</div>
                            `}
                        </div>

                        <div class="cart-item-controls">
                            <div class="quantity-selector small">
                                <button class="qty-btn minus-btn" onclick="shop.updateCartItemQuantity('${item.id}', ${item.quantity - 1})">
                                    <i class="fas fa-minus"></i>
                                </button>
                                <span class="quantity">${item.quantity} ${item.is_weight ? 'шт.' : 'шт.'}</span>
                                <button class="qty-btn plus-btn" onclick="shop.updateCartItemQuantity('${item.id}', ${item.quantity + 1})">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                            <div class="cart-item-total ${hasDiscount ? 'discounted' : ''}">
                                ${this.formatPrice(totalPrice)} ₽
                            </div>
                        </div>
                    </div>
                </div>
            `;

            cartItems.innerHTML += cartItemHTML;
        });

        // Обновляем итоговую сумму
        cartTotal.textContent = `${this.formatPrice(discountedSubtotal)} ₽`;

        // Обновляем детализацию суммы
        this.updateCartSummary(discountedSubtotal, subtotal, subtotal - discountedSubtotal);

        // Показываем кнопки действий
        this.showCartButtons();

        // Сбрасываем флаг изменений
        this.cartModified = false;
    }


    recreateCartInterface() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay || !this.isCartOpen()) return;

        console.log('🔄 Пересоздание интерфейса корзины');

        // Создаем структуру корзины заново
        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="cart-header">
                    <h2><i class="fas fa-shopping-cart"></i> Корзина</h2>
                    <button class="close-cart" id="closeCart">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="cart-items" id="cartItems"></div>
                <div class="cart-footer">
                    <div class="cart-summary">
                        <div class="cart-total">
                            <span>Итого:</span>
                            <span class="total-price" id="cartTotal">0 ₽</span>
                        </div>
                        <div class="summary-details"></div>
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

        // Заново назначаем обработчики
        setTimeout(() => {
            const closeBtn = document.getElementById('closeCart');
            const clearBtn = document.getElementById('clearCart');
            const checkoutBtn = document.getElementById('checkoutBtn');

            if (closeBtn) closeBtn.addEventListener('click', () => this.closeCart());
            if (clearBtn) clearBtn.addEventListener('click', () => this.clearCart());
            if (checkoutBtn) checkoutBtn.addEventListener('click', () => this.checkout());
        }, 100);

        // Обновляем содержимое корзины
        setTimeout(() => {
            const cartItems = document.getElementById('cartItems');
            const cartTotal = document.getElementById('cartTotal');

            if (cartItems && cartTotal) {
                this.updateCartDisplay();
            }
        }, 200);
    }


        // Новый метод для назначения обработчиков кнопок количества
    bindCartItemQuantityButtons() {
        // Обработчики для кнопок минус
        document.querySelectorAll('.minus-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const productId = btn.dataset.id;
                const item = this.cart.find(item => item.id.toString() === productId.toString());
                if (item) {
                    this.updateCartItemQuantity(productId, item.quantity - 1);
                }
            });
        });

        // Обработчики для кнопок плюс
        document.querySelectorAll('.plus-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const productId = btn.dataset.id;
                const item = this.cart.find(item => item.id.toString() === productId.toString());
                if (item) {
                    this.updateCartItemQuantity(productId, item.quantity + 1);
                }
            });
        });

        // Обработчики для кнопок удаления (на всякий случай)
        document.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const cartItem = btn.closest('.cart-item');
                if (cartItem) {
                    const productId = cartItem.dataset.id;
                    this.removeFromCart(productId);
                }
            });
        });
    }

        // Метод для обновления итоговой суммы в корзине
    updateCartSummary(discountedSubtotal, subtotal, itemsDiscount) {
        const cartFooter = document.querySelector('.cart-footer .cart-summary');
        if (!cartFooter) return;

        // Обновляем основную сумму
        const cartTotalElement = cartFooter.querySelector('.cart-total');
        if (cartTotalElement) {
            cartTotalElement.innerHTML = `
                <span>Итого:</span>
                <span class="total-price">${this.formatPrice(discountedSubtotal)} ₽</span>
            `;
        }

        // Обновляем или создаем детализацию
        let detailsElement = cartFooter.querySelector('.summary-details');
        if (itemsDiscount > 0) {
            if (!detailsElement) {
                detailsElement = document.createElement('div');
                detailsElement.className = 'summary-details';
                cartFooter.insertBefore(detailsElement, cartFooter.querySelector('.cart-actions'));
            }

            detailsElement.innerHTML = `
                <div class="summary-row">
                    <span>Товары:</span>
                    <span>${this.formatPrice(subtotal)} ₽</span>
                </div>
                <div class="summary-row promo-discount-row">
                    <span>Скидка на товары:</span>
                    <span>-${this.formatPrice(itemsDiscount)} ₽</span>
                </div>
                <div class="summary-row total-row">
                    <span>Итого к оплате:</span>
                    <span class="total-amount">${this.formatPrice(discountedSubtotal)} ₽</span>
                </div>
            `;
        } else if (detailsElement) {
            // Удаляем детализацию если нет скидок
            detailsElement.remove();
        }
    }

    // Проверка открыта ли корзина
    isCartOpen() {
        const cartOverlay = document.getElementById('cartOverlay');
        return cartOverlay && cartOverlay.style.display === 'flex';
    }
    toggleCart() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        if (cartOverlay.style.display === 'flex') {
            this.closeCart();
        } else {
            this.openCart();
        }
    }

    closeCart() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (cartOverlay) {
            cartOverlay.style.display = 'none';
            this.updateBackButton();
        }
    }


    openCart() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        // Создаем структуру корзины
        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="cart-header">
                    <h2><i class="fas fa-shopping-cart"></i> Корзина</h2>
                    <button class="close-cart" id="closeCart">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="cart-items" id="cartItems"></div>
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
                                <i class="fas fa-paper-plane"></i> Оформить заказ
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Назначаем обработчики
        document.getElementById('closeCart').onclick = () => this.closeCart();
        document.getElementById('clearCart').onclick = () => this.clearCart();
        document.getElementById('checkoutBtn').onclick = () => this.checkout();

        // Показываем корзину
        cartOverlay.style.display = 'flex';
        this.updateCartDisplay();
        this.updateBackButton();
    }


     clearCart() {
        if (this.cart.length === 0) {
            this.showNotification('Корзина уже пуста', 'info');
            return;
        }

        if (confirm('Вы уверены, что хотите очистить корзину?')) {
            this.cart = [];
            this.saveCart();
            this.updateCartCount();

            if (this.isCartOpen()) {
                this.updateCartDisplay();
            }

            this.showNotification('🗑️ Корзина очищена', 'info');
        }
    }


        // В методе checkout():
    async checkout() {
        if (this.cart.length === 0) {
            this.showNotification('❌ Корзина пуста!', 'error');
            return;
        }

        // Проверка доступности
        for (const item of this.cart) {
            try {
                const response = await fetch(`/api/products/${item.original_product_id || item.id}`);
                if (response.ok) {
                    const product = await response.json();

                    // Для обычных товаров
                    if (!item.is_weight) {
                        if (item.quantity > (product.stock || 0)) {
                            this.showNotification(
                                `❌ Товар "${item.name}" доступен только в количестве ${product.stock || 0} шт.`,
                                'error'
                            );
                            return;
                        }
                    }

                    // Для весовых товаров
                    if (item.is_weight && item.weight) {
                        if (item.weight > (product.stock_weight || 0)) {
                            this.showNotification(
                                `❌ Товар "${item.name}" доступен только ${product.stock_weight || 0} кг`,
                                'error'
                            );
                            return;
                        }
                    }
                }
            } catch (error) {
                console.error(`Ошибка проверки товара:`, error);
            }
        }

        await this.showDeliverySelection();
    }

    // ========== ДОСТАВКА И ОПЛАТА ==========

    async showDeliverySelection() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        const itemsTotal = this.cart.reduce((sum, item) => {
            const priceToShow = item.discounted_price || item.price;
            return sum + (priceToShow * item.quantity);
        }, 0);

        let deliveryCost = 0;
        let deliveryMessage = 'Бесплатно';
        const hasFreeDeliveryPromo = this.appliedPromoCode?.discount_type === 'free_delivery';

        if (!hasFreeDeliveryPromo && itemsTotal < 1000) {
            deliveryCost = 100;
            deliveryMessage = '100 ₽';
        }

        const promoDiscount = this.appliedPromoCode ?
            this.calculatePromoDiscount(itemsTotal, this.appliedPromoCode) : 0;
        const finalTotal = itemsTotal + deliveryCost - promoDiscount;

        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="cart-header" style="background: linear-gradient(135deg, #135deg, #135deg); color: white;">
                    <h2><i class="fas fa-truck"></i> Доставка</h2>
                    <button class="close-cart" id="closeDeliverySelection">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="delivery-content">
                    <div class="compact-promo-section">
                        <div style="margin-bottom: 16px; background: white; border-radius: 12px; padding: 12px; border: 1px solid #e0e0e0;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <i class="fas fa-ticket-alt" style="color: #f37425"></i>
                                <span style="font-weight: 600; color: #333; font-size: 14px;">Промокод</span>
                            </div>

                            ${!this.appliedPromoCode ? `
                                <div style="display: flex; gap: 8px;">
                                    <input type="text" id="compactPromoCodeInput" placeholder="Введите код" style="flex: 1; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px;">
                                    <button id="applyPromoBtnCompact" style="width: 60px; background: #27ae60; color: white; border: none; border-radius: 8px; cursor: pointer;">
                                        OK
                                    </button>
                                </div>
                            ` : `
                                <div style="display: flex; justify-content: space-between; align-items: center; background: #e8f5e9; padding: 10px 12px; border-radius: 8px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <i class="fas fa-check-circle" style="color: #4CAF50;"></i>
                                        <div>
                                            <div style="font-weight: 600; color: #2e7d32;">${this.appliedPromoCode.code}</div>
                                            <div style="font-size: 12px; color: #388E3C;">
                                                ${this.getPromoMessage(this.appliedPromoCode, promoDiscount)}
                                            </div>
                                        </div>
                                    </div>
                                    <button id="removePromoBtnCompact" style="background: none; border: none; color: #dc3545; cursor: pointer;">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            `}

                            <div id="compactPromoMessage" style="margin-top: 6px; font-size: 12px;"></div>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <div style="margin-bottom: 8px; font-weight: 600; color: #333;">Способ получения</div>

                            <div id="courierOption" style="margin-bottom: 8px; padding: 12px; border: ${this.deliveryData.type === 'courier' ? '2px solid #667eea' : '1px solid #e0e0e0'}; border-radius: 10px; background: ${this.deliveryData.type === 'courier' ? '#f8f9ff' : 'white'}; cursor: pointer;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="width: 40px; height: 40px; background: ${this.deliveryData.type === 'courier' ? 'linear-gradient(135deg, #e67e22 0%, #d35400 100%)' : '#6c757d'}; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                            <i class="fas fa-truck" style="color: white;"></i>
                                        </div>
                                        <div>
                                            <div style="font-weight: 600; color: #333;">Курьер</div>
                                            <div style="font-size: 13px; color: #666;">До двери, 30-60 мин</div>
                                        </div>
                                    </div>
                                    <div style="font-weight: 600; color: ${hasFreeDeliveryPromo || itemsTotal >= 1000 ? '#28a745' : '#dc3545'};">
                                        ${hasFreeDeliveryPromo || itemsTotal >= 1000 ? 'Бесплатно' : '100 ₽'}
                                    </div>
                                </div>
                            </div>

                            <div id="pickupOption" style="padding: 12px; border: ${this.deliveryData.type === 'pickup' ? '2px solid #667eea' : '1px solid #e0e0e0'}; border-radius: 10px; background: ${this.deliveryData.type === 'pickup' ? '#f8f9ff' : 'white'}; cursor: pointer;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="width: 40px; height: 40px; background: ${this.deliveryData.type === 'pickup' ? 'linear-gradient(135deg, #e67e22 0%, #d35400 100%)' : '#6c757d'}; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                            <i class="fas fa-store" style="color: white;"></i>
                                        </div>
                                        <div>
                                            <div style="font-weight: 600; color: #333;">Самовывоз</div>
                                            <div style="font-size: 13px; color: #666;">Из точки, 15-30 мин</div>
                                        </div>
                                    </div>
                                    <div style="font-weight: 600; color: #28a745;">Бесплатно</div>
                                </div>
                            </div>
                        </div>

                        <div style="background: white; border-radius: 12px; padding: 16px; border: 1px solid #e0e0e0; margin-bottom: 16px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span style="color: #666;">Товары:</span>
                                <span>${this.formatPrice(itemsTotal)} ₽</span>
                            </div>

                            ${promoDiscount > 0 ? `
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span style="color: #28a745;">Скидка:</span>
                                    <span style="color: #28a745;">-${this.formatPrice(promoDiscount)} ₽</span>
                                </div>
                            ` : ''}

                            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                <span style="color: #666;">Доставка:</span>
                                <span style="color: ${hasFreeDeliveryPromo || itemsTotal >= 1000 || this.deliveryData.type === 'pickup' ? '#28a745' : '#dc3545'};">
                                    ${hasFreeDeliveryPromo || itemsTotal >= 1000 || this.deliveryData.type === 'pickup' ? 'Бесплатно' : '100 ₽'}
                                </span>
                            </div>

                            <div style="border-top: 1px solid #eee; padding-top: 12px;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="font-weight: 600;">Итого:</span>
                                    <span style="font-weight: 700; color: #2c3e50;">${this.formatPrice(finalTotal)} ₽</span>
                                </div>
                            </div>
                        </div>

                        <button onclick="shop.returnToCartFromDelivery()" style="width: 100%; padding: 14px; background: white; color: #333; border: 1px solid #ddd; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <i class="fas fa-arrow-left"></i>
                            <span>Назад в корзину</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Назначение обработчиков
        setTimeout(() => {
            document.getElementById('courierOption').addEventListener('click', () => {
                this.deliveryData.type = 'courier';
                this.showAddressSelection();
            });

            document.getElementById('pickupOption').addEventListener('click', () => {
                this.deliveryData.type = 'pickup';
                this.showPickupPoints();
            });

            document.getElementById('closeDeliverySelection').addEventListener('click', () => this.closeCart());

            const backBtn = document.querySelector('button[onclick="shop.returnToCartFromDelivery()"]');
            if (backBtn) backBtn.addEventListener('click', () => this.returnToCartFromDelivery());

            if (!this.appliedPromoCode) {
                document.getElementById('applyPromoBtnCompact').addEventListener('click', () => this.applyCompactPromoCode());
                document.getElementById('compactPromoCodeInput').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.applyCompactPromoCode();
                });
            } else {
                document.getElementById('removePromoBtnCompact').addEventListener('click', () => this.removeCompactPromoCode());
            }
        }, 100);
    }
    returnToCartFromDelivery() {
        // Сбрасываем выбранные данные доставки
        this.deliveryData = {
            type: null,
            address_id: null,
            pickup_point: null,
            address_details: null
        };

        this.closeCart();
        setTimeout(() => {
            this.resetCartInterface();
            this.updateCartDisplay();
            const cartOverlay = document.getElementById('cartOverlay');
            if (cartOverlay) {
                cartOverlay.style.display = 'flex';
                this.updateBackButton();
            }
        }, 300);
    }

    resetCartInterface() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;
        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="cart-header">
                    <h2><i class="fas fa-shopping-cart"></i> Корзина</h2>
                    <button class="close-cart" id="closeCart">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="cart-items" id="cartItems"></div>
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
        this.bindEvent('closeCart', 'click', () => this.closeCart());
        this.bindEvent('clearCart', 'click', () => this.clearCart());
        this.bindEvent('checkoutBtn', 'click', () => this.checkout());
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

    calculatePromoDiscount(subtotal, promo) {
        if (!promo) return 0;
        switch (promo.discount_type) {
            case 'percentage': return subtotal * (promo.value / 100);
            case 'fixed': return Math.min(promo.value, subtotal);
            case 'free_delivery': return 0;
            case 'bogo': return this.cart.length > 0 ? Math.max(...this.cart.map(item => (item.discounted_price || item.price) * item.quantity)) * 0.5 : 0;
            default: return 0;
        }
    }

    getPromoMessage(promo, discount) {
        if (!promo) return '';
        switch (promo.discount_type) {
            case 'percentage': return `Скидка ${promo.value}%`;
            case 'fixed': return `Скидка ${this.formatPrice(promo.value)} ₽`;
            case 'free_delivery': return 'Бесплатная доставка';
            case 'bogo': return '2 по цене 1';
            default: return 'Скидка';
        }
    }


    // Добавь метод editOrder в класс AdminPanel:

async editOrder(orderId) {
    try {
        console.log('✏️ Редактирование заказа #', orderId);

        // Загружаем данные заказа
        const response = await fetch(`/api/admin/orders/${orderId}`);
        const order = await response.json();

        // Создаем модальное окно редактирования
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> Редактирование заказа #${order.id}</h3>
                    <button class="close-modal">&times;</button>
                </div>

                <div class="modal-body">
                    <form id="editOrderForm">
                        <div class="form-section">
                            <h4>Основная информация</h4>

                            <div class="form-group">
                                <label for="editOrderStatus">Статус заказа *</label>
                                <select id="editOrderStatus" required>
                                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Ожидает</option>
                                    <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>В обработке</option>
                                    <option value="delivering" ${order.status === 'delivering' ? 'selected' : ''}>Доставляется</option>
                                    <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Завершен</option>
                                    <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Отменен</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="editOrderTotal">Сумма заказа (₽) *</label>
                                <input type="number" id="editOrderTotal"
                                       value="${order.total || 0}"
                                       step="0.01"
                                       min="0"
                                       required>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label for="editDeliveryType">Тип доставки</label>
                                    <select id="editDeliveryType">
                                        <option value="courier" ${order.delivery_type === 'courier' ? 'selected' : ''}>Курьер</option>
                                        <option value="pickup" ${order.delivery_type === 'pickup' ? 'selected' : ''}>Самовывоз</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="editPaymentMethod">Способ оплаты</label>
                                    <select id="editPaymentMethod">
                                        <option value="cash" ${order.payment_method === 'cash' ? 'selected' : ''}>Наличные</option>
                                        <option value="transfer" ${order.payment_method === 'transfer' ? 'selected' : ''}>Перевод</option>
                                        <option value="terminal" ${order.payment_method === 'terminal' ? 'selected' : ''}>Терминал</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="form-section">
                            <h4>Информация о клиенте</h4>

                            <div class="form-group">
                                <label for="editRecipientName">Имя получателя *</label>
                                <input type="text" id="editRecipientName"
                                       value="${order.recipient_name || order.username || ''}"
                                       required>
                            </div>

                            <div class="form-group">
                                <label for="editPhoneNumber">Телефон</label>
                                <input type="tel" id="editPhoneNumber"
                                       value="${order.phone_number || ''}"
                                       placeholder="+7 (999) 123-45-67">
                            </div>

                            <div class="form-group">
                                <label for="editDeliveryAddress">Адрес доставки</label>
                                <textarea id="editDeliveryAddress" rows="2">${order.delivery_address || ''}</textarea>
                            </div>
                        </div>

                        <div class="form-section">
                            <h4>Промокод и скидки</h4>

                            <div class="form-row">
                                <div class="form-group">
                                    <label for="editPromoCode">Промокод</label>
                                    <input type="text" id="editPromoCode"
                                           value="${order.promo_code || ''}"
                                           placeholder="Введите промокод">
                                </div>

                                <div class="form-group">
                                    <label for="editPromoDiscount">Скидка по промокоду (₽)</label>
                                    <input type="number" id="editPromoDiscount"
                                           value="${order.promo_discount || 0}"
                                           step="0.01"
                                           min="0">
                                </div>
                            </div>

                            <div class="form-group">
                                <label for="editDeliveryCost">Стоимость доставки (₽)</label>
                                <input type="number" id="editDeliveryCost"
                                       value="${order.delivery_cost || 0}"
                                       step="0.01"
                                       min="0">
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary cancel-edit">Отмена</button>
                            <button type="submit" class="btn btn-primary">Сохранить изменения</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Обработчики событий
        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.querySelector('.cancel-edit').onclick = () => modal.remove();

        modal.querySelector('#editOrderForm').onsubmit = async (e) => {
            e.preventDefault();

            try {
                const formData = {
                    status: document.getElementById('editOrderStatus').value,
                    total: parseFloat(document.getElementById('editOrderTotal').value),
                    delivery_type: document.getElementById('editDeliveryType').value,
                    payment_method: document.getElementById('editPaymentMethod').value,
                    recipient_name: document.getElementById('editRecipientName').value,
                    phone_number: document.getElementById('editPhoneNumber').value,
                    delivery_address: document.getElementById('editDeliveryAddress').value,
                    promo_code: document.getElementById('editPromoCode').value || null,
                    promo_discount: parseFloat(document.getElementById('editPromoDiscount').value) || 0,
                    delivery_cost: parseFloat(document.getElementById('editDeliveryCost').value) || 0
                };

                // Валидация
                if (!formData.recipient_name.trim()) {
                    this.showNotification('❌ Введите имя получателя', 'error');
                    return;
                }

                if (formData.total <= 0) {
                    this.showNotification('❌ Сумма заказа должна быть больше 0', 'error');
                    return;
                }

                console.log('📤 Отправка изменений заказа:', formData);

                const updateResponse = await fetch(`/api/admin/orders/${orderId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });

                const result = await updateResponse.json();

                if (result.success) {
                    this.showNotification('✅ Заказ успешно обновлен', 'success');
                    modal.remove();

                    // Обновляем таблицу заказов
                    await this.loadOrders();
                } else {
                    throw new Error(result.error || 'Ошибка обновления заказа');
                }

            } catch (error) {
                console.error('❌ Ошибка обновления заказа:', error);
                this.showNotification(`❌ ${error.message}`, 'error');
            }
        };

    } catch (error) {
        console.error('❌ Ошибка редактирования заказа:', error);
        this.showNotification('❌ Не удалось загрузить данные заказа', 'error');
    }
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
                const itemsTotal = this.cart.reduce((sum, item) => sum + ((item.discounted_price || item.price) * item.quantity), 0);
                const promo = result.promo_code;

                if (promo.min_order_amount > 0 && itemsTotal < promo.min_order_amount) {
                    this.showCompactPromoMessage(`Минимум ${this.formatPrice(promo.min_order_amount)} ₽`, 'error');
                    return;
                }

                this.appliedPromoCode = { ...promo, code: code };
                this.showCompactPromoMessage('✅ Промокод применен!', 'success');
                setTimeout(() => this.showDeliverySelection(), 800);
            } else {
                this.showCompactPromoMessage(`❌ ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка:', error);
            this.showCompactPromoMessage('❌ Ошибка соединения', 'error');
        }
    }

    showCompactPromoMessage(message, type = 'info') {
        const messageDiv = document.getElementById('compactPromoMessage');
        if (!messageDiv) return;
        messageDiv.innerHTML = message;
        messageDiv.style.color = type === 'error' ? '#dc3545' :
                                type === 'success' ? '#28a745' :
                                type === 'loading' ? '#0c5460' : '#6c757d';
        if (type === 'success') {
            setTimeout(() => {
                if (messageDiv.textContent.includes('✅')) messageDiv.innerHTML = '';
            }, 2000);
        }
    }

    removeCompactPromoCode() {
        this.appliedPromoCode = null;
        this.showDeliverySelection();
    }

    saveUserToLocalStorage() {
        if (this.userId && this.userId !== 0) {
            localStorage.setItem('telegram_user_id', this.userId);
            localStorage.setItem('telegram_username', this.username);
        }
    }

    showLoading() {
        // Реализация индикатора загрузки
        const saveBtn = document.querySelector('.btn-primary');
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
            saveBtn.disabled = true;
        }
    }

    // ========== ОБРАБОТЧИКИ ДЛЯ ВЕСОВЫХ ТОВАРОВ ==========

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



    // ========== МЕТОДЫ ДЛЯ ВЕСОВЫХ ТОВАРОВ ==========

    renderWeightProductModal(product) {
        const modal = document.getElementById('productModal');
        if (!modal) return;

        const pricePerKg = product.price_per_kg || 0;
        const minWeight = product.min_weight || 0.1;
        const maxWeight = Math.min(product.max_weight || 5.0, product.stock_weight || 5.0);
        const stepWeight = product.step_weight || 0.1;
        const stockWeight = product.stock_weight || 0;
        const unit = product.unit || 'кг';

        const calculatePrice = (weight) => Math.floor(weight * pricePerKg);

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
                                    <span>До: ${maxWeight} ${unit}</span>
                                </div>
                                ${stockWeight > 0 ? `
                                    <div class="stock-weight">
                                        <i class="fas fa-box"></i>
                                        В наличии: ${stockWeight} ${unit}
                                    </div>
                                ` : ''}
                            </div>

                            <div class="weight-slider-container">
                                <input type="range"
                                       id="weightSlider"
                                       min="${minWeight}"
                                       max="${maxWeight}"
                                       step="${stepWeight}"
                                       value="${minWeight}"
                                       class="weight-slider">
                                <div class="slider-labels">
                                    <span>${minWeight} ${unit}</span>
                                    <span id="currentWeightValue">${minWeight} ${unit}</span>
                                    <span>${maxWeight} ${unit}</span>
                                </div>
                            </div>

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
                                           max="${maxWeight}"
                                           step="${stepWeight}"
                                           onchange="shop.updateWeightFromInput()">
                                    <button class="weight-btn" onclick="shop.adjustWeight(${stepWeight})">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                            </div>

                            <div class="quick-weight-selection">
                                <h5>Быстрый выбор:</h5>
                                <div class="quick-weights">
                                    ${[0.1, 0.25, 0.5, 1, 2, 3, 5]
                                        .filter(w => w >= minWeight && w <= maxWeight)
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
        this.initializeWeightControls(product);
    }

    initializeWeightControls(product) {
        const weightSlider = document.getElementById('weightSlider');
        const exactWeightInput = document.getElementById('exactWeight');

        if (!weightSlider || !exactWeightInput) return;

        const updateDisplay = () => {
            const weight = parseFloat(weightSlider.value);
            const unit = product.unit || 'кг';
            const pricePerKg = product.price_per_kg || 0;
            const price = Math.floor(weight * pricePerKg);

            document.getElementById('currentWeightValue').textContent = weight.toFixed(2) + ' ' + unit;
            document.getElementById('selectedWeight').textContent = weight.toFixed(2) + ' ' + unit;
            document.getElementById('calculatedPrice').textContent = this.formatPrice(price) + ' ₽';
            exactWeightInput.value = weight.toFixed(2);

            this.selectedWeight = weight;
            this.selectedWeightPrice = price;
        };

        weightSlider.addEventListener('input', () => {
            exactWeightInput.value = weightSlider.value;
            updateDisplay();
        });

        exactWeightInput.addEventListener('input', () => {
            let value = parseFloat(exactWeightInput.value) || parseFloat(weightSlider.min);
            const min = parseFloat(weightSlider.min);
            const max = parseFloat(weightSlider.max);

            if (value < min) value = min;
            if (value > max) value = max;

            weightSlider.value = value;
            updateDisplay();
        });

        updateDisplay();
        this.bindEvent('closeProductModal', 'click', () => this.closeProductModal());
    }

    adjustWeight(delta) {
        const input = document.getElementById('exactWeight');
        const slider = document.getElementById('weightSlider');
        if (!input || !slider) return;

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

    setExactWeight(weight) {
        const input = document.getElementById('exactWeight');
        const slider = document.getElementById('weightSlider');
        if (!input || !slider) return;

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
        if (!input || !slider) return;

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

        if (currentWeightSpan && selectedWeightSpan && calculatedPriceSpan) {
            // Обновляем отображение
            const unit = this.currentProduct?.unit || 'кг';
            const pricePerKg = this.currentProduct?.price_per_kg || 0;
            const price = Math.floor(value * pricePerKg);

            currentWeightSpan.textContent = value.toFixed(2) + ' ' + unit;
            selectedWeightSpan.textContent = value.toFixed(2) + ' ' + unit;
            calculatedPriceSpan.textContent = this.formatPrice(price) + ' ₽';

            this.selectedWeight = value;
            this.selectedWeightPrice = price;
        }
    }

        // В методе addWeightProductToCart:
    addWeightProductToCart(productId) {
        if (!this.currentProduct) return;

        const weight = this.selectedWeight || this.currentProduct.min_weight || 0.1;
        const pricePerKg = this.currentProduct.price_per_kg || this.currentProduct.price;
        const price = Math.floor(weight * pricePerKg);

        // Проверяем наличие веса
        if (this.currentProduct.stock_weight && weight > this.currentProduct.stock_weight) {
            this.showNotification(`❌ Доступно только ${this.currentProduct.stock_weight} кг`, 'error');
            return;
        }

        this.addToCart(
            productId,
            this.currentProduct.name, // Только название товара
            price,
            1,
            this.currentProduct.image_url
        );

        // Сбрасываем вес
        this.selectedWeight = 0.1;
        this.selectedWeightPrice = 0;

        this.closeProductModal();
    }

    // Добавляем метод editWeight:
    async editWeight(cartItemId) {
        const item = this.cart.find(item => item.id.toString() === cartItemId.toString());
        if (!item || !item.is_weight) return;

        try {
            // Получаем информацию о товаре
            const response = await fetch(`/api/products/${item.original_product_id}`);
            if (!response.ok) throw new Error('Товар не найден');

            const product = await response.json();

            // Создаем модальное окно для редактирования веса
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
                z-index: 2000;
                padding: 20px;
            `;

            const maxWeight = Math.min(
                product.stock_weight || 5.0,
                product.max_weight || 5.0
            );

            modal.innerHTML = `
                <div style="background: white; border-radius: 12px; width: 100%; max-width: 320px; max-height: 90vh; overflow-y: auto;">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: #2c3e50;">
                            <i class="fas fa-weight-hanging"></i> Изменить вес
                        </h3>
                        <button class="close-modal"
                                style="background: none; border: none; font-size: 20px; color: #64748b; cursor: pointer;">
                            &times;
                        </button>
                    </div>

                    <div style="padding: 20px;">
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #475569;">
                                Товар: ${product.name}
                            </label>
                            <div style="display: flex; align-items: center; gap: 10px; margin: 15px 0;">
                                <input type="number"
                                       id="editWeightInput"
                                       value="${item.weight}"
                                       min="${product.min_weight || 0.1}"
                                       max="${maxWeight}"
                                       step="${product.step_weight || 0.1}"
                                       style="flex: 1; padding: 10px; border: 2px solid #e2e8f0; border-radius: 6px; text-align: center;">
                                <span style="color: #64748b;">${product.unit || 'кг'}</span>
                            </div>
                        </div>

                        <div style="display: flex; gap: 8px;">
                            <button class="cancel-edit"
                                    style="flex: 1; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #475569; cursor: pointer;">
                                Отмена
                            </button>
                            <button class="save-weight"
                                    style="flex: 1; padding: 12px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                                Сохранить
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Обработчики событий
            modal.querySelector('.close-modal').onclick = () => modal.remove();
            modal.querySelector('.cancel-edit').onclick = () => modal.remove();
            modal.querySelector('.save-weight').onclick = async () => {
                const input = document.getElementById('editWeightInput');
                const newWeight = parseFloat(input.value);

                await this.updateWeightProductWeight(cartItemId, newWeight);
                modal.remove();
            };

        } catch (error) {
            console.error('❌ Ошибка редактирования веса:', error);
            this.showNotification('❌ Не удалось изменить вес', 'error');
        }
    }

        // ========== МЕТОДЫ ДЛЯ ШТУЧНЫХ ТОВАРОВ ==========

    renderProductModal(product) {
        const modal = document.getElementById('productModal');
        if (!modal) return;

        const discount = this.calculateProductDiscount(product);
        const discountedPrice = discount ? this.calculateDiscountedPrice(product.price, discount) : product.price;
        const hasDiscount = discount && discountedPrice < product.price;

        modal.innerHTML = `
            <div class="product-modal">
                <button class="close-product-modal" id="closeProductModal">
                    <i class="fas fa-times"></i>
                </button>
                <div class="product-modal-content">
                    <div class="product-modal-image-container">
                        ${hasDiscount ? `
                            <div class="discount-badge">
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
                                    <div class="quantity-selector-controls">
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
        this.bindModalEvents(product);
        this.updateBackButton();
    }

    bindModalEvents(product) {
        this.bindEvent('closeProductModal', 'click', () => this.closeProductModal());
        this.bindEvent('qtyMinus', 'click', () => this.changeQuantity(-1));
        this.bindEvent('qtyPlus', 'click', () => this.changeQuantity(1));
        this.bindEvent('addToCartModal', 'click', () => {
            const quantityInput = document.getElementById('quantity');
            const quantity = quantityInput ? parseInt(quantityInput.value) || 1 : 1;
            this.addToCartFromModal(product, quantity);
        });

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

    // ========== МЕТОДЫ АДРЕСА И ДОСТАВКИ ==========

    async showAddressSelection() {
        try {
            const userId = this.userId;
            let addresses = [];

            if (userId !== 0) {
                const response = await fetch(`/api/user/addresses?user_id=${userId}`);
                if (response.ok) addresses = await response.json();
            } else {
                const guestAddresses = localStorage.getItem('guest_addresses');
                if (guestAddresses) addresses = JSON.parse(guestAddresses);
            }

            const cartOverlay = document.getElementById('cartOverlay');
            if (!cartOverlay) return;

            // Функция для форматирования адреса с новыми полями
            const formatAddress = (addr) => {
                let parts = [];

                if (addr.city) parts.push(`г. ${addr.city}`);
                if (addr.street) parts.push(`ул. ${addr.street}`);
                if (addr.house) parts.push(`д. ${addr.house}`);
                if (addr.building) parts.push(`корп. ${addr.building}`);
                if (addr.entrance) parts.push(`подъезд ${addr.entrance}`);
                if (addr.apartment) parts.push(`кв. ${addr.apartment}`);
                if (addr.floor) parts.push(`этаж ${addr.floor}`);

                return parts.join(', ');
            };

            let addressesHTML = '';
            let hasAddresses = addresses.length > 0;

            if (hasAddresses) {
                addresses.forEach((addr, index) => {
                    const addressId = userId === 0 ? index : addr.id;
                    const formattedAddress = formatAddress(addr);

                    addressesHTML += `
                        <div class="address-card" onclick="shop.selectAddress(${addressId})">
                            <div class="address-header">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <i class="fas fa-map-marker-alt" style="color: #667eea;"></i>
                                    <strong>${addr.recipient_name || 'Адрес'}</strong>
                                    <span style="color: #718096;">${addr.phone || ''}</span>
                                </div>
                                ${addr.is_default ? '<span class="default-badge">По умолчанию</span>' : ''}
                            </div>

                            <div class="address-details">
                                <div style="color: #4a5568; font-size: 14px; margin-bottom: 4px;">
                                    ${formattedAddress}
                                </div>

                                <!-- Показываем домофон если есть -->
                                ${addr.doorcode ? `
                                    <p style="font-size: 13px; color: #718096; margin: 4px 0;">
                                        <i class="fas fa-key"></i> Домофон: ${addr.doorcode}
                                    </p>
                                ` : ''}

                                <!-- Показываем комментарий если есть -->
                                ${addr.comment ? `
                                    <div style="color: #718096; font-size: 13px; font-style: italic; margin-top: 6px; padding: 6px; background: #f7fafc; border-radius: 4px;">
                                        <i class="fas fa-comment"></i> ${addr.comment}
                                    </div>
                                ` : ''}
                            </div>

                            ${userId === 0 ? `
                                <div class="address-actions">
                                    <button class="btn-small btn-danger" onclick="event.stopPropagation(); shop.removeGuestAddress(${index})">
                                        <i class="fas fa-trash"></i> Удалить
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
                        <h2><i class="fas fa-map-marker-alt"></i> Выберите адрес доставки</h2>
                        <button class="close-cart" onclick="shop.closeCart()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="addresses-list" style="
                        padding: 16px;
                        max-height: 60vh;
                        overflow-y: auto;
                    ">
                        ${hasAddresses ? addressesHTML : `
                            <div class="no-addresses" style="
                                text-align: center;
                                padding: 40px 20px;
                                color: #718096;
                            ">
                                <i class="fas fa-map-marker-slash" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                                <h3 style="margin: 0 0 8px 0; color: #4a5568;">Нет сохраненных адресов</h3>
                                <p style="margin: 0;">Добавьте адрес для доставки</p>
                            </div>
                        `}
                    </div>

                    <div class="delivery-actions" style="
                        padding: 16px;
                        border-top: 1px solid #e2e8f0;
                        display: flex;
                        gap: 12px;
                    ">
                        <button class="btn btn-primary"
                                onclick="shop.showAddressForm()"
                                style="
                                    flex: 1;
                                    padding: 14px;
                                    background: #667eea;
                                    color: white;
                                    border: none;
                                    border-radius: 8px;
                                    font-size: 16px;
                                    font-weight: 600;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    gap: 8px;
                                ">
                            <i class="fas fa-plus"></i> Добавить новый адрес
                        </button>
                        <button class="btn btn-outline"
                                onclick="shop.showDeliverySelection()"
                                style="
                                    padding: 14px 20px;
                                    background: white;
                                    color: #4a5568;
                                    border: 2px solid #e2e8f0;
                                    border-radius: 8px;
                                    font-size: 16px;
                                    font-weight: 600;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    gap: 8px;
                                ">
                            <i class="fas fa-arrow-left"></i> Назад
                        </button>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('❌ Ошибка загрузки адресов:', error);
            await this.showAddressForm();
        }
    }

]
     formatAddress(address) {
        let parts = [];

        if (address.city) parts.push(`г. ${address.city}`);
        if (address.street) parts.push(`ул. ${address.street}`);
        if (address.house) parts.push(`д. ${address.house}`);
        if (address.building) parts.push(`корп. ${address.building}`);
        if (address.entrance) parts.push(`подъезд ${address.entrance}`);
        if (address.apartment) parts.push(`кв. ${address.apartment}`);
        if (address.floor) parts.push(`этаж ${address.floor}`);

        return parts.join(', ');
    }

    // ========== МЕТОДЫ АДРЕСА И ДОСТАВКИ ==========

    async showAddressForm() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        // Компактная версия адресной формы
        cartOverlay.innerHTML = `
            <div class="cart-modal">
                <div class="cart-header">
                    <h2><i class="fas fa-address-card"></i> Новый адрес</h2>
                    <button class="close-cart" onclick="shop.closeCart()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="address-form-compact" style="
                    padding: 16px;
                    max-height: 70vh;
                    overflow-y: auto;
                ">
                    <!-- Основная информация -->
                    <div class="form-section" style="margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #2c3e50;">
                            <i class="fas fa-user-circle" style="font-size: 18px;"></i>
                            <h3 style="margin: 0; font-size: 16px; font-weight: 600;">Получатель</h3>
                        </div>

                        <div class="form-group" style="margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                <i class="fas fa-user" style="color: #667eea; font-size: 14px;"></i>
                                <label style="font-size: 14px; color: #4a5568;">
                                    Имя получателя <span style="color: #e53e3e;">*</span>
                                </label>
                            </div>
                            <input type="text"
                                   id="recipientName"
                                   placeholder="Иван Иванов"
                                   required
                                   style="
                                       width: 100%;
                                       padding: 12px;
                                       border: 2px solid #e2e8f0;
                                       border-radius: 8px;
                                       font-size: 16px;
                                       transition: all 0.3s ease;
                                   "
                                   onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                   onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            <div id="recipientNameError" style="color: #e53e3e; font-size: 12px; margin-top: 4px; display: none;">
                                Поле обязательно для заполнения
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                <i class="fas fa-phone" style="color: #667eea; font-size: 14px;"></i>
                                <label style="font-size: 14px; color: #4a5568;">
                                    Телефон <span style="color: #e53e3e;">*</span>
                                </label>
                            </div>
                            <input type="tel"
                                   id="recipientPhone"
                                   placeholder="+7 (999) 123-45-67"
                                   required
                                   pattern="^\+7\s?[\(]?\d{3}[\)]?\s?\d{3}[\-]?\d{2}[\-]?\d{2}$"
                                   style="
                                       width: 100%;
                                       padding: 12px;
                                       border: 2px solid #e2e8f0;
                                       border-radius: 8px;
                                       font-size: 16px;
                                   "
                                   onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                   onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            <div id="phoneError" style="color: #e53e3e; font-size: 12px; margin-top: 4px; display: none;">
                                Введите корректный номер телефона (формат: +7 XXX XXX-XX-XX)
                            </div>
                        </div>
                    </div>

                    <!-- Адрес -->
                    <div class="form-section" style="margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #2c3e50;">
                            <i class="fas fa-map-marker-alt" style="font-size: 18px;"></i>
                            <h3 style="margin: 0; font-size: 16px; font-weight: 600;">Адрес доставки</h3>
                        </div>

                        <div class="form-group" style="margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                <i class="fas fa-city" style="color: #667eea; font-size: 14px;"></i>
                                <label style="font-size: 14px; color: #4a5568;">
                                    Город <span style="color: #e53e3e;">*</span>
                                </label>
                            </div>
                            <input type="text"
                                   id="city"
                                   placeholder="Москва"
                                   required
                                   style="
                                       width: 100%;
                                       padding: 12px;
                                       border: 2px solid #e2e8f0;
                                       border-radius: 8px;
                                       font-size: 16px;
                                   "
                                   onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                   onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            <div id="cityError" style="color: #e53e3e; font-size: 12px; margin-top: 4px; display: none;">
                                Поле обязательно для заполнения
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                <i class="fas fa-road" style="color: #667eea; font-size: 14px;"></i>
                                <label style="font-size: 14px; color: #4a5568;">
                                    Улица <span style="color: #e53e3e;">*</span>
                                </label>
                            </div>
                            <input type="text"
                                   id="street"
                                   placeholder="Ленина"
                                   required
                                   style="
                                       width: 100%;
                                       padding: 12px;
                                       border: 2px solid #e2e8f0;
                                       border-radius: 8px;
                                       font-size: 16px;
                                   "
                                   onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                   onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            <div id="streetError" style="color: #e53e3e; font-size: 12px; margin-top: 4px; display: none;">
                                Поле обязательно для заполнения
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                            <div class="form-group">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                    <i class="fas fa-home" style="color: #667eea; font-size: 14px;"></i>
                                    <label style="font-size: 14px; color: #4a5568;">
                                        Дом <span style="color: #e53e3e;">*</span>
                                    </label>
                                </div>
                                <input type="text"
                                       id="house"
                                       placeholder="15"
                                       required
                                       style="
                                           width: 100%;
                                           padding: 12px;
                                           border: 2px solid #e2e8f0;
                                           border-radius: 8px;
                                           font-size: 16px;
                                       "
                                       onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                       onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                                <div id="houseError" style="color: #e53e3e; font-size: 12px; margin-top: 4px; display: none;">
                                    Поле обязательно для заполнения
                                </div>
                            </div>

                            <div class="form-group">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                    <i class="fas fa-building" style="color: #667eea; font-size: 14px;"></i>
                                    <label style="font-size: 14px; color: #4a5568;">Корпус</label>
                                </div>
                                <input type="text"
                                       id="building"
                                       placeholder="1"
                                       style="
                                           width: 100%;
                                           padding: 12px;
                                           border: 2px solid #e2e8f0;
                                           border-radius: 8px;
                                           font-size: 16px;
                                       "
                                       onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                       onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                            <div class="form-group">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                    <i class="fas fa-door-closed" style="color: #667eea; font-size: 14px;"></i>
                                    <label style="font-size: 14px; color: #4a5568;">Квартира</label>
                                </div>
                                <input type="text"
                                       id="apartment"
                                       placeholder="24"
                                       style="
                                           width: 100%;
                                           padding: 12px;
                                           border: 2px solid #e2e8f0;
                                           border-radius: 8px;
                                           font-size: 16px;
                                       "
                                       onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                       onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            </div>

                            <div class="form-group">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                    <i class="fas fa-door-open" style="color: #667eea; font-size: 14px;"></i>
                                    <label style="font-size: 14px; color: #4a5568;">Подъезд</label>
                                </div>
                                <input type="text"
                                       id="entrance"
                                       placeholder="2"
                                       style="
                                           width: 100%;
                                           padding: 12px;
                                           border: 2px solid #e2e8f0;
                                           border-radius: 8px;
                                           font-size: 16px;
                                       "
                                       onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                       onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                            <div class="form-group">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                    <i class="fas fa-stairs" style="color: #667eea; font-size: 14px;"></i>
                                    <label style="font-size: 14px; color: #4a5568;">Этаж</label>
                                </div>
                                <input type="text"
                                       id="floor"
                                       placeholder="2"
                                       style="
                                           width: 100%;
                                           padding: 12px;
                                           border: 2px solid #e2e8f0;
                                           border-radius: 8px;
                                           font-size: 16px;
                                       "
                                       onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                       onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            </div>

                            <div class="form-group">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                    <i class="fas fa-key" style="color: #667eea; font-size: 14px;"></i>
                                    <label style="font-size: 14px; color: #4a5568;">Домофон</label>
                                </div>
                                <input type="text"
                                       id="doorcode"
                                       placeholder="123"
                                       style="
                                           width: 100%;
                                           padding: 12px;
                                           border: 2px solid #e2e8f0;
                                           border-radius: 8px;
                                           font-size: 16px;
                                       "
                                       onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                       onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            </div>
                        </div>

                        <!-- Комментарий курьеру -->
                        <div class="form-group" style="margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                <i class="fas fa-comment" style="color: #667eea; font-size: 14px;"></i>
                                <label style="font-size: 14px; color: #4a5568;">Комментарий курьеру</label>
                            </div>
                            <textarea id="comment"
                                      placeholder="Например: Позвоните за 5 минут до доставки, оставьте у двери..."
                                      style="
                                          width: 100%;
                                          padding: 12px;
                                          border: 2px solid #e2e8f0;
                                          border-radius: 8px;
                                          font-size: 16px;
                                          min-height: 80px;
                                          resize: vertical;
                                          font-family: inherit;
                                      "
                                      onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                                      onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'"></textarea>
                        </div>
                    </div>
                </div>

                <div class="delivery-actions" style="
                    padding: 16px;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    gap: 12px;
                ">
                    <button class="btn btn-primary"
                            onclick="shop.saveAddress()"
                            style="
                                flex: 1;
                                padding: 14px;
                                background: #667eea;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                font-size: 16px;
                                font-weight: 600;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 8px;
                            ">
                        <i class="fas fa-save"></i> Сохранить адрес
                    </button>
                    <button class="btn btn-outline"
                            onclick="shop.showAddressSelection()"
                            style="
                                padding: 14px 20px;
                                background: white;
                                color: #4a5568;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                font-size: 16px;
                                font-weight: 600;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 8px;
                            ">
                        <i class="fas fa-arrow-left"></i> Назад
                    </button>
                </div>
            </div>
        `;

        // Автоматическое поднятие экрана при фокусе на поле
        setTimeout(() => {
            const inputs = document.querySelectorAll('#recipientName, #recipientPhone, #city, #street, #house, #apartment, #floor, #doorcode');

            inputs.forEach(input => {
                input.addEventListener('focus', () => {
                    // Плавное поднятие экрана
                    setTimeout(() => {
                        const rect = input.getBoundingClientRect();
                        const isElementInViewport = (
                            rect.top >= 0 &&
                            rect.left >= 0 &&
                            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                        );

                        if (!isElementInViewport) {
                            input.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center'
                            });
                        }
                    }, 300);
                });

                // Автоматическое скрытие клавиатуры при нажатии Enter
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();

                        // Переход к следующему полю
                        const nextInput = input.nextElementSibling?.nextElementSibling?.nextElementSibling ||
                                         input.nextElementSibling?.nextElementSibling;
                        if (nextInput && nextInput.tagName === 'INPUT') {
                            nextInput.focus();
                        }
                    }
                });
            });

            // Автофокус на первом поле
            const firstInput = document.getElementById('recipientName');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }

    async saveAddress() {
        try {
            const addressData = {
                user_id: this.userId,
                city: document.getElementById('city').value.trim(),
                street: document.getElementById('street').value.trim(),
                house: document.getElementById('house').value.trim(),
                building: document.getElementById('building').value.trim(),
                entrance: document.getElementById('entrance').value.trim(),
                apartment: document.getElementById('apartment').value.trim(),
                floor: document.getElementById('floor').value.trim(),
                doorcode: document.getElementById('doorcode').value.trim(),
                recipient_name: document.getElementById('recipientName').value.trim(),
                phone: document.getElementById('recipientPhone').value.trim(),
                comment: document.getElementById('comment')?.value.trim() || ''
            };

            // Валидация обязательных полей
            let hasError = false;

            if (!addressData.recipient_name) {
                this.showFieldError('recipientNameError', 'Поле обязательно для заполнения');
                hasError = true;
            } else {
                this.hideFieldError('recipientNameError');
            }

            if (!addressData.phone) {
                this.showFieldError('phoneError', 'Поле обязательно для заполнения');
                hasError = true;
            } else if (!this.validatePhone(addressData.phone)) {
                this.showFieldError('phoneError', 'Введите корректный номер телефона');
                hasError = true;
            } else {
                this.hideFieldError('phoneError');
            }

            if (!addressData.city) {
                this.showFieldError('cityError', 'Поле обязательно для заполнения');
                hasError = true;
            } else {
                this.hideFieldError('cityError');
            }

            if (!addressData.street) {
                this.showFieldError('streetError', 'Поле обязательно для заполнения');
                hasError = true;
            } else {
                this.hideFieldError('streetError');
            }

            if (!addressData.house) {
                this.showFieldError('houseError', 'Поле обязательно для заполнения');
                hasError = true;
            } else {
                this.hideFieldError('houseError');
            }

            if (hasError) {
                this.showNotification('❌ Заполните все обязательные поля', 'error');
                return;
            }

            // Показываем индикатор загрузки
            this.showLoading();

            let result;

            if (this.userId === 0) {
                result = this.saveGuestAddress(addressData);
            } else {
                const response = await fetch('/api/user/addresses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(addressData)
                });
                result = await response.json();
            }

            if (result.success) {
                this.deliveryData.address_id = result.id;
                this.deliveryData.address_comment = addressData.comment;
                this.showNotification('✅ Адрес сохранен', 'success');
                setTimeout(() => {
                    this.showAddressSelection();
                }, 1000);
            } else {
                throw new Error(result.error || 'Ошибка сохранения');
            }

        } catch (error) {
            console.error('Ошибка сохранения адреса:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }


    hideLoading() {
        const saveBtn = document.querySelector('.btn-primary');
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Сохранить адрес';
            saveBtn.disabled = false;
        }
    }


    showFieldError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.style.display = 'block';

            // Подсветка поля
            const inputId = elementId.replace('Error', '');
            const input = document.getElementById(inputId);
            if (input) {
                input.style.borderColor = '#e53e3e';
                input.style.boxShadow = '0 0 0 3px rgba(229, 62, 62, 0.1)';
            }
        }
    }

    hideFieldError(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = 'none';

            // Сброс подсветки поля
            const inputId = elementId.replace('Error', '');
            const input = document.getElementById(inputId);
            if (input) {
                input.style.borderColor = '#e2e8f0';
                input.style.boxShadow = 'none';
            }
        }
    }


    saveGuestAddress(addressData) {
        try {
            const guestAddresses = JSON.parse(localStorage.getItem('guest_addresses') || '[]');
            const newAddress = {
                ...addressData,
                id: Date.now(), // Уникальный ID на основе времени
                is_default: guestAddresses.length === 0,
                created_at: new Date().toISOString()
            };

            guestAddresses.push(newAddress);
            localStorage.setItem('guest_addresses', JSON.stringify(guestAddresses));

            return {
                success: true,
                id: `guest_${newAddress.id}`,
                address: newAddress
            };
        } catch (error) {
            console.error('Ошибка сохранения адреса гостя:', error);
            return { success: false, error: error.message };
        }
    }

        // Вспомогательные методы для валидации
    validatePhone(phone) {
        // Простая валидация российского номера
        const phoneRegex = /^\+7\s?[\(]?\d{3}[\)]?\s?\d{3}[\-]?\d{2}[\-]?\d{2}$/;
        return phoneRegex.test(phone);
    }

    removeGuestAddress(index) {
        try {
            const guestAddresses = JSON.parse(localStorage.getItem('guest_addresses') || '[]');
            if (index >= 0 && index < guestAddresses.length) {
                const removedAddress = guestAddresses[index];
                guestAddresses.splice(index, 1);

                // Если удаляемый адрес был по умолчанию, назначаем новый (первый в списке)
                if (removedAddress.is_default && guestAddresses.length > 0) {
                    guestAddresses[0].is_default = true;
                }

                localStorage.setItem('guest_addresses', JSON.stringify(guestAddresses));

                this.showNotification('✅ Адрес удален', 'success');
                this.showAddressSelection();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка удаления адреса гостя:', error);
            this.showNotification('❌ Ошибка удаления адреса', 'error');
            return false;
        }
    }

    async selectAddress(addressId) {
        try {
            console.log('📍 Выбран адрес ID:', addressId, 'для пользователя ID:', this.userId);

            if (this.userId === 0) {
                this.deliveryData.address_id = `guest_${addressId}`;
                const guestAddresses = JSON.parse(localStorage.getItem('guest_addresses') || '[]');
                const addressIndex = addressId;
                const selectedAddress = guestAddresses[addressIndex];

                if (selectedAddress) {
                    this.deliveryData.address_details = selectedAddress;
                    this.deliveryData.address_comment = selectedAddress.comment || '';
                }
            } else {
                this.deliveryData.address_id = addressId;
                try {
                    const response = await fetch(`/api/user/addresses?user_id=${this.userId}`);
                    if (response.ok) {
                        const addresses = await response.json();
                        const selectedAddress = addresses.find(addr => addr.id === addressId);

                        if (selectedAddress) {
                            this.deliveryData.address_details = selectedAddress;
                            this.deliveryData.address_comment = selectedAddress.comment || '';
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Не удалось загрузить детали адреса:', error);
                }
            }

            await this.showPaymentSelection();

        } catch (error) {
            console.error('❌ Ошибка выбора адреса:', error);
            this.showNotification('❌ Ошибка выбора адреса', 'error');
        }
    }

    async showPickupPoints() {
        try {
            const response = await fetch('/api/pickup-points');
            const points = await response.json();

            const cartOverlay = document.getElementById('cartOverlay');
            if (!cartOverlay) return;

            // Функция проверки, открыта ли точка в текущее время
            const isPointOpen = (workingHours) => {
                if (!workingHours) return true; // Если время не указано, считаем открытым

                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const currentTime = currentHour * 60 + currentMinute;

                // Парсим время работы (формат: "9:00-22:00" или "10:00-20:00")
                const match = workingHours.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
                if (!match) return true;

                const [, startHour, startMinute, endHour, endMinute] = match;
                const openTime = parseInt(startHour) * 60 + parseInt(startMinute);
                const closeTime = parseInt(endHour) * 60 + parseInt(endMinute);

                return currentTime >= openTime && currentTime <= closeTime;
            };

            let pointsHTML = '';
            points.forEach(point => {
                const workingHours = point.working_hours || '9:00-22:00';
                const isOpen = isPointOpen(workingHours);
                const isClickable = isOpen; // Только открытые точки можно выбирать

                pointsHTML += `
                    <div class="pickup-card ${!isOpen ? 'closed-card' : ''}"
                         ${isClickable ? `onclick="shop.selectPickupPoint(${point.id})"` : ''}>
                        <div class="pickup-header">
                            <h3>${point.name}</h3>
                            <span class="pickup-status ${isOpen ? 'open' : 'closed'}">
                                ${isOpen ? '🟢 Открыто' : '🔴 Закрыто'}
                            </span>
                        </div>
                        <div class="pickup-details">
                            <p><i class="fas fa-map-marker-alt"></i> ${point.address}</p>
                            <p><i class="fas fa-clock"></i> ${workingHours}</p>
                            ${point.phone ? `<p><i class="fas fa-phone"></i> ${point.phone}</p>` : ''}
                            ${!isOpen ? `
                                <p style="color: #e74c3c; font-size: 13px; margin-top: 5px;">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    Сейчас закрыто. Доступно для заказа с 9:00
                                </p>
                            ` : ''}
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

                    <div class="time-info" style="
                        padding: 10px 20px;
                        background: #f8f9fa;
                        border-bottom: 1px solid #e9ecef;
                        font-size: 14px;
                        color: #6c757d;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <i class="fas fa-clock"></i>
                        <span>Текущее время: ${new Date().toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit'
                        })}</span>
                    </div>

                    <div class="pickup-list" style="padding: 20px;">
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

    // ========== МЕТОДЫ ОПЛАТЫ ==========

     async showPaymentSelection() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        // Рассчитываем сумму с учетом скидок на товары
        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const discountedSubtotal = this.cart.reduce((sum, item) => {
            const priceToShow = item.discounted_price || item.price;
            return sum + (priceToShow * item.quantity);
        }, 0);
        const itemsDiscount = subtotal - discountedSubtotal;

        // Рассчитываем скидку по промокоду
        const promoDiscount = this.appliedPromoCode ?
            this.calculatePromoDiscount(discountedSubtotal, this.appliedPromoCode) : 0;

        // Рассчитываем стоимость доставки
        let deliveryCost = 0;
        const hasFreeDeliveryPromo = this.appliedPromoCode?.discount_type === 'free_delivery';

        if (this.deliveryData.type === 'courier') {
            if (hasFreeDeliveryPromo) {
                deliveryCost = 0;
            } else if (discountedSubtotal < 1000) {
                deliveryCost = 100;
            }
        }

        // Итоговая сумма
        const totalAmount = discountedSubtotal + deliveryCost - promoDiscount;

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
                    <div class="price-breakdown">
                        <div>Товары: ${this.formatPrice(subtotal)} ₽</div>
                        ${itemsDiscount > 0 ? `<div>Скидка на товары: -${this.formatPrice(itemsDiscount)} ₽</div>` : ''}
                        ${deliveryCost > 0 ? `<div>Доставка: ${this.formatPrice(deliveryCost)} ₽</div>` : ''}
                        ${deliveryCost === 0 && this.deliveryData.type === 'courier' ? `<div>Доставка: Бесплатно 🎉</div>` : ''}
                        ${promoDiscount > 0 ? `<div>Скидка по промокоду: -${this.formatPrice(promoDiscount)} ₽</div>` : ''}
                        <div><strong>Итого к оплате: ${this.formatPrice(totalAmount)} ₽</strong></div>
                    </div>
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
                            <h3>Перевод по номеру</h3>
                            <p>Перевод СБП по номеру</p>
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

        // Назначение обработчиков (без изменений)
        document.getElementById('cashOption').addEventListener('click', () => {
            this.selectPaymentMethod('cash', totalAmount);
        });

        document.getElementById('transferOption').addEventListener('click', () => {
            this.selectPaymentMethod('transfer', totalAmount);
        });

        document.getElementById('terminalOption').addEventListener('click', () => {
            this.selectPaymentMethod('terminal', totalAmount);
        });

        document.getElementById('backToAddressBtn').addEventListener('click', () => {
            if (this.deliveryData.type === 'courier') {
                this.showAddressSelection();
            } else {
                this.showPickupPoints();
            }
        });

        document.getElementById('closePaymentSelection').addEventListener('click', () => this.closeCart());
    }


    selectPaymentMethod(method, totalAmount = null) {
        if (method === 'cash') {
            const finalAmount = totalAmount !== null ? totalAmount : this.calculateTotalAmount();
            console.log('💵 Сумма для наличных:', finalAmount);
            this.showCashPaymentModal(finalAmount);
        } else {
            this.deliveryData.payment_method = method;
            const methodNames = {
                'cash': 'Наличные',
                'transfer': 'Перевод по номеру СБП',
                'terminal': 'Терминал'
            };
            this.showNotification(`✅ Выбрана оплата: ${methodNames[method]}`, 'success');
            this.confirmOrder();
        }
    }

    calculateTotalAmount() {
        const itemsTotal = this.cart.reduce((sum, item) => {
            const priceToShow = item.discounted_price || item.price;
            return sum + (priceToShow * item.quantity);
        }, 0);

        const promoDiscount = this.appliedPromoCode ?
            this.calculatePromoDiscount(itemsTotal, this.appliedPromoCode) : 0;

        let deliveryCost = 0;
        const hasFreeDeliveryPromo = this.appliedPromoCode?.discount_type === 'free_delivery';

        if (this.deliveryData.type === 'courier' && !hasFreeDeliveryPromo && itemsTotal < 1000) {
            deliveryCost = 100;
        }

        return itemsTotal + deliveryCost - promoDiscount;
    }

    showCashPaymentModal(totalAmount) {
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

        const defaultCashAmount = Math.ceil(totalAmount / 100) * 100;

        modal.innerHTML = `
            <div style="background: white; border-radius: 10px; width: 100%; max-width: 320px; max-height: 90vh; overflow-y: auto;">
                <div style="padding: 15px; border-bottom: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 16px; color: #333;">
                            <i class="fas fa-money-bill-wave"></i> Наличные
                        </h3>
                        <button id="closeCashModal"
                                style="background: none; border: none; color: #666; cursor: pointer; font-size: 16px; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div style="padding: 15px;">
                    <div style="text-align: center; margin-bottom: 15px;">
                        <div style="font-size: 13px; color: #666; margin-bottom: 4px;">К оплате:</div>
                        <div style="font-size: 24px; font-weight: bold; color: #2c3e50;">${this.formatPrice(totalAmount)} ₽</div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <div style="font-size: 13px; color: #666; margin-bottom: 6px;">Сумма от клиента:</div>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="number"
                                   id="cashAmountCompact"
                                   value="${defaultCashAmount}"
                                   min="${totalAmount}"
                                   step="1"
                                   style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; text-align: center;">
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px;">
                            <button class="cash-add-btn" data-amount="100"
                                    style="padding: 8px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                +100 ₽
                            </button>
                            <button class="cash-add-btn" data-amount="500"
                                    style="padding: 8px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                +500 ₽
                            </button>
                            <button class="cash-add-btn" data-amount="1000"
                                    style="padding: 8px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                +1000 ₽
                            </button>
                        </div>
                    </div>

                    <div id="changeResultCompact" style="display: none; margin-bottom: 15px;">
                        <div style="background: #f8f9fa; border-radius: 6px; padding: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="font-size: 13px; color: #666;">Сдача:</div>
                                <div id="changeAmountCompact" style="font-size: 18px; font-weight: bold; color: #28a745;">0 ₽</div>
                            </div>
                            <div id="changeBreakdownCompact" style="font-size: 11px; color: #666;"></div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px;">
                        <button id="cancelCashModal"
                                style="flex: 1; padding: 12px; background: #f8f9fa; color: #333; border: 1px solid #dee2e6; border-radius: 6px; cursor: pointer; font-weight: 500;">
                            Отмена
                        </button>
                        <button id="confirmCashCompact"
                                style="flex: 1; padding: 12px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                            Готово
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const cashInput = document.getElementById('cashAmountCompact');
        const closeBtn = document.getElementById('closeCashModal');
        const cancelBtn = document.getElementById('cancelCashModal');
        const confirmBtn = document.getElementById('confirmCashCompact');
        const addBtns = modal.querySelectorAll('.cash-add-btn');

        if (cashInput) {
            cashInput.min = totalAmount;
            this.calculateChangeCompact(totalAmount);
            cashInput.addEventListener('input', () => this.calculateChangeCompact(totalAmount));
        }

        if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());
        if (cancelBtn) cancelBtn.addEventListener('click', () => modal.remove());
        if (confirmBtn) confirmBtn.addEventListener('click', () => {
            this.confirmCashPaymentCompact(totalAmount);
            modal.remove();
        });

        addBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const amount = parseInt(e.target.dataset.amount) || 100;
                this.adjustCashAmountCompact(amount);
            });
        });
    }

    adjustCashAmountCompact(amount) {
        const cashInput = document.getElementById('cashAmountCompact');
        if (!cashInput) return;

        let currentValue = parseInt(cashInput.value) || 0;
        let newValue = currentValue + amount;

        const minAmount = parseFloat(cashInput.min) || 0;
        if (newValue < minAmount) newValue = minAmount;

        cashInput.value = newValue;
        this.calculateChangeCompact(minAmount);
    }

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
            confirmBtn.innerHTML = `Минимум ${this.formatPrice(totalAmount)} ₽`;
        }
    }

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
        let html = '<div class="breakdown-grid">';

        for (const denom of denominations) {
            if (remaining >= denom.value) {
                const count = Math.floor(remaining / denom.value);
                remaining = remaining % denom.value;

                if (count > 0) {
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

        if (remaining > 0) {
            html += `<div class="small-change">Мелкая сдача: ${remaining} коп.</div>`;
        }

        return html;
    }

    confirmCashPaymentCompact(totalAmount) {
        const cashInput = document.getElementById('cashAmountCompact');
        const changeElement = document.getElementById('changeAmountCompact');

        if (!cashInput || !changeElement) return;

        const cashAmount = parseFloat(cashInput.value);
        const change = parseFloat(changeElement.textContent.replace(' ₽', '').replace(/\s/g, '')) || 0;

        this.cashPaymentInfo = {
            total: totalAmount,
            received: cashAmount,
            change: change,
            payment_method: 'cash',
            timestamp: new Date().toISOString()
        };

        this.deliveryData.cash_payment = this.cashPaymentInfo;
        this.deliveryData.payment_method = 'cash';

        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();

        this.confirmOrder();
    }

    // ========== СОЗДАНИЕ ЗАКАЗА ==========

    async createOrder(orderData) {
        if (this.userId && this.userId !== 0) {
            localStorage.setItem('telegram_user_id', this.userId);
            localStorage.setItem('telegram_username', this.username || 'Пользователь');
        } else {
            const savedId = localStorage.getItem('telegram_user_id');
            const savedUsername = localStorage.getItem('telegram_username');
            if (savedId && savedId !== '0') {
                this.userId = parseInt(savedId);
                this.username = savedUsername || 'Пользователь';
            }
        }

        if (orderData.total && typeof orderData.total === 'string') {
            orderData.total = parseFloat(orderData.total);
        }

        orderData.user_id = parseInt(this.userId) || 0;
        orderData.username = this.username || 'Гость';

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

    async confirmOrder() {
        try {
            console.log('🔍 Начинаем оформление заказа...');

            // Рассчитываем суммы ПРАВИЛЬНО
            const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const discountedSubtotal = this.cart.reduce((sum, item) => {
                const priceToShow = item.discounted_price || item.price;
                return sum + (priceToShow * item.quantity);
            }, 0);
            const itemsDiscount = subtotal - discountedSubtotal;

            let promoDiscount = 0;
            let promoCodeApplied = false;

            if (this.appliedPromoCode) {
                promoDiscount = this.calculatePromoDiscount(discountedSubtotal, this.appliedPromoCode);
                promoCodeApplied = true;
                console.log(`🎟️ Промокод "${this.appliedPromoCode.code}": ${promoDiscount} руб, тип: ${this.appliedPromoCode.discount_type}`);
            }

            let deliveryCost = 0;
            const hasFreeDeliveryPromo = this.appliedPromoCode?.discount_type === 'free_delivery';

            if (!hasFreeDeliveryPromo && this.deliveryData.type === 'courier' && discountedSubtotal < 1000) {
                deliveryCost = 100;
            }

            const totalWithDelivery = discountedSubtotal + deliveryCost - promoDiscount;

            // ПРАВИЛЬНО подготавливаем items для сохранения
            const orderItems = this.cart.map(item => ({
                id: item.original_product_id || item.id,
                name: item.name,
                original_price: item.price,
                price: item.discounted_price || item.price,
                quantity: item.quantity,
                weight: item.weight || null,
                is_weight: item.is_weight || false,
                discount_info: item.discount_info || null
            }));

            // Подготавливаем delivery_details для сохранения
            let deliveryDetails = null;
            if (this.deliveryData.type === 'courier' && this.deliveryData.address_details) {
                deliveryDetails = {
                    city: this.deliveryData.address_details.city || '',
                    street: this.deliveryData.address_details.street || '',
                    house: this.deliveryData.address_details.house || '',
                    apartment: this.deliveryData.address_details.apartment || '',
                    floor: this.deliveryData.address_details.floor || '',
                    doorcode: this.deliveryData.address_details.doorcode || ''
                };
            }

            const orderData = {
                user_id: parseInt(this.userId) || 0,
                username: this.username || 'Гость',
                items: orderItems,
                subtotal: subtotal,
                items_discount: itemsDiscount,
                discounted_subtotal: discountedSubtotal,
                delivery_type: this.deliveryData.type,
                delivery_address: deliveryDetails ? JSON.stringify(deliveryDetails) : null,
                delivery_cost: deliveryCost,
                pickup_point: this.deliveryData.pickup_point,
                payment_method: this.deliveryData.payment_method || 'cash',
                recipient_name: this.deliveryData.address_details?.recipient_name || this.username || 'Покупатель',
                phone_number: this.deliveryData.address_details?.phone || '',
                cash_payment: this.deliveryData.cash_payment || null,
                promo_code: this.appliedPromoCode?.code || null,
                promo_code_id: this.appliedPromoCode?.id || null,
                promo_discount: promoDiscount,
                total: totalWithDelivery
            };

            console.log('📤 Отправка заказа на сервер:', orderData);

            const result = await this.createOrder(orderData);

            if (result.success) {
                // СБРАСЫВАЕМ ПРОМОКОД ПОСЛЕ ОФОРМЛЕНИЯ
                this.appliedPromoCode = null;
                localStorage.removeItem('applied_promo_code');
                // Показываем правильную сумму в подтверждении
                this.showOrderConfirmation(
                    result.order_id,
                    subtotal,
                    itemsDiscount,
                    deliveryCost,
                    promoDiscount,
                    totalWithDelivery
                );

                this.cart = [];
                this.saveCart();
                this.updateCartCount();
                this.deliveryData = {
                    type: null,
                    address_id: null,
                    pickup_point: null,
                    address_details: null
                };
            } else {
                throw new Error(result.error || 'Неизвестная ошибка сервера');
            }
                localStorage.removeItem('applied_promo_code');

        } catch (error) {
            console.error('❌ Ошибка оформления заказа:', error);
            this.showNotification(`❌ Ошибка: ${error.message}`, 'error');
            this.showPaymentSelection();
        }
    }


    async notifyBotAboutOrder(orderId, status) {
        try {
            const response = await fetch('/api/notify-bot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: orderId,
                    status: status,
                    user_id: this.userId
                })
            });

            const result = await response.json();
            if (result.success) {
                console.log(`📢 Уведомление для заказа #${orderId} отправлено в бот`);
            } else {
                console.warn(`⚠️ Ошибка отправки уведомления: ${result.error}`);
            }
            return result.success;
        } catch (error) {
            console.error('❌ Ошибка связи с ботом:', error);
            return false;
        }
    }

    showOrderConfirmation(orderId, subtotal = 0, itemsDiscount = 0, deliveryCost = 0, promoDiscount = 0, totalWithDelivery = 0) {
        const cartOverlay = document.getElementById('cartOverlay');
        if (!cartOverlay) return;

        const deliveryText = this.deliveryData.type === 'courier' ? 'Доставка курьером' : 'Самовывоз';
        const paymentMethods = {
            'cash': 'Наличные',
            'transfer': 'Перевод по номеру СБП',
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
                        <div class="price-breakdown">
                            <p><strong>Товары:</strong> ${this.formatPrice(subtotal)} ₽</p>
                            ${itemsDiscount > 0 ? `<p><strong>Скидка на товары:</strong> -${this.formatPrice(itemsDiscount)} ₽</p>` : ''}
                            ${deliveryCost > 0 ? `<p><strong>Доставка:</strong> ${this.formatPrice(deliveryCost)} ₽</p>` : ''}
                            ${deliveryCost === 0 && this.deliveryData.type === 'courier' ? `<p><strong>Доставка:</strong> Бесплатно 🎉</p>` : ''}
                            ${promoDiscount > 0 ? `<p><strong>Скидка по промокоду:</strong> -${this.formatPrice(promoDiscount)} ₽</p>` : ''}
                            <p><strong>Итого к оплате:</strong> <span style="font-size: 18px; font-weight: bold;">${this.formatPrice(totalWithDelivery)} ₽</span></p>
                        </div>
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

    // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

    showErrorOverlay(message) {
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
            <h2 style="color: #2c3e50; margin-bottom: 10px;">${message}</h2>
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
}

// ========== ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА НА КЛИЕНТСКОЙ СТОРОНЕ ==========

    // 1. Защита от повторной отправки форм
    function setupFormProtection() {
        const forms = document.querySelectorAll('form, button[type="submit"], .btn-primary');
        forms.forEach(form => {
            form.addEventListener('click', function(e) {
                const btn = e.target.closest('button');
                if (btn && (btn.type === 'submit' || btn.classList.contains('btn-primary'))) {
                    // Блокируем повторные нажатия на 3 секунды
                    if (btn.dataset.processing === 'true') {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }

                    btn.dataset.processing = 'true';
                    btn.disabled = true;

                    // Восстанавливаем через 3 секунды
                    setTimeout(() => {
                        btn.dataset.processing = 'false';
                        btn.disabled = false;
                    }, 3000);
                }
            });
        });
    }

    // 2. Защита от XSS в отображаемых данных
    function sanitizeHTML(text) {
        if (!text) return '';

        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 3. Безопасное обновление контента
    TelegramShop.prototype.safeUpdateHTML = function(elementId, content) {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Используем textContent вместо innerHTML где возможно
        if (content && typeof content === 'string' && !content.includes('<')) {
            element.textContent = content;
        } else {
            // Для HTML контента используем sanitize
            element.innerHTML = sanitizeHTML(content);
        }
    };

    // 4. Защита localStorage
    TelegramShop.prototype.secureStorage = {
        set: function(key, value) {
            try {
                const encrypted = btoa(encodeURIComponent(JSON.stringify(value)));
                localStorage.setItem(key, encrypted);
                return true;
            } catch (e) {
                console.error('Storage error:', e);
                return false;
            }
        },

        get: function(key) {
            try {
                const encrypted = localStorage.getItem(key);
                if (!encrypted) return null;

                const decrypted = JSON.parse(decodeURIComponent(atob(encrypted)));
                return decrypted;
            } catch (e) {
                console.error('Storage read error:', e);
                return null;
            }
        },

        remove: function(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (e) {
                console.error('Storage remove error:', e);
                return false;
            }
        }
    };

    // 5. Проверка целостности данных
    TelegramShop.prototype.validateCartData = function(cart) {
        if (!Array.isArray(cart)) return false;

        return cart.every(item => {
            return typeof item === 'object' &&
                   'id' in item &&
                   'name' in item &&
                   'price' in item &&
                   'quantity' in item &&
                   Number.isFinite(item.price) &&
                   Number.isInteger(item.quantity) &&
                   item.quantity > 0 &&
                   item.quantity <= 100; // Максимум 100 штук одного товара
        });
    };

    // 6. Обработка ошибок сети
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        return originalFetch(url, options)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response;
            })
            .catch(error => {
                console.error('Network error:', error);

                // Показываем пользователю понятное сообщение
                if (window.shop && window.shop.showNotification) {
                    if (error.message.includes('Failed to fetch')) {
                        window.shop.showNotification('❌ Ошибка соединения с сервером', 'error');
                    } else if (error.message.includes('429')) {
                        window.shop.showNotification('⚠️ Слишком много запросов. Подождите немного.', 'warning');
                    } else if (error.message.includes('403')) {
                        window.shop.showNotification('⛔ Доступ запрещен', 'error');
                    }
                }

                throw error;
            });
    };

    // 7. Инициализация защиты при загрузке
    document.addEventListener('DOMContentLoaded', function() {
        // Запускаем защиту от повторной отправки
        setTimeout(setupFormProtection, 1000);

        // Защита от копирования важных данных (опционально)
        document.addEventListener('copy', function(e) {
            if (window.getSelection().toString().includes('token') ||
                window.getSelection().toString().includes('password')) {
                e.preventDefault();
                if (window.shop && window.shop.showNotification) {
                    window.shop.showNotification('⚠️ Копирование защищенных данных запрещено', 'warning');
                }
            }
        });

        // Логирование важных действий (только в dev режиме)
        if (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1')) {
            console.log('%c🔒 Режим безопасности активен', 'color: #4CAF50; font-weight: bold;');
        }
    });

    // 8. Дополнительные проверки для телеграм веб-апп
    if (window.Telegram && Telegram.WebApp) {
        Telegram.WebApp.onEvent('viewportChanged', function(e) {
            // Защита от изменения размера окна (может быть признаком атаки)
            if (e.height < 100 || e.width < 100) {
                console.warn('Подозрительное изменение размера окна');
            }
        });

        // Проверка данных инициализации
        if (!Telegram.WebApp.initData || Telegram.WebApp.initData.length < 10) {
            console.warn('Недостаточно данных инициализации Telegram WebApp');
        }
    }



let shopInstance = null;
const styleSheet = document.createElement('style');
document.head.appendChild(styleSheet);
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📋 DOM загружен, запускаем магазин...');

    try {
        shopInstance = new TelegramShop();
        window.shop = shopInstance;

        await shopInstance.init();

        console.log('🚀 Telegram Shop готов к работе!');

        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
            const user = Telegram.WebApp.initDataUnsafe.user;
            console.log(`👤 Пользователь Telegram: ${user.first_name} (ID: ${user.id})`);
            console.log('📱 Пользователь будет получать уведомления о статусе заказа в боте');
        }

    } catch (error) {
        console.error('❌ Ошибка инициализации магазина:', error);
        shopInstance?.showErrorOverlay('Ошибка загрузки магазина');
    }
});

window.TelegramShop = TelegramShop;
console.log('✅ app.js полностью загружен и готов к работе');