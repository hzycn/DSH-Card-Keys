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
- **单选题卡片一出现，默认选中选项 1**（每张卡只选一次）。走的是官方选项按钮自己的 `click`，所以草稿、`aria-checked`、主按钮的可用状态都由官方状态机产生；你可以用数字键或方向键随时改选，插件不会替你提交。已带答案的题目（有勾选项、已有补充文本、或官方 `(推荐)` 预选）不会被覆盖；多选题与多题卡片（有 `1/3` 页码）什么都不默认：多选替用户勾选等于替他做决定；多题卡片官方「选完自动翻页」，每页都上默认值会自动填满并跳过整批，且没有选中态的焦点环像「默认选过了」（详见下文「键位」）。

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

脚本用显式 UTF-8 读写 profile 的 `package.json`：该文件里可能有中文路径（本机就是 `D:\ai智能助手API代码\...`），而 **Windows PowerShell 5.1 的 `Get-Content` 默认按 ANSI 解码 UTF-8**，会把中文路径写成乱码，pnpm 随后报 `ENOENT` 并让整个 profile 的插件全部掉线。如果要在 5.1 下运行旧版脚本，请先升级到本仓库版本。

### 让 `powershell` 指向 PowerShell 7（可选，与本插件无关）

Windows 自带 `powershell.exe` 是 5.1。若想让所有 `powershell ...` 调用都用 PowerShell 7：

```powershell
pwsh -File scripts\install-powershell-shim.ps1              # 无需管理员：在 pwsh 目录建 powershell.exe 硬链接
pwsh -File scripts\install-powershell-shim.ps1 -Check       # 只看当前解析到哪个版本
pwsh -File scripts\install-powershell-shim.ps1 -Uninstall   # 撤销
```

用**硬链接**而不是符号链接，原因有两个：

- 符号链接会让 `pwsh.exe` 以为自己的安装目录是链接所在目录，于是去那里找 `pwsh.dll`，找不到就直接失败（`The application to execute does not exist: ...pwsh.dll`）；
- 硬链接指向 `pwsh.exe` 这个文件本身，`PSHOME` 保持为真实的 PowerShell 7 目录；而且创建硬链接**不需要管理员权限**（符号链接需要）。代价是它绑定文件，PowerShell 7 升级后要重新执行一次。

> ⚠️ **不要**在 `C:\Windows\System32` 里执行 `mklink powershell.exe pwsh.exe`。相对目标会被解析成 `System32\pwsh.exe`（不存在），链接悬空，从该目录调用 `powershell` 会报“找不到文件”，比原来的 5.1 更糟；把它改成绝对路径的软链同样不可用，因为 `pwsh.dll` 的查找会落在 `System32`。

Windows PowerShell 5.1 始终保留在 `%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe`，可按全路径继续使用。

已安装的插件被替换后，DSH 的 HMR 会轮询 `lib/client.js` 并把新版本推给已打开的页面，通常不需要重启；若页面没有变化，刷新页面或重启 DeepSeek Harness。

### 手动安装（与脚本等效的流程）

profile 的 `node_modules` 是 pnpm 安装（`nodeLinker: hoisted`），DSH 启动时会校验 `pnpm-lock.yaml`，因此安装要用 **DSH 自带的 pnpm**。直接 `npm install <tgz>` 会把 lockfile 留在旧包上，DSH 会提示修复 profile 或继续加载旧插件，仅在找不到自带 pnpm 时作兜底。

1. `npm pack --ignore-scripts` 生成 `hzy-dsh-card-keys-<version>.tgz`；
2. 在 `%USERPROFILE%\.dsh\profiles\desktop` 下：把 `package.json` 里依赖 `"@hzy/dsh-card-keys"` 的值改成 `"file:<tgz 绝对路径>"`，删除旧的 `node_modules\@hzy\dsh-card-keys`（`file:` 依赖版本号不变，pnpm 会报 "Already up to date" 而跳过重装），再用 DSH 自带的 pnpm 安装：

   ```powershell
   $runtime = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies"
   & "$runtime\node\bin\node.exe" "$runtime\pnpm\bin\pnpm.cjs" install --ignore-scripts
   ```

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
| `1`–`9` | 选择对应选项（**多选题为切换勾选**；单选会自动进入下一题，与 DSH 官方一致） | `1` 允许一次，`2` 拒绝 | 有卡片显示，焦点不在输入框/终端/弹窗中 |
| `←` `→` / `↑` `↓` | 在选项、补充输入、上一题/下一题/跳过/提交之间移动焦点。**单选题**落到选项上时同时选中它（灰底跟随焦点环）；**多选题只移动焦点，不勾选**。**多题卡片上不翻页** | 在「允许一次 / 拒绝」间移动焦点（弹出时已在「允许一次」） | 有卡片显示，焦点不在输入框 |
| `Space` | **多选题**：勾选 / 取消勾选焦点所在的选项 | 不做任何事 | 有卡片显示，焦点在选项上 |
| `Enter` | 焦点在按钮上时由按钮处理；否则点击卡片的主按钮（提交 / 下一题）。**未选中任何项时不做任何事** | 焦点已在「允许一次」时由浏览器原生激活该按钮 = 同意一次；插件自身不处理审批上的 `Enter` | 有卡片显示 |
| `Esc` | 点击卡片的关闭按钮 | 不做任何事 | 有卡片显示 |

**多选题用 `Space` 勾选**：多选是累加式的，如果方向键移动就勾选，浏览一遍就会把所有选项都勾上。所以多选题里方向键只移焦点，按 `Space`（或数字键）才真正勾选/取消。

方向键落到**页脚按钮**（上一题/下一题/跳过/提交）时只移动焦点，不会点击它——否则越过最后一个选项就会直接提交。

**多题卡片上方向键不翻页**：DSH 官方在单选多题时"选完自动进入下一题"，这对鼠标很顺手，但对用方向键挑选项的人不友好（按 `↓` 本想看下一个选项，结果整页跳走了）。所以方向键选中后，插件会把页码切回当前题；要继续下一题请按 `Enter`、按数字键，或点「下一题」。

卡片弹出时的初始状态：

- **单选题卡片默认选中选项 1，焦点环也在选项 1 上**（仅当该题还没有答案时）。你可以直接按 `Enter` 提交选项 1，也可以用 `2`/`3` 或方向键改选后再提交。想输入自定义答案时，用方向键往下走到输入框即可。
- **DSH 自己预选了「推荐」项时，插件不改答案，只把焦点环放到已选中的那一项上**（DSH 0.2.2 起，工具标注 `(Recommended)` 的选项会由官方自动选中）。否则卡片看起来"已经选好了"，键盘却停在页面空白处，第一次按方向键没有起点。
- **多选题卡片不默认勾选任何项**（多选答案由你自己累加，替用户勾选是替他做决定）。
- **多题卡片（有 `1/3` 页码）既不选中、也不放焦点环**。因为①官方卡片在单选多题时"选完自动翻页"，若每页都默认选中，整批题目会被自动填满并跳过；②没有选中态的焦点环看起来就像"默认选过了"，容易误导。这与 DSH 自身行为一致——官方对有选项的题目既不聚焦选项、也不聚焦输入框。你要按数字键或方向键，才出现灰底和焦点环。
- **审批卡片焦点在「允许一次」**，一次 `Enter` 即同意；按 `2` 或 `←` 再 `Enter` 表示拒绝。

卡片答完关闭后，**焦点自动回到主输入框**，可以直接接着打字，不用再点一下输入框。这个回收是保守的：只有焦点确实悬空（落在页面空白处）且输入框可编辑时才会发生；如果你已经点到别处继续工作，插件不会把你拉回来。

> 注意：提问卡片默认选中后，`Enter` 会直接提交选项 1（单选题）——这是“默认值 + 直接回车确认”的必然结果。不想用默认值时，请先按 `2`/`3` 或方向键改选。

在补充说明输入框里打字时，所有按键保持原样输入。

## 兼容性

面向 DSH 组合 `>=0.2.0-rc.1 <1.0.0`（已在 `0.2.2-rc.1` 上验证）。

插件依赖官方卡片的以下 DOM 约定，官方改动时需要同步更新：`[data-question-key]` / `[data-approval-key]` 外层、`button[role="radio"|"checkbox"]` 选项、`[data-question-scroll]` 正文、`footer` 动作行、`header` 关闭按钮。

方向键的焦点环只走**能作答的控件**（选项、补充输入、页脚按钮），不是"正文里的每个 button"。DSH 0.2.2 在正文里新增了两个默认 `visibility:hidden` 的「展开/收起」按钮（题干一个、带描述的选项一个），隐藏元素 `focus()` 是静默失败——旧版把正文所有 button 都当成焦点站点，于是方向键全部失效。现在焦点环按可见性过滤，并且移动焦点后会校验焦点是否真的落上去，落不上就顺延/不消费按键，后续 DSH 再往里加装饰按钮也不会再打断方向键。

## 开发与验证

```bash
pnpm install
pnpm run typecheck
pnpm exec vitest run
pnpm run bundle
```

`tests/card-fixture.ts` 按官方卡片的真实结构搭建夹具，`tests/install.client.spec.ts` 用假的 shortcuts 服务回放仲裁输入，覆盖数字选择、方向键、回车、Esc、审批 1/2、以及输入框/弹窗/修饰键/输入法这些不该抢键的场景。`tests/approval-focus.client.spec.ts` 与 `tests/question-default.client.spec.ts` 单独覆盖两类卡片的初始状态：只生效一次、不覆盖已有答案、不抢输入框焦点、排队卡片各自生效。

浏览器验收需通过真实 DSH desktop 组合进行（`scripts/install-to-dsh.ps1` 可一键完成构建、打包与安装）；浏览器产物依赖 DSH boot 注入，无法脱离 DSH 单独打开页面验证。

## License

MIT
