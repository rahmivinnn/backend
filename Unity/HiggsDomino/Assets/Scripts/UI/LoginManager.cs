using UnityEngine;
using UnityEngine.UI;
using HiggsDomino.Network;
using System;

namespace HiggsDomino.UI
{
    /// <summary>
    /// Manages the login and registration UI
    /// </summary>
    public class LoginManager : MonoBehaviour
    {
        [Header("Login Panel")]
        [SerializeField] private GameObject loginPanel;
        [SerializeField] private InputField loginUsernameInput;
        [SerializeField] private InputField loginPasswordInput;
        [SerializeField] private Button loginButton;
        [SerializeField] private Button switchToRegisterButton;
        [SerializeField] private Toggle rememberMeToggle;

        [Header("Registration Panel")]
        [SerializeField] private GameObject registerPanel;
        [SerializeField] private InputField registerUsernameInput;
        [SerializeField] private InputField registerEmailInput;
        [SerializeField] private InputField registerPasswordInput;
        [SerializeField] private InputField registerConfirmPasswordInput;
        [SerializeField] private Button registerButton;
        [SerializeField] private Button switchToLoginButton;

        [Header("Loading Panel")]
        [SerializeField] private GameObject loadingPanel;
        [SerializeField] private Text loadingText;

        [Header("Error Panel")]
        [SerializeField] private GameObject errorPanel;
        [SerializeField] private Text errorText;
        [SerializeField] private Button errorCloseButton;

        private NetworkManager networkManager;
        private UIManager uiManager;

        private void Awake()
        {
            networkManager = FindObjectOfType<NetworkManager>();
            uiManager = FindObjectOfType<UIManager>();

            // Initialize UI
            loginButton.onClick.AddListener(Login);
            switchToRegisterButton.onClick.AddListener(SwitchToRegister);
            registerButton.onClick.AddListener(Register);
            switchToLoginButton.onClick.AddListener(SwitchToLogin);
            errorCloseButton.onClick.AddListener(() => errorPanel.SetActive(false));

            // Check for saved credentials
            CheckSavedCredentials();
        }

        private void OnEnable()
        {
            // Subscribe to events
            if (networkManager != null)
            {
                networkManager.OnLoginSuccess += OnLoginSuccess;
                networkManager.OnLoginFailed += OnLoginFailed;
                networkManager.OnRegisterSuccess += OnRegisterSuccess;
                networkManager.OnRegisterFailed += OnRegisterFailed;
            }
        }

        private void OnDisable()
        {
            // Unsubscribe from events
            if (networkManager != null)
            {
                networkManager.OnLoginSuccess -= OnLoginSuccess;
                networkManager.OnLoginFailed -= OnLoginFailed;
                networkManager.OnRegisterSuccess -= OnRegisterSuccess;
                networkManager.OnRegisterFailed -= OnRegisterFailed;
            }
        }

        /// <summary>
        /// Checks for saved credentials and auto-fills the login form
        /// </summary>
        private void CheckSavedCredentials()
        {
            string savedUsername = PlayerPrefs.GetString("Username", "");
            string savedPassword = PlayerPrefs.GetString("Password", "");
            bool rememberMe = PlayerPrefs.GetInt("RememberMe", 0) == 1;

            if (!string.IsNullOrEmpty(savedUsername) && !string.IsNullOrEmpty(savedPassword) && rememberMe)
            {
                loginUsernameInput.text = savedUsername;
                loginPasswordInput.text = savedPassword;
                rememberMeToggle.isOn = true;

                // Auto login if credentials are saved
                Login();
            }
        }

        /// <summary>
        /// Attempts to log in with the provided credentials
        /// </summary>
        public void Login()
        {
            string username = loginUsernameInput.text.Trim();
            string password = loginPasswordInput.text;

            // Validate input
            if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
            {
                ShowError("Please enter both username and password.");
                return;
            }

            // Show loading panel
            ShowLoading("Logging in...");

            // Save credentials if remember me is checked
            if (rememberMeToggle.isOn)
            {
                PlayerPrefs.SetString("Username", username);
                PlayerPrefs.SetString("Password", password);
                PlayerPrefs.SetInt("RememberMe", 1);
            }
            else
            {
                PlayerPrefs.DeleteKey("Username");
                PlayerPrefs.DeleteKey("Password");
                PlayerPrefs.SetInt("RememberMe", 0);
            }
            PlayerPrefs.Save();

            // Send login request
            networkManager.Login(username, password);
        }

        /// <summary>
        /// Handles successful login
        /// </summary>
        /// <param name="playerId">Player ID</param>
        /// <param name="username">Username</param>
        /// <param name="token">Authentication token</param>
        private void OnLoginSuccess(string playerId, string username, string token)
        {
            // Hide loading panel
            HideLoading();

            // Show lobby
            uiManager.ShowLobby();
            Hide();
        }

        /// <summary>
        /// Handles failed login
        /// </summary>
        /// <param name="errorMessage">Error message</param>
        private void OnLoginFailed(string errorMessage)
        {
            // Hide loading panel
            HideLoading();

            // Show error
            ShowError(errorMessage);
        }

        /// <summary>
        /// Attempts to register with the provided information
        /// </summary>
        public void Register()
        {
            string username = registerUsernameInput.text.Trim();
            string email = registerEmailInput.text.Trim();
            string password = registerPasswordInput.text;
            string confirmPassword = registerConfirmPasswordInput.text;

            // Validate input
            if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(email) || 
                string.IsNullOrEmpty(password) || string.IsNullOrEmpty(confirmPassword))
            {
                ShowError("Please fill in all fields.");
                return;
            }

            if (password != confirmPassword)
            {
                ShowError("Passwords do not match.");
                return;
            }

            if (username.Length < 3 || username.Length > 20)
            {
                ShowError("Username must be between 3 and 20 characters.");
                return;
            }

            if (password.Length < 6)
            {
                ShowError("Password must be at least 6 characters.");
                return;
            }

            if (!IsValidEmail(email))
            {
                ShowError("Please enter a valid email address.");
                return;
            }

            // Show loading panel
            ShowLoading("Creating account...");

            // Send registration request
            networkManager.Register(username, email, password);
        }

        /// <summary>
        /// Validates an email address
        /// </summary>
        /// <param name="email">Email address to validate</param>
        /// <returns>Whether the email is valid</returns>
        private bool IsValidEmail(string email)
        {
            try
            {
                var addr = new System.Net.Mail.MailAddress(email);
                return addr.Address == email;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Handles successful registration
        /// </summary>
        /// <param name="username">Username</param>
        private void OnRegisterSuccess(string username)
        {
            // Hide loading panel
            HideLoading();

            // Show success message
            uiManager.ShowNotification("Account created successfully! Please log in.");

            // Switch to login panel
            SwitchToLogin();

            // Pre-fill username
            loginUsernameInput.text = username;
        }

        /// <summary>
        /// Handles failed registration
        /// </summary>
        /// <param name="errorMessage">Error message</param>
        private void OnRegisterFailed(string errorMessage)
        {
            // Hide loading panel
            HideLoading();

            // Show error
            ShowError(errorMessage);
        }

        /// <summary>
        /// Switches to the registration panel
        /// </summary>
        public void SwitchToRegister()
        {
            loginPanel.SetActive(false);
            registerPanel.SetActive(true);
        }

        /// <summary>
        /// Switches to the login panel
        /// </summary>
        public void SwitchToLogin()
        {
            registerPanel.SetActive(false);
            loginPanel.SetActive(true);
        }

        /// <summary>
        /// Shows the loading panel with a message
        /// </summary>
        /// <param name="message">Loading message</param>
        private void ShowLoading(string message)
        {
            loadingText.text = message;
            loadingPanel.SetActive(true);
        }

        /// <summary>
        /// Hides the loading panel
        /// </summary>
        private void HideLoading()
        {
            loadingPanel.SetActive(false);
        }

        /// <summary>
        /// Shows an error message
        /// </summary>
        /// <param name="message">Error message</param>
        private void ShowError(string message)
        {
            errorText.text = message;
            errorPanel.SetActive(true);
        }

        /// <summary>
        /// Shows the login manager
        /// </summary>
        public void Show()
        {
            gameObject.SetActive(true);
            loginPanel.SetActive(true);
            registerPanel.SetActive(false);
            errorPanel.SetActive(false);
            loadingPanel.SetActive(false);
        }

        /// <summary>
        /// Hides the login manager
        /// </summary>
        public void Hide()
        {
            gameObject.SetActive(false);
        }
    }
}