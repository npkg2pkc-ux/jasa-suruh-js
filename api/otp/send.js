// OTP Send via WhatsApp (Fonnte)
// POST /api/otp/send

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqptkuoazqharfzxvgem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const FONNTE_TOKEN = process.env.FONNTE_TOKEN || '';
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';

function formatPhone(phone) {
    let cleaned = String(phone || '').replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
    else if (cleaned.startsWith('8')) cleaned = '62' + cleaned;
    return cleaned;
}

function isValidIndonesianMobile(phone) {
    // +62 then 8xxxxxxxx (raw length after 62 is 9-13 digits)
    return /^628\d{8,12}$/.test(String(phone || ''));
}

function getClientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (Array.isArray(xf) && xf.length) return String(xf[0]).split(',')[0].trim();
    if (typeof xf === 'string' && xf) return xf.split(',')[0].trim();
    const xr = req.headers['x-real-ip'];
    if (typeof xr === 'string' && xr) return xr.trim();
    return '';
}

async function verifyCaptcha(captchaToken, clientIp) {
    if (!TURNSTILE_SECRET_KEY) {
        return { ok: false, code: 500, message: 'Captcha server belum dikonfigurasi' };
    }

    if (!captchaToken || typeof captchaToken !== 'string') {
        return { ok: false, code: 400, message: 'Captcha wajib diisi' };
    }

    try {
        const params = new URLSearchParams();
        params.set('secret', TURNSTILE_SECRET_KEY);
        params.set('response', captchaToken);
        if (clientIp) params.set('remoteip', clientIp);

        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (!verifyRes.ok) {
            return { ok: false, code: 400, message: 'Verifikasi captcha gagal' };
        }

        const verifyData = await verifyRes.json();
        if (!verifyData.success) {
            return { ok: false, code: 400, message: 'Captcha tidak valid' };
        }

        return { ok: true };
    } catch (e) {
        console.error('Captcha verify error:', e);
        return { ok: false, code: 500, message: 'Gagal verifikasi captcha' };
    }
}

function generateOTP() {
    const digits = '0123456789';
    let code = '';
    const bytes = require('crypto').randomBytes(6);
    for (let i = 0; i < 6; i++) {
        code += digits[bytes[i] % 10];
    }
    return code;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    const { phone, captchaToken } = req.body || {};
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Nomor HP wajib diisi' });
    }

    const formatted = formatPhone(phone);

    // Strict Indonesian phone number: +62 then 8...
    if (!isValidIndonesianMobile(formatted)) {
        return res.status(400).json({ success: false, message: 'Hanya nomor Indonesia (+62 8...) yang diizinkan' });
    }

    const captchaRes = await verifyCaptcha(captchaToken, getClientIp(req));
    if (!captchaRes.ok) {
        return res.status(captchaRes.code).json({ success: false, message: captchaRes.message });
    }

    // Rate limit: max 1 OTP per phone per 60 seconds
    try {
        const checkRes = await fetch(
            SUPABASE_URL + '/rest/v1/otp_codes?phone=eq.' + formatted +
            '&verified=eq.false&order=created_at.desc&limit=1',
            {
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
                }
            }
        );
        const recent = await checkRes.json();
        if (Array.isArray(recent) && recent.length > 0) {
            const lastSent = new Date(recent[0].created_at).getTime();
            const elapsed = Date.now() - lastSent;
            if (elapsed < 60000) {
                const wait = Math.ceil((60000 - elapsed) / 1000);
                return res.status(429).json({
                    success: false,
                    message: 'Tunggu ' + wait + ' detik sebelum kirim ulang'
                });
            }
        }
    } catch (e) {
        console.error('Rate limit check error:', e);
    }

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Store OTP in database
    try {
        const storeRes = await fetch(SUPABASE_URL + '/rest/v1/otp_codes', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                phone: formatted,
                code: code,
                expires_at: expiresAt,
                verified: false
            })
        });

        if (!storeRes.ok) {
            const err = await storeRes.text();
            console.error('Store OTP error:', err);
            return res.status(500).json({ success: false, message: 'Gagal menyimpan OTP' });
        }
    } catch (e) {
        console.error('Store OTP error:', e);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan OTP' });
    }

    // Send OTP via WhatsApp (Fonnte)
    if (!FONNTE_TOKEN) {
        // Dev mode: log OTP instead of sending
        console.log('[DEV] OTP for ' + formatted + ': ' + code);
        return res.status(200).json({
            success: true,
            message: 'OTP terkirim (dev mode)',
            dev_code: process.env.NODE_ENV === 'development' ? code : undefined
        });
    }

    try {
        const waMessage = '🔐 *Kode OTP Jasa Suruh*\n\n'
            + 'Kode verifikasi kamu: *' + code + '*\n\n'
            + 'Berlaku 5 menit.\n'
            + 'Jangan berikan kode ini kepada siapapun.';

        const fonRes = await fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: {
                'Authorization': FONNTE_TOKEN,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                target: formatted,
                message: waMessage,
                countryCode: '62'
            })
        });

        const fonData = await fonRes.json();

        if (fonData.status === false || fonData.reason) {
            console.error('Fonnte error:', fonData);
            return res.status(500).json({
                success: false,
                message: 'Gagal mengirim OTP via WhatsApp: ' + (fonData.reason || 'Unknown error')
            });
        }

        return res.status(200).json({
            success: true,
            message: 'OTP dikirim ke WhatsApp'
        });
    } catch (e) {
        console.error('WhatsApp send error:', e);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengirim OTP via WhatsApp'
        });
    }
};
