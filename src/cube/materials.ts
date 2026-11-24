import * as THREE from 'three';
import type { FaceKey } from '../types';

export const FACE_HEX_COLORS: Record<FaceKey, number> = {
  U: 0xa259ff,
  D: 0xfacc15,
  F: 0x10b981,
  B: 0x2563eb,
  R: 0xef4444,
  L: 0xf97316,
};

export interface FrostedGlassParams {
  roughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  clearcoat: number;
  clearcoatRoughness: number;
  attenuationDistance: number;
  envMapIntensity: number;
  backingRoughness: number;
}

export const FROSTED_GLASS_PARAMS: FrostedGlassParams = {
  roughness: 0.36,
  transmission: 0.72,
  thickness: 0.9,
  ior: 1.49,
  clearcoat: 0.25,
  clearcoatRoughness: 0.35,
  attenuationDistance: 1.1,
  envMapIntensity: 1.15,
  backingRoughness: 0.65,
};

export interface GlassMaterialPool {
  shell: THREE.MeshPhysicalMaterial;
  core: THREE.MeshStandardMaterial;
  faceGlass: Record<FaceKey, THREE.MeshPhysicalMaterial>;
  faceBacking: Record<FaceKey, THREE.MeshStandardMaterial>;
  dispose(): void;
}

const FACE_KEYS: readonly FaceKey[] = ['U', 'D', 'F', 'B', 'R', 'L'];

function makeSoftBackingColor(hex: number): THREE.Color {
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.16);
}

function makeGlassSurfaceTint(hex: number): THREE.Color {
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.12);
}

export function createGlassMaterialPool(): GlassMaterialPool {
  const params = FROSTED_GLASS_PARAMS;

  const shell = new THREE.MeshPhysicalMaterial({
    color: 0xf7f9fc,
    attenuationColor: new THREE.Color(0xeef2f7),
    attenuationDistance: params.attenuationDistance,
    roughness: params.roughness,
    metalness: 0,
    transmission: params.transmission,
    thickness: params.thickness,
    ior: params.ior,
    clearcoat: params.clearcoat,
    clearcoatRoughness: params.clearcoatRoughness,
    envMapIntensity: params.envMapIntensity,
    specularIntensity: 1,
    specularColor: new THREE.Color(0xffffff),
    transparent: false,
  });

  const core = new THREE.MeshStandardMaterial({
    color: 0xe6eaf0,
    roughness: 0.72,
    metalness: 0.02,
    transparent: false,
  });

  const faceGlass = {} as Record<FaceKey, THREE.MeshPhysicalMaterial>;
  const faceBacking = {} as Record<FaceKey, THREE.MeshStandardMaterial>;

  for (const face of FACE_KEYS) {
    const hex = FACE_HEX_COLORS[face];
    faceGlass[face] = new THREE.MeshPhysicalMaterial({
      color: makeGlassSurfaceTint(hex),
      attenuationColor: new THREE.Color(hex),
      attenuationDistance: params.attenuationDistance,
      roughness: params.roughness,
      metalness: 0,
      transmission: params.transmission,
      thickness: params.thickness,
      ior: params.ior,
      clearcoat: params.clearcoat,
      clearcoatRoughness: params.clearcoatRoughness,
      envMapIntensity: params.envMapIntensity,
      specularIntensity: 1,
      specularColor: new THREE.Color(0xffffff),
      transparent: false,
    });

    faceBacking[face] = new THREE.MeshStandardMaterial({
      color: makeSoftBackingColor(hex),
      roughness: params.backingRoughness,
      metalness: 0.02,
      transparent: false,
    });
  }

  return {
    shell,
    core,
    faceGlass,
    faceBacking,
    dispose() {
      shell.dispose();
      core.dispose();
      for (const face of FACE_KEYS) {
        faceGlass[face].dispose();
        faceBacking[face].dispose();
      }
    },
  };
}
