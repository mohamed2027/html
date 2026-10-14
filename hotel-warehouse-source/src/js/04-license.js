/* ===== Licensing: 30-day trial, signed serial keys (Ed25519), renewal reminders ===== */
/*
  Key format:  HWM1.<payload base64url>.<signature base64url>
  payload JSON: { cust, plan, exp (YYYY-MM-DD or null = lifetime), mid ("*" or machine id), iss }
  Keys are created ONLY by tools/license-keygen.html, which holds the private key.
*/
const LIC_RULES = { trialReminderDays: 10 };   // trial reminders start this many days before trial ends
let _pubKeyPromise = null;

const b64u = {
  enc(bytes) {
    let s = '';
    bytes.forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    return Uint8Array.from(atob(s + pad), (c) => c.charCodeAt(0));
  },
};

function getMachineId() {
  let id = Store.get(APP.machineKey, null);
  if (!id) {
    id = 'M' + uid().replace(/-/g, '').slice(0, 20).toUpperCase();
    Store.set(APP.machineKey, id);
  }
  return id;
}

function licenseConfigured() {
  return !!APP.licensePublicKey && !APP.licensePublicKey.startsWith('REPLACE');
}

function importPublicKey() {
  if (!_pubKeyPromise) {
    _pubKeyPromise = crypto.subtle.importKey('raw', unb64(APP.licensePublicKey), { name: 'Ed25519' }, false, ['verify']);
  }
  return _pubKeyPromise;
}

async function verifyLicenseKey(raw) {
  const key = String(raw || '').replace(/\s+/g, '');
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== 'HWM1') return { ok: false, reason: 'format' };
  if (!licenseConfigured()) return { ok: false, reason: 'notconfigured' };
  try {
    const pub = await importPublicKey();
    const sig = b64u.dec(parts[2]);
    const valid = await crypto.subtle.verify({ name: 'Ed25519' }, pub, sig, new TextEncoder().encode(parts[1]));
    if (!valid) return { ok: false, reason: 'signature' };
    const payload = JSON.parse(new TextDecoder().decode(b64u.dec(parts[1])));
    if (payload.mid && payload.mid !== '*' && payload.mid !== getMachineId()) return { ok: false, reason: 'machine' };
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, reason: 'format' };
  }
}

/* Trial start is kept in localStorage AND a cookie; the earliest copy wins. */
function readCookie(name) {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch (e) { return null; }
}
function writeCookie(name, value) {
  try { document.cookie = name + '=' + encodeURIComponent(value) + '; max-age=' + (60 * 60 * 24 * 400) + '; path=/; SameSite=Lax'; } catch (e) { /* ignore */ }
}
function getTrialStart() {
  const candidates = [];
  const ls = Store.get(APP.trialKey, null);
  if (ls && /^\d{4}-\d{2}-\d{2}$/.test(ls.start || '')) candidates.push(ls.start);
  const ck = readCookie('hwm_t');
  if (ck && /^\d{4}-\d{2}-\d{2}$/.test(ck)) candidates.push(ck);
  const start = candidates.length ? candidates.sort()[0] : todayISO();
  Store.set(APP.trialKey, { start });
  writeCookie('hwm_t', start);
  return start;
}

/* Returns { status: 'LICENSED'|'TRIAL'|'EXPIRED', days, expiry, lifetime, customer, plan, reason } */
async function getLicenseStatus() {
  const today = todayISO();
  const saved = Store.get(APP.licenseKey, null);
  if (saved && saved.key) {
    const v = await verifyLicenseKey(saved.key);
    if (v.ok) {
      const p = v.payload;
      if (!p.exp) return { status: 'LICENSED', lifetime: true, customer: p.cust, plan: p.plan, expiry: null, days: null };
      const days = daysBetween(today, p.exp);
      if (days >= 0) return { status: 'LICENSED', lifetime: false, customer: p.cust, plan: p.plan, expiry: p.exp, days };
      return { status: 'EXPIRED', reason: 'license', customer: p.cust, plan: p.plan, expiry: p.exp, days };
    }
  }
  const start = getTrialStart();
  const used = daysBetween(start, today);
  const left = APP.trialDays - used;
  if (left > 0) return { status: 'TRIAL', days: left, expiry: addDays(start, APP.trialDays), lifetime: false };
  return { status: 'EXPIRED', reason: 'trial', days: 0, expiry: addDays(start, APP.trialDays), lifetime: false };
}

async function activateLicense(raw) {
  const v = await verifyLicenseKey(raw);
  if (!v.ok) {
    if (v.reason === 'notconfigured') throw new Error(t('lic.notConfigured'));
    if (v.reason === 'machine') throw new Error(t('lic.wrongMachine'));
    throw new Error(t('lic.invalid'));
  }
  Store.set(APP.licenseKey, { key: String(raw).replace(/\s+/g, ''), activatedAt: nowIso() });
  Store.remove(APP.reminderKey);
  return v.payload;
}

function deactivateLicense() { Store.remove(APP.licenseKey); }

/* Reminder rules: licences with an expiry remind during the lead window; trial reminds in its last days.
   The first reminder shows immediately; then one every APP.reminderEveryDays (3). */
function reminderDue(status) {
  if (!status) return false;
  if (status.status === 'LICENSED') {
    if (status.lifetime) return false;
    if (status.days > APP.reminderLeadDays) return false;
  } else if (status.status === 'TRIAL') {
    if (status.days > LIC_RULES.trialReminderDays) return false;
  } else {
    return false;   // expired is handled by the lock screen
  }
  const rec = Store.get(APP.reminderKey, {});
  if (!rec.last) return true;
  return daysBetween(rec.last, todayISO()) >= APP.reminderEveryDays;
}
function markReminderShown() { Store.set(APP.reminderKey, { last: todayISO() }); }
