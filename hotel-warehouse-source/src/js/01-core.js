/* ===== Core: helpers, storage, dialogs, crypto ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const pad = (n, w = 4) => String(n).padStart(w, '0');

function localDate(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const todayISO = () => localDate();
const nowIso = () => new Date().toISOString();
const dt = (iso) => (iso ? String(iso).slice(0, 10) : '');
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return localDate(d); }
function daysBetween(fromIso, toIso) { return Math.round((new Date(toIso + 'T00:00:00') - new Date(fromIso + 'T00:00:00')) / 86400000); }
const num = (v) => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim());
  return isFinite(n) ? n : 0;
};
const qty = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ----- Local storage (wrapped: may be blocked or full) ----- */
const Store = {
  get(k, fb = null) { try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (e) { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.error(e); return false; } },
  remove(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
const Session = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  remove(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

/* ----- Toasts ----- */
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'err' ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

/* ----- Modal dialogs ----- */
function openModal({ title, body, actions = [], narrow = false, onOpen }) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `
    <div class="modal ${narrow ? 'narrow' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-x aria-label="close">✕</button></div>
      <div class="modal-body">${body}</div>
      <div class="actions">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-a="${i}">${a.label}</button>`).join('')}</div>
    </div>`;
  const close = () => wrap.remove();
  const ctx = { el: wrap, close };
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('[data-x]').onclick = close;
  wrap.querySelectorAll('[data-a]').forEach((b) => {
    b.onclick = async () => {
      const a = actions[+b.dataset.a];
      try {
        const r = await a.onClick(ctx);
        if (r !== false) close();
      } catch (err) {
        toast(err.message || String(err), 'err');
      }
    };
  });
  $('#modal-root').appendChild(wrap);
  if (onOpen) onOpen(ctx);
  setTimeout(() => { const f = wrap.querySelector('input,select,textarea'); if (f) f.focus(); }, 40);
  return ctx;
}
function confirmBox(message, onYes) {
  openModal({
    title: t('common.confirm'),
    narrow: true,
    body: `<p>${esc(message)}</p>`,
    actions: [
      { label: t('common.cancel'), cls: 'ghost', onClick: () => {} },
      { label: t('common.yes'), cls: 'danger', onClick: onYes },
    ],
  });
}

/* ----- Crypto (PBKDF2 for passwords, base64 helpers) ----- */
const b64 = (bytes) => { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
async function pbkdf2(password, saltBytes) {
  if (!window.crypto || !crypto.subtle) throw new Error(t('msg.noCrypto'));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 120000, hash: 'SHA-256' }, key, 256);
  return b64(new Uint8Array(bits));
}
async function makePasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), hash: await pbkdf2(password, salt) };
}
async function checkPasswordRecord(password, rec) {
  if (!rec) return false;
  return (await pbkdf2(password, unb64(rec.salt))) === rec.hash;
}
