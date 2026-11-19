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

/*
 * Konfigurasi hanya dibaca dari environment variable (tidak ada kredensial di kode):
 *   MONGODB_URI : connection string Atlas, mis. mongodb+srv://soraya_render:<PASSWORD>@<CLUSTER_HOST>/pilkades_telukan?...
 *   MONGODB_DB  : nama database (default: pilkades_telukan)
 * Database yang dipakai selalu ditentukan oleh MONGODB_DB / default di atas,
 * bukan oleh path di dalam URI.
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

async function getClient() {
    const uri = (process.env.MONGODB_URI || '').trim();
    if (!uri) {
        throw new ConfigError(['MONGODB_URI']);
    }

    if (cache.client) {
        return cache.client;
    }

    if (!cache.clientPromise) {
        const client = new MongoClient(uri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 8000,
            appName: 'e-pilkades-telukan'
        });
        cache.clientPromise = client.connect()
            .then(function (connected) {
                cache.client = connected;
                return connected;
            })
            .catch(function (err) {
                // Reset agar invocation berikutnya mencoba koneksi ulang
                cache.clientPromise = null;
                cache.client = null;
                throw err;
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
                { key: { kandidat_id: 1 }, name: 'kandidat_id' }
            ])
        ]).catch(function (err) {
            cache.indexesPromise = null;
            throw err;
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
    isMongoConfigured
};
