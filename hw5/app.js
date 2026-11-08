/**
 * app.js
 * Advanced Statistical Integration & Floating-Point Analysis.
 */

document.addEventListener("DOMContentLoaded", () => {

    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.font.family = "'Plus Jakarta Sans', 'JetBrains Mono', sans-serif";
    Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
    Chart.defaults.scale.grid.borderColor = 'rgba(255, 255, 255, 0.1)';
    
    let chartRiemann = null;
    let chartLebesgue = null;
    let chartNormMain = null;
    let chartNormError = null;

    /* =========================================================================
       EXERCISE 1: RIEMANN VS LEBESGUE
       ========================================================================= */
    
    const functionsLib = {
        'sin': { fn: x => Math.sin(x), domain: [0, Math.PI], exact: 2, desc: '<strong>Analysis: Smooth Continuous.</strong> Both methods map accurately. Riemann slices the X-axis evenly. Lebesgue maps the Y-range [0,1], showing highest measure density around y=1 (where the sine wave flattens).' },
        'x2': { fn: x => x * x, domain: [0, 1], exact: 1/3, desc: '<strong>Analysis: Standard Polynomial.</strong> Equivalent convergence. Lebesgue measure density decreases as Y increases because the parabola steepens.' },
        'step1': { fn: x => x < 0.5 ? 1 : 3, domain: [0, 1], exact: 2, desc: '<strong>Analysis: Step Function.</strong> Look at the Lebesgue chart: the entire range is localized into exactly two massive bars at Y=1 and Y=3, each with measure 0.5. Pure conceptual superiority.' },
        'invsqrt': { fn: x => x === 0 ? 0 : 1 / Math.sqrt(x), domain: [0, 1], exact: 2, desc: '<strong>Analysis: Improper Singularity.</strong> Lebesgue handles the asymptote by distributing infinitesimal measures to infinite Y-values, gracefully calculating the finite area.' },
        'sinc': { fn: x => x === 0 ? 1 : Math.sin(x) / x, domain: [0, Math.PI], exact: 1.851937051982, desc: '<strong>Analysis: Removable Singularity.</strong> Both numerical approximations handle the $x \to 0$ limit robustly in standard IEEE-754.' },
        'dirichlet': { 
            fn: x => (Math.abs((x * 10000) % 1) < 1e-4) ? 1 : 0, 
            domain: [0, 1], exact: 0, 
            desc: '<strong>Analysis: Pathological (Dirichlet).</strong> Riemann Darboux bounds fail. Lebesgue evaluates the exact measure of rationals ($\mu=0$) and irrationals ($\mu=1$), outputting 0. Look at the Lebesgue chart: all measure is concentrated at Y=0.' 
        },
        'thomae': { 
            fn: x => {
                if (x === 0) return 1;
                for(let q = 1; q <= 200; q++) {
                    let p = Math.round(x * q);
                    if (Math.abs(x - p/q) < 1e-6) return 1/q;
                }
                return 0;
            }, 
            domain: [0, 1], exact: 0, 
            desc: '<strong>Analysis: Pathological (Thomae).</strong> Riemann sums oscillate chaotically. Lebesgue cleanly bypasses the infinite discontinuities by isolating the zero-measure rational peaks.' 
        }
    };

    function computeRiemann(funcObj, N) {
        const [a, b] = funcObj.domain;
        const f = funcObj.fn;
        const dx = (b - a) / N;
        let sum = 0;
        const t0 = performance.now();
        for (let i = 0; i < N; i++) {
            let x_star = a + i * dx + (Math.random() * dx); 
            sum += f(x_star);
        }
        return { val: sum * dx, time: performance.now() - t0 };
    }

    // Restituisce anche i dati grezzi per il grafico di Lebesgue
    function computeLebesgue(funcObj, domainSamples) {
        const [a, b] = funcObj.domain;
        const f = funcObj.fn;
        const N_y = 150; // Visual resolution for bins
        
        const t0 = performance.now();
        const vals = new Float64Array(domainSamples);
        let y_min = Infinity, y_max = -Infinity;
        
        for (let i = 0; i < domainSamples; i++) {
            let x = a + (i + 0.5) * (b - a) / domainSamples;
            let y = f(x);
            vals[i] = y;
            if (y < y_min) y_min = y;
            if (y > y_max) y_max = y;
        }

        if (y_min === y_max) {
            return { val: y_min * (b - a), time: performance.now() - t0, hist: [{y: y_min, measure: b-a}] };
        }
        
        if (y_max > 50) y_max = 50; // Visual cap

        const dy = (y_max - y_min) / N_y;
        const counts = new Int32Array(N_y);
        for (let i = 0; i < domainSamples; i++) {
            let y = vals[i];
            if (y > 50) continue; 
            let bin = Math.floor((y - y_min) / dy);
            if (bin >= N_y) bin = N_y - 1;
            if (bin >= 0) counts[bin]++;
        }

        let integral = 0;
        const dx = (b - a) / domainSamples; 
        const histogramData = [];
        
        for (let j = 0; j < N_y; j++) {
            let y_val = y_min + (j + 0.5) * dy; 
            let measure = counts[j] * dx;
            if (measure > 0) {
                integral += y_val * measure;
                histogramData.push({y: y_val, measure: measure});
            }
        }
        return { val: integral, time: performance.now() - t0, hist: histogramData };
    }

    function plotDuality(funcObj, lebesgueData) {
        const [a, b] = funcObj.domain;
        const f = funcObj.fn;
        
        // 1. Riemann Data (Vertical Slices)
        const curvePoints = [];
        for(let x = a; x <= b; x += (b-a)/500) {
            let y = f(x);
            if(y > 20) y = 20; 
            curvePoints.push({x: x, y: y});
        }

        const riemannBars = [];
        const labelsR = [];
        const visualN = 40;
        const dxR = (b-a)/visualN;
        for(let i=0; i<visualN; i++) {
            let x = a + (i+0.5)*dxR;
            let y = f(x);
            if(y > 20) y = 20;
            riemannBars.push(y);
            labelsR.push(x.toFixed(2));
        }

        if(chartRiemann) chartRiemann.destroy();
        chartRiemann = new Chart(document.getElementById('chart-es1-riemann').getContext('2d'), {
            type: 'bar',
            data: {
                labels: labelsR,
                datasets: [
                    {
                        type: 'line', label: 'f(x)', data: curvePoints.map(p=>p.y),
                        borderColor: '#06b6d4', borderWidth: 2, pointRadius: 0, tension: 0.1
                    },
                    {
                        type: 'bar', label: 'Domain Slices', data: riemannBars,
                        backgroundColor: 'rgba(99, 102, 241, 0.3)', borderColor: 'rgba(99, 102, 241, 0.8)',
                        borderWidth: 1, barPercentage: 1.0, categoryPercentage: 1.0
                    }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks:{display:false}, grid:{display:false} } } }
        });

        // 2. Lebesgue Data (Horizontal Measure Bins)
        if(chartLebesgue) chartLebesgue.destroy();
        chartLebesgue = new Chart(document.getElementById('chart-es1-lebesgue').getContext('2d'), {
            type: 'bar',
            data: {
                labels: lebesgueData.hist.map(h => h.y.toFixed(2)),
                datasets: [{
                    label: 'Lebesgue Measure μ(E)',
                    data: lebesgueData.hist.map(h => h.measure),
                    backgroundColor: 'rgba(168, 85, 247, 0.5)',
                    borderColor: '#a855f7',
                    borderWidth: 1, barPercentage: 1.0, categoryPercentage: 1.0
                }]
            },
            options: { 
                indexAxis: 'y', // Orizzontale per mostrare l'asse Y come domininio
                responsive: true, maintainAspectRatio: false,
                scales: { 
                    x: { title: { display: true, text: 'Measure (Size of Preimage)' } },
                    y: { title: { display: true, text: 'Range f(x)' }, ticks:{display:false} }
                }
            }
        });
    }

    document.getElementById('compute-es1').addEventListener('click', () => {
        const funcKey = document.getElementById('func-select').value;
        const N = parseInt(document.getElementById('partitions').value, 10);
        const fObj = functionsLib[funcKey];

        const riemann = computeRiemann(fObj, N);
        const lebesgueSamples = Math.max(N, 100000); 
        const lebesgue = computeLebesgue(fObj, lebesgueSamples);

        document.getElementById('tbody-es1').innerHTML = `
            <tr>
                <td style="font-weight: 600;">Riemann (Domain)</td>
                <td style="color: var(--accent-cyan); font-family: var(--font-mono); font-weight: bold;">${riemann.val.toFixed(6)}</td>
                <td style="font-family: var(--font-mono);">${fObj.exact.toFixed(6)}</td>
                <td style="color: var(--accent-emerald); font-family: var(--font-mono);">${Math.abs(riemann.val - fObj.exact).toExponential(3)}</td>
                <td style="font-family: var(--font-mono); color: var(--text-muted);">${riemann.time.toFixed(2)}</td>
            </tr>
            <tr>
                <td style="font-weight: 600;">Lebesgue (Range)</td>
                <td style="color: var(--accent-indigo); font-family: var(--font-mono); font-weight: bold;">${lebesgue.val.toFixed(6)}</td>
                <td style="font-family: var(--font-mono);">${fObj.exact.toFixed(6)}</td>
                <td style="color: var(--accent-emerald); font-family: var(--font-mono);">${Math.abs(lebesgue.val - fObj.exact).toExponential(3)}</td>
                <td style="font-family: var(--font-mono); color: var(--text-muted);">${lebesgue.time.toFixed(2)}</td>
            </tr>
        `;
        
        document.getElementById('es1-discussion-box').style.display = 'block';
        document.getElementById('es1-discussion').innerHTML = fObj.desc;
        
        plotDuality(fObj, lebesgue);
    });

    /* =========================================================================
       EXERCISE 2: NORMAL CDF & CATASTROPHIC CANCELLATION
       ========================================================================= */

    const normalPDF = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

    function referenceCDF(z) {
        let sign = z < 0 ? -1 : 1;
        let x = Math.abs(z) / Math.sqrt(2);
        let t = 1.0 / (1.0 + 0.3275911 * x);
        let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    }

    function computeTrapezoidalCDF(z, N) {
        const lowerBound = -8; 
        if (z <= lowerBound) return { val: 0 };
        const dx = (z - lowerBound) / N;
        let sum = 0.5 * (normalPDF(lowerBound) + normalPDF(z));
        for (let i = 1; i < N; i++) sum += normalPDF(lowerBound + i * dx);
        return { val: sum * dx };
    }

    function computeSimpsonCDF(z, N) {
        const lowerBound = -8;
        if (z <= lowerBound) return { val: 0 };
        if (N % 2 !== 0) N++; 
        const dx = (z - lowerBound) / N;
        let sum = normalPDF(lowerBound) + normalPDF(z);
        for (let i = 1; i < N; i += 2) sum += 4 * normalPDF(lowerBound + i * dx);
        for (let i = 2; i < N - 1; i += 2) sum += 2 * normalPDF(lowerBound + i * dx);
        return { val: (sum * dx) / 3 };
    }

    // Taylor function modificata per restituire traccia dell'errore per il grafico
    function computeTaylorErfTracked(z, maxTerms=80) {
        const x = z / Math.sqrt(2);
        const ref = referenceCDF(z);
        let sum = 0, term = x, n = 0;
        let trace = [];
        
        while (Math.abs(term) > 1e-15 && n < maxTerms) {
            sum += term;
            let currentVal = 0.5 * (1 + (2 / Math.sqrt(Math.PI)) * sum);
            trace.push({ n: n, error: Math.abs(currentVal - ref) + 1e-17 }); // +1e-17 avoids log(0)
            
            n++;
            term = -term * x * x * (2 * n - 1) / (n * (2 * n + 1));
        }
        return { val: 0.5 * (1 + (2 / Math.sqrt(Math.PI)) * sum), trace: trace };
    }

    function plotNormalAndError(testPoints) {
        // 1. PDF / CDF Plot
        const pdfData = [], cdfData = [], pointData = [];
        for(let x = -4.5; x <= 4.5; x += 0.1) {
            pdfData.push({x: x, y: normalPDF(x)});
            cdfData.push({x: x, y: referenceCDF(x)});
        }
        testPoints.forEach(z => pointData.push({x: z, y: referenceCDF(z)}));

        if(chartNormMain) chartNormMain.destroy();
        chartNormMain = new Chart(document.getElementById('chart-es2-main').getContext('2d'), {
            type: 'line',
            data: {
                datasets: [
                    { label: 'PDF Density', data: pdfData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.15)', fill: true, pointRadius: 0, tension: 0.4 },
                    { label: 'CDF Φ(z)', data: cdfData, borderColor: '#6366f1', borderWidth: 2, pointRadius: 0, tension: 0.4 },
                    { type: 'scatter', label: 'Z-Scores', data: pointData, backgroundColor: '#fff', borderColor: '#3b82f6', borderWidth: 2, pointRadius: 5 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x:{title:{display:true,text:'Z'}}, y:{max:1.1} } }
        });

        // 2. Taylor Error Convergence Plot (Catastrophic Cancellation Visualizer)
        const traceStable = computeTaylorErfTracked(1.5).trace;
        const traceUnstable = computeTaylorErfTracked(4.0).trace;

        if(chartNormError) chartNormError.destroy();
        chartNormError = new Chart(document.getElementById('chart-es2-error').getContext('2d'), {
            type: 'line',
            data: {
                labels: traceUnstable.map(t => t.n),
                datasets: [
                    {
                        label: 'Absolute Error (Z=1.5)',
                        data: traceStable.map(t => t.error),
                        borderColor: '#10b981',
                        borderWidth: 2, tension: 0.1, pointRadius: 2
                    },
                    {
                        label: 'Absolute Error (Z=4.0)',
                        data: traceUnstable.map(t => t.error),
                        borderColor: '#f43f5e',
                        borderWidth: 2, tension: 0.1, pointRadius: 2
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: 'Number of Taylor Terms (N)' } },
                    y: { 
                        type: 'logarithmic', // Chiave per mostrare la precisione in float
                        title: { display: true, text: 'Log Absolute Error' },
                        min: 1e-17, max: 1e5
                    }
                },
                plugins: { tooltip: { mode: 'index' } }
            }
        });
    }

    document.getElementById('compute-es2').addEventListener('click', () => {
        const N = parseInt(document.getElementById('cdf-steps').value, 10);
        const testPoints = [-4.0, -1.5, 0.0, 1.5, 4.0];
        
        const tbody = document.getElementById('tbody-es2');
        tbody.innerHTML = ''; 

        testPoints.forEach(z => {
            const refVal = referenceCDF(z);
            const trap = computeTrapezoidalCDF(z, N);
            const simp = computeSimpsonCDF(z, N);
            const seriesObj = computeTaylorErfTracked(z);
            const seriesVal = seriesObj.val;
            
            let seriesDisplay = '';
            if (Math.abs(z) >= 3.5) {
                seriesDisplay = `<span style="color:#f43f5e; font-weight:bold;">${seriesVal.toFixed(6)} ⚠️</span><br><span style="font-size:0.75rem; color:var(--text-muted)">IEEE-754 Catastrophic Canc.</span>`;
            } else {
                seriesDisplay = `<span style="color:var(--accent-emerald)">${seriesVal.toFixed(6)}</span><br><span style="font-size:0.75rem; font-family:var(--font-mono); color:var(--text-muted)">Err: ${Math.abs(seriesVal - refVal).toExponential(1)}</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 700; color: #fff; font-family: var(--font-mono);">${z.toFixed(2)}</td>
                <td style="color: var(--text-main); font-family: var(--font-mono);">${refVal.toFixed(6)}</td>
                <td>
                    <span style="color:var(--accent-cyan); font-family: var(--font-mono);">${trap.val.toFixed(6)}</span><br>
                    <span style="font-size:0.75rem; font-family:var(--font-mono); color:var(--text-muted)">Err: ${Math.abs(trap.val - refVal).toExponential(1)}</span>
                </td>
                <td>
                    <span style="color:var(--accent-indigo); font-weight:bold; font-family: var(--font-mono);">${simp.val.toFixed(6)}</span><br>
                    <span style="font-size:0.75rem; font-family:var(--font-mono); color:var(--text-muted)">Err: ${Math.abs(simp.val - refVal).toExponential(1)}</span>
                </td>
                <td>${seriesDisplay}</td>
            `;
            tbody.appendChild(tr);
        });

        plotNormalAndError(testPoints);
    });

    // Initialize Default Graphics
    plotDuality(functionsLib['sin'], computeLebesgue(functionsLib['sin'], 50000));
    plotNormalAndError([]);

});