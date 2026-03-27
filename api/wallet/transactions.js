// Trusted wallet transactions read endpoint
// POST /api/wallet/transactions

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
        const limit = Math.max(1, Math.min(200, Number(body.limit) || 100));
        if (!userId) return fail(res, 400, 'userId wajib diisi');

        const q = SUPABASE_URL
            + '/rest/v1/transactions?user_id=eq.' + encodeURIComponent(userId)
            + '&select=data&order=created_at.desc&limit=' + String(limit);

        const r = await fetch(q, {
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY
            }
        });
        const rows = await r.json();
        const list = (Array.isArray(rows) ? rows : []).map(function (x) {
            return x && x.data ? x.data : {};
        });

        return res.status(200).json({ success: true, data: list });
    } catch (err) {
        console.error('wallet/transactions error:', err);
        return fail(res, 500, 'Terjadi kesalahan server');
    }
};
