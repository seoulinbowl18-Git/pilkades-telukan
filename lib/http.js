'use strict';

const crypto = require('crypto');
const { ConfigError } = require('./mongodb');
const { diagnoseMongoError, isMongoError } = require('./mongo-diagnostics');

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
    if (isMongoError(err)) {
        const diag = diagnoseMongoError(err);
        console.error('[mongodb]', JSON.stringify(diag));
        return sendJson(res, 503, {
            ok: false,
            code: 'DB_UNAVAILABLE',
            db_error: { category: diag.category, stage: diag.stage, code: diag.code, codeName: diag.codeName },
            error: 'Gagal terhubung ke database MongoDB [' + diag.category + ']. ' + diag.hint
        });
    }
    console.error('[api]', err && err.name, err && err.message);
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

/**
 * Menolak request jika batas waktu TPS Digital sudah lewat.
 * VOTING_DEADLINE (env, format ISO 8601) opsional untuk menimpa nilai di config.
 */
function getVotingDeadline() {
    const config = require('./config');
    const fromEnv = (process.env.VOTING_DEADLINE || '').trim();
    const parsed = fromEnv ? new Date(fromEnv) : null;
    if (parsed && !isNaN(parsed.getTime())) return parsed;
    return new Date(config.VOTING_DEADLINE_ISO);
}

function assertVotingOpen(now) {
    const config = require('./config');
    const current = now || new Date();
    const deadline = getVotingDeadline();
    if (current > deadline) {
        throw new HttpError(403, config.VOTING_CLOSED_MESSAGE, { code: 'VOTING_CLOSED', voting_deadline: deadline.toISOString() });
    }
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
    isAdminRequest,
    getVotingDeadline,
    assertVotingOpen
};
