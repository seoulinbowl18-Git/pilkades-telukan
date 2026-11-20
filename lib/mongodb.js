'use strict';

/**
 * Helper koneksi MongoDB untuk Vercel Serverless Functions.
 *
 * Koneksi di-cache di `globalThis` agar invocation berikutnya pada instance
 * yang sama (warm start) dan hot-reload saat `vercel dev` tidak membuka
 * koneksi baru berulang kali.
 */

const { MongoClient } = require('mongodb');
const config = require('./config');
const { prepareMongoUri } = require('./mongo-diagnostics');

/*
 * Konfigurasi hanya dibaca dari environment variable (tidak ada kredensial di kode):
 *   MONGODB_URI : connection string Atlas, mis. mongodb+srv://soraya_render:<PASSWORD>@<CLUSTER_HOST>/pilkades_telukan?...
 *   MONGODB_DB  : nama database (default: pilkades_telukan)
 * Database yang dipakai selalu ditentukan oleh MONGODB_DB / default di atas,
 * bukan oleh path di dalam URI.
 *
 * Sebelum dipakai, URI dibersihkan oleh prepareMongoUri(): trim spasi/baris baru,
 * hapus tanda kutip & prefix "MONGODB_URI=", URL-encode karakter khusus di
 * username/password, dan authSource=admin bila tidak ditulis di URI.
 * Kredensial tidak pernah dicetak ke log maupun response.
 */
const DEFAULT_DB_NAME = config.DEFAULT_DB_NAME;
const COLLECTIONS = config.COLLECTIONS;

const cache = globalThis.__pilkadesMongo || (globalThis.__pilkadesMongo = {
    client: null,
    clientPromise: null,
    indexesPromise: null
});

class ConfigError extends Error {
    constructor(missing) {
        super('Environment variable belum diatur di server: ' + missing.join(', '));
        this.name = 'ConfigError';
        this.code = 'ENV_MISSING';
        this.missing = missing;
    }
}

function getDbName() {
    return (process.env.MONGODB_DB || '').trim() || DEFAULT_DB_NAME;
}

function isMongoConfigured() {
    return Boolean((process.env.MONGODB_URI || '').trim());
}

/**
 * Ringkasan aman tentang MONGODB_URI (tanpa username/password/host).
 */
function inspectMongoUri() {
    const prepared = prepareMongoUri(process.env.MONGODB_URI, { dbName: getDbName() });
    return { summary: prepared.summary, issues: prepared.issues };
}

function tagStage(err, stage, issues) {
    if (err && typeof err === 'object') {
        if (!err.__mongoStage) {
            Object.defineProperty(err, '__mongoStage', { value: stage, enumerable: false, configurable: true });
        }
        if (issues && !err.__uriIssues) {
            Object.defineProperty(err, '__uriIssues', { value: issues, enumerable: false, configurable: true });
        }
    }
    return err;
}

async function getClient() {
    if (!isMongoConfigured()) {
        throw new ConfigError(['MONGODB_URI']);
    }

    if (cache.client) {
        return cache.client;
    }

    if (!cache.clientPromise) {
        const prepared = prepareMongoUri(process.env.MONGODB_URI, { dbName: getDbName() });
        if (!prepared.uri) {
            const parseErr = new Error('MONGODB_URI tidak valid');
            parseErr.name = 'MongoParseError';
            throw tagStage(parseErr, 'parse_uri', prepared.issues);
        }

        let client;
        try {
            client = new MongoClient(prepared.uri, Object.assign({
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 8000,
                connectTimeoutMS: 8000,
                appName: 'e-pilkades-telukan'
            }, prepared.clientOptions));
        } catch (err) {
            throw tagStage(err, 'parse_uri', prepared.issues);
        }

        cache.clientPromise = client.connect()
            .then(function (connected) {
                cache.client = connected;
                return connected;
            })
            .catch(function (err) {
                // Reset agar invocation berikutnya mencoba koneksi ulang
                cache.clientPromise = null;
                cache.client = null;
                try { client.close(); } catch (e) { /* abaikan */ }
                throw tagStage(err, 'connect', prepared.issues);
            });
    }

    return cache.clientPromise;
}

/**
 * Membuat index yang dibutuhkan (idempotent). Dijalankan sekali per instance.
 */
async function ensureIndexes(db) {
    if (!cache.indexesPromise) {
        cache.indexesPromise = Promise.all([
            db.collection(COLLECTIONS.PEMILIH).createIndexes([
                { key: { no_wa: 1 }, name: 'uniq_no_wa', unique: true },
                { key: { created_at: -1 }, name: 'created_at_desc' }
            ]),
            db.collection(COLLECTIONS.OTP).createIndexes([
                { key: { no_wa: 1, created_at: -1 }, name: 'no_wa_created_at' },
                // Dokumen OTP otomatis dihapus MongoDB 1 hari setelah kedaluwarsa
                { key: { expires_at: 1 }, name: 'ttl_expires_at', expireAfterSeconds: 86400 }
            ]),
            db.collection(COLLECTIONS.SUARA).createIndexes([
                // Kunci utama anti suara ganda: 1 nomor WA = 1 suara
                { key: { no_wa: 1 }, name: 'uniq_no_wa', unique: true },
                { key: { kandidat_id: 1 }, name: 'kandidat_id' },
                { key: { receipt_id: 1 }, name: 'receipt_id', unique: true, sparse: true }
            ]),
            db.collection(COLLECTIONS.KANDIDAT).createIndexes([
                { key: { kandidat_id: 1 }, name: 'uniq_kandidat_id', unique: true }
            ]),
            db.collection(COLLECTIONS.PESAN).createIndexes([
                { key: { message_id: 1 }, name: 'uniq_message_id', unique: true },
                { key: { deleted_at: 1, created_at: -1 }, name: 'public_feed' },
                { key: { receipt_id: 1, created_at: -1 }, name: 'receipt_id_created_at' }
            ])
        ]).catch(function (err) {
            cache.indexesPromise = null;
            throw tagStage(err, 'create_indexes');
        });
    }
    return cache.indexesPromise;
}

/**
 * Mengembalikan instance Db yang sudah terkoneksi dan ber-index.
 */
async function getDb() {
    const client = await getClient();
    const db = client.db(getDbName());
    await ensureIndexes(db);
    return db;
}

module.exports = {
    COLLECTIONS,
    ConfigError,
    getClient,
    getDb,
    getDbName,
    ensureIndexes,
    isMongoConfigured,
    inspectMongoUri,
    tagStage
};
