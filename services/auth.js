/* ========================================
   JASA SURUH - Auth Service (Supabase)
   Handles OTP authentication & user profile
   ======================================== */
'use strict';

var AuthService = (function () {
    function _getSb() {
        if (typeof window.FB !== 'undefined' && window.FB._sb) return window.FB._sb;
        if (typeof window._supabaseClient !== 'undefined') return window._supabaseClient;
        return null;
    }

    // Format phone: 08xx → +628xx
    function formatPhone(phone) {
        var cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
        if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
        return '+' + cleaned;
    }

    // Send OTP via Supabase Auth
    function sendOTP(phone) {
        var sb = _getSb();
        if (!sb) return Promise.reject(new Error('Supabase belum siap'));

        var formatted = formatPhone(phone);
        return sb.auth.signInWithOtp({ phone: formatted })
            .then(function (result) {
                if (result.error) throw result.error;
                return { success: true, phone: formatted };
            });
    }

    // Verify OTP
    function verifyOTP(phone, otp) {
        var sb = _getSb();
        if (!sb) return Promise.reject(new Error('Supabase belum siap'));

        var formatted = formatPhone(phone);
        return sb.auth.verifyOtp({
            phone: formatted,
            token: otp,
            type: 'sms'
        }).then(function (result) {
            if (result.error) throw result.error;
            return {
                success: true,
                user: result.data.user,
                session: result.data.session
            };
        });
    }

    // Create user profile in users table
    function createProfile(authUser, profileData) {
        var sb = _getSb();
        if (!sb) return Promise.reject(new Error('Supabase belum siap'));

        var userData = {
            id: authUser.id,
            role: profileData.role,
            nama: profileData.nama,
            no_hp: authUser.phone || profileData.no_hp,
            email: profileData.email || null,
            foto_url: profileData.foto_url || null,
            created_at: new Date().toISOString()
        };

        return sb.from('users').upsert(userData, { onConflict: 'id' })
            .then(function (result) {
                if (result.error) throw result.error;
                return { success: true, data: userData };
            });
    }

    // Upload photo to Supabase Storage
    function uploadPhoto(authUserId, file) {
        var sb = _getSb();
        if (!sb) return Promise.reject(new Error('Supabase belum siap'));

        var ext = file.name.split('.').pop() || 'jpg';
        var path = 'avatars/' + authUserId + '.' + ext;

        return sb.storage.from('photos').upload(path, file, {
            cacheControl: '3600',
            upsert: true
        }).then(function (result) {
            if (result.error) throw result.error;
            var urlResult = sb.storage.from('photos').getPublicUrl(path);
            return { success: true, url: urlResult.data.publicUrl };
        });
    }

    // Get current auth user
    function getCurrentUser() {
        var sb = _getSb();
        if (!sb) return Promise.resolve(null);
        return sb.auth.getUser().then(function (r) {
            return r.data ? r.data.user : null;
        }).catch(function () { return null; });
    }

    return {
        formatPhone: formatPhone,
        sendOTP: sendOTP,
        verifyOTP: verifyOTP,
        createProfile: createProfile,
        uploadPhoto: uploadPhoto,
        getCurrentUser: getCurrentUser
    };
})();

window.AuthService = AuthService;
