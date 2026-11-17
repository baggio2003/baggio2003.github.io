/**
 * analysis.js — mostra e interpreta i risultati statistici.
 * NON ricalcola nessuna statistica: riceve gli oggetti restituiti da
 * analyzeChunk() (statis.js) e riempie le tabelle della sezione E di index.html.
 *
 * Uso:   AnalysisResults.render(arrayDiChunk);   AnalysisResults.reset();
 * Ogni chunk ha: dataType, chunkIndex, entropy, bitRatio{zeros,ones},
 * chiSquare{value,degreesOfFreedom,zScore,pValue},
 * normalDistribution.bitMonobitTest{zScore,pValue}
 */
(function () {
  'use strict';

  const ALPHA = 0.01; // deve coincidere con il livello usato in statis.js

  // --- helper numerici (solo riassunti descrittivi) ---
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = (a) => {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
  };
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const h = Math.floor(s.length / 2);
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  };
  const fmt = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');

  /** Confronta un p-value con alpha e lo spiega rispetto all'H0 del test. */
  function interpret(p, h0Text) {
    return p < ALPHA
      ? { reject: true, label: 'Reject H₀', text: `p < α: H₀ rejected (${h0Text}).` }
      : { reject: false, label: 'Do not reject H₀',
          text: `p ≥ α: not enough evidence against H₀ (${h0Text}). This does not prove H₀ true.` };
  }

  /** Cella decisione: etichetta testuale + colore (mai solo colore). */
  function decisionCell(chunks, getP, h0Text) {
    const rejected = chunks.filter((c) => interpret(getP(c), h0Text).reject).length;
    const share = ((rejected / chunks.length) * 100).toFixed(0);
    const d = interpret(median(chunks.map(getP)), h0Text);
    const cls = d.reject ? 'analysis-badge-reject' : 'analysis-badge-keep';
    return `<span class="analysis-badge ${cls}">${d.label}</span> ` +
           `<span class="analysis-note">(${share}% of chunks reject)</span>`;
  }

  /** Scrive i valori in una riga di tabella (riga identificata da data-variant). */
  function setRow(tableId, variant, values) {
    const row = document.querySelector(`#${tableId} tr[data-variant="${variant}"]`);
    if (!row) return;
    Object.entries(values).forEach(([field, value]) => {
      const cell = row.querySelector(`[data-f="${field}"]`);
      if (!cell) return;
      if (field === 'decision') cell.innerHTML = value;
      else cell.textContent = value;
      cell.classList.remove('analysis-pending');
    });
  }

  /** Riporta tutte le celle dei risultati a "—". */
  function reset() {
    document.querySelectorAll('#analysis-results [data-f]').forEach((cell) => {
      cell.textContent = '—';
      cell.classList.add('analysis-pending');
    });
  }

  /**
   * Riassume ogni variante. Attenzione: i chunk di uno stesso file NON sono
   * campioni indipendenti, quindi è una descrizione del file analizzato.
   * Medie per entropia, chi-quadro e Z; mediana per i p-value.
   */
  function render(allChunks) {
    reset();
    ['plain', 'compressed', 'encrypted'].forEach((variant) => {
      const c = allChunks.filter((x) => x && x.dataType === variant);
      if (!c.length) return;
      const ent = c.map((x) => x.entropy);

      setRow('analysis-table-entropy', variant, {
        n: String(c.length), mean: fmt(mean(ent), 5), min: fmt(Math.min(...ent), 5),
        max: fmt(Math.max(...ent), 5), sd: fmt(sd(ent), 5)
      });

      if (c[0].chiSquare) {
        setRow('analysis-table-chi', variant, {
          chi: fmt(mean(c.map((x) => x.chiSquare.value)), 2),
          df: String(c[0].chiSquare.degreesOfFreedom),
          z: fmt(mean(c.map((x) => x.chiSquare.zScore)), 3),
          p: fmt(median(c.map((x) => x.chiSquare.pValue)), 6),
          decision: decisionCell(c, (x) => x.chiSquare.pValue, 'byte distribution is uniform')
        });
      }

      const mono = (x) => x.normalDistribution && x.normalDistribution.bitMonobitTest;
      if (mono(c[0])) {
        setRow('analysis-table-monobit', variant, {
          zeros: fmt(mean(c.map((x) => x.bitRatio.zeros)) * 100, 3),
          ones: fmt(mean(c.map((x) => x.bitRatio.ones)) * 100, 3),
          z: fmt(mean(c.map((x) => mono(x).zScore)), 3),
          p: fmt(median(c.map((x) => mono(x).pValue)), 6),
          decision: decisionCell(c, (x) => mono(x).pValue, 'P(1) = 0.5')
        });
      }
    });
  }

  // L'interpretazione scritta (sezioni E.4 e F.4) resta manuale.
  window.AnalysisResults = { render, reset, interpret, ALPHA };
})();
