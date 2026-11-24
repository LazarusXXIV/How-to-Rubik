import type { RubiksCube3D } from '../cube/RubiksCube3D';
import { invertNotation, notationToMove } from '../cube/cubeSerializer';
import type { SolveResponse, StagePlan, SubStepPlan } from '../types';

export interface FlatStep {
  globalIndex: number;
  stageIndex: number;
  subStepIndex: number;
  moveIndexInSubStep: number;
  token: string;
  stage: StagePlan;
  subStep: SubStepPlan;
}

export interface TeachingStateSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error';
  errorMessage?: string;
  solution: SolveResponse | null;
  steps: FlatStep[];
  cursor: number;
  isPlaying: boolean;
  speed: number;
}

const FACE_LABEL: Record<string, string> = {
  U: '顶面(紫)',
  D: '底面(黄)',
  F: '前面(绿)',
  B: '后面(蓝)',
  R: '右面(红)',
  L: '左面(橙)',
};

export function describeNotationToken(token: string): string {
  const face = FACE_LABEL[token[0]] ?? token[0];
  const suffix = token.slice(1);
  if (suffix === "'") return `${face} 逆时针 90°`;
  if (suffix === '2') return `${face} 旋转 180°`;
  return `${face} 顺时针 90°`;
}

export class TeachingPlayer {
  private readonly cube: RubiksCube3D;
  private readonly onChange: (snapshot: TeachingStateSnapshot) => void;

  private status: TeachingStateSnapshot['status'] = 'idle';
  private errorMessage: string | undefined;
  private solution: SolveResponse | null = null;
  private steps: FlatStep[] = [];
  private cursor = 0;
  private isPlaying = false;
  private speed = 1;
  private autoTimer: number | null = null;
  private pendingBatch = 0;

  constructor(cube: RubiksCube3D, onChange: (snapshot: TeachingStateSnapshot) => void) {
    this.cube = cube;
    this.onChange = onChange;
  }

  getSnapshot(): TeachingStateSnapshot {
    return {
      status: this.status,
      errorMessage: this.errorMessage,
      solution: this.solution,
      steps: this.steps,
      cursor: this.cursor,
      isPlaying: this.isPlaying,
      speed: this.speed,
    };
  }

  private emit(): void {
    this.onChange(this.getSnapshot());
  }

  async loadFromCurrentCube(): Promise<void> {
    this.pause();
    this.status = 'loading';
    this.errorMessage = undefined;
    this.emit();

    try {
      const facelets = this.cube.getFacelets();
      const resp = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facelets, method: 'lbl' }),
      });
      const data = (await resp.json()) as SolveResponse;
      if (!resp.ok || !data.solvable) {
        this.status = 'error';
        this.errorMessage = data.error ?? 'Python 求解服务返回异常，请确认服务已启动';
        this.solution = null;
        this.steps = [];
        this.cursor = 0;
        this.emit();
        return;
      }

      const flat: FlatStep[] = [];
      let idx = 0;
      data.stages.forEach((stage, stageIndex) => {
        stage.subSteps.forEach((subStep, subStepIndex) => {
          subStep.moves.forEach((token, moveIndexInSubStep) => {
            flat.push({
              globalIndex: idx++,
              stageIndex,
              subStepIndex,
              moveIndexInSubStep,
              token,
              stage,
              subStep,
            });
          });
        });
      });

      this.status = 'ready';
      this.solution = data;
      this.steps = flat;
      this.cursor = 0;
      this.emit();
    } catch {
      this.status = 'error';
      this.errorMessage = '无法连接到 Python 教学求解服务（127.0.0.1:8000），请检查后端服务是否运行';
      this.solution = null;
      this.steps = [];
      this.cursor = 0;
      this.emit();
    }
  }

  stepForward(): boolean {
    if (this.status !== 'ready' || this.cursor >= this.steps.length || this.cube.isBusy) {
      return false;
    }
    const step = this.steps[this.cursor];
    this.cursor += 1;
    const durationMs = Math.round(360 / this.speed);
    this.cube.enqueueMove(notationToMove(step.token), {
      source: 'tutorial',
      durationMs,
    });
    if (this.cursor >= this.steps.length) {
      this.isPlaying = false;
      this.clearAutoTimer();
    }
    this.emit();
    return true;
  }

  stepBackward(): boolean {
    if (this.status !== 'ready' || this.cursor <= 0 || this.cube.isBusy) {
      return false;
    }
    this.pause();
    const prevStep = this.steps[this.cursor - 1];
    this.cursor -= 1;
    const durationMs = Math.round(300 / this.speed);
    this.cube.enqueueMove(notationToMove(invertNotation(prevStep.token)), {
      source: 'tutorial',
      durationMs,
    });
    this.emit();
    return true;
  }

  skipCurrentStage(): void {
    if (this.status !== 'ready' || this.cursor >= this.steps.length || this.cube.isBusy) {
      return;
    }
    this.pause();
    const currentStageIdx = this.steps[this.cursor].stageIndex;
    const batch: FlatStep[] = [];
    while (
      this.cursor < this.steps.length &&
      this.steps[this.cursor].stageIndex === currentStageIdx
    ) {
      batch.push(this.steps[this.cursor]);
      this.cursor += 1;
    }
    this.pendingBatch = batch.length;
    for (const s of batch) {
      this.cube.enqueueMove(notationToMove(s.token), {
        source: 'tutorial',
        durationMs: 120,
      });
    }
    this.emit();
  }

  togglePlay(): void {
    if (this.status !== 'ready' || this.cursor >= this.steps.length) return;
    if (this.isPlaying) {
      this.pause();
    } else {
      this.isPlaying = true;
      this.emit();
      if (!this.cube.isBusy) {
        this.stepForward();
      }
    }
  }

  pause(): void {
    this.isPlaying = false;
    this.clearAutoTimer();
    this.emit();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.emit();
  }

  onTutorialMoveFinished(): void {
    if (this.pendingBatch > 0) {
      this.pendingBatch -= 1;
      return;
    }
    if (!this.isPlaying) return;
    if (this.cursor >= this.steps.length) {
      this.isPlaying = false;
      this.emit();
      return;
    }
    this.clearAutoTimer();
    const delayMs = Math.round(260 / this.speed);
    this.autoTimer = window.setTimeout(() => {
      this.autoTimer = null;
      if (this.isPlaying && !this.cube.isBusy) {
        this.stepForward();
      }
    }, delayMs);
  }

  clear(): void {
    this.isPlaying = false;
    this.pendingBatch = 0;
    this.clearAutoTimer();
    this.status = 'idle';
    this.errorMessage = undefined;
    this.solution = null;
    this.steps = [];
    this.cursor = 0;
    this.emit();
  }

  private clearAutoTimer(): void {
    if (this.autoTimer !== null) {
      window.clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }
}
