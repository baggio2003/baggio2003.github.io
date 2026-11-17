
/**
 * multifile.js — sezione statica "Multi-file Statistical Analysis".
 * Nessun calcolo statistico: i risultati raccolti sui file sono scritti qui
 * (unica fonte dei dati) e la pagina li mostra. Per aggiornare i numeri basta
 * modificare l'oggetto MULTIFILE: tabelle, KPI e grafico si aggiornano da soli.
 * Un valore null viene mostrato come "—".
 */
(function () {
  'use strict';

  const MULTIFILE = {
    alpha: 0.01,

    // Un elemento per file analizzato
    files: [
      { type: 'Text',   name: 'letterature-italiana.txt' },
      { type: 'Video',  name: 'demo-video-file.mp4' },
      { type: 'RAW',    name: 'demo-raw-image.raw' },
      { type: 'CSV',    name: 'demo-network-logs.csv' },
      { type: 'Bitmap', name: 'demo-img-not-compressed.bm' },
      { type: 'JPEG',   name: 'demo-image.jpg' }
    ],

    // Entropia media tra i file (bit/byte).
    // Ogni file pesa ugualmente, indipendentemente dal numero di chunk.
    // Min / max calcolati sulle sei entropie medie per file.
    entropy: {
      plain: { mean: 4.30318, min: 0.49633, max: 7.99825 },
      gzip:  { mean: 7.91408, min: 7.76400, max: 7.99999 },
      aes:   { mean: 8.00000, min: 8.00000, max: 8.00000 }
    },

    // Numero di file in cui il p-value MEDIANO tra i chunk
    // porta a rifiutare H0 (a livello di file), con alpha = 0.01.
    reject: {
      chi:  { plain: 6, gzip: 6, aes: 0 },
      mono: { plain: 6, gzip: 5, aes: 0 }
    }
  };

  const VARIANTS = [
    { key: 'plain', label: 'Plaintext',   dot: 'analysis-dot-plain', color: '#10b981' },
    { key: 'gzip',  label: 'GZIP',        dot: 'analysis-dot-comp',  color: '#f59e0b' },
    { key: 'aes',   label: 'AES-256-CTR', dot: 'analysis-dot-enc',   color: '#ef4444' }
  ];

  const n = MULTIFILE.files.length;
  const num = (x, d) => (x == null ? '—' : x.toFixed(d));
  const cell = (txt) => `<td class="analysis-computed${txt === '—' ? ' analysis-pending' : ''}">${txt}</td>`;
  const label = (v) => `<td><span class="analysis-dot ${v.dot}"></span>${v.label}</td>`;
  const put = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  // KPI
  put('mf-kpi-files', String(n));
  put('mf-kpi-variants', String(VARIANTS.length));
  put('mf-kpi-alpha', String(MULTIFILE.alpha));
  put('mf-types', MULTIFILE.files.map((f) => f.type).join(' · '));

  // Tabella dei file (consultabile con "View dataset details")
  put('mf-files-body', MULTIFILE.files.map((f, i) =>
    `<tr><td>${i + 1}</td><td>${f.type}</td>${cell(f.name == null ? '—' : f.name)}</tr>`).join(''));

  // Tabella entropia
  put('mf-entropy-body', VARIANTS.map((v) => {
    const e = MULTIFILE.entropy[v.key];
    return `<tr>${label(v)}${cell(num(e.mean, 3))}${cell(num(e.min, 3))}${cell(num(e.max, 3))}</tr>`;
  }).join(''));

  // Tabella test (conteggi file, con testo oltre al colore)
  put('mf-tests-body', VARIANTS.map((v) => {
    const chi = MULTIFILE.reject.chi[v.key];
    const mono = MULTIFILE.reject.mono[v.key];
    return `<tr>${label(v)}${cell(`${chi}/${n}`)}${cell(`${mono}/${n}`)}</tr>`;
  }).join(''));

  // Grafico a barre dell'entropia media (Chart.js è già caricato da index.html)
  const canvas = document.getElementById('analysisMultiEntropy');
  if (canvas && typeof Chart !== 'undefined') {
    new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: VARIANTS.map((v) => v.label),
        datasets: [{
          label: 'Mean entropy (bits/byte)',
          data: VARIANTS.map((v) => MULTIFILE.entropy[v.key].mean),
          backgroundColor: VARIANTS.map((v) => v.color)
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            min: 0,
            max: 8.5,
            title: {
              display: true,
              text: 'Entropy (bits/byte)'
            }
          }
        }
      }
    });
  }

  window.MULTIFILE = MULTIFILE;
})();
