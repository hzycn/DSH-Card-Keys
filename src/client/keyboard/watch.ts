/** One watcher for both card defaults.
 *
 * The two defaults — the approval card opening with the keyboard on `Allow once`, and the
 * question card opening with its first option selected — need the same thing: notice a
 * card, act on it once, and never act on it again.
 *
 * A card is not necessarily *visible* at the instant React inserts it: DSH's takeovers can
 * mount hidden and become visible a frame later. The earlier per-feature observers asked
 * "is a live card on screen?" only while reacting to the insertion itself, so a card that
 * was still hidden at that moment was written off for good. This watcher instead keeps the
 * candidate card and re-checks it on the next frame and on every class/style mutation,
 * until it is really on screen.
 *
 * The watcher never acts twice on the same card: a user who arrows to another control, or
 * picks a different option, keeps that choice across re-renders. */

import { activeCard } from './dom.js'
import type { InteractionCard } from './dom.js'

export interface CardDefaultsOptions {
  /** Document to watch, defaulting to the live one. */
  readonly root?: Document
  /**
   * Apply one default to a card that just became live.
   *
   * Return `false` when the default could not be applied yet — a dialog is in front of the
   * card, or the user is typing — so the watcher keeps the card pending and retries once the
   * obstruction clears. Return `true` (or nothing) when the card is settled, including when
   * it already carried an answer that must not be overwritten.
   */
  readonly onCard: (card: InteractionCard) => boolean | void
  /**
   * Called once when the last interaction card goes away.
   *
   * Answering a card removes the takeover and focus falls to the page body, so this is the
   * moment to hand the keyboard back to the chat composer.
   */
  readonly onAllCardsClosed?: () => void
}

const ELEMENT_NODE = 1
const CARD_SELECTOR = '[data-approval-key], [data-question-key]'
const APPROVAL_CARD = '[data-approval-key]'
const QUESTION_CARD = '[data-question-key]'

/** A card that is really on screen; hidden or detached frames are not candidates yet. */
function isVisible(element: HTMLElement, root: Document): boolean {
  if (!element.isConnected || element.hidden) return false
  if (element.getAttribute('aria-hidden') === 'true') return false
  const view = root.defaultView
  if (view === null) return true
  return view.getComputedStyle(element).display !== 'none'
}

/**
 * The topmost visible card of either kind.
 *
 * `activeCard` applies keyboard precedence (an approval outranks a question), but each kind
 * also needs its own default, so the watcher asks for either card independently.
 */
function visibleCard(root: Document): InteractionCard | null {
  for (const [kind, selector] of [['question', QUESTION_CARD], ['approval', APPROVAL_CARD]] as const) {
    const found = [...root.querySelectorAll<HTMLElement>(selector)].filter(element => isVisible(element, root))
    const element = found.at(-1)
    if (element !== undefined) return { kind, element }
  }
  return null
}

/** Whether a node is, or contains, an interaction card frame. */
function holdsCard(node: Node): boolean {
  if (node.nodeType !== ELEMENT_NODE) return false
  const element = node as Element
  return element.matches(CARD_SELECTOR) || element.querySelector(CARD_SELECTOR) !== null
}

/** Whether a batch of mutations could have changed whether a card may take its default. */
function mayRevealCard(records: readonly MutationRecord[]): boolean {
  for (const record of records) {
    // Class/style/hidden churn is how a takeover becomes visible after mounting hidden.
    if (record.type === 'attributes') return true
    for (const node of record.addedNodes) {
      if (holdsCard(node)) return true
    }
    // A removal can free a declined card (an obstruction went away) and can also be the
    // answered card itself leaving, which is when the composer gets its focus back.
    if (record.removedNodes.length > 0) return true
  }
  return false
}

/**
 * Watch for interaction cards and run one default for each as it becomes live.
 *
 * @param options - the document to watch and the per-card callback.
 * @returns disposer releasing the observers and any pending frame.
 */
export function watchCardDefaults(options: CardDefaultsOptions): () => void {
  const root = options.root ?? document
  const view = root.defaultView
  /** The card already defaulted; it never takes a second default. */
  let handled: HTMLElement | null = null
  /** A card seen but not yet live; re-checked until it becomes visible or leaves. */
  let pending: HTMLElement | null = null
  let frame: number | null = null
  let disposed = false

  const cancelFrame = (): void => {
    if (frame !== null && view !== null) view.cancelAnimationFrame(frame)
    frame = null
  }

  /** Re-check on the next frame: a hidden card usually becomes visible by then. */
  const scheduleFrame = (): void => {
    if (disposed || frame !== null || view === null) return
    frame = view.requestAnimationFrame(() => {
      frame = null
      settle()
    })
  }

  /** Guards against re-entering `settle` from inside a callback's own side effects. */
  let settling = false
  /** Whether a card was on screen at the last look, so a close is reported exactly once. */
  let hadCard = false
  /** Which page of a multi-question card was last handled, so a page turn is noticed. */
  let handledPage = ''

  /** A card's identity plus its current page: a page turn reuses the same frame element. */
  const pageKey = (card: InteractionCard): string => {
    const pager = card.element.querySelector('footer')?.textContent ?? ''
    return `${card.kind}:${pager.trim()}`
  }

  const settle = (): void => {
    if (disposed || settling) return
    if (handled !== null && !handled.isConnected) handled = null
    if (pending !== null && !pending.isConnected) pending = null

    const card = activeCard(root)
    // A visible card that is not this document's *active* card still belongs to the watcher:
    // `activeCard` prefers the approval card, so a question card sitting under one would never
    // be reported. Both are handled by `onCard`, which knows which default applies.
    const target = card ?? visibleCard(root)
    if (target !== null) {
      hadCard = true
      // A page turn re-renders inside the same frame element, so the card identity alone is
      // not enough: the pager label says which question is showing now.
      const page = pageKey(target)
      // An already handled card keeps whatever state the user has since given it.
      if (handled === target.element && handledPage === page) return
      // Claim the card before running the default. The callback focuses and clicks, and both
      // can synchronously re-enter here (a `focusout` listener, a mutation record delivered by
      // `takeRecords`) — claiming it up front is what makes "once per card" hold regardless.
      handled = target.element
      handledPage = page
      pending = null
      settling = true
      let settled: boolean
      try {
        settled = options.onCard(target) !== false
      }
      finally {
        settling = false
      }
      // The callback may decline because the moment is wrong (a dialog in front of the card,
      // the user typing). Such a card is released again and retried on the next trigger; only
      // a settled card stays claimed, so a default is never silently lost.
      if (!settled) { handled = null; pending = target.element; scheduleFrame(); return }
      cancelFrame()
      return
    }

    // Nothing live: a card may still be mounted and hidden. Keep looking at it.
    const candidate = [...root.querySelectorAll<HTMLElement>(CARD_SELECTOR)].filter(
      element => element.isConnected && !element.hidden,
    ).at(-1) ?? null
    if (candidate === null) {
      pending = null
      cancelFrame()
      // The last card is gone: answer it by handing the keyboard back to the composer.
      if (hadCard) { hadCard = false; options.onAllCardsClosed?.() }
      return
    }
    pending = candidate
    scheduleFrame()
  }

  const observer = new MutationObserver(records => {
    if (!mayRevealCard(records)) return
    settle()
  })
  observer.observe(root.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled', 'aria-busy'],
  })

  // A card that yielded to a focused field gets its default when the field lets go.
  const onFocusOut = (): void => { settle() }
  root.addEventListener('focusout', onFocusOut, true)

  settle()
  // A second pass next frame covers a card that was still mounting while `apply` ran.
  scheduleFrame()

  return () => {
    disposed = true
    cancelFrame()
    observer.disconnect()
    root.removeEventListener('focusout', onFocusOut, true)
  }
}
