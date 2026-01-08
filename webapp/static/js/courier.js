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


    async loadAvailableOrders() {
        if (!this.currentCourier) return;

        try {
            const response = await fetch('/api/courier/available-orders');
            const result = await response.json();

            if (result.success) {
                this.displayAvailableOrders(result.available_orders || []);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Ошибка загрузки доступных заказов:', error);
            this.showNotification('❌ Не удалось загрузить доступные заказы', 'error');
        }
    }

    displayAvailableOrders(orders) {
        const container = document.getElementById('available-orders-list');
        if (!container) return;

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i>
                    <h3>Нет доступных заказов</h3>
                    <p>Все заказы уже взяты в доставку</p>
                </div>
            `;
            return;
        }

        let html = '';
        orders.forEach(order => {
            html += this.createAvailableOrderCard(order);
        });

        container.innerHTML = html;
    }

    createAvailableOrderCard(order) {
        // Извлекаем данные как в createOrderCard
        let address = "Адрес не указан";
        let recipient = "Не указан";
        let phone = "Телефон не указан";
        let paymentInfo = "Не указан";

        // Определяем способ оплаты с иконками
        if (order.payment_method === 'cash') {
            paymentInfo = "💵 Наличные";
        } else if (order.payment_method === 'transfer') {
            paymentInfo = "📱 Перевод курьеру";
        } else if (order.payment_method === 'terminal') {
            paymentInfo = "💳 Терминал";
        }

        if (order.recipient_name && order.recipient_name !== 'Гость' && order.recipient_name !== 'Не указан') {
            recipient = order.recipient_name;
        }

        if (order.phone_number && order.phone_number !== 'Телефон не указан') {
            phone = order.phone_number;
        }

        if (order.delivery_address) {
            try {
                let addressData = null;
                if (typeof order.delivery_address === 'string') {
                    if (order.delivery_address.startsWith('{') || order.delivery_address.startsWith('[')) {
                        addressData = JSON.parse(order.delivery_address);
                    } else {
                        address = order.delivery_address;
                    }
                } else {
                    addressData = order.delivery_address;
                }

                if (addressData && typeof addressData === 'object') {
                    const parts = [];
                    if (addressData.city) parts.push(addressData.city);
                    if (addressData.street) parts.push(`ул. ${addressData.street}`);
                    if (addressData.house) parts.push(`д. ${addressData.house}`);
                    if (addressData.apartment) parts.push(`кв. ${addressData.apartment}`);

                    if (parts.length > 0) {
                        address = parts.join(', ');
                    } else if (addressData.address) {
                        address = addressData.address;
                    }

                    if (recipient === "Не указан" && addressData.recipient_name) {
                        recipient = addressData.recipient_name;
                    }

                    if (phone === "Телефон не указан") {
                        phone = addressData.phone || addressData.phone_number || "Телефон не указан";
                    }
                }
            } catch (e) {
                console.error('Ошибка обработки адреса:', e);
                if (typeof order.delivery_address === 'string') {
                    address = order.delivery_address;
                }
            }
        }

        // Расчет суммы с доставкой
        const total = order.total_price || 0;
        const deliveryCost = order.delivery_cost || 0;
        const totalWithDelivery = order.total_with_delivery || (total + deliveryCost);

        // Данные о наличной оплате
        const cashReceived = order.cash_received || 0;
        const cashChange = order.cash_change || 0;
        const cashToPay = totalWithDelivery;

        // Информация о стоимости доставки
        let deliveryInfo = '';
        if (deliveryCost > 0) {
            deliveryInfo = `
                <div class="info-item">
                    <span class="info-label">Доставка:</span>
                    <span class="info-value">${this.formatPrice(deliveryCost)} ₽</span>
                </div>
            `;
        } else {
            deliveryInfo = `
                <div class="info-item">
                    <span class="info-label">Доставка:</span>
                    <span class="info-value" style="color: #27ae60;">Бесплатно</span>
                </div>
            `;
        }

        // Блок информации о наличной оплате
        let cashPaymentInfo = '';
        if (order.payment_method === 'cash') {
            if (cashReceived > 0 || cashChange > 0) {
                // Если есть данные о наличных
                cashPaymentInfo = `
                    <div class="cash-payment-details" style="margin-top: 10px; padding: 12px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffc107;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-weight: bold;">
                            <span>💵 НАЛИЧНАЯ ОПЛАТА:</span>
                            <span>${this.formatPrice(cashToPay)} ₽</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <span>Получено от клиента:</span>
                            <span style="color: #27ae60; font-weight: bold;">${this.formatPrice(cashReceived)} ₽</span>
                        </div>
                `;

                if (cashChange > 0) {
                    cashPaymentInfo += `
                        <div style="display: flex; justify-content: space-between; background: #dc3545; color: white; padding: 8px; border-radius: 6px; margin-top: 8px; font-weight: bold;">
                            <span>⚠️ СДАЧА КЛИЕНТУ:</span>
                            <span>${this.formatPrice(cashChange)} ₽</span>
                        </div>
                        <div style="font-size: 11px; color: #856404; margin-top: 6px; text-align: center;">
                            <i class="fas fa-exclamation-triangle"></i> <strong>ВНИМАНИЕ: Подготовьте сдачу заранее!</strong>
                        </div>
                    `;
                } else if (cashChange === 0 && cashReceived >= cashToPay) {
                    cashPaymentInfo += `
                        <div style="display: flex; justify-content: space-between; background: #28a745; color: white; padding: 8px; border-radius: 6px; margin-top: 8px;">
                            <span>✅ Без сдачи:</span>
                            <span>Сдачи не требуется</span>
                        </div>
                    `;
                }

                cashPaymentInfo += `</div>`;
            } else {
                // Если нет данных о наличных, но оплата наличными
                cashPaymentInfo = `
                    <div class="cash-payment-details" style="margin-top: 10px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px dashed #6c757d;">
                        <div style="text-align: center; color: #6c757d;">
                            <i class="fas fa-info-circle"></i> Информация о наличной оплате будет уточнена
                        </div>
                    </div>
                `;
            }
        }

        return `
            <div class="order-card available" data-order-id="${order.id}">
                <div class="order-header">
                    <div class="order-id">Заказ #${order.id}</div>
                    <div class="order-reward">
                        <i class="fas fa-money-bill-wave"></i>
                        ${this.formatPrice(totalWithDelivery)} ₽
                    </div>
                </div>

                <div class="order-info">
                    <div class="info-item">
                        <span class="info-label">Товары:</span>
                        <span class="info-value">${this.formatPrice(total)} ₽</span>
                    </div>
                    ${deliveryInfo}
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
                    <div class="info-item">
                        <span class="info-label">Создан:</span>
                        <span class="info-value">${new Date(order.created_at).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Оплата:</span>
                        <span class="info-value" style="${order.payment_method === 'cash' && cashChange > 0 ? 'color: #dc3545; font-weight: bold;' : ''}">
                            ${paymentInfo}
                        </span>
                    </div>

                    ${cashPaymentInfo}
                </div>

                <div class="order-actions">
                    <button class="btn-action btn-take-order" onclick="takeOrder(${order.id})">
                        <i class="fas fa-hand-paper"></i> Взять заказ
                    </button>
                    <button class="btn-action btn-details" onclick="showOrderDetails(${order.id})">
                        <i class="fas fa-info-circle"></i> Подробнее
                    </button>
                </div>
            </div>
        `;
    }

    // Добавляем глобальную функцию для взятия заказа
    async function takeOrder(orderId) {
        if (!window.courierApp || !window.courierApp.currentCourier) {
            alert('Сначала войдите в систему');
            return;
        }

        if (confirm(`Взять заказ #${orderId} в доставку?`)) {
            try {
                const response = await fetch('/api/courier/take-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        order_id: orderId,
                        courier_id: window.courierApp.currentCourier.id
                    })
                });

                const result = await response.json();

                if (result.success) {
                    window.courierApp.showNotification(`✅ Заказ #${orderId} взят в доставку!`, 'success');

                    // Перезагружаем списки заказов
                    window.courierApp.loadAvailableOrders();
                    window.courierApp.loadOrders();
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.error('Ошибка взятия заказа:', error);
                window.courierApp.showNotification(`❌ ${error.message}`, 'error');
            }
        }
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
        document.querySelectorAll('.content-section').forEach(el => {
            el.classList.remove('active');
        });

        document.getElementById(section + 'Section').classList.add('active');

        if (section === 'available') {
            this.loadAvailableOrders();
        } else if (section === 'today') {
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

        // Метод форматирования цены (если еще нет)
    formatPrice(price) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(price || 0));
    }


    createOrderCard(order, isCompleted = false) {
        // ========== ИСПРАВЛЕННОЕ ИЗВЛЕЧЕНИЕ ДАННЫХ ==========
        let address = "Адрес не указан";
        let recipient = "Не указан";
        let phone = "Телефон не указан";

        // ИНФОРМАЦИЯ О НАЛИЧНОЙ ОПЛАТЕ
        let cashInfo = "";
        let paymentInfo = "Не указан";

        // 1. Определяем способ оплаты
        if (order.payment_method === 'cash') {
            paymentInfo = "💵 Наличные";

            // Используем данные из базы
            const total = order.total_price || 0;
            const deliveryCost = order.delivery_cost || 0;
            const totalWithDelivery = total + deliveryCost;
            const cashReceived = order.cash_received || 0;
            const cashChange = order.cash_change || 0;

            // Всегда показываем информацию о наличной оплате для наличных заказов
            cashInfo = `
                <div class="cash-payment-info" style="margin-top: 8px; padding: 10px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffc107; font-size: 13px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span><strong>К оплате:</strong></span>
                        <span><strong>${this.formatPrice(totalWithDelivery)} ₽</strong></span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Получено:</span>
                        <span style="color: #27ae60;">${this.formatPrice(cashReceived)} ₽</span>
                    </div>
            `;

            if (cashChange > 0) {
                cashInfo += `
                    <div style="display: flex; justify-content: space-between; background: #dc3545; color: white; padding: 6px; border-radius: 5px; margin-top: 5px;">
                        <span><strong>Нужно выдать сдачу:</strong></span>
                        <span><strong>${this.formatPrice(cashChange)} ₽</strong></span>
                    </div>
                    <div style="font-size: 11px; color: #856404; margin-top: 5px; text-align: center;">
                        <i class="fas fa-exclamation-triangle"></i> <strong>ВНИМАНИЕ: Подготовьте сдачу клиенту!</strong>
                    </div>
                `;
            } else if (cashChange === 0 && cashReceived > 0) {
                cashInfo += `
                    <div style="display: flex; justify-content: space-between; background: #28a745; color: white; padding: 6px; border-radius: 5px; margin-top: 5px;">
                        <span><strong>Без сдачи</strong></span>
                        <span><strong>✅</strong></span>
                    </div>
                `;
            } else {
                cashInfo += `
                    <div style="display: flex; justify-content: space-between; background: #6c757d; color: white; padding: 6px; border-radius: 5px; margin-top: 5px;">
                        <span><strong>Сумма оплаты не указана</strong></span>
                        <span><strong>⚠️</strong></span>
                    </div>
                `;
            }

            cashInfo += `</div>`;
        } else if (order.payment_method === 'transfer') {
            paymentInfo = "📱 Перевод";
        } else if (order.payment_method === 'terminal') {
            paymentInfo = "💳 Терминал";
        }


        // 2. Получаем данные получателя и адреса
        if (order.recipient_name && order.recipient_name !== 'Гость' && order.recipient_name !== 'Не указан') {
            recipient = order.recipient_name;
        }

        if (order.phone_number && order.phone_number !== 'Телефон не указан') {
            phone = order.phone_number;
        }

        // 3. Обработка адреса
        let addressData = null;
        if (order.delivery_address) {
            try {
                if (typeof order.delivery_address === 'string') {
                    if (order.delivery_address.startsWith('{') || order.delivery_address.startsWith('[')) {
                        addressData = JSON.parse(order.delivery_address);
                    } else {
                        address = order.delivery_address;
                    }
                } else {
                    addressData = order.delivery_address;
                }

                if (addressData && typeof addressData === 'object') {
                    const parts = [];
                    if (addressData.city) parts.push(addressData.city);
                    if (addressData.street) parts.push(`ул. ${addressData.street}`);
                    if (addressData.house) parts.push(`д. ${addressData.house}`);
                    if (addressData.apartment) parts.push(`кв. ${addressData.apartment}`);

                    if (parts.length > 0) {
                        address = parts.join(', ');
                    } else if (addressData.address) {
                        address = addressData.address;
                    }

                    if (recipient === "Не указан" && addressData.recipient_name) {
                        recipient = addressData.recipient_name;
                    }

                    if (phone === "Телефон не указан") {
                        phone = addressData.phone || addressData.phone_number || "Телефон не указан";
                    }
                }
            } catch (e) {
                console.error('❌ Ошибка обработки адреса:', e);
                if (typeof order.delivery_address === 'string') {
                    address = order.delivery_address;
                }
            }
        }

        // 4. Если все еще нет данных
        if (recipient === "Не указан" && order.username && order.username !== 'Гость') {
            recipient = order.username;
        }

        // Сумма с доставкой
        const total = order.total_price || 0;
        const deliveryCost = order.delivery_cost || 0;
        const totalWithDelivery = total + deliveryCost;

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
                        <span class="info-value">${totalWithDelivery} ₽</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Оплата:</span>
                        <span class="info-value" style="${order.payment_method === 'cash' && order.cash_change > 0 ? 'color: #dc3545; font-weight: bold;' : ''}">
                            ${paymentInfo}
                        </span>
                    </div>

                    ${cashInfo}

                    <div class="info-item">
                        <span class="info-label">Получатель:</span>
                        <span class="info-value" style="${recipient === 'Не указан' ? 'color: #e74c3c; font-weight: bold;' : ''}">
                            ${recipient}
                        </span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Телефон:</span>
                        <span class="info-value" style="${phone === 'Телефон не указан' ? 'color: #e74c3c; font-weight: bold;' : ''}">
                            ${phone}
                        </span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Адрес:</span>
                        <span class="info-value" style="font-size: 12px; ${address === 'Адрес не указан' ? 'color: #e74c3c;' : ''}">
                            ${address}
                        </span>
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