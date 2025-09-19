using UnityEngine;
using UnityEngine.UI;

namespace HiggsDomino.UI
{
    /// <summary>
    /// Represents a chat message in the UI
    /// </summary>
    public class ChatMessage : MonoBehaviour
    {
        [SerializeField] private Text senderNameText;
        [SerializeField] private Text messageText;
        [SerializeField] private Image backgroundImage;

        private string senderId;
        private string senderName;
        private string message;
        private bool isLocalPlayer;

        /// <summary>
        /// Sets the message data
        /// </summary>
        /// <param name="senderId">Sender ID</param>
        /// <param name="senderName">Sender name</param>
        /// <param name="message">Message text</param>
        public void SetMessage(string senderId, string senderName, string message)
        {
            this.senderId = senderId;
            this.senderName = senderName;
            this.message = message;

            // Check if the message is from the local player
            NetworkManager networkManager = FindObjectOfType<NetworkManager>();
            isLocalPlayer = networkManager != null && senderId == networkManager.GetPlayerId();

            UpdateUI();
        }

        /// <summary>
        /// Updates the UI with message data
        /// </summary>
        private void UpdateUI()
        {
            senderNameText.text = senderName;
            messageText.text = message;

            // Style based on sender (local player or other)
            if (isLocalPlayer)
            {
                // Local player message style
                backgroundImage.color = new Color(0.2f, 0.6f, 1f, 0.7f);
                senderNameText.color = Color.white;
                messageText.color = Color.white;
            }
            else
            {
                // Other player message style
                backgroundImage.color = new Color(0.9f, 0.9f, 0.9f, 0.7f);
                senderNameText.color = Color.black;
                messageText.color = Color.black;
            }

            // Adjust size based on content
            LayoutRebuilder.ForceRebuildLayoutImmediate(GetComponent<RectTransform>());
        }
    }
}