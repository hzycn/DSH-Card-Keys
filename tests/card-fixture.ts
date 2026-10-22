/** Fixtures that mirror the shipped interaction-card markup this plugin drives.
 *
 * The structure is copied from the official takeovers so a regression in the selectors
 * shows up here: `@deepseek-ai/dsh-client-ui-user-questions` renders
 * `[data-question-key] > section > header/body/footer`, with `button[role=radio]`
 * options and the custom answer field inside the body's `[data-question-scroll]`;
 * `@deepseek-ai/dsh-client-ui-approval` renders `[data-approval-key]` around a card
 * whose action row holds the reject and allow-once buttons in that order. */

export interface QuestionFixture {
  readonly card: HTMLElement
  readonly options: HTMLButtonElement[]
  readonly custom: HTMLInputElement
  readonly previous: HTMLButtonElement
  readonly next: HTMLButtonElement
  readonly skip: HTMLButtonElement
  readonly primary: HTMLButtonElement
  readonly close: HTMLButtonElement
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

/** Mount one ask_user_question card and record the clicks performed on it. */
export function mountQuestionCard(root: ParentNode = document.body, key = 'q1'): QuestionFixture {
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
          <div role="radiogroup">
            <button type="button" role="radio" aria-checked="false">1 Option A</button>
            <button type="button" role="radio" aria-checked="false">2 Option B</button>
            <button type="button" role="radio" aria-checked="false">3 Option C</button>
            <div><input aria-label="custom answer" /></div>
          </div>
        </div>
        <footer>
          <div>
            <button type="button" aria-label="previous">&lt;</button>
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
  const buttons = [...card.querySelectorAll<HTMLButtonElement>('button')]
  const options = buttons.filter(button => button.getAttribute('role') === 'radio')
  const footerButtons = [...card.querySelectorAll<HTMLButtonElement>('footer button')]
  const fixture: QuestionFixture = {
    card,
    options,
    custom: card.querySelector('input')!,
    previous: track(clicks, footerButtons[0]!, 'previous'),
    next: track(clicks, footerButtons[1]!, 'next'),
    skip: track(clicks, footerButtons[2]!, 'skip'),
    primary: track(clicks, footerButtons[3]!, 'primary'),
    close: track(clicks, card.querySelector('header button:last-of-type')!, 'close'),
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
