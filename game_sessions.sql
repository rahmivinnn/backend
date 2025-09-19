-- =============================================
-- GAME SESSIONS DATABASE SCHEMA
-- Room Management & Matchmaking System
-- =============================================

-- Game room types and configurations
CREATE TABLE room_types (
    room_type_id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- classic, tournament, private, quick_match
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Room settings
    min_players INTEGER DEFAULT 2,
    max_players INTEGER DEFAULT 4,
    entry_fee BIGINT DEFAULT 0, -- coins required to join
    winner_reward BIGINT DEFAULT 0,
    
    -- Game rules
    game_mode VARCHAR(30) NOT NULL, -- domino_classic, domino_gaple, domino_qiuqiu
    time_limit_seconds INTEGER DEFAULT 300, -- 5 minutes per turn
    auto_kick_inactive BOOLEAN DEFAULT TRUE,
    
    -- Requirements
    min_level INTEGER DEFAULT 1,
    is_premium_only BOOLEAN DEFAULT FALSE,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Active game rooms
CREATE TABLE game_rooms (
    room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_type_id INTEGER REFERENCES room_types(room_type_id),
    room_code VARCHAR(10) UNIQUE, -- for private rooms
    
    -- Room owner and settings
    owner_user_id BIGINT REFERENCES users(user_id),
    room_name VARCHAR(100),
    password_hash VARCHAR(255), -- for password protected rooms
    
    -- Current state
    status VARCHAR(20) DEFAULT 'waiting', -- waiting, playing, finished
    current_players INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 4,
    
    -- Game configuration
    entry_fee BIGINT DEFAULT 0,
    winner_reward BIGINT DEFAULT 0,
    game_mode VARCHAR(30) NOT NULL,
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour')
);

-- Players in rooms
CREATE TABLE room_players (
    room_id UUID REFERENCES game_rooms(room_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Player state
    seat_number INTEGER NOT NULL, -- 1-4
    player_status VARCHAR(20) DEFAULT 'joined', -- joined, ready, playing, disconnected, left
    
    -- Game specific data
    current_score INTEGER DEFAULT 0,
    cards_in_hand JSONB, -- encrypted card data
    is_turn BOOLEAN DEFAULT FALSE,
    
    -- Timing
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_action_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (room_id, user_id)
);

-- Game sessions (completed games)
CREATE TABLE game_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES game_rooms(room_id),
    room_type_id INTEGER REFERENCES room_types(room_type_id),
    
    -- Session info
    game_mode VARCHAR(30) NOT NULL,
    total_players INTEGER NOT NULL,
    
    -- Results
    winner_user_id BIGINT REFERENCES users(user_id),
    winning_score INTEGER,
    total_rounds INTEGER DEFAULT 0,
    
    -- Economic impact
    total_entry_fees BIGINT DEFAULT 0,
    total_rewards_paid BIGINT DEFAULT 0,
    house_commission BIGINT DEFAULT 0, -- platform fee
    
    -- Timing
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP NOT NULL,
    duration_seconds INTEGER GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (finished_at - started_at))) STORED
);

-- Individual player results
CREATE TABLE session_players (
    session_id UUID REFERENCES game_sessions(session_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id),
    
    -- Game performance
    final_score INTEGER NOT NULL,
    final_position INTEGER NOT NULL, -- 1st, 2nd, 3rd, 4th
    rounds_won INTEGER DEFAULT 0,
    
    -- Economic
    entry_fee_paid BIGINT DEFAULT 0,
    reward_earned BIGINT DEFAULT 0,
    net_gain BIGINT GENERATED ALWAYS AS (reward_earned - entry_fee_paid) STORED,
    
    -- Statistics
    cards_played INTEGER DEFAULT 0,
    special_moves INTEGER DEFAULT 0, -- domino specific moves
    time_taken_seconds INTEGER DEFAULT 0,
    
    PRIMARY KEY (session_id, user_id)
);

-- Game moves/actions log
CREATE TABLE game_moves (
    move_id BIGSERIAL PRIMARY KEY,
    session_id UUID REFERENCES game_sessions(session_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id),
    
    -- Move details
    round_number INTEGER NOT NULL,
    move_sequence INTEGER NOT NULL,
    move_type VARCHAR(30) NOT NULL, -- place_domino, draw_card, pass, special_action
    move_data JSONB NOT NULL, -- card played, position, etc.
    
    -- Validation
    is_valid BOOLEAN DEFAULT TRUE,
    validation_hash VARCHAR(255), -- for anti-cheat
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_taken_ms INTEGER DEFAULT 0
);

-- Matchmaking queue
CREATE TABLE matchmaking_queue (
    queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    room_type_id INTEGER REFERENCES room_types(room_type_id),
    
    -- Player preferences
    preferred_game_mode VARCHAR(30),
    max_entry_fee BIGINT DEFAULT 0,
    skill_rating INTEGER DEFAULT 1000, -- ELO-like rating
    
    -- Queue state
    status VARCHAR(20) DEFAULT 'searching', -- searching, matched, cancelled
    priority_score INTEGER DEFAULT 0, -- for queue prioritization
    
    -- Timing
    joined_queue_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estimated_wait_seconds INTEGER DEFAULT 30,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes')
);

-- Tournament system
CREATE TABLE tournaments (
    tournament_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Tournament settings
    tournament_type VARCHAR(30) DEFAULT 'elimination', -- elimination, round_robin, swiss
    entry_fee BIGINT DEFAULT 0,
    prize_pool BIGINT DEFAULT 0,
    max_participants INTEGER DEFAULT 64,
    
    -- Requirements
    min_level INTEGER DEFAULT 1,
    min_rating INTEGER DEFAULT 0,
    is_premium_only BOOLEAN DEFAULT FALSE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'upcoming', -- upcoming, registration, active, finished
    current_participants INTEGER DEFAULT 0,
    current_round INTEGER DEFAULT 0,
    
    -- Timing
    registration_starts_at TIMESTAMP,
    registration_ends_at TIMESTAMP,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournament participants
CREATE TABLE tournament_participants (
    tournament_id UUID REFERENCES tournaments(tournament_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Participant info
    seed_number INTEGER, -- tournament seeding
    current_round INTEGER DEFAULT 0,
    is_eliminated BOOLEAN DEFAULT FALSE,
    final_position INTEGER,
    
    -- Rewards
    prize_earned BIGINT DEFAULT 0,
    
    -- Timing
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    eliminated_at TIMESTAMP,
    
    PRIMARY KEY (tournament_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_game_rooms_status ON game_rooms(status);
CREATE INDEX idx_game_rooms_owner ON game_rooms(owner_user_id);
CREATE INDEX idx_game_rooms_expires ON game_rooms(expires_at);
CREATE INDEX idx_room_players_user ON room_players(user_id);
CREATE INDEX idx_room_players_status ON room_players(player_status);
CREATE INDEX idx_game_sessions_winner ON game_sessions(winner_user_id);
CREATE INDEX idx_game_sessions_finished ON game_sessions(finished_at);
CREATE INDEX idx_session_players_user ON session_players(user_id);
CREATE INDEX idx_game_moves_session ON game_moves(session_id);
CREATE INDEX idx_game_moves_user ON game_moves(user_id);
CREATE INDEX idx_matchmaking_status ON matchmaking_queue(status);
CREATE INDEX idx_matchmaking_user ON matchmaking_queue(user_id);
CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournament_participants_user ON tournament_participants(user_id);

-- Views for common queries
CREATE VIEW active_rooms AS
SELECT 
    gr.*,
    rt.display_name as room_type_name,
    rt.game_mode,
    u.display_name as owner_name
FROM game_rooms gr
JOIN room_types rt ON gr.room_type_id = rt.room_type_id
JOIN users u ON gr.owner_user_id = u.user_id
WHERE gr.status IN ('waiting', 'playing')
AND gr.expires_at > CURRENT_TIMESTAMP;

CREATE VIEW user_game_history AS
SELECT 
    sp.user_id,
    gs.session_id,
    gs.game_mode,
    sp.final_position,
    sp.final_score,
    sp.net_gain,
    gs.finished_at
FROM session_players sp
JOIN game_sessions gs ON sp.session_id = gs.session_id
ORDER BY gs.finished_at DESC;