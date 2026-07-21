const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { invalidateUserCache } = require('../middleware/auth'); // ADD THIS


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
    console.log(user.pin, pinMatch);
    console.log(pin);
    console.log(user.pin, user.user_id.trim());

    if (!pinMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role, tokenVersion: user.token_version },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

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

    res.json({ message: 'User signed out of all devices', user: result.rows[0] });
  } catch (err) {
    console.error('Force logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, role, base_path FROM users WHERE user_id = $1', // add base_path
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
      'SELECT user_id, role, base_path, token_version, created_at, last_login FROM users ORDER BY created_at ASC'
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
      'SELECT user_id FROM users WHERE user_id ILIKE $1 LIMIT 5',
      [`%${query}%`]
    );

    res.json({ users: result.rows.map(row => row.user_id) });
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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

module.exports = { login, register, updateUser, forceLogoutAll, getProfile, listUsers, deleteUser, searchUsers, changeOwnPassword };