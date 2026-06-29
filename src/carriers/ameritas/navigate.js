'use strict';
/**
 * carriers/ameritas/navigate.js
 * ─────────────────────────────────────────────────────────────────────────
 * Ameritas provider portal navigation script.
 *
 * IMPORTANT — SELECTORS NEED VERIFICATION:
 * The CSS selectors in this file (marked with [VERIFY]) must be confirmed
 * by manually walking through the Ameritas portal before this script runs
 * against real patient data. The portal URL and field names below are
 * best-effort based on common Ameritas portal patterns.
 *
 * HOW TO VERIFY:
 *   1. Open the Ameritas provider portal in Chrome
 *   2. Right-click each field → Inspect
 *   3. Note the `id`, `name`, or `data-*` attribute
 *   4. Update the selectors in SELECTORS below
 *
 * Tested against: ameritas.com provider portal (June 2026)
 *
 * ── Session / OTP flow ────────────────────────────────────────────────────
 * Daily mode (default):
 *   - Uses persistent context with saved cookies
 *   - If portal skips login → go straight to patient processing
 *   - If portal shows login → enter credentials automatically
 *   - If portal shows OTP → STOP. Print clear error. Tell operator to
 *     run --setup-ameritas.
 *
 * Setup mode (--setup-ameritas):
 *   - Opens a VISIBLE browser window
 *   - Enters credentials automatically
 *   - WAITS for the operator to enter OTP and check "Remember this device"
 *   - Detects when OTP is done (dashboard appears)
 *   - Saves session to disk → next 30 days will be OTP-free
 */

require('dotenv').config();
const { logger } = require('../../utils/logger');
const { humanDelay, humanType, humanClick, humanScroll, interPatientPause } = require('../../utils/humanDelay');
const { getCredentials } = require('../../utils/credentials');
const { getAmeritasContext } = require('./session');
const { downloadBenefitsPdf } = require('./downloadPdf');

// ── Portal URLs ─────────────────────────────────────────────────────────────
const LOGIN_URL = process.env.AMERITAS_LOGIN_URL || 'https://provider.ameritasgroup.com';

// ── Selectors ───────────────────────────────────────────────────────────────
// [VERIFY] — Confirm every selector by inspecting the live Ameritas portal
const SELECTORS = {
  // Login page
  usernameField:    '#username, input[name="username"], input[type="text"]',          // [VERIFY]
  passwordField:    '#password, input[name="password"], input[type="password"]',      // [VERIFY]
  loginButton:      'button[type="submit"], #login-btn, button:text("Sign In")',      // [VERIFY]

  // OTP page — present when portal doesn't recognise the device
  otpField:         'input[name="otp"], input[name="code"], #otp-input, input[name="verificationCode"]', // [VERIFY]
  rememberDevice:   'input[type="checkbox"][name*="remember"], label:text("Remember")', // [VERIFY]
  otpSubmit:        'button[type="submit"], button:text("Verify"), button:text("Continue")', // [VERIFY]

  // Dashboard — used to detect successful login
  dashboard:        '#provider-dashboard, .dashboard-nav, nav.main-nav, .provider-home', // [VERIFY]

  // Eligibility / Benefits search
  eligibilityNav:   'a[href*="eligibility"], a:text("Eligibility"), nav >> text=Eligibility', // [VERIFY]
  memberIdField:    'input[name="memberId"], input[name="memberID"], #member-id',      // [VERIFY]
  dobField:         'input[name="dob"], input[name="dateOfBirth"], #date-of-birth',    // [VERIFY]
  searchButton:     'button:text("Search"), button[type="submit"]',                    // [VERIFY]

  // Results
  firstResult:      'table.results tbody tr:first-child, .member-result:first-child, .eligibility-result:first-child', // [VERIFY]

  // PDF download button on the benefits/eligibility detail page
  downloadButton:   'a:text("Download"), button:text("Download"), a:text("Print"), a[href$=".pdf"], .download-benefits, button:text("Export")', // [VERIFY]
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

  // Enter credentials
  await humanType(page, SELECTORS.usernameField, creds.username);
  await humanDelay(400, 900);
  await humanType(page, SELECTORS.passwordField, creds.password);
  await humanDelay(600, 1200);

  // Click login
  const loginBtn = page.locator(SELECTORS.loginButton).first();
  await humanClick(page, loginBtn);
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
  await humanDelay(1000, 2000);

  // ── Check for OTP page ──────────────────────────────────────────────────
  const otpPresent = await page.locator(SELECTORS.otpField).first().isVisible().catch(() => false);

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

  // ── Setup mode: operator enters OTP in the visible browser window ─────
  console.log('\n');
  console.log('🔐  OTP REQUIRED — PLEASE COMPLETE IN THE BROWSER WINDOW');
  console.log('──────────────────────────────────────────────────────────');
  console.log('  1. Enter the OTP code sent to your email / phone');
  console.log('  2. Check the "Remember this device" / "Keep me logged in" box');
  console.log('  3. Click Submit / Verify / Continue in the browser');
  console.log('  ⏳ Waiting up to 3 minutes for you to complete this step...');
  console.log('──────────────────────────────────────────────────────────\n');

  logger.info('Waiting for operator to complete OTP in browser window');

  // Wait until the OTP page disappears (operator completed it)
  try {
    await page.waitForSelector(SELECTORS.dashboard, {
      timeout: OTP_WAIT_TIMEOUT_MS,
      state: 'visible',
    });
  } catch {
    throw new Error(
      'OTP entry timed out after 3 minutes. ' +
      'Please run setup mode again: npm run setup'
    );
  }

  console.log('\n✅  OTP completed successfully!');
  console.log('   Session saved. Daily jobs will run without OTP for ~30 days.\n');
  logger.info('OTP setup complete — session state will be saved to disk on context close');
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

module.exports = { processAmeritasPatients };
