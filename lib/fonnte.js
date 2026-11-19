'use strict';

/**
 * Pengiriman pesan WhatsApp via Fonnte (https://fonnte.com).
 * FONNTE_TOKEN hanya dibaca di server dan tidak pernah dikirim ke frontend.
 */

const FONNTE_SEND_URL = 'https://api.fonnte.com/send';

function isFonnteConfigured() {
    return Boolean((process.env.FONNTE_TOKEN || '').trim());
}

async function sendWhatsApp(target, message) {
    const token = (process.env.FONNTE_TOKEN || '').trim();
    if (!token) {
        const err = new Error('Environment variable belum diatur di server: FONNTE_TOKEN');
        err.code = 'ENV_MISSING';
        err.missing = ['FONNTE_TOKEN'];
        throw err;
    }

    const form = new FormData();
    form.append('target', target);
    form.append('message', message);
    form.append('countryCode', '62');

    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 10000);

    let response;
    try {
        response = await fetch(FONNTE_SEND_URL, {
            method: 'POST',
            headers: { Authorization: token },
            body: form,
            signal: controller.signal
        });
    } catch (err) {
        return { ok: false, reason: err && err.name === 'AbortError' ? 'timeout menghubungi Fonnte' : 'gagal menghubungi Fonnte' };
    } finally {
        clearTimeout(timer);
    }

    let data = null;
    try {
        data = await response.json();
    } catch (e) {
        data = null;
    }

    if (!response.ok || !data || data.status !== true) {
        return {
            ok: false,
            reason: (data && (data.reason || data.detail)) || ('HTTP ' + response.status)
        };
    }
    return { ok: true, data: data };
}

module.exports = { sendWhatsApp, isFonnteConfigured };
