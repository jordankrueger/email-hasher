// CSV parse/stringify — RFC 4180-ish. Intentionally small and readable.

export function parseCSV(text) {
  if (!text || text.length === 0) throw new Error('CSV is empty');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else if (c === '"') {
        inQuotes = false;
        i++;
      } else {
        field += c;
        i++;
      }
    } else {
      if (c === '"') { inQuotes = true; i++; }
      else if (c === ',') { row.push(field); field = ''; i++; }
      else if (c === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); field = ''; row = []; i += 2; }
      else if (c === '\n' || c === '\r') { row.push(field); rows.push(row); field = ''; row = []; i++; }
      else { field += c; i++; }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0 || rows[0].length === 0 || (rows[0].length === 1 && rows[0][0] === '')) {
    throw new Error('CSV has no header row');
  }

  const header = rows[0];
  const data = rows.slice(1).filter(r => !(r.length === 1 && r[0] === ''));
  return { header, data };
}

export function stringifyCSV(header, data, { comments = [] } = {}) {
  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [];
  for (const c of comments) lines.push('# ' + c);
  lines.push(header.map(escape).join(','));
  for (const row of data) lines.push(row.map(escape).join(','));
  return lines.join('\n') + '\n';
}
