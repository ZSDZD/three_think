/**
 * 程序化 3D 棋盘装配。
 *
 * 第一版不含任何外部美术资源：全部由基础几何体 + Canvas 贴图构成，
 * 因此没有资源许可问题（见 agent.md §8）。
 *
 * 性能（agent.md §6）：重复的小字烘成整条贴图，3 条航道共用同一张贴图与材质，
 * 让 draw call 保持在预算内。实际数值由 HUD 实时显示。
 */
import * as THREE from 'three';
import {
  GOODS,
  LANE_COUNT,
  LANE_LAST_SPACE,
  LANE_SPACES,
  PORT_SLOTS,
  PRICE_TRACK,
  SHIPYARD_SLOTS,
  getWareLoad,
} from '../config/board-layout';
import type { BoatState, SpotRef } from '../core/voyage';
import { createBoat } from './boat';
import {
  BOARD_CENTER,
  BOARD_SIZE,
  LANE_GAP,
  LANE_STRIP_WORLD_WIDTH,
  PORT_ROW_Z,
  PRICE_ROW_PITCH,
  PRICE_STEP_PITCH,
  PRICE_TRACK_PX,
  PRICE_TRACK_SCALE,
  PRICE_TRACK_X,
  SHIPYARD_ROW_Z,
  SIDE_BLOCKS,
  SPACE_PITCH,
  laneX,
  portSlotPosition,
  priceCellPosition,
  shipyardSlotPosition,
} from './coords';
import { createBillboardLabel, createFlatLabel } from './labels';
import { PALETTE, goldMaterial, standardMaterial } from './palette';
import { createLaneStripTexture, createPriceTrackTexture } from './textures';

/** 船的缩放：船体原长在 1.6 世界单位左右，缩到略大于一个航道格 */
export const BOAT_SCALE = 0.85;

/** 船停在水面上的高度 */
const BOAT_Y = 0.09;

export interface BoardView {
  readonly group: THREE.Group;
  /** 把第 index 艘船放到指定航道的指定格（瞬时） */
  placeBoat(index: number, lane: number, space: number): void;
  /** 按对局状态同步三艘船的位置（默认补间） */
  syncBoats(boats: readonly BoatState[], immediate?: boolean): void;
  /** 某格位在世界中的位置（供拾取代理与调试使用） */
  spotPosition(spot: SpotRef, boats: readonly BoatState[]): THREE.Vector3;
  /**
   * 某格位的挂载点：货仓格位挂在船体上（随船一起动），其余挂在棋盘根节点。
   * 返回的 position 是相对 parent 的局部坐标。
   */
  spotAnchor(spot: SpotRef, boats0: readonly BoatState[]): { parent: THREE.Object3D; position: THREE.Vector3 };
  /** 把第 goodIndex 种货物的价格标记移到价格轨第 step 档 */
  setPriceIndex(goodIndex: number, step: number): void;
  /** 每帧推进船只补间 */
  update(deltaSeconds: number): void;
  dispose(): void;
}

export function createBoard(): BoardView {
  const group = new THREE.Group();
  group.name = 'board';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const mat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // ---------------------------------------------------------------- 桌面与棋盘外框

  // 最外圈的桌面（深色），让棋盘有"放在桌上"的实体感
  const table = new THREE.Mesh(
    geo(new THREE.BoxGeometry(BOARD_SIZE.width + 9, 0.6, BOARD_SIZE.depth + 9)),
    mat(standardMaterial(PALETTE.waterDeep, { roughness: 0.92, metalness: 0.05 })),
  );
  table.position.set(BOARD_CENTER.x, -0.46, BOARD_CENTER.z);
  group.add(table);

  // 木质棋盘外框
  const frame = new THREE.Mesh(
    geo(new THREE.BoxGeometry(BOARD_SIZE.width + 1.6, 0.32, BOARD_SIZE.depth + 1.6)),
    mat(standardMaterial(PALETTE.frame, { roughness: 0.82, metalness: 0.12 })),
  );
  frame.position.set(BOARD_CENTER.x, -0.15, BOARD_CENTER.z);
  frame.receiveShadow = true;
  frame.castShadow = true;
  group.add(frame);

  // 棋盘面：海面
  const water = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(BOARD_SIZE.width, BOARD_SIZE.depth)),
    mat(new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.36, metalness: 0.32 })),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(BOARD_CENTER.x, 0, BOARD_CENTER.z);
  water.receiveShadow = true;
  group.add(water);

  // ---------------------------------------------------------------- 航道

  // 3 条航道共用同一张贴图与同一个材质 —— 只占 3 次 draw call
  const laneStripMaterial = mat(
    new THREE.MeshStandardMaterial({ map: createLaneStripTexture(LANE_SPACES), roughness: 0.86 }),
  );
  const laneBaseGeometry = geo(
    new THREE.BoxGeometry(LANE_STRIP_WORLD_WIDTH + 0.06, 0.06, LANE_SPACES * SPACE_PITCH + 0.06),
  );
  const laneStripGeometry = geo(
    new THREE.PlaneGeometry(LANE_STRIP_WORLD_WIDTH, LANE_SPACES * SPACE_PITCH),
  );
  const laneBaseMaterial = mat(standardMaterial(PALETTE.plateEdge, { roughness: 0.92 }));
  const laneCenterZ = -((LANE_SPACES - 1) * SPACE_PITCH) / 2;

  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const x = laneX(lane);

    const base = new THREE.Mesh(laneBaseGeometry, laneBaseMaterial);
    base.position.set(x, 0.04, laneCenterZ);
    base.receiveShadow = true;
    group.add(base);

    const strip = new THREE.Mesh(laneStripGeometry, laneStripMaterial);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.075, laneCenterZ);
    group.add(strip);

    const title = createBillboardLabel(`第 ${lane + 1} 航道`, {
      worldHeight: 0.42,
      bold: true,
      background: 'rgba(10,28,38,0.78)',
    });
    title.position.set(x, 0.42, 1.05);
    group.add(title);
  }

  // 起点区提示线：规则要求三船起点之和为 9，且各自在 0-5 之间
  const launchLine = new THREE.Mesh(
    geo(new THREE.BoxGeometry(LANE_GAP * LANE_COUNT, 0.03, 0.05)),
    mat(goldMaterial()),
  );
  launchLine.position.set(0, 0.085, -5.5 * SPACE_PITCH);
  group.add(launchLine);

  const launchLabel = createFlatLabel('起点区 0–5', {
    worldHeight: 0.38,
    color: '#d9a441',
    bold: true,
  });
  launchLabel.position.set(-LANE_GAP * 1.5 - 0.85, 0.09, -5.5 * SPACE_PITCH);
  group.add(launchLabel);

  // ---------------------------------------------------------------- 港口

  const platformMaterial = mat(standardMaterial(PALETTE.plateEdge, { roughness: 0.93 }));
  const slotGeometry = geo(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 28));
  const portSlotMaterial = mat(standardMaterial(PALETTE.port, { roughness: 0.72 }));

  const dock = new THREE.Mesh(
    geo(new THREE.BoxGeometry(LANE_GAP * LANE_COUNT + 1.6, 0.34, 1.15)),
    platformMaterial,
  );
  dock.position.set(0, 0.17, PORT_ROW_Z);
  dock.receiveShadow = true;
  dock.castShadow = true;
  group.add(dock);

  PORT_SLOTS.forEach((label, i) => {
    const p = portSlotPosition(i);
    const disc = new THREE.Mesh(slotGeometry, portSlotMaterial);
    disc.position.set(p.x, 0.36, p.z);
    group.add(disc);

    const text = createFlatLabel(label, { worldHeight: 0.46, color: '#241d13', bold: true });
    text.position.set(p.x, 0.392, p.z);
    group.add(text);
  });

  const portTitle = createBillboardLabel('马尼拉港', {
    worldHeight: 0.62,
    bold: true,
    background: 'rgba(10,28,38,0.82)',
  });
  portTitle.position.set(0, 1.25, PORT_ROW_Z - 0.2);
  group.add(portTitle);

  // ---------------------------------------------------------------- 修船场

  const shipyard = new THREE.Mesh(
    geo(new THREE.BoxGeometry(LANE_GAP * LANE_COUNT + 1.6, 0.26, 1.0)),
    platformMaterial,
  );
  shipyard.position.set(0, 0.13, SHIPYARD_ROW_Z);
  shipyard.receiveShadow = true;
  group.add(shipyard);

  const shipyardSlotMaterial = mat(standardMaterial(PALETTE.shipyard, { roughness: 0.78 }));

  SHIPYARD_SLOTS.forEach((label, i) => {
    const p = shipyardSlotPosition(i);
    const disc = new THREE.Mesh(slotGeometry, shipyardSlotMaterial);
    disc.position.set(p.x, 0.28, p.z);
    group.add(disc);

    const text = createFlatLabel(label, { worldHeight: 0.46, color: '#241d13', bold: true });
    text.position.set(p.x, 0.312, p.z);
    group.add(text);
  });

  const shipyardTitle = createBillboardLabel('修船场', {
    worldHeight: 0.5,
    bold: true,
    background: 'rgba(10,28,38,0.82)',
  });
  shipyardTitle.position.set(0, 0.95, SHIPYARD_ROW_Z + 0.95);
  group.add(shipyardTitle);

  // ---------------------------------------------------------------- 黑市价格轨

  const priceWidth =
    (PRICE_TRACK_PX.rowLabelW + PRICE_TRACK_PX.cellW * PRICE_TRACK.length) * PRICE_TRACK_SCALE;
  const priceDepth =
    (PRICE_TRACK_PX.headerH + PRICE_TRACK_PX.cellH * GOODS.length) * PRICE_TRACK_SCALE;
  // 让第 0 档的中心正好落在 PRICE_TRACK_X、第 0 行的中心正好落在 z = 0
  const priceLeft = PRICE_TRACK_X - PRICE_STEP_PITCH / 2 - PRICE_TRACK_PX.rowLabelW * PRICE_TRACK_SCALE;
  const priceTopZ = PRICE_TRACK_PX.headerH * PRICE_TRACK_SCALE + PRICE_ROW_PITCH / 2;

  const pricePlane = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(priceWidth, priceDepth)),
    mat(
      new THREE.MeshBasicMaterial({
        map: createPriceTrackTexture(GOODS, PRICE_TRACK),
        toneMapped: false,
      }),
    ),
  );
  pricePlane.rotation.x = -Math.PI / 2;
  pricePlane.position.set(priceLeft + priceWidth / 2, 0.03, priceTopZ - priceDepth / 2);
  group.add(pricePlane);

  const priceMarkerGeometry = geo(new THREE.BoxGeometry(0.26, 0.1, 0.26));
  const priceMarkerMaterial = mat(goldMaterial());
  const priceMarkers: THREE.Mesh[] = GOODS.map(() => {
    const marker = new THREE.Mesh(priceMarkerGeometry, priceMarkerMaterial);
    marker.position.y = 0.09;
    group.add(marker);
    return marker;
  });

  // ---------------------------------------------------------------- 左侧功能区

  const pirateHullMaterial = mat(standardMaterial(PALETTE.hull, { roughness: 0.9 }));
  const islandMaterial = mat(standardMaterial(PALETTE.island, { roughness: 0.95 }));
  const buildingMaterial = mat(standardMaterial(PALETTE.building, { roughness: 0.88 }));

  // 海盗船
  const pirateHull = new THREE.Mesh(
    geo(new THREE.BoxGeometry(1.9, 0.34, 0.85)),
    pirateHullMaterial,
  );
  pirateHull.position.set(SIDE_BLOCKS.pirate.x, 0.17, SIDE_BLOCKS.pirate.z);
  pirateHull.castShadow = true;
  group.add(pirateHull);

  const pirateText = createBillboardLabel('海盗船', {
    worldHeight: 0.42,
    bold: true,
    background: 'rgba(60,16,16,0.85)',
  });
  pirateText.position.set(SIDE_BLOCKS.pirate.x, 0.95, SIDE_BLOCKS.pirate.z);
  group.add(pirateText);

  // 领航员岛
  const pilotIsland = new THREE.Mesh(
    geo(new THREE.CylinderGeometry(1.0, 1.1, 0.2, 32)),
    islandMaterial,
  );
  pilotIsland.position.set(SIDE_BLOCKS.pilot.x, 0.1, SIDE_BLOCKS.pilot.z);
  pilotIsland.receiveShadow = true;
  group.add(pilotIsland);

  const pilotText = createBillboardLabel('领航员岛', {
    worldHeight: 0.42,
    bold: true,
    background: 'rgba(10,28,38,0.85)',
  });
  pilotText.position.set(SIDE_BLOCKS.pilot.x, 0.95, SIDE_BLOCKS.pilot.z);
  group.add(pilotText);

  // 保险处
  const insurance = new THREE.Mesh(
    geo(new THREE.BoxGeometry(1.7, 0.7, 0.95)),
    buildingMaterial,
  );
  insurance.position.set(SIDE_BLOCKS.insurance.x, 0.35, SIDE_BLOCKS.insurance.z);
  insurance.castShadow = true;
  group.add(insurance);

  const insuranceText = createBillboardLabel('保险处', {
    worldHeight: 0.42,
    bold: true,
    background: 'rgba(10,28,38,0.85)',
  });
  insuranceText.position.set(SIDE_BLOCKS.insurance.x, 1.2, SIDE_BLOCKS.insurance.z);
  group.add(insuranceText);

  // 三个功能区的小弟位
  const sideSlotPositions: Array<{ x: number; z: number; label: string }> = [
    { x: SIDE_BLOCKS.pirate.x - 0.45, z: SIDE_BLOCKS.pirate.z, label: '1' },
    { x: SIDE_BLOCKS.pirate.x + 0.45, z: SIDE_BLOCKS.pirate.z, label: '2' },
    { x: SIDE_BLOCKS.pilot.x - 0.42, z: SIDE_BLOCKS.pilot.z, label: '2元' },
    { x: SIDE_BLOCKS.pilot.x + 0.42, z: SIDE_BLOCKS.pilot.z, label: '5元' },
    { x: SIDE_BLOCKS.insurance.x, z: SIDE_BLOCKS.insurance.z, label: '保险' },
  ];
  const sideSlotGeometry = geo(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 24));
  const sideSlotMaterial = mat(standardMaterial(PALETTE.parchment, { roughness: 0.8 }));

  for (const slot of sideSlotPositions) {
    const isOnIsland = slot.z === SIDE_BLOCKS.pilot.z;
    const y = isOnIsland ? 0.23 : slot.z === SIDE_BLOCKS.pirate.z ? 0.36 : 0.72;
    const disc = new THREE.Mesh(sideSlotGeometry, sideSlotMaterial);
    disc.position.set(slot.x, y, slot.z);
    group.add(disc);

    const text = createFlatLabel(slot.label, {
      worldHeight: 0.34,
      color: '#241d13',
      bold: true,
    });
    text.position.set(slot.x, y + 0.032, slot.z);
    group.add(text);
  }

  // ---------------------------------------------------------------- 平底船

  const boats = Array.from({ length: LANE_COUNT }, () => createBoat());
  for (const boat of boats) {
    boat.group.scale.setScalar(BOAT_SCALE);
    group.add(boat.group);
  }

  /** 船的移动补间目标；null 表示已到位 */
  const boatTargets: (THREE.Vector3 | null)[] = boats.map(() => null);

  /** 某艘船在某状态下应有的世界位置 */
  function boatPositionOf(index: number, boats0: readonly BoatState[]): THREE.Vector3 {
    const state = boats0[index];
    // 已进港 / 已进船厂的船停到对应的空格上
    if (state?.arrivedSlot !== null && state?.arrivedSlot !== undefined) {
      const p = portSlotPosition(state.arrivedSlot);
      return new THREE.Vector3(p.x, BOAT_Y, p.z);
    }
    if (state?.shipyardSlot !== null && state?.shipyardSlot !== undefined) {
      const p = shipyardSlotPosition(state.shipyardSlot);
      return new THREE.Vector3(p.x, BOAT_Y, p.z);
    }
    const lane = state?.lane ?? index;
    const space = Math.min(state?.position ?? 0, LANE_LAST_SPACE);
    return new THREE.Vector3(laneX(lane), BOAT_Y, -space * SPACE_PITCH);
  }

  /** 货仓格位在船体局部坐标系里的偏移（船身纵向排开，避免小弟重叠） */
  function holdLocalOffset(spot: Extract<SpotRef, { kind: 'hold' }>, boats0: readonly BoatState[]): THREE.Vector3 {
    const good = boats0[spot.boat]?.good ?? null;
    const count = good ? getWareLoad(good).spaces.length : 3;
    const dz = ((spot.space - (count - 1) / 2) * 0.24) / BOAT_SCALE;
    return new THREE.Vector3(0, 0.34 / BOAT_SCALE, dz);
  }

  /** 非货仓格位在世界中的位置 */
  function staticSpotPosition(spot: SpotRef): THREE.Vector3 {
    switch (spot.kind) {
      case 'port': {
        const p = portSlotPosition(spot.slot);
        return new THREE.Vector3(p.x, 0.46, p.z);
      }
      case 'shipyard': {
        const p = shipyardSlotPosition(spot.slot);
        return new THREE.Vector3(p.x, 0.38, p.z);
      }
      case 'pirate':
        return new THREE.Vector3(
          SIDE_BLOCKS.pirate.x + (spot.space === 0 ? -0.45 : 0.45),
          0.42,
          SIDE_BLOCKS.pirate.z,
        );
      case 'pilot':
        return new THREE.Vector3(
          SIDE_BLOCKS.pilot.x + (spot.size === 'small' ? -0.42 : 0.42),
          0.3,
          SIDE_BLOCKS.pilot.z,
        );
      case 'insurance':
        return new THREE.Vector3(SIDE_BLOCKS.insurance.x, 0.8, SIDE_BLOCKS.insurance.z);
      case 'hold':
        return new THREE.Vector3();
    }
  }

  const view: BoardView = {
    group,

    placeBoat(index, lane, space) {
      const boat = boats[index];
      if (!boat) return;
      boat.group.position.set(laneX(lane), BOAT_Y, -space * SPACE_PITCH);
      boatTargets[index] = null;
    },

    syncBoats(next, immediate = false) {
      next.forEach((_, index) => {
        const target = boatPositionOf(index, next);
        if (immediate) {
          boats[index]?.group.position.copy(target);
          boatTargets[index] = null;
        } else {
          boatTargets[index] = target;
        }
      });
    },

    spotPosition(spot, boats0) {
      if (spot.kind === 'hold') {
        const group0 = boats[spot.boat]?.group;
        const base = group0 ? group0.position.clone() : new THREE.Vector3();
        base.add(holdLocalOffset(spot, boats0).multiplyScalar(BOAT_SCALE));
        return base;
      }
      return staticSpotPosition(spot);
    },

    spotAnchor(spot, boats0) {
      if (spot.kind === 'hold') {
        const boatGroup = boats[spot.boat]?.group;
        if (boatGroup) {
          return { parent: boatGroup, position: holdLocalOffset(spot, boats0) };
        }
      }
      return { parent: group, position: staticSpotPosition(spot) };
    },

    /** 每帧推进船只补间 */
    update(deltaSeconds) {
      const k = Math.min(1, deltaSeconds * 6);
      boats.forEach((boat, index) => {
        const target = boatTargets[index];
        if (!target) return;
        boat.group.position.lerp(target, k);
        if (boat.group.position.distanceToSquared(target) < 1e-4) {
          boat.group.position.copy(target);
          boatTargets[index] = null;
        }
      });
    },

    setPriceIndex(goodIndex, step) {
      const marker = priceMarkers[goodIndex];
      if (!marker) return;
      const p = priceCellPosition(goodIndex, step);
      marker.position.set(p.x, 0.09, p.z);
    },

    dispose() {
      for (const boat of boats) boat.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      // 贴图由 labels.ts / textures.ts 持有，各自负责释放
      group.clear();
    },
  };

  // 初值：三艘船按规则放在 0-5 内、和为 9 的起点上
  view.placeBoat(0, 0, 2);
  view.placeBoat(1, 1, 3);
  view.placeBoat(2, 2, 4);
  GOODS.forEach((_, i) => view.setPriceIndex(i, 0));

  return view;
}
