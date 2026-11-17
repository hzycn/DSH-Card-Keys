// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { questionAnswered, questionCount } from '../src/client/keyboard/dom.js'
import { selectQuestionDefault } from '../src/client/keyboard/question-default.js'
import { watchCardDefaults } from '../src/client/keyboard/watch.js'
import { mountApprovalCard, mountQuestionCard } from './card-fixture.js'

/** Let jsdom deliver the observer's microtask batch. */
async function flush(): Promise<void> {
  await new Promise<void>(resolve => { queueMicrotask(resolve) })
}

/** Let any pending frame callback run, then the observer batch it schedules. */
async function frame(): Promise<void> {
  await flush()
  await new Promise<void>(resolve => { requestAnimationFrame(() => { resolve() }) })
  await flush()
}

/** The observed card calls `choose`, so mirror the shipped effect: the clicked option is checked. */
function mountAnsweredQuestion() {
  const fixture = mountQuestionCard()
  for (const option of fixture.options) {
    option.addEventListener('click', () => {
      for (const other of fixture.options) other.setAttribute('aria-checked', String(other === option))
    })
  }
  return fixture
}

const disposers: (() => void)[] = []

/** Watch cards and apply the question default, recording every card the watcher reports. */
function watching() {
  const handled: string[] = []
  const dispose = watchCardDefaults({
    // The callback's result is load-bearing: `false` keeps the card pending for a retry.
    onCard: card => {
      handled.push(card.kind)
      return card.kind === 'question' ? selectQuestionDefault(card, document) : true
    },
  })
  disposers.push(dispose)
  return { handled }
}

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.()
  document.body.replaceChildren()
  document.body.focus()
})

describe('question default option', () => {
  it('selects the first option as soon as the card appears', async () => {
    watching()
    const fixture = mountAnsweredQuestion()
    await flush()
    expect(fixture.clicks).toEqual(['option-1'])
    expect(fixture.options[0]?.getAttribute('aria-checked')).toBe('true')
  })

  it('keeps the ring on the first option when the click re-renders the card', async () => {
    // Clicking an option changes the card's state, and that render can replace the option nodes,
    // taking the focus with them. The card then looks answered with no ring anywhere — the
    // regression this test pins down.
    const fixture = mountQuestionCard()
    for (const option of fixture.options) {
      option.addEventListener('click', () => {
        // Stand in for the shipped re-render: swap every option for a fresh node.
        for (const current of [...fixture.options]) {
          const fresh = current.cloneNode(true) as HTMLButtonElement
          current.replaceWith(fresh)
        }
        const live = [...fixture.card.querySelectorAll<HTMLButtonElement>('button[role="radio"]')]
        fixture.options.length = 0
        fixture.options.push(...live)
        fixture.options.forEach((node, index) => {
          node.addEventListener('click', () => { fixture.clicks.push(`option-${String(index + 1)}`) })
        })
      }, { once: true })
    }
    watching()
    await frame()
    expect(document.activeElement).toBe(fixture.options[0])
  })

  it('adopts a card that was already on screen when the watcher started', () => {
    const fixture = mountAnsweredQuestion()
    watching()
    expect(fixture.clicks).toEqual(['option-1'])
  })

  it('still defaults a card that mounts hidden and becomes visible a frame later', async () => {
    const fixture = mountAnsweredQuestion()
    fixture.card.style.display = 'none'
    const watch = watching()
    await flush()
    expect(fixture.clicks).toEqual([])
    expect(watch.handled).toEqual([])
    fixture.card.style.display = ''
    await frame()
    expect(fixture.clicks).toEqual(['option-1'])
    expect(watch.handled).toEqual(['question'])
  })

  it('defaults each card only once, so the user keeps their own choice', async () => {
    const fixture = mountAnsweredQuestion()
    watching()
    await flush()
    fixture.options[2]?.click()
    expect(fixture.clicks).toEqual(['option-1', 'option-3'])
    // An unrelated re-render of the same card must not select the first option again.
    fixture.card.append(document.createElement('span'))
    await frame()
    expect(fixture.clicks).toEqual(['option-1', 'option-3'])
  })

  it('is not retriggered by a footer status message', async () => {
    // The footer carries a live status line beside the pager ("Please complete this question
    // first.", a countdown, an error). Keying the handled card on the footer's whole text —
    // which the watcher used to do — read every such message as a page turn, and on a paged
    // card that meant re-running the default: the first option was clicked again over the
    // user's own answer, through the rollback.
    const fixture = mountQuestionCard(document.body, 'q1', 3)
    fixture.setPage(1, 3)
    for (const option of fixture.options) {
      option.addEventListener('click', () => {
        for (const other of fixture.options) other.setAttribute('aria-checked', String(other === option))
      })
    }
    watching()
    await flush()
    expect(fixture.clicks).toEqual(['option-1'])
    // The user picks a different option; the default must never come back for it.
    fixture.options[2]?.click()
    fixture.clicks.length = 0
    const status = fixture.card.querySelector('[role="status"]')
    status!.textContent = 'Please complete this question first.'
    await frame()
    expect(fixture.clicks).toEqual([])
    expect(fixture.options[2]?.getAttribute('aria-checked')).toBe('true')
  })

  it('never overwrites an answer the card already carries', async () => {
    const fixture = mountAnsweredQuestion()
    fixture.options[1]?.setAttribute('aria-checked', 'true')
    watching()
    await flush()
    expect(fixture.clicks).toEqual([])
  })

  it('never overwrites a prefilled free-text answer', async () => {
    const fixture = mountAnsweredQuestion()
    fixture.custom.value = 'my own answer'
    watching()
    await flush()
    expect(fixture.clicks).toEqual([])
  })

  it('leaves a card whose options are still locked alone', async () => {
    const fixture = mountAnsweredQuestion()
    for (const option of fixture.options) option.disabled = true
    watching()
    await flush()
    expect(fixture.clicks).toEqual([])
  })

  it('keeps a card waiting while a modal is open, then defaults it afterwards', async () => {
    const fixture = mountAnsweredQuestion()
    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)
    watching()
    await flush()
    expect(fixture.clicks).toEqual([])
    modal.remove()
    // Removing the dialog is the trigger that frees the deferred card.
    await frame()
    expect(fixture.clicks).toEqual(['option-1'])
  })

  it('still defaults when the card autofocuses its own answer field', async () => {
    // The shipped card autofocuses its free-text field when it opens (no countdown, not
    // locked). That focus is the card's own doing, not the user typing, and used to make the
    // default refuse to apply — which is why it worked on some cards and not others.
    const fixture = mountAnsweredQuestion()
    fixture.custom.focus()
    watching()
    await flush()
    expect(fixture.clicks).toEqual(['option-1'])
    // The ring moves to the option too, so the card opens showing what Enter would submit.
    expect(document.activeElement).toBe(fixture.options[0])
  })

  it('still defaults when focus sits on one of the card options', async () => {
    const fixture = mountAnsweredQuestion()
    fixture.options[2]?.focus()
    watching()
    await flush()
    expect(fixture.clicks).toEqual(['option-1'])
    expect(document.activeElement).toBe(fixture.options[0])
  })

  it('does not take a default while the user is typing', async () => {
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    const fixture = mountAnsweredQuestion()
    watching()
    await flush()
    expect(fixture.clicks).toEqual([])
    input.blur()
    fixture.card.append(document.createElement('span'))
    await frame()
    expect(fixture.clicks).toEqual(['option-1'])
  })

  it('ignores the approval card', async () => {
    const watch = watching()
    mountApprovalCard()
    await flush()
    expect(watch.handled).toEqual(['approval'])
  })

  it('stops watching once disposed', async () => {
    const dispose = watchCardDefaults({ onCard: card => { selectQuestionDefault(card, document) } })
    dispose()
    const fixture = mountAnsweredQuestion()
    await frame()
    expect(fixture.clicks).toEqual([])
  })

  it('reports an answered question through the card shape', () => {
    const fixture = mountQuestionCard()
    expect(questionAnswered(fixture.card)).toBe(false)
    fixture.options[2]?.setAttribute('aria-checked', 'true')
    expect(questionAnswered(fixture.card)).toBe(true)
  })
})

describe('multi-question cards answer and ring their first option', () => {
  it('reads the question count from the pager label', () => {
    expect(questionCount(mountQuestionCard(document.body, 'q1', 3).card)).toBe(3)
    expect(questionCount(mountQuestionCard(document.body, 'q2').card)).toBe(1)
  })

  it('selects and rings the first option without turning the page', async () => {
    // The card opens showing exactly what Enter would submit, like the single-question card. The
    // click must not leave the page: a plain click would make the shipped handler advance.
    const fixture = mountQuestionCard(document.body, 'q1', 3)
    fixture.setPage(1, 3)
    watching()
    await flush()
    expect(fixture.clicks).toContain('option-1')
    expect(fixture.page()).toBe(1)
    expect(document.activeElement).toBe(fixture.options[0])
  })

  it('answers and rings the first option of every following page too', async () => {
    const fixture = mountQuestionCard(document.body, 'q1', 3)
    fixture.setPage(1, 3)
    watching()
    await flush()

    fixture.options[1]?.focus()
    const pager = fixture.card.querySelector('footer span')
    if (pager !== null) pager.textContent = '2 / 3'
    fixture.card.append(document.createElement('span'))
    await frame()
    expect(fixture.page()).toBe(2)
    expect(document.activeElement).toBe(fixture.options[0])
  })

  it('still selects on a single-question card', async () => {
    const fixture = mountAnsweredQuestion()
    watching()
    await flush()
    expect(fixture.clicks).toEqual(['option-1'])
    expect(document.activeElement).toBe(fixture.options[0])
  })
})

describe('multi-select cards take the ring but no answer', () => {
  it('puts the ring on the first option without checking it', async () => {
    const fixture = mountQuestionCard(document.body, 'ms', 1, true)
    watching()
    await flush()
    expect(fixture.clicks).toEqual([])
    expect(fixture.options[0]?.getAttribute('aria-checked')).toBe('false')
    expect(document.activeElement).toBe(fixture.options[0])
  })

  it('leaves the ring alone while a user answer is in progress', async () => {
    const fixture = mountQuestionCard(document.body, 'ms2', 1, true)
    fixture.custom.value = 'typing my own'
    watching()
    await flush()
    expect(document.activeElement).not.toBe(fixture.options[0])
  })
})
