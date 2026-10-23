// Global state holding the current Monte Carlo sample so switching views uses the exact same paths
let simState = null;

function toggleProbInput() {
  const model = document.getElementById('modelSelect').value;
  const probGroup = document.getElementById('probGroup');
  probGroup.style.display = (model === 'bernoulli') ? 'flex' : 'none';
}

// Standard Normal CDF Phi(z) approximation (Abramowitz & Stegun 7.1.26, error < 1.5e-7)
function normalCDF(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function normalPDF(x, mean, std) {
  if (std <= 0) return 0;
  const z = (x - mean) / std;
  return (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
}

// Generate fresh Monte Carlo sample trajectories of raw sums S_i
function generateSimulation() {
  const model = document.getElementById('modelSelect').value;
  const p = Math.min(0.99, Math.max(0.01, parseFloat(document.getElementById('probInput').value) || 0.5));
  const n = Math.min(5000, Math.max(20, parseInt(document.getElementById('nInput').value, 10) || 600));
  const m = Math.min(2000, Math.max(20, parseInt(document.getElementById('mInput').value, 10) || 300));

  const mu = (model === 'bernoulli') ? p : 0;
  const sigma2 = (model === 'bernoulli') ? p * (1 - p) : 1;
  const sigma = Math.sqrt(sigma2);

  // rawSums[j] is Int32Array of length n storing S_1, S_2, ..., S_n for attacker j
  const rawSums = new Array(m);
  for (let j = 0; j < m; j++) {
    const arr = new Int32Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const step = (model === 'bernoulli')
        ? (Math.random() < p ? 1 : 0)
        : (Math.random() < 0.5 ? 1 : -1);
      s += step;
      arr[i] = s;
    }
    rawSums[j] = arr;
  }

  simState = { model, p, n, m, mu, sigma2, sigma, rawSums };
  updateDisplay();
}

// Recompute views, tables, and charts from current simState
function updateDisplay() {
  if (!simState) return;
  const { model, n, m, mu, sigma2, sigma, rawSums } = simState;
  const norm = document.getElementById('normSelect').value;
  const eps = Math.max(0.005, parseFloat(document.getElementById('epsInput').value) || 0.05);

  // Highlight active row in comparison table
  ['total', 'average', 'normalized'].forEach(key => {
    const row = document.getElementById(`row-${key}`);
    if (row) row.className = (key === norm) ? 'active-row' : '';
  });

  // Compute terminal values at step n for all 3 quantities simultaneously
  const termTotal = new Float64Array(m);
  const termAvg = new Float64Array(m);
  const termNorm = new Float64Array(m);
  const sqrtN = Math.sqrt(n);

  for (let j = 0; j < m; j++) {
    const sn = rawSums[j][n - 1];
    termTotal[j] = sn;
    termAvg[j] = sn / n;
    termNorm[j] = sn / sqrtN;
  }

  function calcMoments(arr) {
    let sum = 0;
    for (let j = 0; j < m; j++) sum += arr[j];
    const mean = sum / m;
    let vSum = 0;
    for (let j = 0; j < m; j++) {
      const d = arr[j] - mean;
      vSum += d * d;
    }
    return { mean, variance: vSum / m };
  }

  const momTotal = calcMoments(termTotal);
  const momAvg = calcMoments(termAvg);
  const momNorm = calcMoments(termNorm);

  // Populate comparison table
  document.getElementById('empMeanTotal').innerText = momTotal.mean.toFixed(4);
  document.getElementById('theoMeanTotal').innerText = (n * mu).toFixed(4);
  document.getElementById('empVarTotal').innerText = momTotal.variance.toFixed(4);
  document.getElementById('theoVarTotal').innerText = (n * sigma2).toFixed(4);

  document.getElementById('empMeanAvg').innerText = momAvg.mean.toFixed(4);
  document.getElementById('theoMeanAvg').innerText = mu.toFixed(4);
  document.getElementById('empVarAvg').innerText = momAvg.variance.toFixed(5);
  document.getElementById('theoVarAvg').innerText = (sigma2 / n).toFixed(5);

  document.getElementById('empMeanNorm').innerText = momNorm.mean.toFixed(4);
  document.getElementById('theoMeanNorm').innerText = (sqrtN * mu).toFixed(4);
  document.getElementById('empVarNorm').innerText = momNorm.variance.toFixed(4);
  document.getElementById('theoVarNorm').innerText = sigma2.toFixed(4);

  // LLN Probability at step n: P(|S_n/n - mu| < eps)
  let insideCount = 0;
  for (let j = 0; j < m; j++) {
    if (Math.abs(termAvg[j] - mu) < eps) insideCount++;
  }
  const empProbLLN = insideCount / m;
  const chebBound = Math.max(0, 1 - (sigma2 / (n * eps * eps)));
  document.getElementById('llnProbVal').innerText = `${(empProbLLN * 100).toFixed(1)}%`;
  document.getElementById('chebyshevBound').innerText =
    `Chebyshev lower bound ≥ ${(chebBound * 100).toFixed(1)}%`;

  // CLT Kolmogorov-Smirnov distance at step n
  // Standardized variable Z_n = (S_n - n*mu) / (sigma * sqrt(n))
  // For Rademacher, Z_n === S_n / sqrt(n)
  const ksN = computeKSStandardNormal(rawSums, n - 1, mu, sigma);
  document.getElementById('cltKsVal').innerText = ksN.toFixed(4);
  document.getElementById('cltNote').innerText = (model === 'rademacher')
    ? 'Direct S_n / √n vs N(0,1) (Zero-mean Rademacher)'
    : 'Centered (S_n - np) / √(np(1-p)) vs N(0,1)';

  // Active quantity series for main plots
  const earlyIdx = Math.max(0, Math.floor(n / 5) - 1);
  const earlyStep = earlyIdx + 1;
  const activeFinal = (norm === 'total') ? termTotal : (norm === 'average') ? termAvg : termNorm;
  const activeEarly = new Float64Array(m);

  let minVal = Infinity;
  let maxVal = -Infinity;

  // Compute min/max across all steps of the selected quantity
  const maxDraw = Math.min(m, 150);
  for (let j = 0; j < m; j++) {
    const raw = rawSums[j];
    const sEarly = raw[earlyIdx];
    activeEarly[j] = (norm === 'total') ? sEarly
      : (norm === 'average') ? sEarly / earlyStep
      : sEarly / Math.sqrt(earlyStep);

    // Ensure bounds cover all terminal values and drawn trajectories
    const vf = activeFinal[j];
    if (vf < minVal) minVal = vf;
    if (vf > maxVal) maxVal = vf;

    if (j < maxDraw) {
      for (let i = 0; i < n; i++) {
        const step = i + 1;
        const v = (norm === 'total') ? raw[i]
          : (norm === 'average') ? raw[i] / step
          : raw[i] / Math.sqrt(step);
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }
  }

  let minTerm = Infinity, maxTerm = -Infinity;
  for (let j = 0; j < m; j++) {
    if (activeFinal[j] < minTerm) minTerm = activeFinal[j];
    if (activeFinal[j] > maxTerm) maxTerm = activeFinal[j];
  }
  document.getElementById('minMaxVal').innerText = `[${minTerm.toFixed(3)}, ${maxTerm.toFixed(3)}]`;

  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  }
  const pad = (maxVal - minVal) * 0.08;
  minVal -= pad;
  maxVal += pad;

  drawTrajectories(norm, minVal, maxVal, eps, earlyStep);
  drawHistogram(norm, activeFinal, activeEarly, minVal, maxVal, earlyStep);
  drawVarianceChart();
  drawConvergenceChart(eps);
}

function computeKSStandardNormal(rawSums, stepIdx, mu, sigma) {
  const m = rawSums.length;
  const step = stepIdx + 1;
  const denom = sigma * Math.sqrt(step);
  const zVals = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    zVals[j] = (rawSums[j][stepIdx] - step * mu) / denom;
  }
  zVals.sort();
  let maxDiff = 0;
  for (let j = 0; j < m; j++) {
    const cdfTheo = normalCDF(zVals[j]);
    const d1 = Math.abs((j + 1) / m - cdfTheo);
    const d2 = Math.abs(j / m - cdfTheo);
    if (d1 > maxDiff) maxDiff = d1;
    if (d2 > maxDiff) maxDiff = d2;
  }
  return maxDiff;
}

function drawTrajectories(norm, minVal, maxVal, eps, earlyStep) {
  const { n, m, mu, sigma, rawSums } = simState;
  const canvas = document.getElementById('trajCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const padLeft = 54, padRight = 20, padTop = 20, padBottom = 35;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  ctx.clearRect(0, 0, W, H);

  const toX = (step) => padLeft + ((step - 1) / (n - 1)) * plotW;
  const toY = (val) => padTop + plotH - ((val - minVal) / (maxVal - minVal)) * plotH;

  // Horizontal grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.fillStyle = '#475569';
  ctx.font = '12px sans-serif';
  ctx.lineWidth = 1;

  const numTicksY = 6;
  for (let k = 0; k <= numTicksY; k++) {
    const val = minVal + (k / numTicksY) * (maxVal - minVal);
    const y = padTop + plotH - (k / numTicksY) * plotH;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(W - padRight, y);
    ctx.stroke();
    ctx.fillText(val.toFixed(2), 6, y + 4);
  }

  // Vertical marker for early comparison step n/5
  const xEarly = toX(earlyStep);
  ctx.strokeStyle = '#94a3b8';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(xEarly, padTop);
  ctx.lineTo(xEarly, padTop + plotH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#64748b';
  ctx.fillText(`i=${earlyStep}`, xEarly - 14, padTop + 14);

  // Sample trajectories
  const maxDraw = Math.min(m, 150);
  ctx.lineWidth = 1;
  for (let j = 0; j < maxDraw; j++) {
    ctx.strokeStyle = `hsla(${(j * 137.5) % 360}, 70%, 45%, 0.32)`;
    ctx.beginPath();
    const raw = rawSums[j];
    for (let i = 0; i < n; i++) {
      const step = i + 1;
      const val = (norm === 'total') ? raw[i]
        : (norm === 'average') ? raw[i] / step
        : raw[i] / Math.sqrt(step);
      const x = toX(step);
      const y = toY(val);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Theoretical Mean curve and +-1 SD envelope across step i = 1..n
  const meanAt = (step) => (norm === 'total') ? step * mu
    : (norm === 'average') ? mu
    : Math.sqrt(step) * mu;
  const sdAt = (step) => (norm === 'total') ? Math.sqrt(step) * sigma
    : (norm === 'average') ? sigma / Math.sqrt(step)
    : sigma;

  // Draw +-1 SD envelope
  ctx.strokeStyle = '#0f766e';
  ctx.lineWidth = 1.8;
  ctx.setLineDash([5, 4]);
  [1, -1].forEach(sign => {
    ctx.beginPath();
    for (let step = 1; step <= n; step++) {
      const x = toX(step);
      const y = Math.min(padTop + plotH, Math.max(padTop, toY(meanAt(step) + sign * sdAt(step))));
      if (step === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  // Draw Theoretical Mean curve
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([7, 4]);
  ctx.beginPath();
  for (let step = 1; step <= n; step++) {
    const x = toX(step);
    const y = Math.min(padTop + plotH, Math.max(padTop, toY(meanAt(step))));
    if (step === 1) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw LLN epsilon tube [mu - eps, mu + eps] when viewing Average Score S_n / n
  if (norm === 'average') {
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([2, 3]);
    [mu + eps, mu - eps].forEach(bound => {
      const y = toY(bound);
      if (y >= padTop && y <= padTop + plotH) {
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(W - padRight, y);
        ctx.stroke();
      }
    });
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padLeft, padTop, plotW, plotH);
  ctx.fillStyle = '#475569';
  ctx.fillText(`System index i = 1 ... ${n}`, W / 2 - 50, H - 8);
}

function drawHistogram(norm, finalValues, earlyValues, minVal, maxVal, earlyStep) {
  const { n, m, mu, sigma } = simState;
  const canvas = document.getElementById('histCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const padLeft = 20, padRight = 25, padTop = 20, padBottom = 35;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  ctx.clearRect(0, 0, W, H);

  const numBins = 26;
  const binWidth = (maxVal - minVal) / numBins;
  const binsFinal = new Array(numBins).fill(0);
  const binsEarly = new Array(numBins).fill(0);

  for (let j = 0; j < m; j++) {
    let idxF = Math.floor((finalValues[j] - minVal) / binWidth);
    if (idxF < 0) idxF = 0;
    if (idxF >= numBins) idxF = numBins - 1;
    binsFinal[idxF]++;

    let idxE = Math.floor((earlyValues[j] - minVal) / binWidth);
    if (idxE < 0) idxE = 0;
    if (idxE >= numBins) idxE = numBins - 1;
    binsEarly[idxE]++;
  }

  const maxCount = Math.max(...binsFinal, ...binsEarly, 1);

  // Draw early step n/5 histogram (gray background bars)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.6)';
  ctx.lineWidth = 1;
  for (let b = 0; b < numBins; b++) {
    const yTop = padTop + plotH - ((b + 1) / numBins) * plotH;
    const barH = plotH / numBins;
    const barW = (binsEarly[b] / maxCount) * plotW;
    ctx.fillRect(padLeft, yTop, barW, barH - 1);
    ctx.strokeRect(padLeft, yTop, barW, barH - 1);
  }

  // Draw terminal step n histogram (blue foreground bars)
  ctx.fillStyle = 'rgba(37, 99, 235, 0.62)';
  ctx.strokeStyle = '#1d4ed8';
  for (let b = 0; b < numBins; b++) {
    const yTop = padTop + plotH - ((b + 1) / numBins) * plotH;
    const barH = plotH / numBins;
    const barW = (binsFinal[b] / maxCount) * plotW;
    ctx.fillRect(padLeft, yTop, barW, barH - 1);
    ctx.strokeRect(padLeft, yTop, barW, barH - 1);
  }

  // Overlay Theoretical Gaussian PDF at step n
  // For Rademacher + Normalized, theoMean = 0 and theoStd = 1 -> exact N(0,1)
  const theoMean = (norm === 'total') ? n * mu
    : (norm === 'average') ? mu
    : Math.sqrt(n) * mu;
  const theoStd = (norm === 'total') ? Math.sqrt(n) * sigma
    : (norm === 'average') ? sigma / Math.sqrt(n)
    : sigma;

  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  const totalArea = m * binWidth;
  for (let py = 0; py <= plotH; py++) {
    const val = minVal + ((plotH - py) / plotH) * (maxVal - minVal);
    const pdf = normalPDF(val, theoMean, theoStd);
    const expectedCount = pdf * totalArea;
    const x = Math.min(padLeft + plotW, padLeft + (expectedCount / maxCount) * plotW);
    const y = padTop + py;
    if (py === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padLeft, padTop, plotW, plotH);
  ctx.fillStyle = '#475569';
  ctx.font = '12px sans-serif';
  ctx.fillText(`Frequency (i=${earlyStep} vs n=${n})`, W / 2 - 65, H - 8);
}

// Chart 3: Empirical & Theoretical Variance Behavior across step i = 1..n for all 3 normalizations
function drawVarianceChart() {
  const { n, m, sigma2, rawSums } = simState;
  const canvas = document.getElementById('varCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const padLeft = 50, padRight = 20, padTop = 20, padBottom = 35;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  ctx.clearRect(0, 0, W, H);

  // Sample 50 points along 1..n for smooth curve rendering
  const numPts = Math.min(n, 60);
  const steps = [];
  for (let k = 0; k < numPts; k++) {
    const s = Math.max(1, Math.round(1 + (k / (numPts - 1)) * (n - 1)));
    steps.push(s);
  }

  // Note: To display Var(S_i), Var(S_i/sqrt(i)), and Var(S_i/i) on the same Y-axis [0, 1.35 * sigma2],
  // Var(S_i) is scaled by 1/n so its linear growth from 0 to sigma^2 is clearly visible alongside the others.
  const yMax = Math.max(sigma2 * 1.4, 0.35);
  const toX = (step) => padLeft + ((step - 1) / (n - 1)) * plotW;
  const toY = (v) => padTop + plotH - Math.min(1, Math.max(0, v / yMax)) * plotH;

  // Grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.fillStyle = '#475569';
  ctx.font = '11px sans-serif';
  for (let k = 0; k <= 4; k++) {
    const val = (k / 4) * yMax;
    const y = padTop + plotH - (k / 4) * plotH;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(W - padRight, y);
    ctx.stroke();
    ctx.fillText(val.toFixed(2), 8, y + 4);
  }

  const empVarTotalScaled = [];
  const empVarNorm = [];
  const empVarAvg = [];

  for (const step of steps) {
    const idx = step - 1;
    let sum = 0;
    for (let j = 0; j < m; j++) sum += rawSums[j][idx];
    const meanS = sum / m;
    let vSum = 0;
    for (let j = 0; j < m; j++) {
      const d = rawSums[j][idx] - meanS;
      vSum += d * d;
    }
    const varS = vSum / m;
    empVarTotalScaled.push(varS / n);
    empVarNorm.push(varS / step);
    empVarAvg.push(varS / (step * step));
  }

  function plotSeries(arr, color, dashed = false) {
    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 1.5 : 2.2;
    if (dashed) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let k = 0; k < steps.length; k++) {
      const x = toX(steps[k]);
      const y = toY(arr[k]);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Theoretical dashed curves
  plotSeries(steps.map(s => (s * sigma2) / n), '#ea580c', true);
  plotSeries(steps.map(() => sigma2), '#16a34a', true);
  plotSeries(steps.map(s => sigma2 / s), '#2563eb', true);

  // Empirical solid curves
  plotSeries(empVarTotalScaled, '#ea580c', false);
  plotSeries(empVarNorm, '#16a34a', false);
  plotSeries(empVarAvg, '#2563eb', false);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padLeft, padTop, plotW, plotH);
  ctx.fillStyle = '#475569';
  ctx.fillText(`Step i = 1 ... ${n} (Solid: Empirical, Dashed: Theoretical)`, W / 2 - 125, H - 8);
}

// Chart 4: LLN Convergence in Probability & CLT KS Distance across step i = 1..n
function drawConvergenceChart(eps) {
  const { n, m, mu, sigma, rawSums } = simState;
  const canvas = document.getElementById('convCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const padLeft = 50, padRight = 20, padTop = 20, padBottom = 35;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  ctx.clearRect(0, 0, W, H);

  const numPts = Math.min(n, 50);
  const steps = [];
  for (let k = 0; k < numPts; k++) {
    const s = Math.max(1, Math.round(1 + (k / (numPts - 1)) * (n - 1)));
    steps.push(s);
  }

  const toX = (step) => padLeft + ((step - 1) / (n - 1)) * plotW;
  const toY = (v) => padTop + plotH - Math.min(1, Math.max(0, v)) * plotH;

  // Grid [0, 1]
  ctx.strokeStyle = '#e2e8f0';
  ctx.fillStyle = '#475569';
  ctx.font = '11px sans-serif';
  for (let k = 0; k <= 5; k++) {
    const val = k / 5;
    const y = toY(val);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(W - padRight, y);
    ctx.stroke();
    ctx.fillText(val.toFixed(1), 14, y + 4);
  }

  const llnCurve = [];
  const ksCurve = [];

  for (const step of steps) {
    const idx = step - 1;
    let inside = 0;
    for (let j = 0; j < m; j++) {
      const avg = rawSums[j][idx] / step;
      if (Math.abs(avg - mu) < eps) inside++;
    }
    llnCurve.push(inside / m);
    ksCurve.push(computeKSStandardNormal(rawSums, idx, mu, sigma));
  }

  // Plot LLN probability curve -> 1
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let k = 0; k < steps.length; k++) {
    const x = toX(steps[k]);
    const y = toY(llnCurve[k]);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Plot CLT KS distance curve -> 0
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let k = 0; k < steps.length; k++) {
    const x = toX(steps[k]);
    const y = toY(ksCurve[k]);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padLeft, padTop, plotW, plotH);
  ctx.fillStyle = '#475569';
  ctx.fillText(`Step i = 1 ... ${n} (LLN Prob → 1, CLT KS Distance → 0)`, W / 2 - 125, H - 8);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modelSelect').addEventListener('change', () => {
    toggleProbInput();
    generateSimulation();
  });
  document.getElementById('probInput').addEventListener('change', generateSimulation);
  document.getElementById('nInput').addEventListener('change', generateSimulation);
  document.getElementById('mInput').addEventListener('change', generateSimulation);
  document.getElementById('runBtn').addEventListener('click', generateSimulation);

  // Switching normalization or epsilon updates the view on the SAME sample trajectories
  document.getElementById('normSelect').addEventListener('change', updateDisplay);
  document.getElementById('epsInput').addEventListener('input', updateDisplay);

  toggleProbInput();
  generateSimulation();
});