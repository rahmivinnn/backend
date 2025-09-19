// ============================================================================
// ANALYTICS AND REPORTING SERVICE
// ============================================================================

const { Pool } = require('pg');
const Redis = require('ioredis');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

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
// ANALYTICS EVENT TYPES
// ============================================================================

const ANALYTICS_EVENTS = {
  // User Events
  USER_REGISTER: 'user_register',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  USER_PROFILE_UPDATE: 'user_profile_update',
  USER_LEVEL_UP: 'user_level_up',
  
  // Game Events
  GAME_START: 'game_start',
  GAME_END: 'game_end',
  GAME_MOVE: 'game_move',
  GAME_ABANDON: 'game_abandon',
  GAME_RECONNECT: 'game_reconnect',
  
  // Economy Events
  PURCHASE_INITIATED: 'purchase_initiated',
  PURCHASE_COMPLETED: 'purchase_completed',
  PURCHASE_FAILED: 'purchase_failed',
  CURRENCY_EARNED: 'currency_earned',
  CURRENCY_SPENT: 'currency_spent',
  GIFT_SENT: 'gift_sent',
  GIFT_RECEIVED: 'gift_received',
  
  // Social Events
  FRIEND_REQUEST_SENT: 'friend_request_sent',
  FRIEND_REQUEST_ACCEPTED: 'friend_request_accepted',
  CLAN_JOINED: 'clan_joined',
  CLAN_LEFT: 'clan_left',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  
  // Engagement Events
  DAILY_REWARD_CLAIMED: 'daily_reward_claimed',
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
  TOURNAMENT_JOINED: 'tournament_joined',
  LUCKY_WHEEL_SPIN: 'lucky_wheel_spin',
  
  // Technical Events
  APP_CRASH: 'app_crash',
  CONNECTION_ERROR: 'connection_error',
  PERFORMANCE_ISSUE: 'performance_issue',
  FEATURE_USED: 'feature_used'
};

// ============================================================================
// ANALYTICS SERVICE CLASS
// ============================================================================

class AnalyticsService {
  constructor() {
    this.isInitialized = false;
    this.eventQueue = [];
    this.processingQueue = false;
    this.init();
  }

  async init() {
    try {
      // Test database connection
      await pool.query('SELECT 1');
      console.log('Analytics service database connected');
      
      // Test Redis connection
      await redis.ping();
      console.log('Analytics service Redis connected');
      
      // Start event processing
      this.startEventProcessor();
      
      this.isInitialized = true;
      console.log('Analytics service initialized successfully');
    } catch (error) {
      console.error('Analytics service initialization error:', error);
    }
  }

  // ============================================================================
  // EVENT TRACKING
  // ============================================================================

  async trackEvent(eventType, userId, data = {}, metadata = {}) {
    try {
      const event = {
        id: uuidv4(),
        eventType,
        userId,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
          platform: metadata.platform || 'unity',
          appVersion: metadata.appVersion,
          sessionId: metadata.sessionId,
          ...metadata
        }
      };

      // Add to queue for batch processing
      this.eventQueue.push(event);
      
      // Also cache in Redis for real-time analytics
      await this.cacheEventInRedis(event);
      
      // Update real-time counters
      await this.updateRealTimeCounters(eventType, userId, data);
      
      return { success: true, eventId: event.id };
      
    } catch (error) {
      console.error('Track event error:', error);
      return { success: false, error: error.message };
    }
  }

  async cacheEventInRedis(event) {
    const key = `analytics:events:${event.eventType}:${new Date().toISOString().split('T')[0]}`;
    await redis.lpush(key, JSON.stringify(event));
    await redis.expire(key, 86400 * 7); // Keep for 7 days
  }

  async updateRealTimeCounters(eventType, userId, data) {
    const today = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();
    
    // Daily counters
    await redis.hincrby(`analytics:daily:${today}`, eventType, 1);
    await redis.hincrby(`analytics:daily:${today}`, 'total_events', 1);
    
    // Hourly counters
    await redis.hincrby(`analytics:hourly:${today}:${hour}`, eventType, 1);
    
    // User-specific counters
    if (userId) {
      await redis.hincrby(`analytics:user:${userId}:${today}`, eventType, 1);
    }
    
    // Set expiration for counters
    await redis.expire(`analytics:daily:${today}`, 86400 * 30); // 30 days
    await redis.expire(`analytics:hourly:${today}:${hour}`, 86400 * 7); // 7 days
    if (userId) {
      await redis.expire(`analytics:user:${userId}:${today}`, 86400 * 30); // 30 days
    }
  }

  startEventProcessor() {
    // Process events every 10 seconds
    setInterval(async () => {
      if (!this.processingQueue && this.eventQueue.length > 0) {
        await this.processEventQueue();
      }
    }, 10000);
  }

  async processEventQueue() {
    if (this.eventQueue.length === 0) return;
    
    this.processingQueue = true;
    const eventsToProcess = this.eventQueue.splice(0, 100); // Process in batches
    
    try {
      await this.batchInsertEvents(eventsToProcess);
    } catch (error) {
      console.error('Process event queue error:', error);
      // Re-add failed events to queue
      this.eventQueue.unshift(...eventsToProcess);
    } finally {
      this.processingQueue = false;
    }
  }

  async batchInsertEvents(events) {
    if (events.length === 0) return;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO game_analytics (
          id, event_type, user_id, event_data, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;
      
      for (const event of events) {
        await client.query(query, [
          event.id,
          event.eventType,
          event.userId,
          JSON.stringify(event.data),
          JSON.stringify(event.metadata),
          event.metadata.timestamp
        ]);
      }
      
      await client.query('COMMIT');
      console.log(`Processed ${events.length} analytics events`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // USER BEHAVIOR TRACKING
  // ============================================================================

  async trackUserBehavior(userId, action, context = {}) {
    const behaviorData = {
      userId,
      action,
      context,
      timestamp: new Date(),
      sessionId: context.sessionId
    };

    // Store in user behavior tracking table
    const query = `
      INSERT INTO user_behavior_tracking (
        id, user_id, action, context, session_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await pool.query(query, [
      uuidv4(),
      userId,
      action,
      JSON.stringify(context),
      context.sessionId,
      behaviorData.timestamp
    ]);

    // Update user engagement score
    await this.updateUserEngagementScore(userId, action);
  }

  async updateUserEngagementScore(userId, action) {
    const scoreMap = {
      'login': 10,
      'game_completed': 20,
      'purchase': 50,
      'social_interaction': 15,
      'daily_reward_claim': 5,
      'achievement_unlock': 25,
      'tournament_participation': 30
    };

    const score = scoreMap[action] || 1;
    
    await redis.zincrby('user_engagement_scores', score, userId);
    await redis.expire('user_engagement_scores', 86400 * 30); // 30 days
  }

  // ============================================================================
  // REVENUE ANALYTICS
  // ============================================================================

  async trackRevenue(transactionData) {
    const revenueRecord = {
      id: uuidv4(),
      userId: transactionData.userId,
      transactionId: transactionData.transactionId,
      amount: transactionData.amount,
      currency: transactionData.currency || 'IDR',
      paymentMethod: transactionData.paymentMethod,
      productId: transactionData.productId,
      productCategory: transactionData.productCategory,
      isFirstPurchase: transactionData.isFirstPurchase || false,
      timestamp: new Date()
    };

    // Store in revenue analytics table
    const query = `
      INSERT INTO revenue_analytics (
        id, user_id, transaction_id, amount, currency,
        payment_method, product_id, product_category,
        is_first_purchase, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
    
    await pool.query(query, [
      revenueRecord.id,
      revenueRecord.userId,
      revenueRecord.transactionId,
      revenueRecord.amount,
      revenueRecord.currency,
      revenueRecord.paymentMethod,
      revenueRecord.productId,
      revenueRecord.productCategory,
      revenueRecord.isFirstPurchase,
      revenueRecord.timestamp
    ]);

    // Update real-time revenue counters
    await this.updateRevenueCounters(revenueRecord);
  }

  async updateRevenueCounters(revenueRecord) {
    const today = new Date().toISOString().split('T')[0];
    const month = new Date().toISOString().substring(0, 7); // YYYY-MM
    
    // Daily revenue
    await redis.hincrbyfloat(`revenue:daily:${today}`, 'total', revenueRecord.amount);
    await redis.hincrby(`revenue:daily:${today}`, 'transactions', 1);
    
    // Monthly revenue
    await redis.hincrbyfloat(`revenue:monthly:${month}`, 'total', revenueRecord.amount);
    await redis.hincrby(`revenue:monthly:${month}`, 'transactions', 1);
    
    // Revenue by payment method
    await redis.hincrbyfloat(
      `revenue:payment_method:${today}`, 
      revenueRecord.paymentMethod, 
      revenueRecord.amount
    );
    
    // Revenue by product category
    await redis.hincrbyfloat(
      `revenue:category:${today}`, 
      revenueRecord.productCategory, 
      revenueRecord.amount
    );
    
    // Set expiration
    await redis.expire(`revenue:daily:${today}`, 86400 * 90); // 90 days
    await redis.expire(`revenue:monthly:${month}`, 86400 * 365); // 1 year
    await redis.expire(`revenue:payment_method:${today}`, 86400 * 90);
    await redis.expire(`revenue:category:${today}`, 86400 * 90);
  }

  // ============================================================================
  // REPORTING METHODS
  // ============================================================================

  async generateDailyReport(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const report = {
      date: targetDate,
      users: await this.getUserMetrics(targetDate),
      games: await this.getGameMetrics(targetDate),
      revenue: await this.getRevenueMetrics(targetDate),
      engagement: await this.getEngagementMetrics(targetDate),
      technical: await this.getTechnicalMetrics(targetDate)
    };

    // Cache the report
    await redis.setex(
      `report:daily:${targetDate}`, 
      86400 * 7, // 7 days
      JSON.stringify(report)
    );

    return report;
  }

  async getUserMetrics(date) {
    const queries = {
      newUsers: `
        SELECT COUNT(*) as count
        FROM users 
        WHERE DATE(created_at) = $1
      `,
      activeUsers: `
        SELECT COUNT(DISTINCT user_id) as count
        FROM game_analytics 
        WHERE DATE(created_at) = $1
      `,
      returningUsers: `
        SELECT COUNT(DISTINCT ga.user_id) as count
        FROM game_analytics ga
        JOIN users u ON ga.user_id = u.id
        WHERE DATE(ga.created_at) = $1
          AND DATE(u.created_at) < $1
      `
    };

    const results = {};
    for (const [key, query] of Object.entries(queries)) {
      const result = await pool.query(query, [date]);
      results[key] = parseInt(result.rows[0].count);
    }

    return results;
  }

  async getGameMetrics(date) {
    const queries = {
      totalGames: `
        SELECT COUNT(*) as count
        FROM game_sessions 
        WHERE DATE(created_at) = $1
      `,
      completedGames: `
        SELECT COUNT(*) as count
        FROM game_sessions 
        WHERE DATE(created_at) = $1 AND status = 'completed'
      `,
      averageGameDuration: `
        SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_duration
        FROM game_sessions 
        WHERE DATE(created_at) = $1 AND ended_at IS NOT NULL
      `,
      gamesByMode: `
        SELECT rt.name as mode, COUNT(*) as count
        FROM game_sessions gs
        JOIN game_rooms gr ON gs.room_id = gr.id
        JOIN room_types rt ON gr.room_type_id = rt.id
        WHERE DATE(gs.created_at) = $1
        GROUP BY rt.name
      `
    };

    const results = {};
    
    for (const [key, query] of Object.entries(queries)) {
      if (key === 'gamesByMode') {
        const result = await pool.query(query, [date]);
        results[key] = result.rows;
      } else {
        const result = await pool.query(query, [date]);
        results[key] = key === 'averageGameDuration' 
          ? parseFloat(result.rows[0].avg_duration || 0)
          : parseInt(result.rows[0].count || 0);
      }
    }

    return results;
  }

  async getRevenueMetrics(date) {
    const queries = {
      totalRevenue: `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM revenue_analytics 
        WHERE DATE(created_at) = $1
      `,
      totalTransactions: `
        SELECT COUNT(*) as count
        FROM revenue_analytics 
        WHERE DATE(created_at) = $1
      `,
      averageTransactionValue: `
        SELECT COALESCE(AVG(amount), 0) as avg_value
        FROM revenue_analytics 
        WHERE DATE(created_at) = $1
      `,
      firstTimePurchasers: `
        SELECT COUNT(*) as count
        FROM revenue_analytics 
        WHERE DATE(created_at) = $1 AND is_first_purchase = true
      `,
      revenueByCategory: `
        SELECT product_category, SUM(amount) as revenue
        FROM revenue_analytics 
        WHERE DATE(created_at) = $1
        GROUP BY product_category
      `
    };

    const results = {};
    
    for (const [key, query] of Object.entries(queries)) {
      if (key === 'revenueByCategory') {
        const result = await pool.query(query, [date]);
        results[key] = result.rows;
      } else {
        const result = await pool.query(query, [date]);
        const value = result.rows[0];
        results[key] = parseFloat(value.total || value.count || value.avg_value || 0);
      }
    }

    return results;
  }

  async getEngagementMetrics(date) {
    const queries = {
      dailyRewardClaims: `
        SELECT COUNT(*) as count
        FROM user_daily_claims 
        WHERE DATE(claim_date) = $1
      `,
      achievementsUnlocked: `
        SELECT COUNT(*) as count
        FROM user_achievements 
        WHERE DATE(unlocked_at) = $1
      `,
      chatMessages: `
        SELECT COUNT(*) as count
        FROM chat_messages 
        WHERE DATE(created_at) = $1
      `,
      socialInteractions: `
        SELECT COUNT(*) as count
        FROM friendships 
        WHERE DATE(created_at) = $1 AND status = 'accepted'
      `
    };

    const results = {};
    for (const [key, query] of Object.entries(queries)) {
      const result = await pool.query(query, [date]);
      results[key] = parseInt(result.rows[0].count);
    }

    return results;
  }

  async getTechnicalMetrics(date) {
    const queries = {
      crashes: `
        SELECT COUNT(*) as count
        FROM game_analytics 
        WHERE DATE(created_at) = $1 AND event_type = 'app_crash'
      `,
      connectionErrors: `
        SELECT COUNT(*) as count
        FROM game_analytics 
        WHERE DATE(created_at) = $1 AND event_type = 'connection_error'
      `,
      performanceIssues: `
        SELECT COUNT(*) as count
        FROM game_analytics 
        WHERE DATE(created_at) = $1 AND event_type = 'performance_issue'
      `
    };

    const results = {};
    for (const [key, query] of Object.entries(queries)) {
      const result = await pool.query(query, [date]);
      results[key] = parseInt(result.rows[0].count);
    }

    return results;
  }

  async generateWeeklyReport(startDate = null) {
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const report = {
      period: {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
      },
      summary: await this.getWeeklySummary(start, end),
      trends: await this.getWeeklyTrends(start, end),
      topPerformers: await this.getTopPerformers(start, end)
    };

    return report;
  }

  async getWeeklySummary(start, end) {
    const queries = {
      totalUsers: `
        SELECT COUNT(DISTINCT user_id) as count
        FROM game_analytics 
        WHERE created_at >= $1 AND created_at < $2
      `,
      totalGames: `
        SELECT COUNT(*) as count
        FROM game_sessions 
        WHERE created_at >= $1 AND created_at < $2
      `,
      totalRevenue: `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM revenue_analytics 
        WHERE created_at >= $1 AND created_at < $2
      `,
      newUsers: `
        SELECT COUNT(*) as count
        FROM users 
        WHERE created_at >= $1 AND created_at < $2
      `
    };

    const results = {};
    for (const [key, query] of Object.entries(queries)) {
      const result = await pool.query(query, [start, end]);
      results[key] = key === 'totalRevenue' 
        ? parseFloat(result.rows[0].total)
        : parseInt(result.rows[0].count);
    }

    return results;
  }

  async getWeeklyTrends(start, end) {
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(DISTINCT user_id) as active_users,
        COUNT(CASE WHEN event_type = 'game_start' THEN 1 END) as games_started,
        COUNT(CASE WHEN event_type = 'purchase_completed' THEN 1 END) as purchases
      FROM game_analytics 
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    const result = await pool.query(query, [start, end]);
    return result.rows;
  }

  async getTopPerformers(start, end) {
    const queries = {
      topPlayers: `
        SELECT 
          u.username,
          COUNT(gs.id) as games_played,
          COUNT(CASE WHEN gs.winner_id = u.id THEN 1 END) as wins
        FROM users u
        JOIN game_sessions gs ON u.id = ANY(gs.player_ids)
        WHERE gs.created_at >= $1 AND gs.created_at < $2
        GROUP BY u.id, u.username
        ORDER BY games_played DESC
        LIMIT 10
      `,
      topSpenders: `
        SELECT 
          u.username,
          SUM(ra.amount) as total_spent
        FROM users u
        JOIN revenue_analytics ra ON u.id = ra.user_id
        WHERE ra.created_at >= $1 AND ra.created_at < $2
        GROUP BY u.id, u.username
        ORDER BY total_spent DESC
        LIMIT 10
      `
    };

    const results = {};
    for (const [key, query] of Object.entries(queries)) {
      const result = await pool.query(query, [start, end]);
      results[key] = result.rows;
    }

    return results;
  }

  // ============================================================================
  // REAL-TIME ANALYTICS
  // ============================================================================

  async getRealTimeStats() {
    const today = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();
    
    const stats = {
      online: await this.getOnlineUsers(),
      today: await redis.hgetall(`analytics:daily:${today}`),
      currentHour: await redis.hgetall(`analytics:hourly:${today}:${currentHour}`),
      revenue: await redis.hgetall(`revenue:daily:${today}`),
      topEvents: await this.getTopEvents(today)
    };

    return stats;
  }

  async getOnlineUsers() {
    const onlineUsers = await redis.scard('online_users');
    const activeGames = await redis.scard('active_games');
    
    return {
      users: onlineUsers,
      games: activeGames
    };
  }

  async getTopEvents(date) {
    const events = await redis.hgetall(`analytics:daily:${date}`);
    
    return Object.entries(events)
      .filter(([key]) => key !== 'total_events')
      .sort(([,a], [,b]) => parseInt(b) - parseInt(a))
      .slice(0, 10)
      .map(([event, count]) => ({ event, count: parseInt(count) }));
  }

  // ============================================================================
  // COHORT ANALYSIS
  // ============================================================================

  async generateCohortAnalysis(startDate, endDate) {
    const query = `
      WITH user_cohorts AS (
        SELECT 
          id as user_id,
          DATE_TRUNC('week', created_at) as cohort_week
        FROM users
        WHERE created_at >= $1 AND created_at <= $2
      ),
      user_activities AS (
        SELECT 
          user_id,
          DATE_TRUNC('week', created_at) as activity_week
        FROM game_analytics
        WHERE created_at >= $1 AND created_at <= $2
          AND event_type IN ('user_login', 'game_start')
        GROUP BY user_id, DATE_TRUNC('week', created_at)
      )
      SELECT 
        uc.cohort_week,
        ua.activity_week,
        COUNT(DISTINCT uc.user_id) as cohort_size,
        COUNT(DISTINCT ua.user_id) as active_users,
        ROUND(
          COUNT(DISTINCT ua.user_id)::numeric / 
          COUNT(DISTINCT uc.user_id) * 100, 2
        ) as retention_rate
      FROM user_cohorts uc
      LEFT JOIN user_activities ua ON uc.user_id = ua.user_id
      GROUP BY uc.cohort_week, ua.activity_week
      ORDER BY uc.cohort_week, ua.activity_week
    `;

    const result = await pool.query(query, [startDate, endDate]);
    return result.rows;
  }

  // ============================================================================
  // FUNNEL ANALYSIS
  // ============================================================================

  async generateFunnelAnalysis(funnelSteps, startDate, endDate) {
    const funnelData = [];
    
    for (let i = 0; i < funnelSteps.length; i++) {
      const step = funnelSteps[i];
      
      let query;
      if (i === 0) {
        // First step - count all users who performed this action
        query = `
          SELECT COUNT(DISTINCT user_id) as count
          FROM game_analytics
          WHERE event_type = $1
            AND created_at >= $2 AND created_at <= $3
        `;
      } else {
        // Subsequent steps - count users who performed previous step AND this step
        const previousSteps = funnelSteps.slice(0, i + 1);
        query = `
          SELECT COUNT(DISTINCT user_id) as count
          FROM (
            SELECT user_id
            FROM game_analytics
            WHERE event_type = ANY($1)
              AND created_at >= $2 AND created_at <= $3
            GROUP BY user_id
            HAVING COUNT(DISTINCT event_type) = $4
          ) t
        `;
      }
      
      const params = i === 0 
        ? [step, startDate, endDate]
        : [funnelSteps.slice(0, i + 1), startDate, endDate, i + 1];
      
      const result = await pool.query(query, params);
      const count = parseInt(result.rows[0].count);
      
      funnelData.push({
        step: step,
        users: count,
        conversionRate: i === 0 ? 100 : (count / funnelData[0].users * 100).toFixed(2)
      });
    }
    
    return funnelData;
  }

  // ============================================================================
  // EXPORT METHODS
  // ============================================================================

  async exportReportToCSV(reportData, filename) {
    const csvContent = this.convertToCSV(reportData);
    const filePath = path.join(process.env.REPORTS_DIR || './reports', filename);
    
    await fs.writeFile(filePath, csvContent, 'utf8');
    return filePath;
  }

  convertToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        return typeof value === 'string' ? `"${value}"` : value;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }

  // ============================================================================
  // CLEANUP METHODS
  // ============================================================================

  async cleanupOldAnalytics(daysToKeep = 90) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const queries = [
      'DELETE FROM game_analytics WHERE created_at < $1',
      'DELETE FROM user_behavior_tracking WHERE created_at < $1',
      'DELETE FROM revenue_analytics WHERE created_at < $1'
    ];
    
    let totalDeleted = 0;
    
    for (const query of queries) {
      const result = await pool.query(query, [cutoffDate]);
      totalDeleted += result.rowCount;
    }
    
    console.log(`Cleaned up ${totalDeleted} old analytics records`);
    return totalDeleted;
  }
}

// ============================================================================
// CRON JOBS FOR ANALYTICS
// ============================================================================

const analyticsService = new AnalyticsService();

// Generate daily reports at 1 AM
cron.schedule('0 1 * * *', async () => {
  if (analyticsService.isInitialized) {
    console.log('Generating daily analytics report...');
    
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    
    try {
      const report = await analyticsService.generateDailyReport(yesterday);
      console.log(`Daily report generated for ${yesterday}`);
      
      // Optionally save to file
      if (process.env.SAVE_REPORTS === 'true') {
        const filename = `daily_report_${yesterday}.json`;
        const reportsDir = process.env.REPORTS_DIR || './reports';
        
        // Ensure reports directory exists
        await fs.mkdir(reportsDir, { recursive: true });
        
        await fs.writeFile(
          path.join(reportsDir, filename),
          JSON.stringify(report, null, 2),
          'utf8'
        );
      }
      
    } catch (error) {
      console.error('Daily report generation error:', error);
    }
  }
});

// Generate weekly reports on Mondays at 2 AM
cron.schedule('0 2 * * 1', async () => {
  if (analyticsService.isInitialized) {
    console.log('Generating weekly analytics report...');
    
    try {
      const report = await analyticsService.generateWeeklyReport();
      console.log('Weekly report generated');
      
      // Cache the report
      await redis.setex(
        'report:weekly:latest',
        86400 * 7, // 7 days
        JSON.stringify(report)
      );
      
    } catch (error) {
      console.error('Weekly report generation error:', error);
    }
  }
});

// Cleanup old analytics data every Sunday at 3 AM
cron.schedule('0 3 * * 0', async () => {
  if (analyticsService.isInitialized) {
    console.log('Cleaning up old analytics data...');
    
    try {
      await analyticsService.cleanupOldAnalytics(90); // Keep 90 days
      console.log('Analytics cleanup completed');
    } catch (error) {
      console.error('Analytics cleanup error:', error);
    }
  }
});

// Refresh materialized views every hour
cron.schedule('0 * * * *', async () => {
  if (analyticsService.isInitialized) {
    try {
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY daily_active_users');
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_summary');
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY game_performance_metrics');
      console.log('Materialized views refreshed');
    } catch (error) {
      console.error('Materialized view refresh error:', error);
    }
  }
});

module.exports = {
  AnalyticsService,
  analyticsService,
  ANALYTICS_EVENTS
};