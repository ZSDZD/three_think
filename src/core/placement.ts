/**
 * 放置小弟的规则。
 *
 * 规则来源：http://www.mf8-china.com/archiver/?tid-72459.html
 * - 「由海港负责人开始，每位玩家按照顺时针方向，依序将一个同伙放在任何一个空的同伙空格，
 *    并将该空格标示的金额付给海港的钱箱（例外：保险，详见下面介绍）。」
 * - 「在任何时候，玩家在轮到他时可以选择自我克制而不放置同伙。然而，当玩家决定这么做时，
 *    他在这个航程不能再放置任何同伙。」
 * - 货仓：「他应该选择该货仓中最低价的空的空格。」
 * - 盲目的旅客：「当玩家没有现金…或是现金不足以放置同伙到最便宜的部署空间，他可以免费
 *    （或是以他所有的金额…）将同伙如同盲目的旅客般部署在任何有空位的空间
 *    （除了保险仲介者，不允许他担任）。」
 *
 * 本文件是纯函数，依赖一个最小的 PlacementContext 而不是整个 GameState，
 * 以避免与 game.ts 形成循环依赖。
 */
import { getWareLoad, INSURANCE_COST, PIRATE_SPACES } from '../config/board-layout';
import type { Player, PlayerId } from './types';
import {
  isAtSea,
  spotCost,
  spotKey,
  type BoatState,
  type Placement,
  type SpotRef,
} from './voyage';

export interface PlacementContext {
  readonly boats: readonly BoatState[];
  readonly placements: readonly Placement[];
  readonly players: readonly Player[];
}

export type PlacementErrorCode =
  | 'not-your-turn'
  | 'already-placed-this-round'
  | 'declined'
  | 'no-accomplices-left'
  | 'spot-taken'
  | 'spot-unavailable'
  | 'must-take-cheapest-hold-space'
  | 'blind-cannot-be-insurer'
  | 'not-enough-accomplices-in-supply';

export interface PlacementError {
  readonly code: PlacementErrorCode;
  readonly message: string;
}

export type PlacementOutcome =
  | { readonly ok: true; readonly placement: Placement; readonly notes: readonly string[] }
  | { readonly ok: false; readonly error: PlacementError };

/** 已被占用的格位 key */
export function occupiedKeys(ctx: PlacementContext): Set<string> {
  return new Set(ctx.placements.map((p) => spotKey(p.spot)));
}

/** 某玩家在本段航程已放置的小弟数 */
export function placedCount(ctx: PlacementContext, playerId: PlayerId): number {
  return ctx.placements.filter((p) => p.playerId === playerId).length;
}

/** 该船货仓中「最低价的空位」的下标；没有空位则为 null */
export function cheapestEmptyHoldSpace(ctx: PlacementContext, boatIndex: number): number | null {
  const boat = ctx.boats[boatIndex];
  if (!boat || boat.good === null) return null;
  if (!isAtSea(boat)) return null;

  const load = getWareLoad(boat.good);
  const taken = new Set(
    ctx.placements
      .filter((p) => p.spot.kind === 'hold' && p.spot.boat === boatIndex)
      .map((p) => (p.spot.kind === 'hold' ? p.spot.space : -1)),
  );

  // 规则要求必须选最低价的空位；spaces 已按费用升序排列
  for (let i = 0; i < load.spaces.length; i += 1) {
    if (!taken.has(i)) return i;
  }
  return null;
}

/**
 * 海盗船上「必须先填」的空位下标。
 *
 * 规则：「第一个使用海盗空格的同伙占据第一格，成为海盗船的船长。
 * 如果船长的空格被占据，玩家将他的同伙放在第二格。」
 * → 与货仓一样是**强制顺序**，不能自由挑便宜的那格。
 */
export function nextPirateSpace(ctx: PlacementContext): number | null {
  const taken = occupiedKeys(ctx);
  for (let space = 0; space < PIRATE_SPACES.length; space += 1) {
    if (!taken.has(spotKey({ kind: 'pirate', space }))) return space;
  }
  return null;
}

/** 当前所有可放置的格位（不含已占用的） */
export function availableSpots(ctx: PlacementContext): SpotRef[] {
  const taken = occupiedKeys(ctx);
  const spots: SpotRef[] = [];

  ctx.boats.forEach((_, boatIndex) => {
    const space = cheapestEmptyHoldSpace(ctx, boatIndex);
    if (space !== null) spots.push({ kind: 'hold', boat: boatIndex, space });
  });

  for (let slot = 0; slot < 3; slot += 1) {
    const ref: SpotRef = { kind: 'port', slot };
    if (!taken.has(spotKey(ref))) spots.push(ref);
  }
  for (let slot = 0; slot < 3; slot += 1) {
    const ref: SpotRef = { kind: 'shipyard', slot };
    if (!taken.has(spotKey(ref))) spots.push(ref);
  }

  const pirateSpace = nextPirateSpace(ctx);
  if (pirateSpace !== null) spots.push({ kind: 'pirate', space: pirateSpace });

  for (const size of ['small', 'large'] as const) {
    const ref: SpotRef = { kind: 'pilot', size };
    if (!taken.has(spotKey(ref))) spots.push(ref);
  }
  const insurance: SpotRef = { kind: 'insurance' };
  if (!taken.has(spotKey(insurance))) spots.push(insurance);

  return spots;
}

/** 某格位的实际放置费（货仓需要知道船上装的哪种货） */
export function costOf(ctx: PlacementContext, spot: SpotRef): number {
  if (spot.kind !== 'hold') return spotCost(spot);
  const boat = ctx.boats[spot.boat];
  if (!boat || boat.good === null) return 0;
  return getWareLoad(boat.good).spaces[spot.space]?.cost ?? 0;
}

/**
 * 当前可用的**付费**格位中最便宜的费用。
 *
 * 必须排除保险处：它的费用恒为 0，若把它算进来，「最便宜的部署空间」就永远是 0，
 * 盲目旅客的判定将永不成立。而规则明确说盲目旅客不能担任保险仲介者，
 * 说明判定「现金是否够付最便宜的空间」时本就不该把保险处算进去。
 */
export function cheapestSpotCost(ctx: PlacementContext): number {
  const costs = availableSpots(ctx)
    .filter((s) => s.kind !== 'insurance')
    .map((s) => costOf(ctx, s));
  return costs.length === 0 ? 0 : Math.min(...costs);
}

/**
 * 是否必须以「盲目的旅客」身份放置。
 * 判定：现金不足以支付当前最便宜的**付费**格位。
 */
export function mustBeBlind(ctx: PlacementContext, player: Player): boolean {
  return player.cash < cheapestSpotCost(ctx);
}

/** 是否有可用的空位 */
export function hasFreeSpot(ctx: PlacementContext): boolean {
  return availableSpots(ctx).length > 0;
}

/**
 * 放置一个小弟。
 *
 * 注意：调用方（game.ts）负责判定「是否轮到该玩家」与「他是否已自我克制」，
 * 因为那些属于航程轮转逻辑，不属于格位规则。
 */
export function applyPlacement(
  ctx: PlacementContext,
  playerId: PlayerId,
  spot: SpotRef,
): PlacementOutcome {
  const player = ctx.players.find((p) => p.id === playerId);
  if (!player) {
    return { ok: false, error: { code: 'not-your-turn', message: `找不到玩家 ${playerId}。` } };
  }

  if (placedCount(ctx, playerId) >= player.accomplicesTotal) {
    return {
      ok: false,
      error: { code: 'no-accomplices-left', message: `${player.name} 的小弟已经用完了。` },
    };
  }

  const taken = occupiedKeys(ctx);
  if (taken.has(spotKey(spot))) {
    return { ok: false, error: { code: 'spot-taken', message: '这个格位已经有人了。' } };
  }

  // 货仓必须放在最低价的空位
  if (spot.kind === 'hold') {
    const cheapest = cheapestEmptyHoldSpace(ctx, spot.boat);
    if (cheapest === null) {
      return { ok: false, error: { code: 'spot-unavailable', message: '这艘船的货仓已经满了。' } };
    }
    if (spot.space !== cheapest) {
      return {
        ok: false,
        error: {
          code: 'must-take-cheapest-hold-space',
          message: '货仓必须放在最低价的空位。',
        },
      };
    }
  }

  // 海盗船必须按顺序填：第一个占据第一格成为船长
  if (spot.kind === 'pirate') {
    const expected = nextPirateSpace(ctx);
    if (expected === null) {
      return { ok: false, error: { code: 'spot-unavailable', message: '海盗船上已经满了。' } };
    }
    if (spot.space !== expected) {
      return {
        ok: false,
        error: {
          code: 'must-take-cheapest-hold-space',
          message: `海盗船必须按顺序填：先占第 ${expected + 1} 格。`,
        },
      };
    }
  }

  const blind = mustBeBlind(ctx, player);

  // 盲目的旅客不能担任保险仲介者
  if (blind && spot.kind === 'insurance') {
    return {
      ok: false,
      error: {
        code: 'blind-cannot-be-insurer',
        message: '现金不足时不能担任保险仲介者。',
      },
    };
  }

  const nominal = costOf(ctx, spot);
  // 盲目的旅客「免费（或是以他所有的金额，如果他的金额不足以安排同伙在最低价的部署空间）」
  const cost = blind ? Math.min(player.cash, nominal) : nominal;

  const notes: string[] = [];
  if (blind) {
    notes.push(`${player.name} 现金不足，作为「盲目的旅客」放置，付出全部现金 ${cost} 元。`);
  }

  return {
    ok: true,
    placement: { playerId, spot, cost, blind, fromPirate: false },
    notes,
  };
}

/** 保险处放置时立即取得的金额（规则：从港口钱箱得到 10 元） */
export function insuranceFee(spot: SpotRef): number {
  return spot.kind === 'insurance' && INSURANCE_COST === 0 ? 10 : 0;
}

/**
 * 本段航程的放置轮转顺序：从港务长开始顺时针。
 * 已自我克制或小弟用完的玩家会被跳过。
 */
export function placementOrder(
  players: readonly Player[],
  harborMaster: PlayerId,
  declined: readonly PlayerId[],
): PlayerId[] {
  const ids = players.map((p) => p.id);
  const start = ids.indexOf(harborMaster);
  const rotated = start < 0 ? ids : [...ids.slice(start), ...ids.slice(0, start)];
  return rotated.filter((id) => !declined.includes(id));
}
