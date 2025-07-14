// public/js/login.js
class LoginManager {
    constructor() {
        this.init();
    }

    init() {
        // Check if already logged in
        this.checkExistingAuth();
        
        // Setup event listeners
        this.setupEventListeners();
    }

    checkExistingAuth() {
        const token = this.getStoredToken();
        if (token && this.isCurrentPage('/login')) {
            // If already logged in and on login page, redirect to dashboard
            window.location.href = '/';
        }
    }

    isCurrentPage(path) {
        return window.location.pathname === path;
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

    setupEventListeners() {
        const loginForm = document.getElementById('loginForm');
        const signupLink = document.getElementById('signupLink');

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        if (signupLink) {
            signupLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showMessage('ฟีเจอร์สมัครสมาชิกยังไม่เปิดใช้งาน', 'warning');
            });
        }

        // Handle Enter key in password field
        const passwordField = document.getElementById('password');
        if (passwordField) {
            passwordField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleLogin();
                }
            });
        }
    }

    async handleLogin() {
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const submitButton = document.querySelector('#loginForm button[type="submit"]');

        if (!usernameInput || !passwordInput || !submitButton) {
            this.showMessage('ไม่พบองค์ประกอบของแบบฟอร์ม', 'danger');
            return;
        }

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        // Validation
        if (!username || !password) {
            this.showMessage('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'warning');
            return;
        }

        // Show loading state
        const originalText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'กำลังเข้าสู่ระบบ...';

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Store token
                this.setStoredToken(data.token);
                
                // Show success message
                this.showMessage('เข้าสู่ระบบสำเร็จ กำลังเปลี่ยนหน้า...', 'success');
                
                // Redirect to dashboard after short delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
            } else {
                // Show error message
                const errorMessage = data.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
                this.showMessage(errorMessage, 'danger');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showMessage('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์', 'danger');
        } finally {
            // Reset button state
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    }

    showMessage(message, type) {
        const messageDiv = document.getElementById('loginMessage');
        if (!messageDiv) {
            console.error('Message container not found');
            return;
        }

        // Clear previous message
        messageDiv.innerHTML = '';

        // Create alert element
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.role = 'alert';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;

        messageDiv.appendChild(alertDiv);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
}

// Initialize login manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.loginManager = new LoginManager();
    } catch (error) {
        console.error('Failed to initialize login manager:', error);
    }
});