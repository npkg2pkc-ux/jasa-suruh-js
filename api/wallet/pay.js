// Trusted wallet operations endpoint (real-money mode)
// POST /api/wallet/pay

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqptkuoazqharfzxvgem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function fail(res, status, message) {
    return res.status(status).json({ success: false, message: message || 'Error' });
}

function supaFetch(path, options) {
    return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json'
        }
    }, options || {}));
}

function parseOrderTotal(order) {
    var expected = Number(order && order.totalCost);
    if (isFinite(expected) && expected > 0) return Math.round(expected);
    return Math.round((Number(order && order.price) || 0)
        + (Number(order && order.deliveryFee) || 0)
        + (Number(order && order.fee) || 0));
}

function parseMaybeJson(v) {
    if (!v) return {};
    if (typeof v === 'string') {
        try { return JSON.parse(v); } catch (e) { return {}; }
    }
    return v;
}

function isInsufficientError(txt) {
    return String(txt || '').toLowerCase().indexOf('insufficient balance') >= 0;
}

async function getOrderById(orderId) {
    var orderRes = await supaFetch('orders?id=eq.' + encodeURIComponent(orderId) + '&select=id,data&limit=1');
    var orderRows = await orderRes.json();
    if (!Array.isArray(orderRows) || orderRows.length === 0) return null;
    return parseMaybeJson((orderRows[0] && orderRows[0].data) || {});
}

async function patchOrder(orderId, order) {
    return supaFetch('orders?id=eq.' + encodeURIComponent(orderId), {
        method: 'PATCH',
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
        },
        body: JSON.stringify({
            data: order,
            user_id: order.userId || null,
            talent_id: order.talentId || null
        })
    });
}

async function getSettings() {
    var r = await supaFetch('settings?key=eq.config&select=data&limit=1');
    var rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return {};
    return parseMaybeJson(rows[0].data || {});
}

async function resolveOwnerUserId() {
    var r = await supaFetch('users?select=id,role,data');
    var rows = await r.json();
    if (!Array.isArray(rows)) return '';
    var owner = rows.find(function (x) { return String(x.role || '').toLowerCase() === 'owner'; });
    if (owner && owner.id) return owner.id;
    owner = rows.find(function (x) {
        var d = parseMaybeJson(x.data);
        return String((d && d.role) || '').toLowerCase() === 'owner';
    });
    return owner && owner.id ? owner.id : '';
}

async function applyMutation(params) {
    var rpcRes = await supaFetch('rpc/wallet_apply_mutation', {
        method: 'POST',
        body: JSON.stringify(params)
    });
    if (!rpcRes.ok) {
        var errText = await rpcRes.text();
        return { success: false, message: errText || 'mutation failed' };
    }
    var rows = await rpcRes.json();
    var m = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!m) return { success: false, message: 'mutation empty result' };
    return { success: true, data: m };
}

async function upsertTransaction(row) {
    await supaFetch('transactions?on_conflict=id', {
        method: 'POST',
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(row)
    });
}

async function handlePay(body, res) {
    var userId = String(body.userId || '').trim();
    var orderId = String(body.orderId || '').trim();
    var amount = Math.abs(Number(body.amount) || 0);
    var description = String(body.description || 'Pembayaran Pesanan').trim();
    var actorId = String(body.actorId || userId || '').trim();

    if (!userId || !orderId || amount <= 0) {
        return fail(res, 400, 'userId, orderId, dan amount wajib valid');
    }

    var order = await getOrderById(orderId);
    if (!order) return fail(res, 404, 'Order tidak ditemukan');

    if (String(order.userId || '') !== userId) {
        return fail(res, 403, 'Pembayaran ditolak: user order tidak cocok');
    }
    if (String(order.status || '').toLowerCase() !== 'pending') {
        return fail(res, 400, 'Pembayaran ditolak: status order tidak valid untuk pembayaran');
    }
    if (String(order.paymentMethod || 'jspay').toLowerCase() === 'cod') {
        return fail(res, 400, 'Order COD tidak boleh dipotong saldo');
    }
    if (Number(order.paidAmount || 0) > 0) {
        return res.status(200).json({ success: true, alreadyProcessed: true, balance: Number(order.walletBalanceAfter || 0) });
    }

    var expected = parseOrderTotal(order);
    if (Math.round(amount) !== expected) {
        return fail(res, 400, 'Pembayaran ditolak: nominal tidak sesuai order');
    }

    var idempotencyKey = 'walletpay:' + orderId + ':' + userId + ':' + expected;
    var mutation = await applyMutation({
        p_user_id: userId,
        p_direction: 'debit',
        p_amount: expected,
        p_ref_type: 'order_payment',
        p_ref_id: orderId,
        p_reason: description,
        p_actor_type: 'user',
        p_actor_id: actorId || userId,
        p_idempotency_key: idempotencyKey,
        p_metadata: { orderId: orderId, userId: userId, type: 'payment' }
    });

    if (!mutation.success) {
        if (isInsufficientError(mutation.message)) return fail(res, 400, 'Saldo tidak cukup');
        return fail(res, 400, 'Pembayaran gagal diproses');
    }

    var m = mutation.data;
    var now = Date.now();
    var newOrder = Object.assign({}, order, {
        paidAmount: expected,
        paidAt: now,
        paymentStatus: 'paid',
        walletBalanceAfter: Number(m.balance_after) || 0
    });

    var patchRes = await patchOrder(orderId, newOrder);
    if (!patchRes.ok) return fail(res, 500, 'Pembayaran berhasil, tetapi update order gagal');

    var txId = 'pay_' + orderId + '_' + userId;
    await upsertTransaction({
        id: txId,
        user_id: userId,
        type: 'payment',
        amount: -expected,
        created_at: now,
        data: {
            id: txId,
            userId: userId,
            type: 'payment',
            amount: -expected,
            orderId: orderId,
            balanceBefore: Number(m.balance_before) || 0,
            balanceAfter: Number(m.balance_after) || 0,
            description: description,
            createdAt: now,
            idempotencyKey: idempotencyKey,
            ledgerId: m.ledger_id
        }
    });

    return res.status(200).json({
        success: true,
        orderId: orderId,
        transactionId: txId,
        ledgerId: m.ledger_id,
        balance: Number(m.balance_after) || 0
    });
}

async function creditAndRecord(opts) {
    var mut = await applyMutation({
        p_user_id: opts.userId,
        p_direction: 'credit',
        p_amount: opts.amount,
        p_ref_type: opts.refType,
        p_ref_id: opts.refId,
        p_reason: opts.description,
        p_actor_type: opts.actorType || 'system',
        p_actor_id: opts.actorId || '',
        p_idempotency_key: opts.idempotencyKey,
        p_metadata: opts.metadata || {}
    });
    if (!mut.success) return mut;
    var m = mut.data;
    await upsertTransaction({
        id: opts.txId,
        user_id: opts.userId,
        type: opts.txType,
        amount: Math.abs(Number(opts.amount) || 0),
        created_at: opts.now,
        data: {
            id: opts.txId,
            userId: opts.userId,
            type: opts.txType,
            amount: Math.abs(Number(opts.amount) || 0),
            orderId: opts.refId,
            balanceBefore: Number(m.balance_before) || 0,
            balanceAfter: Number(m.balance_after) || 0,
            description: opts.description,
            createdAt: opts.now,
            idempotencyKey: opts.idempotencyKey,
            ledgerId: m.ledger_id
        }
    });
    return { success: true, data: m };
}

async function debitAndRecord(opts) {
    var mut = await applyMutation({
        p_user_id: opts.userId,
        p_direction: 'debit',
        p_amount: opts.amount,
        p_ref_type: opts.refType,
        p_ref_id: opts.refId,
        p_reason: opts.description,
        p_actor_type: opts.actorType || 'system',
        p_actor_id: opts.actorId || '',
        p_idempotency_key: opts.idempotencyKey,
        p_metadata: opts.metadata || {}
    });
    if (!mut.success) return mut;
    var m = mut.data;
    await upsertTransaction({
        id: opts.txId,
        user_id: opts.userId,
        type: opts.txType,
        amount: -Math.abs(Number(opts.amount) || 0),
        created_at: opts.now,
        data: {
            id: opts.txId,
            userId: opts.userId,
            type: opts.txType,
            amount: -Math.abs(Number(opts.amount) || 0),
            orderId: opts.refId,
            balanceBefore: Number(m.balance_before) || 0,
            balanceAfter: Number(m.balance_after) || 0,
            description: opts.description,
            createdAt: opts.now,
            idempotencyKey: opts.idempotencyKey,
            ledgerId: m.ledger_id
        }
    });
    return { success: true, data: m };
}

async function handleCompleteOrder(body, res) {
    var orderId = String(body.orderId || '').trim();
    var actorId = String(body.actorId || '').trim();
    if (!orderId) return fail(res, 400, 'OrderId wajib diisi');

    var order = await getOrderById(orderId);
    if (!order) return fail(res, 404, 'Order tidak ditemukan');
    if (String(order.paymentMethod || 'jspay').toLowerCase() === 'cod') return fail(res, 400, 'Order COD harus diproses lewat penyelesaian COD');
    if (!(order.status === 'completed' || order.status === 'rated')) return fail(res, 400, 'Payout hanya diproses untuk order selesai');
    if (order.walletSettled) return res.status(200).json({ success: true, alreadySettled: true });
    if (order.pendingAdminReview || String(order.adminReviewStatus || '') !== 'approved') return fail(res, 400, 'Payout ditolak: order belum disetujui admin.');
    if (Number(order.paidAmount || 0) <= 0) return fail(res, 400, 'Payout ditolak: order belum tercatat lunas.');

    var settings = await getSettings();
    var now = Date.now();
    var oid = String(order.id || orderId);
    var prefix = oid.slice(0, 8);
    var talentId = String(order.talentId || '');
    var sellerId = String(order.sellerId || '');
    var price = Number(order.price) || 0;
    var deliveryFee = Number(order.deliveryFee) || 0;
    var fee = Number(order.fee) || 0;
    var isProductOrder = !!(sellerId && talentId !== sellerId);
    var ownerId = await resolveOwnerUserId();

    if (isProductOrder) {
        var cp = Number(settings.commission_penjual_percent) || 10;
        var commission = Math.round(price * cp / 100);
        var sellerEarning = price - commission;
        var driverEarning = deliveryFee;
        var ownerTotal = fee + commission;

        if (sellerId && sellerEarning > 0) {
            var r1 = await creditAndRecord({
                userId: sellerId,
                amount: sellerEarning,
                refType: 'order_settlement',
                refId: oid,
                txType: 'earning',
                txId: 'earn_seller_' + oid + '_' + sellerId,
                description: 'Penjualan produk #' + prefix,
                idempotencyKey: 'settle:' + oid + ':seller:earning',
                actorType: 'admin',
                actorId: actorId,
                metadata: { orderId: oid, channel: 'settlement', role: 'seller' },
                now: now
            });
            if (!r1.success) return fail(res, 400, 'Payout seller gagal diproses');
        }

        if (talentId && driverEarning > 0) {
            var r2 = await creditAndRecord({
                userId: talentId,
                amount: driverEarning,
                refType: 'order_settlement',
                refId: oid,
                txType: 'earning',
                txId: 'earn_driver_' + oid + '_' + talentId,
                description: 'Ongkir antar pesanan #' + prefix,
                idempotencyKey: 'settle:' + oid + ':driver:earning',
                actorType: 'admin',
                actorId: actorId,
                metadata: { orderId: oid, channel: 'settlement', role: 'driver' },
                now: now
            });
            if (!r2.success) return fail(res, 400, 'Payout driver gagal diproses');
        }

        if (ownerId && ownerTotal > 0) {
            var r3 = await creditAndRecord({
                userId: ownerId,
                amount: ownerTotal,
                refType: 'order_settlement',
                refId: oid,
                txType: 'commission',
                txId: 'comm_owner_' + oid + '_' + ownerId,
                description: 'Komisi produk #' + prefix,
                idempotencyKey: 'settle:' + oid + ':owner:commission',
                actorType: 'admin',
                actorId: actorId,
                metadata: { orderId: oid, channel: 'settlement', role: 'owner' },
                now: now
            });
            if (!r3.success) return fail(res, 400, 'Komisi owner gagal diproses');
        }

        var mergedProduct = Object.assign({}, order, { walletSettled: true, walletSettledAt: now });
        var patchProduct = await patchOrder(oid, mergedProduct);
        if (!patchProduct.ok) return fail(res, 500, 'Payout berhasil, tetapi update order gagal');
        return res.status(200).json({ success: true, sellerEarning: sellerEarning, driverEarning: driverEarning, ownerTotal: ownerTotal });
    }

    var ct = Number(settings.commission_talent_percent) || 15;
    var commission2 = Math.round(price * ct / 100);
    var talentEarning = price - commission2;
    var ownerTotal2 = fee + commission2;

    if (talentId && talentEarning > 0) {
        var a1 = await creditAndRecord({
            userId: talentId,
            amount: talentEarning,
            refType: 'order_settlement',
            refId: oid,
            txType: 'earning',
            txId: 'earn_talent_' + oid + '_' + talentId,
            description: 'Pendapatan dari pesanan #' + prefix,
            idempotencyKey: 'settle:' + oid + ':talent:earning',
            actorType: 'admin',
            actorId: actorId,
            metadata: { orderId: oid, channel: 'settlement', role: 'talent' },
            now: now
        });
        if (!a1.success) return fail(res, 400, 'Payout talent gagal diproses');
    }

    if (ownerId && ownerTotal2 > 0) {
        var a2 = await creditAndRecord({
            userId: ownerId,
            amount: ownerTotal2,
            refType: 'order_settlement',
            refId: oid,
            txType: 'commission',
            txId: 'comm_owner_' + oid + '_' + ownerId,
            description: 'Komisi pesanan #' + prefix,
            idempotencyKey: 'settle:' + oid + ':owner:commission',
            actorType: 'admin',
            actorId: actorId,
            metadata: { orderId: oid, channel: 'settlement', role: 'owner' },
            now: now
        });
        if (!a2.success) return fail(res, 400, 'Komisi owner gagal diproses');
    }

    var mergedService = Object.assign({}, order, { walletSettled: true, walletSettledAt: now });
    var patchService = await patchOrder(oid, mergedService);
    if (!patchService.ok) return fail(res, 500, 'Payout berhasil, tetapi update order gagal');
    return res.status(200).json({ success: true, talentEarning: talentEarning, ownerTotal: ownerTotal2, commission: commission2 });
}

async function handleCompleteOrderCOD(body, res) {
    var orderId = String(body.orderId || '').trim();
    var actorId = String(body.actorId || '').trim();
    if (!orderId) return fail(res, 400, 'OrderId wajib diisi');

    var order = await getOrderById(orderId);
    if (!order) return fail(res, 404, 'Order tidak ditemukan');
    if (String(order.paymentMethod || '').toLowerCase() !== 'cod') return fail(res, 400, 'Aksi ini khusus order COD');
    if (order.sellerId) return fail(res, 400, 'COD untuk pesanan produk belum didukung. Gunakan pembayaran JSPay/non-COD.');
    if (!(order.status === 'completed' || order.status === 'rated')) return fail(res, 400, 'Payout COD hanya diproses untuk order selesai');
    if (order.walletSettled) return res.status(200).json({ success: true, alreadySettled: true });
    if (order.pendingAdminReview || String(order.adminReviewStatus || '') !== 'approved') return fail(res, 400, 'Payout COD ditolak: order belum disetujui admin.');

    var settings = await getSettings();
    var oid = String(order.id || orderId);
    var prefix = oid.slice(0, 8);
    var now = Date.now();
    var talentId = String(order.talentId || '');
    var price = Number(order.price) || 0;
    var fee = Number(order.fee) || 0;
    var cp = Number(settings.commission_talent_percent) || 15;
    var commission = Math.round(price * cp / 100);
    var platformCut = fee + commission;

    if (!talentId) return fail(res, 400, 'Talent order tidak ditemukan');

    if (platformCut > 0) {
        var debit = await debitAndRecord({
            userId: talentId,
            amount: platformCut,
            refType: 'order_settlement_cod',
            refId: oid,
            txType: 'payment',
            txId: 'cod_cut_' + oid + '_' + talentId,
            description: 'Potongan platform COD #' + prefix,
            idempotencyKey: 'settlecod:' + oid + ':talent:debit',
            actorType: 'admin',
            actorId: actorId,
            metadata: { orderId: oid, channel: 'cod_settlement', role: 'talent' },
            now: now
        });
        if (!debit.success) {
            if (isInsufficientError(debit.message)) return fail(res, 400, 'Saldo talent tidak cukup untuk potongan platform COD');
            return fail(res, 400, 'Potongan platform COD gagal diproses');
        }

        var ownerId = await resolveOwnerUserId();
        if (ownerId) {
            var credit = await creditAndRecord({
                userId: ownerId,
                amount: platformCut,
                refType: 'order_settlement_cod',
                refId: oid,
                txType: 'commission',
                txId: 'cod_comm_owner_' + oid + '_' + ownerId,
                description: 'Komisi COD pesanan #' + prefix,
                idempotencyKey: 'settlecod:' + oid + ':owner:commission',
                actorType: 'admin',
                actorId: actorId,
                metadata: { orderId: oid, channel: 'cod_settlement', role: 'owner' },
                now: now
            });
            if (!credit.success) return fail(res, 400, 'Komisi COD owner gagal diproses');
        }
    }

    var merged = Object.assign({}, order, { walletSettled: true, walletSettledAt: now });
    var patch = await patchOrder(oid, merged);
    if (!patch.ok) return fail(res, 500, 'Payout COD berhasil, tetapi update order gagal');

    return res.status(200).json({ success: true, platformCut: platformCut, commission: commission, fee: fee });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
    if (!SUPABASE_SERVICE_KEY) return fail(res, 500, 'Supabase service role key belum dikonfigurasi');

    try {
        var body = req.body || {};
        var op = String(body.operation || 'pay').toLowerCase();
        if (op === 'completeorder') return handleCompleteOrder(body, res);
        if (op === 'completeordercod') return handleCompleteOrderCOD(body, res);
        return handlePay(body, res);
    } catch (err) {
        console.error('wallet/pay error:', err);
        return fail(res, 500, 'Terjadi kesalahan server');
    }
};
