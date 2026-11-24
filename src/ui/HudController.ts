export type AppMode = 'free' | 'teach';

export interface HudActions {
  onModeChange: (mode: AppMode) => void;
  onSolveTeach: () => void;
  onScramble: () => void;
  onUndo: () => void;
  onReset: () => void;
  onScreenshot: () => void;
}

function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export class HudController {
  private readonly btnModeFree: HTMLButtonElement;
  private readonly btnModeTeach: HTMLButtonElement;
  private readonly btnBasics: HTMLButtonElement;
  private readonly btnBasicsClose: HTMLButtonElement;
  private readonly basicsModal: HTMLElement;
  private readonly btnSolveTeach: HTMLButtonElement;
  private readonly btnScramble: HTMLButtonElement;
  private readonly btnUndo: HTMLButtonElement;
  private readonly btnReset: HTMLButtonElement;
  private readonly btnScreenshot: HTMLButtonElement;
  private readonly btnHelp: HTMLButtonElement;
  private readonly btnHelpClose: HTMLButtonElement;
  private readonly helpModal: HTMLElement;
  private readonly statusDot: HTMLElement;
  private readonly statusLabel: HTMLElement;
  private readonly movesLabel: HTMLElement;
  private readonly timerLabel: HTMLElement;

  constructor(actions: HudActions) {
    this.btnModeFree = document.getElementById('btn-mode-free') as HTMLButtonElement;
    this.btnModeTeach = document.getElementById('btn-mode-teach') as HTMLButtonElement;
    this.btnBasics = document.getElementById('btn-basics') as HTMLButtonElement;
    this.btnBasicsClose = document.getElementById('btn-basics-close') as HTMLButtonElement;
    this.basicsModal = document.getElementById('basics-modal') as HTMLElement;
    this.btnSolveTeach = document.getElementById('btn-solve-teach') as HTMLButtonElement;
    this.btnScramble = document.getElementById('btn-scramble') as HTMLButtonElement;
    this.btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
    this.btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
    this.btnScreenshot = document.getElementById('btn-screenshot') as HTMLButtonElement;
    this.btnHelp = document.getElementById('btn-help') as HTMLButtonElement;
    this.btnHelpClose = document.getElementById('btn-help-close') as HTMLButtonElement;
    this.helpModal = document.getElementById('help-modal') as HTMLElement;
    this.statusDot = document.getElementById('status-dot') as HTMLElement;
    this.statusLabel = document.getElementById('status-label') as HTMLElement;
    this.movesLabel = document.getElementById('moves-label') as HTMLElement;
    this.timerLabel = document.getElementById('timer-label') as HTMLElement;

    this.btnModeFree.addEventListener('click', () => {
      this.setMode('free');
      actions.onModeChange('free');
    });
    this.btnModeTeach.addEventListener('click', () => {
      this.setMode('teach');
      actions.onModeChange('teach');
    });

    this.btnSolveTeach.addEventListener('click', () => actions.onSolveTeach());
    this.btnScramble.addEventListener('click', () => actions.onScramble());
    this.btnUndo.addEventListener('click', () => actions.onUndo());
    this.btnReset.addEventListener('click', () => actions.onReset());
    this.btnScreenshot.addEventListener('click', () => actions.onScreenshot());

    this.btnBasics.addEventListener('click', () => {
      this.basicsModal.hidden = false;
    });
    this.btnBasicsClose.addEventListener('click', () => {
      this.basicsModal.hidden = true;
    });
    this.basicsModal.addEventListener('click', (e) => {
      if (e.target === this.basicsModal) this.basicsModal.hidden = true;
    });

    this.btnHelp.addEventListener('click', () => {
      this.helpModal.hidden = false;
    });
    this.btnHelpClose.addEventListener('click', () => {
      this.helpModal.hidden = true;
    });
    this.helpModal.addEventListener('click', (e) => {
      if (e.target === this.helpModal) this.helpModal.hidden = true;
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.helpModal.hidden) this.helpModal.hidden = true;
        if (!this.basicsModal.hidden) this.basicsModal.hidden = true;
      }
    });
  }

  isAnyModalOpen(): boolean {
    return !this.helpModal.hidden || !this.basicsModal.hidden;
  }

  setMode(mode: AppMode): void {
    const isFree = mode === 'free';
    this.btnModeFree.classList.toggle('is-active', isFree);
    this.btnModeFree.setAttribute('aria-selected', String(isFree));
    this.btnModeTeach.classList.toggle('is-active', !isFree);
    this.btnModeTeach.setAttribute('aria-selected', String(!isFree));
  }

  setCanUndo(canUndo: boolean): void {
    this.btnUndo.disabled = !canUndo;
  }

  setSolved(solved: boolean): void {
    this.statusDot.classList.toggle('is-solved', solved);
    this.statusDot.classList.toggle('is-solving', !solved);
    this.statusLabel.textContent = solved ? '已还原' : '还原中';
  }

  setMoves(count: number): void {
    this.movesLabel.textContent = `${count} 步`;
  }

  setElapsedMs(ms: number): void {
    this.timerLabel.textContent = formatTimer(ms);
  }

  setScrambling(scrambling: boolean): void {
    this.btnScramble.disabled = scrambling;
    this.btnSolveTeach.disabled = scrambling;
  }
}
