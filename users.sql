-- =============================================
-- USERS DATABASE SCHEMA
-- Higgs Domino Style Unity Game
-- =============================================

-- Main users table
CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    
    -- Profile information
    display_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    level INTEGER DEFAULT 1,
    experience_points BIGINT DEFAULT 0,
    
    -- Game currency
    coins BIGINT DEFAULT 10000, -- Starting coins
    gems INTEGER DEFAULT 100,   -- Premium currency
    chips BIGINT DEFAULT 50000, -- Game chips
    
    -- Account status
    account_status VARCHAR(20) DEFAULT 'active', -- active, suspended, banned
    is_verified BOOLEAN DEFAULT FALSE,
    is_premium BOOLEAN DEFAULT FALSE,
    premium_expires_at TIMESTAMP,
    
    -- Login tracking
    last_login_at TIMESTAMP,
    login_streak INTEGER DEFAULT 0,
    total_login_days INTEGER DEFAULT 0,
    
    -- Device and security
    device_id VARCHAR(255),
    device_type VARCHAR(50), -- android, ios, windows
    ip_address INET,
    country_code VARCHAR(3),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

-- User sessions for JWT management
CREATE TABLE user_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    refresh_token VARCHAR(500) NOT NULL,
    device_info JSONB,
    ip_address INET,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User statistics
CREATE TABLE user_stats (
    user_id BIGINT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Game statistics
    total_games_played INTEGER DEFAULT 0,
    total_games_won INTEGER DEFAULT 0,
    total_games_lost INTEGER DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0.00,
    
    -- Domino specific stats
    domino_games_played INTEGER DEFAULT 0,
    domino_games_won INTEGER DEFAULT 0,
    highest_score BIGINT DEFAULT 0,
    total_score BIGINT DEFAULT 0,
    
    -- Economic stats
    total_coins_earned BIGINT DEFAULT 0,
    total_coins_spent BIGINT DEFAULT 0,
    total_gems_purchased INTEGER DEFAULT 0,
    total_money_spent DECIMAL(10,2) DEFAULT 0.00,
    
    -- Social stats
    friends_count INTEGER DEFAULT 0,
    gifts_sent INTEGER DEFAULT 0,
    gifts_received INTEGER DEFAULT 0,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User achievements
CREATE TABLE achievements (
    achievement_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    category VARCHAR(50), -- gameplay, social, economic, special
    points INTEGER DEFAULT 0,
    rarity VARCHAR(20) DEFAULT 'common', -- common, rare, epic, legendary
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User achievement progress
CREATE TABLE user_achievements (
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    achievement_id INTEGER REFERENCES achievements(achievement_id),
    progress INTEGER DEFAULT 0,
    max_progress INTEGER DEFAULT 1,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    PRIMARY KEY (user_id, achievement_id)
);

-- Daily login rewards
CREATE TABLE daily_rewards (
    reward_id SERIAL PRIMARY KEY,
    day_number INTEGER NOT NULL, -- 1-30 for monthly cycle
    reward_type VARCHAR(20) NOT NULL, -- coins, gems, items
    reward_amount INTEGER NOT NULL,
    bonus_multiplier DECIMAL(3,2) DEFAULT 1.00,
    is_active BOOLEAN DEFAULT TRUE
);

-- User daily reward claims
CREATE TABLE user_daily_claims (
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    claim_date DATE NOT NULL,
    day_number INTEGER NOT NULL,
    reward_type VARCHAR(20) NOT NULL,
    reward_amount INTEGER NOT NULL,
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, claim_date)
);

-- Indexes for performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_device_id ON users(device_id);
CREATE INDEX idx_users_last_login ON users(last_login_at);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_daily_claims_user_date ON user_daily_claims(user_id, claim_date);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_stats_updated_at BEFORE UPDATE ON user_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();