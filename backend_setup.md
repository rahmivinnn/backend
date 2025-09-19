# Backend Setup Files

## Package.json for Node.js Backend

```json
{
  "name": "higgs-domino-game-backend",
  "version": "1.0.0",
  "description": "Professional full-stack Unity game backend similar to Higgs Domino",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "migrate": "node src/database/migrate.js",
    "seed": "node src/database/seed.js",
    "build": "npm run lint && npm test",
    "docker:build": "docker build -t higgs-domino-api .",
    "docker:run": "docker run -p 3000:3000 higgs-domino-api"
  },
  "keywords": [
    "unity",
    "game",
    "domino",
    "multiplayer",
    "nodejs",
    "postgresql",
    "redis",
    "websocket"
  ],
  "author": "Your Game Studio",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2",
    "express-rate-limit": "^6.7.0",
    "express-validator": "^6.15.0",
    "helmet": "^6.1.5",
    "cors": "^2.8.5",
    "compression": "^1.7.4",
    "morgan": "^1.10.0",
    "winston": "^3.8.2",
    "winston-daily-rotate-file": "^4.7.1",
    "pg": "^8.11.0",
    "pg-pool": "^3.6.0",
    "redis": "^4.6.7",
    "ioredis": "^5.3.2",
    "socket.io": "^4.6.2",
    "socket.io-redis": "^6.1.1",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "crypto": "^1.0.1",
    "uuid": "^9.0.0",
    "moment": "^2.29.4",
    "moment-timezone": "^0.5.43",
    "lodash": "^4.17.21",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.32.1",
    "aws-sdk": "^2.1394.0",
    "@aws-sdk/client-s3": "^3.348.0",
    "@aws-sdk/s3-request-presigner": "^3.348.0",
    "node-cron": "^3.0.2",
    "agenda": "^4.3.0",
    "bull": "^4.10.4",
    "prom-client": "^14.2.0",
    "express-prometheus-middleware": "^1.2.0",
    "@sentry/node": "^7.52.1",
    "newrelic": "^10.1.0",
    "firebase-admin": "^11.8.0",
    "stripe": "^12.9.0",
    "paypal-rest-sdk": "^1.8.1",
    "node-fetch": "^3.3.1",
    "axios": "^1.4.0",
    "joi": "^17.9.2",
    "dotenv": "^16.1.4",
    "config": "^3.3.9"
  },
  "devDependencies": {
    "nodemon": "^2.0.22",
    "jest": "^29.5.0",
    "supertest": "^6.3.3",
    "eslint": "^8.42.0",
    "eslint-config-airbnb-base": "^15.0.0",
    "eslint-plugin-import": "^2.27.5",
    "prettier": "^2.8.8",
    "husky": "^8.0.3",
    "lint-staged": "^13.2.2",
    "@types/node": "^20.2.5"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=8.0.0"
  },
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.js": [
      "eslint --fix",
      "prettier --write",
      "git add"
    ]
  }
}
```

## Dockerfile for Backend

```dockerfile
# Use official Node.js runtime as base image
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown nodejs:nodejs logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start application with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
```

## WebSocket Server Package.json

```json
{
  "name": "higgs-domino-websocket-server",
  "version": "1.0.0",
  "description": "WebSocket server for real-time game communication",
  "main": "src/websocket-server.js",
  "scripts": {
    "start": "node src/websocket-server.js",
    "dev": "nodemon src/websocket-server.js",
    "test": "jest --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix"
  },
  "dependencies": {
    "socket.io": "^4.6.2",
    "socket.io-redis": "^6.1.1",
    "redis": "^4.6.7",
    "ioredis": "^5.3.2",
    "jsonwebtoken": "^9.0.0",
    "winston": "^3.8.2",
    "moment": "^2.29.4",
    "lodash": "^4.17.21",
    "uuid": "^9.0.0",
    "axios": "^1.4.0",
    "dotenv": "^16.1.4",
    "prom-client": "^14.2.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.22",
    "jest": "^29.5.0",
    "eslint": "^8.42.0"
  }
}
```

## WebSocket Dockerfile

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:18-alpine AS production

RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

RUN mkdir -p logs && chown nodejs:nodejs logs

USER nodejs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/websocket-server.js"]
```

## Health Check Script

```javascript
// healthcheck.js
const http = require('http');

const options = {
  host: 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  timeout: 2000
};

const request = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', (err) => {
  console.log('ERROR:', err.message);
  process.exit(1);
});

request.end();
```

## ESLint Configuration

```json
// .eslintrc.json
{
  "env": {
    "node": true,
    "es2021": true,
    "jest": true
  },
  "extends": [
    "eslint:recommended",
    "airbnb-base"
  ],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "error",
    "prefer-const": "error",
    "no-var": "error",
    "object-shorthand": "error",
    "prefer-arrow-callback": "error"
  }
}
```

## Prettier Configuration

```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

## Jest Configuration

```json
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/*.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
```

## Basic Server Structure

```javascript
// src/server.js
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');

const config = require('./config');
const logger = require('./utils/logger');
const database = require('./database');
const routes = require('./routes');
const websocketHandler = require('./websocket');
const errorHandler = require('./middleware/errorHandler');
const metrics = require('./middleware/metrics');

class GameServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST']
      }
    });
    this.redis = new Redis(config.redis.url);
  }

  async initialize() {
    // Setup middleware
    this.setupMiddleware();
    
    // Setup routes
    this.setupRoutes();
    
    // Setup WebSocket
    this.setupWebSocket();
    
    // Setup error handling
    this.setupErrorHandling();
    
    // Connect to database
    await database.connect();
    
    logger.info('Server initialized successfully');
  }

  setupMiddleware() {
    // Security
    this.app.use(helmet());
    this.app.use(cors(config.cors));
    
    // Performance
    this.app.use(compression());
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      message: 'Too many requests from this IP'
    });
    this.app.use('/api/', limiter);
    
    // Logging
    this.app.use(morgan('combined', { stream: logger.stream }));
    
    // Metrics
    this.app.use(metrics);
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
    
    // API routes
    this.app.use('/api', routes);
  }

  setupWebSocket() {
    websocketHandler(this.io, this.redis);
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  async start() {
    const port = config.server.port;
    
    this.server.listen(port, () => {
      logger.info(`Server running on port ${port}`);
      logger.info(`Environment: ${config.env}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('Shutting down server...');
    
    this.server.close(() => {
      logger.info('HTTP server closed');
    });
    
    await database.disconnect();
    await this.redis.disconnect();
    
    process.exit(0);
  }
}

// Start server
if (require.main === module) {
  const server = new GameServer();
  
  server.initialize()
    .then(() => server.start())
    .catch((error) => {
      logger.error('Failed to start server:', error);
      process.exit(1);
    });
}

module.exports = GameServer;
```

## Configuration Management

```javascript
// src/config/index.js
require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || 'localhost'
  },
  
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
    database: process.env.POSTGRES_DB || 'higgs_domino_game',
    username: process.env.POSTGRES_USER || 'gameuser',
    password: process.env.POSTGRES_PASSWORD,
    pool: {
      min: 2,
      max: 10,
      acquire: 30000,
      idle: 10000
    }
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d'
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    credentials: true
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
  },
  
  fileStorage: {
    type: process.env.FILE_STORAGE_TYPE || 'local',
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760, // 10MB
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.AWS_S3_BUCKET
    },
    cloudflare: {
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
      accessKey: process.env.CLOUDFLARE_R2_ACCESS_KEY,
      secretKey: process.env.CLOUDFLARE_R2_SECRET_KEY,
      bucket: process.env.CLOUDFLARE_R2_BUCKET
    }
  },
  
  game: {
    defaultStartingCoins: parseInt(process.env.DEFAULT_STARTING_COINS, 10) || 10000,
    defaultStartingGems: parseInt(process.env.DEFAULT_STARTING_GEMS, 10) || 100,
    maxRoomPlayers: parseInt(process.env.MAX_ROOM_PLAYERS, 10) || 4,
    gameTimeoutMinutes: parseInt(process.env.GAME_TIMEOUT_MINUTES, 10) || 30,
    matchmakingTimeoutSeconds: parseInt(process.env.MATCHMAKING_TIMEOUT_SECONDS, 10) || 60
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log'
  }
};

module.exports = config;
```

This backend setup provides:

1. **Professional Node.js structure** with proper dependency management
2. **Docker containerization** for easy deployment
3. **Comprehensive configuration** for different environments
4. **Security best practices** with helmet, rate limiting, and CORS
5. **Monitoring and logging** with Winston, Prometheus metrics
6. **Testing setup** with Jest and ESLint
7. **WebSocket server** for real-time communication
8. **Database and Redis integration**
9. **File upload handling** with AWS S3/CloudFlare R2 support
10. **Graceful shutdown** and error handling

The structure follows enterprise-level practices similar to professional game backends like Higgs Domino.