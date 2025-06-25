const authenticate = (req, res, next) => {
    const { username, password } = req.body;
    
    // Simple authentication - ใช้ env variables
    const validUsername = process.env.ADMIN_USERNAME || 'admin';
    const validPassword = process.env.ADMIN_PASSWORD || 'password123';
    
    if (!username || !password) {
        return res.status(400).json({ 
            error: 'Username and password required' 
        });
    }
    
    if (username === validUsername && password === validPassword) {
        next();
    } else {
        return res.status(401).json({ 
            error: 'Invalid username or password' 
        });
    }
};

module.exports = {
    authenticate
};