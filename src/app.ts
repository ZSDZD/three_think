/**
 * 应用装配：把 core（规则）、render（画面）、ui（界面）接起来。
 *
 * 分层的粘合点就在这里 —— 它是唯一同时认识三层的文件，
 * 而 core / render / ui 三者之间互不依赖（agent.md §3）。
 */
import { GOODS } from './config/board-layout';
import { applyIntent, createGame, startVoyage, type GameState, type Intent } from './core/game';
import { createAccomplices } from './render/accomplices';
import { createBoard } from './render/board';
import { installDevHook } from './render/dev-hook';
import { disposeLabelTextures } from './render/labels';
import { createScene } from './render/scene';
import { createGamePanel, type GamePanelHandle } from './ui/game-panel';
import { createHud } from './ui/hud';
import { createStartScreen } from './ui/start-screen';

export function bootApp(root: HTMLElement): void {
  root.replaceChildren();

  const stage = document.createElement('div');
  stage.className = 'stage';
  root.appendChild(stage);

  const scene = createScene(stage);
  const board = createBoard();
  scene.scene.add(board.group);

  const accomplices = createAccomplices();
  scene.scene.add(accomplices.group);

  // 船只移动补间
  scene.onFrame((delta) => board.update(delta));

  // 仅开发环境：暴露取景检测，供浏览器验证脚本断言棋盘未被截断
  if (import.meta.env.DEV) {
    installDevHook(scene.scene, scene.camera, scene.renderer);
  }

  const hud = createHud();
  root.appendChild(hud.element);
  scene.onStats((stats) => hud.update(stats));

  let state: GameState | null = null;
  let panel: GamePanelHandle | null = null;

  /** 把 core 的状态同步到画面 */
  function syncView(next: GameState, immediate = false): void {
    board.syncBoats(next.boats, immediate);

    next.players.forEach((player) => void player);
    accomplices.sync(next.placements, next.players, board, next.boats);

    // 价格标记：GOODS 的下标与价格轨的行一一对应
    GOODS.forEach((good, index) => {
      board.setPriceIndex(index, next.priceIndex[good.id] ?? 0);
    });
  }

  function handleIntent(intent: Intent): void {
    if (!state || !panel) return;
    const outcome = applyIntent(state, intent);
    if (!outcome.ok) {
      panel.render(state, outcome.error.message);
      return;
    }
    state = outcome.state;
    syncView(state, intent.type === 'master-launch' || intent.type === 'master-load');
    panel.render(state, null);
  }

  const startScreen = createStartScreen({
    onStart(playerCount, names) {
      startScreen.dispose();

      const seed = Math.floor(Math.random() * 1_000_000);
      hud.setSeed(seed);

      state = startVoyage(createGame({ playerCount, names, seed }));
      syncView(state, true);

      panel = createGamePanel({ onIntent: handleIntent });
      root.appendChild(panel.element);
      panel.render(state, null);
    },
  });

  root.appendChild(startScreen.element);

  // 页面卸载时释放贴图与材质，避免显存泄漏
  window.addEventListener(
    'beforeunload',
    () => {
      accomplices.dispose();
      board.dispose();
      disposeLabelTextures();
      scene.dispose();
    },
    { once: true },
  );
}
