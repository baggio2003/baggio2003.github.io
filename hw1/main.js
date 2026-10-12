// ==========================================================================
// HW1: Elliptic Curve Discrete Logarithm Problem (ECDLP) Simulation
// Curve: y^2 = x^3 + 7 over F_17 (secp256k1 toy model)
// ==========================================================================

const P = 17;
const A = 0;
const B = 7;

// Istanze dei grafici Chart.js per consentire la distruzione e il ridisegno pulito
let chartCoordsInstance = null;
let chartBitsInstance = null;
let chartScatterInstance = null;
let animationTimer = null;

// --------------------------------------------------------------------------
// 1. ARITMETICA MODULARE & LEGGE DI GRUPPO
// --------------------------------------------------------------------------

// Modulo matematico euclideo (gestisce correttamente i numeri negativi)
function mod(n, m = P) {
  return ((n % m) + m) % m;
}

// Inverso modulare tramite Algoritmo di Euclide Esteso
function modInverse(a, m = P) {
  a = mod(a, m);
  if (a === 0) return null; // Non invertibile se divisibile per P

  let lm = 1, hm = 0;
  let low = a, high = m;

  while (low > 1) {
    let ratio = Math.floor(high / low);
    let nm = hm - lm * ratio;
    let newLow = high - low * ratio;
    hm = lm;
    lm = nm;
    high = low;
    low = newLow;
  }
  return mod(lm, m);
}

// Verifica se un punto rappresenta il Punto all'Infinito (O)
function isInfinity(pt) {
  return pt === null || pt === undefined || pt.infinity === true;
}

// Addizione di punti su E(F_17)
function pointAdd(p1, p2) {
  // Caso 1: O + P2 = P2
  if (isInfinity(p1)) return { point: p2, lambda: "-", op: "Identity (O + P)" };
  // Caso 2: P1 + O = P1
  if (isInfinity(p2)) return { point: p1, lambda: "-", op: "Identity (P + O)" };

  // Caso 3: P1 + (-P1) = O (stessa x, y opposte)
  if (p1.x === p2.x && mod(p1.y + p2.y) === 0) {
    return { point: null, lambda: "Vertical / Inf", op: "Inverse Sum (P + (-P) = O)" };
  }

  let lambda;
  let opType = "";

  if (p1.x === p2.x && p1.y === p2.y) {
    // Point Doubling (P + P)
    opType = "Point Doubling (2P)";
    if (p1.y === 0) {
      return { point: null, lambda: "Vertical Tangent", op: "Doubling (y=0 -> O)" };
    }
    const num = mod(3 * p1.x * p1.x + A);
    const den = mod(2 * p1.y);
    const denInv = modInverse(den, P);
    if (denInv === null) return { point: null, lambda: "No Inv", op: "O" };
    lambda = mod(num * denInv);
  } else {
    // Point Addition (P1 != P2)
    opType = "Point Addition (P + Q)";
    const num = mod(p2.y - p1.y);
    const den = mod(p2.x - p1.x);
    const denInv = modInverse(den, P);
    if (denInv === null) return { point: null, lambda: "No Inv", op: "O" };
    lambda = mod(num * denInv);
  }

  const x3 = mod(lambda * lambda - p1.x - p2.x);
  const y3 = mod(lambda * (p1.x - x3) - p1.y);

  return {
    point: { x: x3, y: y3 },
    lambda: lambda.toString(),
    op: opType
  };
}

// Trova tutti i punti affini appartenenti alla curva su F_17
function getAllCurvePoints() {
  const validPoints = [];
  for (let x = 0; x < P; x++) {
    const rhs = mod(x * x * x + B);
    for (let y = 0; y < P; y++) {
      if (mod(y * y) === rhs) {
        validPoints.push({ x, y });
      }
    }
  }
  return validPoints;
}

const allCurvePoints = getAllCurvePoints();

// Calcola l'ordine ciclico di un punto (quante somme prima di O)
function getPointOrder(pt) {
  let curr = pt;
  let order = 1;
  while (!isInfinity(curr) && order <= P + 2) {
    curr = pointAdd(curr, pt).point;
    order++;
  }
  return order;
}

// --------------------------------------------------------------------------
// 2. MOTORE DI CALCOLO INTERATTIVO
// --------------------------------------------------------------------------

function computeSteps(basePoint, kMax) {
  const steps = [];
  let current = basePoint;

  steps.push({
    i: 1,
    op: "Base Point (1G)",
    lambda: "-",
    point: { x: basePoint.x, y: basePoint.y }
  });

  for (let i = 2; i <= kMax; i++) {
    const res = pointAdd(current, basePoint);
    steps.push({
      i: i,
      op: isInfinity(current) ? "O + G" : (current.x === basePoint.x && current.y === basePoint.y ? "Doubling (2G)" : `Add (${i-1}G + G)`),
      lambda: res.lambda,
      point: res.point
    });
    current = res.point;
  }
  return steps;
}

// Esegue il calcolo completo e aggiorna la UI
function executeComputation() {
  if (animationTimer) clearInterval(animationTimer);

  const kInput = document.getElementById("inputK");
  const selectG = document.getElementById("selectG");

  if (!kInput || !selectG) return;

  const kVal = Math.max(1, Math.min(18, parseInt(kInput.value) || 1));
  kInput.value = kVal;

  const coords = selectG.value.split(",").map(Number);
  const basePoint = { x: coords[0], y: coords[1] };

  // Calcolo passi intermedi
  const steps = computeSteps(basePoint, kVal);
  const finalPoint = steps[steps.length - 1].point;

  // Aggiornamento Box Statistiche
  const valK = document.getElementById("valK");
  const valG = document.getElementById("valG");
  const valQ = document.getElementById("valQ");

  if (valK) valK.textContent = kVal;
  if (valG) valG.textContent = `(${basePoint.x}, ${basePoint.y})`;
  if (valQ) {
    valQ.textContent = isInfinity(finalPoint) ? "𝒪 (Infinity)" : `(${finalPoint.x}, ${finalPoint.y})`;
  }

  // Popolamento Tabella
  renderStepsTable(steps);

  // Disegno Canvas
  drawCanvas(allCurvePoints, steps, basePoint, finalPoint);

  // Aggiornamento Grafici Statistici
  renderStatisticalCharts(basePoint);
}

// Renderizza i passi intermedi nella tabella
function renderStepsTable(steps) {
  const tbody = document.querySelector("#stepsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  steps.forEach(s => {
    const tr = document.createElement("tr");
    const ptStr = isInfinity(s.point) 
      ? "<span style='color: #f43f5e; font-weight: bold;'>𝒪 (Point at Infinity)</span>" 
      : `(${s.point.x}, ${s.point.y})`;

    tr.innerHTML = `
      <td><strong>${s.i}G</strong></td>
      <td>${s.op}</td>
      <td>${s.lambda}</td>
      <td style="font-family: monospace;">${ptStr}</td>
    `;
    tbody.appendChild(tr);
  });

  // Re-render MathJax per eventuali formule matematiche aggiunte
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise([tbody]).catch(() => {});
  }
}

// --------------------------------------------------------------------------
// 3. CANVAS GRAFICO: TORO DISCRETO F_17 x F_17
// --------------------------------------------------------------------------

function drawCanvas(allPoints, steps, basePoint, finalPoint, maxStepIdx = steps.length - 1) {
  const canvas = document.getElementById("ecCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const w = canvas.width;
  const h = canvas.height;
  const padding = 35;
  const plotW = w - padding * 2;
  const plotH = h - padding * 2;

  // Funzione per mappare le coordinate matematiche (0-16) ai pixel del canvas
  const toPxX = (x) => padding + (x / (P - 1)) * plotW;
  const toPxY = (y) => h - padding - (y / (P - 1)) * plotH; // Inverte l'asse Y per convenzione cartesiana

  // Reset e sfondo
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, w, h);

  // Reticolo e assi
  ctx.strokeStyle = "#21262d";
  ctx.lineWidth = 1;
  for (let i = 0; i < P; i++) {
    const px = toPxX(i);
    const py = toPxY(i);

    // Linee verticali
    ctx.beginPath();
    ctx.moveTo(px, padding);
    ctx.lineTo(px, h - padding);
    ctx.stroke();

    // Linee orizzontali
    ctx.beginPath();
    ctx.moveTo(padding, py);
    ctx.lineTo(w - padding, py);
    ctx.stroke();

    // Etichette numeriche
    ctx.fillStyle = "#64748b";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(i.toString(), px, h - padding + 15);
    ctx.textAlign = "right";
    ctx.fillText(i.toString(), padding - 8, py + 3);
  }

  // Asse di simmetria y = 8.5
  const pyMid = toPxY(8.5);
  ctx.strokeStyle = "rgba(99, 102, 241, 0.25)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding, pyMid);
  ctx.lineTo(w - padding, pyMid);
  ctx.stroke();
  ctx.setLineDash([]);

  // Tutti i punti validi della curva (in ciano opaco)
  allPoints.forEach(pt => {
    ctx.fillStyle = "rgba(6, 182, 212, 0.4)";
    ctx.beginPath();
    ctx.arc(toPxX(pt.x), toPxY(pt.y), 4.5, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Tracciamento del percorso dei salti (linea tratteggiata indaco)
  const activeSteps = steps.slice(0, maxStepIdx + 1).filter(s => !isInfinity(s.point));
  if (activeSteps.length > 1) {
    ctx.strokeStyle = "#818cf8";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(toPxX(activeSteps[0].point.x), toPxY(activeSteps[0].point.y));
    for (let i = 1; i < activeSteps.length; i++) {
      ctx.lineTo(toPxX(activeSteps[i].point.x), toPxY(activeSteps[i].point.y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Evidenziazione Punto Base G (Arancione)
  if (basePoint) {
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(toPxX(basePoint.x), toPxY(basePoint.y), 7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Evidenziazione Punto Finale Q (Smeraldo)
  if (finalPoint && !isInfinity(finalPoint)) {
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(toPxX(finalPoint.x), toPxY(finalPoint.y), 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Animazione sequenziale passo-passo
function playAnimation() {
  if (animationTimer) clearInterval(animationTimer);

  const selectG = document.getElementById("selectG");
  const kInput = document.getElementById("inputK");
  if (!selectG || !kInput) return;

  const coords = selectG.value.split(",").map(Number);
  const basePoint = { x: coords[0], y: coords[1] };
  const kVal = parseInt(kInput.value) || 6;
  const steps = computeSteps(basePoint, kVal);

  let currentIdx = 0;
  animationTimer = setInterval(() => {
    drawCanvas(allCurvePoints, steps, basePoint, steps[currentIdx].point, currentIdx);
    currentIdx++;
    if (currentIdx >= steps.length) {
      clearInterval(animationTimer);
    }
  }, 450);
}

// --------------------------------------------------------------------------
// 4. ESPLORAZIONE STATISTICA (CHART.JS)
// --------------------------------------------------------------------------

function renderStatisticalCharts(basePoint) {
  const multiples = [];
  let curr = basePoint;
  multiples.push({ k: 1, pt: curr });

  for (let k = 2; k <= 18; k++) {
    curr = pointAdd(curr, basePoint).point;
    multiples.push({ k, pt: curr });
  }

  const xFreq = new Array(P).fill(0);
  const yFreq = new Array(P).fill(0);
  const bitParity = { even: 0, odd: 0 };
  const scatterData = [];

  multiples.forEach(m => {
    // Controllo rigoroso per evitare errori di accesso su null per il punto all'infinito
    if (!isInfinity(m.pt)) {
      xFreq[m.pt.x]++;
      yFreq[m.pt.y]++;
      if (m.pt.x % 2 === 0) bitParity.even++;
      else bitParity.odd++;
      scatterData.push({ x: m.k, y: m.pt.x });
    }
  });

  // 1. Istogramma frequenze X e Y
  const ctxCoords = document.getElementById("chartCoordinates");
  if (ctxCoords) {
    if (chartCoordsInstance) chartCoordsInstance.destroy();
    chartCoordsInstance = new Chart(ctxCoords.getContext("2d"), {
      type: "bar",
      data: {
        labels: Array.from({ length: P }, (_, i) => i.toString()),
        datasets: [
          {
            label: "X Freq",
            data: xFreq,
            backgroundColor: "rgba(99, 102, 241, 0.75)",
            borderColor: "#6366f1",
            borderWidth: 1
          },
          {
            label: "Y Freq",
            data: yFreq,
            backgroundColor: "rgba(6, 182, 212, 0.75)",
            borderColor: "#06b6d4",
            borderWidth: 1
          }
        ]
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
          title: { display: true, text: "Frequencies of X and Y Coordinates", color: "#f8fafc" }
        }
      }
    });
  }

  // 2. Parità del bit meno significativo (LSB)
  const ctxBits = document.getElementById("chartBits");
  if (ctxBits) {
    if (chartBitsInstance) chartBitsInstance.destroy();
    chartBitsInstance = new Chart(ctxBits.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["Even LSB (0)", "Odd LSB (1)"],
        datasets: [{
          data: [bitParity.even, bitParity.odd],
          backgroundColor: ["rgba(6, 182, 212, 0.75)", "rgba(244, 63, 94, 0.75)"],
          borderColor: ["#06b6d4", "#f43f5e"],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#f8fafc" } },
          title: { display: true, text: "Bit Parity Distribution (LSB of X)", color: "#f8fafc" }
        }
      }
    });
  }

  // 3. Cammino pseudo-casuale k -> x(kG)
  const ctxScatter = document.getElementById("chartScatter");
  if (ctxScatter) {
    if (chartScatterInstance) chartScatterInstance.destroy();
    chartScatterInstance = new Chart(ctxScatter.getContext("2d"), {
      type: "line",
      data: {
        labels: scatterData.map(d => `k=${d.x}`),
        datasets: [{
          label: "Coordinate x(kG)",
          data: scatterData.map(d => d.y),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.2)",
          tension: 0.1,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 16, ticks: { color: "#94a3b8" }, grid: { color: "#21262d" } },
          x: { ticks: { color: "#94a3b8" }, grid: { color: "#21262d" } }
        },
        plugins: {
          legend: { labels: { color: "#f8fafc" } },
          title: { display: true, text: "Non-Linear Mapping k ↦ x(kG) (Pseudo-Random Walk)", color: "#f8fafc" }
        }
      }
    });
  }
}

// --------------------------------------------------------------------------
// 5. INIZIALIZZAZIONE & EVENT LISTENERS
// --------------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  // Event listeners pulsanti e input
  const btnCompute = document.getElementById("btnCompute");
  const btnAnimate = document.getElementById("btnAnimate");
  const inputK = document.getElementById("inputK");
  const selectG = document.getElementById("selectG");

  if (btnCompute) btnCompute.addEventListener("click", executeComputation);
  if (btnAnimate) btnAnimate.addEventListener("click", playAnimation);
  if (inputK) inputK.addEventListener("input", executeComputation);
  if (selectG) selectG.addEventListener("change", executeComputation);

  // Primo calcolo immediato all'apertura della pagina
  executeComputation();
});