const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const dotenv = require('dotenv');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Load environment variables
dotenv.config();

// Import services and middleware
const apiRoutes = require('./api_routes');
const websocketServer = require('./websocket_server');
const MonitoringService = require('./monitoring_service');
const CacheService = require('./cache_service');
const SecurityService = require('./security_service');
const AnalyticsService = require('./analytics_service');
const NotificationService = require('./notification_service');

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3000;
const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 3001;
const CLUSTER_MODE = process.env.CLUSTER_MODE === 'true';
const NUM_WORKERS = process.env.NUM_WORKERS || os.cpus().length;

// Cluster setup for production
if (CLUSTER_MODE && cluster.isMaster && NODE_ENV === 'production') {
    console.log(`Master ${process.pid} is running`);
    console.log(`Starting ${NUM_WORKERS} workers...`);
    
    // Fork workers
    for (let i = 0; i < NUM_WORKERS; i++) {
        cluster.fork();
    }
    
    // Handle worker exit
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
        console.log('Starting a new worker...');
        cluster.fork();
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('Master received SIGTERM, shutting down gracefully...');
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
    });
    
} else {
    // Worker process or single process mode
    startServer();
}

async function startServer() {
    try {
        console.log(`Worker ${process.pid} starting...`);
        
        // Initialize services
        const monitoringService = new MonitoringService();
        const cacheService = new CacheService();
        const securityService = new SecurityService();
        const analyticsService = new AnalyticsService();
        const notificationService = new NotificationService();
        
        await Promise.all([
            monitoringService.initialize(),
            cacheService.initialize(),
            securityService.initialize(),
            analyticsService.initialize(),
            notificationService.initialize()
        ]);
        
        console.log('All services initialized successfully');
        
        // Create Express app
        const app = express();
        const server = http.createServer(app);
        
        // Trust proxy for load balancer
        app.set('trust proxy', 1);
        
        // Security middleware
        app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    scriptSrc: ["'self'"],
                    connectSrc: ["'self'", 'ws:', 'wss:']
                }
            },
            crossOriginEmbedderPolicy: false
        }));
        
        // Compression middleware
        app.use(compression({
            filter: (req, res) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                return compression.filter(req, res);
            },
            threshold: 1024
        }));
        
        // Logging middleware
        if (NODE_ENV === 'production') {
            app.use(morgan('combined'));
        } else {
            app.use(morgan('dev'));
        }
        
        // Global rate limiting
        const globalLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: NODE_ENV === 'production' ? 1000 : 10000, // requests per window
            message: {
                error: 'Too many requests from this IP, please try again later.',
                retryAfter: '15 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
            skip: (req) => {
                // Skip rate limiting for health checks and metrics
                return req.path === '/health' || req.path === '/metrics';
            }
        });
        
        app.use(globalLimiter);
        
        // Request monitoring middleware
        app.use((req, res, next) => {
            const startTime = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                monitoringService.recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode, duration);
            });
            
            next();
        });
        
        // Body parsing middleware
        app.use(express.json({ 
            limit: '10mb',
            verify: (req, res, buf) => {
                // Store raw body for webhook verification
                req.rawBody = buf;
            }
        }));
        app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Static files middleware
        if (NODE_ENV === 'production') {
            app.use('/static', express.static(path.join(__dirname, 'public'), {
                maxAge: '1y',
                etag: true,
                lastModified: true
            }));
        }
        
        // API routes
        app.use('/api/v1', apiRoutes);
        
        // WebSocket proxy for load balancing
        if (NODE_ENV === 'production') {
            app.use('/socket.io', createProxyMiddleware({
                target: `http://localhost:${WEBSOCKET_PORT}`,
                changeOrigin: true,
                ws: true,
                logLevel: 'warn'
            }));
        }
        
        // Health check endpoint
        app.get('/health', async (req, res) => {
            try {
                const health = await monitoringService.getHealthStatus();
                const status = health.status === 'healthy' ? 200 : 503;
                res.status(status).json({
                    ...health,
                    worker: process.pid,
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(503).json({
                    status: 'error',
                    message: error.message,
                    worker: process.pid,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // Metrics endpoint
        app.get('/metrics', async (req, res) => {
            try {
                const metrics = await monitoringService.getMetrics();
                res.set('Content-Type', 'text/plain');
                res.send(metrics);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // API documentation endpoint
        app.get('/docs', (req, res) => {
            res.sendFile(path.join(__dirname, 'api_documentation.md'));
        });
        
        // Root endpoint
        app.get('/', (req, res) => {
            res.json({
                name: 'Higgs Domino API Server',
                version: '1.0.0',
                status: 'running',
                worker: process.pid,
                environment: NODE_ENV,
                timestamp: new Date().toISOString(),
                endpoints: {
                    api: '/api/v1',
                    health: '/health',
                    metrics: '/metrics',
                    docs: '/docs',
                    websocket: NODE_ENV === 'production' ? '/socket.io' : `http://localhost:${WEBSOCKET_PORT}`
                }
            });
        });
        
        // Error handling middleware
        app.use((error, req, res, next) => {
            console.error('Unhandled error:', error);
            monitoringService.recordError(error, 'UNHANDLED_ERROR');
            
            if (res.headersSent) {
                return next(error);
            }
            
            const status = error.status || error.statusCode || 500;
            const message = NODE_ENV === 'production' ? 'Internal server error' : error.message;
            
            res.status(status).json({
                error: message,
                timestamp: new Date().toISOString(),
                requestId: req.id
            });
        });
        
        // 404 handler
        app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Endpoint not found',
                path: req.originalUrl,
                method: req.method,
                timestamp: new Date().toISOString()
            });
        });
        
        // Start HTTP server
        server.listen(PORT, () => {
            console.log(`🚀 HTTP Server running on port ${PORT} (Worker ${process.pid})`);
            console.log(`📊 Environment: ${NODE_ENV}`);
            console.log(`🔗 API Base URL: http://localhost:${PORT}/api/v1`);
            console.log(`📋 Health Check: http://localhost:${PORT}/health`);
            console.log(`📈 Metrics: http://localhost:${PORT}/metrics`);
        });
        
        // Start WebSocket server in separate process for better performance
        if (!CLUSTER_MODE || cluster.isMaster) {
            startWebSocketServer();
        }
        
        // Graceful shutdown handling
        const gracefulShutdown = async (signal) => {
            console.log(`\n${signal} received. Starting graceful shutdown...`);
            
            // Stop accepting new connections
            server.close(async () => {
                console.log('HTTP server closed');
                
                try {
                    // Close all services
                    await Promise.all([
                        monitoringService.close(),
                        cacheService.close(),
                        securityService.close(),
                        analyticsService.close(),
                        notificationService.close()
                    ]);
                    
                    console.log('All services closed successfully');
                    process.exit(0);
                } catch (error) {
                    console.error('Error during graceful shutdown:', error);
                    process.exit(1);
                }
            });
            
            // Force shutdown after 30 seconds
            setTimeout(() => {
                console.error('Forced shutdown after timeout');
                process.exit(1);
            }, 30000);
        };
        
        // Handle shutdown signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            monitoringService.recordError(error, 'UNCAUGHT_EXCEPTION');
            gracefulShutdown('UNCAUGHT_EXCEPTION');
        });
        
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            monitoringService.recordError(new Error(reason), 'UNHANDLED_REJECTION');
        });
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start WebSocket server
function startWebSocketServer() {
    const { spawn } = require('child_process');
    
    const wsServer = spawn('node', ['websocket_server.js'], {
        stdio: 'inherit',
        env: { ...process.env, PORT: WEBSOCKET_PORT }
    });
    
    wsServer.on('error', (error) => {
        console.error('WebSocket server error:', error);
    });
    
    wsServer.on('exit', (code, signal) => {
        if (code !== 0) {
            console.error(`WebSocket server exited with code ${code} and signal ${signal}`);
            // Restart WebSocket server
            setTimeout(() => {
                console.log('Restarting WebSocket server...');
                startWebSocketServer();
            }, 5000);
        }
    });
    
    console.log(`🔌 WebSocket Server starting on port ${WEBSOCKET_PORT}`);
}

// Export for testing
module.exports = { startServer };