import type * as THREE from 'three';

export type Axis = 'x' | 'y' | 'z';
export type LayerIndex = -1 | 0 | 1;
export type TurnDirection = 1 | -1;
export type FaceKey = 'U' | 'D' | 'F' | 'B' | 'R' | 'L';

export interface Move {
  axis: Axis;
  layer: LayerIndex;
  dir: TurnDirection;
  turns?: 1 | 2;
}

export interface CubieStickerInfo {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  faceColors: Partial<Record<FaceKey, FaceKey>>;
}

export type SolveMethod = 'lbl';

export interface SubStepPlan {
  tip: string;
  formulaName: string;
  formulaDesc?: string;
  moves: string[];
}

export interface StagePlan {
  id: string;
  index: number;
  title: string;
  goal: string;
  idea: string;
  skipped: boolean;
  subSteps: SubStepPlan[];
}

export interface SolveResponse {
  solvable: boolean;
  method: SolveMethod;
  totalMoves: number;
  stages: StagePlan[];
  error?: string;
}
