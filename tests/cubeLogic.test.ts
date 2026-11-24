import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  MoveHistory,
  generateScramble,
  invertMove,
  isCubeSolved,
  isCubieInSlice,
  snapGridCoord,
  snapQuaternion90,
} from '../src/cube/cubeLogic';
import type { CubieStickerInfo, FaceKey, Move } from '../src/types';

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

function applyMoveToCubies(cubies: CubieStickerInfo[], move: Move): void {
  const axisVec = new THREE.Vector3(
    move.axis === 'x' ? 1 : 0,
    move.axis === 'y' ? 1 : 0,
    move.axis === 'z' ? 1 : 0,
  );
  const rotQ = new THREE.Quaternion().setFromAxisAngle(axisVec, (Math.PI / 2) * move.dir);
  for (const c of cubies) {
    if (isCubieInSlice(c.position, move.axis, move.layer)) {
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

describe('cubeLogic', () => {
  it('snaps noisy coordinates to exact layer indices {-1, 0, 1}', () => {
    expect(snapGridCoord(-1.0004)).toBe(-1);
    expect(snapGridCoord(0.0002)).toBe(0);
    expect(snapGridCoord(0.9997)).toBe(1);
    expect(snapGridCoord(-2.5)).toBe(-1);
    expect(snapGridCoord(3.2)).toBe(1);
  });

  it('snaps drifted quaternions back to exact 90-degree orthogonal orientations after 100 rotations', () => {
    const q = new THREE.Quaternion();
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    for (let i = 0; i < 100; i++) {
      const step = new THREE.Quaternion().setFromAxisAngle(
        axes[i % 3],
        Math.PI / 2 + 0.0015 * (i % 2 === 0 ? 1 : -1),
      );
      q.premultiply(step);
      q.copy(snapQuaternion90(q));
    }
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const e = m.elements;
    // Rotation columns (0..2, 4..6, 8..10) must each be exact 0, 1, or -1
    for (const idx of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
      const rounded = Math.round(e[idx]);
      expect(Math.abs(e[idx] - rounded)).toBeLessThan(1e-6);
      expect([-1, 0, 1]).toContain(rounded);
    }
  });

  it('selects exactly 9 cubies for a given axis and layer', () => {
    const cubies = makeSolvedCubies();
    const slice = cubies.filter((c) => isCubieInSlice(c.position, 'y', 1));
    expect(slice).toHaveLength(9);
    for (const c of slice) {
      expect(c.position.y).toBe(1);
    }
  });

  it('generates a 20-move scramble with no consecutive same-axis moves', () => {
    const moves = generateScramble(20);
    expect(moves).toHaveLength(20);
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i].axis).not.toBe(moves[i - 1].axis);
    }
    for (const m of moves) {
      expect([-1, 1]).toContain(m.layer);
      expect([-1, 1]).toContain(m.dir);
    }
  });

  it('inverts a move cleanly', () => {
    expect(invertMove({ axis: 'x', layer: 1, dir: 1 })).toEqual({
      axis: 'x',
      layer: 1,
      dir: -1,
    });
  });

  it('detects solved state accurately including after whole-cube rotation', () => {
    const cubies = makeSolvedCubies();
    expect(isCubeSolved(cubies)).toBe(true);

    const turn: Move = { axis: 'y', layer: 1, dir: 1 };
    applyMoveToCubies(cubies, turn);
    expect(isCubeSolved(cubies)).toBe(false);

    applyMoveToCubies(cubies, invertMove(turn));
    expect(isCubeSolved(cubies)).toBe(true);

    // Whole-cube 90° rotation around Y should still be solved
    for (const layer of [-1, 0, 1] as const) {
      applyMoveToCubies(cubies, { axis: 'y', layer, dir: 1 });
    }
    expect(isCubeSolved(cubies)).toBe(true);
  });

  it('manages undo history safely when empty and after pushes/clear', () => {
    const history = new MoveHistory();
    expect(history.canUndo).toBe(false);
    expect(history.count).toBe(0);
    expect(history.pop()).toBeUndefined();

    const m1: Move = { axis: 'z', layer: 1, dir: 1 };
    const m2: Move = { axis: 'x', layer: -1, dir: -1 };
    history.push(m1);
    history.push(m2);
    expect(history.canUndo).toBe(true);
    expect(history.count).toBe(2);
    expect(history.pop()).toEqual(m2);
    expect(history.count).toBe(1);

    history.clear();
    expect(history.count).toBe(0);
    expect(history.canUndo).toBe(false);
  });
});
