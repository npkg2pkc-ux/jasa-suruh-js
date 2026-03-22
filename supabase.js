/* ========================================
   JASA SURUH - Supabase Backend
   Backend utama aplikasi (migrasi dari Firebase)
   ======================================== */

(function () {
    'use strict';

    function ok(data) { return { success: true, data: data }; }
    function fail(msg) { return { success: false, message: msg || 'Error' }; }

    function buildUnavailableApi(reason) {
        var message = reason || 'Supabase belum siap';
        console.warn('Supabase disabled:', message);
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

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // ── Supabase Config ──
    // PENTING: Isi dengan konfigurasi Supabase project Anda
    // Cara mendapatkan: Supabase Dashboard → Settings → API
    var defaultSupabaseConfig = {
        url: 'https://aqptkuoazqharfzxvgem.supabase.co',        // e.g. https://xxxxx.supabase.co
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcHRrdW9henFoYXJmenh2Z2VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTYyOTUsImV4cCI6MjA4OTQ3MjI5NX0.mFEpJlSB7dJTaubqXj6jZtbh9wki1L37gg7NaCguzQI' // e.g. eyJhbGciOiJIUzI1NiIs...
    };
    // Bisa di-override dari script global: window.__SUPABASE_CONFIG__
    var config = window.__SUPABASE_CONFIG__ || defaultSupabaseConfig;

    var sb = null;
    var isSupabaseReady = false;

    if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
        window.FB = buildUnavailableApi('Supabase SDK tidak termuat');
        return;
    }

    if (!config.url || !config.anonKey ||
        config.url.indexOf('YOUR_') !== -1 || config.anonKey.indexOf('YOUR_') !== -1) {
        window.FB = buildUnavailableApi('Supabase config belum diisi (masih placeholder)');
        return;
    }

    try {
        sb = supabase.createClient(config.url, config.anonKey);
        isSupabaseReady = true;
    } catch (err) {
        console.error('Supabase init error:', err);
        window.FB = buildUnavailableApi('Inisialisasi Supabase gagal');
        return;
    }

    // ── Internal Helpers ──

    function rowToDoc(row) {
        return row ? row.data : null;
    }

    function rowsToArr(rows) {
        return (rows || []).map(function (r) { return r.data; });
    }

    function throwIfError(res) {
        if (res.error) throw new Error(res.error.message);
    }

    // ── GET Actions ──

    function getAll() {
        return sb.from('users').select('id, role, nama, no_hp, email, foto_url, username, data, created_at')
            .then(function (res) {
                throwIfError(res);
                var normalized = (res.data || []).map(function (row) {
                    var d = row.data || {};
                    if (typeof d === 'string') {
                        try { d = JSON.parse(d); } catch (e) { d = {}; }
                    }
                    return {
                        id: row.id || d.id,
                        name: row.nama || d.name || '',
                        nama: row.nama || d.name || '',
                        phone: row.no_hp || d.phone || '',
                        no_hp: row.no_hp || d.phone || '',
                        username: row.username || d.username || row.no_hp || '',
                        role: row.role || d.role || 'user',
                        email: row.email || d.email || '',
                        foto_url: row.foto_url || d.foto_url || '',
                        password: d.password || '',
                        createdAt: d.createdAt || row.created_at || Date.now(),
                        lat: d.lat || 0,
                        lng: d.lng || 0,
                        address: d.address || ''
                    };
                });
                return ok(normalized);
            });
    }

    function getAllSkills() {
        return sb.from('skills').select('user_id, data')
            .then(function (res) {
                throwIfError(res);
                var result = {};
                (res.data || []).forEach(function (row) {
                    result[row.user_id] = (row.data && row.data.skills) || [];
                });
                return ok(result);
            });
    }

    function getAllOrders() {
        return sb.from('orders').select('data')
            .then(function (res) {
                throwIfError(res);
                return ok(rowsToArr(res.data));
            });
    }

    function getOrdersByUser(userId) {
        return Promise.all([
            sb.from('orders').select('data').eq('user_id', userId),
            sb.from('orders').select('data').eq('talent_id', userId)
        ]).then(function (results) {
            var seen = {};
            var orders = [];
            results.forEach(function (res) {
                throwIfError(res);
                (res.data || []).forEach(function (row) {
                    var d = row.data;
                    if (d && !seen[d.id]) { seen[d.id] = true; orders.push(d); }
                });
            });
            return ok(orders);
        });
    }

    function getMessages(orderId) {
        return sb.from('messages').select('data')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true })
            .then(function (res) {
                throwIfError(res);
                return ok(rowsToArr(res.data));
            });
    }

    function getTalentRating(talentId) {
        return sb.from('orders').select('data')
            .eq('talent_id', talentId)
            .then(function (res) {
                throwIfError(res);
                var total = 0, count = 0;
                (res.data || []).forEach(function (row) {
                    var rating = Number((row.data && row.data.rating) || 0);
                    if (rating > 0) { total += rating; count++; }
                });
                var avg = count > 0 ? Math.round((total / count) * 10) / 10 : 0;
                return ok({ avg: avg, count: count });
            });
    }

    function getSettings() {
        return sb.from('settings').select('data')
            .eq('key', 'config')
            .single()
            .then(function (res) {
                if (res.error && res.error.code === 'PGRST116') {
                    // Not found
                    return ok({});
                }
                throwIfError(res);
                return ok(res.data ? res.data.data : {});
            });
    }

    function getAllStores() {
        return sb.from('stores').select('data')
            .then(function (res) {
                throwIfError(res);
                return ok(rowsToArr(res.data));
            });
    }

    function getStoresByUser(userId) {
        return sb.from('stores').select('data')
            .eq('user_id', userId)
            .then(function (res) {
                throwIfError(res);
                return ok(rowsToArr(res.data));
            });
    }

    function getProductsByStore(storeId) {
        return sb.from('products').select('data')
            .eq('store_id', storeId)
            .then(function (res) {
                throwIfError(res);
                return ok(rowsToArr(res.data));
            });
    }

    function doLogin(username, password) {
        return sb.from('users').select('data')
            .eq('username', username)
            .limit(1)
            .then(function (res) {
                throwIfError(res);
                if (!res.data || res.data.length === 0) {
                    return fail('Username atau password salah!');
                }
                var user = res.data[0].data;
                if (user.password !== password) {
                    return fail('Username atau password salah!');
                }
                return ok(user);
            });
    }

    // ── POST Actions ──

    function doRegister(body) {
        var userData = Object.assign({}, body);
        delete userData.action;

        // Normalize phone: always store as 62xxx
        var phone = (userData.phone || userData.no_hp || '').replace(/\D/g, '');
        if (phone.startsWith('08')) phone = '62' + phone.slice(1);
        else if (phone.startsWith('8')) phone = '62' + phone;
        else if (phone && !phone.startsWith('62')) phone = '62' + phone;
        userData.no_hp = phone;
        userData.phone = phone;
        if (!userData.username) userData.username = phone;

        var upsertData = {
            id: userData.id,
            username: userData.username,
            role: userData.role || 'user',
            nama: userData.name || userData.nama || '',
            no_hp: phone,
            email: userData.email || '',
            foto_url: userData.foto_url || '',
            data: userData
        };

        // Try upsert by id first; if username conflict, update by id instead
        return sb.from('users').upsert(upsertData, { onConflict: 'id' })
            .then(function (res) {
                if (res.error && res.error.code === '23505') {
                    // Username unique violation — update existing row by id
                    delete upsertData.username;
                    return sb.from('users').update(upsertData).eq('id', userData.id)
                        .then(function (res2) {
                            throwIfError(res2);
                            return ok(userData);
                        });
                }
                throwIfError(res);
                return ok(userData);
            });
    }

    function doDeleteUser(id) {
        return sb.from('users').delete().eq('id', id)
            .then(function (res) {
                throwIfError(res);
                return ok(null);
            });
    }

    function doUpdateLocation(body) {
        // Read current user data, merge location, write back
        return sb.from('users').select('data').eq('id', body.userId).single()
            .then(function (res) {
                throwIfError(res);
                var current = (res.data && res.data.data) || {};
                var merged = Object.assign({}, current, {
                    lat: body.lat,
                    lng: body.lng,
                    address: body.address
                });
                return sb.from('users').update({ data: merged }).eq('id', body.userId);
            })
            .then(function (res) {
                throwIfError(res);
                return ok(null);
            });
    }

    function doUpdateSkills(body) {
        return sb.from('skills').upsert({
            user_id: body.userId,
            data: { userId: body.userId, skills: body.skills }
        }).then(function (res) {
            throwIfError(res);
            return ok(null);
        });
    }

    function doCreateOrder(body) {
        var orderData = Object.assign({}, body);
        delete orderData.action;
        orderData.id = orderData.id || generateId();
        orderData.status = orderData.status || 'pending';
        orderData.createdAt = orderData.createdAt || Date.now();
        return sb.from('orders').upsert({
            id: orderData.id,
            user_id: orderData.userId || null,
            talent_id: orderData.talentId || null,
            data: orderData
        }).then(function (res) {
            throwIfError(res);
            return ok(orderData);
        });
    }

    function doUpdateOrder(body) {
        var fields = Object.assign({}, body.fields);
        var orderId = body.orderId;
        // Read, merge, write (equivalent to Firestore merge)
        return sb.from('orders').select('data').eq('id', orderId).single()
            .then(function (res) {
                throwIfError(res);
                var current = (res.data && res.data.data) || {};
                var merged = Object.assign({}, current, fields);
                return sb.from('orders').update({
                    data: merged,
                    user_id: merged.userId || null,
                    talent_id: merged.talentId || null
                }).eq('id', orderId);
            })
            .then(function (res) {
                throwIfError(res);
                return ok(null);
            });
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
        var msgId = generateId();
        msgData.id = msgId;
        return sb.from('messages').insert({
            id: msgId,
            order_id: body.orderId,
            created_at: msgData.createdAt,
            data: msgData
        }).then(function (res) {
            throwIfError(res);
            return ok(msgData);
        });
    }

    function doRateOrder(body) {
        return sb.from('orders').select('data').eq('id', body.orderId).single()
            .then(function (res) {
                throwIfError(res);
                var current = (res.data && res.data.data) || {};
                var merged = Object.assign({}, current, {
                    rating: body.rating,
                    review: body.review || '',
                    status: 'rated'
                });
                return sb.from('orders').update({
                    data: merged,
                    user_id: merged.userId || null,
                    talent_id: merged.talentId || null
                }).eq('id', body.orderId);
            })
            .then(function (res) {
                throwIfError(res);
                return ok(null);
            });
    }

    function doUpdateTalentLocation(body) {
        // Upsert to locations table (replaces Firebase RTDB)
        return sb.from('locations').upsert({
            order_id: body.orderId,
            lat: body.lat,
            lng: body.lng,
            updated_at: Date.now()
        }).then(function (res) {
            throwIfError(res);
            // Also update order document with talentLat/talentLng
            return doUpdateOrder({
                orderId: body.orderId,
                fields: { talentLat: body.lat, talentLng: body.lng }
            });
        });
    }

    function doUpdateSettings(body) {
        var settings = Object.assign({}, body.settings);
        return sb.from('settings').upsert({
            key: 'config',
            data: settings
        }).then(function (res) {
            throwIfError(res);
            return ok(null);
        });
    }

    function doCreateStore(body) {
        var storeData = Object.assign({}, body);
        delete storeData.action;
        return sb.from('stores').upsert({
            id: storeData.id,
            user_id: storeData.userId || null,
            data: storeData
        }).then(function (res) {
            throwIfError(res);
            return ok(storeData);
        });
    }

    function doUpdateStore(body) {
        var fields = Object.assign({}, body.fields);
        var storeId = body.storeId;
        return sb.from('stores').select('data').eq('id', storeId).single()
            .then(function (res) {
                throwIfError(res);
                var current = (res.data && res.data.data) || {};
                var merged = Object.assign({}, current, fields);
                return sb.from('stores').update({
                    data: merged,
                    user_id: merged.userId || null
                }).eq('id', storeId);
            })
            .then(function (res) {
                throwIfError(res);
                return ok(null);
            });
    }

    function doCreateProduct(body) {
        var productData = Object.assign({}, body);
        delete productData.action;
        return sb.from('products').upsert({
            id: productData.id,
            store_id: productData.storeId || null,
            data: productData
        }).then(function (res) {
            throwIfError(res);
            return ok(productData);
        });
    }

    function doUpdateProduct(body) {
        var fields = Object.assign({}, body.fields);
        var productId = body.productId;
        return sb.from('products').select('data').eq('id', productId).single()
            .then(function (res) {
                throwIfError(res);
                var current = (res.data && res.data.data) || {};
                var merged = Object.assign({}, current, fields);
                return sb.from('products').update({
                    data: merged,
                    store_id: merged.storeId || null
                }).eq('id', productId);
            })
            .then(function (res) {
                throwIfError(res);
                return ok(null);
            });
    }

    function doDeleteProduct(body) {
        return sb.from('products').delete().eq('id', body.productId)
            .then(function (res) {
                throwIfError(res);
                return ok(null);
            });
    }

    // ── Wallet Functions ──

    function getWallet(userId) {
        return sb.from('wallets').select('*').eq('user_id', userId).single()
            .then(function (res) {
                if (res.error && res.error.code === 'PGRST116') {
                    // No wallet yet — return zero balance
                    return ok({ userId: userId, balance: 0 });
                }
                throwIfError(res);
                var w = res.data;
                return ok({ userId: w.user_id, balance: Number(w.balance) || 0, updatedAt: w.updated_at });
            });
    }

    function getTransactions(userId) {
        return sb.from('transactions').select('data')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .then(function (res) {
                throwIfError(res);
                return ok(rowsToArr(res.data));
            });
    }

    function doTopUp(body) {
        var userId = body.userId;
        var amount = Math.abs(Number(body.amount) || 0);
        if (amount <= 0) return Promise.resolve(fail('Jumlah top up harus lebih dari 0'));

        return sb.from('wallets').select('*').eq('user_id', userId).single()
            .then(function (res) {
                var currentBalance = 0;
                if (!res.error && res.data) {
                    currentBalance = Number(res.data.balance) || 0;
                }
                var newBalance = currentBalance + amount;
                return sb.from('wallets').upsert({
                    user_id: userId,
                    balance: newBalance,
                    updated_at: Date.now(),
                    data: { userId: userId, balance: newBalance, updatedAt: Date.now() }
                }).then(function (ures) {
                    throwIfError(ures);
                    // Record transaction
                    var txId = generateId();
                    var txData = {
                        id: txId,
                        userId: userId,
                        type: 'topup',
                        amount: amount,
                        balanceBefore: currentBalance,
                        balanceAfter: newBalance,
                        description: 'Top Up Saldo',
                        createdAt: Date.now()
                    };
                    return sb.from('transactions').insert({
                        id: txId,
                        user_id: userId,
                        type: 'topup',
                        amount: amount,
                        created_at: txData.createdAt,
                        data: txData
                    }).then(function () {
                        return ok({ balance: newBalance });
                    });
                });
            });
    }

    function doWithdraw(body) {
        var userId = body.userId;
        var amount = Math.abs(Number(body.amount) || 0);
        if (amount <= 0) return Promise.resolve(fail('Jumlah penarikan harus lebih dari 0'));

        return sb.from('wallets').select('*').eq('user_id', userId).single()
            .then(function (res) {
                if (res.error || !res.data) return fail('Wallet tidak ditemukan');
                var currentBalance = Number(res.data.balance) || 0;
                if (currentBalance < amount) return fail('Saldo tidak cukup');

                var newBalance = currentBalance - amount;
                return sb.from('wallets').update({
                    balance: newBalance,
                    updated_at: Date.now(),
                    data: { userId: userId, balance: newBalance, updatedAt: Date.now() }
                }).eq('user_id', userId).then(function (ures) {
                    throwIfError(ures);
                    var txId = generateId();
                    var txData = {
                        id: txId,
                        userId: userId,
                        type: 'withdraw',
                        amount: -amount,
                        balanceBefore: currentBalance,
                        balanceAfter: newBalance,
                        description: 'Penarikan Saldo',
                        createdAt: Date.now()
                    };
                    return sb.from('transactions').insert({
                        id: txId,
                        user_id: userId,
                        type: 'withdraw',
                        amount: -amount,
                        created_at: txData.createdAt,
                        data: txData
                    }).then(function () {
                        return ok({ balance: newBalance });
                    });
                });
            });
    }

    function doWalletPay(body) {
        var userId = body.userId;
        var amount = Math.abs(Number(body.amount) || 0);
        var orderId = body.orderId || '';
        var desc = body.description || 'Pembayaran Pesanan';
        if (amount <= 0) return Promise.resolve(fail('Jumlah pembayaran harus lebih dari 0'));

        return sb.from('wallets').select('*').eq('user_id', userId).single()
            .then(function (res) {
                if (res.error || !res.data) return fail('Wallet tidak ditemukan. Silakan top up terlebih dahulu.');
                var currentBalance = Number(res.data.balance) || 0;
                if (currentBalance < amount) return fail('Saldo tidak cukup! Butuh Rp ' + amount.toLocaleString('id-ID') + ', saldo Anda Rp ' + currentBalance.toLocaleString('id-ID'));

                var newBalance = currentBalance - amount;
                return sb.from('wallets').update({
                    balance: newBalance,
                    updated_at: Date.now(),
                    data: { userId: userId, balance: newBalance, updatedAt: Date.now() }
                }).eq('user_id', userId).then(function (ures) {
                    throwIfError(ures);
                    var txId = generateId();
                    var txData = {
                        id: txId,
                        userId: userId,
                        type: 'payment',
                        amount: -amount,
                        orderId: orderId,
                        balanceBefore: currentBalance,
                        balanceAfter: newBalance,
                        description: desc,
                        createdAt: Date.now()
                    };
                    return sb.from('transactions').insert({
                        id: txId,
                        user_id: userId,
                        type: 'payment',
                        amount: -amount,
                        created_at: txData.createdAt,
                        data: txData
                    }).then(function () {
                        return ok({ balance: newBalance });
                    });
                });
            });
    }

    function doWalletCredit(body) {
        var userId = body.userId;
        var amount = Math.abs(Number(body.amount) || 0);
        var orderId = body.orderId || '';
        var type = body.type || 'earning';
        var desc = body.description || 'Pendapatan';

        return sb.from('wallets').select('*').eq('user_id', userId).single()
            .then(function (res) {
                var currentBalance = 0;
                if (!res.error && res.data) {
                    currentBalance = Number(res.data.balance) || 0;
                }
                var newBalance = currentBalance + amount;
                return sb.from('wallets').upsert({
                    user_id: userId,
                    balance: newBalance,
                    updated_at: Date.now(),
                    data: { userId: userId, balance: newBalance, updatedAt: Date.now() }
                }).then(function (ures) {
                    throwIfError(ures);
                    var txId = generateId();
                    var txData = {
                        id: txId,
                        userId: userId,
                        type: type,
                        amount: amount,
                        orderId: orderId,
                        balanceBefore: currentBalance,
                        balanceAfter: newBalance,
                        description: desc,
                        createdAt: Date.now()
                    };
                    return sb.from('transactions').insert({
                        id: txId,
                        user_id: userId,
                        type: type,
                        amount: amount,
                        created_at: txData.createdAt,
                        data: txData
                    }).then(function () {
                        return ok({ balance: newBalance });
                    });
                });
            });
    }

    function doWalletCompleteOrder(body) {
        // Called when order is completed — distribute funds to talent/penjual + owner commission
        var orderId = body.orderId;
        var talentId = body.talentId;
        var price = Number(body.price) || 0;
        var fee = Number(body.fee) || 0;
        var commissionPercent = Number(body.commissionPercent) || 10;
        var serviceType = body.serviceType || '';

        // Commission from price goes to owner
        var commission = Math.round(price * commissionPercent / 100);
        var talentEarning = price - commission;

        // Fee always goes to owner (platform fee)
        var ownerTotal = fee + commission;

        // Credit talent/penjual
        var creditTalent = doWalletCredit({
            userId: talentId,
            amount: talentEarning,
            orderId: orderId,
            type: 'earning',
            description: 'Pendapatan dari pesanan #' + orderId.substr(0, 8)
        });

        // Credit owner (find owner user)
        var creditOwner = sb.from('users').select('data').then(function (res) {
            if (res.error || !res.data) return ok(null);
            var ownerRow = res.data.find(function (r) {
                return r.data && r.data.role === 'owner';
            });
            if (!ownerRow || !ownerRow.data) return ok(null);
            var ownerId = ownerRow.data.id;
            return doWalletCredit({
                userId: ownerId,
                amount: ownerTotal,
                orderId: orderId,
                type: 'commission',
                description: 'Komisi dari pesanan #' + orderId.substr(0, 8) + ' (Fee: Rp ' + fee.toLocaleString('id-ID') + ' + Komisi: Rp ' + commission.toLocaleString('id-ID') + ')'
            }).then(function (res) {
                // Notify owner about incoming funds
                doAddNotification({
                    userId: ownerId,
                    icon: '💰',
                    title: 'Dana Masuk Rp ' + ownerTotal.toLocaleString('id-ID'),
                    desc: 'Komisi pesanan #' + orderId.substr(0, 8) + ' (Fee: Rp ' + fee.toLocaleString('id-ID') + ' + Komisi: Rp ' + commission.toLocaleString('id-ID') + ')',
                    type: 'earning',
                    orderId: orderId
                });
                return res;
            });
        });

        return Promise.all([creditTalent, creditOwner]).then(function () {
            return ok({ talentEarning: talentEarning, ownerTotal: ownerTotal, commission: commission });
        });
    }

    function doWalletCompleteOrderCOD(body) {
        // COD: Talent collected cash from user (totalCost).
        // Platform deducts fee + commission from talent's wallet.
        var orderId = body.orderId;
        var talentId = body.talentId;
        var price = Number(body.price) || 0;
        var fee = Number(body.fee) || 0;
        var commissionPercent = Number(body.commissionPercent) || 10;

        var commission = Math.round(price * commissionPercent / 100);
        var platformCut = fee + commission; // Total to deduct from talent

        // Deduct platform cut from talent's wallet
        var deductTalent = doWalletPay({
            userId: talentId,
            amount: platformCut,
            orderId: orderId,
            description: 'Potongan platform COD #' + orderId.substr(0, 8) + ' (Fee: Rp ' + fee.toLocaleString('id-ID') + ' + Komisi: Rp ' + commission.toLocaleString('id-ID') + ')'
        });

        // Credit owner
        var creditOwner = sb.from('users').select('data').then(function (res) {
            if (res.error || !res.data) return ok(null);
            var ownerRow = res.data.find(function (r) {
                return r.data && r.data.role === 'owner';
            });
            if (!ownerRow || !ownerRow.data) return ok(null);
            var ownerId = ownerRow.data.id;
            return doWalletCredit({
                userId: ownerId,
                amount: platformCut,
                orderId: orderId,
                type: 'commission',
                description: 'Komisi COD pesanan #' + orderId.substr(0, 8) + ' (Fee: Rp ' + fee.toLocaleString('id-ID') + ' + Komisi: Rp ' + commission.toLocaleString('id-ID') + ')'
            }).then(function (res) {
                // Notify owner about incoming funds
                doAddNotification({
                    userId: ownerId,
                    icon: '💰',
                    title: 'Dana Masuk (COD) Rp ' + platformCut.toLocaleString('id-ID'),
                    desc: 'Komisi COD pesanan #' + orderId.substr(0, 8) + ' (Fee: Rp ' + fee.toLocaleString('id-ID') + ' + Komisi: Rp ' + commission.toLocaleString('id-ID') + ')',
                    type: 'earning',
                    orderId: orderId
                });
                return res;
            });
        });

        return Promise.all([deductTalent, creditOwner]).then(function (results) {
            var deductRes = results[0];
            if (deductRes && !deductRes.success) {
                // Talent wallet insufficient — notify but don't block
                doAddNotification({ userId: talentId, icon: '⚠️', title: 'Saldo Minus', desc: 'Saldo tidak cukup untuk potongan platform COD. Harap top up.', type: 'payment', orderId: orderId });
            }
            return ok({ platformCut: platformCut, commission: commission, fee: fee });
        });
    }

    // ── Notification Functions ──

    function getNotifications(userId) {
        return sb.from('notifications').select('data')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50)
            .then(function (res) {
                throwIfError(res);
                return ok(rowsToArr(res.data));
            });
    }

    function doAddNotification(body) {
        var nId = body.id || generateId();
        var nData = {
            id: nId,
            userId: body.userId,
            icon: body.icon || '🔔',
            title: body.title || '',
            desc: body.desc || '',
            type: body.type || 'info',
            unread: true,
            createdAt: Date.now()
        };
        if (body.orderId) nData.orderId = body.orderId;
        if (body.extra) nData.extra = body.extra;
        return sb.from('notifications').insert({
            id: nId,
            user_id: body.userId,
            created_at: nData.createdAt,
            data: nData
        }).then(function (res) {
            throwIfError(res);
            return ok(nData);
        });
    }

    function doMarkNotifRead(body) {
        var notifId = body.notifId;
        return sb.from('notifications').select('data').eq('id', notifId).single()
            .then(function (res) {
                if (res.error) return ok(null);
                var current = (res.data && res.data.data) || {};
                current.unread = false;
                return sb.from('notifications').update({ data: current }).eq('id', notifId);
            })
            .then(function () { return ok(null); });
    }

    function doMarkAllNotifsRead(body) {
        return sb.from('notifications').select('id, data').eq('user_id', body.userId)
            .then(function (res) {
                throwIfError(res);
                var updates = (res.data || []).filter(function (r) {
                    return r.data && r.data.unread;
                }).map(function (r) {
                    var d = Object.assign({}, r.data, { unread: false });
                    return sb.from('notifications').update({ data: d }).eq('id', r.id);
                });
                return Promise.all(updates);
            })
            .then(function () { return ok(null); });
    }

    // ── Find nearby online talents for JS Antar ──
    function findNearbyTalents(body) {
        var userLat = Number(body.lat);
        var userLng = Number(body.lng);
        var skillType = body.skillType || 'js_antar';
        var excludeUserId = body.excludeUserId || '';
        var excludeTalentIds = body.excludeTalentIds || [];

        // Get all users + skills
        return Promise.all([
            sb.from('users').select('data'),
            sb.from('skills').select('user_id, data')
        ]).then(function (results) {
            var usersRes = results[0];
            var skillsRes = results[1];
            throwIfError(usersRes);
            throwIfError(skillsRes);

            var skillMap = {};
            (skillsRes.data || []).forEach(function (row) {
                skillMap[row.user_id] = (row.data && row.data.skills) || [];
            });

            var talents = [];
            (usersRes.data || []).forEach(function (row) {
                var u = row.data;
                if (!u || u.role !== 'talent') return;
                if (u.id === excludeUserId) return;
                if (excludeTalentIds.indexOf(u.id) >= 0) return;
                if (!u.isOnline) return;
                if (!u.lat || !u.lng) return;

                // Check if talent has the required skill
                var tSkills = skillMap[u.id] || [];
                var hasSkill = tSkills.some(function (s) { return s.type === skillType; });
                if (!hasSkill) return;

                // Calculate distance (Haversine)
                var dist = haversine(userLat, userLng, Number(u.lat), Number(u.lng));
                talents.push({ id: u.id, name: u.name, lat: u.lat, lng: u.lng, distance: dist });
            });

            // Sort by distance
            talents.sort(function (a, b) { return a.distance - b.distance; });

            return ok(talents);
        });
    }

    function haversine(lat1, lon1, lat2, lon2) {
        var R = 6371; // km
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // ── Update user online status ──
    function doSetOnlineStatus(body) {
        return sb.from('users').select('data').eq('id', body.userId).single()
            .then(function (res) {
                throwIfError(res);
                var current = (res.data && res.data.data) || {};
                var merged = Object.assign({}, current, { isOnline: !!body.isOnline });
                return sb.from('users').update({ data: merged }).eq('id', body.userId);
            })
            .then(function (res) {
                throwIfError(res);
                return ok(null);
            });
    }

    // ══════════════════════════════════
    // ═══ STAFF MANAGEMENT ═══
    // ══════════════════════════════════

    function getAllStaff() {
        return sb.from('staff').select('*').order('created_at', { ascending: false })
            .then(function (res) {
                throwIfError(res);
                return ok(res.data || []);
            });
    }

    function getStaffById(id) {
        return sb.from('staff').select('*').eq('id', id).single()
            .then(function (res) {
                throwIfError(res);
                return ok(res.data);
            });
    }

    function doCreateStaff(body) {
        var data = Object.assign({}, body);
        delete data.action;
        // Normalize phone to 62xxx
        var ph = (data.no_hp || '').replace(/\D/g, '');
        if (ph.startsWith('08')) ph = '62' + ph.slice(1);
        else if (ph.startsWith('8')) ph = '62' + ph;
        else if (ph && !ph.startsWith('62')) ph = '62' + ph;
        data.no_hp = ph;

        return sb.from('staff').select('id').eq('no_hp', data.no_hp).limit(1)
            .then(function (res) {
                throwIfError(res);
                if (res.data && res.data.length > 0) {
                    return fail('Nomor HP sudah terdaftar!');
                }
                return sb.from('staff').insert(data)
                    .then(function (res2) {
                        throwIfError(res2);
                        return ok(data);
                    });
            });
    }

    function doUpdateStaff(body) {
        var id = body.id;
        var data = Object.assign({}, body);
        delete data.action;
        delete data.id;
        // Normalize phone to 62xxx
        if (data.no_hp) {
            var ph = data.no_hp.replace(/\D/g, '');
            if (ph.startsWith('08')) ph = '62' + ph.slice(1);
            else if (ph.startsWith('8')) ph = '62' + ph;
            else if (ph && !ph.startsWith('62')) ph = '62' + ph;
            data.no_hp = ph;
        }
        data.updated_at = new Date().toISOString();
        return sb.from('staff').update(data).eq('id', id)
            .then(function (res) {
                throwIfError(res);
                return ok(data);
            });
    }

    function doDeleteStaff(body) {
        return sb.from('staff').delete().eq('id', body.id)
            .then(function (res) {
                throwIfError(res);
                return ok(null);
            });
    }

    function uploadStaffFile(path, file) {
        return sb.storage.from('staff-files').upload(path, file, { upsert: true })
            .then(function (res) {
                if (res.error) throw res.error;
                var publicUrl = sb.storage.from('staff-files').getPublicUrl(path);
                return ok(publicUrl.data.publicUrl);
            });
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
            case 'getWallet': return getWallet(p.userId);
            case 'getTransactions': return getTransactions(p.userId);
            case 'getNotifications': return getNotifications(p.userId);
            case 'findNearbyTalents': return findNearbyTalents(p);
            case 'getAllStaff': return getAllStaff();
            case 'getStaffById': return getStaffById(p.id);
            default: return Promise.reject(new Error('Unknown GET action: ' + action));
        }
    }

    // ── Dispatch POST ──
    function dispatchPost(body) {
        switch (body.action) {
            case 'register':
            case 'createCS':
            case 'createAdmin': return doRegister(body);
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
            case 'topUp': return doTopUp(body);
            case 'withdraw': return doWithdraw(body);
            case 'walletPay': return doWalletPay(body);
            case 'walletCredit': return doWalletCredit(body);
            case 'walletCompleteOrder': return doWalletCompleteOrder(body);
            case 'walletCompleteOrderCOD': return doWalletCompleteOrderCOD(body);
            case 'addNotification': return doAddNotification(body);
            case 'markNotifRead': return doMarkNotifRead(body);
            case 'markAllNotifsRead': return doMarkAllNotifsRead(body);
            case 'setOnlineStatus': return doSetOnlineStatus(body);
            case 'createStaff': return doCreateStaff(body);
            case 'updateStaff': return doUpdateStaff(body);
            case 'deleteStaff': return doDeleteStaff(body);
            default: return Promise.reject(new Error('Unknown POST action: ' + body.action));
        }
    }

    // ── Realtime Listeners (Supabase Realtime) ──

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

        function loadByUserId() {
            sb.from('orders').select('data').eq('user_id', userId)
                .then(function (res) {
                    if (!res.error && res.data) {
                        state.byUserId = rowsToArr(res.data);
                        merge();
                    }
                });
        }

        function loadByTalentId() {
            sb.from('orders').select('data').eq('talent_id', userId)
                .then(function (res) {
                    if (!res.error && res.data) {
                        state.byTalentId = rowsToArr(res.data);
                        merge();
                    }
                });
        }

        // Initial load
        loadByUserId();
        loadByTalentId();

        // Realtime subscription
        var channel = sb.channel('orders-user-' + userId)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'orders',
                filter: 'user_id=eq.' + userId
            }, function () { loadByUserId(); })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'orders',
                filter: 'talent_id=eq.' + userId
            }, function () { loadByTalentId(); })
            .subscribe();

        return function () { sb.removeChannel(channel); };
    }

    function onOrder(orderId, callback) {
        // Initial load
        sb.from('orders').select('data').eq('id', orderId).single()
            .then(function (res) {
                if (!res.error && res.data && res.data.data) {
                    callback(res.data.data);
                }
            });

        var channel = sb.channel('order-' + orderId)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'orders',
                filter: 'id=eq.' + orderId
            }, function (payload) {
                if (payload.new && payload.new.data) {
                    callback(payload.new.data);
                }
            })
            .subscribe();

        return function () { sb.removeChannel(channel); };
    }

    function onMessages(orderId, callback) {
        // Initial load
        sb.from('messages').select('data')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true })
            .then(function (res) {
                if (!res.error && res.data) {
                    callback({ success: true, data: rowsToArr(res.data) });
                }
            });

        var channel = sb.channel('messages-' + orderId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: 'order_id=eq.' + orderId
            }, function () {
                // Re-query for consistent ordering
                sb.from('messages').select('data')
                    .eq('order_id', orderId)
                    .order('created_at', { ascending: true })
                    .then(function (res) {
                        if (!res.error && res.data) {
                            callback({ success: true, data: rowsToArr(res.data) });
                        }
                    });
            })
            .subscribe();

        return function () { sb.removeChannel(channel); };
    }

    function onTalentLocation(orderId, callback) {
        // Initial load
        sb.from('locations').select('*').eq('order_id', orderId).single()
            .then(function (res) {
                if (!res.error && res.data) {
                    callback({ lat: res.data.lat, lng: res.data.lng, updatedAt: res.data.updated_at });
                }
            });

        var channel = sb.channel('location-' + orderId)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'locations',
                filter: 'order_id=eq.' + orderId
            }, function (payload) {
                if (payload.new) {
                    callback({ lat: payload.new.lat, lng: payload.new.lng, updatedAt: payload.new.updated_at });
                }
            })
            .subscribe();

        return function () { sb.removeChannel(channel); };
    }

    // ── Public API (window.FB) — sama persis dengan API Firebase ──
    window.FB = {

        isReady: function () {
            return isSupabaseReady;
        },

        // Wrapper GET — mengembalikan fake Response dengan .json()
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

        // Wrapper POST — Promise<{success, data, message}>
        post: function (body) {
            if (!body || !body.action) return Promise.resolve(null);
            return dispatchPost(body).catch(function (e) {
                console.error('FB.post error (' + body.action + '):', e);
                return fail(e.message);
            });
        },

        onOrdersForUser: onOrdersForUser,
        onOrder: onOrder,
        onMessages: onMessages,
        onTalentLocation: onTalentLocation,

        onWallet: function (userId, callback) {
            // Initial load
            getWallet(userId).then(function (res) {
                if (res.success) callback(res.data);
            });
            // Realtime
            var channel = sb.channel('wallet-' + userId)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'wallets',
                    filter: 'user_id=eq.' + userId
                }, function () {
                    getWallet(userId).then(function (res) {
                        if (res.success) callback(res.data);
                    });
                })
                .subscribe();
            return function () { sb.removeChannel(channel); };
        },

        onNotifications: function (userId, callback) {
            getNotifications(userId).then(function (res) {
                if (res.success) callback(res.data);
            });
            var channel = sb.channel('notifs-' + userId)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: 'user_id=eq.' + userId
                }, function () {
                    getNotifications(userId).then(function (res) {
                        if (res.success) callback(res.data);
                    });
                })
                .subscribe();
            return function () { sb.removeChannel(channel); };
        },

        setTalentLocation: function (orderId, lat, lng) {
            if (!isSupabaseReady) return;
            sb.from('locations').upsert({
                order_id: orderId,
                lat: lat,
                lng: lng,
                updated_at: Date.now()
            }).then(function () {});
        },

        // Expose raw Supabase client for auth service
        _sb: sb,

        // Staff file upload (for React staff app)
        uploadStaffFile: uploadStaffFile
    };

})();
