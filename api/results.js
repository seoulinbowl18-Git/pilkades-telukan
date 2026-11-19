'use strict';

const { getDb, COLLECTIONS } = require('../lib/mongodb');
const { sendJson, allowMethods, handleError, isAdminRequest, HttpError } = require('../lib/http');
const config = require('../lib/config');

/**
 * GET /api/results
 * Publik: rekap suara per kandidat & statistik agregat (tanpa data pribadi).
 * Panitia: kirim header `x-admin-pin` (default 1234, bisa diganti via env ADMIN_PIN)
 * untuk menyertakan daftar pemilih bagi Panel Panitia.
 */
module.exports = async function handler(req, res) {
    if (!allowMethods(req, res, ['GET'])) return;

    try {
        const wantsAdmin = typeof req.headers['x-admin-pin'] === 'string';
        const admin = wantsAdmin && isAdminRequest(req);
        if (wantsAdmin && !admin) {
            throw new HttpError(401, 'PIN Panitia salah.', { code: 'BAD_PIN' });
        }

        const db = await getDb();
        const pemilihCol = db.collection(COLLECTIONS.PEMILIH);
        const suaraCol = db.collection(COLLECTIONS.SUARA);

        const [grouped, totalRegistered, totalVerified, totalVoted] = await Promise.all([
            suaraCol.aggregate([{ $group: { _id: '$kandidat_id', votes: { $sum: 1 } } }]).toArray(),
            pemilihCol.countDocuments({}),
            pemilihCol.countDocuments({ is_verified: true }),
            pemilihCol.countDocuments({ has_voted: true })
        ]);

        const votesById = {};
        grouped.forEach(function (g) { votesById[g._id] = g.votes; });

        const candidates = config.KANDIDAT_IDS.map(function (id) {
            return { kandidat_id: id, votes: votesById[id] || 0 };
        });
        const totalVotes = candidates.reduce(function (sum, c) { return sum + c.votes; }, 0);

        const payload = {
            ok: true,
            disclaimer: config.DISCLAIMER,
            updated_at: new Date().toISOString(),
            candidates: candidates,
            total_votes: totalVotes,
            total_registered: totalRegistered,
            total_verified: totalVerified,
            total_voted: totalVoted
        };

        if (admin) {
            const voters = await pemilihCol.find({}, {
                projection: {
                    _id: 0,
                    nama_lengkap: 1,
                    no_wa: 1,
                    rt_rw: 1,
                    is_verified: 1,
                    verified_at: 1,
                    has_voted: 1,
                    voted_at: 1,
                    created_at: 1
                }
            }).sort({ created_at: -1 }).limit(500).toArray();
            payload.voters = voters;
        }

        sendJson(res, 200, payload);
    } catch (err) {
        handleError(res, err);
    }
};
