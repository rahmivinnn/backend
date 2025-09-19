-- Migration: 004_views_and_final_setup.sql
-- Description: Add views, materialized views, and final database setup
-- Created: 2024-01-01
-- Author: Database Team
-- Depends on: 003_social_features.sql

BEGIN;

-- Check if migration has already been run
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '004') THEN
        RAISE EXCEPTION 'Migration 004 has already been applied';
    END IF;
END
$$;

-- User summary view
CREATE VIEW user_summary AS
SELECT 
    u.id,
    u.username,
    u.email,
    u.status,
    u.role,
    u.created_at,
    u.last_login_at,
    u.avatar_url,
    up.display_name,
    up.bio,
    up.country,
    up.timezone,
    up.language,
    up.date_of_birth,
    up.phone_number,
    uw.balance as coin_balance,
    uw.bonus_balance,
    uvs.level_id as vip_level,
    vl.name as vip_level_name,
    uvs.points as vip_points,
    uvs.cashback_rate,
    (u.last_login_at > NOW() - INTERVAL '15 minutes') as is_online
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
LEFT JOIN user_wallets uw ON u.id = uw.user_id AND uw.currency = 'COINS'
LEFT JOIN user_vip_status uvs ON u.id = uvs.user_id
LEFT JOIN vip_levels vl ON uvs.level_id = vl.id;

-- Game room summary view
CREATE VIEW game_room_summary AS
SELECT 
    gr.id,
    gr.name,
    gr.status,
    gr.current_players,
    gr.max_players,
    gr.min_bet,
    gr.max_bet,
    gr.created_at,
    gr.started_at,
    g.name as game_name,
    g.type as game_type,
    g.description as game_description,
    u.username as creator_username,
    u.avatar_url as creator_avatar
FROM game_rooms gr
JOIN games g ON gr.game_id = g.id
JOIN users u ON gr.created_by = u.id;

-- Transaction summary view
CREATE VIEW transaction_summary AS
SELECT 
    t.id,
    t.type,
    t.status,
    t.amount,
    t.currency,
    t.description,
    t.created_at,
    t.processed_at,
    u.username,
    u.email,
    t.reference_id,
    t.payment_method,
    t.metadata
FROM transactions t
JOIN users u ON t.user_id = u.id;

-- Active games view
CREATE VIEW active_games AS
SELECT 
    gr.id as room_id,
    gr.name as room_name,
    g.name as game_name,
    g.type as game_type,
    gr.current_players,
    gr.max_players,
    gr.min_bet,
    gr.max_bet,
    gr.started_at,
    COUNT(gs.id) as active_sessions
FROM game_rooms gr
JOIN games g ON gr.game_id = g.id
LEFT JOIN game_sessions gs ON gr.id = gs.room_id AND gs.status = 'active'
WHERE gr.status IN ('waiting', 'active')
GROUP BY gr.id, gr.name, g.name, g.type, gr.current_players, gr.max_players, gr.min_bet, gr.max_bet, gr.started_at;

-- User achievements progress view
CREATE VIEW user_achievements_progress AS
SELECT 
    ua.user_id,
    u.username,
    a.id as achievement_id,
    a.name as achievement_name,
    a.description,
    a.category,
    a.points as achievement_points,
    ua.progress,
    ua.completed_at,
    ua.claimed_at,
    CASE 
        WHEN ua.completed_at IS NOT NULL THEN 'completed'
        WHEN ua.progress >= a.requirement_value THEN 'ready_to_claim'
        ELSE 'in_progress'
    END as status,
    (ua.progress::FLOAT / a.requirement_value * 100) as progress_percentage
FROM user_achievements ua
JOIN users u ON ua.user_id = u.id
JOIN achievements a ON ua.achievement_id = a.id;

-- Tournament leaderboard view
CREATE VIEW tournament_leaderboard AS
SELECT 
    tp.tournament_id,
    t.name as tournament_name,
    tp.user_id,
    u.username,
    u.avatar_url,
    tp.position,
    tp.score,
    tp.prize_amount,
    tp.joined_at,
    ROW_NUMBER() OVER (PARTITION BY tp.tournament_id ORDER BY tp.score DESC, tp.joined_at ASC) as rank
FROM tournament_participants tp
JOIN tournaments t ON tp.tournament_id = t.id
JOIN users u ON tp.user_id = u.id
WHERE tp.position IS NOT NULL
ORDER BY tp.tournament_id, tp.score DESC;

-- User leaderboard materialized view
CREATE MATERIALIZED VIEW user_leaderboard AS
SELECT 
    u.id as user_id,
    u.username,
    u.avatar_url,
    uvs.level_id as vip_level,
    vl.name as vip_level_name,
    COALESCE(SUM(gs.games_won), 0) as total_wins,
    COALESCE(SUM(gs.games_played), 0) as total_games,
    COALESCE(SUM(gs.total_win_amount - gs.total_bet_amount), 0) as net_winnings,
    COALESCE(MAX(gs.longest_win_streak), 0) as best_win_streak,
    COALESCE(SUM(gs.total_win_amount), 0) as total_winnings,
    CASE 
        WHEN SUM(gs.games_played) > 0 THEN 
            ROUND((SUM(gs.games_won)::FLOAT / SUM(gs.games_played) * 100), 2)
        ELSE 0
    END as win_rate,
    ROW_NUMBER() OVER (ORDER BY SUM(gs.total_win_amount - gs.total_bet_amount) DESC) as rank,
    u.last_login_at
FROM users u
LEFT JOIN game_statistics gs ON u.id = gs.user_id
LEFT JOIN user_vip_status uvs ON u.id = uvs.user_id
LEFT JOIN vip_levels vl ON uvs.level_id = vl.id
WHERE u.status = 'active'
GROUP BY u.id, u.username, u.avatar_url, uvs.level_id, vl.name, u.last_login_at
HAVING SUM(gs.games_played) > 0
ORDER BY net_winnings DESC;

-- Create unique index on materialized view
CREATE UNIQUE INDEX idx_user_leaderboard_user_id ON user_leaderboard(user_id);
CREATE INDEX idx_user_leaderboard_rank ON user_leaderboard(rank);
CREATE INDEX idx_user_leaderboard_winnings ON user_leaderboard(net_winnings DESC);

-- Daily statistics materialized view
CREATE MATERIALIZED VIEW daily_statistics AS
SELECT 
    DATE(created_at) as date,
    COUNT(DISTINCT CASE WHEN type = 'registration' THEN user_id END) as new_users,
    COUNT(DISTINCT CASE WHEN type = 'login' THEN user_id END) as active_users,
    COUNT(CASE WHEN type = 'bet' THEN 1 END) as total_bets,
    COALESCE(SUM(CASE WHEN type = 'bet' THEN amount END), 0) as total_bet_amount,
    COALESCE(SUM(CASE WHEN type = 'win' THEN amount END), 0) as total_win_amount,
    COUNT(CASE WHEN type = 'deposit' THEN 1 END) as total_deposits,
    COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount END), 0) as total_deposit_amount,
    COUNT(CASE WHEN type = 'withdrawal' THEN 1 END) as total_withdrawals,
    COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount END), 0) as total_withdrawal_amount
FROM audit_logs
WHERE action IN ('registration', 'login') OR resource_type = 'transaction'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Create index on daily statistics
CREATE UNIQUE INDEX idx_daily_statistics_date ON daily_statistics(date);

-- Game performance materialized view
CREATE MATERIALIZED VIEW game_performance AS
SELECT 
    g.id as game_id,
    g.name as game_name,
    g.type as game_type,
    COUNT(DISTINCT gr.id) as total_rooms_created,
    COUNT(DISTINCT gs.user_id) as unique_players,
    SUM(gs.games_played) as total_games_played,
    AVG(gs.games_played) as avg_games_per_player,
    SUM(gs.total_bet_amount) as total_revenue,
    SUM(gs.total_win_amount) as total_payouts,
    (SUM(gs.total_bet_amount) - SUM(gs.total_win_amount)) as house_edge,
    CASE 
        WHEN SUM(gs.total_bet_amount) > 0 THEN 
            ROUND(((SUM(gs.total_bet_amount) - SUM(gs.total_win_amount)) / SUM(gs.total_bet_amount) * 100), 2)
        ELSE 0
    END as house_edge_percentage,
    AVG(CASE WHEN gs.games_played > 0 THEN (gs.games_won::FLOAT / gs.games_played * 100) END) as avg_win_rate
FROM games g
LEFT JOIN game_rooms gr ON g.id = gr.game_id
LEFT JOIN game_sessions gs ON gr.id = gs.room_id
LEFT JOIN game_statistics gst ON g.type = gst.game_type
GROUP BY g.id, g.name, g.type
ORDER BY total_revenue DESC;

-- Create index on game performance
CREATE UNIQUE INDEX idx_game_performance_game_id ON game_performance(game_id);
CREATE INDEX idx_game_performance_revenue ON game_performance(total_revenue DESC);

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_leaderboard;
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_statistics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_performance;
    
    -- Log the refresh
    INSERT INTO audit_logs (action, resource_type, new_values)
    VALUES ('refresh_materialized_views', 'system', 
            jsonb_build_object('refreshed_at', NOW(), 'views', ARRAY['user_leaderboard', 'daily_statistics', 'game_performance']));
END;
$$ LANGUAGE plpgsql;

-- Function to get user rank
CREATE OR REPLACE FUNCTION get_user_rank(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    user_rank INTEGER;
BEGIN
    SELECT rank INTO user_rank
    FROM user_leaderboard
    WHERE user_id = p_user_id;
    
    RETURN COALESCE(user_rank, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get top players
CREATE OR REPLACE FUNCTION get_top_players(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(
    rank INTEGER,
    user_id UUID,
    username VARCHAR(50),
    avatar_url TEXT,
    vip_level_name VARCHAR(50),
    total_wins BIGINT,
    net_winnings DECIMAL(15,2),
    win_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ul.rank::INTEGER,
        ul.user_id,
        ul.username,
        ul.avatar_url,
        ul.vip_level_name,
        ul.total_wins,
        ul.net_winnings,
        ul.win_rate
    FROM user_leaderboard ul
    ORDER BY ul.rank
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get game statistics for a user
CREATE OR REPLACE FUNCTION get_user_game_stats(p_user_id UUID)
RETURNS TABLE(
    game_type VARCHAR(50),
    games_played INTEGER,
    games_won INTEGER,
    win_rate NUMERIC,
    total_bet_amount DECIMAL(15,2),
    total_win_amount DECIMAL(15,2),
    net_profit DECIMAL(15,2),
    biggest_win DECIMAL(15,2),
    longest_win_streak INTEGER,
    current_win_streak INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gs.game_type,
        gs.games_played,
        gs.games_won,
        CASE 
            WHEN gs.games_played > 0 THEN 
                ROUND((gs.games_won::FLOAT / gs.games_played * 100), 2)
            ELSE 0
        END as win_rate,
        gs.total_bet_amount,
        gs.total_win_amount,
        (gs.total_win_amount - gs.total_bet_amount) as net_profit,
        gs.biggest_win,
        gs.longest_win_streak,
        gs.current_win_streak
    FROM game_statistics gs
    WHERE gs.user_id = p_user_id
    ORDER BY gs.games_played DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent activity for a user
CREATE OR REPLACE FUNCTION get_user_recent_activity(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    activity_type VARCHAR(50),
    description TEXT,
    amount DECIMAL(15,2),
    created_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    (
        SELECT 
            'transaction'::VARCHAR(50) as activity_type,
            t.description,
            t.amount,
            t.created_at,
            t.metadata
        FROM transactions t
        WHERE t.user_id = p_user_id
        
        UNION ALL
        
        SELECT 
            'achievement'::VARCHAR(50) as activity_type,
            ('Achievement completed: ' || a.name) as description,
            a.points::DECIMAL(15,2) as amount,
            ua.completed_at as created_at,
            jsonb_build_object('achievement_id', a.id, 'category', a.category) as metadata
        FROM user_achievements ua
        JOIN achievements a ON ua.achievement_id = a.id
        WHERE ua.user_id = p_user_id AND ua.completed_at IS NOT NULL
        
        UNION ALL
        
        SELECT 
            'game'::VARCHAR(50) as activity_type,
            ('Game session in ' || gr.name) as description,
            gs.final_balance as amount,
            gs.ended_at as created_at,
            jsonb_build_object('room_id', gr.id, 'game_type', g.type) as metadata
        FROM game_sessions gs
        JOIN game_rooms gr ON gs.room_id = gr.id
        JOIN games g ON gr.game_id = g.id
        WHERE gs.user_id = p_user_id AND gs.ended_at IS NOT NULL
    )
    ORDER BY created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
    table_name TEXT,
    deleted_count INTEGER
) AS $$
DECLARE
    rec RECORD;
    deleted_count INTEGER;
BEGIN
    -- Clean up old audit logs (older than 1 year)
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '1 year';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN QUERY SELECT 'audit_logs'::TEXT, deleted_count;
    
    -- Clean up old messages (older than 6 months)
    DELETE FROM messages WHERE sent_at < NOW() - INTERVAL '6 months' AND is_deleted = true;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN QUERY SELECT 'messages'::TEXT, deleted_count;
    
    -- Clean up old notifications (older than 3 months)
    DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '3 months' AND is_read = true;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN QUERY SELECT 'notifications'::TEXT, deleted_count;
    
    -- Clean up expired sessions
    SELECT cleanup_expired_sessions() INTO deleted_count;
    RETURN QUERY SELECT 'user_sessions'::TEXT, deleted_count;
    
    -- Clean up expired gifts
    DELETE FROM gift_transactions WHERE expires_at < NOW() AND is_claimed = false;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN QUERY SELECT 'gift_transactions'::TEXT, deleted_count;
    
    -- Log cleanup activity
    INSERT INTO audit_logs (action, resource_type, new_values)
    VALUES ('cleanup_old_data', 'system', 
            jsonb_build_object('cleaned_at', NOW(), 'retention_policy', 'applied'));
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job function (to be called by external scheduler)
CREATE OR REPLACE FUNCTION scheduled_maintenance()
RETURNS VOID AS $$
BEGIN
    -- Refresh materialized views
    PERFORM refresh_all_materialized_views();
    
    -- Clean up old data
    PERFORM cleanup_old_data();
    
    -- Update VIP levels based on points
    UPDATE user_vip_status 
    SET level_id = (
        SELECT id FROM vip_levels 
        WHERE required_points <= user_vip_status.points 
        ORDER BY required_points DESC 
        LIMIT 1
    )
    WHERE level_id != (
        SELECT id FROM vip_levels 
        WHERE required_points <= user_vip_status.points 
        ORDER BY required_points DESC 
        LIMIT 1
    );
    
    -- Analyze tables for better query performance
    ANALYZE;
    
    -- Log maintenance completion
    INSERT INTO audit_logs (action, resource_type, new_values)
    VALUES ('scheduled_maintenance', 'system', 
            jsonb_build_object('completed_at', NOW(), 'tasks', 
                ARRAY['refresh_views', 'cleanup_data', 'update_vip_levels', 'analyze_tables']));
END;
$$ LANGUAGE plpgsql;

-- Add comments to views and materialized views
COMMENT ON VIEW user_summary IS 'Comprehensive user information including profile, wallet, and VIP status';
COMMENT ON VIEW game_room_summary IS 'Game room details with associated game and creator information';
COMMENT ON VIEW transaction_summary IS 'Transaction details with user information';
COMMENT ON VIEW active_games IS 'Currently active game rooms and sessions';
COMMENT ON VIEW user_achievements_progress IS 'User achievement progress and completion status';
COMMENT ON VIEW tournament_leaderboard IS 'Tournament participant rankings and scores';
COMMENT ON MATERIALIZED VIEW user_leaderboard IS 'User rankings based on game performance and winnings';
COMMENT ON MATERIALIZED VIEW daily_statistics IS 'Daily aggregated platform statistics';
COMMENT ON MATERIALIZED VIEW game_performance IS 'Game-specific performance metrics and revenue data';

-- Record migration
INSERT INTO schema_migrations (version, description) 
VALUES ('004', 'Add views, materialized views, and final database setup');

COMMIT;

-- Verify migration
DO $$
BEGIN
    -- Check if materialized views exist
    IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'user_leaderboard') THEN
        RAISE EXCEPTION 'Migration failed: user_leaderboard materialized view not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'daily_statistics') THEN
        RAISE EXCEPTION 'Migration failed: daily_statistics materialized view not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'game_performance') THEN
        RAISE EXCEPTION 'Migration failed: game_performance materialized view not created';
    END IF;
    
    -- Check if views exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'user_summary') THEN
        RAISE EXCEPTION 'Migration failed: user_summary view not created';
    END IF;
    
    RAISE NOTICE 'Migration 004 completed successfully';
END
$$;