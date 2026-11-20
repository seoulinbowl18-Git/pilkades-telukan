'use strict';

const config = require('./config');

const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const PHOTO_URL_RE = /^(https:\/\/|\/)[^\s"'<>\\]{1,500}$/;

function cleanLine(value, maxLen) {
    return String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLen);
}

/**
 * Validasi perubahan profil dari Panel Panitia. Hanya field yang dikirim yang diubah.
 * photo: '' / null = kembali ke avatar bawaan; URL https:// atau path /...; atau data:image (≤ 200 KB).
 * @returns {{ ok: boolean, changes?: object, error?: string }}
 */
function validateCandidateUpdate(body) {
    const changes = {};

    if (body.name !== undefined) {
        const name = cleanLine(body.name, 80);
        if (name.length < 2) return { ok: false, error: 'Nama kandidat minimal 2 karakter.' };
        changes.name = name;
    }
    if (body.tagline !== undefined) {
        const tagline = cleanLine(body.tagline, 120);
        if (!tagline) return { ok: false, error: 'Slogan tidak boleh kosong.' };
        changes.tagline = tagline;
    }
    if (body.visi !== undefined) {
        const visi = cleanLine(body.visi, 500);
        if (visi.length < 5) return { ok: false, error: 'Visi minimal 5 karakter.' };
        changes.visi = visi;
    }
    if (body.misi !== undefined) {
        if (!Array.isArray(body.misi)) return { ok: false, error: 'Misi harus berupa daftar.' };
        const misi = body.misi.map(function (m) { return cleanLine(m, 200); }).filter(Boolean).slice(0, 6);
        if (!misi.length) return { ok: false, error: 'Misi minimal 1 butir.' };
        changes.misi = misi;
    }
    if (body.photo !== undefined) {
        const photo = body.photo == null ? '' : String(body.photo).trim();
        if (photo === '') {
            changes.photo = null;
        } else if (DATA_URL_RE.test(photo)) {
            const bytes = Math.floor((photo.length - photo.indexOf(',') - 1) * 3 / 4);
            if (bytes > config.CANDIDATE_PHOTO_MAX_BYTES) {
                return { ok: false, error: 'Ukuran foto terlalu besar (maks ' + Math.round(config.CANDIDATE_PHOTO_MAX_BYTES / 1024) + ' KB setelah kompresi).' };
            }
            changes.photo = photo;
        } else if (PHOTO_URL_RE.test(photo)) {
            changes.photo = photo;
        } else {
            return { ok: false, error: 'Foto harus berupa URL https://, path /..., atau gambar JPG/PNG/WEBP.' };
        }
    }

    if (!Object.keys(changes).length) return { ok: false, error: 'Tidak ada perubahan yang dikirim.' };
    return { ok: true, changes: changes };
}

function toPublicCandidate(doc) {
    return {
        kandidat_id: doc.kandidat_id,
        nomor: doc.nomor,
        name: doc.name,
        tagline: doc.tagline,
        visi: doc.visi,
        misi: Array.isArray(doc.misi) ? doc.misi : [],
        photo: doc.photo || null,
        updated_at: doc.updated_at instanceof Date ? doc.updated_at.toISOString() : (doc.updated_at || null)
    };
}

module.exports = { validateCandidateUpdate, toPublicCandidate };
