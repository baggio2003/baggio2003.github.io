/**
 * Homework: Welford's Recurrence Formulas & Sampling Mean/Variance
 * Statistics Laboratory Portfolio
 */

// ==================== 1. WELFORD'S 3-LINE CORE ALGORITHMS ====================

/**
 * Form A: Updates running count k, mean, and sum of squared deviations (ss).
 * The core recurrence logic requires exactly 3 lines.
 */
function welfordUpdateSS(state, x) {
    state.k += 1;
    const delta = x - state.mean;           // 1. Deviation from old mean: x_k - mean_{k-1}
    state.mean += delta / state.k;          // 2. Knuth's mean recurrence: mean_k = mean_{k-1} + delta / k
    state.ss   += delta * (x - state.mean); // 3. Welford's SS recurrence: SS_k = SS_{k-1} + delta * (x_k - mean_k)
    return state;
}

/**
 * Form B: Directly updates running count k, mean, and unbiased sample variance s2.
 * Also requires exactly 3 lines of core logic.
 */
function welfordUpdateDirectVar(state, x) {
    state.k += 1;
    const delta = x - state.mean;                                             // 1. Pre-update deviation
    state.mean += delta / state.k;                                            // 2. Knuth's mean recurrence
    state.s2   += state.k > 1 ? (delta * (x - state.mean) - state.s2) / (state.k - 1) : 0.0; // 3. Direct s^2 recurrence
    return state;
}

// ==================== 2. PROBABILITY DISTRIBUTIONS ON [0, 10] ====================

function randNormal() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function randGamma(alpha) {
    if (alpha < 1.0) {
        return randGamma(1.0 + alpha) * Math.pow(Math.random(), 1.0 / alpha);
    }
    const d = alpha - 1.0 / 3.0;
    const c = 1.0 / Math.sqrt(9.0 * d);
    while (true) {
        let x, v;
        do {
            x = randNormal();
            v = 1.0 + c * x;
        } while (v <= 0);
        v = v * v * v;
        const u = Math.random();
        if (u < 1.0 - 0.0331 * (x * x) * (x * x)) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1.0 - v + Math.log(v))) return d * v;
    }
}

/**
 * Returns exact theoretical moments { mu, sigma2, mu4 } and sampler draw() on [0, 10].
 * mu4 = E[(X - mu)^4] is used to compute the exact theoretical Var(S^2).
 */
function getDistributionModel(distType, pParam = 0.35) {
    switch (distType) {
        case 'discrete_uniform': {
            // Integers {0, 1, ..., 10} (N = 11)
            // mu = 5.0, sigma^2 = (11^2 - 1)/12 = 10.0, mu4 = 178.0
            return {
                name: 'Discrete Uniform {0..10}',
                isInteger: true,
                mu: 5.0,
                sigma2: 10.0,
                mu4: 178.0,
                draw: () => Math.floor(Math.random() * 11)
            };
        }
        case 'continuous_uniform': {
            // Continuous U(0, 10)
            // mu = 5.0, sigma^2 = 100/12, mu4 = 10^4 / 80 = 125.0
            return {
                name: 'Continuous Uniform U(0, 10)',
                isInteger: false,
                mu: 5.0,
                sigma2: 100.0 / 12.0,
                mu4: 125.0,
                draw: () => Math.random() * 10.0
            };
        }
        case 'binomial': {
            // Binomial(K=10, p)
            // mu = 10p, sigma^2 = 10pq, mu4 = 10pq * (1 + 3*(10 - 2)*pq)
            const K = 10;
            const q = 1.0 - pParam;
            const pq = pParam * q;
            return {
                name: `Binomial(10, ${pParam.toFixed(2)})`,
                isInteger: true,
                mu: K * pParam,
                sigma2: K * pq,
                mu4: K * pq * (1.0 + 3.0 * (K - 2) * pq),
                draw: () => {
                    let s = 0;
                    for (let i = 0; i < K; i++) {
                        if (Math.random() < pParam) s++;
                    }
                    return s;
                }
            };
        }
        case 'beta_scaled': {
            // 10 * Beta(a=2, b=5)
            const a = 2.0, b = 5.0;
            const mu = 10.0 * (a / (a + b));
            const sigma2 = 100.0 * ((a * b) / (Math.pow(a + b, 2) * (a + b + 1.0)));
            const exKurt = (6.0 * (Math.pow(a - b, 2) * (a + b + 1.0) - a * b * (a + b + 2.0))) /
                           (a * b * (a + b + 2.0) * (a + b + 3.0));
            const mu4 = (exKurt + 3.0) * sigma2 * sigma2;
            return {
                name: 'Scaled 10·Beta(2, 5)',
                isInteger: false,
                mu,
                sigma2,
                mu4,
                draw: () => {
                    const ga = randGamma(a);
                    const gb = randGamma(b);
                    return 10.0 * (ga / (ga + gb));
                }
            };
        }
        default:
            return getDistributionModel('discrete_uniform');
    }
}

/**
 * Exact theoretical variance of the unbiased sample variance S^2 for sample size n:
 * Var(S^2) = (1 / n) * (mu_4 - ((n - 3) / (n - 1)) * sigma^4)
 */
function theoreticalVarOfSampleVariance(distModel, n) {
    if (n <= 1) return 0.0;
    const sigma4 = distModel.sigma2 * distModel.sigma2;
    return (1.0 / n) * (distModel.mu4 - ((n - 3.0) / (n - 1.0)) * sigma4);
}

// ==================== 3. EX. 1 BENCHMARK: CATASTROPHIC CANCELLATION ====================

function runCancellationBenchmark() {
    const base = 1e9;
    const offsets = [1, 2, 3, 4, 5];
    const data = offsets.map(v => base + v);

    // 1. Welford Form A (SS recurrence)
    const stateA = { k: 0, mean: 0.0, ss: 0.0 };
    // 2. Welford Form B (Direct s^2 recurrence)
    const stateB = { k: 0, mean: 0.0, s2: 0.0 };

    for (const x of data) {
        welfordUpdateSS(stateA, x);
        welfordUpdateDirectVar(stateB, x);
    }
    const welfordS2_A = stateA.ss / (stateA.k - 1);

    // 3. Naive one-pass sum of squares: SS = sum(x^2) - n * mean^2
    let sumX = 0.0, sumX2 = 0.0;
    const n = data.length;
    for (const x of data) {
        sumX += x;
        sumX2 += x * x;
    }
    const meanNaive = sumX / n;
    const ssNaive = sumX2 - n * (meanNaive * meanNaive);
    const s2Naive = ssNaive / (n - 1);

    document.getElementById('bench-exact').textContent = `s² = 2.5000 (SS = 10.00)`;
    document.getElementById('bench-welford-a').textContent =
        `s² = ${welfordS2_A.toFixed(4)} (SS = ${stateA.ss.toFixed(2)})`;
    document.getElementById('bench-welford-b').textContent =
        `s² = ${stateB.s2.toFixed(4)}`;
    document.getElementById('bench-naive').textContent =
        `s² = ${s2Naive.toFixed(4)} (SS = ${ssNaive.toFixed(2)})`;
}

// ==================== 4. EX. 2 MONTE CARLO SIMULATION ENGINE ====================

let chartCumTraj = null;
let chartMeanTraj = null;
let chartVarTraj = null;
let chartMeanDist = null;
let chartVarDist = null;
let chartMultiNVar = null;
let chartMultiNBias = null;

/**
 * Simulates m hackers attempting n systems.
 * Uses Welford's recurrence for each hacker's n scores, and uses Welford's recurrence
 * again across the m hackers to compute meta-averages and meta-variances.
 */
function simulateHackers(m, n, distModel, maxTrajectories = 16, maxTableRows = 6) {
    const terminalMeans = new Float64Array(m);
    const terminalUnbiasedVars = new Float64Array(m);
    const terminalBiasedVars = new Float64Array(m);

    const cumTrajectories = [];
    const meanTrajectories = [];
    const varTrajectories = [];
    const sampleHackersTable = [];

    // Meta-Welford accumulators across the m hackers
    const metaMean = { k: 0, mean: 0.0, ss: 0.0 };
    const metaUnbiasedVar = { k: 0, mean: 0.0, ss: 0.0 };
    const metaBiasedVar = { k: 0, mean: 0.0, ss: 0.0 };

    for (let j = 0; j < m; j++) {
        const hackerWelford = { k: 0, mean: 0.0, ss: 0.0 };
        const recordTraj = j < maxTrajectories;
        const recordRow = j < maxTableRows;

        const cTraj = recordTraj ? new Array(n) : null;
        const mTraj = recordTraj ? new Array(n) : null;
        const vTraj = recordTraj ? new Array(n) : null;
        const rawScoresPreview = recordRow ? [] : null;

        let cumulativeScore = 0.0;

        for (let i = 0; i < n; i++) {
            const score = distModel.draw();
            cumulativeScore += score;

            // Core 3-line Welford update for hacker j at system i+1
            welfordUpdateSS(hackerWelford, score);

            if (recordTraj) {
                cTraj[i] = cumulativeScore;
                mTraj[i] = hackerWelford.mean;
                // Unbiased sample variance requires k >= 2 observations
                vTraj[i] = hackerWelford.k > 1 ? hackerWelford.ss / (hackerWelford.k - 1) : null;
            }
            if (recordRow && i < 6) {
                rawScoresPreview.push(distModel.isInteger ? score.toString() : score.toFixed(2));
            }
        }

        const sampleMean = hackerWelford.mean;
        const unbiasedVar = hackerWelford.k > 1 ? hackerWelford.ss / (hackerWelford.k - 1) : 0.0;
        const biasedVar = hackerWelford.ss / hackerWelford.k;

        terminalMeans[j] = sampleMean;
        terminalUnbiasedVars[j] = unbiasedVar;
        terminalBiasedVars[j] = biasedVar;

        // Aggregate across the m hackers using Welford
        welfordUpdateSS(metaMean, sampleMean);
        welfordUpdateSS(metaUnbiasedVar, unbiasedVar);
        welfordUpdateSS(metaBiasedVar, biasedVar);

        if (recordTraj) {
            cumTrajectories.push(cTraj);
            meanTrajectories.push(mTraj);
            varTrajectories.push(vTraj);
        }
        if (recordRow) {
            sampleHackersTable.push({
                id: j + 1,
                preview: `[${rawScoresPreview.join(', ')}${n > 6 ? ', ...' : ''}]`,
                totalScore: cumulativeScore,
                mean: sampleMean,
                ss: hackerWelford.ss,
                unbiasedVar,
                biasedVar
            });
        }
    }

    return {
        terminalMeans,
        terminalUnbiasedVars,
        terminalBiasedVars,
        cumTrajectories,
        meanTrajectories,
        varTrajectories,
        sampleHackersTable,
        avgOfMeans: metaMean.mean,
        varOfMeans: metaMean.k > 1 ? metaMean.ss / (metaMean.k - 1) : 0.0,
        avgOfUnbiasedVars: metaUnbiasedVar.mean,
        varOfUnbiasedVars: metaUnbiasedVar.k > 1 ? metaUnbiasedVar.ss / (metaUnbiasedVar.k - 1) : 0.0,
        avgOfBiasedVars: metaBiasedVar.mean
    };
}

// ==================== 5. HISTOGRAM HELPER ====================

function buildHistogram(values, numBins = 24) {
    let minVal = Infinity, maxVal = -Infinity;
    for (let i = 0; i < values.length; i++) {
        if (values[i] < minVal) minVal = values[i];
        if (values[i] > maxVal) maxVal = values[i];
    }
    if (maxVal === minVal) {
        minVal -= 0.5;
        maxVal += 0.5;
    }
    const binWidth = (maxVal - minVal) / numBins;
    const counts = new Array(numBins).fill(0);
    const centers = new Array(numBins);

    for (let b = 0; b < numBins; b++) {
        centers[b] = minVal + (b + 0.5) * binWidth;
    }
    for (let i = 0; i < values.length; i++) {
        let idx = Math.floor((values[i] - minVal) / binWidth);
        if (idx >= numBins) idx = numBins - 1;
        if (idx < 0) idx = 0;
        counts[idx]++;
    }
    const densities = counts.map(c => c / (values.length * binWidth));
    return { centers, densities, binWidth };
}

// ==================== 6. CHART RENDERING ====================

const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
        legend: {
            labels: {
                color: '#cbd5e1',
                font: { size: 11 },
                filter: item => item.text && !item.text.startsWith('_')
            }
        }
    }
};

function renderTrajectoryCharts(n, distModel, simResult) {
    const labels = Array.from({ length: n }, (_, i) => i + 1);
    const sigma = Math.sqrt(distModel.sigma2);

    // 1. Cumulative Penetration Score Trajectories Y_{j,k} = sum_{i=1}^k X_{j,i}
    const cumDatasets = simResult.cumTrajectories.map((traj, idx) => ({
        label: idx === 0 ? 'Hacker Score Trajectories (Y_{j,k})' : `_hidden_${idx}`,
        data: traj,
        borderColor: `hsla(${(idx * 24) % 360}, 78%, 62%, 0.42)`,
        borderWidth: 1.3,
        pointRadius: 0,
        fill: false,
        tension: 0.12
    }));

    cumDatasets.unshift(
        {
            label: `Expected Trajectory E[Y_k] = k·μ`,
            data: labels.map(k => k * distModel.mu),
            borderColor: '#f8fafc',
            borderWidth: 2.4,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
        },
        {
            label: `±2σ√k Envelope`,
            data: labels.map(k => k * distModel.mu + 2.0 * sigma * Math.sqrt(k)),
            borderColor: 'rgba(244, 63, 94, 0.7)',
            borderWidth: 1.5,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false
        },
        {
            label: `_hidden_lower_env`,
            data: labels.map(k => k * distModel.mu - 2.0 * sigma * Math.sqrt(k)),
            borderColor: 'rgba(244, 63, 94, 0.7)',
            borderWidth: 1.5,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false
        }
    );

    if (chartCumTraj) chartCumTraj.destroy();
    chartCumTraj = new Chart(document.getElementById('chart-cum-traj'), {
        type: 'line',
        data: { labels, datasets: cumDatasets },
        options: {
            ...baseChartOptions,
            plugins: {
                ...baseChartOptions.plugins,
                title: {
                    display: true,
                    text: `Cumulative Penetration Score Trajectories Across n = ${n} Systems`,
                    color: '#f8fafc'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'System Attempted (k)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                },
                y: {
                    title: { display: true, text: 'Cumulative Penetration Score (Y_k)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                }
            }
        }
    });

    // 2. Welford Running Mean Trajectories
    const meanDatasets = simResult.meanTrajectories.map((traj, idx) => ({
        label: idx === 0 ? 'Hacker Running Means (x̄_k)' : `_hidden_${idx}`,
        data: traj,
        borderColor: `hsla(${(195 + idx * 18) % 360}, 80%, 60%, 0.42)`,
        borderWidth: 1.3,
        pointRadius: 0,
        fill: false,
        tension: 0.15
    }));

    meanDatasets.unshift({
        label: `Theoretical Mean μ = ${distModel.mu.toFixed(2)}`,
        data: Array(n).fill(distModel.mu),
        borderColor: '#f8fafc',
        borderWidth: 2.5,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false
    });

    if (chartMeanTraj) chartMeanTraj.destroy();
    chartMeanTraj = new Chart(document.getElementById('chart-mean-traj'), {
        type: 'line',
        data: { labels, datasets: meanDatasets },
        options: {
            ...baseChartOptions,
            plugins: {
                ...baseChartOptions.plugins,
                title: {
                    display: true,
                    text: 'Welford Running Sample Mean (x̄_k vs System k)',
                    color: '#f8fafc'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'System Attempted (k)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                },
                y: {
                    title: { display: true, text: 'Running Sample Mean (x̄_k)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                }
            }
        }
    });

    // 3. Welford Running Variance Trajectories
    const varDatasets = simResult.varTrajectories.map((traj, idx) => ({
        label: idx === 0 ? 'Hacker Running Variances (S²_k)' : `_hidden_${idx}`,
        data: traj,
        borderColor: `hsla(${(140 + idx * 20) % 360}, 75%, 58%, 0.42)`,
        borderWidth: 1.3,
        pointRadius: 0,
        spanGaps: true,
        fill: false,
        tension: 0.15
    }));

    varDatasets.unshift({
        label: `Theoretical Variance σ² = ${distModel.sigma2.toFixed(2)}`,
        data: Array(n).fill(distModel.sigma2),
        borderColor: '#10b981',
        borderWidth: 2.5,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false
    });

    if (chartVarTraj) chartVarTraj.destroy();
    chartVarTraj = new Chart(document.getElementById('chart-var-traj'), {
        type: 'line',
        data: { labels, datasets: varDatasets },
        options: {
            ...baseChartOptions,
            plugins: {
                ...baseChartOptions.plugins,
                title: {
                    display: true,
                    text: 'Welford Running Unbiased Variance (S²_k vs System k, k ≥ 2)',
                    color: '#f8fafc'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'System Attempted (k)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                },
                y: {
                    title: { display: true, text: 'Running Unbiased Variance (S²_k)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                }
            }
        }
    });
}

function renderSampleHackersTable(simResult) {
    const tbody = document.getElementById('hacker-sample-tbody');
    tbody.innerHTML = '';
    for (const h of simResult.sampleHackersTable) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Hacker #${h.id}</td>
            <td class="mono-seq">${h.preview}</td>
            <td>${h.totalScore.toFixed(2)}</td>
            <td style="color: #38bdf8; font-weight: 600;">${h.mean.toFixed(4)}</td>
            <td>${h.ss.toFixed(4)}</td>
            <td style="color: #10b981; font-weight: 600;">${h.unbiasedVar.toFixed(4)}</td>
            <td style="color: #f59e0b;">${h.biasedVar.toFixed(4)}</td>
        `;
        tbody.appendChild(tr);
    }
}

function renderDistributionCharts(n, distModel, simResult) {
    // 1. Histogram of Sampling Means + CLT Normal Overlay
    const meanHist = buildHistogram(simResult.terminalMeans, 24);
    const theoSE = Math.sqrt(distModel.sigma2 / n);
    const cltCurve = meanHist.centers.map(x => {
        const z = (x - distModel.mu) / theoSE;
        return (1.0 / (theoSE * Math.sqrt(2.0 * Math.PI))) * Math.exp(-0.5 * z * z);
    });

    if (chartMeanDist) chartMeanDist.destroy();
    chartMeanDist = new Chart(document.getElementById('chart-mean-dist'), {
        type: 'bar',
        data: {
            labels: meanHist.centers.map(c => c.toFixed(2)),
            datasets: [
                {
                    type: 'line',
                    label: `CLT Normal N(μ, σ²/n) (SE = ${theoSE.toFixed(3)})`,
                    data: cltCurve,
                    borderColor: '#f43f5e',
                    borderWidth: 2.2,
                    pointRadius: 0,
                    tension: 0.35
                },
                {
                    type: 'bar',
                    label: `Sampling Means x̄_j (Avg = ${simResult.avgOfMeans.toFixed(3)} vs μ = ${distModel.mu.toFixed(3)})`,
                    data: meanHist.densities,
                    backgroundColor: 'rgba(56, 189, 248, 0.55)',
                    borderColor: '#38bdf8',
                    borderWidth: 1,
                    barPercentage: 1.0,
                    categoryPercentage: 0.95
                }
            ]
        },
        options: {
            ...baseChartOptions,
            plugins: {
                ...baseChartOptions.plugins,
                title: {
                    display: true,
                    text: `Sampling Means Distribution Across m Hackers`,
                    color: '#f8fafc'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Hacker Sampling Mean (x̄_j)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8', maxTicksLimit: 10 },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                },
                y: {
                    title: { display: true, text: 'Probability Density', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                }
            }
        }
    });

    // 2. Histogram of Sampling Variances
    const varHist = buildHistogram(simResult.terminalUnbiasedVars, 24);

    if (chartVarDist) chartVarDist.destroy();
    chartVarDist = new Chart(document.getElementById('chart-var-dist'), {
        type: 'bar',
        data: {
            labels: varHist.centers.map(c => c.toFixed(2)),
            datasets: [
                {
                    type: 'bar',
                    label: `Unbiased Variances S²_j (Avg = ${simResult.avgOfUnbiasedVars.toFixed(3)} vs σ² = ${distModel.sigma2.toFixed(3)})`,
                    data: varHist.densities,
                    backgroundColor: 'rgba(16, 185, 129, 0.55)',
                    borderColor: '#10b981',
                    borderWidth: 1,
                    barPercentage: 1.0,
                    categoryPercentage: 0.95
                }
            ]
        },
        options: {
            ...baseChartOptions,
            plugins: {
                ...baseChartOptions.plugins,
                title: {
                    display: true,
                    text: `Sampling Variances Distribution Across m Hackers`,
                    color: '#f8fafc'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Hacker Sampling Variance (S²_j)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8', maxTicksLimit: 10 },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                },
                y: {
                    title: { display: true, text: 'Probability Density', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                }
            }
        }
    });
}

// ==================== 7. MULTI-N SENSITIVITY EXPERIMENT ====================

function runMultiNExperiment() {
    const distType = document.getElementById('dist-select').value;
    const pParam = parseFloat(document.getElementById('param-p').value);
    const m = parseInt(document.getElementById('param-m').value, 10);
    const distModel = getDistributionModel(distType, pParam);

    const nValues = [5, 10, 25, 50, 100, 250, 500];
    const empVarOfMeans = [];
    const theoVarOfMeans = [];
    const empVarOfVars = [];
    const theoVarOfVars = [];
    const empUnbiasedAvg = [];
    const empBiasedAvg = [];
    const theoBiasedCurve = [];
    const theoSigma2Line = [];

    const tbody = document.getElementById('multin-tbody');
    tbody.innerHTML = '';

    for (const n of nValues) {
        const res = simulateHackers(m, n, distModel, 0, 0);
        const tMeanVar = distModel.sigma2 / n;
        const tVarVar = theoreticalVarOfSampleVariance(distModel, n);

        empVarOfMeans.push(res.varOfMeans);
        theoVarOfMeans.push(tMeanVar);
        empVarOfVars.push(res.varOfUnbiasedVars);
        theoVarOfVars.push(tVarVar);

        empUnbiasedAvg.push(res.avgOfUnbiasedVars);
        empBiasedAvg.push(res.avgOfBiasedVars);
        theoBiasedCurve.push(((n - 1.0) / n) * distModel.sigma2);
        theoSigma2Line.push(distModel.sigma2);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>n = ${n}</td>
            <td>${res.avgOfMeans.toFixed(4)}</td>
            <td style="color: #10b981; font-weight: 600;">${res.avgOfUnbiasedVars.toFixed(4)}</td>
            <td style="color: #f59e0b;">${res.avgOfBiasedVars.toFixed(4)}</td>
            <td style="color: #38bdf8; font-weight: 600;">${res.varOfMeans.toFixed(4)}</td>
            <td>${tMeanVar.toFixed(4)}</td>
            <td style="color: #c084fc; font-weight: 600;">${res.varOfUnbiasedVars.toFixed(4)}</td>
            <td>${tVarVar.toFixed(4)}</td>
        `;
        tbody.appendChild(tr);
    }

    const labels = nValues.map(n => `n=${n}`);

    // Chart A: Empirical & Theoretical Variability Decay Var(x̄) and Var(S²)
    if (chartMultiNVar) chartMultiNVar.destroy();
    chartMultiNVar = new Chart(document.getElementById('chart-multin-variability'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Empirical Var(x̄)',
                    data: empVarOfMeans,
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.2)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    tension: 0.2
                },
                {
                    label: 'Theoretical Var(x̄) = σ² / n',
                    data: theoVarOfMeans,
                    borderColor: '#e0f2fe',
                    borderDash: [5, 5],
                    borderWidth: 1.8,
                    pointRadius: 2,
                    tension: 0.2
                },
                {
                    label: 'Empirical Var(S²)',
                    data: empVarOfVars,
                    borderColor: '#c084fc',
                    backgroundColor: 'rgba(192, 132, 252, 0.2)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    tension: 0.2
                },
                {
                    label: 'Theoretical Var(S²)',
                    data: theoVarOfVars,
                    borderColor: '#f3e8ff',
                    borderDash: [5, 5],
                    borderWidth: 1.8,
                    pointRadius: 2,
                    tension: 0.2
                }
            ]
        },
        options: {
            ...baseChartOptions,
            plugins: {
                ...baseChartOptions.plugins,
                title: {
                    display: true,
                    text: 'Effect of Increasing n: Decay of Var(x̄) and Var(S²)',
                    color: '#f8fafc'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Systems Attempted per Hacker (n)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                },
                y: {
                    title: { display: true, text: 'Estimator Variance (O(1/n) Decay)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                }
            }
        }
    });

    // Chart B: Unbiased E[S²] vs Biased E[σ̂²] vs Theoretical σ² across n
    if (chartMultiNBias) chartMultiNBias.destroy();
    chartMultiNBias = new Chart(document.getElementById('chart-multin-bias'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `Theoretical σ² = ${distModel.sigma2.toFixed(2)}`,
                    data: theoSigma2Line,
                    borderColor: '#f8fafc',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: 'Empirical Avg. Unbiased S² (÷ (n-1))',
                    data: empUnbiasedAvg,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    tension: 0.15
                },
                {
                    label: 'Empirical Avg. Biased σ̂² (÷ n)',
                    data: empBiasedAvg,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.2)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    tension: 0.15
                },
                {
                    label: 'Theoretical E[σ̂²] = ((n-1)/n)σ²',
                    data: theoBiasedCurve,
                    borderColor: '#fde68a',
                    borderDash: [4, 4],
                    borderWidth: 1.6,
                    pointRadius: 2,
                    tension: 0.15
                }
            ]
        },
        options: {
            ...baseChartOptions,
            plugins: {
                ...baseChartOptions.plugins,
                title: {
                    display: true,
                    text: 'Unbiasedness of S² vs Small-Sample Bias of σ̂² Across n',
                    color: '#f8fafc'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Systems Attempted per Hacker (n)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                },
                y: {
                    title: { display: true, text: 'Average Variance Across m Hackers', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.1)' }
                }
            }
        }
    });
}

// ==================== 8. MAIN UI CONTROLLER ====================

function runMainSimulation() {
    const distType = document.getElementById('dist-select').value;
    const pParam = parseFloat(document.getElementById('param-p').value);
    const m = parseInt(document.getElementById('param-m').value, 10);
    const n = parseInt(document.getElementById('param-n').value, 10);

    const distModel = getDistributionModel(distType, pParam);
    const simResult = simulateHackers(m, n, distModel, 16, 6);

    const meanBias = Math.abs(simResult.avgOfMeans - distModel.mu);
    const theoVarOfMean = distModel.sigma2 / n;
    const theoVarOfVar = theoreticalVarOfSampleVariance(distModel, n);

    document.getElementById('stat-theo-mean').textContent = distModel.mu.toFixed(4);
    document.getElementById('stat-emp-mean').textContent = simResult.avgOfMeans.toFixed(4);
    document.getElementById('stat-mean-err').textContent = meanBias.toFixed(4);

    document.getElementById('stat-theo-var').textContent = distModel.sigma2.toFixed(4);
    document.getElementById('stat-emp-var-unbiased').textContent = simResult.avgOfUnbiasedVars.toFixed(4);
    document.getElementById('stat-emp-var-biased').textContent = simResult.avgOfBiasedVars.toFixed(4);

    document.getElementById('stat-var-of-mean').textContent =
        `${simResult.varOfMeans.toFixed(4)} (Theo: ${theoVarOfMean.toFixed(4)})`;
    document.getElementById('stat-var-of-var').textContent =
        `${simResult.varOfUnbiasedVars.toFixed(4)} (Theo: ${theoVarOfVar.toFixed(4)})`;

    renderTrajectoryCharts(n, distModel, simResult);
    renderSampleHackersTable(simResult);
    renderDistributionCharts(n, distModel, simResult);
}

document.addEventListener('DOMContentLoaded', () => {
    const distSelect = document.getElementById('dist-select');
    const pGroup = document.getElementById('binomial-p-group');
    const paramP = document.getElementById('param-p');
    const paramM = document.getElementById('param-m');
    const paramN = document.getElementById('param-n');

    distSelect.addEventListener('change', () => {
        pGroup.style.display = distSelect.value === 'binomial' ? 'block' : 'none';
        runMainSimulation();
        runMultiNExperiment();
    });

    paramP.addEventListener('input', () => {
        document.getElementById('val-p').textContent = parseFloat(paramP.value).toFixed(2);
    });
    paramP.addEventListener('change', () => {
        runMainSimulation();
        runMultiNExperiment();
    });

    paramM.addEventListener('input', () => {
        document.getElementById('val-m').textContent = paramM.value;
    });
    paramM.addEventListener('change', runMainSimulation);

    paramN.addEventListener('input', () => {
        document.getElementById('val-n').textContent = paramN.value;
    });
    paramN.addEventListener('change', runMainSimulation);

    document.getElementById('btn-run-sim').addEventListener('click', runMainSimulation);
    document.getElementById('btn-run-multin').addEventListener('click', runMultiNExperiment);
    document.getElementById('btn-test-welford').addEventListener('click', runCancellationBenchmark);

    runCancellationBenchmark();
    runMainSimulation();
    runMultiNExperiment();
});