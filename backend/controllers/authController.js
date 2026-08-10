const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { generateSecret, generateURI, verify: verifyOtp } = require('otplib');
const QRCode = require('qrcode');
const pool = require('../config/db');
const { logAction } = require('../utils/auditLogger');
const { invalidateUserCache } = require('../middleware/auth'); // ADD THIS
const { encryptSecret, decryptSecret } = require('../utils/mfaCrypto'); // MFA secret encryption at rest

// otplib v13's functional API. epochTolerance: 30 = accept codes valid up to
// 30s in the past/future, to tolerate clock drift between devices.
const MFA_TOLERANCE_SECONDS = 30;


// async function generateHash() {
//     const hash = await bcrypt.hash("12345678", 10);
//     console.log(hash);
// }

// generateHash();


const login = async (req, res) => {
  try {
    const { user_id, pin } = req.body;
    if (!user_id || !pin) {
      return res.status(400).json({ error: 'User ID and PIN are required' });
    }
    
    const result = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [user_id.trim()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const pinMatch = await bcrypt.compare(String(pin), user.pin);

    if (!pinMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // If MFA is enabled, don't issue a real session yet — hand back a short-lived,
    // purpose-scoped temp token and require the OTP step before granting access.
    // last_login/logAction for this attempt happen in verifyLoginMfa on success instead.
    if (user.is_mfa_enabled) {
      const tempToken = jwt.sign(
        { user_id: user.user_id, purpose: 'mfa_pending' },
        process.env.MFA_TEMP_JWT_SECRET || process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ mfaRequired: true, tempToken });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role, base_path: user.base_path, id: user.id, tokenVersion: user.token_version },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );
    await logAction({ actorOverride: user.user_id, action: 'auth.login', targetType: 'user', targetId: user.user_id, targetLabel: user.user_id, metadata: { role: user.role } });

    res.json({
      token,
      user: {
        user_id: user.user_id,
        role: user.role,
        base_path: user.base_path,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/login/mfa-verify — Step 2 of login for MFA-enabled accounts.
// Body: { tempToken, token }  (token = the 6-digit code from the authenticator app)
const verifyLoginMfa = async (req, res) => {
  try {
    const { tempToken, token } = req.body;
    if (!tempToken || !token) {
      return res.status(400).json({ error: 'Missing verification data' });
    }

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.MFA_TEMP_JWT_SECRET || process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }
    if (decoded.purpose !== 'mfa_pending') {
      return res.status(401).json({ error: 'Invalid session token' });
    }

    if (!/^\d{6}$/.test(String(token))) {
      return res.status(400).json({ error: 'Enter the 6-digit code from your authenticator app' });
    }

    const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [decoded.user_id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    const user = result.rows[0];
    if (!user.is_mfa_enabled || !user.mfa_secret) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const secret = decryptSecret(user.mfa_secret);
    const otpResult = await verifyOtp({ secret, token: String(token), epochTolerance: MFA_TOLERANCE_SECONDS });
    if (!otpResult.valid) {
      // 400, not 401 — a wrong code shouldn't look like an expired/invalid
      // session to the frontend's error handling, it's just a bad OTP.
      return res.status(400).json({ error: 'Invalid code' });
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

    const fullToken = jwt.sign(
      { user_id: user.user_id, role: user.role, base_path: user.base_path, id: user.id, tokenVersion: user.token_version },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    await logAction({ actorOverride: user.user_id, action: 'auth.login', targetType: 'user', targetId: user.user_id, targetLabel: user.user_id, metadata: { role: user.role, mfa: true } });

    res.json({
      token: fullToken,
      user: {
        user_id: user.user_id,
        role: user.role,
        base_path: user.base_path,
      }
    });
  } catch (err) {
    console.error('MFA login verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/mfa/setup — self-service enrollment start (authenticate required)
const setupMfa = async (req, res) => {
  try {
    const result = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [req.user.user_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const label = result.rows[0].user_id;

    const secret = generateSecret();
    await pool.query(
      'UPDATE users SET mfa_pending_secret = $1 WHERE user_id = $2',
      [encryptSecret(secret), req.user.user_id]
    );

    const otpauthUrl = generateURI({ issuer: 'SFMS Secure Gateway', label, secret });
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    res.json({ qrCode, manualEntryKey: secret });
  } catch (err) {
    console.error('MFA setup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/mfa/verify-setup — confirm the first code, promote pending secret to live
const verifyMfaSetup = async (req, res) => {
  try {
    const { token } = req.body;
    if (!/^\d{6}$/.test(String(token))) {
      return res.status(400).json({ error: 'Enter the 6-digit code from your authenticator app' });
    }

    const result = await pool.query('SELECT mfa_pending_secret FROM users WHERE user_id = $1', [req.user.user_id]);
    const encryptedPending = result.rows[0]?.mfa_pending_secret;
    if (!encryptedPending) {
      return res.status(400).json({ error: 'No MFA setup in progress. Please restart setup.' });
    }

    const pendingSecret = decryptSecret(encryptedPending);
    const otpResult = await verifyOtp({ secret: pendingSecret, token: String(token), epochTolerance: MFA_TOLERANCE_SECONDS });
    if (!otpResult.valid) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    await pool.query(
      `UPDATE users SET mfa_secret = $1, is_mfa_enabled = TRUE, mfa_pending_secret = NULL
       WHERE user_id = $2`,
      [encryptedPending, req.user.user_id]
    );

    await logAction({ req, action: 'auth.mfa_enabled', targetType: 'user', targetId: req.user.user_id, targetLabel: req.user.user_id });

    res.json({ message: 'MFA enabled successfully' });
  } catch (err) {
    console.error('MFA verify-setup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/mfa/disable — self-service, requires a valid current OTP
const disableMfa = async (req, res) => {
  try {
    const { token } = req.body;
    const result = await pool.query('SELECT mfa_secret FROM users WHERE user_id = $1', [req.user.user_id]);
    const encryptedSecret = result.rows[0]?.mfa_secret;
    if (!encryptedSecret) {
      return res.status(400).json({ error: 'MFA is not enabled' });
    }

    const secret = decryptSecret(encryptedSecret);
    const otpResult = await verifyOtp({ secret, token: String(token), epochTolerance: MFA_TOLERANCE_SECONDS });
    if (!otpResult.valid) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    await pool.query('UPDATE users SET mfa_secret = NULL, is_mfa_enabled = FALSE WHERE user_id = $1', [req.user.user_id]);
    await logAction({ req, action: 'auth.mfa_disabled', targetType: 'user', targetId: req.user.user_id, targetLabel: req.user.user_id });

    res.json({ message: 'MFA disabled' });
  } catch (err) {
    console.error('MFA disable error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/mfa/verify-code — step-up verification before entering a sensitive
// section (e.g. MGMT/ADMIN). Pure check — no MFA state is changed. Uses 400 (not
// 401) on a wrong code so the frontend's "session expired" interceptor doesn't
// fire and force a logout — the login session itself is still valid here.
const verifyStepUpCode = async (req, res) => {
  try {
    const { token } = req.body;
    if (!/^\d{6}$/.test(String(token))) {
      return res.status(400).json({ error: 'Enter the 6-digit code from your authenticator app' });
    }

    const result = await pool.query(
      'SELECT mfa_secret, is_mfa_enabled FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    const user = result.rows[0];
    if (!user || !user.is_mfa_enabled || !user.mfa_secret) {
      return res.status(400).json({ error: 'MFA is not enabled on this account' });
    }

    const secret = decryptSecret(user.mfa_secret);
    const otpResult = await verifyOtp({ secret, token: String(token), epochTolerance: MFA_TOLERANCE_SECONDS });
    if (!otpResult.valid) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    await logAction({ req, action: 'auth.stepup_verified', targetType: 'user', targetId: req.user.user_id, targetLabel: req.user.user_id });

    res.json({ valid: true });
  } catch (err) {
    console.error('Step-up verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/admin/users/:userId/mfa-status — admin toggles MFA on/off for any
// user. Disabling always clears mfa_secret (full reset). Enabling is REJECTED
// without a verified secret, so the flag can never be flipped on with nothing
// behind it (that would strand the user at a step-up prompt with no way through).
const adminSetMfaStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isMfaEnabled } = req.body;

    if (typeof isMfaEnabled !== 'boolean') {
      return res.status(400).json({ error: 'isMfaEnabled must be true or false' });
    }

    const result = await pool.query('SELECT mfa_secret FROM users WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (isMfaEnabled && !result.rows[0].mfa_secret) {
      return res.status(400).json({
        error: 'This user has no verified MFA secret. Use "Reset / Setup MFA" first and have the user complete verification.'
      });
    }

    if (isMfaEnabled) {
      await pool.query('UPDATE users SET is_mfa_enabled = TRUE WHERE user_id = $1', [userId]);
    } else {
      await pool.query(
        'UPDATE users SET is_mfa_enabled = FALSE, mfa_secret = NULL, mfa_pending_secret = NULL WHERE user_id = $1',
        [userId]
      );
    }

    await logAction({
      req,
      action: isMfaEnabled ? 'auth.admin_mfa_enabled' : 'auth.admin_mfa_disabled',
      targetType: 'user',
      targetId: userId,
      targetLabel: userId,
      metadata: { by: req.user.user_id },
    });

    res.json({ user_id: userId, is_mfa_enabled: isMfaEnabled });
  } catch (err) {
    console.error('Admin MFA status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/admin/users/:userId/mfa/generate — admin generates a fresh secret
// for a user. Stored as PENDING only — does not enable MFA by itself.
const adminGenerateMfaSecret = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const secret = generateSecret();
    await pool.query(
      'UPDATE users SET mfa_pending_secret = $1 WHERE user_id = $2',
      [encryptSecret(secret), userId]
    );

    const otpauthUrl = generateURI({ issuer: 'SFMS Secure Gateway', label: userId, secret });
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    await logAction({
      req,
      action: 'auth.admin_mfa_secret_generated',
      targetType: 'user',
      targetId: userId,
      targetLabel: userId,
      metadata: { by: req.user.user_id },
    });

    res.json({ qrCode, manualEntryKey: secret });
  } catch (err) {
    console.error('Admin MFA generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/admin/users/:userId/mfa/verify-setup — admin completes verification
// on the target user's behalf (e.g. enrolling them in person).
const adminVerifyMfaSetup = async (req, res) => {
  try {
    const { userId } = req.params;
    const { token } = req.body;
    if (!/^\d{6}$/.test(String(token))) {
      return res.status(400).json({ error: 'Enter the 6-digit code from the authenticator app' });
    }

    const result = await pool.query('SELECT mfa_pending_secret FROM users WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const encryptedPending = result.rows[0].mfa_pending_secret;
    if (!encryptedPending) {
      return res.status(400).json({ error: 'No MFA setup in progress for this user. Generate a new QR code first.' });
    }

    const pendingSecret = decryptSecret(encryptedPending);
    const otpResult = await verifyOtp({ secret: pendingSecret, token: String(token), epochTolerance: MFA_TOLERANCE_SECONDS });
    if (!otpResult.valid) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    await pool.query(
      `UPDATE users SET mfa_secret = $1, is_mfa_enabled = TRUE, mfa_pending_secret = NULL
       WHERE user_id = $2`,
      [encryptedPending, userId]
    );

    await logAction({
      req,
      action: 'auth.admin_mfa_verified',
      targetType: 'user',
      targetId: userId,
      targetLabel: userId,
      metadata: { by: req.user.user_id },
    });

    res.json({ message: 'MFA enabled successfully', user_id: userId, is_mfa_enabled: true });
  } catch (err) {
    console.error('Admin MFA verify-setup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const register = async (req, res) => {
  try {
    const { user_id, pin, role, base_path } = req.body;

    if (!user_id || !pin) {
      return res.status(400).json({ error: 'User ID and PIN are required' });
    }

    if (base_path && !base_path.endsWith("/")) {
      return res.status(400).json({ error: 'Path must end with a forward slash (/)' });
    }

    if (!/^\d{4,8}$/.test(String(pin))) {
      return res.status(400).json({ error: 'PIN must be 4-8 digits' });
    }

    // Only admins can create admin accounts
    const assignedRole = role === 'admin' && req.user?.role === 'admin' ? 'admin' : 'user';

    const existing = await pool.query('SELECT id FROM users WHERE user_id = $1', [user_id.trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'User ID already exists' });
    }

    const hashedPin = await bcrypt.hash(String(pin), 10);
    const result = await pool.query(
      'INSERT INTO users (user_id, pin, role, base_path) VALUES ($1, $2, $3, $4) RETURNING user_id, role, created_at',
      [user_id.trim(), hashedPin, assignedRole, base_path]
    );

    await logAction({ req, action: 'auth.register', targetType: 'user', targetId: result.rows[0].user_id, targetLabel: result.rows[0].user_id, metadata: { role: assignedRole, base_path } });

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /auth/users/:userId — update role, base_path, and/or pin (admin only)
// Body: { role?, base_path?, pin?, logout_all? }
//  - pin: if provided, must be 4-8 digits; it's hashed before storage and
//    ALWAYS bumps token_version, since a changed password should invalidate
//    every existing session/device for that account.
//  - logout_all: pass true to bump token_version alone (e.g. "sign this
//    user out of all devices" without touching their role/path/pin).
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, base_path, pin, logout_all } = req.body;

    if (base_path !== undefined && base_path !== '' && !base_path.endsWith('/')) {
      return res.status(400).json({ error: 'Path must end with a forward slash (/)' });
    }

    if (pin !== undefined && pin !== '' && !/^\d{4,8}$/.test(String(pin))) {
      return res.status(400).json({ error: 'PIN must be 4-8 digits' });
    }

    // Build dynamic SET clause — only update provided fields
    const fields = [];
    const values = [];
    let idx = 1;
    let willBumpVersion = false;

    if (role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(role);
    }
    if (base_path !== undefined) {
      fields.push(`base_path = $${idx++}`);
      values.push(base_path === '' ? null : base_path);
    }
    if (pin !== undefined && pin !== '') {
      const hashedPin = await bcrypt.hash(String(pin), 10);
      fields.push(`pin = $${idx++}`);
      values.push(hashedPin);
      willBumpVersion = true; // changing the password always kills existing sessions
    }
    if (logout_all === true) {
      willBumpVersion = true;
    }
    if (willBumpVersion) {
      fields.push(`token_version = token_version + 1`);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    values.push(userId);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE user_id = $${idx}
       RETURNING user_id, role, base_path, token_version, last_login`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logAction({
  req, action: 'auth.user_updated', targetType: 'user', targetId: userId, targetLabel: userId,
  metadata: { roleChanged: role !== undefined, basePathChanged: base_path !== undefined, passwordChanged: pin !== undefined && pin !== '', loggedOutEverywhere: willBumpVersion }
});

    res.json({
      user: result.rows[0],
      passwordChanged: pin !== undefined && pin !== '',
      loggedOutEverywhere: willBumpVersion,
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/users/:userId/logout-all — sign a user out of every device,
// without needing to touch role/base_path/pin. Existing JWTs carry the old
// tokenVersion, so the auth middleware will reject them on the next request.
const forceLogoutAll = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `UPDATE users SET token_version = token_version + 1
       WHERE user_id = $1
       RETURNING user_id, token_version`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logAction({ req, action: 'auth.force_logout_all', targetType: 'user', targetId: userId, targetLabel: userId });

    res.json({ message: 'User signed out of all devices', user: result.rows[0] });
  } catch (err) {
    console.error('Force logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, role, base_path, is_mfa_enabled FROM users WHERE user_id = $1', // add base_path
      [req.user.user_id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const listUsers = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, role, base_path, token_version, created_at, last_login, is_mfa_enabled FROM users WHERE user_id != $1 ORDER BY created_at ASC',
      ['admin']
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.user_id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await logAction({ req, action: 'auth.user_deleted', targetType: 'user', targetId: userId, targetLabel: userId });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.json({ users: [] });

    const result = await pool.query(
      'SELECT user_id, base_path FROM users WHERE user_id ILIKE $1 LIMIT 5',
      [`%${query}%`]
    );

    // res.json({ users: result.rows.map(row => row.user_id) });
    res.json({ 
  users: result.rows.map(row => ({
    user_id: row.user_id,
    base_path: row.base_path
  })) 
});
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// const searchUsers = async (req, res) => {
//   try {
//     const { query } = req.query;
//     if (!query) return res.json({ users: [] });

//     const result = await pool.query(
//       'SELECT user_id FROM users WHERE user_id ILIKE $1 LIMIT 5',
//       [`%${query}%`]
//     );

//     res.json({ users: result.rows.map(row => row.user_id) });
//   } catch (err) {
//     console.error('Search users error:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// PATCH /auth/change-password — self-service, any authenticated user
// Body: { current_pin, new_pin }
const changeOwnPassword = async (req, res) => {
  try {
    const { current_pin, new_pin } = req.body;
    if (!current_pin || !new_pin) {
      return res.status(400).json({ error: 'Current and new PIN are required' });
    }
    if (!/^\d{4,8}$/.test(String(new_pin))) {
      return res.status(400).json({ error: 'New PIN must be 4-8 digits' });
    }

    const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [req.user.user_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = result.rows[0];

    const match = await bcrypt.compare(String(current_pin), user.pin);
    if (!match) {
      return res.status(401).json({ error: 'Current PIN is incorrect' });
    }

    const hashedPin = await bcrypt.hash(String(new_pin), 10);
    const updated = await pool.query(
      `UPDATE users SET pin = $1, token_version = token_version + 1
       WHERE user_id = $2
       RETURNING user_id, role, token_version, base_path`,
      [hashedPin, user.user_id]
    );
    const u = updated.rows[0];

    invalidateUserCache(u.user_id); // this device's own token below is fresh, so it stays valid

    // Password changed → bump token_version kills all sessions; issue a new
    // token immediately so THIS device isn't logged out too.
    const token = jwt.sign(
      { user_id: u.user_id, role: u.role, tokenVersion: u.token_version },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    await logAction({ req, action: 'auth.password_changed_self', targetType: 'user', targetId: u.user_id, targetLabel: u.user_id });

    res.json({
      message: 'Password updated. You have been logged out of all other devices.',
      token,
      user: { user_id: u.user_id, role: u.role, base_path: u.base_path },
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /auth/users/transfer-eligible?path=/CCTNS/SomeFolder/&query=par
// Returns users whose base_path scope actually covers this item's path.
const getTransferEligibleUsers = async (req, res) => {
  try {
    const { path: itemPath, query = '' } = req.query;
    if (!itemPath) return res.status(400).json({ error: 'path is required' });

    const decodedPath = decodeURIComponent(itemPath);

    const result = await pool.query(
      `SELECT user_id, base_path, role
       FROM users
       WHERE base_path IS NOT NULL
         AND base_path != ''
         AND STARTS_WITH($1, base_path)
         -- Removed "AND user_id != $2" so the current user is included
         AND user_id ILIKE $2
       ORDER BY user_id ASC`,
      [decodedPath, `%${query}%`]
    );

    res.json({ users: result.rows });
  } catch (err) {
    console.error('Transfer-eligible users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { login, verifyLoginMfa, setupMfa, verifyMfaSetup, disableMfa, verifyStepUpCode, adminSetMfaStatus, adminGenerateMfaSecret, adminVerifyMfaSetup, register, updateUser, forceLogoutAll, getProfile, listUsers, deleteUser, searchUsers, changeOwnPassword, getTransferEligibleUsers };