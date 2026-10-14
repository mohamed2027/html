/* ===== Companies: each company keeps its own data, users and warehouses on this device ===== */
let COMPANIES = [];   // registry: [{ id, key, nameAr, nameEn, createdAt }]
let COMPANY = null;   // record of the company that is open now

const companyLabel = (c) => nm({ ar: c.nameAr, en: c.nameEn }) || t('co.unnamed');
const companyOptions = () => COMPANIES.map((c) => ({ v: c.id, l: companyLabel(c) }));
function dataKey() { return COMPANY ? COMPANY.key : APP.storageKey; }

/* Reads the registry. Data saved by the earlier single-company version becomes the company 'main'. */
function loadCompanies() {
  let list = Store.get(APP.companiesKey, null);
  if (!Array.isArray(list)) {
    list = [];
    const legacy = Store.get(APP.storageKey, null);
    if (legacy && legacy.schema === 1) {
      const st = legacy.settings || {};
      list.push({ id: 'main', key: APP.storageKey, nameAr: st.hotelAr || '', nameEn: st.hotelEn || '', createdAt: nowIso() });
    }
    Store.set(APP.companiesKey, list);
  }
  return list;
}
function saveCompanies() {
  if (!Store.set(APP.companiesKey, COMPANIES)) toast(t('msg.storage'), 'err');
}

/* Opens a company: loads its data and restores the signed-in user if this tab already had one. */
async function selectCompany(id) {
  const rec = COMPANIES.find((c) => c.id === id);
  if (!rec) throw new Error(t('co.notFound'));
  COMPANY = rec;
  Session.set('hwm.cid', rec.id);
  Store.set(APP.lastCompanyKey, rec.id);
  S = loadState();
  CURRENT = null;
  if (S) {
    await ensureAdministrator();
    const sid = Session.get('hwm.uid');
    CURRENT = S.users.find((u) => u.id === sid && u.active !== false) || null;
  }
}

/* Saves and leaves the open company, then opens another one. Its users must sign in again. */
async function switchToCompany(id) {
  if (S) {
    if (CURRENT) audit('logout', CURRENT.username);
    saveState();
  }
  CURRENT = null;
  Session.remove('hwm.uid');
  await selectCompany(id);
  go('dashboard');
  renderApp();
}

/* Creates a company with its own default administrator. The company that is open stays open. */
async function createCompany(d) {
  const ar = String(d.hotelAr || '').trim();
  const en = String(d.hotelEn || '').trim();
  if (!ar && !en) throw new Error(t('common.required'));
  const rec = { id: uid(), key: '', nameAr: ar, nameEn: en, createdAt: nowIso() };
  rec.key = APP.storageKey + '.' + rec.id;
  const prev = { company: COMPANY, state: S, user: CURRENT };
  const restore = () => { COMPANY = prev.company; S = prev.state; CURRENT = prev.user; };
  COMPANY = rec;
  try {
    S = await createInitialState(ar, en, String(d.currency || 'EGP').trim() || 'EGP');
    CURRENT = S.users[0];
    if (d.sample) loadSampleData();
    audit('setup', 'company created');
    saveState();
  } catch (e) {
    restore();
    throw e;
  }
  restore();
  COMPANIES.push(rec);
  saveCompanies();
  return rec;
}

/* Deletes a company's data. The open company cannot be deleted; open another one first. */
function removeCompany(id) {
  const rec = COMPANIES.find((c) => c.id === id);
  if (!rec) return;
  if (COMPANY && COMPANY.id === id) throw new Error(t('co.cantDeleteCurrent'));
  Store.remove(rec.key);
  COMPANIES = COMPANIES.filter((c) => c.id !== id);
  saveCompanies();
  if (Store.get(APP.lastCompanyKey, null) === id) Store.remove(APP.lastCompanyKey);
}

/* Renames a company. The open company's settings are updated in place; others are updated in storage. */
function renameCompany(id, hotelAr, hotelEn) {
  const ar = String(hotelAr || '').trim();
  const en = String(hotelEn || '').trim();
  if (!ar && !en) throw new Error(t('common.required'));
  const rec = COMPANIES.find((c) => c.id === id);
  if (!rec) throw new Error(t('co.notFound'));
  rec.nameAr = ar;
  rec.nameEn = en;
  saveCompanies();
  if (COMPANY && COMPANY.id === id) {
    S.settings.hotelAr = ar;
    S.settings.hotelEn = en;
    audit('settings.save', 'company name');
    saveState();
  } else {
    const st = Store.get(rec.key, null);
    if (st && st.settings) { st.settings.hotelAr = ar; st.settings.hotelEn = en; Store.set(rec.key, st); }
  }
}

/* Keeps the registry name in step with the settings page for the open company. */
function syncCompanyName() {
  if (!COMPANY || !S) return;
  COMPANY.nameAr = S.settings.hotelAr;
  COMPANY.nameEn = S.settings.hotelEn;
  saveCompanies();
}
