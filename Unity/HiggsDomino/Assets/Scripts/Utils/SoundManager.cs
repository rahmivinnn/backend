using System.Collections.Generic;
using UnityEngine;

namespace HiggsDomino.Utils
{
    /// <summary>
    /// Manages sound and music in the game
    /// </summary>
    public class SoundManager : MonoBehaviour
    {
        #region Singleton
        private static SoundManager _instance;

        /// <summary>
        /// Gets the singleton instance
        /// </summary>
        public static SoundManager Instance
        {
            get
            {
                if (_instance == null)
                {
                    GameObject go = new GameObject("SoundManager");
                    _instance = go.AddComponent<SoundManager>();
                    DontDestroyOnLoad(go);
                }

                return _instance;
            }
        }
        #endregion

        [System.Serializable]
        public class SoundClip
        {
            public string name;
            public AudioClip clip;
            [Range(0f, 1f)]
            public float volume = 1f;
            [Range(0.1f, 3f)]
            public float pitch = 1f;
            public bool loop = false;

            [HideInInspector]
            public AudioSource source;
        }

        [Header("Sound Settings")]
        [SerializeField] private List<SoundClip> soundClips = new List<SoundClip>();
        [SerializeField] private List<SoundClip> musicClips = new List<SoundClip>();

        private AudioSource _musicSource;
        private string _currentMusicName;
        private Dictionary<string, SoundClip> _soundDictionary = new Dictionary<string, SoundClip>();
        private Dictionary<string, SoundClip> _musicDictionary = new Dictionary<string, SoundClip>();

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }

            _instance = this;
            DontDestroyOnLoad(gameObject);

            // Create music source
            GameObject musicObj = new GameObject("Music");
            musicObj.transform.SetParent(transform);
            _musicSource = musicObj.AddComponent<AudioSource>();
            _musicSource.loop = true;

            // Initialize sound clips
            foreach (SoundClip clip in soundClips)
            {
                if (clip.clip != null)
                {
                    GameObject soundObj = new GameObject(clip.name);
                    soundObj.transform.SetParent(transform);
                    clip.source = soundObj.AddComponent<AudioSource>();
                    clip.source.clip = clip.clip;
                    clip.source.volume = clip.volume;
                    clip.source.pitch = clip.pitch;
                    clip.source.loop = clip.loop;

                    _soundDictionary[clip.name] = clip;
                }
            }

            // Initialize music clips
            foreach (SoundClip clip in musicClips)
            {
                if (clip.clip != null)
                {
                    _musicDictionary[clip.name] = clip;
                }
            }
        }

        private void Start()
        {
            // Load sound settings
            SetSoundEnabled(PlayerPrefsManager.GetSoundEnabled());
            SetMusicEnabled(PlayerPrefsManager.GetMusicEnabled());
        }

        /// <summary>
        /// Plays a sound
        /// </summary>
        /// <param name="name">Sound name</param>
        public void PlaySound(string name)
        {
            if (!PlayerPrefsManager.GetSoundEnabled())
            {
                return;
            }

            if (_soundDictionary.TryGetValue(name, out SoundClip clip))
            {
                clip.source.Play();
            }
            else
            {
                Debug.LogWarning($"Sound clip {name} not found");
            }
        }

        /// <summary>
        /// Stops a sound
        /// </summary>
        /// <param name="name">Sound name</param>
        public void StopSound(string name)
        {
            if (_soundDictionary.TryGetValue(name, out SoundClip clip))
            {
                clip.source.Stop();
            }
        }

        /// <summary>
        /// Plays music
        /// </summary>
        /// <param name="name">Music name</param>
        public void PlayMusic(string name)
        {
            if (!PlayerPrefsManager.GetMusicEnabled())
            {
                return;
            }

            if (_currentMusicName == name && _musicSource.isPlaying)
            {
                return;
            }

            if (_musicDictionary.TryGetValue(name, out SoundClip clip))
            {
                _musicSource.clip = clip.clip;
                _musicSource.volume = clip.volume;
                _musicSource.pitch = clip.pitch;
                _musicSource.Play();
                _currentMusicName = name;
            }
            else
            {
                Debug.LogWarning($"Music clip {name} not found");
            }
        }

        /// <summary>
        /// Stops the current music
        /// </summary>
        public void StopMusic()
        {
            _musicSource.Stop();
            _currentMusicName = string.Empty;
        }

        /// <summary>
        /// Sets whether sound is enabled
        /// </summary>
        /// <param name="enabled">Whether sound is enabled</param>
        public void SetSoundEnabled(bool enabled)
        {
            PlayerPrefsManager.SaveCustomBool("sound_enabled", enabled);

            foreach (var clip in _soundDictionary.Values)
            {
                clip.source.mute = !enabled;
            }
        }

        /// <summary>
        /// Sets whether music is enabled
        /// </summary>
        /// <param name="enabled">Whether music is enabled</param>
        public void SetMusicEnabled(bool enabled)
        {
            PlayerPrefsManager.SaveCustomBool("music_enabled", enabled);

            _musicSource.mute = !enabled;

            if (enabled && !string.IsNullOrEmpty(_currentMusicName) && !_musicSource.isPlaying)
            {
                PlayMusic(_currentMusicName);
            }
            else if (!enabled && _musicSource.isPlaying)
            {
                _musicSource.Pause();
            }
        }

        /// <summary>
        /// Adds a sound clip at runtime
        /// </summary>
        /// <param name="name">Sound name</param>
        /// <param name="clip">Audio clip</param>
        /// <param name="volume">Volume</param>
        /// <param name="pitch">Pitch</param>
        /// <param name="loop">Whether to loop</param>
        public void AddSoundClip(string name, AudioClip clip, float volume = 1f, float pitch = 1f, bool loop = false)
        {
            if (_soundDictionary.ContainsKey(name))
            {
                Debug.LogWarning($"Sound clip {name} already exists");
                return;
            }

            GameObject soundObj = new GameObject(name);
            soundObj.transform.SetParent(transform);
            AudioSource source = soundObj.AddComponent<AudioSource>();
            source.clip = clip;
            source.volume = volume;
            source.pitch = pitch;
            source.loop = loop;
            source.mute = !PlayerPrefsManager.GetSoundEnabled();

            SoundClip soundClip = new SoundClip
            {
                name = name,
                clip = clip,
                volume = volume,
                pitch = pitch,
                loop = loop,
                source = source
            };

            _soundDictionary[name] = soundClip;
        }

        /// <summary>
        /// Adds a music clip at runtime
        /// </summary>
        /// <param name="name">Music name</param>
        /// <param name="clip">Audio clip</param>
        /// <param name="volume">Volume</param>
        /// <param name="pitch">Pitch</param>
        public void AddMusicClip(string name, AudioClip clip, float volume = 1f, float pitch = 1f)
        {
            if (_musicDictionary.ContainsKey(name))
            {
                Debug.LogWarning($"Music clip {name} already exists");
                return;
            }

            SoundClip musicClip = new SoundClip
            {
                name = name,
                clip = clip,
                volume = volume,
                pitch = pitch,
                loop = true
            };

            _musicDictionary[name] = musicClip;
        }

        /// <summary>
        /// Plays a vibration if enabled
        /// </summary>
        /// <param name="duration">Vibration duration in seconds</param>
        public void Vibrate(float duration = 0.1f)
        {
            if (!PlayerPrefsManager.GetVibrationEnabled())
            {
                return;
            }

#if UNITY_ANDROID && !UNITY_EDITOR
            Handheld.Vibrate();
#endif
        }
    }
}