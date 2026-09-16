/**
 * 应用装配：把 core（规则）、render（画面）、ui（界面）接起来。
 *
 * 分层的粘合点就在这里 —— 它是唯一同时认识三层的文件，
 * 而 core / render / ui 三者之间互不依赖（agent.md §3）。
 */
import { applyIntent, createGame, startVoyage, type GameState, type Intent } from './core/game';
import { createBoard } from './render/board';
import { installDevHook } from './render/dev-hook';
import { disposeLabelTextures } from './render/labels';
import { createScene } from './render/scene';
import { createBiddingPanel, type BiddingPanelHandle } from './ui/bidding-panel';
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

  // 仅开发环境：暴露取景检测，供浏览器验证脚本断言棋盘未被截断
  if (import.meta.env.DEV) {
    installDevHook(scene.camera, scene.renderer);
  }

  const hud = createHud();
  root.appendChild(hud.element);
  scene.onStats((stats) => hud.update(stats));

  let state: GameState | null = null;
  let panel: BiddingPanelHandle | null = null;

  function handleIntent(intent: Intent): void {
    if (!state || !panel) return;
    const outcome = applyIntent(state, intent);
    if (!outcome.ok) {
      // 规则层拒绝：把原因显示出来，状态保持不变
      panel.render(state, outcome.error.message);
      return;
    }
    state = outcome.state;
    panel.render(state, null);
  }

  const startScreen = createStartScreen({
    onStart(playerCount, names) {
      startScreen.dispose();

      // 种子写进对局记录，便于复现（agent.md §5）
      const seed = Math.floor(Math.random() * 1_000_000);
      hud.setSeed(seed);

      state = startVoyage(createGame({ playerCount, names, seed }));
      panel = createBiddingPanel({ onIntent: handleIntent });
      root.appendChild(panel.element);
      panel.render(state, null);
    },
  });

  root.appendChild(startScreen.element);

  // 页面卸载时释放贴图，避免显存泄漏
  window.addEventListener(
    'beforeunload',
    () => {
      board.dispose();
      disposeLabelTextures();
      scene.dispose();
    },
    { once: true },
  );
}
