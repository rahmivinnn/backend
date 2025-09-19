using System;
using System.Collections.Generic;
using UnityEngine;

namespace HiggsDomino.Game
{
    /// <summary>
    /// Contains information about a game result
    /// </summary>
    [Serializable]
    public class GameResult
    {
        public string gameId;
        public string roomId;
        public string winnerId;
        public List<PlayerInfo> players = new List<PlayerInfo>();
        public Dictionary<string, int> rewards = new Dictionary<string, int>();
        public Dictionary<string, int> handValues = new Dictionary<string, int>();
        public DateTime endTime;
        public int gameDuration; // in seconds
        public int totalRounds;

        /// <summary>
        /// Creates a new game result instance
        /// </summary>
        public GameResult()
        {
            endTime = DateTime.Now;
        }

        /// <summary>
        /// Creates a new game result with the specified game ID and room ID
        /// </summary>
        /// <param name="gameId">Game ID</param>
        /// <param name="roomId">Room ID</param>
        public GameResult(string gameId, string roomId)
        {
            this.gameId = gameId;
            this.roomId = roomId;
            endTime = DateTime.Now;
        }

        /// <summary>
        /// Adds a player to the result
        /// </summary>
        /// <param name="player">Player information</param>
        /// <param name="reward">Reward amount</param>
        /// <param name="handValue">Value of remaining tiles in hand</param>
        public void AddPlayer(PlayerInfo player, int reward, int handValue)
        {
            players.Add(player);
            rewards[player.id] = reward;
            handValues[player.id] = handValue;
        }

        /// <summary>
        /// Sets the winner of the game
        /// </summary>
        /// <param name="playerId">Player ID of the winner</param>
        public void SetWinner(string playerId)
        {
            winnerId = playerId;
        }

        /// <summary>
        /// Calculates the total score for a player
        /// </summary>
        /// <param name="playerId">Player ID</param>
        /// <returns>Total score</returns>
        public int GetTotalScore(string playerId)
        {
            PlayerInfo player = players.Find(p => p.id == playerId);
            if (player == null) return 0;

            int score = player.score;
            if (rewards.ContainsKey(playerId))
            {
                score += rewards[playerId];
            }

            return score;
        }

        /// <summary>
        /// Creates a game result from JSON data
        /// </summary>
        /// <param name="json">JSON data</param>
        /// <returns>GameResult instance</returns>
        public static GameResult FromJson(string json)
        {
            return JsonUtility.FromJson<GameResult>(json);
        }

        /// <summary>
        /// Converts the game result to JSON
        /// </summary>
        /// <returns>JSON string</returns>
        public string ToJson()
        {
            return JsonUtility.ToJson(this);
        }
    }
}