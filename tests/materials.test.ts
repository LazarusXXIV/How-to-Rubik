import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FACE_HEX_COLORS,
  FROSTED_GLASS_PARAMS,
  createGlassMaterialPool,
} from '../src/cube/materials';
import type { FaceKey } from '../src/types';

const FACES: FaceKey[] = ['U', 'D', 'F', 'B', 'R', 'L'];

describe('glass material pool', () => {
  it('defines the purple U face (#a259ff) and the 5 remaining studio glass colors', () => {
    expect(FACE_HEX_COLORS).toEqual({
      U: 0xa259ff,
      D: 0xfacc15,
      F: 0x10b981,
      B: 0x2563eb,
      R: 0xef4444,
      L: 0xf97316,
    });
  });

  it('creates an opaque inner core/backing and frosted transmissive outer glass pool', () => {
    const pool = createGlassMaterialPool();

    expect(pool.core).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(pool.core.transparent).toBe(false);

    expect(pool.shell).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(pool.shell.transparent).toBe(false);
    expect(pool.shell.roughness).toBeCloseTo(FROSTED_GLASS_PARAMS.roughness);
    expect(pool.shell.transmission).toBeCloseTo(FROSTED_GLASS_PARAMS.transmission);
    expect(pool.shell.ior).toBeCloseTo(1.49);

    for (const face of FACES) {
      const glass = pool.faceGlass[face];
      const backing = pool.faceBacking[face];
      expect(glass).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(glass.roughness).toBeCloseTo(FROSTED_GLASS_PARAMS.roughness);
      expect(glass.transmission).toBeCloseTo(FROSTED_GLASS_PARAMS.transmission);
      expect(glass.thickness).toBeCloseTo(FROSTED_GLASS_PARAMS.thickness);
      expect(glass.clearcoat).toBeCloseTo(FROSTED_GLASS_PARAMS.clearcoat);
      expect(glass.clearcoatRoughness).toBeCloseTo(FROSTED_GLASS_PARAMS.clearcoatRoughness);
      expect(glass.attenuationDistance).toBeCloseTo(FROSTED_GLASS_PARAMS.attenuationDistance);

      expect(backing).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(backing.transparent).toBe(false);
    }

    expect(pool.faceGlass.U.attenuationColor.getHex()).toBe(0xa259ff);

    pool.dispose();
  });
});
