/* ========================================
   JASA SURUH - CAPTCHA Service (Turnstile)
   Shared captcha token manager for OTP send
   ======================================== */
'use strict';

var CaptchaService = (function () {
    var CONTEXTS = {
        login: { containerId: 'loginCaptchaWidget', messageId: 'loginCaptchaMessage' },
        'register-send': { containerId: 'regCaptchaSendWidget', messageId: 'regCaptchaSendMessage' },
        'register-resend': { containerId: 'regCaptchaResendWidget', messageId: 'regCaptchaResendMessage' }
    };

    var _siteKey = '';
    var _widgetIds = {};
    var _tokens = {};
    var _renderRetryCount = {};
    var _watchdogTimers = {};
    var _scriptBinded = false;
    var _MAX_RETRY = 120; // 120 * 500ms = 60s

    function _getContextConfig(context) {
        return CONTEXTS[context] || null;
    }

    function _getContainer(context) {
        var cfg = _getContextConfig(context);
        if (!cfg) return null;
        return document.getElementById(cfg.containerId);
    }

    function _getSiteKey() {
        if (_siteKey) return _siteKey;

        var cfg = window.__APP_SECURITY__ || {};
        var fromWindow = String(cfg.turnstileSiteKey || window.__TURNSTILE_SITE_KEY__ || '').trim();
        if (fromWindow) {
            _siteKey = fromWindow;
            return _siteKey;
        }

        var meta = document.querySelector('meta[name="turnstile-site-key"]');
        var fromMeta = meta ? String(meta.getAttribute('content') || '').trim() : '';
        if (fromMeta) {
            _siteKey = fromMeta;
            return _siteKey;
        }

        return '';
    }

    function _bindScriptLifecycle(scriptEl) {
        if (!scriptEl || scriptEl._jsCaptchaBound) return;
        scriptEl._jsCaptchaBound = true;
        scriptEl.addEventListener('load', function () {
            _scriptBinded = true;
        });
        scriptEl.addEventListener('error', function () {
            _scriptBinded = true;
        });
    }

    function _ensureTurnstileScript() {
        if (window.turnstile && typeof window.turnstile.render === 'function') return;

        var selector = 'script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]';
        var existing = document.querySelector(selector);
        if (existing) {
            _bindScriptLifecycle(existing);
            return;
        }

        var script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.setAttribute('data-js-turnstile', '1');
        _bindScriptLifecycle(script);
        document.head.appendChild(script);
    }

    // _hasRenderedIframe removed as it causes duplicate captchas

    function _scheduleWidgetWatchdog(context) {
        // Disabled: aggressive watchdog causes Turnstile widget to jump and reload on slow networks
    }

    function _setMessage(context, message) {
        var cfg = _getContextConfig(context);
        if (!cfg) return;
        var el = document.getElementById(cfg.messageId);
        if (!el) return;

        if (message) {
            el.textContent = message;
            el.classList.remove('hidden');
        } else {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    function _renderWidget(context, force) {
        var cfg = _getContextConfig(context);
        if (!cfg) return;

        var container = document.getElementById(cfg.containerId);
        if (!container) return;

        if (force && _widgetIds[context] !== undefined && window.turnstile && typeof window.turnstile.remove === 'function') {
            try { window.turnstile.remove(_widgetIds[context]); } catch (e) {}
            _widgetIds[context] = undefined;
        }

        if (_widgetIds[context] !== undefined) {
            return;
        }

        var siteKey = _getSiteKey();
        if (!siteKey) {
            _setMessage(context, 'Captcha belum dikonfigurasi. Hubungi admin.');
            return;
        }

        _ensureTurnstileScript();

        if (!window.turnstile || typeof window.turnstile.render !== 'function') {
            var retry = (_renderRetryCount[context] || 0) + 1;
            _renderRetryCount[context] = retry;
            _setMessage(context, 'Memuat CAPTCHA keamanan...');
            if (retry <= _MAX_RETRY) {
                setTimeout(function () { _renderWidget(context); }, 500);
                return;
            }
            _setMessage(context, 'Captcha gagal dimuat. Refresh halaman lalu coba lagi.');
            return;
        }

        _renderRetryCount[context] = 0;
        _setMessage(context, '');
        try {
            _widgetIds[context] = window.turnstile.render(container, {
                sitekey: siteKey,
                theme: 'light',
                action: 'otp_send',
                retry: 'auto',
                'refresh-expired': 'auto',
                callback: function (token) {
                    _tokens[context] = String(token || '').trim();
                    _setMessage(context, '');
                },
                'expired-callback': function () {
                    _tokens[context] = '';
                },
                'error-callback': function () {
                    _tokens[context] = '';
                    _widgetIds[context] = undefined;
                    var nextRetry = (_renderRetryCount[context] || 0) + 1;
                    _renderRetryCount[context] = nextRetry;
                    if (nextRetry <= 5) {
                        _setMessage(context, 'Captcha error. Mengulang captcha...');
                        setTimeout(function () { _renderWidget(context, true); }, 1500);
                    } else {
                        _setMessage(context, 'Captcha gagal dimuat. Refresh halaman lalu coba lagi.');
                    }
                }
            });
            _scheduleWidgetWatchdog(context);
        } catch (e) {
            _tokens[context] = '';
            _widgetIds[context] = undefined;
            var nextRetry = (_renderRetryCount[context] || 0) + 1;
            _renderRetryCount[context] = nextRetry;
            if (nextRetry <= _MAX_RETRY) {
                _setMessage(context, 'Captcha sedang dipersiapkan...');
                setTimeout(function () { _renderWidget(context, true); }, 700);
                return;
            }
            _setMessage(context, 'Captcha gagal dimuat. Refresh halaman lalu coba lagi.');
        }
    }

    function render(context) {
        _renderWidget(context, false);
    }

    function requireToken(context) {
        _renderWidget(context, false);
        var token = String(_tokens[context] || '').trim();
        if (!token) {
            _setMessage(context, 'Selesaikan CAPTCHA keamanan terlebih dahulu.');
            return '';
        }
        return token;
    }

    function reset(context) {
        _tokens[context] = '';
        var widgetId = _widgetIds[context];
        if (widgetId === undefined) return;
        if (!window.turnstile || typeof window.turnstile.reset !== 'function') return;
        try {
            window.turnstile.reset(widgetId);
        } catch (e) {
            // ignore reset error
        }
        _setMessage(context, '');
    }

    return {
        render: render,
        requireToken: requireToken,
        reset: reset
    };
})();

window.CaptchaService = CaptchaService;
