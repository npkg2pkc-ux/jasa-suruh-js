const webpush = require('web-push');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqptkuoazqharfzxvgem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT || 'mailto:support@jasasuruh.app';
const WEB_PUSH_PUBLIC_KEY = process.env.WEB_PUSH_PUBLIC_KEY || '';
const WEB_PUSH_PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY || '';

let _webPushReady = false;

function toJsonSafe(txt, fallback) {
    try { return JSON.parse(txt); } catch (e) { return fallback; }
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

function ensureWebPushReady() {
    if (_webPushReady) return true;
    if (!WEB_PUSH_PUBLIC_KEY || !WEB_PUSH_PRIVATE_KEY) return false;
    webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);
    _webPushReady = true;
    return true;
}

function buildPushPayload(payload) {
    const p = payload || {};
    return JSON.stringify({
        title: p.title || 'Jasa Suruh',
        body: p.body || p.message || 'Ada notifikasi baru',
        tag: p.tag || 'js-push',
        orderId: p.orderId || '',
        type: p.type || 'info',
        data: p.data || {},
        icon: p.icon || '/icons/icon-192.png',
        badge: p.badge || '/icons/icon-72.png',
        requireInteraction: !!p.requireInteraction,
        vibrate: p.vibrate || [200, 100, 200]
    });
}

async function listSubscriptionsByUser(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return [];

    const resp = await supaFetch('push_subscriptions?user_id=eq.' + encodeURIComponent(uid) + '&is_active=eq.true&select=*');
    if (!resp.ok) {
        const errTxt = await resp.text();
        throw new Error('Gagal mengambil subscriptions: ' + errTxt);
    }

    const rows = await resp.json();
    return Array.isArray(rows) ? rows : [];
}

async function deactivateSubscriptionByEndpoint(endpoint) {
    if (!endpoint) return;
    await supaFetch('push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ is_active: false, updated_at: Date.now() })
    });
}

async function sendPushToUser(userId, payload) {
    if (!ensureWebPushReady()) {
        return { success: false, message: 'WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY belum dikonfigurasi', sent: 0, failed: 0 };
    }

    const subs = await listSubscriptionsByUser(userId);
    if (subs.length === 0) {
        return { success: true, sent: 0, failed: 0, message: 'Tidak ada subscription aktif' };
    }

    const msg = buildPushPayload(payload);
    const type = String((payload && payload.type) || 'info');
    let sent = 0;
    let failed = 0;

    for (const row of subs) {
        const endpoint = row.endpoint || '';
        const p256dh = row.p256dh || '';
        const auth = row.auth || '';
        if (!endpoint || !p256dh || !auth) {
            failed++;
            continue;
        }

        const sub = {
            endpoint: endpoint,
            keys: { p256dh: p256dh, auth: auth }
        };

        try {
            await webpush.sendNotification(sub, msg, {
                TTL: type === 'new_order' ? 3600 : 300,
                urgency: type === 'new_order' ? 'high' : 'normal',
                topic: String((payload && payload.tag) || ('js-' + type)).slice(0, 32)
            });
            sent++;
        } catch (err) {
            failed++;
            const statusCode = err && err.statusCode ? Number(err.statusCode) : 0;
            if (statusCode === 404 || statusCode === 410) {
                await deactivateSubscriptionByEndpoint(endpoint);
            }
        }
    }

    return { success: true, sent: sent, failed: failed };
}

function withCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    WEB_PUSH_PUBLIC_KEY,
    toJsonSafe,
    supaFetch,
    ensureWebPushReady,
    sendPushToUser,
    withCors
};
