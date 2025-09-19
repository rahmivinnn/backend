using System;
using System.Collections.Generic;
using UnityEngine;

namespace HiggsDomino.Game
{
    /// <summary>
    /// Represents a game room
    /// </summary>
    [Serializable]
    public class GameRoom
    {
        public string id;
        public string name;
        public string hostId;
        public string gameType = "domino"; // domino, gaple, etc.
        public int maxPlayers = 4;
        public int minPlayers = 2;
        public int entryFee = 0;
        public int currentRound = 0;
        public int maxRounds = 1;
        public bool isPrivate = false;
        public string password = "";
        public bool isStarted = false;
        public bool isFinished = false;
        public List<PlayerInfo> players = new List<PlayerInfo>();
        public DateTime createdAt;
        public DateTime updatedAt;
        public RoomSettings settings = new RoomSettings();

        /// <summary>
        /// Creates a new game room
        /// </summary>
        public GameRoom()
        {
            id = Guid.NewGuid().ToString();
            createdAt = DateTime.Now;
            updatedAt = DateTime.Now;
        }

        /// <summary>
        /// Creates a new game room with the specified name and host ID
        /// </summary>
        /// <param name="name">Room name</param>
        /// <param name="hostId">Host player ID</param>
        public GameRoom(string name, string hostId)
        {
            this.id = Guid.NewGuid().ToString();
            this.name = name;
            this.hostId = hostId;
            this.createdAt = DateTime.Now;
            this.updatedAt = DateTime.Now;
        }

        /// <summary>
        /// Adds a player to the room
        /// </summary>
        /// <param name="player">Player to add</param>
        /// <returns>True if the player was added, false otherwise</returns>
        public bool AddPlayer(PlayerInfo player)
        {
            if (players.Count >= maxPlayers || isStarted || isFinished)
                return false;

            if (players.Exists(p => p.id == player.id))
                return false;

            players.Add(player);
            updatedAt = DateTime.Now;
            return true;
        }

        /// <summary>
        /// Removes a player from the room
        /// </summary>
        /// <param name="playerId">Player ID to remove</param>
        /// <returns>True if the player was removed, false otherwise</returns>
        public bool RemovePlayer(string playerId)
        {
            int index = players.FindIndex(p => p.id == playerId);
            if (index == -1)
                return false;

            players.RemoveAt(index);

            // If the host leaves, assign a new host
            if (playerId == hostId && players.Count > 0)
            {
                hostId = players[0].id;
            }

            updatedAt = DateTime.Now;
            return true;
        }

        /// <summary>
        /// Gets a player by ID
        /// </summary>
        /// <param name="playerId">Player ID</param>
        /// <returns>The player, or null if not found</returns>
        public PlayerInfo GetPlayer(string playerId)
        {
            return players.Find(p => p.id == playerId);
        }

        /// <summary>
        /// Sets a player's ready status
        /// </summary>
        /// <param name="playerId">Player ID</param>
        /// <param name="isReady">Ready status</param>
        /// <returns>True if the player's status was updated, false otherwise</returns>
        public bool SetPlayerReady(string playerId, bool isReady)
        {
            PlayerInfo player = GetPlayer(playerId);
            if (player == null)
                return false;

            player.isReady = isReady;
            updatedAt = DateTime.Now;
            return true;
        }

        /// <summary>
        /// Checks if all players are ready
        /// </summary>
        /// <returns>True if all players are ready, false otherwise</returns>
        public bool AreAllPlayersReady()
        {
            if (players.Count < minPlayers)
                return false;

            foreach (PlayerInfo player in players)
            {
                if (!player.isReady)
                    return false;
            }

            return true;
        }

        /// <summary>
        /// Starts the game
        /// </summary>
        /// <returns>True if the game was started, false otherwise</returns>
        public bool StartGame()
        {
            if (players.Count < minPlayers || !AreAllPlayersReady() || isStarted || isFinished)
                return false;

            isStarted = true;
            currentRound = 1;
            updatedAt = DateTime.Now;
            return true;
        }

        /// <summary>
        /// Finishes the game
        /// </summary>
        public void FinishGame()
        {
            isFinished = true;
            updatedAt = DateTime.Now;
        }

        /// <summary>
        /// Advances to the next round
        /// </summary>
        /// <returns>True if advanced to the next round, false if the game is finished</returns>
        public bool NextRound()
        {
            if (currentRound >= maxRounds)
            {
                FinishGame();
                return false;
            }

            currentRound++;
            updatedAt = DateTime.Now;
            return true;
        }

        /// <summary>
        /// Resets the room for a new game
        /// </summary>
        public void ResetRoom()
        {
            isStarted = false;
            isFinished = false;
            currentRound = 0;

            // Reset player ready status and scores
            foreach (PlayerInfo player in players)
            {
                player.isReady = false;
                player.score = 0;
                player.ClearHand();
            }

            updatedAt = DateTime.Now;
        }

        /// <summary>
        /// Creates a game room from JSON data
        /// </summary>
        /// <param name="json">JSON data</param>
        /// <returns>GameRoom instance</returns>
        public static GameRoom FromJson(string json)
        {
            return JsonUtility.FromJson<GameRoom>(json);
        }

        /// <summary>
        /// Converts the game room to JSON
        /// </summary>
        /// <returns>JSON string</returns>
        public string ToJson()
        {
            return JsonUtility.ToJson(this);
        }
    }

    /// <summary>
    /// Contains settings for a game room
    /// </summary>
    [Serializable]
    public class RoomSettings
    {
        public int tilesPerPlayer = 7;
        public int timePerTurn = 30; // seconds
        public bool allowSkipping = true;
        public bool mustPlayIfPossible = true;
        public bool showTileCount = true;
        public bool showScores = true;
        public bool shuffleTilesOnStart = true;
        public int winScore = 100;
        public int maxTilesToDraw = 3;
        public bool doubleScoreForDoubles = true;
    }
}