#!/usr/bin/env python3
"""
Reproducible Numerical Benchmarks for:
"Online Algorithms and Sequential Hypothesis Testing for Real-Time Network Anomaly Detection"
Claudio Bagini (2045337) — MSc in Cybersecurity, Sapienza University of Rome

Executes:
  1. Experiment 1: IEEE 754 float32 & float64 stability of Naive One-Pass vs. Welford
     (and Chan's parallel merge verification) across clock offsets C = 10^0 .. 10^8.
  2. Experiment 2: Fixed-Window CLT (plus Exact Binomial reference) vs. Sequential TRW
     (analytical Wald formula + 10,000-trial Monte Carlo simulation) and verified
     sample trajectories for Figure 2.
"""

from decimal import Decimal, getcontext
import math
import statistics
import numpy as np

getcontext().prec = 50


def naive_variance(arr: np.ndarray, dtype) -> float:
    """Naive one-pass variance: (sum(y^2) - (sum(y))^2 / n) / (n - 1)."""
    n = dtype(len(arr))
    s1 = dtype(0.0)
    s2 = dtype(0.0)
    for y in arr:
        s1 = dtype(s1 + y)
        s2 = dtype(s2 + dtype(y * y))
    mean_sq = dtype(dtype(s1 * s1) / n)
    m2 = dtype(s2 - mean_sq)
    return float(dtype(m2 / dtype(len(arr) - 1)))


def welford_variance(arr: np.ndarray, dtype) -> tuple[float, float, float]:
    """Welford's online algorithm returning (mean, M2, sample_variance)."""
    n = 0
    mean = dtype(0.0)
    m2 = dtype(0.0)
    for y in arr:
        n += 1
        d1 = dtype(y - mean)
        mean = dtype(mean + dtype(d1 / dtype(n)))
        d2 = dtype(y - mean)
        m2 = dtype(m2 + dtype(d1 * d2))
    var = dtype(m2 / dtype(n - 1))
    return float(mean), float(m2), float(var)


def chan_merge(states: list[tuple[int, float, float]]) -> tuple[int, float, float]:
    """Chan's parallel variance partition merge in float64."""
    n_a, mu_a, m2_a = states[0]
    for n_b, mu_b, m2_b in states[1:]:
        n = n_a + n_b
        delta = mu_b - mu_a
        mu_a = mu_a + delta * (n_b / n)
        m2_a = m2_a + m2_b + (delta * delta) * (n_a * n_b / n)
        n_a = n
    return n_a, mu_a, m2_a


def run_experiment_1(n: int = 100_000, seed: int = 2026) -> None:
    print("=" * 80)
    print(f"EXPERIMENT 1: Streaming Variance Stability (n = {n:,}, sigma = 1.0, seed = {seed})")
    print("=" * 80)

    rng = np.random.default_rng(seed)
    xi = rng.standard_normal(n)

    # High-precision reference variance of the underlying jitter stream {xi_i}
    d_xi = [Decimal.from_float(float(x)) for x in xi]
    d_mean = sum(d_xi) / Decimal(n)
    exact_var_true = float(sum((x - d_mean) ** 2 for x in d_xi) / Decimal(n - 1))
    print(f"Exact reference sample variance s_exact^2 = {exact_var_true:.15f}\n")

    header = (
        f"{'Offset C':>8} | {'Naive f32 (val)':>16} | {'Naive f32 err':>13} | "
        f"{'Welf f32 err':>12} | {'Naive f64 (val)':>16} | {'Naive f64 err':>13} | "
        f"{'Welf f64 err':>12}"
    )
    print(header)
    print("-" * len(header))

    for k in range(9):
        C = 10.0 ** k
        y64 = (C + xi).astype(np.float64)
        y32 = (np.float32(C) + xi.astype(np.float32)).astype(np.float32)

        # Pure float32 / float64 loops (vectorized exact-order accumulation for float32/64)
        # Note: loop matches single-packet online NIDS execution exactly.
        v_n32 = naive_variance(y32, np.float32)
        _, _, v_w32 = welford_variance(y32, np.float32)
        v_n64 = naive_variance(y64, np.float64)
        _, _, v_w64 = welford_variance(y64, np.float64)

        e_n32 = abs(v_n32 - exact_var_true) / exact_var_true
        e_w32 = abs(v_w32 - exact_var_true) / exact_var_true
        e_n64 = abs(v_n64 - exact_var_true) / exact_var_true
        e_w64 = abs(v_w64 - exact_var_true) / exact_var_true

        print(
            f"10^{k:<5d} | {v_n32:16.4e} | {e_n32:13.2e} | "
            f"{e_w32:12.2e} | {v_n64:16.4e} | {e_n64:13.2e} | {e_w64:12.2e}"
        )

    # Verify Chan's parallel merge across P = 8 distributed probes at C = 10^8
    C_test = 1e8
    y64_test = (C_test + xi).astype(np.float64)
    chunks = np.array_split(y64_test, 8)
    states = []
    for ch in chunks:
        mu_c, m2_c, _ = welford_variance(ch, np.float64)
        states.append((len(ch), mu_c, m2_c))
    n_tot, mu_tot, m2_tot = chan_merge(states)
    v_chan = m2_tot / (n_tot - 1)
    e_chan = abs(v_chan - exact_var_true) / exact_var_true
    print(f"\nChan 8-probe parallel merge at C=10^8: var = {v_chan:.12f}, rel_err = {e_chan:.2e}")


def binom_tail_upper(n: int, k_min: int, p: float) -> float:
    """Exact P(Bin(n, p) >= k_min)."""
    return sum(math.comb(n, k) * (p ** k) * ((1.0 - p) ** (n - k)) for k in range(k_min, n + 1))


def exact_binomial_sample_size(theta0: float, theta1: float, alpha: float, beta: float) -> int:
    """Smallest fixed n such that an exact upper-tail Binomial test achieves FPR<=alpha and FNR<=beta."""
    for n in range(1, 1000):
        # Find smallest threshold k such that P_{H0}(S >= k) <= alpha
        k_star = None
        for k in range(n + 1):
            if binom_tail_upper(n, k, theta0) <= alpha:
                k_star = k
                break
        if k_star is not None:
            fnr = 1.0 - binom_tail_upper(n, k_star, theta1)
            if fnr <= beta:
                return n
    return -1


def run_experiment_2(
    theta0: float = 0.10,
    alpha: float = 1e-4,
    beta: float = 1e-2,
    n_trials: int = 10_000,
    seed: int = 2026,
) -> None:
    print("\n" + "=" * 80)
    print(f"EXPERIMENT 2: Port Scan Detection Latency (theta0={theta0}, alpha={alpha}, beta={beta})")
    print("=" * 80)

    nd = statistics.NormalDist()
    z_a = nd.inv_cdf(1.0 - alpha)
    z_b = nd.inv_cdf(1.0 - beta)
    a = math.log((1.0 - beta) / alpha)
    b = math.log(beta / (1.0 - alpha))

    print(f"z_(1-alpha) = {z_a:.4f}, z_(1-beta) = {z_b:.4f}")
    print(f"Wald thresholds: a = +{a:.4f}, b = {b:.4f}\n")

    profiles = [
        ("Aggressive SYN Scan", 0.95),
        ("Fast Horizontal Scan", 0.85),
        ("Standard Port Scan", 0.80),
        ("Interleaved Scan", 0.65),
        ("Stealth / Noisy Scan", 0.50),
        ("Low-and-Slow Probe", 0.30),
    ]

    rng = np.random.default_rng(seed)

    header = (
        f"{'Profile':<21} | {'th1':>4} | {'D_KL':>6} | {'N_CLT':>5} | {'N_Bin':>5} | "
        f"{'E[tau]':>6} | {'MC tau (mean +/- sd)':>20} | {'FNR_emp':>7} | {'Speedup(Bin)':>12}"
    )
    print(header)
    print("-" * len(header))

    for name, th1 in profiles:
        dkl = th1 * math.log(th1 / theta0) + (1.0 - th1) * math.log((1.0 - th1) / (1.0 - theta0))
        n_clt = math.ceil(
            (
                (z_a * math.sqrt(theta0 * (1.0 - theta0)) + z_b * math.sqrt(th1 * (1.0 - th1)))
                / (th1 - theta0)
            )
            ** 2
        )
        n_bin = exact_binomial_sample_size(theta0, th1, alpha, beta)
        e_tau = ((1.0 - beta) * a + beta * b) / dkl

        zp = math.log(th1 / theta0)
        zm = math.log((1.0 - th1) / (1.0 - theta0))

        taus = np.empty(n_trials, dtype=np.int32)
        false_neg = 0
        for t in range(n_trials):
            lam = 0.0
            steps = 0
            while b < lam < a:
                steps += 1
                lam += zp if rng.random() < th1 else zm
            taus[t] = steps
            if lam <= b:
                false_neg += 1

        mc_mean = float(np.mean(taus))
        mc_sd = float(np.std(taus, ddof=1))
        fnr_emp = false_neg / n_trials
        speedup_bin = n_bin / mc_mean

        print(
            f"{name:<21} | {th1:4.2f} | {dkl:6.3f} | {n_clt:5d} | {n_bin:5d} | "
            f"{e_tau:6.2f} | {mc_mean:7.2f} +/- {mc_sd:6.2f}   | {fnr_emp:7.4f} | {speedup_bin:11.2f}x"
        )

    # Also verify exact empirical FPR under H0 for Standard Port Scan (theta1 = 0.80)
    zp80 = math.log(0.80 / theta0)
    zm80 = math.log(0.20 / (1.0 - theta0))
    dkl0 = theta0 * math.log(theta0 / 0.80) + (1.0 - theta0) * math.log((1.0 - theta0) / 0.20)
    e_tau0 = (alpha * a + (1.0 - alpha) * b) / (-dkl0)
    taus0 = np.empty(n_trials, dtype=np.int32)
    false_pos = 0
    for t in range(n_trials):
        lam = 0.0
        steps = 0
        while b < lam < a:
            steps += 1
            lam += zp80 if rng.random() < theta0 else zm80
        taus0[t] = steps
        if lam >= a:
            false_pos += 1
    print(
        f"\nH0 check (theta1=0.80, theta0=0.10): D_KL(P0||P1)={dkl0:.3f}, "
        f"E_H0[tau]={e_tau0:.2f}, MC={np.mean(taus0):.2f} +/- {np.std(taus0, ddof=1):.2f}, "
        f"empirical FPR={false_pos/n_trials:.5f} (target <= {alpha})"
    )

    # Print verified trajectories for Figure 2 (detector calibrated at theta0=0.10, theta1=0.80)
    print(f"\nVerified Figure 2 trajectories (Z+ = {zp80:+.4f}, Z- = {zm80:+.4f}, a = {a:+.4f}, b = {b:+.4f}):")
    seqs = {
        "Fast Scan (5 consecutive fails)": [1, 1, 1, 1, 1],
        "Noisy Scan (7 fails, 3 successes)": [1, 0, 1, 1, 0, 1, 1, 0, 1, 1],
        "Benign Host (1 fail, 5 successes)": [0, 0, 1, 0, 0, 0],
    }
    for label, seq in seqs.items():
        lam = 0.0
        pts = [(0, 0.0)]
        for i, x in enumerate(seq, 1):
            lam += zp80 if x == 1 else zm80
            pts.append((i, round(lam, 2)))
        print(f"  {label}: {pts}")


if __name__ == "__main__":
    run_experiment_1()
    run_experiment_2()
