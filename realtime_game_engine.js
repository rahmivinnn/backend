// ============================================================================
// REAL-TIME GAME ENGINE FOR HIGGS DOMINO
// ============================================================================

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const Redis = require('ioredis');

// Redis clients for pub/sub and data storage
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

// ============================================================================
// DOMINO GAME ENGINE
// ============================================================================

class DominoGameEngine extends EventEmitter {
  constructor() {
    super();
    this.games = new Map(); // Active games in memory
    this.setupRedisSubscription();
  }

  // Setup Redis pub/sub for distributed game state
  setupRedisSubscription() {
    redisSub.subscribe('game:events', 'game:moves', 'game:chat');
    
    redisSub.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        this.handleRedisMessage(channel, data);
      } catch (error) {
        console.error('Redis message parsing error:', error);
      }
    });
  }

  // Handle messages from Redis pub/sub
  handleRedisMessage(channel, data) {
    switch (channel) {
      case 'game:events':
        this.emit('gameEvent', data);
        break;
      case 'game:moves':
        this.handleGameMove(data);
        break;
      case 'game:chat':
        this.emit('gameChat', data);
        break;
    }
  }

  // Create a new game room
  async createGame(roomConfig) {
    const gameId = uuidv4();
    const game = new DominoGame(gameId, roomConfig);
    
    this.games.set(gameId, game);
    
    // Store game state in Redis
    await redis.setex(`game:${gameId}`, 3600, JSON.stringify(game.getState()));
    
    // Publish game creation event
    await redisPub.publish('game:events', JSON.stringify({
      type: 'game_created',
      gameId: gameId,
      config: roomConfig,
      timestamp: new Date().toISOString()
    }));
    
    return game;
  }

  // Get game by ID
  async getGame(gameId) {
    let game = this.games.get(gameId);
    
    if (!game) {
      // Try to load from Redis
      const gameData = await redis.get(`game:${gameId}`);
      if (gameData) {
        const state = JSON.parse(gameData);
        game = DominoGame.fromState(state);
        this.games.set(gameId, game);
      }
    }
    
    return game;
  }

  // Handle player joining game
  async joinGame(gameId, player) {
    const game = await this.getGame(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    const result = game.addPlayer(player);
    
    // Update game state in Redis
    await redis.setex(`game:${gameId}`, 3600, JSON.stringify(game.getState()));
    
    // Publish join event
    await redisPub.publish('game:events', JSON.stringify({
      type: 'player_joined',
      gameId: gameId,
      player: player,
      gameState: game.getPublicState(),
      timestamp: new Date().toISOString()
    }));
    
    return result;
  }

  // Handle player leaving game
  async leaveGame(gameId, playerId) {
    const game = await this.getGame(gameId);
    if (!game) {
      return;
    }

    game.removePlayer(playerId);
    
    // Update or remove game state
    if (game.players.length === 0) {
      this.games.delete(gameId);
      await redis.del(`game:${gameId}`);
    } else {
      await redis.setex(`game:${gameId}`, 3600, JSON.stringify(game.getState()));
    }
    
    // Publish leave event
    await redisPub.publish('game:events', JSON.stringify({
      type: 'player_left',
      gameId: gameId,
      playerId: playerId,
      gameState: game.getPublicState(),
      timestamp: new Date().toISOString()
    }));
  }

  // Handle game move
  async handleGameMove(data) {
    const { gameId, playerId, move } = data;
    const game = await this.getGame(gameId);
    
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    try {
      const result = game.makeMove(playerId, move);
      
      // Update game state in Redis
      await redis.setex(`game:${gameId}`, 3600, JSON.stringify(game.getState()));
      
      // Publish move event
      await redisPub.publish('game:moves', JSON.stringify({
        type: 'move_made',
        gameId: gameId,
        playerId: playerId,
        move: move,
        result: result,
        gameState: game.getPublicState(),
        timestamp: new Date().toISOString()
      }));
      
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Start game
  async startGame(gameId) {
    const game = await this.getGame(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    game.start();
    
    // Update game state
    await redis.setex(`game:${gameId}`, 3600, JSON.stringify(game.getState()));
    
    // Publish start event
    await redisPub.publish('game:events', JSON.stringify({
      type: 'game_started',
      gameId: gameId,
      gameState: game.getPublicState(),
      timestamp: new Date().toISOString()
    }));
  }
}

// ============================================================================
// DOMINO GAME CLASS
// ============================================================================

class DominoGame {
  constructor(id, config) {
    this.id = id;
    this.config = config;
    this.players = [];
    this.status = 'waiting'; // waiting, playing, finished
    this.currentTurn = 0;
    this.board = [];
    this.dominoSet = this.generateDominoSet();
    this.gameStartTime = null;
    this.gameEndTime = null;
    this.winner = null;
    this.moves = [];
    this.chatMessages = [];
  }

  // Generate standard domino set (0-6 double-six set)
  generateDominoSet() {
    const dominoes = [];
    for (let i = 0; i <= 6; i++) {
      for (let j = i; j <= 6; j++) {
        dominoes.push({ left: i, right: j, id: `${i}-${j}` });
      }
    }
    return this.shuffleArray(dominoes);
  }

  // Shuffle array using Fisher-Yates algorithm
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Add player to game
  addPlayer(player) {
    if (this.players.length >= this.config.maxPlayers) {
      throw new Error('Game is full');
    }

    if (this.status !== 'waiting') {
      throw new Error('Game already started');
    }

    if (this.players.find(p => p.id === player.id)) {
      throw new Error('Player already in game');
    }

    this.players.push({
      ...player,
      hand: [],
      score: 0,
      isReady: false,
      joinedAt: new Date().toISOString()
    });

    return { success: true, playerCount: this.players.length };
  }

  // Remove player from game
  removePlayer(playerId) {
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return;
    }

    this.players.splice(playerIndex, 1);

    // If game was in progress, handle player leaving
    if (this.status === 'playing') {
      this.handlePlayerLeaving(playerId);
    }
  }

  // Handle player leaving during game
  handlePlayerLeaving(playerId) {
    // If it was the leaving player's turn, move to next player
    if (this.players[this.currentTurn]?.id === playerId) {
      this.nextTurn();
    }

    // Check if game should end due to insufficient players
    if (this.players.length < 2) {
      this.endGame('insufficient_players');
    }
  }

  // Start the game
  start() {
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players to start');
    }

    if (this.status !== 'waiting') {
      throw new Error('Game already started');
    }

    this.status = 'playing';
    this.gameStartTime = new Date().toISOString();
    
    // Deal dominoes to players
    this.dealDominoes();
    
    // Determine starting player (player with highest double)
    this.determineStartingPlayer();
  }

  // Deal dominoes to players
  dealDominoes() {
    const dominoesPerPlayer = this.config.dominoesPerPlayer || 7;
    
    for (let i = 0; i < dominoesPerPlayer; i++) {
      for (let player of this.players) {
        if (this.dominoSet.length > 0) {
          player.hand.push(this.dominoSet.pop());
        }
      }
    }
  }

  // Determine starting player (highest double domino)
  determineStartingPlayer() {
    let highestDouble = -1;
    let startingPlayerIndex = 0;

    this.players.forEach((player, index) => {
      player.hand.forEach(domino => {
        if (domino.left === domino.right && domino.left > highestDouble) {
          highestDouble = domino.left;
          startingPlayerIndex = index;
        }
      });
    });

    this.currentTurn = startingPlayerIndex;
  }

  // Make a move
  makeMove(playerId, move) {
    if (this.status !== 'playing') {
      throw new Error('Game is not in progress');
    }

    const currentPlayer = this.players[this.currentTurn];
    if (currentPlayer.id !== playerId) {
      throw new Error('Not your turn');
    }

    const result = this.validateAndExecuteMove(currentPlayer, move);
    
    if (result.success) {
      // Record the move
      this.moves.push({
        playerId: playerId,
        move: move,
        timestamp: new Date().toISOString(),
        turnNumber: this.moves.length + 1
      });

      // Check for win condition
      if (currentPlayer.hand.length === 0) {
        this.endGame('domino_out', playerId);
      } else if (this.isGameBlocked()) {
        this.endGame('blocked');
      } else {
        this.nextTurn();
      }
    }

    return result;
  }

  // Validate and execute move
  validateAndExecuteMove(player, move) {
    const { dominoId, position, orientation } = move;
    
    // Find domino in player's hand
    const dominoIndex = player.hand.findIndex(d => d.id === dominoId);
    if (dominoIndex === -1) {
      return { success: false, error: 'Domino not in hand' };
    }

    const domino = player.hand[dominoIndex];
    
    // If board is empty (first move)
    if (this.board.length === 0) {
      this.board.push({ ...domino, orientation: 'horizontal' });
      player.hand.splice(dominoIndex, 1);
      return { success: true, message: 'First domino placed' };
    }

    // Validate move against board
    const validation = this.validateMoveAgainstBoard(domino, position, orientation);
    if (!validation.success) {
      return validation;
    }

    // Execute the move
    this.executeMoveOnBoard(domino, position, orientation);
    player.hand.splice(dominoIndex, 1);
    
    return { success: true, message: 'Move executed successfully' };
  }

  // Validate move against current board state
  validateMoveAgainstBoard(domino, position, orientation) {
    const leftEnd = this.board[0];
    const rightEnd = this.board[this.board.length - 1];
    
    let leftValue, rightValue;
    
    if (leftEnd.orientation === 'horizontal') {
      leftValue = leftEnd.left;
    } else {
      leftValue = leftEnd.right;
    }
    
    if (rightEnd.orientation === 'horizontal') {
      rightValue = rightEnd.right;
    } else {
      rightValue = rightEnd.left;
    }

    if (position === 'left') {
      if (domino.right === leftValue || domino.left === leftValue) {
        return { success: true };
      }
    } else if (position === 'right') {
      if (domino.left === rightValue || domino.right === rightValue) {
        return { success: true };
      }
    }

    return { success: false, error: 'Domino does not match board ends' };
  }

  // Execute move on board
  executeMoveOnBoard(domino, position, orientation) {
    const placedDomino = { ...domino, orientation };
    
    if (position === 'left') {
      this.board.unshift(placedDomino);
    } else {
      this.board.push(placedDomino);
    }
  }

  // Check if game is blocked (no valid moves)
  isGameBlocked() {
    return this.players.every(player => 
      !this.hasValidMove(player)
    );
  }

  // Check if player has valid move
  hasValidMove(player) {
    if (this.board.length === 0) {
      return player.hand.length > 0;
    }

    const leftEnd = this.board[0];
    const rightEnd = this.board[this.board.length - 1];
    
    let leftValue = leftEnd.orientation === 'horizontal' ? leftEnd.left : leftEnd.right;
    let rightValue = rightEnd.orientation === 'horizontal' ? rightEnd.right : rightEnd.left;

    return player.hand.some(domino => 
      domino.left === leftValue || domino.right === leftValue ||
      domino.left === rightValue || domino.right === rightValue
    );
  }

  // Move to next turn
  nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
  }

  // End the game
  endGame(reason, winnerId = null) {
    this.status = 'finished';
    this.gameEndTime = new Date().toISOString();
    
    if (reason === 'domino_out') {
      this.winner = winnerId;
    } else if (reason === 'blocked') {
      // Find winner by lowest pip count
      let lowestPips = Infinity;
      let winner = null;
      
      this.players.forEach(player => {
        const pipCount = player.hand.reduce((sum, domino) => 
          sum + domino.left + domino.right, 0
        );
        
        if (pipCount < lowestPips) {
          lowestPips = pipCount;
          winner = player.id;
        }
      });
      
      this.winner = winner;
    }
    
    // Calculate final scores
    this.calculateFinalScores();
  }

  // Calculate final scores
  calculateFinalScores() {
    this.players.forEach(player => {
      const pipCount = player.hand.reduce((sum, domino) => 
        sum + domino.left + domino.right, 0
      );
      
      player.finalPipCount = pipCount;
      
      if (player.id === this.winner) {
        // Winner gets points from all other players' remaining dominoes
        const totalOpponentPips = this.players
          .filter(p => p.id !== player.id)
          .reduce((sum, p) => sum + p.finalPipCount, 0);
        
        player.score = totalOpponentPips;
      } else {
        player.score = -pipCount; // Negative score for remaining dominoes
      }
    });
  }

  // Add chat message
  addChatMessage(playerId, message) {
    if (!this.players.find(p => p.id === playerId)) {
      throw new Error('Player not in game');
    }

    const chatMessage = {
      id: uuidv4(),
      playerId: playerId,
      message: message,
      timestamp: new Date().toISOString()
    };

    this.chatMessages.push(chatMessage);
    
    // Keep only last 50 messages
    if (this.chatMessages.length > 50) {
      this.chatMessages = this.chatMessages.slice(-50);
    }

    return chatMessage;
  }

  // Get full game state (for persistence)
  getState() {
    return {
      id: this.id,
      config: this.config,
      players: this.players,
      status: this.status,
      currentTurn: this.currentTurn,
      board: this.board,
      dominoSet: this.dominoSet,
      gameStartTime: this.gameStartTime,
      gameEndTime: this.gameEndTime,
      winner: this.winner,
      moves: this.moves,
      chatMessages: this.chatMessages
    };
  }

  // Get public game state (without sensitive info like other players' hands)
  getPublicState() {
    return {
      id: this.id,
      config: this.config,
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        score: p.score,
        handCount: p.hand.length,
        isReady: p.isReady,
        joinedAt: p.joinedAt
      })),
      status: this.status,
      currentTurn: this.currentTurn,
      board: this.board,
      gameStartTime: this.gameStartTime,
      gameEndTime: this.gameEndTime,
      winner: this.winner,
      moveCount: this.moves.length,
      chatMessages: this.chatMessages.slice(-10) // Last 10 messages
    };
  }

  // Get player-specific state (includes player's hand)
  getPlayerState(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      return null;
    }

    return {
      ...this.getPublicState(),
      playerHand: player.hand,
      validMoves: this.getValidMovesForPlayer(player)
    };
  }

  // Get valid moves for a player
  getValidMovesForPlayer(player) {
    if (this.status !== 'playing' || this.players[this.currentTurn].id !== player.id) {
      return [];
    }

    const validMoves = [];
    
    if (this.board.length === 0) {
      // First move - any domino can be played
      player.hand.forEach(domino => {
        validMoves.push({
          dominoId: domino.id,
          position: 'center',
          orientation: 'horizontal'
        });
      });
    } else {
      // Check each domino against board ends
      const leftEnd = this.board[0];
      const rightEnd = this.board[this.board.length - 1];
      
      let leftValue = leftEnd.orientation === 'horizontal' ? leftEnd.left : leftEnd.right;
      let rightValue = rightEnd.orientation === 'horizontal' ? rightEnd.right : rightEnd.left;

      player.hand.forEach(domino => {
        // Check left end
        if (domino.left === leftValue || domino.right === leftValue) {
          validMoves.push({
            dominoId: domino.id,
            position: 'left',
            orientation: domino.left === leftValue ? 'normal' : 'flipped'
          });
        }
        
        // Check right end
        if (domino.left === rightValue || domino.right === rightValue) {
          validMoves.push({
            dominoId: domino.id,
            position: 'right',
            orientation: domino.left === rightValue ? 'normal' : 'flipped'
          });
        }
      });
    }

    return validMoves;
  }

  // Create game from saved state
  static fromState(state) {
    const game = new DominoGame(state.id, state.config);
    Object.assign(game, state);
    return game;
  }
}

// ============================================================================
// MATCHMAKING SYSTEM
// ============================================================================

class MatchmakingSystem {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.queue = new Map(); // skill-based queues
    this.setupMatchmaking();
  }

  setupMatchmaking() {
    // Run matchmaking every 5 seconds
    setInterval(() => {
      this.processMatchmaking();
    }, 5000);
  }

  // Add player to matchmaking queue
  async addToQueue(player, preferences = {}) {
    const skillLevel = this.calculateSkillLevel(player);
    const queueKey = `${preferences.gameMode || 'classic'}_${skillLevel}`;
    
    if (!this.queue.has(queueKey)) {
      this.queue.set(queueKey, []);
    }
    
    this.queue.get(queueKey).push({
      ...player,
      preferences,
      queuedAt: Date.now()
    });
    
    // Store in Redis for persistence
    await redis.sadd(`matchmaking:${queueKey}`, JSON.stringify({
      ...player,
      preferences,
      queuedAt: Date.now()
    }));
  }

  // Remove player from queue
  async removeFromQueue(playerId) {
    for (const [queueKey, players] of this.queue.entries()) {
      const index = players.findIndex(p => p.id === playerId);
      if (index !== -1) {
        players.splice(index, 1);
        await redis.srem(`matchmaking:${queueKey}`, playerId);
        break;
      }
    }
  }

  // Process matchmaking
  async processMatchmaking() {
    for (const [queueKey, players] of this.queue.entries()) {
      if (players.length >= 2) {
        const match = this.createMatch(players);
        if (match) {
          // Remove matched players from queue
          match.players.forEach(player => {
            const index = players.findIndex(p => p.id === player.id);
            if (index !== -1) {
              players.splice(index, 1);
            }
          });
          
          // Create game
          await this.createGameFromMatch(match);
        }
      }
    }
  }

  // Create match from queued players
  createMatch(players) {
    if (players.length < 2) return null;
    
    // Sort by queue time (FIFO)
    players.sort((a, b) => a.queuedAt - b.queuedAt);
    
    // Take first 2-4 players based on preferences
    const maxPlayers = players[0].preferences.maxPlayers || 4;
    const matchPlayers = players.slice(0, Math.min(maxPlayers, players.length));
    
    return {
      players: matchPlayers,
      gameMode: players[0].preferences.gameMode || 'classic',
      createdAt: Date.now()
    };
  }

  // Create game from match
  async createGameFromMatch(match) {
    const gameConfig = {
      gameMode: match.gameMode,
      maxPlayers: match.players.length,
      dominoesPerPlayer: 7,
      timeLimit: 30, // seconds per turn
      isRanked: true
    };
    
    const game = await this.gameEngine.createGame(gameConfig);
    
    // Add all players to the game
    for (const player of match.players) {
      await this.gameEngine.joinGame(game.id, player);
    }
    
    // Auto-start the game
    setTimeout(async () => {
      await this.gameEngine.startGame(game.id);
    }, 5000); // 5 second delay
    
    return game;
  }

  // Calculate player skill level
  calculateSkillLevel(player) {
    // Simple skill calculation based on wins/losses
    const winRate = player.stats?.winRate || 0;
    const gamesPlayed = player.stats?.gamesPlayed || 0;
    
    if (gamesPlayed < 10) return 'beginner';
    if (winRate < 0.3) return 'novice';
    if (winRate < 0.5) return 'intermediate';
    if (winRate < 0.7) return 'advanced';
    return 'expert';
  }
}

// ============================================================================
// TOURNAMENT SYSTEM
// ============================================================================

class TournamentSystem {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.tournaments = new Map();
  }

  // Create tournament
  async createTournament(config) {
    const tournament = {
      id: uuidv4(),
      name: config.name,
      type: config.type, // 'single_elimination', 'double_elimination', 'round_robin'
      maxParticipants: config.maxParticipants,
      entryFee: config.entryFee || 0,
      prizePool: config.prizePool || 0,
      startTime: config.startTime,
      status: 'registration', // registration, in_progress, completed
      participants: [],
      brackets: [],
      currentRound: 0,
      createdAt: new Date().toISOString()
    };
    
    this.tournaments.set(tournament.id, tournament);
    
    // Store in Redis
    await redis.setex(`tournament:${tournament.id}`, 24 * 60 * 60, JSON.stringify(tournament));
    
    return tournament;
  }

  // Register player for tournament
  async registerPlayer(tournamentId, player) {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }
    
    if (tournament.status !== 'registration') {
      throw new Error('Registration is closed');
    }
    
    if (tournament.participants.length >= tournament.maxParticipants) {
      throw new Error('Tournament is full');
    }
    
    tournament.participants.push({
      ...player,
      registeredAt: new Date().toISOString(),
      eliminated: false
    });
    
    // Update in Redis
    await redis.setex(`tournament:${tournamentId}`, 24 * 60 * 60, JSON.stringify(tournament));
    
    return { success: true, participantCount: tournament.participants.length };
  }

  // Start tournament
  async startTournament(tournamentId) {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }
    
    if (tournament.participants.length < 4) {
      throw new Error('Need at least 4 participants');
    }
    
    tournament.status = 'in_progress';
    tournament.brackets = this.generateBrackets(tournament);
    
    // Start first round
    await this.startTournamentRound(tournament);
    
    // Update in Redis
    await redis.setex(`tournament:${tournamentId}`, 24 * 60 * 60, JSON.stringify(tournament));
  }

  // Generate tournament brackets
  generateBrackets(tournament) {
    const participants = [...tournament.participants];
    this.shuffleArray(participants);
    
    const brackets = [];
    
    // Create first round matches
    for (let i = 0; i < participants.length; i += 2) {
      if (i + 1 < participants.length) {
        brackets.push({
          round: 1,
          match: Math.floor(i / 2) + 1,
          player1: participants[i],
          player2: participants[i + 1],
          winner: null,
          gameId: null,
          status: 'pending'
        });
      }
    }
    
    return brackets;
  }

  // Start tournament round
  async startTournamentRound(tournament) {
    const currentRoundMatches = tournament.brackets.filter(
      match => match.round === tournament.currentRound + 1 && match.status === 'pending'
    );
    
    for (const match of currentRoundMatches) {
      const gameConfig = {
        gameMode: 'tournament',
        maxPlayers: 2,
        dominoesPerPlayer: 7,
        timeLimit: 30,
        isRanked: false,
        tournamentId: tournament.id,
        matchId: match.match
      };
      
      const game = await this.gameEngine.createGame(gameConfig);
      match.gameId = game.id;
      match.status = 'in_progress';
      
      // Add players to game
      await this.gameEngine.joinGame(game.id, match.player1);
      await this.gameEngine.joinGame(game.id, match.player2);
      
      // Start game
      setTimeout(async () => {
        await this.gameEngine.startGame(game.id);
      }, 2000);
    }
    
    tournament.currentRound++;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  DominoGameEngine,
  DominoGame,
  MatchmakingSystem,
  TournamentSystem,
  redis,
  redisPub,
  redisSub
};