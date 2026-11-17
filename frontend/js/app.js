const CHUNK_SIZE = 1024 * 1024; // 1 MB per chunk
const UPLOAD_ENDPOINT = 'http://localhost:3000/upload-chunk';

const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const statusLog = document.getElementById('statusLog');

// UI Components for the enhanced Upload Panel
const dropzone = document.getElementById('dropzone');
const dropzoneEmpty = document.getElementById('dropzoneEmpty');
const dropzoneSelected = document.getElementById('dropzoneSelected');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileMetaDisplay = document.getElementById('fileMetaDisplay');
const fileExtensionBadge = document.getElementById('fileExtensionBadge');
const changeFileBtn = document.getElementById('changeFileBtn');
const statusBadge = document.getElementById('statusBadge');
const progressWrapper = document.getElementById('progressWrapper');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const progressLabel = document.getElementById('progressLabel');
const clearLogBtn = document.getElementById('clearLogBtn');

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function updateSelectedFileUI(file) {
  if (!file) {
    if (dropzoneEmpty) dropzoneEmpty.style.display = 'flex';
    if (dropzoneSelected) dropzoneSelected.style.display = 'none';
    if (statusBadge) {
      statusBadge.textContent = 'Ready';
      statusBadge.className = 'badge badge-ready';
    }
    return;
  }

  if (dropzoneEmpty) dropzoneEmpty.style.display = 'none';
  if (dropzoneSelected) dropzoneSelected.style.display = 'block';

  if (fileNameDisplay) fileNameDisplay.textContent = file.name;
  const ext = file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : 'FILE';
  if (fileExtensionBadge) fileExtensionBadge.textContent = ext.slice(0, 5);

  const formattedSize = formatFileSize(file.size);
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  if (fileMetaDisplay) {
    fileMetaDisplay.textContent = `${formattedSize} • ${totalChunks} chunk${totalChunks > 1 ? 's' : ''} (1 MB each)`;
  }

  if (statusBadge) {
    statusBadge.textContent = 'File Ready';
    statusBadge.className = 'badge badge-ready';
  }
}

// Drag & drop handlers
if (dropzone) {
  dropzone.addEventListener('click', (e) => {
    if (e.target !== changeFileBtn && !e.target.closest('#changeFileBtn')) {
      fileInput.click();
    }
  });

  if (changeFileBtn) {
    changeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change'));
    }
  });
}

if (clearLogBtn) {
  clearLogBtn.addEventListener('click', () => {
    if (statusLog) {
      statusLog.textContent = 'Log cleared. Ready for next transmission.';
    }
  });
}

function appendLog(message) {
  console.log(message);
  if (statusLog) {
    statusLog.textContent += `\n${message}`;
    statusLog.scrollTop = statusLog.scrollHeight;
  }
}

/**
 * Sends a single variant (plain, compressed, or encrypted) in chunks
 * and passes each chunk's statistics to Member 3's dashboard.
 * Automatically falls back to in-browser computation when hosted on GitHub Pages.
 */
async function uploadVariantInChunks(variant, onChunkStep) {
  const { blob, fileName, dataType, label } = variant;
  const totalChunks = Math.max(1, Math.ceil(blob.size / CHUNK_SIZE));
  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  appendLog(`\n--- Starting analysis and upload: ${label} (${totalChunks} chunk(s)) ---`);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, blob.size);
    const chunkBlob = blob.slice(start, end);
    const currentChunkNum = chunkIndex + 1;

    let statsData = null;

    // 1. Try backend server if running on localhost
    if (isLocalhost) {
      try {
        const response = await fetch(UPLOAD_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-file-name': encodeURIComponent(fileName),
            'x-chunk-index': String(chunkIndex),
            'x-total-chunks': String(totalChunks),
            'x-data-type': dataType
          },
          body: chunkBlob
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            statsData = await response.json().catch(() => null);
          }
        }
      } catch (_) {
        // Server not reachable: silently switch to in-browser calculation
      }
    }

    // 2. Serverless / GitHub Pages fallback (or if local backend is off)
    if ((!statsData || typeof statsData.entropy !== 'number') && typeof calcolaMetricheLocale === 'function') {
      statsData = await calcolaMetricheLocale(chunkBlob, currentChunkNum, fileName, dataType);
      // Brief pause so the UI progress bar and Chart.js animations render smoothly chunk-by-chunk
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    // 3. Update Dashboard and Tables (MEMBER 3 & 4)
    if (typeof processaNuovoChunk === 'function') {
      processaNuovoChunk(statsData);
    }

    if (typeof onChunkStep === 'function') {
      onChunkStep();
    }

    const chiInfo = statsData.chiSquare
      ? ` | Chi²: ${statsData.chiSquare.value} (p=${statsData.chiSquare.pValue}, uniform=${statsData.chiSquare.isUniform})`
      : '';

    const normInfo = statsData.normalDistribution
      ? ` | Z-bit: ${statsData.normalDistribution.bitMonobitTest.zScore} (p=${statsData.normalDistribution.bitMonobitTest.pValue}) | Byte μ=${statsData.normalDistribution.byteValueStats.mean}, σ=${statsData.normalDistribution.byteValueStats.stdDev}`
      : '';

    appendLog(
      `[${dataType.toUpperCase()}] Chunk ${currentChunkNum}/${totalChunks} -> Entropy: ${statsData.entropy} bit/byte${chiInfo}${normInfo}`
    );
  }
}

// Clear charts and log when a new file is selected
fileInput.addEventListener('change', () => {
  if (typeof resetDashboard === 'function') {
    resetDashboard();
  }
  const file = fileInput.files[0];
  updateSelectedFileUI(file);

  if (statusLog) {
    statusLog.textContent = file
      ? `File selected: '${file.name}' (${formatFileSize(file.size)}). Click "Start Upload and Analysis" to transmit.`
      : 'Select a file and click "Start Upload and Analysis".';
  }

  if (progressWrapper) progressWrapper.style.display = 'none';
  if (uploadProgressBar) uploadProgressBar.style.width = '0%';
  if (progressLabel) progressLabel.textContent = '0%';
});

uploadBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    alert('Please select a file to upload first.');
    return;
  }

  uploadBtn.disabled = true;
  if (typeof resetDashboard === 'function') {
    resetDashboard();
  }

  if (statusBadge) {
    statusBadge.textContent = 'Preparing Variants...';
    statusBadge.className = 'badge badge-busy';
  }

  if (progressWrapper) progressWrapper.style.display = 'flex';
  if (uploadProgressBar) uploadProgressBar.style.width = '5%';
  if (progressLabel) progressLabel.textContent = '5%';

  if (statusLog) {
    statusLog.textContent = `Generating variants (Plain, Compressed, Encrypted) for '${file.name}'...`;
  }

  try {
    // 1. Prepare all 3 file variants concurrently (MEMBER 2)
    const variants = await prepareAllVariants(file);

    // Calculate total chunks across all variants for smooth progress
    let totalAllChunks = 0;
    variants.forEach((v) => {
      totalAllChunks += Math.max(1, Math.ceil(v.blob.size / CHUNK_SIZE));
    });

    let completedChunks = 0;
    const onChunkStep = () => {
      completedChunks++;
      const percent = Math.min(100, Math.round((completedChunks / totalAllChunks) * 100));
      if (uploadProgressBar) uploadProgressBar.style.width = `${percent}%`;
      if (progressLabel) progressLabel.textContent = `${percent}%`;
    };

    if (statusBadge) {
      statusBadge.textContent = 'Transmitting Chunks...';
      statusBadge.className = 'badge badge-busy';
    }

    // 2. Transfer each variant and update Member 3's charts
    for (const variant of variants) {
      await uploadVariantInChunks(variant, onChunkStep);
    }

    if (uploadProgressBar) uploadProgressBar.style.width = '100%';
    if (progressLabel) progressLabel.textContent = '100%';
    if (statusBadge) {
      statusBadge.textContent = 'Complete';
      statusBadge.className = 'badge badge-done';
    }

    appendLog(`\nCompleted! All 3 variants have been transferred and sent to the charts.`);
  } catch (error) {
    appendLog(`Upload error: ${error.message}`);
    if (statusBadge) {
      statusBadge.textContent = 'Error';
      statusBadge.className = 'badge badge-busy';
    }
  } finally {
    uploadBtn.disabled = false;
  }
});