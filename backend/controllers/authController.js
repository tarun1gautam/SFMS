const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');


// const owncrypt = (pin,id) =>{
//   result = Number(String(id).toLowerCase().trim().split('').map(char => char.charCodeAt(0)).join(''))*Number(pin);
//   return String(result)
// };

// const owndcrypt = (pin,id) =>{
//   result = (Number(pin))/(Number(String(id).toLowerCase().trim().split('').map(char => char.charCodeAt(0)).join('')));
//   return String(result)
// };

async function generateHash() {
    const hash = await bcrypt.hash("12345678", 10);
    console.log(hash);
}

generateHash();

// console.log(await bcrypt.hash("12345678",10));
// console.log(owndcrypt("128358486785612160","gagan"));


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
    // const dbpin = owndcrypt(user.pin,user.user_id.trim());
    // const pinMatch = (dbpin === pin);
    const pinMatch = await bcrypt.compare(String(pin),user.pin);
    console.log(user.pin,pinMatch);
    console.log(pin);
    console.log(user.pin,user.user_id.trim());


    if (!pinMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last logind
    await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        user_id: user.user_id,
        role: user.role,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const register = async (req, res) => {
  try {
    const { user_id, pin, role } = req.body;

    if (!user_id || !pin) {
      return res.status(400).json({ error: 'User ID and PIN are required' });
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
      'INSERT INTO users (user_id, pin, role) VALUES ($1, $2, $3) RETURNING user_id, role, created_at',
      [user_id.trim(), hashedPin, assignedRole]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, role, created_at, last_login FROM users WHERE user_id = $1',
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
      'SELECT user_id, role, created_at, last_login FROM users ORDER BY created_at ASC'
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

module.exports = { login, register, getProfile, listUsers, deleteUser };