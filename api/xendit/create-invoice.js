// Xendit Create Invoice - Top Up Saldo
// POST /api/xendit/create-invoice

const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqptkuoazqharfzxvgem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function _firstHeaderValue(v) {
    return String(v || '').split(',')[0].trim();
}

function resolveBaseUrl(req) {
    var configured = String(process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
    if (configured) return configured.replace(/\/$/, '');

    var host = _firstHeaderValue(req.headers['x-forwarded-host'] || req.headers.host);
    if (!host) return '';
    var proto = _firstHeaderValue(req.headers['x-forwarded-proto'] || 'https') || 'https';
    return (proto + '://' + host).replace(/\/$/, '');
}

function resolveInvoiceUrl(xenditData) {
    var candidates = [];
    if (xenditData) {
        candidates.push(xenditData.invoice_url_v2);
        candidates.push(xenditData.checkout_url);
        candidates.push(xenditData.invoice_url);
    }

    // Prioritaskan URL non-staging untuk kompatibilitas browser mobile, jika tersedia.
    for (var i = 0; i < candidates.length; i++) {
        var c = String(candidates[i] || '').trim();
        if (!/^https?:\/\//i.test(c)) continue;
        if (c.indexOf('checkout-staging.xendit.co') === -1) return c;
    }

    for (var j = 0; j < candidates.length; j++) {
        var fallback = String(candidates[j] || '').trim();
        if (/^https?:\/\//i.test(fallback)) return fallback;
    }

    return '';
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!XENDIT_SECRET_KEY) return res.status(500).json({ error: 'Xendit belum dikonfigurasi' });
    if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase service role key belum dikonfigurasi' });

    const { userId, amount, userName } = req.body || {};
    if (!userId || !amount || Number(amount) < 10000) {
        return res.status(400).json({ error: 'Jumlah minimal Rp 10.000' });
    }

    const txId = 'topup_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const baseUrl = resolveBaseUrl(req);

    try {
        // Create Xendit Invoice
        const auth = Buffer.from(XENDIT_SECRET_KEY + ':').toString('base64');
        const invoicePayload = {
            external_id: txId,
            amount: Number(amount),
            description: 'Top Up Saldo Jasa Suruh' + (userName ? ' - ' + userName : ''),
            currency: 'IDR',
            invoice_duration: 86400
        };
        if (baseUrl) {
            invoicePayload.success_redirect_url = baseUrl + '/?xendit=success';
            invoicePayload.failure_redirect_url = baseUrl + '/?xendit=failed';
        }

        const xenditRes = await fetch('https://api.xendit.co/v2/invoices', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + auth,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(invoicePayload)
        });

        const xenditData = await xenditRes.json();

        if (!xenditRes.ok) {
            console.error('Xendit error:', xenditData);
            return res.status(400).json({ error: xenditData.message || 'Gagal membuat invoice' });
        }

        const invoiceUrl = resolveInvoiceUrl(xenditData);
        if (!invoiceUrl) {
            console.error('Xendit invoice URL invalid:', xenditData);
            return res.status(500).json({ error: 'Invoice berhasil dibuat, tapi link checkout tidak valid' });
        }

        // Save pending transaction to Supabase
        const txData = {
            id: txId,
            userId: userId,
            type: 'topup',
            amount: Number(amount),
            status: 'pending',
            idempotencyKey: 'topup:' + txId + ':paid',
            xenditInvoiceId: xenditData.id,
            xenditInvoiceUrl: invoiceUrl,
            description: 'Top Up via Xendit (Menunggu Pembayaran)',
            createdAt: Date.now()
        };

        await fetch(SUPABASE_URL + '/rest/v1/transactions', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                id: txId,
                user_id: userId,
                type: 'topup',
                amount: Number(amount),
                created_at: Date.now(),
                data: txData
            })
        });

        return res.status(200).json({
            success: true,
            invoiceUrl: invoiceUrl,
            invoiceId: xenditData.id,
            txId: txId
        });

    } catch (err) {
        console.error('Create invoice error:', err);
        return res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
};
