import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {
  Axis,
  CubieStickerInfo,
  FaceKey,
  LayerIndex,
  Move,
  TurnDirection,
} from '../types';
import { isCubeSolved, isCubieInSlice, snapGridCoord, snapQuaternion90 } from './cubeLogic';
import { serializeCubeToFacelets } from './cubeSerializer';
import { type GlassMaterialPool, createGlassMaterialPool } from './materials';

export type MoveSource = 'user' | 'scramble' | 'undo' | 'tutorial';

export interface CubeEventCallbacks {
  onMoveComplete?: (move: Move, meta: { source: MoveSource }) => void;
  onSolvedChange?: (solved: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}

interface CubieRecord {
  group: THREE.Group;
  initialPos: THREE.Vector3;
  faceColors: Partial<Record<FaceKey, FaceKey>>;
}

interface QueuedMove {
  move: Move;
  durationMs: number;
  source: MoveSource;
}

interface ActiveAnimation {
  axis: Axis;
  layer: LayerIndex;
  startAngle: number;
  targetAngle: number;
  elapsedMs: number;
  durationMs: number;
  source: MoveSource;
  quarterTurns: number;
}

interface InteractiveDragState {
  axis: Axis;
  layer: LayerIndex;
  angle: number;
}

const FACE_PLACEMENT: Record<
  FaceKey,
  { normal: [number, number, number]; rot: [number, number, number] }
> = {
  U: { normal: [0, 1, 0], rot: [-Math.PI / 2, 0, 0] },
  D: { normal: [0, -1, 0], rot: [Math.PI / 2, 0, 0] },
  F: { normal: [0, 0, 1], rot: [0, 0, 0] },
  B: { normal: [0, 0, -1], rot: [0, Math.PI, 0] },
  R: { normal: [1, 0, 0], rot: [0, Math.PI / 2, 0] },
  L: { normal: [-1, 0, 0], rot: [0, -Math.PI / 2, 0] },
};

function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

export class RubiksCube3D {
  readonly root = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];

  private readonly pivot = new THREE.Group();
  private readonly cubies: CubieRecord[] = [];
  private readonly materialPool: GlassMaterialPool;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly callbacks: CubeEventCallbacks;

  private readonly moveQueue: QueuedMove[] = [];
  private activeAnim: ActiveAnimation | null = null;
  private dragState: InteractiveDragState | null = null;
  private lastSolved = true;
  private lastBusy = false;

  constructor(callbacks: CubeEventCallbacks = {}) {
    this.callbacks = callbacks;
    this.materialPool = createGlassMaterialPool();
    this.root.add(this.pivot);
    this.buildCubies();
  }

  private buildCubies(): void {
    const shellGeo = new RoundedBoxGeometry(0.94, 0.94, 0.94, 3, 0.095);
    const coreGeo = new RoundedBoxGeometry(0.75, 0.75, 0.75, 2, 0.08);
    const backingGeo = new RoundedBoxGeometry(0.71, 0.71, 0.045, 2, 0.018);
    const tileGeo = new RoundedBoxGeometry(0.81, 0.81, 0.055, 3, 0.022);
    this.geometries.push(shellGeo, coreGeo, backingGeo, tileGeo);

    for (const x of [-1, 0, 1] as const) {
      for (const y of [-1, 0, 1] as const) {
        for (const z of [-1, 0, 1] as const) {
          const cubieGroup = new THREE.Group();
          cubieGroup.position.set(x, y, z);

          const coreMesh = new THREE.Mesh(coreGeo, this.materialPool.core);
          coreMesh.castShadow = true;
          coreMesh.receiveShadow = false;
          cubieGroup.add(coreMesh);

          const shellMesh = new THREE.Mesh(shellGeo, this.materialPool.shell);
          shellMesh.castShadow = true;
          shellMesh.receiveShadow = false;
          shellMesh.userData.cubieGroup = cubieGroup;
          cubieGroup.add(shellMesh);
          this.pickables.push(shellMesh);

          const faceColors: Partial<Record<FaceKey, FaceKey>> = {};
          const outerFaces: FaceKey[] = [];
          if (y === 1) outerFaces.push('U');
          if (y === -1) outerFaces.push('D');
          if (z === 1) outerFaces.push('F');
          if (z === -1) outerFaces.push('B');
          if (x === 1) outerFaces.push('R');
          if (x === -1) outerFaces.push('L');

          for (const face of outerFaces) {
            faceColors[face] = face;
            const { normal, rot } = FACE_PLACEMENT[face];

            const backing = new THREE.Mesh(backingGeo, this.materialPool.faceBacking[face]);
            backing.position.set(normal[0] * 0.388, normal[1] * 0.388, normal[2] * 0.388);
            backing.rotation.set(rot[0], rot[1], rot[2]);
            cubieGroup.add(backing);

            const tile = new THREE.Mesh(tileGeo, this.materialPool.faceGlass[face]);
            tile.position.set(normal[0] * 0.458, normal[1] * 0.458, normal[2] * 0.458);
            tile.rotation.set(rot[0], rot[1], rot[2]);
            tile.userData.cubieGroup = cubieGroup;
            cubieGroup.add(tile);
            this.pickables.push(tile);
          }

          this.root.add(cubieGroup);
          this.cubies.push({
            group: cubieGroup,
            initialPos: new THREE.Vector3(x, y, z),
            faceColors,
          });
        }
      }
    }
  }

  get isBusy(): boolean {
    return this.activeAnim !== null || this.dragState !== null || this.moveQueue.length > 0;
  }

  private emitBusyIfChanged(): void {
    const busy = this.isBusy;
    if (busy !== this.lastBusy) {
      this.lastBusy = busy;
      this.callbacks.onBusyChange?.(busy);
    }
  }

  private emitSolvedIfChanged(): void {
    const solved = this.isSolved();
    if (solved !== this.lastSolved) {
      this.lastSolved = solved;
      this.callbacks.onSolvedChange?.(solved);
    }
  }

  enqueueMove(
    move: Move,
    options: { durationMs?: number; source?: MoveSource } = {},
  ): void {
    this.moveQueue.push({
      move: { ...move },
      durationMs: options.durationMs ?? 210,
      source: options.source ?? 'user',
    });
    this.tryStartNextQueuedMove();
    this.emitBusyIfChanged();
  }

  enqueueScramble(moves: Move[]): void {
    if (this.dragState) {
      this.cancelInteractiveTurn();
    }
    for (const move of moves) {
      this.moveQueue.push({
        move: { ...move },
        durationMs: 95,
        source: 'scramble',
      });
    }
    this.tryStartNextQueuedMove();
    this.emitBusyIfChanged();
  }

  beginInteractiveTurn(axis: Axis, layer: LayerIndex): boolean {
    if (this.activeAnim !== null || this.dragState !== null || this.moveQueue.length > 0) {
      return false;
    }
    this.attachSliceToPivot(axis, layer);
    this.dragState = { axis, layer, angle: 0 };
    this.emitBusyIfChanged();
    return true;
  }

  updateInteractiveTurn(angleRad: number): void {
    if (!this.dragState) return;
    this.dragState.angle = angleRad;
    this.pivot.rotation[this.dragState.axis] = angleRad;
  }

  endInteractiveTurn(): void {
    if (!this.dragState) return;
    const { axis, layer, angle } = this.dragState;
    this.dragState = null;

    const quarterTurns = Math.round(angle / (Math.PI / 2));
    const targetAngle = quarterTurns * (Math.PI / 2);

    this.activeAnim = {
      axis,
      layer,
      startAngle: angle,
      targetAngle,
      elapsedMs: 0,
      durationMs: 145,
      source: 'user',
      quarterTurns,
    };
    this.emitBusyIfChanged();
  }

  cancelInteractiveTurn(): void {
    if (!this.dragState) return;
    const { axis } = this.dragState;
    this.dragState = null;
    this.pivot.rotation[axis] = 0;
    this.detachPivotAndSnap();
    this.emitBusyIfChanged();
  }

  reset(): void {
    this.moveQueue.length = 0;
    this.activeAnim = null;
    this.dragState = null;

    // Safely detach any cubies still attached to pivot
    this.detachAllFromPivot();
    this.pivot.rotation.set(0, 0, 0);

    for (const record of this.cubies) {
      record.group.position.copy(record.initialPos);
      record.group.quaternion.identity();
      record.group.updateMatrix();
    }

    this.lastSolved = true;
    this.callbacks.onSolvedChange?.(true);
    this.emitBusyIfChanged();
  }

  isSolved(): boolean {
    const info: CubieStickerInfo[] = this.cubies.map((c) => ({
      position: c.group.position,
      quaternion: c.group.quaternion,
      faceColors: c.faceColors,
    }));
    return isCubeSolved(info);
  }

  getFacelets(): string {
    const info: CubieStickerInfo[] = this.cubies.map((c) => ({
      position: c.group.position,
      quaternion: c.group.quaternion,
      faceColors: c.faceColors,
    }));
    return serializeCubeToFacelets(info);
  }

  update(dtSeconds: number): void {
    if (!this.activeAnim) {
      this.tryStartNextQueuedMove();
      return;
    }

    const anim = this.activeAnim;
    anim.elapsedMs += dtSeconds * 1000;
    const progress = anim.durationMs <= 0 ? 1 : Math.min(1, anim.elapsedMs / anim.durationMs);
    const eased = easeOutCubic(progress);
    const currentAngle = anim.startAngle + (anim.targetAngle - anim.startAngle) * eased;
    this.pivot.rotation[anim.axis] = currentAngle;

    if (progress >= 1) {
      this.pivot.rotation[anim.axis] = anim.targetAngle;
      this.detachPivotAndSnap();

      const completed = anim;
      this.activeAnim = null;

      const absTurns = Math.abs(completed.quarterTurns);
      if (absTurns > 0) {
        const dir: TurnDirection = completed.quarterTurns > 0 ? 1 : -1;
        for (let i = 0; i < absTurns; i++) {
          this.callbacks.onMoveComplete?.(
            { axis: completed.axis, layer: completed.layer, dir },
            { source: completed.source },
          );
        }
      }

      this.emitSolvedIfChanged();
      this.tryStartNextQueuedMove();
      this.emitBusyIfChanged();
    }
  }

  private tryStartNextQueuedMove(): void {
    if (this.activeAnim !== null || this.dragState !== null || this.moveQueue.length === 0) {
      return;
    }
    const next = this.moveQueue.shift()!;
    const turns = next.move.turns ?? 1;
    const signedTurns = next.move.dir * turns;
    this.attachSliceToPivot(next.move.axis, next.move.layer);
    this.activeAnim = {
      axis: next.move.axis,
      layer: next.move.layer,
      startAngle: 0,
      targetAngle: (Math.PI / 2) * signedTurns,
      elapsedMs: 0,
      durationMs: turns === 2 ? Math.round(next.durationMs * 1.35) : next.durationMs,
      source: next.source,
      quarterTurns: signedTurns,
    };
  }

  private attachSliceToPivot(axis: Axis, layer: LayerIndex): void {
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld(true);

    for (const record of this.cubies) {
      if (isCubieInSlice(record.group.position, axis, layer)) {
        this.pivot.attach(record.group);
      }
    }
  }

  private detachAllFromPivot(): void {
    this.pivot.updateMatrixWorld(true);
    const attached = [...this.pivot.children];
    for (const child of attached) {
      this.root.attach(child);
    }
  }

  private detachPivotAndSnap(): void {
    this.detachAllFromPivot();
    this.pivot.rotation.set(0, 0, 0);

    for (const record of this.cubies) {
      record.group.position.set(
        snapGridCoord(record.group.position.x),
        snapGridCoord(record.group.position.y),
        snapGridCoord(record.group.position.z),
      );
      record.group.quaternion.copy(snapQuaternion90(record.group.quaternion));
      record.group.updateMatrix();
    }
  }

  dispose(): void {
    for (const geo of this.geometries) {
      geo.dispose();
    }
    this.materialPool.dispose();
  }
}
