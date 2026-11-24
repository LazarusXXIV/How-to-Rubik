import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { isCubieInSlice, snapGridCoord, snapQuaternion90 } from '../src/cube/cubeLogic';
import {
  moveToNotation,
  notationToMove,
  serializeCubeToFacelets,
} from '../src/cube/cubeSerializer';
import type { CubieStickerInfo, FaceKey } from '../src/types';

function makeSolvedCubies(): CubieStickerInfo[] {
  const cubies: CubieStickerInfo[] = [];
  for (const x of [-1, 0, 1] as const) {
    for (const y of [-1, 0, 1] as const) {
      for (const z of [-1, 0, 1] as const) {
        const faceColors: Partial<Record<FaceKey, FaceKey>> = {};
        if (y === 1) faceColors.U = 'U';
        if (y === -1) faceColors.D = 'D';
        if (z === 1) faceColors.F = 'F';
        if (z === -1) faceColors.B = 'B';
        if (x === 1) faceColors.R = 'R';
        if (x === -1) faceColors.L = 'L';
        cubies.push({
          position: new THREE.Vector3(x, y, z),
          quaternion: new THREE.Quaternion(),
          faceColors,
        });
      }
    }
  }
  return cubies;
}

function applyNotation(cubies: CubieStickerInfo[], tokens: string[]): void {
  for (const token of tokens) {
    const parsed = notationToMove(token);
    const turns = parsed.turns ?? 1;
    const axisVec = new THREE.Vector3(
      parsed.axis === 'x' ? 1 : 0,
      parsed.axis === 'y' ? 1 : 0,
      parsed.axis === 'z' ? 1 : 0,
    );
    const rotQ = new THREE.Quaternion().setFromAxisAngle(
      axisVec,
      (Math.PI / 2) * parsed.dir * turns,
    );
    for (const c of cubies) {
      if (isCubieInSlice(c.position, parsed.axis, parsed.layer)) {
        c.position.applyQuaternion(rotQ);
        c.position.set(
          snapGridCoord(c.position.x),
          snapGridCoord(c.position.y),
          snapGridCoord(c.position.z),
        );
        c.quaternion.premultiply(rotQ);
        c.quaternion.copy(snapQuaternion90(c.quaternion));
      }
    }
  }
}

describe('cubeSerializer', () => {
  it('serializes a solved cube to the standard 54-char URFDLB string', () => {
    const cubies = makeSolvedCubies();
    expect(serializeCubeToFacelets(cubies)).toBe(
      'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB',
    );
  });

  it('produces the exact standard facelet permutation after a single R clockwise turn', () => {
    const cubies = makeSolvedCubies();
    applyNotation(cubies, ['R']);
    // Standard Singmaster R clockwise:
    // F right col (20,23,26) -> U right col (2,5,8)
    // U right col (2,5,8) -> B left col (51,48,45)
    // B left col -> D right col (29,32,35)
    // D right col -> F right col (20,23,26)
    const s = serializeCubeToFacelets(cubies);
    expect(s).toBe('UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB');
  });

  it('produces the exact standard facelet permutation after U, F, D, L, B clockwise turns', () => {
    const uCube = makeSolvedCubies();
    applyNotation(uCube, ['U']);
    // U clockwise moves R top -> F top -> L top -> B top -> R top
    expect(serializeCubeToFacelets(uCube)).toBe(
      'UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB',
    );

    const fCube = makeSolvedCubies();
    applyNotation(fCube, ['F']);
    // F clockwise: L right -> U bottom, U bottom -> R left, R left -> D top, D top -> L right
    expect(serializeCubeToFacelets(fCube)).toBe(
      'UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB',
    );
  });

  it('round-trips Singmaster notation tokens and supports prime and double turns', () => {
    const tokens = ['U', "U'", 'U2', 'D', "D'", 'D2', 'R', "R'", 'R2', 'L', "L'", 'L2', 'F', "F'", 'F2', 'B', "B'", 'B2'];
    for (const token of tokens) {
      const move = notationToMove(token);
      expect(moveToNotation(move)).toBe(token);
    }
  });

  it('returns to solved string after R U R\' U\' repeated 6 times (sexy move order = 6)', () => {
    const cubies = makeSolvedCubies();
    for (let i = 0; i < 6; i++) {
      applyNotation(cubies, ['R', 'U', "R'", "U'"]);
    }
    expect(serializeCubeToFacelets(cubies)).toBe(
      'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB',
    );
  });
});
