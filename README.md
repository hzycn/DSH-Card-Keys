# DSH-Card-Keys

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 的 DSH 插件，为 DSH 的选项卡片（提问）和权限卡片（审批）提供数字键、方向键的快捷操作，**默认开启**。只做两件事：

1. **提问 / 审批卡片的键盘操作** — 数字键 `1`–`9` 直接选择选项，`←` `→` `↑` `↓` 在选项与按钮间移动，`Enter` 确认，`Esc` 关闭提问卡片。审批卡片 `1` = 允许一次，`2` = 拒绝；永远不会在没有按键的情况下自动授权。
2. **一个总开关** — 在 **插件管理 → 本插件** 的设置页里打开或关闭上面这个功能。

数字键同步显示在 **DSH 设置 → 通用 → 键盘快捷键** 的审批分组中；在输入框里打字时按键保持原样。

> Provide number-key and arrow-key shortcuts for DSH's option cards and permission cards. Once enabled, number keys 1–9 directly select options, ← → ↑ ↓ move between options and buttons, Enter confirms, and Esc closes the question card. The number keys are also displayed in the Approval group under DSH Settings → General → Keyboard Shortcuts. When typing in the input field, key presses behave as usual.

本项目源自 [`@hytime/dsh-client-ui-shortcuts`](https://www.npmjs.com/package/@hytime/dsh-client-ui-shortcuts)，现名 **DSH-Card-Keys**：客户端部分已完全重写为**不接管官方卡片**的增量键盘层（见下文「实现方式」）。

## 实现方式（不替换官方卡片）

插件**不接管、不重绘**官方卡片，只给已经在屏幕上的官方卡片加键盘：

- 数字键走 **DSH 官方固定快捷键通道**（`shortcuts.registerFixed` + `observeFixedInput`）。开关打开时，`DSH 设置 → 通用 → 键盘快捷键` 的**审批分组**会出现一行「卡片：数字键选择选项（1-9）」；开关关闭后这一行自动消失。
- 按键仲裁完全交给 DSH：焦点在输入框/终端里打字时、有弹窗时、输入法组合中、带修饰键时，数字键保持原样，插件不会抢键。
- 命中后插件只对官方卡片的 DOM 做普通 `click()` / `focus()`：`[data-question-key]` 里的 `button[role="radio"|"checkbox"]`、`[data-approval-key]` 里的「拒绝 / 允许一次」按钮、`footer` 里的主按钮、`header` 里的关闭按钮。因此官方的进度记忆、倒计时、计划审批、只读回顾卡片等行为全部保留。

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

如果是 CLI 版 DSH Web 组合，仍按原方式安装本目录构建产物（`cordis.patch.yml` 已就绪）：

```yaml
- insert:
    - id: dsh-card-keys
      name: '@hzy/dsh-card-keys'
```

## 键位

| 按键 | 提问卡片 | 审批卡片 | 生效条件 |
| --- | --- | --- | --- |
| `1`–`9` | 选择对应选项（多选题为切换勾选；单选会自动进入下一题） | `1` 允许一次，`2` 拒绝 | 有卡片显示，焦点不在输入框/终端/弹窗中 |
| `←` `→` / `↑` `↓` | 在选项、补充输入、上一题/下一题/跳过/提交之间移动焦点 | 在「拒绝 / 允许一次」间移动焦点 | 有卡片显示，焦点不在输入框 |
| `Enter` | 焦点在按钮上时由按钮处理；否则点击卡片的主按钮（提交 / 下一题） | 不做任何事（避免误授权；焦点在卡片内时由官方卡片自己处理） | 有卡片显示 |
| `Esc` | 点击卡片的关闭按钮 | 不做任何事 | 有卡片显示 |

在补充说明输入框里打字时，所有按键保持原样输入。

## 兼容性

面向 DSH Web 组合 `0.2.1-rc.2`（同上游 `>=0.2.0-rc.1 <1.0.0`）；浏览器产物依赖 DSH boot 注入，无法脱离 DSH Web 使用。

插件依赖官方卡片的以下 DOM 约定，官方改动时需要同步更新：`[data-question-key]` / `[data-approval-key]` 外层、`button[role="radio"|"checkbox"]` 选项、`[data-question-scroll]` 正文、`footer` 动作行、`header` 关闭按钮。

## 开发与验证

```bash
pnpm install
pnpm run typecheck
pnpm exec vitest run
pnpm run bundle
```

`tests/card-fixture.ts` 按官方卡片的真实结构搭建夹具，`tests/install.client.spec.ts` 用假的 shortcuts 服务回放仲裁输入，覆盖数字选择、方向键、回车、Esc、审批 1/2、以及输入框/弹窗/修饰键/输入法这些不该抢键的场景。

浏览器验收需通过真实 DSH Web 组合进行；`apps/web` Vite 入口不是本插件的验证目标。

## License

MIT
