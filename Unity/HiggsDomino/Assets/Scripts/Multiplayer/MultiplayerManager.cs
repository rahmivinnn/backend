using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using HiggsDomino.Game;
using HiggsDomino.Network;

namespace HiggsDomino.Multiplayer
{
    /// <summary>
    /// Manages multiplayer game sessions, coordinating between WebSocket and direct Unity networking
    /// </summary>
    public class MultiplayerManager : MonoBehaviour
    {
        #region Singleton
        private static MultiplayerManager _instance;
        public static MultiplayerManager Instance
        {
            get
            {
                if (_instance == null)
                {
                    _instance = FindObjectOfType<MultiplayerManager>();
                    if (_instance == null)
                    {
                        GameObject go = new GameObject("MultiplayerManager");
                        _instance = go.AddComponent<MultiplayerManager>();
                        DontDestroyOnLoad(go);
                    }
                }
                return _instance;
            }
        }
        #endregion

        #region References
        [SerializeField] private GameManager gameManager;
        private MultiplayerConnection multiplayerConnection;
        private WebSocketConnection webSocketConnection;
        #endregion

        #region Properties
        public bool IsConnected => multiplayerConnection != null && multiplayerConnection.IsConnected;
        public bool IsHost => multiplayerConnection != null && multiplayerConnection.IsHost;
        public string LocalPlayerId => multiplayerConnection != null ? multiplayerConnection.LocalPlayerId : string.Empty;
        public Dictionary<string, PlayerInfo> ConnectedPlayers => multiplayerConnection != null ? multiplayerConnection.ConnectedPlayers : new Dictionary<string, PlayerInfo>();
        public GameRoom CurrentRoom { get; private set; }
        #endregion

        #region Events
        public event Action<bool> OnConnectionStatusChanged;
        public event Action<string> OnConnectionError;
        public event Action<string> OnPlayerJoined;
        public event Action<string> OnPlayerLeft;
        public event Action<string, bool> OnPlayerReadyChanged;
        public event Action OnGameStarted;
        public event Action OnGameEnded;
        public event Action<string, DominoTile> OnTilePlayed;
        public event Action<string> OnTurnChanged;
        public event Action<string, int> OnTileDrawn;
        public event Action<string> OnTurnSkipped;
        public event Action<string, string> OnChatMessageReceived;
        #endregion

        #region Unity Lifecycle
        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }

            _instance = this;
            DontDestroyOnLoad(gameObject);

            // Get references
            if (gameManager == null)
                gameManager = GameManager.Instance;

            multiplayerConnection = MultiplayerConnection.Instance;
            webSocketConnection = WebSocketConnection.Instance;

            // Subscribe to events
            SubscribeToEvents();
        }

        private void OnDestroy()
        {
            UnsubscribeFromEvents();
        }
        #endregion

        #region Event Subscription
        private void SubscribeToEvents()
        {
            if (multiplayerConnection != null)
            {
                multiplayerConnection.OnConnectionStatusChanged += HandleConnectionStatusChanged;
                multiplayerConnection.OnConnectionError += HandleConnectionError;
                multiplayerConnection.OnPlayerJoined += HandlePlayerJoined;
                multiplayerConnection.OnPlayerLeft += HandlePlayerLeft;
                multiplayerConnection.OnDataReceived += HandleDataReceived;
            }

            if (webSocketConnection != null)
            {
                webSocketConnection.OnOpen += HandleWebSocketOpen;
                webSocketConnection.OnClose += HandleWebSocketClose;
                webSocketConnection.OnError += HandleWebSocketError;
                webSocketConnection.OnMessage += HandleWebSocketMessage;
            }
        }

        private void UnsubscribeFromEvents()
        {
            if (multiplayerConnection != null)
            {
                multiplayerConnection.OnConnectionStatusChanged -= HandleConnectionStatusChanged;
                multiplayerConnection.OnConnectionError -= HandleConnectionError;
                multiplayerConnection.OnPlayerJoined -= HandlePlayerJoined;
                multiplayerConnection.OnPlayerLeft -= HandlePlayerLeft;
                multiplayerConnection.OnDataReceived -= HandleDataReceived;
            }

            if (webSocketConnection != null)
            {
                webSocketConnection.OnOpen -= HandleWebSocketOpen;
                webSocketConnection.OnClose -= HandleWebSocketClose;
                webSocketConnection.OnError -= HandleWebSocketError;
                webSocketConnection.OnMessage -= HandleWebSocketMessage;
            }
        }
        #endregion

        #region Room Management
        /// <summary>
        /// Creates and hosts a new game room
        /// </summary>
        /// <param name="roomSettings">Settings for the room</param>
        /// <returns>True if room was created successfully</returns>
        public bool CreateRoom(GameRoom.RoomSettings roomSettings)
        {
            try
            {
                // Create room on server via API
                string roomId = Guid.NewGuid().ToString(); // This would come from the server in a real implementation
                
                // Create local room object
                CurrentRoom = new GameRoom
                {
                    Id = roomId,
                    Name = roomSettings.RoomName,
                    HostId = PlayerPrefsManager.GetUserId(),
                    GameType = roomSettings.GameType,
                    MaxPlayers = roomSettings.MaxPlayers,
                    Rounds = roomSettings.Rounds,
                    EntryFee = roomSettings.EntryFee,
                    IsPrivate = roomSettings.IsPrivate,
                    Password = roomSettings.Password,
                    CreatedAt = DateTime.Now,
                    Settings = roomSettings
                };
                
                // Host game using MultiplayerConnection
                bool success = multiplayerConnection.HostGame(roomSettings);
                if (!success)
                {
                    CurrentRoom = null;
                    return false;
                }
                
                // Connect to WebSocket for real-time updates
                string wsUrl = $"wss://api.higgsdomino.com/v1/ws/room/{roomId}?token={NetworkManager.Instance.AuthToken}";
                webSocketConnection.Connect(wsUrl);
                
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error creating room: {ex.Message}");
                HandleConnectionError($"Failed to create room: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Joins an existing game room
        /// </summary>
        /// <param name="roomId">ID of the room to join</param>
        /// <param name="password">Password for private rooms</param>
        /// <returns>True if room was joined successfully</returns>
        public bool JoinRoom(string roomId, string password = "")
        {
            try
            {
                // Join room on server via API
                // This would be a real API call in a production implementation
                
                // Create local room object (this would come from the server in a real implementation)
                CurrentRoom = new GameRoom
                {
                    Id = roomId,
                    Name = "Sample Room",
                    HostId = "host_user_id",
                    GameType = GameType.Classic,
                    MaxPlayers = 4,
                    Rounds = 3,
                    EntryFee = 100,
                    IsPrivate = !string.IsNullOrEmpty(password),
                    Password = password,
                    CreatedAt = DateTime.Now
                };
                
                // Join game using MultiplayerConnection
                bool success = multiplayerConnection.JoinGame(roomId);
                if (!success)
                {
                    CurrentRoom = null;
                    return false;
                }
                
                // Connect to WebSocket for real-time updates
                string wsUrl = $"wss://api.higgsdomino.com/v1/ws/room/{roomId}?token={NetworkManager.Instance.AuthToken}";
                webSocketConnection.Connect(wsUrl);
                
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error joining room: {ex.Message}");
                HandleConnectionError($"Failed to join room: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Leaves the current game room
        /// </summary>
        public void LeaveRoom()
        {
            if (CurrentRoom == null)
                return;

            try
            {
                // Leave room on server via API
                // This would be a real API call in a production implementation
                
                // Disconnect from multiplayer
                multiplayerConnection.Disconnect();
                
                // Disconnect from WebSocket
                webSocketConnection.Disconnect();
                
                // Clear local room data
                CurrentRoom = null;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error leaving room: {ex.Message}");
            }
        }

        /// <summary>
        /// Sets the ready status of the local player
        /// </summary>
        /// <param name="isReady">Whether the player is ready</param>
        public void SetReady(bool isReady)
        {
            if (CurrentRoom == null || !IsConnected)
                return;

            try
            {
                // Set ready status on server via API or WebSocket
                // This would be a real API call in a production implementation
                
                // Set ready status locally
                multiplayerConnection.SetReady(isReady);
                
                // Send ready status via WebSocket
                string message = JsonUtility.ToJson(new { type = "player_ready", data = new { ready = isReady } });
                webSocketConnection.SendMessage(message);
                
                // Notify listeners
                OnPlayerReadyChanged?.Invoke(LocalPlayerId, isReady);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error setting ready status: {ex.Message}");
            }
        }

        /// <summary>
        /// Starts the game (host only)
        /// </summary>
        /// <returns>True if game was started successfully</returns>
        public bool StartGame()
        {
            if (CurrentRoom == null || !IsConnected || !IsHost)
                return false;

            try
            {
                // Start game on server via API or WebSocket
                // This would be a real API call in a production implementation
                
                // Send start game message via WebSocket
                string message = JsonUtility.ToJson(new { type = "start_game" });
                webSocketConnection.SendMessage(message);
                
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error starting game: {ex.Message}");
                return false;
            }
        }
        #endregion

        #region Gameplay Methods
        /// <summary>
        /// Plays a domino tile
        /// </summary>
        /// <param name="tile">The tile to play</param>
        /// <param name="position">Position to play the tile ("first", "left", "right", etc.)</param>
        /// <returns>True if tile was played successfully</returns>
        public bool PlayTile(DominoTile tile, string position)
        {
            if (CurrentRoom == null || !IsConnected)
                return false;

            try
            {
                // Send play tile message via WebSocket
                string message = JsonUtility.ToJson(new { 
                    type = "play_tile", 
                    data = new { 
                        tile_id = tile.Id,
                        value1 = tile.Value1,
                        value2 = tile.Value2,
                        position = position
                    } 
                });
                webSocketConnection.SendMessage(message);
                
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error playing tile: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Draws a tile from the deck
        /// </summary>
        /// <returns>True if tile was drawn successfully</returns>
        public bool DrawTile()
        {
            if (CurrentRoom == null || !IsConnected)
                return false;

            try
            {
                // Send draw tile message via WebSocket
                string message = JsonUtility.ToJson(new { type = "draw_tile" });
                webSocketConnection.SendMessage(message);
                
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error drawing tile: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Skips the current player's turn
        /// </summary>
        /// <returns>True if turn was skipped successfully</returns>
        public bool SkipTurn()
        {
            if (CurrentRoom == null || !IsConnected)
                return false;

            try
            {
                // Send skip turn message via WebSocket
                string message = JsonUtility.ToJson(new { type = "skip_turn" });
                webSocketConnection.SendMessage(message);
                
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error skipping turn: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Sends a chat message to all players in the room
        /// </summary>
        /// <param name="text">The message text</param>
        /// <returns>True if message was sent successfully</returns>
        public bool SendChatMessage(string text)
        {
            if (CurrentRoom == null || !IsConnected || string.IsNullOrEmpty(text))
                return false;

            try
            {
                // Send chat message via WebSocket
                string message = JsonUtility.ToJson(new { 
                    type = "chat_message", 
                    data = new { 
                        text = text
                    } 
                });
                webSocketConnection.SendMessage(message);
                
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error sending chat message: {ex.Message}");
                return false;
            }
        }
        #endregion

        #region Event Handlers
        private void HandleConnectionStatusChanged(bool isConnected)
        {
            OnConnectionStatusChanged?.Invoke(isConnected);
        }

        private void HandleConnectionError(string errorMessage)
        {
            OnConnectionError?.Invoke(errorMessage);
        }

        private void HandlePlayerJoined(string playerId)
        {
            OnPlayerJoined?.Invoke(playerId);
        }

        private void HandlePlayerLeft(string playerId)
        {
            OnPlayerLeft?.Invoke(playerId);
        }

        private void HandleDataReceived(string senderId, byte[] data)
        {
            // Process data received from direct Unity networking
            // This would be implemented based on the specific data format used
        }

        private void HandleWebSocketOpen()
        {
            Debug.Log("WebSocket connection opened");
        }

        private void HandleWebSocketClose(int code, string reason)
        {
            Debug.Log($"WebSocket connection closed: {code} - {reason}");
        }

        private void HandleWebSocketError(string errorMessage)
        {
            Debug.LogError($"WebSocket error: {errorMessage}");
            OnConnectionError?.Invoke($"WebSocket error: {errorMessage}");
        }

        private void HandleWebSocketMessage(string message)
        {
            try
            {
                // Parse message as JSON
                WebSocketMessage wsMessage = JsonUtility.FromJson<WebSocketMessage>(message);
                
                // Process message based on type
                switch (wsMessage.type)
                {
                    case "player_joined":
                        HandlePlayerJoinedMessage(wsMessage.data);
                        break;
                    case "player_left":
                        HandlePlayerLeftMessage(wsMessage.data);
                        break;
                    case "player_ready":
                        HandlePlayerReadyMessage(wsMessage.data);
                        break;
                    case "game_started":
                        HandleGameStartedMessage(wsMessage.data);
                        break;
                    case "game_ended":
                        HandleGameEndedMessage(wsMessage.data);
                        break;
                    case "tile_played":
                        HandleTilePlayedMessage(wsMessage.data);
                        break;
                    case "turn_changed":
                        HandleTurnChangedMessage(wsMessage.data);
                        break;
                    case "tile_drawn":
                        HandleTileDrawnMessage(wsMessage.data);
                        break;
                    case "turn_skipped":
                        HandleTurnSkippedMessage(wsMessage.data);
                        break;
                    case "chat_message":
                        HandleChatMessageReceived(wsMessage.data);
                        break;
                    case "error":
                        HandleErrorMessage(wsMessage.data);
                        break;
                    default:
                        Debug.LogWarning($"Unknown message type: {wsMessage.type}");
                        break;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error processing WebSocket message: {ex.Message}");
            }
        }

        private void HandlePlayerJoinedMessage(string data)
        {
            try
            {
                PlayerJoinedData playerData = JsonUtility.FromJson<PlayerJoinedData>(data);
                
                // Add player to connected players if not already present
                if (!ConnectedPlayers.ContainsKey(playerData.player_id))
                {
                    PlayerInfo playerInfo = new PlayerInfo
                    {
                        Id = playerData.player_id,
                        Username = playerData.username,
                        IsReady = false
                    };
                    
                    // This would be handled by MultiplayerConnection in a real implementation
                    // For now, we'll add the player directly
                    ConnectedPlayers.Add(playerData.player_id, playerInfo);
                }
                
                OnPlayerJoined?.Invoke(playerData.player_id);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling player joined message: {ex.Message}");
            }
        }

        private void HandlePlayerLeftMessage(string data)
        {
            try
            {
                PlayerLeftData playerData = JsonUtility.FromJson<PlayerLeftData>(data);
                OnPlayerLeft?.Invoke(playerData.player_id);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling player left message: {ex.Message}");
            }
        }

        private void HandlePlayerReadyMessage(string data)
        {
            try
            {
                PlayerReadyData readyData = JsonUtility.FromJson<PlayerReadyData>(data);
                OnPlayerReadyChanged?.Invoke(readyData.player_id, readyData.ready);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling player ready message: {ex.Message}");
            }
        }

        private void HandleGameStartedMessage(string data)
        {
            try
            {
                // Parse game started data if needed
                // GameStartedData gameData = JsonUtility.FromJson<GameStartedData>(data);
                
                // Notify game manager
                if (gameManager != null)
                    gameManager.StartGame(CurrentRoom);
                
                OnGameStarted?.Invoke();
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling game started message: {ex.Message}");
            }
        }

        private void HandleGameEndedMessage(string data)
        {
            try
            {
                GameEndedData gameData = JsonUtility.FromJson<GameEndedData>(data);
                
                // Notify game manager
                if (gameManager != null)
                    gameManager.EndGame(gameData.winner_id);
                
                OnGameEnded?.Invoke();
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling game ended message: {ex.Message}");
            }
        }

        private void HandleTilePlayedMessage(string data)
        {
            try
            {
                TilePlayedData tileData = JsonUtility.FromJson<TilePlayedData>(data);
                
                DominoTile tile = new DominoTile
                {
                    Id = tileData.tile_id,
                    Value1 = tileData.value1,
                    Value2 = tileData.value2
                };
                
                // Notify game manager
                if (gameManager != null)
                    gameManager.PlayTile(tileData.player_id, tile, tileData.position);
                
                OnTilePlayed?.Invoke(tileData.player_id, tile);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling tile played message: {ex.Message}");
            }
        }

        private void HandleTurnChangedMessage(string data)
        {
            try
            {
                TurnChangedData turnData = JsonUtility.FromJson<TurnChangedData>(data);
                
                // Notify game manager
                if (gameManager != null)
                    gameManager.SetCurrentTurn(turnData.player_id);
                
                OnTurnChanged?.Invoke(turnData.player_id);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling turn changed message: {ex.Message}");
            }
        }

        private void HandleTileDrawnMessage(string data)
        {
            try
            {
                TileDrawnData drawData = JsonUtility.FromJson<TileDrawnData>(data);
                
                // Notify game manager
                if (gameManager != null)
                    gameManager.DrawTile(drawData.player_id, drawData.count);
                
                OnTileDrawn?.Invoke(drawData.player_id, drawData.count);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling tile drawn message: {ex.Message}");
            }
        }

        private void HandleTurnSkippedMessage(string data)
        {
            try
            {
                TurnSkippedData skipData = JsonUtility.FromJson<TurnSkippedData>(data);
                
                // Notify game manager
                if (gameManager != null)
                    gameManager.SkipTurn(skipData.player_id);
                
                OnTurnSkipped?.Invoke(skipData.player_id);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling turn skipped message: {ex.Message}");
            }
        }

        private void HandleChatMessageReceived(string data)
        {
            try
            {
                ChatMessageData chatData = JsonUtility.FromJson<ChatMessageData>(data);
                OnChatMessageReceived?.Invoke(chatData.player_id, chatData.text);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling chat message: {ex.Message}");
            }
        }

        private void HandleErrorMessage(string data)
        {
            try
            {
                ErrorData errorData = JsonUtility.FromJson<ErrorData>(data);
                OnConnectionError?.Invoke(errorData.message);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling error message: {ex.Message}");
            }
        }
        #endregion

        #region WebSocket Message Classes
        [Serializable]
        private class WebSocketMessage
        {
            public string type;
            public string data;
        }

        [Serializable]
        private class PlayerJoinedData
        {
            public string player_id;
            public string username;
        }

        [Serializable]
        private class PlayerLeftData
        {
            public string player_id;
        }

        [Serializable]
        private class PlayerReadyData
        {
            public string player_id;
            public bool ready;
        }

        [Serializable]
        private class GameEndedData
        {
            public string winner_id;
        }

        [Serializable]
        private class TilePlayedData
        {
            public string player_id;
            public string tile_id;
            public int value1;
            public int value2;
            public string position;
        }

        [Serializable]
        private class TurnChangedData
        {
            public string player_id;
        }

        [Serializable]
        private class TileDrawnData
        {
            public string player_id;
            public int count;
        }

        [Serializable]
        private class TurnSkippedData
        {
            public string player_id;
        }

        [Serializable]
        private class ChatMessageData
        {
            public string player_id;
            public string text;
        }

        [Serializable]
        private class ErrorData
        {
            public string message;
            public int code;
        }
        #endregion
    }
}