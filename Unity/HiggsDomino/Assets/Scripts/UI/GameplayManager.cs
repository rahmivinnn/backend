using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using HiggsDomino.Game;
using HiggsDomino.Network;

namespace HiggsDomino.UI
{
    /// <summary>
    /// Manages the gameplay UI
    /// </summary>
    public class GameplayManager : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private GameObject gameplayPanel;
        [SerializeField] private Text roomNameText;
        [SerializeField] private Text roundText;
        [SerializeField] private Text timerText;
        [SerializeField] private GameObject gameBoard;
        [SerializeField] private GameObject playerHandsContainer;
        [SerializeField] private GameObject playerInfoContainer;
        [SerializeField] private GameObject playerInfoPrefab;
        [SerializeField] private GameObject dominoTilePrefab;
        [SerializeField] private Button drawTileButton;
        [SerializeField] private Button skipTurnButton;
        [SerializeField] private Button chatButton;
        [SerializeField] private GameObject chatPanel;
        [SerializeField] private InputField chatInput;
        [SerializeField] private GameObject chatMessagesContent;
        [SerializeField] private GameObject chatMessagePrefab;

        [Header("Game Board")]
        [SerializeField] private Transform boardCenter;
        [SerializeField] private float tileSpacing = 1.2f;
        [SerializeField] private float tileScale = 0.8f;

        private NetworkManager networkManager;
        private GameManager gameManager;
        private UIManager uiManager;
        private GameRoom currentRoom;
        private Dictionary<string, GameObject> playerInfoItems = new Dictionary<string, GameObject>();
        private List<GameObject> boardTiles = new List<GameObject>();
        private List<GameObject> handTiles = new List<GameObject>();
        private float turnTimer = 0f;
        private float maxTurnTime = 30f;
        private bool isMyTurn = false;

        private void Awake()
        {
            networkManager = FindObjectOfType<NetworkManager>();
            gameManager = FindObjectOfType<GameManager>();
            uiManager = FindObjectOfType<UIManager>();

            // Initialize UI
            drawTileButton.onClick.AddListener(DrawTile);
            skipTurnButton.onClick.AddListener(SkipTurn);
            chatButton.onClick.AddListener(ToggleChatPanel);
            chatInput.onEndEdit.AddListener(SendChatMessage);
        }

        private void OnEnable()
        {
            // Subscribe to events
            if (networkManager != null)
            {
                networkManager.OnGameUpdated += UpdateGame;
                networkManager.OnTurnChanged += UpdateTurn;
                networkManager.OnTilePlayed += OnTilePlayed;
                networkManager.OnTileDrawn += OnTileDrawn;
                networkManager.OnChatMessageReceived += AddChatMessage;
            }
        }

        private void OnDisable()
        {
            // Unsubscribe from events
            if (networkManager != null)
            {
                networkManager.OnGameUpdated -= UpdateGame;
                networkManager.OnTurnChanged -= UpdateTurn;
                networkManager.OnTilePlayed -= OnTilePlayed;
                networkManager.OnTileDrawn -= OnTileDrawn;
                networkManager.OnChatMessageReceived -= AddChatMessage;
            }
        }

        private void Update()
        {
            // Update turn timer
            if (isMyTurn && turnTimer > 0)
            {
                turnTimer -= Time.deltaTime;
                if (turnTimer <= 0)
                {
                    turnTimer = 0;
                    // Auto-skip turn if time runs out
                    SkipTurn();
                }
                UpdateTimerText();
            }
        }

        /// <summary>
        /// Updates the timer text
        /// </summary>
        private void UpdateTimerText()
        {
            int seconds = Mathf.CeilToInt(turnTimer);
            timerText.text = seconds.ToString();
            timerText.color = seconds <= 5 ? Color.red : Color.white;
        }

        /// <summary>
        /// Updates the game information
        /// </summary>
        /// <param name="room">Room data</param>
        public void UpdateGame(GameRoom room)
        {
            currentRoom = room;
            UpdateGameInfo();
            UpdatePlayerInfo();
            UpdateBoard();
            UpdateHand();
        }

        /// <summary>
        /// Updates the game information UI
        /// </summary>
        private void UpdateGameInfo()
        {
            if (currentRoom == null) return;

            roomNameText.text = currentRoom.name;
            roundText.text = $"Round {currentRoom.currentRound}/{currentRoom.maxRounds}";
        }

        /// <summary>
        /// Updates the player information UI
        /// </summary>
        private void UpdatePlayerInfo()
        {
            if (currentRoom == null) return;

            // Clear existing player info items that are no longer in the room
            List<string> playerIdsToRemove = new List<string>();
            foreach (var playerId in playerInfoItems.Keys)
            {
                if (!currentRoom.players.Exists(p => p.id == playerId))
                {
                    playerIdsToRemove.Add(playerId);
                }
            }

            foreach (var playerId in playerIdsToRemove)
            {
                Destroy(playerInfoItems[playerId]);
                playerInfoItems.Remove(playerId);
            }

            // Update or add player info items
            foreach (var player in currentRoom.players)
            {
                if (playerInfoItems.ContainsKey(player.id))
                {
                    // Update existing player info item
                    GameplayPlayerInfo playerInfo = playerInfoItems[player.id].GetComponent<GameplayPlayerInfo>();
                    if (playerInfo != null)
                    {
                        playerInfo.UpdatePlayer(player, player.id == currentRoom.currentTurnPlayerId);
                    }
                }
                else
                {
                    // Create new player info item
                    GameObject playerInfoObj = Instantiate(playerInfoPrefab, playerInfoContainer.transform);
                    GameplayPlayerInfo playerInfo = playerInfoObj.GetComponent<GameplayPlayerInfo>();
                    if (playerInfo != null)
                    {
                        playerInfo.SetPlayer(player, player.id == currentRoom.currentTurnPlayerId);
                    }
                    playerInfoItems[player.id] = playerInfoObj;
                }
            }
        }

        /// <summary>
        /// Updates the game board UI
        /// </summary>
        private void UpdateBoard()
        {
            if (currentRoom == null || gameManager.GameBoard == null) return;

            // Clear existing board tiles
            foreach (var tile in boardTiles)
            {
                Destroy(tile);
            }
            boardTiles.Clear();

            // Add tiles to the board
            List<DominoTile> boardTilesList = gameManager.GameBoard.GetBoardTiles();
            foreach (var tile in boardTilesList)
            {
                AddTileToBoard(tile);
            }
        }

        /// <summary>
        /// Adds a tile to the game board
        /// </summary>
        /// <param name="tile">Tile to add</param>
        private void AddTileToBoard(DominoTile tile)
        {
            if (tile == null) return;

            GameObject tileObj = Instantiate(dominoTilePrefab, gameBoard.transform);
            DominoTileUI tileUI = tileObj.GetComponent<DominoTileUI>();
            if (tileUI != null)
            {
                tileUI.SetTile(tile);
                tileUI.SetPosition(gameManager.GameBoard.GetTilePosition(tile.id));
                tileUI.SetRotation(gameManager.GameBoard.GetTileRotation(tile.id));
                tileUI.SetScale(tileScale);
                tileUI.SetInteractable(false);
            }
            boardTiles.Add(tileObj);
        }

        /// <summary>
        /// Updates the player's hand UI
        /// </summary>
        private void UpdateHand()
        {
            if (currentRoom == null) return;

            // Clear existing hand tiles
            foreach (var tile in handTiles)
            {
                Destroy(tile);
            }
            handTiles.Clear();

            // Get current player
            PlayerInfo currentPlayer = currentRoom.players.Find(p => p.id == networkManager.GetPlayerId());
            if (currentPlayer == null) return;

            // Add tiles to the hand
            float handWidth = playerHandsContainer.GetComponent<RectTransform>().rect.width;
            float tileWidth = 100f * tileScale; // Adjust based on your tile prefab size
            float spacing = 10f;
            float totalWidth = (currentPlayer.tiles.Count * tileWidth) + ((currentPlayer.tiles.Count - 1) * spacing);
            float startX = -totalWidth / 2f;

            for (int i = 0; i < currentPlayer.tiles.Count; i++)
            {
                DominoTile tile = currentPlayer.tiles[i];
                GameObject tileObj = Instantiate(dominoTilePrefab, playerHandsContainer.transform);
                DominoTileUI tileUI = tileObj.GetComponent<DominoTileUI>();
                if (tileUI != null)
                {
                    tileUI.SetTile(tile);
                    tileUI.SetLocalPosition(new Vector3(startX + (i * (tileWidth + spacing)), 0f, 0f));
                    tileUI.SetScale(tileScale);
                    tileUI.SetInteractable(isMyTurn);
                    tileUI.OnTileClicked += PlayTile;
                }
                handTiles.Add(tileObj);
            }
        }

        /// <summary>
        /// Updates the current turn
        /// </summary>
        /// <param name="playerId">Current player ID</param>
        /// <param name="timeRemaining">Time remaining for the turn</param>
        public void UpdateTurn(string playerId, float timeRemaining)
        {
            if (currentRoom == null) return;

            // Update current turn player
            currentRoom.currentTurnPlayerId = playerId;
            isMyTurn = playerId == networkManager.GetPlayerId();

            // Update turn timer
            turnTimer = timeRemaining;
            maxTurnTime = timeRemaining;
            UpdateTimerText();

            // Update player info to show current turn
            foreach (var player in currentRoom.players)
            {
                if (playerInfoItems.ContainsKey(player.id))
                {
                    GameplayPlayerInfo playerInfo = playerInfoItems[player.id].GetComponent<GameplayPlayerInfo>();
                    if (playerInfo != null)
                    {
                        playerInfo.SetIsCurrentTurn(player.id == playerId);
                    }
                }
            }

            // Update hand tiles interactability
            foreach (var tileObj in handTiles)
            {
                DominoTileUI tileUI = tileObj.GetComponent<DominoTileUI>();
                if (tileUI != null)
                {
                    tileUI.SetInteractable(isMyTurn);
                }
            }

            // Update buttons
            drawTileButton.interactable = isMyTurn;
            skipTurnButton.interactable = isMyTurn;
        }

        /// <summary>
        /// Plays a tile on the board
        /// </summary>
        /// <param name="tile">Tile to play</param>
        public void PlayTile(DominoTile tile)
        {
            if (!isMyTurn || tile == null) return;

            // Check if the tile can be played
            if (gameManager.GameBoard.CanPlayTile(tile))
            {
                // Send play tile request to server
                networkManager.PlayTile(currentRoom.id, tile.id);
            }
            else
            {
                uiManager.ShowNotification("Cannot play this tile");
            }
        }

        /// <summary>
        /// Handles a tile being played
        /// </summary>
        /// <param name="playerId">Player ID</param>
        /// <param name="tileId">Tile ID</param>
        /// <param name="position">Position on the board</param>
        /// <param name="rotation">Rotation on the board</param>
        public void OnTilePlayed(string playerId, string tileId, Vector2 position, float rotation)
        {
            // Update the game state
            gameManager.OnTilePlayed(playerId, tileId, position, rotation);

            // Update the UI
            UpdateBoard();
            UpdateHand();

            // Check if the game is over
            CheckGameOver();
        }

        /// <summary>
        /// Draws a tile from the draw pile
        /// </summary>
        public void DrawTile()
        {
            if (!isMyTurn) return;

            // Send draw tile request to server
            networkManager.DrawTile(currentRoom.id);
        }

        /// <summary>
        /// Handles a tile being drawn
        /// </summary>
        /// <param name="playerId">Player ID</param>
        /// <param name="tile">Drawn tile</param>
        public void OnTileDrawn(string playerId, DominoTile tile)
        {
            // Update the game state
            gameManager.OnTileDrawn(playerId, tile);

            // Update the UI
            UpdateHand();

            // If it's the current player and no valid moves, automatically skip turn
            if (playerId == networkManager.GetPlayerId() && !gameManager.GameBoard.HasValidMove(gameManager.GetPlayerTiles()))
            {
                SkipTurn();
            }
        }

        /// <summary>
        /// Skips the current turn
        /// </summary>
        public void SkipTurn()
        {
            if (!isMyTurn) return;

            // Send skip turn request to server
            networkManager.SkipTurn(currentRoom.id);
        }

        /// <summary>
        /// Checks if the game is over
        /// </summary>
        private void CheckGameOver()
        {
            if (currentRoom == null) return;

            // Check if any player has no tiles left
            foreach (var player in currentRoom.players)
            {
                if (player.tiles.Count == 0)
                {
                    // Game over, player has won
                    GameResult result = new GameResult
                    {
                        gameId = currentRoom.id,
                        winnerId = player.id,
                        endTime = System.DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                    };

                    // Add players to result
                    foreach (var p in currentRoom.players)
                    {
                        result.AddPlayer(p);
                    }

                    // Set winner
                    result.SetWinner(player.id);

                    // Show game over screen
                    uiManager.ShowGameOver(result);
                    return;
                }
            }

            // Check if the game is blocked (no player can make a move)
            bool isBlocked = true;
            foreach (var player in currentRoom.players)
            {
                if (gameManager.GameBoard.HasValidMove(player.tiles))
                {
                    isBlocked = false;
                    break;
                }
            }

            if (isBlocked)
            {
                // Game over, blocked game
                GameResult result = new GameResult
                {
                    gameId = currentRoom.id,
                    endTime = System.DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                };

                // Add players to result
                foreach (var player in currentRoom.players)
                {
                    result.AddPlayer(player);
                }

                // Find player with lowest hand value
                string lowestHandValuePlayerId = null;
                int lowestHandValue = int.MaxValue;
                foreach (var player in currentRoom.players)
                {
                    int handValue = player.CalculateHandValue();
                    if (handValue < lowestHandValue)
                    {
                        lowestHandValue = handValue;
                        lowestHandValuePlayerId = player.id;
                    }
                }

                // Set winner
                if (lowestHandValuePlayerId != null)
                {
                    result.SetWinner(lowestHandValuePlayerId);
                }

                // Show game over screen
                uiManager.ShowGameOver(result);
            }
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
        /// Shows the gameplay panel
        /// </summary>
        public void Show()
        {
            gameplayPanel.SetActive(true);
            chatPanel.SetActive(false);
        }

        /// <summary>
        /// Hides the gameplay panel
        /// </summary>
        public void Hide()
        {
            gameplayPanel.SetActive(false);
            chatPanel.SetActive(false);
        }
    }

    /// <summary>
    /// Represents a player info item in the gameplay UI
    /// </summary>
    public class GameplayPlayerInfo : MonoBehaviour
    {
        [SerializeField] private Text playerNameText;
        [SerializeField] private Text tileCountText;
        [SerializeField] private Image playerAvatarImage;
        [SerializeField] private Image turnIndicator;

        private PlayerInfo player;

        /// <summary>
        /// Sets the player data
        /// </summary>
        /// <param name="player">Player data</param>
        /// <param name="isCurrentTurn">Whether it's the player's turn</param>
        public void SetPlayer(PlayerInfo player, bool isCurrentTurn)
        {
            this.player = player;
            UpdateUI();
            SetIsCurrentTurn(isCurrentTurn);
        }

        /// <summary>
        /// Updates the player data
        /// </summary>
        /// <param name="player">Player data</param>
        /// <param name="isCurrentTurn">Whether it's the player's turn</param>
        public void UpdatePlayer(PlayerInfo player, bool isCurrentTurn)
        {
            this.player = player;
            UpdateUI();
            SetIsCurrentTurn(isCurrentTurn);
        }

        /// <summary>
        /// Updates the UI with player data
        /// </summary>
        private void UpdateUI()
        {
            if (player == null) return;

            playerNameText.text = player.username;
            tileCountText.text = player.tiles.Count.ToString();

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

        /// <summary>
        /// Sets whether it's the player's turn
        /// </summary>
        /// <param name="isCurrentTurn">Whether it's the player's turn</param>
        public void SetIsCurrentTurn(bool isCurrentTurn)
        {
            turnIndicator.gameObject.SetActive(isCurrentTurn);
        }
    }
}