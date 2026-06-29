'use strict';
/**
 * carriers/ameritas/session.js
 * ─────────────────────────────────────────────────────────────────────────
 * Persistent browser context manager for the Ameritas provider portal.
 *
 * WHY PERSISTENT CONTEXT:
 * The Ameritas portal requires OTP (One-Time Password) on every new browser.
 * However, it offers a "Remember this device for 30 days" mechanism.
 * By using Playwright's launchPersistentContext(), the browser's cookies and
 * localStorage are saved to disk between runs. The 30-day remember-device
 * cookie persists across daily runs — no OTP for the next 30 days.
 *
 * SECURITY:
 * The .sessions/ameritas/ folder contains authentication cookies that grant
 * full access to the Ameritas portal (which contains PHI). It must:
 *   1. Be in .gitignore (never committed to source control)
 *   2. Be stored on an encrypted volume in production
 *   3. Have restricted file system permissions (700)
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Use playwright-extra with stealth plugin for all browser launches
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
chromium.use(stealth());

// Session storage directory — one folder per carrier
const SESSION_DIR = path.join(__dirname, '../../../.sessions/ameritas');

// ── Realistic browser fingerprint ──────────────────────────────────────────
// Default Playwright fingerprint is widely recognised by portal security systems.
// These values mimic a real Windows 10 user on Chrome.
const BROWSER_CONFIG = {
  userAgent:    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  viewport:     { width: 1440, height: 900 },
  locale:       'en-US',
  timezoneId:   'America/Chicago', // Common timezone for dental practices
  acceptDownloads: true,
};

/**
 * Returns a persistent browser context for the Ameritas portal.
 *
 * If the .sessions/ameritas/ directory already contains cookies from a
 * previous run (within the 30-day window), the browser will load those
 * cookies and the portal will skip OTP entirely.
 *
 * @param {boolean} headless  false = visible window (for setup / OTP entry)
 *                            true  = headless (for automated daily runs)
 * @returns {import('playwright').BrowserContext}
 */
async function getAmeritasContext(headless = true) {
  // Ensure session directory exists (Playwright requires it to exist)
  fs.mkdirSync(SESSION_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless,
    ...BROWSER_CONFIG,
    // Extra args to reduce detectability
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  return context;
}

/**
 * Deletes the saved session (forces OTP on next run).
 * Use this if you suspect the session is corrupted or the portal blocked it.
 */
function clearAmeritasSession() {
  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

/**
 * Returns true if a session directory exists and has content.
 * A non-empty session directory LIKELY means we have a saved cookie
 * (though we can't guarantee it's still valid until we try to use it).
 */
function sessionExists() {
  if (!fs.existsSync(SESSION_DIR)) return false;
  const files = fs.readdirSync(SESSION_DIR);
  return files.length > 0;
}

module.exports = { getAmeritasContext, clearAmeritasSession, sessionExists, SESSION_DIR };
