/**
 * 棋盘坐标 → 世界坐标的**唯一换算点**。
 *
 * agent.md §3：「棋盘尺寸统一用世界单位格子，所有落子坐标由 gridToWorld 单点换算，
 * 禁止散落魔法数。」
 *
 * 本文件是纯数字计算（不 import three.js），因此可以直接被测试。
 * 棋盘铺在 XZ 平面上，Y 轴向上；-Z 方向指向马尼拉港（远端）。
 */
import { LANE_COUNT, LANE_SPACES, PORT_SLOTS, SHIPYARD_SLOTS } from '../config/board-layout';

/** 相邻航道的间距 */
export const LANE_GAP = 3.4;

/** 同一航道内相邻格子的间距 */
export const SPACE_PITCH = 0.85;

/** 港口行的 Z 坐标（远端） */
export const PORT_ROW_Z = -13.2;

/** 修船场行的 Z 坐标（近端） */
export const SHIPYARD_ROW_Z = 2.2;

/** 左侧功能区（海盗 / 领航员 / 保险）的 X 坐标 */
export const SIDE_COLUMN_X = -5.8;

/** 黑市价格轨的起始 X 坐标（第 0 档的中心） */
export const PRICE_TRACK_X = 5.6;

/** 价格轨每一档的间距 */
export const PRICE_STEP_PITCH = 0.78;

/**
 * 画布贴图的像素尺寸。
 *
 * 放在这里（而不是 textures.ts）是因为**贴图尺寸与它在世界中的尺寸必须一致**：
 * board.ts 用这些数字把贴图映射回世界坐标。layout 只允许有一个来源。
 * textures.ts 反向 import 这几个常量。
 */
export const LANE_STRIP_PX = { cellW: 96, cellH: 110 } as const;
export const PRICE_TRACK_PX = { cellW: 130, cellH: 96, rowLabelW: 170, headerH: 70 } as const;

/** 世界单位 / 画布像素：由「一格航道 = SPACE_PITCH」反推 */
export const LANE_STRIP_SCALE = SPACE_PITCH / LANE_STRIP_PX.cellH;

/** 航道长条贴图在世界中的宽度 */
export const LANE_STRIP_WORLD_WIDTH = LANE_STRIP_PX.cellW * LANE_STRIP_SCALE;

/** 世界单位 / 画布像素：由「价格轨一档 = PRICE_STEP_PITCH」反推 */
export const PRICE_TRACK_SCALE = PRICE_STEP_PITCH / PRICE_TRACK_PX.cellW;

/** 价格轨每一行（每种货物）的间距，必须与贴图行高一致 */
export const PRICE_ROW_PITCH = PRICE_TRACK_PX.cellH * PRICE_TRACK_SCALE;

export interface FlatPoint {
  readonly x: number;
  readonly z: number;
}

/** 航道中心线的 X 坐标。lane 取 0..LANE_COUNT-1 */
export function laneX(lane: number): number {
  return (lane - (LANE_COUNT - 1) / 2) * LANE_GAP;
}

/** 航道内第 space 格的世界坐标。space 取 0..LANE_LAST_SPACE */
export function laneSpacePosition(lane: number, space: number): FlatPoint {
  return { x: laneX(lane), z: -space * SPACE_PITCH };
}

/** 港口空格 A/B/C 的世界坐标（按抵达顺序使用，与航道无关） */
export function portSlotPosition(index: number): FlatPoint {
  return { x: laneX(index), z: PORT_ROW_Z };
}

/** 修船场空格 A/B/C 的世界坐标（按进厂顺序使用） */
export function shipyardSlotPosition(index: number): FlatPoint {
  return { x: laneX(index), z: SHIPYARD_ROW_Z };
}

/** 黑市价格轨上第 goodIndex 种货物、第 step 档的世界坐标 */
export function priceCellPosition(goodIndex: number, step: number): FlatPoint {
  return { x: PRICE_TRACK_X + step * PRICE_STEP_PITCH, z: -goodIndex * PRICE_ROW_PITCH };
}

/** 左侧功能区各区块的中心坐标 */
export const SIDE_BLOCKS = {
  pirate: { x: SIDE_COLUMN_X, z: -2.4 },
  pilot: { x: SIDE_COLUMN_X, z: -6.4 },
  insurance: { x: SIDE_COLUMN_X, z: -9.8 },
} as const;

/** 棋盘的包围范围（用于画底板与摆相机） */
export const BOARD_BOUNDS = {
  minX: SIDE_COLUMN_X - 1.6,
  maxX: PRICE_TRACK_X + 6 * PRICE_STEP_PITCH + 0.7,
  minZ: PORT_ROW_Z - 1.3,
  maxZ: SHIPYARD_ROW_Z + 1.5,
} as const;

export const BOARD_CENTER: FlatPoint = {
  x: (BOARD_BOUNDS.minX + BOARD_BOUNDS.maxX) / 2,
  z: (BOARD_BOUNDS.minZ + BOARD_BOUNDS.maxZ) / 2,
};

/**
 * 相机注视点。
 *
 * 特意**不**取包围盒中心：包围盒中心偏向价格轨那一侧（x≈1.8），
 * 若把相机对准它，透视会把左侧航道画得比右侧航道低，看起来像长度不同。
 * 对准航道中心线 x=0，三条航道才会对称。
 */
export const CAMERA_TARGET: FlatPoint = {
  x: 0,
  z: (PORT_ROW_Z + SHIPYARD_ROW_Z) / 2,
};

/** 相机需要覆盖的半径（相对 CAMERA_TARGET），供 scene.ts 自动取景 */
export interface ProbePoint {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 自动取景必须覆盖的关键点。
 *
 * scene.ts 用它二分搜索相机距离，dev-hook.ts 用它做取景断言 ——
 * **两边必须用同一组点**，否则"拟合好了"和"测出来没截断"会各说各话。
 *
 * 每个角各取两个高度：0（棋盘面）与 1.5（悬浮标题的最高处）。
 */
export function framingProbePoints(): ProbePoint[] {
  const { minX, maxX, minZ, maxZ } = BOARD_BOUNDS;
  const points: ProbePoint[] = [];
  for (const y of [0, 1.5]) {
    points.push(
      { name: `棋盘角(${minX.toFixed(1)},${y},${minZ.toFixed(1)})`, x: minX, y, z: minZ },
      { name: `棋盘角(${maxX.toFixed(1)},${y},${minZ.toFixed(1)})`, x: maxX, y, z: minZ },
      { name: `棋盘角(${minX.toFixed(1)},${y},${maxZ.toFixed(1)})`, x: minX, y, z: maxZ },
      { name: `棋盘角(${maxX.toFixed(1)},${y},${maxZ.toFixed(1)})`, x: maxX, y, z: maxZ },
    );
  }
  return points;
}

export const BOARD_SIZE = {
  width: BOARD_BOUNDS.maxX - BOARD_BOUNDS.minX,
  depth: BOARD_BOUNDS.maxZ - BOARD_BOUNDS.minZ,
} as const;

/** 供渲染层遍历：所有航道的所有格子 */
export function allLaneSpaces(): Array<{ lane: number; space: number } & FlatPoint> {
  const out: Array<{ lane: number; space: number } & FlatPoint> = [];
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    for (let space = 0; space < LANE_SPACES; space += 1) {
      out.push({ lane, space, ...laneSpacePosition(lane, space) });
    }
  }
  return out;
}

/** 供渲染层遍历：港口与修船场空格 */
export function allSlots(): Array<{ kind: 'port' | 'shipyard'; label: string } & FlatPoint> {
  const out: Array<{ kind: 'port' | 'shipyard'; label: string } & FlatPoint> = [];
  PORT_SLOTS.forEach((label, i) => out.push({ kind: 'port', label, ...portSlotPosition(i) }));
  SHIPYARD_SLOTS.forEach((label, i) =>
    out.push({ kind: 'shipyard', label, ...shipyardSlotPosition(i) }),
  );
  return out;
}
