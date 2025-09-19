using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using HiggsDomino.Game;
using HiggsDomino.Network;

namespace HiggsDomino.UI
{
    /// <summary>
    /// Manages the game room UI
    /// </summary>
    public class RoomManager : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private GameObject roomPanel;
        [SerializeField] private Text roomNameText;
        [SerializeField] private Text gameTypeText;
        [SerializeField] private Text roundsText;
        [SerializeField] private Text entryFeeText;
        [SerializeField] private GameObject playerListContent;
        [SerializeField] private GameObject playerItemPrefab;
        [SerializeField] private Button startGameButton;
        [SerializeField] private Button leaveRoomButton;
        [SerializeField] private Button readyButton;
        [SerializeField] private Text readyButtonText;
        [SerializeField] private Button inviteButton;
        [SerializeField] private Button chatButton;
        [SerializeField] private GameObject chatPanel;
        [SerializeField] private InputField chatInput;
        [SerializeField] private GameObject chatMessagesContent;
        [SerializeField] private GameObject chatMessagePrefab;

        private NetworkManager networkManager;
        private GameManager gameManager;
        private UIManager uiManager;
        private GameRoom currentRoom;
        private Dictionary<string, GameObject> playerItems = new Dictionary<string, GameObject>();
        private bool isReady = false;

        private void Awake()
        {
            networkManager = FindObjectOfType<NetworkManager>();
            gameManager = FindObjectOfType<GameManager>();
            uiManager = FindObjectOfType<UIManager>();

            // Initialize UI
            startGameButton.onClick.AddListener(StartGame);
            leaveRoomButton.onClick.AddListener(LeaveRoom);
            readyButton.onClick.AddListener(ToggleReady);
            inviteButton.onClick.AddListener(InviteFriends);
            chatButton.onClick.AddListener(ToggleChatPanel);
            chatInput.onEndEdit.AddListener(SendChatMessage);
        }

        private void OnEnable()
        {
            // Subscribe to events
            if (networkManager != null)
            {
                networkManager.OnRoomUpdated += UpdateRoom;
                networkManager.OnChatMessageReceived += AddChatMessage;
            }
        }

        private void OnDisable()
        {
            // Unsubscribe from events
            if (networkManager != null)
            {
                networkManager.OnRoomUpdated -= UpdateRoom;
                networkManager.OnChatMessageReceived -= AddChatMessage;
            }
        }

        /// <summary>
        /// Updates the room information
        /// </summary>
        /// <param name="room">Room data</param>
        public void UpdateRoom(GameRoom room)
        {
            currentRoom = room;
            UpdateRoomInfo();
            UpdatePlayerList();

            // Update UI based on player role
            bool isHost = networkManager.GetPlayerId() == currentRoom.hostId;
            startGameButton.gameObject.SetActive(isHost);
            readyButton.gameObject.SetActive(!isHost);

            // Check if all players are ready
            bool allPlayersReady = true;
            foreach (var player in currentRoom.players)
            {
                if (!player.isReady)
                {
                    allPlayersReady = false;
                    break;
                }
            }

            // Enable start button only if all players are ready and there are at least 2 players
            startGameButton.interactable = allPlayersReady && currentRoom.players.Count >= 2;
        }

        /// <summary>
        /// Updates the room information UI
        /// </summary>
        private void UpdateRoomInfo()
        {
            if (currentRoom == null) return;

            roomNameText.text = currentRoom.name;
            gameTypeText.text = char.ToUpper(currentRoom.gameType[0]) + currentRoom.gameType.Substring(1);
            roundsText.text = $"{currentRoom.maxRounds} Rounds";
            entryFeeText.text = currentRoom.entryFee > 0 ? $"{currentRoom.entryFee} Coins" : "Free";
        }

        /// <summary>
        /// Updates the player list UI
        /// </summary>
        private void UpdatePlayerList()
        {
            if (currentRoom == null) return;

            // Clear existing player items that are no longer in the room
            List<string> playerIdsToRemove = new List<string>();
            foreach (var playerId in playerItems.Keys)
            {
                if (!currentRoom.players.Exists(p => p.id == playerId))
                {
                    playerIdsToRemove.Add(playerId);
                }
            }

            foreach (var playerId in playerIdsToRemove)
            {
                Destroy(playerItems[playerId]);
                playerItems.Remove(playerId);
            }

            // Update or add player items
            foreach (var player in currentRoom.players)
            {
                if (playerItems.ContainsKey(player.id))
                {
                    // Update existing player item
                    PlayerItem playerItem = playerItems[player.id].GetComponent<PlayerItem>();
                    if (playerItem != null)
                    {
                        playerItem.UpdatePlayer(player, currentRoom.hostId);
                    }
                }
                else
                {
                    // Create new player item
                    GameObject playerItemObj = Instantiate(playerItemPrefab, playerListContent.transform);
                    PlayerItem playerItem = playerItemObj.GetComponent<PlayerItem>();
                    if (playerItem != null)
                    {
                        playerItem.SetPlayer(player, currentRoom.hostId);
                    }
                    playerItems[player.id] = playerItemObj;
                }
            }

            // Update ready status for current player
            PlayerInfo currentPlayer = currentRoom.players.Find(p => p.id == networkManager.GetPlayerId());
            if (currentPlayer != null)
            {
                isReady = currentPlayer.isReady;
                readyButtonText.text = isReady ? "Not Ready" : "Ready";
            }
        }

        /// <summary>
        /// Toggles the player's ready status
        /// </summary>
        public void ToggleReady()
        {
            isReady = !isReady;
            readyButtonText.text = isReady ? "Not Ready" : "Ready";
            networkManager.SetPlayerReady(isReady);
        }

        /// <summary>
        /// Starts the game
        /// </summary>
        public void StartGame()
        {
            if (currentRoom == null) return;

            // Check if there are enough players
            if (currentRoom.players.Count < 2)
            {
                uiManager.ShowNotification("Need at least 2 players to start");
                return;
            }

            // Check if all players are ready
            foreach (var player in currentRoom.players)
            {
                if (!player.isReady)
                {
                    uiManager.ShowNotification("All players must be ready");
                    return;
                }
            }

            // Start the game
            networkManager.StartGame(currentRoom.id);
        }

        /// <summary>
        /// Leaves the current room
        /// </summary>
        public void LeaveRoom()
        {
            if (currentRoom == null) return;

            networkManager.LeaveRoom(currentRoom.id);
            Hide();
            uiManager.ShowLobby();
        }

        /// <summary>
        /// Invites friends to the room
        /// </summary>
        public void InviteFriends()
        {
            if (currentRoom == null) return;

            uiManager.ShowFriendsList((friendId) =>
            {
                networkManager.InviteToRoom(friendId, currentRoom.id);
                uiManager.ShowNotification("Invitation sent");
            });
        }

        /// <summary>
        /// Toggles the chat panel
        /// </summary>
        public void ToggleChatPanel()
        {
            chatPanel.SetActive(!chatPanel.activeSelf);
            if (chatPanel.activeSelf)
            {
                chatInput.Select();
                chatInput.ActivateInputField();
            }
        }

        /// <summary>
        /// Sends a chat message
        /// </summary>
        /// <param name="message">Message text</param>
        public void SendChatMessage(string message)
        {
            if (string.IsNullOrEmpty(message) || currentRoom == null) return;

            networkManager.SendChatMessage(currentRoom.id, message);
            chatInput.text = "";
            chatInput.Select();
            chatInput.ActivateInputField();
        }

        /// <summary>
        /// Adds a chat message to the chat panel
        /// </summary>
        /// <param name="senderId">Sender ID</param>
        /// <param name="senderName">Sender name</param>
        /// <param name="message">Message text</param>
        public void AddChatMessage(string senderId, string senderName, string message)
        {
            if (string.IsNullOrEmpty(message)) return;

            GameObject chatMessageObj = Instantiate(chatMessagePrefab, chatMessagesContent.transform);
            ChatMessage chatMessage = chatMessageObj.GetComponent<ChatMessage>();
            if (chatMessage != null)
            {
                chatMessage.SetMessage(senderId, senderName, message);
            }

            // Scroll to bottom
            Canvas.ForceUpdateCanvases();
            ScrollRect scrollRect = chatMessagesContent.GetComponentInParent<ScrollRect>();
            if (scrollRect != null)
            {
                scrollRect.verticalNormalizedPosition = 0f;
            }
        }

        /// <summary>
        /// Shows the room panel
        /// </summary>
        public void Show()
        {
            roomPanel.SetActive(true);
            chatPanel.SetActive(false);
        }

        /// <summary>
        /// Hides the room panel
        /// </summary>
        public void Hide()
        {
            roomPanel.SetActive(false);
            chatPanel.SetActive(false);
        }
    }

    /// <summary>
    /// Represents a player item in the player list
    /// </summary>
    public class PlayerItem : MonoBehaviour
    {
        [SerializeField] private Text playerNameText;
        [SerializeField] private Image playerAvatarImage;
        [SerializeField] private Image hostIcon;
        [SerializeField] private Image readyIcon;

        private PlayerInfo player;

        /// <summary>
        /// Sets the player data
        /// </summary>
        /// <param name="player">Player data</param>
        /// <param name="hostId">Host ID</param>
        public void SetPlayer(PlayerInfo player, string hostId)
        {
            this.player = player;
            UpdateUI(hostId);
        }

        /// <summary>
        /// Updates the player data
        /// </summary>
        /// <param name="player">Player data</param>
        /// <param name="hostId">Host ID</param>
        public void UpdatePlayer(PlayerInfo player, string hostId)
        {
            this.player = player;
            UpdateUI(hostId);
        }

        /// <summary>
        /// Updates the UI with player data
        /// </summary>
        /// <param name="hostId">Host ID</param>
        private void UpdateUI(string hostId)
        {
            if (player == null) return;

            playerNameText.text = player.username;
            hostIcon.gameObject.SetActive(player.id == hostId);
            readyIcon.gameObject.SetActive(player.isReady);

            // Load avatar if available
            if (!string.IsNullOrEmpty(player.avatarUrl))
            {
                // Load avatar image (implementation depends on your asset loading system)
                // For example, using a simple resource load:
                Sprite avatarSprite = Resources.Load<Sprite>($"Avatars/{player.avatarUrl}");
                if (avatarSprite != null)
                {
                    playerAvatarImage.sprite = avatarSprite;
                }
            }
        }
    }

    /// <summary>
    /// Represents a chat message in the chat panel
    /// </summary>
    public class ChatMessage : MonoBehaviour
    {
        [SerializeField] private Text senderNameText;
        [SerializeField] private Text messageText;
        [SerializeField] private Image backgroundImage;

        private string senderId;

        /// <summary>
        /// Sets the message data
        /// </summary>
        /// <param name="senderId">Sender ID</param>
        /// <param name="senderName">Sender name</param>
        /// <param name="message">Message text</param>
        public void SetMessage(string senderId, string senderName, string message)
        {
            this.senderId = senderId;
            senderNameText.text = senderName + ":";
            messageText.text = message;

            // Change background color if message is from current player
            bool isFromCurrentPlayer = senderId == FindObjectOfType<NetworkManager>().GetPlayerId();
            backgroundImage.color = isFromCurrentPlayer ? new Color(0.8f, 0.9f, 1f) : new Color(1f, 1f, 1f);
        }
    }
}