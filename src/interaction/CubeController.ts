import * as THREE from 'three';
import type { RubiksCube3D } from '../cube/RubiksCube3D';
import { snapGridCoord } from '../cube/cubeLogic';
import type { StudioScene } from '../scene/StudioScene';
import type { Axis, LayerIndex, Move, TurnDirection } from '../types';

const DRAG_THRESHOLD_PX = 6;
const PX_PER_QUARTER_TURN = 140;

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  hitPoint: THREE.Vector3;
  hitNormal: THREE.Vector3;
  cubiePos: THREE.Vector3;
  locked: boolean;
  screenUnit: { x: number; y: number };
  axisSign: 1 | -1;
}

const KEY_TO_MOVE: Record<string, { axis: Axis; layer: LayerIndex; cwDir: TurnDirection }> = {
  u: { axis: 'y', layer: 1, cwDir: -1 },
  d: { axis: 'y', layer: -1, cwDir: 1 },
  r: { axis: 'x', layer: 1, cwDir: -1 },
  l: { axis: 'x', layer: -1, cwDir: 1 },
  f: { axis: 'z', layer: 1, cwDir: -1 },
  b: { axis: 'z', layer: -1, cwDir: 1 },
};

function snapCardinal(v: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  if (ax >= ay && ax >= az) return new THREE.Vector3(v.x >= 0 ? 1 : -1, 0, 0);
  if (ay >= ax && ay >= az) return new THREE.Vector3(0, v.y >= 0 ? 1 : -1, 0);
  return new THREE.Vector3(0, 0, v.z >= 0 ? 1 : -1);
}

function getTangentAxes(normal: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  if (Math.abs(normal.x) > 0.5) {
    return [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  }
  if (Math.abs(normal.y) > 0.5) {
    return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
  }
  return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
}

function vectorToAxisAndSign(v: THREE.Vector3): { axis: Axis; sign: 1 | -1 } {
  if (Math.abs(v.x) > 0.5) return { axis: 'x', sign: v.x > 0 ? 1 : -1 };
  if (Math.abs(v.y) > 0.5) return { axis: 'y', sign: v.y > 0 ? 1 : -1 };
  return { axis: 'z', sign: v.z > 0 ? 1 : -1 };
}

export class CubeController {
  private readonly studio: StudioScene;
  private readonly cube: RubiksCube3D;
  private readonly onUndoShortcut: () => void;
  private readonly isModalOpen: () => boolean;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private drag: DragSession | null = null;

  private readonly onPointerDownBound: (e: PointerEvent) => void;
  private readonly onPointerMoveBound: (e: PointerEvent) => void;
  private readonly onPointerUpBound: (e: PointerEvent) => void;
  private readonly onPointerCancelBound: (e: PointerEvent) => void;
  private readonly onKeyDownBound: (e: KeyboardEvent) => void;

  constructor(
    studio: StudioScene,
    cube: RubiksCube3D,
    onUndoShortcut: () => void,
    isModalOpen: () => boolean = () => false,
  ) {
    this.studio = studio;
    this.cube = cube;
    this.onUndoShortcut = onUndoShortcut;
    this.isModalOpen = isModalOpen;

    this.onPointerDownBound = this.handlePointerDown.bind(this);
    this.onPointerMoveBound = this.handlePointerMove.bind(this);
    this.onPointerUpBound = this.handlePointerUp.bind(this);
    this.onPointerCancelBound = this.handlePointerCancel.bind(this);
    this.onKeyDownBound = this.handleKeyDown.bind(this);

    const dom = this.studio.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    window.addEventListener('pointercancel', this.onPointerCancelBound);
    window.addEventListener('keydown', this.onKeyDownBound);
  }

  private projectWorldToScreen(worldPos: THREE.Vector3): { x: number; y: number } {
    const rect = this.studio.renderer.domElement.getBoundingClientRect();
    const projected = worldPos.clone().project(this.studio.camera);
    return {
      x: ((projected.x + 1) * 0.5) * rect.width + rect.left,
      y: ((-projected.y + 1) * 0.5) * rect.height + rect.top,
    };
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (this.cube.isBusy || this.isModalOpen()) return;

    const dom = this.studio.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.studio.camera);
    const hits = this.raycaster.intersectObjects(this.cube.pickables, false);
    if (hits.length === 0) return;

    const hit = hits[0];
    const cubieGroup = hit.object.userData.cubieGroup as THREE.Group | undefined;
    if (!cubieGroup || !hit.face) return;

    const worldNormal = hit.face.normal
      .clone()
      .transformDirection(hit.object.matrixWorld);
    const snappedNormal = snapCardinal(worldNormal);

    this.studio.setControlsEnabled(false);
    try {
      dom.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointer capture
    }

    this.drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      hitPoint: hit.point.clone(),
      hitNormal: snappedNormal,
      cubiePos: cubieGroup.position.clone(),
      locked: false,
      screenUnit: { x: 1, y: 0 },
      axisSign: 1,
    };
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;

    const dx = e.clientX - this.drag.startX;
    const dy = e.clientY - this.drag.startY;

    if (!this.drag.locked) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      const [t1, t2] = getTangentAxes(this.drag.hitNormal);
      const p0 = this.projectWorldToScreen(this.drag.hitPoint);
      const p1 = this.projectWorldToScreen(this.drag.hitPoint.clone().add(t1));
      const p2 = this.projectWorldToScreen(this.drag.hitPoint.clone().add(t2));

      const s1 = { x: p1.x - p0.x, y: p1.y - p0.y };
      const s2 = { x: p2.x - p0.x, y: p2.y - p0.y };
      const len1 = Math.hypot(s1.x, s1.y) || 1;
      const len2 = Math.hypot(s2.x, s2.y) || 1;
      const u1 = { x: s1.x / len1, y: s1.y / len1 };
      const u2 = { x: s2.x / len2, y: s2.y / len2 };

      const dot1 = Math.abs(dx * u1.x + dy * u1.y);
      const dot2 = Math.abs(dx * u2.x + dy * u2.y);

      const moveTangent = dot1 >= dot2 ? t1 : t2;
      const chosenScreenUnit = dot1 >= dot2 ? u1 : u2;

      const rotVec = new THREE.Vector3().crossVectors(this.drag.hitNormal, moveTangent);
      const { axis, sign } = vectorToAxisAndSign(rotVec);
      const layer = snapGridCoord(this.drag.cubiePos[axis]);

      if (!this.cube.beginInteractiveTurn(axis, layer)) {
        this.releaseDrag(false);
        return;
      }

      this.drag.locked = true;
      this.drag.screenUnit = chosenScreenUnit;
      this.drag.axisSign = sign;
    }

    const projectedPx = dx * this.drag.screenUnit.x + dy * this.drag.screenUnit.y;
    const angle = (projectedPx / PX_PER_QUARTER_TURN) * (Math.PI / 2) * this.drag.axisSign;
    this.cube.updateInteractiveTurn(angle);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.releaseDrag(true);
  }

  private handlePointerCancel(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.releaseDrag(false);
  }

  private releaseDrag(commit: boolean): void {
    if (!this.drag) return;
    const { pointerId, locked } = this.drag;
    this.drag = null;

    if (locked) {
      if (commit) {
        this.cube.endInteractiveTurn();
      } else {
        this.cube.cancelInteractiveTurn();
      }
    }

    this.studio.setControlsEnabled(true);
    try {
      this.studio.renderer.domElement.releasePointerCapture(pointerId);
    } catch {
      // Ignore if not captured
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.isModalOpen()) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    const key = e.key.toLowerCase();
    if (key === 'z' && (e.ctrlKey || e.metaKey || !e.altKey)) {
      e.preventDefault();
      this.onUndoShortcut();
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const mapping = KEY_TO_MOVE[key];
    if (!mapping) return;

    e.preventDefault();
    const dir: TurnDirection = e.shiftKey
      ? ((mapping.cwDir * -1) as TurnDirection)
      : mapping.cwDir;
    const move: Move = {
      axis: mapping.axis,
      layer: mapping.layer,
      dir,
    };
    this.cube.enqueueMove(move, { source: 'user' });
  }

  dispose(): void {
    this.releaseDrag(false);
    const dom = this.studio.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerCancelBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
  }
}
