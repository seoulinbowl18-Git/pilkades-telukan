'use strict';

const { getDb, isMongoConfigured, getDbName, inspectMongoUri, tagStage } = require('../lib/mongodb');
const { diagnoseMongoError } = require('../lib/mongo-diagnostics');
const { isFonnteConfigured } = require('../lib/fonnte');
const { sendJson, allowMethods } = require('../lib/http');
const config = require('../lib/config');

/**
 * GET /api/health
 * Dipakai frontend untuk memilih Mode Online (MongoDB + Fonnte) atau Mode Demo Lokal,
 * dan oleh panitia untuk diagnosis koneksi.
 *
 * AMAN: tidak pernah mengembalikan username, password, host, token, atau isi MONGODB_URI.
 * Hanya status true/false, kategori error, kode error driver, dan petunjuk perbaikan.
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
        const inspected = inspectMongoUri();
        status.mongodb_uri_check = {
            summary: inspected.summary,
            issues: inspected.issues
        };

        const startedAt = Date.now();
        try {
            const db = await getDb();
            try {
                await db.command({ ping: 1 });
            } catch (pingErr) {
                throw tagStage(pingErr, 'ping');
            }
            status.mongodb_connected = true;
        } catch (err) {
            const diag = diagnoseMongoError(err);
            status.mongodb_error_detail = diag;
            status.mongodb_error = 'Gagal terhubung ke MongoDB [' + diag.category + ']. ' + diag.hint;
            console.error('[health] MongoDB gagal:', JSON.stringify(diag));
        }
        status.mongodb_check_ms = Date.now() - startedAt;
    }

    status.runtime = {
        node: process.version,
        mongodb_driver: (function () {
            try { return require('mongodb/package.json').version; } catch (e) { return null; }
        })(),
        region: process.env.VERCEL_REGION || null
    };

    status.online_ready = status.mongodb_connected && status.fonnte_configured;
    sendJson(res, 200, status);
};
