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
// Reset energy with improved MQTT handling
router.post('/reset-energy', auth.authenticate, async (req, res) => {
    try {
        const sensorId = req.body.sensor_id || 1; // Allow specifying sensor ID
        const username = req.user.username; // Get username from authenticated user
        const ipAddress = req.realIP || req.ip || req.connection.remoteAddress || 'unknown';        
        // Check MQTT connection
        if (!mqttClient.connected) {
            return res.status(503).json({ 
                error: 'MQTT broker not connected',
                success: false 
            });
        }
        
        // Create reset command
        const resetCommand = {
            command: 'reset_energy',
            timestamp: new Date().toISOString(),
            sensor_id: sensorId,
            request_id: Date.now(), // Add request ID for tracking
            username: username,
            ip_address: ipAddress
        };
        
        // Publish command to MQTT
        const published = mqttClient.publish('@msg/commands', JSON.stringify(resetCommand), {
            qos: 1, // Ensure message delivery
            retain: false
        });
        
        if (published) {
            console.log('Energy reset command sent via MQTT:', resetCommand);
            
            // Log the reset command to database with user and IP info
            try {
                await pool.query(
                    'INSERT INTO reset_logs (sensor_id, timestamp, request_id, status, username, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
                    [sensorId, resetCommand.timestamp, resetCommand.request_id, 'sent', username, ipAddress]
                );
                console.log(`Reset command logged: User=${username}, IP=${ipAddress}, Sensor=${sensorId}`);
            } catch (dbError) {
                console.error('Failed to log reset command:', dbError);
                // Don't fail the request if logging fails, but log the error
            }
            
            res.json({ 
                success: true, 
                message: 'Energy reset command sent to sensor',
                sensor_id: sensorId,
                timestamp: resetCommand.timestamp,
                request_id: resetCommand.request_id,
                username: username,
                ip_address: ipAddress
            });
        } else {
            throw new Error('Failed to publish MQTT message');
        }
        
    } catch (error) {
        console.error('Error sending reset command:', error);
        res.status(500).json({ 
            error: 'Failed to send reset command',
            success: false,
            details: error.message
        });
    }
});

router.get('/reset-logs', auth.authenticate, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        
        // สร้าง WHERE clause สำหรับ filter
        let whereClause = 'WHERE 1=1';
        let queryParams = [];
        let paramIndex = 1;
        
        if (req.query.sensor_id) {
            whereClause += ` AND sensor_id = $${paramIndex}`;
            queryParams.push(req.query.sensor_id);
            paramIndex++;
        }
        
        if (req.query.username) {
            whereClause += ` AND username ILIKE $${paramIndex}`;
            queryParams.push(`%${req.query.username}%`);
            paramIndex++;
        }
        
        if (req.query.from_date) {
            whereClause += ` AND timestamp >= $${paramIndex}`;
            queryParams.push(req.query.from_date);
            paramIndex++;
        }
        
        if (req.query.to_date) {
            whereClause += ` AND timestamp <= $${paramIndex}`;
            queryParams.push(req.query.to_date);
            paramIndex++;
        }
        
        // Query สำหรับนับจำนวนทั้งหมด
        const countQuery = `SELECT COUNT(*) FROM reset_logs ${whereClause}`;
        const countResult = await pool.query(countQuery, queryParams);
        const totalCount = parseInt(countResult.rows[0].count);
        
        // Query สำหรับดึงข้อมูล
        const dataQuery = `
            SELECT 
                id,
                sensor_id,
                timestamp,
                request_id,
                status,
                username,
                ip_address,
                created_at
            FROM reset_logs 
            ${whereClause}
            ORDER BY timestamp DESC 
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        
        queryParams.push(limit, offset);
        const result = await pool.query(dataQuery, queryParams);
        
        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: page,
                limit: limit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
        
    } catch (error) {
        console.error('Error fetching reset logs:', error);
        res.status(500).json({ 
            success: false,
            error: 'Database error' 
        });
    }
});


module.exports = router;