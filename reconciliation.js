export const baseDate = '2026-10-23';
export const keyOf = d => `${d.employee}:${d.field}${d.month ? ':' + d.month : ''}`;
export function compare(data, d) {
  let sources = [], checks = [], hint = '';
  if (d.field === '6') {
    sources = data.contracts.filter(r => r.employee === d.employee && (!r.start || r.start <= baseDate) && (!r.end || r.end >= baseDate));
    if (sources.length === 1) checks = ['hours', 'days', 'fromTime', 'toTime'].map(k => [k, d[k], sources[0][k]]);
  } else if (d.field === '7') {
    sources = data.attendance.filter(r => r.employee === d.employee && r.month === d.month);
    if (sources.length === 1) checks = ['hours', 'days'].map(k => [k, d[k], sources[0][k]]);
    const [y, m] = d.month.split('-').map(Number);
    const neighbors = data.attendance.filter(r => r.employee === d.employee && Math.abs(Number(r.month.slice(0, 4)) * 12 + Number(r.month.slice(5)) - (y * 12 + m)) === 1 && r.hours === d.hours && r.days === d.days);
    hint = neighbors.map(r => `${r.id} ${r.month}の${r.hours}時間・${r.days}日と一致する候補（年月のずれは未確定）`).join(' / ');
  } else {
    sources = data.systems.filter(r => r.employee === d.employee);
    if (sources.length === 1) checks = (sources[0].use === '利用なし' ? ['use'] : ['use', 'start', 'end', 'status', 'fromTime', 'toTime']).map(k => [k, d[k], sources[0][k]]);
  }
  const status = sources.length !== 1 || !checks.length || checks.some(([,a,b]) => a === null || b === null || b === undefined) ? '資料不足' : checks.every(([,a,b]) => a === b) ? '一致' : '不一致';
  const reference = sources.map(r => `${r.id} ${r.month || (d.field === '6' ? (r.start || '基準日前から有効') + '〜' + (r.end || '終了の記載なし') : r.start ? r.start + '〜' + r.end : '制度利用記録')}`).join(' / ') || '対応する資料なし';
  return { status, sources, reference, checks, hint };
}
export function validate(data) {
  for (const name of ['contracts', 'attendance', 'systems', 'drafts', 'memos']) {
    if (!Array.isArray(data[name])) throw Error(`${name}は配列にしてください`);
    for (const r of data[name]) {
      if (!/^E[1-9]\d*$/.test(r.employee)) throw Error('社員はEと数字の記号にしてください');
      if (name !== 'drafts' && !/^[A-Z][A-Za-z0-9-]*$/.test(r.id || '')) throw Error('資料番号は英字から始まる記号にしてください');
      for (const k of ['hours', 'days', 'breakMinutes']) if (r[k] !== undefined && r[k] !== null && (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] < 0)) throw Error(`${k}は0以上の数値かnullにしてください`);
      if (['contracts','attendance'].includes(name) || (name === 'drafts' && r.field === '7')) {
        if (typeof r.hours !== 'number' || typeof r.days !== 'number') throw Error('時間と日数は数値が必要です。不足資料は行を作らず示してください');
      }
      if ((name === 'attendance' || (name === 'drafts' && r.field === '7')) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month || '')) throw Error('対象月はYYYY-MM形式にしてください');
      if (name === 'contracts') {
        if (![r.start,r.end].every(v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))) || r.start && r.end && r.start > r.end) throw Error('契約の開始日・終了日を確認してください');
        if (![r.fromTime,r.toTime].every(v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v))) throw Error('契約時間帯はHH:MM形式にしてください');
      }
      if (name === 'systems' && !['利用なし','育児短時間勤務'].includes(r.use)) throw Error('制度は利用なし、または育児短時間勤務にしてください');
      if (name === 'drafts' && !['6', '7', '12'].includes(r.field)) throw Error('欄は6・7・12にしてください');
    }
    const ids = data[name].map(r => name === 'drafts' ? keyOf(r) : `${r.employee}:${r.id}:${r.month || ''}`);
    if (new Set(ids).size !== ids.length) throw Error(`${name}に重複行があります`);
  }
}
function csvNumber(value) {
  const text = value.trim();
  if (!text) return null;
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text) ? Number(text) : NaN;
}
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quote && text[i+1] === '"') { cell += '"'; i++; } else quote = !quote; }
    else if (c === ',' && !quote) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quote) { row.push(cell.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (quote) throw Error('CSVの引用符が閉じていません');
  row.push(cell.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row);
  const heads = rows.shift(); if (!heads || new Set(heads).size !== heads.length) throw Error('CSVの見出しを確認してください');
  return rows.map(r => { if (r.length !== heads.length) throw Error('CSVの列数を確認してください'); return Object.fromEntries(heads.map((h,i) => [h, ['hours','days','breakMinutes'].includes(h) ? csvNumber(r[i]) : r[i]])); });
}
