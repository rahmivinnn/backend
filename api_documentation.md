# Higgs Domino API Documentation

Comprehensive REST API documentation for the Higgs Domino gaming platform.

## 📋 Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Base URLs](#base-urls)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [API Endpoints](#api-endpoints)
  - [Authentication](#authentication-endpoints)
  - [User Management](#user-management)
  - [Game Management](#game-management)
  - [Economy & Transactions](#economy--transactions)
  - [Social Features](#social-features)
  - [Tournaments](#tournaments)
  - [Achievements](#achievements)
  - [Admin](#admin)
- [WebSocket Events](#websocket-events)
- [SDK Examples](#sdk-examples)

## 🌐 Overview

The Higgs Domino API is a RESTful web service that provides access to all platform features including user management, gaming, social interactions, and administrative functions.

### API Version
- **Current Version**: v1
- **Protocol**: HTTPS
- **Format**: JSON
- **Authentication**: JWT Bearer Token

### Features
- **Real-time Gaming**: WebSocket support for live games
- **Multi-currency Wallet**: Support for coins, gems, and tokens
- **Social Platform**: Friends, messaging, and notifications
- **Tournament System**: Competitive gaming events
- **Achievement System**: Progress tracking and rewards
- **VIP Program**: Level-based benefits and rewards

## Base URL
```
Production: https://api.yourgame.com/v1
Staging: https://staging-api.yourgame.com/v1
Development: http://localhost:3000/v1
```

## Authentication
All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Response Format
All API responses follow this standard format:
```json
{
  "success": true,
  "data": {},
  "message": "Success",
  "timestamp": "2024-01-15T10:30:00Z",
  "request_id": "uuid-here"
}
```

Error responses:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {}
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "request_id": "uuid-here"
}
```

## Rate Limiting
- General endpoints: 100 requests per minute
- Authentication endpoints: 10 requests per minute
- Game action endpoints: 200 requests per minute

---

## Authentication Endpoints

### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "display_name": "PlayerName",
  "device_id": "unique-device-identifier",
  "referral_code": "FRIEND123" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "user_id": 12345,
      "email": "user@example.com",
      "display_name": "PlayerName",
      "level": 1,
      "experience": 0
    },
    "tokens": {
      "access_token": "jwt-access-token",
      "refresh_token": "jwt-refresh-token",
      "expires_in": 3600
    }
  }
}
```

### POST /auth/login
Authenticate user and get access tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "device_id": "unique-device-identifier"
}
```

### POST /auth/guest-login
Create a guest account for quick play.

**Request Body:**
```json
{
  "device_id": "unique-device-identifier",
  "device_info": {
    "platform": "android",
    "version": "1.0.0",
    "model": "Samsung Galaxy S21"
  }
}
```

### POST /auth/refresh
Refresh access token using refresh token.

### POST /auth/logout
Invalidate current session.

---

## User Management

### GET /users/profile
Get current user's profile information.

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": 12345,
    "display_name": "PlayerName",
    "email": "user@example.com",
    "level": 15,
    "experience": 2500,
    "avatar_url": "https://cdn.example.com/avatars/12345.jpg",
    "country": "US",
    "registration_date": "2024-01-01T00:00:00Z",
    "last_login_at": "2024-01-15T10:00:00Z",
    "is_premium": false,
    "stats": {
      "total_games": 150,
      "games_won": 95,
      "win_rate": 63.33,
      "highest_score": 15000,
      "total_playtime_hours": 45
    }
  }
}
```

### PUT /users/profile
Update user profile information.

**Request Body:**
```json
{
  "display_name": "NewPlayerName",
  "avatar_url": "https://cdn.example.com/avatars/new.jpg",
  "country": "CA"
}
```

### GET /users/{user_id}
Get public profile of another user.

### POST /users/upload-avatar
Upload user avatar image.

**Request:** Multipart form data with image file

---

## Game Sessions

### GET /rooms
Get list of available game rooms.

**Query Parameters:**
- `room_type`: Filter by room type (classic, quick, tournament)
- `min_bet`: Minimum bet amount
- `max_bet`: Maximum bet amount
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "rooms": [
      {
        "room_id": "uuid-here",
        "room_name": "Beginner Room",
        "room_type": "classic",
        "min_bet": 100,
        "max_bet": 1000,
        "current_players": 2,
        "max_players": 4,
        "status": "waiting",
        "created_at": "2024-01-15T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "total_pages": 3
    }
  }
}
```

### POST /rooms
Create a new game room.

**Request Body:**
```json
{
  "room_name": "My Private Room",
  "room_type": "classic",
  "min_bet": 500,
  "max_bet": 5000,
  "max_players": 4,
  "is_private": true,
  "password": "optional-password"
}
```

### POST /rooms/{room_id}/join
Join an existing game room.

**Request Body:**
```json
{
  "password": "room-password" // if required
}
```

### POST /rooms/{room_id}/leave
Leave a game room.

### GET /rooms/{room_id}
Get detailed information about a specific room.

### POST /games/start
Start a new game session.

**Request Body:**
```json
{
  "room_id": "uuid-here",
  "bet_amount": 1000
}
```

### POST /games/{session_id}/move
Make a game move.

**Request Body:**
```json
{
  "move_type": "place_domino",
  "move_data": {
    "domino_id": 15,
    "position": {"x": 5, "y": 3},
    "orientation": "horizontal"
  }
}
```

### GET /games/{session_id}/state
Get current game state.

---

## Economy & Transactions

### GET /wallet
Get user's wallet information.

**Response:**
```json
{
  "success": true,
  "data": {
    "balances": [
      {
        "currency_type": "COIN",
        "balance": 15000,
        "last_updated": "2024-01-15T10:00:00Z"
      },
      {
        "currency_type": "GEM",
        "balance": 250,
        "last_updated": "2024-01-15T10:00:00Z"
      }
    ],
    "total_earned": 50000,
    "total_spent": 35000
  }
}
```

### GET /transactions
Get transaction history.

**Query Parameters:**
- `type`: Filter by transaction type
- `currency`: Filter by currency type
- `start_date`: Start date filter
- `end_date`: End date filter
- `page`: Page number
- `limit`: Items per page

### POST /shop/purchase
Purchase items from the shop.

**Request Body:**
```json
{
  "item_id": 123,
  "quantity": 1,
  "currency_type": "COIN"
}
```

### GET /shop/items
Get available shop items.

### POST /gifts/send
Send a gift to another user.

**Request Body:**
```json
{
  "recipient_user_id": 67890,
  "gift_type": "COIN",
  "amount": 1000,
  "message": "Good game!"
}
```

### GET /gifts/received
Get received gifts.

### POST /gifts/{gift_id}/claim
Claim a received gift.

---

## Social Features

### GET /friends
Get user's friends list.

**Response:**
```json
{
  "success": true,
  "data": {
    "friends": [
      {
        "user_id": 67890,
        "display_name": "FriendName",
        "avatar_url": "https://cdn.example.com/avatars/67890.jpg",
        "level": 12,
        "is_online": true,
        "last_login": "2024-01-15T09:30:00Z",
        "games_played_together": 25,
        "friends_since": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

### POST /friends/request
Send a friend request.

**Request Body:**
```json
{
  "user_id": 67890
}
```

### POST /friends/accept
Accept a friend request.

### POST /friends/decline
Decline a friend request.

### DELETE /friends/{user_id}
Remove a friend.

### GET /friends/requests
Get pending friend requests.

---

## Chat System

### GET /chat/channels
Get user's chat channels.

### POST /chat/channels
Create a new chat channel.

### GET /chat/channels/{channel_id}/messages
Get messages from a chat channel.

**Query Parameters:**
- `before`: Get messages before this message ID
- `limit`: Number of messages (default: 50, max: 100)

### POST /chat/channels/{channel_id}/messages
Send a message to a chat channel.

**Request Body:**
```json
{
  "content": "Hello everyone!",
  "message_type": "text",
  "reply_to_message_id": "uuid-here" // optional
}
```

### POST /chat/messages/{message_id}/react
Add a reaction to a message.

**Request Body:**
```json
{
  "emoji_code": "👍"
}
```

---

## Clans

### GET /clans
Search for clans.

**Query Parameters:**
- `search`: Search by name or tag
- `min_members`: Minimum member count
- `type`: Clan type filter
- `page`: Page number
- `limit`: Items per page

### POST /clans
Create a new clan.

**Request Body:**
```json
{
  "clan_name": "Elite Players",
  "clan_tag": "ELITE",
  "description": "For serious players only",
  "clan_type": "invite_only",
  "min_level_required": 10
}
```

### GET /clans/{clan_id}
Get clan details.

### POST /clans/{clan_id}/join
Request to join a clan.

### POST /clans/{clan_id}/leave
Leave a clan.

### GET /clans/{clan_id}/members
Get clan members.

### POST /clans/{clan_id}/members/{user_id}/promote
Promote a clan member.

### POST /clans/{clan_id}/members/{user_id}/kick
Kick a clan member.

---

## Leaderboards

### GET /leaderboards
Get available leaderboard categories.

### GET /leaderboards/{category}/rankings
Get rankings for a specific category.

**Query Parameters:**
- `season_id`: Specific season (optional, defaults to current)
- `page`: Page number
- `limit`: Items per page
- `around_user`: Get rankings around specific user

**Response:**
```json
{
  "success": true,
  "data": {
    "season_info": {
      "season_id": "uuid-here",
      "season_name": "Winter Championship 2024",
      "starts_at": "2024-01-01T00:00:00Z",
      "ends_at": "2024-03-31T23:59:59Z"
    },
    "user_rank": {
      "current_rank": 156,
      "total_score": 25000,
      "games_played": 89
    },
    "rankings": [
      {
        "rank": 1,
        "user_id": 11111,
        "display_name": "TopPlayer",
        "avatar_url": "https://cdn.example.com/avatars/11111.jpg",
        "total_score": 150000,
        "games_played": 500,
        "win_rate": 85.2
      }
    ]
  }
}
```

### GET /leaderboards/hall-of-fame
Get hall of fame records.

---

## Events & Tournaments

### GET /events
Get active and upcoming events.

**Response:**
```json
{
  "success": true,
  "data": {
    "active_events": [
      {
        "event_id": "uuid-here",
        "event_name": "Weekend Bonus",
        "event_type": "limited_time",
        "description": "Double coins for all games!",
        "starts_at": "2024-01-13T00:00:00Z",
        "ends_at": "2024-01-15T23:59:59Z",
        "is_participating": true,
        "user_progress": {
          "current_score": 5000,
          "rank_position": 45
        }
      }
    ],
    "upcoming_events": []
  }
}
```

### POST /events/{event_id}/join
Join an event.

### GET /events/{event_id}/leaderboard
Get event leaderboard.

### POST /events/{event_id}/claim-rewards
Claim event rewards.

---

## Notifications

### GET /notifications
Get user notifications.

**Query Parameters:**
- `status`: Filter by status (unread, read, all)
- `type`: Filter by notification type
- `page`: Page number
- `limit`: Items per page

### POST /notifications/{notification_id}/read
Mark notification as read.

### POST /notifications/read-all
Mark all notifications as read.

### GET /notifications/preferences
Get notification preferences.

### PUT /notifications/preferences
Update notification preferences.

**Request Body:**
```json
{
  "preferences": [
    {
      "type_code": "friend_request",
      "in_game_enabled": true,
      "push_enabled": true,
      "email_enabled": false
    }
  ]
}
```

---

## Admin Endpoints

### GET /admin/users
Get users list (admin only).

### POST /admin/users/{user_id}/ban
Ban a user (admin only).

### POST /admin/announcements
Create system announcement (admin only).

### GET /admin/analytics/dashboard
Get analytics dashboard data (admin only).

---

## WebSocket Events

The game uses WebSocket connections for real-time features:

### Connection
```javascript
const socket = io('wss://api.yourgame.com', {
  auth: {
    token: 'jwt-access-token'
  }
});
```

### Game Events
- `game:move` - Player made a move
- `game:state_update` - Game state changed
- `game:player_joined` - Player joined room
- `game:player_left` - Player left room
- `game:ended` - Game finished

### Chat Events
- `chat:message` - New chat message
- `chat:user_typing` - User is typing
- `chat:user_joined` - User joined channel
- `chat:user_left` - User left channel

### Social Events
- `friend:request` - New friend request
- `friend:accepted` - Friend request accepted
- `friend:online` - Friend came online
- `friend:offline` - Friend went offline

### Notification Events
- `notification:new` - New notification received
- `notification:update` - Notification status updated

---

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `AUTHENTICATION_REQUIRED` | Valid authentication required |
| `INSUFFICIENT_PERMISSIONS` | User lacks required permissions |
| `RESOURCE_NOT_FOUND` | Requested resource not found |
| `INSUFFICIENT_FUNDS` | Not enough currency for transaction |
| `GAME_FULL` | Game room is full |
| `INVALID_MOVE` | Game move is not valid |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `SERVER_ERROR` | Internal server error |
| `MAINTENANCE_MODE` | Server is in maintenance mode |

---

## SDK Examples

### Unity C# Example
```csharp
// Initialize API client
var apiClient = new GameApiClient("https://api.yourgame.com/v1");
apiClient.SetAuthToken("jwt-access-token");

// Get user profile
var profile = await apiClient.GetUserProfile();
Debug.Log($"Welcome {profile.DisplayName}!");

// Join a game room
var joinResult = await apiClient.JoinRoom("room-uuid-here");
if (joinResult.Success) {
    Debug.Log("Joined room successfully!");
}
```

### JavaScript Example
```javascript
// Initialize API client
const api = new GameAPI('https://api.yourgame.com/v1');
api.setAuthToken('jwt-access-token');

// Get leaderboard
const leaderboard = await api.getLeaderboard('weekly_score');
console.log('Top players:', leaderboard.rankings);

// Send chat message
const message = await api.sendChatMessage('channel-id', {
  content: 'Hello everyone!',
  type: 'text'
});
```