-- ============================================================================
-- ADVANCED FEATURES - ANALYTICS & REPORTING
-- ============================================================================

-- Game Analytics Tables
CREATE TABLE game_analytics (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    session_id UUID,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    device_info JSONB,
    location_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_game_analytics_user_id ON game_analytics(user_id);
CREATE INDEX idx_game_analytics_event_type ON game_analytics(event_type);
CREATE INDEX idx_game_analytics_created_at ON game_analytics(created_at);
CREATE INDEX idx_game_analytics_session_id ON game_analytics(session_id);

-- User Behavior Tracking
CREATE TABLE user_behavior_tracking (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    action_type VARCHAR(100) NOT NULL,
    screen_name VARCHAR(100),
    button_clicked VARCHAR(100),
    time_spent_seconds INTEGER,
    additional_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_behavior_user_id ON user_behavior_tracking(user_id);
CREATE INDEX idx_user_behavior_action_type ON user_behavior_tracking(action_type);
CREATE INDEX idx_user_behavior_created_at ON user_behavior_tracking(created_at);

-- Revenue Analytics
CREATE TABLE revenue_analytics (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    transaction_id BIGINT REFERENCES transactions(id),
    revenue_type VARCHAR(50) NOT NULL, -- 'iap', 'ads', 'subscription'
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    platform VARCHAR(20) NOT NULL, -- 'ios', 'android', 'web'
    country_code VARCHAR(2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_revenue_analytics_user_id ON revenue_analytics(user_id);
CREATE INDEX idx_revenue_analytics_revenue_type ON revenue_analytics(revenue_type);
CREATE INDEX idx_revenue_analytics_created_at ON revenue_analytics(created_at);
CREATE INDEX idx_revenue_analytics_platform ON revenue_analytics(platform);

-- ============================================================================
-- ADMIN PANEL & MODERATION
-- ============================================================================

-- Admin Users
CREATE TABLE admin_users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'moderator', -- 'super_admin', 'admin', 'moderator'
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_users_username ON admin_users(username);
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- Admin Action Logs
CREATE TABLE admin_action_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT REFERENCES admin_users(id),
    action_type VARCHAR(100) NOT NULL,
    target_type VARCHAR(50), -- 'user', 'game_session', 'transaction', etc.
    target_id BIGINT,
    description TEXT,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_action_logs_admin_id ON admin_action_logs(admin_id);
CREATE INDEX idx_admin_action_logs_action_type ON admin_action_logs(action_type);
CREATE INDEX idx_admin_action_logs_created_at ON admin_action_logs(created_at);

-- User Moderation
CREATE TABLE user_moderation_actions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    admin_id BIGINT REFERENCES admin_users(id),
    action_type VARCHAR(50) NOT NULL, -- 'warn', 'mute', 'ban', 'unban'
    reason TEXT NOT NULL,
    duration_hours INTEGER, -- NULL for permanent
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_moderation_user_id ON user_moderation_actions(user_id);
CREATE INDEX idx_user_moderation_action_type ON user_moderation_actions(action_type);
CREATE INDEX idx_user_moderation_expires_at ON user_moderation_actions(expires_at);

-- ============================================================================
-- ADVANCED GAME FEATURES
-- ============================================================================

-- Game Modes
CREATE TABLE game_modes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    rules JSONB NOT NULL,
    min_players INTEGER NOT NULL DEFAULT 2,
    max_players INTEGER NOT NULL DEFAULT 4,
    entry_fee_coins INTEGER DEFAULT 0,
    entry_fee_gems INTEGER DEFAULT 0,
    reward_multiplier DECIMAL(3,2) DEFAULT 1.0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seasonal Events
CREATE TABLE seasonal_events (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) NOT NULL, -- 'tournament', 'challenge', 'special_mode'
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    rules JSONB,
    rewards JSONB,
    participation_requirements JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_seasonal_events_start_date ON seasonal_events(start_date);
CREATE INDEX idx_seasonal_events_end_date ON seasonal_events(end_date);
CREATE INDEX idx_seasonal_events_event_type ON seasonal_events(event_type);

-- User Event Participation
CREATE TABLE user_event_participation (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    event_id INTEGER REFERENCES seasonal_events(id),
    progress JSONB DEFAULT '{}',
    rewards_claimed JSONB DEFAULT '[]',
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_user_event_participation_unique ON user_event_participation(user_id, event_id);

-- VIP System
CREATE TABLE vip_levels (
    id SERIAL PRIMARY KEY,
    level INTEGER UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    required_points INTEGER NOT NULL,
    benefits JSONB NOT NULL,
    monthly_rewards JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_vip_status (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) UNIQUE,
    current_level INTEGER REFERENCES vip_levels(id) DEFAULT 1,
    total_points INTEGER DEFAULT 0,
    monthly_rewards_claimed BOOLEAN DEFAULT false,
    last_reward_claim_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Lucky Wheel/Spin System
CREATE TABLE lucky_wheel_configs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    wheel_type VARCHAR(50) NOT NULL, -- 'daily', 'premium', 'event'
    cost_type VARCHAR(20), -- 'free', 'coins', 'gems'
    cost_amount INTEGER DEFAULT 0,
    cooldown_hours INTEGER DEFAULT 24,
    rewards JSONB NOT NULL, -- Array of rewards with probabilities
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_wheel_spins (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    wheel_config_id INTEGER REFERENCES lucky_wheel_configs(id),
    reward_received JSONB,
    next_spin_available_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_wheel_spins_user_id ON user_wheel_spins(user_id);
CREATE INDEX idx_user_wheel_spins_next_available ON user_wheel_spins(next_spin_available_at);

-- ============================================================================
-- ADVANCED SOCIAL FEATURES
-- ============================================================================

-- Guild Wars/Clan Battles
CREATE TABLE clan_battle_seasons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    rules JSONB,
    rewards JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clan_battles (
    id BIGSERIAL PRIMARY KEY,
    season_id INTEGER REFERENCES clan_battle_seasons(id),
    clan1_id BIGINT REFERENCES clans(id),
    clan2_id BIGINT REFERENCES clans(id),
    battle_type VARCHAR(50) NOT NULL, -- 'regular', 'tournament', 'championship'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'active', 'completed', 'cancelled'
    clan1_score INTEGER DEFAULT 0,
    clan2_score INTEGER DEFAULT 0,
    winner_clan_id BIGINT REFERENCES clans(id),
    battle_data JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clan_battles_season_id ON clan_battles(season_id);
CREATE INDEX idx_clan_battles_clan1_id ON clan_battles(clan1_id);
CREATE INDEX idx_clan_battles_clan2_id ON clan_battles(clan2_id);
CREATE INDEX idx_clan_battles_status ON clan_battles(status);

-- Mentorship System
CREATE TABLE mentorship_programs (
    id BIGSERIAL PRIMARY KEY,
    mentor_id BIGINT REFERENCES users(id),
    mentee_id BIGINT REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'cancelled'
    mentor_rewards JSONB,
    mentee_rewards JSONB,
    progress_milestones JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_mentorship_mentor_id ON mentorship_programs(mentor_id);
CREATE INDEX idx_mentorship_mentee_id ON mentorship_programs(mentee_id);
CREATE INDEX idx_mentorship_status ON mentorship_programs(status);

-- ============================================================================
-- PERFORMANCE & OPTIMIZATION
-- ============================================================================

-- Database Performance Monitoring
CREATE TABLE db_performance_logs (
    id BIGSERIAL PRIMARY KEY,
    query_type VARCHAR(100),
    execution_time_ms INTEGER,
    affected_rows INTEGER,
    query_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_db_performance_query_type ON db_performance_logs(query_type);
CREATE INDEX idx_db_performance_execution_time ON db_performance_logs(execution_time_ms);
CREATE INDEX idx_db_performance_created_at ON db_performance_logs(created_at);

-- Cache Management
CREATE TABLE cache_statistics (
    id BIGSERIAL PRIMARY KEY,
    cache_key VARCHAR(255) NOT NULL,
    hit_count INTEGER DEFAULT 0,
    miss_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_cache_statistics_key ON cache_statistics(cache_key);

-- ============================================================================
-- ADVANCED TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Function to calculate user engagement score
CREATE OR REPLACE FUNCTION calculate_user_engagement_score(p_user_id BIGINT)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    v_score DECIMAL(5,2) := 0;
    v_days_active INTEGER;
    v_games_played INTEGER;
    v_social_interactions INTEGER;
    v_purchases INTEGER;
BEGIN
    -- Calculate days active in last 30 days
    SELECT COUNT(DISTINCT DATE(created_at))
    INTO v_days_active
    FROM user_sessions
    WHERE user_id = p_user_id
    AND created_at >= CURRENT_DATE - INTERVAL '30 days';
    
    -- Calculate games played in last 30 days
    SELECT COUNT(*)
    INTO v_games_played
    FROM session_players sp
    JOIN game_sessions gs ON sp.session_id = gs.id
    WHERE sp.user_id = p_user_id
    AND gs.created_at >= CURRENT_DATE - INTERVAL '30 days';
    
    -- Calculate social interactions
    SELECT COUNT(*)
    INTO v_social_interactions
    FROM (
        SELECT created_at FROM chat_messages WHERE sender_id = p_user_id
        UNION ALL
        SELECT created_at FROM friendships WHERE user_id = p_user_id OR friend_id = p_user_id
        UNION ALL
        SELECT created_at FROM social_activities WHERE user_id = p_user_id
    ) social_data
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
    
    -- Calculate purchases
    SELECT COUNT(*)
    INTO v_purchases
    FROM user_purchases
    WHERE user_id = p_user_id
    AND created_at >= CURRENT_DATE - INTERVAL '30 days';
    
    -- Calculate weighted score
    v_score := (v_days_active * 2.0) + (v_games_played * 1.5) + (v_social_interactions * 1.0) + (v_purchases * 5.0);
    
    RETURN LEAST(v_score, 100.0); -- Cap at 100
END;
$$ LANGUAGE plpgsql;

-- Function to detect suspicious activity
CREATE OR REPLACE FUNCTION detect_suspicious_activity(p_user_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
    v_rapid_games INTEGER;
    v_unusual_wins INTEGER;
    v_rapid_purchases INTEGER;
BEGIN
    -- Check for rapid game completion
    SELECT COUNT(*)
    INTO v_rapid_games
    FROM session_players sp
    JOIN game_sessions gs ON sp.session_id = gs.id
    WHERE sp.user_id = p_user_id
    AND gs.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    AND gs.status = 'completed'
    AND gs.ended_at - gs.started_at < INTERVAL '2 minutes';
    
    -- Check for unusual win rate
    SELECT COUNT(*)
    INTO v_unusual_wins
    FROM session_players sp
    JOIN game_sessions gs ON sp.session_id = gs.id
    WHERE sp.user_id = p_user_id
    AND gs.created_at >= CURRENT_DATE - INTERVAL '1 day'
    AND sp.final_position = 1;
    
    -- Check for rapid purchases
    SELECT COUNT(*)
    INTO v_rapid_purchases
    FROM user_purchases
    WHERE user_id = p_user_id
    AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour';
    
    -- Return true if any suspicious pattern detected
    RETURN (v_rapid_games > 20 OR v_unusual_wins > 50 OR v_rapid_purchases > 10);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update user engagement score
CREATE OR REPLACE FUNCTION update_user_engagement_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user stats with new engagement score
    UPDATE user_stats
    SET engagement_score = calculate_user_engagement_score(NEW.user_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply engagement trigger to relevant tables
CREATE TRIGGER trigger_update_engagement_sessions
    AFTER INSERT ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_engagement_trigger();

CREATE TRIGGER trigger_update_engagement_games
    AFTER INSERT ON session_players
    FOR EACH ROW
    EXECUTE FUNCTION update_user_engagement_trigger();

-- ============================================================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================================================

-- Daily Active Users
CREATE MATERIALIZED VIEW daily_active_users AS
SELECT 
    DATE(created_at) as date,
    COUNT(DISTINCT user_id) as dau,
    COUNT(DISTINCT CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN user_id END) as returning_users,
    COUNT(DISTINCT CASE WHEN (SELECT MIN(created_at) FROM user_sessions us2 WHERE us2.user_id = us1.user_id) = DATE(us1.created_at) THEN user_id END) as new_users
FROM user_sessions us1
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

CREATE UNIQUE INDEX idx_dau_date ON daily_active_users(date);

-- Revenue Summary
CREATE MATERIALIZED VIEW revenue_summary AS
SELECT 
    DATE(created_at) as date,
    revenue_type,
    platform,
    COUNT(*) as transaction_count,
    SUM(amount) as total_revenue,
    AVG(amount) as avg_transaction_value
FROM revenue_analytics
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at), revenue_type, platform
ORDER BY date DESC, revenue_type, platform;

CREATE INDEX idx_revenue_summary_date ON revenue_summary(date);
CREATE INDEX idx_revenue_summary_type ON revenue_summary(revenue_type);

-- Game Performance Metrics
CREATE MATERIALIZED VIEW game_performance_metrics AS
SELECT 
    DATE(gs.created_at) as date,
    rt.name as room_type,
    COUNT(*) as games_played,
    AVG(EXTRACT(EPOCH FROM (gs.ended_at - gs.started_at))/60) as avg_game_duration_minutes,
    COUNT(CASE WHEN gs.status = 'completed' THEN 1 END) as completed_games,
    COUNT(CASE WHEN gs.status = 'abandoned' THEN 1 END) as abandoned_games,
    ROUND(COUNT(CASE WHEN gs.status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 2) as completion_rate
FROM game_sessions gs
JOIN game_rooms gr ON gs.room_id = gr.id
JOIN room_types rt ON gr.room_type_id = rt.id
WHERE gs.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(gs.created_at), rt.name
ORDER BY date DESC, room_type;

CREATE INDEX idx_game_performance_date ON game_performance_metrics(date);
CREATE INDEX idx_game_performance_room_type ON game_performance_metrics(room_type);

-- Refresh materialized views function
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_active_users;
    REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_performance_metrics;
END;
$$ LANGUAGE plpgsql;

-- Schedule to refresh views (to be called by cron job)
CREATE OR REPLACE FUNCTION schedule_view_refresh()
RETURNS VOID AS $$
BEGIN
    -- This would typically be called by a cron job or scheduler
    PERFORM refresh_analytics_views();
    
    -- Log the refresh
    INSERT INTO admin_action_logs (admin_id, action_type, description)
    VALUES (NULL, 'system_refresh', 'Materialized views refreshed automatically');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DATA RETENTION POLICIES
-- ============================================================================

-- Function to clean old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS VOID AS $$
BEGIN
    -- Delete old game analytics (older than 1 year)
    DELETE FROM game_analytics WHERE created_at < CURRENT_DATE - INTERVAL '1 year';
    
    -- Delete old user behavior tracking (older than 6 months)
    DELETE FROM user_behavior_tracking WHERE created_at < CURRENT_DATE - INTERVAL '6 months';
    
    -- Delete old performance logs (older than 3 months)
    DELETE FROM db_performance_logs WHERE created_at < CURRENT_DATE - INTERVAL '3 months';
    
    -- Delete old user sessions (older than 1 year)
    DELETE FROM user_sessions WHERE created_at < CURRENT_DATE - INTERVAL '1 year';
    
    -- Delete old chat messages (older than 6 months)
    DELETE FROM chat_messages WHERE created_at < CURRENT_DATE - INTERVAL '6 months';
    
    -- Archive old completed game sessions (older than 6 months)
    -- Move to archive table instead of deleting
    INSERT INTO game_sessions_archive 
    SELECT * FROM game_sessions 
    WHERE status = 'completed' AND created_at < CURRENT_DATE - INTERVAL '6 months';
    
    DELETE FROM game_sessions 
    WHERE status = 'completed' AND created_at < CURRENT_DATE - INTERVAL '6 months';
    
    -- Log cleanup action
    INSERT INTO admin_action_logs (admin_id, action_type, description)
    VALUES (NULL, 'system_cleanup', 'Automated data cleanup completed');
END;
$$ LANGUAGE plpgsql;

-- Archive table for old game sessions
CREATE TABLE game_sessions_archive (
    LIKE game_sessions INCLUDING ALL
);

-- ============================================================================
-- SECURITY ENHANCEMENTS
-- ============================================================================

-- Failed login attempts tracking
CREATE TABLE failed_login_attempts (
    id BIGSERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- email, username, or IP
    identifier_type VARCHAR(20) NOT NULL, -- 'email', 'username', 'ip'
    attempt_count INTEGER DEFAULT 1,
    last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    blocked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_failed_login_identifier ON failed_login_attempts(identifier, identifier_type);
CREATE INDEX idx_failed_login_blocked_until ON failed_login_attempts(blocked_until);

-- API Rate Limiting
CREATE TABLE api_rate_limits (
    id BIGSERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- user_id, IP, or API key
    identifier_type VARCHAR(20) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    blocked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_api_rate_limits_unique ON api_rate_limits(identifier, identifier_type, endpoint);
CREATE INDEX idx_api_rate_limits_window_start ON api_rate_limits(window_start);

-- Security audit log
CREATE TABLE security_audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    description TEXT,
    ip_address INET,
    user_agent TEXT,
    additional_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_security_audit_user_id ON security_audit_log(user_id);
CREATE INDEX idx_security_audit_event_type ON security_audit_log(event_type);
CREATE INDEX idx_security_audit_severity ON security_audit_log(severity);
CREATE INDEX idx_security_audit_created_at ON security_audit_log(created_at);

COMMIT;