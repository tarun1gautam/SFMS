const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function initializeDatabase() {
  const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(schemaSQL);
    console.log('✅ Database schema initialized successfully');
  } catch (err) {
    console.error('❌ Error initializing database schema:', err.message);
    throw err;
  }
}

module.exports = { initializeDatabase };