using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

namespace HiggsDomino.Multiplayer
{
    /// <summary>
    /// Handles multiplayer connection using Unity's Netcode for GameObjects
    /// This class works alongside WebSocketConnection for hybrid networking approach
    /// </summary>
    public class MultiplayerConnection : MonoBehaviour
    {
        #region Singleton
        private static MultiplayerConnection _instance;
        public static MultiplayerConnection Instance
        {
            get
            {
                if (_instance == null)
                {
                    _instance = FindObjectOfType<MultiplayerConnection>();
                    if (_instance == null)
                    {
                        GameObject go = new GameObject("MultiplayerConnection");
                        _instance = go.AddComponent<MultiplayerConnection>();
                        DontDestroyOnLoad(go);
                    }
                }
                return _instance;
            }
        }
        #endregion

        #region Events
        public event Action<bool> OnConnectionStatusChanged;
        public event Action<string> OnConnectionError;
        public event Action<string> OnPlayerJoined;
        public event Action<string> OnPlayerLeft;
        public event Action<string, byte[]> OnDataReceived;
        #endregion

        #region Properties
        public bool IsConnected { get; private set; }
        public bool IsHost { get; private set; }
        public string LocalPlayerId { get; private set; }
        public Dictionary<string, PlayerInfo> ConnectedPlayers { get; private set; } = new Dictionary<string, PlayerInfo>();
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
            
            // Initialize connection
            IsConnected = false;
            IsHost = false;
        }

        private void OnDestroy()
        {
            Disconnect();
        }
        #endregion

        #region Connection Methods
        /// <summary>
        /// Hosts a new multiplayer session
        /// </summary>
        /// <param name="roomSettings">Settings for the room</param>
        /// <returns>True if hosting started successfully</returns>
        public bool HostGame(GameRoom.RoomSettings roomSettings)
        {
            try
            {
                // Implementation would use Unity Netcode for GameObjects
                // This is a placeholder for the actual implementation
                
                IsHost = true;
                IsConnected = true;
                LocalPlayerId = PlayerPrefsManager.GetUserId();
                
                // Add local player to connected players
                PlayerInfo localPlayer = new PlayerInfo
                {
                    Id = LocalPlayerId,
                    Username = PlayerPrefsManager.GetUsername(),
                    IsReady = true
                };
                
                ConnectedPlayers.Add(LocalPlayerId, localPlayer);
                
                // Notify listeners
                OnConnectionStatusChanged?.Invoke(true);
                
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error hosting game: {ex.Message}");
                OnConnectionError?.Invoke($"Failed to host game: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Joins an existing multiplayer session
        /// </summary>
        /// <param name="roomId">ID of the room to join</param>
        /// <returns>True if join started successfully</returns>
        public bool JoinGame(string roomId)
        {
            try
            {
                // Implementation would use Unity Netcode for GameObjects
                // This is a placeholder for the actual implementation
                
                IsHost = false;
                IsConnected = true;
                LocalPlayerId = PlayerPrefsManager.GetUserId();
                
                // Add local player to connected players
                PlayerInfo localPlayer = new PlayerInfo
                {
                    Id = LocalPlayerId,
                    Username = PlayerPrefsManager.GetUsername(),
                    IsReady = false
                };
                
                ConnectedPlayers.Add(LocalPlayerId, localPlayer);
                
                // Notify listeners
                OnConnectionStatusChanged?.Invoke(true);
                
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error joining game: {ex.Message}");
                OnConnectionError?.Invoke($"Failed to join game: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Disconnects from the current multiplayer session
        /// </summary>
        public void Disconnect()
        {
            if (!IsConnected)
                return;

            try
            {
                // Implementation would use Unity Netcode for GameObjects
                // This is a placeholder for the actual implementation
                
                IsHost = false;
                IsConnected = false;
                ConnectedPlayers.Clear();
                
                // Notify listeners
                OnConnectionStatusChanged?.Invoke(false);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error disconnecting: {ex.Message}");
            }
        }
        #endregion

        #region Data Transfer Methods
        /// <summary>
        /// Sends data to all connected players
        /// </summary>
        /// <param name="data">Data to send</param>
        /// <returns>True if data was sent successfully</returns>
        public bool SendToAll(byte[] data)
        {
            if (!IsConnected)
                return false;

            try
            {
                // Implementation would use Unity Netcode for GameObjects
                // This is a placeholder for the actual implementation
                
                Debug.Log("Sending data to all players");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error sending data: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Sends data to a specific player
        /// </summary>
        /// <param name="playerId">ID of the player to send data to</param>
        /// <param name="data">Data to send</param>
        /// <returns>True if data was sent successfully</returns>
        public bool SendToPlayer(string playerId, byte[] data)
        {
            if (!IsConnected || !ConnectedPlayers.ContainsKey(playerId))
                return false;

            try
            {
                // Implementation would use Unity Netcode for GameObjects
                // This is a placeholder for the actual implementation
                
                Debug.Log($"Sending data to player {playerId}");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error sending data to player {playerId}: {ex.Message}");
                return false;
            }
        }
        #endregion

        #region Player Management Methods
        /// <summary>
        /// Sets the ready status of the local player
        /// </summary>
        /// <param name="isReady">Whether the player is ready</param>
        public void SetReady(bool isReady)
        {
            if (!IsConnected || !ConnectedPlayers.ContainsKey(LocalPlayerId))
                return;

            ConnectedPlayers[LocalPlayerId].IsReady = isReady;
            
            // Implementation would use Unity Netcode for GameObjects to sync this state
            // This is a placeholder for the actual implementation
        }

        /// <summary>
        /// Kicks a player from the game (host only)
        /// </summary>
        /// <param name="playerId">ID of the player to kick</param>
        /// <returns>True if player was kicked successfully</returns>
        public bool KickPlayer(string playerId)
        {
            if (!IsConnected || !IsHost || !ConnectedPlayers.ContainsKey(playerId))
                return false;

            try
            {
                // Implementation would use Unity Netcode for GameObjects
                // This is a placeholder for the actual implementation
                
                ConnectedPlayers.Remove(playerId);
                OnPlayerLeft?.Invoke(playerId);
                
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error kicking player {playerId}: {ex.Message}");
                return false;
            }
        }
        #endregion

        #region Helper Methods
        /// <summary>
        /// Handles when a new player joins the game
        /// </summary>
        /// <param name="playerId">ID of the player who joined</param>
        /// <param name="playerInfo">Information about the player</param>
        private void HandlePlayerJoined(string playerId, PlayerInfo playerInfo)
        {
            if (ConnectedPlayers.ContainsKey(playerId))
                return;

            ConnectedPlayers.Add(playerId, playerInfo);
            OnPlayerJoined?.Invoke(playerId);
        }

        /// <summary>
        /// Handles when a player leaves the game
        /// </summary>
        /// <param name="playerId">ID of the player who left</param>
        private void HandlePlayerLeft(string playerId)
        {
            if (!ConnectedPlayers.ContainsKey(playerId))
                return;

            ConnectedPlayers.Remove(playerId);
            OnPlayerLeft?.Invoke(playerId);
        }

        /// <summary>
        /// Handles when data is received from another player
        /// </summary>
        /// <param name="senderId">ID of the player who sent the data</param>
        /// <param name="data">Data that was received</param>
        private void HandleDataReceived(string senderId, byte[] data)
        {
            OnDataReceived?.Invoke(senderId, data);
        }
        #endregion
    }
}