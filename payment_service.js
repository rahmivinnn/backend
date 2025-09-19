// ============================================================================
// ADVANCED PAYMENT & BILLING SERVICE
// ============================================================================

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const PayPal = require('@paypal/checkout-server-sdk');
const crypto = require('crypto');
const { Pool } = require('pg');
const Redis = require('ioredis');
const { logger } = require('./monitoring_service');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const jwt = require('jsonwebtoken');

// ============================================================================
// PAYMENT CONFIGURATION
// ============================================================================

const PAYMENT_CONFIG = {
  // Supported payment methods
  methods: {
    CREDIT_CARD: 'credit_card',
    PAYPAL: 'paypal',
    GOOGLE_PAY: 'google_pay',
    APPLE_PAY: 'apple_pay',
    BANK_TRANSFER: 'bank_transfer',
    CRYPTO: 'crypto',
    MOBILE_MONEY: 'mobile_money',
    GIFT_CARD: 'gift_card',
    WALLET: 'wallet'
  },
  
  // Payment statuses
  statuses: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded',
    PARTIALLY_REFUNDED: 'partially_refunded',
    DISPUTED: 'disputed',
    EXPIRED: 'expired'
  },
  
  // Transaction types
  transactionTypes: {
    PURCHASE: 'purchase',
    REFUND: 'refund',
    SUBSCRIPTION: 'subscription',
    TOPUP: 'topup',
    WITHDRAWAL: 'withdrawal',
    TRANSFER: 'transfer',
    REWARD: 'reward',
    PENALTY: 'penalty'
  },
  
  // Currency codes
  currencies: {
    USD: 'USD',
    EUR: 'EUR',
    GBP: 'GBP',
    JPY: 'JPY',
    CNY: 'CNY',
    IDR: 'IDR',
    SGD: 'SGD',
    MYR: 'MYR',
    THB: 'THB',
    VND: 'VND'
  },
  
  // Payment limits
  limits: {
    daily: {
      individual: 10000, // $100
      business: 100000   // $1000
    },
    monthly: {
      individual: 100000, // $1000
      business: 1000000  // $10000
    },
    transaction: {
      min: 100,    // $1
      max: 500000  // $5000
    }
  },
  
  // Fees configuration
  fees: {
    credit_card: {
      percentage: 2.9,
      fixed: 30 // cents
    },
    paypal: {
      percentage: 3.49,
      fixed: 49
    },
    bank_transfer: {
      percentage: 0.8,
      fixed: 0
    },
    crypto: {
      percentage: 1.0,
      fixed: 0
    }
  },
  
  // Retry configuration
  retry: {
    maxAttempts: 3,
    backoffMultiplier: 2,
    initialDelay: 1000
  },
  
  // Security settings
  security: {
    encryptionKey: process.env.PAYMENT_ENCRYPTION_KEY,
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
    tokenExpiry: 3600, // 1 hour
    maxFailedAttempts: 5
  }
};

// ============================================================================
// PAYMENT SERVICE CLASS
// ============================================================================

class PaymentService {
  constructor() {
    this.db = null;
    this.redis = null;
    this.paypalClient = null;
    this.isInitialized = false;
    
    this.paymentProviders = new Map();
    this.webhookHandlers = new Map();
    this.fraudDetectors = new Map();
    
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
        keyPrefix: 'payment:'
      });
      
      // Initialize PayPal client
      this.initializePayPal();
      
      // Setup payment providers
      this.setupPaymentProviders();
      
      // Setup webhook handlers
      this.setupWebhookHandlers();
      
      // Setup fraud detection
      this.setupFraudDetection();
      
      this.isInitialized = true;
      logger.info('Payment service initialized successfully');
    } catch (error) {
      logger.error('Payment service initialization error:', error);
      this.isInitialized = false;
    }
  }

  initializePayPal() {
    const environment = process.env.NODE_ENV === 'production' 
      ? new PayPal.core.LiveEnvironment(
          process.env.PAYPAL_CLIENT_ID,
          process.env.PAYPAL_CLIENT_SECRET
        )
      : new PayPal.core.SandboxEnvironment(
          process.env.PAYPAL_CLIENT_ID,
          process.env.PAYPAL_CLIENT_SECRET
        );
    
    this.paypalClient = new PayPal.core.PayPalHttpClient(environment);
  }

  setupPaymentProviders() {
    // Stripe provider
    this.paymentProviders.set('stripe', {
      createPayment: this.createStripePayment.bind(this),
      capturePayment: this.captureStripePayment.bind(this),
      refundPayment: this.refundStripePayment.bind(this),
      getPaymentStatus: this.getStripePaymentStatus.bind(this)
    });
    
    // PayPal provider
    this.paymentProviders.set('paypal', {
      createPayment: this.createPayPalPayment.bind(this),
      capturePayment: this.capturePayPalPayment.bind(this),
      refundPayment: this.refundPayPalPayment.bind(this),
      getPaymentStatus: this.getPayPalPaymentStatus.bind(this)
    });
    
    // Crypto provider
    this.paymentProviders.set('crypto', {
      createPayment: this.createCryptoPayment.bind(this),
      capturePayment: this.captureCryptoPayment.bind(this),
      refundPayment: this.refundCryptoPayment.bind(this),
      getPaymentStatus: this.getCryptoPaymentStatus.bind(this)
    });
  }

  setupWebhookHandlers() {
    this.webhookHandlers.set('stripe', this.handleStripeWebhook.bind(this));
    this.webhookHandlers.set('paypal', this.handlePayPalWebhook.bind(this));
    this.webhookHandlers.set('crypto', this.handleCryptoWebhook.bind(this));
  }

  setupFraudDetection() {
    this.fraudDetectors.set('velocity', this.detectVelocityFraud.bind(this));
    this.fraudDetectors.set('amount', this.detectAmountFraud.bind(this));
    this.fraudDetectors.set('location', this.detectLocationFraud.bind(this));
    this.fraudDetectors.set('device', this.detectDeviceFraud.bind(this));
  }

  // ============================================================================
  // PAYMENT PROCESSING
  // ============================================================================

  async createPayment(paymentData) {
    const {
      userId,
      amount,
      currency = 'USD',
      paymentMethod,
      description,
      metadata = {},
      returnUrl,
      cancelUrl
    } = paymentData;
    
    try {
      // Validate payment data
      await this.validatePaymentData(paymentData);
      
      // Check payment limits
      await this.checkPaymentLimits(userId, amount, currency);
      
      // Fraud detection
      const fraudScore = await this.detectFraud(paymentData);
      if (fraudScore > 0.8) {
        throw new Error('Payment blocked due to fraud detection');
      }
      
      // Generate payment ID
      const paymentId = uuidv4();
      
      // Calculate fees
      const fees = this.calculateFees(amount, paymentMethod);
      
      // Create payment record
      const payment = await this.createPaymentRecord({
        paymentId,
        userId,
        amount,
        currency,
        paymentMethod,
        description,
        metadata,
        fees,
        fraudScore,
        status: PAYMENT_CONFIG.statuses.PENDING
      });
      
      // Process with payment provider
      const provider = this.paymentProviders.get(this.getProviderForMethod(paymentMethod));
      if (!provider) {
        throw new Error(`Unsupported payment method: ${paymentMethod}`);
      }
      
      const providerResponse = await provider.createPayment({
        ...paymentData,
        paymentId,
        fees,
        returnUrl,
        cancelUrl
      });
      
      // Update payment with provider data
      await this.updatePaymentRecord(paymentId, {
        providerPaymentId: providerResponse.id,
        providerData: providerResponse,
        status: PAYMENT_CONFIG.statuses.PROCESSING
      });
      
      // Cache payment for quick access
      await this.redis.setex(`payment:${paymentId}`, 3600, JSON.stringify(payment));
      
      logger.info('Payment created:', { paymentId, userId, amount, paymentMethod });
      
      return {
        paymentId,
        status: PAYMENT_CONFIG.statuses.PROCESSING,
        amount,
        currency,
        fees,
        providerData: providerResponse,
        redirectUrl: providerResponse.redirectUrl
      };
    } catch (error) {
      logger.error('Create payment error:', error);
      throw error;
    }
  }

  async capturePayment(paymentId, captureData = {}) {
    try {
      const payment = await this.getPayment(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      if (payment.status !== PAYMENT_CONFIG.statuses.PROCESSING) {
        throw new Error(`Cannot capture payment with status: ${payment.status}`);
      }
      
      const provider = this.paymentProviders.get(this.getProviderForMethod(payment.payment_method));
      const captureResult = await provider.capturePayment(payment.provider_payment_id, captureData);
      
      // Update payment status
      await this.updatePaymentRecord(paymentId, {
        status: PAYMENT_CONFIG.statuses.COMPLETED,
        capturedAt: new Date(),
        captureData: captureResult
      });
      
      // Process successful payment
      await this.processSuccessfulPayment(payment);
      
      // Clear cache
      await this.redis.del(`payment:${paymentId}`);
      
      logger.info('Payment captured:', { paymentId, amount: payment.amount });
      
      return {
        paymentId,
        status: PAYMENT_CONFIG.statuses.COMPLETED,
        captureData: captureResult
      };
    } catch (error) {
      logger.error('Capture payment error:', error);
      
      // Update payment status to failed
      await this.updatePaymentRecord(paymentId, {
        status: PAYMENT_CONFIG.statuses.FAILED,
        errorMessage: error.message
      });
      
      throw error;
    }
  }

  async refundPayment(paymentId, refundData) {
    const {
      amount,
      reason,
      metadata = {}
    } = refundData;
    
    try {
      const payment = await this.getPayment(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      if (payment.status !== PAYMENT_CONFIG.statuses.COMPLETED) {
        throw new Error(`Cannot refund payment with status: ${payment.status}`);
      }
      
      const refundAmount = amount || payment.amount;
      if (refundAmount > payment.amount) {
        throw new Error('Refund amount cannot exceed payment amount');
      }
      
      const provider = this.paymentProviders.get(this.getProviderForMethod(payment.payment_method));
      const refundResult = await provider.refundPayment(payment.provider_payment_id, {
        amount: refundAmount,
        reason,
        metadata
      });
      
      // Create refund record
      const refundId = uuidv4();
      await this.createRefundRecord({
        refundId,
        paymentId,
        amount: refundAmount,
        reason,
        metadata,
        providerRefundId: refundResult.id,
        status: PAYMENT_CONFIG.statuses.COMPLETED
      });
      
      // Update payment status
      const newStatus = refundAmount === payment.amount 
        ? PAYMENT_CONFIG.statuses.REFUNDED 
        : PAYMENT_CONFIG.statuses.PARTIALLY_REFUNDED;
      
      await this.updatePaymentRecord(paymentId, {
        status: newStatus,
        refundedAmount: (payment.refunded_amount || 0) + refundAmount
      });
      
      // Process refund (update user balance, etc.)
      await this.processRefund(payment, refundAmount);
      
      logger.info('Payment refunded:', { paymentId, refundId, amount: refundAmount });
      
      return {
        refundId,
        paymentId,
        amount: refundAmount,
        status: PAYMENT_CONFIG.statuses.COMPLETED,
        refundData: refundResult
      };
    } catch (error) {
      logger.error('Refund payment error:', error);
      throw error;
    }
  }

  // ============================================================================
  // PAYMENT PROVIDERS IMPLEMENTATION
  // ============================================================================

  async createStripePayment(paymentData) {
    const { amount, currency, paymentMethod, description, metadata, returnUrl, cancelUrl } = paymentData;
    
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount), // Stripe expects amount in cents
        currency: currency.toLowerCase(),
        payment_method_types: [this.mapPaymentMethodToStripe(paymentMethod)],
        description,
        metadata,
        confirmation_method: 'manual',
        confirm: false
      });
      
      return {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
        redirectUrl: null // Stripe uses client-side confirmation
      };
    } catch (error) {
      logger.error('Stripe payment creation error:', error);
      throw error;
    }
  }

  async captureStripePayment(providerPaymentId, captureData) {
    try {
      const paymentIntent = await stripe.paymentIntents.confirm(providerPaymentId);
      
      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        charges: paymentIntent.charges.data
      };
    } catch (error) {
      logger.error('Stripe payment capture error:', error);
      throw error;
    }
  }

  async refundStripePayment(providerPaymentId, refundData) {
    try {
      const { amount, reason } = refundData;
      
      const refund = await stripe.refunds.create({
        payment_intent: providerPaymentId,
        amount: Math.round(amount),
        reason: reason || 'requested_by_customer'
      });
      
      return {
        id: refund.id,
        status: refund.status,
        amount: refund.amount
      };
    } catch (error) {
      logger.error('Stripe refund error:', error);
      throw error;
    }
  }

  async getStripePaymentStatus(providerPaymentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(providerPaymentId);
      return {
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency
      };
    } catch (error) {
      logger.error('Stripe payment status error:', error);
      throw error;
    }
  }

  async createPayPalPayment(paymentData) {
    const { amount, currency, description, returnUrl, cancelUrl } = paymentData;
    
    try {
      const request = new PayPal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency,
            value: (amount / 100).toFixed(2) // PayPal expects decimal amount
          },
          description
        }],
        application_context: {
          return_url: returnUrl,
          cancel_url: cancelUrl,
          brand_name: 'Higgs Domino',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW'
        }
      });
      
      const order = await this.paypalClient.execute(request);
      
      const approvalUrl = order.result.links.find(link => link.rel === 'approve').href;
      
      return {
        id: order.result.id,
        status: order.result.status,
        redirectUrl: approvalUrl
      };
    } catch (error) {
      logger.error('PayPal payment creation error:', error);
      throw error;
    }
  }

  async capturePayPalPayment(providerPaymentId, captureData) {
    try {
      const request = new PayPal.orders.OrdersCaptureRequest(providerPaymentId);
      request.requestBody({});
      
      const capture = await this.paypalClient.execute(request);
      
      return {
        id: capture.result.id,
        status: capture.result.status,
        captureId: capture.result.purchase_units[0].payments.captures[0].id
      };
    } catch (error) {
      logger.error('PayPal payment capture error:', error);
      throw error;
    }
  }

  async refundPayPalPayment(providerPaymentId, refundData) {
    try {
      const { amount } = refundData;
      
      // First get the capture ID
      const orderRequest = new PayPal.orders.OrdersGetRequest(providerPaymentId);
      const order = await this.paypalClient.execute(orderRequest);
      const captureId = order.result.purchase_units[0].payments.captures[0].id;
      
      // Create refund
      const refundRequest = new PayPal.payments.CapturesRefundRequest(captureId);
      refundRequest.requestBody({
        amount: {
          value: (amount / 100).toFixed(2),
          currency_code: 'USD'
        }
      });
      
      const refund = await this.paypalClient.execute(refundRequest);
      
      return {
        id: refund.result.id,
        status: refund.result.status,
        amount: parseFloat(refund.result.amount.value) * 100
      };
    } catch (error) {
      logger.error('PayPal refund error:', error);
      throw error;
    }
  }

  async getPayPalPaymentStatus(providerPaymentId) {
    try {
      const request = new PayPal.orders.OrdersGetRequest(providerPaymentId);
      const order = await this.paypalClient.execute(request);
      
      return {
        status: order.result.status,
        amount: parseFloat(order.result.purchase_units[0].amount.value) * 100,
        currency: order.result.purchase_units[0].amount.currency_code
      };
    } catch (error) {
      logger.error('PayPal payment status error:', error);
      throw error;
    }
  }

  async createCryptoPayment(paymentData) {
    const { amount, currency, description, metadata } = paymentData;
    
    try {
      // This is a placeholder for crypto payment integration
      // You would integrate with services like CoinGate, BitPay, or Coinbase Commerce
      
      const cryptoPayment = {
        id: uuidv4(),
        amount,
        currency,
        cryptoCurrency: 'BTC', // Default to Bitcoin
        address: this.generateCryptoAddress(),
        qrCode: this.generateQRCode(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        status: 'pending'
      };
      
      return {
        id: cryptoPayment.id,
        status: cryptoPayment.status,
        redirectUrl: `/crypto-payment/${cryptoPayment.id}`,
        cryptoData: cryptoPayment
      };
    } catch (error) {
      logger.error('Crypto payment creation error:', error);
      throw error;
    }
  }

  async captureCryptoPayment(providerPaymentId, captureData) {
    // Placeholder for crypto payment capture
    return {
      id: providerPaymentId,
      status: 'completed',
      transactionHash: 'mock_transaction_hash'
    };
  }

  async refundCryptoPayment(providerPaymentId, refundData) {
    // Crypto refunds are typically manual processes
    throw new Error('Crypto refunds must be processed manually');
  }

  async getCryptoPaymentStatus(providerPaymentId) {
    // Placeholder for crypto payment status check
    return {
      status: 'pending',
      amount: 0,
      currency: 'BTC'
    };
  }

  // ============================================================================
  // WEBHOOK HANDLERS
  // ============================================================================

  async handleWebhook(provider, payload, signature) {
    try {
      const handler = this.webhookHandlers.get(provider);
      if (!handler) {
        throw new Error(`No webhook handler for provider: ${provider}`);
      }
      
      await handler(payload, signature);
      
      logger.info('Webhook processed:', { provider });
    } catch (error) {
      logger.error('Webhook processing error:', error);
      throw error;
    }
  }

  async handleStripeWebhook(payload, signature) {
    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object);
          break;
        case 'charge.dispute.created':
          await this.handleDispute(event.data.object);
          break;
        default:
          logger.info('Unhandled Stripe webhook event:', event.type);
      }
    } catch (error) {
      logger.error('Stripe webhook error:', error);
      throw error;
    }
  }

  async handlePayPalWebhook(payload, signature) {
    try {
      // PayPal webhook verification and processing
      const event = JSON.parse(payload);
      
      switch (event.event_type) {
        case 'PAYMENT.CAPTURE.COMPLETED':
          await this.handlePaymentSuccess(event.resource);
          break;
        case 'PAYMENT.CAPTURE.DENIED':
          await this.handlePaymentFailure(event.resource);
          break;
        default:
          logger.info('Unhandled PayPal webhook event:', event.event_type);
      }
    } catch (error) {
      logger.error('PayPal webhook error:', error);
      throw error;
    }
  }

  async handleCryptoWebhook(payload, signature) {
    try {
      // Crypto payment webhook processing
      const event = JSON.parse(payload);
      
      switch (event.type) {
        case 'payment.confirmed':
          await this.handlePaymentSuccess(event.data);
          break;
        case 'payment.failed':
          await this.handlePaymentFailure(event.data);
          break;
        default:
          logger.info('Unhandled crypto webhook event:', event.type);
      }
    } catch (error) {
      logger.error('Crypto webhook error:', error);
      throw error;
    }
  }

  // ============================================================================
  // FRAUD DETECTION
  // ============================================================================

  async detectFraud(paymentData) {
    let fraudScore = 0;
    
    try {
      for (const [name, detector] of this.fraudDetectors) {
        const score = await detector(paymentData);
        fraudScore = Math.max(fraudScore, score);
        
        logger.debug('Fraud detection result:', { detector: name, score });
      }
      
      // Log high fraud scores
      if (fraudScore > 0.5) {
        await this.logFraudAttempt(paymentData, fraudScore);
      }
      
      return fraudScore;
    } catch (error) {
      logger.error('Fraud detection error:', error);
      return 0; // Default to no fraud if detection fails
    }
  }

  async detectVelocityFraud(paymentData) {
    const { userId, amount } = paymentData;
    
    try {
      // Check payment velocity (number of payments in short time)
      const recentPayments = await this.redis.llen(`user_payments:${userId}`);
      
      if (recentPayments > 10) { // More than 10 payments in the last hour
        return 0.8;
      }
      
      if (recentPayments > 5) {
        return 0.5;
      }
      
      return 0;
    } catch (error) {
      logger.error('Velocity fraud detection error:', error);
      return 0;
    }
  }

  async detectAmountFraud(paymentData) {
    const { userId, amount } = paymentData;
    
    try {
      // Check if amount is significantly higher than user's typical payments
      const avgAmount = await this.getUserAveragePaymentAmount(userId);
      
      if (avgAmount > 0 && amount > avgAmount * 10) {
        return 0.7;
      }
      
      if (amount > PAYMENT_CONFIG.limits.transaction.max) {
        return 0.9;
      }
      
      return 0;
    } catch (error) {
      logger.error('Amount fraud detection error:', error);
      return 0;
    }
  }

  async detectLocationFraud(paymentData) {
    const { userId, ipAddress, country } = paymentData;
    
    try {
      // Check if payment is from unusual location
      const userCountries = await this.redis.smembers(`user_countries:${userId}`);
      
      if (userCountries.length > 0 && !userCountries.includes(country)) {
        return 0.6;
      }
      
      return 0;
    } catch (error) {
      logger.error('Location fraud detection error:', error);
      return 0;
    }
  }

  async detectDeviceFraud(paymentData) {
    const { userId, deviceFingerprint } = paymentData;
    
    try {
      // Check if device is known for this user
      const knownDevices = await this.redis.smembers(`user_devices:${userId}`);
      
      if (knownDevices.length > 0 && !knownDevices.includes(deviceFingerprint)) {
        return 0.4;
      }
      
      return 0;
    } catch (error) {
      logger.error('Device fraud detection error:', error);
      return 0;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async validatePaymentData(paymentData) {
    const { userId, amount, currency, paymentMethod } = paymentData;
    
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    if (!amount || amount <= 0) {
      throw new Error('Valid amount is required');
    }
    
    if (amount < PAYMENT_CONFIG.limits.transaction.min) {
      throw new Error(`Amount must be at least $${PAYMENT_CONFIG.limits.transaction.min / 100}`);
    }
    
    if (amount > PAYMENT_CONFIG.limits.transaction.max) {
      throw new Error(`Amount cannot exceed $${PAYMENT_CONFIG.limits.transaction.max / 100}`);
    }
    
    if (!Object.values(PAYMENT_CONFIG.currencies).includes(currency)) {
      throw new Error('Unsupported currency');
    }
    
    if (!Object.values(PAYMENT_CONFIG.methods).includes(paymentMethod)) {
      throw new Error('Unsupported payment method');
    }
  }

  async checkPaymentLimits(userId, amount, currency) {
    try {
      // Get user's payment history for today and this month
      const today = new Date().toISOString().split('T')[0];
      const thisMonth = new Date().toISOString().substring(0, 7);
      
      const dailyTotal = await this.redis.get(`daily_total:${userId}:${today}`) || 0;
      const monthlyTotal = await this.redis.get(`monthly_total:${userId}:${thisMonth}`) || 0;
      
      // Check daily limit
      if (parseInt(dailyTotal) + amount > PAYMENT_CONFIG.limits.daily.individual) {
        throw new Error('Daily payment limit exceeded');
      }
      
      // Check monthly limit
      if (parseInt(monthlyTotal) + amount > PAYMENT_CONFIG.limits.monthly.individual) {
        throw new Error('Monthly payment limit exceeded');
      }
      
      // Update totals
      await this.redis.incrby(`daily_total:${userId}:${today}`, amount);
      await this.redis.expire(`daily_total:${userId}:${today}`, 86400); // 24 hours
      
      await this.redis.incrby(`monthly_total:${userId}:${thisMonth}`, amount);
      await this.redis.expire(`monthly_total:${userId}:${thisMonth}`, 2592000); // 30 days
    } catch (error) {
      logger.error('Payment limits check error:', error);
      throw error;
    }
  }

  calculateFees(amount, paymentMethod) {
    const feeConfig = PAYMENT_CONFIG.fees[paymentMethod] || PAYMENT_CONFIG.fees.credit_card;
    
    const percentageFee = Math.round(amount * (feeConfig.percentage / 100));
    const fixedFee = feeConfig.fixed;
    
    return {
      percentage: percentageFee,
      fixed: fixedFee,
      total: percentageFee + fixedFee
    };
  }

  getProviderForMethod(paymentMethod) {
    const providerMap = {
      [PAYMENT_CONFIG.methods.CREDIT_CARD]: 'stripe',
      [PAYMENT_CONFIG.methods.PAYPAL]: 'paypal',
      [PAYMENT_CONFIG.methods.GOOGLE_PAY]: 'stripe',
      [PAYMENT_CONFIG.methods.APPLE_PAY]: 'stripe',
      [PAYMENT_CONFIG.methods.CRYPTO]: 'crypto'
    };
    
    return providerMap[paymentMethod] || 'stripe';
  }

  mapPaymentMethodToStripe(paymentMethod) {
    const methodMap = {
      [PAYMENT_CONFIG.methods.CREDIT_CARD]: 'card',
      [PAYMENT_CONFIG.methods.GOOGLE_PAY]: 'card',
      [PAYMENT_CONFIG.methods.APPLE_PAY]: 'card'
    };
    
    return methodMap[paymentMethod] || 'card';
  }

  generateCryptoAddress() {
    // Placeholder for crypto address generation
    return '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  }

  generateQRCode() {
    // Placeholder for QR code generation
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }

  // ============================================================================
  // DATABASE OPERATIONS
  // ============================================================================

  async createPaymentRecord(paymentData) {
    const query = `
      INSERT INTO payments (
        payment_id, user_id, amount, currency, payment_method,
        description, metadata, fees, fraud_score, status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *
    `;
    
    const values = [
      paymentData.paymentId,
      paymentData.userId,
      paymentData.amount,
      paymentData.currency,
      paymentData.paymentMethod,
      paymentData.description,
      JSON.stringify(paymentData.metadata),
      JSON.stringify(paymentData.fees),
      paymentData.fraudScore,
      paymentData.status
    ];
    
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async updatePaymentRecord(paymentId, updateData) {
    const setClause = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const query = `
      UPDATE payments 
      SET ${setClause}, updated_at = NOW()
      WHERE payment_id = $1
      RETURNING *
    `;
    
    const values = [paymentId, ...Object.values(updateData)];
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getPayment(paymentId) {
    // Try cache first
    const cached = await this.redis.get(`payment:${paymentId}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Query database
    const query = 'SELECT * FROM payments WHERE payment_id = $1';
    const result = await this.db.query(query, [paymentId]);
    
    if (result.rows.length > 0) {
      const payment = result.rows[0];
      // Cache for 1 hour
      await this.redis.setex(`payment:${paymentId}`, 3600, JSON.stringify(payment));
      return payment;
    }
    
    return null;
  }

  async createRefundRecord(refundData) {
    const query = `
      INSERT INTO payment_refunds (
        refund_id, payment_id, amount, reason, metadata,
        provider_refund_id, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `;
    
    const values = [
      refundData.refundId,
      refundData.paymentId,
      refundData.amount,
      refundData.reason,
      JSON.stringify(refundData.metadata),
      refundData.providerRefundId,
      refundData.status
    ];
    
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getUserAveragePaymentAmount(userId) {
    const query = `
      SELECT AVG(amount) as avg_amount
      FROM payments
      WHERE user_id = $1 AND status = 'completed'
      AND created_at > NOW() - INTERVAL '30 days'
    `;
    
    const result = await this.db.query(query, [userId]);
    return result.rows[0]?.avg_amount || 0;
  }

  async logFraudAttempt(paymentData, fraudScore) {
    const query = `
      INSERT INTO fraud_attempts (
        user_id, payment_data, fraud_score, ip_address,
        device_fingerprint, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `;
    
    const values = [
      paymentData.userId,
      JSON.stringify(paymentData),
      fraudScore,
      paymentData.ipAddress,
      paymentData.deviceFingerprint
    ];
    
    await this.db.query(query, values);
  }

  // ============================================================================
  // BUSINESS LOGIC
  // ============================================================================

  async processSuccessfulPayment(payment) {
    try {
      // Update user balance or grant items
      await this.updateUserBalance(payment.user_id, payment.amount);
      
      // Send confirmation notification
      await this.sendPaymentConfirmation(payment);
      
      // Update analytics
      await this.updatePaymentAnalytics(payment);
      
      logger.info('Payment processed successfully:', payment.payment_id);
    } catch (error) {
      logger.error('Payment processing error:', error);
    }
  }

  async processRefund(payment, refundAmount) {
    try {
      // Deduct from user balance
      await this.updateUserBalance(payment.user_id, -refundAmount);
      
      // Send refund notification
      await this.sendRefundNotification(payment, refundAmount);
      
      logger.info('Refund processed successfully:', payment.payment_id);
    } catch (error) {
      logger.error('Refund processing error:', error);
    }
  }

  async updateUserBalance(userId, amount) {
    const query = `
      UPDATE user_wallets
      SET balance = balance + $2, updated_at = NOW()
      WHERE user_id = $1
    `;
    
    await this.db.query(query, [userId, amount]);
  }

  async sendPaymentConfirmation(payment) {
    // Placeholder for notification service integration
    logger.info('Payment confirmation sent:', payment.payment_id);
  }

  async sendRefundNotification(payment, refundAmount) {
    // Placeholder for notification service integration
    logger.info('Refund notification sent:', payment.payment_id);
  }

  async updatePaymentAnalytics(payment) {
    // Placeholder for analytics service integration
    logger.info('Payment analytics updated:', payment.payment_id);
  }

  async handlePaymentSuccess(providerData) {
    // Handle successful payment from webhook
    logger.info('Payment success webhook received:', providerData.id);
  }

  async handlePaymentFailure(providerData) {
    // Handle failed payment from webhook
    logger.info('Payment failure webhook received:', providerData.id);
  }

  async handleDispute(disputeData) {
    // Handle payment dispute
    logger.info('Payment dispute received:', disputeData.id);
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
      
      logger.info('Payment service closed');
    } catch (error) {
      logger.error('Payment service close error:', error);
    }
  }
}

module.exports = {
  PaymentService,
  PAYMENT_CONFIG
};