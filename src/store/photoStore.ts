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
    for (const p of get().photos) {
      URL.revokeObjectURL(p.blobUrl);
    }
    set({ photos: [], selectedId: null });
  },
  setSelected: (id) => set({ selectedId: id }),
}));
