/**
 * Dashboard Analytics (MEMBER 3 & 4)
 * Manages Chart.js charts and Statistical Inference cards comparing:
 * - Plaintext (Green: #10b981)
 * - Compressed (Yellow/Orange: #f59e0b)
 * - Encrypted (Red: #ef4444)
 */

// Local accumulator state for byte frequencies and bit balance
const accumulator = {
  plain: { byteCounts: new Array(256).fill(0), zerosTotal: 0, onesTotal: 0, chunkCount: 0 },
  compressed: { byteCounts: new Array(256).fill(0), zerosTotal: 0, onesTotal: 0, chunkCount: 0 },
  encrypted: { byteCounts: new Array(256).fill(0), zerosTotal: 0, onesTotal: 0, chunkCount: 0 }
};
const allChunks = [];

// 1. Shannon Entropy Chart
const ctxEntropy = document.getElementById('chartEntropy').getContext('2d');
const chartEntropy = new Chart(ctxEntropy, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Plaintext', data: [], borderColor: '#10b981', backgroundColor: '#10b981', tension: 0.2, fill: false, pointHoverRadius: 6 },
      { label: 'Compressed', data: [], borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.2, fill: false, pointHoverRadius: 6 },
      { label: 'Encrypted', data: [], borderColor: '#ef4444', backgroundColor: '#ef4444', tension: 0.2, fill: false, pointHoverRadius: 6 }
    ]
  },
  options: {
    responsive: true,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      tooltip: {
        enabled: true
      }
    },
    scales: {
      y: { min: 0, max: 8.5, title: { display: true, text: 'Entropy (Bit/Byte)' } },
      x: { title: { display: true, text: 'Chunk Number' } }
    }
  }
});

// 2. Byte Frequency Chart (0-255)
const ctxByte = document.getElementById('chartByte').getContext('2d');
const labels256 = Array.from({ length: 256 }, (_, i) => `0x${i.toString(16).padStart(2, '0').toUpperCase()}`);

const chartByte = new Chart(ctxByte, {
  type: 'line',
  data: {
    labels: labels256,
    datasets: [
      { label: 'Plaintext', data: new Array(256).fill(0), borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 5, fill: false },
      { label: 'Compressed', data: new Array(256).fill(0), borderColor: '#f59e0b', backgroundColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 5, fill: false },
      { label: 'Encrypted', data: new Array(256).fill(0), borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 5, fill: false }
    ]
  },
  options: {
    responsive: true,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      tooltip: {
        enabled: true
      }
    },
    scales: {
      x: { display: false },
      y: { beginAtZero: true, title: { display: true, text: 'Accumulated Byte Count' } }
    }
  }
});

// 3. Bit Distribution Chart (0 vs 1)
const ctxBit = document.getElementById('chartBit').getContext('2d');
const chartBit = new Chart(ctxBit, {
  type: 'bar',
  data: {
    labels: ['Bit 0', 'Bit 1'],
    datasets: [
      { label: 'Plaintext', data: [0, 0], backgroundColor: '#10b981' },
      { label: 'Compressed', data: [0, 0], backgroundColor: '#f59e0b' },
      { label: 'Encrypted', data: [0, 0], backgroundColor: '#ef4444' }
    ]
  },
  options: {
    responsive: true,
    scales: {
      y: { min: 0, max: 100, title: { display: true, text: 'Average Percentage %' } }
    }
  }
});

// 4. Chi-Square Test Chart (New Member 2 & 4 Feature)
const ctxChiSquare = document.getElementById('chartChiSquare')?.getContext('2d');
const chartChiSquare = ctxChiSquare ? new Chart(ctxChiSquare, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Plaintext', data: [], borderColor: '#10b981', backgroundColor: '#10b981', tension: 0.2, fill: false, pointHoverRadius: 6 },
      { label: 'Compressed', data: [], borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.2, fill: false, pointHoverRadius: 6 },
      { label: 'Encrypted', data: [], borderColor: '#ef4444', backgroundColor: '#ef4444', tension: 0.2, fill: false, pointHoverRadius: 6 }
    ]
  },
  options: {
    responsive: true,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      tooltip: {
        enabled: true
      }
    },
    scales: {
      y: { beginAtZero: true, title: { display: true, text: 'Chi-Square Value (χ²)' } },
      x: { title: { display: true, text: 'Chunk Number' } }
    }
  }
}) : null;

/* --- Chunk Processing and Chart Updates --- */

function processaNuovoChunk(data) {
  if (!data) return;
  allChunks.push(data);

  const typeMap = { plain: 0, compressed: 1, encrypted: 2 };
  const dataType = data.dataType || 'plain';
  const dsIndex = typeMap[dataType] !== undefined ? typeMap[dataType] : 0;
  const chunkIdx = data.chunkIndex;

  // 1. Update Entropy
  const chunkLabel = 'Chunk ' + chunkIdx;
  if (!chartEntropy.data.labels.includes(chunkLabel)) {
    chartEntropy.data.labels.push(chunkLabel);
    if (chartChiSquare) chartChiSquare.data.labels.push(chunkLabel);
  }
  chartEntropy.data.datasets[dsIndex].data[chunkIdx - 1] = data.entropy;
  chartEntropy.update();

  // 2. Update Chi-Square Chart (if present in new structure)
  if (data.chiSquare && chartChiSquare) {
    chartChiSquare.data.datasets[dsIndex].data[chunkIdx - 1] = data.chiSquare.value;
    chartChiSquare.update();
  }

  // 3. Update Byte Frequency
  if (data.byteFrequencies && accumulator[dataType]) {
    for (let i = 0; i < 256; i++) {
      accumulator[dataType].byteCounts[i] += data.byteFrequencies[i] || 0;
    }
    chartByte.data.datasets[dsIndex].data = [...accumulator[dataType].byteCounts];
    chartByte.update();
  }

  // 4. Update Bit Balance (%)
  if (data.bitRatio && accumulator[dataType]) {
    accumulator[dataType].zerosTotal += data.bitRatio.zeros;
    accumulator[dataType].onesTotal += data.bitRatio.ones;
    accumulator[dataType].chunkCount += 1;

    const count = accumulator[dataType].chunkCount;
    const avgZeros = Number(((accumulator[dataType].zerosTotal / count) * 100).toFixed(2));
    const avgOnes = Number(((accumulator[dataType].onesTotal / count) * 100).toFixed(2));

    chartBit.data.datasets[dsIndex].data = [avgZeros, avgOnes];
    chartBit.update();
  }

  // 5. Update Statistical Inference Summary Cards (New Data)
  aggiornaSchedaInferenza(dataType, data);
  if (typeof AnalysisResults !== 'undefined') {
    AnalysisResults.render(allChunks);
  }
}

/**
 * Fills text cards with p-values, Z-scores, and uniformity test results
 */
function aggiornaSchedaInferenza(dataType, data) {
  const containerIdMap = { plain: 'summaryPlain', compressed: 'summaryCompressed', encrypted: 'summaryEncrypted' };
  const container = document.getElementById(containerIdMap[dataType]);
  if (!container || !data.chiSquare || !data.normalDistribution) return;

  const chi = data.chiSquare;
  const norm = data.normalDistribution;

  const uniformStatus = chi.isUniform
    ? '<span style="color: #10b981; font-weight: bold;">UNIFORM (PASSED)</span>'
    : '<span style="color: #ef4444; font-weight: bold;">NON-UNIFORM (REJECTED)</span>';

  const bitStatus = norm.bitMonobitTest.passedNormalRandomness
    ? '<span style="color: #10b981; font-weight: bold;">PASS</span>'
    : '<span style="color: #ef4444; font-weight: bold;">FAIL</span>';

  container.innerHTML = `
    <div><strong>Total Chunks:</strong> #${data.chunkIndex}</div>
    <div><strong>Chi-Square (χ²):</strong> ${chi.value} (df=${chi.degreesOfFreedom})</div>
    <div><strong>Chi-Square Z-Score:</strong> ${chi.zScore}</div>
    <div><strong>Chi-Square p-value:</strong> ${chi.pValue}</div>
    <div><strong>Uniformity Test:</strong> ${uniformStatus}</div>
    <hr style="border: 0; border-top: 1px solid #334155; margin: 8px 0;">
    <div><strong>Monobit Z-Score:</strong> ${norm.bitMonobitTest.zScore}</div>
    <div><strong>Monobit p-value:</strong> ${norm.bitMonobitTest.pValue} (${bitStatus})</div>
    <div><strong>Byte Mean (μ):</strong> ${norm.byteValueStats.mean} (Ideal: 127.5)</div>
    <div><strong>Byte StdDev (σ):</strong> ${norm.byteValueStats.stdDev} (Ideal: 73.9)</div>
  `;
}

function resetDashboard() {
  allChunks.length = 0;
  if (typeof AnalysisResults !== 'undefined') {
    AnalysisResults.reset();
  }

  ['plain', 'compressed', 'encrypted'].forEach(type => {
    accumulator[type].byteCounts.fill(0);
    accumulator[type].zerosTotal = 0;
    accumulator[type].onesTotal = 0;
    accumulator[type].chunkCount = 0;

    const containerIdMap = { plain: 'summaryPlain', compressed: 'summaryCompressed', encrypted: 'summaryEncrypted' };
    const el = document.getElementById(containerIdMap[type]);
    if (el) el.innerHTML = 'Awaiting data...';
  });

  chartEntropy.data.labels = [];
  chartEntropy.data.datasets.forEach(ds => ds.data = []);
  chartEntropy.update();

  chartByte.data.datasets.forEach(ds => ds.data = new Array(256).fill(0));
  chartByte.update();

  chartBit.data.datasets.forEach(ds => ds.data = [0, 0]);
  chartBit.update();

  if (chartChiSquare) {
    chartChiSquare.data.labels = [];
    chartChiSquare.data.datasets.forEach(ds => ds.data = []);
    chartChiSquare.update();
  }
}

function scaricaGrafico(canvasId, nomeFile) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const imageURI = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = nomeFile + '.png';
  link.href = imageURI;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* --- Serverless / GitHub Pages Local Statistical Engine (Mirrors backend/statis.js) --- */

function erfcLocale(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? r : 2 - r;
}

async function calcolaMetricheLocale(chunkBlob, chunkNum, fileName, explicitDataType) {
  const arrayBuffer = await chunkBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const byteFrequencies = new Array(256).fill(0);
  const totalBytes = bytes.length;
  let onesCount = 0;

  for (let i = 0; i < totalBytes; i++) {
    const b = bytes[i];
    byteFrequencies[b]++;
    for (let bit = 0; bit < 8; bit++) {
      if ((b >> bit) & 1) onesCount++;
    }
  }

  let entropy = 0;
  let chiSquareValue = 0;
  let byteSum = 0;
  let byteSumSq = 0;
  let countsVarianceSum = 0;
  const expectedByteCount = totalBytes / 256;

  if (totalBytes > 0) {
    for (let b = 0; b < 256; b++) {
      const count = byteFrequencies[b];
      if (count > 0) {
        const p = count / totalBytes;
        entropy -= p * Math.log2(p);
      }
      const diffCount = count - expectedByteCount;
      chiSquareValue += (diffCount * diffCount) / expectedByteCount;
      countsVarianceSum += diffCount * diffCount;
      byteSum += b * count;
      byteSumSq += b * b * count;
    }
  }

  const df = 255;
  let chiSquareZ = 0;
  let chiSquarePValue = 1;
  if (totalBytes > 0 && chiSquareValue > 0) {
    const k = 2 / (9 * df);
    chiSquareZ = (Math.pow(chiSquareValue / df, 1 / 3) - (1 - k)) / Math.sqrt(k);
    // Upper-tail p-value P(Chi^2_255 >= Chi^2_obs)
    chiSquarePValue = Math.min(1, Math.max(0, 0.5 * erfcLocale(chiSquareZ / Math.SQRT2)));
  }

  const totalBits = totalBytes * 8;
  const onesRatio = totalBits > 0 ? onesCount / totalBits : 0.5;
  const zerosRatio = 1 - onesRatio;
  const bitZScore = totalBits > 0 ? Math.abs(2 * onesCount - totalBits) / Math.sqrt(totalBits) : 0;
  const bitPValue = Math.min(1, Math.max(0, erfcLocale(bitZScore / Math.SQRT2)));

  const byteMean = totalBytes > 0 ? byteSum / totalBytes : 0;
  const byteVariance = totalBytes > 0 ? Math.max(0, byteSumSq / totalBytes - byteMean * byteMean) : 0;
  const byteStdDev = Math.sqrt(byteVariance);

  const countsStdDev = Math.sqrt(countsVarianceSum / 256);
  const theoreticalCountsStdDev = Math.sqrt(totalBytes * (1 / 256) * (255 / 256));

  let dataType = explicitDataType || 'plain';
  if (!explicitDataType && fileName) {
    const ext = String(fileName).split('.').pop().toLowerCase();
    if (['zip', 'gz', 'deflate', 'tar', '7z', 'rar'].includes(ext)) dataType = 'compressed';
    if (['aes', 'enc', 'bin'].includes(ext)) dataType = 'encrypted';
  }

  return {
    chunkIndex: chunkNum,
    dataType,
    entropy: Number(entropy.toFixed(3)),
    byteFrequencies,
    bitRatio: {
      zeros: Number(zerosRatio.toFixed(4)),
      ones: Number(onesRatio.toFixed(4))
    },
    chiSquare: {
      value: Number(chiSquareValue.toFixed(2)),
      degreesOfFreedom: df,
      zScore: Number(chiSquareZ.toFixed(3)),
      pValue: Number(chiSquarePValue.toFixed(6)),
      isUniform: chiSquarePValue >= 0.01
    },
    normalDistribution: {
      bitMonobitTest: {
        zScore: Number(bitZScore.toFixed(3)),
        pValue: Number(bitPValue.toFixed(6)),
        passedNormalRandomness: bitPValue >= 0.01
      },
      byteValueStats: {
        mean: Number(byteMean.toFixed(2)),
        stdDev: Number(byteStdDev.toFixed(2)),
        theoreticalMean: 127.5,
        theoreticalStdDev: 73.9
      },
      binCountStats: {
        expectedMeanCount: Number(expectedByteCount.toFixed(2)),
        observedStdDev: Number(countsStdDev.toFixed(2)),
        theoreticalStdDev: Number(theoreticalCountsStdDev.toFixed(2))
      }
    }
  };
}