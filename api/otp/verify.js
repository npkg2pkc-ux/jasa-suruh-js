// OTP Verify & Create User Session
// POST /api/otp/verify

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqptkuoazqharfzxvgem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

function formatPhone(phone) {
    let cleaned = String(phone || '').replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
    else if (cleaned.startsWith('8')) cleaned = '62' + cleaned;
    return cleaned;
}

function isValidIndonesianMobile(phone) {
    return /^628\d{8,12}$/.test(String(phone || ''));
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    const { phone, code } = req.body || {};
    if (!phone || !code) {
        return res.status(400).json({ success: false, message: 'Nomor HP dan kode OTP wajib diisi' });
    }

    const formatted = formatPhone(phone);

    if (!isValidIndonesianMobile(formatted)) {
        return res.status(400).json({ success: false, message: 'Hanya nomor Indonesia (+62 8...) yang diizinkan' });
    }

    if (!/^[0-9]{6}$/.test(code)) {
        return res.status(400).json({ success: false, message: 'Format kode OTP tidak valid' });
    }

    // Find latest unverified OTP for this phone
    try {
        const findRes = await fetch(
            SUPABASE_URL + '/rest/v1/otp_codes?phone=eq.' + formatted +
            '&verified=eq.false&order=created_at.desc&limit=1',
            {
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
                }
            }
        );

        const otps = await findRes.json();

        if (!Array.isArray(otps) || otps.length === 0) {
            return res.status(400).json({ success: false, message: 'Tidak ada OTP yang aktif. Kirim ulang OTP.' });
        }

        const otp = otps[0];

        // Check expiry
        if (new Date(otp.expires_at).getTime() < Date.now()) {
            return res.status(400).json({ success: false, message: 'Kode OTP sudah kadaluarsa. Kirim ulang OTP.' });
        }

        // Check code match (constant-time comparison)
        const crypto = require('crypto');
        const a = Buffer.from(code);
        const b = Buffer.from(otp.code);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return res.status(400).json({ success: false, message: 'Kode OTP salah' });
        }

        // Mark as verified
        await fetch(
            SUPABASE_URL + '/rest/v1/otp_codes?id=eq.' + otp.id,
            {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ verified: true })
            }
        );

        // Clean up old OTPs for this phone
        fetch(
            SUPABASE_URL + '/rest/v1/otp_codes?phone=eq.' + formatted + '&id=neq.' + otp.id,
            {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
                }
            }
        ).catch(() => {}); // Fire and forget

        // Generate a session token (simple hash of phone + timestamp)
        const sessionToken = crypto
            .createHmac('sha256', SUPABASE_SERVICE_KEY)
            .update(formatted + ':' + Date.now())
            .digest('hex');

        return res.status(200).json({
            success: true,
            message: 'Verifikasi berhasil',
            data: {
                phone: formatted,
                verified: true,
                token: sessionToken
            }
        });

    } catch (e) {
        console.error('Verify OTP error:', e);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
    }
};
