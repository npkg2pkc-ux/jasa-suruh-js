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
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwsaf8pIMlOCrBCQuysrrpyWyDBFsBbXIYR2xOFWsrjsfzk9lmuET5ks4T-f0-kdnBF/exec';

    function isSheetConnected() {
        return SCRIPT_URL && SCRIPT_URL !== 'https://script.google.com/u/0/home/projects/1smH0v_6MSS_l0yBh3jH79Klst4kroO-mPysZbA83SDtelB5kpb3yGmdD/edit';
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
                // Update Google Sheet
                sheetPost({ action: 'updateLocation', userId: userId, lat: pos.lat, lng: pos.lng, address: address });
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
            // Sync owner ke Google Sheet
            sheetPost({ action: 'register', ...ownerData });
        }
        // Sync dari Google Sheet ke localStorage saat init
        syncFromSheet();
        syncSkillsFromSheet();
    }

    // ── Sync: Ambil semua data dari Google Sheet ke localStorage ──
    function syncFromSheet() {
        if (!isSheetConnected()) return;
        fetch(SCRIPT_URL + '?action=getAll')
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

    // ── Helper: POST ke Google Sheet ──
    function sheetPost(body) {
        if (!isSheetConnected()) return Promise.resolve(null);
        return fetch(SCRIPT_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(body)
        })
        .then(r => r.json())
        .catch(err => {
            console.error('Google Sheet POST error:', err);
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
            displayUserAddress(user);
            captureLocation(user.id);
        } else if (role === 'talent') {
            const el = document.getElementById('talentName');
            if (el) el.textContent = user.name || 'Talent';
            displayUserAddress(user);
            captureLocation(user.id);
            renderTalentSkills();
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

        // Simpan ke Google Sheet (sumber utama)
        sheetPost({ action: 'register', ...newUser }).then(res => {
            if (res && res.success) {
                // Berhasil disimpan di Sheet, update localStorage juga
                const users = getUsers();
                users.push(res.data || newUser);
                saveUsers(users);
                setSession(res.data || newUser);
                showToast('Akun berhasil dibuat!', 'success');
                showPage(role);
                document.getElementById('registerForm').reset();
                document.getElementById('regRole').value = 'user';
            } else if (res && !res.success) {
                showToast(res.message || 'Gagal mendaftar', 'error');
            } else {
                // Fallback: Sheet tidak tersambung, simpan lokal saja
                const users = getUsers();
                if (users.some(u => u.username === username)) {
                    showToast('Username sudah digunakan!', 'error');
                    return;
                }
                users.push(newUser);
                saveUsers(users);
                setSession(newUser);
                showToast('Akun berhasil dibuat (offline)!', 'success');
                showPage(role);
                document.getElementById('registerForm').reset();
                document.getElementById('regRole').value = 'user';
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

    // ── Skills Storage ──
    const STORAGE_SKILLS = 'js_skills';
    const STORAGE_PHOTOS = 'js_skill_photos'; // Photos stored separately (not sent to Sheet)

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

    // Photo storage (separate from skills, never sent to Google Sheet)
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

    // Strip photo from skills before sending to Google Sheet
    function skillsForSheet(skillArr) {
        return skillArr.map(function (s) {
            var copy = {};
            for (var k in s) { if (k !== 'photo') copy[k] = s[k]; }
            return copy;
        });
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
                const photo = photoData.startsWith('data:') ? photoData : '';
                const price = parseInt(document.getElementById('sfPrice').value) || 0;

                if (!serviceType || !description || price < 1000) {
                    showToast('Lengkapi semua data! Harga minimal Rp 1.000', 'error');
                    return;
                }

                const def = SKILL_DEFS.find(d => d.type === skillType);
                const skills = getUserSkills(session.id);
                // Remove existing of same type
                const filtered = skills.filter(s => s.type !== skillType);
                filtered.push({
                    type: skillType,
                    name: def ? def.name : skillType,
                    serviceType: serviceType,
                    description: description,
                    price: price
                });
                setUserSkills(session.id, filtered);

                // Save photo separately in localStorage (not sent to Sheet)
                if (photo) {
                    saveSkillPhoto(session.id, skillType, photo);
                } else {
                    removeSkillPhoto(session.id, skillType);
                }

                // Sync to Sheet without photo data
                sheetPost({ action: 'updateSkills', userId: session.id, skills: skillsForSheet(filtered) });

                formModal.classList.add('hidden');
                detailForm.reset();
                document.getElementById('sfPhotoImg').src = '';
                document.getElementById('sfPhotoPreview').style.display = 'none';
                document.getElementById('sfBtnUpload').style.display = '';
                feeInfo.innerHTML = '';
                renderTalentSkills();
                showToast('"' + (def ? def.name : skillType) + '" berhasil ditambahkan!', 'success');
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
        sheetPost({ action: 'updateSkills', userId: session.id, skills: skillsForSheet(skills) });
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
                // Restore photo preview from separate photo storage
                const existingPhoto = getSkillPhoto(session.id, type);
                if (existingPhoto) {
                    document.getElementById('sfPhotoImg').src = existingPhoto;
                    document.getElementById('sfPhotoPreview').style.display = 'block';
                    document.getElementById('sfBtnUpload').style.display = 'none';
                } else {
                    document.getElementById('sfPhotoImg').src = '';
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
        sheetPost({ action: 'updateSkills', userId: session.id, skills: skillsForSheet(filtered) });
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

    // Sync skills from Sheet
    function syncSkillsFromSheet() {
        if (!isSheetConnected()) return;
        fetch(SCRIPT_URL + '?action=getAllSkills')
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
    var ACTIVE_SERVICES = ['js_clean'];

    function setupServiceClicks() {
        document.querySelectorAll('.service-item').forEach(item => {
            item.addEventListener('click', function () {
                var name = this.querySelector('.service-name').textContent;
                var skillType = SERVICE_TYPE_MAP[name];
                if (skillType && ACTIVE_SERVICES.indexOf(skillType) >= 0) {
                    openServiceTalentModal(skillType);
                } else {
                    showToast('Layanan "' + name + '" segera hadir! 🚀');
                }
            });
        });
    }

    function openServiceTalentModal(skillType) {
        var modal = document.getElementById('serviceTalentModal');
        var body = document.getElementById('serviceTalentBody');
        var title = document.getElementById('serviceTalentTitle');
        var btnClose = document.getElementById('btnCloseServiceTalent');
        if (!modal || !body) return;

        var def = SKILL_DEFS.find(function (d) { return d.type === skillType; });
        if (title) title.textContent = (def ? def.icon + ' ' + def.name : 'Talent Tersedia');

        // Get current user for distance calc
        var session = getSession();
        var myLat = session ? (session.lat || 0) : 0;
        var myLng = session ? (session.lng || 0) : 0;

        var users = getUsers();
        var allSkills = getSkills();

        // Find talents with this skill type
        var talents = users
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
                return { user: u, skill: skill, distance: dist };
            })
            .filter(function (r) { return r !== null; })
            .sort(function (a, b) {
                if (a.distance >= 0 && b.distance >= 0) return a.distance - b.distance;
                if (a.distance >= 0) return -1;
                if (b.distance >= 0) return 1;
                return 0;
            });

        if (talents.length === 0) {
            body.innerHTML = '<div class="stm-empty"><div class="empty-icon">😔</div><h3>Belum Ada Talent</h3><p>Belum ada talent yang menawarkan layanan ini.</p></div>';
        } else {
            body.innerHTML = talents.map(function (t) {
                var initial = (t.user.name || 'T').charAt(0).toUpperCase();
                var distText = '';
                if (t.distance >= 0) {
                    distText = t.distance < 1 ? (t.distance * 1000).toFixed(0) + ' m' : t.distance.toFixed(1) + ' km';
                }
                var priceText = t.skill.price ? 'Rp ' + Number(t.skill.price).toLocaleString('id-ID') : '';
                var serviceType = t.skill.serviceType ? escapeHtml(t.skill.serviceType) : '';
                var desc = t.skill.description ? escapeHtml(t.skill.description) : '';
                var addressText = t.user.address ? escapeHtml(t.user.address) : '';

                return '<div class="stm-card">'
                    + '<div class="stm-card-left">'
                    + '<div class="stm-avatar">' + initial + '</div>'
                    + '</div>'
                    + '<div class="stm-card-info">'
                    + '<div class="stm-name">' + escapeHtml(t.user.name) + '</div>'
                    + (serviceType ? '<div class="stm-service-type">' + serviceType + '</div>' : '')
                    + (desc ? '<div class="stm-desc">' + desc + '</div>' : '')
                    + '<div class="stm-meta">'
                    + (priceText ? '<span class="stm-price">' + priceText + '</span>' : '')
                    + (distText ? '<span class="stm-distance">📍 ' + distText + '</span>' : (addressText ? '<span class="stm-distance">📍 ' + addressText + '</span>' : ''))
                    + '</div>'
                    + '</div>'
                    + '<div class="stm-card-action"><button class="btn-order-talent" data-uid="' + escapeHtml(t.user.id) + '">Pesan</button></div>'
                    + '</div>';
            }).join('');

            // Order button placeholder
            body.querySelectorAll('.btn-order-talent').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    showToast('Fitur pemesanan segera hadir! 🚀');
                });
            });
        }

        modal.classList.remove('hidden');

        // Close handlers
        function closeModal() { modal.classList.add('hidden'); }
        if (btnClose) btnClose.onclick = closeModal;
        modal.addEventListener('click', function (ev) {
            if (ev.target === modal) closeModal();
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
        setupTalentSkills();
        setupUserSearch();
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
