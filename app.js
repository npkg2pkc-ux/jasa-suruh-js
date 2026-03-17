/* ========================================
   JASA SURUH (JS) - App Logic
   Auth + Role-based Routing + Interactions
   ======================================== */

(function () {
    'use strict';

    // ── Constants ──
    const OWNER_USERNAME = '3123159';
    const OWNER_PASSWORD = '3123159';
    const STORAGE_USERS = 'js_users';
    const STORAGE_SESSION = 'js_session';

    // ── Google Sheets API ──
    // Ganti URL di bawah dengan URL Web App dari Google Apps Script kamu
    const SCRIPT_URL = 'PASTE_URL_GOOGLE_APPS_SCRIPT_DISINI';

    function isSheetConnected() {
        return SCRIPT_URL && SCRIPT_URL !== 'PASTE_URL_GOOGLE_APPS_SCRIPT_DISINI';
    }

    // ── Initialize owner in user DB ──
    function initDB() {
        let users = getUsers();
        const ownerExists = users.some(u => u.username === OWNER_USERNAME && u.role === 'owner');
        if (!ownerExists) {
            const ownerData = {
                id: generateId(),
                name: 'Owner',
                phone: '-',
                username: OWNER_USERNAME,
                password: OWNER_PASSWORD,
                role: 'owner',
                createdAt: Date.now()
            };
            users.push(ownerData);
            saveUsers(users);
            // Sync owner ke Google Sheet
            sheetPost({ action: 'register', ...ownerData });
        }
        // Sync dari Google Sheet ke localStorage saat init
        syncFromSheet();
    }

    // ── Sync: Ambil semua data dari Google Sheet ke localStorage ──
    function syncFromSheet() {
        if (!isSheetConnected()) return;
        fetch(SCRIPT_URL + '?action=getAll')
            .then(r => r.json())
            .then(res => {
                if (res.success && Array.isArray(res.data) && res.data.length > 0) {
                    saveUsers(res.data);
                    // Refresh UI jika owner sedang buka dashboard
                    const session = getSession();
                    if (session && session.role === 'owner') {
                        renderOwnerStats();
                        renderOwnerUsers();
                    }
                }
            })
            .catch(() => {});
    }

    // ── Helper: POST ke Google Sheet ──
    function sheetPost(body) {
        if (!isSheetConnected()) return Promise.resolve(null);
        return fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(body)
        })
        .then(r => r.json())
        .catch(() => null);
    }

    function getUsers() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_USERS)) || [];
        } catch { return []; }
    }

    function saveUsers(users) {
        localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
    }

    function getSession() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_SESSION));
        } catch { return null; }
    }

    function setSession(user) {
        localStorage.setItem(STORAGE_SESSION, JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem(STORAGE_SESSION);
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // ── Toast ──
    function showToast(msg, type) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'toast';
        const bg = type === 'error' ? '#EF4444' : type === 'success' ? '#22C55E' : '#FF6B00';
        toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + bg + ';color:#fff;padding:12px 24px;border-radius:12px;font-family:var(--font);font-size:14px;font-weight:600;z-index:10000;box-shadow:0 4px 16px rgba(0,0,0,.2);animation:fadeInUp .3s ease;max-width:90%;text-align:center;';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // ── URL Routing ──
    const ROUTES = {
        login:  '/login',
        register: '/daftar',
        user:   '/home',
        talent: '/talent',
        cs:     '/cs-panel',
        owner:  '/owner-panel'
    };

    // Reverse lookup: path → pageName
    function pageFromPath(path) {
        const clean = path.replace(/\/+$/, '') || '/';
        for (const [page, route] of Object.entries(ROUTES)) {
            if (clean === route) return page;
        }
        if (clean === '/' || clean === '') return 'login';
        return null;
    }

    // ── Page Navigation ──
    function showPage(pageName, pushState) {
        const pages = document.querySelectorAll('.page');
        pages.forEach(p => p.classList.add('hidden'));

        const target = document.getElementById('page-' + pageName);
        if (target) {
            target.classList.remove('hidden');
        }

        // Update URL (default: push, skip on popstate/initial load)
        if (pushState !== false && ROUTES[pageName]) {
            const newPath = ROUTES[pageName];
            if (window.location.pathname !== newPath) {
                history.pushState({ page: pageName }, '', newPath);
            }
        }

        // Update page title
        const titles = {
            login: 'Login - Jasa Suruh',
            register: 'Daftar - Jasa Suruh',
            user: 'Home - Jasa Suruh',
            talent: 'Talent - Jasa Suruh',
            cs: 'CS Panel - Jasa Suruh',
            owner: 'Owner Panel - Jasa Suruh'
        };
        document.title = titles[pageName] || 'Jasa Suruh (JS)';

        // Scroll to top
        window.scrollTo(0, 0);

        // If navigating to a role page, update the name display
        const session = getSession();
        if (session) {
            updateRoleUI(session);
        }
    }
    // Expose globally for inline onclick
    window.showPage = showPage;

    // Handle browser back/forward
    window.addEventListener('popstate', function (e) {
        if (e.state && e.state.page) {
            showPage(e.state.page, false);
        } else {
            const page = pageFromPath(window.location.pathname);
            if (page) showPage(page, false);
        }
    });

    function updateRoleUI(user) {
        const role = user.role;
        if (role === 'user') {
            const el = document.getElementById('userName');
            if (el) el.textContent = user.name || 'User';
        } else if (role === 'talent') {
            const el = document.getElementById('talentName');
            if (el) el.textContent = user.name || 'Talent';
        } else if (role === 'cs') {
            const el = document.getElementById('csName');
            if (el) el.textContent = user.name || 'CS';
        } else if (role === 'owner') {
            renderOwnerStats();
            renderOwnerUsers();
        }
    }

    // ── Auth: Login ──
    function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            showToast('Lengkapi semua data!', 'error');
            return;
        }

        // Coba login via Google Sheet dulu, fallback ke localStorage
        if (isSheetConnected()) {
            const btn = e.target.querySelector('.btn-primary');
            if (btn) { btn.disabled = true; btn.textContent = 'Memuat...'; }

            fetch(SCRIPT_URL + '?action=login&username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(password))
                .then(r => r.json())
                .then(res => {
                    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
                    if (res.success && res.data) {
                        setSession(res.data);
                        showToast('Selamat datang, ' + res.data.name + '!', 'success');
                        showPage(res.data.role);
                        syncFromSheet();
                    } else {
                        showToast(res.message || 'Username atau password salah!', 'error');
                    }
                })
                .catch(() => {
                    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
                    // Fallback ke localStorage
                    loginLocal(username, password);
                });
        } else {
            loginLocal(username, password);
        }
    }

    function loginLocal(username, password) {
        const users = getUsers();
        const found = users.find(u => u.username === username && u.password === password);
        if (!found) {
            showToast('Username atau password salah!', 'error');
            return;
        }
        setSession(found);
        showToast('Selamat datang, ' + found.name + '!', 'success');
        showPage(found.role);
    }

    // ── Auth: Register ──
    function handleRegister(e) {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value;
        const role = document.getElementById('regRole').value;

        if (!name || !phone || !username || !password) {
            showToast('Lengkapi semua data!', 'error');
            return;
        }
        if (password.length < 6) {
            showToast('Password minimal 6 karakter!', 'error');
            return;
        }

        const users = getUsers();
        if (users.some(u => u.username === username)) {
            showToast('Username sudah digunakan!', 'error');
            return;
        }

        const newUser = {
            id: generateId(),
            name: name,
            phone: phone,
            username: username,
            password: password,
            role: role,
            createdAt: Date.now()
        };
        users.push(newUser);
        saveUsers(users);

        // Simpan ke Google Sheet
        sheetPost({ action: 'register', ...newUser }).then(res => {
            if (res && !res.success) {
                showToast(res.message || 'Gagal simpan ke server', 'error');
            }
        });

        setSession(newUser);
        showToast('Akun berhasil dibuat!', 'success');
        showPage(role);

        // Reset form
        document.getElementById('registerForm').reset();
        document.getElementById('regRole').value = 'user';
    }

    // ── Role Selector (Register) ──
    function setupRoleSelector() {
        const buttons = document.querySelectorAll('.role-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', function () {
                buttons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                document.getElementById('regRole').value = this.dataset.role;
            });
        });
    }

    // ── Toggle Password Visibility ──
    function togglePassword(inputId, btn) {
        const input = document.getElementById(inputId);
        if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        } else {
            input.type = 'password';
            btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>';
        }
    }
    window.togglePassword = togglePassword;

    // ── Logout ──
    function handleLogout() {
        clearSession();
        showToast('Berhasil keluar', 'success');
        showPage('login');
        // Reset forms
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.reset();
    }
    window.handleLogout = handleLogout;

    // ── Owner: Create CS ──
    function handleCreateCS(e) {
        e.preventDefault();
        const name = document.getElementById('csFormName').value.trim();
        const username = document.getElementById('csFormUsername').value.trim();
        const password = document.getElementById('csFormPassword').value;

        if (!name || !username || !password) {
            showToast('Lengkapi semua data!', 'error');
            return;
        }
        if (password.length < 6) {
            showToast('Password minimal 6 karakter!', 'error');
            return;
        }

        const users = getUsers();
        if (users.some(u => u.username === username)) {
            showToast('Username sudah digunakan!', 'error');
            return;
        }

        const csUser = {
            id: generateId(),
            name: name,
            phone: '-',
            username: username,
            password: password,
            role: 'cs',
            createdAt: Date.now()
        };
        users.push(csUser);
        saveUsers(users);

        // Simpan ke Google Sheet
        sheetPost({ action: 'createCS', ...csUser }).then(res => {
            if (res && !res.success) {
                showToast(res.message || 'Gagal simpan ke server', 'error');
            }
        });

        showToast('Akun CS berhasil dibuat!', 'success');

        document.getElementById('createCSForm').reset();
        renderOwnerStats();
        renderOwnerUsers();
    }

    // ── Owner: Render Stats ──
    function renderOwnerStats() {
        const users = getUsers();
        const el = (id) => document.getElementById(id);
        const usersCount = users.filter(u => u.role === 'user').length;
        const talentsCount = users.filter(u => u.role === 'talent').length;
        const csCount = users.filter(u => u.role === 'cs').length;

        if (el('ownerTotalUsers')) el('ownerTotalUsers').textContent = usersCount;
        if (el('ownerTotalTalents')) el('ownerTotalTalents').textContent = talentsCount;
        if (el('ownerTotalCS')) el('ownerTotalCS').textContent = csCount;
        if (el('ownerTotalOrders')) el('ownerTotalOrders').textContent = '0';
    }

    // ── Owner: Render User List ──
    function renderOwnerUsers() {
        const container = document.getElementById('ownerUserList');
        if (!container) return;
        const users = getUsers();

        if (users.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h3>Belum Ada Pengguna</h3><p>Pengguna yang mendaftar akan muncul di sini.</p></div>';
            return;
        }

        const roleColors = { user: '#FF6B00', talent: '#3B82F6', cs: '#22C55E', owner: '#111111' };
        const roleClasses = { user: 'role-user', talent: 'role-talent', cs: 'role-cs', owner: 'role-owner-tag' };
        const roleLabels = { user: 'User', talent: 'Talent', cs: 'CS', owner: 'Owner' };

        container.innerHTML = users.map(u => {
            const initial = (u.name || 'U').charAt(0).toUpperCase();
            const canDelete = u.role !== 'owner';
            const deleteBtn = canDelete
                ? '<button class="btn-delete" data-uid="' + u.id + '" title="Hapus">🗑️</button>'
                : '';
            return '<div class="user-list-item">'
                + '<div class="user-list-avatar" style="background:' + (roleColors[u.role] || '#999') + '">' + initial + '</div>'
                + '<div class="user-list-info">'
                + '<div class="user-list-name">' + escapeHtml(u.name) + ' <small style="color:#999">@' + escapeHtml(u.username) + '</small></div>'
                + '<span class="user-list-role ' + (roleClasses[u.role] || '') + '">' + (roleLabels[u.role] || u.role) + '</span>'
                + '</div>'
                + deleteBtn
                + '</div>';
        }).join('');

        // Attach delete handlers
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', function () {
                const uid = this.dataset.uid;
                let users = getUsers();
                users = users.filter(u => u.id !== uid);
                saveUsers(users);

                // Hapus dari Google Sheet juga
                sheetPost({ action: 'delete', id: uid });

                showToast('Pengguna dihapus', 'success');
                renderOwnerStats();
                renderOwnerUsers();
            });
        });
    }
    window.renderOwnerUsers = renderOwnerUsers;

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ── Talent Online Toggle ──
    function setupTalentToggle() {
        const toggle = document.getElementById('talentOnlineToggle');
        const label = document.getElementById('talentStatusLabel');
        if (!toggle || !label) return;
        toggle.addEventListener('change', function () {
            if (this.checked) {
                label.textContent = 'Online';
                label.classList.add('online');
                showToast('Anda sekarang Online! ✅', 'success');
            } else {
                label.textContent = 'Offline';
                label.classList.remove('online');
                showToast('Anda sekarang Offline', 'error');
            }
        });
    }

    // ── Promo Slider (User Dashboard) ──
    function setupPromoSlider() {
        const track = document.getElementById('promoTrack');
        const dots = document.querySelectorAll('#promoDots .dot');
        if (!track || dots.length === 0) return;

        let current = 0;
        const total = dots.length;
        let startX = 0, isDragging = false;

        function goTo(index) {
            current = ((index % total) + total) % total;
            track.style.transform = 'translateX(-' + (current * 100) + '%)';
            dots.forEach((d, i) => d.classList.toggle('active', i === current));
        }

        // Auto-slide
        let autoSlide = setInterval(() => goTo(current + 1), 4000);

        // Touch swipe
        track.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            isDragging = true;
            clearInterval(autoSlide);
        }, { passive: true });

        track.addEventListener('touchend', e => {
            if (!isDragging) return;
            isDragging = false;
            const diff = startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
                goTo(current + (diff > 0 ? 1 : -1));
            }
            autoSlide = setInterval(() => goTo(current + 1), 4000);
        }, { passive: true });

        dots.forEach((d, i) => d.addEventListener('click', () => {
            clearInterval(autoSlide);
            goTo(i);
            autoSlide = setInterval(() => goTo(current + 1), 4000);
        }));
    }

    // ── Service Item Clicks (User Dashboard) ──
    function setupServiceClicks() {
        document.querySelectorAll('.service-item').forEach(item => {
            item.addEventListener('click', function () {
                const name = this.querySelector('.service-name').textContent;
                showToast('Layanan "' + name + '" segera hadir! 🚀');
            });
        });
    }

    // ── Bottom Nav ──
    function setupBottomNav() {
        document.querySelectorAll('.bottom-nav').forEach(nav => {
            nav.querySelectorAll('.nav-item').forEach(item => {
                item.addEventListener('click', function () {
                    nav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                    this.classList.add('active');
                    const page = this.dataset.page;
                    if (page === 'akun' || page === 'profil' || page === 'settings') {
                        showToast('Halaman ' + this.querySelector('span').textContent + ' segera hadir!');
                    }
                });
            });
        });
    }

    // ── PWA Install ──
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
    });

    // ── Service Worker ──
    function registerSW() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    }

    // ── Splash Screen ──
    function handleSplash() {
        const splash = document.getElementById('splash');
        const app = document.getElementById('app');

        setTimeout(() => {
            splash.classList.add('fade-out');
            app.classList.remove('hidden');

            // Check URL path first
            const urlPage = pageFromPath(window.location.pathname);

            // Check if user already logged in
            const session = getSession();
            if (session) {
                // Verify session still valid
                const users = getUsers();
                const valid = users.find(u => u.id === session.id && u.username === session.username);
                if (valid) {
                    // If URL says login/register but user is logged in, go to their dashboard
                    if (urlPage && urlPage !== 'login' && urlPage !== 'register') {
                        showPage(urlPage);
                    } else {
                        showPage(valid.role);
                    }
                    updateRoleUI(valid);
                    return;
                }
                clearSession();
            }

            // Not logged in
            if (urlPage === 'register') {
                showPage('register');
            } else {
                showPage('login');
            }
        }, 1800);
    }

    // ── Init ──
    function init() {
        initDB();
        handleSplash();
        registerSW();

        // Auth forms
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.addEventListener('submit', handleLogin);

        const registerForm = document.getElementById('registerForm');
        if (registerForm) registerForm.addEventListener('submit', handleRegister);

        const createCSForm = document.getElementById('createCSForm');
        if (createCSForm) createCSForm.addEventListener('submit', handleCreateCS);

        setupRoleSelector();
        setupTalentToggle();
        setupPromoSlider();
        setupServiceClicks();
        setupBottomNav();

        // Logout buttons (avatar clicks as logout for now)
        document.querySelectorAll('.avatar').forEach(av => {
            av.addEventListener('click', () => {
                if (confirm('Keluar dari akun?')) {
                    handleLogout();
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
