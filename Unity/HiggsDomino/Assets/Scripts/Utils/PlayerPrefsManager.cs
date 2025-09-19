using System;
using UnityEngine;

namespace HiggsDomino.Utils
{
    /// <summary>
    /// Manages local data storage using PlayerPrefs
    /// </summary>
    public static class PlayerPrefsManager
    {
        private const string AUTH_TOKEN_KEY = "auth_token";
        private const string USERNAME_KEY = "username";
        private const string PASSWORD_KEY = "password";
        private const string REMEMBER_ME_KEY = "remember_me";
        private const string LAST_LOGIN_KEY = "last_login";
        private const string SOUND_ENABLED_KEY = "sound_enabled";
        private const string MUSIC_ENABLED_KEY = "music_enabled";
        private const string VIBRATION_ENABLED_KEY = "vibration_enabled";
        private const string NOTIFICATION_ENABLED_KEY = "notification_enabled";
        private const string LANGUAGE_KEY = "language";
        private const string USER_ID_KEY = "user_id";
        private const string DEVICE_ID_KEY = "device_id";

        /// <summary>
        /// Saves the authentication token
        /// </summary>
        /// <param name="token">Authentication token</param>
        public static void SaveAuthToken(string token)
        {
            PlayerPrefs.SetString(AUTH_TOKEN_KEY, token);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Gets the authentication token
        /// </summary>
        /// <returns>Authentication token</returns>
        public static string GetAuthToken()
        {
            return PlayerPrefs.GetString(AUTH_TOKEN_KEY, string.Empty);
        }

        /// <summary>
        /// Clears the authentication token
        /// </summary>
        public static void ClearAuthToken()
        {
            PlayerPrefs.DeleteKey(AUTH_TOKEN_KEY);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Saves the user ID
        /// </summary>
        /// <param name="userId">User ID</param>
        public static void SaveUserId(string userId)
        {
            PlayerPrefs.SetString(USER_ID_KEY, userId);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Gets the user ID
        /// </summary>
        /// <returns>User ID</returns>
        public static string GetUserId()
        {
            return PlayerPrefs.GetString(USER_ID_KEY, string.Empty);
        }

        /// <summary>
        /// Saves the login credentials
        /// </summary>
        /// <param name="username">Username</param>
        /// <param name="password">Password</param>
        /// <param name="rememberMe">Whether to remember the credentials</param>
        public static void SaveLoginCredentials(string username, string password, bool rememberMe)
        {
            PlayerPrefs.SetString(USERNAME_KEY, username);
            
            if (rememberMe)
            {
                PlayerPrefs.SetString(PASSWORD_KEY, password);
            }
            else
            {
                PlayerPrefs.DeleteKey(PASSWORD_KEY);
            }
            
            PlayerPrefs.SetInt(REMEMBER_ME_KEY, rememberMe ? 1 : 0);
            PlayerPrefs.SetString(LAST_LOGIN_KEY, DateTime.UtcNow.ToString("o"));
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Gets the saved username
        /// </summary>
        /// <returns>Username</returns>
        public static string GetUsername()
        {
            return PlayerPrefs.GetString(USERNAME_KEY, string.Empty);
        }

        /// <summary>
        /// Gets the saved password
        /// </summary>
        /// <returns>Password</returns>
        public static string GetPassword()
        {
            return PlayerPrefs.GetString(PASSWORD_KEY, string.Empty);
        }

        /// <summary>
        /// Gets whether to remember the credentials
        /// </summary>
        /// <returns>Whether to remember the credentials</returns>
        public static bool GetRememberMe()
        {
            return PlayerPrefs.GetInt(REMEMBER_ME_KEY, 0) == 1;
        }

        /// <summary>
        /// Gets the last login date
        /// </summary>
        /// <returns>Last login date</returns>
        public static DateTime? GetLastLogin()
        {
            string lastLoginStr = PlayerPrefs.GetString(LAST_LOGIN_KEY, string.Empty);
            
            if (string.IsNullOrEmpty(lastLoginStr))
            {
                return null;
            }
            
            try
            {
                return DateTime.Parse(lastLoginStr);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Clears the login credentials
        /// </summary>
        public static void ClearLoginCredentials()
        {
            PlayerPrefs.DeleteKey(USERNAME_KEY);
            PlayerPrefs.DeleteKey(PASSWORD_KEY);
            PlayerPrefs.DeleteKey(REMEMBER_ME_KEY);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Saves the sound settings
        /// </summary>
        /// <param name="soundEnabled">Whether sound is enabled</param>
        /// <param name="musicEnabled">Whether music is enabled</param>
        /// <param name="vibrationEnabled">Whether vibration is enabled</param>
        public static void SaveSoundSettings(bool soundEnabled, bool musicEnabled, bool vibrationEnabled)
        {
            PlayerPrefs.SetInt(SOUND_ENABLED_KEY, soundEnabled ? 1 : 0);
            PlayerPrefs.SetInt(MUSIC_ENABLED_KEY, musicEnabled ? 1 : 0);
            PlayerPrefs.SetInt(VIBRATION_ENABLED_KEY, vibrationEnabled ? 1 : 0);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Gets whether sound is enabled
        /// </summary>
        /// <returns>Whether sound is enabled</returns>
        public static bool GetSoundEnabled()
        {
            return PlayerPrefs.GetInt(SOUND_ENABLED_KEY, 1) == 1;
        }

        /// <summary>
        /// Gets whether music is enabled
        /// </summary>
        /// <returns>Whether music is enabled</returns>
        public static bool GetMusicEnabled()
        {
            return PlayerPrefs.GetInt(MUSIC_ENABLED_KEY, 1) == 1;
        }

        /// <summary>
        /// Gets whether vibration is enabled
        /// </summary>
        /// <returns>Whether vibration is enabled</returns>
        public static bool GetVibrationEnabled()
        {
            return PlayerPrefs.GetInt(VIBRATION_ENABLED_KEY, 1) == 1;
        }

        /// <summary>
        /// Saves whether notifications are enabled
        /// </summary>
        /// <param name="enabled">Whether notifications are enabled</param>
        public static void SaveNotificationEnabled(bool enabled)
        {
            PlayerPrefs.SetInt(NOTIFICATION_ENABLED_KEY, enabled ? 1 : 0);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Gets whether notifications are enabled
        /// </summary>
        /// <returns>Whether notifications are enabled</returns>
        public static bool GetNotificationEnabled()
        {
            return PlayerPrefs.GetInt(NOTIFICATION_ENABLED_KEY, 1) == 1;
        }

        /// <summary>
        /// Saves the language
        /// </summary>
        /// <param name="language">Language code</param>
        public static void SaveLanguage(string language)
        {
            PlayerPrefs.SetString(LANGUAGE_KEY, language);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Gets the language
        /// </summary>
        /// <returns>Language code</returns>
        public static string GetLanguage()
        {
            return PlayerPrefs.GetString(LANGUAGE_KEY, "en");
        }

        /// <summary>
        /// Gets or generates a device ID
        /// </summary>
        /// <returns>Device ID</returns>
        public static string GetDeviceId()
        {
            string deviceId = PlayerPrefs.GetString(DEVICE_ID_KEY, string.Empty);
            
            if (string.IsNullOrEmpty(deviceId))
            {
                deviceId = GenerateDeviceId();
                PlayerPrefs.SetString(DEVICE_ID_KEY, deviceId);
                PlayerPrefs.Save();
            }
            
            return deviceId;
        }

        /// <summary>
        /// Generates a device ID
        /// </summary>
        /// <returns>Device ID</returns>
        private static string GenerateDeviceId()
        {
            string id = SystemInfo.deviceUniqueIdentifier;
            
            if (string.IsNullOrEmpty(id) || id == SystemInfo.unsupportedIdentifier)
            {
                id = Guid.NewGuid().ToString();
            }
            
            return id;
        }

        /// <summary>
        /// Clears all player preferences
        /// </summary>
        public static void ClearAll()
        {
            PlayerPrefs.DeleteAll();
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Saves a custom value
        /// </summary>
        /// <param name="key">Key</param>
        /// <param name="value">Value</param>
        public static void SaveCustomValue(string key, string value)
        {
            PlayerPrefs.SetString(key, value);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Gets a custom value
        /// </summary>
        /// <param name="key">Key</param>
        /// <param name="defaultValue">Default value</param>
        /// <returns>Value</returns>
        public static string GetCustomValue(string key, string defaultValue = "")
        {
            return PlayerPrefs.GetString(key, defaultValue);
        }

        /// <summary>
        /// Saves a custom integer value
        /// </summary>
        /// <param name="key">Key</param>
        /// <param name="value">Value</param>
        public static void SaveCustomInt(string key, int value)
        {
            PlayerPrefs.SetInt(key, value);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Gets a custom integer value
        /// </summary>
        /// <param name="key">Key</param>
        /// <param name="defaultValue">Default value</param>
        /// <returns>Value</returns>
        public static int GetCustomInt(string key, int defaultValue = 0)
        {
            return PlayerPrefs.GetInt(key, defaultValue);
        }

        /// <summary>
        /// Saves a custom float value
        /// </summary>
        /// <param name="key">Key</param>
        /// <param name="value">Value</param>
        public static void SaveCustomFloat(string key, float value)
        {
            PlayerPrefs.SetFloat(key, value);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Gets a custom float value
        /// </summary>
        /// <param name="key">Key</param>
        /// <param name="defaultValue">Default value</param>
        /// <returns>Value</returns>
        public static float GetCustomFloat(string key, float defaultValue = 0f)
        {
            return PlayerPrefs.GetFloat(key, defaultValue);
        }

        /// <summary>
        /// Saves a custom boolean value
        /// </summary>
        /// <param name="key">Key</param>
        /// <param name="value">Value</param>
        public static void SaveCustomBool(string key, bool value)
        {
            PlayerPrefs.SetInt(key, value ? 1 : 0);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Gets a custom boolean value
        /// </summary>
        /// <param name="key">Key</param>
        /// <param name="defaultValue">Default value</param>
        /// <returns>Value</returns>
        public static bool GetCustomBool(string key, bool defaultValue = false)
        {
            return PlayerPrefs.GetInt(key, defaultValue ? 1 : 0) == 1;
        }

        /// <summary>
        /// Deletes a custom value
        /// </summary>
        /// <param name="key">Key</param>
        public static void DeleteCustomValue(string key)
        {
            PlayerPrefs.DeleteKey(key);
            PlayerPrefs.Save();
        }

        /// <summary>
        /// Checks if a custom value exists
        /// </summary>
        /// <param name="key">Key</param>
        /// <returns>Whether the value exists</returns>
        public static bool HasCustomValue(string key)
        {
            return PlayerPrefs.HasKey(key);
        }
    }
}