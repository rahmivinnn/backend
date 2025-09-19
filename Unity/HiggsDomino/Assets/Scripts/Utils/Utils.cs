using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace HiggsDomino.Utils
{
    /// <summary>
    /// Provides utility functions used throughout the project
    /// </summary>
    public static class Utils
    {
        /// <summary>
        /// Shuffles a list using the Fisher-Yates algorithm
        /// </summary>
        /// <typeparam name="T">List type</typeparam>
        /// <param name="list">List to shuffle</param>
        public static void Shuffle<T>(this IList<T> list)
        {
            System.Random rng = new System.Random();
            int n = list.Count;
            while (n > 1)
            {
                n--;
                int k = rng.Next(n + 1);
                T value = list[k];
                list[k] = list[n];
                list[n] = value;
            }
        }

        /// <summary>
        /// Formats a number with commas for thousands
        /// </summary>
        /// <param name="number">Number to format</param>
        /// <returns>Formatted number</returns>
        public static string FormatNumber(int number)
        {
            return string.Format("{0:N0}", number);
        }

        /// <summary>
        /// Formats a time span in minutes and seconds
        /// </summary>
        /// <param name="seconds">Time in seconds</param>
        /// <returns>Formatted time</returns>
        public static string FormatTime(float seconds)
        {
            TimeSpan timeSpan = TimeSpan.FromSeconds(seconds);
            return string.Format("{0:D2}:{1:D2}", timeSpan.Minutes, timeSpan.Seconds);
        }

        /// <summary>
        /// Formats a date and time
        /// </summary>
        /// <param name="dateTime">Date and time</param>
        /// <returns>Formatted date and time</returns>
        public static string FormatDateTime(DateTime dateTime)
        {
            return dateTime.ToString("MMM dd, yyyy HH:mm");
        }

        /// <summary>
        /// Gets a color from a hex string
        /// </summary>
        /// <param name="hex">Hex color string</param>
        /// <returns>Color</returns>
        public static Color HexToColor(string hex)
        {
            if (string.IsNullOrEmpty(hex))
            {
                return Color.white;
            }

            if (hex.StartsWith("#"))
            {
                hex = hex.Substring(1);
            }

            if (hex.Length == 6)
            {
                hex += "FF";
            }

            if (hex.Length != 8)
            {
                return Color.white;
            }

            byte r = byte.Parse(hex.Substring(0, 2), System.Globalization.NumberStyles.HexNumber);
            byte g = byte.Parse(hex.Substring(2, 2), System.Globalization.NumberStyles.HexNumber);
            byte b = byte.Parse(hex.Substring(4, 2), System.Globalization.NumberStyles.HexNumber);
            byte a = byte.Parse(hex.Substring(6, 2), System.Globalization.NumberStyles.HexNumber);

            return new Color32(r, g, b, a);
        }

        /// <summary>
        /// Converts a color to a hex string
        /// </summary>
        /// <param name="color">Color</param>
        /// <returns>Hex color string</returns>
        public static string ColorToHex(Color color)
        {
            Color32 color32 = (Color32)color;
            return string.Format("#{0:X2}{1:X2}{2:X2}{3:X2}", color32.r, color32.g, color32.b, color32.a);
        }

        /// <summary>
        /// Sets the alpha of a color
        /// </summary>
        /// <param name="color">Color</param>
        /// <param name="alpha">Alpha value</param>
        /// <returns>Color with new alpha</returns>
        public static Color SetAlpha(this Color color, float alpha)
        {
            return new Color(color.r, color.g, color.b, alpha);
        }

        /// <summary>
        /// Sets the alpha of a UI element
        /// </summary>
        /// <param name="graphic">UI element</param>
        /// <param name="alpha">Alpha value</param>
        public static void SetAlpha(this Graphic graphic, float alpha)
        {
            Color color = graphic.color;
            color.a = alpha;
            graphic.color = color;
        }

        /// <summary>
        /// Gets a random element from a list
        /// </summary>
        /// <typeparam name="T">List type</typeparam>
        /// <param name="list">List</param>
        /// <returns>Random element</returns>
        public static T GetRandomElement<T>(this IList<T> list)
        {
            if (list == null || list.Count == 0)
            {
                throw new ArgumentException("Cannot get a random element from an empty list");
            }

            return list[UnityEngine.Random.Range(0, list.Count)];
        }

        /// <summary>
        /// Truncates a string to a maximum length
        /// </summary>
        /// <param name="value">String to truncate</param>
        /// <param name="maxLength">Maximum length</param>
        /// <param name="suffix">Suffix to add if truncated</param>
        /// <returns>Truncated string</returns>
        public static string Truncate(this string value, int maxLength, string suffix = "...")
        {
            if (string.IsNullOrEmpty(value)) return value;
            return value.Length <= maxLength ? value : value.Substring(0, maxLength) + suffix;
        }

        /// <summary>
        /// Gets a sprite from a texture
        /// </summary>
        /// <param name="texture">Texture</param>
        /// <returns>Sprite</returns>
        public static Sprite TextureToSprite(Texture2D texture)
        {
            if (texture == null) return null;
            return Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height), new Vector2(0.5f, 0.5f));
        }

        /// <summary>
        /// Gets the current timestamp in seconds
        /// </summary>
        /// <returns>Current timestamp</returns>
        public static long GetTimestamp()
        {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
        }

        /// <summary>
        /// Gets a DateTime from a timestamp
        /// </summary>
        /// <param name="timestamp">Timestamp in seconds</param>
        /// <returns>DateTime</returns>
        public static DateTime TimestampToDateTime(long timestamp)
        {
            return new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddSeconds(timestamp);
        }

        /// <summary>
        /// Generates a random string
        /// </summary>
        /// <param name="length">String length</param>
        /// <returns>Random string</returns>
        public static string GenerateRandomString(int length)
        {
            const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            System.Random random = new System.Random();
            char[] result = new char[length];

            for (int i = 0; i < length; i++)
            {
                result[i] = chars[random.Next(chars.Length)];
            }

            return new string(result);
        }

        /// <summary>
        /// Generates a random color
        /// </summary>
        /// <param name="saturation">Color saturation</param>
        /// <param name="value">Color value</param>
        /// <returns>Random color</returns>
        public static Color GenerateRandomColor(float saturation = 0.7f, float value = 0.7f)
        {
            float hue = UnityEngine.Random.Range(0f, 1f);
            return Color.HSVToRGB(hue, saturation, value);
        }

        /// <summary>
        /// Destroys all children of a transform
        /// </summary>
        /// <param name="transform">Parent transform</param>
        public static void DestroyChildren(this Transform transform)
        {
            for (int i = transform.childCount - 1; i >= 0; i--)
            {
                GameObject.Destroy(transform.GetChild(i).gameObject);
            }
        }

        /// <summary>
        /// Converts a string to a boolean
        /// </summary>
        /// <param name="value">String value</param>
        /// <param name="defaultValue">Default value if conversion fails</param>
        /// <returns>Boolean value</returns>
        public static bool ToBool(this string value, bool defaultValue = false)
        {
            if (string.IsNullOrEmpty(value)) return defaultValue;

            value = value.ToLower().Trim();

            if (value == "true" || value == "1" || value == "yes" || value == "y")
            {
                return true;
            }

            if (value == "false" || value == "0" || value == "no" || value == "n")
            {
                return false;
            }

            return defaultValue;
        }

        /// <summary>
        /// Converts a string to an integer
        /// </summary>
        /// <param name="value">String value</param>
        /// <param name="defaultValue">Default value if conversion fails</param>
        /// <returns>Integer value</returns>
        public static int ToInt(this string value, int defaultValue = 0)
        {
            if (string.IsNullOrEmpty(value)) return defaultValue;

            if (int.TryParse(value, out int result))
            {
                return result;
            }

            return defaultValue;
        }

        /// <summary>
        /// Converts a string to a float
        /// </summary>
        /// <param name="value">String value</param>
        /// <param name="defaultValue">Default value if conversion fails</param>
        /// <returns>Float value</returns>
        public static float ToFloat(this string value, float defaultValue = 0f)
        {
            if (string.IsNullOrEmpty(value)) return defaultValue;

            if (float.TryParse(value, out float result))
            {
                return result;
            }

            return defaultValue;
        }
    }
}