using System;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace HiggsDomino.Game
{
    /// <summary>
    /// Represents a domino tile in the game
    /// </summary>
    [Serializable]
    public class DominoTile
    {
        public string id;
        public int value1;
        public int value2;
        public bool isDouble => value1 == value2;
        public int totalValue => value1 + value2;

        /// <summary>
        /// Creates a new domino tile
        /// </summary>
        public DominoTile()
        {
        }

        /// <summary>
        /// Creates a new domino tile with the specified values
        /// </summary>
        /// <param name="value1">First value</param>
        /// <param name="value2">Second value</param>
        public DominoTile(int value1, int value2)
        {
            this.id = Guid.NewGuid().ToString();
            this.value1 = value1;
            this.value2 = value2;
        }

        /// <summary>
        /// Checks if this tile can connect to another tile
        /// </summary>
        /// <param name="otherTile">The other tile</param>
        /// <param name="connectionValue">The value that needs to match</param>
        /// <returns>True if the tiles can connect, false otherwise</returns>
        public bool CanConnectTo(DominoTile otherTile, int connectionValue)
        {
            return (value1 == connectionValue || value2 == connectionValue) && 
                   (otherTile.value1 == connectionValue || otherTile.value2 == connectionValue);
        }

        /// <summary>
        /// Gets the value that is not the connection value
        /// </summary>
        /// <param name="connectionValue">The connection value</param>
        /// <returns>The other value</returns>
        public int GetOtherValue(int connectionValue)
        {
            if (value1 == connectionValue)
                return value2;
            else if (value2 == connectionValue)
                return value1;
            else
                return -1; // No connection
        }

        /// <summary>
        /// Checks if this tile matches the specified values
        /// </summary>
        /// <param name="v1">First value</param>
        /// <param name="v2">Second value</param>
        /// <returns>True if the tile matches, false otherwise</returns>
        public bool Matches(int v1, int v2)
        {
            return (value1 == v1 && value2 == v2) || (value1 == v2 && value2 == v1);
        }

        /// <summary>
        /// Returns a string representation of the tile
        /// </summary>
        /// <returns>String representation</returns>
        public override string ToString()
        {
            return $"[{value1}|{value2}]";
        }
    }

    /// <summary>
    /// MonoBehaviour component for a domino tile in the UI
    /// </summary>
    public class DominoTileUI : MonoBehaviour, IPointerClickHandler, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        [SerializeField] private Image backgroundImage;
        [SerializeField] private Image value1Image;
        [SerializeField] private Image value2Image;
        [SerializeField] private Sprite[] dotSprites; // 0-6 dots
        [SerializeField] private Color normalColor = Color.white;
        [SerializeField] private Color selectedColor = Color.yellow;
        [SerializeField] private Color validPlayColor = Color.green;
        [SerializeField] private Color invalidPlayColor = Color.red;

        private DominoTile tileData;
        private bool isSelected = false;
        private bool canBePlayed = false;
        private Vector3 originalPosition;
        private Transform originalParent;
        private Canvas canvas;
        private RectTransform rectTransform;
        private CanvasGroup canvasGroup;

        // Events
        public event Action<DominoTileUI> OnTileClicked;
        public event Action<DominoTileUI> OnTileDragBegin;
        public event Action<DominoTileUI> OnTileDragEnd;

        private void Awake()
        {
            rectTransform = GetComponent<RectTransform>();
            canvasGroup = GetComponent<CanvasGroup>();
            if (canvasGroup == null)
            {
                canvasGroup = gameObject.AddComponent<CanvasGroup>();
            }

            // Find the canvas
            canvas = GetComponentInParent<Canvas>();
            if (canvas == null)
            {
                canvas = FindObjectOfType<Canvas>();
            }
        }

        /// <summary>
        /// Sets the tile data and updates the UI
        /// </summary>
        /// <param name="tile">Tile data</param>
        public void SetTile(DominoTile tile)
        {
            tileData = tile;
            UpdateVisuals();
        }

        /// <summary>
        /// Gets the tile data
        /// </summary>
        /// <returns>Tile data</returns>
        public DominoTile GetTile()
        {
            return tileData;
        }

        /// <summary>
        /// Updates the visual representation of the tile
        /// </summary>
        private void UpdateVisuals()
        {
            if (tileData == null) return;

            // Set dot images
            if (value1Image != null && dotSprites.Length > tileData.value1)
            {
                value1Image.sprite = dotSprites[tileData.value1];
            }

            if (value2Image != null && dotSprites.Length > tileData.value2)
            {
                value2Image.sprite = dotSprites[tileData.value2];
            }

            // Update background color based on state
            if (backgroundImage != null)
            {
                if (isSelected)
                {
                    backgroundImage.color = selectedColor;
                }
                else if (canBePlayed)
                {
                    backgroundImage.color = validPlayColor;
                }
                else
                {
                    backgroundImage.color = normalColor;
                }
            }
        }

        /// <summary>
        /// Sets whether the tile is selected
        /// </summary>
        /// <param name="selected">Selected state</param>
        public void SetSelected(bool selected)
        {
            isSelected = selected;
            UpdateVisuals();
        }

        /// <summary>
        /// Sets whether the tile can be played
        /// </summary>
        /// <param name="canPlay">Whether the tile can be played</param>
        public void SetCanBePlayed(bool canPlay)
        {
            canBePlayed = canPlay;
            UpdateVisuals();
        }

        /// <summary>
        /// Handles pointer click events
        /// </summary>
        public void OnPointerClick(PointerEventData eventData)
        {
            OnTileClicked?.Invoke(this);
        }

        /// <summary>
        /// Handles drag begin events
        /// </summary>
        public void OnBeginDrag(PointerEventData eventData)
        {
            if (!canBePlayed) return;

            originalPosition = transform.position;
            originalParent = transform.parent;
            
            // Change parent to the canvas to allow dragging over other elements
            transform.SetParent(canvas.transform);
            
            // Make it semi-transparent while dragging
            canvasGroup.alpha = 0.6f;
            canvasGroup.blocksRaycasts = false;

            OnTileDragBegin?.Invoke(this);
        }

        /// <summary>
        /// Handles drag events
        /// </summary>
        public void OnDrag(PointerEventData eventData)
        {
            if (!canBePlayed) return;

            // Move the tile with the pointer
            rectTransform.position = eventData.position;
        }

        /// <summary>
        /// Handles drag end events
        /// </summary>
        public void OnEndDrag(PointerEventData eventData)
        {
            if (!canBePlayed) return;

            // Restore opacity
            canvasGroup.alpha = 1f;
            canvasGroup.blocksRaycasts = true;

            OnTileDragEnd?.Invoke(this);
        }

        /// <summary>
        /// Resets the tile position to its original position
        /// </summary>
        public void ResetPosition()
        {
            transform.SetParent(originalParent);
            transform.position = originalPosition;
        }

        /// <summary>
        /// Rotates the tile 90 degrees
        /// </summary>
        public void RotateTile()
        {
            transform.Rotate(0, 0, 90);
        }
    }
}