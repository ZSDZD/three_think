/**
 * 小弟棋子（彩色圆片）。
 *
 * 货仓格位上的棋子会**挂在船体上**，因此船移动时棋子自动跟随，
 * 不需要每帧重新计算世界坐标（agent.md §6：避免每帧分配对象）。
 */
import * as THREE from 'three';
import type { Player, PlayerId } from '../core/types';
import type { BoatState, Placement, SpotRef } from '../core/voyage';
import { BOAT_SCALE, type BoardView } from './board';

export interface AccomplicesView {
  readonly group: THREE.Group;
  /** 按当前部署重建棋子；数量很少，重建比增量更新更不易出错 */
  sync(
    placements: readonly Placement[],
    players: readonly Player[],
    board: BoardView,
    boats: readonly BoatState[],
  ): void;
  dispose(): void;
}

/** 棋子圆片半径 */
const RADIUS = 0.17;
/** 圆片厚度 */
const THICKNESS = 0.07;

export function createAccomplices(): AccomplicesView {
  const group = new THREE.Group();
  group.name = 'accomplices';

  const geometry = new THREE.CylinderGeometry(RADIUS, RADIUS, THICKNESS, 20);
  const materialCache = new Map<PlayerId, THREE.MeshStandardMaterial>();
  const spawned: THREE.Mesh[] = [];

  function materialFor(player: Player | undefined): THREE.MeshStandardMaterial {
    const key = player?.id ?? 'unknown';
    const cached = materialCache.get(key);
    if (cached) return cached;

    const color = new THREE.Color(player?.color ?? '#cccccc');
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.24,
      emissive: color.clone().multiplyScalar(0.16),
    });
    materialCache.set(key, material);
    return material;
  }

  function clearSpawned(): void {
    for (const mesh of spawned) {
      mesh.removeFromParent();
    }
    spawned.length = 0;
  }

  return {
    group,

    sync(placements, players, board, boats) {
      clearSpawned();

      for (const placement of placements) {
        const player = players.find((p) => p.id === placement.playerId);
        const mesh = new THREE.Mesh(geometry, materialFor(player));
        // 标记出来，便于调试与验证脚本统计棋子数量
        mesh.userData['accomplice'] = true;
        mesh.userData['playerId'] = placement.playerId;
        const spot: SpotRef = placement.spot;
        const anchor = board.spotAnchor(spot, boats);
        mesh.position.copy(anchor.position);
        // 挂在船体上时父级带缩放，放大回来以保持视觉尺寸一致
        if (spot.kind === 'hold') mesh.scale.setScalar(1 / BOAT_SCALE);
        anchor.parent.add(mesh);
        spawned.push(mesh);
      }
    },

    dispose() {
      clearSpawned();
      geometry.dispose();
      for (const material of materialCache.values()) material.dispose();
      materialCache.clear();
      group.clear();
    },
  };
}
