// ============================================================================
// NOTIFICATION SERVICE FOR PUSH NOTIFICATIONS AND EMAIL
// ============================================================================

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const Redis = require('ioredis');
const { Pool } = require('pg');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

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

// Initialize Firebase Admin SDK
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

// Initialize Email Transporter
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// ============================================================================
// NOTIFICATION TYPES AND TEMPLATES
// ============================================================================

const NOTIFICATION_TYPES = {
  GAME_INVITE: 'game_invite',
  GAME_STARTED: 'game_started',
  GAME_ENDED: 'game_ended',
  FRIEND_REQUEST: 'friend_request',
  FRIEND_ACCEPTED: 'friend_accepted',
  CLAN_INVITE: 'clan_invite',
  CLAN_ACCEPTED: 'clan_accepted',
  TOURNAMENT_STARTED: 'tournament_started',
  TOURNAMENT_REMINDER: 'tournament_reminder',
  DAILY_REWARD: 'daily_reward',
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
  LEVEL_UP: 'level_up',
  GIFT_RECEIVED: 'gift_received',
  MAINTENANCE: 'maintenance',
  SYSTEM_ANNOUNCEMENT: 'system_announcement',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILED: 'payment_failed',
  ACCOUNT_SECURITY: 'account_security',
  WEEKLY_REPORT: 'weekly_report'
};

const NOTIFICATION_TEMPLATES = {
  [NOTIFICATION_TYPES.GAME_INVITE]: {
    title: '{senderName} mengundang Anda bermain',
    body: 'Bergabunglah dalam permainan {gameMode}!',
    icon: 'game_invite',
    sound: 'game_invite.mp3',
    priority: 'high',
    category: 'game'
  },
  [NOTIFICATION_TYPES.GAME_STARTED]: {
    title: 'Permainan dimulai!',
    body: 'Giliran Anda untuk bermain',
    icon: 'game_start',
    sound: 'game_start.mp3',
    priority: 'high',
    category: 'game'
  },
  [NOTIFICATION_TYPES.FRIEND_REQUEST]: {
    title: 'Permintaan pertemanan baru',
    body: '{senderName} ingin berteman dengan Anda',
    icon: 'friend_request',
    sound: 'notification.mp3',
    priority: 'normal',
    category: 'social'
  },
  [NOTIFICATION_TYPES.DAILY_REWARD]: {
    title: 'Hadiah harian tersedia!',
    body: 'Klaim hadiah harian Anda sekarang',
    icon: 'daily_reward',
    sound: 'reward.mp3',
    priority: 'normal',
    category: 'reward'
  },
  [NOTIFICATION_TYPES.ACHIEVEMENT_UNLOCKED]: {
    title: 'Pencapaian baru!',
    body: 'Anda telah membuka "{achievementName}"',
    icon: 'achievement',
    sound: 'achievement.mp3',
    priority: 'normal',
    category: 'achievement'
  },
  [NOTIFICATION_TYPES.TOURNAMENT_STARTED]: {
    title: 'Turnamen dimulai!',
    body: 'Turnamen {tournamentName} telah dimulai',
    icon: 'tournament',
    sound: 'tournament.mp3',
    priority: 'high',
    category: 'tournament'
  },
  [NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT]: {
    title: 'Pengumuman Sistem',
    body: '{message}',
    icon: 'announcement',
    sound: 'announcement.mp3',
    priority: 'high',
    category: 'system'
  }
};

// ============================================================================
// NOTIFICATION SERVICE CLASS
// ============================================================================

class NotificationService {
  constructor() {
    this.isInitialized = false;
    this.init();
  }

  async init() {
    try {
      // Test database connection
      await pool.query('SELECT 1');
      console.log('Notification service database connected');
      
      // Test Redis connection
      await redis.ping();
      console.log('Notification service Redis connected');
      
      // Test email connection
      if (process.env.SMTP_USER) {
        await emailTransporter.verify();
        console.log('Email service connected');
      }
      
      this.isInitialized = true;
      console.log('Notification service initialized successfully');
    } catch (error) {
      console.error('Notification service initialization error:', error);
    }
  }

  // ============================================================================
  // PUSH NOTIFICATION METHODS
  // ============================================================================

  async sendPushNotification(userId, notificationType, data = {}, options = {}) {
    try {
      // Get user's FCM tokens
      const tokens = await this.getUserFCMTokens(userId);
      if (!tokens || tokens.length === 0) {
        console.log(`No FCM tokens found for user ${userId}`);
        return { success: false, reason: 'no_tokens' };
      }

      // Check user notification preferences
      const preferences = await this.getUserNotificationPreferences(userId);
      if (!this.shouldSendNotification(notificationType, preferences)) {
        console.log(`Notification blocked by user preferences: ${notificationType}`);
        return { success: false, reason: 'blocked_by_preferences' };
      }

      // Get notification template
      const template = NOTIFICATION_TEMPLATES[notificationType];
      if (!template) {
        throw new Error(`Unknown notification type: ${notificationType}`);
      }

      // Build notification payload
      const notification = this.buildNotificationPayload(template, data, options);
      
      // Send to Firebase
      const results = await this.sendToFirebase(tokens, notification, data);
      
      // Log notification
      await this.logNotification(userId, notificationType, notification, results);
      
      // Clean up invalid tokens
      await this.cleanupInvalidTokens(userId, results);
      
      return {
        success: true,
        sentCount: results.successCount,
        failureCount: results.failureCount
      };
      
    } catch (error) {
      console.error('Send push notification error:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserFCMTokens(userId) {
    const query = `
      SELECT device_token 
      FROM user_devices 
      WHERE user_id = $1 
        AND is_active = true 
        AND device_token IS NOT NULL
        AND last_seen > NOW() - INTERVAL '30 days'
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows.map(row => row.device_token);
  }

  async getUserNotificationPreferences(userId) {
    const query = `
      SELECT notification_type, is_enabled, delivery_method
      FROM user_notification_preferences 
      WHERE user_id = $1
    `;
    
    const result = await pool.query(query, [userId]);
    const preferences = {};
    
    result.rows.forEach(row => {
      preferences[row.notification_type] = {
        enabled: row.is_enabled,
        method: row.delivery_method
      };
    });
    
    return preferences;
  }

  shouldSendNotification(notificationType, preferences) {
    const pref = preferences[notificationType];
    if (!pref) return true; // Default to enabled if no preference set
    
    return pref.enabled && (pref.method === 'push' || pref.method === 'both');
  }

  buildNotificationPayload(template, data, options) {
    // Replace placeholders in title and body
    let title = template.title;
    let body = template.body;
    
    Object.keys(data).forEach(key => {
      const placeholder = `{${key}}`;
      title = title.replace(new RegExp(placeholder, 'g'), data[key]);
      body = body.replace(new RegExp(placeholder, 'g'), data[key]);
    });
    
    return {
      notification: {
        title,
        body,
        icon: template.icon,
        sound: template.sound
      },
      android: {
        priority: template.priority,
        notification: {
          channelId: template.category,
          priority: template.priority,
          defaultSound: true,
          defaultVibrateTimings: true
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title,
              body
            },
            sound: template.sound,
            badge: options.badge || 1,
            category: template.category
          }
        }
      },
      data: {
        type: options.type || 'notification',
        ...data
      }
    };
  }

  async sendToFirebase(tokens, notification, data) {
    if (!admin.apps.length) {
      throw new Error('Firebase not initialized');
    }

    const message = {
      ...notification,
      tokens
    };

    const response = await admin.messaging().sendMulticast(message);
    
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses
    };
  }

  async logNotification(userId, type, notification, results) {
    const query = `
      INSERT INTO user_notifications (
        id, user_id, notification_type, title, message, 
        data, delivery_status, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `;
    
    const status = results.successCount > 0 ? 'sent' : 'failed';
    
    await pool.query(query, [
      uuidv4(),
      userId,
      type,
      notification.notification.title,
      notification.notification.body,
      JSON.stringify(notification.data),
      status
    ]);
  }

  async cleanupInvalidTokens(userId, results) {
    const invalidTokens = [];
    
    results.responses.forEach((response, index) => {
      if (!response.success) {
        const error = response.error;
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(index);
        }
      }
    });
    
    if (invalidTokens.length > 0) {
      const query = `
        UPDATE user_devices 
        SET is_active = false, updated_at = NOW()
        WHERE user_id = $1 AND device_token = ANY($2)
      `;
      
      await pool.query(query, [userId, invalidTokens]);
    }
  }

  // ============================================================================
  // EMAIL NOTIFICATION METHODS
  // ============================================================================

  async sendEmailNotification(userId, notificationType, data = {}, options = {}) {
    try {
      // Get user email and preferences
      const userInfo = await this.getUserEmailInfo(userId);
      if (!userInfo || !userInfo.email) {
        return { success: false, reason: 'no_email' };
      }

      // Check email preferences
      const preferences = await this.getUserNotificationPreferences(userId);
      if (!this.shouldSendEmail(notificationType, preferences)) {
        return { success: false, reason: 'blocked_by_preferences' };
      }

      // Build email content
      const emailContent = await this.buildEmailContent(notificationType, data, userInfo);
      
      // Send email
      const result = await this.sendEmail(userInfo.email, emailContent, options);
      
      // Log email notification
      await this.logEmailNotification(userId, notificationType, emailContent, result);
      
      return result;
      
    } catch (error) {
      console.error('Send email notification error:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserEmailInfo(userId) {
    const query = `
      SELECT email, username, preferred_language
      FROM users 
      WHERE id = $1 AND email_verified = true
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  shouldSendEmail(notificationType, preferences) {
    const pref = preferences[notificationType];
    if (!pref) return false; // Default to disabled for email
    
    return pref.enabled && (pref.method === 'email' || pref.method === 'both');
  }

  async buildEmailContent(notificationType, data, userInfo) {
    const templates = {
      [NOTIFICATION_TYPES.WEEKLY_REPORT]: {
        subject: 'Laporan Mingguan Higgs Domino',
        template: 'weekly_report'
      },
      [NOTIFICATION_TYPES.ACCOUNT_SECURITY]: {
        subject: 'Peringatan Keamanan Akun',
        template: 'security_alert'
      },
      [NOTIFICATION_TYPES.PAYMENT_SUCCESS]: {
        subject: 'Pembayaran Berhasil',
        template: 'payment_success'
      },
      [NOTIFICATION_TYPES.PAYMENT_FAILED]: {
        subject: 'Pembayaran Gagal',
        template: 'payment_failed'
      }
    };

    const template = templates[notificationType];
    if (!template) {
      throw new Error(`No email template for notification type: ${notificationType}`);
    }

    // Load HTML template
    const htmlContent = await this.loadEmailTemplate(template.template, {
      ...data,
      username: userInfo.username,
      language: userInfo.preferred_language || 'id'
    });

    return {
      subject: template.subject,
      html: htmlContent,
      text: this.htmlToText(htmlContent)
    };
  }

  async loadEmailTemplate(templateName, data) {
    // Simple template system - in production, use a proper template engine
    const templates = {
      weekly_report: `
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Higgs Domino</h1>
            <p style="color: white; margin: 5px 0;">Laporan Mingguan</p>
          </div>
          <div style="padding: 20px;">
            <h2>Halo, {username}!</h2>
            <p>Berikut adalah ringkasan aktivitas Anda minggu ini:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3>Statistik Permainan</h3>
              <ul>
                <li>Permainan dimainkan: {gamesPlayed}</li>
                <li>Kemenangan: {wins}</li>
                <li>Tingkat kemenangan: {winRate}%</li>
                <li>Poin yang diperoleh: {pointsEarned}</li>
              </ul>
            </div>
            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3>Pencapaian Baru</h3>
              <p>{newAchievements}</p>
            </div>
            <p>Terima kasih telah bermain Higgs Domino!</p>
          </div>
        </body>
        </html>
      `,
      security_alert: `
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc3545; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Peringatan Keamanan</h1>
          </div>
          <div style="padding: 20px;">
            <h2>Halo, {username}!</h2>
            <p style="color: #dc3545; font-weight: bold;">Kami mendeteksi aktivitas yang mencurigakan pada akun Anda.</p>
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3>Detail Aktivitas:</h3>
              <ul>
                <li>Waktu: {timestamp}</li>
                <li>Lokasi: {location}</li>
                <li>Perangkat: {device}</li>
                <li>IP Address: {ipAddress}</li>
              </ul>
            </div>
            <p>Jika ini bukan Anda, segera ubah password dan hubungi customer service.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="{changePasswordUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Ubah Password</a>
            </div>
          </div>
        </body>
        </html>
      `,
      payment_success: `
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #28a745; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Pembayaran Berhasil</h1>
          </div>
          <div style="padding: 20px;">
            <h2>Halo, {username}!</h2>
            <p>Pembayaran Anda telah berhasil diproses.</p>
            <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3>Detail Transaksi:</h3>
              <ul>
                <li>ID Transaksi: {transactionId}</li>
                <li>Jumlah: {amount}</li>
                <li>Metode Pembayaran: {paymentMethod}</li>
                <li>Tanggal: {date}</li>
              </ul>
            </div>
            <p>Item yang dibeli telah ditambahkan ke akun Anda. Selamat bermain!</p>
          </div>
        </body>
        </html>
      `
    };

    let template = templates[templateName] || '<p>Template not found</p>';
    
    // Replace placeholders
    Object.keys(data).forEach(key => {
      const placeholder = `{${key}}`;
      template = template.replace(new RegExp(placeholder, 'g'), data[key] || '');
    });

    return template;
  }

  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async sendEmail(to, content, options = {}) {
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@higgsdomino.com',
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      ...options
    };

    const result = await emailTransporter.sendMail(mailOptions);
    
    return {
      success: true,
      messageId: result.messageId,
      response: result.response
    };
  }

  async logEmailNotification(userId, type, content, result) {
    const query = `
      INSERT INTO push_delivery_log (
        id, user_id, notification_type, delivery_method,
        status, response_data, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;
    
    const status = result.success ? 'delivered' : 'failed';
    
    await pool.query(query, [
      uuidv4(),
      userId,
      type,
      'email',
      status,
      JSON.stringify(result)
    ]);
  }

  // ============================================================================
  // BULK NOTIFICATION METHODS
  // ============================================================================

  async sendBulkNotification(userIds, notificationType, data = {}, options = {}) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Process in batches to avoid overwhelming the system
    const batchSize = 100;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (userId) => {
        try {
          const result = await this.sendPushNotification(userId, notificationType, data, options);
          if (result.success) {
            results.success++;
          } else {
            results.failed++;
            results.errors.push({ userId, error: result.reason || result.error });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({ userId, error: error.message });
        }
      });

      await Promise.all(batchPromises);
      
      // Small delay between batches
      if (i + batchSize < userIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  async sendToAllUsers(notificationType, data = {}, options = {}) {
    // Get all active users
    const query = `
      SELECT id FROM users 
      WHERE is_active = true 
        AND last_login > NOW() - INTERVAL '30 days'
    `;
    
    const result = await pool.query(query);
    const userIds = result.rows.map(row => row.id);
    
    return await this.sendBulkNotification(userIds, notificationType, data, options);
  }

  // ============================================================================
  // SCHEDULED NOTIFICATIONS
  // ============================================================================

  async scheduleNotification(userId, notificationType, data, scheduledAt, options = {}) {
    const query = `
      INSERT INTO notification_jobs (
        id, user_id, notification_type, data, 
        scheduled_at, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
    `;
    
    const jobId = uuidv4();
    
    await pool.query(query, [
      jobId,
      userId,
      notificationType,
      JSON.stringify(data),
      scheduledAt
    ]);
    
    return { jobId, scheduledAt };
  }

  async processScheduledNotifications() {
    const query = `
      SELECT id, user_id, notification_type, data
      FROM notification_jobs 
      WHERE status = 'pending' 
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at
      LIMIT 100
    `;
    
    const result = await pool.query(query);
    
    for (const job of result.rows) {
      try {
        const data = JSON.parse(job.data);
        await this.sendPushNotification(job.user_id, job.notification_type, data);
        
        // Mark as completed
        await pool.query(
          'UPDATE notification_jobs SET status = $1, processed_at = NOW() WHERE id = $2',
          ['completed', job.id]
        );
        
      } catch (error) {
        console.error('Process scheduled notification error:', error);
        
        // Mark as failed
        await pool.query(
          'UPDATE notification_jobs SET status = $1, error_message = $2, processed_at = NOW() WHERE id = $3',
          ['failed', error.message, job.id]
        );
      }
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async updateUserNotificationPreferences(userId, preferences) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete existing preferences
      await client.query(
        'DELETE FROM user_notification_preferences WHERE user_id = $1',
        [userId]
      );
      
      // Insert new preferences
      for (const [type, settings] of Object.entries(preferences)) {
        await client.query(`
          INSERT INTO user_notification_preferences (
            user_id, notification_type, is_enabled, delivery_method
          ) VALUES ($1, $2, $3, $4)
        `, [userId, type, settings.enabled, settings.method]);
      }
      
      await client.query('COMMIT');
      return { success: true };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async registerDeviceToken(userId, deviceToken, deviceInfo = {}) {
    const query = `
      INSERT INTO user_devices (
        user_id, device_token, device_type, device_model,
        os_version, app_version, is_active, last_seen
      ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
      ON CONFLICT (user_id, device_token) 
      DO UPDATE SET 
        is_active = true,
        last_seen = NOW(),
        device_type = EXCLUDED.device_type,
        device_model = EXCLUDED.device_model,
        os_version = EXCLUDED.os_version,
        app_version = EXCLUDED.app_version
    `;
    
    await pool.query(query, [
      userId,
      deviceToken,
      deviceInfo.type || 'unknown',
      deviceInfo.model || 'unknown',
      deviceInfo.osVersion || 'unknown',
      deviceInfo.appVersion || '1.0.0'
    ]);
  }

  async unregisterDeviceToken(userId, deviceToken) {
    const query = `
      UPDATE user_devices 
      SET is_active = false, updated_at = NOW()
      WHERE user_id = $1 AND device_token = $2
    `;
    
    await pool.query(query, [userId, deviceToken]);
  }

  async getNotificationStats(userId, days = 7) {
    const query = `
      SELECT 
        notification_type,
        COUNT(*) as total,
        COUNT(CASE WHEN delivery_status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN delivery_status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN is_read = true THEN 1 END) as read
      FROM user_notifications 
      WHERE user_id = $1 
        AND sent_at > NOW() - INTERVAL '${days} days'
      GROUP BY notification_type
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows;
  }
}

// ============================================================================
// CRON JOBS FOR SCHEDULED TASKS
// ============================================================================

const notificationService = new NotificationService();

// Process scheduled notifications every minute
cron.schedule('* * * * *', async () => {
  if (notificationService.isInitialized) {
    await notificationService.processScheduledNotifications();
  }
});

// Send daily reward reminders at 9 AM
cron.schedule('0 9 * * *', async () => {
  if (notificationService.isInitialized) {
    console.log('Sending daily reward reminders...');
    
    // Get users who haven't claimed daily rewards
    const query = `
      SELECT u.id 
      FROM users u
      LEFT JOIN user_daily_claims udc ON u.id = udc.user_id 
        AND udc.claim_date = CURRENT_DATE
      WHERE u.is_active = true 
        AND u.last_login > NOW() - INTERVAL '7 days'
        AND udc.id IS NULL
    `;
    
    const result = await pool.query(query);
    const userIds = result.rows.map(row => row.id);
    
    if (userIds.length > 0) {
      await notificationService.sendBulkNotification(
        userIds,
        NOTIFICATION_TYPES.DAILY_REWARD,
        {}
      );
      console.log(`Sent daily reward reminders to ${userIds.length} users`);
    }
  }
});

// Send weekly reports on Sundays at 8 PM
cron.schedule('0 20 * * 0', async () => {
  if (notificationService.isInitialized) {
    console.log('Sending weekly reports...');
    
    // Get active users for weekly reports
    const query = `
      SELECT u.id, u.username,
        COUNT(gs.id) as games_played,
        COUNT(CASE WHEN gs.winner_id = u.id THEN 1 END) as wins,
        COALESCE(SUM(t.amount), 0) as points_earned
      FROM users u
      LEFT JOIN game_sessions gs ON u.id = ANY(gs.player_ids) 
        AND gs.ended_at > NOW() - INTERVAL '7 days'
      LEFT JOIN transactions t ON u.id = t.user_id 
        AND t.transaction_type = 'reward'
        AND t.created_at > NOW() - INTERVAL '7 days'
      WHERE u.is_active = true 
        AND u.last_login > NOW() - INTERVAL '7 days'
      GROUP BY u.id, u.username
      HAVING COUNT(gs.id) > 0
    `;
    
    const result = await pool.query(query);
    
    for (const user of result.rows) {
      const winRate = user.games_played > 0 
        ? Math.round((user.wins / user.games_played) * 100) 
        : 0;
      
      await notificationService.sendEmailNotification(
        user.id,
        NOTIFICATION_TYPES.WEEKLY_REPORT,
        {
          username: user.username,
          gamesPlayed: user.games_played,
          wins: user.wins,
          winRate: winRate,
          pointsEarned: user.points_earned,
          newAchievements: 'Lihat pencapaian terbaru di aplikasi'
        }
      );
    }
    
    console.log(`Sent weekly reports to ${result.rows.length} users`);
  }
});

// Clean up old notifications every day at 2 AM
cron.schedule('0 2 * * *', async () => {
  if (notificationService.isInitialized) {
    console.log('Cleaning up old notifications...');
    
    // Delete notifications older than 30 days
    await pool.query(`
      DELETE FROM user_notifications 
      WHERE sent_at < NOW() - INTERVAL '30 days'
    `);
    
    // Delete old delivery logs
    await pool.query(`
      DELETE FROM push_delivery_log 
      WHERE created_at < NOW() - INTERVAL '30 days'
    `);
    
    // Delete completed notification jobs older than 7 days
    await pool.query(`
      DELETE FROM notification_jobs 
      WHERE status IN ('completed', 'failed') 
        AND processed_at < NOW() - INTERVAL '7 days'
    `);
    
    console.log('Notification cleanup completed');
  }
});

module.exports = {
  NotificationService,
  notificationService,
  NOTIFICATION_TYPES
};