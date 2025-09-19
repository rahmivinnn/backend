// ============================================================================
// WEBSOCKET SERVER FOR REAL-TIME GAME COMMUNICATION
// ============================================================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const { DominoGameEngine, MatchmakingSystem, TournamentSystem } = require('./realtime_game_engine');
const { authenticateToken, checkSuspiciousActivity } = require('./backend_middleware');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Redis clients
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
});

const redisPub = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
});

const redisSub = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
});

// Initialize game systems
const gameEngine = new DominoGameEngine();
const matchmaking = new MatchmakingSystem(gameEngine);
const tournaments = new TournamentSystem(gameEngine);

// Store active connections
const activeConnections = new Map();
const gameRooms = new Map(); // gameId -> Set of socketIds
const userSockets = new Map(); // userId -> socketId

// ============================================================================
// SOCKET AUTHENTICATION MIDDLEWARE
// ============================================================================

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return next(new Error('Token is blacklisted'));
    }

    // Get user session from Redis
    const sessionData = await redis.get(`session:${decoded.userId}`);
    if (!sessionData) {
      return next(new Error('Session expired'));
    }

    const session = JSON.parse(sessionData);
    socket.userId = decoded.userId;
    socket.username = session.username;
    socket.userRole = session.role || 'player';
    socket.sessionId = session.sessionId;
    
    // Check for suspicious activity
    const suspiciousActivity = await checkSuspiciousActivity(socket.userId, socket.handshake.address);
    if (suspiciousActivity.blocked) {
      return next(new Error('Account temporarily blocked due to suspicious activity'));
    }

    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
});

// ============================================================================
// SOCKET CONNECTION HANDLING
// ============================================================================

io.on('connection', async (socket) => {
  console.log(`User ${socket.username} (${socket.userId}) connected: ${socket.id}`);
  
  // Store connection info
  activeConnections.set(socket.id, {
    userId: socket.userId,
    username: socket.username,
    role: socket.userRole,
    connectedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  });
  
  // Map user to socket for direct messaging
  userSockets.set(socket.userId, socket.id);
  
  // Update user online status
  await redis.setex(`user:online:${socket.userId}`, 300, JSON.stringify({
    socketId: socket.id,
    connectedAt: new Date().toISOString()
  }));
  
  // Join user to their personal room for notifications
  socket.join(`user:${socket.userId}`);
  
  // Send initial connection success
  socket.emit('connected', {
    message: 'Connected successfully',
    userId: socket.userId,
    username: socket.username,
    serverTime: new Date().toISOString()
  });

  // ============================================================================
  // GAME EVENTS
  // ============================================================================

  // Create game room
  socket.on('create_game', async (data, callback) => {
    try {
      const { gameMode, maxPlayers, isPrivate, password } = data;
      
      const gameConfig = {
        gameMode: gameMode || 'classic',
        maxPlayers: maxPlayers || 4,
        dominoesPerPlayer: 7,
        timeLimit: 30,
        isPrivate: isPrivate || false,
        password: password || null,
        createdBy: socket.userId,
        isRanked: !isPrivate
      };
      
      const game = await gameEngine.createGame(gameConfig);
      
      // Join creator to the game
      await gameEngine.joinGame(game.id, {
        id: socket.userId,
        username: socket.username,
        avatar: data.avatar || null
      });
      
      // Join socket to game room
      socket.join(`game:${game.id}`);
      
      if (!gameRooms.has(game.id)) {
        gameRooms.set(game.id, new Set());
      }
      gameRooms.get(game.id).add(socket.id);
      
      callback({ success: true, gameId: game.id, game: game.getPublicState() });
      
      // Broadcast game creation to lobby
      if (!isPrivate) {
        socket.broadcast.emit('game_created', {
          gameId: game.id,
          game: game.getPublicState()
        });
      }
      
    } catch (error) {
      console.error('Create game error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Join game room
  socket.on('join_game', async (data, callback) => {
    try {
      const { gameId, password } = data;
      
      const game = await gameEngine.getGame(gameId);
      if (!game) {
        return callback({ success: false, error: 'Game not found' });
      }
      
      // Check password for private games
      if (game.config.isPrivate && game.config.password !== password) {
        return callback({ success: false, error: 'Invalid password' });
      }
      
      // Join player to game
      const result = await gameEngine.joinGame(gameId, {
        id: socket.userId,
        username: socket.username,
        avatar: data.avatar || null
      });
      
      if (result.success) {
        // Join socket to game room
        socket.join(`game:${gameId}`);
        
        if (!gameRooms.has(gameId)) {
          gameRooms.set(gameId, new Set());
        }
        gameRooms.get(gameId).add(socket.id);
        
        // Send game state to player
        const playerState = game.getPlayerState(socket.userId);
        callback({ success: true, game: playerState });
        
        // Notify other players
        socket.to(`game:${gameId}`).emit('player_joined', {
          player: {
            id: socket.userId,
            username: socket.username,
            avatar: data.avatar || null
          },
          game: game.getPublicState()
        });
        
        // Auto-start if room is full
        if (game.players.length === game.config.maxPlayers) {
          setTimeout(async () => {
            await gameEngine.startGame(gameId);
            io.to(`game:${gameId}`).emit('game_started', {
              game: game.getPublicState()
            });
          }, 3000);
        }
      } else {
        callback({ success: false, error: result.error });
      }
      
    } catch (error) {
      console.error('Join game error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Leave game room
  socket.on('leave_game', async (data, callback) => {
    try {
      const { gameId } = data;
      
      await gameEngine.leaveGame(gameId, socket.userId);
      
      // Leave socket room
      socket.leave(`game:${gameId}`);
      
      if (gameRooms.has(gameId)) {
        gameRooms.get(gameId).delete(socket.id);
        if (gameRooms.get(gameId).size === 0) {
          gameRooms.delete(gameId);
        }
      }
      
      callback({ success: true });
      
      // Notify other players
      socket.to(`game:${gameId}`).emit('player_left', {
        playerId: socket.userId,
        username: socket.username
      });
      
    } catch (error) {
      console.error('Leave game error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Make game move
  socket.on('make_move', async (data, callback) => {
    try {
      const { gameId, move } = data;
      
      const result = await gameEngine.handleGameMove({
        gameId,
        playerId: socket.userId,
        move
      });
      
      callback(result);
      
      if (result.success) {
        // Broadcast move to all players in the game
        io.to(`game:${gameId}`).emit('move_made', {
          playerId: socket.userId,
          username: socket.username,
          move: move,
          result: result,
          timestamp: new Date().toISOString()
        });
        
        // Check if game ended
        const game = await gameEngine.getGame(gameId);
        if (game && game.status === 'finished') {
          io.to(`game:${gameId}`).emit('game_ended', {
            winner: game.winner,
            reason: result.reason,
            finalScores: game.players.map(p => ({
              id: p.id,
              username: p.username,
              score: p.score,
              finalPipCount: p.finalPipCount
            })),
            game: game.getPublicState()
          });
        }
      }
      
    } catch (error) {
      console.error('Make move error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Get game state
  socket.on('get_game_state', async (data, callback) => {
    try {
      const { gameId } = data;
      const game = await gameEngine.getGame(gameId);
      
      if (!game) {
        return callback({ success: false, error: 'Game not found' });
      }
      
      const playerState = game.getPlayerState(socket.userId);
      callback({ success: true, game: playerState });
      
    } catch (error) {
      console.error('Get game state error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // CHAT EVENTS
  // ============================================================================

  // Send chat message in game
  socket.on('game_chat', async (data, callback) => {
    try {
      const { gameId, message } = data;
      
      const game = await gameEngine.getGame(gameId);
      if (!game) {
        return callback({ success: false, error: 'Game not found' });
      }
      
      // Check if player is in the game
      if (!game.players.find(p => p.id === socket.userId)) {
        return callback({ success: false, error: 'Not in this game' });
      }
      
      // Add chat message to game
      const chatMessage = game.addChatMessage(socket.userId, message);
      
      // Broadcast to all players in the game
      io.to(`game:${gameId}`).emit('game_chat_message', {
        id: chatMessage.id,
        playerId: socket.userId,
        username: socket.username,
        message: message,
        timestamp: chatMessage.timestamp
      });
      
      callback({ success: true });
      
    } catch (error) {
      console.error('Game chat error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Send private message
  socket.on('private_message', async (data, callback) => {
    try {
      const { recipientId, message } = data;
      
      // Check if recipient is online
      const recipientSocketId = userSockets.get(recipientId);
      if (!recipientSocketId) {
        return callback({ success: false, error: 'User is offline' });
      }
      
      // Send message to recipient
      io.to(recipientSocketId).emit('private_message', {
        senderId: socket.userId,
        senderUsername: socket.username,
        message: message,
        timestamp: new Date().toISOString()
      });
      
      callback({ success: true });
      
    } catch (error) {
      console.error('Private message error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // MATCHMAKING EVENTS
  // ============================================================================

  // Join matchmaking queue
  socket.on('join_matchmaking', async (data, callback) => {
    try {
      const { gameMode, maxPlayers } = data;
      
      await matchmaking.addToQueue({
        id: socket.userId,
        username: socket.username,
        avatar: data.avatar || null,
        stats: data.stats || {}
      }, {
        gameMode: gameMode || 'classic',
        maxPlayers: maxPlayers || 4
      });
      
      callback({ success: true, message: 'Added to matchmaking queue' });
      
      // Notify user they're in queue
      socket.emit('matchmaking_status', {
        status: 'in_queue',
        estimatedWaitTime: 30 // seconds
      });
      
    } catch (error) {
      console.error('Join matchmaking error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Leave matchmaking queue
  socket.on('leave_matchmaking', async (data, callback) => {
    try {
      await matchmaking.removeFromQueue(socket.userId);
      callback({ success: true });
      
    } catch (error) {
      console.error('Leave matchmaking error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // TOURNAMENT EVENTS
  // ============================================================================

  // Create tournament
  socket.on('create_tournament', async (data, callback) => {
    try {
      // Only admins can create tournaments
      if (socket.userRole !== 'admin') {
        return callback({ success: false, error: 'Insufficient permissions' });
      }
      
      const tournament = await tournaments.createTournament(data);
      callback({ success: true, tournament });
      
      // Broadcast tournament creation
      io.emit('tournament_created', { tournament });
      
    } catch (error) {
      console.error('Create tournament error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Register for tournament
  socket.on('register_tournament', async (data, callback) => {
    try {
      const { tournamentId } = data;
      
      const result = await tournaments.registerPlayer(tournamentId, {
        id: socket.userId,
        username: socket.username,
        avatar: data.avatar || null,
        stats: data.stats || {}
      });
      
      callback(result);
      
      if (result.success) {
        // Notify all users about new registration
        io.emit('tournament_registration', {
          tournamentId,
          player: {
            id: socket.userId,
            username: socket.username
          },
          participantCount: result.participantCount
        });
      }
      
    } catch (error) {
      console.error('Register tournament error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // SOCIAL EVENTS
  // ============================================================================

  // Send friend request
  socket.on('send_friend_request', async (data, callback) => {
    try {
      const { targetUserId } = data;
      
      // Check if target user is online and notify them
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('friend_request_received', {
          senderId: socket.userId,
          senderUsername: socket.username,
          timestamp: new Date().toISOString()
        });
      }
      
      callback({ success: true });
      
    } catch (error) {
      console.error('Send friend request error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Accept friend request
  socket.on('accept_friend_request', async (data, callback) => {
    try {
      const { senderId } = data;
      
      // Notify sender that request was accepted
      const senderSocketId = userSockets.get(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('friend_request_accepted', {
          accepterId: socket.userId,
          accepterUsername: socket.username,
          timestamp: new Date().toISOString()
        });
      }
      
      callback({ success: true });
      
    } catch (error) {
      console.error('Accept friend request error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // ADMIN EVENTS
  // ============================================================================

  // Admin broadcast message
  socket.on('admin_broadcast', async (data, callback) => {
    try {
      if (socket.userRole !== 'admin') {
        return callback({ success: false, error: 'Insufficient permissions' });
      }
      
      const { message, type } = data;
      
      // Broadcast to all connected users
      io.emit('admin_announcement', {
        message,
        type: type || 'info',
        timestamp: new Date().toISOString()
      });
      
      callback({ success: true });
      
    } catch (error) {
      console.error('Admin broadcast error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Kick user from game
  socket.on('admin_kick_user', async (data, callback) => {
    try {
      if (socket.userRole !== 'admin') {
        return callback({ success: false, error: 'Insufficient permissions' });
      }
      
      const { userId, gameId, reason } = data;
      
      // Remove user from game
      await gameEngine.leaveGame(gameId, userId);
      
      // Disconnect user's socket
      const userSocketId = userSockets.get(userId);
      if (userSocketId) {
        const userSocket = io.sockets.sockets.get(userSocketId);
        if (userSocket) {
          userSocket.emit('kicked_from_game', {
            gameId,
            reason: reason || 'Kicked by admin',
            timestamp: new Date().toISOString()
          });
          userSocket.leave(`game:${gameId}`);
        }
      }
      
      callback({ success: true });
      
    } catch (error) {
      console.error('Admin kick user error:', error);
      callback({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // UTILITY EVENTS
  // ============================================================================

  // Ping/Pong for connection health
  socket.on('ping', (callback) => {
    callback({ pong: true, serverTime: new Date().toISOString() });
  });

  // Get online users count
  socket.on('get_online_count', (callback) => {
    callback({ count: activeConnections.size });
  });

  // Get active games list
  socket.on('get_active_games', async (callback) => {
    try {
      const games = [];
      for (const [gameId, game] of gameEngine.games.entries()) {
        if (!game.config.isPrivate && game.status === 'waiting') {
          games.push(game.getPublicState());
        }
      }
      callback({ success: true, games });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // DISCONNECT HANDLING
  // ============================================================================

  socket.on('disconnect', async (reason) => {
    console.log(`User ${socket.username} (${socket.userId}) disconnected: ${reason}`);
    
    // Remove from active connections
    activeConnections.delete(socket.id);
    userSockets.delete(socket.userId);
    
    // Remove from all game rooms
    for (const [gameId, socketIds] of gameRooms.entries()) {
      if (socketIds.has(socket.id)) {
        socketIds.delete(socket.id);
        
        // Handle player leaving game
        try {
          await gameEngine.leaveGame(gameId, socket.userId);
          
          // Notify other players
          socket.to(`game:${gameId}`).emit('player_disconnected', {
            playerId: socket.userId,
            username: socket.username,
            reason: 'disconnected'
          });
        } catch (error) {
          console.error('Error handling disconnect from game:', error);
        }
        
        if (socketIds.size === 0) {
          gameRooms.delete(gameId);
        }
      }
    }
    
    // Remove from matchmaking queue
    try {
      await matchmaking.removeFromQueue(socket.userId);
    } catch (error) {
      console.error('Error removing from matchmaking:', error);
    }
    
    // Update user offline status
    await redis.del(`user:online:${socket.userId}`);
  });
});

// ============================================================================
// REDIS PUB/SUB FOR DISTRIBUTED EVENTS
// ============================================================================

// Subscribe to game events from other servers
redisSub.subscribe('game:events', 'game:moves', 'game:chat', 'system:announcements');

redisSub.on('message', (channel, message) => {
  try {
    const data = JSON.parse(message);
    
    switch (channel) {
      case 'game:events':
        handleGameEvent(data);
        break;
      case 'game:moves':
        handleGameMove(data);
        break;
      case 'game:chat':
        handleGameChat(data);
        break;
      case 'system:announcements':
        handleSystemAnnouncement(data);
        break;
    }
  } catch (error) {
    console.error('Redis message handling error:', error);
  }
});

function handleGameEvent(data) {
  const { type, gameId } = data;
  
  switch (type) {
    case 'game_created':
      io.emit('game_created', data);
      break;
    case 'player_joined':
      io.to(`game:${gameId}`).emit('player_joined', data);
      break;
    case 'player_left':
      io.to(`game:${gameId}`).emit('player_left', data);
      break;
    case 'game_started':
      io.to(`game:${gameId}`).emit('game_started', data);
      break;
  }
}

function handleGameMove(data) {
  const { gameId } = data;
  io.to(`game:${gameId}`).emit('move_made', data);
}

function handleGameChat(data) {
  const { gameId } = data;
  io.to(`game:${gameId}`).emit('game_chat_message', data);
}

function handleSystemAnnouncement(data) {
  io.emit('system_announcement', data);
}

// ============================================================================
// HEALTH CHECK AND MONITORING
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connections: activeConnections.size,
    activeGames: gameEngine.games.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/metrics', (req, res) => {
  res.json({
    activeConnections: activeConnections.size,
    activeGames: gameEngine.games.size,
    gameRooms: gameRooms.size,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const PORT = process.env.WEBSOCKET_PORT || 3001;

server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('WebSocket server closed');
    redis.disconnect();
    redisPub.disconnect();
    redisSub.disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('WebSocket server closed');
    redis.disconnect();
    redisPub.disconnect();
    redisSub.disconnect();
    process.exit(0);
  });
});

module.exports = { app, server, io };