import type { Photo } from '../types/photo';

const MAX_TEXTURE_EDGE = 512;

export async function loadPhoto(file: File): Promise<Photo> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`Not an image: ${file.name} (type=${file.type})`);
  }

  const blobUrl = URL.createObjectURL(file);

  // Get original dimensions via a temporary ImageBitmap, then make a downscaled copy for WebGL.
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

  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    blobUrl,
    bitmap,
    aspectRatio,
  };
}
