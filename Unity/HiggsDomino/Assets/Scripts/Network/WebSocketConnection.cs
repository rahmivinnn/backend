using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using NativeWebSocket;

namespace HiggsDomino.Network
{
    /// <summary>
    /// Handles WebSocket connection for real-time game updates
    /// </summary>
    public class WebSocketConnection
    {
        private WebSocket webSocket;
        private string url;
        private string authToken;
        private bool isConnecting = false;
        private bool autoReconnect = true;
        private float reconnectDelay = 5f;
        private int reconnectAttempts = 0;
        private int maxReconnectAttempts = 5;

        public bool IsConnected => webSocket != null && webSocket.State == WebSocketState.Open;

        public event Action OnConnected;
        public event Action OnDisconnected;
        public event Action<string> OnError;
        public event Action<string> OnMessageReceived;

        public WebSocketConnection(string url, string authToken)
        {
            this.url = url;
            this.authToken = authToken;
        }

        /// <summary>
        /// Connects to the WebSocket server
        /// </summary>
        public async void Connect()
        {
            if (isConnecting || IsConnected) return;

            isConnecting = true;

            try
            {
                // Add auth token to URL
                string fullUrl = $"{url}?token={authToken}";
                webSocket = new WebSocket(fullUrl);

                webSocket.OnOpen += () =>
                {
                    Debug.Log("WebSocket connection opened");
                    isConnecting = false;
                    reconnectAttempts = 0;
                    OnConnected?.Invoke();
                };

                webSocket.OnError += (e) =>
                {
                    Debug.LogError($"WebSocket error: {e}");
                    isConnecting = false;
                    OnError?.Invoke(e);
                };

                webSocket.OnClose += (e) =>
                {
                    Debug.Log($"WebSocket closed with code: {e}");
                    isConnecting = false;
                    OnDisconnected?.Invoke();

                    if (autoReconnect && reconnectAttempts < maxReconnectAttempts)
                    {
                        reconnectAttempts++;
                        Debug.Log($"Attempting to reconnect ({reconnectAttempts}/{maxReconnectAttempts})...");
                        MonoBehaviour.Invoke(Connect, reconnectDelay);
                    }
                };

                webSocket.OnMessage += (bytes) =>
                {
                    string message = System.Text.Encoding.UTF8.GetString(bytes);
                    OnMessageReceived?.Invoke(message);
                };

                await webSocket.Connect();
            }
            catch (Exception ex)
            {
                Debug.LogError($"WebSocket connection error: {ex.Message}");
                isConnecting = false;
                OnError?.Invoke(ex.Message);
            }
        }

        /// <summary>
        /// Disconnects from the WebSocket server
        /// </summary>
        public async void Disconnect()
        {
            if (webSocket == null) return;

            try
            {
                autoReconnect = false;
                await webSocket.Close();
            }
            catch (Exception ex)
            {
                Debug.LogError($"WebSocket disconnect error: {ex.Message}");
                OnError?.Invoke(ex.Message);
            }
        }

        /// <summary>
        /// Sends a message through the WebSocket connection
        /// </summary>
        /// <param name="message">Message to send</param>
        public async void SendMessage(string message)
        {
            if (!IsConnected)
            {
                Debug.LogWarning("Cannot send message: WebSocket not connected");
                return;
            }

            try
            {
                await webSocket.SendText(message);
            }
            catch (Exception ex)
            {
                Debug.LogError($"WebSocket send error: {ex.Message}");
                OnError?.Invoke(ex.Message);
            }
        }

        /// <summary>
        /// Updates the WebSocket connection (should be called from Update method)
        /// </summary>
        public void Update()
        {
            if (webSocket != null)
            {
                #if !UNITY_WEBGL || UNITY_EDITOR
                webSocket.DispatchMessageQueue();
                #endif
            }
        }
    }
}