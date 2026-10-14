/* ===== UI: dashboard, purchasing, approvals, store documents ===== */

/* ----- Shared helpers for documents ----- */
function navTo(path) {
  FORM.key = null;
  if (location.hash === '#/' + path) renderRoute();
  else go(path);
}
const userName = (id) => { const u = userOf(id); return u ? u.name : '—'; };
const deptName = (id) => { const d = depOf(id); return d ? nm(d) : '—'; };
const whName = (id) => { const w = whOf(id); return w ? nm(w) : '—'; };
const supName = (id) => { const s = supOf(id); return s ? s.name : '—'; };

function initDocForm(key, lines, extra) {
  if (FORM.key === key) return;
  FORM.key = key;
  FORM.lines = lines;
  FORM.recalc = null;
  FORM.costCol = false;
  FORM.whId = '';
  Object.assign(FORM, extra || {});
}
function moneyRecalc() {
  let total = 0;
  FORM.lines.forEach((l, i) => {
    const v = num(l.qty) * num(l.cost);
    total += v;
    const el = document.querySelector('[data-tot="' + i + '"]');
    if (el) el.textContent = money(v);
  });
  const tEl = document.getElementById('doc-total');
  if (tEl) tEl.textContent = money(total) + ' ' + (S.settings.currency || '');
}
function diffRecalc() {
  FORM.lines.forEach((l, i) => {
    const el = document.querySelector('[data-diff="' + i + '"]');
    if (!el) return;
    if (l.counted === '' || l.counted === undefined || l.counted === null) { el.textContent = '—'; return; }
    el.textContent = qty(r4(num(l.counted) - bal(l.itemId, FORM.whId).qty));
  });
}
const lineItemSel = (i, l, withCost) => sel('it' + i, opt(activeItems().slice().sort((a, b) => a.code.localeCompare(b.code)), itemLabel, t('msg.pick')), l.itemId,
  'data-chg="lfItem" data-i="' + i + '"');
const lineRemoveBtn = (i) => '<button class="icon-btn" data-act="delLine" data-i="' + i + '" title="' + t('common.delete') + '">' + ico('x') + '</button>';
const numCell = (i, field, value) => '<input type="number" step="any" min="0" data-in="lf" data-lf="' + field + '" data-i="' + i + '" value="' + esc(value ?? '') + '">';

INP.lf = (el) => {
  const i = +el.dataset.i;
  const L = FORM.lines[i];
  if (!L) return;
  L[el.dataset.lf] = el.value;
  if (FORM.recalc) FORM.recalc();
};
CHG.lfItem = (el) => {
  const i = +el.dataset.i;
  const L = FORM.lines[i];
  if (!L) return;
  L.itemId = el.value;
  const item = itemOf(el.value);
  if (FORM.costCol && item && (L.cost === '' || L.cost === undefined)) L.cost = item.cost;
  renderRoute();
};
ACT.addLine = () => {
  FORM.lines.push({ itemId: '', qty: '', cost: '' });
  renderRoute();
};
ACT.delLine = (el) => {
  const i = +el.dataset.i;
  if (FORM.lines.length > 1) FORM.lines.splice(i, 1);
  else FORM.lines[0] = { itemId: '', qty: '', cost: '' };
  renderRoute();
};

/* Read-only document view used by PR (summary), GR, IS, TR and CN */
function docView(title, status, metaPairs, cols, rows, extraHtml) {
  const meta = metaPairs.map((p) => '<div><div class="small muted">' + p[0] + '</div><div>' + p[1] + '</div></div>').join('');
  return pageHead(title, '<button class="btn" data-act="print">' + ico('doc') + t('common.print') + '</button>'
    + '<button class="btn ghost" data-act="back">' + t('common.back') + '</button>', status ? statusBadge(status) : '')
    + '<div class="card"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px">' + meta + '</div></div>'
    + '<div class="card" style="padding:0">' + table(cols, rows) + '</div>' + (extraHtml || '');
}
ACT.print = () => window.print();
ACT.back = () => { history.length > 1 ? history.back() : go('dashboard'); };

/* ================= DASHBOARD ================= */
const CHART_COLORS = ['#1f6feb', '#0ea5a4', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#64748b', '#ec4899'];

function barsSvg(labels, a, b, labelA, labelB) {
  const W = 640, H = 230, pl = 40, pb = 26, pt = 10;
  const max = Math.max(4, ...a, ...b);
  const n = labels.length;
  const slot = (W - pl - 10) / n;
  const bw = Math.max(3, slot * 0.34);
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const y = pt + (H - pt - pb) * (1 - k / 4);
    g += '<line class="grid-line" x1="' + pl + '" x2="' + (W - 6) + '" y1="' + y + '" y2="' + y + '"/>'
      + '<text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(max * k / 4) + '</text>';
  }
  labels.forEach((lb, i) => {
    const x0 = pl + i * slot + slot * 0.14;
    const ha = (a[i] / max) * (H - pt - pb);
    const hb = (b[i] / max) * (H - pt - pb);
    g += '<rect x="' + x0 + '" y="' + (H - pb - ha) + '" width="' + bw + '" height="' + ha + '" rx="3" style="fill:var(--primary)"><title>' + lb + ' · ' + labelA + ': ' + a[i] + '</title></rect>';
    g += '<rect x="' + (x0 + bw + 2) + '" y="' + (H - pb - hb) + '" width="' + bw + '" height="' + hb + '" rx="3" style="fill:var(--accent)"><title>' + lb + ' · ' + labelB + ': ' + b[i] + '</title></rect>';
    if (i % 2 === 0) g += '<text x="' + (x0 + bw) + '" y="' + (H - 7) + '" text-anchor="middle">' + lb + '</text>';
  });
  return '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="chart">' + g + '</svg>';
}
function donutSvg(parts, centerTop, centerBottom) {
  const size = 190, thick = 24;
  const r = (size - thick) / 2;
  const C = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + p.value, 0);
  let off = 0;
  let g = '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" style="stroke:var(--surface-2)" stroke-width="' + thick + '"/>';
  if (total > 0) {
    parts.forEach((p) => {
      const len = (p.value / total) * C;
      if (len <= 0) return;
      g += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + p.color + '" stroke-width="' + thick
        + '" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"><title>' + esc(p.label) + '</title></circle>';
      off += len;
    });
  }
  g += '<text x="50%" y="46%" text-anchor="middle" style="font-size:12px;fill:var(--muted)">' + esc(centerTop) + '</text>'
    + '<text x="50%" y="58%" text-anchor="middle" style="font-size:15px;font-weight:800;fill:var(--text)">' + esc(centerBottom) + '</text>';
  return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="donut">' + g + '</svg>';
}

PAGES.dashboard = () => {
  const today = todayISO();
  const month = today.slice(0, 7);
  const items = activeItems();
  const low = items.map((i) => ({ i, q: totalQty(i.id) }))
    .filter((x) => x.i.minStock > 0 && x.q < x.i.minStock)
    .sort((a, b) => (a.q - a.i.minStock) - (b.q - b.i.minStock));
  const pendingAll = S.docs.pr.filter((p) => p.status === 'PENDING');
  const mine = pendingAll.filter((p) => canActOnStep(p));
  const issuesToday = S.docs.is.filter((d) => d.date === today).length;
  const receiptsMonth = S.docs.gr.filter((d) => String(d.date).slice(0, 7) === month)
    .reduce((a, d) => a + d.lines.reduce((x, l) => x + l.qty * l.unitCost, 0), 0);

  /* 14-day movement chart (ledger lines in / out, opening balances excluded) */
  const days = [];
  for (let k = 13; k >= 0; k--) days.push(addDays(today, -k));
  const inC = days.map(() => 0);
  const outC = days.map(() => 0);
  S.movements.forEach((m) => {
    if (m.type === 'OPENING') return;
    const idx = days.indexOf(m.date);
    if (idx < 0) return;
    if (m.qty > 0) inC[idx]++; else outC[idx]++;
  });

  /* value by category */
  const catVal = {};
  let grand = 0;
  Object.keys(S.stock).forEach((k) => {
    const b = S.stock[k];
    if (!(b.qty > 0)) return;
    const itemId = k.split('|')[0];
    const item = itemOf(itemId);
    const cid = item ? item.categoryId : '';
    catVal[cid] = (catVal[cid] || 0) + b.qty * b.avg;
    grand += b.qty * b.avg;
  });
  const catParts = Object.keys(catVal).map((cid, i) => ({ label: nm(catOf(cid)) || '—', value: catVal[cid], color: CHART_COLORS[i % CHART_COLORS.length] }))
    .sort((a, b) => b.value - a.value);
  const topCats = catParts.slice(0, 6);
  const others = catParts.slice(6).reduce((a, p) => a + p.value, 0);
  if (others > 0) topCats.push({ label: t('common.all') + ' · ...', value: others, color: '#94a3b8' });

  /* issues by department (this month) */
  const deptVal = {};
  S.docs.is.filter((d) => String(d.date).slice(0, 7) === month).forEach((d) => {
    const v = d.lines.reduce((a, l) => a + l.qty * l.unitCost, 0);
    deptVal[d.deptId] = (deptVal[d.deptId] || 0) + v;
  });
  const deptRows = Object.keys(deptVal).map((id) => ({ name: deptName(id), v: deptVal[id] })).sort((a, b) => b.v - a.v);
  const deptMax = Math.max(1, ...deptRows.map((r) => r.v));

  /* value by warehouse */
  const whRows = S.warehouses.map((w) => {
    let v = 0;
    Object.keys(S.stock).forEach((k) => {
      const [, wid] = k.split('|');
      const b = S.stock[k];
      if (wid === w.id && b.qty > 0) v += b.qty * b.avg;
    });
    return { name: nm(w), v };
  });
  const whMax = Math.max(1, ...whRows.map((r) => r.v));

  /* recent activity */
  const feed = S.movements.slice(-10).reverse();
  const typeColor = { RECEIPT: '#10b981', ISSUE: '#ef4444', TRANSFER_OUT: '#f59e0b', TRANSFER_IN: '#0ea5a4', ADJUST: '#8b5cf6', OPENING: '#64748b' };
  const typeIcon = { RECEIPT: 'inn', ISSUE: 'out', TRANSFER_OUT: 'swap', TRANSFER_IN: 'swap', ADJUST: 'clip', OPENING: 'box' };

  const kpi = (icon, color, label, value, hint, cls) => '<div class="kpi-card ' + (cls || '') + '" style="--c:' + color + '">'
    + '<div class="kpi-icon">' + ico(icon) + '</div><div><div class="k-label">' + label + '</div>'
    + '<div class="k-value num">' + value + '</div><div class="k-hint">' + hint + '</div></div></div>';

  const quick = [];
  if (can('pr.create')) quick.push('<button class="btn primary" data-act="nav" data-to="pr/new">' + ico('plus') + t('pr.new') + '</button>');
  if (can('receipt.post')) quick.push('<button class="btn" data-act="nav" data-to="gr/new">' + ico('inn') + t('rc.new') + '</button>');
  if (can('issue.post')) quick.push('<button class="btn" data-act="nav" data-to="is/new">' + ico('out') + t('is.new') + '</button>');
  if (can('count.post')) quick.push('<button class="btn" data-act="nav" data-to="cn/new">' + ico('clip') + t('cn.new') + '</button>');

  const lowRows = low.slice(0, 8);
  const lowTable = table([
    { h: t('common.code'), c: (r) => esc(r.i.code) },
    { h: t('item.ar'), c: (r) => esc(nm(r.i)) },
    { h: t('common.qty'), c: (r) => qty(r.q), num: true },
    { h: t('item.minStock'), c: (r) => qty(r.i.minStock), num: true },
    { h: t('common.status'), c: (r) => stockBadge(r.q <= 0 ? 'out' : 'low') },
  ], lowRows.map((x) => ({ i: x.i, q: x.q })), t('dash.allClear'));

  const approvalsList = mine.length
    ? '<div class="feed">' + mine.slice(0, 5).map((p) => '<div class="feed-item"><div class="feed-dot" style="--c:#f59e0b">' + ico('check') + '</div><div style="flex:1"><div class="t">' + esc(p.no) + ' · ' + fmtMoney(p.total) + '</div><div class="d">' + esc(deptName(p.deptId)) + ' · ' + esc(userName(p.requesterId)) + '</div></div><button class="btn sm" data-act="nav" data-to="approvals">' + t('dash.viewAll') + '</button></div>').join('') + '</div>'
    : '<div class="muted small">' + t('dash.noApprovals') + '</div>';

  return licenseBannerHtml()
    + '<section class="hero"><div class="hero-row"><div><h1>' + t('dash.welcome', { name: esc(CURRENT.name) }) + '</h1>'
    + '<div class="sub">' + esc(nm({ ar: S.settings.hotelAr, en: S.settings.hotelEn }) || t('app.name')) + ' · ' + t('dash.today') + ': ' + today + '</div>'
    + '<div class="sub" style="margin-top:4px">' + t('dash.subtitle') + '</div></div>'
    + '<div class="quick">' + quick.join('') + '</div></div></section>'
    + '<section class="kpi-grid">'
    + kpi('list', '#1f6feb', t('dash.kpi.items'), items.length, t('dash.kpi.items.hint'))
    + kpi('box', '#0ea5a4', t('dash.kpi.value'), fmtMoney(stockValue()), t('dash.kpi.value.hint'))
    + kpi('alert', '#f59e0b', t('dash.kpi.low'), low.length, t('dash.kpi.low.hint'), low.length ? 'warn' : '')
    + kpi('check', '#8b5cf6', t('dash.kpi.pending'), pendingAll.length, t('dash.kpi.pending.hint'))
    + kpi('out', '#ef4444', t('dash.kpi.issuesToday'), issuesToday, t('dash.kpi.issuesToday.hint'))
    + kpi('inn', '#10b981', t('dash.kpi.receiptsMonth'), fmtMoney(receiptsMonth), t('dash.kpi.receiptsMonth.hint'))
    + '</section>'
    + '<section class="dash-grid">'
    + '<div class="card"><div class="panel-head"><h3>' + t('dash.chart.movements') + '</h3>'
    + '<div class="legend"><span><i style="background:var(--primary)"></i>' + t('dash.chart.in') + '</span><span><i style="background:var(--accent)"></i>' + t('dash.chart.out') + '</span></div></div>'
    + barsSvg(days.map((d) => d.slice(5)), inC, outC, t('dash.chart.in'), t('dash.chart.out')) + '</div>'
    + '<div class="card"><div class="panel-head"><h3>' + t('dash.chart.byCategory') + '</h3></div>'
    + (grand > 0 ? '<div class="donut-wrap">' + donutSvg(topCats, t('dash.kpi.value'), money(grand)) + '<div class="donut-legend">'
      + topCats.map((p) => '<div class="row"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + p.color + ';margin-inline-end:6px"></i>' + esc(p.label) + '</span><span class="num">' + Math.round((p.value / grand) * 100) + '%</span></div>').join('')
      + '</div></div>' : '<div class="empty">' + t('common.noData') + '</div>')
    + '</div></section>'
    + '<section class="dash-grid equal">'
    + '<div class="card"><div class="panel-head"><h3>' + t('dash.lowStock') + '</h3><button class="btn sm" data-act="nav" data-to="balances">' + t('dash.viewAll') + '</button></div>' + lowTable + '</div>'
    + '<div class="card"><div class="panel-head"><h3>' + t('dash.approvals') + '</h3></div>' + approvalsList
    + '<div class="panel-head" style="margin-top:18px"><h3>' + t('dash.feed') + '</h3></div>'
    + (feed.length ? '<div class="feed">' + feed.map((m) => '<div class="feed-item"><div class="feed-dot" style="--c:' + (typeColor[m.type] || '#64748b') + '">' + ico(typeIcon[m.type] || 'box') + '</div><div style="flex:1;min-width:0"><div class="t">' + t('mv.' + m.type) + ' · ' + esc(nm(itemOf(m.itemId))) + '</div><div class="d"><span class="num">' + qty(m.qty) + '</span> · ' + esc(whName(m.whId)) + ' · ' + esc(m.docNo || '') + '</div></div></div>').join('') + '</div>' : '<div class="empty">' + t('common.noData') + '</div>')
    + '</div></section>'
    + '<section class="dash-grid equal">'
    + '<div class="card"><div class="panel-head"><h3>' + t('dash.chart.byDept') + '</h3></div>'
    + (deptRows.length ? deptRows.slice(0, 8).map((r) => '<div class="progress-row"><div class="top"><span>' + esc(r.name) + '</span><span class="num">' + money(r.v) + '</span></div><div class="bar thick"><span style="width:' + Math.round((r.v / deptMax) * 100) + '%"></span></div></div>').join('') : '<div class="empty">' + t('common.noData') + '</div>')
    + '</div>'
    + '<div class="card"><div class="panel-head"><h3>' + t('dash.chart.byWh') + '</h3></div>'
    + whRows.map((r) => '<div class="progress-row"><div class="top"><span>' + esc(r.name) + '</span><span class="num">' + money(r.v) + '</span></div><div class="bar thick"><span class="ok" style="width:' + Math.round((r.v / whMax) * 100) + '%"></span></div></div>').join('')
    + '<div class="small muted">' + t('dash.lastUpdate') + ': ' + nowIso().slice(0, 16).replace('T', ' ') + '</div></div>'
    + '</section>';
};

/* ================= PURCHASE REQUESTS ================= */
function prRemainingNote(pr) { return pr.lines.reduce((a, l) => a + Math.max(0, l.qty - l.received), 0); }
function prVisible(pr) {
  if (can('pr.viewAll')) return true;
  if (pr.requesterId === CURRENT.id) return true;
  if (canActOnStep(pr)) return true;
  return pr.steps.some((s) => s.by === CURRENT.id);
}

PAGES.pr = (id) => {
  if (id === 'new') return prForm(null);
  if (id) {
    const pr = S.docs.pr.find((x) => x.id === id);
    if (!pr) return emptyBox(t('common.noData'));
    if (pr.status === 'DRAFT' && pr.requesterId === CURRENT.id) return prForm(pr);
    return prView(pr);
  }
  return prList();
};

function prList() {
  const canNew = can('pr.create');
  LIST.render = (q) => {
    const k = String(q || '').trim().toLowerCase();
    const rows = S.docs.pr.filter(prVisible).filter((p) => !k
      || p.no.toLowerCase().indexOf(k) !== -1 || deptName(p.deptId).toLowerCase().indexOf(k) !== -1
      || userName(p.requesterId).toLowerCase().indexOf(k) !== -1)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return table([
      { h: t('common.no.doc'), c: (r) => '<strong>' + esc(r.no) + '</strong>' },
      { h: t('common.date'), c: (r) => dt(r.date) },
      { h: t('pr.dept'), c: (r) => esc(deptName(r.deptId)) },
      { h: t('pr.requester'), c: (r) => esc(userName(r.requesterId)) },
      { h: t('pr.neededBy'), c: (r) => dt(r.neededBy) },
      { h: t('pr.total'), c: (r) => money(r.total), num: true },
      { h: t('common.status'), c: (r) => statusBadge(r.status) },
      { h: '', c: (r) => '<button class="btn sm" data-act="nav" data-to="pr/' + r.id + '">' + t('common.view') + '</button>' },
    ], rows);
  };
  return listPage(t('nav.pr'), canNew ? '<button class="btn primary" data-act="nav" data-to="pr/new">' + ico('plus') + t('pr.new') + '</button>' : '', LIST.render);
}

function prForm(pr) {
  initDocForm('pr:' + (pr ? pr.id : 'new'),
    pr ? pr.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, cost: l.estCost })) : [{ itemId: '', qty: '', cost: '' }],
    { id: pr ? pr.id : null, costCol: true, recalc: moneyRecalc });
  const deptOpts = opt(S.departments.filter((d) => d.active !== false), (d) => nm(d), t('msg.pickDept'));
  const rows = FORM.lines.map((l, i) => '<div class="line-row">'
    + lineItemSel(i, l, true)
    + numCell(i, 'qty', l.qty)
    + numCell(i, 'cost', l.cost)
    + '<span class="num" data-tot="' + i + '">' + money(num(l.qty) * num(l.cost)) + '</span>'
    + lineRemoveBtn(i) + '</div>').join('');
  const total = FORM.lines.reduce((a, l) => a + num(l.qty) * num(l.cost), 0);
  return pageHead(pr ? pr.no : t('pr.new'), '<button class="btn ghost" data-act="back">' + t('common.back') + '</button>', pr ? statusBadge(pr.status) : '')
    + '<form id="doc-form" class="card" onsubmit="return false">'
    + '<div class="form-grid">'
    + field(t('pr.dept') + ' *', sel('deptId', deptOpts, pr ? pr.deptId : ''))
    + field(t('pr.neededBy'), '<input type="date" name="neededBy" value="' + esc(pr ? pr.neededBy : addDays(todayISO(), 3)) + '">')
    + field(t('common.notes'), inp('note', pr ? pr.note : ''), 'full')
    + '</div></form>'
    + '<div class="card"><div class="panel-head"><h3>' + t('common.lines') + '</h3><button class="btn sm" data-act="addLine">' + ico('plus') + t('common.addLine') + '</button></div>'
    + '<div class="lines-head line-row" style="margin-bottom:4px"><span>' + t('item.ar') + '</span><span>' + t('common.qty') + '</span><span>' + t('item.cost') + '</span><span>' + t('common.total') + '</span><span></span></div>'
    + '<div class="lines">' + rows + '</div>'
    + '<div class="actions" style="justify-content:space-between"><span class="muted small">' + t('pr.thresholdHint') + '</span>'
    + '<strong>' + t('common.total') + ': <span id="doc-total">' + money(total) + ' ' + esc(S.settings.currency) + '</span></strong></div>'
    + '<div class="actions"><button class="btn" data-act="prSave" data-submit="0">' + t('common.draft') + '</button>'
    + '<button class="btn primary" data-act="prSave" data-submit="1">' + ico('check') + t('common.submit') + '</button></div></div>';
}
ACT.prSave = (el) => {
  const f = readForm($('#doc-form'));
  const lines = FORM.lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, qty: num(l.qty), estCost: num(l.cost) }));
  const submit = el.dataset.submit === '1';
  const doc = savePR({ id: FORM.id || null, deptId: f.deptId, neededBy: f.neededBy, note: f.note, lines }, submit);
  toast(submit ? t('msg.submitted') : t('msg.draftSaved'));
  navTo('pr/' + doc.id);
};

function approvalStepsHtml(pr) {
  if (!pr.steps.length) return '<span class="muted small">' + t('pr.noLevels') + '</span>';
  return '<div class="steps">' + pr.steps.map((s) => {
    const cls = s.status === 'APPROVED' ? 'done' : s.status === 'REJECTED' ? 'rejected' : '';
    const badge = s.status === 'PENDING'
      ? '<span class="muted small">' + t('pr.pendingFor', { role: roleLabel(s.role) }) + '</span>'
      : statusBadge(s.status);
    return '<div class="step ' + cls + '"><strong>' + t('pr.level', { n: s.level }) + '</strong><div>' + roleLabel(s.role) + '</div><div>' + badge + '</div>'
      + (s.by ? '<div class="small muted">' + esc(userName(s.by)) + ' · ' + dt(s.at) + '</div>' : '')
      + (s.note ? '<div class="small">' + esc(s.note) + '</div>' : '') + '</div>';
  }).join('') + '</div>';
}

function priceCardHtml(pr) {
  const s = currentApprovalStep(pr);
  if (!s || s.role !== 'purchasing' || !canActOnStep(pr)) return '';
  const rows = pr.lines.map((l, i) => '<tr><td style="text-align:start">' + esc(nm(itemOf(l.itemId))) + '</td><td class="num">' + qty(l.qty)
    + '</td><td><input class="num" type="number" min="0" step="any" name="c' + i + '" value="' + esc(String(l.estCost)) + '"></td></tr>').join('');
  return '<div class="card"><h3>' + t('pr.priceTitle') + '</h3><p class="muted small">' + t('pr.priceHint') + '</p>'
    + '<form id="pr-price-form"><div class="table-wrap"><table><thead><tr><th>' + t('item.ar') + '</th><th class="num">' + t('common.qty') + '</th><th>' + t('item.cost') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></form>'
    + '<div class="actions"><button class="btn primary" data-act="prReprice" data-id="' + pr.id + '">' + t('pr.saveprices') + '</button></div></div>';
}
function prView(pr) {
  const lines = pr.lines.map((l) => {
    const it = itemOf(l.itemId);
    return { it, l };
  });
  const actions = [];
  if (canActOnStep(pr)) {
    actions.push('<button class="btn success" data-act="prApprove" data-id="' + pr.id + '">' + ico('check') + t('common.approve') + '</button>');
    actions.push('<button class="btn danger" data-act="prReject" data-id="' + pr.id + '">' + t('common.reject') + '</button>');
  }
  if (pr.status === 'APPROVED' || pr.status === 'PARTIAL') {
    if (can('receipt.post')) actions.push('<button class="btn primary" data-act="nav" data-to="gr/new" data-pr="' + pr.id + '">' + ico('inn') + t('rc.new') + '</button>');
  }
  return pageHead(pr.no, actions.join('') + '<button class="btn" data-act="print">' + t('common.print') + '</button><button class="btn ghost" data-act="back">' + t('common.back') + '</button>', statusBadge(pr.status))
    + '<div class="card"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px">'
    + '<div><div class="small muted">' + t('common.date') + '</div><div>' + dt(pr.date) + '</div></div>'
    + '<div><div class="small muted">' + t('pr.dept') + '</div><div>' + esc(deptName(pr.deptId)) + '</div></div>'
    + '<div><div class="small muted">' + t('pr.requester') + '</div><div>' + esc(userName(pr.requesterId)) + '</div></div>'
    + '<div><div class="small muted">' + t('pr.neededBy') + '</div><div>' + dt(pr.neededBy) + '</div></div>'
    + '<div><div class="small muted">' + t('pr.total') + '</div><div class="num">' + fmtMoney(pr.total) + '</div></div>'
    + '</div>' + (pr.note ? '<p class="muted" style="margin-top:12px">' + esc(pr.note) + '</p>' : '') + '</div>'
    + priceCardHtml(pr)
    + '<div class="card"><h3>' + t('pr.chain') + '</h3>' + approvalStepsHtml(pr) + '</div>'
    + '<div class="card" style="padding:0">' + table([
      { h: t('common.code'), c: (r) => esc(r.it ? r.it.code : '') },
      { h: t('item.ar'), c: (r) => esc(nm(r.it)) },
      { h: t('common.unit'), c: (r) => esc(r.it ? r.it.unit : '') },
      { h: t('common.qty'), c: (r) => qty(r.l.qty), num: true },
      { h: t('item.cost'), c: (r) => money(r.l.estCost), num: true },
      { h: t('common.total'), c: (r) => money(r.l.qty * r.l.estCost), num: true },
      { h: t('pr.received'), c: (r) => qty(r.l.received), num: true },
      { h: t('pr.remaining'), c: (r) => qty(Math.max(0, r.l.qty - r.l.received)), num: true },
    ], lines) + '</div>';
}
ACT.prReprice = (el) => {
  repricePR(el.dataset.id, readForm($('#pr-price-form')));
  toast(t('msg.priced'));
  renderRoute();
};
ACT.prApprove = (el) => {
  const pr = decidePR(el.dataset.id, true, '');
  toast(pr.status === 'APPROVED' ? t('msg.fullyApproved') : t('msg.approved'));
  renderRoute();
};
ACT.prReject = (el) => {
  const id = el.dataset.id;
  openModal({
    title: t('common.reject'),
    narrow: true,
    body: '<label class="field"><span>' + t('pr.rejectReason') + '</span><textarea name="reason"></textarea></label>',
    actions: [
      { label: t('common.cancel'), cls: 'ghost', onClick: () => {} },
      { label: t('common.reject'), cls: 'danger', onClick: (ctx) => {
        const reason = ctx.el.querySelector('[name=reason]').value;
        decidePR(id, false, reason);
        toast(t('msg.rejected'));
        renderRoute();
      } },
    ],
  });
};

/* ================= APPROVALS INBOX ================= */
PAGES.approvals = () => {
  const mine = S.docs.pr.filter((p) => p.status === 'PENDING' && canActOnStep(p));
  const decided = S.docs.pr.filter((p) => p.steps.some((s) => s.by === CURRENT.id))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 50);
  return pageHead(t('pr.approvals.title'), '')
    + '<div class="card" style="padding:0">' + table([
      { h: t('common.no.doc'), c: (r) => '<strong>' + esc(r.no) + '</strong>' },
      { h: t('common.date'), c: (r) => dt(r.submittedAt || r.date) },
      { h: t('pr.dept'), c: (r) => esc(deptName(r.deptId)) },
      { h: t('pr.requester'), c: (r) => esc(userName(r.requesterId)) },
      { h: t('pr.total'), c: (r) => money(r.total), num: true },
      { h: t('pr.level', { n: '' }).trim(), c: (r) => { const s = currentApprovalStep(r); return s ? t('pr.level', { n: s.level }) + ' · ' + roleLabel(s.role) : '—'; } },
      { h: t('common.actions'), c: (r) => '<button class="btn sm" data-act="nav" data-to="pr/' + r.id + '">' + t('common.view') + '</button> '
        + '<button class="btn sm success" data-act="prApprove" data-id="' + r.id + '">' + t('common.approve') + '</button> '
        + '<button class="btn sm danger" data-act="prReject" data-id="' + r.id + '">' + t('common.reject') + '</button>' },
    ], mine, t('dash.noApprovals')) + '</div>'
    + '<h3 style="margin-top:22px">' + t('pr.decided') + '</h3>'
    + '<div class="card" style="padding:0">' + table([
      { h: t('common.no.doc'), c: (r) => esc(r.no) },
      { h: t('common.status'), c: (r) => statusBadge(r.status) },
      { h: t('pr.total'), c: (r) => money(r.total), num: true },
      { h: t('common.view'), c: (r) => '<button class="btn sm" data-act="nav" data-to="pr/' + r.id + '">' + t('common.view') + '</button>' },
    ], decided) + '</div>';
};

/* ================= GOODS RECEIPTS ================= */
PAGES.gr = (id) => {
  if (id === 'new') return grForm();
  if (id) {
    const gr = S.docs.gr.find((x) => x.id === id);
    if (!gr) return emptyBox(t('common.noData'));
    return docView(t('rc.title') + ' ' + esc(gr.no), 'POSTED', [
      [t('common.date'), dt(gr.date)], [t('common.warehouse'), esc(whName(gr.whId))], [t('common.supplier'), esc(supName(gr.supplierId))],
      [t('rc.invoice'), esc(gr.invoice || '—')], [t('pr.title'), gr.prId ? esc((S.docs.pr.find((p) => p.id === gr.prId) || {}).no || '') : '—'],
      [t('common.by'), esc(userName(userOf(gr.user ? (S.users.find((u) => u.username === gr.user) || {}).id : '') ? '' : ''))],
    ], [
      { h: t('common.code'), c: (r) => esc(itemOf(r.itemId) ? itemOf(r.itemId).code : '') },
      { h: t('item.ar'), c: (r) => esc(nm(itemOf(r.itemId))) },
      { h: t('common.qty'), c: (r) => qty(r.qty), num: true },
      { h: t('common.cost'), c: (r) => money(r.unitCost), num: true },
      { h: t('common.total'), c: (r) => money(r.qty * r.unitCost), num: true },
    ], gr.lines);
  }
  LIST.render = (q) => {
    const k = String(q || '').trim().toLowerCase();
    const rows = S.docs.gr.filter((g) => !k || g.no.toLowerCase().indexOf(k) !== -1 || supName(g.supplierId).toLowerCase().indexOf(k) !== -1)
      .slice().reverse();
    return table([
      { h: t('common.no.doc'), c: (r) => '<strong>' + esc(r.no) + '</strong>' },
      { h: t('common.date'), c: (r) => dt(r.date) },
      { h: t('common.warehouse'), c: (r) => esc(whName(r.whId)) },
      { h: t('common.supplier'), c: (r) => esc(supName(r.supplierId)) },
      { h: t('rc.invoice'), c: (r) => esc(r.invoice || '—') },
      { h: t('common.total'), c: (r) => money(r.lines.reduce((a, l) => a + l.qty * l.unitCost, 0)), num: true },
      { h: '', c: (r) => '<button class="btn sm" data-act="nav" data-to="gr/' + r.id + '">' + t('common.view') + '</button>' },
    ], rows);
  };
  return listPage(t('rc.title'), can('receipt.post') ? '<button class="btn primary" data-act="nav" data-to="gr/new">' + ico('plus') + t('rc.new') + '</button>' : '', LIST.render);
};

function grForm() {
  const presetPr = (location.hash.indexOf('pr=') !== -1) ? null : null;
  initDocForm('gr:new', [{ itemId: '', qty: '', cost: '' }], { costCol: true, recalc: moneyRecalc, prId: '', pendingPrPreset: presetPr });
  const prOpts = [{ v: '', l: t('rc.pickPr') }].concat(S.docs.pr.filter((p) => p.status === 'APPROVED' || p.status === 'PARTIAL')
    .map((p) => ({ v: p.id, l: p.no + ' · ' + deptName(p.deptId) })));
  const remainingBtn = FORM.prId ? '<button class="btn sm" data-act="grFill">' + t('rc.fillFromPr') + '</button>' : '';
  const rows = FORM.lines.map((l, i) => '<div class="line-row">'
    + lineItemSel(i, l, true) + numCell(i, 'qty', l.qty) + numCell(i, 'cost', l.cost)
    + '<span class="num" data-tot="' + i + '">' + money(num(l.qty) * num(l.cost)) + '</span>' + lineRemoveBtn(i) + '</div>').join('');
  const total = FORM.lines.reduce((a, l) => a + num(l.qty) * num(l.cost), 0);
  return pageHead(t('rc.new'), '<button class="btn ghost" data-act="back">' + t('common.back') + '</button>')
    + '<form id="doc-form" class="card" onsubmit="return false"><div class="form-grid">'
    + field(t('rc.supplier'), sel('supplierId', opt(S.suppliers, (s) => s.name, '—'), ''))
    + field(t('common.warehouse') + ' *', sel('whId', opt(activeWarehouses(), (w) => nm(w), t('msg.pickWh')), FORM.whId, 'data-chg="grWh"'))
    + field(t('rc.fromPr'), sel('prId', prOpts, FORM.prId, 'data-chg="grPr"'))
    + field(t('rc.invoice'), inp('invoice', ''))
    + field(t('common.date'), '<input type="date" name="date" value="' + todayISO() + '">')
    + field(t('common.notes'), inp('note', ''), 'full')
    + '</div></form>'
    + '<div class="card"><div class="panel-head"><h3>' + t('common.lines') + '</h3><div class="toolbar" style="margin:0">' + remainingBtn
    + '<button class="btn sm" data-act="addLine">' + ico('plus') + t('common.addLine') + '</button></div></div>'
    + '<div class="lines-head line-row"><span>' + t('item.ar') + '</span><span>' + t('common.qty') + '</span><span>' + t('common.cost') + '</span><span>' + t('common.total') + '</span><span></span></div>'
    + '<div class="lines">' + rows + '</div>'
    + '<div class="actions" style="justify-content:space-between"><span class="muted small">' + t('rc.hint') + '</span><strong>' + t('common.total') + ': <span id="doc-total">' + money(total) + ' ' + esc(S.settings.currency) + '</span></strong></div>'
    + '<div class="actions"><button class="btn primary" data-act="grPost">' + ico('inn') + t('common.post') + '</button></div></div>';
}
CHG.grPr = (el) => {
  FORM.prId = el.value;
  const pr = S.docs.pr.find((p) => p.id === el.value);
  if (pr) {
    FORM.lines = pr.lines.filter((l) => l.qty - l.received > 0).map((l) => ({
      itemId: l.itemId, qty: r4(l.qty - l.received), cost: l.estCost || (itemOf(l.itemId) ? itemOf(l.itemId).cost : ''),
    }));
    if (!FORM.lines.length) FORM.lines = [{ itemId: '', qty: '', cost: '' }];
  }
  renderRoute();
};
ACT.grFill = () => renderRoute();
CHG.grWh = (el) => { FORM.whId = el.value; renderRoute(); };
ACT.grPost = () => {
  const f = readForm($('#doc-form'));
  const lines = FORM.lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, qty: num(l.qty), unitCost: num(l.cost) }));
  const gr = postGR({ supplierId: f.supplierId, whId: f.whId, prId: f.prId || '', invoice: f.invoice, date: f.date, note: f.note, lines });
  toast(t('msg.posted', { no: gr.no }));
  navTo('gr/' + gr.id);
};

/* ================= STORE ISSUES ================= */
PAGES.is = (id) => {
  if (id === 'new') return isForm();
  if (id) {
    const is = S.docs.is.find((x) => x.id === id);
    if (!is) return emptyBox(t('common.noData'));
    const total = is.lines.reduce((a, l) => a + l.qty * l.unitCost, 0);
    return docView(t('is.title') + ' ' + esc(is.no), 'POSTED', [
      [t('common.date'), dt(is.date)], [t('is.wh'), esc(whName(is.whId))], [t('is.dept'), esc(deptName(is.deptId))],
      [t('is.receiver'), esc(is.receiver || '—')], [t('common.notes'), esc(is.note || '—')],
    ], [
      { h: t('common.code'), c: (r) => esc(itemOf(r.itemId) ? itemOf(r.itemId).code : '') },
      { h: t('item.ar'), c: (r) => esc(nm(itemOf(r.itemId))) },
      { h: t('common.qty'), c: (r) => qty(r.qty), num: true },
      { h: t('common.cost'), c: (r) => money(r.unitCost), num: true },
      { h: t('common.total'), c: (r) => money(r.value), num: true },
    ], is.lines, '<div class="card"><strong>' + t('common.total') + ': ' + fmtMoney(total) + '</strong></div>');
  }
  LIST.render = (q) => {
    const k = String(q || '').trim().toLowerCase();
    const rows = S.docs.is.filter((d) => !k || d.no.toLowerCase().indexOf(k) !== -1 || deptName(d.deptId).toLowerCase().indexOf(k) !== -1)
      .slice().reverse();
    return table([
      { h: t('common.no.doc'), c: (r) => '<strong>' + esc(r.no) + '</strong>' },
      { h: t('common.date'), c: (r) => dt(r.date) },
      { h: t('is.wh'), c: (r) => esc(whName(r.whId)) },
      { h: t('is.dept'), c: (r) => esc(deptName(r.deptId)) },
      { h: t('is.receiver'), c: (r) => esc(r.receiver || '—') },
      { h: t('common.total'), c: (r) => money(r.lines.reduce((a, l) => a + l.qty * l.unitCost, 0)), num: true },
      { h: '', c: (r) => '<button class="btn sm" data-act="nav" data-to="is/' + r.id + '">' + t('common.view') + '</button>' },
    ], rows);
  };
  return listPage(t('is.title'), can('issue.post') ? '<button class="btn primary" data-act="nav" data-to="is/new">' + ico('plus') + t('is.new') + '</button>' : '', LIST.render);
};

function isForm() {
  initDocForm('is:new', [{ itemId: '', qty: '', cost: '' }], { recalc: null });
  const rows = FORM.lines.map((l, i) => {
    const av = FORM.whId && l.itemId ? bal(l.itemId, FORM.whId) : null;
    return '<div class="line-row">' + lineItemSel(i, l, false) + numCell(i, 'qty', l.qty)
      + '<span class="num">' + (av ? qty(av.qty) : '—') + '</span>'
      + '<span class="num">' + (av ? money(av.avg) : '—') + '</span>' + lineRemoveBtn(i) + '</div>';
  }).join('');
  return pageHead(t('is.new'), '<button class="btn ghost" data-act="back">' + t('common.back') + '</button>')
    + '<form id="doc-form" class="card" onsubmit="return false"><div class="form-grid">'
    + field(t('is.wh') + ' *', sel('whId', opt(activeWarehouses(), (w) => nm(w), t('msg.pickWh')), FORM.whId, 'data-chg="isWh"'))
    + field(t('is.dept') + ' *', sel('deptId', opt(S.departments, (d) => nm(d), t('msg.pickDept')), ''))
    + field(t('is.receiver'), inp('receiver', ''))
    + field(t('common.date'), '<input type="date" name="date" value="' + todayISO() + '">')
    + field(t('common.notes'), inp('note', ''), 'full')
    + '</div></form>'
    + '<div class="card"><div class="panel-head"><h3>' + t('common.lines') + '</h3><button class="btn sm" data-act="addLine">' + ico('plus') + t('common.addLine') + '</button></div>'
    + '<div class="lines-head line-row"><span>' + t('item.ar') + '</span><span>' + t('common.qty') + '</span><span>' + t('is.avail') + '</span><span>' + t('item.cost') + '</span><span></span></div>'
    + '<div class="lines">' + rows + '</div>'
    + '<div class="actions"><button class="btn primary" data-act="isPost">' + ico('out') + t('common.post') + '</button></div></div>';
}
CHG.isWh = (el) => { FORM.whId = el.value; renderRoute(); };
ACT.isPost = () => {
  const f = readForm($('#doc-form'));
  const lines = FORM.lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, qty: num(l.qty) }));
  const is = postIS({ whId: f.whId, deptId: f.deptId, receiver: f.receiver, date: f.date, note: f.note, lines });
  toast(t('msg.posted', { no: is.no }));
  navTo('is/' + is.id);
};

/* ================= WAREHOUSE TRANSFERS ================= */
PAGES.tr = (id) => {
  if (id === 'new') return trForm();
  if (id) {
    const tr = S.docs.tr.find((x) => x.id === id);
    if (!tr) return emptyBox(t('common.noData'));
    return docView(t('tr.title') + ' ' + esc(tr.no), 'POSTED', [
      [t('common.date'), dt(tr.date)], [t('tr.from'), esc(whName(tr.fromWh))], [t('tr.to'), esc(whName(tr.toWh))], [t('common.notes'), esc(tr.note || '—')],
    ], [
      { h: t('common.code'), c: (r) => esc(itemOf(r.itemId) ? itemOf(r.itemId).code : '') },
      { h: t('item.ar'), c: (r) => esc(nm(itemOf(r.itemId))) },
      { h: t('common.qty'), c: (r) => qty(r.qty), num: true },
      { h: t('common.cost'), c: (r) => money(r.unitCost), num: true },
    ], tr.lines);
  }
  LIST.render = (q) => {
    const k = String(q || '').trim().toLowerCase();
    const rows = S.docs.tr.filter((d) => !k || d.no.toLowerCase().indexOf(k) !== -1).slice().reverse();
    return table([
      { h: t('common.no.doc'), c: (r) => '<strong>' + esc(r.no) + '</strong>' },
      { h: t('common.date'), c: (r) => dt(r.date) },
      { h: t('tr.from'), c: (r) => esc(whName(r.fromWh)) },
      { h: t('tr.to'), c: (r) => esc(whName(r.toWh)) },
      { h: t('common.qty'), c: (r) => r.lines.length + ' ' + t('common.lines'), num: true },
      { h: '', c: (r) => '<button class="btn sm" data-act="nav" data-to="tr/' + r.id + '">' + t('common.view') + '</button>' },
    ], rows);
  };
  return listPage(t('tr.title'), can('transfer.post') ? '<button class="btn primary" data-act="nav" data-to="tr/new">' + ico('plus') + t('tr.new') + '</button>' : '', LIST.render);
};

function trForm() {
  initDocForm('tr:new', [{ itemId: '', qty: '', cost: '' }], { recalc: null, fromWh: '' });
  const wh = opt(activeWarehouses(), (w) => nm(w), t('msg.pickWh'));
  const rows = FORM.lines.map((l, i) => {
    const av = FORM.fromWh && l.itemId ? bal(l.itemId, FORM.fromWh) : null;
    return '<div class="line-row">' + lineItemSel(i, l, false) + numCell(i, 'qty', l.qty)
      + '<span class="num">' + (av ? qty(av.qty) : '—') + '</span>' + lineRemoveBtn(i) + '</div>';
  }).join('');
  return pageHead(t('tr.new'), '<button class="btn ghost" data-act="back">' + t('common.back') + '</button>')
    + '<form id="doc-form" class="card" onsubmit="return false"><div class="form-grid">'
    + field(t('tr.from') + ' *', sel('fromWh', wh, FORM.fromWh, 'data-chg="trFrom"'))
    + field(t('tr.to') + ' *', sel('toWh', wh, '', ''))
    + field(t('common.date'), '<input type="date" name="date" value="' + todayISO() + '">')
    + field(t('common.notes'), inp('note', ''))
    + '</div></form>'
    + '<div class="card"><div class="panel-head"><h3>' + t('common.lines') + '</h3><button class="btn sm" data-act="addLine">' + ico('plus') + t('common.addLine') + '</button></div>'
    + '<div class="lines-head line-row"><span>' + t('item.ar') + '</span><span>' + t('common.qty') + '</span><span>' + t('is.avail') + '</span><span></span></div>'
    + '<div class="lines">' + rows + '</div>'
    + '<div class="actions"><button class="btn primary" data-act="trPost">' + ico('swap') + t('common.post') + '</button></div></div>';
}
CHG.trFrom = (el) => { FORM.fromWh = el.value; renderRoute(); };
ACT.trPost = () => {
  const f = readForm($('#doc-form'));
  const lines = FORM.lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, qty: num(l.qty) }));
  const tr = postTR({ fromWh: f.fromWh, toWh: f.toWh, date: f.date, note: f.note, lines });
  toast(t('msg.posted', { no: tr.no }));
  navTo('tr/' + tr.id);
};

/* ================= STOCK COUNTS ================= */
PAGES.cn = (id) => {
  if (id === 'new') return cnForm();
  if (id) {
    const cn = S.docs.cn.find((x) => x.id === id);
    if (!cn) return emptyBox(t('common.noData'));
    return docView(t('cn.title') + ' ' + esc(cn.no), 'POSTED', [
      [t('common.date'), dt(cn.date)], [t('common.warehouse'), esc(whName(cn.whId))], [t('common.notes'), esc(cn.note || '—')],
    ], [
      { h: t('common.code'), c: (r) => esc(itemOf(r.itemId) ? itemOf(r.itemId).code : '') },
      { h: t('item.ar'), c: (r) => esc(nm(itemOf(r.itemId))) },
      { h: t('cn.system'), c: (r) => qty(r.system), num: true },
      { h: t('cn.counted'), c: (r) => qty(r.counted), num: true },
      { h: t('cn.diff'), c: (r) => qty(r.diff), num: true },
    ], cn.lines.filter((l) => Math.abs(l.diff) > 0 || true));
  }
  LIST.render = (q) => {
    const k = String(q || '').trim().toLowerCase();
    const rows = S.docs.cn.filter((d) => !k || d.no.toLowerCase().indexOf(k) !== -1).slice().reverse();
    return table([
      { h: t('common.no.doc'), c: (r) => '<strong>' + esc(r.no) + '</strong>' },
      { h: t('common.date'), c: (r) => dt(r.date) },
      { h: t('common.warehouse'), c: (r) => esc(whName(r.whId)) },
      { h: t('cn.diff'), c: (r) => r.lines.filter((l) => Math.abs(l.diff) > 1e-9).length + ' ' + t('common.lines'), num: true },
      { h: '', c: (r) => '<button class="btn sm" data-act="nav" data-to="cn/' + r.id + '">' + t('common.view') + '</button>' },
    ], rows);
  };
  return listPage(t('cn.title'), can('count.post') ? '<button class="btn primary" data-act="nav" data-to="cn/new">' + ico('plus') + t('cn.new') + '</button>' : '', LIST.render);
};

function cnForm() {
  initDocForm('cn:new', [], { recalc: diffRecalc, whId: '' });
  const rows = FORM.lines.map((l, i) => '<div class="line-row">'
    + '<span>' + esc(itemOf(l.itemId) ? itemOf(l.itemId).code + ' — ' + nm(itemOf(l.itemId)) : '') + '</span>'
    + '<span class="num">' + qty(bal(l.itemId, FORM.whId).qty) + '</span>'
    + '<input type="number" step="any" min="0" data-in="lf" data-lf="counted" data-i="' + i + '" value="' + esc(l.counted ?? '') + '">'
    + '<span class="num" data-diff="' + i + '">' + (l.counted === '' || l.counted === undefined ? '—' : qty(r4(num(l.counted) - bal(l.itemId, FORM.whId).qty))) + '</span>'
    + '</div>').join('');
  const hasWh = !!FORM.whId;
  return pageHead(t('cn.new'), '<button class="btn ghost" data-act="back">' + t('common.back') + '</button>')
    + '<form id="doc-form" class="card" onsubmit="return false"><div class="form-grid">'
    + field(t('common.warehouse') + ' *', sel('whId', opt(activeWarehouses(), (w) => nm(w), t('msg.pickWh')), FORM.whId, 'data-chg="cnWh"'))
    + field(t('common.date'), '<input type="date" name="date" value="' + todayISO() + '">')
    + field(t('common.notes'), inp('note', ''))
    + '</div></form>'
    + (hasWh ? '<div class="card"><div class="panel-head"><h3>' + t('common.lines') + '</h3><span class="muted small">' + t('item.balanceHint') + '</span></div>'
      + '<div class="lines-head line-row"><span>' + t('item.ar') + '</span><span>' + t('cn.system') + '</span><span>' + t('cn.counted') + '</span><span>' + t('cn.diff') + '</span></div>'
      + '<div class="lines">' + rows + '</div>'
      + '<div class="actions"><button class="btn primary" data-act="cnPost">' + ico('check') + t('cn.post') + '</button></div></div>' : '');
}
CHG.cnWh = (el) => {
  FORM.whId = el.value;
  FORM.lines = el.value ? activeItems().slice().sort((a, b) => a.code.localeCompare(b.code)).map((i) => ({ itemId: i.id, counted: '' })) : [];
  renderRoute();
};
ACT.cnPost = () => {
  const f = readForm($('#doc-form'));
  const res = postCN({ whId: f.whId, date: f.date, note: f.note, lines: FORM.lines.map((l) => ({ itemId: l.itemId, counted: l.counted })) });
  toast(t('msg.adjPosted', { n: res.adjusted }));
  navTo('cn/' + res.doc.id);
};
