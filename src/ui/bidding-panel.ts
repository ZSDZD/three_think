/**
 * 竞标面板：显示当前最高价、轮到谁，并收集出价 / 过牌意图。
 *
 * 属于 ui/ 层（agent.md §3）：**不做任何规则判定**。
 * 它只负责把 core/ 算好的合法区间显示出来，并把玩家点击翻译成 Intent。
 * 出价是否合法最终由 core/bidding.ts 裁决 —— UI 的禁用只是体验优化。
 */
import { GOODS } from '../config/board-layout';
import { creditLimit, currentBidder, minLegalBid } from '../core/bidding';
import type { GameState, Intent } from '../core/game';
import type { Player } from '../core/types';

export interface BiddingPanelOptions {
  readonly onIntent: (intent: Intent) => void;
}

export interface BiddingPanelHandle {
  readonly element: HTMLElement;
  render(state: GameState, error: string | null): void;
  dispose(): void;
}

export function createBiddingPanel(options: BiddingPanelOptions): BiddingPanelHandle {
  const element = document.createElement('aside');
  element.className = 'panel';
  element.innerHTML = `
    <header class="panel__head">
      <p class="panel__eyebrow" data-role="voyage"></p>
      <h2 class="panel__title">竞标港务长办事处</h2>
    </header>

    <section class="auction" data-role="auction">
      <div class="auction__row">
        <span class="auction__label">当前最高价</span>
        <strong class="auction__value" data-role="high-bid">尚无人出价</strong>
      </div>
      <div class="auction__row">
        <span class="auction__label">轮到</span>
        <strong class="auction__turn" data-role="turn"></strong>
      </div>

      <div class="auction__controls" data-role="controls">
        <div class="bid-input">
          <label for="bid-amount">出价</label>
          <input id="bid-amount" type="number" inputmode="numeric" step="1" data-role="amount" />
          <div class="bid-quick">
            <button type="button" data-quick="1">+1</button>
            <button type="button" data-quick="5">+5</button>
          </div>
        </div>
        <div class="auction__buttons">
          <button type="button" class="btn btn--primary" data-role="bid">出价</button>
          <button type="button" class="btn" data-role="pass">过牌</button>
        </div>
      </div>

      <p class="auction__hint" data-role="hint"></p>
      <p class="auction__error" data-role="error" hidden></p>
    </section>

    <section class="result" data-role="result" hidden></section>

    <section class="players">
      <h3 class="section-title">玩家</h3>
      <ul class="player-list" data-role="players"></ul>
    </section>

    <section class="log">
      <h3 class="section-title">对局记录</h3>
      <ol class="log-list" data-role="log"></ol>
    </section>

    <details class="rules">
      <summary>竞标规则</summary>
      <ul>
        <li>起拍价 1 元；首段航程由座位第 1 位起叫，之后由上一轮港务长起叫。</li>
        <li>顺时针轮流，轮到你时出价（须高于当前最高价）或过牌。</li>
        <li><strong>过牌后本段航程不能再进场。</strong></li>
        <li>除一人外全部过牌，该人得标，成交价付给海港钱箱，成为港务长。</li>
        <li>无人出价时，上一轮港务长连任。</li>
        <li>出价上限 = 现金 + 未抵押股份 × 12（每张股份可抵押贷款 12 元）。</li>
      </ul>
    </details>
  `;

  const q = <T extends HTMLElement>(role: string): T => {
    const found = element.querySelector<T>(`[data-role="${role}"]`);
    if (!found) throw new Error(`竞标面板缺少节点: ${role}`);
    return found;
  };

  const voyageEl = q<HTMLParagraphElement>('voyage');
  const highBidEl = q<HTMLElement>('high-bid');
  const turnEl = q<HTMLElement>('turn');
  const controlsEl = q<HTMLElement>('controls');
  const amountEl = q<HTMLInputElement>('amount');
  const hintEl = q<HTMLParagraphElement>('hint');
  const errorEl = q<HTMLParagraphElement>('error');
  const resultEl = q<HTMLElement>('result');
  const auctionEl = q<HTMLElement>('auction');
  const playersEl = q<HTMLUListElement>('players');
  const logEl = q<HTMLOListElement>('log');
  const bidBtn = q<HTMLButtonElement>('bid');
  const passBtn = q<HTMLButtonElement>('pass');

  let currentPlayerId: string | null = null;
  let currentState: GameState | null = null;

  const clampDraft = (): void => {
    if (!currentState?.bidding) return;
    const min = minLegalBid(currentState.bidding);
    const player = currentState.players.find((p) => p.id === currentPlayerId);
    const max = player ? creditLimit(player) : min;
    const value = Number(amountEl.value);
    const next = Number.isFinite(value) && value >= min ? Math.min(value, max) : min;
    amountEl.value = String(next);
    amountEl.min = String(min);
    amountEl.max = String(max);
  };

  amountEl.addEventListener('input', clampDraft);

  element.querySelectorAll<HTMLButtonElement>('[data-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      const step = Number(button.dataset.quick ?? '1');
      const min = currentState?.bidding ? minLegalBid(currentState.bidding) : 1;
      const base = Number(amountEl.value);
      amountEl.value = String((Number.isFinite(base) ? base : min) + step);
      clampDraft();
    });
  });

  bidBtn.addEventListener('click', () => {
    if (!currentPlayerId) return;
    options.onIntent({
      type: 'auction-bid',
      playerId: currentPlayerId,
      amount: Number(amountEl.value),
    });
  });

  passBtn.addEventListener('click', () => {
    if (!currentPlayerId) return;
    options.onIntent({ type: 'auction-pass', playerId: currentPlayerId });
  });

  function renderPlayers(state: GameState, turnId: string | null): void {
    playersEl.replaceChildren();

    for (const player of state.players) {
      const li = document.createElement('li');
      li.className = 'player';
      if (player.id === turnId) li.classList.add('is-turn');
      if (player.id === state.harborMaster) li.classList.add('is-master');

      const head = document.createElement('div');
      head.className = 'player__head';

      const dot = document.createElement('span');
      dot.className = 'player__dot';
      dot.style.background = player.color;

      const name = document.createElement('span');
      name.className = 'player__name';
      name.textContent = player.name;

      const cash = document.createElement('span');
      cash.className = 'player__cash';
      cash.textContent = `${player.cash} 元`;

      head.append(dot, name, cash);
      li.appendChild(head);

      const meta = document.createElement('div');
      meta.className = 'player__meta';
      meta.appendChild(shareChips(player));
      li.appendChild(meta);

      const tags = document.createElement('div');
      tags.className = 'player__tags';
      if (player.id === state.harborMaster) tags.appendChild(tag('港务长', 'tag--master'));
      if (state.bidding?.passed.includes(player.id)) tags.appendChild(tag('已过牌', 'tag--passed'));
      if (state.bidding && state.bidding.status === 'open' && player.id === turnId) {
        tags.appendChild(tag('行动中', 'tag--turn'));
      }
      if (tags.childElementCount > 0) li.appendChild(tags);

      const credit = document.createElement('p');
      credit.className = 'player__credit';
      const unmortgaged = player.shares.filter((s) => !s.mortgaged).length;
      credit.textContent = `出价上限 ${creditLimit(player)} 元（现金 ${player.cash} + 未抵押股份 ${unmortgaged} 张 × 12）`;
      li.appendChild(credit);

      playersEl.appendChild(li);
    }
  }

  function shareChips(player: Player): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'shares';
    if (player.shares.length === 0) {
      wrap.appendChild(tag('无股份', 'tag--muted'));
      return wrap;
    }
    for (const share of player.shares) {
      const goodName = GOODS.find((g) => g.id === share.good)?.name ?? share.good;
      const chip = tag(goodName, share.mortgaged ? 'tag--mortgaged' : 'tag--share');
      if (share.mortgaged) chip.textContent = `${goodName}（已抵押）`;
      wrap.appendChild(chip);
    }
    return wrap;
  }

  function tag(text: string, className: string): HTMLElement {
    const span = document.createElement('span');
    span.className = `tag ${className}`;
    span.textContent = text;
    return span;
  }

  function renderResult(state: GameState): void {
    const bidding = state.bidding;
    if (!bidding || bidding.status === 'open') {
      resultEl.hidden = true;
      controlsEl.hidden = false;
      return;
    }

    controlsEl.hidden = true;
    resultEl.hidden = false;
    resultEl.replaceChildren();

    const winner = state.players.find((p) => p.id === bidding.winner);

    const eyebrow = document.createElement('p');
    eyebrow.className = 'result__eyebrow';
    eyebrow.textContent = `第 ${state.voyage} 段航程 · 竞标结束`;

    const name = document.createElement('p');
    name.className = 'result__name';
    name.textContent = `${winner?.name ?? bidding.winner ?? '（无）'} 成为港务长`;

    const detail = document.createElement('p');
    detail.className = 'result__detail';
    if (bidding.status === 'won') {
      detail.textContent = `得标价 ${bidding.paid} 元已付入海港钱箱 · 余款 ${winner?.cash ?? 0} 元`;
    } else if (bidding.status === 'incumbent-holds') {
      detail.textContent = '无人出价，原港务长连任。';
    } else {
      detail.textContent = '无人出价且无在任者，起叫者以 0 元接任。';
    }

    const next = document.createElement('p');
    next.className = 'result__next';
    next.textContent =
      '下一阶段（港务长买股份 / 装货 / 放置小弟 / 掷骰推船）尚未实现，第一版到此为止。';

    resultEl.append(eyebrow, name, detail, next);
  }

  return {
    element,

    render(state, error) {
      currentState = state;
      const bidding = state.bidding;

      voyageEl.textContent = `第 ${state.voyage} 段航程`;
      errorEl.hidden = !error;
      errorEl.textContent = error ?? '';

      if (!bidding) {
        turnEl.textContent = '—';
        return;
      }

      const turnId = currentBidder(bidding);
      currentPlayerId = turnId;
      const turnName = state.players.find((p) => p.id === turnId)?.name;

      highBidEl.textContent =
        bidding.highBidder === null
          ? '尚无人出价'
          : `${bidding.highBid} 元（${state.players.find((p) => p.id === bidding.highBidder)?.name ?? ''}）`;

      turnEl.textContent = turnName ?? '（竞标已结束）';
      auctionEl.classList.toggle('is-closed', bidding.status !== 'open');

      const isOpen = bidding.status === 'open';
      amountEl.disabled = !isOpen;
      bidBtn.disabled = !isOpen;
      passBtn.disabled = !isOpen;

      if (isOpen) {
        const player = state.players.find((p) => p.id === turnId);
        const max = player ? creditLimit(player) : 0;
        const min = minLegalBid(bidding);
        amountEl.value = amountEl.value === '' ? String(min) : amountEl.value;
        clampDraft();
        hintEl.textContent =
          max < min
            ? `现金与可抵押股份不足以下最低出价（${min} 元），只能过牌。`
            : `最低 ${min} 元，最高 ${max} 元。过牌后本段航程不能再出价。`;
      } else {
        hintEl.textContent = '';
      }

      renderResult(state);
      renderPlayers(state, turnId);
      logEl.replaceChildren();
      for (const line of state.log) {
        const li = document.createElement('li');
        li.textContent = line;
        logEl.appendChild(li);
      }
      logEl.parentElement?.scrollTo({ top: logEl.scrollHeight });
    },

    dispose() {
      element.remove();
    },
  };
}
