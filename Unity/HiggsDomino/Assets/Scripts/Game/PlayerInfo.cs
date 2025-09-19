using System;
using System.Collections.Generic;
using UnityEngine;

namespace HiggsDomino.Game
{
    /// <summary>
    /// Contains information about a player
    /// </summary>
    [Serializable]
    public class PlayerInfo
    {
        public string id;
        public string username;
        public int avatarId;
        public int level;
        public int experience;
        public int coins;
        public int gems;
        public int vipLevel;
        public int score;
        public bool isReady;
        public bool isOnline;
        public bool isCurrentPlayer;
        public List<DominoTile> hand = new List<DominoTile>();

        /// <summary>
        /// Creates a new player info instance
        /// </summary>
        public PlayerInfo()
        {
        }

        /// <summary>
        /// Creates a new player info instance with the specified ID and username
        /// </summary>
        /// <param name="id">Player ID</param>
        /// <param name="username">Player username</param>
        public PlayerInfo(string id, string username)
        {
            this.id = id;
            this.username = username;
            this.avatarId = 1; // Default avatar
            this.level = 1;
            this.experience = 0;
            this.coins = 1000; // Starting coins
            this.gems = 0;
            this.vipLevel = 0;
            this.score = 0;
            this.isReady = false;
            this.isOnline = true;
            this.isCurrentPlayer = false;
        }

        /// <summary>
        /// Creates a player info from JSON data
        /// </summary>
        /// <param name="json">JSON data</param>
        /// <returns>PlayerInfo instance</returns>
        public static PlayerInfo FromJson(string json)
        {
            return JsonUtility.FromJson<PlayerInfo>(json);
        }

        /// <summary>
        /// Converts the player info to JSON
        /// </summary>
        /// <returns>JSON string</returns>
        public string ToJson()
        {
            return JsonUtility.ToJson(this);
        }

        /// <summary>
        /// Adds a domino tile to the player's hand
        /// </summary>
        /// <param name="tile">Tile to add</param>
        public void AddTile(DominoTile tile)
        {
            hand.Add(tile);
        }

        /// <summary>
        /// Removes a domino tile from the player's hand
        /// </summary>
        /// <param name="tile">Tile to remove</param>
        /// <returns>True if the tile was removed, false otherwise</returns>
        public bool RemoveTile(DominoTile tile)
        {
            return hand.Remove(tile);
        }

        /// <summary>
        /// Gets the number of tiles in the player's hand
        /// </summary>
        /// <returns>Number of tiles</returns>
        public int GetTileCount()
        {
            return hand.Count;
        }

        /// <summary>
        /// Checks if the player has a tile with the specified values
        /// </summary>
        /// <param name="value1">First value</param>
        /// <param name="value2">Second value</param>
        /// <returns>True if the player has the tile, false otherwise</returns>
        public bool HasTile(int value1, int value2)
        {
            return hand.Exists(t => (t.value1 == value1 && t.value2 == value2) || (t.value1 == value2 && t.value2 == value1));
        }

        /// <summary>
        /// Gets a tile with the specified values
        /// </summary>
        /// <param name="value1">First value</param>
        /// <param name="value2">Second value</param>
        /// <returns>The tile, or null if not found</returns>
        public DominoTile GetTile(int value1, int value2)
        {
            return hand.Find(t => (t.value1 == value1 && t.value2 == value2) || (t.value1 == value2 && t.value2 == value1));
        }

        /// <summary>
        /// Clears the player's hand
        /// </summary>
        public void ClearHand()
        {
            hand.Clear();
        }

        /// <summary>
        /// Calculates the total value of tiles in the player's hand
        /// </summary>
        /// <returns>Total value</returns>
        public int CalculateHandValue()
        {
            int total = 0;
            foreach (DominoTile tile in hand)
            {
                total += tile.value1 + tile.value2;
            }
            return total;
        }
    }
}