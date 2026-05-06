import type { Photo } from '../types/photo';

const MAX_TEXTURE_EDGE = 512;

export async function loadPhoto(file: File): Promise<Photo> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`Not an image: ${file.name} (type=${file.type})`);
  }

  const blobUrl = URL.createObjectURL(file);

  // Get original dimensions, then make a downscaled copy.
  const original = await createImageBitmap(file);
  const aspectRatio = original.width / original.height;

  let targetW = original.width;
  let targetH = original.height;
  if (Math.max(targetW, targetH) > MAX_TEXTURE_EDGE) {
    if (aspectRatio >= 1) {
      targetW = MAX_TEXTURE_EDGE;
      targetH = Math.round(MAX_TEXTURE_EDGE / aspectRatio);
    } else {
      targetH = MAX_TEXTURE_EDGE;
      targetW = Math.round(MAX_TEXTURE_EDGE * aspectRatio);
    }
  }

  const bitmap = await createImageBitmap(file, {
    resizeWidth: targetW,
    resizeHeight: targetH,
    resizeQuality: 'high',
  });
  original.close?.();

  // Draw the bitmap to a 2D canvas. WebGL handles canvas uploads consistently
  // with `flipY = true` (default), unlike ImageBitmap which may be ignored on some browsers.
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    blobUrl,
    canvas,
    aspectRatio,
  };
}
