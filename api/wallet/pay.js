// Trusted wallet payment endpoint (real-money mode)
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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
    if (!SUPABASE_SERVICE_KEY) return fail(res, 500, 'Supabase service role key belum dikonfigurasi');

    try {
        var body = req.body || {};
        var userId = String(body.userId || '').trim();
        var orderId = String(body.orderId || '').trim();
        var amount = Math.abs(Number(body.amount) || 0);
        var description = String(body.description || 'Pembayaran Pesanan').trim();
        var actorId = String(body.actorId || userId || '').trim();

        if (!userId || !orderId || amount <= 0) {
            return fail(res, 400, 'userId, orderId, dan amount wajib valid');
        }

        var orderRes = await supaFetch('orders?id=eq.' + encodeURIComponent(orderId) + '&select=id,data&limit=1');
        var orderRows = await orderRes.json();
        if (!Array.isArray(orderRows) || orderRows.length === 0) {
            return fail(res, 404, 'Order tidak ditemukan');
        }

        var order = (orderRows[0] && orderRows[0].data) || {};
        if (typeof order === 'string') {
            try { order = JSON.parse(order); } catch (e) { order = {}; }
        }

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
        var rpcRes = await supaFetch('rpc/wallet_apply_mutation', {
            method: 'POST',
            body: JSON.stringify({
                p_user_id: userId,
                p_direction: 'debit',
                p_amount: expected,
                p_ref_type: 'order_payment',
                p_ref_id: orderId,
                p_reason: description,
                p_actor_type: 'user',
                p_actor_id: actorId || userId,
                p_idempotency_key: idempotencyKey,
                p_metadata: {
                    orderId: orderId,
                    userId: userId,
                    type: 'payment'
                }
            })
        });

        if (!rpcRes.ok) {
            var rpcErrText = await rpcRes.text();
            var low = String(rpcErrText || '').toLowerCase();
            if (low.indexOf('insufficient balance') >= 0) {
                return fail(res, 400, 'Saldo tidak cukup');
            }
            return fail(res, 400, 'Pembayaran gagal diproses');
        }

        var rpcRows = await rpcRes.json();
        var m = Array.isArray(rpcRows) && rpcRows.length ? rpcRows[0] : null;
        if (!m) return fail(res, 500, 'Mutasi wallet tidak mengembalikan data');

        var now = Date.now();
        var newOrder = Object.assign({}, order, {
            paidAmount: expected,
            paidAt: now,
            paymentStatus: 'paid',
            walletBalanceAfter: Number(m.balance_after) || 0
        });

        var patchRes = await supaFetch('orders?id=eq.' + encodeURIComponent(orderId), {
            method: 'PATCH',
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify({
                data: newOrder,
                user_id: newOrder.userId || null,
                talent_id: newOrder.talentId || null
            })
        });
        if (!patchRes.ok) return fail(res, 500, 'Pembayaran berhasil, tetapi update order gagal');

        var txId = 'pay_' + orderId + '_' + userId;
        var txData = {
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
        };

        await supaFetch('transactions?on_conflict=id', {
            method: 'POST',
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({
                id: txId,
                user_id: userId,
                type: 'payment',
                amount: -expected,
                created_at: now,
                data: txData
            })
        });

        return res.status(200).json({
            success: true,
            orderId: orderId,
            transactionId: txId,
            ledgerId: m.ledger_id,
            balance: Number(m.balance_after) || 0
        });
    } catch (err) {
        console.error('wallet/pay error:', err);
        return fail(res, 500, 'Terjadi kesalahan server');
    }
};
