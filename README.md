# DSH-Card-Keys

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 DSH 插件，为 DSH 的选项卡片（提问）和权限卡片（审批）提供数字键、方向键的快捷操作，**默认开启**。只做两件事：

1. **提问 / 审批卡片的键盘操作** — 数字键 `1`–`9` 直接选择选项，`←` `→` `↑` `↓` 在选项与按钮间移动，`Enter` 确认，`Esc` 关闭提问卡片。审批卡片 `1` = 允许一次，`2` = 拒绝；卡片弹出时键盘焦点已落在「允许一次」上，所以**直接按一次 `Enter` 就同意**。提问卡片弹出时**默认选中选项 1**，因此可以直接改选或直接提交。插件永远不会在没有按键的情况下自动授权、也不会自动提交。
2. **一个总开关** — 在 **插件管理 → 本插件** 的设置页里打开或关闭上面这个功能。

数字键同步显示在 **DSH 设置 → 通用 → 键盘快捷键** 的审批分组中；在输入框里打字时按键保持原样。

> Provide number-key and arrow-key shortcuts for DSH's option cards and permission cards. Once enabled, number keys 1–9 directly select options, ← → ↑ ↓ move between options and buttons, Enter confirms, and Esc closes the question card. The number keys are also displayed in the Approval group under DSH Settings → General → Keyboard Shortcuts. When typing in the input field, key presses behave as usual.

本项目源自 [`@hytime/dsh-client-ui-shortcuts`](https://www.npmjs.com/package/@hytime/dsh-client-ui-shortcuts)，现名 **DSH-Card-Keys**：客户端部分已完全重写为**不接管官方卡片**的增量键盘层（见下文「实现方式」）。

## 实现方式（不替换官方卡片）

插件**不接管、不重绘**官方卡片，只给已经在屏幕上的官方卡片加键盘：

- 数字键走 **DSH 官方固定快捷键通道**（`shortcuts.registerFixed` + `observeFixedInput`）。开关打开时，`DSH 设置 → 通用 → 键盘快捷键` 的**审批分组**会出现一行「卡片：数字键选择选项（1-9）」；开关关闭后这一行自动消失。
- 按键仲裁完全交给 DSH：焦点在输入框/终端里打字时、有弹窗时、输入法组合中、带修饰键时，数字键保持原样，插件不会抢键。
- 命中后插件只对官方卡片的 DOM 做普通 `click()` / `focus()`：`[data-question-key]` 里的 `button[role="radio"|"checkbox"]`、`[data-approval-key]` 里的「拒绝 / 允许一次」按钮、`footer` 里的主按钮、`header` 里的关闭按钮。因此官方的进度记忆、倒计时、计划审批、只读回顾卡片等行为全部保留。
- **审批卡片一出现，焦点直接落在「允许一次」上**（每张卡只落一次）。这样一次 `Enter` 就是官方按钮的原生激活，不需要先按方向键。焦点环来自 DSH 自己的 `focus.css`：键盘操作时显示，鼠标操作时透明——视觉与“回车会同意”完全一致。插件只是移动焦点，从不替你点击同意。
- **提问卡片一出现，默认选中选项 1**（每张卡只选一次）。走的是官方选项按钮自己的 `click`，所以草稿、`aria-checked`、主按钮的可用状态都由官方状态机产生；你可以用数字键或方向键随时改选，插件不会替你提交。已带答案的题目（有勾选项、已有补充文本、或官方 `(推荐)` 预选）不会被覆盖；单选多题的卡片只默认第一题，避免官方「选完自动跳下一题」的逻辑被插件带着连跳。

方向键 / Enter / Esc 同样通过上述通道分发，但只在有卡片显示、且焦点不在输入控件上时生效。

## 使用

```bash
pnpm install     # 安装依赖
pnpm run bundle  # 构建出 lib/（安装到 DSH 前必须先构建）
```

### 安装到 DeepSeek Harness 桌面版（一键脚本）

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-to-dsh.ps1
```

脚本会自动完成：构建 → `npm pack` 打包 → 安装到 `%USERPROFILE%\.dsh\profiles\desktop` → 在该 profile 的 `cordis.patch.yml` 里注册组合条目。改完代码后重复执行即可更新插件；不想重复构建时可加 `-SkipBuild`。

已安装的插件被替换后，DSH 的 HMR 会轮询 `lib/client.js` 并把新版本推给已打开的页面，通常不需要重启；若页面没有变化，刷新页面或重启 DeepSeek Harness。

### 手动安装（等价流程）

1. `npm pack` 生成 `hzy-dsh-card-keys-<version>.tgz`；
2. 在 `%USERPROFILE%\.dsh\profiles\desktop` 下执行 `npm install <tgz 路径>`；
3. 在该目录的 `cordis.patch.yml` 末尾追加：

```yaml
- id: dsh-card-keys
  name: "@hzy/dsh-card-keys"
```

4. 重启 DeepSeek Harness。

### CLI 版（`dsh plugin`）

如果是 CLI 版 DSH 组合，仍按原方式安装本目录构建产物（`cordis.patch.yml` 已就绪）：

```yaml
- insert:
    - id: dsh-card-keys
      name: '@hzy/dsh-card-keys'
```

## 键位

| 按键 | 提问卡片 | 审批卡片 | 生效条件 |
| --- | --- | --- | --- |
| `1`–`9` | 选择对应选项（多选题为切换勾选；单选会自动进入下一题，与 DSH 官方一致） | `1` 允许一次，`2` 拒绝 | 有卡片显示，焦点不在输入框/终端/弹窗中 |
| `←` `→` / `↑` `↓` | 在选项、补充输入、上一题/下一题/跳过/提交之间移动焦点；**落到选项上时同时选中它**（灰底跟随焦点环）。**多题卡片上不翻页** | 在「允许一次 / 拒绝」间移动焦点（弹出时已在「允许一次」） | 有卡片显示，焦点不在输入框 |
| `Enter` | 焦点在按钮上时由按钮处理；否则点击卡片的主按钮（提交 / 下一题） | 焦点已在「允许一次」时由浏览器原生激活该按钮 = 同意一次；插件自身不处理审批上的 `Enter` | 有卡片显示 |
| `Esc` | 点击卡片的关闭按钮 | 不做任何事 | 有卡片显示 |

方向键落到**页脚按钮**（上一题/下一题/跳过/提交）时只移动焦点，不会点击它——否则越过最后一个选项就会直接提交。

**多题卡片上方向键不翻页**：DSH 官方在单选多题时"选完自动进入下一题"，这对鼠标很顺手，但对用方向键挑选项的人不友好（按 `↓` 本想看下一个选项，结果整页跳走了）。所以方向键选中后，插件会把页码切回当前题；要继续下一题请按 `Enter`、按数字键，或点「下一题」。

卡片弹出时的初始状态：

- **单选题卡片默认选中选项 1，焦点环也在选项 1 上**（仅当该题还没有答案时）。你可以直接按 `Enter` 提交选项 1，也可以用 `2`/`3` 或方向键改选后再提交。想输入自定义答案时，用方向键往下走到输入框即可。
- **多题卡片（有 `1/3` 页码）既不选中、也不放焦点环**。因为①官方卡片在单选多题时"选完自动翻页"，若每页都默认选中，整批题目会被自动填满并跳过；②没有选中态的焦点环看起来就像"默认选过了"，容易误导。这与 DSH 自身行为一致——官方对有选项的题目既不聚焦选项、也不聚焦输入框。你要按数字键或方向键，才出现灰底和焦点环。
- **审批卡片焦点在「允许一次」**，一次 `Enter` 即同意；按 `2` 或 `←` 再 `Enter` 表示拒绝。

卡片答完关闭后，**焦点自动回到主输入框**，可以直接接着打字，不用再点一下输入框。这个回收是保守的：只有焦点确实悬空（落在页面空白处）且输入框可编辑时才会发生；如果你已经点到别处继续工作，插件不会把你拉回来。

> 注意：提问卡片默认选中后，`Enter` 会直接提交选项 1（单选题）——这是“默认值 + 直接回车确认”的必然结果。不想用默认值时，请先按 `2`/`3` 或方向键改选。

在补充说明输入框里打字时，所有按键保持原样输入。

## 兼容性

面向 DSH 组合 `0.2.1-rc.2`（同上游 `>=0.2.0-rc.1 <1.0.0`）；浏览器产物依赖 DSH boot 注入，无法脱离 DSH 使用。

插件依赖官方卡片的以下 DOM 约定，官方改动时需要同步更新：`[data-question-key]` / `[data-approval-key]` 外层、`button[role="radio"|"checkbox"]` 选项、`[data-question-scroll]` 正文、`footer` 动作行、`header` 关闭按钮。

## 开发与验证

```bash
pnpm install
pnpm run typecheck
pnpm exec vitest run
pnpm run bundle
```

`tests/card-fixture.ts` 按官方卡片的真实结构搭建夹具，`tests/install.client.spec.ts` 用假的 shortcuts 服务回放仲裁输入，覆盖数字选择、方向键、回车、Esc、审批 1/2、以及输入框/弹窗/修饰键/输入法这些不该抢键的场景。`tests/approval-focus.client.spec.ts` 与 `tests/question-default.client.spec.ts` 单独覆盖两类卡片的初始状态：只生效一次、不覆盖已有答案、不抢输入框焦点、排队卡片各自生效。

浏览器验收需通过真实 DSH 组合进行；`apps/web` Vite 入口不是本插件的验证目标。

## License

MIT
