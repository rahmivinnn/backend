-- Migration: 002_game_features.sql
-- Description: Add game rooms, sessions, transactions, and tournament features
-- Created: 2024-01-01
-- Author: Database Team
-- Depends on: 001_initial_setup.sql

BEGIN;

-- Check if migration has already been run
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '002') THEN
        RAISE EXCEPTION 'Migration 002 has already been applied';
    END IF;
END
$$;

-- Game rooms table
CREATE TABLE game_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    room_name VARCHAR(100) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    status game_status DEFAULT 'waiting',
    current_players INTEGER DEFAULT 0,
    max_players INTEGER NOT NULL,
    min_bet DECIMAL(15,2) NOT NULL,
    max_bet DECIMAL(15,2) NOT NULL,
    is_private BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255),
    settings JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game sessions table (user participation in game rooms)
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seat_number INTEGER,
    buy_in_amount DECIMAL(15,2) NOT NULL,
    current_balance DECIMAL(15,2) DEFAULT 0.00,
    final_balance DECIMAL(15,2),
    is_active BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_room_id, user_id),
    UNIQUE(game_room_id, seat_number)
);

-- Game hands/rounds table
CREATE TABLE game_hands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    hand_number INTEGER NOT NULL,
    dealer_user_id UUID REFERENCES users(id),
    winner_user_id UUID REFERENCES users(id),
    pot_amount DECIMAL(15,2) DEFAULT 0.00,
    game_data JSONB DEFAULT '{}', -- cards, moves, etc.
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_room_id, hand_number)
);

-- Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type transaction_type NOT NULL,
    status transaction_status DEFAULT 'pending',
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    balance_before DECIMAL(15,2),
    balance_after DECIMAL(15,2),
    reference_id UUID, -- game_room_id, tournament_id, etc.
    reference_type VARCHAR(50), -- 'game', 'tournament', 'bonus', etc.
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
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    game_hand_id UUID REFERENCES game_hands(id) ON DELETE CASCADE,
    bet_amount DECIMAL(15,2) NOT NULL,
    win_amount DECIMAL(15,2) DEFAULT 0.00,
    bet_type VARCHAR(50), -- 'ante', 'call', 'raise', 'side_bet', etc.
    bet_data JSONB DEFAULT '{}',
    is_winner BOOLEAN DEFAULT FALSE,
    placed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
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
    buy_in_amount DECIMAL(15,2) NOT NULL,
    prize_pool DECIMAL(15,2) DEFAULT 0.00,
    max_participants INTEGER,
    current_participants INTEGER DEFAULT 0,
    min_participants INTEGER DEFAULT 2,
    structure JSONB DEFAULT '{}', -- blind levels, payouts, etc.
    registration_start TIMESTAMP WITH TIME ZONE,
    registration_end TIMESTAMP WITH TIME ZONE,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tournament participants table
CREATE TABLE tournament_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    buy_in_paid DECIMAL(15,2) NOT NULL,
    current_chips INTEGER DEFAULT 0,
    final_position INTEGER,
    prize_won DECIMAL(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    eliminated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tournament_id, user_id)
);

-- Lucky wheel spins table
CREATE TABLE lucky_wheel_spins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    spin_cost DECIMAL(15,2) DEFAULT 0.00,
    prize_type VARCHAR(50), -- 'coins', 'bonus', 'item', 'nothing'
    prize_value DECIMAL(15,2) DEFAULT 0.00,
    prize_description TEXT,
    spin_result JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily bonuses table
CREATE TABLE daily_bonuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bonus_date DATE NOT NULL,
    bonus_amount DECIMAL(15,2) NOT NULL,
    consecutive_days INTEGER DEFAULT 1,
    bonus_multiplier DECIMAL(5,2) DEFAULT 1.00,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, bonus_date)
);

-- Achievements table
CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50), -- 'games', 'social', 'spending', 'time'
    icon_url TEXT,
    requirements JSONB NOT NULL, -- conditions to unlock
    rewards JSONB DEFAULT '{}', -- coins, items, titles, etc.
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User achievements table
CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    progress JSONB DEFAULT '{}',
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    rewards_claimed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- Create indexes for performance
CREATE INDEX idx_game_rooms_status ON game_rooms(status);
CREATE INDEX idx_game_rooms_created_by ON game_rooms(created_by);
CREATE INDEX idx_game_rooms_game_id ON game_rooms(game_id);

CREATE INDEX idx_game_sessions_user_id ON game_sessions(user_id);
CREATE INDEX idx_game_sessions_game_room_id ON game_sessions(game_room_id);
CREATE INDEX idx_game_sessions_active ON game_sessions(is_active);

CREATE INDEX idx_game_hands_game_room_id ON game_hands(game_room_id);
CREATE INDEX idx_game_hands_winner ON game_hands(winner_user_id);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_reference ON transactions(reference_id, reference_type);

CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_game_room_id ON bets(game_room_id);
CREATE INDEX idx_bets_game_hand_id ON bets(game_hand_id);

CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_start_time ON tournaments(start_time);
CREATE INDEX idx_tournaments_game_id ON tournaments(game_id);

CREATE INDEX idx_tournament_participants_tournament_id ON tournament_participants(tournament_id);
CREATE INDEX idx_tournament_participants_user_id ON tournament_participants(user_id);

CREATE INDEX idx_lucky_wheel_spins_user_id ON lucky_wheel_spins(user_id);
CREATE INDEX idx_daily_bonuses_user_id ON daily_bonuses(user_id);
CREATE INDEX idx_daily_bonuses_date ON daily_bonuses(bonus_date);

CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_completed ON user_achievements(is_completed);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_game_rooms_updated_at BEFORE UPDATE ON game_rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_game_sessions_updated_at BEFORE UPDATE ON game_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_achievements_updated_at BEFORE UPDATE ON achievements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_achievements_updated_at BEFORE UPDATE ON user_achievements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default achievements
INSERT INTO achievements (name, description, category, requirements, rewards) VALUES
('First Game', 'Play your first game', 'games', '{"games_played": 1}', '{"coins": 100}'),
('Winner', 'Win your first game', 'games', '{"games_won": 1}', '{"coins": 500}'),
('High Roller', 'Place a bet of 100 or more', 'games', '{"max_bet": 100}', '{"coins": 1000}'),
('Lucky Streak', 'Win 5 games in a row', 'games', '{"consecutive_wins": 5}', '{"coins": 2500}'),
('Social Butterfly', 'Add 10 friends', 'social', '{"friends_count": 10}', '{"coins": 200}'),
('Daily Player', 'Play for 7 consecutive days', 'time', '{"consecutive_days": 7}', '{"coins": 1500}'),
('Big Spender', 'Spend 1000 coins total', 'spending', '{"total_spent": 1000}', '{"coins": 500}'),
('Tournament Champion', 'Win a tournament', 'games', '{"tournaments_won": 1}', '{"coins": 5000}'),
('VIP Member', 'Reach Silver VIP level', 'spending', '{"vip_level": 1}', '{"coins": 2000}'),
('Domino Master', 'Win 100 domino games', 'games', '{"domino_wins": 100}', '{"coins": 10000}');

-- Create additional utility functions
CREATE OR REPLACE FUNCTION calculate_win_rate(p_user_id UUID, p_game_type VARCHAR(50) DEFAULT NULL)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_games INTEGER;
    won_games INTEGER;
    win_rate DECIMAL(5,2);
BEGIN
    -- Count total games
    SELECT COUNT(*)
    INTO total_games
    FROM game_sessions gs
    JOIN game_rooms gr ON gs.game_room_id = gr.id
    JOIN games g ON gr.game_id = g.id
    WHERE gs.user_id = p_user_id
    AND gr.status = 'finished'
    AND (p_game_type IS NULL OR g.game_type = p_game_type);
    
    -- Count won games (simplified - user with highest final balance wins)
    SELECT COUNT(*)
    INTO won_games
    FROM game_sessions gs
    JOIN game_rooms gr ON gs.game_room_id = gr.id
    JOIN games g ON gr.game_id = g.id
    WHERE gs.user_id = p_user_id
    AND gr.status = 'finished'
    AND (p_game_type IS NULL OR g.game_type = p_game_type)
    AND gs.final_balance > gs.buy_in_amount;
    
    IF total_games = 0 THEN
        RETURN 0.00;
    END IF;
    
    win_rate := (won_games::DECIMAL / total_games::DECIMAL) * 100;
    RETURN ROUND(win_rate, 2);
END;
$$ LANGUAGE plpgsql;

-- Function to update game room player count
CREATE OR REPLACE FUNCTION update_game_room_players()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE game_rooms 
        SET current_players = current_players + 1
        WHERE id = NEW.game_room_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE game_rooms 
        SET current_players = current_players - 1
        WHERE id = OLD.game_room_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle active status changes
        IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
            UPDATE game_rooms 
            SET current_players = current_players - 1
            WHERE id = NEW.game_room_id;
        ELSIF OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
            UPDATE game_rooms 
            SET current_players = current_players + 1
            WHERE id = NEW.game_room_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for game room player count
CREATE TRIGGER trigger_update_game_room_players
    AFTER INSERT OR UPDATE OR DELETE ON game_sessions
    FOR EACH ROW EXECUTE FUNCTION update_game_room_players();

-- Function to update tournament participants count
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

-- Create trigger for tournament participants count
CREATE TRIGGER trigger_update_tournament_participants
    AFTER INSERT OR DELETE ON tournament_participants
    FOR EACH ROW EXECUTE FUNCTION update_tournament_participants();

-- Record migration
INSERT INTO schema_migrations (version, description) 
VALUES ('002', 'Add game rooms, sessions, transactions, tournaments, and achievement features');

COMMIT;

-- Verify migration
DO $$
BEGIN
    -- Check if all new tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_rooms') THEN
        RAISE EXCEPTION 'Migration failed: game_rooms table not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
        RAISE EXCEPTION 'Migration failed: transactions table not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tournaments') THEN
        RAISE EXCEPTION 'Migration failed: tournaments table not created';
    END IF;
    
    -- Check if default achievements exist
    IF NOT EXISTS (SELECT 1 FROM achievements WHERE name = 'First Game') THEN
        RAISE EXCEPTION 'Migration failed: default achievements not inserted';
    END IF;
    
    RAISE NOTICE 'Migration 002 completed successfully';
END
$$;