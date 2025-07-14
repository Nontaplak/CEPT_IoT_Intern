const express = require('express');
const router = express.Router();
const mqtt = require('mqtt');
const pool = require('../config/database');
const { login, register, authenticate } = require('../middleware/auth');

// MQTT setup
const mqttClient = mqtt.connect('mqtt://mqtt.netpie.io', {
  clientId: process.env.MQTT_CLIENT_ID,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD
});

mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
});

// Login
router.post('/login', login);

// Register
router.post('/register', register);

// Logout
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// Get latest sensor data (public)
router.get('/data/latest', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT time, sensor_id, voltage, current, power, energy, hz, pf
       FROM sensor_data 
       WHERE sensor_id = 1 
       ORDER BY time DESC 
       LIMIT 1`
    );
    const row = result.rows[0];
    if (
      row &&
      ['voltage', 'current', 'power', 'energy', 'hz', 'pf'].some(
        key => row[key] !== 0 && row[key] !== null
      )
    ) {
      res.json(row);
    } else {
      res.status(204).send(); // No Content
    }
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Reset energy (requires authentication)
router.post('/reset-energy', authenticate, async (req, res) => {
  try {
    const sensorId = req.body.sensor_id || 1;
    const username = req.user.username || 'unknown';

    if (!mqttClient.connected) {
      return res.status(503).json({ success: false, error: 'MQTT broker not connected' });
    }

    // Create reset command
    const resetCommand = {
      command: 'reset_energy',
      timestamp: new Date().toISOString(),
      sensor_id: sensorId,
      request_id: Date.now(),
      username: username
    };

    mqttClient.publish('@msg/commands', JSON.stringify(resetCommand), { qos: 1, retain: false });

    // ดึงค่าพลังงานล่าสุดก่อนรีเซ็ต
    const energyResult = await pool.query(
      `SELECT energy FROM sensor_data WHERE sensor_id = $1 ORDER BY time DESC LIMIT 1`,
      [sensorId]
    );
    const previousEnergy = energyResult.rows[0] ? energyResult.rows[0].energy : null;

    // Log to reset_logs table
    await pool.query(
      `INSERT INTO reset_logs (sensor_id, username, reset_time, previous_energy)
       VALUES ($1, $2, $3, $4)`,
      [
        sensorId,
        username,
        resetCommand.timestamp,
        previousEnergy
      ]
    );

    res.json({
      success: true,
      message: 'Energy reset command sent to sensor',
      sensor_id: sensorId,
      timestamp: resetCommand.timestamp,
      request_id: resetCommand.request_id,
      username: username
    });
  } catch (error) {
    console.error('Error sending reset command:', error);
    res.status(500).json({ 
        error: 'Failed to send reset command',
        success: false,
        details: error.message
    });
  }
});

// Get user profile (requires authentication)
router.get('/profile', authenticate, async (req, res) => {
  try {
    // Get role from database
    const result = await pool.query('SELECT username, role FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });
    const user = result.rows[0];
    res.json({ success: true, user: { username: user.username, role: user.role } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;