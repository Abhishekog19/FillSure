'use strict';
/**
 * utils/credentials.js
 * ─────────────────────────────────────────────────────────────────────────
 * Credential retrieval abstraction.
 *
 * In development: reads from .env file via dotenv.
 * In production:  swap getCredentials() to pull from AWS Secrets Manager,
 *                 HashiCorp Vault, or equivalent encrypted vault.
 *
 * HIPAA requirement: portal credentials must be encrypted at rest.
 * .env files are plaintext — use the vault integration before going live
 * with real patient data.
 */

require('dotenv').config();

/**
 * Returns login credentials for the given carrier.
 * Currently reads from environment variables (dev mode).
 *
 * @param {'ameritas'} carrier
 * @returns {{ username: string, password: string }}
 */
async function getCredentials(carrier) {
  switch (carrier.toLowerCase()) {
    case 'ameritas': {
      const username = process.env.AMERITAS_USERNAME;
      const password = process.env.AMERITAS_PASSWORD;

      if (!username || !password) {
        throw new Error(
          'Ameritas credentials not found. ' +
          'Copy .env.example to .env and fill in AMERITAS_USERNAME and AMERITAS_PASSWORD.'
        );
      }

      return { username, password };
    }

    default:
      throw new Error(`No credentials configured for carrier: ${carrier}`);
  }
}

module.exports = { getCredentials };

/*
 * ── FUTURE: AWS Secrets Manager integration ──────────────────────────────
 *
 * When going live with real patient data, replace getCredentials() with:
 *
 * const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
 *
 * async function getCredentials(carrier) {
 *   const client = new SecretsManagerClient({ region: 'us-east-1' });
 *   const command = new GetSecretValueCommand({ SecretId: `fillsure/credentials/${carrier}` });
 *   const response = await client.send(command);
 *   return JSON.parse(response.SecretString);
 * }
 *
 * The secret in AWS Secrets Manager should be a JSON object:
 * { "username": "...", "password": "..." }
 */
