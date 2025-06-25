const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'energy_dashboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

class Database {
  constructor() {
    this.client = null;
  }

  async connect() {
    try {
      this.client = new Client(dbConfig);
      await this.client.connect();
      console.log('Connected to TimescaleDB successfully');
      return this.client;
    } catch (error) {
      console.error('Database connection error:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      console.log('Database connection closed');
    }
  }

  async query(text, params) {
    try {
      if (!this.client) {
        await this.connect();
      }
      const result = await this.client.query(text, params);
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  // Get real-time data
  async getRealTimeData(sensorId = 1) {
    const query = `
      SELECT time, sensor_id, voltage, current, power, energy, hz, pf
      FROM sensor_data 
      WHERE sensor_id = $1 
      ORDER BY time DESC 
      LIMIT 1
    `;
    return await this.query(query, [sensorId]);
  }

  // Get historical data for charts
  async getHistoricalData(sensorId = 1, hours = 24) {
    const query = `
      SELECT 
        time_bucket('1 hour', time) as bucket,
        sensor_id,
        AVG(voltage) as avg_voltage,
        AVG(current) as avg_current,
        AVG(power) as avg_power,
        SUM(energy) as total_energy,
        AVG(hz) as avg_hz,
        AVG(pf) as avg_pf
      FROM sensor_data 
      WHERE sensor_id = $1 
        AND time >= NOW() - INTERVAL '$2 hours'
      GROUP BY bucket, sensor_id
      ORDER BY bucket ASC
    `;
    return await this.query(query, [sensorId, hours]);
  }

  // Get energy consumption summary
  async getEnergyConsumption(sensorId = 1, period = 'day') {
    let interval, bucketSize;
    
    switch(period) {
      case 'hour':
        interval = '1 hour';
        bucketSize = '5 minutes';
        break;
      case 'day':
        interval = '1 day';
        bucketSize = '1 hour';
        break;
      case 'week':
        interval = '7 days';
        bucketSize = '1 day';
        break;
      case 'month':
        interval = '30 days';
        bucketSize = '1 day';
        break;
      default:
        interval = '1 day';
        bucketSize = '1 hour';
    }

    const query = `
      SELECT 
        time_bucket('${bucketSize}', time) as bucket,
        SUM(energy) as total_energy,
        AVG(power) as avg_power,
        MAX(power) as max_power,
        MIN(power) as min_power
      FROM sensor_data 
      WHERE sensor_id = $1 
        AND time >= NOW() - INTERVAL '${interval}'
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    return await this.query(query, [sensorId]);
  }

  // Get power quality metrics
  async getPowerQuality(sensorId = 1, hours = 24) {
    const query = `
      SELECT 
        time_bucket('1 hour', time) as bucket,
        AVG(voltage) as avg_voltage,
        MIN(voltage) as min_voltage,
        MAX(voltage) as max_voltage,
        AVG(hz) as avg_frequency,
        MIN(hz) as min_frequency,
        MAX(hz) as max_frequency,
        AVG(pf) as avg_power_factor,
        MIN(pf) as min_power_factor
      FROM sensor_data 
      WHERE sensor_id = $1 
        AND time >= NOW() - INTERVAL '$2 hours'
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    return await this.query(query, [sensorId, hours]);
  }
}

module.exports = new Database();