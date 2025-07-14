// dashboard.js
// Dashboard Manager Class
class DashboardManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentUser = null;
        this.lastValidData = null;
        this.init();
    }

    init() {
        this.checkAuth();
        this.setupSocket();
        this.setupEventListeners();
        this.updateConnectionStatus('กำลังเชื่อมต่อ...', 'secondary');
    }

    // Check authentication status
    checkAuth() {
        const token = this.getStoredToken();
        if (token) {
            this.fetchUserProfile(token);
        } else {
            this.updateAuthButton('เข้าสู่ระบบ', false);
        }
    }

    getStoredToken() {
        try {
            return localStorage.getItem('token');
        } catch (error) {
            console.warn('localStorage not available:', error);
            return null;
        }
    }

    setStoredToken(token) {
        try {
            if (token) {
                localStorage.setItem('token', token);
            } else {
                localStorage.removeItem('token');
            }
        } catch (error) {
            console.warn('localStorage not available:', error);
        }
    }

    async fetchUserProfile(token) {
        try {
            const response = await fetch('/api/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                this.updateAuthButton(`${data.user.username} (ออกจากระบบ)`, true);
                this.updateResetSection(data.user.canResetEnergy);
            } else {
                this.setStoredToken(null);
                this.updateAuthButton('เข้าสู่ระบบ', false);
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            this.updateAuthButton('เข้าสู่ระบบ', false);
        }
    }

    updateAuthButton(text, isLoggedIn) {
        const authButton = document.getElementById('authButton');
        if (authButton) {
            authButton.textContent = text;
            authButton.onclick = isLoggedIn ? () => this.logout() : () => this.goToLogin();
        }
    }

    updateResetSection(canReset) {
        const resetSection = document.getElementById('resetSection');
        if (resetSection) {
            resetSection.style.display = canReset ? 'block' : 'none';
        }
    }

    goToLogin() {
        window.location.href = '/login';
    }

    logout() {
        this.setStoredToken(null);
        this.currentUser = null;
        this.updateAuthButton('เข้าสู่ระบบ', false);
        this.updateResetSection(false);
        
        // Optional: Call logout API
        fetch('/api/logout', { method: 'POST' })
            .catch(error => console.error('Logout error:', error));
    }

    setupSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.updateConnectionStatus('เชื่อมต่อสำเร็จ', 'success');
            console.log('🟢 Connected to server');
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.updateConnectionStatus('การเชื่อมต่อขาดหาย', 'danger');
            console.log('🔴 Disconnected from server');
        });

        this.socket.on('energy-update', (data) => {
            if (this.isValidData(data)) {
                this.lastValidData = data;
                this.updateDashboard(data);
            }
            // If not valid, do nothing (keeps last value)
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            this.updateConnectionStatus('เชื่อมต่อล้มเหลว', 'danger');
        });
    }

    setupEventListeners() {
        // Reset form handler
        const resetForm = document.getElementById('resetForm');
        if (resetForm) {
            resetForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleEnergyReset();
            });
        }

        // Load initial data
        this.loadInitialData();
    }

    async loadInitialData() {
        try {
            const response = await fetch('/api/data/latest');
            if (response.ok) {
                const data = await response.json();
                if (this.isValidData(data)) {
                    this.lastValidData = data;
                    this.updateDashboard(data);
                }
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    isValidData(data) {
        return data &&
            ['voltage', 'current', 'power', 'energy', 'hz', 'pf'].some(
                key => typeof data[key] === 'number' && data[key] !== 0 && data[key] !== null && data[key] !== undefined
            );
    }

    updateDashboard(data) {
        // Use lastValidData if data is invalid
        const displayData = this.isValidData(data) ? data : this.lastValidData;
        if (!displayData) return; // Nothing to show

        const elements = {
            'voltage': { value: displayData.voltage, unit: 'V', decimals: 1 },
            'current': { value: displayData.current, unit: 'A', decimals: 2 },
            'power': { value: displayData.power, unit: 'W', decimals: 0 },
            'energy': { value: displayData.energy, unit: 'Wh', decimals: 0 },
            'frequency': { value: displayData.hz, unit: 'Hz', decimals: 1 },
            'powerFactor': { value: displayData.pf, unit: '', decimals: 2 }
        };

        Object.entries(elements).forEach(([id, config]) => {
            const element = document.getElementById(id);
            if (element && typeof config.value === 'number') {
                element.textContent = config.value.toFixed(config.decimals);
            }
        });

        // Update last update time
        const lastUpdateElement = document.getElementById('lastUpdate');
        if (lastUpdateElement) {
            lastUpdateElement.textContent = displayData.time ? new Date(displayData.time).toLocaleString('th-TH') : '-';
        }
    }

    updateConnectionStatus(message, type) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `badge badge-${type}`;
        }
    }

    async handleEnergyReset() {
        if (!this.currentUser || !this.currentUser.canResetEnergy) {
            this.showResetMessage('คุณไม่มีสิทธิ์ในการรีเซ็ตค่าพลังงาน', 'warning');
            return;
        }

        const sensorId = document.getElementById('sensorId').value;
        const token = this.getStoredToken();

        if (!token) {
            this.showResetMessage('กรุณาเข้าสู่ระบบก่อน', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/reset-energy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ sensor_id: sensorId })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.showResetMessage('ส่งคำสั่งรีเซ็ตพลังงานสำเร็จ', 'success');
                document.getElementById('resetForm').reset();
            } else {
                this.showResetMessage(data.error || 'เกิดข้อผิดพลาดในการรีเซ็ต', 'danger');
            }
        } catch (error) {
            console.error('Reset error:', error);
            this.showResetMessage('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'danger');
        }
    }

    showResetMessage(message, type) {
        const messageDiv = document.getElementById('resetMessage');
        if (!messageDiv) return;

        messageDiv.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;

        setTimeout(() => {
            messageDiv.innerHTML = '';
        }, 5000);
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.dashboardManager = new DashboardManager();
        console.log('✅ Dashboard initialized');
    } catch (error) {
        console.error('❌ Failed to initialize dashboard:', error);
    }
});
class EnergyDashboard {
    constructor() {
        this.token = this.getStoredToken();
        this.currentUser = null;
        this.lastValidData = null;
        this.socket = null;
        this.init();
    }

    async init() {
        this.setupAuthButton();
        await this.checkAuth();
        this.setupResetForm();
        this.connectSocket();
        this.loadInitialData();
    }

    getStoredToken() {
        try {
            return localStorage.getItem('token');
        } catch {
            return null;
        }
    }

    setStoredToken(token) {
        try {
            if (token) localStorage.setItem('token', token);
            else localStorage.removeItem('token');
        } catch {}
    }

    setupAuthButton() {
        const btn = document.getElementById('authButton');
        if (btn) {
            btn.onclick = () => {
                if (this.currentUser) this.logout();
                else window.location.href = '/login';
            };
        }
    }

    async checkAuth() {
        const btn = document.getElementById('authButton');
        const resetSection = document.getElementById('resetSection');
        if (!this.token) {
            btn.textContent = 'เข้าสู่ระบบ';
            if (resetSection) resetSection.style.display = 'none';
            return;
        }
        try {
            const res = await fetch('/api/profile', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                this.currentUser = data.user;
                btn.textContent = `${data.user.username} (ออกจากระบบ)`;
                // ถ้าเป็น admin ให้โชว์ปุ่ม reset
                if (resetSection) resetSection.style.display = (data.user.role === 'admin') ? 'block' : 'none';
            } else {
                this.logout();
            }
        } catch {
            this.logout();
        }
    }

    logout() {
        this.setStoredToken(null);
        this.token = null;
        this.currentUser = null;
        const btn = document.getElementById('authButton');
        if (btn) btn.textContent = 'เข้าสู่ระบบ';
        const resetSection = document.getElementById('resetSection');
        if (resetSection) resetSection.style.display = 'none';
        fetch('/api/logout', { method: 'POST' }).catch(() => {});
    }

    setupResetForm() {
        const btn = document.getElementById('resetEnergyBtn');
        if (btn) {
            btn.addEventListener('click', async () => {
                // ใช้ sensor_id จากข้อมูลล่าสุดที่แสดงอยู่
                const sensorId = this.lastValidData ? this.lastValidData.sensor_id : 1;
                if (!window.confirm(`คุณต้องการรีเซ็ตค่าพลังงานของ Sensor ID ${sensorId} จริงหรือไม่?`)) return;
                await this.handleEnergyReset(sensorId);
            });
        }
    }

    async handleEnergyReset(sensorId) {
        if (!this.token) return this.showMessage('กรุณาเข้าสู่ระบบก่อน', 'warning');
        try {
            const res = await fetch('/api/reset-energy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ sensor_id: sensorId })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                this.showMessage('รีเซ็ตพลังงานสำเร็จ', 'success');
            } else {
                this.showMessage(data.error || 'เกิดข้อผิดพลาด', 'danger');
            }
        } catch {
            this.showMessage('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'danger');
        }
    }

    showMessage(msg, type) {
        const div = document.getElementById('resetMessage');
        if (!div) return;
        div.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
        setTimeout(() => { div.innerHTML = ''; }, 5000);
    }

    connectSocket() {
        this.socket = io();
        this.socket.on('connect', () => this.setConnectionStatus('เชื่อมต่อแล้ว', 'success'));
        this.socket.on('disconnect', () => this.setConnectionStatus('ขาดการเชื่อมต่อ', 'danger'));
        this.socket.on('energy-update', (data) => {
            if (this.isValidData(data)) {
                this.lastValidData = data;
                this.updateDashboard(data);
            }
        });
    }

    setConnectionStatus(text, type) {
        const el = document.getElementById('connectionStatus');
        if (el) {
            el.textContent = text;
            el.className = `badge badge-${type}`;
        }
    }

    async loadInitialData() {
        try {
            const res = await fetch('/api/data/latest');
            if (res.ok) {
                const data = await res.json();
                if (this.isValidData(data)) {
                    this.lastValidData = data;
                    this.updateDashboard(data);
                }
            }
        } catch {}
    }

    isValidData(data) {
        return data &&
            ['voltage', 'current', 'power', 'energy', 'hz', 'pf'].some(
                key => typeof data[key] === 'number' && !isNaN(data[key]) && data[key] !== 0
            );
    }

    updateDashboard(data) {
        const d = this.isValidData(data) ? data : this.lastValidData;
        if (!d) return;
        const map = {
            voltage: { value: d.voltage, decimals: 1 },
            current: { value: d.current, decimals: 2 },
            power: { value: d.power, decimals: 0 },
            energy: { value: d.energy, decimals: 0 },
            frequency: { value: d.hz, decimals: 1 },
            powerFactor: { value: d.pf, decimals: 2 }
        };
        Object.entries(map).forEach(([id, cfg]) => {
            const el = document.getElementById(id);
            if (el && typeof cfg.value === 'number') el.textContent = cfg.value.toFixed(cfg.decimals);
        });
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) lastUpdate.textContent = d.time ? new Date(d.time).toLocaleString('th-TH') : '-';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.energyDashboard = new EnergyDashboard();
});