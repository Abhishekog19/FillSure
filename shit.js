const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageBreak, VerticalAlign
} = require('docx');
const fs = require('fs');

// ─── colour palette ────────────────────────────────────────────────
const C = {
  navy:      "1B3A5C",
  teal:      "0F6E56",
  amber:     "854F0B",
  red:       "A32D2D",
  lightBlue: "D6E8F5",
  lightGreen:"E1F5EE",
  lightAmber:"FAEEDA",
  lightRed:  "FCEBEB",
  lightGray: "F5F5F5",
  midGray:   "CCCCCC",
  darkGray:  "444444",
  white:     "FFFFFF",
};

// ─── border helpers ────────────────────────────────────────────────
const border  = (color="CCCCCC") => ({ style: BorderStyle.SINGLE, size: 1, color });
const borders = (color="CCCCCC") => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ─── reusable paragraph helpers ───────────────────────────────────
const sp = (before=0,after=0) => ({ spacing: { before, after } });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, font:"Arial", size:32, bold:true, color:C.navy })],
    ...sp(320,160),
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.navy, space:1 } }
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font:"Arial", size:26, bold:true, color:C.teal })],
    ...sp(260,120),
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, font:"Arial", size:22, bold:true, color:C.darkGray })],
    ...sp(200,80),
  });
}
function body(text, opts={}) {
  return new Paragraph({
    children: [new TextRun({ text, font:"Arial", size:22, color: opts.color||C.darkGray, bold: opts.bold||false, italics: opts.italic||false })],
    ...sp(opts.before||60, opts.after||60),
    alignment: opts.align || AlignmentType.LEFT,
  });
}
function bullet(text, level=0) {
  return new Paragraph({
    numbering: { reference:"bullets", level },
    children: [new TextRun({ text, font:"Arial", size:22, color:C.darkGray })],
    ...sp(40,40),
  });
}
function numbered(text, level=0) {
  return new Paragraph({
    numbering: { reference:"numbers", level },
    children: [new TextRun({ text, font:"Arial", size:22, color:C.darkGray })],
    ...sp(40,40),
  });
}
function blank(size=160) {
  return new Paragraph({ children:[new TextRun("")], spacing:{ before:size, after:0 } });
}
function pageBreak() {
  return new Paragraph({ children:[new PageBreak()] });
}

// ─── callout box (shaded single-cell table) ───────────────────────
function callout(lines, fillColor, borderColor, labelText=null) {
  const children = [];
  if (labelText) children.push(new Paragraph({
    children:[new TextRun({ text: labelText, font:"Arial", size:20, bold:true, color:borderColor })],
    spacing:{ before:0, after:60 }
  }));
  lines.forEach(l => children.push(new Paragraph({
    children:[new TextRun({ text:l, font:"Arial", size:20, color:C.darkGray })],
    spacing:{ before:30, after:30 }
  })));
  return new Table({
    width:{ size:9360, type:WidthType.DXA },
    columnWidths:[9360],
    rows:[new TableRow({ children:[new TableCell({
      borders: borders(borderColor),
      shading:{ fill:fillColor, type:ShadingType.CLEAR },
      margins:{ top:120, bottom:120, left:200, right:200 },
      children,
    })]})]
  });
}

// ─── two-column table ─────────────────────────────────────────────
function twoColTable(rows, headerLeft="", headerRight="") {
  const COL = [4680, 4680];
  const makeHeader = (txt) => new TableCell({
    borders: borders(C.navy),
    shading:{ fill:C.navy, type:ShadingType.CLEAR },
    margins:{ top:80, bottom:80, left:140, right:140 },
    children:[new Paragraph({ children:[new TextRun({ text:txt, font:"Arial", size:20, bold:true, color:C.white })] })]
  });
  const makeCell = (txt, fill=C.white) => new TableCell({
    borders: borders(C.midGray),
    shading:{ fill, type:ShadingType.CLEAR },
    margins:{ top:80, bottom:80, left:140, right:140 },
    children:[new Paragraph({ children:[new TextRun({ text:txt, font:"Arial", size:20, color:C.darkGray })] })]
  });

  const tableRows = [];
  if (headerLeft||headerRight) {
    tableRows.push(new TableRow({ children:[ makeHeader(headerLeft), makeHeader(headerRight) ] }));
  }
  rows.forEach(([left,right],i) => {
    tableRows.push(new TableRow({ children:[ makeCell(left, i%2===0?C.white:C.lightGray), makeCell(right, i%2===0?C.white:C.lightGray) ] }));
  });
  return new Table({ width:{ size:9360, type:WidthType.DXA }, columnWidths:COL, rows:tableRows });
}

// ─── four-column table ────────────────────────────────────────────
function fourColTable(headers, rows) {
  const COL = [2340,2340,2340,2340];
  const makeH = (t) => new TableCell({
    borders: borders(C.navy), shading:{ fill:C.navy, type:ShadingType.CLEAR },
    margins:{ top:80, bottom:80, left:100, right:100 },
    children:[new Paragraph({ children:[new TextRun({ text:t, font:"Arial", size:19, bold:true, color:C.white })] })]
  });
  const makeC = (t, fill=C.white) => new TableCell({
    borders: borders(C.midGray), shading:{ fill, type:ShadingType.CLEAR },
    margins:{ top:80, bottom:80, left:100, right:100 },
    children:[new Paragraph({ children:[new TextRun({ text:t, font:"Arial", size:19, color:C.darkGray })] })]
  });
  const tableRows = [new TableRow({ children: headers.map(h=>makeH(h)) })];
  rows.forEach(([a,b,c,d],i) => {
    const f = i%2===0?C.white:C.lightGray;
    tableRows.push(new TableRow({ children:[makeC(a,f),makeC(b,f),makeC(c,f),makeC(d,f)] }));
  });
  return new Table({ width:{ size:9360, type:WidthType.DXA }, columnWidths:COL, rows:tableRows });
}

// ══════════════════════════════════════════════════════════════════
//  BUILD DOCUMENT
// ══════════════════════════════════════════════════════════════════
const doc = new Document({
  styles: {
    default: { document: { run: { font:"Arial", size:22 } } },
    paragraphStyles: [
      { id:"Heading1", name:"Heading 1", basedOn:"Normal", next:"Normal", quickFormat:true,
        run:{ size:32, bold:true, font:"Arial", color:C.navy },
        paragraph:{ spacing:{ before:320, after:160 }, outlineLevel:0 } },
      { id:"Heading2", name:"Heading 2", basedOn:"Normal", next:"Normal", quickFormat:true,
        run:{ size:26, bold:true, font:"Arial", color:C.teal },
        paragraph:{ spacing:{ before:260, after:120 }, outlineLevel:1 } },
      { id:"Heading3", name:"Heading 3", basedOn:"Normal", next:"Normal", quickFormat:true,
        run:{ size:22, bold:true, font:"Arial", color:C.darkGray },
        paragraph:{ spacing:{ before:200, after:80 }, outlineLevel:2 } },
    ]
  },
  numbering: {
    config: [
      { reference:"bullets", levels:[{ level:0, format:LevelFormat.BULLET, text:"•", alignment:AlignmentType.LEFT,
          style:{ paragraph:{ indent:{ left:720, hanging:360 } } } },
        { level:1, format:LevelFormat.BULLET, text:"◦", alignment:AlignmentType.LEFT,
          style:{ paragraph:{ indent:{ left:1080, hanging:360 } } } }] },
      { reference:"numbers", levels:[{ level:0, format:LevelFormat.DECIMAL, text:"%1.", alignment:AlignmentType.LEFT,
          style:{ paragraph:{ indent:{ left:720, hanging:360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width:12240, height:15840 },
        margin: { top:1080, right:1080, bottom:1080, left:1080 }
      }
    },
    children: [

      // ══════════════════════════════════════════════
      //  COVER / TITLE
      // ══════════════════════════════════════════════
      blank(400),
      new Paragraph({
        children:[new TextRun({ text:"Dental Insurance Verification", font:"Arial", size:52, bold:true, color:C.navy })],
        alignment:AlignmentType.CENTER, spacing:{ before:0, after:120 }
      }),
      new Paragraph({
        children:[new TextRun({ text:"Automation System", font:"Arial", size:52, bold:true, color:C.teal })],
        alignment:AlignmentType.CENTER, spacing:{ before:0, after:200 }
      }),
      new Paragraph({
        children:[new TextRun({ text:"Full Product Documentation — Architecture, Design Decisions & Implementation Guide", font:"Arial", size:22, color:C.darkGray, italics:true })],
        alignment:AlignmentType.CENTER, spacing:{ before:0, after:80 }
      }),
      new Paragraph({
        children:[new TextRun({ text:"Version 1.0  |  June 2026  |  Confidential", font:"Arial", size:20, color:C.midGray })],
        alignment:AlignmentType.CENTER, spacing:{ before:0, after:400 }
      }),

      // ── divider ──
      new Paragraph({ border:{ bottom:{ style:BorderStyle.SINGLE, size:8, color:C.navy, space:1 } }, spacing:{ before:0, after:400 } }),

      // ── quick-stat row ──
      new Table({
        width:{ size:9360, type:WidthType.DXA }, columnWidths:[2340,2340,2340,2340],
        rows:[new TableRow({ children:[
          ...[
            ["$3", "Revenue per form"],
            ["200+", "Forms per day target"],
            ["~$0.03", "Cost per form (API)"],
            ["~97%", "Gross margin on API cost"],
          ].map(([val,lbl]) => new TableCell({
            borders: noBorders,
            shading:{ fill:C.lightBlue, type:ShadingType.CLEAR },
            margins:{ top:120, bottom:120, left:120, right:120 },
            verticalAlign: VerticalAlign.CENTER,
            children:[
              new Paragraph({ children:[new TextRun({ text:val, font:"Arial", size:40, bold:true, color:C.navy })], alignment:AlignmentType.CENTER, spacing:{ before:0, after:40 } }),
              new Paragraph({ children:[new TextRun({ text:lbl, font:"Arial", size:18, color:C.darkGray })], alignment:AlignmentType.CENTER, spacing:{ before:0, after:0 } }),
            ]
          }))
        ]})]
      }),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 1 — EXECUTIVE SUMMARY
      // ══════════════════════════════════════════════
      h1("1. Executive Summary"),
      body("Dental billing specialists today spend 5–10 minutes manually filling a dental insurance verification form for each patient. They log into an insurance portal (CIGNA, Aetna, Delta Dental, United, etc.), search for the patient by Member ID, navigate through multiple pages, expand dropdowns, and transcribe data onto a standardized form — such as the Wisdom Full Insurance Breakdown form. At $3 per form and a manual cap of 10–20 forms per day per person, income is tightly capped."),
      blank(80),
      body("This system automates the entire workflow end-to-end. The operator uploads the dental practice's daily patient sheet (Excel), the system logs into each insurance portal once per session, navigates to each patient's benefits page, expands all data sections, screenshots only the relevant content, sends those screenshots to the Claude Vision AI for structured data extraction, fills the output form, and delivers completed forms — all with minimal human involvement."),
      blank(80),
      callout([
        "A human billing specialist: 10–20 forms/day, 5–10 min each, capped income ~$30–60/day.",
        "This system: 200+ forms/day, ~1.5–2 hours total runtime, API cost ~$6/day, net ~$594/day.",
        "Scale path: two machines running in parallel → 400+ forms/day from one operator.",
      ], C.lightGreen, C.teal, "Key business impact"),

      blank(200),

      // ══════════════════════════════════════════════
      //  SECTION 2 — PROBLEM STATEMENT
      // ══════════════════════════════════════════════
      h1("2. Problem Statement"),
      h2("2.1  What the manual process looks like today"),
      body("Each morning a dental practice sends its billing team a spreadsheet (the \"daily sheet\") containing that day's patients. Each row includes:"),
      bullet("Appointment date and done date"),
      bullet("Patient name and date of birth"),
      bullet("Insurance carrier (e.g. CIGNA, Aetna)"),
      bullet("Subscriber name and subscriber date of birth"),
      bullet("Member ID"),
      blank(80),
      body("The billing specialist then performs the following for every patient:"),
      numbered("Open a browser, navigate to the correct insurance portal URL"),
      numbered("Log in with the dental practice's provider credentials"),
      numbered("Navigate to the Eligibility or Benefits lookup section"),
      numbered("Enter the patient's Member ID and date of birth into the portal search form"),
      numbered("Wait for results to load, then click into the correct plan"),
      numbered("Click every dropdown, accordion, and \"Show more\" button to reveal all plan details"),
      numbered("Read values from multiple pages/tabs: maximums, deductibles, coverage percentages, frequencies, limitations"),
      numbered("Manually transcribe all values into the correct fields of the Wisdom Full Insurance Breakdown form"),
      numbered("Repeat for every patient — logging in again each time"),
      blank(80),
      body("This process takes 5–10 minutes per patient. A fast specialist might complete 15–20 forms per day. Income is therefore hard-capped — not by skill, but by the speed of manual data entry."),

      blank(100),
      h2("2.2  Why this is a solvable automation problem"),
      body("The process is highly repetitive, involves structured data, and follows a deterministic path through well-defined portal interfaces. The inputs are always the same fields, the outputs always go into the same form, and the navigation path per portal is fixed. This is the ideal profile for browser automation combined with AI-based visual data extraction."),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 3 — SYSTEM OVERVIEW
      // ══════════════════════════════════════════════
      h1("3. System Architecture Overview"),
      body("The system has five distinct layers, each with a clearly separated responsibility:"),
      blank(80),
      twoColTable([
        ["Layer 1: Input ingestion",       "Reads the daily patient Excel sheet. Parses every patient row. Groups patients by insurance carrier."],
        ["Layer 2: Browser automation",    "Playwright logs into each portal once per carrier. Navigates to each patient's benefits page. Expands all dropdowns. Takes targeted screenshots."],
        ["Layer 3: AI vision extraction",  "Screenshots are sent to Claude Vision API. Claude reads the rendered page like a human and returns structured JSON with all form field values."],
        ["Layer 4: Form filling",          "The structured JSON is mapped to the fields of the Wisdom PDF/form template. The completed form is generated."],
        ["Layer 5: Review & delivery",     "Low-confidence fields are flagged for a human reviewer. Completed forms are delivered to the operator."],
      ], "Layer", "Responsibility"),
      blank(160),

      h2("3.1  Why Vision API instead of HTML scraping"),
      body("An earlier design considered scraping the raw HTML from portal pages and parsing it with code selectors (e.g. document.querySelector('#annual-max')). This approach was rejected for the following reasons:"),
      blank(80),
      twoColTable([
        ["HTML scraping", "Vision API (chosen approach)"],
        ["Breaks whenever the portal redesigns their page (CSS selectors stop matching)", "Portal layout changes are irrelevant — Claude reads the rendered screenshot as a human would"],
        ["JavaScript-rendered content is invisible to the scraper (loads after page ready)", "Screenshot always captures the fully rendered page after all JS has run"],
        ["Requires 100+ lines of custom selector logic per portal", "Zero per-portal parsing logic — same code works for every carrier"],
        ["Silent failures when a field moves or is renamed", "Claude returns null and flags the field for review — never silently wrong"],
        ["Multi-page data requires complex state management", "Multiple screenshots sent together in one API call — Claude cross-references them"],
      ], "HTML scraping (rejected)", "Vision API (chosen)"),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 4 — WEB AUTOMATION LAYER
      // ══════════════════════════════════════════════
      h1("4. Web Automation Layer (Playwright)"),
      h2("4.1  Technology choice"),
      body("Microsoft Playwright is used as the browser automation library. It controls a real Chromium browser in headless mode (no visible window), which means the portal experiences a fully functioning browser — cookies, sessions, JavaScript execution, and network requests all work identically to a real user's browser."),
      blank(80),
      body("The stealth plugin (playwright-extra + puppeteer-extra-plugin-stealth) is applied to hide all automation fingerprints. This patches navigator.webdriver, chrome.runtime, and other browser properties that portals use to detect bots."),

      blank(100),
      h2("4.2  Session batching — one login per portal per day"),
      body("This is the most important architectural decision in the automation layer. A naive implementation would log in for every patient and log out after. This is how a poorly designed bot behaves — not how a human works."),
      blank(80),
      body("A real billing specialist logs into CIGNA once in the morning and searches for every CIGNA patient one after another in that same session. This system mirrors that exactly:"),
      blank(80),
      callout([
        "Step 1: Parse daily sheet and group all patients by carrier.",
        "Step 2: For each carrier — login ONCE, process ALL patients for that carrier back-to-back, then logout ONCE.",
        "Step 3: Natural pause between carriers (3–8 minutes), like a human switching to a different portal.",
        "Result: For 50 CIGNA patients — 1 login, 50 patient lookups, 1 logout. Not 50 logins.",
      ], C.lightBlue, C.navy, "Session batching flow"),
      blank(100),

      h2("4.3  Human-like behaviour (anti-detection)"),
      body("Portals monitor request patterns to detect bots. The system is designed to be indistinguishable from a human billing specialist working through their morning queue. The following measures are implemented:"),
      blank(80),
      fourColTable(
        ["Behaviour", "Human reality", "Bot implementation", "Why it matters"],
        [
          ["Pause between patients", "30–90 seconds — reading, copy-pasting, thinking", "Random delay: 25–75 seconds between each patient lookup", "Portals track requests-per-minute. Too fast = flagged."],
          ["Typing speed", "40–120ms between keystrokes — never instant", "page.keyboard.type() with random 40–120ms delay per character", "Instant field injection triggers bot detection heuristics."],
          ["Mouse movement", "Cursor moves to button then clicks slightly off-centre", "mouse.move() with 10 intermediate steps, click slightly off-centre", "Straight-line instant teleportation is a bot signal."],
          ["Occasional long pause", "Distraction, phone call, bathroom break", "15% chance of a 2–4 minute pause between patients", "Makes the session time distribution match human patterns."],
          ["Browser fingerprint", "Chrome 125, Windows 10, US timezone, 1440×900", "userAgent, viewport, locale, timezoneId set to realistic values", "Default Playwright fingerprint is widely recognised by portals."],
          ["Scrolling", "Humans always scroll before clicking", "Scroll 100–400px before interacting with any element", "Interaction without any scroll is a bot pattern."],
          ["Between portals", "Close one portal, take a break, open the next", "3–8 minute random pause between carrier sessions", "Instant portal-switching is inhuman."],
        ]
      ),

      blank(100),
      h2("4.4  Dropdown and accordion expansion"),
      body("Insurance portal benefits pages frequently hide data behind expandable sections — accordions, dropdown panels, \"Show more\" buttons. All of these must be expanded before screenshotting, or the data will be missing from the image."),
      blank(80),
      body("The system runs a generic expand-all pass before any screenshot is taken. It targets every element matching common expand patterns (aria-expanded=\"false\", .accordion-toggle, [data-toggle=\"collapse\"], buttons containing \"Show\" or \"View more\" or \"+\"). Each matching element is clicked with a short wait after each click for animations to complete. A final networkidle wait ensures all lazy-loaded content has appeared."),
      blank(80),
      callout([
        "This approach is portal-agnostic — it does not need to know the specific expand button IDs for each portal.",
        "The try/catch around each click silently skips buttons that become stale or hidden after others are clicked.",
        "After expansion, waitForLoadState('networkidle') ensures all dynamically loaded content is fully rendered before any screenshot is taken.",
      ], C.lightAmber, C.amber, "Important notes on expansion"),

      blank(100),
      h2("4.5  Targeted screenshot clipping"),
      body("Instead of screenshotting the full page (which includes navigation bars, headers, footers, sidebars — all wasting tokens), the system locates each specific data section element and screenshots only its bounding box."),
      blank(80),
      body("Playwright's element.boundingBox() returns the exact pixel coordinates of the element. The screenshot is then clipped to those coordinates plus a small 10–20px padding on all sides to ensure text at edges is not cut off. A typical form's data fits into 3–5 focused clips of approximately 800×400 pixels each — far smaller than a full-page screenshot and containing only relevant information."),
      blank(80),
      body("This clipping approach is also a HIPAA compliance feature — by capturing only the benefits table and not the full patient record page, the system processes the minimum necessary PHI."),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 5 — AI EXTRACTION LAYER
      // ══════════════════════════════════════════════
      h1("5. AI Vision Extraction Layer (Claude API)"),
      h2("5.1  How it works"),
      body("Once all screenshots are captured for a patient, they are base64-encoded and sent to the Claude Vision API (claude-sonnet-4-6) in a single API call. All screenshots for that patient are included together — Claude can cross-reference information across pages just as a human would when flipping between tabs."),
      blank(80),
      body("The prompt instructs Claude to act as a dental billing specialist reading benefits screenshots, and to return a single JSON object containing every field required by the Wisdom form. The key constraint: return null for any field not clearly visible, never guess."),

      blank(100),
      h2("5.2  Fields extracted"),
      body("The following fields are extracted from the portal screenshots and mapped to the Wisdom Full Insurance Breakdown form:"),
      blank(80),
      fourColTable(
        ["Category", "Field", "Form location", "Example value"],
        [
          ["Plan info",    "Annual maximum",              "MAXIMUMS section",             "$1,500"],
          ["Plan info",    "Deductible (individual)",     "DEDUCTIBLES section",          "$50"],
          ["Plan info",    "Deductible (family)",         "DEDUCTIBLES section",          "$150"],
          ["Plan info",    "Plan year type",              "Plan runs on",                 "Calendar year"],
          ["Plan info",    "Missing tooth clause",        "YES/NO checkbox",              "YES"],
          ["Plan info",    "Waiting periods",             "YES/NO checkbox",              "NO"],
          ["Coverage %",   "Preventative",                "% COVERAGE row",               "100%"],
          ["Coverage %",   "Diagnostic",                  "% COVERAGE row",               "100%"],
          ["Coverage %",   "Restorative",                 "% COVERAGE row",               "100%"],
          ["Coverage %",   "Crowns",                      "% COVERAGE row",               "50%"],
          ["Coverage %",   "Endodontic",                  "% COVERAGE row",               "50%"],
          ["Coverage %",   "Periodontic",                 "% COVERAGE row",               "50%"],
          ["Coverage %",   "Oral surgery",                "% COVERAGE row",               "50%"],
          ["Coverage %",   "Implants",                    "% COVERAGE row",               "50%"],
          ["Frequencies",  "Prophy (D1110/D1120)",        "FREQUENCIES table",            "2x / cal year"],
          ["Frequencies",  "Bitewings (D0270,2,4)",       "FREQUENCIES table",            "No freq / no limits"],
          ["Frequencies",  "Full X-ray (D0210/D0330)",    "FREQUENCIES table",            "1x / 3 years"],
          ["Frequencies",  "Periodic exam (D0120)",       "FREQUENCIES table",            "4x / 12 rolling months"],
          ["Frequencies",  "Sealants (D1351)",            "FREQUENCIES table",            "1x / 180 days"],
          ["Periodontics", "Scaling w/ inflammation",     "PERIODONTICS table",           "1x / cal year"],
          ["Periodontics", "S/RP (D4341/D4342)",          "PERIODONTICS table",           "1x / 12 rolling months"],
          ["Periodontics", "Perio maintenance (D4910)",   "PERIODONTICS table",           "4x / cal year"],
          ["Ortho",        "Ortho coverage",              "ORTHO section",                "YES — 50%"],
          ["Ortho",        "Lifetime maximum",            "ORTHO section",                "N — no lifetime max"],
          ["Optional",     "Occlusal guards (D9944)",     "OPTIONAL CODES table",         "50% — bruxism only"],
          ["Optional",     "Arestin (D4381)",             "OPTIONAL CODES table",         "50% — 1x/12 months"],
        ]
      ),

      blank(100),
      h2("5.3  Confidence scoring and flagging"),
      body("Every extracted field includes a confidence rating: high, medium, or low. This is returned as a separate confidence object alongside the data. Any field rated low confidence is automatically flagged for human review."),
      blank(80),
      body("In addition, a validation layer checks all values against expected ranges (e.g. coverage percentages must be 0–100, annual maximums unlikely to exceed $10,000, deductibles unlikely to exceed $500). Out-of-range values are flagged regardless of confidence rating."),
      blank(80),
      callout([
        "High confidence fields: populated directly into the form with no review needed.",
        "Medium confidence fields: populated but highlighted in the review UI for a quick sanity check.",
        "Low confidence fields: left blank or marked for human lookup — the reviewer fills these manually.",
        "This means the human reviewer touches maybe 5–10% of fields, not 100% of the form.",
      ], C.lightGreen, C.teal, "How the review workflow works"),

      blank(100),
      h2("5.4  Multi-page handling"),
      body("The Wisdom form requires data from multiple sections of the portal that may appear on different pages or tabs. The system captures a screenshot of each relevant section and sends all screenshots in a single Claude API call. Claude sees all pages simultaneously and extracts data from the correct section for each field — identical to a human reading across multiple open tabs."),
      blank(80),
      body("Typical page breakdown per portal:"),
      bullet("Page 1: Plan overview, coverage percentages, deductibles, maximums"),
      bullet("Page 2: Frequencies and limitations (Diagnostic/Preventative section)"),
      bullet("Page 3: Restorative frequencies, periodontics, optional codes"),
      bullet("Page 4: Ortho section (if applicable)"),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 6 — NAVIGATION FLOW
      // ══════════════════════════════════════════════
      h1("6. Portal Navigation Flow"),
      h2("6.1  The navigation principle"),
      body("Navigation through each portal is scripted as a deterministic sequence — not AI-driven. This is a deliberate design decision. The AI's job is to read screenshots; Playwright's job is to click buttons and fill forms. These responsibilities never mix."),
      blank(80),
      body("Each portal gets one navigation function, written once by hand-walking through the portal and noting every click and field. This takes approximately 30 minutes per portal and runs reliably thereafter. The navigation script does not change unless the portal's page structure fundamentally changes."),

      blank(100),
      h2("6.2  Standard navigation steps (CIGNA example)"),
      body("Based on the Talese Bussey CIGNA form from the uploaded PDF, the navigation flow for CIGNA is:"),
      blank(80),
      numbered("Navigate to https://cignaforhcp.cigna.com/app/login"),
      numbered("Fill username and password fields; click login button"),
      numbered("Wait for provider dashboard to load"),
      numbered("Click the Eligibility/Benefits navigation link"),
      numbered("Select search type: Member ID"),
      numbered("Fill: Member ID (from daily sheet column H), Date of Birth (column D), Date of Service"),
      numbered("Submit search; wait for eligibility results"),
      numbered("Click into the matching plan result row"),
      numbered("Wait for benefits detail page to load"),
      numbered("Run expand-all pass: click every collapsed section"),
      numbered("Wait for networkidle after all expansions"),
      numbered("Capture targeted screenshots of each benefits section"),
      numbered("Move to next patient — NO re-login, same session continues"),

      blank(100),
      h2("6.3  Reading the daily sheet"),
      body("The system reads the daily Excel sheet provided by the dental practice each morning. From the Leary Family Dentistry sheet uploaded during this design session, the columns are:"),
      blank(80),
      twoColTable([
        ["Column A — APPT DT",   "Appointment date — used for date of service field in portal search"],
        ["Column B — DONE DT",   "Done date — informational, used for audit log"],
        ["Column C — PATIENT",   "Patient full name — for form header and logging"],
        ["Column D — PT. DOB",   "Patient date of birth — used in portal search form"],
        ["Column E — CARRIER",   "Insurance carrier name — determines which portal to use"],
        ["Column F — SUB NAME",  "Subscriber name — may differ from patient (e.g. Paul Campanelli, subscriber Kathryn Campanelli)"],
        ["Column G — SUB DOB",   "Subscriber date of birth — used in some portal searches"],
        ["Column H — MEMBER ID", "Member ID — primary search key for every portal lookup"],
        ["Column I — NOTES",     "Practice notes — read and passed through to review queue"],
        ["Column J — NAME",      "Operator name — logged for audit trail"],
      ], "Column", "Usage in system"),
      blank(80),
      callout([
        "Real example from Leary sheet: Paul Campanelli (CIGNA, Member ID U91189060) — patient DOB 8/5/1973, subscriber Kathryn Campanelli DOB 7/3/1974.",
        "David Teague (CIGNA, Member ID U3376688401) — same subscriber as patient.",
        "Both are CIGNA — processed in the same session, back to back.",
        "Note on sheet mentions 100/90/60 HMO coverage discrepancy — this would be flagged for human review.",
      ], C.lightAmber, C.amber, "Real data example from uploaded sheet"),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 7 — HIPAA COMPLIANCE
      // ══════════════════════════════════════════════
      h1("7. HIPAA Compliance"),
      callout([
        "This system handles Protected Health Information (PHI): patient names, dates of birth, member IDs, insurance details, and dental treatment history.",
        "HIPAA's Security Rule (45 CFR Part 164) requires Technical Safeguards for any system that creates, receives, maintains, or transmits ePHI.",
        "Non-compliance penalties range from $100 to $50,000 per violation, up to $1.9M per year per violation category.",
        "ALL items in this section are REQUIRED before the system processes real patient data.",
      ], C.lightRed, C.red, "CRITICAL — read before going live"),

      blank(100),
      h2("7.1  Business Associate Agreements (BAAs)"),
      body("A Business Associate Agreement is a legal contract required by HIPAA whenever PHI is shared with a third-party vendor. The following BAAs must be signed before any real patient data is processed:"),
      blank(80),
      twoColTable([
        ["Anthropic (Claude API)", "Required before sending ANY patient screenshot to the Vision API. Anthropic offers a BAA for enterprise/HIPAA tier customers. Contact: anthropic.com/contact-sales. The standard pay-as-you-go API tier does NOT include a BAA."],
        ["Cloud host (AWS/GCP/Azure)", "All three major cloud providers offer HIPAA BAAs. Required if hosting the automation server on any of these platforms."],
        ["Credential vault provider", "AWS Secrets Manager, HashiCorp Vault, or equivalent. Required because portal credentials (which give access to PHI) are stored here."],
        ["Each dental practice client", "The dental practice is the Covered Entity. Your automation system is their Business Associate. A standard BA agreement template is needed for each practice onboarded."],
      ], "Vendor / Party", "BAA requirement"),

      blank(100),
      h2("7.2  Technical safeguards"),
      body("The following controls are implemented in the system code:"),
      blank(80),

      h3("Screenshots never touch disk"),
      body("All screenshots are held as in-memory buffers (Node.js Buffer objects). They are never written to disk, never logged, and are garbage-collected immediately after the Claude API call returns. This is the single most important PHI protection measure."),

      blank(80),
      h3("No PHI in logs"),
      body("The logging layer sanitizes all metadata before writing. Logs contain: job IDs, carrier names, success/failure status, timestamps, and operator IDs. They never contain patient names, member IDs, dates of birth, or any other PHI. The rule: if a log line could identify a specific patient, it does not get logged."),

      blank(80),
      h3("Encrypted credential storage"),
      body("Portal login credentials (usernames and passwords for each insurance carrier, per dental practice) are stored in AWS Secrets Manager or equivalent encrypted vault. They are retrieved at runtime via API call and never stored in environment variables, source code, configuration files, or databases in plain text."),

      blank(80),
      h3("All network communication over TLS"),
      body("Every network call — to insurance portals, to the Claude API, to internal services — uses HTTPS/TLS. This is enforced at the infrastructure level, not just assumed."),

      blank(80),
      h3("Minimum necessary PHI"),
      body("The system processes only the PHI required to complete the form lookup. The targeted screenshot clipping approach (capturing only the benefits table, not the full patient record page) is a HIPAA minimum necessary compliance feature. The system does not download or store any broader patient record."),

      blank(80),
      h3("Role-based access control"),
      body("Only authenticated and authorized operators can submit jobs. Authentication uses industry-standard JWT tokens. Authorization is role-based: operator role can submit jobs, admin role can manage credentials, reviewer role can see flagged forms. No unauthenticated access to any endpoint."),

      blank(100),
      h2("7.3  Audit trail"),
      body("HIPAA requires audit logs to be retained for 6 years. Every job processed generates an audit log entry containing:"),
      bullet("Job ID (internal reference, not PHI)"),
      bullet("Operator ID (who triggered the job)"),
      bullet("Practice ID (which dental practice)"),
      bullet("Insurance carrier (CIGNA, Aetna, etc.)"),
      bullet("Timestamp (ISO 8601)"),
      bullet("IP address of the requesting client"),
      bullet("Success / failure status"),
      bullet("Number of fields flagged for review"),
      blank(80),
      body("Audit logs are stored in a write-once append-only store. Rows are never updated or deleted. This ensures the audit trail cannot be tampered with after the fact, which is a HIPAA requirement."),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 8 — PERFORMANCE & SCALING
      // ══════════════════════════════════════════════
      h1("8. Performance & Scaling"),
      h2("8.1  Time per patient"),
      body("Each patient lookup takes approximately 25–75 seconds of intentional delay (human-mimicry pause) plus ~8–15 seconds of actual work (navigation, expansion, screenshot, Claude API call). The bottleneck is the deliberate pacing, not the computation."),
      blank(80),
      twoColTable([
        ["Portal login",              "~5 seconds (once per carrier session, not per patient)"],
        ["Navigate to patient",       "~3–5 seconds"],
        ["Expand all sections",       "~2–4 seconds"],
        ["Take screenshots",          "~1–2 seconds"],
        ["Claude Vision API call",    "~3–8 seconds"],
        ["Form filling + output",     "~1–2 seconds"],
        ["Human-mimicry pause",       "25–75 seconds (random)"],
        ["Total per patient",         "~40–100 seconds average ~60 seconds"],
      ], "Step", "Time estimate"),

      blank(100),
      h2("8.2  Daily throughput and parallelisation"),
      body("At an average of 60 seconds per patient, a single machine running sequentially processes approximately 60 patients per hour. For 200 patients, a single machine takes 3–3.5 hours."),
      blank(80),
      body("To achieve the target of under 2 hours for 200 patients, the system supports two parallelisation strategies:"),
      blank(80),

      h3("Strategy A: Parallel carrier sessions on one machine"),
      body("Different insurance carriers are independent — CIGNA and Aetna sessions do not share any state. On a single machine, two or three carrier sessions can run concurrently in separate browser instances. If today's sheet has 100 CIGNA patients and 100 Aetna patients, both sessions run in parallel, completing in ~1.7 hours instead of ~3.3 hours."),

      blank(80),
      h3("Strategy B: Two machines splitting the queue"),
      body("The daily patient queue is split in half. Machine A takes patients 1–100, Machine B takes patients 101–200. Both start simultaneously. All 200 forms are completed in approximately the same time it would take one machine to do 100 — roughly 1.5–1.7 hours. This is the simplest scaling path and requires no shared state between machines."),

      blank(80),
      callout([
        "Two machines, parallel carriers: 200 patients in approximately 1.5 hours.",
        "Each additional machine adds roughly 100 patients/hour of additional throughput.",
        "At 400 patients/day (two machines), monthly revenue = $26,400 at $3/form.",
        "Infrastructure cost for two machines: ~$80–120/month additional. Negligible.",
      ], C.lightGreen, C.teal, "Scaling summary"),

      blank(100),
      h2("8.3  Cost breakdown at 200 forms/day"),
      blank(60),
      fourColTable(
        ["Cost item", "Per form", "Per day (200 forms)", "Per month (22 days)"],
        [
          ["Claude Vision API",              "~$0.025",  "~$5.00",   "~$110"],
          ["Server compute (cloud VM)",       "~$0.003",  "~$0.60",   "~$40"],
          ["PDF filling + output storage",    "~$0.001",  "~$0.20",   "~$15"],
          ["Credential vault (AWS Secrets)",  "~$0.001",  "~$0.20",   "~$5"],
          ["TOTAL infrastructure cost",       "~$0.030",  "~$6.00",   "~$170"],
          ["Revenue at $3/form",              "$3.00",    "$600",     "$13,200"],
          ["Net after infrastructure",        "$2.97",    "$594",     "$13,030"],
        ]
      ),
      blank(80),
      body("The above excludes a part-time human reviewer to handle flagged forms. Budgeting $800/month for this role brings net monthly profit to approximately $12,230 for 200 forms/day."),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 9 — OUTPUT FORM
      // ══════════════════════════════════════════════
      h1("9. Output Form — Wisdom Full Insurance Breakdown"),
      h2("9.1  Form structure"),
      body("The output form is the Wisdom Full Insurance Breakdown — a standardised two-page dental insurance verification form used by dental billing services. The system fills this form exactly as a human billing specialist would, then delivers the completed form to the operator."),
      blank(80),
      body("The form has the following sections:"),
      bullet("Patient and Plan Information — patient name, DOB, subscriber name/DOB, Member ID, insurance name/address, phone, Payor ID, group name/number, fee schedule, network status, effective date, plan type"),
      bullet("Maximums and Deductibles — annual maximum, unlimited maximum flag, rollover max, deductible (individual and family), amounts applied to date, plan year type, missing tooth clause, waiting periods, COB"),
      bullet("Percentage Breakdown by Category — coverage percentages for 11 categories: Preventative, Diagnostic, Restorative, Crowns, Endo, Perio, Removable, Fixed Prostho, Implants, OS, Adj; plus deductible applied and waiting period flags per category"),
      bullet("Frequencies and Limitations (Diagnostic/Preventative) — frequency, limitations, and history on file for 11 procedure codes from D0120 to D1351"),
      bullet("Frequencies and Limitations (Restorative) — frequencies, limitations, and downgrade/alt benefit for Composites, Crowns, Build-up, Onlays, Fixed Bridge, Removables, Implants"),
      bullet("Frequencies and Limitations (Periodontics) — frequency, limitations, history for D4346, D4355, D4341/D4342, D4910"),
      bullet("Optional Codes — custom codes with coverage %, limitations, frequencies; includes Arestin, implant abutments, implant crowns, occlusal guards, adjunctive testing"),
      bullet("Ortho — ortho coverage flag, maximum, deductible, lifetime max, work in progress, coverage %, age limitations, payment schedule"),
      bullet("Notes — free-text notes field for anything not captured by structured fields"),

      blank(100),
      h2("9.2  Real example from uploaded forms"),
      body("The Talese Bussey CIGNA form (uploaded during design sessions) shows the expected output. Key extracted values from that form:"),
      blank(80),
      twoColTable([
        ["Patient",          "Talese Bussey — DOB 01/13/2005"],
        ["Subscriber",       "Masuncha Bussey — DOB 01/15/1976 — Member ID U51562819"],
        ["Insurance",        "CIGNA — Group: Duke Energy Corporation (#10235004)"],
        ["Fee schedule",     "CIGNA DPPO Advanage — Accept assignment: YES"],
        ["Network",          "In-Network — OON Benefits: YES"],
        ["Effective date",   "01/01/2026 — Plan runs on calendar year"],
        ["Plan type",        "Indemnity — COB: Standard — Plan #Q5ZV0 NC"],
        ["Missing tooth",    "YES — Waiting periods: NO — Pays on: SEAT"],
        ["Coverage",         "Preventative 100%, Diagnostic 100%, Restorative 100%, Crowns 50%, Endo 50%, Perio 50%, Removable 50%, Fixed 50%, Implants 50%, OS 50%, Adj 50%"],
        ["Prophy",           "2x / calendar year — not shared"],
        ["Fluoride",         "2x / calendar year — no age limit"],
        ["Sealants",         "1x / 180 days — no age limit, posterior teeth"],
        ["S/RP",             "1x / 12 rolling months — 4 quads same day: YES — healing: N/A"],
        ["Ortho",            "YES — 50% coverage — no age limit — monthly payments — no lifetime max"],
        ["Occlusal guards",  "50% — bruxism only — 1x / 24 months"],
      ], "Field", "Value"),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 10 — PORTAL COVERAGE
      // ══════════════════════════════════════════════
      h1("10. Supported Insurance Portals"),
      body("Each insurance carrier has its own portal with its own login URL and navigation path. The automation layer maintains one navigation script per portal. The vision extraction layer is carrier-agnostic — the same prompt and API call works for every carrier."),
      blank(80),
      body("From the Leary Family Dentistry sheet, the practice is in-network with the following carriers (confirmed from the uploaded daily sheet header):"),
      blank(80),
      twoColTable([
        ["CIGNA",             "cignaforhcp.cigna.com — most common in the uploaded sheets. Payor ID 62308. DPPO Advanage fee schedule."],
        ["Delta Dental",      "Delta Dental provider portal — major carrier for dental-specific plans."],
        ["Aetna",             "Aetna provider portal — large commercial carrier."],
        ["United Concordia",  "United Concordia provider portal — common for military/federal employee plans."],
      ], "Carrier", "Portal details"),
      blank(80),
      body("Additional carriers can be added by writing a navigation script (approximately 30 minutes of work per portal) and adding the portal URL to the carrier routing map. The AI extraction layer requires no changes when new portals are added."),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 11 — BUILD PLAN
      // ══════════════════════════════════════════════
      h1("11. Build Plan — Recommended Development Order"),
      body("The system should be built in phases. Each phase delivers working functionality before the next is started."),
      blank(80),

      h2("Phase 1 — Core pipeline (2–3 weeks)"),
      numbered("Excel sheet parser: reads the daily sheet, parses all rows, groups by carrier"),
      numbered("CIGNA navigation script: login, search by member ID, navigate to benefits page"),
      numbered("Expand-all function: generic accordion/dropdown expansion"),
      numbered("Targeted screenshot capture: bounding-box clips for each benefits section"),
      numbered("Claude Vision API call: base64 encode screenshots, send with extraction prompt, parse JSON response"),
      numbered("Basic form filling: map JSON to Wisdom PDF template fields, output completed PDF"),
      numbered("End-to-end test with real CIGNA patient data"),

      blank(80),
      h2("Phase 2 — Session batching + human behaviour (1 week)"),
      numbered("Session batching: group by carrier, one login per carrier, process all patients in one session"),
      numbered("Human-mimicry delays: random 25–75 second pauses, human-speed typing, natural mouse movement"),
      numbered("Stealth plugin integration: playwright-extra + stealth plugin"),
      numbered("Error handling and retry logic: exponential backoff, graceful failure per patient"),

      blank(80),
      h2("Phase 3 — Review UI + delivery (1 week)"),
      numbered("Confidence flagging: mark low-confidence fields in the output form"),
      numbered("Review interface: simple web UI showing today's completed forms with flagged fields highlighted"),
      numbered("Form delivery: email or folder delivery of completed PDFs to the operator"),
      numbered("Daily summary report: total processed, completed, flagged, failed"),

      blank(80),
      h2("Phase 4 — HIPAA compliance (1 week, parallel with Phase 3)"),
      numbered("PHI sanitisation in all log statements"),
      numbered("AWS Secrets Manager integration for credential storage"),
      numbered("Audit log implementation (write-once store)"),
      numbered("Role-based access control on the job submission API"),
      numbered("BAA execution with Anthropic, cloud host, and first dental practice client"),

      blank(80),
      h2("Phase 5 — Additional portals + parallelisation (ongoing)"),
      numbered("Delta Dental navigation script"),
      numbered("Aetna navigation script"),
      numbered("United Concordia navigation script"),
      numbered("Parallel carrier session runner: run multiple browser instances simultaneously"),
      numbered("Multi-machine queue splitter: distribute patient queue across N machines"),

      blank(100),
      callout([
        "Phase 1 delivers a working end-to-end pipeline for CIGNA patients.",
        "Phase 2 makes it production-safe from a bot-detection standpoint.",
        "Phase 3 makes it usable by a non-technical operator.",
        "Phase 4 makes it legally compliant to handle real patient data.",
        "Phase 5 expands coverage and hits the 200+ forms/day target.",
      ], C.lightBlue, C.navy, "Phase summary"),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 12 — TECH STACK
      // ══════════════════════════════════════════════
      h1("12. Technology Stack"),
      blank(60),
      twoColTable([
        ["Runtime",                 "Node.js 20 LTS — strong async/await support, native Buffer for image handling"],
        ["Browser automation",      "Playwright (Microsoft) — cross-browser, reliable waits, built-in screenshot API"],
        ["Bot-detection evasion",   "playwright-extra + puppeteer-extra-plugin-stealth — patches all known automation fingerprints"],
        ["AI extraction",           "Anthropic Claude claude-sonnet-4-6 Vision API — structured JSON extraction from screenshots"],
        ["Excel parsing",           "SheetJS (xlsx) — reads .xlsx daily sheets with no Excel installation required"],
        ["PDF form filling",        "pdf-lib (Node.js) — fills Wisdom PDF template fields programmatically"],
        ["Credential storage",      "AWS Secrets Manager — encrypted at rest, IAM-controlled access, audit logged"],
        ["Cloud hosting",           "AWS EC2 t3.medium (or equivalent) — ~$40/month, sufficient for 200 forms/day"],
        ["Audit logging",           "AWS CloudTrail or append-only PostgreSQL table — 6-year retention for HIPAA"],
        ["Review UI",               "Simple Express.js web server + plain HTML/JS — no framework overhead needed"],
        ["Job scheduling",          "Node-cron — triggers daily workflow when morning sheet arrives"],
      ], "Component", "Technology & rationale"),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 13 — KEY DECISIONS LOG
      // ══════════════════════════════════════════════
      h1("13. Key Design Decisions Log"),
      body("This section records every significant architectural decision made during the design process, the alternatives considered, and the rationale for the choice made."),
      blank(80),
      fourColTable(
        ["Decision", "Chosen approach", "Alternative considered", "Rationale"],
        [
          ["Data extraction method", "Claude Vision API reading screenshots", "HTML scraping with CSS selectors", "Portals change layouts frequently, breaking selectors. Vision is layout-agnostic and handles JS-rendered content automatically."],
          ["Session management", "One login per carrier per day (batch)", "One login per patient", "Mirrors human behaviour exactly. Reduces login events from 200 to ~4/day. Avoids bot detection from login frequency."],
          ["Screenshot scope", "Targeted clips of benefit table elements only", "Full-page screenshot", "Reduces image tokens by ~70%, reducing API cost. Also a HIPAA minimum-necessary compliance feature."],
          ["Navigation control", "Deterministic Playwright scripts per portal", "AI-driven navigation (let Claude decide where to click)", "Navigation is predictable and scriptable. AI-driven navigation is slower, unpredictable, and harder to audit."],
          ["Dropdown handling", "Generic expand-all before screenshotting", "Per-portal custom expand logic", "Generic approach works across all portals without per-portal maintenance. Falls back gracefully on unknown toggle patterns."],
          ["Human mimicry", "Random 25–75s pause + stealth plugin + human-speed typing", "No special delay or fingerprinting", "Portals actively monitor request patterns. Without mimicry, accounts would be suspended within days."],
          ["Credential storage", "AWS Secrets Manager encrypted vault", "Environment variables or .env files", "HIPAA requires encryption at rest for credentials that give access to PHI. .env files are plaintext."],
          ["PHI in screenshots", "In-memory buffers only, never written to disk", "Save screenshots for debugging", "HIPAA requires PHI to be protected. Writing screenshots to disk creates PHI at rest requiring additional safeguards."],
          ["Scaling", "Two parallel machines splitting the queue", "One machine with more threads", "Portals may rate-limit per IP. Two machines = two IPs = natural distribution. Simpler than thread pool management."],
          ["Output format", "Filled Wisdom PDF template", "New PDF generated from scratch", "Dental practices already use the Wisdom form format. Filling the existing template maintains compatibility."],
        ]
      ),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 14 — RISKS & MITIGATIONS
      // ══════════════════════════════════════════════
      h1("14. Risks & Mitigations"),
      blank(60),
      fourColTable(
        ["Risk", "Likelihood", "Impact", "Mitigation"],
        [
          ["Portal blocks the session (bot detection)", "Medium", "High — stops all processing for that carrier", "Stealth plugin + human-mimicry delays. Monitor for session drops. If blocked, pause 30 min and retry with fresh session."],
          ["Portal page redesign breaks navigation script", "Medium", "Medium — affects one carrier until fixed", "Navigation failures trigger an alert. Fix takes ~1 hour per portal. Vision extraction requires no changes."],
          ["Claude API returns low-confidence extraction", "Low-Medium", "Low — field goes to human review queue", "Confidence scoring flags uncertain fields. Human reviewer fills them. Accuracy improves over time as prompts are tuned."],
          ["Portal implements CAPTCHA or MFA", "Low", "High — blocks automated login", "Monitor for new auth requirements. Some portals offer API access for registered providers — pursue official API when available."],
          ["PHI data breach", "Very Low (with controls)", "Catastrophic — HIPAA penalties + client loss", "In-memory only PHI, encrypted credentials, BAAs, audit logs, TLS everywhere. Regular security review."],
          ["Insurance carrier changes coverage data format", "Medium", "Low — extraction still works", "Vision API reads whatever is rendered. Format changes do not break extraction, though prompt tuning may improve accuracy."],
          ["Daily sheet format changes", "Low", "Low — parser needs updating", "Sheet parser is abstracted into one function. Column mapping is configurable. Update takes under 1 hour."],
        ]
      ),

      pageBreak(),

      // ══════════════════════════════════════════════
      //  SECTION 15 — GLOSSARY
      // ══════════════════════════════════════════════
      h1("15. Glossary"),
      blank(60),
      twoColTable([
        ["BAA (Business Associate Agreement)", "Legal HIPAA contract between a Covered Entity (dental practice) and a Business Associate (this system) that handles PHI on their behalf."],
        ["Covered Entity", "Under HIPAA, the dental practice that owns the patient data."],
        ["Business Associate", "Any party that handles PHI on behalf of a Covered Entity. This automation system is a Business Associate."],
        ["PHI (Protected Health Information)", "Any individually identifiable health information — patient name, DOB, Member ID, diagnosis codes, treatment history, insurance details."],
        ["Playwright", "Microsoft's browser automation library for Node.js. Controls Chromium, Firefox, or WebKit browsers programmatically."],
        ["Stealth plugin", "A Playwright/Puppeteer add-on that patches browser properties used to detect automation, making the browser appear indistinguishable from a real user's browser."],
        ["Vision API", "Claude's ability to accept images as input and extract information from them — used here to read insurance portal screenshots."],
        ["Session batching", "Processing all patients for a given insurance carrier within a single login session, rather than logging in separately for each patient."],
        ["Wisdom form", "The Wisdom Full Insurance Breakdown form — a standardised two-page dental insurance verification form used by dental billing services."],
        ["Member ID", "The unique identifier assigned by an insurance carrier to a subscriber. Primary search key for every portal lookup."],
        ["Subscriber", "The primary holder of the insurance policy. May differ from the patient (e.g. a parent whose child is the patient)."],
        ["Coverage percentage", "The proportion of a dental procedure's cost covered by the insurance plan (e.g. 100% preventative, 50% crowns)."],
        ["Annual maximum", "The maximum dollar amount an insurance plan will pay in a given plan year. Common values: $1,000–$2,000."],
        ["Deductible", "The amount the patient must pay out-of-pocket before insurance coverage begins. Individual and family deductibles apply."],
        ["Frequency limitation", "A restriction on how often a covered procedure can be performed within a time period (e.g. prophy 2x per calendar year)."],
        ["Missing tooth clause", "A clause that excludes coverage for replacing teeth that were missing before the policy's effective date."],
        ["COB (Coordination of Benefits)", "Rules governing how two or more insurance plans pay when a patient is covered by more than one plan."],
        ["Payor ID", "A standardised code identifying the insurance carrier, used in electronic billing systems."],
        ["DPPO (Dental Preferred Provider Organisation)", "A type of dental insurance plan where in-network providers have pre-negotiated rates."],
        ["DMO (Dental Maintenance Organisation)", "A type of dental insurance plan requiring patients to use a primary care dentist within a specific network."],
      ], "Term", "Definition"),

      blank(200),

      // ── footer note ──
      new Paragraph({
        children:[new TextRun({ text:"This document captures the complete design and architecture agreed upon during the product design session of June 2026. It should be treated as the single source of truth for anyone building, extending, or reviewing this system.", font:"Arial", size:18, color:C.midGray, italics:true })],
        alignment:AlignmentType.CENTER,
        spacing:{ before:200, after:0 }
      }),

    ] // end children
  }] // end sections
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('./Dental_Insurance_Automation_Documentation.docx', buf);
  console.log('Done — ' + buf.length + ' bytes');
});