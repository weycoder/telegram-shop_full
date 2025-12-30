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
        document.getElementById('loginContainer').style.display = 'flex';
        document.getElementById('courierContainer').style.display = 'none';
    }

    // Показать основной интерфейс
    showCourierInterface() {
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('courierContainer').style.display = 'flex';

        // Обновляем данные курьера
        if (this.currentCourier) {
            document.getElementById('courierName').textContent = this.currentCourier.full_name;
            document.getElementById('courierGreeting').textContent = `Добро пожаловать, ${this.currentCourier.full_name.split(' ')[0]}!`;
            document.getElementById('courierPhone').textContent = this.currentCourier.phone;
        }
    }

    // Назначение обработчиков событий
    bindEvents() {
        // Авторизация
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        // Выход
        document.getElementById('logoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.logout();
        });

        // Боковое меню
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('collapsed');
            document.querySelector('.main-content').classList.toggle('expanded');
        });

        // Навигация по разделам
        document.querySelectorAll('.menu-item[data-section]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.switchSection(section);

                // Обновляем активный пункт меню
                document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                // Обновляем заголовок
                const titles = {
                    'active': 'Активные заказы',
                    'today': 'Заказы на сегодня',
                    'history': 'История доставок',
                    'profile': 'Настройки профиля'
                };
                document.getElementById('pageTitle').textContent = titles[section];
            });
        });

        // Обновление заказов
        document.getElementById('refreshActive').addEventListener('click', () => {
            this.loadOrders();
        });

        // Закрытие модальных окон
        document.getElementById('closeOrderModal').addEventListener('click', () => {
            this.hideModal('orderModal');
        });

        document.getElementById('closeDeliveryModal').addEventListener('click', () => {
            this.hideModal('deliveryModal');
        });

        document.getElementById('closePickupModal').addEventListener('click', () => {
            this.hideModal('pickupModal');
        });

        document.getElementById('cancelDeliveryBtn').addEventListener('click', () => {
            this.hideModal('deliveryModal');
        });

        document.getElementById('cancelPickupBtn').addEventListener('click', () => {
            this.hideModal('pickupModal');
        });

        // Клик по оверлею для закрытия модальных окон
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.style.display = 'none';
                }
            });
        });

        // Кнопки действий с заказами
        document.addEventListener('click', (e) => {
            // Подробности заказа
            if (e.target.closest('.action-btn.details')) {
                const orderCard = e.target.closest('.order-card');
                const orderId = orderCard.dataset.orderId;
                this.showOrderDetails(orderId);
            }

            // Забрать заказ
            if (e.target.closest('.action-btn.pickup')) {
                const orderCard = e.target.closest('.order-card');
                const orderId = orderCard.dataset.orderId;
                this.showPickupConfirmation(orderId);
            }

            // Доставка
            if (e.target.closest('.action-btn.deliver')) {
                const orderCard = e.target.closest('.order-card');
                const orderId = orderCard.dataset.orderId;
                this.showDeliveryModal(orderId);
            }
        });

        // Работа с фото
        this.bindPhotoEvents();
    }

    // Обработчики для работы с фото
    bindPhotoEvents() {
        // Сделать фото
        document.getElementById('takePhotoBtn').addEventListener('click', () => {
            document.getElementById('cameraInput').click();
        });

        // Выбрать из галереи
        document.getElementById('choosePhotoBtn').addEventListener('click', () => {
            document.getElementById('galleryInput').click();
        });

        // Удалить фото
        document.getElementById('removePhotoBtn').addEventListener('click', () => {
            this.removePhoto();
        });

        // Обработка выбора файла (камера)
        document.getElementById('cameraInput').addEventListener('change', (e) => {
            this.handlePhotoSelection(e.target.files[0]);
        });

        // Обработка выбора файла (галерея)
        document.getElementById('galleryInput').addEventListener('change', (e) => {
            this.handlePhotoSelection(e.target.files[0]);
        });

        // Подтверждение доставки
        document.getElementById('confirmDeliveryBtn').addEventListener('click', () => {
            this.confirmDelivery();
        });

        // Подтверждение получения
        document.getElementById('confirmPickupBtn').addEventListener('click', () => {
            this.confirmPickup();
        });
    }

    // Авторизация
    async login() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        if (!username || !password) {
            this.showNotification('❌ Введите логин и пароль', 'error');
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

                this.showNotification('✅ Успешный вход!', 'success');
            } else {
                throw new Error(result.error || 'Ошибка авторизации');
            }
        } catch (error) {
            console.error('Ошибка входа:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
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
        const container = document.getElementById('activeOrdersGrid');

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-check"></i>
                    <h3>Нет активных заказов</h3>
                    <p>Все заказы выполнены или ожидают назначения</p>
                </div>
            `;
            return;
        }

        let html = '';
        orders.forEach(order => {
            html += this.createOrderCard(order, false);
        });

        container.innerHTML = html;

        // Обновляем счетчик
        document.getElementById('activeBadge').textContent = orders.length;
    }

    // Загрузка заказов на сегодня
    async loadTodayOrders() {
        // Уже загружены в loadOrders, просто показываем
        this.switchSection('today');
    }

    displayTodayOrders(orders) {
        const container = document.getElementById('todayOrdersGrid');

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
        // Уже загружены в loadOrders
        this.switchSection('history');
    }

    displayHistoryOrders(orders) {
        const container = document.getElementById('historyOrdersGrid');

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <h3>История доставок пуста</h3>
                    <p>Вы еще не выполнили ни одной доставки</p>
                </div>
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
    createOrderCard(order, isCompleted = false) 
        // 1. Получаем адрес ПРАВИЛЬНО
        let address = "Адрес не указан";
        if (order.delivery_address) {
            try {
                // Если адрес в JSON - парсим
                if (typeof order.delivery_address === 'string') {
                    const addrObj = JSON.parse(order.delivery_address);
                    address = addrObj.full_address || addrObj.address || "Адрес не указан";
                } else if (order.delivery_address_obj) {
                    // Если уже распарсено в бэкенде
                    address = order.delivery_address_obj.full_address ||
                              order.delivery_address_obj.address ||
                              "Адрес не указан";
                }
            } catch(e) {
                // Если не JSON, используем как строку
                address = order.delivery_address;
            }
        }

        // 2. Получатель и телефон
        const recipient = order.recipient_name || order.username || "Не указан";
        const phone = order.phone_number || "Телефон не указан";

        // 3. Сумма
        const total = order.total_price || order.sum || 0;

        // 4. Дата доставки
        let deliveryDate = "Дата не указана";
        if (order.delivery_started) {
            deliveryDate = new Date(order.delivery_started).toLocaleDateString('ru-RU');
        } else if (order.assigned_at) {
            deliveryDate = new Date(order.assigned_at).toLocaleDateString('ru-RU');
        }

        return `
            <div class="order-card ${isCompleted ? 'completed' : 'active'}" data-order-id="${order.id}">
                <div class="order-header">
                    <h4>Заказ #${order.id}</h4>
                    <span class="order-sum">${total} ₽</span>
                </div>

                <div class="order-info">
                    <div class="info-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span><strong>Адрес:</strong> ${address}</span>
                    </div>
                    <div class="info-row">
                        <i class="fas fa-user"></i>
                        <span><strong>Получатель:</strong> ${recipient}</span>
                    </div>
                    <div class="info-row">
                        <i class="fas fa-phone"></i>
                        <span><strong>Телефон:</strong> ${phone}</span>
                    </div>
                    <div class="info-row">
                        <i class="fas fa-calendar"></i>
                        <span><strong>Доставка:</strong> ${deliveryDate}</span>
                    </div>
                </div>

                ${!isCompleted ? `
                    <div class="order-actions">
                        <button class="btn btn-success" onclick="app.startDelivery(${order.id})">
                            <i class="fas fa-play"></i> Начать доставку
                        </button>
                        <button class="btn btn-danger" onclick="app.cancelOrder(${order.id})">
                            <i class="fas fa-times"></i> Отменить
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Обновление статистики
    updateStats(data) {
        // Считаем доставленные сегодня
        const today = new Date().toISOString().split('T')[0];
        const todayDelivered = data.completed_orders?.filter(order => {
            const deliveredDate = order.delivered_at ? order.delivered_at.split('T')[0] : '';
            return deliveredDate === today;
        }).length || 0;

        document.getElementById('todayDelivered').textContent = todayDelivered;
        document.getElementById('totalDelivered').textContent = data.completed_orders?.length || 0;
    }
    async function updateOrderStatusWithNotification(orderId, status) {
        try {
            const response = await fetch('/api/courier/update-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    order_id: orderId,
                    courier_id: this.currentCourier.id,
                    status: status,
                    send_notification: true  // Флаг для отправки уведомления
                })
            });

            const result = await response.json();

            if (result.success) {
                // Показываем уведомление курьеру
                this.showNotification(`✅ Статус обновлен: ${getStatusText(status)}`, 'success');

                // Обновляем список заказов
                await this.loadOrders();

                return true;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
            return false;
        }
    }


    // Загрузка профиля
    async loadProfile() {
        if (!this.currentCourier) return;

        const container = document.getElementById('profileSettings');
        container.innerHTML = `
            <div class="profile-card">
                <div class="profile-field">
                    <label>ФИО</label>
                    <div class="value">${this.currentCourier.full_name}</div>
                </div>

                <div class="profile-field">
                    <label>Телефон</label>
                    <div class="value">${this.currentCourier.phone}</div>
                </div>

                <div class="profile-field">
                    <label>Тип транспорта</label>
                    <div class="value">
                        ${this.currentCourier.vehicle_type === 'car' ? '🚗 Автомобиль' :
                          this.currentCourier.vehicle_type === 'bike' ? '🚲 Велосипед' :
                          this.currentCourier.vehicle_type === 'foot' ? '🚶 Пешком' : 'Не указано'}
                    </div>
                </div>

                <div class="profile-field">
                    <label>Статус</label>
                    <div class="value">
                        <span class="status-badge active">Активен</span>
                    </div>
                </div>

                <div class="profile-field">
                    <label>ID курьера</label>
                    <div class="value">${this.currentCourier.id}</div>
                </div>
            </div>
        `;
    }

    // Показать детали заказа
    async showOrderDetails(orderId) {
        try {
            const response = await fetch(`/api/courier/order/${orderId}`);
            const result = await response.json();

            if (result.success) {
                this.displayOrderDetails(result.order);
                this.showModal('orderModal');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Ошибка загрузки деталей заказа:', error);
            this.showNotification('❌ Не удалось загрузить детали заказа', 'error');
        }
    }

    // Отображение деталей заказа
    displayOrderDetails(order) {
        document.getElementById('modalOrderTitle').textContent = `Заказ #${order.id}`;

        // Адрес доставки
        let addressHtml = '';
        if (order.delivery_address_obj) {
            const addr = order.delivery_address_obj;
            addressHtml = `
                <div class="detail-section">
                    <h4><i class="fas fa-map-marker-alt"></i> Адрес доставки</h4>
                    <div class="detail-content">
                        <p><strong>Город:</strong> ${addr.city || 'Не указан'}</p>
                        <p><strong>Улица:</strong> ${addr.street || 'Не указана'} ${addr.house || ''}</p>
                        ${addr.apartment ? `<p><strong>Квартира:</strong> ${addr.apartment}</p>` : ''}
                        ${addr.floor ? `<p><strong>Этаж:</strong> ${addr.floor}</p>` : ''}
                        ${addr.doorcode ? `<p><strong>Домофон:</strong> ${addr.doorcode}</p>` : ''}
                    </div>
                </div>
            `;
        }

        // Товары
        let itemsHtml = '';
        if (order.items_list && Array.isArray(order.items_list)) {
            itemsHtml = `
                <div class="detail-section">
                    <h4><i class="fas fa-boxes"></i> Состав заказа</h4>
                    <div class="detail-content">
                        ${order.items_list.map(item => `
                            <div class="order-item-detail">
                                <div class="item-name">${item.name} × ${item.quantity}</div>
                                <div class="item-price">${parseInt(item.price * item.quantity).toLocaleString('ru-RU')} ₽</div>
                            </div>
                        `).join('')}
                        <div class="order-total-detail">
                            <strong>Итого:</strong>
                            <strong>${parseInt(order.total_price).toLocaleString('ru-RU')} ₽</strong>
                        </div>
                    </div>
                </div>
            `;
        }

        // Информация о клиенте
        const customerHtml = `
            <div class="detail-section">
                <h4><i class="fas fa-user"></i> Информация о клиенте</h4>
                <div class="detail-content">
                    <p><strong>Имя:</strong> ${order.recipient_name || 'Не указано'}</p>
                    ${order.phone_number ? `<p><strong>Телефон:</strong> ${order.phone_number}</p>` : ''}
                    <p><strong>Способ оплаты:</strong> ${this.getPaymentMethodText(order.payment_method)}</p>
                </div>
            </div>
        `;

        // Статус
        const statusHtml = `
            <div class="detail-section">
                <h4><i class="fas fa-info-circle"></i> Статус</h4>
                <div class="detail-content">
                    <p><strong>Статус заказа:</strong> <span class="status-${order.status}">${this.getOrderStatusText(order.status)}</span></p>
                    <p><strong>Статус доставки:</strong> <span class="status-${order.assignment_status}">${this.getStatusText(order.assignment_status)}</span></p>
                    ${order.delivered_at ? `<p><strong>Доставлен:</strong> ${new Date(order.delivered_at).toLocaleString('ru-RU')}</p>` : ''}
                </div>
            </div>
        `;

        // Фото если есть
        let photoHtml = '';
        if (order.photo_proof) {
            photoHtml = `
                <div class="detail-section">
                    <h4><i class="fas fa-camera"></i> Фото подтверждения</h4>
                    <div class="detail-content">
                        <img src="${order.photo_proof}" alt="Фото доставки" class="delivery-photo">
                    </div>
                </div>
            `;
        }

        document.getElementById('orderModalBody').innerHTML = `
            <div class="order-details-container">
                ${customerHtml}
                ${addressHtml}
                ${itemsHtml}
                ${statusHtml}
                ${photoHtml}
                ${order.delivery_notes ? `
                    <div class="detail-section">
                        <h4><i class="fas fa-sticky-note"></i> Примечания курьера</h4>
                        <div class="detail-content">
                            <p>${order.delivery_notes}</p>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Показать подтверждение получения
    showPickupConfirmation(orderId) {
        this.currentOrderId = orderId;
        document.getElementById('pickupOrderId').textContent = `#${orderId}`;
        this.showModal('pickupModal');
    }

    async function showDeliveryModal(orderId) {
        this.currentOrderId = orderId;
        this.currentPhoto = null;

        // Загружаем информацию о заказе
        try {
            const response = await fetch(`/api/courier/order/${orderId}`);
            const result = await response.json();

            if (result.success) {
                const order = result.order;

                // Заполняем информацию в модальном окне
                document.getElementById('deliveryOrderId').textContent = `Заказ #${order.id}`;

                // Имя получателя
                document.getElementById('deliveryCustomerName').textContent =
                    order.recipient_name || 'Имя не указано';

                // Телефон
                document.getElementById('deliveryCustomerPhone').textContent =
                    order.phone_number || 'Телефон не указан';

                // Адрес доставки
                let addressHtml = '';
                if (order.delivery_address_obj) {
                    const addr = order.delivery_address_obj;
                    if (addr.city && addr.street) {
                        addressHtml = `
                            <div class="delivery-info">
                                <p><strong>Адрес доставки:</strong></p>
                                <p>${addr.city || ''}, ${addr.street || ''} ${addr.house || ''}</p>
                                ${addr.apartment ? `<p>Квартира: ${addr.apartment}</p>` : ''}
                                ${addr.floor ? `<p>Этаж: ${addr.floor}</p>` : ''}
                                ${addr.doorcode ? `<p>Код домофона: ${addr.doorcode}</p>` : ''}
                            </div>
                        `;
                    }
                }

                // Состав заказа
                let itemsHtml = '';
                if (order.items_list && Array.isArray(order.items_list)) {
                    itemsHtml = `
                        <div class="order-items-info">
                            <p><strong>Состав заказа:</strong></p>
                            ${order.items_list.map(item => `
                                <p>${item.name} × ${item.quantity} = ${item.quantity * item.price} ₽</p>
                            `).join('')}
                            <p><strong>Итого: ${order.total_price || 0} ₽</strong></p>
                        </div>
                    `;
                }

                // Обновляем содержимое модального окна
                document.getElementById('deliveryModalContent').innerHTML = `
                    <div class="delivery-details">
                        <div class="customer-info">
                            <p><strong>Получатель:</strong> ${order.recipient_name || 'Не указан'}</p>
                            <p><strong>Телефон:</strong> ${order.phone_number || 'Не указан'}</p>
                        </div>
                        ${addressHtml}
                        ${itemsHtml}
                    </div>
                `;

                this.showModal('deliveryModal');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Ошибка загрузки заказа:', error);
            this.showNotification('❌ Ошибка загрузки информации о заказе', 'error');
        }
    }

    // Обработка выбора фото
    handlePhotoSelection(file) {
        if (!file) return;

        // Проверяем тип файла
        if (!file.type.startsWith('image/')) {
            this.showNotification('❌ Выберите изображение', 'error');
            return;
        }

        // Проверяем размер (макс 5MB)
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

            // Показываем превью
            const preview = document.getElementById('photoPreview');
            preview.innerHTML = `<img src="${e.target.result}" alt="Выбранное фото">`;

            // Показываем кнопку удаления
            document.getElementById('removePhotoBtn').style.display = 'flex';

            // Активируем кнопку подтверждения
            document.getElementById('confirmDeliveryBtn').disabled = false;
        };

        reader.onerror = () => {
            this.showNotification('❌ Ошибка чтения файла', 'error');
        };

        reader.readAsDataURL(file);
    }

    // Удалить фото
    removePhoto() {
        this.currentPhoto = null;
        document.getElementById('photoPreview').innerHTML = `
            <div class="preview-placeholder">
                <i class="fas fa-image"></i>
                <p>Фото еще не выбрано</p>
            </div>
        `;
        document.getElementById('removePhotoBtn').style.display = 'none';
        document.getElementById('confirmDeliveryBtn').disabled = true;

        // Сбрасываем инпуты
        document.getElementById('cameraInput').value = '';
        document.getElementById('galleryInput').value = '';
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
                    assignment_id: this.currentOrderId // Временно используем order_id как assignment_id
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('✅ Заказ получен со склада', 'success');
                this.hideModal('pickupModal');
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

        const notes = document.getElementById('deliveryNotes').value.trim();

        try {
            // Отправляем фото и данные
            const response = await fetch('/api/courier/update-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    order_id: this.currentOrderId,
                    courier_id: this.currentCourier.id,
                    status: 'delivered',
                    assignment_id: this.currentOrderId, // Временно
                    photo_data: this.currentPhoto.data,
                    notes: notes
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('✅ Доставка подтверждена!', 'success');
                this.hideModal('deliveryModal');
                this.removePhoto();
                document.getElementById('deliveryNotes').value = '';
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
            'picked_up': 'Забран',
            'delivered': 'Доставлен',
            'cancelled': 'Отменен'
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

    showModal(modalId) {
        document.getElementById(modalId).style.display = 'flex';
    }

    hideModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationsContainer');

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas fa-${type === 'success' ? 'check-circle' :
                                 type === 'error' ? 'exclamation-circle' :
                                 type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            </div>
            <div class="notification-content">
                <h4>${type === 'success' ? 'Успешно!' :
                       type === 'error' ? 'Ошибка!' :
                       type === 'warning' ? 'Внимание!' : 'Информация'}</h4>
                <p>${message}</p>
            </div>
        `;

        container.appendChild(notification);

        // Анимация появления
        setTimeout(() => notification.classList.add('show'), 10);

        // Автоудаление
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
}

// Инициализация приложения
let courierApp;

document.addEventListener('DOMContentLoaded', () => {
    courierApp = new CourierApp();
    window.courierApp = courierApp;
});