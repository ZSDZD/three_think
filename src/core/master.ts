/**
 * 港务长职权的校验。
 *
 * 规则来源：http://www.mf8-china.com/archiver/?tid-72459.html
 * 「海港负责人执行办事处的职责：
 *  ａ）购买一份股份…股份的成本由该种类的货物目前在黑市的价格决定。然而，
 *     股份的最低价格永远为５元披索。只有海港负责人可以买进股份，但他不一定要这么做。
 *  ｂ）装载货物…他将其中三种货物每一种放在一艘平底船上。他决定哪一种货物不装载。
 *  ｃ）将平底船放入海中…每艘船有它的航线…海港负责人将每艘平底船放入其中一条航道，
 *     但是两艘平底船不能在相同的航道。当他放置平底船时，他将船放在航道中数字０到５中的
 *     任何一个起始位置。然而，这三艘平底船的起始位置的和必须刚好是９。」
 */
import { GOODS, LANE_COUNT, LAUNCH_POSITION_SUM, LAUNCH_POSITIONS, PRICE_TRACK } from '../config/board-layout';
import type { GoodId } from './types';

export interface ValidationOk {
  readonly ok: true;
}
export interface ValidationFail {
  readonly ok: false;
  readonly message: string;
}
export type Validation = ValidationOk | ValidationFail;

export function ok(): ValidationOk {
  return { ok: true };
}
export function fail(message: string): ValidationFail {
  return { ok: false, message };
}

/** 校验装货：恰好 3 种不同的货，分别放到 3 条不同的航道上，另一种不装 */
export function validateLoad(laneAssignment: readonly GoodId[]): Validation {
  if (laneAssignment.length !== LANE_COUNT) {
    return fail(`必须为 ${LANE_COUNT} 条航道各装一种货，收到 ${laneAssignment.length} 种。`);
  }
  const unique = new Set(laneAssignment);
  if (unique.size !== LANE_COUNT) {
    return fail('三艘船不能装同一种货，必须是三种不同的货物。');
  }
  for (const good of laneAssignment) {
    if (!GOODS.some((g) => g.id === good)) return fail(`未知货物: ${good}`);
  }
  return ok();
}

/** 被排除的货物 = 4 种里没被装船的那一种 */
export function skippedGoodOf(laneAssignment: readonly GoodId[]): GoodId | null {
  const loaded = new Set(laneAssignment);
  return GOODS.find((g) => !loaded.has(g.id))?.id ?? null;
}

/** 校验放船：三艘船各在 0-5 的不同（其实是各自独立的）位置，且三船之和正好为 9 */
export function validateLaunch(positions: readonly number[]): Validation {
  if (positions.length !== LANE_COUNT) {
    return fail(`需要 ${LANE_COUNT} 个起点位置。`);
  }
  for (const p of positions) {
    if (!Number.isInteger(p)) return fail('起点位置必须是整数。');
    if (!LAUNCH_POSITIONS.includes(p as (typeof LAUNCH_POSITIONS)[number])) {
      return fail(`起点位置必须在 0-5 之间，收到 ${p}。`);
    }
  }
  const sum = positions.reduce((a, b) => a + b, 0);
  if (sum !== LAUNCH_POSITION_SUM) {
    return fail(`三艘平底船起点之和必须正好是 ${LAUNCH_POSITION_SUM}，当前为 ${sum}。`);
  }
  return ok();
}

/** 股份当前价格：不低于 5 元 */
export function sharePriceAt(priceIndex: number): number {
  return Math.max(5, PRICE_TRACK[priceIndex] ?? 5);
}
