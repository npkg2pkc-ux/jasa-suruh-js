// Xendit Withdraw / Disbursement API
// POST /api/xendit/withdraw

const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqptkuoazqharfzxvgem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function isInsufficientError(txt) {
    return String(txt || '').toLowerCase().indexOf('insufficient balance') >= 0;
}

function supaFetch(path, options) {
    return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json'
        }
    }, options || {}));
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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!XENDIT_SECRET_KEY) return res.status(500).json({ error: 'Xendit belum dikonfigurasi' });
    if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase service role key belum dikonfigurasi' });

    const { userId, amount, bankCode, accountNumber, accountName } = req.body || {};

    if (!userId || !amount || Number(amount) < 10000) {
        return res.status(400).json({ error: 'Jumlah minimal penarikan Rp 10.000' });
    }
    if (!bankCode || !accountNumber || !accountName) {
        return res.status(400).json({ error: 'Data rekening bank harus diisi lengkap' });
    }

    const numAmount = Number(amount);
    const txId = 'wd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    const debitIdempotencyKey = 'withdraw:' + txId + ':debit';

    try {
        // Lock saldo via trusted mutation agar selalu punya jejak ledger + idempotency.
        const debitMutation = await applyWalletMutation({
            p_user_id: userId,
            p_direction: 'debit',
            p_amount: numAmount,
            p_ref_type: 'withdraw',
            p_ref_id: txId,
            p_reason: 'Penarikan saldo via Xendit',
            p_actor_type: 'user',
            p_actor_id: userId,
            p_idempotency_key: debitIdempotencyKey,
            p_metadata: {
                txId: txId,
                provider: 'xendit',
                bankCode: bankCode,
                accountNumber: accountNumber
            }
        });

        if (!debitMutation.success) {
            if (isInsufficientError(debitMutation.message)) {
                return res.status(400).json({ error: 'Saldo tidak cukup untuk penarikan ini' });
            }
            return res.status(400).json({ error: 'Gagal memproses potongan saldo penarikan' });
        }
        const dm = debitMutation.data;

        // Create Xendit Disbursement
        const auth = Buffer.from(XENDIT_SECRET_KEY + ':').toString('base64');
        const xenditRes = await fetch('https://api.xendit.co/disbursements', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + auth,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                external_id: txId,
                amount: numAmount,
                bank_code: bankCode,
                account_holder_name: accountName,
                account_number: accountNumber,
                description: 'Penarikan Saldo Jasa Suruh'
            })
        });

        const xenditData = await xenditRes.json();

        if (!xenditRes.ok) {
            // Refund otomatis jika gagal membuat disbursement.
            const refundMutation = await applyWalletMutation({
                p_user_id: userId,
                p_direction: 'credit',
                p_amount: numAmount,
                p_ref_type: 'withdraw_refund',
                p_ref_id: txId,
                p_reason: 'Refund penarikan gagal inisiasi Xendit',
                p_actor_type: 'system',
                p_actor_id: 'xendit_withdraw_api',
                p_idempotency_key: 'withdraw:' + txId + ':refund:init_fail',
                p_metadata: {
                    txId: txId,
                    provider: 'xendit',
                    stage: 'create_disbursement'
                }
            });
            if (!refundMutation.success) {
                console.error('Withdraw init refund mutation error:', refundMutation.message);
            }

            console.error('Xendit disbursement error:', xenditData);
            return res.status(400).json({ error: xenditData.message || 'Gagal membuat disbursement' });
        }

        // Save withdraw transaction
        const txData = {
            id: txId,
            userId: userId,
            type: 'withdraw',
            amount: -numAmount,
            status: 'processing',
            bankCode: bankCode,
            accountNumber: accountNumber,
            accountName: accountName,
            xenditDisbursementId: xenditData.id,
            ledgerId: dm.ledger_id,
            idempotencyKey: debitIdempotencyKey,
            balanceBefore: Number(dm.balance_before) || 0,
            balanceAfter: Number(dm.balance_after) || 0,
            description: 'Penarikan ke ' + bankCode + ' ' + accountNumber + ' (Proses)',
            createdAt: now
        };

        await supaFetch('transactions', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                id: txId,
                user_id: userId,
                type: 'withdraw',
                amount: -numAmount,
                created_at: now,
                data: txData
            })
        });

        return res.status(200).json({
            success: true,
            disbursementId: xenditData.id,
            status: xenditData.status
        });

    } catch (err) {
        console.error('Withdraw error:', err);
        return res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
};
