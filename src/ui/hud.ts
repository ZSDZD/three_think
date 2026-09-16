/**
 * 左上角的状态读数。
 *
 * 存在理由（agent.md §7）：性能预算是硬指标，必须可观测。
 * 这里把 draw call / 三角形 / 帧率实时显示出来，超标当场就能看见，
 * 而不是等到"以后优化"。
 */
import type { RenderStats } from '../render/scene';

/** 性能预算（agent.md §6）：桌面 draw call < 150 */
const DRAW_CALL_BUDGET = 150;
/** 桌面三角形预算 */
const TRIANGLE_BUDGET = 300_000;

export interface HudHandle {
  readonly element: HTMLElement;
  update(stats: RenderStats): void;
  setSeed(seed: number): void;
}

export function createHud(): HudHandle {
  const element = document.createElement('div');
  element.className = 'hud';
  element.innerHTML = `
    <div class="hud__row"><span>帧率</span><strong data-role="fps">—</strong></div>
    <div class="hud__row"><span>draw call</span><strong data-role="calls">—</strong></div>
    <div class="hud__row"><span>三角形</span><strong data-role="tris">—</strong></div>
    <div class="hud__row hud__row--muted"><span>随机种子</span><strong data-role="seed">—</strong></div>
  `;

  const fpsEl = element.querySelector<HTMLElement>('[data-role="fps"]');
  const callsEl = element.querySelector<HTMLElement>('[data-role="calls"]');
  const trisEl = element.querySelector<HTMLElement>('[data-role="tris"]');
  const seedEl = element.querySelector<HTMLElement>('[data-role="seed"]');
  if (!fpsEl || !callsEl || !trisEl || !seedEl) throw new Error('HUD 结构不完整');

  return {
    element,
    update(stats) {
      fpsEl.textContent = `${stats.fps} fps`;
      callsEl.textContent = `${stats.calls}${stats.calls > DRAW_CALL_BUDGET ? ' ⚠' : ''}`;
      callsEl.classList.toggle('is-over', stats.calls > DRAW_CALL_BUDGET);
      trisEl.textContent = `${stats.triangles.toLocaleString('zh-CN')}${
        stats.triangles > TRIANGLE_BUDGET ? ' ⚠' : ''
      }`;
      trisEl.classList.toggle('is-over', stats.triangles > TRIANGLE_BUDGET);
    },
    setSeed(seed) {
      seedEl.textContent = String(seed);
    },
  };
}
