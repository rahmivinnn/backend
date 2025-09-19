using System;
using System.Collections.Generic;
using UnityEngine;

namespace HiggsDomino.Game
{
    /// <summary>
    /// Represents a domino game board
    /// </summary>
    public class GameBoard : MonoBehaviour
    {
        [SerializeField] private Transform boardContainer;
        [SerializeField] private GameObject tilePrefab;
        [SerializeField] private float tileSpacing = 10f;
        [SerializeField] private float branchSpacing = 20f;
        [SerializeField] private int maxTilesPerRow = 8;

        private List<DominoTile> playedTiles = new List<DominoTile>();
        private Dictionary<string, DominoTileUI> tileUIObjects = new Dictionary<string, DominoTileUI>();
        private int leftEndValue = -1;
        private int rightEndValue = -1;
        private int topEndValue = -1;
        private int bottomEndValue = -1;

        // Events
        public event Action<int> OnBoardUpdated;

        private void Awake()
        {
            if (boardContainer == null)
            {
                boardContainer = transform;
            }

            ClearBoard();
        }

        /// <summary>
        /// Clears the game board
        /// </summary>
        public void ClearBoard()
        {
            // Remove all tile objects
            foreach (var tileUI in tileUIObjects.Values)
            {
                Destroy(tileUI.gameObject);
            }

            playedTiles.Clear();
            tileUIObjects.Clear();
            leftEndValue = -1;
            rightEndValue = -1;
            topEndValue = -1;
            bottomEndValue = -1;
        }

        /// <summary>
        /// Places the first tile on the board
        /// </summary>
        /// <param name="tile">Tile to place</param>
        /// <returns>True if the tile was placed, false otherwise</returns>
        public bool PlaceFirstTile(DominoTile tile)
        {
            if (playedTiles.Count > 0)
                return false;

            playedTiles.Add(tile);
            leftEndValue = tile.value1;
            rightEndValue = tile.value2;

            // Create tile UI object
            CreateTileUI(tile, Vector3.zero, 0);

            OnBoardUpdated?.Invoke(playedTiles.Count);
            return true;
        }

        /// <summary>
        /// Places a tile on the board
        /// </summary>
        /// <param name="tile">Tile to place</param>
        /// <param name="position">Position (left, right, top, bottom)</param>
        /// <returns>True if the tile was placed, false otherwise</returns>
        public bool PlaceTile(DominoTile tile, TilePlacement position)
        {
            if (playedTiles.Count == 0)
                return PlaceFirstTile(tile);

            bool canPlace = false;
            Vector3 tilePosition = Vector3.zero;
            float rotation = 0f;

            switch (position)
            {
                case TilePlacement.Left:
                    if (tile.value1 == leftEndValue || tile.value2 == leftEndValue)
                    {
                        canPlace = true;
                        tilePosition = CalculateLeftPosition();
                        rotation = 0f;
                        
                        // Update the left end value
                        if (tile.value1 == leftEndValue)
                            leftEndValue = tile.value2;
                        else
                            leftEndValue = tile.value1;
                    }
                    break;

                case TilePlacement.Right:
                    if (tile.value1 == rightEndValue || tile.value2 == rightEndValue)
                    {
                        canPlace = true;
                        tilePosition = CalculateRightPosition();
                        rotation = 0f;
                        
                        // Update the right end value
                        if (tile.value1 == rightEndValue)
                            rightEndValue = tile.value2;
                        else
                            rightEndValue = tile.value1;
                    }
                    break;

                case TilePlacement.Top:
                    if (topEndValue == -1) // First vertical tile
                    {
                        // Check if it can connect to either end
                        if (tile.value1 == leftEndValue || tile.value2 == leftEndValue)
                        {
                            canPlace = true;
                            tilePosition = CalculateTopPosition(true);
                            rotation = 90f;
                            
                            // Update the top end value
                            if (tile.value1 == leftEndValue)
                                topEndValue = tile.value2;
                            else
                                topEndValue = tile.value1;
                        }
                        else if (tile.value1 == rightEndValue || tile.value2 == rightEndValue)
                        {
                            canPlace = true;
                            tilePosition = CalculateTopPosition(false);
                            rotation = 90f;
                            
                            // Update the top end value
                            if (tile.value1 == rightEndValue)
                                topEndValue = tile.value2;
                            else
                                topEndValue = tile.value1;
                        }
                    }
                    else if (tile.value1 == topEndValue || tile.value2 == topEndValue)
                    {
                        canPlace = true;
                        tilePosition = CalculateTopPosition(false);
                        rotation = 90f;
                        
                        // Update the top end value
                        if (tile.value1 == topEndValue)
                            topEndValue = tile.value2;
                        else
                            topEndValue = tile.value1;
                    }
                    break;

                case TilePlacement.Bottom:
                    if (bottomEndValue == -1) // First vertical tile
                    {
                        // Check if it can connect to either end
                        if (tile.value1 == leftEndValue || tile.value2 == leftEndValue)
                        {
                            canPlace = true;
                            tilePosition = CalculateBottomPosition(true);
                            rotation = 90f;
                            
                            // Update the bottom end value
                            if (tile.value1 == leftEndValue)
                                bottomEndValue = tile.value2;
                            else
                                bottomEndValue = tile.value1;
                        }
                        else if (tile.value1 == rightEndValue || tile.value2 == rightEndValue)
                        {
                            canPlace = true;
                            tilePosition = CalculateBottomPosition(false);
                            rotation = 90f;
                            
                            // Update the bottom end value
                            if (tile.value1 == rightEndValue)
                                bottomEndValue = tile.value2;
                            else
                                bottomEndValue = tile.value1;
                        }
                    }
                    else if (tile.value1 == bottomEndValue || tile.value2 == bottomEndValue)
                    {
                        canPlace = true;
                        tilePosition = CalculateBottomPosition(false);
                        rotation = 90f;
                        
                        // Update the bottom end value
                        if (tile.value1 == bottomEndValue)
                            bottomEndValue = tile.value2;
                        else
                            bottomEndValue = tile.value1;
                    }
                    break;
            }

            if (canPlace)
            {
                playedTiles.Add(tile);
                CreateTileUI(tile, tilePosition, rotation);
                OnBoardUpdated?.Invoke(playedTiles.Count);
                return true;
            }

            return false;
        }

        /// <summary>
        /// Creates a tile UI object
        /// </summary>
        /// <param name="tile">Tile data</param>
        /// <param name="position">Position</param>
        /// <param name="rotation">Rotation in degrees</param>
        private void CreateTileUI(DominoTile tile, Vector3 position, float rotation)
        {
            if (tilePrefab == null) return;

            GameObject tileObject = Instantiate(tilePrefab, position, Quaternion.Euler(0, 0, rotation), boardContainer);
            DominoTileUI tileUI = tileObject.GetComponent<DominoTileUI>();
            if (tileUI != null)
            {
                tileUI.SetTile(tile);
                tileUIObjects[tile.id] = tileUI;
            }
        }

        /// <summary>
        /// Calculates the position for a tile on the left end
        /// </summary>
        /// <returns>Position</returns>
        private Vector3 CalculateLeftPosition()
        {
            int horizontalTileCount = Mathf.Min(playedTiles.Count, maxTilesPerRow);
            float x = -tileSpacing * horizontalTileCount;
            return new Vector3(x, 0, 0);
        }

        /// <summary>
        /// Calculates the position for a tile on the right end
        /// </summary>
        /// <returns>Position</returns>
        private Vector3 CalculateRightPosition()
        {
            int horizontalTileCount = Mathf.Min(playedTiles.Count, maxTilesPerRow);
            float x = tileSpacing * horizontalTileCount;
            return new Vector3(x, 0, 0);
        }

        /// <summary>
        /// Calculates the position for a tile on the top end
        /// </summary>
        /// <param name="isFirstVertical">Whether this is the first vertical tile</param>
        /// <returns>Position</returns>
        private Vector3 CalculateTopPosition(bool isFirstVertical)
        {
            float x = isFirstVertical ? -branchSpacing : 0;
            float y = (topEndValue == -1 ? 0 : branchSpacing) + tileSpacing;
            return new Vector3(x, y, 0);
        }

        /// <summary>
        /// Calculates the position for a tile on the bottom end
        /// </summary>
        /// <param name="isFirstVertical">Whether this is the first vertical tile</param>
        /// <returns>Position</returns>
        private Vector3 CalculateBottomPosition(bool isFirstVertical)
        {
            float x = isFirstVertical ? branchSpacing : 0;
            float y = (bottomEndValue == -1 ? 0 : -branchSpacing) - tileSpacing;
            return new Vector3(x, y, 0);
        }

        /// <summary>
        /// Gets the available end values on the board
        /// </summary>
        /// <returns>List of end values</returns>
        public List<int> GetAvailableEndValues()
        {
            List<int> endValues = new List<int>();
            
            if (leftEndValue != -1)
                endValues.Add(leftEndValue);
                
            if (rightEndValue != -1 && rightEndValue != leftEndValue)
                endValues.Add(rightEndValue);
                
            if (topEndValue != -1 && !endValues.Contains(topEndValue))
                endValues.Add(topEndValue);
                
            if (bottomEndValue != -1 && !endValues.Contains(bottomEndValue))
                endValues.Add(bottomEndValue);
                
            return endValues;
        }

        /// <summary>
        /// Checks if a tile can be played on the board
        /// </summary>
        /// <param name="tile">Tile to check</param>
        /// <returns>True if the tile can be played, false otherwise</returns>
        public bool CanPlayTile(DominoTile tile)
        {
            if (playedTiles.Count == 0)
                return true;

            List<int> endValues = GetAvailableEndValues();
            return endValues.Contains(tile.value1) || endValues.Contains(tile.value2);
        }

        /// <summary>
        /// Gets the valid placements for a tile
        /// </summary>
        /// <param name="tile">Tile to check</param>
        /// <returns>List of valid placements</returns>
        public List<TilePlacement> GetValidPlacements(DominoTile tile)
        {
            List<TilePlacement> validPlacements = new List<TilePlacement>();

            if (playedTiles.Count == 0)
            {
                validPlacements.Add(TilePlacement.Left); // First tile can be placed anywhere
                return validPlacements;
            }

            if (tile.value1 == leftEndValue || tile.value2 == leftEndValue)
                validPlacements.Add(TilePlacement.Left);

            if (tile.value1 == rightEndValue || tile.value2 == rightEndValue)
                validPlacements.Add(TilePlacement.Right);

            if (topEndValue == -1)
            {
                // First vertical tile can connect to either horizontal end
                if (tile.value1 == leftEndValue || tile.value2 == leftEndValue ||
                    tile.value1 == rightEndValue || tile.value2 == rightEndValue)
                    validPlacements.Add(TilePlacement.Top);
            }
            else if (tile.value1 == topEndValue || tile.value2 == topEndValue)
                validPlacements.Add(TilePlacement.Top);

            if (bottomEndValue == -1)
            {
                // First vertical tile can connect to either horizontal end
                if (tile.value1 == leftEndValue || tile.value2 == leftEndValue ||
                    tile.value1 == rightEndValue || tile.value2 == rightEndValue)
                    validPlacements.Add(TilePlacement.Bottom);
            }
            else if (tile.value1 == bottomEndValue || tile.value2 == bottomEndValue)
                validPlacements.Add(TilePlacement.Bottom);

            return validPlacements;
        }

        /// <summary>
        /// Gets the number of played tiles
        /// </summary>
        /// <returns>Number of played tiles</returns>
        public int GetPlayedTileCount()
        {
            return playedTiles.Count;
        }

        /// <summary>
        /// Gets the list of played tiles
        /// </summary>
        /// <returns>List of played tiles</returns>
        public List<DominoTile> GetPlayedTiles()
        {
            return new List<DominoTile>(playedTiles);
        }
    }

    /// <summary>
    /// Enum for tile placement positions
    /// </summary>
    public enum TilePlacement
    {
        Left,
        Right,
        Top,
        Bottom
    }
}