const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

// Import all services
const { pool } = require('./backend_middleware');
const CacheService = require('./cache_service');
const SecurityService = require('./security_service');
const AnalyticsService = require('./analytics_service');
const NotificationService = require('./notification_service');
const PaymentService = require('./payment_service');
const SubscriptionService = require('./subscription_service');
const MonitoringService = require('./monitoring_service');

// Import middleware
const {
    authenticateToken,
    authenticateAdmin,
    optionalAuth,
    checkSuspiciousActivity,
    trackUserLocation,
    validationRules,
    handleValidationErrors,
    rateLimits,
    corsOptions
} = require('./backend_middleware');

const router = express.Router();

// Initialize services
const cacheService = new CacheService();
const securityService = new SecurityService();
const analyticsService = new AnalyticsService();
const notificationService = new NotificationService();
const paymentService = new PaymentService();
const subscriptionService = new SubscriptionService();
const monitoringService = new MonitoringService();

// Middleware setup
router.use(helmet());
router.use(cors(corsOptions));
router.use(compression());
router.use(morgan('combined'));
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
router.get('/health', async (req, res) => {
    try {
        const health = await monitoringService.getHealthStatus();
        res.status(health.status === 'healthy' ? 200 : 503).json(health);
    } catch (error) {
        res.status(503).json({ status: 'error', message: error.message });
    }
});

// Metrics endpoint for monitoring
router.get('/metrics', async (req, res) => {
    try {
        const metrics = await monitoringService.getMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== AUTH ROUTES ====================

// User Registration
router.post('/auth/register', 
    rateLimits.auth,
    validationRules.register,
    handleValidationErrors,
    checkSuspiciousActivity,
    trackUserLocation,
    async (req, res) => {
        try {
            const { username, email, password, device_info } = req.body;
            
            // Check if user exists
            const existingUser = await pool.query(
                'SELECT id FROM users WHERE username = $1 OR email = $2',
                [username, email]
            );
            
            if (existingUser.rows.length > 0) {
                return res.status(400).json({ error: 'User already exists' });
            }
            
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);
            
            // Create user
            const result = await pool.query(
                `INSERT INTO users (username, email, password_hash, device_info, created_at, last_login)
                 VALUES ($1, $2, $3, $4, NOW(), NOW())
                 RETURNING id, username, email, coins, gems, level, experience`,
                [username, email, hashedPassword, JSON.stringify(device_info)]
            );
            
            const user = result.rows[0];
            
            // Generate JWT token
            const token = jwt.sign(
                { userId: user.id, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            // Cache user session
            await cacheService.setUserSession(user.id, {
                token,
                user: user,
                loginTime: new Date().toISOString()
            });
            
            // Track analytics
            await analyticsService.trackEvent('USER_REGISTERED', {
                userId: user.id,
                username: user.username,
                registrationMethod: 'email'
            });
            
            // Send welcome notification
            await notificationService.sendNotification(user.id, {
                type: 'WELCOME',
                title: 'Welcome to Higgs Domino!',
                message: 'Start your domino journey now!',
                data: { coins: 1000 }
            });
            
            res.status(201).json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    coins: user.coins,
                    gems: user.gems,
                    level: user.level,
                    experience: user.experience
                }
            });
            
        } catch (error) {
            monitoringService.recordError(error, 'AUTH_REGISTER');
            res.status(500).json({ error: 'Registration failed' });
        }
    }
);

// User Login
router.post('/auth/login',
    rateLimits.auth,
    validationRules.login,
    handleValidationErrors,
    checkSuspiciousActivity,
    trackUserLocation,
    async (req, res) => {
        try {
            const { username, password, device_info } = req.body;
            
            // Get user
            const result = await pool.query(
                'SELECT * FROM users WHERE username = $1 OR email = $1',
                [username]
            );
            
            if (result.rows.length === 0) {
                await securityService.recordFailedLogin(req.ip, username);
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            const user = result.rows[0];
            
            // Verify password
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                await securityService.recordFailedLogin(req.ip, username);
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            // Security checks
            const securityCheck = await securityService.validateLogin(user.id, req.ip, device_info);
            if (!securityCheck.allowed) {
                return res.status(403).json({ error: securityCheck.reason });
            }
            
            // Generate JWT token
            const token = jwt.sign(
                { userId: user.id, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            // Update last login
            await pool.query(
                'UPDATE users SET last_login = NOW(), device_info = $1 WHERE id = $2',
                [JSON.stringify(device_info), user.id]
            );
            
            // Cache user session
            await cacheService.setUserSession(user.id, {
                token,
                user: user,
                loginTime: new Date().toISOString()
            });
            
            // Track analytics
            await analyticsService.trackEvent('USER_LOGIN', {
                userId: user.id,
                username: user.username,
                loginMethod: 'password'
            });
            
            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    coins: user.coins,
                    gems: user.gems,
                    level: user.level,
                    experience: user.experience,
                    avatar_url: user.avatar_url,
                    vip_level: user.vip_level
                }
            });
            
        } catch (error) {
            monitoringService.recordError(error, 'AUTH_LOGIN');
            res.status(500).json({ error: 'Login failed' });
        }
    }
);

// Logout
router.post('/auth/logout', authenticateToken, async (req, res) => {
    try {
        await cacheService.invalidateUserSession(req.user.userId);
        
        // Track analytics
        await analyticsService.trackEvent('USER_LOGOUT', {
            userId: req.user.userId
        });
        
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        monitoringService.recordError(error, 'AUTH_LOGOUT');
        res.status(500).json({ error: 'Logout failed' });
    }
});

// ==================== USER ROUTES ====================

// Get user profile
router.get('/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await cacheService.getUserProfile(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ success: true, user });
    } catch (error) {
        monitoringService.recordError(error, 'USER_PROFILE');
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Update user profile
router.put('/user/profile', 
    authenticateToken,
    rateLimits.general,
    async (req, res) => {
        try {
            const { display_name, avatar_url, bio } = req.body;
            
            const result = await pool.query(
                `UPDATE users SET display_name = $1, avatar_url = $2, bio = $3, updated_at = NOW()
                 WHERE id = $4 RETURNING *`,
                [display_name, avatar_url, bio, req.user.userId]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Update cache
            await cacheService.invalidateUserCache(req.user.userId);
            
            // Track analytics
            await analyticsService.trackEvent('PROFILE_UPDATED', {
                userId: req.user.userId
            });
            
            res.json({ success: true, user: result.rows[0] });
        } catch (error) {
            monitoringService.recordError(error, 'USER_UPDATE_PROFILE');
            res.status(500).json({ error: 'Failed to update profile' });
        }
    }
);

// Get user balance
router.get('/user/balance', authenticateToken, async (req, res) => {
    try {
        const balance = await cacheService.getUserBalance(req.user.userId);
        res.json({ success: true, balance });
    } catch (error) {
        monitoringService.recordError(error, 'USER_BALANCE');
        res.status(500).json({ error: 'Failed to get balance' });
    }
});

// ==================== GAME ROUTES ====================

// Get active games
router.get('/game/active', authenticateToken, async (req, res) => {
    try {
        const games = await cacheService.getActiveGames();
        res.json({ success: true, games });
    } catch (error) {
        monitoringService.recordError(error, 'GAME_ACTIVE');
        res.status(500).json({ error: 'Failed to get active games' });
    }
});

// Get game history
router.get('/game/history', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        const result = await pool.query(
            `SELECT gs.*, gt.name as game_type_name 
             FROM game_sessions gs
             JOIN game_types gt ON gs.game_type_id = gt.id
             WHERE gs.player1_id = $1 OR gs.player2_id = $1 OR gs.player3_id = $1 OR gs.player4_id = $1
             ORDER BY gs.created_at DESC
             LIMIT $2 OFFSET $3`,
            [req.user.userId, limit, offset]
        );
        
        res.json({ success: true, games: result.rows });
    } catch (error) {
        monitoringService.recordError(error, 'GAME_HISTORY');
        res.status(500).json({ error: 'Failed to get game history' });
    }
});

// ==================== LEADERBOARD ROUTES ====================

// Get leaderboards
router.get('/leaderboard/:type', optionalAuth, async (req, res) => {
    try {
        const { type } = req.params;
        const { limit = 100 } = req.query;
        
        const leaderboard = await cacheService.getLeaderboard(type, limit);
        res.json({ success: true, leaderboard });
    } catch (error) {
        monitoringService.recordError(error, 'LEADERBOARD');
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

// ==================== SOCIAL ROUTES ====================

// Send friend request
router.post('/social/friend-request', 
    authenticateToken,
    rateLimits.general,
    async (req, res) => {
        try {
            const { target_user_id } = req.body;
            
            if (target_user_id === req.user.userId) {
                return res.status(400).json({ error: 'Cannot send friend request to yourself' });
            }
            
            // Check if already friends or request exists
            const existing = await pool.query(
                `SELECT * FROM friendships 
                 WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
                [req.user.userId, target_user_id]
            );
            
            if (existing.rows.length > 0) {
                return res.status(400).json({ error: 'Friend request already exists or already friends' });
            }
            
            // Create friend request
            await pool.query(
                `INSERT INTO friendships (user_id, friend_id, status, created_at)
                 VALUES ($1, $2, 'pending', NOW())`,
                [req.user.userId, target_user_id]
            );
            
            // Send notification
            await notificationService.sendNotification(target_user_id, {
                type: 'FRIEND_REQUEST',
                title: 'New Friend Request',
                message: `${req.user.username} sent you a friend request`,
                data: { from_user_id: req.user.userId }
            });
            
            // Track analytics
            await analyticsService.trackEvent('FRIEND_REQUEST_SENT', {
                userId: req.user.userId,
                targetUserId: target_user_id
            });
            
            res.json({ success: true, message: 'Friend request sent' });
        } catch (error) {
            monitoringService.recordError(error, 'FRIEND_REQUEST');
            res.status(500).json({ error: 'Failed to send friend request' });
        }
    }
);

// Get friends list
router.get('/social/friends', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.username, u.display_name, u.avatar_url, u.level, u.last_login,
                    f.status, f.created_at as friendship_date
             FROM friendships f
             JOIN users u ON (CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END) = u.id
             WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
             ORDER BY u.last_login DESC`,
            [req.user.userId]
        );
        
        res.json({ success: true, friends: result.rows });
    } catch (error) {
        monitoringService.recordError(error, 'FRIENDS_LIST');
        res.status(500).json({ error: 'Failed to get friends list' });
    }
});

// ==================== TRANSACTION ROUTES ====================

// Create payment
router.post('/payment/create',
    authenticateToken,
    rateLimits.payment,
    async (req, res) => {
        try {
            const { amount, currency, payment_method, product_id } = req.body;
            
            const payment = await paymentService.createPayment({
                userId: req.user.userId,
                amount,
                currency,
                paymentMethod: payment_method,
                productId: product_id
            });
            
            res.json({ success: true, payment });
        } catch (error) {
            monitoringService.recordError(error, 'PAYMENT_CREATE');
            res.status(500).json({ error: 'Failed to create payment' });
        }
    }
);

// Get transaction history
router.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, type } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT t.*, tt.name as transaction_type_name
            FROM transactions t
            JOIN transaction_types tt ON t.transaction_type_id = tt.id
            WHERE t.user_id = $1
        `;
        const params = [req.user.userId];
        
        if (type) {
            query += ` AND tt.name = $${params.length + 1}`;
            params.push(type);
        }
        
        query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        
        res.json({ success: true, transactions: result.rows });
    } catch (error) {
        monitoringService.recordError(error, 'TRANSACTIONS');
        res.status(500).json({ error: 'Failed to get transactions' });
    }
});

// ==================== SUBSCRIPTION ROUTES ====================

// Get subscription plans
router.get('/subscription/plans', optionalAuth, async (req, res) => {
    try {
        const plans = await subscriptionService.getPlans();
        res.json({ success: true, plans });
    } catch (error) {
        monitoringService.recordError(error, 'SUBSCRIPTION_PLANS');
        res.status(500).json({ error: 'Failed to get subscription plans' });
    }
});

// Subscribe to plan
router.post('/subscription/subscribe',
    authenticateToken,
    rateLimits.payment,
    async (req, res) => {
        try {
            const { plan_id, payment_method } = req.body;
            
            const subscription = await subscriptionService.createSubscription({
                userId: req.user.userId,
                planId: plan_id,
                paymentMethod: payment_method
            });
            
            res.json({ success: true, subscription });
        } catch (error) {
            monitoringService.recordError(error, 'SUBSCRIPTION_CREATE');
            res.status(500).json({ error: 'Failed to create subscription' });
        }
    }
);

// ==================== ANALYTICS ROUTES ====================

// Get user analytics (for admin)
router.get('/analytics/users',
    authenticateAdmin,
    async (req, res) => {
        try {
            const { period = 'daily', days = 7 } = req.query;
            const analytics = await analyticsService.getUserAnalytics(period, days);
            res.json({ success: true, analytics });
        } catch (error) {
            monitoringService.recordError(error, 'ANALYTICS_USERS');
            res.status(500).json({ error: 'Failed to get user analytics' });
        }
    }
);

// ==================== ADMIN ROUTES ====================

// Get system stats
router.get('/admin/stats',
    authenticateAdmin,
    async (req, res) => {
        try {
            const stats = await monitoringService.getSystemStats();
            res.json({ success: true, stats });
        } catch (error) {
            monitoringService.recordError(error, 'ADMIN_STATS');
            res.status(500).json({ error: 'Failed to get system stats' });
        }
    }
);

// Broadcast notification
router.post('/admin/broadcast',
    authenticateAdmin,
    async (req, res) => {
        try {
            const { title, message, type = 'ANNOUNCEMENT' } = req.body;
            
            await notificationService.broadcastNotification({
                type,
                title,
                message
            });
            
            res.json({ success: true, message: 'Notification broadcasted' });
        } catch (error) {
            monitoringService.recordError(error, 'ADMIN_BROADCAST');
            res.status(500).json({ error: 'Failed to broadcast notification' });
        }
    }
);

// Error handling middleware
router.use((error, req, res, next) => {
    monitoringService.recordError(error, 'API_ERROR');
    
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
    }
    
    if (error.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
router.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

module.exports = router;