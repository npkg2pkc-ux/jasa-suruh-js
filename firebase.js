/* ========================================
   JASA SURUH - Firebase Backend
   Menggantikan Google Apps Script + Google Sheets
   ======================================== */

(function () {
    'use strict';

    function ok(data) { return { success: true, data: data }; }
    function fail(msg) { return { success: false, message: msg || 'Error' }; }

    function buildUnavailableApi(reason) {
        var message = reason || 'Firebase belum siap';
        console.warn('Firebase disabled:', message);
        return {
            isReady: function () { return false; },
            get: function () {
                return Promise.resolve({ json: function () { return Promise.resolve(fail(message)); } });
            },
            post: function () { return Promise.resolve(fail(message)); },
            onOrdersForUser: function () { return function () {}; },
            onOrder: function () { return function () {}; },
            onMessages: function () { return function () {}; },
            onTalentLocation: function () { return function () {}; },
            setTalentLocation: function () {}
        };
    }

    function hasUsableFirebaseConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') return false;
        var required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
        for (var i = 0; i < required.length; i++) {
            var key = required[i];
            if (!cfg[key] || typeof cfg[key] !== 'string') return false;
        }
        return required.every(function (key) {
            return cfg[key].indexOf('YOUR_') === -1;
        });
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // ── Firebase Config ──
    // PENTING: Isi dengan konfigurasi Firebase project Anda
    // Cara mendapatkan: Firebase Console → Project Settings → Your Apps → Web App Config
    var defaultFirebaseConfig = {
        apiKey: "AIzaSyBZzoTR7ermSsk-sJMnOP1F7U0mYnDjoTY",
        authDomain: "jsid-701e3.firebaseapp.com",
        databaseURL: "https://jsid-701e3-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "jsid-701e3",
        storageBucket: "jsid-701e3.firebasestorage.app",
        messagingSenderId: "621847843832",
        appId: "1:621847843832:web:8e811001cab8c0dc533c0d"
    };
    // Bisa di-override dari script global: window.__FIREBASE_CONFIG__
    var firebaseConfig = window.__FIREBASE_CONFIG__ || defaultFirebaseConfig;

    var db = null;
    var rtdb = null;
    var isFirebaseReady = false;

    if (typeof firebase === 'undefined') {
        window.FB = buildUnavailableApi('Firebase SDK tidak termuat');
        return;
    }

    if (!hasUsableFirebaseConfig(firebaseConfig)) {
        window.FB = buildUnavailableApi('Firebase config belum diisi (masih placeholder)');
        return;
    }

    try {
        // Cegah re-init jika sudah ada
        if (firebase.apps.length === 0) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        rtdb = firebase.database();
        isFirebaseReady = true;
    } catch (err) {
        console.error('Firebase init error:', err);
        window.FB = buildUnavailableApi('Inisialisasi Firebase gagal');
        return;
    }

    // Aktifkan Firestore offline persistence (optional, meningkatkan UX)
    db.enablePersistence({ synchronizeTabs: true })
        .catch(function (err) {
            if (err.code === 'failed-precondition') {
                console.warn('Firestore persistence: multiple tabs open');
            } else if (err.code === 'unimplemented') {
                console.warn('Firestore persistence: not supported in this browser');
            }
        });

    // ── Internal Helpers ──

    function docToObj(doc) {
        if (!doc.exists) return null;
        return Object.assign({ id: doc.id }, doc.data());
    }

    function snapToArr(snap) {
        var arr = [];
        snap.forEach(function (doc) {
            arr.push(Object.assign({ id: doc.id }, doc.data()));
        });
        return arr;
    }

    // ── GET Actions ──

    function getAll() {
        return db.collection('users').get()
            .then(function (snap) { return ok(snapToArr(snap)); });
    }

    function getAllSkills() {
        return db.collection('skills').get()
            .then(function (snap) {
                var result = {};
                snap.forEach(function (doc) {
                    result[doc.id] = (doc.data().skills) || [];
                });
                return ok(result);
            });
    }

    function getAllOrders() {
        return db.collection('orders').get()
            .then(function (snap) { return ok(snapToArr(snap)); });
    }

    function getOrdersByUser(userId) {
        // Firestore tidak mendukung OR pada field berbeda, jalankan 2 query paralel
        return Promise.all([
            db.collection('orders').where('userId', '==', userId).get(),
            db.collection('orders').where('talentId', '==', userId).get()
        ]).then(function (results) {
            var seen = {};
            var orders = [];
            results.forEach(function (snap) {
                snap.forEach(function (doc) {
                    var d = Object.assign({ id: doc.id }, doc.data());
                    if (!seen[d.id]) { seen[d.id] = true; orders.push(d); }
                });
            });
            return ok(orders);
        });
    }

    function getMessages(orderId) {
        return db.collection('orders').doc(orderId)
            .collection('messages')
            .orderBy('createdAt', 'asc')
            .get()
            .then(function (snap) { return ok(snapToArr(snap)); });
    }

    function getTalentRating(talentId) {
        return db.collection('orders')
            .where('talentId', '==', talentId)
            .get()
            .then(function (snap) {
                var total = 0, count = 0;
                snap.forEach(function (doc) {
                    var rating = Number(doc.data().rating || 0);
                    if (rating > 0) { total += rating; count++; }
                });
                var avg = count > 0 ? Math.round((total / count) * 10) / 10 : 0;
                return ok({ avg: avg, count: count });
            });
    }

    function getSettings() {
        return db.collection('settings').doc('config').get()
            .then(function (doc) {
                return ok(doc.exists ? doc.data() : {});
            });
    }

    function getAllStores() {
        return db.collection('stores').get()
            .then(function (snap) { return ok(snapToArr(snap)); });
    }

    function getStoresByUser(userId) {
        return db.collection('stores').where('userId', '==', userId).get()
            .then(function (snap) { return ok(snapToArr(snap)); });
    }

    function getProductsByStore(storeId) {
        return db.collection('products').where('storeId', '==', storeId).get()
            .then(function (snap) { return ok(snapToArr(snap)); });
    }

    function doLogin(username, password) {
        return db.collection('users')
            .where('username', '==', username)
            .limit(1)
            .get()
            .then(function (snap) {
                if (snap.empty) { return fail('Username atau password salah!'); }
                var user = Object.assign({ id: snap.docs[0].id }, snap.docs[0].data());
                if (user.password !== password) { return fail('Username atau password salah!'); }
                return ok(user);
            });
    }

    // ── POST Actions ──

    function doRegister(body) {
        var userData = Object.assign({}, body);
        delete userData.action;
        // Cek keunikan username terlebih dahulu
        return db.collection('users').where('username', '==', userData.username).get()
            .then(function (snap) {
                if (!snap.empty) { return fail('Username sudah digunakan!'); }
                return db.collection('users').doc(userData.id).set(userData)
                    .then(function () { return ok(userData); });
            });
    }

    function doDeleteUser(id) {
        return db.collection('users').doc(id).delete()
            .then(function () { return ok(null); });
    }

    function doUpdateLocation(body) {
        return db.collection('users').doc(body.userId).set(
            { lat: body.lat, lng: body.lng, address: body.address },
            { merge: true }
        ).then(function () { return ok(null); });
    }

    function doUpdateSkills(body) {
        return db.collection('skills').doc(body.userId).set({
            userId: body.userId,
            skills: body.skills
        }).then(function () { return ok(null); });
    }

    function doCreateOrder(body) {
        var orderData = Object.assign({}, body);
        delete orderData.action;
        orderData.id = orderData.id || generateId();
        orderData.status = orderData.status || 'pending';
        orderData.createdAt = orderData.createdAt || Date.now();
        return db.collection('orders').doc(orderData.id).set(orderData)
            .then(function () { return ok(orderData); });
    }

    function doUpdateOrder(body) {
        var fields = Object.assign({}, body.fields);
        return db.collection('orders').doc(body.orderId).set(fields, { merge: true })
            .then(function () { return ok(null); });
    }

    function doSendMessage(body) {
        var msgData = {
            orderId: body.orderId,
            senderId: body.senderId,
            senderName: body.senderName,
            text: body.text || '',
            photo: body.photo || '',
            createdAt: Date.now()
        };
        return db.collection('orders').doc(body.orderId)
            .collection('messages').add(msgData)
            .then(function (ref) {
                msgData.id = ref.id;
                return ok(msgData);
            });
    }

    function doRateOrder(body) {
        return db.collection('orders').doc(body.orderId).set(
            { rating: body.rating, review: body.review || '', status: 'rated' },
            { merge: true }
        ).then(function () { return ok(null); });
    }

    function doUpdateTalentLocation(body) {
        // Tulis ke RTDB untuk update real-time
        var locData = { lat: body.lat, lng: body.lng, updatedAt: Date.now() };
        return rtdb.ref('locations/' + body.orderId).set(locData)
            .then(function () {
                // Update juga di Firestore sebagai fallback offline
                return db.collection('orders').doc(body.orderId).set(
                    { talentLat: body.lat, talentLng: body.lng },
                    { merge: true }
                );
            }).then(function () { return ok(null); });
    }

    function doUpdateSettings(body) {
        var settings = Object.assign({}, body.settings);
        return db.collection('settings').doc('config').set(settings)
            .then(function () { return ok(null); });
    }

    function doCreateStore(body) {
        var storeData = Object.assign({}, body);
        delete storeData.action;
        return db.collection('stores').doc(storeData.id).set(storeData)
            .then(function () { return ok(storeData); });
    }

    function doUpdateStore(body) {
        var fields = Object.assign({}, body.fields);
        return db.collection('stores').doc(body.storeId).set(fields, { merge: true })
            .then(function () { return ok(null); });
    }

    function doCreateProduct(body) {
        var productData = Object.assign({}, body);
        delete productData.action;
        return db.collection('products').doc(productData.id).set(productData)
            .then(function () { return ok(productData); });
    }

    function doUpdateProduct(body) {
        var fields = Object.assign({}, body.fields);
        return db.collection('products').doc(body.productId).set(fields, { merge: true })
            .then(function () { return ok(null); });
    }

    function doDeleteProduct(body) {
        return db.collection('products').doc(body.productId).delete()
            .then(function () { return ok(null); });
    }

    // ── Dispatch GET ──
    function dispatchGet(action, params) {
        var p = params || {};
        switch (action) {
            case 'getAll': return getAll();
            case 'getAllSkills': return getAllSkills();
            case 'getAllOrders': return getAllOrders();
            case 'getOrdersByUser': return getOrdersByUser(p.userId);
            case 'getMessages': return getMessages(p.orderId);
            case 'getTalentRating': return getTalentRating(p.talentId);
            case 'getSettings': return getSettings();
            case 'getAllStores': return getAllStores();
            case 'getStoresByUser': return getStoresByUser(p.userId);
            case 'getProductsByStore': return getProductsByStore(p.storeId);
            case 'login': return doLogin(p.username, p.password);
            default: return Promise.reject(new Error('Unknown GET action: ' + action));
        }
    }

    // ── Dispatch POST ──
    function dispatchPost(body) {
        switch (body.action) {
            case 'register':
            case 'createCS': return doRegister(body);
            case 'delete': return doDeleteUser(body.id);
            case 'updateLocation': return doUpdateLocation(body);
            case 'updateSkills': return doUpdateSkills(body);
            case 'createOrder': return doCreateOrder(body);
            case 'updateOrder': return doUpdateOrder(body);
            case 'sendMessage': return doSendMessage(body);
            case 'rateOrder': return doRateOrder(body);
            case 'updateTalentLocation': return doUpdateTalentLocation(body);
            case 'updateSettings': return doUpdateSettings(body);
            case 'createStore': return doCreateStore(body);
            case 'updateStore': return doUpdateStore(body);
            case 'createProduct': return doCreateProduct(body);
            case 'updateProduct': return doUpdateProduct(body);
            case 'deleteProduct': return doDeleteProduct(body);
            default: return Promise.reject(new Error('Unknown POST action: ' + body.action));
        }
    }

    // ── Realtime Listeners ──

    // Listener semua pesanan milik seorang user (sebagai pelanggan ATAU talent/penjual)
    // Menggantikan polling timer dashboard talent & penjual
    // Mengembalikan fungsi unsubscribe
    function onOrdersForUser(userId, callback) {
        var state = { byUserId: [], byTalentId: [] };

        function merge() {
            var seen = {};
            var merged = [];
            state.byUserId.concat(state.byTalentId).forEach(function (o) {
                if (!seen[o.id]) { seen[o.id] = true; merged.push(o); }
            });
            callback({ success: true, data: merged });
        }

        var unsub1 = db.collection('orders').where('userId', '==', userId)
            .onSnapshot(function (snap) {
                state.byUserId = snapToArr(snap);
                merge();
            }, function (err) {
                console.error('FB onOrdersForUser (userId) error:', err);
            });

        var unsub2 = db.collection('orders').where('talentId', '==', userId)
            .onSnapshot(function (snap) {
                state.byTalentId = snapToArr(snap);
                merge();
            }, function (err) {
                console.error('FB onOrdersForUser (talentId) error:', err);
            });

        return function () { unsub1(); unsub2(); };
    }

    // Listener satu dokumen pesanan — menggantikan polling status order
    function onOrder(orderId, callback) {
        return db.collection('orders').doc(orderId)
            .onSnapshot(function (doc) {
                if (doc.exists) callback(Object.assign({ id: doc.id }, doc.data()));
            }, function (err) {
                console.error('FB onOrder error:', err);
            });
    }

    // Listener pesan chat — menggantikan chat polling timer (5 detik)
    function onMessages(orderId, callback) {
        return db.collection('orders').doc(orderId)
            .collection('messages')
            .orderBy('createdAt', 'asc')
            .onSnapshot(function (snap) {
                callback({ success: true, data: snapToArr(snap) });
            }, function (err) {
                console.error('FB onMessages error:', err);
            });
    }

    // Listener lokasi talent dari RTDB — menggantikan location polling
    function onTalentLocation(orderId, callback) {
        var ref = rtdb.ref('locations/' + orderId);
        ref.on('value', function (snap) {
            var data = snap.val();
            if (data) callback(data);
        });
        return function () { ref.off('value'); };
    }

    // ── Public API (window.FB) ──
    window.FB = {

        // Cek apakah Firebase sudah siap
        isReady: function () {
            return isFirebaseReady;
        },

        // Menggantikan: fetch(SCRIPT_URL + '?action=X&p1=v1')
        // Mengembalikan fake Response dengan .json() → Promise<result>
        // Sehingga kode .then(r => r.json()).then(res => ...) tidak perlu diubah
        get: function (action, params) {
            return dispatchGet(action, params)
                .then(function (result) {
                    return { json: function () { return Promise.resolve(result); } };
                })
                .catch(function (e) {
                    console.error('FB.get error (' + action + '):', e);
                    return { json: function () { return Promise.resolve(fail(e.message)); } };
                });
        },

        // Menggantikan: sheetPost(body) → mengembalikan Promise<{success, data, message}>
        post: function (body) {
            if (!body || !body.action) return Promise.resolve(null);
            return dispatchPost(body).catch(function (e) {
                console.error('FB.post error (' + body.action + '):', e);
                return fail(e.message);
            });
        },

        // Realtime: semua pesanan seorang user (untuk dashboard talent & penjual)
        onOrdersForUser: onOrdersForUser,

        // Realtime: satu dokumen pesanan (untuk halaman tracking)
        onOrder: onOrder,

        // Realtime: pesan chat (menggantikan chat polling)
        onMessages: onMessages,

        // Realtime: lokasi talent dari RTDB (untuk tracking map)
        onTalentLocation: onTalentLocation,

        // Kirim lokasi talent ke RTDB (dipanggil langsung untuk update cepat)
        setTalentLocation: function (orderId, lat, lng) {
            if (!isFirebaseReady) return;
            rtdb.ref('locations/' + orderId).set({ lat: lat, lng: lng, updatedAt: Date.now() });
        }
    };

})();
