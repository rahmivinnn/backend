// ============================================================================
// ADVANCED SUBSCRIPTION & BILLING SERVICE
// ============================================================================

const { Pool } = require('pg');
const Redis = require('ioredis');
const cron = require('node-cron');
const { logger } = require('./monitoring_service');
const { PaymentService } = require('./payment_service');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const nodemailer = require('nodemailer');

// ============================================================================
// SUBSCRIPTION CONFIGURATION
// ============================================================================

const SUBSCRIPTION_CONFIG = {
  // Subscription statuses
  statuses: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired',
    SUSPENDED: 'suspended',
    PENDING: 'pending',
    TRIAL: 'trial',
    PAST_DUE: 'past_due'
  },
  
  // Billing cycles
  billingCycles: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    QUARTERLY: 'quarterly',
    YEARLY: 'yearly',
    LIFETIME: 'lifetime'
  },
  
  // Plan types
  planTypes: {
    BASIC: 'basic',
    PREMIUM: 'premium',
    PRO: 'pro',
    ENTERPRISE: 'enterprise',
    VIP: 'vip',
    CUSTOM: 'custom'
  },
  
  // Discount types
  discountTypes: {
    PERCENTAGE: 'percentage',
    FIXED_AMOUNT: 'fixed_amount',
    FREE_TRIAL: 'free_trial',
    FIRST_MONTH_FREE: 'first_month_free'
  },
  
  // Invoice statuses
  invoiceStatuses: {
    DRAFT: 'draft',
    PENDING: 'pending',
    PAID: 'paid',
    OVERDUE: 'overdue',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded'
  },
  
  // Proration settings
  proration: {
    ENABLED: true,
    CREDIT_UNUSED: true,
    CHARGE_IMMEDIATELY: false
  },
  
  // Trial settings
  trial: {
    DEFAULT_DAYS: 7,
    MAX_DAYS: 30,
    REQUIRE_PAYMENT_METHOD: true
  },
  
  // Grace period settings
  gracePeriod: {
    DAYS: 3,
    RETRY_ATTEMPTS: 3,
    RETRY_INTERVAL_HOURS: 24
  },
  
  // Dunning management
  dunning: {
    ENABLED: true,
    EMAIL_SEQUENCE: [
      { days: 1, template: 'payment_failed' },
      { days: 3, template: 'payment_reminder' },
      { days: 7, template: 'final_notice' },
      { days: 10, template: 'subscription_cancelled' }
    ]
  }
};

// ============================================================================
// SUBSCRIPTION PLANS CONFIGURATION
// ============================================================================

const SUBSCRIPTION_PLANS = {
  // Gaming Plans
  gaming: {
    basic: {
      id: 'gaming_basic',
      name: 'Gaming Basic',
      description: 'Basic gaming features',
      price: 999, // $9.99
      currency: 'USD',
      billingCycle: 'monthly',
      features: {
        coins: 10000,
        dailyBonus: true,
        adFree: false,
        prioritySupport: false,
        exclusiveItems: false
      },
      limits: {
        dailyGames: 50,
        tournaments: 2,
        friends: 100
      }
    },
    premium: {
      id: 'gaming_premium',
      name: 'Gaming Premium',
      description: 'Premium gaming experience',
      price: 1999, // $19.99
      currency: 'USD',
      billingCycle: 'monthly',
      features: {
        coins: 25000,
        dailyBonus: true,
        adFree: true,
        prioritySupport: true,
        exclusiveItems: true,
        customAvatar: true
      },
      limits: {
        dailyGames: 200,
        tournaments: 10,
        friends: 500
      }
    },
    vip: {
      id: 'gaming_vip',
      name: 'Gaming VIP',
      description: 'Ultimate gaming experience',
      price: 4999, // $49.99
      currency: 'USD',
      billingCycle: 'monthly',
      features: {
        coins: 100000,
        dailyBonus: true,
        adFree: true,
        prioritySupport: true,
        exclusiveItems: true,
        customAvatar: true,
        betaAccess: true,
        personalManager: true
      },
      limits: {
        dailyGames: 'unlimited',
        tournaments: 'unlimited',
        friends: 'unlimited'
      }
    }
  },
  
  // Business Plans
  business: {
    starter: {
      id: 'business_starter',
      name: 'Business Starter',
      description: 'For small businesses',
      price: 2999, // $29.99
      currency: 'USD',
      billingCycle: 'monthly',
      features: {
        apiAccess: true,
        analytics: 'basic',
        support: '24/7',
        customBranding: false,
        whiteLabel: false
      },
      limits: {
        apiCalls: 10000,
        users: 10,
        storage: '10GB'
      }
    },
    professional: {
      id: 'business_professional',
      name: 'Business Professional',
      description: 'For growing businesses',
      price: 9999, // $99.99
      currency: 'USD',
      billingCycle: 'monthly',
      features: {
        apiAccess: true,
        analytics: 'advanced',
        support: '24/7',
        customBranding: true,
        whiteLabel: true,
        dedicatedManager: true
      },
      limits: {
        apiCalls: 100000,
        users: 100,
        storage: '100GB'
      }
    },
    enterprise: {
      id: 'business_enterprise',
      name: 'Business Enterprise',
      description: 'For large enterprises',
      price: 49999, // $499.99
      currency: 'USD',
      billingCycle: 'monthly',
      features: {
        apiAccess: true,
        analytics: 'enterprise',
        support: '24/7',
        customBranding: true,
        whiteLabel: true,
        dedicatedManager: true,
        sla: '99.9%',
        customIntegration: true
      },
      limits: {
        apiCalls: 'unlimited',
        users: 'unlimited',
        storage: 'unlimited'
      }
    }
  }
};

// ============================================================================
// SUBSCRIPTION SERVICE CLASS
// ============================================================================

class SubscriptionService {
  constructor() {
    this.db = null;
    this.redis = null;
    this.paymentService = null;
    this.emailTransporter = null;
    this.isInitialized = false;
    
    this.billingJobs = new Map();
    this.dunningJobs = new Map();
    
    this.init();
  }

  async init() {
    try {
      // Initialize database connection
      this.db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      
      // Initialize Redis connection
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        keyPrefix: 'subscription:'
      });
      
      // Initialize payment service
      this.paymentService = new PaymentService();
      
      // Initialize email transporter
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      
      // Setup cron jobs
      this.setupCronJobs();
      
      // Initialize subscription plans in database
      await this.initializeSubscriptionPlans();
      
      this.isInitialized = true;
      logger.info('Subscription service initialized successfully');
    } catch (error) {
      logger.error('Subscription service initialization error:', error);
      this.isInitialized = false;
    }
  }

  setupCronJobs() {
    // Daily billing job - runs at 2 AM every day
    cron.schedule('0 2 * * *', async () => {
      await this.processDailyBilling();
    });
    
    // Hourly dunning job - runs every hour
    cron.schedule('0 * * * *', async () => {
      await this.processDunning();
    });
    
    // Trial expiration check - runs every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      await this.processTrialExpirations();
    });
    
    // Subscription analytics - runs daily at 3 AM
    cron.schedule('0 3 * * *', async () => {
      await this.updateSubscriptionAnalytics();
    });
    
    logger.info('Subscription cron jobs scheduled');
  }

  async initializeSubscriptionPlans() {
    try {
      for (const category in SUBSCRIPTION_PLANS) {
        for (const planKey in SUBSCRIPTION_PLANS[category]) {
          const plan = SUBSCRIPTION_PLANS[category][planKey];
          await this.createOrUpdatePlan(plan);
        }
      }
      
      logger.info('Subscription plans initialized');
    } catch (error) {
      logger.error('Subscription plans initialization error:', error);
    }
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  async createSubscription(subscriptionData) {
    const {
      userId,
      planId,
      paymentMethodId,
      couponCode,
      trialDays,
      metadata = {}
    } = subscriptionData;
    
    try {
      // Validate subscription data
      await this.validateSubscriptionData(subscriptionData);
      
      // Get subscription plan
      const plan = await this.getSubscriptionPlan(planId);
      if (!plan) {
        throw new Error('Subscription plan not found');
      }
      
      // Check if user already has active subscription
      const existingSubscription = await this.getUserActiveSubscription(userId);
      if (existingSubscription) {
        throw new Error('User already has an active subscription');
      }
      
      // Apply coupon if provided
      let discount = null;
      if (couponCode) {
        discount = await this.applyCoupon(couponCode, plan.price);
      }
      
      // Calculate pricing
      const pricing = this.calculateSubscriptionPricing(plan, discount, trialDays);
      
      // Generate subscription ID
      const subscriptionId = uuidv4();
      
      // Determine subscription status
      const status = trialDays > 0 
        ? SUBSCRIPTION_CONFIG.statuses.TRIAL 
        : SUBSCRIPTION_CONFIG.statuses.ACTIVE;
      
      // Calculate billing dates
      const billingDates = this.calculateBillingDates(plan.billingCycle, trialDays);
      
      // Create subscription record
      const subscription = await this.createSubscriptionRecord({
        subscriptionId,
        userId,
        planId,
        status,
        pricing,
        billingDates,
        paymentMethodId,
        metadata,
        discount
      });
      
      // Process initial payment if not in trial
      if (trialDays === 0 && pricing.totalAmount > 0) {
        await this.processSubscriptionPayment(subscription);
      }
      
      // Grant subscription benefits
      await this.grantSubscriptionBenefits(userId, plan);
      
      // Send welcome email
      await this.sendWelcomeEmail(subscription, plan);
      
      // Cache subscription
      await this.redis.setex(`subscription:${subscriptionId}`, 3600, JSON.stringify(subscription));
      
      logger.info('Subscription created:', { subscriptionId, userId, planId });
      
      return {
        subscriptionId,
        status,
        plan,
        pricing,
        billingDates,
        trialEndsAt: billingDates.trialEndsAt
      };
    } catch (error) {
      logger.error('Create subscription error:', error);
      throw error;
    }
  }

  async updateSubscription(subscriptionId, updateData) {
    const {
      planId,
      paymentMethodId,
      metadata
    } = updateData;
    
    try {
      const subscription = await this.getSubscription(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }
      
      if (subscription.status === SUBSCRIPTION_CONFIG.statuses.CANCELLED) {
        throw new Error('Cannot update cancelled subscription');
      }
      
      // Handle plan change
      if (planId && planId !== subscription.plan_id) {
        await this.changePlan(subscriptionId, planId);
      }
      
      // Handle payment method change
      if (paymentMethodId) {
        await this.updatePaymentMethod(subscriptionId, paymentMethodId);
      }
      
      // Update metadata
      if (metadata) {
        await this.updateSubscriptionRecord(subscriptionId, { metadata });
      }
      
      // Clear cache
      await this.redis.del(`subscription:${subscriptionId}`);
      
      logger.info('Subscription updated:', { subscriptionId });
      
      return await this.getSubscription(subscriptionId);
    } catch (error) {
      logger.error('Update subscription error:', error);
      throw error;
    }
  }

  async cancelSubscription(subscriptionId, cancelData = {}) {
    const {
      reason,
      cancelAtPeriodEnd = true,
      refundUnusedTime = false
    } = cancelData;
    
    try {
      const subscription = await this.getSubscription(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }
      
      if (subscription.status === SUBSCRIPTION_CONFIG.statuses.CANCELLED) {
        throw new Error('Subscription already cancelled');
      }
      
      let cancellationDate;
      
      if (cancelAtPeriodEnd) {
        // Cancel at the end of current billing period
        cancellationDate = new Date(subscription.current_period_end);
        
        await this.updateSubscriptionRecord(subscriptionId, {
          cancel_at_period_end: true,
          cancellation_reason: reason,
          cancelled_at: new Date()
        });
      } else {
        // Cancel immediately
        cancellationDate = new Date();
        
        await this.updateSubscriptionRecord(subscriptionId, {
          status: SUBSCRIPTION_CONFIG.statuses.CANCELLED,
          cancellation_reason: reason,
          cancelled_at: cancellationDate,
          ended_at: cancellationDate
        });
        
        // Revoke subscription benefits
        await this.revokeSubscriptionBenefits(subscription.user_id, subscription.plan_id);
        
        // Process refund if requested
        if (refundUnusedTime) {
          await this.processProrationRefund(subscription);
        }
      }
      
      // Send cancellation email
      await this.sendCancellationEmail(subscription, cancellationDate);
      
      // Clear cache
      await this.redis.del(`subscription:${subscriptionId}`);
      
      logger.info('Subscription cancelled:', { subscriptionId, cancelAtPeriodEnd });
      
      return {
        subscriptionId,
        status: cancelAtPeriodEnd ? subscription.status : SUBSCRIPTION_CONFIG.statuses.CANCELLED,
        cancellationDate,
        refundProcessed: refundUnusedTime
      };
    } catch (error) {
      logger.error('Cancel subscription error:', error);
      throw error;
    }
  }

  async reactivateSubscription(subscriptionId) {
    try {
      const subscription = await this.getSubscription(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }
      
      if (subscription.status !== SUBSCRIPTION_CONFIG.statuses.CANCELLED) {
        throw new Error('Can only reactivate cancelled subscriptions');
      }
      
      // Calculate new billing dates
      const plan = await this.getSubscriptionPlan(subscription.plan_id);
      const billingDates = this.calculateBillingDates(plan.billingCycle);
      
      // Update subscription
      await this.updateSubscriptionRecord(subscriptionId, {
        status: SUBSCRIPTION_CONFIG.statuses.ACTIVE,
        current_period_start: billingDates.currentPeriodStart,
        current_period_end: billingDates.currentPeriodEnd,
        cancel_at_period_end: false,
        cancelled_at: null,
        ended_at: null
      });
      
      // Process payment for current period
      const updatedSubscription = await this.getSubscription(subscriptionId);
      await this.processSubscriptionPayment(updatedSubscription);
      
      // Grant subscription benefits
      await this.grantSubscriptionBenefits(subscription.user_id, plan);
      
      // Send reactivation email
      await this.sendReactivationEmail(subscription);
      
      // Clear cache
      await this.redis.del(`subscription:${subscriptionId}`);
      
      logger.info('Subscription reactivated:', { subscriptionId });
      
      return await this.getSubscription(subscriptionId);
    } catch (error) {
      logger.error('Reactivate subscription error:', error);
      throw error;
    }
  }

  // ============================================================================
  // PLAN MANAGEMENT
  // ============================================================================

  async changePlan(subscriptionId, newPlanId) {
    try {
      const subscription = await this.getSubscription(subscriptionId);
      const currentPlan = await this.getSubscriptionPlan(subscription.plan_id);
      const newPlan = await this.getSubscriptionPlan(newPlanId);
      
      if (!newPlan) {
        throw new Error('New subscription plan not found');
      }
      
      // Calculate proration
      const proration = this.calculateProration(subscription, currentPlan, newPlan);
      
      // Update subscription
      await this.updateSubscriptionRecord(subscriptionId, {
        plan_id: newPlanId,
        price: newPlan.price
      });
      
      // Process proration payment/credit
      if (proration.amount !== 0) {
        await this.processProrationPayment(subscription, proration);
      }
      
      // Update subscription benefits
      await this.revokeSubscriptionBenefits(subscription.user_id, currentPlan);
      await this.grantSubscriptionBenefits(subscription.user_id, newPlan);
      
      // Send plan change email
      await this.sendPlanChangeEmail(subscription, currentPlan, newPlan, proration);
      
      logger.info('Subscription plan changed:', { subscriptionId, oldPlan: currentPlan.id, newPlan: newPlan.id });
      
      return {
        subscriptionId,
        oldPlan: currentPlan,
        newPlan,
        proration
      };
    } catch (error) {
      logger.error('Change plan error:', error);
      throw error;
    }
  }

  async createOrUpdatePlan(planData) {
    const {
      id,
      name,
      description,
      price,
      currency,
      billingCycle,
      features,
      limits,
      metadata = {}
    } = planData;
    
    try {
      const query = `
        INSERT INTO subscription_plans (
          plan_id, name, description, price, currency, billing_cycle,
          features, limits, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (plan_id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          currency = EXCLUDED.currency,
          billing_cycle = EXCLUDED.billing_cycle,
          features = EXCLUDED.features,
          limits = EXCLUDED.limits,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING *
      `;
      
      const values = [
        id,
        name,
        description,
        price,
        currency,
        billingCycle,
        JSON.stringify(features),
        JSON.stringify(limits),
        JSON.stringify(metadata)
      ];
      
      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Create/update plan error:', error);
      throw error;
    }
  }

  // ============================================================================
  // BILLING PROCESSING
  // ============================================================================

  async processDailyBilling() {
    try {
      logger.info('Starting daily billing process');
      
      // Get subscriptions due for billing today
      const dueSubscriptions = await this.getSubscriptionsDueForBilling();
      
      for (const subscription of dueSubscriptions) {
        try {
          await this.processSubscriptionBilling(subscription);
        } catch (error) {
          logger.error('Subscription billing error:', { subscriptionId: subscription.subscription_id, error });
        }
      }
      
      logger.info('Daily billing process completed', { processed: dueSubscriptions.length });
    } catch (error) {
      logger.error('Daily billing process error:', error);
    }
  }

  async processSubscriptionBilling(subscription) {
    try {
      const plan = await this.getSubscriptionPlan(subscription.plan_id);
      
      // Create invoice
      const invoice = await this.createInvoice(subscription, plan);
      
      // Process payment
      const paymentResult = await this.processInvoicePayment(invoice);
      
      if (paymentResult.success) {
        // Update subscription for next billing cycle
        const nextBillingDates = this.calculateBillingDates(plan.billingCycle);
        
        await this.updateSubscriptionRecord(subscription.subscription_id, {
          current_period_start: nextBillingDates.currentPeriodStart,
          current_period_end: nextBillingDates.currentPeriodEnd,
          last_payment_date: new Date()
        });
        
        // Update invoice status
        await this.updateInvoiceStatus(invoice.invoice_id, SUBSCRIPTION_CONFIG.invoiceStatuses.PAID);
        
        // Send payment confirmation
        await this.sendPaymentConfirmationEmail(subscription, invoice);
        
        logger.info('Subscription billing successful:', { subscriptionId: subscription.subscription_id });
      } else {
        // Handle payment failure
        await this.handlePaymentFailure(subscription, invoice, paymentResult.error);
      }
    } catch (error) {
      logger.error('Subscription billing error:', error);
      throw error;
    }
  }

  async handlePaymentFailure(subscription, invoice, error) {
    try {
      // Update invoice status
      await this.updateInvoiceStatus(invoice.invoice_id, SUBSCRIPTION_CONFIG.invoiceStatuses.OVERDUE);
      
      // Increment failed payment attempts
      const failedAttempts = (subscription.failed_payment_attempts || 0) + 1;
      
      await this.updateSubscriptionRecord(subscription.subscription_id, {
        failed_payment_attempts: failedAttempts,
        last_payment_error: error.message
      });
      
      // Check if we should suspend the subscription
      if (failedAttempts >= SUBSCRIPTION_CONFIG.gracePeriod.RETRY_ATTEMPTS) {
        await this.suspendSubscription(subscription.subscription_id);
      } else {
        // Schedule retry
        await this.schedulePaymentRetry(subscription, invoice);
      }
      
      // Send payment failure notification
      await this.sendPaymentFailureEmail(subscription, invoice, failedAttempts);
      
      logger.warn('Subscription payment failed:', { 
        subscriptionId: subscription.subscription_id, 
        attempts: failedAttempts 
      });
    } catch (error) {
      logger.error('Handle payment failure error:', error);
    }
  }

  async suspendSubscription(subscriptionId) {
    try {
      const subscription = await this.getSubscription(subscriptionId);
      
      await this.updateSubscriptionRecord(subscriptionId, {
        status: SUBSCRIPTION_CONFIG.statuses.SUSPENDED,
        suspended_at: new Date()
      });
      
      // Revoke subscription benefits
      await this.revokeSubscriptionBenefits(subscription.user_id, subscription.plan_id);
      
      // Send suspension email
      await this.sendSuspensionEmail(subscription);
      
      logger.info('Subscription suspended:', { subscriptionId });
    } catch (error) {
      logger.error('Suspend subscription error:', error);
    }
  }

  // ============================================================================
  // INVOICE MANAGEMENT
  // ============================================================================

  async createInvoice(subscription, plan) {
    try {
      const invoiceId = uuidv4();
      const invoiceNumber = await this.generateInvoiceNumber();
      
      // Calculate invoice items
      const items = [{
        description: `${plan.name} - ${plan.billingCycle} subscription`,
        quantity: 1,
        unitPrice: plan.price,
        amount: plan.price
      }];
      
      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
      const tax = this.calculateTax(subtotal, subscription.user_id);
      const total = subtotal + tax;
      
      const invoice = {
        invoiceId,
        invoiceNumber,
        subscriptionId: subscription.subscription_id,
        userId: subscription.user_id,
        status: SUBSCRIPTION_CONFIG.invoiceStatuses.PENDING,
        items,
        subtotal,
        tax,
        total,
        currency: plan.currency,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        metadata: {}
      };
      
      await this.createInvoiceRecord(invoice);
      
      logger.info('Invoice created:', { invoiceId, subscriptionId: subscription.subscription_id });
      
      return invoice;
    } catch (error) {
      logger.error('Create invoice error:', error);
      throw error;
    }
  }

  async processInvoicePayment(invoice) {
    try {
      const subscription = await this.getSubscription(invoice.subscriptionId);
      
      const paymentData = {
        userId: invoice.userId,
        amount: invoice.total,
        currency: invoice.currency,
        paymentMethod: 'credit_card', // Default payment method
        description: `Invoice ${invoice.invoiceNumber}`,
        metadata: {
          invoiceId: invoice.invoiceId,
          subscriptionId: invoice.subscriptionId
        }
      };
      
      const paymentResult = await this.paymentService.createPayment(paymentData);
      
      if (paymentResult.status === 'completed') {
        return { success: true, paymentId: paymentResult.paymentId };
      } else {
        return { success: false, error: new Error('Payment processing failed') };
      }
    } catch (error) {
      logger.error('Process invoice payment error:', error);
      return { success: false, error };
    }
  }

  // ============================================================================
  // DUNNING MANAGEMENT
  // ============================================================================

  async processDunning() {
    try {
      logger.info('Starting dunning process');
      
      const overdueInvoices = await this.getOverdueInvoices();
      
      for (const invoice of overdueInvoices) {
        try {
          await this.processDunningForInvoice(invoice);
        } catch (error) {
          logger.error('Dunning process error for invoice:', { invoiceId: invoice.invoice_id, error });
        }
      }
      
      logger.info('Dunning process completed', { processed: overdueInvoices.length });
    } catch (error) {
      logger.error('Dunning process error:', error);
    }
  }

  async processDunningForInvoice(invoice) {
    const daysPastDue = Math.floor((new Date() - new Date(invoice.due_date)) / (1000 * 60 * 60 * 24));
    
    // Find appropriate dunning step
    const dunningStep = SUBSCRIPTION_CONFIG.dunning.EMAIL_SEQUENCE.find(step => 
      daysPastDue >= step.days && daysPastDue < (step.days + 1)
    );
    
    if (dunningStep) {
      await this.sendDunningEmail(invoice, dunningStep);
      
      // If this is the final notice, cancel the subscription
      if (dunningStep.template === 'subscription_cancelled') {
        await this.cancelSubscription(invoice.subscription_id, {
          reason: 'Payment failure - automatic cancellation',
          cancelAtPeriodEnd: false
        });
      }
    }
  }

  // ============================================================================
  // TRIAL MANAGEMENT
  // ============================================================================

  async processTrialExpirations() {
    try {
      logger.info('Processing trial expirations');
      
      const expiringTrials = await this.getExpiringTrials();
      
      for (const subscription of expiringTrials) {
        try {
          await this.processTrialExpiration(subscription);
        } catch (error) {
          logger.error('Trial expiration error:', { subscriptionId: subscription.subscription_id, error });
        }
      }
      
      logger.info('Trial expiration processing completed', { processed: expiringTrials.length });
    } catch (error) {
      logger.error('Trial expiration process error:', error);
    }
  }

  async processTrialExpiration(subscription) {
    try {
      // Attempt to charge for the subscription
      const plan = await this.getSubscriptionPlan(subscription.plan_id);
      const invoice = await this.createInvoice(subscription, plan);
      const paymentResult = await this.processInvoicePayment(invoice);
      
      if (paymentResult.success) {
        // Convert trial to active subscription
        const nextBillingDates = this.calculateBillingDates(plan.billingCycle);
        
        await this.updateSubscriptionRecord(subscription.subscription_id, {
          status: SUBSCRIPTION_CONFIG.statuses.ACTIVE,
          trial_end: null,
          current_period_start: nextBillingDates.currentPeriodStart,
          current_period_end: nextBillingDates.currentPeriodEnd
        });
        
        await this.updateInvoiceStatus(invoice.invoice_id, SUBSCRIPTION_CONFIG.invoiceStatuses.PAID);
        
        // Send trial conversion email
        await this.sendTrialConversionEmail(subscription);
        
        logger.info('Trial converted to active subscription:', { subscriptionId: subscription.subscription_id });
      } else {
        // Cancel subscription due to payment failure
        await this.updateSubscriptionRecord(subscription.subscription_id, {
          status: SUBSCRIPTION_CONFIG.statuses.CANCELLED,
          ended_at: new Date()
        });
        
        await this.updateInvoiceStatus(invoice.invoice_id, SUBSCRIPTION_CONFIG.invoiceStatuses.CANCELLED);
        
        // Revoke subscription benefits
        await this.revokeSubscriptionBenefits(subscription.user_id, subscription.plan_id);
        
        // Send trial expiration email
        await this.sendTrialExpirationEmail(subscription);
        
        logger.info('Trial expired and subscription cancelled:', { subscriptionId: subscription.subscription_id });
      }
    } catch (error) {
      logger.error('Process trial expiration error:', error);
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  calculateSubscriptionPricing(plan, discount, trialDays) {
    let baseAmount = plan.price;
    let discountAmount = 0;
    
    if (discount) {
      if (discount.type === SUBSCRIPTION_CONFIG.discountTypes.PERCENTAGE) {
        discountAmount = Math.round(baseAmount * (discount.value / 100));
      } else if (discount.type === SUBSCRIPTION_CONFIG.discountTypes.FIXED_AMOUNT) {
        discountAmount = discount.value;
      }
    }
    
    const totalAmount = trialDays > 0 ? 0 : Math.max(0, baseAmount - discountAmount);
    
    return {
      baseAmount,
      discountAmount,
      totalAmount,
      currency: plan.currency
    };
  }

  calculateBillingDates(billingCycle, trialDays = 0) {
    const now = new Date();
    const trialEnd = trialDays > 0 ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null;
    
    let currentPeriodStart = trialEnd || now;
    let currentPeriodEnd;
    
    switch (billingCycle) {
      case SUBSCRIPTION_CONFIG.billingCycles.DAILY:
        currentPeriodEnd = new Date(currentPeriodStart.getTime() + 24 * 60 * 60 * 1000);
        break;
      case SUBSCRIPTION_CONFIG.billingCycles.WEEKLY:
        currentPeriodEnd = new Date(currentPeriodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case SUBSCRIPTION_CONFIG.billingCycles.MONTHLY:
        currentPeriodEnd = moment(currentPeriodStart).add(1, 'month').toDate();
        break;
      case SUBSCRIPTION_CONFIG.billingCycles.QUARTERLY:
        currentPeriodEnd = moment(currentPeriodStart).add(3, 'months').toDate();
        break;
      case SUBSCRIPTION_CONFIG.billingCycles.YEARLY:
        currentPeriodEnd = moment(currentPeriodStart).add(1, 'year').toDate();
        break;
      default:
        currentPeriodEnd = moment(currentPeriodStart).add(1, 'month').toDate();
    }
    
    return {
      trialEndsAt: trialEnd,
      currentPeriodStart,
      currentPeriodEnd
    };
  }

  calculateProration(subscription, currentPlan, newPlan) {
    const now = new Date();
    const periodStart = new Date(subscription.current_period_start);
    const periodEnd = new Date(subscription.current_period_end);
    
    const totalPeriodDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
    
    const currentPlanDailyRate = currentPlan.price / totalPeriodDays;
    const newPlanDailyRate = newPlan.price / totalPeriodDays;
    
    const currentPlanCredit = currentPlanDailyRate * remainingDays;
    const newPlanCharge = newPlanDailyRate * remainingDays;
    
    const prorationAmount = newPlanCharge - currentPlanCredit;
    
    return {
      amount: Math.round(prorationAmount),
      currency: newPlan.currency,
      remainingDays,
      description: `Proration for plan change from ${currentPlan.name} to ${newPlan.name}`
    };
  }

  calculateTax(amount, userId) {
    // Placeholder for tax calculation logic
    // This would typically integrate with a tax service like TaxJar or Avalara
    return 0;
  }

  async generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    
    const counter = await this.redis.incr(`invoice_counter:${year}${month}`);
    
    return `INV-${year}${month}-${String(counter).padStart(6, '0')}`;
  }

  // ============================================================================
  // DATABASE OPERATIONS
  // ============================================================================

  async createSubscriptionRecord(subscriptionData) {
    const query = `
      INSERT INTO subscriptions (
        subscription_id, user_id, plan_id, status, price, currency,
        current_period_start, current_period_end, trial_end,
        payment_method_id, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *
    `;
    
    const values = [
      subscriptionData.subscriptionId,
      subscriptionData.userId,
      subscriptionData.planId,
      subscriptionData.status,
      subscriptionData.pricing.totalAmount,
      subscriptionData.pricing.currency,
      subscriptionData.billingDates.currentPeriodStart,
      subscriptionData.billingDates.currentPeriodEnd,
      subscriptionData.billingDates.trialEndsAt,
      subscriptionData.paymentMethodId,
      JSON.stringify(subscriptionData.metadata)
    ];
    
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async updateSubscriptionRecord(subscriptionId, updateData) {
    const setClause = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const query = `
      UPDATE subscriptions 
      SET ${setClause}, updated_at = NOW()
      WHERE subscription_id = $1
      RETURNING *
    `;
    
    const values = [subscriptionId, ...Object.values(updateData)];
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getSubscription(subscriptionId) {
    // Try cache first
    const cached = await this.redis.get(`subscription:${subscriptionId}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Query database
    const query = 'SELECT * FROM subscriptions WHERE subscription_id = $1';
    const result = await this.db.query(query, [subscriptionId]);
    
    if (result.rows.length > 0) {
      const subscription = result.rows[0];
      // Cache for 1 hour
      await this.redis.setex(`subscription:${subscriptionId}`, 3600, JSON.stringify(subscription));
      return subscription;
    }
    
    return null;
  }

  async getSubscriptionPlan(planId) {
    const query = 'SELECT * FROM subscription_plans WHERE plan_id = $1';
    const result = await this.db.query(query, [planId]);
    return result.rows[0] || null;
  }

  async getUserActiveSubscription(userId) {
    const query = `
      SELECT * FROM subscriptions 
      WHERE user_id = $1 
      AND status IN ('active', 'trial', 'past_due')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const result = await this.db.query(query, [userId]);
    return result.rows[0] || null;
  }

  async getSubscriptionsDueForBilling() {
    const query = `
      SELECT * FROM subscriptions 
      WHERE status = 'active'
      AND current_period_end <= NOW()
      AND (cancel_at_period_end IS NULL OR cancel_at_period_end = false)
    `;
    
    const result = await this.db.query(query);
    return result.rows;
  }

  async getExpiringTrials() {
    const query = `
      SELECT * FROM subscriptions 
      WHERE status = 'trial'
      AND trial_end <= NOW()
    `;
    
    const result = await this.db.query(query);
    return result.rows;
  }

  async createInvoiceRecord(invoiceData) {
    const query = `
      INSERT INTO invoices (
        invoice_id, invoice_number, subscription_id, user_id, status,
        items, subtotal, tax, total, currency, due_date, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `;
    
    const values = [
      invoiceData.invoiceId,
      invoiceData.invoiceNumber,
      invoiceData.subscriptionId,
      invoiceData.userId,
      invoiceData.status,
      JSON.stringify(invoiceData.items),
      invoiceData.subtotal,
      invoiceData.tax,
      invoiceData.total,
      invoiceData.currency,
      invoiceData.dueDate,
      JSON.stringify(invoiceData.metadata)
    ];
    
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async updateInvoiceStatus(invoiceId, status) {
    const query = `
      UPDATE invoices 
      SET status = $2, updated_at = NOW()
      WHERE invoice_id = $1
      RETURNING *
    `;
    
    const result = await this.db.query(query, [invoiceId, status]);
    return result.rows[0];
  }

  async getOverdueInvoices() {
    const query = `
      SELECT * FROM invoices 
      WHERE status = 'overdue'
      AND due_date < NOW()
    `;
    
    const result = await this.db.query(query);
    return result.rows;
  }

  // ============================================================================
  // BUSINESS LOGIC
  // ============================================================================

  async grantSubscriptionBenefits(userId, plan) {
    try {
      // Grant coins
      if (plan.features.coins) {
        await this.updateUserCoins(userId, plan.features.coins);
      }
      
      // Update user subscription features
      await this.updateUserSubscriptionFeatures(userId, plan.features);
      
      logger.info('Subscription benefits granted:', { userId, planId: plan.id });
    } catch (error) {
      logger.error('Grant subscription benefits error:', error);
    }
  }

  async revokeSubscriptionBenefits(userId, planId) {
    try {
      // Remove subscription features
      await this.removeUserSubscriptionFeatures(userId);
      
      logger.info('Subscription benefits revoked:', { userId, planId });
    } catch (error) {
      logger.error('Revoke subscription benefits error:', error);
    }
  }

  async updateUserCoins(userId, amount) {
    const query = `
      UPDATE user_wallets
      SET coins = coins + $2, updated_at = NOW()
      WHERE user_id = $1
    `;
    
    await this.db.query(query, [userId, amount]);
  }

  async updateUserSubscriptionFeatures(userId, features) {
    const query = `
      UPDATE users
      SET subscription_features = $2, updated_at = NOW()
      WHERE user_id = $1
    `;
    
    await this.db.query(query, [userId, JSON.stringify(features)]);
  }

  async removeUserSubscriptionFeatures(userId) {
    const query = `
      UPDATE users
      SET subscription_features = NULL, updated_at = NOW()
      WHERE user_id = $1
    `;
    
    await this.db.query(query, [userId]);
  }

  // ============================================================================
  // EMAIL NOTIFICATIONS
  // ============================================================================

  async sendWelcomeEmail(subscription, plan) {
    // Placeholder for welcome email
    logger.info('Welcome email sent:', subscription.subscription_id);
  }

  async sendCancellationEmail(subscription, cancellationDate) {
    // Placeholder for cancellation email
    logger.info('Cancellation email sent:', subscription.subscription_id);
  }

  async sendReactivationEmail(subscription) {
    // Placeholder for reactivation email
    logger.info('Reactivation email sent:', subscription.subscription_id);
  }

  async sendPlanChangeEmail(subscription, oldPlan, newPlan, proration) {
    // Placeholder for plan change email
    logger.info('Plan change email sent:', subscription.subscription_id);
  }

  async sendPaymentConfirmationEmail(subscription, invoice) {
    // Placeholder for payment confirmation email
    logger.info('Payment confirmation email sent:', subscription.subscription_id);
  }

  async sendPaymentFailureEmail(subscription, invoice, attempts) {
    // Placeholder for payment failure email
    logger.info('Payment failure email sent:', subscription.subscription_id);
  }

  async sendSuspensionEmail(subscription) {
    // Placeholder for suspension email
    logger.info('Suspension email sent:', subscription.subscription_id);
  }

  async sendTrialConversionEmail(subscription) {
    // Placeholder for trial conversion email
    logger.info('Trial conversion email sent:', subscription.subscription_id);
  }

  async sendTrialExpirationEmail(subscription) {
    // Placeholder for trial expiration email
    logger.info('Trial expiration email sent:', subscription.subscription_id);
  }

  async sendDunningEmail(invoice, dunningStep) {
    // Placeholder for dunning email
    logger.info('Dunning email sent:', { invoiceId: invoice.invoice_id, template: dunningStep.template });
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  async updateSubscriptionAnalytics() {
    try {
      logger.info('Updating subscription analytics');
      
      // Calculate MRR (Monthly Recurring Revenue)
      const mrr = await this.calculateMRR();
      
      // Calculate churn rate
      const churnRate = await this.calculateChurnRate();
      
      // Calculate LTV (Lifetime Value)
      const ltv = await this.calculateLTV();
      
      // Store analytics
      await this.storeAnalytics({
        mrr,
        churnRate,
        ltv,
        date: new Date()
      });
      
      logger.info('Subscription analytics updated', { mrr, churnRate, ltv });
    } catch (error) {
      logger.error('Update subscription analytics error:', error);
    }
  }

  async calculateMRR() {
    const query = `
      SELECT SUM(price) as mrr
      FROM subscriptions s
      JOIN subscription_plans p ON s.plan_id = p.plan_id
      WHERE s.status = 'active'
      AND p.billing_cycle = 'monthly'
    `;
    
    const result = await this.db.query(query);
    return result.rows[0]?.mrr || 0;
  }

  async calculateChurnRate() {
    const query = `
      SELECT 
        COUNT(CASE WHEN status = 'cancelled' AND cancelled_at >= NOW() - INTERVAL '30 days' THEN 1 END) as churned,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as total
      FROM subscriptions
    `;
    
    const result = await this.db.query(query);
    const { churned, total } = result.rows[0];
    
    return total > 0 ? (churned / total) * 100 : 0;
  }

  async calculateLTV() {
    const query = `
      SELECT AVG(total_revenue) as ltv
      FROM (
        SELECT 
          user_id,
          SUM(price * EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - created_at)) / (30 * 24 * 3600)) as total_revenue
        FROM subscriptions
        GROUP BY user_id
      ) user_revenues
    `;
    
    const result = await this.db.query(query);
    return result.rows[0]?.ltv || 0;
  }

  async storeAnalytics(analyticsData) {
    const query = `
      INSERT INTO subscription_analytics (
        mrr, churn_rate, ltv, date, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `;
    
    const values = [
      analyticsData.mrr,
      analyticsData.churnRate,
      analyticsData.ltv,
      analyticsData.date
    ];
    
    await this.db.query(query, values);
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  async validateSubscriptionData(subscriptionData) {
    const { userId, planId } = subscriptionData;
    
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    if (!planId) {
      throw new Error('Plan ID is required');
    }
    
    // Validate plan exists
    const plan = await this.getSubscriptionPlan(planId);
    if (!plan) {
      throw new Error('Invalid subscription plan');
    }
  }

  // ============================================================================
  // COUPON MANAGEMENT
  // ============================================================================

  async applyCoupon(couponCode, amount) {
    // Placeholder for coupon application logic
    // This would typically validate the coupon and return discount information
    return null;
  }

  // ============================================================================
  // PAYMENT METHOD MANAGEMENT
  // ============================================================================

  async updatePaymentMethod(subscriptionId, paymentMethodId) {
    await this.updateSubscriptionRecord(subscriptionId, {
      payment_method_id: paymentMethodId
    });
  }

  async schedulePaymentRetry(subscription, invoice) {
    // Placeholder for payment retry scheduling
    logger.info('Payment retry scheduled:', { subscriptionId: subscription.subscription_id });
  }

  async processProrationPayment(subscription, proration) {
    if (proration.amount > 0) {
      // Charge additional amount
      const paymentData = {
        userId: subscription.user_id,
        amount: proration.amount,
        currency: proration.currency,
        paymentMethod: 'credit_card',
        description: proration.description
      };
      
      await this.paymentService.createPayment(paymentData);
    } else if (proration.amount < 0) {
      // Issue credit
      await this.issueCredit(subscription.user_id, Math.abs(proration.amount));
    }
  }

  async processProrationRefund(subscription) {
    // Calculate refund amount based on unused time
    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);
    const periodStart = new Date(subscription.current_period_start);
    
    const totalDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
    const unusedDays = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
    
    if (unusedDays > 0) {
      const refundAmount = Math.round((subscription.price * unusedDays) / totalDays);
      
      // Process refund
      await this.issueCredit(subscription.user_id, refundAmount);
      
      logger.info('Proration refund processed:', { 
        subscriptionId: subscription.subscription_id, 
        refundAmount 
      });
    }
  }

  async issueCredit(userId, amount) {
    // Add credit to user's account
    const query = `
      UPDATE user_wallets
      SET credit_balance = credit_balance + $2, updated_at = NOW()
      WHERE user_id = $1
    `;
    
    await this.db.query(query, [userId, amount]);
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  async close() {
    try {
      if (this.db) {
        await this.db.end();
      }
      
      if (this.redis) {
        await this.redis.quit();
      }
      
      if (this.paymentService) {
        await this.paymentService.close();
      }
      
      logger.info('Subscription service closed');
    } catch (error) {
      logger.error('Subscription service close error:', error);
    }
  }
}

module.exports = {
  SubscriptionService,
  SUBSCRIPTION_CONFIG,
  SUBSCRIPTION_PLANS
};