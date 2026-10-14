/* ===== Bootstrap ===== */

/* Makes sure the default administrator exists on this device (created once; password can be changed later). */
async function ensureAdministrator() {
  if (!S || S.adminSeeded) return;
  if (!S.users.some((u) => eqi(u.username, 'administrator'))) {
    S.users.push({
      id: uid(), username: 'administrator', name: 'Administrator', role: 'admin', active: true,
      pass: await makePasswordRecord('P@ssw0rd'), mustChange: true, createdAt: nowIso(), lastLogin: null,
    });
    audit('user.create', 'administrator (default account)');
  }
  S.adminSeeded = true;
  saveState();
}

/* Dashboard banner shown while the default password is still in use (wraps the core banner). */
function licenseBannerHtml() {
  const pw = CURRENT && CURRENT.mustChange
    ? '<div class="banner danger"><span>' + t('dash.changePw') + '</span><button class="btn sm" data-act="nav" data-to="users">' + t('usr.changeMine') + '</button></div>'
    : '';
  return pw + licenseBannerCore();
}

async function init() {
  setLang(Store.get(APP.langKey, 'ar'));
  applyTheme();
  COMPANIES = loadCompanies();
  const cid = Session.get('hwm.cid');
  const pick = COMPANIES.find((c) => c.id === cid) || (COMPANIES.length === 1 ? COMPANIES[0] : null);
  if (pick) await selectCompany(pick.id);
  await refreshLicense();
  renderApp();
  if (CURRENT) maybeShowReminder();
  window.addEventListener('hashchange', () => {
    FORM.key = null;
    renderRoute();
  });
}

init().catch((err) => {
  document.getElementById('app').innerHTML = '<pre style="padding:24px;direction:ltr;white-space:pre-wrap">' + esc(err && err.stack ? err.stack : String(err)) + '</pre>';
});
