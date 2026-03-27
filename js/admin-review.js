/* ========================================
   JASA SURUH - Admin Order Review Module
   Allows admin/owner to approve or reject
   completed orders before earnings are paid
   ======================================== */
'use strict';

// ── Open the review panel ──
function openAdminOrderReview() {
    var page = document.getElementById('adminOrderReviewPage');
    if (!page) { page = _buildAdminOrderReviewPage(); document.body.appendChild(page); }
    page.classList.remove('hidden');
    _loadPendingReviewOrders(page);
}
window.openAdminOrderReview = openAdminOrderReview;

function _buildAdminOrderReviewPage() {
    var page = document.createElement('div');
    page.id = 'adminOrderReviewPage';
    page.className = 'stp-page hidden';
    page.style.cssText = [
        'position:fixed;top:0;left:0;right:0;bottom:0;z-index:1200;',
        'background:#F8FAFC;overflow-y:auto;font-family:var(--font,sans-serif);'
    ].join('');
    page.innerHTML = [
        '<div style="background:#fff;border-bottom:1px solid #E5E7EB;padding:16px 20px;',
        'display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.05);">',
            '<button id="aorpBtnBack" style="background:none;border:none;font-size:22px;cursor:pointer;',
            'padding:0 6px;color:#374151;line-height:1;">&#8592;</button>',
            '<div>',
                '<div style="font-size:16px;font-weight:700;color:#111;">Review Pesanan Selesai</div>',
                '<div style="font-size:12px;color:#6B7280;">Setujui pencairan komisi driver / penjual</div>',
            '</div>',
        '</div>',
        '<div id="aorpList" style="padding:16px;display:flex;flex-direction:column;gap:12px;">',
            '<div style="text-align:center;padding:40px;color:#9CA3AF;">Memuat...</div>',
        '</div>'
    ].join('');
    page.querySelector('#aorpBtnBack').addEventListener('click', function () {
        page.classList.add('hidden');
    });
    return page;
}

function _loadPendingReviewOrders(page) {
    var listEl = page ? page.querySelector('#aorpList') : null;
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#9CA3AF;">Memuat pesanan...</div>';

    if (typeof FB === 'undefined' || !FB.isReady()) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#EF4444;">&#10060; Tidak terhubung ke server</div>';
        return;
    }

    FB.get('getAllOrders').then(function (r) { return r.json(); }).then(function (res) {
        if (!res || !res.success || !Array.isArray(res.data)) {
            listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#EF4444;">&#10060; Gagal memuat pesanan</div>';
            return;
        }

        // Filter orders that are completed but not yet wallet-settled, awaiting admin review
        var pending = res.data.filter(function (o) {
            return (o.status === 'completed' || o.status === 'rated')
                && o.pendingAdminReview
                && !o.walletSettled;
        });

        if (pending.length === 0) {
            listEl.innerHTML = [
                '<div style="text-align:center;padding:60px 20px;">',
                    '<div style="font-size:52px;margin-bottom:12px;">&#10003;</div>',
                    '<div style="font-size:16px;font-weight:700;color:#111;margin-bottom:6px;">Semua Sudah Diproses</div>',
                    '<div style="font-size:13px;color:#9CA3AF;">Tidak ada pesanan yang menunggu review</div>',
                '</div>'
            ].join('');
            return;
        }

        var users = typeof getUsers === 'function' ? getUsers() : [];

        listEl.innerHTML = pending.map(function (o, idx) {
            var user   = users.find(function (u) { return u.id === o.userId; })   || {};
            var driver = users.find(function (u) { return u.id === o.talentId; }) || {};
            var seller = users.find(function (u) { return u.id === o.sellerId; }) || {};

            var dateStr = o.completedAt || o.createdAt
                ? new Date(Number(o.completedAt || o.createdAt)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '-';

            var proofHtml = o.proofPhoto
                ? '<a href="' + o.proofPhoto + '" target="_blank"><img src="' + o.proofPhoto + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #E5E7EB;margin-top:8px;" alt="Bukti Foto"></a>'
                : '<div style="font-size:12px;color:#9CA3AF;margin-top:6px;font-style:italic;">Tidak ada foto bukti</div>';

            var sellerRow = o.sellerId
                ? ('<div style="font-size:12px;color:#374151;margin-bottom:4px;">&#127978; Penjual: ' + (typeof escapeHtml === 'function' ? escapeHtml(o.storeName || seller.name || seller.nama || '-') : (o.storeName || seller.name || seller.nama || '-')) + '</div>')
                : '';

            var ratingBadge = o.rating
                ? '<span style="background:#FEF9C3;color:#854D0E;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:600;margin-left:6px;">&#9733; ' + o.rating + '/5</span>'
                : '';

            return [
                '<div class="aorp-card" data-idx="' + idx + '" style="background:#fff;border-radius:16px;',
                'padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.07);border:1px solid #F3F4F6;">',
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">',
                        '<div>',
                            '<div style="font-size:13px;font-weight:700;color:#111;">#' + String(o.id || '').substr(0, 8) + '</div>',
                            '<div style="font-size:12px;color:#6B7280;">' + (o.serviceType || o.skillType || 'Pesanan') + ' &bull; ' + dateStr + ratingBadge + '</div>',
                        '</div>',
                        '<span style="background:#FEF3C7;color:#D97706;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:600;">&#9203; Perlu Review</span>',
                    '</div>',
                    '<div style="font-size:12px;color:#374151;margin-bottom:4px;">&#128100; Customer: ' + (typeof escapeHtml === 'function' ? escapeHtml(user.name || user.nama || '-') : (user.name || user.nama || '-')) + '</div>',
                    '<div style="font-size:12px;color:#374151;margin-bottom:4px;">&#128661; Driver: ' + (typeof escapeHtml === 'function' ? escapeHtml(driver.name || driver.nama || '-') : (driver.name || driver.nama || '-')) + '</div>',
                    sellerRow,
                    '<div style="font-size:12px;color:#374151;margin-bottom:4px;">&#128176; Total: Rp ' + Number(o.totalCost || o.price || 0).toLocaleString('id-ID') + ' &bull; ' + String(o.paymentMethod || 'JsPay').toUpperCase() + '</div>',
                    proofHtml,
                    '<div style="display:flex;gap:10px;margin-top:14px;">',
                        '<button class="aorp-btn-approve" data-idx="' + idx + '" style="',
                        'flex:1;background:linear-gradient(135deg,#22C55E,#16A34A);color:#fff;',
                        'border:none;border-radius:12px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;',
                        'box-shadow:0 2px 8px rgba(34,197,94,.3);">',
                        '&#10003; Setujui &amp; Cairkan',
                        '</button>',
                        '<button class="aorp-btn-reject" data-idx="' + idx + '" style="',
                        'flex:0 0 auto;background:#FEE2E2;color:#EF4444;border:none;',
                        'border-radius:12px;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;">',
                        'Tolak',
                        '</button>',
                    '</div>',
                '</div>'
            ].join('');
        }).join('');

        // Bind buttons
        listEl.querySelectorAll('.aorp-btn-approve').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var idx = parseInt(this.dataset.idx, 10);
                if (pending[idx]) _aorpApprove(pending[idx], this, page);
            });
        });
        listEl.querySelectorAll('.aorp-btn-reject').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var idx = parseInt(this.dataset.idx, 10);
                if (pending[idx]) _aorpReject(pending[idx], this, page);
            });
        });
    }).catch(function () {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#EF4444;">&#10060; Gagal memuat pesanan</div>';
    });
}

function _aorpApprove(order, btn, page) {
    var doApprove = function () {
        if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }

        FB.get('getSettings').then(function (r) { return r.json(); }).then(function (settingsRes) {
            var commPercent = 10;
            if (settingsRes && settingsRes.success && settingsRes.data) {
                var s = settingsRes.data;
                commPercent = (order.skillType === 'js_food')
                    ? (Number(s.commission_penjual_percent) || 10)
                    : (Number(s.commission_talent_percent) || 15);
            }

            var pm = order.paymentMethod || 'jspay';
            var walletPromise;
            if (pm === 'cod') {
                walletPromise = backendPost({
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
                walletPromise = backendPost({
                    action: 'walletCompleteOrder',
                    orderId: order.id,
                    talentId: order.talentId,
                    sellerId: order.sellerId || '',
                    price: order.price,
                    deliveryFee: order.deliveryFee || 0,
                    fee: order.fee,
                    commissionPercent: commPercent,
                    serviceType: order.serviceType || order.skillType || ''
                });
            }

            walletPromise.then(function (walletRes) {
                if (!walletRes || !walletRes.success) {
                    throw new Error((walletRes && walletRes.message) ? walletRes.message : 'Pencairan gagal diproses');
                }
                // Mark review as done
                backendPost({
                    action: 'updateOrder',
                    orderId: order.id,
                    fields: {
                        pendingAdminReview: false,
                        adminReviewedAt: Date.now(),
                        adminReviewStatus: 'approved'
                    }
                });
                // Notify driver
                if (typeof addNotifItem === 'function') {
                    addNotifItem({
                        userId: order.talentId,
                        icon: '💰',
                        title: 'Komisi Dicairkan!',
                        desc: 'Komisi pesanan #' + String(order.id).substr(0, 8) + ' telah disetujui admin dan masuk ke saldo Anda.',
                        type: 'earning',
                        orderId: order.id
                    });
                    if (order.sellerId) {
                        addNotifItem({
                            userId: order.sellerId,
                            icon: '💰',
                            title: 'Pendapatan Dicairkan!',
                            desc: 'Pendapatan pesanan #' + String(order.id).substr(0, 8) + ' telah disetujui admin.',
                            type: 'earning',
                            orderId: order.id
                        });
                    }
                }
                if (typeof showToast === 'function') showToast('✅ Komisi dicairkan! Driver sudah dapat saldo.', 'success');
                _loadPendingReviewOrders(page);
            }).catch(function (err) {
                if (typeof showToast === 'function') showToast((err && err.message) ? err.message : 'Gagal mencairkan komisi', 'error');
                if (btn) { btn.disabled = false; btn.textContent = 'Setujui & Cairkan'; }
            });
        });
    };

    if (typeof openModernConfirm === 'function') {
        openModernConfirm({
            title: 'Setujui Pencairan?',
            message: 'Komisi driver/penjual untuk pesanan #' + String(order.id).substr(0, 8) + ' akan dicairkan ke saldo mereka. Lanjutkan?'
        }).then(function (ok) { if (ok) doApprove(); });
    } else {
        if (!confirm('Setujui pencairan komisi untuk pesanan #' + String(order.id).substr(0, 8) + '?')) return;
        doApprove();
    }
}

function _aorpReject(order, btn, page) {
    var reason = prompt('Alasan penolakan (wajib diisi):');
    if (!reason || !reason.trim()) return;

    if (btn) btn.disabled = true;

    backendPost({
        action: 'updateOrder',
        orderId: order.id,
        fields: {
            pendingAdminReview: false,
            adminReviewedAt: Date.now(),
            adminReviewStatus: 'rejected',
            adminReviewReason: reason.trim()
        }
    }).then(function () {
        if (typeof addNotifItem === 'function') {
            addNotifItem({
                userId: order.talentId,
                icon: '⚠️',
                title: 'Komisi Ditolak Admin',
                desc: 'Pencairan pesanan #' + String(order.id).substr(0, 8) + ' ditolak. Alasan: ' + reason.trim(),
                type: 'order',
                orderId: order.id
            });
        }
        if (typeof showToast === 'function') showToast('Pesanan ditolak dan driver dinotifikasi.', 'success');
        _loadPendingReviewOrders(page);
    }).catch(function () {
        if (typeof showToast === 'function') showToast('Gagal menolak pesanan', 'error');
        if (btn) btn.disabled = false;
    });
}
