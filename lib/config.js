'use strict';

module.exports = Object.freeze({
    // Database MongoDB khusus aplikasi ini. Bisa diganti via env MONGODB_DB.
    DEFAULT_DB_NAME: 'pilkades_telukan',

    // Koleksi yang dipakai (dibuat & diindeks otomatis oleh lib/mongodb.js)
    COLLECTIONS: Object.freeze({
        PEMILIH: 'pemilih',
        OTP: 'otp_verifications',
        SUARA: 'suara',
        PESAN: 'pesan_warga'
    }),

    // Pesan & harapan warga (hanya untuk pemilih yang sudah mencoblos)
    MESSAGE_MIN_LENGTH: 3,
    MESSAGE_MAX_LENGTH: 240,
    MESSAGE_MAX_PER_VOTER: 3,           // maksimal pesan per pemilih (termasuk yang dihapus panitia)
    MESSAGE_COOLDOWN_MS: 60 * 1000,     // jeda antar pesan dari pemilih yang sama
    MESSAGES_PUBLIC_LIMIT: 50,          // jumlah pesan terbaru yang ditampilkan publik

    // 3 Calon Kepala Desa / Lurah Telukan (id sama dengan frontend: 01, 02, 03)
    KANDIDAT_IDS: [1, 2, 3],

    OTP_LENGTH: 6,
    OTP_TTL_MS: 5 * 60 * 1000,          // OTP berlaku 5 menit
    OTP_MAX_ATTEMPTS: 5,                // salah input maksimal 5x per kode
    OTP_RESEND_COOLDOWN_MS: 60 * 1000,  // jeda minta OTP ulang
    OTP_MAX_PER_HOUR: 5,                // batas kirim OTP per nomor per jam

    SESSION_TTL_MS: 30 * 60 * 1000,     // sesi bilik suara setelah OTP valid

    // Batas waktu TPS Digital: sehari sebelum Pilkades 10 Desember 2026.
    // Harus sama dengan VOTING_DEADLINE_ISO di index.html.
    VOTING_DEADLINE_ISO: '2026-12-09T23:59:59+07:00',
    VOTING_CLOSED_MESSAGE: 'TPS Digital telah ditutup (9 Desember 2026). Pendaftaran & pemungutan suara tidak lagi dilayani.',

    DISCLAIMER: 'Survei/polling hiburan warga, bukan pemilihan resmi.'
});
