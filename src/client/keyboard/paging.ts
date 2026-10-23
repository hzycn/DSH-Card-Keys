/** Multi-question paging guard.
 *
 * On a single-select card holding several questions, the shipped `choose` handler advances to
 * the next question as soon as an option is picked:
 *
 *   replaceProgress(index + 1, ...) when `multiSelect !== true && index < questions.length - 1`
 *
 * That is a sensible mouse flow — click an answer, land on the next question — but it fights a
 * user driving the card with the arrows, who expects `↓` to move down the option list rather
 * than to leave the page.
 *
 * This module lets the arrow keys select without leaving the page: it notes the current page,
 * lets the selection happen, and if the page moved, walks it back with the card's own previous
 * button. That button's handler is exactly `replaceProgress(index - 1, drafts)`, so the draft
 * the selection just wrote is preserved and only the pager changes.
 *
 * Nothing here touches React state directly; every step goes through the shipped controls. The
 * rollback has to wait for React to commit the page change, so it runs on a microtask. */

/** The pager's previous-question control, identified by structure rather than by its label. */
const PREV_FALLBACK = '[aria-label="上一题"], [aria-label="Previous"], [aria-label="previous"]'

/** Read the current page index from the card's `n / total` footer label, or null without a pager. */
export function pageIndexOf(card: HTMLElement): number | null {
  const footer = card.querySelector('footer')
  if (footer === null) return null
  const match = /(\d+)\s*\/\s*(\d+)/u.exec(footer.textContent ?? '')
  if (match === null) return null
  const index = Number(match[1])
  const total = Number(match[2])
  if (!Number.isFinite(index) || !Number.isFinite(total)) return null
  return total > 1 ? index : null
}

/**
 * The card's own "previous question" button.
 *
 * The pager sits in the footer's first group as `previous`, `n / total`, `next`; the previous
 * button is the one immediately before the progress label, so its position identifies it even
 * when the label is localized.
 */
export function previousButton(card: HTMLElement): HTMLElement | undefined {
  const footer = card.querySelector('footer')
  if (footer === null) return undefined
  for (const span of footer.querySelectorAll('span')) {
    if (!/\d+\s*\/\s*\d+/u.test(span.textContent ?? '')) continue
    const previous = span.previousElementSibling
    if (previous instanceof HTMLElement && previous.tagName === 'BUTTON') return previous
  }
  return footer.querySelector<HTMLElement>(PREV_FALLBACK) ?? undefined
}

/**
 * Select an option without letting a multi-question card turn the page.
 *
 * The rollback clicks the card's own previous button, and that has a visible side effect: the
 * page re-renders, the option nodes are replaced, and focus lands on the previous button (or
 * falls to the page). A user who then presses `↓` again would start over from the footer
 * instead of moving to the next option — which reads as "the arrows stopped working".
 *
 * So the guard remembers the option's position, and once the rollback has committed it puts
 * the ring back on the option at that position in the re-rendered card.
 *
 * @param card - the live question card.
 * @param button - the option to select.
 * @returns whether a page change was rolled back.
 */
export function selectWithoutPaging(card: HTMLElement, button: HTMLElement): boolean {
  const before = pageIndexOf(card)
  // The ring is the caller's position; keep it so the same option can be found again.
  const position = [...card.querySelectorAll<HTMLElement>(OPTION_SELECTOR)].indexOf(button)
  button.click()
  // A single-question card has no pager, and a multi-select card never advances: nothing to do.
  if (before === null) return false
  // The page change lands after React commits, so check once the current task finishes.
  queueMicrotask(() => {
    const after = pageIndexOf(card)
    if (after === null || after === before) return
    previousButton(card)?.click()
    // The rollback re-renders the page, so restore the ring on the same option position. It
    // runs on a further microtask because the previous click's render has not committed yet.
    queueMicrotask(() => { restoreRing(card, position) })
  })
  return true
}

/** Options in display order, matching `optionButtons` but without the enabled filter. */
const OPTION_SELECTOR = 'button[role="radio"], button[role="checkbox"]'

/**
 * Put the ring back on the option at a position, after the card re-rendered.
 *
 * @param card - the live question card.
 * @param position - zero-based option position, or -1 when it could not be determined.
 */
function restoreRing(card: HTMLElement, position: number): void {
  if (position < 0) return
  const options = [...card.querySelectorAll<HTMLElement>(OPTION_SELECTOR)]
  const target = options[position]
  if (target === undefined) return
  // Only take focus back if the rollback left it loose; never steal it from where a user
  // deliberately moved it in the meantime.
  const active = card.ownerDocument.activeElement
  const loose = active === null
    || active === card.ownerDocument.body
    || active === card.ownerDocument.documentElement
    || !active.isConnected
    || !card.contains(active)
    || active.tagName === 'BUTTON' && previousButton(card) === active
  if (!loose) return
  target.focus({ preventScroll: true })
}
