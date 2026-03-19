/* ========================================
   JASA SURUH (JS) - CS Module
   Dashboard, Orders, Users
   ======================================== */

// ══════════════════════════════════════════
// ═══ CS DASHBOARD ═══
// ══════════════════════════════════════════
function loadCSDashboard() {
    loadCSOrders();
    loadCSUsers();
}

function loadCSOrders() {
    var listEl = document.getElementById('csOrdersList');
    if (listEl) listEl.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat pesanan...</p></div>';
    if (!isBackendConnected()) return;
    FB.get('getAllOrders')
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                _csOrdersData = res.data;
                renderCSOrders(_csCurrentFilter);
                var active = res.data.filter(function (o) { return ['accepted', 'on_the_way', 'arrived', 'in_progress'].indexOf(o.status) >= 0; }).length;
                var completed = res.data.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; }).length;
                var pending = res.data.filter(function (o) { return o.status === 'pending'; }).length;
                var el = function (id) { return document.getElementById(id); };
                if (el('csStatActive')) el('csStatActive').textContent = active;
                if (el('csStatCompleted')) el('csStatCompleted').textContent = completed;
                if (el('csStatPending')) el('csStatPending').textContent = pending;
            }
        }).catch(function () {
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
        filtered = filtered.filter(function (o) { return ['accepted', 'on_the_way', 'arrived', 'in_progress'].indexOf(o.status) >= 0; });
    } else if (filter === 'pending') {
        filtered = filtered.filter(function (o) { return o.status === 'pending'; });
    } else if (filter === 'completed') {
        filtered = filtered.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; });
    }
    filtered = filtered.slice().sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });

    if (filtered.length === 0) {
        listEl.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📭</div><p>Tidak ada pesanan</p></div>';
        return;
    }
    listEl.innerHTML = filtered.map(function (o, idx) {
        var user = users.find(function (u) { return u.id === o.userId; });
        var talent = users.find(function (u) { return u.id === o.talentId; });
        var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
        var dateText = new Date(Number(o.createdAt)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
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

    listEl.querySelectorAll('.olp-card').forEach(function (card) {
        card.addEventListener('click', function () {
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
    listEl.innerHTML = users.map(function (u) {
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
    var tabsEl = document.getElementById('csOrderTabs');
    if (tabsEl && !tabsEl._eventsSetup) {
        tabsEl._eventsSetup = true;
        tabsEl.querySelectorAll('.olp-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                tabsEl.querySelectorAll('.olp-tab').forEach(function (t) { t.classList.remove('active'); });
                this.classList.add('active');
                renderCSOrders(this.dataset.filter);
            });
        });
    }
    var refreshOrders = document.getElementById('csRefreshOrders');
    if (refreshOrders && !refreshOrders._eventsSetup) {
        refreshOrders._eventsSetup = true;
        refreshOrders.addEventListener('click', function () { loadCSOrders(); showToast('Pesanan diperbarui', 'success'); });
    }
    var refreshUsers = document.getElementById('csRefreshUsers');
    if (refreshUsers && !refreshUsers._eventsSetup) {
        refreshUsers._eventsSetup = true;
        refreshUsers.addEventListener('click', function () { loadCSUsers(); showToast('Pengguna diperbarui', 'success'); });
    }
}
