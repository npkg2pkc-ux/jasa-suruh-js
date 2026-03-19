/* ========================================
   JASA SURUH (JS) - Shared Pages Module
   Order Tracking, Chat, Rating, Settings,
   Orders List, Bottom Nav, PWA, Splash
   ======================================== */

// ══════════════════════════════════════════
// ═══ NOTIFICATION SOUNDS ═══
// ══════════════════════════════════════════
var _audioCtx = null;
var _audioUnlocked = false;
var _silentAudio = null;

function _getAudioCtx() {
    if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
}

// Unlock AudioContext on first user interaction (required by iOS Safari)
function _unlockAudio() {
    if (_audioUnlocked) return;
    try {
        var ctx = _getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        // Play silent buffer to unlock
        var buf = ctx.createBuffer(1, 1, 22050);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        if (src.start) src.start(0); else src.noteOn(0);
    } catch (e) {}
    // Also unlock HTML5 Audio for iOS fallback
    try {
        if (!_silentAudio) {
            _silentAudio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwBHAAAAAAD/+xBkAA/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGQeD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==');
            _silentAudio.volume = 0.01;
        }
        _silentAudio.play().then(function () { _silentAudio.pause(); }).catch(function () {});
    } catch (e) {}
    _audioUnlocked = true;
}
document.addEventListener('click', _unlockAudio);
document.addEventListener('touchstart', _unlockAudio);
document.addEventListener('touchend', _unlockAudio);

function playBellSound() {
    try {
        var ctx = _getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        var t = ctx.currentTime;
        [880, 1175].forEach(function (freq, i) {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, t + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.6);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t + i * 0.15);
            osc.stop(t + i * 0.15 + 0.7);
        });
        setTimeout(function () {
            try {
                var t2 = ctx.currentTime;
                [880, 1175].forEach(function (freq, i) {
                    var osc = ctx.createOscillator();
                    var gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0.25, t2 + i * 0.15);
                    gain.gain.exponentialRampToValueAtTime(0.001, t2 + i * 0.15 + 0.6);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(t2 + i * 0.15);
                    osc.stop(t2 + i * 0.15 + 0.7);
                });
            } catch (e) {}
        }, 400);
    } catch (e) {
        // iOS fallback: use vibration
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    }
}
window.playBellSound = playBellSound;

function playMessageSound() {
    try {
        var ctx = _getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        var t = ctx.currentTime;
        var freqs = [660, 880];
        freqs.forEach(function (freq, i) {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.2, t + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t + i * 0.12);
            osc.stop(t + i * 0.12 + 0.35);
        });
    } catch (e) {
        if (navigator.vibrate) navigator.vibrate(100);
    }
}
window.playMessageSound = playMessageSound;

// ══════════════════════════════════════════
// ═══ WALLET HELPERS ═══
// ══════════════════════════════════════════
var _walletUnsub = null;
var _walletBalance = 0;

function formatRupiah(n) {
    return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}
window.formatRupiah = formatRupiah;

function loadUserWallet() {
    var session = getSession();
    if (!session || !isBackendConnected()) return;
    if (session.role === 'cs') return;

    // Unsubscribe previous
    if (_walletUnsub) { _walletUnsub(); _walletUnsub = null; }

    _walletUnsub = FB.onWallet(session.id, function (walletData) {
        _walletBalance = Number(walletData.balance) || 0;
        updateWalletDisplay(_walletBalance);
    });
}
window.loadUserWallet = loadUserWallet;

function updateWalletDisplay(balance) {
    var formatted = formatRupiah(balance);
    // User pay-section
    var balEl = document.querySelector('.pay-section .balance-amount');
    if (balEl) balEl.textContent = formatted;
    // Talent wallet
    var tw = document.getElementById('talentWalletBalance');
    if (tw) tw.textContent = formatted;
    // Penjual wallet
    var pw = document.getElementById('penjualWalletBalance');
    if (pw) pw.textContent = formatted;
    // Owner wallet
    var ow = document.getElementById('ownerWalletBalance');
    if (ow) ow.textContent = formatted;
}

function getWalletBalance() {
    return _walletBalance;
}
window.getWalletBalance = getWalletBalance;

// ── Top Up Modal (Xendit) ──
function openTopUpModal() {
    var existing = document.getElementById('topupModal');
    if (existing) existing.remove();

    var session = getSession();
    if (!session) return;

    var overlay = document.createElement('div');
    overlay.id = 'topupModal';
    overlay.className = 'wallet-modal-overlay';
    overlay.innerHTML = '<div class="wallet-modal">'
        + '<div class="wallet-modal-header"><h3>💰 Top Up Saldo</h3><button class="wallet-modal-close" id="topupClose">&times;</button></div>'
        + '<div class="wallet-modal-body">'
        + '<p class="wallet-modal-balance">Saldo saat ini: <strong>' + formatRupiah(_walletBalance) + '</strong></p>'
        + '<div class="xendit-badge"><span class="xendit-logo">X</span> Pembayaran aman via <strong>Xendit</strong></div>'
        + '<div class="topup-amounts">'
        + '<button class="topup-chip" data-amt="10000">Rp 10.000</button>'
        + '<button class="topup-chip" data-amt="20000">Rp 20.000</button>'
        + '<button class="topup-chip" data-amt="50000">Rp 50.000</button>'
        + '<button class="topup-chip" data-amt="100000">Rp 100.000</button>'
        + '<button class="topup-chip" data-amt="200000">Rp 200.000</button>'
        + '<button class="topup-chip" data-amt="500000">Rp 500.000</button>'
        + '</div>'
        + '<div class="form-group" style="margin-top:12px"><label>Atau masukkan jumlah:</label><div class="input-wrap"><input type="number" id="topupCustomAmount" placeholder="Minimal Rp 10.000" min="10000" step="1000"></div></div>'
        + '<p class="xendit-info">Anda akan diarahkan ke halaman pembayaran Xendit. Saldo otomatis bertambah setelah pembayaran berhasil.</p>'
        + '<button class="btn-primary" id="topupSubmitBtn" style="margin-top:12px">💳 Bayar via Xendit</button>'
        + '</div>'
        + '</div>';

    document.body.appendChild(overlay);

    var selectedAmount = 0;

    overlay.querySelector('#topupClose').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('.topup-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
            overlay.querySelectorAll('.topup-chip').forEach(function (c) { c.classList.remove('active'); });
            chip.classList.add('active');
            selectedAmount = Number(chip.dataset.amt);
            document.getElementById('topupCustomAmount').value = '';
        });
    });

    document.getElementById('topupCustomAmount').addEventListener('input', function () {
        if (this.value) {
            selectedAmount = Number(this.value);
            overlay.querySelectorAll('.topup-chip').forEach(function (c) { c.classList.remove('active'); });
        }
    });

    overlay.querySelector('#topupSubmitBtn').addEventListener('click', function () {
        var custom = document.getElementById('topupCustomAmount').value;
        var amount = custom ? Number(custom) : selectedAmount;
        if (!amount || amount < 10000) {
            showToast('Minimal top up Rp 10.000', 'error');
            return;
        }
        var btn = this;
        btn.disabled = true;
        btn.textContent = '⏳ Membuat Invoice...';

        fetch('/api/xendit/create-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: session.id,
                amount: amount,
                userName: session.name || session.username || ''
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            btn.disabled = false;
            btn.textContent = '💳 Bayar via Xendit';
            if (res && res.success && res.invoiceUrl) {
                showToast('Mengarahkan ke halaman pembayaran...', 'success');
                addNotifItem({ icon: '💳', title: 'Top Up Diproses', desc: 'Top Up ' + formatRupiah(amount) + ' sedang menunggu pembayaran', type: 'topup' });
                overlay.remove();
                window.location.href = res.invoiceUrl;
            } else {
                showToast(res.error || 'Gagal membuat invoice', 'error');
            }
        })
        .catch(function (err) {
            btn.disabled = false;
            btn.textContent = '💳 Bayar via Xendit';
            showToast('Gagal terhubung ke server pembayaran', 'error');
        });
    });
}
window.openTopUpModal = openTopUpModal;

// ── Withdraw Modal (Xendit) ──
var _bankList = [
    { code: 'BCA', name: 'BCA' },
    { code: 'BNI', name: 'BNI' },
    { code: 'BRI', name: 'BRI' },
    { code: 'MANDIRI', name: 'Mandiri' },
    { code: 'BSI', name: 'BSI (Bank Syariah Indonesia)' },
    { code: 'CIMB', name: 'CIMB Niaga' },
    { code: 'PERMATA', name: 'Permata' },
    { code: 'DANAMON', name: 'Danamon' },
    { code: 'BTN', name: 'BTN' },
    { code: 'MUAMALAT', name: 'Muamalat' },
    { code: 'BTPN', name: 'BTPN / Jenius' },
    { code: 'MAYBANK', name: 'Maybank' },
    { code: 'MEGA', name: 'Mega' },
    { code: 'PANIN', name: 'Panin' },
    { code: 'OCBC', name: 'OCBC NISP' }
];

function _getSavedBank() {
    try { return JSON.parse(localStorage.getItem('js_savedBank') || 'null'); } catch (e) { return null; }
}

function openWithdrawModal() {
    var existing = document.getElementById('withdrawModal');
    if (existing) existing.remove();

    var session = getSession();
    if (!session) return;

    var saved = _getSavedBank();
    var bankOptions = _bankList.map(function (b) {
        var sel = (saved && saved.bankCode === b.code) ? ' selected' : '';
        return '<option value="' + b.code + '"' + sel + '>' + b.name + '</option>';
    }).join('');

    var overlay = document.createElement('div');
    overlay.id = 'withdrawModal';
    overlay.className = 'wallet-modal-overlay';
    overlay.innerHTML = '<div class="wallet-modal">'
        + '<div class="wallet-modal-header"><h3>🏧 Tarik Saldo</h3><button class="wallet-modal-close" id="withdrawClose">&times;</button></div>'
        + '<div class="wallet-modal-body">'
        + '<p class="wallet-modal-balance">Saldo saat ini: <strong>' + formatRupiah(_walletBalance) + '</strong></p>'
        + '<div class="xendit-badge"><span class="xendit-logo">X</span> Pencairan via <strong>Xendit</strong></div>'
        + '<div class="form-group"><label>Bank Tujuan</label><div class="input-wrap"><select id="wdBankCode" class="form-select"><option value="">-- Pilih Bank --</option>' + bankOptions + '</select></div></div>'
        + '<div class="form-group"><label>Nomor Rekening</label><div class="input-wrap"><input type="text" id="wdAccountNumber" placeholder="Contoh: 1234567890" value="' + (saved ? saved.accountNumber : '') + '"></div></div>'
        + '<div class="form-group"><label>Nama Pemilik Rekening</label><div class="input-wrap"><input type="text" id="wdAccountName" placeholder="Sesuai buku tabungan" value="' + (saved ? saved.accountName : '') + '"></div></div>'
        + '<label class="wd-save-check"><input type="checkbox" id="wdSaveBank"' + (saved ? ' checked' : '') + '> Simpan data rekening</label>'
        + '<hr style="margin:12px 0;border-color:rgba(0,0,0,0.08)">'
        + '<div class="form-group"><label>Jumlah Penarikan</label><div class="input-wrap"><input type="number" id="withdrawAmount" placeholder="Minimal Rp 10.000" min="10000" step="1000"></div></div>'
        + '<p class="xendit-info">Dana akan ditransfer ke rekening bank Anda. Proses 1-3 hari kerja.</p>'
        + '<button class="btn-primary" id="withdrawSubmitBtn" style="margin-top:12px">🏧 Tarik ke Rekening</button>'
        + '</div>'
        + '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#withdrawClose').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#withdrawSubmitBtn').addEventListener('click', function () {
        var bankCode = document.getElementById('wdBankCode').value;
        var accountNumber = document.getElementById('wdAccountNumber').value.trim();
        var accountName = document.getElementById('wdAccountName').value.trim();
        var amount = Number(document.getElementById('withdrawAmount').value);

        if (!bankCode) { showToast('Pilih bank tujuan', 'error'); return; }
        if (!accountNumber) { showToast('Masukkan nomor rekening', 'error'); return; }
        if (!accountName) { showToast('Masukkan nama pemilik rekening', 'error'); return; }
        if (!amount || amount < 10000) { showToast('Minimal penarikan Rp 10.000', 'error'); return; }
        if (amount > _walletBalance) { showToast('Saldo tidak cukup!', 'error'); return; }

        // Save bank details if checked
        if (document.getElementById('wdSaveBank').checked) {
            localStorage.setItem('js_savedBank', JSON.stringify({ bankCode: bankCode, accountNumber: accountNumber, accountName: accountName }));
        } else {
            localStorage.removeItem('js_savedBank');
        }

        var btn = this;
        btn.disabled = true;
        btn.textContent = '⏳ Memproses...';

        fetch('/api/xendit/withdraw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: session.id,
                amount: amount,
                bankCode: bankCode,
                accountNumber: accountNumber,
                accountName: accountName
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            btn.disabled = false;
            btn.textContent = '🏧 Tarik ke Rekening';
            if (res && res.success) {
                showToast('Penarikan ' + formatRupiah(amount) + ' sedang diproses! 🏧', 'success');
                addNotifItem({ icon: '🏧', title: 'Penarikan Diproses', desc: 'Penarikan ' + formatRupiah(amount) + ' ke ' + bankCode + ' sedang diproses', type: 'withdraw' });
                overlay.remove();
            } else {
                showToast(res.error || 'Gagal menarik saldo', 'error');
            }
        })
        .catch(function (err) {
            btn.disabled = false;
            btn.textContent = '🏧 Tarik ke Rekening';
            showToast('Gagal terhubung ke server', 'error');
        });
    });
}
window.openWithdrawModal = openWithdrawModal;

// ── Transaction History Page ──
function openTransactionHistory() {
    var session = getSession();
    if (!session) return;

    var existing = document.getElementById('txHistoryPage');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'txHistoryPage';
    page.className = 'fullpage-overlay';
    page.innerHTML = '<div class="fullpage-header"><button class="btn-back" id="txHistBack">←</button><h3>Riwayat Transaksi</h3></div>'
        + '<div class="fullpage-body" id="txHistList"><div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat...</p></div></div>';

    document.body.appendChild(page);

    page.querySelector('#txHistBack').addEventListener('click', function () { page.remove(); });

    FB.get('getTransactions', { userId: session.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            var list = document.getElementById('txHistList');
            if (!list) return;
            if (!res.success || !res.data || res.data.length === 0) {
                list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📭</div><p>Belum ada transaksi</p></div>';
                return;
            }
            var txs = res.data;
            var typeLabels = { topup: '💰 Top Up', payment: '🛒 Pembayaran', earning: '💵 Pendapatan', commission: '📊 Komisi', withdraw: '🏧 Penarikan' };
            var typeColors = { topup: '#22C55E', payment: '#EF4444', earning: '#22C55E', commission: '#FF6B00', withdraw: '#EF4444' };
            var statusBadges = { pending: '<span class="tx-status tx-pending">Menunggu</span>', processing: '<span class="tx-status tx-processing">Diproses</span>', expired: '<span class="tx-status tx-expired">Expired</span>', refunded: '<span class="tx-status tx-refunded">Refund</span>' };

            list.innerHTML = txs.map(function (tx) {
                var label = typeLabels[tx.type] || tx.type;
                var color = typeColors[tx.type] || '#666';
                var amountStr = tx.amount >= 0 ? '+' + formatRupiah(tx.amount) : '-' + formatRupiah(Math.abs(tx.amount));
                var date = new Date(Number(tx.createdAt)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                var badge = (tx.status && statusBadges[tx.status]) ? ' ' + statusBadges[tx.status] : '';
                return '<div class="tx-item">'
                    + '<div class="tx-item-left"><span class="tx-item-label">' + label + badge + '</span><span class="tx-item-desc">' + (tx.description || '') + '</span><span class="tx-item-date">' + date + '</span></div>'
                    + '<div class="tx-item-amount" style="color:' + color + '">' + amountStr + '</div>'
                    + '</div>';
            }).join('');
        });
}
window.openTransactionHistory = openTransactionHistory;

// ── Xendit Payment Redirect Handler ──
(function () {
    var params = new URLSearchParams(window.location.search);
    var xenditStatus = params.get('xendit');
    if (xenditStatus) {
        window.history.replaceState({}, '', window.location.pathname);
        setTimeout(function () {
            if (xenditStatus === 'success') {
                if (typeof showToast === 'function') showToast('Pembayaran berhasil! Saldo akan segera diperbarui ✅', 'success');
                addNotifItem({ icon: '✅', title: 'Top Up Berhasil', desc: 'Pembayaran berhasil! Saldo akan segera diperbarui.', type: 'topup' });
            } else if (xenditStatus === 'failed') {
                if (typeof showToast === 'function') showToast('Pembayaran dibatalkan atau gagal ❌', 'error');
                addNotifItem({ icon: '❌', title: 'Top Up Gagal', desc: 'Pembayaran dibatalkan atau gagal.', type: 'topup' });
            }
        }, 1500);
    }
})();

// ══════════════════════════════════════════
// ═══ CHAT BADGE (unread messages) ═══
// ══════════════════════════════════════════
var _unreadChatCount = 0;
var _globalMsgUnsub = null;
var _lastKnownMsgCounts = {};
var _chatPageOpen = false;
var _msgPollTimer = null;

function updateChatBadges() {
    // Update bottom nav chat badges
    document.querySelectorAll('.bottom-nav .nav-item[data-page="chat"]').forEach(function (btn) {
        var badge = btn.querySelector('.chat-badge');
        if (_unreadChatCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'chat-badge';
                btn.style.position = 'relative';
                btn.appendChild(badge);
            }
            badge.textContent = _unreadChatCount > 9 ? '9+' : _unreadChatCount;
            badge.style.display = '';
        } else {
            if (badge) badge.style.display = 'none';
        }
    });
    // Update floating chat FAB badge on order tracking page
    var fab = document.getElementById('otpChatFab');
    if (fab) {
        var fabBadge = fab.querySelector('.chat-fab-badge');
        if (_unreadChatCount > 0) {
            if (!fabBadge) {
                fabBadge = document.createElement('span');
                fabBadge.className = 'chat-fab-badge';
                fab.appendChild(fabBadge);
            }
            fabBadge.textContent = _unreadChatCount > 9 ? '9+' : _unreadChatCount;
            fabBadge.style.display = '';
            fab.classList.add('chat-fab-pulse');
            setTimeout(function () { fab.classList.remove('chat-fab-pulse'); }, 1000);
        } else {
            if (fabBadge) fabBadge.style.display = 'none';
        }
    }
}
window.updateChatBadges = updateChatBadges;

// ── Polling-based message checker (replaces realtime subscription) ──
function startGlobalMessageListener() {
    var session = getSession();
    if (!session || !isBackendConnected()) return;
    // Clean up any previous listeners
    if (_globalMsgUnsub) { _globalMsgUnsub(); _globalMsgUnsub = null; }
    if (_msgPollTimer) { clearInterval(_msgPollTimer); _msgPollTimer = null; }

    // Do initial check then poll every 8 seconds
    _pollNewMessages(session);
    _msgPollTimer = setInterval(function () { _pollNewMessages(session); }, 8000);

    _globalMsgUnsub = function () {
        if (_msgPollTimer) { clearInterval(_msgPollTimer); _msgPollTimer = null; }
    };
}
window.startGlobalMessageListener = startGlobalMessageListener;

function _pollNewMessages(session) {
    if (!isBackendConnected()) return;
    FB.get('getOrdersByUser', { userId: session.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (!res.success || !res.data) return;
            var activeOrders = res.data.filter(function (o) {
                return ['pending', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'searching'].indexOf(o.status) >= 0;
            });
            activeOrders.forEach(function (order) {
                _checkOrderMessages(order, session);
            });
        })
        .catch(function () {});
}

function _checkOrderMessages(order, session) {
    FB.get('getMessages', { orderId: order.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (!res.success || !res.data) return;
            var msgs = res.data;
            var prevCount = _lastKnownMsgCounts[order.id] || 0;
            var currentCount = msgs.length;

            if (prevCount > 0 && currentCount > prevCount) {
                // Find new messages not from self
                var newMsgs = msgs.slice(prevCount);
                var fromOthers = newMsgs.filter(function (m) {
                    return String(m.senderId) !== String(session.id);
                });
                if (fromOthers.length > 0 && !_chatPageOpen) {
                    _unreadChatCount += fromOthers.length;
                    updateChatBadges();
                    playMessageSound();
                    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

                    var lastMsg = fromOthers[fromOthers.length - 1];
                    var senderName = lastMsg.senderName || 'Seseorang';
                    addNotifItem({
                        icon: '💬',
                        title: 'Pesan dari ' + senderName,
                        desc: lastMsg.text || '📷 Foto',
                        type: 'chat',
                        orderId: order.id
                    });
                }
            }
            _lastKnownMsgCounts[order.id] = currentCount;
        })
        .catch(function () {});
}

function clearChatBadge() {
    _unreadChatCount = 0;
    updateChatBadges();
}
window.clearChatBadge = clearChatBadge;

// ══════════════════════════════════════════
// ═══ NOTIFICATION POPUP (DB-backed) ═══
// ══════════════════════════════════════════
var _notifItems = [];
var _notifUnsub = null;
var _notifPollTimer = null;

var _prevUnreadCount = 0;
function initNotifications() {
    var session = getSession();
    if (!session || !isBackendConnected()) return;
    if (_notifUnsub) { _notifUnsub(); _notifUnsub = null; }
    if (_notifPollTimer) { clearInterval(_notifPollTimer); _notifPollTimer = null; }
    _prevUnreadCount = 0;

    // Try realtime first, fall back to polling
    _notifUnsub = FB.onNotifications(session.id, function (items) {
        _onNotifUpdate(items);
    });

    // Also poll every 12s as backup to ensure we always get updates
    _notifPollTimer = setInterval(function () {
        FB.get('getNotifications', { userId: session.id })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) _onNotifUpdate(res.data);
            })
            .catch(function () {});
    }, 12000);
}
window.initNotifications = initNotifications;

function _onNotifUpdate(items) {
    _notifItems = items || [];
    var newUnread = _notifItems.filter(function (n) { return n.unread; }).length;
    // Play sound when new unread notifications arrive
    if (newUnread > _prevUnreadCount) {
        playBellSound();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
    _prevUnreadCount = newUnread;
    updateNotifBadges();
    // Re-render if popup is open
    var popup = document.getElementById('notifPopup');
    if (popup && !popup.classList.contains('hidden')) renderNotifItems();
}

function openNotifPopup() {
    var popup = document.getElementById('notifPopup');
    if (!popup) return;
    popup.classList.remove('hidden');
    renderNotifItems();

    if (!popup._eventsSetup) {
        popup._eventsSetup = true;
        document.getElementById('notifPopupClose').addEventListener('click', function () { popup.classList.add('hidden'); });
        document.getElementById('notifPopupOverlay').addEventListener('click', function () { popup.classList.add('hidden'); });
        var markAllBtn = document.getElementById('notifMarkAllRead');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', function () {
                var session = getSession();
                if (!session) return;
                backendPost({ action: 'markAllNotifsRead', userId: session.id }).then(function () {
                    _notifItems.forEach(function (n) { n.unread = false; });
                    updateNotifBadges();
                    renderNotifItems();
                });
            });
        }
    }
}
window.openNotifPopup = openNotifPopup;

function addNotifItem(item) {
    // Save to DB
    var session = getSession();
    if (!session || !isBackendConnected()) return;
    backendPost({
        action: 'addNotification',
        userId: item.userId || session.id,
        icon: item.icon || '🔔',
        title: item.title || '',
        desc: item.desc || '',
        type: item.type || 'info',
        orderId: item.orderId || '',
        extra: item.extra || null
    });
}
window.addNotifItem = addNotifItem;

function updateNotifBadges() {
    var count = _notifItems.filter(function (n) { return n.unread; }).length;
    ['userHeaderBadge', 'talentHeaderBadge', 'penjualHeaderBadge', 'ownerHeaderBadge', 'csHeaderBadge'].forEach(function (id) {
        var badge = document.getElementById(id);
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 9 ? '9+' : count;
                badge.style.display = 'flex';
            } else {
                badge.textContent = '0';
                badge.style.display = 'none';
            }
        }
    });
}

function _escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
}

function renderNotifItems() {
    var body = document.getElementById('notifPopupBody');
    if (!body) return;
    if (_notifItems.length === 0) {
        body.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon">🔕</div><p>Belum ada notifikasi</p></div>';
        return;
    }
    var html = '';
    _notifItems.forEach(function (n, i) {
        html += '<div class="notif-item' + (n.unread ? ' unread' : '') + '" data-idx="' + i + '" data-id="' + _escapeHtml(n.id) + '">';
        html += '<div class="notif-item-icon">' + _escapeHtml(n.icon || '🔔') + '</div>';
        html += '<div class="notif-item-body">';
        html += '<div class="notif-item-title">' + _escapeHtml(n.title || '') + '</div>';
        html += '<div class="notif-item-desc">' + _escapeHtml(n.desc || '') + '</div>';
        var t = n.createdAt ? _timeAgo(n.createdAt) : '';
        if (t) html += '<div class="notif-item-time">' + t + '</div>';
        html += '</div></div>';
    });
    body.innerHTML = html;
    body.querySelectorAll('.notif-item').forEach(function (el) {
        el.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx);
            var nId = this.dataset.id;
            var item = _notifItems[idx];
            if (item && item.unread) {
                item.unread = false;
                backendPost({ action: 'markNotifRead', notifId: nId });
                updateNotifBadges();
            }
            document.getElementById('notifPopup').classList.add('hidden');
        });
    });
}

function _timeAgo(ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return 'Baru saja';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' menit lalu';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' jam lalu';
    return Math.floor(diff / 86400000) + ' hari lalu';
}

// ══════════════════════════════════════════
// ═══ ORDER TRACKING PAGE ═══
// ══════════════════════════════════════════
function openOrderTracking(order) {
    _currentOrder = order;
    var page = document.getElementById('orderTrackingPage');
    if (!page) return;

    var session = getSession();
    var isTalent = session && session.id === order.talentId;
    var isUser = session && session.id === order.userId;

    document.getElementById('otpTitle').textContent = order.serviceType || 'Pesanan';
    updateOrderStatusBadge(order.status);
    renderOrderInfo(order, isTalent);
    renderOrderActions(order, isTalent, isUser);
    initTrackingMap(order);

    page.classList.remove('hidden');

    if (!page._eventsSetup) {
        page._eventsSetup = true;
        document.getElementById('otpBtnBack').addEventListener('click', function () {
            // If still searching, cancel the search (no payment was made)
            if (_currentOrder && _currentOrder.status === 'searching') {
                if (typeof cancelDriverSearch === 'function') cancelDriverSearch();
                backendPost({ action: 'updateOrder', orderId: _currentOrder.id, fields: { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: 'user' } });
            }
            page.classList.add('hidden');
            stopPolling();
        });
        document.getElementById('otpChatFab').addEventListener('click', function () {
            if (_currentOrder) openChat(_currentOrder);
        });
    }

    startOrderPolling(order.id);
}

function updateOrderStatusBadge(status) {
    var badge = document.getElementById('otpStatus');
    if (!badge) return;
    var isAntar = _currentOrder && _currentOrder.skillType === 'js_antar';
    var TRACKING_STATUS = isAntar ? {
        searching: 'Mencari Driver...',
        pending: 'Menunggu Konfirmasi',
        accepted: 'Driver Ditemukan',
        on_the_way: 'Driver Menuju Lokasi',
        arrived: 'Driver Tiba',
        in_progress: 'Dalam Perjalanan',
        completed: 'Sampai Tujuan',
        rated: 'Sudah Dinilai',
        cancelled: 'Dibatalkan',
        rejected: 'Ditolak'
    } : {
        searching: 'Mencari Driver...',
        pending: 'Menunggu Konfirmasi',
        accepted: 'Diterima',
        on_the_way: 'Dalam Perjalanan',
        arrived: 'Sudah Tiba',
        in_progress: 'Sedang Dikerjakan',
        completed: 'Selesai',
        rated: 'Sudah Dinilai',
        cancelled: 'Dibatalkan',
        rejected: 'Ditolak'
    };
    badge.textContent = TRACKING_STATUS[status] || status;
    badge.className = 'otp-status-badge status-' + status;
}

function renderOrderInfo(order, isTalent) {
    var el = document.getElementById('otpInfoContent');
    if (!el) return;
    var users = getUsers();
    var other = users.find(function (u) {
        return u.id === (isTalent ? order.userId : order.talentId);
    });
    var otherName = other ? other.name : 'Mencari...';
    var priceText = order.price ? formatRupiah(Number(order.price)) : '-';
    var feeText = order.fee ? formatRupiah(Number(order.fee)) : '-';
    var totalText = order.totalCost ? formatRupiah(Number(order.totalCost)) : '-';
    var addrText = order.userAddr || 'Tidak tersedia';
    var isAntar = order.skillType === 'js_antar';
    var pmLabel = order.paymentMethod === 'cod' ? '💵 Tunai (COD)' : '💳 JsPay';

    // Driver/customer photo
    var photoHtml = '';
    if (!isTalent && other && order.talentId) {
        var photoSrc = other.photo || getProfilePhoto(other.id) || '';
        // Also check talent skill selfie
        if (!photoSrc) {
            var tSkills = getUserSkills(other.id);
            if (tSkills && tSkills.length > 0) {
                for (var si = 0; si < tSkills.length; si++) {
                    if (tSkills[si].selfieThumb) { photoSrc = tSkills[si].selfieThumb; break; }
                }
            }
        }
        var initial = (other.name || '?').charAt(0).toUpperCase();
        var vehicleLabel = isAntar ? '🏍️ JS Antar Motor' : ('🔧 ' + (order.serviceType || 'Talent'));
        photoHtml = '<div class="otp-driver-card">'
            + '<div class="otp-driver-avatar">' + (photoSrc ? '<img src="' + photoSrc + '" alt="">' : '<span>' + escapeHtml(initial) + '</span>') + '</div>'
            + '<div class="otp-driver-info">'
            + '<div class="otp-driver-name">' + escapeHtml(other.name || 'Driver') + '</div>'
            + '<div class="otp-driver-vehicle">' + vehicleLabel + '</div>'
            + '</div>'
            + '</div>';
    }

    el.innerHTML = photoHtml
        + (isTalent ? '<div class="otp-info-row"><span class="otp-info-label">Pelanggan</span><span class="otp-info-val">' + escapeHtml(otherName) + '</span></div>' : '')
        + '<div class="otp-info-row"><span class="otp-info-label">Layanan</span><span class="otp-info-val">' + escapeHtml(order.serviceType || '') + '</span></div>'
        + (isAntar ? '<div class="otp-info-row"><span class="otp-info-label">📍 Jemput</span><span class="otp-info-val">' + escapeHtml(addrText) + '</span></div>' : '<div class="otp-info-row"><span class="otp-info-label">Alamat</span><span class="otp-info-val">' + escapeHtml(addrText) + '</span></div>')
        + (isAntar && order.destAddr ? '<div class="otp-info-row"><span class="otp-info-label">🏁 Tujuan</span><span class="otp-info-val">' + escapeHtml(String(order.destAddr)) + '</span></div>' : '')
        + (isAntar && order.distanceKm ? '<div class="otp-info-row"><span class="otp-info-label">Jarak</span><span class="otp-info-val">' + Number(order.distanceKm).toFixed(1) + ' km</span></div>' : '')
        + '<div class="otp-info-row"><span class="otp-info-label">' + (isAntar ? 'Ongkos' : 'Harga') + '</span><span class="otp-info-val">' + priceText + '</span></div>'
        + '<div class="otp-info-row"><span class="otp-info-label">Biaya layanan</span><span class="otp-info-val">' + feeText + '</span></div>'
        + '<div class="otp-info-row otp-info-total"><span class="otp-info-label">Total Bayar</span><span class="otp-info-val">' + totalText + '</span></div>'
        + '<div class="otp-info-row"><span class="otp-info-label">Pembayaran</span><span class="otp-info-val">' + pmLabel + '</span></div>'
        + (order.proofPhoto ? '<div class="otp-proof"><img src="' + order.proofPhoto + '" alt="Bukti"></div>' : '');
}

function renderOrderActions(order, isTalent, isUser) {
    var el = document.getElementById('otpActions');
    if (!el) return;
    el.innerHTML = '';
    var isAntar = order.skillType === 'js_antar';

    // ── USER: Cancel button on searching / pending ──
    if (isUser && (order.status === 'searching' || order.status === 'pending')) {
        var cancelHtml = '<button class="otp-btn otp-btn-cancel" id="otpBtnCancel">❌ Batalkan Pesanan</button>';
        if (order.status === 'searching') {
            cancelHtml = '<div class="searching-driver-anim"><div class="searching-spinner"></div><p>Mencari driver terdekat...</p></div>' + cancelHtml;
        }
        el.innerHTML = cancelHtml;
        document.getElementById('otpBtnCancel').addEventListener('click', function () {
            if (!confirm('Yakin ingin membatalkan pesanan ini?')) return;
            if (typeof cancelDriverSearch === 'function') cancelDriverSearch();
            backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: 'user' } }).then(function (res) {
                if (res && res.success) {
                    if (_currentOrder) _currentOrder.status = 'cancelled';
                    updateOrderStatusBadge('cancelled');
                    renderOrderActions(order, false, true);
                    showToast('Pesanan dibatalkan', 'success');
                    addNotifItem({ icon: '❌', title: 'Pesanan Dibatalkan', desc: (order.serviceType || 'Pesanan') + ' - dibatalkan oleh Anda', type: 'order', orderId: order.id });
                    // Notify talent if assigned
                    if (order.talentId) {
                        addNotifItem({ userId: order.talentId, icon: '❌', title: 'Pesanan Dibatalkan', desc: 'User membatalkan pesanan ' + (order.serviceType || ''), type: 'order', orderId: order.id });
                    }
                }
            });
        });
        return;
    }

    // ── TALENT: Accept/Reject on pending ──
    if (isTalent) {
        if (order.status === 'pending') {
            el.innerHTML = '<div class="otp-btn-row"><button class="otp-btn otp-btn-accept" id="otpBtnAccept">✅ Terima Pesanan</button><button class="otp-btn otp-btn-reject" id="otpBtnReject">❌ Tolak</button></div>';
            document.getElementById('otpBtnAccept').addEventListener('click', function () {
                var btn = this;
                btn.disabled = true;
                btn.textContent = '⏳ Memproses...';
                var totalCost = Number(order.totalCost) || ((Number(order.price) || 0) + (Number(order.fee) || 0));
                var pm = order.paymentMethod || 'jspay';

                if (pm === 'cod') {
                    // COD: No wallet deduction from user. Accept directly.
                    updateOrderStatus(order.id, 'accepted', { acceptedAt: Date.now(), paidAmount: 0 });
                    addNotifItem({ userId: order.userId, icon: '✅', title: 'Driver Ditemukan!', desc: 'Pembayaran COD - siapkan uang tunai ' + formatRupiah(totalCost), type: 'order', orderId: order.id });
                } else {
                    // JSpay: Deduct user wallet NOW (on accept)
                    backendPost({
                        action: 'walletPay',
                        userId: order.userId,
                        amount: totalCost,
                        orderId: order.id,
                        description: 'Pembayaran ' + (order.serviceType || 'Pesanan')
                    }).then(function (payRes) {
                        if (!payRes || !payRes.success) {
                            btn.disabled = false;
                            btn.textContent = '✅ Terima Pesanan';
                            showToast('Saldo user tidak cukup!', 'error');
                            addNotifItem({ userId: order.userId, icon: '⚠️', title: 'Saldo Tidak Cukup', desc: 'Saldo Anda tidak cukup untuk pesanan ' + (order.serviceType || '') + '. Top up ' + formatRupiah(totalCost), type: 'order', orderId: order.id });
                            return;
                        }
                        updateOrderStatus(order.id, 'accepted', { acceptedAt: Date.now(), paidAmount: totalCost });
                        addNotifItem({ userId: order.userId, icon: '💳', title: 'Saldo Dipotong', desc: formatRupiah(totalCost) + ' untuk pesanan ' + (order.serviceType || ''), type: 'payment', orderId: order.id });
                    });
                }
            });
            document.getElementById('otpBtnReject').addEventListener('click', function () {
                if (!confirm('Tolak pesanan ini?')) return;
                backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'rejected', talentId: '', rejectedAt: Date.now(), rejectedBy: getSession().id } }).then(function (res) {
                    if (res && res.success) {
                        showToast('Pesanan ditolak', 'success');
                        if (_currentOrder) _currentOrder.status = 'rejected';
                        updateOrderStatusBadge('rejected');
                        renderOrderActions(order, true, false);
                        // Notify user
                        addNotifItem({ userId: order.userId, icon: '❌', title: 'Driver Menolak', desc: 'Sedang mencari driver lain...', type: 'order', orderId: order.id });
                        // Re-search for another driver (via user-side function not available here, use backend update)
                        // The order goes back to searching with excluded talent
                        var excluded = order.excludedTalents || [];
                        excluded.push(getSession().id);
                        backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'searching', talentId: '', excludedTalents: excluded } });
                    }
                });
            });
        } else if (order.status === 'accepted') {
            var otwLabel = isAntar ? '🏍️ Menuju Lokasi Jemput' : '🏍️ Menuju Lokasi';
            el.innerHTML = '<button class="otp-btn otp-btn-otw" id="otpBtnOtw">' + otwLabel + '</button>';
            document.getElementById('otpBtnOtw').addEventListener('click', function () { updateOrderStatus(order.id, 'on_the_way', {}); startTalentLocationBroadcast(order.id); });
        } else if (order.status === 'on_the_way') {
            var arriveLabel = isAntar ? '📍 Sudah di Lokasi Jemput' : '📍 Sudah Tiba';
            el.innerHTML = '<button class="otp-btn otp-btn-arrive" id="otpBtnArrive">' + arriveLabel + '</button>';
            document.getElementById('otpBtnArrive').addEventListener('click', function () { updateOrderStatus(order.id, 'arrived', {}); });
        } else if (order.status === 'arrived') {
            var startLabel = isAntar ? '🚀 Mulai Perjalanan' : '🔨 Mulai Mengerjakan';
            el.innerHTML = '<button class="otp-btn otp-btn-start" id="otpBtnStart">' + startLabel + '</button>';
            document.getElementById('otpBtnStart').addEventListener('click', function () { updateOrderStatus(order.id, 'in_progress', { startedAt: Date.now() }); });
        } else if (order.status === 'in_progress') {
            var completeLabel = isAntar ? '🏁 Sampai Tujuan' : '✅ Selesai + Upload Bukti';
            el.innerHTML = '<button class="otp-btn otp-btn-complete" id="otpBtnComplete">' + completeLabel + '</button>' + (isAntar ? '' : '<input type="file" id="otpProofInput" accept="image/*" capture="environment" style="display:none">');
            if (isAntar) {
                // JS Antar: no photo proof needed, just mark complete
                document.getElementById('otpBtnComplete').addEventListener('click', function () {
                    if (!confirm('Konfirmasi penumpang sudah sampai tujuan?')) return;
                    updateOrderStatus(order.id, 'completed', { completedAt: Date.now() });
                });
            } else {
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
    }

    if (isUser && order.status === 'completed') {
        el.innerHTML = '<button class="otp-btn otp-btn-rate" id="otpBtnRate">⭐ Beri Rating</button>';
        document.getElementById('otpBtnRate').addEventListener('click', function () { openRatingPage(order); });
    }

    // ── Show status messages for cancelled/rejected ──
    if (order.status === 'cancelled') {
        el.innerHTML = '<div class="otp-status-msg cancelled">❌ Pesanan ini telah dibatalkan</div>';
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

            // Create notifications for order status change
            if (_currentOrder) {
                var isAntarOrder = _currentOrder.skillType === 'js_antar';
                var statusLabels = isAntarOrder
                    ? { accepted: 'Driver Ditemukan', on_the_way: 'Driver Menuju Lokasi', arrived: 'Driver Tiba', in_progress: 'Dalam Perjalanan', completed: 'Sampai Tujuan' }
                    : { accepted: 'Diterima', on_the_way: 'Dalam Perjalanan', arrived: 'Talent Tiba', in_progress: 'Dikerjakan', completed: 'Selesai' };
                var label = statusLabels[newStatus] || newStatus;
                var svc = _currentOrder.serviceType || _currentOrder.skillType || 'Pesanan';
                // Notify the other party
                var session = getSession();
                if (session) {
                    var otherUserId = (session.id === _currentOrder.talentId) ? _currentOrder.userId : _currentOrder.talentId;
                    if (otherUserId) {
                        addNotifItem({ userId: otherUserId, icon: '📦', title: 'Pesanan ' + label, desc: svc + ' - status diperbarui ke ' + label, type: 'order', orderId: _currentOrder.id });
                    }
                    // Also notify self
                    addNotifItem({ icon: '📦', title: 'Pesanan ' + label, desc: svc + ' - status diperbarui ke ' + label, type: 'order', orderId: _currentOrder.id });
                }
            }

            // When order is completed, distribute funds to talent/penjual + owner commission
            if (newStatus === 'completed' && _currentOrder) {
                var order = _currentOrder;
                var pm = order.paymentMethod || 'jspay';
                // Get commission settings to calculate proper rates
                FB.get('getSettings')
                    .then(function (r) { return r.json(); })
                    .then(function (settingsRes) {
                        var commPercent = 10; // default
                        if (settingsRes.success && settingsRes.data) {
                            var s = settingsRes.data;
                            if (order.skillType === 'js_food') {
                                commPercent = Number(s.commission_penjual_percent) || 10;
                            } else {
                                commPercent = Number(s.commission_talent_percent) || 15;
                            }
                        }
                        if (pm === 'cod') {
                            // COD: Talent received cash from user.
                            // Deduct platform cut (fee + commission) from talent's wallet
                            backendPost({
                                action: 'walletCompleteOrderCOD',
                                orderId: order.id,
                                talentId: order.talentId,
                                price: order.price,
                                fee: order.fee,
                                totalCost: order.totalCost,
                                commissionPercent: commPercent,
                                serviceType: order.serviceType || order.skillType || ''
                            });
                        } else {
                            // JSpay: Standard flow — distribute from platform to talent + owner
                            backendPost({
                                action: 'walletCompleteOrder',
                                orderId: order.id,
                                talentId: order.talentId,
                                price: order.price,
                                fee: order.fee,
                                commissionPercent: commPercent,
                                serviceType: order.serviceType || order.skillType || ''
                            });
                        }
                    });
            }
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

    if (_otpMap) { _otpMap.remove(); _otpMap = null; }

    var userLat = Number(order.userLat) || -6.2;
    var userLng = Number(order.userLng) || 106.8;
    var talentLat = Number(order.talentLat) || userLat;
    var talentLng = Number(order.talentLng) || userLng;
    var isAntar = order.skillType === 'js_antar';
    var destLat = isAntar && order.destLat ? Number(order.destLat) : null;
    var destLng = isAntar && order.destLng ? Number(order.destLng) : null;

    var centerLat = (userLat + talentLat) / 2;
    var centerLng = (userLng + talentLng) / 2;

    _otpMap = L.map(container, { zoomControl: false }).setView([centerLat, centerLng], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 20,
        subdomains: 'abcd'
    }).addTo(_otpMap);
    L.control.zoom({ position: 'bottomright' }).addTo(_otpMap);

    var userIcon = L.divIcon({
        html: '<div class="gm-pin gm-pin-green"><div class="gm-pin-head">' + (isAntar ? '📍' : '📍') + '</div><div class="gm-pin-tail"></div></div>',
        iconSize: [36, 46],
        iconAnchor: [18, 46],
        popupAnchor: [0, -46],
        className: 'gm-pin-wrapper'
    });
    _otpUserMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(_otpMap).bindPopup(isAntar ? 'Titik Jemput' : 'Lokasi Anda');

    var talentIcon = L.divIcon({
        html: '<div class="gm-pin gm-pin-orange"><div class="gm-pin-head">🏍️</div><div class="gm-pin-tail"></div></div>',
        iconSize: [36, 46],
        iconAnchor: [18, 46],
        popupAnchor: [0, -46],
        className: 'gm-pin-wrapper'
    });
    _otpTalentMarker = L.marker([talentLat, talentLng], { icon: talentIcon }).addTo(_otpMap).bindPopup('Driver');

    var points = [[userLat, userLng], [talentLat, talentLng]];
    if (isAntar && destLat && destLng) {
        var destIcon = L.divIcon({
            html: '<div class="gm-pin gm-pin-red"><div class="gm-pin-head">🏁</div><div class="gm-pin-tail"></div></div>',
            iconSize: [36, 46],
            iconAnchor: [18, 46],
            popupAnchor: [0, -46],
            className: 'gm-pin-wrapper'
        });
        L.marker([destLat, destLng], { icon: destIcon }).addTo(_otpMap).bindPopup('Tujuan: ' + escapeHtml(String(order.destAddr || '')));
        points.push([destLat, destLng]);
    }

    var bounds = L.latLngBounds(points);
    _otpMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });

    fetchAndDrawRoute(talentLat, talentLng, userLat, userLng);

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
                    return [c[1], c[0]];
                });
                if (_otpRouteLine) _otpMap.removeLayer(_otpRouteLine);
                _otpRouteLine = L.polyline(coords, { color: '#4285F4', weight: 5, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }).addTo(_otpMap);
            }
        })
        .catch(function () {
            if (_otpRouteLine) _otpMap.removeLayer(_otpRouteLine);
            _otpRouteLine = L.polyline([[fromLat, fromLng], [toLat, toLng]], { color: '#4285F4', weight: 4, dashArray: '8,12', opacity: 0.6, lineJoin: 'round', lineCap: 'round' }).addTo(_otpMap);
        });
}

function updateTalentMarkerPosition(lat, lng) {
    if (_otpTalentMarker) {
        _otpTalentMarker.setLatLng([lat, lng]);
    }
    if (_currentOrder) {
        fetchAndDrawRoute(lat, lng, Number(_currentOrder.userLat), Number(_currentOrder.userLng));
    }
}

// ══════════════════════════════════════════
// ═══ POLLING (Order status + Location) ═══
// ══════════════════════════════════════════
function startOrderPolling(orderId) {
    stopPolling();
    var session = getSession();
    if (typeof FB !== 'undefined' && FB.isReady()) {
        _fbOrderUnsub = FB.onOrder(orderId, function (order) {
            if (!order || !_currentOrder || _currentOrder.id !== orderId) return;
            var oldStatus = _currentOrder.status;
            for (var key in order) { _currentOrder[key] = order[key]; }
            if (oldStatus !== order.status) {
                updateOrderStatusBadge(order.status);
                var session = getSession();
                var isTalent = session && session.id === _currentOrder.talentId;
                var isUser = session && session.id === _currentOrder.userId;
                renderOrderActions(_currentOrder, isTalent, isUser);
                renderOrderInfo(_currentOrder, isTalent);

                // If order went back to 'searching' (talent rejected), re-search from user side
                if (isUser && order.status === 'searching' && typeof searchNearbyDriver === 'function') {
                    searchNearbyDriver(_currentOrder);
                }
            }
        });
        _fbLocUnsub = FB.onTalentLocation(orderId, function (loc) {
            if (loc && loc.lat && loc.lng) {
                updateTalentMarkerPosition(Number(loc.lat), Number(loc.lng));
            }
            if (loc && _currentOrder) {
                _currentOrder.talentLat = loc.lat;
                _currentOrder.talentLng = loc.lng;
            }
        });
        // Chat badge is handled by global message polling in startGlobalMessageListener
    } else {
        pollOrderUpdate(orderId);
        _locationPollTimer = setInterval(function () { pollOrderUpdate(orderId); }, 8000);
    }
}

function stopPolling() {
    if (_locationPollTimer) { clearInterval(_locationPollTimer); _locationPollTimer = null; }
    if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
    if (_fbOrderUnsub) { _fbOrderUnsub(); _fbOrderUnsub = null; }
    if (_fbLocUnsub) { _fbLocUnsub(); _fbLocUnsub = null; }
}

function pollOrderUpdate(orderId) {
    if (!isBackendConnected()) return;
    FB.get('getOrdersByUser', { userId: getSession().id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                var order = res.data.find(function (o) { return o.id === orderId; });
                if (order && _currentOrder && _currentOrder.id === orderId) {
                    var oldStatus = _currentOrder.status;
                    for (var key in order) _currentOrder[key] = order[key];

                    if (oldStatus !== order.status) {
                        updateOrderStatusBadge(order.status);
                        var session = getSession();
                        renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
                        renderOrderInfo(_currentOrder, session && session.id === _currentOrder.talentId);
                    }

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
    FB.get('getMessages', { orderId: orderId })
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
            if (_ratingOrder.talentId) delete _talentRatingsCache[_ratingOrder.talentId];
            if (_currentOrder && _currentOrder.id === _ratingOrder.id) {
                _currentOrder.status = 'rated';
                _currentOrder.rating = _ratingValue;
                _currentOrder.review = review;
                var session = getSession();
                updateOrderStatusBadge('rated');
                renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
            }
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

    var photo = getProfilePhoto(session.id);
    var avatarImg = document.getElementById('settingsAvatarImg');
    var avatarIcon = document.getElementById('settingsAvatarIcon');
    if (photo) {
        avatarImg.src = photo; avatarImg.style.display = 'block'; avatarIcon.style.display = 'none';
    } else {
        avatarImg.style.display = 'none'; avatarIcon.style.display = '';
    }

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
function openOrdersList() {
    var page = document.getElementById('ordersListPage');
    if (!page) return;
    var session = getSession();
    if (!session) return;

    document.getElementById('olpTitle').textContent = session.role === 'talent' ? 'Pesanan Masuk' : 'Pesanan Saya';
    page.classList.remove('hidden');

    document.getElementById('olpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat pesanan...</p></div>';

    FB.get('getOrdersByUser', { userId: session.id })
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

    list.querySelectorAll('.olp-rate-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var idx = parseInt(this.dataset.ridx, 10);
            if (orders[idx]) openRatingPage(orders[idx]);
        });
    });
}

// ══════════════════════════════════════════
// ═══ RESET BOTTOM NAV ═══
// ══════════════════════════════════════════
function resetBottomNavToHome() {
    document.querySelectorAll('.bottom-nav').forEach(function (nav) {
        // Only reset the visible nav (inside visible page)
        if (nav.closest('.page') && nav.closest('.page').classList.contains('hidden')) return;
        nav.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
        var homeBtn = nav.querySelector('.nav-item[data-page="home"]');
        if (homeBtn) homeBtn.classList.add('active');
    });
}
window.resetBottomNavToHome = resetBottomNavToHome;

// ══════════════════════════════════════════
// ═══ BOTTOM NAV ═══
// ══════════════════════════════════════════
function setupBottomNav() {
    document.querySelectorAll('.bottom-nav').forEach(function (nav) {
        nav.querySelectorAll('.nav-item').forEach(function (item) {
            item.addEventListener('click', function () {
                nav.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
                this.classList.add('active');
                var page = this.dataset.page;
                if (page === 'pesanan') {
                    openOrdersList();
                } else if (page === 'chat') {
                    clearChatBadge();
                    openOrdersList();
                } else if (page === 'tickets' || page === 'reports') {
                    openAdminTransactions();
                } else if (page === 'products') {
                    var prodSec = document.getElementById('penjualProductsSection');
                    if (prodSec) prodSec.scrollIntoView({ behavior: 'smooth' });
                } else if (page === 'earning') {
                    showToast('Rincian pendapatan segera hadir! 🚀');
                } else if (page === 'home') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else if (page === 'akun' || page === 'profil' || page === 'settings') {
                    openSettingsPage();
                } else if (page === 'users') {
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

// ══════════════════════════════════════════
// ═══ PWA & SPLASH ═══
// ══════════════════════════════════════════
window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
});

function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(function (reg) {
            // Check for updates on load
            reg.addEventListener('updatefound', function () {
                var newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', function () {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version available — show update popup
                        _showUpdatePopup(newWorker);
                    }
                });
            });
        }).catch(function () {});
        // Reload when new SW takes control
        var refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    }
}

function _showUpdatePopup(waitingWorker) {
    var popup = document.getElementById('appUpdatePopup');
    if (!popup) return;
    popup.classList.remove('hidden');
    var btnUpdate = document.getElementById('appUpdateBtn');
    var btnLater = document.getElementById('appUpdateLater');
    if (btnUpdate) {
        var newBtn = btnUpdate.cloneNode(true);
        btnUpdate.parentNode.replaceChild(newBtn, btnUpdate);
        newBtn.addEventListener('click', function () {
            newBtn.disabled = true;
            newBtn.textContent = '⏳ Mengupdate...';
            waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        });
    }
    if (btnLater) {
        var newLater = btnLater.cloneNode(true);
        btnLater.parentNode.replaceChild(newLater, btnLater);
        newLater.addEventListener('click', function () {
            popup.classList.add('hidden');
        });
    }
}
window._showUpdatePopup = _showUpdatePopup;

function handleSplash() {
    var splash = document.getElementById('splash');
    var app = document.getElementById('app');

    setTimeout(function () {
        splash.classList.add('fade-out');
        app.classList.remove('hidden');

        var urlPage = pageFromPath(window.location.pathname);

        var session = getSession();
        if (session) {
            var users = getUsers();
            var valid = users.find(function (u) { return u.id === session.id && u.username === session.username; });
            if (valid) {
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

        if (urlPage === 'register') {
            showPage('register');
        } else {
            showPage('login');
        }
    }, 1800);
}

// ══════════════════════════════════════════
// ═══ PULL TO REFRESH ═══
// ══════════════════════════════════════════
(function () {
    var _ptr_startY = 0;
    var _ptr_currentY = 0;
    var _ptr_pulling = false;
    var _ptr_threshold = 80;
    var _ptr_indicator = null;

    function createIndicator() {
        if (_ptr_indicator) return _ptr_indicator;
        var el = document.createElement('div');
        el.id = 'pullRefreshIndicator';
        el.className = 'ptr-indicator';
        el.innerHTML = '<div class="ptr-spinner"></div><span class="ptr-text">Tarik untuk refresh</span>';
        document.body.appendChild(el);
        _ptr_indicator = el;
        return el;
    }

    function isAtTop() {
        return window.scrollY <= 0;
    }

    function doRefresh() {
        var session = typeof getSession === 'function' ? getSession() : null;
        if (!session) { window.location.reload(); return; }

        // Reload wallet
        if (typeof loadUserWallet === 'function') loadUserWallet();

        // Reload role-specific data
        var role = session.role;
        if (role === 'talent') {
            if (typeof loadTalentDashboardOrders === 'function') loadTalentDashboardOrders();
        } else if (role === 'penjual') {
            if (typeof loadPenjualDashboard === 'function') loadPenjualDashboard();
        } else if (role === 'cs') {
            if (typeof loadCSDashboard === 'function') loadCSDashboard();
        } else if (role === 'owner') {
            if (typeof renderOwnerStats === 'function') renderOwnerStats();
            if (typeof renderOwnerUsers === 'function') renderOwnerUsers();
        }

        if (typeof showToast === 'function') showToast('Data diperbarui ✅', 'success');
    }

    document.addEventListener('touchstart', function (e) {
        if (!isAtTop()) return;
        _ptr_startY = e.touches[0].clientY;
        _ptr_pulling = true;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!_ptr_pulling || !isAtTop()) return;
        _ptr_currentY = e.touches[0].clientY;
        var dist = _ptr_currentY - _ptr_startY;
        if (dist < 0) return;

        var ind = createIndicator();
        var progress = Math.min(dist / _ptr_threshold, 1);
        var translateY = Math.min(dist * 0.5, 60);
        ind.style.transform = 'translateX(-50%) translateY(' + translateY + 'px)';
        ind.style.opacity = progress;
        ind.classList.add('ptr-visible');

        if (dist >= _ptr_threshold) {
            ind.querySelector('.ptr-text').textContent = 'Lepas untuk refresh';
            ind.classList.add('ptr-ready');
        } else {
            ind.querySelector('.ptr-text').textContent = 'Tarik untuk refresh';
            ind.classList.remove('ptr-ready');
        }
    }, { passive: true });

    document.addEventListener('touchend', function () {
        if (!_ptr_pulling) return;
        var dist = _ptr_currentY - _ptr_startY;
        _ptr_pulling = false;
        _ptr_currentY = 0;
        _ptr_startY = 0;

        var ind = _ptr_indicator;
        if (!ind) return;

        if (dist >= _ptr_threshold) {
            ind.querySelector('.ptr-text').textContent = 'Memperbarui...';
            ind.classList.add('ptr-loading');
            ind.style.transform = 'translateX(-50%) translateY(50px)';

            doRefresh();

            setTimeout(function () {
                ind.classList.remove('ptr-visible', 'ptr-ready', 'ptr-loading');
                ind.style.transform = 'translateX(-50%) translateY(-60px)';
                ind.style.opacity = '0';
            }, 1200);
        } else {
            ind.classList.remove('ptr-visible', 'ptr-ready');
            ind.style.transform = 'translateX(-50%) translateY(-60px)';
            ind.style.opacity = '0';
        }
    }, { passive: true });
})();
