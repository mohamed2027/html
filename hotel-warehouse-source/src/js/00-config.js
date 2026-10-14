/* ===== App configuration (edit before building for sale) ===== */
const APP = {
  version: '1.0.0',
  storageKey: 'hwm.data.v1',          // company 'main' (legacy key); other companies use storageKey + '.' + id
  companiesKey: 'hwm.companies.v1',   // registry of companies on this device
  lastCompanyKey: 'hwm.lastCompany',
  licenseKey: 'hwm.license.v1',
  trialKey: 'hwm.trial.v1',
  machineKey: 'hwm.machine.v1',
  langKey: 'hwm.lang',
  themeKey: 'hwm.theme',
  reminderKey: 'hwm.reminder.v1',
  trialDays: 30,               // free trial length
  reminderEveryDays: 3,        // remind every N days
  reminderLeadDays: 30,        // start reminding this many days before expiry
  // Ed25519 PUBLIC key (raw, base64) produced by tools/license-keygen.html.
  // The private key never goes into the app. Replace this placeholder before selling.
  licensePublicKey: 'REPLACE_WITH_PUBLIC_KEY_FROM_KEYGEN',
};
