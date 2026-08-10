const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const pool = require('../db'); // your existing pg Pool instance
const { encryptSecret, decryptSecret } = require('../utils/mfaCrypto');

// otplib defaults: 30s step, 6 digits — matches Google Authenticator.
// window: 1 means we accept the previous and next 30s code too, to tolerate clock drift.
authenticator.options = { window: 1 };

const ISSUER = 'SFMS Secure Gateway';

/**
 * POST /api/auth/mfa/setup
 * Requires: verifyToken middleware (req.user.user_id must be set)
 *
 * Generates a fresh TOTP secret, stores it in a "pending" column (NOT the live
 * mfa_secret column) so an unfinished setup can never silently protect the account,
 * and returns a QR code the user scans in Google Authenticator.
 */
exports.setupMfa = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Pull the user's display name/user_id for the QR label
    const { rows } = await pool.query(
      'SELECT user_id, username FROM users WHERE user_id = $1',
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const label = rows[0].username || rows[0].user_id;

    // Generate a new base32 secret (plaintext only ever lives in memory here + the QR code)
    const secret = authenticator.generateSecret();

    // Store encrypted, as "pending" until the user proves they scanned it correctly.
    // Overwrites any previous unfinished attempt.
    await pool.query(
      'UPDATE users SET mfa_pending_secret = $1 WHERE user_id = $2',
      [encryptSecret(secret), userId]
    );

    const otpauthUrl = authenticator.keyuri(label, ISSUER, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return res.status(200).json({
      qrCode: qrCodeDataUrl,   // <img src={qrCode} />
      manualEntryKey: secret,  // shown as fallback text under the QR
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    return res.status(500).json({ message: 'Failed to start MFA setup.' });
  }
};

/**
 * POST /api/auth/mfa/verify-setup
 * Body: { token: '123456' }
 * Requires: verifyToken middleware
 *
 * Verifies the first code the user enters against the PENDING secret.
 * Only on success does the secret get promoted to mfa_secret + isMfaEnabled = true.
 */
exports.verifyMfaSetup = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { token } = req.body;

    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ message: 'Enter the 6-digit code from your authenticator app.' });
    }

    const { rows } = await pool.query(
      'SELECT mfa_pending_secret FROM users WHERE user_id = $1',
      [userId]
    );
    const encryptedPending = rows[0]?.mfa_pending_secret;

    if (!encryptedPending) {
      return res.status(400).json({ message: 'No MFA setup in progress. Please restart setup.' });
    }

    const pendingSecret = decryptSecret(encryptedPending);

    const isValid = authenticator.verify({ token, secret: pendingSecret });
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid code. Please try again.' });
    }

    // Promote pending -> active (already encrypted), clear the pending column
    await pool.query(
      `UPDATE users
       SET mfa_secret = $1, is_mfa_enabled = TRUE, mfa_pending_secret = NULL
       WHERE user_id = $2`,
      [encryptedPending, userId]
    );

    return res.status(200).json({ message: 'MFA enabled successfully.' });
  } catch (error) {
    console.error('MFA verify-setup error:', error);
    return res.status(500).json({ message: 'Failed to verify MFA setup.' });
  }
};

/**
 * (Optional but recommended) POST /api/auth/mfa/disable
 * Requires: verifyToken middleware + re-entry of password or a fresh OTP,
 * so an attacker who steals a live session can't silently turn MFA off.
 */
exports.disableMfa = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { token } = req.body;

    const { rows } = await pool.query(
      'SELECT mfa_secret FROM users WHERE user_id = $1',
      [userId]
    );
    const encryptedSecret = rows[0]?.mfa_secret;
    if (!encryptedSecret) {
      return res.status(400).json({ message: 'MFA is not enabled.' });
    }

    const secret = decryptSecret(encryptedSecret);
    const isValid = authenticator.verify({ token, secret });
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid code.' });
    }

    await pool.query(
      'UPDATE users SET mfa_secret = NULL, is_mfa_enabled = FALSE WHERE user_id = $1',
      [userId]
    );

    return res.status(200).json({ message: 'MFA disabled.' });
  } catch (error) {
    console.error('MFA disable error:', error);
    return res.status(500).json({ message: 'Failed to disable MFA.' });
  }
};