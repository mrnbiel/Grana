import { R, appState, fmtDate, money, monthTx, selectedMonth, today } from './estado.js';
import { monthLabel } from './dialogos.js';
import { budget, cents, dim, fixedActive, isPaid } from './calculos.js';

const PDF_W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

const PDF_W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

function pdfEnc(s) {
  const map = {
    '−': '-',
    '–': '\x96',
    '—': '\x97',
    '…': '\x85',
    '“': '\x93',
    '”': '\x94',
    '‘': '\x91',
    '’': '\x92',
    '•': '\x95',
    '\u00a0': ' '
  };
  return Array.from(String(s)).map(ch => {
    if (map[ch] !== undefined) return map[ch];
    const c = ch.charCodeAt(0);
    return c >= 32 && c <= 126 || c >= 160 && c <= 255 ? ch : '?';
  }).join('');
}

const pdfStr = s => pdfEnc(s).replace(/[\\()]/g, '\\$&');

function pdfW(s, size, bold) {
  const t = bold ? PDF_W_BOLD : PDF_W_REG;
  let w = 0;
  for (const ch of pdfEnc(s)) {
    let c = ch.charCodeAt(0);
    if (c < 32 || c > 126) {
      const b = ch.normalize('NFD').charCodeAt(0);
      c = b >= 32 && b <= 126 ? b : 63;
    }
    w += t[c - 32];
  }
  return w * size / 1000;
}

function pdfBuild(pages) {
  const o = [];
  o[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  o[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => 5 + 2 * i + ' 0 R').join(' ')}] /Count ${pages.length} >>`;
  o[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  o[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((p, i) => {
    const c = p.join('\n');
    o[5 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`;
    o[6 + 2 * i] = `<< /Length ${c.length} >>\nstream\n${c}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const off = [];
  for (let i = 1; i < o.length; i++) {
    off[i] = out.length;
    out += `${i} 0 obj\n${o[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${o.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < o.length; i++) out += String(off[i]).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size ${o.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}

function exportPDF() {
  const m = selectedMonth();
  const label = monthLabel(m);
  const tx = monthTx().slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const b = budget(appState.data, m, today());
  const act = appState.data.fixed.filter(f => fixedActive(f, m));
  const W = 595,
    H = 842,
    M = 40,
    CW = W - 2 * M;
  const C = {
    purple: '#5d3bb5',
    green: '#12a36f',
    red: '#d63a57',
    text: '#222233',
    muted: '#77768a',
    line: '#d9d3ea',
    head: '#ece8f7',
    zebra: '#f8f6fc',
    box: '#f3f0fa'
  };
  const pages = [];
  let ops, y;
  const col = h => [1, 3, 5].map(i => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
  const T = (x, yy, s, size = 9, bold = false, color = C.text) => ops.push(`BT ${col(color)} rg /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td (${pdfStr(s)}) Tj ET`);
  const TR = (xr, yy, s, size = 9, bold = false, color = C.text) => T(xr - pdfW(s, size, bold), yy, s, size, bold, color);
  const RECT = (x, yy, w, h, color) => ops.push(`${col(color)} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const fit = (s, w, size, bold) => {
    s = String(s);
    if (pdfW(s, size, bold) <= w) return s;
    while (s.length && pdfW(s + '...', size, bold) > w) s = s.slice(0, -1);
    return s + '...';
  };
  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = H - M;
  };
  const ensure = n => {
    if (y - n < M + 18) newPage();
  };
  const section = title => {
    ensure(70);
    y -= 10;
    T(M, y - 12, title, 12, true, C.purple);
    RECT(M, y - 18, CW, 0.8, C.line);
    y -= 28;
  };

  // cols: [{ x, w, right, label }]; rows: [[{ t, color, bold }, ...]]
  const table = (cols, rows, emptyMsg) => {
    const rh = 17;
    const head = () => {
      RECT(M, y - 16, CW, 16, C.head);
      cols.forEach(c => (c.right ? TR : T)(c.x, y - 11, c.label, 8, true, C.purple));
      y -= 18;
    };
    if (!rows.length) {
      T(M, y - 10, emptyMsg, 9, false, C.muted);
      y -= 24;
      return;
    }
    ensure(60);
    head();
    rows.forEach((r, i) => {
      if (y - rh < M + 25) {
        newPage();
        head();
      }
      if (i % 2) RECT(M, y - rh, CW, rh, C.zebra);
      r.forEach((cell, j) => {
        const c = cols[j];
        (c.right ? TR : T)(c.x, y - 12, fit(cell.t, c.w, 9, cell.bold), 9, !!cell.bold, cell.color || C.text);
      });
      y -= rh;
    });
    y -= 8;
  };

  /* ----- Cabeçalho ----- */
  newPage();
  RECT(0, H - 86, W, 86, '#1b1030');
  RECT(0, H - 88, W, 2, '#9a6bff');
  T(M, H - 44, 'GRANA', 22, true, '#ffffff');
  T(M, H - 64, 'Relatório financeiro · ' + label, 10, false, '#d9c8ff');
  TR(W - M, H - 44, 'Gerado em ' + fmtDate(today()), 9, false, '#d9c8ff');
  y = H - 88 - 24;

  /* ----- Resumo ----- */
  const bw = (CW - 20) / 3;
  const boxes = [['RECEITAS', R(b.income), C.green], ['DESPESAS', R(b.expense), C.red], ['SALDO DO MÊS', R(b.balance), b.balance >= 0 ? C.green : C.red]];
  boxes.forEach(([lab, val, color], i) => {
    const x = M + i * (bw + 10);
    RECT(x, y - 52, bw, 52, C.box);
    RECT(x, y - 52, 3, 52, color);
    T(x + 14, y - 19, lab, 8, true, C.muted);
    T(x + 14, y - 40, val, 15, true, color);
  });
  y -= 52 + 14;
  T(M, y - 8, `Despesas fixas pagas: ${R(b.fixedPaid)}   ·   Despesas variáveis: ${R(b.variable)}   ·   Fixas pendentes: ${R(b.fixedPending)}`, 9, false, C.muted);
  y -= 16;

  /* ----- Despesas por categoria ----- */
  const cats = {};
  tx.filter(t => t.type === 'despesa').forEach(t => {
    cats[t.cat] = (cats[t.cat] || 0) + cents(t.amount);
  });
  const catRows = Object.entries(cats).sort((a, b2) => b2[1] - a[1]).map(([name, v]) => [{
    t: name
  }, {
    t: (b.expense ? v / b.expense * 100 : 0).toFixed(1).replace('.', ',') + '%',
    color: C.muted
  }, {
    t: R(v),
    color: C.red,
    bold: true
  }]);
  section('Despesas por categoria');
  table([{
    x: M + 6,
    w: 260,
    label: 'CATEGORIA'
  }, {
    x: M + 400,
    w: 60,
    right: true,
    label: '% DAS DESPESAS'
  }, {
    x: W - M - 6,
    w: 110,
    right: true,
    label: 'VALOR'
  }], catRows, 'Nenhuma despesa neste mês.');

  /* ----- Lançamentos ----- */
  section('Lançamentos do mês');
  table([{
    x: M + 6,
    w: 56,
    label: 'DATA'
  }, {
    x: M + 66,
    w: 200,
    label: 'DESCRIÇÃO'
  }, {
    x: M + 272,
    w: 100,
    label: 'CATEGORIA'
  }, {
    x: M + 376,
    w: 62,
    label: 'TIPO'
  }, {
    x: W - M - 6,
    w: 100,
    right: true,
    label: 'VALOR'
  }], tx.map(t => [{
    t: fmtDate(t.date)
  }, {
    t: t.desc
  }, {
    t: t.cat,
    color: C.muted
  }, {
    t: t.type === 'receita' ? 'Receita' : t.kind === 'fixo' ? 'Desp. fixa' : 'Despesa',
    color: C.muted
  }, {
    t: (t.type === 'receita' ? '+ ' : '- ') + money(t.amount),
    color: t.type === 'receita' ? C.green : C.red,
    bold: true
  }]), 'Nenhum lançamento neste mês.');

  /* ----- Despesas fixas ----- */
  section('Despesas fixas');
  table([{
    x: M + 6,
    w: 190,
    label: 'CONTA'
  }, {
    x: M + 206,
    w: 100,
    label: 'CATEGORIA'
  }, {
    x: M + 316,
    w: 60,
    label: 'VENCE'
  }, {
    x: M + 376,
    w: 62,
    label: 'SITUAÇÃO'
  }, {
    x: W - M - 6,
    w: 100,
    right: true,
    label: 'VALOR'
  }], act.map(f => {
    const p = isPaid(f, m);
    return [{
      t: f.name
    }, {
      t: f.cat,
      color: C.muted
    }, {
      t: 'dia ' + Math.min(f.due, dim(m)),
      color: C.muted
    }, {
      t: p ? 'Pago' : 'Pendente',
      color: p ? C.green : C.red,
      bold: true
    }, {
      t: money(f.amount),
      bold: true
    }];
  }), 'Nenhuma despesa fixa cadastrada.');

  /* ----- Metas ----- */
  section('Metas (situação atual)');
  table([{
    x: M + 6,
    w: 165,
    label: 'META'
  }, {
    x: M + 285,
    w: 105,
    right: true,
    label: 'GUARDADO'
  }, {
    x: M + 385,
    w: 95,
    right: true,
    label: 'VALOR DA META'
  }, {
    x: M + 430,
    w: 40,
    right: true,
    label: '%'
  }, {
    x: M + 445,
    w: 70,
    label: 'PRAZO'
  }], appState.data.goals.map(g => [{
    t: g.name
  }, {
    t: money(g.saved)
  }, {
    t: money(g.target)
  }, {
    t: (g.target > 0 ? Math.min(100, g.saved / g.target * 100) : 0).toFixed(0) + '%',
    color: C.purple,
    bold: true
  }, {
    t: fmtDate(g.deadline),
    color: C.muted
  }]), 'Nenhuma meta criada.');

  /* ----- Rodapé de cada página ----- */
  pages.forEach((p, i) => {
    ops = p;
    RECT(M, 34, CW, 0.5, C.line);
    T(M, 20, 'GRANA · Gestão Financeira · ' + label, 8, false, C.muted);
    TR(W - M, 20, `Página ${i + 1} de ${pages.length}`, 8, false, C.muted);
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([pdfBuild(pages)], {
    type: 'application/pdf'
  }));
  a.download = 'grana-relatorio-' + m + '.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function initPdf() {

}

export { PDF_W_REG, PDF_W_BOLD, pdfEnc, pdfStr, pdfW, pdfBuild, exportPDF, initPdf };
