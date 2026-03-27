/* ========================================
   JASA SURUH - Multi-Step Registration
   Components: RegisterPage, StepAccountType,
   StepPhone, StepOTP, StepProfile
   ======================================== */
'use strict';

var RegisterPage = (function () {
    var PUBLIC_REGISTER_ROLES = ['user', 'penjual'];

    function normalizePublicRegisterRole(role) {
        var r = String(role || '').toLowerCase();
        return PUBLIC_REGISTER_ROLES.indexOf(r) >= 0 ? r : 'user';
    }

    // ═══ STATE ═══
    var state = {
        step: 1,
        role: 'user',
        phone: '',
        formattedPhone: '',
        otp: ['', '', '', '', '', ''],
        authUser: null,
        authSession: null,
        nama: '',
        email: '',
        fotoFile: null,
        fotoPreview: '',
        loading: false,
        error: '',
        otpTimer: 0,
        otpTimerInterval: null
    };

    function setState(key, value) {
        state[key] = value;
    }

    function getState() {
        return state;
    }

    var _cooldownTimer = null;
    var _cooldownUntil = 0;

    function _formatRemaining(ms) {
        var totalSec = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
        var h = Math.floor(totalSec / 3600);
        var m = Math.floor((totalSec % 3600) / 60);
        var s = totalSec % 60;
        return h + 'j ' + m + 'm ' + s + 'd';
    }

    function _hideCooldownNotice() {
        var el = document.getElementById('regCooldownNotice');
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
        if (_cooldownTimer) {
            clearInterval(_cooldownTimer);
            _cooldownTimer = null;
        }
        _cooldownUntil = 0;
    }

    function _showCooldownNotice(blockedUntil, fallbackMessage) {
        var el = document.getElementById('regCooldownNotice');
        if (!el) return;

        _cooldownUntil = Number(blockedUntil || 0);
        if (_cooldownTimer) { clearInterval(_cooldownTimer); _cooldownTimer = null; }

        function render() {
            var remain = Math.max(0, _cooldownUntil - Date.now());
            if (remain <= 0) {
                _hideCooldownNotice();
                return;
            }
            var base = fallbackMessage || 'Nomor ini sedang cooldown setelah akun dihapus.';
            if (base.indexOf('Coba daftar lagi dalam') >= 0) {
                base = 'Nomor ini sedang cooldown setelah akun dihapus.';
            }
            el.textContent = base + ' Coba lagi dalam ' + _formatRemaining(remain) + '.';
            el.classList.remove('hidden');
        }

        render();
        _cooldownTimer = setInterval(render, 1000);
    }

    // ═══ STEP NAVIGATION ═══
    function goToStep(step) {
        if (step < 1 || step > 4) return;
        var oldStep = state.step;
        state.step = step;
        renderStepIndicator();
        animateStepTransition(oldStep, step);
    }

    function animateStepTransition(from, to) {
        var container = document.getElementById('regStepsContainer');
        if (!container) return;

        var steps = container.querySelectorAll('.reg-step');
        var direction = to > from ? 'left' : 'right';

        steps.forEach(function (s) {
            s.classList.remove('reg-step-active', 'reg-step-exit-left', 'reg-step-exit-right', 'reg-step-enter-left', 'reg-step-enter-right');
            s.classList.add('reg-step-hidden');
        });

        var targetStep = document.getElementById('regStep' + to);
        if (targetStep) {
            targetStep.classList.remove('reg-step-hidden');
            targetStep.classList.add('reg-step-enter-' + direction);
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    targetStep.classList.remove('reg-step-enter-' + direction);
                    targetStep.classList.add('reg-step-active');
                });
            });
        }

        // Focus first input on new step
        setTimeout(function () {
            if (to === 2) {
                var phoneInput = document.getElementById('regPhoneInput');
                if (phoneInput) phoneInput.focus();
            } else if (to === 3) {
                // Show phone number on OTP step
                var phoneDisplay = document.getElementById('regOTPPhoneDisplay');
                if (phoneDisplay) phoneDisplay.textContent = '0' + state.phone.replace(/^0+/, '');
                var otpFirst = document.getElementById('otpDigit0');
                if (otpFirst) otpFirst.focus();
            } else if (to === 4) {
                var namaInput = document.getElementById('regNamaInput');
                if (namaInput) namaInput.focus();
            }
        }, 350);
    }

    function renderStepIndicator() {
        for (var i = 1; i <= 4; i++) {
            var dot = document.getElementById('regIndicator' + i);
            var line = document.getElementById('regLine' + i);
            if (dot) {
                dot.classList.remove('active', 'completed');
                if (i === state.step) dot.classList.add('active');
                else if (i < state.step) dot.classList.add('completed');
            }
            if (line) {
                line.classList.remove('completed');
                if (i < state.step) line.classList.add('completed');
            }
        }
    }

    // ═══ STEP 1: ACCOUNT TYPE ═══
    var StepAccountType = {
        init: function () {
            var buttons = document.querySelectorAll('#regStep1 .reg-role-btn');
            buttons.forEach(function (btn) {
                btn.addEventListener('click', function () {
                    buttons.forEach(function (b) { b.classList.remove('active'); });
                    this.classList.add('active');
                    state.role = normalizePublicRegisterRole(this.dataset.role);
                    document.getElementById('regStep1Next').disabled = false;
                });
            });

            var nextBtn = document.getElementById('regStep1Next');
            if (nextBtn) {
                nextBtn.addEventListener('click', function () {
                    goToStep(2);
                });
            }
            // Set default
            state.role = 'user';
        }
    };

    // ═══ STEP 2: PHONE ═══
    var StepPhone = {
        init: function () {
            var input = document.getElementById('regPhoneInput');
            var sendBtn = document.getElementById('regSendOTPBtn');
            var backBtn = document.getElementById('regStep2Back');
            var errorEl = document.getElementById('regPhoneError');

            if (input) {
                input.addEventListener('input', function () {
                    var val = this.value.replace(/\D/g, '');
                    if (val.length > 13) val = val.slice(0, 13);
                    this.value = val;
                    state.phone = val;
                    if (errorEl) errorEl.textContent = '';

                    var isValid = /^08[0-9]{8,12}$/.test(val);
                    if (sendBtn) sendBtn.disabled = !isValid || state.loading;
                });
            }

            if (sendBtn) {
                sendBtn.addEventListener('click', function () {
                    StepPhone.sendOTP();
                });
            }

            if (backBtn) {
                backBtn.addEventListener('click', function () {
                    goToStep(1);
                });
            }
        },

        sendOTP: function () {
            var errorEl = document.getElementById('regPhoneError');
            var sendBtn = document.getElementById('regSendOTPBtn');

            if (!/^08[0-9]{8,12}$/.test(state.phone)) {
                if (errorEl) errorEl.textContent = 'Nomor HP tidak valid';
                return;
            }

            state.loading = true;
            state.error = '';
            _hideCooldownNotice();
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = '<span class="reg-spinner"></span> Mengirim...';
            }
            if (errorEl) errorEl.textContent = '';

            state.formattedPhone = AuthService.formatPhone(state.phone);

            AuthService.sendOTP(state.phone)
                .then(function (result) {
                    state.loading = false;
                    if (sendBtn) {
                        sendBtn.disabled = false;
                        sendBtn.textContent = 'Kirim OTP';
                    }
                    goToStep(3);
                    StepOTP.startTimer();
                })
                .catch(function (err) {
                    state.loading = false;
                    if (sendBtn) {
                        sendBtn.disabled = false;
                        sendBtn.textContent = 'Kirim OTP';
                    }
                    var msg = err.message || 'Gagal mengirim OTP';
                    if (msg.includes('rate limit')) msg = 'Terlalu banyak percobaan. Tunggu beberapa menit.';
                    if (errorEl) errorEl.textContent = msg;
                    if (err && err.code === 'ACCOUNT_COOLDOWN') {
                        var info = err.cooldownInfo || {};
                        _showCooldownNotice(Number(info.blockedUntil || 0), msg);
                    }
                });
        }
    };

    // ═══ STEP 3: OTP VERIFICATION ═══
    var StepOTP = {
        init: function () {
            // Setup 6-digit OTP inputs
            for (var i = 0; i < 6; i++) {
                (function (idx) {
                    var input = document.getElementById('otpDigit' + idx);
                    if (!input) return;

                    input.addEventListener('input', function (e) {
                        var val = this.value.replace(/\D/g, '');
                        if (val.length > 1) val = val.charAt(val.length - 1);
                        this.value = val;
                        state.otp[idx] = val;

                        if (val && idx < 5) {
                            var next = document.getElementById('otpDigit' + (idx + 1));
                            if (next) next.focus();
                        }

                        // Auto verify when all 6 digits filled
                        if (state.otp.join('').length === 6) {
                            StepOTP.verifyOTP();
                        }
                    });

                    input.addEventListener('keydown', function (e) {
                        if (e.key === 'Backspace' && !this.value && idx > 0) {
                            var prev = document.getElementById('otpDigit' + (idx - 1));
                            if (prev) { prev.focus(); prev.select(); }
                        }
                    });

                    // Handle paste
                    input.addEventListener('paste', function (e) {
                        e.preventDefault();
                        var pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
                        for (var j = 0; j < 6 && j < pasted.length; j++) {
                            var el = document.getElementById('otpDigit' + j);
                            if (el) { el.value = pasted[j]; state.otp[j] = pasted[j]; }
                        }
                        if (pasted.length >= 6) StepOTP.verifyOTP();
                        else {
                            var focusIdx = Math.min(pasted.length, 5);
                            var focusEl = document.getElementById('otpDigit' + focusIdx);
                            if (focusEl) focusEl.focus();
                        }
                    });
                })(i);
            }

            var backBtn = document.getElementById('regStep3Back');
            if (backBtn) {
                backBtn.addEventListener('click', function () {
                    StepOTP.clearTimer();
                    goToStep(2);
                });
            }

            var resendBtn = document.getElementById('regResendOTP');
            if (resendBtn) {
                resendBtn.addEventListener('click', function () {
                    if (state.otpTimer > 0) return;
                    StepOTP.resendOTP();
                });
            }
        },

        startTimer: function () {
            StepOTP.clearTimer();
            state.otpTimer = 60;
            StepOTP.updateTimerDisplay();

            state.otpTimerInterval = setInterval(function () {
                state.otpTimer--;
                StepOTP.updateTimerDisplay();
                if (state.otpTimer <= 0) {
                    StepOTP.clearTimer();
                }
            }, 1000);
        },

        clearTimer: function () {
            if (state.otpTimerInterval) {
                clearInterval(state.otpTimerInterval);
                state.otpTimerInterval = null;
            }
            state.otpTimer = 0;
            StepOTP.updateTimerDisplay();
        },

        updateTimerDisplay: function () {
            var timerEl = document.getElementById('regOTPTimer');
            var resendBtn = document.getElementById('regResendOTP');
            if (state.otpTimer > 0) {
                if (timerEl) timerEl.textContent = 'Kirim ulang dalam ' + state.otpTimer + 's';
                if (resendBtn) { resendBtn.classList.add('disabled'); resendBtn.style.pointerEvents = 'none'; }
            } else {
                if (timerEl) timerEl.textContent = '';
                if (resendBtn) { resendBtn.classList.remove('disabled'); resendBtn.style.pointerEvents = ''; }
            }
        },

        resendOTP: function () {
            var errorEl = document.getElementById('regOTPError');
            if (errorEl) errorEl.textContent = '';
            // Clear inputs
            for (var i = 0; i < 6; i++) {
                state.otp[i] = '';
                var el = document.getElementById('otpDigit' + i);
                if (el) el.value = '';
            }

            AuthService.sendOTP(state.phone)
                .then(function () {
                    StepOTP.startTimer();
                    showToast('OTP dikirim ulang', 'success');
                })
                .catch(function (err) {
                    if (errorEl) errorEl.textContent = err.message || 'Gagal mengirim ulang OTP';
                });
        },

        verifyOTP: function () {
            var code = state.otp.join('');
            if (code.length !== 6) return;

            var errorEl = document.getElementById('regOTPError');
            var container = document.getElementById('regOTPInputs');

            state.loading = true;
            if (errorEl) errorEl.textContent = '';
            if (container) container.classList.add('otp-verifying');

            AuthService.verifyOTP(state.phone, code)
                .then(function (result) {
                    state.loading = false;
                    state.authUser = result.user;
                    state.authSession = result.session;
                    if (container) container.classList.remove('otp-verifying');
                    if (container) container.classList.add('otp-success');

                    setTimeout(function () {
                        if (container) container.classList.remove('otp-success');
                        goToStep(4);
                    }, 600);
                })
                .catch(function (err) {
                    state.loading = false;
                    if (container) container.classList.remove('otp-verifying');
                    if (container) container.classList.add('otp-error');
                    setTimeout(function () {
                        if (container) container.classList.remove('otp-error');
                    }, 500);

                    var msg = err.message || 'Kode OTP salah';
                    if (msg.includes('expired')) msg = 'Kode OTP sudah kadaluarsa';
                    if (errorEl) errorEl.textContent = msg;

                    // Clear OTP inputs
                    for (var i = 0; i < 6; i++) {
                        state.otp[i] = '';
                        var el = document.getElementById('otpDigit' + i);
                        if (el) el.value = '';
                    }
                    var first = document.getElementById('otpDigit0');
                    if (first) first.focus();
                });
        }
    };

    // ═══ STEP 4: PROFILE ═══
    var StepProfile = {
        init: function () {
            var namaInput = document.getElementById('regNamaInput');
            var emailInput = document.getElementById('regEmailInput');
            var submitBtn = document.getElementById('regSubmitBtn');
            var backBtn = document.getElementById('regStep4Back');
            var photoBtn = document.getElementById('regPhotoBtn');
            var photoInput = document.getElementById('regPhotoInput');
            var removeBtn = document.getElementById('regRemovePhoto');

            if (namaInput) {
                namaInput.addEventListener('input', function () {
                    state.nama = this.value.trim();
                    StepProfile.validateForm();
                });
            }

            if (emailInput) {
                emailInput.addEventListener('input', function () {
                    state.email = this.value.trim();
                });
            }

            if (submitBtn) {
                submitBtn.addEventListener('click', function () {
                    StepProfile.submit();
                });
            }

            if (backBtn) {
                backBtn.addEventListener('click', function () {
                    goToStep(3);
                });
            }

            if (photoBtn) {
                photoBtn.addEventListener('click', function () {
                    if (photoInput) photoInput.click();
                });
            }

            if (photoInput) {
                photoInput.addEventListener('change', function () {
                    var file = this.files[0];
                    if (!file) return;
                    // Limit to 5MB
                    if (file.size > 5 * 1024 * 1024) {
                        showToast('Ukuran foto maksimal 5MB', 'error');
                        this.value = '';
                        return;
                    }
                    state.fotoFile = file;
                    var reader = new FileReader();
                    reader.onload = function () {
                        state.fotoPreview = reader.result;
                        var preview = document.getElementById('regPhotoPreview');
                        var previewImg = document.getElementById('regPhotoImg');
                        var uploadArea = document.getElementById('regPhotoUploadArea');
                        if (previewImg) previewImg.src = reader.result;
                        if (preview) preview.style.display = '';
                        if (uploadArea) uploadArea.style.display = 'none';
                    };
                    reader.readAsDataURL(file);
                    this.value = '';
                });
            }

            if (removeBtn) {
                removeBtn.addEventListener('click', function () {
                    state.fotoFile = null;
                    state.fotoPreview = '';
                    var preview = document.getElementById('regPhotoPreview');
                    var uploadArea = document.getElementById('regPhotoUploadArea');
                    if (preview) preview.style.display = 'none';
                    if (uploadArea) uploadArea.style.display = '';
                });
            }
        },

        validateForm: function () {
            var submitBtn = document.getElementById('regSubmitBtn');
            var isValid = state.nama.length >= 2;
            if (submitBtn) submitBtn.disabled = !isValid;
        },

        submit: function () {
            if (!state.nama || state.nama.length < 2) {
                showToast('Nama minimal 2 karakter', 'error');
                return;
            }

            var submitBtn = document.getElementById('regSubmitBtn');
            var errorEl = document.getElementById('regProfileError');
            state.loading = true;
            _hideCooldownNotice();
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="reg-spinner"></span> Mendaftar...';
            }
            if (errorEl) errorEl.textContent = '';

            // Upload photo first if exists
            var photoPromise;
            if (state.fotoFile) {
                var tempId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                photoPromise = AuthService.uploadPhoto(tempId, state.fotoFile)
                    .then(function (r) { return r.url; })
                    .catch(function () { return ''; });
            } else {
                photoPromise = Promise.resolve('');
            }

            photoPromise.then(function (fotoUrl) {
                state.role = normalizePublicRegisterRole(state.role);
                var profileData = {
                    role: state.role,
                    nama: state.nama,
                    no_hp: state.formattedPhone || AuthService.formatPhone(state.phone),
                    email: state.email || null,
                    foto_url: fotoUrl || null
                };

                return AuthService.createProfile(state.authUser, profileData);
            }).then(function (result) {
                state.loading = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Selesai';
                }

                // Save to local session for existing app flow
                var userId = result.data ? result.data.id : (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
                var localUser = {
                    id: userId,
                    name: state.nama,
                    phone: state.phone,
                    username: state.phone,
                    password: '',
                    role: state.role,
                    email: state.email,
                    createdAt: Date.now(),
                    lat: 0,
                    lng: 0,
                    address: ''
                };
                setSession(localUser);

                // Sync to local storage
                var users = getUsers();
                users.push(localUser);
                saveUsers(users);

                showToast('Selamat datang, ' + state.nama + '! 🎉', 'success');

                // Navigate to role dashboard
                var dashRole = state.role;
                if (dashRole === 'pengguna' || dashRole === 'user') dashRole = 'user';
                showPage(dashRole);

                // Reset state
                RegisterPage.reset();

            }).catch(function (err) {
                state.loading = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Selesai';
                }
                var msg = err.message || 'Gagal membuat akun';
                if (errorEl) errorEl.textContent = msg;
                if (err && err.code === 'ACCOUNT_COOLDOWN') {
                    var info = err.cooldownInfo || {};
                    _showCooldownNotice(Number(info.blockedUntil || 0), msg);
                }
            });
        }
    };

    // ═══ PUBLIC API ═══
    function init() {
        _hideCooldownNotice();
        StepAccountType.init();
        StepPhone.init();
        StepOTP.init();
        StepProfile.init();
        renderStepIndicator();

        // Show first step
        var steps = document.querySelectorAll('.reg-step');
        steps.forEach(function (s, i) {
            if (i === 0) {
                s.classList.remove('reg-step-hidden');
                s.classList.add('reg-step-active');
            } else {
                s.classList.add('reg-step-hidden');
            }
        });

        // Back to login link
        var loginLink = document.getElementById('regBackToLogin');
        if (loginLink) {
            loginLink.addEventListener('click', function (e) {
                e.preventDefault();
                showPage('login');
                RegisterPage.reset();
            });
        }
    }

    function reset() {
        _hideCooldownNotice();
        StepOTP.clearTimer();
        state.step = 1;
        state.role = 'user';
        state.phone = '';
        state.formattedPhone = '';
        state.otp = ['', '', '', '', '', ''];
        state.authUser = null;
        state.authSession = null;
        state.nama = '';
        state.email = '';
        state.fotoFile = null;
        state.fotoPreview = '';
        state.loading = false;
        state.error = '';

        // Reset UI
        var phoneInput = document.getElementById('regPhoneInput');
        if (phoneInput) phoneInput.value = '';
        for (var i = 0; i < 6; i++) {
            var el = document.getElementById('otpDigit' + i);
            if (el) el.value = '';
        }
        var namaInput = document.getElementById('regNamaInput');
        if (namaInput) namaInput.value = '';
        var emailInput = document.getElementById('regEmailInput');
        if (emailInput) emailInput.value = '';
        var photoPreview = document.getElementById('regPhotoPreview');
        if (photoPreview) photoPreview.style.display = 'none';
        var uploadArea = document.getElementById('regPhotoUploadArea');
        if (uploadArea) uploadArea.style.display = '';

        // Reset role buttons
        var roleButtons = document.querySelectorAll('#regStep1 .reg-role-btn');
        roleButtons.forEach(function (b) { b.classList.remove('active'); });
        var userBtn = document.querySelector('#regStep1 .reg-role-btn[data-role="user"]');
        if (userBtn) userBtn.classList.add('active');

        // Go to step 1
        goToStep(1);
    }

    return {
        init: init,
        reset: reset,
        getState: getState,
        goToStep: goToStep
    };
})();

window.RegisterPage = RegisterPage;
