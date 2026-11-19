'use strict';

module.exports = Object.freeze({
    // Database MongoDB khusus aplikasi ini. Bisa diganti via env MONGODB_DB.
    DEFAULT_DB_NAME: 'pilkades_telukan',

    // Koleksi yang dipakai (dibuat & diindeks otomatis oleh lib/mongodb.js)
    COLLECTIONS: Object.freeze({
        PEMILIH: 'pemilih',
        OTP: 'otp_verifications',
        SUARA: 'suara'
    }),

    // 3 Calon Kepala Desa / Lurah Telukan (id sama dengan frontend: 01, 02, 03)
    KANDIDAT_IDS: [1, 2, 3],

    OTP_LENGTH: 6,
    OTP_TTL_MS: 5 * 60 * 1000,          // OTP berlaku 5 menit
    OTP_MAX_ATTEMPTS: 5,                // salah input maksimal 5x per kode
    OTP_RESEND_COOLDOWN_MS: 60 * 1000,  // jeda minta OTP ulang
    OTP_MAX_PER_HOUR: 5,                // batas kirim OTP per nomor per jam

    SESSION_TTL_MS: 30 * 60 * 1000,     // sesi bilik suara setelah OTP valid

    DISCLAIMER: 'Survei/polling hiburan warga, bukan pemilihan resmi.'
});
