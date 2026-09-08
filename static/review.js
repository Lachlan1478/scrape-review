const rows = [...document.querySelectorAll('tr.field')];
const pages = [...document.querySelectorAll('#pages .page')];
let cur = -1;
function drawAll() {
  for (const r of rows) if (r.dataset.bbox) place(r, 'hl faint');
}
function place(r, cls) {
  const [x0, y0, x1, y1] = r.dataset.bbox.split(',').map(Number);
  const pg = pages[+r.dataset.page]; const img = pg.querySelector('img');
  const d = document.createElement('div'); d.className = cls; d.dataset.for = r.dataset.id;
  d.style.left = `${x0 * 100}%`; d.style.top = `${y0 * img.clientHeight}px`; d.style.width = `${(x1 - x0) * 100}%`; d.style.height = `${(y1 - y0) * img.clientHeight}px`;
  pg.appendChild(d); return d;
}
function select(i) {
  if (cur >= 0) rows[cur].classList.remove('sel');
  cur = Math.max(0, Math.min(rows.length - 1, i)); const r = rows[cur]; r.classList.add('sel');
  r.scrollIntoView({block: 'nearest'});
  document.querySelectorAll('.hl:not(.faint)').forEach(e => e.remove());
  if (r.dataset.bbox) { const d = place(r, 'hl'); d.scrollIntoView({block: 'center'}); }
}
async function mark(r, verdict) {
  const input = r.querySelector('td.fix input');
  input.hidden = verdict !== 'wrong';
  r.classList.toggle('ok', verdict === 'ok'); r.classList.toggle('wrong', verdict === 'wrong');
  await fetch(VERDICT_URL, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({field_id: r.dataset.id, verdict, correction: input.value || null})});
  if (verdict === 'wrong') input.focus();
}
function next(from) { for (let i = from + 1; i < rows.length; i++) if (!rows[i].classList.contains('empty')) return i; return from; }
rows.forEach((r, i) => {
  r.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') select(i); });
  r.querySelector('button.y')?.addEventListener('click', () => { mark(r, 'ok'); select(next(i)); });
  r.querySelector('button.n')?.addEventListener('click', () => { select(i); mark(r, 'wrong'); });
  r.querySelector('td.fix input').addEventListener('change', () => mark(r, 'wrong'));
});
document.getElementById('accept-all').addEventListener('click', async () => {
  const todo = rows.filter(r => !r.classList.contains('empty') && !r.classList.contains('ok') && !r.classList.contains('wrong'));
  todo.forEach(r => r.classList.add('ok'));
  await fetch(VERDICT_URL, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(todo.map(r => ({field_id: r.dataset.id, verdict: 'ok'})))});
  location.href = NEXT_URL;
});
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') { e.target.blur(); select(next(cur)); } return; }
  if (e.key === 'j') select(next(cur)); else if (e.key === 'k') select(cur - 1);
  else if (e.key === 'y' && cur >= 0) { mark(rows[cur], 'ok'); select(next(cur)); }
  else if (e.key === 'x' && cur >= 0) mark(rows[cur], 'wrong');
  else if (e.key === 'a') document.getElementById('accept-all').click();
  else if (e.key === 'n') location.href = NEXT_URL;
});
window.addEventListener('load', () => { drawAll(); select(next(-1)); });
