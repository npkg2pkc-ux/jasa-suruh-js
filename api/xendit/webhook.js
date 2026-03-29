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

    // Get current wallet balance
    const walletRes = await supaFetch('wallets?user_id=eq.' + encodeURIComponent(userId) + '&select=*');
    const walletRows = await walletRes.json();

    let currentBalance = 0;
    if (walletRows && walletRows.length > 0) {
        currentBalance = Number(walletRows[0].balance) || 0;
    }

    const newBalance = currentBalance + topUpAmount;

    // Upsert wallet
    await supaFetch('wallets', {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
            user_id: userId,
            balance: newBalance,
            updated_at: Date.now(),
            data: { userId: userId, balance: newBalance, updatedAt: Date.now() }
        })
    });

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
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                description: 'Top Up via Xendit ✅',
                paidAt: Date.now()
            })
        })
    });

    // Notify user
    await insertNotification(userId, '✅', 'Top Up Berhasil', 'Saldo bertambah ' + formatAmount(topUpAmount) + '. Saldo sekarang ' + formatAmount(newBalance), 'topup');

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

        const walletRes = await supaFetch('wallets?user_id=eq.' + encodeURIComponent(userId) + '&select=*');
        const walletRows = await walletRes.json();

        let currentBalance = 0;
        if (walletRows && walletRows.length > 0) {
            currentBalance = Number(walletRows[0].balance) || 0;
        }

        const newBalance = currentBalance + refundAmount;

        await supaFetch('wallets?user_id=eq.' + encodeURIComponent(userId), {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                balance: newBalance,
                updated_at: Date.now(),
                data: { userId: userId, balance: newBalance, updatedAt: Date.now() }
            })
        });

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
                    balanceAfterRefund: newBalance
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
