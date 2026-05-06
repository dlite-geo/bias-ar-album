import { create } from 'zustand';
import type { Photo } from '../types/photo';

interface PhotoState {
  photos: Photo[];
  selectedId: string | null;
  setPhotos: (photos: Photo[]) => void;
  clear: () => void;
  setSelected: (id: string | null) => void;
}

export const usePhotoStore = create<PhotoState>((set, get) => ({
  photos: [],
  selectedId: null,
  setPhotos: (photos) => set({ photos }),
  clear: () => {
    // Revoke ObjectURLs and close bitmaps to release memory
    for (const p of get().photos) {
      URL.revokeObjectURL(p.blobUrl);
      p.bitmap.close?.();
    }
    set({ photos: [], selectedId: null });
  },
  setSelected: (id) => set({ selectedId: id }),
}));
