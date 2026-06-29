'use strict';
/**
 * utils/logger.js
 * ─────────────────────────────────────────────────────────────────────────
 * PHI-safe audit logger.
 *
 * RULE: Logs NEVER contain patient names, dates of birth, Member IDs,
 * subscriber names, or any other individually-identifiable health information.
 *
 * Logs contain ONLY:
 *   - Job IDs (internal GUIDs)
 *   - Carrier names (AMERITAS, CIGNA, etc.)
 *   - Success / failure status
 *   - Timestamps
 *   - Patient counts (no names)
 *   - Error messages (must not include PHI — enforced by caller convention)
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
fs.mkdirSync(logsDir, { recursive: true });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ssZ' }),
    winston.format.json()
  ),
  transports: [
    // Console output — human-readable during development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}] ${message}${metaStr}`;
        })
      ),
    }),
    // File output — JSON lines for audit trail (HIPAA: retain 6 years)
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      maxsize: 10 * 1024 * 1024, // 10MB per file
      maxFiles: 50,               // ~500MB total before rotation
      tailable: true,
    }),
    // Separate error log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
    }),
  ],
});

/**
 * Generates a random job ID (no PHI, used for correlating log lines).
 * Format: job_<hex> — short enough to read, unique enough for audit.
 */
function newJobId() {
  return 'job_' + Math.random().toString(16).slice(2, 10);
}

module.exports = { logger, newJobId };
