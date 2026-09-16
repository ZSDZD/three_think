import type { GoodId } from '../core/types';

/**
 * 棋盘拓扑与格位数据 —— 只描述「棋盘上有什么、怎么连接、印了什么数」，不含任何渲染信息。
 * 渲染层（src/render/board.ts）读这份数据生成几何体；
 * 规则层（src/core/）读这份数据判断结果与结算。
 *
 * 来源：中文规则 http://www.mf8-china.com/archiver/?tid-72459.html
 *       「在游戏台上，每艘船有它的航线，航线上有从０到１３的空格，在目标港口结束。」
 *
 * ⚠️ 数值可信度见本文件末尾的 PRINTED_VALUES_PROVENANCE。
 */

// ---------------------------------------------------------------- 航道

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

/** 港口空格数（A/B/C），按抵达顺序分配 */
export const PORT_SLOTS = ['A', 'B', 'C'] as const;

/** 修船场空格数（A/B/C），按进厂顺序分配 */
export const SHIPYARD_SLOTS = ['A', 'B', 'C'] as const;

export type PortSlot = (typeof PORT_SLOTS)[number];
export type ShipyardSlot = (typeof SHIPYARD_SLOTS)[number];

/** 移动回合数。规则：「这个阶段有三个…平底船移动回合」 */
export const MOVEMENT_ROUNDS = 3;

// ---------------------------------------------------------------- 货物

export interface GoodDef {
  readonly id: GoodId;
  readonly name: string;
  /** 骰子颜色索引。**颜色对应关系待核对** */
  readonly dieIndex: number;
}

export const GOODS: readonly GoodDef[] = [
  { id: 'nutmeg', name: '肉豆蔻', dieIndex: 0 },
  { id: 'silk', name: '丝绸', dieIndex: 1 },
  { id: 'jade', name: '玉', dieIndex: 2 },
  { id: 'ginseng', name: '人参', dieIndex: 3 },
];

export function getGood(id: GoodId): GoodDef {
  const found = GOODS.find((g) => g.id === id);
  if (!found) throw new Error(`未知货物: ${id}`);
  return found;
}

export function goodName(id: GoodId): string {
  return getGood(id).name;
}

// ---------------------------------------------------------------- 价格轨

/**
 * 黑市价格轨的刻度。
 *
 * **待核对**：规则只举例「从０到５」，未列出完整刻度。
 * 这里按 5 元一档、终点 30 元（= GAME_END_PRICE）推定。
 */
export const PRICE_TRACK: readonly number[] = [0, 5, 10, 15, 20, 25, 30];

// ---------------------------------------------------------------- 格位

/** 一个可放置小弟的格位 */
export interface SpotDef {
  /** 放置费用（披索） */
  readonly cost: number;
  /** 该格位的报酬。货仓的报酬在板块级别，这里为 0 */
  readonly reward: number;
}

/**
 * 货仓板块（ware load）。每艘船装一块，共 3 块上船、1 块留在岸上。
 *
 * 规则要点：
 * - 「对人参，丝绸，以及肉豆蔻，船上有三个同伙空格，而对于玉，船上有四个同伙空格。」
 * - 「他应该选择该货仓中最低价的空的空格」→ spaces 必须按 cost 升序排列
 * - 「每个货仓上有可分配的利润，由同伙均分」→ totalReward 由格位上的小弟**均分**
 *
 * **待核对**：各格位费用与板块总利润均为占位值。
 * 另有一处歧义待确认：规则里「最低价的空格」的"价"指**放置费**还是别的，
 * 本实现按「放置费」理解（这样先放的人付得少，后放的人付得多，形成压力）。
 */
export interface WareLoadDef {
  readonly good: GoodId;
  /** 格位，**必须按 cost 升序**（规则要求依次填最低价空位） */
  readonly spaces: readonly SpotDef[];
  /** 该货仓的总利润，由占用格位的小弟均分 */
  readonly totalReward: number;
}

export const WARE_LOADS: readonly WareLoadDef[] = [
  {
    good: 'nutmeg',
    spaces: [
      { cost: 1, reward: 0 },
      { cost: 2, reward: 0 },
      { cost: 3, reward: 0 },
    ],
    totalReward: 8,
  },
  {
    good: 'silk',
    spaces: [
      { cost: 1, reward: 0 },
      { cost: 2, reward: 0 },
      { cost: 3, reward: 0 },
    ],
    totalReward: 10,
  },
  {
    good: 'jade',
    spaces: [
      { cost: 2, reward: 0 },
      { cost: 3, reward: 0 },
      { cost: 4, reward: 0 },
      { cost: 5, reward: 0 },
    ],
    totalReward: 20,
  },
  {
    good: 'ginseng',
    spaces: [
      { cost: 2, reward: 0 },
      { cost: 3, reward: 0 },
      { cost: 4, reward: 0 },
    ],
    totalReward: 15,
  },
];

export function getWareLoad(good: GoodId): WareLoadDef {
  const found = WARE_LOADS.find((w) => w.good === good);
  if (!found) throw new Error(`未知货仓: ${good}`);
  return found;
}

/**
 * 港口空格 A/B/C：按第 1/2/3 艘抵达的船分配。
 * 报酬由海港钱箱支付。
 *
 * **待核对**：cost 与 reward 均为占位值。
 */
export const PORT_SPACES: readonly SpotDef[] = [
  { cost: 5, reward: 30 },
  { cost: 3, reward: 20 },
  { cost: 2, reward: 10 },
];

/**
 * 修船场空格 A/B/C：按第 1/2/3 艘进厂的船分配。
 * 赔偿由**保险仲介者**支付（无人担任时由海港钱箱负担）。
 *
 * **待核对**：cost 与 reward 均为占位值。
 */
export const SHIPYARD_SPACES: readonly SpotDef[] = [
  { cost: 3, reward: 15 },
  { cost: 2, reward: 10 },
  { cost: 1, reward: 5 },
];

/**
 * 海盗船上的 2 个格位。
 * 规则：「海盗船上有两个同伙空格。第一个使用海盗空格的同伙占据第一格，成为海盗船的船长。」
 *
 * **待核对**：费用为占位值。船长位更贵（登船时有优先权）。
 */
export const PIRATE_SPACES: readonly SpotDef[] = [
  { cost: 3, reward: 0 },
  { cost: 2, reward: 0 },
];

/**
 * 海盗登船时，被劫掠货物的归属价值。
 *
 * 规则：海盗「平均分配利润」，「所有在被劫掠的平底船上的同伙则空手而回」。
 * 这里取被劫掠货仓的 totalReward 作为劫掠所得。
 */

/** 部署格费用（规则有明确数字的部分） */

/** 小领航员放置费。规则：「小领航员（放在２元披索的空格的）」 */
export const PILOT_SMALL_COST = 2;

/** 大领航员放置费。规则：「大领航员（放在５元披索的空格的）」 */
export const PILOT_LARGE_COST = 5;

/** 保险处放置费。规则：「不用负担任何费用，但是立即从港口的钱箱得到１０元披索」 */
export const INSURANCE_COST = 0;

/** 保险仲介者放置时立即取得的金额 */
export const INSURANCE_FEE = 10;

// ---------------------------------------------------------------- 数值可信度

/**
 * 棋盘印刷数值的可信度。
 *
 * - `verified`：已对照实物棋盘或官方规则书核实
 * - `placeholder`：**无可靠来源**，按规则文字推定的占位值
 *
 * 当前为 `placeholder`：港口/修船场报酬、货仓费用与利润、价格轨刻度都缺少可靠来源。
 * UI 会据此显示醒目提示，避免把推定值误当成原版数值。
 *
 * 核实后请把这里改成 `verified`，并在 docs/design-v1.md §5 更新来源。
 */
export const PRINTED_VALUES_PROVENANCE: 'verified' | 'placeholder' = 'placeholder';

/** 只有价格轨刻度有出处（规则举例「从０到５」），其余全部待核对 */
export function printedValuesWarning(): string | null {
  if (PRINTED_VALUES_PROVENANCE === 'verified') return null;
  return '棋盘印刷数值（港口/修船场报酬、货仓费用与利润）尚无可靠来源，当前为推定占位值，结算结果不代表原版游戏。';
}
