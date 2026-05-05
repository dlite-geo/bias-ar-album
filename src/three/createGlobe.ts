import {
  Mesh,
  SphereGeometry,
  ShaderMaterial,
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  MeshBasicMaterial,
} from 'three';

export interface Globe {
  group: Group;
  surface: Mesh;
  atmosphere: Mesh;
  radius: number;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

export function createGlobe(radius = 1): Globe {
  const group = new Group();

  // Surface: solid dark grey sphere with a subtle wireframe overlay.
  // Texture-based stylized atlas comes in a later phase; this stub
  // gives us a globe-shaped target for the render pipeline today.
  const surfaceGeo = new SphereGeometry(radius, 64, 64);
  const surfaceMat = new MeshBasicMaterial({ color: new Color(0x141414) });
  const surface = new Mesh(surfaceGeo, surfaceMat);
  group.add(surface);

  // Atmosphere: Fresnel rim glow on backside sphere
  const atmoMat = new ShaderMaterial({
    transparent: true,
    blending: AdditiveBlending,
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uColor: { value: new Color(0x3df9ff) },
      uIntensity: { value: 0.7 },
      uPower: { value: 2.5 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPositionView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vPositionView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPositionView;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uPower;
      void main() {
        vec3 viewDir = normalize(-vPositionView);
        float rim = pow(1.0 - max(dot(vNormal, viewDir), 0.0), uPower);
        gl_FragColor = vec4(uColor * rim * uIntensity, rim);
      }
    `,
  });
  const atmoGeo = new SphereGeometry(radius * 1.18, 64, 64);
  const atmosphere = new Mesh(atmoGeo, atmoMat);
  group.add(atmosphere);

  function update(deltaSeconds: number) {
    // 0.036 rad/sec ≈ ~1 full revolution every 175 seconds
    group.rotation.y += 0.036 * deltaSeconds;
  }

  function dispose() {
    surfaceGeo.dispose();
    surfaceMat.dispose();
    atmoGeo.dispose();
    atmoMat.dispose();
  }

  return { group, surface, atmosphere, radius, update, dispose };
}
