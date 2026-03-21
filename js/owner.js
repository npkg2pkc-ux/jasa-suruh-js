/* ========================================
   JASA SURUH (JS) - Owner Module
   Create CS, Stats, Users, Commission, Revenue, Transactions
   ======================================== */

// ══════════════════════════════════════════
// ═══ OWNER: NOTIFICATION BUTTON ═══
// ══════════════════════════════════════════
(function () {
    var btn = document.getElementById('ownerNotifBtn');
    if (btn && !btn._eventsSetup) {
        btn._eventsSetup = true;
        btn.addEventListener('click', function () { openNotifPopup(); });
    }
})();

// ══════════════════════════════════════════
// ═══ OWNER: CREATE CS ═══
// ══════════════════════════════════════════
function handleCreateCS(e) {
    e.preventDefault();
    var name = (document.getElementById('csFormName').value || '').trim();
    var username = (document.getElementById('csFormUsername').value || '').trim();
    var password = document.getElementById('csFormPassword').value;

    if (!name || !username || !password) {
        showToast('Lengkapi semua data!', 'error');
        return;
    }
    if (password.length < 6) {
        showToast('Password minimal 6 karakter!', 'error');
        return;
    }

    var users = getUsers();
    if (users.some(function (u) { return u.username === username; })) {
        showToast('Username sudah digunakan!', 'error');
        return;
    }

    var csUser = {
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

    backendPost({ action: 'createCS', id: csUser.id, name: csUser.name, phone: csUser.phone, username: csUser.username, password: csUser.password, role: csUser.role, createdAt: csUser.createdAt }).then(function (res) {
        if (res && !res.success) {
            showToast(res.message || 'Gagal simpan ke server', 'error');
        }
    });

    showToast('Akun CS berhasil dibuat!', 'success');
    document.getElementById('createCSForm').reset();
    renderOwnerStats();
    renderOwnerUsers();
}

// ══════════════════════════════════════════
// ═══ OWNER: STATS ═══
// ══════════════════════════════════════════
function renderOwnerStats() {
    var users = getUsers();
    var el = function (id) { return document.getElementById(id); };
    var usersCount = users.filter(function (u) { return u.role === 'user'; }).length;
    var talentsCount = users.filter(function (u) { return u.role === 'talent'; }).length;
    var penjualCount = users.filter(function (u) { return u.role === 'penjual'; }).length;
    var csCount = users.filter(function (u) { return u.role === 'cs'; }).length;

    if (el('ownerTotalUsers')) el('ownerTotalUsers').textContent = usersCount;
    if (el('ownerTotalTalents')) el('ownerTotalTalents').textContent = talentsCount;
    if (el('ownerTotalPenjual')) el('ownerTotalPenjual').textContent = penjualCount;
    if (el('ownerTotalCS')) el('ownerTotalCS').textContent = csCount;

    if (isBackendConnected()) {
        FB.get('getAllOrders')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    if (el('ownerTotalOrders')) el('ownerTotalOrders').textContent = res.data.length;
                }
            }).catch(function () {});
    }
}

// ══════════════════════════════════════════
// ═══ OWNER: USER LIST ═══
// ══════════════════════════════════════════
function renderOwnerUsers() {
    var container = document.getElementById('ownerUserList');
    if (!container) return;
    var allUsers = getUsers();
    // Filter out owner — owner tidak ditampilkan di daftar pengguna
    var users = allUsers.filter(function (u) { return u.role !== 'owner'; });

    if (users.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h3>Belum Ada Pengguna</h3><p>Pengguna yang mendaftar akan muncul di sini.</p></div>';
        return;
    }

    var roleColors = { user: '#FF6B00', talent: '#3B82F6', penjual: '#22C55E', cs: '#8B5CF6' };
    var roleClasses = { user: 'role-user', talent: 'role-talent', penjual: 'role-penjual', cs: 'role-cs' };
    var roleLabels = { user: 'User', talent: 'Talent', penjual: 'Penjual', cs: 'CS' };

    container.innerHTML = users.map(function (u) {
        var displayName = u.name || u.nama || 'Tanpa Nama';
        var displayUsername = u.username || u.no_hp || u.phone || '-';
        var initial = displayName.charAt(0).toUpperCase();
        return '<div class="user-list-item">'
            + '<div class="user-list-avatar" style="background:' + (roleColors[u.role] || '#999') + '">' + initial + '</div>'
            + '<div class="user-list-info">'
            + '<div class="user-list-name">' + escapeHtml(displayName) + ' <small style="color:#999">@' + escapeHtml(displayUsername) + '</small></div>'
            + '<span class="user-list-role ' + (roleClasses[u.role] || '') + '">' + (roleLabels[u.role] || u.role) + '</span>'
            + '</div>'
            + '<button class="btn-delete" data-uid="' + u.id + '" title="Hapus">🗑️</button>'
            + '</div>';
    }).join('');

    container.querySelectorAll('.btn-delete').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var uid = this.dataset.uid;
            var users = getUsers();
            users = users.filter(function (u) { return u.id !== uid; });
            saveUsers(users);
            backendPost({ action: 'delete', id: uid });
            showToast('Pengguna dihapus', 'success');
            renderOwnerStats();
            renderOwnerUsers();
        });
    });
}
window.renderOwnerUsers = renderOwnerUsers;

// ══════════════════════════════════════════
// ═══ OWNER: COMMISSION SETTINGS ═══
// ══════════════════════════════════════════
function loadOwnerCommissionSettings() {
    if (!isBackendConnected()) return;
    FB.get('getSettings')
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                var s = res.data;
                var el = function (id) { return document.getElementById(id); };
                if (el('setPlatformFee') && s.platform_fee) el('setPlatformFee').value = s.platform_fee;
                if (el('setDeliveryFeePerKm') && s.delivery_fee_per_km) el('setDeliveryFeePerKm').value = s.delivery_fee_per_km;
                if (el('setServiceFeePercent') && s.service_fee_percent) el('setServiceFeePercent').value = s.service_fee_percent;
                if (el('setCommTalent') && s.commission_talent_percent) el('setCommTalent').value = s.commission_talent_percent;
                if (el('setCommPenjual') && s.commission_penjual_percent) el('setCommPenjual').value = s.commission_penjual_percent;
                if (el('setMinFee') && s.minimum_fee) el('setMinFee').value = s.minimum_fee;
            }
        }).catch(function () {});
}

function handleCommissionFormSubmit(e) {
    e.preventDefault();
    var el = function (id) { return document.getElementById(id); };
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
        .then(function (res) {
            if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Pengaturan'; }
            if (res && res.success) {
                showToast('Pengaturan komisi disimpan!', 'success');
            } else {
                showToast('Gagal menyimpan pengaturan', 'error');
            }
        });
}

// ══════════════════════════════════════════
// ═══ OWNER: REVENUE ═══
// ══════════════════════════════════════════
function loadOwnerRevenue() {
    if (!isBackendConnected()) return;
    FB.get('getAllOrders')
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (!res.success || !res.data) return;
            var orders = res.data;
            var completed = orders.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; });
            var totalRevenue = completed.reduce(function (sum, o) { return sum + (Number(o.fee) || 0); }, 0);
            var today = new Date(); today.setHours(0, 0, 0, 0);
            var todayRevenue = completed
                .filter(function (o) { return Number(o.completedAt || o.createdAt) >= today.getTime(); })
                .reduce(function (sum, o) { return sum + (Number(o.fee) || 0); }, 0);
            var revEl = document.getElementById('ownerRevenue');
            var todayEl = document.getElementById('ownerTodayRevenue');
            if (revEl) revEl.textContent = 'Rp ' + totalRevenue.toLocaleString('id-ID');
            if (todayEl) todayEl.textContent = 'Rp ' + todayRevenue.toLocaleString('id-ID');
        }).catch(function () {});
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

    list.querySelectorAll('.olp-card').forEach(function (card) {
        card.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx, 10);
            if (orders[idx]) openChat(orders[idx]);
        });
    });
}
