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

const CARD_BASE_HEIGHT = 1.0;

export function createPhotoCard(photo: Photo): PhotoCard {
  const width = CARD_BASE_HEIGHT * photo.aspectRatio;
  const height = CARD_BASE_HEIGHT;

  const geom = new PlaneGeometry(width, height);

  const texture = new CanvasTexture(photo.bitmap as unknown as HTMLCanvasElement);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
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
