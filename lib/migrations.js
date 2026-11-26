'use strict';

/**
 * Migrasi data ringan yang dijalankan sekali per instance serverless (idempoten).
 *
 * 2026-11: Kelurahan Telukan hanya memiliki 2 kandidat. Kandidat ID 2 (Hesti Kartika Asmara)
 * dihapus. Untuk setiap suara ke kandidat yang dihapus:
 *   - status pemilihnya dikembalikan ke "belum mencoblos" agar bisa memilih ulang,
 *   - dokumen suaranya dihapus.
 * Profil kandidat yang dihapus juga dibuang dari koleksi `kandidat`, dan nomor urut
 * kandidat tersisa disamakan dengan KANDIDAT_DEFAULTS (ID 3 → nomor 02).
 */

const config = require('./config');

async function retireRemovedCandidates(db, COLLECTIONS) {
    const retired = config.RETIRED_KANDIDAT_IDS || [];
    const now = new Date();
    let resetVoters = 0;
    let removedVotes = 0;

    if (retired.length) {
        const suaraCol = db.collection(COLLECTIONS.SUARA);
        const pemilihCol = db.collection(COLLECTIONS.PEMILIH);
        for (const id of retired) {
            const votes = await suaraCol.find({ kandidat_id: id }).toArray();
            for (const v of votes) {
                await pemilihCol.updateOne(
                    { no_wa: v.no_wa },
                    {
                        $set: { has_voted: false, voted_at: null, updated_at: now },
                        $unset: { session_token_hash: '', session_expires_at: '' }
                    }
                );
                await suaraCol.deleteOne({ _id: v._id });
                resetVoters++;
                removedVotes++;
            }
            await db.collection(COLLECTIONS.KANDIDAT).deleteOne({ kandidat_id: id });
        }
    }

    for (const def of config.KANDIDAT_DEFAULTS) {
        await db.collection(COLLECTIONS.KANDIDAT).updateOne(
            { kandidat_id: def.kandidat_id, nomor: { $ne: def.nomor } },
            { $set: { nomor: def.nomor } }
        );
    }

    if (removedVotes) {
        console.log('[migrations] Kandidat dihapus: ' + removedVotes + ' suara dibersihkan, ' + resetVoters + ' pemilih dapat memilih ulang.');
    }
    return { removedVotes: removedVotes, resetVoters: resetVoters };
}

module.exports = { retireRemovedCandidates };
