using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using HiggsDomino.Network;
using HiggsDomino.Utils;
using HiggsDomino.Game;

namespace HiggsDomino.UI
{
    /// <summary>
    /// Manages the main scene of the game
    /// </summary>
    public class MainScene : MonoBehaviour
    {
        #region Singleton
        private static MainScene _instance;

        /// <summary>
        /// Gets the singleton instance
        /// </summary>
        public static MainScene Instance
        {
            get
            {
                if (_instance == null)
                {
                    _instance = FindObjectOfType<MainScene>();
                }

                return _instance;
            }
        }
        #endregion

        [Header("Managers")]
        [SerializeField] private UIManager uiManager;
        [SerializeField] private GameManager gameManager;
        [SerializeField] private NetworkManager networkManager;

        [Header("Loading Screen")]
        [SerializeField] private GameObject loadingScreen;
        [SerializeField] private Slider loadingBar;
        [SerializeField] private Text loadingText;

        [Header("Splash Screen")]
        [SerializeField] private GameObject splashScreen;
        [SerializeField] private float splashDuration = 2f;

        [Header("Version")]
        [SerializeField] private Text versionText;

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }

            _instance = this;

            // Initialize managers if not assigned
            if (uiManager == null)
            {
                uiManager = FindObjectOfType<UIManager>();
            }

            if (gameManager == null)
            {
                gameManager = FindObjectOfType<GameManager>();
            }

            if (networkManager == null)
            {
                networkManager = FindObjectOfType<NetworkManager>();
            }

            // Set version text
            if (versionText != null)
            {
                versionText.text = $"v{Application.version}";
            }

            // Initialize sound manager
            SoundManager.Instance.PlayMusic("main_theme");
        }

        private void Start()
        {
            // Show splash screen
            StartCoroutine(ShowSplashScreen());
        }

        /// <summary>
        /// Shows the splash screen
        /// </summary>
        private IEnumerator ShowSplashScreen()
        {
            if (splashScreen != null)
            {
                splashScreen.SetActive(true);
                yield return new WaitForSeconds(splashDuration);
                splashScreen.SetActive(false);
            }

            // Check if user is already logged in
            string token = PlayerPrefsManager.GetAuthToken();
            if (!string.IsNullOrEmpty(token))
            {
                // Auto login
                ShowLoading("Logging in...");
                networkManager.AutoLogin(OnAutoLoginSuccess, OnAutoLoginFailed);
            }
            else
            {
                // Show login screen
                uiManager.ShowLoginScreen();
            }
        }

        /// <summary>
        /// Called when auto login succeeds
        /// </summary>
        private void OnAutoLoginSuccess()
        {
            HideLoading();
            uiManager.ShowLobbyScreen();
        }

        /// <summary>
        /// Called when auto login fails
        /// </summary>
        private void OnAutoLoginFailed(string error)
        {
            HideLoading();
            uiManager.ShowLoginScreen();
        }

        /// <summary>
        /// Shows the loading screen
        /// </summary>
        /// <param name="message">Loading message</param>
        public void ShowLoading(string message = "Loading...")
        {
            if (loadingScreen != null)
            {
                loadingScreen.SetActive(true);
                
                if (loadingText != null)
                {
                    loadingText.text = message;
                }
                
                if (loadingBar != null)
                {
                    loadingBar.value = 0f;
                }
            }
        }

        /// <summary>
        /// Updates the loading progress
        /// </summary>
        /// <param name="progress">Progress value (0-1)</param>
        public void UpdateLoadingProgress(float progress)
        {
            if (loadingBar != null)
            {
                loadingBar.value = progress;
            }
        }

        /// <summary>
        /// Hides the loading screen
        /// </summary>
        public void HideLoading()
        {
            if (loadingScreen != null)
            {
                loadingScreen.SetActive(false);
            }
        }

        /// <summary>
        /// Shows a loading screen with progress coroutine
        /// </summary>
        /// <param name="message">Loading message</param>
        /// <param name="duration">Loading duration</param>
        /// <param name="onComplete">Callback when loading completes</param>
        public void ShowLoadingWithProgress(string message, float duration, System.Action onComplete)
        {
            StartCoroutine(LoadingWithProgressCoroutine(message, duration, onComplete));
        }

        /// <summary>
        /// Loading with progress coroutine
        /// </summary>
        private IEnumerator LoadingWithProgressCoroutine(string message, float duration, System.Action onComplete)
        {
            ShowLoading(message);

            float timer = 0f;
            while (timer < duration)
            {
                timer += Time.deltaTime;
                float progress = timer / duration;
                UpdateLoadingProgress(progress);
                yield return null;
            }

            HideLoading();
            onComplete?.Invoke();
        }

        /// <summary>
        /// Quits the application
        /// </summary>
        public void QuitApplication()
        {
            // Schedule inactivity reminder notifications
            NotificationManager.Instance.ScheduleInactivityReminder();

            // Disconnect from server
            networkManager.Disconnect();

            // Quit application
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        /// <summary>
        /// Shows a confirmation dialog before quitting
        /// </summary>
        public void ShowQuitConfirmation()
        {
            uiManager.ShowConfirmationDialog(
                "Quit Game",
                "Are you sure you want to quit the game?",
                "Yes",
                "No",
                QuitApplication,
                null
            );
        }
    }
}