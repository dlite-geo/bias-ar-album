import { create } from 'zustand';
import type { Photo } from '../types/photo';
import type { PhotoSlot } from '../lib/computeLayout';

interface PhotoState {
  photos: Photo[];
  selectedId: string | null;
  layout: PhotoSlot[] | null; // null = compute fresh; non-null = use these slots verbatim
  setPhotos: (photos: Photo[]) => void;
  setLayout: (layout: PhotoSlot[] | null) => void;
  clear: () => void;
  setSelected: (id: string | null) => void;
}

export const usePhotoStore = create<PhotoState>((set, get) => ({
  photos: [],
  selectedId: null,
  layout: null,
  setPhotos: (photos) => set({ photos }),
  setLayout: (layout) => set({ layout }),
  clear: () => {
    for (const p of get().photos) {
      URL.revokeObjectURL(p.blobUrl);
    }
    set({ photos: [], selectedId: null, layout: null });
  },
  setSelected: (id) => set({ selectedId: id }),
}));
