using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using HiggsDomino.Game;
using HiggsDomino.Network;

namespace HiggsDomino.UI
{
    /// <summary>
    /// Manages the game over UI
    /// </summary>
    public class GameOverManager : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private GameObject gameOverPanel;
        [SerializeField] private Text gameOverTitleText;
        [SerializeField] private GameObject resultsContainer;
        [SerializeField] private GameObject playerResultPrefab;
        [SerializeField] private Button playAgainButton;
        [SerializeField] private Button exitToLobbyButton;
        [SerializeField] private Button shareResultButton;

        private NetworkManager networkManager;
        private GameManager gameManager;
        private UIManager uiManager;
        private GameResult gameResult;
        private List<GameObject> playerResultItems = new List<GameObject>();

        private void Awake()
        {
            networkManager = FindObjectOfType<NetworkManager>();
            gameManager = FindObjectOfType<GameManager>();
            uiManager = FindObjectOfType<UIManager>();

            // Initialize UI
            playAgainButton.onClick.AddListener(PlayAgain);
            exitToLobbyButton.onClick.AddListener(ExitToLobby);
            shareResultButton.onClick.AddListener(ShareResult);
        }

        /// <summary>
        /// Shows the game over screen with the given result
        /// </summary>
        /// <param name="result">Game result</param>
        public void ShowGameOver(GameResult result)
        {
            gameResult = result;
            UpdateUI();
            gameOverPanel.SetActive(true);
        }

        /// <summary>
        /// Updates the UI with game result data
        /// </summary>
        private void UpdateUI()
        {
            if (gameResult == null) return;

            // Set title based on whether the local player won
            bool isLocalPlayerWinner = gameResult.winnerId == networkManager.GetPlayerId();
            gameOverTitleText.text = isLocalPlayerWinner ? "You Win!" : "Game Over";
            gameOverTitleText.color = isLocalPlayerWinner ? Color.green : Color.white;

            // Clear existing player result items
            foreach (var item in playerResultItems)
            {
                Destroy(item);
            }
            playerResultItems.Clear();

            // Sort players by score (highest first)
            List<PlayerInfo> sortedPlayers = new List<PlayerInfo>(gameResult.players);
            sortedPlayers.Sort((a, b) => b.score.CompareTo(a.score));

            // Add player result items
            foreach (var player in sortedPlayers)
            {
                GameObject resultItem = Instantiate(playerResultPrefab, resultsContainer.transform);
                PlayerResultItem playerResult = resultItem.GetComponent<PlayerResultItem>();
                if (playerResult != null)
                {
                    bool isWinner = player.id == gameResult.winnerId;
                    int reward = CalculateReward(player, isWinner);
                    playerResult.SetPlayerResult(player, isWinner, reward);
                }
                playerResultItems.Add(resultItem);
            }

            // Show/hide play again button based on whether the player is the host
            string hostId = gameManager.GetCurrentRoom()?.hostId;
            playAgainButton.gameObject.SetActive(hostId == networkManager.GetPlayerId());
        }

        /// <summary>
        /// Calculates the reward for a player
        /// </summary>
        /// <param name="player">Player data</param>
        /// <param name="isWinner">Whether the player is the winner</param>
        /// <returns>Reward amount</returns>
        private int CalculateReward(PlayerInfo player, bool isWinner)
        {
            if (gameResult == null || gameManager.GetCurrentRoom() == null) return 0;

            int baseReward = gameManager.GetCurrentRoom().entryFee;
            int playerCount = gameResult.players.Count;
            
            if (isWinner)
            {
                // Winner gets the pot minus a small platform fee
                return (int)(baseReward * playerCount * 0.9f);
            }
            else
            {
                // Losers get a small consolation prize based on their score
                float scoreRatio = (float)player.score / 100f; // Normalize score
                return (int)(baseReward * 0.2f * scoreRatio);
            }
        }

        /// <summary>
        /// Starts a new game with the same players
        /// </summary>
        public void PlayAgain()
        {
            if (gameManager.GetCurrentRoom() == null) return;

            // Reset the room and start a new game
            networkManager.ResetRoom(gameManager.GetCurrentRoom().id);
        }

        /// <summary>
        /// Exits to the lobby
        /// </summary>
        public void ExitToLobby()
        {
            if (gameManager.GetCurrentRoom() == null) return;

            // Leave the room
            networkManager.LeaveRoom(gameManager.GetCurrentRoom().id);

            // Show the lobby
            uiManager.ShowLobby();
            Hide();
        }

        /// <summary>
        /// Shares the game result on social media
        /// </summary>
        public void ShareResult()
        {
            if (gameResult == null) return;

            // Create share message
            string shareMessage = "I just played Higgs Domino!\n";
            bool isLocalPlayerWinner = gameResult.winnerId == networkManager.GetPlayerId();
            if (isLocalPlayerWinner)
            {
                shareMessage += "I won the game with a score of " + gameResult.players.Find(p => p.id == networkManager.GetPlayerId())?.score + "!\n";
            }
            else
            {
                shareMessage += "I scored " + gameResult.players.Find(p => p.id == networkManager.GetPlayerId())?.score + " points!\n";
            }
            shareMessage += "Play Higgs Domino now and challenge me!";

            // Share on social media (implementation depends on your sharing system)
            Debug.Log("Sharing result: " + shareMessage);

            // Example native sharing on mobile
#if UNITY_ANDROID || UNITY_IOS
            NativeShare share = new NativeShare();
            share.SetText(shareMessage);
            share.SetTitle("Higgs Domino Game Result");
            share.Share();
#endif

            // Show notification
            uiManager.ShowNotification("Result shared!");
        }

        /// <summary>
        /// Shows the game over panel
        /// </summary>
        public void Show()
        {
            gameOverPanel.SetActive(true);
        }

        /// <summary>
        /// Hides the game over panel
        /// </summary>
        public void Hide()
        {
            gameOverPanel.SetActive(false);
        }
    }
}