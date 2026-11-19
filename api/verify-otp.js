'use strict';

const crypto = require('crypto');
const { getDb, COLLECTIONS } = require('../lib/mongodb');
const {
    HttpError, sendJson, allowMethods, readBody, handleError,
    sha256, hashOtp, safeEqual, normalizeWa
} = require('../lib/http');
const config = require('../lib/config');

/**
 * POST /api/verify-otp
 * Body: { no_wa, otp }
 * Sukses: menandai OTP terpakai, pemilih.is_verified = true, dan mengembalikan
 * session_token sekali pakai untuk masuk Bilik Suara (POST /api/vote).
 */
module.exports = async function handler(req, res) {
    if (!allowMethods(req, res, ['POST'])) return;

    try {
        const body = readBody(req);
        const noWa = normalizeWa(body.no_wa);
        const otp = String(body.otp == null ? '' : body.otp).replace(/[^0-9]/g, '');

        if (!noWa) throw new HttpError(400, 'Nomor WhatsApp tidak valid.');
        if (otp.length !== config.OTP_LENGTH) throw new HttpError(400, 'Kode OTP harus ' + config.OTP_LENGTH + ' digit angka.');

        const db = await getDb();
        const pemilihCol = db.collection(COLLECTIONS.PEMILIH);
        const otpCol = db.collection(COLLECTIONS.OTP);
        const now = new Date();

        const pemilih = await pemilihCol.findOne({ no_wa: noWa });
        if (!pemilih) {
            throw new HttpError(404, 'Nomor WhatsApp belum terdaftar. Silakan daftar & minta OTP di tab Daftar WA.', { code: 'NOT_REGISTERED' });
        }
        if (pemilih.has_voted) {
            throw new HttpError(409, 'Nomor WhatsApp ini sudah menggunakan hak pilih.', { code: 'ALREADY_VOTED' });
        }

        const otpDoc = await otpCol.find({ no_wa: noWa, consumed_at: null }).sort({ created_at: -1 }).limit(1).next();
        if (!otpDoc || otpDoc.expires_at <= now) {
            throw new HttpError(400, 'Kode OTP sudah kedaluwarsa atau belum diminta. Silakan minta OTP baru.', { code: 'OTP_EXPIRED' });
        }
        if (otpDoc.attempt_count >= config.OTP_MAX_ATTEMPTS) {
            throw new HttpError(429, 'Terlalu banyak percobaan salah. Silakan minta OTP baru.', { code: 'OTP_LOCKED' });
        }

        if (!safeEqual(otpDoc.otp_hash, hashOtp(noWa, otp))) {
            const updated = await otpCol.findOneAndUpdate(
                { _id: otpDoc._id },
                { $inc: { attempt_count: 1 } },
                { returnDocument: 'after' }
            );
            const attempts = updated && typeof updated.attempt_count === 'number' ? updated.attempt_count : otpDoc.attempt_count + 1;
            const remaining = Math.max(0, config.OTP_MAX_ATTEMPTS - attempts);
            throw new HttpError(400, 'Kode OTP salah. Sisa percobaan: ' + remaining + '.', { code: 'OTP_INVALID', remaining_attempts: remaining });
        }

        // Tandai terpakai secara atomik (cegah 1 OTP dipakai 2x bersamaan)
        const consumed = await otpCol.findOneAndUpdate(
            { _id: otpDoc._id, consumed_at: null, expires_at: { $gt: now } },
            { $set: { consumed_at: now } },
            { returnDocument: 'after' }
        );
        if (!consumed) {
            throw new HttpError(400, 'Kode OTP sudah digunakan. Silakan minta OTP baru.', { code: 'OTP_USED' });
        }

        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionExpiresAt = new Date(now.getTime() + config.SESSION_TTL_MS);

        await pemilihCol.updateOne(
            { _id: pemilih._id },
            {
                $set: {
                    is_verified: true,
                    verified_at: pemilih.verified_at || now,
                    session_token_hash: sha256(sessionToken),
                    session_expires_at: sessionExpiresAt,
                    updated_at: now
                }
            }
        );

        sendJson(res, 200, {
            ok: true,
            message: 'Verifikasi OTP berhasil. Silakan masuk ke Bilik Suara.',
            session_token: sessionToken,
            session_expires_in: Math.round(config.SESSION_TTL_MS / 1000),
            pemilih: {
                nama_lengkap: pemilih.nama_lengkap,
                no_wa: pemilih.no_wa,
                rt_rw: pemilih.rt_rw,
                is_verified: true,
                has_voted: false
            }
        });
    } catch (err) {
        handleError(res, err);
    }
};
