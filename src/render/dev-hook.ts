/**
 * 仅开发环境启用的调试钩子。
 *
 * 动机：棋盘是否被视口截断，靠肉眼看截图判断不可靠。
 * 这里把棋盘包围盒的各个角投影到归一化设备坐标（NDC），
 * 让浏览器验证脚本可以**断言**所有关键点都落在 [-1, 1] 之内。
 *
 * 生产构建不会安装（调用处有 import.meta.env.DEV 守卫）。
 */
import * as THREE from 'three';
import { framingProbePoints } from './coords';

export interface FramingReport {
  /** 所有关键点是否都在视口内 */
  readonly inside: boolean;
  readonly ndc: { minX: number; maxX: number; minY: number; maxY: number };
  /** 越界的点 */
  readonly outliers: readonly { name: string; x: number; y: number }[];
}

export function installDevHook(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): void {
  // 与 scene.ts 的自动取景使用同一组关键点，保证「拟合」与「断言」口径一致
  const probes = framingProbePoints().map((p) => ({
    name: p.name,
    v: new THREE.Vector3(p.x, p.y, p.z),
  }));

  const report = (): FramingReport => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const outliers: { name: string; x: number; y: number }[] = [];

    for (const { name, v } of probes) {
      const ndc = v.clone().project(camera);
      minX = Math.min(minX, ndc.x);
      maxX = Math.max(maxX, ndc.x);
      minY = Math.min(minY, ndc.y);
      maxY = Math.max(maxY, ndc.y);
      if (ndc.x < -1 || ndc.x > 1 || ndc.y < -1 || ndc.y > 1) {
        outliers.push({ name, x: Number(ndc.x.toFixed(3)), y: Number(ndc.y.toFixed(3)) });
      }
    }

    return { inside: outliers.length === 0, ndc: { minX, maxX, minY, maxY }, outliers };
  };

  (window as unknown as Record<string, unknown>)['__TT__'] = {
    framing: report,
    camera: () => ({
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      aspect: camera.aspect,
    }),
    renderInfo: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    }),
    /** 场景对象统计，用于验证小弟棋子等确实被挂上去了 */
    sceneInfo: () => {
      let objects = 0;
      let meshes = 0;
      let accompliceMeshes = 0;
      scene.traverse((obj) => {
        objects += 1;
        if ((obj as THREE.Mesh).isMesh) meshes += 1;
        if (obj.userData['accomplice'] === true) accompliceMeshes += 1;
      });
      return { objects, meshes, accompliceMeshes };
    },
  };
}
