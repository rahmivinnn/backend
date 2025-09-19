using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using NativeWebSocket;

namespace HiggsDomino.Multiplayer
{
    /// <summary>
    /// Manages WebSocket connections for real-time communication with the game server
    /// </summary>
    public class WebSocketConnection : MonoBehaviour
    {
        #region Singleton
        private static WebSocketConnection _instance;
        public static WebSocketConnection Instance
        {
            get
            {
                if (_instance == null)
                {
                    _instance = FindObjectOfType<WebSocketConnection>();
                    if (_instance == null)
                    {
                        GameObject go = new GameObject("WebSocketConnection");
                        _instance = go.AddComponent<WebSocketConnection>();
                        DontDestroyOnLoad(go);
                    }
                }
                return _instance;
            }
        }
        #endregion

        #region Properties
        private WebSocket webSocket;
        private bool isConnected = false;
        private float lastHeartbeatTime = 0f;
        private float heartbeatInterval = 30f; // Send heartbeat every 30 seconds
        private int reconnectAttempts = 0;
        private int maxReconnectAttempts = 5;
        private float reconnectDelay = 3f;
        private string currentUrl = "";
        private bool isReconnecting = false;
        private Queue<string> messageQueue = new Queue<string>();
        private bool isProcessingQueue = false;
        #endregion

        #region Events
        public event Action OnOpen;
        public event Action<int, string> OnClose;
        public event Action<string> OnError;
        public event Action<string> OnMessage;
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
        }

        private void Update()
        {
            if (webSocket != null)
            {
                #if !UNITY_WEBGL || UNITY_EDITOR
                webSocket.DispatchMessageQueue();
                #endif

                // Send heartbeat if needed
                if (isConnected && Time.time - lastHeartbeatTime > heartbeatInterval)
                {
                    SendHeartbeat();
                    lastHeartbeatTime = Time.time;
                }
            }

            // Process message queue
            if (isConnected && !isProcessingQueue && messageQueue.Count > 0)
            {
                StartCoroutine(ProcessMessageQueue());
            }
        }

        private void OnDestroy()
        {
            Disconnect();
        }

        private void OnApplicationQuit()
        {
            Disconnect();
        }

        private void OnApplicationPause(bool pauseStatus)
        {
            if (pauseStatus)
            {
                // Application paused, store connection state
                if (webSocket != null && isConnected)
                {
                    // Optionally disconnect or just note we're paused
                }
            }
            else
            {
                // Application resumed
                if (webSocket != null && !isConnected && !string.IsNullOrEmpty(currentUrl))
                {
                    // Reconnect if we were previously connected
                    StartCoroutine(ReconnectCoroutine());
                }
            }
        }
        #endregion

        #region Connection Methods
        /// <summary>
        /// Connects to a WebSocket server
        /// </summary>
        /// <param name="url">The WebSocket server URL</param>
        public void Connect(string url)
        {
            if (string.IsNullOrEmpty(url))
            {
                Debug.LogError("WebSocket URL cannot be empty");
                OnError?.Invoke("WebSocket URL cannot be empty");
                return;
            }

            // Disconnect if already connected
            if (webSocket != null)
            {
                Disconnect();
            }

            currentUrl = url;
            reconnectAttempts = 0;
            StartCoroutine(ConnectCoroutine(url));
        }

        /// <summary>
        /// Disconnects from the WebSocket server
        /// </summary>
        public void Disconnect()
        {
            if (webSocket != null)
            {
                isConnected = false;
                StopAllCoroutines();
                messageQueue.Clear();
                isProcessingQueue = false;

                try
                {
                    webSocket.Close();
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"Error closing WebSocket: {ex.Message}");
                }

                webSocket = null;
            }
        }

        /// <summary>
        /// Sends a message to the WebSocket server
        /// </summary>
        /// <param name="message">The message to send</param>
        public void SendMessage(string message)
        {
            if (!isConnected || webSocket == null)
            {
                Debug.LogWarning("Cannot send message: WebSocket is not connected");
                messageQueue.Enqueue(message); // Queue message for later sending
                return;
            }

            try
            {
                webSocket.SendText(message);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error sending WebSocket message: {ex.Message}");
                OnError?.Invoke($"Error sending message: {ex.Message}");
                messageQueue.Enqueue(message); // Queue message for retry
            }
        }

        /// <summary>
        /// Sends a binary message to the WebSocket server
        /// </summary>
        /// <param name="data">The binary data to send</param>
        public void SendBinary(byte[] data)
        {
            if (!isConnected || webSocket == null)
            {
                Debug.LogWarning("Cannot send binary data: WebSocket is not connected");
                return;
            }

            try
            {
                webSocket.Send(data);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error sending WebSocket binary data: {ex.Message}");
                OnError?.Invoke($"Error sending binary data: {ex.Message}");
            }
        }

        /// <summary>
        /// Sends a heartbeat message to keep the connection alive
        /// </summary>
        private void SendHeartbeat()
        {
            if (isConnected && webSocket != null)
            {
                try
                {
                    string heartbeatMessage = JsonUtility.ToJson(new { type = "heartbeat" });
                    webSocket.SendText(heartbeatMessage);
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"Error sending heartbeat: {ex.Message}");
                }
            }
        }
        #endregion

        #region Coroutines
        private IEnumerator ConnectCoroutine(string url)
        {
            try
            {
                webSocket = new WebSocket(url);

                webSocket.OnOpen += () =>
                {
                    Debug.Log("WebSocket connection opened");
                    isConnected = true;
                    reconnectAttempts = 0;
                    lastHeartbeatTime = Time.time;
                    OnOpen?.Invoke();

                    // Process any queued messages
                    if (messageQueue.Count > 0 && !isProcessingQueue)
                    {
                        StartCoroutine(ProcessMessageQueue());
                    }
                };

                webSocket.OnMessage += (bytes) =>
                {
                    string message = Encoding.UTF8.GetString(bytes);
                    Debug.Log($"WebSocket message received: {message}");
                    OnMessage?.Invoke(message);
                };

                webSocket.OnError += (errorMsg) =>
                {
                    Debug.LogError($"WebSocket error: {errorMsg}");
                    OnError?.Invoke(errorMsg);
                };

                webSocket.OnClose += (closeCode) =>
                {
                    Debug.Log($"WebSocket closed with code {closeCode}");
                    isConnected = false;

                    string reason = "Unknown reason";
                    switch (closeCode)
                    {
                        case 1000:
                            reason = "Normal closure";
                            break;
                        case 1001:
                            reason = "Going away";
                            break;
                        case 1002:
                            reason = "Protocol error";
                            break;
                        case 1003:
                            reason = "Unsupported data";
                            break;
                        case 1005:
                            reason = "No status received";
                            break;
                        case 1006:
                            reason = "Abnormal closure";
                            break;
                        case 1007:
                            reason = "Invalid frame payload data";
                            break;
                        case 1008:
                            reason = "Policy violation";
                            break;
                        case 1009:
                            reason = "Message too big";
                            break;
                        case 1010:
                            reason = "Mandatory extension";
                            break;
                        case 1011:
                            reason = "Internal server error";
                            break;
                        case 1012:
                            reason = "Service restart";
                            break;
                        case 1013:
                            reason = "Try again later";
                            break;
                        case 1015:
                            reason = "TLS handshake";
                            break;
                    }

                    OnClose?.Invoke(closeCode, reason);

                    // Attempt to reconnect if not manually disconnected
                    if (!string.IsNullOrEmpty(currentUrl) && closeCode != 1000 && !isReconnecting)
                    {
                        StartCoroutine(ReconnectCoroutine());
                    }
                };

                // Connect to the server
                webSocket.Connect();
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error creating WebSocket: {ex.Message}");
                OnError?.Invoke($"Error creating WebSocket: {ex.Message}");
                yield break;
            }

            yield return null;
        }

        private IEnumerator ReconnectCoroutine()
        {
            if (isReconnecting || string.IsNullOrEmpty(currentUrl))
                yield break;

            isReconnecting = true;

            while (!isConnected && reconnectAttempts < maxReconnectAttempts)
            {
                reconnectAttempts++;
                Debug.Log($"Attempting to reconnect to WebSocket (Attempt {reconnectAttempts}/{maxReconnectAttempts})...");

                // Wait before reconnecting
                float delay = reconnectDelay * Mathf.Pow(1.5f, reconnectAttempts - 1); // Exponential backoff
                yield return new WaitForSeconds(delay);

                // Try to reconnect
                yield return StartCoroutine(ConnectCoroutine(currentUrl));

                if (isConnected)
                {
                    Debug.Log("Successfully reconnected to WebSocket");
                    break;
                }
            }

            if (!isConnected && reconnectAttempts >= maxReconnectAttempts)
            {
                Debug.LogError("Failed to reconnect to WebSocket after maximum attempts");
                OnError?.Invoke("Failed to reconnect after maximum attempts");
            }

            isReconnecting = false;
        }

        private IEnumerator ProcessMessageQueue()
        {
            if (isProcessingQueue || !isConnected)
                yield break;

            isProcessingQueue = true;

            while (messageQueue.Count > 0 && isConnected)
            {
                string message = messageQueue.Dequeue();
                try
                {
                    webSocket.SendText(message);
                    // Small delay to prevent flooding the server
                    yield return new WaitForSeconds(0.05f);
                }
                catch (Exception ex)
                {
                    Debug.LogError($"Error sending queued message: {ex.Message}");
                    // Put the message back in the queue for retry
                    messageQueue.Enqueue(message);
                    break;
                }
            }

            isProcessingQueue = false;
        }
        #endregion

        #region Helper Methods
        /// <summary>
        /// Checks if the WebSocket is connected
        /// </summary>
        /// <returns>True if connected, false otherwise</returns>
        public bool IsConnected()
        {
            return isConnected && webSocket != null && webSocket.State == WebSocketState.Open;
        }

        /// <summary>
        /// Gets the current WebSocket state
        /// </summary>
        /// <returns>The WebSocket state</returns>
        public WebSocketState GetState()
        {
            return webSocket != null ? webSocket.State : WebSocketState.Closed;
        }
        #endregion
    }
}