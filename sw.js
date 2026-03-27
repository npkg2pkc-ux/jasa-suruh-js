const CACHE_NAME = 'js-app-v22';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/supabase.js',
    '/services/auth.js',
    '/js/core.js',
    '/js/shared.js',
    '/js/user.js',
    '/js/talent.js',
    '/js/penjual.js',
    '/js/cs.js',
    '/js/owner.js',
    '/js/staff-app.js',
    '/js/login.js',
    '/js/account.js',
    '/js/register.js',
    '/js/app.js',
    '/manifest.json',
    '/favicon.png',
    '/icons/icon-72.png',
    '/icons/icon-96.png',
    '/icons/icon-128.png',
    '/icons/icon-144.png',
    '/icons/icon-152.png',
    '/icons/icon-192.png',
    '/icons/icon-384.png',
    '/icons/icon-512.png',
    '/sound/Notification.mp3',
    '/public/sound/Notification.mp3'
];

// Install
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Add assets individually so one failure doesn't block everything
            return Promise.allSettled(ASSETS.map(url => cache.add(url)));
        })
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
    if (!event.request || !event.request.url) return;
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;
    if (event.request.url.includes('supabase.co')) return;
    if (event.request.url.includes('/api/')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// ── Background Sync for location broadcast ──
self.addEventListener('sync', (event) => {
    if (event.tag === 'js-location-sync') {
        event.waitUntil(doLocationSync());
    }
    if (event.tag === 'js-order-poll') {
        event.waitUntil(doOrderPoll());
    }
});

async function doLocationSync() {
    try {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => {
            client.postMessage({ type: 'SW_LOCATION_SYNC_REQUEST' });
        });
    } catch (e) {}
}

async function doOrderPoll() {
    try {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => {
            client.postMessage({ type: 'SW_ORDER_POLL_REQUEST' });
        });
    } catch (e) {}
}

// ── Push Notification Handler ──
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'Jasa Suruh', body: event.data ? event.data.text() : 'Ada notifikasi baru' };
    }

    const title = data.title || 'Jasa Suruh';
    const options = {
        body: data.body || data.message || 'Ada notifikasi baru',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag: data.tag || 'js-notification',
        data: data,
        vibrate: [200, 100, 200],
        requireInteraction: data.requireInteraction || false,
        actions: []
    };

    if (data.orderId) {
        options.tag = 'js-order-' + data.orderId;
        if (data.type === 'new_order') {
            options.actions = [
                { action: 'accept', title: '✅ Terima' },
                { action: 'dismiss', title: '❌ Tolak' }
            ];
            options.requireInteraction = true;
        }
    }

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// ── Notification Click Handler ──
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data || {};
    const orderId = data.orderId || '';
    const action = event.action;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Try to focus existing tab
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    client.focus();
                    client.postMessage({ type: 'NOTIF_CLICK', action, orderId, data });
                    return;
                }
            }
            // Open new tab if no existing tab found
            if (self.clients.openWindow) {
                return self.clients.openWindow('/').then(client => {
                    if (client) {
                        setTimeout(() => {
                            client.postMessage({ type: 'NOTIF_CLICK', action, orderId, data });
                        }, 1500);
                    }
                });
            }
        })
    );
});

// ── Periodic Background Sync (for notifications when app is closed) ──
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'js-background-poll') {
        event.waitUntil(doBackgroundPoll());
    }
});

async function doBackgroundPoll() {
    // Notify all open clients to poll
    try {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (clients.length > 0) {
            clients.forEach(c => c.postMessage({ type: 'SW_BACKGROUND_POLL' }));
        }
    } catch (e) {}
}

// Listen for skip waiting message from client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    // Reserved for future background location sync bridge.
    if (event.data && event.data.type === 'DRIVER_LOCATION_UPDATE') {
        return;
    }

    // Show a notification from client (for when app is in background)
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const d = event.data;
        const options = {
            body: d.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            tag: d.tag || ('js-notif-' + Date.now()),
            vibrate: d.vibrate || [200, 100, 200],
            data: d.data || {},
            requireInteraction: !!d.requireInteraction,
            silent: false
        };
        event.waitUntil(self.registration.showNotification(d.title || 'Jasa Suruh', options));
    }
});

// Ask open clients to renew push subscription when browser rotates it.
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            clients.forEach((client) => {
                client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' });
            });
        })
    );
});
