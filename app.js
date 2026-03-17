/* ========================================
   JASA SURUH (JS) - App JavaScript
   ======================================== */

// Splash Screen
document.addEventListener('DOMContentLoaded', () => {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');

    setTimeout(() => {
        splash.classList.add('fade-out');
        app.classList.remove('hidden');

        setTimeout(() => {
            splash.style.display = 'none';
        }, 500);
    }, 2000);

    initPromoSlider();
    initBottomNav();
    initServiceItems();
    initInstallBanner();
});

// ========== PROMO SLIDER ==========
function initPromoSlider() {
    const track = document.getElementById('promoTrack');
    const dots = document.querySelectorAll('#promoDots .dot');
    let currentSlide = 0;
    const totalSlides = dots.length;
    let autoSlideInterval;
    let startX = 0;
    let isDragging = false;

    function goToSlide(index) {
        currentSlide = index;
        track.style.transform = `translateX(-${currentSlide * 100}%)`;
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentSlide);
        });
    }

    function nextSlide() {
        goToSlide((currentSlide + 1) % totalSlides);
    }

    // Auto slide
    function startAutoSlide() {
        autoSlideInterval = setInterval(nextSlide, 4000);
    }

    function stopAutoSlide() {
        clearInterval(autoSlideInterval);
    }

    startAutoSlide();

    // Touch swipe support
    const slider = document.getElementById('promoSlider');

    slider.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
        stopAutoSlide();
    }, { passive: true });

    slider.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;

        if (Math.abs(diff) > 50) {
            if (diff > 0 && currentSlide < totalSlides - 1) {
                goToSlide(currentSlide + 1);
            } else if (diff < 0 && currentSlide > 0) {
                goToSlide(currentSlide - 1);
            }
        }

        isDragging = false;
        startAutoSlide();
    }, { passive: true });

    // Dot click
    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
            stopAutoSlide();
            goToSlide(i);
            startAutoSlide();
        });
    });
}

// ========== BOTTOM NAVIGATION ==========
function initBottomNav() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Haptic feedback on supported devices
            if (navigator.vibrate) {
                navigator.vibrate(10);
            }
        });
    });
}

// ========== SERVICE ITEMS ==========
function initServiceItems() {
    const items = document.querySelectorAll('.service-item');

    items.forEach(item => {
        item.addEventListener('click', () => {
            const name = item.querySelector('.service-name').textContent;
            showToast(`${name} - Segera hadir!`);
        });
    });
}

// ========== TOAST NOTIFICATION ==========
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: #FFFFFF;
        color: #111111;
        padding: 12px 24px;
        border-radius: 50px;
        font-size: 13px;
        font-weight: 600;
        font-family: 'Plus Jakarta Sans', sans-serif;
        z-index: 9999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        animation: toastIn 0.3s ease;
        max-width: calc(100% - 40px);
        text-align: center;
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes toastOut { from { opacity: 1; transform: translateX(-50%) translateY(0); } to { opacity: 0; transform: translateX(-50%) translateY(-10px); } }
    `;
    document.head.appendChild(style);
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ========== PWA INSTALL ==========
let deferredPrompt;

function initInstallBanner() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallBanner();
    });
}

function showInstallBanner() {
    // Don't show if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.innerHTML = `
        <div class="install-banner-icon">JS</div>
        <div class="install-banner-text">
            <strong>Install Jasa Suruh</strong>
            <span>Akses cepat dari home screen</span>
        </div>
        <button class="btn-install" onclick="installApp()">Install</button>
        <button class="btn-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    document.body.appendChild(banner);
}

async function installApp() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
        showToast('Terima kasih! Aplikasi sedang diinstal.');
    }

    deferredPrompt = null;
    const banner = document.querySelector('.install-banner');
    if (banner) banner.remove();
}

// ========== SERVICE WORKER REGISTRATION ==========
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('Service Worker registered:', reg.scope);
            })
            .catch(err => {
                console.log('Service Worker registration failed:', err);
            });
    });
}
