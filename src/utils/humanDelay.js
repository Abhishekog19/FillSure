'use strict';
/**
 * utils/humanDelay.js
 * ─────────────────────────────────────────────────────────────────────────
 * Human-behaviour simulation utilities.
 *
 * Insurance portals actively monitor request patterns to detect automation.
 * Every interaction must look like a human billing specialist working through
 * their morning queue — not a bot hammering an API.
 */

const { logger } = require('./logger');

/**
 * Waits a random number of milliseconds between minMs and maxMs.
 * Returns the actual delay used (useful for logging without PHI).
 */
async function humanDelay(minMs, maxMs) {
  // In DEBUG_FAST_MODE, skip long delays entirely so tests run faster
  if (process.env.DEBUG_FAST_MODE === 'true') {
    const fastMs = Math.min(minMs, 500);
    await sleep(fastMs);
    return fastMs;
  }
  const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await sleep(delayMs);
  return delayMs;
}

/**
 * Types text into a Playwright input field with human-speed random delays
 * between each keystroke (40–120ms per character).
 *
 * Using page.fill() would inject text instantly — that's a bot fingerprint.
 * Real humans type at 40–120ms per keystroke with natural variance.
 */
async function humanType(page, selector, text) {
  // Click the field first (human always clicks before typing)
  await page.click(selector);
  await humanDelay(150, 400);

  for (const char of text) {
    await page.keyboard.type(char, { delay: 0 });
    // Random keystroke delay: 40–120ms
    const keystrokeMs = 40 + Math.floor(Math.random() * 80);
    await sleep(keystrokeMs);
  }
}

/**
 * Moves the mouse to an element's centre with a slight random offset,
 * using multiple intermediate steps to simulate natural cursor movement.
 * Then clicks.
 */
async function humanClick(page, locator) {
  const box = await locator.boundingBox();
  if (!box) {
    // Fall back to standard click if element has no bounding box
    await locator.click();
    return;
  }

  // Target: centre of element ± small random offset
  const targetX = box.x + box.width / 2 + (Math.random() * 8 - 4);
  const targetY = box.y + box.height / 2 + (Math.random() * 6 - 3);

  // Move in 8–14 steps (simulates cursor path, not instant teleport)
  const steps = 8 + Math.floor(Math.random() * 6);
  await page.mouse.move(targetX, targetY, { steps });

  // Brief pause after hover (human reads button label before clicking)
  await sleep(80 + Math.floor(Math.random() * 120));
  await page.mouse.click(targetX, targetY);
}

/**
 * Scrolls the page by a random amount (100–400px) before interacting.
 * Instant interaction with no scrolling is a well-known bot pattern.
 */
async function humanScroll(page, minPx = 100, maxPx = 400) {
  const scrollPx = minPx + Math.floor(Math.random() * (maxPx - minPx));
  await page.mouse.wheel(0, scrollPx);
  await humanDelay(300, 700);
}

/**
 * Pause between patients.
 * - 85% chance: standard 25–75 second pause (billing specialist checking work)
 * - 15% chance: long 2–4 minute pause (phone call, bathroom, distraction)
 *
 * Configurable via .env:
 *   DELAY_MIN_MS, DELAY_MAX_MS, LONG_PAUSE_CHANCE,
 *   LONG_PAUSE_MIN_MS, LONG_PAUSE_MAX_MS
 */
async function interPatientPause(patientIndex) {
  const longPauseChance = parseFloat(process.env.LONG_PAUSE_CHANCE || '0.15');
  const isLongPause = Math.random() < longPauseChance;

  const minMs = isLongPause
    ? parseInt(process.env.LONG_PAUSE_MIN_MS || '120000', 10)
    : parseInt(process.env.DELAY_MIN_MS || '25000', 10);

  const maxMs = isLongPause
    ? parseInt(process.env.LONG_PAUSE_MAX_MS || '240000', 10)
    : parseInt(process.env.DELAY_MAX_MS || '75000', 10);

  const actualMs = await humanDelay(minMs, maxMs);

  logger.info('Inter-patient pause', {
    afterPatientIndex: patientIndex,
    pauseType: isLongPause ? 'long' : 'standard',
    pauseSeconds: Math.round(actualMs / 1000),
  });
}

// ── Internal helpers ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { humanDelay, humanType, humanClick, humanScroll, interPatientPause };
