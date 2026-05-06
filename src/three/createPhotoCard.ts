import {
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  Group,
} from 'three';
import type { Photo } from '../types/photo';

export interface PhotoCard {
  group: Group;
  mesh: Mesh;
  photoId: string;
  dispose: () => void;
}

const CARD_BASE_HEIGHT = 0.8;

export function createPhotoCard(photo: Photo, scale = 1.0): PhotoCard {
  const height = CARD_BASE_HEIGHT * scale;
  const width = height * photo.aspectRatio;

  const geom = new PlaneGeometry(width, height);

  const texture = new CanvasTexture(photo.bitmap as unknown as HTMLCanvasElement);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.flipY = false; // ImageBitmap is already in WebGL-correct orientation
  texture.needsUpdate = true;

  const mat = new MeshBasicMaterial({ map: texture, toneMapped: false });
  const mesh = new Mesh(geom, mat);
  mesh.userData.photoId = photo.id;
  mesh.userData.kind = 'photoCard';

  const group = new Group();
  group.add(mesh);
  group.userData.photoId = photo.id;

  return {
    group,
    mesh,
    photoId: photo.id,
    dispose: () => {
      geom.dispose();
      mat.dispose();
      texture.dispose();
    },
  };
}
