# Higgs Domino WebSocket Protocol

## Overview

The Higgs Domino game uses WebSockets for real-time communication between the client and server. This document outlines the WebSocket protocol used for game events, chat messages, and notifications.

## Connection

WebSocket connections are established after a user successfully joins a room. The WebSocket URL is provided in the response of the room join API call.

```
wss://ws.higgsdomino.com/game?token={auth_token}&room_id={room_id}
```

## Message Format

All messages sent and received through the WebSocket connection follow a standard JSON format:

```json
{
  "type": "string",
  "data": {}
}
```

The `type` field indicates the type of message, and the `data` field contains the message payload, which varies depending on the message type.

## Client to Server Messages

### Player Ready
```json
{
  "type": "player_ready",
  "data": {
    "is_ready": true
  }
}
```

### Start Game
```json
{
  "type": "start_game",
  "data": {}
}
```

### Play Tile
```json
{
  "type": "play_tile",
  "data": {
    "tile": {
      "left": 3,
      "right": 5
    },
    "position": "left" // "left", "right", "first"
  }
}
```

### Draw Tile
```json
{
  "type": "draw_tile",
  "data": {}
}
```

### Skip Turn
```json
{
  "type": "skip_turn",
  "data": {}
}
```

### Chat Message
```json
{
  "type": "chat_message",
  "data": {
    "message": "Hello everyone!"
  }
}
```

### Leave Room
```json
{
  "type": "leave_room",
  "data": {}
}
```

### Ping
```json
{
  "type": "ping",
  "data": {
    "timestamp": 1623456789
  }
}
```

## Server to Client Messages

### Player Joined
```json
{
  "type": "player_joined",
  "data": {
    "player": {
      "user_id": "string",
      "username": "string",
      "avatar": "string",
      "level": 10,
      "is_ready": false
    }
  }
}
```

### Player Left
```json
{
  "type": "player_left",
  "data": {
    "user_id": "string",
    "username": "string"
  }
}
```

### Player Ready
```json
{
  "type": "player_ready",
  "data": {
    "user_id": "string",
    "is_ready": true
  }
}
```

### Game Started
```json
{
  "type": "game_started",
  "data": {
    "game_id": "string",
    "players": [
      {
        "user_id": "string",
        "username": "string",
        "avatar": "string",
        "tile_count": 7
      }
    ],
    "first_player": "string", // user_id of the first player
    "tiles": [
      {
        "left": 3,
        "right": 5
      },
      // ... more tiles for the current player
    ],
    "round": 1,
    "total_rounds": 3
  }
}
```

### Turn Changed
```json
{
  "type": "turn_changed",
  "data": {
    "user_id": "string", // user_id of the player whose turn it is
    "timer": 30 // seconds remaining for the turn
  }
}
```

### Tile Played
```json
{
  "type": "tile_played",
  "data": {
    "user_id": "string",
    "tile": {
      "left": 3,
      "right": 5
    },
    "position": "left", // "left", "right", "first"
    "board": [
      {
        "left": 3,
        "right": 5,
        "position": "first"
      },
      // ... more tiles on the board
    ],
    "left_end": 3, // value at the left end of the board
    "right_end": 5, // value at the right end of the board
    "remaining_tiles": 14 // number of tiles remaining in the draw pile
  }
}
```

### Tile Drawn
```json
{
  "type": "tile_drawn",
  "data": {
    "user_id": "string",
    "tile": {
      "left": 3,
      "right": 5
    }, // Only sent to the player who drew the tile
    "remaining_tiles": 13 // number of tiles remaining in the draw pile
  }
}
```

### Turn Skipped
```json
{
  "type": "turn_skipped",
  "data": {
    "user_id": "string",
    "reason": "no_matching_tiles" // "no_matching_tiles", "timeout"
  }
}
```

### Game Blocked
```json
{
  "type": "game_blocked",
  "data": {
    "reason": "no_valid_moves",
    "player_hands": [
      {
        "user_id": "string",
        "tiles": [
          {
            "left": 3,
            "right": 5
          },
          // ... more tiles
        ],
        "hand_value": 13 // sum of all tile values
      },
      // ... more player hands
    ]
  }
}
```

### Round Ended
```json
{
  "type": "round_ended",
  "data": {
    "winner": {
      "user_id": "string",
      "username": "string"
    },
    "reason": "player_out", // "player_out", "game_blocked"
    "player_hands": [
      {
        "user_id": "string",
        "tiles": [
          {
            "left": 3,
            "right": 5
          },
          // ... more tiles
        ],
        "hand_value": 13 // sum of all tile values
      },
      // ... more player hands
    ],
    "scores": [
      {
        "user_id": "string",
        "score": 10,
        "total_score": 25
      },
      // ... more player scores
    ],
    "round": 1,
    "next_round": 2
  }
}
```

### Game Ended
```json
{
  "type": "game_ended",
  "data": {
    "game_id": "string",
    "winner": {
      "user_id": "string",
      "username": "string"
    },
    "scores": [
      {
        "user_id": "string",
        "score": 35,
        "reward": 100
      },
      // ... more player scores
    ],
    "duration": 360, // game duration in seconds
    "rounds_played": 3
  }
}
```

### Chat Message
```json
{
  "type": "chat_message",
  "data": {
    "user_id": "string",
    "username": "string",
    "message": "Hello everyone!",
    "timestamp": 1623456789
  }
}
```

### Error
```json
{
  "type": "error",
  "data": {
    "code": "invalid_move",
    "message": "Invalid move: tile does not match any end"
  }
}
```

### Pong
```json
{
  "type": "pong",
  "data": {
    "timestamp": 1623456789
  }
}
```

## Error Codes

- `invalid_move`: The move is invalid
- `not_your_turn`: It's not your turn
- `game_not_started`: The game has not started yet
- `game_already_started`: The game has already started
- `not_room_host`: Only the room host can perform this action
- `player_not_ready`: All players must be ready to start the game
- `invalid_tile`: The tile is invalid or not in your hand
- `invalid_position`: The position is invalid
- `no_tiles_to_draw`: There are no tiles left to draw
- `internal_error`: Internal server error

## Reconnection

If a player disconnects during a game, they can reconnect by joining the room again through the REST API. Upon reconnection, the server will send a `game_state` message with the current state of the game.

```json
{
  "type": "game_state",
  "data": {
    "game_id": "string",
    "status": "in_progress", // "waiting", "in_progress", "ended"
    "players": [
      {
        "user_id": "string",
        "username": "string",
        "avatar": "string",
        "tile_count": 5,
        "is_ready": true
      },
      // ... more players
    ],
    "current_player": "string", // user_id of the current player
    "tiles": [
      {
        "left": 3,
        "right": 5
      },
      // ... more tiles for the current player
    ],
    "board": [
      {
        "left": 3,
        "right": 5,
        "position": "first"
      },
      // ... more tiles on the board
    ],
    "left_end": 3, // value at the left end of the board
    "right_end": 5, // value at the right end of the board
    "remaining_tiles": 14, // number of tiles remaining in the draw pile
    "round": 1,
    "total_rounds": 3,
    "scores": [
      {
        "user_id": "string",
        "score": 10
      },
      // ... more player scores
    ],
    "timer": 25 // seconds remaining for the current turn
  }
}
```

## Heartbeat

To keep the WebSocket connection alive, the client should send a `ping` message every 30 seconds. The server will respond with a `pong` message.

## Connection Close

The server may close the WebSocket connection with the following close codes:

- `1000`: Normal closure (e.g., user left the room)
- `1001`: Going away (e.g., server shutdown)
- `1008`: Policy violation (e.g., invalid message format)
- `1011`: Internal server error

If the connection is closed with a code other than `1000` or `1001`, the client should attempt to reconnect.