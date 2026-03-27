/* ========================================
   JASA SURUH (JS) - Owner Dashboard Module
   Modern admin dashboard (Gojek/SaaS style)
   Supports: owner + admin roles
   Owner: full access (commission, add admin, add CS)
   Admin: limited (add CS, manage users)
   ======================================== */
'use strict';

var OwnerDashboard = (function () {
    var _initialized = false;
    var _chartInstance = null;
    var _ordersCache = [];
    var _currentRange = 'all'; // today, week, month, all
    var _activityFilter = 'orders'; // orders, users, all
    var _currentRole = 'owner'; // 'owner' or 'admin'
    var _activeOwnerPanel = 'home';
    var _ownerPanelConfig = {
        home: { title: 'Home', subtitle: 'Ringkasan performa platform' },
        activity: { title: 'Aktivitas Terbaru', subtitle: 'Update order dan user terbaru' },
        users: { title: 'Pengguna', subtitle: 'Kelola akun dan role platform' },
        settings: { title: 'Pengaturan', subtitle: 'Atur komisi dan parameter platform' }
    };

    function $(id) { return document.getElementById(id); }
    function $$(sel) { return document.querySelectorAll(sel); }

    function formatRp(n) {
        if (!n && n !== 0) return '-';
        return 'Rp ' + Number(n).toLocaleString('id-ID');
    }

    function timeAgo(ts) {
        var diff = Date.now() - Number(ts);
        var m = Math.floor(diff / 60000);
        if (m < 1) return 'Baru saja';
        if (m < 60) return m + ' mnt lalu';
        var h = Math.floor(m / 60);
        if (h < 24) return h + ' jam lalu';
        var d = Math.floor(h / 24);
        return d + ' hari lalu';
    }

    function _isOwner() { return _currentRole === 'owner'; }
    function _isAdmin() { return _currentRole === 'admin'; }

    function _getPanelConfig(panel) {
        var cfg = _ownerPanelConfig[panel] || _ownerPanelConfig.home;
        if (_isOwner()) return cfg;

        if (panel === 'home') return { title: 'Home', subtitle: 'Ringkasan operasional admin' };
        if (panel === 'users') return { title: 'Pengguna', subtitle: 'Pantau akun dan aktivitas pengguna' };
        if (panel === 'settings') return { title: 'Akun', subtitle: 'Profil admin, review pesanan, dan logout' };
        return cfg;
    }

    function _setActiveOwnerNav(panel) {
        $$('#ownerBottomNav [data-owner-panel]').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.ownerPanel === panel);
        });
    }

    function _syncOwnerHeaderVisibility(panel) {
        var page = $('page-owner');
        if (!page) return;
        var isHomePanel = (panel === 'home');
        page.classList.toggle('owner-subpage-active', !isHomePanel);
        page.classList.toggle('owner-settings-active', panel === 'settings');
    }

    function _openOwnerPanel(panel) {
        var cfg = _getPanelConfig(panel);
        var modal = $('ownerPanelModal');
        if (!modal) return;

        _setActiveOwnerNav(panel);
        _syncOwnerHeaderVisibility(panel);

        var titleEl = $('ownerPanelTitle');
        var subtitleEl = $('ownerPanelSubtitle');
        if (titleEl) titleEl.textContent = cfg.title;
        if (subtitleEl) subtitleEl.textContent = cfg.subtitle;

        var currentView = document.querySelector('.od-panel-view.od-panel-view-active') ||
            document.querySelector('.od-panel-view[data-owner-panel-view="' + _activeOwnerPanel + '"]');
        var targetView = document.querySelector('.od-panel-view[data-owner-panel-view="' + panel + '"]');

        if (targetView && currentView !== targetView) {
            targetView.classList.remove('hidden', 'od-panel-view-leave');
            targetView.classList.add('od-panel-view-enter');

            if (currentView) {
                currentView.classList.remove('od-panel-view-active', 'od-panel-view-enter');
                currentView.classList.add('od-panel-view-leave');
            }

            requestAnimationFrame(function () {
                targetView.classList.remove('od-panel-view-enter');
                targetView.classList.add('od-panel-view-active');
            });

            if (currentView) {
                setTimeout(function () {
                    currentView.classList.add('hidden');
                    currentView.classList.remove('od-panel-view-leave');
                }, 280);
            }
        } else if (targetView) {
            targetView.classList.remove('hidden', 'od-panel-view-enter', 'od-panel-view-leave');
            targetView.classList.add('od-panel-view-active');
        }

        _activeOwnerPanel = panel;

        if (panel === 'home') {
            var chartDays = parseInt(($('ownerChartRange') && $('ownerChartRange').value) || '7', 10);
            _renderChart(_ordersCache, chartDays);
        }
        if (panel === 'settings' && _isOwner()) {
            _renderOwnerSettingsProfile();
            loadOwnerCommissionSettings();
            closeOwnerCommissionModal();
            closeOwnerDeliveryModal();
        } else if (panel === 'settings') {
            _renderOwnerSettingsProfile();
            closeOwnerCommissionModal();
            closeOwnerDeliveryModal();
        }
    }

    function _closeOwnerPanel() {
        _openOwnerPanel('home');
    }

    // ─── Init ───
    function init() {
        if (_initialized) return;
        _initialized = true;

        // Detect current role
        var session = typeof getSession === 'function' ? getSession() : null;
        _currentRole = session ? (session.role || 'owner') : 'owner';

        // Hide owner-only elements for admin
        _applyRoleVisibility();

        // Notif button
        var btn = $('ownerNotifBtn');
        if (btn) btn.addEventListener('click', function () {
            if (typeof openNotifPopup === 'function') openNotifPopup();
        });

        // Filter pills
        $$('.od-filter-pills .od-pill').forEach(function (pill) {
            pill.addEventListener('click', function () {
                $$('.od-filter-pills .od-pill').forEach(function (p) { p.classList.remove('active'); });
                this.classList.add('active');
                _currentRange = this.dataset.range;
                _refreshWithRange();
            });
        });

        // Chart range selector
        var chartSelect = $('ownerChartRange');
        if (chartSelect) chartSelect.addEventListener('change', function () {
            _renderChart(_ordersCache, parseInt(this.value, 10));
        });

        // Owner bottom nav modal panels
        $$('#ownerBottomNav [data-owner-panel]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                _openOwnerPanel(this.dataset.ownerPanel || 'home');
            });
        });

        var panelCloseBtn = $('ownerPanelClose');
        if (panelCloseBtn) panelCloseBtn.addEventListener('click', _closeOwnerPanel);

        var panelBackdrop = $('ownerPanelBackdrop');
        if (panelBackdrop) panelBackdrop.addEventListener('click', _closeOwnerPanel);

        var settingsBackBtn = $('ownerSettingsBackBtn');
        if (settingsBackBtn && !settingsBackBtn._bound) {
            settingsBackBtn._bound = true;
            settingsBackBtn.addEventListener('click', _closeOwnerPanel);
        }

        // Quick actions
        $$('.od-quick-btn').forEach(function (qbtn) {
            qbtn.addEventListener('click', function () {
                var action = this.dataset.action;
                if (action === 'add-staff') { if (typeof openStaffManagement === 'function') openStaffManagement('add'); }
                else if (action === 'staff-list') { if (typeof openStaffManagement === 'function') openStaffManagement('list'); }
                else if (action === 'view-report') { if (typeof openAdminTransactions === 'function') openAdminTransactions(); }
                else if (action === 'order-review') { if (typeof openAdminOrderReview === 'function') openAdminOrderReview(); }
                else if (action === 'settings') openOwnerSettings();
            });
        });

        // Transactions button
        var txBtn = $('ownerBtnTransactions');
        if (txBtn) txBtn.addEventListener('click', function () {
            if (typeof openAdminTransactions === 'function') openAdminTransactions();
        });

        var activityFilters = $('ownerActivityFilters');
        if (activityFilters && !activityFilters._bound) {
            activityFilters._bound = true;
            activityFilters.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-activity-filter]');
                if (!btn) return;
                var nextFilter = btn.dataset.activityFilter || 'orders';
                _activityFilter = nextFilter;
                activityFilters.querySelectorAll('[data-activity-filter]').forEach(function (b) {
                    b.classList.toggle('active', b === btn);
                });
                _renderActivity(_ordersCache);
            });
        }

        var settingsList = $('ownerSettingsList');
        if (settingsList && !settingsList._bound) {
            settingsList._bound = true;
            settingsList.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-owner-setting]');
                if (!btn) return;
                var action = btn.dataset.ownerSetting || '';
                if (action === 'commission-modal') {
                    openOwnerCommissionModal();
                    return;
                }
                if (action === 'delivery-modal') {
                    openOwnerDeliveryModal();
                    return;
                }
                if (action === 'staff-list') {
                    if (typeof openStaffManagement === 'function') openStaffManagement('list');
                    return;
                }
                if (action === 'transactions') {
                    if (typeof openAdminTransactions === 'function') openAdminTransactions();
                    return;
                }
                if (action === 'order-review') {
                    if (typeof openAdminOrderReview === 'function') openAdminOrderReview();
                }
            });
        }

        var commClose = $('ownerCommissionClose');
        if (commClose && !commClose._bound) {
            commClose._bound = true;
            commClose.addEventListener('click', closeOwnerCommissionModal);
        }

        var commBackdrop = $('ownerCommissionBackdrop');
        if (commBackdrop && !commBackdrop._bound) {
            commBackdrop._bound = true;
            commBackdrop.addEventListener('click', closeOwnerCommissionModal);
        }

        var deliveryClose = $('ownerDeliveryClose');
        if (deliveryClose && !deliveryClose._bound) {
            deliveryClose._bound = true;
            deliveryClose.addEventListener('click', closeOwnerDeliveryModal);
        }

        var deliveryBackdrop = $('ownerDeliveryBackdrop');
        if (deliveryBackdrop && !deliveryBackdrop._bound) {
            deliveryBackdrop._bound = true;
            deliveryBackdrop.addEventListener('click', closeOwnerDeliveryModal);
        }

        // Owner logout button in settings page
        var logoutBtn = $('ownerSettingsLogoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', function () {
            if (typeof handleLogout === 'function') handleLogout();
        });

        // Old admin/CS form/back handlers removed — replaced by React Staff Management

        // Commission form submit
        var commForm = $('commissionForm');
        if (commForm) commForm.addEventListener('submit', handleCommissionFormSubmit);

        var deliveryForm = $('deliverySettingsForm');
        if (deliveryForm) deliveryForm.addEventListener('submit', handleCommissionFormSubmit);

        ['setDeliveryFeePerKm', 'setServiceFeeAmount', 'setCommTalent', 'setCommPenjual', 'setMinFee', 'setMinShopFee']
            .forEach(function (id) {
                var input = $(id);
                if (!input || input._odBound) return;
                input._odBound = true;
                input.addEventListener('input', _updateOwnerSettingsSummary);
            });

        _updateOwnerSettingsSummary();
    }

    function _applyRoleVisibility() {
        // Owner-only elements: Tambah Admin, Pengaturan (commission)
        $$('.od-owner-only').forEach(function (el) {
            if (!_isOwner()) el.style.display = 'none';
            else el.style.display = '';
        });
        $$('.od-admin-only').forEach(function (el) {
            if (!_isAdmin()) el.style.display = 'none';
            else el.style.display = '';
        });
    }

    function _applyRoleCopy() {
        var sub = $('ownerGreetingSub');
        if (sub) {
            sub.textContent = _isOwner()
                ? 'Ringkasan operasional dan keuangan owner'
                : 'Ringkasan operasional dan verifikasi komisi admin';
        }
    }

    function _applyRoleTheme() {
        var page = $('page-owner');
        if (!page) return;
        page.classList.toggle('od-admin-mode', _isAdmin());
    }

    // ─── Load All Dashboard Data ───
    function loadDashboard() {
        // Re-detect role each time
        var session = typeof getSession === 'function' ? getSession() : null;
        _currentRole = session ? (session.role || 'owner') : 'owner';

        init();
        _applyRoleVisibility();
        _applyRoleCopy();
        _applyRoleTheme();
        _setGreeting();
        renderOwnerStats();
        renderOwnerUsers();
        _loadOrdersAndRevenue();
        if (_isOwner()) loadOwnerCommissionSettings();
        if (typeof initNotifications === 'function') initNotifications();
        _openOwnerPanel('home');
    }

    function _setGreeting() {
        var session = typeof getSession === 'function' ? getSession() : null;
        var name = session ? (session.name || session.nama || (_isOwner() ? 'Owner' : 'Admin')) : 'Admin';
        var hour = new Date().getHours();
        var greet = hour < 12 ? 'Selamat Pagi' : hour < 17 ? 'Selamat Siang' : 'Selamat Malam';
        var el = $('ownerGreeting');
        if (el) el.textContent = greet + ', ' + name + ' 👋';
    }

    function _resolveOwnerAvatarUrl(raw) {
        var src = String(raw || '').trim();
        if (!src || src === '-') return '';
        if (src.indexOf('http://') === 0 || src.indexOf('https://') === 0 || src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) {
            return src;
        }
        try {
            if (window.FB && window.FB._sb && window.FB._sb.storage) {
                var res = window.FB._sb.storage.from('avatars').getPublicUrl(src);
                if (res && res.data && res.data.publicUrl) return res.data.publicUrl;
            }
        } catch (e) {}
        return src;
    }

    function _renderOwnerSettingsProfile() {
        var session = typeof getSession === 'function' ? getSession() : null;
        if (!session) return;

        var name = session.name || session.nama || (_isOwner() ? 'Owner' : 'Admin');
        var phone = session.phone || session.no_hp || session.username || '-';
        var role = String(session.role || 'owner');

        var nameEl = $('ownerSettingsName');
        if (nameEl) nameEl.textContent = name;

        var roleEl = $('ownerSettingsRole');
        if (roleEl) {
            roleEl.textContent = role === 'admin' ? 'Admin' : 'Owner';
            roleEl.className = 'acc-role-badge ' + (role === 'admin' ? 'role-admin' : 'role-owner');
        }

        var phoneEl = $('ownerSettingsPhone');
        if (phoneEl) phoneEl.textContent = phone;

        var avatarImg = $('ownerSettingsAvatarImg');
        var avatarFallback = $('ownerSettingsAvatarFallback');
        if (!avatarImg || !avatarFallback) return;

        var photoCandidate = session.foto_url || session.photo || session.avatar || session.avatarUrl || (typeof getProfilePhoto === 'function' ? getProfilePhoto(session.id) : '');
        var avatarUrl = _resolveOwnerAvatarUrl(photoCandidate);
        if (!avatarUrl) {
            avatarImg.style.display = 'none';
            avatarFallback.style.display = 'block';
            return;
        }

        avatarImg.onerror = function () {
            avatarImg.style.display = 'none';
            avatarFallback.style.display = 'block';
        };
        avatarImg.src = avatarUrl;
        avatarImg.style.display = 'block';
        avatarFallback.style.display = 'none';
    }

    function _refreshWithRange() {
        renderOwnerStats();
        _updateRevenueKPI(_ordersCache);
        _renderActivity(_ordersCache);
    }

    // ─── KPI Stats ───
    function renderOwnerStats() {
        var users = typeof getUsers === 'function' ? getUsers() : [];
        var usersCount = users.filter(function (u) { return u.role === 'user'; }).length;
        var talentsCount = users.filter(function (u) { return u.role === 'talent'; }).length;
        var penjualCount = users.filter(function (u) { return u.role === 'penjual'; }).length;
        var csCount = users.filter(function (u) { return u.role === 'cs'; }).length;
        var adminCount = users.filter(function (u) { return u.role === 'admin'; }).length;

        _setKPIValue('ownerTotalUsers', usersCount);
        _setKPIValue('ownerTotalTalents', talentsCount);
        if ($('ownerStatUser')) $('ownerStatUser').textContent = usersCount;
        if ($('ownerStatTalent')) $('ownerStatTalent').textContent = talentsCount;
        if ($('ownerStatPenjual')) $('ownerStatPenjual').textContent = penjualCount;
        if ($('ownerStatCS')) $('ownerStatCS').textContent = csCount;
        if ($('ownerStatAdmin')) $('ownerStatAdmin').textContent = adminCount;
    }

    function _setKPIValue(id, value) {
        var el = $(id);
        if (!el) return;
        el.textContent = value;
    }

    // ─── Orders + Revenue ───
    function _loadOrdersAndRevenue() {
        if (typeof isBackendConnected !== 'function' || !isBackendConnected()) return;

        FB.get('getAllOrders')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (!res.success || !Array.isArray(res.data)) return;
                _ordersCache = res.data;
                _setKPIValue('ownerTotalOrders', res.data.length);
                _updateRevenueKPI(res.data);
                _renderChart(res.data, 7);
                _renderActivity(res.data);
            }).catch(function () {});
    }

    function _filterByRange(orders) {
        if (_currentRange === 'all') return orders;
        var now = new Date();
        var start = new Date();
        if (_currentRange === 'today') start.setHours(0, 0, 0, 0);
        else if (_currentRange === 'week') start.setDate(now.getDate() - 7);
        else if (_currentRange === 'month') start.setMonth(now.getMonth() - 1);
        var startTs = start.getTime();
        return orders.filter(function (o) {
            return Number(o.createdAt || 0) >= startTs;
        });
    }

    function _updateRevenueKPI(orders) {
        var completed = orders.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; });
        var filtered = _filterByRange(completed);
        var totalRevenue = filtered.reduce(function (sum, o) { return sum + (Number(o.fee) || 0); }, 0);
        _setKPIValue('ownerRevenue', formatRp(totalRevenue));
        _syncOwnerFinancialSummary(totalRevenue);

        var today = new Date(); today.setHours(0, 0, 0, 0);
        var todayRevenue = completed
            .filter(function (o) { return Number(o.completedAt || o.createdAt) >= today.getTime(); })
            .reduce(function (sum, o) { return sum + (Number(o.fee) || 0); }, 0);
        var todayEl = $('ownerTodayRevenue');
        if (todayEl) todayEl.textContent = formatRp(todayRevenue);

        var basisEl = $('ownerRevenueBasis');
        if (basisEl) {
            var map = {
                today: 'Akumulasi fee hari ini (order selesai)',
                week: 'Akumulasi fee 7 hari terakhir',
                month: 'Akumulasi fee 30 hari terakhir',
                all: 'Akumulasi fee seluruh order selesai'
            };
            basisEl.textContent = map[_currentRange] || map.all;
        }
    }

    function _getOwnerWalletBalance() {
        if (typeof getWalletBalance === 'function') {
            return Number(getWalletBalance()) || 0;
        }
        var walletText = ($('ownerWalletBalance') && $('ownerWalletBalance').textContent) || '0';
        var normalized = String(walletText).replace(/[^0-9-]/g, '');
        return Number(normalized) || 0;
    }

    function _syncOwnerFinancialSummary(totalRevenue) {
        var walletBalance = _getOwnerWalletBalance();
        var gap = walletBalance - (Number(totalRevenue) || 0);
        var gapEl = $('ownerRevenueGap');
        if (!gapEl) return;

        var sign = gap > 0 ? '+' : '';
        gapEl.textContent = 'Selisih saldo vs fee: ' + sign + formatRp(gap).replace('Rp ', 'Rp ');
        gapEl.classList.toggle('is-plus', gap >= 0);
        gapEl.classList.toggle('is-minus', gap < 0);
    }

    function syncOwnerFinancePreview() {
        var ownerRevenueText = ($('ownerRevenue') && $('ownerRevenue').textContent) || 'Rp 0';
        var revenue = Number(String(ownerRevenueText).replace(/[^0-9-]/g, '')) || 0;
        _syncOwnerFinancialSummary(revenue);
    }

    // ─── Chart ───
    function _renderChart(orders, days) {
        var canvas = $('ownerRevenueChart');
        var emptyEl = $('ownerChartEmpty');
        if (!canvas) return;

        if (!orders || orders.length === 0) {
            canvas.style.display = 'none';
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }
        canvas.style.display = 'block';
        if (emptyEl) emptyEl.classList.add('hidden');

        var completed = orders.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; });

        var labels = [];
        var revenueData = [];
        var ordersData = [];
        for (var i = days - 1; i >= 0; i--) {
            var d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            var nextD = new Date(d); nextD.setDate(nextD.getDate() + 1);

            labels.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));

            var dStart = d.getTime(), dEnd = nextD.getTime();
            var dayOrders = orders.filter(function (o) {
                var ts = Number(o.createdAt || 0);
                return ts >= dStart && ts < dEnd;
            });
            ordersData.push(dayOrders.length);

            var dayRevenue = completed.filter(function (o) {
                var ts = Number(o.completedAt || o.createdAt || 0);
                return ts >= dStart && ts < dEnd;
            }).reduce(function (s, o) { return s + (Number(o.fee) || 0); }, 0);
            revenueData.push(dayRevenue);
        }

        var chartRevenueTotal = revenueData.reduce(function (sum, n) { return sum + (Number(n) || 0); }, 0);
        var chartOrdersTotal = ordersData.reduce(function (sum, n) { return sum + (Number(n) || 0); }, 0);
        var chartRevenueEl = $('ownerChartRevenueTotal');
        var chartOrdersEl = $('ownerChartOrdersTotal');
        if (chartRevenueEl) chartRevenueEl.textContent = formatRp(chartRevenueTotal);
        if (chartOrdersEl) chartOrdersEl.textContent = String(chartOrdersTotal);

        if (_chartInstance) _chartInstance.destroy();
        if (typeof Chart === 'undefined') return;

        _chartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Revenue (Rp)',
                        data: revenueData,
                        borderColor: '#FF6B00',
                        backgroundColor: 'rgba(255,107,0,0.08)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointBackgroundColor: '#FF6B00',
                        yAxisID: 'y'
                    },
                    {
                        label: 'Orders',
                        data: ordersData,
                        borderColor: '#3B82F6',
                        backgroundColor: 'rgba(59,130,246,0.08)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointBackgroundColor: '#3B82F6',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1a1a2e',
                        titleFont: { family: 'Plus Jakarta Sans', size: 12 },
                        bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (ctx) {
                                if (ctx.datasetIndex === 0) return 'Pendapatan: ' + formatRp(ctx.raw);
                                return 'Pesanan: ' + ctx.raw;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: '#9CA3AF', maxRotation: 0 }
                    },
                    y: {
                        position: 'left',
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.04)' },
                        ticks: {
                            font: { family: 'Plus Jakarta Sans', size: 10 }, color: '#9CA3AF',
                            callback: function (v) {
                                if (v >= 1000000) return (v / 1000000).toFixed(1) + 'jt';
                                if (v >= 1000) return (v / 1000).toFixed(0) + 'rb';
                                return v;
                            }
                        }
                    },
                    y1: {
                        position: 'right',
                        beginAtZero: true,
                        grid: { display: false },
                        ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: '#93C5FD', stepSize: 1 }
                    }
                }
            }
        });
    }

    // ─── Activity List ───
    function _renderActivity(orders) {
        var container = $('ownerActivityList');
        if (!container) return;

        var users = typeof getUsers === 'function' ? getUsers() : [];
        var usersById = {};
        users.forEach(function (u) { usersById[String(u.id)] = u; });

        function formatDateTime(ts) {
            if (!ts) return '-';
            var d = new Date(Number(ts));
            return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' • '
                + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        }

        function formatStatus(status) {
            var statusMap = typeof STATUS_LABELS !== 'undefined' ? STATUS_LABELS : {};
            return statusMap[status] || String(status || '-');
        }

        function getRoleLabel(role) {
            var roleLabel = { user: 'User', talent: 'Talent', penjual: 'Penjual', cs: 'CS', admin: 'Admin' };
            return roleLabel[role] || role || 'User';
        }

        function inCurrentRange(ts) {
            var nTs = Number(ts || 0);
            if (!nTs) return false;
            if (_currentRange === 'all') return true;
            var now = new Date();
            var start = new Date();
            if (_currentRange === 'today') start.setHours(0, 0, 0, 0);
            else if (_currentRange === 'week') start.setDate(now.getDate() - 7);
            else if (_currentRange === 'month') start.setMonth(now.getMonth() - 1);
            return nTs >= start.getTime();
        }

        function buildOrderMeta(o) {
            var customer = usersById[String(o.userId)] || {};
            var driver = usersById[String(o.talentId)] || {};
            var seller = usersById[String(o.sellerId)] || {};
            var pm = String(o.paymentMethod || 'jspay').toUpperCase();
            var service = o.serviceType || o.skillType || 'Pesanan';
            var code = String(o.id || '').slice(0, 10);

            return {
                service: service,
                code: code,
                customer: customer.name || customer.nama || 'Customer',
                driver: driver.name || driver.nama || '-',
                seller: o.storeName || seller.name || seller.nama || '-',
                payment: pm,
                statusText: formatStatus(o.status),
                fee: Number(o.fee) || 0,
                total: Number(o.totalCost) || Number(o.price) || 0
            };
        }

        var rangeOrders = _filterByRange(Array.isArray(orders) ? orders : []);

        var events = [];
        rangeOrders.forEach(function (o) {
            var createdTs = Number(o.createdAt) || 0;
            if (createdTs > 0) {
                events.push({
                    type: 'order_created',
                    ts: createdTs,
                    order: o
                });
            }
            if (o.status === 'completed' || o.status === 'rated') {
                var doneTs = Number(o.ratedAt || o.completedAt || o.updatedAt || o.createdAt || 0);
                if (doneTs > 0) {
                    events.push({
                        type: 'order_completed',
                        ts: doneTs,
                        order: o
                    });
                }
            }
        });

        users.forEach(function (u) {
            if (u.role === 'owner') return;
            var userTs = Number(u.createdAt || 0);
            if (userTs > 0 && inCurrentRange(userTs)) {
                events.push({
                    type: 'user_joined',
                    ts: userTs,
                    user: u
                });
            }
        });

        var createdCount = events.filter(function (e) { return e.type === 'order_created'; }).length;
        var doneCount = events.filter(function (e) { return e.type === 'order_completed'; }).length;
        var userCount = events.filter(function (e) { return e.type === 'user_joined'; }).length;

        if (_activityFilter === 'orders') {
            events = events.filter(function (e) { return e.type === 'order_created' || e.type === 'order_completed'; });
        } else if (_activityFilter === 'users') {
            events = events.filter(function (e) { return e.type === 'user_joined'; });
        }

        events.sort(function (a, b) { return b.ts - a.ts; });
        var recent = events.slice(0, 18);

        var summaryHtml = '<div class="od-activity-summary">'
            + '<div class="od-activity-chip"><span>🆕 Order Masuk</span><strong>' + createdCount + '</strong></div>'
            + '<div class="od-activity-chip"><span>✅ Order Selesai</span><strong>' + doneCount + '</strong></div>'
            + '<div class="od-activity-chip"><span>👥 User Baru</span><strong>' + userCount + '</strong></div>'
            + '</div>';

        if (recent.length === 0) {
            container.innerHTML = summaryHtml + '<div class="od-empty"><span>📭</span><p>Belum ada aktivitas</p></div>';
            return;
        }

        var lastDay = '';
        var feedHtml = recent.map(function (evt) {
            var dayLabel = new Date(Number(evt.ts)).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
            var dayHead = '';
            if (dayLabel !== lastDay) {
                lastDay = dayLabel;
                dayHead = '<div class="od-activity-day-divider"><span>' + dayLabel + '</span></div>';
            }

            if (evt.type === 'user_joined') {
                var u = evt.user || {};
                var displayName = u.name || u.nama || 'User';
                var initial = displayName.charAt(0).toUpperCase();
                var roleText = getRoleLabel(u.role);
                return dayHead + '<article class="od-activity-card od-activity-user-card">'
                    + '<div class="od-activity-card-top">'
                    + '<span class="od-activity-badge type-user">User Baru</span>'
                    + '<span class="od-activity-time">' + formatDateTime(evt.ts) + '</span>'
                    + '</div>'
                    + '<div class="od-activity-row">'
                    + '<div class="od-activity-avatar" style="background:' + _roleColor(u.role) + '">' + initial + '</div>'
                    + '<div class="od-activity-info">'
                    + '<div class="od-activity-title">' + escapeHtml(displayName) + '</div>'
                    + '<div class="od-activity-meta">Role: ' + escapeHtml(roleText) + '</div>'
                    + '<div class="od-activity-meta">@' + escapeHtml(String(u.username || u.no_hp || u.phone || '-')) + '</div>'
                    + '</div>'
                    + '</div>'
                    + '</article>';
            }

            var o = evt.order || {};
            var meta = buildOrderMeta(o);
            var isDone = evt.type === 'order_completed';
            var badgeType = isDone ? 'type-done' : 'type-order';
            var badgeText = isDone ? 'Order Selesai' : 'Order Baru';
            var feeText = meta.fee > 0 ? formatRp(meta.fee) : '-';

            return dayHead + '<article class="od-activity-card od-activity-order-card">'
                + '<div class="od-activity-card-top">'
                + '<span class="od-activity-badge ' + badgeType + '">' + badgeText + '</span>'
                + '<span class="od-activity-time">' + formatDateTime(evt.ts) + '</span>'
                + '</div>'
                + '<div class="od-activity-title">' + escapeHtml(meta.service) + '</div>'
                + '<div class="od-activity-meta">Order #' + escapeHtml(meta.code) + ' • ' + escapeHtml(meta.customer) + '</div>'
                + '<div class="od-activity-tags">'
                + '<span class="od-activity-tag">Status: ' + escapeHtml(meta.statusText) + '</span>'
                + '<span class="od-activity-tag">Bayar: ' + escapeHtml(meta.payment) + '</span>'
                + '<span class="od-activity-tag">Driver: ' + escapeHtml(meta.driver) + '</span>'
                + '<span class="od-activity-tag">Toko: ' + escapeHtml(meta.seller) + '</span>'
                + '</div>'
                + '<div class="od-activity-order-footer">'
                + '<span class="od-activity-price">Total ' + formatRp(meta.total) + '</span>'
                + '<span class="od-activity-fee">Fee Platform: ' + feeText + '</span>'
                + '</div>'
                + '</div>'
                + '</article>';
        }).join('');

        container.innerHTML = summaryHtml + '<div class="od-activity-feed">' + feedHtml + '</div>';
    }

    function _roleColor(role) {
        var map = { user: '#FF6B00', talent: '#3B82F6', penjual: '#22C55E', cs: '#8B5CF6', admin: '#EF4444' };
        return map[role] || '#9CA3AF';
    }

    // ─── User List ───
    function renderOwnerUsers() {
        var container = $('ownerUserList');
        if (!container) return;
        var allUsers = typeof getUsers === 'function' ? getUsers() : [];
        var users = allUsers.filter(function (u) { return u.role !== 'owner'; });

        if (users.length === 0) {
            container.innerHTML = '<div class="od-empty"><span>👥</span><p>Belum ada pengguna</p></div>';
            return;
        }

        var roleColors = { user: '#FF6B00', talent: '#3B82F6', penjual: '#22C55E', cs: '#8B5CF6', admin: '#EF4444' };
        var roleLabels = { user: 'User', talent: 'Talent', penjual: 'Penjual', cs: 'CS', admin: 'Admin' };
        var roleChipClass = { user: 'is-user', talent: 'is-talent', penjual: 'is-penjual', cs: 'is-cs', admin: 'is-admin' };
        var ordersRef = Array.isArray(_ordersCache) ? _ordersCache : [];

        function fmtDate(ts) {
            if (!ts) return '-';
            return new Date(Number(ts)).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        function _resolveAvatarUrl(raw) {
            var src = String(raw || '').trim();
            if (!src || src === '-') return '';
            if (src.indexOf('http://') === 0 || src.indexOf('https://') === 0 || src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) {
                return src;
            }
            try {
                if (window.FB && window.FB._sb && window.FB._sb.storage) {
                    var res = window.FB._sb.storage.from('avatars').getPublicUrl(src);
                    if (res && res.data && res.data.publicUrl) return res.data.publicUrl;
                }
            } catch (e) {}
            return src;
        }

        function resolveUserAvatar(u) {
            if (!u) return '';
            var candidates = [u.foto_url, u.photo, u.avatar, u.avatarUrl];

            if (typeof getProfilePhoto === 'function' && u.id) {
                candidates.push(getProfilePhoto(u.id));
            }

            if (String(u.role || '').toLowerCase() === 'talent' && typeof getUserSkills === 'function') {
                var skills = getUserSkills(u.id) || [];
                for (var i = 0; i < skills.length; i++) {
                    var sk = skills[i] || {};
                    candidates.push(sk.selfieThumb, sk.photo, sk.image);
                }
            }

            for (var c = 0; c < candidates.length; c++) {
                var url = _resolveAvatarUrl(candidates[c]);
                if (url) return url;
            }
            return '';
        }

        users = users.slice().sort(function (a, b) {
            return Number(b.createdAt || 0) - Number(a.createdAt || 0);
        });

        container.innerHTML = users.map(function (u) {
            var displayName = u.name || u.nama || 'Tanpa Nama';
            var displayUsername = u.username || u.no_hp || u.phone || '-';
            var initial = displayName.charAt(0).toUpperCase();
            var userOrders = ordersRef.filter(function (o) {
                return String(o.userId || '') === String(u.id)
                    || String(o.talentId || '') === String(u.id)
                    || String(o.sellerId || '') === String(u.id);
            });
            var completedOrders = userOrders.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; }).length;
            var lastOrderTs = userOrders.reduce(function (mx, o) {
                var ts = Number(o.updatedAt || o.completedAt || o.createdAt || 0);
                return ts > mx ? ts : mx;
            }, 0);
            var joinedAt = Number(u.createdAt || 0);
            var roleText = roleLabels[u.role] || String(u.role || 'User');
            // Admin can only delete CS, Owner can delete anyone (except owner)
            var canDelete = _isOwner() || (_currentRole === 'admin' && u.role === 'cs');
            var deleteBtn = canDelete
                ? '<button class="od-user-delete" data-uid="' + u.id + '" title="Hapus user">'
                    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                    + '</button>'
                : '';
            var avatarUrl = resolveUserAvatar(u);
            var avatarContent = avatarUrl
                ? '<span class="od-user-avatar-fallback" style="display:none">' + initial + '</span>'
                    + '<img src="' + escapeHtml(avatarUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="" onerror="this.style.display=\'none\';if(this.previousElementSibling){this.previousElementSibling.style.display=\'flex\';}">'
                : initial;
            return '<article class="od-user-item od-user-card">'
                + '<div class="od-user-main">'
                + '<div class="od-user-avatar" style="background:' + (roleColors[u.role] || '#999') + '">' + avatarContent + '</div>'
                + '<div class="od-user-info">'
                + '<div class="od-user-topline">'
                + '<div class="od-user-name">' + escapeHtml(displayName) + '</div>'
                + '<span class="od-user-role-chip ' + (roleChipClass[u.role] || '') + '">' + escapeHtml(roleText) + '</span>'
                + '</div>'
                + '<div class="od-user-meta">@' + escapeHtml(String(displayUsername)) + '</div>'
                + '<div class="od-user-submeta">Gabung: ' + escapeHtml(fmtDate(joinedAt)) + '</div>'
                + '</div>'
                + deleteBtn
                + '</div>'
                + '<div class="od-user-stats-inline">'
                + '<span><strong>' + userOrders.length + '</strong> Total Order</span>'
                + '<span><strong>' + completedOrders + '</strong> Selesai</span>'
                + '<span><strong>' + escapeHtml(lastOrderTs ? fmtDate(lastOrderTs) : '-') + '</strong> Aktivitas Akhir</span>'
                + '</div>'
                + '</article>';
        }).join('');

        container.querySelectorAll('.od-user-delete').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var uid = this.dataset.uid;
                if (!confirm('Hapus pengguna ini?')) return;
                var list = typeof getUsers === 'function' ? getUsers() : [];
                list = list.filter(function (u) { return u.id !== uid; });
                if (typeof saveUsers === 'function') saveUsers(list);
                if (typeof backendPost === 'function') backendPost({ action: 'delete', id: uid });
                if (typeof showToast === 'function') showToast('Pengguna dihapus', 'success');
                renderOwnerStats();
                renderOwnerUsers();
            });
        });
    }
    window.renderOwnerUsers = renderOwnerUsers;

    // ─── Commission Settings (owner only) ───
    function loadOwnerCommissionSettings() {
        if (!_isOwner()) return;
        if (typeof isBackendConnected !== 'function' || !isBackendConnected()) {
            _updateOwnerSettingsSummary();
            return;
        }
        FB.get('getSettings')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    var s = res.data;
                    if ($('setDeliveryFeePerKm') && s.delivery_fee_per_km) $('setDeliveryFeePerKm').value = s.delivery_fee_per_km;
                    if ($('setServiceFeeAmount')) {
                        var feeAmount = Number(s.service_fee_amount);
                        $('setServiceFeeAmount').value = isFinite(feeAmount) && feeAmount >= 0 ? feeAmount : 1000;
                    }
                    if ($('setCommTalent') && s.commission_talent_percent) $('setCommTalent').value = s.commission_talent_percent;
                    if ($('setCommPenjual') && s.commission_penjual_percent) $('setCommPenjual').value = s.commission_penjual_percent;
                    if ($('setMinFee') && s.minimum_fee) $('setMinFee').value = s.minimum_fee;
                    if ($('setMinShopFee')) {
                        var minShopFee = Number(s.minimum_shop_fee);
                        $('setMinShopFee').value = isFinite(minShopFee) && minShopFee >= 0 ? minShopFee : 10000;
                    }
                    _updateOwnerSettingsSummary();
                }
            }).catch(function () {
                _updateOwnerSettingsSummary();
            });
    }

    function _updateOwnerSettingsSummary() {
        var commTalent = Number(($('setCommTalent') && $('setCommTalent').value) || 15);
        var commPenjual = Number(($('setCommPenjual') && $('setCommPenjual').value) || 10);
        var feeAmount = Number(($('setServiceFeeAmount') && $('setServiceFeeAmount').value) || 1000);
        var deliveryPerKm = Number(($('setDeliveryFeePerKm') && $('setDeliveryFeePerKm').value) || 3000);
        var minFee = Number(($('setMinFee') && $('setMinFee').value) || 5000);
        var minShopFee = Number(($('setMinShopFee') && $('setMinShopFee').value) || 10000);

        var commEl = $('ownerSetSummaryCommission');
        if (commEl) {
            commEl.textContent = 'Talent ' + commTalent + '% • Penjual ' + commPenjual + '% • Fee ' + formatRp(feeAmount);
        }

        var deliveryEl = $('ownerSetSummaryDelivery');
        if (deliveryEl) {
            deliveryEl.textContent = 'Per KM ' + formatRp(deliveryPerKm) + ' • Min JS Antar ' + formatRp(minFee) + ' • Min Toko ' + formatRp(minShopFee);
        }
    }

    function openOwnerCommissionModal() {
        var modal = $('ownerCommissionModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        requestAnimationFrame(function () {
            modal.classList.add('is-open');
        });
    }

    function closeOwnerCommissionModal() {
        var modal = $('ownerCommissionModal');
        if (!modal) return;
        modal.classList.remove('is-open');
        setTimeout(function () {
            modal.classList.add('hidden');
        }, 180);
    }

    function openOwnerDeliveryModal() {
        var modal = $('ownerDeliveryModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        requestAnimationFrame(function () {
            modal.classList.add('is-open');
        });
    }

    function closeOwnerDeliveryModal() {
        var modal = $('ownerDeliveryModal');
        if (!modal) return;
        modal.classList.remove('is-open');
        setTimeout(function () {
            modal.classList.add('hidden');
        }, 180);
    }

    function handleCommissionFormSubmit(e) {
        e.preventDefault();
        if (!_isOwner()) { showToast('Hanya owner yang bisa mengubah komisi', 'error'); return; }
        var settings = {
            delivery_fee_per_km: $('setDeliveryFeePerKm').value || '3000',
            service_fee_amount: $('setServiceFeeAmount').value || '1000',
            commission_talent_percent: $('setCommTalent').value || '15',
            commission_penjual_percent: $('setCommPenjual').value || '10',
            minimum_fee: $('setMinFee').value || '5000',
            minimum_shop_fee: $('setMinShopFee').value || '10000'
        };
        var btn = e.target.querySelector('.od-btn-save');
        var originalLabel = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
        if (typeof backendPost === 'function') {
            backendPost({ action: 'updateSettings', settings: settings })
                .then(function (res) {
                    if (btn) { btn.disabled = false; btn.textContent = originalLabel || '💾 Simpan Pengaturan'; }
                    if (res && res.success) {
                        _updateOwnerSettingsSummary();
                        closeOwnerCommissionModal();
                        closeOwnerDeliveryModal();
                        if (typeof showToast === 'function') showToast('Pengaturan disimpan!', 'success');
                    } else {
                        if (typeof showToast === 'function') showToast('Gagal menyimpan', 'error');
                    }
                });
        }
    }

    // ─── Create Admin (owner only) ───
    function handleCreateAdmin(e) {
        e.preventDefault();
        if (!_isOwner()) {
            if (typeof showToast === 'function') showToast('Hanya owner yang bisa menambah admin!', 'error');
            return;
        }
        var name = ($('adminFormName').value || '').trim();
        var phone = ($('adminFormPhone').value || '').trim();
        var username = ($('adminFormUsername').value || '').trim();
        var password = $('adminFormPassword').value;

        if (!name || !username || !password) {
            if (typeof showToast === 'function') showToast('Lengkapi semua data!', 'error');
            return;
        }
        if (password.length < 6) {
            if (typeof showToast === 'function') showToast('Password minimal 6 karakter!', 'error');
            return;
        }
        var users = typeof getUsers === 'function' ? getUsers() : [];
        if (users.some(function (u) { return u.username === username; })) {
            if (typeof showToast === 'function') showToast('Username sudah digunakan!', 'error');
            return;
        }

        var adminUser = {
            id: typeof generateId === 'function' ? generateId() : Date.now().toString(36),
            name: name, phone: phone, no_hp: phone, nama: name,
            username: username, password: password,
            role: 'admin', createdAt: Date.now()
        };
        users.push(adminUser);
        if (typeof saveUsers === 'function') saveUsers(users);
        if (typeof backendPost === 'function') {
            backendPost({ action: 'createAdmin', id: adminUser.id, name: adminUser.name, phone: adminUser.phone, username: adminUser.username, password: adminUser.password, role: adminUser.role, createdAt: adminUser.createdAt });
        }
        if (typeof showToast === 'function') showToast('Akun Admin berhasil dibuat!', 'success');
        $('createAdminForm').reset();
        renderOwnerStats();
        renderOwnerUsers();
    }

    // ─── Create CS (owner + admin) ───
    function handleCreateCS(e) {
        e.preventDefault();
        var name = ($('csFormName').value || '').trim();
        var username = ($('csFormUsername').value || '').trim();
        var password = $('csFormPassword').value;

        if (!name || !username || !password) {
            if (typeof showToast === 'function') showToast('Lengkapi semua data!', 'error');
            return;
        }
        if (password.length < 6) {
            if (typeof showToast === 'function') showToast('Password minimal 6 karakter!', 'error');
            return;
        }
        var users = typeof getUsers === 'function' ? getUsers() : [];
        if (users.some(function (u) { return u.username === username; })) {
            if (typeof showToast === 'function') showToast('Username sudah digunakan!', 'error');
            return;
        }

        var csUser = {
            id: typeof generateId === 'function' ? generateId() : Date.now().toString(36),
            name: name, phone: '-', nama: name,
            username: username, password: password,
            role: 'cs', createdAt: Date.now()
        };
        users.push(csUser);
        if (typeof saveUsers === 'function') saveUsers(users);
        if (typeof backendPost === 'function') {
            backendPost({ action: 'createCS', id: csUser.id, name: csUser.name, phone: csUser.phone, username: csUser.username, password: csUser.password, role: csUser.role, createdAt: csUser.createdAt });
        }
        if (typeof showToast === 'function') showToast('Akun CS berhasil dibuat!', 'success');
        $('createCSForm').reset();
        renderOwnerStats();
        renderOwnerUsers();
    }

    // ─── Page Openers ───
    function openOwnerSettings() {
        if (!_isOwner()) {
            if (typeof showToast === 'function') showToast('Hanya owner yang bisa mengakses pengaturan komisi', 'error');
            return;
        }
        _openOwnerPanel('settings');
    }
    window.openOwnerSettings = openOwnerSettings;

    // openCreateAdminPage & openCreateCSPage removed — replaced by openStaffManagement() in staff-app.js

    function _scrollToUsers() {
        _openOwnerPanel('users');
    }

    return {
        init: init,
        loadDashboard: loadDashboard,
        renderOwnerStats: renderOwnerStats,
        renderOwnerUsers: renderOwnerUsers,
        loadOwnerCommissionSettings: loadOwnerCommissionSettings,
        handleCommissionFormSubmit: handleCommissionFormSubmit,
        openOwnerSettings: openOwnerSettings,
        syncOwnerFinancePreview: syncOwnerFinancePreview
    };
})();

// Expose globals for backward compatibility
function renderOwnerStats() { OwnerDashboard.renderOwnerStats(); }
function renderOwnerUsers() { OwnerDashboard.renderOwnerUsers(); }
function loadOwnerCommissionSettings() { OwnerDashboard.loadOwnerCommissionSettings(); }
function handleCommissionFormSubmit(e) { OwnerDashboard.handleCommissionFormSubmit(e); }
// handleCreateCS and handleCreateAdmin removed — replaced by React Staff Management
function loadOwnerRevenue() { /* handled by loadDashboard now */ }
function syncOwnerFinancePreview() { OwnerDashboard.syncOwnerFinancePreview(); }
window.syncOwnerFinancePreview = syncOwnerFinancePreview;

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

    orders.sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });

    list.innerHTML = orders.map(function (o, idx) {
        var user = users.find(function (u) { return u.id === o.userId; });
        var talent = users.find(function (u) { return u.id === o.talentId; });
        var userName = user ? (user.name || user.nama || 'User') : (o.userId || '-');
        var talentName = talent ? (talent.name || talent.nama || 'Talent') : (o.talentId || '-');
        var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
        var feeText = o.fee ? 'Rp ' + Number(o.fee).toLocaleString('id-ID') : '-';
        var dateText = new Date(Number(o.createdAt)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        var statusText = (typeof STATUS_LABELS !== 'undefined' ? STATUS_LABELS[o.status] : null) || o.status || '-';
        var ratingText = o.rating > 0 ? '⭐ ' + o.rating + '/5' : '-';

        return '<div class="olp-card" data-idx="' + idx + '">'
            + '<div class="olp-card-top">'
            + '<div class="olp-card-service">#' + (o.id || '').substr(0, 8) + ' · ' + escapeHtml(o.serviceType || o.skillType || '') + '</div>'
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

    list.querySelectorAll('.olp-card').forEach(function (card) {
        card.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx, 10);
            if (!orders[idx]) return;
            if (typeof openOrderTracking === 'function') {
                openOrderTracking(orders[idx]);
                return;
            }
            if (typeof openChat === 'function') openChat(orders[idx]);
        });
    });
}
