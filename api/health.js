'use strict';

const { getDb, isMongoConfigured, getDbName } = require('../lib/mongodb');
const { isFonnteConfigured } = require('../lib/fonnte');
const { sendJson, allowMethods } = require('../lib/http');
const config = require('../lib/config');

/**
 * GET /api/health
 * Dipakai frontend untuk memilih Mode Online (MongoDB + Fonnte) atau Mode Demo Lokal.
 * Tidak pernah mengembalikan nilai rahasia, hanya status true/false.
 */
module.exports = async function handler(req, res) {
    if (!allowMethods(req, res, ['GET'])) return;

    const status = {
        ok: true,
        app: 'E-Pilkades Kelurahan Telukan, Grogol (Periode 2026-2034)',
        disclaimer: config.DISCLAIMER,
        mongodb_configured: isMongoConfigured(),
        mongodb_connected: false,
        mongodb_db: getDbName(),
        fonnte_configured: isFonnteConfigured(),
        missing_env: []
    };

    if (!status.mongodb_configured) status.missing_env.push('MONGODB_URI');
    if (!status.fonnte_configured) status.missing_env.push('FONNTE_TOKEN');

    if (status.mongodb_configured) {
        try {
            const db = await getDb();
            await db.command({ ping: 1 });
            status.mongodb_connected = true;
        } catch (err) {
            console.error('[health] MongoDB ping gagal:', err && err.message);
            status.mongodb_error = 'Gagal terhubung ke MongoDB. Periksa MONGODB_URI dan Network Access di Atlas.';
        }
    }

    status.online_ready = status.mongodb_connected && status.fonnte_configured;
    sendJson(res, 200, status);
};
