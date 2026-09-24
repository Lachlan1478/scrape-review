const rows = [...document.querySelectorAll('.r')];
const pages = [...document.querySelectorAll('#pages .page')];
const cells = r => [...r.querySelectorAll('td.f:not(.empty)')];
let R = -1, C = 0;

const boxesOf = c => c.dataset.boxes ? JSON.parse(c.dataset.boxes) : [[+c.dataset.page, c.dataset.bbox.split(',').map(Number)]];
function box(c, cls) {
  let first;
  for (const [p, [x0, y0, x1, y1]] of boxesOf(c)) {
    const pg = pages[p], h = pg.querySelector('img').clientHeight;
    const d = document.createElement('div'); d.className = cls;
    Object.assign(d.style, {left: `${x0 * 100}%`, top: `${y0 * h}px`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * h}px`});
    pg.appendChild(d); first = first || d;
  }
  return first;
}
function note(c) {
  if (c.classList.contains('quote') || c.dataset.value.length > 24) return;
  const [x0, y0, x1, y1] = c.dataset.bbox.split(',').map(Number);
  const pg = pages[+c.dataset.page], h = pg.querySelector('img').clientHeight;
  const n = document.createElement('div'); n.textContent = c.dataset.value;
  const right = x1 < 0.72; n.className = 'pin ' + (right ? 'right' : 'left');
  n.style.top = `${(y0 + y1) / 2 * h - 11}px`;
  if (right) n.style.left = `calc(${x1 * 100}% + 8px)`; else n.style.right = `calc(${(1 - x0) * 100}% + 8px)`;
  pg.appendChild(n);
}
function select(r, c = 0) {
  document.querySelectorAll('.sel').forEach(e => e.classList.remove('sel'));
  document.querySelectorAll('.hl.row, .hl.on, .pin').forEach(e => e.remove());
  R = Math.max(0, Math.min(rows.length - 1, r)); const row = rows[R], cs = cells(row);
  if (!cs.length) return;
  C = Math.max(0, Math.min(cs.length - 1, c)); const cell = cs[C];
  row.classList.add('sel'); cell.classList.add('sel'); cell.scrollIntoView({block: 'nearest'});
  cs.filter(x => x.dataset.bbox && x !== cell).forEach(x => box(x, 'hl row'));
  if (cell.dataset.bbox) { box(cell, 'hl on').scrollIntoView({block: 'center'}); note(cell); }
}
function post(items) {
  return fetch(VERDICT_URL, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(items)});
}
function set(cell, verdict) {
  cell.classList.toggle('ok', verdict === 'ok'); cell.classList.toggle('wrong', verdict === 'wrong');
  cell.querySelector('.fix').hidden = verdict !== 'wrong';
  progress();
}
function progress() {
  const all = rows.flatMap(cells), done = all.filter(c => c.classList.contains('ok') || c.classList.contains('wrong'));
  rows.forEach(r => r.classList.toggle('done', cells(r).length > 0 && cells(r).every(c => c.classList.contains('ok'))));
  document.getElementById('progress').textContent = `${done.length} of ${all.length} checked`;
}
function cellOk() {
  const cell = cells(rows[R])[C];
  cell.querySelector('.fix').value = ''; set(cell, 'ok');
  post([{field_id: cell.dataset.id, verdict: 'ok'}]);
  if (C + 1 < cells(rows[R]).length) select(R, C + 1); else select(nextRow(R), 0);
}
function cellWrong(cell) {
  const input = cell.querySelector('.fix');
  if (cell.classList.contains('wrong')) { input.value = ''; set(cell, 'ok'); return post([{field_id: cell.dataset.id, verdict: 'ok'}]); }
  set(cell, 'wrong');
  post([{field_id: cell.dataset.id, verdict: 'wrong', correction: input.value || null}]);
  input.focus();
}
function nextRow(from) { for (let i = from + 1; i < rows.length; i++) if (cells(rows[i]).length) return i; return from; }
function prevRow(from) { for (let i = from - 1; i >= 0; i--) if (cells(rows[i]).length) return i; return from; }
rows.forEach((row, i) => {
  cells(row).forEach((cell, j) => {
    cell.addEventListener('click', e => { if (!e.target.classList.contains('fix')) select(i, j); });
    const input = cell.querySelector('.fix');
    input.addEventListener('change', () => post([{field_id: cell.dataset.id, verdict: 'wrong', correction: input.value || null}]));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !input.value.trim()) cellWrong(cell);
      if (e.key === 'Enter' || e.key === 'Escape') { input.blur(); e.preventDefault(); }
    });
  });
  row.querySelector('button.y').addEventListener('click', () => { if (R !== i) select(i, 0); cellOk(); });
  row.querySelector('button.x').addEventListener('click', () => { if (R !== i) select(i, 0); cellWrong(cells(rows[R])[C]); });
});
document.getElementById('accept-all').addEventListener('click', async () => {
  const todo = rows.flatMap(cells).filter(c => !c.classList.contains('ok') && !c.classList.contains('wrong'));
  todo.forEach(c => set(c, 'ok'));
  await post(todo.map(c => ({field_id: c.dataset.id, verdict: 'ok'})));
  location.href = NEXT_URL;
});
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
  const k = e.key;
  if (k === 'j') select(nextRow(R)); else if (k === 'k') select(prevRow(R));
  else if (k === 'l') select(R, C + 1); else if (k === 'h') select(R, C - 1);
  else if (k === 'y' && R >= 0) cellOk();
  else if (k === 'x' && R >= 0) cellWrong(cells(rows[R])[C]);
  else if (k === 'a') document.getElementById('accept-all').click();
  else if (k === 'n') location.href = NEXT_URL;
  else return;
  e.preventDefault();
});
document.getElementById('keys-toggle').addEventListener('click', () => document.getElementById('keys').classList.toggle('show'));
const split = document.querySelector('.split'), divider = document.getElementById('divider');
try { const w = localStorage.getItem('split'); if (w) split.style.gridTemplateColumns = `${w}% 6px 1fr`; } catch (e) {}
divider.addEventListener('mousedown', e => {
  e.preventDefault(); divider.classList.add('drag'); document.body.classList.add('dragging');
  const move = ev => {
    const pct = Math.max(25, Math.min(75, 100 * (ev.clientX - split.getBoundingClientRect().left) / split.clientWidth));
    split.style.gridTemplateColumns = `${pct}% 6px 1fr`;
    try { localStorage.setItem('split', pct.toFixed(1)); } catch (e2) {}
  };
  const up = () => { divider.classList.remove('drag'); document.body.classList.remove('dragging'); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); redraw(); };
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
});
function redraw() {
  document.querySelectorAll('.hl, .pin').forEach(e => e.remove());
  rows.flatMap(cells).filter(c => c.dataset.bbox).forEach(c => box(c, 'hl'));
  if (R >= 0) select(R, C);
}
window.addEventListener('resize', redraw);
window.addEventListener('load', () => {
  redraw();
  progress();
  select(nextRow(-1));
});
