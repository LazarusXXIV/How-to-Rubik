import * as THREE from 'three';
import type { Axis, CubieStickerInfo, FaceKey, LayerIndex, Move, TurnDirection } from '../types';

const AXES: readonly Axis[] = ['x', 'y', 'z'];
const OUTER_LAYERS: readonly LayerIndex[] = [-1, 1];
const DIRECTIONS: readonly TurnDirection[] = [1, -1];

const FACE_LOCAL_NORMALS: Record<FaceKey, THREE.Vector3> = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
};

export function snapGridCoord(value: number): LayerIndex {
  const rounded = Math.round(value);
  if (rounded <= -1) return -1;
  if (rounded >= 1) return 1;
  return 0;
}

function snapUnitAxis(v: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  if (ax >= ay && ax >= az) {
    return new THREE.Vector3(v.x >= 0 ? 1 : -1, 0, 0);
  }
  if (ay >= ax && ay >= az) {
    return new THREE.Vector3(0, v.y >= 0 ? 1 : -1, 0);
  }
  return new THREE.Vector3(0, 0, v.z >= 0 ? 1 : -1);
}

export function snapQuaternion90(q: THREE.Quaternion): THREE.Quaternion {
  const mat = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  mat.extractBasis(xAxis, yAxis, zAxis);

  const snappedX = snapUnitAxis(xAxis);
  const snappedY = snapUnitAxis(yAxis);
  const snappedZ = new THREE.Vector3().crossVectors(snappedX, snappedY);

  const snappedMat = new THREE.Matrix4().makeBasis(snappedX, snappedY, snappedZ);
  return new THREE.Quaternion().setFromRotationMatrix(snappedMat).normalize();
}

export function isCubieInSlice(pos: THREE.Vector3, axis: Axis, layer: LayerIndex): boolean {
  return snapGridCoord(pos[axis]) === layer;
}

export function invertMove(move: Move): Move {
  return {
    axis: move.axis,
    layer: move.layer,
    dir: (move.dir * -1) as TurnDirection,
  };
}

export function generateScramble(length = 20): Move[] {
  const moves: Move[] = [];
  let prevAxis: Axis | null = null;
  for (let i = 0; i < length; i++) {
    const candidates = AXES.filter((a) => a !== prevAxis);
    const axis = candidates[Math.floor(Math.random() * candidates.length)];
    const layer = OUTER_LAYERS[Math.floor(Math.random() * OUTER_LAYERS.length)];
    const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    moves.push({ axis, layer, dir });
    prevAxis = axis;
  }
  return moves;
}

function normalToWorldKey(v: THREE.Vector3): string {
  const snapped = snapUnitAxis(v);
  return `${snapped.x},${snapped.y},${snapped.z}`;
}

export function isCubeSolved(cubies: ReadonlyArray<CubieStickerInfo>): boolean {
  const faceBuckets = new Map<string, Set<FaceKey>>();
  const tmpNormal = new THREE.Vector3();

  for (const cubie of cubies) {
    for (const [faceKey, colorKey] of Object.entries(cubie.faceColors) as [FaceKey, FaceKey][]) {
      tmpNormal.copy(FACE_LOCAL_NORMALS[faceKey]).applyQuaternion(cubie.quaternion);
      const bucketKey = normalToWorldKey(tmpNormal);
      let bucket = faceBuckets.get(bucketKey);
      if (!bucket) {
        bucket = new Set<FaceKey>();
        faceBuckets.set(bucketKey, bucket);
      }
      bucket.add(colorKey);
    }
  }

  if (faceBuckets.size !== 6) return false;
  for (const colors of faceBuckets.values()) {
    if (colors.size !== 1) return false;
  }
  return true;
}

export class MoveHistory {
  private readonly stack: Move[] = [];

  push(move: Move): void {
    this.stack.push({ ...move });
  }

  pop(): Move | undefined {
    return this.stack.pop();
  }

  clear(): void {
    this.stack.length = 0;
  }

  get count(): number {
    return this.stack.length;
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }
}
