/**
 * 开始界面：选择人数与玩家名。
 *
 * 属于 ui/ 层（agent.md §3）：只收集玩家意愿，产出一次 onStart 回调，
 * 不直接改对局状态 —— 真正建局由 app.ts 调用 core/game.ts 完成。
 */
import { ACCOMPLICES_BY_PLAYER_COUNT, SUPPORTED_PLAYER_COUNTS } from '../config/constants';

export interface StartScreenOptions {
  readonly onStart: (playerCount: number, names: readonly string[]) => void;
}

export interface StartScreenHandle {
  readonly element: HTMLElement;
  dispose(): void;
}

export function createStartScreen(options: StartScreenOptions): StartScreenHandle {
  const element = document.createElement('div');
  element.className = 'overlay';
  element.innerHTML = `
    <div class="overlay__card">
      <p class="overlay__eyebrow">three_think · 第一版</p>
      <h1 class="overlay__title">马尼拉</h1>
      <p class="overlay__subtitle">
        1821 年，马尼拉港的黑市贸易。竞标港务长的办事处，
        决定这一航程装载哪些货物、平底船从哪里出发。
      </p>

      <div class="overlay__section">
        <p class="overlay__label">游戏人数</p>
        <div class="count-picker" role="radiogroup" aria-label="游戏人数"></div>
        <p class="overlay__note" data-role="count-note"></p>
      </div>

      <div class="overlay__section">
        <p class="overlay__label">玩家</p>
        <div class="name-list" data-role="names"></div>
      </div>

      <button class="btn btn--primary btn--wide" data-role="start">开始游戏</button>

      <p class="overlay__footnote">
        本地热座模式：3–5 人轮流在同一台设备上操作。
        本次只实现到竞标结算，装船与航行阶段尚未实现。
      </p>
    </div>
  `;

  const picker = element.querySelector<HTMLElement>('.count-picker');
  const noteEl = element.querySelector<HTMLElement>('[data-role="count-note"]');
  const namesEl = element.querySelector<HTMLElement>('[data-role="names"]');
  const startBtn = element.querySelector<HTMLButtonElement>('[data-role="start"]');
  if (!picker || !noteEl || !namesEl || !startBtn) {
    throw new Error('开始界面结构不完整');
  }

  let playerCount = 4;
  const names: string[] = [];

  for (const count of SUPPORTED_PLAYER_COUNTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'count-picker__option';
    button.textContent = `${count} 人`;
    button.setAttribute('role', 'radio');
    button.addEventListener('click', () => {
      playerCount = count;
      syncCount();
    });
    picker.appendChild(button);
  }

  function syncCount(): void {
    picker?.querySelectorAll<HTMLButtonElement>('.count-picker__option').forEach((button, i) => {
      const count = SUPPORTED_PLAYER_COUNTS[i];
      const active = count === playerCount;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });

    const accomplices = ACCOMPLICES_BY_PLAYER_COUNT[playerCount] ?? 3;
    noteEl!.textContent = `每人 ${accomplices} 个小弟、30 元披索、2 张股份。`;
    renderNames();
  }

  function renderNames(): void {
    namesEl!.replaceChildren();
    for (let i = 0; i < playerCount; i += 1) {
      const row = document.createElement('label');
      row.className = 'name-row';

      const dot = document.createElement('span');
      dot.className = `name-row__dot name-row__dot--${i + 1}`;

      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 12;
      input.placeholder = `玩家 ${i + 1}`;
      input.value = names[i] ?? '';
      input.addEventListener('input', () => {
        names[i] = input.value;
      });

      row.append(dot, input);
      namesEl!.appendChild(row);
    }
  }

  startBtn.addEventListener('click', () => {
    const finalNames = Array.from({ length: playerCount }, (_, i) => names[i]?.trim() || `玩家 ${i + 1}`);
    options.onStart(playerCount, finalNames);
  });

  syncCount();

  return {
    element,
    dispose() {
      element.remove();
    },
  };
}
