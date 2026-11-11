/** Fixtures that mirror the shipped interaction-card markup this plugin drives.
 *
 * The structure is copied from the official takeovers so a regression in the selectors
 * shows up here. As of DSH 0.2.2:
 *
 * - `@deepseek-ai/dsh-client-ui-user-questions` renders
 *   `[data-question-key] > section > header/body/footer`, with `button[role=radio]`
 *   (or `role=checkbox`) options each wrapped in `[data-option-row]`, the custom answer
 *   inside the body's `[data-question-scroll]`, and — new in 0.2.2 — copy-expand toggles
 *   inside that same body: an always-rendered `.questionToggle` above the options and one
 *   `.descriptionToggle` after any option that carries a description. Both are
 *   `visibility: hidden` until their copy overflows, so their `focus()` is a no-op; the
 *   fixture reproduces that computed state with an inline style.
 * - `@deepseek-ai/dsh-client-ui-approval` renders `[data-approval-key]` around a card whose
 *   action row holds the reject and allow-once buttons in that order.
 *
 * NOTE: when DSH changes this markup again, update the fixture first and let the tests fail;
 * that is the only thing that keeps a silent UI regression from shipping. */

export interface QuestionFixture {
  readonly card: HTMLElement
  readonly options: HTMLButtonElement[]
  readonly custom: HTMLTextAreaElement
  /** The 0.2.2 question-copy expand toggle: always present, hidden until the text overflows. */
  readonly questionToggle: HTMLButtonElement
  /** The 0.2.2 per-option description expand toggle: present only with a description, hidden. */
  readonly descriptionToggle: HTMLButtonElement
  readonly previous: HTMLButtonElement
  readonly next: HTMLButtonElement
  readonly skip: HTMLButtonElement
  readonly primary: HTMLButtonElement
  readonly close: HTMLButtonElement
  /** Rewrite the footer pager, standing in for the shipped card turning to another question. */
  readonly setPage: (index: number, total: number) => void
  /** The page index the pager currently shows, or null before a pager exists. */
  readonly page: () => number | null
  /** Mark one option as the chosen one, the way the shipped card reports its own state. */
  readonly check: (index: number) => void
  readonly clicks: string[]
}

export interface ApprovalFixture {
  readonly card: HTMLElement
  readonly reject: HTMLButtonElement
  readonly allow: HTMLButtonElement
  readonly clicks: string[]
}

function track(clicks: string[], button: HTMLButtonElement, name: string): HTMLButtonElement {
  button.addEventListener('click', () => { clicks.push(name) })
  return button
}

/**
 * Mount one ask_user_question card and record the clicks performed on it.
 *
 * @param root - where to mount the frame.
 * @param key - the card's `data-question-key` value.
 * @param page - the pager label; `3` renders the shipped `n / 3` multi-question pager, so a
 *   fixture can represent any page of a batch.
 * @param multiSelect - render the shipped multi-select markup: `role="group"` around
 *   `role="checkbox"` options instead of `role="radiogroup"` around `role="radio"`.
 * @param withDescription - render the 0.2.2 description toggle after the second option.
 *   Kept on by default because its hidden button is exactly what broke the arrow ring.
 */
export function mountQuestionCard(
  root: ParentNode = document.body,
  key = 'q1',
  page = 1,
  multiSelect = false,
  withDescription = true,
): QuestionFixture {
  const pager = page > 1 ? `1 / ${String(page)}` : ''
  const groupRole = multiSelect ? 'group' : 'radiogroup'
  const optionRole = multiSelect ? 'checkbox' : 'radio'
  // The shipped toggles are hidden by card CSS until their copy overflows. An inline style
  // gives every DOM implementation the same computed state.
  const hidden = 'style="visibility:hidden"'
  const host = document.createElement('div')
  host.innerHTML = `
    <div data-question-key="${key}">
      <section aria-labelledby="question-${key}">
        <header>
          <div><h2 id="question-${key}">Which one?</h2></div>
          <div>
            <button type="button" aria-label="minimize">-</button>
            <button type="button" aria-label="close">x</button>
          </div>
        </header>
        <div data-question-scroll="true">
          <div>
            <h2>Which one?</h2>
            <button type="button" aria-label="expand" ${hidden}>v</button>
          </div>
          <div role="${groupRole}">
            <div data-option-row>
              <button type="button" role="${optionRole}" aria-checked="false">1 Option A</button>
            </div>
            <div data-option-row>
              <button type="button" role="${optionRole}" aria-checked="false">2 Option B</button>
              ${withDescription ? `<button type="button" aria-label="expand" ${hidden}>v</button>` : ''}
            </div>
            <div data-option-row>
              <button type="button" role="${optionRole}" aria-checked="false">3 Option C</button>
            </div>
            <div><textarea aria-label="custom answer" rows="1"></textarea></div>
          </div>
        </div>
        <footer>
          <div>
            <button type="button" aria-label="previous">&lt;</button>
            ${pager === '' ? '' : `<span>${pager}</span>`}
            <button type="button" aria-label="next">&gt;</button>
          </div>
          <div role="status"></div>
          <div>
            <button type="button">Skip</button>
            <button type="button">Submit</button>
          </div>
        </footer>
      </section>
    </div>`
  const container = host.firstElementChild as HTMLElement
  root.appendChild(container)
  const card = container
  const clicks: string[] = []
  const options = [...card.querySelectorAll<HTMLButtonElement>(
    'button[role="radio"], button[role="checkbox"]',
  )]
  const footerButtons = [...card.querySelectorAll<HTMLButtonElement>('footer button')]
  const body = card.querySelector('[data-question-scroll]') as HTMLElement
  const bodyButtons = [...body.querySelectorAll<HTMLButtonElement>('button')].filter(
    button => button.getAttribute('role') === null,
  )
  const fixture: QuestionFixture = {
    card,
    options,
    custom: card.querySelector('textarea')!,
    questionToggle: bodyButtons[0]!,
    descriptionToggle: bodyButtons[1]!,
    previous: track(clicks, footerButtons[0]!, 'previous'),
    next: track(clicks, footerButtons[1]!, 'next'),
    skip: track(clicks, footerButtons[2]!, 'skip'),
    primary: track(clicks, footerButtons[3]!, 'primary'),
    close: track(clicks, card.querySelector('header button:last-of-type')!, 'close'),
    setPage(index: number, total: number): void {
      const span = card.querySelector('footer span')
      if (span !== null) span.textContent = `${String(index)} / ${String(total)}`
    },
    page(): number | null {
      const span = card.querySelector('footer span')
      const match = span === null ? null : /(\d+)\s*\/\s*(\d+)/u.exec(span.textContent ?? '')
      return match === null ? null : Number(match[1])
    },
    check(index: number): void {
      options.forEach((option, position) => {
        option.setAttribute('aria-checked', String(position === index))
      })
    },
    clicks,
  }
  options.forEach((option, index) => track(clicks, option, `option-${String(index + 1)}`))
  return fixture
}

/** Mount one approval card and record the clicks performed on it. */
export function mountApprovalCard(root: ParentNode = document.body, key = 'a1'): ApprovalFixture {
  const host = document.createElement('div')
  host.innerHTML = `
    <div data-approval-key="${key}">
      <div>
        <div>
          <div>Waiting for approval</div>
          <div role="group" tabindex="0">Run this command?</div>
          <div>
            <button type="button">Reject</button>
            <button type="button">Allow once</button>
          </div>
        </div>
      </div>
    </div>`
  const container = host.firstElementChild as HTMLElement
  root.appendChild(container)
  const clicks: string[] = []
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')]
  return {
    card: container,
    reject: track(clicks, buttons[0]!, 'reject'),
    allow: track(clicks, buttons[1]!, 'allow'),
    clicks,
  }
}
