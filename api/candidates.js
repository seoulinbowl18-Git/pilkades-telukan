'use strict';

const { getDb, COLLECTIONS } = require('../lib/mongodb');
const { HttpError, sendJson, allowMethods, readBody, handleError, isAdminRequest } = require('../lib/http');
const { validateCandidateUpdate, toPublicCandidate } = require('../lib/candidates');
const config = require('../lib/config');

/**
 * /api/candidates — Profil 2 Calon Kepala Desa (koleksi `kandidat`)
 *
 * GET : publik. Mengembalikan 2 profil (nama, slogan, visi, misi, foto).
 *       Saat pertama dipakai, profil bawaan dari lib/config.js disalin ke database.
 * PUT : panitia (header x-admin-pin). Body: { kandidat_id, name?, tagline?, visi?, misi?, photo? }
 */
module.exports = async function handler(req, res) {
    if (!allowMethods(req, res, ['GET', 'PUT'])) return;

    try {
        const db = await getDb();
        const col = db.collection(COLLECTIONS.KANDIDAT);

        if (req.method === 'PUT') {
            if (!isAdminRequest(req)) throw new HttpError(401, 'PIN Panitia salah atau tidak dikirim.', { code: 'BAD_PIN' });
            const body = readBody(req);
            const kandidatId = Number(body.kandidat_id);
            if (config.KANDIDAT_IDS.indexOf(kandidatId) === -1) throw new HttpError(400, 'Kandidat tidak valid.');
            const result = validateCandidateUpdate(body);
            if (!result.ok) throw new HttpError(400, result.error, { code: 'INVALID_CANDIDATE' });

            await seedDefaults(col);
            const updated = await col.findOneAndUpdate(
                { kandidat_id: kandidatId },
                { $set: Object.assign({}, result.changes, { updated_at: new Date(), updated_by: 'panitia' }) },
                { returnDocument: 'after' }
            );
            return sendJson(res, 200, { ok: true, message: 'Profil kandidat disimpan ke database.', candidate: toPublicCandidate(updated) });
        }

        await seedDefaults(col);
        const docs = (await col.find({}, { projection: { _id: 0 } }).sort({ kandidat_id: 1 }).toArray())
            .filter(function (d) { return config.KANDIDAT_IDS.indexOf(d.kandidat_id) !== -1; });
        sendJson(res, 200, { ok: true, candidates: docs.map(toPublicCandidate) });
    } catch (err) {
        handleError(res, err);
    }
};

const seeded = globalThis.__pilkadesCandidatesSeeded || (globalThis.__pilkadesCandidatesSeeded = { done: false });

/** Menyalin profil bawaan ke database jika belum ada (tidak menimpa hasil edit panitia). */
async function seedDefaults(col) {
    if (seeded.done) return;
    const now = new Date();
    for (const def of config.KANDIDAT_DEFAULTS) {
        await col.updateOne(
            { kandidat_id: def.kandidat_id },
            {
                $setOnInsert: {
                    kandidat_id: def.kandidat_id,
                    nomor: def.nomor,
                    name: def.name,
                    tagline: def.tagline,
                    visi: def.visi,
                    misi: def.misi.slice(),
                    photo: null,
                    created_at: now,
                    updated_at: now
                }
            },
            { upsert: true }
        );
    }
    seeded.done = true;
}
