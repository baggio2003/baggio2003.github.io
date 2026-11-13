/**
 * app.js
 * Programmatic Contingency Table Construction, Marginal & Conditional Profiles,
 * Expected Frequencies, Exact Chi-Square p-Value (Lanczos + Lentz), and Chart.js Diagnostics.
 */

document.addEventListener("DOMContentLoaded", () => {

    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.font.family = "'Plus Jakarta Sans', 'JetBrains Mono', sans-serif";
    Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.06)';

    let chartConditional = null;
    let chartChiSqPdf = null;
    let chartResiduals = null;
    let currentAnalysis = null;
    let activeTableView = 'joint';

    /* =========================================================================
       1. PRESET & SYNTHETIC BIVARIATE DATASETS (X, F)
       ========================================================================= */

    const presets = {
        cyber_attack: {
            name: "Attack Vector (X) vs. Target Architecture (F)",
            xLabel: "Attack Vector (X)",
            fLabel: "Target Architecture (F)",
            contextNote: "Empirical SOC telemetry (N = 650 intrusion events). Attack vectors strongly cluster around specific target architectures (e.g., Memory Corruption on Linux/Windows Daemons vs. SQLi/XSS on Web Apps), producing strong statistical dependence. However, this association reflects attacker exploit selection rather than the OS 'causing' the attack vector.",
            csv: [
                "# Format: Attack_Vector_X, Target_Arch_F, Observed_Count",
                "SQL_Injection, Web_Application, 118",
                "SQL_Injection, Linux_Server, 19",
                "SQL_Injection, Windows_Endpoint, 8",
                "SQL_Injection, Cloud_Container, 25",
                "Buffer_Overflow, Web_Application, 12",
                "Buffer_Overflow, Linux_Server, 74",
                "Buffer_Overflow, Windows_Endpoint, 68",
                "Buffer_Overflow, Cloud_Container, 21",
                "Credential_Phishing, Web_Application, 38",
                "Credential_Phishing, Linux_Server, 18",
                "Credential_Phishing, Windows_Endpoint, 105",
                "Credential_Phishing, Cloud_Container, 19",
                "Container_Escape, Web_Application, 9",
                "Container_Escape, Linux_Server, 39",
                "Container_Escape, Windows_Endpoint, 7",
                "Container_Escape, Cloud_Container, 70"
            ].join("\n")
        },

        tls_loss: {
            name: "TLS 1.3 Cipher Suite (X) vs. Network Jitter Tier (F)",
            xLabel: "TLS Cipher Suite (X)",
            fLabel: "Packet Jitter Tier (F)",
            contextNote: "Controlled network benchmark (N = 600 flows). Because symmetric encryption happens at L4/L7 line-rate on hardware AES/ChaCha engines while physical packet jitter arises at L1/L2 routing hops, X and F are genuinely independent. Notice how conditional row profiles closely mirror the marginal distribution and p > alpha (H0 is NOT rejected).",
            csv: [
                "# Format: TLS_Cipher_X, Jitter_Tier_F, Observed_Count",
                "AES_128_GCM, Low_Jitter (<5ms), 112",
                "AES_128_GCM, Med_Jitter (5-20ms), 66",
                "AES_128_GCM, High_Jitter (>20ms), 22",
                "AES_256_GCM, Low_Jitter (<5ms), 106",
                "AES_256_GCM, Med_Jitter (5-20ms), 71",
                "AES_256_GCM, High_Jitter (>20ms), 23",
                "ChaCha20_Poly1305, Low_Jitter (<5ms), 115",
                "ChaCha20_Poly1305, Med_Jitter (5-20ms), 63",
                "ChaCha20_Poly1305, High_Jitter (>20ms), 22"
            ].join("\n")
        },

        confounded_waf: {
            name: "WAF Rule Strictness (X) vs. Breach Incidence (F) [Confounded]",
            xLabel: "WAF Policy Mode (X)",
            fLabel: "Security Outcome (F)",
            contextNote: "Classic Confounding Example (Association != Causality): Looking at this bivariate table alone, 'Strict_Paranoid_WAF' shows a higher breach rate than 'Permissive_WAF' (Chi-square rejects H0!). Does strict WAF policy CAUSE breaches? No: 'Server Criticality / Public Exposure (Z)' is a common-cause confounder—high-value targets deploy strict WAFs AND attract 10x more APT attacks.",
            csv: [
                "# Confounded observational data: X = WAF_Mode, F = Outcome",
                "Permissive_Mode, No_Breach, 265",
                "Permissive_Mode, Breach_Detected, 25",
                "Balanced_Mode, No_Breach, 210",
                "Balanced_Mode, Breach_Detected, 45",
                "Strict_Paranoid_Mode, No_Breach, 155",
                "Strict_Paranoid_Mode, Breach_Detected, 65"
            ].join("\n")
        }
    };

    function generateMonteCarloCSV(N, lambda) {
        const xCats = ["Node_Alpha", "Node_Beta", "Node_Gamma"];
        const fCats = ["State_Idle", "State_Active", "State_Overload"];
        const pX = [0.40, 0.35, 0.25];
        const pF = [0.50, 0.35, 0.15];

        const counts = {};
        xCats.forEach(x => {
            counts[x] = {};
            fCats.forEach(f => counts[x][f] = 0);
        });

        const sampleDiscrete = (probs) => {
            const u = Math.random();
            let cum = 0;
            for (let i = 0; i < probs.length; i++) {
                cum += probs[i];
                if (u <= cum) return i;
            }
            return probs.length - 1;
        };

        // Generate N individual bivariate pairs (x_k, f_k)
        const rawPreview = [];
        for (let k = 0; k < N; k++) {
            const ix = sampleDiscrete(pX);
            let iy;
            if (Math.random() < lambda) {
                // Inject structured dependence (diagonal coupling X_i -> F_i)
                iy = ix;
            } else {
                // Independent draw from marginal P(F)
                iy = sampleDiscrete(pF);
            }
            const xVal = xCats[ix];
            const fVal = fCats[iy];
            counts[xVal][fVal]++;
            if (k < 8) rawPreview.push(`# Sample #${k+1}: (${xVal}, ${fVal})`);
        }

        const lines = [
            `# Monte Carlo Bivariate Stream: N = ${N}, Coupling lambda = ${lambda.toFixed(2)}`,
            ...rawPreview
        ];
        xCats.forEach(x => {
            fCats.forEach(f => {
                lines.push(`${x}, ${f}, ${counts[x][f]}`);
            });
        });
        return lines.join("\n");
    }

    /* =========================================================================
       2. MATHEMATICAL SPECIAL FUNCTIONS: GAMMA, CHI-SQUARE PDF, P-VALUE & CRIT
       ========================================================================= */

    // Lanczos approximation for ln(Gamma(z))
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

    // Regularized Lower Incomplete Gamma P(a, x) via Power Series
    function gammaSeriesP(a, x) {
        if (x <= 0) return 0;
        let ap = a;
        let sum = 1.0 / a;
        let del = sum;
        for (let n = 1; n <= 300; n++) {
            ap += 1;
            del *= x / ap;
            sum += del;
            if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
        }
        return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    }

    // Regularized Upper Incomplete Gamma Q(a, x) via Lentz's Continued Fraction
    function gammaContinuedFractionQ(a, x) {
        const FPMIN = 1e-300;
        let b = x + 1.0 - a;
        let c = 1.0 / FPMIN;
        let d = 1.0 / b;
        let h = d;
        for (let i = 1; i <= 300; i++) {
            const an = -i * (i - a);
            b += 2.0;
            d = an * d + b;
            if (Math.abs(d) < FPMIN) d = FPMIN;
            c = b + an / c;
            if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1.0 / d;
            const del = d * c;
            h *= del;
            if (Math.abs(del - 1.0) < 1e-14) break;
        }
        return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
    }

    // Exact Upper-Tail p-value for Chi-Square(df)
    function chiSquarePValue(chi2, df) {
        if (chi2 <= 0 || df <= 0) return 1.0;
        const a = df / 2.0;
        const x = chi2 / 2.0;
        if (x < a + 1.0) {
            return Math.max(0, 1.0 - gammaSeriesP(a, x));
        } else {
            return Math.max(0, gammaContinuedFractionQ(a, x));
        }
    }

    // Chi-Square Probability Density Function f(x; df)
    function chiSquarePDF(x, df) {
        if (x <= 0) return df === 2 ? 0.5 : 0;
        const a = df / 2.0;
        const logPdf = (a - 1.0) * Math.log(x) - (x / 2.0) - a * Math.log(2.0) - logGamma(a);
        return Math.exp(logPdf);
    }

    // Inverse Standard Normal Quantile (Acklam's Rational Approximation)
    function normInv(p) {
        const a1 = -39.6968302866538, a2 = 220.946098424521, a3 = -275.928510446969;
        const a4 = 138.357751867269, a5 = -30.6647980661472, a6 = 2.50662827745924;
        const b1 = -54.4760987982241, b2 = 161.585836858041, b3 = -155.698979859887;
        const b4 = 66.8013118877197, b5 = -13.2806815528857;
        const q = p - 0.5;
        if (Math.abs(q) <= 0.425) {
            const r = 0.180625 - q * q;
            return q * (((((a6 * r + a5) * r + a4) * r + a3) * r + a2) * r + a1) /
                       (((((b5 * r + b4) * r + b3) * r + b2) * r + b1) * r + 1);
        }
        const r = Math.sqrt(-Math.log(p < 0.5 ? p : 1 - p));
        const z = (2.32121276858 - 0.856563019 * r) / (1 + 0.72023762 * r);
        return p < 0.5 ? -z : z;
    }

    // Critical Value Chi^2_{1 - alpha, df} via Wilson-Hilferty + Newton-Raphson
    function chiSquareCriticalValue(alpha, df) {
        if (df <= 0) return 0;
        const z = normInv(1 - alpha);
        // Wilson-Hilferty initial guess
        let x = df * Math.pow(Math.max(0.01, 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df))), 3);
        for (let iter = 0; iter < 25; iter++) {
            const p = chiSquarePValue(x, df);
            const err = p - alpha;
            if (Math.abs(err) < 1e-11) break;
            const pdf = Math.max(1e-15, chiSquarePDF(x, df));
            x = Math.max(1e-6, x + err / pdf);
        }
        return x;
    }

    /* =========================================================================
       3. PROGRAMMATIC CONTINGENCY TABLE & INDEPENDENCE ENGINE
       ========================================================================= */

    function parseAndAnalyzeBivariate(rawText) {
        const lines = rawText.split(/\r?\n/);
        const xSet = new Set();
        const fSet = new Set();
        const records = [];

        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith("#")) continue;
            const parts = line.split(/[,\t;]+/).map(s => s.trim()).filter(Boolean);
            if (parts.length < 2) continue;

            const x = parts[0];
            const f = parts[1];
            const w = parts.length >= 3 && !isNaN(parseFloat(parts[2])) ? parseFloat(parts[2]) : 1;
            if (w <= 0) continue;

            xSet.add(x);
            fSet.add(f);
            records.push({ x, f, w });
        }

        const xCats = Array.from(xSet);
        const fCats = Array.from(fSet);
        const R = xCats.length;
        const C = fCats.length;

        // Initialize R x C joint frequency matrix and marginals
        const jointCounts = Array.from({ length: R }, () => new Float64Array(C));
        const rowMarginals = new Float64Array(R);
        const colMarginals = new Float64Array(C);
        let N = 0;

        const xIndex = Object.fromEntries(xCats.map((v, i) => [v, i]));
        const fIndex = Object.fromEntries(fCats.map((v, j) => [v, j]));

        // Single-pass programmatic aggregation
        for (const { x, f, w } of records) {
            const i = xIndex[x];
            const j = fIndex[f];
            jointCounts[i][j] += w;
            rowMarginals[i] += w;
            colMarginals[j] += w;
            N += w;
        }

        // Compute Joint Relative, Conditional Row/Col Profiles, Expected, Residuals, Chi2, G2, MI
        const jointRel = Array.from({ length: R }, () => new Float64Array(C));
        const condRow = Array.from({ length: R }, () => new Float64Array(C));
        const condCol = Array.from({ length: R }, () => new Float64Array(C));
        const expected = Array.from({ length: R }, () => new Float64Array(C));
        const residuals = Array.from({ length: R }, () => new Float64Array(C));

        let chi2 = 0;
        let g2 = 0;
        let mutualInfo = 0;

        for (let i = 0; i < R; i++) {
            for (let j = 0; j < C; j++) {
                const O_ij = jointCounts[i][j];
                const E_ij = N > 0 ? (rowMarginals[i] * colMarginals[j]) / N : 0;

                jointRel[i][j] = N > 0 ? O_ij / N : 0;
                condRow[i][j] = rowMarginals[i] > 0 ? O_ij / rowMarginals[i] : 0;
                condCol[i][j] = colMarginals[j] > 0 ? O_ij / colMarginals[j] : 0;
                expected[i][j] = E_ij;

                if (E_ij > 0) {
                    const r_ij = (O_ij - E_ij) / Math.sqrt(E_ij);
                    residuals[i][j] = r_ij;
                    chi2 += r_ij * r_ij;
                }
                if (O_ij > 0 && E_ij > 0) {
                    g2 += 2.0 * O_ij * Math.log(O_ij / E_ij);
                    const p_ij = O_ij / N;
                    const p_i = rowMarginals[i] / N;
                    const p_j = colMarginals[j] / N;
                    mutualInfo += p_ij * Math.log2(p_ij / (p_i * p_j));
                }
            }
        }

        const df = Math.max(1, (R - 1) * (C - 1));
        const pValue = chiSquarePValue(chi2, df);
        const minDim = Math.max(1, Math.min(R - 1, C - 1));
        const cramersV = N > 0 ? Math.sqrt(chi2 / (N * minDim)) : 0;

        return {
            xCats, fCats, R, C, N,
            jointCounts, jointRel,
            rowMarginals, colMarginals,
            condRow, condCol,
            expected, residuals,
            chi2, df, pValue, cramersV, g2, mutualInfo
        };
    }

    /* =========================================================================
       4. UI RENDERING: CONTINGENCY TABLES, KPI CARDS & VERDICT
       ========================================================================= */

    function renderContingencyTable(res, viewMode) {
        const thead = document.getElementById("contingency-thead");
        const tbody = document.getElementById("contingency-tbody");
        const desc = document.getElementById("table-view-description");

        const descriptions = {
            joint: "Showing Joint Absolute Frequencies n_ij and Joint Relative Frequencies p_ij = n_ij / N, bordered by Row Marginals n_{i.} and Column Marginals n_{.j}.",
            row_cond: "Showing Conditional Row Profiles P(F = f_j | X = x_i) = n_ij / n_{i.}. Under statistical independence, every row profile must match the bottom Marginal P(F = f_j) row.",
            col_cond: "Showing Conditional Column Profiles P(X = x_i | F = f_j) = n_ij / n_{.j}. Under statistical independence, every column profile must match the rightmost Marginal P(X = x_i) column.",
            expected: "Showing Observed (O_ij) vs. Expected under Independence E_ij = (n_{i.} * n_{.j}) / N, with standardized Pearson residuals r_ij = (O_ij - E_ij) / sqrt(E_ij)."
        };
        desc.textContent = descriptions[viewMode];

        // Header Row
        let headHTML = `<tr><th>X \\ F</th>`;
        res.fCats.forEach(f => {
            headHTML += `<th>${f}</th>`;
        });
        headHTML += `<th class="marginal-col">${viewMode === 'row_cond' ? 'Row Sum' : 'Marginal X (n_{i.})'}</th></tr>`;
        thead.innerHTML = headHTML;

        // Body Rows
        let bodyHTML = "";
        for (let i = 0; i < res.R; i++) {
            bodyHTML += `<tr><td>${res.xCats[i]}</td>`;
            for (let j = 0; j < res.C; j++) {
                const O = res.jointCounts[i][j];
                const E = res.expected[i][j];
                const pJoint = (res.jointRel[i][j] * 100).toFixed(2);
                const pRow = (res.condRow[i][j] * 100).toFixed(2);
                const pCol = (res.condCol[i][j] * 100).toFixed(2);
                const r = res.residuals[i][j];

                if (viewMode === 'joint') {
                    bodyHTML += `<td>
                        <span style="color:#f8fafc; font-weight:700;">${O}</span>
                        <span class="cell-sub">${pJoint}% of N</span>
                    </td>`;
                } else if (viewMode === 'row_cond') {
                    const diffFromMarg = (res.condRow[i][j] - (res.colMarginals[j] / res.N)) * 100;
                    const diffSign = diffFromMarg >= 0 ? "+" : "";
                    bodyHTML += `<td>
                        <span style="color:#38bdf8; font-weight:700;">${pRow}%</span>
                        <span class="cell-sub">${O} / ${res.rowMarginals[i]} (${diffSign}${diffFromMarg.toFixed(1)}% vs marg)</span>
                    </td>`;
                } else if (viewMode === 'col_cond') {
                    const diffFromMarg = (res.condCol[i][j] - (res.rowMarginals[i] / res.N)) * 100;
                    const diffSign = diffFromMarg >= 0 ? "+" : "";
                    bodyHTML += `<td>
                        <span style="color:#c084fc; font-weight:700;">${pCol}%</span>
                        <span class="cell-sub">${O} / ${res.colMarginals[j]} (${diffSign}${diffFromMarg.toFixed(1)}% vs marg)</span>
                    </td>`;
                } else if (viewMode === 'expected') {
                    const absR = Math.abs(r);
                    let badgeBg = "rgba(148, 163, 184, 0.15)";
                    let badgeCol = "#cbd5e1";
                    if (r >= 1.96) { badgeBg = "rgba(16, 185, 129, 0.22)"; badgeCol = "#6ee7b7"; }
                    else if (r <= -1.96) { badgeBg = "rgba(244, 63, 94, 0.22)"; badgeCol = "#fda4af"; }
                    else if (absR >= 1.0) { badgeBg = "rgba(245, 158, 11, 0.20)"; badgeCol = "#fcd34d"; }

                    bodyHTML += `<td>
                        <span style="color:#f8fafc;">O: <strong>${O}</strong></span> &bull; <span style="color:#38bdf8;">E: <strong>${E.toFixed(2)}</strong></span>
                        <br><span class="res-badge" style="background:${badgeBg}; color:${badgeCol};">r = ${r >= 0 ? "+" : ""}${r.toFixed(2)} (r²=${(r*r).toFixed(2)})</span>
                    </td>`;
                }
            }

            // Rightmost Marginal Column
            const rowMargPct = ((res.rowMarginals[i] / res.N) * 100).toFixed(2);
            if (viewMode === 'row_cond') {
                bodyHTML += `<td class="marginal-col">100.00%<span class="cell-sub">(n_{i.} = ${res.rowMarginals[i]})</span></td>`;
            } else {
                bodyHTML += `<td class="marginal-col">${res.rowMarginals[i]}<span class="cell-sub">P(X=${res.xCats[i]}) = ${rowMargPct}%</span></td>`;
            }
            bodyHTML += `</tr>`;
        }

        // Bottom Marginal Row
        bodyHTML += `<tr class="marginal-row"><td>${viewMode === 'row_cond' ? 'Marginal P(F = f_j)' : 'Marginal F (n_{.j})'}</td>`;
        for (let j = 0; j < res.C; j++) {
            const colMargPct = ((res.colMarginals[j] / res.N) * 100).toFixed(2);
            if (viewMode === 'col_cond') {
                bodyHTML += `<td>100.00%<span class="cell-sub">(n_{.j} = ${res.colMarginals[j]})</span></td>`;
            } else if (viewMode === 'row_cond') {
                bodyHTML += `<td><span style="color:#fcd34d;">${colMargPct}%</span><span class="cell-sub">Baseline P(F)</span></td>`;
            } else {
                bodyHTML += `<td>${res.colMarginals[j]}<span class="cell-sub">P(F=${res.fCats[j]}) = ${colMargPct}%</span></td>`;
            }
        }
        bodyHTML += `<td class="marginal-col">N = ${res.N}<span class="cell-sub">100.00%</span></td></tr>`;
        tbody.innerHTML = bodyHTML;
    }

    /* =========================================================================
       5. CHART.JS DIAGNOSTIC PLOTS
       ========================================================================= */

    function renderCharts(res, alpha, critVal) {
        const palette = ['#38bdf8', '#a855f7', '#10b981', '#f59e0b', '#f43f5e', '#6366f1'];

        // 1. Conditional Profile Chart: P(F = f_j | X = x_i) vs Marginal P(F = f_j)
        const ctxCond = document.getElementById("chart-conditional").getContext("2d");
        if (chartConditional) chartConditional.destroy();

        const datasetsCond = res.xCats.map((xCat, i) => ({
            type: 'bar',
            label: `P(F | X = ${xCat})`,
            data: res.fCats.map((_, j) => +(res.condRow[i][j] * 100).toFixed(2)),
            backgroundColor: palette[i % palette.length] + '88',
            borderColor: palette[i % palette.length],
            borderWidth: 1.5
        }));

        // Add Marginal P(F) line for visual independence check
        datasetsCond.push({
            type: 'line',
            label: 'Marginal P(F) [Independence Baseline]',
            data: res.fCats.map((_, j) => +((res.colMarginals[j] / res.N) * 100).toFixed(2)),
            borderColor: '#f8fafc',
            borderDash: [6, 4],
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#f59e0b'
        });

        chartConditional = new Chart(ctxCond, {
            data: { labels: res.fCats, datasets: datasetsCond },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Conditional Row Profiles P(F | X) vs. Marginal P(F)',
                        color: '#f8fafc'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Probability (%)' }
                    }
                }
            }
        });

        // 2. Chi-Square PDF, Critical Region & Observed Statistic
        const ctxPdf = document.getElementById("chart-chisq-pdf").getContext("2d");
        if (chartChiSqPdf) chartChiSqPdf.destroy();

        const maxPlotX = Math.max(critVal * 1.6, Math.min(res.chi2 * 1.15, critVal * 3.5), res.df + 4 * Math.sqrt(2 * res.df), 12);
        const steps = 160;
        const pdfCurve = [];
        const critRegion = [];

        for (let k = 0; k <= steps; k++) {
            const x = (k / steps) * maxPlotX;
            const y = chiSquarePDF(x, res.df);
            const yCapped = Math.min(y, 1.0);
            pdfCurve.push({ x, y: yCapped });
            critRegion.push({ x, y: x >= critVal ? yCapped : null });
        }

        const obsPlotX = Math.min(res.chi2, maxPlotX * 0.98);
        const obsPlotY = Math.min(chiSquarePDF(obsPlotX, res.df), 1.0);

        chartChiSqPdf = new Chart(ctxPdf, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: `χ² Density (df = ${res.df})`,
                        data: pdfCurve,
                        borderColor: '#38bdf8',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.3
                    },
                    {
                        label: `Rejection Region (α = ${alpha}, χ² ≥ ${critVal.toFixed(2)})`,
                        data: critRegion,
                        borderColor: '#f43f5e',
                        backgroundColor: 'rgba(244, 63, 94, 0.35)',
                        fill: true,
                        pointRadius: 0
                    },
                    {
                        type: 'scatter',
                        label: `Observed χ² = ${res.chi2.toFixed(2)}${res.chi2 > maxPlotX ? ' (clamped to right edge)' : ''}`,
                        data: [{ x: obsPlotX, y: obsPlotY }],
                        backgroundColor: res.chi2 >= critVal ? '#f43f5e' : '#10b981',
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        pointRadius: 7
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Asymptotic χ²(${res.df}) Null Distribution & Critical Threshold`,
                        color: '#f8fafc'
                    }
                },
                scales: {
                    x: { type: 'linear', min: 0, max: maxPlotX, title: { display: true, text: 'χ² Value' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Density f(x)' } }
                }
            }
        });

        // 3. Standardized Pearson Residuals r_ij per Cell
        const ctxRes = document.getElementById("chart-residuals").getContext("2d");
        if (chartResiduals) chartResiduals.destroy();

        const cellLabels = [];
        const cellResiduals = [];
        const cellColors = [];

        for (let i = 0; i < res.R; i++) {
            for (let j = 0; j < res.C; j++) {
                cellLabels.push(`${res.xCats[i]} × ${res.fCats[j]}`);
                const r = res.residuals[i][j];
                cellResiduals.push(+r.toFixed(3));
                cellColors.push(r >= 0 ? 'rgba(16, 185, 129, 0.65)' : 'rgba(244, 63, 94, 0.65)');
            }
        }

        chartResiduals = new Chart(ctxRes, {
            type: 'bar',
            data: {
                labels: cellLabels,
                datasets: [{
                    label: 'Standardized Pearson Residual r_ij = (O_ij - E_ij) / √E_ij',
                    data: cellResiduals,
                    backgroundColor: cellColors,
                    borderColor: cellResiduals.map(r => r >= 0 ? '#10b981' : '#f43f5e'),
                    borderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Cell-by-Cell Pearson Residuals r_ij (|r_ij| > 1.96 indicates significant local departure from Independence)',
                        color: '#f8fafc'
                    }
                },
                scales: {
                    y: { title: { display: true, text: 'Pearson Residual (r_ij)' } }
                }
            }
        });
    }

    /* =========================================================================
       6. MASTER CONTROLLER & EVENT LISTENERS
       ========================================================================= */

    function executePipeline() {
        const rawText = document.getElementById("raw-data-input").value;
        const alpha = parseFloat(document.getElementById("alpha-select").value);
        const presetKey = document.getElementById("preset-select").value;

        const res = parseAndAnalyzeBivariate(rawText);
        currentAnalysis = res;

        const critVal = chiSquareCriticalValue(alpha, res.df);
        const isDependent = res.chi2 >= critVal;

        // Update Meta & KPIs
        document.getElementById("dataset-meta-badge").textContent = `${res.R} × ${res.C} Matrix (N = ${res.N})`;
        document.getElementById("stat-n-grid").textContent = `${res.N} (${res.R}×${res.C})`;
        document.getElementById("stat-chi2").textContent = res.chi2.toFixed(4);
        document.getElementById("stat-df").textContent = `${res.df}`;
        document.getElementById("stat-crit").textContent = critVal.toFixed(4);
        document.getElementById("stat-pvalue").textContent = res.pValue < 1e-4 ? res.pValue.toExponential(3) : res.pValue.toFixed(5);
        document.getElementById("stat-pvalue").style.color = isDependent ? "#fb7185" : "#34d399";
        document.getElementById("stat-cramers").textContent = res.cramersV.toFixed(4);
        document.getElementById("stat-g2").textContent = res.g2.toFixed(4);
        document.getElementById("stat-mi").textContent = res.mutualInfo.toFixed(4);

        // Update Verdict Banner
        const verdictBox = document.getElementById("verdict-box");
        const verdictTitle = document.getElementById("verdict-title");
        const verdictText = document.getElementById("verdict-text");

        let effectDesc = "negligible";
        if (res.cramersV >= 0.5) effectDesc = "strong";
        else if (res.cramersV >= 0.3) effectDesc = "moderate";
        else if (res.cramersV >= 0.1) effectDesc = "weak-to-moderate";

        const scenarioNote = presets[presetKey] ? `<br><br><strong>Scenario Context:</strong> ${presets[presetKey].contextNote}` : "";

        if (isDependent) {
            verdictBox.className = "verdict-banner dependent";
            verdictTitle.innerHTML = `Reject Null Hypothesis $H_0$ — Variables $X$ and $F$ are <strong>Statistically Dependent</strong> ($\chi^2 = ${res.chi2.toFixed(3)} \ge \chi^2_{\\text{crit}} = ${critVal.toFixed(3)}$)`;
            verdictText.innerHTML = `Because $p\\text{-value} = ${res.pValue < 1e-4 ? res.pValue.toExponential(2) : res.pValue.toFixed(5)} < \\alpha = ${alpha}$, the discrepancy between observed counts $n_{ij}$ and independence-expected counts $E_{ij}$ is statistically significant. Cramér's $V = ${res.cramersV.toFixed(3)}$ indicates a <strong>${effectDesc} statistical association</strong>. <em>Reminder: statistical association does not prove direct causality $X \\to F$ without ruling out confounders $Z$.</em>${scenarioNote}`;
        } else {
            verdictBox.className = "verdict-banner";
            verdictTitle.innerHTML = `Fail to Reject $H_0$ — Data is Consistent with <strong>Statistical Independence</strong> ($\chi^2 = ${res.chi2.toFixed(3)} < \chi^2_{\\text{crit}} = ${critVal.toFixed(3)}$)`;
            verdictText.innerHTML = `Because $p\\text{-value} = ${res.pValue.toFixed(5)} \\ge \\alpha = ${alpha}$, the observed deviations $(n_{ij} - E_{ij})$ are fully explainable by random finite-sample fluctuations under $H_0: \\pi_{ij} = \\pi_{i\\cdot}\\pi_{\\cdot j}$. Conditional profiles $P(F \\mid X = x_i)$ align closely with the marginal $P(F)$ (Cramér's $V = ${res.cramersV.toFixed(3)}$).${scenarioNote}`;
        }

        renderContingencyTable(res, activeTableView);
        renderCharts(res, alpha, critVal);

        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([verdictBox]);
        }
    }

    // Preset Selection Handler
    const presetSelect = document.getElementById("preset-select");
    const mcNGroup = document.getElementById("mc-n-group");
    const mcLambdaGroup = document.getElementById("mc-lambda-group");
    const btnResampleMc = document.getElementById("btn-resample-mc");
    const rawInput = document.getElementById("raw-data-input");

    function updatePresetInput() {
        const key = presetSelect.value;
        const isMC = key === "montecarlo";
        mcNGroup.style.display = isMC ? "flex" : "none";
        mcLambdaGroup.style.display = isMC ? "flex" : "none";
        btnResampleMc.style.display = isMC ? "inline-flex" : "none";

        if (isMC) {
            const N = parseInt(document.getElementById("mc-n").value, 10);
            const lambda = parseFloat(document.getElementById("mc-lambda").value);
            rawInput.value = generateMonteCarloCSV(N, lambda);
        } else if (presets[key]) {
            rawInput.value = presets[key].csv;
        }
        executePipeline();
    }

    presetSelect.addEventListener("change", updatePresetInput);
    document.getElementById("alpha-select").addEventListener("change", executePipeline);
    document.getElementById("btn-run-analysis").addEventListener("click", executePipeline);
    btnResampleMc.addEventListener("click", updatePresetInput);

    document.getElementById("mc-n").addEventListener("input", (e) => {
        document.getElementById("val-mc-n").textContent = e.target.value;
        updatePresetInput();
    });

    document.getElementById("mc-lambda").addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById("val-mc-lambda").textContent = val === 0 ? "0.00 (Pure H0)" : val.toFixed(2);
        updatePresetInput();
    });

    // Table View Tabs
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeTableView = btn.getAttribute("data-view");
            if (currentAnalysis) renderContingencyTable(currentAnalysis, activeTableView);
        });
    });

    // Initial Load
    updatePresetInput();
});