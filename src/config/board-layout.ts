import type { GoodId } from '../core/types';

/**
 * 棋盘拓扑 —— 只描述「棋盘上有什么、怎么连接」，不含任何渲染信息。
 * 渲染层（src/render/board.ts）读这份数据生成几何体；
 * 规则层（src/core/）读这份数据判断结果。
 *
 * 来源：中文规则 http://www.mf8-china.com/archiver/?tid-72459.html
 * 「在游戏台上，每艘船有它的航线，航线上有从０到１３的空格，在目标港口结束。」
 */

/** 一条航道的最后一格编号。通过第 13 格即抵达马尼拉。 */
export const LANE_LAST_SPACE = 13;

/** 一条航道的格数（0..13） */
export const LANE_SPACES = LANE_LAST_SPACE + 1;

/** 航道数 = 平底船数 = 3。规则：「三艘平底船」 */
export const LANE_COUNT = 3;

/** 平底船起点可选的格子范围。规则：「将船放在航道中数字０到５中的任何一个起始位置」 */
export const LAUNCH_POSITIONS = [0, 1, 2, 3, 4, 5] as const;

/**
 * 三艘平底船起点之和必须等于此值。
 * 规则：「这三艘平底船的起始位置的和必须刚好是９」
 */
export const LAUNCH_POSITION_SUM = 9;

/** 港口空格数（A/B/C），按抵达顺序分配。规则：「第一艘抵达…放在港口空格Ａ，第二艘放在Ｂ，第三艘放在Ｃ」 */
export const PORT_SLOTS = ['A', 'B', 'C'] as const;

/** 修船场空格数（A/B/C），按进厂顺序分配。规则：「如果只有一艘船未能抵达…停在修船场空格Ａ」 */
export const SHIPYARD_SLOTS = ['A', 'B', 'C'] as const;

export type PortSlot = (typeof PORT_SLOTS)[number];
export type ShipyardSlot = (typeof SHIPYARD_SLOTS)[number];

/** 货物定义 */
export interface GoodDef {
  readonly id: GoodId;
  readonly name: string;
  /** 骰子颜色索引：规则中 4 颗骰子以颜色区分 4 种货物。**具体颜色对应关系待核对** */
  readonly dieIndex: number;
  /** 该货物货仓上的小弟位数量。规则：「人参，丝绸，肉豆蔻…三个同伙空格，而对于玉…四个」 */
  readonly holdSpaces: number;
}

export const GOODS: readonly GoodDef[] = [
  { id: 'nutmeg', name: '肉豆蔻', dieIndex: 0, holdSpaces: 3 },
  { id: 'silk', name: '丝绸', dieIndex: 1, holdSpaces: 3 },
  { id: 'jade', name: '玉', dieIndex: 2, holdSpaces: 4 },
  { id: 'ginseng', name: '人参', dieIndex: 3, holdSpaces: 3 },
];

export function getGood(id: GoodId): GoodDef {
  const found = GOODS.find((g) => g.id === id);
  if (!found) throw new Error(`未知货物: ${id}`);
  return found;
}

/**
 * 黑市价格轨的刻度。
 *
 * **待核对**：规则只举例「从０到５」，未列出完整刻度。
 * 这里按 5 元一档、终点 30 元（= GAME_END_PRICE）推定。
 */
export const PRICE_TRACK: readonly number[] = [0, 5, 10, 15, 20, 25, 30];

/**
 * 港口报酬，对应第 1/2/3 艘抵达的船（A/B/C）。
 *
 * **待核对**：原版棋盘上的印刷数值，中文规则未给出，此处为占位值。
 */
export const PORT_REWARDS: readonly number[] = [30, 20, 10];

/**
 * 修船场赔偿，对应第 1/2/3 艘进厂的船（A/B/C）。
 * 保险仲介者需按此金额理赔。
 *
 * **待核对**：原版棋盘上的印刷数值，中文规则未给出，此处为占位值。
 */
export const SHIPYARD_REWARDS: readonly number[] = [15, 10, 5];

/** 部署格费用（规则有明确数字的部分） */

/** 小领航员放置费。规则：「小领航员（放在２元披索的空格的）」 */
export const PILOT_SMALL_COST = 2;

/** 大领航员放置费。规则：「大领航员（放在５元披索的空格的）」 */
export const PILOT_LARGE_COST = 5;

/** 保险处放置费。规则：「可以将他的同伙放在这里，不用负担任何费用，但是立即从港口的钱箱得到１０元披索」 */
export const INSURANCE_COST = 0;

/** 保险仲介者放置时立即取得的金额 */
export const INSURANCE_FEE = 10;

/** 海盗船上的小弟位数量。规则：「海盗船上有两个同伙空格」 */
export const PIRATE_SPACES = 2;
