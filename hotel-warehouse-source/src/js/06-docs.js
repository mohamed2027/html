/* ===== Business documents: purchase requests, approvals, receipts, issues, transfers, counts ===== */

function requirePerm(p) {
  if (!can(p)) throw new Error(t('msg.noPerm'));
}

/* Validates item lines: at least one, positive quantities, no duplicate items. */
function cleanLines(rawLines, needCost) {
  const lines = (rawLines || []).filter((l) => l && l.itemId);
  if (!lines.length) throw new Error(t('msg.noLines'));
  const seen = new Set();
  return lines.map((l) => {
    if (!itemOf(l.itemId)) throw new Error(t('msg.pick'));
    if (seen.has(l.itemId)) throw new Error(t('msg.dupLine') + ': ' + nm(itemOf(l.itemId)));
    seen.add(l.itemId);
    const q = num(l.qty);
    if (!(q > 0)) throw new Error(t('msg.badQty') + ': ' + nm(itemOf(l.itemId)));
    const out = { itemId: l.itemId, qty: r4(q) };
    if (needCost) out.unitCost = r4(num(l.unitCost));
    return out;
  });
}

/* ----- Purchase requests ----- */
function savePR(data, submit) {
  requirePerm('pr.create');
  if (!data.deptId) throw new Error(t('msg.pickDept'));
  const lines = cleanLines(data.lines, false).map((l, i) => ({
    itemId: l.itemId, qty: l.qty, estCost: r4(num((data.lines || []).filter((x) => x && x.itemId)[i].estCost)), received: 0,
  }));
  let pr = data.id ? S.docs.pr.find((x) => x.id === data.id) : null;
  if (pr && pr.status !== 'DRAFT') throw new Error(t('msg.cannotEdit'));
  if (!pr) {
    pr = { id: uid(), no: nextDocNo('pr'), date: todayISO(), requesterId: CURRENT.id, status: 'DRAFT', steps: [], createdAt: nowIso() };
    S.docs.pr.push(pr);
  }
  pr.deptId = data.deptId;
  pr.neededBy = data.neededBy || '';
  pr.note = data.note || '';
  pr.lines = lines;
  pr.total = r4(lines.reduce((a, l) => a + l.qty * l.estCost, 0));
  if (submit) {
    pr.steps = buildApprovalSteps(pr.total);
    pr.status = pr.steps.length ? 'PENDING' : 'APPROVED';
    pr.submittedAt = nowIso();
    if (pr.status === 'APPROVED') pr.approvedAt = nowIso();
    audit('pr.submit', pr.no);
  } else {
    pr.status = 'DRAFT';
  }
  saveState();
  return pr;
}

function currentApprovalStep(pr) {
  return pr.steps.find((s) => s.status === 'PENDING') || null;
}
function canActOnStep(pr) {
  const step = currentApprovalStep(pr);
  if (!step || !CURRENT) return false;
  if (pr.requesterId === CURRENT.id) return false;
  if (!can('pr.approve')) return false;
  if (CURRENT.role === 'admin') return true;
  if (CURRENT.role !== step.role) return false;
  // a department manager with a department set only handles that department's requests
  if (step.role === 'manager' && CURRENT.deptId && CURRENT.deptId !== pr.deptId) return false;
  return true;
}

function decidePR(prId, approve, reason) {
  const pr = S.docs.pr.find((x) => x.id === prId);
  if (!pr || pr.status !== 'PENDING') throw new Error(t('msg.cannotEdit'));
  if (pr.requesterId === CURRENT.id) throw new Error(t('msg.selfApprove'));
  const step = currentApprovalStep(pr);
  if (!step) throw new Error(t('msg.cannotEdit'));
  if (!canActOnStep(pr)) throw new Error(t('msg.notYourStep'));
  if (approve && step.role === 'purchasing' && !pr.pricedAt) throw new Error(t('msg.mustPrice'));
  if (!approve && !String(reason || '').trim()) throw new Error(t('msg.needReason'));
  step.status = approve ? 'APPROVED' : 'REJECTED';
  step.by = CURRENT.id;
  step.at = nowIso();
  step.note = reason || '';
  if (!approve) {
    pr.status = 'REJECTED';
    audit('pr.reject', pr.no);
  } else if (pr.steps.every((s) => s.status === 'APPROVED')) {
    pr.status = 'APPROVED';
    pr.approvedAt = nowIso();
    audit('pr.approve', pr.no);
  } else {
    audit('pr.approve.step', pr.no + ' L' + step.level);
  }
  saveState();
  return pr;
}

/* Purchasing prices the request during its own step. The approval chain is fixed at submission, so repricing never changes it. */
function repricePR(prId, costs) {
  const pr = S.docs.pr.find((x) => x.id === prId);
  if (!pr || pr.status !== 'PENDING') throw new Error(t('msg.cannotEdit'));
  const step = currentApprovalStep(pr);
  if (!step || step.role !== 'purchasing' || !canActOnStep(pr)) throw new Error(t('msg.notYourStep'));
  pr.lines.forEach((l, i) => {
    const v = num(costs['c' + i]);
    if (!(v >= 0)) throw new Error(t('common.required'));
    l.estCost = r4(v);
  });
  pr.total = r4(pr.lines.reduce((a, l) => a + l.qty * l.estCost, 0));
  pr.pricedAt = nowIso();
  pr.pricedBy = CURRENT.id;
  audit('pr.reprice', pr.no + ' ' + pr.total);
  saveState();
  return pr;
}

/* ----- Goods receipts (optionally against an approved purchase request) ----- */
function postGR(data) {
  requirePerm('receipt.post');
  if (!data.whId) throw new Error(t('msg.pickWh'));
  const lines = cleanLines(data.lines, true);
  let pr = null;
  if (data.prId) {
    pr = S.docs.pr.find((x) => x.id === data.prId);
    if (!pr || (pr.status !== 'APPROVED' && pr.status !== 'PARTIAL')) throw new Error(t('msg.notApproved'));
    lines.forEach((l) => {
      const pl = pr.lines.find((x) => x.itemId === l.itemId);
      if (!pl) throw new Error(t('msg.noLines') + ': ' + nm(itemOf(l.itemId)));
      const remaining = r4(pl.qty - pl.received);
      if (l.qty > remaining + 1e-9) throw new Error(t('msg.overRemaining', { n: qty(remaining) }));
    });
  }
  const gr = {
    id: uid(), no: nextDocNo('gr'), date: data.date || todayISO(), supplierId: data.supplierId || '',
    whId: data.whId, prId: pr ? pr.id : null, invoice: data.invoice || '', note: data.note || '',
    lines: [], status: 'POSTED', user: CURRENT.username, createdAt: nowIso(),
  };
  lines.forEach((l) => {
    const cost = stockIn({ itemId: l.itemId, whId: gr.whId, qty: l.qty, unitCost: l.unitCost, type: 'RECEIPT', docNo: gr.no, note: gr.invoice, date: gr.date });
    gr.lines.push({ itemId: l.itemId, qty: l.qty, unitCost: cost });
  });
  if (pr) {
    pr.lines.forEach((pl) => {
      const got = gr.lines.find((x) => x.itemId === pl.itemId);
      if (got) pl.received = r4(pl.received + got.qty);
    });
    pr.status = pr.lines.every((pl) => pl.received + 1e-9 >= pl.qty) ? 'CLOSED' : 'PARTIAL';
  }
  S.docs.gr.push(gr);
  audit('gr.post', gr.no);
  saveState();
  return gr;
}

/* ----- Store issues (إذن صرف) ----- */
function checkAvailability(lines, whId) {
  lines.forEach((l) => {
    const avail = bal(l.itemId, whId).qty;
    if (!S.settings.allowNegative && avail + 1e-9 < l.qty) {
      throw new Error(t('msg.stockShort', { item: nm(itemOf(l.itemId)), avail: qty(avail) }));
    }
  });
}

function postIS(data) {
  requirePerm('issue.post');
  if (!data.whId) throw new Error(t('msg.pickWh'));
  if (!data.deptId) throw new Error(t('msg.pickDept'));
  const lines = cleanLines(data.lines, false);
  checkAvailability(lines, data.whId);
  const is = {
    id: uid(), no: nextDocNo('is'), date: data.date || todayISO(), whId: data.whId, deptId: data.deptId,
    receiver: data.receiver || '', note: data.note || '', lines: [], status: 'POSTED', user: CURRENT.username, createdAt: nowIso(),
  };
  lines.forEach((l) => {
    const cost = stockOut({ itemId: l.itemId, whId: is.whId, qty: l.qty, type: 'ISSUE', docNo: is.no, note: depOf(is.deptId) ? nm(depOf(is.deptId)) : '', date: is.date });
    is.lines.push({ itemId: l.itemId, qty: l.qty, unitCost: cost, value: r4(cost * l.qty) });
  });
  S.docs.is.push(is);
  audit('is.post', is.no);
  saveState();
  return is;
}

/* ----- Warehouse transfers ----- */
function postTR(data) {
  requirePerm('transfer.post');
  if (!data.fromWh) throw new Error(t('msg.pickFrom'));
  if (!data.toWh) throw new Error(t('msg.pickTo'));
  if (data.fromWh === data.toWh) throw new Error(t('tr.sameWh'));
  const lines = cleanLines(data.lines, false);
  checkAvailability(lines, data.fromWh);
  const tr = {
    id: uid(), no: nextDocNo('tr'), date: data.date || todayISO(), fromWh: data.fromWh, toWh: data.toWh,
    note: data.note || '', lines: [], status: 'POSTED', user: CURRENT.username, createdAt: nowIso(),
  };
  lines.forEach((l) => {
    const cost = stockOut({ itemId: l.itemId, whId: tr.fromWh, qty: l.qty, type: 'TRANSFER_OUT', docNo: tr.no, note: '', date: tr.date });
    stockIn({ itemId: l.itemId, whId: tr.toWh, qty: l.qty, unitCost: cost, type: 'TRANSFER_IN', docNo: tr.no, note: '', date: tr.date });
    tr.lines.push({ itemId: l.itemId, qty: l.qty, unitCost: cost });
  });
  S.docs.tr.push(tr);
  audit('tr.post', tr.no);
  saveState();
  return tr;
}

/* ----- Stock count: counted quantities are compared with the ledger and adjusted ----- */
function postCN(data) {
  requirePerm('count.post');
  if (!data.whId) throw new Error(t('msg.pickWh'));
  const rows = (data.lines || []).filter((l) => l && l.itemId && l.counted !== '' && l.counted !== null && l.counted !== undefined);
  if (!rows.length) throw new Error(t('msg.countNothing'));
  const cn = {
    id: uid(), no: nextDocNo('cn'), date: data.date || todayISO(), whId: data.whId, note: data.note || '',
    lines: [], status: 'POSTED', user: CURRENT.username, createdAt: nowIso(),
  };
  let adjusted = 0;
  rows.forEach((l) => {
    const system = bal(l.itemId, cn.whId).qty;
    const counted = r4(num(l.counted));
    const diff = r4(counted - system);
    cn.lines.push({ itemId: l.itemId, system, counted, diff });
    if (Math.abs(diff) > 1e-9) {
      adjusted++;
      if (diff > 0) stockIn({ itemId: l.itemId, whId: cn.whId, qty: diff, unitCost: 0, type: 'ADJUST', docNo: cn.no, note: 'count', date: cn.date });
      else stockOut({ itemId: l.itemId, whId: cn.whId, qty: -diff, type: 'ADJUST', docNo: cn.no, note: 'count', date: cn.date });
    }
  });
  S.docs.cn.push(cn);
  audit('cn.post', cn.no + ' (' + adjusted + ')');
  saveState();
  return { doc: cn, adjusted };
}

/* ----- Opening balances (used by Excel import and sample data) ----- */
function openingKeySet() {
  const set = new Set();
  S.movements.forEach((m) => { if (m.type === 'OPENING') set.add(stockKey(m.itemId, m.whId)); });
  return set;
}
function postOpening({ itemId, whId, qty: q, unitCost, date }) {
  return stockIn({ itemId, whId, qty: q, unitCost, type: 'OPENING', docNo: 'OPENING', note: '', date: date || todayISO() });
}

/* ----- Sample data (for trial / demonstration only) ----- */
function loadSampleData() {
  const main = S.warehouses.find((w) => w.code === 'MAIN');
  const fnb = S.warehouses.find((w) => w.code === 'FNB');
  const hk = S.warehouses.find((w) => w.code === 'HK');
  S.items.forEach((it, i) => {
    if (i % 9 === 4) return; // leave a few items at zero on purpose
    const base = Math.max(it.minStock * 3, 10);
    postOpening({ itemId: it.id, whId: main.id, qty: base, unitCost: it.cost });
    if (it.code.indexOf('FB-') === 0 || it.code.indexOf('BV-') === 0) postOpening({ itemId: it.id, whId: fnb.id, qty: Math.round(base / 2) || 1, unitCost: it.cost });
    if (it.code.indexOf('HK-') === 0 || it.code.indexOf('CL-') === 0) postOpening({ itemId: it.id, whId: hk.id, qty: Math.round(base / 3) || 1, unitCost: it.cost });
  });
  const items = S.items.slice(0, 3);
  const dept = S.departments.find((d) => d.code === 'HK') || S.departments[0];
  savePR({
    deptId: dept.id, neededBy: addDays(todayISO(), 7), note: 'طلب تجريبي / sample request',
    lines: items.map((it) => ({ itemId: it.id, qty: it.minStock * 2, estCost: it.cost })),
  }, true);
  audit('sample.load', 'sample data');
  saveState();
}

/* ----- Helpers for views ----- */
function docItemsSummary(lines) {
  return (lines || []).length + ' ' + t('common.lines');
}
