/* ========================================
   JASA SURUH - Supabase Backend
   Backend utama aplikasi (migrasi dari Firebase)
   ======================================== */

(function () {
    'use strict';

    function ok(data) { return { success: true, data: data }; }
    function fail(msg) { return { success: false, message: msg || 'Error' }; }
    var ACCOUNT_DELETE_COOLDOWN_KEY = 'account_delete_cooldowns';
    var ACCOUNT_DELETE_COOLDOWN_MS = 48 * 60 * 60 * 1000;

    function normalizePhone(phone) {
        var cleaned = String(phone || '').replace(/\D/g, '');
        if (!cleaned) return '';
        if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
        else if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
        return cleaned;
    }

    function isValidIndonesianMobilePhone(phone) {
        return /^628\d{8,12}$/.test(String(phone || ''));
    }

    function formatCooldownMessage(remainingMs) {
        var total = Math.max(0, Math.ceil((remainingMs || 0) / 1000));
        var hours = Math.floor(total / 3600);
        var minutes = Math.floor((total % 3600) / 60);
        return 'Akun ini baru saja dihapus. Coba daftar lagi dalam ' + hours + ' jam ' + minutes + ' menit.';
    }

    function buildUnavailableApi(reason) {
        var message = reason || 'Supabase belum siap';
        console.warn('Supabase disabled:', message);
        return {
            isReady: function () { return false; },
            get: function () {
                return Promise.resolve({ json: function () { return Promise.resolve(fail(message)); } });
            },
            post: function () { return Promise.resolve(fail(message)); },
            onAllOrders: function () { return function () {}; },
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
                        address: d.address || d.alamat_lengkap || '',
                        no_ktp: d.no_ktp || d.noKtp || '',
                        jenis_kelamin: d.jenis_kelamin || d.gender || '',
                        alamat_lengkap: d.alamat_lengkap || d.address || '',
                        jenis_motor: d.jenis_motor || d.vehicleType || '',
                        tahun_kendaraan: d.tahun_kendaraan || d.vehicleYear || '',
                        plat_nomor_kendaraan: d.plat_nomor_kendaraan || d.plateNo || '',
                        ktp_photo_url: d.ktp_photo_url || '',
                        driver_photo_url: d.driver_photo_url || d.foto_url || row.foto_url || '',
                        tanggal_lahir: d.tanggal_lahir || d.birthDate || '',
                        usia: (function () {
                            var n = Number(d.usia || d.age || 0);
                            return isFinite(n) ? n : 0;
                        })(),
                        agama: d.agama || d.religion || '',
                        deviceId: d.deviceId || ''
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
            sb.from('orders').select('data').eq('talent_id', userId),
            sb.from('orders').select('data').filter('data->>sellerId', 'eq', userId)
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

    function getSellerRating(sellerId) {
        return sb.from('orders').select('data')
            .filter('data->>sellerId', 'eq', sellerId)
            .then(function (res) {
                throwIfError(res);
                var total = 0, count = 0;
                (res.data || []).forEach(function (row) {
                    var rating = Number((row.data && row.data.sellerRating) || 0);
                    if (rating > 0) { total += rating; count++; }
                });
                var avg = count > 0 ? Math.round((total / count) * 10) / 10 : 0;
                return ok({ avg: avg, count: count });
            });
    }

    function _safeMarketingDateText(value) {
        var raw = String(value || '').trim();
        if (!raw) {
            return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        return raw;
    }

    function _mapMarketingRowToLegacy(row) {
        var raw = row || {};
        return {
            id: String(raw.id || generateId()),
            badge: String(raw.badge || '').trim() || (raw.content_type === 'promo' ? 'PROMO' : 'INFO'),
            title: String(raw.title || '').trim() || 'Info Jasa Suruh',
            description: String(raw.description || '').trim() || '-',
            dateText: _safeMarketingDateText(raw.date_text),
            imageUrl: String(raw.image_url || '').trim(),
            emoji: String(raw.emoji || '').trim() || (raw.content_type === 'promo' ? '✨' : '📰'),
            linkUrl: String(raw.link_url || '').trim()
        };
    }

    function _loadMarketingFromTable() {
        return sb.from('marketing_contents')
            .select('id, content_type, badge, title, description, image_url, emoji, date_text, link_url, sort_order, created_at')
            .eq('is_active', true)
            .order('content_type', { ascending: true })
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false })
            .then(function (res) {
                if (res && res.error) {
                    // If migration is not applied yet, keep legacy settings behaviour.
                    if (res.error.code === 'PGRST205' || /marketing_contents/i.test(String(res.error.message || ''))) {
                        return { promos: null, news: null };
                    }
                    throw new Error(res.error.message || 'Gagal membaca marketing_contents');
                }

                var promos = [];
                var news = [];
                (res.data || []).forEach(function (row) {
                    var mapped = _mapMarketingRowToLegacy(row);
                    if (row.content_type === 'promo') promos.push(mapped);
                    else news.push(mapped);
                });

                return { promos: promos, news: news };
            });
    }

    function _normalizeMarketingPayloadItem(type, item, idx) {
        var raw = item || {};
        var itemType = type === 'promo' ? 'promo' : 'info';
        var fallbackBadge = itemType === 'promo' ? 'PROMO' : 'INFO';
        var fallbackEmoji = itemType === 'promo' ? '✨' : '📰';

        return {
            id: String(raw.id || generateId() + '-' + idx),
            content_type: itemType,
            badge: String(raw.badge || '').trim() || fallbackBadge,
            title: String(raw.title || '').trim() || 'Info Jasa Suruh',
            description: String(raw.description || '').trim() || '-',
            image_url: String(raw.imageUrl || raw.image_url || raw.image || '').trim(),
            emoji: String(raw.emoji || '').trim() || fallbackEmoji,
            date_text: _safeMarketingDateText(raw.dateText || raw.date_text || raw.date),
            link_url: String(raw.linkUrl || raw.link_url || raw.link || '').trim(),
            sort_order: idx + 1,
            is_active: true,
            legacy_id: String(raw.id || '').trim() || null,
            meta: raw && typeof raw === 'object' ? raw : {}
        };
    }

    function _syncMarketingType(type, incoming, actorId) {
        var normalizedType = type === 'promo' ? 'promo' : 'info';
        var list = Array.isArray(incoming) ? incoming : [];
        var rows = list.map(function (item, idx) {
            var row = _normalizeMarketingPayloadItem(normalizedType, item, idx);
            row.updated_by = actorId || null;
            row.created_by = actorId || null;
            return row;
        });

        return sb.from('marketing_contents').select('id').eq('content_type', normalizedType)
            .then(function (res) {
                throwIfError(res);
                var existingIds = (res.data || []).map(function (r) { return String(r.id); });
                var incomingIds = rows.map(function (r) { return String(r.id); });
                var toDelete = existingIds.filter(function (id) { return incomingIds.indexOf(id) < 0; });

                var deletePromise = Promise.resolve();
                if (!incomingIds.length) {
                    deletePromise = sb.from('marketing_contents').delete().eq('content_type', normalizedType)
                        .then(function (delRes) { throwIfError(delRes); });
                } else if (toDelete.length) {
                    deletePromise = Promise.all(toDelete.map(function (id) {
                        return sb.from('marketing_contents').delete().eq('id', id)
                            .then(function (delRes) { throwIfError(delRes); });
                    })).then(function () { return null; });
                }

                return deletePromise.then(function () {
                    if (!rows.length) return null;
                    return sb.from('marketing_contents').upsert(rows, { onConflict: 'id' })
                        .then(function (upRes) { throwIfError(upRes); });
                });
            });
    }

    function getSettings() {
        return sb.from('settings').select('data')
            .eq('key', 'config')
            .single()
            .then(function (res) {
                if (res.error && res.error.code === 'PGRST116') {
                    return {};
                }
                throwIfError(res);
                return (res.data && res.data.data) ? res.data.data : {};
            })
            .then(function (settingsData) {
                var base = Object.assign({}, settingsData || {});
                return _loadMarketingFromTable().then(function (marketingData) {
                    if (marketingData.promos !== null && marketingData.news !== null) {
                        base.home_promos = marketingData.promos;
                        base.home_news = marketingData.news;
                    }
                    return ok(base);
                });
            });
    }

    function _getDeletionCooldownMap() {
        return sb.from('settings').select('data')
            .eq('key', ACCOUNT_DELETE_COOLDOWN_KEY)
            .single()
            .then(function (res) {
                if (res.error && res.error.code === 'PGRST116') return {};
                throwIfError(res);
                return (res.data && res.data.data) || {};
            });
    }

    function _saveDeletionCooldownMap(map) {
        return sb.from('settings').upsert({
            key: ACCOUNT_DELETE_COOLDOWN_KEY,
            data: map || {}
        }).then(function (res) {
            throwIfError(res);
            return map || {};
        });
    }

    function _pruneDeletionCooldownMap(map, nowTs) {
        var now = Number(nowTs || Date.now());
        var src = map || {};
        var out = {};
        Object.keys(src).forEach(function (phone) {
            var item = src[phone] || {};
            var until = Number(item.blockedUntil || 0);
            if (until > now) out[phone] = item;
        });
        return out;
    }

    function getAccountDeletionCooldown(phone) {
        var normalized = normalizePhone(phone);
        if (!normalized) return Promise.resolve(ok({ blocked: false, remainingMs: 0, blockedUntil: 0 }));

        return _getDeletionCooldownMap()
            .then(function (map) {
                var now = Date.now();
                var cleaned = _pruneDeletionCooldownMap(map, now);
                if (Object.keys(cleaned).length !== Object.keys(map || {}).length) {
                    _saveDeletionCooldownMap(cleaned).catch(function () {});
                }

                var item = cleaned[normalized] || null;
                if (!item) return ok({ blocked: false, remainingMs: 0, blockedUntil: 0 });

                var blockedUntil = Number(item.blockedUntil || 0);
                var remainingMs = Math.max(0, blockedUntil - now);
                if (remainingMs <= 0) return ok({ blocked: false, remainingMs: 0, blockedUntil: 0 });

                return ok({
                    blocked: true,
                    remainingMs: remainingMs,
                    blockedUntil: blockedUntil,
                    deletedAt: Number(item.deletedAt || 0),
                    role: item.role || ''
                });
            });
    }

    function setAccountDeletionCooldown(phone, durationMs, meta) {
        var normalized = normalizePhone(phone);
        if (!normalized) return Promise.resolve(ok(null));

        var ms = Math.max(0, Number(durationMs) || ACCOUNT_DELETE_COOLDOWN_MS);
        return _getDeletionCooldownMap()
            .then(function (map) {
                var next = _pruneDeletionCooldownMap(map, Date.now());
                next[normalized] = {
                    blockedUntil: Date.now() + ms,
                    deletedAt: Date.now(),
                    role: (meta && meta.role) || ''
                };
                return _saveDeletionCooldownMap(next);
            })
            .then(function () { return ok(null); });
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
        var role = String(userData.role || 'user').toLowerCase();

        function _upsertUserRow(payload) {
            return sb.from('users').upsert(payload, { onConflict: 'id' })
                .then(function (res) {
                    if (res.error && res.error.code === '23505') {
                        var updatePayload = Object.assign({}, payload);
                        delete updatePayload.username;
                        return sb.from('users').update(updatePayload).eq('id', userData.id)
                            .then(function (res2) {
                                throwIfError(res2);
                                return ok(userData);
                            });
                    }
                    throwIfError(res);
                    return ok(userData);
                });
        }

        function proceedUpsert() {
            // Normalize phone: always store as 62xxx
            var phone = (userData.phone || userData.no_hp || '').replace(/\D/g, '');
            if (phone.startsWith('08')) phone = '62' + phone.slice(1);
            else if (phone.startsWith('8')) phone = '62' + phone;
            else if (phone && !phone.startsWith('62')) phone = '62' + phone;

            if (!isValidIndonesianMobilePhone(phone)) {
                return fail('Hanya nomor Indonesia (+62 8...) yang diizinkan');
            }

            userData.no_hp = phone;
            userData.phone = phone;
            if (!userData.username) {
                userData.username = phone || (role === 'talent' ? ('drv_' + generateId().slice(-8)) : ('usr_' + generateId().slice(-8)));
            }

            return getAccountDeletionCooldown(phone)
                .then(function (cooldownRes) {
                    var cooldown = cooldownRes && cooldownRes.data;
                    if (cooldown && cooldown.blocked) {
                        return fail(formatCooldownMessage(cooldown.remainingMs));
                    }

                    // Semua data talent (alamat, ktp, kendaraan, dll) disimpan di kolom JSONB `data`.
                    // Kolom relasional hanya untuk field inti yang dipakai filter/index.
                    var upsertData = {
                        id: userData.id,
                        username: userData.username,
                        role: role,
                        nama: userData.name || userData.nama || '',
                        no_hp: phone,
                        email: userData.email || '',
                        foto_url: userData.foto_url || '',
                        data: userData
                    };

                    return _upsertUserRow(upsertData);
                });
        }

        if (role === 'talent') {
            var actorId = String(body && body.actorId || '').trim();
            if (!actorId) {
                // Allow existing talent to update own profile data without admin actor.
                var selfId = String(userData && userData.id || '').trim();
                if (!selfId) {
                    return Promise.resolve(fail('Pendaftaran driver hanya bisa dilakukan admin melalui menu rekrutment'));
                }
                return sb.from('users').select('id, role, data').eq('id', selfId).single()
                    .then(function (uRes) {
                        if (uRes.error || !uRes.data) {
                            return fail('Pendaftaran driver hanya bisa dilakukan admin melalui menu rekrutment');
                        }
                        var row = uRes.data || {};
                        var d = row.data || {};
                        var existingRole = String(row.role || d.role || '').toLowerCase();
                        if (existingRole !== 'talent') {
                            return fail('Pendaftaran driver hanya bisa dilakukan admin melalui menu rekrutment');
                        }
                        return proceedUpsert();
                    })
                    .catch(function () {
                        return fail('Pendaftaran driver hanya bisa dilakukan admin melalui menu rekrutment');
                    });
            }
            return resolveUserRoleById(actorId).then(function (actorRole) {
                if (actorRole !== 'admin' && actorRole !== 'owner') {
                    return fail('Akses ditolak: hanya admin/owner yang boleh merekrut driver');
                }
                return proceedUpsert();
            });
        }

        return proceedUpsert();
    }

    function doDeleteUser(body) {
        var userId = (body && body.id) ? body.id : body;
        var cooldownMs = (body && body.cooldownMs) ? Number(body.cooldownMs) : ACCOUNT_DELETE_COOLDOWN_MS;

        return sb.from('users').select('id, no_hp, role, data').eq('id', userId).single()
            .then(function (res) {
                throwIfError(res);
                var row = res.data || {};
                var data = row.data || {};
                var phone = normalizePhone(row.no_hp || data.phone || (body && body.phone) || '');
                var role = row.role || data.role || (body && body.role) || '';

                var storesPromise = sb.from('stores').select('id').eq('user_id', userId)
                    .then(function (sRes) {
                        throwIfError(sRes);
                        var storeIds = (sRes.data || []).map(function (r) { return r.id; }).filter(Boolean);
                        if (storeIds.length === 0) return Promise.resolve();
                        return sb.from('products').delete().in('store_id', storeIds)
                            .then(function (pDelRes) {
                                throwIfError(pDelRes);
                                return sb.from('stores').delete().eq('user_id', userId)
                                    .then(function (stDelRes) {
                                        throwIfError(stDelRes);
                                    });
                            });
                    });

                return Promise.all([
                    phone ? setAccountDeletionCooldown(phone, cooldownMs, { role: role }) : Promise.resolve(ok(null)),
                    sb.from('skills').delete().eq('user_id', userId).then(function (r1) { throwIfError(r1); }),
                    sb.from('wallets').delete().eq('user_id', userId).then(function (r2) { throwIfError(r2); }),
                    sb.from('notifications').delete().eq('user_id', userId).then(function (r3) { throwIfError(r3); }),
                    storesPromise
                ]).then(function () {
                    return sb.from('users').delete().eq('id', userId)
                        .then(function (delRes) {
                            throwIfError(delRes);
                            return ok({ cooldownApplied: !!phone, phone: phone, cooldownMs: cooldownMs });
                        });
                });
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

    function _isProtectedDriverStatus(status) {
        return status === 'on_the_way' || status === 'arrived' || status === 'in_progress' || status === 'completed';
    }

    function _isAllowedDriverTransition(prevStatus, nextStatus) {
        if (prevStatus === nextStatus) return true;
        if (nextStatus === 'on_the_way') return prevStatus === 'accepted';
        if (nextStatus === 'arrived') return prevStatus === 'on_the_way';
        if (nextStatus === 'in_progress') return prevStatus === 'arrived';
        if (nextStatus === 'completed') return prevStatus === 'in_progress';
        return true;
    }

    function _isValidLatLng(lat, lng) {
        var nLat = Number(lat);
        var nLng = Number(lng);
        if (!isFinite(nLat) || !isFinite(nLng)) return false;
        if (Math.abs(nLat) > 90 || Math.abs(nLng) > 180) return false;
        if (nLat === 0 && nLng === 0) return false;
        return true;
    }

    function _haversineKm(lat1, lon1, lat2, lon2) {
        var R = 6371;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function _isProductServiceOrder(order) {
        if (!order) return false;
        var skillType = String(order.skillType || '').toLowerCase();
        if (skillType === 'js_food' || skillType === 'js_shop' || skillType === 'js_medicine') return true;
        if (skillType === 'food' || skillType === 'shop' || skillType === 'medicine') return true;
        return !!(order.sellerId || order.storeId);
    }

    function _resolveOrderTargetCoords(order, nextStatus) {
        if (!order) return null;
        var isProductOrder = _isProductServiceOrder(order);
        var isRideFlow = (order.skillType === 'js_antar' || order.skillType === 'js_delivery');

        var userLat = Number(order.userLat);
        var userLng = Number(order.userLng);
        var storeLat = Number(order.storeLat);
        var storeLng = Number(order.storeLng);
        var destLat = Number(order.destLat);
        var destLng = Number(order.destLng);

        if (nextStatus === 'arrived') {
            if (isProductOrder && _isValidLatLng(storeLat, storeLng)) return { lat: storeLat, lng: storeLng, label: 'titik toko' };
            if (isProductOrder) return null;
            if (_isValidLatLng(userLat, userLng)) return { lat: userLat, lng: userLng, label: 'titik jemput' };
            return null;
        }

        if (nextStatus === 'in_progress') {
            if (isProductOrder && _isValidLatLng(storeLat, storeLng)) return { lat: storeLat, lng: storeLng, label: 'titik toko' };
            if (isProductOrder) return null;
            if (_isValidLatLng(userLat, userLng)) return { lat: userLat, lng: userLng, label: isRideFlow ? 'titik jemput' : 'lokasi user' };
            return null;
        }

        if (nextStatus === 'completed') {
            if (isRideFlow && _isValidLatLng(destLat, destLng)) return { lat: destLat, lng: destLng, label: 'titik tujuan' };
            if (_isValidLatLng(userLat, userLng)) return { lat: userLat, lng: userLng, label: 'lokasi user/pembeli' };
            return null;
        }

        return null;
    }

    function _resolveDriverCoords(orderId, currentOrder, fields) {
        var fLat = Number(fields && fields.talentLat);
        var fLng = Number(fields && fields.talentLng);
        if (_isValidLatLng(fLat, fLng)) {
            return Promise.resolve({ lat: fLat, lng: fLng });
        }

        var oLat = Number(currentOrder && currentOrder.talentLat);
        var oLng = Number(currentOrder && currentOrder.talentLng);
        if (_isValidLatLng(oLat, oLng)) {
            return Promise.resolve({ lat: oLat, lng: oLng });
        }

        return sb.from('locations').select('lat,lng').eq('order_id', orderId).single()
            .then(function (res) {
                if (res.error || !res.data) return null;
                var lat = Number(res.data.lat);
                var lng = Number(res.data.lng);
                if (_isValidLatLng(lat, lng)) return { lat: lat, lng: lng };
                return null;
            })
            .catch(function () { return null; });
    }

    function _validateProtectedStatusUpdate(orderId, currentOrder, mergedOrder, fields, body) {
        var nextStatus = String((fields && fields.status) || '');
        var prevStatus = String((currentOrder && currentOrder.status) || '');

        if (!_isProtectedDriverStatus(nextStatus)) return Promise.resolve('');
        if (!currentOrder || !currentOrder.talentId) return Promise.resolve('');

        var actorId = String((body && body.actorId) || (fields && fields.actorId) || '');
        if (!actorId || actorId !== String(currentOrder.talentId)) {
            return Promise.resolve('Update progress ditolak: hanya driver aktif yang dapat mengubah progress.');
        }

        if (!_isAllowedDriverTransition(prevStatus, nextStatus)) {
            return Promise.resolve('Update progress ditolak: urutan status tidak valid dari "' + prevStatus + '" ke "' + nextStatus + '".');
        }

        if (nextStatus === 'on_the_way') return Promise.resolve('');

        var target = _resolveOrderTargetCoords(mergedOrder, nextStatus);
        if (!target) {
            return Promise.resolve('Update progress ditolak: titik koordinat tujuan belum tersedia.');
        }

        return _resolveDriverCoords(orderId, currentOrder, fields).then(function (driverPos) {
            if (!driverPos) {
                return 'Update progress ditolak: koordinat driver tidak tersedia.';
            }

            var distKm = _haversineKm(driverPos.lat, driverPos.lng, target.lat, target.lng);
            var maxKm = 0.08;
            if (distKm > maxKm) {
                return 'Update progress ditolak: driver belum berada di sekitar ' + target.label + ' (jarak ' + Math.round(distKm * 1000) + ' m).';
            }

            return '';
        });
    }

    function doUpdateOrder(body) {
        var fields = Object.assign({}, body.fields);
        var orderId = body.orderId;
        var hasExplicitStatus = Object.prototype.hasOwnProperty.call(fields, 'status');
        // Read, merge, write (equivalent to Firestore merge)
        return sb.from('orders').select('data').eq('id', orderId).single()
            .then(function (res) {
                throwIfError(res);
                var current = (res.data && res.data.data) || {};
                var merged = Object.assign({}, current, fields);

                return _validateProtectedStatusUpdate(orderId, current, merged, fields, body).then(function (validationError) {
                    if (validationError) return fail(validationError);

                    // Non-status updates (e.g. live driver location) must merge with the latest
                    // row snapshot so they cannot overwrite a newer status transition.
                    if (!hasExplicitStatus) {
                        return sb.from('orders').select('data').eq('id', orderId).single()
                            .then(function (latestRes) {
                                throwIfError(latestRes);
                                var latest = (latestRes.data && latestRes.data.data) || {};
                                var latestMerged = Object.assign({}, latest, fields);
                                return sb.from('orders').update({
                                    data: latestMerged,
                                    user_id: latestMerged.userId || null,
                                    talent_id: latestMerged.talentId || null
                                }).eq('id', orderId).then(function (uRes) {
                                    throwIfError(uRes);
                                    return ok(null);
                                });
                            });
                    }

                    return sb.from('orders').update({
                        data: merged,
                        user_id: merged.userId || null,
                        talent_id: merged.talentId || null
                    }).eq('id', orderId).then(function (uRes) {
                        throwIfError(uRes);
                        return ok(null);
                    });
                });
            })
            .catch(function (err) {
                if (err && err.success === false) return err;
                throw err;
            });
    }

    function doCompleteOrderWithProof(body) {
        var orderId = String((body && body.orderId) || '');
        if (!orderId) return Promise.resolve(fail('Order tidak ditemukan'));

        var actorId = String((body && body.actorId) || '');
        var fields = Object.assign({}, (body && body.fields) || {});

        return sb.from('orders').select('data').eq('id', orderId).single()
            .then(function (res) {
                throwIfError(res);
                var current = (res.data && res.data.data) || null;
                if (!current) return fail('Order tidak ditemukan');

                var talentId = String(current.talentId || '');
                if (!actorId || !talentId || actorId !== talentId) {
                    return fail('Update progress ditolak: hanya driver aktif yang dapat menyelesaikan order.');
                }

                var prevStatus = String(current.status || '').toLowerCase();
                if (prevStatus === 'cancelled' || prevStatus === 'rejected' || prevStatus === 'rated') {
                    return fail('Update progress ditolak: order sudah berada di status akhir.');
                }

                // Proof completion is allowed from active driver states to avoid deadlock in mobile GPS races.
                var allowed = { accepted: true, on_the_way: true, arrived: true, in_progress: true, completed: true };
                if (!allowed[prevStatus]) {
                    return fail('Update progress ditolak: status saat ini tidak dapat diselesaikan.');
                }

                var merged = Object.assign({}, current, fields);
                merged.status = 'completed';
                merged.completedAt = Number(fields.completedAt || current.completedAt || Date.now());
                if (typeof merged.pendingAdminReview === 'undefined') merged.pendingAdminReview = true;
                if (typeof merged.pendingAdminReviewAt === 'undefined') merged.pendingAdminReviewAt = Date.now();
                if (typeof merged.walletSettled === 'undefined') merged.walletSettled = false;
                if (typeof merged.adminReviewStatus === 'undefined') merged.adminReviewStatus = '';
                if (typeof merged.adminReviewReason === 'undefined') merged.adminReviewReason = '';
                if (typeof merged.adminReviewNote === 'undefined') merged.adminReviewNote = 'Menunggu verifikasi admin';
                if (typeof merged.followUpRequired === 'undefined') merged.followUpRequired = false;
                if (typeof merged.fraudFlag === 'undefined') merged.fraudFlag = false;

                return sb.from('orders').update({
                    data: merged,
                    user_id: merged.userId || null,
                    talent_id: merged.talentId || null
                }).eq('id', orderId).then(function (uRes) {
                    throwIfError(uRes);
                    return ok(null);
                });
            })
            .catch(function (err) {
                if (err && err.success === false) return err;
                throw err;
            });
    }

    function _looksLikeDriverCompletionProof(msgData) {
        if (!msgData) return false;
        var photo = String(msgData.photo || '').trim();
        if (!photo) return false;
        var text = String(msgData.text || '').toLowerCase();
        return text.indexOf('bukti penyelesaian') >= 0 || text.indexOf('completion proof') >= 0;
    }

    function _autoCompleteOrderFromDriverProof(order, msgData) {
        if (!order || !msgData) return Promise.resolve();

        var status = String(order.status || '').toLowerCase();
        if (status === 'completed' || status === 'rated' || status === 'cancelled' || status === 'rejected') {
            return Promise.resolve();
        }

        var talentId = String(order.talentId || '');
        var senderId = String(msgData.senderId || '');
        if (!talentId || !senderId || senderId !== talentId) return Promise.resolve();

        var merged = Object.assign({}, order, {
            status: 'completed',
            completedAt: Number(msgData.createdAt || Date.now()),
            pendingAdminReview: true,
            pendingAdminReviewAt: Date.now(),
            walletSettled: false,
            adminReviewStatus: '',
            adminReviewReason: '',
            adminReviewNote: 'Menunggu verifikasi admin',
            followUpRequired: false,
            fraudFlag: false,
            proofPhotoInChat: true,
            proofPhotoAt: Number(msgData.createdAt || Date.now())
        });

        return sb.from('orders').update({
            data: merged,
            user_id: merged.userId || null,
            talent_id: merged.talentId || null
        }).eq('id', String(order.id || '')).then(function (res) {
            throwIfError(res);
        }).catch(function () {
            // Best-effort only; chat send must stay successful even if completion patch fails.
        });
    }

    function doSendMessage(body) {
        var msgData = {
            orderId: body.orderId,
            senderId: body.senderId,
            recipientId: body.recipientId || '',
            conversationKey: body.conversationKey || '',
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

            if (!_looksLikeDriverCompletionProof(msgData)) {
                return ok(msgData);
            }

            return getOrderDataById(body.orderId)
                .then(function (order) {
                    if (!order) return;
                    return _autoCompleteOrderFromDriverProof(order, msgData);
                })
                .catch(function () {})
                .then(function () { return ok(msgData); });
        });
    }

    function doRateOrder(body) {
        return sb.from('orders').select('data').eq('id', body.orderId).single()
            .then(function (res) {
                throwIfError(res);
                var current = (res.data && res.data.data) || {};

                var orderUserId = String(current.userId || '').trim();
                var orderTalentId = String(current.talentId || '').trim();
                var actorId = String(body.actorId || orderUserId || '').trim();
                if (actorId && orderUserId && actorId !== orderUserId) {
                    return fail('Rating ditolak: hanya user pemesan yang dapat memberi rating');
                }

                var existingTipPaid = !!current.driverTipPaid;
                var existingTipAmount = Math.max(0, Math.round(Number(current.driverTipPaidAmount || current.driverTip || 0) || 0));
                var requestedTip = 0;
                if (body.driverTip !== undefined && body.driverTip !== null) {
                    requestedTip = Math.max(0, Math.round(Number(body.driverTip) || 0));
                } else if (existingTipAmount > 0) {
                    requestedTip = existingTipAmount;
                }
                if (existingTipPaid && requestedTip <= 0) requestedTip = existingTipAmount;

                var tipPromise = Promise.resolve(ok({
                    amount: existingTipAmount,
                    alreadyProcessed: existingTipPaid,
                    paidAt: Number(current.driverTipPaidAt || 0)
                }));

                if (requestedTip > 0) {
                    if (!orderUserId || !orderTalentId) {
                        return fail('Tip driver gagal diproses: data user atau driver order tidak valid');
                    }
                    if (existingTipPaid) {
                        if (existingTipAmount > 0 && requestedTip !== existingTipAmount) {
                            return fail('Tip untuk order ini sudah diproses sebelumnya dan tidak bisa diubah');
                        }
                    } else {
                        tipPromise = doWalletTipDriver({
                            userId: orderUserId,
                            driverId: orderTalentId,
                            orderId: String(body.orderId || ''),
                            amount: requestedTip,
                            actorId: actorId || orderUserId
                        });
                    }
                }

                return tipPromise.then(function (tipRes) {
                    if (!tipRes || tipRes.success === false) {
                        return tipRes || fail('Transfer tip gagal diproses');
                    }

                    var tipData = tipRes.data || {};
                    var settledTipAmount = requestedTip;
                    if (requestedTip > 0 && !existingTipPaid) {
                        var tipFromApi = Math.max(0, Math.round(Number(tipData.amount) || 0));
                        if (tipFromApi > 0) settledTipAmount = tipFromApi;
                    }
                    if (existingTipPaid && settledTipAmount <= 0) settledTipAmount = existingTipAmount;

                    var merged = Object.assign({}, current, {
                        rating: body.rating,
                        review: body.review || '',
                        sellerRating: (body.sellerRating !== undefined && body.sellerRating !== null) ? body.sellerRating : current.sellerRating,
                        sellerReview: (body.sellerReview !== undefined && body.sellerReview !== null) ? body.sellerReview : (current.sellerReview || ''),
                        driverTags: Array.isArray(body.driverTags) ? body.driverTags : (Array.isArray(current.driverTags) ? current.driverTags : []),
                        driverTip: settledTipAmount,
                        sellerTags: Array.isArray(body.sellerTags) ? body.sellerTags : (Array.isArray(current.sellerTags) ? current.sellerTags : []),
                        sellerPhotoReview: (body.sellerPhotoReview !== undefined && body.sellerPhotoReview !== null) ? String(body.sellerPhotoReview || '') : String(current.sellerPhotoReview || ''),
                        sellerItemFeedback: Array.isArray(body.sellerItemFeedback) ? body.sellerItemFeedback : (Array.isArray(current.sellerItemFeedback) ? current.sellerItemFeedback : []),
                        ratedAt: Number(body.ratedAt || Date.now()),
                        status: 'rated'
                    });

                    if (settledTipAmount > 0) {
                        merged.driverTipPaid = true;
                        merged.driverTipPaidAmount = settledTipAmount;
                        if (existingTipPaid) {
                            merged.driverTipPaidAt = Number(current.driverTipPaidAt || Date.now());
                        } else {
                            merged.driverTipPaidAt = Number(tipData.paidAt || Date.now());
                            merged.driverTipFromUserId = String(tipData.userId || orderUserId || '');
                            merged.driverTipToDriverId = String(tipData.driverId || orderTalentId || '');
                            merged.driverTipDebitTxId = String(tipData.debitTransactionId || '');
                            merged.driverTipCreditTxId = String(tipData.creditTransactionId || '');
                            merged.driverTipDebitLedgerId = String(tipData.debitLedgerId || '');
                            merged.driverTipCreditLedgerId = String(tipData.creditLedgerId || '');
                            merged.driverTipUserBalanceAfter = Number(tipData.userBalance || 0);
                            merged.driverTipDriverBalanceAfter = Number(tipData.driverBalance || 0);
                        }
                    }

                    return sb.from('orders').update({
                        data: merged,
                        user_id: merged.userId || null,
                        talent_id: merged.talentId || null
                    }).eq('id', body.orderId)
                        .then(function (uRes) {
                            throwIfError(uRes);
                            return ok({ tipAmount: settledTipAmount, tipProcessed: settledTipAmount > 0, tipAlreadyProcessed: !!(existingTipPaid || tipData.alreadyProcessed) });
                        });
                });
            });
    }

    function doUpdateTalentLocation(body) {
        var lat = Number(body.lat);
        var lng = Number(body.lng);
        if (!_isValidLatLng(lat, lng)) {
            return Promise.resolve(fail('Koordinat driver tidak valid'));
        }

        return getOrderDataById(body.orderId).then(function (order) {
            if (!order) return fail('Order tidak ditemukan');
            var actorId = String(body.actorId || '');
            var talentId = String(order.talentId || '');
            if (!actorId || !talentId || actorId !== talentId) {
                return fail('Update lokasi ditolak: hanya driver aktif order yang boleh update lokasi.');
            }

        // Upsert to locations table (replaces Firebase RTDB)
            return sb.from('locations').upsert({
                order_id: body.orderId,
                lat: lat,
                lng: lng,
                updated_at: Date.now()
            }).then(function (res) {
                throwIfError(res);
                // Also update order document with talentLat/talentLng
                return doUpdateOrder({
                    orderId: body.orderId,
                    actorId: actorId,
                    fields: { talentLat: lat, talentLng: lng, talentLastLocationAt: Date.now() }
                });
            });
        });
    }

    function doUpdateSettings(body) {
        var actorId = String(body && body.actorId || '').trim();
        if (!actorId) return Promise.resolve(fail('Akses ditolak: actorId wajib diisi'));

        return resolveUserRoleById(actorId).then(function (role) {
            if (role !== 'owner' && role !== 'admin') return fail('Akses ditolak: hanya owner/admin yang boleh mengubah pengaturan');

            var incomingSettings = Object.assign({}, body.settings);
            if (role === 'admin') {
                var allowed = { home_promos: true, home_news: true };
                var invalidKey = Object.keys(incomingSettings).find(function (k) { return !allowed[k]; });
                if (invalidKey) return fail('Akses ditolak: admin hanya boleh mengubah Info & Promo');
            }

            var hasPromos = Object.prototype.hasOwnProperty.call(incomingSettings, 'home_promos');
            var hasNews = Object.prototype.hasOwnProperty.call(incomingSettings, 'home_news');
            var baseSettings = Object.assign({}, incomingSettings);
            delete baseSettings.home_promos;
            delete baseSettings.home_news;

            var saveBaseSettingsPromise = Promise.resolve(null);
            if (Object.keys(baseSettings).length) {
                saveBaseSettingsPromise = sb.from('settings').select('data').eq('key', 'config').single()
                    .then(function (res) {
                        var current = {};
                        if (res && res.error && res.error.code !== 'PGRST116') throw new Error(res.error.message || 'Gagal mengambil pengaturan saat ini');
                        if (res && res.data && res.data.data && typeof res.data.data === 'object') {
                            current = Object.assign({}, res.data.data);
                        }
                        return sb.from('settings').upsert({
                            key: 'config',
                            data: Object.assign({}, current, baseSettings)
                        });
                    }).then(function (res) {
                        throwIfError(res);
                        return null;
                    });
            }

            var saveMarketingPromise = Promise.resolve(null);
            if (hasPromos || hasNews) {
                saveMarketingPromise = Promise.resolve()
                    .then(function () {
                        if (!hasPromos) return null;
                        return _syncMarketingType('promo', incomingSettings.home_promos, actorId);
                    })
                    .then(function () {
                        if (!hasNews) return null;
                        return _syncMarketingType('info', incomingSettings.home_news, actorId);
                    })
                    .catch(function (err) {
                        var msg = String((err && err.message) || '');
                        // Fallback for environment where migration SQL has not been executed yet.
                        if (/marketing_contents|PGRST205/i.test(msg)) return null;
                        throw err;
                    });
            }

            return Promise.all([saveBaseSettingsPromise, saveMarketingPromise]).then(function () {
                return ok(null);
            });
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
        return fetch('/api/wallet/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
        })
            .then(function (res) { return res.json(); })
            .then(function (apiRes) {
                if (apiRes && apiRes.success && apiRes.data) {
                    return ok(apiRes.data);
                }
                return fail((apiRes && apiRes.message) || 'Gagal memuat wallet');
            })
            .catch(function () {
                return sb.from('wallets').select('*').eq('user_id', userId).single()
                    .then(function (res) {
                        if (res.error && res.error.code === 'PGRST116') {
                            return ok({ userId: userId, balance: 0 });
                        }
                        throwIfError(res);
                        var w = res.data;
                        return ok({ userId: w.user_id, balance: Number(w.balance) || 0, updatedAt: w.updated_at });
                    })
                    .catch(function () { return ok({ userId: userId, balance: 0, updatedAt: 0 }); });
            });
    }

    function getTransactions(userId) {
        return fetch('/api/wallet/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId, limit: 100 })
        })
            .then(function (res) { return res.json(); })
            .then(function (apiRes) {
                if (apiRes && apiRes.success && Array.isArray(apiRes.data)) {
                    return ok(apiRes.data);
                }
                return fail((apiRes && apiRes.message) || 'Gagal memuat transaksi');
            })
            .catch(function () {
                return sb.from('transactions').select('data')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .then(function (res) {
                        throwIfError(res);
                        return ok(rowsToArr(res.data));
                    })
                    .catch(function () { return ok([]); });
            });
    }

    function getOrderDataById(orderId) {
        return sb.from('orders').select('data').eq('id', orderId).single()
            .then(function (res) {
                throwIfError(res);
                return (res.data && res.data.data) || null;
            });
    }

    function _findOrderTransaction(userId, orderId, txType, expectedAmount) {
        var uid = String(userId || '');
        var oid = String(orderId || '');
        var type = String(txType || '');
        if (!uid || !oid || !type) return Promise.resolve(null);

        return sb.from('transactions').select('id, amount, data, created_at')
            .eq('user_id', uid)
            .eq('type', type)
            .order('created_at', { ascending: false })
            .limit(80)
            .then(function (res) {
                if (res.error || !res.data) return null;
                var expected = Number(expectedAmount);
                var found = (res.data || []).find(function (row) {
                    var data = row && row.data ? row.data : {};
                    if (typeof data === 'string') {
                        try { data = JSON.parse(data); } catch (e) { data = {}; }
                    }
                    var sameOrder = String((data && data.orderId) || '') === oid;
                    if (!sameOrder) return false;
                    if (!isFinite(expected)) return true;
                    return Number(row.amount) === expected;
                });
                return found || null;
            })
            .catch(function () { return null; });
    }

    function resolveUserRoleById(userId) {
        var uid = String(userId || '').trim();
        if (!uid) return Promise.resolve('');
        return sb.from('users').select('role, data').eq('id', uid).single()
            .then(function (res) {
                if (res.error || !res.data) return '';
                var role = String(res.data.role || '').toLowerCase();
                if (role) return role;
                var d = res.data.data;
                if (typeof d === 'string') {
                    try { d = JSON.parse(d); } catch (e) { d = {}; }
                }
                return String((d && d.role) || '').toLowerCase();
            })
            .catch(function () { return ''; });
    }

    function markOrderWalletFlag(orderId, flagFields) {
        return getOrderDataById(orderId)
            .then(function (current) {
                if (!current) return ok(null);
                var merged = Object.assign({}, current, flagFields || {});
                return sb.from('orders').update({
                    data: merged,
                    user_id: merged.userId || null,
                    talent_id: merged.talentId || null
                }).eq('id', orderId).then(function (res) {
                    throwIfError(res);
                    return ok(null);
                });
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

    function doWalletDebitDirect(body) {
        var userId = body.userId;
        var amount = Math.abs(Number(body.amount) || 0);
        var orderId = body.orderId || '';
        var desc = body.description || 'Pembayaran';
        var txType = body.txType || 'payment';
        if (amount <= 0) return Promise.resolve(fail('Nominal debit harus lebih dari 0'));

        var maybeExistingTx = Promise.resolve(null);
        if (orderId) {
            maybeExistingTx = _findOrderTransaction(userId, orderId, txType, -amount);
        }

        return maybeExistingTx.then(function (existingTx) {
            if (existingTx) {
                var existingData = existingTx.data || {};
                if (typeof existingData === 'string') {
                    try { existingData = JSON.parse(existingData); } catch (e) { existingData = {}; }
                }
                return ok({
                    balance: Number(existingData.balanceAfter),
                    alreadyProcessed: true,
                    transactionId: existingTx.id
                });
            }

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
                        type: txType,
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
                        type: txType,
                        amount: -amount,
                        created_at: txData.createdAt,
                        data: txData
                    }).then(function () {
                        return ok({ balance: newBalance });
                    });
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

        if (!orderId) return Promise.resolve(fail('OrderId wajib diisi untuk pembayaran'));

        return fetch('/api/wallet/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                amount: amount,
                orderId: orderId,
                description: desc,
                actorId: body.actorId || userId
            })
        })
            .then(function (res) { return res.json().catch(function () { return {}; }); })
            .then(function (apiRes) {
                if (!apiRes || apiRes.success === false) {
                    return fail((apiRes && apiRes.message) || 'Pembayaran gagal diproses');
                }
                return ok({
                    balance: Number(apiRes.balance) || 0,
                    transactionId: apiRes.transactionId || '',
                    ledgerId: apiRes.ledgerId || '',
                    alreadyProcessed: !!apiRes.alreadyProcessed
                });
            })
            .catch(function () {
                return fail('Pembayaran gagal diproses');
            });
    }

    function doWalletTipDriver(body) {
        var userId = String(body.userId || '').trim();
        var driverId = String(body.driverId || body.talentId || '').trim();
        var orderId = String(body.orderId || '').trim();
        var amount = Math.round(Math.abs(Number(body.amount) || 0));
        if (!userId || !driverId || !orderId || amount <= 0) {
            return Promise.resolve(fail('Tip driver gagal diproses: data tidak valid'));
        }

        return fetch('/api/wallet/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operation: 'tipDriver',
                userId: userId,
                driverId: driverId,
                orderId: orderId,
                amount: amount,
                actorId: body.actorId || userId
            })
        })
            .then(function (res) { return res.json().catch(function () { return {}; }); })
            .then(function (apiRes) {
                if (!apiRes || apiRes.success === false) {
                    return fail((apiRes && apiRes.message) || 'Transfer tip gagal diproses');
                }
                return ok({
                    amount: Number(apiRes.amount) || amount,
                    paidAt: Number(apiRes.paidAt) || Date.now(),
                    userId: apiRes.userId || userId,
                    driverId: apiRes.driverId || driverId,
                    debitTransactionId: apiRes.debitTransactionId || '',
                    creditTransactionId: apiRes.creditTransactionId || '',
                    debitLedgerId: apiRes.debitLedgerId || '',
                    creditLedgerId: apiRes.creditLedgerId || '',
                    userBalance: Number(apiRes.userBalance) || 0,
                    driverBalance: Number(apiRes.driverBalance) || 0,
                    alreadyProcessed: !!apiRes.alreadyProcessed
                });
            })
            .catch(function () {
                return fail('Transfer tip gagal diproses');
            });
    }

    function doWalletCredit(body) {
        var userId = body.userId;
        var amount = Math.abs(Number(body.amount) || 0);
        var orderId = body.orderId || '';
        var type = body.type || 'earning';
        var desc = body.description || 'Pendapatan';

        var maybeExistingTx = Promise.resolve(null);
        if (orderId) {
            maybeExistingTx = _findOrderTransaction(userId, orderId, type, amount);
        }

        return maybeExistingTx.then(function (existingTx) {
            if (existingTx) {
                var existingData = existingTx.data || {};
                if (typeof existingData === 'string') {
                    try { existingData = JSON.parse(existingData); } catch (e) { existingData = {}; }
                }
                return ok({
                    balance: Number(existingData.balanceAfter),
                    alreadyProcessed: true,
                    transactionId: existingTx.id
                });
            }

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
        });
    }

    function doRefundOrderPayment(body) {
        var orderId = body.orderId || '';
        if (!orderId) return Promise.resolve(fail('OrderId wajib diisi'));

        return fetch('/api/wallet/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operation: 'refundOrderPayment',
                orderId: orderId,
                actorId: body.actorId || body.userId || '',
                description: body.description || ''
            })
        })
            .then(function (res) { return res.json().catch(function () { return {}; }); })
            .then(function (apiRes) {
                if (!apiRes || apiRes.success === false) {
                    return fail((apiRes && apiRes.message) || 'Refund gagal diproses');
                }
                return ok(apiRes);
            })
            .catch(function () {
                return fail('Refund gagal diproses');
            });
    }

    function resolveOwnerUserId() {
        return sb.from('users').select('id, role, data')
            .then(function (res) {
                if (res.error || !res.data) return '';

                var ownerRow = null;

                ownerRow = res.data.find(function (row) {
                    return String(row.role || '').toLowerCase() === 'owner';
                }) || null;

                if (!ownerRow) {
                    ownerRow = res.data.find(function (row) {
                        var d = row.data;
                        if (typeof d === 'string') {
                            try { d = JSON.parse(d); } catch (e) { d = {}; }
                        }
                        return d && String(d.role || '').toLowerCase() === 'owner';
                    }) || null;
                }

                return ownerRow && ownerRow.id ? ownerRow.id : '';
            })
            .catch(function () { return ''; });
    }

    function doWalletCompleteOrder(body) {
        var orderId = body.orderId;
        if (!orderId) return Promise.resolve(fail('OrderId wajib diisi'));

        return fetch('/api/wallet/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operation: 'completeOrder',
                orderId: orderId,
                actorId: body.actorId || ''
            })
        })
            .then(function (res) { return res.json().catch(function () { return {}; }); })
            .then(function (apiRes) {
                if (!apiRes || apiRes.success === false) {
                    return fail((apiRes && apiRes.message) || 'Payout gagal diproses');
                }
                return ok(apiRes);
            })
            .catch(function () {
                return fail('Payout gagal diproses');
            });
    }

    function doWalletCompleteOrderCOD(body) {
        var orderId = body.orderId;
        if (!orderId) return Promise.resolve(fail('OrderId wajib diisi'));

        return fetch('/api/wallet/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operation: 'completeOrderCOD',
                orderId: orderId,
                actorId: body.actorId || ''
            })
        })
            .then(function (res) { return res.json().catch(function () { return {}; }); })
            .then(function (apiRes) {
                if (!apiRes || apiRes.success === false) {
                    return fail((apiRes && apiRes.message) || 'Payout COD gagal diproses');
                }
                return ok(apiRes);
            })
            .catch(function () {
                return fail('Payout COD gagal diproses');
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

        if (!isFinite(userLat) || !isFinite(userLng)) {
            return ok([]);
        }

        // Get all users + skills + active orders (to prevent assigning busy drivers)
        return Promise.all([
            sb.from('users').select('id, role, nama, data'),
            sb.from('skills').select('user_id, data'),
            sb.from('orders').select('talent_id, data')
        ]).then(function (results) {
            var usersRes = results[0];
            var skillsRes = results[1];
            var ordersRes = results[2];
            throwIfError(usersRes);
            throwIfError(skillsRes);
            throwIfError(ordersRes);

            var skillMap = {};
            (skillsRes.data || []).forEach(function (row) {
                skillMap[row.user_id] = (row.data && row.data.skills) || [];
            });

            var activeStatuses = { searching: true, pending: true, accepted: true, on_the_way: true, arrived: true, in_progress: true };
            var busyTalentMap = {};
            (ordersRes.data || []).forEach(function (row) {
                var d = row.data || {};
                if (typeof d === 'string') {
                    try { d = JSON.parse(d); } catch (e) { d = {}; }
                }
                var tId = row.talent_id || d.talentId || '';
                var st = d.status || '';
                if (tId && activeStatuses[st]) busyTalentMap[tId] = true;
            });

            var talents = [];
            (usersRes.data || []).forEach(function (row) {
                var raw = row.data || {};
                if (typeof raw === 'string') {
                    try { raw = JSON.parse(raw); } catch (e) { raw = {}; }
                }

                // Some user records (especially from OTP flow) keep key fields in table columns,
                // while some keep them in data JSON. Normalize first before filtering.
                var u = {
                    id: row.id || raw.id || '',
                    role: row.role || raw.role || '',
                    name: row.nama || raw.name || raw.nama || '',
                    lat: (raw.lat !== undefined && raw.lat !== null) ? raw.lat : row.lat,
                    lng: (raw.lng !== undefined && raw.lng !== null) ? raw.lng : row.lng,
                    isOnline: (raw.isOnline !== undefined) ? raw.isOnline : row.isOnline
                };

                if (!u || u.role !== 'talent') return;
                if (u.id === excludeUserId) return;
                if (excludeTalentIds.indexOf(u.id) >= 0) return;
                if (busyTalentMap[u.id]) return;
                // Check online status — consider talent online if isOnline is true
                // or if isOnline is not explicitly set to false (for backward compatibility)
                if (u.isOnline === false) return;

                var tLat = Number(u.lat);
                var tLng = Number(u.lng);
                if (!isFinite(tLat) || !isFinite(tLng)) return;
                if (tLat === 0 && tLng === 0) return;

                // Check if talent has the required skill OR any delivery-related skill
                var tSkills = skillMap[u.id] || [];
                var hasSkill = tSkills.some(function (s) {
                    return s.type === skillType || s.type === 'js_antar' || s.type === 'driver' || s.type === 'delivery';
                });
                // If talent has no skills registered at all, still allow them (they just need to be online)
                if (tSkills.length > 0 && !hasSkill) return;

                // Calculate distance (Haversine)
                var dist = haversine(userLat, userLng, tLat, tLng);
                talents.push({ id: u.id, name: u.name, lat: tLat, lng: tLng, distance: dist });
            });

            // Sort by distance and return only the nearest driver
            // Only the closest available driver should receive the order
            talents.sort(function (a, b) { return a.distance - b.distance; });

            // Return at most 1 — the nearest available driver
            return ok(talents.length > 0 ? [talents[0]] : []);
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

    var STAFF_FILES_BUCKET = 'staff-files';

    function extractStaffFilePath(value) {
        if (!value) return null;
        var raw = String(value).trim();
        if (!raw) return null;

        var noQuery = raw.split('?')[0];
        if (!noQuery) return null;

        if (noQuery.indexOf('avatars/') === 0 || noQuery.indexOf('ktp/') === 0) {
            return decodeURIComponent(noQuery);
        }

        var markers = [
            '/storage/v1/object/public/' + STAFF_FILES_BUCKET + '/',
            '/storage/v1/object/sign/' + STAFF_FILES_BUCKET + '/',
            '/object/public/' + STAFF_FILES_BUCKET + '/',
            '/object/sign/' + STAFF_FILES_BUCKET + '/'
        ];

        for (var i = 0; i < markers.length; i++) {
            var marker = markers[i];
            var idx = noQuery.indexOf(marker);
            if (idx !== -1) {
                return decodeURIComponent(noQuery.slice(idx + marker.length));
            }
        }

        return null;
    }

    function removeStaffFiles(paths) {
        var uniquePaths = [];
        (paths || []).forEach(function (p) {
            if (!p) return;
            if (uniquePaths.indexOf(p) === -1) uniquePaths.push(p);
        });

        if (uniquePaths.length === 0) return Promise.resolve();

        return sb.storage.from(STAFF_FILES_BUCKET).remove(uniquePaths)
            .then(function (res) {
                if (res && res.error) throw new Error(res.error.message || 'Gagal hapus file staff');
                return null;
            });
    }

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

        if (Object.prototype.hasOwnProperty.call(data, 'foto_url') && data.foto_url === '') data.foto_url = null;
        if (Object.prototype.hasOwnProperty.call(data, 'ktp_url') && data.ktp_url === '') data.ktp_url = null;

        data.updated_at = new Date().toISOString();

        return sb.from('staff').select('foto_url, ktp_url').eq('id', id).limit(1)
            .then(function (currentRes) {
                throwIfError(currentRes);
                var current = ((currentRes.data || [])[0]) || {};
                var cleanupPaths = [];

                if (Object.prototype.hasOwnProperty.call(data, 'foto_url')) {
                    var oldFotoPath = extractStaffFilePath(current.foto_url);
                    var newFotoPath = extractStaffFilePath(data.foto_url);
                    if (!data.foto_url && oldFotoPath) cleanupPaths.push(oldFotoPath);
                    else if (oldFotoPath && newFotoPath && oldFotoPath !== newFotoPath) cleanupPaths.push(oldFotoPath);
                }

                if (Object.prototype.hasOwnProperty.call(data, 'ktp_url')) {
                    var oldKtpPath = extractStaffFilePath(current.ktp_url);
                    var newKtpPath = extractStaffFilePath(data.ktp_url);
                    if (!data.ktp_url && oldKtpPath) cleanupPaths.push(oldKtpPath);
                    else if (oldKtpPath && newKtpPath && oldKtpPath !== newKtpPath) cleanupPaths.push(oldKtpPath);
                }

                return removeStaffFiles(cleanupPaths)
                    .then(function () {
                        return sb.from('staff').update(data).eq('id', id);
                    })
                    .then(function (updateRes) {
                        throwIfError(updateRes);
                        return ok(data);
                    });
            });
    }

    function doDeleteStaff(body) {
        return sb.from('staff').select('foto_url, ktp_url').eq('id', body.id).limit(1)
            .then(function (existingRes) {
                throwIfError(existingRes);
                var existing = ((existingRes.data || [])[0]) || {};
                var cleanupPaths = [
                    extractStaffFilePath(existing.foto_url),
                    extractStaffFilePath(existing.ktp_url)
                ];

                return removeStaffFiles(cleanupPaths)
                    .then(function () {
                        return sb.from('staff').delete().eq('id', body.id);
                    })
                    .then(function (deleteRes) {
                        throwIfError(deleteRes);
                        return ok(null);
                    });
            });
    }

    function uploadStaffFile(path, file) {
        var safePath = String(path || '').replace(/^\/+/, '');
        if (!safePath) return Promise.resolve(fail('Path upload staff tidak valid'));

        return sb.storage.from(STAFF_FILES_BUCKET).upload(safePath, file, { upsert: true, cacheControl: '0' })
            .then(function (res) {
                if (res.error) throw res.error;
                var publicUrl = sb.storage.from(STAFF_FILES_BUCKET).getPublicUrl(safePath);
                var baseUrl = (publicUrl && publicUrl.data && publicUrl.data.publicUrl) || '';
                var versionedUrl = baseUrl
                    ? (baseUrl + (baseUrl.indexOf('?') === -1 ? '?v=' : '&v=') + Date.now())
                    : baseUrl;
                return ok(versionedUrl);
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
            case 'getSellerRating': return getSellerRating(p.sellerId);
            case 'getSettings': return getSettings();
            case 'getAccountDeletionCooldown': return getAccountDeletionCooldown(p.phone);
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
            case 'delete': return doDeleteUser(body);
            case 'updateLocation': return doUpdateLocation(body);
            case 'updateSkills': return doUpdateSkills(body);
            case 'createOrder': return doCreateOrder(body);
            case 'updateOrder': return doUpdateOrder(body);
            case 'completeOrderWithProof': return doCompleteOrderWithProof(body);
            case 'sendMessage': return doSendMessage(body);
            case 'rateOrder': return doRateOrder(body);
            case 'updateTalentLocation': return doUpdateTalentLocation(body);
            case 'updateSettings': return doUpdateSettings(body);
            case 'createStore': return doCreateStore(body);
            case 'updateStore': return doUpdateStore(body);
            case 'createProduct': return doCreateProduct(body);
            case 'updateProduct': return doUpdateProduct(body);
            case 'deleteProduct': return doDeleteProduct(body);
            case 'topUp': return Promise.resolve(fail('Aksi top up langsung dinonaktifkan. Gunakan endpoint /api/xendit/create-invoice'));
            case 'withdraw': return Promise.resolve(fail('Aksi withdraw langsung dinonaktifkan. Gunakan endpoint /api/xendit/withdraw'));
            case 'walletPay': return doWalletPay(body);
            case 'walletTipDriver': return doWalletTipDriver(body);
            case 'walletCredit': return Promise.resolve(fail('Aksi walletCredit langsung dinonaktifkan'));
            case 'refundOrderPayment': return doRefundOrderPayment(body);
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

    function onAllOrders(callback) {
        function loadAll() {
            sb.from('orders').select('data')
                .then(function (res) {
                    if (!res.error && res.data) {
                        callback({ success: true, data: rowsToArr(res.data) });
                    }
                });
        }

        loadAll();

        var channel = sb.channel('orders-all-' + generateId())
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'orders'
            }, function () { loadAll(); })
            .subscribe();

        return function () { sb.removeChannel(channel); };
    }

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

        onAllOrders: onAllOrders,
        onOrdersForUser: onOrdersForUser,
        onOrder: onOrder,
        onMessages: onMessages,
        onTalentLocation: onTalentLocation,

        onWallet: function (userId, callback) {
            // Initial load
            getWallet(userId).then(function (res) {
                if (res.success) callback(res.data);
            });
            // Under strict RLS wallet table is not readable by client realtime; poll via trusted API.
            var timer = setInterval(function () {
                getWallet(userId).then(function (res) {
                    if (res.success) callback(res.data);
                });
            }, 8000);
            return function () {
                clearInterval(timer);
            };
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
