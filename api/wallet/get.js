// Trusted wallet read endpoint
// POST /api/wallet/get

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqptkuoazqharfzxvgem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function fail(res, status, message) {
    return res.status(status).json({ success: false, message: message || 'Error' });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
    if (!SUPABASE_SERVICE_KEY) return fail(res, 500, 'Supabase service role key belum dikonfigurasi');

    try {
        const body = req.body || {};
        const userId = String(body.userId || '').trim();
        if (!userId) return fail(res, 400, 'userId wajib diisi');

        const q = SUPABASE_URL + '/rest/v1/wallets?user_id=eq.' + encodeURIComponent(userId) + '&select=user_id,balance,updated_at&limit=1';
        const r = await fetch(q, {
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY
            }
        });
        const rows = await r.json();
        const row = Array.isArray(rows) && rows.length ? rows[0] : null;

        return res.status(200).json({
            success: true,
            data: {
                userId: userId,
                balance: row ? Number(row.balance) || 0 : 0,
                updatedAt: row ? Number(row.updated_at) || 0 : 0
            }
        });
    } catch (err) {
        console.error('wallet/get error:', err);
        return fail(res, 500, 'Terjadi kesalahan server');
    }
};
