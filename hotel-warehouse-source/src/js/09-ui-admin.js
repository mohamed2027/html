/* ===== UI: master data (add / edit / remove / Excel import & export), balances, reports, administration ===== */

const ENT_ORDER = ['categories', 'warehouses', 'departments', 'suppliers', 'items', 'users'];
const IMPORT_ORDER = ['categories', 'warehouses', 'departments', 'suppliers', 'items', 'users', 'opening_balances'];
const eqi = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/* Entity schema: each field maps to a UI input and an Excel column (x). kind: text | num | bool | ref | role | pass */
const ENT = {
  categories: { title: 'cat.title', key: 'code', view: 'items.view', perm: 'items.manage', coll: () => S.categories, fields: [
    { k: 'code', x: 'code', kind: 'text', req: true, l: 'common.code' },
    { k: 'ar', x: 'name_ar', kind: 'text', req: true, l: 'item.ar' },
    { k: 'en', x: 'name_en', kind: 'text', l: 'item.en' },
  ] },
  warehouses: { title: 'wh.title', key: 'code', view: 'items.view', perm: 'items.manage', coll: () => S.warehouses, fields: [
    { k: 'code', x: 'code', kind: 'text', req: true, l: 'common.code' },
    { k: 'ar', x: 'name_ar', kind: 'text', req: true, l: 'item.ar' },
    { k: 'en', x: 'name_en', kind: 'text', l: 'item.en' },
    { k: 'active', x: 'active', kind: 'bool', l: 'common.active' },
  ] },
  departments: { title: 'dep.title', key: 'code', view: 'items.view', perm: 'items.manage', coll: () => S.departments, fields: [
    { k: 'code', x: 'code', kind: 'text', req: true, l: 'common.code' },
    { k: 'ar', x: 'name_ar', kind: 'text', req: true, l: 'item.ar' },
    { k: 'en', x: 'name_en', kind: 'text', l: 'item.en' },
    { k: 'active', x: 'active', kind: 'bool', l: 'common.active' },
  ] },
  suppliers: { title: 'sup.title', key: 'name', view: 'items.view', perm: 'items.manage', coll: () => S.suppliers, fields: [
    { k: 'name', x: 'name', kind: 'text', req: true, l: 'common.name' },
    { k: 'phone', x: 'phone', kind: 'text', l: 'sup.phone' },
    { k: 'contact', x: 'contact', kind: 'text', l: 'sup.contact' },
    { k: 'active', x: 'active', kind: 'bool', l: 'common.active' },
  ] },
  items: { title: 'item.title', key: 'code', view: 'items.view', perm: 'items.manage', coll: () => S.items, fields: [
    { k: 'code', x: 'code', kind: 'text', req: true, l: 'common.code' },
    { k: 'ar', x: 'name_ar', kind: 'text', req: true, l: 'item.ar' },
    { k: 'en', x: 'name_en', kind: 'text', l: 'item.en' },
    { k: 'categoryId', x: 'category_code', kind: 'ref', ref: 'categories', rkey: 'code', req: true, l: 'item.category' },
    { k: 'unit', x: 'unit', kind: 'text', l: 'common.unit' },
    { k: 'minStock', x: 'min_stock', kind: 'num', l: 'item.minStock' },
    { k: 'reorderQty', x: 'reorder_qty', kind: 'num', l: 'item.reorder' },
    { k: 'cost', x: 'unit_cost', kind: 'num', l: 'item.cost' },
    { k: 'active', x: 'active', kind: 'bool', l: 'common.active' },
  ] },
  users: { title: 'usr.title', key: 'username', view: 'admin.users', perm: 'admin.users', coll: () => S.users, fields: [
    { k: 'username', x: 'username', kind: 'text', req: true, l: 'usr.username' },
    { k: 'name', x: 'name', kind: 'text', req: true, l: 'usr.fullName' },
    { k: 'role', x: 'role', kind: 'role', req: true, l: 'usr.role' },
    { k: 'deptId', x: 'department_code', kind: 'ref', ref: 'departments', rkey: 'code', l: 'usr.dept' },
    { k: 'active', x: 'active', kind: 'bool', l: 'common.active' },
    { k: 'password', x: 'password', kind: 'pass', l: 'usr.password' },
  ] },
};

function fieldValueText(f, r) {
  if (f.kind === 'ref') {
    const tgt = ENT[f.ref].coll().find((x) => x.id === r[f.k]);
    return tgt ? (f.rkey === 'code' ? tgt.code + ' — ' + nm(tgt) : tgt[f.rkey]) : '—';
  }
  if (f.kind === 'bool') return r[f.k] === false ? t('common.inactive') : t('common.active');
  if (f.kind === 'num') return qty(r[f.k]);
  if (f.kind === 'role') return t('role.' + r.role);
  if (f.kind === 'pass') return '';
  return r[f.k] ?? '';
}
function entCell(f, r) {
  if (f.kind === 'bool') return '<span class="badge ' + (r[f.k] === false ? 'bad' : 'ok') + '">' + (r[f.k] === false ? t('common.inactive') : t('common.active')) + '</span>';
  return esc(fieldValueText(f, r));
}

/* ----- Persistence of entity records ----- */
function isReferenced(name, id) {
  const sources = {
    categories: [S.items],
    items: [S.movements, S.docs],
    warehouses: [S.movements, S.docs],
    departments: [S.docs, S.users],
    suppliers: [S.docs],
    users: [S.docs],
  }[name] || [];
  return sources.some((s) => JSON.stringify(s).indexOf('"' + id + '"') !== -1);
}

async function entSave(name, id, v) {
  const E = ENT[name];
  const list = E.coll();
  const rec = id ? list.find((x) => x.id === id) : null;
  const key = String(v[E.key] ?? '').trim();
  if (!key) throw new Error(t('common.required') + ': ' + t(E.fields.find((f) => f.k === E.key).l));
  if (list.some((x) => (!rec || x.id !== rec.id) && eqi(x[E.key], key))) throw new Error(t('xl.dupKey', { k: key }));
  E.fields.forEach((f) => {
    if (f.req && f.kind !== 'bool' && f.kind !== 'pass' && String(v[f.k] ?? '').trim() === '') {
      throw new Error(t('common.required') + ': ' + t(f.l));
    }
    if (f.kind === 'role' && ROLES.indexOf(v[f.k]) === -1) throw new Error(t('common.required') + ': ' + t(f.l));
    if (f.kind === 'ref' && v[f.k]) {
      const isId = ENT[f.ref].coll().some((x) => x.id === v[f.k]);
      if (!isId && String(v[f.k]).indexOf('@') !== 0) throw new Error(t('xl.unknownRef', { c: v[f.k] }));
    }
  });
  const target = rec ? Object.assign({}, rec) : { id: uid(), createdAt: nowIso() };
  E.fields.forEach((f) => {
    if (f.kind === 'pass') return;
    if (f.kind === 'bool') target[f.k] = v[f.k] !== false;
    else if (f.kind === 'num') target[f.k] = num(v[f.k]);
    else if (f.kind === 'ref') {
      const raw = String(v[f.k] || '');
      if (raw.indexOf('@') === 0) {
        const tgt = ENT[f.ref].coll().find((x) => eqi(x[f.rkey], raw.slice(1)));
        if (!tgt) throw new Error(t('xl.unknownRef', { c: raw.slice(1) }));
        target[f.k] = tgt.id;
      } else target[f.k] = raw;
    } else target[f.k] = typeof v[f.k] === 'string' ? v[f.k].trim() : (v[f.k] ?? '');
  });

  if (name === 'users') {
    const pw = String(v.password || '');
    if (!rec && pw.length < 6) throw new Error(t('auth.short'));
    if (rec && pw && pw.length < 6) throw new Error(t('auth.short'));
    const wasAdmin = !!rec && rec.role === 'admin' && rec.active !== false;
    const willAdmin = target.role === 'admin' && target.active !== false;
    const otherAdmins = list.filter((u) => u.role === 'admin' && u.active !== false && (!rec || u.id !== rec.id));
    if (wasAdmin && !willAdmin && otherAdmins.length === 0) throw new Error(t('usr.cannotDisableAdmin'));
    if (rec && CURRENT && rec.id === CURRENT.id && target.active === false) throw new Error(t('usr.cannotDeleteSelf'));
    if (pw) target.pass = await makePasswordRecord(pw);
    if (!rec) { target.lastLogin = null; target.mustChange = !!v.mustChange; }
  }

  if (rec) list[list.findIndex((x) => x.id === rec.id)] = target;
  else list.push(target);
  if (name === 'users' && CURRENT && CURRENT.id === target.id) CURRENT = target;
  audit(rec ? 'master.update' : 'master.create', name + ': ' + key);
  saveState();
  return target;
}

function entDelete(name, id) {
  const E = ENT[name];
  const list = E.coll();
  const rec = list.find((x) => x.id === id);
  if (!rec) return 'none';
  if (name === 'users') {
    if (CURRENT && CURRENT.id === id) throw new Error(t('usr.cannotDeleteSelf'));
    const others = S.users.filter((u) => u.role === 'admin' && u.active !== false && u.id !== id);
    if (rec.role === 'admin' && rec.active !== false && others.length === 0) throw new Error(t('usr.cannotDisableAdmin'));
  }
  if (isReferenced(name, id)) {
    rec.active = false;
    audit('master.deactivate', name + ': ' + rec[E.key]);
    saveState();
    return 'deactivated';
  }
  list.splice(list.indexOf(rec), 1);
  audit('master.delete', name + ': ' + rec[E.key]);
  saveState();
  return 'deleted';
}

function entFormModal(name, rec) {
  const E = ENT[name];
  const inputs = E.fields.map((f) => {
    const val = rec ? rec[f.k] : undefined;
    const lab = t(f.l) + (f.req ? ' *' : '');
    if (f.kind === 'bool') {
      const on = rec ? rec[f.k] !== false : true;
      return '<label class="field inline" style="grid-column:1/-1"><input type="checkbox" name="' + f.k + '"' + (on ? ' checked' : '') + '> ' + lab + '</label>';
    }
    if (f.kind === 'ref') {
      return field(lab, sel(f.k, opt(ENT[f.ref].coll(), (x) => x[f.rkey] + ' — ' + nm(x), t('msg.pick')), val || ''));
    }
    if (f.kind === 'role') return field(lab, sel(f.k, ROLES.map((r) => ({ v: r, l: t('role.' + r) })), val || 'requester'));
    if (f.kind === 'pass') return field(rec ? t('usr.newPassword') : lab + ' (' + t('auth.short') + ')', '<input type="password" name="' + f.k + '" autocomplete="new-password">');
    if (f.kind === 'num') return field(lab, '<input type="number" step="any" min="0" name="' + f.k + '" value="' + esc(val ?? 0) + '">');
    return field(lab, '<input name="' + f.k + '" value="' + esc(val ?? '') + '"' + (f.req ? ' required' : '') + '>');
  }).join('');
  openModal({
    title: (rec ? t('common.edit') : t('common.add')) + ' · ' + t(E.title),
    body: '<form id="ent-form" class="form-grid">' + inputs + '</form>',
    actions: [
      { label: t('common.cancel'), cls: 'ghost', onClick: () => {} },
      { label: t('common.save'), cls: 'primary', onClick: async (ctx) => {
        const v = readForm(ctx.el.querySelector('#ent-form'));
        await entSave(name, rec ? rec.id : null, v);
        toast(t('common.saved'));
        renderRoute();
      } },
    ],
  });
}

function entPage(name) {
  const E = ENT[name];
  if (!can(E.view)) return emptyBox(t('msg.noPerm'));
  const cols = E.fields.filter((f) => f.kind !== 'pass').map((f) => ({ h: t(f.l), c: (r) => entCell(f, r), num: f.kind === 'num' }));
  if (can(E.perm)) {
    cols.push({ h: t('common.actions'), c: (r) => '<button class="btn sm" data-act="entEdit" data-ent="' + name + '" data-id="' + r.id + '">' + t('common.edit') + '</button> '
      + '<button class="btn sm danger" data-act="entDelete" data-ent="' + name + '" data-id="' + r.id + '">' + t('common.delete') + '</button>' });
  }
  LIST.render = (q) => {
    const k = String(q || '').trim().toLowerCase();
    const rows = E.coll().filter((r) => !k || E.fields.some((f) => f.kind !== 'pass' && String(fieldValueText(f, r)).toLowerCase().indexOf(k) !== -1));
    return table(cols, rows);
  };
  const actions = (can(E.perm)
    ? '<button class="btn primary" data-act="entNew" data-ent="' + name + '">' + ico('plus') + t('common.add') + '</button>'
      + '<button class="btn" data-act="entImport" data-ent="' + name + '">' + ico('inn') + t('common.import') + '</button>'
    : '')
    + '<button class="btn" data-act="entExport" data-ent="' + name + '">' + ico('out') + t('common.export') + '</button>'
    + (can(E.perm) ? '<button class="btn ghost" data-act="entTemplate" data-ent="' + name + '">' + t('xl.templateGeneric') + '</button>' : '')
    + (name === 'users' ? '<button class="btn" data-act="myPw">' + t('usr.changeMine') + '</button>' : '');
  return listPage(t(E.title), actions, LIST.render);
}
PAGES.items = () => entPage('items');
PAGES.categories = () => entPage('categories');
PAGES.warehouses = () => entPage('warehouses');
PAGES.departments = () => entPage('departments');
PAGES.suppliers = () => entPage('suppliers');
PAGES.users = () => entPage('users');

ACT.entNew = (el) => entFormModal(el.dataset.ent, null);
ACT.entEdit = (el) => {
  const rec = ENT[el.dataset.ent].coll().find((x) => x.id === el.dataset.id);
  if (rec) entFormModal(el.dataset.ent, rec);
};
ACT.entDelete = (el) => {
  const name = el.dataset.ent;
  const id = el.dataset.id;
  confirmBox(t('common.confirmDelete'), () => {
    const res = entDelete(name, id);
    toast(res === 'deactivated' ? t('msg.deactivated') : t('common.deleted'));
    renderRoute();
  });
};
ACT.myPw = () => {
  openModal({
    title: t('usr.changeMine'),
    narrow: true,
    body: '<form id="pw-form" class="form-grid" style="grid-template-columns:1fr">'
      + field(t('usr.currentPassword'), '<input type="password" name="cur" autocomplete="current-password">')
      + field(t('usr.newPassword'), '<input type="password" name="np" autocomplete="new-password">')
      + field(t('auth.confirmPass'), '<input type="password" name="np2" autocomplete="new-password">') + '</form>',
    actions: [
      { label: t('common.cancel'), cls: 'ghost', onClick: () => {} },
      { label: t('common.save'), cls: 'primary', onClick: async (ctx) => {
        const v = readForm(ctx.el.querySelector('#pw-form'));
        if (!(await checkPasswordRecord(v.cur || '', CURRENT.pass))) throw new Error(t('usr.wrongCurrent'));
        if ((v.np || '').length < 6) throw new Error(t('auth.short'));
        if (v.np !== v.np2) throw new Error(t('auth.mismatch'));
        CURRENT.pass = await makePasswordRecord(v.np);
        CURRENT.mustChange = false;
        audit('password.change', CURRENT.username);
        saveState();
        toast(t('common.saved'));
        renderRoute();
      } },
    ],
  });
};

/* ----- Excel: export ----- */
function entExportRows(name) {
  const E = ENT[name];
  const fields = E.fields.filter((f) => f.kind !== 'pass');
  const head = fields.map((f) => f.x);
  const body = E.coll().map((r) => fields.map((f) => {
    const v = r[f.k];
    if (f.kind === 'ref') { const tgt = ENT[f.ref].coll().find((x) => x.id === v); return tgt ? tgt[f.rkey] : ''; }
    if (f.kind === 'bool') return v === false ? 0 : 1;
    if (f.kind === 'num') return num(v);
    if (f.kind === 'role') return v || '';
    return v ?? '';
  }));
  return [head].concat(body);
}
function entTemplateRows(name) {
  return [ENT[name].fields.filter((f) => f.kind !== 'pass').map((f) => f.x)];
}
function balancesRows() {
  const rows = [['item_code', 'warehouse_code', 'qty', 'unit_cost']];
  Object.keys(S.stock).forEach((k) => {
    const [itemId, whId] = k.split('|');
    const b = S.stock[k];
    if (!(b.qty > 0)) return;
    const it = itemOf(itemId);
    const w = whOf(whId);
    if (it && w) rows.push([it.code, w.code, b.qty, b.avg]);
  });
  return rows;
}
function movementRows() {
  const rows = [['date', 'type', 'item_code', 'item_name', 'warehouse_code', 'qty', 'unit_cost', 'doc_no', 'user']];
  S.movements.forEach((m) => {
    const it = itemOf(m.itemId);
    const w = whOf(m.whId);
    rows.push([m.date, m.type, it ? it.code : '', it ? nm(it) : '', w ? w.code : '', m.qty, m.cost, m.docNo || '', m.user || '']);
  });
  return rows;
}
ACT.entExport = (el) => {
  const name = el.dataset.ent;
  if (!can('excel.export') && !can(ENT[name].perm)) throw new Error(t('msg.noPerm'));
  downloadBlob(xlWrite([{ name, rows: entExportRows(name), header: true }]), name + '-' + todayISO() + '.xlsx');
};
ACT.entTemplate = (el) => {
  const name = el.dataset.ent;
  downloadBlob(xlWrite([{ name, rows: entTemplateRows(name), header: true }]), name + '-template.xlsx');
};
ACT.openingTemplate = () => {
  downloadBlob(xlWrite([{ name: 'opening_balances', rows: [['item_code', 'warehouse_code', 'qty', 'unit_cost']], header: true }]), 'opening-balances-template.xlsx');
};
ACT.exportAll = () => {
  if (!can('excel.export')) throw new Error(t('msg.noPerm'));
  const sheets = ENT_ORDER.filter((n) => n !== 'users' || can('admin.users')).map((n) => ({ name: n, rows: entExportRows(n), header: true }));
  sheets.push({ name: 'balances', rows: balancesRows(), header: true });
  sheets.push({ name: 'movements', rows: movementRows(), header: true });
  downloadBlob(xlWrite(sheets), 'hotel-warehouse-' + todayISO() + '.xlsx');
  audit('excel.export', 'workbook');
  saveState();
};

/* ----- Excel: import (validate → preview → apply) ----- */
function entParseSheet(name, rows, plan) {
  const E = ENT[name];
  const out = { total: 0, valid: [], errors: [] };
  if (!rows || !rows.length) return out;
  const head = rows[0].map((h) => String(h ?? '').trim().toLowerCase());
  const col = {};
  E.fields.forEach((f) => {
    let idx = head.indexOf(f.x.toLowerCase());
    if (idx < 0) idx = head.indexOf(f.k.toLowerCase());
    if (idx >= 0) col[f.k] = idx;
  });
  const missing = E.fields.filter((f) => f.req && col[f.k] === undefined).map((f) => f.x);
  if (missing.length) { out.errors.push({ row: 1, msg: t('xl.missingCol', { c: missing.join(', ') }) }); return out; }
  const seen = new Set();
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    if (!r || r.every((c) => String(c ?? '').trim() === '')) return;
    out.total++;
    try {
      const v = {};
      E.fields.forEach((f) => {
        const raw = col[f.k] === undefined ? '' : r[col[f.k]];
        const s = String(raw ?? '').trim();
        if (f.kind === 'num') v[f.k] = num(raw);
        else if (f.kind === 'bool') {
          const low = s.toLowerCase();
          if (s === '') v[f.k] = true;
          else if (['1', 'yes', 'y', 'true', 'نعم', 'x'].indexOf(low) !== -1) v[f.k] = true;
          else if (['0', 'no', 'n', 'false', 'لا'].indexOf(low) !== -1) v[f.k] = false;
          else throw new Error(t('xl.badBool', { c: f.x }));
        } else if (f.kind === 'ref') {
          if (!s) { if (f.req) throw new Error(t('common.required') + ': ' + f.x); v[f.k] = ''; }
          else {
            const tgt = ENT[f.ref].coll().find((x) => eqi(x[f.rkey], s));
            if (tgt) v[f.k] = tgt.id;
            else if (plan && plan[f.ref] && plan[f.ref].valid.some((x) => eqi(x.v[f.rkey], s))) v[f.k] = '@' + s;
            else throw new Error(t('xl.unknownRef', { c: s }));
          }
        } else if (f.kind === 'role') {
          const role = s.toLowerCase() || 'requester';
          if (ROLES.indexOf(role) === -1) throw new Error(t('xl.badRole', { c: s }));
          v[f.k] = role;
        } else v[f.k] = s;
      });
      if (!String(v[E.key] ?? '').trim()) throw new Error(t('common.required') + ': ' + E.key);
      const k2 = String(v[E.key]).trim().toLowerCase();
      if (seen.has(k2)) throw new Error(t('xl.dupInFile'));
      seen.add(k2);
      const existing = E.coll().find((x) => eqi(x[E.key], v[E.key]));
      out.valid.push({ row: rowNo, v, id: existing ? existing.id : null });
    } catch (e) {
      out.errors.push({ row: rowNo, msg: e.message });
    }
  });
  return out;
}

function openingParse(rows, plan) {
  const out = { total: 0, valid: [], errors: [] };
  if (!rows || !rows.length) return out;
  const head = rows[0].map((h) => String(h ?? '').trim().toLowerCase());
  const find = (names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const ci = find(['item_code', 'code', 'itemcode']);
  const cw = find(['warehouse_code', 'warehouse', 'wh_code']);
  const cq = find(['qty', 'quantity']);
  const cc = find(['unit_cost', 'cost']);
  if (ci < 0 || cw < 0 || cq < 0) { out.errors.push({ row: 1, msg: t('xl.missingCol', { c: 'item_code, warehouse_code, qty' }) }); return out; }
  const openSet = openingKeySet();
  const seen = new Set();
  const itemKnown = (c) => S.items.some((x) => eqi(x.code, c)) || !!(plan && plan.items && plan.items.valid.some((x) => eqi(x.v.code, c)));
  const whKnown = (c) => S.warehouses.some((x) => eqi(x.code, c)) || !!(plan && plan.warehouses && plan.warehouses.valid.some((x) => eqi(x.v.code, c)));
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    if (!r || r.every((c) => String(c ?? '').trim() === '')) return;
    out.total++;
    try {
      const code = String(r[ci] ?? '').trim();
      const wcode = String(r[cw] ?? '').trim();
      const q = num(r[cq]);
      if (!itemKnown(code)) throw new Error(t('xl.unknownItem') + ': ' + code);
      if (!whKnown(wcode)) throw new Error(t('xl.unknownWh') + ': ' + wcode);
      if (!(q > 0)) throw new Error(t('xl.badQty'));
      const k = code.toLowerCase() + '|' + wcode.toLowerCase();
      if (seen.has(k)) throw new Error(t('xl.dupInFile'));
      seen.add(k);
      const it = S.items.find((x) => eqi(x.code, code));
      const wh = S.warehouses.find((x) => eqi(x.code, wcode));
      if (it && wh && openSet.has(stockKey(it.id, wh.id))) throw new Error(t('xl.openingOnly'));
      out.valid.push({ row: rowNo, v: { itemCode: code, whCode: wcode, qty: q, unitCost: cc >= 0 ? num(r[cc]) : 0 } });
    } catch (e) {
      out.errors.push({ row: rowNo, msg: e.message });
    }
  });
  return out;
}

async function importFile(file, onlySheet) {
  let sheets;
  try { sheets = await xlRead(await file.arrayBuffer()); } catch (e) { throw new Error(t('xl.badFile')); }
  const map = {};
  if (onlySheet) {
    const pick = sheets.find((s) => s.name.toLowerCase() === onlySheet) || sheets[0];
    if (pick) map[onlySheet] = pick.rows;
  } else {
    sheets.forEach((s) => {
      const n = s.name.toLowerCase();
      if (ENT[n]) map[n] = s.rows;
      else if (n === 'balances' || n === 'opening_balances') map.opening_balances = s.rows;
    });
  }
  if (!Object.keys(map).length) throw new Error(t('xl.noKnownSheet'));
  const plan = {};
  IMPORT_ORDER.forEach((n) => {
    if (!map[n]) return;
    const perm = n === 'opening_balances' ? 'excel.import' : ENT[n].perm;
    if (!can(perm) && !can('excel.import')) {
      plan[n] = { total: 0, valid: [], errors: [{ row: 0, msg: t('msg.noPerm') }] };
      return;
    }
    plan[n] = n === 'opening_balances' ? openingParse(map[n], plan) : entParseSheet(n, map[n], plan);
  });
  showImportPreview(plan);
}

function showImportPreview(plan) {
  const names = Object.keys(plan);
  const summary = '<table><thead><tr><th>' + t('xl.sheet') + '</th><th class="num">' + t('xl.total') + '</th><th class="num">' + t('xl.validCol') + '</th><th class="num">' + t('xl.errorsCol') + '</th></tr></thead><tbody>'
    + names.map((n) => '<tr><td>' + n + '</td><td class="num">' + plan[n].total + '</td><td class="num">' + plan[n].valid.length + '</td><td class="num">' + plan[n].errors.length + '</td></tr>').join('')
    + '</tbody></table>';
  const errs = names.map((n) => plan[n].errors.slice(0, 8).map((e) => '<div class="small">' + n + ' · ' + t('xl.errLine', { n: e.row, msg: esc(e.msg) }) + '</div>').join('')).join('');
  openModal({
    title: t('xl.preview'),
    body: summary + (errs ? '<div style="margin-top:12px">' + errs + '</div>' : '') + '<p class="muted small" style="margin-top:12px">' + t('xl.rowsWarn') + '</p>' + (plan.users && plan.users.valid.length ? '<p class="muted small">' + t('xl.defaultPw') + '</p>' : ''),
    actions: [
      { label: t('common.cancel'), cls: 'ghost', onClick: () => {} },
      { label: t('xl.confirm'), cls: 'primary', onClick: async () => {
        const count = names.reduce((a, n) => a + plan[n].valid.length, 0);
        if (!count) throw new Error(t('xl.nothingValid'));
        const res = await applyImportPlan(plan);
        audit('excel.import', 'rows ' + res.ok);
        saveState();
        toast(t('xl.done', { n: res.ok }) + (res.fail ? ' · ' + t('xl.skipped', { n: res.fail }) : ''));
        renderRoute();
      } },
    ],
  });
}

async function applyImportPlan(plan) {
  let ok = 0;
  let fail = 0;
  for (const n of IMPORT_ORDER) {
    const p = plan[n];
    if (!p) continue;
    if (n === 'opening_balances') {
      p.valid.forEach((row) => {
        const it = S.items.find((x) => eqi(x.code, row.v.itemCode));
        const wh = S.warehouses.find((x) => eqi(x.code, row.v.whCode));
        if (!it || !wh) { fail++; return; }
        try { postOpening({ itemId: it.id, whId: wh.id, qty: row.v.qty, unitCost: row.v.unitCost }); ok++; } catch (e) { fail++; }
      });
    } else {
      for (const row of p.valid) {
        // new users without a password get the default one and must change it at first sign-in
        if (n === 'users' && !row.id && !String(row.v.password || '').trim()) { row.v.password = 'P@ssw0rd'; row.v.mustChange = true; }
        try { await entSave(n, row.id, row.v); ok++; } catch (e) { fail++; }
      }
    }
  }
  saveState();
  return { ok, fail };
}

ACT.entImport = async (el) => {
  const name = el.dataset.ent;
  if (!can('excel.import') && !can(ENT[name].perm)) throw new Error(t('msg.noPerm'));
  const f = await pickFile('.xlsx');
  if (f) await importFile(f, name);
};
ACT.importAll = async () => {
  if (!can('excel.import')) throw new Error(t('msg.noPerm'));
  const f = await pickFile('.xlsx');
  if (f) await importFile(f, null);
};

/* ----- Excel page ----- */
PAGES.excel = () => pageHead(t('xl.title'), '')
  + '<div class="grid two">'
  + '<div class="card"><h3>' + t('xl.exportAll') + '</h3><p class="muted small">' + t('xl.exportAllHint') + '</p>'
  + '<div class="actions"><button class="btn primary" data-act="exportAll">' + ico('out') + t('common.export') + '</button></div></div>'
  + '<div class="card"><h3>' + t('xl.importAll') + '</h3><p class="muted small">' + t('xl.importAllHint') + '</p>'
  + '<div class="drop">' + t('xl.drop') + '</div>'
  + '<div class="actions"><button class="btn primary" data-act="importAll">' + ico('inn') + t('xl.chooseFile') + '</button></div></div>'
  + '</div>'
  + '<div class="card"><h3>' + t('xl.templates') + '</h3><div class="actions">'
  + ENT_ORDER.filter((n) => can(ENT[n].perm)).map((n) => '<button class="btn sm" data-act="entTemplate" data-ent="' + n + '">' + t(ENT[n].title) + '</button>').join('')
  + '<button class="btn sm" data-act="openingTemplate">' + t('xl.templateOpening') + '</button></div>'
  + '<p class="muted small">' + t('xl.colsItems') + '</p><p class="muted small">' + t('xl.colsOpening') + '</p></div>';

/* ================= BALANCES & ITEM CARD ================= */
const BALF = { wh: '', cat: '' };
CHG.balF = (el) => { BALF[el.dataset.f] = el.value; renderRoute(); };

PAGES.balances = () => {
  const whs = BALF.wh ? S.warehouses.filter((w) => w.id === BALF.wh) : activeWarehouses();
  const filters = '<select data-chg="balF" data-f="wh" style="max-width:220px">'
    + sel('wh', opt(S.warehouses, (w) => nm(w), t('rep.allWh')), BALF.wh).replace(/^<select name="wh" >|<\/select>$/g, '').replace(/^<select name="wh"[^>]*>/, '')
    + '</select>';
  const filterCat = '<select data-chg="balF" data-f="cat" style="max-width:220px">'
    + opt(S.categories, (c) => nm(c), t('rep.allCat')).map((o) => '<option value="' + esc(o.v) + '"' + (o.v === BALF.cat ? ' selected' : '') + '>' + esc(o.l) + '</option>').join('')
    + '</select>';
  const whOpts = '<option value="">' + t('rep.allWh') + '</option>' + S.warehouses.map((w) => '<option value="' + w.id + '"' + (w.id === BALF.wh ? ' selected' : '') + '>' + esc(nm(w)) + '</option>').join('');
  const filtersHtml = '<select data-chg="balF" data-f="wh" style="max-width:220px">' + whOpts + '</select>' + filterCat;
  LIST.render = (q) => {
    const k = String(q || '').trim().toLowerCase();
    const rows = activeItems().filter((i) => !BALF.cat || i.categoryId === BALF.cat)
      .filter((i) => !k || (i.code + ' ' + i.ar + ' ' + i.en).toLowerCase().indexOf(k) !== -1)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((i) => {
        let tq = 0;
        let tv = 0;
        whs.forEach((w) => { const b = bal(i.id, w.id); tq += b.qty; if (b.qty > 0) tv += b.qty * b.avg; });
        return { i, tq: r4(tq), tv, avg: tq > 0 ? tv / tq : 0, status: tq <= 0 ? 'out' : (i.minStock > 0 && tq < i.minStock ? 'low' : 'ok') };
      });
    const cols = [
      { h: t('common.code'), c: (r) => esc(r.i.code) },
      { h: t('item.ar'), c: (r) => '<a href="#/item/' + r.i.id + '">' + esc(nm(r.i)) + '</a>' },
      { h: t('common.category'), c: (r) => esc(nm(catOf(r.i.categoryId))) },
      { h: t('common.unit'), c: (r) => esc(r.i.unit || '') },
    ].concat(whs.map((w) => ({ h: esc(nm(w)), c: (r) => qty(bal(r.i.id, w.id).qty), num: true })))
      .concat([
        { h: t('item.stockQty'), c: (r) => qty(r.tq), num: true },
        { h: t('item.cost'), c: (r) => money(r.avg), num: true },
        { h: t('item.stockValue'), c: (r) => money(r.tv), num: true },
        { h: t('item.minStock'), c: (r) => qty(r.i.minStock), num: true },
        { h: t('common.status'), c: (r) => stockBadge(r.status) },
      ]);
    return table(cols, rows);
  };
  return listPage(t('nav.balances'), filtersHtml, LIST.render);
};

PAGES.item = (id) => {
  if (!can('items.view')) return emptyBox(t('msg.noPerm'));
  const it = itemOf(id);
  if (!it) return emptyBox(t('common.noData'));
  const total = totalQty(it.id);
  const mv = S.movements.filter((m) => m.itemId === it.id).slice(-300).reverse();
  return pageHead(esc(it.code) + ' · ' + esc(nm(it)),
    '<button class="btn" data-act="print">' + t('common.print') + '</button><button class="btn ghost" data-act="back">' + t('common.back') + '</button>', stockBadge(stockStatus(it.id)))
    + '<div class="card"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px">'
    + '<div><div class="small muted">' + t('item.category') + '</div><div>' + esc(nm(catOf(it.categoryId))) + '</div></div>'
    + '<div><div class="small muted">' + t('common.unit') + '</div><div>' + esc(it.unit || '—') + '</div></div>'
    + '<div><div class="small muted">' + t('item.minStock') + '</div><div class="num">' + qty(it.minStock) + '</div></div>'
    + '<div><div class="small muted">' + t('item.reorder') + '</div><div class="num">' + qty(it.reorderQty) + '</div></div>'
    + '<div><div class="small muted">' + t('item.cost') + '</div><div class="num">' + money(it.cost) + '</div></div>'
    + '<div><div class="small muted">' + t('item.stockQty') + '</div><div class="num">' + qty(total) + '</div></div>'
    + '</div></div>'
    + '<div class="card" style="padding:0">' + table(S.warehouses.map((w) => ({ h: esc(nm(w)), c: (r) => qty(bal(it.id, r.id).qty), num: true })), S.warehouses) + '</div>'
    + '<h3>' + t('nav.reports') + ' · ' + t('rep.ledger') + '</h3>'
    + '<div class="card" style="padding:0">' + table([
      { h: t('common.date'), c: (r) => dt(r.date) },
      { h: t('rep.type'), c: (r) => esc(t('mv.' + r.type)) },
      { h: t('common.warehouse'), c: (r) => esc(whName(r.whId)) },
      { h: t('common.qty'), c: (r) => qty(r.qty), num: true },
      { h: t('common.cost'), c: (r) => money(r.cost), num: true },
      { h: t('common.no.doc'), c: (r) => esc(r.docNo || '') },
      { h: t('common.user'), c: (r) => esc(r.user || '') },
    ], mv) + '</div>';
};

/* ================= REPORTS ================= */
const REP = { tab: 'stock', from: addDays(todayISO(), -30), to: todayISO(), wh: '' };
const REP_TABS = [['stock', 'rep.stock'], ['ledger', 'rep.ledger'], ['low', 'rep.low'], ['issuesDept', 'rep.issuesDept'], ['pr', 'rep.pr']];
CHG.repF = (el) => { REP[el.dataset.f] = el.value; renderRoute(); };
ACT.repTab = (el) => { REP.tab = el.dataset.tab; renderRoute(); };

function reportData() {
  const okDate = (d) => (!REP.from || String(d) >= REP.from) && (!REP.to || String(d) <= REP.to);
  const whOk = (id) => !REP.wh || id === REP.wh;
  if (REP.tab === 'ledger') {
    const head = [t('common.date'), t('rep.type'), t('common.code'), t('item.ar'), t('common.warehouse'), t('common.qty'), t('common.cost'), t('common.no.doc'), t('common.user')];
    const rows = S.movements.filter((m) => okDate(m.date) && whOk(m.whId)).map((m) => [
      m.date, t('mv.' + m.type), itemOf(m.itemId) ? itemOf(m.itemId).code : '', nm(itemOf(m.itemId)), whName(m.whId), m.qty, m.cost, m.docNo || '', m.user || '',
    ]);
    return { head, rows, num: [5, 6] };
  }
  if (REP.tab === 'low') {
    const head = [t('common.code'), t('item.ar'), t('common.unit'), t('common.qty'), t('item.minStock'), t('item.reorder'), t('rep.suggest')];
    const rows = activeItems().map((i) => ({ i, q: totalQty(i.id) }))
      .filter((x) => x.i.minStock > 0 && x.q < x.i.minStock)
      .map((x) => [x.i.code, nm(x.i), x.i.unit || '', x.q, x.i.minStock, x.i.reorderQty, r4(Math.max(0, x.i.reorderQty - x.q))]);
    return { head, rows, num: [3, 4, 5, 6] };
  }
  if (REP.tab === 'issuesDept') {
    const head = [t('common.date'), t('common.no.doc'), t('is.dept'), t('common.code'), t('item.ar'), t('common.qty'), t('common.cost'), t('item.stockValue')];
    const rows = [];
    S.docs.is.filter((d) => okDate(d.date) && whOk(d.whId)).forEach((d) => d.lines.forEach((l) => {
      const it = itemOf(l.itemId);
      rows.push([d.date, d.no, deptName(d.deptId), it ? it.code : '', nm(it), l.qty, l.unitCost, r4(l.qty * l.unitCost)]);
    }));
    return { head, rows, num: [5, 6, 7] };
  }
  if (REP.tab === 'pr') {
    const head = [t('common.no.doc'), t('common.date'), t('pr.dept'), t('pr.requester'), t('pr.total'), t('common.status'), t('pr.received')];
    const rows = S.docs.pr.filter((p) => okDate(p.date)).map((p) => {
      const q = p.lines.reduce((a, l) => a + l.qty, 0);
      const rc = p.lines.reduce((a, l) => a + Math.min(l.received, l.qty), 0);
      return [p.no, p.date, deptName(p.deptId), userName(p.requesterId), p.total, t('st.' + p.status), q ? Math.round((rc / q) * 100) + '%' : '0%'];
    });
    return { head, rows, num: [4] };
  }
  // stock balances per item & warehouse
  const whs = REP.wh ? S.warehouses.filter((w) => w.id === REP.wh) : S.warehouses;
  const head = [t('common.code'), t('item.ar'), t('common.category'), t('common.warehouse'), t('common.qty'), t('item.cost'), t('item.stockValue'), t('item.minStock'), t('common.status')];
  const rows = [];
  activeItems().forEach((it) => whs.forEach((w) => {
    const b = bal(it.id, w.id);
    if (b.qty === 0 && !REP.wh) return;
    const st = b.qty <= 0 ? t('st.stock.out') : (it.minStock > 0 && b.qty < it.minStock ? t('st.stock.low') : t('st.stock.ok'));
    rows.push([it.code, nm(it), nm(catOf(it.categoryId)), nm(w), b.qty, b.avg, r4(b.qty * b.avg), it.minStock, st]);
  }));
  return { head, rows, num: [4, 5, 6, 7] };
}

PAGES.reports = () => {
  if (!can('reports.view')) return emptyBox(t('msg.noPerm'));
  const data = reportData();
  const tabs = '<div class="tabs">' + REP_TABS.map(([k, label]) => '<button class="' + (REP.tab === k ? 'active' : '') + '" data-act="repTab" data-tab="' + k + '">' + t(label) + '</button>').join('') + '</div>';
  const filters = '<div class="toolbar no-print">'
    + field(t('common.from'), '<input type="date" data-chg="repF" data-f="from" value="' + REP.from + '">', 'inline')
    + field(t('common.to'), '<input type="date" data-chg="repF" data-f="to" value="' + REP.to + '">', 'inline')
    + '<select data-chg="repF" data-f="wh" style="max-width:240px"><option value="">' + t('rep.allWh') + '</option>'
    + S.warehouses.map((w) => '<option value="' + w.id + '"' + (w.id === REP.wh ? ' selected' : '') + '>' + esc(nm(w)) + '</option>').join('') + '</select>'
    + '<span class="grow"></span>'
    + (can('excel.export') ? '<button class="btn" data-act="repExport">' + ico('out') + t('common.export') + '</button>' : '')
    + '<button class="btn" data-act="print">' + t('rep.print') + '</button></div>';
  const cols = data.head.map((h, i) => ({
    h: esc(h), num: data.num.indexOf(i) !== -1,
    c: (r) => {
      const v = r[i];
      if (typeof v === 'number') return data.num.indexOf(i) !== -1 ? qty(v) : String(v);
      return esc(v);
    },
  }));
  return pageHead(t('rep.title') || t('nav.reports'), '')
    + tabs + filters
    + '<div class="card" style="padding:0"><div class="muted small" style="padding:10px 14px">' + t('common.total') + ': ' + data.rows.length + '</div>'
    + table(cols, data.rows.slice(0, 1000).map((r) => r)) + '</div>'
    + (data.rows.length > 1000 ? '<p class="muted small">' + t('rep.capped') + '</p>' : '');
};
ACT.repExport = () => {
  const data = reportData();
  const rows = [data.head].concat(data.rows.map((r) => r.map((v) => (typeof v === 'number' ? v : String(v)))));
  downloadBlob(xlWrite([{ name: REP.tab, rows, header: true }]), 'report-' + REP.tab + '-' + todayISO() + '.xlsx');
};

/* ================= ROLES & PERMISSIONS ================= */
PAGES.roles = () => {
  if (!can('admin.roles')) return emptyBox(t('msg.noPerm'));
  const head = '<th>' + t('common.name') + '</th>' + ROLES.map((r) => '<th>' + t('role.' + r) + '</th>').join('');
  const rows = PERMS.map((p) => '<tr><td style="text-align:start">' + t('perm.' + p) + '</td>' + ROLES.map((r) => {
    const on = r === 'admin' || (S.roles[r] || []).indexOf(p) !== -1;
    return '<td><input type="checkbox" data-chg="perm" data-role="' + r + '" data-perm="' + p + '"' + (on ? ' checked' : '') + (r === 'admin' ? ' disabled' : '') + '></td>';
  }).join('') + '</tr>').join('');
  return pageHead(t('roles.title'), '<button class="btn danger" data-act="roleReset">' + t('roles.resetDefaults') + '</button>')
    + '<p class="muted small">' + t('roles.hint') + '</p>'
    + '<div class="card" style="padding:0"><div class="table-wrap"><table class="perm-matrix"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
};
CHG.perm = (el) => {
  const arr = S.roles[el.dataset.role] || (S.roles[el.dataset.role] = []);
  const i = arr.indexOf(el.dataset.perm);
  if (el.checked && i === -1) arr.push(el.dataset.perm);
  if (!el.checked && i !== -1) arr.splice(i, 1);
  audit('roles.change', el.dataset.role + ': ' + el.dataset.perm + '=' + el.checked);
  saveState();
};
ACT.roleReset = () => confirmBox(t('roles.resetDefaults') + '?', () => {
  S.roles = JSON.parse(JSON.stringify(ROLE_DEFAULTS));
  audit('roles.reset', 'defaults');
  saveState();
  renderRoute();
});

/* ================= SYSTEM SETTINGS ================= */
PAGES.settings = () => {
  if (!can('admin.settings')) return emptyBox(t('msg.noPerm'));
  const s = S.settings;
  const tiers = s.tiers.slice().sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  const tierRows = tiers.map((tr, i) => '<div class="line-row" style="grid-template-columns:1fr 1fr auto">'
    + '<input type="number" min="0" step="any" name="tu' + i + '" value="' + (tr.upTo === null ? '' : tr.upTo) + '" placeholder="' + t('set.noLimit') + '">'
    + '<select name="tl' + i + '">' + [1, 2, 3, 4].map((n) => '<option value="' + n + '"' + (tr.levels === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>'
    + '<button type="button" class="icon-btn" data-act="tierDel" data-i="' + i + '">' + ico('x') + '</button></div>').join('');
  const chain = [0, 1, 2, 3].map((i) => field(t('pr.level', { n: i + 1 }), sel('ch' + i, ROLES.filter((r) => r !== 'admin').map((r) => ({ v: r, l: t('role.' + r) })), s.chain[i] || 'manager'))).join('');
  return pageHead(t('set.title'), '<button class="btn primary" data-act="settingsSave">' + ico('check') + t('common.save') + '</button>')
    + '<form id="settings-form" class="card"><div class="form-grid">'
    + field(t('set.hotelAr'), inp('hotelAr', s.hotelAr))
    + field(t('set.hotelEn'), inp('hotelEn', s.hotelEn))
    + field(t('set.currency'), inp('currency', s.currency))
    + '<label class="field inline"><input type="checkbox" name="allowNeg"' + (s.allowNegative ? ' checked' : '') + '> ' + t('set.allowNeg') + '</label>'
    + '<label class="field inline"><input type="checkbox" name="lowAlert"' + (s.lowAlert ? ' checked' : '') + '> ' + t('set.lowAlert') + '</label>'
    + '</div></form>'
    + '<div class="card"><div class="panel-head"><h3>' + t('set.thresholds') + '</h3><button class="btn sm" data-act="tierAdd">' + ico('plus') + t('set.addTier') + '</button></div>'
    + '<p class="muted small">' + t('set.thresholdsHint') + '</p>'
    + '<form id="tier-form"><div class="lines-head line-row" style="grid-template-columns:1fr 1fr auto"><span>' + t('set.upTo') + '</span><span>' + t('set.levels') + '</span><span></span></div>'
    + '<div class="lines">' + tierRows + '</div></form></div>'
    + '<div class="card"><h3>' + t('set.chain') + '</h3><p class="muted small">' + t('set.chainHint') + '</p><div class="form-grid" id="chain-form">' + chain + '</div></div>';
};
ACT.tierAdd = () => {
  S.settings.tiers.push({ upTo: 100000, levels: 2 });
  saveState();
  renderRoute();
};
ACT.tierDel = (el) => {
  const sorted = S.settings.tiers.slice().sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  if (sorted.length <= 1) throw new Error(t('set.needTier'));
  sorted.splice(+el.dataset.i, 1);
  S.settings.tiers = sorted;
  saveState();
  renderRoute();
};
ACT.settingsSave = () => {
  const f = readForm($('#settings-form'));
  const c = readForm($('#tier-form'));
  const ch = readForm($('#chain-form'));
  const tiers = [];
  for (let i = 0; c['tl' + i] !== undefined; i++) {
    const raw = c['tu' + i];
    const upTo = raw === '' || raw === undefined ? null : num(raw);
    if (upTo !== null && !(upTo > 0)) throw new Error(t('set.badTier'));
    tiers.push({ upTo, levels: +c['tl' + i] });
  }
  if (!tiers.length) throw new Error(t('set.needTier'));
  tiers.sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  tiers[tiers.length - 1].upTo = null;
  S.settings.hotelAr = f.hotelAr.trim();
  S.settings.hotelEn = f.hotelEn.trim();
  syncCompanyName();
  S.settings.currency = (f.currency || 'EGP').trim();
  S.settings.allowNegative = !!f.allowNeg;
  S.settings.lowAlert = !!f.lowAlert;
  S.settings.tiers = tiers;
  S.settings.chain = [ch.ch0, ch.ch1, ch.ch2, ch.ch3];
  audit('settings.save', 'system settings');
  saveState();
  toast(t('set.saved'));
  renderRoute();
};

/* ================= COMPANIES (several isolated companies on this device) ================= */
function companyStats(c) {
  const st = COMPANY && COMPANY.id === c.id ? S : Store.get(c.key, null);
  if (!st) return null;
  const docs = Object.values(st.docs || {}).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
  return { items: (st.items || []).length, users: (st.users || []).length, docs, currency: (st.settings || {}).currency || '' };
}
function companyFormHtml(v, isNew) {
  return '<div class="form-grid" style="grid-template-columns:1fr">'
    + field(t('set.hotelAr'), inp('hotelAr', v.nameAr || ''))
    + field(t('set.hotelEn'), inp('hotelEn', v.nameEn || ''))
    + (isNew ? field(t('set.currency'), inp('currency', 'EGP')) + '<label class="field inline"><input type="checkbox" name="sample"> ' + t('auth.demoData') + '</label>' : '')
    + '</div>';
}
PAGES.companies = () => {
  if (!can('admin.settings')) return emptyBox(t('msg.noPerm'));
  const cols = [
    { h: t('common.name'), c: (c) => esc(companyLabel(c)) + (COMPANY && COMPANY.id === c.id ? ' <span class="badge ok">' + t('co.current') + '</span>' : '') },
    { h: t('co.stats'), c: (c) => { const s = companyStats(c); return s ? esc(t('co.counts', { i: s.items, u: s.users, d: s.docs })) : '—'; } },
    { h: t('set.currency'), c: (c) => { const s = companyStats(c); return s ? esc(s.currency) : '—'; } },
    { h: t('common.actions'), c: (c) => {
      const cur = COMPANY && COMPANY.id === c.id;
      return (cur ? '' : '<button class="btn sm" data-act="coOpen" data-id="' + c.id + '">' + t('co.open') + '</button> ')
        + '<button class="btn sm" data-act="coRename" data-id="' + c.id + '">' + t('co.rename') + '</button> '
        + '<button class="btn sm danger" data-act="coDelete" data-id="' + c.id + '"' + (cur ? ' disabled' : '') + '>' + t('co.delete') + '</button>';
    } },
  ];
  return pageHead(t('co.title'), '<button class="btn primary" data-act="coNew">' + ico('bldg') + t('co.new') + '</button>')
    + '<p class="muted small">' + t('co.hint') + '</p>'
    + '<div class="card" style="padding:0">' + table(cols, COMPANIES, t('common.noData')) + '</div>';
};
ACT.coNew = () => {
  openModal({
    title: t('co.new'), narrow: true, body: companyFormHtml({}, true),
    actions: [
      { label: t('common.cancel'), cls: 'ghost', onClick: () => {} },
      { label: t('common.save'), cls: 'primary', onClick: async (ctx) => {
        await createCompany(readForm(ctx.el));
        toast(t('co.created'));
        renderApp();
      } },
    ],
  });
};
ACT.coOpen = async (el) => {
  await switchToCompany(el.dataset.id);
  toast(t('co.switched'));
};
ACT.coRename = (el) => {
  const rec = COMPANIES.find((c) => c.id === el.dataset.id);
  if (!rec) return;
  openModal({
    title: t('co.rename'), narrow: true, body: companyFormHtml(rec, false),
    actions: [
      { label: t('common.cancel'), cls: 'ghost', onClick: () => {} },
      { label: t('common.save'), cls: 'primary', onClick: (ctx) => {
        const f = readForm(ctx.el);
        renameCompany(rec.id, f.hotelAr, f.hotelEn);
        toast(t('co.renamed'));
        renderApp();
      } },
    ],
  });
};
ACT.coDelete = (el) => {
  const rec = COMPANIES.find((c) => c.id === el.dataset.id);
  if (!rec) return;
  confirmBox(t('co.deleteWarn', { name: companyLabel(rec) }), () => {
    removeCompany(rec.id);
    toast(t('co.deleted'));
    renderApp();
  });
};

/* ================= BACKUP / RESTORE / RESET ================= */
PAGES.backup = () => {
  if (!can('admin.backup')) return emptyBox(t('msg.noPerm'));
  return pageHead(t('bk.title'), '')
    + '<div class="grid two">'
    + '<div class="card"><h3>' + t('bk.export') + '</h3><p class="muted small">' + t('bk.hint') + '</p><div class="actions"><button class="btn primary" data-act="backupExport">' + ico('out') + t('bk.export') + '</button></div></div>'
    + '<div class="card"><h3>' + t('bk.import') + '</h3><p class="muted small">' + t('bk.warn') + '</p><div class="actions"><button class="btn" data-act="backupImport">' + ico('inn') + t('bk.import') + '</button></div></div>'
    + '<div class="card"><h3 style="color:var(--danger)">' + t('bk.reset') + '</h3><p class="muted small">' + t('bk.resetWarn') + '</p><div class="actions"><button class="btn danger" data-act="backupReset">' + t('bk.reset') + '</button></div></div>'
    + '</div>';
};
ACT.backupExport = () => {
  audit('backup.export', 'json');
  saveState();
  downloadText(JSON.stringify(S), 'hotel-warehouse-backup-' + todayISO() + '.json');
};
ACT.backupImport = async () => {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch (e) { throw new Error(t('bk.badFile')); }
  if (!data || data.schema !== 1 || !Array.isArray(data.users) || !data.settings) throw new Error(t('bk.badFile'));
  openModal({
    title: t('bk.import'), narrow: true, body: '<p>' + t('bk.warn') + '</p>',
    actions: [
      { label: t('common.cancel'), cls: 'ghost', onClick: () => {} },
      { label: t('common.confirm'), cls: 'danger', onClick: () => {
        Store.set(dataKey(), data);
        S = loadState();
        CURRENT = S.users.find((u) => CURRENT && u.id === CURRENT.id) || null;
        if (!CURRENT) Session.remove('hwm.uid');
        saveState();
        renderApp();
        toast(t('bk.done'));
      } },
    ],
  });
};
ACT.backupReset = () => confirmBox(t('bk.resetWarn'), async () => {
  const old = S.settings;
  S = await createInitialState(old.hotelAr, old.hotelEn, old.currency);
  CURRENT = S.users[0];
  audit('system.reset', 'fresh start');
  saveState();
  Session.set('hwm.uid', CURRENT.id);
  renderApp();
  toast(t('bk.done'));
});

async function createInitialState(hotelAr, hotelEn, currency) {
  const state = seedMaster(blankState());
  state.settings.hotelAr = hotelAr || '';
  state.settings.hotelEn = hotelEn || '';
  state.settings.currency = currency || 'EGP';
  state.users.push({
    id: uid(), username: 'administrator', name: 'Administrator', role: 'admin', active: true,
    pass: await makePasswordRecord('P@ssw0rd'), mustChange: true, createdAt: nowIso(), lastLogin: null,
  });
  state.adminSeeded = true;
  return state;
}

/* ================= AUDIT LOG ================= */
PAGES.audit = () => {
  if (!can('admin.audit')) return emptyBox(t('msg.noPerm'));
  LIST.render = (q) => {
    const k = String(q || '').trim().toLowerCase();
    const rows = S.audit.filter((a) => !k || (a.action + ' ' + a.detail + ' ' + a.user).toLowerCase().indexOf(k) !== -1).slice(0, 500);
    return table([
      { h: t('common.date'), c: (r) => esc(r.ts.slice(0, 19).replace('T', ' ')) },
      { h: t('common.user'), c: (r) => esc(r.user) },
      { h: t('audit.action'), c: (r) => esc(r.action) },
      { h: t('audit.detail'), c: (r) => esc(r.detail) },
    ], rows, t('audit.empty'));
  };
  return listPage(t('audit.title'), '', LIST.render);
};

/* ================= LICENCE PAGE ================= */
PAGES.license = () => {
  const st = LIC.status || {};
  const statusText = st.status === 'LICENSED'
    ? (st.lifetime ? t('lic.lifetime') : t('lic.daysLeft', { n: st.days }) + ' · ' + st.expiry)
    : st.status === 'TRIAL' ? t('lic.trialActive') + ' · ' + t('lic.daysLeft', { n: st.days })
    : t('lic.expired');
  return pageHead(t('lic.title'), '')
    + '<div class="grid two">'
    + '<div class="card"><h3>' + statusBadge(st.status === 'LICENSED' ? 'APPROVED' : st.status === 'TRIAL' ? 'PENDING' : 'REJECTED') + '</h3>'
    + '<p>' + esc(statusText) + '</p>'
    + (st.customer ? '<p class="muted small">' + t('lic.customer') + ': ' + esc(st.customer) + ' · ' + t('lic.plan') + ': ' + esc(st.plan || '') + '</p>' : '')
    + '<p class="muted small">' + t('lic.machine') + ': <span class="num">' + getMachineId() + '</span></p>'
    + '<p class="muted small">' + t('lic.trialRule', { d: APP.trialDays, r: APP.reminderEveryDays }) + '</p></div>'
    + '<div class="card">' + licenseForm() + '</div>'
    + '</div>';
};

/* ================= USERS (via entPage) ================= */
/* PAGES.users is defined in the master data section above. */
