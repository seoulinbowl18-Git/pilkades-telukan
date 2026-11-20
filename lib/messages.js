'use strict';

/**
 * Pembersihan & penyamaran untuk fitur Pesan Warga.
 * Logika yang sama (versi ringkas) ada di index.html untuk Mode Demo Lokal.
 */

const config = require('./config');

// Kata kasar umum yang disensor (huruf pertama dipertahankan)
const PROFANITY = [
    'anjing', 'anjir', 'bangsat', 'bajingan', 'babi', 'kontol', 'memek', 'ngentot', 'entot',
    'goblok', 'goblog', 'tolol', 'jancok', 'jancuk', 'cok', 'asu', 'kampret', 'tai', 'taik', 'keparat', 'brengsek', 'idiot'
];
const PROFANITY_RE = new RegExp('\\b(' + PROFANITY.join('|') + ')\\b', 'gi');
const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|id|net|org|xyz|co|io|me|ly|info|biz|site|online)\b)/i;
const PHONE_RE = /(\+?\d[\d\s.-]{7,}\d)/g;

/**
 * @returns {{ ok: boolean, text?: string, error?: string }}
 */
function sanitizeMessage(raw) {
    let text = String(raw == null ? '' : raw)
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (text.length > config.MESSAGE_MAX_LENGTH) {
        return { ok: false, error: 'Pesan terlalu panjang (maksimal ' + config.MESSAGE_MAX_LENGTH + ' karakter).' };
    }
    if (LINK_RE.test(text)) {
        return { ok: false, error: 'Pesan tidak boleh berisi tautan/website.' };
    }
    text = text
        .replace(PHONE_RE, '[nomor disembunyikan]')
        .replace(/(.)\1{5,}/g, '$1$1$1$1$1')
        .replace(PROFANITY_RE, function (w) { return w[0] + '*'.repeat(w.length - 1); });

    const letters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (text.length < config.MESSAGE_MIN_LENGTH || letters < 2) {
        return { ok: false, error: 'Pesan terlalu pendek (minimal ' + config.MESSAGE_MIN_LENGTH + ' karakter).' };
    }
    if (text.length > config.MESSAGE_MAX_LENGTH) {
        return { ok: false, error: 'Pesan terlalu panjang (maksimal ' + config.MESSAGE_MAX_LENGTH + ' karakter).' };
    }
    return { ok: true, text: text };
}

/** "Budi Santoso Wibowo" → "Budi S." ; nama kosong → "Warga Telukan" */
function maskDisplayName(fullName) {
    const parts = String(fullName || '').replace(/\(.*?\)/g, '').replace(/[^A-Za-zÀ-ÿ' .-]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Warga Telukan';
    const first = parts[0].slice(0, 16);
    const initial = parts.length > 1 ? ' ' + parts[parts.length - 1][0].toUpperCase() + '.' : '';
    return first.charAt(0).toUpperCase() + first.slice(1) + initial;
}

/** Bentuk publik: tanpa no_wa, receipt_id, atau token. */
function toPublicMessage(doc) {
    return {
        message_id: doc.message_id,
        nama: doc.nama_tampil,
        pesan: doc.pesan,
        created_at: doc.created_at instanceof Date ? doc.created_at.toISOString() : doc.created_at
    };
}

module.exports = { sanitizeMessage, maskDisplayName, toPublicMessage };
