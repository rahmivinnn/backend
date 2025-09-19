# Higgs Domino Multiplayer Game

## Overview
Higgs Domino is a multiplayer domino game built with Unity. The game connects to a backend server for user authentication, game state management, and multiplayer functionality.

## Features
- User authentication and registration
- Multiplayer gameplay via WebSockets
- Real-time game updates
- Chat functionality
- Friend system
- Tournament mode
- Achievements and rewards
- In-game economy (coins, gems)
- Customizable avatars and themes

## Project Structure

### Scripts
- **Network**: Handles communication with the server
  - `NetworkManager.cs`: Manages API requests and WebSocket connections
  - `WebSocketConnection.cs`: Handles WebSocket communication
  - `ApiClient.cs`: Manages HTTP requests

- **Game**: Core game logic
  - `GameManager.cs`: Manages game state and logic
  - `PlayerInfo.cs`: Stores player information
  - `DominoTile.cs`: Represents domino tiles
  - `GameResult.cs`: Stores game results
  - `GameRoom.cs`: Manages game rooms
  - `GameBoard.cs`: Manages the game board
  - `TileSet.cs`: Manages the set of domino tiles

- **UI**: User interface
  - `UIManager.cs`: Manages all UI elements
  - `MainScene.cs`: Manages the main scene
  - `LoginManager.cs`: Manages login and registration
  - `LobbyManager.cs`: Manages the game lobby
  - `RoomManager.cs`: Manages the game room
  - `GameplayManager.cs`: Manages the gameplay UI
  - `GameOverManager.cs`: Manages the game over UI
  - `PlayerResultItem.cs`: Displays player results
  - `ChatMessage.cs`: Manages chat messages

- **Utils**: Utility functions
  - `Utils.cs`: General utility functions
  - `JsonHelper.cs`: JSON serialization/deserialization
  - `PlayerPrefsManager.cs`: Manages local data storage
  - `SoundManager.cs`: Manages sound and music
  - `NotificationManager.cs`: Manages notifications

### Assets
- **Prefabs**: Reusable game objects
- **Scenes**: Game scenes
- **Resources**: Game resources (sprites, audio, etc.)

## Dependencies
- Unity 2022.3 or later
- Unity Netcode for GameObjects
- Unity Mobile Notifications
- TextMeshPro
- Unity UI

## Setup
1. Clone the repository
2. Open the project in Unity
3. Configure the server URL in `NetworkManager.cs`
4. Build and run the game

## Server Integration
The game connects to a backend server for user authentication, game state management, and multiplayer functionality. The server API is documented in the `API_DOCUMENTATION.md` file in the root directory of the project.

## WebSocket Protocol
The game uses WebSockets for real-time communication with the server. The WebSocket protocol is documented in the `WEBSOCKET_PROTOCOL.md` file in the root directory of the project.

## Database Integration
The game integrates with the Higgs Domino database for user data, game state, and other information. The database schema is documented in the `DATABASE_SCHEMA.md` file in the root directory of the project.

## License
This project is licensed under the MIT License - see the LICENSE file for details.