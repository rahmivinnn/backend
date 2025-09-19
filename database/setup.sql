-- Complete Database Setup Script for Higgs Domino Platform
-- This script runs all migrations in the correct order to set up the complete database
-- Run this script on a fresh PostgreSQL database

-- Set session parameters
SET client_encoding = 'UTF8';
SET timezone = 'UTC';
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_min_messages = warning;
SET row_security = off;

-- Start transaction
BEGIN;

\echo 'Starting Higgs Domino Database Setup...'

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

\echo 'Extensions enabled successfully'

-- Create schema_migrations table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(10) PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration 001: Initial Setup
\echo 'Applying Migration 001: Initial Setup'

-- Check if migration 001 is already applied
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001') THEN
        -- Create custom types
        CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'banned');
        CREATE TYPE user_role AS ENUM ('player', 'moderator', 'admin', 'super_admin');
        CREATE TYPE game_status AS ENUM ('waiting', 'active', 'finished', 'cancelled');
        CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'bet', 'win', 'bonus', 'refund', 'fee');
        CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');
        CREATE TYPE payment_method AS ENUM ('credit_card', 'debit_card', 'bank_transfer', 'e_wallet', 'cryptocurrency');
        CREATE TYPE notification_type AS ENUM ('system', 'game', 'social', 'promotion', 'security');
        CREATE TYPE tournament_status AS ENUM ('upcoming', 'registration', 'active', 'finished', 'cancelled');
        CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired', 'suspended');

        -- Create core tables
        CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            status user_status DEFAULT 'active',
            role user_role DEFAULT 'player',
            email_verified BOOLEAN DEFAULT FALSE,
            phone VARCHAR(20),
            phone_verified BOOLEAN DEFAULT FALSE,
            last_login TIMESTAMP WITH TIME ZONE,
            login_count INTEGER DEFAULT 0,
            failed_login_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE user_profiles (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            display_name VARCHAR(100),
            bio TEXT,
            avatar_url VARCHAR(500),
            country VARCHAR(2),
            timezone VARCHAR(50) DEFAULT 'UTC',
            language VARCHAR(10) DEFAULT 'en',
            date_of_birth DATE,
            gender VARCHAR(10),
            preferences JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE user_wallets (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            currency VARCHAR(10) NOT NULL DEFAULT 'COINS',
            balance DECIMAL(15,2) DEFAULT 0.00,
            locked_balance DECIMAL(15,2) DEFAULT 0.00,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, currency)
        );

        CREATE TABLE vip_levels (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            level INTEGER UNIQUE NOT NULL,
            name VARCHAR(50) NOT NULL,
            min_points INTEGER NOT NULL DEFAULT 0,
            benefits JSONB DEFAULT '{}',
            cashback_percentage DECIMAL(5,2) DEFAULT 0.00,
            bonus_multiplier DECIMAL(5,2) DEFAULT 1.00,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE user_vip_status (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            level_id UUID NOT NULL REFERENCES vip_levels(id),
            points INTEGER DEFAULT 0,
            total_spent DECIMAL(15,2) DEFAULT 0.00,
            cashback_earned DECIMAL(15,2) DEFAULT 0.00,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id)
        );

        CREATE TABLE games (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            type VARCHAR(50) NOT NULL,
            description TEXT,
            rules JSONB DEFAULT '{}',
            min_players INTEGER DEFAULT 2,
            max_players INTEGER DEFAULT 8,
            min_bet DECIMAL(10,2) DEFAULT 1.00,
            max_bet DECIMAL(10,2) DEFAULT 1000.00,
            house_edge DECIMAL(5,4) DEFAULT 0.0200,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE system_settings (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            key VARCHAR(100) UNIQUE NOT NULL,
            value TEXT NOT NULL,
            description TEXT,
            category VARCHAR(50) DEFAULT 'general',
            is_public BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Create indexes
        CREATE INDEX idx_users_username ON users(username);
        CREATE INDEX idx_users_email ON users(email);
        CREATE INDEX idx_users_status ON users(status);
        CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
        CREATE INDEX idx_user_wallets_user_id ON user_wallets(user_id);
        CREATE INDEX idx_user_vip_status_user_id ON user_vip_status(user_id);
        CREATE INDEX idx_games_type ON games(type);
        CREATE INDEX idx_games_is_active ON games(is_active);
        CREATE INDEX idx_system_settings_key ON system_settings(key);
        CREATE INDEX idx_system_settings_category ON system_settings(category);

        -- Create trigger function for updating timestamps
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        -- Create triggers
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        CREATE TRIGGER update_user_wallets_updated_at BEFORE UPDATE ON user_wallets
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        CREATE TRIGGER update_user_vip_status_updated_at BEFORE UPDATE ON user_vip_status
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        -- Insert initial data
        INSERT INTO vip_levels (level, name, min_points, benefits, cashback_percentage, bonus_multiplier) VALUES
        (1, 'Bronze', 0, '{"daily_bonus": 10, "weekly_bonus": 50}', 1.00, 1.00),
        (2, 'Silver', 1000, '{"daily_bonus": 20, "weekly_bonus": 100, "priority_support": true}', 2.00, 1.10),
        (3, 'Gold', 5000, '{"daily_bonus": 50, "weekly_bonus": 250, "priority_support": true, "exclusive_games": true}', 3.00, 1.25),
        (4, 'Platinum', 15000, '{"daily_bonus": 100, "weekly_bonus": 500, "priority_support": true, "exclusive_games": true, "personal_manager": true}', 4.00, 1.50),
        (5, 'Diamond', 50000, '{"daily_bonus": 200, "weekly_bonus": 1000, "priority_support": true, "exclusive_games": true, "personal_manager": true, "vip_events": true}', 5.00, 2.00);

        INSERT INTO games (name, type, description, min_players, max_players, min_bet, max_bet) VALUES
        ('Classic Domino', 'domino', 'Traditional domino game with classic rules', 2, 4, 1.00, 100.00),
        ('Speed Domino', 'domino', 'Fast-paced domino game with time limits', 2, 4, 2.00, 200.00),
        ('Tournament Domino', 'domino', 'Competitive domino for tournaments', 4, 8, 5.00, 500.00),
        ('Lucky Wheel', 'wheel', 'Spin the wheel for instant prizes', 1, 1, 0.50, 50.00),
        ('Slot Machine', 'slot', 'Classic slot machine game', 1, 1, 0.10, 10.00);

        INSERT INTO system_settings (key, value, description, category, is_public) VALUES
        ('site_name', 'Higgs Domino', 'Name of the gaming platform', 'general', true),
        ('maintenance_mode', 'false', 'Enable/disable maintenance mode', 'system', false),
        ('max_daily_withdrawal', '10000', 'Maximum daily withdrawal limit', 'financial', false),
        ('min_withdrawal_amount', '10', 'Minimum withdrawal amount', 'financial', true),
        ('default_currency', 'COINS', 'Default platform currency', 'financial', true),
        ('welcome_bonus', '100', 'Welcome bonus for new users', 'bonus', true),
        ('referral_bonus', '50', 'Bonus for successful referrals', 'bonus', true);

        -- Create utility functions
        CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID, p_currency VARCHAR DEFAULT 'COINS')
        RETURNS DECIMAL(15,2) AS $$
        DECLARE
            balance DECIMAL(15,2);
        BEGIN
            SELECT COALESCE(uw.balance, 0.00) INTO balance
            FROM user_wallets uw
            WHERE uw.user_id = p_user_id AND uw.currency = p_currency;
            
            RETURN COALESCE(balance, 0.00);
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION update_user_balance(
            p_user_id UUID,
            p_currency VARCHAR,
            p_amount DECIMAL(15,2)
        )
        RETURNS DECIMAL(15,2) AS $$
        DECLARE
            new_balance DECIMAL(15,2);
        BEGIN
            INSERT INTO user_wallets (user_id, currency, balance)
            VALUES (p_user_id, p_currency, p_amount)
            ON CONFLICT (user_id, currency)
            DO UPDATE SET 
                balance = user_wallets.balance + p_amount,
                updated_at = NOW()
            RETURNING balance INTO new_balance;
            
            RETURN new_balance;
        END;
        $$ LANGUAGE plpgsql;

        -- Record migration
        INSERT INTO schema_migrations (version, description) VALUES ('001', 'Initial database setup with core tables');
        
        RAISE NOTICE 'Migration 001 applied successfully';
    ELSE
        RAISE NOTICE 'Migration 001 already applied, skipping';
    END IF;
END
$$;

-- Migration 002: Game Features
\echo 'Applying Migration 002: Game Features'

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '002') THEN
        -- Create game-related tables
        CREATE TABLE game_rooms (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            game_id UUID NOT NULL REFERENCES games(id),
            name VARCHAR(100),
            creator_id UUID NOT NULL REFERENCES users(id),
            status game_status DEFAULT 'waiting',
            current_players INTEGER DEFAULT 0,
            max_players INTEGER NOT NULL,
            min_bet DECIMAL(10,2) NOT NULL,
            max_bet DECIMAL(10,2) NOT NULL,
            settings JSONB DEFAULT '{}',
            started_at TIMESTAMP WITH TIME ZONE,
            finished_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE game_sessions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id),
            position INTEGER,
            buy_in DECIMAL(10,2) NOT NULL,
            current_balance DECIMAL(10,2) DEFAULT 0.00,
            final_balance DECIMAL(10,2),
            is_active BOOLEAN DEFAULT TRUE,
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            left_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE game_hands (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            hand_number INTEGER NOT NULL,
            cards JSONB,
            moves JSONB DEFAULT '[]',
            result JSONB,
            started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            finished_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE transactions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id),
            type transaction_type NOT NULL,
            status transaction_status DEFAULT 'pending',
            amount DECIMAL(15,2) NOT NULL,
            currency VARCHAR(10) DEFAULT 'COINS',
            reference_id UUID,
            reference_type VARCHAR(50),
            payment_method payment_method,
            external_transaction_id VARCHAR(255),
            description TEXT,
            metadata JSONB DEFAULT '{}',
            processed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE bets (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id),
            game_session_id UUID REFERENCES game_sessions(id),
            hand_id UUID REFERENCES game_hands(id),
            amount DECIMAL(10,2) NOT NULL,
            currency VARCHAR(10) DEFAULT 'COINS',
            odds DECIMAL(8,4),
            potential_win DECIMAL(10,2),
            actual_win DECIMAL(10,2) DEFAULT 0.00,
            status VARCHAR(20) DEFAULT 'active',
            placed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            settled_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE tournaments (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(200) NOT NULL,
            game_id UUID NOT NULL REFERENCES games(id),
            status tournament_status DEFAULT 'upcoming',
            buy_in DECIMAL(10,2) NOT NULL,
            prize_pool DECIMAL(15,2) DEFAULT 0.00,
            max_participants INTEGER,
            current_participants INTEGER DEFAULT 0,
            start_time TIMESTAMP WITH TIME ZONE NOT NULL,
            end_time TIMESTAMP WITH TIME ZONE,
            registration_start TIMESTAMP WITH TIME ZONE,
            registration_end TIMESTAMP WITH TIME ZONE,
            rules JSONB DEFAULT '{}',
            prizes JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE tournament_participants (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id),
            position INTEGER,
            prize_won DECIMAL(10,2) DEFAULT 0.00,
            eliminated_at TIMESTAMP WITH TIME ZONE,
            registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(tournament_id, user_id)
        );

        CREATE TABLE lucky_wheel_spins (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id),
            cost DECIMAL(10,2) NOT NULL,
            prize_type VARCHAR(50),
            prize_value DECIMAL(10,2),
            prize_description TEXT,
            spin_result JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE daily_bonuses (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id),
            bonus_date DATE NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            streak_days INTEGER DEFAULT 1,
            claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, bonus_date)
        );

        CREATE TABLE achievements (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            description TEXT,
            category VARCHAR(50),
            requirements JSONB NOT NULL,
            rewards JSONB DEFAULT '{}',
            icon_url VARCHAR(500),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE user_achievements (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id),
            achievement_id UUID NOT NULL REFERENCES achievements(id),
            progress JSONB DEFAULT '{}',
            completed_at TIMESTAMP WITH TIME ZONE,
            claimed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, achievement_id)
        );

        -- Create indexes
        CREATE INDEX idx_game_rooms_game_id ON game_rooms(game_id);
        CREATE INDEX idx_game_rooms_creator_id ON game_rooms(creator_id);
        CREATE INDEX idx_game_rooms_status ON game_rooms(status);
        CREATE INDEX idx_game_sessions_room_id ON game_sessions(room_id);
        CREATE INDEX idx_game_sessions_user_id ON game_sessions(user_id);
        CREATE INDEX idx_game_hands_session_id ON game_hands(session_id);
        CREATE INDEX idx_transactions_user_id ON transactions(user_id);
        CREATE INDEX idx_transactions_type ON transactions(type);
        CREATE INDEX idx_transactions_status ON transactions(status);
        CREATE INDEX idx_transactions_created_at ON transactions(created_at);
        CREATE INDEX idx_bets_user_id ON bets(user_id);
        CREATE INDEX idx_bets_game_session_id ON bets(game_session_id);
        CREATE INDEX idx_tournaments_status ON tournaments(status);
        CREATE INDEX idx_tournaments_start_time ON tournaments(start_time);
        CREATE INDEX idx_tournament_participants_tournament_id ON tournament_participants(tournament_id);
        CREATE INDEX idx_tournament_participants_user_id ON tournament_participants(user_id);
        CREATE INDEX idx_lucky_wheel_spins_user_id ON lucky_wheel_spins(user_id);
        CREATE INDEX idx_daily_bonuses_user_id ON daily_bonuses(user_id);
        CREATE INDEX idx_daily_bonuses_bonus_date ON daily_bonuses(bonus_date);
        CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
        CREATE INDEX idx_user_achievements_achievement_id ON user_achievements(achievement_id);

        -- Create triggers
        CREATE TRIGGER update_game_rooms_updated_at BEFORE UPDATE ON game_rooms
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        CREATE TRIGGER update_game_sessions_updated_at BEFORE UPDATE ON game_sessions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON tournaments
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        -- Insert achievement data
        INSERT INTO achievements (name, description, category, requirements, rewards) VALUES
        ('First Game', 'Play your first game', 'gameplay', '{"games_played": 1}', '{"coins": 10}'),
        ('Winning Streak', 'Win 5 games in a row', 'gameplay', '{"consecutive_wins": 5}', '{"coins": 100}'),
        ('High Roller', 'Place a bet of 100 coins or more', 'betting', '{"max_bet": 100}', '{"coins": 50}'),
        ('Tournament Winner', 'Win a tournament', 'tournament', '{"tournaments_won": 1}', '{"coins": 500}'),
        ('Lucky Spinner', 'Spin the lucky wheel 10 times', 'bonus', '{"wheel_spins": 10}', '{"coins": 25}'),
        ('Daily Player', 'Play for 7 consecutive days', 'loyalty', '{"consecutive_days": 7}', '{"coins": 200}'),
        ('Social Butterfly', 'Add 10 friends', 'social', '{"friends_count": 10}', '{"coins": 75}'),
        ('VIP Member', 'Reach VIP level 3', 'vip', '{"vip_level": 3}', '{"coins": 1000}');

        -- Create functions
        CREATE OR REPLACE FUNCTION calculate_win_rate(p_user_id UUID, p_game_id UUID DEFAULT NULL)
        RETURNS DECIMAL(5,2) AS $$
        DECLARE
            total_games INTEGER;
            won_games INTEGER;
            win_rate DECIMAL(5,2);
        BEGIN
            IF p_game_id IS NULL THEN
                SELECT COUNT(*) INTO total_games
                FROM game_sessions gs
                WHERE gs.user_id = p_user_id AND gs.final_balance IS NOT NULL;
                
                SELECT COUNT(*) INTO won_games
                FROM game_sessions gs
                WHERE gs.user_id = p_user_id 
                  AND gs.final_balance > gs.buy_in;
            ELSE
                SELECT COUNT(*) INTO total_games
                FROM game_sessions gs
                JOIN game_rooms gr ON gs.room_id = gr.id
                WHERE gs.user_id = p_user_id 
                  AND gr.game_id = p_game_id 
                  AND gs.final_balance IS NOT NULL;
                
                SELECT COUNT(*) INTO won_games
                FROM game_sessions gs
                JOIN game_rooms gr ON gs.room_id = gr.id
                WHERE gs.user_id = p_user_id 
                  AND gr.game_id = p_game_id 
                  AND gs.final_balance > gs.buy_in;
            END IF;
            
            IF total_games = 0 THEN
                RETURN 0.00;
            END IF;
            
            win_rate := (won_games::DECIMAL / total_games::DECIMAL) * 100;
            RETURN ROUND(win_rate, 2);
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION update_game_room_players()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE game_rooms 
                SET current_players = current_players + 1
                WHERE id = NEW.room_id;
                RETURN NEW;
            ELSIF TG_OP = 'DELETE' THEN
                UPDATE game_rooms 
                SET current_players = current_players - 1
                WHERE id = OLD.room_id;
                RETURN OLD;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER update_room_player_count
            AFTER INSERT OR DELETE ON game_sessions
            FOR EACH ROW EXECUTE FUNCTION update_game_room_players();

        CREATE OR REPLACE FUNCTION update_tournament_participants()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE tournaments 
                SET current_participants = current_participants + 1
                WHERE id = NEW.tournament_id;
                RETURN NEW;
            ELSIF TG_OP = 'DELETE' THEN
                UPDATE tournaments 
                SET current_participants = current_participants - 1
                WHERE id = OLD.tournament_id;
                RETURN OLD;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER update_tournament_participant_count
            AFTER INSERT OR DELETE ON tournament_participants
            FOR EACH ROW EXECUTE FUNCTION update_tournament_participants();

        -- Record migration
        INSERT INTO schema_migrations (version, description) VALUES ('002', 'Game features and tournament system');
        
        RAISE NOTICE 'Migration 002 applied successfully';
    ELSE
        RAISE NOTICE 'Migration 002 already applied, skipping';
    END IF;
END
$$;

-- Migration 003: Social Features
\echo 'Applying Migration 003: Social Features'

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '003') THEN
        -- Create social and communication tables
        CREATE TABLE friendships (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(requester_id, addressee_id),
            CHECK (requester_id != addressee_id)
        );

        CREATE TABLE messages (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            sender_id UUID NOT NULL REFERENCES users(id),
            recipient_id UUID REFERENCES users(id),
            room_id UUID REFERENCES game_rooms(id),
            content TEXT NOT NULL,
            message_type VARCHAR(20) DEFAULT 'text',
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE notifications (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type notification_type NOT NULL,
            title VARCHAR(200) NOT NULL,
            content TEXT,
            data JSONB DEFAULT '{}',
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE subscriptions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            plan_name VARCHAR(100) NOT NULL,
            status subscription_status DEFAULT 'active',
            start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            end_date TIMESTAMP WITH TIME ZONE,
            auto_renew BOOLEAN DEFAULT TRUE,
            payment_method payment_method,
            amount DECIMAL(10,2) NOT NULL,
            currency VARCHAR(10) DEFAULT 'USD',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE game_statistics (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            game_id UUID NOT NULL REFERENCES games(id),
            games_played INTEGER DEFAULT 0,
            games_won INTEGER DEFAULT 0,
            total_bet DECIMAL(15,2) DEFAULT 0.00,
            total_won DECIMAL(15,2) DEFAULT 0.00,
            best_streak INTEGER DEFAULT 0,
            current_streak INTEGER DEFAULT 0,
            last_played TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, game_id)
        );

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

        CREATE TABLE user_sessions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            session_token VARCHAR(255) UNIQUE NOT NULL,
            ip_address INET,
            user_agent TEXT,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE gift_transactions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            sender_id UUID NOT NULL REFERENCES users(id),
            recipient_id UUID NOT NULL REFERENCES users(id),
            gift_type VARCHAR(50) NOT NULL,
            amount DECIMAL(10,2),
            message TEXT,
            status VARCHAR(20) DEFAULT 'sent',
            sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            claimed_at TIMESTAMP WITH TIME ZONE
        );

        CREATE TABLE leaderboards (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            type VARCHAR(50) NOT NULL,
            period VARCHAR(20) NOT NULL,
            start_date TIMESTAMP WITH TIME ZONE,
            end_date TIMESTAMP WITH TIME ZONE,
            criteria JSONB NOT NULL,
            rewards JSONB DEFAULT '{}',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE user_reports (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            reporter_id UUID NOT NULL REFERENCES users(id),
            reported_id UUID NOT NULL REFERENCES users(id),
            reason VARCHAR(100) NOT NULL,
            description TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            reviewed_by UUID REFERENCES users(id),
            reviewed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Create indexes
        CREATE INDEX idx_friendships_requester_id ON friendships(requester_id);
        CREATE INDEX idx_friendships_addressee_id ON friendships(addressee_id);
        CREATE INDEX idx_friendships_status ON friendships(status);
        CREATE INDEX idx_messages_sender_id ON messages(sender_id);
        CREATE INDEX idx_messages_recipient_id ON messages(recipient_id);
        CREATE INDEX idx_messages_room_id ON messages(room_id);
        CREATE INDEX idx_messages_created_at ON messages(created_at);
        CREATE INDEX idx_notifications_user_id ON notifications(user_id);
        CREATE INDEX idx_notifications_type ON notifications(type);
        CREATE INDEX idx_notifications_is_read ON notifications(is_read);
        CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
        CREATE INDEX idx_subscriptions_status ON subscriptions(status);
        CREATE INDEX idx_game_statistics_user_id ON game_statistics(user_id);
        CREATE INDEX idx_game_statistics_game_id ON game_statistics(game_id);
        CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
        CREATE INDEX idx_audit_logs_action ON audit_logs(action);
        CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
        CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
        CREATE INDEX idx_user_sessions_session_token ON user_sessions(session_token);
        CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
        CREATE INDEX idx_gift_transactions_sender_id ON gift_transactions(sender_id);
        CREATE INDEX idx_gift_transactions_recipient_id ON gift_transactions(recipient_id);
        CREATE INDEX idx_user_reports_reporter_id ON user_reports(reporter_id);
        CREATE INDEX idx_user_reports_reported_id ON user_reports(reported_id);
        CREATE INDEX idx_user_reports_status ON user_reports(status);

        -- Create triggers
        CREATE TRIGGER update_friendships_updated_at BEFORE UPDATE ON friendships
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        CREATE TRIGGER update_game_statistics_updated_at BEFORE UPDATE ON game_statistics
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        -- Create functions
        CREATE OR REPLACE FUNCTION get_user_friends(p_user_id UUID)
        RETURNS TABLE(
            friend_id UUID,
            username VARCHAR(50),
            display_name VARCHAR(100),
            avatar_url VARCHAR(500),
            status user_status,
            friendship_date TIMESTAMP WITH TIME ZONE
        ) AS $$
        BEGIN
            RETURN QUERY
            SELECT 
                CASE 
                    WHEN f.requester_id = p_user_id THEN f.addressee_id
                    ELSE f.requester_id
                END as friend_id,
                u.username,
                up.display_name,
                up.avatar_url,
                u.status,
                f.created_at as friendship_date
            FROM friendships f
            JOIN users u ON (u.id = CASE WHEN f.requester_id = p_user_id THEN f.addressee_id ELSE f.requester_id END)
            LEFT JOIN user_profiles up ON up.user_id = u.id
            WHERE (f.requester_id = p_user_id OR f.addressee_id = p_user_id)
              AND f.status = 'accepted';
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION update_game_stats()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.final_balance IS NOT NULL AND OLD.final_balance IS NULL THEN
                INSERT INTO game_statistics (user_id, game_id, games_played, games_won, total_bet, total_won, last_played)
                SELECT 
                    NEW.user_id,
                    gr.game_id,
                    1,
                    CASE WHEN NEW.final_balance > NEW.buy_in THEN 1 ELSE 0 END,
                    NEW.buy_in,
                    GREATEST(NEW.final_balance - NEW.buy_in, 0),
                    NOW()
                FROM game_rooms gr WHERE gr.id = NEW.room_id
                ON CONFLICT (user_id, game_id)
                DO UPDATE SET
                    games_played = game_statistics.games_played + 1,
                    games_won = game_statistics.games_won + CASE WHEN NEW.final_balance > NEW.buy_in THEN 1 ELSE 0 END,
                    total_bet = game_statistics.total_bet + NEW.buy_in,
                    total_won = game_statistics.total_won + GREATEST(NEW.final_balance - NEW.buy_in, 0),
                    current_streak = CASE 
                        WHEN NEW.final_balance > NEW.buy_in THEN game_statistics.current_streak + 1
                        ELSE 0
                    END,
                    best_streak = GREATEST(
                        game_statistics.best_streak,
                        CASE WHEN NEW.final_balance > NEW.buy_in THEN game_statistics.current_streak + 1 ELSE 0 END
                    ),
                    last_played = NOW(),
                    updated_at = NOW();
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER update_user_game_stats
            AFTER UPDATE ON game_sessions
            FOR EACH ROW EXECUTE FUNCTION update_game_stats();

        CREATE OR REPLACE FUNCTION create_audit_log(
            p_user_id UUID,
            p_action VARCHAR(100),
            p_resource_type VARCHAR(50) DEFAULT NULL,
            p_resource_id UUID DEFAULT NULL,
            p_old_values JSONB DEFAULT NULL,
            p_new_values JSONB DEFAULT NULL
        )
        RETURNS UUID AS $$
        DECLARE
            log_id UUID;
        BEGIN
            INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values)
            VALUES (p_user_id, p_action, p_resource_type, p_resource_id, p_old_values, p_new_values)
            RETURNING id INTO log_id;
            
            RETURN log_id;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
        RETURNS INTEGER AS $$
        DECLARE
            deleted_count INTEGER;
        BEGIN
            DELETE FROM user_sessions WHERE expires_at < NOW();
            GET DIAGNOSTICS deleted_count = ROW_COUNT;
            RETURN deleted_count;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION send_notification(
            p_user_id UUID,
            p_type notification_type,
            p_title VARCHAR(200),
            p_content TEXT DEFAULT NULL,
            p_data JSONB DEFAULT '{}'
        )
        RETURNS UUID AS $$
        DECLARE
            notification_id UUID;
        BEGIN
            INSERT INTO notifications (user_id, type, title, content, data)
            VALUES (p_user_id, p_type, p_title, p_content, p_data)
            RETURNING id INTO notification_id;
            
            RETURN notification_id;
        END;
        $$ LANGUAGE plpgsql;

        -- Record migration
        INSERT INTO schema_migrations (version, description) VALUES ('003', 'Social features, messaging, and audit logging');
        
        RAISE NOTICE 'Migration 003 applied successfully';
    ELSE
        RAISE NOTICE 'Migration 003 already applied, skipping';
    END IF;
END
$$;

-- Migration 004: Views and Final Setup
\echo 'Applying Migration 004: Views and Final Setup'

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '004') THEN
        -- Create views
        CREATE VIEW user_summary AS
        SELECT 
            u.id,
            u.username,
            u.email,
            u.status,
            u.role,
            up.display_name,
            up.avatar_url,
            up.country,
            uw.balance as coin_balance,
            vl.name as vip_level_name,
            uvs.points as vip_points,
            u.created_at,
            u.last_login
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN user_wallets uw ON uw.user_id = u.id AND uw.currency = 'COINS'
        LEFT JOIN user_vip_status uvs ON uvs.user_id = u.id
        LEFT JOIN vip_levels vl ON vl.id = uvs.level_id;

        CREATE VIEW game_room_summary AS
        SELECT 
            gr.id,
            gr.name as room_name,
            g.name as game_name,
            g.type as game_type,
            gr.status,
            gr.current_players,
            gr.max_players,
            gr.min_bet,
            gr.max_bet,
            u.username as creator_username,
            gr.created_at,
            gr.started_at
        FROM game_rooms gr
        JOIN games g ON g.id = gr.game_id
        JOIN users u ON u.id = gr.creator_id;

        CREATE VIEW transaction_summary AS
        SELECT 
            t.id,
            u.username,
            t.type,
            t.status,
            t.amount,
            t.currency,
            t.description,
            t.created_at,
            t.processed_at
        FROM transactions t
        JOIN users u ON u.id = t.user_id;

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
            u.username as creator,
            gr.created_at
        FROM game_rooms gr
        JOIN games g ON g.id = gr.game_id
        JOIN users u ON u.id = gr.creator_id
        WHERE gr.status IN ('waiting', 'active');

        CREATE VIEW user_achievements_progress AS
        SELECT 
            u.username,
            a.name as achievement_name,
            a.description,
            a.category,
            ua.progress,
            ua.completed_at,
            ua.claimed_at,
            CASE WHEN ua.completed_at IS NOT NULL THEN 'completed'
                 WHEN ua.progress IS NOT NULL THEN 'in_progress'
                 ELSE 'not_started'
            END as status
        FROM users u
        CROSS JOIN achievements a
        LEFT JOIN user_achievements ua ON ua.user_id = u.id AND ua.achievement_id = a.id
        WHERE a.is_active = true;

        CREATE VIEW tournament_leaderboard AS
        SELECT 
            t.id as tournament_id,
            t.name as tournament_name,
            u.username,
            up.display_name,
            tp.position,
            tp.prize_won,
            tp.eliminated_at,
            tp.registered_at
        FROM tournament_participants tp
        JOIN tournaments t ON t.id = tp.tournament_id
        JOIN users u ON u.id = tp.user_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE tp.position IS NOT NULL
        ORDER BY t.id, tp.position;

        -- Create materialized views
        CREATE MATERIALIZED VIEW user_leaderboard AS
        SELECT 
            u.id,
            u.username,
            up.display_name,
            up.avatar_url,
            vl.name as vip_level,
            COALESCE(SUM(gs.games_won), 0) as total_wins,
            COALESCE(SUM(gs.total_won - gs.total_bet), 0) as net_winnings,
            COALESCE(uw.balance, 0) as current_balance,
            ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(gs.total_won - gs.total_bet), 0) DESC) as rank
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN user_vip_status uvs ON uvs.user_id = u.id
        LEFT JOIN vip_levels vl ON vl.id = uvs.level_id
        LEFT JOIN game_statistics gs ON gs.user_id = u.id
        LEFT JOIN user_wallets uw ON uw.user_id = u.id AND uw.currency = 'COINS'
        WHERE u.status = 'active'
        GROUP BY u.id, u.username, up.display_name, up.avatar_url, vl.name, uw.balance
        ORDER BY net_winnings DESC;

        CREATE MATERIALIZED VIEW daily_statistics AS
        SELECT 
            DATE(created_at) as stat_date,
            COUNT(DISTINCT user_id) as active_users,
            COUNT(*) as total_games,
            SUM(CASE WHEN final_balance > buy_in THEN 1 ELSE 0 END) as winning_sessions,
            AVG(buy_in) as avg_buy_in,
            SUM(buy_in) as total_volume
        FROM game_sessions
        WHERE final_balance IS NOT NULL
        GROUP BY DATE(created_at)
        ORDER BY stat_date DESC;

        CREATE MATERIALIZED VIEW game_performance AS
        SELECT 
            g.id,
            g.name,
            g.type,
            COUNT(DISTINCT gs.user_id) as unique_players,
            COUNT(gs.id) as total_sessions,
            AVG(gs.buy_in) as avg_buy_in,
            SUM(gs.buy_in) as total_volume,
            AVG(CASE WHEN gs.final_balance > gs.buy_in THEN 1.0 ELSE 0.0 END) as win_rate
        FROM games g
        LEFT JOIN game_rooms gr ON gr.game_id = g.id
        LEFT JOIN game_sessions gs ON gs.room_id = gr.id AND gs.final_balance IS NOT NULL
        GROUP BY g.id, g.name, g.type
        ORDER BY total_volume DESC;

        -- Create indexes for materialized views
        CREATE UNIQUE INDEX idx_user_leaderboard_id ON user_leaderboard(id);
        CREATE INDEX idx_user_leaderboard_rank ON user_leaderboard(rank);
        CREATE UNIQUE INDEX idx_daily_statistics_date ON daily_statistics(stat_date);
        CREATE UNIQUE INDEX idx_game_performance_id ON game_performance(id);

        -- Create utility functions
        CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
        RETURNS VOID AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY user_leaderboard;
            REFRESH MATERIALIZED VIEW CONCURRENTLY daily_statistics;
            REFRESH MATERIALIZED VIEW CONCURRENTLY game_performance;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION get_user_rank(p_user_id UUID)
        RETURNS INTEGER AS $$
        DECLARE
            user_rank INTEGER;
        BEGIN
            SELECT rank INTO user_rank
            FROM user_leaderboard
            WHERE id = p_user_id;
            
            RETURN COALESCE(user_rank, 0);
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION get_top_players(p_limit INTEGER DEFAULT 10)
        RETURNS TABLE(
            username VARCHAR(50),
            display_name VARCHAR(100),
            vip_level VARCHAR(50),
            total_wins BIGINT,
            net_winnings DECIMAL(15,2),
            rank BIGINT
        ) AS $$
        BEGIN
            RETURN QUERY
            SELECT 
                ul.username,
                ul.display_name,
                ul.vip_level,
                ul.total_wins,
                ul.net_winnings,
                ul.rank
            FROM user_leaderboard ul
            ORDER BY ul.rank
            LIMIT p_limit;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION get_user_game_stats(p_user_id UUID)
        RETURNS TABLE(
            game_name VARCHAR(100),
            games_played INTEGER,
            games_won INTEGER,
            win_rate DECIMAL(5,2),
            total_bet DECIMAL(15,2),
            total_won DECIMAL(15,2),
            net_result DECIMAL(15,2)
        ) AS $$
        BEGIN
            RETURN QUERY
            SELECT 
                g.name,
                gs.games_played,
                gs.games_won,
                CASE WHEN gs.games_played > 0 
                     THEN ROUND((gs.games_won::DECIMAL / gs.games_played::DECIMAL) * 100, 2)
                     ELSE 0.00 
                END as win_rate,
                gs.total_bet,
                gs.total_won,
                (gs.total_won - gs.total_bet) as net_result
            FROM game_statistics gs
            JOIN games g ON g.id = gs.game_id
            WHERE gs.user_id = p_user_id
            ORDER BY gs.games_played DESC;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION get_user_recent_activity(p_user_id UUID, p_limit INTEGER DEFAULT 10)
        RETURNS TABLE(
            activity_type VARCHAR(50),
            description TEXT,
            amount DECIMAL(15,2),
            created_at TIMESTAMP WITH TIME ZONE
        ) AS $$
        BEGIN
            RETURN QUERY
            (
                SELECT 
                    'transaction'::VARCHAR(50) as activity_type,
                    CONCAT(t.type, ': ', t.description) as description,
                    t.amount,
                    t.created_at
                FROM transactions t
                WHERE t.user_id = p_user_id
                
                UNION ALL
                
                SELECT 
                    'game_session'::VARCHAR(50) as activity_type,
                    CONCAT('Played ', g.name) as description,
                    gs.buy_in as amount,
                    gs.created_at
                FROM game_sessions gs
                JOIN game_rooms gr ON gr.id = gs.room_id
                JOIN games g ON g.id = gr.game_id
                WHERE gs.user_id = p_user_id
                
                UNION ALL
                
                SELECT 
                    'achievement'::VARCHAR(50) as activity_type,
                    CONCAT('Completed: ', a.name) as description,
                    0.00 as amount,
                    ua.completed_at as created_at
                FROM user_achievements ua
                JOIN achievements a ON a.id = ua.achievement_id
                WHERE ua.user_id = p_user_id AND ua.completed_at IS NOT NULL
            )
            ORDER BY created_at DESC
            LIMIT p_limit;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION cleanup_old_data(p_days INTEGER DEFAULT 90)
        RETURNS TABLE(
            table_name TEXT,
            deleted_count INTEGER
        ) AS $$
        DECLARE
            deleted_sessions INTEGER;
            deleted_logs INTEGER;
            deleted_notifications INTEGER;
        BEGIN
            -- Clean up expired user sessions
            DELETE FROM user_sessions WHERE expires_at < NOW() - INTERVAL '1 day';
            GET DIAGNOSTICS deleted_sessions = ROW_COUNT;
            
            -- Clean up old audit logs
            DELETE FROM audit_logs WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
            GET DIAGNOSTICS deleted_logs = ROW_COUNT;
            
            -- Clean up old read notifications
            DELETE FROM notifications 
            WHERE is_read = true AND created_at < NOW() - (p_days || ' days')::INTERVAL;
            GET DIAGNOSTICS deleted_notifications = ROW_COUNT;
            
            RETURN QUERY VALUES 
                ('user_sessions'::TEXT, deleted_sessions),
                ('audit_logs'::TEXT, deleted_logs),
                ('notifications'::TEXT, deleted_notifications);
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION scheduled_maintenance()
        RETURNS TEXT AS $$
        DECLARE
            result TEXT := '';
        BEGIN
            -- Refresh materialized views
            PERFORM refresh_all_materialized_views();
            result := result || 'Materialized views refreshed. ';
            
            -- Clean up old data
            PERFORM cleanup_old_data(90);
            result := result || 'Old data cleaned up. ';
            
            -- Update VIP levels based on spending
            UPDATE user_vip_status uvs
            SET level_id = (
                SELECT vl.id 
                FROM vip_levels vl 
                WHERE vl.min_points <= uvs.points 
                ORDER BY vl.min_points DESC 
                LIMIT 1
            )
            WHERE EXISTS (
                SELECT 1 FROM vip_levels vl 
                WHERE vl.min_points <= uvs.points 
                AND vl.id != uvs.level_id
            );
            result := result || 'VIP levels updated. ';
            
            -- Analyze tables for better query performance
            ANALYZE;
            result := result || 'Database analyzed.';
            
            RETURN result;
        END;
        $$ LANGUAGE plpgsql;

        -- Add comments to views
        COMMENT ON VIEW user_summary IS 'Comprehensive user information including profile, wallet, and VIP status';
        COMMENT ON VIEW game_room_summary IS 'Active and recent game rooms with game and creator details';
        COMMENT ON VIEW transaction_summary IS 'Transaction history with user information';
        COMMENT ON VIEW active_games IS 'Currently active or waiting game rooms';
        COMMENT ON VIEW user_achievements_progress IS 'User progress on all achievements';
        COMMENT ON VIEW tournament_leaderboard IS 'Tournament results and rankings';
        
        COMMENT ON MATERIALIZED VIEW user_leaderboard IS 'User rankings based on net winnings and performance';
        COMMENT ON MATERIALIZED VIEW daily_statistics IS 'Daily platform usage and game statistics';
        COMMENT ON MATERIALIZED VIEW game_performance IS 'Performance metrics for each game type';

        -- Record migration
        INSERT INTO schema_migrations (version, description) VALUES ('004', 'Views, materialized views, and utility functions');
        
        RAISE NOTICE 'Migration 004 applied successfully';
    ELSE
        RAISE NOTICE 'Migration 004 already applied, skipping';
    END IF;
END
$$;

-- Final setup and verification
\echo 'Performing final setup and verification...'

-- Create database roles
DO $$
BEGIN
    -- Create application role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'higgs_app') THEN
        CREATE ROLE higgs_app WITH LOGIN PASSWORD 'change_this_password';
        RAISE NOTICE 'Created higgs_app role';
    END IF;
    
    -- Create read-only role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'higgs_readonly') THEN
        CREATE ROLE higgs_readonly WITH LOGIN PASSWORD 'change_this_readonly_password';
        RAISE NOTICE 'Created higgs_readonly role';
    END IF;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Insufficient privileges to create roles. Please create them manually.';
END
$$;

-- Grant permissions
DO $$
BEGIN
    -- Grant permissions to application role
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO higgs_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO higgs_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO higgs_app;
    
    -- Grant read-only permissions
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO higgs_readonly;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO higgs_readonly;
    
    RAISE NOTICE 'Permissions granted successfully';
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Insufficient privileges to grant permissions. Please grant them manually.';
END
$$;

-- Insert default admin user
DO $$
DECLARE
    admin_user_id UUID;
    bronze_level_id UUID;
BEGIN
    -- Check if admin user already exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin') THEN
        -- Get bronze VIP level ID
        SELECT id INTO bronze_level_id FROM vip_levels WHERE level = 1;
        
        -- Insert admin user
        INSERT INTO users (username, email, password_hash, role, email_verified, status)
        VALUES ('admin', 'admin@higgsdomino.com', crypt('admin123', gen_salt('bf')), 'super_admin', true, 'active')
        RETURNING id INTO admin_user_id;
        
        -- Insert admin profile
        INSERT INTO user_profiles (user_id, display_name, bio)
        VALUES (admin_user_id, 'System Administrator', 'Default system administrator account');
        
        -- Insert admin wallet
        INSERT INTO user_wallets (user_id, currency, balance)
        VALUES (admin_user_id, 'COINS', 10000.00);
        
        -- Insert admin VIP status
        INSERT INTO user_vip_status (user_id, level_id, points)
        VALUES (admin_user_id, bronze_level_id, 0);
        
        RAISE NOTICE 'Default admin user created (username: admin, password: admin123)';
        RAISE WARNING 'SECURITY: Please change the default admin password immediately!';
    ELSE
        RAISE NOTICE 'Admin user already exists, skipping creation';
    END IF;
END
$$;

-- Refresh materialized views
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'user_leaderboard') THEN
        REFRESH MATERIALIZED VIEW user_leaderboard;
        REFRESH MATERIALIZED VIEW daily_statistics;
        REFRESH MATERIALIZED VIEW game_performance;
        RAISE NOTICE 'Materialized views refreshed';
    END IF;
END
$$;

-- Create additional performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username_lower ON users(LOWER(username));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_reference ON transactions(reference_type, reference_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_sessions_active ON game_sessions(is_active) WHERE is_active = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- Analyze tables for optimal query planning
ANALYZE;

-- Final verification
DO $$
DECLARE
    table_count INTEGER;
    view_count INTEGER;
    function_count INTEGER;
    migration_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    SELECT COUNT(*) INTO view_count FROM information_schema.views WHERE table_schema = 'public';
    SELECT COUNT(*) INTO function_count FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
    SELECT COUNT(*) INTO migration_count FROM schema_migrations;
    
    RAISE NOTICE 'Database setup verification:';
    RAISE NOTICE '- Tables created: %', table_count;
    RAISE NOTICE '- Views created: %', view_count;
    RAISE NOTICE '- Functions created: %', function_count;
    RAISE NOTICE '- Migrations applied: %', migration_count;
    
    -- Verify critical tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        RAISE EXCEPTION 'Critical table "users" not found!';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'games') THEN
        RAISE EXCEPTION 'Critical table "games" not found!';
    END IF;
    
    RAISE NOTICE 'All critical tables verified successfully';
END
$$;

-- Log the database initialization
INSERT INTO audit_logs (action, resource_type, new_values)
VALUES ('database_initialized', 'system', '{"timestamp": "' || NOW() || '", "version": "1.0.0"}');

COMMIT;

\echo '========================================'
\echo 'Higgs Domino Database Setup Complete!'
\echo '========================================'
\echo 'Next steps:'
\echo '1. Change default admin password (username: admin, password: admin123)'
\echo '2. Create application-specific database users'
\echo '3. Configure connection strings in your application'
\echo '4. Run application tests to verify connectivity'
\echo '========================================'