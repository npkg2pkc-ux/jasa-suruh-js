// Xendit Withdraw / Disbursement API
// POST /api/xendit/withdraw

const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqptkuoazqharfzxvgem.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcHRrdW9henFoYXJmenh2Z2VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTYyOTUsImV4cCI6MjA4OTQ3MjI5NX0.mFEpJlSB7dJTaubqXj6jZtbh9wki1L37gg7NaCguzQI';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!XENDIT_SECRET_KEY) return res.status(500).json({ error: 'Xendit belum dikonfigurasi' });

    const { userId, amount, bankCode, accountNumber, accountName } = req.body || {};

    if (!userId || !amount || Number(amount) < 10000) {
        return res.status(400).json({ error: 'Jumlah minimal penarikan Rp 10.000' });
    }
    if (!bankCode || !accountNumber || !accountName) {
        return res.status(400).json({ error: 'Data rekening bank harus diisi lengkap' });
    }

    const numAmount = Number(amount);
    const txId = 'wd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    function supaFetch(path, options) {
        return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            }
        }, options));
    }

    try {
        // Check wallet balance
        const walletRes = await supaFetch('wallets?user_id=eq.' + encodeURIComponent(userId) + '&select=*');
        const walletRows = await walletRes.json();

        if (!walletRows || walletRows.length === 0) {
            return res.status(400).json({ error: 'Wallet tidak ditemukan' });
        }

        const currentBalance = Number(walletRows[0].balance) || 0;
        if (currentBalance < numAmount) {
            return res.status(400).json({ error: 'Saldo tidak cukup! Saldo: Rp ' + currentBalance.toLocaleString('id-ID') });
        }

        // Deduct wallet balance first
        const newBalance = currentBalance - numAmount;

        await supaFetch('wallets?user_id=eq.' + encodeURIComponent(userId), {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                balance: newBalance,
                updated_at: Date.now(),
                data: { userId: userId, balance: newBalance, updatedAt: Date.now() }
            })
        });

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
            // Refund wallet on failure
            await supaFetch('wallets?user_id=eq.' + encodeURIComponent(userId), {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    balance: currentBalance,
                    updated_at: Date.now(),
                    data: { userId: userId, balance: currentBalance, updatedAt: Date.now() }
                })
            });

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
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            description: 'Penarikan ke ' + bankCode + ' ' + accountNumber + ' (Proses)',
            createdAt: Date.now()
        };

        await supaFetch('transactions', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                id: txId,
                user_id: userId,
                type: 'withdraw',
                amount: -numAmount,
                created_at: Date.now(),
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
