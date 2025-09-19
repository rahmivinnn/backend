using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json;
using Unity.Netcode;
using SocketIOClient;

namespace GameBackend
{
    // ============================================================================
    // API CLIENT CORE
    // ============================================================================
    
    [System.Serializable]
    public class ApiResponse<T>
    {
        public bool success;
        public T data;
        public string message;
        public string timestamp;
        public string request_id;
        public ApiError error;
    }
    
    [System.Serializable]
    public class ApiError
    {
        public string code;
        public string message;
        public Dictionary<string, object> details;
    }
    
    public class GameApiClient : MonoBehaviour
    {
        [Header("API Configuration")]
        public string baseUrl = "https://api.yourgame.com/v1";
        public int timeoutSeconds = 30;
        
        private string authToken;
        private Dictionary<string, string> defaultHeaders;
        
        public static GameApiClient Instance { get; private set; }
        
        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);
                InitializeClient();
            }
            else
            {
                Destroy(gameObject);
            }
        }
        
        private void InitializeClient()
        {
            defaultHeaders = new Dictionary<string, string>
            {
                { "Content-Type", "application/json" },
                { "Accept", "application/json" },
                { "User-Agent", $"GameClient-Unity/{Application.version}" }
            };
        }
        
        public void SetAuthToken(string token)
        {
            authToken = token;
            PlayerPrefs.SetString("auth_token", token);
        }
        
        public void ClearAuthToken()
        {
            authToken = null;
            PlayerPrefs.DeleteKey("auth_token");
        }
        
        private UnityWebRequest CreateRequest(string endpoint, string method = "GET", object data = null)
        {
            string url = $"{baseUrl}{endpoint}";
            UnityWebRequest request;
            
            if (method == "GET")
            {
                request = UnityWebRequest.Get(url);
            }
            else
            {
                request = new UnityWebRequest(url, method);
                
                if (data != null)
                {
                    string jsonData = JsonConvert.SerializeObject(data);
                    byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonData);
                    request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                }
                
                request.downloadHandler = new DownloadHandlerBuffer();
            }
            
            // Add headers
            foreach (var header in defaultHeaders)
            {
                request.SetRequestHeader(header.Key, header.Value);
            }
            
            // Add auth token if available
            if (!string.IsNullOrEmpty(authToken))
            {
                request.SetRequestHeader("Authorization", $"Bearer {authToken}");
            }
            
            request.timeout = timeoutSeconds;
            return request;
        }
        
        public IEnumerator SendRequest<T>(string endpoint, string method = "GET", object data = null, System.Action<ApiResponse<T>> callback = null)
        {
            using (UnityWebRequest request = CreateRequest(endpoint, method, data))
            {
                yield return request.SendWebRequest();
                
                ApiResponse<T> response = new ApiResponse<T>();
                
                if (request.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        string responseText = request.downloadHandler.text;
                        response = JsonConvert.DeserializeObject<ApiResponse<T>>(responseText);
                    }
                    catch (Exception e)
                    {
                        Debug.LogError($"Failed to parse API response: {e.Message}");
                        response.success = false;
                        response.error = new ApiError
                        {
                            code = "PARSE_ERROR",
                            message = "Failed to parse server response"
                        };
                    }
                }
                else
                {
                    Debug.LogError($"API Request failed: {request.error}");
                    response.success = false;
                    response.error = new ApiError
                    {
                        code = "NETWORK_ERROR",
                        message = request.error
                    };
                }
                
                callback?.Invoke(response);
            }
        }
    }
    
    // ============================================================================
    // DATA MODELS
    // ============================================================================
    
    [System.Serializable]
    public class UserProfile
    {
        public int user_id;
        public string display_name;
        public string email;
        public int level;
        public int experience;
        public string avatar_url;
        public string country;
        public DateTime registration_date;
        public DateTime last_login_at;
        public bool is_premium;
        public UserStats stats;
    }
    
    [System.Serializable]
    public class UserStats
    {
        public int total_games;
        public int games_won;
        public float win_rate;
        public int highest_score;
        public float total_playtime_hours;
    }
    
    [System.Serializable]
    public class GameRoom
    {
        public string room_id;
        public string room_name;
        public string room_type;
        public int min_bet;
        public int max_bet;
        public int current_players;
        public int max_players;
        public string status;
        public DateTime created_at;
    }
    
    [System.Serializable]
    public class WalletBalance
    {
        public string currency_type;
        public long balance;
        public DateTime last_updated;
    }
    
    [System.Serializable]
    public class WalletInfo
    {
        public List<WalletBalance> balances;
        public long total_earned;
        public long total_spent;
    }
    
    [System.Serializable]
    public class GameMove
    {
        public string move_type;
        public Dictionary<string, object> move_data;
    }
    
    [System.Serializable]
    public class ChatMessage
    {
        public string message_id;
        public string channel_id;
        public int sender_user_id;
        public string sender_name;
        public string content;
        public string message_type;
        public DateTime sent_at;
    }
    
    // ============================================================================
    // AUTHENTICATION MANAGER
    // ============================================================================
    
    public class AuthManager : MonoBehaviour
    {
        [Header("Events")]
        public UnityEngine.Events.UnityEvent<UserProfile> OnLoginSuccess;
        public UnityEngine.Events.UnityEvent<string> OnLoginFailed;
        public UnityEngine.Events.UnityEvent OnLogout;
        
        private UserProfile currentUser;
        public UserProfile CurrentUser => currentUser;
        public bool IsLoggedIn => currentUser != null && !string.IsNullOrEmpty(GameApiClient.Instance.authToken);
        
        private void Start()
        {
            // Try to restore session from saved token
            string savedToken = PlayerPrefs.GetString("auth_token", "");
            if (!string.IsNullOrEmpty(savedToken))
            {
                GameApiClient.Instance.SetAuthToken(savedToken);
                StartCoroutine(ValidateToken());
            }
        }
        
        public void LoginWithEmail(string email, string password)
        {
            var loginData = new
            {
                email = email,
                password = password,
                device_id = SystemInfo.deviceUniqueIdentifier
            };
            
            StartCoroutine(GameApiClient.Instance.SendRequest<LoginResponse>(
                "/auth/login", "POST", loginData, OnLoginResponse));
        }
        
        public void LoginAsGuest()
        {
            var guestData = new
            {
                device_id = SystemInfo.deviceUniqueIdentifier,
                device_info = new
                {
                    platform = Application.platform.ToString(),
                    version = Application.version,
                    model = SystemInfo.deviceModel
                }
            };
            
            StartCoroutine(GameApiClient.Instance.SendRequest<LoginResponse>(
                "/auth/guest-login", "POST", guestData, OnLoginResponse));
        }
        
        public void Register(string email, string password, string displayName, string referralCode = null)
        {
            var registerData = new
            {
                email = email,
                password = password,
                display_name = displayName,
                device_id = SystemInfo.deviceUniqueIdentifier,
                referral_code = referralCode
            };
            
            StartCoroutine(GameApiClient.Instance.SendRequest<LoginResponse>(
                "/auth/register", "POST", registerData, OnLoginResponse));
        }
        
        public void Logout()
        {
            StartCoroutine(GameApiClient.Instance.SendRequest<object>(
                "/auth/logout", "POST", null, (response) =>
                {
                    GameApiClient.Instance.ClearAuthToken();
                    currentUser = null;
                    OnLogout?.Invoke();
                }));
        }
        
        private IEnumerator ValidateToken()
        {
            yield return StartCoroutine(GameApiClient.Instance.SendRequest<UserProfile>(
                "/users/profile", "GET", null, (response) =>
                {
                    if (response.success)
                    {
                        currentUser = response.data;
                        OnLoginSuccess?.Invoke(currentUser);
                    }
                    else
                    {
                        GameApiClient.Instance.ClearAuthToken();
                        OnLoginFailed?.Invoke("Session expired");
                    }
                }));
        }
        
        private void OnLoginResponse(ApiResponse<LoginResponse> response)
        {
            if (response.success)
            {
                GameApiClient.Instance.SetAuthToken(response.data.tokens.access_token);
                currentUser = response.data.user;
                OnLoginSuccess?.Invoke(currentUser);
            }
            else
            {
                OnLoginFailed?.Invoke(response.error?.message ?? "Login failed");
            }
        }
        
        [System.Serializable]
        private class LoginResponse
        {
            public UserProfile user;
            public TokenInfo tokens;
        }
        
        [System.Serializable]
        private class TokenInfo
        {
            public string access_token;
            public string refresh_token;
            public int expires_in;
        }
    }
    
    // ============================================================================
    // GAME SESSION MANAGER
    // ============================================================================
    
    public class GameSessionManager : MonoBehaviour
    {
        [Header("Events")]
        public UnityEngine.Events.UnityEvent<GameRoom> OnRoomJoined;
        public UnityEngine.Events.UnityEvent OnRoomLeft;
        public UnityEngine.Events.UnityEvent<string> OnGameStarted;
        public UnityEngine.Events.UnityEvent<Dictionary<string, object>> OnGameStateUpdated;
        
        private GameRoom currentRoom;
        private string currentSessionId;
        
        public GameRoom CurrentRoom => currentRoom;
        public string CurrentSessionId => currentSessionId;
        public bool IsInRoom => currentRoom != null;
        public bool IsInGame => !string.IsNullOrEmpty(currentSessionId);
        
        public void GetAvailableRooms(string roomType = null, int minBet = 0, int maxBet = 0)
        {
            string endpoint = "/rooms";
            var queryParams = new List<string>();
            
            if (!string.IsNullOrEmpty(roomType)) queryParams.Add($"room_type={roomType}");
            if (minBet > 0) queryParams.Add($"min_bet={minBet}");
            if (maxBet > 0) queryParams.Add($"max_bet={maxBet}");
            
            if (queryParams.Count > 0)
            {
                endpoint += "?" + string.Join("&", queryParams);
            }
            
            StartCoroutine(GameApiClient.Instance.SendRequest<RoomsResponse>(
                endpoint, "GET", null, OnRoomsReceived));
        }
        
        public void CreateRoom(string roomName, string roomType, int minBet, int maxBet, int maxPlayers, bool isPrivate = false, string password = null)
        {
            var roomData = new
            {
                room_name = roomName,
                room_type = roomType,
                min_bet = minBet,
                max_bet = maxBet,
                max_players = maxPlayers,
                is_private = isPrivate,
                password = password
            };
            
            StartCoroutine(GameApiClient.Instance.SendRequest<GameRoom>(
                "/rooms", "POST", roomData, OnRoomCreated));
        }
        
        public void JoinRoom(string roomId, string password = null)
        {
            var joinData = new { password = password };
            
            StartCoroutine(GameApiClient.Instance.SendRequest<GameRoom>(
                $"/rooms/{roomId}/join", "POST", joinData, OnRoomJoinResponse));
        }
        
        public void LeaveRoom()
        {
            if (currentRoom == null) return;
            
            StartCoroutine(GameApiClient.Instance.SendRequest<object>(
                $"/rooms/{currentRoom.room_id}/leave", "POST", null, OnRoomLeaveResponse));
        }
        
        public void StartGame(int betAmount)
        {
            if (currentRoom == null) return;
            
            var gameData = new
            {
                room_id = currentRoom.room_id,
                bet_amount = betAmount
            };
            
            StartCoroutine(GameApiClient.Instance.SendRequest<GameStartResponse>(
                "/games/start", "POST", gameData, OnGameStartResponse));
        }
        
        public void MakeMove(string moveType, Dictionary<string, object> moveData)
        {
            if (string.IsNullOrEmpty(currentSessionId)) return;
            
            var move = new
            {
                move_type = moveType,
                move_data = moveData
            };
            
            StartCoroutine(GameApiClient.Instance.SendRequest<object>(
                $"/games/{currentSessionId}/move", "POST", move, OnMoveResponse));
        }
        
        private void OnRoomsReceived(ApiResponse<RoomsResponse> response)
        {
            if (response.success)
            {
                // Handle rooms list - you can create UI events here
                Debug.Log($"Received {response.data.rooms.Count} rooms");
            }
        }
        
        private void OnRoomCreated(ApiResponse<GameRoom> response)
        {
            if (response.success)
            {
                currentRoom = response.data;
                OnRoomJoined?.Invoke(currentRoom);
            }
        }
        
        private void OnRoomJoinResponse(ApiResponse<GameRoom> response)
        {
            if (response.success)
            {
                currentRoom = response.data;
                OnRoomJoined?.Invoke(currentRoom);
            }
        }
        
        private void OnRoomLeaveResponse(ApiResponse<object> response)
        {
            currentRoom = null;
            currentSessionId = null;
            OnRoomLeft?.Invoke();
        }
        
        private void OnGameStartResponse(ApiResponse<GameStartResponse> response)
        {
            if (response.success)
            {
                currentSessionId = response.data.session_id;
                OnGameStarted?.Invoke(currentSessionId);
            }
        }
        
        private void OnMoveResponse(ApiResponse<object> response)
        {
            if (!response.success)
            {
                Debug.LogError($"Move failed: {response.error?.message}");
            }
        }
        
        [System.Serializable]
        private class RoomsResponse
        {
            public List<GameRoom> rooms;
            public PaginationInfo pagination;
        }
        
        [System.Serializable]
        private class PaginationInfo
        {
            public int page;
            public int limit;
            public int total;
            public int total_pages;
        }
        
        [System.Serializable]
        private class GameStartResponse
        {
            public string session_id;
        }
    }
    
    // ============================================================================
    // WALLET MANAGER
    // ============================================================================
    
    public class WalletManager : MonoBehaviour
    {
        [Header("Events")]
        public UnityEngine.Events.UnityEvent<WalletInfo> OnWalletUpdated;
        public UnityEngine.Events.UnityEvent<string> OnTransactionCompleted;
        public UnityEngine.Events.UnityEvent<string> OnTransactionFailed;
        
        private WalletInfo currentWallet;
        public WalletInfo CurrentWallet => currentWallet;
        
        private void Start()
        {
            // Refresh wallet on start
            RefreshWallet();
        }
        
        public void RefreshWallet()
        {
            StartCoroutine(GameApiClient.Instance.SendRequest<WalletInfo>(
                "/wallet", "GET", null, OnWalletResponse));
        }
        
        public long GetBalance(string currencyType)
        {
            if (currentWallet?.balances == null) return 0;
            
            var balance = currentWallet.balances.Find(b => b.currency_type == currencyType);
            return balance?.balance ?? 0;
        }
        
        public void PurchaseItem(int itemId, int quantity, string currencyType)
        {
            var purchaseData = new
            {
                item_id = itemId,
                quantity = quantity,
                currency_type = currencyType
            };
            
            StartCoroutine(GameApiClient.Instance.SendRequest<object>(
                "/shop/purchase", "POST", purchaseData, OnPurchaseResponse));
        }
        
        public void SendGift(int recipientUserId, string giftType, int amount, string message = "")
        {
            var giftData = new
            {
                recipient_user_id = recipientUserId,
                gift_type = giftType,
                amount = amount,
                message = message
            };
            
            StartCoroutine(GameApiClient.Instance.SendRequest<object>(
                "/gifts/send", "POST", giftData, OnGiftResponse));
        }
        
        private void OnWalletResponse(ApiResponse<WalletInfo> response)
        {
            if (response.success)
            {
                currentWallet = response.data;
                OnWalletUpdated?.Invoke(currentWallet);
            }
        }
        
        private void OnPurchaseResponse(ApiResponse<object> response)
        {
            if (response.success)
            {
                OnTransactionCompleted?.Invoke("Purchase completed successfully");
                RefreshWallet(); // Refresh wallet after purchase
            }
            else
            {
                OnTransactionFailed?.Invoke(response.error?.message ?? "Purchase failed");
            }
        }
        
        private void OnGiftResponse(ApiResponse<object> response)
        {
            if (response.success)
            {
                OnTransactionCompleted?.Invoke("Gift sent successfully");
                RefreshWallet(); // Refresh wallet after sending gift
            }
            else
            {
                OnTransactionFailed?.Invoke(response.error?.message ?? "Failed to send gift");
            }
        }
    }
    
    // ============================================================================
    // WEBSOCKET MANAGER
    // ============================================================================
    
    public class WebSocketManager : MonoBehaviour
    {
        [Header("Configuration")]
        public string socketUrl = "wss://api.yourgame.com";
        
        [Header("Events")]
        public UnityEngine.Events.UnityEvent OnConnected;
        public UnityEngine.Events.UnityEvent OnDisconnected;
        public UnityEngine.Events.UnityEvent<ChatMessage> OnChatMessage;
        public UnityEngine.Events.UnityEvent<Dictionary<string, object>> OnGameUpdate;
        
        private SocketIOUnity socket;
        private bool isConnected = false;
        
        public bool IsConnected => isConnected;
        
        private void Start()
        {
            InitializeSocket();
        }
        
        private void InitializeSocket()
        {
            var uri = new Uri(socketUrl);
            socket = new SocketIOUnity(uri, new SocketIOOptions
            {
                Query = new Dictionary<string, string>
                {
                    {"token", PlayerPrefs.GetString("auth_token", "")}
                },
                EIO = 4,
                Transport = SocketIOClient.Transport.TransportProtocol.WebSocket
            });
            
            SetupEventHandlers();
        }
        
        private void SetupEventHandlers()
        {
            socket.OnConnected += (sender, e) =>
            {
                isConnected = true;
                OnConnected?.Invoke();
                Debug.Log("Socket connected");
            };
            
            socket.OnDisconnected += (sender, e) =>
            {
                isConnected = false;
                OnDisconnected?.Invoke();
                Debug.Log("Socket disconnected");
            };
            
            // Game events
            socket.On("game:move", OnGameMoveReceived);
            socket.On("game:state_update", OnGameStateReceived);
            socket.On("game:player_joined", OnPlayerJoinedReceived);
            socket.On("game:player_left", OnPlayerLeftReceived);
            socket.On("game:ended", OnGameEndedReceived);
            
            // Chat events
            socket.On("chat:message", OnChatMessageReceived);
            socket.On("chat:user_typing", OnUserTypingReceived);
            
            // Social events
            socket.On("friend:request", OnFriendRequestReceived);
            socket.On("friend:accepted", OnFriendAcceptedReceived);
            socket.On("friend:online", OnFriendOnlineReceived);
            
            // Notification events
            socket.On("notification:new", OnNotificationReceived);
        }
        
        public void Connect()
        {
            if (socket != null && !isConnected)
            {
                socket.Connect();
            }
        }
        
        public void Disconnect()
        {
            if (socket != null && isConnected)
            {
                socket.Disconnect();
            }
        }
        
        public void JoinRoom(string roomId)
        {
            if (isConnected)
            {
                socket.Emit("room:join", roomId);
            }
        }
        
        public void LeaveRoom(string roomId)
        {
            if (isConnected)
            {
                socket.Emit("room:leave", roomId);
            }
        }
        
        public void SendChatMessage(string channelId, string content)
        {
            if (isConnected)
            {
                var messageData = new
                {
                    channel_id = channelId,
                    content = content,
                    message_type = "text"
                };
                socket.Emit("chat:send", JsonConvert.SerializeObject(messageData));
            }
        }
        
        // Event handlers
        private void OnGameMoveReceived(SocketIOResponse response)
        {
            var moveData = JsonConvert.DeserializeObject<Dictionary<string, object>>(response.ToString());
            OnGameUpdate?.Invoke(moveData);
        }
        
        private void OnGameStateReceived(SocketIOResponse response)
        {
            var stateData = JsonConvert.DeserializeObject<Dictionary<string, object>>(response.ToString());
            OnGameUpdate?.Invoke(stateData);
        }
        
        private void OnPlayerJoinedReceived(SocketIOResponse response)
        {
            Debug.Log("Player joined: " + response.ToString());
        }
        
        private void OnPlayerLeftReceived(SocketIOResponse response)
        {
            Debug.Log("Player left: " + response.ToString());
        }
        
        private void OnGameEndedReceived(SocketIOResponse response)
        {
            Debug.Log("Game ended: " + response.ToString());
        }
        
        private void OnChatMessageReceived(SocketIOResponse response)
        {
            try
            {
                var message = JsonConvert.DeserializeObject<ChatMessage>(response.ToString());
                OnChatMessage?.Invoke(message);
            }
            catch (Exception e)
            {
                Debug.LogError($"Failed to parse chat message: {e.Message}");
            }
        }
        
        private void OnUserTypingReceived(SocketIOResponse response)
        {
            Debug.Log("User typing: " + response.ToString());
        }
        
        private void OnFriendRequestReceived(SocketIOResponse response)
        {
            Debug.Log("Friend request: " + response.ToString());
        }
        
        private void OnFriendAcceptedReceived(SocketIOResponse response)
        {
            Debug.Log("Friend accepted: " + response.ToString());
        }
        
        private void OnFriendOnlineReceived(SocketIOResponse response)
        {
            Debug.Log("Friend online: " + response.ToString());
        }
        
        private void OnNotificationReceived(SocketIOResponse response)
        {
            Debug.Log("New notification: " + response.ToString());
        }
        
        private void OnDestroy()
        {
            if (socket != null)
            {
                socket.Disconnect();
                socket.Dispose();
            }
        }
    }
    
    // ============================================================================
    // LOCAL DATABASE MANAGER (SQLite)
    // ============================================================================
    
    public class LocalDatabaseManager : MonoBehaviour
    {
        private string dbPath;
        
        private void Awake()
        {
            dbPath = System.IO.Path.Combine(Application.persistentDataPath, "game_local.db");
            InitializeDatabase();
        }
        
        private void InitializeDatabase()
        {
            // Initialize SQLite database for offline data
            // This would require SQLite for Unity package
            
            string createTables = @"
                CREATE TABLE IF NOT EXISTS cached_user_data (
                    user_id INTEGER PRIMARY KEY,
                    display_name TEXT,
                    level INTEGER,
                    experience INTEGER,
                    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS offline_actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action_type TEXT NOT NULL,
                    action_data TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    synced BOOLEAN DEFAULT FALSE
                );
                
                CREATE TABLE IF NOT EXISTS game_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            ";
            
            // Execute SQL commands here using SQLite library
            Debug.Log("Local database initialized");
        }
        
        public void CacheUserData(UserProfile user)
        {
            // Cache user data for offline access
            Debug.Log($"Caching user data for {user.display_name}");
        }
        
        public void SaveOfflineAction(string actionType, object actionData)
        {
            // Save actions performed while offline for later sync
            string jsonData = JsonConvert.SerializeObject(actionData);
            Debug.Log($"Saved offline action: {actionType}");
        }
        
        public void SyncOfflineActions()
        {
            // Sync offline actions with server when connection is restored
            Debug.Log("Syncing offline actions with server");
        }
        
        public void SaveSetting(string key, string value)
        {
            PlayerPrefs.SetString($"setting_{key}", value);
        }
        
        public string GetSetting(string key, string defaultValue = "")
        {
            return PlayerPrefs.GetString($"setting_{key}", defaultValue);
        }
    }
    
    // ============================================================================
    // GAME MANAGER (Main Controller)
    // ============================================================================
    
    public class GameManager : MonoBehaviour
    {
        [Header("Managers")]
        public AuthManager authManager;
        public GameSessionManager sessionManager;
        public WalletManager walletManager;
        public WebSocketManager webSocketManager;
        public LocalDatabaseManager localDbManager;
        
        [Header("Game State")]
        public bool isOnline = true;
        
        public static GameManager Instance { get; private set; }
        
        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);
            }
            else
            {
                Destroy(gameObject);
            }
        }
        
        private void Start()
        {
            // Initialize game systems
            StartCoroutine(CheckInternetConnection());
            
            // Setup event listeners
            authManager.OnLoginSuccess.AddListener(OnUserLoggedIn);
            authManager.OnLogout.AddListener(OnUserLoggedOut);
        }
        
        private void OnUserLoggedIn(UserProfile user)
        {
            Debug.Log($"User logged in: {user.display_name}");
            
            // Cache user data locally
            localDbManager.CacheUserData(user);
            
            // Connect to WebSocket
            webSocketManager.Connect();
            
            // Refresh wallet
            walletManager.RefreshWallet();
            
            // Sync offline actions if any
            localDbManager.SyncOfflineActions();
        }
        
        private void OnUserLoggedOut()
        {
            Debug.Log("User logged out");
            
            // Disconnect WebSocket
            webSocketManager.Disconnect();
        }
        
        private IEnumerator CheckInternetConnection()
        {
            while (true)
            {
                UnityWebRequest request = new UnityWebRequest("https://www.google.com");
                yield return request.SendWebRequest();
                
                bool wasOnline = isOnline;
                isOnline = request.result == UnityWebRequest.Result.Success;
                
                if (wasOnline != isOnline)
                {
                    OnConnectionStatusChanged(isOnline);
                }
                
                yield return new WaitForSeconds(5f); // Check every 5 seconds
            }
        }
        
        private void OnConnectionStatusChanged(bool online)
        {
            Debug.Log($"Connection status changed: {(online ? "Online" : "Offline")}");
            
            if (online)
            {
                // Reconnect WebSocket
                if (authManager.IsLoggedIn)
                {
                    webSocketManager.Connect();
                    localDbManager.SyncOfflineActions();
                }
            }
            else
            {
                // Handle offline mode
                webSocketManager.Disconnect();
            }
        }
        
        public void QuitGame()
        {
            // Cleanup before quitting
            if (authManager.IsLoggedIn)
            {
                authManager.Logout();
            }
            
            webSocketManager.Disconnect();
            
            #if UNITY_EDITOR
                UnityEditor.EditorApplication.isPlaying = false;
            #else
                Application.Quit();
            #endif
        }
    }
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*
// Example: Login and join a game room
public class ExampleUsage : MonoBehaviour
{
    private void Start()
    {
        // Login as guest
        GameManager.Instance.authManager.LoginAsGuest();
        
        // Listen for login success
        GameManager.Instance.authManager.OnLoginSuccess.AddListener(OnLoginSuccess);
    }
    
    private void OnLoginSuccess(UserProfile user)
    {
        Debug.Log($"Welcome {user.display_name}!");
        
        // Get available rooms
        GameManager.Instance.sessionManager.GetAvailableRooms("classic");
        
        // Listen for room events
        GameManager.Instance.sessionManager.OnRoomJoined.AddListener(OnRoomJoined);
    }
    
    private void OnRoomJoined(GameRoom room)
    {
        Debug.Log($"Joined room: {room.room_name}");
        
        // Start a game with 1000 coins bet
        GameManager.Instance.sessionManager.StartGame(1000);
    }
    
    // Example: Make a domino move
    public void PlaceDomino(int dominoId, Vector2Int position, bool horizontal)
    {
        var moveData = new Dictionary<string, object>
        {
            {"domino_id", dominoId},
            {"position", new {x = position.x, y = position.y}},
            {"orientation", horizontal ? "horizontal" : "vertical"}
        };
        
        GameManager.Instance.sessionManager.MakeMove("place_domino", moveData);
    }
    
    // Example: Send a chat message
    public void SendChatMessage(string message)
    {
        GameManager.Instance.webSocketManager.SendChatMessage("general", message);
    }
    
    // Example: Purchase coins
    public void BuyCoins(int packageId)
    {
        GameManager.Instance.walletManager.PurchaseItem(packageId, 1, "USD");
    }
}
*/