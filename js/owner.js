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
    var _adminDriverFilter = 'all'; // all, user, talent, penjual
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
        if (panel === 'activity') return { title: 'Order', subtitle: 'Monitoring order dari dibuat sampai verifikasi komisi' };
        if (panel === 'users') return { title: 'Pengguna', subtitle: 'Kontrol akun global: user, driver, dan seller' };
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
            if (_isOwner()) {
                var chartDays = parseInt(($('ownerChartRange') && $('ownerChartRange').value) || '7', 10);
                _renderChart(_ordersCache, chartDays);
            } else {
                _renderAdminReviewFocus(_ordersCache);
                _renderAdminFlow(_ordersCache);
                _renderAdminReportSummary(_ordersCache);
                _renderAdminWorkPriority(_ordersCache);
            }
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

        $$('[data-admin-target]').forEach(function (btn) {
            if (btn._odAdminBound) return;
            btn._odAdminBound = true;
            btn.addEventListener('click', function () {
                if (!_isAdmin()) return;
                var target = this.dataset.adminTarget || 'orders';
                if (target === 'review') {
                    if (typeof openAdminOrderReview === 'function') openAdminOrderReview();
                    return;
                }
                if (target === 'problem-orders') {
                    if (typeof openAdminProblemOrders === 'function') openAdminProblemOrders();
                    return;
                }
                if (target === 'drivers') {
                    _openOwnerPanel('users');
                    return;
                }
                if (target === 'reports') {
                    if (typeof openAdminTransactions === 'function') openAdminTransactions();
                    return;
                }
                _openOwnerPanel('activity');
            });
        });

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
                else if (action === 'activity-latest') { _openOwnerPanel('activity'); }
                else if (action === 'manage-users') { _openOwnerPanel('users'); }
                else if (action === 'settings') openOwnerSettings();
            });
        });

        // Transactions button
        var txBtn = $('ownerBtnTransactions');
        if (txBtn) txBtn.addEventListener('click', function () {
            if (typeof openAdminTransactions === 'function') openAdminTransactions();
        });

        var reviewBtn = $('ownerBtnOpenReviewQueue');
        if (reviewBtn) reviewBtn.addEventListener('click', function () {
            if (typeof openAdminOrderReview === 'function') openAdminOrderReview();
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

        var driverFilters = $('adminDriverFilters');
        if (driverFilters && !driverFilters._bound) {
            driverFilters._bound = true;
            driverFilters.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-driver-filter]');
                if (!btn || !_isAdmin()) return;
                _adminDriverFilter = btn.dataset.driverFilter || 'all';
                driverFilters.querySelectorAll('[data-driver-filter]').forEach(function (b) {
                    b.classList.toggle('active', b === btn);
                });
                renderOwnerUsers();
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

        var quickTitle = $('ownerQuickTitle');
        if (quickTitle) {
            quickTitle.textContent = _isOwner() ? '⚡ Aksi Cepat Owner' : '⚡ Aksi Cepat Admin';
        }

        var revenueLabel = $('ownerRevenueLabel');
        if (revenueLabel) {
            revenueLabel.textContent = _isOwner() ? 'Fee Platform' : 'Perlu Review';
        }

        var navActivity = $('ownerNavActivityLabel');
        if (navActivity) {
            navActivity.textContent = 'Aktivitas Terbaru';
        }

        var activityTitle = $('ownerActivityTitle');
        if (activityTitle) {
            activityTitle.textContent = _isOwner() ? 'Timeline Aktivitas' : 'Aktivitas Terbaru Sistem';
        }

        var activitySubtitle = $('ownerActivitySubtitle');
        if (activitySubtitle) {
            activitySubtitle.textContent = _isOwner()
                ? 'Dipisah rapi antara aktivitas order dan pengguna'
                : 'Pantau order dibuat, order selesai, komisi approve, dan komisi reject';
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
        _renderAdminReviewFocus(_ordersCache);
        _renderAdminFlow(_ordersCache);
        _renderAdminQuickMonitor(_ordersCache);
        _renderAdminReportSummary(_ordersCache);
        _renderAdminWorkPriority(_ordersCache);
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
                _renderAdminReviewFocus(res.data);
                _renderAdminFlow(res.data);
                _renderAdminQuickMonitor(res.data);
                _renderAdminReportSummary(res.data);
                _renderAdminWorkPriority(res.data);
                _renderChart(res.data, 7);
                _renderActivity(res.data);
                // Re-render user cards so order-derived stats are visible on first load.
                renderOwnerUsers();
            }).catch(function () {});
    }

    function _getStartOfTodayTs() {
        var start = new Date();
        start.setHours(0, 0, 0, 0);
        return start.getTime();
    }

    function _isActiveOrderStatus(status) {
        return ['accepted', 'on_the_way', 'arrived', 'in_progress'].indexOf(String(status || '')) >= 0;
    }

    function _isAwaitingAdminReview(order) {
        var o = order || {};
        var status = String(o.status || '');
        if (status !== 'completed' && status !== 'rated') return false;
        if (!!o.walletSettled) return false;
        var reviewStatus = String(o.adminReviewStatus || '').toLowerCase();
        if (reviewStatus === 'approved' || reviewStatus === 'rejected') return false;
        return true;
    }

    function _countPendingReview(orders) {
        return (orders || []).filter(function (o) {
            return _isAwaitingAdminReview(o);
        }).length;
    }

    function _isOpenUserComplaint(order) {
        var o = order || {};
        var hasComplaint = !!(o.userComplaint || o.userComplaintText || o.userComplaintAt);
        var status = String(o.complaintStatus || '').toLowerCase();
        return hasComplaint && status !== 'resolved' && status !== 'closed';
    }

    function _countProblemOrders(orders) {
        return (orders || []).filter(function (o) {
            return _isOpenUserComplaint(o);
        }).length;
    }

    function _countHangingOrders(orders) {
        var now = Date.now();
        var activeMaxMs = 45 * 60 * 1000;
        var reviewMaxMs = 30 * 60 * 1000;
        return (orders || []).filter(function (o) {
            var baseTs = Number(o.updatedAt || o.createdAt || 0);
            var age = baseTs > 0 ? (now - baseTs) : 0;
            var isStaleActive = _isActiveOrderStatus(o.status) && age > activeMaxMs;
            var isStaleReview = _isAwaitingAdminReview(o)
                && age > reviewMaxMs;
            return isStaleActive || isStaleReview;
        }).length;
    }

    function _countDriverIssues(orders) {
        var users = typeof getUsers === 'function' ? getUsers() : [];
        var drivers = users.filter(function (u) { return u.role === 'talent'; });
        return drivers.filter(function (d) {
            var assigned = (orders || []).filter(function (o) {
                return String(o.talentId || '') === String(d.id);
            });
            var completed = assigned.filter(function (o) {
                return o.status === 'completed' || o.status === 'rated';
            }).length;
            var failed = assigned.filter(function (o) {
                return o.status === 'cancelled' || o.status === 'rejected';
            }).length;
            var completionRate = assigned.length > 0 ? Math.round((completed / assigned.length) * 100) : 0;
            return d.is_active === false || failed >= 2 || (assigned.length >= 3 && completionRate < 60);
        }).length;
    }

    function _setWorkItemState(id, count) {
        var item = $(id);
        if (!item) return;
        item.classList.toggle('is-alert', Number(count || 0) > 0);
        item.classList.toggle('is-safe', Number(count || 0) === 0);
    }

    function _renderAdminWorkPriority(orders) {
        if (!_isAdmin()) return;
        var list = Array.isArray(orders) ? orders : [];

        var pendingReview = _countPendingReview(list);
        var problemOrders = _countProblemOrders(list);
        var activeOrders = list.filter(function (o) { return _isActiveOrderStatus(o.status); }).length;
        var driverIssues = _countDriverIssues(list);
        var reportCount = list.length;

        _setKPIValue('adminPriorityReviewCount', pendingReview);
        _setKPIValue('adminPriorityProblemCount', problemOrders);
        _setKPIValue('adminPriorityActiveCount', activeOrders);
        _setKPIValue('adminPriorityDriverCount', driverIssues);
        _setKPIValue('adminPriorityReportCount', reportCount);

        _setWorkItemState('adminWorkItemReview', pendingReview);
        _setWorkItemState('adminWorkItemProblem', problemOrders);
        _setWorkItemState('adminWorkItemActive', activeOrders);
        _setWorkItemState('adminWorkItemDriver', driverIssues);
        _setWorkItemState('adminWorkItemReport', reportCount);

        var checkEl = $('adminDashboardLastCheck');
        if (checkEl) {
            checkEl.textContent = new Date().toLocaleString('id-ID', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            });
        }

        var priorityText = $('adminPriorityText');
        var priorityBtn = $('adminPriorityBtn');
        var priorityBox = $('adminPriorityBox');
        if (!priorityText || !priorityBtn || !priorityBox) return;

        if (pendingReview > 0) {
            priorityBox.classList.add('is-alert');
            priorityBox.classList.remove('is-safe');
            priorityText.textContent = pendingReview + ' order selesai menunggu verifikasi. Prioritas #1 admin: review komisi agar pembayaran tidak terlambat.';
            priorityBtn.textContent = 'Review Komisi Sekarang';
            priorityBtn.dataset.adminTarget = 'review';
            return;
        }

        if (problemOrders > 0) {
            priorityBox.classList.add('is-alert');
            priorityBox.classList.remove('is-safe');
            priorityText.textContent = problemOrders + ' aduan user pada order menunggu tindak lanjut admin. Prioritas #2: selesaikan aduan agar operasional tetap sehat.';
            priorityBtn.textContent = 'Tangani Aduan Order';
            priorityBtn.dataset.adminTarget = 'problem-orders';
            return;
        }

        if (activeOrders > 0) {
            priorityBox.classList.add('is-safe');
            priorityBox.classList.remove('is-alert');
            priorityText.textContent = activeOrders + ' order aktif sedang berjalan. Prioritas #3: monitoring progres agar tidak ada order menggantung.';
            priorityBtn.textContent = 'Monitoring Order Aktif';
            priorityBtn.dataset.adminTarget = 'orders';
            return;
        }

        if (driverIssues > 0) {
            priorityBox.classList.add('is-safe');
            priorityBox.classList.remove('is-alert');
            priorityText.textContent = driverIssues + ' driver perlu evaluasi. Prioritas #4: kelola suspend/aktifkan untuk jaga kualitas layanan.';
            priorityBtn.textContent = 'Kelola Driver';
            priorityBtn.dataset.adminTarget = 'drivers';
            return;
        }

        priorityBox.classList.add('is-safe');
        priorityBox.classList.remove('is-alert');
        priorityText.textContent = 'Prioritas #5 laporan: operasional stabil, tidak ada keterlambatan pembayaran komisi.';
        priorityBtn.textContent = 'Buka Laporan';
        priorityBtn.dataset.adminTarget = 'reports';
    }

    function _renderAdminReviewFocus(orders) {
        if (!_isAdmin()) return;
        var count = _countPendingReview(orders);
        var countEl = $('adminPendingReviewCount');
        if (countEl) countEl.textContent = String(count);
        var activityCountEl = $('adminActivityPendingCount');
        if (activityCountEl) activityCountEl.textContent = String(count);

        var hintEl = $('adminReviewFocusHint');
        if (hintEl) {
            hintEl.textContent = count > 0
                ? 'Ada ' + count + ' order selesai yang wajib diverifikasi admin sebelum transfer komisi.'
                : 'Tidak ada antrian review. Pantau order selesai agar komisi hanya dicairkan setelah verifikasi.';
        }
    }

    function _renderAdminQuickMonitor(orders) {
        if (!_isAdmin()) return;
        var list = Array.isArray(orders) ? orders : [];
        var startToday = _getStartOfTodayTs();
        var todayOrders = list.filter(function (o) {
            return Number(o.createdAt || 0) >= startToday;
        });

        var totalToday = todayOrders.length;
        var activeToday = todayOrders.filter(function (o) { return _isActiveOrderStatus(o.status); }).length;
        var completedToday = todayOrders.filter(function (o) {
            return o.status === 'completed' || o.status === 'rated';
        }).length;
        var pendingReview = _countPendingReview(list);

        _setKPIValue('adminTodayTotalOrders', totalToday);
        _setKPIValue('adminTodayActiveOrders', activeToday);
        _setKPIValue('adminTodayCompletedOrders', completedToday);
        _setKPIValue('adminPendingReviewCount', pendingReview);

        var priorityBox = $('adminPriorityBox');
        var priorityText = $('adminPriorityText');
        var priorityBtn = $('adminPriorityBtn');
        var pendingApproveCard = $('adminPendingApproveCard');
        if (!priorityBox || !priorityText || !priorityBtn) return;

        if (pendingReview > 0) {
            priorityBox.classList.add('is-alert');
            priorityBox.classList.remove('is-safe');
            priorityText.textContent = pendingReview + ' order menunggu approve. Ini indikator kerja utama admin hari ini, segera masuk halaman Review Komisi.';
            priorityBtn.textContent = 'Review Komisi Sekarang';
            priorityBtn.dataset.adminTarget = 'review';
            if (pendingApproveCard) pendingApproveCard.classList.add('is-priority');
        } else {
            priorityBox.classList.add('is-safe');
            priorityBox.classList.remove('is-alert');
            priorityText.textContent = 'Status aman. Semua order sudah diverifikasi, tidak ada komisi yang tertunda.';
            priorityBtn.textContent = 'Lihat Detail Order';
            priorityBtn.dataset.adminTarget = 'orders';
            if (pendingApproveCard) pendingApproveCard.classList.remove('is-priority');
        }

        _renderAdminWorkPriority(list);
    }

    function _renderAdminFlow(orders) {
        if (!_isAdmin()) return;
        var list = Array.isArray(orders) ? orders : [];

        var created = list.filter(function (o) {
            return ['pending', 'searching', 'preparing'].indexOf(String(o.status || '')) >= 0;
        }).length;
        var assigned = list.filter(function (o) {
            return ['accepted', 'on_the_way', 'arrived', 'in_progress'].indexOf(String(o.status || '')) >= 0;
        }).length;
        var running = list.filter(function (o) {
            return ['on_the_way', 'arrived', 'in_progress'].indexOf(String(o.status || '')) >= 0;
        }).length;
        var completed = list.filter(function (o) {
            return o.status === 'completed' || o.status === 'rated';
        }).length;
        var pending = _countPendingReview(list);
        var approved = list.filter(function (o) { return o.adminReviewStatus === 'approved'; }).length;
        var rejected = list.filter(function (o) { return o.adminReviewStatus === 'rejected'; }).length;

        _setKPIValue('adminFlowCreated', created);
        _setKPIValue('adminFlowAssigned', assigned);
        _setKPIValue('adminFlowRunning', running);
        _setKPIValue('adminFlowCompleted', completed);
        _setKPIValue('adminFlowPending', pending);
        _setKPIValue('adminFlowApproved', approved);
        _setKPIValue('adminFlowRejected', rejected);
    }

    function _renderAdminReportSummary(orders) {
        if (!_isAdmin()) return;

        var list = Array.isArray(orders) ? orders : [];
        var startToday = _getStartOfTodayTs();

        var totalOrders = list.length;
        var totalRevenue = list
            .filter(function (o) { return o.status === 'completed' || o.status === 'rated'; })
            .reduce(function (sum, o) { return sum + (Number(o.fee) || 0); }, 0);

        var todayOrders = list.filter(function (o) { return Number(o.createdAt || 0) >= startToday; });
        var todayCompleted = todayOrders.filter(function (o) {
            return o.status === 'completed' || o.status === 'rated';
        }).length;
        var perf = todayOrders.length > 0 ? Math.round((todayCompleted / todayOrders.length) * 100) : 0;

        _setKPIValue('adminReportTotalOrders', totalOrders);
        var revenueEl = $('adminReportTotalRevenue');
        if (revenueEl) revenueEl.textContent = formatRp(totalRevenue);
        var perfEl = $('adminReportDailyPerformance');
        if (perfEl) {
            perfEl.textContent = perf + '% selesai hari ini (' + todayCompleted + '/' + todayOrders.length + ' order)';
        }
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
        if (_isAdmin()) {
            _setKPIValue('ownerRevenue', _countPendingReview(orders));
            return;
        }

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
        if (_isAdmin()) return;
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
        if (_isAdmin()) return;
        var ownerRevenueText = ($('ownerRevenue') && $('ownerRevenue').textContent) || 'Rp 0';
        var revenue = Number(String(ownerRevenueText).replace(/[^0-9-]/g, '')) || 0;
        _syncOwnerFinancialSummary(revenue);
    }

    // ─── Chart ───
    function _renderChart(orders, days) {
        if (_isAdmin()) return;
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
                statusText: (o.pendingAdminReview
                    ? 'Menunggu verifikasi komisi'
                    : (o.adminReviewStatus === 'approved'
                        ? 'Komisi disetujui admin'
                        : (o.adminReviewStatus === 'rejected'
                            ? 'Komisi ditolak admin'
                            : formatStatus(o.status)))),
                fee: Number(o.fee) || 0,
                total: Number(o.totalCost) || Number(o.price) || 0
            };
        }

        function _resolveActorName(id, fallback) {
            var actor = usersById[String(id || '')] || {};
            return actor.name || actor.nama || fallback || 'Sistem';
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

            if (o.adminReviewStatus === 'approved' && Number(o.adminReviewedAt || 0) > 0) {
                events.push({
                    type: 'review_approved',
                    ts: Number(o.adminReviewedAt || 0),
                    order: o
                });
            }

            if (o.adminReviewStatus === 'rejected' && Number(o.adminReviewedAt || 0) > 0) {
                events.push({
                    type: 'review_rejected',
                    ts: Number(o.adminReviewedAt || 0),
                    order: o
                });
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

            if (u.role === 'talent' && u.is_active === false) {
                var suspendedTs = Number(u.suspendedAt || 0);
                if (suspendedTs > 0 && inCurrentRange(suspendedTs)) {
                    events.push({
                        type: 'driver_suspended',
                        ts: suspendedTs,
                        user: u,
                        actorId: u.suspendedBy || '',
                        actorName: u.suspendedByName || ''
                    });
                }
            }
        });

        var createdCount = events.filter(function (e) { return e.type === 'order_created'; }).length;
        var doneCount = events.filter(function (e) { return e.type === 'order_completed'; }).length;
        var approvedCount = events.filter(function (e) { return e.type === 'review_approved'; }).length;
        var rejectedCount = events.filter(function (e) { return e.type === 'review_rejected'; }).length;
        var suspendedCount = events.filter(function (e) { return e.type === 'driver_suspended'; }).length;
        var userCount = events.filter(function (e) { return e.type === 'user_joined'; }).length;

        if (_activityFilter === 'orders') {
            events = events.filter(function (e) {
                return e.type === 'order_created'
                    || e.type === 'order_completed'
                    || e.type === 'review_approved'
                    || e.type === 'review_rejected'
                    || e.type === 'driver_suspended';
            });
        } else if (_activityFilter === 'users') {
            events = events.filter(function (e) { return e.type === 'user_joined'; });
        }

        events.sort(function (a, b) { return b.ts - a.ts; });
        var recent = events.slice(0, 18);

        var summaryThirdLabel = _isAdmin() ? '🛡️ Audit Admin' : '👥 User Baru';
        var summaryThirdCount = _isAdmin() ? (approvedCount + rejectedCount + suspendedCount) : userCount;

        var summaryHtml = '<div class="od-activity-summary">'
            + '<div class="od-activity-chip"><span>🆕 Order Masuk</span><strong>' + createdCount + '</strong></div>'
            + '<div class="od-activity-chip"><span>✅ Order Selesai</span><strong>' + doneCount + '</strong></div>'
            + '<div class="od-activity-chip"><span>' + summaryThirdLabel + '</span><strong>' + summaryThirdCount + '</strong></div>'
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

                    if (evt.type === 'driver_suspended') {
                    var d = evt.user || {};
                    var driverName = d.name || d.nama || 'Driver';
                    var driverInitial = driverName.charAt(0).toUpperCase();
                    var actorText = evt.actorName || _resolveActorName(evt.actorId, 'Admin');
                    return dayHead + '<article class="od-activity-card od-activity-user-card">'
                        + '<div class="od-activity-card-top">'
                        + '<span class="od-activity-badge type-order">Driver Disuspend</span>'
                        + '<span class="od-activity-time">' + formatDateTime(evt.ts) + '</span>'
                        + '</div>'
                        + '<div class="od-activity-row">'
                        + '<div class="od-activity-avatar" style="background:' + _roleColor('talent') + '">' + driverInitial + '</div>'
                        + '<div class="od-activity-info">'
                        + '<div class="od-activity-title">' + escapeHtml(driverName) + '</div>'
                        + '<div class="od-activity-meta">Role: Driver / Talent</div>'
                        + '<div class="od-activity-meta">Aksi oleh: ' + escapeHtml(actorText) + '</div>'
                        + '</div>'
                        + '</div>'
                        + '</article>';
                    }

            var o = evt.order || {};
            var meta = buildOrderMeta(o);
            var isDone = evt.type === 'order_completed';
            var isReviewApproved = evt.type === 'review_approved';
            var isReviewRejected = evt.type === 'review_rejected';
            var badgeType = isReviewRejected ? 'type-order' : (isDone || isReviewApproved ? 'type-done' : 'type-order');
            var badgeText = isReviewApproved
                ? 'Komisi Disetujui'
                : (isReviewRejected
                    ? 'Komisi Ditolak'
                    : (isDone ? 'Order Selesai' : 'Order Baru'));
            var feeText = meta.fee > 0 ? formatRp(meta.fee) : '-';
            var reviewReasonTag = isReviewRejected && o.adminReviewReason
                ? ('<span class="od-activity-tag">Alasan: ' + escapeHtml(String(o.adminReviewReason)) + '</span>')
                : '';

            var actorName = isReviewApproved || isReviewRejected
                ? _resolveActorName(o.adminReviewedBy, 'Admin')
                : (isDone ? meta.driver : meta.customer);

            var actorTag = '<span class="od-activity-tag">Aksi oleh: ' + escapeHtml(actorName || 'Sistem') + '</span>';

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
                + actorTag
                + reviewReasonTag
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
        if (_isAdmin()) {
            users = users.filter(function (u) {
                return u.role === 'talent' || u.role === 'user' || u.role === 'penjual';
            });
        }

        if (users.length === 0) {
            container.innerHTML = '<div class="od-empty"><span>👥</span><p>Belum ada pengguna</p></div>';
            return;
        }

        var roleColors = { user: '#FF6B00', talent: '#3B82F6', penjual: '#22C55E', cs: '#8B5CF6', admin: '#EF4444' };
        var roleLabels = { user: 'User', talent: 'Talent', penjual: 'Penjual', cs: 'CS', admin: 'Admin' };
        var roleChipClass = { user: 'is-user', talent: 'is-talent', penjual: 'is-penjual', cs: 'is-cs', admin: 'is-admin' };
        var ordersRef = Array.isArray(_ordersCache) ? _ordersCache : [];

        function buildDriverPerformance(driver) {
            var assigned = ordersRef.filter(function (o) { return String(o.talentId || '') === String(driver.id); });
            var completed = assigned.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; }).length;
            var failed = assigned.filter(function (o) {
                return o.status === 'cancelled' || o.status === 'rejected';
            }).length;
            var completionRate = assigned.length > 0 ? Math.round((completed / assigned.length) * 100) : 0;
            var isProblem = (driver.is_active === false)
                || failed >= 2
                || (assigned.length >= 3 && completionRate < 60);
            return {
                assigned: assigned.length,
                completed: completed,
                failed: failed,
                completionRate: completionRate,
                isProblem: isProblem
            };
        }

        if (_isAdmin()) {
            var managed = allUsers.filter(function (u) {
                return u.role === 'user' || u.role === 'talent' || u.role === 'penjual';
            });
            var totalUsers = managed.filter(function (u) { return u.role === 'user'; }).length;
            var totalDrivers = managed.filter(function (u) { return u.role === 'talent'; }).length;
            var totalSellers = managed.filter(function (u) { return u.role === 'penjual'; }).length;

            _setKPIValue('adminDriverTotal', managed.length);
            _setKPIValue('adminDriverActive', totalUsers);
            _setKPIValue('adminDriverSuspended', totalDrivers);
            _setKPIValue('adminDriverProblem', totalSellers);
        }

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

        if (_isAdmin() && _adminDriverFilter !== 'all') {
            users = users.filter(function (u) {
                if (_adminDriverFilter === 'user') return u.role === 'user';
                if (_adminDriverFilter === 'talent') return u.role === 'talent';
                if (_adminDriverFilter === 'penjual') return u.role === 'penjual';
                return true;
            });
        }

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
            var isActive = u.is_active !== false;
            var driverPerf = u.role === 'talent' ? buildDriverPerformance(u) : null;
            var statusChip = '<span class="od-user-status-chip ' + (isActive ? 'is-active' : 'is-suspended') + '">'
                + (isActive ? 'Aktif' : 'Suspended')
                + '</span>';

            var actionBtn = '';
            if (_isAdmin()) {
                if (u.role === 'talent' || u.role === 'user' || u.role === 'penjual') {
                    actionBtn = '<button class="od-user-action ' + (isActive ? 'is-suspend' : 'is-activate') + '" data-uid="' + u.id + '" data-next-active="' + (isActive ? '0' : '1') + '">'
                        + (isActive ? 'Suspend' : 'Aktifkan')
                        + '</button>';
                }
            } else {
                // Owner can delete any non-owner account.
                actionBtn = '<button class="od-user-delete" data-uid="' + u.id + '" title="Hapus user">'
                    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                    + '</button>';
            }

            var avatarUrl = resolveUserAvatar(u);
            var avatarContent = avatarUrl
                ? '<span class="od-user-avatar-fallback" style="display:none">' + initial + '</span>'
                    + '<img src="' + escapeHtml(avatarUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="" onerror="this.style.display=\'none\';if(this.previousElementSibling){this.previousElementSibling.style.display=\'flex\';}">'
                : initial;

            var driverFlag = '';
            if (driverPerf && driverPerf.isProblem) {
                driverFlag = '<div class="od-driver-alert">Performa perlu ditangani admin</div>';
            }

            var statsInline = driverPerf
                ? ('<span><strong>' + driverPerf.assigned + '</strong> Ditangani</span>'
                    + '<span><strong>' + driverPerf.completionRate + '%</strong> Completion</span>'
                    + '<span><strong>' + driverPerf.failed + '</strong> Kasus Gagal</span>')
                : ('<span><strong>' + userOrders.length + '</strong> Total Order</span>'
                    + '<span><strong>' + completedOrders + '</strong> Selesai</span>'
                    + '<span><strong>' + escapeHtml(lastOrderTs ? fmtDate(lastOrderTs) : '-') + '</strong> Aktivitas Akhir</span>');

            return '<article class="od-user-item od-user-card">'
                + '<div class="od-user-main">'
                + '<div class="od-user-avatar" style="background:' + (roleColors[u.role] || '#999') + '">' + avatarContent + '</div>'
                + '<div class="od-user-info">'
                + '<div class="od-user-topline">'
                + '<div class="od-user-name">' + escapeHtml(displayName) + '</div>'
                + '<span class="od-user-role-chip ' + (roleChipClass[u.role] || '') + '">' + escapeHtml(roleText) + '</span>'
                + statusChip
                + '</div>'
                + '<div class="od-user-meta">@' + escapeHtml(String(displayUsername)) + '</div>'
                + '<div class="od-user-submeta">Gabung: ' + escapeHtml(fmtDate(joinedAt)) + '</div>'
                + driverFlag
                + '</div>'
                + actionBtn
                + '</div>'
                + '<div class="od-user-stats-inline">'
                + statsInline
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

        container.querySelectorAll('.od-user-action').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var uid = this.dataset.uid;
                var nextActive = this.dataset.nextActive === '1';
                var list = typeof getUsers === 'function' ? getUsers() : [];
                var idx = list.findIndex(function (u) { return String(u.id) === String(uid); });
                if (idx < 0) return;

                var actor = (typeof getSession === 'function' && getSession()) ? getSession() : null;

                var user = Object.assign({}, list[idx], {
                    is_active: nextActive,
                    suspendedAt: nextActive ? 0 : Date.now(),
                    suspendedBy: nextActive ? '' : (actor ? actor.id : ''),
                    suspendedByName: nextActive ? '' : (actor ? (actor.name || actor.nama || 'Admin') : 'Admin'),
                    statusUpdatedAt: Date.now()
                });
                list[idx] = user;
                if (typeof saveUsers === 'function') saveUsers(list);
                if (typeof backendPost === 'function') {
                    backendPost(Object.assign({ action: 'register' }, user));
                }
                if (typeof showToast === 'function') {
                    showToast(nextActive ? 'Akun diaktifkan kembali' : 'Akun disuspend', 'success');
                }
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
        refreshDashboardOrders: _loadOrdersAndRevenue,
        renderOwnerStats: renderOwnerStats,
        renderOwnerUsers: renderOwnerUsers,
        loadOwnerCommissionSettings: loadOwnerCommissionSettings,
        handleCommissionFormSubmit: handleCommissionFormSubmit,
        openOwnerSettings: openOwnerSettings,
        syncOwnerFinancePreview: syncOwnerFinancePreview
    };
})();

window.refreshOwnerDashboardOrders = function () {
    if (typeof OwnerDashboard !== 'undefined' && OwnerDashboard && typeof OwnerDashboard.refreshDashboardOrders === 'function') {
        OwnerDashboard.refreshDashboardOrders();
    }
};

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
// ═══ ADMIN PROBLEM ORDERS (USER COMPLAINTS) ═══
// ══════════════════════════════════════════
function openAdminProblemOrders() {
    var page = document.getElementById('adminProblemOrderPage');
    if (!page) {
        page = document.createElement('div');
        page.id = 'adminProblemOrderPage';
        page.className = 'stp-page hidden';
        page.style.cssText = [
            'position:fixed;top:0;left:0;right:0;bottom:0;z-index:1250;',
            'background:#FFFBEB;overflow-y:auto;font-family:var(--font,sans-serif);'
        ].join('');
        page.innerHTML = [
            '<div style="background:#fff;border-bottom:1px solid #FDE68A;padding:16px 20px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.05);">',
                '<button id="apoBtnBack" style="background:none;border:none;font-size:22px;cursor:pointer;padding:0 6px;color:#374151;line-height:1;">&#8592;</button>',
                '<div>',
                    '<div style="font-size:16px;font-weight:700;color:#111;">Penanganan Aduan Order</div>',
                    '<div style="font-size:12px;color:#6B7280;">Hanya aduan yang dibuat user customer</div>',
                '</div>',
            '</div>',
            '<div id="apoList" style="padding:16px;display:flex;flex-direction:column;gap:12px;">',
                '<div style="text-align:center;padding:40px;color:#9CA3AF;">Memuat aduan...</div>',
            '</div>'
        ].join('');
        document.body.appendChild(page);
        page.dataset.apoFilter = 'baru';

        page.querySelector('#apoBtnBack').addEventListener('click', function () {
            page.classList.add('hidden');
        });
    }

    page.classList.remove('hidden');
    loadAdminProblemOrders(page);
}
window.openAdminProblemOrders = openAdminProblemOrders;

function _apoFormatAge(ms) {
    var min = Math.max(1, Math.floor(Number(ms || 0) / 60000));
    if (min < 60) return min + ' mnt';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + ' jam';
    var day = Math.floor(hr / 24);
    return day + ' hari';
}

function _apoSlaBadge(complaintTs) {
    var ageMs = Math.max(0, Date.now() - Number(complaintTs || 0));
    var ageMin = Math.floor(ageMs / 60000);

    if (ageMin > 120) {
        return {
            text: 'Lewat SLA',
            age: _apoFormatAge(ageMs),
            style: 'background:#FEE2E2;color:#B91C1C;border:1px solid #FECACA;'
        };
    }
    if (ageMin > 30) {
        return {
            text: 'Mendekati SLA',
            age: _apoFormatAge(ageMs),
            style: 'background:#FEF3C7;color:#92400E;border:1px solid #FCD34D;'
        };
    }
    return {
        text: 'SLA Aman',
        age: _apoFormatAge(ageMs),
        style: 'background:#DCFCE7;color:#166534;border:1px solid #86EFAC;'
    };
}

function loadAdminProblemOrders(page) {
    var listEl = page ? page.querySelector('#apoList') : null;
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#9CA3AF;">Memuat aduan...</div>';

    if (typeof FB === 'undefined' || !FB.isReady()) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#EF4444;">&#10060; Tidak terhubung ke server</div>';
        return;
    }

    FB.get('getAllOrders').then(function (r) { return r.json(); }).then(function (res) {
        if (!res || !res.success || !Array.isArray(res.data)) {
            listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#EF4444;">&#10060; Gagal memuat order</div>';
            return;
        }

        var users = typeof getUsers === 'function' ? getUsers() : [];
        var allOrders = res.data.slice();

        function hasComplaint(order) {
            return !!(order.userComplaint || order.userComplaintText || order.userComplaintAt);
        }

        function isHandled(order) {
            var status = String(order.complaintStatus || '').toLowerCase();
            return status === 'resolved' || status === 'closed';
        }

        var openComplaints = allOrders.filter(function (o) { return hasComplaint(o) && !isHandled(o); })
            .sort(function (a, b) {
                return Number(b.userComplaintAt || b.updatedAt || b.createdAt || 0) - Number(a.userComplaintAt || a.updatedAt || a.createdAt || 0);
            });

        var handledComplaints = allOrders.filter(function (o) { return hasComplaint(o) && isHandled(o); })
            .sort(function (a, b) {
                return Number(b.complaintResolvedAt || b.updatedAt || b.createdAt || 0) - Number(a.complaintResolvedAt || a.updatedAt || a.createdAt || 0);
            });

        var activeFilter = String(page.dataset.apoFilter || 'baru');
        if (activeFilter !== 'baru' && activeFilter !== 'ditangani') {
            activeFilter = 'baru';
            page.dataset.apoFilter = activeFilter;
        }

        function renderComplaintCard(o, mode) {
            var customer = users.find(function (u) { return String(u.id || '') === String(o.userId || ''); }) || {};
            var driver = users.find(function (u) { return String(u.id || '') === String(o.talentId || ''); }) || {};
            var seller = users.find(function (u) { return String(u.id || '') === String(o.sellerId || ''); }) || {};
            var complaintTs = Number(o.userComplaintAt || o.updatedAt || o.createdAt || Date.now());
            var complaintDate = new Date(complaintTs).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            var sla = _apoSlaBadge(complaintTs);
            var handledTs = Number(o.complaintResolvedAt || 0);
            var handledDate = handledTs > 0
                ? new Date(handledTs).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '-';

            var statusBadge = mode === 'ditangani'
                ? '<span style="background:#DCFCE7;color:#166534;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;">Ditangani</span>'
                : '<span style="background:#FEE2E2;color:#B91C1C;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;">Aduan Baru</span>';

            var slaBadge = mode === 'ditangani'
                ? '<span style="background:#ECFDF5;color:#065F46;border:1px solid #A7F3D0;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700;">Selesai ' + (typeof escapeHtml === 'function' ? escapeHtml(handledDate) : handledDate) + '</span>'
                : '<span style="' + sla.style + 'border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700;">' + sla.text + ' • ' + sla.age + '</span>';

            var sellerRow = o.sellerId
                ? ('<div style="font-size:12px;color:#374151;margin-top:4px;">🏪 Seller: ' + (typeof escapeHtml === 'function' ? escapeHtml(seller.name || seller.nama || '-') : (seller.name || seller.nama || '-')) + '</div>')
                : '';

            return [
                '<div style="background:#fff;border:1px solid #FDE68A;border-radius:14px;padding:14px;box-shadow:0 1px 6px rgba(0,0,0,.04);">',
                    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">',
                        '<div style="font-size:13px;font-weight:700;color:#111;">Order #' + String(o.id || '').substr(0, 10) + '</div>',
                        statusBadge,
                    '</div>',
                    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">',
                        slaBadge,
                        '<span style="background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700;">' + (typeof escapeHtml === 'function' ? escapeHtml(o.serviceType || o.skillType || 'Pesanan') : (o.serviceType || o.skillType || 'Pesanan')) + '</span>',
                    '</div>',
                    '<div style="font-size:12px;color:#6B7280;margin-top:6px;">Aduan masuk: ' + complaintDate + '</div>',
                    '<div style="font-size:12px;color:#374151;margin-top:8px;">👤 Customer: ' + (typeof escapeHtml === 'function' ? escapeHtml(customer.name || customer.nama || '-') : (customer.name || customer.nama || '-')) + '</div>',
                    '<div style="font-size:12px;color:#374151;margin-top:4px;">🛵 Driver: ' + (typeof escapeHtml === 'function' ? escapeHtml(driver.name || driver.nama || '-') : (driver.name || driver.nama || '-')) + '</div>',
                    sellerRow,
                    '<div style="margin-top:10px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:10px;">',
                        '<div style="font-size:11px;color:#9A3412;font-weight:700;margin-bottom:4px;">Isi aduan user</div>',
                        '<div style="font-size:13px;color:#7C2D12;line-height:1.45;">' + (typeof escapeHtml === 'function' ? escapeHtml(String(o.userComplaintText || 'Aduan tanpa detail')) : String(o.userComplaintText || 'Aduan tanpa detail')) + '</div>',
                    '</div>',
                    '<div style="display:flex;gap:8px;margin-top:12px;">',
                        '<button class="apo-btn-detail" data-order-id="' + String(o.id || '') + '" style="flex:1;border:1px solid #D1D5DB;border-radius:10px;padding:10px 12px;background:#fff;color:#374151;font-size:13px;font-weight:700;cursor:pointer;">Lihat Detail Order</button>',
                        (mode === 'baru'
                            ? '<button class="apo-btn-resolve" data-order-id="' + String(o.id || '') + '" style="flex:1;border:none;border-radius:10px;padding:10px 12px;background:linear-gradient(135deg,#16A34A,#15803D);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Tandai Selesai</button>'
                            : ''),
                    '</div>',
                '</div>'
            ].join('');
        }

        function renderByFilter() {
            var currentFilter = String(page.dataset.apoFilter || 'baru');
            var source = currentFilter === 'ditangani' ? handledComplaints : openComplaints;

            var filterBar = [
                '<div style="background:#fff;border:1px solid #FDE68A;border-radius:12px;padding:8px;display:flex;gap:8px;">',
                    '<button class="apo-filter-btn" data-filter="baru" style="flex:1;border:0;border-radius:10px;padding:9px 10px;font-size:12px;font-weight:700;cursor:pointer;',
                    (currentFilter === 'baru' ? 'background:#F97316;color:#fff;' : 'background:#FFF7ED;color:#9A3412;'),
                    '">Baru (' + openComplaints.length + ')</button>',
                    '<button class="apo-filter-btn" data-filter="ditangani" style="flex:1;border:0;border-radius:10px;padding:9px 10px;font-size:12px;font-weight:700;cursor:pointer;',
                    (currentFilter === 'ditangani' ? 'background:#16A34A;color:#fff;' : 'background:#ECFDF5;color:#166534;'),
                    '">Ditangani (' + handledComplaints.length + ')</button>',
                '</div>'
            ].join('');

            if (!source.length) {
                var emptyTitle = currentFilter === 'ditangani' ? 'Belum Ada Aduan Ditangani' : 'Tidak Ada Aduan Baru';
                var emptyDesc = currentFilter === 'ditangani'
                    ? 'Belum ada aduan yang ditandai selesai.'
                    : 'Semua aduan aktif sudah ditindaklanjuti.';

                listEl.innerHTML = filterBar + [
                    '<div style="text-align:center;padding:56px 20px;background:#fff;border:1px dashed #FDE68A;border-radius:14px;">',
                        '<div style="font-size:40px;margin-bottom:10px;">📭</div>',
                        '<div style="font-size:16px;font-weight:700;color:#111;margin-bottom:6px;">' + emptyTitle + '</div>',
                        '<div style="font-size:13px;color:#6B7280;">' + emptyDesc + '</div>',
                    '</div>'
                ].join('');
            } else {
                listEl.innerHTML = filterBar + source.map(function (o) { return renderComplaintCard(o, currentFilter); }).join('');
            }

            listEl.querySelectorAll('.apo-filter-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var filter = this.dataset.filter || 'baru';
                    page.dataset.apoFilter = filter;
                    renderByFilter();
                });
            });

            listEl.querySelectorAll('.apo-btn-detail').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var orderId = this.dataset.orderId || '';
                    if (!orderId) return;
                    var orderObj = allOrders.find(function (o) { return String(o.id || '') === String(orderId); }) || null;
                    if (!orderObj) {
                        if (typeof showToast === 'function') showToast('Detail order tidak ditemukan.', 'error');
                        return;
                    }
                    if (typeof openOrderTracking === 'function') {
                        openOrderTracking(orderObj);
                        page.classList.add('hidden');
                    } else if (typeof showToast === 'function') {
                        showToast('Halaman detail order belum tersedia.', 'error');
                    }
                });
            });

            listEl.querySelectorAll('.apo-btn-resolve').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var orderId = this.dataset.orderId || '';
                if (!orderId) return;

                var ok = confirm('Tandai aduan order ini sudah selesai ditangani?');
                if (!ok) return;

                this.disabled = true;
                this.textContent = 'Menyimpan...';

                backendPost({
                    action: 'updateOrder',
                    orderId: orderId,
                    fields: {
                        complaintStatus: 'resolved',
                        complaintResolvedAt: Date.now(),
                        complaintHandledBy: (typeof getSession === 'function' && getSession()) ? getSession().id : '',
                        followUpRequired: false,
                        fraudFlag: false
                    }
                }).then(function (saveRes) {
                    if (!saveRes || !saveRes.success) {
                        throw new Error((saveRes && saveRes.message) ? saveRes.message : 'Gagal menyimpan tindak lanjut');
                    }

                    var targetOrder = allOrders.find(function (x) { return String(x.id || '') === String(orderId); }) || null;
                    if (typeof addNotifItem === 'function' && targetOrder) {
                        if (targetOrder.userId) {
                            addNotifItem({
                                userId: targetOrder.userId,
                                icon: '✅',
                                title: 'Aduan Sudah Ditangani',
                                desc: 'Aduan Anda untuk order #' + String(orderId).substr(0, 8) + ' telah ditindaklanjuti admin.',
                                type: 'report',
                                orderId: orderId
                            });
                        }
                        if (targetOrder.talentId) {
                            addNotifItem({
                                userId: targetOrder.talentId,
                                icon: '✅',
                                title: 'Aduan Order Diselesaikan',
                                desc: 'Aduan pada order #' + String(orderId).substr(0, 8) + ' sudah ditutup admin.',
                                type: 'order',
                                orderId: orderId
                            });
                        }
                        if (targetOrder.sellerId) {
                            addNotifItem({
                                userId: targetOrder.sellerId,
                                icon: '✅',
                                title: 'Aduan Order Diselesaikan',
                                desc: 'Aduan pada order #' + String(orderId).substr(0, 8) + ' sudah ditutup admin.',
                                type: 'order',
                                orderId: orderId
                            });
                        }
                    }

                    if (typeof showToast === 'function') showToast('Aduan berhasil ditandai selesai.', 'success');
                    if (typeof renderOwnerStats === 'function') renderOwnerStats();
                    if (typeof renderOwnerUsers === 'function') renderOwnerUsers();

                    if (targetOrder) {
                        targetOrder.complaintStatus = 'resolved';
                        targetOrder.complaintResolvedAt = Date.now();
                    }
                    page.dataset.apoFilter = 'baru';
                    loadAdminProblemOrders(page);
                }).catch(function (err) {
                    if (typeof showToast === 'function') showToast((err && err.message) ? err.message : 'Gagal menindaklanjuti aduan', 'error');
                    btn.disabled = false;
                    btn.textContent = 'Tandai Selesai';
                });
            });
            });
        }

        renderByFilter();
    }).catch(function () {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#EF4444;">&#10060; Gagal memuat aduan</div>';
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
