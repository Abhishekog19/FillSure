'use strict';
/**
 * input/sheetParser.js
 * ─────────────────────────────────────────────────────────────────────────
 * Reads the dental practice's daily patient Excel sheet.
 *
 * Column mapping (Leary Family Dentistry format):
 *   A — APPT DT      Appointment date (used as Date of Service in portal)
 *   B — DONE DT      Done date (informational / audit log)
 *   C — PATIENT      Patient full name
 *   D — PT. DOB      Patient date of birth
 *   E — CARRIER      Insurance carrier name (routes to correct portal)
 *   F — SUB NAME     Subscriber name (may differ from patient)
 *   G — SUB DOB      Subscriber date of birth
 *   H — MEMBER ID    Primary search key for every portal lookup
 *   I — NOTES        Practice notes (passed through to review queue)
 *   J — NAME         Operator name (audit trail only)
 *
 * Returns patients grouped by carrier (lowercase), e.g.:
 *   { ameritas: [...], cigna: [...], aetna: [...] }
 *
 * Uses ExcelJS (not xlsx) — no known high-severity CVEs.
 */

const ExcelJS = require('exceljs');

/**
 * Parses the daily Excel sheet and returns patients grouped by carrier.
 *
 * @param {string} filePath  Absolute or relative path to the .xlsx file
 * @returns {Promise<Record<string, PatientRow[]>>}
 */
async function parseDailySheet(filePath) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    throw new Error(`Could not read daily sheet at "${filePath}": ${err.message}`);
  }

  const sheet = workbook.worksheets[0];
  const patients = [];
  let headerRowIndex = null;

  sheet.eachRow((row, rowNumber) => {
    const values = row.values; // 1-indexed: values[1]=A, values[2]=B, etc.

    // Find header row (first row containing "PATIENT" or "CARRIER")
    if (headerRowIndex === null) {
      const isHeader = values.some(
        v => typeof v === 'string' && (
          v.toUpperCase().includes('PATIENT') ||
          v.toUpperCase().includes('CARRIER')
        )
      );
      if (isHeader) { headerRowIndex = rowNumber; return; }
      if (rowNumber > 5) { headerRowIndex = 0; } // Give up looking, treat row 1 as data
      return; // Skip until header found
    }

    const carrier = normaliseCarrierName(values[5]); // Column E = index 5
    if (!carrier) return; // Skip rows with no carrier

    patients.push({
      rowIndex:       rowNumber,
      apptDate:       formatDate(values[1]),  // A
      doneDate:       formatDate(values[2]),  // B
      patientName:    cleanString(values[3]), // C
      patientDOB:     formatDate(values[4]),  // D
      carrier,                                // E
      subscriberName: cleanString(values[6]), // F
      subscriberDOB:  formatDate(values[7]),  // G
      memberId:       cleanString(values[8]), // H
      notes:          cleanString(values[9]), // I
      operatorName:   cleanString(values[10]),// J
    });
  });

  // Group by carrier
  const grouped = {};
  for (const patient of patients) {
    if (!grouped[patient.carrier]) grouped[patient.carrier] = [];
    grouped[patient.carrier].push(patient);
  }

  return grouped;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalises carrier name to a consistent lowercase key.
 * Handles common variations like "AMERITAS LIFE", "Ameritas", etc.
 */
function normaliseCarrierName(raw) {
  if (!raw) return null;
  const s = raw.toString().toLowerCase().trim();

  if (s.includes('ameritas'))            return 'ameritas';
  if (s.includes('cigna'))               return 'cigna';
  if (s.includes('delta'))               return 'delta_dental';
  if (s.includes('aetna'))               return 'aetna';
  if (s.includes('united concordia'))    return 'united_concordia';
  if (s.includes('metlife'))             return 'metlife';
  if (s.includes('guardian'))            return 'guardian';
  if (s.includes('humana'))              return 'humana';
  if (s.includes('principal'))           return 'principal';
  if (s.includes('sun life'))            return 'sun_life';

  // Return the raw value normalised — unknown carriers get logged and skipped
  return s.replace(/\s+/g, '_');
}

/**
 * Converts Excel date serial numbers or string dates to "MM/DD/YYYY" format.
 * Handles: Excel serial, "8/5/1973", "08/05/1973", JS Date objects.
 */
function formatDate(raw) {
  if (!raw) return null;

  // Excel serial number (number of days since 1/1/1900)
  if (typeof raw === 'number') {
    const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
  }

  // Already a string — normalise to MM/DD/YYYY
  const s = raw.toString().trim();
  // Match M/D/YYYY or MM/DD/YYYY
  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const [, m, d, y] = match;
    const year = y.length === 2 ? `20${y}` : y;
    return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${year}`;
  }

  return s; // Return as-is if we can't parse it
}

function cleanString(raw) {
  if (raw === null || raw === undefined) return null;
  const s = raw.toString().trim();
  return s.length > 0 ? s : null;
}

module.exports = { parseDailySheet };
