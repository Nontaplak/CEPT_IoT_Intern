const authenticate = (req, res, next) => {
    const { username, password } = req.body;
    
    // Simple authentication - ใช้ env variables
    const validUsername = process.env.ADMIN_USERNAME || 'admin';
    const validPassword = process.env.ADMIN_PASSWORD || 'password123';
    
    if (!username || !password) {
        return res.status(400).json({ 
            error: 'Username and password required',
            message: 'Please provide credentials in body, headers, or query params'
        });
    }
    
    if (username === validUsername && password === validPassword) {
        // ✅ สำคัญ: ต้อง set req.user ให้มีข้อมูล user
        req.user = {
            username: username,
            authenticatedAt: new Date().toISOString()
        };
        
        console.log(`✅ User authenticated: ${username} from IP: ${req.realIP || req.ip}`);
        next();
    } else {
        console.log(`❌ Authentication failed for: ${username} from IP: ${req.realIP || req.ip}`);
        return res.status(401).json({ 
            error: 'Invalid username or password' 
        });
    }
};
module.exports = {
    authenticate
};