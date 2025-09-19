// ============================================================================
// MONITORING AND LOGGING SERVICE
// ============================================================================

const winston = require('winston');
const prometheus = require('prom-client');
const { Pool } = require('pg');
const Redis = require('ioredis');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

// Initialize Prometheus metrics
prometheus.collectDefaultMetrics({ timeout: 5000 });

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

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true
});

// ============================================================================
// PROMETHEUS METRICS
// ============================================================================

const metrics = {
  // HTTP Metrics
  httpRequestsTotal: new prometheus.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
  }),
  
  httpRequestDuration: new prometheus.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
  }),
  
  // WebSocket Metrics
  websocketConnections: new prometheus.Gauge({
    name: 'websocket_connections_active',
    help: 'Number of active WebSocket connections'
  }),
  
  websocketMessages: new prometheus.Counter({
    name: 'websocket_messages_total',
    help: 'Total number of WebSocket messages',
    labelNames: ['type', 'event']
  }),
  
  // Game Metrics
  activeGames: new prometheus.Gauge({
    name: 'games_active_total',
    help: 'Number of active games'
  }),
  
  gamesCreated: new prometheus.Counter({
    name: 'games_created_total',
    help: 'Total number of games created',
    labelNames: ['game_type']
  }),
  
  gamesCompleted: new prometheus.Counter({
    name: 'games_completed_total',
    help: 'Total number of games completed',
    labelNames: ['game_type', 'result']
  }),
  
  gameDuration: new prometheus.Histogram({
    name: 'game_duration_seconds',
    help: 'Duration of games in seconds',
    labelNames: ['game_type'],
    buckets: [30, 60, 120, 300, 600, 1200, 1800, 3600]
  }),
  
  // User Metrics
  activeUsers: new prometheus.Gauge({
    name: 'users_active_total',
    help: 'Number of active users'
  }),
  
  userRegistrations: new prometheus.Counter({
    name: 'user_registrations_total',
    help: 'Total number of user registrations'
  }),
  
  userLogins: new prometheus.Counter({
    name: 'user_logins_total',
    help: 'Total number of user logins',
    labelNames: ['status']
  }),
  
  // Database Metrics
  dbConnections: new prometheus.Gauge({
    name: 'database_connections_active',
    help: 'Number of active database connections'
  }),
  
  dbQueries: new prometheus.Counter({
    name: 'database_queries_total',
    help: 'Total number of database queries',
    labelNames: ['operation', 'table']
  }),
  
  dbQueryDuration: new prometheus.Histogram({
    name: 'database_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['operation', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
  }),
  
  // Cache Metrics
  cacheHits: new prometheus.Counter({
    name: 'cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_type']
  }),
  
  cacheMisses: new prometheus.Counter({
    name: 'cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['cache_type']
  }),
  
  cacheOperations: new prometheus.Counter({
    name: 'cache_operations_total',
    help: 'Total number of cache operations',
    labelNames: ['operation', 'cache_type']
  }),
  
  // Transaction Metrics
  transactions: new prometheus.Counter({
    name: 'transactions_total',
    help: 'Total number of transactions',
    labelNames: ['type', 'status']
  }),
  
  transactionAmount: new prometheus.Histogram({
    name: 'transaction_amount',
    help: 'Transaction amounts',
    labelNames: ['type', 'currency'],
    buckets: [1, 10, 100, 1000, 10000, 100000, 1000000]
  }),
  
  // Error Metrics
  errors: new prometheus.Counter({
    name: 'errors_total',
    help: 'Total number of errors',
    labelNames: ['type', 'severity']
  }),
  
  // System Metrics
  systemMemoryUsage: new prometheus.Gauge({
    name: 'system_memory_usage_bytes',
    help: 'System memory usage in bytes'
  }),
  
  systemCpuUsage: new prometheus.Gauge({
    name: 'system_cpu_usage_percent',
    help: 'System CPU usage percentage'
  }),
  
  // Security Metrics
  securityEvents: new prometheus.Counter({
    name: 'security_events_total',
    help: 'Total number of security events',
    labelNames: ['event_type', 'severity']
  }),
  
  failedLogins: new prometheus.Counter({
    name: 'failed_logins_total',
    help: 'Total number of failed login attempts',
    labelNames: ['reason']
  })
};

// ============================================================================
// WINSTON LOGGER CONFIGURATION
// ============================================================================

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta
    });
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'higgs-domino-backend',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File transports
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 5
    }),
    
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 10
    }),
    
    // Separate file for security events
    new winston.transports.File({
      filename: 'logs/security.log',
      level: 'warn',
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});

// ============================================================================
// MONITORING SERVICE CLASS
// ============================================================================

class MonitoringService {
  constructor() {
    this.isInitialized = false;
    this.alertThresholds = {
      errorRate: 0.05, // 5% error rate
      responseTime: 5000, // 5 seconds
      memoryUsage: 0.85, // 85% memory usage
      cpuUsage: 0.80, // 80% CPU usage
      activeConnections: 10000,
      failedLogins: 100 // per hour
    };
    
    this.alertCooldowns = new Map();
    this.systemStats = {
      startTime: Date.now(),
      lastHealthCheck: null,
      errors: [],
      performance: []
    };
    
    this.init();
  }

  async init() {
    try {
      // Create logs directory if it doesn't exist
      await this.ensureLogDirectory();
      
      // Test database connection
      await pool.query('SELECT 1');
      logger.info('Monitoring service database connected');
      
      // Test Redis connection
      await redis.ping();
      logger.info('Monitoring service Redis connected');
      
      // Start system monitoring
      this.startSystemMonitoring();
      
      // Start health checks
      this.startHealthChecks();
      
      // Setup alert system
      this.setupAlertSystem();
      
      this.isInitialized = true;
      logger.info('Monitoring service initialized successfully');
    } catch (error) {
      logger.error('Monitoring service initialization error:', error);
      this.isInitialized = false;
    }
  }

  async ensureLogDirectory() {
    const logDir = path.join(process.cwd(), 'logs');
    try {
      await fs.access(logDir);
    } catch {
      await fs.mkdir(logDir, { recursive: true });
      logger.info('Created logs directory');
    }
  }

  startSystemMonitoring() {
    // Monitor system resources every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);
    
    // Monitor application metrics every 10 seconds
    setInterval(() => {
      this.collectApplicationMetrics();
    }, 10000);
    
    logger.info('System monitoring started');
  }

  startHealthChecks() {
    // Health check every 60 seconds
    setInterval(() => {
      this.performHealthCheck();
    }, 60000);
    
    logger.info('Health checks started');
  }

  setupAlertSystem() {
    // Check for alerts every 5 minutes
    setInterval(() => {
      this.checkAlerts();
    }, 300000);
    
    logger.info('Alert system setup completed');
  }

  // ============================================================================
  // METRICS COLLECTION
  // ============================================================================

  async collectSystemMetrics() {
    try {
      // Memory usage
      const memUsage = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      
      metrics.systemMemoryUsage.set(usedMem);
      
      // CPU usage
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      
      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });
      
      const idle = totalIdle / cpus.length;
      const total = totalTick / cpus.length;
      const usage = 100 - ~~(100 * idle / total);
      
      metrics.systemCpuUsage.set(usage);
      
      // Database connections
      const dbStats = await this.getDatabaseStats();
      if (dbStats) {
        metrics.dbConnections.set(dbStats.activeConnections);
      }
      
      // Redis stats
      const redisStats = await this.getRedisStats();
      if (redisStats) {
        // Update cache metrics based on Redis info
        this.updateCacheMetrics(redisStats);
      }
      
    } catch (error) {
      logger.error('System metrics collection error:', error);
      this.recordError('system_metrics', error);
    }
  }

  async collectApplicationMetrics() {
    try {
      // Active users
      const activeUsers = await this.getActiveUsersCount();
      metrics.activeUsers.set(activeUsers);
      
      // Active games
      const activeGames = await this.getActiveGamesCount();
      metrics.activeGames.set(activeGames);
      
      // WebSocket connections
      const wsConnections = await this.getWebSocketConnectionsCount();
      metrics.websocketConnections.set(wsConnections);
      
    } catch (error) {
      logger.error('Application metrics collection error:', error);
      this.recordError('app_metrics', error);
    }
  }

  async getDatabaseStats() {
    try {
      const query = `
        SELECT 
          count(*) as active_connections,
          sum(case when state = 'active' then 1 else 0 end) as active_queries
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `;
      
      const result = await pool.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Database stats error:', error);
      return null;
    }
  }

  async getRedisStats() {
    try {
      const info = await redis.info();
      const stats = this.parseRedisInfo(info);
      return stats;
    } catch (error) {
      logger.error('Redis stats error:', error);
      return null;
    }
  }

  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const stats = {};
    
    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        stats[key] = isNaN(value) ? value : Number(value);
      }
    });
    
    return stats;
  }

  updateCacheMetrics(redisStats) {
    if (redisStats.keyspace_hits !== undefined) {
      metrics.cacheHits.inc({ cache_type: 'redis' }, redisStats.keyspace_hits);
    }
    
    if (redisStats.keyspace_misses !== undefined) {
      metrics.cacheMisses.inc({ cache_type: 'redis' }, redisStats.keyspace_misses);
    }
  }

  async getActiveUsersCount() {
    try {
      const query = `
        SELECT COUNT(DISTINCT user_id) as active_users
        FROM user_sessions
        WHERE expires_at > NOW()
          AND last_activity > NOW() - INTERVAL '30 minutes'
      `;
      
      const result = await pool.query(query);
      return parseInt(result.rows[0].active_users) || 0;
    } catch (error) {
      logger.error('Active users count error:', error);
      return 0;
    }
  }

  async getActiveGamesCount() {
    try {
      const count = await redis.scard('active_games');
      return count || 0;
    } catch (error) {
      logger.error('Active games count error:', error);
      return 0;
    }
  }

  async getWebSocketConnectionsCount() {
    try {
      const count = await redis.scard('websocket_connections');
      return count || 0;
    } catch (error) {
      logger.error('WebSocket connections count error:', error);
      return 0;
    }
  }

  // ============================================================================
  // HEALTH CHECKS
  // ============================================================================

  async performHealthCheck() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      services: {},
      metrics: {}
    };
    
    try {
      // Check database
      healthStatus.services.database = await this.checkDatabaseHealth();
      
      // Check Redis
      healthStatus.services.redis = await this.checkRedisHealth();
      
      // Check system resources
      healthStatus.services.system = await this.checkSystemHealth();
      
      // Check application metrics
      healthStatus.metrics = await this.getHealthMetrics();
      
      // Determine overall status
      const serviceStatuses = Object.values(healthStatus.services);
      if (serviceStatuses.some(s => s.status === 'unhealthy')) {
        healthStatus.status = 'unhealthy';
      } else if (serviceStatuses.some(s => s.status === 'degraded')) {
        healthStatus.status = 'degraded';
      }
      
      this.systemStats.lastHealthCheck = healthStatus;
      
      // Store health check in database
      await this.storeHealthCheck(healthStatus);
      
      // Log health status
      if (healthStatus.status !== 'healthy') {
        logger.warn('Health check warning:', healthStatus);
      } else {
        logger.info('Health check passed');
      }
      
    } catch (error) {
      logger.error('Health check error:', error);
      healthStatus.status = 'unhealthy';
      healthStatus.error = error.message;
    }
    
    return healthStatus;
  }

  async checkDatabaseHealth() {
    try {
      const start = Date.now();
      await pool.query('SELECT 1');
      const responseTime = Date.now() - start;
      
      const stats = await this.getDatabaseStats();
      
      return {
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        responseTime,
        activeConnections: stats?.active_connections || 0
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkRedisHealth() {
    try {
      const start = Date.now();
      await redis.ping();
      const responseTime = Date.now() - start;
      
      const info = await redis.info('memory');
      const memoryInfo = this.parseRedisInfo(info);
      
      return {
        status: responseTime < 500 ? 'healthy' : 'degraded',
        responseTime,
        memoryUsage: memoryInfo.used_memory || 0
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkSystemHealth() {
    try {
      const memUsage = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memoryUsagePercent = (totalMem - freeMem) / totalMem;
      
      const loadAvg = os.loadavg();
      const cpuCount = os.cpus().length;
      const loadPercent = loadAvg[0] / cpuCount;
      
      let status = 'healthy';
      if (memoryUsagePercent > this.alertThresholds.memoryUsage || 
          loadPercent > this.alertThresholds.cpuUsage) {
        status = 'degraded';
      }
      
      return {
        status,
        memoryUsage: memoryUsagePercent,
        cpuLoad: loadPercent,
        uptime: process.uptime()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async getHealthMetrics() {
    try {
      const activeUsers = await this.getActiveUsersCount();
      const activeGames = await this.getActiveGamesCount();
      const wsConnections = await this.getWebSocketConnectionsCount();
      
      return {
        activeUsers,
        activeGames,
        wsConnections,
        uptime: process.uptime()
      };
    } catch (error) {
      logger.error('Health metrics error:', error);
      return {};
    }
  }

  async storeHealthCheck(healthStatus) {
    try {
      const query = `
        INSERT INTO system_health_checks (
          id, timestamp, status, services, metrics, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;
      
      await pool.query(query, [
        uuidv4(),
        healthStatus.timestamp,
        healthStatus.status,
        JSON.stringify(healthStatus.services),
        JSON.stringify(healthStatus.metrics),
        new Date()
      ]);
    } catch (error) {
      logger.error('Store health check error:', error);
    }
  }

  // ============================================================================
  // ALERTING SYSTEM
  // ============================================================================

  async checkAlerts() {
    try {
      // Check error rate
      await this.checkErrorRateAlert();
      
      // Check response time
      await this.checkResponseTimeAlert();
      
      // Check system resources
      await this.checkSystemResourceAlerts();
      
      // Check security alerts
      await this.checkSecurityAlerts();
      
      // Check business metrics
      await this.checkBusinessMetricAlerts();
      
    } catch (error) {
      logger.error('Alert check error:', error);
    }
  }

  async checkErrorRateAlert() {
    try {
      const errorCount = await this.getErrorCount('1h');
      const totalRequests = await this.getTotalRequests('1h');
      
      if (totalRequests > 0) {
        const errorRate = errorCount / totalRequests;
        
        if (errorRate > this.alertThresholds.errorRate) {
          await this.sendAlert('high_error_rate', {
            errorRate: (errorRate * 100).toFixed(2),
            errorCount,
            totalRequests,
            threshold: (this.alertThresholds.errorRate * 100).toFixed(2)
          });
        }
      }
    } catch (error) {
      logger.error('Error rate alert check error:', error);
    }
  }

  async checkResponseTimeAlert() {
    try {
      const avgResponseTime = await this.getAverageResponseTime('1h');
      
      if (avgResponseTime > this.alertThresholds.responseTime) {
        await this.sendAlert('high_response_time', {
          avgResponseTime,
          threshold: this.alertThresholds.responseTime
        });
      }
    } catch (error) {
      logger.error('Response time alert check error:', error);
    }
  }

  async checkSystemResourceAlerts() {
    try {
      const memUsage = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memoryUsagePercent = (totalMem - freeMem) / totalMem;
      
      if (memoryUsagePercent > this.alertThresholds.memoryUsage) {
        await this.sendAlert('high_memory_usage', {
          memoryUsage: (memoryUsagePercent * 100).toFixed(2),
          threshold: (this.alertThresholds.memoryUsage * 100).toFixed(2)
        });
      }
      
      const loadAvg = os.loadavg();
      const cpuCount = os.cpus().length;
      const loadPercent = loadAvg[0] / cpuCount;
      
      if (loadPercent > this.alertThresholds.cpuUsage) {
        await this.sendAlert('high_cpu_usage', {
          cpuUsage: (loadPercent * 100).toFixed(2),
          threshold: (this.alertThresholds.cpuUsage * 100).toFixed(2)
        });
      }
    } catch (error) {
      logger.error('System resource alert check error:', error);
    }
  }

  async checkSecurityAlerts() {
    try {
      const failedLogins = await this.getFailedLoginsCount('1h');
      
      if (failedLogins > this.alertThresholds.failedLogins) {
        await this.sendAlert('high_failed_logins', {
          failedLogins,
          threshold: this.alertThresholds.failedLogins
        });
      }
      
      // Check for suspicious activities
      const suspiciousActivities = await this.getSuspiciousActivities('1h');
      
      if (suspiciousActivities.length > 0) {
        await this.sendAlert('suspicious_activity', {
          activities: suspiciousActivities
        });
      }
    } catch (error) {
      logger.error('Security alert check error:', error);
    }
  }

  async checkBusinessMetricAlerts() {
    try {
      // Check for unusual drops in active users
      const currentActiveUsers = await this.getActiveUsersCount();
      const avgActiveUsers = await this.getAverageActiveUsers('24h');
      
      if (currentActiveUsers < avgActiveUsers * 0.5) {
        await this.sendAlert('low_active_users', {
          currentActiveUsers,
          avgActiveUsers,
          dropPercentage: ((avgActiveUsers - currentActiveUsers) / avgActiveUsers * 100).toFixed(2)
        });
      }
      
      // Check for unusual drops in game activity
      const currentActiveGames = await this.getActiveGamesCount();
      const avgActiveGames = await this.getAverageActiveGames('24h');
      
      if (currentActiveGames < avgActiveGames * 0.5) {
        await this.sendAlert('low_game_activity', {
          currentActiveGames,
          avgActiveGames,
          dropPercentage: ((avgActiveGames - currentActiveGames) / avgActiveGames * 100).toFixed(2)
        });
      }
    } catch (error) {
      logger.error('Business metric alert check error:', error);
    }
  }

  async sendAlert(alertType, data) {
    const alertKey = `alert:${alertType}`;
    const cooldownTime = 3600000; // 1 hour cooldown
    
    // Check if alert is in cooldown
    if (this.alertCooldowns.has(alertKey)) {
      const lastAlert = this.alertCooldowns.get(alertKey);
      if (Date.now() - lastAlert < cooldownTime) {
        return; // Skip alert due to cooldown
      }
    }
    
    const alert = {
      id: uuidv4(),
      type: alertType,
      severity: this.getAlertSeverity(alertType),
      data,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    };
    
    // Log alert
    logger.error('ALERT:', alert);
    
    // Store alert in database
    await this.storeAlert(alert);
    
    // Send alert notifications
    await this.sendAlertNotifications(alert);
    
    // Update cooldown
    this.alertCooldowns.set(alertKey, Date.now());
  }

  getAlertSeverity(alertType) {
    const severityMap = {
      high_error_rate: 'critical',
      high_response_time: 'warning',
      high_memory_usage: 'critical',
      high_cpu_usage: 'warning',
      high_failed_logins: 'critical',
      suspicious_activity: 'critical',
      low_active_users: 'warning',
      low_game_activity: 'warning'
    };
    
    return severityMap[alertType] || 'info';
  }

  async storeAlert(alert) {
    try {
      const query = `
        INSERT INTO system_alerts (
          id, type, severity, data, timestamp, environment, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      await pool.query(query, [
        alert.id,
        alert.type,
        alert.severity,
        JSON.stringify(alert.data),
        alert.timestamp,
        alert.environment,
        new Date()
      ]);
    } catch (error) {
      logger.error('Store alert error:', error);
    }
  }

  async sendAlertNotifications(alert) {
    try {
      // Send email notification for critical alerts
      if (alert.severity === 'critical') {
        await this.sendEmailAlert(alert);
      }
      
      // Send to monitoring channels (Slack, Discord, etc.)
      await this.sendWebhookAlert(alert);
      
      // Store in Redis for real-time dashboard
      await redis.lpush('system_alerts', JSON.stringify(alert));
      await redis.ltrim('system_alerts', 0, 99); // Keep last 100 alerts
      
    } catch (error) {
      logger.error('Send alert notifications error:', error);
    }
  }

  async sendEmailAlert(alert) {
    try {
      if (!process.env.SMTP_HOST) {
        return; // Email not configured
      }
      
      const transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      
      const mailOptions = {
        from: process.env.SMTP_FROM || 'alerts@higgs-domino.com',
        to: process.env.ALERT_EMAIL || 'admin@higgs-domino.com',
        subject: `[${alert.severity.toUpperCase()}] ${alert.type} - Higgs Domino`,
        html: this.generateAlertEmailHTML(alert)
      };
      
      await transporter.sendMail(mailOptions);
      logger.info('Alert email sent:', alert.type);
    } catch (error) {
      logger.error('Send email alert error:', error);
    }
  }

  generateAlertEmailHTML(alert) {
    return `
      <h2>System Alert: ${alert.type}</h2>
      <p><strong>Severity:</strong> ${alert.severity}</p>
      <p><strong>Environment:</strong> ${alert.environment}</p>
      <p><strong>Timestamp:</strong> ${alert.timestamp}</p>
      <h3>Details:</h3>
      <pre>${JSON.stringify(alert.data, null, 2)}</pre>
    `;
  }

  async sendWebhookAlert(alert) {
    try {
      if (!process.env.WEBHOOK_URL) {
        return; // Webhook not configured
      }
      
      const payload = {
        text: `🚨 Alert: ${alert.type}`,
        attachments: [{
          color: alert.severity === 'critical' ? 'danger' : 'warning',
          fields: [
            { title: 'Severity', value: alert.severity, short: true },
            { title: 'Environment', value: alert.environment, short: true },
            { title: 'Timestamp', value: alert.timestamp, short: false },
            { title: 'Details', value: JSON.stringify(alert.data, null, 2), short: false }
          ]
        }]
      };
      
      // Send webhook (implementation depends on your webhook service)
      // This is a placeholder for webhook implementation
      logger.info('Webhook alert sent:', alert.type);
    } catch (error) {
      logger.error('Send webhook alert error:', error);
    }
  }

  // ============================================================================
  // HELPER METHODS FOR METRICS
  // ============================================================================

  async getErrorCount(timeframe) {
    try {
      const query = `
        SELECT COUNT(*) as error_count
        FROM system_logs
        WHERE level = 'error'
          AND created_at > NOW() - INTERVAL '${timeframe}'
      `;
      
      const result = await pool.query(query);
      return parseInt(result.rows[0].error_count) || 0;
    } catch (error) {
      logger.error('Get error count error:', error);
      return 0;
    }
  }

  async getTotalRequests(timeframe) {
    try {
      // This would typically come from access logs or request metrics
      // For now, return a placeholder value
      return 1000; // Placeholder
    } catch (error) {
      logger.error('Get total requests error:', error);
      return 0;
    }
  }

  async getAverageResponseTime(timeframe) {
    try {
      // This would typically come from performance logs
      // For now, return a placeholder value
      return 500; // Placeholder in milliseconds
    } catch (error) {
      logger.error('Get average response time error:', error);
      return 0;
    }
  }

  async getFailedLoginsCount(timeframe) {
    try {
      const query = `
        SELECT COUNT(*) as failed_logins
        FROM failed_login_attempts
        WHERE created_at > NOW() - INTERVAL '${timeframe}'
      `;
      
      const result = await pool.query(query);
      return parseInt(result.rows[0].failed_logins) || 0;
    } catch (error) {
      logger.error('Get failed logins count error:', error);
      return 0;
    }
  }

  async getSuspiciousActivities(timeframe) {
    try {
      const query = `
        SELECT event_type, COUNT(*) as count
        FROM security_audit_log
        WHERE threat_level = 'high'
          AND created_at > NOW() - INTERVAL '${timeframe}'
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 10
      `;
      
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Get suspicious activities error:', error);
      return [];
    }
  }

  async getAverageActiveUsers(timeframe) {
    try {
      const query = `
        SELECT AVG(active_users) as avg_active_users
        FROM (
          SELECT COUNT(DISTINCT user_id) as active_users
          FROM user_sessions
          WHERE created_at > NOW() - INTERVAL '${timeframe}'
          GROUP BY DATE_TRUNC('hour', created_at)
        ) hourly_stats
      `;
      
      const result = await pool.query(query);
      return parseInt(result.rows[0].avg_active_users) || 0;
    } catch (error) {
      logger.error('Get average active users error:', error);
      return 0;
    }
  }

  async getAverageActiveGames(timeframe) {
    try {
      // This would typically come from game session logs
      // For now, return a placeholder calculation
      const currentGames = await this.getActiveGamesCount();
      return Math.max(currentGames * 0.8, 1); // Placeholder
    } catch (error) {
      logger.error('Get average active games error:', error);
      return 0;
    }
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  recordError(type, error, metadata = {}) {
    const errorRecord = {
      type,
      message: error.message || error,
      stack: error.stack,
      metadata,
      timestamp: new Date().toISOString()
    };
    
    this.systemStats.errors.push(errorRecord);
    
    // Keep only last 1000 errors in memory
    if (this.systemStats.errors.length > 1000) {
      this.systemStats.errors = this.systemStats.errors.slice(-1000);
    }
    
    // Update Prometheus metrics
    metrics.errors.inc({ type, severity: 'error' });
    
    // Log error
    logger.error('Error recorded:', errorRecord);
  }

  recordPerformance(operation, duration, metadata = {}) {
    const perfRecord = {
      operation,
      duration,
      metadata,
      timestamp: new Date().toISOString()
    };
    
    this.systemStats.performance.push(perfRecord);
    
    // Keep only last 1000 performance records in memory
    if (this.systemStats.performance.length > 1000) {
      this.systemStats.performance = this.systemStats.performance.slice(-1000);
    }
  }

  getMetrics() {
    return prometheus.register.metrics();
  }

  getSystemStats() {
    return {
      ...this.systemStats,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }

  async getHealthStatus() {
    if (this.systemStats.lastHealthCheck) {
      return this.systemStats.lastHealthCheck;
    }
    
    return await this.performHealthCheck();
  }

  // Middleware for Express.js
  getMetricsMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route ? req.route.path : req.path;
        
        metrics.httpRequestsTotal.inc({
          method: req.method,
          route,
          status_code: res.statusCode
        });
        
        metrics.httpRequestDuration.observe({
          method: req.method,
          route,
          status_code: res.statusCode
        }, duration);
      });
      
      next();
    };
  }

  // WebSocket metrics
  recordWebSocketConnection() {
    metrics.websocketConnections.inc();
  }

  recordWebSocketDisconnection() {
    metrics.websocketConnections.dec();
  }

  recordWebSocketMessage(type, event) {
    metrics.websocketMessages.inc({ type, event });
  }

  // Game metrics
  recordGameCreated(gameType) {
    metrics.gamesCreated.inc({ game_type: gameType });
  }

  recordGameCompleted(gameType, result, duration) {
    metrics.gamesCompleted.inc({ game_type: gameType, result });
    metrics.gameDuration.observe({ game_type: gameType }, duration);
  }

  // User metrics
  recordUserRegistration() {
    metrics.userRegistrations.inc();
  }

  recordUserLogin(status) {
    metrics.userLogins.inc({ status });
  }

  // Database metrics
  recordDatabaseQuery(operation, table, duration) {
    metrics.dbQueries.inc({ operation, table });
    metrics.dbQueryDuration.observe({ operation, table }, duration);
  }

  // Transaction metrics
  recordTransaction(type, status, amount, currency) {
    metrics.transactions.inc({ type, status });
    metrics.transactionAmount.observe({ type, currency }, amount);
  }

  // Security metrics
  recordSecurityEvent(eventType, severity) {
    metrics.securityEvents.inc({ event_type: eventType, severity });
  }

  recordFailedLogin(reason) {
    metrics.failedLogins.inc({ reason });
  }

  async close() {
    try {
      await redis.quit();
      logger.info('Monitoring service closed');
    } catch (error) {
      logger.error('Monitoring service close error:', error);
    }
  }
}

module.exports = {
  MonitoringService,
  logger,
  metrics
};