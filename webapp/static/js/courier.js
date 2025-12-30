// Курьерское приложение
class CourierApp {
    constructor() {
        this.currentCourier = null;
        this.currentOrderId = null;
        this.currentPhoto = null;

        this.init();
    }

    async init() {
        console.log('🚚 Инициализация курьерского приложения...');

        // Проверяем сохраненную сессию
        const savedCourier = localStorage.getItem('courier_session');
        if (savedCourier) {
            try {
                const session = JSON.parse(savedCourier);
                if (Date.now() < session.expires_at) {
                    this.currentCourier = session.courier;
                    this.showCourierInterface();
                    await this.loadOrders();
                } else {
                    localStorage.removeItem('courier_session');
                    this.showLogin();
                }
            } catch (e) {
                console.error('Ошибка восстановления сессии:', e);
                localStorage.removeItem('courier_session');
                this.showLogin();
            }
        } else {
            this.showLogin();
        }

        this.bindEvents();
    }

    // Показать экран авторизации
    showLogin() {
        const loginEl = document.getElementById('login-screen');
        const mainEl = document.getElementById('main-screen');

        if (loginEl) loginEl.style.display = 'block';
        if (mainEl) mainEl.style.display = 'none';
    }

    showCourierInterface() {
        const loginEl = document.getElementById('login-screen');
        const mainEl = document.getElementById('main-screen');

        if (loginEl) loginEl.style.display = 'none';
        if (mainEl) mainEl.style.display = 'block';

        // Обновляем данные курьера
        if (this.currentCourier) {
            const infoEl = document.getElementById('courier-info');
            if (infoEl) {
                infoEl.textContent = `${this.currentCourier.full_name} • ${this.currentCourier.phone}`;
            }
        }
    }

    // Назначение обработчиков событий
    bindEvents() {
        console.log('🔗 Назначаем обработчики событий...');

        // Вход через глобальную функцию login() из courier.html
        const loginForm = document.getElementById('login-screen');
        if (loginForm) {
            const loginBtn = loginForm.querySelector('.btn');
            if (loginBtn) {
                loginBtn.addEventListener('click', () => {
                    this.login();
                });
            }
        }

        // Выход через глобальную функцию logout()
        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }

        // Закрытие модальных окон
        document.addEventListener('click', (e) => {
            // Подробности заказа
            if (e.target.closest('.btn-details') || e.target.closest('.action-btn.details')) {
                const orderCard = e.target.closest('.order-card');
                if (orderCard) {
                    const orderId = this.extractOrderId(orderCard);
                    if (orderId) {
                        this.showOrderDetails(orderId);
                    }
                }
            }

            // Забрать заказ
            if (e.target.closest('.btn-pickup') || e.target.closest('.action-btn.pickup')) {
                const orderCard = e.target.closest('.order-card');
                if (orderCard) {
                    const orderId = this.extractOrderId(orderCard);
                    if (orderId) {
                        this.showPickupConfirmation(orderId);
                    }
                }
            }

            // Доставка
            if (e.target.closest('.btn-deliver') || e.target.closest('.action-btn.deliver')) {
                const orderCard = e.target.closest('.order-card');
                if (orderCard) {
                    const orderId = this.extractOrderId(orderCard);
                    if (orderId) {
                        this.showDeliveryModal(orderId);
                    }
                }
            }
        });

        // Работа с фото
        this.bindPhotoEvents();
    }

    extractOrderId(orderCard) {
        // Пробуем разные способы извлечения ID заказа
        if (orderCard.dataset.orderId) {
            return orderCard.dataset.orderId;
        }

        const orderIdEl = orderCard.querySelector('.order-id');
        if (orderIdEl) {
            const match = orderIdEl.textContent.match(/#(\d+)/);
            if (match) return match[1];
        }

        return null;
    }

    // Обработчики для работы с фото
    bindPhotoEvents() {
        // Используем делегирование для обработки фото
        document.addEventListener('change', (e) => {
            if (e.target.id === 'cameraInput' || e.target.id === 'galleryInput') {
                const file = e.target.files[0];
                if (file) {
                    this.handlePhotoSelection(file);
                }
            }
        });
    }

    // Авторизация
    async login() {
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');

        if (!usernameInput || !passwordInput) {
            console.error('Не найдены поля ввода');
            return;
        }

        const username = usernameInput.value;
        const password = passwordInput.value;

        if (!username || !password) {
            alert('❌ Введите логин и пароль');
            return;
        }

        try {
            const response = await fetch('/api/courier/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (result.success) {
                // Сохраняем сессию (24 часа)
                const session = {
                    courier: result.courier,
                    token: result.token,
                    expires_at: Date.now() + (24 * 60 * 60 * 1000)
                };

                localStorage.setItem('courier_session', JSON.stringify(session));
                this.currentCourier = result.courier;

                this.showCourierInterface();
                await this.loadOrders();

                console.log('✅ Успешный вход!');
            } else {
                throw new Error(result.error || 'Ошибка авторизации');
            }
        } catch (error) {
            console.error('Ошибка входа:', error);
            alert(`❌ ${error.message}`);
        }
    }

    // Выход
    logout() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            this.currentCourier = null;
            localStorage.removeItem('courier_session');
            this.showLogin();
            this.showNotification('👋 До свидания!', 'info');
        }
    }

    // Переключение разделов
    switchSection(section) {
        // Скрываем все разделы
        document.querySelectorAll('.content-section').forEach(el => {
            el.classList.remove('active');
        });

        // Показываем выбранный
        document.getElementById(section + 'Section').classList.add('active');

        // Загружаем данные если нужно
        if (section === 'today') {
            this.loadTodayOrders();
        } else if (section === 'history') {
            this.loadHistoryOrders();
        } else if (section === 'profile') {
            this.loadProfile();
        }
    }

    // Загрузка заказов
    async loadOrders() {
        if (!this.currentCourier) return;

        try {
            const response = await fetch(`/api/courier/orders?courier_id=${this.currentCourier.id}`);
            const result = await response.json();

            if (result.success) {
                this.displayActiveOrders(result.active_orders || []);
                this.displayTodayOrders(result.today_orders || []);
                this.displayHistoryOrders(result.completed_orders || []);
                this.updateStats(result);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Ошибка загрузки заказов:', error);
            this.showNotification('❌ Не удалось загрузить заказы', 'error');
        }
    }

    // Отображение активных заказов
    displayActiveOrders(orders) {
        const container = document.getElementById('active-orders-list');
        if (!container) return;

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="loader">Нет активных заказов</div>
            `;
            return;
        }

        let html = '';
        orders.forEach(order => {
            html += this.createOrderCard(order, false);
        });

        container.innerHTML = html;
    }

    // Загрузка заказов на сегодня
    async loadTodayOrders() {
        this.switchSection('today');
    }

    displayTodayOrders(orders) {
        const container = document.getElementById('todayOrdersGrid');
        if (!container) return;

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-day"></i>
                    <h3>Нет заказов на сегодня</h3>
                    <p>На сегодня доставок не запланировано</p>
                </div>
            `;
            return;
        }

        let html = '';
        orders.forEach(order => {
            html += this.createOrderCard(order, false);
        });

        container.innerHTML = html;
    }

    // Загрузка истории
    async loadHistoryOrders() {
        this.switchSection('history');
    }

    displayHistoryOrders(orders) {
        const container = document.getElementById('completed-orders-list');
        if (!container) return;

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="loader">Нет выполненных заказов</div>
            `;
            return;
        }

        let html = '';
        orders.forEach(order => {
            html += this.createOrderCard(order, true);
        });

        container.innerHTML = html;
    }

    // Создание карточки заказа
    createOrderCard(order, isCompleted = false) {
        // Получаем адрес
        let address = "Адрес не указан";
        let recipient = order.recipient_name || "Не указан";
        let phone = order.phone_number || "Телефон не указан";

        try {
            if (order.delivery_address_obj && typeof order.delivery_address_obj === 'object') {
                const addr = order.delivery_address_obj;
                const parts = [];
                if (addr.city) parts.push(addr.city);
                if (addr.street) parts.push(`ул. ${addr.street}`);
                if (addr.house) parts.push(`д. ${addr.house}`);
                if (addr.apartment) parts.push(`кв. ${addr.apartment}`);

                if (parts.length > 0) address = parts.join(', ');

                if (!order.recipient_name && addr.recipient_name) {
                    recipient = addr.recipient_name;
                }

                if (!order.phone_number && addr.phone) {
                    phone = addr.phone;
                }
            } else if (order.delivery_address && typeof order.delivery_address === 'string') {
                try {
                    const addr = JSON.parse(order.delivery_address);
                    if (typeof addr === 'object') {
                        const parts = [];
                        if (addr.city) parts.push(addr.city);
                        if (addr.street) parts.push(`ул. ${addr.street}`);
                        if (addr.house) parts.push(`д. ${addr.house}`);
                        if (addr.apartment) parts.push(`кв. ${addr.apartment}`);

                        if (parts.length > 0) address = parts.join(', ');

                        if (!order.recipient_name && addr.recipient_name) {
                            recipient = addr.recipient_name;
                        }

                        if (!order.phone_number && addr.phone) {
                            phone = addr.phone;
                        }
                    }
                } catch (e) {
                    address = order.delivery_address;
                }
            }
        } catch (e) {
            console.error('❌ Ошибка обработки адреса заказа #' + order.id, e);
        }

        // Сумма
        const total = order.total_price || order.sum || 0;

        // Дата доставки
        let deliveryDate = "Дата не указана";
        if (order.delivery_started) {
            deliveryDate = new Date(order.delivery_started).toLocaleDateString('ru-RU');
        } else if (order.assigned_at) {
            deliveryDate = new Date(order.assigned_at).toLocaleDateString('ru-RU');
        }

        // Кнопки действий
        let actionsHtml = '';
        if (!isCompleted) {
            const status = order.assignment_status || order.status;

            if (status === 'assigned') {
                actionsHtml = `
                    <div class="order-actions">
                        <button class="btn-action btn-pickup" onclick="updateOrderStatus(${order.id}, 'picked_up')">
                            🚚 Взять в доставку
                        </button>
                        <button class="btn-action btn-details" onclick="showOrderDetails(${order.id})">
                            📋 Детали
                        </button>
                    </div>
                `;
            } else if (status === 'picked_up') {
                actionsHtml = `
                    <div class="order-actions">
                        <button class="btn-action btn-deliver" onclick="showDeliveryForm(${order.id})">
                            ✅ Доставить
                        </button>
                        <button class="btn-action btn-details" onclick="showOrderDetails(${order.id})">
                            📋 Детали
                        </button>
                    </div>
                `;
            }
        } else {
            actionsHtml = `
                <div class="order-actions">
                    <button class="btn-action btn-details" onclick="showOrderDetails(${order.id})">
                        📋 Детали заказа
                    </button>
                    ${order.photo_proof ? `
                        <button class="btn-action" onclick="window.open('${order.photo_proof}', '_blank')">
                            📷 Фото
                        </button>
                    ` : ''}
                </div>
            `;
        }

        return `
            <div class="order-card ${isCompleted ? 'completed' : 'active'}" data-order-id="${order.id}">
                <div class="order-header">
                    <div class="order-id">Заказ #${order.id}</div>
                    <div class="order-status status-${order.assignment_status || order.status}">
                        ${this.getStatusText(order.assignment_status || order.status)}
                    </div>
                </div>

                <div class="order-info">
                    <div class="info-item">
                        <span class="info-label">Сумма:</span>
                        <span class="info-value">${total} ₽</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Получатель:</span>
                        <span class="info-value">${recipient}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Телефон:</span>
                        <span class="info-value">${phone}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Адрес:</span>
                        <span class="info-value" style="font-size: 12px;">${address}</span>
                    </div>
                </div>

                ${actionsHtml}
            </div>
        `;
    }

    // Обновление статистики
    updateStats(data) {
        const today = new Date().toISOString().split('T')[0];
        const todayDelivered = data.completed_orders?.filter(order => {
            const deliveredDate = order.delivered_at ? order.delivered_at.split('T')[0] : '';
            return deliveredDate === today;
        }).length || 0;

        const statToday = document.getElementById('stat-today');
        const statActive = document.getElementById('stat-active');
        const statCompleted = document.getElementById('stat-completed');

        if (statToday) statToday.textContent = data.today_orders?.length || 0;
        if (statActive) statActive.textContent = data.active_orders?.length || 0;
        if (statCompleted) statCompleted.textContent = data.completed_orders?.length || 0;
    }

    // Загрузка профиля
    async loadProfile() {
        if (!this.currentCourier) return;

        const usernameEl = document.getElementById('profile-username');
        const idEl = document.getElementById('profile-id');
        const createdEl = document.getElementById('profile-created');

        if (usernameEl) usernameEl.textContent = this.currentCourier.username;
        if (idEl) idEl.textContent = this.currentCourier.id;
        if (createdEl) createdEl.textContent = new Date(this.currentCourier.created_at).toLocaleDateString('ru-RU');
    }

    // Показать детали заказа
    async showOrderDetails(orderId) {
        try {
            const response = await fetch(`/api/courier/order/${orderId}`);
            const result = await response.json();

            if (result.success) {
                // Используем глобальную функцию из courier.html
                window.showOrderDetails(orderId);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Ошибка загрузки деталей заказа:', error);
            this.showNotification('❌ Не удалось загрузить детали заказа', 'error');
        }
    }

    // Показать подтверждение получения
    showPickupConfirmation(orderId) {
        if (confirm(`Подтвердить получение заказа #${orderId} со склада?`)) {
            this.updateOrderStatus(orderId, 'picked_up');
        }
    }

    async showDeliveryModal(orderId) {
        this.currentOrderId = orderId;
        this.currentPhoto = null;

        // Используем глобальную функцию из courier.html
        window.showDeliveryForm(orderId);
    }

    // Обработка выбора фото
    handlePhotoSelection(file) {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.showNotification('❌ Выберите изображение', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            this.showNotification('❌ Файл слишком большой (макс 5MB)', 'error');
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            this.currentPhoto = {
                data: e.target.result,
                file: file
            };

            const preview = document.getElementById('photo-preview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" alt="Выбранное фото">`;
                preview.style.display = 'block';
            }

            const confirmBtn = document.getElementById('confirmDeliveryBtn');
            if (confirmBtn) {
                confirmBtn.disabled = false;
            }
        };

        reader.onerror = () => {
            this.showNotification('❌ Ошибка чтения файла', 'error');
        };

        reader.readAsDataURL(file);
    }

    // Подтверждение получения заказа
    async confirmPickup() {
        if (!this.currentOrderId || !this.currentCourier) return;

        try {
            const response = await fetch('/api/courier/update-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    order_id: this.currentOrderId,
                    courier_id: this.currentCourier.id,
                    status: 'picked_up',
                    assignment_id: this.currentOrderId
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('✅ Заказ получен со склада', 'success');
                await this.loadOrders();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        }
    }

    // Подтверждение доставки
    async confirmDelivery() {
        if (!this.currentOrderId || !this.currentCourier || !this.currentPhoto) {
            this.showNotification('❌ Сначала добавьте фото подтверждения', 'error');
            return;
        }

        const notes = document.getElementById('delivery-notes')?.value.trim() || '';

        try {
            const response = await fetch('/api/courier/update-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    order_id: this.currentOrderId,
                    courier_id: this.currentCourier.id,
                    status: 'delivered',
                    assignment_id: this.currentOrderId,
                    photo_data: this.currentPhoto.data,
                    notes: notes
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('✅ Доставка подтверждена!', 'success');
                await this.loadOrders();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Ошибка подтверждения доставки:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        }
    }

    // Вспомогательные функции
    getStatusText(status) {
        const statusMap = {
            'assigned': 'Назначен',
            'picked_up': 'В доставке',
            'delivered': 'Доставлен',
            'cancelled': 'Отменен',
            'pending': 'Ожидает',
            'processing': 'В обработке'
        };
        return statusMap[status] || status;
    }

    getOrderStatusText(status) {
        const statusMap = {
            'pending': 'Ожидает обработки',
            'processing': 'В обработке',
            'confirmed': 'Подтвержден',
            'shipped': 'Отправлен',
            'delivered': 'Доставлен',
            'cancelled': 'Отменен'
        };
        return statusMap[status] || status;
    }

    getPaymentMethodText(method) {
        const methods = {
            'cash': 'Наличные',
            'transfer': 'Перевод курьеру',
            'terminal': 'Терминал'
        };
        return methods[method] || method;
    }

    showNotification(message, type = 'info') {
        console.log(`💬 [${type.toUpperCase()}] ${message}`);

        // Используем уведомления из courier.html
        const showMessage = window.showMessage;
        if (showMessage) {
            showMessage(message, type);
        } else {
            alert(message);
        }
    }

    async updateOrderStatus(orderId, status) {
        if (!this.currentCourier) return;

        try {
            const response = await fetch('/api/courier/update-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    order_id: orderId,
                    courier_id: this.currentCourier.id,
                    status: status
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`Статус заказа #${orderId} обновлен`, 'success');
                await this.loadOrders();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            this.showNotification('Ошибка обновления статуса', 'error');
        }
    }
}

// Экспортируем для глобального доступа
window.CourierApp = CourierApp;