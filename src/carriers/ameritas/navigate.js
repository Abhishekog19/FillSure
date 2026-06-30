'use strict';
/**
 * carriers/ameritas/navigate.js
 * ─────────────────────────────────────────────────────────────────────────
 * Ameritas provider portal navigation script.
 *
 * ── CONFIRMED SELECTORS (verified via live portal inspection, June 2026) ──
 *
 * Login page: https://service.ameritas.com/service/login.asp
 *   - User ID field : id="ontUser",  name="ontUser"
 *   - Password field: id="ontPassword", name="ontPassword"
 *   - Sign In button: id="Submit", value="Login"
 *   - Form action   : https://service.ameritas.com/ea/ds-wac-iis.dll
 *
 * OTP page (appears after login on unrecognised device):
 *   - Heading text  : "Your one-time passcode"
 *   - OTP input     : placeholder="One-Time Passcode" (selector TBC on OTP page)
 *   - Remember ckbox: label text "Remember this device for 30 days"
 *   - Submit button : text "Next"
 *
 * ── Session / OTP flow ────────────────────────────────────────────────────
 * Setup mode (first run, or every 30 days):
 *   - npm run setup  → opens visible browser
 *   - Script fills User ID + Password automatically
 *   - OTP page appears → script auto-checks "Remember this device for 30 days"
 *   - Script PAUSES and asks operator to enter the 6-digit code + click Next
 *   - Script detects dashboard → session saved to .sessions/ameritas/
 *   - Next 30 days: fully automated (no OTP)
 *
 * Daily mode (default, headless):
 *   - Loads saved cookies → portal skips login entirely
 *   - If OTP page detected → throws AMERITAS_OTP_REQUIRED error
 *   - Operator runs npm run setup (~2 min) to reset the 30-day window
 */

require('dotenv').config();
const { logger } = require('../../utils/logger');
const { humanDelay, humanType, humanClick, humanScroll, interPatientPause } = require('../../utils/humanDelay');
const { getCredentials } = require('../../utils/credentials');
const { getAmeritasContext } = require('./session');
const { downloadBenefitsPdf } = require('./downloadPdf');

// ── Portal URLs (confirmed via live inspection) ──────────────────────────────
// Note: www.ameritas.com/service/login.asp redirects to service.ameritas.com
const LOGIN_URL = process.env.AMERITAS_LOGIN_URL || 'https://service.ameritas.com/service/login.asp';

// ── Selectors ───────────────────────────────────────────────────────────────
const SELECTORS = {
  // ── LOGIN PAGE (✅ confirmed via live portal inspection) ────────────────
  userIdField:      '#ontUser',            // input name="ontUser", id="ontUser"
  passwordField:    '#ontPassword',        // input name="ontPassword", id="ontPassword"
  loginButton:      '#Submit',             // input id="Submit" value="Login"

  // ── OTP PAGE (✅ confirmed from user screenshots) ────────────────────────
  // Appears after login when device is not yet remembered
  otpHeading:       'h1, h2, h3',         // heading text: "Your one-time passcode"
  otpField:         'input[placeholder="One-Time Passcode"], input[type="text"], input[type="number"]',
  rememberDevice:   'input[type="checkbox"]', // "Remember this device for 30 days" checkbox
  otpSubmit:        'input[value="Next"], button:text("Next")', // "Next" submit button

  // ── DASHBOARD — used to detect successful login ─────────────────────────
  // [VERIFY] — inspect the page after login to confirm dashboard element
  dashboard:        '.dashboard, #dashboard, .welcome, .home-container, .provider-home, main',

  // ── ELIGIBILITY / BENEFITS SEARCH ──────────────────────────────────────
  // [VERIFY] — inspect post-login navigation to find correct selectors
  eligibilityNav:   'a[href*="eligib"], a[href*="benefit"], a:text("Eligibility"), a:text("Benefits")',
  memberIdField:    'input[name*="member"], input[name*="Member"], input[name*="id"], #member-id',
  dobField:         'input[name*="dob"], input[name*="birth"], input[name*="DOB"], #date-of-birth',
  searchButton:     'input[type="submit"], button:text("Search"), button[type="submit"]',

  // ── RESULTS ─────────────────────────────────────────────────────────────
  // [VERIFY]
  firstResult:      'table tbody tr:first-child td a, .member-result:first-child, .result-row:first-child',

  // ── PDF DOWNLOAD ─────────────────────────────────────────────────────────
  // [VERIFY] — inspect the benefits detail page to find the download button
  downloadButton:   'a[href$=".pdf"], a:text("Download"), button:text("Download"), a:text("Print"), input[value="Download"]',
};

// ── OTP detection timeout (how long to wait for operator in setup mode) ─────
const OTP_WAIT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

// ────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point.
 * Logs into the Ameritas portal ONCE and processes all patients in a single
 * session (session batching — mirrors how a real billing specialist works).
 *
 * @param {PatientRow[]} patients    Patients with carrier === 'ameritas'
 * @param {object}       options
 * @param {boolean}      options.setupMode  true = visible browser, wait for OTP
 * @returns {ProcessingResult[]}
 */
async function processAmeritasPatients(patients, { setupMode = false } = {}) {
  const isHeadful = setupMode || process.env.DEBUG_HEADFUL === 'true';

  logger.info('Ameritas session starting', {
    patientCount: patients.length,
    mode: setupMode ? 'SETUP' : 'DAILY',
  });

  // In setup mode with no patients, we still need to complete the login flow
  const context = await getAmeritasContext(!isHeadful);
  const page = await context.newPage();

  const results = [];

  try {
    // ── STEP 1: Navigate to login page ──────────────────────────────────
    logger.info('Navigating to Ameritas portal', { url: LOGIN_URL });
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await humanDelay(1000, 2000);

    // ── STEP 2: Check if already logged in (session cookie still valid) ──
    const alreadyLoggedIn = await isOnDashboard(page);

    if (alreadyLoggedIn) {
      logger.info('Session cookie valid — skipping login entirely');
    } else {
      // ── STEP 3: Perform login ──────────────────────────────────────────
      await performLogin(page, setupMode);
    }

    // If setup mode with no real patients, we're done
    if (setupMode && patients.length === 0) {
      logger.info('Setup mode complete — session saved to disk');
      return [];
    }

    // ── STEP 4: Process each patient in the same session ─────────────────
    for (let i = 0; i < patients.length; i++) {
      const patient = patients[i];

      logger.info('Processing patient', {
        index: i + 1,
        total: patients.length,
        carrier: 'ameritas',
        // NO patient name, DOB, or Member ID in logs (HIPAA)
      });

      try {
        const pdfBuffer = await processOnePatient(page, patient);
        results.push({ patient, pdfBuffer, success: true });
        logger.info('Patient processed successfully', { index: i + 1 });

      } catch (err) {
        logger.error('Patient processing failed', {
          index: i + 1,
          error: err.message,
          // No PHI in error log
        });
        results.push({ patient, pdfBuffer: null, success: false, error: err.message });
      }

      // ── Human-mimicry pause between patients ──────────────────────────
      if (i < patients.length - 1) {
        await interPatientPause(i);
      }
    }

    logger.info('Ameritas session complete', {
      total: patients.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });

    return results;

  } finally {
    // Closing the context saves all cookies/localStorage to disk
    await context.close();
    logger.info('Browser context closed — session state persisted to disk');
  }
}

// ── Internal: Login flow ─────────────────────────────────────────────────────

async function performLogin(page, setupMode) {
  const creds = await getCredentials('ameritas');
  logger.info('Performing Ameritas login');

  // Scroll first (human behaviour)
  await humanScroll(page, 50, 150);

  // Enter User ID and Password with human typing speed
  await humanType(page, SELECTORS.userIdField, creds.username);
  await humanDelay(400, 900);
  await humanType(page, SELECTORS.passwordField, creds.password);
  await humanDelay(600, 1200);

  // Click Sign In
  const loginBtn = page.locator(SELECTORS.loginButton).first();
  await humanClick(page, loginBtn);
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
  await humanDelay(1000, 2000);

  // ── Check for OTP page ──────────────────────────────────────────────────
  // Detection: look for the OTP input field OR the heading text
  const otpFieldVisible = await page.locator(SELECTORS.otpField).first().isVisible().catch(() => false);
  const otpHeadingText  = await page.locator(SELECTORS.otpHeading).first().textContent().catch(() => '');
  const otpPresent = otpFieldVisible || (otpHeadingText || '').toLowerCase().includes('one-time');

  if (otpPresent) {
    await handleOtp(page, setupMode);
  }

  // Confirm we're on the dashboard
  const loggedIn = await isOnDashboard(page);
  if (!loggedIn) {
    throw new Error(
      'Ameritas login failed — did not reach dashboard after login attempt. ' +
      'Check credentials in .env and verify portal URL.'
    );
  }

  logger.info('Ameritas login successful');
}

// ── Internal: OTP handling ───────────────────────────────────────────────────

async function handleOtp(page, setupMode) {
  if (!setupMode) {
    // Automated daily mode — OTP is unexpected, means the 30-day cookie expired
    const msg =
      '\n╔══════════════════════════════════════════════════════════╗\n' +
      '║  AMERITAS SESSION EXPIRED — OTP REQUIRED                 ║\n' +
      '║                                                          ║\n' +
      '║  The 30-day "remember this device" cookie has expired.   ║\n' +
      '║  Run setup mode to renew it (~2 minutes):                ║\n' +
      '║                                                          ║\n' +
      '║    npm run setup                                         ║\n' +
      '║    (or: node src/main.js --setup-ameritas)               ║\n' +
      '║                                                          ║\n' +
      '║  After setup, the daily job will run without OTP for     ║\n' +
      '║  the next 30 days.                                       ║\n' +
      '╚══════════════════════════════════════════════════════════╝\n';

    console.error(msg);
    throw new Error('AMERITAS_OTP_REQUIRED — Run: npm run setup');
  }

  // ── Setup mode: auto-check remember-device, then wait for operator code ──

  // 1. Automatically check "Remember this device for 30 days" before prompting
  //    the operator — so they don't have to remember to tick it.
  try {
    const rememberCheckbox = page.locator(SELECTORS.rememberDevice).first();
    const isChecked = await rememberCheckbox.isChecked().catch(() => false);
    if (!isChecked) {
      await rememberCheckbox.check();
      logger.info('Auto-checked "Remember this device for 30 days" checkbox');
    } else {
      logger.info('Remember-device checkbox was already checked');
    }
  } catch (e) {
    // Non-fatal — operator can check it manually
    logger.warn('Could not auto-check remember-device checkbox', { error: e.message });
  }

  // 2. Prompt operator — ONLY task is to type the 6-digit code and click Next
  console.log('\n');
  console.log('🔐  OTP REQUIRED — BROWSER WINDOW IS OPEN');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  ✅  "Remember this device for 30 days" has been auto-checked.');
  console.log('  ');
  console.log('  Your ONLY task:');
  console.log('  1. Look at the browser window that just opened');
  console.log('  2. Type the 6-digit OTP code sent to your email');
  console.log('  3. Click the "Next" button');
  console.log('  ');
  console.log('  That is it. After this, the system runs automatically');
  console.log('  for the next 30 days with NO further OTP prompts.');
  console.log('  ');
  console.log('  ⏳ Waiting up to 3 minutes...');
  console.log('════════════════════════════════════════════════════════════\n');

  logger.info('Waiting for operator to enter OTP code in browser window');

  // 3. Wait until OTP page is gone (operator submitted the code)
  //    We detect this by waiting for the OTP field to disappear OR
  //    for the URL to change away from the OTP page
  const otpStartUrl = page.url();
  try {
    await Promise.race([
      // Option A: OTP input field disappears (form submitted)
      page.waitForSelector(SELECTORS.otpField, {
        state: 'hidden',
        timeout: OTP_WAIT_TIMEOUT_MS,
      }),
      // Option B: URL changes (redirected to dashboard)
      page.waitForURL(
        url => url.href !== otpStartUrl,
        { timeout: OTP_WAIT_TIMEOUT_MS }
      ),
    ]);
  } catch {
    throw new Error(
      'OTP entry timed out after 3 minutes. ' +
      'Please run setup mode again: npm run setup'
    );
  }

  // Brief wait for full redirect/dashboard load
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await humanDelay(1000, 2000);

  console.log('\n✅  OTP accepted! Session saved.');
  console.log('   Daily jobs will run without OTP for the next 30 days.');
  console.log('   You will only need to do this again around:', getExpiryDate(), '\n');
  logger.info('OTP setup complete — 30-day session saved to disk');
}

// ── Internal: Single patient workflow ───────────────────────────────────────

async function processOnePatient(page, patient) {
  // ── Navigate to Eligibility search ──────────────────────────────────────
  await humanScroll(page);
  const eligibilityLink = page.locator(SELECTORS.eligibilityNav).first();
  await humanClick(page, eligibilityLink);
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  await humanDelay(1000, 2500);

  // ── Enter Member ID and Date of Birth ───────────────────────────────────
  await humanScroll(page);
  await humanType(page, SELECTORS.memberIdField, patient.memberId);
  await humanDelay(400, 900);
  await humanType(page, SELECTORS.dobField, patient.patientDOB);
  await humanDelay(600, 1200);

  // ── Submit search ────────────────────────────────────────────────────────
  const searchBtn = page.locator(SELECTORS.searchButton).first();
  await humanClick(page, searchBtn);
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  await humanDelay(1500, 3000);

  // ── Click into the matching result ───────────────────────────────────────
  const firstResult = page.locator(SELECTORS.firstResult).first();
  const resultExists = await firstResult.isVisible().catch(() => false);

  if (!resultExists) {
    throw new Error(
      `No eligibility result found. ` +
      `Verify Member ID and DOB are correct for this patient.`
      // No PHI included in the error message
    );
  }

  await humanClick(page, firstResult);
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  await humanDelay(1500, 3000);

  // ── Download the benefits PDF ─────────────────────────────────────────────
  const pdfBuffer = await downloadBenefitsPdf(page, SELECTORS.downloadButton);
  return pdfBuffer;
}

// ── Internal: Dashboard detection ───────────────────────────────────────────

async function isOnDashboard(page) {
  return page.locator(SELECTORS.dashboard).first().isVisible().catch(() => false);
}

// ── Internal: Expiry date helper ─────────────────────────────────────────────
// Tells the operator exactly when they'll need to redo OTP setup (~30 days)

function getExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

module.exports = { processAmeritasPatients };
