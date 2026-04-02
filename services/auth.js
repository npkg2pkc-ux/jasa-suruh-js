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
        var cleaned = String(phone || '').replace(/\D/g, '');
        if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
        else if (cleaned.startsWith('8')) cleaned = '62' + cleaned;
        return cleaned;
    }

    function isValidIndonesianMobilePhone(phone) {
        var formatted = formatPhone(phone || '');
        return /^628\d{8,12}$/.test(formatted);
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

    function parseApiJson(response) {
        if (!response) return Promise.reject(new Error('Tidak ada respons server'));
        return response.text().then(function (raw) {
            var text = String(raw || '').trim();
            if (!text) {
                throw new Error('Server mengembalikan respons kosong (' + response.status + ')');
            }
            var data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                throw new Error('Respons server tidak valid (' + response.status + ')');
            }
            if (!response.ok) {
                throw new Error((data && data.message) || ('Request gagal (' + response.status + ')'));
            }
            return data;
        });
    }

    function checkDeletionCooldown(phone) {
        var formatted = formatPhone(phone || '');
        if (!isValidIndonesianMobilePhone(formatted)) {
            return Promise.resolve({ blocked: false, remainingMs: 0, blockedUntil: 0 });
        }

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
    function sendOTP(phone, captchaToken) {
        var formatted = formatPhone(phone);
        var captcha = String(captchaToken || '').trim();

        if (!isValidIndonesianMobilePhone(formatted)) {
            return Promise.reject(new Error('Hanya nomor Indonesia (+62 8...) yang diizinkan'));
        }

        if (!captcha) {
            return Promise.reject(new Error('Selesaikan CAPTCHA keamanan terlebih dahulu'));
        }

        return checkDeletionCooldown(formatted)
            .then(function (cooldown) {
                if (cooldown && cooldown.blocked) {
                    throw createCooldownError(cooldown);
                }

                return fetch('/api/otp/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: formatted, captchaToken: captcha })
                });
            })
            .then(parseApiJson)
            .then(function (result) {
                if (!result.success) throw new Error(result.message || 'Gagal mengirim OTP');
                return { success: true, phone: formatted };
            });
    }

    // Verify OTP via API
    function verifyOTP(phone, otp) {
        var formatted = formatPhone(phone);
        if (!isValidIndonesianMobilePhone(formatted)) {
            return Promise.reject(new Error('Nomor HP tidak valid'));
        }
        return fetch('/api/otp/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: formatted, code: otp })
        })
        .then(parseApiJson)
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
        if (!isValidIndonesianMobilePhone(normalizedPhone)) {
            return Promise.reject(new Error('Nomor HP harus Indonesia (+62 8...)'));
        }
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
                deviceId: typeof getOrGenerateDeviceId === 'function' ? getOrGenerateDeviceId() : '',
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
        isValidIndonesianMobilePhone: isValidIndonesianMobilePhone,
        sendOTP: sendOTP,
        verifyOTP: verifyOTP,
        createProfile: createProfile,
        uploadPhoto: uploadPhoto
    };
})();

window.AuthService = AuthService;
