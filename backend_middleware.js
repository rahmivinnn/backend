// ============================================================================
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// ============================================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const Redis = require('ioredis');
const geoip = require('geoip-lite');

// Redis client for session management
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
});

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Security headers
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
});

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
};

// Rate limiting configurations
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    store: new (require('rate-limit-redis'))({
      client: redis,
      prefix: 'rl:'
    })
  });
};

// Different rate limits for different endpoints
const rateLimits = {
  general: createRateLimit(15 * 60 * 1000, 100, 'Too many requests'),
  auth: createRateLimit(15 * 60 * 1000, 5, 'Too many authentication attempts'),
  game: createRateLimit(60 * 1000, 30, 'Too many game requests'),
  chat: createRateLimit(60 * 1000, 50, 'Too many chat messages'),
  payment: createRateLimit(60 * 60 * 1000, 10, 'Too many payment requests')
};

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

// JWT token verification
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user session exists in Redis
    const sessionData = await redis.get(`session:${decoded.userId}`);
    if (!sessionData) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const session = JSON.parse(sessionData);
    
    // Attach user info to request
    req.user = {
      id: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      sessionId: session.sessionId
    };

    // Update last activity
    await redis.setex(`session:${decoded.userId}`, 24 * 60 * 60, JSON.stringify({
      ...session,
      lastActivity: new Date().toISOString()
    }));

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Optional authentication (for public endpoints that can benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const sessionData = await redis.get(`session:${decoded.userId}`);
      
      if (sessionData) {
        const session = JSON.parse(sessionData);
        req.user = {
          id: decoded.userId,
          username: decoded.username,
          role: decoded.role,
          sessionId: session.sessionId
        };
      }
    }
    next();
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
};

// Admin authentication
const authenticateAdmin = async (req, res, next) => {
  try {
    await authenticateToken(req, res, () => {});
    
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// ============================================================================
// VALIDATION MIDDLEWARE
// ============================================================================

// Common validation rules
const validationRules = {
  register: [
    body('username')
      .isLength({ min: 3, max: 20 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username must be 3-20 characters, alphanumeric and underscore only'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email required'),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must be at least 8 characters with uppercase, lowercase, number and special character'),
    body('deviceId')
      .optional()
      .isUUID()
      .withMessage('Invalid device ID format')
  ],
  
  login: [
    body('identifier')
      .notEmpty()
      .withMessage('Username or email required'),
    body('password')
      .notEmpty()
      .withMessage('Password required'),
    body('deviceId')
      .optional()
      .isUUID()
      .withMessage('Invalid device ID format')
  ],
  
  gameAction: [
    body('roomId')
      .isUUID()
      .withMessage('Valid room ID required'),
    body('action')
      .isIn(['join', 'leave', 'move', 'chat'])
      .withMessage('Invalid action type'),
    body('data')
      .optional()
      .isObject()
      .withMessage('Action data must be an object')
  ],
  
  transaction: [
    body('type')
      .isIn(['purchase', 'reward', 'gift', 'refund'])
      .withMessage('Invalid transaction type'),
    body('amount')
      .isFloat({ min: 0 })
      .withMessage('Amount must be a positive number'),
    body('currency')
      .isIn(['coins', 'gems', 'USD', 'EUR'])
      .withMessage('Invalid currency type')
  ],
  
  chatMessage: [
    body('channelId')
      .isUUID()
      .withMessage('Valid channel ID required'),
    body('message')
      .isLength({ min: 1, max: 500 })
      .trim()
      .escape()
      .withMessage('Message must be 1-500 characters'),
    body('messageType')
      .optional()
      .isIn(['text', 'emoji', 'sticker', 'image'])
      .withMessage('Invalid message type')
  ]
};

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// ============================================================================
// SECURITY CHECKS MIDDLEWARE
// ============================================================================

// Check for suspicious activity
const checkSuspiciousActivity = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const ip = req.ip || req.connection.remoteAddress;
    
    if (userId) {
      // Check rapid requests from same user
      const userRequestCount = await redis.incr(`suspicious:user:${userId}`);
      await redis.expire(`suspicious:user:${userId}`, 60);
      
      if (userRequestCount > 100) { // More than 100 requests per minute
        await logSecurityEvent(userId, 'rapid_requests', 'high', {
          requestCount: userRequestCount,
          ip: ip
        });
        return res.status(429).json({ error: 'Too many requests detected' });
      }
    }
    
    // Check rapid requests from same IP
    const ipRequestCount = await redis.incr(`suspicious:ip:${ip}`);
    await redis.expire(`suspicious:ip:${ip}`, 60);
    
    if (ipRequestCount > 200) { // More than 200 requests per minute from same IP
      await logSecurityEvent(userId, 'rapid_requests_ip', 'medium', {
        requestCount: ipRequestCount,
        ip: ip
      });
      return res.status(429).json({ error: 'Too many requests from this IP' });
    }
    
    next();
  } catch (error) {
    console.error('Suspicious activity check failed:', error);
    next(); // Continue on error
  }
};

// Geolocation and device tracking
const trackUserLocation = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    if (userId && ip) {
      const geo = geoip.lookup(ip);
      const locationKey = `location:${userId}`;
      
      // Get previous location
      const prevLocationData = await redis.get(locationKey);
      
      if (prevLocationData) {
        const prevLocation = JSON.parse(prevLocationData);
        
        // Check for suspicious location change (different country)
        if (geo && prevLocation.country !== geo.country) {
          await logSecurityEvent(userId, 'location_change', 'medium', {
            previousLocation: prevLocation,
            newLocation: geo,
            ip: ip,
            userAgent: userAgent
          });
        }
      }
      
      // Update current location
      if (geo) {
        await redis.setex(locationKey, 24 * 60 * 60, JSON.stringify({
          country: geo.country,
          region: geo.region,
          city: geo.city,
          ip: ip,
          lastSeen: new Date().toISOString()
        }));
      }
    }
    
    next();
  } catch (error) {
    console.error('Location tracking failed:', error);
    next(); // Continue on error
  }
};

// ============================================================================
// GAME-SPECIFIC MIDDLEWARE
// ============================================================================

// Check if user is in a game session
const checkGameSession = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const activeSession = await redis.get(`game_session:${userId}`);
    
    if (activeSession) {
      req.gameSession = JSON.parse(activeSession);
    }
    
    next();
  } catch (error) {
    console.error('Game session check failed:', error);
    next();
  }
};

// Validate game move
const validateGameMove = async (req, res, next) => {
  try {
    const { roomId, action, data } = req.body;
    const userId = req.user.id;
    
    // Check if user is in the specified room
    const roomData = await redis.get(`room:${roomId}`);
    if (!roomData) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const room = JSON.parse(roomData);
    const isPlayerInRoom = room.players.some(p => p.userId === userId);
    
    if (!isPlayerInRoom) {
      return res.status(403).json({ error: 'Not a player in this room' });
    }
    
    // Check if it's player's turn (for turn-based games)
    if (room.gameType === 'domino' && room.currentTurn !== userId) {
      return res.status(400).json({ error: 'Not your turn' });
    }
    
    // Validate move data based on game rules
    if (action === 'move' && !isValidDominoMove(data, room.gameState)) {
      return res.status(400).json({ error: 'Invalid move' });
    }
    
    req.roomData = room;
    next();
  } catch (error) {
    console.error('Game move validation failed:', error);
    return res.status(500).json({ error: 'Move validation error' });
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Log security events
const logSecurityEvent = async (userId, eventType, severity, additionalData = {}) => {
  try {
    const db = require('./database'); // Assume database connection
    
    await db.query(`
      INSERT INTO security_audit_log (user_id, event_type, severity, description, ip_address, user_agent, additional_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      userId,
      eventType,
      severity,
      `Security event: ${eventType}`,
      additionalData.ip,
      additionalData.userAgent,
      JSON.stringify(additionalData)
    ]);
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
};

// Validate domino move (game-specific logic)
const isValidDominoMove = (moveData, gameState) => {
  // Implement domino game rules validation
  // This is a simplified example
  if (!moveData.domino || !moveData.position) {
    return false;
  }
  
  const { domino, position } = moveData;
  const { board, playerHands } = gameState;
  
  // Check if domino exists in player's hand
  // Check if domino can be placed at the specified position
  // Check if the move follows domino rules
  
  return true; // Simplified - implement actual game logic
};

// Generate secure session ID
const generateSessionId = () => {
  return require('crypto').randomBytes(32).toString('hex');
};

// Hash password
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Compare password
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: 'higgs-domino-api',
      audience: 'higgs-domino-client'
    }
  );
};

// Blacklist token
const blacklistToken = async (token) => {
  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.setex(`blacklist:${token}`, ttl, 'true');
      }
    }
  } catch (error) {
    console.error('Failed to blacklist token:', error);
  }
};

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

// Global error handler
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  // Log error to database
  logSecurityEvent(req.user?.id, 'application_error', 'low', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Internal server error' });
  }
  
  return res.status(500).json({
    error: err.message,
    stack: err.stack
  });
};

// 404 handler
const notFoundHandler = (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Security middleware
  securityHeaders,
  corsOptions,
  rateLimits,
  
  // Authentication middleware
  authenticateToken,
  optionalAuth,
  authenticateAdmin,
  
  // Validation middleware
  validationRules,
  handleValidationErrors,
  
  // Security checks
  checkSuspiciousActivity,
  trackUserLocation,
  
  // Game-specific middleware
  checkGameSession,
  validateGameMove,
  
  // Utility functions
  generateSessionId,
  hashPassword,
  comparePassword,
  generateToken,
  blacklistToken,
  logSecurityEvent,
  
  // Error handling
  errorHandler,
  notFoundHandler,
  
  // Redis client
  redis
};