'use strict';

module.exports = Object.freeze({
    // Database MongoDB khusus aplikasi ini. Bisa diganti via env MONGODB_DB.
    DEFAULT_DB_NAME: 'pilkades_telukan',

    // Koleksi yang dipakai (dibuat & diindeks otomatis oleh lib/mongodb.js)
    COLLECTIONS: Object.freeze({
        PEMILIH: 'pemilih',
        OTP: 'otp_verifications',
        SUARA: 'suara',
        PESAN: 'pesan_warga',
        KANDIDAT: 'kandidat'
    }),

    // Pesan & harapan warga (hanya untuk pemilih yang sudah mencoblos)
    MESSAGE_MIN_LENGTH: 3,
    MESSAGE_MAX_LENGTH: 240,
    MESSAGE_MAX_PER_VOTER: 3,           // maksimal pesan per pemilih (termasuk yang dihapus panitia)
    MESSAGE_COOLDOWN_MS: 60 * 1000,     // jeda antar pesan dari pemilih yang sama
    MESSAGES_PUBLIC_LIMIT: 50,          // jumlah pesan terbaru yang ditampilkan publik

    // Profil bawaan 3 kandidat (disalin ke koleksi `kandidat` saat pertama dipakai)
    KANDIDAT_DEFAULTS: Object.freeze([
        {
            "kandidat_id": 1,
            "nomor": "01",
            "name": "Sriyanto",
            "tagline": "Membangun Desa Mandiri, Transparan & Sejahtera",
            "visi": "Terwujudnya Kelurahan Telukan, Grogol yang religius, transparan dalam anggaran, dan mandiri secara ekonomi berbasis potensi lokal.",
            "misi": [
                "Digitalisasi pelayanan administrasi kelurahan 24 jam tanpa pungli.",
                "Pemberdayaan UMKM warga dan bantuan modal bergulir tiap RW.",
                "Perbaikan infrastruktur jalan lingkungan dan saluran irigasi pertanian."
            ]
        },
        {
            "kandidat_id": 2,
            "nomor": "02",
            "name": "Hesti Kartika Asmara",
            "tagline": "Bersama Warga Wujudkan Desa Cerdas & Peduli",
            "visi": "Menjadikan Kelurahan Telukan, Grogol sebagai wilayah percontohan yang unggul di bidang pendidikan, kesehatan ibu-anak, dan lingkungan hijau.",
            "misi": [
                "Program beasiswa prestasi untuk pelajar kurang mampu di setiap dusun.",
                "Peningkatan layanan Posyandu lansia dan balita serta ambulans desa siaga.",
                "Pengelolaan bank sampah terpadu berbasis RT/RW."
            ]
        },
        {
            "kandidat_id": 3,
            "nomor": "03",
            "name": "Hj Trihadi Hari",
            "tagline": "Inovasi Pemuda untuk Kemajuan Ekonomi Desa",
            "visi": "Akselerasi pembangunan infrastruktur modern, ketahanan pangan, dan penciptaan lapangan kerja bagi generasi muda Kelurahan Telukan.",
            "misi": [
                "Pelatihan keterampilan digital dan kewirausahaan bagi karang taruna.",
                "Revitalisasi pasar desa dan pusat kuliner malam warga.",
                "Pemasangan penerangan jalan umum (PJU) dan CCTV keamanan lingkungan."
            ]
        }
    ]),
    CANDIDATE_PHOTO_MAX_BYTES: 200 * 1024,  // batas foto data-URL (setelah kompresi di browser)

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
