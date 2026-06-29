'use strict';
/**
 * src/main.js
 * ─────────────────────────────────────────────────────────────────────────
 * Orchestrator — the entry point for the FillSure automation system.
 *
 * Usage:
 *   node src/main.js daily_sheet.xlsx      → Run daily job
 *   node src/main.js --setup-ameritas      → First-time OTP setup (opens visible browser)
 *   node src/main.js --list-fields         → Print all fields in the Wisdom PDF template
 *   node src/main.js --test-pdf sample.pdf → Test PDF parsing against a sample file
 *
 * npm shortcuts:
 *   npm start              → node src/main.js (looks for daily_sheet.xlsx in project root)
 *   npm run setup          → node src/main.js --setup-ameritas
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { logger, newJobId } = require('./utils/logger');
const { parseDailySheet } = require('./input/sheetParser');
const { processAmeritasPatients } = require('./carriers/ameritas/navigate');
const { parseAmeritasPdf } = require('./carriers/ameritas/parsePdf');
const { fillWisdomForm } = require('./output/formFiller');

// ── Config ────────────────────────────────────────────────────────────────────
const OUTPUT_DIR      = path.resolve(process.env.OUTPUT_DIR || './output');
const TEMPLATE_PATH   = path.join(__dirname, '../templates/wisdom_template.pdf');

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // ── Special modes ──────────────────────────────────────────────────────────
  if (args.includes('--setup-ameritas')) {
    return await runSetupMode();
  }

  if (args.includes('--list-fields')) {
    return await runListFields();
  }

  if (args.includes('--test-pdf')) {
    const pdfPath = args[args.indexOf('--test-pdf') + 1];
    return await runTestPdf(pdfPath);
  }

  // ── Default: daily job ─────────────────────────────────────────────────────
  const sheetPath = args[0] || './daily_sheet.xlsx';
  await runDailyJob(sheetPath);
}

// ────────────────────────────────────────────────────────────────────────────
// DAILY JOB
// ────────────────────────────────────────────────────────────────────────────

async function runDailyJob(sheetPath) {
  const jobId = newJobId();
  const startTime = Date.now();

  logger.info('Daily job started', { jobId });

  // ── Validate environment ────────────────────────────────────────────────────
  if (!fs.existsSync(TEMPLATE_PATH)) {
    logger.error('Wisdom PDF template not found', { path: TEMPLATE_PATH });
    console.error(
      `\n❌  Wisdom PDF template not found at: ${TEMPLATE_PATH}\n` +
      `    Place the blank Wisdom Full Insurance Breakdown PDF at that path.\n`
    );
    process.exit(1);
  }

  if (!fs.existsSync(sheetPath)) {
    logger.error('Daily sheet not found', { path: sheetPath });
    console.error(
      `\n❌  Daily sheet not found at: ${sheetPath}\n` +
      `    Usage: node src/main.js path/to/daily_sheet.xlsx\n`
    );
    process.exit(1);
  }

  // ── Ensure output directory exists ─────────────────────────────────────────
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── Step 1: Parse the daily sheet ──────────────────────────────────────────
  console.log('\n📋  Parsing daily patient sheet...');
  const grouped = parseDailySheet(sheetPath);

  const carrierCounts = Object.entries(grouped)
    .map(([c, pts]) => `  ${c}: ${pts.length} patient(s)`)
    .join('\n');

  console.log(`✅  Sheet parsed.\n${carrierCounts || '  (no patients found)'}\n`);
  logger.info('Daily sheet parsed', {
    jobId,
    carriers: Object.keys(grouped),
    totalPatients: Object.values(grouped).reduce((s, arr) => s + arr.length, 0),
  });

  // ── Step 2: Process Ameritas patients ──────────────────────────────────────
  const ameritasPatients = grouped['ameritas'] || [];

  if (ameritasPatients.length === 0) {
    console.log('ℹ️   No Ameritas patients in today\'s sheet. Exiting.\n');
    logger.info('No Ameritas patients — nothing to do', { jobId });
    return;
  }

  console.log(`🤖  Starting Ameritas portal session for ${ameritasPatients.length} patient(s)...\n`);

  const portalResults = await processAmeritasPatients(ameritasPatients);

  // ── Step 3: Parse PDFs and fill forms ─────────────────────────────────────
  console.log('\n📄  Extracting data from PDFs and filling Wisdom forms...');

  const completed = [];
  const failed    = [];

  for (const result of portalResults) {
    if (!result.success) {
      failed.push({ reason: result.error });
      continue;
    }

    try {
      // Extract all fields from the in-memory PDF
      const extracted = await parseAmeritasPdf(result.pdfBuffer);

      // Fill the Wisdom PDF template
      const filledPdf = await fillWisdomForm(extracted, result.patient, TEMPLATE_PATH);

      // Generate output filename — uses row index, NOT patient name (no PHI in filenames)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outputName = `ameritas_row${result.patient.rowIndex}_${timestamp}.pdf`;
      const outputPath = path.join(OUTPUT_DIR, outputName);

      fs.writeFileSync(outputPath, filledPdf);
      completed.push({ outputPath });

      logger.info('Form completed', { jobId, outputFile: outputName });
      process.stdout.write('  ✅\n');

    } catch (err) {
      logger.error('Form generation failed', { jobId, error: err.message });
      failed.push({ reason: err.message });
      process.stdout.write('  ❌\n');
    }
  }

  // ── Step 4: Summary ────────────────────────────────────────────────────────
  const durationMin = ((Date.now() - startTime) / 60000).toFixed(1);

  console.log('\n' + '─'.repeat(54));
  console.log('  DAILY SUMMARY');
  console.log('─'.repeat(54));
  console.log(`  Patients processed : ${ameritasPatients.length}`);
  console.log(`  Forms completed    : ${completed.length}`);
  console.log(`  Failed             : ${failed.length}`);
  console.log(`  Total runtime      : ${durationMin} minutes`);
  console.log(`  Output folder      : ${OUTPUT_DIR}`);
  console.log('─'.repeat(54) + '\n');

  logger.info('Daily job complete', {
    jobId,
    totalPatients: ameritasPatients.length,
    completed: completed.length,
    failed: failed.length,
    durationMinutes: durationMin,
  });

  if (failed.length > 0) {
    process.exitCode = 1; // Signal partial failure without throwing
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SETUP MODE — First-time OTP setup
// ────────────────────────────────────────────────────────────────────────────

async function runSetupMode() {
  console.log('\n' + '═'.repeat(54));
  console.log('  AMERITAS SETUP MODE');
  console.log('═'.repeat(54));
  console.log('  This will open a browser window.');
  console.log('  You will need to enter your OTP when prompted.');
  console.log('  After completing OTP, the session is saved for ~30 days.');
  console.log('═'.repeat(54) + '\n');

  logger.info('Setup mode started');
  await processAmeritasPatients([], { setupMode: true });

  console.log('🎉  Setup complete!\n');
  console.log('    You can now run the daily job:');
  console.log('    npm start daily_sheet.xlsx\n');
  logger.info('Setup mode complete');
}

// ────────────────────────────────────────────────────────────────────────────
// UTILITY: List all fields in the Wisdom PDF template
// ────────────────────────────────────────────────────────────────────────────

async function runListFields() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`\n❌  Template not found at: ${TEMPLATE_PATH}\n`);
    process.exit(1);
  }

  const { PDFDocument } = require('pdf-lib');
  const bytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  console.log('\n📋  Wisdom PDF Template — AcroForm Fields');
  console.log('─'.repeat(50));
  for (const f of fields) {
    console.log(`  [${f.constructor.name.replace('PDF', '')}] ${f.getName()}`);
  }
  console.log('─'.repeat(50));
  console.log(`  Total: ${fields.length} fields\n`);
}

// ────────────────────────────────────────────────────────────────────────────
// UTILITY: Test PDF parsing against a local sample file
// ────────────────────────────────────────────────────────────────────────────

async function runTestPdf(pdfPath) {
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    console.error(`\n❌  PDF not found: ${pdfPath}`);
    console.error('    Usage: node src/main.js --test-pdf ./samples/ameritas_sample.pdf\n');
    process.exit(1);
  }

  console.log(`\n🔍  Testing PDF parser against: ${pdfPath}\n`);
  const buffer = fs.readFileSync(pdfPath);

  // Temporarily enable raw text dump for debugging
  process.env.DEBUG_PDF_TEXT = 'true';

  const extracted = await parseAmeritasPdf(buffer);

  console.log('📊  Extracted Fields:');
  console.log('─'.repeat(50));
  for (const [key, val] of Object.entries(extracted)) {
    if (key.startsWith('_')) continue;
    const status = val === null ? '⚠️  null' : `✅  ${val}`;
    console.log(`  ${key.padEnd(25)} ${status}`);
  }
  console.log('─'.repeat(50));

  const nulls = Object.entries(extracted).filter(([k, v]) => !k.startsWith('_') && v === null);
  const total = Object.keys(extracted).filter(k => !k.startsWith('_')).length;
  console.log(`\n  Extracted: ${total - nulls.length}/${total} fields`);

  if (nulls.length > 0) {
    console.log(`\n  ⚠️  Null fields (regex calibration needed):`);
    nulls.forEach(([k]) => console.log(`     - ${k}`));
  }
  console.log();
}

// ── Run ───────────────────────────────────────────────────────────────────────
main().catch(err => {
  logger.error('Unhandled fatal error', { error: err.message, stack: err.stack });
  console.error('\n💥  Fatal error:', err.message, '\n');
  process.exit(1);
});
