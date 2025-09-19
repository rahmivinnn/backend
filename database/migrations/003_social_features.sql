-- Migration: 003_social_features.sql
-- Description: Add social features, notifications, messaging, and audit logging
-- Created: 2024-01-01
-- Author: Database Team
-- Depends on: 002_game_features.sql

BEGIN;

-- Check if migration has already been run
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '003') THEN
        RAISE EXCEPTION 'Migration 003 has already been applied';
    END IF;
END
$$;

-- Friendships table
CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, blocked
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id),
    CHECK (requester_id != addressee_id)
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    game_room_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    message_type VARCHAR(20) DEFAULT 'private', -- private, room, system
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (
        (message_type = 'private' AND recipient_id IS NOT NULL AND game_room_id IS NULL) OR
        (message_type = 'room' AND game_room_id IS NOT NULL AND recipient_id IS NULL) OR
        (message_type = 'system')
    )
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    is_pushed BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE
);

-- Subscriptions table
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_name VARCHAR(50) NOT NULL,
    status subscription_status DEFAULT 'pending',
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    billing_cycle VARCHAR(20) DEFAULT 'monthly', -- monthly, yearly
    benefits JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    payment_method payment_method,
    payment_reference VARCHAR(255),
    auto_renew BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game statistics table
CREATE TABLE game_statistics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    games_lost INTEGER DEFAULT 0,
    total_bet_amount DECIMAL(15,2) DEFAULT 0.00,
    total_win_amount DECIMAL(15,2) DEFAULT 0.00,
    biggest_win DECIMAL(15,2) DEFAULT 0.00,
    longest_win_streak INTEGER DEFAULT 0,
    current_win_streak INTEGER DEFAULT 0,
    total_play_time INTEGER DEFAULT 0, -- in seconds
    last_played_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, game_type)
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50), -- user, game, transaction, etc.
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions table (for tracking active sessions)
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gift transactions table
CREATE TABLE gift_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gift_type VARCHAR(50) NOT NULL, -- coins, items, vip_time
    gift_value DECIMAL(15,2) NOT NULL,
    message TEXT,
    is_claimed BOOLEAN DEFAULT FALSE,
    claimed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (sender_id != recipient_id)
);

-- Leaderboards table
CREATE TABLE leaderboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- daily, weekly, monthly, all_time
    category VARCHAR(50) NOT NULL, -- wins, earnings, games_played
    game_type VARCHAR(50), -- specific game or NULL for all games
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    data JSONB NOT NULL, -- leaderboard entries
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User reports table (for reporting inappropriate behavior)
CREATE TABLE user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL, -- harassment, cheating, inappropriate_content
    description TEXT NOT NULL,
    evidence JSONB DEFAULT '{}', -- screenshots, chat logs, etc.
    status VARCHAR(20) DEFAULT 'pending', -- pending, investigating, resolved, dismissed
    admin_notes TEXT,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (reporter_id != reported_user_id)
);

-- Create indexes for performance
CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_friendships_status ON friendships(status);

CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_game_room ON messages(game_room_id);
CREATE INDEX idx_messages_type ON messages(message_type);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);
CREATE INDEX idx_messages_unread ON messages(recipient_id, is_read) WHERE is_read = FALSE;

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_expires_at ON subscriptions(expires_at);

CREATE INDEX idx_game_statistics_user_id ON game_statistics(user_id);
CREATE INDEX idx_game_statistics_game_type ON game_statistics(game_type);
CREATE INDEX idx_game_statistics_games_won ON game_statistics(games_won);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE INDEX idx_gift_transactions_sender ON gift_transactions(sender_id);
CREATE INDEX idx_gift_transactions_recipient ON gift_transactions(recipient_id);
CREATE INDEX idx_gift_transactions_unclaimed ON gift_transactions(recipient_id, is_claimed) WHERE is_claimed = FALSE;

CREATE INDEX idx_leaderboards_type ON leaderboards(type);
CREATE INDEX idx_leaderboards_category ON leaderboards(category);
CREATE INDEX idx_leaderboards_game_type ON leaderboards(game_type);
CREATE INDEX idx_leaderboards_active ON leaderboards(is_active);

CREATE INDEX idx_user_reports_reporter ON user_reports(reporter_id);
CREATE INDEX idx_user_reports_reported_user ON user_reports(reported_user_id);
CREATE INDEX idx_user_reports_status ON user_reports(status);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_friendships_updated_at BEFORE UPDATE ON friendships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_game_statistics_updated_at BEFORE UPDATE ON game_statistics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leaderboards_updated_at BEFORE UPDATE ON leaderboards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_reports_updated_at BEFORE UPDATE ON user_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get user's friends
CREATE OR REPLACE FUNCTION get_user_friends(p_user_id UUID)
RETURNS TABLE(
    friend_id UUID,
    username VARCHAR(50),
    avatar_url TEXT,
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_online BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN f.requester_id = p_user_id THEN f.addressee_id
            ELSE f.requester_id
        END as friend_id,
        u.username,
        u.avatar_url,
        u.last_login_at,
        (u.last_login_at > NOW() - INTERVAL '15 minutes') as is_online
    FROM friendships f
    JOIN users u ON (
        (f.requester_id = p_user_id AND u.id = f.addressee_id) OR
        (f.addressee_id = p_user_id AND u.id = f.requester_id)
    )
    WHERE f.status = 'accepted'
    AND (f.requester_id = p_user_id OR f.addressee_id = p_user_id)
    ORDER BY u.last_login_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to update game statistics
CREATE OR REPLACE FUNCTION update_game_stats(
    p_user_id UUID,
    p_game_type VARCHAR(50),
    p_won BOOLEAN,
    p_bet_amount DECIMAL(15,2),
    p_win_amount DECIMAL(15,2),
    p_play_time INTEGER
)
RETURNS VOID AS $$
DECLARE
    current_streak INTEGER;
BEGIN
    -- Insert or update game statistics
    INSERT INTO game_statistics (
        user_id, game_type, games_played, games_won, games_lost,
        total_bet_amount, total_win_amount, biggest_win,
        current_win_streak, longest_win_streak, total_play_time, last_played_at
    )
    VALUES (
        p_user_id, p_game_type, 1, 
        CASE WHEN p_won THEN 1 ELSE 0 END,
        CASE WHEN p_won THEN 0 ELSE 1 END,
        p_bet_amount, p_win_amount, p_win_amount,
        CASE WHEN p_won THEN 1 ELSE 0 END,
        CASE WHEN p_won THEN 1 ELSE 0 END,
        p_play_time, NOW()
    )
    ON CONFLICT (user_id, game_type)
    DO UPDATE SET
        games_played = game_statistics.games_played + 1,
        games_won = game_statistics.games_won + CASE WHEN p_won THEN 1 ELSE 0 END,
        games_lost = game_statistics.games_lost + CASE WHEN p_won THEN 0 ELSE 1 END,
        total_bet_amount = game_statistics.total_bet_amount + p_bet_amount,
        total_win_amount = game_statistics.total_win_amount + p_win_amount,
        biggest_win = GREATEST(game_statistics.biggest_win, p_win_amount),
        current_win_streak = CASE 
            WHEN p_won THEN game_statistics.current_win_streak + 1 
            ELSE 0 
        END,
        longest_win_streak = CASE 
            WHEN p_won THEN GREATEST(game_statistics.longest_win_streak, game_statistics.current_win_streak + 1)
            ELSE game_statistics.longest_win_streak
        END,
        total_play_time = game_statistics.total_play_time + p_play_time,
        last_played_at = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to create audit log entry
CREATE OR REPLACE FUNCTION create_audit_log(
    p_user_id UUID,
    p_action VARCHAR(100),
    p_resource_type VARCHAR(50),
    p_resource_id UUID,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_session_id VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id,
        old_values, new_values, ip_address, user_agent, session_id
    )
    VALUES (
        p_user_id, p_action, p_resource_type, p_resource_id,
        p_old_values, p_new_values, p_ip_address, p_user_agent, p_session_id
    )
    RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() OR last_activity < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to send notification
CREATE OR REPLACE FUNCTION send_notification(
    p_user_id UUID,
    p_type notification_type,
    p_title VARCHAR(200),
    p_message TEXT,
    p_data JSONB DEFAULT '{}',
    p_action_url TEXT DEFAULT NULL,
    p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO notifications (
        user_id, type, title, message, data, action_url, expires_at
    )
    VALUES (
        p_user_id, p_type, p_title, p_message, p_data, p_action_url, p_expires_at
    )
    RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Record migration
INSERT INTO schema_migrations (version, description) 
VALUES ('003', 'Add social features, notifications, messaging, and audit logging');

COMMIT;

-- Verify migration
DO $$
BEGIN
    -- Check if all new tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'friendships') THEN
        RAISE EXCEPTION 'Migration failed: friendships table not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
        RAISE EXCEPTION 'Migration failed: messages table not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        RAISE EXCEPTION 'Migration failed: notifications table not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        RAISE EXCEPTION 'Migration failed: audit_logs table not created';
    END IF;
    
    RAISE NOTICE 'Migration 003 completed successfully';
END
$$;