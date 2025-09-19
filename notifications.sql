-- =============================================
-- NOTIFICATIONS & EVENTS DATABASE SCHEMA
-- Push Notifications, In-Game Events, Alerts
-- =============================================

-- Notification types/templates
CREATE TABLE notification_types (
    type_id SERIAL PRIMARY KEY,
    type_code VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Template settings
    title_template VARCHAR(200) NOT NULL,
    message_template TEXT NOT NULL,
    
    -- Delivery settings
    default_channels JSONB DEFAULT '["in_game"]', -- in_game, push, email, sms
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    
    -- Behavior settings
    is_actionable BOOLEAN DEFAULT FALSE,
    action_type VARCHAR(30), -- navigate, claim_reward, join_game, open_shop
    action_data JSONB,
    
    -- Grouping and batching
    can_be_grouped BOOLEAN DEFAULT FALSE,
    group_key_template VARCHAR(100), -- for grouping similar notifications
    max_group_size INTEGER DEFAULT 5,
    
    -- Expiration
    default_ttl_hours INTEGER DEFAULT 168, -- 7 days
    auto_dismiss BOOLEAN DEFAULT FALSE,
    
    -- Visual settings
    icon_url VARCHAR(500),
    color VARCHAR(7), -- hex color
    sound_id VARCHAR(50),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User notification preferences
CREATE TABLE user_notification_preferences (
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    type_code VARCHAR(50) REFERENCES notification_types(type_code),
    
    -- Channel preferences
    in_game_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT FALSE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    
    -- Timing preferences
    quiet_hours_start TIME, -- e.g., '22:00'
    quiet_hours_end TIME,   -- e.g., '08:00'
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Frequency limits
    max_per_hour INTEGER DEFAULT 0, -- 0 = unlimited
    max_per_day INTEGER DEFAULT 0,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, type_code)
);

-- User notifications
CREATE TABLE user_notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    type_code VARCHAR(50) REFERENCES notification_types(type_code),
    
    -- Content
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    rich_content JSONB, -- for rich formatting, images, etc.
    
    -- Delivery channels
    channels JSONB NOT NULL DEFAULT '["in_game"]',
    
    -- Action data
    is_actionable BOOLEAN DEFAULT FALSE,
    action_type VARCHAR(30),
    action_data JSONB,
    action_url VARCHAR(500),
    
    -- Grouping
    group_key VARCHAR(100),
    group_count INTEGER DEFAULT 1,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, delivered, read, dismissed, expired
    
    -- Delivery tracking
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    dismissed_at TIMESTAMP,
    
    -- Expiration
    expires_at TIMESTAMP,
    
    -- Priority and scheduling
    priority VARCHAR(20) DEFAULT 'normal',
    scheduled_for TIMESTAMP,
    
    -- Metadata
    source_type VARCHAR(30), -- system, game_event, user_action, admin
    source_id VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Push notification delivery log
CREATE TABLE push_delivery_log (
    delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES user_notifications(notification_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Device info
    device_token VARCHAR(500) NOT NULL,
    device_type VARCHAR(20) NOT NULL, -- ios, android, web
    
    -- Delivery details
    provider VARCHAR(20) NOT NULL, -- fcm, apns, web_push
    provider_message_id VARCHAR(255),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, delivered, failed, clicked
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Timing
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    clicked_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- In-game events system
CREATE TABLE game_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_code VARCHAR(50) UNIQUE NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Event type and category
    event_type VARCHAR(30) NOT NULL, -- limited_time, seasonal, tournament, special_offer
    category VARCHAR(30) NOT NULL, -- gameplay, social, economy, competition
    
    -- Timing
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Participation requirements
    min_level_required INTEGER DEFAULT 1,
    max_level_allowed INTEGER,
    requires_premium BOOLEAN DEFAULT FALSE,
    allowed_regions JSONB, -- ["US", "EU", "ASIA"]
    
    -- Event configuration
    event_config JSONB NOT NULL, -- event-specific settings
    rewards_config JSONB, -- reward structure
    
    -- Progress tracking
    total_participants INTEGER DEFAULT 0,
    active_participants INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, active, paused, ended, cancelled
    
    -- Visibility
    is_featured BOOLEAN DEFAULT FALSE,
    announcement_sent BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    banner_url VARCHAR(500),
    icon_url VARCHAR(500),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT REFERENCES users(user_id)
);

-- User event participation
CREATE TABLE user_event_participation (
    event_id UUID REFERENCES game_events(event_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Participation status
    status VARCHAR(20) DEFAULT 'active', -- active, completed, abandoned, disqualified
    
    -- Progress tracking
    current_progress JSONB DEFAULT '{}', -- event-specific progress data
    milestones_completed JSONB DEFAULT '[]', -- completed milestone IDs
    
    -- Scoring
    current_score BIGINT DEFAULT 0,
    best_score BIGINT DEFAULT 0,
    rank_position INTEGER,
    
    -- Rewards
    rewards_earned JSONB DEFAULT '[]',
    rewards_claimed BOOLEAN DEFAULT FALSE,
    rewards_claimed_at TIMESTAMP,
    
    -- Timing
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    PRIMARY KEY (event_id, user_id)
);

-- Event milestones/objectives
CREATE TABLE event_milestones (
    milestone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES game_events(event_id) ON DELETE CASCADE,
    
    -- Milestone details
    milestone_name VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    
    -- Completion criteria
    criteria_type VARCHAR(30) NOT NULL, -- score_threshold, games_played, items_collected
    criteria_value BIGINT NOT NULL,
    criteria_config JSONB,
    
    -- Rewards
    reward_type VARCHAR(30) NOT NULL, -- coins, gems, items, experience
    reward_amount BIGINT NOT NULL,
    reward_items JSONB,
    
    -- Properties
    is_repeatable BOOLEAN DEFAULT FALSE,
    is_hidden BOOLEAN DEFAULT FALSE, -- secret milestones
    
    -- Visual
    icon_url VARCHAR(500),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System alerts and announcements
CREATE TABLE system_announcements (
    announcement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Content
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    rich_content JSONB, -- HTML, markdown, or structured content
    
    -- Targeting
    target_type VARCHAR(20) DEFAULT 'all', -- all, level_range, region, premium, custom
    target_criteria JSONB, -- specific targeting rules
    
    -- Display settings
    announcement_type VARCHAR(30) NOT NULL, -- maintenance, update, event, promotion
    display_style VARCHAR(20) DEFAULT 'banner', -- banner, popup, toast, fullscreen
    
    -- Timing
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NOT NULL,
    
    -- Behavior
    is_dismissible BOOLEAN DEFAULT TRUE,
    auto_dismiss_seconds INTEGER DEFAULT 0, -- 0 = manual dismiss only
    max_displays_per_user INTEGER DEFAULT 0, -- 0 = unlimited
    
    -- Priority
    priority INTEGER DEFAULT 0, -- higher number = higher priority
    
    -- Action
    has_action BOOLEAN DEFAULT FALSE,
    action_text VARCHAR(50),
    action_url VARCHAR(500),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    image_url VARCHAR(500),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT REFERENCES users(user_id)
);

-- User announcement views
CREATE TABLE user_announcement_views (
    announcement_id UUID REFERENCES system_announcements(announcement_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- View tracking
    view_count INTEGER DEFAULT 1,
    first_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Interaction
    is_dismissed BOOLEAN DEFAULT FALSE,
    dismissed_at TIMESTAMP,
    action_clicked BOOLEAN DEFAULT FALSE,
    action_clicked_at TIMESTAMP,
    
    PRIMARY KEY (announcement_id, user_id)
);

-- Scheduled notification jobs
CREATE TABLE notification_jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Job details
    job_type VARCHAR(30) NOT NULL, -- single_user, bulk_users, event_trigger
    job_name VARCHAR(100) NOT NULL,
    
    -- Target users
    target_type VARCHAR(20) NOT NULL, -- specific_users, user_segment, all_users
    target_criteria JSONB, -- user selection criteria
    estimated_recipients INTEGER DEFAULT 0,
    
    -- Notification details
    notification_type_code VARCHAR(50) REFERENCES notification_types(type_code),
    title_template VARCHAR(200) NOT NULL,
    message_template TEXT NOT NULL,
    template_data JSONB, -- data for template variables
    
    -- Scheduling
    scheduled_for TIMESTAMP NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Execution tracking
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, running, completed, failed, cancelled
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Results
    notifications_sent INTEGER DEFAULT 0,
    notifications_delivered INTEGER DEFAULT 0,
    notifications_failed INTEGER DEFAULT 0,
    error_log TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT REFERENCES users(user_id)
);

-- Indexes for performance
CREATE INDEX idx_user_notifications_user ON user_notifications(user_id, status, created_at);
CREATE INDEX idx_user_notifications_type ON user_notifications(type_code, status);
CREATE INDEX idx_user_notifications_group ON user_notifications(group_key, user_id);
CREATE INDEX idx_user_notifications_expires ON user_notifications(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_push_delivery_log_notification ON push_delivery_log(notification_id);
CREATE INDEX idx_push_delivery_log_user ON push_delivery_log(user_id, status);
CREATE INDEX idx_game_events_status ON game_events(status, starts_at, ends_at);
CREATE INDEX idx_game_events_active ON game_events(status) WHERE status = 'active';
CREATE INDEX idx_user_event_participation_user ON user_event_participation(user_id, status);
CREATE INDEX idx_user_event_participation_event ON user_event_participation(event_id, current_score DESC);
CREATE INDEX idx_system_announcements_active ON system_announcements(is_active, starts_at, ends_at);
CREATE INDEX idx_user_announcement_views_user ON user_announcement_views(user_id, is_dismissed);
CREATE INDEX idx_notification_jobs_scheduled ON notification_jobs(status, scheduled_for);

-- Functions for notification management
CREATE OR REPLACE FUNCTION create_user_notification(
    p_user_id BIGINT,
    p_type_code VARCHAR(50),
    p_title VARCHAR(200),
    p_message TEXT,
    p_action_data JSONB DEFAULT NULL,
    p_scheduled_for TIMESTAMP DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    notification_id UUID;
    notification_type RECORD;
    user_prefs RECORD;
BEGIN
    -- Get notification type settings
    SELECT * INTO notification_type
    FROM notification_types
    WHERE type_code = p_type_code AND is_active = TRUE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid notification type: %', p_type_code;
    END IF;
    
    -- Get user preferences
    SELECT * INTO user_prefs
    FROM user_notification_preferences
    WHERE user_id = p_user_id AND type_code = p_type_code;
    
    -- Create notification
    INSERT INTO user_notifications (
        user_id,
        type_code,
        title,
        message,
        channels,
        is_actionable,
        action_type,
        action_data,
        priority,
        scheduled_for,
        expires_at
    ) VALUES (
        p_user_id,
        p_type_code,
        p_title,
        p_message,
        COALESCE(
            CASE 
                WHEN user_prefs.user_id IS NOT NULL THEN
                    jsonb_build_array() ||
                    CASE WHEN user_prefs.in_game_enabled THEN '["in_game"]'::jsonb ELSE '[]'::jsonb END ||
                    CASE WHEN user_prefs.push_enabled THEN '["push"]'::jsonb ELSE '[]'::jsonb END ||
                    CASE WHEN user_prefs.email_enabled THEN '["email"]'::jsonb ELSE '[]'::jsonb END
                ELSE notification_type.default_channels
            END,
            '["in_game"]'::jsonb
        ),
        notification_type.is_actionable,
        notification_type.action_type,
        COALESCE(p_action_data, notification_type.action_data),
        notification_type.priority,
        p_scheduled_for,
        CURRENT_TIMESTAMP + (notification_type.default_ttl_hours || ' hours')::INTERVAL
    ) RETURNING notification_id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Mark expired notifications
    UPDATE user_notifications
    SET status = 'expired'
    WHERE status IN ('pending', 'sent', 'delivered')
    AND expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete old expired notifications (older than 30 days)
    DELETE FROM user_notifications
    WHERE status = 'expired'
    AND expires_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Views for common queries
CREATE VIEW user_unread_notifications AS
SELECT 
    un.notification_id,
    un.user_id,
    un.type_code,
    nt.display_name as type_name,
    un.title,
    un.message,
    un.is_actionable,
    un.action_type,
    un.action_data,
    un.priority,
    un.created_at,
    nt.icon_url,
    nt.color
FROM user_notifications un
JOIN notification_types nt ON un.type_code = nt.type_code
WHERE un.status IN ('pending', 'sent', 'delivered')
AND un.expires_at > CURRENT_TIMESTAMP
ORDER BY 
    CASE un.priority 
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
    END,
    un.created_at DESC;

CREATE VIEW active_game_events AS
SELECT 
    ge.event_id,
    ge.event_code,
    ge.event_name,
    ge.description,
    ge.event_type,
    ge.category,
    ge.starts_at,
    ge.ends_at,
    ge.total_participants,
    ge.is_featured,
    ge.banner_url,
    ge.icon_url,
    EXTRACT(EPOCH FROM (ge.ends_at - CURRENT_TIMESTAMP)) as seconds_remaining
FROM game_events ge
WHERE ge.status = 'active'
AND ge.starts_at <= CURRENT_TIMESTAMP
AND ge.ends_at > CURRENT_TIMESTAMP
ORDER BY ge.is_featured DESC, ge.starts_at ASC;