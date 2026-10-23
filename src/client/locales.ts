/** Localized presentation only. */
export const NS = 'dsh-card-keys'

export const en = {
  'settings.summary': 'Keyboard control for question and approval cards.',
  'settings.title': 'Keyboard cards',
  'settings.enable': 'Keyboard control for cards',
  'settings.hint': 'On by default. Number keys 1-9 select an option, ← → ↑ ↓ move between controls, Enter confirms, Escape closes a question card. A question card opens with option 1 selected and an approval card with the keyboard on "Allow once", so one Enter confirms either — press another digit or arrow first to choose differently. The number keys appear under DSH Settings → General → Keyboard shortcuts (approval group). Typing in a text field always keeps its normal keys.',
  'settings.unavailable': 'Settings are loading or cannot be saved in this connection.',
  'card.selectKeys': 'Cards: select option with number keys',
}

export const zh: Record<keyof typeof en, string> = {
  'settings.summary': '问题与审批卡片的键盘操作。',
  'settings.title': '卡片键盘操作',
  'settings.enable': '启用卡片键盘操作',
  'settings.hint': '默认开启。数字键 1-9 直接选择选项，← → ↑ ↓ 在选项与按钮间移动，回车确认，Esc 关闭提问卡片。提问卡片弹出时默认选中选项 1，权限卡片弹出时焦点已在「允许一次」上，所以一次回车即确认——想改选请先按其他数字或方向键。数字键同步显示在 DSH 设置 → 通用 → 键盘快捷键 的审批分组中。在输入框里打字时按键保持原样。',
  'settings.unavailable': '设置正在加载，或当前连接无法保存设置。',
  'card.selectKeys': '卡片：数字键选择选项',
}

import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'dsh-card-keys': keyof typeof en }
}
