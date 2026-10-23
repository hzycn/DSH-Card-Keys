/** Returning the keyboard to the chat composer after a card closes.
 *
 * Answering a question card or allowing an approval removes the takeover, and focus then
 * falls back to the page body: the user has to click the composer before typing again. This
 * module hands the keyboard back to the shipped composer input, which DSH marks with
 * `data-composer-input` on a Lexical contenteditable.
 *
 * It is deliberately conservative — it only acts when focus was truly lost (nothing, or the
 * page body, is focused) and only when the composer is actually editable. A user who clicked
 * somewhere else to keep working there is never pulled back. */

/** The shipped chat composer's editable surface. */
const COMPOSER_INPUT = '[data-composer-input]'

/** Whether focus is nowhere in particular, so taking it cannot override a user's choice. */
function focusIsLoose(root: Document): boolean {
  const active = root.activeElement
  return active === null || active === root.body || active === root.documentElement
}

/**
 * Whether the composer currently accepts input.
 *
 * DSH toggles the `contenteditable` attribute itself (`editor.setEditable(editable)`), so the
 * attribute is the contract. `isContentEditable` is the browser's computed answer, but jsdom
 * does not implement it — checking both keeps the guard honest in tests and in the real page.
 *
 * @param input - the composer's editable surface.
 * @returns whether it is editable right now.
 */
function isEditable(input: HTMLElement): boolean {
  const attribute = input.getAttribute('contenteditable')
  if (attribute === null || attribute === 'false') return false
  return input.isContentEditable !== false
}

/**
 * Hand the keyboard back to the chat composer.
 *
 * @param root - the document owning the composer.
 * @returns whether the composer took the focus.
 */
export function focusComposer(root: Document): boolean {
  if (!focusIsLoose(root)) return false
  const input = root.querySelector<HTMLElement>(COMPOSER_INPUT)
  if (input === null) return false
  // The composer disables itself while a turn is being submitted; focusing a read-only
  // surface would leave the caret nowhere useful, so wait for the next attempt instead.
  if (!isEditable(input)) return false
  input.focus({ preventScroll: true })
  return root.activeElement === input
}

/**
 * Try to focus the composer now, then once more on the next frame.
 *
 * A closing takeover resigns focus in stages: the card unmounts, the composer re-enables, and
 * only then can it accept the caret. The frame retry covers that gap without polling.
 *
 * @param root - the document owning the composer.
 * @returns disposer cancelling a scheduled retry.
 */
export function scheduleComposerFocus(root: Document): () => void {
  if (focusComposer(root)) return () => {}
  const view = root.defaultView
  if (view === null) return () => {}
  const frame = view.requestAnimationFrame(() => { focusComposer(root) })
  return () => { view.cancelAnimationFrame(frame) }
}
