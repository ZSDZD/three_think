/**
 * 竞标港务长办事处的纯状态机。
 *
 * 规则来源（http://www.mf8-china.com/archiver/?tid-72459.html）：
 * - 「竞标过程以顺时针方向进行，每位玩家在轮到他的时候，决定 pass 或是以更高价竞标。」
 * - 「当一位玩家在一个航程中的竞标中 pass 后，他不能在往后的过程中重新进入竞标。」
 * - 「竞标过程在除了其中一位玩家之外的所有玩家 pass 之后结束。这位玩家赢得竞标。
 *    他将得标价交给海港的钱箱，成为新的港口负责人。」
 * - 「如果没有玩家参与竞标，上一段航程的港口负责人仍为这个航程的负责人。」
 * - 「玩家的竞标价不能超过他所能付出的价格。」（= 现金 + 未抵押股份 × 12）
 * - 「在第一段航程中，最老的玩家开始竞标…在接下来的航程中，由前一个回合拥有海港负责人的玩家开始竞标。
 *    如果开始竞标的玩家 pass，则改由他左边的玩家开始，以顺时针方向依此类推。」
 *
 * 本文件是纯函数：不依赖 three.js、不依赖时间、不产生副作用。
 * 每次转换返回**新的不可变状态**（agent.md §5），便于悔棋、回放与将来的联机同步。
 */
import { MIN_BID, MORTGAGE_LOAN } from '../config/constants';
import { findPlayer, type Player, type PlayerId } from './types';

/** 竞标状态。open = 进行中；其余三种都是终态。 */
export type BiddingStatus =
  | 'open'
  /** 有人得标，已产生港务长 */
  | 'won'
  /** 无人出价，上届港务长连任 */
  | 'incumbent-holds'
  /** 无人出价且无在任者（只会发生在第一段航程）—— 见下方补充规则说明 */
  | 'no-bid-default';

export interface BiddingState {
  /** 座位顺序（顺时针），竞标按此顺序轮转 */
  readonly order: readonly PlayerId[];
  /** 起叫者的座位下标 */
  readonly starterIndex: number;
  /** 上届港务长；无人出价时他连任。第一段航程为 null */
  readonly incumbent: PlayerId | null;
  /** 已过牌的玩家，本段航程不得再进场 */
  readonly passed: readonly PlayerId[];
  /** 当前最高价；0 表示尚无人出价 */
  readonly highBid: number;
  /** 当前最高出价者 */
  readonly highBidder: PlayerId | null;
  /** 当前该谁行动的座位下标 */
  readonly cursor: number;
  readonly status: BiddingStatus;
  /** 终态时的得标者（或连任者） */
  readonly winner: PlayerId | null;
  /** 终态时的成交价 */
  readonly paid: number;
}

export type BiddingAction =
  | { readonly type: 'bid'; readonly playerId: PlayerId; readonly amount: number }
  | { readonly type: 'pass'; readonly playerId: PlayerId };

export type BiddingErrorCode =
  | 'auction-closed'
  | 'not-your-turn'
  | 'already-passed'
  | 'unknown-player'
  | 'amount-not-integer'
  | 'amount-too-low'
  | 'over-credit-limit';

export interface BiddingError {
  readonly code: BiddingErrorCode;
  readonly message: string;
}

export type BiddingEvent =
  | { readonly type: 'bid'; readonly playerId: PlayerId; readonly amount: number }
  | { readonly type: 'pass'; readonly playerId: PlayerId }
  | { readonly type: 'won'; readonly playerId: PlayerId; readonly amount: number }
  | { readonly type: 'incumbent-holds'; readonly playerId: PlayerId }
  | { readonly type: 'no-bid-default'; readonly playerId: PlayerId };

export type BiddingOutcome =
  | { readonly ok: true; readonly state: BiddingState; readonly events: readonly BiddingEvent[] }
  | { readonly ok: false; readonly error: BiddingError };

/**
 * 玩家的竞标能力上限 = 现金 + 未抵押股份数 × 12。
 * 规则：「玩家可以将他的股份拿去抵押贷款，用来得到他竞标所需要的金钱」
 */
export function creditLimit(player: Player): number {
  const unmortgaged = player.shares.filter((s) => !s.mortgaged).length;
  return player.cash + unmortgaged * MORTGAGE_LOAN;
}

/** 当前允许的最低出价 */
export function minLegalBid(state: BiddingState): number {
  return Math.max(MIN_BID, state.highBid + 1);
}

/** 当前该谁行动；已结束时为 null */
export function currentBidder(state: BiddingState): PlayerId | null {
  if (state.status !== 'open') return null;
  return state.order[state.cursor] ?? null;
}

/** 本段航程仍在场内（未过牌）的玩家 */
export function activeBidders(state: BiddingState): readonly PlayerId[] {
  return state.order.filter((id) => !state.passed.includes(id));
}

export function createBidding(
  order: readonly PlayerId[],
  starterId: PlayerId,
  incumbent: PlayerId | null,
): BiddingState {
  const starterIndex = order.indexOf(starterId);
  if (starterIndex < 0) throw new Error(`起叫者不在座位顺序中: ${starterId}`);
  if (order.length < 2) throw new Error('竞标至少需要 2 名玩家');

  return {
    order,
    starterIndex,
    incumbent,
    passed: [],
    highBid: 0,
    highBidder: null,
    cursor: starterIndex,
    status: 'open',
    winner: null,
    paid: 0,
  };
}

/** 从 from 的下一位开始顺时针找第一个未过牌的下标 */
function nextActiveIndex(state: BiddingState, from: number): number {
  const n = state.order.length;
  for (let step = 1; step <= n; step += 1) {
    const idx = (from + step) % n;
    const id = state.order[idx];
    if (id !== undefined && !state.passed.includes(id)) return idx;
  }
  return from;
}

/**
 * 应用一次竞标动作，返回新状态与事件。
 *
 * 纯函数：不修改传入的 state 与 players。
 */
export function applyBiddingAction(
  state: BiddingState,
  players: readonly Player[],
  action: BiddingAction,
): BiddingOutcome {
  if (state.status !== 'open') {
    return fail('auction-closed', '本段航程的竞标已经结束。');
  }

  const expected = currentBidder(state);
  if (expected !== action.playerId) {
    return fail('not-your-turn', `现在轮到 ${expected ?? '（无人）'}，不是 ${action.playerId}。`);
  }

  if (state.passed.includes(action.playerId)) {
    return fail('already-passed', `${action.playerId} 已过牌，本段航程不能再出价。`);
  }

  const player = findPlayer(players, action.playerId);
  if (!player) {
    return fail('unknown-player', `找不到玩家 ${action.playerId}。`);
  }

  const events: BiddingEvent[] = [];
  let next: BiddingState;

  if (action.type === 'bid') {
    const { amount } = action;
    if (!Number.isInteger(amount)) {
      return fail('amount-not-integer', `出价必须是整数，收到 ${amount}。`);
    }
    const minimum = minLegalBid(state);
    if (amount < minimum) {
      return fail('amount-too-low', `出价必须高于当前最高价，最低 ${minimum} 元。`);
    }
    const limit = creditLimit(player);
    if (amount > limit) {
      return fail(
        'over-credit-limit',
        `出价上限为 ${limit} 元（现金 ${player.cash} + 未抵押股份可贷 ${limit - player.cash}）。`,
      );
    }
    next = { ...state, highBid: amount, highBidder: action.playerId };
    events.push({ type: 'bid', playerId: action.playerId, amount });
  } else {
    next = { ...state, passed: [...state.passed, action.playerId] };
    events.push({ type: 'pass', playerId: action.playerId });
  }

  // ---- 判定竞标是否结束 ----
  const active = activeBidders(next);

  if (active.length === 0) {
    // 全员过牌，无人出价
    if (next.incumbent !== null) {
      // 规则：「如果没有玩家参与竞标，上一段航程的港口负责人仍为这个航程的负责人。」
      const settled: BiddingState = {
        ...next,
        status: 'incumbent-holds',
        winner: next.incumbent,
        paid: 0,
      };
      events.push({ type: 'incumbent-holds', playerId: next.incumbent });
      return { ok: true, state: settled, events };
    }
    // 补充规则：第一段航程无人出价时原版规则未定义（没有「上一段航程的负责人」可连任）。
    // 本实现取「起叫者以 0 元接任」，见 docs/design-v1.md 待核对项。
    const fallback = next.order[next.starterIndex];
    if (fallback === undefined) {
      return fail('unknown-player', '座位顺序为空，无法决定接任者。');
    }
    const settled: BiddingState = {
      ...next,
      status: 'no-bid-default',
      winner: fallback,
      paid: 0,
    };
    events.push({ type: 'no-bid-default', playerId: fallback });
    return { ok: true, state: settled, events };
  }

  if (active.length === 1) {
    const sole = active[0];
    if (sole === undefined) {
      return fail('unknown-player', '无法确定唯一在场玩家。');
    }
    if (next.highBidder === sole) {
      // 除他之外都过牌了 —— 得标
      const settled: BiddingState = {
        ...next,
        status: 'won',
        winner: sole,
        paid: next.highBid,
      };
      events.push({ type: 'won', playerId: sole, amount: next.highBid });
      return { ok: true, state: settled, events };
    }
    // 只剩他一人但还没出过价：轮到他，必须出价或过牌
    return {
      ok: true,
      state: { ...next, cursor: next.order.indexOf(sole) },
      events,
    };
  }

  return { ok: true, state: { ...next, cursor: nextActiveIndex(next, next.cursor) }, events };
}

function fail(code: BiddingErrorCode, message: string): BiddingOutcome {
  return { ok: false, error: { code, message } };
}
