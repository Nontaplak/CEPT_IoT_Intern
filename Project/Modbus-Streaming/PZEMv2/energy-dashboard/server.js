const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');                 // ✅ เพิ่ม
const socketIo = require('socket.io');        // ✅ เพิ่ม

const apiRoutes = require('./routes/api');
//const auth = require('./middleware/auth');
const { authenticate } = require('./middleware/auth');

// Apply authentication middleware ONLY on protected routes
// (หรือไม่ต้องใช้ global middlewareตรงนี้เลย ถ้าคุณใช้ในแต่ละ route อยู่แล้ว)

const pool = require('./config/database');    // ✅ สำหรับ query DB

// Load .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 🔧 สร้าง HTTP Server และเชื่อม Socket.IO
const server = http.createServer(app);
const io = socketIo(server); // <-- จะใช้กับ dashboard.js

// Middleware สำหรับจัดการ IP address
app.use((req, res, next) => {
    // ได้ real IP address ถึงแม้จะผ่าน proxy
    req.realIP = req.headers['x-forwarded-for'] || 
                 req.headers['x-real-ip'] || 
                 req.connection.remoteAddress || 
                 req.socket.remoteAddress ||
                 (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                 req.ip ||
                 'unknown';
    
    // ถ้ามี multiple IPs (ผ่าน proxy หลายชั้น) ให้เอาตัวแรก
    if (req.realIP.includes(',')) {
        req.realIP = req.realIP.split(',')[0].trim();
    }
    
    next();
});

// ถ้าใช้ express ใหม่ๆ ให้เพิ่ม trust proxy
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware + API
//app.use('/api', auth);
app.use('/api', apiRoutes);

// Serve Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handlers
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});


// ✅ Real-time data push
io.on('connection', (socket) => {
  console.log('🌐 A user connected');

  // ส่งข้อมูลทุกวินาที
  const interval = setInterval(async () => {
    try {
      const result = await pool.query(
        `SELECT time, sensor_id, voltage, current, power, energy, hz, pf 
         FROM sensor_data 
         WHERE sensor_id = 1 
         ORDER BY time DESC 
         LIMIT 1`
      );
      if (result.rows.length > 0) {
        socket.emit('energy-update', result.rows[0]);
      }
    } catch (error) {
      console.error('Error sending real-time data:', error);
    }
  }, 1000);

  socket.on('disconnect', () => {
    console.log('❌ User disconnected');
    clearInterval(interval);
  });
});

// ✅ Start server with Socket.IO
server.listen(PORT, () => {
  console.log(`🚀 Energy Dashboard Server running on port ${PORT}`);
  console.log(`👉 Access dashboard at: http://localhost:${PORT}`);
});
