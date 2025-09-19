using System;
using System.Collections.Generic;
using UnityEngine;
using Random = UnityEngine.Random;

namespace HiggsDomino.Game
{
    /// <summary>
    /// Represents a set of domino tiles
    /// </summary>
    [Serializable]
    public class TileSet
    {
        private List<DominoTile> tiles = new List<DominoTile>();
        private List<DominoTile> drawPile = new List<DominoTile>();
        private int maxValue = 6; // Standard double-six set

        /// <summary>
        /// Creates a new tile set
        /// </summary>
        /// <param name="maxValue">Maximum value on a tile (default is 6 for a double-six set)</param>
        public TileSet(int maxValue = 6)
        {
            this.maxValue = Mathf.Clamp(maxValue, 1, 9);
            GenerateTiles();
        }

        /// <summary>
        /// Generates all tiles for the set
        /// </summary>
        private void GenerateTiles()
        {
            tiles.Clear();
            int tileId = 0;

            // Generate all possible combinations
            for (int i = 0; i <= maxValue; i++)
            {
                for (int j = i; j <= maxValue; j++)
                {
                    DominoTile tile = new DominoTile(tileId.ToString(), i, j);
                    tiles.Add(tile);
                    tileId++;
                }
            }

            ResetDrawPile();
        }

        /// <summary>
        /// Resets the draw pile with all tiles and shuffles them
        /// </summary>
        public void ResetDrawPile()
        {
            drawPile.Clear();
            foreach (DominoTile tile in tiles)
            {
                drawPile.Add(tile.Clone());
            }

            ShuffleTiles();
        }

        /// <summary>
        /// Shuffles the tiles in the draw pile
        /// </summary>
        public void ShuffleTiles()
        {
            int n = drawPile.Count;
            while (n > 1)
            {
                n--;
                int k = Random.Range(0, n + 1);
                DominoTile temp = drawPile[k];
                drawPile[k] = drawPile[n];
                drawPile[n] = temp;
            }
        }

        /// <summary>
        /// Draws a tile from the draw pile
        /// </summary>
        /// <returns>The drawn tile, or null if the draw pile is empty</returns>
        public DominoTile DrawTile()
        {
            if (drawPile.Count == 0)
                return null;

            DominoTile tile = drawPile[0];
            drawPile.RemoveAt(0);
            return tile;
        }

        /// <summary>
        /// Draws multiple tiles from the draw pile
        /// </summary>
        /// <param name="count">Number of tiles to draw</param>
        /// <returns>List of drawn tiles</returns>
        public List<DominoTile> DrawTiles(int count)
        {
            List<DominoTile> drawnTiles = new List<DominoTile>();
            for (int i = 0; i < count; i++)
            {
                DominoTile tile = DrawTile();
                if (tile != null)
                    drawnTiles.Add(tile);
                else
                    break;
            }

            return drawnTiles;
        }

        /// <summary>
        /// Returns a tile to the draw pile
        /// </summary>
        /// <param name="tile">Tile to return</param>
        public void ReturnTile(DominoTile tile)
        {
            if (tile != null && !drawPile.Exists(t => t.id == tile.id))
            {
                drawPile.Add(tile);
            }
        }

        /// <summary>
        /// Gets the number of tiles remaining in the draw pile
        /// </summary>
        /// <returns>Number of tiles</returns>
        public int GetRemainingTileCount()
        {
            return drawPile.Count;
        }

        /// <summary>
        /// Gets the total number of tiles in the set
        /// </summary>
        /// <returns>Total number of tiles</returns>
        public int GetTotalTileCount()
        {
            return tiles.Count;
        }

        /// <summary>
        /// Gets the maximum value in the set
        /// </summary>
        /// <returns>Maximum value</returns>
        public int GetMaxValue()
        {
            return maxValue;
        }

        /// <summary>
        /// Deals tiles to players
        /// </summary>
        /// <param name="players">List of players</param>
        /// <param name="tilesPerPlayer">Number of tiles per player</param>
        public void DealTilesToPlayers(List<PlayerInfo> players, int tilesPerPlayer = 7)
        {
            if (players == null || players.Count == 0)
                return;

            // Clear existing tiles from players
            foreach (PlayerInfo player in players)
            {
                player.ClearHand();
            }

            // Deal new tiles
            for (int i = 0; i < tilesPerPlayer; i++)
            {
                foreach (PlayerInfo player in players)
                {
                    DominoTile tile = DrawTile();
                    if (tile != null)
                    {
                        player.AddTile(tile);
                    }
                }
            }
        }

        /// <summary>
        /// Finds the player with the highest double tile
        /// </summary>
        /// <param name="players">List of players</param>
        /// <returns>Player ID with the highest double, or null if no doubles</returns>
        public string FindPlayerWithHighestDouble(List<PlayerInfo> players)
        {
            int highestDouble = -1;
            string playerId = null;

            foreach (PlayerInfo player in players)
            {
                foreach (DominoTile tile in player.tiles)
                {
                    if (tile.IsDouble() && tile.value1 > highestDouble)
                    {
                        highestDouble = tile.value1;
                        playerId = player.id;
                    }
                }
            }

            return playerId;
        }

        /// <summary>
        /// Creates a tile set from JSON data
        /// </summary>
        /// <param name="json">JSON data</param>
        /// <returns>TileSet instance</returns>
        public static TileSet FromJson(string json)
        {
            return JsonUtility.FromJson<TileSet>(json);
        }

        /// <summary>
        /// Converts the tile set to JSON
        /// </summary>
        /// <returns>JSON string</returns>
        public string ToJson()
        {
            return JsonUtility.ToJson(this);
        }
    }
}