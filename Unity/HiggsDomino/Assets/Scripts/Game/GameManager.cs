using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using System;
using Newtonsoft.Json;
using HiggsDomino.Network;
using HiggsDomino.UI;

namespace HiggsDomino.Game
{
    /// <summary>
    /// Manages the core game logic for Higgs Domino
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        #region Singleton
        public static GameManager Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        #endregion

        [Header("Game Configuration")]
        [SerializeField] private float turnTimeLimit = 30f;
        [SerializeField] private int maxPlayersPerRoom = 4;
        
        [Header("Prefabs")]
        [SerializeField] private GameObject dominoTilePrefab;
        [SerializeField] private GameObject playerHandPrefab;

        // Game state
        private GameState currentGameState = GameState.Lobby;
        private string currentRoomId;
        private List<DominoTile> playerHand = new List<DominoTile>();
        private List<DominoTile> boardTiles = new List<DominoTile>();
        private List<PlayerInfo> players = new List<PlayerInfo>();
        private string currentPlayerId;
        private float turnTimer;
        private bool isMyTurn;

        // Events
        public event Action<GameState> OnGameStateChanged;
        public event Action<List<DominoTile>> OnHandUpdated;
        public event Action<List<DominoTile>> OnBoardUpdated;
        public event Action<List<PlayerInfo>> OnPlayersUpdated;
        public event Action<string> OnTurnChanged;
        public event Action<float> OnTurnTimerUpdated;
        public event Action<GameResult> OnGameEnded;

        private void Start()
        {
            // Subscribe to network events
            NetworkManager.Instance.OnConnectionStatusChanged += HandleConnectionStatusChanged;
        }

        private void Update()
        {
            // Update turn timer if it's active
            if (currentGameState == GameState.Playing && turnTimer > 0)
            {
                turnTimer -= Time.deltaTime;
                OnTurnTimerUpdated?.Invoke(turnTimer);

                if (turnTimer <= 0)
                {
                    // Auto-skip turn if time runs out
                    if (isMyTurn)
                    {
                        SkipTurn();
                    }
                }
            }
        }

        /// <summary>
        /// Handles connection status changes
        /// </summary>
        private void HandleConnectionStatusChanged(bool connected)
        {
            if (!connected && currentGameState == GameState.Playing)
            {
                // Handle disconnection during game
                UIManager.Instance.ShowNotification("Connection lost. Attempting to reconnect...", NotificationType.Error);
            }
        }

        /// <summary>
        /// Creates a new game room
        /// </summary>
        /// <param name="roomName">Name of the room</param>
        /// <param name="isPrivate">Whether the room is private</param>
        /// <param name="gameMode">Game mode</param>
        /// <returns>True if room creation was successful</returns>
        public async void CreateRoom(string roomName, bool isPrivate, GameMode gameMode)
        {
            try
            {
                var roomData = new
                {
                    name = roomName,
                    isPrivate = isPrivate,
                    gameMode = gameMode.ToString(),
                    maxPlayers = maxPlayersPerRoom
                };

                var response = await NetworkManager.Instance.PostAsync<RoomResponse>("rooms/create", roomData);
                
                if (response != null && !string.IsNullOrEmpty(response.roomId))
                {
                    currentRoomId = response.roomId;
                    JoinRoom(currentRoomId);
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error creating room: {ex.Message}");
                UIManager.Instance.ShowNotification("Failed to create room", NotificationType.Error);
            }
        }

        /// <summary>
        /// Joins an existing game room
        /// </summary>
        /// <param name="roomId">ID of the room to join</param>
        public async void JoinRoom(string roomId)
        {
            try
            {
                var joinData = new
                {
                    roomId = roomId
                };

                var response = await NetworkManager.Instance.PostAsync<JoinRoomResponse>("rooms/join", joinData);
                
                if (response != null)
                {
                    currentRoomId = roomId;
                    players = response.players;
                    OnPlayersUpdated?.Invoke(players);
                    
                    // Change game state to waiting
                    ChangeGameState(GameState.Waiting);
                    
                    // Subscribe to room updates via WebSocket
                    NetworkManager.Instance.SendWebSocketMessage("subscribe_room", new { roomId = currentRoomId });
                    
                    UIManager.Instance.ShowGameRoomUI();
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error joining room: {ex.Message}");
                UIManager.Instance.ShowNotification("Failed to join room", NotificationType.Error);
            }
        }

        /// <summary>
        /// Leaves the current game room
        /// </summary>
        public async void LeaveRoom()
        {
            if (string.IsNullOrEmpty(currentRoomId)) return;

            try
            {
                var leaveData = new
                {
                    roomId = currentRoomId
                };

                await NetworkManager.Instance.PostAsync<object>("rooms/leave", leaveData);
                
                // Unsubscribe from room updates
                NetworkManager.Instance.SendWebSocketMessage("unsubscribe_room", new { roomId = currentRoomId });
                
                // Reset game state
                currentRoomId = null;
                players.Clear();
                playerHand.Clear();
                boardTiles.Clear();
                
                // Change game state to lobby
                ChangeGameState(GameState.Lobby);
                
                UIManager.Instance.ShowLobbyUI();
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error leaving room: {ex.Message}");
                UIManager.Instance.ShowNotification("Failed to leave room", NotificationType.Error);
            }
        }

        /// <summary>
        /// Starts the game in the current room
        /// </summary>
        public async void StartGame()
        {
            if (string.IsNullOrEmpty(currentRoomId)) return;

            try
            {
                var startData = new
                {
                    roomId = currentRoomId
                };

                await NetworkManager.Instance.PostAsync<object>("rooms/start", startData);
                
                // Game will start via WebSocket update
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error starting game: {ex.Message}");
                UIManager.Instance.ShowNotification("Failed to start game", NotificationType.Error);
            }
        }

        /// <summary>
        /// Plays a domino tile
        /// </summary>
        /// <param name="tileIndex">Index of the tile in player's hand</param>
        /// <param name="boardPosition">Position on the board to play the tile</param>
        public async void PlayTile(int tileIndex, BoardPosition boardPosition)
        {
            if (!isMyTurn || tileIndex < 0 || tileIndex >= playerHand.Count) return;

            try
            {
                var playData = new
                {
                    roomId = currentRoomId,
                    tileIndex = tileIndex,
                    boardPosition = new
                    {
                        x = boardPosition.x,
                        y = boardPosition.y,
                        rotation = boardPosition.rotation
                    }
                };

                await NetworkManager.Instance.PostAsync<object>("game/play", playData);
                
                // Game update will come via WebSocket
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error playing tile: {ex.Message}");
                UIManager.Instance.ShowNotification("Failed to play tile", NotificationType.Error);
            }
        }

        /// <summary>
        /// Skips the current player's turn
        /// </summary>
        public async void SkipTurn()
        {
            if (!isMyTurn) return;

            try
            {
                var skipData = new
                {
                    roomId = currentRoomId
                };

                await NetworkManager.Instance.PostAsync<object>("game/skip", skipData);
                
                // Game update will come via WebSocket
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error skipping turn: {ex.Message}");
                UIManager.Instance.ShowNotification("Failed to skip turn", NotificationType.Error);
            }
        }

        /// <summary>
        /// Draws a tile from the deck
        /// </summary>
        public async void DrawTile()
        {
            if (!isMyTurn) return;

            try
            {
                var drawData = new
                {
                    roomId = currentRoomId
                };

                await NetworkManager.Instance.PostAsync<object>("game/draw", drawData);
                
                // Game update will come via WebSocket
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error drawing tile: {ex.Message}");
                UIManager.Instance.ShowNotification("Failed to draw tile", NotificationType.Error);
            }
        }

        /// <summary>
        /// Handles game updates from the server
        /// </summary>
        /// <param name="updateData">Update data from server</param>
        public void HandleGameUpdate(object updateData)
        {
            try
            {
                string json = JsonConvert.SerializeObject(updateData);
                GameUpdate update = JsonConvert.DeserializeObject<GameUpdate>(json);
                
                switch (update.updateType)
                {
                    case "game_start":
                        HandleGameStart(update);
                        break;
                    case "turn_update":
                        HandleTurnUpdate(update);
                        break;
                    case "hand_update":
                        HandleHandUpdate(update);
                        break;
                    case "board_update":
                        HandleBoardUpdate(update);
                        break;
                    case "player_update":
                        HandlePlayerUpdate(update);
                        break;
                    case "game_end":
                        HandleGameEnd(update);
                        break;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling game update: {ex.Message}");
            }
        }

        /// <summary>
        /// Handles game start update
        /// </summary>
        private void HandleGameStart(GameUpdate update)
        {
            GameStartData startData = JsonConvert.DeserializeObject<GameStartData>(JsonConvert.SerializeObject(update.data));
            
            playerHand = startData.hand;
            boardTiles = startData.board;
            players = startData.players;
            currentPlayerId = startData.currentPlayerId;
            turnTimer = turnTimeLimit;
            
            isMyTurn = currentPlayerId == PlayerDataManager.Instance.CurrentUserId;
            
            OnHandUpdated?.Invoke(playerHand);
            OnBoardUpdated?.Invoke(boardTiles);
            OnPlayersUpdated?.Invoke(players);
            OnTurnChanged?.Invoke(currentPlayerId);
            
            ChangeGameState(GameState.Playing);
            
            UIManager.Instance.ShowGameplayUI();
        }

        /// <summary>
        /// Handles turn update
        /// </summary>
        private void HandleTurnUpdate(GameUpdate update)
        {
            TurnUpdateData turnData = JsonConvert.DeserializeObject<TurnUpdateData>(JsonConvert.SerializeObject(update.data));
            
            currentPlayerId = turnData.currentPlayerId;
            turnTimer = turnTimeLimit;
            
            isMyTurn = currentPlayerId == PlayerDataManager.Instance.CurrentUserId;
            
            OnTurnChanged?.Invoke(currentPlayerId);
            
            if (isMyTurn)
            {
                UIManager.Instance.ShowNotification("Your turn!", NotificationType.Info);
            }
        }

        /// <summary>
        /// Handles hand update
        /// </summary>
        private void HandleHandUpdate(GameUpdate update)
        {
            HandUpdateData handData = JsonConvert.DeserializeObject<HandUpdateData>(JsonConvert.SerializeObject(update.data));
            
            playerHand = handData.hand;
            
            OnHandUpdated?.Invoke(playerHand);
        }

        /// <summary>
        /// Handles board update
        /// </summary>
        private void HandleBoardUpdate(GameUpdate update)
        {
            BoardUpdateData boardData = JsonConvert.DeserializeObject<BoardUpdateData>(JsonConvert.SerializeObject(update.data));
            
            boardTiles = boardData.board;
            
            OnBoardUpdated?.Invoke(boardTiles);
        }

        /// <summary>
        /// Handles player update
        /// </summary>
        private void HandlePlayerUpdate(GameUpdate update)
        {
            PlayerUpdateData playerData = JsonConvert.DeserializeObject<PlayerUpdateData>(JsonConvert.SerializeObject(update.data));
            
            players = playerData.players;
            
            OnPlayersUpdated?.Invoke(players);
        }

        /// <summary>
        /// Handles game end update
        /// </summary>
        private void HandleGameEnd(GameUpdate update)
        {
            GameEndData endData = JsonConvert.DeserializeObject<GameEndData>(JsonConvert.SerializeObject(update.data));
            
            GameResult result = new GameResult
            {
                winnerId = endData.winnerId,
                players = endData.players,
                rewards = endData.rewards
            };
            
            OnGameEnded?.Invoke(result);
            
            ChangeGameState(GameState.GameOver);
            
            UIManager.Instance.ShowGameOverUI(result);
        }

        /// <summary>
        /// Changes the current game state
        /// </summary>
        /// <param name="newState">New game state</param>
        private void ChangeGameState(GameState newState)
        {
            currentGameState = newState;
            OnGameStateChanged?.Invoke(currentGameState);
        }

        private void OnDestroy()
        {
            // Unsubscribe from events
            if (NetworkManager.Instance != null)
            {
                NetworkManager.Instance.OnConnectionStatusChanged -= HandleConnectionStatusChanged;
            }
        }
    }

    #region Data Classes

    [Serializable]
    public enum GameState
    {
        Lobby,
        Waiting,
        Playing,
        GameOver
    }

    [Serializable]
    public enum GameMode
    {
        Classic,
        Speed,
        Tournament
    }

    [Serializable]
    public class DominoTile
    {
        public int leftValue;
        public int rightValue;
        public int id;
    }

    [Serializable]
    public class BoardPosition
    {
        public float x;
        public float y;
        public float rotation;
    }

    [Serializable]
    public class PlayerInfo
    {
        public string id;
        public string username;
        public string avatarUrl;
        public int tilesCount;
        public int score;
    }

    [Serializable]
    public class RoomResponse
    {
        public string roomId;
        public string name;
        public bool isPrivate;
        public string gameMode;
        public int maxPlayers;
    }

    [Serializable]
    public class JoinRoomResponse
    {
        public string roomId;
        public string name;
        public List<PlayerInfo> players;
    }

    [Serializable]
    public class GameUpdate
    {
        public string updateType;
        public object data;
    }

    [Serializable]
    public class GameStartData
    {
        public List<DominoTile> hand;
        public List<DominoTile> board;
        public List<PlayerInfo> players;
        public string currentPlayerId;
    }

    [Serializable]
    public class TurnUpdateData
    {
        public string currentPlayerId;
    }

    [Serializable]
    public class HandUpdateData
    {
        public List<DominoTile> hand;
    }

    [Serializable]
    public class BoardUpdateData
    {
        public List<DominoTile> board;
    }

    [Serializable]
    public class PlayerUpdateData
    {
        public List<PlayerInfo> players;
    }

    [Serializable]
    public class GameEndData
    {
        public string winnerId;
        public List<PlayerInfo> players;
        public Dictionary<string, int> rewards;
    }

    [Serializable]
    public class GameResult
    {
        public string winnerId;
        public List<PlayerInfo> players;
        public Dictionary<string, int> rewards;
    }

    #endregion
}