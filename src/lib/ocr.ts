// On-device OCR with tesseract.js. The worker, the WASM core and the German+English
// language data are bundled in /public/ocr and loaded from this app's own origin only.
// No CDN, no outside server: workerPath/corePath/langPath are all same-origin, and
// cacheMethod 'none' keeps the engine from writing to or reading from any remote cache.

import { createWorker, OEM } from 'tesseract.js';

const base = import.meta.env.BASE_URL;

export interface OcrProgress { status: string; progress: number; }

export async function ocrImage(image: Blob, onProgress?: (p: OcrProgress) => void): Promise<string> {
  const worker = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, {
    workerPath: `${base}ocr/worker.min.js`,
    corePath: `${base}ocr/core`,
    langPath: `${base}ocr/lang`,
    cacheMethod: 'none',
    gzip: true,
    logger: (m) => {
      if (onProgress && 'progress' in m) onProgress({ status: m.status, progress: m.progress });
    }
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
