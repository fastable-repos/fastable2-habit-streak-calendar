import { test, expect, Page } from '@playwright/test'
import { captureScreenshot, assertNoConsoleErrors } from './helpers'

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function offsetDateStr(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Clear localStorage before navigating so each test starts fresh */
async function clearStorage(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

/** Create a habit via the UI and return */
async function createHabit(page: Page, name: string, color?: string) {
  await page.getByTestId('add-habit-btn').click()
  await page.getByTestId('habit-name-input').fill(name)
  if (color) {
    await page.getByTestId(`color-swatch-${color}`).click()
  }
  await page.getByTestId('save-habit-btn').click()
  // Wait for modal to close and tab to appear
  await expect(page.getByTestId(`habit-tab-${name}`)).toBeVisible()
}

/** Seed localStorage with N consecutive days of completions (ending today) */
async function seedStreakDays(page: Page, habitId: string, days: number) {
  await page.evaluate(
    ({ habitId, days }) => {
      const completions: Record<string, Record<string, boolean>> = JSON.parse(
        localStorage.getItem('hsc_completions') ?? '{}',
      )
      if (!completions[habitId]) completions[habitId] = {}
      const today = new Date()
      for (let i = 0; i < days; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const y = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        completions[habitId][`${y}-${mo}-${day}`] = true
      }
      localStorage.setItem('hsc_completions', JSON.stringify(completions))
    },
    { habitId, days },
  )
}

/** Get the habit ID from localStorage by name */
async function getHabitId(page: Page, name: string): Promise<string> {
  return page.evaluate(name => {
    const habits = JSON.parse(localStorage.getItem('hsc_habits') ?? '[]') as Array<{
      id: string
      name: string
    }>
    const h = habits.find(h => h.name === name)
    if (!h) throw new Error(`Habit "${name}" not found in localStorage`)
    return h.id
  }, name)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Habit Streak Calendar', () => {
  // ── 1. Happy path ──────────────────────────────────────────────────────────
  test('1. Happy path – create habit, mark day, verify persistence', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await clearStorage(page)

    // Empty state visible
    await expect(page.getByTestId('empty-state')).toBeVisible()
    await captureScreenshot(page, '4-empty-state')

    // Create habit via header button
    await page.getByTestId('add-habit-btn').click()
    await expect(page.getByTestId('habit-modal')).toBeVisible()

    await page.getByTestId('habit-name-input').fill('Exercise')
    await page.getByTestId('color-swatch-emerald').click()

    await captureScreenshot(page, '2-add-habit-modal')

    await page.getByTestId('save-habit-btn').click()

    // Habit appears in tab strip
    await expect(page.getByTestId('habit-tab-Exercise')).toBeVisible()
    await expect(page.getByTestId('month-year-header')).toBeVisible()

    // Click today's cell
    const today = todayStr()
    const todayCell = page.getByTestId(`day-cell-${today}`)
    await expect(todayCell).toBeVisible()
    await todayCell.click()

    // Streak counter should now show 1
    await expect(page.getByTestId('current-streak')).toHaveText('1')

    await captureScreenshot(page, '1-main-calendar-view')

    // Reload and verify persistence
    await page.reload()
    await expect(page.getByTestId('habit-tab-Exercise')).toBeVisible()
    await expect(page.getByTestId('current-streak')).toHaveText('1')

    // localStorage should contain our habit
    const habitsData = await page.evaluate(() => localStorage.getItem('hsc_habits'))
    expect(habitsData).toContain('Exercise')

    const completionsData = await page.evaluate(() => localStorage.getItem('hsc_completions'))
    expect(completionsData).toContain(today)

    await assertNoConsoleErrors(page)
    // Only check for truly unexpected errors (localStorage failures, etc.)
  })

  // ── 2. Streak calculation ──────────────────────────────────────────────────
  test('2. Streak calculation – 7-day streak then break it', async ({ page }) => {
    await clearStorage(page)
    await createHabit(page, 'Reading')

    const habitId = await getHabitId(page, 'Reading')

    // Seed 7 consecutive days including today
    await seedStreakDays(page, habitId, 7)
    await page.reload()

    await expect(page.getByTestId('habit-tab-Reading')).toBeVisible()

    // Streak should be 7
    await expect(page.getByTestId('current-streak')).toHaveText('7')

    // Unmark 3 days ago (breaking the streak)
    const threeDaysAgo = offsetDateStr(-3)

    // Navigate to that month if needed (e.g. if we crossed month boundary)
    const threeDate = new Date()
    threeDate.setDate(threeDate.getDate() - 3)
    const currentViewMonth = new Date()

    // If 3 days ago is in a different month, navigate back
    if (threeDate.getMonth() !== currentViewMonth.getMonth()) {
      await page.getByTestId('prev-month-btn').click()
    }

    const cell = page.getByTestId(`day-cell-${threeDaysAgo}`)
    await expect(cell).toBeVisible()
    await cell.click()

    // Streak should now be fewer than 7 (just today + days after the break)
    const streakText = await page.getByTestId('current-streak').textContent()
    const streak = parseInt(streakText ?? '0', 10)
    expect(streak).toBeLessThan(7)
    expect(streak).toBeGreaterThanOrEqual(0)
  })

  // ── 3. Milestone animation ─────────────────────────────────────────────────
  test('3. Milestone animation – 7-day streak triggers celebration', async ({ page }) => {
    await clearStorage(page)
    await createHabit(page, 'Meditation')

    const habitId = await getHabitId(page, 'Meditation')

    // Seed 6 days (not today) to be one short of 7
    await seedStreakDays(page, habitId, 7)
    // Remove today's completion so we can click it to trigger the milestone
    await page.evaluate(
      ({ habitId, today }) => {
        const completions = JSON.parse(localStorage.getItem('hsc_completions') ?? '{}')
        if (completions[habitId]) delete completions[habitId][today]
        localStorage.setItem('hsc_completions', JSON.stringify(completions))
      },
      { habitId, today: todayStr() },
    )

    await page.reload()
    await expect(page.getByTestId('habit-tab-Meditation')).toBeVisible()

    // Streak should be 6 (yesterday through 6 days ago)
    await expect(page.getByTestId('current-streak')).toHaveText('6')

    // Click today to make it 7
    const todayCell = page.getByTestId(`day-cell-${todayStr()}`)
    await todayCell.click()

    // Milestone overlay should appear
    await expect(page.getByTestId('milestone-overlay')).toBeVisible()
    await expect(page.getByTestId('milestone-text')).toContainText('7-Day Streak!')

    await captureScreenshot(page, '3-milestone-celebration')

    // Dismiss
    await page.getByTestId('milestone-dismiss-btn').click()
    await expect(page.getByTestId('milestone-overlay')).not.toBeVisible()
  })

  // ── 4. Month navigation ────────────────────────────────────────────────────
  test('4. Month navigation – previous/next month with data intact', async ({ page }) => {
    await clearStorage(page)
    await createHabit(page, 'Journaling')

    const habitId = await getHabitId(page, 'Journaling')

    // Mark today
    const today = todayStr()
    await page.getByTestId(`day-cell-${today}`).click()
    await expect(page.getByTestId('current-streak')).toHaveText('1')

    // Seed a day in the previous month
    const prevMonthDate = new Date()
    prevMonthDate.setDate(1) // go to 1st of this month
    prevMonthDate.setDate(prevMonthDate.getDate() - 1) // last day of prev month
    const prevMonthDateStr = [
      prevMonthDate.getFullYear(),
      String(prevMonthDate.getMonth() + 1).padStart(2, '0'),
      String(prevMonthDate.getDate()).padStart(2, '0'),
    ].join('-')

    await page.evaluate(
      ({ habitId, dateStr }) => {
        const completions = JSON.parse(localStorage.getItem('hsc_completions') ?? '{}')
        if (!completions[habitId]) completions[habitId] = {}
        completions[habitId][dateStr] = true
        localStorage.setItem('hsc_completions', JSON.stringify(completions))
      },
      { habitId, dateStr: prevMonthDateStr },
    )

    // Get current month header
    const currentHeader = await page.getByTestId('month-year-header').textContent()

    // Click previous month
    await page.getByTestId('prev-month-btn').click()

    // Header should be different now
    const prevHeader = await page.getByTestId('month-year-header').textContent()
    expect(prevHeader).not.toBe(currentHeader)

    // The cell in prev month should be marked (reload to get fresh data)
    await page.reload()
    await page.getByTestId('prev-month-btn').click()

    // Check that the previously seeded day is still visible as completed
    const prevCell = page.getByTestId(`day-cell-${prevMonthDateStr}`)
    await expect(prevCell).toBeVisible()
    const ariaPressed = await prevCell.getAttribute('aria-pressed')
    expect(ariaPressed).toBe('true')

    // Navigate back to current month
    await page.getByTestId('next-month-btn').click()
    const restoredHeader = await page.getByTestId('month-year-header').textContent()
    expect(restoredHeader).toBe(currentHeader)

    // Today's cell should still be marked
    const todayCell = page.getByTestId(`day-cell-${today}`)
    await expect(todayCell).toBeVisible()
    const todayPressed = await todayCell.getAttribute('aria-pressed')
    expect(todayPressed).toBe('true')
  })

  // ── 5. Multiple habits independence ────────────────────────────────────────
  test('5. Multiple habits – each tracks independently', async ({ page }) => {
    await clearStorage(page)

    // Create habit 1
    await createHabit(page, 'Running', 'emerald')
    const runningId = await getHabitId(page, 'Running')

    // Mark today for Running
    const today = todayStr()
    await page.getByTestId(`day-cell-${today}`).click()
    await expect(page.getByTestId('current-streak')).toHaveText('1')

    // Create habit 2
    await page.getByTestId('add-habit-btn').click()
    await page.getByTestId('habit-name-input').fill('Drawing')
    await page.getByTestId('color-swatch-violet').click()
    await page.getByTestId('save-habit-btn').click()
    await expect(page.getByTestId('habit-tab-Drawing')).toBeVisible()

    // Drawing should have 0 streak
    await expect(page.getByTestId('current-streak')).toHaveText('0')

    // Mark yesterday for Drawing
    const yesterday = offsetDateStr(-1)
    // Navigate to yesterday's month if needed
    const yesterdayDate = new Date()
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    if (yesterdayDate.getMonth() !== new Date().getMonth()) {
      await page.getByTestId('prev-month-btn').click()
    }
    await page.getByTestId(`day-cell-${yesterday}`).click()

    // Switch back to Running
    await page.getByTestId('habit-tab-Running').click()

    // Navigate back to current month if we went to prev
    if (yesterdayDate.getMonth() !== new Date().getMonth()) {
      await page.getByTestId('next-month-btn').click()
    }

    // Running should still show streak of 1
    await expect(page.getByTestId('current-streak')).toHaveText('1')

    // Today's cell for Running should be marked
    const todayCellRunning = page.getByTestId(`day-cell-${today}`)
    await expect(todayCellRunning.getAttribute('aria-pressed')).resolves.toBe('true')

    // Switch to Drawing
    await page.getByTestId('habit-tab-Drawing').click()

    // Drawing's today cell should NOT be marked
    if (yesterdayDate.getMonth() === new Date().getMonth()) {
      const todayCellDrawing = page.getByTestId(`day-cell-${today}`)
      await expect(todayCellDrawing.getAttribute('aria-pressed')).resolves.toBe('false')
    }

    // Verify Running's completions don't appear for Drawing via localStorage
    const completions = await page.evaluate(
      ({ runningId }) => {
        const c = JSON.parse(localStorage.getItem('hsc_completions') ?? '{}')
        return c[runningId] ?? {}
      },
      { runningId },
    )
    expect(Object.keys(completions)).toContain(today)
  })

  // ── 6. Empty state ─────────────────────────────────────────────────────────
  test('6. Empty state – fresh app shows onboarding with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await clearStorage(page)

    // Empty state should be visible
    await expect(page.getByTestId('empty-state')).toBeVisible()
    await expect(page.getByText('Start Your First Habit')).toBeVisible()
    await expect(page.getByTestId('add-habit-btn-empty')).toBeVisible()

    // No habits, no streak cards
    await expect(page.getByTestId('streak-card')).not.toBeVisible()

    // No JS errors
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0)
  })

  // ── 7. Delete habit ────────────────────────────────────────────────────────
  test('7. Delete habit – removes from UI and localStorage', async ({ page }) => {
    await clearStorage(page)
    await createHabit(page, 'Stretching')

    const habitId = await getHabitId(page, 'Stretching')

    // Mark today
    await page.getByTestId(`day-cell-${todayStr()}`).click()
    await expect(page.getByTestId('current-streak')).toHaveText('1')

    // Delete the habit
    await page.getByTestId('delete-habit-Stretching').click()

    // Habit should be gone from the tab strip
    await expect(page.getByTestId('habit-tab-Stretching')).not.toBeVisible()

    // Empty state should return
    await expect(page.getByTestId('empty-state')).toBeVisible()

    // localStorage should not contain the habit
    const habitsData = await page.evaluate(() => localStorage.getItem('hsc_habits'))
    expect(habitsData).not.toContain('Stretching')

    // Completions should not contain the habit's ID
    const completionsData = await page.evaluate(
      ({ habitId }) => {
        const c = JSON.parse(localStorage.getItem('hsc_completions') ?? '{}')
        return c[habitId]
      },
      { habitId },
    )
    expect(completionsData).toBeUndefined()
  })

  // ── 8. Data persistence across sessions ───────────────────────────────────
  test('8. Data persistence – habits and completions survive reload', async ({ page }) => {
    await clearStorage(page)
    await createHabit(page, 'Yoga', 'violet')

    const habitId = await getHabitId(page, 'Yoga')

    // Seed 3 days of completions
    await seedStreakDays(page, habitId, 3)
    await page.reload()

    // After reload, habit should still be there with streak
    await expect(page.getByTestId('habit-tab-Yoga')).toBeVisible()
    await expect(page.getByTestId('current-streak')).toHaveText('3')

    // The last 3 day cells should be marked
    for (let i = 0; i < 3; i++) {
      const ds = offsetDateStr(-i)
      const d = new Date()
      d.setDate(d.getDate() - i)
      // Only check days in the current month view
      if (d.getMonth() === new Date().getMonth()) {
        const cell = page.getByTestId(`day-cell-${ds}`)
        await expect(cell).toBeVisible()
        await expect(cell.getAttribute('aria-pressed')).resolves.toBe('true')
      }
    }

    // Navigate away and back
    await page.getByTestId('next-month-btn').click()
    await page.getByTestId('prev-month-btn').click()

    // Data should still be correct
    await expect(page.getByTestId('current-streak')).toHaveText('3')
    await expect(page.getByTestId('habit-tab-Yoga')).toBeVisible()
  })
})
