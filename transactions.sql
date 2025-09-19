-- =============================================
-- TRANSACTIONS & ECONOMY DATABASE SCHEMA
-- In-Game Economy & Payment System
-- =============================================

-- Virtual currency types
CREATE TABLE currency_types (
    currency_id SERIAL PRIMARY KEY,
    currency_code VARCHAR(10) UNIQUE NOT NULL, -- COIN, GEM, CHIP, GOLD
    display_name VARCHAR(50) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    
    -- Currency properties
    is_premium BOOLEAN DEFAULT FALSE, -- can be purchased with real money
    is_tradeable BOOLEAN DEFAULT TRUE, -- can be traded between players
    exchange_rate DECIMAL(10,4) DEFAULT 1.0000, -- rate to base currency
    
    -- Limits
    max_daily_earn BIGINT DEFAULT 0, -- 0 = unlimited
    max_total_hold BIGINT DEFAULT 0, -- 0 = unlimited
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User currency balances
CREATE TABLE user_balances (
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    currency_id INTEGER REFERENCES currency_types(currency_id),
    
    -- Balance info
    current_balance BIGINT DEFAULT 0,
    lifetime_earned BIGINT DEFAULT 0,
    lifetime_spent BIGINT DEFAULT 0,
    
    -- Daily limits tracking
    daily_earned_today BIGINT DEFAULT 0,
    daily_reset_date DATE DEFAULT CURRENT_DATE,
    
    -- Security
    last_transaction_at TIMESTAMP,
    balance_hash VARCHAR(255), -- for integrity checking
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, currency_id)
);

-- Transaction types
CREATE TABLE transaction_types (
    type_id SERIAL PRIMARY KEY,
    type_code VARCHAR(30) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(30) NOT NULL, -- purchase, reward, transfer, game, system
    
    -- Behavior
    affects_balance BOOLEAN DEFAULT TRUE,
    requires_approval BOOLEAN DEFAULT FALSE,
    is_reversible BOOLEAN DEFAULT TRUE,
    
    is_active BOOLEAN DEFAULT TRUE
);

-- All transactions log
CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(user_id),
    transaction_type_id INTEGER REFERENCES transaction_types(type_id),
    
    -- Transaction details
    currency_id INTEGER REFERENCES currency_types(currency_id),
    amount BIGINT NOT NULL, -- positive for credit, negative for debit
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    
    -- Reference data
    reference_type VARCHAR(30), -- game_session, purchase, gift, etc.
    reference_id VARCHAR(255), -- ID of the referenced entity
    
    -- Description and metadata
    description TEXT,
    metadata JSONB, -- additional transaction data
    
    -- Status and validation
    status VARCHAR(20) DEFAULT 'completed', -- pending, completed, failed, reversed
    validation_hash VARCHAR(255),
    
    -- Related transactions
    parent_transaction_id UUID REFERENCES transactions(transaction_id),
    reversal_transaction_id UUID REFERENCES transactions(transaction_id),
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Real money purchases
CREATE TABLE purchase_packages (
    package_id SERIAL PRIMARY KEY,
    package_code VARCHAR(30) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Package contents
    currency_rewards JSONB NOT NULL, -- {"COIN": 10000, "GEM": 100}
    bonus_items JSONB, -- additional items/rewards
    
    -- Pricing
    price_usd DECIMAL(10,2) NOT NULL,
    price_local JSONB, -- prices in different currencies
    
    -- Marketing
    discount_percentage INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    is_limited_time BOOLEAN DEFAULT FALSE,
    available_until TIMESTAMP,
    
    -- Limits
    max_purchases_per_user INTEGER DEFAULT 0, -- 0 = unlimited
    daily_purchase_limit INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User purchase history
CREATE TABLE user_purchases (
    purchase_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    package_id INTEGER REFERENCES purchase_packages(package_id),
    
    -- Purchase details
    amount_paid DECIMAL(10,2) NOT NULL,
    currency_code VARCHAR(3) NOT NULL, -- USD, IDR, etc.
    
    -- Payment processing
    payment_method VARCHAR(30), -- google_play, app_store, paypal, etc.
    payment_transaction_id VARCHAR(255),
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed, refunded
    
    -- Fulfillment
    is_fulfilled BOOLEAN DEFAULT FALSE,
    fulfilled_at TIMESTAMP,
    fulfillment_transaction_id UUID REFERENCES transactions(transaction_id),
    
    -- Metadata
    device_info JSONB,
    ip_address INET,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- In-game shop items
CREATE TABLE shop_items (
    item_id SERIAL PRIMARY KEY,
    item_code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Item properties
    category VARCHAR(30) NOT NULL, -- avatar, theme, power_up, decoration
    rarity VARCHAR(20) DEFAULT 'common', -- common, rare, epic, legendary
    item_type VARCHAR(30) NOT NULL, -- consumable, permanent, temporary
    
    -- Pricing
    price_currency_id INTEGER REFERENCES currency_types(currency_id),
    price_amount BIGINT NOT NULL,
    
    -- Usage
    duration_hours INTEGER DEFAULT 0, -- 0 = permanent
    stack_limit INTEGER DEFAULT 1, -- max quantity user can own
    
    -- Availability
    is_purchasable BOOLEAN DEFAULT TRUE,
    is_giftable BOOLEAN DEFAULT TRUE,
    requires_level INTEGER DEFAULT 1,
    
    -- Media
    icon_url VARCHAR(500),
    preview_urls JSONB, -- array of preview images
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User inventory
CREATE TABLE user_inventory (
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES shop_items(item_id),
    
    -- Ownership details
    quantity INTEGER DEFAULT 1,
    is_equipped BOOLEAN DEFAULT FALSE,
    
    -- Timing
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP, -- for temporary items
    last_used_at TIMESTAMP,
    
    PRIMARY KEY (user_id, item_id)
);

-- Gift system
CREATE TABLE gifts (
    gift_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_user_id BIGINT REFERENCES users(user_id),
    recipient_user_id BIGINT REFERENCES users(user_id),
    
    -- Gift contents
    gift_type VARCHAR(30) NOT NULL, -- currency, item, package
    currency_id INTEGER REFERENCES currency_types(currency_id),
    currency_amount BIGINT DEFAULT 0,
    item_id INTEGER REFERENCES shop_items(item_id),
    item_quantity INTEGER DEFAULT 0,
    
    -- Message
    message TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'sent', -- sent, received, expired
    
    -- Timing
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    received_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

-- Daily/Weekly/Monthly rewards
CREATE TABLE reward_schedules (
    schedule_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    schedule_type VARCHAR(20) NOT NULL, -- daily, weekly, monthly, event
    
    -- Reward configuration
    rewards JSONB NOT NULL, -- {"COIN": 1000, "items": [{"id": 1, "qty": 1}]}
    
    -- Conditions
    requires_login_streak INTEGER DEFAULT 0,
    requires_games_played INTEGER DEFAULT 0,
    requires_level INTEGER DEFAULT 1,
    
    -- Timing
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User reward claims
CREATE TABLE user_reward_claims (
    user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES reward_schedules(schedule_id),
    claim_period DATE NOT NULL, -- which day/week/month
    
    -- Claim details
    rewards_received JSONB NOT NULL,
    bonus_multiplier DECIMAL(3,2) DEFAULT 1.00,
    
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, schedule_id, claim_period)
);

-- Indexes for performance
CREATE INDEX idx_user_balances_user ON user_balances(user_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type_id);
CREATE INDEX idx_transactions_created ON transactions(created_at);
CREATE INDEX idx_transactions_reference ON transactions(reference_type, reference_id);
CREATE INDEX idx_user_purchases_user ON user_purchases(user_id);
CREATE INDEX idx_user_purchases_status ON user_purchases(payment_status);
CREATE INDEX idx_user_inventory_user ON user_inventory(user_id);
CREATE INDEX idx_user_inventory_equipped ON user_inventory(user_id, is_equipped);
CREATE INDEX idx_gifts_recipient ON gifts(recipient_user_id, status);
CREATE INDEX idx_gifts_sender ON gifts(sender_user_id);
CREATE INDEX idx_reward_claims_user ON user_reward_claims(user_id);

-- Triggers for balance updates
CREATE OR REPLACE FUNCTION update_user_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Update balance after transaction
    UPDATE user_balances 
    SET 
        current_balance = NEW.balance_after,
        last_transaction_at = NEW.created_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id AND currency_id = NEW.currency_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_balance 
    AFTER INSERT ON transactions
    FOR EACH ROW 
    EXECUTE FUNCTION update_user_balance();

-- Views for common queries
CREATE VIEW user_wallet_summary AS
SELECT 
    ub.user_id,
    ct.currency_code,
    ct.display_name,
    ub.current_balance,
    ub.lifetime_earned,
    ub.lifetime_spent
FROM user_balances ub
JOIN currency_types ct ON ub.currency_id = ct.currency_id
WHERE ct.is_active = TRUE;

CREATE VIEW transaction_summary AS
SELECT 
    t.transaction_id,
    t.user_id,
    u.display_name as user_name,
    tt.display_name as transaction_type,
    ct.currency_code,
    t.amount,
    t.description,
    t.created_at
FROM transactions t
JOIN users u ON t.user_id = u.user_id
JOIN transaction_types tt ON t.transaction_type_id = tt.type_id
JOIN currency_types ct ON t.currency_id = ct.currency_id
ORDER BY t.created_at DESC;