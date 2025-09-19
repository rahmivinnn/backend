// ============================================================================
// CACHE AND PERFORMANCE OPTIMIZATION SERVICE
// ============================================================================

const Redis = require('ioredis');
const { Pool } = require('pg');
const LRU = require('lru-cache');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');

// Initialize Redis Cluster for high availability
const redisCluster = new Redis.Cluster([
  {
    host: process.env.REDIS_HOST_1 || 'localhost',
    port: process.env.REDIS_PORT_1 || 6379
  },
  {
    host: process.env.REDIS_HOST_2 || 'localhost',
    port: process.env.REDIS_PORT_2 || 6380
  },
  {
    host: process.env.REDIS_HOST_3 || 'localhost',
    port: process.env.REDIS_PORT_3 || 6381
  }
], {
  redisOptions: {
    password: process.env.REDIS_PASSWORD,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  },
  enableOfflineQueue: false,
  retryDelayOnClusterDown: 300,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  scaleReads: 'slave'
});

// Fallback single Redis instance
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true
});

// PostgreSQL connection pool
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
// CACHE CONFIGURATION
// ============================================================================

const CACHE_KEYS = {
  // User data
  USER_PROFILE: 'user:profile',
  USER_STATS: 'user:stats',
  USER_BALANCE: 'user:balance',
  USER_ACHIEVEMENTS: 'user:achievements',
  USER_FRIENDS: 'user:friends',
  USER_SESSIONS: 'user:sessions',
  
  // Game data
  GAME_ROOM: 'game:room',
  GAME_STATE: 'game:state',
  GAME_HISTORY: 'game:history',
  ACTIVE_GAMES: 'games:active',
  MATCHMAKING_QUEUE: 'matchmaking:queue',
  
  // Leaderboards
  LEADERBOARD_GLOBAL: 'leaderboard:global',
  LEADERBOARD_WEEKLY: 'leaderboard:weekly',
  LEADERBOARD_MONTHLY: 'leaderboard:monthly',
  LEADERBOARD_CLAN: 'leaderboard:clan',
  
  // Social
  CHAT_MESSAGES: 'chat:messages',
  CLAN_INFO: 'clan:info',
  CLAN_MEMBERS: 'clan:members',
  FRIEND_REQUESTS: 'social:friend_requests',
  
  // System
  SYSTEM_CONFIG: 'system:config',
  RATE_LIMITS: 'rate:limit',
  ANALYTICS: 'analytics',
  NOTIFICATIONS: 'notifications'
};

const CACHE_TTL = {
  SHORT: 300,      // 5 minutes
  MEDIUM: 1800,    // 30 minutes
  LONG: 3600,      // 1 hour
  VERY_LONG: 86400, // 24 hours
  PERMANENT: -1     // No expiration
};

// ============================================================================
// CACHE SERVICE CLASS
// ============================================================================

class CacheService {
  constructor() {
    this.isInitialized = false;
    this.useCluster = process.env.REDIS_CLUSTER_ENABLED === 'true';
    this.redisClient = this.useCluster ? redisCluster : redis;
    
    // Local LRU cache for frequently accessed small data
    this.localCache = new LRU({
      max: 10000,
      ttl: 1000 * 60 * 5 // 5 minutes
    });
    
    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    
    this.init();
  }

  async init() {
    try {
      // Test Redis connection
      await this.redisClient.ping();
      console.log(`Cache service connected to Redis ${this.useCluster ? 'cluster' : 'instance'}`);
      
      // Test PostgreSQL connection
      await pool.query('SELECT 1');
      console.log('Cache service database connected');
      
      // Setup Redis event listeners
      this.setupRedisEventListeners();
      
      // Initialize cache warming
      await this.warmupCache();
      
      this.isInitialized = true;
      console.log('Cache service initialized successfully');
    } catch (error) {
      console.error('Cache service initialization error:', error);
      // Fallback to local cache only
      this.isInitialized = true;
    }
  }

  setupRedisEventListeners() {
    this.redisClient.on('error', (error) => {
      console.error('Redis error:', error);
      this.stats.errors++;
    });
    
    this.redisClient.on('connect', () => {
      console.log('Redis connected');
    });
    
    this.redisClient.on('ready', () => {
      console.log('Redis ready');
    });
    
    this.redisClient.on('close', () => {
      console.log('Redis connection closed');
    });
  }

  async warmupCache() {
    try {
      console.log('Starting cache warmup...');
      
      // Warm up system configuration
      await this.warmupSystemConfig();
      
      // Warm up leaderboards
      await this.warmupLeaderboards();
      
      // Warm up active games
      await this.warmupActiveGames();
      
      console.log('Cache warmup completed');
    } catch (error) {
      console.error('Cache warmup error:', error);
    }
  }

  async warmupSystemConfig() {
    const config = await this.getSystemConfig();
    if (config) {
      await this.set(CACHE_KEYS.SYSTEM_CONFIG, config, CACHE_TTL.VERY_LONG);
    }
  }

  async warmupLeaderboards() {
    const leaderboards = [
      { key: CACHE_KEYS.LEADERBOARD_GLOBAL, type: 'global' },
      { key: CACHE_KEYS.LEADERBOARD_WEEKLY, type: 'weekly' },
      { key: CACHE_KEYS.LEADERBOARD_MONTHLY, type: 'monthly' }
    ];
    
    for (const lb of leaderboards) {
      const data = await this.getLeaderboardFromDB(lb.type);
      if (data) {
        await this.set(lb.key, data, CACHE_TTL.MEDIUM);
      }
    }
  }

  async warmupActiveGames() {
    const activeGames = await this.getActiveGamesFromDB();
    if (activeGames) {
      await this.set(CACHE_KEYS.ACTIVE_GAMES, activeGames, CACHE_TTL.SHORT);
    }
  }

  // ============================================================================
  // CORE CACHE OPERATIONS
  // ============================================================================

  async get(key, useLocal = true) {
    try {
      // Try local cache first for small, frequently accessed data
      if (useLocal && this.localCache.has(key)) {
        this.stats.hits++;
        return this.localCache.get(key);
      }
      
      // Try Redis cache
      const value = await this.redisClient.get(key);
      
      if (value !== null) {
        this.stats.hits++;
        const parsed = JSON.parse(value);
        
        // Store in local cache if small enough
        if (useLocal && JSON.stringify(parsed).length < 10000) {
          this.localCache.set(key, parsed);
        }
        
        return parsed;
      }
      
      this.stats.misses++;
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      this.stats.errors++;
      return null;
    }
  }

  async set(key, value, ttl = CACHE_TTL.MEDIUM, useLocal = true) {
    try {
      const serialized = JSON.stringify(value);
      
      // Set in Redis
      if (ttl === CACHE_TTL.PERMANENT) {
        await this.redisClient.set(key, serialized);
      } else {
        await this.redisClient.setex(key, ttl, serialized);
      }
      
      // Set in local cache if small enough
      if (useLocal && serialized.length < 10000) {
        this.localCache.set(key, value);
      }
      
      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async del(key, useLocal = true) {
    try {
      // Delete from Redis
      await this.redisClient.del(key);
      
      // Delete from local cache
      if (useLocal) {
        this.localCache.delete(key);
      }
      
      this.stats.deletes++;
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async exists(key) {
    try {
      if (this.localCache.has(key)) {
        return true;
      }
      
      const exists = await this.redisClient.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  async expire(key, ttl) {
    try {
      await this.redisClient.expire(key, ttl);
      return true;
    } catch (error) {
      console.error('Cache expire error:', error);
      return false;
    }
  }

  async ttl(key) {
    try {
      return await this.redisClient.ttl(key);
    } catch (error) {
      console.error('Cache TTL error:', error);
      return -1;
    }
  }

  // ============================================================================
  // ADVANCED CACHE OPERATIONS
  // ============================================================================

  async mget(keys) {
    try {
      const values = await this.redisClient.mget(keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs, ttl = CACHE_TTL.MEDIUM) {
    try {
      const pipeline = this.redisClient.pipeline();
      
      for (const [key, value] of keyValuePairs) {
        const serialized = JSON.stringify(value);
        if (ttl === CACHE_TTL.PERMANENT) {
          pipeline.set(key, serialized);
        } else {
          pipeline.setex(key, ttl, serialized);
        }
      }
      
      await pipeline.exec();
      this.stats.sets += keyValuePairs.length;
      return true;
    } catch (error) {
      console.error('Cache mset error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async increment(key, amount = 1, ttl = CACHE_TTL.MEDIUM) {
    try {
      const value = await this.redisClient.incrby(key, amount);
      
      if (ttl > 0) {
        await this.redisClient.expire(key, ttl);
      }
      
      return value;
    } catch (error) {
      console.error('Cache increment error:', error);
      return null;
    }
  }

  async decrement(key, amount = 1) {
    try {
      return await this.redisClient.decrby(key, amount);
    } catch (error) {
      console.error('Cache decrement error:', error);
      return null;
    }
  }

  // ============================================================================
  // LIST OPERATIONS
  // ============================================================================

  async lpush(key, value, maxLength = 1000) {
    try {
      const serialized = JSON.stringify(value);
      await this.redisClient.lpush(key, serialized);
      
      // Trim list to max length
      if (maxLength > 0) {
        await this.redisClient.ltrim(key, 0, maxLength - 1);
      }
      
      return true;
    } catch (error) {
      console.error('Cache lpush error:', error);
      return false;
    }
  }

  async rpush(key, value, maxLength = 1000) {
    try {
      const serialized = JSON.stringify(value);
      await this.redisClient.rpush(key, serialized);
      
      // Trim list to max length
      if (maxLength > 0) {
        await this.redisClient.ltrim(key, -maxLength, -1);
      }
      
      return true;
    } catch (error) {
      console.error('Cache rpush error:', error);
      return false;
    }
  }

  async lrange(key, start = 0, end = -1) {
    try {
      const values = await this.redisClient.lrange(key, start, end);
      return values.map(value => JSON.parse(value));
    } catch (error) {
      console.error('Cache lrange error:', error);
      return [];
    }
  }

  async llen(key) {
    try {
      return await this.redisClient.llen(key);
    } catch (error) {
      console.error('Cache llen error:', error);
      return 0;
    }
  }

  // ============================================================================
  // SET OPERATIONS
  // ============================================================================

  async sadd(key, value) {
    try {
      const serialized = JSON.stringify(value);
      return await this.redisClient.sadd(key, serialized);
    } catch (error) {
      console.error('Cache sadd error:', error);
      return 0;
    }
  }

  async srem(key, value) {
    try {
      const serialized = JSON.stringify(value);
      return await this.redisClient.srem(key, serialized);
    } catch (error) {
      console.error('Cache srem error:', error);
      return 0;
    }
  }

  async smembers(key) {
    try {
      const values = await this.redisClient.smembers(key);
      return values.map(value => JSON.parse(value));
    } catch (error) {
      console.error('Cache smembers error:', error);
      return [];
    }
  }

  async sismember(key, value) {
    try {
      const serialized = JSON.stringify(value);
      const result = await this.redisClient.sismember(key, serialized);
      return result === 1;
    } catch (error) {
      console.error('Cache sismember error:', error);
      return false;
    }
  }

  // ============================================================================
  // SORTED SET OPERATIONS (for leaderboards)
  // ============================================================================

  async zadd(key, score, member) {
    try {
      const serialized = JSON.stringify(member);
      return await this.redisClient.zadd(key, score, serialized);
    } catch (error) {
      console.error('Cache zadd error:', error);
      return 0;
    }
  }

  async zrem(key, member) {
    try {
      const serialized = JSON.stringify(member);
      return await this.redisClient.zrem(key, serialized);
    } catch (error) {
      console.error('Cache zrem error:', error);
      return 0;
    }
  }

  async zrange(key, start = 0, end = -1, withScores = false) {
    try {
      let values;
      if (withScores) {
        values = await this.redisClient.zrange(key, start, end, 'WITHSCORES');
        const result = [];
        for (let i = 0; i < values.length; i += 2) {
          result.push({
            member: JSON.parse(values[i]),
            score: parseFloat(values[i + 1])
          });
        }
        return result;
      } else {
        values = await this.redisClient.zrange(key, start, end);
        return values.map(value => JSON.parse(value));
      }
    } catch (error) {
      console.error('Cache zrange error:', error);
      return [];
    }
  }

  async zrevrange(key, start = 0, end = -1, withScores = false) {
    try {
      let values;
      if (withScores) {
        values = await this.redisClient.zrevrange(key, start, end, 'WITHSCORES');
        const result = [];
        for (let i = 0; i < values.length; i += 2) {
          result.push({
            member: JSON.parse(values[i]),
            score: parseFloat(values[i + 1])
          });
        }
        return result;
      } else {
        values = await this.redisClient.zrevrange(key, start, end);
        return values.map(value => JSON.parse(value));
      }
    } catch (error) {
      console.error('Cache zrevrange error:', error);
      return [];
    }
  }

  async zrank(key, member) {
    try {
      const serialized = JSON.stringify(member);
      return await this.redisClient.zrank(key, serialized);
    } catch (error) {
      console.error('Cache zrank error:', error);
      return null;
    }
  }

  async zscore(key, member) {
    try {
      const serialized = JSON.stringify(member);
      const score = await this.redisClient.zscore(key, serialized);
      return score ? parseFloat(score) : null;
    } catch (error) {
      console.error('Cache zscore error:', error);
      return null;
    }
  }

  // ============================================================================
  // HASH OPERATIONS
  // ============================================================================

  async hset(key, field, value) {
    try {
      const serialized = JSON.stringify(value);
      return await this.redisClient.hset(key, field, serialized);
    } catch (error) {
      console.error('Cache hset error:', error);
      return 0;
    }
  }

  async hget(key, field) {
    try {
      const value = await this.redisClient.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache hget error:', error);
      return null;
    }
  }

  async hgetall(key) {
    try {
      const hash = await this.redisClient.hgetall(key);
      const result = {};
      
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value; // Keep as string if not JSON
        }
      }
      
      return result;
    } catch (error) {
      console.error('Cache hgetall error:', error);
      return {};
    }
  }

  async hdel(key, field) {
    try {
      return await this.redisClient.hdel(key, field);
    } catch (error) {
      console.error('Cache hdel error:', error);
      return 0;
    }
  }

  async hexists(key, field) {
    try {
      const result = await this.redisClient.hexists(key, field);
      return result === 1;
    } catch (error) {
      console.error('Cache hexists error:', error);
      return false;
    }
  }

  // ============================================================================
  // PUB/SUB OPERATIONS
  // ============================================================================

  async publish(channel, message) {
    try {
      const serialized = JSON.stringify(message);
      return await this.redisClient.publish(channel, serialized);
    } catch (error) {
      console.error('Cache publish error:', error);
      return 0;
    }
  }

  async subscribe(channel, callback) {
    try {
      const subscriber = this.redisClient.duplicate();
      
      subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsed = JSON.parse(message);
            callback(parsed);
          } catch (error) {
            console.error('Message parse error:', error);
            callback(message);
          }
        }
      });
      
      await subscriber.subscribe(channel);
      return subscriber;
    } catch (error) {
      console.error('Cache subscribe error:', error);
      return null;
    }
  }

  // ============================================================================
  // HIGH-LEVEL CACHE METHODS
  // ============================================================================

  async getUserProfile(userId) {
    const key = `${CACHE_KEYS.USER_PROFILE}:${userId}`;
    let profile = await this.get(key);
    
    if (!profile) {
      profile = await this.getUserProfileFromDB(userId);
      if (profile) {
        await this.set(key, profile, CACHE_TTL.MEDIUM);
      }
    }
    
    return profile;
  }

  async setUserProfile(userId, profile) {
    const key = `${CACHE_KEYS.USER_PROFILE}:${userId}`;
    await this.set(key, profile, CACHE_TTL.MEDIUM);
    
    // Also update in database
    await this.updateUserProfileInDB(userId, profile);
  }

  async getUserBalance(userId) {
    const key = `${CACHE_KEYS.USER_BALANCE}:${userId}`;
    let balance = await this.get(key);
    
    if (!balance) {
      balance = await this.getUserBalanceFromDB(userId);
      if (balance) {
        await this.set(key, balance, CACHE_TTL.SHORT);
      }
    }
    
    return balance;
  }

  async updateUserBalance(userId, currency, amount) {
    const key = `${CACHE_KEYS.USER_BALANCE}:${userId}`;
    
    // Update in database first
    const newBalance = await this.updateUserBalanceInDB(userId, currency, amount);
    
    if (newBalance) {
      // Update cache
      await this.set(key, newBalance, CACHE_TTL.SHORT);
    }
    
    return newBalance;
  }

  async getGameRoom(roomId) {
    const key = `${CACHE_KEYS.GAME_ROOM}:${roomId}`;
    return await this.get(key);
  }

  async setGameRoom(roomId, roomData) {
    const key = `${CACHE_KEYS.GAME_ROOM}:${roomId}`;
    await this.set(key, roomData, CACHE_TTL.SHORT);
  }

  async deleteGameRoom(roomId) {
    const key = `${CACHE_KEYS.GAME_ROOM}:${roomId}`;
    await this.del(key);
  }

  async getLeaderboard(type = 'global', limit = 100) {
    const key = `${CACHE_KEYS.LEADERBOARD_GLOBAL}:${type}`;
    let leaderboard = await this.get(key);
    
    if (!leaderboard) {
      leaderboard = await this.getLeaderboardFromDB(type, limit);
      if (leaderboard) {
        await this.set(key, leaderboard, CACHE_TTL.MEDIUM);
      }
    }
    
    return leaderboard;
  }

  async updateLeaderboard(type, userId, score) {
    const key = `leaderboard:${type}`;
    await this.zadd(key, score, { userId, score, timestamp: Date.now() });
    
    // Keep only top 1000 entries
    const count = await this.redisClient.zcard(key);
    if (count > 1000) {
      await this.redisClient.zremrangebyrank(key, 0, count - 1001);
    }
    
    // Invalidate cached leaderboard
    await this.del(`${CACHE_KEYS.LEADERBOARD_GLOBAL}:${type}`);
  }

  async getChatMessages(channelId, limit = 50) {
    const key = `${CACHE_KEYS.CHAT_MESSAGES}:${channelId}`;
    return await this.lrange(key, 0, limit - 1);
  }

  async addChatMessage(channelId, message) {
    const key = `${CACHE_KEYS.CHAT_MESSAGES}:${channelId}`;
    await this.lpush(key, {
      ...message,
      timestamp: Date.now()
    }, 100); // Keep last 100 messages
  }

  // ============================================================================
  // DATABASE INTEGRATION METHODS
  // ============================================================================

  async getUserProfileFromDB(userId) {
    try {
      const query = `
        SELECT u.*, us.total_games, us.wins, us.losses, us.win_rate,
               us.total_score, us.average_score, us.longest_streak
        FROM users u
        LEFT JOIN user_stats us ON u.id = us.user_id
        WHERE u.id = $1
      `;
      
      const result = await pool.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Get user profile from DB error:', error);
      return null;
    }
  }

  async updateUserProfileInDB(userId, profile) {
    try {
      const query = `
        UPDATE users 
        SET username = $2, email = $3, display_name = $4, 
            avatar_url = $5, updated_at = NOW()
        WHERE id = $1
      `;
      
      await pool.query(query, [
        userId,
        profile.username,
        profile.email,
        profile.display_name,
        profile.avatar_url
      ]);
      
      return true;
    } catch (error) {
      console.error('Update user profile in DB error:', error);
      return false;
    }
  }

  async getUserBalanceFromDB(userId) {
    try {
      const query = `
        SELECT currency_type, balance
        FROM user_balances
        WHERE user_id = $1
      `;
      
      const result = await pool.query(query, [userId]);
      const balances = {};
      
      result.rows.forEach(row => {
        balances[row.currency_type] = parseInt(row.balance);
      });
      
      return balances;
    } catch (error) {
      console.error('Get user balance from DB error:', error);
      return null;
    }
  }

  async updateUserBalanceInDB(userId, currency, amount) {
    try {
      const query = `
        UPDATE user_balances 
        SET balance = balance + $3, updated_at = NOW()
        WHERE user_id = $1 AND currency_type = $2
        RETURNING balance
      `;
      
      const result = await pool.query(query, [userId, currency, amount]);
      
      if (result.rows.length > 0) {
        // Return updated balances
        return await this.getUserBalanceFromDB(userId);
      }
      
      return null;
    } catch (error) {
      console.error('Update user balance in DB error:', error);
      return null;
    }
  }

  async getLeaderboardFromDB(type, limit = 100) {
    try {
      let query;
      let params = [limit];
      
      switch (type) {
        case 'weekly':
          query = `
            SELECT u.id, u.username, u.display_name, u.avatar_url,
                   ur.score, ur.rank, ur.updated_at
            FROM user_rankings ur
            JOIN users u ON ur.user_id = u.id
            JOIN leaderboard_seasons ls ON ur.season_id = ls.id
            WHERE ls.is_active = true
              AND ur.category_id = (SELECT id FROM leaderboard_categories WHERE name = 'weekly')
            ORDER BY ur.rank ASC
            LIMIT $1
          `;
          break;
        case 'monthly':
          query = `
            SELECT u.id, u.username, u.display_name, u.avatar_url,
                   ur.score, ur.rank, ur.updated_at
            FROM user_rankings ur
            JOIN users u ON ur.user_id = u.id
            JOIN leaderboard_seasons ls ON ur.season_id = ls.id
            WHERE ls.is_active = true
              AND ur.category_id = (SELECT id FROM leaderboard_categories WHERE name = 'monthly')
            ORDER BY ur.rank ASC
            LIMIT $1
          `;
          break;
        default: // global
          query = `
            SELECT u.id, u.username, u.display_name, u.avatar_url,
                   us.total_score as score, us.wins, us.total_games
            FROM users u
            JOIN user_stats us ON u.id = us.user_id
            WHERE us.total_games > 0
            ORDER BY us.total_score DESC
            LIMIT $1
          `;
      }
      
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Get leaderboard from DB error:', error);
      return null;
    }
  }

  async getActiveGamesFromDB() {
    try {
      const query = `
        SELECT gr.id, gr.room_name, gr.game_type, gr.max_players,
               gr.current_players, gr.status, gr.created_at,
               array_agg(u.username) as player_names
        FROM game_rooms gr
        LEFT JOIN room_players rp ON gr.id = rp.room_id
        LEFT JOIN users u ON rp.user_id = u.id
        WHERE gr.status IN ('waiting', 'playing')
        GROUP BY gr.id, gr.room_name, gr.game_type, gr.max_players,
                 gr.current_players, gr.status, gr.created_at
        ORDER BY gr.created_at DESC
        LIMIT 100
      `;
      
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Get active games from DB error:', error);
      return null;
    }
  }

  async getSystemConfig() {
    try {
      // This would typically come from a system_config table
      // For now, return default configuration
      return {
        maintenance_mode: false,
        max_concurrent_games: 10000,
        max_players_per_room: 4,
        default_currency_bonus: 1000,
        daily_reward_amount: 500,
        max_friend_requests: 50,
        chat_message_limit: 100,
        rate_limit_requests_per_minute: 60,
        version: '1.0.0',
        features: {
          tournaments: true,
          clans: true,
          chat: true,
          leaderboards: true,
          achievements: true
        }
      };
    } catch (error) {
      console.error('Get system config error:', error);
      return null;
    }
  }

  // ============================================================================
  // CACHE MANAGEMENT AND MONITORING
  // ============================================================================

  async getStats() {
    const redisInfo = await this.redisClient.info('memory');
    const memoryUsage = this.parseRedisMemoryInfo(redisInfo);
    
    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      localCacheSize: this.localCache.size,
      localCacheMax: this.localCache.max,
      redisMemory: memoryUsage,
      isCluster: this.useCluster
    };
  }

  parseRedisMemoryInfo(info) {
    const lines = info.split('\r\n');
    const memory = {};
    
    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (key.includes('memory')) {
          memory[key] = value;
        }
      }
    });
    
    return memory;
  }

  async clearCache(pattern = '*') {
    try {
      const keys = await this.redisClient.keys(pattern);
      
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
      
      // Clear local cache
      this.localCache.clear();
      
      console.log(`Cleared ${keys.length} cache entries`);
      return keys.length;
    } catch (error) {
      console.error('Clear cache error:', error);
      return 0;
    }
  }

  async warmCache(keys) {
    const results = [];
    
    for (const key of keys) {
      try {
        const value = await this.get(key);
        results.push({ key, cached: value !== null });
      } catch (error) {
        results.push({ key, cached: false, error: error.message });
      }
    }
    
    return results;
  }

  async invalidateUserCache(userId) {
    const patterns = [
      `${CACHE_KEYS.USER_PROFILE}:${userId}`,
      `${CACHE_KEYS.USER_STATS}:${userId}`,
      `${CACHE_KEYS.USER_BALANCE}:${userId}`,
      `${CACHE_KEYS.USER_ACHIEVEMENTS}:${userId}`,
      `${CACHE_KEYS.USER_FRIENDS}:${userId}`,
      `${CACHE_KEYS.USER_SESSIONS}:${userId}`
    ];
    
    for (const pattern of patterns) {
      await this.del(pattern);
    }
  }

  async invalidateGameCache(gameId) {
    const patterns = [
      `${CACHE_KEYS.GAME_ROOM}:${gameId}`,
      `${CACHE_KEYS.GAME_STATE}:${gameId}`,
      `${CACHE_KEYS.GAME_HISTORY}:${gameId}`
    ];
    
    for (const pattern of patterns) {
      await this.del(pattern);
    }
  }

  // ============================================================================
  // CLEANUP AND MAINTENANCE
  // ============================================================================

  async cleanup() {
    try {
      // Clean up expired local cache entries
      this.localCache.purgeStale();
      
      // Log cache statistics
      const stats = await this.getStats();
      console.log('Cache statistics:', stats);
      
      // Store cache statistics in database for monitoring
      await this.storeCacheStatistics(stats);
      
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }

  async storeCacheStatistics(stats) {
    try {
      const query = `
        INSERT INTO cache_statistics (
          id, hits, misses, sets, deletes, errors, hit_rate,
          local_cache_size, redis_memory_used, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;
      
      await pool.query(query, [
        uuidv4(),
        stats.hits,
        stats.misses,
        stats.sets,
        stats.deletes,
        stats.errors,
        stats.hitRate,
        stats.localCacheSize,
        stats.redisMemory.used_memory || 0,
        new Date()
      ]);
    } catch (error) {
      console.error('Store cache statistics error:', error);
    }
  }

  async close() {
    try {
      await this.redisClient.quit();
      console.log('Cache service closed');
    } catch (error) {
      console.error('Cache service close error:', error);
    }
  }
}

module.exports = {
  CacheService,
  CACHE_KEYS,
  CACHE_TTL
};