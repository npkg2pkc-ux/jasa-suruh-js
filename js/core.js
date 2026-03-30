/* ========================================
   JASA SURUH (JS) - Core Module
   Constants, Backend, Auth, Routing, Utils
   ======================================== */
'use strict';

// ══════════════════════════════════════════
// ═══ CONSTANTS ═══
// ══════════════════════════════════════════
var STORAGE_USERS = 'js_users';
var STORAGE_SESSION = 'js_session';
var STORAGE_SKILLS = 'js_skills';
var STORAGE_PHOTOS = 'js_skill_photos';
var STORAGE_PROFILE_PHOTOS = 'js_profile_photos';
var STORAGE_DELETED_COOLDOWNS = 'js_deleted_cooldowns';

// ══════════════════════════════════════════
// ═══ SHARED STATE (used across files) ═══
// ══════════════════════════════════════════
var _currentOrder = null;
var _otpMap = null;
var _otpTalentMarker = null;
var _otpUserMarker = null;
var _otpStoreMarker = null;
var _otpRouteLine = null;
var _otpRouteFlowLine = null;
var _locationPollTimer = null;
var _orderFallbackPollTimer = null;
var _chatPollTimer = null;
var _fbOrderUnsub = null;
var _fbLocUnsub = null;
var _fbMsgUnsub = null;
var _fbTalentOrdersUnsub = null;
var _fbPenjualOrdersUnsub = null;
var _chatOrderId = null;
var _chatTargetUserId = '';
var _chatOrderHasThreeParty = false;
var _chatMessages = [];
var _ratingOrder = null;
var _ratingValue = 0;
var _ordersListData = [];
var _talentRatingsCache = {};
var _sellerRatingsCache = {};
var _talentLastPendingIds = [];
var _talentDashPollTimer = null;
var _stpCurrentType = '';
var _stpAllTalents = [];
var _stpCurrentSort = 'nearest';
var _penjualStore = null;
var _penjualProducts = [];
var _penjualDashPollTimer = null;
var _csOrdersData = [];
var _csCurrentFilter = 'active';
var _slpAllStores = [];
var _slpCurrentCat = 'all';
var _slpCurrentStore = null;
var _sdpProducts = [];
var _sdpSelectedProduct = null;
var _japMap = null;
var _japPickupMarker = null;
var _japDestMarker = null;
var _japRouteLine = null;
var _japRouteFlowLine = null;
var _japPickupCoords = null;
var _japDestCoords = null;
var _japDestAddress = '';
var _japSuggestTimer = null;
var _japRouteDistKm = 0;
var _japPricePerKm = 3000;
var _japBaseFare = 5000;
var _japEventsSetup = false;
var _japPickOnMapMode = false;
var deferredPrompt = null;

// ══════════════════════════════════════════
// ═══ BACKEND HELPERS ═══
// ══════════════════════════════════════════
function isBackendConnected() {
    return typeof FB !== 'undefined' && FB.isReady();
}

function backendPost(body) {
    if (!isBackendConnected()) return Promise.resolve(null);
    return FB.post(body).catch(function (err) {
        console.error('Firebase POST error:', err);
        showToast('Gagal terhubung ke server. Cek koneksi internet.', 'error');
        return null;
    });
}

// ══════════════════════════════════════════
// ═══ GEOLOCATION HELPERS ═══
// ══════════════════════════════════════════
function getCurrentPosition() {
    return new Promise(function (resolve, reject) {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation tidak didukung'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            function (pos) {
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: Number(pos.coords.accuracy || 0)
                });
            },
            function (err) { reject(err); },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
        );
    });
}

function reverseGeocode(lat, lng) {
    return fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=id')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data && data.display_name) {
                var addr = data.address || {};
                var parts = [addr.suburb || addr.village || addr.neighbourhood || '', addr.city || addr.town || addr.county || '', addr.state || ''].filter(Boolean);
                return parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(',');
            }
            return 'Lat ' + lat.toFixed(4) + ', Lng ' + lng.toFixed(4);
        })
        .catch(function () { return 'Lat ' + lat.toFixed(4) + ', Lng ' + lng.toFixed(4); });
}

function captureLocation(userId) {
    getCurrentPosition().then(function (pos) {
        reverseGeocode(pos.lat, pos.lng).then(function (address) {
            var session = getSession();
            if (session && session.id === userId) {
                session.lat = pos.lat;
                session.lng = pos.lng;
                session.address = address;
                setSession(session);
                displayUserAddress(session);
            }
            var users = getUsers();
            var idx = users.findIndex(function (u) { return u.id === userId; });
            if (idx >= 0) {
                users[idx].lat = pos.lat;
                users[idx].lng = pos.lng;
                users[idx].address = address;
                saveUsers(users);
            }
            backendPost({ action: 'updateLocation', userId: userId, lat: pos.lat, lng: pos.lng, address: address });
        });
    }).catch(function () {
        var el = document.getElementById('userAddress') || document.getElementById('talentAddress');
        if (el) el.textContent = '📍 Lokasi tidak tersedia';
    });
}

function displayUserAddress(user) {
    if (user.role === 'user') {
        var el = document.getElementById('userAddress');
        if (el) el.textContent = '📍 ' + (user.address || 'Memuat lokasi...');
    } else if (user.role === 'talent') {
        var el2 = document.getElementById('talentAddress');
        if (el2) el2.textContent = '📍 ' + (user.address || 'Memuat lokasi...');
    }
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ══════════════════════════════════════════
// ═══ DATABASE & STORAGE ═══
// ══════════════════════════════════════════
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function initDB() {
    clearExpiredAccountDeletionCooldowns();
    syncFromBackend();
    syncSkillsFromBackend();
}

function _isUserAccountActiveForSession(user) {
    if (!user) return false;

    var status = String(user.status || user.accountStatus || '').toLowerCase();
    if (status === 'deleted' || status === 'inactive' || status === 'disabled' || status === 'banned' || status === 'suspended') {
        return false;
    }

    if (user.deleted === true || user.isDeleted === true || user.is_deleted === true) return false;
    if (Number(user.deletedAt || user.deleted_at || 0) > 0) return false;

    if (typeof user.is_active === 'boolean' && user.is_active === false) return false;
    if (typeof user.isActive === 'boolean' && user.isActive === false) return false;

    return true;
}

function syncFromBackend() {
    if (!isBackendConnected()) return;
    FB.get('getAll')
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && Array.isArray(res.data)) {
                saveUsers(res.data);
                var session = getSession();
                if (session && session.id) {
                    var liveUser = res.data.find(function (u) {
                        return String(u.id || '') === String(session.id || '');
                    });

                    if (!liveUser || !_isUserAccountActiveForSession(liveUser)) {
                        clearSession();
                        if (typeof showPage === 'function') showPage('login', false);
                        if (ROUTES && ROUTES.login) history.replaceState({ page: 'login' }, '', ROUTES.login);
                        if (typeof LoginPage !== 'undefined' && LoginPage.reset) LoginPage.reset();
                        if (typeof showToast === 'function') {
                            showToast('Sesi berakhir karena akun sudah dihapus atau tidak aktif.', 'error');
                        }
                        return;
                    }

                    setSession(Object.assign({}, session, liveUser));
                }

                if (session && session.role === 'owner') {
                    renderOwnerStats();
                    renderOwnerUsers();
                }
            }
        })
        .catch(function () {});
}

function getUsers() {
    try { return JSON.parse(localStorage.getItem(STORAGE_USERS)) || []; }
    catch (e) { return []; }
}

function saveUsers(users) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
}

function getSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_SESSION)); }
    catch (e) { return null; }
}

function setSession(user) {
    localStorage.setItem(STORAGE_SESSION, JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem(STORAGE_SESSION);
}

function getProfilePhoto(userId) {
    try { var p = JSON.parse(localStorage.getItem(STORAGE_PROFILE_PHOTOS)) || {}; return p[userId] || ''; }
    catch (e) { return ''; }
}

function saveProfilePhoto(userId, dataUrl) {
    try { var p = JSON.parse(localStorage.getItem(STORAGE_PROFILE_PHOTOS)) || {}; p[userId] = dataUrl; localStorage.setItem(STORAGE_PROFILE_PHOTOS, JSON.stringify(p)); }
    catch (e) {}
}

function normalizePhoneForCooldown(phone) {
    var cleaned = String(phone || '').replace(/\D/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
    else if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
    return cleaned;
}

function getDeletedCooldowns() {
    try { return JSON.parse(localStorage.getItem(STORAGE_DELETED_COOLDOWNS)) || {}; }
    catch (e) { return {}; }
}

function saveDeletedCooldowns(map) {
    localStorage.setItem(STORAGE_DELETED_COOLDOWNS, JSON.stringify(map || {}));
}

function clearExpiredAccountDeletionCooldowns() {
    var now = Date.now();
    var map = getDeletedCooldowns();
    var next = {};
    Object.keys(map).forEach(function (phone) {
        var item = map[phone] || {};
        var until = Number(item.blockedUntil || 0);
        if (until > now) next[phone] = item;
    });
    saveDeletedCooldowns(next);
}

function getAccountDeletionCooldownInfo(phone) {
    clearExpiredAccountDeletionCooldowns();
    var normalized = normalizePhoneForCooldown(phone);
    if (!normalized) return { blocked: false, remainingMs: 0, blockedUntil: 0 };

    var map = getDeletedCooldowns();
    var entry = map[normalized] || null;
    if (!entry) return { blocked: false, remainingMs: 0, blockedUntil: 0 };

    var blockedUntil = Number(entry.blockedUntil || 0);
    var remainingMs = Math.max(0, blockedUntil - Date.now());
    if (remainingMs <= 0) return { blocked: false, remainingMs: 0, blockedUntil: 0 };

    return {
        blocked: true,
        remainingMs: remainingMs,
        blockedUntil: blockedUntil,
        deletedAt: Number(entry.deletedAt || 0),
        role: entry.role || ''
    };
}

function setAccountDeletionCooldown(phone, durationMs, meta) {
    var normalized = normalizePhoneForCooldown(phone);
    if (!normalized) return;

    clearExpiredAccountDeletionCooldowns();
    var map = getDeletedCooldowns();
    var ms = Math.max(0, Number(durationMs) || (48 * 60 * 60 * 1000));
    map[normalized] = {
        blockedUntil: Date.now() + ms,
        deletedAt: Date.now(),
        role: (meta && meta.role) || ''
    };
    saveDeletedCooldowns(map);
}

// ── Skills Storage ──
function getSkills() {
    try { return JSON.parse(localStorage.getItem(STORAGE_SKILLS)) || {}; }
    catch (e) { return {}; }
}

function saveSkills(skills) {
    localStorage.setItem(STORAGE_SKILLS, JSON.stringify(skills));
}

function getUserSkills(userId) {
    var all = getSkills();
    return all[userId] || [];
}

function setUserSkills(userId, skillArr) {
    var all = getSkills();
    all[userId] = skillArr;
    saveSkills(all);
}

function getSkillPhotos() {
    try { return JSON.parse(localStorage.getItem(STORAGE_PHOTOS)) || {}; }
    catch (e) { return {}; }
}

function saveSkillPhoto(userId, skillType, dataUrl) {
    var photos = getSkillPhotos();
    if (!photos[userId]) photos[userId] = {};
    photos[userId][skillType] = dataUrl;
    localStorage.setItem(STORAGE_PHOTOS, JSON.stringify(photos));
}

function getSkillPhoto(userId, skillType) {
    var photos = getSkillPhotos();
    return (photos[userId] && photos[userId][skillType]) || '';
}

function removeSkillPhoto(userId, skillType) {
    var photos = getSkillPhotos();
    if (photos[userId]) {
        delete photos[userId][skillType];
        localStorage.setItem(STORAGE_PHOTOS, JSON.stringify(photos));
    }
}

function skillsForBackend(skillArr) {
    return skillArr.map(function (s) {
        var copy = {};
        for (var k in s) { copy[k] = s[k]; }
        return copy;
    });
}

function syncSkillsFromBackend() {
    if (!isBackendConnected()) return;
    FB.get('getAllSkills')
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                saveSkills(res.data);
            }
        })
        .catch(function () {});
}

// ══════════════════════════════════════════
// ═══ UI UTILITIES ═══
// ══════════════════════════════════════════
function showToast(msg, type) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'toast';
    var bg = type === 'error' ? '#EF4444' : type === 'success' ? '#22C55E' : '#FF6B00';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + bg + ';color:#fff;padding:12px 24px;border-radius:12px;font-family:var(--font);font-size:14px;font-weight:600;z-index:10000;box-shadow:0 4px 16px rgba(0,0,0,.2);animation:fadeInUp .3s ease;max-width:90%;text-align:center;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.style.opacity = '0'; setTimeout(function () { toast.remove(); }, 300); }, 3000);
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

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

var STATUS_LABELS = {
    pending: '⏳ Menunggu',
    accepted: '✅ Diterima',
    on_the_way: '🏍️ Menuju Lokasi',
    arrived: '📍 Tiba di Lokasi',
    in_progress: '🔨 Sedang Dikerjakan',
    completed: '✅ Selesai',
    rated: '⭐ Dinilai',
    cancelled: '❌ Dibatalkan'
};

var STATUS_LABELS_ANTAR = {
    pending: '⏳ Menunggu',
    accepted: '✅ Driver Ditemukan',
    on_the_way: '🏍️ Menuju Lokasi Jemput',
    arrived: '📍 Driver Tiba',
    in_progress: '🚀 Dalam Perjalanan',
    completed: '🏁 Sampai Tujuan',
    rated: '⭐ Dinilai',
    cancelled: '❌ Dibatalkan'
};

function getStatusLabel(status, skillType) {
    if (skillType === 'js_antar') return STATUS_LABELS_ANTAR[status] || status;
    return STATUS_LABELS[status] || status;
}

// Skill definitions (shared between talent and user)
var SKILL_DEFS = [
    { type: 'js_antar', name: 'JS Antar', icon: '🏍️', iconPath: 'jsantaricon.png', desc: 'Jasa antar barang & dokumen', hasForm: false },
    { type: 'js_shop', name: 'JS Shop', icon: '🛒', iconPath: 'jsshopicon.png', desc: 'Jasa belanja kebutuhan', hasForm: false },
    { type: 'js_food', name: 'JS Food', icon: '🍔', iconPath: 'jsfoodicon.png', desc: 'Jasa pesan & antar makanan', hasForm: false },
    { type: 'js_delivery', name: 'JS Delivery', icon: '📦', iconPath: 'jsdeliveryicon.png', desc: 'Jasa pengiriman paket', hasForm: false },
    { type: 'js_clean', name: 'JS Clean', icon: '🧹', iconPath: 'jscleanicon.png', desc: 'Jasa kebersihan rumah & lingkungan', hasForm: true },
    { type: 'js_service', name: 'JS Service', icon: '🔧', iconPath: 'jsserviceicon.png', desc: 'Jasa perbaikan & servis', hasForm: true },
    { type: 'js_medicine', name: 'JS Medicine', icon: '💊', iconPath: 'jsmedicineicon.png', desc: 'Jasa beli & antar obat', hasForm: false },
    { type: 'js_other', name: 'JS Other', icon: '📌', iconPath: 'jsothericon.png', desc: 'Jasa lainnya', hasForm: false }
];

// ══════════════════════════════════════════
// ═══ ROUTING ═══
// ══════════════════════════════════════════
var ROUTES = {
    login: '/login',
    register: '/daftar',
    user: '/home',
    talent: '/talent',
    penjual: '/penjual',
    cs: '/cs-panel',
    admin: '/admin-panel',
    owner: '/owner-panel'
};

function getHomePageForSession(session) {
    if (!session || !session.role) return 'login';
    var role = String(session.role).toLowerCase();
    if (role === 'pengguna' || role === 'customer') return 'user';
    if (role === 'admin') return 'owner';
    return role;
}

function _hideIfVisible(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    if (el.classList.contains('hidden')) return false;
    el.classList.add('hidden');
    return true;
}

function closeTransientUiLayers() {
    var closed = false;
    ['orderTrackingPage', 'chatPage', 'ratingPage', 'notifPopup', 'termsPage', 'privacyPage', 'storeListPage', 'storeDetailPage']
        .forEach(function (id) {
            if (_hideIfVisible(id)) closed = true;
        });

    document.querySelectorAll('.modal-overlay:not(.hidden), .stp-page:not(.hidden)').forEach(function (el) {
        el.classList.add('hidden');
        closed = true;
    });

    return closed;
}

function ensureAndroidBackToHomeGuard(force) {
    var session = getSession();
    if (!session) return;

    var home = getHomePageForSession(session);
    if (!ROUTES[home]) return;

    var state = history.state || {};
    if (!force && state.__jsBackGuard) return;

    history.replaceState({ page: home, __jsRoot: true }, '', ROUTES[home]);
    history.pushState({ page: home, __jsBackGuard: true }, '', ROUTES[home]);
}
window.ensureAndroidBackToHomeGuard = ensureAndroidBackToHomeGuard;

function pageFromPath(path) {
    var clean = path.replace(/\/+$/, '') || '/';
    for (var page in ROUTES) {
        if (clean === ROUTES[page]) return page;
    }
    if (clean === '/' || clean === '') return 'login';
    return null;
}

function showPage(pageName, pushState) {
    var pages = document.querySelectorAll('.page');
    pages.forEach(function (p) { p.classList.add('hidden'); });

    // Normalize role names — admin shares owner dashboard
    var ROLE_MAP = { pengguna: 'user', customer: 'user', admin: 'owner' };
    var resolved = ROLE_MAP[pageName] || pageName;

    var target = document.getElementById('page-' + resolved);
    if (!target) {
        // Fallback: show login page if target doesn't exist
        resolved = 'login';
        target = document.getElementById('page-login');
    }
    if (target) {
        target.classList.remove('hidden');
    }

    if (pushState !== false && ROUTES[resolved]) {
        var newPath = ROUTES[resolved];
        if (window.location.pathname !== newPath) {
            history.pushState({ page: resolved }, '', newPath);
        }
    }

    var titles = {
        login: 'Login - Jasa Suruh',
        register: 'Daftar - Jasa Suruh',
        user: 'Home - Jasa Suruh',
        talent: 'Talent - Jasa Suruh',
        penjual: 'Penjual - Jasa Suruh',
        cs: 'CS Panel - Jasa Suruh',
        admin: 'Admin Panel - Jasa Suruh',
        owner: 'Owner Panel - Jasa Suruh'
    };
    document.title = titles[pageName] || 'Jasa Suruh (JS)';
    window.scrollTo(0, 0);

    var session = getSession();
    if (session) {
        updateRoleUI(session);
    }
}
window.showPage = showPage;

window.addEventListener('popstate', function (e) {
    var session = getSession();

    if (e.state && e.state.page) {
        var target = e.state.page;

        if (session && e.state.__jsRoot) {
            var homeFromGuard = getHomePageForSession(session);
            closeTransientUiLayers();
            showPage(homeFromGuard, false);
            if (ROUTES[homeFromGuard] && window.location.pathname !== ROUTES[homeFromGuard]) {
                history.replaceState({ page: homeFromGuard, __jsRoot: true }, '', ROUTES[homeFromGuard]);
            }
            return;
        }

        if (!session && target !== 'login' && target !== 'register') {
            showPage('login', false);
            if (ROUTES.login) history.replaceState({ page: 'login' }, '', ROUTES.login);
            return;
        }

        if (session && (target === 'login' || target === 'register')) {
            var homeFromState = getHomePageForSession(session);
            showPage(homeFromState, false);
            if (ROUTES[homeFromState]) {
                history.replaceState({ page: homeFromState }, '', ROUTES[homeFromState]);
            }
            return;
        }
        showPage(target, false);
    } else {
        var page = pageFromPath(window.location.pathname);

        if (!session && page && page !== 'login' && page !== 'register') {
            showPage('login', false);
            if (ROUTES.login) history.replaceState({ page: 'login' }, '', ROUTES.login);
            return;
        }

        if (session && (!page || page === 'login' || page === 'register')) {
            var homeFromPath = getHomePageForSession(session);
            showPage(homeFromPath, false);
            if (ROUTES[homeFromPath]) {
                history.replaceState({ page: homeFromPath }, '', ROUTES[homeFromPath]);
            }
            return;
        }
        if (page) showPage(page, false);
    }
});

function updateRoleUI(user) {
    var role = user.role;
    // Start global message listener for chat notifications (all roles)
    startGlobalMessageListener();
    // Load wallet for all roles except CS
    if (role !== 'cs') loadUserWallet();
    if (role === 'user') {
        var el = document.getElementById('userName');
        if (el) el.textContent = user.name || 'User';
        displayUserAddress(user);
        captureLocation(user.id);
        setupUserNotifBtn(user.id);
        if (typeof setupHomeMarketingContent === 'function') setupHomeMarketingContent();
        initNotifications();
    } else if (role === 'talent') {
        var el2 = document.getElementById('talentName');
        if (el2) el2.textContent = user.name || 'Talent';
        if (typeof syncTalentOnlineToggleFromSession === 'function') {
            syncTalentOnlineToggleFromSession();
        }
        displayUserAddress(user);
        captureLocation(user.id);
        renderTalentSkills();
        loadTalentDashboardOrders();
        startTalentDashboardPolling();
        if (typeof refreshTalentPushStatus === 'function') {
            refreshTalentPushStatus(false);
        }
        initNotifications();
    } else if (role === 'penjual') {
        var el3 = document.getElementById('penjualName');
        if (el3) el3.textContent = user.name || 'Penjual';
        var addrEl = document.getElementById('penjualAddress');
        if (addrEl) addrEl.textContent = '📍 ' + (user.address || 'Memuat lokasi...');
        captureLocation(user.id);
        loadPenjualDashboard();
        startPenjualDashboardPolling();
        initNotifications();
    } else if (role === 'cs') {
        var el4 = document.getElementById('csName');
        if (el4) el4.textContent = user.name || 'CS';
        loadCSDashboard();
        initNotifications();
    } else if (role === 'admin') {
        // Admin uses same dashboard as owner but with restricted access
        if (typeof OwnerDashboard !== 'undefined') {
            OwnerDashboard.loadDashboard();
        }
        initNotifications();
    } else if (role === 'owner') {
        if (typeof OwnerDashboard !== 'undefined') {
            OwnerDashboard.loadDashboard();
        } else {
            renderOwnerStats();
            renderOwnerUsers();
            loadOwnerCommissionSettings();
            loadOwnerRevenue();
        }
        initNotifications();
    }
}

// ══════════════════════════════════════════
// ═══ AUTH ═══
// ══════════════════════════════════════════
// Legacy handleLogin — no longer used (OTP flow via LoginPage)
function handleLogin(e) {
    if (e) e.preventDefault();
    // Redirect to OTP login
    showPage('login');
    if (typeof LoginPage !== 'undefined') LoginPage.reset();
}

function loginLocal(username, password) {
    var users = getUsers();
    var found = users.find(function (u) { return u.username === username && u.password === password; });
    if (!found) {
        showToast('Username atau password salah!', 'error');
        return;
    }
    setSession(found);
    showToast('Selamat datang, ' + found.name + '!', 'success');
    showPage(found.role);
}

function handleRegister(e) {
    e.preventDefault();
    var name = document.getElementById('regName').value.trim();
    var phone = document.getElementById('regPhone').value.trim();
    var username = document.getElementById('regUsername').value.trim();
    var password = document.getElementById('regPassword').value;
    var role = document.getElementById('regRole').value;

    if (!name || !phone || !username || !password) {
        showToast('Lengkapi semua data!', 'error');
        return;
    }
    if (password.length < 6) {
        showToast('Password minimal 6 karakter!', 'error');
        return;
    }

    var selfieDataUrl = '';
    if (role === 'talent') {
        var selfieImg = document.getElementById('regSelfieImg');
        selfieDataUrl = selfieImg ? selfieImg.src : '';
        if (!selfieDataUrl || !selfieDataUrl.startsWith('data:')) {
            showToast('Foto selfie wajib untuk akun Talent!', 'error');
            return;
        }
    }

    var newUser = {
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

    backendPost(Object.assign({ action: 'register' }, newUser)).then(function (res) {
        if (res && res.success) {
            var users = getUsers();
            var savedUser = res.data || newUser;
            users.push(savedUser);
            saveUsers(users);
            setSession(savedUser);
            if (selfieDataUrl) saveProfilePhoto(savedUser.id, selfieDataUrl);
            showToast('Akun berhasil dibuat!', 'success');
            showPage(role);
            document.getElementById('registerForm').reset();
            document.getElementById('regRole').value = 'user';
            var selfieImg2 = document.getElementById('regSelfieImg');
            if (selfieImg2) { selfieImg2.src = ''; }
            var prev = document.getElementById('regSelfiePreview');
            if (prev) prev.style.display = 'none';
            var btn = document.getElementById('regBtnSelfie');
            if (btn) btn.style.display = '';
            var sec = document.getElementById('regSelfieSection');
            if (sec) sec.style.display = 'none';
        } else if (res && !res.success) {
            showToast(res.message || 'Gagal mendaftar', 'error');
        } else {
            var users2 = getUsers();
            if (users2.some(function (u) { return u.username === username; })) {
                showToast('Username sudah digunakan!', 'error');
                return;
            }
            users2.push(newUser);
            saveUsers(users2);
            setSession(newUser);
            if (selfieDataUrl) saveProfilePhoto(newUser.id, selfieDataUrl);
            showToast('Akun berhasil dibuat (offline)!', 'success');
            showPage(role);
            document.getElementById('registerForm').reset();
            document.getElementById('regRole').value = 'user';
            var sec2 = document.getElementById('regSelfieSection');
            if (sec2) sec2.style.display = 'none';
        }
    });
}

function setupRoleSelector() {
    var buttons = document.querySelectorAll('.role-btn');
    buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            buttons.forEach(function (b) { b.classList.remove('active'); });
            this.classList.add('active');
            document.getElementById('regRole').value = this.dataset.role;
            var selfieSection = document.getElementById('regSelfieSection');
            if (selfieSection) selfieSection.style.display = this.dataset.role === 'talent' ? '' : 'none';
        });
    });

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

function togglePassword(inputId, btn) {
    var input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>';
    }
}
window.togglePassword = togglePassword;

function handleLogout() {
    clearSession();
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
    if (typeof LoginPage !== 'undefined' && LoginPage.reset) LoginPage.reset();
    var loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.reset();
}
window.handleLogout = handleLogout;
