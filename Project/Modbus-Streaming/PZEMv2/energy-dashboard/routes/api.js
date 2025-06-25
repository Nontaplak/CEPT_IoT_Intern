const express = require('express');
const router = express.Router();
const mqtt = require('mqtt');
const pool = require('../config/database');
const auth = require('../middleware/auth');

// MQTT setup
const mqttClient = mqtt.connect('mqtt://mqtt.netpie.io', {
    clientId: process.env.MQTT_CLIENT_ID,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD
});
mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
});

// Get latest sensor data
router.get('/data/latest', async (req, res) => {
    try {
        const query = `
            SELECT time, sensor_id, voltage, current, power, energy, hz, pf
            FROM sensor_data 
            WHERE sensor_id = 1 
            ORDER BY time DESC 
            LIMIT 1
        `;
        
        const result = await pool.query(query);
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.json({
                time: null,
                sensor_id: 1,
                voltage: 0,
                current: 0,
                power: 0,
                energy: 0,
                hz: 0,
                pf: 0
            });
        }
    } catch (error) {
        console.error('Error fetching latest data:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get historical data for charts
router.get('/data/history', async (req, res) => {
    try {
        const hours = req.query.hours || 24;
        const query = `
            SELECT 
                time_bucket('1 hour', time) as time_bucket,
                AVG(voltage) as avg_voltage,
                AVG(current) as avg_current,
                AVG(power) as avg_power,
                MAX(energy) as max_energy,
                AVG(hz) as avg_hz,
                AVG(pf) as avg_pf
            FROM sensor_data 
            WHERE sensor_id = 1 
                AND time >= NOW() - INTERVAL '${hours} hours'
            GROUP BY time_bucket
            ORDER BY time_bucket DESC
            LIMIT 24
        `;
        
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching historical data:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Reset energy (requires authentication)
router.post('/reset-energy', auth.authenticate, async (req, res) => {
    try {
        // Send MQTT command to reset energy
        const resetCommand = {
            command: 'reset_energy',
            timestamp: new Date().toISOString(),
            sensor_id: 1
        };
        
        mqttClient.publish('sensor/commands', JSON.stringify(resetCommand));
        
        console.log('Energy reset command sent via MQTT');
        res.json({ 
            success: true, 
            message: 'Energy reset command sent to sensor',
            timestamp: resetCommand.timestamp
        });
    } catch (error) {
        console.error('Error sending reset command:', error);
        res.status(500).json({ error: 'Failed to send reset command' });
    }
});

module.exports = router;