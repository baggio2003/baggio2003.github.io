// ==========================================================================
// HW1: Elliptic Curve Scalar Multiplication & Statistical Analysis
// Curve: y^2 = x^3 + 7 (mod 17)
// ==========================================================================

const P = 17; // Modulo primo del campo finito
const A = 0;  // Parametro a di Weierstrass
const B = 7;  // Parametro b di Weierstrass (identico alla forma secp256k1)

// --- Aritmetica Modulare ---

// Resto modulare sempre positivo
function mod(n, m = P) {
  return ((n % m) + m) % m;
}

// Inverso modulare tramite Algoritmo Euclideo Esteso
function modInverse(a, m = P) {
  a = mod(a, m);
  if (a === 0) return null;
  let [lm, hm] = [1, 0];
  let [low, high] = [a, m];
  while (low > 1) {
    const ratio = Math.floor(high / low);
    const nm = hm - lm * ratio;
    const newLow = high - low * ratio;
    hm = lm;
    lm = nm;
    high = low;
    low = newLow;
  }
  return mod(lm, m);
}

// --- Operazioni su Curva Ellittica ---

// Rappresentazione punto all'infinito: { x: null, y: null, isInfinity: true }
const POINT_AT_INFINITY = { x: null, y: null, isInfinity: true };

function isInfinity(pt) {
  return !pt || pt.isInfinity;
}

// Verifica se un punto appartiene alla curva: y^2 == x^3 + 7 (mod 17)
function isOnCurve(pt) {
  if (isInfinity(pt)) return true;
  const left = mod(pt.y * pt.y);
  const right = mod(pt.x * pt.x * pt.x + B);
  return left === right;
}

// Trova tutti i punti affini su E(F_p)
function getAllPointsOnCurve() {
  const points = [];
  for (let x = 0; x < P; x++) {
    const rhs = mod(x * x * x + B);
    for (let y = 0; y < P; y++) {
      if (mod(y * y) === rhs) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

// Somma tra due punti P1 e P2 su E(F_p)
function pointAdd(p1, p2) {
  if (isInfinity(p1)) return { point: p2, slope: null, type: "Identity" };
  if (isInfinity(p2)) return { point: p1, slope: null, type: "Identity" };

  // Se P1 == -P2, la somma è il punto all'infinito
  if (p1.x === p2.x && mod(p1.y + p2.y) === 0) {
    return { point: POINT_AT_INFINITY, slope: null, type: "Inverse (Point at Infinity)" };
  }

  let lambda;
  let type;

  if (p1.x === p2.x && p1.y === p2.y) {
    // Raddoppio di punto (Point Doubling)
    // lambda = (3*x1^2 + a) / (2*y1) mod p
    const num = mod(3 * p1.x * p1.x + A);
    const den = mod(2 * p1.y);
    const denInv = modInverse(den);
    if (denInv === null) {
      return { point: POINT_AT_INFINITY, slope: null, type: "Vertical Tangent" };
    }
    lambda = mod(num * denInv);
    type = "Doubling";
  } else {
    // Addizione standard tra punti distinti (Point Addition)
    // lambda = (y2 - y1) / (x2 - x1) mod p
    const num = mod(p2.y - p1.y);
    const den = mod(p2.x - p1.x);
    const denInv = modInverse(den);
    if (denInv === null) {
      return { point: POINT_AT_INFINITY, slope: null, type: "Vertical Line" };
    }
    lambda = mod(num * denInv);
    type = "Addition";
  }

  // x3 = lambda^2 - x1 - x2 (mod p)
  const x3 = mod(lambda * lambda - p1.x - p2.x);
  // y3 = lambda*(x1 - x3) - y1 (mod p)
  const y3 = mod(lambda * (p1.x - x3) - p1.y);

  return { point: { x: x3, y: y3, isInfinity: false }, slope: lambda, type };
}

// Calcola i multipli k*G memorizzando tutti i passaggi intermedi
function computeScalarMultiples(basePoint, k) {
  const steps = [];
  let current = basePoint;

  steps.push({
    step: 1,
    operation: "1 · G",
    slope: "-",
    point: { ...current },
    type: "Base Point"
  });

  for (let i = 2; i <= k; i++) {
    const res = pointAdd(current, basePoint);
    current = res.point;
    steps.push({
      step: i,
      operation: `${i} · G = (${i - 1}G + G)`,
      slope: res.slope !== null ? res.slope : "N/A",
      point: { ...current },
      type: res.type
    });
  }

  return steps;
}

// --- Visualizzazione su Canvas (Grid F_17 x F_17) ---

const canvas = document.getElementById("ecCanvas");
const ctx = canvas.getContext("2d");
const allCurvePoints = getAllPointsOnCurve();

function drawGrid(highlightedStep = null, pathPoints = []) {
  const width = canvas.width;
  const height = canvas.height;
  const padding = 35;
  const step = (width - padding * 2) / (P - 1);

  ctx.clearRect(0, 0, width, height);

  // Sfondo discreto
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, width, height);

  // Linee di griglia
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i < P; i++) {
    const pos = padding + i * step;
    ctx.beginPath();
    ctx.moveTo(pos, padding);
    ctx.lineTo(pos, height - padding);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padding, pos);
    ctx.lineTo(width - padding, pos);
    ctx.stroke();

    // Etichette assi
    ctx.fillStyle = "#64748b";
    ctx.font = "10px JetBrains Mono";
    ctx.textAlign = "center";
    ctx.fillText(i, pos, height - padding + 15);
    ctx.textAlign = "right";
    ctx.fillText(i, padding - 8, height - (padding + i * step) + 4);
  }

  // Disegna il percorso di addizione
  if (pathPoints.length > 1) {
    ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pathPoints.length; i++) {
      const pt = pathPoints[i];
      if (isInfinity(pt)) continue;
      const px = padding + pt.x * step;
      const py = height - (padding + pt.y * step);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Disegna tutti i punti validi della curva
  allCurvePoints.forEach(pt => {
    const px = padding + pt.x * step;
    const py = height - (padding + pt.y * step);

    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
    ctx.fill();
  });

  // Evidenzia i punti del calcolo corrente
  pathPoints.forEach((pt, index) => {
    if (isInfinity(pt)) return;
    const px = padding + pt.x * step;
    const py = height - (padding + pt.y * step);

    const isBase = index === 0;
    const isTarget = index === pathPoints.length - 1;

    ctx.beginPath();
    ctx.arc(px, py, isTarget ? 7 : 5, 0, Math.PI * 2);

    if (isTarget) {
      ctx.fillStyle = "#10b981"; // Target Public Key Q
      ctx.shadowColor = "#10b981";
      ctx.shadowBlur = 10;
    } else if (isBase) {
      ctx.fillStyle = "#f59e0b"; // Base point G
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = "#6366f1"; // Intermediate step
      ctx.shadowBlur = 0;
    }

    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

// --- Grafici Statistici (Chart.js) ---

let chartCoordsInstance = null;
let chartBitsInstance = null;
let chartScatterInstance = null;

function renderStatisticalCharts(basePoint) {
  // Calcola 18 multipli scalari
  const multiples = [];
  let curr = basePoint;
  multiples.push({ k: 1, pt: curr });

  for (let k = 2; k <= 18; k++) {
    curr = pointAdd(curr, basePoint).point;
    multiples.push({ k, pt: curr });
  }

  // Frequenze coordinate X e Y
  const xFreq = new Array(P).fill(0);
  const yFreq = new Array(P).fill(0);
  const bitParity = { even: 0, odd: 0 };
  const scatterData = [];

  multiples.forEach(m => {
    if (!isInfinity(m.pt)) {
      xFreq[m.pt.x]++;
      yFreq[m.pt.y]++;
      if (m.pt.x % 2 === 0) bitParity.even++;
      else bitParity.odd++;
      scatterData.push({ x: m.k, y: m.pt.x });
    }
  });

  // 1. Distribuzione coordinate X
  const ctxCoords = document.getElementById("chartCoordinates").getContext("2d");
  if (chartCoordsInstance) chartCoordsInstance.destroy();
  chartCoordsInstance = new Chart(ctxCoords, {
    type: "bar",
    data: {
      labels: Array.from({ length: P }, (_, i) => i.toString()),
      datasets: [{
        label: "Frequenza Coordinata X",
        data: xFreq,
        backgroundColor: "rgba(99, 102, 241, 0.7)",
        borderColor: "#6366f1",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, color: "#94a3b8" }, grid: { color: "#21262d" } },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#21262d" } }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: { display: true, text: "Frequenza dei valori di X (Uniformità)", color: "#f8fafc" }
      }
    }
  });

  // 2. Parità del bit meno significativo (LSB)
  const ctxBits = document.getElementById("chartBits").getContext("2d");
  if (chartBitsInstance) chartBitsInstance.destroy();
  chartBitsInstance = new Chart(ctxBits, {
    type: "doughnut",
    data: {
      labels: ["LSB Pari (0)", "LSB Dispari (1)"],
      datasets: [{
        data: [bitParity.even, bitParity.odd],
        backgroundColor: ["rgba(6, 182, 212, 0.7)", "rgba(244, 63, 94, 0.7)"],
        borderColor: ["#06b6d4", "#f43f5e"],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: { display: true, text: "Distribuzione Parità dei Bit (X coord)", color: "#f8fafc" }
      }
    }
  });

  // 3. Correlazione k -> X (Non-Linearità)
  const ctxScatter = document.getElementById("chartScatter").getContext("2d");
  if (chartScatterInstance) chartScatterInstance.destroy();
  chartScatterInstance = new Chart(ctxScatter, {
    type: "line",
    data: {
      labels: scatterData.map(d => `k=${d.x}`),
      datasets: [{
        label: "Coordinata x(kG) vs Scalare k",
        data: scatterData.map(d => d.y),
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.2)",
        tension: 0.1,
        fill: false,
        pointRadius: 5,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 16, ticks: { color: "#94a3b8" }, grid: { color: "#21262d" } },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#21262d" } }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: { display: true, text: "Mappa non lineare k ↦ x: Assenza di correlazione lineare (Pseudo-Random Walk)", color: "#f8fafc" }
      }
    }
  });
}

// --- Aggiornamento UI & Event Listeners ---

function executeComputation() {
  const k = parseInt(document.getElementById("inputK").value, 10) || 6;
  const [gx, gy] = document.getElementById("selectG").value.split(",").map(Number);
  const basePoint = { x: gx, y: gy, isInfinity: false };

  const steps = computeScalarMultiples(basePoint, k);
  const finalStep = steps[steps.length - 1];

  // Aggiorna KPI
  document.getElementById("valK").textContent = k;
  document.getElementById("valG").textContent = `(${gx}, ${gy})`;
  document.getElementById("valQ").textContent = isInfinity(finalStep.point) 
    ? "O (Inf)" 
    : `(${finalStep.point.x}, ${finalStep.point.y})`;

  // Popola tabella
  const tbody = document.querySelector("#stepsTable tbody");
  tbody.innerHTML = "";
  steps.forEach(s => {
    const tr = document.createElement("tr");
    const ptStr = isInfinity(s.point) ? "O (Infinito)" : `(${s.point.x}, ${s.point.y})`;
    tr.innerHTML = `
      <td><strong>${s.step}</strong></td>
      <td>${s.operation}</td>
      <td><code>${s.slope}</code></td>
      <td style="color: ${s.step === k ? '#10b981' : '#f0f6fc'}; font-weight: 600;">${ptStr}</td>
    `;
    tbody.appendChild(tr);
  });

  const pathPoints = steps.map(s => s.point);
  drawGrid(null, pathPoints);
  renderStatisticalCharts(basePoint);
}

// Animazione sequenziale passo-passo
function runAnimation() {
  const k = parseInt(document.getElementById("inputK").value, 10) || 6;
  const [gx, gy] = document.getElementById("selectG").value.split(",").map(Number);
  const basePoint = { x: gx, y: gy, isInfinity: false };
  const steps = computeScalarMultiples(basePoint, k);

  let stepIdx = 0;
  const interval = setInterval(() => {
    stepIdx++;
    const partialPath = steps.slice(0, stepIdx).map(s => s.point);
    drawGrid(stepIdx, partialPath);

    if (stepIdx >= steps.length) {
      clearInterval(interval);
    }
  }, 350);
}

document.getElementById("btnCompute").addEventListener("click", executeComputation);
document.getElementById("btnAnimate").addEventListener("click", runAnimation);

window.addEventListener("DOMContentLoaded", () => {
  executeComputation();
});