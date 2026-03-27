const { SUPABASE_SERVICE_KEY, supaFetch, withCors } = require('../../services/push-core');

function nowTs() { return Date.now(); }

module.exports = async (req, res) => {
    withCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ success: false, message: 'SUPABASE_SERVICE_KEY belum dikonfigurasi' });
    }

    try {
        const body = req.body || {};
        const userId = String(body.userId || '').trim();
        const sub = body.subscription || {};
        const endpoint = String(sub.endpoint || body.endpoint || '').trim();
        const p256dh = String((sub.keys && sub.keys.p256dh) || body.p256dh || '').trim();
        const auth = String((sub.keys && sub.keys.auth) || body.auth || '').trim();

        if (!userId || !endpoint || !p256dh || !auth) {
            return res.status(400).json({ success: false, message: 'userId dan subscription (endpoint/keys) wajib diisi' });
        }

        const payload = {
            id: 'ps_' + nowTs() + '_' + Math.random().toString(36).slice(2, 8),
            user_id: userId,
            endpoint: endpoint,
            p256dh: p256dh,
            auth: auth,
            is_active: true,
            created_at: nowTs(),
            updated_at: nowTs(),
            data: {
                userAgent: String((body.meta && body.meta.userAgent) || req.headers['user-agent'] || ''),
                platform: String((body.meta && body.meta.platform) || ''),
                lang: String((body.meta && body.meta.lang) || '')
            }
        };

        const existingRes = await supaFetch('push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint) + '&select=id');
        if (!existingRes.ok) {
            const errTxt = await existingRes.text();
            return res.status(500).json({ success: false, message: 'Gagal cek subscription: ' + errTxt });
        }
        const existingRows = await existingRes.json();

        if (Array.isArray(existingRows) && existingRows.length > 0) {
            const updRes = await supaFetch('push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    user_id: userId,
                    p256dh: p256dh,
                    auth: auth,
                    is_active: true,
                    updated_at: nowTs(),
                    data: payload.data
                })
            });
            if (!updRes.ok) {
                const errTxt = await updRes.text();
                return res.status(500).json({ success: false, message: 'Gagal update subscription: ' + errTxt });
            }
            return res.status(200).json({ success: true, updated: true });
        }

        const insRes = await supaFetch('push_subscriptions', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payload)
        });

        if (!insRes.ok) {
            const errTxt = await insRes.text();
            return res.status(500).json({ success: false, message: 'Gagal simpan subscription: ' + errTxt });
        }

        return res.status(200).json({ success: true, inserted: true });
    } catch (err) {
        console.error('push subscribe error:', err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
};
