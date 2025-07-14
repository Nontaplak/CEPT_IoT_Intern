const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const cookieParser = require('cookie-parser');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const apiRoutes = require('./routes/api');
const { pool, getRealTimeData } = require('./config/database');

// Middleware
app.use(cookieParser());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes (login/signup)
app.use('/api', apiRoutes);

// Serve dashboard and login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Error handlers
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Store last sent data for each socket
const lastSentData = new Map();

// Real-time data push via Socket.IO
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Initialize last sent data for this socket
  lastSentData.set(socket.id, null);
  
  const interval = setInterval(async () => {
    try {
      // Use the optimized getRealTimeData function
      const row = await getRealTimeData(1);
      
      if (row) {
        // Debug: Log raw data from database
        console.log('Latest DB row:', row);
        
        // Convert all metric values to numbers properly
        const processedRow = {
          time: row.time,
          sensor_id: row.sensor_id,
          voltage: row.voltage ? parseFloat(row.voltage) : 0,
          current: row.current ? parseFloat(row.current) : 0,
          power: row.power ? parseFloat(row.power) : 0,
          energy: row.energy ? parseFloat(row.energy) : 0,
          hz: row.hz ? parseFloat(row.hz) : 0,
          pf: row.pf ? parseFloat(row.pf) : 0
        };
        
        // Get last sent data for this socket
        const lastData = lastSentData.get(socket.id);
        
        // Check if data has actually changed (compare values with tolerance for floating point)
        const hasDataChanged = !lastData || 
          processedRow.time.getTime() !== lastData.time.getTime() ||
          Math.abs(processedRow.voltage - lastData.voltage) > 0.1 ||
          Math.abs(processedRow.current - lastData.current) > 0.01 ||
          Math.abs(processedRow.power - lastData.power) > 0.1 ||
          Math.abs(processedRow.energy - lastData.energy) > 0.1 ||
          Math.abs(processedRow.hz - lastData.hz) > 0.1 ||
          Math.abs(processedRow.pf - lastData.pf) > 0.01;
        
        // Always emit first time or if data has changed
        if (!lastData || hasDataChanged) {
          // Update last sent data
          lastSentData.set(socket.id, processedRow);
          
          // Emit the update
          socket.emit('energy-update', processedRow);
          
          // Log for debugging
          console.log(`Data sent to ${socket.id}:`, {
            voltage: processedRow.voltage,
            current: processedRow.current,
            power: processedRow.power,
            energy: processedRow.energy,
            hz: processedRow.hz,
            pf: processedRow.pf
          });
        }
      } else {
        console.log('No data found for sensor_id = 1');
      }
    } catch (error) {
      console.error('Database query error:', error);
    }
  }, 2000);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    clearInterval(interval);
    lastSentData.delete(socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  // Test DB connection on startup
  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to database');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
  }
  console.log(`🚀 Energy Dashboard Server running on port ${PORT}`);
  console.log(`👉 Access dashboard at: http://localhost:${PORT}`);
});