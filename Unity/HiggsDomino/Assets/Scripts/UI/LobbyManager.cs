using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using HiggsDomino.Game;
using HiggsDomino.Network;

namespace HiggsDomino.UI
{
    /// <summary>
    /// Manages the game lobby UI
    /// </summary>
    public class LobbyManager : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private GameObject lobbyPanel;
        [SerializeField] private GameObject roomListContent;
        [SerializeField] private GameObject roomItemPrefab;
        [SerializeField] private GameObject createRoomPanel;
        [SerializeField] private Button createRoomButton;
        [SerializeField] private Button refreshButton;
        [SerializeField] private Button profileButton;
        [SerializeField] private Button storeButton;
        [SerializeField] private Button settingsButton;
        [SerializeField] private Text playerNameText;
        [SerializeField] private Text playerLevelText;
        [SerializeField] private Text playerCoinsText;
        [SerializeField] private Text playerGemsText;
        [SerializeField] private Image playerAvatarImage;

        [Header("Create Room UI")]
        [SerializeField] private InputField roomNameInput;
        [SerializeField] private Dropdown gameTypeDropdown;
        [SerializeField] private Dropdown maxPlayersDropdown;
        [SerializeField] private Dropdown maxRoundsDropdown;
        [SerializeField] private InputField entryFeeInput;
        [SerializeField] private Toggle privateRoomToggle;
        [SerializeField] private InputField passwordInput;
        [SerializeField] private Button createButton;
        [SerializeField] private Button cancelButton;

        private NetworkManager networkManager;
        private GameManager gameManager;
        private UIManager uiManager;
        private List<GameRoom> roomList = new List<GameRoom>();
        private Dictionary<string, GameObject> roomItems = new Dictionary<string, GameObject>();

        private void Awake()
        {
            networkManager = FindObjectOfType<NetworkManager>();
            gameManager = FindObjectOfType<GameManager>();
            uiManager = FindObjectOfType<UIManager>();

            // Initialize UI
            createRoomButton.onClick.AddListener(ShowCreateRoomPanel);
            refreshButton.onClick.AddListener(RefreshRoomList);
            profileButton.onClick.AddListener(ShowProfile);
            storeButton.onClick.AddListener(ShowStore);
            settingsButton.onClick.AddListener(ShowSettings);

            // Create Room Panel
            createButton.onClick.AddListener(CreateRoom);
            cancelButton.onClick.AddListener(HideCreateRoomPanel);
            privateRoomToggle.onValueChanged.AddListener(OnPrivateRoomToggled);

            // Initialize dropdowns
            InitializeDropdowns();
        }

        private void OnEnable()
        {
            // Subscribe to events
            if (networkManager != null)
            {
                networkManager.OnRoomListUpdated += UpdateRoomList;
                networkManager.OnPlayerDataUpdated += UpdatePlayerInfo;
            }

            // Refresh room list when lobby is shown
            RefreshRoomList();
            UpdatePlayerInfo();
        }

        private void OnDisable()
        {
            // Unsubscribe from events
            if (networkManager != null)
            {
                networkManager.OnRoomListUpdated -= UpdateRoomList;
                networkManager.OnPlayerDataUpdated -= UpdatePlayerInfo;
            }
        }

        /// <summary>
        /// Initializes dropdown options
        /// </summary>
        private void InitializeDropdowns()
        {
            // Game Type Dropdown
            gameTypeDropdown.ClearOptions();
            gameTypeDropdown.AddOptions(new List<string> { "Domino", "Gaple" });

            // Max Players Dropdown
            maxPlayersDropdown.ClearOptions();
            maxPlayersDropdown.AddOptions(new List<string> { "2 Players", "3 Players", "4 Players" });

            // Max Rounds Dropdown
            maxRoundsDropdown.ClearOptions();
            maxRoundsDropdown.AddOptions(new List<string> { "1 Round", "3 Rounds", "5 Rounds", "10 Rounds" });
        }

        /// <summary>
        /// Shows the create room panel
        /// </summary>
        public void ShowCreateRoomPanel()
        {
            createRoomPanel.SetActive(true);
            roomNameInput.text = $"{networkManager.GetPlayerName()}'s Room";
            entryFeeInput.text = "0";
            privateRoomToggle.isOn = false;
            passwordInput.text = "";
            passwordInput.gameObject.SetActive(false);
        }

        /// <summary>
        /// Hides the create room panel
        /// </summary>
        public void HideCreateRoomPanel()
        {
            createRoomPanel.SetActive(false);
        }

        /// <summary>
        /// Handles private room toggle changes
        /// </summary>
        /// <param name="isPrivate">Whether the room is private</param>
        private void OnPrivateRoomToggled(bool isPrivate)
        {
            passwordInput.gameObject.SetActive(isPrivate);
            if (!isPrivate)
            {
                passwordInput.text = "";
            }
        }

        /// <summary>
        /// Creates a new room
        /// </summary>
        public void CreateRoom()
        {
            string roomName = roomNameInput.text;
            if (string.IsNullOrEmpty(roomName))
            {
                roomName = $"{networkManager.GetPlayerName()}'s Room";
            }

            string gameType = gameTypeDropdown.options[gameTypeDropdown.value].text.ToLower();
            int maxPlayers = maxPlayersDropdown.value + 2; // 2, 3, or 4 players
            int maxRounds = 1;
            switch (maxRoundsDropdown.value)
            {
                case 0: maxRounds = 1; break;
                case 1: maxRounds = 3; break;
                case 2: maxRounds = 5; break;
                case 3: maxRounds = 10; break;
            }

            int entryFee = 0;
            int.TryParse(entryFeeInput.text, out entryFee);

            bool isPrivate = privateRoomToggle.isOn;
            string password = isPrivate ? passwordInput.text : "";

            // Create room settings
            GameRoom room = new GameRoom(roomName, networkManager.GetPlayerId())
            {
                gameType = gameType,
                maxPlayers = maxPlayers,
                maxRounds = maxRounds,
                entryFee = entryFee,
                isPrivate = isPrivate,
                password = password
            };

            // Add the host player to the room
            PlayerInfo hostPlayer = new PlayerInfo
            {
                id = networkManager.GetPlayerId(),
                username = networkManager.GetPlayerName(),
                isHost = true,
                isReady = true
            };
            room.AddPlayer(hostPlayer);

            // Send create room request to server
            networkManager.CreateRoom(room);
            HideCreateRoomPanel();
        }

        /// <summary>
        /// Refreshes the room list
        /// </summary>
        public void RefreshRoomList()
        {
            networkManager.GetRoomList();
        }

        /// <summary>
        /// Updates the room list UI
        /// </summary>
        /// <param name="rooms">List of rooms</param>
        public void UpdateRoomList(List<GameRoom> rooms)
        {
            roomList = rooms;

            // Clear existing room items that are no longer in the list
            List<string> roomIdsToRemove = new List<string>();
            foreach (var roomId in roomItems.Keys)
            {
                if (!roomList.Exists(r => r.id == roomId))
                {
                    roomIdsToRemove.Add(roomId);
                }
            }

            foreach (var roomId in roomIdsToRemove)
            {
                Destroy(roomItems[roomId]);
                roomItems.Remove(roomId);
            }

            // Update or add room items
            foreach (var room in roomList)
            {
                if (roomItems.ContainsKey(room.id))
                {
                    // Update existing room item
                    RoomItem roomItem = roomItems[room.id].GetComponent<RoomItem>();
                    if (roomItem != null)
                    {
                        roomItem.UpdateRoom(room);
                    }
                }
                else
                {
                    // Create new room item
                    GameObject roomItemObj = Instantiate(roomItemPrefab, roomListContent.transform);
                    RoomItem roomItem = roomItemObj.GetComponent<RoomItem>();
                    if (roomItem != null)
                    {
                        roomItem.SetRoom(room);
                        roomItem.OnJoinRoomClicked += JoinRoom;
                    }
                    roomItems[room.id] = roomItemObj;
                }
            }
        }

        /// <summary>
        /// Updates the player information UI
        /// </summary>
        public void UpdatePlayerInfo()
        {
            PlayerInfo player = networkManager.GetPlayerInfo();
            if (player != null)
            {
                playerNameText.text = player.username;
                playerLevelText.text = $"Level {player.level}";
                playerCoinsText.text = player.coins.ToString("N0");
                playerGemsText.text = player.gems.ToString();

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
        /// Joins a room
        /// </summary>
        /// <param name="room">Room to join</param>
        public void JoinRoom(GameRoom room)
        {
            if (room.isPrivate)
            {
                // Show password dialog
                uiManager.ShowPasswordDialog(room.name, (password) =>
                {
                    if (password == room.password)
                    {
                        networkManager.JoinRoom(room.id);
                    }
                    else
                    {
                        uiManager.ShowNotification("Incorrect password");
                    }
                });
            }
            else
            {
                networkManager.JoinRoom(room.id);
            }
        }

        /// <summary>
        /// Shows the player profile
        /// </summary>
        private void ShowProfile()
        {
            uiManager.ShowProfile();
        }

        /// <summary>
        /// Shows the store
        /// </summary>
        private void ShowStore()
        {
            uiManager.ShowStore();
        }

        /// <summary>
        /// Shows the settings
        /// </summary>
        private void ShowSettings()
        {
            uiManager.ShowSettings();
        }

        /// <summary>
        /// Shows the lobby panel
        /// </summary>
        public void Show()
        {
            lobbyPanel.SetActive(true);
            RefreshRoomList();
            UpdatePlayerInfo();
        }

        /// <summary>
        /// Hides the lobby panel
        /// </summary>
        public void Hide()
        {
            lobbyPanel.SetActive(false);
            HideCreateRoomPanel();
        }
    }

    /// <summary>
    /// Represents a room item in the room list
    /// </summary>
    public class RoomItem : MonoBehaviour
    {
        [SerializeField] private Text roomNameText;
        [SerializeField] private Text gameTypeText;
        [SerializeField] private Text playerCountText;
        [SerializeField] private Text entryFeeText;
        [SerializeField] private Image lockIcon;
        [SerializeField] private Button joinButton;

        private GameRoom room;

        // Event for join button click
        public event Action<GameRoom> OnJoinRoomClicked;

        private void Awake()
        {
            joinButton.onClick.AddListener(() => OnJoinRoomClicked?.Invoke(room));
        }

        /// <summary>
        /// Sets the room data
        /// </summary>
        /// <param name="room">Room data</param>
        public void SetRoom(GameRoom room)
        {
            this.room = room;
            UpdateUI();
        }

        /// <summary>
        /// Updates the room data
        /// </summary>
        /// <param name="room">Room data</param>
        public void UpdateRoom(GameRoom room)
        {
            this.room = room;
            UpdateUI();
        }

        /// <summary>
        /// Updates the UI with room data
        /// </summary>
        private void UpdateUI()
        {
            if (room == null) return;

            roomNameText.text = room.name;
            gameTypeText.text = char.ToUpper(room.gameType[0]) + room.gameType.Substring(1);
            playerCountText.text = $"{room.players.Count}/{room.maxPlayers}";
            entryFeeText.text = room.entryFee > 0 ? $"{room.entryFee} Coins" : "Free";
            lockIcon.gameObject.SetActive(room.isPrivate);

            // Disable join button if room is full or game has started
            joinButton.interactable = room.players.Count < room.maxPlayers && !room.isStarted;
        }
    }
}