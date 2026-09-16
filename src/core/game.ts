/**
 * 对局状态与唯一的状态推进入口。
 *
 * 分层要求（agent.md §3）：本文件属于 core/，**不得 import three.js**。
 *
 * 联机预留（用户已确认「本地热座为主，架构预留联机接口」）：
 * 状态推进只通过 applyIntent(state, intent) —— 意图是纯数据，可序列化。
 * 将来加联机时，对端只需要把 Intent 发过来，不需要改动规则层。
 */
import { GOODS, PRICE_TRACK } from '../config/board-layout';
import {
  ACCOMPLICES_BY_PLAYER_COUNT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MIN_SHARE_PRICE,
  MORTGAGE_LOAN,
  STARTING_CASH,
  STARTING_SHARES,
} from '../config/constants';
import {
  applyBiddingAction,
  createBidding,
  type BiddingEvent,
  type BiddingState,
  type BiddingAction,
} from './bidding';
import { createRng, shuffle } from './rng';
import { findPlayer, type GoodId, type Player, type PlayerId, type ShareCard } from './types';

export type GamePhase =
  /** 还没开局 */
  | 'setup'
  /** 竞标进行中 */
  | 'auction'
  /** 本段航程的竞标已结算（第一版到此为止，后续阶段待实现） */
  | 'auction-settled';

export interface GameState {
  readonly phase: GamePhase;
  /** 随机种子，写进对局记录以便复现 */
  readonly seed: number;
  /** 航程序号，从 1 开始 */
  readonly voyage: number;
  readonly players: readonly Player[];
  readonly bidding: BiddingState | null;
  /** 当前港务长；null 表示本段航程尚未产生 */
  readonly harborMaster: PlayerId | null;
  /** 各货物在黑市价格轨上的下标 */
  readonly priceIndex: Readonly<Record<GoodId, number>>;
  /** 面向玩家的中文事件日志 */
  readonly log: readonly string[];
}

/**
 * 玩家意图 —— 唯一允许驱动状态变化的东西。
 * 将来联机时，网络上传输的就是这个类型。
 */
export type Intent =
  | { readonly type: 'auction-bid'; readonly playerId: PlayerId; readonly amount: number }
  | { readonly type: 'auction-pass'; readonly playerId: PlayerId };

export interface IntentError {
  readonly code: string;
  readonly message: string;
}

export type IntentOutcome =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly BiddingEvent[] }
  | { readonly ok: false; readonly error: IntentError };

/** 五色玩家标识，前 3/4/5 个分别用于 3/4/5 人局 */
const PLAYER_COLORS = ['#d9a441', '#4aa39a', '#c4614f', '#6f83c9', '#9a6fbd'] as const;

export interface CreateGameOptions {
  readonly playerCount: number;
  readonly names?: readonly string[];
  readonly seed?: number;
}

/** 建局：发钱、发股份、发小弟。第一版不发牌（20 张行动牌未纳入 v1）。 */
export function createGame(options: CreateGameOptions): GameState {
  const { playerCount } = options;
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`玩家人数必须在 ${MIN_PLAYERS}-${MAX_PLAYERS} 之间，收到 ${playerCount}`);
  }

  const seed = options.seed ?? 1;
  const rng = createRng(seed);
  const accomplices = ACCOMPLICES_BY_PLAYER_COUNT[playerCount] ?? 3;

  // 规则：从 20 张股份中每种各拿 3 张（共 12 张）洗牌，每位玩家得到两张，牌面向下。
  const deck: ShareCard[] = [];
  for (const good of GOODS) {
    for (let copy = 0; copy < 3; copy += 1) {
      deck.push({ id: `${good.id}-${copy + 1}`, good: good.id, mortgaged: false });
    }
  }
  const shuffled = shuffle(deck, rng);
  const hands: ShareCard[][] = Array.from({ length: playerCount }, () => []);
  shuffled.forEach((card, i) => {
    const hand = hands[i % playerCount];
    if (hand && hand.length < STARTING_SHARES) hand.push(card);
  });

  const players: Player[] = hands.map((shares, i) => ({
    id: `p${i + 1}`,
    name: options.names?.[i]?.trim() || `玩家 ${i + 1}`,
    color: PLAYER_COLORS[i] ?? '#888888',
    cash: STARTING_CASH,
    shares,
    accomplicesTotal: accomplices,
  }));

  const priceIndex = Object.fromEntries(GOODS.map((g) => [g.id, 0])) as Record<GoodId, number>;

  return {
    phase: 'setup',
    seed,
    voyage: 1,
    players,
    bidding: null,
    harborMaster: null,
    priceIndex,
    log: [
      `${playerCount} 人局开始，每人 ${STARTING_CASH} 元披索、${accomplices} 个小弟、${STARTING_SHARES} 张股份。`,
    ],
  };
}

/**
 * 开始一段航程的竞标。
 *
 * 起叫者规则：「在第一段航程中，最老的玩家开始竞标…在接下来的航程中，
 * 由前一个回合拥有海港负责人的玩家开始竞标。」
 *
 * 简化：数字版无法得知年龄，第一段航程固定由**座位第 1 位**起叫。见 docs/design-v1.md。
 */
export function startVoyage(state: GameState): GameState {
  const order = state.players.map((p) => p.id);
  const incumbent = state.harborMaster;
  const starter = incumbent ?? order[0];
  if (starter === undefined) throw new Error('没有玩家，无法开始竞标');

  const bidding = createBidding(order, starter, incumbent);
  const starterName = findPlayer(state.players, starter)?.name ?? starter;

  return {
    ...state,
    phase: 'auction',
    bidding,
    log: [
      ...state.log,
      `第 ${state.voyage} 段航程：竞标港务长办事处，由 ${starterName} 起叫，起拍价 1 元。`,
    ],
  };
}

/** 货物当前单价（股份价值）。规则：股份最低价永远为 5 元。 */
export function sharePrice(state: GameState, good: GoodId): number {
  const idx = state.priceIndex[good] ?? 0;
  return Math.max(MIN_SHARE_PRICE, PRICE_TRACK[idx] ?? MIN_SHARE_PRICE);
}

/**
 * 应用一个意图。
 *
 * 这是**唯一**允许改变对局状态的入口 —— 纯函数，便于测试、回放和将来的联机同步。
 */
export function applyIntent(state: GameState, intent: Intent): IntentOutcome {
  if (state.phase !== 'auction' || state.bidding === null) {
    return {
      ok: false,
      error: { code: 'wrong-phase', message: '当前不在竞标阶段。' },
    };
  }

  const action: BiddingAction =
    intent.type === 'auction-bid'
      ? { type: 'bid', playerId: intent.playerId, amount: intent.amount }
      : { type: 'pass', playerId: intent.playerId };

  const outcome = applyBiddingAction(state.bidding, state.players, action);
  if (!outcome.ok) {
    return { ok: false, error: { code: outcome.error.code, message: outcome.error.message } };
  }

  const log = [...state.log, ...outcome.events.map((e) => describeEvent(state, e))];
  const settled = outcome.state.status !== 'open';

  if (!settled) {
    return { ok: true, state: { ...state, bidding: outcome.state, log }, events: outcome.events };
  }

  // 竞标结算：得标者付款入钱箱，成为港务长
  const winner = outcome.state.winner;
  let players = state.players;
  if (winner !== null && outcome.state.paid > 0) {
    const settledPayment = payToBank(state, players, winner, outcome.state.paid);
    players = settledPayment.players;
    log.push(...settledPayment.notes);
  }

  return {
    ok: true,
    state: {
      ...state,
      phase: 'auction-settled',
      players,
      bidding: outcome.state,
      harborMaster: winner,
      log,
    },
    events: outcome.events,
  };
}

/**
 * 得标者把成交价付给海港钱箱。
 *
 * 规则：「当玩家必须付钱而他没有足够的现金，他必须贷款」——
 * 现金不足时自动抵押股份（每张贷 MORTGAGE_LOAN 元）。
 * 简化：自动挑选**当前单价最低**的未抵押股份先抵押；原版允许玩家自行选择哪一张。
 */
function payToBank(
  state: GameState,
  players: readonly Player[],
  payerId: PlayerId,
  amount: number,
): { players: Player[]; notes: string[] } {
  const notes: string[] = [];
  const idx = players.findIndex((p) => p.id === payerId);
  const payer = players[idx];
  if (!payer || idx < 0) return { players: [...players], notes };

  let cash = payer.cash;
  let shares = [...payer.shares];
  let raised = 0;

  if (cash < amount) {
    const need = amount - cash;
    const mortgageOrder = shares
      .map((share, i) => ({ share, i }))
      .filter(({ share }) => !share.mortgaged)
      .sort((a, b) => sharePrice(state, a.share.good) - sharePrice(state, b.share.good));

    for (const { i } of mortgageOrder) {
      if (raised >= need) break;
      const card = shares[i];
      if (!card || card.mortgaged) continue;
      shares[i] = { ...card, mortgaged: true };
      raised += MORTGAGE_LOAN;
      notes.push(
        `${payer.name} 现金不足，抵押 1 张「${goodName(card.good)}」股份贷款 ${MORTGAGE_LOAN} 元。`,
      );
    }
    cash += raised;
  }

  const updated: Player = { ...payer, cash: cash - amount, shares };
  const next = [...players];
  next[idx] = updated;
  return { players: next, notes };
}

function goodName(good: GoodId): string {
  return GOODS.find((g) => g.id === good)?.name ?? good;
}

function describeEvent(state: GameState, event: BiddingEvent): string {
  const name = (id: PlayerId): string => findPlayer(state.players, id)?.name ?? id;
  switch (event.type) {
    case 'bid':
      return `${name(event.playerId)} 出价 ${event.amount} 元。`;
    case 'pass':
      return `${name(event.playerId)} 过牌，退出本段航程竞标。`;
    case 'won':
      return `${name(event.playerId)} 以 ${event.amount} 元得标，成为第 ${state.voyage} 段航程的港务长。`;
    case 'incumbent-holds':
      return `无人出价，${name(event.playerId)} 连任港务长。`;
    case 'no-bid-default':
      return `无人出价且无在任者，起叫者 ${name(event.playerId)} 以 0 元接任港务长。`;
  }
}

/** 供 UI 使用：某个玩家的信用额度 */
export function playerCreditLimit(player: Player): number {
  const unmortgaged = player.shares.filter((s) => !s.mortgaged).length;
  return player.cash + unmortgaged * MORTGAGE_LOAN;
}
