'use strict';
/**
 * carriers/ameritas/parsePdf.js
 * ─────────────────────────────────────────────────────────────────────────
 * Extracts all required Wisdom form fields from an Ameritas benefits PDF.
 *
 * HOW IT WORKS:
 *   pdf-parse extracts the raw text content of the PDF (works on
 *   machine-readable PDFs — NOT on scanned/image PDFs).
 *   Each field is extracted using a targeted regex against that raw text.
 *
 * IMPORTANT — REGEX PATTERNS NEED CALIBRATION:
 *   The regex patterns below are best-effort based on common Ameritas PDF
 *   layouts. They MUST be tested and refined against real Ameritas benefit
 *   PDF samples. Add sample PDFs to the /samples/ folder (gitignored) and
 *   run: node scripts/testPdfParse.js ./samples/ameritas_sample.pdf
 *
 * RETURN VALUE:
 *   A flat object where every field is either:
 *     - A parsed value (number, string, boolean)
 *     - null (field not found in PDF — never throws, never guesses)
 *
 * NULL POLICY:
 *   If a regex doesn't match, the field returns null.
 *   Null fields are handled downstream:
 *     - In formFiller.js: the form field is left blank
 *     - In flagging.js: the field is flagged for human review
 */

const pdfParse = require('pdf-parse');
const { logger } = require('../../utils/logger');

/**
 * @param {Buffer} pdfBuffer  In-memory PDF buffer from downloadPdf.js
 * @returns {Promise<ExtractedBenefits>}
 */
async function parseAmeritasPdf(pdfBuffer) {
  let data;
  try {
    data = await pdfParse(pdfBuffer);
  } catch (err) {
    throw new Error(
      `PDF parsing failed. The PDF may be image-based (scanned) rather than ` +
      `machine-readable. Error: ${err.message}`
    );
  }

  const text = data.text;

  // Debug: log the raw text (only in development, not in production)
  if (process.env.DEBUG_PDF_TEXT === 'true') {
    const debugPath = require('path').join(__dirname, '../../../logs/last_pdf_text.txt');
    require('fs').writeFileSync(debugPath, text);
    logger.info('Raw PDF text written to logs/last_pdf_text.txt (DEBUG_PDF_TEXT mode)');
  }

  logger.info('PDF text extracted', { pages: data.numpages, charCount: text.length });

  // ── Extract all fields ───────────────────────────────────────────────────
  const extracted = {
    // ── Plan Info ──────────────────────────────────────────────────────
    annualMaximum:          extractCurrency(text, [
      /Annual\s+Maximum[:\s]+\$?([\d,]+)/i,
      /Max(?:imum)?\s+Benefit[:\s]+\$?([\d,]+)/i,
      /Plan\s+Maximum[:\s]+\$?([\d,]+)/i,
    ]),
    deductibleIndividual:   extractCurrency(text, [
      /Individual\s+Deductible[:\s]+\$?([\d,]+)/i,
      /Deductible[:\s]+Individual[:\s]+\$?([\d,]+)/i,
      /Annual\s+Deductible[^\n]*Individual[:\s]+\$?([\d,]+)/i,
    ]),
    deductibleFamily:       extractCurrency(text, [
      /Family\s+Deductible[:\s]+\$?([\d,]+)/i,
      /Deductible[:\s]+Family[:\s]+\$?([\d,]+)/i,
      /Annual\s+Deductible[^\n]*Family[:\s]+\$?([\d,]+)/i,
    ]),
    planYearType:           extractText(text, [
      /(Calendar|Contract|Anniversary)\s+Year/i,
    ]),
    missingToothClause:     extractYesNo(text, [
      /Missing\s+Tooth\s+Clause[:\s]+(Yes|No)/i,
      /Missing\s+Tooth[:\s]+(Yes|No|Applies|Does not apply)/i,
    ]),
    waitingPeriods:         extractYesNo(text, [
      /Waiting\s+Period[s]?[:\s]+(Yes|No|None|N\/A)/i,
      /Waiting\s+Period\s+Applies[:\s]+(Yes|No)/i,
    ]),
    effectiveDate:          extractText(text, [
      /Effective\s+Date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /Coverage\s+Effective[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    ]),
    groupName:              extractText(text, [
      /Group\s+Name[:\s]+([^\n]+)/i,
      /Employer\s+Group[:\s]+([^\n]+)/i,
    ]),
    groupNumber:            extractText(text, [
      /Group\s+(?:Number|ID|#|No\.?)[:\s]+([^\s\n]+)/i,
    ]),
    networkStatus:          extractText(text, [
      /Network[:\s]+(In-Network|Out-of-Network|PPO|DPPO)/i,
      /(In-Network|In Network|PPO|DPPO)/i,
    ]),
    planType:               extractText(text, [
      /Plan\s+Type[:\s]+([^\n]+)/i,
      /(Indemnity|PPO|HMO|DMO|DPPO)/i,
    ]),

    // ── Coverage Percentages ───────────────────────────────────────────
    coveragePreventative:   extractPercent(text, [
      /Preventive[:\s]+(\d+)\s*%/i,
      /Preventative[:\s]+(\d+)\s*%/i,
      /Class\s+I[^%\n]*(\d+)\s*%/i,
    ]),
    coverageDiagnostic:     extractPercent(text, [
      /Diagnostic[:\s]+(\d+)\s*%/i,
      /Class\s+I[^%\n]*(\d+)\s*%/i,
    ]),
    coverageBasic:          extractPercent(text, [
      /Basic[:\s]+(\d+)\s*%/i,
      /Class\s+II[^%\n]*(\d+)\s*%/i,
    ]),
    coverageRestorative:    extractPercent(text, [
      /Restorative[:\s]+(\d+)\s*%/i,
      /Restoration[:\s]+(\d+)\s*%/i,
    ]),
    coverageCrowns:         extractPercent(text, [
      /Crown[s]?[:\s]+(\d+)\s*%/i,
      /Major[:\s]+(\d+)\s*%/i,
      /Class\s+III[^%\n]*(\d+)\s*%/i,
    ]),
    coverageEndodontic:     extractPercent(text, [
      /Endodontic[s]?[:\s]+(\d+)\s*%/i,
      /Root\s+Canal[:\s]+(\d+)\s*%/i,
    ]),
    coveragePeriodontic:    extractPercent(text, [
      /Periodontic[s]?[:\s]+(\d+)\s*%/i,
      /Perio[:\s]+(\d+)\s*%/i,
    ]),
    coverageOralSurgery:    extractPercent(text, [
      /Oral\s+Surgery[:\s]+(\d+)\s*%/i,
      /Extraction[s]?[:\s]+(\d+)\s*%/i,
    ]),
    coverageImplants:       extractPercent(text, [
      /Implant[s]?[:\s]+(\d+)\s*%/i,
    ]),
    coverageRemovable:      extractPercent(text, [
      /Removable[:\s]+(\d+)\s*%/i,
      /Denture[s]?[:\s]+(\d+)\s*%/i,
    ]),
    coverageFixedProstho:   extractPercent(text, [
      /Fixed\s+Prost(?:hodontics)?[:\s]+(\d+)\s*%/i,
      /Bridge[s]?[:\s]+(\d+)\s*%/i,
    ]),

    // ── Frequencies ────────────────────────────────────────────────────
    freqProphy:             extractFrequency(text, [
      /Prophylaxis[^\n]*\n?[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /D1110[^\n]*([^\n]+)/i,
      /D1120[^\n]*([^\n]+)/i,
      /Cleaning[^\n]*(\d+\s*(?:times?|x)\s*(?:per\s+)?\w+)/i,
    ]),
    freqBitewings:          extractFrequency(text, [
      /Bitewing[s]?[^\n]*\n?[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /D0272[^\n]*([^\n]+)/i,
      /D0274[^\n]*([^\n]+)/i,
    ]),
    freqFullXray:           extractFrequency(text, [
      /Full[- ]?Mouth[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /Panoramic[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /D0210[^\n]*([^\n]+)/i,
      /D0330[^\n]*([^\n]+)/i,
    ]),
    freqPeriodicExam:       extractFrequency(text, [
      /Periodic\s+Exam[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /D0120[^\n]*([^\n]+)/i,
    ]),
    freqSealants:           extractFrequency(text, [
      /Sealant[s]?[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /D1351[^\n]*([^\n]+)/i,
    ]),
    freqFluoride:           extractFrequency(text, [
      /Fluoride[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /D1206[^\n]*([^\n]+)/i,
      /D1208[^\n]*([^\n]+)/i,
    ]),

    // ── Periodontics ───────────────────────────────────────────────────
    freqScaling:            extractFrequency(text, [
      /Scaling[^\n]*(?:inflam|perio)[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /D4346[^\n]*([^\n]+)/i,
    ]),
    freqFullDebridement:    extractFrequency(text, [
      /Full\s+Mouth\s+Debridement[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /D4355[^\n]*([^\n]+)/i,
    ]),
    freqSRP:                extractFrequency(text, [
      /S(?:caling)?\s*[&\/]\s*R(?:oot)?\s*P(?:laning)?[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /D4341[^\n]*([^\n]+)/i,
      /D4342[^\n]*([^\n]+)/i,
    ]),
    freqPerioMaint:         extractFrequency(text, [
      /Perio(?:dontal)?\s+Maint(?:enance)?[^\n]*((?:\d+\s*[xX\/]\s*(?:per\s+)?\w+[^\n]*))/i,
      /D4910[^\n]*([^\n]+)/i,
    ]),

    // ── Ortho ──────────────────────────────────────────────────────────
    orthoCoverage:          extractYesNo(text, [
      /Orthodontic[s]?\s*(?:Coverage)?[:\s]+(Yes|No|Covered|Not Covered|Included)/i,
    ]),
    orthoPercent:           extractPercent(text, [
      /Orthodontic[s]?[^\n]*(\d+)\s*%/i,
      /Ortho[^\n]*(\d+)\s*%/i,
    ]),
    orthoLifetimeMax:       extractCurrency(text, [
      /Orthodontic[s]?\s+(?:Lifetime\s+)?Maximum[:\s]+\$?([\d,]+)/i,
      /Ortho[^\n]*Maximum[:\s]+\$?([\d,]+)/i,
    ]),
    orthoAgeLimit:          extractText(text, [
      /Orthodontic[s]?\s+Age\s+Limit[:\s]+([^\n]+)/i,
      /Ortho[^\n]*Age[:\s]+([^\n]+)/i,
    ]),

    // ── Optional / Special Codes ───────────────────────────────────────
    occlusalGuards:         extractText(text, [
      /D9944[^\n]*([^\n]+)/i,
      /Occlusal\s+Guard[s]?[^\n]*([^\n]+)/i,
      /Night\s+Guard[s]?[^\n]*([^\n]+)/i,
    ]),
    arestin:                extractText(text, [
      /D4381[^\n]*([^\n]+)/i,
      /Arestin[^\n]*([^\n]+)/i,
      /Minocycline[^\n]*([^\n]+)/i,
    ]),

    // ── Extraction metadata (not written to form) ──────────────────────
    _extractionMethod:      'pdf_local',
    _carrier:               'ameritas',
    _pdfPageCount:          data.numpages,
    _rawTextLength:         text.length,
    _extractedAt:           new Date().toISOString(),
  };

  // Log extraction summary (no PHI)
  const nullCount = Object.entries(extracted)
    .filter(([k, v]) => !k.startsWith('_') && v === null)
    .length;
  const totalFields = Object.keys(extracted).filter(k => !k.startsWith('_')).length;

  logger.info('PDF extraction complete', {
    fieldsExtracted: totalFields - nullCount,
    fieldsNull: nullCount,
    totalFields,
    pdfPages: data.numpages,
  });

  if (nullCount > 5) {
    logger.warn('High number of null fields — regex patterns may need calibration for this PDF layout', {
      nullCount,
    });
  }

  return extracted;
}

// ── Extraction helpers ────────────────────────────────────────────────────────

/**
 * Tries each regex in turn and returns the first match as an integer (currency).
 * Returns null if no regex matches.
 */
function extractCurrency(text, regexes) {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match) {
      const val = parseInt(match[1].replace(/,/g, ''), 10);
      if (!isNaN(val)) return val;
    }
  }
  return null;
}

/**
 * Tries each regex in turn and returns the first match as an integer (percentage).
 * Validates that the result is 0–100.
 * Returns null if no match or value out of range.
 */
function extractPercent(text, regexes) {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val >= 0 && val <= 100) return val;
    }
  }
  return null;
}

/**
 * Tries each regex and returns true/false for yes/no values.
 * Returns null if no match.
 */
function extractYesNo(text, regexes) {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match) {
      const v = match[1].toLowerCase().trim();
      if (['yes', 'covered', 'included', 'applies'].includes(v)) return true;
      if (['no', 'not covered', 'none', 'n/a', 'does not apply'].includes(v)) return false;
    }
  }
  return null;
}

/**
 * Tries each regex and returns the first captured group as a trimmed string.
 * Returns null if no match or empty string.
 */
function extractText(text, regexes, group = 1) {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match && match[group]) {
      const val = match[group].trim();
      if (val.length > 0) return val;
    }
  }
  return null;
}

/**
 * Same as extractText but cleans up common frequency string formats.
 * e.g. "2 times per calendar year" → "2x / cal year"
 */
function extractFrequency(text, regexes) {
  const raw = extractText(text, regexes);
  if (!raw) return null;

  // Light normalisation — preserve human-readable format
  return raw
    .replace(/\btimes?\b/gi, 'x')
    .replace(/\bcalendar year\b/gi, 'cal year')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 80); // Cap length to prevent garbage captures
}

module.exports = { parseAmeritasPdf };
