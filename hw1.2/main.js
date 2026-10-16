// ==========================================================================
// HW2: Wallet Seed to Ethereum Address Pipeline & Statistical Analysis
// Standards: BIP-39, BIP-32, BIP-44, secp256k1, Keccak-256, and EIP-55
// ==========================================================================

let nibbleChartInstance = null;
let bitParityChartInstance = null;

// Executes the complete 5-stage cryptographic pipeline
async function executeDerivationPipeline() {
  const mnemonicText = document.getElementById("mnemonicInput").value.trim();
  const path = document.getElementById("derivationPath").value.trim();

  try {
    // 1. BIP-39 Mnemonic -> 512-bit Binary Seed
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonicText);
    const seed = mnemonicObj.computeSeed();
    document.getElementById("outSeed").textContent = seed;

    // 2. BIP-32 / BIP-44 HD Derivation -> 256-bit Private Key k
    const hdNode = ethers.HDNodeWallet.fromSeed(seed);
    const childWallet = hdNode.derivePath(path);
    document.getElementById("outPrivKey").textContent = childWallet.privateKey;

    // 3. secp256k1 Public Key Q (extract 64 raw bytes x||y, strip 0x04 prefix)
    const signingKey = new ethers.SigningKey(childWallet.privateKey);
    const fullUncompressedPubKey = signingKey.publicKey; // 0x04 + 64 bytes
    const raw64BytePubKey = "0x" + fullUncompressedPubKey.slice(4);
    document.getElementById("outPubKey").textContent = raw64BytePubKey;

    // 4. Keccak-256 Hash of Public Key
    const keccakDigest = ethers.keccak256(raw64BytePubKey);
    document.getElementById("outKeccak").textContent = keccakDigest;

    // 5. 20-byte Truncation & EIP-55 Checksum
    const checksummedAddress = childWallet.address;
    document.getElementById("outAddress").textContent = checksummedAddress;

    // Update statistical charts and metrics
    updateStatisticalVisualizations(checksummedAddress);

  } catch (err) {
    alert("Derivation error: Please ensure your mnemonic is valid (12 or 24 words). Details: " + err.message);
  }
}

// Computes the bitwise Hamming distance between two hex strings
function calculateBitHammingDistance(hexA, hexB) {
  const cleanA = hexA.toLowerCase().replace("0x", "");
  const cleanB = hexB.toLowerCase().replace("0x", "");
  let diffCount = 0;

  for (let i = 0; i < Math.min(cleanA.length, cleanB.length); i++) {
    const valA = parseInt(cleanA[i], 16);
    const valB = parseInt(cleanB[i], 16);
    let xor = valA ^ valB;
    while (xor > 0) {
      if (xor & 1) diffCount++;
      xor >>= 1;
    }
  }
  return diffCount;
}

// Strict Avalanche Criterion (SAC) Test: Flips exactly 1 bit in root entropy
async function runAvalancheTest() {
  const originalPhrase = document.getElementById("mnemonicInput").value.trim();
  const path = document.getElementById("derivationPath").value.trim();

  try {
    const mnemonicA = ethers.Mnemonic.fromPhrase(originalPhrase);
    const entropyHex = mnemonicA.entropy;

    // Flip the least significant bit of the last byte in entropy
    const lastByte = parseInt(entropyHex.slice(-2), 16);
    const flippedByte = (lastByte ^ 1).toString(16).padStart(2, "0");
    const mutatedEntropy = entropyHex.slice(0, -2) + flippedByte;

    // Reconstruct mutated mnemonic with recomputed BIP-39 checksum
    const mnemonicB = ethers.Mnemonic.fromEntropy(mutatedEntropy);

    // Derive addresses for both original and 1-bit mutated trees
    const walletA = ethers.HDNodeWallet.fromSeed(mnemonicA.computeSeed()).derivePath(path);
    const walletB = ethers.HDNodeWallet.fromSeed(mnemonicB.computeSeed()).derivePath(path);

    const addrA = walletA.address;
    const addrB = walletB.address;

    const flippedBits = calculateBitHammingDistance(addrA, addrB);
    const totalBits = 160; // 20 bytes * 8 bits
    const flippedPercentage = ((flippedBits / totalBits) * 100).toFixed(2);

    document.getElementById("statFlippedBits").textContent = `${flippedBits} / ${totalBits}`;
    document.getElementById("statFlippedPct").textContent = `${flippedPercentage}%`;

    document.getElementById("tableAddrOriginal").textContent = addrA;
    document.getElementById("tableAddrMutated").textContent = addrB;

  } catch (err) {
    alert("Avalanche test error: " + err.message);
  }
}

// Statistical analysis: Nibble uniform distribution, Chi-Square test, and bit balance
function updateStatisticalVisualizations(addressHex) {
  const clean = addressHex.toLowerCase().replace("0x", "");
  const hexChars = "0123456789abcdef".split("");
  const counts = {};
  hexChars.forEach(c => counts[c] = 0);

  let bitZeros = 0;
  let bitOnes = 0;

  for (const ch of clean) {
    if (counts[ch] !== undefined) counts[ch]++;
    const val = parseInt(ch, 16);
    for (let b = 0; b < 4; b++) {
      if ((val >> b) & 1) bitOnes++;
      else bitZeros++;
    }
  }

  // Calculate Empirical Chi-Square (df = 15, expected = 40 / 16 = 2.5)
  const expectedFreq = 40 / 16;
  let chi2 = 0;
  hexChars.forEach(c => {
    chi2 += Math.pow(counts[c] - expectedFreq, 2) / expectedFreq;
  });
  document.getElementById("statChi2").textContent = chi2.toFixed(3);

  // 1. Bar Chart: Nibble Frequencies (0-f)
  const ctxNibble = document.getElementById("nibbleChart").getContext("2d");
  if (nibbleChartInstance) nibbleChartInstance.destroy();

  nibbleChartInstance = new Chart(ctxNibble, {
    type: "bar",
    data: {
      labels: hexChars,
      datasets: [
        {
          label: "Observed Nibbles (out of 40)",
          data: hexChars.map(c => counts[c]),
          backgroundColor: "rgba(99, 102, 241, 0.75)",
          borderColor: "#6366f1",
          borderWidth: 1
        },
        {
          type: "line",
          label: "Expected Uniform (2.5)",
          data: hexChars.map(() => expectedFreq),
          borderColor: "#10b981",
          borderWidth: 2,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: "#94a3b8", stepSize: 1 },
          grid: { color: "#21262d" }
        },
        x: {
          ticks: { color: "#94a3b8" },
          grid: { color: "#21262d" },
          title: { display: true, text: "Hexadecimal Character (Nibble)", color: "#94a3b8" }
        }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: {
          display: true,
          text: "Hex Character Frequencies in Address",
          color: "#f8fafc"
        }
      }
    }
  });

  // 2. Doughnut Chart: Bit Uniformity (0s vs 1s)
  const ctxBits = document.getElementById("bitParityChart").getContext("2d");
  if (bitParityChartInstance) bitParityChartInstance.destroy();

  bitParityChartInstance = new Chart(ctxBits, {
    type: "doughnut",
    data: {
      labels: [`Zero Bits (${bitZeros})`, `One Bits (${bitOnes})`],
      datasets: [
        {
          data: [bitZeros, bitOnes],
          backgroundColor: ["rgba(6, 182, 212, 0.75)", "rgba(244, 63, 94, 0.75)"],
          borderColor: ["#06b6d4", "#f43f5e"],
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: {
          display: true,
          text: "Address Bit Balance (Target: 80 vs 80)",
          color: "#f8fafc"
        }
      }
    }
  });
}

// Generates a random valid 12-word mnemonic phrase
function generateRandomMnemonic() {
  const randomWallet = ethers.Wallet.createRandom();
  document.getElementById("mnemonicInput").value = randomWallet.mnemonic.phrase;
  executeDerivationPipeline();
}

// Event Listeners
document.getElementById("btnDerive").addEventListener("click", executeDerivationPipeline);
document.getElementById("btnRandomMnemonic").addEventListener("click", generateRandomMnemonic);
document.getElementById("btnRunAvalanche").addEventListener("click", runAvalancheTest);

window.addEventListener("DOMContentLoaded", () => {
  executeDerivationPipeline();
});