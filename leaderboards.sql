-- =============================================
-- LEADERBOARDS & RANKING DATABASE SCHEMA
-- Competitive Ranking System
-- =============================================

-- Leaderboard categories
CREATE TABLE leaderboard_categories (
    category_id SERIAL PRIMARY KEY,
    category_code VARCHAR(30) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    
    -- Category settings
    ranking_metric VARCHAR(30) NOT NULL, -- total_score, win_rate, coins_earned, level
    ranking_order VARCHAR(10) DEFAULT 'DESC', -- DESC or ASC
    
    -- Reset schedule
    reset_type VARCHAR(20) DEFAULT 'never', -- never, daily, weekly, monthly, season
    reset_day_of_week INTEGER, -- 1-7 for weekly reset
    reset_day_of_month INTEGER, -- 1-31 for monthly reset
    
    -- Participation requirements
    min_games_required INTEGER DEFAULT 0,
    min_level_required INTEGER DEFAULT 1,
    requires_premium BOOLEAN DEFAULT FALSE,
    
    -- Rewards
    has_rewards BOOLEAN DEFAULT TRUE,
    reward_distribution JSONB, -- {"1": {"COIN": 10000}, "2": {"COIN": 5000}}
    
    -- Display settings
    is_featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leaderboard seasons/periods
CREATE TABLE leaderboard_seasons (
    season_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id INTEGER REFERENCES leaderboard_categories(category_id),
    
    -- Season info
    season_name VARCHAR(100) NOT NULL,
    season_number INTEGER NOT NULL,
    
    -- Timing
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'upcoming', -- upcoming, active, ended, archived
    
    -- Participation
    total_participants INTEGER DEFAULT 0,
    min_score_threshold BIGINT DEFAULT 0,
    
    -- Rewards
    total_reward_pool BIGINT DEFAULT 0,
    rewards_distributed BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User rankings for each season
CREATE TABLE user_rankings (
    season_id UUID REFERENCES leaderboard_seasons(season_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Ranking data
    current_rank INTEGER,
    previous_rank INTEGER,
    best_rank INTEGER,
    
    -- Score metrics
    total_score BIGINT DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0.00,
    
    -- Additional metrics
    coins_earned BIGINT DEFAULT 0,
    highest_single_score BIGINT DEFAULT 0,
    average_score DECIMAL(10,2) DEFAULT 0.00,
    
    -- Streak tracking
    current_win_streak INTEGER DEFAULT 0,
    best_win_streak INTEGER DEFAULT 0,
    
    -- Participation tracking
    first_game_at TIMESTAMP,
    last_game_at TIMESTAMP,
    total_playtime_minutes INTEGER DEFAULT 0,
    
    -- Rewards
    season_reward_earned BIGINT DEFAULT 0,
    reward_claimed BOOLEAN DEFAULT FALSE,
    reward_claimed_at TIMESTAMP,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (season_id, user_id)
);

-- Daily/Weekly snapshots for trend analysis
CREATE TABLE ranking_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID REFERENCES leaderboard_seasons(season_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Snapshot data
    snapshot_date DATE NOT NULL,
    snapshot_type VARCHAR(10) NOT NULL, -- daily, weekly
    
    -- Rankings at snapshot time
    rank_position INTEGER NOT NULL,
    total_score BIGINT NOT NULL,
    games_played INTEGER NOT NULL,
    
    -- Changes since last snapshot
    rank_change INTEGER DEFAULT 0, -- positive = rank up, negative = rank down
    score_change BIGINT DEFAULT 0,
    games_change INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(season_id, user_id, snapshot_date, snapshot_type)
);

-- Achievement system
CREATE TABLE ranking_achievements (
    achievement_id SERIAL PRIMARY KEY,
    achievement_code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    
    -- Achievement criteria
    category_id INTEGER REFERENCES leaderboard_categories(category_id),
    achievement_type VARCHAR(30) NOT NULL, -- rank_position, score_milestone, streak, participation
    
    -- Conditions
    required_rank INTEGER, -- must reach this rank
    required_score BIGINT, -- must reach this score
    required_streak INTEGER, -- must achieve this streak
    required_games INTEGER, -- must play this many games
    required_seasons INTEGER, -- must participate in this many seasons
    
    -- Rewards
    reward_coins BIGINT DEFAULT 0,
    reward_gems INTEGER DEFAULT 0,
    reward_items JSONB, -- [{"item_id": 1, "quantity": 1}]
    
    -- Properties
    rarity VARCHAR(20) DEFAULT 'common',
    points INTEGER DEFAULT 0,
    is_repeatable BOOLEAN DEFAULT FALSE,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User achievement progress
CREATE TABLE user_ranking_achievements (
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    achievement_id INTEGER REFERENCES ranking_achievements(achievement_id),
    season_id UUID REFERENCES leaderboard_seasons(season_id),
    
    -- Progress tracking
    current_progress INTEGER DEFAULT 0,
    required_progress INTEGER NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    
    -- Completion details
    completed_at TIMESTAMP,
    reward_claimed BOOLEAN DEFAULT FALSE,
    reward_claimed_at TIMESTAMP,
    
    PRIMARY KEY (user_id, achievement_id, season_id)
);

-- Hall of Fame (all-time records)
CREATE TABLE hall_of_fame (
    record_id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES leaderboard_categories(category_id),
    record_type VARCHAR(30) NOT NULL, -- highest_score, longest_streak, most_wins
    
    -- Record holder
    user_id BIGINT REFERENCES users(user_id),
    user_display_name VARCHAR(100) NOT NULL, -- snapshot of name when record was set
    
    -- Record details
    record_value BIGINT NOT NULL,
    record_description TEXT,
    
    -- Context
    season_id UUID REFERENCES leaderboard_seasons(season_id),
    game_session_id UUID, -- reference to specific game if applicable
    
    -- Timing
    achieved_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one record per type per category
    UNIQUE(category_id, record_type)
);

-- Clan/Guild rankings
CREATE TABLE clan_rankings (
    season_id UUID REFERENCES leaderboard_seasons(season_id) ON DELETE CASCADE,
    clan_id INTEGER, -- reference to clans table (to be created)
    
    -- Clan ranking data
    current_rank INTEGER,
    previous_rank INTEGER,
    
    -- Aggregate scores
    total_clan_score BIGINT DEFAULT 0,
    average_member_score DECIMAL(10,2) DEFAULT 0.00,
    active_members INTEGER DEFAULT 0,
    
    -- Clan activities
    total_games_played INTEGER DEFAULT 0,
    total_games_won INTEGER DEFAULT 0,
    clan_win_rate DECIMAL(5,2) DEFAULT 0.00,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (season_id, clan_id)
);

-- Leaderboard rewards distribution log
CREATE TABLE reward_distributions (
    distribution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID REFERENCES leaderboard_seasons(season_id),
    
    -- Distribution details
    distribution_type VARCHAR(30) NOT NULL, -- season_end, weekly, daily
    total_rewards_distributed BIGINT NOT NULL,
    total_recipients INTEGER NOT NULL,
    
    -- Processing
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Metadata
    distribution_rules JSONB, -- rules used for this distribution
    error_log TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual reward records
CREATE TABLE user_reward_history (
    reward_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distribution_id UUID REFERENCES reward_distributions(distribution_id),
    user_id BIGINT REFERENCES users(user_id),
    
    -- Reward details
    rank_achieved INTEGER NOT NULL,
    reward_type VARCHAR(30) NOT NULL, -- coins, gems, items
    reward_amount BIGINT NOT NULL,
    
    -- Status
    is_claimed BOOLEAN DEFAULT FALSE,
    claimed_at TIMESTAMP,
    transaction_id UUID, -- reference to transaction record
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_user_rankings_season ON user_rankings(season_id);
CREATE INDEX idx_user_rankings_user ON user_rankings(user_id);
CREATE INDEX idx_user_rankings_rank ON user_rankings(season_id, current_rank);
CREATE INDEX idx_user_rankings_score ON user_rankings(season_id, total_score DESC);
CREATE INDEX idx_ranking_snapshots_user_date ON ranking_snapshots(user_id, snapshot_date);
CREATE INDEX idx_ranking_snapshots_season_date ON ranking_snapshots(season_id, snapshot_date);
CREATE INDEX idx_user_ranking_achievements_user ON user_ranking_achievements(user_id);
CREATE INDEX idx_hall_of_fame_category ON hall_of_fame(category_id);
CREATE INDEX idx_hall_of_fame_user ON hall_of_fame(user_id);
CREATE INDEX idx_reward_distributions_season ON reward_distributions(season_id);
CREATE INDEX idx_user_reward_history_user ON user_reward_history(user_id);
CREATE INDEX idx_user_reward_history_claimed ON user_reward_history(user_id, is_claimed);

-- Functions for ranking calculations
CREATE OR REPLACE FUNCTION calculate_user_rank(
    p_season_id UUID,
    p_user_id BIGINT
) RETURNS INTEGER AS $$
DECLARE
    user_rank INTEGER;
BEGIN
    SELECT rank() OVER (ORDER BY total_score DESC, games_won DESC, user_id ASC)
    INTO user_rank
    FROM user_rankings
    WHERE season_id = p_season_id
    AND user_id = p_user_id;
    
    RETURN COALESCE(user_rank, 0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_all_rankings(
    p_season_id UUID
) RETURNS VOID AS $$
BEGIN
    -- Update all user rankings for the season
    WITH ranked_users AS (
        SELECT 
            user_id,
            ROW_NUMBER() OVER (ORDER BY total_score DESC, games_won DESC, user_id ASC) as new_rank
        FROM user_rankings
        WHERE season_id = p_season_id
    )
    UPDATE user_rankings ur
    SET 
        previous_rank = current_rank,
        current_rank = ru.new_rank,
        best_rank = LEAST(COALESCE(best_rank, ru.new_rank), ru.new_rank),
        updated_at = CURRENT_TIMESTAMP
    FROM ranked_users ru
    WHERE ur.season_id = p_season_id
    AND ur.user_id = ru.user_id;
END;
$$ LANGUAGE plpgsql;

-- Views for common queries
CREATE VIEW current_season_rankings AS
SELECT 
    ur.current_rank,
    u.user_id,
    u.display_name,
    u.avatar_url,
    u.level,
    ur.total_score,
    ur.games_played,
    ur.games_won,
    ur.win_rate,
    ur.current_win_streak,
    lc.display_name as category_name
FROM user_rankings ur
JOIN users u ON ur.user_id = u.user_id
JOIN leaderboard_seasons ls ON ur.season_id = ls.season_id
JOIN leaderboard_categories lc ON ls.category_id = lc.category_id
WHERE ls.status = 'active'
ORDER BY lc.category_id, ur.current_rank;

CREATE VIEW top_players_summary AS
SELECT 
    u.user_id,
    u.display_name,
    u.avatar_url,
    COUNT(DISTINCT ur.season_id) as seasons_participated,
    AVG(ur.current_rank) as average_rank,
    MIN(ur.best_rank) as best_ever_rank,
    SUM(ur.total_score) as lifetime_score,
    SUM(ur.games_won) as total_wins
FROM user_rankings ur
JOIN users u ON ur.user_id = u.user_id
GROUP BY u.user_id, u.display_name, u.avatar_url
HAVING COUNT(DISTINCT ur.season_id) >= 3 -- at least 3 seasons
ORDER BY MIN(ur.best_rank), AVG(ur.current_rank);