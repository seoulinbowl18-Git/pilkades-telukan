'use strict';

const crypto = require('crypto');
const { ConfigError } = require('./mongodb');

class HttpError extends Error {
    constructor(status, message, extra) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.extra = extra || null;
    }
}

function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(payload));
}

function allowMethods(req, res, methods) {
    if (methods.indexOf(req.method) === -1) {
        res.setHeader('Allow', methods.join(', '));
        sendJson(res, 405, { ok: false, error: 'Method tidak diizinkan. Gunakan ' + methods.join(' / ') + '.' });
        return false;
    }
    return true;
}

/**
 * Vercel sudah mem-parse body JSON ke req.body; fallback untuk string/Buffer.
 */
function readBody(req) {
    const body = req.body;
    if (body == null || body === '') return {};
    if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
    try {
        const parsed = JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : String(body));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        throw new HttpError(400, 'Body request harus berupa JSON yang valid.');
    }
}

function handleError(res, err) {
    if (err instanceof HttpError) {
        return sendJson(res, err.status, Object.assign({ ok: false, error: err.message }, err.extra || {}));
    }
    if (err instanceof ConfigError || (err && err.code === 'ENV_MISSING')) {
        return sendJson(res, 503, {
            ok: false,
            code: 'ENV_MISSING',
            missing: err.missing || [],
            error: err.message + '. Atur di Vercel → Settings → Environment Variables, lalu redeploy.'
        });
    }
    const name = err && err.name ? String(err.name) : '';
    if (name.indexOf('MongoServerSelectionError') === 0 || name.indexOf('MongoNetworkError') === 0 ||
        name === 'MongoParseError' || name === 'MongoAPIError') {
        console.error('[mongodb]', err);
        return sendJson(res, 503, {
            ok: false,
            code: 'DB_UNAVAILABLE',
            error: 'Gagal terhubung ke database MongoDB. Periksa MONGODB_URI dan Network Access (IP Allowlist) di MongoDB Atlas.'
        });
    }
    console.error('[api]', err);
    return sendJson(res, 500, { ok: false, error: 'Terjadi kesalahan pada server. Silakan coba lagi.' });
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashOtp(noWa, otp) {
    return sha256(noWa + ':' + otp);
}

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Normalisasi nomor WhatsApp Indonesia ke format 62xxxxxxxxx.
 * Mengembalikan null jika tidak valid.
 */
function normalizeWa(raw) {
    let num = String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
    if (num.indexOf('62') === 0) num = num.slice(2);
    else if (num.indexOf('0') === 0) num = num.slice(1);
    if (num.indexOf('8') !== 0 || num.length < 9 || num.length > 13) return null;
    return '62' + num;
}

function maskWa(wa) {
    const s = String(wa || '');
    if (s.length <= 6) return s;
    return s.slice(0, 4) + '•'.repeat(Math.max(0, s.length - 7)) + s.slice(-3);
}

function cleanText(value, maxLen) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function getAdminPin() {
    return (process.env.ADMIN_PIN || '').trim() || '1234';
}

function isAdminRequest(req) {
    const pin = req.headers['x-admin-pin'];
    return typeof pin === 'string' && pin.length > 0 && safeEqual(pin, getAdminPin());
}

module.exports = {
    HttpError,
    sendJson,
    allowMethods,
    readBody,
    handleError,
    sha256,
    hashOtp,
    safeEqual,
    normalizeWa,
    maskWa,
    cleanText,
    isAdminRequest
};
