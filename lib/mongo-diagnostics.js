'use strict';

/**
 * Normalisasi MONGODB_URI & diagnosis error koneksi MongoDB yang AMAN.
 *
 * Aturan keamanan modul ini:
 * - Tidak pernah mengembalikan / mencetak username, password, host, atau isi URI.
 * - Hanya mengembalikan kategori, kode error, nama opsi (tanpa nilai), dan petunjuk.
 * - Pesan error asli dari driver TIDAK diteruskan, karena bisa berisi nama host.
 */

const UNRESERVED = /[A-Za-z0-9\-._~]/;
const HOST_LIST = /^[A-Za-z0-9.\-]+(:\d+)?(,[A-Za-z0-9.\-]+(:\d+)?)*$/;
const PLACEHOLDER = /<\s*(db_password|password|password_baru|cluster_host|username|user)\s*>/i;

/**
 * Percent-encode karakter yang belum di-encode. Urutan %XX yang valid dibiarkan
 * (dianggap sudah di-encode), sehingga aman dipanggil berulang (idempoten).
 */
function encodeUserInfoPart(value) {
    const chars = Array.from(value);
    let out = '';
    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (UNRESERVED.test(ch) || '!$&\'()*+,;='.indexOf(ch) !== -1) {
            out += ch;
        } else if (ch === '%' && /^[0-9A-Fa-f]{2}$/.test((chars[i + 1] || '') + (chars[i + 2] || ''))) {
            out += '%' + chars[i + 1] + chars[i + 2];
            i += 2;
        } else {
            out += encodeURIComponent(ch);
        }
    }
    return out;
}

/**
 * Membersihkan MONGODB_URI hasil copy-paste ke Vercel dan mengembalikan ringkasan aman.
 * @returns {{ uri: string|null, clientOptions: object, summary: object, issues: Array }}
 */
function prepareMongoUri(raw, opts) {
    const options = opts || {};
    const summary = {
        scheme: null,
        srv: false,
        credentials_present: false,
        password_present: false,
        host_count: 0,
        db_in_uri: false,
        db_in_uri_matches_mongodb_db: null,
        uri_options: [],
        auth_source: null,
        normalized: {
            trimmed_whitespace: false,
            stripped_quotes: false,
            stripped_env_prefix: false,
            username_reencoded: false,
            password_reencoded: false
        }
    };
    const issues = [];
    const clientOptions = {};

    let s = String(raw == null ? '' : raw);
    const trimmed = s.trim();
    if (trimmed !== s) summary.normalized.trimmed_whitespace = true;
    s = trimmed;

    if (/^MONGODB_URI\s*=/i.test(s)) {
        s = s.replace(/^MONGODB_URI\s*=\s*/i, '').trim();
        summary.normalized.stripped_env_prefix = true;
    }
    if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === '\'' && s[s.length - 1] === '\''))) {
        s = s.slice(1, -1).trim();
        summary.normalized.stripped_quotes = true;
    }

    if (!s) {
        issues.push({ code: 'URI_EMPTY', hint: 'MONGODB_URI kosong.' });
        return { uri: null, clientOptions: clientOptions, summary: summary, issues: issues };
    }

    if (/\s/.test(s)) {
        issues.push({ code: 'URI_INTERNAL_WHITESPACE', hint: 'MONGODB_URI mengandung spasi/baris baru di tengah. Salin ulang dalam 1 baris tanpa spasi.' });
    }
    if (PLACEHOLDER.test(s)) {
        issues.push({ code: 'URI_PLACEHOLDER', hint: 'MONGODB_URI masih berisi placeholder seperti <db_password> / <PASSWORD_BARU> / <CLUSTER_HOST>. Ganti dengan nilai asli dan HAPUS tanda < >.' });
    }

    const m = s.match(/^(mongodb(?:\+srv)?):\/\/(.*)$/i);
    if (!m) {
        issues.push({ code: 'URI_INVALID_SCHEME', hint: 'MONGODB_URI harus diawali mongodb+srv:// atau mongodb://.' });
        return { uri: null, clientOptions: clientOptions, summary: summary, issues: issues };
    }
    const scheme = m[1].toLowerCase();
    const rest = m[2];
    summary.scheme = scheme;
    summary.srv = scheme === 'mongodb+srv';

    // Cari '@' pemisah kredensial & host: '@' terakhir yang diikuti daftar host valid.
    let atIndex = -1;
    for (let i = rest.lastIndexOf('@'); i >= 0; i = i > 0 ? rest.lastIndexOf('@', i - 1) : -1) {
        const after = rest.slice(i + 1);
        const hostPart = after.split(/[/?]/)[0];
        if (HOST_LIST.test(hostPart)) { atIndex = i; break; }
        if (i === 0) break;
    }

    let userInfo = null;
    let afterAuth = rest;
    if (atIndex >= 0) {
        userInfo = rest.slice(0, atIndex);
        afterAuth = rest.slice(atIndex + 1);
    } else if (rest.indexOf('@') !== -1) {
        issues.push({ code: 'URI_HOST_UNPARSEABLE', hint: 'Bagian host cluster tidak terbaca. Pastikan format ...@<cluster>.mongodb.net/... dan password tidak memutus URI.' });
        atIndex = rest.lastIndexOf('@');
        userInfo = rest.slice(0, atIndex);
        afterAuth = rest.slice(atIndex + 1);
    }

    const hostPart = afterAuth.split(/[/?]/)[0];
    summary.host_count = hostPart ? hostPart.split(',').length : 0;
    if (summary.srv && (summary.host_count !== 1 || /:\d+$/.test(hostPart))) {
        issues.push({ code: 'URI_SRV_HOST_INVALID', hint: 'Format mongodb+srv:// harus berisi tepat 1 host tanpa port (contoh cluster0.abcde.mongodb.net).' });
    }

    const pathAndQuery = afterAuth.slice(hostPart.length);
    const qIndex = pathAndQuery.indexOf('?');
    const pathPart = qIndex >= 0 ? pathAndQuery.slice(0, qIndex) : pathAndQuery;
    const queryPart = qIndex >= 0 ? pathAndQuery.slice(qIndex + 1) : '';
    const dbInPath = pathPart.replace(/^\//, '');
    summary.db_in_uri = dbInPath.length > 0;
    if (summary.db_in_uri && options.dbName) {
        let decodedDb = dbInPath;
        try { decodedDb = decodeURIComponent(dbInPath); } catch (e) { /* biarkan */ }
        summary.db_in_uri_matches_mongodb_db = decodedDb === options.dbName;
    }

    const optionNames = queryPart
        ? queryPart.split('&').map(function (kv) { return kv.split('=')[0]; }).filter(Boolean)
        : [];
    summary.uri_options = optionNames;
    const hasAuthSource = optionNames.some(function (n) { return n.toLowerCase() === 'authsource'; });

    let rebuiltUserInfo = '';
    if (userInfo !== null) {
        summary.credentials_present = true;
        const colon = userInfo.indexOf(':');
        const user = colon >= 0 ? userInfo.slice(0, colon) : userInfo;
        const pass = colon >= 0 ? userInfo.slice(colon + 1) : null;
        summary.password_present = pass !== null && pass.length > 0;

        if (!user) issues.push({ code: 'URI_USERNAME_EMPTY', hint: 'Username kosong di MONGODB_URI.' });
        if (!summary.password_present) issues.push({ code: 'URI_PASSWORD_EMPTY', hint: 'Password kosong di MONGODB_URI (format user:password@host).' });
        if (/[<>]/.test(userInfo) && !PLACEHOLDER.test(s)) {
            issues.push({ code: 'URI_ANGLE_BRACKETS', hint: 'Username/password mengandung tanda < atau >. Biasanya ini sisa placeholder Atlas. Hapus tanda < > di sekitar password.' });
        }

        const encUser = encodeUserInfoPart(user);
        const encPass = pass === null ? null : encodeUserInfoPart(pass);
        summary.normalized.username_reencoded = encUser !== user;
        summary.normalized.password_reencoded = encPass !== null && encPass !== pass;
        if (pass !== null && /%[0-9A-Fa-f]{2}/.test(pass)) {
            issues.push({ code: 'URI_PASSWORD_HAS_PERCENT', hint: 'Password berisi pola %XX dan dianggap sudah URL-encoded. Jika password asli memang mengandung %, encode menjadi %25, atau ganti dengan password alfanumerik.' });
        }
        rebuiltUserInfo = encUser + (encPass === null ? '' : ':' + encPass) + '@';

        // User Atlas selalu dibuat di database `admin`. Path /pilkades_telukan di URI
        // non-SRV akan dipakai driver sebagai authSource dan berakibat "bad auth".
        if (!hasAuthSource) {
            clientOptions.authSource = (process.env.MONGODB_AUTH_SOURCE || '').trim() || 'admin';
            summary.auth_source = clientOptions.authSource + ' (default aplikasi)';
        } else {
            summary.auth_source = 'diatur di URI';
        }
    } else {
        issues.push({ code: 'URI_NO_CREDENTIALS', hint: 'MONGODB_URI tidak berisi username:password@. Atlas membutuhkan kredensial user database.' });
    }

    const uri = scheme + '://' + rebuiltUserInfo + afterAuth;
    return { uri: uri, clientOptions: clientOptions, summary: summary, issues: issues };
}

const CATEGORY_HINTS = {
    AUTH_FAILED: 'Atlas menolak username/password ("bad auth"). Network & IP Access List sudah OK. Cek: (1) password user di Database Access sama persis (reset & salin ulang, tunggu ±1 menit); (2) tanda < > placeholder sudah dihapus; (3) user dibuat di Project Atlas yang sama dengan cluster; (4) setelah mengubah env, lakukan Redeploy di Vercel; (5) jika password berisi karakter khusus, ganti dengan password alfanumerik.',
    NOT_AUTHORIZED: 'Login berhasil, tetapi user tidak punya izin di database ini. Beri role readWrite pada database pilkades_telukan (atau "Read and write to any database") di Atlas → Database Access.',
    DNS_SRV_FAILED: 'Host cluster tidak ditemukan (DNS/SRV gagal). Periksa nama host setelah tanda @ di MONGODB_URI (contoh cluster0.abcde.mongodb.net), dan pastikan cluster tidak dihapus atau di-pause.',
    TLS_FAILED: 'Koneksi TLS/SSL ke Atlas gagal. Jangan menambahkan tls=false/ssl=false di URI.',
    NETWORK_TIMEOUT: 'Server Atlas tidak bisa dijangkau (timeout). Pastikan IP Access List berisi 0.0.0.0/0 dan status cluster Active (tidak di-pause).',
    URI_PLACEHOLDER: 'MONGODB_URI masih berisi placeholder (<db_password>, <PASSWORD_BARU>, atau <CLUSTER_HOST>). Ganti dengan password & host asli dan hapus tanda < >, lalu Redeploy.',
    URI_INVALID: 'Format MONGODB_URI tidak valid. Biasanya ada karakter khusus di password yang belum di-encode, atau URI terpotong. Salin ulang connection string dari Atlas.',
    ENV_MISSING: 'MONGODB_URI belum diatur di Vercel Environment Variables.',
    UNKNOWN: 'Error MongoDB tidak dikenal. Lihat kolom code/codeName dan log fungsi di Vercel.'
};

function collectCodes(err) {
    // Telusuri err, err.cause, dan err.reason.servers untuk menemukan error akar.
    const found = [];
    const seen = new Set();
    function walk(e, depth) {
        if (!e || typeof e !== 'object' || seen.has(e) || depth > 4) return;
        seen.add(e);
        found.push(e);
        if (e.cause) walk(e.cause, depth + 1);
        if (e.reason && e.reason.servers && typeof e.reason.servers.forEach === 'function') {
            e.reason.servers.forEach(function (desc) { if (desc && desc.error) walk(desc.error, depth + 1); });
        }
    }
    walk(err, 0);
    return found;
}

/**
 * Mengubah error driver MongoDB menjadi ringkasan aman untuk response & log.
 */
function diagnoseMongoError(err) {
    const chain = collectCodes(err);
    const root = chain.find(function (e) { return e.code != null || e.codeName; }) || err || {};
    const text = chain.map(function (e) { return String(e.message || ''); }).join(' | ').toLowerCase();
    const names = chain.map(function (e) { return String(e.name || ''); });
    const codes = chain.map(function (e) { return e.code; });
    const codeNames = chain.map(function (e) { return e.codeName; });

    let category = 'UNKNOWN';
    if (err && (err.code === 'ENV_MISSING' || err.name === 'ConfigError')) {
        category = 'ENV_MISSING';
    } else if (codes.indexOf(18) !== -1 || codes.indexOf(8000) !== -1 || codeNames.indexOf('AuthenticationFailed') !== -1 ||
        text.indexOf('bad auth') !== -1 || text.indexOf('authentication failed') !== -1) {
        category = 'AUTH_FAILED';
    } else if (codes.indexOf(13) !== -1 || codeNames.indexOf('Unauthorized') !== -1 || text.indexOf('not authorized') !== -1) {
        category = 'NOT_AUTHORIZED';
    } else if (names.indexOf('MongoParseError') !== -1 || names.indexOf('MongoInvalidArgumentError') !== -1 ||
        text.indexOf('unescaped') !== -1 || text.indexOf('invalid scheme') !== -1 || text.indexOf('uri must include') !== -1) {
        category = 'URI_INVALID';
    } else if (text.indexOf('querysrv') !== -1 || text.indexOf('querytxt') !== -1 || codes.indexOf('ENOTFOUND') !== -1 ||
        codes.indexOf('ESERVFAIL') !== -1 || codes.indexOf('ENODATA') !== -1 || codes.indexOf('EREFUSED') !== -1) {
        category = 'DNS_SRV_FAILED';
    } else if (text.indexOf('ssl') !== -1 || text.indexOf('tls') !== -1 || text.indexOf('certificate') !== -1) {
        category = 'TLS_FAILED';
    } else if (names.some(function (n) { return /ServerSelection|Network|Timeout/.test(n); }) ||
        codes.indexOf('ETIMEDOUT') !== -1 || codes.indexOf('ECONNREFUSED') !== -1 || codes.indexOf('ECONNRESET') !== -1) {
        category = 'NETWORK_TIMEOUT';
    }

    if (err && err.__uriIssues && err.__uriIssues.some(function (i) { return i.code === 'URI_PLACEHOLDER'; })) {
        category = 'URI_PLACEHOLDER';
    }

    const out = {
        category: category,
        stage: (err && err.__mongoStage) || null,
        error_name: err && err.name ? String(err.name) : null,
        code: root.code != null ? root.code : null,
        codeName: root.codeName || null,
        hint: CATEGORY_HINTS[category]
    };
    if (err && err.__uriIssues && err.__uriIssues.length) {
        out.uri_issues = err.__uriIssues.map(function (i) { return i.code; });
    }
    return out;
}

function isMongoError(err) {
    if (!err) return false;
    const name = String(err.name || '');
    return name.indexOf('Mongo') === 0 || Boolean(err.__mongoStage);
}

module.exports = {
    prepareMongoUri,
    diagnoseMongoError,
    isMongoError,
    encodeUserInfoPart,
    CATEGORY_HINTS
};
