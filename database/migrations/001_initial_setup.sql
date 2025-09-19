-- Migration: 001_initial_setup.sql
-- Description: Initial database setup for Higgs Domino platform
-- Created: 2024-01-01
-- Author: Database Team

-- This migration creates the initial database structure
-- Run this migration first before any other migrations

BEGIN;

-- Check if migration has already been run
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations') THEN
        IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001') THEN
            RAISE EXCEPTION 'Migration 001 has already been applied';
        END IF;
    END IF;
END
$$;

-- Create schema_migrations table if it doesn't exist
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT
);

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

-- Create core tables

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

-- Create basic indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE INDEX idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX idx_user_wallets_currency ON user_wallets(currency);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_wallets_updated_at BEFORE UPDATE ON user_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vip_levels_updated_at BEFORE UPDATE ON vip_levels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_vip_status_updated_at BEFORE UPDATE ON user_vip_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- Create basic utility functions
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

-- Record migration
INSERT INTO schema_migrations (version, description) 
VALUES ('001', 'Initial database setup with core tables and basic data');

COMMIT;

-- Verify migration
DO $$
BEGIN
    -- Check if all core tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        RAISE EXCEPTION 'Migration failed: users table not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_wallets') THEN
        RAISE EXCEPTION 'Migration failed: user_wallets table not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'games') THEN
        RAISE EXCEPTION 'Migration failed: games table not created';
    END IF;
    
    -- Check if default data exists
    IF NOT EXISTS (SELECT 1 FROM vip_levels WHERE level = 0) THEN
        RAISE EXCEPTION 'Migration failed: default VIP levels not inserted';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM games WHERE game_type = 'domino') THEN
        RAISE EXCEPTION 'Migration failed: default games not inserted';
    END IF;
    
    RAISE NOTICE 'Migration 001 completed successfully';
END
$$;