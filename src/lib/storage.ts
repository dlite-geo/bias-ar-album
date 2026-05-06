import { supabase } from './supabase';

const BUCKET = 'photos';
const UPLOAD_MAX_EDGE = 1024;
const UPLOAD_QUALITY = 0.85;

// Encode a File as a JPEG Blob downscaled to UPLOAD_MAX_EDGE on the long side.
export async function makeUploadBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const aspectRatio = bitmap.width / bitmap.height;
  let w = bitmap.width;
  let h = bitmap.height;
  if (Math.max(w, h) > UPLOAD_MAX_EDGE) {
    if (aspectRatio >= 1) {
      w = UPLOAD_MAX_EDGE;
      h = Math.round(UPLOAD_MAX_EDGE / aspectRatio);
    } else {
      h = UPLOAD_MAX_EDGE;
      w = Math.round(UPLOAD_MAX_EDGE * aspectRatio);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      'image/jpeg',
      UPLOAD_QUALITY,
    );
  });
}

export function pathFor(userId: string, spaceId: string, contentHash: string): string {
  return `${userId}/${spaceId}/${contentHash}.jpg`;
}

export async function uploadPhoto(
  userId: string,
  spaceId: string,
  contentHash: string,
  blob: Blob,
): Promise<{ error: string | null }> {
  const path = pathFor(userId, spaceId, contentHash);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  return { error: error?.message ?? null };
}

export async function downloadPhoto(
  userId: string,
  spaceId: string,
  contentHash: string,
): Promise<{ blob: Blob | null; error: string | null }> {
  const path = pathFor(userId, spaceId, contentHash);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  return { blob: data ?? null, error: error?.message ?? null };
}

export async function deleteSpacePhotos(
  userId: string,
  spaceId: string,
): Promise<{ error: string | null }> {
  const folder = `${userId}/${spaceId}`;
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(folder);
  if (listError) return { error: listError.message };
  if (!files || files.length === 0) return { error: null };
  const paths = files.map((f) => `${folder}/${f.name}`);
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  return { error: error?.message ?? null };
}
