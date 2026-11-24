import * as THREE from 'three';
import type { Axis, CubieStickerInfo, FaceKey, LayerIndex, Move, TurnDirection } from '../types';
import { snapGridCoord } from './cubeLogic';

const FACE_LOCAL_NORMALS: Record<FaceKey, THREE.Vector3> = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
};

const FACE_SCAN_SPEC: ReadonlyArray<{
  face: FaceKey;
  worldNormal: [number, number, number];
  coords: Array<[LayerIndex, LayerIndex, LayerIndex]>;
}> = [
  {
    face: 'U',
    worldNormal: [0, 1, 0],
    coords: ([-1, 0, 1] as LayerIndex[]).flatMap((z) =>
      ([-1, 0, 1] as LayerIndex[]).map((x) => [x, 1, z] as [LayerIndex, LayerIndex, LayerIndex]),
    ),
  },
  {
    face: 'R',
    worldNormal: [1, 0, 0],
    coords: ([1, 0, -1] as LayerIndex[]).flatMap((y) =>
      ([1, 0, -1] as LayerIndex[]).map((z) => [1, y, z] as [LayerIndex, LayerIndex, LayerIndex]),
    ),
  },
  {
    face: 'F',
    worldNormal: [0, 0, 1],
    coords: ([1, 0, -1] as LayerIndex[]).flatMap((y) =>
      ([-1, 0, 1] as LayerIndex[]).map((x) => [x, y, 1] as [LayerIndex, LayerIndex, LayerIndex]),
    ),
  },
  {
    face: 'D',
    worldNormal: [0, -1, 0],
    coords: ([1, 0, -1] as LayerIndex[]).flatMap((z) =>
      ([-1, 0, 1] as LayerIndex[]).map((x) => [x, -1, z] as [LayerIndex, LayerIndex, LayerIndex]),
    ),
  },
  {
    face: 'L',
    worldNormal: [-1, 0, 0],
    coords: ([1, 0, -1] as LayerIndex[]).flatMap((y) =>
      ([-1, 0, 1] as LayerIndex[]).map((z) => [-1, y, z] as [LayerIndex, LayerIndex, LayerIndex]),
    ),
  },
  {
    face: 'B',
    worldNormal: [0, 0, -1],
    coords: ([1, 0, -1] as LayerIndex[]).flatMap((y) =>
      ([1, 0, -1] as LayerIndex[]).map((x) => [x, y, -1] as [LayerIndex, LayerIndex, LayerIndex]),
    ),
  },
];

const NOTATION_BASE: Record<FaceKey, { axis: Axis; layer: LayerIndex; cwDir: TurnDirection }> = {
  U: { axis: 'y', layer: 1, cwDir: -1 },
  D: { axis: 'y', layer: -1, cwDir: 1 },
  R: { axis: 'x', layer: 1, cwDir: -1 },
  L: { axis: 'x', layer: -1, cwDir: 1 },
  F: { axis: 'z', layer: 1, cwDir: -1 },
  B: { axis: 'z', layer: -1, cwDir: 1 },
};

function snapCardinal(v: THREE.Vector3): [number, number, number] {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  if (ax >= ay && ax >= az) return [v.x >= 0 ? 1 : -1, 0, 0];
  if (ay >= ax && ay >= az) return [0, v.y >= 0 ? 1 : -1, 0];
  return [0, 0, v.z >= 0 ? 1 : -1];
}

export function serializeCubeToFacelets(cubies: ReadonlyArray<CubieStickerInfo>): string {
  // Index cubies by snapped grid position "x,y,z"
  const byPos = new Map<string, CubieStickerInfo>();
  for (const c of cubies) {
    const key = `${snapGridCoord(c.position.x)},${snapGridCoord(c.position.y)},${snapGridCoord(c.position.z)}`;
    byPos.set(key, c);
  }

  // Determine which color sits at each center block so encoding is robust even after whole-cube turns
  const centerColorToFace = new Map<FaceKey, FaceKey>();
  const tmpNormal = new THREE.Vector3();

  const readSticker = (
    x: LayerIndex,
    y: LayerIndex,
    z: LayerIndex,
    targetNormal: [number, number, number],
  ): FaceKey => {
    const cubie = byPos.get(`${x},${y},${z}`);
    if (!cubie) {
      throw new Error(`Missing cubie at (${x},${y},${z})`);
    }
    for (const [localFace, colorKey] of Object.entries(cubie.faceColors) as [FaceKey, FaceKey][]) {
      tmpNormal.copy(FACE_LOCAL_NORMALS[localFace]).applyQuaternion(cubie.quaternion);
      const [nx, ny, nz] = snapCardinal(tmpNormal);
      if (nx === targetNormal[0] && ny === targetNormal[1] && nz === targetNormal[2]) {
        return colorKey;
      }
    }
    throw new Error(`No sticker facing (${targetNormal.join(',')}) on cubie (${x},${y},${z})`);
  };

  for (const spec of FACE_SCAN_SPEC) {
    const [cx, cy, cz] = spec.coords[4];
    const color = readSticker(cx, cy, cz, spec.worldNormal);
    centerColorToFace.set(color, spec.face);
  }

  const out: string[] = [];
  for (const spec of FACE_SCAN_SPEC) {
    for (const [x, y, z] of spec.coords) {
      const color = readSticker(x, y, z, spec.worldNormal);
      out.push(centerColorToFace.get(color) ?? color);
    }
  }
  return out.join('');
}

export function notationToMove(token: string): Move {
  const trimmed = token.trim();
  const face = trimmed[0] as FaceKey;
  const spec = NOTATION_BASE[face];
  if (!spec) {
    throw new Error(`Invalid Singmaster move notation: "${token}"`);
  }
  const suffix = trimmed.slice(1);
  if (suffix === '') {
    return { axis: spec.axis, layer: spec.layer, dir: spec.cwDir, turns: 1 };
  }
  if (suffix === "'") {
    return {
      axis: spec.axis,
      layer: spec.layer,
      dir: (spec.cwDir * -1) as TurnDirection,
      turns: 1,
    };
  }
  if (suffix === '2') {
    return { axis: spec.axis, layer: spec.layer, dir: spec.cwDir, turns: 2 };
  }
  throw new Error(`Invalid Singmaster move suffix: "${token}"`);
}

export function invertNotation(token: string): string {
  const trimmed = token.trim();
  if (trimmed.endsWith('2')) return trimmed;
  if (trimmed.endsWith("'")) return trimmed.slice(0, 1);
  return `${trimmed}'`;
}

export function moveToNotation(move: Move): string {
  for (const [face, spec] of Object.entries(NOTATION_BASE) as [
    FaceKey,
    { axis: Axis; layer: LayerIndex; cwDir: TurnDirection },
  ][]) {
    if (spec.axis === move.axis && spec.layer === move.layer) {
      if (move.turns === 2) return `${face}2`;
      return move.dir === spec.cwDir ? face : `${face}'`;
    }
  }
  throw new Error(`Cannot convert middle-slice move to Singmaster notation: ${JSON.stringify(move)}`);
}
