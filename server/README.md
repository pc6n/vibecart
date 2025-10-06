# Racing Cart Game Server

This is the server component of the Racing Cart multiplayer game. It handles room management, player synchronization, item management, and high scores for the racing game.

## Architecture

The server is built using Node.js and Socket.IO, following a modular architecture with clear separation of concerns:

### Core Components

```
server/
├── src/
│   ├── SignalingManager.js    # Handles all Socket.IO events and client communication
│   ├── RoomManager.js         # Manages game rooms, players, and room lifecycle
│   ├── ItemManager.js         # Handles item spawning, collection, and synchronization
│   ├── HighScoreManager.js    # Manages high scores, verification, and persistence
│   └── index.js              # Server entry point and setup
├── data/
│   └── highscores.json       # Persistent storage for high scores
```

### Component Responsibilities

#### SignalingManager
- Handles Socket.IO event setup and management
- Processes player join/leave events
- Manages real-time player position and rotation updates
- Handles error cases and logging
- Prevents duplicate room joins

#### RoomManager
- Creates and maintains game rooms
- Manages player lists per room
- Handles room cleanup for inactive rooms
- Coordinates item managers for each room
- Maintains the master/public room

#### ItemManager (ServerItemManager)
- Manages item spawning and despawning
- Handles item collection
- Maintains spawn points and item positions
- Broadcasts item updates to players
- Ensures fair item distribution

#### HighScoreManager
- Manages persistent high scores
- Validates score submissions
- Implements anti-cheat measures
- Rate limits submissions
- Maintains top scores per track

### Key Features

- **Room Management**
  - Public and private rooms
  - Master room for quick matches
  - Automatic cleanup of inactive rooms
  - Player limit per room (8 players)

- **Item System**
  - Dynamic item spawning
  - Fair distribution of item types
  - Spawn point management
  - Item collection synchronization

- **Real-time Updates**
  - Player position/rotation sync
  - Item spawn/collection broadcasts
  - Room state updates
  - Player join/leave notifications

- **High Score System**
  - Secure score submission
  - Anti-cheat measures
  - Session-based validation
  - Rate limiting
  - Persistent storage

### Configuration

Key server configurations:

```javascript
{
    maxPlayersPerRoom: 8,
    roomCleanupInterval: 3600000, // 1 hour
    itemSpawnInterval: 2000,      // 2 seconds
    maxItemsPerRoom: 20,
    scoreSubmissionRateLimit: 10  // submissions per hour
}
```

### Security Features

- Hash verification for score submissions
- Session-based gameplay validation
- Rate limiting for score submissions
- Payload encryption
- Timestamp validation
- Anti-tampering measures

### Error Handling

- Socket disconnection handling
- Room join/leave error management
- Item collection validation
- Player limit enforcement
- Duplicate join prevention
- Score submission validation

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the server:**
   ```bash
   npm run dev
   ```

The server will start on port 1337 by default.

## Development

To run in development mode with hot reloading:
```bash
npm run dev
```

## Production

For production deployment:
```bash
npm run build
npm start
```

## Environment Variables

- `PORT`: Server port (default: 1337)
- `NODE_ENV`: Environment ('development' or 'production')
- `CLIENT_SECRET`: Secret for score validation

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request