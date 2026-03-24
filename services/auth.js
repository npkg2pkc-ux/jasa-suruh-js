/* ========================================
   JASA SURUH - Auth Service (WhatsApp OTP)
   Handles OTP via WhatsApp & user profile
   ======================================== */
'use strict';

var AuthService = (function () {
    function _getSb() {
        if (typeof window.FB !== 'undefined' && window.FB._sb) return window.FB._sb;
        if (typeof window._supabaseClient !== 'undefined') return window._supabaseClient;
        return null;
    }

    // Format phone: 08xx → 628xx (tanpa +)
    function formatPhone(phone) {
        var cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
        if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
        return cleaned;
    }

    // Format display: 628xx → 08xx
    function formatPhoneDisplay(phone) {
        var cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('62')) cleaned = '0' + cleaned.slice(2);
        return cleaned;
    }

    function formatCooldownMessage(info) {
        var remainingMs = Number((info && info.remainingMs) || 0);
        var totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        return 'Akun ini baru saja dihapus. Coba daftar lagi dalam ' + hours + ' jam ' + minutes + ' menit.';
    }

    function createCooldownError(info) {
        var err = new Error(formatCooldownMessage(info));
        err.code = 'ACCOUNT_COOLDOWN';
        err.cooldownInfo = info || {};
        return err;
    }

    function checkDeletionCooldown(phone) {
        var formatted = formatPhone(phone || '');

        if (typeof window.FB !== 'undefined' && window.FB.isReady && window.FB.isReady()) {
            return window.FB.get('getAccountDeletionCooldown', { phone: formatted })
                .then(function (r) { return r.json(); })
                .then(function (res) {
                    if (res && res.success && res.data) return res.data;
                    return { blocked: false, remainingMs: 0, blockedUntil: 0 };
                })
                .catch(function () {
                    if (typeof getAccountDeletionCooldownInfo === 'function') {
                        return getAccountDeletionCooldownInfo(formatted);
                    }
                    return { blocked: false, remainingMs: 0, blockedUntil: 0 };
                });
        }

        if (typeof getAccountDeletionCooldownInfo === 'function') {
            return Promise.resolve(getAccountDeletionCooldownInfo(formatted));
        }

        return Promise.resolve({ blocked: false, remainingMs: 0, blockedUntil: 0 });
    }

    // Send OTP via WhatsApp API
    function sendOTP(phone) {
        var formatted = formatPhone(phone);
        return checkDeletionCooldown(formatted)
            .then(function (cooldown) {
                if (cooldown && cooldown.blocked) {
                    throw createCooldownError(cooldown);
                }

                return fetch('/api/otp/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: formatted })
                });
            })
            .then(function (r) { return r.json(); })
            .then(function (result) {
                if (!result.success) throw new Error(result.message || 'Gagal mengirim OTP');
                return { success: true, phone: formatted };
            });
    }

    // Verify OTP via API
    function verifyOTP(phone, otp) {
        var formatted = formatPhone(phone);
        return fetch('/api/otp/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: formatted, code: otp })
        })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            if (!result.success) throw new Error(result.message || 'Kode OTP salah');
            return {
                success: true,
                user: { id: result.data.token, phone: formatted },
                session: result.data
            };
        });
    }

    // Create user profile in users table
    function createProfile(verifiedData, profileData) {
        var sb = _getSb();
        if (!sb) return Promise.reject(new Error('Supabase belum siap'));

        var userId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        var normalizedPhone = formatPhone(profileData.no_hp || profileData.phone || '');
        var userData = {
            id: userId,
            role: profileData.role,
            nama: profileData.nama,
            no_hp: normalizedPhone,
            email: profileData.email || null,
            foto_url: profileData.foto_url || null,
            data: {
                name: profileData.nama,
                phone: normalizedPhone,
                role: profileData.role,
                createdAt: Date.now()
            }
        };

        return checkDeletionCooldown(normalizedPhone)
            .then(function (cooldown) {
                if (cooldown && cooldown.blocked) {
                    throw createCooldownError(cooldown);
                }

                if (typeof backendPost === 'function' && typeof isBackendConnected === 'function' && isBackendConnected()) {
                    return backendPost(Object.assign({ action: 'register' }, userData))
                        .then(function (res) {
                            if (!res || !res.success) {
                                throw new Error((res && res.message) || 'Gagal membuat akun');
                            }
                            return { success: true, data: res.data || userData };
                        });
                }

                return sb.from('users').insert(userData)
                    .then(function (result) {
                        if (result.error) throw result.error;
                        return { success: true, data: userData };
                    });
            });
    }

    // Upload photo to Supabase Storage
    function uploadPhoto(userId, file) {
        var sb = _getSb();
        if (!sb) return Promise.reject(new Error('Supabase belum siap'));

        var ext = file.name.split('.').pop() || 'jpg';
        var path = userId + '.' + ext;

        return sb.storage.from('avatars').upload(path, file, {
            cacheControl: '3600',
            upsert: true
        }).then(function (result) {
            if (result.error) throw result.error;
            var urlResult = sb.storage.from('avatars').getPublicUrl(path);
            return { success: true, url: urlResult.data.publicUrl };
        });
    }

    return {
        formatPhone: formatPhone,
        formatPhoneDisplay: formatPhoneDisplay,
        checkDeletionCooldown: checkDeletionCooldown,
        formatCooldownMessage: formatCooldownMessage,
        createCooldownError: createCooldownError,
        sendOTP: sendOTP,
        verifyOTP: verifyOTP,
        createProfile: createProfile,
        uploadPhoto: uploadPhoto
    };
})();

window.AuthService = AuthService;
