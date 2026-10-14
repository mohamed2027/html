/* ===== Data layer: state, permissions, master catalogue, stock engine ===== */
const PERMS = [
  'dashboard.view', 'items.view', 'items.manage',
  'pr.create', 'pr.approve', 'pr.viewAll',
  'receipt.post', 'issue.post', 'transfer.post', 'count.post',
  'reports.view', 'excel.import', 'excel.export',
  'admin.users', 'admin.roles', 'admin.settings', 'admin.backup', 'admin.audit',
];
const ROLES = ['admin', 'manager', 'purchasing', 'finance', 'gm', 'storekeeper', 'approver', 'requester', 'viewer'];
const ROLE_DEFAULTS = {
  admin: PERMS.slice(),
  manager: ['dashboard.view', 'items.view', 'pr.create', 'pr.approve', 'pr.viewAll', 'reports.view', 'excel.export'],
  storekeeper: ['dashboard.view', 'items.view', 'items.manage', 'pr.viewAll', 'receipt.post', 'issue.post', 'transfer.post', 'count.post', 'reports.view', 'excel.import', 'excel.export'],
  approver: ['dashboard.view', 'items.view', 'pr.create', 'pr.approve', 'reports.view'],
  requester: ['dashboard.view', 'items.view', 'pr.create'],
  purchasing: ['dashboard.view', 'items.view', 'pr.viewAll', 'pr.approve', 'reports.view'],
  finance: ['dashboard.view', 'items.view', 'pr.viewAll', 'pr.approve', 'reports.view'],
  gm: ['dashboard.view', 'items.view', 'pr.viewAll', 'pr.approve', 'reports.view'],
  viewer: ['dashboard.view', 'items.view', 'reports.view'],
};
const SEQ_PREFIX = { pr: 'PR', gr: 'GR', is: 'IS', tr: 'TR', cn: 'CN' };

let S = null;             // the whole application state (persisted as one JSON document)
let CURRENT = null;       // logged-in user object

const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;
const uniq = (arr) => Array.from(new Set(arr));

function blankState() {
  return {
    schema: 1,
    settings: {
      hotelAr: '', hotelEn: '', currency: 'EGP', allowNegative: false, lowAlert: true,
      tiers: [{ upTo: null, levels: 4 }],
      chain: ['manager', 'purchasing', 'finance', 'gm'],
    },
    roles: JSON.parse(JSON.stringify(ROLE_DEFAULTS)),
    users: [],
    categories: [], warehouses: [], departments: [], suppliers: [], items: [],
    stock: {},        // "itemId|whId" -> { qty, avg }
    movements: [],    // stock ledger
    docs: { pr: [], gr: [], is: [], tr: [], cn: [] },
    seq: {},
    audit: [],
    adminSeeded: false,
  };
}

function loadState() {
  if (!COMPANY) return null;
  const s = Store.get(dataKey(), null);
  if (!s || s.schema !== 1) return null;
  const base = blankState();
  Object.keys(base).forEach((k) => { if (s[k] === undefined) s[k] = base[k]; });
  Object.keys(base.settings).forEach((k) => { if (s.settings[k] === undefined) s.settings[k] = base.settings[k]; });
  ROLES.forEach((r) => { if (!s.roles[r]) s.roles[r] = ROLE_DEFAULTS[r].slice(); });
  return s;
}

function saveState() {
  if (!Store.set(dataKey(), S)) toast(t('msg.storage'), 'err');
}

function audit(action, detail) {
  S.audit.unshift({ id: uid(), ts: nowIso(), user: CURRENT ? CURRENT.username : 'system', action, detail: detail || '' });
  if (S.audit.length > 3000) S.audit.length = 3000;
}

function can(perm) {
  if (!CURRENT) return false;
  if (CURRENT.role === 'admin') return true;
  return (S.roles[CURRENT.role] || []).indexOf(perm) !== -1;
}

function nextDocNo(kind) {
  const year = new Date().getFullYear();
  const key = kind + year;
  S.seq[key] = (S.seq[key] || 0) + 1;
  return SEQ_PREFIX[kind] + '-' + year + '-' + pad(S.seq[key], 4);
}

/* ----- Lookups ----- */
const itemOf = (id) => S.items.find((x) => x.id === id) || null;
const whOf = (id) => S.warehouses.find((x) => x.id === id) || null;
const depOf = (id) => S.departments.find((x) => x.id === id) || null;
const supOf = (id) => S.suppliers.find((x) => x.id === id) || null;
const catOf = (id) => S.categories.find((x) => x.id === id) || null;
const userOf = (id) => S.users.find((x) => x.id === id) || null;
const activeWarehouses = () => S.warehouses.filter((w) => w.active !== false);
const activeItems = () => S.items.filter((i) => i.active !== false);

/* ----- Stock engine (weighted average cost; every change is a ledger movement) ----- */
const stockKey = (itemId, whId) => itemId + '|' + whId;
function bal(itemId, whId) { return S.stock[stockKey(itemId, whId)] || { qty: 0, avg: 0 }; }
function totalQty(itemId) {
  let q = 0;
  S.warehouses.forEach((w) => { q += bal(itemId, w.id).qty; });
  return r4(q);
}
function stockValue() {
  let v = 0;
  Object.keys(S.stock).forEach((k) => { const b = S.stock[k]; if (b.qty > 0) v += b.qty * b.avg; });
  return v;
}
function recordMove(m) {
  S.movements.push(Object.assign({ id: uid(), ts: nowIso(), date: todayISO(), user: CURRENT ? CURRENT.username : 'system' }, m));
}

/* Inbound: averages the cost of the stock on hand with the new lot. */
function stockIn({ itemId, whId, qty: q, unitCost, type, docNo, note, date }) {
  const k = stockKey(itemId, whId);
  const b = S.stock[k] || { qty: 0, avg: 0 };
  const item = itemOf(itemId);
  const cost = r4(num(unitCost) || (b.qty > 0 ? b.avg : 0) || (item ? item.cost : 0));
  const newQty = r4(b.qty + q);
  const newAvg = b.qty > 0 ? r4(((b.qty * b.avg) + (q * cost)) / (b.qty + q)) : cost;
  S.stock[k] = { qty: newQty, avg: newAvg };
  recordMove({ type, itemId, whId, qty: r4(q), cost, docNo: docNo || '', note: note || '', date: date || todayISO() });
  return cost;
}

/* Outbound: throws when stock is insufficient (unless negative stock is allowed). Returns unit cost used. */
function stockOut({ itemId, whId, qty: q, type, docNo, note, date }) {
  const k = stockKey(itemId, whId);
  const b = S.stock[k] || { qty: 0, avg: 0 };
  if (!S.settings.allowNegative && b.qty + 1e-9 < q) {
    throw new Error(t('msg.stockShort', { item: nm(itemOf(itemId)), avail: qty(b.qty) }));
  }
  const cost = r4(b.avg || (itemOf(itemId) ? itemOf(itemId).cost : 0));
  S.stock[k] = { qty: r4(b.qty - q), avg: b.avg };
  recordMove({ type, itemId, whId, qty: r4(-q), cost, docNo: docNo || '', note: note || '', date: date || todayISO() });
  return cost;
}

/* ----- Approval routing ----- */
function buildApprovalSteps(total) {
  const tiers = S.settings.tiers.slice().sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  const tier = tiers.find((tr) => tr.upTo === null || tr.upTo === undefined || total <= tr.upTo);
  const n = tier ? tier.levels : 0;
  const steps = [];
  for (let i = 0; i < n; i++) {
    steps.push({ level: i + 1, role: S.settings.chain[i] || 'manager', status: 'PENDING', by: null, at: null, note: '' });
  }
  return steps;
}
const roleLabel = (r) => t('role.' + r);

/* ----- Master catalogue (starter list; extend via Excel import) ----- */
const SEED_WAREHOUSES = [
  ['MAIN', 'المخزن الرئيسي', 'Main Store'],
  ['FNB', 'مخزن الإعاشة والمطبخ', 'F&B Store'],
  ['HK', 'مخزن الإدارة المنزلية', 'Housekeeping Store'],
  ['ENG', 'مخزن الصيانة', 'Engineering Store'],
];
const SEED_DEPARTMENTS = [
  ['ADM', 'الإدارة', 'Administration'],
  ['FO', 'الاستقبال', 'Front Office'],
  ['HK', 'الإدارة المنزلية', 'Housekeeping'],
  ['FB', 'الأغذية والمشروبات', 'Food & Beverage'],
  ['KIT', 'المطبخ', 'Kitchen'],
  ['ENG', 'الصيانة', 'Engineering'],
  ['SPA', 'السبا والمسبح', 'Spa & Pool'],
  ['LD', 'المغسلة', 'Laundry'],
];
const SEED_CATEGORIES = [
  ['FB', 'المواد الغذائية', 'Food & Dry Goods'],
  ['BV', 'المشروبات', 'Beverages'],
  ['HK', 'مواد التدبير المنزلي', 'Housekeeping'],
  ['CL', 'المنظفات والكيماويات', 'Cleaning Chemicals'],
  ['LN', 'الكتان والمفروشات', 'Linen & Textiles'],
  ['GA', 'مستلزمات النزلاء', 'Guest Amenities'],
  ['KT', 'أدوات ومعدات المطبخ', 'Kitchen Equipment'],
  ['EN', 'قطع الصيانة', 'Engineering & Maintenance'],
  ['ST', 'القرطاسية والمكتبية', 'Stationery & Office'],
  ['UN', 'الزي الرسمي', 'Uniforms'],
  ['PT', 'المطبوعات', 'Printed Materials'],
  ['PS', 'المسبح والسبا', 'Pool & Spa'],
  ['LD', 'المغسلة', 'Laundry'],
  ['MD', 'الإسعافات الأولية', 'First Aid & Medical'],
];
// [code, Arabic name, English name, category code, unit, minimum stock, default cost]
const SEED_ITEMS = [
  ['FB-001', 'أرز بسمتي', 'Basmati rice', 'FB', 'kg', 20, 45],
  ['FB-002', 'سكر أبيض', 'White sugar', 'FB', 'kg', 25, 38],
  ['FB-003', 'ملح طعام', 'Table salt', 'FB', 'kg', 5, 8],
  ['FB-004', 'دقيق أبيض', 'White flour', 'FB', 'kg', 30, 22],
  ['FB-005', 'زيت طعام', 'Cooking oil', 'FB', 'L', 30, 65],
  ['FB-006', 'معكرونة', 'Pasta', 'FB', 'kg', 15, 40],
  ['FB-007', 'صلصة طماطم', 'Tomato paste', 'FB', 'can', 20, 28],
  ['FB-008', 'بهارات مشكلة', 'Mixed spices', 'FB', 'kg', 3, 160],
  ['FB-009', 'عسل نحل', 'Honey', 'FB', 'kg', 5, 180],
  ['FB-010', 'مربى فراولة', 'Strawberry jam', 'FB', 'jar', 10, 55],
  ['FB-011', 'زبدة', 'Butter', 'FB', 'kg', 5, 150],
  ['FB-012', 'بيض', 'Eggs', 'FB', 'tray', 20, 130],
  ['FB-013', 'حليب طازج', 'Fresh milk', 'FB', 'L', 40, 35],
  ['FB-014', 'جبن أبيض', 'White cheese', 'FB', 'kg', 10, 190],
  ['FB-015', 'خبز توست', 'Toast bread', 'FB', 'pack', 20, 30],
  ['FB-016', 'بسكويت', 'Biscuits', 'FB', 'pack', 30, 25],
  ['BV-001', 'شاي أسود', 'Black tea', 'BV', 'box', 20, 120],
  ['BV-002', 'قهوة عربية', 'Arabic coffee', 'BV', 'kg', 5, 320],
  ['BV-003', 'نسكافيه', 'Instant coffee', 'BV', 'jar', 10, 210],
  ['BV-004', 'عصير برتقال معلب', 'Orange juice (canned)', 'BV', 'can', 100, 12],
  ['BV-005', 'مياه معدنية 500 مل', 'Mineral water 500ml', 'BV', 'bottle', 300, 4],
  ['BV-006', 'مياه معدنية 1.5 لتر', 'Mineral water 1.5L', 'BV', 'bottle', 150, 8],
  ['BV-007', 'مشروب غازي', 'Soft drink', 'BV', 'can', 200, 10],
  ['BV-008', 'بيرة خالية من الكحول', 'Non-alcoholic beer', 'BV', 'can', 24, 25],
  ['BV-009', 'سكر أكياس (ساشيه)', 'Sugar sachets', 'BV', 'box', 20, 35],
  ['BV-010', 'كريمة مبيضة للقهوة', 'Coffee creamer', 'BV', 'box', 10, 60],
  ['HK-001', 'مكنسة يد', 'Hand broom', 'HK', 'pc', 10, 35],
  ['HK-002', 'ممسحة أرضية', 'Floor mop', 'HK', 'pc', 10, 60],
  ['HK-003', 'دلو تنظيف 15 لتر', 'Cleaning bucket 15L', 'HK', 'pc', 10, 75],
  ['HK-004', 'عربة تنظيف', 'Housekeeping trolley', 'HK', 'pc', 2, 4200],
  ['HK-005', 'ليفة جلي', 'Scouring pad', 'HK', 'pack', 30, 15],
  ['HK-006', 'أكياس قمامة كبيرة', 'Large garbage bags', 'HK', 'roll', 40, 35],
  ['HK-007', 'أكياس قمامة صغيرة', 'Small garbage bags', 'HK', 'roll', 40, 22],
  ['HK-008', 'قفازات تنظيف', 'Cleaning gloves', 'HK', 'pair', 50, 18],
  ['HK-009', 'معطر جو', 'Air freshener', 'HK', 'can', 30, 70],
  ['HK-010', 'ورق تواليت', 'Toilet paper', 'HK', 'roll', 200, 6],
  ['HK-011', 'مناديل ورقية', 'Facial tissue', 'HK', 'box', 80, 28],
  ['HK-012', 'صابون أيدي', 'Hand soap', 'HK', 'bottle', 30, 45],
  ['CL-001', 'منظف أرضيات', 'Floor cleaner', 'CL', 'L', 20, 85],
  ['CL-002', 'مطهر متعدد الأغراض', 'Multi-purpose disinfectant', 'CL', 'L', 20, 95],
  ['CL-003', 'مزيل دهون', 'Degreaser', 'CL', 'L', 10, 120],
  ['CL-004', 'منظف زجاج', 'Glass cleaner', 'CL', 'L', 10, 70],
  ['CL-005', 'مبيض كلور', 'Bleach', 'CL', 'L', 20, 30],
  ['CL-006', 'مسحوق غسيل صناعي', 'Industrial laundry powder', 'CL', 'kg', 25, 110],
  ['CL-007', 'منعم أقمشة', 'Fabric softener', 'CL', 'L', 15, 90],
  ['CL-008', 'مزيل روائح للمفروشات', 'Odor neutralizer', 'CL', 'L', 5, 140],
  ['LN-001', 'ملاءة سرير كوين', 'Queen bed sheet', 'LN', 'pc', 60, 450],
  ['LN-002', 'ملاءة سرير كينج', 'King bed sheet', 'LN', 'pc', 60, 520],
  ['LN-003', 'غطاء لحاف', 'Duvet cover', 'LN', 'pc', 60, 600],
  ['LN-004', 'كيس وسادة', 'Pillow case', 'LN', 'pc', 120, 110],
  ['LN-005', 'منشفة وجه', 'Face towel', 'LN', 'pc', 150, 70],
  ['LN-006', 'منشفة حمام', 'Bath towel', 'LN', 'pc', 150, 160],
  ['LN-007', 'منشفة مسبح', 'Pool towel', 'LN', 'pc', 80, 190],
  ['LN-008', 'حصيرة حمام', 'Bath mat', 'LN', 'pc', 40, 120],
  ['LN-009', 'روب استحمام', 'Bathrobe', 'LN', 'pc', 50, 350],
  ['LN-010', 'وسادة', 'Pillow', 'LN', 'pc', 60, 280],
  ['LN-011', 'لحاف (دوفيه)', 'Duvet', 'LN', 'pc', 40, 650],
  ['GA-001', 'شامبو', 'Shampoo', 'GA', 'bottle', 200, 15],
  ['GA-002', 'بلسم شعر', 'Conditioner', 'GA', 'bottle', 200, 15],
  ['GA-003', 'جل استحمام', 'Shower gel', 'GA', 'bottle', 200, 15],
  ['GA-004', 'صابون استحمام', 'Bath soap', 'GA', 'pc', 300, 8],
  ['GA-005', 'كريم حلاقة', 'Shaving cream', 'GA', 'pc', 100, 12],
  ['GA-006', 'مشط', 'Comb', 'GA', 'pc', 200, 4],
  ['GA-007', 'طقم خياطة', 'Sewing kit', 'GA', 'pc', 100, 9],
  ['GA-008', 'شبشب استحمام', 'Slippers', 'GA', 'pair', 150, 22],
  ['GA-009', 'طقم أسنان', 'Dental kit', 'GA', 'pc', 150, 14],
  ['GA-010', 'غطاء استحمام', 'Shower cap', 'GA', 'pc', 150, 3],
  ['KT-001', 'سكين طباخ', 'Chef knife', 'KT', 'pc', 5, 180],
  ['KT-002', 'صينية تقديم', 'Serving tray', 'KT', 'pc', 20, 120],
  ['KT-003', 'ملعقة تقديم', 'Serving spoon', 'KT', 'pc', 20, 45],
  ['KT-004', 'طبق صيني', 'Porcelain plate', 'KT', 'pc', 100, 85],
  ['KT-005', 'كوب قهوة', 'Coffee cup', 'KT', 'pc', 100, 40],
  ['KT-006', 'ورق ألومنيوم (فويل)', 'Aluminium foil', 'KT', 'roll', 30, 85],
  ['KT-007', 'ورق زبدة للخبز', 'Baking paper', 'KT', 'roll', 20, 70],
  ['KT-008', 'أكياس تغليف طعام', 'Food packaging bags', 'KT', 'pack', 30, 55],
  ['KT-009', 'قفازات تموين', 'Food-grade gloves', 'KT', 'box', 20, 120],
  ['KT-010', 'مريول طبخ', 'Chef apron', 'KT', 'pc', 20, 65],
  ['EN-001', 'لمبة LED 12 واط', 'LED bulb 12W', 'EN', 'pc', 50, 35],
  ['EN-002', 'مفتاح كهرباء', 'Electric switch', 'EN', 'pc', 30, 40],
  ['EN-003', 'فيوز كهرباء', 'Electrical fuse', 'EN', 'pc', 30, 15],
  ['EN-004', 'خرطوشة حنفية', 'Tap cartridge', 'EN', 'pc', 10, 180],
  ['EN-005', 'شريط تفلون', 'PTFE tape', 'EN', 'roll', 40, 8],
  ['EN-006', 'فلتر مكيف', 'AC filter', 'EN', 'pc', 20, 160],
  ['EN-007', 'زيت تشحيم', 'Lubricating oil', 'EN', 'L', 10, 140],
  ['EN-008', 'صمام خزان المياه', 'Water float valve', 'EN', 'pc', 10, 110],
  ['EN-009', 'دهان أبيض للجدران', 'Wall paint white', 'EN', 'L', 50, 260],
  ['EN-010', 'مسامير وبراغي متنوعة', 'Screws assorted', 'EN', 'box', 20, 55],
  ['ST-001', 'ورق A4', 'A4 paper', 'ST', 'ream', 30, 150],
  ['ST-002', 'قلم حبر جاف', 'Ballpoint pen', 'ST', 'box', 20, 60],
  ['ST-003', 'دفتر ملاحظات', 'Notebook', 'ST', 'pc', 40, 30],
  ['ST-004', 'ملف بلاستيك', 'Plastic folder', 'ST', 'pc', 60, 12],
  ['ST-005', 'حبر طابعة أسود', 'Printer toner black', 'ST', 'pc', 6, 1450],
  ['ST-006', 'شريط لاصق', 'Adhesive tape', 'ST', 'roll', 30, 18],
  ['ST-007', 'دبابيس ورق', 'Paper pins', 'ST', 'box', 20, 12],
  ['ST-008', 'مقص', 'Scissors', 'ST', 'pc', 10, 35],
  ['UN-001', 'قميص رسمي (رجالي)', 'Men shirt', 'UN', 'pc', 20, 350],
  ['UN-002', 'بلوزة رسمية (نسائي)', 'Women blouse', 'UN', 'pc', 20, 350],
  ['UN-003', 'بنطلون رسمي', 'Trousers', 'UN', 'pc', 20, 420],
  ['UN-004', 'جيب رسمي', 'Skirt', 'UN', 'pc', 15, 400],
  ['UN-005', 'جاكيت بلازر', 'Blazer', 'UN', 'pc', 10, 850],
  ['UN-006', 'بادج اسم', 'Name badge', 'UN', 'pc', 40, 45],
  ['UN-007', 'حذاء عمل', 'Work shoes', 'UN', 'pair', 20, 700],
  ['PT-001', 'قائمة طعام', 'Menu card', 'PT', 'pc', 200, 25],
  ['PT-002', 'كرت مفتاح الغرفة', 'Room key card', 'PT', 'pc', 500, 6],
  ['PT-003', 'استمارة تسجيل نزيل', 'Guest registration form', 'PT', 'pc', 500, 3],
  ['PT-004', 'كرت شكر', 'Thank-you card', 'PT', 'pc', 200, 8],
  ['PS-001', 'كلور للمسبح', 'Pool chlorine', 'PS', 'kg', 20, 160],
  ['PS-002', 'مادة ضبط الأس الهيدروجيني', 'pH adjuster', 'PS', 'kg', 10, 130],
  ['PS-003', 'زيت مساج', 'Massage oil', 'PS', 'L', 10, 260],
  ['PS-004', 'شموع سبا', 'Spa candles', 'PS', 'pc', 50, 25],
  ['LD-001', 'كيس غسيل', 'Laundry bag', 'LD', 'pc', 100, 12],
  ['LD-002', 'ملصق غسيل', 'Laundry tag', 'LD', 'pack', 20, 45],
  ['LD-003', 'مكواة بخار', 'Steam iron', 'LD', 'pc', 3, 1800],
  ['MD-001', 'ضمادات لاصقة', 'Adhesive bandage', 'MD', 'box', 10, 40],
  ['MD-002', 'مطهر جروح', 'Wound antiseptic', 'MD', 'bottle', 5, 70],
  ['MD-003', 'شاش طبي', 'Gauze', 'MD', 'pack', 10, 30],
  ['MD-004', 'باراسيتامول (علبة)', 'Paracetamol box', 'MD', 'box', 5, 25],
  ['MD-005', 'كمامة طبية', 'Surgical mask', 'MD', 'box', 10, 150],
];

function seedMaster(state) {
  const catIds = {};
  SEED_CATEGORIES.forEach(([code, ar, en]) => {
    const c = { id: uid(), code, ar, en };
    catIds[code] = c.id;
    state.categories.push(c);
  });
  SEED_WAREHOUSES.forEach(([code, ar, en]) => state.warehouses.push({ id: uid(), code, ar, en, active: true }));
  SEED_DEPARTMENTS.forEach(([code, ar, en]) => state.departments.push({ id: uid(), code, ar, en, active: true }));
  state.suppliers.push({ id: uid(), name: 'مورد تجريبي / Sample Supplier', phone: '', contact: '', active: true });
  SEED_ITEMS.forEach(([code, ar, en, cat, unit, min, cost]) => {
    state.items.push({ id: uid(), code, ar, en, categoryId: catIds[cat], unit, minStock: min, reorderQty: min * 2, cost, active: true });
  });
  return state;
}

/* ----- Money / number helpers for documents ----- */
function lineTotal(qtyVal, cost) { return r4(num(qtyVal) * num(cost)); }
