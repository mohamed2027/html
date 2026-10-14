/* ===== UI core: shell, navigation, routing, components, authentication screens ===== */
const ACT = {};   // data-act="name" click handlers
const INP = {};   // data-in="name" input handlers
const CHG = {};   // data-chg="name" change handlers
const PAGES = {}; // page renderers: PAGES.pr = (id) => html
const ROUTE = { page: 'dashboard', id: null };
const FORM = {};  // working state of the document form on the current page
const LIST = { q: '', render: null };
const LIC = { status: null };
const THEME_KEY = 'hwm.theme';

const ICON_PATHS = {
  dash: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
  inn: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  out: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  swap: '<path d="M7 16V4M7 4 3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"/>',
  clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  bldg: '<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8 7 17M17 7l2.8-2.8"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
};
const ico = (n) => '<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON_PATHS[n] || '') + '</svg>';

const NAV = [
  { g: null, items: [['dashboard', 'nav.dashboard', 'dash', ['dashboard.view']]] },
  { g: 'nav.purchasing', items: [
    ['pr', 'nav.pr', 'doc', ['pr.create', 'pr.viewAll', 'pr.approve']],
    ['approvals', 'nav.approvals', 'check', ['pr.approve']],
  ] },
  { g: 'nav.stores', items: [
    ['gr', 'nav.receipts', 'inn', ['receipt.post']],
    ['is', 'nav.issues', 'out', ['issue.post']],
    ['tr', 'nav.transfers', 'swap', ['transfer.post']],
    ['cn', 'nav.counts', 'clip', ['count.post']],
    ['balances', 'nav.balances', 'box', ['items.view']],
  ] },
  { g: 'nav.master', items: [
    ['items', 'nav.items', 'list', ['items.view']],
    ['categories', 'nav.categories', 'list', ['items.manage']],
    ['warehouses', 'nav.warehouses', 'bldg', ['items.view']],
    ['departments', 'nav.departments', 'users', ['items.view']],
    ['suppliers', 'nav.suppliers', 'doc', ['items.view']],
    ['excel', 'nav.excel', 'chart', ['excel.import', 'excel.export']],
  ] },
  { g: 'nav.reports', items: [['reports', 'nav.reports', 'chart', ['reports.view']]] },
  { g: 'nav.admin', items: [
    ['users', 'nav.users', 'users', ['admin.users']],
    ['roles', 'nav.roles', 'check', ['admin.roles']],
    ['settings', 'nav.settings', 'gear', ['admin.settings']],
    ['companies', 'nav.companies', 'bldg', ['admin.settings']],
    ['backup', 'nav.backup', 'box', ['admin.backup']],
    ['audit', 'nav.audit', 'doc', ['admin.audit']],
    ['license', 'nav.license', 'key', null],
  ] },
];

function hasAny(perms) {
  if (!perms) return true;
  return perms.some((p) => can(p));
}
function parseHash() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  const parts = h.split('/');
  return { page: parts[0] || 'dashboard', id: parts[1] || null };
}
function go(path) { location.hash = '#/' + path; }

/* ----- Components ----- */
const STATUS_CLS = { DRAFT: '', PENDING: 'warn', APPROVED: 'ok', REJECTED: 'bad', PARTIAL: 'info', CLOSED: 'ok', POSTED: 'ok' };
const statusBadge = (s) => '<span class="badge ' + (STATUS_CLS[s] || '') + '">' + t('st.' + s) + '</span>';
function pageHead(title, actions, sub) {
  return '<div class="page-head"><div><h1>' + title + '</h1>' + (sub ? '<div class="muted small">' + sub + '</div>' : '')
    + '</div><div class="toolbar no-print">' + (actions || '') + '</div></div>';
}
function table(cols, rows, emptyMsg) {
  if (!rows.length) return '<div class="table-wrap"><div class="empty">' + (emptyMsg || t('common.noData')) + '</div></div>';
  return '<div class="table-wrap"><table><thead><tr>' + cols.map((c) => '<th class="' + (c.num ? 'num' : '') + '">' + c.h + '</th>').join('')
    + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + cols.map((c) => '<td class="' + (c.num ? 'num' : '') + '">' + c.c(r) + '</td>').join('') + '</tr>').join('')
    + '</tbody></table></div>';
}
function searchBox(ph) {
  return '<input type="search" data-in="q" value="' + esc(LIST.q) + '" placeholder="' + esc(ph || t('common.search')) + '" style="max-width:320px">';
}
/* List pages register LIST.render(q) → html; the search box re-renders only the body. */
function listPage(title, actions, render, searchPh) {
  LIST.render = render;
  return pageHead(title, (searchPh === false ? '' : searchBox(searchPh)) + (actions || ''))
    + '<div class="card" style="padding:0;background:transparent;border:0;box-shadow:none"><div id="list-body">' + render(LIST.q) + '</div></div>';
}
INP.q = (el) => {
  LIST.q = el.value;
  const body = $('#list-body');
  if (body && LIST.render) body.innerHTML = LIST.render(LIST.q);
};
const field = (label, inner, cls) => '<label class="field ' + (cls || '') + '"><span>' + label + '</span>' + inner + '</label>';
const inp = (name, value, attrs) => '<input name="' + name + '" value="' + esc(value ?? '') + '" ' + (attrs || '') + '>';
const numInp = (name, value, attrs) => '<input name="' + name + '" type="number" step="any" min="0" value="' + esc(value ?? '') + '" ' + (attrs || '') + '>';
function sel(name, options, value, attrs) {
  return '<select name="' + name + '" ' + (attrs || '') + '>' + options.map((o) =>
    '<option value="' + esc(o.v) + '"' + (String(o.v) === String(value ?? '') ? ' selected' : '') + '>' + esc(o.l) + '</option>').join('') + '</select>';
}
const opt = (list, labelFn, ph) => [{ v: '', l: ph || '—' }].concat(list.map((x) => ({ v: x.id, l: labelFn(x) })));
const itemLabel = (i) => i.code + ' — ' + nm(i);
const stockStatus = (itemId) => {
  const item = itemOf(itemId);
  const q = totalQty(itemId);
  if (q <= 0) return 'out';
  if (item && item.minStock > 0 && q < item.minStock) return 'low';
  return 'ok';
};
const stockBadge = (k) => '<span class="stock-status ' + (k === 'ok' ? 'ok' : k === 'low' ? 'warn' : 'bad') + '">' + t('st.stock.' + k) + '</span>';
function readForm(root) {
  const o = {};
  (root || document).querySelectorAll('[name]').forEach((el) => {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else o[el.name] = el.value;
  });
  return o;
}
function emptyBox(msg) { return '<div class="card"><div class="empty">' + msg + '</div></div>'; }
const fmtMoney = (n) => money(n) + ' ' + (S.settings.currency || '');

/* ----- Theme & language ----- */
function applyTheme() {
  const mode = Store.get(THEME_KEY, 'auto');
  if (mode === 'dark' || mode === 'light') document.documentElement.setAttribute('data-theme', mode);
  else document.documentElement.removeAttribute('data-theme');
}
ACT.theme = () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const isDark = cur ? cur === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  Store.set(THEME_KEY, isDark ? 'light' : 'dark');
  applyTheme();
  renderApp();
};
ACT.lang = () => { setLang(LANG.current === 'ar' ? 'en' : 'ar'); renderApp(); };

/* ----- Shell ----- */
function shell() {
  const navHtml = NAV.map((g) => {
    const items = g.items.filter((it) => hasAny(it[3]));
    if (!items.length) return '';
    return (g.g ? '<div class="nav-group">' + t(g.g) + '</div>' : '') + items.map((it) =>
      '<button data-act="nav" data-to="' + it[0] + '" class="' + (ROUTE.page === it[0] ? 'active' : '') + '">' + ico(it[2]) + '<span>' + t(it[1]) + '</span></button>').join('');
  }).join('');
  const lic = LIC.status;
  const licBadge = !lic ? '' : lic.status === 'LICENSED'
    ? '<span class="badge ok">' + t('lic.licensed') + '</span>'
    : '<span class="badge warn">' + (lic.status === 'TRIAL' ? t('lic.daysLeft', { n: lic.days }) : t('lic.expired')) + '</span>';
  return '<div id="shell"><aside class="sidebar">'
    + '<div class="brand"><div class="logo">' + esc(nm({ ar: S.settings.hotelAr, en: S.settings.hotelEn }) || t('app.name')) + '</div>'
    + '<div class="sub">' + t('app.name') + '</div>'
    + sel('cid', companyOptions(), COMPANY.id, 'class="company-sel" data-chg="switchCompany" aria-label="' + t('co.company') + '"') + '</div>'
    + '<nav class="nav">' + navHtml + '</nav>'
    + '<div class="sidebar-foot">' + esc(CURRENT.name) + ' · ' + t('role.' + CURRENT.role) + '<br>v' + APP.version + '</div>'
    + '</aside>'
    + '<div class="main"><header class="topbar">'
    + '<div class="who"><strong id="crumb"></strong> ' + licBadge + '</div>'
    + '<div class="who">'
    + '<button class="btn sm" data-act="lang">' + t('nav.lang') + '</button>'
    + '<button class="btn sm" data-act="theme">' + ico('gear') + '</button>'
    + '<button class="btn sm danger" data-act="logout">' + t('nav.logout') + '</button>'
    + '</div></header>'
    + '<main class="content" id="view"></main></div></div>';
}

function renderRoute() {
  const r = parseHash();
  ROUTE.page = r.page;
  ROUTE.id = r.id;
  if (!$('#view')) { renderApp(); return; }
  const nav = NAV.flatMap((g) => g.items).find((it) => it[0] === r.page);
  let html;
  if (!nav && !PAGES[r.page]) {
    ROUTE.page = 'dashboard';
    html = PAGES.dashboard(null);
  } else if (!nav) {
    LIST.q = '';
    LIST.render = null;
    html = PAGES[r.page](r.id);
  } else if (!hasAny(nav[3])) {
    html = emptyBox(t('msg.noPerm'));
  } else {
    LIST.q = '';
    LIST.render = null;
    html = PAGES[r.page] ? PAGES[r.page](r.id) : emptyBox(t('common.noData'));
  }
  $('#view').innerHTML = html;
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.to === ROUTE.page));
  const crumb = $('#crumb');
  const nav2 = NAV.flatMap((g) => g.items).find((it) => it[0] === ROUTE.page);
  if (crumb) crumb.textContent = nav2 ? t(nav2[1]) : '';
  window.scrollTo(0, 0);
}

/* ----- Screens ----- */
function renderApp() {
  applyTheme();
  const root = $('#app');
  const top = '<div style="position:fixed;top:12px;inset-inline-end:12px;display:flex;gap:6px;z-index:10">'
    + '<button class="btn sm" data-act="lang">' + t('nav.lang') + '</button>'
    + '<button class="btn sm" data-act="theme">' + ico('gear') + '</button></div>';
  if (!COMPANIES.length) { root.innerHTML = top + viewSetup(); return; }
  if (LIC.status && LIC.status.status === 'EXPIRED') { root.innerHTML = top + viewLock(); return; }
  if (!S) { root.innerHTML = top + viewPick(); return; }
  if (!CURRENT) { root.innerHTML = top + viewLogin(); return; }
  root.innerHTML = shell();
  renderRoute();
}

function viewSetup() {
  return '<div class="auth-wrap"><div class="card auth-card">'
    + '<div class="logo">' + t('app.name') + '</div><p class="muted">' + t('auth.setupDesc') + '</p>'
    + '<h2>' + t('auth.setupTitle') + '</h2>'
    + '<form id="setup-form" class="form-grid" style="grid-template-columns:1fr">'
    + field(t('auth.hotelFirst') + ' (AR)', inp('hotelAr', '', 'required'))
    + field(t('auth.hotelFirst') + ' (EN)', inp('hotelEn', '', ''))
    + '<p class="muted small">' + t('auth.defaultAccount') + ': <span class="num">administrator</span> / <span class="num">P@ssw0rd</span></p>'
    + field(t('set.currency'), inp('currency', 'EGP'))
    + '<label class="field inline"><input type="checkbox" name="sample"> ' + t('auth.demoData') + '</label>'
    + '</form>'
    + '<div class="actions"><button class="btn primary" data-act="setup-create" style="width:100%">' + t('auth.create') + '</button></div>'
    + '</div></div>';
}
ACT['setup-create'] = async () => {
  const rec = await createCompany(readForm($('#setup-form')));
  await selectCompany(rec.id);
  CURRENT = S.users[0];
  Session.set('hwm.uid', CURRENT.id);
  await refreshLicense();
  renderApp();
  toast(t('msg.login', { name: CURRENT.name }));
  maybeShowReminder();
};

function viewPick() {
  return '<div class="auth-wrap"><div class="card auth-card">'
    + '<div class="logo">' + t('app.name') + '</div><p class="muted">' + t('co.pickDesc') + '</p>'
    + '<h2>' + t('co.pick') + '</h2>'
    + field(t('co.company'), sel('cid', companyOptions(), COMPANY ? COMPANY.id : COMPANIES[0].id))
    + '<div class="actions"><button class="btn primary" data-act="pickCompany" style="width:100%">' + t('co.continue') + '</button></div>'
    + '</div></div>';
}
function viewLogin() {
  return '<div class="auth-wrap"><div class="card auth-card">'
    + '<div class="logo">' + t('app.name') + '</div><p class="muted">' + t('app.tagline') + '</p>'
    + (COMPANIES.length > 1 ? field(t('co.company'), sel('cid', companyOptions(), COMPANY.id, 'data-chg="switchCompany"')) : '')
    + '<h2>' + t('auth.login') + '</h2><p class="muted small">' + t('auth.loginDesc') + '</p>'
    + '<form id="login-form" class="form-grid" style="grid-template-columns:1fr">'
    + field(t('usr.username'), '<input name="username" required autocomplete="username" autofocus>')
    + field(t('usr.password'), '<input name="password" type="password" required autocomplete="current-password">')
    + '</form>'
    + '<div class="actions"><button class="btn primary" data-act="login" style="width:100%">' + t('auth.login') + '</button></div>'
    + '</div></div>';
}
ACT.login = async () => {
  const f = readForm($('#login-form'));
  const u = S.users.find((x) => x.username.toLowerCase() === String(f.username || '').trim().toLowerCase());
  const ok = u && await checkPasswordRecord(f.password || '', u.pass);
  if (!ok) throw new Error(t('auth.wrong'));
  if (!u.active) throw new Error(t('auth.disabled'));
  CURRENT = u;
  u.lastLogin = nowIso();
  audit('login', u.username);
  saveState();
  Session.set('hwm.uid', u.id);
  toast(t('msg.login', { name: u.name }));
  renderApp();
  maybeShowReminder();
};
ACT.logout = () => {
  if (CURRENT) audit('logout', CURRENT.username);
  saveState();
  CURRENT = null;
  Session.remove('hwm.uid');
  go('dashboard');
  renderApp();
  toast(t('msg.logout'));
};

ACT.pickCompany = async () => {
  const pick = $('#app select[name=cid]');
  await selectCompany(pick ? pick.value : COMPANIES[0].id);
  renderApp();
};
CHG.switchCompany = async (el) => {
  try { await switchToCompany(el.value); } catch (err) { toast(err.message, 'err'); }
};

/* ----- Licence screens ----- */
function viewLock() {
  const st = LIC.status;
  return '<div class="auth-wrap"><div class="card auth-card">'
    + '<div class="logo">' + t('app.name') + '</div>'
    + '<div class="banner danger">' + t('lic.lockedMsg') + '</div>'
    + licenseForm()
    + (CURRENT ? '<div class="actions"><button class="btn ghost" data-act="logout">' + t('nav.logout') + '</button></div>' : '')
    + '<p class="muted small" style="margin-top:14px">' + t('lic.machine') + ': <span class="num">' + getMachineId() + '</span> · ' + (st ? st.reason || '' : '') + '</p>'
    + '</div></div>';
}
function licenseForm() {
  return '<h2>' + t('lic.activate') + '</h2><p class="muted small">' + t('lic.keyHint') + '</p>'
    + '<textarea name="licenseKey" id="lic-input" class="codebox" style="min-height:90px" placeholder="HWM1.…"></textarea>'
    + '<div class="actions"><button class="btn primary" data-act="activate">' + t('lic.activate') + '</button></div>';
}
ACT.activate = async () => {
  const raw = ($('#lic-input') || {}).value || '';
  await activateLicense(raw);
  await refreshLicense();
  toast(t('lic.valid'));
  if (CURRENT) go('license');
  renderApp();
};
async function refreshLicense() {
  LIC.status = await getLicenseStatus();
  return LIC.status;
}
function licenseBannerCore() {
  const st = LIC.status;
  if (!st) return '';
  if (st.status === 'TRIAL' && st.days <= 10) {
    return '<div class="banner"><span>' + t('lic.bannerTrial', { n: st.days }) + '</span><button class="btn sm" data-act="nav" data-to="license">' + t('lic.renewNow') + '</button></div>';
  }
  if (st.status === 'LICENSED' && !st.lifetime && st.days <= APP.reminderLeadDays) {
    return '<div class="banner"><span>' + t('lic.bannerLic', { d: st.expiry, n: st.days }) + '</span><button class="btn sm" data-act="nav" data-to="license">' + t('lic.renewNow') + '</button></div>';
  }
  return '';
}
function maybeShowReminder() {
  if (!CURRENT || !LIC.status) return;
  if (!reminderDue(LIC.status)) return;
  markReminderShown();
  const st = LIC.status;
  const msg = st.status === 'TRIAL' ? t('lic.bannerTrial', { n: st.days }) : t('lic.bannerLic', { d: st.expiry, n: st.days });
  openModal({
    title: t('lic.reminderTitle'),
    narrow: true,
    body: '<p>' + esc(msg) + '</p>',
    actions: [
      { label: t('lic.renewNow'), cls: 'primary', onClick: () => { go('license'); } },
      { label: t('lic.remindLater'), cls: 'ghost', onClick: () => {} },
    ],
  });
}

/* ----- Global event delegation ----- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  try {
    await fn(el, e);
  } catch (err) {
    toast(err && err.message ? err.message : String(err), 'err');
  }
});
ACT.nav = (el) => go(el.dataset.to);
document.addEventListener('input', (e) => {
  const el = e.target;
  const k = el && el.dataset ? el.dataset.in : null;
  if (k && INP[k]) INP[k](el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target;
  const k = el && el.dataset ? el.dataset.chg : null;
  if (!k || !CHG[k]) return;
  try { CHG[k](el, e); } catch (err) { toast(err.message, 'err'); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const ov = document.querySelector('#modal-root .overlay');
    if (ov) ov.remove();
  }
});
