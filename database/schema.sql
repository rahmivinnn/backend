-- Higgs Domino Database Schema
-- PostgreSQL Database Schema for Full-Stack Gaming Platform

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create custom types
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'banned', 'suspended');
CREATE TYPE user_role AS ENUM ('player', 'admin', 'moderator', 'vip');
CREATE TYPE game_status AS ENUM ('waiting', 'playing', 'finished', 'cancelled');
CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'bet', 'win', 'bonus', 'refund');
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');
CREATE TYPE payment_method AS ENUM ('credit_card', 'paypal', 'bank_transfer', 'crypto', 'e_wallet');
CREATE TYPE notification_type AS ENUM ('info', 'warning', 'success', 'error', 'promotion');
CREATE TYPE tournament_status AS ENUM ('upcoming', 'active', 'finished', 'cancelled');
CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'cancelled', 'pending');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    date_of_birth DATE,
    avatar_url TEXT,
    status user_status DEFAULT 'active',
    role user_role DEFAULT 'player',
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(32),
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip INET,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- User profiles table
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    country VARCHAR(2), -- ISO country code
    timezone VARCHAR(50),
    language VARCHAR(10) DEFAULT 'en',
    currency VARCHAR(3) DEFAULT 'USD',
    privacy_settings JSONB DEFAULT '{}',
    notification_preferences JSONB DEFAULT '{}',
    game_preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User wallets table
CREATE TABLE user_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(15,2) DEFAULT 0.00,
    bonus_balance DECIMAL(15,2) DEFAULT 0.00,
    locked_balance DECIMAL(15,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, currency)
);

-- VIP levels table
CREATE TABLE vip_levels (
    id SERIAL PRIMARY KEY,
    level INTEGER UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    min_points INTEGER NOT NULL,
    benefits JSONB DEFAULT '{}',
    cashback_percentage DECIMAL(5,2) DEFAULT 0.00,
    bonus_multiplier DECIMAL(5,2) DEFAULT 1.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User VIP status table
CREATE TABLE user_vip_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vip_level_id INTEGER NOT NULL REFERENCES vip_levels(id),
    points INTEGER DEFAULT 0,
    points_this_month INTEGER DEFAULT 0,
    cashback_earned DECIMAL(15,2) DEFAULT 0.00,
    benefits_used JSONB DEFAULT '{}',
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Games table
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    game_type VARCHAR(50) NOT NULL, -- domino, poker, slots, etc.
    min_players INTEGER DEFAULT 2,
    max_players INTEGER DEFAULT 8,
    min_bet DECIMAL(15,2) DEFAULT 1.00,
    max_bet DECIMAL(15,2) DEFAULT 1000.00,
    house_edge DECIMAL(5,4) DEFAULT 0.05,
    rules JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game rooms table
CREATE TABLE game_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id),
    name VARCHAR(100) NOT NULL,
    room_code VARCHAR(10) UNIQUE NOT NULL,
    status game_status DEFAULT 'waiting',
    current_players INTEGER DEFAULT 0,
    max_players INTEGER NOT NULL,
    min_bet DECIMAL(15,2) NOT NULL,
    max_bet DECIMAL(15,2) NOT NULL,
    is_private BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255),
    game_state JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES users(id),
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game sessions table
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id),
    user_id UUID NOT NULL REFERENCES users(id),
    seat_number INTEGER,
    buy_in_amount DECIMAL(15,2) NOT NULL,
    current_chips DECIMAL(15,2) DEFAULT 0.00,
    total_bet DECIMAL(15,2) DEFAULT 0.00,
    total_won DECIMAL(15,2) DEFAULT 0.00,
    hands_played INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game hands/rounds table
CREATE TABLE game_hands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES game_rooms(id),
    hand_number INTEGER NOT NULL,
    dealer_user_id UUID REFERENCES users(id),
    pot_amount DECIMAL(15,2) DEFAULT 0.00,
    winner_user_id UUID REFERENCES users(id),
    hand_data JSONB DEFAULT '{}', -- cards, moves, etc.
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    type transaction_type NOT NULL,
    status transaction_status DEFAULT 'pending',
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    fee DECIMAL(15,2) DEFAULT 0.00,
    net_amount DECIMAL(15,2) NOT NULL,
    payment_method payment_method,
    payment_reference VARCHAR(255),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bets table
CREATE TABLE bets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    room_id UUID NOT NULL REFERENCES game_rooms(id),
    hand_id UUID REFERENCES game_hands(id),
    amount DECIMAL(15,2) NOT NULL,
    potential_win DECIMAL(15,2),
    actual_win DECIMAL(15,2) DEFAULT 0.00,
    bet_type VARCHAR(50), -- call, raise, fold, etc.
    bet_data JSONB DEFAULT '{}',
    placed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tournaments table
CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    game_id UUID NOT NULL REFERENCES games(id),
    tournament_type VARCHAR(50) DEFAULT 'knockout', -- knockout, sit_and_go, scheduled
    status tournament_status DEFAULT 'upcoming',
    buy_in DECIMAL(15,2) NOT NULL,
    prize_pool DECIMAL(15,2) DEFAULT 0.00,
    max_participants INTEGER,
    current_participants INTEGER DEFAULT 0,
    structure JSONB DEFAULT '{}', -- blind levels, payouts, etc.
    rules JSONB DEFAULT '{}',
    starts_at TIMESTAMP WITH TIME ZONE,
    registration_ends_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tournament participants table
CREATE TABLE tournament_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id),
    user_id UUID NOT NULL REFERENCES users(id),
    buy_in_paid DECIMAL(15,2) NOT NULL,
    chips INTEGER DEFAULT 0,
    position INTEGER,
    prize_won DECIMAL(15,2) DEFAULT 0.00,
    eliminated_at TIMESTAMP WITH TIME ZONE,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tournament_id, user_id)
);

-- Lucky wheel table
CREATE TABLE lucky_wheel_spins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    prize_type VARCHAR(50) NOT NULL, -- coins, bonus, item, etc.
    prize_value DECIMAL(15,2),
    prize_description TEXT,
    spin_cost DECIMAL(15,2) DEFAULT 0.00,
    spun_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    claimed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily bonuses table
CREATE TABLE daily_bonuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    bonus_date DATE NOT NULL,
    consecutive_days INTEGER DEFAULT 1,
    bonus_amount DECIMAL(15,2) NOT NULL,
    bonus_type VARCHAR(50) DEFAULT 'daily_login',
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, bonus_date)
);

-- Achievements table
CREATE TABLE achievements (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    icon_url TEXT,
    points INTEGER DEFAULT 0,
    requirements JSONB DEFAULT '{}',
    rewards JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User achievements table
CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    achievement_id INTEGER NOT NULL REFERENCES achievements(id),
    progress JSONB DEFAULT '{}',
    completed_at TIMESTAMP WITH TIME ZONE,
    claimed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- Friends table
CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES users(id),
    addressee_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, blocked
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id),
    CHECK (requester_id != addressee_id)
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id),
    recipient_id UUID REFERENCES users(id),
    room_id UUID REFERENCES game_rooms(id),
    message_type VARCHAR(20) DEFAULT 'text', -- text, image, emoji, system
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    type notification_type DEFAULT 'info',
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    plan_name VARCHAR(50) NOT NULL,
    status subscription_status DEFAULT 'pending',
    price DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    billing_cycle VARCHAR(20) DEFAULT 'monthly', -- monthly, yearly
    features JSONB DEFAULT '{}',
    starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ends_at TIMESTAMP WITH TIME ZONE,
    auto_renew BOOLEAN DEFAULT TRUE,
    payment_method_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game statistics table
CREATE TABLE game_statistics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    game_id UUID NOT NULL REFERENCES games(id),
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    total_bet DECIMAL(15,2) DEFAULT 0.00,
    total_won DECIMAL(15,2) DEFAULT 0.00,
    biggest_win DECIMAL(15,2) DEFAULT 0.00,
    longest_streak INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    average_bet DECIMAL(15,2) DEFAULT 0.00,
    win_rate DECIMAL(5,4) DEFAULT 0.0000,
    last_played_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, game_id)
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System settings table
CREATE TABLE system_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    data_type VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE INDEX idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX idx_user_wallets_currency ON user_wallets(currency);

CREATE INDEX idx_game_rooms_status ON game_rooms(status);
CREATE INDEX idx_game_rooms_game_id ON game_rooms(game_id);
CREATE INDEX idx_game_rooms_created_by ON game_rooms(created_by);

CREATE INDEX idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX idx_game_sessions_user_id ON game_sessions(user_id);
CREATE INDEX idx_game_sessions_is_active ON game_sessions(is_active);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_room_id ON bets(room_id);
CREATE INDEX idx_bets_hand_id ON bets(hand_id);

CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_starts_at ON tournaments(starts_at);

CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX idx_messages_room_id ON messages(room_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_wallets_updated_at BEFORE UPDATE ON user_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vip_levels_updated_at BEFORE UPDATE ON vip_levels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_vip_status_updated_at BEFORE UPDATE ON user_vip_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_game_rooms_updated_at BEFORE UPDATE ON game_rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_game_sessions_updated_at BEFORE UPDATE ON game_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_game_statistics_updated_at BEFORE UPDATE ON game_statistics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_achievements_updated_at BEFORE UPDATE ON achievements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default data

-- Insert default VIP levels
INSERT INTO vip_levels (level, name, min_points, benefits, cashback_percentage, bonus_multiplier) VALUES
(0, 'Bronze', 0, '{"daily_bonus": 10, "tournament_access": "basic"}', 0.5, 1.0),
(1, 'Silver', 1000, '{"daily_bonus": 20, "tournament_access": "premium", "support_priority": true}', 1.0, 1.1),
(2, 'Gold', 5000, '{"daily_bonus": 50, "tournament_access": "vip", "support_priority": true, "exclusive_games": true}', 2.0, 1.2),
(3, 'Platinum', 15000, '{"daily_bonus": 100, "tournament_access": "vip", "support_priority": true, "exclusive_games": true, "personal_manager": true}', 3.0, 1.5),
(4, 'Diamond', 50000, '{"daily_bonus": 200, "tournament_access": "vip", "support_priority": true, "exclusive_games": true, "personal_manager": true, "custom_limits": true}', 5.0, 2.0);

-- Insert default games
INSERT INTO games (name, description, game_type, min_players, max_players, min_bet, max_bet, house_edge, rules) VALUES
('Classic Domino', 'Traditional domino game with classic rules', 'domino', 2, 4, 1.00, 100.00, 0.05, '{"rounds": 7, "starting_tiles": 7}'),
('Speed Domino', 'Fast-paced domino game with time limits', 'domino', 2, 4, 2.00, 200.00, 0.05, '{"rounds": 5, "starting_tiles": 6, "time_limit": 30}'),
('Texas Hold''em', 'Popular poker variant', 'poker', 2, 8, 5.00, 500.00, 0.05, '{"blinds": true, "community_cards": 5}'),
('Blackjack', 'Classic card game against the house', 'blackjack', 1, 7, 1.00, 1000.00, 0.005, '{"decks": 6, "dealer_stands": 17}'),
('Lucky Slots', 'Slot machine game with various themes', 'slots', 1, 1, 0.10, 50.00, 0.08, '{"reels": 5, "paylines": 25}');

-- Insert default achievements
INSERT INTO achievements (name, description, category, points, requirements, rewards) VALUES
('First Win', 'Win your first game', 'beginner', 10, '{"games_won": 1}', '{"bonus": 10}'),
('High Roller', 'Place a bet of $100 or more', 'betting', 50, '{"single_bet": 100}', '{"bonus": 50}'),
('Winning Streak', 'Win 5 games in a row', 'skill', 100, '{"consecutive_wins": 5}', '{"bonus": 100}'),
('Social Player', 'Add 10 friends', 'social', 25, '{"friends_count": 10}', '{"bonus": 25}'),
('Tournament Champion', 'Win a tournament', 'tournament', 200, '{"tournaments_won": 1}', '{"bonus": 200}'),
('Daily Player', 'Play for 7 consecutive days', 'loyalty', 75, '{"consecutive_days": 7}', '{"bonus": 75}'),
('Big Winner', 'Win $1000 in a single game', 'achievement', 500, '{"single_win": 1000}', '{"bonus": 500}');

-- Insert default system settings
INSERT INTO system_settings (key, value, description, data_type, is_public) VALUES
('maintenance_mode', 'false', 'Enable maintenance mode', 'boolean', true),
('registration_enabled', 'true', 'Allow new user registrations', 'boolean', true),
('min_withdrawal_amount', '10.00', 'Minimum withdrawal amount', 'number', true),
('max_withdrawal_amount', '10000.00', 'Maximum withdrawal amount per day', 'number', true),
('default_currency', 'USD', 'Default currency for new users', 'string', true),
('support_email', 'support@higgs-domino.com', 'Support email address', 'string', true),
('max_friends', '100', 'Maximum number of friends per user', 'number', true),
('session_timeout', '3600', 'Session timeout in seconds', 'number', false),
('rate_limit_requests', '100', 'Rate limit requests per minute', 'number', false),
('backup_retention_days', '30', 'Database backup retention in days', 'number', false);

-- Create views for common queries

-- User summary view
CREATE VIEW user_summary AS
SELECT 
    u.id,
    u.username,
    u.email,
    u.status,
    u.role,
    up.country,
    up.language,
    uw.balance,
    uw.bonus_balance,
    uvs.vip_level_id,
    vl.name as vip_level_name,
    uvs.points as vip_points,
    u.created_at,
    u.last_login_at
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
LEFT JOIN user_wallets uw ON u.id = uw.user_id AND uw.currency = 'USD'
LEFT JOIN user_vip_status uvs ON u.id = uvs.user_id
LEFT JOIN vip_levels vl ON uvs.vip_level_id = vl.id;

-- Game room summary view
CREATE VIEW game_room_summary AS
SELECT 
    gr.id,
    gr.name,
    gr.room_code,
    gr.status,
    gr.current_players,
    gr.max_players,
    gr.min_bet,
    gr.max_bet,
    g.name as game_name,
    g.game_type,
    u.username as created_by_username,
    gr.created_at
FROM game_rooms gr
JOIN games g ON gr.game_id = g.id
JOIN users u ON gr.created_by = u.id;

-- Transaction summary view
CREATE VIEW transaction_summary AS
SELECT 
    t.id,
    t.user_id,
    u.username,
    t.type,
    t.status,
    t.amount,
    t.currency,
    t.fee,
    t.net_amount,
    t.payment_method,
    t.created_at,
    t.processed_at
FROM transactions t
JOIN users u ON t.user_id = u.id;

-- Create functions for common operations

-- Function to get user balance
CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID, p_currency VARCHAR(3) DEFAULT 'USD')
RETURNS DECIMAL(15,2) AS $$
DECLARE
    balance DECIMAL(15,2);
BEGIN
    SELECT COALESCE(uw.balance, 0.00)
    INTO balance
    FROM user_wallets uw
    WHERE uw.user_id = p_user_id AND uw.currency = p_currency;
    
    RETURN COALESCE(balance, 0.00);
END;
$$ LANGUAGE plpgsql;

-- Function to update user balance
CREATE OR REPLACE FUNCTION update_user_balance(
    p_user_id UUID,
    p_amount DECIMAL(15,2),
    p_currency VARCHAR(3) DEFAULT 'USD'
)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO user_wallets (user_id, balance, currency)
    VALUES (p_user_id, p_amount, p_currency)
    ON CONFLICT (user_id, currency)
    DO UPDATE SET 
        balance = user_wallets.balance + p_amount,
        updated_at = NOW();
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate win rate
CREATE OR REPLACE FUNCTION calculate_win_rate(p_user_id UUID, p_game_id UUID DEFAULT NULL)
RETURNS DECIMAL(5,4) AS $$
DECLARE
    total_games INTEGER;
    games_won INTEGER;
    win_rate DECIMAL(5,4);
BEGIN
    IF p_game_id IS NULL THEN
        SELECT 
            SUM(gs.games_played),
            SUM(gs.games_won)
        INTO total_games, games_won
        FROM game_statistics gs
        WHERE gs.user_id = p_user_id;
    ELSE
        SELECT 
            gs.games_played,
            gs.games_won
        INTO total_games, games_won
        FROM game_statistics gs
        WHERE gs.user_id = p_user_id AND gs.game_id = p_game_id;
    END IF;
    
    IF total_games > 0 THEN
        win_rate := games_won::DECIMAL / total_games::DECIMAL;
    ELSE
        win_rate := 0.0000;
    END IF;
    
    RETURN win_rate;
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for leaderboards
CREATE MATERIALIZED VIEW user_leaderboard AS
SELECT 
    u.id,
    u.username,
    u.avatar_url,
    uvs.vip_level_id,
    vl.name as vip_level_name,
    SUM(gs.games_won) as total_wins,
    SUM(gs.games_played) as total_games,
    SUM(gs.total_won - gs.total_bet) as net_winnings,
    AVG(calculate_win_rate(u.id)) as avg_win_rate,
    ROW_NUMBER() OVER (ORDER BY SUM(gs.total_won - gs.total_bet) DESC) as rank
FROM users u
LEFT JOIN user_vip_status uvs ON u.id = uvs.user_id
LEFT JOIN vip_levels vl ON uvs.vip_level_id = vl.id
LEFT JOIN game_statistics gs ON u.id = gs.user_id
WHERE u.status = 'active'
GROUP BY u.id, u.username, u.avatar_url, uvs.vip_level_id, vl.name
HAVING SUM(gs.games_played) > 0
ORDER BY net_winnings DESC;

-- Create index on materialized view
CREATE UNIQUE INDEX idx_user_leaderboard_id ON user_leaderboard(id);
CREATE INDEX idx_user_leaderboard_rank ON user_leaderboard(rank);

-- Refresh materialized view function
CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_leaderboard;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE users IS 'Main users table storing user account information';
COMMENT ON TABLE user_profiles IS 'Extended user profile information and preferences';
COMMENT ON TABLE user_wallets IS 'User wallet balances for different currencies';
COMMENT ON TABLE games IS 'Available games in the platform';
COMMENT ON TABLE game_rooms IS 'Active game rooms where users can play';
COMMENT ON TABLE transactions IS 'All financial transactions (deposits, withdrawals, bets, wins)';
COMMENT ON TABLE tournaments IS 'Tournament events and competitions';
COMMENT ON TABLE achievements IS 'Available achievements users can unlock';
COMMENT ON TABLE audit_logs IS 'Audit trail for important system actions';

-- Grant permissions (adjust as needed for your application user)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO higgs_domino_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO higgs_domino_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO higgs_domino_app;