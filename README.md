# E-Pilkades Digital — Kelurahan Telukan, Grogol (Periode 2026–2034)

Web app PWA polling warga dengan registrasi Nomor WhatsApp, OTP WhatsApp (via [Fonnte](https://fonnte.com)), bilik suara 3 kandidat, statistik hasil real-time, dan Panel Panitia (PIN demo `1234`). Data tersimpan di **MongoDB Atlas**.

> ⚠️ **Disclaimer:** Aplikasi ini **hanya survei/polling hiburan warga**, **bukan pemilihan resmi**. Hasilnya tidak memiliki kekuatan hukum apa pun.

---

## Fitur & Mode Data

Aplikasi otomatis memilih mode saat dibuka (status tampil di banner atas halaman):

| Mode | Kapan aktif | Penyimpanan | OTP |
|---|---|---|---|
| **Mode Online** | `/api/health` siap: `MONGODB_URI` & `FONNTE_TOKEN` diatur dan MongoDB terhubung | MongoDB Atlas | 6 digit, dikirim ke WhatsApp via Fonnte, berlaku 5 menit |
| **Mode Demo Lokal** | Env belum diatur, server tidak terjangkau, file dibuka langsung, atau dipilih manual | `localStorage` browser | Simulasi `KADES-XXXX` + tombol Verifikasi Instan |

Pengunjung bisa berpindah mode lewat tombol di banner. Fitur simulasi (1-klik coblos, +10 suara acak, reset data) hanya berjalan di Mode Demo sehingga tidak mengotori data MongoDB.

**Keamanan Mode Online**
- `FONNTE_TOKEN` & `MONGODB_URI` hanya dibaca di server (folder `api/`), tidak pernah dikirim ke browser.
- OTP disimpan sebagai **hash SHA-256**, maksimal 5x salah input, dan jeda kirim ulang 60 detik (maksimal 5 OTP per nomor per jam).
- Setelah OTP valid, server memberi *session token* (berlaku 30 menit) yang wajib dipakai saat mencoblos.
- **1 Nomor WA = 1 suara** dijamin oleh *unique index* `suara.no_wa`, termasuk saat ada request ganda bersamaan.
- `GET /api/results` publik hanya mengembalikan angka agregat. Daftar pemilih (nama, nomor WA) hanya dikirim jika header `x-admin-pin` benar.

---

## Struktur File

```
.
├── index.html            # Seluruh frontend (HTML + Tailwind CDN + JS), PWA
├── api/                  # Vercel Serverless Functions (Node.js)
│   ├── health.js         # GET  /api/health     → status konfigurasi & koneksi
│   ├── send-otp.js       # POST /api/send-otp   → simpan pemilih + kirim OTP via Fonnte
│   ├── verify-otp.js     # POST /api/verify-otp → cek OTP, set is_verified, beri session token
│   ├── vote.js           # POST /api/vote       → rekam 1 suara per nomor WA
│   └── results.js        # GET  /api/results    → rekap suara (+ daftar pemilih untuk panitia)
├── lib/
│   ├── mongodb.js        # Koneksi MongoDB ber-cache global (aman untuk serverless) + index koleksi
│   ├── fonnte.js         # Kirim pesan WhatsApp via https://api.fonnte.com/send
│   ├── http.js           # Helper JSON response, validasi, normalisasi nomor WA (62...)
│   └── config.js         # Konstanta: ID kandidat, masa berlaku OTP, batas percobaan, dll.
├── package.json          # Dependency: mongodb
├── .env.example          # Contoh environment variables
└── README.md
```

### Koleksi MongoDB (dibuat otomatis saat request pertama)

| Koleksi | Field utama | Index |
|---|---|---|
| `pemilih` | `nama_lengkap`, `no_wa` (format `62...`), `rt_rw`, `is_verified`, `verified_at`, `has_voted`, `voted_at`, `created_at` | `no_wa` **unik** |
| `otp_verifications` | `no_wa`, `otp_hash`, `expires_at`, `consumed_at`, `attempt_count`, `created_at` | `no_wa + created_at`, TTL `expires_at` (dihapus otomatis 1 hari setelah kedaluwarsa) |
| `suara` | `no_wa`, `kandidat_id` (1/2/3), `receipt_id`, `created_at` | `no_wa` **unik**, `kandidat_id` |

---

## 1. Membuat Cluster & Connection String di MongoDB Atlas

1. Masuk ke <https://cloud.mongodb.com> dan buat Project baru (misalnya `pilkades-telukan`).
2. **Create Cluster**: pilih paket **M0 (Free)** dan region terdekat (misalnya *Singapore / ap-southeast-1*).
3. **Database Access → Add New Database User**:
   - Metode *Password*. Buat username & password yang kuat; hindari karakter `@ : / ?`, atau gunakan URL-encode.
   - Role: **Read and write to any database**.
4. **Network Access → Add IP Address**: pilih **Allow Access from Anywhere** (`0.0.0.0/0`). Ini diperlukan karena IP Vercel Serverless berubah-ubah.
5. **Database → Connect → Drivers → Node.js**, lalu salin connection string, contoh:
   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
   Ganti `USERNAME` dan `PASSWORD` dengan user yang dibuat di langkah 3.
6. Database `pilkades_telukan` dan ketiga koleksinya akan terbentuk otomatis saat aplikasi pertama kali dipakai.

## 2. Menyiapkan Token Fonnte

1. Daftar/masuk di <https://md.fonnte.com>, lalu **Add Device** dan scan QR code dengan WhatsApp yang akan mengirim OTP.
2. Pastikan status device **Connected**.
3. Salin **Token** device tersebut. Token ini menjadi nilai `FONNTE_TOKEN`.

## 3. Mengisi Environment Variables di Vercel

Buka project **pilkades-telukan-grogol** di Vercel, lalu **Settings → Environment Variables**. Tambahkan untuk environment **Production** (dan Preview jika perlu):

| Name | Value | Wajib |
|---|---|---|
| `MONGODB_URI` | Connection string dari MongoDB Atlas | ✅ |
| `MONGODB_DB` | `pilkades_telukan` (default jika dikosongkan) | opsional |
| `FONNTE_TOKEN` | Token device Fonnte | ✅ |
| `ADMIN_PIN` | PIN Panel Panitia untuk API (default `1234`) | opsional, **disarankan** |

> 🔐 PIN demo `1234` tertulis terbuka di halaman. Siapa pun yang memakainya bisa melihat nama & nomor WA pemilih lewat Panel Panitia. Jika aplikasi dipakai warga sungguhan, isi `ADMIN_PIN` dengan PIN rahasia lalu bagikan hanya ke panitia. Tombol "Isi PIN Demo 1234" tidak akan berfungsi lagi, dan itu memang disengaja.

Setelah menyimpan env, lakukan **Redeploy** (Deployments → deployment terbaru → ⋯ → Redeploy), karena env baru hanya terbaca oleh deployment baru.

Setelan build project (Settings → Build & Deployment):
- Framework Preset: **Other**
- Build Command: *(kosong)*
- Output Directory: *(kosong / root)*
- Install Command: *(default `npm install`)*

## 4. Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env.local   # isi nilai asli
npx vercel dev               # http://localhost:3000 (frontend + /api)
```

Jika `index.html` dibuka langsung tanpa server (atau dengan `python3 -m http.server`), aplikasi otomatis berjalan di **Mode Demo Lokal**.

## 5. Verifikasi Setelah Push ke `main`

1. **Vercel → Deployments**: deployment teratas berstatus **Ready**, berasal dari branch `main` dengan commit terbaru.
2. Buka `https://<domain-anda>/api/health`. Hasil yang diharapkan:
   ```json
   { "mongodb_configured": true, "mongodb_connected": true, "fonnte_configured": true, "online_ready": true, "missing_env": [] }
   ```
   - `missing_env` berisi nama variabel berarti env belum diatur, atau deployment belum di-redeploy.
   - `mongodb_connected: false` berarti ada yang salah di connection string, user/password, atau Network Access Atlas.
3. Buka halaman utama. Banner hijau **"Mode Online Aktif"** harus muncul.
4. **Daftar WA**: isi nama, nomor WA aktif, dan RT/RW. Pesan OTP harus masuk ke WhatsApp. Masukkan OTP, lalu klik **Lanjut ke Bilik Suara**, pilih kandidat, dan konfirmasi. Tanda bukti `VOTE-XXXXXXXX` akan tampil.
5. Coba daftar ulang dengan nomor yang sama. Harus muncul pesan *"sudah menggunakan hak pilih"*.
6. **Hasil**: total suara bertambah. **Panitia**: masukkan PIN, dan daftar pemilih dari MongoDB akan tampil.
7. **MongoDB Atlas → Browse Collections → `pilkades_telukan`**: periksa dokumen di `pemilih`, `otp_verifications` (berisi `otp_hash`, bukan kode asli), dan `suara`.
8. Jika ada error, buka **Vercel → Deployments → (deployment) → Functions / Logs** untuk melihat log `[send-otp]`, `[mongodb]`, atau `[api]`.
