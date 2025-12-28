// base.js - Основные скрипты для базового шаблона

document.addEventListener('DOMContentLoaded', function() {
    // Инициализация темы
    initTheme();

    // Инициализация навигации
    initNavigation();

    // Инициализация анимаций
    initAnimations();

    // Инициализация обработчиков событий
    initEventHandlers();

    // Инициализация уведомлений
    initNotifications();
});

/**
 * Инициализация темы
 */
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    // Установка начальной темы
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    // Обработчик переключения темы
    themeToggle.addEventListener('click', function() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);

        // Анимация переключения
        playThemeTransition();
    });

    // Обновление иконки темы
    function updateThemeIcon(theme) {
        const icon = themeToggle.querySelector('i');
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на темную тему');
    }

    // Анимация переключения темы
    function playThemeTransition() {
        document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
        setTimeout(() => {
            document.body.style.transition = '';
        }, 300);
    }
}

/**
 * Инициализация навигации
 */
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const currentPath = window.location.pathname;

    // Помечаем активную ссылку
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
            link.classList.add('active');
        }
    });

    // Анимация наведения
    navLinks.forEach(link => {
        link.addEventListener('mouseenter', function() {
            if (!this.classList.contains('active')) {
                this.style.transform = 'translateY(-2px)';
            }
        });

        link.addEventListener('mouseleave', function() {
            this.style.transform = '';
        });
    });
}

/**
 * Инициализация анимаций
 */
function initAnimations() {
    // Анимация логотипа
    const logo = document.querySelector('.logo-animation');
    if (logo) {
        logo.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.05) rotate(-2deg)';
        });

        logo.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) rotate(0)';
        });
    }

    // Анимация карточек при скролле
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');

                // Добавляем задержку для каскадного эффекта
                const delay = entry.target.dataset.delay || '0';
                entry.target.style.animationDelay = delay + 'ms';
            }
        });
    }, observerOptions);

    // Наблюдаем за элементами с классами для анимации
    document.querySelectorAll('.fade-in, .slide-up').forEach(el => {
        observer.observe(el);
    });
}

/**
 * Инициализация обработчиков событий
 */
function initEventHandlers() {
    // Кнопка "Наверх"
    const scrollTop = document.getElementById('scrollTop');
    if (scrollTop) {
        window.addEventListener('scroll', function() {
            scrollTop.classList.toggle('visible', window.scrollY > 300);
        });

        scrollTop.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // Закрытие уведомлений по клику вне области
    document.addEventListener('click', function(e) {
        const flashMessages = document.querySelector('.flash-messages');
        if (flashMessages && !flashMessages.contains(e.target)) {
            const activeMessages = flashMessages.querySelectorAll('.flash-message');
            if (activeMessages.length > 0) {
                // Закрываем самое старое уведомление
                activeMessages[0].remove();
            }
        }
    });
}

/**
 * Инициализация уведомлений
 */
function initNotifications() {
    const flashMessages = document.querySelector('.flash-messages');
    if (!flashMessages) return;

    // Автоматическое закрытие уведомлений
    const autoCloseDelay = 5000; // 5 секунд

    flashMessages.querySelectorAll('.flash-message').forEach(message => {
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, autoCloseDelay);
    });

    // Обработчик закрытия по кнопке
    flashMessages.querySelectorAll('.flash-close').forEach(button => {
        button.addEventListener('click', function() {
            this.closest('.flash-message').remove();
        });
    });
}

/**
 * Показать уведомление
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип сообщения (success, error, info)
 * @param {number} duration - Длительность показа в миллисекундах
 */
function showNotification(message, type = 'info', duration = 5000) {
    const flashMessages = document.querySelector('.flash-messages');
    if (!flashMessages) return;

    const messageEl = document.createElement('div');
    messageEl.className = `flash-message flash-${type}`;
    messageEl.innerHTML = `
        <div class="flash-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
        <button class="flash-close">
            <i class="fas fa-times"></i>
        </button>
    `;

    flashMessages.appendChild(messageEl);

    // Анимация появления
    setTimeout(() => {
        messageEl.classList.add('show');
    }, 10);

    // Автоматическое закрытие
    if (duration > 0) {
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.classList.remove('show');
                setTimeout(() => messageEl.remove(), 300);
            }
        }, duration);
    }

    // Обработчик закрытия
    messageEl.querySelector('.flash-close').addEventListener('click', function() {
        messageEl.classList.remove('show');
        setTimeout(() => messageEl.remove(), 300);
    });
}

/**
 * Обновить счетчик корзины
 * @param {number} count - Новое количество товаров
 */
function updateCartCount(count) {
    const cartBadge = document.querySelector('.cart-badge');
    const cartLink = document.querySelector('.cart-preview');

    if (cartBadge) {
        if (count > 0) {
            cartBadge.textContent = count > 99 ? '99+' : count;
            cartBadge.style.display = 'flex';
        } else {
            cartBadge.style.display = 'none';
        }
    } else if (count > 0 && cartLink) {
        // Создаем бейдж если его нет
        const badge = document.createElement('span');
        badge.className = 'cart-badge';
        badge.textContent = count > 99 ? '99+' : count;
        cartLink.appendChild(badge);
    }
}

// Экспорт функций для использования в других скриптах
window.BaseApp = {
    showNotification,
    updateCartCount,
    initTheme
};