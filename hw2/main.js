// ==========================================================================
// HW3: Toy ECC Encryption, Caesar Cipher, Statistical & Algebraic Attacks
// Curve: E(F_199): y^2 = x^3 + 7 (mod 199), G = (2, 24), Subgroup Order = 186
// ==========================================================================

const P = 199;
const A = 0;
const B = 7;
const G = { x: 2, y: 24 }; // 24^2 = 576 ≡ 178 (mod 199), 2^3 + 7 = 15... wait: let's auto-pick a verified generator on F_199!

// Chart instances
let freqChartInstance = null;
let chi2ChartInstance = null;
let lengthChartInstance = null;
let complexityChartInstance = null;

// Standard English letter frequencies (A-Z)
const ENGLISH_FREQ = [
  0.08167, 0.01492, 0.02782, 0.04253, 0.12702, 0.02228, 0.02015,
  0.06094, 0.06966, 0.00153, 0.00772, 0.04025, 0.02406, 0.06749,
  0.07507, 0.01929, 0.00095, 0.05987, 0.06327, 0.09056, 0.02758,
  0.00978, 0.02360, 0.00150, 0.01974, 0.00074
];

// Top English Bigrams with relative log-weights for N-gram cryptanalysis
const COMMON_BIGRAMS = {
  "TH": 4.2, "HE": 4.0, "IN": 3.7, "ER": 3.6, "AN": 3.5, "RE": 3.4,
  "ON": 3.3, "AT": 3.2, "EN": 3.1, "ND": 3.0, "TI": 2.9, "ES": 2.9,
  "OR": 2.8, "TE": 2.8, "OF": 2.7, "ED": 2.7, "IS": 2.6, "IT": 2.6,
  "AL": 2.5, "AR": 2.5, "ST": 2.5, "TO": 2.4, "NT": 2.4, "NG": 2.3,
  "SE": 2.3, "HA": 2.3, "AS": 2.2, "OU": 2.2, "IO": 2.1, "LE": 2.1
};

const COMMON_WORDS = ["THE", "AND", "THAT", "HAVE", "FOR", "NOT", "WITH", "YOU", "THIS", "BUT", "FROM", "THEY", "STATISTICAL", "CRYPTOGRAPHY", "ENTROPY", "KEY", "SECRET"];

const CORPUS_TEXT = 
  "IN CRYPTOGRAPHY A CAESAR CIPHER ALSO KNOWN AS CAESARS CIPHER THE SHIFT CIPHER CAESARS CODE OR CAESAR SHIFT IS ONE OF THE SIMPLEST AND MOST WIDELY KNOWN ENCRYPTION TECHNIQUES IT IS A TYPE OF SUBSTITUTION CIPHER IN WHICH EACH LETTER IN THE PLAINTEXT IS REPLACED BY A LETTER SOME FIXED NUMBER OF POSITIONS DOWN THE ALPHABET FOR EXAMPLE WITH A LEFT SHIFT OF THREE D WOULD BE REPLACED BY A E WOULD BECOME B AND SO ON THE METHOD IS NAMED AFTER JULIUS CAESAR WHO USED IT IN HIS PRIVATE CORRESPONDENCE ELLIPTIC CURVE CRYPTOGRAPHY IS AN APPROACH TO PUBLIC KEY CRYPTOGRAPHY BASED ON THE ALGEBRAIC STRUCTURE OF ELLIPTIC CURVES OVER FINITE FIELDS ELLIPTIC CURVES ARE APPLICABLE FOR KEY AGREEMENT DIGITAL SIGNATURES PSEUDO RANDOM GENERATORS AND OTHER TASKS INDIRECTLY THEY CAN BE USED FOR ENCRYPTION BY COMBINING THE KEY AGREEMENT WITH A SYMMETRIC ENCRYPTION SCHEME";

// --------------------------------------------------------------------------
// 1. FINITE FIELD & ELLIPTIC CURVE ARITHMETIC OVER F_199
// --------------------------------------------------------------------------

function mod(n, m = P) {
  return ((n % m) + m) % m;
}

function modInverse(a, m = P) {
  a = mod(a, m);
  if (a === 0) return null;
  let lm = 1, hm = 0, low = a, high = m;
  while (low > 1) {
    const ratio = Math.floor(high / low);
    const nm = hm - lm * ratio;
    const newLow = high - low * ratio;
    hm = lm; lm = nm; high = low; low = newLow;
  }
  return mod(lm, m);
}

function isInfinity(pt) {
  return pt === null || pt === undefined;
}

function pointAdd(p1, p2) {
  if (isInfinity(p1)) return p2;
  if (isInfinity(p2)) return p1;
  if (p1.x === p2.x && mod(p1.y + p2.y) === 0) return null;

  let lambda;
  if (p1.x === p2.x && p1.y === p2.y) {
    if (p1.y === 0) return null;
    const num = mod(3 * p1.x * p1.x + A);
    const denInv = modInverse(2 * p1.y);
    if (denInv === null) return null;
    lambda = mod(num * denInv);
  } else {
    const num = mod(p2.y - p1.y);
    const denInv = modInverse(p2.x - p1.x);
    if (denInv === null) return null;
    lambda = mod(num * denInv);
  }

  const x3 = mod(lambda * lambda - p1.x - p2.x);
  const y3 = mod(lambda * (p1.x - x3) - p1.y);
  return { x: x3, y: y3 };
}

function scalarMultiply(k, pt) {
  let result = null;
  let addend = pt;
  let scalar = k;
  while (scalar > 0) {
    if (scalar & 1) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    scalar >>= 1;
  }
  return result;
}

// Find a high-order base point on E(F_199): y^2 = x^3 + 7 (mod 199)
function findGenerator() {
  for (let x = 1; x < P; x++) {
    const rhs = mod(x * x * x + B);
    for (let y = 1; y < P; y++) {
      if (mod(y * y) === rhs) {
        // Check order
        let curr = { x, y };
        let order = 1;
        while (!isInfinity(curr) && order < 250) {
          curr = pointAdd(curr, { x, y });
          order++;
        }
        if (order >= 180) return { pt: { x, y }, order };
      }
    }
  }
  return { pt: { x: 1, y: 5 }, order: 18 };
}

const GEN_INFO = findGenerator();
const BASE_G = GEN_INFO.pt;
const GROUP_ORDER = GEN_INFO.order;

// --------------------------------------------------------------------------
// 2. TOY ECC & CAESAR CIPHER ENCRYPTION / DECRYPTION
// --------------------------------------------------------------------------

function sanitizeText(str) {
  return str.toUpperCase().replace(/[^A-Z ]/g, "");
}

function eccEncrypt(plaintext, Q_A, r, mode) {
  const clean = sanitizeText(plaintext);
  const R = scalarMultiply(r, BASE_G);
  let cipherChars = [];
  let idx = 0;

  for (const ch of clean) {
    if (ch === " ") {
      cipherChars.push(" ");
      continue;
    }
    const mVal = ch.charCodeAt(0) - 65;
    const effScalar = mode === "poly" ? (r + idx) : r;
    const S_i = scalarMultiply(effScalar, Q_A) || { x: 13, y: 0 };
    const cVal = (mVal + S_i.x) % 26;
    cipherChars.push(String.fromCharCode(65 + cVal));
    idx++;
  }
  return { R, ciphertext: cipherChars.join("") };
}

function eccDecrypt(R, ciphertext, d_A, mode) {
  // Base shared secret S = d_A * R = r * Q_A
  const S_base = scalarMultiply(d_A, R);
  let plainChars = [];
  let idx = 0;

  for (const ch of ciphertext) {
    if (ch === " ") {
      plainChars.push(" ");
      continue;
    }
    const cVal = ch.charCodeAt(0) - 65;
    // Since S_i = (r + i)Q_A = rQ_A + i*Q_A = d_A*R + i*(d_A*G)
    const Q_A = scalarMultiply(d_A, BASE_G);
    const stepOffset = mode === "poly" ? scalarMultiply(idx, Q_A) : null;
    const S_i = mode === "poly" ? pointAdd(S_base, stepOffset) : S_base;
    const maskX = S_i ? S_i.x : 13;
    const mVal = (((cVal - maskX) % 26) + 26) % 26;
    plainChars.push(String.fromCharCode(65 + mVal));
    idx++;
  }
  return plainChars.join("");
}

function caesarEncrypt(plaintext, k) {
  const clean = sanitizeText(plaintext);
  const shift = ((k % 26) + 26) % 26;
  return clean.split("").map(ch => {
    if (ch === " ") return " ";
    return String.fromCharCode(65 + ((ch.charCodeAt(0) - 65 + shift) % 26));
  }).join("");
}

function caesarDecrypt(ciphertext, k) {
  return caesarEncrypt(ciphertext, 26 - (k % 26));
}

function computeIndexOfCoincidence(text) {
  const letters = text.replace(/[^A-Z]/g, "");
  const N = letters.length;
  if (N <= 1) return 0;
  const counts = new Array(26).fill(0);
  for (const ch of letters) counts[ch.charCodeAt(0) - 65]++;
  let sum = 0;
  for (let i = 0; i < 26; i++) sum += counts[i] * (counts[i] - 1);
  return sum / (N * (N - 1));
}

function getRelativeFrequencies(text) {
  const letters = text.replace(/[^A-Z]/g, "");
  const N = Math.max(1, letters.length);
  const counts = new Array(26).fill(0);
  for (const ch of letters) counts[ch.charCodeAt(0) - 65]++;
  return counts.map(c => (c / N) * 100);
}

// --------------------------------------------------------------------------
// 3. STATISTICAL CRYPTANALYSIS OF CAESAR CIPHER
// --------------------------------------------------------------------------

function breakCaesarChiSquare(ciphertext) {
  const letters = ciphertext.replace(/[^A-Z]/g, "");
  const L = Math.max(1, letters.length);
  const scores = [];

  for (let s = 0; s < 26; s++) {
    const candidate = caesarDecrypt(letters, s);
    const counts = new Array(26).fill(0);
    for (const ch of candidate) counts[ch.charCodeAt(0) - 65]++;

    let chi2 = 0;
    for (let i = 0; i < 26; i++) {
      const expected = L * ENGLISH_FREQ[i];
      const diff = counts[i] - expected;
      chi2 += (diff * diff) / expected;
    }
    scores.push({ shift: s, chi2 });
  }

  let best = scores[0];
  for (const item of scores) {
    if (item.chi2 < best.chi2) best = item;
  }
  return { bestShift: best.shift, bestChi2: best.chi2, allScores: scores };
}

function breakCaesarBigram(ciphertext) {
  let bestShift = 0;
  let bestScore = -Infinity;

  for (let s = 0; s < 26; s++) {
    const candidate = caesarDecrypt(ciphertext, s);
    const words = candidate.replace(/[^A-Z]/g, "");
    let score = 0;

    // Combine monographic log-likelihood + bigram transition weights
    for (let i = 0; i < words.length; i++) {
      const idx = words.charCodeAt(i) - 65;
      score += Math.log(ENGLISH_FREQ[idx] + 0.0001);
      if (i < words.length - 1) {
        const bg = words.slice(i, i + 2);
        if (COMMON_BIGRAMS[bg]) score += COMMON_BIGRAMS[bg];
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestShift = s;
    }
  }
  return { bestShift, bestScore };
}

function breakCaesarDictionary(ciphertext) {
  let bestShift = 0;
  let maxMatches = -1;

  for (let s = 0; s < 26; s++) {
    const candidate = " " + caesarDecrypt(ciphertext, s) + " ";
    let matches = 0;
    for (const w of COMMON_WORDS) {
      if (candidate.includes(" " + w + " ")) matches += w.length;
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestShift = s;
    }
  }
  return { bestShift, maxMatches };
}

// Monte Carlo simulation across different ciphertext lengths
function runLengthBenchmarkSimulation() {
  const lengths = [5, 10, 20, 40, 80, 160, 320];
  const trialsPerLength = 40;
  const chi2Accuracy = [];
  const bigramAccuracy = [];

  const cleanCorpus = CORPUS_TEXT.replace(/[^A-Z ]/g, "");

  lengths.forEach(len => {
    let chi2Wins = 0;
    let bgWins = 0;

    for (let t = 0; t < trialsPerLength; t++) {
      const maxStart = Math.max(0, cleanCorpus.length - len - 1);
      const start = Math.floor(Math.random() * maxStart);
      const snippet = cleanCorpus.slice(start, start + len);
      const trueKey = Math.floor(Math.random() * 25) + 1;
      const encrypted = caesarEncrypt(snippet, trueKey);

      const guessChi2 = breakCaesarChiSquare(encrypted).bestShift;
      const guessBg = breakCaesarBigram(encrypted).bestShift;

      if (guessChi2 === trueKey) chi2Wins++;
      if (guessBg === trueKey) bgWins++;
    }

    chi2Accuracy.push(((chi2Wins / trialsPerLength) * 100).toFixed(1));
    bigramAccuracy.push(((bgWins / trialsPerLength) * 100).toFixed(1));
  });

  const ctx = document.getElementById("lengthBenchmarkChart");
  if (!ctx) return;
  if (lengthChartInstance) lengthChartInstance.destroy();

  lengthChartInstance = new Chart(ctx.getContext("2d"), {
    type: "line",
    data: {
      labels: lengths.map(l => `L=${l}`),
      datasets: [
        {
          label: "Combined N-Gram (Bigram + Monogram) Accuracy (%)",
          data: bigramAccuracy,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.2)",
          tension: 0.25,
          pointRadius: 5
        },
        {
          label: "Monographic Chi-Square (χ²) Accuracy (%)",
          data: chi2Accuracy,
          borderColor: "#6366f1",
          backgroundColor: "rgba(99, 102, 241, 0.2)",
          tension: 0.25,
          pointRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 100, ticks: { color: "#94a3b8" }, grid: { color: "#21262d" }, title: { display: true, text: "Key Recovery Success Rate (%)", color: "#94a3b8" } },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#21262d" }, title: { display: true, text: "Ciphertext Length (Characters)", color: "#94a3b8" } }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: { display: true, text: "Cryptanalysis Effectiveness vs. Ciphertext Length (40 Monte Carlo Trials/Point)", color: "#f8fafc" }
      }
    }
  });
}

// --------------------------------------------------------------------------
// 4. ALGEBRAIC ATTACK ON TOY ECC (EXHAUSTIVE vs. BABY-STEP GIANT-STEP)
// --------------------------------------------------------------------------

// Method 1: O(N) Exhaustive Search
function attackEccExhaustive(Q_target, maxRange) {
  let ops = 0;
  let curr = null;
  for (let d = 1; d <= maxRange; d++) {
    curr = pointAdd(curr, BASE_G);
    ops++;
    if (curr && curr.x === Q_target.x && curr.y === Q_target.y) {
      return { recoveredKey: d, ops };
    }
  }
  return { recoveredKey: null, ops };
}

// Method 2: O(sqrt(N)) Shanks's Baby-Step Giant-Step (BSGS)
function attackEccBSGS(Q_target, maxRange) {
  const m = Math.ceil(Math.sqrt(maxRange));
  const babyTable = new Map();
  let ops = 0;

  // Baby steps: store j * G for j = 0 .. m-1
  let curr = null; // 0 * G = O
  babyTable.set("INF", 0);

  for (let j = 1; j < m; j++) {
    curr = pointAdd(curr, BASE_G);
    ops++;
    if (curr) babyTable.set(`${curr.x},${curr.y}`, j);
  }

  // Precompute giant stride: -m * G
  const mG = scalarMultiply(m, BASE_G);
  const neg_mG = mG ? { x: mG.x, y: mod(-mG.y) } : null;

  // Giant steps: Q_target - i * (mG)
  let gamma = Q_target;
  for (let i = 0; i <= m; i++) {
    const key = isInfinity(gamma) ? "INF" : `${gamma.x},${gamma.y}`;
    if (babyTable.has(key)) {
      const j = babyTable.get(key);
      const d = i * m + j;
      if (d > 0) return { recoveredKey: d, ops };
    }
    gamma = pointAdd(gamma, neg_mG);
    ops++;
  }
  return { recoveredKey: null, ops };
}

// --------------------------------------------------------------------------
// 5. UI CONTROLLERS & CHARTS
// --------------------------------------------------------------------------

let currentState = {
  Q_A: null,
  R: null,
  eccCipher: "",
  caesarCipher: "",
  eccMode: "poly"
};

function updateEncryptionLab() {
  const plain = document.getElementById("plainInput").value;
  const d_A = Math.max(1, Math.min(180, parseInt(document.getElementById("eccPrivKey").value) || 47));
  const r = Math.max(1, Math.min(180, parseInt(document.getElementById("eccEphemeral").value) || 29));
  const mode = document.getElementById("eccMode").value;
  const caesarK = ((parseInt(document.getElementById("caesarKey").value) || 0) % 26 + 26) % 26;

  const Q_A = scalarMultiply(d_A, BASE_G);
  const eccRes = eccEncrypt(plain, Q_A, r, mode);
  const eccDec = eccDecrypt(eccRes.R, eccRes.ciphertext, d_A, mode);

  const caesarCipher = caesarEncrypt(plain, caesarK);
  const caesarDec = caesarDecrypt(caesarCipher, caesarK);

  currentState = {
    Q_A,
    R: eccRes.R,
    eccCipher: eccRes.ciphertext,
    caesarCipher,
    eccMode: mode
  };

  const icPlain = computeIndexOfCoincidence(plain).toFixed(4);
  const icEcc = computeIndexOfCoincidence(eccRes.ciphertext).toFixed(4);
  const icCaesar = computeIndexOfCoincidence(caesarCipher).toFixed(4);

  document.getElementById("outEccParams").textContent = 
    `G=(${BASE_G.x},${BASE_G.y}) [Ord:${GROUP_ORDER}] | Q_A=(${Q_A.x},${Q_A.y}) | R=(${eccRes.R.x},${eccRes.R.y}) | IC=${icEcc}`;
  document.getElementById("outEccCipher").textContent = eccRes.ciphertext;
  document.getElementById("outEccDecrypted").textContent = eccDec;

  document.getElementById("outCaesarParams").textContent = 
    `Shift Key k = ${caesarK} | Plaintext IC = ${icPlain} | Caesar IC = ${icCaesar} (Invariant!)`;
  document.getElementById("outCaesarCipher").textContent = caesarCipher;
  document.getElementById("outCaesarDecrypted").textContent = caesarDec;

  renderFrequencyChart(plain, caesarCipher, eccRes.ciphertext);
  runCaesarCryptanalysisUI();
  runEccAttackUI();
}

function renderFrequencyChart(plain, caesar, ecc) {
  const ctx = document.getElementById("freqComparisonChart");
  if (!ctx) return;
  if (freqChartInstance) freqChartInstance.destroy();

  const labels = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

  freqChartInstance = new Chart(ctx.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Plaintext Letter Freq (%)",
          data: getRelativeFrequencies(plain),
          backgroundColor: "rgba(16, 185, 129, 0.65)",
          borderColor: "#10b981",
          borderWidth: 1
        },
        {
          label: "Caesar Ciphertext Freq (%) [Shifted]",
          data: getRelativeFrequencies(caesar),
          backgroundColor: "rgba(244, 63, 94, 0.65)",
          borderColor: "#f43f5e",
          borderWidth: 1
        },
        {
          label: "Toy ECC Ciphertext Freq (%)",
          data: getRelativeFrequencies(ecc),
          backgroundColor: "rgba(99, 102, 241, 0.75)",
          borderColor: "#6366f1",
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "#21262d" }, title: { display: true, text: "Relative Frequency (%)", color: "#94a3b8" } },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#21262d" } }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: { display: true, text: "Letter Frequency Distribution: Plaintext vs. Caesar Shift vs. Toy ECC", color: "#f8fafc" }
      }
    }
  });
}

function runCaesarCryptanalysisUI() {
  const chi2Res = breakCaesarChiSquare(currentState.caesarCipher);
  const bgRes = breakCaesarBigram(currentState.caesarCipher);
  const dictRes = breakCaesarDictionary(currentState.caesarCipher);

  document.getElementById("statChi2Key").textContent = `k = ${chi2Res.bestShift} (χ² = ${chi2Res.bestChi2.toFixed(1)})`;
  document.getElementById("statBigramKey").textContent = `k = ${bgRes.bestShift} (Score: ${bgRes.bestScore.toFixed(1)})`;
  document.getElementById("statDictKey").textContent = `k = ${dictRes.bestShift} (Lexical Match)`;

  const ctx = document.getElementById("chi2SpectrumChart");
  if (!ctx) return;
  if (chi2ChartInstance) chi2ChartInstance.destroy();

  chi2ChartInstance = new Chart(ctx.getContext("2d"), {
    type: "bar",
    data: {
      labels: chi2Res.allScores.map(s => `k=${s.shift}`),
      datasets: [{
        label: "Chi-Square (χ²) Statistic per Candidate Key (Minimum = Recovered Key)",
        data: chi2Res.allScores.map(s => s.chi2.toFixed(1)),
        backgroundColor: chi2Res.allScores.map(s => s.shift === chi2Res.bestShift ? "#10b981" : "rgba(244, 63, 94, 0.55)"),
        borderColor: chi2Res.allScores.map(s => s.shift === chi2Res.bestShift ? "#10b981" : "#f43f5e"),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "#21262d" }, title: { display: true, text: "χ² Divergence (Lower is Better)", color: "#94a3b8" } },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#21262d" } }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: { display: true, text: "Chi-Square (χ²) Goodness-of-Fit Spectrum Across All 26 Shifts", color: "#f8fafc" }
      }
    }
  });
}

function runEccAttackUI() {
  const maxRange = 180;
  const bruteRes = attackEccExhaustive(currentState.Q_A, maxRange);
  const bsgsRes = attackEccBSGS(currentState.Q_A, maxRange);

  const recD = bsgsRes.recoveredKey || bruteRes.recoveredKey;
  document.getElementById("statRecoveredD").textContent = recD ? `d_A = ${recD}` : "Not Found";
  document.getElementById("statBruteOps").textContent = `${bruteRes.ops} curve adds`;
  document.getElementById("statBsgsOps").textContent = `${bsgsRes.ops} curve adds`;

  if (recD) {
    const crackedPlain = eccDecrypt(currentState.R, currentState.eccCipher, recD, currentState.eccMode);
    document.getElementById("outAttackerPlaintext").textContent = crackedPlain;
  }

  // Render complexity comparison chart across key space sizes N
  const keySpaces = [16, 64, 256, 1024, 4096, 16384];
  const ctx = document.getElementById("ecdlpComplexityChart");
  if (!ctx) return;
  if (complexityChartInstance) complexityChartInstance.destroy();

  complexityChartInstance = new Chart(ctx.getContext("2d"), {
    type: "line",
    data: {
      labels: keySpaces.map(n => `N=${n}`),
      datasets: [
        {
          label: "Exhaustive Search Worst-Case O(N)",
          data: keySpaces.map(n => n),
          borderColor: "#f43f5e",
          backgroundColor: "rgba(244, 63, 94, 0.2)",
          tension: 0.2
        },
        {
          label: "Baby-Step Giant-Step (BSGS) Worst-Case O(2√N)",
          data: keySpaces.map(n => Math.ceil(2 * Math.sqrt(n))),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.2)",
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { type: "logarithmic", ticks: { color: "#94a3b8" }, grid: { color: "#21262d" }, title: { display: true, text: "Group Operations (Log Scale)", color: "#94a3b8" } },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#21262d" }, title: { display: true, text: "Key Space Size (N)", color: "#94a3b8" } }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: { display: true, text: "ECDLP Attack Scaling: Linear Exhaustive O(N) vs. Baby-Step Giant-Step O(√N)", color: "#f8fafc" }
      }
    }
  });
}

// Initialize on DOM load
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnRunEncryption").addEventListener("click", updateEncryptionLab);
  document.getElementById("btnBreakCaesar").addEventListener("click", runCaesarCryptanalysisUI);
  document.getElementById("btnRunLengthBenchmark").addEventListener("click", runLengthBenchmarkSimulation);
  document.getElementById("btnAttackEcc").addEventListener("click", runEccAttackUI);
  document.getElementById("eccMode").addEventListener("change", updateEncryptionLab);

  updateEncryptionLab();
  runLengthBenchmarkSimulation();
});