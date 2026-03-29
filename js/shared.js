/* ========================================
   JASA SURUH (JS) - Shared Pages Module
   Order Tracking, Chat, Rating, Settings,
   Orders List, Bottom Nav, PWA, Splash
   ======================================== */

// ══════════════════════════════════════════
// ═══ NOTIFICATION SOUNDS ═══
// ══════════════════════════════════════════
var _audioUnlocked = false;
var _mediaAudioUnlocked = false;
var _ctxAudioUnlocked = false;
var _notificationAudio = null;
var _notificationAudioContext = null;
var _notificationBlobUrl = '';
var _notificationSourceResolved = false;
var _notificationResolvingPromise = null;
var _notificationSoundCandidates = (function () {
    var candidates = [
        '/public/sound/Notification.mp3',
        './public/sound/Notification.mp3',
        'public/sound/Notification.mp3',
        '/sound/Notification.mp3',
        './sound/Notification.mp3',
        'sound/Notification.mp3',
        '/Notification.mp3'
    ];

    try {
        var basePath = String((window.location && window.location.pathname) || '/').replace(/[^\/]*$/, '');
        if (basePath) candidates.push(basePath + 'public/sound/Notification.mp3');
    } catch (e) {}

    return Array.from(new Set(candidates));
})();
var _notificationSoundSrc = _notificationSoundCandidates[0];
var _notificationCandidateIndex = 0;

function _getNotificationAudioContext() {
    if (_notificationAudioContext) return _notificationAudioContext;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
        _notificationAudioContext = new Ctx();
    } catch (e) {
        _notificationAudioContext = null;
    }
    return _notificationAudioContext;
}

function _beepWithWebAudio() {
    var ctx = _getNotificationAudioContext();
    if (!ctx || ctx.state !== 'running') return false;
    try {
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.24);
        return true;
    } catch (e) {
        return false;
    }
}

function _resumeAudioContext() {
    var ctx = _getNotificationAudioContext();
    if (!ctx) return Promise.resolve(false);
    if (ctx.state === 'running') return Promise.resolve(true);
    return ctx.resume().then(function () { return ctx.state === 'running'; }).catch(function () { return false; });
}

function _setNotificationAudioSrc(audio, src) {
    if (!audio || !src) return false;
    _notificationSoundSrc = src;
    audio.src = src;
    audio.load();
    return true;
}

function _setAudioSourceByIndex(audio, idx) {
    if (idx < 0 || idx >= _notificationSoundCandidates.length) return false;
    _notificationCandidateIndex = idx;
    return _setNotificationAudioSrc(audio, _notificationSoundCandidates[idx]);
}

function _resolveNotificationSoundSource() {
    if (_notificationSourceResolved && _notificationSoundSrc) return Promise.resolve(true);
    if (_notificationResolvingPromise) return _notificationResolvingPromise;

    var cacheBust = Date.now();
    var i = 0;

    _notificationResolvingPromise = new Promise(function (resolve) {
        function tryNext() {
            if (i >= _notificationSoundCandidates.length) {
                _notificationResolvingPromise = null;
                resolve(false);
                return;
            }

            var idx = i++;
            var candidate = _notificationSoundCandidates[idx];
            var probeUrl = candidate + (candidate.indexOf('?') >= 0 ? '&' : '?') + 'v=' + cacheBust;

            fetch(probeUrl, { method: 'GET', cache: 'no-store' })
                .then(function (resp) {
                    if (!resp || !resp.ok) throw new Error('bad-response');
                    var contentType = String((resp.headers && resp.headers.get('content-type')) || '').toLowerCase();
                    if (contentType && contentType.indexOf('audio') === -1 && contentType.indexOf('octet-stream') === -1) {
                        throw new Error('not-audio-response');
                    }
                    _notificationCandidateIndex = idx;
                    return resp.blob();
                })
                .then(function (blob) {
                    if (!blob || !blob.size) throw new Error('empty-blob');

                    try {
                        if (_notificationBlobUrl) URL.revokeObjectURL(_notificationBlobUrl);
                    } catch (e) {}

                    _notificationBlobUrl = URL.createObjectURL(blob);
                    _notificationSourceResolved = true;
                    if (_notificationAudio) _setNotificationAudioSrc(_notificationAudio, _notificationBlobUrl);
                    _notificationResolvingPromise = null;
                    resolve(true);
                })
                .catch(function () {
                    tryNext();
                });
        }

        tryNext();
    });

    return _notificationResolvingPromise;
}

function _getNotificationAudio() {
    if (!_notificationAudio) {
        _notificationAudio = new Audio();
        _notificationAudio.preload = 'auto';
        _notificationAudio.volume = 1;
        _notificationAudio.setAttribute('playsinline', '');
        _notificationAudio.setAttribute('webkit-playsinline', 'true');
        if (_notificationSoundSrc) _setNotificationAudioSrc(_notificationAudio, _notificationSoundSrc);
    }
    return _notificationAudio;
}

function _switchToNextNotificationSource(sound) {
    var next = _notificationCandidateIndex + 1;
    if (next >= _notificationSoundCandidates.length) return false;
    return _setAudioSourceByIndex(sound, next);
}

function _playNotificationSound(vibratePattern) {
    try {
        var sound = _getNotificationAudio();
        var paths = [
            'public/sound/Notification.mp3',
            '/public/sound/Notification.mp3',
            'sound/Notification.mp3',
            '/sound/Notification.mp3'
        ];
        var idx = 0;

        function tryNext() {
            if (idx >= paths.length) {
                _beepWithWebAudio();
                return;
            }
            sound.src = paths[idx];
            sound.load();
            var playPromise = sound.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(err) {
                    console.warn("Play failed for " + paths[idx], err);
                    idx++;
                    tryNext();
                });
            }
        }
        
        tryNext();

        if (navigator.vibrate && vibratePattern) {
            navigator.vibrate(vibratePattern);
        }
    } catch (e) {
        _beepWithWebAudio();
        if (navigator.vibrate && vibratePattern) try { navigator.vibrate(vibratePattern); } catch(err){}
    }
}

// Unlock notification audio on first user interaction (required by iOS Safari)
function _unlockAudio() {
    if (_mediaAudioUnlocked) return;

    try {
        var audio = _getNotificationAudio();
        if (!audio.src) {
            audio.src = 'public/sound/Notification.mp3';
            audio.load();
        }
        var prevVolume = audio.volume;
        audio.muted = false;
        audio.volume = 0.01;
        try { audio.currentTime = 0; } catch (e) {}

        var playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(function () {
                _mediaAudioUnlocked = true;
                audio.pause();
                try { audio.currentTime = 0; } catch (e) {}
                audio.volume = prevVolume;
            }).catch(function () {
                audio.volume = prevVolume;
            });
        }
    } catch (e) {}

    _resumeAudioContext().then(function (res) {
        _ctxAudioUnlocked = !!res;
        _audioUnlocked = _mediaAudioUnlocked || _ctxAudioUnlocked;
        if (_mediaAudioUnlocked || _ctxAudioUnlocked) {
            document.removeEventListener('click', _unlockAudio);
            document.removeEventListener('pointerdown', _unlockAudio);
            document.removeEventListener('touchstart', _unlockAudio);
            document.removeEventListener('touchend', _unlockAudio);
        }
    }).catch(function () {
        _audioUnlocked = _ctxAudioUnlocked;
    });
}
document.addEventListener('click', _unlockAudio);
document.addEventListener('pointerdown', _unlockAudio);
document.addEventListener('touchstart', _unlockAudio);
document.addEventListener('touchend', _unlockAudio);

function playBellSound() {
    _playNotificationSound([200, 100, 200, 100, 200]);
}
window.playBellSound = playBellSound;

function playMessageSound() {
    _playNotificationSound([100]);
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
    var balEl = document.getElementById('userWalletBalance');
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

    if (typeof window.syncOwnerFinancePreview === 'function') {
        window.syncOwnerFinancePreview();
    }
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
                var payUrl = String(res.invoiceUrl || '').trim();
                if (!/^https?:\/\//i.test(payUrl)) {
                    showToast('Link pembayaran tidak valid. Coba ulangi top up.', 'error');
                    return;
                }
                showToast('Mengarahkan ke halaman pembayaran...', 'success');
                addNotifItem({ icon: '💳', title: 'Top Up Diproses', desc: 'Top Up ' + formatRupiah(amount) + ' sedang menunggu pembayaran', type: 'topup' });
                overlay.remove();
                // iOS/webview lebih stabil dengan redirect top-level dibanding popup/new-tab.
                window.location.replace(payUrl);
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
var _unreadChatByUser = {};
var _globalMsgUnsub = null;
var _lastKnownMsgCounts = {};
var _chatPageOpen = false;
var _msgPollTimer = null;
var _msgListenerStartedAt = 0;

function isChatPageActive() {
    var cp = document.getElementById('chatPage');
    if (!cp) return false;
    return !cp.classList.contains('hidden');
}

function _normalizeRole(role) {
    var r = String(role || '').toLowerCase();
    if (r === 'pengguna' || r === 'customer') return 'user';
    if (r === 'seller') return 'penjual';
    if (r === 'admin') return 'owner';
    return r;
}

function _getActiveRoleBadgeTargets() {
    var session = getSession();
    var role = _normalizeRole(session && session.role);
    var targets = {
        user: { notifBtn: 'userNotifBtn', notifBadge: 'userHeaderBadge' },
        talent: { notifBtn: 'talentNotifBtn', notifBadge: 'talentHeaderBadge' },
        penjual: { notifBtn: 'penjualNotifBtn', notifBadge: 'penjualHeaderBadge' },
        cs: { notifBtn: 'csNotifBtn', notifBadge: 'csHeaderBadge' },
        owner: { notifBtn: 'ownerNotifBtn', notifBadge: 'ownerHeaderBadge' }
    };
    return targets[role] || null;
}

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

    // Show chat unread badge only on active role's notif button.
    ['userNotifBtn', 'talentNotifBtn', 'penjualNotifBtn', 'csNotifBtn', 'ownerNotifBtn'].forEach(function (btnId) {
        var otherBtn = document.getElementById(btnId);
        if (!otherBtn) return;
        var otherBadge = otherBtn.querySelector('.chat-header-badge');
        if (otherBadge) otherBadge.style.display = 'none';
    });
    var activeTargets = _getActiveRoleBadgeTargets();
    if (activeTargets && activeTargets.notifBtn) {
        var activeBtn = document.getElementById(activeTargets.notifBtn);
        if (activeBtn) {
            var hb = activeBtn.querySelector('.chat-header-badge');
            if (_unreadChatCount > 0) {
                if (!hb) {
                    hb = document.createElement('span');
                    hb.className = 'chat-header-badge';
                    activeBtn.appendChild(hb);
                }
                hb.textContent = _unreadChatCount > 9 ? '9+' : _unreadChatCount;
                hb.style.display = '';
            } else if (hb) {
                hb.style.display = 'none';
            }
        }
    }

    // Show mini unread badge on quick-chat buttons in order tracking card (per counterpart user).
    var order = _currentOrder || {};
    var quickChatTargets = {
        otpDriverChatBtn: order.talentId,
        otpSellerChatBtn: order.sellerId,
        otpBuyerChatBtn: order.userId
    };

    Object.keys(quickChatTargets).forEach(function (btnId) {
        var btn = document.getElementById(btnId);
        if (!btn) return;

        var targetUserId = quickChatTargets[btnId] ? String(quickChatTargets[btnId]) : '';
        var unreadForTarget = targetUserId ? (Number(_unreadChatByUser[targetUserId]) || 0) : 0;
        var b = btn.querySelector('.chat-mini-badge');

        if (unreadForTarget > 0) {
            if (!b) {
                b = document.createElement('span');
                b.className = 'chat-mini-badge';
                btn.appendChild(b);
            }
            b.textContent = unreadForTarget > 9 ? '9+' : unreadForTarget;
            b.style.display = '';
        } else if (b) {
            b.style.display = 'none';
        }
    });

    // Keep header badge synced when unread chat changes.
    updateNotifBadges();

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

    // Reset baseline for current login/role session to avoid stale counts.
    _unreadChatCount = 0;
    _unreadChatByUser = {};
    _lastKnownMsgCounts = {};
    _msgListenerStartedAt = Date.now();
    updateChatBadges();

    // Do initial check then poll every 8 seconds
    _pollNewMessages(session);
    _msgPollTimer = setInterval(function () { _pollNewMessages(session); }, 4000);

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
                return ['pending_seller', 'preparing', 'pending', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'searching'].indexOf(o.status) >= 0;
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
            var fromOthers = [];

            function isIncomingForSession(m) {
                if (!m) return false;
                var fromOther = String(m.senderId) !== String(session.id);
                if (!fromOther) return false;

                // Primary rule: only notify if explicitly addressed to this session.
                if (m.recipientId) {
                    return String(m.recipientId) === String(session.id);
                }

                // Secondary rule for transition data: allow only if conversation key includes this user.
                if (m.conversationKey) {
                    var mine = String(session.id);
                    return String(m.conversationKey).indexOf('::') >= 0
                        && String(m.conversationKey).indexOf('__') >= 0
                        && (String(m.conversationKey).indexOf('::' + mine + '__') >= 0
                            || String(m.conversationKey).indexOf('__' + mine) >= 0);
                }

                // Legacy message without recipient/conversation metadata is ambiguous.
                // Do not increase badge to avoid cross-role badge leaks.
                return false;
            }

            if (prevCount > 0 && currentCount > prevCount) {
                // Find new messages not from self
                var newMsgs = msgs.slice(prevCount);
                fromOthers = newMsgs.filter(isIncomingForSession);
            } else if (prevCount === 0 && currentCount > 0) {
                // Handle first poll race: count only messages created after listener started.
                fromOthers = msgs.filter(function (m) {
                    var fromOther = isIncomingForSession(m);
                    var createdAt = Number(m.createdAt) || 0;
                    return fromOther && createdAt >= (_msgListenerStartedAt - 500);
                });
            }

            if (fromOthers.length > 0 && !isChatPageActive()) {
                _unreadChatCount += fromOthers.length;
                fromOthers.forEach(function (m) {
                    var sid = String(m && m.senderId || '');
                    if (!sid) return;
                    _unreadChatByUser[sid] = (Number(_unreadChatByUser[sid]) || 0) + 1;
                });
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

                if (document.hidden) {
                    _postServiceWorkerNotification({
                        title: '💬 Pesan dari ' + senderName,
                        body: lastMsg.text || 'Ada pesan baru',
                        tag: 'chat-' + String(order.id || ''),
                        data: { orderId: order.id, type: 'chat' },
                        vibrate: [100, 50, 100]
                    });
                }
            }
            _lastKnownMsgCounts[order.id] = currentCount;
        })
        .catch(function () {});
}

function _syncUnreadChatTotalFromMap() {
    var total = 0;
    Object.keys(_unreadChatByUser || {}).forEach(function (uid) {
        total += Number(_unreadChatByUser[uid]) || 0;
    });
    _unreadChatCount = Math.max(0, total);
}

function clearChatBadgeForUser(userId) {
    var uid = String(userId || '');
    if (!uid) return;
    if (_unreadChatByUser && Object.prototype.hasOwnProperty.call(_unreadChatByUser, uid)) {
        delete _unreadChatByUser[uid];
    }
    _syncUnreadChatTotalFromMap();
    updateChatBadges();
    updateNotifBadges();
}
window.clearChatBadgeForUser = clearChatBadgeForUser;

function clearChatBadge() {
    _unreadChatCount = 0;
    _unreadChatByUser = {};
    updateChatBadges();
    updateNotifBadges();
}
window.clearChatBadge = clearChatBadge;

// ══════════════════════════════════════════
// ═══ NOTIFICATION POPUP (DB-backed) ═══
// ══════════════════════════════════════════
var _notifItems = [];
var _notifUnsub = null;
var _notifPollTimer = null;
var _pushSetupPromise = null;
var _pushPermissionHooked = false;
var _pushVisibilityHooked = false;
var _pushRetryTimer = null;
var _pushRetryAttempt = 0;
var _pushRetryUserId = null;
var _pushMiniHooked = false;

function _currentRolePushIds(role) {
    if (role === 'user') return { statusId: 'userPushStatusText', buttonId: 'userPushEnableBtn' };
    if (role === 'penjual') return { statusId: 'penjualPushStatusText', buttonId: 'penjualPushEnableBtn' };
    return null;
}

function _shortPushEndpoint(endpoint) {
    if (!endpoint) return '';
    try {
        return new URL(endpoint).host || '';
    } catch (e) {
        return String(endpoint).slice(0, 28);
    }
}

function _setRolePushMiniStatus(role, text, state, showButton, buttonText, buttonDisabled, endpointTitle) {
    var ids = _currentRolePushIds(role);
    if (!ids) return;

    var statusEl = document.getElementById(ids.statusId);
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.title = endpointTitle || '';
        statusEl.classList.remove('is-active', 'is-warning', 'is-error', 'is-checking');
        if (state) statusEl.classList.add(state);
    }

    var btn = document.getElementById(ids.buttonId);
    if (btn) {
        btn.classList.toggle('hidden', !showButton);
        btn.textContent = buttonText || 'Aktifkan';
        btn.disabled = !!buttonDisabled;
    }
}

function _refreshRolePushMiniStatus(forceEnsure) {
    var session = getSession();
    if (!session || !session.id) return Promise.resolve(false);
    if (session.role !== 'user' && session.role !== 'penjual') return Promise.resolve(false);

    var role = session.role;
    var supportsPush = ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window);
    if (!supportsPush) {
        _setRolePushMiniStatus(role, 'Push tidak didukung browser', 'is-error', false, '', false);
        return Promise.resolve(false);
    }

    if (Notification.permission === 'denied') {
        _setRolePushMiniStatus(role, 'Push diblokir di browser', 'is-error', true, 'Buka Pengaturan', false);
        return Promise.resolve(false);
    }

    if (Notification.permission === 'default' && forceEnsure) {
        return _ensurePushSubscriptionWithRetry(session, { reason: 'mini-force', askPermission: true })
            .then(function (ok) {
                return _refreshRolePushMiniStatus(false).then(function () { return !!ok; });
            })
            .catch(function () {
                _setRolePushMiniStatus(role, 'Gagal meminta izin push', 'is-error', true, 'Coba Lagi', false);
                return false;
            });
    }

    if (Notification.permission === 'default') {
        _setRolePushMiniStatus(role, 'Push belum diizinkan', 'is-warning', true, 'Izinkan', false);
        return Promise.resolve(false);
    }

    _setRolePushMiniStatus(role, 'Push: sinkronisasi...', 'is-checking', false, '', true);
    return navigator.serviceWorker.ready
        .then(function (reg) {
            return reg.pushManager.getSubscription();
        })
        .then(function (sub) {
            if (sub) {
                _setRolePushMiniStatus(role, 'Push aktif realtime', 'is-active', false, '', false, '');
                return true;
            }
            if (_pushRetryTimer && String(_pushRetryUserId || '') === String(session.id)) {
                _setRolePushMiniStatus(role, 'Push disinkronkan otomatis...', 'is-warning', true, 'Sinkronkan', false);
            } else {
                _setRolePushMiniStatus(role, 'Push belum aktif di perangkat ini', 'is-warning', true, 'Aktifkan', false);
            }
            return false;
        })
        .catch(function () {
            _setRolePushMiniStatus(role, 'Gagal cek status push', 'is-error', true, 'Coba Lagi', false);
            return false;
        });
}

function _bindRolePushMiniActions() {
    if (_pushMiniHooked) return;
    _pushMiniHooked = true;

    ['user', 'penjual'].forEach(function (role) {
        var ids = _currentRolePushIds(role);
        if (!ids) return;
        var btn = document.getElementById(ids.buttonId);
        if (!btn || btn._eventsSetup) return;

        btn._eventsSetup = true;
        btn.addEventListener('click', function () {
            var s = getSession();
            if (!s || s.role !== role) return;
            _refreshRolePushMiniStatus(true).then(function (ok) {
                if (ok) showToast('Push notifikasi sudah aktif.', 'success');
            });
        });
    });
}

function _clearPushRetryState() {
    if (_pushRetryTimer) {
        clearTimeout(_pushRetryTimer);
        _pushRetryTimer = null;
    }
    _pushRetryAttempt = 0;
    _pushRetryUserId = null;
    _refreshRolePushMiniStatus(false);
}

function _schedulePushRetry(session, reason) {
    if (!session || !session.id) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (_pushRetryTimer) return;

    if (_pushRetryUserId && String(_pushRetryUserId) !== String(session.id)) {
        _clearPushRetryState();
    }
    _pushRetryUserId = session.id;
    _pushRetryAttempt += 1;

    var baseDelay = 2000;
    var maxDelay = 120000;
    var jitter = Math.floor(Math.random() * 700);
    var delay = Math.min(maxDelay, (baseDelay * Math.pow(2, _pushRetryAttempt - 1)) + jitter);

    _pushRetryTimer = setTimeout(function () {
        _pushRetryTimer = null;
        var latest = getSession();
        if (!latest || String(latest.id) !== String(session.id)) {
            _clearPushRetryState();
            return;
        }
        _ensurePushSubscriptionWithRetry(latest, { reason: reason || 'retry', askPermission: false });
        _refreshRolePushMiniStatus(false);
    }, delay);
}

function _ensurePushSubscriptionWithRetry(session, options) {
    options = options || {};
    if (!session || !session.id) {
        _clearPushRetryState();
        return Promise.resolve(false);
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        _clearPushRetryState();
        return Promise.resolve(false);
    }

    if (_pushRetryUserId && String(_pushRetryUserId) !== String(session.id)) {
        _clearPushRetryState();
    }

    var askPermission = !!options.askPermission;
    if (Notification.permission === 'default') {
        if (!askPermission) return Promise.resolve(false);
        return Notification.requestPermission()
            .then(function (perm) {
                if (perm !== 'granted') {
                    _clearPushRetryState();
                    return false;
                }
                return _ensurePushSubscriptionWithRetry(session, { reason: options.reason || 'permission-granted' });
            })
            .catch(function () { return false; });
    }

    if (Notification.permission !== 'granted') {
        _clearPushRetryState();
        return Promise.resolve(false);
    }

    return _ensurePushSubscription(session).then(function (ok) {
        if (ok) {
            _clearPushRetryState();
            _refreshRolePushMiniStatus(false);
            return true;
        }
        _schedulePushRetry(session, options.reason || 'subscription-failed');
        _refreshRolePushMiniStatus(false);
        return false;
    }).catch(function () {
        _schedulePushRetry(session, options.reason || 'subscription-error');
        _refreshRolePushMiniStatus(false);
        return false;
    });
}

var _prevUnreadCount = 0;
function initNotifications() {
    var session = getSession();
    if (!session || !isBackendConnected()) return;
    if (_notifUnsub) { _notifUnsub(); _notifUnsub = null; }
    if (_notifPollTimer) { clearInterval(_notifPollTimer); _notifPollTimer = null; }
    _prevUnreadCount = 0;

    _bindRolePushMiniActions();
    _setupPushPermissionFlow(session);
    _ensurePushSubscriptionWithRetry(session, { reason: 'init-notifications' });
    _refreshRolePushMiniStatus(false);

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

function _setupPushPermissionFlow(session) {
    if (!session || !session.id) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    if (!_pushPermissionHooked) {
        _pushPermissionHooked = true;
        var activatePush = function () {
            var s = getSession();
            if (!s || !s.id) return;

            if (Notification.permission === 'granted') {
                _ensurePushSubscriptionWithRetry(s, { reason: 'user-gesture' });
                return;
            }

            if (Notification.permission === 'default') {
                _ensurePushSubscriptionWithRetry(s, { reason: 'user-gesture-permission', askPermission: true });
            }
        };

        document.addEventListener('click', activatePush, true);
        document.addEventListener('touchend', activatePush, true);
        document.addEventListener('keydown', activatePush, true);
    }

    if (!_pushVisibilityHooked) {
        _pushVisibilityHooked = true;
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            var s = getSession();
            if (!s || !s.id) return;
            if (Notification.permission === 'granted') _ensurePushSubscriptionWithRetry(s, { reason: 'visibility' });
            _refreshRolePushMiniStatus(false);
        });

        window.addEventListener('focus', function () {
            var s = getSession();
            if (!s || !s.id) return;
            if (Notification.permission === 'granted') _ensurePushSubscriptionWithRetry(s, { reason: 'focus' });
            _refreshRolePushMiniStatus(false);
        });
    }
}

function _urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function _ensurePushSubscription(session) {
    if (!session || !session.id) return Promise.resolve(false);
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve(false);
    if (!('Notification' in window) || Notification.permission !== 'granted') return Promise.resolve(false);
    if (_pushSetupPromise) return _pushSetupPromise;

    _pushSetupPromise = navigator.serviceWorker.ready
        .then(function (reg) {
            return fetch('/api/push/public-key')
                .then(function (r) { return r.json(); })
                .then(function (keyRes) {
                    if (!keyRes || !keyRes.success || !keyRes.publicKey) throw new Error('Public key push tidak tersedia');
                    return reg.pushManager.getSubscription().then(function (existingSub) {
                        if (existingSub) return existingSub;
                        return reg.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: _urlBase64ToUint8Array(String(keyRes.publicKey || ''))
                        });
                    });
                })
                .then(function (sub) {
                    if (!sub) return false;
                    return fetch('/api/push/subscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: session.id,
                            subscription: sub,
                            meta: {
                                userAgent: navigator.userAgent || '',
                                platform: navigator.platform || '',
                                lang: navigator.language || ''
                            }
                        })
                    }).then(function (r) { return r.json(); }).then(function (saveRes) {
                        return !!(saveRes && saveRes.success);
                    });
                });
        })
        .catch(function () { return false; })
        .finally(function () { _pushSetupPromise = null; });

    return _pushSetupPromise;
}

function ensurePushSubscriptionForCurrentUser() {
    var session = getSession();
    if (!session || !session.id) return Promise.resolve(false);
    return _ensurePushSubscription(session);
}
window.ensurePushSubscriptionForCurrentUser = ensurePushSubscriptionForCurrentUser;

function primePushForCurrentUser(askPermission) {
    var session = getSession();
    if (!session || !session.id) return Promise.resolve(false);
    return _ensurePushSubscriptionWithRetry(session, {
        reason: 'manual-prime',
        askPermission: !!askPermission
    }).then(function (ok) {
        _refreshRolePushMiniStatus(false);
        return ok;
    });
}
window.primePushForCurrentUser = primePushForCurrentUser;

function _postServiceWorkerNotification(payload) {
    if (!payload || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    navigator.serviceWorker.ready.then(function (reg) {
        var worker = navigator.serviceWorker.controller || reg.active || reg.waiting;
        if (!worker) return;
        worker.postMessage(Object.assign({ type: 'SHOW_NOTIFICATION' }, payload));
    }).catch(function () {});
}

function _onNotifUpdate(items) {
    _notifItems = items || [];
    var newUnread = _notifItems.filter(function (n) { return n.unread; }).length;
    // Play sound when new unread notifications arrive
    if (newUnread > _prevUnreadCount) {
        playBellSound();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

        // Keep incoming-order modal in sync with badge timing by refreshing order lists immediately.
        var s = getSession();
        if (s && s.role === 'penjual' && typeof loadPenjualOrders === 'function') {
            setTimeout(function () { loadPenjualOrders(); }, 0);
        }
        if (s && s.role === 'talent' && typeof loadTalentDashboardOrders === 'function') {
            setTimeout(function () { loadTalentDashboardOrders(); }, 0);
        }

        if (document.hidden) {
            var latestUnread = _notifItems.filter(function (n) { return !!n.unread; })
                .sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); })[0];
            if (latestUnread) {
                _postServiceWorkerNotification({
                    title: latestUnread.title || 'Jasa Suruh',
                    body: latestUnread.desc || 'Ada notifikasi baru',
                    tag: latestUnread.type ? ('notif-' + latestUnread.type) : 'notif-general',
                    data: { orderId: latestUnread.orderId || '', type: latestUnread.type || 'info' },
                    vibrate: [200, 100, 200]
                });
            }
        }
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

    var markAllBtn = document.getElementById('notifMarkAllRead');
    if (markAllBtn && !markAllBtn._eventsSetup) {
        markAllBtn._eventsSetup = true;
        markAllBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var session = getSession();
            if (!session) return;

            markAllBtn.disabled = true;
            backendPost({ action: 'markAllNotifsRead', userId: session.id }).then(function () {
                _notifItems.forEach(function (n) { n.unread = false; });
                // Also reset unread chat counter so header badge fully clears.
                clearChatBadge();
                updateNotifBadges();
                renderNotifItems();
            }).finally(function () {
                markAllBtn.disabled = false;
            });
        });
    }

    if (!popup._eventsSetup) {
        popup._eventsSetup = true;
        document.getElementById('notifPopupClose').addEventListener('click', function () { popup.classList.add('hidden'); });
        document.getElementById('notifPopupOverlay').addEventListener('click', function () { popup.classList.add('hidden'); });
    }
}
window.openNotifPopup = openNotifPopup;

function addNotifItem(item) {
    // Save to DB
    var session = getSession();
    if (!session || !isBackendConnected()) return;
    var targetUserId = item.userId || session.id;

    backendPost({
        action: 'addNotification',
        userId: targetUserId,
        icon: item.icon || '🔔',
        title: item.title || '',
        desc: item.desc || '',
        type: item.type || 'info',
        orderId: item.orderId || '',
        extra: item.extra || null
    });

    // Dispatch server-side Web Push for offline/background delivery.
    fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: targetUserId,
            title: item.title || 'Jasa Suruh',
            body: item.desc || 'Ada notifikasi baru',
            tag: (item.type || 'info') + '-' + (item.orderId || Date.now()),
            orderId: item.orderId || '',
            type: item.type || 'info',
            data: item.extra || {},
            requireInteraction: !!item.requireInteraction
        })
    }).catch(function () {});
}
window.addNotifItem = addNotifItem;

function updateNotifBadges() {
    var notifCount = _notifItems.filter(function (n) { return n.unread; }).length;
    var count = notifCount + (Number(_unreadChatCount) || 0);
    ['userHeaderBadge', 'talentHeaderBadge', 'penjualHeaderBadge', 'ownerHeaderBadge', 'csHeaderBadge'].forEach(function (id) {
        var hiddenBadge = document.getElementById(id);
        if (!hiddenBadge) return;
        hiddenBadge.textContent = '0';
        hiddenBadge.style.display = 'none';
    });

    var activeTargets = _getActiveRoleBadgeTargets();
    if (!activeTargets || !activeTargets.notifBadge) return;

    var badge = document.getElementById(activeTargets.notifBadge);
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'flex';
    } else {
        badge.textContent = '0';
        badge.style.display = 'none';
    }
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
            if (item && item.orderId) {
                openOrderFromNotification(item.orderId);
            }
        });
    });
}

function openOrderFromNotification(orderId) {
    var session = getSession();
    if (!session || !orderId) return;
    FB.get('getOrdersByUser', { userId: session.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (!res || !res.success || !res.data) {
                showToast('Gagal membuka pesanan', 'error');
                return;
            }
            var target = res.data.find(function (o) { return String(o.id) === String(orderId); });
            if (!target) {
                showToast('Pesanan tidak ditemukan atau sudah tidak aktif', 'error');
                return;
            }
            openOrderTracking(target);
        })
        .catch(function () { showToast('Gagal membuka detail pesanan', 'error'); });
}

function _timeAgo(ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return 'Baru saja';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' menit lalu';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' jam lalu';
    return Math.floor(diff / 86400000) + ' hari lalu';
}

function openModernConfirm(options) {
    options = options || {};
    return new Promise(function (resolve) {
        var existing = document.getElementById('jsConfirmModal');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'jsConfirmModal';
        overlay.className = 'js-confirm-overlay';
        overlay.innerHTML = '<div class="js-confirm-card">'
            + '<div class="js-confirm-icon">⚠️</div>'
            + '<h3 class="js-confirm-title">' + _escapeHtml(options.title || 'Konfirmasi') + '</h3>'
            + '<p class="js-confirm-desc">' + _escapeHtml(options.message || 'Apakah Anda yakin?') + '</p>'
            + '<div class="js-confirm-actions">'
            + '<button class="otp-btn otp-btn-secondary" id="jsConfirmCancel">Batal</button>'
            + '<button class="otp-btn otp-btn-reject" id="jsConfirmOk">Ya, Lanjutkan</button>'
            + '</div>'
            + '</div>';

        function close(val) {
            overlay.remove();
            resolve(!!val);
        }

        document.body.appendChild(overlay);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close(false);
        });
        document.getElementById('jsConfirmCancel').addEventListener('click', function () { close(false); });
        document.getElementById('jsConfirmOk').addEventListener('click', function () { close(true); });
    });
}

// ══════════════════════════════════════════
// ═══ ORDER TRACKING PAGE ═══
// ══════════════════════════════════════════
function openOrderTracking(order) {
    _currentOrder = order;
    var page = document.getElementById('orderTrackingPage');
    if (!page) return;

    var session = getSession();
    var isTalent = session && String(session.id) === String(order.talentId);
    var isUser = session && String(session.id) === String(order.userId);
    var isSeller = session && String(session.id) === String(order.sellerId);

    page.classList.toggle('seller-mode', !!isSeller);

    renderOrderInfo(order, isTalent);
    renderOrderActions(order, isTalent, isUser);
    updateTrackingVisualState(order);

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
        var chatFab = document.getElementById('otpChatFab');
        if (chatFab) {
            chatFab.addEventListener('click', function () {
                if (_currentOrder) openChat(_currentOrder);
            });
        }
    }

    startOrderPolling(order.id);

    // Ensure driver location stream keeps running while this order is active.
    if (isTalent && ['accepted', 'on_the_way', 'arrived', 'in_progress'].indexOf(order.status) >= 0) {
        startTalentLocationBroadcast(order.id);
    }
}

function shouldShowTrackingMap(order) {
    if (!order) return false;
    var session = getSession();
    var isProductOrder = !!(order.skillType === 'js_food' || order.sellerId);
    var baseStatuses = ['on_the_way', 'arrived', 'in_progress', 'completed', 'rated'];

    if (!isProductOrder) {
        return baseStatuses.indexOf(order.status) >= 0;
    }

    var isDriver = !!(session && session.id === order.talentId);
    var isSeller = !!(session && session.id === order.sellerId);
    var isBuyer = !!(session && session.id === order.userId);

    if (isBuyer) {
        return ['in_progress', 'completed', 'rated'].indexOf(order.status) >= 0;
    }
    if (isSeller) {
        return ['on_the_way', 'arrived'].indexOf(order.status) >= 0;
    }
    if (isDriver) {
        return ['on_the_way', 'arrived', 'in_progress', 'completed', 'rated'].indexOf(order.status) >= 0;
    }

    return baseStatuses.indexOf(order.status) >= 0;
}

function isValidLatLng(lat, lng) {
    var nLat = Number(lat);
    var nLng = Number(lng);
    if (!isFinite(nLat) || !isFinite(nLng)) return false;
    if (Math.abs(nLat) > 90 || Math.abs(nLng) > 180) return false;
    if (nLat === 0 && nLng === 0) return false;
    return true;
}

function getOrderStoreCoords(order) {
    if (!order) return null;
    var lat = Number(order.storeLat);
    var lng = Number(order.storeLng);
    if (isValidLatLng(lat, lng)) {
        return { lat: lat, lng: lng };
    }

    var sellerId = order.sellerId;
    if (!sellerId) return null;
    var seller = getUsers().find(function (u) { return String(u.id) === String(sellerId); });
    if (!seller) return null;
    lat = Number(seller.lat);
    lng = Number(seller.lng);
    if (isValidLatLng(lat, lng)) {
        return { lat: lat, lng: lng };
    }
    return null;
}

function getTrackingLockedUserCoords(order) {
    if (!order) return null;
    var orderId = String(order.id || '');
    if (_otpLockedUserOrderId && _otpLockedUserOrderId !== orderId) {
        _otpLockedUserPos = null;
    }
    _otpLockedUserOrderId = orderId;

    if (_otpLockedUserPos && isValidLatLng(_otpLockedUserPos.lat, _otpLockedUserPos.lng)) {
        return { lat: Number(_otpLockedUserPos.lat), lng: Number(_otpLockedUserPos.lng) };
    }

    var lat = Number(order.userLat);
    var lng = Number(order.userLng);
    if (!isValidLatLng(lat, lng)) return null;
    _otpLockedUserPos = { lat: lat, lng: lng };
    return { lat: lat, lng: lng };
}

function getTrackingRouteEndpoints(order) {
    if (!order) return null;

    var lockedUser = getTrackingLockedUserCoords(order);
    var userLat = lockedUser ? Number(lockedUser.lat) : Number(order.userLat);
    var userLng = lockedUser ? Number(lockedUser.lng) : Number(order.userLng);
    var driverLat = Number(order.talentLat);
    var driverLng = Number(order.talentLng);
    var isProductOrder = !!(order.skillType === 'js_food' || order.sellerId);
    var isAntar = order.skillType === 'js_antar';
    var isDelivery = order.skillType === 'js_delivery';
    var storeCoords = isProductOrder ? getOrderStoreCoords(order) : null;

    if (!isValidLatLng(driverLat, driverLng)) {
        if (storeCoords) {
            driverLat = Number(storeCoords.lat);
            driverLng = Number(storeCoords.lng);
        } else if (isValidLatLng(userLat, userLng)) {
            driverLat = userLat;
            driverLng = userLng;
        }
    }

    if (!isValidLatLng(driverLat, driverLng)) return null;

    if (isProductOrder) {
        var goingToBuyer = ['in_progress', 'completed', 'rated'].indexOf(order.status) >= 0;
        if (goingToBuyer && isValidLatLng(userLat, userLng)) {
            return {
                fromLat: driverLat,
                fromLng: driverLng,
                toLat: userLat,
                toLng: userLng,
                phase: 'to_buyer'
            };
        }
        if (storeCoords && isValidLatLng(storeCoords.lat, storeCoords.lng)) {
            return {
                fromLat: driverLat,
                fromLng: driverLng,
                toLat: Number(storeCoords.lat),
                toLng: Number(storeCoords.lng),
                phase: 'to_store'
            };
        }
        if (isValidLatLng(userLat, userLng)) {
            return {
                fromLat: driverLat,
                fromLng: driverLng,
                toLat: userLat,
                toLng: userLng,
                phase: 'to_buyer'
            };
        }
        return null;
    }

    if (isAntar || isDelivery) {
        var destLat = Number(order.destLat);
        var destLng = Number(order.destLng);
        var goingToDestination = ['in_progress', 'completed', 'rated'].indexOf(order.status) >= 0;
        if (goingToDestination && isValidLatLng(destLat, destLng)) {
            return {
                fromLat: driverLat,
                fromLng: driverLng,
                toLat: destLat,
                toLng: destLng,
                phase: 'to_destination'
            };
        }
    }

    if (!isValidLatLng(userLat, userLng)) return null;
    return {
        fromLat: driverLat,
        fromLng: driverLng,
        toLat: userLat,
        toLng: userLng,
        phase: 'to_user'
    };
}

function isRideFlowOrder(order) {
    return !!(order && (order.skillType === 'js_antar' || order.skillType === 'js_delivery'));
}

function shouldHidePassedSegment(order) {
    if (!isRideFlowOrder(order)) return false;
    return ['in_progress', 'completed', 'rated'].indexOf(String(order.status || '')) >= 0;
}

function syncTrackingPickupMarkerVisibility(order) {
    if (!_otpUserMarker) return;
    var hidePickup = shouldHidePassedSegment(order);
    _otpUserMarker.setOpacity(hidePickup ? 0 : 1);
    var markerEl = _otpUserMarker.getElement();
    if (markerEl) {
        markerEl.style.transition = 'opacity 220ms ease, transform 220ms ease';
        markerEl.style.opacity = hidePickup ? '0' : '1';
        markerEl.style.transform = hidePickup ? 'scale(0.9)' : 'scale(1)';
        markerEl.style.pointerEvents = hidePickup ? 'none' : 'auto';
    }
    if (hidePickup) {
        try { _otpUserMarker.closePopup(); } catch (e) {}
    }
}

function shouldRenderDriverTrail(order) {
    return !shouldHidePassedSegment(order);
}

function buildTrackingProgressSteps(order) {
    var isProductOrder = !!(order && (order.skillType === 'js_food' || order.sellerId));
    var isAntar = !!(order && order.skillType === 'js_antar');
    var isDelivery = !!(order && order.skillType === 'js_delivery');
    if (isProductOrder) {
        return [
            { key: 'pending_seller', icon: '🧾', text: 'Menunggu penjual menerima pesanan' },
            { key: 'preparing', icon: '👨‍🍳', text: 'Penjual menyiapkan pesanan' },
            { key: 'searching', icon: '🔎', text: 'Mencari driver terdekat' },
            { key: 'pending', icon: '📲', text: 'Menunggu driver menerima order' },
            { key: 'accepted', icon: '✅', text: 'Driver menerima pesanan' },
            { key: 'on_the_way', icon: '🏍️', text: 'Driver menuju lokasi toko' },
            { key: 'arrived', icon: '🏪', text: 'Driver tiba di toko' },
            { key: 'in_progress', icon: '🛵', text: 'Driver menuju lokasimu' },
            { key: 'completed', icon: '📦', text: 'Pesanan sampai ke pembeli' },
            { key: 'rated', icon: '⭐', text: 'Pesanan selesai dinilai' }
        ];
    }
    if (isDelivery) {
        return [
            { key: 'searching', icon: '🔎', text: 'Mencari driver delivery terdekat' },
            { key: 'pending', icon: '📲', text: 'Menunggu driver menerima order delivery' },
            { key: 'accepted', icon: '✅', text: 'Driver menerima order delivery' },
            { key: 'on_the_way', icon: '🛵', text: 'Driver menuju titik jemput barang' },
            { key: 'arrived', icon: '📍', text: 'Driver tiba di titik jemput barang' },
            { key: 'in_progress', icon: '📦', text: 'Barang diantar ke titik tujuan' },
            { key: 'completed', icon: '🏁', text: 'Barang sampai di titik antar' },
            { key: 'rated', icon: '⭐', text: 'Pesanan delivery selesai dinilai' }
        ];
    }
    if (isAntar) {
        return [
            { key: 'searching', icon: '🔎', text: 'Mencari driver terdekat' },
            { key: 'pending', icon: '📲', text: 'Menunggu konfirmasi driver' },
            { key: 'accepted', icon: '✅', text: 'Driver menerima pesanan' },
            { key: 'on_the_way', icon: '🏍️', text: 'Driver menuju titik jemput' },
            { key: 'arrived', icon: '📍', text: 'Driver tiba di titik jemput' },
            { key: 'in_progress', icon: '🛵', text: 'Menuju titik antar' },
            { key: 'completed', icon: '🏁', text: 'Pesanan Anda telah selesai' },
            { key: 'rated', icon: '⭐', text: 'Pesanan selesai dinilai' }
        ];
    }
    return [
        { key: 'searching', icon: '🔎', text: isAntar ? 'Mencari driver terdekat' : 'Mencari talent terdekat' },
        { key: 'pending', icon: '📲', text: 'Menunggu konfirmasi' },
        { key: 'accepted', icon: '✅', text: isAntar ? 'Driver menerima pesanan' : 'Talent menerima pesanan' },
        { key: 'on_the_way', icon: '🏍️', text: isAntar ? 'Driver menuju lokasi Anda' : 'Talent menuju lokasi Anda' }
    ];
}

var _trackingProgressState = {
    byOrder: {},
    timer: null
};

function getTrackingPhaseIndex(status) {
    if (['pending_seller', 'searching', 'pending'].indexOf(status) >= 0) return 0;
    if (['preparing', 'accepted', 'on_the_way'].indexOf(status) >= 0) return 1;
    if (['arrived', 'in_progress'].indexOf(status) >= 0) return 2;
    if (['completed', 'rated'].indexOf(status) >= 0) return 3;
    return 0;
}

function animateTrackingProgressRow(rowEl, activeStepEl, shouldAnimate) {
    if (!rowEl || !activeStepEl) return;

    var targetTop = activeStepEl.offsetTop - Math.max(0, (rowEl.clientHeight - activeStepEl.offsetHeight) / 2);
    var maxTop = Math.max(0, rowEl.scrollHeight - rowEl.clientHeight);
    if (targetTop < 0) targetTop = 0;
    if (targetTop > maxTop) targetTop = maxTop;

    if (shouldAnimate && typeof rowEl.scrollTo === 'function') {
        rowEl.classList.add('moving-next');
        rowEl.scrollTo({ top: targetTop, behavior: 'smooth' });
        setTimeout(function () { rowEl.classList.remove('moving-next'); }, 420);
    } else {
        rowEl.scrollTop = targetTop;
    }
}

function renderTrackingProgress(order) {
    var wrap = document.getElementById('otpProgressWrap');
    var track = document.getElementById('otpProgressTrack');
    if (!wrap || !track || !order) return;

    var steps = buildTrackingProgressSteps(order);
    var activeIdx = 0;
    for (var i = 0; i < steps.length; i++) {
        if (steps[i].key === order.status) { activeIdx = i; break; }
    }
    var currentStep = steps[activeIdx] || steps[0] || { icon: '📦', text: 'Memproses pesanan' };
    
    // Create mock ETA
    var date = new Date((Number(order.createdAt) || Date.now()));
    date.setMinutes(date.getMinutes() + 15);
    var h1 = String(date.getHours()).padStart(2, '0');
    var m1 = String(date.getMinutes()).padStart(2, '0');
    date.setMinutes(date.getMinutes() + 10);
    var h2 = String(date.getHours()).padStart(2, '0');
    var m2 = String(date.getMinutes()).padStart(2, '0');
    var etaText = 'Estimasi tiba ' + h1 + ':' + m1 + ' - ' + h2 + ':' + m2;
    if (order.status === 'completed' || order.status === 'rated') {
        etaText = 'Pesanan Anda telah selesai';
    }

    var currentPhaseIdx = getTrackingPhaseIndex(order.status);

    var orderKey = String(order.id || 'unknown');
    var prevStatus = _trackingProgressState.byOrder[orderKey];
    var prevPhaseIdx = getTrackingPhaseIndex(prevStatus || '');
    var isStatusChanged = !!(prevStatus && prevStatus !== order.status);
    _trackingProgressState.byOrder[orderKey] = order.status;

    var barHtml = '';
    for (var j = 0; j < 4; j++) {
        var stateClass = j < currentPhaseIdx ? 'done' : (j === currentPhaseIdx ? 'active' : 'inactive');
        barHtml += '<div class="sf-progress-step ' + stateClass + '"><div class="sf-progress-step-icon"></div></div>';
    }
    
    var percent = Math.min(100, Math.max(0, currentPhaseIdx * 33.33));

    var hintText = (['completed', 'rated'].indexOf(order.status) >= 0) ? 'Sudah sampai tujuan' : 'Kami akan memberitahu kamu saat pesanan berstatus baru';
    var iconIllustration = '🍳';
    if (currentStep.icon && currentStep.icon.length < 5) iconIllustration = currentStep.icon;
    if (order.status === 'preparing') iconIllustration = '👨‍🍳';
    if (order.status === 'in_progress') iconIllustration = '🛵';

    var progressRatio = Math.min(1, Math.max(0, percent / 100));
    var isTerminal = (order.status === 'completed' || order.status === 'rated');

    var html = '<div class="sf-status-header">'
        + '<div><div class="sf-status-eta">' + etaText + '</div>'
        + '<div class="sf-status-main-text">' + escapeHtml(currentStep.text) + '</div></div>'
        + '<div class="sf-status-icon-illustration">' + iconIllustration + '</div>'
        + '</div>'
        + '<div class="sf-progress-bar">'
        + '<div class="sf-progress-bar-fill" style="--progress:' + progressRatio + '"></div>'
        + barHtml
        + '</div>'
        + '<div class="sf-progress-hint">' + hintText + '</div>';

    track.innerHTML = html;
    wrap.classList.remove('hidden');
    wrap.classList.toggle('is-terminal', isTerminal);

    if (isStatusChanged) {
        wrap.classList.remove('is-status-transition', 'is-forward', 'is-backward');
        wrap.classList.add('is-status-transition');
        wrap.classList.add(currentPhaseIdx >= prevPhaseIdx ? 'is-forward' : 'is-backward');

        if (_trackingProgressState.timer) clearTimeout(_trackingProgressState.timer);
        _trackingProgressState.timer = setTimeout(function () {
            wrap.classList.remove('is-status-transition', 'is-forward', 'is-backward');
        }, 620);
    }
}

function destroyTrackingMap() {
    if (_otpMap) { _otpMap.remove(); _otpMap = null; }
    _otpTalentMarker = null;
    _otpUserMarker = null;
    _otpStoreMarker = null;
    _otpRouteLine = null;
    _otpRouteFlowLine = null;
    _otpDriverTrailLayers = [];
    _otpDriverTrailPoints = [];
    _otpLastTalentPos = null;
    _otpLastTalentTs = 0;
    _otpSpeedKmh = 0;
    _otpLastRouteRedrawPos = null;
    _otpLastRouteRedrawTs = 0;
    _otpLockedUserPos = null;
    _otpLockedUserOrderId = '';
    _otpEtaMin = 0;
    _otpAutoFollowPausedUntil = 0;
}

function updateTrackingVisualState(order) {
    var mapEl = document.getElementById('otpMapContainer');
    var mapWrap = mapEl ? mapEl.parentElement : null;
    var progressWrap = document.getElementById('otpProgressWrap');
    if (!mapEl || !progressWrap || !order) return;

    renderTrackingProgress(order);
    progressWrap.classList.remove('hidden');

    var showMap = shouldShowTrackingMap(order);
    if (showMap) {
        mapEl.classList.remove('hidden');
        if (mapWrap) mapWrap.classList.remove('map-hidden');
        renderTrackingMapRouteCard(order);
        if (!_otpMap) initTrackingMap(order);
        else setTimeout(function () {
            if (_otpMap) {
                _otpMap.invalidateSize();
                bindTrackingMapPremiumEffects();
                updateTrackingMapDepthClass();
            }
        }, 120);
    } else {
        mapEl.classList.add('hidden');
        if (mapWrap) mapWrap.classList.add('map-hidden');
        renderTrackingMapRouteCard(null);
        destroyTrackingMap();
    }
}

function renderTrackingMapRouteCard(order, animate) {
    var card = document.getElementById('otpMapRouteCard');
    if (!card) return;
    if (!order) {
        card.classList.add('hidden');
        card.innerHTML = '';
        return;
    }

    var users = getUsers();
    var buyer = users.find(function (u) { return String(u.id) === String(order.userId); }) || null;
    var seller = users.find(function (u) { return String(u.id) === String(order.sellerId); }) || null;
    var isProductOrder = !!(order.skillType === 'js_food' || order.sellerId);
    var isAntar = order.skillType === 'js_antar';
    var isDelivery = order.skillType === 'js_delivery';
    var isRideFlow = isAntar || isDelivery;
    var storeName = String(order.storeName || (seller && seller.name) || 'Toko').trim();
    var storeAddr = String(order.storeAddr || (seller && seller.address) || '').trim();

    var pickupAddress = isProductOrder ? (storeAddr || 'Lokasi toko') : String(order.userAddr || 'Lokasi jemput').trim();
    var dropAddress = isRideFlow
        ? String(order.destAddr || order.userAddr || 'Lokasi antar').trim()
        : String((buyer && buyer.address) || order.userAddr || 'Lokasi pembeli').trim();

    var pickupTitle = isProductOrder
        ? ('Ambil di ' + storeName)
        : (isDelivery ? 'Titik Jemput Barang' : 'Titik Jemput');
    var dropTitle = isProductOrder
        ? ((buyer && buyer.name) ? ('Antar ke ' + buyer.name) : 'Lokasi Pembeli')
        : (isDelivery ? 'Titik Antar Barang' : 'Titik Antar');

    var deliveryStage = '';
    if (isDelivery) {
        if (order.status === 'on_the_way') deliveryStage = 'Menuju Jemput';
        else if (order.status === 'arrived') deliveryStage = 'Pickup Barang';
        else if (order.status === 'in_progress') deliveryStage = 'Menuju Antar';
        else if (order.status === 'completed' || order.status === 'rated') deliveryStage = 'Terkirim';
    }

    var speedLabel = _otpSpeedKmh > 2 ? (Math.round(_otpSpeedKmh) + ' km/j') : '';
    var etaLabel = _otpEtaMin > 0 ? (_otpEtaMin + ' mnt') : '';
    var followOn = Date.now() >= _otpAutoFollowPausedUntil;
    card.innerHTML = '<div class="otp-map-top-row">'
        + '<span class="otp-map-top-icon pickup">↑</span>'
        + '<div class="otp-map-top-text">'
        + '<div class="otp-map-top-title">' + escapeHtml(pickupTitle) + '</div>'
        + '<div class="otp-map-top-address">' + escapeHtml(pickupAddress) + '</div>'
        + '</div>'
        + '</div>'
        + '<div class="otp-map-top-divider"></div>'
        + '<div class="otp-map-top-row">'
        + '<span class="otp-map-top-icon dropoff"></span>'
        + '<div class="otp-map-top-text">'
        + '<div class="otp-map-top-title">' + escapeHtml(dropTitle) + '</div>'
        + '<div class="otp-map-top-address">' + escapeHtml(dropAddress) + '</div>'
        + '</div>'
        + '<span class="otp-speed-badge' + (speedLabel ? '' : ' hidden') + '">⚡ ' + escapeHtml(speedLabel) + '</span>'
        + '<span class="otp-eta-badge' + (etaLabel ? '' : ' hidden') + '">⏱ ' + escapeHtml(etaLabel) + '</span>'
        + '<span class="otp-delivery-chip' + (deliveryStage ? '' : ' hidden') + '">📦 ' + escapeHtml(deliveryStage) + '</span>'
        + '<span class="otp-follow-badge' + (followOn ? '' : ' paused') + '">' + (followOn ? '📍 Auto' : '✋ Pause') + '</span>'
        + '</div>';
    card.classList.remove('hidden');
    if (animate !== false) {
        card.classList.remove('map-card-refresh');
        void card.offsetWidth;
        card.classList.add('map-card-refresh');
    }
}

var _otpLastTalentPos = null;
var _otpLastTalentTs = 0;
var _otpSpeedKmh = 0;
var _otpLastRouteRedrawPos = null;
var _otpLastRouteRedrawTs = 0;
var _otpLockedUserPos = null;
var _otpLockedUserOrderId = '';
var _otpAutoFollowPausedUntil = 0;
var _otpEtaMin = 0;
var _otpDriverTrailPoints = [];
var _otpDriverTrailLayers = [];
var DRIVER_MARKER_HEADING_OFFSET_DEG = -42;
var DRIVER_MARKER_HEADING_MIN_MOVE_KM = 0.003;
var DRIVER_JUMP_REJECT_KM = 0.35;
var DRIVER_JUMP_REJECT_SPEED_KMH = 120;
var DRIVER_SMOOTH_DIST_KM = 0.015;
var DRIVER_ROUTE_REDRAW_MIN_MOVE_KM = 0.03;
var DRIVER_ROUTE_REDRAW_MAX_WAIT_MS = 12000;

function updateTrackingMapDepthClass() {
    var mapEl = document.getElementById('otpMapContainer');
    var wrap = mapEl ? mapEl.parentElement : null;
    if (!wrap || !_otpMap) return;
    var zoom = _otpMap.getZoom();
    wrap.classList.remove('map-zoom-near', 'map-zoom-far');
    if (zoom >= 16) wrap.classList.add('map-zoom-near');
    else if (zoom <= 13) wrap.classList.add('map-zoom-far');
}

function bindTrackingMapPremiumEffects() {
    var mapEl = document.getElementById('otpMapContainer');
    var wrap = mapEl ? mapEl.parentElement : null;
    if (!wrap || !_otpMap || _otpMap._premiumFxBound) return;
    _otpMap._premiumFxBound = true;

    var collapseTimer = null;
    function collapseOnMove(e) {
        wrap.classList.add('map-card-collapsed');
        if (collapseTimer) clearTimeout(collapseTimer);
        if (e && e.originalEvent) {
            var kind = String(e.originalEvent.type || '');
            var pauseMs = 8000;
            if (kind.indexOf('wheel') >= 0) pauseMs = 5000;
            else if (kind.indexOf('touch') >= 0) pauseMs = 12000;
            _otpAutoFollowPausedUntil = Date.now() + pauseMs;
        }
    }
    function expandAfterMove() {
        if (collapseTimer) clearTimeout(collapseTimer);
        collapseTimer = setTimeout(function () {
            wrap.classList.remove('map-card-collapsed');
        }, 220);
    }

    _otpMap.on('zoomend', updateTrackingMapDepthClass);
    _otpMap.on('movestart', collapseOnMove);
    _otpMap.on('moveend', expandAfterMove);
    updateTrackingMapDepthClass();
}

function setDriverMarkerHeading(fromLat, fromLng, toLat, toLng) {
    if (!_otpTalentMarker || !isValidLatLng(fromLat, fromLng) || !isValidLatLng(toLat, toLng)) return;
    var markerEl = _otpTalentMarker.getElement();
    if (!markerEl) return;
    var iconEl = markerEl.querySelector('.gm-driver-marker-img');
    if (!iconEl) return;

    var movedKm = haversineDistance(fromLat, fromLng, toLat, toLng);
    if (!isFinite(movedKm) || movedKm < DRIVER_MARKER_HEADING_MIN_MOVE_KM) return;

    var lat1 = Number(fromLat) * Math.PI / 180;
    var lat2 = Number(toLat) * Math.PI / 180;
    var dLon = (Number(toLng) - Number(fromLng)) * Math.PI / 180;
    if (!isFinite(lat1) || !isFinite(lat2) || !isFinite(dLon)) return;

    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    if (!isFinite(x) || !isFinite(y) || (Math.abs(x) < 0.00000001 && Math.abs(y) < 0.00000001)) return;

    var bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    var targetHeading = bearing + DRIVER_MARKER_HEADING_OFFSET_DEG;
    var prevHeading = Number(iconEl.dataset.headingDeg);
    if (isFinite(prevHeading)) {
        var delta = targetHeading - prevHeading;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        targetHeading = prevHeading + delta;
    }

    var speedKmh = Number(_otpSpeedKmh) || 0;
    var headingDur = speedKmh < 3 ? 0.36 : (speedKmh < 20 ? 0.28 : 0.2);
    iconEl.dataset.headingDeg = String(targetHeading);
    iconEl.style.setProperty('--heading-dur', String(headingDur) + 's');
    iconEl.style.setProperty('--heading', String(targetHeading) + 'deg');
}

function clearDriverTrailLayers() {
    if (!_otpMap || !_otpDriverTrailLayers || _otpDriverTrailLayers.length === 0) return;
    _otpDriverTrailLayers.forEach(function (ly) {
        try { _otpMap.removeLayer(ly); } catch (e) {}
    });
    _otpDriverTrailLayers = [];
}

function renderDriverTrail() {
    if (!_otpMap) return;
    clearDriverTrailLayers();
    if (!_otpDriverTrailPoints || _otpDriverTrailPoints.length < 2) return;

    var p = _otpDriverTrailPoints;
    var chunks = [
        { pts: p.slice(Math.max(0, p.length - 20), Math.max(0, p.length - 12)), weight: 3, opacity: 0.16, color: '#93C5FD' },
        { pts: p.slice(Math.max(0, p.length - 13), Math.max(0, p.length - 6)), weight: 4, opacity: 0.28, color: '#60A5FA' },
        { pts: p.slice(Math.max(0, p.length - 7)), weight: 5, opacity: 0.42, color: '#2563EB' }
    ];

    chunks.forEach(function (chunk) {
        if (!chunk.pts || chunk.pts.length < 2) return;
        var layer = L.polyline(chunk.pts, {
            color: chunk.color,
            weight: chunk.weight,
            opacity: chunk.opacity,
            lineJoin: 'round',
            lineCap: 'round'
        }).addTo(_otpMap);
        _otpDriverTrailLayers.push(layer);
    });
}

function pushDriverTrailPoint(lat, lng) {
    var point = [Number(lat), Number(lng)];
    if (!isValidLatLng(point[0], point[1])) return;

    var last = _otpDriverTrailPoints.length > 0 ? _otpDriverTrailPoints[_otpDriverTrailPoints.length - 1] : null;
    if (last && haversineDistance(last[0], last[1], point[0], point[1]) < 0.005) return;

    _otpDriverTrailPoints.push(point);
    if (_otpDriverTrailPoints.length > 20) _otpDriverTrailPoints = _otpDriverTrailPoints.slice(_otpDriverTrailPoints.length - 20);
    renderDriverTrail();
}

function shouldAutoFollowDriver(lat, lng) {
    if (!_otpMap || Date.now() < _otpAutoFollowPausedUntil) return false;
    var centerBounds = _otpMap.getBounds().pad(-0.28);
    return !centerBounds.contains([Number(lat), Number(lng)]);
}

function closeTrackingToHome() {
    var orderSnapshot = _currentOrder ? Object.assign({}, _currentOrder) : null;
    var page = document.getElementById('orderTrackingPage');
    if (page) page.classList.add('hidden');
    stopPolling();
    resetBottomNavToHome();
    maybePromptRatingAfterCompleted(orderSnapshot);
}

function isTrackingTerminalStatus(status) {
    return ['completed', 'rated', 'cancelled', 'rejected'].indexOf(status) >= 0;
}

function refreshTrackingUIFromCurrentOrder() {
    if (!_currentOrder) return;
    var session = getSession();
    var isTalent = session && String(session.id) === String(_currentOrder.talentId);
    var isUser = session && String(session.id) === String(_currentOrder.userId);

    renderOrderActions(_currentOrder, isTalent, isUser);
    renderOrderInfo(_currentOrder, isTalent);
    updateTrackingVisualState(_currentOrder);
}

function maybePromptRatingAfterCompleted(order) {
    if (!order) return;
    var session = getSession();
    if (!session || String(session.id) !== String(order.userId)) return;
    if (order.status !== 'completed') return;
    if (Number(order.rating) > 0) return;

    var key = 'js_rating_prompt_seen_' + order.id;
    try {
        if (localStorage.getItem(key) === '1') return;
        localStorage.setItem(key, '1');
    } catch (e) {}

    var promptMsg = order.sellerId
        ? 'Pesanan selesai. Mau beri rating untuk driver dan penjual sekarang?'
        : 'Pesanan selesai. Mau beri rating untuk driver sekarang?';

    setTimeout(function () {
        openModernConfirm({
            title: 'Pesanan Selesai',
            message: promptMsg
        }).then(function (ok) {
            if (!ok) return;
            openRatingPage(order);
        });
    }, 250);
}

var _ratingReminderTimer = null;
var _ratingReminderOrders = [];
var _ratingReminderLoading = false;
var _ratingReminderWatcherBound = false;

function _getVisibleBottomNav() {
    var navs = document.querySelectorAll('.bottom-nav');
    for (var i = 0; i < navs.length; i++) {
        var nav = navs[i];
        var page = nav.closest('.page');
        if (!page || !page.classList.contains('hidden')) return nav;
    }
    return null;
}

function _isRatingReminderSnoozed() {
    try {
        var until = Number(localStorage.getItem('js_unrated_reminder_snooze_until') || 0);
        return until > Date.now();
    } catch (e) {
        return false;
    }
}

function _snoozeRatingReminder(minutes) {
    var ms = Math.max(1, Number(minutes || 20)) * 60 * 1000;
    try { localStorage.setItem('js_unrated_reminder_snooze_until', String(Date.now() + ms)); } catch (e) {}
}

function _ensureRatingReminderEl() {
    var el = document.getElementById('ratingReminderFloat');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'ratingReminderFloat';
    el.className = 'rating-reminder hidden';
    el.innerHTML = [
        '<div class="rating-reminder-card">',
            '<div class="rating-reminder-head">',
                '<span class="rating-reminder-dot"></span>',
                '<strong id="ratingReminderTitle">Masih ada pesanan belum dirating</strong>',
            '</div>',
            '<div class="rating-reminder-sub" id="ratingReminderSub">Bantu kami jaga kualitas layanan dengan memberi rating.</div>',
            '<div class="rating-reminder-actions">',
                '<button type="button" class="rating-reminder-btn ghost" id="ratingReminderLater">Nanti</button>',
                '<button type="button" class="rating-reminder-btn solid" id="ratingReminderOpen">Beri Rating</button>',
            '</div>',
        '</div>'
    ].join('');
    document.body.appendChild(el);

    var laterBtn = document.getElementById('ratingReminderLater');
    if (laterBtn) {
        laterBtn.addEventListener('click', function () {
            _snoozeRatingReminder(20);
            el.classList.add('hidden');
        });
    }

    var openBtn = document.getElementById('ratingReminderOpen');
    if (openBtn) {
        openBtn.addEventListener('click', function () {
            if (!_ratingReminderOrders || !_ratingReminderOrders.length) return;
            var target = _ratingReminderOrders[0];
            if (!target) return;
            if (typeof openRatingPage === 'function') openRatingPage(target);
        });
    }

    return el;
}

function _setUnratedOrderNavBadgeCount(count) {
    var c = Math.max(0, Number(count || 0));
    var labels = document.querySelectorAll('.bottom-nav .nav-item[data-page="pesanan"]');
    labels.forEach(function (item) {
        var badge = item.querySelector('.order-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'order-badge';
            badge.style.display = 'none';
            item.appendChild(badge);
        }

        if (c > 0) {
            badge.textContent = c > 99 ? '99+' : String(c);
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
            badge.textContent = '0';
        }
    });
}

function _applyRatingReminderData(unratedOrders, options) {
    options = options || {};
    var el = _ensureRatingReminderEl();
    var nav = _getVisibleBottomNav();
    var titleEl = document.getElementById('ratingReminderTitle');
    var subEl = document.getElementById('ratingReminderSub');
    var count = Array.isArray(unratedOrders) ? unratedOrders.length : 0;
    _setUnratedOrderNavBadgeCount(count);

    if (!count || !nav || options.hideFloat) {
        el.classList.add('hidden');
        return;
    }

    var first = unratedOrders[0] || {};
    var service = first.serviceType || first.skillType || 'Pesanan';
    if (titleEl) titleEl.textContent = count === 1
        ? '1 pesanan belum dirating'
        : (count + ' pesanan belum dirating');
    if (subEl) subEl.textContent = 'Terbaru: ' + service + '. Rating Anda bantu kualitas driver/seller.';

    el.classList.remove('hidden');
}

function refreshUnratedRatingReminder(options) {
    options = options || {};
    var session = getSession();
    if (!session || session.role !== 'user') {
        var offEl = document.getElementById('ratingReminderFloat');
        if (offEl) offEl.classList.add('hidden');
        _setUnratedOrderNavBadgeCount(0);
        return;
    }
    if (!isBackendConnected()) return;
    var hideFloatBySnooze = !options.ignoreSnooze && _isRatingReminderSnoozed();
    if (_ratingReminderLoading) return;

    _ratingReminderLoading = true;
    FB.get('getOrdersByUser', { userId: session.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (!res || !res.success || !Array.isArray(res.data)) {
                _ratingReminderOrders = [];
                _applyRatingReminderData([], { hideFloat: true });
                return;
            }

            var unrated = res.data.filter(function (o) {
                if (String(o.userId || '') !== String(session.id || '')) return false;
                if (String(o.status || '') !== 'completed') return false;
                var hasRating = (Number(o.rating || 0) > 0) || Number(o.ratedAt || 0) > 0;
                return !hasRating;
            }).sort(function (a, b) {
                return Number(b.completedAt || b.updatedAt || b.createdAt || 0) - Number(a.completedAt || a.updatedAt || a.createdAt || 0);
            });

            _ratingReminderOrders = unrated;
            _applyRatingReminderData(unrated, { hideFloat: hideFloatBySnooze });
        })
        .catch(function () {})
        .finally(function () {
            _ratingReminderLoading = false;
        });
}

function startUnratedRatingReminderWatcher() {
    if (_ratingReminderTimer) return;

    refreshUnratedRatingReminder();
    _ratingReminderTimer = setInterval(function () {
        refreshUnratedRatingReminder();
    }, 45000);

    if (!_ratingReminderWatcherBound) {
        _ratingReminderWatcherBound = true;
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) refreshUnratedRatingReminder();
        });
    }
}
window.refreshUnratedRatingReminder = refreshUnratedRatingReminder;

function updateOrderStatusBadge(status) {
    var badge = document.getElementById('otpStatus');
    if (!badge) return;
    var isAntar = _currentOrder && _currentOrder.skillType === 'js_antar';
    var isDelivery = _currentOrder && _currentOrder.skillType === 'js_delivery';
    var isProductOrder = _currentOrder && (_currentOrder.skillType === 'js_food' || _currentOrder.sellerId);
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
    } : isDelivery ? {
        searching: 'Mencari Driver Delivery...',
        pending: 'Menunggu Konfirmasi Driver',
        accepted: 'Driver Delivery Ditemukan',
        on_the_way: 'Driver Menuju Titik Jemput',
        arrived: 'Driver di Titik Jemput',
        in_progress: 'Barang Menuju Titik Antar',
        completed: 'Barang Terkirim',
        rated: 'Sudah Dinilai',
        cancelled: 'Dibatalkan',
        rejected: 'Ditolak'
    } : isProductOrder ? {
        pending_seller: 'Menunggu Penjual...',
        preparing: 'Penjual Menyiapkan...',
        searching: 'Mencari Driver...',
        pending: 'Menunggu Driver',
        accepted: 'Driver Ditemukan',
        on_the_way: 'Driver Menuju Toko',
        arrived: 'Driver di Toko',
        in_progress: 'Diantar ke Anda',
        completed: 'Pesanan Sampai',
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

    function normalizeOrderItems(rawItems) {
        var items = rawItems;
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch (e) { items = []; }
        }
        if (!Array.isArray(items)) return [];
        return items.filter(function (it) { return it && typeof it === 'object'; });
    }

    function getOrderItemPhoto(item) {
        if (!item) return '';
        return String(item.photo || item.image || item.photoUrl || item.imageUrl || item.thumbnail || '').trim();
    }

    function resolveAvatarUrl(raw) {
        if (!raw) return '';
        var src = String(raw || '').trim();
        if (!src) return '';
        if (src.indexOf('http://') === 0 || src.indexOf('https://') === 0 || src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) return src;
        try {
            if (window.FB && window.FB._sb && window.FB._sb.storage) {
                var res = window.FB._sb.storage.from('avatars').getPublicUrl(src);
                if (res && res.data && res.data.publicUrl) return res.data.publicUrl;
            }
        } catch (e) {}
        return src;
    }

    function getUserPhoto(u, preferSkillSelfie) {
        if (!u) return '';
        var p = u.photo || u.foto_url || getProfilePhoto(u.id) || '';
        if (!p && preferSkillSelfie) {
            var tSkills = getUserSkills(u.id);
            if (tSkills && tSkills.length > 0) {
                for (var si = 0; si < tSkills.length; si++) {
                    if (tSkills[si].selfieThumb) {
                        p = tSkills[si].selfieThumb;
                        break;
                    }
                }
            }
        }
        return p;
    }

    function buildDriverCardHtml(u, title, subtitle, isHighlight, chatBtnId, ratingStr, displayName, displayPhoto) {
        if (!u) return '';
        var name = displayName || u.name || 'Kontak';
        var photo = displayPhoto || getUserPhoto(u, isHighlight);
        var initial = (name || '?').charAt(0).toUpperCase();
        var photoSrc = resolveAvatarUrl(photo);
        var photoHtml = photoSrc ? '<img src="' + _escapeHtml(photoSrc) + '" alt="">' : '<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#eee;color:#999;font-size:20px;font-weight:bold;">' + _escapeHtml(initial) + '</span>';

        return '<div class="sf-driver-card">'
            + '<div class="sf-driver-avatar" data-initial="' + _escapeHtml(initial) + '">' + photoHtml + '</div>'
            + '<div class="sf-driver-info">'
            + '<div class="sf-driver-name">' + escapeHtml(name) + ' (' + escapeHtml(title) + ')</div>'
            + '<div class="sf-driver-meta">'
            + '<span>' + escapeHtml(subtitle) + '</span>'
            + (ratingStr ? '<span class="sf-driver-rating" id="otpDriverRating-' + order.id + '">' + ratingStr + '</span>' : '')
            + '</div>'
            + '</div>'
            + '<div class="sf-driver-actions">'
            + (chatBtnId ? '<button class="sf-driver-btn chat" id="' + chatBtnId + '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' : '')
            + '<button class="sf-driver-btn" onclick="window.location.href=\'tel:' + (u.phone || '0') + '\'"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
            + '</div>'
            + '</div>';
    }

    var users = getUsers();
    var session = getSession();
    var isSeller = session && session.id === order.sellerId;
    var isUser = session && session.id === order.userId;
    var other = users.find(function (u) { return u.id === (isTalent ? order.userId : order.talentId); });
    var seller = users.find(function (u) { return u.id === order.sellerId; });
    var buyer = users.find(function (u) { return u.id === order.userId; });
    var cachedStore = null;
    if (typeof _slpAllStores !== 'undefined' && Array.isArray(_slpAllStores) && _slpAllStores.length > 0) {
        cachedStore = _slpAllStores.find(function (s) {
            return String(s.id) === String(order.storeId || '') || String(s.userId) === String(order.sellerId || '');
        }) || null;
    }
    var storeName = String(order.storeName || (cachedStore && cachedStore.name) || (seller && seller.name) || 'Toko').trim();
    var storeAddr = String(order.storeAddr || (cachedStore && cachedStore.address) || (seller && seller.address) || 'Toko').trim();
    var storePhoto = String(order.storePhoto || (cachedStore && cachedStore.photo) || '').trim();
    var subtotalAmount = Math.max(0, Number(order.price) || 0);
    var deliveryFeeAmount = Math.max(0, Number(order.deliveryFee) || 0);
    var platformFeeAmount = Math.max(0, Number(order.fee) || 0);
    var explicitDiscount = Math.max(0, Number(order.discountAmount || order.discount || order.voucherDiscount || 0));
    var computedTotal = subtotalAmount + deliveryFeeAmount + platformFeeAmount - explicitDiscount;
    var totalAmount = Number(order.totalCost);
    if (!isFinite(totalAmount) || totalAmount <= 0) totalAmount = computedTotal;

    var inferredDiscount = 0;
    var beforeDiscountTotal = subtotalAmount + deliveryFeeAmount + platformFeeAmount;
    if (explicitDiscount > 0) {
        inferredDiscount = explicitDiscount;
    } else if (beforeDiscountTotal > 0 && totalAmount > 0 && totalAmount < beforeDiscountTotal) {
        inferredDiscount = beforeDiscountTotal - totalAmount;
    }

    var priceText = formatRupiah(subtotalAmount);
    var totalText = formatRupiah(Math.max(0, totalAmount));
    var addrText = order.userAddr || 'Tidak tersedia';
    var isAntar = order.skillType === 'js_antar';
    var userRoleLabel = isAntar ? 'Penumpang' : 'Pembeli';
    var pmLabel = order.paymentMethod === 'cod' ? 'Tunai (COD)' : 'JsPay';
    var isProductOrder = !!order.sellerId;

    var driverHtml = '';
    if (!isTalent && other && order.talentId) {
        var vehicleLabel = isAntar ? 'Motor' : (order.serviceType || 'Driver');
        var canChatDriver = session && session.id !== order.talentId;
        driverHtml = buildDriverCardHtml(other, 'Driver', vehicleLabel, true, canChatDriver ? 'otpDriverChatBtn' : '', '⭐ 0.0 (0)');
    }

    var sellerHtml = '';
    if (isProductOrder && (isUser || isTalent) && seller) {
        sellerHtml = buildDriverCardHtml(seller, 'Toko', storeAddr || 'Toko', false, 'otpSellerChatBtn', '', storeName || 'Toko', storePhoto);
    }

    var buyerHtml = '';
    if ((isSeller || isTalent) && buyer) {
        buyerHtml = buildDriverCardHtml(buyer, userRoleLabel, buyer.address || '', false, 'otpBuyerChatBtn', '');
    }

    var dropoffTitle = isAntar ? 'Titik Antar' : (buyer ? escapeHtml(buyer.name) : userRoleLabel);
    var dropoffAddress = isAntar && order.destAddr ? order.destAddr : addrText;
    var dropoffPhoneHtml = (!isAntar && buyer && buyer.phone)
        ? '<div class="sf-location-person">' + escapeHtml(buyer.phone || '') + '</div>'
        : '';

    // Location Card
    var locationHtml = '<div class="sf-location-card">'
        + '<div class="sf-location-row">'
        + '<div class="sf-location-label"><div class="sf-loc-dot pickup"></div> Diambil dari</div>'
        + '<div class="sf-location-title">' + (isProductOrder ? escapeHtml(storeName || 'Toko') : 'Titik Jemput') + '</div>'
        + '<div class="sf-location-address">' + (isProductOrder ? escapeHtml(storeAddr || addrText) : escapeHtml(addrText)) + '</div>'
        + '</div>'
        + '<div class="sf-location-row">'
        + '<div class="sf-location-label"><div class="sf-loc-dot dropoff"></div> Diantar ke</div>'
        + '<div class="sf-location-title">' + dropoffTitle + '</div>'
        + '<div class="sf-location-address">' + escapeHtml(dropoffAddress) + '</div>'
        + dropoffPhoneHtml
        + '</div>'
        + '</div>';

    // Order Details Card
    var orderItems = normalizeOrderItems(order.items);
    var orderItemsHtml = '';

    if (orderItems.length > 0) {
        orderItemsHtml = orderItems.map(function (item) {
            var qty = Number(item.qty || item.quantity || 1);
            if (!isFinite(qty) || qty < 1) qty = 1;
            var name = item.name || item.productName || 'Produk';
            var unitPrice = Number(item.price || item.unitPrice || 0);
            var lineTotal = Number(item.totalPrice);
            if (!isFinite(lineTotal) || lineTotal < 0) {
                lineTotal = unitPrice > 0 ? (unitPrice * qty) : 0;
            }
            var photo = getOrderItemPhoto(item);
            var itemImageHtml = photo
                ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(name) + '"/>'
                : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#F8FAFC;color:#94A3B8;font-size:22px;">📦</div>';

            return '<div class="sf-od-item">'
                + '<div class="sf-od-item-img">' + itemImageHtml + '</div>'
                + '<div class="sf-od-item-info">'
                + '<div class="sf-od-qty-name"><span class="sf-od-qty">' + qty + 'x</span><span class="sf-od-name">' + escapeHtml(name) + '</span></div>'
                + '</div>'
                + '<div class="sf-od-item-price-wrap">'
                + '<div class="sf-od-item-price">' + formatRupiah(lineTotal) + '</div>'
                + '</div>'
                + '</div>';
        }).join('');
    } else {
        var fallbackName = order.serviceType || 'Pesanan Layanan';
        var fallbackPhoto = order.proofPhoto ? String(order.proofPhoto) : '';
        var fallbackIcon = isAntar ? '🏍️' : '📦';
        var fallbackImageHtml = fallbackPhoto
            ? '<img src="' + escapeHtml(fallbackPhoto) + '" alt="' + escapeHtml(fallbackName) + '"/>'
            : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#F8FAFC;color:#94A3B8;font-size:22px;">' + fallbackIcon + '</div>';
        orderItemsHtml = '<div class="sf-od-item">'
            + '<div class="sf-od-item-img">' + fallbackImageHtml + '</div>'
            + '<div class="sf-od-item-info">'
            + '<div class="sf-od-qty-name"><span class="sf-od-name">' + escapeHtml(fallbackName) + '</span></div>'
            + '</div>'
            + '<div class="sf-od-item-price-wrap">'
            + '<div class="sf-od-item-price">' + priceText + '</div>'
            + '</div>'
            + '</div>';
    }
    
    var summaryRows = '<div class="sf-od-row subtotal"><span>Subtotal Pesanan</span><span class="sf-od-val">' + priceText + '</span></div>';
    if (deliveryFeeAmount > 0) {
        summaryRows += '<div class="sf-od-row"><span>Biaya Pengantaran</span><span class="sf-od-val">' + formatRupiah(deliveryFeeAmount) + '</span></div>';
    }
    if (platformFeeAmount > 0) {
        summaryRows += '<div class="sf-od-row"><span>Biaya Layanan (Fee)</span><span class="sf-od-val">' + formatRupiah(platformFeeAmount) + '</span></div>';
    }
    if (inferredDiscount > 0) {
        summaryRows += '<div class="sf-od-row discount"><span>Diskon</span><span class="sf-od-val">-' + formatRupiah(inferredDiscount) + '</span></div>';
    }

    var orderDetailsHtml = '<div class="sf-order-details-card">'
        + '<div class="sf-od-header">Rincian Pesanan</div>'
        + orderItemsHtml
        + '<div class="sf-od-summary">'
        + summaryRows
        + '<div class="sf-od-total-sec">'
        + '<div class="sf-od-total-val">' + totalText + '</div>'
        + '<div class="sf-od-total-hint">(Sudah termasuk pajak)</div>'
        + '</div>'
        + '</div>'
        + '</div>';

    var orderDate = new Date(Number(order.createdAt) || Date.now());
    function pad(n) { return n < 10 ? '0' + n : n; }
    var formattedDate = pad(orderDate.getDate()) + ' ' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'][orderDate.getMonth()] + ' ' + orderDate.getFullYear() + ' ' + pad(orderDate.getHours()) + ':' + pad(orderDate.getMinutes());

    var notesText = (order.notes === null || order.notes === undefined) ? '' : String(order.notes).trim();
    var complaintOpen = !!(order.userComplaint || order.userComplaintText || order.userComplaintAt)
        && String(order.complaintStatus || '').toLowerCase() !== 'resolved'
        && String(order.complaintStatus || '').toLowerCase() !== 'closed';
    var complaintResolved = !!(order.userComplaint || order.userComplaintText || order.userComplaintAt)
        && (String(order.complaintStatus || '').toLowerCase() === 'resolved' || String(order.complaintStatus || '').toLowerCase() === 'closed');

    var complaintRow = '';
    if (complaintOpen) {
        complaintRow = '<div class="sf-oi-row"><span class="sf-oi-label">Status Aduan</span><span class="sf-oi-val" style="color:#B91C1C;font-weight:700;">Menunggu tindak lanjut admin</span></div>';
    } else if (complaintResolved) {
        complaintRow = '<div class="sf-oi-row"><span class="sf-oi-label">Status Aduan</span><span class="sf-oi-val" style="color:#166534;font-weight:700;">Sudah ditangani admin</span></div>';
    }

    var orderInfoHtml = '<div class="sf-order-info-block">'
        + '<div class="sf-oi-header">Informasi Pesanan</div>'
        + '<div class="sf-oi-row"><span class="sf-oi-label">Catatan Tambahan</span><span class="sf-oi-val">' + (notesText ? escapeHtml(notesText) : 'Tidak ada') + '</span></div>'
        + complaintRow
        + '<div class="sf-oi-row"><span class="sf-oi-label">No. Pesanan</span><div class="sf-oi-val">' + escapeHtml(order.id).substring(0, 10) + '... <span class="sf-oi-copy" onclick="navigator.clipboard.writeText(\'' + escapeHtml(order.id) + '\')">SALIN</span></div></div>'
        + '<div class="sf-oi-row"><span class="sf-oi-label">Waktu Pemesanan</span><span class="sf-oi-val">' + formattedDate + '</span></div>'
        + '<div class="sf-oi-row"><span class="sf-oi-label">Pembayaran</span><span class="sf-oi-val bold">' + pmLabel + '</span></div>'
        + '</div>';

    el.innerHTML = driverHtml + sellerHtml + buyerHtml + locationHtml + orderDetailsHtml + orderInfoHtml;

    el.querySelectorAll('.sf-driver-avatar img').forEach(function (imgEl) {
        imgEl.addEventListener('error', function () {
            var holder = imgEl.parentNode;
            if (!holder) return;
            var fallbackInitial = holder.getAttribute('data-initial') || '?';
            holder.innerHTML = '<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#eee;color:#999;font-size:20px;font-weight:bold;">' + _escapeHtml(fallbackInitial) + '</span>';
        });
    });

    var driverChatBtn = document.getElementById('otpDriverChatBtn');
    if (driverChatBtn) {
        driverChatBtn.addEventListener('click', function () { openChat(order, order.talentId); });
    }
    var sellerChatBtn = document.getElementById('otpSellerChatBtn');
    if (sellerChatBtn) {
        sellerChatBtn.addEventListener('click', function () { openChat(order, order.sellerId); });
    }
    var buyerChatBtn = document.getElementById('otpBuyerChatBtn');
    if (buyerChatBtn) {
        buyerChatBtn.addEventListener('click', function () { openChat(order, order.userId); });
    }

    if (!isTalent && order.talentId && isBackendConnected()) {
        FB.get('getTalentRating', { talentId: order.talentId })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                var ratingEl = document.getElementById('otpDriverRating-' + order.id);
                if (!ratingEl) return;
                var rating = (res && res.success && res.data) ? res.data : { avg: 0, count: 0 };
                ratingEl.innerHTML = '⭐ ' + Number(rating.avg || 0).toFixed(1) + ' (' + Number(rating.count || 0) + ')';
            })
            .catch(function () {});
    }
}

function shouldShowDriverNavButtons(order) {
    if (!order) return false;
    return ['on_the_way', 'arrived', 'in_progress'].indexOf(order.status) >= 0;
}

function buildDriverNavButtonsHtml(order) {
    if (!shouldShowDriverNavButtons(order)) return '';

    var isProductOrder = !!(order.skillType === 'js_food' || order.sellerId);
    var hasUser = isValidLatLng(order.userLat, order.userLng);
    var storeCoords = getOrderStoreCoords(order);
    var hasStore = !!(storeCoords && isValidLatLng(storeCoords.lat, storeCoords.lng));

    if (isProductOrder) {
        if (!hasStore && !hasUser) return '';
        return '<div class="sf-btn-row" style="margin-bottom:12px;">'
            + (hasStore ? '<button class="sf-btn-outline" id="otpBtnNavStore">Maps ke Toko</button>' : '')
            + (hasUser ? '<button class="sf-btn-outline" id="otpBtnNavBuyer">Maps ke Pembeli</button>' : '')
            + '</div>';
    }

    if (!hasUser) return '';
    return '<button class="sf-btn-outline" style="width:100%; margin-bottom:12px;" id="otpBtnNavUser">Buka Google Maps</button>';
}

function resolveDriverNavigationTarget(order, targetType) {
    if (!order) return null;
    if (targetType === 'store') {
        var storeCoords = getOrderStoreCoords(order);
        if (storeCoords && isValidLatLng(storeCoords.lat, storeCoords.lng)) {
            return { lat: Number(storeCoords.lat), lng: Number(storeCoords.lng), label: 'toko' };
        }
        return null;
    }
    if (targetType === 'buyer') {
        if (isValidLatLng(order.userLat, order.userLng)) {
            return { lat: Number(order.userLat), lng: Number(order.userLng), label: 'pembeli' };
        }
        return null;
    }
    if (targetType === 'user') {
        if (isValidLatLng(order.userLat, order.userLng)) {
            return { lat: Number(order.userLat), lng: Number(order.userLng), label: 'tujuan' };
        }
        return null;
    }
    return null;
}

function openDriverGoogleMaps(order, targetType) {
    var target = resolveDriverNavigationTarget(order, targetType);
    if (!target) {
        showToast('Koordinat tujuan belum tersedia', 'error');
        return Promise.resolve(false);
    }

    // Open tab synchronously from the click event to avoid popup blockers.
    var navWindow = null;
    try {
        navWindow = window.open('', '_blank');
    } catch (e) {
        navWindow = null;
    }

    function buildUrl(originLat, originLng) {
        return 'https://www.google.com/maps/dir/?api=1'
            + '&origin=' + encodeURIComponent(String(originLat) + ',' + String(originLng))
            + '&destination=' + encodeURIComponent(String(target.lat) + ',' + String(target.lng))
            + '&travelmode=driving'
            + '&dir_action=navigate';
    }

    function navigate(url) {
        if (navWindow && !navWindow.closed) {
            navWindow.location.href = url;
            try { navWindow.focus(); } catch (e) {}
            return;
        }
        var win = window.open(url, '_blank');
        if (!win) window.location.href = url;
    }

    return getCurrentPosition()
        .then(function (pos) { navigate(buildUrl(pos.lat, pos.lng)); return true; })
        .catch(function () {
            var fallbackLat = Number(order.talentLat);
            var fallbackLng = Number(order.talentLng);
            if (!isValidLatLng(fallbackLat, fallbackLng)) {
                fallbackLat = target.lat;
                fallbackLng = target.lng;
            }
            navigate(buildUrl(fallbackLat, fallbackLng));
            return true;
        });
}

function bindDriverNavButtons(order) {
    var btnStore = document.getElementById('otpBtnNavStore');
    if (btnStore) {
        btnStore.addEventListener('click', function () {
            if (btnStore.dataset.busy === '1') return;
            btnStore.dataset.busy = '1';
            btnStore.disabled = true;
            openDriverGoogleMaps(order, 'store').then(function () {
                btnStore.dataset.busy = '0';
                btnStore.disabled = false;
            });
        });
    }

    var btnBuyer = document.getElementById('otpBtnNavBuyer');
    if (btnBuyer) {
        btnBuyer.addEventListener('click', function () {
            if (btnBuyer.dataset.busy === '1') return;
            btnBuyer.dataset.busy = '1';
            btnBuyer.disabled = true;
            openDriverGoogleMaps(order, 'buyer').then(function () {
                btnBuyer.dataset.busy = '0';
                btnBuyer.disabled = false;
            });
        });
    }

    var btnUser = document.getElementById('otpBtnNavUser');
    if (btnUser) {
        btnUser.addEventListener('click', function () {
            if (btnUser.dataset.busy === '1') return;
            btnUser.dataset.busy = '1';
            btnUser.disabled = true;
            openDriverGoogleMaps(order, 'user').then(function () {
                btnUser.dataset.busy = '0';
                btnUser.disabled = false;
            });
        });
    }
}

function _triggerProofPicker(inputEl) {
    if (!inputEl) return false;
    var opened = false;
    try {
        if (typeof inputEl.showPicker === 'function') {
            inputEl.showPicker();
            opened = true;
        }
    } catch (e) {}
    if (!opened) {
        try {
            inputEl.click();
            opened = true;
        } catch (e2) {}
    }
    return opened;
}

function _setCompleteButtonArmedState(btn, armed) {
    if (!btn) return;
    if (armed) {
        btn.dataset.proofReady = '1';
        btn.dataset.baseLabel = btn.dataset.baseLabel || btn.textContent || 'Ambil Foto Validasi';
        btn.textContent = 'Ambil Foto Validasi';
        btn.disabled = false;
        btn.dataset.busy = '0';
        btn.dataset.busySince = '';
        btn.classList.remove('hidden');
        return;
    }
    btn.dataset.proofReady = '0';
    if (btn.dataset.baseLabel) btn.textContent = btn.dataset.baseLabel;
}

function _unlockProofButtonForRetry(buttonId) {
    var btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.dataset.busy = '0';
    btn.dataset.busySince = '';
    _setCompleteButtonArmedState(btn, true);
    if (!btn.classList.contains('hidden')) btn.disabled = false;
}

function _compressProofPhotoSafe(dataUrl, callback) {
    var done = false;
    function finish(resultUrl) {
        if (done) return;
        done = true;
        callback(String(resultUrl || ''));
    }

    function compressWithSettings(sourceUrl, maxDim, quality, cb) {
        var img = new Image();
        img.onload = function () {
            try {
                var canvas = document.createElement('canvas');
                var w = Number(img.width) || 0;
                var h = Number(img.height) || 0;
                if (!w || !h) {
                    cb('');
                    return;
                }
                if (w > maxDim || h > maxDim) {
                    var ratio = Math.min(maxDim / w, maxDim / h);
                    w = Math.max(1, Math.round(w * ratio));
                    h = Math.max(1, Math.round(h * ratio));
                }
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                if (!ctx) {
                    cb('');
                    return;
                }
                ctx.drawImage(img, 0, 0, w, h);
                cb(canvas.toDataURL('image/jpeg', quality));
            } catch (e) {
                cb('');
            }
        };
        img.onerror = function () { cb(''); };
        try {
            img.src = sourceUrl;
        } catch (e2) {
            cb('');
        }
    }

    var source = String(dataUrl || '');
    var sourceIsDataUrl = /^data:image\//i.test(source);
    if (!source) {
        finish('');
        return;
    }

    // Primary path (shared compressor) with a watchdog fallback for webview/camera edge-cases.
    var watchdog = setTimeout(function () {
        compressWithSettings(source, 160, 0.3, function (tiny) {
            finish(tiny || (sourceIsDataUrl ? source : ''));
        });
    }, 2800);

    try {
        compressThumbnail(source, function (thumb) {
            clearTimeout(watchdog);
            var out = String(thumb || '');
            if (!out) {
                compressWithSettings(source, 160, 0.3, function (tiny) {
                    finish(tiny || (sourceIsDataUrl ? source : ''));
                });
                return;
            }
            if (out.length > 420000) {
                compressWithSettings(out, 140, 0.25, function (tiny2) {
                    finish(tiny2 || out);
                });
                return;
            }
            finish(out);
        });
    } catch (err) {
        clearTimeout(watchdog);
        compressWithSettings(source, 160, 0.3, function (tiny3) {
            finish(tiny3 || (sourceIsDataUrl ? source : ''));
        });
    }
}

function _prepareProofPhotoFromFile(file, callback) {
    var done = false;
    function finish(resultUrl) {
        if (done) return;
        done = true;
        callback(String(resultUrl || ''));
    }

    if (!file) {
        finish('');
        return;
    }

    function compressFromReader() {
        try {
            var reader = new FileReader();
            var watchdog = setTimeout(function () {
                finish('');
            }, 12000);

            reader.onload = function () {
                clearTimeout(watchdog);
                _compressProofPhotoSafe(String(reader.result || ''), function (proofThumb) {
                    var out = String(proofThumb || '');
                    finish(/^data:image\//i.test(out) ? out : '');
                });
            };
            reader.onerror = function () {
                clearTimeout(watchdog);
                finish('');
            };
            reader.onabort = function () {
                clearTimeout(watchdog);
                finish('');
            };
            reader.readAsDataURL(file);
        } catch (e) {
            finish('');
        }
    }

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
            var objectUrl = URL.createObjectURL(file);
            var released = false;
            function releaseObjectUrl() {
                if (released) return;
                released = true;
                try { URL.revokeObjectURL(objectUrl); } catch (e) {}
            }

            _compressProofPhotoSafe(objectUrl, function (proofThumb) {
                releaseObjectUrl();
                var out = String(proofThumb || '');
                if (/^data:image\//i.test(out)) {
                    finish(out);
                    return;
                }
                compressFromReader();
            });
            return;
        } catch (e2) {
            // Continue with FileReader fallback.
        }
    }

    compressFromReader();
}

function _processDriverProofSelection(order, file, buttonId) {
    return new Promise(function (resolve) {
        if (!file) {
            _unlockProofButtonForRetry(buttonId);
            resolve(false);
            return;
        }

        showToast('Memproses foto bukti...', 'info');
        _prepareProofPhotoFromFile(file, function (proofThumb) {
            var normalizedThumb = String(proofThumb || '');
            if (!/^data:image\//i.test(normalizedThumb)) {
                _unlockProofButtonForRetry(buttonId);
                showToast('Gagal memproses foto bukti. Coba ambil ulang foto.', 'error');
                resolve(false);
                return;
            }

            var proofInput = document.getElementById('otpProofInput');
            var lat = proofInput ? Number(proofInput.dataset.gpsLat) : NaN;
            var lng = proofInput ? Number(proofInput.dataset.gpsLng) : NaN;
            var doneAt = Date.now();
            if (proofInput) proofInput.dataset.gpsVerified = '';
            if (proofInput) proofInput.dataset.gpsLat = '';
            if (proofInput) proofInput.dataset.gpsLng = '';

            _sendDriverProofToUserChat(order, normalizedThumb).then(function (sentToChat) {
                if (!sentToChat) {
                    _unlockProofButtonForRetry(buttonId);
                    showToast('Bukti foto gagal dikirim ke chat user. Cek koneksi lalu coba lagi.', 'error');
                    resolve(false);
                    return;
                }

                var extraFields = {
                    completedAt: doneAt,
                    proofPhoto: normalizedThumb,
                    proofPhotoInChat: true,
                    proofPhotoAt: doneAt,
                    _skipGpsGate: true
                };
                if (isValidLatLng(lat, lng)) {
                    extraFields.talentLat = lat;
                    extraFields.talentLng = lng;
                    extraFields.talentLastLocationAt = doneAt;
                }
                _finalizeProofCompletion(order, extraFields);
                resolve(true);
            }).catch(function () {
                _unlockProofButtonForRetry(buttonId);
                showToast('Bukti foto gagal dikirim ke chat user. Coba lagi.', 'error');
                resolve(false);
            });
        });
    });
}

function _bindProofInputSelectionHandler(order, buttonId) {
    var proofInput = document.getElementById('otpProofInput');
    if (!proofInput) return;

    function onFileSelected() {
        var liveInput = document.getElementById('otpProofInput');
        if (!liveInput) return;
        var file = (liveInput.files && liveInput.files[0]) ? liveInput.files[0] : null;

        if (!file) {
            _unlockProofButtonForRetry(buttonId);
            return;
        }
        if (liveInput.dataset.proofProcessing === '1') return;
        liveInput.dataset.proofProcessing = '1';

        _processDriverProofSelection(order, file, buttonId).then(function () {
            var currentInput = document.getElementById('otpProofInput');
            if (!currentInput) return;
            currentInput.dataset.proofProcessing = '0';
            currentInput.value = '';
        }).catch(function () {
            var currentInput = document.getElementById('otpProofInput');
            if (currentInput) {
                currentInput.dataset.proofProcessing = '0';
                currentInput.value = '';
            }
            _unlockProofButtonForRetry(buttonId);
            showToast('Gagal membaca foto bukti. Silakan coba lagi.', 'error');
        });
    }

    proofInput.addEventListener('change', onFileSelected);
    proofInput.addEventListener('input', onFileSelected);
}

function _tryOpenProofAfterGpsCheck(btn, proofInput, blockedMsg) {
    if (proofInput) proofInput.dataset.gpsVerified = '1';
    _setCompleteButtonArmedState(btn, true);
    if (!_triggerProofPicker(proofInput)) {
        showToast(blockedMsg || 'Lokasi valid. Ketuk lagi tombol Ambil Foto Validasi untuk membuka kamera.', 'info');
    }
}

function _setProofInputGpsCoords(proofInput, order, verifyMeta) {
    if (!proofInput) return;
    var lat = NaN;
    var lng = NaN;

    if (verifyMeta && isValidLatLng(Number(verifyMeta.gpsLat), Number(verifyMeta.gpsLng))) {
        lat = Number(verifyMeta.gpsLat);
        lng = Number(verifyMeta.gpsLng);
    } else if (order && isValidLatLng(Number(order.talentLat), Number(order.talentLng))) {
        lat = Number(order.talentLat);
        lng = Number(order.talentLng);
    }

    if (isValidLatLng(lat, lng)) {
        proofInput.dataset.gpsLat = String(lat);
        proofInput.dataset.gpsLng = String(lng);
    } else {
        proofInput.dataset.gpsLat = '';
        proofInput.dataset.gpsLng = '';
    }
}

function _canUseKnownGpsForCompletion(order, targetType) {
    var radiusKm = _getDriverGpsGateRadiusKm(order, targetType, 'completed');
    var knownCheck = _checkDriverGpsGateByKnownPosition(order, targetType, radiusKm);
    return !!(knownCheck && knownCheck.ok);
}

function bindActionTap(el, handler) {
    if (!el || typeof handler !== 'function') return;
    var lastInvokeAt = 0;

    function invoke(ev) {
        if (el.disabled) return;
        var now = Date.now();
        if ((now - lastInvokeAt) < 450) return;
        lastInvokeAt = now;
        try {
            handler.call(el, ev);
        } catch (err) {
            console.error('Action tap handler error:', err);
            el.dataset.busy = '0';
            el.dataset.busySince = '';
            if (!el.classList.contains('hidden')) el.disabled = false;
            if (typeof showToast === 'function') {
                showToast('Terjadi gangguan saat memproses tombol. Silakan coba lagi.', 'error');
            }
        }
    }

    // Touchend handles devices/webviews where click is flaky or delayed.
    el.addEventListener('touchend', function (ev) {
        if (ev && ev.cancelable) ev.preventDefault();
        invoke(ev);
    }, { passive: false });

    // Pointer events are the most reliable across Android/iOS webview + browser.
    el.addEventListener('pointerup', function (ev) {
        invoke(ev);
    });

    // Keep click fallback for desktop and older browsers.
    el.addEventListener('click', invoke);
}

function _tryArriveStatusWithFallback(order, actorId, verifyMeta) {
    if (!order || !order.id) return Promise.resolve(false);
    var sid = String(actorId || order.talentId || '');
    if (!sid) return Promise.resolve(false);

    function safeStatusUpdate(status, payloadFields) {
        return Promise.resolve().then(function () {
            return updateOrderStatus(order.id, status, payloadFields);
        }).catch(function () {
            return false;
        });
    }

    function resolveCoords(meta, orderRef) {
        var lat = NaN;
        var lng = NaN;
        if (meta && isValidLatLng(Number(meta.gpsLat), Number(meta.gpsLng))) {
            lat = Number(meta.gpsLat);
            lng = Number(meta.gpsLng);
        } else if (orderRef && isValidLatLng(Number(orderRef.talentLat), Number(orderRef.talentLng))) {
            lat = Number(orderRef.talentLat);
            lng = Number(orderRef.talentLng);
        }
        if (!isValidLatLng(lat, lng)) return null;
        return { lat: lat, lng: lng };
    }

    var nowTs = Date.now();
    var coords = resolveCoords(verifyMeta, order);

    var arriveFields = { talentId: sid, arrivedAt: nowTs, _skipGpsGate: true };
    if (coords) {
        arriveFields.talentLat = coords.lat;
        arriveFields.talentLng = coords.lng;
        arriveFields.talentLastLocationAt = nowTs;
    }
    var onTheWayFields = {
        talentId: sid,
        startedTripAt: Number(order.startedTripAt) || nowTs,
        autoProgress: true,
        _skipGpsGate: true
    };
    if (coords) {
        onTheWayFields.talentLat = coords.lat;
        onTheWayFields.talentLng = coords.lng;
        onTheWayFields.talentLastLocationAt = nowTs;
    }

    return safeStatusUpdate('arrived', arriveFields).then(function (ok) {
        if (ok) return true;
        // Fallback: normalize backend order state to on_the_way then retry arrived once.
        return safeStatusUpdate('on_the_way', onTheWayFields).then(function (ok2) {
            if (!ok2) return false;
            return safeStatusUpdate('arrived', arriveFields);
        });
    }).catch(function () {
        return false;
    });
}

function renderOrderActions(order, isTalent, isUser) {
    var el = document.getElementById('otpActions');
    if (!el) return;
    el.innerHTML = '';
    var isAntar = order.skillType === 'js_antar';
    var isDelivery = order.skillType === 'js_delivery';
    var isRideFlow = isAntar || isDelivery;
    var isProductOrder = order.skillType === 'js_food' || order.sellerId;
    var session = getSession();
    var isSeller = session && String(session.id) === String(order.sellerId);

    // ── USER: Cancel button on pending_seller / searching / pending ──
    if (isUser && (['pending_seller', 'preparing', 'searching', 'pending'].indexOf(order.status) >= 0)) {
        var cancelHtml = '<button class="sf-cancel-btn red" id="otpBtnCancel">Batalkan Pesanan</button>';
        if (order.status === 'searching') {
            cancelHtml = '<div style="text-align:center;font-size:12px;color:#999;margin-bottom:8px;">Mencari driver terdekat...</div>' + cancelHtml;
        } else if (order.status === 'pending_seller') {
            cancelHtml = '<div style="text-align:center;font-size:12px;color:#999;margin-bottom:8px;">Menunggu penjual menerima pesanan...</div>' + cancelHtml;
        } else if (order.status === 'preparing') {
            cancelHtml = '<div style="text-align:center;font-size:12px;color:#999;margin-bottom:8px;">Penjual sedang menyiapkan pesanan...</div>' + cancelHtml;
        }
        el.innerHTML = cancelHtml;
        document.getElementById('otpBtnCancel').addEventListener('click', function () {
            openModernConfirm({
                title: 'Batalkan Pesanan?',
                message: 'Pesanan akan dibatalkan sekarang. Lanjutkan pembatalan?'
            }).then(function (ok) {
                if (!ok) return;
                if (typeof cancelDriverSearch === 'function') cancelDriverSearch();
                backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: 'user' } }).then(function (res) {
                    if (res && res.success) {
                        if (_currentOrder) _currentOrder.status = 'cancelled';
                        refreshTrackingUIFromCurrentOrder();
                        showToast('Pesanan dibatalkan', 'success');
                        addNotifItem({ icon: '❌', title: 'Pesanan Dibatalkan', desc: (order.serviceType || 'Pesanan') + ' - dibatalkan oleh Anda', type: 'order', orderId: order.id });
                        // Notify talent if assigned
                        if (order.talentId) {
                            addNotifItem({ userId: order.talentId, icon: '❌', title: 'Pesanan Dibatalkan', desc: 'User membatalkan pesanan ' + (order.serviceType || ''), type: 'order', orderId: order.id });
                        }
                        // Refund user if payment was already deducted (JsPay after accept)
                        var paidAmount = Number(order.paidAmount) || 0;
                        if (paidAmount > 0 && (order.paymentMethod || 'jspay') !== 'cod') {
                            backendPost({
                                action: 'refundOrderPayment',
                                orderId: order.id,
                                description: 'Refund pembatalan ' + (order.serviceType || 'Pesanan')
                            });
                            addNotifItem({ userId: order.userId, icon: '💰', title: 'Refund Berhasil', desc: 'Saldo ' + formatRupiah(paidAmount) + ' dikembalikan karena pembatalan', type: 'refund', orderId: order.id });
                            showToast('Saldo ' + formatRupiah(paidAmount) + ' dikembalikan', 'success');
                        }
                        setTimeout(function () { closeTrackingToHome(); }, 450);
                    }
                });
            });
        });
        return;
    }

    // ── SELLER: Accept/Prepare/Ready for product orders ──
    if (isSeller && isProductOrder) {
        if (order.status === 'pending_seller') {
            el.innerHTML = '<div class="sf-btn-row"><button class="sf-btn-solid" id="otpBtnSellerAccept">Terima & Siapkan</button><button class="sf-btn-outline" id="otpBtnSellerReject">Tolak</button></div>';
            bindActionTap(document.getElementById('otpBtnSellerAccept'), function () {
                var btn = this;
                if (btn.dataset.busy === '1') return;
                btn.dataset.busy = '1';
                btn.disabled = true;
                backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'preparing', sellerAcceptedAt: Date.now() } }).then(function (res) {
                    if (res && res.success) {
                        if (_currentOrder) _currentOrder.status = 'preparing';
                        refreshTrackingUIFromCurrentOrder();
                        showToast('Pesanan diterima! Segera siapkan.', 'success');
                        addNotifItem({ userId: order.userId, icon: '👨‍🍳', title: 'Penjual Menyiapkan', desc: (order.serviceType || 'Pesanan') + ' sedang disiapkan', type: 'order', orderId: order.id });
                        return;
                    }
                    btn.dataset.busy = '0';
                    btn.disabled = false;
                    showToast((res && res.message) ? res.message : 'Gagal memproses aksi', 'error');
                }).catch(function () {
                    btn.dataset.busy = '0';
                    btn.disabled = false;
                    showToast('Gagal memproses aksi', 'error');
                });
            });
            document.getElementById('otpBtnSellerReject').addEventListener('click', function () {
                openModernConfirm({
                    title: 'Tolak Pesanan?',
                    message: 'Pesanan akan dibatalkan dan pembeli akan mendapat notifikasi.'
                }).then(function (ok) {
                    if (!ok) return;
                    backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: 'seller' } }).then(function (res) {
                        if (res && res.success) {
                            if (_currentOrder) _currentOrder.status = 'cancelled';
                            refreshTrackingUIFromCurrentOrder();
                            showToast('Pesanan ditolak', 'success');
                            addNotifItem({ userId: order.userId, icon: '❌', title: 'Penjual Menolak', desc: (order.storeName || 'Toko') + ' menolak pesanan Anda', type: 'order', orderId: order.id });
                            setTimeout(function () { closeTrackingToHome(); }, 450);
                        }
                    });
                });
            });
        } else if (order.status === 'preparing') {
            el.innerHTML = '<button class="sf-btn-solid" style="width:100%" id="otpBtnSellerReady">Pesanan Siap Diambil</button>';
            bindActionTap(document.getElementById('otpBtnSellerReady'), function () {
                var btn = this;
                if (btn.dataset.busy === '1') return;
                btn.dataset.busy = '1';
                btn.disabled = true;
                backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'searching', sellerReadyAt: Date.now() } }).then(function (res) {
                    if (res && res.success) {
                        if (_currentOrder) _currentOrder.status = 'searching';
                        refreshTrackingUIFromCurrentOrder();
                        showToast('Menunggu driver mengambil pesanan...', 'success');
                        addNotifItem({ userId: order.userId, icon: '📦', title: 'Pesanan Siap!', desc: 'Sedang mencari driver untuk mengambil pesanan', type: 'order', orderId: order.id });
                        // Trigger driver search from user side
                        if (typeof searchNearbyDriver === 'function') searchNearbyDriver(order);
                        return;
                    }
                    btn.dataset.busy = '0';
                    btn.disabled = false;
                    showToast((res && res.message) ? res.message : 'Gagal memproses aksi', 'error');
                }).catch(function () {
                    btn.dataset.busy = '0';
                    btn.disabled = false;
                    showToast('Gagal memproses aksi', 'error');
                });
            });
        }
        return;
    }

    // ── TALENT/DRIVER: Accept/Reject on pending ──
    if (isTalent) {
        var driverNavHtml = buildDriverNavButtonsHtml(order);
        if (order.status === 'pending') {
            el.innerHTML = driverNavHtml + '<div class="sf-btn-row"><button class="sf-btn-solid" id="otpBtnAccept">Terima Pesanan</button><button class="sf-btn-outline" id="otpBtnReject">Tolak</button></div>';
            bindActionTap(document.getElementById('otpBtnAccept'), function () {
                var btn = this;
                btn.disabled = true;
                btn.textContent = 'Memproses...';
                var totalCost = Number(order.totalCost) || ((Number(order.price) || 0) + (Number(order.fee) || 0));
                var pm = order.paymentMethod || 'jspay';
                var sessionNow = getSession();

                function _safeMoneyText(val) {
                    if (typeof formatRupiah === 'function') return formatRupiah(val);
                    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
                }

                function _safeNotify(payload) {
                    try {
                        if (typeof addNotifItem === 'function') addNotifItem(payload);
                    } catch (e) {
                        console.warn('Driver accept notify failed:', e);
                    }
                }

                function resetBtn() {
                    btn.disabled = false;
                    btn.textContent = 'Terima Pesanan';
                }

                function _acceptOrderDirect(extraFields) {
                    var activeDriverId = sessionNow && sessionNow.id ? String(sessionNow.id) : '';
                    var payloadFields = Object.assign({
                        status: 'accepted',
                        acceptedAt: Date.now(),
                        talentId: activeDriverId
                    }, extraFields || {});

                    return backendPost({
                        action: 'updateOrder',
                        orderId: order.id,
                        actorId: sessionNow && sessionNow.id ? sessionNow.id : '',
                        fields: payloadFields
                    }).then(function (res) {
                        if (!res || !res.success) {
                            throw new Error((res && res.message) || 'Gagal menerima pesanan');
                        }
                        if (_currentOrder && String(_currentOrder.id) === String(order.id)) {
                            Object.assign(_currentOrder, payloadFields);
                            refreshTrackingUIFromCurrentOrder();
                        }
                        showToast('Status diperbarui!', 'success');
                        return res;
                    });
                }

                ensureDriverSingleOrder(sessionNow ? sessionNow.id : '', order.id).then(function (hasActive) {
                    if (hasActive) {
                        resetBtn();
                        showToast('Anda masih punya pesanan aktif. Selesaikan dulu sebelum menerima pesanan baru.', 'error');
                        var excluded = order.excludedTalents || [];
                        var sid = sessionNow ? sessionNow.id : '';
                        if (sid && excluded.indexOf(sid) < 0) excluded.push(sid);
                        backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'searching', talentId: '', excludedTalents: excluded } });
                        return;
                    }

                    if (pm === 'cod') {
                        // COD: No wallet deduction from user. Accept directly.
                        _acceptOrderDirect({ paidAmount: 0 }).then(function () {
                            _safeNotify({ userId: order.userId, icon: '✅', title: 'Driver Ditemukan!', desc: 'Pembayaran COD - siapkan uang tunai ' + _safeMoneyText(totalCost), type: 'order', orderId: order.id });
                        }).catch(function (err) {
                            resetBtn();
                            showToast((err && err.message) ? err.message : 'Gagal menerima pesanan COD', 'error');
                        });
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
                                resetBtn();
                                showToast('Saldo user tidak cukup!', 'error');
                                _safeNotify({ userId: order.userId, icon: '⚠️', title: 'Saldo Tidak Cukup', desc: 'Saldo Anda tidak cukup untuk pesanan ' + (order.serviceType || '') + '. Top up ' + _safeMoneyText(totalCost), type: 'order', orderId: order.id });
                                return;
                            }
                            _acceptOrderDirect({ paidAmount: totalCost }).then(function () {
                                _safeNotify({ userId: order.userId, icon: '💳', title: 'Saldo Dipotong', desc: _safeMoneyText(totalCost) + ' untuk pesanan ' + (order.serviceType || ''), type: 'payment', orderId: order.id });
                            }).catch(function (err) {
                                resetBtn();
                                showToast((err && err.message) ? err.message : 'Gagal finalisasi penerimaan pesanan', 'error');
                            });
                        });
                    }
                }).catch(function (err) {
                    console.error('Driver accept validation/process error:', err);
                    resetBtn();
                    showToast('Gagal memproses penerimaan pesanan. Coba lagi.', 'error');
                });
            });
            document.getElementById('otpBtnReject').addEventListener('click', function () {
                if (!confirm('Tolak pesanan ini?')) return;
                backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'rejected', talentId: '', rejectedAt: Date.now(), rejectedBy: getSession().id } }).then(function (res) {
                    if (res && res.success) {
                        showToast('Pesanan ditolak', 'success');
                        if (_currentOrder) _currentOrder.status = 'rejected';
                        refreshTrackingUIFromCurrentOrder();
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
            var otwLabel = isAntar ? 'Menuju Lokasi Jemput' : (isDelivery ? 'Menuju Titik Jemput Barang' : 'Menuju Lokasi');
            el.innerHTML = driverNavHtml + '<button class="sf-btn-solid" style="width:100%" id="otpBtnOtw">' + otwLabel + '</button>';
            bindActionTap(document.getElementById('otpBtnOtw'), function () {
                var btn = this;
                if (btn.dataset.busy === '1') return;
                btn.dataset.busy = '1';
                btn.disabled = true;
                var sid = (session && session.id) ? String(session.id) : '';

                function unlock() {
                    btn.dataset.busy = '0';
                    btn.disabled = false;
                }

                function postStatus(status, fields) {
                    return backendPost({
                        action: 'updateOrder',
                        orderId: order.id,
                        actorId: sid,
                        fields: Object.assign({ status: status, talentId: sid }, fields || {})
                    });
                }

                function postOnTheWayWithBestGps() {
                    return Promise.resolve()
                        .then(function () {
                            if (typeof getCurrentPosition !== 'function') return null;
                            return getCurrentPosition().catch(function () { return null; });
                        })
                        .then(function (pos) {
                            var f = { startedTripAt: Date.now() };
                            if (pos && isValidLatLng(Number(pos.lat), Number(pos.lng))) {
                                f.talentLat = Number(pos.lat);
                                f.talentLng = Number(pos.lng);
                                f.talentLastLocationAt = Date.now();
                            } else if (isValidLatLng(Number(order.talentLat), Number(order.talentLng))) {
                                f.talentLat = Number(order.talentLat);
                                f.talentLng = Number(order.talentLng);
                                f.talentLastLocationAt = Date.now();
                            }
                            return postStatus('on_the_way', f);
                        });
                }

                postOnTheWayWithBestGps()
                    .then(function (res) {
                        if (res && res.success) return res;

                        var msg = String((res && res.message) || '').toLowerCase();
                        var shouldFallback = msg.indexOf('urutan status tidak valid') >= 0
                            || msg.indexOf('status') >= 0
                            || msg.indexOf('hanya driver aktif') >= 0;
                        if (!shouldFallback) return res;

                        // Fallback for stale DB state: force accepted then retry on_the_way.
                        return postStatus('accepted', { acceptedAt: Date.now(), paidAmount: Number(order.paidAmount) || 0 })
                            .then(function () {
                                return postOnTheWayWithBestGps();
                            });
                    })
                    .then(function (res) {
                        if (!res || !res.success) {
                            unlock();
                            showToast((res && res.message) ? res.message : 'Gagal update ke status menuju lokasi', 'error');
                            return;
                        }
                        if (_currentOrder && String(_currentOrder.id) === String(order.id)) {
                            _currentOrder.status = 'on_the_way';
                            _currentOrder.talentId = sid;
                            _currentOrder.startedTripAt = Date.now();
                            refreshTrackingUIFromCurrentOrder();
                        }
                        try {
                            addNotifItem({
                                userId: order.userId,
                                icon: '🏍️',
                                title: isAntar ? 'Driver Menuju Titik Jemput' : 'Driver Menuju Lokasi',
                                desc: (order.serviceType || 'Pesanan') + ' sedang dalam perjalanan.',
                                type: 'order',
                                orderId: order.id
                            });
                        } catch (e) {}
                        showToast('Status diperbarui: menuju lokasi', 'success');
                        startTalentLocationBroadcast(order.id);
                    })
                    .catch(function () {
                        unlock();
                        showToast('Gagal update ke status menuju lokasi', 'error');
                    });
            });
        } else if (order.status === 'on_the_way' && isProductOrder) {
            // GPS-gated: Only show "Sampai di Toko" button, but auto-advance handles it via proximity
            var storeCoords = getOrderStoreCoords(order);
            el.innerHTML = driverNavHtml
                + '<div class="gps-progress-hint" style="text-align:center;font-size:12px;color:#FF6B00;margin-bottom:8px;">📍 Progress akan otomatis saat Anda tiba di lokasi</div>'
                + '<button class="sf-btn-solid" style="width:100%;font-size:13px;" id="otpBtnArrive">Tandai Tiba Secara Manual</button>';
            bindActionTap(document.getElementById('otpBtnArrive'), function () {
                var btn = this;
                if (btn.dataset.busy === '1') return;
                _armProgressButtonFailsafe('otpBtnArrive');
                _verifyDriverAtLocation(order, 'store', function(isNear, meta) {
                    if (isNear) {
                        var sid = (session && session.id) ? String(session.id) : String(order.talentId || '');
                        _tryArriveStatusWithFallback(order, sid, meta).then(function (ok) {
                            if (!ok) {
                                btn.dataset.busy = '0';
                                btn.dataset.busySince = '';
                                if (!btn.classList.contains('hidden')) btn.disabled = false;
                            }
                        });
                    } else {
                        btn.dataset.busy = '0';
                        btn.dataset.busySince = '';
                        if (!btn.classList.contains('hidden')) btn.disabled = false;
                        showToast('⚠️ Anda harus berada di dekat lokasi toko untuk menandai tiba. Progress akan otomatis saat Anda sampai.', 'error');
                    }
                });
            });
        } else if (order.status === 'arrived' && isProductOrder) {
            el.innerHTML = driverNavHtml + '<button class="sf-btn-solid" style="width:100%" id="otpBtnStart">Ambil Pesanan & Antar</button>';
            bindActionTap(document.getElementById('otpBtnStart'), function () {
                if (this.dataset.busy === '1') return;
                this.dataset.busy = '1';
                this.disabled = true;
                var sid = (session && session.id) ? String(session.id) : '';
                updateOrderStatus(order.id, 'in_progress', { pickedUpAt: Date.now(), talentId: sid }).then(function (ok) {
                    if (!ok) {
                        var btn = document.getElementById('otpBtnStart');
                        if (btn) {
                            btn.dataset.busy = '0';
                            btn.disabled = false;
                        }
                    }
                });
            });
        } else if (order.status === 'in_progress' && isProductOrder) {
            el.innerHTML = driverNavHtml + '<button class="sf-btn-solid" style="width:100%" id="otpBtnComplete">Selesai + Upload Bukti</button><input type="file" id="otpProofInput" accept="image/*" capture="environment" style="display:none">';
            bindActionTap(document.getElementById('otpBtnComplete'), function () {
                var btn = this;
                if (btn.dataset.busy === '1') return;
                var proofInput = document.getElementById('otpProofInput');
                if (btn.dataset.proofReady === '1') {
                    _setCompleteButtonArmedState(btn, false);
                    if (!_triggerProofPicker(proofInput)) {
                        _setCompleteButtonArmedState(btn, true);
                        showToast('Tidak bisa membuka kamera otomatis. Ketuk lagi tombol Ambil Foto Validasi.', 'error');
                    }
                    return;
                }
                btn.dataset.busy = '1';
                btn.disabled = true;
                if (_canUseKnownGpsForCompletion(order, 'buyer')) {
                    _setProofInputGpsCoords(proofInput, order, null);
                    _tryOpenProofAfterGpsCheck(btn, proofInput, 'Lokasi valid. Jika kamera belum muncul, ketuk lagi tombol Ambil Foto Validasi.');
                    return;
                }
                _verifyDriverAtLocation(order, 'buyer', function(isNear, meta) {
                    if (isNear) {
                        var proofInputVerify = document.getElementById('otpProofInput');
                        _setProofInputGpsCoords(proofInputVerify, order, meta);
                        _tryOpenProofAfterGpsCheck(btn, proofInputVerify, 'Lokasi valid. Ketuk lagi tombol Ambil Foto Validasi untuk membuka kamera.');
                    } else {
                        btn.dataset.busy = '0';
                        if (!btn.classList.contains('hidden')) btn.disabled = false;
                        showToast('⚠️ Anda harus berada di dekat lokasi pembeli untuk menyelesaikan pesanan.', 'error');
                    }
                });
            });
            _bindProofInputSelectionHandler(order, 'otpBtnComplete');
        } else if (order.status === 'on_the_way') {
            var arriveLabel = isAntar ? 'Sudah di Lokasi Jemput' : (isDelivery ? 'Sudah di Titik Jemput Barang' : 'Sudah Tiba');
            el.innerHTML = driverNavHtml
                + '<div class="gps-progress-hint" style="text-align:center;font-size:12px;color:#FF6B00;margin-bottom:8px;">📍 Progress akan otomatis saat Anda tiba di lokasi</div>'
                + '<button class="sf-btn-solid" style="width:100%;font-size:13px;" id="otpBtnArrive">' + arriveLabel + ' (Manual)</button>';
            bindActionTap(document.getElementById('otpBtnArrive'), function () {
                var btn = this;
                if (btn.dataset.busy === '1') return;
                _armProgressButtonFailsafe('otpBtnArrive');
                _verifyDriverAtLocation(order, 'user', function(isNear, meta) {
                    if (isNear) {
                        var sid = (session && session.id) ? String(session.id) : String(order.talentId || '');
                        _tryArriveStatusWithFallback(order, sid, meta).then(function (ok) {
                            if (!ok) {
                                btn.dataset.busy = '0';
                                btn.dataset.busySince = '';
                                if (!btn.classList.contains('hidden')) btn.disabled = false;
                            }
                        });
                    } else {
                        btn.dataset.busy = '0';
                        btn.dataset.busySince = '';
                        if (!btn.classList.contains('hidden')) btn.disabled = false;
                        showToast('⚠️ Anda harus berada di dekat lokasi tujuan untuk menandai tiba. Progress akan otomatis saat Anda sampai.', 'error');
                    }
                });
            });
        } else if (order.status === 'arrived') {
            var startLabel = isAntar ? 'Mulai Perjalanan' : (isDelivery ? 'Mulai Antar ke Titik Tujuan' : 'Mulai Mengerjakan');
            el.innerHTML = driverNavHtml + '<button class="sf-btn-solid" style="width:100%" id="otpBtnStart">' + startLabel + '</button>';
            bindActionTap(document.getElementById('otpBtnStart'), function () {
                if (this.dataset.busy === '1') return;
                this.dataset.busy = '1';
                this.disabled = true;
                var sid = (session && session.id) ? String(session.id) : '';
                updateOrderStatus(order.id, 'in_progress', { startedAt: Date.now(), talentId: sid }).then(function (ok) {
                    if (!ok) {
                        var btn = document.getElementById('otpBtnStart');
                        if (btn) {
                            btn.dataset.busy = '0';
                            btn.disabled = false;
                        }
                    }
                });
            });
        } else if (order.status === 'in_progress') {
            var completeLabel = isRideFlow ? 'Sampai Tujuan + Ambil Bukti Gambar' : 'Selesai + Upload Bukti';
            el.innerHTML = driverNavHtml + '<button class="sf-btn-solid" style="width:100%" id="otpBtnComplete">' + completeLabel + '</button><input type="file" id="otpProofInput" accept="image/*" capture="environment" style="display:none">';
            if (isRideFlow) {
                bindActionTap(document.getElementById('otpBtnComplete'), function () {
                    var btn = this;
                    if (btn.dataset.busy === '1') return;
                    var proofInput = document.getElementById('otpProofInput');
                    if (btn.dataset.proofReady === '1') {
                        _setCompleteButtonArmedState(btn, false);
                        if (!_triggerProofPicker(proofInput)) {
                            _setCompleteButtonArmedState(btn, true);
                            showToast('Tidak bisa membuka kamera otomatis. Ketuk lagi tombol Ambil Foto Validasi.', 'error');
                        }
                        return;
                    }
                    var msg = isAntar ? 'Konfirmasi penumpang sudah sampai tujuan?' : 'Konfirmasi barang sudah sampai di titik antar?';
                    if (!confirm(msg)) return;
                    _armProgressButtonFailsafe('otpBtnComplete');
                    if (_canUseKnownGpsForCompletion(order, 'dest')) {
                        _setProofInputGpsCoords(proofInput, order, null);
                        _tryOpenProofAfterGpsCheck(btn, proofInput, 'Lokasi valid. Jika kamera belum muncul, ketuk lagi tombol Ambil Foto Validasi.');
                        return;
                    }
                    _verifyDriverAtLocation(order, 'dest', function(isNear, meta) {
                        if (isNear) {
                            var proofInputVerify = document.getElementById('otpProofInput');
                            _setProofInputGpsCoords(proofInputVerify, order, meta);
                            _tryOpenProofAfterGpsCheck(btn, proofInputVerify, 'Lokasi valid. Ketuk lagi tombol Ambil Foto Validasi untuk membuka kamera.');
                        } else {
                            btn.dataset.busy = '0';
                            btn.dataset.busySince = '';
                            if (!btn.classList.contains('hidden')) btn.disabled = false;
                            showToast('⚠️ Anda harus berada di dekat lokasi tujuan untuk menyelesaikan perjalanan.', 'error');
                        }
                    });
                });
            } else {
                bindActionTap(document.getElementById('otpBtnComplete'), function () {
                    if (this.dataset.busy === '1') return;
                    this.dataset.busy = '1';
                    this.disabled = true;
                    document.getElementById('otpProofInput').click();
                });
            }
            _bindProofInputSelectionHandler(order, 'otpBtnComplete');
        }

        _refreshDriverGpsLockedButtons(order);
        if (driverNavHtml) bindDriverNavButtons(order);
    }

    var hasUserRating = (order.status === 'rated') || (Number(order.rating || 0) > 0) || Number(order.ratedAt || 0) > 0;
    if (isUser && (order.status === 'completed' || order.status === 'rated')) {
        var complaintOpen = !!(order.userComplaint || order.userComplaintText || order.userComplaintAt)
            && String(order.complaintStatus || '').toLowerCase() !== 'resolved'
            && String(order.complaintStatus || '').toLowerCase() !== 'closed';

        el.innerHTML = hasUserRating
            ? [
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
                    '<div style="flex:1;display:flex;align-items:center;justify-content:center;border:1px solid #D1FAE5;background:#ECFDF5;color:#065F46;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700;">⭐ Rating sudah dikirim</div>',
                    (complaintOpen
                        ? '<button class="sf-btn-outline" style="flex:1;opacity:.7" id="otpBtnComplaint" disabled>Aduan Sudah Dikirim</button>'
                        : '<button class="sf-btn-outline" style="flex:1" id="otpBtnComplaint">Laporkan Aduan</button>'),
                '</div>'
            ].join('')
            : [
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
                    '<button class="sf-btn-solid" style="flex:1" id="otpBtnRate">Beri Rating</button>',
                    (complaintOpen
                        ? '<button class="sf-btn-outline" style="flex:1;opacity:.7" id="otpBtnComplaint" disabled>Aduan Sudah Dikirim</button>'
                        : '<button class="sf-btn-outline" style="flex:1" id="otpBtnComplaint">Laporkan Aduan</button>'),
                '</div>'
            ].join('');

        var rateBtn = document.getElementById('otpBtnRate');
        if (rateBtn) {
            rateBtn.addEventListener('click', function () { openRatingPage(order); });
        }

        var complaintBtn = document.getElementById('otpBtnComplaint');
        if (complaintBtn && !complaintBtn.disabled) {
            complaintBtn.addEventListener('click', function () {
                submitUserOrderComplaint(order);
            });
        }
    }

    // ── Show status messages for cancelled/rejected ──
    if (order.status === 'cancelled') {
        el.innerHTML = '<div style="text-align:center;padding:12px;background:#FEE2E2;color:#EF4444;border-radius:8px;font-weight:600;font-size:14px;">Pesanan ini telah dibatalkan</div>';
    }
}

function ensureDriverSingleOrder(driverId, currentOrderId) {
    if (!driverId) return Promise.resolve(false);
    return FB.get('getOrdersByUser', { userId: driverId })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (!res || !res.success || !res.data) return false;
            var active = res.data.filter(function (o) {
                if (String(o.id) === String(currentOrderId)) return false;
                if (String(o.talentId) !== String(driverId)) return false;
                return ['pending', 'accepted', 'on_the_way', 'arrived', 'in_progress'].indexOf(o.status) >= 0;
            });
            return active.length > 0;
        })
        .catch(function () { return false; });
}

function submitUserOrderComplaint(order) {
    if (!order || !order.id) return;
    var session = typeof getSession === 'function' ? getSession() : null;
    if (!session || session.role !== 'user') {
        if (typeof showToast === 'function') showToast('Hanya user customer yang bisa membuat aduan.', 'error');
        return;
    }
    if (String(session.id || '') !== String(order.userId || '')) {
        if (typeof showToast === 'function') showToast('Anda tidak berhak membuat aduan untuk order ini.', 'error');
        return;
    }
    if (!((order.status === 'completed') || (order.status === 'rated'))) {
        if (typeof showToast === 'function') showToast('Aduan hanya bisa dibuat setelah order selesai.', 'error');
        return;
    }

    var complaintOpen = !!(order.userComplaint || order.userComplaintText || order.userComplaintAt)
        && String(order.complaintStatus || '').toLowerCase() !== 'resolved'
        && String(order.complaintStatus || '').toLowerCase() !== 'closed';
    if (complaintOpen) {
        if (typeof showToast === 'function') showToast('Aduan untuk order ini sudah ada dan sedang diproses.', 'info');
        return;
    }

    var text = prompt('Tulis aduan Anda (minimal 10 karakter):');
    if (!text || !text.trim()) return;
    var reason = text.trim();
    if (reason.length < 10) {
        if (typeof showToast === 'function') showToast('Aduan terlalu singkat. Jelaskan masalah minimal 10 karakter.', 'error');
        return;
    }

    backendPost({
        action: 'updateOrder',
        orderId: order.id,
        fields: {
            userComplaint: true,
            userComplaintText: reason,
            userComplaintAt: Date.now(),
            userComplaintBy: session.id,
            complaintStatus: 'open',
            complaintResolvedAt: 0,
            complaintHandledBy: '',
            followUpRequired: true
        }
    }).then(function (res) {
        if (!res || !res.success) {
            throw new Error((res && res.message) ? res.message : 'Gagal mengirim aduan');
        }

        if (_currentOrder && String(_currentOrder.id) === String(order.id)) {
            _currentOrder.userComplaint = true;
            _currentOrder.userComplaintText = reason;
            _currentOrder.userComplaintAt = Date.now();
            _currentOrder.userComplaintBy = session.id;
            _currentOrder.complaintStatus = 'open';
            refreshTrackingUIFromCurrentOrder();
        }

        if (typeof addNotifItem === 'function') {
            addNotifItem({
                icon: '🛎️',
                title: 'Aduan User Masuk',
                desc: 'Order #' + String(order.id || '').substr(0, 8) + ' memiliki aduan user dan perlu tindak lanjut admin.',
                type: 'report',
                orderId: order.id,
                extra: { complaint: true }
            });

            if (order.talentId) {
                addNotifItem({
                    userId: order.talentId,
                    icon: '⚠️',
                    title: 'Order Diadukan Customer',
                    desc: 'Order #' + String(order.id || '').substr(0, 8) + ' mendapat aduan customer. Tunggu tindak lanjut admin.',
                    type: 'order',
                    orderId: order.id
                });
            }

            if (order.sellerId) {
                addNotifItem({
                    userId: order.sellerId,
                    icon: '⚠️',
                    title: 'Order Diadukan Customer',
                    desc: 'Order #' + String(order.id || '').substr(0, 8) + ' mendapat aduan customer. Tunggu tindak lanjut admin.',
                    type: 'order',
                    orderId: order.id
                });
            }
        }

        if (typeof showToast === 'function') showToast('Aduan berhasil dikirim ke admin. Kami akan menindaklanjuti.', 'success');
    }).catch(function (err) {
        if (typeof showToast === 'function') showToast((err && err.message) ? err.message : 'Gagal mengirim aduan', 'error');
    });
}

function _getDriverTargetCoords(order, targetType) {
    if (!order) return null;
    var targetLat, targetLng;
    if (targetType === 'store') {
        var storeCoords = getOrderStoreCoords(order);
        if (storeCoords) {
            targetLat = Number(storeCoords.lat);
            targetLng = Number(storeCoords.lng);
        }
    } else if (targetType === 'user' || targetType === 'buyer') {
        var lockedUser = getTrackingLockedUserCoords(order);
        targetLat = Number(lockedUser ? lockedUser.lat : order.userLat);
        targetLng = Number(lockedUser ? lockedUser.lng : order.userLng);
    } else if (targetType === 'dest') {
        targetLat = Number(order.destLat);
        targetLng = Number(order.destLng);
    }
    if (!isValidLatLng(targetLat, targetLng)) return null;
    return { lat: targetLat, lng: targetLng };
}

function _getDriverGpsGateTargetType(order, nextStatus) {
    if (!order || !nextStatus) return '';
    var currentStatus = String(order.status || '');
    var isProductOrder = !!(order.skillType === 'js_food' || order.sellerId);
    var isRideFlow = !!(order.skillType === 'js_antar' || order.skillType === 'js_delivery');

    if (nextStatus === 'arrived' && currentStatus === 'on_the_way') {
        return isProductOrder ? 'store' : 'user';
    }
    if (nextStatus === 'completed' && currentStatus === 'in_progress') {
        if (isProductOrder) return 'buyer';
        if (isRideFlow) return 'dest';
        return 'user';
    }
    return '';
}

function _formatDistanceMeters(km) {
    var meters = Math.max(0, Math.round(Number(km || 0) * 1000));
    return String(meters) + ' m';
}

function _checkDriverGpsGateByKnownPosition(order, targetType, maxDistanceKm) {
    if (!order || !targetType) return { ok: true };
    var radiusKm = Number(maxDistanceKm);
    if (!isFinite(radiusKm) || radiusKm <= 0) radiusKm = GPS_MANUAL_ACTION_RADIUS;

    var dLat = Number(order.talentLat);
    var dLng = Number(order.talentLng);
    if (!isValidLatLng(dLat, dLng)) return { ok: false, reason: 'driver_location_unavailable' };

    var target = _getDriverTargetCoords(order, targetType);
    if (!target) return { ok: false, reason: 'target_location_unavailable' };

    var distKm = haversineDistance(dLat, dLng, target.lat, target.lng);
    return { ok: distKm <= radiusKm, distKm: distKm, radiusKm: radiusKm };
}

function _getDriverGpsGateRadiusKm(order, targetType, nextStatus) {
    var isRideFlow = !!(order && (order.skillType === 'js_antar' || order.skillType === 'js_delivery'));
    // Destination gate for completion uses 30-50m tolerance (set to 50m for operational tolerance).
    if (nextStatus === 'completed' && (targetType === 'dest' || targetType === 'buyer' || targetType === 'user')) return 0.05;
    // Arrival gate in ride flow also tightened so progress is only enabled near pickup/drop point.
    if (nextStatus === 'arrived' && isRideFlow) return 0.05;
    return GPS_MANUAL_ACTION_RADIUS;
}

function _applyDriverGpsGateButton(order, buttonId, nextStatus) {
    var btn = document.getElementById(buttonId);
    if (!btn || !order) return;
    if (!btn.dataset.baseLabel) btn.dataset.baseLabel = btn.textContent;

    var isProgressButton = (buttonId === 'otpBtnArrive' && nextStatus === 'arrived')
        || (buttonId === 'otpBtnComplete' && nextStatus === 'completed');
    if (isProgressButton) {
        btn.classList.remove('sf-btn-outline');
        btn.classList.add('sf-btn-solid');
    }

    // Once proof flow is armed by successful GPS verification, keep the button actionable.
    if (buttonId === 'otpBtnComplete' && btn.dataset.proofReady === '1') {
        btn.classList.remove('hidden');
        btn.disabled = false;
        btn.style.opacity = '';
        btn.title = 'Lokasi sudah terverifikasi. Lanjut ambil foto bukti.';
        return;
    }

    if (btn.dataset.busy === '1') {
        var busySince = Number(btn.dataset.busySince || 0);
        if (!isFinite(busySince) || busySince <= 0 || (Date.now() - busySince) > 15000) {
            btn.dataset.busy = '0';
            btn.dataset.busySince = '';
            btn.disabled = false;
        } else {
            btn.classList.remove('hidden');
            btn.disabled = true;
            btn.style.opacity = '0.72';
            btn.textContent = btn.dataset.baseLabel || btn.textContent;
            btn.title = 'Sedang memproses...';
            return;
        }
    }

    var targetType = _getDriverGpsGateTargetType(order, nextStatus);
    if (!targetType) return;

    var radiusKm = _getDriverGpsGateRadiusKm(order, targetType, nextStatus);
    var knownCheck = _checkDriverGpsGateByKnownPosition(order, targetType, radiusKm);

    btn.classList.remove('hidden');
    btn.textContent = btn.dataset.baseLabel || btn.textContent;

    if (knownCheck.ok) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.title = '';
        return;
    }

    if (knownCheck.reason === 'target_location_unavailable') {
        btn.disabled = true;
        btn.style.opacity = '0.72';
        btn.title = 'Koordinat tujuan belum valid. Hubungi admin.';
        return;
    }

    // Arrive action should stay tappable so live GPS verification in tap handler can run.
    if (buttonId === 'otpBtnArrive' && nextStatus === 'arrived') {
        btn.disabled = false;
        btn.style.opacity = '';
        if (isFinite(Number(knownCheck.distKm)) && isFinite(Number(knownCheck.radiusKm))) {
            btn.title = 'Jarak saat ini ±' + _formatDistanceMeters(knownCheck.distKm) + '. Maks ' + _formatDistanceMeters(knownCheck.radiusKm) + ' untuk lanjut progres.';
        } else {
            btn.title = 'Ketuk untuk verifikasi GPS langsung.';
        }
        return;
    }

    // If driver coords belum sinkron, keep button clickable so tap can run live GPS verification.
    if (knownCheck.reason === 'driver_location_unavailable') {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.title = 'Menunggu sinkronisasi GPS. Ketuk tombol untuk verifikasi lokasi langsung.';
        return;
    }

    btn.disabled = true;
    btn.style.opacity = '0.72';
    btn.title = 'Jarak saat ini ±' + _formatDistanceMeters(knownCheck.distKm) + '. Maks ' + _formatDistanceMeters(knownCheck.radiusKm) + ' agar tombol aktif.';
}

function _armProgressButtonFailsafe(buttonId) {
    var btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.dataset.busy = '1';
    btn.dataset.busySince = String(Date.now());
    btn.disabled = true;

    setTimeout(function () {
        var liveBtn = document.getElementById(buttonId);
        if (!liveBtn) return;
        if (liveBtn.dataset.busy !== '1') return;
        var busySince = Number(liveBtn.dataset.busySince || 0);
        if (!isFinite(busySince) || busySince <= 0) return;
        if ((Date.now() - busySince) < 11000) return;
        liveBtn.dataset.busy = '0';
        liveBtn.dataset.busySince = '';
        liveBtn.disabled = false;
    }, 12000);
}

function _refreshDriverGpsLockedButtons(order) {
    _applyDriverGpsGateButton(order, 'otpBtnArrive', 'arrived');
    _applyDriverGpsGateButton(order, 'otpBtnComplete', 'completed');
}

function _getAdminUserIds() {
    var users = (typeof getUsers === 'function') ? getUsers() : [];
    var ids = {};
    users.forEach(function (u) {
        if (!u || !u.id) return;
        var role = String(u.role || '').toLowerCase();
        if (role === 'admin' || role === 'owner') {
            ids[String(u.id)] = true;
        }
    });
    return Object.keys(ids);
}

function _notifyAdminReviewQueue(orderRef) {
    if (typeof addNotifItem !== 'function') return;
    var oid = (orderRef && orderRef.id) ? String(orderRef.id) : '';
    var svc = (orderRef && (orderRef.serviceType || orderRef.skillType)) ? (orderRef.serviceType || orderRef.skillType) : 'Pesanan';
    var admins = _getAdminUserIds();
    if (!admins || !admins.length) {
        addNotifItem({
            icon: '🔍',
            title: 'Order Selesai - Perlu Review Admin',
            desc: 'Pesanan #' + oid.substr(0, 8) + ' (' + svc + ') menunggu persetujuan Admin untuk pencairan komisi driver/seller.',
            type: 'review',
            orderId: oid,
            extra: { pendingAdminReview: true }
        });
        return;
    }
    admins.forEach(function (adminId) {
        addNotifItem({
            userId: adminId,
            icon: '🔍',
            title: 'Order Selesai - Perlu Review Admin',
            desc: 'Pesanan #' + oid.substr(0, 8) + ' (' + svc + ') menunggu persetujuan Admin untuk pencairan komisi driver/seller.',
            type: 'review',
            orderId: oid,
            extra: { pendingAdminReview: true }
        });
    });
}

function _postOrderActionWithTimeout(body, timeoutMs) {
    var ms = Math.max(2000, Number(timeoutMs) || 10000);
    return Promise.race([
        backendPost(body),
        new Promise(function (resolve) {
            setTimeout(function () {
                resolve({ success: false, message: 'Request timeout' });
            }, ms);
        })
    ]);
}

function _tryCompleteOrderOnce(orderId, actorId, payloadFields, timeoutMs) {
    var bodyPrimary = { action: 'completeOrderWithProof', orderId: orderId, actorId: actorId, fields: payloadFields };
    var bodyLegacy = { action: 'updateOrder', orderId: orderId, actorId: actorId, fields: payloadFields };

    return _postOrderActionWithTimeout(bodyPrimary, timeoutMs).then(function (res) {
        if (res && res.success) return res;
        return _postOrderActionWithTimeout(bodyLegacy, timeoutMs).then(function (res2) {
            return (res2 && res2.success) ? res2 : res;
        });
    });
}

function _finalizeProofCompletion(order, extraFields) {
    if (!order || !order.id) return;

    var session = getSession();
    var actorId = String((session && session.id) || order.talentId || '');
    var nowTs = Date.now();
    var fields = Object.assign({}, extraFields || {});
    if (Object.prototype.hasOwnProperty.call(fields, '_skipGpsGate')) delete fields._skipGpsGate;

    fields.status = 'completed';
    if (typeof fields.completedAt === 'undefined') fields.completedAt = nowTs;
    if (typeof fields.pendingAdminReview === 'undefined') fields.pendingAdminReview = true;
    if (typeof fields.pendingAdminReviewAt === 'undefined') fields.pendingAdminReviewAt = nowTs;
    if (typeof fields.walletSettled === 'undefined') fields.walletSettled = false;
    if (typeof fields.adminReviewStatus === 'undefined') fields.adminReviewStatus = '';
    if (typeof fields.adminReviewReason === 'undefined') fields.adminReviewReason = '';
    if (typeof fields.adminReviewNote === 'undefined') fields.adminReviewNote = 'Menunggu verifikasi admin';
    if (typeof fields.followUpRequired === 'undefined') fields.followUpRequired = false;
    if (typeof fields.fraudFlag === 'undefined') fields.fraudFlag = false;

    // Optimistic UI: once photo is captured, treat as completed locally and close tracking.
    _recordLocalStatusGuard(order.id, 'completed');
    if (_currentOrder && String(_currentOrder.id) === String(order.id)) {
        Object.assign(_currentOrder, fields);
        refreshTrackingUIFromCurrentOrder();
    }
    stopTalentLocationBroadcast();
    _notifyAdminReviewQueue(_currentOrder || order);
    showToast('Bukti diterima. Pesanan ditutup dan masuk review admin.', 'success');
    setTimeout(function () { closeTrackingToHome(); }, 800);

    var payloadWithProof = Object.assign({}, fields);
    var payloadWithoutProof = Object.assign({}, fields, {
        proofPhoto: '',
        proofPhotoInChat: true,
        proofPhotoAt: nowTs
    });

    var maxAttempts = 6;
    var attempt = 0;
    function runAttempt() {
        attempt += 1;
        var payload = attempt <= 2 ? payloadWithProof : payloadWithoutProof;
        _tryCompleteOrderOnce(order.id, actorId, payload, 12000).then(function (res) {
            if (res && res.success) return;
            if (attempt >= maxAttempts) {
                console.warn('Completion retry exhausted for order', order.id, res && res.message ? res.message : 'unknown-error');
                return;
            }
            var waitMs = Math.min(9000, 800 * Math.pow(2, attempt - 1));
            setTimeout(runAttempt, waitMs);
        }).catch(function () {
            if (attempt >= maxAttempts) return;
            var waitMs = Math.min(9000, 800 * Math.pow(2, attempt - 1));
            setTimeout(runAttempt, waitMs);
        });
    }
    runAttempt();
}

function _isProtectedDriverStatus(status) {
    var normalized = String(status || '').toLowerCase();
    return normalized === 'on_the_way'
        || normalized === 'arrived'
        || normalized === 'in_progress'
        || normalized === 'completed';
}

function updateOrderStatus(orderId, newStatus, extraFields) {
    var doneResolve = null;
    var donePromise = new Promise(function (resolve) { doneResolve = resolve; });
    function finish(ok) {
        if (doneResolve) {
            doneResolve(!!ok);
            doneResolve = null;
        }
    }

    var fields = Object.assign({}, extraFields || {});
    var skipGpsGate = !!fields._skipGpsGate;
    if (Object.prototype.hasOwnProperty.call(fields, '_skipGpsGate')) delete fields._skipGpsGate;
    fields.status = newStatus;

    // Keep completion + admin-review flags in a single write to avoid race/rollback.
    if (newStatus === 'completed') {
        if (typeof fields.pendingAdminReview === 'undefined') fields.pendingAdminReview = true;
        if (typeof fields.pendingAdminReviewAt === 'undefined') fields.pendingAdminReviewAt = Date.now();
        if (typeof fields.walletSettled === 'undefined') fields.walletSettled = false;
        if (typeof fields.adminReviewStatus === 'undefined') fields.adminReviewStatus = '';
        if (typeof fields.adminReviewReason === 'undefined') fields.adminReviewReason = '';
        if (typeof fields.adminReviewNote === 'undefined') fields.adminReviewNote = 'Menunggu verifikasi admin';
        if (typeof fields.followUpRequired === 'undefined') fields.followUpRequired = false;
        if (typeof fields.fraudFlag === 'undefined') fields.fraudFlag = false;
    }

    var session = getSession();
    var actorId = session && session.id ? session.id : '';
    if (!actorId && _currentOrder && String(_currentOrder.talentId || '')) {
        actorId = String(_currentOrder.talentId || '');
    }

    var isCurrentOrderTarget = !!(_currentOrder && String(_currentOrder.id) === String(orderId));
    var prevOrderSnapshot = isCurrentOrderTarget ? Object.assign({}, _currentOrder) : null;

    function hasDriverCoords(payload) {
        if (!payload) return false;
        var lat = Number(payload.talentLat);
        var lng = Number(payload.talentLng);
        return isValidLatLng(lat, lng);
    }

    function maybeAttachDriverCoords() {
        var isTalentActor = !!(session && session.role === 'talent');
        var needsProtectedCoords = _isProtectedDriverStatus(newStatus);
        if (!isTalentActor || !needsProtectedCoords || hasDriverCoords(fields)) {
            return Promise.resolve();
        }
        return getCurrentPosition().then(function (pos) {
            if (!pos || !isValidLatLng(pos.lat, pos.lng)) return;
            fields.talentLat = Number(pos.lat);
            fields.talentLng = Number(pos.lng);
            fields.talentLastLocationAt = Date.now();
        }).catch(function () {
            // Keep flow running; backend will return precise validation reason if coords are still unavailable.
        });
    }

    function runStatusUpdate() {
        var isProofCompletion = (newStatus === 'completed') && !!(fields.proofPhoto || fields.proofPhotoInChat);
        var updateAction = isProofCompletion ? 'completeOrderWithProof' : 'updateOrder';

        function postOrderAction(actionName, payloadFields, timeoutMs) {
            var body = { action: actionName, orderId: orderId, fields: payloadFields, actorId: actorId };
            var ms = Math.max(2000, Number(timeoutMs) || 9000);
            return Promise.race([
                backendPost(body),
                new Promise(function (resolve) {
                    setTimeout(function () {
                        resolve({ success: false, message: 'Request timeout' });
                    }, ms);
                })
            ]);
        }

        maybeAttachDriverCoords().then(function () {
            return postOrderAction(updateAction, fields, isProofCompletion ? 12000 : 9000);
        }).then(function (res) {
            var msg = String((res && res.message) || '').toLowerCase();
            var shouldRetryLegacyAction = isProofCompletion
                && (!res || !res.success)
                && (
                    msg.indexOf('unknown post action') >= 0
                    || msg.indexOf('unknown') >= 0
                    || msg.indexOf('timeout') >= 0
                    || msg.indexOf('network') >= 0
                );

            if (shouldRetryLegacyAction) {
                return postOrderAction('updateOrder', fields, 12000).then(function (legacyRes) {
                    if (legacyRes && legacyRes.success) return legacyRes;
                    return res;
                });
            }
            return res;
        }).then(function (res) {
            if ((!res || !res.success) && newStatus === 'completed' && fields.proofPhoto) {
                var msg = String((res && res.message) || '').toLowerCase();
                var shouldRetryWithoutPhoto = !msg
                    || msg.indexOf('payload') >= 0
                    || msg.indexOf('entity too large') >= 0
                    || msg.indexOf('request too large') >= 0
                    || msg.indexOf('size') >= 0
                    || msg.indexOf('json') >= 0;

                if (shouldRetryWithoutPhoto) {
                    var fallbackFields = Object.assign({}, fields, {
                        proofPhoto: '',
                        proofPhotoInChat: true,
                        proofPhotoAt: Date.now()
                    });
                    return postOrderAction('completeOrderWithProof', fallbackFields, 12000).then(function (retryRes) {
                        if ((!retryRes || !retryRes.success) && isProofCompletion) {
                            return postOrderAction('updateOrder', fallbackFields, 12000).then(function (legacyRetryRes) {
                                if (legacyRetryRes && legacyRetryRes.success) return legacyRetryRes;
                                return retryRes;
                            });
                        }
                        return retryRes;
                    }).then(function (retryRes) {
                        if (retryRes && retryRes.success) {
                            fields = fallbackFields;
                            showToast('Status selesai tersimpan. Foto bukti tetap tersedia di chat user.', 'success');
                            return retryRes;
                        }
                        return res;
                    });
                }
            }
            return res;
        }).then(function (res) {
            if (res && res.success) {
                _recordLocalStatusGuard(orderId, newStatus);
                if (isCurrentOrderTarget && _currentOrder) {
                    Object.assign(_currentOrder, fields);
                    refreshTrackingUIFromCurrentOrder();
                }
                showToast('Status diperbarui!', 'success');

                if (newStatus === 'on_the_way') {
                    startTalentLocationBroadcast(orderId);
                }
                if (isTrackingTerminalStatus(newStatus)) {
                    stopTalentLocationBroadcast();
                }

                // Create notifications for order status change
                var notifOrder = isCurrentOrderTarget ? _currentOrder : null;
                if (notifOrder) {
                    var isAntarOrder = notifOrder.skillType === 'js_antar';
                    var isDeliveryOrder = notifOrder.skillType === 'js_delivery';
                    var statusLabels = isAntarOrder
                        ? { accepted: 'Driver Ditemukan', on_the_way: 'Driver Menuju Lokasi', arrived: 'Driver Tiba', in_progress: 'Dalam Perjalanan', completed: 'Sampai Tujuan' }
                        : (isDeliveryOrder
                            ? { accepted: 'Driver Delivery Ditemukan', on_the_way: 'Driver Menuju Jemput', arrived: 'Driver di Titik Jemput', in_progress: 'Menuju Titik Antar', completed: 'Barang Terkirim' }
                            : { accepted: 'Diterima', on_the_way: 'Dalam Perjalanan', arrived: 'Talent Tiba', in_progress: 'Dikerjakan', completed: 'Selesai' });
                    var label = statusLabels[newStatus] || newStatus;
                    var svc = notifOrder.serviceType || notifOrder.skillType || 'Pesanan';
                    // Notify the other party
                    var session = getSession();
                    if (session) {
                        var otherUserId = (session.id === notifOrder.talentId) ? notifOrder.userId : notifOrder.talentId;
                        if (otherUserId) {
                            addNotifItem({ userId: otherUserId, icon: '📦', title: 'Pesanan ' + label, desc: svc + ' - status diperbarui ke ' + label, type: 'order', orderId: notifOrder.id });
                        }
                        // Also notify self
                        addNotifItem({ icon: '📦', title: 'Pesanan ' + label, desc: svc + ' - status diperbarui ke ' + label, type: 'order', orderId: notifOrder.id });
                    }
                }

                // When completed, always push to admin review queue before any payout.
                if (newStatus === 'completed') {
                    var orderRef = notifOrder || { id: orderId };
                    _notifyAdminReviewQueue(orderRef);
                    showToast('Pesanan selesai! Masuk antrian review admin sebelum pencairan komisi.', 'success');
                }

                if (isTrackingTerminalStatus(newStatus)) {
                    setTimeout(function () {
                        closeTrackingToHome();
                    }, 900);
                }
                finish(true);
            } else {
                showToast((res && res.message) ? res.message : 'Gagal update status', 'error');
                finish(false);
            }
        }).catch(function () {
            showToast('Gagal update status', 'error');
            finish(false);
        });
    }

    var mustGpsValidate = !!(session && session.role === 'talent' && !fields.autoProgress && !skipGpsGate);
    var guardOrder = isCurrentOrderTarget ? Object.assign({}, prevOrderSnapshot || _currentOrder) : null;
    var gateTargetType = _getDriverGpsGateTargetType(guardOrder, newStatus);
    if (mustGpsValidate && gateTargetType) {
        var gateRadiusKm = _getDriverGpsGateRadiusKm(guardOrder, gateTargetType, newStatus);
        _verifyDriverAtLocation(guardOrder, gateTargetType, function (isNear, meta) {
            if (!isNear) {
                var distText = (meta && isFinite(Number(meta.distKm))) ? _formatDistanceMeters(Number(meta.distKm)) : '';
                var radiusText = (meta && isFinite(Number(meta.radiusKm))) ? _formatDistanceMeters(Number(meta.radiusKm)) : _formatDistanceMeters(gateRadiusKm);
                var msg = distText
                    ? ('⚠️ Belum sampai titik. Jarak saat ini ' + distText + ' (maks ' + radiusText + ').')
                    : ('⚠️ Belum sampai titik. Dekati lokasi tujuan (maks ' + radiusText + ').');
                showToast(msg, 'error');
                finish(false);
                return;
            }
            runStatusUpdate();
        }, gateRadiusKm);
        return donePromise;
    }

    runStatusUpdate();
    return donePromise;
}

// ══════════════════════════════════════════
// ═══ MAP TRACKING (Leaflet + OSRM) ═══
// ══════════════════════════════════════════
function buildTrackingUserMarkerHtml(order) {
    var session = getSession() || {};
    var users = getUsers() || [];
    var userId = order && order.userId ? String(order.userId) : '';
    var buyer = users.find(function (u) { return String(u.id || '') === userId; }) || null;
    var photo = '';

    if (userId) photo = getProfilePhoto(userId) || '';
    if (!photo && buyer) photo = String(buyer.photo || buyer.foto_url || '').trim();
    if (!photo && session && String(session.id || '') === userId) photo = getProfilePhoto(session.id) || '';

    if (photo) {
        return '<div class="gm-route-avatar-marker"><img class="gm-route-avatar-img" src="' + escapeHtml(photo) + '" alt="User"></div>';
    }

    var fallbackName = String((buyer && buyer.name) || session.name || 'User').trim();
    var fallbackInitial = fallbackName ? fallbackName.charAt(0).toUpperCase() : 'U';
    return '<div class="gm-route-avatar-marker"><span class="gm-route-avatar-fallback">' + escapeHtml(fallbackInitial) + '</span></div>';
}

function initTrackingMap(order) {
    var container = document.getElementById('otpMapContainer');
    if (!container) return;

    if (_otpMap) { _otpMap.remove(); _otpMap = null; }

    var userLat = Number(order.userLat);
    var userLng = Number(order.userLng);
    if (!isValidLatLng(userLat, userLng)) {
        userLat = -6.2;
        userLng = 106.8;
    }

    var talentLat = Number(order.talentLat);
    var talentLng = Number(order.talentLng);
    var storeCoords = getOrderStoreCoords(order);
    if (!isValidLatLng(talentLat, talentLng)) {
        if (storeCoords) {
            talentLat = Number(storeCoords.lat);
            talentLng = Number(storeCoords.lng);
        } else {
            talentLat = userLat;
            talentLng = userLng;
        }
    }

    var isProductOrder = !!(order.skillType === 'js_food' || order.sellerId);
    var isAntar = order.skillType === 'js_antar';
    var destLat = isAntar ? Number(order.destLat) : null;
    var destLng = isAntar ? Number(order.destLng) : null;
    if (!isValidLatLng(destLat, destLng)) {
        destLat = null;
        destLng = null;
    }

    var centerLat = (userLat + talentLat) / 2;
    var centerLng = (userLng + talentLng) / 2;

    _otpLastTalentPos = { lat: talentLat, lng: talentLng };
    _otpLastTalentTs = Date.now();
    _otpSpeedKmh = 0;
    _otpLastRouteRedrawPos = { lat: talentLat, lng: talentLng };
    _otpLastRouteRedrawTs = Date.now();
    _otpEtaMin = 0;
    _otpDriverTrailPoints = [];
    _otpDriverTrailLayers = [];
    _otpAutoFollowPausedUntil = 0;
    _otpMap = L.map(container, { zoomControl: false }).setView([centerLat, centerLng], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 20,
        subdomains: 'abcd'
    }).addTo(_otpMap);
    L.control.zoom({ position: 'bottomright' }).addTo(_otpMap);

    var userIcon = L.divIcon({
        html: buildTrackingUserMarkerHtml(order),
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -17],
        className: 'gm-route-pin-wrapper'
    });
    _otpUserMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(_otpMap).bindPopup(isProductOrder ? 'Lokasi Pembeli' : (isAntar ? 'Titik Jemput' : 'Lokasi Anda'));

    var talentIcon = L.divIcon({
        html: '<div class="gm-driver-marker"><span class="gm-driver-marker-glow"></span><img class="gm-driver-marker-img" src="markdriver.png" alt="Driver" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'is-fallback\');"><span class="gm-driver-marker-fallback">🏍</span></div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20],
        className: 'gm-route-pin-wrapper'
    });
    _otpTalentMarker = L.marker([talentLat, talentLng], { icon: talentIcon }).addTo(_otpMap).bindPopup('Driver');
    if (shouldRenderDriverTrail(order)) {
        pushDriverTrailPoint(talentLat, talentLng);
    }
    bindTrackingMapPremiumEffects();

    syncTrackingPickupMarkerVisibility(order);

    var points = [[talentLat, talentLng]];
    if (!shouldHidePassedSegment(order)) {
        points.push([userLat, userLng]);
    }
    _otpStoreMarker = null;
    if (isProductOrder && storeCoords && isValidLatLng(storeCoords.lat, storeCoords.lng)) {
        var storeIcon = L.divIcon({
            html: '<div class="gm-route-pin dropoff"><span></span></div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14],
            className: 'gm-route-pin-wrapper'
        });
        _otpStoreMarker = L.marker([Number(storeCoords.lat), Number(storeCoords.lng)], { icon: storeIcon }).addTo(_otpMap).bindPopup('Lokasi Toko');
        points.push([Number(storeCoords.lat), Number(storeCoords.lng)]);
    }

    if (isAntar && destLat !== null && destLng !== null) {
        var destIcon = L.divIcon({
            html: '<div class="gm-route-pin dropoff"><span></span></div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14],
            className: 'gm-route-pin-wrapper'
        });
        L.marker([destLat, destLng], { icon: destIcon }).addTo(_otpMap).bindPopup('Tujuan: ' + escapeHtml(String(order.destAddr || '')));
        points.push([destLat, destLng]);
    }

    var bounds = L.latLngBounds(points);
    _otpMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });

    updateTrackingRoute(order, false);

    setTimeout(function () {
        if (_otpMap) {
            _otpMap.invalidateSize();
            updateTrackingMapDepthClass();
        }
    }, 300);
}

function updateTrackingRoute(order, shouldFitBounds) {
    if (!_otpMap || !order) return;
    var endpoints = getTrackingRouteEndpoints(order);
    if (!endpoints) return;

    syncTrackingPickupMarkerVisibility(order);

    fetchAndDrawRoute(endpoints.fromLat, endpoints.fromLng, endpoints.toLat, endpoints.toLng);

    if (!shouldFitBounds) return;
    var points = [[endpoints.fromLat, endpoints.fromLng], [endpoints.toLat, endpoints.toLng]];
    var bounds = L.latLngBounds(points);
    _otpMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
}

function fetchAndDrawRoute(fromLat, fromLng, toLat, toLng) {
    if (!_otpMap) return;
    var url = 'https://router.project-osrm.org/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=full&geometries=geojson';

    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.routes && data.routes.length > 0) {
                _otpEtaMin = Math.max(1, Math.round((Number(data.routes[0].duration) || 0) / 60));
                var coords = data.routes[0].geometry.coordinates.map(function (c) {
                    return [c[1], c[0]];
                });
                if (_otpRouteLine) _otpMap.removeLayer(_otpRouteLine);
                if (_otpRouteFlowLine) _otpMap.removeLayer(_otpRouteFlowLine);
                _otpRouteLine = L.polyline(coords, { color: '#4285F4', weight: 5, opacity: 0.85, lineJoin: 'round', lineCap: 'round', className: 'otp-route-base' }).addTo(_otpMap);
                _otpRouteFlowLine = L.polyline(coords, { color: '#93C5FD', weight: 3, opacity: 0.95, dashArray: '10,14', lineJoin: 'round', lineCap: 'round', className: 'otp-route-flow' }).addTo(_otpMap);
            }
        })
        .catch(function () {
            var fallbackKm = haversineDistance(fromLat, fromLng, toLat, toLng);
            _otpEtaMin = Math.max(1, Math.round(fallbackKm / 0.45));
            if (_otpRouteLine) _otpMap.removeLayer(_otpRouteLine);
            if (_otpRouteFlowLine) _otpMap.removeLayer(_otpRouteFlowLine);
            var straight = [[fromLat, fromLng], [toLat, toLng]];
            _otpRouteLine = L.polyline(straight, { color: '#4285F4', weight: 4, opacity: 0.75, lineJoin: 'round', lineCap: 'round', className: 'otp-route-base' }).addTo(_otpMap);
            _otpRouteFlowLine = L.polyline(straight, { color: '#93C5FD', weight: 3, dashArray: '10,14', opacity: 0.9, lineJoin: 'round', lineCap: 'round', className: 'otp-route-flow' }).addTo(_otpMap);
        });
}

function updateTalentMarkerPosition(lat, lng) {
    var now = Date.now();
    var prev = _otpLastTalentPos;
    var nextPos = { lat: Number(lat), lng: Number(lng) };
    if (!isValidLatLng(nextPos.lat, nextPos.lng)) return;

    var shouldRefreshRoute = true;
    if (prev && _otpLastTalentTs > 0) {
        var deltaSec = Math.max(0.1, (now - _otpLastTalentTs) / 1000);
        var distKm = haversineDistance(prev.lat, prev.lng, nextPos.lat, nextPos.lng);
        var rawKmh = (distKm / deltaSec) * 3600;
        if (isFinite(rawKmh)) {
            if (rawKmh > DRIVER_JUMP_REJECT_SPEED_KMH && distKm > DRIVER_JUMP_REJECT_KM) {
                return;
            }
            _otpSpeedKmh = Math.max(0, Math.min(90, rawKmh));
        }

        // Smooth tiny GPS jitter so marker movement looks stable.
        if (distKm <= DRIVER_SMOOTH_DIST_KM) {
            nextPos.lat = (prev.lat * 0.72) + (nextPos.lat * 0.28);
            nextPos.lng = (prev.lng * 0.72) + (nextPos.lng * 0.28);
        }

        var routeDistKm = _otpLastRouteRedrawPos
            ? haversineDistance(_otpLastRouteRedrawPos.lat, _otpLastRouteRedrawPos.lng, nextPos.lat, nextPos.lng)
            : distKm;
        shouldRefreshRoute = (routeDistKm >= DRIVER_ROUTE_REDRAW_MIN_MOVE_KM)
            || ((now - _otpLastRouteRedrawTs) >= DRIVER_ROUTE_REDRAW_MAX_WAIT_MS);
    }
    _otpLastTalentPos = nextPos;
    _otpLastTalentTs = now;
    if (_otpTalentMarker) {
        _otpTalentMarker.setLatLng([nextPos.lat, nextPos.lng]);
        if (prev) setDriverMarkerHeading(prev.lat, prev.lng, nextPos.lat, nextPos.lng);
    }
    if (shouldRenderDriverTrail(_currentOrder)) {
        pushDriverTrailPoint(nextPos.lat, nextPos.lng);
    } else {
        _otpDriverTrailPoints = [];
        clearDriverTrailLayers();
    }
    if (_otpMap && shouldAutoFollowDriver(nextPos.lat, nextPos.lng)) {
        _otpMap.panTo([nextPos.lat, nextPos.lng], { animate: true, duration: 0.55, easeLinearity: 0.35 });
    }
    if (_currentOrder) {
        _currentOrder.talentLat = nextPos.lat;
        _currentOrder.talentLng = nextPos.lng;
        _refreshDriverGpsLockedButtons(_currentOrder);
        renderTrackingMapRouteCard(_currentOrder, false);
        if (shouldRefreshRoute) {
            updateTrackingRoute(_currentOrder, false);
            _otpLastRouteRedrawPos = { lat: nextPos.lat, lng: nextPos.lng };
            _otpLastRouteRedrawTs = now;
        }
    }
}

function _getTrackingStatusRank(status) {
    var s = String(status || '').toLowerCase();
    var rank = {
        pending_seller: 0,
        preparing: 1,
        searching: 2,
        pending: 3,
        accepted: 4,
        on_the_way: 5,
        arrived: 6,
        in_progress: 7,
        completed: 8,
        rated: 9,
        cancelled: 10,
        rejected: 10
    };
    return Object.prototype.hasOwnProperty.call(rank, s) ? rank[s] : -1;
}

function _recordLocalStatusGuard(orderId, status) {
    var key = String(orderId || '');
    if (!key) return;
    _statusPushGuardByOrder[key] = {
        status: String(status || ''),
        rank: _getTrackingStatusRank(status),
        until: Date.now() + 25000
    };
}

function _isIncomingStatusAllowed(orderId, currentStatus, incomingStatus) {
    var incoming = String(incomingStatus || '');
    var current = String(currentStatus || '');
    if (!incoming || !current || incoming === current) return true;

    if (incoming === 'cancelled' || incoming === 'rejected') return true;
    if (isTrackingTerminalStatus(current) && !isTrackingTerminalStatus(incoming)) return false;

    var incomingRank = _getTrackingStatusRank(incoming);
    var currentRank = _getTrackingStatusRank(current);
    var key = String(orderId || '');
    var guard = _statusPushGuardByOrder[key] || null;

    if (guard && Date.now() > Number(guard.until || 0)) {
        delete _statusPushGuardByOrder[key];
        guard = null;
    }

    if (guard && incomingRank >= 0 && guard.rank >= 0 && incomingRank < guard.rank) return false;

    var session = getSession();
    var isDriverOwnOrder = !!(
        session
        && session.role === 'talent'
        && _currentOrder
        && String(_currentOrder.talentId || '') === String(session.id || '')
    );

    if (isDriverOwnOrder && currentRank >= 5 && incomingRank >= 0 && currentRank >= 0 && incomingRank < currentRank) {
        return false;
    }

    return true;
}

// ══════════════════════════════════════════
// ═══ POLLING (Order status + Location) ═══
// ══════════════════════════════════════════
function startOrderPolling(orderId) {
    stopPolling();
    var session = getSession();
    if (typeof FB !== 'undefined' && FB.isReady()) {
        _fbOrderUnsub = FB.onOrder(orderId, function (order) {
            if (!order || !_currentOrder || String(_currentOrder.id) !== String(orderId)) return;
            var oldStatus = String(_currentOrder.status || '');
            var incomingStatus = String(order.status || '');
            if (!_isIncomingStatusAllowed(orderId, oldStatus, incomingStatus)) return;
            for (var key in order) { _currentOrder[key] = order[key]; }
            if (oldStatus !== order.status) {
                refreshTrackingUIFromCurrentOrder();

                if (isTrackingTerminalStatus(order.status)) {
                    setTimeout(function () {
                        closeTrackingToHome();
                        if (order.status === 'cancelled') showToast('Pesanan dibatalkan. Kembali ke beranda.', 'success');
                        else if (order.status === 'rejected') showToast('Pesanan ditolak. Kembali ke beranda.', 'error');
                        else showToast('Pesanan selesai. Kembali ke beranda.', 'success');
                    }, 900);
                }

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

        // Backup polling if realtime stream drops or device resumes from background sleep.
        _orderFallbackPollTimer = setInterval(function () { pollOrderUpdate(orderId); }, 6000);
    } else {
        pollOrderUpdate(orderId);
        _locationPollTimer = setInterval(function () { pollOrderUpdate(orderId); }, 8000);
    }
}

function stopPolling() {
    if (_locationPollTimer) { clearInterval(_locationPollTimer); _locationPollTimer = null; }
    if (_orderFallbackPollTimer) { clearInterval(_orderFallbackPollTimer); _orderFallbackPollTimer = null; }
    if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
    if (_fbOrderUnsub) { _fbOrderUnsub(); _fbOrderUnsub = null; }
    if (_fbLocUnsub) { _fbLocUnsub(); _fbLocUnsub = null; }
    stopTalentLocationBroadcast();
}

function pollOrderUpdate(orderId) {
    if (!isBackendConnected()) return;
    FB.get('getOrdersByUser', { userId: getSession().id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                var order = res.data.find(function (o) { return String(o.id) === String(orderId); });
                if (order && _currentOrder && String(_currentOrder.id) === String(orderId)) {
                    var oldStatus = String(_currentOrder.status || '');
                    var incomingStatus = String(order.status || '');
                    if (!_isIncomingStatusAllowed(orderId, oldStatus, incomingStatus)) return;
                    for (var key in order) _currentOrder[key] = order[key];

                    if (oldStatus !== order.status) {
                        refreshTrackingUIFromCurrentOrder();

                        if (isTrackingTerminalStatus(order.status)) {
                            setTimeout(function () {
                                closeTrackingToHome();
                                if (order.status === 'cancelled') showToast('Pesanan dibatalkan. Kembali ke beranda.', 'success');
                                else if (order.status === 'rejected') showToast('Pesanan ditolak. Kembali ke beranda.', 'error');
                                else showToast('Pesanan selesai. Kembali ke beranda.', 'success');
                            }, 900);
                        }
                    }

                    if (order.talentLat && order.talentLng) {
                        updateTalentMarkerPosition(Number(order.talentLat), Number(order.talentLng));
                    }
                }
            }
        })
        .catch(function () {});
}

// Radius in km within which driver is considered "arrived"
var GPS_ARRIVE_RADIUS = 0.08; // 80 meters for auto-arrive
var GPS_MANUAL_ACTION_RADIUS = 0.05; // 50 meters for manual action lock/unlock
var GPS_NEARBY_RADIUS = 0.5;  // 500 meters — send "driver nearby" notif
var _nearbyAlertSent = {}; // per orderId, prevent repeat alerts
var _watchPositionId = null;
var _talentLocationIntervalTimer = null;
var _gpsAutoProgressLock = {};
var _statusPushGuardByOrder = {};

function _lockAutoProgress(orderId, toStatus) {
    var k = String(orderId || '') + '::' + String(toStatus || '');
    if (_gpsAutoProgressLock[k]) return false;
    _gpsAutoProgressLock[k] = true;
    setTimeout(function () { delete _gpsAutoProgressLock[k]; }, 6000);
    return true;
}

function _syncCurrentDriverPositionForActiveOrder(orderId, lat, lng) {
    if (!_currentOrder || String(_currentOrder.id) !== String(orderId)) return;
    if (!isValidLatLng(Number(lat), Number(lng))) return;
    _currentOrder.talentLat = Number(lat);
    _currentOrder.talentLng = Number(lng);
    _currentOrder.talentLastLocationAt = Date.now();
    updateTalentMarkerPosition(Number(lat), Number(lng));
    _refreshDriverGpsLockedButtons(_currentOrder);
}

function startTalentLocationBroadcast(orderId) {
    // Use watchPosition for real-time continuous GPS tracking instead of intervals
    if (_watchPositionId !== null) {
        try { navigator.geolocation.clearWatch(_watchPositionId); } catch(e) {}
        _watchPositionId = null;
    }
    if (_talentLocationIntervalTimer) {
        clearInterval(_talentLocationIntervalTimer);
        _talentLocationIntervalTimer = null;
    }

    function onPosition(geoPos) {
        var lat = geoPos.coords.latitude;
        var lng = geoPos.coords.longitude;

        _syncCurrentDriverPositionForActiveOrder(orderId, lat, lng);

        // Update backend with new real-time position
        backendPost({
            action: 'updateTalentLocation',
            orderId: orderId,
            actorId: (getSession() && getSession().id) || '',
            lat: lat,
            lng: lng
        });

        // Auto-advance progress based on coordinates
        _checkGpsAutoProgress(orderId, lat, lng);

        // Notify SW so it can broadcast even if app is minimised
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'DRIVER_LOCATION_UPDATE',
                orderId: orderId,
                lat: lat,
                lng: lng
            });
        }
    }

    if ('geolocation' in navigator) {
        _watchPositionId = navigator.geolocation.watchPosition(
            onPosition,
            function() {},
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
    }

    // Fallback interval in case watchPosition is not reliable
    if (!_talentLocationIntervalTimer) {
        _talentLocationIntervalTimer = setInterval(function () {
            if (!_currentOrder || String(_currentOrder.id) !== String(orderId)) return;
            getCurrentPosition().then(function (pos) {
                _syncCurrentDriverPositionForActiveOrder(orderId, pos.lat, pos.lng);
                backendPost({
                    action: 'updateTalentLocation',
                    orderId: orderId,
                    actorId: (getSession() && getSession().id) || '',
                    lat: pos.lat,
                    lng: pos.lng
                });
                _checkGpsAutoProgress(orderId, pos.lat, pos.lng);
            }).catch(function () {});
        }, 7000);
    }
}

function stopTalentLocationBroadcast() {
    if (_watchPositionId !== null) {
        try { navigator.geolocation.clearWatch(_watchPositionId); } catch(e) {}
        _watchPositionId = null;
    }
    if (_talentLocationIntervalTimer) {
        clearInterval(_talentLocationIntervalTimer);
        _talentLocationIntervalTimer = null;
    }
}

// Auto advance order progress based on GPS proximity
function _checkGpsAutoProgress(orderId, driverLat, driverLng) {
    if (!_currentOrder || String(_currentOrder.id) !== String(orderId)) return;
    var order = _currentOrder;
    var session = getSession();
    if (!session || String(session.id) !== String(order.talentId)) return;

    var isProductOrder = !!(order.skillType === 'js_food' || order.sellerId);
    var isAntar = order.skillType === 'js_antar';
    var isDelivery = order.skillType === 'js_delivery';

    // Check proximity to target and send buyer "driver nearby" alert
    _maybeSendNearbyAlert(order, driverLat, driverLng);

    // Auto-advance: "on_the_way" → "arrived" when driver reaches destination
    if (order.status === 'on_the_way') {
        var targetLat, targetLng;
        if (isProductOrder) {
            var storeCoords = getOrderStoreCoords(order);
            if (storeCoords) {
                targetLat = Number(storeCoords.lat);
                targetLng = Number(storeCoords.lng);
            }
        } else {
            targetLat = Number(order.userLat);
            targetLng = Number(order.userLng);
        }
        if (isValidLatLng(targetLat, targetLng)) {
            var distToTarget = haversineDistance(driverLat, driverLng, targetLat, targetLng);
            if (distToTarget <= GPS_ARRIVE_RADIUS) {
                if (_lockAutoProgress(orderId, 'arrived')) {
                    updateOrderStatus(orderId, 'arrived', { autoProgress: true, autoProgressAt: Date.now() });
                    showToast('✅ Anda telah tiba di lokasi! Status diperbarui otomatis.', 'success');
                }
                return;
            }
        }
    }

    // For non-product/non-passenger service, start work automatically once arrived.
    if (order.status === 'arrived' && !isProductOrder && !isAntar && !isDelivery) {
        var nearUserLat = Number(order.userLat);
        var nearUserLng = Number(order.userLng);
        if (isValidLatLng(nearUserLat, nearUserLng)) {
            var distToUser = haversineDistance(driverLat, driverLng, nearUserLat, nearUserLng);
            if (distToUser <= GPS_ARRIVE_RADIUS && _lockAutoProgress(orderId, 'in_progress')) {
                updateOrderStatus(orderId, 'in_progress', { startedAt: Date.now(), autoProgress: true, autoProgressAt: Date.now() });
            }
        }
    }

    // For delivery/antar: auto-advance "arrived" → "in_progress" NOT automatic,
    // user must confirm pickup. But for food order: driver needs to click pickup.
    // For non-product: "arrived" → driver presses start manually.
    // So no auto-advance beyond "arrived" — driver confirms they have picked up.
}

function _maybeSendNearbyAlert(order, driverLat, driverLng) {
    // If we already sent notification for this order+status, skip
    var alertKey = (order.id || '') + '_' + (order.status || '');
    if (_nearbyAlertSent[alertKey]) return;

    var buyerLat = Number(order.userLat);
    var buyerLng = Number(order.userLng);
    if (!isValidLatLng(buyerLat, buyerLng)) return;

    // Only send "driver nearby" for in_progress status (driver heading to buyer)
    if (order.status !== 'in_progress') return;

    var distToBuyer = haversineDistance(driverLat, driverLng, buyerLat, buyerLng);
    if (distToBuyer <= GPS_NEARBY_RADIUS) {
        _nearbyAlertSent[alertKey] = true;
        // Notify buyer/user
        addNotifItem({
            userId: order.userId,
            icon: '🛵',
            title: 'Driver Sudah Dekat!',
            desc: 'Driver sedang menuju ke lokasimu, siapkan diri ya!',
            type: 'order',
            orderId: order.id
        });
        // Show SW notification to buyer if app is closed
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title: '🛵 Driver Sudah Dekat!',
                body: 'Driver hampir sampai ke lokasimu. Estimasi < 2 menit!',
                tag: 'driver-nearby-' + order.id,
                vibrate: [300, 100, 300, 100, 300],
                requireInteraction: false,
                data: { orderId: order.id, type: 'driver_nearby' }
            });
        }
    }
}

// ══════════════════════════════════════════
// ═══ CHAT SYSTEM ═══
// ══════════════════════════════════════════
function buildChatConversationKey(orderId, userA, userB) {
    var a = String(userA || '').trim();
    var b = String(userB || '').trim();
    if (!a || !b) return '';
    return String(orderId || '').trim() + '::' + [a, b].sort().join('__');
}

function isMessageInActiveChatThread(m, sessionId, targetUserId) {
    if (!m) return false;
    var me = String(sessionId || '').trim();
    var peer = String(targetUserId || '').trim();
    if (!me || !peer) return true;

    var activeKey = buildChatConversationKey(_chatOrderId, me, peer);
    var sender = String(m.senderId || '').trim();
    var recipient = String(m.recipientId || '').trim();

    if (m.conversationKey) {
        var msgKey = String(m.conversationKey || '').trim();
        if (msgKey && msgKey === String(activeKey)) return true;
        // Fallback for legacy/dirty IDs where conversationKey may be malformed.
        if (recipient) {
            return (sender === me && recipient === peer) || (sender === peer && recipient === me);
        }
        return false;
    }

    // Legacy message fallback: infer by sender/recipient pair.
    if (recipient) {
        return (sender === me && recipient === peer) || (sender === peer && recipient === me);
    }

    // Legacy message without recipient/conversation key is ambiguous in 3-party orders.
    // Keep only own legacy messages so old driver/seller/buyer threads don't bleed into each other.
    if (_chatOrderHasThreeParty) {
        return sender === me;
    }

    return sender === me || sender === peer;
}

function openChat(order, preferredTargetId) {
    _chatOrderId = order.id;
    _chatTargetUserId = '';
    _chatOrderHasThreeParty = false;
    _chatMessages = [];
    _chatPageOpen = true;
    var page = document.getElementById('chatPage');
    if (!page) return;

    var session = getSession();
    var users = getUsers();
    var targetId = preferredTargetId || '';
    if (!targetId && session) {
        if (session.id === order.userId) {
            targetId = order.talentId || order.sellerId || '';
        } else if (session.id === order.sellerId) {
            targetId = order.talentId || order.userId || '';
        } else if (session.id === order.talentId) {
            targetId = order.userId || order.sellerId || '';
        }
    }
    _chatTargetUserId = targetId || '';
    if (_chatTargetUserId) {
        clearChatBadgeForUser(_chatTargetUserId);
    } else {
        clearChatBadge();
    }
    _chatOrderHasThreeParty = !!(order && order.userId && order.sellerId && order.talentId);
    var other = users.find(function (u) { return u.id === targetId; });
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
                var sessionNow = getSession();
                var me = sessionNow ? sessionNow.id : '';
                _chatMessages = res.data.filter(function (m) {
                    return isMessageInActiveChatThread(m, me, _chatTargetUserId);
                });
                renderChatMessages();
            }
        });
    } else {
        fetchChatMessages(order.id, _chatTargetUserId);
        _chatPollTimer = setInterval(function () { fetchChatMessages(order.id, _chatTargetUserId); }, 5000);
    }

    if (!page._eventsSetup) {
        page._eventsSetup = true;
        document.getElementById('chatBtnBack').addEventListener('click', function () {
            page.classList.add('hidden');
            _chatPageOpen = false;
            _chatTargetUserId = '';
            _chatOrderHasThreeParty = false;
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

function fetchChatMessages(orderId, targetUserId) {
    if (!isBackendConnected()) return;
    FB.get('getMessages', { orderId: orderId })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                var sessionNow = getSession();
                var me = sessionNow ? sessionNow.id : '';
                var target = targetUserId || _chatTargetUserId || '';
                _chatMessages = res.data.filter(function (m) {
                    return isMessageInActiveChatThread(m, me, target);
                });
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
    if (!_chatTargetUserId) {
        showToast('Lawan chat tidak ditemukan', 'error');
        return;
    }
    var input = document.getElementById('chatInput');
    var text = (input.value || '').trim();
    if (!text && !photo) return;

    var conversationKey = buildChatConversationKey(_chatOrderId, session.id, _chatTargetUserId);

    var msgData = {
        action: 'sendMessage',
        orderId: _chatOrderId,
        senderId: session.id,
        recipientId: _chatTargetUserId,
        conversationKey: conversationKey,
        senderName: session.name,
        text: text,
        photo: photo || ''
    };

    input.value = '';

    _chatMessages.push({
        senderId: session.id,
        recipientId: _chatTargetUserId,
        conversationKey: conversationKey,
        senderName: session.name,
        text: text,
        photo: photo || '',
        createdAt: Date.now()
    });
    renderChatMessages();

    backendPost(msgData).catch(function () { showToast('Gagal mengirim pesan', 'error'); });
}

function _sendDriverProofToUserChat(order, proofPhoto) {
    if (!order || !order.id || !proofPhoto) return Promise.resolve(false);
    var session = (typeof getSession === 'function') ? getSession() : null;
    var userId = String(order.userId || order.user_id || '').trim();
    var driverId = String(order.talentId || order.talent_id || (session && session.id) || '').trim();
    if (!userId || !driverId) return Promise.resolve(false);

    var senderId = session && session.id ? String(session.id).trim() : driverId;
    if (!senderId) senderId = driverId;
    var users = (typeof getUsers === 'function') ? getUsers() : [];
    var senderUser = users.find(function (u) { return String(u.id) === senderId; }) || {};
    var senderName = String((session && session.name) || senderUser.name || senderUser.nama || 'Driver');
    var conversationKey = buildChatConversationKey(order.id, userId, driverId);

    function postProofMessage(payload) {
        return Promise.race([
            Promise.resolve().then(function () {
                return backendPost(payload);
            }),
            new Promise(function (resolve) {
                setTimeout(function () {
                    resolve({ success: false, message: 'Request timeout' });
                }, 9000);
            })
        ]).then(function (res) {
            return !!(res && res.success);
        }).catch(function () {
            return false;
        });
    }

    var primaryPayload = {
        action: 'sendMessage',
        orderId: order.id,
        senderId: senderId,
        recipientId: userId,
        conversationKey: conversationKey,
        senderName: senderName,
        text: '📷 Bukti penyelesaian pesanan dari driver.',
        photo: proofPhoto
    };

    return postProofMessage(primaryPayload).then(function (ok) {
        if (ok) return true;
        return new Promise(function (resolve) {
            setTimeout(resolve, 450);
        }).then(function () {
            var fallbackPayload = Object.assign({}, primaryPayload, {
                senderId: driverId,
                senderName: senderName || 'Driver',
                conversationKey: '',
                recipientId: userId
            });
            return postProofMessage(fallbackPayload);
        });
    }).then(function (ok) {
        if (ok && typeof addNotifItem === 'function') {
            addNotifItem({
                userId: userId,
                icon: '📷',
                title: 'Bukti Foto dari Driver',
                desc: 'Driver mengirim bukti foto penyelesaian untuk pesanan #' + String(order.id || '').substr(0, 8) + '.',
                type: 'chat',
                orderId: order.id
            });
        }
        return !!ok;
    });
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
    var sellerWrap = document.getElementById('ratingSellerSection');
    var sellerNameEl = document.getElementById('ratingSellerName');
    var sellerReviewEl = document.getElementById('ratingSellerReview');
    _ratingSellerValue = 0;

    if (sellerWrap) {
        if (order.sellerId) {
            var seller = users.find(function (u) { return u.id === order.sellerId; });
            var sellerStore = null;
            if (typeof _slpAllStores !== 'undefined' && Array.isArray(_slpAllStores) && _slpAllStores.length > 0) {
                sellerStore = _slpAllStores.find(function (s) {
                    return String(s.id) === String(order.storeId || '') || String(s.userId) === String(order.sellerId || '');
                }) || null;
            }
            var sellerDisplayName = order.storeName || (sellerStore && sellerStore.name) || (seller && seller.name) || 'Toko';
            sellerWrap.classList.remove('hidden');
            if (sellerNameEl) sellerNameEl.textContent = sellerDisplayName;
            if (sellerReviewEl) sellerReviewEl.value = '';
            document.querySelectorAll('#ratingSellerStars .star').forEach(function (s) { s.classList.remove('active'); });
        } else {
            sellerWrap.classList.add('hidden');
        }
    }

    document.querySelectorAll('#ratingStars .star').forEach(function (s) { s.classList.remove('active'); });

    page.classList.remove('hidden');
    page.scrollTop = 0;
    var ratingContent = page.querySelector('.rating-content');
    if (ratingContent) ratingContent.scrollTop = 0;

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
        document.querySelectorAll('#ratingSellerStars .star').forEach(function (star) {
            star.addEventListener('click', function () {
                _ratingSellerValue = parseInt(this.dataset.val, 10);
                document.querySelectorAll('#ratingSellerStars .star').forEach(function (s) {
                    s.classList.toggle('active', parseInt(s.dataset.val, 10) <= _ratingSellerValue);
                });
            });
        });
        document.getElementById('ratingSubmitBtn').addEventListener('click', function () { submitRating(); });
    }
}

var _ratingSellerValue = 0;

function submitRating() {
    if (!_ratingOrder || _ratingValue < 1) { showToast('Pilih rating terlebih dahulu', 'error'); return; }
    var review = (document.getElementById('ratingReview').value || '').trim();

    var sellerRating = null;
    var sellerReview = '';
    var isProductOrder = !!_ratingOrder.sellerId;
    if (isProductOrder) {
        sellerRating = Number(_ratingSellerValue) || 0;
        if (!sellerRating || sellerRating < 1 || sellerRating > 5) {
            showToast('Silakan beri rating untuk penjual', 'error');
            return;
        }
        sellerReview = (document.getElementById('ratingSellerReview').value || '').trim();
    }

    backendPost({
        action: 'rateOrder',
        orderId: _ratingOrder.id,
        rating: _ratingValue,
        review: review,
        ratedAt: Date.now(),
        sellerRating: sellerRating,
        sellerReview: sellerReview
    }).then(function (res) {
        if (res && res.success) {
            showToast('Rating berhasil dikirim! Terima kasih 🎉', 'success');
            document.getElementById('ratingPage').classList.add('hidden');
            try { localStorage.removeItem('js_rating_prompt_seen_' + _ratingOrder.id); } catch (e) {}

            // Keep local objects in sync so CTA rating does not reappear.
            _ratingOrder.status = 'rated';
            _ratingOrder.rating = _ratingValue;
            _ratingOrder.review = review;
            _ratingOrder.ratedAt = Date.now();
            if (sellerRating) _ratingOrder.sellerRating = sellerRating;
            if (sellerReview) _ratingOrder.sellerReview = sellerReview;

            if (_ratingOrder.talentId) delete _talentRatingsCache[_ratingOrder.talentId];
            if (_currentOrder && String(_currentOrder.id) === String(_ratingOrder.id)) {
                _currentOrder.status = 'rated';
                _currentOrder.rating = _ratingValue;
                _currentOrder.review = review;
                _currentOrder.ratedAt = Date.now();
                if (sellerRating) _currentOrder.sellerRating = sellerRating;
                if (sellerReview) _currentOrder.sellerReview = sellerReview;
                var session = getSession();
                renderTrackingProgress(_currentOrder);
                renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
            }

            if (_ratingOrder.sellerId && sellerRating) {
                addNotifItem({
                    userId: _ratingOrder.sellerId,
                    icon: '⭐',
                    title: 'Rating Penjual Baru',
                    desc: 'Anda mendapat rating ' + sellerRating + '/5 dari pembeli',
                    type: 'order',
                    orderId: _ratingOrder.id
                });
            }
            var olp = document.getElementById('ordersListPage');
            if (olp && !olp.classList.contains('hidden')) openOrdersList();
            refreshUnratedRatingReminder({ ignoreSnooze: true });
        } else {
            showToast('Gagal mengirim rating', 'error');
        }
    });
}

// ══════════════════════════════════════════
// ═══ SETTINGS / AKUN PAGE ═══
// ══════════════════════════════════════════
var _ordersUiSettingsCache = null;

function loadOrdersUiSettings(forceRefresh) {
    if (_ordersUiSettingsCache && !forceRefresh) {
        return Promise.resolve(_ordersUiSettingsCache);
    }
    if (!isBackendConnected()) {
        _ordersUiSettingsCache = {};
        return Promise.resolve(_ordersUiSettingsCache);
    }
    return FB.get('getSettings')
        .then(function (r) { return r.json(); })
        .then(function (res) {
            _ordersUiSettingsCache = (res && res.success && res.data) ? res.data : {};
            return _ordersUiSettingsCache;
        })
        .catch(function () {
            _ordersUiSettingsCache = {};
            return _ordersUiSettingsCache;
        });
}

function openSettingsPage() {
    if (typeof AccountPage !== 'undefined') {
        AccountPage.open();
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

    Promise.all([
        FB.get('getOrdersByUser', { userId: session.id }).then(function (r) { return r.json(); }),
        loadOrdersUiSettings(true)
    ])
        .then(function (allRes) {
            var res = allRes[0];
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

    function orderSortTimestamp(o, forCompletedTab) {
        if (!o) return 0;
        var isDone = o.status === 'completed' || o.status === 'rated';
        if (forCompletedTab || isDone) {
            return Number(o.ratedAt || o.completedAt || o.updatedAt || o.createdAt || 0);
        }
        return Number(o.updatedAt || o.createdAt || 0);
    }

    filtered = filtered.slice().sort(function (a, b) {
        return orderSortTimestamp(b, filter === 'completed') - orderSortTimestamp(a, filter === 'completed');
    });

    renderOrderCards(filtered);
}

function renderOrderCards(orders) {
    var list = document.getElementById('olpList');
    if (!list) return;
    var session = getSession();
    var users = getUsers();
    var isSellerRole = !!(session && (session.role === 'penjual' || session.role === 'seller'));

    if (orders.length === 0) {
        list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📭</div><p>Tidak ada pesanan</p></div>';
        return;
    }

    list.innerHTML = orders.map(function (o, idx) {
        var isTalent = session && session.id === o.talentId;
        var other = users.find(function (u) { return u.id === (isTalent ? o.userId : o.talentId); });
        var otherName = other ? other.name : 'Unknown';
        var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
        var doneTs = Number(o.ratedAt || o.completedAt || o.updatedAt || o.createdAt || 0);
        var activeTs = Number(o.updatedAt || o.createdAt || 0);
        var displayTs = (o.status === 'completed' || o.status === 'rated') ? doneTs : activeTs;
        var dateText = new Date(displayTs || Date.now()).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        var statusText = STATUS_LABELS[o.status] || o.status;
        var isDone = o.status === 'completed' || o.status === 'rated';

        if (isSellerRole && isDone) {
            var buyer = users.find(function (u) { return u.id === o.userId; });
            var driver = users.find(function (u) { return u.id === o.talentId; });
            var buyerName = buyer ? buyer.name : 'Pembeli';
            var driverName = driver ? driver.name : 'Belum ada driver';

            var items = o.items;
            if (typeof items === 'string') {
                try { items = JSON.parse(items); } catch (e) { items = []; }
            }
            if (!Array.isArray(items)) items = [];
            var totalQty = Number(o.totalQty) || items.reduce(function (sum, it) {
                return sum + (Number((it && (it.qty || it.quantity)) || 0) || 0);
            }, 0);
            if (!totalQty || totalQty < 1) totalQty = 1;

            var subtotal = Number(o.price) || 0;
            var sellerCommissionSetting = (typeof _penjualSettingsCache !== 'undefined' && _penjualSettingsCache)
                ? _penjualSettingsCache.commission_penjual_percent
                : null;
            var commissionPercent = Number(o.commissionPercent || sellerCommissionSetting || 10);
            if (!isFinite(commissionPercent) || commissionPercent < 0) commissionPercent = 10;
            var commissionAmount = Number(o.commissionAmount);
            if (!isFinite(commissionAmount) || commissionAmount < 0) {
                commissionAmount = Math.round(subtotal * commissionPercent / 100);
            }
            var sellerNet = Math.max(0, subtotal - commissionAmount);

            var paymentLabel = (o.paymentMethod === 'cod') ? 'Tunai (COD)' : 'JsPay';
            var paymentChipClass = (o.paymentMethod === 'cod') ? 'is-cod' : 'is-jspay';
            var finishedAt = new Date(displayTs || Date.now()).toLocaleString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            var orderCode = String(o.id || '').slice(0, 10);

            var financeRows = '<div class="olp-seller-fin-row"><span>Nilai Produk Terjual</span><strong>' + formatRupiah(subtotal) + '</strong></div>';
            financeRows += '<div class="olp-seller-fin-row"><span>Potongan Komisi (' + commissionPercent + '%)</span><strong>-' + formatRupiah(commissionAmount) + '</strong></div>';
            financeRows += '<div class="olp-seller-fin-row total"><span>Diterima Seller</span><strong>' + formatRupiah(sellerNet) + '</strong></div>';

            var sellerRatingHtml = '';
            if (o.status === 'rated' && Number(o.sellerRating) > 0) {
                var sr = Math.max(1, Math.min(5, Math.round(Number(o.sellerRating) || 0)));
                var stars = '';
                for (var st = 1; st <= 5; st++) stars += (st <= sr ? '★' : '☆');
                sellerRatingHtml = '<div class="olp-seller-rating">⭐ Rating Seller: <strong>' + sr + '/5</strong> <span>' + stars + '</span></div>';
            }

            return '<div class="olp-card olp-card-seller" data-idx="' + idx + '">'
                + '<div class="olp-card-top">'
                + '<div class="olp-card-service">' + escapeHtml(o.serviceType || o.skillType || 'Pesanan Produk') + '</div>'
                + '<span class="otp-status-badge status-' + o.status + '">' + statusText + '</span>'
                + '</div>'
                + '<div class="olp-seller-people">'
                + '<div class="olp-seller-line">👤 Pembeli: <strong>' + escapeHtml(buyerName) + '</strong></div>'
                + '<div class="olp-seller-line">🛵 Driver: <strong>' + escapeHtml(driverName) + '</strong></div>'
                + '</div>'
                + '<div class="olp-seller-meta">'
                + '<span class="olp-seller-chip">' + totalQty + ' item</span>'
                + '<span class="olp-seller-chip ' + paymentChipClass + '">' + escapeHtml(paymentLabel) + '</span>'
                + '<span class="olp-seller-chip">#' + escapeHtml(orderCode) + '</span>'
                + '</div>'
                + '<div class="olp-seller-finance">'
                + financeRows
                + '</div>'
                + sellerRatingHtml
                + '<div class="olp-seller-finished">Selesai: ' + escapeHtml(finishedAt) + '</div>'
                + '</div>';
        }

        if (isTalent && isDone) {
            var buyer2 = users.find(function (u) { return u.id === o.userId; });
            var seller2 = users.find(function (u) { return u.id === o.sellerId; });
            var buyerName2 = buyer2 ? buyer2.name : 'Customer';
            var sellerStoreName2 = o.storeName || (seller2 ? seller2.name : 'Toko');
            var settings3 = (typeof _ordersUiSettingsCache !== 'undefined' && _ordersUiSettingsCache) ? _ordersUiSettingsCache : {};

            var isProductDelivery = !!(o.sellerId && String(o.sellerId) !== String(o.talentId));
            var subtotal3 = Number(o.price) || 0;
            var deliveryFee3 = Number(o.deliveryFee) || 0;
            var platformFee3 = Number(o.fee) || 0;
            var paymentMethod3 = String(o.paymentMethod || 'jspay').toLowerCase();
            var isCOD3 = paymentMethod3 === 'cod';

            var feeAmountSetting3 = Number(settings3.service_fee_amount);
            if (!isFinite(feeAmountSetting3) || feeAmountSetting3 < 0) {
                feeAmountSetting3 = platformFee3;
            }

            var cfgCommission3 = Number(isProductDelivery ? settings3.commission_penjual_percent : settings3.commission_talent_percent);
            var commissionPercent3 = Number(o.commissionPercent);
            if (!isFinite(commissionPercent3) || commissionPercent3 < 0) {
                commissionPercent3 = (isFinite(cfgCommission3) && cfgCommission3 >= 0) ? cfgCommission3 : (isProductDelivery ? 10 : 15);
            }
            var commissionAmount3 = Number(o.commissionAmount);
            if (!isFinite(commissionAmount3) || commissionAmount3 < 0) {
                commissionAmount3 = Math.round(subtotal3 * commissionPercent3 / 100);
            }

            var grossDriverIncome = isProductDelivery ? deliveryFee3 : subtotal3;
            var driverDeduction = 0;
            if (isCOD3) {
                driverDeduction = platformFee3 + commissionAmount3;
            } else if (!isProductDelivery) {
                driverDeduction = commissionAmount3;
            }
            var driverNet = grossDriverIncome - driverDeduction;

            var paymentLabel3 = isCOD3 ? 'Tunai (COD)' : 'JsPay';
            var paymentChipClass3 = isCOD3 ? 'is-cod' : 'is-jspay';
            var finishedAt3 = new Date(displayTs || Date.now()).toLocaleString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            var orderCode3 = String(o.id || '').slice(0, 10);

            var coreIncomeLabel = isProductDelivery ? 'Pendapatan Antar (Ongkir)' : 'Nilai Jasa Driver';
            var commissionLabel3 = isProductDelivery ? 'Komisi Seller (' + commissionPercent3 + '%)' : 'Komisi Driver (' + commissionPercent3 + '%)';
            var feeLabel = isCOD3
                ? 'Biaya Platform (Nominal)'
                : 'Biaya Platform (Nominal, dibayar customer)';
            var feePrefix = isCOD3 ? '-' : '';
            var commissionPrefix = (!isCOD3 && isProductDelivery) ? '' : '-';

            var financeRows3 = '<div class="olp-driver-fin-row"><span>' + coreIncomeLabel + '</span><strong>' + formatRupiah(grossDriverIncome) + '</strong></div>';
            financeRows3 += '<div class="olp-driver-fin-row"><span>' + commissionLabel3 + '</span><strong>' + commissionPrefix + formatRupiah(commissionAmount3) + '</strong></div>';
            financeRows3 += '<div class="olp-driver-fin-row"><span>' + feeLabel + '</span><strong>' + feePrefix + formatRupiah(platformFee3) + '</strong></div>';
            financeRows3 += '<div class="olp-driver-fin-row total"><span>Estimasi Diterima Driver</span><strong>' + (driverNet < 0 ? '-' : '') + formatRupiah(Math.abs(driverNet)) + '</strong></div>';

            var payoutHint3 = isCOD3
                ? 'COD: potongan platform diproses dari saldo driver.'
                : 'JsPay: pendapatan driver masuk otomatis ke wallet.';
            if (platformFee3 > 0) {
                payoutHint3 += ' Biaya platform nominal: ' + formatRupiah(platformFee3) + '.';
                if (feeAmountSetting3 > 0 && Math.round(feeAmountSetting3) !== Math.round(platformFee3)) {
                    payoutHint3 += ' (Setting owner saat ini: ' + formatRupiah(feeAmountSetting3) + ')';
                }
            }

            return '<div class="olp-card olp-card-driverdone" data-idx="' + idx + '">'
                + '<div class="olp-card-top">'
                + '<div class="olp-card-service">' + escapeHtml(o.serviceType || o.skillType || 'Pesanan Driver') + '</div>'
                + '<span class="otp-status-badge status-' + o.status + '">' + statusText + '</span>'
                + '</div>'
                + '<div class="olp-driver-people">'
                + '<div class="olp-driver-line">👤 Customer: <strong>' + escapeHtml(buyerName2) + '</strong></div>'
                + (isProductDelivery ? '<div class="olp-driver-line">🏪 Toko: <strong>' + escapeHtml(sellerStoreName2) + '</strong></div>' : '')
                + '</div>'
                + '<div class="olp-driver-meta">'
                + '<span class="olp-driver-chip ' + paymentChipClass3 + '">' + escapeHtml(paymentLabel3) + '</span>'
                + '<span class="olp-driver-chip">#' + escapeHtml(orderCode3) + '</span>'
                + (isProductDelivery ? '<span class="olp-driver-chip">Order Toko</span>' : '<span class="olp-driver-chip">Order Jasa</span>')
                + '</div>'
                + '<div class="olp-driver-finance">'
                + financeRows3
                + '</div>'
                + '<div class="olp-driver-hint">' + escapeHtml(payoutHint3) + '</div>'
                + '<div class="olp-driver-finished">Selesai: ' + escapeHtml(finishedAt3) + '</div>'
                + '</div>';
        }

        if (!isTalent && !isSellerRole && isDone) {
            var seller = users.find(function (u) { return u.id === o.sellerId; });
            var driver2 = users.find(function (u) { return u.id === o.talentId; });
            var cachedStore = null;
            if (typeof _slpAllStores !== 'undefined' && Array.isArray(_slpAllStores) && _slpAllStores.length > 0) {
                cachedStore = _slpAllStores.find(function (s) {
                    return String(s.id) === String(o.storeId || '') || String(s.userId) === String(o.sellerId || '');
                }) || null;
            }
            var sellerName = (o.storeName || (cachedStore && cachedStore.name) || (seller && seller.name) || 'Toko');
            var driverName2 = driver2 ? driver2.name : 'Belum ada driver';

            var items2 = o.items;
            if (typeof items2 === 'string') {
                try { items2 = JSON.parse(items2); } catch (e2) { items2 = []; }
            }
            if (!Array.isArray(items2)) items2 = [];

            var itemCount = items2.reduce(function (sum, it) {
                return sum + (Number((it && (it.qty || it.quantity)) || 0) || 0);
            }, 0);
            if (!itemCount || itemCount < 1) itemCount = Number(o.totalQty) || 1;

            var itemPreview = items2.slice(0, 2).map(function (it) {
                var nm = escapeHtml((it && (it.name || it.title)) ? String(it.name || it.title) : 'Item');
                var q = Number((it && (it.qty || it.quantity)) || 1) || 1;
                return '<li>' + nm + ' <strong>x' + q + '</strong></li>';
            }).join('');
            if (!itemPreview) itemPreview = '<li>Detail item tersedia di pelacakan pesanan</li>';
            if (items2.length > 2) itemPreview += '<li>+' + (items2.length - 2) + ' item lainnya</li>';

            var subtotal2 = Number(o.price) || 0;
            var deliveryFee2 = Number(o.deliveryFee) || 0;
            var serviceFee2 = Number(o.fee) || 0;
            var discount2 = Number(o.discountAmount || o.discount) || 0;
            var grossTotal = subtotal2 + deliveryFee2 + serviceFee2;
            var totalPaid = Number(o.totalCost);
            if (!isFinite(totalPaid) || totalPaid <= 0) totalPaid = Math.max(0, grossTotal - discount2);
            if ((!discount2 || discount2 < 0) && totalPaid > 0 && grossTotal > totalPaid) {
                discount2 = grossTotal - totalPaid;
            }

            var paymentLabel2 = (o.paymentMethod === 'cod') ? 'Tunai (COD)' : 'JsPay';
            var finishedAt2 = new Date(displayTs || Date.now()).toLocaleString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            var orderCode2 = String(o.id || '').slice(0, 10);

            var ratingBadge = '';
            var ratingRow = '';
            if (o.status === 'rated' && Number(o.rating) > 0) {
                var rr = Math.max(1, Math.min(5, Math.round(Number(o.rating) || 0)));
                var stars2 = '';
                for (var rs = 1; rs <= 5; rs++) stars2 += (rs <= rr ? '★' : '☆');
                ratingBadge = '<span class="olp-ud-chip is-rated">⭐ Dinilai ' + rr + '/5</span>';
                var reviewText = o.review ? ' · <em>' + escapeHtml(String(o.review).substr(0, 48)) + (o.review.length > 48 ? '…' : '') + '</em>' : '';
                ratingRow = '<div class="olp-rated-badge">' + stars2 + reviewText + '</div>';
            } else {
                ratingBadge = '<span class="olp-ud-chip is-unrated">Belum dinilai</span>';
                ratingRow = '<button class="olp-rate-btn" data-ridx="' + idx + '">⭐ Beri Rating Sekarang</button>';
            }

            var discountRow = discount2 > 0
                ? '<div class="olp-ud-fin-row"><span>Hemat Diskon</span><strong>-' + formatRupiah(discount2) + '</strong></div>'
                : '';

            return '<div class="olp-card olp-card-userdone" data-idx="' + idx + '">'
                + '<div class="olp-card-top">'
                + '<div class="olp-card-service">' + escapeHtml(o.serviceType || o.skillType || 'Pesanan Saya') + '</div>'
                + '<span class="otp-status-badge status-' + o.status + '">' + statusText + '</span>'
                + '</div>'
                + '<div class="olp-ud-subtitle">' + itemCount + ' item dibeli • #' + escapeHtml(orderCode2) + '</div>'
                + '<div class="olp-ud-chips">'
                + '<span class="olp-ud-chip">' + escapeHtml(paymentLabel2) + '</span>'
                + ratingBadge
                + '</div>'
                + '<div class="olp-ud-people">'
                + '<div>🏪 Toko: <strong>' + escapeHtml(sellerName) + '</strong></div>'
                + '<div>🛵 Driver: <strong>' + escapeHtml(driverName2) + '</strong></div>'
                + '</div>'
                + '<ul class="olp-ud-items">' + itemPreview + '</ul>'
                + '<div class="olp-ud-finance">'
                + '<div class="olp-ud-fin-row"><span>Total Belanja</span><strong>' + formatRupiah(subtotal2) + '</strong></div>'
                + '<div class="olp-ud-fin-row"><span>Biaya Pengantaran + Layanan</span><strong>' + formatRupiah(deliveryFee2 + serviceFee2) + '</strong></div>'
                + discountRow
                + '<div class="olp-ud-fin-row total"><span>Total Dibayar</span><strong>' + formatRupiah(totalPaid) + '</strong></div>'
                + '</div>'
                + '<div class="olp-ud-finished">Selesai: ' + escapeHtml(finishedAt2) + '</div>'
                + '<div class="olp-rate-row">' + ratingRow + '</div>'
                + '</div>';
        }

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
// ═══ TALENT EARNINGS MODAL ═══
// ══════════════════════════════════════════
function _talentOrderTimestamp(order) {
    return Number(order.completedAt || order.ratedAt || order.updatedAt || order.createdAt || 0);
}

function _getDriverNetIncome(order) {
    if (!order) return 0;

    var isProductDelivery = !!(order.sellerId && String(order.sellerId) !== String(order.talentId));
    var subtotal = Number(order.price) || 0;
    var deliveryFee = Number(order.deliveryFee) || 0;
    var platformFee = Number(order.fee) || 0;
    var paymentMethod = String(order.paymentMethod || 'jspay').toLowerCase();
    var isCOD = paymentMethod === 'cod';

    var defaultCommissionPercent = isProductDelivery ? 10 : 15;
    var commissionPercent = Number(order.commissionPercent);
    if (!isFinite(commissionPercent) || commissionPercent < 0) {
        commissionPercent = defaultCommissionPercent;
    }

    var commissionAmount = Number(order.commissionAmount);
    if (!isFinite(commissionAmount) || commissionAmount < 0) {
        commissionAmount = Math.round(subtotal * commissionPercent / 100);
    }

    var grossDriverIncome = isProductDelivery ? deliveryFee : subtotal;
    var driverDeduction = 0;
    if (isCOD) {
        driverDeduction = platformFee + commissionAmount;
    } else if (!isProductDelivery) {
        driverDeduction = commissionAmount;
    }

    return grossDriverIncome - driverDeduction;
}

function _buildTalentEarningsData(orders, talentId) {
    var myCompleted = orders.filter(function (o) {
        return o.talentId === talentId && (o.status === 'completed' || o.status === 'rated');
    });

    myCompleted.sort(function (a, b) { return _talentOrderTimestamp(b) - _talentOrderTimestamp(a); });

    var now = new Date();
    var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var startWeek = startToday - (6 * 24 * 60 * 60 * 1000);

    var total = 0;
    var today = 0;
    var week = 0;
    var grouped = {};

    myCompleted.forEach(function (o) {
        var amount = _getDriverNetIncome(o);
        var ts = _talentOrderTimestamp(o);
        var service = o.serviceType || o.skillType || 'Layanan Lain';

        total += amount;
        if (ts >= startToday) today += amount;
        if (ts >= startWeek) week += amount;

        if (!grouped[service]) grouped[service] = { name: service, amount: 0, count: 0 };
        grouped[service].amount += amount;
        grouped[service].count += 1;
    });

    var serviceSummary = Object.keys(grouped).map(function (k) { return grouped[k]; })
        .sort(function (a, b) { return b.amount - a.amount; })
        .slice(0, 3);

    return {
        total: total,
        today: today,
        week: week,
        jobs: myCompleted.length,
        avg: myCompleted.length ? Math.round(total / myCompleted.length) : 0,
        services: serviceSummary,
        recent: myCompleted.slice(0, 20)
    };
}

function _formatTalentOrderDate(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' • '
        + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function _closeTalentEarningsModal() {
    var modal = document.getElementById('talentEarningModal');
    if (modal) modal.remove();
    resetBottomNavToHome();
}

function _renderTalentEarningsModalContent(container, session, orders) {
    var stats = _buildTalentEarningsData(orders, session.id);

    var servicesHtml = '';
    if (stats.services.length > 0) {
        servicesHtml = stats.services.map(function (s) {
            return '<div class="te-service-item">'
                + '<div class="te-service-main">'
                + '<div class="te-service-name">' + escapeHtml(s.name) + '</div>'
                + '<div class="te-service-count">' + s.count + ' pesanan</div>'
                + '</div>'
                + '<div class="te-service-amount">' + formatRupiah(s.amount) + '</div>'
                + '</div>';
        }).join('');
    } else {
        servicesHtml = '<div class="te-empty-inline">Belum ada layanan selesai.</div>';
    }

    var recentHtml = '';
    if (stats.recent.length > 0) {
        recentHtml = stats.recent.map(function (o) {
            var amount = _getDriverNetIncome(o);
            var status = o.status === 'rated' ? 'Dinilai' : 'Selesai';
            return '<div class="te-tx-item">'
                + '<div class="te-tx-left">'
                + '<div class="te-tx-title">' + escapeHtml(o.serviceType || o.skillType || 'Layanan') + '</div>'
                + '<div class="te-tx-meta">' + _formatTalentOrderDate(_talentOrderTimestamp(o)) + ' • ' + status + '</div>'
                + '</div>'
                + '<div class="te-tx-amount">' + formatRupiah(amount) + '</div>'
                + '</div>';
        }).join('');
    } else {
        recentHtml = '<div class="te-empty">'
            + '<div class="te-empty-icon">💼</div>'
            + '<p>Belum ada pendapatan. Selesaikan pesanan pertama Anda.</p>'
            + '</div>';
    }

    container.innerHTML = '<div class="te-header-card">'
        + '<div class="te-header-label">Total Pendapatan</div>'
        + '<div class="te-header-total">' + formatRupiah(stats.total) + '</div>'
        + '<div class="te-header-sub">' + stats.jobs + ' pesanan selesai • Rata-rata ' + formatRupiah(stats.avg) + '/pesanan</div>'
        + '</div>'
        + '<div class="te-kpi-grid">'
        + '<div class="te-kpi"><span class="te-kpi-label">Hari Ini</span><strong>' + formatRupiah(stats.today) + '</strong></div>'
        + '<div class="te-kpi"><span class="te-kpi-label">7 Hari</span><strong>' + formatRupiah(stats.week) + '</strong></div>'
        + '</div>'
        + '<div class="te-section">'
        + '<h4>Layanan Teratas</h4>'
        + '<div class="te-service-list">' + servicesHtml + '</div>'
        + '</div>'
        + '<div class="te-section">'
        + '<h4>Riwayat Pendapatan</h4>'
        + '<div class="te-tx-list">' + recentHtml + '</div>'
        + '</div>';
}

function openTalentEarningsModal() {
    var session = getSession();
    if (!session || session.role !== 'talent') {
        showToast('Menu ini khusus untuk akun Talent', 'error');
        return;
    }

    var existing = document.getElementById('talentEarningModal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'talentEarningModal';
    overlay.className = 'wallet-modal-overlay';
    overlay.innerHTML = '<div class="wallet-modal te-modal">'
        + '<div class="wallet-modal-header te-modal-header">'
        + '<h3>📈 Pendapatan Driver</h3>'
        + '<button class="wallet-modal-close" id="talentEarningClose">&times;</button>'
        + '</div>'
        + '<div class="wallet-modal-body te-modal-body" id="talentEarningBody">'
        + '<div class="te-loading">Memuat data pendapatan...</div>'
        + '</div>'
        + '</div>';

    document.body.appendChild(overlay);

    var closeBtn = document.getElementById('talentEarningClose');
    if (closeBtn) closeBtn.addEventListener('click', _closeTalentEarningsModal);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) _closeTalentEarningsModal();
    });

    FB.get('getOrdersByUser', { userId: session.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            var body = document.getElementById('talentEarningBody');
            if (!body) return;
            if (!res || !res.success || !Array.isArray(res.data)) {
                body.innerHTML = '<div class="te-loading">Gagal memuat data pendapatan.</div>';
                return;
            }
            _renderTalentEarningsModalContent(body, session, res.data);
        })
        .catch(function () {
            var body = document.getElementById('talentEarningBody');
            if (body) body.innerHTML = '<div class="te-loading">Koneksi bermasalah. Coba lagi.</div>';
        });
}
window.openTalentEarningsModal = openTalentEarningsModal;

function _buildSellerEarningsData(orders, sellerId) {
    var completed = orders.filter(function (o) {
        return String(o.sellerId || '') === String(sellerId || '')
            && (o.status === 'completed' || o.status === 'rated');
    });

    completed.sort(function (a, b) { return _talentOrderTimestamp(b) - _talentOrderTimestamp(a); });

    var now = new Date();
    var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var startWeek = startToday - (6 * 24 * 60 * 60 * 1000);

    var total = 0;
    var today = 0;
    var week = 0;
    var grouped = {};

    completed.forEach(function (o) {
        var amount = Number(o.price) || 0;
        var ts = _talentOrderTimestamp(o);
        var service = o.serviceType || 'Pesanan Toko';

        total += amount;
        if (ts >= startToday) today += amount;
        if (ts >= startWeek) week += amount;

        if (!grouped[service]) grouped[service] = { name: service, amount: 0, count: 0 };
        grouped[service].amount += amount;
        grouped[service].count += 1;
    });

    var summary = Object.keys(grouped).map(function (k) { return grouped[k]; })
        .sort(function (a, b) { return b.amount - a.amount; })
        .slice(0, 3);

    return {
        total: total,
        today: today,
        week: week,
        jobs: completed.length,
        avg: completed.length ? Math.round(total / completed.length) : 0,
        services: summary,
        recent: completed.slice(0, 20)
    };
}

function _closeSellerEarningsModal() {
    var modal = document.getElementById('sellerEarningModal');
    if (modal) modal.remove();
    resetBottomNavToHome();
}

function _renderSellerEarningsModalContent(container, stats) {
    var servicesHtml = '';
    if (stats.services.length > 0) {
        servicesHtml = stats.services.map(function (s) {
            return '<div class="te-service-item">'
                + '<div class="te-service-main">'
                + '<div class="te-service-name">' + escapeHtml(s.name) + '</div>'
                + '<div class="te-service-count">' + s.count + ' transaksi</div>'
                + '</div>'
                + '<div class="te-service-amount">' + formatRupiah(s.amount) + '</div>'
                + '</div>';
        }).join('');
    } else {
        servicesHtml = '<div class="te-empty-inline">Belum ada penjualan selesai.</div>';
    }

    var recentHtml = '';
    if (stats.recent.length > 0) {
        recentHtml = stats.recent.map(function (o) {
            var amount = Number(o.price) || 0;
            var status = o.status === 'rated' ? 'Dinilai pembeli' : 'Selesai';
            return '<div class="te-tx-item">'
                + '<div class="te-tx-left">'
                + '<div class="te-tx-title">' + escapeHtml(o.serviceType || 'Pesanan Produk') + '</div>'
                + '<div class="te-tx-meta">' + _formatTalentOrderDate(_talentOrderTimestamp(o)) + ' • ' + status + '</div>'
                + '</div>'
                + '<div class="te-tx-amount">' + formatRupiah(amount) + '</div>'
                + '</div>';
        }).join('');
    } else {
        recentHtml = '<div class="te-empty">'
            + '<div class="te-empty-icon">🏪</div>'
            + '<p>Belum ada penjualan selesai.</p>'
            + '</div>';
    }

    container.innerHTML = '<div class="te-header-card se-header-card">'
        + '<div class="te-header-label">Total Pendapatan Toko</div>'
        + '<div class="te-header-total">' + formatRupiah(stats.total) + '</div>'
        + '<div class="te-header-sub">' + stats.jobs + ' transaksi selesai • Rata-rata ' + formatRupiah(stats.avg) + '/transaksi</div>'
        + '</div>'
        + '<div class="te-kpi-grid">'
        + '<div class="te-kpi"><span class="te-kpi-label">Hari Ini</span><strong>' + formatRupiah(stats.today) + '</strong></div>'
        + '<div class="te-kpi"><span class="te-kpi-label">7 Hari</span><strong>' + formatRupiah(stats.week) + '</strong></div>'
        + '</div>'
        + '<div class="te-section">'
        + '<h4>Kategori Penjualan Teratas</h4>'
        + '<div class="te-service-list">' + servicesHtml + '</div>'
        + '</div>'
        + '<div class="te-section">'
        + '<h4>Riwayat Penjualan</h4>'
        + '<div class="te-tx-list">' + recentHtml + '</div>'
        + '</div>';
}

function openSellerEarningsModal() {
    var session = getSession();
    if (!session || session.role !== 'penjual') {
        showToast('Menu ini khusus untuk akun Penjual', 'error');
        return;
    }

    var existing = document.getElementById('sellerEarningModal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'sellerEarningModal';
    overlay.className = 'wallet-modal-overlay';
    overlay.innerHTML = '<div class="wallet-modal te-modal">'
        + '<div class="wallet-modal-header te-modal-header">'
        + '<h3>🏪 Pendapatan Penjual</h3>'
        + '<button class="wallet-modal-close" id="sellerEarningClose">&times;</button>'
        + '</div>'
        + '<div class="wallet-modal-body te-modal-body" id="sellerEarningBody">'
        + '<div class="te-loading">Memuat data pendapatan...</div>'
        + '</div>'
        + '</div>';

    document.body.appendChild(overlay);

    var closeBtn = document.getElementById('sellerEarningClose');
    if (closeBtn) closeBtn.addEventListener('click', _closeSellerEarningsModal);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) _closeSellerEarningsModal();
    });

    FB.get('getOrdersByUser', { userId: session.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            var body = document.getElementById('sellerEarningBody');
            if (!body) return;
            if (!res || !res.success || !Array.isArray(res.data)) {
                body.innerHTML = '<div class="te-loading">Gagal memuat data pendapatan.</div>';
                return;
            }
            var stats = _buildSellerEarningsData(res.data, session.id);
            _renderSellerEarningsModalContent(body, stats);
        })
        .catch(function () {
            var body = document.getElementById('sellerEarningBody');
            if (body) body.innerHTML = '<div class="te-loading">Koneksi bermasalah. Coba lagi.</div>';
        });
}
window.openSellerEarningsModal = openSellerEarningsModal;

// ══════════════════════════════════════════
// ═══ GLOBAL MODAL DRAG CLOSE ═══
// ══════════════════════════════════════════
var _modalDragState = null;
var _modalDragObserver = null;

function refreshGlobalModalLock() {
    var hasOpenModal = !!document.querySelector('.modal-overlay:not(.hidden), .wallet-modal-overlay, .acc-modal:not(.hidden)');
    document.body.classList.toggle('modal-open-lock', hasOpenModal);
}

function ensureGlobalModalDragHandles(scope) {
    var root = scope || document;

    root.querySelectorAll('.modal-header').forEach(function (header) {
        if (header.querySelector('.modal-drag-handle, .talent-skill-drag-handle')) return;
        var handle = document.createElement('div');
        handle.className = 'modal-drag-handle';
        handle.setAttribute('aria-hidden', 'true');
        header.insertBefore(handle, header.firstChild);
    });

    root.querySelectorAll('.wallet-modal-header').forEach(function (header) {
        if (header.querySelector('.modal-drag-handle, .wallet-modal-drag-handle')) return;
        var handle = document.createElement('div');
        handle.className = 'modal-drag-handle wallet-modal-drag-handle';
        handle.setAttribute('aria-hidden', 'true');
        header.insertBefore(handle, header.firstChild);
    });
}

function closeModalFromOverlay(overlay) {
    if (!overlay) return;

    if (overlay.id === 'skillModal') {
        var skillClose = overlay.querySelector('#btnCloseSkillModal');
        if (skillClose) {
            skillClose.click();
            refreshGlobalModalLock();
            return;
        }
    }

    if (overlay.classList.contains('wallet-modal-overlay')) {
        overlay.remove();
        refreshGlobalModalLock();
        return;
    }

    overlay.classList.add('hidden');
    refreshGlobalModalLock();
}

function setupGlobalModalDragClose() {
    if (window.__globalModalDragCloseBound) return;
    window.__globalModalDragCloseBound = true;

    ensureGlobalModalDragHandles(document);
    refreshGlobalModalLock();

    if (!_modalDragObserver) {
        _modalDragObserver = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(function (node) {
                        if (!node || node.nodeType !== 1) return;
                        ensureGlobalModalDragHandles(node);
                    });
                }
            });
            ensureGlobalModalDragHandles(document);
            refreshGlobalModalLock();
        });
        _modalDragObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    document.addEventListener('touchstart', function (e) {
        var handle = e.target.closest('.modal-drag-handle, .talent-skill-drag-handle, .acc-modal-handle');
        if (!handle) return;

        var overlay = handle.closest('.modal-overlay, .wallet-modal-overlay, .acc-modal');
        if (!overlay || overlay.classList.contains('hidden')) return;

        var sheet = handle.closest('.modal-container, .wallet-modal, .acc-modal-sheet');
        if (!sheet) return;

        if (!e.touches || e.touches.length !== 1) return;

        _modalDragState = {
            overlay: overlay,
            sheet: sheet,
            startY: e.touches[0].clientY,
            deltaY: 0
        };
        sheet.style.transition = 'none';
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!_modalDragState) return;
        if (!e.touches || e.touches.length !== 1) return;

        var delta = e.touches[0].clientY - _modalDragState.startY;
        _modalDragState.deltaY = delta;
        if (delta <= 0) return;

        e.preventDefault();
        _modalDragState.sheet.style.transform = 'translateY(' + Math.min(delta, window.innerHeight) + 'px)';
    }, { passive: false });

    function finishDrag() {
        if (!_modalDragState) return;

        var state = _modalDragState;
        _modalDragState = null;

        state.sheet.style.transition = 'transform .28s cubic-bezier(.22,.9,.24,1)';

        if (state.deltaY > 90) {
            state.sheet.style.transform = 'translateY(calc(100% + 40px))';
            setTimeout(function () {
                state.sheet.style.transform = '';
                state.sheet.style.transition = '';
                closeModalFromOverlay(state.overlay);
            }, 280);
            return;
        }

        state.sheet.style.transform = 'translateY(0)';
        setTimeout(function () {
            state.sheet.style.transform = '';
            state.sheet.style.transition = '';
        }, 280);
    }

    document.addEventListener('touchend', finishDrag);
    document.addEventListener('touchcancel', finishDrag);
}
window.setupGlobalModalDragClose = setupGlobalModalDragClose;

// ══════════════════════════════════════════
// ═══ BOTTOM NAV ═══
// ══════════════════════════════════════════
function setupBottomNav() {
    startUnratedRatingReminderWatcher();

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
                } else if (page === 'skills') {
                    var sessionSkills = typeof getSession === 'function' ? getSession() : null;
                    if (sessionSkills && sessionSkills.role === 'talent' && typeof openSkillModal === 'function') {
                        openSkillModal();
                    } else {
                        showToast('Menu keahlian khusus Talent', 'info');
                    }
                } else if (page === 'tickets' || page === 'reports') {
                    openAdminTransactions();
                } else if (page === 'products') {
                    var sessionProducts = typeof getSession === 'function' ? getSession() : null;
                    if (sessionProducts && (sessionProducts.role === 'penjual' || sessionProducts.role === 'seller') && typeof openPenjualProductsModal === 'function') {
                        openPenjualProductsModal();
                    } else {
                        var prodSec = document.getElementById('penjualProductsSection');
                        if (prodSec) prodSec.scrollIntoView({ behavior: 'smooth' });
                    }
                } else if (page === 'earning') {
                    var session3 = typeof getSession === 'function' ? getSession() : null;
                    if (session3 && session3.role === 'talent') {
                        openTalentEarningsModal();
                    } else if (session3 && session3.role === 'penjual') {
                        openSellerEarningsModal();
                    } else {
                        showToast('Menu pendapatan khusus Talent/Penjual', 'info');
                    }
                } else if (page === 'home') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else if (page === 'akun' || page === 'profil' || page === 'settings') {
                    var session = typeof getSession === 'function' ? getSession() : null;
                    if (session && session.role === 'owner' && typeof openOwnerSettings === 'function') {
                        openOwnerSettings();
                    } else {
                        openSettingsPage();
                    }
                } else if (page === 'users') {
                    var userListSec = document.getElementById('ownerUsersSection') || document.getElementById('ownerUserList') || document.getElementById('csUserList');
                    if (userListSec) userListSec.scrollIntoView({ behavior: 'smooth' });
                } else if (page === 'cs-manage') {
                    var session2 = typeof getSession === 'function' ? getSession() : null;
                    if (session2 && session2.role === 'owner' && typeof openOwnerSettings === 'function') {
                        openOwnerSettings();
                    } else {
                        var csFormSec = document.getElementById('createCSForm');
                        if (csFormSec) csFormSec.scrollIntoView({ behavior: 'smooth' });
                    }
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
        navigator.serviceWorker.register('sw.js?v=26').then(function (reg) {
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

            // Register periodic background sync if supported
            if ('periodicSync' in reg) {
                reg.periodicSync.register('js-background-poll', { minInterval: 60 * 1000 })
                    .catch(function () {});
            }
        }).catch(function () {});

        // Listen for messages from Service Worker
        navigator.serviceWorker.addEventListener('message', function (event) {
            var msg = event.data || {};

            if (msg.type === 'PUSH_SUBSCRIPTION_CHANGED') {
                var s0 = getSession();
                if (s0) _ensurePushSubscriptionWithRetry(s0, { reason: 'sw-subscription-changed' });
                _refreshRolePushMiniStatus(false);
            }

            // SW asked this tab to poll orders/notifications
            if (msg.type === 'SW_BACKGROUND_POLL' || msg.type === 'SW_ORDER_POLL_REQUEST') {
                if (typeof initNotifications === 'function') initNotifications();
                var s = getSession();
                if (s && s.role === 'talent' && typeof loadTalentDashboardOrders === 'function') {
                    loadTalentDashboardOrders();
                }
                if (s && s.role === 'penjual' && typeof loadPenjualOrders === 'function') {
                    loadPenjualOrders();
                }
            }

            // Notification was clicked — open order tracking
            if (msg.type === 'NOTIF_CLICK' && msg.orderId) {
                var orderId = msg.orderId;
                setTimeout(function () {
                    if (typeof FB !== 'undefined' && FB.isReady()) {
                        FB.get('getAllOrders').then(function (r) { return r.json(); }).then(function (res) {
                            if (res.success && res.data) {
                                var tgt = res.data.find(function (o) { return String(o.id) === String(orderId); });
                                if (tgt && typeof openOrderTracking === 'function') openOrderTracking(tgt);
                            }
                        }).catch(function () {});
                    }
                }, 500);
            }
        });

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

// ── Driver GPS location verification helper ──
// Checks current position vs target; callback(isNear:bool)
function _verifyDriverAtLocation(order, targetType, callback, maxDistanceKm) {
    if (!('geolocation' in navigator)) {
        showToast('⚠️ GPS wajib aktif untuk mengubah progress pesanan.', 'error');
        callback(false, { distKm: NaN, radiusKm: Number(maxDistanceKm) || GPS_MANUAL_ACTION_RADIUS, targetType: targetType });
        return;
    }
    var radiusKm = Number(maxDistanceKm);
    if (!isFinite(radiusKm) || radiusKm <= 0) radiusKm = GPS_MANUAL_ACTION_RADIUS;

    navigator.geolocation.getCurrentPosition(function (pos) {
        var dLat = pos.coords.latitude;
        var dLng = pos.coords.longitude;
        var target = _getDriverTargetCoords(order, targetType);
        if (!target) {
            showToast('⚠️ Titik tujuan belum valid. Hubungi admin untuk sinkronisasi koordinat.', 'error');
            callback(false, { distKm: NaN, radiusKm: radiusKm, targetType: targetType });
            return;
        }

        var dist = haversineDistance(dLat, dLng, target.lat, target.lng);
        var known = _checkDriverGpsGateByKnownPosition(order, targetType, radiusKm);
        var knownDist = isFinite(Number(known.distKm)) ? Number(known.distKm) : NaN;
        var bestDist = isFinite(knownDist) ? Math.min(dist, knownDist) : dist;
        callback(bestDist <= radiusKm, {
            distKm: bestDist,
            gpsDistKm: dist,
            knownDistKm: knownDist,
            radiusKm: radiusKm,
            targetType: targetType,
            gpsLat: dLat,
            gpsLng: dLng
        });
    }, function () {
        // Fallback to last known synced driver position from order payload.
        var known = _checkDriverGpsGateByKnownPosition(order, targetType, radiusKm);
        if (known.ok) {
            callback(true, { distKm: Number(known.distKm) || 0, radiusKm: radiusKm, targetType: targetType, usedFallback: true });
            return;
        }
        showToast('⚠️ GPS tidak tersedia. Progress tidak dapat dilanjutkan.', 'error');
        callback(false, { distKm: isFinite(Number(known.distKm)) ? Number(known.distKm) : NaN, radiusKm: radiusKm, targetType: targetType, usedFallback: true });
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
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
        try {
            splash.classList.add('fade-out');
            app.classList.remove('hidden');

            var urlPage = pageFromPath(window.location.pathname);

            var session = getSession();
            if (session && session.id && session.role) {
                showPage(session.role);
                updateRoleUI(session);
                if (typeof ensureAndroidBackToHomeGuard === 'function') {
                    ensureAndroidBackToHomeGuard(true);
                }
                return;
            }

            // Invalid or missing session — clear and show login
            if (session) clearSession();

            if (urlPage === 'register') {
                showPage('register');
            } else {
                showPage('login');
                if (typeof LoginPage !== 'undefined') LoginPage.reset();
            }
        } catch (err) {
            // Emergency fallback: always show something
            console.error('handleSplash error:', err);
            if (app) app.classList.remove('hidden');
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

    function isPullRefreshAllowed() {
        var activePage = document.querySelector('.page:not(.hidden)');
        if (!activePage) return false;

        var allowedPages = {
            'page-user': true,
            'page-talent': true,
            'page-penjual': true,
            'page-cs': true,
            'page-owner': true
        };

        if (!allowedPages[activePage.id]) return false;

        // For pages with bottom navigation, allow only when Home tab is active.
        var bottomNav = activePage.querySelector('.bottom-nav');
        if (bottomNav) {
            var activeNavItem = bottomNav.querySelector('.nav-item.active');
            if (!activeNavItem || activeNavItem.dataset.page !== 'home') return false;
        }

        // Disable pull-to-refresh when any fullscreen/sub-page is open.
        if (document.querySelector('.stp-page:not(.hidden)')) return false;

        // Disable pull-to-refresh while modal/overlay UI is shown.
        if (document.querySelector('.modal-overlay:not(.hidden), .acc-modal:not(.hidden), .search-overlay:not(.hidden), .notif-popup:not(.hidden), .order-notif-popup:not(.hidden), .app-update-popup:not(.hidden), .wallet-modal-overlay')) {
            return false;
        }

        return true;
    }

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
        if (!isPullRefreshAllowed()) return;
        if (!isAtTop()) return;
        _ptr_startY = e.touches[0].clientY;
        _ptr_pulling = true;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!_ptr_pulling || !isPullRefreshAllowed() || !isAtTop()) return;
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

        if (!isPullRefreshAllowed()) {
            _ptr_pulling = false;
            _ptr_currentY = 0;
            _ptr_startY = 0;
            if (_ptr_indicator) {
                _ptr_indicator.classList.remove('ptr-visible', 'ptr-ready', 'ptr-loading');
                _ptr_indicator.style.transform = 'translateX(-50%) translateY(-60px)';
                _ptr_indicator.style.opacity = '0';
            }
            return;
        }

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
