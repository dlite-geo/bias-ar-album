import {
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  Color,
  type Vector3,
} from 'three';

export interface PhotoNodeMesh {
  mesh: Mesh;
  dispose: () => void;
}

export function createPhotoNode(position: Vector3, id: string): PhotoNodeMesh {
  const geom = new SphereGeometry(0.018, 24, 24);
  const mat = new MeshBasicMaterial({ color: new Color(0xffffff) });
  const mesh = new Mesh(geom, mat);
  mesh.position.copy(position);
  mesh.userData.id = id;
  mesh.userData.kind = 'photoNode';
  return {
    mesh,
    dispose: () => {
      geom.dispose();
      mat.dispose();
    },
  };
}
