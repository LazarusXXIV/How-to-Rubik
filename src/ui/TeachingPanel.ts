import {
  type TeachingStateSnapshot,
  describeNotationToken,
} from '../teaching/TeachingPlayer';

export interface TeachingPanelActions {
  onRequestSolve: () => void;
  onStepBack: () => void;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onSkipStage: () => void;
  onSpeedChange: (speed: number) => void;
  onClose: () => void;
}

export class TeachingPanel {
  private readonly panelEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly actions: TeachingPanelActions;

  constructor(actions: TeachingPanelActions) {
    this.actions = actions;
    this.panelEl = document.getElementById('teaching-panel') as HTMLElement;
    this.bodyEl = document.getElementById('teaching-panel-body') as HTMLElement;

    const closeBtn = document.getElementById('btn-teaching-close');
    closeBtn?.addEventListener('click', () => this.actions.onClose());
  }

  setVisible(visible: boolean): void {
    this.panelEl.hidden = !visible;
  }

  isVisible(): boolean {
    return !this.panelEl.hidden;
  }

  render(state: TeachingStateSnapshot): void {
    if (state.status === 'idle') {
      this.bodyEl.innerHTML = `
        <div class="teach-empty">
          <p class="teach-empty-title">准备开始层先法 7 步教学</p>
          <p class="teach-empty-desc">先点击底部「打乱」或自由拧乱魔方，再点击下方按钮，Python 教学引擎将为你生成专属分步骤还原方案。</p>
          <button type="button" class="teach-primary-btn" data-action="solve">分析当前魔方并生成教程</button>
        </div>
      `;
      this.bindBodyEvents();
      return;
    }

    if (state.status === 'loading') {
      this.bodyEl.innerHTML = `
        <div class="teach-empty">
          <div class="teach-spinner" aria-hidden="true"></div>
          <p class="teach-empty-title">Python 引擎正在计算标准教学公式…</p>
          <p class="teach-empty-desc">正在按层先法（LBL）7 阶段拆解思路与步骤</p>
        </div>
      `;
      return;
    }

    if (state.status === 'error') {
      this.bodyEl.innerHTML = `
        <div class="teach-empty">
          <p class="teach-empty-title">计算未成功</p>
          <p class="teach-empty-desc">${this.escapeHtml(state.errorMessage ?? '未知错误')}</p>
          <button type="button" class="teach-primary-btn" data-action="solve">重试分析</button>
        </div>
      `;
      this.bindBodyEvents();
      return;
    }

    const solution = state.solution!;
    const total = state.steps.length;

    if (total === 0) {
      this.bodyEl.innerHTML = `
        <div class="teach-empty">
          <p class="teach-empty-title">当前魔方已处于还原状态</p>
          <p class="teach-empty-desc">点击底部「打乱」打乱魔方，再点击下方按钮即可体验完整 7 步层先法教学！</p>
          <button type="button" class="teach-primary-btn" data-action="solve">重新检测当前魔方</button>
        </div>
      `;
      this.bindBodyEvents();
      return;
    }

    const isDone = state.cursor >= total;
    const activeStep = isDone ? state.steps[total - 1] : state.steps[state.cursor];
    const activeStageIdx = activeStep.stageIndex;

    const roadmapHtml = solution.stages
      .map((st, i) => {
        let cls = 'stage-chip';
        if (st.skipped) {
          cls += ' is-skipped';
        } else if (isDone || i < activeStageIdx) {
          cls += ' is-done';
        } else if (i === activeStageIdx) {
          cls += ' is-current';
        }
        return `<div class="${cls}" title="${this.escapeHtml(st.title)}"><span>${st.index}</span><em>${this.escapeHtml(st.title.replace(/（.*?）/, ''))}</em></div>`;
      })
      .join('');

    const sub = activeStep.subStep;
    const activeMoveIdx = isDone ? sub.moves.length : activeStep.moveIndexInSubStep;
    const movesHtml = sub.moves
      .map((tok, i) => {
        let cls = 'move-pill';
        if (i < activeMoveIdx) cls += ' is-done';
        else if (i === activeMoveIdx && !isDone) cls += ' is-active';
        return `<span class="${cls}">${this.escapeHtml(tok)}</span>`;
      })
      .join('');

    const nextDesc = isDone
      ? '全部 7 步已完成，魔方已还原！'
      : `下一步：<strong>${this.escapeHtml(activeStep.token)}</strong>（${this.escapeHtml(describeNotationToken(activeStep.token))}）`;

    const speeds = [0.5, 1, 1.5];
    const speedHtml = speeds
      .map(
        (sp) =>
          `<button type="button" class="speed-btn ${state.speed === sp ? 'is-active' : ''}" data-speed="${sp}">${sp}x</button>`,
      )
      .join('');

    this.bodyEl.innerHTML = `
      <div class="teach-summary">
        <span>层先法（LBL）· 7 步教学</span>
        <span class="teach-progress-num">${state.cursor} / ${total} 步</span>
      </div>

      <div class="stage-roadmap" aria-label="7 阶段路线图">${roadmapHtml}</div>

      <div class="teach-card">
        <div class="teach-stage-head">
          <span class="teach-badge">Step ${activeStep.stage.index}</span>
          <h3>${this.escapeHtml(activeStep.stage.title)}</h3>
        </div>
        <p class="teach-goal"><strong>本步目标：</strong>${this.escapeHtml(activeStep.stage.goal)}</p>
        <p class="teach-idea"><strong>核心思路：</strong>${this.escapeHtml(activeStep.stage.idea)}</p>
      </div>

      <div class="teach-card teach-formula-card">
        <div class="teach-formula-head">
          <span class="teach-formula-name">${this.escapeHtml(sub.formulaName)}</span>
          ${sub.formulaDesc ? `<span class="teach-formula-sub">${this.escapeHtml(sub.formulaDesc)}</span>` : ''}
        </div>
        <p class="teach-tip">${this.escapeHtml(sub.tip)}</p>
        <div class="move-strip">${movesHtml}</div>
        <div class="teach-next-line">${nextDesc}</div>
      </div>

      <div class="teach-controls">
        <button type="button" class="ctrl-btn" data-action="back" ${state.cursor <= 0 ? 'disabled' : ''}>上一步</button>
        <button type="button" class="ctrl-btn is-primary" data-action="play" ${isDone ? 'disabled' : ''}>${state.isPlaying ? '暂停' : '自动播放'}</button>
        <button type="button" class="ctrl-btn" data-action="next" ${isDone ? 'disabled' : ''}>下一步</button>
      </div>

      <div class="teach-sub-controls">
        <div class="speed-group">
          <span class="speed-label">速度</span>
          ${speedHtml}
        </div>
        <button type="button" class="link-btn" data-action="skip-stage" ${isDone ? 'disabled' : ''}>跳过本阶段</button>
        <button type="button" class="link-btn" data-action="solve">重新分析</button>
      </div>
    `;

    this.bindBodyEvents();
  }

  private bindBodyEvents(): void {
    this.bodyEl.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.action;
        if (act === 'solve') this.actions.onRequestSolve();
        else if (act === 'back') this.actions.onStepBack();
        else if (act === 'play') this.actions.onTogglePlay();
        else if (act === 'next') this.actions.onStepForward();
        else if (act === 'skip-stage') this.actions.onSkipStage();
      });
    });

    this.bodyEl.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sp = Number(btn.dataset.speed);
        if (!Number.isNaN(sp)) this.actions.onSpeedChange(sp);
      });
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
