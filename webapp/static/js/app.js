// Telegram Shop Web App - Основной JS файл

class TelegramShop {

    closeCart() {
    document.getElementById('cartOverlay').style.display = 'none';
    this.updateBackButton();
    }

    closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
    this.currentProduct = null;
    this.updateBackButton();
    }

    updateBackButton() {
    if (window.Telegram?.WebApp) {
        const cartOpen = document.getElementById('cartOverlay').style.display === 'flex';
        const modalOpen = document.getElementById('productModal').style.display === 'flex';

        if (cartOpen || modalOpen) {
            Telegram.WebApp.BackButton.show();
        } else {
            Telegram.WebApp.BackButton.hide();
            }
        }
    }

    constructor() {
        this.cart = this.loadCart();
        this.currentProduct = null;
        this.products = [];
        this.categories = [];

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadProducts();
        this.loadCategories();
        this.updateCartCount();

        // Telegram Web App интеграция
        if (window.Telegram && Telegram.WebApp) {
            this.initTelegramWebApp();
        }
    }

    bindEvents() {
         // Кнопки закрытия
        document.getElementById('closeCart')?.addEventListener('click', () => this.closeCart());
        document.getElementById('closeProductModal')?.addEventListener('click', () => this.closeProductModal());

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

        // Telegram BackButton
        if (window.Telegram?.WebApp) {
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

    isCartOpen() {
        return document.getElementById('cartOverlay')?.style.display === 'flex';
        }

    isProductModalOpen() {
        return document.getElementById('productModal')?.style.display === 'flex';
        }
              // Корзина
        document.getElementById('cartBtn')?.addEventListener('click', () => this.toggleCart());
        document.getElementById('closeCart')?.addEventListener('click', () => this.closeCart());
        document.getElementById('clearCart')?.addEventListener('click', () => this.clearCart());
        document.getElementById('checkoutBtn')?.addEventListener('click', () => this.checkout());

        // Закрытие модальных окон
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('cart-overlay')) this.closeCart();
            if (e.target.classList.contains('product-modal-overlay')) this.closeProductModal();
        });

        // Кнопки +/-
        document.getElementById('qtyMinus')?.addEventListener('click', () => this.changeQuantity(-1));
        document.getElementById('qtyPlus')?.addEventListener('click', () => this.changeQuantity(1));
        document.getElementById('addToCartModal')?.addEventListener('click', () => this.addToCartFromModal());

        // Категории
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterByCategory(e));
        });

        // Обработка нажатия Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeCart();
                this.closeProductModal();
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
            if (this.isCartOpen() || this.isProductModalOpen()) {
                this.closeCart();
                this.closeProductModal();
            } else {
                webApp.close();
            }
        });

        // Обновляем кнопку "Назад" в зависимости от состояния
        this.updateBackButton();

        console.log('✅ Telegram Web App инициализирован');
        console.log('User:', webApp.initDataUnsafe.user);
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
        return document.getElementById('cartOverlay')?.style.display === 'flex';
    }

    isProductModalOpen() {
        return document.getElementById('productModal')?.style.display === 'flex';
    }

    // ========== ПРОДУКТЫ ==========
    async loadProducts(category = 'all') {
        try {
            document.getElementById('loading')?.classList.add('active');

            const url = category !== 'all'
                ? `/api/products?category=${category}`
                : '/api/products';

            const response = await fetch(url);
            this.products = await response.json();

            this.renderProducts();
        } catch (error) {
            console.error('Ошибка загрузки товаров:', error);
            this.showNotification('❌ Ошибка загрузки товаров', 'error');
        } finally {
            document.getElementById('loading')?.classList.remove('active');
        }
    }

    async loadCategories() {
        try {
            const response = await fetch('/api/categories');
            this.categories = await response.json();

            this.renderCategories();
        } catch (error) {
            console.error('Ошибка загрузки категорий:', error);
        }
    }

    renderProducts() {
        const productsGrid = document.getElementById('products');
        if (!productsGrid) return;

        productsGrid.innerHTML = '';

        if (this.products.length === 0) {
            productsGrid.innerHTML = `
                <div class="no-products" style="grid-column: 1 / -1; text-align: center; padding: 50px;">
                    <i class="fas fa-box-open" style="font-size: 60px; color: #ddd; margin-bottom: 20px;"></i>
                    <h3>Товары не найдены</h3>
                    <p>Попробуйте выбрать другую категорию</p>
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
                    <p class="product-description">${product.description?.substring(0, 80) || 'Описание отсутствует'}${product.description?.length > 80 ? '...' : ''}</p>
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
        if (!categoriesContainer) return;

        // Очищаем все кроме первой кнопки "Все товары"
        const allButton = categoriesContainer.querySelector('.category-btn[data-category="all"]');
        categoriesContainer.innerHTML = '';
        if (allButton) categoriesContainer.appendChild(allButton);

        // Добавляем категории
        this.categories.forEach(category => {
            const button = document.createElement('button');
            button.className = 'category-btn';
            button.dataset.category = category;
            button.innerHTML = `
                <i class="fas fa-tag"></i> ${category}
            `;
            button.addEventListener('click', (e) => this.filterByCategory(e));
            categoriesContainer.appendChild(button);
        });
    }

    filterByCategory(e) {
        const category = e.currentTarget.dataset.category;

        // Обновляем активную кнопку
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.currentTarget.classList.add('active');

        // Загружаем товары выбранной категории
        this.loadProducts(category);
    }

    viewProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        this.currentProduct = product;
        this.openProductModal(product);
    }

    // ========== МОДАЛЬНОЕ ОКНО ТОВАРА ==========
    openProductModal(product) {
        document.getElementById('modalImage').src = product.image_url || 'https://via.placeholder.com/300x200';
        document.getElementById('modalImage').onerror = function() {
            this.src = 'https://via.placeholder.com/300x200';
        };
        document.getElementById('modalTitle').textContent = product.name;
        document.getElementById('modalDescription').textContent = product.description || 'Описание отсутствует';
        document.getElementById('modalPrice').textContent = this.formatPrice(product.price);
        document.getElementById('modalStock').textContent = product.stock;
        document.getElementById('quantity').value = 1;

        document.getElementById('productModal').style.display = 'flex';
        this.updateBackButton();
    }

    closeProductModal() {
        document.getElementById('productModal').style.display = 'none';
        this.currentProduct = null;
        this.updateBackButton();
    }

    changeQuantity(delta) {
        const input = document.getElementById('quantity');
        const currentValue = parseInt(input.value) || 1;
        const newValue = currentValue + delta;

        if (newValue >= 1 && newValue <= 100) {
            input.value = newValue;
        }
    }

    addToCartFromModal() {
        if (!this.currentProduct) return;

        const quantity = parseInt(document.getElementById('quantity').value) || 1;

        if (quantity > this.currentProduct.stock) {
            this.showNotification('❌ Недостаточно товара на складе', 'error');
            return;
        }

        this.addToCart(this.currentProduct.id, this.currentProduct.name, this.currentProduct.price, quantity);
        this.closeProductModal();
    }

    // ========== КОРЗИНА ==========
    addToCart(productId, name, price, quantity = 1) {
        const existingItem = this.cart.find(item => item.id === productId);

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.cart.push({
                id: productId,
                name: name,
                price: price,
                quantity: quantity,
                image: this.currentProduct?.image_url
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
        const item = this.cart.find(item => item.id === productId);
        if (item) {
            item.quantity = quantity;
            this.saveCart();
            this.updateCartDisplay();
            this.updateCartCount();
        }
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
        localStorage.setItem('cart', JSON.stringify(this.cart));
    }

    loadCart() {
        try {
            return JSON.parse(localStorage.getItem('cart')) || [];
        } catch {
            return [];
        }
    }

    updateCartCount() {
        const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        const cartCount = document.getElementById('cartCount');
        if (cartCount) cartCount.textContent = totalItems;
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
                        <button onclick="shop.updateCartItemQuantity(${item.id}, ${item.quantity - 1})" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
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

    updateCartItemQuantity(productId, quantity) {
        if (quantity < 1) {
            this.removeFromCart(productId);
        } else {
            this.updateCartItem(productId, quantity);
        }
    }

    toggleCart() {
        this.updateCartDisplay();
        document.getElementById('cartOverlay').style.display = 'flex';
        this.updateBackButton();
    }

    closeCart() {
        document.getElementById('cartOverlay').style.display = 'none';
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

            const response = await fetch('/api/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderData)
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('✅ Заказ успешно оформлен!', 'success');

                // Очищаем корзину
                this.cart = [];
                this.saveCart();
                this.updateCartDisplay();
                this.updateCartCount();
                this.closeCart();

                // Показываем уведомление в Telegram
                if (window.Telegram?.WebApp) {
                    Telegram.WebApp.showAlert('✅ Заказ успешно оформлен!\nНомер заказа: #' + result.order_id);

                    // Можно закрыть Web App после успешного заказа
                    // setTimeout(() => Telegram.WebApp.close(), 3000);
                }
            } else {
                this.showNotification('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('Ошибка оформления заказа:', error);
            this.showNotification('❌ Ошибка оформления заказа', 'error');
        }
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(price);
    }

    showNotification(message, type = 'success') {
        const notifications = document.getElementById('notifications');
        if (!notifications) return;

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'success' ? '#51cf66' : '#ff4757'};
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            z-index: 3000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            max-width: 300px;
            word-break: break-word;
        `;

        notifications.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // ========== СТИЛИ ДЛЯ АНИМАЦИЙ ==========
    addStyles() {
        const style = document.createElement('style');
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
            }

            .quantity-controls button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .quantity-controls span {
                min-width: 30px;
                text-align: center;
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
        `;
        document.head.appendChild(style);
    }
}

// Создаем глобальный экземпляр магазина
const shop = new TelegramShop();

// Делаем доступным глобально
window.shop = shop;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    shop.addStyles();
});

// Обработка ошибок изображений
document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('product-image')) {
        e.target.src = 'https://via.placeholder.com/300x200';
    }
}, true);