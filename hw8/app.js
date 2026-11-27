/**
 * hw8/app.js
 * Homework 8: Correlation, Dual Linear Regression (Y|X and X|Y),
 * Geometric Mean Verification, and Independence vs. Uncorrelation Lab.
 */

document.addEventListener("DOMContentLoaded", () => {
    Chart.defaults.color = "#cbd5e1";
    Chart.defaults.font.family = "'Plus Jakarta Sans', 'JetBrains Mono', sans-serif";
    Chart.defaults.scale.grid.color = "rgba(255, 255, 255, 0.06)";

    let chartDualReg = null;
    let chartResiduals = null;
    let chartIndepScatter = null;
    let chartIndepCond = null;

    let currentPoints = [];

    /* =========================================================================
       MATH & STATISTICAL UTILITIES
       ========================================================================= */

    function randNormal() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // Regularized upper incomplete gamma Q(a, x) for exact Chi-Square p-values (df = 9)
    function logGamma(z) {
        const g = 7;
        const p = [
            0.99999999999980993, 676.5203681218851, -1259.1392167224028,
            771.32342877765313, -176.61502916214059, 12.507343278686905,
            -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
        ];
        if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
        z -= 1;
        let x = p[0];
        for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
        const t = z + g + 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
    }

    function gammaPSeries(a, x) {
        const gln = logGamma(a);
        let ap = a;
        let sum = 1.0 / a;
        let del = sum;
        for (let n = 1; n <= 200; n++) {
            ap += 1.0;
            del *= x / ap;
            sum += del;
            if (Math.abs(del) < Math.abs(sum) * 1e-13) break;
        }
        return sum * Math.exp(-x + a * Math.log(x) - gln);
    }

    function gammaQCF(a, x) {
        const gln = logGamma(a);
        let b = x + 1.0 - a;
        let c = 1.0 / 1e-30;
        let d = 1.0 / b;
        let h = d;
        for (let i = 1; i <= 200; i++) {
            const an = -i * (i - a);
            b += 2.0;
            d = an * d + b;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = b + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1.0 / d;
            const del = d * c;
            h *= del;
            if (Math.abs(del - 1.0) < 1e-13) break;
        }
        return Math.exp(-x + a * Math.log(x) - gln) * h;
    }

    function chiSquarePValue(chi2, df) {
        if (chi2 <= 0) return 1.0;
        const a = df / 2.0;
        const x = chi2 / 2.0;
        if (x < a + 1.0) return Math.max(0, Math.min(1, 1.0 - gammaPSeries(a, x)));
        return Math.max(0, Math.min(1, gammaQCF(a, x)));
    }

    /**
     * Core OLS & Pearson Correlation engine for any bivariate dataset.
     * Computes both Y-on-X and X-on-Y regression lines, variance decomposition,
     * signed geometric mean verification, and inter-line angles.
     */
    function analyzeBivariate(points) {
        const n = points.length;
        if (n < 2) return { valid: false, reason: "Provide at least 2 (x, y) data pairs." };

        let sumX = 0, sumY = 0;
        for (const p of points) {
            sumX += p.x;
            sumY += p.y;
        }
        const meanX = sumX / n;
        const meanY = sumY / n;

        let sxx = 0, syy = 0, sxy = 0;
        for (const p of points) {
            const dx = p.x - meanX;
            const dy = p.y - meanY;
            sxx += dx * dx;
            syy += dy * dy;
            sxy += dx * dy;
        }

        const varX = sxx / n;
        const varY = syy / n;
        const covXY = sxy / n;
        const sdX = Math.sqrt(varX);
        const sdY = Math.sqrt(varY);

        if (sxx < 1e-15 || syy < 1e-15) {
            return {
                valid: false,
                reason: "Zero variance detected in X or Y (all values are constant). Both variables must have positive variance to compute Pearson's r and both regression lines."
            };
        }

        const r = sxy / Math.sqrt(sxx * syy);
        const rClamped = Math.max(-1, Math.min(1, r));

        // Regression of Y on X: y_hat = aYonX + bYonX * x
        const bYonX = sxy / sxx;
        const aYonX = meanY - bYonX * meanX;

        // Regression of X on Y: x_hat = aXonY + bXonY * y
        const bXonY = sxy / syy;
        const aXonY = meanX - bXonY * meanY;

        // Signed geometric mean verification
        const prodSlopes = bYonX * bXonY;
        const sign = Math.abs(sxy) < 1e-15 ? 0 : (sxy > 0 ? 1 : -1);
        const geomMean = sign * Math.sqrt(Math.max(0, prodSlopes));
        const geomDiff = Math.abs(r - geomMean);

        // Variance decomposition (Y on X) and residuals
        let tss = syy;
        let ess = 0;
        let rssY = 0;
        let rssX = 0;
        const rows = [];

        for (let i = 0; i < n; i++) {
            const p = points[i];
            const dx = p.x - meanX;
            const dy = p.y - meanY;
            const yHat = aYonX + bYonX * p.x;
            const xHat = aXonY + bXonY * p.y;
            const ey = p.y - yHat;
            const ex = p.x - xHat;
            ess += (yHat - meanY) * (yHat - meanY);
            rssY += ey * ey;
            rssX += ex * ex;
            rows.push({
                index: i + 1,
                x: p.x,
                y: p.y,
                dx, dy,
                dx2: dx * dx,
                dy2: dy * dy,
                dxdy: dx * dy,
                yHat,
                xHat,
                ey,
                ex
            });
        }

        const r2 = ess / tss;

        // Acute angle between the two lines:
        // 1) In standardized coordinates: tan(phi_std) = (1 - r^2) / (2 |r|)
        const absR = Math.abs(rClamped);
        const angleStdDeg = absR < 1e-12
            ? 90.0
            : (Math.atan((1 - absR * absR) / (2 * absR)) * 180) / Math.PI;

        // 2) In raw (x, y) coordinates: angle between direction vectors (1, bYonX) and (bXonY, 1)
        const cosRaw = Math.abs(bYonX + bXonY) / Math.sqrt((1 + bYonX * bYonX) * (1 + bXonY * bXonY));
        const angleRawDeg = (Math.acos(Math.max(0, Math.min(1, cosRaw))) * 180) / Math.PI;

        return {
            valid: true,
            n,
            meanX, meanY,
            varX, varY, covXY,
            sdX, sdY,
            sxx, syy, sxy,
            r,
            r2,
            aYonX, bYonX,
            aXonY, bXonY,
            prodSlopes,
            geomMean,
            geomDiff,
            tss, ess, rssY, rssX,
            angleStdDeg,
            angleRawDeg,
            rows
        };
    }

    /**
     * Liang-Barsky line segment clipper against bounding box [xmin, xmax] x [ymin, ymax].
     * Ensures L_{X|Y} never distorts the scatter plot axes even when nearly vertical.
     */
    function clipSegmentToBox(p0, p1, xmin, xmax, ymin, ymax) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const p = [-dx, dx, -dy, dy];
        const q = [p0.x - xmin, xmax - p0.x, p0.y - ymin, ymax - p0.y];
        let u1 = 0.0;
        let u2 = 1.0;

        for (let i = 0; i < 4; i++) {
            if (Math.abs(p[i]) < 1e-15) {
                if (q[i] < 0) return null;
            } else {
                const t = q[i] / p[i];
                if (p[i] < 0) {
                    if (t > u2) return null;
                    if (t > u1) u1 = t;
                } else {
                    if (t < u1) return null;
                    if (t < u2) u2 = t;
                }
            }
        }
        return [
            { x: p0.x + u1 * dx, y: p0.y + u1 * dy },
            { x: p0.x + u2 * dx, y: p0.y + u2 * dy }
        ];
    }

    function formatSignedEq(lhs, a, b, rhsVar) {
        const signB = b >= 0 ? "+" : "−";
        return `${lhs} = ${a.toFixed(4)} ${signB} ${Math.abs(b).toFixed(4)}·${rhsVar}`;
    }

    function formatSci(num) {
        if (num === 0) return "0.00e+0";
        if (Math.abs(num) < 1e-4) return num.toExponential(2);
        return num.toFixed(6);
    }

    /* =========================================================================
       PRESET DATASETS
       ========================================================================= */

    const PRESETS = {
        cyber_load: [
            { x: 12, y: 24 }, { x: 18, y: 17 }, { x: 25, y: 36 }, { x: 31, y: 28 },
            { x: 38, y: 49 }, { x: 44, y: 39 }, { x: 52, y: 61 }, { x: 58, y: 51 },
            { x: 65, y: 74 }, { x: 73, y: 63 }, { x: 80, y: 85 }, { x: 88, y: 76 },
            { x: 95, y: 94 }, { x: 22, y: 34 }, { x: 48, y: 42 }, { x: 69, y: 79 }
        ],
        cache_latency: [
            { x: 15, y: 92 }, { x: 24, y: 81 }, { x: 32, y: 76 }, { x: 40, y: 65 },
            { x: 48, y: 61 }, { x: 55, y: 49 }, { x: 63, y: 46 }, { x: 70, y: 38 },
            { x: 77, y: 31 }, { x: 84, y: 22 }, { x: 91, y: 17 }, { x: 96, y: 11 },
            { x: 36, y: 68 }, { x: 60, y: 52 }, { x: 80, y: 29 }
        ],
        anscombe1: [
            { x: 10, y: 8.04 }, { x: 8, y: 6.95 }, { x: 13, y: 7.58 }, { x: 9, y: 8.81 },
            { x: 11, y: 8.33 }, { x: 14, y: 9.96 }, { x: 6, y: 7.24 }, { x: 4, y: 4.26 },
            { x: 12, y: 10.84 }, { x: 7, y: 4.82 }, { x: 5, y: 5.68 }
        ],
        anscombe2: [
            { x: 10, y: 9.14 }, { x: 8, y: 8.14 }, { x: 13, y: 8.74 }, { x: 9, y: 8.77 },
            { x: 11, y: 9.26 }, { x: 14, y: 8.10 }, { x: 6, y: 6.13 }, { x: 4, y: 3.10 },
            { x: 12, y: 9.13 }, { x: 7, y: 7.26 }, { x: 5, y: 4.74 }
        ],
        anscombe3: [
            { x: 10, y: 7.46 }, { x: 8, y: 6.77 }, { x: 13, y: 12.74 }, { x: 9, y: 7.11 },
            { x: 11, y: 7.81 }, { x: 14, y: 8.84 }, { x: 6, y: 6.08 }, { x: 4, y: 5.39 },
            { x: 12, y: 8.15 }, { x: 7, y: 6.42 }, { x: 5, y: 5.73 }
        ],
        weak_noise: [
            { x: 1.2, y: 4.8 }, { x: 2.0, y: 2.1 }, { x: 2.8, y: 6.5 }, { x: 3.5, y: 3.9 },
            { x: 4.1, y: 7.2 }, { x: 4.9, y: 2.9 }, { x: 5.5, y: 5.8 }, { x: 6.2, y: 8.4 },
            { x: 6.8, y: 4.3 }, { x: 7.4, y: 6.9 }, { x: 8.1, y: 3.7 }, { x: 8.9, y: 9.1 },
            { x: 9.4, y: 5.4 }, { x: 10.2, y: 7.8 }, { x: 3.1, y: 1.9 }, { x: 7.8, y: 8.6 }
        ],
        parabola: [
            { x: -3, y: 5 }, { x: -2.5, y: 2.25 }, { x: -2, y: 0 }, { x: -1.5, y: -1.75 },
            { x: -1, y: -3 }, { x: -0.5, y: -3.75 }, { x: 0, y: -4 }, { x: 0.5, y: -3.75 },
            { x: 1, y: -3 }, { x: 1.5, y: -1.75 }, { x: 2, y: 0 }, { x: 2.5, y: 2.25 },
            { x: 3, y: 5 }
        ]
    };

    function generateSyntheticPoints(rho, n) {
        const pts = [];
        const sq = Math.sqrt(Math.max(0, 1 - rho * rho));
        for (let i = 0; i < n; i++) {
            const z1 = randNormal();
            const z2 = randNormal();
            const x = 10 + 3 * z1;
            const y = 20 + 5 * (rho * z1 + sq * z2);
            pts.push({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
        }
        return pts;
    }

    function pointsToText(pts) {
        return pts.map(p => `${p.x}, ${p.y}`).join("\n");
    }

    function parsePointsFromText(text) {
        const lines = text.split(/\r?\n/);
        const pts = [];
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith("#")) continue;
            const parts = line.split(/[\s,;]+/).filter(Boolean);
            if (parts.length >= 2) {
                const x = Number(parts[0]);
                const y = Number(parts[1]);
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    pts.push({ x, y });
                }
            }
        }
        return pts;
    }

    /* =========================================================================
       CUSTOM CHART.JS PLUGIN: DRAW VERTICAL OR HORIZONTAL RESIDUAL SEGMENTS
       ========================================================================= */

    const residualSegmentsPlugin = {
        id: "residualSegments",
        beforeDatasetsDraw(chart) {
            const cfg = chart.options.plugins.residualSegments;
            if (!cfg || cfg.mode === "none" || !cfg.rows || cfg.rows.length === 0) return;
            const { ctx, scales: { x, y } } = chart;
            ctx.save();
            ctx.lineWidth = 1.4;
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = cfg.mode === "vertical"
                ? "rgba(56, 189, 248, 0.55)"
                : "rgba(192, 132, 252, 0.55)";

            for (const row of cfg.rows) {
                const px = x.getPixelForValue(row.x);
                const py = y.getPixelForValue(row.y);
                ctx.beginPath();
                ctx.moveTo(px, py);
                if (cfg.mode === "vertical") {
                    ctx.lineTo(px, y.getPixelForValue(row.yHat));
                } else {
                    ctx.lineTo(x.getPixelForValue(row.xHat), py);
                }
                ctx.stroke();
            }
            ctx.restore();
        }
    };

    /* =========================================================================
       PART 3: RENDER DUAL REGRESSION LAB
       ========================================================================= */

    function renderDualRegressionLab() {
        const res = analyzeBivariate(currentPoints);
        const residualMode = document.getElementById("residual-mode").value;
        const verifyBox = document.getElementById("geom-verify-box");
        const verifyBadge = document.getElementById("verify-status-badge");
        const insightEl = document.getElementById("reg-insight");

        if (!res.valid) {
            verifyBox.className = "verify-box warn";
            verifyBadge.className = "badge";
            verifyBadge.textContent = "INVALID DATA";
            document.getElementById("eq-yonx").textContent = "—";
            document.getElementById("sub-yonx").textContent = res.reason;
            document.getElementById("eq-xony").textContent = "—";
            document.getElementById("sub-xony").textContent = "—";
            document.getElementById("ver-r").textContent = "—";
            document.getElementById("ver-prod").textContent = "—";
            document.getElementById("ver-geom").textContent = "—";
            document.getElementById("ver-diff").textContent = "—";
            document.getElementById("kpi-centroid").textContent = `n = ${currentPoints.length}`;
            document.getElementById("kpi-sds").textContent = "—";
            document.getElementById("kpi-cov").textContent = "—";
            document.getElementById("kpi-r2").textContent = "—";
            document.getElementById("kpi-angle").textContent = "—";
            document.getElementById("audit-table-body").innerHTML = "";
            insightEl.className = "insight-banner warn";
            insightEl.textContent = res.reason + " Click directly inside the scatter plot canvas to add points interactively.";

            // Keep an interactive clickable empty/partial scatter plot so users can draw from scratch
            const xsEmpty = currentPoints.map(p => p.x);
            const ysEmpty = currentPoints.map(p => p.y);
            const xMinE = xsEmpty.length ? Math.min(-10, Math.min(...xsEmpty) - 2) : -10;
            const xMaxE = xsEmpty.length ? Math.max(10, Math.max(...xsEmpty) + 2) : 10;
            const yMinE = ysEmpty.length ? Math.min(-10, Math.min(...ysEmpty) - 2) : -10;
            const yMaxE = ysEmpty.length ? Math.max(10, Math.max(...ysEmpty) + 2) : 10;

            const ctxEmpty = document.getElementById("chart-dual-regression").getContext("2d");
            if (chartDualReg) chartDualReg.destroy();
            chartDualReg = new Chart(ctxEmpty, {
                type: "scatter",
                data: {
                    datasets: [{
                        label: "Data Points (click plot to add)",
                        data: currentPoints,
                        backgroundColor: "rgba(226, 232, 240, 0.85)",
                        borderColor: "#6366f1",
                        borderWidth: 1.5,
                        pointRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (evt, _elements, chart) => {
                        const rect = chart.canvas.getBoundingClientRect();
                        const xVal = chart.scales.x.getValueForPixel(evt.native.clientX - rect.left);
                        const yVal = chart.scales.y.getValueForPixel(evt.native.clientY - rect.top);
                        if (Number.isFinite(xVal) && Number.isFinite(yVal)) {
                            currentPoints.push({ x: Number(xVal.toFixed(2)), y: Number(yVal.toFixed(2)) });
                            document.getElementById("dataset-preset").value = "custom";
                            document.getElementById("synth-panel").classList.remove("visible");
                            document.getElementById("raw-data-input").value = pointsToText(currentPoints);
                            renderDualRegressionLab();
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: "Click Anywhere on the Plane to Add (x, y) Points (Need ≥ 2 non-constant points)",
                            color: "#f8fafc",
                            font: { size: 12.5, weight: "700" }
                        },
                        legend: { position: "bottom", labels: { boxWidth: 14, font: { size: 11 } } }
                    },
                    scales: {
                        x: { type: "linear", min: xMinE, max: xMaxE, title: { display: true, text: "Variable X", color: "#94a3b8" } },
                        y: { type: "linear", min: yMinE, max: yMaxE, title: { display: true, text: "Variable Y", color: "#94a3b8" } }
                    }
                }
            });

            if (chartResiduals) { chartResiduals.destroy(); chartResiduals = null; }
            return;
        }

        // Equations strip
        document.getElementById("eq-yonx").textContent = formatSignedEq("ŷ", res.aYonX, res.bYonX, "x");
        document.getElementById("sub-yonx").textContent =
            `a = ${res.aYonX.toFixed(4)},  b(Y|X) = ${res.bYonX.toFixed(4)},  RSS(Y) = ${res.rssY.toFixed(3)}`;

        document.getElementById("eq-xony").textContent = formatSignedEq("x̂", res.aXonY, res.bXonY, "y");
        const invSlopeStr = Math.abs(res.bXonY) < 1e-10
            ? "vertical line x = " + res.meanX.toFixed(3)
            : `equiv. y-slope 1/b(X|Y) = ${(1 / res.bXonY).toFixed(4)}`;
        document.getElementById("sub-xony").textContent =
            `a' = ${res.aXonY.toFixed(4)},  b(X|Y) = ${res.bXonY.toFixed(4)} (${invSlopeStr})`;

        // Verification Box
        const verified = res.geomDiff < 1e-10;
        verifyBox.className = verified ? "verify-box" : "verify-box warn";
        verifyBadge.className = verified ? "badge badge-success" : "badge";
        verifyBadge.textContent = verified ? "IDENTITY VERIFIED" : "CHECK PRECISION";

        document.getElementById("ver-r").textContent = res.r.toFixed(8);
        document.getElementById("ver-prod").textContent = res.prodSlopes.toFixed(8);
        document.getElementById("ver-geom").textContent = res.geomMean.toFixed(8);
        document.getElementById("ver-diff").textContent = formatSci(res.geomDiff);

        // KPIs
        document.getElementById("kpi-centroid").textContent =
            `n=${res.n}  (${res.meanX.toFixed(2)}, ${res.meanY.toFixed(2)})`;
        document.getElementById("kpi-sds").textContent =
            `${res.sdX.toFixed(3)},  ${res.sdY.toFixed(3)}`;
        document.getElementById("kpi-cov").textContent = res.covXY.toFixed(4);
        document.getElementById("kpi-r2").textContent =
            `${(res.r2 * 100).toFixed(2)}% (${res.r2.toFixed(4)})`;
        document.getElementById("kpi-angle").textContent =
            `${res.angleStdDeg.toFixed(2)}°`;

        // Diagnostic Insight Banner
        const absR = Math.abs(res.r);
        if (absR > 0.999) {
            insightEl.className = "insight-banner success";
            insightEl.innerHTML = `<strong>Exact Collinearity ($|r| \\approx 1$):</strong> Both regression lines coincide ($\\phi_{\\text{std}} = ${res.angleStdDeg.toFixed(2)}^\\circ$), $b_{Y|X} = 1 / b_{X|Y}$, and $R^2 = ${(res.r2 * 100).toFixed(2)}\\%$ of the variance in $Y$ is explained linearly by $X$.`;
        } else if (absR < 0.08) {
            insightEl.className = "insight-banner warn";
            insightEl.innerHTML = `<strong>Near-Zero Linear Correlation ($r = ${res.r.toFixed(4)}$):</strong> The two regression lines are nearly perpendicular ($\\phi_{\\text{std}} = ${res.angleStdDeg.toFixed(2)}^\\circ$): $L_{Y|X}$ collapses onto the horizontal mean $y = \\bar{y}$, and $L_{X|Y}$ collapses onto the vertical mean $x = \\bar{x}$. Inspect the residual plot on the right for hidden nonlinear structure!`;
        } else {
            const dir = res.r > 0 ? "positive" : "negative";
            insightEl.className = "insight-banner success";
            insightEl.innerHTML = `<strong>Verified Geometric Mean Identity:</strong> Both lines intersect strictly at the centroid $(\\bar{x}, \\bar{y}) = (${res.meanX.toFixed(2)}, ${res.meanY.toFixed(2)})$ with a ${dir} association ($r = ${res.r.toFixed(4)}$, $R^2 = ${(res.r2 * 100).toFixed(1)}\\%$). The standardized scissors angle is $\\phi_{\\text{std}} = ${res.angleStdDeg.toFixed(2)}^\\circ$ (narrower as $|r| \\to 1$, wider as $|r| \\to 0$).`;
        }
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([insightEl]);
        }

        // Compute padded bounding box from data points
        const xs = currentPoints.map(p => p.x);
        const ys = currentPoints.map(p => p.y);
        const rawXmin = Math.min(...xs), rawXmax = Math.max(...xs);
        const rawYmin = Math.min(...ys), rawYmax = Math.max(...ys);
        const padX = Math.max(0.5, (rawXmax - rawXmin) * 0.14);
        const padY = Math.max(0.5, (rawYmax - rawYmin) * 0.14);
        const xMin = rawXmin - padX, xMax = rawXmax + padX;
        const yMin = rawYmin - padY, yMax = rawYmax + padY;

        // Build clipped line segments for both L_{Y|X} and L_{X|Y}
        const rawLineYonX = [
            { x: xMin, y: res.aYonX + res.bYonX * xMin },
            { x: xMax, y: res.aYonX + res.bYonX * xMax }
        ];
        const lineYonX = clipSegmentToBox(rawLineYonX[0], rawLineYonX[1], xMin, xMax, yMin, yMax) || rawLineYonX;

        // Parametric L_{X|Y}: x = aXonY + bXonY * y (handles bXonY = 0 vertical line cleanly!)
        const rawLineXonY = [
            { x: res.aXonY + res.bXonY * yMin, y: yMin },
            { x: res.aXonY + res.bXonY * yMax, y: yMax }
        ];
        const lineXonY = clipSegmentToBox(rawLineXonY[0], rawLineXonY[1], xMin, xMax, yMin, yMax) || rawLineXonY;

        // Render Chart 1: Dual Regression Scatter Plot
        const ctx1 = document.getElementById("chart-dual-regression").getContext("2d");
        if (chartDualReg) chartDualReg.destroy();
        chartDualReg = new Chart(ctx1, {
            type: "scatter",
            plugins: [residualSegmentsPlugin],
            data: {
                datasets: [
                    {
                        label: "Data Points (x_i, y_i)",
                        data: currentPoints,
                        backgroundColor: "rgba(226, 232, 240, 0.85)",
                        borderColor: "#6366f1",
                        borderWidth: 1.5,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        order: 3
                    },
                    {
                        label: "Y on X (Vertical OLS)",
                        data: lineYonX,
                        type: "line",
                        borderColor: "#38bdf8",
                        backgroundColor: "#38bdf8",
                        borderWidth: 2.6,
                        pointRadius: 0,
                        fill: false,
                        tension: 0,
                        order: 2
                    },
                    {
                        label: "X on Y (Horizontal OLS)",
                        data: lineXonY,
                        type: "line",
                        borderColor: "#c084fc",
                        backgroundColor: "#c084fc",
                        borderWidth: 2.6,
                        borderDash: [7, 5],
                        pointRadius: 0,
                        fill: false,
                        tension: 0,
                        order: 2
                    },
                    {
                        label: "Centroid (x̄, ȳ)",
                        data: [{ x: res.meanX, y: res.meanY }],
                        backgroundColor: "#fbbf24",
                        borderColor: "#090d16",
                        borderWidth: 2,
                        pointStyle: "rectRot",
                        pointRadius: 8,
                        pointHoverRadius: 10,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (evt, _elements, chart) => {
                    const rect = chart.canvas.getBoundingClientRect();
                    const xVal = chart.scales.x.getValueForPixel(evt.native.clientX - rect.left);
                    const yVal = chart.scales.y.getValueForPixel(evt.native.clientY - rect.top);
                    if (Number.isFinite(xVal) && Number.isFinite(yVal)) {
                        currentPoints.push({
                            x: Number(xVal.toFixed(2)),
                            y: Number(yVal.toFixed(2))
                        });
                        document.getElementById("dataset-preset").value = "custom";
                        document.getElementById("synth-panel").classList.remove("visible");
                        document.getElementById("raw-data-input").value = pointsToText(currentPoints);
                        renderDualRegressionLab();
                    }
                },
                plugins: {
                    residualSegments: { mode: residualMode, rows: res.rows },
                    title: {
                        display: true,
                        text: "Dual Regression Lines & Centroid (Click Plot to Add Points)",
                        color: "#f8fafc",
                        font: { size: 13.5, weight: "700" }
                    },
                    legend: { position: "bottom", labels: { boxWidth: 14, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: (${ctx.parsed.x.toFixed(3)}, ${ctx.parsed.y.toFixed(3)})`
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        min: xMin,
                        max: xMax,
                        title: { display: true, text: "Variable X", color: "#94a3b8" }
                    },
                    y: {
                        type: "linear",
                        min: yMin,
                        max: yMax,
                        title: { display: true, text: "Variable Y", color: "#94a3b8" }
                    }
                }
            }
        });

        // Render Chart 2: Residuals e_i = y_i - y_hat_i vs x_i
        const residualPts = res.rows.map(row => ({ x: row.x, y: row.ey }));
        const maxAbsE = Math.max(0.5, ...residualPts.map(p => Math.abs(p.y))) * 1.18;

        const ctx2 = document.getElementById("chart-residuals").getContext("2d");
        if (chartResiduals) chartResiduals.destroy();
        chartResiduals = new Chart(ctx2, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        label: "Vertical Residuals e_i = y_i − ŷ_i",
                        data: residualPts,
                        backgroundColor: "rgba(52, 211, 153, 0.85)",
                        borderColor: "#10b981",
                        borderWidth: 1.4,
                        pointRadius: 4.5
                    },
                    {
                        label: "Zero Mean Line (Σe_i = 0)",
                        data: [{ x: xMin, y: 0 }, { x: xMax, y: 0 }],
                        type: "line",
                        borderColor: "rgba(248, 250, 252, 0.45)",
                        borderDash: [5, 5],
                        borderWidth: 1.5,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Residuals Diagnostic  |  TSS = ${res.tss.toFixed(2)} = ESS (${res.ess.toFixed(2)}) + RSS (${res.rssY.toFixed(2)})`,
                        color: "#f8fafc",
                        font: { size: 12.5, weight: "700" }
                    },
                    legend: { position: "bottom", labels: { boxWidth: 14, font: { size: 11 } } }
                },
                scales: {
                    x: {
                        type: "linear",
                        min: xMin,
                        max: xMax,
                        title: { display: true, text: "Predictor X", color: "#94a3b8" }
                    },
                    y: {
                        type: "linear",
                        min: -maxAbsE,
                        max: maxAbsE,
                        title: { display: true, text: "Residual e_i", color: "#94a3b8" }
                    }
                }
            }
        });

        // Render Audit Table
        const tbody = document.getElementById("audit-table-body");
        let html = "";
        let sumDx = 0, sumDy = 0, sumEy = 0;
        for (const row of res.rows) {
            sumDx += row.dx;
            sumDy += row.dy;
            sumEy += row.ey;
            html += `<tr>
                <td>${row.index}</td>
                <td>${row.x.toFixed(3)}</td>
                <td>${row.y.toFixed(3)}</td>
                <td>${row.dx.toFixed(3)}</td>
                <td>${row.dy.toFixed(3)}</td>
                <td>${row.dx2.toFixed(3)}</td>
                <td>${row.dy2.toFixed(3)}</td>
                <td>${row.dxdy.toFixed(3)}</td>
                <td>${row.yHat.toFixed(3)}</td>
                <td>${row.ey.toFixed(3)}</td>
            </tr>`;
        }
        html += `<tr class="totals-row">
            <td>&Sigma;</td>
            <td>${(res.meanX * res.n).toFixed(2)}</td>
            <td>${(res.meanY * res.n).toFixed(2)}</td>
            <td>${Math.abs(sumDx) < 1e-10 ? "0.000" : sumDx.toFixed(3)}</td>
            <td>${Math.abs(sumDy) < 1e-10 ? "0.000" : sumDy.toFixed(3)}</td>
            <td>${res.sxx.toFixed(3)}</td>
            <td>${res.syy.toFixed(3)}</td>
            <td>${res.sxy.toFixed(3)}</td>
            <td>${(res.meanY * res.n).toFixed(2)}</td>
            <td>${Math.abs(sumEy) < 1e-10 ? "0.000" : sumEy.toFixed(3)}</td>
        </tr>`;
        tbody.innerHTML = html;
    }

    /* =========================================================================
       PART 5: INDEPENDENCE VS. UNCORRELATION SIMULATOR
       ========================================================================= */

    function quantileBinIndex(val, cuts) {
        for (let i = 0; i < cuts.length; i++) {
            if (val <= cuts[i]) return i;
        }
        return cuts.length;
    }

    function runIndependenceLab() {
        const model = document.getElementById("indep-model").value;
        const n = parseInt(document.getElementById("indep-n").value, 10);
        const noise = parseFloat(document.getElementById("indep-noise").value);

        document.getElementById("val-indep-n").textContent = String(n);
        document.getElementById("val-indep-noise").textContent = noise.toFixed(2);

        const pts = [];
        for (let i = 0; i < n; i++) {
            let x, y;
            if (model === "parabola") {
                x = (Math.random() * 4) - 2; // U(-2, 2)
                y = x * x - (4 / 3) + noise * randNormal();
            } else if (model === "circle") {
                const theta = Math.random() * 2 * Math.PI;
                x = Math.cos(theta) + noise * 0.35 * randNormal();
                y = Math.sin(theta) + noise * 0.35 * randNormal();
            } else if (model === "xshape") {
                x = randNormal();
                const sign = Math.random() < 0.5 ? -1 : 1;
                y = sign * x + noise * randNormal();
            } else {
                x = randNormal();
                y = randNormal();
            }
            pts.push({ x, y });
        }

        const res = analyzeBivariate(pts);
        document.getElementById("indep-r").textContent = res.r.toFixed(4);
        document.getElementById("indep-slopes").textContent =
            `${res.bYonX.toFixed(3)},  ${res.bXonY.toFixed(3)}`;

        // 4x4 quantile contingency table Pearson Chi-Square test of independence (df = 9)
        const kBins = 4;
        const sortedX = pts.map(p => p.x).sort((a, b) => a - b);
        const sortedY = pts.map(p => p.y).sort((a, b) => a - b);
        const cutsX = [1, 2, 3].map(q => sortedX[Math.floor((q * n) / kBins)]);
        const cutsY = [1, 2, 3].map(q => sortedY[Math.floor((q * n) / kBins)]);

        const obs = Array.from({ length: kBins }, () => new Array(kBins).fill(0));
        const rowSum = new Array(kBins).fill(0);
        const colSum = new Array(kBins).fill(0);

        for (const p of pts) {
            const rIdx = quantileBinIndex(p.x, cutsX);
            const cIdx = quantileBinIndex(p.y, cutsY);
            obs[rIdx][cIdx]++;
            rowSum[rIdx]++;
            colSum[cIdx]++;
        }

        let chi2 = 0;
        for (let r = 0; r < kBins; r++) {
            for (let c = 0; c < kBins; c++) {
                const exp = (rowSum[r] * colSum[c]) / n;
                if (exp > 0) {
                    const diff = obs[r][c] - exp;
                    chi2 += (diff * diff) / exp;
                }
            }
        }
        const pVal = chiSquarePValue(chi2, (kBins - 1) * (kBins - 1));

        document.getElementById("indep-chi2").textContent = chi2.toFixed(2);
        const pValEl = document.getElementById("indep-pval");
        pValEl.textContent = pVal < 1e-4 ? pVal.toExponential(2) : pVal.toFixed(4);
        pValEl.style.color = pVal < 0.01 ? "#fb7185" : "#34d399";

        // Scatter plot with both flat/vertical OLS lines
        const xs = pts.map(p => p.x);
        const ys = pts.map(p => p.y);
        const padX = (Math.max(...xs) - Math.min(...xs)) * 0.1;
        const padY = (Math.max(...ys) - Math.min(...ys)) * 0.1;
        const xMin = Math.min(...xs) - padX, xMax = Math.max(...xs) + padX;
        const yMin = Math.min(...ys) - padY, yMax = Math.max(...ys) + padY;

        const lYonX = clipSegmentToBox(
            { x: xMin, y: res.aYonX + res.bYonX * xMin },
            { x: xMax, y: res.aYonX + res.bYonX * xMax },
            xMin, xMax, yMin, yMax
        );
        const lXonY = clipSegmentToBox(
            { x: res.aXonY + res.bXonY * yMin, y: yMin },
            { x: res.aXonY + res.bXonY * yMax, y: yMax },
            xMin, xMax, yMin, yMax
        );

        const ctxS = document.getElementById("chart-indep-scatter").getContext("2d");
        if (chartIndepScatter) chartIndepScatter.destroy();
        chartIndepScatter = new Chart(ctxS, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        label: `Sample (n=${n})`,
                        data: pts,
                        backgroundColor: model === "independent"
                            ? "rgba(52, 211, 153, 0.55)"
                            : "rgba(251, 113, 133, 0.55)",
                        borderColor: "transparent",
                        pointRadius: 3.3
                    },
                    {
                        label: "OLS Y on X",
                        data: lYonX || [],
                        type: "line",
                        borderColor: "#38bdf8",
                        borderWidth: 2.3,
                        pointRadius: 0
                    },
                    {
                        label: "OLS X on Y",
                        data: lXonY || [],
                        type: "line",
                        borderColor: "#c084fc",
                        borderDash: [6, 4],
                        borderWidth: 2.3,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Scatter & Dual OLS Lines (r = ${res.r.toFixed(4)})`,
                        color: "#f8fafc",
                        font: { size: 13, weight: "700" }
                    },
                    legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } }
                },
                scales: {
                    x: { type: "linear", min: xMin, max: xMax, title: { display: true, text: "X", color: "#94a3b8" } },
                    y: { type: "linear", min: yMin, max: yMax, title: { display: true, text: "Y", color: "#94a3b8" } }
                }
            }
        });

        // Conditional E[Y | X in bin] & Conditional E[|Y| | X in bin] across 8 bins of X
        // Using both E[Y|X] (detects parabola) and E[|Y||X] (detects circle & X-shape!)
        const nBins = 8;
        const binMin = Math.min(...xs);
        const binMax = Math.max(...xs);
        const width = (binMax - binMin) / nBins || 1;
        const binLabels = [];
        const condMeanY = [];
        const condMeanAbsY = [];

        for (let b = 0; b < nBins; b++) {
            const lo = binMin + b * width;
            const hi = lo + width;
            const bucket = pts.filter(p => (b === nBins - 1 ? p.x >= lo && p.x <= hi : p.x >= lo && p.x < hi));
            binLabels.push(`${((lo + hi) / 2).toFixed(1)}`);
            if (bucket.length > 0) {
                condMeanY.push(bucket.reduce((acc, p) => acc + p.y, 0) / bucket.length);
                condMeanAbsY.push(bucket.reduce((acc, p) => acc + Math.abs(p.y), 0) / bucket.length);
            } else {
                condMeanY.push(null);
                condMeanAbsY.push(null);
            }
        }

        const ctxC = document.getElementById("chart-indep-condmean").getContext("2d");
        if (chartIndepCond) chartIndepCond.destroy();
        chartIndepCond = new Chart(ctxC, {
            type: "line",
            data: {
                labels: binLabels,
                datasets: [
                    {
                        label: "Empirical E[Y | X ∈ bin]",
                        data: condMeanY,
                        borderColor: "#38bdf8",
                        backgroundColor: "rgba(56, 189, 248, 0.2)",
                        borderWidth: 2.5,
                        pointRadius: 4,
                        tension: 0.25
                    },
                    {
                        label: "Empirical E[|Y| | X ∈ bin]",
                        data: condMeanAbsY,
                        borderColor: "#fbbf24",
                        backgroundColor: "rgba(251, 191, 36, 0.2)",
                        borderWidth: 2.5,
                        borderDash: [5, 4],
                        pointRadius: 4,
                        tension: 0.25
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: "Conditional Expectations vs. X (Flat under True Independence)",
                        color: "#f8fafc",
                        font: { size: 13, weight: "700" }
                    },
                    legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } }
                },
                scales: {
                    x: { title: { display: true, text: "X Bin Center", color: "#94a3b8" } },
                    y: { title: { display: true, text: "Conditional Mean", color: "#94a3b8" } }
                }
            }
        });

        const insight = document.getElementById("indep-insight");
        if (model === "independent") {
            insight.className = "insight-banner success";
            insight.innerHTML = `<strong>Truly Independent ($X \\perp\\!\\!\\!\\perp Y$):</strong> As proven in Section 4, independence forces $\\rho = 0$ (sample $r = ${res.r.toFixed(4)}$), both $\\mathbb{E}[Y \\mid X]$ and $\\mathbb{E}[|Y| \\mid X]$ stay flat across $X$, and the $4 \\times 4$ quantile $\\chi^2$ test does not reject independence ($\\chi^2 = ${chi2.toFixed(2)}$, $p = ${pVal.toFixed(4)}$).`;
        } else {
            const desc = model === "parabola"
                ? "Because $X$ is symmetric around $0$, $\\mathbb{E}[X^3] = 0$ cancels the linear covariance completely, yet $\\mathbb{E}[Y \\mid X] = X^2 - 4/3$ bends sharply!"
                : model === "circle"
                ? "Points lie along $X^2 + Y^2 \\approx 1$: linear correlation vanishes ($r \\approx 0$), yet $\\mathbb{E}[|Y| \\mid X] \\approx \\sqrt{1 - X^2}$ reveals unmistakable nonlinear dependence!"
                : "Both $X$ and $Y$ have exact $\\mathcal{N}(0, 1)$ marginals and $\\rho = 0$, yet $|Y| \\approx |X|$ creates a stark V-shape in $\\mathbb{E}[|Y| \\mid X]$—proving marginal normality does not imply joint normality!";
            insight.className = "insight-banner warn";
            insight.innerHTML = `<strong>Uncorrelated Does NOT Imply Independent ($r = ${res.r.toFixed(4)} \\approx 0$):</strong> ${desc} Pearson's $4 \\times 4$ quantile $\\chi^2$ test rejects independence overwhelmingly ($\\chi^2 = ${chi2.toFixed(2)}$, $p = ${pVal < 1e-4 ? pVal.toExponential(2) : pVal.toFixed(4)}$).`;
        }
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([insight]);
        }
    }

    /* =========================================================================
       EVENT LISTENERS & INITIALIZATION
       ========================================================================= */

    function loadPreset(presetKey) {
        const synthPanel = document.getElementById("synth-panel");
        if (presetKey === "synthetic") {
            synthPanel.classList.add("visible");
            const rho = parseFloat(document.getElementById("synth-rho").value);
            const n = parseInt(document.getElementById("synth-n").value, 10);
            document.getElementById("val-synth-rho").textContent = (rho >= 0 ? "+" : "") + rho.toFixed(2);
            document.getElementById("val-synth-n").textContent = String(n);
            currentPoints = generateSyntheticPoints(rho, n);
            document.getElementById("raw-data-input").value = pointsToText(currentPoints);
            renderDualRegressionLab();
        } else if (presetKey === "custom") {
            synthPanel.classList.remove("visible");
        } else {
            synthPanel.classList.remove("visible");
            currentPoints = PRESETS[presetKey].map(p => ({ ...p }));
            document.getElementById("raw-data-input").value = pointsToText(currentPoints);
            renderDualRegressionLab();
        }
    }

    document.getElementById("dataset-preset").addEventListener("change", (e) => {
        loadPreset(e.target.value);
    });

    document.getElementById("residual-mode").addEventListener("change", () => {
        renderDualRegressionLab();
    });

    document.getElementById("synth-rho").addEventListener("input", () => {
        loadPreset("synthetic");
    });
    document.getElementById("synth-n").addEventListener("input", () => {
        loadPreset("synthetic");
    });
    document.getElementById("btn-resample-synth").addEventListener("click", () => {
        loadPreset("synthetic");
    });

    document.getElementById("btn-compute-reg").addEventListener("click", () => {
        const parsed = parsePointsFromText(document.getElementById("raw-data-input").value);
        currentPoints = parsed;
        renderDualRegressionLab();
    });

    document.getElementById("btn-undo-point").addEventListener("click", () => {
        if (currentPoints.length > 0) {
            currentPoints.pop();
            document.getElementById("raw-data-input").value = pointsToText(currentPoints);
            renderDualRegressionLab();
        }
    });

    document.getElementById("btn-clear-points").addEventListener("click", () => {
        currentPoints = [];
        document.getElementById("dataset-preset").value = "custom";
        document.getElementById("synth-panel").classList.remove("visible");
        document.getElementById("raw-data-input").value = "";
        renderDualRegressionLab();
    });

    document.getElementById("csv-upload").addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const parsed = parsePointsFromText(String(reader.result || ""));
            document.getElementById("dataset-preset").value = "custom";
            document.getElementById("synth-panel").classList.remove("visible");
            currentPoints = parsed;
            document.getElementById("raw-data-input").value = pointsToText(currentPoints);
            renderDualRegressionLab();
        };
        reader.readAsText(file);
    });

    // Part 5 listeners
    document.getElementById("indep-model").addEventListener("change", runIndependenceLab);
    document.getElementById("indep-n").addEventListener("input", runIndependenceLab);
    document.getElementById("indep-noise").addEventListener("input", runIndependenceLab);
    document.getElementById("btn-run-indep").addEventListener("click", runIndependenceLab);

    // Boot defaults
    loadPreset("cyber_load");
    runIndependenceLab();
});
