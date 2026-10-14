/* ===== Minimal XLSX reader/writer (no external library, works offline) ===== */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const xmlEsc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function colName(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function colIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function safeSheetName(n, i) {
  const s = String(n || '').replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 31).trim();
  return s || ('Sheet' + (i + 1));
}

const XL_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

function xlSheetXml(sheet) {
  const rows = sheet.rows || [];
  let maxCols = 0;
  rows.forEach((r) => { if (r.length > maxCols) maxCols = r.length; });
  const cols = [];
  for (let c = 0; c < maxCols; c++) {
    let w = 10;
    for (let r = 0; r < rows.length; r++) {
      const len = String(rows[r][c] ?? '').length;
      if (len > w) w = len;
    }
    cols.push('<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + Math.min(48, w + 3) + '" customWidth="1"/>');
  }
  const body = rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      if (v === null || v === undefined || v === '') return '';
      const ref = colName(ci) + (ri + 1);
      const style = (sheet.header && ri === 0) ? ' s="1"' : '';
      if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + style + '><v>' + v + '</v></c>';
      return '<c r="' + ref + '" t="inlineStr"' + style + '><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
    }).join('');
    return '<row r="' + (ri + 1) + '">' + cells + '</row>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
    + (cols.length ? '<cols>' + cols.join('') + '</cols>' : '')
    + '<sheetData>' + body + '</sheetData></worksheet>';
}

function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  const enc = new TextEncoder();
  files.forEach((f) => {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0)));
    chunks.push(local, nameBytes, f.data);
    const cen = new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)));
    central.push(cen, nameBytes);
    offset += local.length + nameBytes.length + size;
  });
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cdSize), u32(offset), u16(0)));
  return new Blob([...chunks, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* sheets: [{ name, rows: [[...]], header: true }] → Blob (.xlsx) */
function xlWrite(sheets) {
  const enc = new TextEncoder();
  const files = [];
  const add = (name, text) => files.push({ name, data: enc.encode(text) });
  const names = sheets.map((s, i) => safeSheetName(s.name, i));
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  add('[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')
    + '</Types>');
  add('_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>');
  add('xl/workbook.xml', X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets>' + names.map((n, i) => '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>');
  add('xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
    + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>');
  add('xl/styles.xml', XL_STYLES);
  sheets.forEach((s, i) => add('xl/worksheets/sheet' + (i + 1) + '.xml', xlSheetXml(s)));
  return zipStore(files);
}

/* buffer (ArrayBuffer of .xlsx) → [{ name, rows: [[...]] }] */
async function xlRead(buffer) {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('bad zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = {};
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const loff = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    entries[name] = { method, csize, loff };
    p += 46 + nlen + xlen + clen;
  }
  const readEntry = async (name) => {
    const e = entries[name];
    if (!e) return null;
    const start = e.loff + 30 + dv.getUint16(e.loff + 26, true) + dv.getUint16(e.loff + 28, true);
    const data = bytes.subarray(start, start + e.csize);
    if (e.method === 0) return data;
    if (e.method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('unsupported zip method');
  };
  const text = async (name) => { const d = await readEntry(name); return d ? dec.decode(d) : null; };
  const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');

  const shared = [];
  const sst = await text('xl/sharedStrings.xml');
  if (sst) {
    Array.from(parse(sst).getElementsByTagName('si')).forEach((si) => {
      shared.push(Array.from(si.getElementsByTagName('t')).map((x) => x.textContent).join(''));
    });
  }
  const wbText = await text('xl/workbook.xml');
  if (!wbText) throw new Error('no workbook');
  const relText = await text('xl/_rels/workbook.xml.rels');
  const relMap = {};
  if (relText) Array.from(parse(relText).getElementsByTagName('Relationship')).forEach((r) => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const sheets = Array.from(parse(wbText).getElementsByTagName('sheet')).map((s) => {
    const target = relMap[s.getAttribute('r:id')] || '';
    return { name: s.getAttribute('name'), target: target.startsWith('/') ? target.slice(1) : 'xl/' + target };
  });

  const out = [];
  for (const sh of sheets) {
    const sx = await text(sh.target);
    if (!sx) continue;
    const rows = [];
    Array.from(parse(sx).getElementsByTagName('row')).forEach((rowEl) => {
      const r = [];
      Array.from(rowEl.getElementsByTagName('c')).forEach((c) => {
        const ref = c.getAttribute('r') || '';
        const letters = ref.replace(/[0-9]/g, '');
        const ci = letters ? colIndex(letters) : r.length;
        const type = c.getAttribute('t');
        let val = '';
        if (type === 'inlineStr') {
          val = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent).join('');
        } else {
          const vEl = c.getElementsByTagName('v')[0];
          const raw = vEl ? vEl.textContent : '';
          if (type === 's') val = shared[+raw] ?? '';
          else if (type === 'b') val = raw === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'str' || type === 'e') val = raw;
          else if (raw !== '' && !isNaN(Number(raw))) val = Number(raw);
          else val = raw;
        }
        r[ci] = val;
      });
      rows.push(Array.from(r, (v) => (v === undefined ? '' : v)));
    });
    out.push({ name: sh.name, rows });
  }
  return out;
}

/* ----- Browser helpers for files ----- */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function downloadText(text, filename, type = 'application/json') {
  downloadBlob(new Blob([text], { type: type + ';charset=utf-8' }), filename);
}
function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}
