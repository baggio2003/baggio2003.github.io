function renderStatisticalCharts(basePoint) {
  const multiples = [];
  let curr = basePoint;
  multiples.push({ k: 1, pt: curr });

  for (let k = 2; k <= 18; k++) {
    curr = pointAdd(curr, basePoint).point;
    multiples.push({ k, pt: curr });
  }

  // Frequenze per ogni valore possibile nel campo F_17 (0-16)
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

  // 1. Distribuzione congiunta delle coordinate X e Y
  const ctxCoords = document.getElementById("chartCoordinates").getContext("2d");
  if (chartCoordsInstance) chartCoordsInstance.destroy();
  chartCoordsInstance = new Chart(ctxCoords, {
    type: "bar",
    data: {
      labels: Array.from({ length: P }, (_, i) => i.toString()),
      datasets: [
        {
          label: "X-Coordinate Freq",
          data: xFreq,
          backgroundColor: "rgba(99, 102, 241, 0.75)",
          borderColor: "#6366f1",
          borderWidth: 1
        },
        {
          label: "Y-Coordinate Freq",
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
        y: { 
          beginAtZero: true, 
          ticks: { stepSize: 1, color: "#94a3b8" }, 
          grid: { color: "#21262d" } 
        },
        x: { 
          ticks: { color: "#94a3b8" }, 
          grid: { color: "#21262d" },
          title: { display: true, text: "Field Element Value (0 - 16)", color: "#94a3b8" }
        }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: { display: true, text: "Frequencies of X and Y Coordinates (Quadratic Residues)", color: "#f8fafc" }
      }
    }
  });

  // 2. Parità del bit meno significativo (LSB)
  const ctxBits = document.getElementById("chartBits").getContext("2d");
  if (chartBitsInstance) chartBitsInstance.destroy();
  chartBitsInstance = new Chart(ctxBits, {
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

  // 3. Mappa Input-Output: k -> x(kG) (Pseudo-Random Walk)
  const ctxScatter = document.getElementById("chartScatter").getContext("2d");
  if (chartScatterInstance) chartScatterInstance.destroy();
  chartScatterInstance = new Chart(ctxScatter, {
    type: "line",
    data: {
      labels: scatterData.map(d => `k=${d.x}`),
      datasets: [{
        label: "x(kG) vs Scalar Private Key k",
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
        y: { 
          beginAtZero: true, 
          max: 16, 
          ticks: { color: "#94a3b8" }, 
          grid: { color: "#21262d" },
          title: { display: true, text: "Coordinate x ∈ {0,...,16}", color: "#94a3b8" }
        },
        x: { 
          ticks: { color: "#94a3b8" }, 
          grid: { color: "#21262d" } 
        }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: { display: true, text: "Non-Linear Mapping k ↦ x: Pseudo-Random Walk (Zero Linear Correlation)", color: "#f8fafc" }
      }
    }
  });
}