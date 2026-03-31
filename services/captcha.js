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

    function _getContextConfig(context) {
        return CONTEXTS[context] || null;
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

    function _renderWidget(context) {
        var cfg = _getContextConfig(context);
        if (!cfg) return;
        if (_widgetIds[context] !== undefined) return;

        var container = document.getElementById(cfg.containerId);
        if (!container) return;

        var siteKey = _getSiteKey();
        if (!siteKey) {
            _setMessage(context, 'Captcha belum dikonfigurasi. Hubungi admin.');
            return;
        }

        if (!window.turnstile || typeof window.turnstile.render !== 'function') {
            var retry = (_renderRetryCount[context] || 0) + 1;
            _renderRetryCount[context] = retry;
            if (retry <= 30) {
                setTimeout(function () { _renderWidget(context); }, 300);
                return;
            }
            _setMessage(context, 'Captcha gagal dimuat. Refresh halaman lalu coba lagi.');
            return;
        }

        _setMessage(context, '');
        _widgetIds[context] = window.turnstile.render(container, {
            sitekey: siteKey,
            theme: 'light',
            action: 'otp_send',
            callback: function (token) {
                _tokens[context] = String(token || '');
                _setMessage(context, '');
            },
            'expired-callback': function () {
                _tokens[context] = '';
            },
            'error-callback': function () {
                _tokens[context] = '';
                _setMessage(context, 'Captcha error. Ulangi verifikasi keamanan.');
            }
        });
    }

    function render(context) {
        _renderWidget(context);
    }

    function requireToken(context) {
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
    }

    return {
        render: render,
        requireToken: requireToken,
        reset: reset
    };
})();

window.CaptchaService = CaptchaService;
