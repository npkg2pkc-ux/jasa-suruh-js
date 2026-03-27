const { SUPABASE_SERVICE_KEY, supaFetch, withCors } = require('./_core');

module.exports = async (req, res) => {
    withCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ success: false, message: 'SUPABASE_SERVICE_KEY belum dikonfigurasi' });
    }

    try {
        const body = req.body || {};
        const endpoint = String((body.subscription && body.subscription.endpoint) || body.endpoint || '').trim();

        if (!endpoint) return res.status(400).json({ success: false, message: 'endpoint wajib diisi' });

        const updRes = await supaFetch('push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ is_active: false, updated_at: Date.now() })
        });

        if (!updRes.ok) {
            const errTxt = await updRes.text();
            return res.status(500).json({ success: false, message: 'Gagal unsubscribe: ' + errTxt });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('push unsubscribe error:', err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
};
