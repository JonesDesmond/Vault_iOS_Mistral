// Shrink large photos before storing them on-device (keeps the database small).

export async function shrinkImage(file: Blob, maxDim = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale >= 1) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return await new Promise<Blob>(res => canvas.toBlob(b => res(b ?? file), 'image/jpeg', quality));
  } catch {
    return file;
  }
}

export async function makeThumb(blob: Blob, size = 256): Promise<Blob | undefined> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, size / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return await new Promise<Blob | undefined>(res => canvas.toBlob(b => res(b ?? undefined), 'image/jpeg', 0.7));
  } catch {
    return undefined;
  }
}
