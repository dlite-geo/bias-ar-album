import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { SavedSpace, PhotoMeta } from '../types/space';
import type { Photo } from '../types/photo';
import type { PhotoSlot } from '../lib/computeLayout';
import { makeUploadBlob, uploadPhoto, downloadPhoto, deleteSpacePhotos } from '../lib/storage';

interface Progress {
  current: number;
  total: number;
}

interface SpaceState {
  list: SavedSpace[];
  loadingList: boolean;
  saveProgress: Progress | null;
  loadProgress: Progress | null;
  fetchList: () => Promise<{ error: string | null }>;
  saveCurrent: (
    name: string,
    layoutSeed: number,
    photoMeta: PhotoMeta[],
    files: File[],
  ) => Promise<{ error: string | null; id: string | null }>;
  loadSpace: (
    space: SavedSpace,
  ) => Promise<{ error: string | null; photos: Photo[] | null; layout: PhotoSlot[] | null }>;
  deleteSpace: (id: string) => Promise<{ error: string | null }>;
}

async function blobToPhoto(blob: Blob, name: string, contentHash: string): Promise<Photo> {
  const original = await createImageBitmap(blob);
  const aspectRatio = original.width / original.height;
  const MAX_TEXTURE = 512;
  let w = original.width;
  let h = original.height;
  if (Math.max(w, h) > MAX_TEXTURE) {
    if (aspectRatio >= 1) {
      w = MAX_TEXTURE;
      h = Math.round(MAX_TEXTURE / aspectRatio);
    } else {
      h = MAX_TEXTURE;
      w = Math.round(MAX_TEXTURE * aspectRatio);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(original, 0, 0, w, h);
  original.close?.();
  const blobUrl = URL.createObjectURL(blob);
  return { id: contentHash, name, blobUrl, canvas, aspectRatio };
}

export const useSpaceStore = create<SpaceState>((set) => ({
  list: [],
  loadingList: false,
  saveProgress: null,
  loadProgress: null,

  fetchList: async () => {
    set({ loadingList: true });
    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .order('updated_at', { ascending: false });
    set({ loadingList: false, list: (data as SavedSpace[]) ?? [] });
    return { error: error?.message ?? null };
  },

  saveCurrent: async (name, layoutSeed, photoMeta, files) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Not signed in', id: null };

    if (files.length !== photoMeta.length) {
      return { error: 'Internal error: files and photo_meta length mismatch', id: null };
    }

    // 1. Insert space row to obtain its UUID.
    const { data: spaceData, error: insertError } = await supabase
      .from('spaces')
      .insert({
        user_id: user.id,
        name,
        layout_seed: layoutSeed,
        photo_meta: photoMeta,
      })
      .select()
      .single();
    if (insertError || !spaceData) {
      return { error: insertError?.message ?? 'Insert failed', id: null };
    }
    const spaceId = (spaceData as SavedSpace).id;

    // 2. Upload each photo. On any failure, roll back: delete row + storage folder.
    set({ saveProgress: { current: 0, total: files.length } });
    for (let i = 0; i < files.length; i++) {
      try {
        const blob = await makeUploadBlob(files[i]);
        const { error } = await uploadPhoto(user.id, spaceId, photoMeta[i].contentHash, blob);
        if (error) {
          set({ saveProgress: null });
          await supabase.from('spaces').delete().eq('id', spaceId);
          await deleteSpacePhotos(user.id, spaceId);
          return { error, id: null };
        }
      } catch (err) {
        set({ saveProgress: null });
        await supabase.from('spaces').delete().eq('id', spaceId);
        await deleteSpacePhotos(user.id, spaceId);
        return { error: err instanceof Error ? err.message : String(err), id: null };
      }
      set({ saveProgress: { current: i + 1, total: files.length } });
    }
    set({ saveProgress: null });
    return { error: null, id: spaceId };
  },

  loadSpace: async (space) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Not signed in', photos: null, layout: null };

    set({ loadProgress: { current: 0, total: space.photo_meta.length } });
    const photos: Photo[] = [];
    const layout: PhotoSlot[] = [];

    for (let i = 0; i < space.photo_meta.length; i++) {
      const meta = space.photo_meta[i];
      const { blob, error } = await downloadPhoto(user.id, space.id, meta.contentHash);
      if (error || !blob) {
        set({ loadProgress: null });
        return {
          error: `Failed to download photo ${i + 1} of ${space.photo_meta.length}: ${error ?? 'no blob'}`,
          photos: null,
          layout: null,
        };
      }
      try {
        const photo = await blobToPhoto(blob, meta.name, meta.contentHash);
        photos.push(photo);
        layout.push({
          index: photos.length - 1,
          position: meta.position,
          scale: meta.scale,
        });
      } catch (err) {
        set({ loadProgress: null });
        return {
          error: `Failed to decode photo ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
          photos: null,
          layout: null,
        };
      }
      set({ loadProgress: { current: i + 1, total: space.photo_meta.length } });
    }
    set({ loadProgress: null });
    return { error: null, photos, layout };
  },

  deleteSpace: async (id) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Not signed in' };
    // Best-effort photo cleanup; row deletion is the source of truth for the list.
    const photoErr = await deleteSpacePhotos(user.id, id);
    if (photoErr.error) console.warn('Failed to delete photos for space', id, photoErr.error);
    const { error } = await supabase.from('spaces').delete().eq('id', id);
    return { error: error?.message ?? null };
  },
}));
