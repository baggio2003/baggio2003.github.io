function toggleProbInput() {
  const model = document.getElementById('modelSelect').value;
  const probGroup = document.getElementById('probGroup');
  probGroup.style.display = (model === 'bernoulli') ? 'flex' : 'none';
}

function generateStep(model, p) {
  if (model === 'bernoulli') {
    return Math.random() < p ? 1 : 0;
  } else {
    return Math.random() < 0.5 ? 1 : -1;
  }
}

function runSimulation() {
  const model = document.getElementById('modelSelect').value;
  const p = parseFloat(document.getElementById('probInput').value);
  const norm = document.getElementById('normSelect').value;
  const n = parseInt(document.getElementById('nInput').value, 10);
  const m = parseInt(document.getElementById('mInput').value, 10);

  const mu = (model === 'bernoulli') ? p : 0;
  const sigma2 = (model === 'bernoulli') ? p * (1 - p) : 1;

  const trajectories = [];
  const finalValues = [];
  let minVal = Infinity;
  let maxVal = -Infinity;

  for (let j = 0; j < m; j++) {
    let sum = 0;
    const path = new Float64Array(n);

    for (let i = 1; i <= n; i++) {
      sum += generateStep(model, p);
      let val;
      if (norm === 'total') {
        val = sum;
      } else if (norm === 'average') {
        val = sum / i;
      } else {
        val = sum / Math.sqrt(i);
      }

      path[i - 1] = val;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
    trajectories.push(path);
    finalValues.push(path[n - 1]);
  }

  const empMean = finalValues.reduce((acc, val) => acc + val, 0) / m;
  const empVar = finalValues.reduce((acc, val) => acc + Math.pow(val - empMean, 2), 0) / m;

  let theoMean, theoVar;
  if (norm === 'total') {
    theoMean = n * mu;
    theoVar = n * sigma2;
  } else if (norm === 'average') {
    theoMean = mu;
    theoVar = sigma2 / n;
  } else {
    theoMean = Math.sqrt(n) * mu;
    theoVar = sigma2;
  }

  document.getElementById('empMean').innerText = empMean.toFixed(4);
  document.getElementById('theoMean').innerText = theoMean.toFixed(4);
  document.getElementById('empVar').innerText = empVar.toFixed(4);
  document.getElementById('theoVar').innerText = theoVar.toFixed(4);

  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  }
  const pad = (maxVal - minVal) * 0.08;
  minVal -= pad;
  maxVal += pad;

  drawTrajectories(trajectories, n, m, minVal, maxVal, theoMean);
  drawHistogram(finalValues, minVal, maxVal, model, norm);
}

function drawTrajectories(trajectories, n, m, minVal, maxVal, theoMean) {
  const canvas = document.getElementById('trajCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const padLeft = 50, padRight = 20, padTop = 20, padBottom = 35;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  ctx.clearRect(0, 0, W, H);

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
    ctx.fillText(val.toFixed(2), 5, y + 4);
  }

  const maxDraw = Math.min(m, 150);
  ctx.lineWidth = 1;
  for (let j = 0; j < maxDraw; j++) {
    ctx.strokeStyle = `hsla(${(j * 137.5) % 360}, 70%, 45%, 0.35)`;
    ctx.beginPath();
    const path = trajectories[j];
    for (let i = 0; i < n; i++) {
      const x = padLeft + (i / (n - 1)) * plotW;
      const y = padTop + plotH - ((path[i] - minVal) / (maxVal - minVal)) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const yMean = padTop + plotH - ((theoMean - minVal) / (maxVal - minVal)) * plotH;
  if (yMean >= padTop && yMean <= padTop + plotH) {
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, yMean);
    ctx.lineTo(W - padRight, yMean);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padLeft, padTop, plotW, plotH);
  ctx.fillText(`System step n = ${n}`, W / 2 - 40, H - 8);
}

function drawHistogram(finalValues, minVal, maxVal, model, norm) {
  const canvas = document.getElementById('histCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const padLeft = 20, padRight = 30, padTop = 20, padBottom = 35;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  ctx.clearRect(0, 0, W, H);

  const numBins = 25;
  const binWidth = (maxVal - minVal) / numBins;
  const bins = new Array(numBins).fill(0);

  for (const v of finalValues) {
    let idx = Math.floor((v - minVal) / binWidth);
    if (idx < 0) idx = 0;
    if (idx >= numBins) idx = numBins - 1;
    bins[idx]++;
  }

  const maxCount = Math.max(...bins, 1);

  ctx.fillStyle = 'rgba(37, 99, 235, 0.6)';
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 1;

  for (let b = 0; b < numBins; b++) {
    const yTop = padTop + plotH - ((b + 1) / numBins) * plotH;
    const barH = plotH / numBins;
    const barW = (bins[b] / maxCount) * plotW;

    ctx.fillRect(padLeft, yTop, barW, barH - 1);
    ctx.strokeRect(padLeft, yTop, barW, barH - 1);
  }

  if (model === 'rademacher' && norm === 'normalized') {
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    const totalArea = finalValues.length * binWidth;
    for (let py = 0; py <= plotH; py++) {
      const z = minVal + ((plotH - py) / plotH) * (maxVal - minVal);
      const pdf = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
      const expectedCount = pdf * totalArea;
      const x = padLeft + (expectedCount / maxCount) * plotW;
      const y = padTop + py;

      if (py === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padLeft, padTop, plotW, plotH);
  ctx.fillStyle = '#475569';
  ctx.font = '12px sans-serif';
  ctx.fillText('Frequency (at step n)', W / 2 - 50, H - 8);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modelSelect').addEventListener('change', () => {
    toggleProbInput();
    runSimulation();
  });
  document.getElementById('normSelect').addEventListener('change', runSimulation);
  document.getElementById('runBtn').addEventListener('click', runSimulation);

  toggleProbInput();
  runSimulation();
});