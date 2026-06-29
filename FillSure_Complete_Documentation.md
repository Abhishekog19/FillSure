# FillSure — Dental Insurance Verification Automation System
## Complete Product Documentation & Implementation Guide
**Version 1.1 | June 2026 | Confidential**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Web Automation Layer (Playwright)](#4-web-automation-layer-playwright)
5. [AI Vision Extraction Layer (Claude API)](#5-ai-vision-extraction-layer-claude-api)
6. [Portal Navigation Flow](#6-portal-navigation-flow)
7. [Ameritas MVP — Full Implementation Plan](#7-ameritas-mvp--full-implementation-plan)
8. [HIPAA Compliance](#8-hipaa-compliance)
9. [Performance & Scaling](#9-performance--scaling)
10. [Output Form — Wisdom Full Insurance Breakdown](#10-output-form--wisdom-full-insurance-breakdown)
11. [Supported Insurance Portals](#11-supported-insurance-portals)
12. [Build Plan — Recommended Development Order](#12-build-plan--recommended-development-order)
13. [Technology Stack](#13-technology-stack)
14. [Key Design Decisions Log](#14-key-design-decisions-log)
15. [Risks & Mitigations](#15-risks--mitigations)
16. [Future Carrier Roadmap](#16-future-carrier-roadmap)
17. [Glossary](#17-glossary)

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Revenue per form | **$3.00** |
| Forms per day target | **200+** |
| Cost per form (API) | **~$0.03** |
| Gross margin on API cost | **~97%** |

Dental billing specialists today spend **5–10 minutes** manually filling a dental insurance verification form for each patient. They log into an insurance portal (CIGNA, Aetna, Delta Dental, United, etc.), search for the patient by Member ID, navigate through multiple pages, expand dropdowns, and transcribe data onto a standardised form — such as the **Wisdom Full Insurance Breakdown form**. At $3 per form and a manual cap of 10–20 forms per day per person, income is tightly capped.

**FillSure automates the entire workflow end-to-end.** The operator uploads the dental practice's daily patient sheet (Excel), the system logs into each insurance portal once per session, navigates to each patient's benefits page, expands all data sections, screenshots only the relevant content (or downloads a PDF where available), sends those screenshots to the Claude Vision AI for structured data extraction, fills the output form, and delivers completed forms — all with minimal human involvement.

### Key Business Impact

| | Human Specialist | FillSure |
|--|--|--|
| Forms per day | 10–20 | **200+** |
| Time to process | 5–10 min each | ~1.5–2 hours total |
| Daily income | ~$30–60/day | **~$594/day net** |
| API cost | — | ~$6/day |
| Scale path | 1 person = 1 session | 2 machines → **400+ forms/day** |

> **Scale path:** Two machines running in parallel → 400+ forms/day from one operator. At 400 patients/day (two machines), monthly revenue = **$26,400 at $3/form**.

---

### 1.1 Implementation Update — Ameritas Chosen as MVP Carrier (June 2026)

> [!IMPORTANT]
> **Ameritas is automated first**, ahead of CIGNA, because its portal provides a **downloadable benefits PDF directly** — eliminating the need for screenshots or Vision AI on this carrier entirely.

**MVP Workflow:**
1. Playwright logs into the Ameritas portal
2. Searches the patient by Member ID and DOB
3. Downloads the benefits PDF
4. Parses it locally with a PDF parser — extracting every required field at **zero AI or API cost**

**Purpose:** Validate the entire end-to-end pipeline — portal automation, document retrieval, data extraction, and form generation — **before spending any money on AI**.

Once this pipeline is stable, additional carriers are added using whichever extraction method fits each portal best — PDF parsing, HTML parsing, or Vision AI only when neither is possible.

---

## 2. Problem Statement

### 2.1 What the Manual Process Looks Like Today

Each morning a dental practice sends its billing team a spreadsheet (the **"daily sheet"**) containing that day's patients. Each row includes:

- Appointment date and done date
- Patient name and date of birth
- Insurance carrier (e.g. CIGNA, Aetna)
- Subscriber name and subscriber date of birth
- Member ID

The billing specialist then performs the following **for every patient**:

1. Open a browser, navigate to the correct insurance portal URL
2. Log in with the dental practice's provider credentials
3. Navigate to the Eligibility or Benefits lookup section
4. Enter the patient's Member ID and date of birth into the portal search form
5. Wait for results to load, then click into the correct plan
6. Click every dropdown, accordion, and "Show more" button to reveal all plan details
7. Read values from multiple pages/tabs: maximums, deductibles, coverage percentages, frequencies, limitations
8. Manually transcribe all values into the correct fields of the Wisdom Full Insurance Breakdown form
9. Repeat for every patient — logging in again each time

This process takes **5–10 minutes per patient**. A fast specialist might complete 15–20 forms per day. Income is therefore **hard-capped — not by skill, but by the speed of manual data entry**.

### 2.2 Why This is a Solvable Automation Problem

The process is highly repetitive, involves structured data, and follows a deterministic path through well-defined portal interfaces. The inputs are always the same fields, the outputs always go into the same form, and the navigation path per portal is fixed. This is the ideal profile for **browser automation combined with AI-based visual data extraction**.

---

## 3. System Architecture Overview

The system has **five distinct layers**, each with a clearly separated responsibility:

| Layer | Responsibility |
|-------|----------------|
| **Layer 1: Input Ingestion** | Reads the daily patient Excel sheet. Parses every patient row. Groups patients by insurance carrier. |
| **Layer 2: Browser Automation** | Playwright logs into each portal once per carrier. Navigates to each patient's benefits page. Expands all dropdowns. Takes targeted screenshots **OR** downloads the benefits PDF. |
| **Layer 3: Data Extraction** | Either: (a) parses a downloaded PDF locally, (b) parses HTML/DOM, or (c) sends screenshots to Claude Vision API. Returns structured JSON. |
| **Layer 4: Form Filling** | The structured JSON is mapped to the fields of the Wisdom PDF/form template. The completed form is generated. |
| **Layer 5: Review & Delivery** | Low-confidence fields are flagged for a human reviewer. Completed forms are delivered to the operator. Daily summary report is generated. |

### 3.1 Why Vision API Instead of HTML Scraping

An earlier design considered scraping the raw HTML from portal pages and parsing it with code selectors (e.g. `document.querySelector('#annual-max')`). This approach was **rejected** for the following reasons:

| HTML Scraping (rejected) | Vision API (chosen) |
|--------------------------|---------------------|
| Breaks whenever the portal redesigns their page (CSS selectors stop matching) | Portal layout changes are irrelevant — Claude reads the rendered screenshot as a human would |
| JavaScript-rendered content is invisible to the scraper (loads after page ready) | Screenshot always captures the fully rendered page after all JS has run |
| Requires 100+ lines of custom selector logic per portal | Zero per-portal parsing logic — same code works for every carrier |
| Silent failures when a field moves or is renamed | Claude returns `null` and flags the field for review — never silently wrong |
| Multi-page data requires complex state management | Multiple screenshots sent together in one API call — Claude cross-references them |

### 3.2 Extraction Method Selection Per Portal (Updated Tiered Approach)

The original design treated Vision API as the default for every carrier. Building the Ameritas pipeline showed this isn't necessary everywhere. The strategy is now a **per-portal, tiered choice**:

| Priority | Method | When Used | Cost per Form |
|----------|--------|-----------|---------------|
| **1st** | PDF Parsing (local) | Portal offers a downloadable, machine-readable benefits PDF (e.g. **Ameritas**). Most reliable, no rendering required. | **$0** — no AI/API call |
| **2nd** | HTML Parsing | No downloadable document, but portal has a stable, parseable DOM. Used only after confirming selectors hold up across multiple plans. | **$0** — no AI/API call |
| **3rd** | Vision AI (Claude Vision API) | Fallback only — used when a portal offers neither a downloadable document nor a stable DOM. Data exists only as rendered, JS-heavy accordions. | **~$0.025** |

> [!NOTE]
> Layers 1, 2, 4, and 5 of the architecture are **unchanged** regardless of which extraction method Layer 3 uses for a given portal. Only the technique inside Layer 3 — and whether Layer 2 ends in a screenshot or a file download — varies by carrier.

---

## 4. Web Automation Layer (Playwright)

### 4.1 Technology Choice

**Microsoft Playwright** is used as the browser automation library. It controls a real Chromium browser in headless mode (no visible window), which means the portal experiences a fully functioning browser — cookies, sessions, JavaScript execution, and network requests all work identically to a real user's browser.

The **stealth plugin** (`playwright-extra` + `puppeteer-extra-plugin-stealth`) is applied to hide all automation fingerprints. This patches `navigator.webdriver`, `chrome.runtime`, and other browser properties that portals use to detect bots.

### 4.2 Session Batching — One Login Per Portal Per Day

> [!IMPORTANT]
> This is the most important architectural decision in the automation layer.

A naive implementation would log in for every patient and log out after. This is how a poorly designed bot behaves — not how a human works.

A real billing specialist logs into CIGNA once in the morning and searches for every CIGNA patient one after another in that same session. **This system mirrors that exactly:**

**Session Batching Flow:**
1. Parse daily sheet and group all patients by carrier.
2. For each carrier — **login ONCE**, process ALL patients for that carrier back-to-back, then **logout ONCE**.
3. Natural pause between carriers (3–8 minutes), like a human switching to a different portal.

**Result:** For 50 CIGNA patients — 1 login, 50 patient lookups, 1 logout. **Not 50 logins.**

### 4.3 Human-Like Behaviour (Anti-Detection)

Portals monitor request patterns to detect bots. The system is designed to be indistinguishable from a human billing specialist working through their morning queue:

| Behaviour | Human Reality | Bot Implementation | Why It Matters |
|-----------|---------------|-------------------|----------------|
| Pause between patients | 30–90 seconds — reading, copy-pasting, thinking | Random delay: **25–75 seconds** between each patient lookup | Portals track requests-per-minute. Too fast = flagged. |
| Typing speed | 40–120ms between keystrokes — never instant | `page.keyboard.type()` with random **40–120ms delay** per character | Instant field injection triggers bot detection heuristics. |
| Mouse movement | Cursor moves to button then clicks slightly off-centre | `mouse.move()` with 10 intermediate steps, click slightly off-centre | Straight-line instant teleportation is a bot signal. |
| Occasional long pause | Distraction, phone call, bathroom break | **15% chance** of a 2–4 minute pause between patients | Makes the session time distribution match human patterns. |
| Browser fingerprint | Chrome 125, Windows 10, US timezone, 1440×900 | `userAgent`, `viewport`, `locale`, `timezoneId` set to realistic values | Default Playwright fingerprint is widely recognised by portals. |
| Scrolling | Humans always scroll before clicking | Scroll 100–400px before interacting with any element | Interaction without any scroll is a bot pattern. |
| Between portals | Close one portal, take a break, open the next | **3–8 minute** random pause between carrier sessions | Instant portal-switching is inhuman. |

### 4.4 Dropdown and Accordion Expansion

Insurance portal benefits pages frequently hide data behind expandable sections — accordions, dropdown panels, "Show more" buttons. All of these must be expanded before screenshotting, or the data will be missing from the image.

The system runs a **generic expand-all pass** before any screenshot is taken. It targets every element matching common expand patterns (`aria-expanded="false"`, `.accordion-toggle`, `[data-toggle="collapse"]`, buttons containing "Show" or "View more" or "+"). Each matching element is clicked with a short wait after each click for animations to complete. A final `networkidle` wait ensures all lazy-loaded content has appeared.

**Key Notes:**
- This approach is **portal-agnostic** — it does not need to know the specific expand button IDs for each portal.
- The `try/catch` around each click silently skips buttons that become stale or hidden after others are clicked.
- After expansion, `waitForLoadState('networkidle')` ensures all dynamically loaded content is fully rendered before any screenshot is taken.

> [!NOTE]
> For Ameritas (MVP), the expand-all pass is replaced by a **PDF download trigger**. After navigating to the patient's benefits page, Playwright clicks the "Download PDF" or "Print Summary" button and intercepts the download. No accordion expansion needed.

### 4.5 Targeted Screenshot Clipping

Instead of screenshotting the full page (which includes navigation bars, headers, footers, sidebars — all wasting tokens), the system locates each specific data section element and screenshots only its bounding box.

Playwright's `element.boundingBox()` returns the exact pixel coordinates of the element. The screenshot is then clipped to those coordinates plus a small 10–20px padding on all sides to ensure text at edges is not cut off. A typical form's data fits into **3–5 focused clips of approximately 800×400 pixels each** — far smaller than a full-page screenshot and containing only relevant information.

> [!TIP]
> This clipping approach is also a **HIPAA compliance feature** — by capturing only the benefits table and not the full patient record page, the system processes the **minimum necessary PHI**.

---

## 5. AI Vision Extraction Layer (Claude API)

> [!NOTE]
> This layer is **skipped entirely for Ameritas** (and any carrier with PDF or HTML parsing available). It is the **fallback** method only, used when no machine-readable document or stable DOM is available.

### 5.1 How It Works

Once all screenshots are captured for a patient, they are base64-encoded and sent to the **Claude Vision API** (`claude-sonnet-4-6`) in a single API call. All screenshots for that patient are included together — Claude can cross-reference information across pages just as a human would when flipping between tabs.

The prompt instructs Claude to act as a dental billing specialist reading benefits screenshots, and to return a single JSON object containing every field required by the Wisdom form. The key constraint: **return `null` for any field not clearly visible, never guess**.

### 5.2 Fields Extracted

The following fields are extracted from the portal screenshots (or PDF) and mapped to the Wisdom Full Insurance Breakdown form:

| Category | Field | Form Location | Example Value |
|----------|-------|---------------|---------------|
| Plan Info | Annual maximum | MAXIMUMS section | $1,500 |
| Plan Info | Deductible (individual) | DEDUCTIBLES section | $50 |
| Plan Info | Deductible (family) | DEDUCTIBLES section | $150 |
| Plan Info | Plan year type | Plan runs on | Calendar year |
| Plan Info | Missing tooth clause | YES/NO checkbox | YES |
| Plan Info | Waiting periods | YES/NO checkbox | NO |
| Coverage % | Preventative | % COVERAGE row | 100% |
| Coverage % | Diagnostic | % COVERAGE row | 100% |
| Coverage % | Restorative | % COVERAGE row | 100% |
| Coverage % | Crowns | % COVERAGE row | 50% |
| Coverage % | Endodontic | % COVERAGE row | 50% |
| Coverage % | Periodontic | % COVERAGE row | 50% |
| Coverage % | Oral surgery | % COVERAGE row | 50% |
| Coverage % | Implants | % COVERAGE row | 50% |
| Frequencies | Prophy (D1110/D1120) | FREQUENCIES table | 2x / cal year |
| Frequencies | Bitewings (D0270,2,4) | FREQUENCIES table | No freq / no limits |
| Frequencies | Full X-ray (D0210/D0330) | FREQUENCIES table | 1x / 3 years |
| Frequencies | Periodic exam (D0120) | FREQUENCIES table | 4x / 12 rolling months |
| Frequencies | Sealants (D1351) | FREQUENCIES table | 1x / 180 days |
| Periodontics | Scaling w/ inflammation | PERIODONTICS table | 1x / cal year |
| Periodontics | S/RP (D4341/D4342) | PERIODONTICS table | 1x / 12 rolling months |
| Periodontics | Perio maintenance (D4910) | PERIODONTICS table | 4x / cal year |
| Ortho | Ortho coverage | ORTHO section | YES — 50% |
| Ortho | Lifetime maximum | ORTHO section | N — no lifetime max |
| Optional | Occlusal guards (D9944) | OPTIONAL CODES table | 50% — bruxism only |
| Optional | Arestin (D4381) | OPTIONAL CODES table | 50% — 1x/12 months |

### 5.3 Confidence Scoring and Flagging

Every extracted field includes a confidence rating: **high**, **medium**, or **low**. This is returned as a separate confidence object alongside the data. Any field rated low confidence is automatically flagged for human review.

In addition, a validation layer checks all values against expected ranges (e.g. coverage percentages must be 0–100, annual maximums unlikely to exceed $10,000, deductibles unlikely to exceed $500). Out-of-range values are flagged regardless of confidence rating.

**Review Workflow:**
- **High confidence fields:** Populated directly into the form — no review needed.
- **Medium confidence fields:** Populated but highlighted in the review UI for a quick sanity check.
- **Low confidence fields:** Left blank or marked for human lookup — the reviewer fills these manually.

> This means the human reviewer touches maybe **5–10% of fields**, not 100% of the form.

### 5.4 Multi-Page Handling

The Wisdom form requires data from multiple sections of the portal that may appear on different pages or tabs. The system captures a screenshot of each relevant section and sends all screenshots in a **single Claude API call**. Claude sees all pages simultaneously and extracts data from the correct section for each field.

**Typical page breakdown per portal (for Vision AI carriers):**
- Page 1: Plan overview, coverage percentages, deductibles, maximums
- Page 2: Frequencies and limitations (Diagnostic/Preventative section)
- Page 3: Restorative frequencies, periodontics, optional codes
- Page 4: Ortho section (if applicable)

---

## 6. Portal Navigation Flow

### 6.1 The Navigation Principle

Navigation through each portal is scripted as a **deterministic sequence** — not AI-driven. This is a deliberate design decision. The AI's job is to read screenshots; Playwright's job is to click buttons and fill forms. These responsibilities **never mix**.

Each portal gets **one navigation function**, written once by hand-walking through the portal and noting every click and field. This takes approximately **30 minutes per portal** and runs reliably thereafter. The navigation script does not change unless the portal's page structure fundamentally changes.

### 6.2 Standard Navigation Steps (CIGNA Example)

1. Navigate to `https://cignaforhcp.cigna.com/app/login`
2. Fill username and password fields; click login button
3. Wait for provider dashboard to load
4. Click the Eligibility/Benefits navigation link
5. Select search type: Member ID
6. Fill: Member ID (from daily sheet column H), Date of Birth (column D), Date of Service
7. Submit search; wait for eligibility results
8. Click into the matching plan result row
9. Wait for benefits detail page to load
10. Run expand-all pass: click every collapsed section
11. Wait for `networkidle` after all expansions
12. Capture targeted screenshots of each benefits section
13. Move to next patient — **NO re-login**, same session continues

### 6.3 Reading the Daily Sheet

The system reads the daily Excel sheet provided by the dental practice each morning. The column mapping from the Leary Family Dentistry sheet:

| Column | Usage in System |
|--------|----------------|
| Column A — APPT DT | Appointment date — used for date of service field in portal search |
| Column B — DONE DT | Done date — informational, used for audit log |
| Column C — PATIENT | Patient full name — for form header and logging |
| Column D — PT. DOB | Patient date of birth — used in portal search form |
| Column E — CARRIER | Insurance carrier name — determines which portal to use |
| Column F — SUB NAME | Subscriber name — may differ from patient |
| Column G — SUB DOB | Subscriber date of birth — used in some portal searches |
| Column H — MEMBER ID | Member ID — **primary search key** for every portal lookup |
| Column I — NOTES | Practice notes — read and passed through to review queue |
| Column J — NAME | Operator name — logged for audit trail |

**Real data example from Leary sheet:**
- Paul Campanelli (CIGNA, Member ID U91189060) — patient DOB 8/5/1973, subscriber Kathryn Campanelli DOB 7/3/1974
- David Teague (CIGNA, Member ID U3376688401) — same subscriber as patient
- Both are CIGNA — processed in the **same session, back to back**

---

## 7. Ameritas MVP — Full Implementation Plan

> [!IMPORTANT]
> This is the **first carrier to be implemented**. Everything in this section must be working and tested before any other carrier is added. The goal is to validate the entire end-to-end pipeline without spending a single dollar on AI.

### 7.1 Why Ameritas First

| Reason | Detail |
|--------|--------|
| **PDF download available** | Ameritas's provider portal exposes a downloadable, machine-readable benefits PDF — no screenshots or Vision AI needed |
| **Zero AI cost** | Local PDF parsing costs nothing. This lets us validate the pipeline before committing to API spend |
| **Full pipeline validation** | Tests every component: Excel parsing → Playwright login → portal navigation → PDF download → PDF parsing → field mapping → form output |
| **Simpler extraction** | PDF text is structured and deterministic — no confidence scoring, no flagging, no hallucination risk |

### 7.2 Ameritas Portal — What We Know

- **Portal URL:** `https://provider.ameritasgroup.com` (or equivalent Ameritas provider portal)
- **Login method:** Username + password, **followed by an OTP (One-Time Password)** sent to the operator's registered email or phone
- **"Remember this device" mechanism:** After completing OTP, the portal offers (or automatically sets) a **30-day remember-device cookie**. While that cookie is alive, no OTP is required on subsequent logins — the portal treats the browser as a trusted device.
- **Patient lookup:** Member ID + Date of Birth
- **PDF availability:** After navigating to a member's benefits page, a "Download Benefits Summary" or "Print PDF" button is available — clicking it triggers a direct PDF file download
- **PDF content:** The downloaded PDF contains all benefit information in text-extractable form (not scanned/image-based)

### 7.2.1 Handling OTP Login — The Persistent Context Strategy

> [!IMPORTANT]
> The OTP challenge appears **only once every 30 days**, not on every run. The solution is to use Playwright's **persistent browser context**, which saves all cookies and localStorage to a folder on disk. The 30-day remember-device cookie is stored there and re-used automatically on every subsequent run — no OTP prompt appears until the cookie expires.

**How it works:**

| Login event | What happens |
|-------------|-------------|
| **First ever run (Day 0)** | Operator launches the script in **setup mode** (non-headless). Playwright opens a visible browser. Operator manually enters username, password, and OTP when prompted. Operator checks "Remember this device" checkbox. Script waits, detects successful login, saves the browser state. Done. |
| **Every daily run for the next 30 days** | Script launches with the saved persistent context. The remember-device cookie is already present. Portal skips OTP entirely and lands straight on the provider dashboard. Fully automated. |
| **Day 30+ (cookie expires)** | Script detects the OTP page (by checking for the presence of the OTP input field). It pauses and **alerts the operator** (console message + optional email/SMS). Operator runs setup mode again — 2-minute task. Resets the 30-day window. |

**Why this is the right approach:**
- No need to intercept emails or SMS to extract OTP codes programmatically (which is complex and fragile)
- Matches exactly how a real human billing specialist uses the portal — they log in once, check "remember me", and don't see OTP again for a month
- The persistent context folder contains ONLY cookies and localStorage — **no PHI** — so storing it on disk is safe
- The folder must be encrypted at rest (place it inside an encrypted directory or use OS-level encryption) since portal session cookies give access to PHI

**Implementation — persistent context:**

```javascript
// src/carriers/ameritas/session.js
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

chromium.use(stealth());

// Directory where Playwright stores cookies/localStorage for Ameritas
// IMPORTANT: This folder gives access to the portal — treat like a password
// In production: store inside an encrypted volume or use OS-level encryption
const SESSION_DIR = path.join(__dirname, '../../../.sessions/ameritas');

/**
 * Returns a persistent browser context for the Ameritas portal.
 * If the session directory already exists (from a previous run),
 * the browser loads with all cookies intact — no login needed.
 * If it's a fresh install, the directory is created empty and
 * the browser will require a full login + OTP on first use.
 */
async function getAmeritasContext(headless = true) {
  // Ensure session directory exists
  fs.mkdirSync(SESSION_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    // Download behaviour
    acceptDownloads: true,
  });

  return context;
}

module.exports = { getAmeritasContext, SESSION_DIR };
```

**Implementation — OTP detection and setup mode:**

```javascript
// src/carriers/ameritas/navigate.js  (updated login section)
const { getAmeritasContext } = require('./session');
const { humanDelay, humanType } = require('../../utils/humanDelay');
const { getCredentials } = require('../../utils/credentials');

async function processAmeritasPatients(patients, { setupMode = false } = {}) {
  const creds = await getCredentials('ameritas');
  
  // setupMode=true → headless=false (visible window so operator can enter OTP)
  // setupMode=false → headless=true (fully automated daily run)
  const context = await getAmeritasContext(!setupMode);
  const page = await context.newPage();

  try {
    await page.goto('https://provider.ameritasgroup.com/login', {
      waitUntil: 'networkidle'
    });

    // ── CHECK: Are we already logged in? ──────────────────────────────────
    // If the session cookie is valid, the portal redirects straight to the
    // dashboard. Check for the presence of a dashboard-only element.
    const alreadyLoggedIn = await page.locator('#provider-dashboard, .dashboard-nav').first().isVisible()
      .catch(() => false);

    if (!alreadyLoggedIn) {
      // ── LOGIN FLOW ─────────────────────────────────────────────────────
      await page.mouse.wheel(0, 100);
      await humanDelay(800, 1500);

      await humanType(page, '#username', creds.username);
      await humanDelay(400, 900);
      await humanType(page, '#password', creds.password);
      await humanDelay(600, 1200);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // ── CHECK: OTP page? ───────────────────────────────────────────────
      const otpVisible = await page.locator('input[name="otp"], input[name="code"], #otp-input').first().isVisible()
        .catch(() => false);

      if (otpVisible) {
        if (!setupMode) {
          // Running in automated mode but OTP appeared — session cookie expired
          console.error('\n⚠️  AMERITAS SESSION EXPIRED — OTP REQUIRED');
          console.error('Run setup mode: node main.js --setup-ameritas');
          console.error('This takes ~2 minutes. The session will then be valid for 30 days.\n');
          await context.close();
          throw new Error('AMERITAS_OTP_REQUIRED: Run --setup-ameritas to renew the session');
        }

        // ── SETUP MODE: operator enters OTP in the visible browser window ──
        console.log('\n🔐 OTP required. The browser window is open.');
        console.log('   Please enter the OTP code in the browser window.');
        console.log('   Check the "Remember this device" or "Keep me logged in" checkbox.');
        console.log('   Then click Submit/Continue in the browser.');
        console.log('   Waiting for you to complete the OTP step...\n');

        // Wait until OTP page is gone (operator completed it)
        await page.waitForSelector(
          '#provider-dashboard, .dashboard-nav, .member-search',
          { timeout: 120_000 } // 2 minute window for operator
        );

        console.log('✅  OTP completed. Session saved. Valid for ~30 days.');
        console.log('   You can now run the daily job in headless mode.\n');
      }
    }

    console.log('[Ameritas] Session active. Processing patients...');

    // ── PROCESS PATIENTS (same session, no re-login) ───────────────────
    const results = [];
    for (let i = 0; i < patients.length; i++) {
      const patient = patients[i];
      try {
        const { downloadBenefitsPdf } = require('./downloadPdf');
        const pdfBuffer = await downloadBenefitsPdf(page, patient);
        results.push({ patient, pdfBuffer, success: true });
      } catch (err) {
        results.push({ patient, pdfBuffer: null, success: false, error: err.message });
      }

      if (i < patients.length - 1) {
        const longPause = Math.random() < 0.15;
        await humanDelay(
          longPause ? 120_000 : 25_000,
          longPause ? 240_000 : 75_000
        );
      }
    }

    return results;

  } finally {
    // Close context (saves session state to disk automatically)
    await context.close();
  }
}

module.exports = { processAmeritasPatients };
```

**Setup mode CLI entry point (add to `main.js`):**

```javascript
// In main.js — detect --setup-ameritas flag
const isSetupMode = process.argv.includes('--setup-ameritas');

if (isSetupMode) {
  // Launch visible browser, walk operator through OTP
  // Pass setupMode: true to processAmeritasPatients with an empty patients array
  processAmeritasPatients([], { setupMode: true }).then(() => {
    console.log('Setup complete. Run daily job normally tomorrow.');
  });
} else {
  runDailyJob(process.argv[2] || './daily_sheet.xlsx');
}
```

**Usage:**
```bash
# First time ever (or every 30 days when cookie expires):
node main.js --setup-ameritas
# → Opens visible browser, operator enters OTP once, session saved

# Every daily run after that (fully automated):
node main.js daily_sheet.xlsx
# → No OTP, no human input needed
```

> [!WARNING]
> The `.sessions/ameritas/` folder contains authentication cookies that grant access to the insurance portal (which contains PHI). It must be:
> - Added to `.gitignore` (never commit to source control)
> - Stored on an encrypted volume or disk partition
> - Accessible only to the process user (restrict file permissions: `chmod 700`)
> - Backed up securely — losing it just means re-doing the 2-minute OTP setup, not a disaster

### 7.3 Step-by-Step Ameritas Implementation

#### Step 1: Project Scaffolding

```
fillsure/
├── src/
│   ├── input/
│   │   └── sheetParser.js          # Excel daily sheet reader
│   ├── carriers/
│   │   └── ameritas/
│   │       ├── session.js          # Persistent context manager (30-day remember-device)
│   │       ├── navigate.js         # Ameritas Playwright navigation + OTP detection
│   │       ├── downloadPdf.js      # PDF download interceptor
│   │       └── parsePdf.js         # PDF text extraction + field mapping
│   ├── output/
│   │   └── formFiller.js           # Wisdom PDF template filler
│   ├── review/
│   │   └── flagging.js             # Field validation + flagging logic
│   ├── utils/
│   │   ├── humanDelay.js           # Random delay + typing speed helpers
│   │   ├── logger.js               # PHI-safe audit logger
│   │   └── credentials.js          # Credential retrieval (Secrets Manager or .env for dev)
│   └── main.js                     # Orchestrator — reads sheet, runs pipeline
├── .sessions/                      # Playwright persistent context storage (ENCRYPTED, gitignored)
│   └── ameritas/                   # Cookie/localStorage store for Ameritas (30-day session)
├── output/                         # Completed PDFs dropped here
├── logs/                           # Audit logs (PHI-sanitised)
├── templates/
│   └── wisdom_template.pdf         # Blank Wisdom form template
├── .env.example                    # Example env vars (never commit real .env)
├── .gitignore                      # Must include: .sessions/, .env, output/
└── package.json
```

#### Step 2: Excel Sheet Parser (`sheetParser.js`)

```javascript
const xlsx = require('xlsx');

function parseDailySheet(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const patients = [];
  // Skip header row (row 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[4]) continue; // Skip rows with no carrier
    
    patients.push({
      apptDate:     row[0],   // Column A
      doneDate:     row[1],   // Column B
      patientName:  row[2],   // Column C
      patientDOB:   row[3],   // Column D
      carrier:      row[4]?.toString().toLowerCase().trim(), // Column E
      subscriberName: row[5], // Column F
      subscriberDOB:  row[6], // Column G
      memberId:     row[7],   // Column H
      notes:        row[8],   // Column I
      operatorName: row[9],   // Column J
    });
  }

  // Group by carrier
  const grouped = {};
  for (const patient of patients) {
    if (!grouped[patient.carrier]) grouped[patient.carrier] = [];
    grouped[patient.carrier].push(patient);
  }

  return grouped;
}

module.exports = { parseDailySheet };
```

#### Step 3: Ameritas Navigation Script (`carriers/ameritas/navigate.js`)

```javascript
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const { humanDelay, humanType } = require('../../utils/humanDelay');
const { getCredentials } = require('../../utils/credentials');
const { downloadBenefitsPdf } = require('./downloadPdf');

chromium.use(stealth());

async function processAmeritasPatients(patients) {
  const creds = await getCredentials('ameritas');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });
  const page = await context.newPage();

  const results = [];

  try {
    // ── LOGIN ONCE ──────────────────────────────────────────────────
    await page.goto('https://provider.ameritasgroup.com/login', {
      waitUntil: 'networkidle'
    });

    // Scroll before interacting (human behaviour)
    await page.mouse.wheel(0, 100);
    await humanDelay(1000, 2000);

    // Human-speed typing for credentials
    await humanType(page, '#username', creds.username);
    await humanDelay(500, 1200);
    await humanType(page, '#password', creds.password);
    await humanDelay(800, 1500);
    
    // Move mouse to button realistically before clicking
    const loginBtn = await page.locator('button[type="submit"], #login-button').first();
    const box = await loginBtn.boundingBox();
    await page.mouse.move(
      box.x + box.width / 2 + (Math.random() * 6 - 3), // slight offset
      box.y + box.height / 2 + (Math.random() * 4 - 2),
      { steps: 10 }
    );
    await loginBtn.click();
    await page.waitForLoadState('networkidle');

    console.log('[Ameritas] Logged in successfully. Processing patients...');

    // ── PROCESS EACH PATIENT IN THE SAME SESSION ─────────────────
    for (let i = 0; i < patients.length; i++) {
      const patient = patients[i];
      
      try {
        console.log(`[Ameritas] Patient ${i + 1}/${patients.length}: ${patient.patientName}`);
        
        const pdfBuffer = await downloadBenefitsPdf(page, patient);
        results.push({ patient, pdfBuffer, success: true });

      } catch (err) {
        console.error(`[Ameritas] Failed for patient ${patient.patientName}: ${err.message}`);
        results.push({ patient, pdfBuffer: null, success: false, error: err.message });
      }

      // ── Human-mimicry pause between patients ──────────────────
      if (i < patients.length - 1) {
        // 15% chance of a long distraction pause
        const longPause = Math.random() < 0.15;
        const delayMs = longPause
          ? humanDelay(120000, 240000)  // 2–4 minutes
          : humanDelay(25000, 75000);   // 25–75 seconds
        await delayMs;
      }
    }

  } finally {
    await browser.close();
  }

  return results;
}

module.exports = { processAmeritasPatients };
```

#### Step 4: PDF Download Interceptor (`carriers/ameritas/downloadPdf.js`)

```javascript
const path = require('path');
const os = require('os');
const fs = require('fs');
const { humanDelay } = require('../../utils/humanDelay');

async function downloadBenefitsPdf(page, patient) {
  // Navigate to Eligibility/Benefits lookup
  await page.click('a[href*="eligibility"], a:text("Eligibility"), nav >> text=Eligibility');
  await page.waitForLoadState('networkidle');
  await humanDelay(1000, 2500);

  // Search by Member ID + DOB
  // NOTE: Actual selectors must be confirmed by manually walking the Ameritas portal
  await page.fill('input[name="memberId"], #member-id', patient.memberId);
  await humanDelay(500, 1000);
  
  const dobFormatted = formatDOB(patient.patientDOB); // Format to MM/DD/YYYY
  await page.fill('input[name="dob"], #date-of-birth', dobFormatted);
  await humanDelay(800, 1500);

  // Submit search
  await page.click('button:text("Search"), button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await humanDelay(2000, 4000);

  // Click into the matching plan result
  await page.click('table.results tr:first-child, .member-result:first-child');
  await page.waitForLoadState('networkidle');
  await humanDelay(1500, 3000);

  // Intercept the PDF download
  // Set up download interception BEFORE clicking the download button
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:text("Download"), a:text("Download PDF"), button:text("Print"), .download-benefits'),
  ]);

  // Get the PDF as a Buffer (NEVER write to disk in production)
  const downloadPath = await download.path(); // Playwright saves to temp
  const pdfBuffer = fs.readFileSync(downloadPath);
  
  // Immediately delete the temp file — keep PDF in memory only
  fs.unlinkSync(downloadPath);

  return pdfBuffer; // In-memory Buffer only
}

function formatDOB(dob) {
  // Handle various input formats from the Excel sheet
  if (!dob) return '';
  if (typeof dob === 'number') {
    // Excel date serial number
    const date = new Date((dob - 25569) * 86400 * 1000);
    return `${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')}/${date.getFullYear()}`;
  }
  // String date — normalise
  return dob.toString().trim();
}

module.exports = { downloadBenefitsPdf };
```

#### Step 5: PDF Text Parser (`carriers/ameritas/parsePdf.js`)

```javascript
const pdf = require('pdf-parse'); // npm install pdf-parse

/**
 * Extracts all required Wisdom form fields from the Ameritas benefits PDF.
 * Returns a structured object matching the Wisdom form schema.
 * Returns null for any field not found — never guesses.
 */
async function parseAmeritasPdf(pdfBuffer) {
  const data = await pdf(pdfBuffer);
  const text = data.text;

  // All extraction uses regex against the raw PDF text
  // These patterns must be validated against real Ameritas PDF samples
  return {
    // ── PLAN INFO ────────────────────────────────────────────────
    annualMaximum:        extractCurrency(text, /Annual Maximum[:\s]+\$?([\d,]+)/i),
    deductibleIndividual: extractCurrency(text, /Individual Deductible[:\s]+\$?([\d,]+)/i),
    deductibleFamily:     extractCurrency(text, /Family Deductible[:\s]+\$?([\d,]+)/i),
    planYearType:         extractText(text, /Plan Year[:\s]+(Calendar|Contract)/i),
    missingToothClause:   extractYesNo(text, /Missing Tooth Clause[:\s]+(Yes|No)/i),
    waitingPeriods:       extractYesNo(text, /Waiting Period[:\s]+(Yes|No|None)/i),
    effectiveDate:        extractText(text, /Effective Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i),
    groupName:            extractText(text, /Group Name[:\s]+([^\n]+)/i),
    groupNumber:          extractText(text, /Group (Number|ID|#)[:\s]+([^\n]+)/i, 2),

    // ── COVERAGE PERCENTAGES ──────────────────────────────────────
    coveragePreventative: extractPercent(text, /Preventive[:\s]+(\d+)%/i),
    coverageDiagnostic:   extractPercent(text, /Diagnostic[:\s]+(\d+)%/i),
    coverageRestorative:  extractPercent(text, /Restorative[:\s]+(\d+)%/i),
    coverageCrowns:       extractPercent(text, /Crown[s]?[:\s]+(\d+)%/i),
    coverageEndodontic:   extractPercent(text, /Endodontic[:\s]+(\d+)%/i),
    coveragePeriodontic:  extractPercent(text, /Periodontic[:\s]+(\d+)%/i),
    coverageOralSurgery:  extractPercent(text, /Oral Surgery[:\s]+(\d+)%/i),
    coverageImplants:     extractPercent(text, /Implant[s]?[:\s]+(\d+)%/i),

    // ── FREQUENCIES ──────────────────────────────────────────────
    freqProphy:           extractText(text, /Prophylaxis[^\n]*\n[^\n]*([\d]+ ?[xX][\s/]+[^\n]+)/i),
    freqBitewings:        extractText(text, /Bitewing[s]?[^\n]*\n[^\n]*([\d]+ ?[xX][\s/]+[^\n]+)/i),
    freqFullXray:         extractText(text, /Full[- ]?Mouth[^\n]*\n[^\n]*([\d]+ ?[xX][\s/]+[^\n]+)/i),
    freqPeriodicExam:     extractText(text, /Periodic Exam[^\n]*\n[^\n]*([\d]+ ?[xX][\s/]+[^\n]+)/i),
    freqSealants:         extractText(text, /Sealant[s]?[^\n]*\n[^\n]*([\d]+ ?[xX][\s/]+[^\n]+)/i),

    // ── PERIODONTICS ─────────────────────────────────────────────
    freqScaling:          extractText(text, /Scaling[^\n]*inflammation[^\n]*([\d]+ ?[xX][\s/]+[^\n]+)/i),
    freqSRP:              extractText(text, /D4341[^\n]*([\d]+ ?[xX][\s/]+[^\n]+)/i),
    freqPerioMaint:       extractText(text, /D4910[^\n]*([\d]+ ?[xX][\s/]+[^\n]+)/i),

    // ── ORTHO ────────────────────────────────────────────────────
    orthoCoverage:        extractYesNo(text, /Orthodontic[:\s]+(Yes|No|Covered|Not Covered)/i),
    orthoPercent:         extractPercent(text, /Orthodontic[^\n]*(\d+)%/i),
    orthoLifetimeMax:     extractCurrency(text, /Orthodontic[^\n]*\$?([\d,]+)/i),

    // ── OPTIONAL CODES ───────────────────────────────────────────
    occlusalGuards:       extractText(text, /D9944[^\n]*([^\n]+)/i),
    arestin:              extractText(text, /D4381[^\n]*([^\n]+)/i),

    // Extraction metadata
    _extractionMethod:    'pdf_local',
    _carrier:             'ameritas',
    _pdfPageCount:        data.numpages,
  };
}

// ── Extraction helpers ─────────────────────────────────────────────────

function extractCurrency(text, regex) {
  const match = text.match(regex);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ''), 10);
}

function extractPercent(text, regex) {
  const match = text.match(regex);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  return (val >= 0 && val <= 100) ? val : null;
}

function extractYesNo(text, regex) {
  const match = text.match(regex);
  if (!match) return null;
  const val = match[1].toLowerCase();
  return val === 'yes' || val === 'covered' ? true : false;
}

function extractText(text, regex, group = 1) {
  const match = text.match(regex);
  if (!match) return null;
  return match[group]?.trim() || null;
}

module.exports = { parseAmeritasPdf };
```

#### Step 6: Wisdom Form Filler (`output/formFiller.js`)

```javascript
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function fillWisdomForm(extractedData, patient, templatePath) {
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  // ── PATIENT & PLAN INFO ──────────────────────────────────────────
  setField(form, 'patient_name',      patient.patientName);
  setField(form, 'patient_dob',       patient.patientDOB?.toString());
  setField(form, 'subscriber_name',   patient.subscriberName);
  setField(form, 'subscriber_dob',    patient.subscriberDOB?.toString());
  setField(form, 'member_id',         patient.memberId);
  setField(form, 'insurance_name',    'Ameritas Life Partners');
  setField(form, 'group_name',        extractedData.groupName);
  setField(form, 'group_number',      extractedData.groupNumber);
  setField(form, 'effective_date',    extractedData.effectiveDate);
  setField(form, 'plan_year_type',    extractedData.planYearType);

  // ── MAXIMUMS & DEDUCTIBLES ──────────────────────────────────────
  setField(form, 'annual_max',        formatCurrency(extractedData.annualMaximum));
  setField(form, 'deductible_ind',    formatCurrency(extractedData.deductibleIndividual));
  setField(form, 'deductible_fam',    formatCurrency(extractedData.deductibleFamily));
  setCheckbox(form, 'missing_tooth',  extractedData.missingToothClause);
  setCheckbox(form, 'waiting_periods', extractedData.waitingPeriods);

  // ── COVERAGE PERCENTAGES ────────────────────────────────────────
  setField(form, 'pct_preventative',  formatPct(extractedData.coveragePreventative));
  setField(form, 'pct_diagnostic',    formatPct(extractedData.coverageDiagnostic));
  setField(form, 'pct_restorative',   formatPct(extractedData.coverageRestorative));
  setField(form, 'pct_crowns',        formatPct(extractedData.coverageCrowns));
  setField(form, 'pct_endodontic',    formatPct(extractedData.coverageEndodontic));
  setField(form, 'pct_periodontic',   formatPct(extractedData.coveragePeriodontic));
  setField(form, 'pct_oral_surgery',  formatPct(extractedData.coverageOralSurgery));
  setField(form, 'pct_implants',      formatPct(extractedData.coverageImplants));

  // ── FREQUENCIES ─────────────────────────────────────────────────
  setField(form, 'freq_prophy',       extractedData.freqProphy);
  setField(form, 'freq_bitewings',    extractedData.freqBitewings);
  setField(form, 'freq_full_xray',    extractedData.freqFullXray);
  setField(form, 'freq_periodic_exam', extractedData.freqPeriodicExam);
  setField(form, 'freq_sealants',     extractedData.freqSealants);

  // ── PERIODONTICS ─────────────────────────────────────────────────
  setField(form, 'freq_scaling',      extractedData.freqScaling);
  setField(form, 'freq_srp',          extractedData.freqSRP);
  setField(form, 'freq_perio_maint',  extractedData.freqPerioMaint);

  // ── ORTHO ────────────────────────────────────────────────────────
  setCheckbox(form, 'ortho_coverage', extractedData.orthoCoverage);
  setField(form, 'ortho_pct',         formatPct(extractedData.orthoPercent));
  setField(form, 'ortho_lifetime_max', formatCurrency(extractedData.orthoLifetimeMax));

  // ── OPTIONAL CODES ───────────────────────────────────────────────
  setField(form, 'occlusal_guards',   extractedData.occlusalGuards);
  setField(form, 'arestin',           extractedData.arestin);

  // Flatten and return as Buffer
  form.flatten();
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ── Helpers ─────────────────────────────────────────────────────────────

function setField(form, fieldName, value) {
  try {
    if (value === null || value === undefined) return;
    const field = form.getTextField(fieldName);
    field.setText(String(value));
  } catch (e) {
    // Field not found in template — skip silently
  }
}

function setCheckbox(form, fieldName, value) {
  try {
    const field = form.getCheckBox(fieldName);
    if (value === true) field.check();
    else field.uncheck();
  } catch (e) {}
}

function formatCurrency(val) {
  if (val === null || val === undefined) return '';
  return `$${val.toLocaleString()}`;
}

function formatPct(val) {
  if (val === null || val === undefined) return '';
  return `${val}%`;
}

module.exports = { fillWisdomForm };
```

#### Step 7: Human Delay Utilities (`utils/humanDelay.js`)

```javascript
/**
 * Returns a promise that resolves after a random delay between minMs and maxMs.
 */
async function humanDelay(minMs, maxMs) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Types text into a Playwright page element with human-speed random delays
 * between each keystroke (40–120ms).
 */
async function humanType(page, selector, text) {
  await page.click(selector);
  await humanDelay(200, 500);
  for (const char of text) {
    await page.keyboard.type(char);
    await humanDelay(40, 120);
  }
}

module.exports = { humanDelay, humanType };
```

#### Step 8: Main Orchestrator (`main.js`)

```javascript
const { parseDailySheet } = require('./src/input/sheetParser');
const { processAmeritasPatients } = require('./src/carriers/ameritas/navigate');
const { parseAmeritasPdf } = require('./src/carriers/ameritas/parsePdf');
const { fillWisdomForm } = require('./src/output/formFiller');
const { logger } = require('./src/utils/logger');
const path = require('path');
const fs = require('fs');

async function runDailyJob(sheetPath) {
  const startTime = Date.now();
  logger.info('Daily job started');

  // Step 1: Parse the daily sheet
  const grouped = parseDailySheet(sheetPath);
  const ameritasPatients = grouped['ameritas'] || [];
  
  if (ameritasPatients.length === 0) {
    logger.info('No Ameritas patients today. Exiting.');
    return;
  }

  logger.info(`Processing ${ameritasPatients.length} Ameritas patients`);

  // Step 2: Run Ameritas portal session (one login, all patients)
  const portalResults = await processAmeritasPatients(ameritasPatients);

  // Step 3: Parse PDFs and fill forms
  const completedForms = [];
  const failures = [];

  for (const result of portalResults) {
    if (!result.success) {
      failures.push(result);
      continue;
    }

    try {
      // Extract fields from PDF
      const extracted = await parseAmeritasPdf(result.pdfBuffer);
      
      // Fill Wisdom form template
      const filledPdf = await fillWisdomForm(
        extracted,
        result.patient,
        path.join(__dirname, 'templates', 'wisdom_template.pdf')
      );

      // Save completed form to output folder
      const outputName = `${result.patient.patientName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const outputPath = path.join(__dirname, 'output', outputName);
      fs.writeFileSync(outputPath, filledPdf);

      completedForms.push({ patient: result.patient, outputPath });
      logger.info(`Completed: ${outputName}`);

    } catch (err) {
      logger.error(`Form fill failed for patient (logged by job ID): ${err.message}`);
      failures.push({ ...result, error: err.message });
    }
  }

  // Step 4: Summary report
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const summary = {
    totalPatients: ameritasPatients.length,
    completed: completedForms.length,
    failed: failures.length,
    durationMinutes: duration,
    timestamp: new Date().toISOString(),
  };

  logger.info('Daily job complete', summary);
  console.log('\n── DAILY SUMMARY ──────────────────────────────────');
  console.log(`  Patients processed: ${summary.totalPatients}`);
  console.log(`  Forms completed:    ${summary.completed}`);
  console.log(`  Failed:             ${summary.failed}`);
  console.log(`  Total runtime:      ${duration} minutes`);
  console.log(`  Output folder:      ${path.join(__dirname, 'output')}`);
  console.log('────────────────────────────────────────────────────\n');
}

// Run with: node main.js path/to/daily_sheet.xlsx
runDailyJob(process.argv[2] || './daily_sheet.xlsx').catch(console.error);
```

### 7.4 Ameritas Validation Checklist

Before considering the Ameritas pipeline "done", validate every item:

**Session & Login:**
- [ ] **Setup mode works** — `node main.js --setup-ameritas` opens visible browser, reaches login page
- [ ] **OTP flow completes** — operator enters credentials, receives OTP, enters it in the visible browser, checks "Remember this device", lands on dashboard
- [ ] **Session is saved** — `.sessions/ameritas/` folder is populated after setup mode
- [ ] **30-day cookie works** — run the daily job the next day; confirm no OTP prompt appears and the portal goes straight to dashboard
- [ ] **OTP expiry detection works** — simulate expired session (clear `.sessions/ameritas/` folder), run daily mode, confirm the clear error message appears and job stops gracefully
- [ ] **Login succeeds** with real provider credentials (no CAPTCHA triggered)

**Patient Processing:**
- [ ] **Member search** finds patient by Member ID + DOB correctly
- [ ] **PDF download** works — buffer received in memory without writing to disk
- [ ] **PDF parsing** extracts all ~20 fields correctly on at least 5 different patient PDFs
- [ ] **Null handling** — fields not found in PDF return `null`, not crash
- [ ] **Form filling** — every extracted field appears in the correct cell of the Wisdom template
- [ ] **Human delays** are actually sleeping (verify timing with console timestamps)
- [ ] **Logs contain zero PHI** — no patient names, DOBs, or Member IDs in log output
- [ ] **Output PDF is correct** — visual check against a manually completed form for same patient
- [ ] **End-to-end runtime** for 10 test patients is within expected range (~10–15 min)

### 7.5 Known Unknowns for Ameritas (Must Investigate)

> [!WARNING]
> These must be verified by manually navigating the Ameritas provider portal before writing the automation script.

1. **Exact login URL** — confirm the provider portal URL and whether it redirects
2. **Exact input field selectors** — Member ID field name, DOB field name, search button ID
3. **PDF download trigger** — what button/link triggers the PDF download? What's its selector?
4. **PDF is machine-readable** — verify the downloaded PDF has selectable text (not a scan). Use `pdf-parse` on a sample to confirm text extraction works.
5. **Session timeout** — how long does an Ameritas portal session last before auto-logout within a single day? If < 60 min for 50+ patients, need a keepalive ping (e.g. navigate to a dashboard element every 30 minutes).
6. **OTP mechanism** ✅ RESOLVED — Portal requires OTP on new device/browser. Offers "Remember this device" for 30 days. Handled via Playwright persistent context + manual setup mode. No further investigation needed.
7. **Rate limiting** — test with 3–5 patients in quick succession to confirm no rate limiting before deploying with full human delays.
8. **"Remember this device" checkbox label** — confirm the exact text/selector of the remember-device checkbox so the operator knows exactly what to check during setup mode. Document it in the README.


---

## 8. HIPAA Compliance

> [!CAUTION]
> This system handles Protected Health Information (PHI). Non-compliance penalties range from $100 to $50,000 per violation, up to $1.9M per year per violation category. **ALL items in this section are REQUIRED before the system processes real patient data.**

### 8.1 Business Associate Agreements (BAAs)

| Vendor / Party | BAA Requirement |
|----------------|-----------------|
| **Anthropic (Claude API)** | Required before sending ANY patient screenshot to the Vision API. Anthropic offers a BAA for enterprise/HIPAA tier. Standard pay-as-you-go API tier **does NOT include a BAA**. Contact: anthropic.com/contact-sales |
| **Cloud host (AWS/GCP/Azure)** | All three major cloud providers offer HIPAA BAAs. Required if hosting the automation server on any of these platforms. |
| **Credential vault provider** | AWS Secrets Manager, HashiCorp Vault, or equivalent. Required because portal credentials (which give access to PHI) are stored here. |
| **Each dental practice client** | The dental practice is the Covered Entity. Your automation system is their Business Associate. A standard BA agreement template is needed for each practice onboarded. |

> [!NOTE]
> For the **Ameritas MVP**, no patient data is sent to Anthropic (PDF parsing is local). However, a BAA with Anthropic must be in place **before** adding any carrier that uses Vision AI.

### 8.2 Technical Safeguards

| Control | Implementation |
|---------|---------------|
| **Screenshots/PDFs never touch disk** | All data held as in-memory `Buffer` objects. Never written to disk, never logged, garbage-collected after processing. |
| **No PHI in logs** | Logs contain: job IDs, carrier names, success/failure status, timestamps, operator IDs. Never patient names, member IDs, DOBs. |
| **Encrypted credential storage** | Portal login credentials stored in AWS Secrets Manager (or `.env` for local dev only). Never in source code or config files. |
| **All network communication over TLS** | Every network call (portals, Claude API, internal services) uses HTTPS. Enforced at infrastructure level. |
| **Minimum necessary PHI** | Targeted screenshot clipping captures only the benefits table — not the full patient record page. |
| **Role-based access control** | Operator role: submit jobs. Admin role: manage credentials. Reviewer role: see flagged forms. No unauthenticated access. |

### 8.3 Audit Trail

HIPAA requires audit logs to be retained for **6 years**. Every job generates:

- Job ID (internal reference, not PHI)
- Operator ID
- Practice ID
- Insurance carrier
- Timestamp (ISO 8601)
- IP address of requesting client
- Success/failure status
- Number of fields flagged for review

> Audit logs are stored in a **write-once, append-only** store. Rows are never updated or deleted.

---

## 9. Performance & Scaling

### 9.1 Time Per Patient

| Step | Time Estimate |
|------|---------------|
| Portal login | ~5 seconds (once per carrier session) |
| Navigate to patient | ~3–5 seconds |
| Expand all sections / Download PDF | ~2–4 seconds |
| Take screenshots or receive PDF | ~1–2 seconds |
| Claude Vision API call (if applicable) | ~3–8 seconds |
| PDF parsing (Ameritas) | ~0.5–1 second |
| Form filling + output | ~1–2 seconds |
| **Human-mimicry pause** | **25–75 seconds (random)** |
| **Total per patient** | **~40–100 seconds, average ~60 seconds** |

### 9.2 Daily Throughput and Parallelisation

At an average of 60 seconds per patient, a single machine processes approximately **60 patients per hour**.

| Configuration | Daily Throughput | Runtime |
|---------------|-----------------|---------|
| 1 machine, sequential | ~200 patients | ~3–3.5 hours |
| 1 machine, parallel carriers | ~200 patients | ~1.7 hours |
| **2 machines, split queue** | **~200–400 patients** | **~1.5–1.7 hours** |
| 2 machines, parallel carriers | ~400+ patients | ~1.5 hours |

**Strategy A — Parallel carrier sessions on one machine:** Different insurance carriers are independent. On a single machine, two or three carrier sessions can run concurrently in separate browser instances.

**Strategy B — Two machines splitting the queue:** The daily patient queue is split in half. Machine A takes patients 1–100, Machine B takes 101–200. Both start simultaneously.

### 9.3 Cost Breakdown at 200 Forms/Day

| Cost Item | Per Form | Per Day | Per Month (22 days) |
|-----------|----------|---------|---------------------|
| Claude Vision API | ~$0.025 | ~$5.00 | ~$110 |
| Server compute (cloud VM) | ~$0.003 | ~$0.60 | ~$40 |
| PDF filling + output storage | ~$0.001 | ~$0.20 | ~$15 |
| Credential vault (AWS Secrets) | ~$0.001 | ~$0.20 | ~$5 |
| **TOTAL infrastructure cost** | **~$0.030** | **~$6.00** | **~$170** |
| Revenue at $3/form | $3.00 | $600 | $13,200 |
| **Net after infrastructure** | **$2.97** | **$594** | **$13,030** |

> The above excludes a part-time human reviewer (~$800/month). Net monthly profit: **~$12,230 for 200 forms/day**.
>
> For **Ameritas specifically**: Claude Vision API cost is $0 (PDF parsing). Total cost per Ameritas form is ~$0.005 (compute + storage only).

---

## 10. Output Form — Wisdom Full Insurance Breakdown

### 10.1 Form Structure

The output form is the **Wisdom Full Insurance Breakdown** — a standardised two-page dental insurance verification form. The form has the following sections:

1. **Patient and Plan Information** — patient name, DOB, subscriber name/DOB, Member ID, insurance name/address, phone, Payor ID, group name/number, fee schedule, network status, effective date, plan type
2. **Maximums and Deductibles** — annual maximum, unlimited maximum flag, rollover max, deductible (individual and family), amounts applied to date, plan year type, missing tooth clause, waiting periods, COB
3. **Percentage Breakdown by Category** — coverage percentages for 11 categories: Preventative, Diagnostic, Restorative, Crowns, Endo, Perio, Removable, Fixed Prostho, Implants, OS, Adj; plus deductible applied and waiting period flags per category
4. **Frequencies and Limitations (Diagnostic/Preventative)** — frequency, limitations, and history on file for 11 procedure codes from D0120 to D1351
5. **Frequencies and Limitations (Restorative)** — frequencies, limitations, and downgrade/alt benefit for Composites, Crowns, Build-up, Onlays, Fixed Bridge, Removables, Implants
6. **Frequencies and Limitations (Periodontics)** — frequency, limitations, history for D4346, D4355, D4341/D4342, D4910
7. **Optional Codes** — custom codes with coverage %, limitations, frequencies; includes Arestin, implant abutments, implant crowns, occlusal guards, adjunctive testing
8. **Ortho** — ortho coverage flag, maximum, deductible, lifetime max, work in progress, coverage %, age limitations, payment schedule
9. **Notes** — free-text notes field for anything not captured by structured fields

### 10.2 Real Example — Talese Bussey CIGNA Form

| Field | Value |
|-------|-------|
| Patient | Talese Bussey — DOB 01/13/2005 |
| Subscriber | Masuncha Bussey — DOB 01/15/1976 — Member ID U51562819 |
| Insurance | CIGNA — Group: Duke Energy Corporation (#10235004) |
| Fee schedule | CIGNA DPPO Advanage — Accept assignment: YES |
| Network | In-Network — OON Benefits: YES |
| Effective date | 01/01/2026 — Plan runs on calendar year |
| Plan type | Indemnity — COB: Standard — Plan #Q5ZV0 NC |
| Missing tooth | YES — Waiting periods: NO — Pays on: SEAT |
| Coverage | Preventative 100%, Diagnostic 100%, Restorative 100%, Crowns 50%, Endo 50%, Perio 50%, Removable 50%, Fixed 50%, Implants 50%, OS 50%, Adj 50% |
| Prophy | 2x / calendar year — not shared |
| Fluoride | 2x / calendar year — no age limit |
| Sealants | 1x / 180 days — no age limit, posterior teeth |
| S/RP | 1x / 12 rolling months — 4 quads same day: YES |
| Ortho | YES — 50% coverage — no age limit — monthly payments — no lifetime max |
| Occlusal guards | 50% — bruxism only — 1x / 24 months |

---

## 11. Supported Insurance Portals

Each insurance carrier has its own portal with its own login URL and navigation path. The automation layer maintains one navigation script per portal.

| Carrier | Portal Details | Extraction Method | Priority |
|---------|---------------|-------------------|----------|
| **Ameritas** | `provider.ameritasgroup.com` | **PDF parsing (local)** — downloadable benefits PDF | **MVP — First** |
| **CIGNA** | `cignaforhcp.cigna.com` — Payor ID 62308, DPPO Advanage fee schedule | Vision AI (JS-heavy portal) | Phase 1 after Ameritas |
| **Delta Dental** | Delta Dental provider portal | HTML parsing (investigate first) | Phase 5 |
| **Aetna** | Aetna provider portal | HTML parsing or Vision AI | Phase 5 |
| **United Concordia** | United Concordia provider portal | HTML parsing or Vision AI | Phase 5 |

> Additional carriers can be added by: (1) writing a navigation script (~30 min per portal), (2) adding the portal URL to the carrier routing map, (3) determining the extraction method (PDF → HTML → Vision AI). The AI extraction layer requires **no changes** when new portals are added.

---

## 12. Build Plan — Recommended Development Order

### Phase 0 — Ameritas MVP (Current: 1–2 weeks)

This is the immediate focus. Everything must work before Phase 1 starts.

- [ ] Project scaffolding and file structure
- [ ] Excel sheet parser (reads daily sheet, groups by carrier)
- [ ] Ameritas navigation script (login, search by Member ID + DOB)
- [ ] PDF download interceptor (Playwright download event interception)
- [ ] PDF text parser (regex-based extraction of all required fields)
- [ ] Wisdom form filler (pdf-lib mapping of extracted fields to template)
- [ ] Human delay utilities (random pauses, human-speed typing)
- [ ] PHI-safe logger (logs job IDs/status only, no patient data)
- [ ] End-to-end test with 5–10 real Ameritas patients
- [ ] Output PDF visual validation against manually completed form

### Phase 1 — CIGNA + Core Pipeline Hardening (2–3 weeks)

- [ ] CIGNA navigation script (login, benefits page, expand-all, screenshots)
- [ ] Claude Vision API integration (base64 encode screenshots, extraction prompt, JSON parse)
- [ ] Confidence scoring implementation
- [ ] Error handling and retry logic (exponential backoff, graceful failure per patient)
- [ ] End-to-end test for CIGNA patients

### Phase 2 — Session Batching + Human Behaviour (1 week)

- [ ] Session batching: group by carrier, one login per carrier, all patients in one session
- [ ] stealth plugin integration (`playwright-extra` + stealth plugin)
- [ ] Full human-mimicry suite (all behaviours from Section 4.3)
- [ ] Between-carrier pause logic

### Phase 3 — Review UI + Delivery (1 week)

- [ ] Confidence flagging: mark low-confidence fields in the output form
- [ ] Review interface: simple web UI showing today's forms with flagged fields highlighted
- [ ] Form delivery: email or output folder delivery of completed PDFs
- [ ] Daily summary report (total processed, completed, flagged, failed)

### Phase 4 — HIPAA Compliance (1 week, parallel with Phase 3)

- [ ] PHI sanitisation in all log statements
- [ ] AWS Secrets Manager integration for credential storage
- [ ] Audit log implementation (write-once, append-only store)
- [ ] Role-based access control on job submission API
- [ ] BAA execution with Anthropic, cloud host, and first dental practice client

### Phase 5 — Additional Portals + Parallelisation (Ongoing)

- [ ] Delta Dental navigation script
- [ ] Aetna navigation script
- [ ] United Concordia navigation script
- [ ] Parallel carrier session runner (multiple browser instances simultaneously)
- [ ] Multi-machine queue splitter (distribute patient queue across N machines)

**Phase Summary:**
- Phase 0 → Working pipeline for Ameritas patients, zero AI cost
- Phase 1 → Working pipeline for CIGNA patients (most common carrier)
- Phase 2 → Production-safe from a bot-detection standpoint
- Phase 3 → Usable by a non-technical operator
- Phase 4 → Legally compliant to handle real patient data
- Phase 5 → Expands coverage and hits the 200+ forms/day target

---

## 13. Technology Stack

| Component | Technology & Rationale |
|-----------|------------------------|
| **Runtime** | Node.js 20 LTS — strong async/await support, native Buffer for image handling |
| **Browser automation** | Playwright (Microsoft) — cross-browser, reliable waits, built-in screenshot API, download interception |
| **Bot-detection evasion** | `playwright-extra` + `puppeteer-extra-plugin-stealth` — patches all known automation fingerprints |
| **AI extraction** | Anthropic `claude-sonnet-4-6` Vision API — structured JSON extraction from screenshots (fallback only) |
| **Excel parsing** | SheetJS (`xlsx`) — reads `.xlsx` daily sheets with no Excel installation required |
| **PDF parsing** | `pdf-parse` — extracts text from machine-readable PDFs (used for Ameritas MVP) |
| **PDF form filling** | `pdf-lib` (Node.js) — fills Wisdom PDF template fields programmatically |
| **Credential storage** | AWS Secrets Manager — encrypted at rest, IAM-controlled access, audit logged |
| **Cloud hosting** | AWS EC2 t3.medium (or equivalent) — ~$40/month, sufficient for 200 forms/day |
| **Audit logging** | AWS CloudTrail or append-only PostgreSQL table — 6-year retention for HIPAA |
| **Review UI** | Simple Express.js web server + plain HTML/JS |
| **Job scheduling** | `node-cron` — triggers daily workflow when morning sheet arrives |

---

## 14. Key Design Decisions Log

| Decision | Chosen Approach | Alternative Considered | Rationale |
|----------|----------------|----------------------|-----------|
| **Extraction method (default)** | Tiered: PDF → HTML → Vision AI | Vision AI for every carrier | Ameritas showed PDF parsing is free, more reliable, and zero latency. Only use AI when no better option exists. |
| **First carrier** | Ameritas (PDF download) | CIGNA (most common) | Ameritas lets us validate the entire pipeline at zero AI cost before spending money. |
| **Session management** | One login per carrier per day (batch) | One login per patient | Mirrors human behaviour exactly. Reduces login events from 200 to ~4/day. Avoids bot detection. |
| **Screenshot scope** | Targeted clips of benefit table elements only | Full-page screenshot | Reduces image tokens by ~70%, reducing API cost. Also a HIPAA minimum-necessary feature. |
| **Navigation control** | Deterministic Playwright scripts per portal | AI-driven navigation | Navigation is predictable and scriptable. AI-driven navigation is slower, unpredictable, harder to audit. |
| **Dropdown handling** | Generic expand-all before screenshotting | Per-portal custom expand logic | Generic approach works across all portals without per-portal maintenance. |
| **Human mimicry** | Random 25–75s pause + stealth plugin + human-speed typing | No special delay | Portals actively monitor request patterns. Without mimicry, accounts would be suspended within days. |
| **Credential storage** | AWS Secrets Manager encrypted vault | Environment variables or .env files | HIPAA requires encryption at rest for credentials that give access to PHI. .env files are plaintext. |
| **PHI in screenshots/PDFs** | In-memory buffers only, never written to disk | Save screenshots/PDFs for debugging | HIPAA requires PHI to be protected. Writing to disk creates PHI at rest. |
| **Scaling** | Two parallel machines splitting the queue | One machine with more threads | Portals may rate-limit per IP. Two machines = two IPs = natural distribution. |
| **Output format** | Filled Wisdom PDF template | New PDF generated from scratch | Dental practices already use the Wisdom form format. Filling the existing template maintains compatibility. |

---

## 15. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Portal blocks the session (bot detection) | Medium | High — stops all processing for that carrier | Stealth plugin + human-mimicry delays. Monitor for session drops. If blocked, pause 30 min and retry with fresh session. |
| Portal page redesign breaks navigation script | Medium | Medium — affects one carrier until fixed | Navigation failures trigger an alert. Fix takes ~1 hour per portal. Extraction layer requires no changes. |
| Ameritas PDF format changes | Low | Medium — regex patterns need updating | Abstract all regex patterns into configurable constants. Test on new PDFs before deploying pattern changes. |
| Claude API returns low-confidence extraction | Low–Medium | Low — field goes to human review queue | Confidence scoring flags uncertain fields. Human reviewer fills them. Accuracy improves as prompts are tuned. |
| Portal implements CAPTCHA or MFA | Low | High — blocks automated login | Monitor for new auth requirements. Some portals offer API access for registered providers — pursue official API when available. |
| PHI data breach | Very Low (with controls) | Catastrophic — HIPAA penalties + client loss | In-memory only PHI, encrypted credentials, BAAs, audit logs, TLS everywhere. Regular security review. |
| Insurance carrier changes coverage data format | Medium | Low — extraction still works (Vision) | Vision API reads whatever is rendered. Format changes do not break extraction. For PDF carriers: update regex patterns. |
| Daily sheet format changes | Low | Low — parser needs updating | Sheet parser is abstracted into one function. Column mapping is configurable. Update takes under 1 hour. |
| Ameritas PDF is image-based (scanned) | Low | High — pdf-parse won't work | Test on a real sample PDF before building. If image-based, fall back to Vision AI for Ameritas too. |

---

## 16. Future Carrier Roadmap

As the system matures beyond the Ameritas MVP, each new carrier is evaluated using the tiered extraction method:

| Carrier | Investigation Steps |
|---------|-------------------|
| **CIGNA** | Check for downloadable PDF → Likely needs Vision AI. Most common carrier — highest priority after Ameritas. |
| **Delta Dental** | Check for downloadable PDF → Check DOM stability → Likely HTML parsing possible. |
| **Aetna** | Check for downloadable PDF → Portal is known to be JS-heavy, may need Vision AI. |
| **United Concordia** | Check for downloadable PDF → Common for military plans. |
| **MetLife** | Future expansion — investigate portal. |
| **Guardian** | Future expansion — investigate portal. |
| **Humana** | Future expansion — investigate portal. |

**Per-carrier addition process (30–60 minutes per carrier):**
1. Manually walk through the portal and note every URL, selector, and interaction
2. Write the navigation script (`carriers/<carriername>/navigate.js`)
3. Determine extraction method (PDF/HTML/Vision)
4. Write the extraction module (`carriers/<carriername>/parse*.js`)
5. Add carrier to the routing map in `main.js`
6. Test with 5 real patient forms
7. Deploy

---

## 17. Glossary

| Term | Definition |
|------|------------|
| **BAA (Business Associate Agreement)** | Legal HIPAA contract between a Covered Entity (dental practice) and a Business Associate (this system) that handles PHI on their behalf. |
| **Covered Entity** | Under HIPAA, the dental practice that owns the patient data. |
| **Business Associate** | Any party that handles PHI on behalf of a Covered Entity. This automation system is a Business Associate. |
| **PHI (Protected Health Information)** | Any individually identifiable health information — patient name, DOB, Member ID, diagnosis codes, treatment history, insurance details. |
| **Playwright** | Microsoft's browser automation library for Node.js. Controls Chromium, Firefox, or WebKit browsers programmatically. |
| **Stealth plugin** | A Playwright/Puppeteer add-on that patches browser properties used to detect automation. |
| **Vision API** | Claude's ability to accept images as input and extract information from them — used here to read insurance portal screenshots. |
| **Session batching** | Processing all patients for a given insurance carrier within a single login session, rather than logging in separately for each patient. |
| **Wisdom form** | The Wisdom Full Insurance Breakdown form — a standardised two-page dental insurance verification form. |
| **Member ID** | The unique identifier assigned by an insurance carrier to a subscriber. Primary search key for every portal lookup. |
| **Subscriber** | The primary holder of the insurance policy. May differ from the patient (e.g. a parent whose child is the patient). |
| **Coverage percentage** | The proportion of a dental procedure's cost covered by the insurance plan (e.g. 100% preventative, 50% crowns). |
| **Annual maximum** | The maximum dollar amount an insurance plan will pay in a given plan year. Common values: $1,000–$2,000. |
| **Deductible** | The amount the patient must pay out-of-pocket before insurance coverage begins. Individual and family deductibles apply. |
| **Frequency limitation** | A restriction on how often a covered procedure can be performed within a time period. |
| **Missing tooth clause** | A clause that excludes coverage for replacing teeth that were missing before the policy's effective date. |
| **COB (Coordination of Benefits)** | Rules governing how two or more insurance plans pay when a patient is covered by more than one plan. |
| **Payor ID** | A standardised code identifying the insurance carrier, used in electronic billing systems. |
| **DPPO (Dental Preferred Provider Organisation)** | A type of dental insurance plan where in-network providers have pre-negotiated rates. |
| **DMO (Dental Maintenance Organisation)** | A type of dental insurance plan requiring patients to use a primary care dentist within a specific network. |

---

*This document is the single source of truth for the FillSure Dental Insurance Verification Automation System. Version 1.1 — June 2026.*

*All architectural decisions, implementation patterns, HIPAA requirements, and the complete Ameritas MVP implementation plan are captured here. Any changes to the system architecture should be reflected in this document.*
