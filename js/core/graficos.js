import { $, R, appState, esc, selectedMonth } from './estado.js';
import { p2, sumC } from './calculos.js';

const palette = ['#a77bff', '#2ee6a0', '#ff5470', '#e0c27a', '#4fb3ff', '#e07fd0', '#5fd4c0', '#b9b6c9', '#f08a4b', '#7f96c9', '#c25bff', '#8fe36b'];

const FONT = "'Segoe UI',system-ui,Arial,sans-serif";

function setupCanvas(c) {
  const r = c.getBoundingClientRect();
  const d = window.devicePixelRatio || 1;
  if (r.width < 10) return null;
  c.width = r.width * d;
  c.height = r.height * d;
  const ctx = c.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  return {
    ctx,
    w: r.width,
    h: r.height
  };
}

function pie(id, items, legendId, label) {
  const c = $(id);
  if (!c) return;
  const s = setupCanvas(c);
  if (!s) return;
  const {
    ctx,
    w,
    h
  } = s;
  const total = items.reduce((a, b) => a + b.value, 0);
  const cx = w / 2,
    cy = h / 2;
  const r = Math.min(w, h) * .42,
    ri = r * .6;
  ctx.clearRect(0, 0, w, h);

  // Sem dados: anel cinza
  if (!total) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.arc(cx, cy, ri, 7, 0, true);
    ctx.fillStyle = '#ffffff0d';
    ctx.fill();
  }

  // Cada fatia
  let a = -Math.PI / 2;
  if (total) items.forEach((it, i) => {
    const v = it.value / total * Math.PI * 2;
    const col = it.color || palette[i % palette.length];
    ctx.beginPath();
    ctx.arc(cx, cy, r, a, a + v);
    ctx.arc(cx, cy, ri, a + v, a, true);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, col);
    g.addColorStop(1, col + '99');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#0b0911';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Porcentagem escrita na fatia (só se ela for grande o bastante)
    if (v / (Math.PI * 2) >= .06) {
      const m = a + v / 2,
        rr = (r + ri) / 2;
      ctx.fillStyle = '#fff';
      ctx.font = '700 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText((it.value / total * 100).toFixed(1).replace('.', ',') + '%', cx + Math.cos(m) * rr, cy + Math.sin(m) * rr + 4);
    }
    a += v;
  });

  // Total no centro da rosca
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f3f2f8';
  ctx.font = '600 16px ' + FONT;
  ctx.fillText(R(total), cx, cy + 2);
  ctx.fillStyle = '#9291a5';
  ctx.font = '11px ' + FONT;
  ctx.fillText(label || 'Total', cx, cy + 19);

  // Legenda
  if (legendId) {
    $(legendId).innerHTML = items.length ? items.map((it, i) => `<span><i class="dot" style="background:${it.color || palette[i % palette.length]}"></i>${esc(it.name)} · ${(it.value / total * 100).toFixed(1).replace('.', ',')}% · ${R(it.value)}</span>`).join('') : '<span>Sem dados neste período</span>';
  }
}

const short = c => {
  const v = c / 100;
  return v >= 1000 ? 'R$ ' + (v / 1000).toFixed(1).replace('.', ',') + 'k' : 'R$ ' + Math.round(v);
};

function bars(id, months) {
  const c = $(id);
  if (!c) return;
  const s = setupCanvas(c);
  if (!s) return;
  const {
    ctx,
    w,
    h
  } = s;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(100, ...months.flatMap(m => [m.in, m.out])) * 1.2;
  const left = 48,
    top = 14,
    bottom = h - 26,
    usable = bottom - top;
  ctx.font = '10px ' + FONT;

  // Linhas de grade e valores do eixo
  for (let i = 0; i <= 3; i++) {
    const y = top + usable * i / 3;
    ctx.strokeStyle = '#ffffff14';
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(w - 6, y);
    ctx.stroke();
    ctx.fillStyle = '#858498';
    ctx.textAlign = 'right';
    ctx.fillText(short(max * (1 - i / 3)), left - 6, y + 3);
  }

  // Duas barras por mês
  const grp = (w - left - 8) / months.length;
  const bw = Math.min(26, grp * .32);
  months.forEach((m, i) => {
    const x = left + i * grp + grp / 2 - bw - 2;
    [[m.in, '#2ee6a0', '#0f8a60', x], [m.out, '#ff5470', '#a02440', x + bw + 4]].forEach(([v, c1, c2, xx]) => {
      const bh = v / max * usable;
      const g = ctx.createLinearGradient(0, bottom - bh, 0, bottom);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(xx, bottom - bh, bw, bh);
      if (v > 0) {
        ctx.fillStyle = '#e8e6f2';
        ctx.textAlign = 'center';
        ctx.fillText(short(v), xx + bw / 2, bottom - bh - 4);
      }
    });
    ctx.fillStyle = '#9998aa';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, left + i * grp + grp / 2, bottom + 16);
  });
}

function sixMonths() {
  const [y, mo] = selectedMonth().split('-').map(Number);
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return Array.from({
    length: 6
  }, (_, i) => {
    const d = new Date(y, mo - 1 - 5 + i, 1);
    const key = d.getFullYear() + '-' + p2(d.getMonth() + 1);
    const tx = appState.data.transactions.filter(t => t.date.slice(0, 7) === key);
    return {
      label: names[d.getMonth()] + '/' + String(d.getFullYear()).slice(2),
      in: sumC(tx, t => t.type === 'receita'),
      out: sumC(tx, t => t.type === 'despesa')
    };
  });
}

function initGraficos() {

}

export { palette, FONT, setupCanvas, pie, short, bars, sixMonths, initGraficos };
