# Applied Statistics & Cryptographic Simulations — Portfolio

A curated collection of practical laboratory assignments, interactive simulations, and empirical statistical analyses developed in vanilla JavaScript and hosted on **GitHub Pages**.

🔗 **Live Portfolio:** [https://baggio2003.github.io/](https://baggio2003.github.io/)

---

## 📚 Overview of Assignments

### [Homework 1: Public-Key Cryptography via Elliptic Curves (ECDLP)](./hw1/index.html)
* **Mathematical Model:** Explores the discrete logarithm problem over the toy curve $E(\mathbb{F}_{17}): y^2 \equiv x^3 + 7 \pmod{17}$, mirroring Ethereum's **secp256k1** parameters ($a = 0, b = 7$).
* **Point Addition & Doubling:** Implements modular arithmetic using the Extended Euclidean Algorithm for modular inverses without floating-point approximations.
* **Discrete Torus Visualization:** Renders affine points on a $17 \times 17$ lattice via HTML5 Canvas, animating pseudo-random walk trajectories between successive multiples $kG$.
* **Statistical Analysis:** Evaluates coordinate distributions, quadratic residues, least-significant bit (LSB) parity balance, and the absence of linear input-output correlation ($k \mapsto x$).
* **Theoretical Comparison:** Examines the structural differences between One-Way Functions (preserving group homomorphisms) and Cryptographic Hash Functions.

### [Homework 2: From Wallet Seed to Ethereum Address Pipeline](./hw2/index.html)
* **Cryptographic Standards Pipeline:** Complete execution of Ethereum's account generation pipeline:
  $$\text{Mnemonic} \xrightarrow{\text{BIP-39}} \text{Seed} \xrightarrow{\text{BIP-32/44}} k \xrightarrow{\text{secp256k1}} Q \xrightarrow{\text{Keccak-256}} \text{Raw Addr} \xrightarrow{\text{EIP-55}} \text{Checksummed Addr}$$
* **Interactive Tool:** Live inspection of all intermediate stages (512-bit seed, 256-bit scalar, uncompressed 64-byte public key, 32-byte Keccak digest, and 20-byte address).
* **Strict Avalanche Criterion (SAC):** Measures bitwise Hamming distance under 1-bit entropy perturbations, comparing observed flipping rates against the theoretical 50% target.
* **Statistical Goodness-of-Fit:** Analyzes nibble frequencies ($0\text{--}\text{f}$) across the address space using a Chi-Square ($\chi^2$) test ($df = 15$).
* **Historical & Architectural Context:** Contrasts Merkle-Damgård vs. Sponge constructions (SHA-2 vs. Keccak), explains why Ethereum retained Keccak-256 instead of FIPS 202 SHA3-256, and analyzes the functional necessity of heterogeneous primitives.

---

## 📁 Repository Structure

```text
.
├── index.html              # Main dashboard linking all assignments
├── style.css               # Shared glassmorphic dark theme stylesheet
├── hw1/                    # Homework 1: Elliptic Curve Cryptography & ECDLP
│   ├── index.html          # Interactive GUI, Canvas torus, and statistical charts
│   └── main.js             # Modular curve arithmetic and Chart.js logic
└── hw2/                    # Homework 2: Ethereum Wallet Cryptographic Pipeline
    ├── index.html          # Pipeline inspector, SAC avalanche test, and historical notes
    └── main.js             # Ethers.js integration, Hamming distance, and Chi-Square test