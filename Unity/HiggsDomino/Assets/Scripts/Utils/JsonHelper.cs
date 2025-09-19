using System;
using System.Collections.Generic;
using UnityEngine;

namespace HiggsDomino.Utils
{
    /// <summary>
    /// Helper class for JSON serialization and deserialization
    /// </summary>
    public static class JsonHelper
    {
        /// <summary>
        /// Converts an array of JSON strings to an array of objects
        /// </summary>
        /// <typeparam name="T">Object type</typeparam>
        /// <param name="json">JSON string</param>
        /// <returns>Array of objects</returns>
        public static T[] FromJsonArray<T>(string json)
        {
            if (string.IsNullOrEmpty(json))
            {
                return new T[0];
            }

            string newJson = "{ \"items\": " + json + "}";
            Wrapper<T> wrapper = JsonUtility.FromJson<Wrapper<T>>(newJson);
            return wrapper.items;
        }

        /// <summary>
        /// Converts a list of objects to a JSON string
        /// </summary>
        /// <typeparam name="T">Object type</typeparam>
        /// <param name="array">Array of objects</param>
        /// <returns>JSON string</returns>
        public static string ToJson<T>(T[] array)
        {
            Wrapper<T> wrapper = new Wrapper<T>();
            wrapper.items = array;
            return JsonUtility.ToJson(wrapper);
        }

        /// <summary>
        /// Converts a list of objects to a JSON string
        /// </summary>
        /// <typeparam name="T">Object type</typeparam>
        /// <param name="array">Array of objects</param>
        /// <param name="prettyPrint">Whether to format the JSON string</param>
        /// <returns>JSON string</returns>
        public static string ToJson<T>(T[] array, bool prettyPrint)
        {
            Wrapper<T> wrapper = new Wrapper<T>();
            wrapper.items = array;
            return JsonUtility.ToJson(wrapper, prettyPrint);
        }

        /// <summary>
        /// Converts a list of objects to a JSON string
        /// </summary>
        /// <typeparam name="T">Object type</typeparam>
        /// <param name="list">List of objects</param>
        /// <returns>JSON string</returns>
        public static string ToJson<T>(List<T> list)
        {
            return ToJson(list.ToArray());
        }

        /// <summary>
        /// Converts a list of objects to a JSON string
        /// </summary>
        /// <typeparam name="T">Object type</typeparam>
        /// <param name="list">List of objects</param>
        /// <param name="prettyPrint">Whether to format the JSON string</param>
        /// <returns>JSON string</returns>
        public static string ToJson<T>(List<T> list, bool prettyPrint)
        {
            return ToJson(list.ToArray(), prettyPrint);
        }

        /// <summary>
        /// Converts a JSON string to a list of objects
        /// </summary>
        /// <typeparam name="T">Object type</typeparam>
        /// <param name="json">JSON string</param>
        /// <returns>List of objects</returns>
        public static List<T> FromJsonList<T>(string json)
        {
            if (string.IsNullOrEmpty(json))
            {
                return new List<T>();
            }

            return new List<T>(FromJsonArray<T>(json));
        }

        /// <summary>
        /// Tries to parse a JSON string to an object
        /// </summary>
        /// <typeparam name="T">Object type</typeparam>
        /// <param name="json">JSON string</param>
        /// <param name="result">Parsed object</param>
        /// <returns>Whether parsing was successful</returns>
        public static bool TryParseJson<T>(string json, out T result)
        {
            result = default;

            if (string.IsNullOrEmpty(json))
            {
                return false;
            }

            try
            {
                result = JsonUtility.FromJson<T>(json);
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Failed to parse JSON: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Gets a value from a JSON string
        /// </summary>
        /// <param name="json">JSON string</param>
        /// <param name="key">Key</param>
        /// <returns>Value</returns>
        public static string GetValue(string json, string key)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(key))
            {
                return null;
            }

            // Simple JSON parsing to get a value
            string searchKey = $"\"{key}\":"; // "key":  format
            int keyIndex = json.IndexOf(searchKey);

            if (keyIndex == -1)
            {
                return null;
            }

            int valueStartIndex = keyIndex + searchKey.Length;
            int valueEndIndex;

            // Skip whitespace
            while (valueStartIndex < json.Length && char.IsWhiteSpace(json[valueStartIndex]))
            {
                valueStartIndex++;
            }

            if (valueStartIndex >= json.Length)
            {
                return null;
            }

            // Check if value is a string
            if (json[valueStartIndex] == '"')
            {
                valueStartIndex++; // Skip opening quote
                valueEndIndex = json.IndexOf('"', valueStartIndex);

                if (valueEndIndex == -1)
                {
                    return null;
                }

                return json.Substring(valueStartIndex, valueEndIndex - valueStartIndex);
            }

            // Value is a number, boolean, or null
            valueEndIndex = json.IndexOfAny(new char[] { ',', '}' }, valueStartIndex);

            if (valueEndIndex == -1)
            {
                return null;
            }

            return json.Substring(valueStartIndex, valueEndIndex - valueStartIndex).Trim();
        }

        /// <summary>
        /// Wrapper class for JSON serialization
        /// </summary>
        /// <typeparam name="T">Object type</typeparam>
        [Serializable]
        private class Wrapper<T>
        {
            public T[] items;
        }
    }
}