const { sendPushToUser, withCors } = require('./_core');

module.exports = async (req, res) => {
    withCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const body = req.body || {};
        const userId = String(body.userId || '').trim();

        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId wajib diisi' });
        }

        const result = await sendPushToUser(userId, {
            title: body.title,
            body: body.body,
            message: body.message,
            tag: body.tag,
            orderId: body.orderId,
            type: body.type,
            data: body.data,
            icon: body.icon,
            badge: body.badge,
            requireInteraction: body.requireInteraction,
            vibrate: body.vibrate
        });

        return res.status(200).json(result);
    } catch (err) {
        console.error('push send error:', err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
};
