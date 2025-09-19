using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using HiggsDomino.Game;

namespace HiggsDomino.UI
{
    /// <summary>
    /// Represents a player result item in the game over screen
    /// </summary>
    public class PlayerResultItem : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI usernameText;
        [SerializeField] private TextMeshProUGUI scoreText;
        [SerializeField] private TextMeshProUGUI rewardText;
        [SerializeField] private GameObject winnerBadge;
        [SerializeField] private Image playerAvatar;
        [SerializeField] private Image backgroundPanel;
        [SerializeField] private Color winnerColor = new Color(1f, 0.92f, 0.016f, 0.5f);
        [SerializeField] private Color regularColor = new Color(0.5f, 0.5f, 0.5f, 0.5f);

        /// <summary>
        /// Sets the player result data
        /// </summary>
        /// <param name="player">Player information</param>
        /// <param name="reward">Reward amount</param>
        /// <param name="isWinner">Whether this player is the winner</param>
        public void SetPlayerResult(PlayerInfo player, int reward, bool isWinner)
        {
            // Set player info
            usernameText.text = player.username;
            scoreText.text = $"Score: {player.score}";
            rewardText.text = $"+{reward} Coins";
            
            // Show/hide winner badge
            winnerBadge.SetActive(isWinner);
            
            // Set background color
            backgroundPanel.color = isWinner ? winnerColor : regularColor;
            
            // Set avatar if available
            if (player.avatarId > 0)
            {
                // TODO: Load avatar from resources based on avatarId
                // playerAvatar.sprite = Resources.Load<Sprite>($"Avatars/{player.avatarId}");
            }
        }
    }
}