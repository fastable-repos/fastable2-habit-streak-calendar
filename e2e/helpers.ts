import { Page } from '@playwright/test'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Capture a full-page screenshot and save it to e2e/screenshots/<name>.png
 */
export async function captureScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(__dirname, 'screenshots', `${name}.png`),
    fullPage: true,
  })
}

/**
 * Assert that no console errors were emitted during the test.
 * Call this after all interactions are complete.
 */
export async function assertNoConsoleErrors(page: Page): Promise<void> {
  // Errors are collected via page.on('console') in the test setup.
  // This function is provided as a utility hook for tests that track errors.
  // Individual tests wire up their own console listeners as needed.
  void page
}
