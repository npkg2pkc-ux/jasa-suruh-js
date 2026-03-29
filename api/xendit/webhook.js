// Xendit Webhook Handler
// POST /api/xendit/webhook
// Handles invoice (top-up) and disbursement (withdraw) callbacks

const XENDIT_WEBHOOK_TOKEN = process.env.XENDIT_WEBHOOK_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqptkuoazqharfzxvgem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const { sendPushToUser } = require('../../services/push-core');

function supaFetch(path, options) {
    return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json'
        }
    }, options));
}

async function applyWalletMutation(params) {
    const rpcRes = await supaFetch('rpc/wallet_apply_mutation', {
        method: 'POST',
        body: JSON.stringify(params)
    });
    if (!rpcRes.ok) {
        const errText = await rpcRes.text();
        return { success: false, message: errText || 'wallet mutation failed' };
    }
    const rows = await rpcRes.json();
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row) return { success: false, message: 'wallet mutation empty result' };
    return { success: true, data: row };
}

function insertNotification(userId, icon, title, desc, type) {
    const nId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const now = Date.now();
    return supaFetch('notifications', {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
            id: nId,
            user_id: userId,
            created_at: now,
            data: { id: nId, userId: userId, icon: icon, title: title, desc: desc, type: type, unread: true, createdAt: now }
        })
    }).then(function () {
        return sendPushToUser(userId, {
            title: title,
            body: desc,
            type: type,
            tag: 'xendit-' + type + '-' + now,
            data: { type: type }
        }).catch(function () {});
    }).catch(function () {});
}

// Handle top-up invoice paid
async function handleTopUpPaid(body) {
    const txId = body.external_id;
    const paidAmount = body.paid_amount || body.amount;

    // Get pending transaction
    const txRes = await supaFetch('transactions?id=eq.' + encodeURIComponent(txId) + '&select=*');
    const txRows = await txRes.json();

    if (!txRows || txRows.length === 0) {
        return { received: true, message: 'Transaction not found' };
    }

    const tx = txRows[0];
    const txData = tx.data || {};

    // Idempotency check
    if (txData.status === 'paid') {
        return { received: true, message: 'Already processed' };
    }

    const userId = txData.userId || tx.user_id;
    const topUpAmount = Number(paidAmount) || Number(tx.amount) || 0;
    const idempotencyKey = txData.idempotencyKey || ('topup:' + txId + ':paid');

    const mutation = await applyWalletMutation({
        p_user_id: userId,
        p_direction: 'credit',
        p_amount: topUpAmount,
        p_ref_type: 'topup',
        p_ref_id: txId,
        p_reason: 'Top Up via Xendit',
        p_actor_type: 'system',
        p_actor_id: 'xendit_webhook',
        p_idempotency_key: idempotencyKey,
        p_metadata: {
            txId: txId,
            provider: 'xendit',
            event: 'PAID',
            invoiceId: body.id || txData.xenditInvoiceId || ''
        }
    });

    if (!mutation.success) {
        throw new Error(mutation.message || 'wallet credit mutation failed');
    }

    const m = mutation.data;

    // Update transaction status to 'paid'
    await supaFetch('transactions?id=eq.' + encodeURIComponent(txId), {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
            data: Object.assign({}, txData, {
                status: 'paid',
                xenditPaymentId: body.id,
                ledgerId: m.ledger_id,
                idempotencyKey: idempotencyKey,
                balanceBefore: Number(m.balance_before) || 0,
                balanceAfter: Number(m.balance_after) || 0,
                description: 'Top Up via Xendit ✅',
                paidAt: Date.now()
            })
        })
    });

    // Notify user
    await insertNotification(userId, '✅', 'Top Up Berhasil', 'Saldo bertambah ' + formatAmount(topUpAmount) + '. Saldo sekarang ' + formatAmount(Number(m.balance_after) || 0), 'topup');

    return { success: true };
}

function formatAmount(n) {
    return 'Rp ' + Number(n).toLocaleString('id-ID');
}

// Handle top-up invoice expired
async function handleTopUpExpired(body) {
    const txId = body.external_id;

    const txRes = await supaFetch('transactions?id=eq.' + encodeURIComponent(txId) + '&select=*');
    const txRows = await txRes.json();

    if (!txRows || txRows.length === 0) return { received: true };

    const txData = txRows[0].data || {};
    if (txData.status === 'paid') return { received: true, message: 'Already paid' };

    await supaFetch('transactions?id=eq.' + encodeURIComponent(txId), {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
            data: Object.assign({}, txData, {
                status: 'expired',
                description: 'Top Up Expired ❌',
                expiredAt: Date.now()
            })
        })
    });

    // Notify user
    const userId = txData.userId || txRows[0].user_id;
    if (userId) {
        await insertNotification(userId, '⏰', 'Top Up Kedaluwarsa', 'Pembayaran top up tidak selesai dan telah kedaluwarsa.', 'topup');
    }

    return { received: true };
}

// Handle disbursement completed/failed
async function handleDisbursement(body) {
    const txId = body.external_id;
    const status = body.status;

    const txRes = await supaFetch('transactions?id=eq.' + encodeURIComponent(txId) + '&select=*');
    const txRows = await txRes.json();

    if (!txRows || txRows.length === 0) return { received: true };

    const tx = txRows[0];
    const txData = tx.data || {};

    // Idempotency
    if (txData.status === 'completed' || txData.status === 'refunded') {
        return { received: true, message: 'Already processed' };
    }

    if (status === 'COMPLETED') {
        // Mark transaction as completed
        await supaFetch('transactions?id=eq.' + encodeURIComponent(txId), {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                data: Object.assign({}, txData, {
                    status: 'completed',
                    description: 'Penarikan ke ' + (txData.bankCode || '') + ' ✅',
                    completedAt: Date.now()
                })
            })
        });

        // Notify user
        const userId = txData.userId || tx.user_id;
        const amt = Math.abs(Number(tx.amount) || 0);
        if (userId) {
            await insertNotification(userId, '🏧', 'Penarikan Berhasil', 'Penarikan ' + formatAmount(amt) + ' ke ' + (txData.bankCode || 'bank') + ' berhasil.', 'withdraw');
        }
    } else if (status === 'FAILED') {
        // Refund wallet
        const userId = txData.userId || tx.user_id;
        const refundAmount = Math.abs(Number(tx.amount) || 0);
        const refundIdempotencyKey = txData.refundIdempotencyKey || ('withdraw:' + txId + ':refund');
        const refundMutation = await applyWalletMutation({
            p_user_id: userId,
            p_direction: 'credit',
            p_amount: refundAmount,
            p_ref_type: 'withdraw_refund',
            p_ref_id: txId,
            p_reason: 'Refund withdraw gagal via Xendit',
            p_actor_type: 'system',
            p_actor_id: 'xendit_webhook',
            p_idempotency_key: refundIdempotencyKey,
            p_metadata: {
                txId: txId,
                provider: 'xendit',
                event: 'FAILED'
            }
        });
        if (!refundMutation.success) {
            throw new Error(refundMutation.message || 'wallet refund mutation failed');
        }
        const rm = refundMutation.data;

        // Update transaction
        await supaFetch('transactions?id=eq.' + encodeURIComponent(txId), {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                data: Object.assign({}, txData, {
                    status: 'refunded',
                    description: 'Penarikan gagal - saldo dikembalikan ❌',
                    failedAt: Date.now(),
                    refundAmount: refundAmount,
                    refundLedgerId: rm.ledger_id,
                    refundIdempotencyKey: refundIdempotencyKey,
                    balanceAfterRefund: Number(rm.balance_after) || 0
                })
            })
        });

        // Notify user about failed withdrawal + refund
        if (userId) {
            await insertNotification(userId, '❌', 'Penarikan Gagal', 'Penarikan ' + formatAmount(refundAmount) + ' gagal. Saldo telah dikembalikan.', 'withdraw');
        }
    }

    return { received: true };
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase service role key belum dikonfigurasi' });

    // Verify callback token if configured
    if (XENDIT_WEBHOOK_TOKEN) {
        const token = req.headers['x-callback-token'];
        if (token !== XENDIT_WEBHOOK_TOKEN) {
            return res.status(401).json({ error: 'Invalid callback token' });
        }
    }

    const body = req.body || {};
    const externalId = body.external_id || '';
    const status = body.status || '';

    try {
        let result;

        if (externalId.startsWith('topup_')) {
            if (status === 'PAID') {
                result = await handleTopUpPaid(body);
            } else if (status === 'EXPIRED') {
                result = await handleTopUpExpired(body);
            } else {
                result = { received: true };
            }
        } else if (externalId.startsWith('wd_')) {
            if (status === 'COMPLETED' || status === 'FAILED') {
                result = await handleDisbursement(body);
            } else {
                result = { received: true };
            }
        } else {
            result = { received: true, message: 'Unknown event type' };
        }

        return res.status(200).json(result);

    } catch (err) {
        console.error('Webhook error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
