/**
 * app.js
 * Part 1: Modes of Convergence (a.s., P, L2, d) & sqrt(n) Independence Simulator
 * Part 2: Continuous Beta-Binomial Conjugate Updating & Discrete IDS Base-Rate Bayes Lab
 */

document.addEventListener("DOMContentLoaded", () => {

    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.font.family = "'Plus Jakarta Sans', 'JetBrains Mono', sans-serif";
    Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.06)';

    // Chart instances
    let chartAsPaths = null;
    let chartProbL2 = null;
    let chartCltDist = null;
    let chartSqrtScaling = null;
    let chartBetaPosterior = null;
    let chartPriorSensitivity = null;
    let chartIdsSeq = null;

    /* =========================================================================
       MATH UTILITIES
       ========================================================================= */

    function randNormal() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    function normalPDF(x) {
        return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    }

    // Lanczos log-Gamma for Beta PDF normalization
    function logGamma(z) {
        const g = 7;
        const p = [
            0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
        ];
        if (z < 0.5) {
            return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
        }
        z -= 1;
        let x = p[0];
        for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
        const t = z + g + 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
    }

    function betaPDF(x, a, b) {
        if (x < 0 || x > 1) return 0;
        if (x === 0) return a > 1 ? 0 : (a === 1 ? b : Infinity);
        if (x === 1) return b > 1 ? 0 : (b === 1 ? a : Infinity);
        const logNorm = logGamma(a) + logGamma(b) - logGamma(a + b);
        const val = Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logNorm);
        return Number.isFinite(val) ? val : 0;
    }

    // Plot-safe Beta PDF on [0, 1]: uses exact finite endpoint values when a,b >= 1
    // and clamps boundary singularities (a < 1 or b < 1) via a near-edge sample.
    function betaPDFPlot(x, a, b) {
        if (x <= 0) return a >= 1 ? (a === 1 ? b : 0) : betaPDF(0.002, a, b);
        if (x >= 1) return b >= 1 ? (b === 1 ? a : 0) : betaPDF(0.998, a, b);
        return betaPDF(x, a, b);
    }

    // Numerical 95% Credible Interval for Beta(a, b) via midpoint quadrature + linear interpolation
    function betaCredibleInterval95(a, b) {
        const steps = 4000;
        const dx = 1.0 / steps;
        const cdf = new Float64Array(steps + 1);

        for (let i = 0; i < steps; i++) {
            const xMid = (i + 0.5) * dx;
            const y = betaPDF(xMid, a, b);
            cdf[i + 1] = cdf[i] + (Number.isFinite(y) ? y * dx : 0);
        }
        const total = cdf[steps] || 1;

        function quantile(q) {
            const target = q * total;
            for (let i = 1; i <= steps; i++) {
                if (cdf[i] >= target) {
                    const prev = cdf[i - 1];
                    const frac = cdf[i] > prev ? (target - prev) / (cdf[i] - prev) : 0;
                    return ((i - 1) + frac) * dx;
                }
            }
            return 1;
        }
        return [quantile(0.025), quantile(0.975)];
    }

    // Helper: generate evenly spaced sample indices including exact endpoint nMax
    function sampleIndices(nMax, maxPoints) {
        const step = Math.max(1, Math.floor(nMax / maxPoints));
        const indices = [];
        for (let k = 0; k < nMax; k += step) indices.push(k);
        if (indices[indices.length - 1] !== nMax - 1) indices.push(nMax - 1);
        return indices;
    }

    /* =========================================================================
       PART 1: MODES OF CONVERGENCE & SQRT(N) SIMULATOR
       ========================================================================= */

    const distConfig = {
        bernoulli: {
            name: "Bernoulli(0.5)",
            mu: 0.5,
            variance: 0.25,
            finite: true,
            sampleUnit: () => (Math.random() < 0.5 ? 1 : 0)
        },
        exponential: {
            name: "Exponential(1)",
            mu: 1.0,
            variance: 1.0,
            finite: true,
            sampleUnit: () => -Math.log(1 - Math.random())
        },
        uniform: {
            name: "Uniform(0, 4)",
            mu: 2.0,
            variance: 16 / 12,
            finite: true,
            sampleUnit: () => Math.random() * 4
        },
        cauchy: {
            name: "Cauchy(0, 1)",
            mu: 0.0, // location parameter x0 (true mean does not exist!)
            variance: Infinity,
            finite: false,
            sampleUnit: () => Math.tan(Math.PI * (Math.random() - 0.5))
        }
    };

    function runConvergenceSimulation() {
        const distKey = document.getElementById("conv-dist").value;
        const nMax = parseInt(document.getElementById("conv-n").value, 10);
        const M = parseInt(document.getElementById("conv-m").value, 10);
        const eps = parseFloat(document.getElementById("conv-eps").value);
        const rhoSlider = document.getElementById("conv-rho");
        const rhoLabel = document.getElementById("val-conv-rho");
        const rawRho = parseFloat(rhoSlider.value);

        const cfg = distConfig[distKey];
        const rho = cfg.finite ? rawRho : 0;
        rhoSlider.disabled = !cfg.finite;
        rhoLabel.textContent = !cfg.finite
            ? "N/A (Cauchy)"
            : (rawRho === 0 ? "0.00 (i.i.d.)" : rawRho.toFixed(2));

        const sigma = cfg.finite ? Math.sqrt(cfg.variance) : 1.0;

        // Track 12 sample paths for a.s. visualization
        const numDisplayPaths = 12;
        const samplePaths = Array.from({ length: numDisplayPaths }, () => new Float64Array(nMax));

        // Track empirical P(|Xbar_k - mu| > eps) and MSE across k = 1..nMax
        const exceedCounts = new Int32Array(nMax);
        const sqErrSums = new Float64Array(nMax);
        const finalMeans = new Float64Array(M);

        // Generate M trajectories of length nMax
        // When rho > 0 (and finite variance), inject common-shock dependence:
        // X_i = mu + sigma * (sqrt(rho) * Z_common + sqrt(1 - rho) * Z_i_std)
        // preserving E[X_i] = mu, Var(X_i) = sigma^2, and Cov(X_i, X_j) = rho * sigma^2.
        for (let m = 0; m < M; m++) {
            let cumSum = 0;
            const commonShock = rho > 0 ? randNormal() : 0;

            for (let k = 0; k < nMax; k++) {
                let x;
                if (!cfg.finite) {
                    x = cfg.sampleUnit();
                } else if (rho > 0) {
                    const zIndep = (cfg.sampleUnit() - cfg.mu) / sigma;
                    x = cfg.mu + sigma * (Math.sqrt(rho) * commonShock + Math.sqrt(1 - rho) * zIndep);
                } else {
                    x = cfg.sampleUnit();
                }

                cumSum += x;
                const xBar = cumSum / (k + 1);

                if (m < numDisplayPaths) {
                    // Clamp extreme Cauchy spikes only for plotting readability
                    samplePaths[m][k] = cfg.finite ? xBar : Math.max(-8, Math.min(8, xBar));
                }

                const diff = xBar - cfg.mu;
                if (Math.abs(diff) > eps) exceedCounts[k]++;
                sqErrSums[k] += diff * diff;

                if (k === nMax - 1) finalMeans[m] = xBar;
            }
        }

        // Compute summary KPIs at k = nMax
        const empProbEps = exceedCounts[nMax - 1] / M;
        const empMSE = sqErrSums[nMax - 1] / M;
        const empSE = Math.sqrt(empMSE);
        const chebLabelEl = document.getElementById("kpi-chebyshev-label");

        document.getElementById("kpi-prob-eps").textContent = (empProbEps * 100).toFixed(2) + "%";
        if (cfg.finite) {
            const theoVarIid = cfg.variance / nMax;
            const theoVarDep = cfg.variance * (rho + (1 - rho) / nMax);
            const chebBound = Math.min(1, (rho > 0 ? theoVarDep : theoVarIid) / (eps * eps));
            const theoSeIid = sigma / Math.sqrt(nMax);

            chebLabelEl.innerHTML = rho > 0
                ? "Chebyshev Bound (Dependent)"
                : "Chebyshev Bound (i.i.d.) &sigma;&sup2;/(n&epsilon;&sup2;)";
            document.getElementById("kpi-chebyshev").textContent = (chebBound * 100).toFixed(2) + "%";
            document.getElementById("kpi-mse").textContent = empMSE.toFixed(5);
            document.getElementById("kpi-theo-var").textContent = theoVarIid.toFixed(5);
            document.getElementById("kpi-se-ratio").textContent = `${empSE.toFixed(4)} / ${theoSeIid.toFixed(4)}`;
        } else {
            chebLabelEl.innerHTML = "Chebyshev Bound &sigma;&sup2;/(n&epsilon;&sup2;)";
            document.getElementById("kpi-chebyshev").textContent = "Undefined (∞)";
            document.getElementById("kpi-mse").textContent = empMSE > 1e4 ? empMSE.toExponential(2) : empMSE.toFixed(2);
            document.getElementById("kpi-theo-var").textContent = "∞ (Diverges)";
            document.getElementById("kpi-se-ratio").textContent = "LLN / CLT Fail";
        }

        // Dynamic diagnostic insight banner
        const insightEl = document.getElementById("conv-insight");
        if (!cfg.finite) {
            insightEl.className = "insight-banner warn";
            insightEl.innerHTML = `<strong>Cauchy Breakdown (Infinite Mean &amp; Variance):</strong> For $X_i \\sim \\text{Cauchy}(0,1)$, the sample mean $\\bar{X}_n$ has the <em>exact same</em> $\\text{Cauchy}(0,1)$ distribution for every $n$. Neither the LLN (a.s., $P$, $L^2$) nor the CLT ($\\sqrt{n}$-scaling) holds: trajectories exhibit sudden massive jumps regardless of sample size.`;
        } else if (rho > 0) {
            const floorSE = sigma * Math.sqrt(rho);
            insightEl.className = "insight-banner warn";
            insightEl.innerHTML = `<strong>Independence Violated (&rho; = ${rho.toFixed(2)}):</strong> Because $\\text{Cov}(X_i, X_j) = \\rho\\sigma^2 &gt; 0$, variance additivity breaks. Instead of decaying to $0$ as $\\sigma/\\sqrt{n}$, $\\text{SE}(\\bar{X}_n)$ plateaus at an irreducible floor $\\sigma\\sqrt{\\rho} = ${floorSE.toFixed(4)}$. Both $L^2$ convergence and consistency fail!`;
        } else {
            insightEl.className = "insight-banner success";
            insightEl.innerHTML = `<strong>i.i.d. Regime (&rho; = 0):</strong> Sample paths lock inside the $\\mu \\pm \\varepsilon$ tube (<strong>a.s.</strong>), tail exceedance $P(|\\bar{X}_k - \\mu| &gt; \\varepsilon) \\to 0$ well below Chebyshev's bound (<strong>in Probability</strong>), empirical MSE tracks $\\sigma^2/k$ (<strong>$L^2$</strong>), and $\\sqrt{n}(\\bar{X}_n - \\mu)/\\sigma$ aligns with $\\mathcal{N}(0, 1)$ (<strong>in Distribution</strong>).`;
        }

        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([insightEl]);
        }

        // Render all 4 convergence charts
        renderAsPathsChart(samplePaths, nMax, cfg, eps);
        renderProbAndL2Chart(exceedCounts, sqErrSums, M, nMax, cfg, eps, rho);
        renderCltDistChart(finalMeans, nMax, cfg, rho);
        renderSqrtScalingChart(sqErrSums, M, nMax, cfg, rho);
    }

    function renderAsPathsChart(samplePaths, nMax, cfg, eps) {
        const ctx = document.getElementById("chart-as-paths").getContext("2d");
        if (chartAsPaths) chartAsPaths.destroy();

        const idxList = sampleIndices(nMax, 80);
        const labels = idxList.map(k => k + 1);

        const datasets = samplePaths.map((path, idx) => ({
            label: idx === 0 ? "Sample Paths X̄_k(ω)" : "",
            data: idxList.map(k => path[k]),
            borderColor: `hsla(${(idx * 31) % 360}, 75%, 65%, 0.55)`,
            borderWidth: 1.4,
            pointRadius: 0,
            tension: 0.1
        }));

        datasets.push({
            label: cfg.finite
                ? `Target μ = ${cfg.mu}`
                : `Location x₀ = ${cfg.mu} (Mean μ Undefined)`,
            data: labels.map(() => cfg.mu),
            borderColor: "#ffffff",
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0
        });

        if (cfg.finite) {
            datasets.push({
                label: `μ ± ε Band (±${eps})`,
                data: labels.map(() => cfg.mu + eps),
                borderColor: "rgba(52, 211, 153, 0.7)",
                borderWidth: 1.5,
                borderDash: [3, 3],
                pointRadius: 0
            });
            datasets.push({
                label: "",
                data: labels.map(() => cfg.mu - eps),
                borderColor: "rgba(52, 211, 153, 0.7)",
                borderWidth: 1.5,
                borderDash: [3, 3],
                pointRadius: 0
            });
        }

        chartAsPaths = new Chart(ctx, {
            type: "line",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: "1. Almost Sure Convergence (a.s.): Individual Trajectories X̄_k(ω)", color: "#f8fafc" },
                    legend: {
                        labels: { filter: item => item.text !== "" }
                    }
                },
                scales: {
                    x: { title: { display: true, text: "Sample Size k" } },
                    y: { title: { display: true, text: "Sample Mean X̄_k" } }
                }
            }
        });
    }

    function renderProbAndL2Chart(exceedCounts, sqErrSums, M, nMax, cfg, eps, rho) {
        const ctx = document.getElementById("chart-prob-l2").getContext("2d");
        if (chartProbL2) chartProbL2.destroy();

        const idxList = sampleIndices(nMax, 60);
        const labels = [];
        const empProb = [];
        const cheb = [];
        const chebDep = [];
        const empL2 = [];

        for (const k of idxList) {
            const nVal = k + 1;
            labels.push(nVal);
            empProb.push(exceedCounts[k] / M);
            if (cfg.finite) {
                cheb.push(Math.min(1.0, cfg.variance / (nVal * eps * eps)));
                if (rho > 0) {
                    const varDep = cfg.variance * (rho + (1 - rho) / nVal);
                    chebDep.push(Math.min(1.0, varDep / (eps * eps)));
                }
                empL2.push(sqErrSums[k] / M);
            }
        }

        const datasets = [
            {
                label: cfg.finite
                    ? `Empirical P(|X̄_k − μ| > ${eps}) [Conv. in P]`
                    : `Empirical P(|X̄_k − x₀| > ${eps}) [Does NOT vanish]`,
                data: empProb,
                borderColor: "#34d399",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                fill: true,
                borderWidth: 2,
                pointRadius: 0
            }
        ];

        if (cfg.finite) {
            datasets.push({
                label: "Chebyshev Bound (i.i.d.) σ² / (k·ε²)",
                data: cheb,
                borderColor: "#fbbf24",
                borderDash: [5, 4],
                borderWidth: 1.8,
                pointRadius: 0
            });
            if (rho > 0) {
                datasets.push({
                    label: `Dependent Chebyshev Bound [ρ=${rho.toFixed(2)}]`,
                    data: chebDep,
                    borderColor: "#f43f5e",
                    borderDash: [3, 3],
                    borderWidth: 1.8,
                    pointRadius: 0
                });
            }
            datasets.push({
                label: "Empirical L² MSE E[(X̄_k − μ)²]",
                data: empL2,
                borderColor: "#c084fc",
                borderWidth: 2,
                pointRadius: 0
            });
        }

        chartProbL2 = new Chart(ctx, {
            type: "line",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: "2. Convergence in Probability (P) & Mean-Square (L²)", color: "#f8fafc" }
                },
                scales: {
                    x: { title: { display: true, text: "Sample Size k" } },
                    y: { beginAtZero: true, suggestedMax: 1.05, title: { display: true, text: "Probability / MSE" } }
                }
            }
        });
    }

    function renderCltDistChart(finalMeans, nMax, cfg, rho) {
        const ctx = document.getElementById("chart-clt-dist").getContext("2d");
        if (chartCltDist) chartCltDist.destroy();

        const sigma = cfg.finite ? Math.sqrt(cfg.variance) : 1.0;
        const numBins = 24;
        const minX = -4.0, maxX = 4.0;
        const binW = (maxX - minX) / numBins;
        const counts = new Int32Array(numBins);
        let inRange = 0;

        for (let i = 0; i < finalMeans.length; i++) {
            const z = cfg.finite
                ? Math.sqrt(nMax) * (finalMeans[i] - cfg.mu) / sigma
                : finalMeans[i]; // Cauchy unscaled
            if (z >= minX && z <= maxX) {
                const idx = Math.min(numBins - 1, Math.floor((z - minX) / binW));
                counts[idx]++;
                inRange++;
            }
        }

        const total = finalMeans.length;
        const outPct = ((total - inRange) / total) * 100;
        const outNote = outPct >= 1 ? ` (${outPct.toFixed(0)}% outside [-4, 4])` : "";
        const isDependent = cfg.finite && rho > 0;

        const binCenters = [];
        const densities = [];
        const normCurve = [];

        for (let b = 0; b < numBins; b++) {
            const center = minX + (b + 0.5) * binW;
            binCenters.push(center.toFixed(2));
            densities.push(counts[b] / (total * binW));
            normCurve.push(normalPDF(center));
        }

        chartCltDist = new Chart(ctx, {
            type: "bar",
            data: {
                labels: binCenters,
                datasets: [
                    {
                        type: "bar",
                        label: cfg.finite
                            ? `Empirical Density of √n(X̄_n − μ)/σ (n=${nMax})${outNote}`
                            : `Empirical Density of Cauchy X̄_n${outNote}`,
                        data: densities,
                        backgroundColor: isDependent ? "rgba(244, 63, 94, 0.45)" : "rgba(56, 189, 248, 0.45)",
                        borderColor: isDependent ? "#f43f5e" : "#38bdf8",
                        borderWidth: 1,
                        barPercentage: 1.0,
                        categoryPercentage: 1.0
                    },
                    {
                        type: "line",
                        label: "CLT Limit N(0, 1) PDF",
                        data: normCurve,
                        borderColor: "#fbbf24",
                        borderWidth: 2.4,
                        pointRadius: 0,
                        tension: 0.35
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: "3. Convergence in Distribution (d): CLT Standardization √n(X̄_n − μ)/σ", color: "#f8fafc" }
                },
                scales: {
                    x: { title: { display: true, text: "Standardized Value z" } },
                    y: { beginAtZero: true, title: { display: true, text: "Density" } }
                }
            }
        });
    }

    function renderSqrtScalingChart(sqErrSums, M, nMax, cfg, rho) {
        const ctx = document.getElementById("chart-sqrt-scaling").getContext("2d");
        if (chartSqrtScaling) chartSqrtScaling.destroy();

        const idxList = sampleIndices(nMax, 60);
        const labels = [];
        const empSE = [];
        const theoIidSE = [];
        const theoDepSE = [];
        const sigma = cfg.finite ? Math.sqrt(cfg.variance) : 1.0;

        for (const k of idxList) {
            const nVal = k + 1;
            labels.push(nVal);
            const se = Math.sqrt(sqErrSums[k] / M);
            empSE.push(cfg.finite ? se : Math.min(se, 10));
            if (cfg.finite) {
                theoIidSE.push(sigma / Math.sqrt(nVal));
                theoDepSE.push(sigma * Math.sqrt(rho + (1 - rho) / nVal));
            }
        }

        const datasets = [
            {
                label: cfg.finite ? "Empirical SE(X̄_k)" : "Empirical RMS Deviation (Capped at 10)",
                data: empSE,
                borderColor: "#38bdf8",
                borderWidth: 2.2,
                pointRadius: 0
            }
        ];

        if (cfg.finite) {
            datasets.push({
                label: "Theoretical i.i.d. Law: σ / √k",
                data: theoIidSE,
                borderColor: "#10b981",
                borderDash: [5, 4],
                borderWidth: 2,
                pointRadius: 0
            });
            if (rho > 0) {
                datasets.push({
                    label: `Dependent Law: σ√(ρ + (1−ρ)/k) [ρ=${rho.toFixed(2)}]`,
                    data: theoDepSE,
                    borderColor: "#f43f5e",
                    borderDash: [3, 3],
                    borderWidth: 2,
                    pointRadius: 0
                });
            }
        }

        chartSqrtScaling = new Chart(ctx, {
            type: "line",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: "4. The √n Law & Independence: Standard Error SE(X̄_k) Decay", color: "#f8fafc" }
                },
                scales: {
                    x: { title: { display: true, text: "Sample Size k" } },
                    y: { beginAtZero: true, title: { display: true, text: "Standard Error SD(X̄_k)" } }
                }
            }
        });
    }

    /* =========================================================================
       PART 2A: BETA-BINOMIAL CONJUGATE BAYESIAN UPDATING LAB
       ========================================================================= */

    const priorPresets = {
        uniform: [1, 1],
        jeffreys: [0.5, 0.5],
        skeptical: [2, 18],
        optimistic: [18, 2]
    };

    function updateBetaBinomialLab() {
        const a0 = parseFloat(document.getElementById("bayes-alpha").value);
        const b0 = parseFloat(document.getElementById("bayes-beta").value);
        const n = parseInt(document.getElementById("bayes-n").value, 10);
        const kSlider = document.getElementById("bayes-k");
        kSlider.max = n;
        if (parseInt(kSlider.value, 10) > n) kSlider.value = n;
        const k = parseInt(kSlider.value, 10);

        document.getElementById("val-bayes-alpha").textContent = a0;
        document.getElementById("val-bayes-beta").textContent = b0;
        document.getElementById("val-bayes-n").textContent = n;
        document.getElementById("val-bayes-k").textContent = k;

        const aPost = a0 + k;
        const bPost = b0 + (n - k);

        const priorMean = a0 / (a0 + b0);
        const postMean = aPost / (aPost + bPost);
        const mle = n > 0 ? k / n : NaN;
        const [ciLow, ciHigh] = betaCredibleInterval95(aPost, bPost);

        const priorWeight = (a0 + b0) / (a0 + b0 + n);
        const dataWeight = n / (a0 + b0 + n);

        document.getElementById("kpi-prior-mean").textContent = priorMean.toFixed(4);
        document.getElementById("kpi-mle").textContent = n > 0 ? mle.toFixed(4) : "N/A (n=0)";
        document.getElementById("kpi-post-mean").textContent = postMean.toFixed(4);
        document.getElementById("kpi-post-ci").textContent = `[${ciLow.toFixed(3)}, ${ciHigh.toFixed(3)}]`;
        document.getElementById("kpi-weight-split").textContent = `${(priorWeight * 100).toFixed(0)}% / ${(dataWeight * 100).toFixed(0)}%`;

        // 1. Plot Prior, Scaled Likelihood, and Posterior densities on [0, 1]
        const gridN = 200;
        const labels = [];
        const priorCurve = [];
        const postCurve = [];
        const rawLik = [];
        let maxPost = 0;

        for (let i = 0; i <= gridN; i++) {
            const theta = i / gridN;
            labels.push(theta.toFixed(2));
            const pPrior = betaPDFPlot(theta, a0, b0);
            const pPost = betaPDFPlot(theta, aPost, bPost);
            priorCurve.push(pPrior);
            postCurve.push(pPost);
            if (pPost > maxPost) maxPost = pPost;

            // Log-stable likelihood shape theta^k * (1-theta)^(n-k) including exact endpoints
            let logL = 0;
            if (n > 0) {
                if (theta === 0) {
                    logL = k === 0 ? 0 : -Infinity;
                } else if (theta === 1) {
                    logL = k === n ? 0 : -Infinity;
                } else {
                    logL = k * Math.log(theta) + (n - k) * Math.log(1 - theta);
                }
            }
            rawLik.push(logL);
        }

        // Scale likelihood to match posterior peak for visual comparison
        const maxLogL = Math.max(...rawLik);
        const scaledLik = rawLik.map(ll => {
            if (n === 0) return 1.0;
            if (!Number.isFinite(ll)) return 0;
            const val = Math.exp(ll - maxLogL);
            return val * Math.max(maxPost, 1.5);
        });

        const betaPostData = {
            labels,
            datasets: [
                {
                    label: `Prior Beta(${a0}, ${b0})`,
                    data: priorCurve,
                    borderColor: "#38bdf8",
                    backgroundColor: "rgba(56, 189, 248, 0.12)",
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: n > 0 ? `Scaled Likelihood Binom(n=${n}, k=${k})` : "Likelihood (No Data Yet)",
                    data: scaledLik,
                    borderColor: "#fbbf24",
                    borderDash: [6, 4],
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: `Posterior Beta(${aPost}, ${bPost})`,
                    data: postCurve,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16, 185, 129, 0.22)",
                    fill: true,
                    borderWidth: 2.5,
                    pointRadius: 0
                }
            ]
        };

        if (chartBetaPosterior) {
            chartBetaPosterior.data = betaPostData;
            chartBetaPosterior.update("none");
        } else {
            const ctxPost = document.getElementById("chart-beta-posterior").getContext("2d");
            chartBetaPosterior = new Chart(ctxPost, {
                type: "line",
                data: betaPostData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                        title: { display: true, text: "Prior, Scaled Likelihood & Posterior Density over θ ∈ [0, 1]", color: "#f8fafc" }
                    },
                    scales: {
                        x: { title: { display: true, text: "Parameter θ" }, ticks: { maxTicksLimit: 11 } },
                        y: { beginAtZero: true, title: { display: true, text: "Density p(θ)" } }
                    }
                }
            });
        }

        // 2. Plot Prior Sensitivity & Asymptotic Convergence (competing priors as n grows)
        const observedRate = n > 0 ? k / n : 0.70;
        const nSteps = [0, 5, 10, 20, 35, 50, 75, 100, 150, 200];
        const trajUniform = nSteps.map(ni => (1 + ni * observedRate) / (2 + ni));
        const trajSkeptical = nSteps.map(ni => (2 + ni * observedRate) / (20 + ni));
        const trajOptimistic = nSteps.map(ni => (18 + ni * observedRate) / (20 + ni));
        const trajCurrent = nSteps.map(ni => (a0 + ni * observedRate) / (a0 + b0 + ni));

        const sensData = {
            labels: nSteps,
            datasets: [
                {
                    label: "Uniform Prior Beta(1,1)",
                    data: trajUniform,
                    borderColor: "#38bdf8",
                    borderWidth: 2,
                    pointRadius: 2
                },
                {
                    label: "Skeptical Prior Beta(2,18)",
                    data: trajSkeptical,
                    borderColor: "#f43f5e",
                    borderWidth: 2,
                    pointRadius: 2
                },
                {
                    label: "Optimistic Prior Beta(18,2)",
                    data: trajOptimistic,
                    borderColor: "#c084fc",
                    borderWidth: 2,
                    pointRadius: 2
                },
                {
                    label: `Active Prior Beta(${a0},${b0})`,
                    data: trajCurrent,
                    borderColor: "#10b981",
                    borderWidth: 2.6,
                    pointRadius: 3
                },
                {
                    label: n > 0
                        ? `Data MLE Rate (${observedRate.toFixed(2)})`
                        : `Assumed Reference Rate (${observedRate.toFixed(2)})`,
                    data: nSteps.map(() => observedRate),
                    borderColor: "#fbbf24",
                    borderDash: [5, 5],
                    borderWidth: 1.8,
                    pointRadius: 0
                }
            ]
        };

        if (chartPriorSensitivity) {
            chartPriorSensitivity.data = sensData;
            chartPriorSensitivity.update("none");
        } else {
            const ctxSens = document.getElementById("chart-prior-sensitivity").getContext("2d");
            chartPriorSensitivity = new Chart(ctxSens, {
                type: "line",
                data: sensData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                        title: { display: true, text: "Prior Sensitivity: Posterior Mean Convergence as Sample Size n Grows", color: "#f8fafc" }
                    },
                    scales: {
                        x: { title: { display: true, text: "Sample Size n" } },
                        y: { min: 0, max: 1, title: { display: true, text: "Posterior Mean E[θ | D]" } }
                    }
                }
            });
        }
    }

    /* =========================================================================
       PART 2B: DISCRETE BAYES BASE-RATE FALLACY (IDS / DIAGNOSTIC TEST)
       ========================================================================= */

    function updateIdsBayesLab() {
        const prior = parseFloat(document.getElementById("ids-prior").value) / 100;
        const tpr = parseFloat(document.getElementById("ids-tpr").value) / 100;
        const fpr = parseFloat(document.getElementById("ids-fpr").value) / 100;

        document.getElementById("val-ids-prior").textContent = (prior * 100).toFixed(1) + "%";
        document.getElementById("val-ids-tpr").textContent = (tpr * 100).toFixed(1) + "%";
        document.getElementById("val-ids-fpr").textContent = (fpr * 100).toFixed(1) + "%";

        const bayesFactor = tpr / fpr;

        // Sequential Bayes update for 0, 1, 2, 3, 4 independent positive alerts
        const seqProbs = [prior];
        let curr = prior;
        for (let t = 1; t <= 4; t++) {
            const evidence = tpr * curr + fpr * (1 - curr);
            curr = (tpr * curr) / evidence;
            seqProbs.push(curr);
        }

        document.getElementById("ids-kpi-prior").textContent = (seqProbs[0] * 100).toFixed(2) + "%";
        document.getElementById("ids-kpi-bf").textContent = bayesFactor.toFixed(1) + "×";
        document.getElementById("ids-kpi-p1").textContent = (seqProbs[1] * 100).toFixed(2) + "%";
        document.getElementById("ids-kpi-p2").textContent = (seqProbs[2] * 100).toFixed(2) + "%";
        document.getElementById("ids-kpi-p3").textContent = (seqProbs[3] * 100).toFixed(2) + "%";

        const insight = document.getElementById("ids-insight");
        if (seqProbs[1] < 0.5) {
            insight.className = "insight-banner warn";
            insight.innerHTML = `<strong>Base-Rate Fallacy Triggered:</strong> Even though sensitivity is <strong>${(tpr * 100).toFixed(1)}%</strong>, the low prior prevalence (${(prior * 100).toFixed(1)}%) means a single alert only yields a <strong>${(seqProbs[1] * 100).toFixed(2)}%</strong> posterior probability of a real attack (most alerts are false alarms!). However, treating the first posterior as the new prior, a <strong>2nd independent alert</strong> pushes certainty to <strong>${(seqProbs[2] * 100).toFixed(2)}%</strong>.`;
        } else {
            insight.className = "insight-banner success";
            insight.innerHTML = `<strong>High-Confidence Detection:</strong> With prior prevalence ${(prior * 100).toFixed(1)}% and Bayes Factor ${bayesFactor.toFixed(1)}×, a single positive alert already raises the posterior probability to <strong>${(seqProbs[1] * 100).toFixed(2)}%</strong>, reaching <strong>${(seqProbs[2] * 100).toFixed(2)}%</strong> after a second corroborating alert.`;
        }

        const idsData = seqProbs.map(p => +(p * 100).toFixed(2));
        if (chartIdsSeq) {
            chartIdsSeq.data.datasets[0].data = idsData;
            chartIdsSeq.update("none");
        } else {
            const ctxIds = document.getElementById("chart-ids-seq").getContext("2d");
            chartIdsSeq = new Chart(ctxIds, {
                type: "bar",
                data: {
                    labels: ["Prior (0 Alerts)", "After 1st Alert", "After 2nd Alert", "After 3rd Alert", "After 4th Alert"],
                    datasets: [{
                        label: "Posterior Probability P(Attack | Alerts) (%)",
                        data: idsData,
                        backgroundColor: [
                            "rgba(56, 189, 248, 0.55)",
                            "rgba(244, 63, 94, 0.55)",
                            "rgba(168, 85, 247, 0.55)",
                            "rgba(16, 185, 129, 0.55)",
                            "rgba(16, 185, 129, 0.80)"
                        ],
                        borderColor: ["#38bdf8", "#f43f5e", "#a855f7", "#10b981", "#34d399"],
                        borderWidth: 1.8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                        title: { display: true, text: "Sequential Bayesian Updating: Posterior P(H | Data) Across Independent Alerts", color: "#f8fafc" }
                    },
                    scales: {
                        y: { beginAtZero: true, max: 100, title: { display: true, text: "Probability (%)" } }
                    }
                }
            });
        }
    }

    /* =========================================================================
       EVENT LISTENERS & INITIALIZATION
       ========================================================================= */

    // Part 1 Controls
    document.getElementById("conv-dist").addEventListener("change", runConvergenceSimulation);
    document.getElementById("conv-n").addEventListener("input", e => {
        document.getElementById("val-conv-n").textContent = e.target.value;
    });
    document.getElementById("conv-m").addEventListener("input", e => {
        document.getElementById("val-conv-m").textContent = e.target.value;
    });
    document.getElementById("conv-eps").addEventListener("input", e => {
        document.getElementById("val-conv-eps").textContent = parseFloat(e.target.value).toFixed(2);
    });
    document.getElementById("conv-rho").addEventListener("input", e => {
        const v = parseFloat(e.target.value);
        document.getElementById("val-conv-rho").textContent = v === 0 ? "0.00 (i.i.d.)" : v.toFixed(2);
    });
    ["conv-n", "conv-m", "conv-eps", "conv-rho"].forEach(id => {
        document.getElementById(id).addEventListener("change", runConvergenceSimulation);
    });
    document.getElementById("btn-run-conv").addEventListener("click", runConvergenceSimulation);
    document.getElementById("btn-reset-iid").addEventListener("click", () => {
        document.getElementById("conv-rho").value = 0;
        document.getElementById("val-conv-rho").textContent = "0.00 (i.i.d.)";
        runConvergenceSimulation();
    });

    // Part 2A Controls
    document.getElementById("bayes-prior-preset").addEventListener("change", e => {
        const preset = priorPresets[e.target.value];
        if (preset) {
            document.getElementById("bayes-alpha").value = preset[0];
            document.getElementById("bayes-beta").value = preset[1];
            updateBetaBinomialLab();
        }
    });
    ["bayes-alpha", "bayes-beta"].forEach(id => {
        document.getElementById(id).addEventListener("input", () => {
            document.getElementById("bayes-prior-preset").value = "custom";
            updateBetaBinomialLab();
        });
    });
    ["bayes-n", "bayes-k"].forEach(id => {
        document.getElementById(id).addEventListener("input", updateBetaBinomialLab);
    });

    function addSequentialTrials(count, trueTheta = 0.70) {
        const nEl = document.getElementById("bayes-n");
        const kEl = document.getElementById("bayes-k");
        let n = parseInt(nEl.value, 10);
        let k = parseInt(kEl.value, 10);
        const addN = Math.min(count, 200 - n);
        let addK = 0;
        for (let i = 0; i < addN; i++) {
            if (Math.random() < trueTheta) addK++;
        }
        nEl.value = n + addN;
        kEl.max = n + addN;
        kEl.value = k + addK;
        updateBetaBinomialLab();
    }

    document.getElementById("btn-seq-add10").addEventListener("click", () => addSequentialTrials(10, 0.70));
    document.getElementById("btn-seq-add50").addEventListener("click", () => addSequentialTrials(50, 0.70));
    document.getElementById("btn-seq-reset").addEventListener("click", () => {
        document.getElementById("bayes-n").value = 0;
        document.getElementById("bayes-k").max = 0;
        document.getElementById("bayes-k").value = 0;
        updateBetaBinomialLab();
    });

    // Part 2B Controls
    ["ids-prior", "ids-tpr", "ids-fpr"].forEach(id => {
        document.getElementById(id).addEventListener("input", updateIdsBayesLab);
    });

    // Initial render
    runConvergenceSimulation();
    updateBetaBinomialLab();
    updateIdsBayesLab();
});