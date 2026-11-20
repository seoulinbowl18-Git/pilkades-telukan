'use strict';

const crypto = require('crypto');
const { getDb, COLLECTIONS } = require('../lib/mongodb');
const { sendWhatsApp, isFonnteConfigured } = require('../lib/fonnte');
const {
    HttpError, sendJson, allowMethods, readBody, handleError, assertVotingOpen,
    hashOtp, normalizeWa, maskWa, cleanText
} = require('../lib/http');
const config = require('../lib/config');

function generateOtp() {
    const max = Math.pow(10, config.OTP_LENGTH);
    return String(crypto.randomInt(0, max)).padStart(config.OTP_LENGTH, '0');
}

/**
 * POST /api/send-otp
 * Body: { nama_lengkap, no_wa, rt_rw }
 */
module.exports = async function handler(req, res) {
    if (!allowMethods(req, res, ['POST'])) return;

    try {
        assertVotingOpen();

        const body = readBody(req);
        const nama = cleanText(body.nama_lengkap, 80);
        const rtRw = cleanText(body.rt_rw, 120);
        const noWa = normalizeWa(body.no_wa);

        if (!nama || nama.length < 3) throw new HttpError(400, 'Nama lengkap wajib diisi (minimal 3 karakter).');
        if (!rtRw) throw new HttpError(400, 'Alamat / RT-RW wajib diisi.');
        if (!noWa) throw new HttpError(400, 'Nomor WhatsApp tidak valid. Gunakan nomor aktif diawali 08 / 62 / 8 (9-13 digit).');

        if (!isFonnteConfigured()) {
            const err = new Error('Environment variable belum diatur di server: FONNTE_TOKEN');
            err.code = 'ENV_MISSING';
            err.missing = ['FONNTE_TOKEN'];
            throw err;
        }

        const db = await getDb();
        const pemilihCol = db.collection(COLLECTIONS.PEMILIH);
        const otpCol = db.collection(COLLECTIONS.OTP);
        const now = new Date();

        const existing = await pemilihCol.findOne({ no_wa: noWa });
        if (existing && existing.has_voted) {
            throw new HttpError(409, 'Nomor WhatsApp ini sudah menggunakan hak pilih. 1 nomor hanya bisa memilih 1 kali.', { code: 'ALREADY_VOTED' });
        }

        // Rate limit sederhana per nomor
        const lastOtp = await otpCol.find({ no_wa: noWa }).sort({ created_at: -1 }).limit(1).next();
        if (lastOtp && now - lastOtp.created_at < config.OTP_RESEND_COOLDOWN_MS) {
            const retryAfter = Math.ceil((config.OTP_RESEND_COOLDOWN_MS - (now - lastOtp.created_at)) / 1000);
            throw new HttpError(429, 'OTP baru saja dikirim. Tunggu ' + retryAfter + ' detik sebelum meminta ulang.', { code: 'COOLDOWN', retry_after: retryAfter });
        }
        const sentLastHour = await otpCol.countDocuments({ no_wa: noWa, created_at: { $gt: new Date(now.getTime() - 3600 * 1000) } });
        if (sentLastHour >= config.OTP_MAX_PER_HOUR) {
            throw new HttpError(429, 'Terlalu banyak permintaan OTP untuk nomor ini. Coba lagi 1 jam lagi.', { code: 'RATE_LIMITED' });
        }

        const otp = generateOtp();
        const expiresAt = new Date(now.getTime() + config.OTP_TTL_MS);

        // OTP lama yang belum terpakai dianggap tidak berlaku lagi
        await otpCol.updateMany({ no_wa: noWa, consumed_at: null }, { $set: { consumed_at: now, invalidated: true } });

        const inserted = await otpCol.insertOne({
            no_wa: noWa,
            otp_hash: hashOtp(noWa, otp),
            expires_at: expiresAt,
            consumed_at: null,
            attempt_count: 0,
            created_at: now
        });

        const minutes = Math.round(config.OTP_TTL_MS / 60000);
        const message =
            '*E-Pilkades Kelurahan Telukan, Grogol (2026-2034)*\n\n' +
            'Halo ' + nama + ',\n' +
            'Kode OTP Anda: *' + otp + '*\n' +
            'Berlaku ' + minutes + ' menit. Jangan bagikan kode ini kepada siapa pun.\n\n' +
            '_Catatan: ' + config.DISCLAIMER + '_';

        const sent = await sendWhatsApp(noWa, message);
        if (!sent.ok) {
            await otpCol.deleteOne({ _id: inserted.insertedId });
            console.error('[send-otp] Fonnte gagal:', sent.reason);
            throw new HttpError(502, 'Gagal mengirim OTP via WhatsApp (Fonnte): ' + sent.reason + '. Pastikan device Fonnte terhubung & token benar.', { code: 'FONNTE_FAILED' });
        }

        if (existing) {
            const update = { $set: { updated_at: now } };
            // Data nama/alamat hanya bisa diubah selama nomor belum terverifikasi
            if (!existing.is_verified) {
                update.$set.nama_lengkap = nama;
                update.$set.rt_rw = rtRw;
            }
            await pemilihCol.updateOne({ _id: existing._id }, update);
        } else {
            await pemilihCol.updateOne(
                { no_wa: noWa },
                {
                    $setOnInsert: {
                        no_wa: noWa,
                        nama_lengkap: nama,
                        rt_rw: rtRw,
                        is_verified: false,
                        verified_at: null,
                        has_voted: false,
                        voted_at: null,
                        created_at: now
                    },
                    $set: { updated_at: now }
                },
                { upsert: true }
            );
        }

        sendJson(res, 200, {
            ok: true,
            message: 'OTP telah dikirim ke WhatsApp ' + maskWa(noWa) + '.',
            no_wa: noWa,
            expires_in: Math.round(config.OTP_TTL_MS / 1000),
            resend_after: Math.round(config.OTP_RESEND_COOLDOWN_MS / 1000)
        });
    } catch (err) {
        handleError(res, err);
    }
};
