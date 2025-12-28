// Telegram Shop Web App - Исправленная версия

class TelegramShop {
    constructor() {
        this.cart = this.loadCart();
        this.currentProduct = null;
        this.products = [];
        this.categories = [];

        this.init();
    }

    init() {
        this.addStyles();
        this.bindEvents();
        this.loadProducts();
        this.loadCategories();
        this.updateCartCount();

        // Telegram Web App интеграция
        if (window.Telegram && Telegram.WebApp) {
            this.initTelegramWebApp();
        }

        console.log('✅ Магазин инициализирован');
    }

    bindEvents() {
        // Корзина
        document.getElementById('cartBtn')?.addEventListener('click', () => this.toggleCart());
        document.getElementById('closeCart')?.addEventListener('click', () => this.closeCart());
        document.getElementById('clearCart')?.addEventListener('click', () => this.clearCart());
        document.getElementById('checkoutBtn')?.addEventListener('click', () => this.checkout());

        // Кнопки закрытия
        document.getElementById('closeProductModal')?.addEventListener('click', () => this.closeProductModal());

        // Кнопки +/-
        document.getElementById('qtyMinus')?.addEventListener('click', () => this.changeQuantity(-1));
        document.getElementById('qtyPlus')?.addEventListener('click', () => this.changeQuantity(1));
        document.getElementById('addToCartModal')?.addEventListener('click', () => this.addToCartFromModal());

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

        // Категории (делегирование событий)
        document.getElementById('categories')?.addEventListener('click', (e) => {
            const categoryBtn = e.target.closest('.category-btn');
            if (categoryBtn) {
                this.filterByCategory(e);
            }
        });
    }

    // ========== TELEGRAM WEB APP ==========
    initTelegramWebApp() {
        const webApp = window.Telegram.WebApp;

        // Расширяем на весь экран
        webApp.expand();

        // Настраиваем цвета
        webApp.setHeaderColor('#667eea');
        webApp.setBackgroundColor('#f5f7fa');

        // Включаем подтверждение закрытия
        webApp.enableClosingConfirmation();

        // Обработчик кнопки "Назад"
        webApp.BackButton.onClick(() => {
            if (this.isCartOpen()) {
                this.closeCart();
            } else if (this.isProductModalOpen()) {
                this.closeProductModal();
            } else {
                webApp.close();
            }
        });

        // Обновляем кнопку "Назад"
        this.updateBackButton();

        console.log('✅ Telegram Web App инициализирован');
        if (webApp.initDataUnsafe?.user) {
            console.log('👤 Пользователь:', webApp.initDataUnsafe.user);
        }
    }

    updateBackButton() {
        if (window.Telegram?.WebApp) {
            if (this.isCartOpen() || this.isProductModalOpen()) {
                Telegram.WebApp.BackButton.show();
            } else {
                Telegram.WebApp.BackButton.hide();
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

    // ========== ПРОДУКТЫ ==========
    async loadProducts(category = 'all') {
        try {
            console.log('📥 Загрузка товаров, категория:', category);

            const loading = document.getElementById('loading');
            if (loading) loading.classList.add('active');

            const url = category !== 'all'
                ? `/api/products?category=${encodeURIComponent(category)}`
                : '/api/products';

            console.log('📡 Запрос к:', url);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.products = await response.json();
            console.log(`✅ Получено товаров: ${this.products.length}`);

            this.renderProducts();

        } catch (error) {
            console.error('❌ Ошибка загрузки товаров:', error);
            this.showNotification('❌ Ошибка загрузки товаров', 'error');
            this.products = [];
            this.renderProducts();
        } finally {
            const loading = document.getElementById('loading');
            if (loading) loading.classList.remove('active');
        }
    }

    async loadCategories() {
        try {
            console.log('📂 Загрузка категорий...');
            const response = await fetch('/api/categories');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.categories = await response.json();
            console.log(`✅ Получено категорий: ${this.categories.length}`);

            this.renderCategories();
        } catch (error) {
            console.error('❌ Ошибка загрузки категорий:', error);
            this.categories = [];
        }
    }

    renderProducts() {
        const productsGrid = document.getElementById('products');
        if (!productsGrid) {
            console.error('❌ Элемент #products не найден');
            return;
        }

        productsGrid.innerHTML = '';

        if (this.products.length === 0) {
            productsGrid.innerHTML = `
                <div class="no-products" style="grid-column: 1 / -1; text-align: center; padding: 50px;">
                    <i class="fas fa-box-open" style="font-size: 60px; color: #ddd; margin-bottom: 20px;"></i>
                    <h3 style="color: #666; margin-bottom: 10px;">Товары не найдены</h3>
                    <p style="color: #888;">Попробуйте выбрать другую категорию</p>
                </div>
            `;
            return;
        }

        this.products.forEach(product => {
            const productCard = document.createElement('div');
            productCard.className = 'product-card';
            productCard.innerHTML = `
                <img src="${product.image_url || 'https://via.placeholder.com/300x200'}"
                     alt="${product.name}"
                     class="product-image"
                     onerror="this.src='https://via.placeholder.com/300x200'">
                <div class="product-info">
                    <h3 class="product-title">${product.name}</h3>
                    <p class="product-description">
                        ${product.description?.substring(0, 80) || 'Описание отсутствует'}
                        ${product.description?.length > 80 ? '...' : ''}
                    </p>
                    <div class="product-price">${this.formatPrice(product.price)} ₽</div>
                    <div class="product-stock">
                        <i class="fas fa-box"></i>
                        В наличии: ${product.stock} шт.
                    </div>
                    <button class="btn btn-primary btn-block" onclick="shop.viewProduct(${product.id})">
                        <i class="fas fa-eye"></i> Подробнее
                    </button>
                </div>
            `;

            productsGrid.appendChild(productCard);
        });
    }

    renderCategories() {
        const categoriesContainer = document.getElementById('categories');
        if (!categoriesContainer) {
            console.error('❌ Элемент #categories не найден');
            return;
        }

        // Очищаем все кроме кнопки "Все товары"
        const allButton = categoriesContainer.querySelector('.category-btn[data-category="all"]');
        categoriesContainer.innerHTML = '';

        if (allButton) {
            allButton.classList.add('active');
            categoriesContainer.appendChild(allButton);
        }

        // Добавляем категории
        this.categories.forEach(category => {
            const button = document.createElement('button');
            button.className = 'category-btn';
            button.dataset.category = category;
            button.innerHTML = `<i class="fas fa-tag"></i> ${category}`;
            categoriesContainer.appendChild(button);
        });
    }

    filterByCategory(e) {
        const categoryBtn = e.target.closest('.category-btn');
        if (!categoryBtn) return;

        const category = categoryBtn.dataset.category;

        // Обновляем активную кнопку
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        categoryBtn.classList.add('active');

        // Загружаем товары выбранной категории
        this.loadProducts(category);
    }

    viewProduct(productId) {
        console.log('👁️ Просмотр товара #' + productId);

        const product = this.products.find(p => p.id === productId);
        if (!product) {
            console.error('❌ Товар не найден:', productId);
            this.showNotification('❌ Товар не найден', 'error');
            return;
        }

        this.currentProduct = product;
        this.openProductModal(product);
    }

    // ========== МОДАЛЬНОЕ ОКНО ТОВАРА ==========
    openProductModal(product) {
        const modalImage = document.getElementById('modalImage');
        const modalTitle = document.getElementById('modalTitle');
        const modalDescription = document.getElementById('modalDescription');
        const modalPrice = document.getElementById('modalPrice');
        const modalStock = document.getElementById('modalStock');
        const quantityInput = document.getElementById('quantity');

        if (modalImage) {
            modalImage.src = product.image_url || 'https://via.placeholder.com/300x200';
            modalImage.onerror = function() {
                this.src = 'https://via.placeholder.com/300x200';
            };
        }

        if (modalTitle) modalTitle.textContent = product.name;
        if (modalDescription) modalDescription.textContent = product.description || 'Описание отсутствует';
        if (modalPrice) modalPrice.textContent = this.formatPrice(product.price);
        if (modalStock) modalStock.textContent = product.stock;
        if (quantityInput) quantityInput.value = 1;

        const modal = document.getElementById('productModal');
        if (modal) {
            modal.style.display = 'flex';
        }

        this.updateBackButton();
    }

    closeProductModal() {
        const modal = document.getElementById('productModal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.currentProduct = null;
        this.updateBackButton();
    }

    changeQuantity(delta) {
        const input = document.getElementById('quantity');
        if (!input) return;

        const currentValue = parseInt(input.value) || 1;
        const newValue = currentValue + delta;

        if (newValue >= 1 && newValue <= 100) {
            input.value = newValue;
        }
    }

    addToCartFromModal() {
        if (!this.currentProduct) {
            this.showNotification('❌ Товар не выбран', 'error');
            return;
        }

        const quantityInput = document.getElementById('quantity');
        const quantity = quantityInput ? parseInt(quantityInput.value) || 1 : 1;

        if (quantity > this.currentProduct.stock) {
            this.showNotification('❌ Недостаточно товара на складе', 'error');
            return;
        }

        this.addToCart(
            this.currentProduct.id,
            this.currentProduct.name,
            this.currentProduct.price,
            quantity,
            this.currentProduct.image_url
        );

        this.closeProductModal();
    }

    // ========== КОРЗИНА ==========
    addToCart(productId, name, price, quantity = 1, image = null) {
        // Проверяем, есть ли уже такой товар в корзине
        const existingIndex = this.cart.findIndex(item => item.id === productId);

        if (existingIndex !== -1) {
            // Увеличиваем количество существующего товара
            this.cart[existingIndex].quantity += quantity;
        } else {
            // Добавляем новый товар
            this.cart.push({
                id: productId,
                name: name,
                price: price,
                quantity: quantity,
                image: image || 'https://via.placeholder.com/100'
            });
        }

        this.saveCart();
        this.updateCartDisplay();
        this.updateCartCount();

        this.showNotification(`✅ ${name} добавлен в корзину!`);
    }

    removeFromCart(productId) {
        this.cart = this.cart.filter(item => item.id !== productId);
        this.saveCart();
        this.updateCartDisplay();
        this.updateCartCount();
        this.showNotification('🗑️ Товар удален из корзины');
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
        if (this.cart.length === 0) return;

        if (confirm('Вы уверены, что хотите очистить корзину?')) {
            this.cart = [];
            this.saveCart();
            this.updateCartDisplay();
            this.updateCartCount();
            this.showNotification('🗑️ Корзина очищена');
        }
    }

    saveCart() {
        try {
            localStorage.setItem('cart', JSON.stringify(this.cart));
        } catch (error) {
            console.error('❌ Ошибка сохранения корзины:', error);
        }
    }

    loadCart() {
        try {
            const cartData = localStorage.getItem('cart');
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
            cartTotal.textContent = '0';
            return;
        }

        emptyCart.style.display = 'none';

        cartItems.innerHTML = this.cart.map(item => `
            <div class="cart-item">
                <img src="${item.image || 'https://via.placeholder.com/100'}"
                     alt="${item.name}"
                     class="cart-item-image"
                     onerror="this.src='https://via.placeholder.com/100'">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-price">${this.formatPrice(item.price)} ₽ × ${item.quantity}</div>
                    <div class="quantity-controls">
                        <button onclick="shop.updateCartItemQuantity(${item.id}, ${item.quantity - 1})"
                                ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
                        <span>${item.quantity}</span>
                        <button onclick="shop.updateCartItemQuantity(${item.id}, ${item.quantity + 1})">+</button>
                    </div>
                </div>
                <button class="remove-item" onclick="shop.removeFromCart(${item.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');

        const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotal.textContent = this.formatPrice(total);
    }

    toggleCart() {
        this.updateCartDisplay();
        const cartOverlay = document.getElementById('cartOverlay');
        if (cartOverlay) {
            cartOverlay.style.display = 'flex';
        }
        this.updateBackButton();
    }

    closeCart() {
        const cartOverlay = document.getElementById('cartOverlay');
        if (cartOverlay) {
            cartOverlay.style.display = 'none';
        }
        this.updateBackButton();
    }

    // ========== ОФОРМЛЕНИЕ ЗАКАЗА ==========
    async checkout() {
        if (this.cart.length === 0) {
            this.showNotification('❌ Корзина пуста!', 'error');
            return;
        }

        try {
            let userData = {
                user_id: 0,
                username: 'Гость'
            };

            // Получаем данные пользователя из Telegram
            if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
                const user = Telegram.WebApp.initDataUnsafe.user;
                userData.user_id = user.id;
                userData.username = user.username || `${user.first_name} ${user.last_name || ''}`.trim();
            }

            const orderData = {
                ...userData,
                items: this.cart,
                total: this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
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
                this.showNotification(`✅ Заказ успешно оформлен! Номер: #${result.order_id}`, 'success');

                // Очищаем корзину
                this.cart = [];
                this.saveCart();
                this.updateCartDisplay();
                this.updateCartCount();
                this.closeCart();

                // Показываем уведомление в Telegram
                if (window.Telegram?.WebApp) {
                    Telegram.WebApp.showAlert(`✅ Заказ успешно оформлен!\nНомер заказа: #${result.order_id}`);
                }
            } else {
                this.showNotification('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка оформления заказа:', error);
            this.showNotification('❌ Ошибка оформления заказа', 'error');
        }
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(price || 0);
    }

    showNotification(message, type = 'success') {
        console.log(`💬 Уведомление [${type}]:`, message);

        const notifications = document.getElementById('notifications');
        if (!notifications) {
            // Создаем контейнер если его нет
            const container = document.createElement('div');
            container.id = 'notifications';
            container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 3000;
            `;
            document.body.appendChild(notifications || container);
        }

        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;

        const colors = {
            'success': '#51cf66',
            'error': '#ff4757',
            'info': '#3498db',
            'warning': '#ff922b'
        };

        notification.style.cssText = `
            background: ${colors[type] || colors.success};
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            margin-top: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease;
            max-width: 300px;
            word-break: break-word;
        `;

        const target = document.getElementById('notifications') || notifications;
        target.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // ========== СТИЛИ ДЛЯ АНИМАЦИЙ ==========
    addStyles() {
        if (document.getElementById('shop-styles')) return;

        const style = document.createElement('style');
        style.id = 'shop-styles';
        style.textContent = `
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

            .quantity-controls {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-top: 8px;
            }

            .quantity-controls button {
                width: 30px;
                height: 30px;
                border: 1px solid #ddd;
                background: white;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .quantity-controls button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .quantity-controls span {
                min-width: 30px;
                text-align: center;
                font-weight: 600;
            }

            .no-products {
                grid-column: 1 / -1;
                text-align: center;
                padding: 50px;
                color: #666;
            }

            .loading {
                display: none;
                text-align: center;
                padding: 50px;
                color: #666;
                font-size: 18px;
            }

            .loading.active {
                display: block;
            }

            .cart-count {
                position: absolute;
                top: -5px;
                right: -5px;
                background: #ff4757;
                color: white;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
            }
        `;

        document.head.appendChild(style);
    }
}

// Инициализация магазина
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Инициализация Telegram Shop...');

    // Создаем глобальный экземпляр магазина
    window.shop = new TelegramShop();

    console.log('✅ Telegram Shop готов к работе!');
});

// Обработка ошибок изображений
document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') {
        // Для всех изображений магазина
        if (e.target.classList.contains('product-image') ||
            e.target.classList.contains('cart-item-image') ||
            e.target.classList.contains('product-modal-image')) {
            e.target.src = 'https://via.placeholder.com/300x200';
        }
    }
}, true);