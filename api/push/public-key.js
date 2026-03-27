const { WEB_PUSH_PUBLIC_KEY, withCors } = require('../../services/push-core');

module.exports = async (req, res) => {
    withCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

    if (!WEB_PUSH_PUBLIC_KEY) {
        return res.status(500).json({ success: false, message: 'WEB_PUSH_PUBLIC_KEY belum dikonfigurasi' });
    }

    return res.status(200).json({ success: true, publicKey: WEB_PUSH_PUBLIC_KEY });
};
