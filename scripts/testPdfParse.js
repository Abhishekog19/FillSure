'use strict';
/**
 * scripts/testPdfParse.js
 * ─────────────────────────────────────────────────────────────────────────
 * Developer utility: Test the PDF parser against a local sample file
 * WITHOUT needing to log into the Ameritas portal at all.
 *
 * Usage:
 *   node scripts/testPdfParse.js ./samples/ameritas_sample.pdf
 *
 * Drop a real Ameritas benefits PDF into ./samples/ (this folder is
 * gitignored — samples contain PHI and must never be committed).
 *
 * This script dumps the raw text AND shows all extracted fields,
 * letting you calibrate regex patterns in parsePdf.js without portal access.
 */

const path = require('path');
const fs = require('fs');

// Load modules from src/
const { parseAmeritasPdf } = require('../src/carriers/ameritas/parsePdf');

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('\nUsage: node scripts/testPdfParse.js path/to/sample.pdf\n');
  process.exit(1);
}

const resolved = path.resolve(pdfPath);
if (!fs.existsSync(resolved)) {
  console.error(`\nFile not found: ${resolved}\n`);
  process.exit(1);
}

async function run() {
  console.log(`\n🔍  PDF Parser Test — ${path.basename(resolved)}`);
  console.log('═'.repeat(56));

  process.env.DEBUG_PDF_TEXT = 'true';
  process.env.DEBUG_FAST_MODE = 'true';

  const buffer = fs.readFileSync(resolved);

  try {
    const extracted = await parseAmeritasPdf(buffer);

    // ── Field results ──────────────────────────────────────────────────────
    console.log('\n📊  Field Extraction Results:');
    console.log('─'.repeat(56));

    const results = Object.entries(extracted).filter(([k]) => !k.startsWith('_'));
    const nullFields = [];

    for (const [key, val] of results) {
      if (val === null) {
        nullFields.push(key);
        console.log(`  ⚠️  ${key.padEnd(28)} null`);
      } else {
        console.log(`  ✅  ${key.padEnd(28)} ${String(val).slice(0, 40)}`);
      }
    }

    console.log('─'.repeat(56));
    console.log(`  Extracted : ${results.length - nullFields.length}/${results.length}`);

    if (nullFields.length > 0) {
      console.log(`\n  Fields needing regex work:`);
      nullFields.forEach(f => console.log(`     → ${f}`));
    }

    // ── Metadata ────────────────────────────────────────────────────────────
    console.log(`\n  PDF pages      : ${extracted._pdfPageCount}`);
    console.log(`  Raw text chars : ${extracted._rawTextLength}`);
    console.log(`\n  Raw text → logs/last_pdf_text.txt\n`);

  } catch (err) {
    console.error(`\n❌  Parse error: ${err.message}\n`);
    if (err.message.includes('image-based')) {
      console.error('    The PDF may be scanned (image-only). pdf-parse only works on text PDFs.\n');
    }
    process.exit(1);
  }
}

run().catch(console.error);
