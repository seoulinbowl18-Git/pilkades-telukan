# E-Pilkades Digital — Kelurahan Telukan, Grogol (Periode 2026–2034)

Web app PWA polling warga dengan registrasi Nomor WhatsApp, OTP WhatsApp (via [Fonnte](https://fonnte.com)), bilik suara 3 kandidat, statistik hasil real-time, dan Panel Panitia (PIN demo `1234`). Data tersimpan di **MongoDB Atlas**.

> ⚠️ **Disclaimer:** Aplikasi ini **hanya survei/polling hiburan warga**, **bukan pemilihan resmi**. Hasilnya tidak memiliki kekuatan hukum apa pun.

---

## Fitur & Mode Data

Aplikasi otomatis memilih mode saat dibuka (tanpa banner di halaman; status bisa dicek di `/api/health`):

| Mode | Kapan aktif | Penyimpanan | OTP |
|---|---|---|---|
| **Mode Online** | `/api/health` siap: `MONGODB_URI` & `FONNTE_TOKEN` diatur dan MongoDB terhubung | MongoDB Atlas | 6 digit, dikirim ke WhatsApp via Fonnte, berlaku 5 menit |
| **Mode Demo Lokal** | Env belum diatur, server tidak terjangkau, file dibuka langsung, atau dipilih manual | `localStorage` browser | Simulasi `KADES-XXXX` + tombol Verifikasi Instan |

Mode dipilih otomatis berdasarkan `/api/health`. Fitur simulasi (1-klik coblos, +10 suara acak, reset data) hanya berjalan di Mode Demo sehingga tidak mengotori data MongoDB.

**Keamanan Mode Online**
- `FONNTE_TOKEN` & `MONGODB_URI` hanya dibaca di server (folder `api/`), tidak pernah dikirim ke browser.
- OTP disimpan sebagai **hash SHA-256**, maksimal 5x salah input, dan jeda kirim ulang 60 detik (maksimal 5 OTP per nomor per jam).
- Setelah OTP valid, server memberi *session token* (berlaku 30 menit) yang wajib dipakai saat mencoblos.
- **1 Nomor WA = 1 suara** dijamin oleh *unique index* `suara.no_wa`, termasuk saat ada request ganda bersamaan.
- `GET /api/results` publik hanya mengembalikan angka agregat. Daftar pemilih (nama, nomor WA) hanya dikirim jika header `x-admin-pin` benar.

---

## Pesan & Harapan Warga

- Setelah mencoblos, panel tanda bukti menampilkan form **"Pesan & Harapan untuk Pilkades Telukan"** (3–240 karakter). Papan pesan ada di tab **Hasil** (50 terbaru) dan versi ringkas di panel tanda bukti. Papan diperbarui otomatis tiap ±12 detik saat halaman terlihat.
- **Hanya pemilih yang sudah mencoblos** yang bisa mengirim pesan. `/api/vote` memberi `message_token` rahasia (server hanya menyimpan hash-nya), dan token itu wajib dikirim bersama `receipt_id` ke `POST /api/messages`.
- **Privasi:** daftar publik hanya berisi `nama` tersamar (mis. "Budi S."), isi pesan, dan waktu. Nomor WA, kode bukti, dan token tidak pernah dikirim ke publik.
- **Penyaringan:** tautan/website ditolak. Nomor telepon diganti `[nomor disembunyikan]`, kata kasar umum disensor, tanda `< >` dibuang, dan huruf berulang dipangkas.
- **Anti-spam:** maksimal 3 pesan per pemilih (pesan yang dihapus tetap dihitung), jeda 60 detik antar pesan, dan pesan identik ditolak.
- **Moderasi:** Panel Panitia → *Moderasi Pesan Warga* → **Hapus** (`DELETE /api/messages?id=…` dengan header `x-admin-pin`). Pesan disembunyikan dari publik (`deleted_at` diisi), bukan dihapus permanen.
- **Mode Demo Lokal:** pesan disimpan di `localStorage` dengan aturan yang sama.

## Batas Waktu TPS Digital

- Hitung mundur di Beranda menuju **9 Desember 2026 pukul 23:59:59 WIB** (`2026-12-09T23:59:59+07:00`), sehari sebelum Pilkades 10 Desember 2026. Tampilannya HARI / JAM / MENIT / DETIK.
- Setelah batas lewat, semua kotak menampilkan `00` dengan keterangan *"TPS Digital telah ditutup (9 Desember 2026)"*. Registrasi, verifikasi OTP, dan pemungutan suara ditolak, baik di halaman maupun di server (`/api/send-otp`, `/api/verify-otp`, `/api/vote` → `403 VOTING_CLOSED`). Halaman Hasil dan Panel Panitia tetap bisa dibuka.
- Nilai batas ada di `lib/config.js` (`VOTING_DEADLINE_ISO`) dan `index.html` (`VOTING_DEADLINE_ISO`). Jika diubah, ubah keduanya. `/api/health` menampilkan `voting_deadline` dan `voting_closed`.

## Struktur File

```
.
├── index.html            # Seluruh frontend (HTML + Tailwind CDN + JS), PWA
├── assets/               # logo-sukoharjo*.png (ikon), hero-kantor-telukan.jpg (latar banner hero, ±1600x700 px)
├── api/                  # Vercel Serverless Functions (Node.js)
│   ├── health.js         # GET  /api/health     → status konfigurasi & koneksi
│   ├── send-otp.js       # POST /api/send-otp   → simpan pemilih + kirim OTP via Fonnte
│   ├── verify-otp.js     # POST /api/verify-otp → cek OTP, set is_verified, beri session token
│   ├── vote.js           # POST /api/vote       → rekam 1 suara per nomor WA
│   ├── results.js        # GET  /api/results    → rekap suara (+ daftar pemilih untuk panitia)
│   └── messages.js       # GET/POST/DELETE /api/messages → pesan & harapan warga
├── lib/
│   ├── mongodb.js        # Koneksi MongoDB ber-cache global (aman untuk serverless) + index koleksi
│   ├── fonnte.js         # Kirim pesan WhatsApp via https://api.fonnte.com/send
│   ├── http.js           # Helper JSON response, validasi, normalisasi nomor WA (62...)
│   ├── messages.js       # Pembersihan teks pesan, penyamaran nama
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
| `suara` | `no_wa`, `kandidat_id` (1/2/3), `receipt_id`, `message_token_hash`, `created_at` | `no_wa` **unik**, `kandidat_id`, `receipt_id` unik |
| `pesan_warga` | `message_id`, `receipt_id`, `no_wa` (internal), `nama_tampil`, `pesan`, `created_at`, `deleted_at` | `message_id` unik, `deleted_at + created_at`, `receipt_id + created_at` |

---

## 1. Membuat Cluster, User `soraya_render` & Connection String di MongoDB Atlas

> 🔒 **Password database tidak boleh di-commit ke Git.** Password asli hanya diisi di **Vercel → Environment Variables**, atau di `.env.local` saat develop lokal (file ini sudah di-ignore oleh Git). Di repository hanya ada placeholder seperti `<PASSWORD_BARU>`. Jika password pernah terlanjur ter-commit atau dibagikan, segera **ganti password** user tersebut di Atlas.

1. Masuk ke <https://cloud.mongodb.com>, lalu buat Project (misalnya `pilkades-telukan`).
2. **Create Cluster**: pilih paket **M0 (Free)** dan region terdekat (misalnya *Singapore / ap-southeast-1*).
3. **Security → Database Access → Add New Database User**:
   - Authentication Method: *Password*.
   - Username: **`soraya_render`**.
   - Password: klik *Autogenerate Secure Password* (atau buat sendiri yang kuat), lalu simpan di password manager. Jangan tulis di kode atau chat.
   - Database User Privileges: **Read and write to any database**, atau lebih ketat: *Specific Privileges* → `readWrite` pada database `pilkades_telukan`.
4. **Security → Network Access (IP Access List) → Add IP Address**: pilih **Allow Access from Anywhere** sehingga tercatat **`0.0.0.0/0`**. Ini wajib karena IP Vercel Serverless berubah-ubah. Tanpa langkah ini, `/api/health` akan menunjukkan `mongodb_connected: false`.
5. **Database → Connect → Drivers → Node.js**: salin host cluster (bagian setelah `@`, misalnya `cluster0.abcde.mongodb.net`), lalu susun `MONGODB_URI` dengan format:
   ```
   mongodb+srv://soraya_render:<PASSWORD_BARU>@<CLUSTER_HOST>/pilkades_telukan?retryWrites=true&w=majority
   ```
   - Ganti `<PASSWORD_BARU>` dengan password user `soraya_render` dan `<CLUSTER_HOST>` dengan host cluster Anda.
   - Jika password mengandung karakter khusus `@ : / ? # [ ] %`, ubah dulu dengan URL-encode (misalnya `@` → `%40`).
   - Aplikasi otomatis memakai `authSource=admin` (tempat user Atlas dibuat) jika tidak ditulis di URI. Ini juga berlaku untuk format `mongodb://` non-SRV, yang tanpa ini akan login ke database `/pilkades_telukan` dan gagal "bad auth".
   - Spasi atau baris baru di awal/akhir, tanda kutip, prefix `MONGODB_URI=`, dan karakter khusus yang belum di-encode di username/password otomatis dirapikan di server tanpa mengubah env aslinya.
6. Aplikasi selalu memakai database dari `MONGODB_DB` (default **`pilkades_telukan`**). Database dan koleksi `pemilih`, `otp_verifications`, dan `suara` beserta index-nya dibuat otomatis oleh `lib/mongodb.js` saat request pertama, jadi tidak perlu dibuat manual.

## 2. Menyiapkan Token Fonnte

1. Daftar/masuk di <https://md.fonnte.com>, lalu **Add Device** dan scan QR code dengan WhatsApp yang akan mengirim OTP.
2. Pastikan status device **Connected**.
3. Salin **Token** device tersebut. Token ini menjadi nilai `FONNTE_TOKEN`.

## 3. Mengisi Environment Variables di Vercel

Buka project **pilkades-telukan-grogol** di Vercel, lalu **Settings → Environment Variables**. Tambahkan untuk environment **Production** (dan Preview jika perlu):

| Name | Value | Wajib |
|---|---|---|
| `MONGODB_URI` | `mongodb+srv://soraya_render:<PASSWORD_BARU>@<CLUSTER_HOST>/pilkades_telukan?retryWrites=true&w=majority` (isi password & host asli) | ✅ |
| `MONGODB_DB` | `pilkades_telukan` (default jika dikosongkan) | opsional |
| `FONNTE_TOKEN` | Token device Fonnte | ✅ |
| `ADMIN_PIN` | PIN Panel Panitia untuk API (default `1234`) | opsional, **disarankan** |
| `MONGODB_AUTH_SOURCE` | Database autentikasi user (default `admin`, standar Atlas) | opsional, jarang diperlukan |

Contoh lengkap (hanya placeholder) ada di [`.env.example`](.env.example). Centang *Sensitive* untuk `MONGODB_URI`, `FONNTE_TOKEN`, dan `ADMIN_PIN` agar nilainya tidak bisa dibaca ulang dari dashboard.

> 🔐 PIN demo `1234` tertulis terbuka di halaman. Siapa pun yang memakainya bisa melihat nama & nomor WA pemilih lewat Panel Panitia. Jika aplikasi dipakai warga sungguhan, isi `ADMIN_PIN` dengan PIN rahasia lalu bagikan hanya ke panitia. Tombol "Isi PIN Demo 1234" tidak akan berfungsi lagi, dan itu memang disengaja.

Setelah menyimpan env, lakukan **Redeploy** (Deployments → deployment terbaru → ⋯ → Redeploy), karena env baru hanya terbaca oleh deployment baru.

Setelan build project (Settings → Build & Deployment):
- Framework Preset: **Other**
- Build Command: *(kosong)*
- Output Directory: *(kosong / root)*
- Install Command: *(default `npm install`)*

## Diagnosis Koneksi MongoDB (`/api/health`)

Jika koneksi gagal, buka `https://<domain-anda>/api/health`. Respons **tidak pernah** berisi username, password, host, atau isi `MONGODB_URI`. Yang ditampilkan hanya kategori, kode error, dan petunjuk:

```json
"mongodb_error_detail": { "category": "AUTH_FAILED", "stage": "connect", "error_name": "MongoServerError", "code": 8000, "codeName": "AtlasError", "hint": "..." },
"mongodb_uri_check": { "summary": { "scheme": "mongodb+srv", "credentials_present": true, "auth_source": "admin (default aplikasi)", "normalized": { "trimmed_whitespace": true } }, "issues": [] }
```

| `category` | Arti | Tindakan |
|---|---|---|
| `AUTH_FAILED` | Atlas menolak username/password (`bad auth`, code 8000/18). Jaringan sudah OK. | Reset password user `soraya_render` di Atlas → Database Access, tunggu ±1 menit, salin ulang ke `MONGODB_URI` (hapus tanda `< >`), lalu Redeploy. Pastikan user dibuat di **Project yang sama** dengan cluster. |
| `NOT_AUTHORIZED` | Login berhasil tetapi user tidak punya izin (code 13). | Beri role `readWrite` pada `pilkades_telukan`. |
| `URI_PLACEHOLDER` | URI masih berisi `<db_password>` / `<PASSWORD_BARU>` / `<CLUSTER_HOST>`. | Ganti dengan nilai asli. |
| `URI_INVALID` | Format URI rusak atau terpotong. | Salin ulang connection string dari Atlas. |
| `DNS_SRV_FAILED` | Host cluster tidak ditemukan (`ENOTFOUND`, `querySrv`). | Periksa host setelah `@` dan pastikan cluster tidak dihapus atau di-pause. |
| `NETWORK_TIMEOUT` | Atlas tidak terjangkau (timeout / connection refused). | Cek IP Access List `0.0.0.0/0` dan status cluster *Active*. |
| `TLS_FAILED` | Handshake TLS gagal. | Jangan menambahkan `tls=false` / `ssl=false`. |

`stage` menunjukkan tahap kegagalan: `parse_uri`, `connect`, `create_indexes`, atau `ping`. `mongodb_uri_check.issues` berisi temuan format URI, misalnya `URI_ANGLE_BRACKETS`, `URI_PASSWORD_HAS_PERCENT`, atau `URI_SRV_HOST_INVALID`, masing-masing dengan petunjuknya.

## 4. Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env.local   # isi nilai asli (file ini di-ignore Git, jangan di-commit)
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
   - `mongodb_connected: false` berarti ada yang salah di connection string, password user `soraya_render`, atau IP Access List Atlas (harus ada `0.0.0.0/0`).
   - `mongodb_db` harus bernilai `pilkades_telukan`.
3. Buka halaman utama, lalu tab **Daftar WA**. Tombol registrasi harus bertuliskan **"Daftar & Kirim OTP ke WhatsApp"** (tanda Mode Online aktif).
4. **Daftar WA**: isi nama, nomor WA aktif, dan RT/RW. Pesan OTP harus masuk ke WhatsApp. Masukkan OTP, lalu klik **Lanjut ke Bilik Suara**, pilih kandidat, dan konfirmasi. Tanda bukti `VOTE-XXXXXXXX` akan tampil.
5. Coba daftar ulang dengan nomor yang sama. Harus muncul pesan *"sudah menggunakan hak pilih"*.
6. **Hasil**: total suara bertambah. **Panitia**: masukkan PIN, dan daftar pemilih dari MongoDB akan tampil.
7. **MongoDB Atlas → Browse Collections → `pilkades_telukan`**: periksa dokumen di `pemilih`, `otp_verifications` (berisi `otp_hash`, bukan kode asli), dan `suara`.
8. Jika ada error, buka **Vercel → Deployments → (deployment) → Functions / Logs** untuk melihat log `[send-otp]`, `[mongodb]`, atau `[api]`.
