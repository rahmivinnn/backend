using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using System;
using HiggsDomino.Network;

namespace HiggsDomino.Game
{
    /// <summary>
    /// Manages player data and profile information for the Higgs Domino game
    /// </summary>
    public class PlayerDataManager : MonoBehaviour
    {
        #region Singleton
        public static PlayerDataManager Instance { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
            LoadUserData();
        }
        #endregion

        [Header("Player Data")]
        private string currentUserId;
        private string username;
        private string email;
        private int coins;
        private int diamonds;
        private int vipLevel;
        private string avatarUrl;
        private int experience;
        private int level;
        private List<string> achievements;
        private Dictionary<string, int> statistics;

        // Public properties
        public string CurrentUserId { get => currentUserId; private set => currentUserId = value; }
        public string Username { get => username; private set => username = value; }
        public string Email { get => email; private set => email = value; }
        public int Coins { get => coins; private set => coins = value; }
        public int Diamonds { get => diamonds; private set => diamonds = value; }
        public int VipLevel { get => vipLevel; private set => vipLevel = value; }
        public string AvatarUrl { get => avatarUrl; private set => avatarUrl = value; }
        public int Experience { get => experience; private set => experience = value; }
        public int Level { get => level; private set => level = value; }

        // Events
        public event Action OnPlayerDataUpdated;
        public event Action<int> OnCoinsUpdated;
        public event Action<int> OnDiamondsUpdated;
        public event Action<int> OnExperienceUpdated;
        public event Action<int> OnLevelUpdated;

        /// <summary>
        /// Loads user data from local storage or server
        /// </summary>
        private void LoadUserData()
        {
            // First try to load from PlayerPrefs
            currentUserId = HiggsDomino.Utils.PlayerPrefsManager.GetUserId();
            
            // If we have a valid user ID and auth token, fetch the latest data from server
            if (!string.IsNullOrEmpty(currentUserId) && !string.IsNullOrEmpty(HiggsDomino.Utils.PlayerPrefsManager.GetAuthToken()))
            {
                FetchUserDataFromServer();
            }
        }

        /// <summary>
        /// Fetches the latest user data from the server
        /// </summary>
        public async void FetchUserDataFromServer()
        {
            try
            {
                // Use NetworkManager to get user data
                var userData = await NetworkManager.Instance.GetUserData();
                if (userData != null)
                {
                    UpdateUserData(userData);
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error fetching user data: {ex.Message}");
            }
        }
        
        /// <summary>
        /// Loads player data with callback support
        /// </summary>
        /// <param name="onComplete">Callback to execute when data loading is complete</param>
        public void LoadPlayerData(Action onComplete = null)
        {
            try
            {
                // Use NetworkManager to get user data
                NetworkManager.Instance.GetUserData((userData, errorMessage) => {
                    if (userData != null)
                    {
                        UpdateUserData(userData);
                        onComplete?.Invoke();
                    }
                    else
                    {
                        Debug.LogError($"Error loading player data: {errorMessage}");
                        onComplete?.Invoke();
                    }
                });
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error in LoadPlayerData: {ex.Message}");
                onComplete?.Invoke();
            }
        }

        /// <summary>
        /// Updates the user data with the provided data
        /// </summary>
        /// <param name="userData">The user data to update with</param>
        public void UpdateUserData(UserData userData)
        {
            currentUserId = userData.id;
            username = userData.username;
            email = userData.email;
            coins = userData.coins;
            diamonds = userData.diamonds;
            vipLevel = userData.vipLevel;
            avatarUrl = userData.avatarUrl;
            
            // Save the user ID to PlayerPrefs
            HiggsDomino.Utils.PlayerPrefsManager.SaveUserId(currentUserId);
            
            // Notify listeners that player data has been updated
            OnPlayerDataUpdated?.Invoke();
        }

        /// <summary>
        /// Updates the player's coins
        /// </summary>
        /// <param name="amount">The new amount of coins</param>
        public void UpdateCoins(int amount)
        {
            coins = amount;
            OnCoinsUpdated?.Invoke(coins);
            OnPlayerDataUpdated?.Invoke();
        }

        /// <summary>
        /// Updates the player's diamonds
        /// </summary>
        /// <param name="amount">The new amount of diamonds</param>
        public void UpdateDiamonds(int amount)
        {
            diamonds = amount;
            OnDiamondsUpdated?.Invoke(diamonds);
            OnPlayerDataUpdated?.Invoke();
        }

        /// <summary>
        /// Updates the player's experience and level
        /// </summary>
        /// <param name="newExperience">The new amount of experience</param>
        /// <param name="newLevel">The new level</param>
        public void UpdateExperienceAndLevel(int newExperience, int newLevel)
        {
            experience = newExperience;
            level = newLevel;
            
            OnExperienceUpdated?.Invoke(experience);
            OnLevelUpdated?.Invoke(level);
            OnPlayerDataUpdated?.Invoke();
        }

        /// <summary>
        /// Clears all player data (used for logout)
        /// </summary>
        public void ClearPlayerData()
        {
            currentUserId = string.Empty;
            username = string.Empty;
            email = string.Empty;
            coins = 0;
            diamonds = 0;
            vipLevel = 0;
            avatarUrl = string.Empty;
            experience = 0;
            level = 0;
            
            // Clear the user ID from PlayerPrefs
            HiggsDomino.Utils.PlayerPrefsManager.ClearUserId();
            
            // Notify listeners that player data has been updated
            OnPlayerDataUpdated?.Invoke();
        }
    }
}