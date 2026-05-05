export interface PhotoNode {
  id: string;
  lat: number;
  lng: number;
  takenAt: number; // epoch ms
  thumbnailUrl: string;
  fullUrl: string;
  isLive: boolean;
  livePhotoVideoUrl?: string;
}

export interface Stop {
  id: string;
  lat: number;
  lng: number;
  label: string;
  photos: PhotoNode[];
  arrivalAt: number;
  departureAt: number;
}

export interface Trip {
  id: string;
  name: string;
  stops: Stop[];
}
