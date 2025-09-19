using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace HiggsDomino.Network
{
    /// <summary>
    /// Manages all network communications for the Higgs Domino game
    /// </summary>
    public class NetworkManager : MonoBehaviour
    {
        #region Singleton
        public static NetworkManager Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
            InitializeHttpClient();
        }
        #endregion

        [Header("Server Configuration")]
        [SerializeField] private string apiBaseUrl = "http://localhost:3000/api";
        [SerializeField] private string webSocketUrl = "ws://localhost:3001";
        [SerializeField] private float connectionTimeout = 10f;
        [SerializeField] private int maxRetryAttempts = 3;

        private HttpClient httpClient;
        private string authToken;
        private WebSocketConnection webSocketConnection;

        public bool IsConnected => webSocketConnection != null && webSocketConnection.IsConnected;
        public event Action<bool> OnConnectionStatusChanged;
        public event Action<string> OnErrorOccurred;

        private void InitializeHttpClient()
        {
            httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(connectionTimeout);
            httpClient.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));
        }

        /// <summary>
        /// Authenticates the user with the server
        /// </summary>
        /// <param name="username">User's username</param>
        /// <param name="password">User's password</param>
        /// <returns>True if authentication was successful</returns>
        /// <summary>
        /// Authenticates a user with the server using callback pattern
        /// </summary>
        /// <param name="username">User's username</param>
        /// <param name="password">User's password</param>
        /// <param name="callback">Callback with success status and message</param>
        public void AuthenticateUser(string username, string password, Action<bool, string> callback)
        {
            StartCoroutine(AuthenticateUserCoroutine(username, password, callback));
        }
        
        /// <summary>
        /// Authenticates a user with the server
        /// </summary>
        /// <param name="username">User's username</param>
        /// <param name="password">User's password</param>
        /// <returns>True if authentication was successful</returns>
        public async Task<bool> AuthenticateUser(string username, string password)
        {
            try
            {
                var loginData = new
                {
                    username = username,
                    password = password
                };

                var content = new StringContent(JsonConvert.SerializeObject(loginData), Encoding.UTF8, "application/json");
                var response = await httpClient.PostAsync($"{apiBaseUrl}/auth/login", content);

                if (response.IsSuccessStatusCode)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    var authResponse = JsonConvert.DeserializeObject<AuthResponse>(responseContent);
                    authToken = authResponse.token;
                    currentUserId = authResponse.userId;
                    
                    // Save auth token and user ID to PlayerPrefs
                    PlayerPrefsManager.SaveAuthToken(authToken);
                    PlayerPrefsManager.SaveUserId(currentUserId);

                    // Set the auth token for future requests
                    httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", authToken);
                    
                    // Connect to WebSocket after successful authentication
                    ConnectToWebSocket();
                    return true;
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Debug.LogError($"Authentication failed: {errorContent}");
                    OnErrorOccurred?.Invoke($"Login failed: {response.StatusCode}");
                    return false;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"Authentication error: {ex.Message}");
                OnErrorOccurred?.Invoke($"Connection error: {ex.Message}");
                return false;
            }
        }
        
        /// <summary>
        /// Coroutine for authenticating a user with callback
        /// </summary>
        private IEnumerator AuthenticateUserCoroutine(string username, string password, Action<bool, string> callback)
        {
            var loginData = new
            {
                username = username,
                password = password
            };

            var content = new StringContent(JsonConvert.SerializeObject(loginData), Encoding.UTF8, "application/json");
            var request = httpClient.PostAsync($"{apiBaseUrl}/auth/login", content);
            
            yield return new WaitUntil(() => request.IsCompleted);
            
            try
            {
                var response = request.Result;
                var responseContent = response.Content.ReadAsStringAsync().Result;
                
                if (response.IsSuccessStatusCode)
                {
                    var authResponse = JsonConvert.DeserializeObject<AuthResponse>(responseContent);
                    authToken = authResponse.token;
                    currentUserId = authResponse.userId;
                    
                    // Save auth token and user ID to PlayerPrefs
                    PlayerPrefsManager.SaveAuthToken(authToken);
                    PlayerPrefsManager.SaveUserId(currentUserId);

                    // Set the auth token for future requests
                    httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", authToken);
                    
                    // Connect to WebSocket after successful authentication
                    ConnectToWebSocket();
                    
                    callback(true, "Login successful");
                }
                else
                {
                    Debug.LogError($"Authentication failed: {responseContent}");
                    OnErrorOccurred?.Invoke($"Login failed: {response.StatusCode}");
                    callback(false, $"Login failed: {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"Authentication error: {ex.Message}");
                OnErrorOccurred?.Invoke($"Connection error: {ex.Message}");
                callback(false, $"Connection error: {ex.Message}");
            }
        }

        /// <summary>
        /// Registers a new user with the server using callback pattern
        /// </summary>
        /// <param name="username">Desired username</param>
        /// <param name="email">User's email</param>
        /// <param name="password">Desired password</param>
        /// <param name="callback">Callback with success status and message</param>
        public void RegisterUser(string username, string email, string password, Action<bool, string> callback)
        {
            StartCoroutine(RegisterUserCoroutine(username, email, password, callback));
        }
        
        /// <summary>
        /// Registers a new user with the server
        /// </summary>
        /// <param name="username">Desired username</param>
        /// <param name="email">User's email</param>
        /// <param name="password">Desired password</param>
        /// <returns>True if registration was successful</returns>
        public async Task<bool> RegisterUser(string username, string email, string password)
        {
            try
            {
                var registerData = new
                {
                    username = username,
                    email = email,
                    password = password
                };

                var content = new StringContent(JsonConvert.SerializeObject(registerData), Encoding.UTF8, "application/json");
                var response = await httpClient.PostAsync($"{apiBaseUrl}/auth/register", content);

                if (response.IsSuccessStatusCode)
                {
                    return true;
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Debug.LogError($"Registration failed: {errorContent}");
                    OnErrorOccurred?.Invoke($"Registration failed: {response.StatusCode}");
                    return false;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"Registration error: {ex.Message}");
                OnErrorOccurred?.Invoke($"Connection error: {ex.Message}");
                return false;
            }
        }
        
        /// <summary>
        /// Coroutine for registering a user with callback
        /// </summary>
        private IEnumerator RegisterUserCoroutine(string username, string email, string password, Action<bool, string> callback)
        {
            var registerData = new
            {
                username = username,
                email = email,
                password = password
            };

            var content = new StringContent(JsonConvert.SerializeObject(registerData), Encoding.UTF8, "application/json");
            var request = httpClient.PostAsync($"{apiBaseUrl}/auth/register", content);
            
            yield return new WaitUntil(() => request.IsCompleted);
            
            try
            {
                var response = request.Result;
                var responseContent = response.Content.ReadAsStringAsync().Result;
                
                if (response.IsSuccessStatusCode)
                {
                    callback(true, "Registration successful");
                }
                else
                {
                    Debug.LogError($"Registration failed: {responseContent}");
                    OnErrorOccurred?.Invoke($"Registration failed: {response.StatusCode}");
                    callback(false, $"Registration failed: {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"Registration error: {ex.Message}");
                OnErrorOccurred?.Invoke($"Connection error: {ex.Message}");
                callback(false, $"Connection error: {ex.Message}");
            }
        }

        /// <summary>
        /// Connects to the WebSocket server for real-time game updates
        /// </summary>
        private void ConnectToWebSocket()
        {
            if (webSocketConnection != null)
            {
                webSocketConnection.Disconnect();
            }

            webSocketConnection = new WebSocketConnection(webSocketUrl, authToken);
            webSocketConnection.OnConnected += () => {
                Debug.Log("WebSocket connected");
                OnConnectionStatusChanged?.Invoke(true);
            };
            webSocketConnection.OnDisconnected += () => {
                Debug.Log("WebSocket disconnected");
                OnConnectionStatusChanged?.Invoke(false);
            };
            webSocketConnection.OnError += (error) => {
                Debug.LogError($"WebSocket error: {error}");
                OnErrorOccurred?.Invoke($"WebSocket error: {error}");
            };
            webSocketConnection.OnMessageReceived += HandleWebSocketMessage;

            webSocketConnection.Connect();
        }

        /// <summary>
        /// Handles incoming WebSocket messages
        /// </summary>
        /// <param name="message">The received message</param>
        private void HandleWebSocketMessage(string message)
        {
            try
            {
                var wsMessage = JsonConvert.DeserializeObject<WebSocketMessage>(message);
                
                switch (wsMessage.type)
                {
                    case "game_update":
                        GameManager.Instance.HandleGameUpdate(wsMessage.data);
                        break;
                    case "chat_message":
                        ChatManager.Instance.HandleChatMessage(wsMessage.data);
                        break;
                    case "notification":
                        NotificationManager.Instance.ShowNotification(wsMessage.data);
                        break;
                    default:
                        Debug.LogWarning($"Unknown message type: {wsMessage.type}");
                        break;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error handling WebSocket message: {ex.Message}");
            }
        }

        /// <summary>
        /// Sends a message through the WebSocket connection
        /// </summary>
        /// <param name="type">Message type</param>
        /// <param name="data">Message data</param>
        public void SendWebSocketMessage(string type, object data)
        {
            if (!IsConnected)
            {
                Debug.LogWarning("Cannot send message: WebSocket not connected");
                return;
            }

            var message = new WebSocketMessage
            {
                type = type,
                data = data
            };

            string jsonMessage = JsonConvert.SerializeObject(message);
            webSocketConnection.SendMessage(jsonMessage);
        }

        /// <summary>
        /// Makes a GET request to the API
        /// </summary>
        /// <typeparam name="T">Type to deserialize the response to</typeparam>
        /// <param name="endpoint">API endpoint</param>
        /// <returns>Deserialized response</returns>
        public async Task<T> GetAsync<T>(string endpoint)
        {
            try
            {
                var response = await httpClient.GetAsync($"{apiBaseUrl}/{endpoint}");
                response.EnsureSuccessStatusCode();
                var content = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<T>(content);
            }
            catch (Exception ex)
            {
                Debug.LogError($"GET request error: {ex.Message}");
                OnErrorOccurred?.Invoke($"Network error: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Makes a POST request to the API
        /// </summary>
        /// <typeparam name="T">Type to deserialize the response to</typeparam>
        /// <param name="endpoint">API endpoint</param>
        /// <param name="data">Data to send</param>
        /// <returns>Deserialized response</returns>
        public async Task<T> PostAsync<T>(string endpoint, object data)
        {
            try
            {
                var content = new StringContent(JsonConvert.SerializeObject(data), Encoding.UTF8, "application/json");
                var response = await httpClient.PostAsync($"{apiBaseUrl}/{endpoint}", content);
                response.EnsureSuccessStatusCode();
                var responseContent = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<T>(responseContent);
            }
            catch (Exception ex)
            {
                Debug.LogError($"POST request error: {ex.Message}");
                OnErrorOccurred?.Invoke($"Network error: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Gets the current user data from the server
        /// </summary>
        /// <returns>User data object</returns>
        public async Task<UserData> GetUserData()
        {
            try
            {
                return await GetAsync<UserData>("users/me");
            }
            catch (Exception ex)
            {
                Debug.LogError($"Failed to get user data: {ex.Message}");
                OnErrorOccurred?.Invoke($"Failed to get user data: {ex.Message}");
                return null;
            }
        }
        
        /// <summary>
        /// Gets user data with callback support
        /// </summary>
        /// <param name="callback">Callback to execute when data is retrieved</param>
        public void GetUserData(Action<UserData, string> callback)
        {
            StartCoroutine(GetUserDataCoroutine(callback));
        }
        
        /// <summary>
        /// Coroutine to get user data with callback
        /// </summary>
        private IEnumerator GetUserDataCoroutine(Action<UserData, string> callback)
        {
            string errorMessage = null;
            UserData userData = null;
            
            try
            {
                var task = GetAsync<UserData>("users/me");
                while (!task.IsCompleted)
                {
                    yield return null;
                }
                
                if (task.IsFaulted)
                {
                    errorMessage = task.Exception?.InnerException?.Message ?? "Unknown error occurred";
                    Debug.LogError($"Failed to get user data: {errorMessage}");
                    OnErrorOccurred?.Invoke($"Failed to get user data: {errorMessage}");
                }
                else
                {
                    userData = task.Result;
                }
            }
            catch (Exception ex)
            {
                errorMessage = ex.Message;
                Debug.LogError($"Failed to get user data: {errorMessage}");
                OnErrorOccurred?.Invoke($"Failed to get user data: {errorMessage}");
            }
            
            callback?.Invoke(userData, errorMessage);
        }

        private void OnDestroy()
        {
            webSocketConnection?.Disconnect();
            httpClient?.Dispose();
        }
    }

    [Serializable]
    public class AuthResponse
    {
        public string token;
        public UserData user;
    }

    [Serializable]
    public class UserData
    {
        public string id;
        public string username;
        public string email;
        public int coins;
        public int diamonds;
        public int vipLevel;
        public string avatarUrl;
    }

    [Serializable]
    public class WebSocketMessage
    {
        public string type;
        public object data;
    }
}