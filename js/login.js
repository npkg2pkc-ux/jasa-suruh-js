/* ========================================
   JASA SURUH - Login OTP (Gojek Style)
   Unified login/register via WhatsApp OTP
   ======================================== */
'use strict';

var LoginPage = (function () {
    var _initialized = false;
    var _phone = '';          // formatted: 628xxx
    var _phoneRaw = '';       // display: 8xxx (without 0 or 62)
    var _otpTimer = null;
    var _otpSeconds = 60;

    var LAST_PHONE_KEY = 'js_last_phone';

    function $(id) { return document.getElementById(id); }

    // ─── Init (call once) ───
    function init() {
        if (_initialized) return;
        _initialized = true;

        _setupPhoneStep();
        _setupOTPStep();
        _setupLegalLinks();

        // Restore last phone
        var lastPhone = localStorage.getItem(LAST_PHONE_KEY);
        if (lastPhone) {
            $('loginPhoneInput').value = lastPhone;
            _validatePhone();
        }
    }

    // ═══════════════════════════════════
    //  STEP 1: Phone Input
    // ═══════════════════════════════════
    function _setupPhoneStep() {
        var input = $('loginPhoneInput');
        var btn = $('loginBtnSendOTP');

        input.addEventListener('input', function () {
            // Strip non-digits and leading 0/62
            var v = this.value.replace(/\D/g, '');
            if (v.startsWith('62')) v = v.slice(2);
            if (v.startsWith('0')) v = v.slice(1);
            this.value = v;
            _phoneRaw = v;
            _validatePhone();
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !btn.disabled) _sendOTP();
        });

        btn.addEventListener('click', _sendOTP);
    }

    function _validatePhone() {
        var valid = _phoneRaw.length >= 9 && _phoneRaw.length <= 13;
        $('loginBtnSendOTP').disabled = !valid;
        return valid;
    }

    function _sendOTP() {
        if (!_validatePhone()) return;

        _phone = '62' + _phoneRaw;
        var displayPhone = '0' + _phoneRaw;

        var btn = $('loginBtnSendOTP');
        var text = $('loginBtnSendText');
        var spinner = $('loginBtnSendSpinner');
        var error = $('loginPhoneError');

        btn.disabled = true;
        text.textContent = 'Mengirim...';
        spinner.classList.remove('hidden');
        error.classList.add('hidden');

        // Save for next time
        localStorage.setItem(LAST_PHONE_KEY, _phoneRaw);

        fetch('/api/otp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: _phone })
        })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            btn.disabled = false;
            text.textContent = 'Lanjutkan';
            spinner.classList.add('hidden');

            if (!result.success) {
                error.textContent = result.message || 'Gagal mengirim OTP';
                error.classList.remove('hidden');
                return;
            }

            // Show OTP step
            _showOTPStep(displayPhone);
        })
        .catch(function (err) {
            btn.disabled = false;
            text.textContent = 'Lanjutkan';
            spinner.classList.add('hidden');
            error.textContent = 'Koneksi gagal. Coba lagi.';
            error.classList.remove('hidden');
        });
    }

    // ═══════════════════════════════════
    //  LEGAL LINKS (Terms & Privacy)
    // ═══════════════════════════════════
    function _setupLegalLinks() {
        function openLegal(pageId) {
            var page = $(pageId);
            if (page) { page.classList.remove('hidden'); page.scrollTop = 0; }
        }
        function closeLegal(pageId) {
            var page = $(pageId);
            if (page) page.classList.add('hidden');
        }

        var linkTerms = $('linkTerms');
        var linkPrivacy = $('linkPrivacy');
        if (linkTerms) linkTerms.addEventListener('click', function () { openLegal('termsPage'); });
        if (linkPrivacy) linkPrivacy.addEventListener('click', function () { openLegal('privacyPage'); });

        var termsBack = $('termsBackBtn');
        var privacyBack = $('privacyBackBtn');
        if (termsBack) termsBack.addEventListener('click', function () { closeLegal('termsPage'); });
        if (privacyBack) privacyBack.addEventListener('click', function () { closeLegal('privacyPage'); });
    }

    // ═══════════════════════════════════
    //  STEP 2: OTP Verification
    // ═══════════════════════════════════
    function _setupOTPStep() {
        // OTP digit inputs
        for (var i = 0; i < 6; i++) {
            (function (idx) {
                var input = $('loginOtp' + idx);
                input.addEventListener('input', function () {
                    var v = this.value.replace(/\D/g, '');
                    this.value = v.slice(0, 1);
                    if (v && idx < 5) $('loginOtp' + (idx + 1)).focus();
                    _updateOTPFilled();
                    _checkAutoSubmit();
                });
                input.addEventListener('keydown', function (e) {
                    if (e.key === 'Backspace' && !this.value && idx > 0) {
                        $('loginOtp' + (idx - 1)).focus();
                    }
                });
                input.addEventListener('focus', function () { this.select(); });
            })(i);
        }

        // Paste support
        $('loginOtp0').addEventListener('paste', function (e) {
            e.preventDefault();
            var text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
            for (var j = 0; j < 6 && j < text.length; j++) {
                $('loginOtp' + j).value = text[j];
            }
            var focusIdx = Math.min(text.length, 5);
            $('loginOtp' + focusIdx).focus();
            _updateOTPFilled();
            _checkAutoSubmit();
        });

        // Buttons
        $('loginBtnVerify').addEventListener('click', _verifyOTP);
        $('loginBtnBackToPhone').addEventListener('click', _goBackToPhone);
        $('loginBtnChangePhone').addEventListener('click', _goBackToPhone);
        $('loginBtnResend').addEventListener('click', function () {
            _sendOTP();
        });
    }

    function _showOTPStep(displayPhone) {
        $('loginStep1').classList.add('hidden');
        $('loginStep2').classList.remove('hidden');

        // Format display: 0812 3456 7890
        var formatted = displayPhone.replace(/(\d{4})(\d{4})(\d+)/, '$1 $2 $3');
        $('loginOTPPhoneDisplay').textContent = '+62 ' + formatted.slice(1);

        // Clear OTP inputs
        for (var i = 0; i < 6; i++) {
            $('loginOtp' + i).value = '';
            $('loginOtp' + i).classList.remove('filled', 'error');
        }
        $('loginOTPError').classList.add('hidden');
        $('loginBtnVerify').disabled = true;

        // Focus first
        setTimeout(function () { $('loginOtp0').focus(); }, 150);

        // Start timer
        _startResendTimer();
    }

    function _goBackToPhone() {
        _stopResendTimer();
        $('loginStep2').classList.add('hidden');
        $('loginStep1').classList.remove('hidden');
        $('loginPhoneInput').focus();
    }

    function _updateOTPFilled() {
        for (var i = 0; i < 6; i++) {
            var d = $('loginOtp' + i);
            d.classList.toggle('filled', !!d.value);
            d.classList.remove('error');
        }
    }

    function _getOTPValue() {
        var code = '';
        for (var i = 0; i < 6; i++) code += $('loginOtp' + i).value;
        return code;
    }

    function _checkAutoSubmit() {
        var code = _getOTPValue();
        $('loginBtnVerify').disabled = code.length < 6;
        if (code.length === 6) {
            // Auto submit after short delay
            setTimeout(function () {
                if (_getOTPValue().length === 6) _verifyOTP();
            }, 200);
        }
    }

    function _verifyOTP() {
        var code = _getOTPValue();
        if (code.length < 6) return;

        var btn = $('loginBtnVerify');
        var text = $('loginBtnVerifyText');
        var spinner = $('loginBtnVerifySpinner');
        var error = $('loginOTPError');

        btn.disabled = true;
        text.textContent = 'Memverifikasi...';
        spinner.classList.remove('hidden');
        error.classList.add('hidden');

        fetch('/api/otp/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: _phone, code: code })
        })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            btn.disabled = false;
            text.textContent = 'Verifikasi';
            spinner.classList.add('hidden');

            if (!result.success) {
                error.textContent = result.message || 'Kode OTP salah';
                error.classList.remove('hidden');
                _shakeOTPInputs();
                return;
            }

            _stopResendTimer();

            // OTP verified — check if user exists in DB
            _checkUserExists();
        })
        .catch(function () {
            btn.disabled = false;
            text.textContent = 'Verifikasi';
            spinner.classList.add('hidden');
            error.textContent = 'Koneksi gagal. Coba lagi.';
            error.classList.remove('hidden');
        });
    }

    function _shakeOTPInputs() {
        for (var i = 0; i < 6; i++) {
            $('loginOtp' + i).classList.add('error');
        }
        // Clear after animation
        setTimeout(function () {
            for (var i = 0; i < 6; i++) {
                $('loginOtp' + i).value = '';
                $('loginOtp' + i).classList.remove('error', 'filled');
            }
            $('loginOtp0').focus();
            $('loginBtnVerify').disabled = true;
        }, 500);
    }

    // ═══════════════════════════════════
    //  POST-OTP: Check user existence
    // ═══════════════════════════════════
    function _checkUserExists() {
        var sb = _getSb();
        if (!sb) {
            // Fallback: check localStorage
            _checkUserLocal();
            return;
        }

        // Try 62xxx format first (primary), then 08xxx fallback
        var phone62 = _phone; // already '62' + _phoneRaw
        var phone08 = '0' + _phoneRaw;

        sb.from('users')
            .select('id, nama, no_hp, email, role, foto_url, data')
            .or('no_hp.eq.' + phone62 + ',no_hp.eq.' + phone08)
            .limit(1)
            .then(function (result) {
                if (result.error || !result.data || result.data.length === 0) {
                    // New user → redirect to register (prefill phone)
                    _redirectToRegister();
                    return;
                }

                // Existing user → login
                var user = result.data[0];
                _loginExistingUser(user);
            })
            .catch(function () {
                _checkUserLocal();
            });
    }

    function _checkUserLocal() {
        var users = typeof getUsers === 'function' ? getUsers() : [];
        var found = users.find(function (u) {
            var uPhone = (u.phone || u.no_hp || '').replace(/\D/g, '');
            return uPhone === _phone || uPhone === '0' + _phoneRaw;
        });

        if (found) {
            _loginWithSession(found);
        } else {
            _redirectToRegister();
        }
    }

    function _loginExistingUser(dbUser) {
        // Build session from Supabase data
        var parsed = {};
        if (dbUser.data) {
            try { parsed = typeof dbUser.data === 'string' ? JSON.parse(dbUser.data) : dbUser.data; }
            catch (e) { parsed = {}; }
        }

        // Normalize phone to 62xxx if stored as 08xxx
        var storedPhone = dbUser.no_hp || '';
        var normalizedPhone = _phone; // 62xxx format
        if (storedPhone !== normalizedPhone && _getSb()) {
            _getSb().from('users').update({ no_hp: normalizedPhone }).eq('id', dbUser.id).then(function () {});
        }

        var sessionData = {
            id: dbUser.id,
            name: dbUser.nama || parsed.name || '',
            phone: normalizedPhone,
            no_hp: normalizedPhone,
            username: parsed.username || normalizedPhone,
            password: '',
            role: dbUser.role || parsed.role || 'user',
            email: dbUser.email || parsed.email || '',
            foto_url: dbUser.foto_url || '',
            createdAt: parsed.createdAt || Date.now(),
            lat: parsed.lat || 0,
            lng: parsed.lng || 0,
            address: parsed.address || ''
        };

        _loginWithSession(sessionData);
    }

    function _loginWithSession(userData) {
        // Save to session
        if (typeof setSession === 'function') setSession(userData);

        // Also save to local users array for offline
        if (typeof getUsers === 'function' && typeof saveUsers === 'function') {
            var users = getUsers();
            var exists = users.find(function (u) { return u.id === userData.id; });
            if (!exists) {
                users.push(userData);
                saveUsers(users);
            } else {
                // Update existing
                Object.keys(userData).forEach(function (k) { exists[k] = userData[k]; });
                saveUsers(users);
            }
        }

        var name = userData.name || userData.nama || 'User';
        if (typeof showToast === 'function') showToast('Selamat datang, ' + name + '!', 'success');

        var role = userData.role || 'user';
        if (typeof showPage === 'function') showPage(role);
        if (typeof syncFromBackend === 'function') syncFromBackend();
        if (typeof updateRoleUI === 'function') updateRoleUI(userData);
    }

    function _redirectToRegister() {
        // Prefill phone in register and go to step 2 (skip phone input)
        if (typeof showPage === 'function') showPage('register');

        // Pass phone to register flow
        if (typeof RegisterPage !== 'undefined' && RegisterPage.getState) {
            var regState = RegisterPage.getState();
            if (regState) {
                // Set phone in register state and skip to step 3 (profile)
                // The user already verified phone via login OTP
            }
        }

        if (typeof showToast === 'function') {
            showToast('Nomor baru! Lengkapi profil untuk mulai.', 'info');
        }
    }

    // ─── Timer ───
    function _startResendTimer() {
        _stopResendTimer();
        _otpSeconds = 60;
        $('loginResendTimer').classList.remove('hidden');
        $('loginBtnResend').classList.add('hidden');
        _updateTimerDisplay();

        _otpTimer = setInterval(function () {
            _otpSeconds--;
            _updateTimerDisplay();
            if (_otpSeconds <= 0) {
                _stopResendTimer();
                $('loginResendTimer').classList.add('hidden');
                $('loginBtnResend').classList.remove('hidden');
            }
        }, 1000);
    }

    function _stopResendTimer() {
        if (_otpTimer) { clearInterval(_otpTimer); _otpTimer = null; }
    }

    function _updateTimerDisplay() {
        var el = $('loginResendTimer');
        if (el) el.innerHTML = 'Kirim ulang dalam <strong>' + _otpSeconds + '</strong>s';
    }

    // ─── Supabase client ───
    function _getSb() {
        if (typeof window.FB !== 'undefined' && window.FB._sb) return window.FB._sb;
        return null;
    }

    // ─── Reset (when showing login page) ───
    function reset() {
        _stopResendTimer();
        $('loginStep1').classList.remove('hidden');
        $('loginStep2').classList.add('hidden');
        $('loginPhoneError').classList.add('hidden');
        var lastPhone = localStorage.getItem(LAST_PHONE_KEY);
        if (lastPhone) {
            $('loginPhoneInput').value = lastPhone;
            _phoneRaw = lastPhone;
            _validatePhone();
        }
    }

    return {
        init: init,
        reset: reset
    };
})();

window.LoginPage = LoginPage;
