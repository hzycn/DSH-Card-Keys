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
 * This module lets a digit or an arrow select without leaving the page: it notes the current
 * page, lets the selection happen, and if the page moved, walks it back with the card's own
 * previous button. That button's handler is exactly `replaceProgress(index - 1, drafts)`, so the
 * draft the selection just wrote is preserved and only the pager changes.
 *
 * Nothing here touches React state directly; every step goes through the shipped controls. */

import { pagerLabel } from './dom.js'

/** The pager's previous-question control, identified by structure rather than by its label. */
const PREV_FALLBACK = '[aria-label="上一题"], [aria-label="Previous"], [aria-label="previous"]'

/** Options in display order, matching `optionButtons` but without the enabled filter. */
const OPTION_SELECTOR = 'button[role="radio"], button[role="checkbox"]'

/**
 * Set on the card while a rollback is in flight.
 *
 * Shared with the default watcher, which must not re-place the ring while the guard is putting
 * it back. Kept as an attribute rather than module state so neither module has to import the
 * other, and so an abandoned rollback leaves nothing behind.
 */
export const ROLLBACK_FLAG = 'data-cardkeys-paging-back'

/**
 * How many animation frames the ring may be re-placed over before giving up.
 *
 * A rollback makes React re-render the page, and React commits that render on its own
 * schedule — a task later, not in the microtask where the previous button was clicked. Until
 * it commits, the option nodes on screen are the ones about to be replaced: focusing one looks
 * right for a moment and then the ring disappears with the node. Waiting a few frames absorbs
 * that, and the cap keeps a card that never settles from holding the flag forever.
 */
const RING_FRAMES = 6

/** Read the current page index from the card's `n / total` footer label, or null without a pager. */
export function pageIndexOf(card: HTMLElement): number | null {
  const label = pagerLabel(card)
  // A single question has no pager worth the name: its label would read `1 / 1` at most.
  return label !== null && label[1] > 1 ? label[0] : null
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
 * @param card - the live question card.
 * @param button - the option to select; already focused by the caller.
 * @returns whether the card has a pager at all. The rollback itself cannot be reported here:
 *   it happens a microtask later, once React has committed the page change.
 */
export function selectWithoutPaging(card: HTMLElement, button: HTMLElement): boolean {
  const before = pageIndexOf(card)
  // The ring is the caller's position; keep it so the same option can be found again.
  const position = [...card.querySelectorAll<HTMLElement>(OPTION_SELECTOR)].indexOf(button)
  button.click()
  // A single-question card has no pager, and a multi-select card never advances: nothing to do.
  if (before === null) return false
  // Announce the rollback on the card itself. The page turn re-renders the card, which wakes
  // the default watcher, and its "put the ring on the first option" would otherwise race this
  // guard's "put the ring back on the option the user picked".
  card.setAttribute(ROLLBACK_FLAG, '')
  // Both scrollers need saving, for two different reasons.
  //
  // The card body is reset outright: `replaceProgress` sets its `scrollTop` to 0 whenever the
  // page changes, so the rollback clears it twice.
  //
  // The conversation scroller is *clamped*: turning to a shorter page shrinks the content, the
  // browser pulls `scrollTop` down to the new maximum, and turning back does not put it back.
  // Each key therefore loses a few dozen pixels permanently. Once the transcript is no longer
  // at the bottom DSH stops auto-following it — the chat visibly stops scrolling, and only a
  // manual scroll back to the bottom restores it.
  //
  // What to do about the transcript depends on where it was. If it was following the bottom,
  // the only correct end state is *the bottom* — not the old offset, which goes stale the moment
  // the transcript grows, and dragging it back is what made the chat lurch upward and snap down.
  // If the user had scrolled up to read something, nothing is lost (a short page cannot clamp an
  // offset that was never at the maximum) and the offset is left entirely alone.
  const body = card.querySelector<HTMLElement>('[data-question-scroll]')
  const bodyTop = body?.scrollTop ?? 0
  const scroller = conversationScroller(card)
  const wasAtBottom = scroller !== null && atBottom(scroller)
  // The page change lands after React commits, so check once the current task finishes.
  queueMicrotask(() => {
    const after = pageIndexOf(card)
    if (after === null || after === before) {
      // No rollback happened, so there is no render to race. The caller's focus stands.
      card.removeAttribute(ROLLBACK_FLAG)
      return
    }
    previousButton(card)?.click()
    settleRing(card, position, 0, false, () => {
      if (body !== null && body.isConnected && bodyTop > 0) body.scrollTop = bodyTop
      if (scroller !== null && wasAtBottom) followBottom(scroller)
      card.removeAttribute(ROLLBACK_FLAG)
    })
  })
  return true
}

/** Whether a scroller is showing its last pixel, allowing for sub-pixel rounding. */
function atBottom(scroller: HTMLElement): boolean {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 1
}

/**
 * Put the transcript back at the bottom, without tugging on it.
 *
 * Only ever moves **downward**, and gives up after two frames. Both bounds exist because the
 * obvious alternative — restoring the offset recorded before the rollback — is wrong: that
 * offset goes stale the instant the transcript grows, so writing it back drags the chat up and
 * the app's own follow snaps it down again. That lurch is what the user reported as "被强行卡在
 * 最下面". Moving only downward can never fight the app's follow, and stopping after two frames
 * leaves a reader who arrives in the meantime alone.
 *
 * Note the limit this deliberately does not try to solve: a browser clamps `scrollTop` whenever
 * the content shrinks, and a clamp is indistinguishable from a user scrolling up. Any guard that
 * treats "moved up since our last write" as user intent would therefore abort on the very clamp
 * it is here to repair, so no such guard is used.
 *
 * @param scroller - the conversation scroller.
 * @param attempt - frames spent so far.
 */
function followBottom(scroller: HTMLElement, attempt = 0): void {
  if (!scroller.isConnected) return
  const max = scroller.scrollHeight - scroller.clientHeight
  if (max > 0 && scroller.scrollTop < max) scroller.scrollTop = max
  if (attempt >= 2) return
  const view = scroller.ownerDocument.defaultView
  if (view === null) return
  view.requestAnimationFrame(() => {
    if (!scroller.isConnected || atBottom(scroller)) return
    followBottom(scroller, attempt + 1)
  })
}

/**
 * The transcript scroller that owns the card, or null when there is none.
 *
 * DSH marks it `[data-conversation-scroll]`. It is not an ancestor of the paged card in a simple
 * sense — the takeover is rendered inside the scroll body — so the lookup starts from the card
 * and walks up, falling back to the document when the card has been re-rendered out of its
 * original position.
 *
 * @param card - the live question card.
 * @returns the conversation scroller, or null.
 */
function conversationScroller(card: HTMLElement): HTMLElement | null {
  const own = card.closest<HTMLElement>('[data-conversation-scroll]')
  if (own !== null) return own
  return card.ownerDocument.querySelector<HTMLElement>('[data-conversation-scroll]')
}

/**
 * Whether the keyboard has no deliberate position of its own right now.
 *
 * A page re-render drops the node that had focus, so the ring is loose afterwards — either
 * nothing is focused, or focus fell to the page body, or it sits on the card's own previous
 * button, or on an option of this card (which is where the ring belongs anyway). The answer
 * field and the footer pager are the user's own positions and are never taken away.
 *
 * @param card - the live question card.
 * @param doc - the document owning it.
 * @returns whether focus may be placed.
 */
export function ringIsLoose(card: HTMLElement, doc: Document): boolean {
  const active = doc.activeElement
  if (active === null || active === doc.body || active === doc.documentElement) return true
  if (!active.isConnected || !card.contains(active)) return true
  // Inside the card, only positions the plugin itself put focus on may be taken over: another
  // option, or the previous pager button after a rollback. The answer field and the other
  // footer controls are the user's own, and pulling focus out of them is what this guard
  // exists to avoid.
  if (!(active instanceof HTMLElement)) return false
  if (isOption(active)) return true
  return previousButton(card) === active
}

/**
 * Put the ring back on the option at a position, across the re-render it has to survive.
 *
 * Exported because the default-selection path has the same problem: clicking an option changes
 * the card's state, React re-renders, and the node that had focus can be replaced. Anything
 * that focuses an option and then changes the card's state has to re-assert the ring afterwards.
 *
 * @param card - the live question card.
 * @param position - zero-based option position, or -1 when it could not be determined.
 * @param force - take the ring even where focus is not loose. Only the card's own opening
 *   default passes this: the shipped card autofocuses its answer field, and that autofocus is
 *   the card's doing, not the user's, so the ring may replace it. Everything that reacts to a
 *   later interaction must respect the user's focus instead.
 * @param done - called once the ring has settled or the attempts ran out.
 */
export function settleRingOn(card: HTMLElement, position: number, force = false, done?: () => void): void {
  settleRing(card, position, 0, force, done ?? (() => {}))
}

/**
 * Put the ring back on the option at a position, across the re-render it has to survive.
 *
 * @param card - the live question card.
 * @param position - zero-based option position, or -1 when it could not be determined.
 * @param attempt - frames spent so far.
 * @param force - take the ring even where focus is not loose.
 * @param done - called once the ring has settled or the attempts ran out.
 */
function settleRing(card: HTMLElement, position: number, attempt: number, force: boolean, done: () => void): void {
  // The page is showing fewer options than the index asks for: nothing sensible to focus.
  if (position < 0) { done(); return }
  const doc = card.ownerDocument
  const view = doc.defaultView
  const target = [...card.querySelectorAll<HTMLElement>(OPTION_SELECTOR)][position]
  if (target === undefined) { done(); return }
  if (!force && !ringIsLoose(card, doc)) { done(); return }
  target.focus({ preventScroll: true })
  if (view === null || attempt >= RING_FRAMES) { done(); return }
  // Check once the browser has had a chance to commit the re-render. A replaced node takes the
  // focus with it, which is exactly the case this loop exists for.
  view.requestAnimationFrame(() => {
    const current = [...card.querySelectorAll<HTMLElement>(OPTION_SELECTOR)][position]
    if (current === undefined) { done(); return }
    if (current.isConnected && doc.activeElement === current) { done(); return }
    settleRing(card, position, attempt + 1, force, done)
  })
}

/**
 * Whether an element is a selectable option of a question card.
 *
 * @param element - any element.
 * @returns whether it carries the shipped option role.
 */
function isOption(element: Element): boolean {
  if (!(element instanceof HTMLElement) || element.tagName !== 'BUTTON') return false
  const role = element.getAttribute('role')
  return role === 'radio' || role === 'checkbox'
}
