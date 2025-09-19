using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System;
using HiggsDomino.Game;

namespace HiggsDomino.UI
{
    /// <summary>
    /// Manages all UI elements and screens in the game
    /// </summary>
    public class UIManager : MonoBehaviour
    {
        #region Singleton
        public static UIManager Instance { get; private set; }

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

        [Header("UI Screens")]
        [SerializeField] private GameObject loginScreen;
        [SerializeField] private GameObject registerScreen;
        [SerializeField] private GameObject lobbyScreen;
        [SerializeField] private GameObject roomScreen;
        [SerializeField] private GameObject gameplayScreen;
        [SerializeField] private GameObject gameOverScreen;
        [SerializeField] private GameObject profileScreen;
        [SerializeField] private GameObject shopScreen;
        [SerializeField] private GameObject settingsScreen;
        [SerializeField] private GameObject loadingScreen;

        [Header("Notification")]
        [SerializeField] private GameObject notificationPanel;
        [SerializeField] private TextMeshProUGUI notificationText;
        [SerializeField] private float notificationDuration = 3f;
        [SerializeField] private Color infoColor = Color.white;
        [SerializeField] private Color successColor = Color.green;
        [SerializeField] private Color warningColor = Color.yellow;
        [SerializeField] private Color errorColor = Color.red;

        [Header("Login Screen")]
        [SerializeField] private TMP_InputField loginUsernameInput;
        [SerializeField] private TMP_InputField loginPasswordInput;
        [SerializeField] private Button loginButton;
        [SerializeField] private Button goToRegisterButton;

        [Header("Register Screen")]
        [SerializeField] private TMP_InputField registerUsernameInput;
        [SerializeField] private TMP_InputField registerEmailInput;
        [SerializeField] private TMP_InputField registerPasswordInput;
        [SerializeField] private TMP_InputField registerConfirmPasswordInput;
        [SerializeField] private Button registerButton;
        [SerializeField] private Button goToLoginButton;

        [Header("Lobby Screen")]
        [SerializeField] private Button createRoomButton;
        [SerializeField] private Button joinRoomButton;
        [SerializeField] private Button profileButton;
        [SerializeField] private Button shopButton;
        [SerializeField] private Button settingsButton;
        [SerializeField] private Button logoutButton;
        [SerializeField] private Transform roomListContent;
        [SerializeField] private GameObject roomItemPrefab;

        [Header("Room Screen")]
        [SerializeField] private TextMeshProUGUI roomNameText;
        [SerializeField] private TextMeshProUGUI roomIdText;
        [SerializeField] private TextMeshProUGUI playerCountText;
        [SerializeField] private Transform playerListContent;
        [SerializeField] private GameObject playerItemPrefab;
        [SerializeField] private Button startGameButton;
        [SerializeField] private Button leaveRoomButton;

        [Header("Gameplay Screen")]
        [SerializeField] private Transform playerHandContent;
        [SerializeField] private Transform gameBoardContent;
        [SerializeField] private GameObject dominoTilePrefab;
        [SerializeField] private TextMeshProUGUI currentPlayerText;
        [SerializeField] private TextMeshProUGUI timerText;
        [SerializeField] private Button drawTileButton;
        [SerializeField] private Button skipTurnButton;

        [Header("Game Over Screen")]
        [SerializeField] private TextMeshProUGUI winnerText;
        [SerializeField] private Transform resultsContent;
        [SerializeField] private GameObject playerResultPrefab;
        [SerializeField] private Button playAgainButton;
        [SerializeField] private Button returnToLobbyButton;
        
        [Header("Profile Screen")]
        [SerializeField] private TextMeshProUGUI usernameText;
        [SerializeField] private TextMeshProUGUI emailText;
        [SerializeField] private TextMeshProUGUI levelText;
        [SerializeField] private TextMeshProUGUI coinsText;
        [SerializeField] private TextMeshProUGUI diamondsText;
        [SerializeField] private TextMeshProUGUI vipLevelText;
        [SerializeField] private Image avatarImage;
        [SerializeField] private Button backFromProfileButton;

        // Private variables
        private List<GameObject> activeScreens = new List<GameObject>();
        private Coroutine notificationCoroutine;

        private void Start()
        {
            // Initialize UI elements
            InitializeUI();
            
            // Show login screen by default
            ShowLoginScreen();
        }
        
        private void OnDestroy()
        {
            // Unsubscribe from PlayerDataManager events
            if (PlayerDataManager.Instance != null)
            {
                PlayerDataManager.Instance.OnPlayerDataUpdated -= UpdateProfileInfo;
            }
        }

        /// <summary>
        /// Initializes all UI elements and adds event listeners
        /// </summary>
        private void InitializeUI()
        {
            // Login Screen
            loginButton.onClick.AddListener(OnLoginButtonClicked);
            goToRegisterButton.onClick.AddListener(ShowRegisterScreen);

            // Register Screen
            registerButton.onClick.AddListener(OnRegisterButtonClicked);
            goToLoginButton.onClick.AddListener(ShowLoginScreen);

            // Lobby Screen
            createRoomButton.onClick.AddListener(OnCreateRoomButtonClicked);
            joinRoomButton.onClick.AddListener(OnJoinRoomButtonClicked);
            profileButton.onClick.AddListener(ShowProfileScreen);
            shopButton.onClick.AddListener(ShowShopScreen);
            settingsButton.onClick.AddListener(ShowSettingsScreen);
            logoutButton.onClick.AddListener(OnLogoutButtonClicked);

            // Room Screen
            startGameButton.onClick.AddListener(OnStartGameButtonClicked);
            leaveRoomButton.onClick.AddListener(OnLeaveRoomButtonClicked);

            // Gameplay Screen
            drawTileButton.onClick.AddListener(OnDrawTileButtonClicked);
            skipTurnButton.onClick.AddListener(OnSkipTurnButtonClicked);

            // Game Over Screen
            playAgainButton.onClick.AddListener(OnPlayAgainButtonClicked);
            returnToLobbyButton.onClick.AddListener(OnReturnToLobbyButtonClicked);
            
            // Profile Screen
            backFromProfileButton.onClick.AddListener(ShowLobbyUI);
            
            // Subscribe to PlayerDataManager events
            if (PlayerDataManager.Instance != null)
            {
                PlayerDataManager.Instance.OnPlayerDataUpdated += UpdateProfileInfo;
            }

            // Hide all screens initially
            HideAllScreens();
        }

        /// <summary>
        /// Hides all UI screens
        /// </summary>
        private void HideAllScreens()
        {
            loginScreen.SetActive(false);
            registerScreen.SetActive(false);
            lobbyScreen.SetActive(false);
            roomScreen.SetActive(false);
            gameplayScreen.SetActive(false);
            gameOverScreen.SetActive(false);
            profileScreen.SetActive(false);
            shopScreen.SetActive(false);
            settingsScreen.SetActive(false);
            loadingScreen.SetActive(false);
            
            activeScreens.Clear();
        }

        /// <summary>
        /// Shows a notification message
        /// </summary>
        /// <param name="message">Message to display</param>
        /// <param name="type">Type of notification</param>
        public void ShowNotification(string message, NotificationType type = NotificationType.Info)
        {
            if (notificationCoroutine != null)
            {
                StopCoroutine(notificationCoroutine);
            }

            notificationText.text = message;
            
            // Set color based on notification type
            switch (type)
            {
                case NotificationType.Info:
                    notificationText.color = infoColor;
                    break;
                case NotificationType.Success:
                    notificationText.color = successColor;
                    break;
                case NotificationType.Warning:
                    notificationText.color = warningColor;
                    break;
                case NotificationType.Error:
                    notificationText.color = errorColor;
                    break;
            }

            notificationPanel.SetActive(true);
            notificationCoroutine = StartCoroutine(HideNotificationAfterDelay());
        }

        /// <summary>
        /// Hides the notification after a delay
        /// </summary>
        private IEnumerator HideNotificationAfterDelay()
        {
            yield return new WaitForSeconds(notificationDuration);
            notificationPanel.SetActive(false);
            notificationCoroutine = null;
        }

        /// <summary>
        /// Shows the loading screen
        /// </summary>
        /// <param name="show">Whether to show or hide the loading screen</param>
        public void ShowLoadingScreen(bool show)
        {
            loadingScreen.SetActive(show);
        }

        #region Screen Management

        /// <summary>
        /// Shows the login screen
        /// </summary>
        public void ShowLoginScreen()
        {
            HideAllScreens();
            loginScreen.SetActive(true);
            activeScreens.Add(loginScreen);
        }

        /// <summary>
        /// Shows the register screen
        /// </summary>
        public void ShowRegisterScreen()
        {
            HideAllScreens();
            registerScreen.SetActive(true);
            activeScreens.Add(registerScreen);
        }

        /// <summary>
        /// Shows the lobby screen
        /// </summary>
        public void ShowLobbyUI()
        {
            HideAllScreens();
            lobbyScreen.SetActive(true);
            activeScreens.Add(lobbyScreen);
            
            // Refresh room list
            RefreshRoomList();
        }

        /// <summary>
        /// Shows the game room UI
        /// </summary>
        public void ShowGameRoomUI()
        {
            HideAllScreens();
            roomScreen.SetActive(true);
            activeScreens.Add(roomScreen);
            
            // Update room info
            UpdateRoomInfo();
        }

        /// <summary>
        /// Shows the gameplay UI
        /// </summary>
        public void ShowGameplayUI()
        {
            HideAllScreens();
            gameplayScreen.SetActive(true);
            activeScreens.Add(gameplayScreen);
            
            // Update game UI
            UpdateGameUI();
        }

        /// <summary>
        /// Shows the game over UI
        /// </summary>
        /// <param name="result">Game result data</param>
        public void ShowGameOverUI(GameResult result)
        {
            HideAllScreens();
            gameOverScreen.SetActive(true);
            activeScreens.Add(gameOverScreen);
            
            // Update game over UI with results
            UpdateGameOverUI(result);
        }

        /// <summary>
        /// Shows the profile screen
        /// </summary>
        public void ShowProfileScreen()
        {
            HideAllScreens();
            profileScreen.SetActive(true);
            activeScreens.Add(profileScreen);
            
            // Update profile info
            UpdateProfileInfo();
        }

        /// <summary>
        /// Shows the shop screen
        /// </summary>
        public void ShowShopScreen()
        {
            HideAllScreens();
            shopScreen.SetActive(true);
            activeScreens.Add(shopScreen);
        }

        /// <summary>
        /// Shows the settings screen
        /// </summary>
        public void ShowSettingsScreen()
        {
            HideAllScreens();
            settingsScreen.SetActive(true);
            activeScreens.Add(settingsScreen);
        }

        #endregion

        #region UI Updates

        /// <summary>
        /// Refreshes the room list in the lobby
        /// </summary>
        private void RefreshRoomList()
        {
            // Clear existing room items
            foreach (Transform child in roomListContent)
            {
                Destroy(child.gameObject);
            }

            // TODO: Get room list from server and populate
        }

        /// <summary>
        /// Updates the room information
        /// </summary>
        private void UpdateRoomInfo()
        {
            // TODO: Update room info from GameManager
        }

        /// <summary>
        /// Updates the game UI
        /// </summary>
        private void UpdateGameUI()
        {
            // TODO: Update game UI from GameManager
        }

        /// <summary>
        /// Updates the game over UI with results
        /// </summary>
        /// <param name="result">Game result data</param>
        private void UpdateGameOverUI(GameResult result)
        {
            // Clear existing result items
            foreach (Transform child in resultsContent)
            {
                Destroy(child.gameObject);
            }

            // Set winner text
            PlayerInfo winner = result.players.Find(p => p.id == result.winnerId);
            if (winner != null)
            {
                winnerText.text = $"{winner.username} Wins!";
            }

            // Add player results
            foreach (PlayerInfo player in result.players)
            {
                GameObject resultItem = Instantiate(playerResultPrefab, resultsContent);
                PlayerResultItem resultItemScript = resultItem.GetComponent<PlayerResultItem>();
                
                if (resultItemScript != null)
                {
                    int reward = 0;
                    if (result.rewards.ContainsKey(player.id))
                    {
                        reward = result.rewards[player.id];
                    }
                    
                    resultItemScript.SetPlayerResult(player, reward, player.id == result.winnerId);
                }
            }
        }

        /// <summary>
        /// Updates the profile information
        /// </summary>
        private void UpdateProfileInfo()
        {
            // Get data from PlayerDataManager
            if (PlayerDataManager.Instance != null)
            {
                // Update UI elements with player data
                usernameText.text = PlayerDataManager.Instance.Username;
                emailText.text = PlayerDataManager.Instance.Email;
                levelText.text = $"Level: {PlayerDataManager.Instance.Level}";
                coinsText.text = $"{PlayerDataManager.Instance.Coins:N0}";
                diamondsText.text = $"{PlayerDataManager.Instance.Diamonds:N0}";
                vipLevelText.text = $"VIP {PlayerDataManager.Instance.VipLevel}";
                
                // Load avatar image if available
                if (!string.IsNullOrEmpty(PlayerDataManager.Instance.AvatarUrl))
                {
                    // TODO: Load avatar image from URL or resources
                    // For now, we'll just use a placeholder
                }
            }
            else
            {
                Debug.LogError("PlayerDataManager instance is null");
            }
        }

        #endregion

        #region Button Event Handlers

        /// <summary>
        /// Handles login button click
        /// </summary>
        private void OnLoginButtonClicked()
        {
            string username = loginUsernameInput.text;
            string password = loginPasswordInput.text;

            if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
            {
                ShowNotification("Please enter username and password", NotificationType.Warning);
                return;
            }

            ShowLoadingScreen(true);
            
            // Call login method from NetworkManager
            NetworkManager.Instance.AuthenticateUser(username, password, (success, message) => {
                ShowLoadingScreen(false);
                
                if (success)
                {
                    // Load player data after successful login
                    PlayerDataManager.Instance.LoadPlayerData(() => {
                        ShowLobbyUI();
                        ShowNotification("Login successful", NotificationType.Success);
                    });
                }
                else
                {
                    ShowNotification(message, NotificationType.Error);
                }
            });
        }

        /// <summary>
        /// Handles register button click
        /// </summary>
        private void OnRegisterButtonClicked()
        {
            string username = registerUsernameInput.text;
            string email = registerEmailInput.text;
            string password = registerPasswordInput.text;
            string confirmPassword = registerConfirmPasswordInput.text;

            if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(email) || 
                string.IsNullOrEmpty(password) || string.IsNullOrEmpty(confirmPassword))
            {
                ShowNotification("Please fill in all fields", NotificationType.Warning);
                return;
            }

            if (password != confirmPassword)
            {
                ShowNotification("Passwords do not match", NotificationType.Warning);
                return;
            }

            ShowLoadingScreen(true);
            
            // Call register method from NetworkManager
            NetworkManager.Instance.RegisterUser(username, email, password, (success, message) => {
                ShowLoadingScreen(false);
                
                if (success)
                {
                    ShowLoginScreen();
                    ShowNotification("Registration successful. Please login.", NotificationType.Success);
                    
                    // Pre-fill login fields
                    loginUsernameInput.text = username;
                    loginPasswordInput.text = "";
                }
                else
                {
                    ShowNotification(message, NotificationType.Error);
                }
            });
        }

        /// <summary>
        /// Handles create room button click
        /// </summary>
        private void OnCreateRoomButtonClicked()
        {
            // TODO: Show create room dialog
        }

        /// <summary>
        /// Handles join room button click
        /// </summary>
        private void OnJoinRoomButtonClicked()
        {
            // TODO: Show join room dialog
        }

        /// <summary>
        /// Handles logout button click
        /// </summary>
        private void OnLogoutButtonClicked()
        {
            // Clear player data
            PlayerDataManager.Instance.ClearPlayerData();
            
            // Disconnect from WebSocket
            NetworkManager.Instance.DisconnectFromWebSocket();
            
            // Clear authentication token
            PlayerPrefsManager.ClearAuthToken();
            
            // Show login screen
            ShowLoginScreen();
            ShowNotification("Logged out successfully", NotificationType.Success);
        }

        /// <summary>
        /// Handles start game button click
        /// </summary>
        private void OnStartGameButtonClicked()
        {
            GameManager.Instance.StartGame();
        }

        /// <summary>
        /// Handles leave room button click
        /// </summary>
        private void OnLeaveRoomButtonClicked()
        {
            GameManager.Instance.LeaveRoom();
        }

        /// <summary>
        /// Handles draw tile button click
        /// </summary>
        private void OnDrawTileButtonClicked()
        {
            GameManager.Instance.DrawTile();
        }

        /// <summary>
        /// Handles skip turn button click
        /// </summary>
        private void OnSkipTurnButtonClicked()
        {
            GameManager.Instance.SkipTurn();
        }

        /// <summary>
        /// Handles play again button click
        /// </summary>
        private void OnPlayAgainButtonClicked()
        {
            GameManager.Instance.StartGame();
        }

        /// <summary>
        /// Handles return to lobby button click
        /// </summary>
        private void OnReturnToLobbyButtonClicked()
        {
            GameManager.Instance.LeaveRoom();
        }

        #endregion
    }

    /// <summary>
    /// Types of notifications
    /// </summary>
    public enum NotificationType
    {
        Info,
        Success,
        Warning,
        Error
    }
}