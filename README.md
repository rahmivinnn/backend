# Higgs Domino Database Setup

A comprehensive PostgreSQL database schema for a Higgs Domino gaming platform with user management, game mechanics, social features, and analytics.

## 🚀 Quick Start

### Prerequisites
- PostgreSQL 12+ with UUID extension
- `pgcrypto` extension for password hashing
- Superuser privileges for initial setup

### Installation

1. **Create Database**
   ```bash
   createdb higgs_domino
   ```

2. **Run Setup Script**
   ```bash
   psql -d higgs_domino -f database/setup.sql
   ```

3. **Verify Installation**
   ```sql
   SELECT version, description, applied_at FROM schema_migrations ORDER BY applied_at;
   ```

## 📊 Database Schema Overview

### Core Tables

#### User Management
- **users** - Core user accounts with authentication
- **user_profiles** - Extended user information and preferences
- **user_wallets** - Multi-currency wallet system
- **user_vip_status** - VIP level tracking and benefits
- **user_sessions** - Session management and security

#### Gaming System
- **games** - Available game types and configurations
- **game_rooms** - Active game instances
- **game_sessions** - Individual player sessions
- **game_statistics** - Player performance metrics

#### Social Features
- **friendships** - Friend relationships and status
- **messages** - In-game messaging system
- **notifications** - System and user notifications
- **user_reports** - User reporting and moderation

#### Economy & Rewards
- **transactions** - Financial transaction history
- **achievements** - Achievement definitions
- **user_achievements** - Player achievement progress
- **tournaments** - Tournament management
- **subscriptions** - Premium subscription handling

### Key Features

✅ **Multi-currency wallet system**  
✅ **VIP level progression**  
✅ **Achievement system**  
✅ **Tournament management**  
✅ **Social features (friends, messaging)**  
✅ **Comprehensive audit logging**  
✅ **Real-time statistics**  
✅ **Automated data cleanup**  

## 🔧 Configuration

### Default Credentials
- **Admin Username**: `admin`
- **Admin Password**: `admin123`
- **Admin Email**: `admin@higgsdomino.com`

⚠️ **SECURITY WARNING**: Change the default admin password immediately after setup!

### Database Roles
- **higgs_app** - Application role with full CRUD permissions
- **higgs_readonly** - Read-only role for analytics and reporting

## 📈 Views and Analytics

### Standard Views
- `user_summary` - Complete user information with wallet and VIP status
- `game_room_summary` - Active games with creator and game details
- `transaction_summary` - Transaction history with user context
- `active_games` - Currently available games
- `user_achievements_progress` - Achievement completion status
- `tournament_leaderboard` - Tournament rankings

### Materialized Views (Performance Optimized)
- `user_leaderboard` - Player rankings by net winnings
- `daily_statistics` - Daily platform usage metrics
- `game_performance` - Game-specific performance analytics

## 🛠️ Utility Functions

### User Management
```sql
-- Get user's friends list
SELECT * FROM get_user_friends('user-uuid-here');

-- Get user's game statistics
SELECT * FROM get_user_game_stats('user-uuid-here');

-- Get user's recent activity
SELECT * FROM get_user_recent_activity('user-uuid-here', 20);
```

### Leaderboards
```sql
-- Get top 10 players
SELECT * FROM get_top_players(10);

-- Get user's rank
SELECT get_user_rank('user-uuid-here');
```

### System Maintenance
```sql
-- Refresh all materialized views
SELECT refresh_all_materialized_views();

-- Clean up old data (90 days)
SELECT * FROM cleanup_old_data(90);

-- Run scheduled maintenance
SELECT scheduled_maintenance();
```

### Notifications
```sql
-- Send notification to user
SELECT send_notification(
    'user-uuid-here',
    'achievement'::notification_type,
    'Achievement Unlocked!',
    'You have completed the "First Win" achievement.',
    '{"achievement_id": "uuid-here"}'
);
```

## 🔒 Security Features

- **Password Hashing**: bcrypt with salt using pgcrypto
- **Session Management**: Secure token-based sessions with expiration
- **Audit Logging**: Comprehensive action tracking
- **Role-based Access**: Separate roles for application and read-only access
- **Data Validation**: Constraints and triggers for data integrity

## 📊 Sample Queries

### Get Active Players
```sql
SELECT 
    u.username,
    up.display_name,
    u.last_login,
    uw.balance as coins
FROM users u
JOIN user_profiles up ON up.user_id = u.id
JOIN user_wallets uw ON uw.user_id = u.id AND uw.currency = 'COINS'
WHERE u.status = 'active'
ORDER BY u.last_login DESC;
```

### Game Performance Report
```sql
SELECT 
    g.name,
    COUNT(DISTINCT gs.user_id) as unique_players,
    COUNT(gs.id) as total_sessions,
    AVG(gs.buy_in) as avg_buy_in,
    SUM(gs.buy_in) as total_volume
FROM games g
JOIN game_rooms gr ON gr.game_id = g.id
JOIN game_sessions gs ON gs.room_id = gr.id
WHERE gs.created_at >= NOW() - INTERVAL '30 days'
GROUP BY g.id, g.name
ORDER BY total_volume DESC;
```

### User Engagement Metrics
```sql
SELECT 
    DATE(gs.created_at) as game_date,
    COUNT(DISTINCT gs.user_id) as daily_active_users,
    COUNT(gs.id) as total_sessions,
    AVG(gs.buy_in) as avg_session_value
FROM game_sessions gs
WHERE gs.created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(gs.created_at)
ORDER BY game_date DESC;
```

## 🔄 Maintenance

### Regular Tasks
1. **Daily**: Refresh materialized views
2. **Weekly**: Clean up expired sessions
3. **Monthly**: Archive old audit logs
4. **Quarterly**: Analyze and optimize indexes

### Automated Maintenance
The database includes a `scheduled_maintenance()` function that can be called via cron:

```bash
# Add to crontab for daily maintenance at 2 AM
0 2 * * * psql -d higgs_domino -c "SELECT scheduled_maintenance();"
```

## 📝 Migration System

The database uses a migration system to track schema changes:

- **Migration 001**: Core user and game tables
- **Migration 002**: Economy, achievements, and tournaments
- **Migration 003**: Social features and audit logging
- **Migration 004**: Views and utility functions

Each migration is idempotent and can be safely re-run.

## 🚨 Troubleshooting

### Common Issues

1. **Permission Denied**
   ```sql
   -- Grant necessary permissions
   GRANT ALL PRIVILEGES ON DATABASE higgs_domino TO your_user;
   ```

2. **Extension Not Found**
   ```sql
   -- Install required extensions
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS "pgcrypto";
   ```

3. **Materialized View Refresh Fails**
   ```sql
   -- Refresh without CONCURRENTLY if needed
   REFRESH MATERIALIZED VIEW user_leaderboard;
   ```

### Performance Optimization

1. **Monitor Query Performance**
   ```sql
   -- Enable query logging
   ALTER SYSTEM SET log_statement = 'all';
   ALTER SYSTEM SET log_min_duration_statement = 1000;
   ```

2. **Index Usage Analysis**
   ```sql
   -- Check index usage
   SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
   FROM pg_stat_user_indexes
   ORDER BY idx_scan DESC;
   ```

## 🐳 Docker Deployment

### Structure
- `docker/` - Docker configuration files
- `helm-chart/` - Kubernetes Helm chart for deployment

### Deploy with Docker
```bash
docker-compose up -d
```

### Deploy with Helm
```bash
helm install higgs-domino ./helm-chart
```

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the PostgreSQL logs for error details
3. Verify all prerequisites are installed
4. Ensure proper database permissions

## 📄 License

This database schema is provided as-is for educational and development purposes.

---

**Last Updated**: December 2024  
**Schema Version**: 1.0.0  
**PostgreSQL Compatibility**: 12+