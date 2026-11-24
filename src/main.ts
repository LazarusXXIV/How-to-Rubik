import './styles.css';
import { RubiksCube3D } from './cube/RubiksCube3D';
import { MoveHistory, generateScramble, invertMove } from './cube/cubeLogic';
import { CubeController } from './interaction/CubeController';
import { StudioScene } from './scene/StudioScene';
import { TeachingPlayer } from './teaching/TeachingPlayer';
import { HudController } from './ui/HudController';
import { TeachingPanel } from './ui/TeachingPanel';

const container = document.getElementById('canvas-container');
if (!container) {
  throw new Error('Missing #canvas-container element');
}

const studio = new StudioScene(container);
const history = new MoveHistory();

let isScrambling = false;
let scrambleRemaining = 0;
let timerRunning = false;
let timerStartMs = 0;
let elapsedMs = 0;
let moveCount = 0;

function stopTimer(): void {
  if (timerRunning) {
    elapsedMs = performance.now() - timerStartMs;
    timerRunning = false;
  }
}

function resetTimer(): void {
  timerRunning = false;
  timerStartMs = 0;
  elapsedMs = 0;
  hud.setElapsedMs(0);
}

function startTimerIfNeeded(): void {
  if (!timerRunning) {
    timerStartMs = performance.now() - elapsedMs;
    timerRunning = true;
  }
}

function downloadScreenshot(): void {
  const dataUrl = studio.captureScreenshot();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `xue-cube-${stamp}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function openTeachingAndSolve(): void {
  if (isScrambling) return;
  hud.setMode('teach');
  teachingPanel.setVisible(true);
  void teachingPlayer.loadFromCurrentCube();
}

const hud = new HudController({
  onModeChange: (mode) => {
    if (mode === 'teach') {
      teachingPanel.setVisible(true);
      if (teachingPlayer.getSnapshot().status === 'idle') {
        void teachingPlayer.loadFromCurrentCube();
      }
    } else {
      teachingPlayer.pause();
      teachingPanel.setVisible(false);
    }
  },
  onSolveTeach: () => {
    openTeachingAndSolve();
  },
  onScramble: () => {
    if (isScrambling) return;
    teachingPlayer.clear();
    const moves = generateScramble(20);
    isScrambling = true;
    scrambleRemaining = moves.length;
    history.clear();
    moveCount = 0;
    resetTimer();
    hud.setMoves(0);
    hud.setCanUndo(false);
    hud.setScrambling(true);
    cube.enqueueScramble(moves);
  },
  onUndo: () => {
    if (isScrambling || !history.canUndo) return;
    teachingPlayer.pause();
    const last = history.pop();
    if (!last) return;
    hud.setCanUndo(history.canUndo);
    cube.enqueueMove(invertMove(last), { source: 'undo', durationMs: 190 });
  },
  onReset: () => {
    isScrambling = false;
    scrambleRemaining = 0;
    teachingPlayer.clear();
    history.clear();
    moveCount = 0;
    resetTimer();
    cube.reset();
    hud.setMoves(0);
    hud.setCanUndo(false);
    hud.setSolved(true);
    hud.setScrambling(false);
  },
  onScreenshot: () => {
    downloadScreenshot();
  },
});

const cube = new RubiksCube3D({
  onMoveComplete: (move, { source }) => {
    if (source === 'scramble') {
      scrambleRemaining = Math.max(0, scrambleRemaining - 1);
      if (scrambleRemaining === 0) {
        isScrambling = false;
        hud.setScrambling(false);
        if (teachingPanel.isVisible()) {
          void teachingPlayer.loadFromCurrentCube();
        }
      }
      return;
    }

    if (source === 'tutorial') {
      teachingPlayer.onTutorialMoveFinished();
      return;
    }

    if (source === 'user') {
      if (teachingPlayer.getSnapshot().status === 'ready') {
        teachingPlayer.clear();
      }
      startTimerIfNeeded();
      history.push(move);
      moveCount += 1;
      hud.setMoves(moveCount);
      hud.setCanUndo(history.canUndo);
    } else if (source === 'undo') {
      moveCount = Math.max(0, moveCount - 1);
      hud.setMoves(moveCount);
      hud.setCanUndo(history.canUndo);
    }
  },
  onSolvedChange: (solved) => {
    hud.setSolved(solved);
    if (solved && !isScrambling) {
      stopTimer();
      hud.setElapsedMs(elapsedMs);
    }
  },
});

const teachingPanel = new TeachingPanel({
  onRequestSolve: () => {
    if (!isScrambling) {
      void teachingPlayer.loadFromCurrentCube();
    }
  },
  onStepBack: () => {
    teachingPlayer.stepBackward();
  },
  onTogglePlay: () => {
    teachingPlayer.togglePlay();
  },
  onStepForward: () => {
    teachingPlayer.stepForward();
  },
  onSkipStage: () => {
    teachingPlayer.skipCurrentStage();
  },
  onSpeedChange: (speed) => {
    teachingPlayer.setSpeed(speed);
  },
  onClose: () => {
    teachingPlayer.pause();
    teachingPanel.setVisible(false);
    hud.setMode('free');
  },
});

const teachingPlayer = new TeachingPlayer(cube, (snapshot) => {
  teachingPanel.render(snapshot);
});
teachingPanel.render(teachingPlayer.getSnapshot());

studio.add(cube.root);

new CubeController(
  studio,
  cube,
  () => {
    if (isScrambling || !history.canUndo) return;
    teachingPlayer.pause();
    const last = history.pop();
    if (!last) return;
    hud.setCanUndo(history.canUndo);
    cube.enqueueMove(invertMove(last), { source: 'undo', durationMs: 190 });
  },
  () => hud.isAnyModalOpen(),
);

studio.start((dt) => {
  cube.update(dt);
  if (timerRunning) {
    elapsedMs = performance.now() - timerStartMs;
    hud.setElapsedMs(elapsedMs);
  }
});
