using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace HiggsDomino.Network
{
    /// <summary>
    /// Handles API requests to the server
    /// </summary>
    public class ApiClient : MonoBehaviour
    {
        [SerializeField] private string baseUrl = "https://api.higgsdominoserver.com/v1";
        [SerializeField] private float requestTimeout = 10f;

        private string authToken;

        /// <summary>
        /// Sets the authentication token for API requests
        /// </summary>
        /// <param name="token">Authentication token</param>
        public void SetAuthToken(string token)
        {
            authToken = token;
        }

        /// <summary>
        /// Clears the authentication token
        /// </summary>
        public void ClearAuthToken()
        {
            authToken = null;
        }

        /// <summary>
        /// Sends a GET request to the specified endpoint
        /// </summary>
        /// <param name="endpoint">API endpoint</param>
        /// <param name="onSuccess">Success callback</param>
        /// <param name="onError">Error callback</param>
        /// <param name="useAuth">Whether to use authentication</param>
        public void Get(string endpoint, Action<string> onSuccess, Action<string> onError, bool useAuth = true)
        {
            StartCoroutine(SendRequest(endpoint, "GET", null, onSuccess, onError, useAuth));
        }

        /// <summary>
        /// Sends a POST request to the specified endpoint
        /// </summary>
        /// <param name="endpoint">API endpoint</param>
        /// <param name="data">Request data</param>
        /// <param name="onSuccess">Success callback</param>
        /// <param name="onError">Error callback</param>
        /// <param name="useAuth">Whether to use authentication</param>
        public void Post(string endpoint, string data, Action<string> onSuccess, Action<string> onError, bool useAuth = true)
        {
            StartCoroutine(SendRequest(endpoint, "POST", data, onSuccess, onError, useAuth));
        }

        /// <summary>
        /// Sends a PUT request to the specified endpoint
        /// </summary>
        /// <param name="endpoint">API endpoint</param>
        /// <param name="data">Request data</param>
        /// <param name="onSuccess">Success callback</param>
        /// <param name="onError">Error callback</param>
        /// <param name="useAuth">Whether to use authentication</param>
        public void Put(string endpoint, string data, Action<string> onSuccess, Action<string> onError, bool useAuth = true)
        {
            StartCoroutine(SendRequest(endpoint, "PUT", data, onSuccess, onError, useAuth));
        }

        /// <summary>
        /// Sends a DELETE request to the specified endpoint
        /// </summary>
        /// <param name="endpoint">API endpoint</param>
        /// <param name="onSuccess">Success callback</param>
        /// <param name="onError">Error callback</param>
        /// <param name="useAuth">Whether to use authentication</param>
        public void Delete(string endpoint, Action<string> onSuccess, Action<string> onError, bool useAuth = true)
        {
            StartCoroutine(SendRequest(endpoint, "DELETE", null, onSuccess, onError, useAuth));
        }

        /// <summary>
        /// Sends a request to the specified endpoint
        /// </summary>
        /// <param name="endpoint">API endpoint</param>
        /// <param name="method">HTTP method</param>
        /// <param name="data">Request data</param>
        /// <param name="onSuccess">Success callback</param>
        /// <param name="onError">Error callback</param>
        /// <param name="useAuth">Whether to use authentication</param>
        private IEnumerator SendRequest(string endpoint, string method, string data, Action<string> onSuccess, Action<string> onError, bool useAuth)
        {
            string url = baseUrl + endpoint;
            UnityWebRequest request = new UnityWebRequest(url, method);

            // Set timeout
            request.timeout = Mathf.RoundToInt(requestTimeout);

            // Set request body if provided
            if (!string.IsNullOrEmpty(data))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(data);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.SetRequestHeader("Content-Type", "application/json");
            }

            // Set download handler
            request.downloadHandler = new DownloadHandlerBuffer();

            // Set authentication header if required
            if (useAuth && !string.IsNullOrEmpty(authToken))
            {
                request.SetRequestHeader("Authorization", "Bearer " + authToken);
            }

            // Set common headers
            request.SetRequestHeader("Accept", "application/json");
            request.SetRequestHeader("X-Client-Version", Application.version);
            request.SetRequestHeader("X-Platform", Application.platform.ToString());

            // Send request
            yield return request.SendWebRequest();

            // Handle response
            if (request.result == UnityWebRequest.Result.Success)
            {
                onSuccess?.Invoke(request.downloadHandler.text);
            }
            else
            {
                string errorMessage = request.error;
                if (!string.IsNullOrEmpty(request.downloadHandler.text))
                {
                    errorMessage = request.downloadHandler.text;
                }
                onError?.Invoke(errorMessage);
                Debug.LogError($"API Error ({method} {endpoint}): {errorMessage}");
            }

            request.Dispose();
        }

        /// <summary>
        /// Downloads a texture from the specified URL
        /// </summary>
        /// <param name="url">Texture URL</param>
        /// <param name="onSuccess">Success callback</param>
        /// <param name="onError">Error callback</param>
        public void DownloadTexture(string url, Action<Texture2D> onSuccess, Action<string> onError)
        {
            StartCoroutine(DownloadTextureCoroutine(url, onSuccess, onError));
        }

        /// <summary>
        /// Downloads a texture from the specified URL
        /// </summary>
        /// <param name="url">Texture URL</param>
        /// <param name="onSuccess">Success callback</param>
        /// <param name="onError">Error callback</param>
        private IEnumerator DownloadTextureCoroutine(string url, Action<Texture2D> onSuccess, Action<string> onError)
        {
            using (UnityWebRequest request = UnityWebRequestTexture.GetTexture(url))
            {
                // Set timeout
                request.timeout = Mathf.RoundToInt(requestTimeout);

                // Send request
                yield return request.SendWebRequest();

                // Handle response
                if (request.result == UnityWebRequest.Result.Success)
                {
                    Texture2D texture = DownloadHandlerTexture.GetContent(request);
                    onSuccess?.Invoke(texture);
                }
                else
                {
                    string errorMessage = request.error;
                    onError?.Invoke(errorMessage);
                    Debug.LogError($"Texture Download Error ({url}): {errorMessage}");
                }
            }
        }

        /// <summary>
        /// Builds a query string from a dictionary of parameters
        /// </summary>
        /// <param name="parameters">Query parameters</param>
        /// <returns>Query string</returns>
        public string BuildQueryString(Dictionary<string, string> parameters)
        {
            if (parameters == null || parameters.Count == 0)
            {
                return string.Empty;
            }

            StringBuilder sb = new StringBuilder("?");
            bool first = true;

            foreach (var param in parameters)
            {
                if (!first)
                {
                    sb.Append("&");
                }

                sb.Append(UnityWebRequest.EscapeURL(param.Key));
                sb.Append("=");
                sb.Append(UnityWebRequest.EscapeURL(param.Value));

                first = false;
            }

            return sb.ToString();
        }
    }
}