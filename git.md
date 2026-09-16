# git.md —— three_think 提交与发布纲领

> 本文件是向 GitHub 提交时的**唯一规则来源**，与 [`agent.md`](./agent.md) 配套。
> 内容约束以 `agent.md` 为准，提交动作以本文件为准；两者冲突时以**更严格的一条**为准。
> 本仓库是**公开仓库**，所有内容默认全世界可见。

---

## 0. 现状

| 项 | 值 |
| --- | --- |
| 本地仓库 | 已初始化，默认分支 `main` |
| GitHub 远端 | **未配置**（首次推送前需 `git remote add origin <URL>`） |
| 可见性 | 公开（public） |
| 当前提交规范 | 约定式提交（Conventional Commits）+ 中文主题 |

---

## 1. 提交信息格式

```
<type>(<scope>): <主题>

<为什么改 / 影响范围 / 验证方式>
```

- **type**：`feat` 新功能、`fix` 修复、`docs` 文档、`chore` 杂务、`refactor` 重构、`test` 测试、`perf` 性能、`assets` 美术资源。
- **scope**（可省）：与本仓库分层对齐，用 `core` / `render` / `input` / `ui` / `config` / `assets` / `docs` / `deps` / `repo`。
- **主题**：祈使句，写"动机/效果"而不是"做了什么动作"；**不超过 50 字符**；结尾不加句号。
- **body**（需要时）：空一行再写，说明**为什么改**、影响范围、验证方式。

示例：

```
feat(core): 抽象棋类规则接口，支持挂载多种玩法

把棋盘表示、走子生成、胜负判定抽成同一个接口，
后续新增棋类只需实现接口并注册，不再改动渲染层。
验证：core 单测 24 项通过，含 3 条非法走法拒绝用例。
```

```
perf(render): 棋子改用 InstancedMesh，draw call 从 210 降到 38
```

```
assets: 登记棋盘与棋子模型来源与许可见 agent.md §8.2
```

**不合格的提交信息**（会被要求重写）：

- `update` / `fix bug` / `修改` —— 无信息量
- `feat: 加了很多东西` —— 一次提交做了多件事
- 主题超过 50 字符、或把实现细节全塞进主题

---

## 2. 分支模型

- `main`：**稳定可发布态**。只接收已验证、已审查的合入。
- 短生命周期分支，一个分支一件事：

| 前缀 | 用途 | 示例 |
| --- | --- | --- |
| `feat/` | 新功能 | `feat/board-raycast-picking` |
| `fix/` | 缺陷修复 | `fix/turn-state-stuck` |
| `rules/` | 单一棋类玩法 | `rules/gomoku` |
| `assets/` | 美术资源引入 | `assets/kenney-board-kit` |
| `docs/` | 文档 | `docs/open-decisions` |

- 分支从最新 `main` 拉出；合并前先 `git rebase main`（个人分支）或 `git merge main`（共享分支），保持历史干净。
- **禁止 force push 到 `main`。** 个人分支如需 force push，用 `--force-with-lease`。

---

## 3. 提交前自检清单（逐条执行，不许跳）

### 3.1 内容检查

- [ ] `git status` —— 确认没有意外文件被暂存；`.env`、`*.key`、`secrets/` 一个都不在
- [ ] `git diff --cached` —— **通读一遍**，确认没有混入无关改动（格式化、调试代码、临时文件）
- [ ] 密钥扫描无意外命中：
  ```bash
  git diff --cached | grep -iE "sk-|gho_|ghp_|AKIA|token|secret|password|api[_-]?key"
  ```
- [ ] 大文件与产物未入库（`node_modules/`、`dist/`、`*.log`、`*.blend`、`*.psd`）：
  ```bash
  git diff --cached --name-only | grep -iE "node_modules|dist/|\.log$|\.blend|\.psd|\.spp"
  ```
- [ ] 新增美术资源**已在 `agent.md` §8.2 登记**来源与许可，且在同一次提交里
- [ ] 没有本机绝对路径、内网 IP、机器名进入代码或配置

### 3.2 质量检查

- [ ] 类型检查通过（`npm run typecheck`，脚本存在后生效）
- [ ] 测试通过（`npm run test`，脚本存在后生效）
- [ ] 构建通过（`npm run build`，脚本存在后生效）
- [ ] 规则层改动：含"非法输入被拒"的测试用例
- [ ] 渲染/交互改动：真实浏览器里点过一遍，控制台无报错
- [ ] 性能相关改动：记录了改动前后的 `renderer.info.render.calls / triangles`
- [ ] 调试用的 `console.log` 已删除

### 3.3 粒度检查

- [ ] **这次提交只做一件事**。功能与格式化必须分成两次提交。
- [ ] 这次提交对应一个**可回滚的逻辑单元**（回滚它不会留下半个功能）。
- [ ] `agent.md` §3 的分层没有被破坏：`core/` 里搜不到 `three` 的 import。

---

## 4. 提交粒度与小步推进

- 一次提交 = 一个可回滚的逻辑单元。
- 先提交能让项目处于**可用状态**的最小改动，再叠加。
- 重构与行为变更**分开提交**，否则回滚时无法只回滚其一。
- 提交信息与实际改动不符时，改信息而不是改改动。

常用命令：

```bash
git switch -c feat/board-raycast-picking
git add -p                      # 逐块暂存，避免混入无关改动
git commit
git push -u origin feat/board-raycast-picking
```

---

## 5. 推送与合入流程

1. 分支上完成开发，按 §3 自检。
2. `git push -u origin <branch>`
3. 在 GitHub 开 Pull Request，标题用与 commit 相同的约定式格式，正文包含：
   - **做了什么**（1–3 条）
   - **为什么**（动机，对应哪个开放项 / issue）
   - **怎么验证的**（命令 + 结果，浏览器验证写清操作路径）
   - **截图或录屏**（渲染、UI、布局类改动**必须**附）
   - **风险与回滚方式**
4. 自查 PR diff：评论区自己先通读一遍，把"其实不该提交"的东西撤掉。
5. **合入需要仓库主人明确确认。agent 不得自行 merge 到 `main`。**
6. 合入方式：个人小分支用 squash，保留完整历史的特性分支用 `--no-ff` merge。具体由仓库主人决定。

**未得到确认前，绝不 merge、绝不 push 到 `main`。**

---

## 6. 公开仓库红线

本仓库公开可见，以下内容一旦推送即视为**已泄露**，删除文件不能挽回：

1. **密钥、令牌、密码、Cookie**：`sk-...`、`ghp_...`、`AKIA...`、`.env`、`*.pem`、`*.key`。
2. **许可不明的美术资源**：不能证明授权的模型、贴图、音频、字体一律不入库。
3. **个人与本机信息**：绝对路径、内网 IP、机器名、真实姓名 / 手机号 / 邮箱（`git config` 里的邮箱会写进每个 commit，介意就改用 noreply 邮箱）。
4. **未公开的玩法设计机密**（如需保密，改用私有仓库）。
5. **大体积二进制**：单个文件 > 50 MB 会被 GitHub 拒收；资源超 100 MB 总量考虑 Git LFS。

**发现密钥已经被提交**：不要只删文件。立刻告知仓库主人去服务商后台**作废并重签**，然后重写历史。

---

## 7. 出错后的补救

| 情况 | 处理 |
| --- | --- |
| 提交信息写错，**未推送** | `git commit --amend` 改，然后正常推送 |
| 提交信息写错，**已推送且是个人分支** | `git commit --amend` + `git push --force-with-lease` |
| 提交信息写错，**已在 `main`** | 不改历史，告知仓库主人，后续提交里说明 |
| 多提交了文件，**未推送** | `git restore --staged <file>`，必要时 `git reset --soft HEAD~1` 重做 |
| 多提交了文件，**已推送** | 用 `git revert <sha>` 生成反向提交，**不重写公共历史** |
| 误提交密钥 | ① 立刻作废重签 ② 用 `git filter-repo` 或 BFG 清历史 ③ 强推并通知所有协作者重新克隆 |
| 误提交二进制大文件 | 清历史 + 加入 `.gitignore`；后续大资源改用 Git LFS |
| 分支冲突 | **不要自作主张解决**，报告仓库主人 |

---

## 8. 命令速查

```bash
# 状态与查看
git status
git diff                      # 未暂存改动
git diff --cached             # 已暂存改动（提交前必读）
git log --oneline -10

# 提交
git add -p                    # 逐块暂存
git add <path>
git commit -m "type(scope): 主题"

# 分支
git switch -c feat/xxx
git switch main && git pull
git rebase main               # 个人分支同步

# 推送
git push -u origin feat/xxx
git push --force-with-lease   # 仅个人分支，禁止对 main

# 补救
git restore --staged <file>
git commit --amend
git revert <sha>
```

---

## 附：与 `agent.md` 的关系

- `agent.md` 管**写什么、怎么写**；`git.md` 管**怎么提交、怎么发布**。
- 提交时若发现 `agent.md` 的某条约束与实际需要冲突：**先改 `agent.md`（并在提交信息里说明），再提交代码**，不要默默违反。
