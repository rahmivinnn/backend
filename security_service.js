// ============================================================================
// SECURITY AND ANTI-CHEAT SERVICE
// ============================================================================

const { Pool } = require('pg');
const Redis = require('ioredis');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const geoip = require('geoip-lite');
const useragent = require('useragent');

// Initialize Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
});

// Initialize PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'higgs_domino_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// ============================================================================
// SECURITY EVENT TYPES
// ============================================================================

const SECURITY_EVENTS = {
  // Authentication Events
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_BLOCKED: 'login_blocked',
  PASSWORD_CHANGED: 'password_changed',
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_UNLOCKED: 'account_unlocked',
  
  // Suspicious Activities
  MULTIPLE_DEVICE_LOGIN: 'multiple_device_login',
  UNUSUAL_LOCATION: 'unusual_location',
  RAPID_REQUESTS: 'rapid_requests',
  INVALID_TOKEN: 'invalid_token',
  SESSION_HIJACK_ATTEMPT: 'session_hijack_attempt',
  
  // Game Security
  IMPOSSIBLE_MOVE: 'impossible_move',
  TIMING_ANOMALY: 'timing_anomaly',
  SCORE_MANIPULATION: 'score_manipulation',
  CURRENCY_ANOMALY: 'currency_anomaly',
  DUPLICATE_TRANSACTION: 'duplicate_transaction',
  
  // System Security
  SQL_INJECTION_ATTEMPT: 'sql_injection_attempt',
  XSS_ATTEMPT: 'xss_attempt',
  BRUTE_FORCE_ATTACK: 'brute_force_attack',
  DDoS_ATTEMPT: 'ddos_attempt',
  API_ABUSE: 'api_abuse',
  
  // Data Security
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  DATA_BREACH_ATTEMPT: 'data_breach_attempt',
  PRIVILEGE_ESCALATION: 'privilege_escalation',
  ADMIN_ACTION: 'admin_action'
};

// ============================================================================
// THREAT LEVELS
// ============================================================================

const THREAT_LEVELS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

// ============================================================================
// SECURITY SERVICE CLASS
// ============================================================================

class SecurityService {
  constructor() {
    this.isInitialized = false;
    this.suspiciousPatterns = new Map();
    this.blockedIPs = new Set();
    this.init();
  }

  async init() {
    try {
      // Test database connection
      await pool.query('SELECT 1');
      console.log('Security service database connected');
      
      // Test Redis connection
      await redis.ping();
      console.log('Security service Redis connected');
      
      // Load blocked IPs from database
      await this.loadBlockedIPs();
      
      // Initialize suspicious patterns
      this.initializeSuspiciousPatterns();
      
      this.isInitialized = true;
      console.log('Security service initialized successfully');
    } catch (error) {
      console.error('Security service initialization error:', error);
    }
  }

  async loadBlockedIPs() {
    try {
      const query = `
        SELECT ip_address 
        FROM security_audit_log 
        WHERE action = 'IP_BLOCKED' 
          AND created_at > NOW() - INTERVAL '24 hours'
      `;
      
      const result = await pool.query(query);
      result.rows.forEach(row => {
        this.blockedIPs.add(row.ip_address);
      });
      
      console.log(`Loaded ${this.blockedIPs.size} blocked IPs`);
    } catch (error) {
      console.error('Load blocked IPs error:', error);
    }
  }

  initializeSuspiciousPatterns() {
    // SQL Injection patterns
    this.suspiciousPatterns.set('sql_injection', [
      /('|(\-\-)|(;)|(\||\|)|(\*|\*))/i,
      /(union|select|insert|delete|update|drop|create|alter|exec|execute)/i,
      /(script|javascript|vbscript|onload|onerror|onclick)/i
    ]);
    
    // XSS patterns
    this.suspiciousPatterns.set('xss', [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi
    ]);
    
    // Path traversal patterns
    this.suspiciousPatterns.set('path_traversal', [
      /\.\.[\/\\]/g,
      /\.\.%2f/gi,
      /\.\.%5c/gi
    ]);
  }

  // ============================================================================
  // AUTHENTICATION SECURITY
  // ============================================================================

  async validateLogin(username, password, metadata = {}) {
    const ipAddress = metadata.ipAddress;
    const userAgent = metadata.userAgent;
    
    try {
      // Check if IP is blocked
      if (this.isIPBlocked(ipAddress)) {
        await this.logSecurityEvent(SECURITY_EVENTS.LOGIN_BLOCKED, null, {
          reason: 'IP_BLOCKED',
          ipAddress,
          userAgent
        });
        return { success: false, reason: 'IP_BLOCKED' };
      }
      
      // Check failed login attempts
      const failedAttempts = await this.getFailedLoginAttempts(ipAddress, username);
      if (failedAttempts >= 5) {
        await this.blockIP(ipAddress, 'BRUTE_FORCE_ATTACK');
        await this.logSecurityEvent(SECURITY_EVENTS.BRUTE_FORCE_ATTACK, null, {
          ipAddress,
          userAgent,
          failedAttempts
        });
        return { success: false, reason: 'TOO_MANY_ATTEMPTS' };
      }
      
      // Get user from database
      const userQuery = 'SELECT * FROM users WHERE username = $1 OR email = $1';
      const userResult = await pool.query(userQuery, [username]);
      
      if (userResult.rows.length === 0) {
        await this.recordFailedLogin(ipAddress, username, 'USER_NOT_FOUND');
        return { success: false, reason: 'INVALID_CREDENTIALS' };
      }
      
      const user = userResult.rows[0];
      
      // Check if account is locked
      if (user.is_locked) {
        await this.logSecurityEvent(SECURITY_EVENTS.LOGIN_BLOCKED, user.id, {
          reason: 'ACCOUNT_LOCKED',
          ipAddress,
          userAgent
        });
        return { success: false, reason: 'ACCOUNT_LOCKED' };
      }
      
      // Verify password
      const passwordValid = await bcrypt.compare(password, user.password_hash);
      if (!passwordValid) {
        await this.recordFailedLogin(ipAddress, username, 'INVALID_PASSWORD');
        return { success: false, reason: 'INVALID_CREDENTIALS' };
      }
      
      // Check for suspicious login patterns
      const suspiciousActivity = await this.checkSuspiciousLogin(user.id, metadata);
      if (suspiciousActivity.isSuspicious) {
        await this.logSecurityEvent(suspiciousActivity.eventType, user.id, {
          ...metadata,
          suspiciousActivity
        });
        
        // Don't block login but flag for review
        if (suspiciousActivity.threatLevel >= THREAT_LEVELS.HIGH) {
          await this.flagUserForReview(user.id, suspiciousActivity.reason);
        }
      }
      
      // Clear failed login attempts on successful login
      await this.clearFailedLoginAttempts(ipAddress, username);
      
      // Log successful login
      await this.logSecurityEvent(SECURITY_EVENTS.LOGIN_SUCCESS, user.id, metadata);
      
      // Update last login info
      await this.updateLastLogin(user.id, metadata);
      
      return { 
        success: true, 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        suspiciousActivity
      };
      
    } catch (error) {
      console.error('Login validation error:', error);
      return { success: false, reason: 'SYSTEM_ERROR' };
    }
  }

  async checkSuspiciousLogin(userId, metadata) {
    const checks = [
      this.checkUnusualLocation(userId, metadata.ipAddress),
      this.checkMultipleDevices(userId, metadata.userAgent),
      this.checkLoginFrequency(userId),
      this.checkDeviceFingerprint(userId, metadata)
    ];
    
    const results = await Promise.all(checks);
    const suspiciousResults = results.filter(result => result.isSuspicious);
    
    if (suspiciousResults.length === 0) {
      return { isSuspicious: false };
    }
    
    // Determine overall threat level
    const maxThreatLevel = Math.max(...suspiciousResults.map(r => r.threatLevel));
    const primarySuspicion = suspiciousResults[0];
    
    return {
      isSuspicious: true,
      threatLevel: maxThreatLevel,
      eventType: primarySuspicion.eventType,
      reason: suspiciousResults.map(r => r.reason).join(', '),
      details: suspiciousResults
    };
  }

  async checkUnusualLocation(userId, ipAddress) {
    const geo = geoip.lookup(ipAddress);
    if (!geo) {
      return { isSuspicious: false };
    }
    
    // Get user's recent locations
    const query = `
      SELECT DISTINCT metadata->>'country' as country, metadata->>'city' as city
      FROM security_audit_log
      WHERE user_id = $1 
        AND event_type = 'login_success'
        AND created_at > NOW() - INTERVAL '30 days'
      LIMIT 10
    `;
    
    const result = await pool.query(query, [userId]);
    const recentLocations = result.rows;
    
    // Check if current location is known
    const isKnownLocation = recentLocations.some(loc => 
      loc.country === geo.country && loc.city === geo.city
    );
    
    if (!isKnownLocation && recentLocations.length > 0) {
      return {
        isSuspicious: true,
        threatLevel: THREAT_LEVELS.MEDIUM,
        eventType: SECURITY_EVENTS.UNUSUAL_LOCATION,
        reason: `Login from new location: ${geo.city}, ${geo.country}`,
        details: { currentLocation: geo, recentLocations }
      };
    }
    
    return { isSuspicious: false };
  }

  async checkMultipleDevices(userId, userAgent) {
    const agent = useragent.parse(userAgent);
    const deviceFingerprint = `${agent.family}_${agent.os.family}_${agent.device.family}`;
    
    // Check active sessions for this user
    const activeSessions = await redis.smembers(`user_sessions:${userId}`);
    
    if (activeSessions.length > 3) {
      return {
        isSuspicious: true,
        threatLevel: THREAT_LEVELS.MEDIUM,
        eventType: SECURITY_EVENTS.MULTIPLE_DEVICE_LOGIN,
        reason: `Multiple active sessions detected: ${activeSessions.length}`,
        details: { activeSessionCount: activeSessions.length, deviceFingerprint }
      };
    }
    
    return { isSuspicious: false };
  }

  async checkLoginFrequency(userId) {
    const query = `
      SELECT COUNT(*) as login_count
      FROM security_audit_log
      WHERE user_id = $1 
        AND event_type = 'login_success'
        AND created_at > NOW() - INTERVAL '1 hour'
    `;
    
    const result = await pool.query(query, [userId]);
    const loginCount = parseInt(result.rows[0].login_count);
    
    if (loginCount > 10) {
      return {
        isSuspicious: true,
        threatLevel: THREAT_LEVELS.HIGH,
        eventType: SECURITY_EVENTS.RAPID_REQUESTS,
        reason: `Excessive login frequency: ${loginCount} logins in 1 hour`,
        details: { loginCount, timeWindow: '1 hour' }
      };
    }
    
    return { isSuspicious: false };
  }

  async checkDeviceFingerprint(userId, metadata) {
    const fingerprint = this.generateDeviceFingerprint(metadata);
    
    // Store current fingerprint
    await redis.sadd(`user_devices:${userId}`, fingerprint);
    await redis.expire(`user_devices:${userId}`, 86400 * 30); // 30 days
    
    // Check if this is a new device
    const knownDevices = await redis.smembers(`user_devices:${userId}`);
    
    if (knownDevices.length > 5) {
      return {
        isSuspicious: true,
        threatLevel: THREAT_LEVELS.LOW,
        eventType: SECURITY_EVENTS.MULTIPLE_DEVICE_LOGIN,
        reason: `Many different devices used: ${knownDevices.length}`,
        details: { deviceCount: knownDevices.length, currentFingerprint: fingerprint }
      };
    }
    
    return { isSuspicious: false };
  }

  generateDeviceFingerprint(metadata) {
    const components = [
      metadata.userAgent || '',
      metadata.screenResolution || '',
      metadata.timezone || '',
      metadata.language || '',
      metadata.platform || ''
    ];
    
    return crypto.createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  // ============================================================================
  // GAME SECURITY AND ANTI-CHEAT
  // ============================================================================

  async validateGameMove(userId, gameId, moveData, metadata = {}) {
    try {
      // Get game state from Redis
      const gameState = await redis.hgetall(`game:${gameId}`);
      if (!gameState.id) {
        return { valid: false, reason: 'GAME_NOT_FOUND' };
      }
      
      const parsedGameState = {
        ...gameState,
        players: JSON.parse(gameState.players || '[]'),
        gameData: JSON.parse(gameState.gameData || '{}')
      };
      
      // Check if user is in the game
      if (!parsedGameState.players.includes(userId)) {
        await this.logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, userId, {
          gameId,
          reason: 'USER_NOT_IN_GAME',
          ...metadata
        });
        return { valid: false, reason: 'UNAUTHORIZED' };
      }
      
      // Check if it's user's turn
      if (parsedGameState.currentPlayer !== userId) {
        await this.logSecurityEvent(SECURITY_EVENTS.IMPOSSIBLE_MOVE, userId, {
          gameId,
          reason: 'NOT_USERS_TURN',
          currentPlayer: parsedGameState.currentPlayer,
          ...metadata
        });
        return { valid: false, reason: 'NOT_YOUR_TURN' };
      }
      
      // Validate move timing
      const timingValidation = await this.validateMoveTiming(userId, gameId, metadata.timestamp);
      if (!timingValidation.valid) {
        await this.logSecurityEvent(SECURITY_EVENTS.TIMING_ANOMALY, userId, {
          gameId,
          timingValidation,
          ...metadata
        });
        return { valid: false, reason: 'TIMING_ANOMALY' };
      }
      
      // Validate move logic (game-specific)
      const moveValidation = await this.validateMoveLogic(parsedGameState, moveData);
      if (!moveValidation.valid) {
        await this.logSecurityEvent(SECURITY_EVENTS.IMPOSSIBLE_MOVE, userId, {
          gameId,
          moveValidation,
          moveData,
          ...metadata
        });
        return { valid: false, reason: 'INVALID_MOVE' };
      }
      
      // Check for rapid moves (potential bot)
      const rapidMoveCheck = await this.checkRapidMoves(userId, gameId);
      if (rapidMoveCheck.isSuspicious) {
        await this.logSecurityEvent(SECURITY_EVENTS.RAPID_REQUESTS, userId, {
          gameId,
          rapidMoveCheck,
          ...metadata
        });
        
        // Don't block the move but flag for review
        await this.flagUserForReview(userId, 'RAPID_MOVES');
      }
      
      return { valid: true };
      
    } catch (error) {
      console.error('Game move validation error:', error);
      return { valid: false, reason: 'SYSTEM_ERROR' };
    }
  }

  async validateMoveTiming(userId, gameId, timestamp) {
    const moveTime = new Date(timestamp);
    const now = new Date();
    
    // Check if move is from the future
    if (moveTime > now) {
      return {
        valid: false,
        reason: 'FUTURE_TIMESTAMP',
        details: { moveTime, serverTime: now }
      };
    }
    
    // Check if move is too old
    const timeDiff = now - moveTime;
    if (timeDiff > 300000) { // 5 minutes
      return {
        valid: false,
        reason: 'STALE_TIMESTAMP',
        details: { timeDiff, maxAge: 300000 }
      };
    }
    
    // Get last move time for this user in this game
    const lastMoveKey = `last_move:${userId}:${gameId}`;
    const lastMoveTime = await redis.get(lastMoveKey);
    
    if (lastMoveTime) {
      const lastMove = new Date(lastMoveTime);
      const moveInterval = moveTime - lastMove;
      
      // Check for impossibly fast moves (less than 100ms)
      if (moveInterval < 100) {
        return {
          valid: false,
          reason: 'TOO_FAST',
          details: { moveInterval, minInterval: 100 }
        };
      }
    }
    
    // Update last move time
    await redis.setex(lastMoveKey, 3600, timestamp); // 1 hour expiry
    
    return { valid: true };
  }

  async validateMoveLogic(gameState, moveData) {
    // This is game-specific logic - implement based on your game rules
    // For domino game example:
    
    if (gameState.gameType === 'domino') {
      return this.validateDominoMove(gameState, moveData);
    }
    
    // Default validation
    return { valid: true };
  }

  validateDominoMove(gameState, moveData) {
    const { domino, position, side } = moveData;
    const board = gameState.gameData.board || [];
    
    // Check if domino exists in player's hand
    const currentPlayerIndex = gameState.players.indexOf(gameState.currentPlayer);
    const playerHand = gameState.gameData.hands[currentPlayerIndex] || [];
    
    const dominoExists = playerHand.some(d => 
      (d.left === domino.left && d.right === domino.right) ||
      (d.left === domino.right && d.right === domino.left)
    );
    
    if (!dominoExists) {
      return {
        valid: false,
        reason: 'DOMINO_NOT_IN_HAND',
        details: { domino, playerHand }
      };
    }
    
    // Check if move is valid on the board
    if (board.length === 0) {
      // First move is always valid
      return { valid: true };
    }
    
    const leftEnd = board[0].left;
    const rightEnd = board[board.length - 1].right;
    
    if (side === 'left') {
      if (domino.right !== leftEnd && domino.left !== leftEnd) {
        return {
          valid: false,
          reason: 'INVALID_CONNECTION',
          details: { domino, leftEnd, side }
        };
      }
    } else if (side === 'right') {
      if (domino.left !== rightEnd && domino.right !== rightEnd) {
        return {
          valid: false,
          reason: 'INVALID_CONNECTION',
          details: { domino, rightEnd, side }
        };
      }
    }
    
    return { valid: true };
  }

  async checkRapidMoves(userId, gameId) {
    const key = `move_frequency:${userId}:${gameId}`;
    const moveCount = await redis.incr(key);
    await redis.expire(key, 60); // 1 minute window
    
    if (moveCount > 20) { // More than 20 moves per minute
      return {
        isSuspicious: true,
        reason: 'EXCESSIVE_MOVE_FREQUENCY',
        moveCount,
        timeWindow: 60
      };
    }
    
    return { isSuspicious: false };
  }

  // ============================================================================
  // TRANSACTION SECURITY
  // ============================================================================

  async validateTransaction(userId, transactionData, metadata = {}) {
    try {
      // Check for duplicate transactions
      const duplicateCheck = await this.checkDuplicateTransaction(transactionData);
      if (duplicateCheck.isDuplicate) {
        await this.logSecurityEvent(SECURITY_EVENTS.DUPLICATE_TRANSACTION, userId, {
          transactionData,
          duplicateCheck,
          ...metadata
        });
        return { valid: false, reason: 'DUPLICATE_TRANSACTION' };
      }
      
      // Check transaction amount limits
      const amountCheck = await this.checkTransactionLimits(userId, transactionData);
      if (!amountCheck.valid) {
        await this.logSecurityEvent(SECURITY_EVENTS.CURRENCY_ANOMALY, userId, {
          transactionData,
          amountCheck,
          ...metadata
        });
        return { valid: false, reason: 'AMOUNT_LIMIT_EXCEEDED' };
      }
      
      // Check user's balance
      const balanceCheck = await this.checkUserBalance(userId, transactionData);
      if (!balanceCheck.valid) {
        await this.logSecurityEvent(SECURITY_EVENTS.CURRENCY_ANOMALY, userId, {
          transactionData,
          balanceCheck,
          ...metadata
        });
        return { valid: false, reason: 'INSUFFICIENT_BALANCE' };
      }
      
      // Check transaction frequency
      const frequencyCheck = await this.checkTransactionFrequency(userId);
      if (frequencyCheck.isSuspicious) {
        await this.logSecurityEvent(SECURITY_EVENTS.RAPID_REQUESTS, userId, {
          transactionData,
          frequencyCheck,
          ...metadata
        });
        
        if (frequencyCheck.threatLevel >= THREAT_LEVELS.HIGH) {
          return { valid: false, reason: 'TRANSACTION_FREQUENCY_EXCEEDED' };
        }
      }
      
      return { valid: true };
      
    } catch (error) {
      console.error('Transaction validation error:', error);
      return { valid: false, reason: 'SYSTEM_ERROR' };
    }
  }

  async checkDuplicateTransaction(transactionData) {
    const transactionHash = crypto.createHash('sha256')
      .update(JSON.stringify({
        userId: transactionData.userId,
        amount: transactionData.amount,
        type: transactionData.type,
        timestamp: Math.floor(transactionData.timestamp / 1000) // Round to second
      }))
      .digest('hex');
    
    const key = `transaction_hash:${transactionHash}`;
    const exists = await redis.exists(key);
    
    if (exists) {
      return { isDuplicate: true, hash: transactionHash };
    }
    
    // Store hash for 5 minutes to prevent duplicates
    await redis.setex(key, 300, '1');
    
    return { isDuplicate: false };
  }

  async checkTransactionLimits(userId, transactionData) {
    const { amount, type } = transactionData;
    
    // Define limits based on transaction type
    const limits = {
      'purchase': { max: 10000000, daily: 50000000 }, // 10M per transaction, 50M daily
      'transfer': { max: 5000000, daily: 20000000 },  // 5M per transaction, 20M daily
      'withdrawal': { max: 2000000, daily: 10000000 } // 2M per transaction, 10M daily
    };
    
    const limit = limits[type] || limits['transfer'];
    
    // Check single transaction limit
    if (amount > limit.max) {
      return {
        valid: false,
        reason: 'SINGLE_TRANSACTION_LIMIT',
        amount,
        limit: limit.max
      };
    }
    
    // Check daily limit
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = `daily_transactions:${userId}:${today}`;
    const dailyTotal = await redis.get(dailyKey) || 0;
    
    if (parseInt(dailyTotal) + amount > limit.daily) {
      return {
        valid: false,
        reason: 'DAILY_LIMIT_EXCEEDED',
        dailyTotal: parseInt(dailyTotal),
        amount,
        limit: limit.daily
      };
    }
    
    // Update daily total
    await redis.incrby(dailyKey, amount);
    await redis.expire(dailyKey, 86400); // 24 hours
    
    return { valid: true };
  }

  async checkUserBalance(userId, transactionData) {
    if (transactionData.type === 'purchase') {
      return { valid: true }; // Purchases add money, no balance check needed
    }
    
    const query = `
      SELECT balance 
      FROM user_balances 
      WHERE user_id = $1 AND currency_type = $2
    `;
    
    const result = await pool.query(query, [userId, transactionData.currency || 'coins']);
    
    if (result.rows.length === 0) {
      return {
        valid: false,
        reason: 'BALANCE_NOT_FOUND',
        currency: transactionData.currency
      };
    }
    
    const balance = parseInt(result.rows[0].balance);
    
    if (balance < transactionData.amount) {
      return {
        valid: false,
        reason: 'INSUFFICIENT_BALANCE',
        balance,
        required: transactionData.amount
      };
    }
    
    return { valid: true };
  }

  async checkTransactionFrequency(userId) {
    const key = `transaction_frequency:${userId}`;
    const count = await redis.incr(key);
    await redis.expire(key, 60); // 1 minute window
    
    if (count > 50) {
      return {
        isSuspicious: true,
        threatLevel: THREAT_LEVELS.CRITICAL,
        reason: 'EXCESSIVE_TRANSACTION_FREQUENCY',
        count,
        timeWindow: 60
      };
    } else if (count > 20) {
      return {
        isSuspicious: true,
        threatLevel: THREAT_LEVELS.HIGH,
        reason: 'HIGH_TRANSACTION_FREQUENCY',
        count,
        timeWindow: 60
      };
    }
    
    return { isSuspicious: false };
  }

  // ============================================================================
  // INPUT VALIDATION AND SANITIZATION
  // ============================================================================

  validateInput(input, type = 'general') {
    if (typeof input !== 'string') {
      return { valid: false, reason: 'INVALID_TYPE' };
    }
    
    // Check for suspicious patterns
    for (const [patternType, patterns] of this.suspiciousPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(input)) {
          return {
            valid: false,
            reason: 'SUSPICIOUS_PATTERN',
            patternType,
            pattern: pattern.toString()
          };
        }
      }
    }
    
    // Type-specific validation
    switch (type) {
      case 'username':
        return this.validateUsername(input);
      case 'email':
        return this.validateEmail(input);
      case 'chat_message':
        return this.validateChatMessage(input);
      default:
        return { valid: true };
    }
  }

  validateUsername(username) {
    if (username.length < 3 || username.length > 20) {
      return { valid: false, reason: 'INVALID_LENGTH' };
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return { valid: false, reason: 'INVALID_CHARACTERS' };
    }
    
    // Check for inappropriate words (implement your own filter)
    const inappropriateWords = ['admin', 'moderator', 'system', 'bot'];
    if (inappropriateWords.some(word => username.toLowerCase().includes(word))) {
      return { valid: false, reason: 'INAPPROPRIATE_CONTENT' };
    }
    
    return { valid: true };
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { valid: false, reason: 'INVALID_FORMAT' };
    }
    
    if (email.length > 254) {
      return { valid: false, reason: 'TOO_LONG' };
    }
    
    return { valid: true };
  }

  validateChatMessage(message) {
    if (message.length > 500) {
      return { valid: false, reason: 'MESSAGE_TOO_LONG' };
    }
    
    // Check for spam patterns
    const spamPatterns = [
      /(..)\1{4,}/g, // Repeated characters
      /[A-Z]{10,}/g, // Excessive caps
      /(.)\1{10,}/g  // Single character repeated
    ];
    
    for (const pattern of spamPatterns) {
      if (pattern.test(message)) {
        return { valid: false, reason: 'SPAM_PATTERN' };
      }
    }
    
    return { valid: true };
  }

  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    return input
      .replace(/[<>"'&]/g, (char) => {
        const entities = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return entities[char];
      })
      .trim();
  }

  // ============================================================================
  // SECURITY LOGGING AND MONITORING
  // ============================================================================

  async logSecurityEvent(eventType, userId, details = {}) {
    try {
      const eventId = uuidv4();
      const timestamp = new Date();
      
      const query = `
        INSERT INTO security_audit_log (
          id, event_type, user_id, ip_address, user_agent,
          details, threat_level, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      
      const threatLevel = this.getThreatLevel(eventType);
      
      await pool.query(query, [
        eventId,
        eventType,
        userId,
        details.ipAddress,
        details.userAgent,
        JSON.stringify(details),
        threatLevel,
        timestamp
      ]);
      
      // Also log to Redis for real-time monitoring
      await redis.lpush('security_events', JSON.stringify({
        id: eventId,
        eventType,
        userId,
        timestamp,
        threatLevel,
        details
      }));
      
      await redis.ltrim('security_events', 0, 999); // Keep last 1000 events
      
      // Trigger alerts for high-threat events
      if (threatLevel >= THREAT_LEVELS.HIGH) {
        await this.triggerSecurityAlert(eventType, userId, details);
      }
      
    } catch (error) {
      console.error('Security event logging error:', error);
    }
  }

  getThreatLevel(eventType) {
    const threatLevels = {
      [SECURITY_EVENTS.LOGIN_SUCCESS]: THREAT_LEVELS.LOW,
      [SECURITY_EVENTS.LOGIN_FAILED]: THREAT_LEVELS.LOW,
      [SECURITY_EVENTS.LOGIN_BLOCKED]: THREAT_LEVELS.MEDIUM,
      [SECURITY_EVENTS.BRUTE_FORCE_ATTACK]: THREAT_LEVELS.HIGH,
      [SECURITY_EVENTS.UNUSUAL_LOCATION]: THREAT_LEVELS.MEDIUM,
      [SECURITY_EVENTS.MULTIPLE_DEVICE_LOGIN]: THREAT_LEVELS.MEDIUM,
      [SECURITY_EVENTS.IMPOSSIBLE_MOVE]: THREAT_LEVELS.HIGH,
      [SECURITY_EVENTS.SCORE_MANIPULATION]: THREAT_LEVELS.CRITICAL,
      [SECURITY_EVENTS.CURRENCY_ANOMALY]: THREAT_LEVELS.HIGH,
      [SECURITY_EVENTS.SQL_INJECTION_ATTEMPT]: THREAT_LEVELS.CRITICAL,
      [SECURITY_EVENTS.XSS_ATTEMPT]: THREAT_LEVELS.HIGH,
      [SECURITY_EVENTS.DATA_BREACH_ATTEMPT]: THREAT_LEVELS.CRITICAL
    };
    
    return threatLevels[eventType] || THREAT_LEVELS.MEDIUM;
  }

  async triggerSecurityAlert(eventType, userId, details) {
    const alert = {
      id: uuidv4(),
      eventType,
      userId,
      details,
      timestamp: new Date(),
      status: 'active'
    };
    
    // Store alert in Redis
    await redis.lpush('security_alerts', JSON.stringify(alert));
    await redis.ltrim('security_alerts', 0, 99); // Keep last 100 alerts
    
    // Publish to alert channel for real-time notifications
    await redis.publish('security_alerts', JSON.stringify(alert));
    
    console.log(`SECURITY ALERT: ${eventType} for user ${userId}`);
  }

  // ============================================================================
  // IP AND USER MANAGEMENT
  // ============================================================================

  async blockIP(ipAddress, reason, duration = 86400) {
    this.blockedIPs.add(ipAddress);
    
    // Store in Redis with expiration
    await redis.setex(`blocked_ip:${ipAddress}`, duration, reason);
    
    // Log the block
    await this.logSecurityEvent('IP_BLOCKED', null, {
      ipAddress,
      reason,
      duration
    });
    
    console.log(`Blocked IP ${ipAddress} for ${reason}`);
  }

  async unblockIP(ipAddress) {
    this.blockedIPs.delete(ipAddress);
    await redis.del(`blocked_ip:${ipAddress}`);
    
    await this.logSecurityEvent('IP_UNBLOCKED', null, { ipAddress });
    console.log(`Unblocked IP ${ipAddress}`);
  }

  isIPBlocked(ipAddress) {
    return this.blockedIPs.has(ipAddress);
  }

  async flagUserForReview(userId, reason) {
    const query = `
      INSERT INTO user_moderation_actions (
        id, user_id, action_type, reason, admin_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await pool.query(query, [
      uuidv4(),
      userId,
      'FLAGGED_FOR_REVIEW',
      reason,
      'system', // System-generated flag
      new Date()
    ]);
    
    // Add to review queue
    await redis.lpush('user_review_queue', JSON.stringify({
      userId,
      reason,
      timestamp: new Date(),
      priority: this.getReviewPriority(reason)
    }));
  }

  getReviewPriority(reason) {
    const priorities = {
      'RAPID_MOVES': 2,
      'CURRENCY_ANOMALY': 3,
      'SCORE_MANIPULATION': 4,
      'MULTIPLE_VIOLATIONS': 5
    };
    
    return priorities[reason] || 1;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async getFailedLoginAttempts(ipAddress, username) {
    const ipKey = `failed_logins:ip:${ipAddress}`;
    const userKey = `failed_logins:user:${username}`;
    
    const [ipAttempts, userAttempts] = await Promise.all([
      redis.get(ipKey),
      redis.get(userKey)
    ]);
    
    return Math.max(parseInt(ipAttempts || 0), parseInt(userAttempts || 0));
  }

  async recordFailedLogin(ipAddress, username, reason) {
    const ipKey = `failed_logins:ip:${ipAddress}`;
    const userKey = `failed_logins:user:${username}`;
    
    await Promise.all([
      redis.incr(ipKey),
      redis.incr(userKey),
      redis.expire(ipKey, 3600), // 1 hour
      redis.expire(userKey, 3600)
    ]);
    
    await this.logSecurityEvent(SECURITY_EVENTS.LOGIN_FAILED, null, {
      ipAddress,
      username,
      reason
    });
  }

  async clearFailedLoginAttempts(ipAddress, username) {
    const ipKey = `failed_logins:ip:${ipAddress}`;
    const userKey = `failed_logins:user:${username}`;
    
    await Promise.all([
      redis.del(ipKey),
      redis.del(userKey)
    ]);
  }

  async updateLastLogin(userId, metadata) {
    const query = `
      UPDATE users 
      SET 
        last_login_at = $1,
        last_login_ip = $2,
        last_login_user_agent = $3
      WHERE id = $4
    `;
    
    await pool.query(query, [
      new Date(),
      metadata.ipAddress,
      metadata.userAgent,
      userId
    ]);
  }

  // ============================================================================
  // CLEANUP METHODS
  // ============================================================================

  async cleanupSecurityLogs(daysToKeep = 30) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const query = 'DELETE FROM security_audit_log WHERE created_at < $1';
    const result = await pool.query(query, [cutoffDate]);
    
    console.log(`Cleaned up ${result.rowCount} old security log entries`);
    return result.rowCount;
  }
}

module.exports = {
  SecurityService,
  SECURITY_EVENTS,
  THREAT_LEVELS
};