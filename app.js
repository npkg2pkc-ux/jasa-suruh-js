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

    // ── Backend: Firebase ──
    function isBackendConnected() {
        return typeof FB !== 'undefined' && FB.isReady();
    }

    // ── Geolocation Helpers ──
    function getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation tidak didukung'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                err => reject(err),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
            );
        });
    }

    function reverseGeocode(lat, lng) {
        return fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=id')
            .then(r => r.json())
            .then(data => {
                if (data && data.display_name) {
                    // Shorten: take city/suburb level
                    var addr = data.address || {};
                    var parts = [addr.suburb || addr.village || addr.neighbourhood || '', addr.city || addr.town || addr.county || '', addr.state || ''].filter(Boolean);
                    return parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(',');
                }
                return 'Lat ' + lat.toFixed(4) + ', Lng ' + lng.toFixed(4);
            })
            .catch(() => 'Lat ' + lat.toFixed(4) + ', Lng ' + lng.toFixed(4));
    }

    function captureLocation(userId) {
        getCurrentPosition().then(pos => {
            reverseGeocode(pos.lat, pos.lng).then(address => {
                // Update session
                var session = getSession();
                if (session && session.id === userId) {
                    session.lat = pos.lat;
                    session.lng = pos.lng;
                    session.address = address;
                    setSession(session);
                    displayUserAddress(session);
                }
                // Update localStorage users
                var users = getUsers();
                var idx = users.findIndex(u => u.id === userId);
                if (idx >= 0) {
                    users[idx].lat = pos.lat;
                    users[idx].lng = pos.lng;
                    users[idx].address = address;
                    saveUsers(users);
                }
                // Sync ke backend Firebase
                backendPost({ action: 'updateLocation', userId: userId, lat: pos.lat, lng: pos.lng, address: address });
            });
        }).catch(() => {
            // Geolocation gagal, tampilkan pesan
            var el = document.getElementById('userAddress') || document.getElementById('talentAddress');
            if (el) el.textContent = '📍 Lokasi tidak tersedia';
        });
    }

    function displayUserAddress(user) {
        if (user.role === 'user') {
            var el = document.getElementById('userAddress');
            if (el) el.textContent = '📍 ' + (user.address || 'Memuat lokasi...');
        } else if (user.role === 'talent') {
            var el = document.getElementById('talentAddress');
            if (el) el.textContent = '📍 ' + (user.address || 'Memuat lokasi...');
        }
    }

    function haversineDistance(lat1, lng1, lat2, lng2) {
        var R = 6371; // km
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
            // Sync owner ke backend Firebase
            backendPost({ action: 'register', ...ownerData });
        }
        // Sync dari backend ke localStorage saat init
        syncFromBackend();
        syncSkillsFromBackend();
    }

    // ── Sync: Ambil semua data dari backend ke localStorage ──
    function syncFromBackend() {
        if (!isBackendConnected()) return;
        FB.get('getAll')
            .then(r => r.json())
            .then(res => {
                if (res.success && Array.isArray(res.data)) {
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

    // ── Helper: POST ke backend Firebase ──
    function backendPost(body) {
        if (!isBackendConnected()) return Promise.resolve(null);
        return FB.post(body).catch(function (err) {
            console.error('Firebase POST error:', err);
            showToast('Gagal terhubung ke server. Cek koneksi internet.', 'error');
            return null;
        });
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
        penjual: '/penjual',
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
            penjual: 'Penjual - Jasa Suruh',
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
        // Start global message listener for chat notifications (all roles)
        startGlobalMessageListener();
        if (role === 'user') {
            const el = document.getElementById('userName');
            if (el) el.textContent = user.name || 'User';
            displayUserAddress(user);
            captureLocation(user.id);
            setupUserNotifBtn(user.id);
        } else if (role === 'talent') {
            const el = document.getElementById('talentName');
            if (el) el.textContent = user.name || 'Talent';
            displayUserAddress(user);
            captureLocation(user.id);
            renderTalentSkills();
            loadTalentDashboardOrders();
            startTalentDashboardPolling();
        } else if (role === 'penjual') {
            const el = document.getElementById('penjualName');
            if (el) el.textContent = user.name || 'Penjual';
            var addrEl = document.getElementById('penjualAddress');
            if (addrEl) addrEl.textContent = '📍 ' + (user.address || 'Memuat lokasi...');
            captureLocation(user.id);
            loadPenjualDashboard();
            startPenjualDashboardPolling();
        } else if (role === 'cs') {
            const el = document.getElementById('csName');
            if (el) el.textContent = user.name || 'CS';
            loadCSDashboard();
        } else if (role === 'owner') {
            renderOwnerStats();
            renderOwnerUsers();
            loadOwnerCommissionSettings();
            loadOwnerRevenue();
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

        // Coba login via backend dulu, fallback ke localStorage
        if (isBackendConnected()) {
            const btn = e.target.querySelector('.btn-primary');
            if (btn) { btn.disabled = true; btn.textContent = 'Memuat...'; }

            FB.get('login', {username: username, password: password})
                .then(r => r.json())
                .then(res => {
                    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
                    if (res.success && res.data) {
                        setSession(res.data);
                        showToast('Selamat datang, ' + res.data.name + '!', 'success');
                        showPage(res.data.role);
                        syncFromBackend();
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

        // Validate selfie for talent
        var selfieDataUrl = '';
        if (role === 'talent') {
            var selfieImg = document.getElementById('regSelfieImg');
            selfieDataUrl = selfieImg ? selfieImg.src : '';
            if (!selfieDataUrl || !selfieDataUrl.startsWith('data:')) {
                showToast('Foto selfie wajib untuk akun Talent!', 'error');
                return;
            }
        }

        const newUser = {
            id: generateId(),
            name: name,
            phone: phone,
            username: username,
            password: password,
            role: role,
            createdAt: Date.now(),
            lat: 0,
            lng: 0,
            address: ''
        };

        // Simpan ke backend Firebase (sumber utama)
        backendPost({ action: 'register', ...newUser }).then(res => {
            if (res && res.success) {
            // Berhasil disimpan di backend, update localStorage juga
                const users = getUsers();
                const savedUser = res.data || newUser;
                users.push(savedUser);
                saveUsers(users);
                setSession(savedUser);
                if (selfieDataUrl) saveProfilePhoto(savedUser.id, selfieDataUrl);
                showToast('Akun berhasil dibuat!', 'success');
                showPage(role);
                document.getElementById('registerForm').reset();
                document.getElementById('regRole').value = 'user';
                // Reset selfie UI
                var selfieImg = document.getElementById('regSelfieImg');
                if (selfieImg) { selfieImg.src = ''; }
                var prev = document.getElementById('regSelfiePreview');
                if (prev) prev.style.display = 'none';
                var btn = document.getElementById('regBtnSelfie');
                if (btn) btn.style.display = '';
                var sec = document.getElementById('regSelfieSection');
                if (sec) sec.style.display = 'none';
            } else if (res && !res.success) {
                showToast(res.message || 'Gagal mendaftar', 'error');
            } else {
                // Fallback: backend tidak tersambung, simpan lokal saja
                const users = getUsers();
                if (users.some(u => u.username === username)) {
                    showToast('Username sudah digunakan!', 'error');
                    return;
                }
                users.push(newUser);
                saveUsers(users);
                setSession(newUser);
                if (selfieDataUrl) saveProfilePhoto(newUser.id, selfieDataUrl);
                showToast('Akun berhasil dibuat (offline)!', 'success');
                showPage(role);
                document.getElementById('registerForm').reset();
                document.getElementById('regRole').value = 'user';
                var sec = document.getElementById('regSelfieSection');
                if (sec) sec.style.display = 'none';
            }
        });
    }

    // ── Role Selector (Register) ──
    function setupRoleSelector() {
        const buttons = document.querySelectorAll('.role-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', function () {
                buttons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                document.getElementById('regRole').value = this.dataset.role;
                // Show selfie section only for talent
                var selfieSection = document.getElementById('regSelfieSection');
                if (selfieSection) selfieSection.style.display = this.dataset.role === 'talent' ? '' : 'none';
            });
        });

        // Wire selfie input buttons
        var regBtnSelfie = document.getElementById('regBtnSelfie');
        var regSelfieInput = document.getElementById('regSelfieInput');
        var regRemoveSelfie = document.getElementById('regRemoveSelfie');
        if (regBtnSelfie) regBtnSelfie.addEventListener('click', function () { regSelfieInput.click(); });
        if (regSelfieInput) {
            regSelfieInput.addEventListener('change', function () {
                var file = this.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function () {
                    document.getElementById('regSelfieImg').src = reader.result;
                    document.getElementById('regSelfiePreview').style.display = '';
                    document.getElementById('regBtnSelfie').style.display = 'none';
                };
                reader.readAsDataURL(file);
                this.value = '';
            });
        }
        if (regRemoveSelfie) {
            regRemoveSelfie.addEventListener('click', function () {
                document.getElementById('regSelfieImg').src = '';
                document.getElementById('regSelfiePreview').style.display = 'none';
                document.getElementById('regBtnSelfie').style.display = '';
            });
        }
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
        // Stop all polling
        if (_talentDashPollTimer) { clearInterval(_talentDashPollTimer); _talentDashPollTimer = null; }
        if (_penjualDashPollTimer) { clearInterval(_penjualDashPollTimer); _penjualDashPollTimer = null; }
        if (_fbTalentOrdersUnsub) { _fbTalentOrdersUnsub(); _fbTalentOrdersUnsub = null; }
        if (_fbPenjualOrdersUnsub) { _fbPenjualOrdersUnsub(); _fbPenjualOrdersUnsub = null; }
        stopPolling();
        _talentLastPendingIds = [];
        _penjualStore = null;
        _penjualProducts = [];
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

        // Simpan ke backend Firebase
        backendPost({ action: 'createCS', ...csUser }).then(res => {
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
        const penjualCount = users.filter(u => u.role === 'penjual').length;
        const csCount = users.filter(u => u.role === 'cs').length;

        if (el('ownerTotalUsers')) el('ownerTotalUsers').textContent = usersCount;
        if (el('ownerTotalTalents')) el('ownerTotalTalents').textContent = talentsCount;
        if (el('ownerTotalPenjual')) el('ownerTotalPenjual').textContent = penjualCount;
        if (el('ownerTotalCS')) el('ownerTotalCS').textContent = csCount;

        // Fetch order count from backend
        if (isBackendConnected()) {
            FB.get('getAllOrders')
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res.success && res.data) {
                        if (el('ownerTotalOrders')) el('ownerTotalOrders').textContent = res.data.length;
                    }
                }).catch(function() {});
        }
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

        const roleColors = { user: '#FF6B00', talent: '#3B82F6', penjual: '#22C55E', cs: '#8B5CF6', owner: '#111111' };
        const roleClasses = { user: 'role-user', talent: 'role-talent', penjual: 'role-penjual', cs: 'role-cs', owner: 'role-owner-tag' };
        const roleLabels = { user: 'User', talent: 'Talent', penjual: 'Penjual', cs: 'CS', owner: 'Owner' };

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

                // Hapus dari backend juga
                backendPost({ action: 'delete', id: uid });

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

    // ── Skills Storage ──
    const STORAGE_SKILLS = 'js_skills';
    const STORAGE_PHOTOS = 'js_skill_photos'; // Photos stored separately in local storage
    const STORAGE_PROFILE_PHOTOS = 'js_profile_photos'; // Talent selfie / profile photos

    function getProfilePhoto(userId) {
        try { var p = JSON.parse(localStorage.getItem(STORAGE_PROFILE_PHOTOS)) || {}; return p[userId] || ''; } catch { return ''; }
    }
    function saveProfilePhoto(userId, dataUrl) {
        try { var p = JSON.parse(localStorage.getItem(STORAGE_PROFILE_PHOTOS)) || {}; p[userId] = dataUrl; localStorage.setItem(STORAGE_PROFILE_PHOTOS, JSON.stringify(p)); } catch {}
    }

    // Skill definitions
    const SKILL_DEFS = [
        { type: 'js_antar', name: 'JS Antar', icon: '🏍️', desc: 'Jasa antar barang & dokumen', hasForm: false },
        { type: 'js_shop', name: 'JS Shop', icon: '🛒', desc: 'Jasa belanja kebutuhan', hasForm: false },
        { type: 'js_food', name: 'JS Food', icon: '🍔', desc: 'Jasa pesan & antar makanan', hasForm: false },
        { type: 'js_delivery', name: 'JS Delivery', icon: '📦', desc: 'Jasa pengiriman paket', hasForm: false },
        { type: 'js_clean', name: 'JS Clean', icon: '🧹', desc: 'Jasa kebersihan rumah & lingkungan', hasForm: true },
        { type: 'js_service', name: 'JS Service', icon: '🔧', desc: 'Jasa perbaikan & servis', hasForm: true },
        { type: 'js_medicine', name: 'JS Medicine', icon: '💊', desc: 'Jasa beli & antar obat', hasForm: false },
        { type: 'js_other', name: 'JS Other', icon: '📌', desc: 'Jasa lainnya', hasForm: false }
    ];

    function getSkills() {
        try { return JSON.parse(localStorage.getItem(STORAGE_SKILLS)) || {}; } catch { return {}; }
    }

    function saveSkills(skills) {
        localStorage.setItem(STORAGE_SKILLS, JSON.stringify(skills));
    }

    function getUserSkills(userId) {
        const all = getSkills();
        return all[userId] || [];
    }

    function setUserSkills(userId, skillArr) {
        const all = getSkills();
        all[userId] = skillArr;
        saveSkills(all);
    }

    // Photo storage untuk cache lokal terpisah dari object skills
    function getSkillPhotos() {
        try { return JSON.parse(localStorage.getItem(STORAGE_PHOTOS)) || {}; } catch { return {}; }
    }
    function saveSkillPhoto(userId, skillType, dataUrl) {
        const photos = getSkillPhotos();
        if (!photos[userId]) photos[userId] = {};
        photos[userId][skillType] = dataUrl;
        localStorage.setItem(STORAGE_PHOTOS, JSON.stringify(photos));
    }
    function getSkillPhoto(userId, skillType) {
        const photos = getSkillPhotos();
        return (photos[userId] && photos[userId][skillType]) || '';
    }
    function removeSkillPhoto(userId, skillType) {
        const photos = getSkillPhotos();
        if (photos[userId]) {
            delete photos[userId][skillType];
            localStorage.setItem(STORAGE_PHOTOS, JSON.stringify(photos));
        }
    }

    // Prepare skills payload untuk backend
    function skillsForBackend(skillArr) {
        return skillArr.map(function (s) {
            var copy = {};
            for (var k in s) { copy[k] = s[k]; }
            return copy;
        });
    }

    // Compress photo ke thumbnail kecil untuk efisiensi penyimpanan
    function compressThumbnail(dataUrl, callback) {
        var img = new Image();
        img.onload = function () {
            var canvas = document.createElement('canvas');
            var maxDim = 200;
            var w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
                var ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', 0.4));
        };
        img.src = dataUrl;
    }

    // ── Talent: Setup Skills Modal ──
    function setupTalentSkills() {
        const btnOpen = document.getElementById('btnOpenSkillModal');
        const modal = document.getElementById('skillModal');
        const btnClose = document.getElementById('btnCloseSkillModal');
        const formModal = document.getElementById('skillFormModal');
        const btnCloseForm = document.getElementById('btnCloseSkillForm');
        const detailForm = document.getElementById('skillDetailForm');
        const priceInput = document.getElementById('sfPrice');
        const feeInfo = document.getElementById('sfFeeInfo');

        if (!btnOpen || !modal) return;

        btnOpen.addEventListener('click', () => openSkillModal());
        btnClose.addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

        if (btnCloseForm) btnCloseForm.addEventListener('click', () => formModal.classList.add('hidden'));
        if (formModal) formModal.addEventListener('click', e => { if (e.target === formModal) formModal.classList.add('hidden'); });

        // Price → fee calculator
        if (priceInput && feeInfo) {
            priceInput.addEventListener('input', function () {
                const price = parseInt(this.value) || 0;
                if (price > 0) {
                    const fee = Math.ceil(price * 0.05);
                    const talent = price - fee;
                    feeInfo.innerHTML = 'Biaya pengembang: <strong>Rp ' + fee.toLocaleString('id-ID') + '</strong> — Anda terima: <strong>Rp ' + talent.toLocaleString('id-ID') + '</strong>';
                } else {
                    feeInfo.innerHTML = '';
                }
            });
        }

        // Photo upload with auto-compress to ~500KB
        const photoInput = document.getElementById('sfPhoto');
        const btnUpload = document.getElementById('sfBtnUpload');
        const photoPreview = document.getElementById('sfPhotoPreview');
        const photoImg = document.getElementById('sfPhotoImg');
        const removePhoto = document.getElementById('sfRemovePhoto');

        function compressImage(file, maxSizeKB, callback) {
            const maxBytes = maxSizeKB * 1024;
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = function () {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                // Scale down if very large
                const maxDim = 1200;
                if (w > maxDim || h > maxDim) {
                    const ratio = Math.min(maxDim / w, maxDim / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                // Try decreasing quality until under maxBytes
                let quality = 0.9;
                let result = canvas.toDataURL('image/jpeg', quality);
                while (result.length > maxBytes * 1.37 && quality > 0.1) {
                    quality -= 0.1;
                    result = canvas.toDataURL('image/jpeg', quality);
                }
                // If still too big, scale down more
                if (result.length > maxBytes * 1.37) {
                    const scale = Math.sqrt((maxBytes * 1.37) / result.length);
                    canvas.width = Math.round(w * scale);
                    canvas.height = Math.round(h * scale);
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    result = canvas.toDataURL('image/jpeg', 0.7);
                }
                callback(result);
            };
            img.src = url;
        }

        if (btnUpload && photoInput) {
            btnUpload.addEventListener('click', () => photoInput.click());
            photoInput.addEventListener('change', function () {
                const file = this.files[0];
                if (!file) return;
                compressImage(file, 500, function (dataUrl) {
                    photoImg.src = dataUrl;
                    photoImg.dataset.newUpload = '1';
                    photoPreview.style.display = 'block';
                    btnUpload.style.display = 'none';
                });
            });
        }
        if (removePhoto) {
            removePhoto.addEventListener('click', () => {
                photoInput.value = '';
                photoImg.src = '';
                photoPreview.style.display = 'none';
                btnUpload.style.display = '';
            });
        }

        // Handle detail form submit (Clean / Service)
        if (detailForm) {
            detailForm.addEventListener('submit', function (e) {
                e.preventDefault();
                const session = getSession();
                if (!session) return;

                const skillType = document.getElementById('skillFormType').value;
                const serviceType = document.getElementById('sfServiceType').value.trim();
                const description = document.getElementById('sfDescription').value.trim();
                const photoData = document.getElementById('sfPhotoImg').src || '';
                const isNewUpload = document.getElementById('sfPhotoImg').dataset.newUpload === '1';
                const price = parseInt(document.getElementById('sfPrice').value) || 0;

                if (!serviceType || !description || price < 1000) {
                    showToast('Lengkapi semua data! Harga minimal Rp 1.000', 'error');
                    return;
                }

                const def = SKILL_DEFS.find(d => d.type === skillType);
                const skills = getUserSkills(session.id);
                const existingSkill = skills.find(s => s.type === skillType);

                function finishSave(photoThumb) {
                    const filtered = skills.filter(s => s.type !== skillType);
                    var skillObj = {
                        type: skillType,
                        name: def ? def.name : skillType,
                        serviceType: serviceType,
                        description: description,
                        price: price
                    };
                    if (photoThumb) skillObj.photo = photoThumb;
                    filtered.push(skillObj);
                    setUserSkills(session.id, filtered);
                    backendPost({ action: 'updateSkills', userId: session.id, skills: skillsForBackend(filtered) });

                    formModal.classList.add('hidden');
                    detailForm.reset();
                    document.getElementById('sfPhotoImg').src = '';
                    document.getElementById('sfPhotoImg').dataset.newUpload = '';
                    document.getElementById('sfPhotoPreview').style.display = 'none';
                    document.getElementById('sfBtnUpload').style.display = '';
                    feeInfo.innerHTML = '';
                    renderTalentSkills();
                    showToast('"' + (def ? def.name : skillType) + '" berhasil ditambahkan!', 'success');
                }

                if (isNewUpload && photoData.startsWith('data:')) {
                    // Compress to small thumbnail and save
                    compressThumbnail(photoData, function (thumb) {
                        finishSave(thumb);
                    });
                } else {
                    // Keep existing photo or no photo
                    var existingPhoto = existingSkill ? (existingSkill.photo || '') : '';
                    finishSave(existingPhoto);
                }
            });
        }

        renderTalentSkills();
    }

    function openSkillModal() {
        const session = getSession();
        if (!session) return;

        const modal = document.getElementById('skillModal');
        const body = document.getElementById('skillModalBody');
        if (!modal || !body) return;

        const skills = getUserSkills(session.id);
        const activeTypes = skills.map(s => s.type);

        body.innerHTML = SKILL_DEFS.map(def => {
            const isActive = activeTypes.includes(def.type);
            let rightHtml;
            if (isActive && def.hasForm) {
                rightHtml = '<button class="btn-skill-edit">✏️ Edit</button><button class="btn-skill-delete">🗑️</button>';
            } else if (isActive) {
                rightHtml = '<span class="skill-status-active">Aktif ✅</span><button class="btn-skill-delete" style="margin-left:8px">🗑️</button>';
            } else {
                rightHtml = def.hasForm ? '<button class="btn-skill-activate btn-form">Isi & Aktifkan</button>' : '<button class="btn-skill-activate">Aktifkan</button>';
            }
            return '<div class="skill-option-card ' + (isActive ? 'active' : '') + '" data-type="' + def.type + '" data-hasform="' + def.hasForm + '">'
                + '<div class="skill-option-left">'
                + '<span class="skill-option-icon">' + def.icon + '</span>'
                + '<div class="skill-option-info">'
                + '<span class="skill-option-name">' + escapeHtml(def.name) + '</span>'
                + '<span class="skill-option-desc">' + escapeHtml(def.desc) + '</span>'
                + '</div>'
                + '</div>'
                + '<div class="skill-option-right">' + rightHtml + '</div>'
                + '</div>';
        }).join('');

        // Attach click handlers
        body.querySelectorAll('.skill-option-card').forEach(card => {
            const type = card.dataset.type;
            const hasForm = card.dataset.hasform === 'true';
            const isActive = activeTypes.includes(type);

            const btnDelete = card.querySelector('.btn-skill-delete');
            const btnEdit = card.querySelector('.btn-skill-edit');
            const btnActivate = card.querySelector('.btn-skill-activate');

            if (btnDelete) {
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('Hapus keahlian ini?')) {
                        removeSkillByType(type);
                        openSkillModal();
                    }
                });
            }
            if (btnEdit) {
                btnEdit.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openSkillForm(type);
                });
            }
            if (btnActivate) {
                btnActivate.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (hasForm) {
                        openSkillForm(type);
                    } else {
                        activateSimpleSkill(type);
                        openSkillModal();
                    }
                });
            }
        });

        modal.classList.remove('hidden');
    }

    function activateSimpleSkill(type) {
        const session = getSession();
        if (!session) return;
        const def = SKILL_DEFS.find(d => d.type === type);
        const skills = getUserSkills(session.id);
        if (skills.some(s => s.type === type)) return;
        skills.push({ type: type, name: def ? def.name : type });
        setUserSkills(session.id, skills);
        backendPost({ action: 'updateSkills', userId: session.id, skills: skillsForBackend(skills) });
        renderTalentSkills();
        showToast('"' + (def ? def.name : type) + '" diaktifkan!', 'success');
    }

    function openSkillForm(type) {
        const def = SKILL_DEFS.find(d => d.type === type);
        const formModal = document.getElementById('skillFormModal');
        const modal = document.getElementById('skillModal');

        document.getElementById('skillFormTitle').textContent = 'Detail ' + (def ? def.name : type);
        document.getElementById('skillFormType').value = type;

        // Pre-fill if editing existing
        const session = getSession();
        if (session) {
            const skills = getUserSkills(session.id);
            const existing = skills.find(s => s.type === type);
            if (existing) {
                document.getElementById('sfServiceType').value = existing.serviceType || '';
                document.getElementById('sfDescription').value = existing.description || '';
                // Restore photo preview from skill data or fallback to localStorage
                const existingPhoto = existing.photo || getSkillPhoto(session.id, type);
                if (existingPhoto) {
                    document.getElementById('sfPhotoImg').src = existingPhoto;
                    document.getElementById('sfPhotoImg').dataset.newUpload = '';
                    document.getElementById('sfPhotoPreview').style.display = 'block';
                    document.getElementById('sfBtnUpload').style.display = 'none';
                } else {
                    document.getElementById('sfPhotoImg').src = '';
                    document.getElementById('sfPhotoImg').dataset.newUpload = '';
                    document.getElementById('sfPhotoPreview').style.display = 'none';
                    document.getElementById('sfBtnUpload').style.display = '';
                }
                document.getElementById('sfPrice').value = existing.price || '';
                document.getElementById('sfPrice').dispatchEvent(new Event('input'));
            } else {
                document.getElementById('skillDetailForm').reset();
                document.getElementById('sfPhotoImg').src = '';
                document.getElementById('sfPhotoPreview').style.display = 'none';
                document.getElementById('sfBtnUpload').style.display = '';
                document.getElementById('sfFeeInfo').innerHTML = '';
            }
        }

        // Set placeholder based on type
        if (type === 'js_clean') {
            document.getElementById('sfServiceType').placeholder = 'cth: Bersihkan Taman, Kamar Mandi, dll';
        } else if (type === 'js_service') {
            document.getElementById('sfServiceType').placeholder = 'cth: Service AC, Elektronik, dll';
        }

        modal.classList.add('hidden');
        formModal.classList.remove('hidden');
    }

    function removeSkillByType(type) {
        const session = getSession();
        if (!session) return;
        const skills = getUserSkills(session.id);
        const filtered = skills.filter(s => s.type !== type);
        setUserSkills(session.id, filtered);
        removeSkillPhoto(session.id, type);
        backendPost({ action: 'updateSkills', userId: session.id, skills: skillsForBackend(filtered) });
        renderTalentSkills();
        showToast('Keahlian dinonaktifkan', 'success');
    }

    function renderTalentSkills() {
        const container = document.getElementById('talentSkillsList');
        if (!container) return;
        const session = getSession();
        if (!session) return;

        const skills = getUserSkills(session.id);
        if (skills.length === 0) {
            container.innerHTML = '<div class="skills-empty">Belum ada keahlian. Klik <strong>+ Tambah</strong> untuk menambahkan!</div>';
            return;
        }

        container.innerHTML = skills.map(s => {
            const def = SKILL_DEFS.find(d => d.type === s.type);
            const icon = def ? def.icon : '📌';
            const hasDetail = s.serviceType || s.description;
            const hasForm = def && def.hasForm;
            let html = '<div class="skill-card">'
                + '<div class="skill-card-header">'
                + '<span class="skill-card-icon">' + icon + '</span>'
                + '<span class="skill-card-name">' + escapeHtml(s.name) + '</span>'
                + '<div class="skill-card-actions">'
                + (hasForm ? '<button class="skill-card-edit" data-type="' + escapeHtml(s.type) + '">✏️</button>' : '')
                + '<button class="skill-card-remove" data-type="' + escapeHtml(s.type) + '">&times;</button>'
                + '</div>'
                + '</div>';
            if (hasDetail) {
                html += '<div class="skill-card-detail">'
                    + '<span class="skill-detail-type">' + escapeHtml(s.serviceType) + '</span>'
                    + (s.price ? '<span class="skill-detail-price">Rp ' + s.price.toLocaleString('id-ID') + '</span>' : '')
                    + '</div>';
            }
            html += '</div>';
            return html;
        }).join('');

        container.querySelectorAll('.skill-card-remove').forEach(btn => {
            btn.addEventListener('click', function () {
                if (confirm('Hapus keahlian ini?')) {
                    removeSkillByType(this.dataset.type);
                }
            });
        });
        container.querySelectorAll('.skill-card-edit').forEach(btn => {
            btn.addEventListener('click', function () {
                openSkillForm(this.dataset.type);
            });
        });
    }

    // ── User: Search Talents by Skill ──
    // ── User Notification Button ──
    function setupUserNotifBtn(userId) {
        var btn = document.getElementById('userNotifBtn');
        if (!btn) return;
        // Wire click to open orders list (only once)
        if (!btn._eventsSetup) {
            btn._eventsSetup = true;
            btn.addEventListener('click', function() { openNotifPopup(); });
        }
        // Update badge with active orders count
        if (isBackendConnected()) {
            FB.get('getOrdersByUser', {userId: userId})
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res.success && Array.isArray(res.data)) {
                        var active = res.data.filter(function(o) {
                            return o.status !== 'completed' && o.status !== 'rated';
                        }).length;
                        var badge = document.getElementById('userHeaderBadge');
                        if (badge) {
                            if (active > 0) {
                                badge.textContent = active > 9 ? '9+' : active;
                                badge.style.display = '';
                            } else {
                                badge.style.display = 'none';
                            }
                        }
                    }
                })
                .catch(function() {});
        }
    }

    function setupUserSearch() {
        const input = document.getElementById('userSearchInput');
        const overlay = document.getElementById('searchResultsOverlay');
        const btnClose = document.getElementById('btnCloseSearch');
        if (!input) return;

        let debounceTimer;
        input.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            const q = this.value.trim();
            if (q.length < 2) {
                if (overlay) overlay.classList.add('hidden');
                return;
            }
            debounceTimer = setTimeout(() => searchTalents(q), 300);
        });

        input.addEventListener('focus', function () {
            if (this.value.trim().length >= 2) searchTalents(this.value.trim());
        });

        if (btnClose) {
            btnClose.addEventListener('click', () => {
                overlay.classList.add('hidden');
                input.value = '';
            });
        }
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) {
                    overlay.classList.add('hidden');
                    input.value = '';
                }
            });
        }
    }

    function searchTalents(query) {
        const overlay = document.getElementById('searchResultsOverlay');
        const container = document.getElementById('searchResults');
        if (!overlay || !container) return;

        const q = query.toLowerCase();
        const users = getUsers();
        const allSkills = getSkills();
        const session = getSession();
        var myLat = session ? (session.lat || 0) : 0;
        var myLng = session ? (session.lng || 0) : 0;

        // Find talents who have matching skills (supports both old string[] and new object[] format)
        const results = users
            .filter(u => u.role === 'talent')
            .map(u => {
                const rawSkills = allSkills[u.id] || [];
                const skillNames = rawSkills.map(s => (typeof s === 'string') ? s : (s.name || s.type || ''));
                const matched = skillNames.filter(s => s.toLowerCase().includes(q));
                var dist = -1;
                if (myLat && myLng && u.lat && u.lng) {
                    dist = haversineDistance(myLat, myLng, u.lat, u.lng);
                }
                return { user: u, skills: skillNames, matched: matched, distance: dist };
            })
            .filter(r => r.matched.length > 0)
            .sort((a, b) => {
                // Sort by distance first (if both have location), then by match count
                if (a.distance >= 0 && b.distance >= 0) return a.distance - b.distance;
                if (a.distance >= 0) return -1;
                if (b.distance >= 0) return 1;
                return b.matched.length - a.matched.length;
            });

        overlay.classList.remove('hidden');

        if (results.length === 0) {
            container.innerHTML = '<div class="search-no-result"><div class="empty-icon">🔍</div><p>Tidak ada talent dengan keahlian "' + escapeHtml(query) + '"</p></div>';
            return;
        }

        container.innerHTML = results.map(r => {
            const initial = (r.user.name || 'T').charAt(0).toUpperCase();
            const skillTags = r.skills.map(s => {
                const isMatch = s.toLowerCase().includes(q);
                return '<span class="search-result-skill' + (isMatch ? ' highlight' : '') + '">' + escapeHtml(s) + '</span>';
            }).join('');
            var distText = '';
            if (r.distance >= 0) {
                distText = '<span class="search-result-distance">📍 ' + (r.distance < 1 ? (r.distance * 1000).toFixed(0) + ' m' : r.distance.toFixed(1) + ' km') + '</span>';
            } else if (r.user.address) {
                distText = '<span class="search-result-distance">📍 ' + escapeHtml(r.user.address) + '</span>';
            }
            return '<div class="search-result-card">'
                + '<div class="search-result-avatar">' + initial + '</div>'
                + '<div class="search-result-info">'
                + '<div class="search-result-name">' + escapeHtml(r.user.name) + '</div>'
                + distText
                + '<div class="search-result-skills">' + skillTags + '</div>'
                + '</div></div>';
        }).join('');
    }

    // Sync skills dari backend
    function syncSkillsFromBackend() {
        if (!isBackendConnected()) return;
        FB.get('getAllSkills')
            .then(r => r.json())
            .then(res => {
                if (res.success && res.data) {
                    saveSkills(res.data);
                }
            })
            .catch(() => {});
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

        // Notification bell click → open notification popup
        var notifBtn = document.getElementById('talentNotifBtn');
        if (notifBtn) {
            notifBtn.addEventListener('click', function () {
                openNotifPopup();
            });
        }
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
    // Map service button names to skill types
    var SERVICE_TYPE_MAP = {
        'JS Antar': 'js_antar', 'JS Shop': 'js_shop', 'JS Food': 'js_food',
        'JS Delivery': 'js_delivery', 'JS Clean': 'js_clean', 'JS Service': 'js_service',
        'JS Medicine': 'js_medicine', 'JS Others': 'js_other'
    };

    // Services that have active talent listing feature
    var ACTIVE_SERVICES = ['js_clean', 'js_antar', 'js_shop', 'js_food', 'js_delivery', 'js_service', 'js_medicine', 'js_other'];

    function setupServiceClicks() {
        // Services that open store listing (product marketplace)
        var STORE_SERVICES = { 'JS Food': 'food', 'JS Shop': 'shop', 'JS Medicine': 'medicine' };

        document.querySelectorAll('.service-item').forEach(item => {
            item.addEventListener('click', function () {
                var name = this.querySelector('.service-name').textContent;
                // JS Antar → dedicated ride booking page
                if (name === 'JS Antar') {
                    openJSAntarPage();
                    return;
                }
                // Check if it's a store-based service first
                if (STORE_SERVICES[name]) {
                    openStoreListPage(STORE_SERVICES[name]);
                    return;
                }
                var skillType = SERVICE_TYPE_MAP[name];
                if (skillType && ACTIVE_SERVICES.indexOf(skillType) >= 0) {
                    openServiceTalentPage(skillType);
                } else {
                    showToast('Layanan "' + name + '" segera hadir! 🚀');
                }
            });
        });
    }

    // ── Service Talent Page (Fullscreen, Shopee Food Style) ──
    var _stpCurrentType = '';
    var _stpAllTalents = [];
    var _stpCurrentSort = 'nearest';
    var _talentRatingsCache = {};
    var _currentOrder = null;
    var _chatPollTimer = null;
    var _locationPollTimer = null;
    var _otpMap = null;
    var _otpTalentMarker = null;
    var _otpUserMarker = null;
    var _otpRouteLine = null;
    var _talentDashPollTimer = null;
    var _talentLastPendingIds = [];
    var _fbOrderUnsub = null;
    var _fbLocUnsub = null;
    var _fbMsgUnsub = null;
    var _fbTalentOrdersUnsub = null;
    var _fbPenjualOrdersUnsub = null;

    function openServiceTalentPage(skillType) {
        var page = document.getElementById('serviceTalentPage');
        if (!page) return;

        _stpCurrentType = skillType;
        _stpCurrentSort = 'nearest';
        var def = SKILL_DEFS.find(function (d) { return d.type === skillType; });

        var titleEl = document.getElementById('stpTitle');
        var subtitleEl = document.getElementById('stpSubtitle');
        if (titleEl) titleEl.textContent = def ? def.icon + ' ' + def.name : 'Talent Tersedia';
        if (subtitleEl) subtitleEl.textContent = def ? def.desc : 'Temukan jasa terdekat';

        // Reset search & sort
        var searchInput = document.getElementById('stpSearchInput');
        if (searchInput) searchInput.value = '';
        page.querySelectorAll('.stp-sort-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.sort === 'nearest');
        });

        // Build talent data
        _stpAllTalents = buildTalentList(skillType);
        renderTalentCards(_stpAllTalents);

        // Fetch live ratings and update spans in-place
        _stpAllTalents.forEach(function (t) {
            fetchTalentRating(t.user.id, function (r) {
                t.rating = r;
                var el = document.getElementById('stcRating-' + t.user.id);
                if (el) el.innerHTML = '<span class="stc-rating-star">⭐</span> '
                    + (r.avg > 0 ? r.avg.toFixed(1) + ' <small class="stc-rating-count">(' + r.count + ')</small>' : 'Baru');
            });
        });

        page.classList.remove('hidden');

        // Setup events (only once)
        if (!page._eventsSetup) {
            page._eventsSetup = true;

            document.getElementById('stpBtnBack').addEventListener('click', function () {
                page.classList.add('hidden');
            });

            searchInput.addEventListener('input', function () {
                filterAndRender();
            });

            page.querySelectorAll('.stp-sort-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    page.querySelectorAll('.stp-sort-btn').forEach(function (b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    _stpCurrentSort = btn.dataset.sort;
                    filterAndRender();
                });
            });
        }
    }

    function buildTalentList(skillType) {
        var session = getSession();
        var myLat = session ? (session.lat || 0) : 0;
        var myLng = session ? (session.lng || 0) : 0;
        var users = getUsers();
        var allSkills = getSkills();
        var cachedRatings = _talentRatingsCache || {};

        return users
            .filter(function (u) { return u.role === 'talent'; })
            .map(function (u) {
                var rawSkills = allSkills[u.id] || [];
                var skill = rawSkills.find(function (s) {
                    return (typeof s === 'string') ? false : (s.type === skillType);
                });
                if (!skill) return null;
                var dist = -1;
                if (myLat && myLng && u.lat && u.lng) {
                    dist = haversineDistance(myLat, myLng, u.lat, u.lng);
                }
                // Get photo from skill data or fallback to localStorage
                var photo = skill.photo || getSkillPhoto(u.id, skillType);
                var rating = cachedRatings[u.id] || { avg: 0, count: 0 };
                return { user: u, skill: skill, distance: dist, photo: photo, rating: rating };
            })
            .filter(function (r) { return r !== null; });
    }

    function filterAndRender() {
        var q = (document.getElementById('stpSearchInput').value || '').trim().toLowerCase();
        var filtered = _stpAllTalents;
        if (q.length > 0) {
            filtered = filtered.filter(function (t) {
                var name = (t.user.name || '').toLowerCase();
                var svc = (t.skill.serviceType || '').toLowerCase();
                var desc = (t.skill.description || '').toLowerCase();
                return name.indexOf(q) >= 0 || svc.indexOf(q) >= 0 || desc.indexOf(q) >= 0;
            });
        }
        // Sort
        filtered = filtered.slice().sort(function (a, b) {
            if (_stpCurrentSort === 'nearest') {
                if (a.distance >= 0 && b.distance >= 0) return a.distance - b.distance;
                if (a.distance >= 0) return -1;
                if (b.distance >= 0) return 1;
                return 0;
            } else if (_stpCurrentSort === 'cheapest') {
                var pa = Number(a.skill.price) || 999999999;
                var pb = Number(b.skill.price) || 999999999;
                return pa - pb;
            } else {
                return (a.user.name || '').localeCompare(b.user.name || '');
            }
        });
        renderTalentCards(filtered);
    }

    function renderTalentCards(talents) {
        var list = document.getElementById('stpList');
        var countEl = document.getElementById('stpCount');
        if (!list) return;

        if (countEl) {
            countEl.textContent = talents.length > 0 ? talents.length + ' jasa tersedia' : '';
        }

        if (talents.length === 0) {
            list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">🔍</div><h3>Tidak Ditemukan</h3><p>Belum ada talent yang menawarkan layanan ini di sekitar Anda.</p></div>';
            return;
        }

        list.innerHTML = talents.map(function (t, idx) {
            var distText = '';
            if (t.distance >= 0) {
                distText = t.distance < 1 ? (t.distance * 1000).toFixed(0) + ' m' : t.distance.toFixed(1) + ' km';
            }
            var priceText = t.skill.price ? 'Rp ' + Number(t.skill.price).toLocaleString('id-ID') : '';
            var serviceType = t.skill.serviceType || '';
            var desc = t.skill.description || '';
            var addr = t.user.address || '';
            var photo = t.photo;
            var profilePhoto = getProfilePhoto(t.user.id);

            var imgHtml = photo
                ? '<img src="' + photo + '" alt="' + escapeHtml(serviceType) + '">'
                : '<div class="stc-img-placeholder">🧹</div>';

            var talentAvatarHtml = profilePhoto
                ? '<div class="stc-talent-badge"><img src="' + profilePhoto + '" alt="' + escapeHtml(t.user.name) + '"><span class="stc-verified-dot">✓</span></div>'
                : '';

            return '<div class="stc" data-idx="' + idx + '">'
                + '<div class="stc-img">'
                + imgHtml
                + (distText ? '<span class="stc-dist-badge">📍 ' + distText + '</span>' : '')
                + talentAvatarHtml
                + '</div>'
                + '<div class="stc-body">'
                + '<div class="stc-name">' + escapeHtml(t.user.name) + '</div>'
                + (serviceType ? '<div class="stc-service">' + escapeHtml(serviceType) + '</div>' : '')
                + (desc ? '<div class="stc-desc">' + escapeHtml(desc) + '</div>' : '')
                + '<div class="stc-bottom">'
                + (priceText ? '<span class="stc-price">' + priceText + '</span>' : '')
                + '<span class="stc-rating" id="stcRating-' + t.user.id + '"><span class="stc-rating-star">⭐</span> ' + (t.rating && t.rating.avg > 0 ? t.rating.avg.toFixed(1) + ' <small class="stc-rating-count">(' + t.rating.count + ')</small>' : 'Baru') + '</span>'
                + '</div>'
                + (addr && !distText ? '<div class="stc-addr">📍 ' + escapeHtml(addr) + '</div>' : '')
                + '</div>'
                + '</div>';
        }).join('');

        // Click to open detail
        list.querySelectorAll('.stc').forEach(function (card) {
            card.addEventListener('click', function () {
                var idx = parseInt(this.dataset.idx, 10);
                if (talents[idx]) openTalentDetail(talents[idx]);
            });
        });
    }

    function openTalentDetail(t) {
        var page = document.getElementById('talentDetailPage');
        var content = document.getElementById('tdpContent');
        var titleEl = document.getElementById('tdpTitle');
        if (!page || !content) return;

        if (titleEl) titleEl.textContent = t.user.name;

        var photo = t.photo;
        var profilePhoto = getProfilePhoto(t.user.id);
        var heroHtml = photo
            ? '<img src="' + photo + '" alt="">'
            : '<div class="tdp-hero-placeholder">🧹</div>';

        var distText = '';
        if (t.distance >= 0) {
            distText = t.distance < 1 ? (t.distance * 1000).toFixed(0) + ' m' : t.distance.toFixed(1) + ' km';
        }
        var priceText = t.skill.price ? 'Rp ' + Number(t.skill.price).toLocaleString('id-ID') : 'Hubungi untuk harga';
        var serviceType = t.skill.serviceType || '';
        var desc = t.skill.description || 'Tidak ada deskripsi.';
        var addr = t.user.address || 'Lokasi tidak tersedia';
        var initial = (t.user.name || 'T').charAt(0).toUpperCase();

        var talentAvatarHtml = profilePhoto
            ? '<div class="tdp-talent-avatar has-photo"><img src="' + profilePhoto + '" alt="' + escapeHtml(t.user.name) + '"><span class="tdp-verified-badge">✓ Terverifikasi</span></div>'
            : '<div class="tdp-talent-avatar">' + initial + '</div>';

        content.innerHTML = ''
            + '<div class="tdp-hero">' + heroHtml + '</div>'
            + '<div class="tdp-info">'
            + '<div class="tdp-name">' + escapeHtml(t.user.name) + '</div>'
            + (serviceType ? '<div class="tdp-service-type">' + escapeHtml(serviceType) + '</div>' : '')
            + '<div class="tdp-meta-row">'
            + '<span class="tdp-meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/></svg> ' + escapeHtml(addr) + '</span>'
            + (distText ? '<span class="tdp-meta-item">📍 ' + distText + '</span>' : '')
            + '<span class="tdp-meta-item">⭐ <span id="tdpRating">-</span></span>'
            + '</div>'
            + '<div class="tdp-price-row">'
            + '<div class="tdp-price-label">Mulai dari</div>'
            + '<div class="tdp-price-value">' + priceText + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="tdp-section">'
            + '<div class="tdp-section-title">Deskripsi Layanan</div>'
            + '<div class="tdp-desc-text">' + escapeHtml(desc) + '</div>'
            + '</div>'
            + '<div class="tdp-section">'
            + '<div class="tdp-section-title">Tentang Talent</div>'
            + '<div class="tdp-talent-card">'
            + talentAvatarHtml
            + '<div class="tdp-talent-info">'
            + '<div class="tdp-talent-name">' + escapeHtml(t.user.name) + '</div>'
            + '<div class="tdp-talent-addr">📍 ' + escapeHtml(addr) + '</div>'
            + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="tdp-spacer"></div>';

        page.classList.remove('hidden');

        // Fetch real rating
        fetchTalentRating(t.user.id, function(r) {
            var el = document.getElementById('tdpRating');
            if (el) el.textContent = r.avg > 0 ? r.avg.toFixed(1) + ' (' + r.count + ')' : 'Belum ada rating';
        });

        // Setup events (only once)
        if (!page._eventsSetup) {
            page._eventsSetup = true;
            document.getElementById('tdpBtnBack').addEventListener('click', function () {
                page.classList.add('hidden');
            });
        }
        // Order button - always rebind with current talent data
        var orderBtn = document.getElementById('tdpBtnOrder');
        var newBtn = orderBtn.cloneNode(true);
        orderBtn.parentNode.replaceChild(newBtn, orderBtn);
        newBtn.addEventListener('click', function () {
            createNewOrder(t);
        });
    }

    // ══════════════════════════════════════════
    // ═══ FETCH TALENT RATING ═══
    // ══════════════════════════════════════════
    function fetchTalentRating(talentId, callback) {
        if (!isBackendConnected()) { callback({ avg: 0, count: 0 }); return; }
        FB.get('getTalentRating', {talentId: talentId})
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    _talentRatingsCache[talentId] = res.data;
                    callback(res.data);
                } else { callback({ avg: 0, count: 0 }); }
            })
            .catch(function () { callback({ avg: 0, count: 0 }); });
    }

    // ══════════════════════════════════════════
    // ═══ CREATE NEW ORDER ═══
    // ══════════════════════════════════════════
    function createNewOrder(t) {
        var session = getSession();
        if (!session) { showToast('Silakan login terlebih dahulu', 'error'); return; }
        if (session.role !== 'user') { showToast('Hanya user yang bisa memesan', 'error'); return; }

        var price = Number(t.skill.price) || 0;
        var fee = Math.round(price * 0.1);
        var orderId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);

        var orderData = {
            action: 'createOrder',
            id: orderId,
            userId: session.id,
            talentId: t.user.id,
            skillType: t.skill.type || '',
            serviceType: t.skill.serviceType || t.skill.name || '',
            description: t.skill.description || '',
            price: price,
            fee: fee,
            userLat: session.lat || 0,
            userLng: session.lng || 0,
            userAddr: session.address || '',
            talentLat: t.user.lat || 0,
            talentLng: t.user.lng || 0
        };

        showToast('Membuat pesanan...', 'success');

        backendPost(orderData).then(function (res) {
            if (res && res.success) {
                var order = res.data || orderData;
                order.status = 'pending';
                order.createdAt = Date.now();
                order.talentName = t.user.name;
                order.userName = session.name;
                showToast('Pesanan berhasil dibuat!', 'success');
                // Close detail page and open tracking
                document.getElementById('talentDetailPage').classList.add('hidden');
                document.getElementById('serviceTalentPage').classList.add('hidden');
                openOrderTracking(order);
            } else {
                showToast('Gagal membuat pesanan: ' + ((res && res.message) || 'Error'), 'error');
            }
        }).catch(function () {
            showToast('Gagal membuat pesanan', 'error');
        });
    }

    // ══════════════════════════════════════════
    // ═══ ORDER TRACKING PAGE ═══
    // ══════════════════════════════════════════
    var STATUS_LABELS = {
        pending: 'Menunggu Konfirmasi',
        accepted: 'Diterima',
        on_the_way: 'Dalam Perjalanan',
        arrived: 'Sudah Tiba',
        in_progress: 'Sedang Dikerjakan',
        completed: 'Selesai',
        rated: 'Sudah Dinilai'
    };

    function openOrderTracking(order) {
        _currentOrder = order;
        var page = document.getElementById('orderTrackingPage');
        if (!page) return;

        var session = getSession();
        var isTalent = session && session.id === order.talentId;
        var isUser = session && session.id === order.userId;

        // Title & status
        document.getElementById('otpTitle').textContent = order.serviceType || 'Pesanan';
        updateOrderStatusBadge(order.status);

        // Info panel
        renderOrderInfo(order, isTalent);

        // Actions
        renderOrderActions(order, isTalent, isUser);

        // Initialize map
        initTrackingMap(order);

        page.classList.remove('hidden');

        // Setup events once
        if (!page._eventsSetup) {
            page._eventsSetup = true;
            document.getElementById('otpBtnBack').addEventListener('click', function () {
                page.classList.add('hidden');
                stopPolling();
            });
            document.getElementById('otpChatFab').addEventListener('click', function () {
                if (_currentOrder) openChat(_currentOrder);
            });
        }

        // Start polling for order updates and talent location
        startOrderPolling(order.id);
    }

    function updateOrderStatusBadge(status) {
        var badge = document.getElementById('otpStatus');
        if (!badge) return;
        badge.textContent = STATUS_LABELS[status] || status;
        badge.className = 'otp-status-badge status-' + status;
    }

    function renderOrderInfo(order, isTalent) {
        var el = document.getElementById('otpInfoContent');
        if (!el) return;
        var users = getUsers();
        var other = users.find(function (u) {
            return u.id === (isTalent ? order.userId : order.talentId);
        });
        var otherName = other ? other.name : 'Unknown';
        var priceText = order.price ? 'Rp ' + Number(order.price).toLocaleString('id-ID') : '-';
        var feeText = order.fee ? 'Rp ' + Number(order.fee).toLocaleString('id-ID') : '-';
        var addrText = order.userAddr || 'Tidak tersedia';
        var isAntar = order.skillType === 'js_antar';

        el.innerHTML = ''
            + '<div class="otp-info-row"><span class="otp-info-label">' + (isTalent ? 'Pelanggan' : 'Driver') + '</span><span class="otp-info-val">' + escapeHtml(otherName) + '</span></div>'
            + '<div class="otp-info-row"><span class="otp-info-label">Layanan</span><span class="otp-info-val">' + escapeHtml(order.serviceType || '') + '</span></div>'
            + (isAntar ? '<div class="otp-info-row"><span class="otp-info-label">📍 Jemput</span><span class="otp-info-val">' + escapeHtml(addrText) + '</span></div>' : '<div class="otp-info-row"><span class="otp-info-label">Alamat</span><span class="otp-info-val">' + escapeHtml(addrText) + '</span></div>')
            + (isAntar && order.destAddr ? '<div class="otp-info-row"><span class="otp-info-label">🏁 Tujuan</span><span class="otp-info-val">' + escapeHtml(String(order.destAddr)) + '</span></div>' : '')
            + (isAntar && order.distanceKm ? '<div class="otp-info-row"><span class="otp-info-label">Jarak</span><span class="otp-info-val">' + Number(order.distanceKm).toFixed(1) + ' km</span></div>' : '')
            + '<div class="otp-info-row"><span class="otp-info-label">Harga</span><span class="otp-info-val">' + priceText + '</span></div>'
            + '<div class="otp-info-row"><span class="otp-info-label">Biaya Layanan</span><span class="otp-info-val">' + feeText + '</span></div>'
            + (order.proofPhoto ? '<div class="otp-proof"><img src="' + order.proofPhoto + '" alt="Bukti"></div>' : '');
    }

    function renderOrderActions(order, isTalent, isUser) {
        var el = document.getElementById('otpActions');
        if (!el) return;
        el.innerHTML = '';

        if (isTalent) {
            if (order.status === 'pending') {
                el.innerHTML = '<button class="otp-btn otp-btn-accept" id="otpBtnAccept">✅ Terima Pesanan</button>';
                document.getElementById('otpBtnAccept').addEventListener('click', function () { updateOrderStatus(order.id, 'accepted', { acceptedAt: Date.now() }); });
            } else if (order.status === 'accepted') {
                el.innerHTML = '<button class="otp-btn otp-btn-otw" id="otpBtnOtw">🏍️ Menuju Lokasi</button>';
                document.getElementById('otpBtnOtw').addEventListener('click', function () { updateOrderStatus(order.id, 'on_the_way', {}); startTalentLocationBroadcast(order.id); });
            } else if (order.status === 'on_the_way') {
                el.innerHTML = '<button class="otp-btn otp-btn-arrive" id="otpBtnArrive">📍 Sudah Tiba</button>';
                document.getElementById('otpBtnArrive').addEventListener('click', function () { updateOrderStatus(order.id, 'arrived', {}); });
            } else if (order.status === 'arrived') {
                el.innerHTML = '<button class="otp-btn otp-btn-start" id="otpBtnStart">🔨 Mulai Mengerjakan</button>';
                document.getElementById('otpBtnStart').addEventListener('click', function () { updateOrderStatus(order.id, 'in_progress', { startedAt: Date.now() }); });
            } else if (order.status === 'in_progress') {
                el.innerHTML = '<button class="otp-btn otp-btn-complete" id="otpBtnComplete">✅ Selesai + Upload Bukti</button><input type="file" id="otpProofInput" accept="image/*" capture="environment" style="display:none">';
                document.getElementById('otpBtnComplete').addEventListener('click', function () {
                    document.getElementById('otpProofInput').click();
                });
                document.getElementById('otpProofInput').addEventListener('change', function () {
                    var file = this.files[0];
                    if (!file) return;
                    var reader = new FileReader();
                    reader.onload = function () {
                        compressThumbnail(reader.result, function (proofThumb) {
                            updateOrderStatus(order.id, 'completed', { completedAt: Date.now(), proofPhoto: proofThumb });
                        });
                    };
                    reader.readAsDataURL(file);
                    this.value = '';
                });
            }
        }

        if (isUser && order.status === 'completed') {
            el.innerHTML = '<button class="otp-btn otp-btn-rate" id="otpBtnRate">⭐ Beri Rating</button>';
            document.getElementById('otpBtnRate').addEventListener('click', function () { openRatingPage(order); });
        }
    }

    function updateOrderStatus(orderId, newStatus, extraFields) {
        var fields = extraFields || {};
        fields.status = newStatus;
        backendPost({ action: 'updateOrder', orderId: orderId, fields: fields }).then(function (res) {
            if (res && res.success) {
                if (_currentOrder && _currentOrder.id === orderId) {
                    _currentOrder.status = newStatus;
                    for (var k in extraFields) _currentOrder[k] = extraFields[k];
                    updateOrderStatusBadge(newStatus);
                    var session = getSession();
                    renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
                    renderOrderInfo(_currentOrder, session && session.id === _currentOrder.talentId);
                }
                showToast('Status diperbarui!', 'success');
            } else {
                showToast('Gagal update status', 'error');
            }
        });
    }

    // ══════════════════════════════════════════
    // ═══ MAP TRACKING (Leaflet + OSRM) ═══
    // ══════════════════════════════════════════
    function initTrackingMap(order) {
        var container = document.getElementById('otpMapContainer');
        if (!container) return;

        // Destroy previous map
        if (_otpMap) { _otpMap.remove(); _otpMap = null; }

        var userLat = Number(order.userLat) || -6.2;
        var userLng = Number(order.userLng) || 106.8;
        var talentLat = Number(order.talentLat) || userLat;
        var talentLng = Number(order.talentLng) || userLng;
        var isAntar = order.skillType === 'js_antar';
        var destLat = isAntar && order.destLat ? Number(order.destLat) : null;
        var destLng = isAntar && order.destLng ? Number(order.destLng) : null;

        // Center between user and talent
        var centerLat = (userLat + talentLat) / 2;
        var centerLng = (userLng + talentLng) / 2;

        _otpMap = L.map(container).setView([centerLat, centerLng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(_otpMap);

        // Pickup/User marker (green for antar, blue otherwise)
        var userIcon = L.divIcon({
            html: '<div style="background:' + (isAntar ? '#22C55E' : '#2196F3') + ';color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">' + (isAntar ? '🟢' : '📍') + '</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            className: ''
        });
        _otpUserMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(_otpMap).bindPopup(isAntar ? 'Titik Jemput' : 'Lokasi Anda');

        // Talent marker (orange motorbike)
        var talentIcon = L.divIcon({
            html: '<div style="background:#FF6B00;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">🏍️</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            className: ''
        });
        _otpTalentMarker = L.marker([talentLat, talentLng], { icon: talentIcon }).addTo(_otpMap).bindPopup('Driver');

        // Destination marker for JS Antar
        var points = [[userLat, userLng], [talentLat, talentLng]];
        if (isAntar && destLat && destLng) {
            var destIcon = L.divIcon({
                html: '<div style="background:#EF4444;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">🏁</div>',
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                className: ''
            });
            L.marker([destLat, destLng], { icon: destIcon }).addTo(_otpMap).bindPopup('Tujuan: ' + escapeHtml(String(order.destAddr || '')));
            points.push([destLat, destLng]);
        }

        // Fit bounds to all markers
        var bounds = L.latLngBounds(points);
        _otpMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });

        // Draw route: for antar draw talent→pickup→destination
        if (isAntar && destLat && destLng) {
            fetchAndDrawRoute(talentLat, talentLng, userLat, userLng);
        } else {
            fetchAndDrawRoute(talentLat, talentLng, userLat, userLng);
        }

        // Fix map size on display
        setTimeout(function () { if (_otpMap) _otpMap.invalidateSize(); }, 300);
    }

    function fetchAndDrawRoute(fromLat, fromLng, toLat, toLng) {
        if (!_otpMap) return;
        var url = 'https://router.project-osrm.org/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=full&geometries=geojson';

        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.routes && data.routes.length > 0) {
                    var coords = data.routes[0].geometry.coordinates.map(function (c) {
                        return [c[1], c[0]]; // GeoJSON is [lng, lat], Leaflet needs [lat, lng]
                    });
                    if (_otpRouteLine) _otpMap.removeLayer(_otpRouteLine);
                    _otpRouteLine = L.polyline(coords, { color: '#FF6B00', weight: 4, opacity: 0.8 }).addTo(_otpMap);
                }
            })
            .catch(function () {
                // Fallback: draw straight line
                if (_otpRouteLine) _otpMap.removeLayer(_otpRouteLine);
                _otpRouteLine = L.polyline([[fromLat, fromLng], [toLat, toLng]], { color: '#FF6B00', weight: 3, dashArray: '10,10' }).addTo(_otpMap);
            });
    }

    function updateTalentMarkerPosition(lat, lng) {
        if (_otpTalentMarker) {
            _otpTalentMarker.setLatLng([lat, lng]);
        }
        // Redraw route from new talent position to user
        if (_currentOrder) {
            fetchAndDrawRoute(lat, lng, Number(_currentOrder.userLat), Number(_currentOrder.userLng));
        }
    }

    // ══════════════════════════════════════════
    // ═══ POLLING (Order status + Location) ═══
    // ══════════════════════════════════════════
    function startOrderPolling(orderId) {
        stopPolling();
        if (typeof FB !== 'undefined' && FB.isReady()) {
            // Gunakan Firebase realtime listener (menggantikan polling)
            _fbOrderUnsub = FB.onOrder(orderId, function (order) {
                if (!order || !_currentOrder || _currentOrder.id !== orderId) return;
                var oldStatus = _currentOrder.status;
                for (var key in order) { _currentOrder[key] = order[key]; }
                if (oldStatus !== order.status) {
                    updateOrderStatusBadge(order.status);
                    var session = getSession();
                    renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
                    renderOrderInfo(_currentOrder, session && session.id === _currentOrder.talentId);
                }
            });
            // Listener lokasi talent dari RTDB
            _fbLocUnsub = FB.onTalentLocation(orderId, function (loc) {
                if (loc && loc.lat && loc.lng) {
                    updateTalentMarkerPosition(Number(loc.lat), Number(loc.lng));
                }
                // Juga cek update talentLat/talentLng dari Firestore
                if (loc && _currentOrder) {
                    _currentOrder.talentLat = loc.lat;
                    _currentOrder.talentLng = loc.lng;
                }
            });
        } else {
            // Fallback ke polling jika Firebase tidak tersedia
            pollOrderUpdate(orderId);
            _locationPollTimer = setInterval(function () { pollOrderUpdate(orderId); }, 8000);
        }
    }

    function stopPolling() {
        if (_locationPollTimer) { clearInterval(_locationPollTimer); _locationPollTimer = null; }
        if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
        if (_fbOrderUnsub) { _fbOrderUnsub(); _fbOrderUnsub = null; }
        if (_fbLocUnsub) { _fbLocUnsub(); _fbLocUnsub = null; }
        if (_fbMsgUnsub) { _fbMsgUnsub(); _fbMsgUnsub = null; }
    }

    function pollOrderUpdate(orderId) {
        if (!isBackendConnected()) return;
        FB.get('getOrdersByUser', {userId: getSession().id})
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    var order = res.data.find(function (o) { return o.id === orderId; });
                    if (order && _currentOrder && _currentOrder.id === orderId) {
                        var oldStatus = _currentOrder.status;
                        // Update current order with latest data
                        for (var key in order) _currentOrder[key] = order[key];

                        if (oldStatus !== order.status) {
                            updateOrderStatusBadge(order.status);
                            var session = getSession();
                            renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
                            renderOrderInfo(_currentOrder, session && session.id === _currentOrder.talentId);
                        }

                        // Update talent marker
                        if (order.talentLat && order.talentLng) {
                            updateTalentMarkerPosition(Number(order.talentLat), Number(order.talentLng));
                        }
                    }
                }
            })
            .catch(function () {});
    }

    function startTalentLocationBroadcast(orderId) {
        function broadcast() {
            getCurrentPosition().then(function (pos) {
                backendPost({
                    action: 'updateTalentLocation',
                    orderId: orderId,
                    lat: pos.lat,
                    lng: pos.lng
                });
            }).catch(function () {});
        }
        broadcast();
        if (!_locationPollTimer) {
            _locationPollTimer = setInterval(broadcast, 10000);
        }
    }

    // ══════════════════════════════════════════
    // ═══ CHAT SYSTEM ═══
    // ══════════════════════════════════════════
    var _chatOrderId = null;
    var _chatMessages = [];

    function openChat(order) {
        _chatOrderId = order.id;
        _chatMessages = [];
        _chatPageOpen = true;
        clearChatBadge();
        var page = document.getElementById('chatPage');
        if (!page) return;

        var session = getSession();
        var users = getUsers();
        var isTalent = session && session.id === order.talentId;
        var other = users.find(function (u) { return u.id === (isTalent ? order.userId : order.talentId); });
        document.getElementById('chatTitle').textContent = other ? other.name : 'Chat';
        document.getElementById('chatSubtitle').textContent = order.serviceType || '';
        document.getElementById('chatMessages').innerHTML = '<div class="chat-system">Chat pesanan #' + order.id.substr(0, 8) + '</div>';
        document.getElementById('chatInput').value = '';

        page.classList.remove('hidden');

        // Start realtime listener (menggantikan chat polling)
        if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
        if (_fbMsgUnsub) { _fbMsgUnsub(); _fbMsgUnsub = null; }
        if (typeof FB !== 'undefined' && FB.isReady()) {
            _fbMsgUnsub = FB.onMessages(order.id, function (res) {
                if (res.success && res.data) {
                    _chatMessages = res.data;
                    renderChatMessages();
                }
            });
        } else {
            fetchChatMessages(order.id);
            _chatPollTimer = setInterval(function () { fetchChatMessages(order.id); }, 5000);
        }

        // Setup events once
        if (!page._eventsSetup) {
            page._eventsSetup = true;
            document.getElementById('chatBtnBack').addEventListener('click', function () {
                page.classList.add('hidden');
                _chatPageOpen = false;
                if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
                if (_fbMsgUnsub) { _fbMsgUnsub(); _fbMsgUnsub = null; }
            });
            document.getElementById('chatBtnSend').addEventListener('click', function () { sendChatMessage(); });
            document.getElementById('chatInput').addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
            });
            document.getElementById('chatBtnPhoto').addEventListener('click', function () {
                document.getElementById('chatPhotoInput').click();
            });
            document.getElementById('chatPhotoInput').addEventListener('change', function () {
                var file = this.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function () {
                    compressThumbnail(reader.result, function (thumb) {
                        sendChatMessage(thumb);
                    });
                };
                reader.readAsDataURL(file);
                this.value = '';
            });
        }
    }

    function fetchChatMessages(orderId) {
        if (!isBackendConnected()) return;
        FB.get('getMessages', {orderId: orderId})
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    _chatMessages = res.data;
                    renderChatMessages();
                }
            })
            .catch(function () {});
    }

    function renderChatMessages() {
        var container = document.getElementById('chatMessages');
        if (!container) return;
        var session = getSession();
        if (!session) return;

        var html = '<div class="chat-system">Chat pesanan dimulai</div>';
        _chatMessages.forEach(function (m) {
            var isMine = String(m.senderId) === String(session.id);
            var cls = isMine ? 'chat-msg sent' : 'chat-msg received';
            var time = new Date(Number(m.createdAt));
            var timeStr = time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0');

            html += '<div class="' + cls + '">';
            if (!isMine) html += '<div class="chat-sender">' + escapeHtml(String(m.senderName || '')) + '</div>';
            if (m.photo) html += '<img class="chat-photo" src="' + m.photo + '" alt="Foto">';
            if (m.text) html += '<div class="chat-text">' + escapeHtml(String(m.text)) + '</div>';
            html += '<div class="chat-time">' + timeStr + '</div>';
            html += '</div>';
        });
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }

    function sendChatMessage(photo) {
        var session = getSession();
        if (!session || !_chatOrderId) return;
        var input = document.getElementById('chatInput');
        var text = (input.value || '').trim();
        if (!text && !photo) return;

        var msgData = {
            action: 'sendMessage',
            orderId: _chatOrderId,
            senderId: session.id,
            senderName: session.name,
            text: text,
            photo: photo || ''
        };

        input.value = '';

        // Optimistic add
        _chatMessages.push({
            senderId: session.id,
            senderName: session.name,
            text: text,
            photo: photo || '',
            createdAt: Date.now()
        });
        renderChatMessages();

        backendPost(msgData).catch(function () { showToast('Gagal mengirim pesan', 'error'); });
    }

    // ══════════════════════════════════════════
    // ═══ RATING PAGE ═══
    // ══════════════════════════════════════════
    var _ratingOrder = null;
    var _ratingValue = 0;

    function openRatingPage(order) {
        _ratingOrder = order;
        _ratingValue = 0;
        var page = document.getElementById('ratingPage');
        if (!page) return;

        var users = getUsers();
        var talent = users.find(function (u) { return u.id === order.talentId; });
        document.getElementById('ratingTalentName').textContent = talent ? talent.name : 'Talent';
        document.getElementById('ratingServiceDesc').textContent = order.serviceType || '';
        document.getElementById('ratingEmoji').textContent = '⭐';
        document.getElementById('ratingLabel').textContent = 'Ketuk bintang untuk menilai';
        document.getElementById('ratingReview').value = '';

        // Reset stars
        document.querySelectorAll('#ratingStars .star').forEach(function (s) { s.classList.remove('active'); });

        page.classList.remove('hidden');

        if (!page._eventsSetup) {
            page._eventsSetup = true;
            document.getElementById('ratingBtnBack').addEventListener('click', function () {
                page.classList.add('hidden');
            });
            document.querySelectorAll('#ratingStars .star').forEach(function (star) {
                star.addEventListener('click', function () {
                    _ratingValue = parseInt(this.dataset.val, 10);
                    var emojis = ['', '😞', '😐', '🙂', '😊', '🤩'];
                    var labels = ['', 'Sangat Buruk', 'Kurang Baik', 'Cukup Baik', 'Baik', 'Sangat Baik!'];
                    document.getElementById('ratingEmoji').textContent = emojis[_ratingValue] || '⭐';
                    document.getElementById('ratingLabel').textContent = labels[_ratingValue] || '';
                    document.querySelectorAll('#ratingStars .star').forEach(function (s) {
                        s.classList.toggle('active', parseInt(s.dataset.val, 10) <= _ratingValue);
                    });
                });
            });
            document.getElementById('ratingSubmitBtn').addEventListener('click', function () { submitRating(); });
        }
    }

    function submitRating() {
        if (!_ratingOrder || _ratingValue < 1) { showToast('Pilih rating terlebih dahulu', 'error'); return; }
        var review = (document.getElementById('ratingReview').value || '').trim();

        backendPost({
            action: 'rateOrder',
            orderId: _ratingOrder.id,
            rating: _ratingValue,
            review: review
        }).then(function (res) {
            if (res && res.success) {
                showToast('Rating berhasil dikirim! Terima kasih 🎉', 'success');
                document.getElementById('ratingPage').classList.add('hidden');
                // Invalidate rating cache so next card render fetches fresh data
                if (_ratingOrder.talentId) delete _talentRatingsCache[_ratingOrder.talentId];
                // Update local order state so tracking page buttons refresh
                if (_currentOrder && _currentOrder.id === _ratingOrder.id) {
                    _currentOrder.status = 'rated';
                    _currentOrder.rating = _ratingValue;
                    _currentOrder.review = review;
                    var session = getSession();
                    updateOrderStatusBadge('rated');
                    renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
                }
                // Refresh orders list if it is currently visible
                var olp = document.getElementById('ordersListPage');
                if (olp && !olp.classList.contains('hidden')) openOrdersList();
            } else {
                showToast('Gagal mengirim rating', 'error');
            }
        });
    }

    // ══════════════════════════════════════════
    // ═══ SETTINGS / AKUN PAGE ═══
    // ══════════════════════════════════════════
    function openSettingsPage() {
        var page = document.getElementById('settingsPage');
        if (!page) return;
        var session = getSession();
        if (!session) return;

        var ROLE_LABELS = { user: 'Pengguna', talent: 'Talent', penjual: 'Penjual', cs: 'CS', owner: 'Owner' };
        var roleLabel = ROLE_LABELS[session.role] || session.role;

        document.getElementById('settingsProfileName').textContent = session.name || '-';
        document.getElementById('settingsInfoName').textContent = session.name || '-';
        document.getElementById('settingsInfoUsername').textContent = session.username || '-';
        document.getElementById('settingsInfoPhone').textContent = session.phone || '-';
        document.getElementById('settingsInfoRole').textContent = roleLabel;

        var badge = document.getElementById('settingsRoleBadge');
        if (badge) { badge.textContent = roleLabel; badge.className = 'settings-role-badge role-' + session.role; }

        // Profile photo
        var photo = getProfilePhoto(session.id);
        var avatarImg = document.getElementById('settingsAvatarImg');
        var avatarIcon = document.getElementById('settingsAvatarIcon');
        if (photo) {
            avatarImg.src = photo; avatarImg.style.display = 'block'; avatarIcon.style.display = 'none';
        } else {
            avatarImg.style.display = 'none'; avatarIcon.style.display = '';
        }

        // Show photo change only for talent
        document.getElementById('settingsPhotoChangeBtn').style.display = session.role === 'talent' ? '' : 'none';

        page.classList.remove('hidden');

        if (!page._eventsSetup) {
            page._eventsSetup = true;

            document.getElementById('settingsBtnBack').addEventListener('click', function () {
                page.classList.add('hidden');
                resetBottomNavToHome();
            });

            document.getElementById('settingsBtnLogout').addEventListener('click', function () {
                page.classList.add('hidden');
                handleLogout();
            });

            document.getElementById('settingsBtnChangePhoto').addEventListener('click', function () {
                document.getElementById('settingsPhotoInput').click();
            });

            document.getElementById('settingsPhotoInput').addEventListener('change', function () {
                var file = this.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function () {
                    compressThumbnail(reader.result, function (thumb) {
                        var s = getSession();
                        if (!s) return;
                        saveProfilePhoto(s.id, thumb);
                        avatarImg.src = thumb; avatarImg.style.display = 'block'; avatarIcon.style.display = 'none';
                        showToast('Foto profil berhasil diperbarui! 📸', 'success');
                    });
                };
                reader.readAsDataURL(file);
                this.value = '';
            });
        }
    }

    // ══════════════════════════════════════════
    // ═══ ORDERS LIST PAGE ═══
    // ══════════════════════════════════════════
    var _ordersListData = [];

    function openOrdersList() {
        var page = document.getElementById('ordersListPage');
        if (!page) return;
        var session = getSession();
        if (!session) return;

        document.getElementById('olpTitle').textContent = session.role === 'talent' ? 'Pesanan Masuk' : 'Pesanan Saya';
        page.classList.remove('hidden');

        // Load orders
        document.getElementById('olpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat pesanan...</p></div>';

        FB.get('getOrdersByUser', {userId: session.id})
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    _ordersListData = res.data;
                    filterOrdersList('active');
                } else {
                    document.getElementById('olpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📭</div><p>Belum ada pesanan</p></div>';
                }
            })
            .catch(function () {
                document.getElementById('olpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">❌</div><p>Gagal memuat pesanan</p></div>';
            });

        // Setup tabs (once)
        if (!page._eventsSetup) {
            page._eventsSetup = true;
            document.getElementById('olpBtnBack').addEventListener('click', function () {
                page.classList.add('hidden');
                resetBottomNavToHome();
            });
            document.querySelectorAll('#olpTabs .olp-tab').forEach(function (tab) {
                tab.addEventListener('click', function () {
                    document.querySelectorAll('#olpTabs .olp-tab').forEach(function (t) { t.classList.remove('active'); });
                    tab.classList.add('active');
                    filterOrdersList(tab.dataset.filter);
                });
            });
        }
    }

    function filterOrdersList(filter) {
        var filtered = _ordersListData;
        if (filter === 'active') {
            filtered = filtered.filter(function (o) { return ['pending', 'accepted', 'on_the_way', 'arrived', 'in_progress'].indexOf(o.status) >= 0; });
        } else if (filter === 'completed') {
            filtered = filtered.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; });
        }
        renderOrderCards(filtered);
    }

    function renderOrderCards(orders) {
        var list = document.getElementById('olpList');
        if (!list) return;
        var session = getSession();
        var users = getUsers();

        if (orders.length === 0) {
            list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📭</div><p>Tidak ada pesanan</p></div>';
            return;
        }

        list.innerHTML = orders.map(function (o, idx) {
            var isTalent = session && session.id === o.talentId;
            var other = users.find(function (u) { return u.id === (isTalent ? o.userId : o.talentId); });
            var otherName = other ? other.name : 'Unknown';
            var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
            var dateText = new Date(Number(o.createdAt)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
            var statusText = STATUS_LABELS[o.status] || o.status;

            // Rating button for user on completed orders
            var rateRow = '';
            if (!isTalent && o.status === 'completed') {
                rateRow = '<button class="olp-rate-btn" data-ridx="' + idx + '">⭐ Beri Rating Sekarang</button>';
            } else if (o.status === 'rated' && o.rating > 0) {
                var stars = '';
                for (var s = 1; s <= 5; s++) stars += (s <= o.rating ? '★' : '☆');
                var reviewSnip = o.review ? ' · <em>' + escapeHtml(String(o.review).substr(0, 35)) + (o.review.length > 35 ? '…' : '') + '</em>' : '';
                rateRow = '<div class="olp-rated-badge">' + stars + reviewSnip + '</div>';
            }

            return '<div class="olp-card" data-idx="' + idx + '">'
                + '<div class="olp-card-top">'
                + '<div class="olp-card-service">' + escapeHtml(o.serviceType || o.skillType || '') + '</div>'
                + '<span class="otp-status-badge status-' + o.status + '">' + statusText + '</span>'
                + '</div>'
                + '<div class="olp-card-name">👤 ' + escapeHtml(otherName) + '</div>'
                + '<div class="olp-card-bottom">'
                + '<span class="olp-card-price">' + priceText + '</span>'
                + '<span class="olp-card-date">' + dateText + '</span>'
                + '</div>'
                + (rateRow ? '<div class="olp-rate-row">' + rateRow + '</div>' : '')
                + '</div>';
        }).join('');

        list.querySelectorAll('.olp-card').forEach(function (card) {
            card.addEventListener('click', function () {
                var idx = parseInt(this.dataset.idx, 10);
                if (orders[idx]) openOrderTracking(orders[idx]);
            });
        });

        // Rate buttons — stop propagation so card click doesn't also fire
        list.querySelectorAll('.olp-rate-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var idx = parseInt(this.dataset.ridx, 10);
                if (orders[idx]) openRatingPage(orders[idx]);
            });
        });
    }

    // ══════════════════════════════════════════
    // ═══ ADMIN TRANSACTIONS PAGE ═══
    // ══════════════════════════════════════════
    function openAdminTransactions() {
        var page = document.getElementById('adminTransPage');
        if (!page) return;
        page.classList.remove('hidden');

        document.getElementById('atpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat transaksi...</p></div>';

        FB.get('getAllOrders')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    renderAdminTransactions(res.data);
                } else {
                    document.getElementById('atpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📭</div><p>Belum ada transaksi</p></div>';
                }
            })
            .catch(function () {
                document.getElementById('atpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">❌</div><p>Gagal memuat</p></div>';
            });

        if (!page._eventsSetup) {
            page._eventsSetup = true;
            document.getElementById('atpBtnBack').addEventListener('click', function () {
                page.classList.add('hidden');
                resetBottomNavToHome();
            });
        }
    }

    function renderAdminTransactions(orders) {
        var list = document.getElementById('atpList');
        if (!list) return;
        var users = getUsers();

        if (orders.length === 0) {
            list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📭</div><p>Belum ada transaksi</p></div>';
            return;
        }

        // Sort by newest first
        orders.sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });

        list.innerHTML = orders.map(function (o, idx) {
            var user = users.find(function (u) { return u.id === o.userId; });
            var talent = users.find(function (u) { return u.id === o.talentId; });
            var userName = user ? user.name : o.userId;
            var talentName = talent ? talent.name : o.talentId;
            var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
            var feeText = o.fee ? 'Rp ' + Number(o.fee).toLocaleString('id-ID') : '-';
            var dateText = new Date(Number(o.createdAt)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            var statusText = STATUS_LABELS[o.status] || o.status;
            var ratingText = o.rating > 0 ? '⭐ ' + o.rating + '/5' : '-';

            return '<div class="olp-card" data-idx="' + idx + '">'
                + '<div class="olp-card-top">'
                + '<div class="olp-card-service">#' + o.id.substr(0, 8) + ' · ' + escapeHtml(o.serviceType || o.skillType || '') + '</div>'
                + '<span class="otp-status-badge status-' + o.status + '">' + statusText + '</span>'
                + '</div>'
                + '<div class="olp-card-name">👤 ' + escapeHtml(userName) + ' → 🏍️ ' + escapeHtml(talentName) + '</div>'
                + '<div class="olp-card-bottom">'
                + '<span class="olp-card-price">' + priceText + ' (fee: ' + feeText + ')</span>'
                + '<span class="olp-card-date">' + dateText + '</span>'
                + '</div>'
                + '<div class="olp-card-bottom"><span>Rating: ' + ratingText + '</span></div>'
                + '</div>';
        }).join('');

        // Click to view chat
        list.querySelectorAll('.olp-card').forEach(function (card) {
            card.addEventListener('click', function () {
                var idx = parseInt(this.dataset.idx, 10);
                if (orders[idx]) openChat(orders[idx]);
            });
        });
    }

    // ══════════════════════════════════════════
    // ═══ TALENT DASHBOARD ORDERS ═══
    // ══════════════════════════════════════════
    function loadTalentDashboardOrders() {
        var session = getSession();
        if (!session || session.role !== 'talent') return;
        if (!isBackendConnected()) return;

        FB.get('getOrdersByUser', {userId: session.id})
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    var orders = res.data;
                    renderTalentDashboardOrders(orders, session);
                    updateTalentStats(orders, session);
                    checkNewPendingOrders(orders, session);
                }
            })
            .catch(function () {});
    }

    function renderTalentDashboardOrders(orders, session) {
        var users = getUsers();

        // Incoming = pending orders for this talent
        var incoming = orders.filter(function (o) { return o.talentId === session.id && o.status === 'pending'; });
        // Active = accepted/on_the_way/arrived/in_progress
        var active = orders.filter(function (o) {
            return o.talentId === session.id && ['accepted', 'on_the_way', 'arrived', 'in_progress'].indexOf(o.status) >= 0;
        });

        // Render incoming
        var inEl = document.getElementById('talentIncomingOrders');
        if (inEl) {
            if (incoming.length === 0) {
                inEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>Belum Ada Pesanan</h3><p>Pesanan baru dari pelanggan akan muncul di sini.</p></div>';
            } else {
                inEl.innerHTML = incoming.map(function (o, idx) {
                    var user = users.find(function (u) { return u.id === o.userId; });
                    var userName = user ? user.name : 'Pelanggan';
                    var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
                    var timeAgo = getTimeAgo(o.createdAt);
                    return '<div class="td-order-card" data-order-id="' + o.id + '" data-src="incoming" data-idx="' + idx + '">'
                        + '<div class="td-oc-top">'
                        + '<div class="td-oc-service">' + escapeHtml(o.serviceType || o.skillType || 'Pesanan') + '</div>'
                        + '<span class="otp-status-badge status-pending">Baru</span>'
                        + '</div>'
                        + '<div class="td-oc-user">👤 ' + escapeHtml(userName) + '</div>'
                        + '<div class="td-oc-bottom">'
                        + '<span class="td-oc-price">' + priceText + '</span>'
                        + '<span class="td-oc-time">' + timeAgo + '</span>'
                        + '</div>'
                        + '</div>';
                }).join('');

                inEl.querySelectorAll('.td-order-card').forEach(function (card) {
                    card.addEventListener('click', function () {
                        var idx = parseInt(this.dataset.idx, 10);
                        if (incoming[idx]) openOrderTracking(incoming[idx]);
                    });
                });
            }
        }

        // Render active
        var actEl = document.getElementById('talentActiveOrders');
        if (actEl) {
            if (active.length === 0) {
                actEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>Tidak Ada Pesanan Aktif</h3><p>Pesanan yang sedang dikerjakan akan muncul di sini.</p></div>';
            } else {
                actEl.innerHTML = active.map(function (o, idx) {
                    var user = users.find(function (u) { return u.id === o.userId; });
                    var userName = user ? user.name : 'Pelanggan';
                    var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
                    var statusText = STATUS_LABELS[o.status] || o.status;
                    return '<div class="td-order-card active-card" data-src="active" data-idx="' + idx + '">'
                        + '<div class="td-oc-top">'
                        + '<div class="td-oc-service">' + escapeHtml(o.serviceType || o.skillType || 'Pesanan') + '</div>'
                        + '<span class="otp-status-badge status-' + o.status + '">' + statusText + '</span>'
                        + '</div>'
                        + '<div class="td-oc-user">👤 ' + escapeHtml(userName) + '</div>'
                        + '<div class="td-oc-bottom">'
                        + '<span class="td-oc-price">' + priceText + '</span>'
                        + '</div>'
                        + '</div>';
                }).join('');

                actEl.querySelectorAll('.td-order-card').forEach(function (card) {
                    card.addEventListener('click', function () {
                        var idx = parseInt(this.dataset.idx, 10);
                        if (active[idx]) openOrderTracking(active[idx]);
                    });
                });
            }
        }

        // Update pending badge
        var badgeEl = document.getElementById('talentPendingBadge');
        if (badgeEl) badgeEl.textContent = incoming.length > 0 ? incoming.length : '';

        // Update header notification badge
        var headerBadge = document.getElementById('talentHeaderBadge');
        if (headerBadge) {
            headerBadge.textContent = incoming.length > 0 ? incoming.length : '0';
            headerBadge.style.display = incoming.length > 0 ? '' : 'none';
        }
    }

    function updateTalentStats(orders, session) {
        var myOrders = orders.filter(function (o) { return o.talentId === session.id; });

        // Today's orders
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var todayTs = today.getTime();
        var todayOrders = myOrders.filter(function (o) { return o.createdAt >= todayTs; });

        // Earnings (completed + rated)
        var earnings = myOrders.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; })
            .reduce(function (sum, o) { return sum + (o.price || 0); }, 0);

        // Rating
        var ratedOrders = myOrders.filter(function (o) { return o.rating > 0; });
        var ratingAvg = ratedOrders.length > 0
            ? ratedOrders.reduce(function (sum, o) { return sum + o.rating; }, 0) / ratedOrders.length
            : 0;

        var statOrdersEl = document.getElementById('talentStatOrders');
        var statEarningEl = document.getElementById('talentStatEarning');
        var statRatingEl = document.getElementById('talentStatRating');
        if (statOrdersEl) statOrdersEl.textContent = todayOrders.length;
        if (statEarningEl) statEarningEl.textContent = 'Rp ' + earnings.toLocaleString('id-ID');
        if (statRatingEl) statRatingEl.textContent = ratingAvg > 0 ? ratingAvg.toFixed(1) : '0.0';
    }

    function checkNewPendingOrders(orders, session) {
        var pending = orders.filter(function (o) { return o.talentId === session.id && o.status === 'pending'; });
        var pendingIds = pending.map(function (o) { return o.id; });

        // Find new orders that weren't in our last known list
        var newOrders = pending.filter(function (o) { return _talentLastPendingIds.indexOf(o.id) < 0; });

        // Only show notification if we had a previous list (not first load) and there are new orders
        if (_talentLastPendingIds.length > 0 || pendingIds.length > 0) {
            if (newOrders.length > 0 && _talentLastPendingIds.length > 0) {
                showOrderNotification(newOrders[0]);
            }
        }

        _talentLastPendingIds = pendingIds;
    }

    function showOrderNotification(order) {
        var popup = document.getElementById('orderNotifPopup');
        if (!popup) return;

        var users = getUsers();
        var user = users.find(function (u) { return u.id === order.userId; });
        var userName = user ? user.name : 'Pelanggan';
        var priceText = order.price ? 'Rp ' + Number(order.price).toLocaleString('id-ID') : '';

        document.getElementById('notifTitle').textContent = '🔔 Pesanan Baru!';
        document.getElementById('notifDesc').textContent = userName + ' memesan ' + (order.serviceType || 'layanan') + (priceText ? ' - ' + priceText : '');

        popup.classList.remove('hidden');

        // Play bell sound + vibrate
        playBellSound();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

        // Dismiss button
        var dismissBtn = document.getElementById('notifBtnDismiss');
        var acceptBtn = document.getElementById('notifBtnAccept');

        var newDismiss = dismissBtn.cloneNode(true);
        dismissBtn.parentNode.replaceChild(newDismiss, dismissBtn);
        newDismiss.addEventListener('click', function () { popup.classList.add('hidden'); });

        var newAccept = acceptBtn.cloneNode(true);
        acceptBtn.parentNode.replaceChild(newAccept, acceptBtn);
        newAccept.addEventListener('click', function () {
            popup.classList.add('hidden');
            openOrderTracking(order);
        });
    }

    function startTalentDashboardPolling() {
        if (_talentDashPollTimer) { clearInterval(_talentDashPollTimer); _talentDashPollTimer = null; }
        if (_fbTalentOrdersUnsub) { _fbTalentOrdersUnsub(); _fbTalentOrdersUnsub = null; }
        var session = getSession();
        if (!session) return;
        if (typeof FB !== 'undefined' && FB.isReady()) {
            // Gunakan Firebase onSnapshot — lebih cepat dari polling 10 detik
            _fbTalentOrdersUnsub = FB.onOrdersForUser(session.id, function (res) {
                var s = getSession();
                if (s && s.role === 'talent' && res.success && res.data) {
                    renderTalentDashboardOrders(res.data, s);
                    updateTalentStats(res.data, s);
                    checkNewPendingOrders(res.data, s);
                }
            });
        } else {
            _talentDashPollTimer = setInterval(function () {
                var s = getSession();
                if (s && s.role === 'talent') {
                    loadTalentDashboardOrders();
                } else {
                    clearInterval(_talentDashPollTimer);
                    _talentDashPollTimer = null;
                }
            }, 10000);
        }
    }

    function getTimeAgo(timestamp) {
        var diff = Date.now() - Number(timestamp);
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Baru saja';
        if (mins < 60) return mins + ' menit lalu';
        var hours = Math.floor(mins / 60);
        if (hours < 24) return hours + ' jam lalu';
        var days = Math.floor(hours / 24);
        return days + ' hari lalu';
    }

    // ══════════════════════════════════════════
    // ═══ PENJUAL DASHBOARD ═══
    // ══════════════════════════════════════════
    var _penjualStore = null;
    var _penjualProducts = [];
    var _penjualDashPollTimer = null;

    function loadPenjualDashboard() {
        var session = getSession();
        if (!session || session.role !== 'penjual') return;
        // Fill store address from session
        var addrEl = document.getElementById('storeFormAddr');
        if (addrEl && session.address) addrEl.value = session.address;

        if (isBackendConnected()) {
            FB.get('getStoresByUser', {userId: session.id})
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res.success && res.data && res.data.length > 0) {
                        _penjualStore = res.data[0];
                        populatePenjualStoreForm(_penjualStore);
                    }
                    loadPenjualProducts();
                    loadPenjualOrders();
                }).catch(function() {
                    loadPenjualProducts();
                    loadPenjualOrders();
                });
        } else {
            loadPenjualProducts();
            loadPenjualOrders();
        }
    }

    function populatePenjualStoreForm(store) {
        if (!store) return;
        var nameEl = document.getElementById('storeFormName');
        var catEl = document.getElementById('storeFormCategory');
        var descEl = document.getElementById('storeFormDesc');
        var addrEl = document.getElementById('storeFormAddr');
        var toggle = document.getElementById('penjualStoreToggle');
        var statusLbl = document.getElementById('penjualStoreStatus');

        if (nameEl) nameEl.value = store.name || '';
        if (catEl) catEl.value = store.category || 'food';
        if (descEl) descEl.value = store.description || '';
        if (addrEl) addrEl.value = store.address || '';
        if (toggle) toggle.checked = store.isOpen;
        if (statusLbl) statusLbl.textContent = store.isOpen ? 'Toko Buka' : 'Toko Tutup';
    }

    function handleStoreFormSubmit(e) {
        e.preventDefault();
        var session = getSession();
        if (!session) return;

        var name = (document.getElementById('storeFormName').value || '').trim();
        var category = document.getElementById('storeFormCategory').value;
        var desc = (document.getElementById('storeFormDesc').value || '').trim();
        var addr = (document.getElementById('storeFormAddr').value || '').trim() || session.address || '';

        if (!name) { showToast('Nama toko wajib diisi!', 'error'); return; }

        var btn = e.target.querySelector('.btn-primary');
        if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

        var storeData = {
            name: name,
            category: category,
            description: desc,
            address: addr,
            lat: session.lat || 0,
            lng: session.lng || 0
        };

        if (_penjualStore && _penjualStore.id) {
            // Update existing
            backendPost({ action: 'updateStore', storeId: _penjualStore.id, fields: storeData })
                .then(function(res) {
                    if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Toko'; }
                    if (res && res.success) {
                        for (var k in storeData) _penjualStore[k] = storeData[k];
                        showToast('Toko berhasil diperbarui!', 'success');
                    } else {
                        showToast('Gagal memperbarui toko', 'error');
                    }
                });
        } else {
            // Create new
            var newStore = Object.assign({ action: 'createStore', id: generateId(), userId: session.id, isOpen: true, createdAt: Date.now() }, storeData);
            backendPost(newStore)
                .then(function(res) {
                    if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Toko'; }
                    if (res && res.success) {
                        _penjualStore = res.data || newStore;
                        showToast('Toko berhasil dibuat!', 'success');
                    } else {
                        showToast('Gagal membuat toko', 'error');
                    }
                });
        }
    }

    function handlePenjualStoreToggle() {
        var toggle = document.getElementById('penjualStoreToggle');
        var statusLbl = document.getElementById('penjualStoreStatus');
        if (!toggle || !_penjualStore) {
            showToast('Simpan data toko terlebih dahulu!', 'error');
            if (toggle) toggle.checked = false;
            return;
        }
        var isOpen = toggle.checked;
        if (statusLbl) statusLbl.textContent = isOpen ? 'Toko Buka' : 'Toko Tutup';
        _penjualStore.isOpen = isOpen;
        backendPost({ action: 'updateStore', storeId: _penjualStore.id, fields: { isOpen: isOpen } })
            .then(function(res) {
                showToast(isOpen ? 'Toko sekarang Buka! ✅' : 'Toko sekarang Tutup', isOpen ? 'success' : 'error');
            });
    }

    function loadPenjualProducts() {
        if (!_penjualStore || !_penjualStore.id) {
            renderPenjualProducts([]);
            return;
        }
        if (!isBackendConnected()) { renderPenjualProducts([]); return; }
        FB.get('getProductsByStore', {storeId: _penjualStore.id})
            .then(function(r) { return r.json(); })
            .then(function(res) {
                _penjualProducts = (res.success && res.data) ? res.data : [];
                renderPenjualProducts(_penjualProducts);
                var statEl = document.getElementById('penjualStatProducts');
                if (statEl) statEl.textContent = _penjualProducts.filter(function(p) { return p.isActive; }).length;
            }).catch(function() { renderPenjualProducts([]); });
    }

    function renderPenjualProducts(products) {
        var container = document.getElementById('penjualProductList');
        if (!container) return;
        if (!products || products.length === 0) {
            container.innerHTML = '<div class="skills-empty">Belum ada produk. Klik <strong>+ Tambah</strong> untuk menambahkan!</div>';
            return;
        }
        container.innerHTML = products.map(function(p) {
            var priceText = p.price ? 'Rp ' + Number(p.price).toLocaleString('id-ID') : '-';
            var stockText = 'Stok: ' + (p.stock || 0);
            var activeClass = p.isActive ? '' : ' style="opacity:0.5"';
            return '<div class="skill-card" data-pid="' + escapeHtml(p.id) + '"' + activeClass + '>'
                + '<div class="skill-card-header">'
                + (p.photo ? '<img src="' + p.photo + '" style="width:40px;height:40px;border-radius:8px;object-fit:cover;margin-right:8px">' : '<span class="skill-card-icon">📦</span>')
                + '<span class="skill-card-name">' + escapeHtml(p.name) + '</span>'
                + '<div class="skill-card-actions">'
                + '<button class="skill-card-edit" data-pid="' + escapeHtml(p.id) + '">✏️</button>'
                + '<button class="skill-card-remove" data-pid="' + escapeHtml(p.id) + '">&times;</button>'
                + '</div></div>'
                + '<div class="skill-card-detail">'
                + '<span class="skill-detail-type">' + priceText + '</span>'
                + '<span class="skill-detail-price">' + stockText + '</span>'
                + '</div></div>';
        }).join('');

        container.querySelectorAll('.skill-card-edit').forEach(function(btn) {
            btn.addEventListener('click', function() { openEditProductModal(this.dataset.pid); });
        });
        container.querySelectorAll('.skill-card-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var pid = this.dataset.pid;
                if (confirm('Hapus produk ini?')) {
                    backendPost({ action: 'deleteProduct', productId: pid }).then(function() {
                        showToast('Produk dihapus', 'success');
                        loadPenjualProducts();
                    });
                }
            });
        });
    }

    function openAddProductModal() {
        var modal = document.getElementById('addProductModal');
        if (!modal) return;
        if (!_penjualStore || !_penjualStore.id) {
            showToast('Simpan data toko terlebih dahulu!', 'error');
            return;
        }
        document.getElementById('addProductTitle').textContent = 'Tambah Produk';
        document.getElementById('editProductId').value = '';
        document.getElementById('addProductForm').reset();
        document.getElementById('prodPhotoImg').src = '';
        document.getElementById('prodPhotoImg').dataset.newUpload = '';
        document.getElementById('prodPhotoPreview').style.display = 'none';
        document.getElementById('prodBtnUpload').style.display = '';
        modal.classList.remove('hidden');
    }

    function openEditProductModal(productId) {
        var product = _penjualProducts.find(function(p) { return p.id === productId; });
        if (!product) return;
        var modal = document.getElementById('addProductModal');
        if (!modal) return;
        document.getElementById('addProductTitle').textContent = 'Edit Produk';
        document.getElementById('editProductId').value = productId;
        document.getElementById('prodFormName').value = product.name || '';
        document.getElementById('prodFormCategory').value = product.category || 'food';
        document.getElementById('prodFormDesc').value = product.description || '';
        document.getElementById('prodFormPrice').value = product.price || '';
        document.getElementById('prodFormStock').value = product.stock || '';
        if (product.photo) {
            document.getElementById('prodPhotoImg').src = product.photo;
            document.getElementById('prodPhotoImg').dataset.newUpload = '';
            document.getElementById('prodPhotoPreview').style.display = 'block';
            document.getElementById('prodBtnUpload').style.display = 'none';
        } else {
            document.getElementById('prodPhotoImg').src = '';
            document.getElementById('prodPhotoImg').dataset.newUpload = '';
            document.getElementById('prodPhotoPreview').style.display = 'none';
            document.getElementById('prodBtnUpload').style.display = '';
        }
        modal.classList.remove('hidden');
    }

    function handleProductFormSubmit(e) {
        e.preventDefault();
        if (!_penjualStore || !_penjualStore.id) { showToast('Data toko belum ada!', 'error'); return; }

        var productId = document.getElementById('editProductId').value;
        var name = (document.getElementById('prodFormName').value || '').trim();
        var category = document.getElementById('prodFormCategory').value;
        var desc = (document.getElementById('prodFormDesc').value || '').trim();
        var price = parseInt(document.getElementById('prodFormPrice').value) || 0;
        var stock = parseInt(document.getElementById('prodFormStock').value) || 0;
        var photoImg = document.getElementById('prodPhotoImg');
        var isNewPhoto = photoImg.dataset.newUpload === '1';
        var photoData = isNewPhoto ? photoImg.src : (productId ? ((_penjualProducts.find(function(p) { return p.id === productId; }) || {}).photo || '') : '');

        if (!name || price < 500) { showToast('Nama dan harga minimal Rp 500 wajib diisi!', 'error'); return; }

        var btn = e.target.querySelector('.btn-primary');
        if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

        function doSave(photo) {
            if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Produk'; }
            if (productId) {
                backendPost({ action: 'updateProduct', productId: productId, fields: { name: name, category: category, description: desc, price: price, stock: stock, photo: photo } })
                    .then(function(res) {
                        if (res && res.success) {
                            showToast('Produk diperbarui!', 'success');
                            document.getElementById('addProductModal').classList.add('hidden');
                            loadPenjualProducts();
                        } else { showToast('Gagal memperbarui produk', 'error'); }
                    });
            } else {
                backendPost({ action: 'createProduct', id: generateId(), storeId: _penjualStore.id, name: name, category: category, description: desc, price: price, stock: stock, photo: photo, isActive: true })
                    .then(function(res) {
                        if (res && res.success) {
                            showToast('Produk berhasil ditambahkan!', 'success');
                            document.getElementById('addProductModal').classList.add('hidden');
                            loadPenjualProducts();
                        } else { showToast('Gagal menambahkan produk', 'error'); }
                    });
            }
        }

        if (isNewPhoto && photoData.startsWith('data:')) {
            compressThumbnail(photoData, function(thumb) { doSave(thumb); });
        } else {
            doSave(photoData);
        }
    }

    function setupProductPhotoUpload() {
        var photoInput = document.getElementById('prodPhoto');
        var btnUpload = document.getElementById('prodBtnUpload');
        var photoPreview = document.getElementById('prodPhotoPreview');
        var photoImg = document.getElementById('prodPhotoImg');
        var removePhoto = document.getElementById('prodRemovePhoto');

        if (btnUpload && photoInput) {
            btnUpload.addEventListener('click', function() { photoInput.click(); });
            photoInput.addEventListener('change', function() {
                var file = this.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function() {
                    photoImg.src = reader.result;
                    photoImg.dataset.newUpload = '1';
                    photoPreview.style.display = 'block';
                    btnUpload.style.display = 'none';
                };
                reader.readAsDataURL(file);
                this.value = '';
            });
        }
        if (removePhoto) {
            removePhoto.addEventListener('click', function() {
                photoInput.value = '';
                photoImg.src = '';
                photoImg.dataset.newUpload = '';
                photoPreview.style.display = 'none';
                btnUpload.style.display = '';
            });
        }
    }

    function loadPenjualOrders() {
        var session = getSession();
        if (!session || session.role !== 'penjual') return;
        if (!isBackendConnected()) return;
        FB.get('getOrdersByUser', {userId: session.id})
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success && res.data) {
                    renderPenjualOrders(res.data, session);
                    updatePenjualStats(res.data, session);
                }
            }).catch(function() {});
    }

    function renderPenjualOrders(orders, session) {
        var incoming = orders.filter(function(o) { return o.talentId === session.id && o.status === 'pending'; });
        var inEl = document.getElementById('penjualIncomingOrders');
        if (!inEl) return;
        if (incoming.length === 0) {
            inEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>Belum Ada Pesanan</h3><p>Pesanan produk dari pelanggan akan muncul di sini.</p></div>';
            return;
        }
        var users = getUsers();
        inEl.innerHTML = incoming.map(function(o, idx) {
            var user = users.find(function(u) { return u.id === o.userId; });
            var userName = user ? user.name : 'Pelanggan';
            var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
            return '<div class="td-order-card" data-idx="' + idx + '">'
                + '<div class="td-oc-top"><div class="td-oc-service">' + escapeHtml(o.serviceType || 'Pesanan Produk') + '</div>'
                + '<span class="otp-status-badge status-pending">Baru</span></div>'
                + '<div class="td-oc-user">👤 ' + escapeHtml(userName) + '</div>'
                + '<div class="td-oc-bottom"><span class="td-oc-price">' + priceText + '</span>'
                + '<span class="td-oc-time">' + getTimeAgo(o.createdAt) + '</span></div></div>';
        }).join('');
        inEl.querySelectorAll('.td-order-card').forEach(function(card) {
            card.addEventListener('click', function() {
                var idx = parseInt(this.dataset.idx, 10);
                if (incoming[idx]) openOrderTracking(incoming[idx]);
            });
        });
        var badgeEl = document.getElementById('penjualPendingBadge');
        if (badgeEl) badgeEl.textContent = incoming.length > 0 ? incoming.length : '';
        var headerBadge = document.getElementById('penjualHeaderBadge');
        if (headerBadge) {
            headerBadge.textContent = incoming.length > 0 ? incoming.length : '0';
            headerBadge.style.display = incoming.length > 0 ? '' : 'none';
        }
    }

    function updatePenjualStats(orders, session) {
        var today = new Date(); today.setHours(0,0,0,0);
        var todayOrders = orders.filter(function(o) { return o.createdAt >= today.getTime(); });
        var earnings = orders.filter(function(o) { return o.status === 'completed' || o.status === 'rated'; })
            .reduce(function(sum, o) { return sum + (Number(o.price) || 0); }, 0);
        var statOrdersEl = document.getElementById('penjualStatOrders');
        var statEarnEl = document.getElementById('penjualStatEarning');
        if (statOrdersEl) statOrdersEl.textContent = todayOrders.length;
        if (statEarnEl) statEarnEl.textContent = 'Rp ' + earnings.toLocaleString('id-ID');
    }

    function startPenjualDashboardPolling() {
        if (_penjualDashPollTimer) { clearInterval(_penjualDashPollTimer); _penjualDashPollTimer = null; }
        if (_fbPenjualOrdersUnsub) { _fbPenjualOrdersUnsub(); _fbPenjualOrdersUnsub = null; }
        var session = getSession();
        if (!session) return;
        if (typeof FB !== 'undefined' && FB.isReady()) {
            _fbPenjualOrdersUnsub = FB.onOrdersForUser(session.id, function (res) {
                var s = getSession();
                if (s && s.role === 'penjual' && res.success && res.data) {
                    renderPenjualOrders(res.data, s);
                    updatePenjualStats(res.data, s);
                }
            });
        } else {
            _penjualDashPollTimer = setInterval(function() {
                var s = getSession();
                if (s && s.role === 'penjual') {
                    loadPenjualOrders();
                } else {
                    clearInterval(_penjualDashPollTimer);
                    _penjualDashPollTimer = null;
                }
            }, 10000);
        }
    }

    // ══════════════════════════════════════════
    // ═══ OWNER: COMMISSION SETTINGS & REVENUE ═══
    // ══════════════════════════════════════════
    function loadOwnerCommissionSettings() {
        if (!isBackendConnected()) return;
        FB.get('getSettings')
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success && res.data) {
                    var s = res.data;
                    var el = function(id) { return document.getElementById(id); };
                    if (el('setPlatformFee') && s.platform_fee) el('setPlatformFee').value = s.platform_fee;
                    if (el('setDeliveryFeePerKm') && s.delivery_fee_per_km) el('setDeliveryFeePerKm').value = s.delivery_fee_per_km;
                    if (el('setServiceFeePercent') && s.service_fee_percent) el('setServiceFeePercent').value = s.service_fee_percent;
                    if (el('setCommTalent') && s.commission_talent_percent) el('setCommTalent').value = s.commission_talent_percent;
                    if (el('setCommPenjual') && s.commission_penjual_percent) el('setCommPenjual').value = s.commission_penjual_percent;
                    if (el('setMinFee') && s.minimum_fee) el('setMinFee').value = s.minimum_fee;
                }
            }).catch(function() {});
    }

    function handleCommissionFormSubmit(e) {
        e.preventDefault();
        var el = function(id) { return document.getElementById(id); };
        var settings = {
            platform_fee: el('setPlatformFee').value || '2000',
            delivery_fee_per_km: el('setDeliveryFeePerKm').value || '3000',
            service_fee_percent: el('setServiceFeePercent').value || '10',
            commission_talent_percent: el('setCommTalent').value || '15',
            commission_penjual_percent: el('setCommPenjual').value || '10',
            minimum_fee: el('setMinFee').value || '5000'
        };
        var btn = e.target.querySelector('.btn-primary');
        if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
        backendPost({ action: 'updateSettings', settings: settings })
            .then(function(res) {
                if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Pengaturan'; }
                if (res && res.success) {
                    showToast('Pengaturan komisi disimpan!', 'success');
                } else {
                    showToast('Gagal menyimpan pengaturan', 'error');
                }
            });
    }

    function loadOwnerRevenue() {
        if (!isBackendConnected()) return;
        FB.get('getAllOrders')
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (!res.success || !res.data) return;
                var orders = res.data;
                var completed = orders.filter(function(o) { return o.status === 'completed' || o.status === 'rated'; });
                var totalRevenue = completed.reduce(function(sum, o) { return sum + (Number(o.fee) || 0); }, 0);
                var today = new Date(); today.setHours(0,0,0,0);
                var todayRevenue = completed
                    .filter(function(o) { return Number(o.completedAt || o.createdAt) >= today.getTime(); })
                    .reduce(function(sum, o) { return sum + (Number(o.fee) || 0); }, 0);
                var revEl = document.getElementById('ownerRevenue');
                var todayEl = document.getElementById('ownerTodayRevenue');
                if (revEl) revEl.textContent = 'Rp ' + totalRevenue.toLocaleString('id-ID');
                if (todayEl) todayEl.textContent = 'Rp ' + todayRevenue.toLocaleString('id-ID');
            }).catch(function() {});
    }

    // ══════════════════════════════════════════
    // ═══ STORE LISTING PAGE (for users) ═══
    // ══════════════════════════════════════════
    var _slpAllStores = [];
    var _slpCurrentCat = 'all';
    var _slpCurrentStore = null;
    var _sdpProducts = [];
    var _sdpSelectedProduct = null;

    function openStoreListPage(category) {
        var page = document.getElementById('storeListPage');
        if (!page) return;
        _slpCurrentCat = category || 'all';

        var titleEl = document.getElementById('slpTitle');
        var subtitleEl = document.getElementById('slpSubtitle');
        var catTitles = { food: '🍔 JS Food', shop: '🛒 JS Shop', medicine: '💊 JS Medicine', all: 'Semua Toko' };
        var catDescs = { food: 'Pesan makanan & minuman', shop: 'Belanja kebutuhan sehari-hari', medicine: 'Beli obat & vitamin', all: 'Toko & produk terdekat' };
        if (titleEl) titleEl.textContent = catTitles[_slpCurrentCat] || 'Toko & Produk';
        if (subtitleEl) subtitleEl.textContent = catDescs[_slpCurrentCat] || '';

        // Reset search
        var searchInput = document.getElementById('slpSearchInput');
        if (searchInput) searchInput.value = '';

        // Set active category button
        page.querySelectorAll('.stp-sort-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.cat === _slpCurrentCat || (_slpCurrentCat === 'all' && b.dataset.cat === 'all'));
        });

        page.classList.remove('hidden');
        document.getElementById('slpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat toko...</p></div>';

        // Fetch stores
        if (isBackendConnected()) {
            FB.get('getAllStores')
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    _slpAllStores = (res.success && res.data) ? res.data.filter(function(s) { return s.isOpen; }) : [];
                    filterAndRenderStores();
                }).catch(function() {
                    document.getElementById('slpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">❌</div><p>Gagal memuat toko</p></div>';
                });
        } else {
            document.getElementById('slpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📡</div><p>Tidak ada koneksi server</p></div>';
        }

        // Setup events once
        if (!page._eventsSetup) {
            page._eventsSetup = true;
            document.getElementById('slpBtnBack').addEventListener('click', function() { page.classList.add('hidden'); });
            document.getElementById('slpSearchInput').addEventListener('input', function() { filterAndRenderStores(); });
            page.querySelectorAll('.stp-sort-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    page.querySelectorAll('.stp-sort-btn').forEach(function(b) { b.classList.remove('active'); });
                    this.classList.add('active');
                    _slpCurrentCat = this.dataset.cat;
                    filterAndRenderStores();
                });
            });
        }
    }

    function filterAndRenderStores() {
        var q = (document.getElementById('slpSearchInput').value || '').trim().toLowerCase();
        var filtered = _slpAllStores;
        if (_slpCurrentCat !== 'all') {
            filtered = filtered.filter(function(s) { return s.category === _slpCurrentCat; });
        }
        if (q.length >= 2) {
            filtered = filtered.filter(function(s) {
                return (s.name || '').toLowerCase().indexOf(q) >= 0 || (s.description || '').toLowerCase().indexOf(q) >= 0;
            });
        }
        var session = getSession();
        var myLat = session ? (session.lat || 0) : 0;
        var myLng = session ? (session.lng || 0) : 0;
        // Sort by distance
        filtered = filtered.slice().sort(function(a, b) {
            if (myLat && myLng && a.lat && a.lng && b.lat && b.lng) {
                return haversineDistance(myLat, myLng, a.lat, a.lng) - haversineDistance(myLat, myLng, b.lat, b.lng);
            }
            return 0;
        });

        var countEl = document.getElementById('slpCount');
        if (countEl) countEl.textContent = filtered.length > 0 ? filtered.length + ' toko tersedia' : '';
        renderStoreCards(filtered);
    }

    function renderStoreCards(stores) {
        var list = document.getElementById('slpList');
        if (!list) return;
        var session = getSession();
        var myLat = session ? (session.lat || 0) : 0;
        var myLng = session ? (session.lng || 0) : 0;
        var catIcons = { food: '🍔', shop: '🛒', medicine: '💊', other: '📦' };

        if (stores.length === 0) {
            list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">🔍</div><h3>Tidak Ditemukan</h3><p>Belum ada toko yang buka di kategori ini.</p></div>';
            return;
        }

        list.innerHTML = stores.map(function(s, idx) {
            var icon = catIcons[s.category] || '🏪';
            var dist = (myLat && myLng && s.lat && s.lng) ? haversineDistance(myLat, myLng, s.lat, s.lng) : -1;
            var distText = dist >= 0 ? (dist < 1 ? (dist * 1000).toFixed(0) + ' m' : dist.toFixed(1) + ' km') : '';
            return '<div class="stc" data-idx="' + idx + '">'
                + '<div class="stc-img"><div class="stc-img-placeholder" style="font-size:36px">' + icon + '</div>'
                + (distText ? '<span class="stc-dist-badge">📍 ' + distText + '</span>' : '') + '</div>'
                + '<div class="stc-body">'
                + '<div class="stc-name">' + escapeHtml(s.name) + '</div>'
                + (s.description ? '<div class="stc-desc">' + escapeHtml(s.description) + '</div>' : '')
                + '<div class="stc-bottom">'
                + '<span class="stc-price">' + icon + ' ' + (s.category === 'food' ? 'Makanan' : s.category === 'shop' ? 'Belanja' : s.category === 'medicine' ? 'Obat' : 'Lainnya') + '</span>'
                + '<span class="stc-rating">' + (s.address ? '📍 ' + escapeHtml((s.address || '').split(',')[0]) : '') + '</span>'
                + '</div></div></div>';
        }).join('');

        list.querySelectorAll('.stc').forEach(function(card) {
            card.addEventListener('click', function() {
                var idx = parseInt(this.dataset.idx, 10);
                if (stores[idx]) openStoreDetail(stores[idx]);
            });
        });
    }

    function openStoreDetail(store) {
        _slpCurrentStore = store;
        _sdpProducts = [];
        _sdpSelectedProduct = null;
        var page = document.getElementById('storeDetailPage');
        if (!page) return;
        var titleEl = document.getElementById('sdpTitle');
        var subtitleEl = document.getElementById('sdpSubtitle');
        var footerEl = document.getElementById('sdpFooter');
        if (titleEl) titleEl.textContent = store.name;
        if (subtitleEl) subtitleEl.textContent = (store.address || '').split(',')[0];
        if (footerEl) footerEl.style.display = 'none';

        var productList = document.getElementById('sdpProductList');
        if (productList) productList.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat produk...</p></div>';

        page.classList.remove('hidden');

        if (isBackendConnected()) {
            FB.get('getProductsByStore', {storeId: store.id})
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    _sdpProducts = (res.success && res.data) ? res.data.filter(function(p) { return p.isActive && p.stock > 0; }) : [];
                    renderStoreProducts(_sdpProducts);
                }).catch(function() {
                    if (productList) productList.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">❌</div><p>Gagal memuat produk</p></div>';
                });
        }

        if (!page._eventsSetup) {
            page._eventsSetup = true;
            document.getElementById('sdpBtnBack').addEventListener('click', function() { page.classList.add('hidden'); });
            document.getElementById('sdpBtnOrder').addEventListener('click', function() {
                if (_sdpSelectedProduct) createProductOrder(_sdpSelectedProduct, _slpCurrentStore);
            });
        }
    }

    function renderStoreProducts(products) {
        var list = document.getElementById('sdpProductList');
        if (!list) return;
        var footerEl = document.getElementById('sdpFooter');

        if (products.length === 0) {
            list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📦</div><h3>Tidak Ada Produk</h3><p>Toko ini belum memiliki produk yang tersedia.</p></div>';
            if (footerEl) footerEl.style.display = 'none';
            return;
        }

        list.innerHTML = products.map(function(p, idx) {
            var priceText = p.price ? 'Rp ' + Number(p.price).toLocaleString('id-ID') : '-';
            return '<div class="stc" data-idx="' + idx + '" style="cursor:pointer">'
                + '<div class="stc-img">'
                + (p.photo ? '<img src="' + p.photo + '" alt="">' : '<div class="stc-img-placeholder">📦</div>')
                + '</div>'
                + '<div class="stc-body">'
                + '<div class="stc-name">' + escapeHtml(p.name) + '</div>'
                + (p.description ? '<div class="stc-desc">' + escapeHtml(p.description) + '</div>' : '')
                + '<div class="stc-bottom">'
                + '<span class="stc-price">' + priceText + '</span>'
                + '<span class="stc-rating">Stok: ' + p.stock + '</span>'
                + '</div></div></div>';
        }).join('');

        list.querySelectorAll('.stc').forEach(function(card) {
            card.addEventListener('click', function() {
                var idx = parseInt(this.dataset.idx, 10);
                if (!products[idx]) return;
                _sdpSelectedProduct = products[idx];
                // Highlight selection
                list.querySelectorAll('.stc').forEach(function(c) { c.style.border = ''; });
                this.style.border = '2px solid #FF6B00';
                if (footerEl) footerEl.style.display = '';
            });
        });
    }

    // ══════════════════════════════════════════
    // ═══ PRODUCT ORDER FLOW ═══
    // ══════════════════════════════════════════
    function createProductOrder(product, store) {
        var session = getSession();
        if (!session) { showToast('Silakan login terlebih dahulu', 'error'); return; }
        if (session.role !== 'user') { showToast('Hanya user yang bisa memesan', 'error'); return; }
        if (!store) { showToast('Data toko tidak ditemukan', 'error'); return; }

        var price = Number(product.price) || 0;
        var deliveryFee = 3000; // default, will use settings
        var orderId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);

        var orderData = {
            action: 'createOrder',
            id: orderId,
            userId: session.id,
            talentId: store.userId, // penjual acts as fulfiller
            skillType: 'js_food',
            serviceType: product.name,
            description: 'Produk dari ' + store.name,
            price: price + deliveryFee,
            fee: Math.round(price * 0.1),
            userLat: session.lat || 0,
            userLng: session.lng || 0,
            userAddr: session.address || '',
            talentLat: store.lat || 0,
            talentLng: store.lng || 0
        };

        showToast('Membuat pesanan...', 'success');
        backendPost(orderData).then(function(res) {
            if (res && res.success) {
                var order = res.data || orderData;
                order.status = 'pending';
                order.createdAt = Date.now();
                order.talentName = store.name;
                order.userName = session.name;
                showToast('Pesanan berhasil dibuat!', 'success');
                document.getElementById('storeDetailPage').classList.add('hidden');
                document.getElementById('storeListPage').classList.add('hidden');
                openOrderTracking(order);
            } else {
                showToast('Gagal membuat pesanan: ' + ((res && res.message) || 'Error'), 'error');
            }
        }).catch(function() {
            showToast('Gagal membuat pesanan', 'error');
        });
    }

    // ══════════════════════════════════════════
    // ═══ CS DASHBOARD ═══
    // ══════════════════════════════════════════
    var _csOrdersData = [];
    var _csCurrentFilter = 'active';

    function loadCSDashboard() {
        loadCSOrders();
        loadCSUsers();
    }

    function loadCSOrders() {
        var listEl = document.getElementById('csOrdersList');
        if (listEl) listEl.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat pesanan...</p></div>';
        if (!isBackendConnected()) return;
        FB.get('getAllOrders')
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success && res.data) {
                    _csOrdersData = res.data;
                    renderCSOrders(_csCurrentFilter);
                    // Update stats
                    var active = res.data.filter(function(o) { return ['accepted','on_the_way','arrived','in_progress'].indexOf(o.status) >= 0; }).length;
                    var completed = res.data.filter(function(o) { return o.status === 'completed' || o.status === 'rated'; }).length;
                    var pending = res.data.filter(function(o) { return o.status === 'pending'; }).length;
                    var el = function(id) { return document.getElementById(id); };
                    if (el('csStatActive')) el('csStatActive').textContent = active;
                    if (el('csStatCompleted')) el('csStatCompleted').textContent = completed;
                    if (el('csStatPending')) el('csStatPending').textContent = pending;
                }
            }).catch(function() {
                if (listEl) listEl.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">❌</div><p>Gagal memuat pesanan</p></div>';
            });
    }

    function renderCSOrders(filter) {
        _csCurrentFilter = filter;
        var listEl = document.getElementById('csOrdersList');
        if (!listEl) return;
        var users = getUsers();
        var filtered = _csOrdersData;
        if (filter === 'active') {
            filtered = filtered.filter(function(o) { return ['accepted','on_the_way','arrived','in_progress'].indexOf(o.status) >= 0; });
        } else if (filter === 'pending') {
            filtered = filtered.filter(function(o) { return o.status === 'pending'; });
        } else if (filter === 'completed') {
            filtered = filtered.filter(function(o) { return o.status === 'completed' || o.status === 'rated'; });
        }
        // Sort newest first
        filtered = filtered.slice().sort(function(a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });

        if (filtered.length === 0) {
            listEl.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📭</div><p>Tidak ada pesanan</p></div>';
            return;
        }
        listEl.innerHTML = filtered.map(function(o, idx) {
            var user = users.find(function(u) { return u.id === o.userId; });
            var talent = users.find(function(u) { return u.id === o.talentId; });
            var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
            var dateText = new Date(Number(o.createdAt)).toLocaleDateString('id-ID', { day:'numeric', month:'short' });
            var statusText = STATUS_LABELS[o.status] || o.status;
            return '<div class="olp-card" data-idx="' + idx + '">'
                + '<div class="olp-card-top">'
                + '<div class="olp-card-service">' + escapeHtml(o.serviceType || o.skillType || '-') + '</div>'
                + '<span class="otp-status-badge status-' + o.status + '">' + statusText + '</span>'
                + '</div>'
                + '<div class="olp-card-name">👤 ' + escapeHtml(user ? user.name : o.userId) + ' → 🏍️ ' + escapeHtml(talent ? talent.name : o.talentId) + '</div>'
                + '<div class="olp-card-bottom"><span class="olp-card-price">' + priceText + '</span><span class="olp-card-date">' + dateText + '</span></div>'
                + '</div>';
        }).join('');

        listEl.querySelectorAll('.olp-card').forEach(function(card) {
            card.addEventListener('click', function() {
                var idx = parseInt(this.dataset.idx, 10);
                if (filtered[idx]) openOrderTracking(filtered[idx]);
            });
        });
    }

    function loadCSUsers() {
        var listEl = document.getElementById('csUserList');
        if (!listEl) return;
        var users = getUsers();
        if (users.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>Belum ada pengguna</p></div>';
            return;
        }
        var roleColors = { user: '#FF6B00', talent: '#3B82F6', penjual: '#22C55E', cs: '#8B5CF6', owner: '#111111' };
        var roleLabels = { user: 'User', talent: 'Talent', penjual: 'Penjual', cs: 'CS', owner: 'Owner' };
        listEl.innerHTML = users.map(function(u) {
            var initial = (u.name || 'U').charAt(0).toUpperCase();
            return '<div class="user-list-item">'
                + '<div class="user-list-avatar" style="background:' + (roleColors[u.role] || '#999') + '">' + initial + '</div>'
                + '<div class="user-list-info">'
                + '<div class="user-list-name">' + escapeHtml(u.name) + ' <small style="color:#999">@' + escapeHtml(u.username) + '</small></div>'
                + '<span class="user-list-role">' + (roleLabels[u.role] || u.role) + '</span>'
                + '</div></div>';
        }).join('');
    }

    function setupCSDashboard() {
        // Tab filters
        var tabsEl = document.getElementById('csOrderTabs');
        if (tabsEl && !tabsEl._eventsSetup) {
            tabsEl._eventsSetup = true;
            tabsEl.querySelectorAll('.olp-tab').forEach(function(tab) {
                tab.addEventListener('click', function() {
                    tabsEl.querySelectorAll('.olp-tab').forEach(function(t) { t.classList.remove('active'); });
                    this.classList.add('active');
                    renderCSOrders(this.dataset.filter);
                });
            });
        }
        var refreshOrders = document.getElementById('csRefreshOrders');
        if (refreshOrders && !refreshOrders._eventsSetup) {
            refreshOrders._eventsSetup = true;
            refreshOrders.addEventListener('click', function() { loadCSOrders(); showToast('Pesanan diperbarui', 'success'); });
        }
        var refreshUsers = document.getElementById('csRefreshUsers');
        if (refreshUsers && !refreshUsers._eventsSetup) {
            refreshUsers._eventsSetup = true;
            refreshUsers.addEventListener('click', function() { loadCSUsers(); showToast('Pengguna diperbarui', 'success'); });
        }
    }

    // ══════════════════════════════════════════
    // ═══════════  JS ANTAR (OJEK)  ════════════
    // ══════════════════════════════════════════
    var _japMap = null;
    var _japPickupMarker = null;
    var _japDestMarker = null;
    var _japRouteLine = null;
    var _japPickupCoords = null;  // { lat, lng }
    var _japDestCoords = null;    // { lat, lng }
    var _japDestAddress = '';
    var _japSuggestTimer = null;
    var _japRouteDistKm = 0;
    var _japPricePerKm = 3000;   // default, updated from settings
    var _japBaseFare = 5000;     // base fare
    var _japEventsSetup = false;
    var _japPickOnMapMode = false; // true = next map tap sets destination

    function openJSAntarPage() {
        var page = document.getElementById('jsAntarPage');
        if (!page) return;
        page.classList.remove('hidden');
        // Reset state
        _japDestCoords = null;
        _japDestAddress = '';
        _japRouteDistKm = 0;
        _japPickOnMapMode = false;
        document.getElementById('japInfoRow').classList.add('hidden');
        document.getElementById('japNoteWrap').classList.add('hidden');
        document.getElementById('japBtnOrder').disabled = true;
        document.getElementById('japBtnOrder').textContent = '🏍️ Temukan Driver';
        document.getElementById('japDestInput').value = '';
        document.getElementById('japDestSuggestions').classList.add('hidden');
        document.getElementById('japDestSuggestions').innerHTML = '';
        document.getElementById('japPickupText').textContent = '📍 Mendeteksi lokasi...';
        var hint = document.getElementById('japMapPickHint');
        if (hint) hint.classList.add('hidden');

        // Setup events once
        if (!_japEventsSetup) {
            _japEventsSetup = true;
            document.getElementById('japBtnBack').addEventListener('click', closeJSAntarPage);
            document.getElementById('japDestInput').addEventListener('input', onJapDestInput);
            document.getElementById('japDestInput').addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); document.getElementById('japDestSuggestions').classList.add('hidden'); }
            });
            document.getElementById('japBtnOrder').addEventListener('click', onJapOrderClick);
            // "Pilih di Peta" button — enters map-pick mode
            var btnPickMap = document.getElementById('japBtnPickOnMap');
            if (btnPickMap) {
                btnPickMap.addEventListener('click', function() {
                    _japPickOnMapMode = true;
                    var h = document.getElementById('japMapPickHint');
                    if (h) h.classList.remove('hidden');
                    // Scroll map into view
                    var mapEl = document.getElementById('japMap');
                    if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
                });
            }
            var btnCancelPick = document.getElementById('japBtnCancelMapPick');
            if (btnCancelPick) {
                btnCancelPick.addEventListener('click', function() {
                    _japPickOnMapMode = false;
                    var h = document.getElementById('japMapPickHint');
                    if (h) h.classList.add('hidden');
                });
            }
            document.addEventListener('click', function(e) {
                var sugg = document.getElementById('japDestSuggestions');
                var input = document.getElementById('japDestInput');
                if (sugg && !sugg.contains(e.target) && e.target !== input) {
                    sugg.classList.add('hidden');
                }
            });
        }

        // Fetch pricing settings
        if (isBackendConnected()) {
            FB.get('getSettings')
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res.success && res.data) {
                        _japPricePerKm = Number(res.data.delivery_fee_per_km) || 3000;
                        _japBaseFare = Number(res.data.minimum_fee) || 5000;
                    }
                })
                .catch(function() {});
        }

        // Init or re-init map after page is visible
        setTimeout(function() {
            initJapMap();
        }, 100);
    }

    function closeJSAntarPage() {
        var page = document.getElementById('jsAntarPage');
        if (page) page.classList.add('hidden');
        // Clean up map layers to free memory
        if (_japMap) {
            if (_japRouteLine) { _japMap.removeLayer(_japRouteLine); _japRouteLine = null; }
        }
    }

    function initJapMap() {
        var session = getSession();
        var lat = (session && session.lat) ? Number(session.lat) : -6.2088;
        var lng = (session && session.lng) ? Number(session.lng) : 106.8456;

        if (_japMap) {
            _japMap.invalidateSize();
            _japMap.setView([lat, lng], 15);
            if (_japPickupMarker) _japPickupMarker.setLatLng([lat, lng]);
            else _japPickupMarker = createJapMarker(lat, lng, 'pickup').addTo(_japMap);
            _japPickupCoords = { lat: lat, lng: lng };
            updateJapPickupText(session && session.address ? session.address : null, lat, lng);
            return;
        }

        _japMap = L.map('japMap', { zoomControl: false }).setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(_japMap);
        L.control.zoom({ position: 'topright' }).addTo(_japMap);

        // Pickup marker (green)
        _japPickupMarker = createJapMarker(lat, lng, 'pickup').addTo(_japMap);
        _japPickupCoords = { lat: lat, lng: lng };

        // Update pickup text
        if (session && session.address) {
            updateJapPickupText(session.address, lat, lng);
        } else {
            reverseGeocode(lat, lng).then(function(addr) {
                updateJapPickupText(addr, lat, lng);
            });
        }

        // Map click — set pickup (default) or destination (pick-on-map mode)
        _japMap.on('click', function(e) {
            if (_japPickOnMapMode) {
                // Set destination by tapping map
                _japPickOnMapMode = false;
                var hint = document.getElementById('japMapPickHint');
                if (hint) hint.classList.add('hidden');
                reverseGeocode(e.latlng.lat, e.latlng.lng).then(function(addr) {
                    selectJapDestination(e.latlng.lat, e.latlng.lng, addr);
                    var inp = document.getElementById('japDestInput');
                    if (inp) inp.value = addr.split(',').slice(0, 2).join(',').trim();
                });
            } else if (!_japDestCoords) {
                // No destination yet — update pickup point
                _japPickupCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
                _japPickupMarker.setLatLng(e.latlng);
                reverseGeocode(e.latlng.lat, e.latlng.lng).then(function(addr) {
                    updateJapPickupText(addr, e.latlng.lat, e.latlng.lng);
                });
            }
        });
    }

    function createJapMarker(lat, lng, type) {
        var color = type === 'pickup' ? '#22C55E' : '#FF6B00';
        var emoji = type === 'pickup' ? '🟢' : '🔴';
        var label = type === 'pickup' ? 'Jemput' : 'Antar';
        var icon = L.divIcon({
            html: '<div style="background:' + color + ';color:#fff;font-size:11px;font-weight:700;padding:4px 8px;border-radius:20px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3);">' + emoji + ' ' + label + '</div>',
            className: '',
            iconAnchor: [30, 20]
        });
        return L.marker([lat, lng], { icon: icon });
    }

    function updateJapPickupText(addr, lat, lng) {
        var el = document.getElementById('japPickupText');
        if (!el) return;
        if (addr) {
            el.textContent = addr;
        } else {
            reverseGeocode(lat, lng).then(function(a) { el.textContent = a; });
        }
    }

    function onJapDestInput() {
        var val = this.value.trim();
        if (_japSuggestTimer) clearTimeout(_japSuggestTimer);
        var sugg = document.getElementById('japDestSuggestions');
        if (val.length < 3) {
            sugg.classList.add('hidden');
            sugg.innerHTML = '';
            return;
        }
        sugg.classList.remove('hidden');
        sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--gray-400)">Mencari...</div>';
        _japSuggestTimer = setTimeout(function() {
            searchPlaces(val);
        }, 600);
    }

    function searchPlaces(query) {
        // Bias results near user location
        var lat = _japPickupCoords ? _japPickupCoords.lat : -6.2088;
        var lng = _japPickupCoords ? _japPickupCoords.lng : 106.8456;
        var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query)
            + '&format=json&limit=6&accept-language=id&countrycodes=id'
            + '&viewbox=' + (lng - 0.5) + ',' + (lat + 0.5) + ',' + (lng + 0.5) + ',' + (lat - 0.5)
            + '&bounded=0';
        fetch(url)
            .then(function(r) { return r.json(); })
            .then(function(results) {
                renderJapSuggestions(results);
            })
            .catch(function() {
                var sugg = document.getElementById('japDestSuggestions');
                if (sugg) sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--red)">Gagal mencari lokasi</div>';
            });
    }

    function renderJapSuggestions(results) {
        var sugg = document.getElementById('japDestSuggestions');
        if (!sugg) return;
        if (!results || results.length === 0) {
            sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--gray-400)">Tidak ditemukan</div>';
            return;
        }
        sugg.innerHTML = '';
        results.forEach(function(r) {
            var parts = (r.display_name || '').split(',');
            var name = parts[0].trim();
            var addr = parts.slice(1, 4).join(',').trim();
            var item = document.createElement('div');
            item.className = 'jap-suggestion-item';
            item.innerHTML = '<div class="jap-suggestion-name">' + escapeHtml(name) + '</div>'
                + (addr ? '<div class="jap-suggestion-addr">' + escapeHtml(addr) + '</div>' : '');
            item.addEventListener('click', function() {
                selectJapDestination(Number(r.lat), Number(r.lon), r.display_name || name);
            });
            sugg.appendChild(item);
        });
        sugg.classList.remove('hidden');
    }

    function selectJapDestination(lat, lng, displayName) {
        _japDestCoords = { lat: lat, lng: lng };
        _japDestAddress = displayName;
        document.getElementById('japDestInput').value = displayName.split(',').slice(0, 2).join(',').trim();
        document.getElementById('japDestSuggestions').classList.add('hidden');

        // Place/update dest marker on map
        if (_japDestMarker) {
            _japDestMarker.setLatLng([lat, lng]);
        } else {
            _japDestMarker = createJapMarker(lat, lng, 'dest').addTo(_japMap);
        }

        // Fit both markers in view
        if (_japPickupCoords && _japMap) {
            var bounds = L.latLngBounds(
                [_japPickupCoords.lat, _japPickupCoords.lng],
                [lat, lng]
            );
            _japMap.fitBounds(bounds, { padding: [40, 40] });
        }

        // Draw route and calculate distance
        fetchJapRoute(_japPickupCoords.lat, _japPickupCoords.lng, lat, lng);
    }

    function fetchJapRoute(fromLat, fromLng, toLat, toLng) {
        var url = 'https://router.project-osrm.org/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=full&geometries=geojson';
        fetch(url)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var distKm = 0;
                var durationMin = 0;
                if (data.routes && data.routes.length > 0) {
                    distKm = data.routes[0].distance / 1000;
                    durationMin = Math.round(data.routes[0].duration / 60);
                    // Draw polyline
                    var coords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
                    if (_japRouteLine) _japMap.removeLayer(_japRouteLine);
                    _japRouteLine = L.polyline(coords, { color: '#FF6B00', weight: 5, opacity: 0.85 }).addTo(_japMap);
                } else {
                    // Fallback straight line
                    distKm = haversineDistance(fromLat, fromLng, toLat, toLng);
                    durationMin = Math.round(distKm / 0.4); // ~24 km/h average
                    if (_japRouteLine) _japMap.removeLayer(_japRouteLine);
                    _japRouteLine = L.polyline([[fromLat, fromLng], [toLat, toLng]], { color: '#FF6B00', weight: 4, dashArray: '10,10' }).addTo(_japMap);
                }
                _japRouteDistKm = distKm;
                updateJapPriceInfo(distKm, durationMin);
            })
            .catch(function() {
                var distKm = haversineDistance(fromLat, fromLng, toLat, toLng);
                var durationMin = Math.round(distKm / 0.4);
                _japRouteDistKm = distKm;
                updateJapPriceInfo(distKm, durationMin);
            });
    }

    function updateJapPriceInfo(distKm, durationMin) {
        var price = Math.max(_japBaseFare, Math.round(_japPricePerKm * distKm));
        // Round to nearest 500
        price = Math.ceil(price / 500) * 500;

        var distText = distKm < 1
            ? Math.round(distKm * 1000) + ' m'
            : distKm.toFixed(1) + ' km';
        var etaText = durationMin < 1 ? '< 1 menit' : durationMin + ' menit';
        var priceText = 'Rp ' + price.toLocaleString('id-ID');

        document.getElementById('japDistance').textContent = distText;
        document.getElementById('japEta').textContent = etaText;
        document.getElementById('japPrice').textContent = priceText;
        document.getElementById('japInfoRow').classList.remove('hidden');
        document.getElementById('japNoteWrap').classList.remove('hidden');

        var btn = document.getElementById('japBtnOrder');
        btn.disabled = false;
        btn.textContent = '🏍️ Pesan Driver — ' + priceText;
        btn.dataset.price = price;
    }

    function onJapOrderClick() {
        if (!_japPickupCoords || !_japDestCoords) {
            showToast('Tentukan titik jemput dan tujuan dulu!', 'error');
            return;
        }
        var session = getSession();
        if (!session) { showToast('Login dulu ya!', 'error'); return; }
        if (!isBackendConnected()) {
            showToast('Tidak ada koneksi ke server', 'error');
            return;
        }
        var price = Number(document.getElementById('japBtnOrder').dataset.price) || 0;
        var note = (document.getElementById('japNote').value || '').trim();
        var pickupAddr = document.getElementById('japPickupText').textContent || '';
        var destAddr = document.getElementById('japDestInput').value || _japDestAddress;

        var btn = document.getElementById('japBtnOrder');
        btn.disabled = true;
        btn.textContent = '⏳ Mencari driver...';

        // Build service description
        var desc = 'Antar dari: ' + pickupAddr + '\nTujuan: ' + destAddr + '\nJarak: ' + _japRouteDistKm.toFixed(1) + ' km';
        if (note) desc += '\nCatatan: ' + note;

        // Calculate fee (platform commission)
        var fee = Math.round(price * 0.1); // 10% platform

        var orderData = {
            action: 'createOrder',
            userId: session.id,
            talentId: '',  // will be assigned when driver accepts
            skillType: 'js_antar',
            serviceType: 'JS Antar Motor',
            description: desc,
            price: price,
            fee: fee,
            userLat: _japPickupCoords.lat,
            userLng: _japPickupCoords.lng,
            userAddr: pickupAddr,
            destLat: _japDestCoords.lat,
            destLng: _japDestCoords.lng,
            destAddr: destAddr,
            distanceKm: _japRouteDistKm
        };

        backendPost(orderData).then(function(res) {
            if (res && res.success && res.data) {
                closeJSAntarPage();
                showToast('Pesanan dibuat! Menunggu driver... 🏍️', 'success');
                // Open order tracking immediately
                var order = res.data;
                openOrderTracking(order);
            } else {
                btn.disabled = false;
                btn.textContent = '🏍️ Pesan Driver — Rp ' + price.toLocaleString('id-ID');
                showToast('Gagal membuat pesanan: ' + ((res && res.message) || 'coba lagi'), 'error');
            }
        }).catch(function() {
            btn.disabled = false;
            btn.textContent = '🏍️ Pesan Driver — Rp ' + price.toLocaleString('id-ID');
            showToast('Koneksi error, coba lagi', 'error');
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
                    if (page === 'pesanan') {
                        openOrdersList();
                    } else if (page === 'chat') {
                        clearChatBadge();
                        openOrdersList();
                    } else if (page === 'tickets' || page === 'reports') {
                        openAdminTransactions();
                    } else if (page === 'products') {
                        // Penjual: scroll to products section
                        var prodSec = document.getElementById('penjualProductsSection');
                        if (prodSec) prodSec.scrollIntoView({ behavior: 'smooth' });
                    } else if (page === 'earning') {
                        showToast('Rincian pendapatan segera hadir! 🚀');
                    } else if (page === 'home') {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    } else if (page === 'akun' || page === 'profil' || page === 'settings') {
                        openSettingsPage();
                    } else if (page === 'users') {
                        // Owner/CS: scroll to user list
                        var userListSec = document.getElementById('ownerUserList') || document.getElementById('csUserList');
                        if (userListSec) userListSec.scrollIntoView({ behavior: 'smooth' });
                    } else if (page === 'cs-manage') {
                        var csFormSec = document.getElementById('createCSForm');
                        if (csFormSec) csFormSec.scrollIntoView({ behavior: 'smooth' });
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
        setupTalentSkills();
        setupUserSearch();
        setupPromoSlider();
        setupServiceClicks();
        setupBottomNav();
        setupCSDashboard();
        setupProductPhotoUpload();

        // Penjual: store form
        var storeForm = document.getElementById('storeForm');
        if (storeForm) storeForm.addEventListener('submit', handleStoreFormSubmit);

        // Penjual: store toggle
        var storeToggle = document.getElementById('penjualStoreToggle');
        if (storeToggle) storeToggle.addEventListener('change', handlePenjualStoreToggle);

        // Penjual: notif button
        var penjualNotifBtn = document.getElementById('penjualNotifBtn');
        if (penjualNotifBtn) penjualNotifBtn.addEventListener('click', function() { openNotifPopup(); });

        // Penjual: add product button
        var btnAddProduct = document.getElementById('btnAddProduct');
        if (btnAddProduct) btnAddProduct.addEventListener('click', openAddProductModal);

        // Product modal close
        var btnCloseProduct = document.getElementById('btnCloseProductModal');
        if (btnCloseProduct) btnCloseProduct.addEventListener('click', function() {
            document.getElementById('addProductModal').classList.add('hidden');
        });
        var addProductModal = document.getElementById('addProductModal');
        if (addProductModal) addProductModal.addEventListener('click', function(e) {
            if (e.target === addProductModal) addProductModal.classList.add('hidden');
        });

        // Product form submit
        var addProductForm = document.getElementById('addProductForm');
        if (addProductForm) addProductForm.addEventListener('submit', handleProductFormSubmit);

        // Owner: commission form
        var commissionForm = document.getElementById('commissionForm');
        if (commissionForm) commissionForm.addEventListener('submit', handleCommissionFormSubmit);

        // Owner: transactions button
        var ownerBtnTransactions = document.getElementById('ownerBtnTransactions');
        if (ownerBtnTransactions) ownerBtnTransactions.addEventListener('click', openAdminTransactions);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
