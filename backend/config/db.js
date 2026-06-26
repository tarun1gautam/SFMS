const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'SFMS',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 50,
  idleTimeoutMillis: 600_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

let firstConnect = true;
pool.on('connect', () => {
  if (firstConnect) {
    console.log('✅ PostgreSQL pool connected');
    firstConnect = false;
  }
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err);
});

module.exports = pool;