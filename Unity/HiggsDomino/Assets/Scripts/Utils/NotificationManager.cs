using System;
using System.Collections.Generic;
using UnityEngine;

#if UNITY_ANDROID
using Unity.Notifications.Android;
#endif

#if UNITY_IOS
using Unity.Notifications.iOS;
#endif

namespace HiggsDomino.Utils
{
    /// <summary>
    /// Manages local and push notifications
    /// </summary>
    public class NotificationManager : MonoBehaviour
    {
        #region Singleton
        private static NotificationManager _instance;

        /// <summary>
        /// Gets the singleton instance
        /// </summary>
        public static NotificationManager Instance
        {
            get
            {
                if (_instance == null)
                {
                    GameObject go = new GameObject("NotificationManager");
                    _instance = go.AddComponent<NotificationManager>();
                    DontDestroyOnLoad(go);
                }

                return _instance;
            }
        }
        #endregion

        [Header("Notification Settings")]
        [SerializeField] private string channelId = "higgs_domino_channel";
        [SerializeField] private string channelName = "Higgs Domino";
        [SerializeField] private string channelDescription = "Notifications for Higgs Domino";

        private bool _initialized = false;

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }

            _instance = this;
            DontDestroyOnLoad(gameObject);

            Initialize();
        }

        /// <summary>
        /// Initializes the notification system
        /// </summary>
        private void Initialize()
        {
            if (_initialized)
            {
                return;
            }

#if UNITY_ANDROID
            // Create notification channel
            var channel = new AndroidNotificationChannel()
            {
                Id = channelId,
                Name = channelName,
                Importance = Importance.Default,
                Description = channelDescription,
            };

            AndroidNotificationCenter.RegisterNotificationChannel(channel);
#endif

#if UNITY_IOS
            // Request authorization
            iOSNotificationCenter.RequestAuthorization(AuthorizationOption.Alert | AuthorizationOption.Badge | AuthorizationOption.Sound);
#endif

            _initialized = true;
        }

        /// <summary>
        /// Schedules a local notification
        /// </summary>
        /// <param name="title">Notification title</param>
        /// <param name="message">Notification message</param>
        /// <param name="fireTime">Time to fire the notification</param>
        /// <param name="smallIcon">Small icon name (Android only)</param>
        /// <param name="largeIcon">Large icon name (Android only)</param>
        /// <returns>Notification ID</returns>
        public int ScheduleNotification(string title, string message, DateTime fireTime, string smallIcon = "icon_small", string largeIcon = "icon_large")
        {
            if (!PlayerPrefsManager.GetNotificationEnabled())
            {
                return -1;
            }

            if (!_initialized)
            {
                Initialize();
            }

            int notificationId = UnityEngine.Random.Range(1, 1000000);

#if UNITY_ANDROID
            var notification = new AndroidNotification
            {
                Title = title,
                Text = message,
                FireTime = fireTime,
                SmallIcon = smallIcon,
                LargeIcon = largeIcon
            };

            AndroidNotificationCenter.SendNotification(notification, channelId);
#endif

#if UNITY_IOS
            var notification = new iOSNotification
            {
                Identifier = notificationId.ToString(),
                Title = title,
                Body = message,
                ShowInForeground = true,
                ForegroundPresentationOption = PresentationOption.Alert | PresentationOption.Sound,
                CategoryIdentifier = "default",
                ThreadIdentifier = "higgs_domino",
                Trigger = new iOSNotificationTimeIntervalTrigger
                {
                    TimeInterval = (fireTime - DateTime.Now).TotalSeconds,
                    Repeats = false
                }
            };

            iOSNotificationCenter.ScheduleNotification(notification);
#endif

            return notificationId;
        }

        /// <summary>
        /// Schedules a repeating local notification
        /// </summary>
        /// <param name="title">Notification title</param>
        /// <param name="message">Notification message</param>
        /// <param name="firstFireTime">Time to fire the first notification</param>
        /// <param name="repeatInterval">Repeat interval in hours</param>
        /// <param name="smallIcon">Small icon name (Android only)</param>
        /// <param name="largeIcon">Large icon name (Android only)</param>
        /// <returns>Notification ID</returns>
        public int ScheduleRepeatingNotification(string title, string message, DateTime firstFireTime, int repeatInterval, string smallIcon = "icon_small", string largeIcon = "icon_large")
        {
            if (!PlayerPrefsManager.GetNotificationEnabled())
            {
                return -1;
            }

            if (!_initialized)
            {
                Initialize();
            }

            int notificationId = UnityEngine.Random.Range(1, 1000000);

#if UNITY_ANDROID
            var notification = new AndroidNotification
            {
                Title = title,
                Text = message,
                FireTime = firstFireTime,
                RepeatInterval = TimeSpan.FromHours(repeatInterval),
                SmallIcon = smallIcon,
                LargeIcon = largeIcon
            };

            AndroidNotificationCenter.SendNotification(notification, channelId);
#endif

#if UNITY_IOS
            var notification = new iOSNotification
            {
                Identifier = notificationId.ToString(),
                Title = title,
                Body = message,
                ShowInForeground = true,
                ForegroundPresentationOption = PresentationOption.Alert | PresentationOption.Sound,
                CategoryIdentifier = "default",
                ThreadIdentifier = "higgs_domino",
                Trigger = new iOSNotificationCalendarTrigger
                {
                    Hour = firstFireTime.Hour,
                    Minute = firstFireTime.Minute,
                    Repeats = true
                }
            };

            iOSNotificationCenter.ScheduleNotification(notification);
#endif

            return notificationId;
        }

        /// <summary>
        /// Schedules a daily local notification
        /// </summary>
        /// <param name="title">Notification title</param>
        /// <param name="message">Notification message</param>
        /// <param name="hour">Hour of the day (0-23)</param>
        /// <param name="minute">Minute of the hour (0-59)</param>
        /// <param name="smallIcon">Small icon name (Android only)</param>
        /// <param name="largeIcon">Large icon name (Android only)</param>
        /// <returns>Notification ID</returns>
        public int ScheduleDailyNotification(string title, string message, int hour, int minute, string smallIcon = "icon_small", string largeIcon = "icon_large")
        {
            if (!PlayerPrefsManager.GetNotificationEnabled())
            {
                return -1;
            }

            if (!_initialized)
            {
                Initialize();
            }

            int notificationId = UnityEngine.Random.Range(1, 1000000);

            // Calculate the next occurrence of the specified time
            DateTime now = DateTime.Now;
            DateTime fireTime = new DateTime(now.Year, now.Month, now.Day, hour, minute, 0);
            if (fireTime < now)
            {
                fireTime = fireTime.AddDays(1);
            }

#if UNITY_ANDROID
            var notification = new AndroidNotification
            {
                Title = title,
                Text = message,
                FireTime = fireTime,
                RepeatInterval = TimeSpan.FromDays(1),
                SmallIcon = smallIcon,
                LargeIcon = largeIcon
            };

            AndroidNotificationCenter.SendNotification(notification, channelId);
#endif

#if UNITY_IOS
            var notification = new iOSNotification
            {
                Identifier = notificationId.ToString(),
                Title = title,
                Body = message,
                ShowInForeground = true,
                ForegroundPresentationOption = PresentationOption.Alert | PresentationOption.Sound,
                CategoryIdentifier = "default",
                ThreadIdentifier = "higgs_domino",
                Trigger = new iOSNotificationCalendarTrigger
                {
                    Hour = hour,
                    Minute = minute,
                    Repeats = true
                }
            };

            iOSNotificationCenter.ScheduleNotification(notification);
#endif

            return notificationId;
        }

        /// <summary>
        /// Cancels a notification
        /// </summary>
        /// <param name="notificationId">Notification ID</param>
        public void CancelNotification(int notificationId)
        {
#if UNITY_ANDROID
            AndroidNotificationCenter.CancelNotification(notificationId);
#endif

#if UNITY_IOS
            iOSNotificationCenter.RemoveScheduledNotification(notificationId.ToString());
#endif
        }

        /// <summary>
        /// Cancels all notifications
        /// </summary>
        public void CancelAllNotifications()
        {
#if UNITY_ANDROID
            AndroidNotificationCenter.CancelAllNotifications();
#endif

#if UNITY_IOS
            iOSNotificationCenter.RemoveAllScheduledNotifications();
#endif
        }

        /// <summary>
        /// Schedules a reminder notification for inactive players
        /// </summary>
        public void ScheduleInactivityReminder()
        {
            // Schedule a notification for 24 hours from now
            ScheduleNotification(
                "Miss You!",
                "Come back and play Higgs Domino with your friends!",
                DateTime.Now.AddDays(1)
            );

            // Schedule a notification for 3 days from now
            ScheduleNotification(
                "Special Bonus Waiting!",
                "Return to Higgs Domino to claim your special bonus!",
                DateTime.Now.AddDays(3)
            );

            // Schedule a notification for 7 days from now
            ScheduleNotification(
                "Weekly Bonus Available",
                "Your weekly bonus is ready to claim in Higgs Domino!",
                DateTime.Now.AddDays(7)
            );
        }

        /// <summary>
        /// Schedules a daily bonus notification
        /// </summary>
        public void ScheduleDailyBonusReminder()
        {
            // Schedule a notification for 12:00 PM every day
            ScheduleDailyNotification(
                "Daily Bonus Available",
                "Your daily bonus is ready to claim in Higgs Domino!",
                12, 0
            );
        }

        /// <summary>
        /// Schedules a tournament reminder notification
        /// </summary>
        /// <param name="tournamentName">Tournament name</param>
        /// <param name="startTime">Tournament start time</param>
        public void ScheduleTournamentReminder(string tournamentName, DateTime startTime)
        {
            // Schedule a notification 1 hour before the tournament
            DateTime reminderTime = startTime.AddHours(-1);
            if (reminderTime > DateTime.Now)
            {
                ScheduleNotification(
                    "Tournament Starting Soon",
                    $"{tournamentName} is starting in 1 hour. Get ready to compete!",
                    reminderTime
                );
            }

            // Schedule a notification 10 minutes before the tournament
            reminderTime = startTime.AddMinutes(-10);
            if (reminderTime > DateTime.Now)
            {
                ScheduleNotification(
                    "Tournament Almost Starting",
                    $"{tournamentName} is starting in 10 minutes. Don't miss it!",
                    reminderTime
                );
            }
        }

        /// <summary>
        /// Schedules a friend activity notification
        /// </summary>
        /// <param name="friendName">Friend name</param>
        /// <param name="activity">Activity description</param>
        public void ScheduleFriendActivityNotification(string friendName, string activity)
        {
            ScheduleNotification(
                "Friend Activity",
                $"{friendName} {activity}",
                DateTime.Now.AddSeconds(5)
            );
        }
    }
}