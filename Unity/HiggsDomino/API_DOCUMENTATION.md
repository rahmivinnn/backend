# Higgs Domino API Documentation

## Base URL
```
https://api.higgsdomino.com/v1
```

## Authentication

All API requests except for login and registration require authentication. Authentication is done using a JWT token that is passed in the `Authorization` header.

```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

#### Register
```
POST /auth/register
```

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user_id": "string",
    "username": "string",
    "email": "string",
    "token": "string"
  }
}
```

#### Login
```
POST /auth/login
```

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user_id": "string",
    "username": "string",
    "email": "string",
    "token": "string",
    "profile": {
      "avatar": "string",
      "level": "number",
      "experience": "number",
      "coins": "number",
      "gems": "number",
      "vip_level": "number"
    }
  }
}
```

### User Profile

#### Get User Profile
```
GET /users/profile
```

**Response:**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "user_id": "string",
    "username": "string",
    "email": "string",
    "profile": {
      "avatar": "string",
      "level": "number",
      "experience": "number",
      "coins": "number",
      "gems": "number",
      "vip_level": "number",
      "games_played": "number",
      "games_won": "number",
      "win_rate": "number"
    }
  }
}
```

#### Update User Profile
```
PUT /users/profile
```

**Request Body:**
```json
{
  "username": "string",
  "avatar": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user_id": "string",
    "username": "string",
    "avatar": "string"
  }
}
```

### Game Rooms

#### Get Room List
```
GET /rooms
```

**Query Parameters:**
```
page: number (default: 1)
page_size: number (default: 10)
game_type: string (optional)
```

**Response:**
```json
{
  "success": true,
  "message": "Rooms retrieved successfully",
  "data": {
    "rooms": [
      {
        "room_id": "string",
        "name": "string",
        "host": {
          "user_id": "string",
          "username": "string",
          "avatar": "string"
        },
        "game_type": "string",
        "max_players": "number",
        "current_players": "number",
        "rounds": "number",
        "entry_fee": "number",
        "is_private": "boolean",
        "status": "string"
      }
    ],
    "pagination": {
      "total": "number",
      "page": "number",
      "page_size": "number",
      "total_pages": "number"
    }
  }
}
```

#### Create Room
```
POST /rooms
```

**Request Body:**
```json
{
  "name": "string",
  "game_type": "string",
  "max_players": "number",
  "rounds": "number",
  "entry_fee": "number",
  "is_private": "boolean",
  "password": "string" // Required if is_private is true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Room created successfully",
  "data": {
    "room_id": "string",
    "name": "string",
    "host": {
      "user_id": "string",
      "username": "string",
      "avatar": "string"
    },
    "game_type": "string",
    "max_players": "number",
    "current_players": "number",
    "rounds": "number",
    "entry_fee": "number",
    "is_private": "boolean",
    "status": "string",
    "websocket_url": "string"
  }
}
```

#### Join Room
```
POST /rooms/{room_id}/join
```

**Request Body:**
```json
{
  "password": "string" // Required if room is private
}
```

**Response:**
```json
{
  "success": true,
  "message": "Room joined successfully",
  "data": {
    "room_id": "string",
    "name": "string",
    "host": {
      "user_id": "string",
      "username": "string",
      "avatar": "string"
    },
    "players": [
      {
        "user_id": "string",
        "username": "string",
        "avatar": "string",
        "is_ready": "boolean"
      }
    ],
    "game_type": "string",
    "max_players": "number",
    "current_players": "number",
    "rounds": "number",
    "entry_fee": "number",
    "is_private": "boolean",
    "status": "string",
    "websocket_url": "string"
  }
}
```

#### Leave Room
```
POST /rooms/{room_id}/leave
```

**Response:**
```json
{
  "success": true,
  "message": "Room left successfully"
}
```

#### Get Room Details
```
GET /rooms/{room_id}
```

**Response:**
```json
{
  "success": true,
  "message": "Room details retrieved successfully",
  "data": {
    "room_id": "string",
    "name": "string",
    "host": {
      "user_id": "string",
      "username": "string",
      "avatar": "string"
    },
    "players": [
      {
        "user_id": "string",
        "username": "string",
        "avatar": "string",
        "is_ready": "boolean"
      }
    ],
    "game_type": "string",
    "max_players": "number",
    "current_players": "number",
    "rounds": "number",
    "entry_fee": "number",
    "is_private": "boolean",
    "status": "string"
  }
}
```

#### Set Ready Status
```
POST /rooms/{room_id}/ready
```

**Request Body:**
```json
{
  "is_ready": "boolean"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Ready status updated successfully"
}
```

#### Start Game
```
POST /rooms/{room_id}/start
```

**Response:**
```json
{
  "success": true,
  "message": "Game started successfully"
}
```

### Game History

#### Get Game History
```
GET /games/history
```

**Query Parameters:**
```
page: number (default: 1)
page_size: number (default: 10)
```

**Response:**
```json
{
  "success": true,
  "message": "Game history retrieved successfully",
  "data": {
    "games": [
      {
        "game_id": "string",
        "room_id": "string",
        "room_name": "string",
        "game_type": "string",
        "players": [
          {
            "user_id": "string",
            "username": "string",
            "avatar": "string",
            "score": "number",
            "is_winner": "boolean"
          }
        ],
        "winner_id": "string",
        "entry_fee": "number",
        "reward": "number",
        "rounds": "number",
        "created_at": "string",
        "ended_at": "string"
      }
    ],
    "pagination": {
      "total": "number",
      "page": "number",
      "page_size": "number",
      "total_pages": "number"
    }
  }
}
```

#### Get Game Details
```
GET /games/{game_id}
```

**Response:**
```json
{
  "success": true,
  "message": "Game details retrieved successfully",
  "data": {
    "game_id": "string",
    "room_id": "string",
    "room_name": "string",
    "game_type": "string",
    "players": [
      {
        "user_id": "string",
        "username": "string",
        "avatar": "string",
        "score": "number",
        "is_winner": "boolean",
        "hand_value": "number"
      }
    ],
    "winner_id": "string",
    "entry_fee": "number",
    "reward": "number",
    "rounds": "number",
    "created_at": "string",
    "ended_at": "string",
    "duration": "number"
  }
}
```

### Leaderboard

#### Get Leaderboard
```
GET /leaderboard
```

**Query Parameters:**
```
type: string (default: "weekly", options: "daily", "weekly", "monthly", "all_time")
page: number (default: 1)
page_size: number (default: 10)
```

**Response:**
```json
{
  "success": true,
  "message": "Leaderboard retrieved successfully",
  "data": {
    "leaderboard": [
      {
        "rank": "number",
        "user_id": "string",
        "username": "string",
        "avatar": "string",
        "level": "number",
        "score": "number",
        "games_won": "number",
        "games_played": "number"
      }
    ],
    "user_rank": {
      "rank": "number",
      "user_id": "string",
      "username": "string",
      "avatar": "string",
      "level": "number",
      "score": "number",
      "games_won": "number",
      "games_played": "number"
    },
    "pagination": {
      "total": "number",
      "page": "number",
      "page_size": "number",
      "total_pages": "number"
    }
  }
}
```

### Friends

#### Get Friends List
```
GET /friends
```

**Query Parameters:**
```
page: number (default: 1)
page_size: number (default: 10)
status: string (default: "all", options: "all", "online", "offline")
```

**Response:**
```json
{
  "success": true,
  "message": "Friends retrieved successfully",
  "data": {
    "friends": [
      {
        "user_id": "string",
        "username": "string",
        "avatar": "string",
        "level": "number",
        "is_online": "boolean",
        "last_seen": "string"
      }
    ],
    "pagination": {
      "total": "number",
      "page": "number",
      "page_size": "number",
      "total_pages": "number"
    }
  }
}
```

#### Send Friend Request
```
POST /friends/request
```

**Request Body:**
```json
{
  "username": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Friend request sent successfully"
}
```

#### Get Friend Requests
```
GET /friends/requests
```

**Response:**
```json
{
  "success": true,
  "message": "Friend requests retrieved successfully",
  "data": {
    "requests": [
      {
        "request_id": "string",
        "user_id": "string",
        "username": "string",
        "avatar": "string",
        "level": "number",
        "created_at": "string"
      }
    ]
  }
}
```

#### Accept Friend Request
```
POST /friends/requests/{request_id}/accept
```

**Response:**
```json
{
  "success": true,
  "message": "Friend request accepted successfully"
}
```

#### Reject Friend Request
```
POST /friends/requests/{request_id}/reject
```

**Response:**
```json
{
  "success": true,
  "message": "Friend request rejected successfully"
}
```

#### Remove Friend
```
DELETE /friends/{user_id}
```

**Response:**
```json
{
  "success": true,
  "message": "Friend removed successfully"
}
```

### Store

#### Get Store Items
```
GET /store/items
```

**Query Parameters:**
```
category: string (default: "all", options: "all", "avatars", "themes", "emotes")
page: number (default: 1)
page_size: number (default: 10)
```

**Response:**
```json
{
  "success": true,
  "message": "Store items retrieved successfully",
  "data": {
    "items": [
      {
        "item_id": "string",
        "name": "string",
        "description": "string",
        "category": "string",
        "price": {
          "coins": "number",
          "gems": "number"
        },
        "image_url": "string",
        "is_owned": "boolean"
      }
    ],
    "pagination": {
      "total": "number",
      "page": "number",
      "page_size": "number",
      "total_pages": "number"
    }
  }
}
```

#### Purchase Item
```
POST /store/items/{item_id}/purchase
```

**Request Body:**
```json
{
  "currency": "string" // "coins" or "gems"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Item purchased successfully",
  "data": {
    "item_id": "string",
    "name": "string",
    "category": "string",
    "image_url": "string",
    "balance": {
      "coins": "number",
      "gems": "number"
    }
  }
}
```

### Inventory

#### Get Inventory
```
GET /inventory
```

**Query Parameters:**
```
category: string (default: "all", options: "all", "avatars", "themes", "emotes")
page: number (default: 1)
page_size: number (default: 10)
```

**Response:**
```json
{
  "success": true,
  "message": "Inventory retrieved successfully",
  "data": {
    "items": [
      {
        "item_id": "string",
        "name": "string",
        "description": "string",
        "category": "string",
        "image_url": "string",
        "is_equipped": "boolean",
        "acquired_at": "string"
      }
    ],
    "pagination": {
      "total": "number",
      "page": "number",
      "page_size": "number",
      "total_pages": "number"
    }
  }
}
```

#### Equip Item
```
POST /inventory/items/{item_id}/equip
```

**Response:**
```json
{
  "success": true,
  "message": "Item equipped successfully"
}
```

### Transactions

#### Get Transaction History
```
GET /transactions
```

**Query Parameters:**
```
type: string (default: "all", options: "all", "purchase", "reward", "gift")
page: number (default: 1)
page_size: number (default: 10)
```

**Response:**
```json
{
  "success": true,
  "message": "Transactions retrieved successfully",
  "data": {
    "transactions": [
      {
        "transaction_id": "string",
        "type": "string",
        "amount": "number",
        "currency": "string",
        "description": "string",
        "created_at": "string"
      }
    ],
    "pagination": {
      "total": "number",
      "page": "number",
      "page_size": "number",
      "total_pages": "number"
    }
  }
}
```

## Error Responses

All API endpoints return a standard error response format:

```json
{
  "success": false,
  "message": "Error message",
  "error": {
    "code": "string",
    "details": "string"
  }
}
```

### Common Error Codes

- `AUTH_REQUIRED`: Authentication is required
- `INVALID_CREDENTIALS`: Invalid username or password
- `USER_EXISTS`: User already exists
- `USER_NOT_FOUND`: User not found
- `ROOM_NOT_FOUND`: Room not found
- `ROOM_FULL`: Room is full
- `INVALID_PASSWORD`: Invalid room password
- `INSUFFICIENT_FUNDS`: Insufficient funds
- `ITEM_NOT_FOUND`: Item not found
- `ITEM_ALREADY_OWNED`: Item already owned
- `GAME_IN_PROGRESS`: Game is already in progress
- `NOT_ROOM_HOST`: Only the room host can perform this action
- `PLAYER_NOT_READY`: All players must be ready to start the game
- `INTERNAL_ERROR`: Internal server error