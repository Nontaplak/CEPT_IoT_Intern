class EnergyDashboard {
    constructor() {
        this.socket = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.connectSocket();
    }

    setupEventListeners() {
        const resetForm = document.getElementById('resetForm');
        resetForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleEnergyReset();
        });
    }

    connectSocket() {
        this.setConnectionStatus('กำลังเชื่อมต่อ...', 'secondary');

        // เชื่อมต่อ Socket.IO
        this.socket = io();

        // เมื่อเชื่อมต่อสำเร็จ
        this.socket.on('connect', () => {
            this.setConnectionStatus('เชื่อมต่อแล้ว', 'success');
        });

        // รับข้อมูลแบบ Real-Time
        this.socket.on('energy-update', (data) => {
            this.updateDisplayValues(data);
        });

        // เมื่อการเชื่อมต่อล้มเหลว
        this.socket.on('connect_error', () => {
            this.setConnectionStatus('การเชื่อมต่อล้มเหลว', 'danger');
        });

        // เมื่อ Socket หลุด
        this.socket.on('disconnect', () => {
            this.setConnectionStatus('ตัดการเชื่อมต่อ', 'danger');
        });
    }

    updateDisplayValues(data) {
        document.getElementById('voltage').textContent = this.formatNumber(data.voltage, 1);
        document.getElementById('current').textContent = this.formatNumber(data.current, 2);
        document.getElementById('power').textContent = this.formatNumber(data.power, 0);
        document.getElementById('energy').textContent = this.formatNumber(data.energy, 0);
        document.getElementById('frequency').textContent = this.formatNumber(data.hz, 1);
        document.getElementById('powerFactor').textContent = this.formatNumber(data.pf, 2);

        if (data.time) {
            const lastUpdate = new Date(data.time).toLocaleString('th-TH');
            document.getElementById('lastUpdate').textContent = lastUpdate;
        }

        this.addUpdatingEffect();
    }

    formatNumber(value, decimals = 0) {
        if (value === null || value === undefined) return '0';
        return Number(value).toFixed(decimals);
    }

    addUpdatingEffect() {
        const cards = document.querySelectorAll('.metric-card');
        cards.forEach(card => {
            card.classList.add('updating');
            setTimeout(() => card.classList.remove('updating'), 500);
        });
    }

    setConnectionStatus(text, type) {
        const statusElement = document.getElementById('connectionStatus');
        statusElement.textContent = text;
        statusElement.className = `badge badge-${type}`;
    }

    async handleEnergyReset() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const resetBtn = document.getElementById('resetBtn');
        const messageDiv = document.getElementById('resetMessage');

        if (!username || !password) {
            this.showMessage('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'danger');
            return;
        }

        resetBtn.disabled = true;
        resetBtn.textContent = 'กำลังรีเซ็ต...';

        try {
            const response = await fetch('/api/reset-energy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (response.ok) {
                this.showMessage('ส่งคำสั่งรีเซ็ตพลังงานเรียบร้อยแล้ว', 'success');
                document.getElementById('resetForm').reset();
            } else {
                this.showMessage(result.error || 'เกิดข้อผิดพลาดในการรีเซ็ต', 'danger');
            }
        } catch (error) {
            console.error('Reset error:', error);
            this.showMessage('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'danger');
        } finally {
            resetBtn.disabled = false;
            resetBtn.textContent = 'รีเซ็ตพลังงาน';
        }
    }

    showMessage(message, type) {
        const messageDiv = document.getElementById('resetMessage');
        messageDiv.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        setTimeout(() => {
            const alert = messageDiv.querySelector('.alert');
            if (alert) alert.remove();
        }, 5000);
    }

    destroy() {
        if (this.socket) this.socket.disconnect();
    }
}

// ✅ รันเมื่อหน้าโหลดเสร็จ
document.addEventListener('DOMContentLoaded', () => {
    window.energyDashboard = new EnergyDashboard();
});

// ✅ ปิด socket เมื่อหน้าเว็บถูกปิด
window.addEventListener('beforeunload', () => {
    if (window.energyDashboard) {
        window.energyDashboard.destroy();
    }
});
