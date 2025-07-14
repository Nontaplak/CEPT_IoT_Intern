const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Use Pool instead of Client for better connection management
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'energy_dashboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err);
});

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

// Simple query wrapper
const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Get real-time data (simplified)
const getRealTimeData = async (sensorId = 1) => {
  try {
    const result = await query(
      `SELECT time, sensor_id, voltage, current, power, energy, hz, pf
       FROM sensor_data 
       WHERE sensor_id = $1 
       ORDER BY time DESC 
       LIMIT 1`,
      [sensorId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting real-time data:', error);
    return null;
  }
};

// Get historical data (simplified)
const getHistoricalData = async (sensorId = 1, hours = 24) => {
  try {
    const result = await query(
      `SELECT time, voltage, current, power, energy, hz, pf
       FROM sensor_data 
       WHERE sensor_id = $1 
         AND time >= NOW() - INTERVAL '${hours} hours'
       ORDER BY time DESC
       LIMIT 100`,
      [sensorId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting historical data:', error);
    return [];
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

module.exports = {
  query,
  getRealTimeData,
  getHistoricalData,
  pool
};