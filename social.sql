-- =============================================
-- SOCIAL FEATURES DATABASE SCHEMA
-- Friends, Chat, Clans & Social System
-- =============================================

-- Friend system
CREATE TABLE friendships (
    friendship_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    addressee_user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Friendship status
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, blocked, declined
    
    -- Interaction tracking
    games_played_together INTEGER DEFAULT 0,
    last_played_together TIMESTAMP,
    
    -- Timing
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    
    -- Ensure no duplicate friendships
    CONSTRAINT unique_friendship UNIQUE (requester_user_id, addressee_user_id),
    CONSTRAINT no_self_friendship CHECK (requester_user_id != addressee_user_id)
);

-- Chat channels
CREATE TABLE chat_channels (
    channel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type VARCHAR(20) NOT NULL, -- global, room, private, clan
    channel_name VARCHAR(100),
    
    -- Channel settings
    is_public BOOLEAN DEFAULT TRUE,
    max_members INTEGER DEFAULT 0, -- 0 = unlimited
    requires_invitation BOOLEAN DEFAULT FALSE,
    
    -- Moderation
    is_moderated BOOLEAN DEFAULT TRUE,
    auto_delete_messages_hours INTEGER DEFAULT 0, -- 0 = never delete
    
    -- Reference to related entity
    reference_type VARCHAR(30), -- game_room, clan, tournament
    reference_id VARCHAR(255),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT REFERENCES users(user_id)
);

-- Chat channel members
CREATE TABLE chat_members (
    channel_id UUID REFERENCES chat_channels(channel_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Member role and permissions
    role VARCHAR(20) DEFAULT 'member', -- owner, admin, moderator, member
    can_send_messages BOOLEAN DEFAULT TRUE,
    can_invite_others BOOLEAN DEFAULT FALSE,
    
    -- Activity tracking
    last_read_message_id UUID,
    unread_count INTEGER DEFAULT 0,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Status
    is_muted BOOLEAN DEFAULT FALSE,
    muted_until TIMESTAMP,
    
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
);

-- Chat messages
CREATE TABLE chat_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES chat_channels(channel_id) ON DELETE CASCADE,
    sender_user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    
    -- Message content
    message_type VARCHAR(20) DEFAULT 'text', -- text, image, sticker, system, gift
    content TEXT NOT NULL,
    formatted_content JSONB, -- rich text formatting, mentions, etc.
    
    -- Media attachments
    attachments JSONB, -- [{"type": "image", "url": "...", "thumbnail": "..."}]
    
    -- Message metadata
    reply_to_message_id UUID REFERENCES chat_messages(message_id),
    is_edited BOOLEAN DEFAULT FALSE,
    edit_count INTEGER DEFAULT 0,
    
    -- Moderation
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_by BIGINT REFERENCES users(user_id),
    deleted_reason TEXT,
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP
);

-- Message reactions/emojis
CREATE TABLE message_reactions (
    message_id UUID REFERENCES chat_messages(message_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Reaction details
    emoji_code VARCHAR(50) NOT NULL, -- unicode emoji or custom emoji code
    emoji_url VARCHAR(500), -- for custom emojis
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id, emoji_code)
);

-- Clans/Guilds system
CREATE TABLE clans (
    clan_id SERIAL PRIMARY KEY,
    clan_name VARCHAR(50) UNIQUE NOT NULL,
    clan_tag VARCHAR(10) UNIQUE NOT NULL, -- [TAG] format
    description TEXT,
    
    -- Clan settings
    clan_type VARCHAR(20) DEFAULT 'open', -- open, invite_only, closed
    max_members INTEGER DEFAULT 50,
    current_members INTEGER DEFAULT 1,
    
    -- Requirements
    min_level_required INTEGER DEFAULT 1,
    min_trophies_required INTEGER DEFAULT 0,
    requires_approval BOOLEAN DEFAULT FALSE,
    
    -- Clan stats
    total_trophies BIGINT DEFAULT 0,
    clan_score BIGINT DEFAULT 0,
    wars_won INTEGER DEFAULT 0,
    wars_lost INTEGER DEFAULT 0,
    
    -- Visual customization
    clan_badge_id INTEGER DEFAULT 1,
    clan_color VARCHAR(7) DEFAULT '#FF0000', -- hex color
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT REFERENCES users(user_id)
);

-- Clan members
CREATE TABLE clan_members (
    clan_id INTEGER REFERENCES clans(clan_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Member role
    role VARCHAR(20) DEFAULT 'member', -- leader, co_leader, elder, member
    
    -- Contribution tracking
    trophies_contributed BIGINT DEFAULT 0,
    donations_given INTEGER DEFAULT 0,
    donations_received INTEGER DEFAULT 0,
    
    -- Activity
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_activity_score INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (clan_id, user_id)
);

-- Clan join requests
CREATE TABLE clan_join_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clan_id INTEGER REFERENCES clans(clan_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Request details
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, cancelled
    
    -- Processing
    processed_by BIGINT REFERENCES users(user_id),
    processed_at TIMESTAMP,
    rejection_reason TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clan_id, user_id)
);

-- Clan wars/competitions
CREATE TABLE clan_wars (
    war_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Participating clans
    clan_1_id INTEGER REFERENCES clans(clan_id),
    clan_2_id INTEGER REFERENCES clans(clan_id),
    
    -- War settings
    war_type VARCHAR(30) DEFAULT 'classic', -- classic, tournament, friendly
    max_participants_per_clan INTEGER DEFAULT 10,
    
    -- Scoring
    clan_1_score INTEGER DEFAULT 0,
    clan_2_score INTEGER DEFAULT 0,
    winner_clan_id INTEGER REFERENCES clans(clan_id),
    
    -- Status and timing
    status VARCHAR(20) DEFAULT 'preparation', -- preparation, active, finished, cancelled
    preparation_starts_at TIMESTAMP NOT NULL,
    war_starts_at TIMESTAMP NOT NULL,
    war_ends_at TIMESTAMP NOT NULL,
    
    -- Rewards
    winner_reward BIGINT DEFAULT 0,
    participation_reward BIGINT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clan war participants
CREATE TABLE clan_war_participants (
    war_id UUID REFERENCES clan_wars(war_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    clan_id INTEGER REFERENCES clans(clan_id),
    
    -- Participation stats
    battles_fought INTEGER DEFAULT 0,
    battles_won INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (war_id, user_id)
);

-- User blocks/reports
CREATE TABLE user_blocks (
    blocker_user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    blocked_user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Block details
    reason VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_user_id, blocked_user_id),
    CONSTRAINT no_self_block CHECK (blocker_user_id != blocked_user_id)
);

-- User reports
CREATE TABLE user_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    reported_user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Report details
    report_type VARCHAR(30) NOT NULL, -- cheating, harassment, inappropriate_content, spam
    description TEXT NOT NULL,
    evidence_urls JSONB, -- screenshots, videos, etc.
    
    -- Context
    context_type VARCHAR(30), -- game_session, chat_message, profile
    context_id VARCHAR(255),
    
    -- Processing
    status VARCHAR(20) DEFAULT 'pending', -- pending, investigating, resolved, dismissed
    assigned_to BIGINT, -- moderator user_id
    resolution TEXT,
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Social activities/feed
CREATE TABLE social_activities (
    activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Activity details
    activity_type VARCHAR(30) NOT NULL, -- achievement, level_up, high_score, clan_join
    title VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Activity data
    activity_data JSONB, -- specific data for each activity type
    
    -- Visibility
    visibility VARCHAR(20) DEFAULT 'friends', -- public, friends, clan, private
    
    -- Engagement
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity likes
CREATE TABLE activity_likes (
    activity_id UUID REFERENCES social_activities(activity_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (activity_id, user_id)
);

-- Activity comments
CREATE TABLE activity_comments (
    comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES social_activities(activity_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Comment content
    content TEXT NOT NULL,
    
    -- Moderation
    is_deleted BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_friendships_requester ON friendships(requester_user_id, status);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_user_id, status);
CREATE INDEX idx_chat_members_user ON chat_members(user_id);
CREATE INDEX idx_chat_members_channel ON chat_members(channel_id);
CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id, created_at);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_user_id);
CREATE INDEX idx_clan_members_user ON clan_members(user_id);
CREATE INDEX idx_clan_members_clan ON clan_members(clan_id, role);
CREATE INDEX idx_clan_join_requests_clan ON clan_join_requests(clan_id, status);
CREATE INDEX idx_clan_join_requests_user ON clan_join_requests(user_id);
CREATE INDEX idx_user_blocks_blocker ON user_blocks(blocker_user_id);
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_user_id);
CREATE INDEX idx_user_reports_reporter ON user_reports(reporter_user_id);
CREATE INDEX idx_user_reports_reported ON user_reports(reported_user_id, status);
CREATE INDEX idx_social_activities_user ON social_activities(user_id, created_at);
CREATE INDEX idx_social_activities_type ON social_activities(activity_type, created_at);

-- Views for common queries
CREATE VIEW user_friends AS
SELECT 
    f.requester_user_id as user_id,
    f.addressee_user_id as friend_user_id,
    u.display_name as friend_name,
    u.avatar_url as friend_avatar,
    u.level as friend_level,
    u.last_login_at as friend_last_login,
    f.games_played_together,
    f.accepted_at as friends_since
FROM friendships f
JOIN users u ON f.addressee_user_id = u.user_id
WHERE f.status = 'accepted'

UNION ALL

SELECT 
    f.addressee_user_id as user_id,
    f.requester_user_id as friend_user_id,
    u.display_name as friend_name,
    u.avatar_url as friend_avatar,
    u.level as friend_level,
    u.last_login_at as friend_last_login,
    f.games_played_together,
    f.accepted_at as friends_since
FROM friendships f
JOIN users u ON f.requester_user_id = u.user_id
WHERE f.status = 'accepted';

CREATE VIEW clan_leaderboard AS
SELECT 
    c.clan_id,
    c.clan_name,
    c.clan_tag,
    c.current_members,
    c.total_trophies,
    c.clan_score,
    c.wars_won,
    c.wars_lost,
    CASE 
        WHEN (c.wars_won + c.wars_lost) > 0 
        THEN ROUND((c.wars_won::DECIMAL / (c.wars_won + c.wars_lost)) * 100, 2)
        ELSE 0 
    END as win_rate,
    ROW_NUMBER() OVER (ORDER BY c.clan_score DESC, c.total_trophies DESC) as rank
FROM clans c
WHERE c.is_active = TRUE
ORDER BY c.clan_score DESC, c.total_trophies DESC;

CREATE VIEW recent_chat_channels AS
SELECT 
    ch.channel_id,
    ch.channel_name,
    ch.channel_type,
    cm.user_id,
    cm.unread_count,
    cm.last_active_at,
    (
        SELECT content 
        FROM chat_messages msg 
        WHERE msg.channel_id = ch.channel_id 
        AND msg.is_deleted = FALSE
        ORDER BY msg.created_at DESC 
        LIMIT 1
    ) as last_message,
    (
        SELECT created_at 
        FROM chat_messages msg 
        WHERE msg.channel_id = ch.channel_id 
        AND msg.is_deleted = FALSE
        ORDER BY msg.created_at DESC 
        LIMIT 1
    ) as last_message_at
FROM chat_channels ch
JOIN chat_members cm ON ch.channel_id = cm.channel_id
WHERE ch.is_active = TRUE
ORDER BY cm.last_active_at DESC;