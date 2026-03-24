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

    function _setActiveOwnerNav(panel) {
        $$('.od-nav-item[data-owner-panel]').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.ownerPanel === panel);
        });
    }

    function _openOwnerPanel(panel) {
        var cfg = _ownerPanelConfig[panel] || _ownerPanelConfig.home;
        var modal = $('ownerPanelModal');
        if (!modal) return;

        if (panel === 'settings' && !_isOwner()) {
            if (typeof showToast === 'function') showToast('Hanya owner yang bisa membuka pengaturan', 'error');
            return;
        }

        _setActiveOwnerNav(panel);

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
            loadOwnerCommissionSettings();
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
        $$('.od-nav-item[data-owner-panel]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                _openOwnerPanel(this.dataset.ownerPanel || 'home');
            });
        });

        var panelCloseBtn = $('ownerPanelClose');
        if (panelCloseBtn) panelCloseBtn.addEventListener('click', _closeOwnerPanel);

        var panelBackdrop = $('ownerPanelBackdrop');
        if (panelBackdrop) panelBackdrop.addEventListener('click', _closeOwnerPanel);

        // Quick actions
        $$('.od-quick-btn').forEach(function (qbtn) {
            qbtn.addEventListener('click', function () {
                var action = this.dataset.action;
                if (action === 'add-staff') { if (typeof openStaffManagement === 'function') openStaffManagement('add'); }
                else if (action === 'staff-list') { if (typeof openStaffManagement === 'function') openStaffManagement('list'); }
                else if (action === 'view-report') { if (typeof openAdminTransactions === 'function') openAdminTransactions(); }
                else if (action === 'settings') openOwnerSettings();
            });
        });

        // Transactions button
        var txBtn = $('ownerBtnTransactions');
        if (txBtn) txBtn.addEventListener('click', function () {
            if (typeof openAdminTransactions === 'function') openAdminTransactions();
        });

        // Owner logout button
        var logoutBtn = $('ownerLogoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', function () {
            if (typeof handleLogout === 'function') handleLogout();
        });

        // Old admin/CS form/back handlers removed — replaced by React Staff Management

        // Commission form submit
        var commForm = $('commissionForm');
        if (commForm) commForm.addEventListener('submit', handleCommissionFormSubmit);
    }

    function _applyRoleVisibility() {
        // Owner-only elements: Tambah Admin, Pengaturan (commission)
        $$('.od-owner-only').forEach(function (el) {
            if (!_isOwner()) el.style.display = 'none';
            else el.style.display = '';
        });
    }

    // ─── Load All Dashboard Data ───
    function loadDashboard() {
        // Re-detect role each time
        var session = typeof getSession === 'function' ? getSession() : null;
        _currentRole = session ? (session.role || 'owner') : 'owner';

        init();
        _applyRoleVisibility();
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
        var name = session ? (session.name || session.nama || (_isOwner() ? 'Owner' : 'Admin')) : 'Owner';
        var hour = new Date().getHours();
        var greet = hour < 12 ? 'Selamat Pagi' : hour < 17 ? 'Selamat Siang' : 'Selamat Malam';
        var el = $('ownerGreeting');
        if (el) el.textContent = greet + ', ' + name + ' 👋';
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

        var today = new Date(); today.setHours(0, 0, 0, 0);
        var todayRevenue = completed
            .filter(function (o) { return Number(o.completedAt || o.createdAt) >= today.getTime(); })
            .reduce(function (sum, o) { return sum + (Number(o.fee) || 0); }, 0);
        var todayEl = $('ownerTodayRevenue');
        if (todayEl) todayEl.textContent = formatRp(todayRevenue);
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
                                if (ctx.datasetIndex === 0) return 'Revenue: ' + formatRp(ctx.raw);
                                return 'Orders: ' + ctx.raw;
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

        if (!orders || orders.length === 0) {
            container.innerHTML = '<div class="od-empty"><span>📭</span><p>Belum ada aktivitas</p></div>';
            return;
        }

        var sorted = orders.slice().sort(function (a, b) {
            return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
        });
        var recent = sorted.slice(0, 8);

        var STATUS_ICONS = {
            pending: '🟡', accepted: '🔵', 'on-the-way': '🚀',
            'in-progress': '⚡', completed: '✅', rated: '⭐', cancelled: '❌'
        };
        var STATUS_LABELS_MAP = typeof STATUS_LABELS !== 'undefined' ? STATUS_LABELS : {};

        var html = recent.map(function (o) {
            var user = users.find(function (u) { return u.id === o.userId; });
            var userName = user ? (user.name || user.nama || 'User') : '-';
            var icon = STATUS_ICONS[o.status] || '📦';
            var statusText = STATUS_LABELS_MAP[o.status] || o.status || '-';
            var priceText = o.price ? formatRp(o.price) : '-';
            var time = timeAgo(o.createdAt);
            var service = o.serviceType || o.skillType || 'Order';

            return '<div class="od-activity-item">'
                + '<div class="od-activity-icon">' + icon + '</div>'
                + '<div class="od-activity-info">'
                + '<div class="od-activity-title">' + escapeHtml(service) + ' <span class="od-activity-price">' + priceText + '</span></div>'
                + '<div class="od-activity-meta">' + escapeHtml(userName) + ' · ' + statusText + '</div>'
                + '</div>'
                + '<span class="od-activity-time">' + time + '</span>'
                + '</div>';
        }).join('');

        // New users section
        var newUsers = users.filter(function (u) { return u.role !== 'owner'; })
            .slice().sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); })
            .slice(0, 3);

        if (newUsers.length > 0) {
            html += '<div class="od-activity-divider">User Baru</div>';
            html += newUsers.map(function (u) {
                var displayName = u.name || u.nama || 'User';
                var initial = displayName.charAt(0).toUpperCase();
                var roleLabel = { user: 'User', talent: 'Talent', penjual: 'Penjual', cs: 'CS', admin: 'Admin' };
                return '<div class="od-activity-item">'
                    + '<div class="od-activity-avatar" style="background:' + _roleColor(u.role) + '">' + initial + '</div>'
                    + '<div class="od-activity-info">'
                    + '<div class="od-activity-title">' + escapeHtml(displayName) + '</div>'
                    + '<div class="od-activity-meta">' + (roleLabel[u.role] || u.role) + '</div>'
                    + '</div>'
                    + '<span class="od-activity-time">' + timeAgo(u.createdAt) + '</span>'
                    + '</div>';
            }).join('');
        }

        container.innerHTML = html;
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

        container.innerHTML = users.map(function (u) {
            var displayName = u.name || u.nama || 'Tanpa Nama';
            var displayUsername = u.username || u.no_hp || u.phone || '-';
            var initial = displayName.charAt(0).toUpperCase();
            // Admin can only delete CS, Owner can delete anyone (except owner)
            var canDelete = _isOwner() || (_currentRole === 'admin' && u.role === 'cs');
            var deleteBtn = canDelete
                ? '<button class="od-user-delete" data-uid="' + u.id + '" title="Hapus">'
                    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                    + '</button>'
                : '';
            var avatarContent = u.foto_url
                ? '<img src="' + escapeHtml(u.foto_url) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="">'
                : initial;
            return '<div class="od-user-item">'
                + '<div class="od-user-avatar" style="background:' + (roleColors[u.role] || '#999') + '">' + avatarContent + '</div>'
                + '<div class="od-user-info">'
                + '<div class="od-user-name">' + escapeHtml(displayName) + '</div>'
                + '<div class="od-user-meta">@' + escapeHtml(displayUsername) + ' · <span class="od-user-role" style="color:' + (roleColors[u.role] || '#999') + '">' + (roleLabels[u.role] || u.role) + '</span></div>'
                + '</div>'
                + deleteBtn
                + '</div>';
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
        if (typeof isBackendConnected !== 'function' || !isBackendConnected()) return;
        FB.get('getSettings')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    var s = res.data;
                    if ($('setDeliveryFeePerKm') && s.delivery_fee_per_km) $('setDeliveryFeePerKm').value = s.delivery_fee_per_km;
                    if ($('setServiceFeePercent') && s.service_fee_percent) $('setServiceFeePercent').value = s.service_fee_percent;
                    if ($('setCommTalent') && s.commission_talent_percent) $('setCommTalent').value = s.commission_talent_percent;
                    if ($('setCommPenjual') && s.commission_penjual_percent) $('setCommPenjual').value = s.commission_penjual_percent;
                    if ($('setMinFee') && s.minimum_fee) $('setMinFee').value = s.minimum_fee;
                }
            }).catch(function () {});
    }

    function handleCommissionFormSubmit(e) {
        e.preventDefault();
        if (!_isOwner()) { showToast('Hanya owner yang bisa mengubah komisi', 'error'); return; }
        var settings = {
            delivery_fee_per_km: $('setDeliveryFeePerKm').value || '3000',
            service_fee_percent: $('setServiceFeePercent').value || '10',
            commission_talent_percent: $('setCommTalent').value || '15',
            commission_penjual_percent: $('setCommPenjual').value || '10',
            minimum_fee: $('setMinFee').value || '5000'
        };
        var btn = e.target.querySelector('.od-btn-save');
        if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
        if (typeof backendPost === 'function') {
            backendPost({ action: 'updateSettings', settings: settings })
                .then(function (res) {
                    if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Pengaturan'; }
                    if (res && res.success) {
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
        openOwnerSettings: openOwnerSettings
    };
})();

// Expose globals for backward compatibility
function renderOwnerStats() { OwnerDashboard.renderOwnerStats(); }
function renderOwnerUsers() { OwnerDashboard.renderOwnerUsers(); }
function loadOwnerCommissionSettings() { OwnerDashboard.loadOwnerCommissionSettings(); }
function handleCommissionFormSubmit(e) { OwnerDashboard.handleCommissionFormSubmit(e); }
// handleCreateCS and handleCreateAdmin removed — replaced by React Staff Management
function loadOwnerRevenue() { /* handled by loadDashboard now */ }

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
            if (orders[idx] && typeof openChat === 'function') openChat(orders[idx]);
        });
    });
}
