// ==========================================================================
// HW2: Wallet Seed to Ethereum Address Pipeline & Statistical Analysis
// Implements BIP-39, BIP-32, BIP-44, secp256k1, Keccak-256 and EIP-55
// ==========================================================================

let nibbleChartInstance = null;

// Esegue l'intera pipeline di derivazione esponendo tutti gli stadi intermedi
async function executeDerivationPipeline() {
  const mnemonicText = document.getElementById("mnemonicInput").value.trim();
  const path = document.getElementById("derivationPath").value.trim();

  try {
    // 1. BIP-39 Mnemonic -> Seed
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonicText);
    const seed = mnemonicObj.computeSeed();
    document.getElementById("outSeed").textContent = seed;

    // 2. BIP-32 / BIP-44 HD Derivation
    const hdNode = ethers.HDNodeWallet.fromSeed(seed);
    const childWallet = hdNode.derivePath(path);
    document.getElementById("outPrivKey").textContent = childWallet.privateKey;

    // 3. secp256k1 Public Key (estraiamo la chiave non compressa a 64 byte senza prefisso 0x04)
    const signingKey = new ethers.SigningKey(childWallet.privateKey);
    const fullUncompressedPubKey = signingKey.publicKey; // 0x04 + 64 bytes
    const raw64BytePubKey = "0x" + fullUncompressedPubKey.slice(4);
    document.getElementById("outPubKey").textContent = raw64BytePubKey;

    // 4. Keccak-256 Hash della chiave pubblica
    const keccakDigest = ethers.keccak256(raw64BytePubKey);
    document.getElementById("outKeccak").textContent = keccakDigest;

    // 5. Troncamento a 20 byte ed EIP-55 Checksum
    const checksummedAddress = childWallet.address;
    document.getElementById("outAddress").textContent = checksummedAddress;

    // Aggiorna il grafico di distribuzione dei caratteri esadecimali
    updateNibbleDistributionChart(checksummedAddress);

  } catch (err) {
    alert("Errore nella derivazione: assicurati che la frase mnemonica sia valida (12 o 24 parole). Dettaglio: " + err.message);
  }
}

// Calcola la distanza di Hamming tra due stringhe binarie/esadecimali
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

// Test dell'effetto valanga: inverte 1 bit di entropia
async function runAvalancheTest() {
  const originalPhrase = document.getElementById("mnemonicInput").value.trim();
  const path = document.getElementById("derivationPath").value.trim();

  try {
    const mnemonicA = ethers.Mnemonic.fromPhrase(originalPhrase);
    const entropyHex = mnemonicA.entropy;

    // Modifica il bit meno significativo dell'ultimo byte di entropia
    const lastByte = parseInt(entropyHex.slice(-2), 16);
    const flippedByte = (lastByte ^ 1).toString(16).padStart(2, "0");
    const mutatedEntropy = entropyHex.slice(0, -2) + flippedByte;

    // Ricostruisce la frase mnemonica mutata con checksum BIP-39 ricalcolato
    const mnemonicB = ethers.Mnemonic.fromEntropy(mutatedEntropy);

    // Deriva entrambi gli indirizzi
    const walletA = ethers.HDNodeWallet.fromSeed(mnemonicA.computeSeed()).derivePath(path);
    const walletB = ethers.HDNodeWallet.fromSeed(mnemonicB.computeSeed()).derivePath(path);

    const addrA = walletA.address;
    const addrB = walletB.address;

    const flippedBits = calculateBitHammingDistance(addrA, addrB);
    const totalBits = 160; // 20 bytes * 8
    const flippedPercentage = ((flippedBits / totalBits) * 100).toFixed(2);

    document.getElementById("statFlippedBits").textContent = `${flippedBits} / ${totalBits}`;
    document.getElementById("statFlippedPct").textContent = `${flippedPercentage}%`;

    document.getElementById("tableAddrOriginal").textContent = addrA;
    document.getElementById("tableAddrMutated").textContent = addrB;

  } catch (err) {
    alert("Errore nel test dell'effetto valanga: " + err.message);
  }
}

// Analisi statistica della distribuzione dei nibble (0-f)
function updateNibbleDistributionChart(addressHex) {
  const clean = addressHex.toLowerCase().replace("0x", "");
  const counts = {};
  const hexChars = "0123456789abcdef".split("");
  hexChars.forEach(c => counts[c] = 0);

  for (const ch of clean) {
    if (counts[ch] !== undefined) counts[ch]++;
  }

  const ctx = document.getElementById("nibbleChart").getContext("2d");
  if (nibbleChartInstance) nibbleChartInstance.destroy();

  nibbleChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: hexChars,
      datasets: [
        {
          label: "Frequenza Osservata (su 40 caratteri)",
          data: hexChars.map(c => counts[c]),
          backgroundColor: "rgba(99, 102, 241, 0.7)",
          borderColor: "#6366f1",
          borderWidth: 1
        },
        {
          type: "line",
          label: "Frequenza Teorica Attesa Uniforme (2.5)",
          data: hexChars.map(() => 40 / 16),
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
          grid: { color: "#21262d" }
        }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        title: {
          display: true,
          text: "Distribuzione dei Simboli Esadecimali nell'Indirizzo Derivato",
          color: "#f8fafc"
        }
      }
    }
  });
}

// Genera una nuova frase mnemonica casuale
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