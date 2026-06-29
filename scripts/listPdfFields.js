'use strict';
/**
 * scripts/listPdfFields.js
 * ─────────────────────────────────────────────────────────────────────────
 * Developer utility: Inspect the Wisdom PDF template and print all AcroForm
 * field names exactly as they appear in the PDF.
 *
 * Usage:
 *   node scripts/listPdfFields.js
 *   node scripts/listPdfFields.js ./templates/wisdom_template.pdf
 *
 * Use the output to update FIELD_MAP in src/output/formFiller.js.
 *
 * Field types:
 *   TextField   = standard text input
 *   CheckBox    = yes/no checkbox
 *   RadioGroup  = radio button group
 *   DropDown    = dropdown select
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const templatePath = process.argv[2] || path.join(__dirname, '../templates/wisdom_template.pdf');

async function run() {
  if (!fs.existsSync(templatePath)) {
    console.error(`\n❌  Template not found: ${templatePath}`);
    console.error('    Place the blank Wisdom PDF at templates/wisdom_template.pdf\n');
    process.exit(1);
  }

  const bytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  console.log(`\n📋  Wisdom PDF Template — AcroForm Fields`);
  console.log(`    File: ${path.basename(templatePath)}`);
  console.log('═'.repeat(60));

  // Group by type
  const byType = {};
  for (const f of fields) {
    const type = f.constructor.name.replace('PDF', '').replace('Field', '');
    if (!byType[type]) byType[type] = [];
    byType[type].push(f.getName());
  }

  for (const [type, names] of Object.entries(byType)) {
    console.log(`\n  ── ${type} fields (${names.length}) ──`);
    for (const name of names.sort()) {
      console.log(`     '${name}'`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`  Total fields: ${fields.length}`);
  console.log('\n  Copy field names → update FIELD_MAP in src/output/formFiller.js\n');
}

run().catch(err => {
  console.error(`\n❌  Error: ${err.message}\n`);
  process.exit(1);
});
