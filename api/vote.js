'use strict';

const crypto = require('crypto');
const { getDb, COLLECTIONS } = require('../lib/mongodb');
const {
    HttpError, sendJson, allowMethods, readBody, handleError, assertVotingOpen,
    sha256, safeEqual, normalizeWa
} = require('../lib/http');
const config = require('../lib/config');

/**
 * POST /api/vote
 * Body: { no_wa, session_token, kandidat_id }
 * 1 nomor WA = 1 suara, dijamin oleh unique index `suara.no_wa`.
 */
module.exports = async function handler(req, res) {
    if (!allowMethods(req, res, ['POST'])) return;

    try {
        assertVotingOpen();

        const body = readBody(req);
        const noWa = normalizeWa(body.no_wa);
        const token = String(body.session_token || '');
        const kandidatId = Number(body.kandidat_id);

        if (!noWa) throw new HttpError(400, 'Nomor WhatsApp tidak valid.');
        if (!token) throw new HttpError(401, 'Sesi bilik suara tidak ditemukan. Silakan verifikasi OTP terlebih dahulu.', { code: 'NO_SESSION' });
        if (config.KANDIDAT_IDS.indexOf(kandidatId) === -1) throw new HttpError(400, 'Kandidat tidak valid.');

        const db = await getDb();
        const pemilihCol = db.collection(COLLECTIONS.PEMILIH);
        const suaraCol = db.collection(COLLECTIONS.SUARA);
        const now = new Date();

        const pemilih = await pemilihCol.findOne({ no_wa: noWa });
        if (!pemilih || !pemilih.is_verified) {
            throw new HttpError(403, 'Nomor WhatsApp belum terverifikasi OTP.', { code: 'NOT_VERIFIED' });
        }
        if (pemilih.has_voted) {
            throw new HttpError(409, 'Nomor WhatsApp ini sudah mencoblos sebelumnya!', { code: 'ALREADY_VOTED' });
        }
        if (!pemilih.session_token_hash || !safeEqual(pemilih.session_token_hash, sha256(token)) ||
            !pemilih.session_expires_at || pemilih.session_expires_at <= now) {
            throw new HttpError(401, 'Sesi bilik suara tidak valid atau kedaluwarsa. Silakan minta & verifikasi OTP ulang.', { code: 'SESSION_INVALID' });
        }

        const receiptId = 'VOTE-' + crypto.randomBytes(4).toString('hex').toUpperCase();

        try {
            await suaraCol.insertOne({
                no_wa: noWa,
                kandidat_id: kandidatId,
                receipt_id: receiptId,
                created_at: now
            });
        } catch (err) {
            if (err && err.code === 11000) {
                await pemilihCol.updateOne({ _id: pemilih._id, has_voted: false }, { $set: { has_voted: true, voted_at: now } });
                throw new HttpError(409, 'Nomor WhatsApp ini sudah mencoblos sebelumnya!', { code: 'ALREADY_VOTED' });
            }
            throw err;
        }

        await pemilihCol.updateOne(
            { _id: pemilih._id },
            {
                $set: { has_voted: true, voted_at: now, updated_at: now },
                $unset: { session_token_hash: '', session_expires_at: '' }
            }
        );

        sendJson(res, 200, {
            ok: true,
            message: 'Suara Anda berhasil direkam.',
            receipt_id: receiptId,
            kandidat_id: kandidatId,
            voted_at: now.toISOString()
        });
    } catch (err) {
        handleError(res, err);
    }
};
