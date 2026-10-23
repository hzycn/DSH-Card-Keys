// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { pageIndexOf, previousButton, selectWithoutPaging } from '../src/client/keyboard/paging.js'
import { mountQuestionCard } from './card-fixture.js'

/** Let a queued microtask (the rollback) run. */
async function flush(): Promise<void> {
  await new Promise<void>(resolve => { queueMicrotask(resolve) })
}

afterEach(() => { document.body.replaceChildren() })

/**
 * A pager that behaves like the shipped card: picking an option advances the page by itself.
 *
 * This mirrors `choose`'s `index + 1` branch, which is the whole reason the guard exists.
 */
function mountPagedCard(total: number) {
  const fixture = mountQuestionCard(document.body, 'q1', total)
  fixture.setPage(1, total)
  // Mirror the shipped advance: choosing on a single-select page turns to the next one.
  for (const option of fixture.options) {
    option.addEventListener('click', () => {
      const index = fixture.page() ?? 1
      if (index < total) fixture.setPage(index + 1, total)
    })
  }
  // The previous button walks back, exactly as `replaceProgress(index - 1, drafts)` does.
  fixture.previous.addEventListener('click', () => {
    const index = fixture.page() ?? 1
    if (index > 1) fixture.setPage(index - 1, total)
  })
  return fixture
}

describe('pager reading', () => {
  it('reads the page index of a multi-question card', () => {
    const fixture = mountPagedCard(3)
    expect(pageIndexOf(fixture.card)).toBe(1)
    fixture.setPage(2, 3)
    expect(pageIndexOf(fixture.card)).toBe(2)
  })

  it('reports no pager for a single-question card', () => {
    const fixture = mountQuestionCard()
    expect(pageIndexOf(fixture.card)).toBeNull()
  })

  it('finds the previous button from the progress label position', () => {
    const fixture = mountPagedCard(3)
    expect(previousButton(fixture.card)).toBe(fixture.previous)
  })
})

describe('selecting without paging', () => {
  it('puts the page back after the shipped card advances on an arrow selection', async () => {
    const fixture = mountPagedCard(3)
    const rolled = selectWithoutPaging(fixture.card, fixture.options[0]!)
    expect(rolled).toBe(true)
    // The selection itself happened, and the card advanced...
    expect(fixture.clicks).toEqual(['option-1'])
    // ...then the guard walked the pager back so the user stays on this question.
    await flush()
    expect(fixture.clicks).toEqual(['option-1', 'previous'])
    expect(fixture.page()).toBe(1)
  })

  it('keeps the ring on the chosen option after the rollback re-renders the page', async () => {
    // The rollback clicks the previous button, which in the real card re-renders the page: the
    // option nodes are replaced and focus would otherwise jump to the pager. The next `↓` would
    // then restart from the footer, looking like the arrows had stopped working.
    const fixture = mountPagedCard(3)
    fixture.options[0]!.focus()
    selectWithoutPaging(fixture.card, fixture.options[0]!)
    await flush()
    await flush()
    expect(document.activeElement).toBe(fixture.options[0])
  })

  it('lands the ring on the same option position the user arrowed to', async () => {
    const fixture = mountPagedCard(3)
    fixture.options[2]!.focus()
    selectWithoutPaging(fixture.card, fixture.options[2]!)
    await flush()
    await flush()
    expect(document.activeElement).toBe(fixture.options[2])
  })

  it('leaves a single-question card alone', async () => {
    const fixture = mountQuestionCard()
    const rolled = selectWithoutPaging(fixture.card, fixture.options[0]!)
    expect(rolled).toBe(false)
    await flush()
    expect(fixture.clicks).toEqual(['option-1'])
  })

  it('does not click previous when the page never moved', async () => {
    // The card sits on its last page, so the shipped handler has nowhere to advance to.
    const fixture = mountPagedCard(3)
    fixture.setPage(3, 3)
    selectWithoutPaging(fixture.card, fixture.options[0]!)
    await flush()
    expect(fixture.clicks).toEqual(['option-1'])
    expect(fixture.page()).toBe(3)
  })
})
