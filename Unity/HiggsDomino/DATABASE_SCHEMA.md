# Higgs Domino Database Schema

## Overview

This document outlines the database schema used for the Higgs Domino game. The database is designed to store user information, game data, transactions, and other related information.

## Tables

### Users

Stores user account information.

```sql
CREATE TABLE users (
    user_id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    device_id VARCHAR(255),
    fcm_token VARCHAR(255)
);
```

### User_Profiles

Stores user profile information.

```sql
CREATE TABLE user_profiles (
    profile_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) UNIQUE NOT NULL,
    avatar VARCHAR(255) DEFAULT 'default.png',
    level INT DEFAULT 1,
    experience INT DEFAULT 0,
    coins INT DEFAULT 1000,
    gems INT DEFAULT 50,
    vip_level INT DEFAULT 0,
    vip_expires TIMESTAMP,
    games_played INT DEFAULT 0,
    games_won INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

### User_Stats

Stores user game statistics.

```sql
CREATE TABLE user_stats (
    stat_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) UNIQUE NOT NULL,
    total_score INT DEFAULT 0,
    highest_score INT DEFAULT 0,
    longest_winning_streak INT DEFAULT 0,
    current_winning_streak INT DEFAULT 0,
    total_time_played INT DEFAULT 0, -- in seconds
    total_tiles_played INT DEFAULT 0,
    total_games_blocked INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

### Game_Types

Stores different types of domino games.

```sql
CREATE TABLE game_types (
    game_type_id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    min_players INT NOT NULL,
    max_players INT NOT NULL,
    default_rounds INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Rooms

Stores game room information.

```sql
CREATE TABLE rooms (
    room_id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    host_id VARCHAR(36) NOT NULL,
    game_type_id VARCHAR(36) NOT NULL,
    max_players INT NOT NULL,
    rounds INT DEFAULT 1,
    entry_fee INT DEFAULT 0,
    is_private BOOLEAN DEFAULT FALSE,
    password VARCHAR(255),
    status VARCHAR(20) DEFAULT 'waiting', -- waiting, in_progress, ended
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (host_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (game_type_id) REFERENCES game_types(game_type_id)
);
```

### Room_Players

Stores players in a room.

```sql
CREATE TABLE room_players (
    room_player_id VARCHAR(36) PRIMARY KEY,
    room_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    is_ready BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (room_id, user_id)
);
```

### Games

Stores game information.

```sql
CREATE TABLE games (
    game_id VARCHAR(36) PRIMARY KEY,
    room_id VARCHAR(36) NOT NULL,
    game_type_id VARCHAR(36) NOT NULL,
    status VARCHAR(20) DEFAULT 'in_progress', -- in_progress, ended
    winner_id VARCHAR(36),
    rounds INT NOT NULL,
    current_round INT DEFAULT 1,
    entry_fee INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (game_type_id) REFERENCES game_types(game_type_id),
    FOREIGN KEY (winner_id) REFERENCES users(user_id)
);
```

### Game_Players

Stores players in a game.

```sql
CREATE TABLE game_players (
    game_player_id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    score INT DEFAULT 0,
    is_winner BOOLEAN DEFAULT FALSE,
    reward INT DEFAULT 0,
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (game_id, user_id)
);
```

### Game_Rounds

Stores round information for each game.

```sql
CREATE TABLE game_rounds (
    round_id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    round_number INT NOT NULL,
    winner_id VARCHAR(36),
    status VARCHAR(20) DEFAULT 'in_progress', -- in_progress, ended
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    FOREIGN KEY (winner_id) REFERENCES users(user_id),
    UNIQUE (game_id, round_number)
);
```

### Round_Players

Stores player information for each round.

```sql
CREATE TABLE round_players (
    round_player_id VARCHAR(36) PRIMARY KEY,
    round_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    score INT DEFAULT 0,
    hand_value INT DEFAULT 0,
    is_winner BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (round_id) REFERENCES game_rounds(round_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (round_id, user_id)
);
```

### Game_Moves

Stores moves made during a game.

```sql
CREATE TABLE game_moves (
    move_id VARCHAR(36) PRIMARY KEY,
    round_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    move_type VARCHAR(20) NOT NULL, -- play, draw, skip
    tile_left INT,
    tile_right INT,
    position VARCHAR(10), -- left, right, first
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (round_id) REFERENCES game_rounds(round_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

### Items

Stores items available in the store.

```sql
CREATE TABLE items (
    item_id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- avatars, themes, emotes
    coin_price INT,
    gem_price INT,
    image_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### User_Items

Stores items owned by users.

```sql
CREATE TABLE user_items (
    user_item_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    item_id VARCHAR(36) NOT NULL,
    is_equipped BOOLEAN DEFAULT FALSE,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    UNIQUE (user_id, item_id)
);
```

### Transactions

Stores user transactions.

```sql
CREATE TABLE transactions (
    transaction_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL, -- purchase, reward, gift
    amount INT NOT NULL,
    currency VARCHAR(10) NOT NULL, -- coins, gems
    description TEXT,
    reference_id VARCHAR(36), -- item_id, game_id, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

### Friends

Stores user friendships.

```sql
CREATE TABLE friends (
    friendship_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    friend_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (user_id, friend_id)
);
```

### Friend_Requests

Stores friend requests.

```sql
CREATE TABLE friend_requests (
    request_id VARCHAR(36) PRIMARY KEY,
    sender_id VARCHAR(36) NOT NULL,
    receiver_id VARCHAR(36) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (sender_id, receiver_id)
);
```

### Chat_Messages

Stores chat messages.

```sql
CREATE TABLE chat_messages (
    message_id VARCHAR(36) PRIMARY KEY,
    room_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

### Leaderboards

Stores leaderboard information.

```sql
CREATE TABLE leaderboards (
    leaderboard_id VARCHAR(36) PRIMARY KEY,
    type VARCHAR(20) NOT NULL, -- daily, weekly, monthly, all_time
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Leaderboard_Entries

Stores leaderboard entries.

```sql
CREATE TABLE leaderboard_entries (
    entry_id VARCHAR(36) PRIMARY KEY,
    leaderboard_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    score INT DEFAULT 0,
    rank INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (leaderboard_id) REFERENCES leaderboards(leaderboard_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (leaderboard_id, user_id)
);
```

### User_Sessions

Stores user session information.

```sql
CREATE TABLE user_sessions (
    session_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    device_info TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

### Notifications

Stores user notifications.

```sql
CREATE TABLE notifications (
    notification_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL, -- friend_request, game_invitation, system
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    reference_id VARCHAR(36), -- friend_request_id, room_id, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

## Indexes

```sql
-- Users table indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);

-- User_Profiles table indexes
CREATE INDEX idx_user_profiles_level ON user_profiles(level);
CREATE INDEX idx_user_profiles_games_played ON user_profiles(games_played);
CREATE INDEX idx_user_profiles_games_won ON user_profiles(games_won);

-- User_Stats table indexes
CREATE INDEX idx_user_stats_total_score ON user_stats(total_score);
CREATE INDEX idx_user_stats_highest_score ON user_stats(highest_score);

-- Rooms table indexes
CREATE INDEX idx_rooms_host_id ON rooms(host_id);
CREATE INDEX idx_rooms_game_type_id ON rooms(game_type_id);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_is_private ON rooms(is_private);

-- Room_Players table indexes
CREATE INDEX idx_room_players_room_id ON room_players(room_id);
CREATE INDEX idx_room_players_user_id ON room_players(user_id);

-- Games table indexes
CREATE INDEX idx_games_room_id ON games(room_id);
CREATE INDEX idx_games_game_type_id ON games(game_type_id);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_winner_id ON games(winner_id);

-- Game_Players table indexes
CREATE INDEX idx_game_players_game_id ON game_players(game_id);
CREATE INDEX idx_game_players_user_id ON game_players(user_id);
CREATE INDEX idx_game_players_score ON game_players(score);

-- Game_Rounds table indexes
CREATE INDEX idx_game_rounds_game_id ON game_rounds(game_id);
CREATE INDEX idx_game_rounds_winner_id ON game_rounds(winner_id);
CREATE INDEX idx_game_rounds_status ON game_rounds(status);

-- Round_Players table indexes
CREATE INDEX idx_round_players_round_id ON round_players(round_id);
CREATE INDEX idx_round_players_user_id ON round_players(user_id);
CREATE INDEX idx_round_players_score ON round_players(score);

-- Game_Moves table indexes
CREATE INDEX idx_game_moves_round_id ON game_moves(round_id);
CREATE INDEX idx_game_moves_user_id ON game_moves(user_id);
CREATE INDEX idx_game_moves_move_type ON game_moves(move_type);

-- Items table indexes
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_items_is_active ON items(is_active);

-- User_Items table indexes
CREATE INDEX idx_user_items_user_id ON user_items(user_id);
CREATE INDEX idx_user_items_item_id ON user_items(item_id);
CREATE INDEX idx_user_items_is_equipped ON user_items(is_equipped);

-- Transactions table indexes
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_currency ON transactions(currency);

-- Friends table indexes
CREATE INDEX idx_friends_user_id ON friends(user_id);
CREATE INDEX idx_friends_friend_id ON friends(friend_id);

-- Friend_Requests table indexes
CREATE INDEX idx_friend_requests_sender_id ON friend_requests(sender_id);
CREATE INDEX idx_friend_requests_receiver_id ON friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_status ON friend_requests(status);

-- Chat_Messages table indexes
CREATE INDEX idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- Leaderboards table indexes
CREATE INDEX idx_leaderboards_type ON leaderboards(type);
CREATE INDEX idx_leaderboards_start_date ON leaderboards(start_date);
CREATE INDEX idx_leaderboards_end_date ON leaderboards(end_date);

-- Leaderboard_Entries table indexes
CREATE INDEX idx_leaderboard_entries_leaderboard_id ON leaderboard_entries(leaderboard_id);
CREATE INDEX idx_leaderboard_entries_user_id ON leaderboard_entries(user_id);
CREATE INDEX idx_leaderboard_entries_score ON leaderboard_entries(score);
CREATE INDEX idx_leaderboard_entries_rank ON leaderboard_entries(rank);

-- User_Sessions table indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Notifications table indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
```

## Relationships

- A User has one User_Profile and one User_Stats
- A User can create multiple Rooms (as host)
- A User can join multiple Rooms (as player)
- A Room belongs to one Game_Type
- A Room can have multiple Room_Players
- A Room can have one Game
- A Game belongs to one Room
- A Game can have multiple Game_Players
- A Game can have multiple Game_Rounds
- A Game_Round can have multiple Round_Players
- A Game_Round can have multiple Game_Moves
- A User can own multiple Items (through User_Items)
- A User can have multiple Transactions
- A User can have multiple Friends
- A User can send and receive multiple Friend_Requests
- A User can have multiple Chat_Messages
- A User can have multiple Leaderboard_Entries
- A User can have multiple User_Sessions
- A User can have multiple Notifications

## Views

### Active_Rooms_View

Shows active rooms with player count.

```sql
CREATE VIEW active_rooms_view AS
SELECT 
    r.room_id,
    r.name,
    r.host_id,
    u.username AS host_name,
    r.game_type_id,
    gt.name AS game_type_name,
    r.max_players,
    COUNT(rp.user_id) AS current_players,
    r.rounds,
    r.entry_fee,
    r.is_private,
    r.status,
    r.created_at
FROM rooms r
JOIN users u ON r.host_id = u.user_id
JOIN game_types gt ON r.game_type_id = gt.game_type_id
LEFT JOIN room_players rp ON r.room_id = rp.room_id
WHERE r.status = 'waiting'
GROUP BY r.room_id, r.name, r.host_id, u.username, r.game_type_id, gt.name, r.max_players, r.rounds, r.entry_fee, r.is_private, r.status, r.created_at;
```

### User_Leaderboard_View

Shows user leaderboard information.

```sql
CREATE VIEW user_leaderboard_view AS
SELECT 
    u.user_id,
    u.username,
    up.avatar,
    up.level,
    us.total_score AS score,
    up.games_played,
    up.games_won,
    CASE WHEN up.games_played > 0 THEN (up.games_won * 100.0 / up.games_played) ELSE 0 END AS win_rate
FROM users u
JOIN user_profiles up ON u.user_id = up.user_id
JOIN user_stats us ON u.user_id = us.user_id
WHERE u.is_active = TRUE
ORDER BY us.total_score DESC;
```

### Game_History_View

Shows game history information.

```sql
CREATE VIEW game_history_view AS
SELECT 
    g.game_id,
    g.room_id,
    r.name AS room_name,
    gt.name AS game_type,
    g.winner_id,
    u.username AS winner_name,
    g.rounds,
    g.entry_fee,
    g.created_at,
    g.ended_at,
    EXTRACT(EPOCH FROM (g.ended_at - g.created_at)) AS duration_seconds
FROM games g
JOIN rooms r ON g.room_id = r.room_id
JOIN game_types gt ON g.game_type_id = gt.game_type_id
LEFT JOIN users u ON g.winner_id = u.user_id
WHERE g.status = 'ended';
```

### User_Inventory_View

Shows user inventory information.

```sql
CREATE VIEW user_inventory_view AS
SELECT 
    ui.user_item_id,
    ui.user_id,
    i.item_id,
    i.name,
    i.description,
    i.category,
    i.image_url,
    ui.is_equipped,
    ui.acquired_at
FROM user_items ui
JOIN items i ON ui.item_id = i.item_id
ORDER BY ui.acquired_at DESC;
```

## Stored Procedures

### Create_Game

Creates a new game for a room.

```sql
CREATE OR REPLACE PROCEDURE create_game(
    p_room_id VARCHAR(36),
    p_game_id VARCHAR(36)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_game_type_id VARCHAR(36);
    v_max_players INT;
    v_entry_fee INT;
    v_rounds INT;
    v_player RECORD;
BEGIN
    -- Get room information
    SELECT game_type_id, max_players, entry_fee, rounds
    INTO v_game_type_id, v_max_players, v_entry_fee, v_rounds
    FROM rooms
    WHERE room_id = p_room_id;
    
    -- Create game
    INSERT INTO games (game_id, room_id, game_type_id, rounds, entry_fee)
    VALUES (p_game_id, p_room_id, v_game_type_id, v_rounds, v_entry_fee);
    
    -- Add players to game
    FOR v_player IN SELECT user_id FROM room_players WHERE room_id = p_room_id
    LOOP
        INSERT INTO game_players (game_player_id, game_id, user_id)
        VALUES (uuid_generate_v4(), p_game_id, v_player.user_id);
        
        -- Deduct entry fee from player
        IF v_entry_fee > 0 THEN
            UPDATE user_profiles
            SET coins = coins - v_entry_fee
            WHERE user_id = v_player.user_id;
            
            -- Record transaction
            INSERT INTO transactions (transaction_id, user_id, type, amount, currency, description, reference_id)
            VALUES (uuid_generate_v4(), v_player.user_id, 'entry_fee', v_entry_fee, 'coins', 'Game entry fee', p_game_id);
        END IF;
    END LOOP;
    
    -- Create first round
    INSERT INTO game_rounds (round_id, game_id, round_number)
    VALUES (uuid_generate_v4(), p_game_id, 1);
    
    -- Update room status
    UPDATE rooms
    SET status = 'in_progress'
    WHERE room_id = p_room_id;
    
    COMMIT;
END;
$$;
```

### End_Round

Ends a round and updates scores.

```sql
CREATE OR REPLACE PROCEDURE end_round(
    p_round_id VARCHAR(36),
    p_winner_id VARCHAR(36)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_game_id VARCHAR(36);
    v_round_number INT;
    v_total_rounds INT;
    v_player RECORD;
    v_winner_score INT;
    v_next_round_id VARCHAR(36);
BEGIN
    -- Get round information
    SELECT gr.game_id, gr.round_number, g.rounds
    INTO v_game_id, v_round_number, v_total_rounds
    FROM game_rounds gr
    JOIN games g ON gr.game_id = g.game_id
    WHERE gr.round_id = p_round_id;
    
    -- Update round status and winner
    UPDATE game_rounds
    SET status = 'ended', winner_id = p_winner_id, ended_at = NOW()
    WHERE round_id = p_round_id;
    
    -- Calculate winner score based on other players' hand values
    v_winner_score := 0;
    
    FOR v_player IN SELECT user_id, hand_value FROM round_players WHERE round_id = p_round_id AND user_id != p_winner_id
    LOOP
        v_winner_score := v_winner_score + v_player.hand_value;
        
        -- Update player score
        UPDATE round_players
        SET score = 0
        WHERE round_id = p_round_id AND user_id = v_player.user_id;
    END LOOP;
    
    -- Update winner score and status
    UPDATE round_players
    SET score = v_winner_score, is_winner = TRUE
    WHERE round_id = p_round_id AND user_id = p_winner_id;
    
    -- Update game player scores
    FOR v_player IN SELECT user_id, score FROM round_players WHERE round_id = p_round_id
    LOOP
        UPDATE game_players
        SET score = score + v_player.score
        WHERE game_id = v_game_id AND user_id = v_player.user_id;
    END LOOP;
    
    -- Check if this was the last round
    IF v_round_number = v_total_rounds THEN
        -- End the game
        CALL end_game(v_game_id);
    ELSE
        -- Create next round
        v_next_round_id := uuid_generate_v4();
        
        INSERT INTO game_rounds (round_id, game_id, round_number)
        VALUES (v_next_round_id, v_game_id, v_round_number + 1);
        
        -- Update game current round
        UPDATE games
        SET current_round = v_round_number + 1
        WHERE game_id = v_game_id;
    END IF;
    
    COMMIT;
END;
$$;
```

### End_Game

Ends a game and distributes rewards.

```sql
CREATE OR REPLACE PROCEDURE end_game(
    p_game_id VARCHAR(36)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_room_id VARCHAR(36);
    v_entry_fee INT;
    v_total_reward INT;
    v_winner_id VARCHAR(36);
    v_winner_reward INT;
    v_player RECORD;
    v_player_count INT;
BEGIN
    -- Get game information
    SELECT room_id, entry_fee
    INTO v_room_id, v_entry_fee
    FROM games
    WHERE game_id = p_game_id;
    
    -- Count players
    SELECT COUNT(*)
    INTO v_player_count
    FROM game_players
    WHERE game_id = p_game_id;
    
    -- Calculate total reward
    v_total_reward := v_entry_fee * v_player_count;
    
    -- Find winner (player with highest score)
    SELECT user_id
    INTO v_winner_id
    FROM game_players
    WHERE game_id = p_game_id
    ORDER BY score DESC
    LIMIT 1;
    
    -- Calculate winner reward (90% of total)
    v_winner_reward := v_total_reward * 0.9;
    
    -- Update game status and winner
    UPDATE games
    SET status = 'ended', winner_id = v_winner_id, ended_at = NOW()
    WHERE game_id = p_game_id;
    
    -- Update winner status and reward
    UPDATE game_players
    SET is_winner = TRUE, reward = v_winner_reward
    WHERE game_id = p_game_id AND user_id = v_winner_id;
    
    -- Add reward to winner's account
    UPDATE user_profiles
    SET coins = coins + v_winner_reward
    WHERE user_id = v_winner_id;
    
    -- Record transaction
    INSERT INTO transactions (transaction_id, user_id, type, amount, currency, description, reference_id)
    VALUES (uuid_generate_v4(), v_winner_id, 'reward', v_winner_reward, 'coins', 'Game reward', p_game_id);
    
    -- Update user stats
    FOR v_player IN SELECT gp.user_id, gp.is_winner FROM game_players gp WHERE gp.game_id = p_game_id
    LOOP
        -- Update games played
        UPDATE user_profiles
        SET games_played = games_played + 1
        WHERE user_id = v_player.user_id;
        
        -- Update games won for winner
        IF v_player.is_winner THEN
            UPDATE user_profiles
            SET games_won = games_won + 1
            WHERE user_id = v_player.user_id;
            
            -- Update winning streak
            UPDATE user_stats
            SET current_winning_streak = current_winning_streak + 1,
                longest_winning_streak = GREATEST(longest_winning_streak, current_winning_streak + 1)
            WHERE user_id = v_player.user_id;
        ELSE
            -- Reset winning streak for losers
            UPDATE user_stats
            SET current_winning_streak = 0
            WHERE user_id = v_player.user_id;
        END IF;
    END LOOP;
    
    -- Update room status
    UPDATE rooms
    SET status = 'waiting'
    WHERE room_id = v_room_id;
    
    COMMIT;
END;
$$;
```

### Update_Leaderboards

Updates leaderboards with new scores.

```sql
CREATE OR REPLACE PROCEDURE update_leaderboards()
LANGUAGE plpgsql
AS $$
DECLARE
    v_daily_id VARCHAR(36);
    v_weekly_id VARCHAR(36);
    v_monthly_id VARCHAR(36);
    v_all_time_id VARCHAR(36);
    v_today DATE;
    v_week_start DATE;
    v_month_start DATE;
    v_user RECORD;
BEGIN
    v_today := CURRENT_DATE;
    v_week_start := DATE_TRUNC('week', v_today)::DATE;
    v_month_start := DATE_TRUNC('month', v_today)::DATE;
    
    -- Get or create leaderboard IDs
    SELECT leaderboard_id INTO v_daily_id FROM leaderboards WHERE type = 'daily' AND start_date = v_today;
    IF NOT FOUND THEN
        v_daily_id := uuid_generate_v4();
        INSERT INTO leaderboards (leaderboard_id, type, start_date, end_date)
        VALUES (v_daily_id, 'daily', v_today, v_today);
    END IF;
    
    SELECT leaderboard_id INTO v_weekly_id FROM leaderboards WHERE type = 'weekly' AND start_date = v_week_start;
    IF NOT FOUND THEN
        v_weekly_id := uuid_generate_v4();
        INSERT INTO leaderboards (leaderboard_id, type, start_date, end_date)
        VALUES (v_weekly_id, 'weekly', v_week_start, v_week_start + INTERVAL '6 days');
    END IF;
    
    SELECT leaderboard_id INTO v_monthly_id FROM leaderboards WHERE type = 'monthly' AND start_date = v_month_start;
    IF NOT FOUND THEN
        v_monthly_id := uuid_generate_v4();
        INSERT INTO leaderboards (leaderboard_id, type, start_date, end_date)
        VALUES (v_monthly_id, 'monthly', v_month_start, (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE);
    END IF;
    
    SELECT leaderboard_id INTO v_all_time_id FROM leaderboards WHERE type = 'all_time';
    IF NOT FOUND THEN
        v_all_time_id := uuid_generate_v4();
        INSERT INTO leaderboards (leaderboard_id, type, start_date, end_date)
        VALUES (v_all_time_id, 'all_time', NULL, NULL);
    END IF;
    
    -- Update daily leaderboard
    FOR v_user IN 
        SELECT 
            u.user_id, 
            COALESCE(SUM(gp.score), 0) AS daily_score
        FROM 
            users u
            LEFT JOIN game_players gp ON u.user_id = gp.user_id
            LEFT JOIN games g ON gp.game_id = g.game_id
        WHERE 
            u.is_active = TRUE AND
            (g.ended_at IS NULL OR DATE(g.ended_at) = v_today)
        GROUP BY 
            u.user_id
    LOOP
        -- Insert or update daily entry
        INSERT INTO leaderboard_entries (entry_id, leaderboard_id, user_id, score)
        VALUES (uuid_generate_v4(), v_daily_id, v_user.user_id, v_user.daily_score)
        ON CONFLICT (leaderboard_id, user_id)
        DO UPDATE SET score = v_user.daily_score, updated_at = NOW();
    END LOOP;
    
    -- Update weekly leaderboard
    FOR v_user IN 
        SELECT 
            u.user_id, 
            COALESCE(SUM(gp.score), 0) AS weekly_score
        FROM 
            users u
            LEFT JOIN game_players gp ON u.user_id = gp.user_id
            LEFT JOIN games g ON gp.game_id = g.game_id
        WHERE 
            u.is_active = TRUE AND
            (g.ended_at IS NULL OR DATE(g.ended_at) BETWEEN v_week_start AND v_today)
        GROUP BY 
            u.user_id
    LOOP
        -- Insert or update weekly entry
        INSERT INTO leaderboard_entries (entry_id, leaderboard_id, user_id, score)
        VALUES (uuid_generate_v4(), v_weekly_id, v_user.user_id, v_user.weekly_score)
        ON CONFLICT (leaderboard_id, user_id)
        DO UPDATE SET score = v_user.weekly_score, updated_at = NOW();
    END LOOP;
    
    -- Update monthly leaderboard
    FOR v_user IN 
        SELECT 
            u.user_id, 
            COALESCE(SUM(gp.score), 0) AS monthly_score
        FROM 
            users u
            LEFT JOIN game_players gp ON u.user_id = gp.user_id
            LEFT JOIN games g ON gp.game_id = g.game_id
        WHERE 
            u.is_active = TRUE AND
            (g.ended_at IS NULL OR DATE(g.ended_at) BETWEEN v_month_start AND v_today)
        GROUP BY 
            u.user_id
    LOOP
        -- Insert or update monthly entry
        INSERT INTO leaderboard_entries (entry_id, leaderboard_id, user_id, score)
        VALUES (uuid_generate_v4(), v_monthly_id, v_user.user_id, v_user.monthly_score)
        ON CONFLICT (leaderboard_id, user_id)
        DO UPDATE SET score = v_user.monthly_score, updated_at = NOW();
    END LOOP;
    
    -- Update all-time leaderboard
    FOR v_user IN 
        SELECT 
            u.user_id, 
            us.total_score AS all_time_score
        FROM 
            users u
            JOIN user_stats us ON u.user_id = us.user_id
        WHERE 
            u.is_active = TRUE
    LOOP
        -- Insert or update all-time entry
        INSERT INTO leaderboard_entries (entry_id, leaderboard_id, user_id, score)
        VALUES (uuid_generate_v4(), v_all_time_id, v_user.user_id, v_user.all_time_score)
        ON CONFLICT (leaderboard_id, user_id)
        DO UPDATE SET score = v_user.all_time_score, updated_at = NOW();
    END LOOP;
    
    -- Update ranks for all leaderboards
    UPDATE leaderboard_entries le1
    SET rank = subquery.rank
    FROM (
        SELECT 
            entry_id,
            RANK() OVER (PARTITION BY leaderboard_id ORDER BY score DESC) as rank
        FROM 
            leaderboard_entries
    ) AS subquery
    WHERE le1.entry_id = subquery.entry_id;
    
    COMMIT;
END;
$$;
```

## Triggers

### Update_User_Stats_Trigger

Updates user stats after a game ends.

```sql
CREATE OR REPLACE FUNCTION update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update total score
    UPDATE user_stats
    SET total_score = total_score + NEW.score,
        highest_score = GREATEST(highest_score, NEW.score),
        updated_at = NOW()
    WHERE user_id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_stats_trigger
AFTER UPDATE OF score ON game_players
FOR EACH ROW
WHEN (OLD.score IS DISTINCT FROM NEW.score)
EXECUTE FUNCTION update_user_stats();
```

### Update_Game_Moves_Trigger

Updates user stats for tiles played.

```sql
CREATE OR REPLACE FUNCTION update_tiles_played()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.move_type = 'play' THEN
        -- Update total tiles played
        UPDATE user_stats
        SET total_tiles_played = total_tiles_played + 1,
            updated_at = NOW()
        WHERE user_id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tiles_played_trigger
AFTER INSERT ON game_moves
FOR EACH ROW
EXECUTE FUNCTION update_tiles_played();
```

### Update_Game_Blocked_Trigger

Updates user stats for blocked games.

```sql
CREATE OR REPLACE FUNCTION update_games_blocked()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'ended' AND OLD.status = 'in_progress' THEN
        -- Check if the round ended due to a blocked game
        IF EXISTS (
            SELECT 1 FROM game_moves
            WHERE round_id = NEW.round_id
            ORDER BY created_at DESC
            LIMIT 1
        ) THEN
            -- Update total games blocked for all players in the round
            UPDATE user_stats us
            SET total_games_blocked = total_games_blocked + 1,
                updated_at = NOW()
            FROM round_players rp
            WHERE rp.round_id = NEW.round_id AND rp.user_id = us.user_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_games_blocked_trigger
AFTER UPDATE OF status ON game_rounds
FOR EACH ROW
EXECUTE FUNCTION update_games_blocked();
```

### Update_Time_Played_Trigger

Updates user stats for time played.

```sql
CREATE OR REPLACE FUNCTION update_time_played()
RETURNS TRIGGER AS $$
DECLARE
    v_duration INT;
BEGIN
    IF NEW.status = 'ended' AND OLD.status = 'in_progress' AND NEW.ended_at IS NOT NULL THEN
        -- Calculate duration in seconds
        v_duration := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.created_at))::INT;
        
        -- Update total time played for all players in the game
        UPDATE user_stats us
        SET total_time_played = total_time_played + v_duration,
            updated_at = NOW()
        FROM game_players gp
        WHERE gp.game_id = NEW.game_id AND gp.user_id = us.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_time_played_trigger
AFTER UPDATE OF status ON games
FOR EACH ROW
EXECUTE FUNCTION update_time_played();
```

## Functions

### Get_User_Rank

Gets a user's rank in a leaderboard.

```sql
CREATE OR REPLACE FUNCTION get_user_rank(
    p_user_id VARCHAR(36),
    p_leaderboard_type VARCHAR(20)
)
RETURNS TABLE (
    rank INT,
    score INT
) AS $$
DECLARE
    v_leaderboard_id VARCHAR(36);
BEGIN
    -- Get the latest leaderboard of the specified type
    SELECT leaderboard_id INTO v_leaderboard_id
    FROM leaderboards
    WHERE type = p_leaderboard_type
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Return the user's rank and score
    RETURN QUERY
    SELECT le.rank, le.score
    FROM leaderboard_entries le
    WHERE le.leaderboard_id = v_leaderboard_id AND le.user_id = p_user_id;
    
    -- If no entry found, return NULL
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::INT, 0::INT;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

### Get_Leaderboard

Gets a leaderboard with pagination.

```sql
CREATE OR REPLACE FUNCTION get_leaderboard(
    p_leaderboard_type VARCHAR(20),
    p_page INT,
    p_page_size INT
)
RETURNS TABLE (
    rank INT,
    user_id VARCHAR(36),
    username VARCHAR(50),
    avatar VARCHAR(255),
    level INT,
    score INT,
    games_won INT,
    games_played INT
) AS $$
DECLARE
    v_leaderboard_id VARCHAR(36);
    v_offset INT;
BEGIN
    -- Calculate offset
    v_offset := (p_page - 1) * p_page_size;
    
    -- Get the latest leaderboard of the specified type
    SELECT leaderboard_id INTO v_leaderboard_id
    FROM leaderboards
    WHERE type = p_leaderboard_type
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Return the leaderboard entries with user information
    RETURN QUERY
    SELECT 
        le.rank,
        u.user_id,
        u.username,
        up.avatar,
        up.level,
        le.score,
        up.games_won,
        up.games_played
    FROM leaderboard_entries le
    JOIN users u ON le.user_id = u.user_id
    JOIN user_profiles up ON u.user_id = up.user_id
    WHERE le.leaderboard_id = v_leaderboard_id
    ORDER BY le.rank
    LIMIT p_page_size
    OFFSET v_offset;
END;
$$ LANGUAGE plpgsql;
```

### Get_User_Game_History

Gets a user's game history with pagination.

```sql
CREATE OR REPLACE FUNCTION get_user_game_history(
    p_user_id VARCHAR(36),
    p_page INT,
    p_page_size INT
)
RETURNS TABLE (
    game_id VARCHAR(36),
    room_name VARCHAR(100),
    game_type VARCHAR(50),
    score INT,
    is_winner BOOLEAN,
    reward INT,
    entry_fee INT,
    created_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_seconds INT
) AS $$
DECLARE
    v_offset INT;
BEGIN
    -- Calculate offset
    v_offset := (p_page - 1) * p_page_size;
    
    -- Return the user's game history
    RETURN QUERY
    SELECT 
        g.game_id,
        r.name AS room_name,
        gt.name AS game_type,
        gp.score,
        gp.is_winner,
        gp.reward,
        g.entry_fee,
        g.created_at,
        g.ended_at,
        EXTRACT(EPOCH FROM (g.ended_at - g.created_at))::INT AS duration_seconds
    FROM game_players gp
    JOIN games g ON gp.game_id = g.game_id
    JOIN rooms r ON g.room_id = r.room_id
    JOIN game_types gt ON g.game_type_id = gt.game_type_id
    WHERE gp.user_id = p_user_id AND g.status = 'ended'
    ORDER BY g.ended_at DESC
    LIMIT p_page_size
    OFFSET v_offset;
END;
$$ LANGUAGE plpgsql;
```