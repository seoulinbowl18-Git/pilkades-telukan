'use strict';

const crypto = require('crypto');
const { getDb, COLLECTIONS } = require('../lib/mongodb');
const {
    HttpError, sendJson, allowMethods, readBody, handleError, isAdminRequest, sha256, safeEqual
} = require('../lib/http');
const { sanitizeMessage, maskDisplayName, toPublicMessage } = require('../lib/messages');
const config = require('../lib/config');

function getQuery(req) {
    if (req.query && typeof req.query === 'object') return req.query;
    try {
        return Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams);
    } catch (e) {
        return {};
    }
}

/**
 * /api/messages — Pesan & Harapan Warga untuk Pilkades Telukan
 *
 * GET    : daftar pesan terbaru (publik). Tanpa nomor WA / kode bukti / token.
 * POST   : { receipt_id, message_token, pesan } — hanya pemilih yang sudah mencoblos.
 * DELETE : ?id=<message_id> + header x-admin-pin — hapus (sembunyikan) pesan oleh panitia.
 */
module.exports = async function handler(req, res) {
    if (!allowMethods(req, res, ['GET', 'POST', 'DELETE'])) return;

    try {
        if (req.method === 'GET') return await listMessages(req, res);
        if (req.method === 'POST') return await createMessage(req, res);
        return await deleteMessage(req, res);
    } catch (err) {
        handleError(res, err);
    }
};

async function listMessages(req, res) {
    const db = await getDb();
    const docs = await db.collection(COLLECTIONS.PESAN)
        .find({ deleted_at: null }, { projection: { _id: 0, message_id: 1, nama_tampil: 1, pesan: 1, created_at: 1 } })
        .sort({ created_at: -1 })
        .limit(config.MESSAGES_PUBLIC_LIMIT)
        .toArray();
    sendJson(res, 200, { ok: true, messages: docs.map(toPublicMessage) });
}

async function createMessage(req, res) {
    const body = readBody(req);
    const receiptId = String(body.receipt_id || '').trim().toUpperCase();
    const token = String(body.message_token || '');

    if (!/^VOTE-[0-9A-F]{8}$/.test(receiptId) || !token) {
        throw new HttpError(401, 'Pesan hanya bisa dikirim setelah Anda mencoblos di Bilik Suara.', { code: 'NOT_VOTED' });
    }

    const cleaned = sanitizeMessage(body.pesan);
    if (!cleaned.ok) throw new HttpError(400, cleaned.error, { code: 'INVALID_MESSAGE' });

    const db = await getDb();
    const suara = await db.collection(COLLECTIONS.SUARA).findOne({ receipt_id: receiptId });
    if (!suara || !suara.message_token_hash || !safeEqual(suara.message_token_hash, sha256(token))) {
        throw new HttpError(401, 'Pesan hanya bisa dikirim setelah Anda mencoblos di Bilik Suara.', { code: 'NOT_VOTED' });
    }

    const pesanCol = db.collection(COLLECTIONS.PESAN);
    const now = new Date();
    const previous = await pesanCol.find({ receipt_id: receiptId }).sort({ created_at: -1 }).limit(config.MESSAGE_MAX_PER_VOTER).toArray();

    if (previous.length >= config.MESSAGE_MAX_PER_VOTER) {
        throw new HttpError(429, 'Batas ' + config.MESSAGE_MAX_PER_VOTER + ' pesan per pemilih sudah tercapai. Terima kasih atas partisipasinya!', { code: 'MESSAGE_LIMIT' });
    }
    if (previous[0] && now - previous[0].created_at < config.MESSAGE_COOLDOWN_MS) {
        const wait = Math.ceil((config.MESSAGE_COOLDOWN_MS - (now - previous[0].created_at)) / 1000);
        throw new HttpError(429, 'Tunggu ' + wait + ' detik sebelum mengirim pesan berikutnya.', { code: 'MESSAGE_COOLDOWN', retry_after: wait });
    }
    const normalized = cleaned.text.toLowerCase();
    if (previous.some(function (p) { return String(p.pesan).toLowerCase() === normalized; })) {
        throw new HttpError(409, 'Pesan yang sama sudah pernah Anda kirim.', { code: 'MESSAGE_DUPLICATE' });
    }

    const pemilih = await db.collection(COLLECTIONS.PEMILIH).findOne({ no_wa: suara.no_wa });
    const doc = {
        message_id: crypto.randomBytes(8).toString('hex'),
        receipt_id: receiptId,
        no_wa: suara.no_wa,               // hanya untuk internal/moderasi, tidak pernah dikirim ke publik
        nama_tampil: maskDisplayName(pemilih && pemilih.nama_lengkap),
        pesan: cleaned.text,
        created_at: now,
        deleted_at: null
    };
    await pesanCol.insertOne(doc);

    sendJson(res, 201, {
        ok: true,
        message: 'Pesan Anda berhasil dikirim. Terima kasih!',
        data: toPublicMessage(doc),
        remaining: config.MESSAGE_MAX_PER_VOTER - previous.length - 1
    });
}

async function deleteMessage(req, res) {
    if (!isAdminRequest(req)) {
        throw new HttpError(401, 'PIN Panitia salah atau tidak dikirim.', { code: 'BAD_PIN' });
    }
    const query = getQuery(req);
    let body = {};
    try { body = readBody(req); } catch (e) { body = {}; }
    const messageId = String(query.id || body.message_id || '').trim();
    if (!/^[0-9a-f]{16}$/.test(messageId)) throw new HttpError(400, 'ID pesan tidak valid.');

    const db = await getDb();
    const result = await db.collection(COLLECTIONS.PESAN).findOneAndUpdate(
        { message_id: messageId, deleted_at: null },
        { $set: { deleted_at: new Date(), deleted_by: 'panitia' } },
        { returnDocument: 'after' }
    );
    if (!result) throw new HttpError(404, 'Pesan tidak ditemukan atau sudah dihapus.');
    sendJson(res, 200, { ok: true, message: 'Pesan berhasil dihapus dari papan publik.', message_id: messageId });
}
