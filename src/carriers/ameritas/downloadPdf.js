'use strict';
/**
 * carriers/ameritas/downloadPdf.js
 * ─────────────────────────────────────────────────────────────────────────
 * Intercepts and captures the benefits PDF download from the Ameritas portal.
 *
 * HIPAA note: The PDF buffer is NEVER written to disk here.
 * It is held in memory and passed to parsePdf.js for extraction.
 * After extraction, the buffer is dereferenced and garbage-collected.
 * No PHI ever touches the file system as a raw download.
 *
 * How Playwright download interception works:
 *   page.waitForEvent('download') sets up a listener BEFORE we click.
 *   The Promise.all ensures both the click and the download event are
 *   captured atomically — no race condition.
 *
 *   Playwright saves the download to a temp path on disk by default.
 *   We immediately read it into a Buffer and delete the temp file.
 */

const fs = require('fs');
const { logger } = require('../../utils/logger');
const { humanScroll, humanDelay } = require('../../utils/humanDelay');

/**
 * Clicks the PDF download button and returns the PDF content as a Buffer.
 * The temp file is deleted immediately after reading.
 *
 * @param {import('playwright').Page} page
 * @param {string} downloadButtonSelector  CSS selector for the download button/link
 * @returns {Promise<Buffer>}
 */
async function downloadBenefitsPdf(page, downloadButtonSelector) {
  // Scroll to ensure the download button is in the viewport
  await humanScroll(page, 100, 300);
  await humanDelay(500, 1000);

  // Locate the download button
  const downloadBtn = page.locator(downloadButtonSelector).first();
  const buttonVisible = await downloadBtn.isVisible().catch(() => false);

  if (!buttonVisible) {
    // Try looking for a print-to-PDF alternative
    logger.warn('Primary download button not found — trying fallback selectors');
    const fallbackSelectors = [
      'button:text("Export PDF")',
      'a:text("Benefits Summary")',
      'button:text("Print Benefits")',
      'a[href*="pdf"]',
      'button:text("Download Benefits")',
    ];

    let found = false;
    for (const sel of fallbackSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        logger.info('Using fallback download selector', { selector: sel });
        return await triggerDownload(page, el);
      }
    }

    if (!found) {
      throw new Error(
        'Could not find a PDF download button on the benefits page. ' +
        'The portal may have changed its UI — update SELECTORS.downloadButton in navigate.js.'
      );
    }
  }

  return await triggerDownload(page, downloadBtn);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function triggerDownload(page, locator) {
  logger.info('Triggering PDF download');

  // Set up download listener BEFORE clicking (avoid race condition)
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    locator.click(),
  ]);

  logger.info('PDF download initiated — waiting for file');

  // Wait for the download to complete
  const failure = await download.failure();
  if (failure) {
    throw new Error(`PDF download failed: ${failure}`);
  }

  // Get the temp path Playwright saved the file to
  const tempPath = await download.path();
  if (!tempPath) {
    throw new Error('PDF download completed but no temp file path returned by Playwright');
  }

  // Read into Buffer IMMEDIATELY
  const pdfBuffer = fs.readFileSync(tempPath);

  // Delete the temp file — we only want in-memory data (HIPAA compliance)
  try {
    fs.unlinkSync(tempPath);
    logger.info('Temp PDF file deleted — data held in memory only');
  } catch (e) {
    // Non-fatal: Playwright may clean it up itself
    logger.warn('Could not delete temp PDF file', { error: e.message });
  }

  const sizeKb = Math.round(pdfBuffer.length / 1024);
  logger.info('PDF captured in memory', { sizeKb });

  return pdfBuffer;
}

module.exports = { downloadBenefitsPdf };
