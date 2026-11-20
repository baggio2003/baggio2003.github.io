# Applied Statistics & Cryptographic Simulations — Portfolio

A curated collection of practical laboratory assignments, interactive simulations, and empirical statistical analyses developed in vanilla JavaScript and hosted on **GitHub Pages**.

🔗 **Live Portfolio:** [https://baggio2003.github.io/](https://baggio2003.github.io/)

---

## 🚀 Extra-Credit Group Project

### [Naked File Transfer — Bitstream File Analyzer](./frontend/index.html)
* **Real-Time Statistical Pipeline:** Chunk-based binary file transfer comparing **Plaintext**, **GZIP (LZ77 + Huffman)**, and **AES-256-CTR** streams using the browser's Web Crypto and `CompressionStream` APIs.
* **Entropy & Randomness Diagnostics:** Evaluates Shannon entropy, 256-byte frequency histograms, bit balance, Pearson's $\chi^2$ uniformity test ($df = 255$), and NIST Monobit $Z$-tests across single-file and multi-file datasets.

---

## 📚 Overview of Assignments

### [Homework 1: Public-Key Cryptography via Elliptic Curves (ECDLP)](./hw1/index.html)
* **Mathematical Model:** Explores the discrete logarithm problem over the toy curve $E(\mathbb{F}_{17}): y^2 \equiv x^3 + 7 \pmod{17}$, mirroring Ethereum's **secp256k1** parameters ($a = 0, b = 7$).
* **Point Addition & Doubling:** Implements modular arithmetic using the Extended Euclidean Algorithm for modular inverses without floating-point approximations.
* **Discrete Torus Visualization:** Renders affine points on a $17 \times 17$ lattice via HTML5 Canvas, animating pseudo-random walk trajectories between successive multiples $kG$.
* **Statistical Analysis:** Evaluates coordinate distributions, quadratic residues, least-significant bit (LSB) parity balance, and the absence of linear input-output correlation ($k \mapsto x$).
* **Theoretical Comparison:** Examines the structural differences between One-Way Functions (preserving group homomorphisms) and Cryptographic Hash Functions.

### [Homework 1 Part 2: From Wallet Seed to Ethereum Address Pipeline](./hw1.2/index.html)
* **Cryptographic Standards Pipeline:** Complete execution of Ethereum's account generation pipeline:
  $$\text{Mnemonic} \xrightarrow{\text{BIP-39}} \text{Seed} \xrightarrow{\text{BIP-32/44}} k \xrightarrow{\text{secp256k1}} Q \xrightarrow{\text{Keccak-256}} \text{Raw Addr} \xrightarrow{\text{EIP-55}} \text{Checksummed Addr}$$
* **Interactive Tool:** Live inspection of all intermediate stages (512-bit seed, 256-bit scalar, uncompressed 64-byte public key, 32-byte Keccak digest, and 20-byte address).
* **Strict Avalanche Criterion (SAC):** Measures bitwise Hamming distance under 1-bit entropy perturbations, comparing observed flipping rates against the theoretical 50% target.
* **Statistical Goodness-of-Fit:** Analyzes nibble frequencies ($0\text{--}\text{f}$) across the address space using a Chi-Square ($\chi^2$) test ($df = 15$).
* **Historical & Architectural Context:** Contrasts Merkle-Damgård vs. Sponge constructions (SHA-2 vs. Keccak), explains why Ethereum retained Keccak-256 instead of FIPS 202 SHA3-256, and analyzes the functional necessity of heterogeneous primitives.

### [Homework 2: Toy ECC Encryption vs. Caesar Cipher & Cryptanalysis](./hw2/index.html)
* **Comparative Cipher Analysis:** Contrasts Caesar substitution against a toy elliptic-curve encryption scheme across varying plaintext lengths.
* **Automated Statistical Cryptanalysis:** Evaluates frequency distributions, Chi-Square ($\chi^2$) scoring, and bigram statistics to quantify ciphertext leakage.
* **Algebraic Key Recovery:** Benchmarks Exhaustive Search against Baby-Step Giant-Step (BSGS) for solving the toy ECDLP.

### [Homework 3: Stochastic Penetration Processes, LLN & CLT](./hw3/index.html)
* **Stochastic Modeling:** Simulates penetration trajectories across $n$ systems and $m$ attackers using Bernoulli and Rademacher increment models.
* **Scaling & Limit Theorems:** Inspects variance scaling under different normalizations and empirically verifies convergence toward the Law of Large Numbers (LLN) and Central Limit Theorem (CLT).

### [Homework 4: Welford's Recurrence Formulas & Sampling Distributions](./hw4/index.html)
* **Numerical Stability:** Derives and implements Knuth/Welford one-pass recurrence algorithms for running sums of squares and variance.
* **Estimator Properties:** Uses Monte Carlo penetration scoring on $[0, 10]$ to evaluate unbiasedness and consistency across sample sizes $n$ and replications $m$.

### [Homework 5: Riemann vs. Lebesgue Integration & Numerical Normal CDF](./hw5/index.html)
* **Measure Theory Duality:** Contrasts Riemann and Lebesgue integration on pathological functions (such as the Dirichlet indicator).
* **Numerical Analysis:** Evaluates the standard Normal CDF via Simpson's quadrature, discusses Liouville's theorem on non-elementary antiderivatives, and demonstrates catastrophic cancellation in alternating Taylor series.

### [Homework 6: Statistical Independence & Contingency Analysis](./hw6/index.html)
* **Bivariate Reduction:** Programmatically builds $(X, F)$ contingency tables with marginal distributions, conditional profiles, and expected frequencies under independence.
* **Hypothesis Testing:** Computes Pearson's $\chi^2$ statistic with an exact regularized incomplete-gamma $p$-value and discusses statistical association vs. causality.

### [Homework 7: Modes of Convergence & Bayesian Inference](./hw7/index.html)
* **Probability Theory & Limit Theorems:** Formalizes almost sure ($\text{a.s.}$), mean-square ($L^2$), in-probability ($P$), and in-distribution ($d$) convergence, their implication hierarchy, variance additivity (Biénaymé's formula), the $\sqrt{n}$ law, and breakdown under heavy tails (Cauchy) or pairwise dependence ($\rho > 0$).
* **Bayesian Inference Labs:** Interactive **Beta–Binomial** conjugate updating with prior-sensitivity curves (Bernstein–von Mises dominance as $n$ grows) and a discrete **Intrusion Detection System (IDS)** base-rate fallacy simulator with sequential posterior updating.

---

## 🛠️ Technology Stack

* **Core:** Vanilla JavaScript (ES6+), HTML5 Canvas, CSS3 Custom Properties
* **Browser APIs:** Web Crypto API (`AES-256-CTR`), `CompressionStream` API (`GZIP`)
* **Libraries (CDN):** Chart.js, MathJax / KaTeX, Ethers.js v6
* **Hosting:** Static modular architecture on GitHub Pages

---

## 📁 Repository Structure

```text
.
├── index.html              # Main dashboard linking all assignments and projects
├── style.css               # Shared glassmorphic dark theme stylesheet
├── frontend/               # Extra-Credit Group Project: Bitstream File Analyzer
│   ├── index.html          # Analyzer UI and statistical dashboard
│   ├── js/                 # app.js, analysis.js, dashboard.js, multifile.js, transform.js
│   └── style/              # analysis.css, style.css
├── hw1/                    # Homework 1: Elliptic Curve Cryptography & ECDLP
│   ├── index.html          # Interactive GUI, Canvas torus, and statistical charts
│   └── main.js             # Modular curve arithmetic and Chart.js logic
├── hw1.2/                  # Homework 1 Part 2: Ethereum Wallet Cryptographic Pipeline
│   ├── index.html          # Pipeline inspector, SAC avalanche test, and historical notes
│   └── main.js             # Ethers.js integration, Hamming distance, and Chi-Square test
├── hw2/                    # Homework 2: Toy ECC vs. Caesar Cipher & Cryptanalysis
│   ├── index.html          # Comparative UI, cryptanalysis tables, and BSGS view
│   └── main.js             # Cipher implementations, Chi-Square/bigram scoring, BSGS
├── hw3/                    # Homework 3: Stochastic Penetration Processes, LLN & CLT
│   ├── index.html          # Process simulator UI and theory notes
│   └── script.js           # Bernoulli/Rademacher trajectory simulation and charts
├── hw4/                    # Homework 4: Welford's Algorithm & Sampling Distributions
│   ├── index.html          # Algebraic derivations and Monte Carlo estimator lab
│   └── script.js           # One-pass Welford statistics and sampling diagnostics
├── hw5/                    # Homework 5: Riemann vs. Lebesgue & Numerical Normal CDF
│   ├── index.html          # Measure theory notes and numerical integration lab
│   └── app.js              # Simpson's quadrature and Taylor cancellation experiments
├── hw6/                    # Homework 6: Statistical Independence & Contingency Analysis
│   ├── index.html          # Contingency table builder and chi-square test lab
│   └── app.js              # Bivariate reduction, expected counts, incomplete-gamma p-value
└── hw7/                    # Homework 7: Modes of Convergence & Bayesian Inference
    ├── index.html          # Convergence theory, √n law, and Bayesian inference labs
    └── app.js              # Convergence simulator, Beta-Binomial & IDS Bayes engines
```
