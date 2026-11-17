/**
 * Modulo di Compressione e Cifratura lato Browser (MEMBRO 2)
 * Genera automaticamente le 3 varianti (plain, compressed, encrypted)
 * a partire dal file selezionato dall'utente.
 */

async function compressBlob(file) {
  const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).blob();
}

async function encryptBlob(file) {
  const plainBuffer = await file.arrayBuffer();
  const key = await crypto.subtle.generateKey(
    { name: 'AES-CTR', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const counter = crypto.getRandomValues(new Uint8Array(16));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-CTR', counter, length: 64 },
    key,
    plainBuffer
  );

  return new Blob([cipherBuffer], { type: 'application/octet-stream' });
}

/**
 * Restituisce in parallelo le 3 versioni del file pronte per l'upload a chunk
 */
async function prepareAllVariants(file) {
  const [compressedBlob, encryptedBlob] = await Promise.all([
    compressBlob(file),
    encryptBlob(file)
  ]);

  return [
    {
      dataType: 'plain',
      fileName: file.name,
      blob: file,
      label: `Plaintext (${file.size} byte)`
    },
    {
      dataType: 'compressed',
      fileName: `${file.name}.gz`,
      blob: compressedBlob,
      label: `Compresso GZIP (${compressedBlob.size} byte)`
    },
    {
      dataType: 'encrypted',
      fileName: `${file.name}.aes`,
      blob: encryptedBlob,
      label: `Cifrato AES-256-CTR (${encryptedBlob.size} byte)`
    }
  ];
}