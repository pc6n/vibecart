# Racing Cart - Architecture Documentation

## Overview

Racing Cart is a 3D browser-based racing game built with Three.js and modern web technologies. The project features a client-server architecture to support both single-player gameplay and multiplayer functionality through WebRTC. The game includes real-time racing mechanics, physics, and high score tracking.

## System Architecture

The project follows a client-server architecture:

```
┌─────────────────────┐      ┌────────────────────────┐
│    Client (Browser) │      │         Server         │
│  ┌───────────────┐  │      │  ┌─────────────────┐   │
│  │ Game Engine   │  │      │  │  API Endpoints  │   │
│  │ (Three.js)    │◄──┼──────┼─►  (Express.js)   │   │
│  └───────────────┘  │      │  └─────────────────┘   │
│  ┌───────────────┐  │      │  ┌─────────────────┐   │
│  │ UI Components │  │      │  │ Room Management │   │
│  └───────────────┘  │      │  └─────────────────┘   │
│  ┌───────────────┐  │      │  ┌─────────────────┐   │
│  │ WebRTC        │◄──┼──────┼─►Signaling Server │   │
│  │ (Multiplayer) │  │      │  └─────────────────┘   │
│  └───────────────┘  │      │  ┌─────────────────┐   │
│  ┌───────────────┐  │      │  │ High Score      │   │
│  │ Game Logic    │◄──┼──────┼─►  Management     │   │
│  └───────────────┘  │      │  └─────────────────┘   │
└─────────────────────┘      └────────────────────────┘
```

## Client-Side Components

The client-side is organized into several key modules:

### Core Game Modules

- **main.js**: Entry point for the client application
- **game.js**: Central game controller that coordinates all game elements
- **track.js**: Handles track rendering, collision detection, and race logic
- **car.js**: Manages car physics, rendering, and behavior
- **controls.js**: Processes user input (keyboard/touch) for controlling the car

### UI Components

- **ui/GameUI.js**: Handles game interface elements like menus, displays, and HUD
- **ui/** directory: Contains various UI components for different game screens

### Multiplayer Components

- **multiplayer/** directory: Contains WebRTC peer connection management
- **network/** directory: Handles data synchronization between clients

### Environment Components

- **environment/** directory: Manages environmental elements like terrain, skybox, lighting
- **items/** directory: Contains game items like obstacles, power-ups, etc.
- **constants/** directory: Game configuration and constants

## Server-Side Components

The server is built on Node.js with Express and provides several key services:

### Core Server Modules

- **src/index.js**: Main server application, sets up routes and middleware
- **src/HighScoreManager.js**: Manages high score tracking, validation, and persistence
- **src/RoomManager.js**: Handles multiplayer room creation, joining, and management
- **src/SignalingManager.js**: WebRTC signaling for establishing peer connections

### Data Storage

- **data/highscores.json**: Persistent storage for high scores

### Server Scripts

- **start.js**: Entry point for the server
- **restart.sh**: Script to restart the server
- **kill.sh**: Script to stop the server
- **start.sh**: Script to start the server

## Key Dependencies

### Client-Side

- **Three.js**: 3D rendering engine
- **WebRTC**: For peer-to-peer multiplayer connections
- **Vite**: Build tool and development server

### Server-Side

- **Express.js**: Web server framework
- **PM2**: Process manager for Node.js applications
- **Nginx**: Used as a reverse proxy in production

## Deployment Architecture

The system is deployed with the following architecture:

```
                   ┌──────────────────┐
                   │    DNS Server    │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │      Nginx       │
                   │ (Reverse Proxy)  │
                   └──────┬───────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
┌──────────────────┐ ┌────────────┐ ┌────────────────┐
│  Static Assets   │ │ API Server │ │ Signaling      │
│  (HTML/JS/CSS)   │ │ (Express)  │ │ Server (WebRTC)│
└──────────────────┘ └────────────┘ └────────────────┘
```

## Deployment Scripts

Several scripts facilitate deployment:

- **deploy.sh**: Main deployment script for the client
- **deploy_server.sh**: Deploys the server components
- **deploy-nginx.sh**: Configures and deploys the Nginx configuration

## Data Flow

### Single Player Gameplay

1. Client loads game assets and initializes the game environment
2. Player controls the car using keyboard/touch inputs
3. Game logic processes physics, collisions, and lap timing
4. High scores are submitted to the server for validation and storage

### Multiplayer Gameplay

1. Client connects to the signaling server
2. Player creates or joins a multiplayer room
3. WebRTC connections are established between players
4. Game state is synchronized between peers
5. Race results are reported to the server

### High Score Management

1. Client submits a high score with validation data
2. Server validates the submission using timestamp verification
3. Valid scores are stored in the high score database
4. Leaderboards are served to clients on request

## Testing

The project includes testing utilities:

- **test-highscore.js**: Tests high score submission and validation
- **TEST-README.md**: Documentation for testing procedures
- **test-turn-server.js/sh**: Tests TURN server functionality for WebRTC

## Security Considerations

- Timestamp-based validation is used to prevent high score tampering
- WebRTC connections are secured with proper authentication
- Server-side validation ensures data integrity

## Future Enhancements

- AI opponents for single-player mode
- Enhanced mobile support
- Additional tracks and car customization
- Tournament mode
- Improved matchmaking for multiplayer 

## Code Organization and Implementation Details

### High Score Management System

The high score system uses several security mechanisms to validate submissions:

```
┌─────────────┐     ┌─────────────────┐     ┌───────────────┐
│ Client-side │     │   Server-side   │     │  Data Storage │
│ Validation  │────►│   Validation    │────►│  Persistence  │
└─────────────┘     └─────────────────┘     └───────────────┘
```

**Key components:**

1. **Timestamp Validation**: Uses timestamps to ensure score submissions happen within a valid timeframe (10 minutes)
2. **Hash Verification**: Client creates a hash of score data with a shared secret to prevent tampering
3. **Session Management**: Uses Express sessions to track player gameplay
4. **Rate Limiting**: Prevents abuse by limiting submission frequency
5. **Data Persistence**: Stores validated high scores in JSON file

### API Endpoints

The server exposes several RESTful endpoints:

- `POST /api/scores` - Submit a new high score
- `GET /api/scores/:trackId` - Get top scores for a specific track
- `GET /api/scores` - Get all high scores
- `GET /api/rooms` - List available multiplayer rooms
- `POST /api/rooms` - Create a new multiplayer room

### WebRTC Signaling

The signaling system facilitates WebRTC peer connections:

```
┌─────────┐   Signaling    ┌─────────────┐   Signaling    ┌─────────┐
│ Client A│◄──────────────►│    Server   │◄──────────────►│ Client B│
└────┬────┘                └─────────────┘                └────┬────┘
     │                                                         │
     │                  WebRTC Direct Connection               │
     └─────────────────────────────────────────────────────────┘
```

1. Clients connect to the signaling server via WebSockets
2. The server facilitates exchange of SDP offers/answers
3. Once connection is established, peers communicate directly

### Game Physics and Rendering

The physics system implements:

- Realistic car dynamics (acceleration, braking, steering)
- Collision detection with track boundaries and obstacles
- Lap timing and checkpoints

The rendering pipeline uses Three.js to provide:

- 3D rendering of cars, track, and environment
- Lighting and shadow effects
- Camera positioning and following logic

### Code Organization Principles

The codebase follows several organizational principles:

1. **Modularity**: Code is divided into small, focused modules
2. **Separation of Concerns**: UI, game logic, networking, and rendering are separated
3. **Service-Based Architecture**: Server components are organized as distinct services
4. **Configuration Management**: Game constants and settings are centralized

## Development Workflow

The project uses the following development workflow:

1. Local development using Vite for hot reloading
2. Testing with custom test scripts
3. Deployment using shell scripts to automate the process
4. Monitoring through PM2 and server logs 

## Deployment and CI/CD

### Deployment Process

The Racing Cart game uses a multi-stage deployment process to ensure reliability and easy updates:

```
┌───────────────┐    ┌────────────────┐    ┌───────────────┐    ┌───────────────┐
│ Local Build   │───►│ File Transfer  │───►│ Server Setup  │───►│ Service Start │
└───────────────┘    └────────────────┘    └───────────────┘    └───────────────┘
```

#### Client Deployment (`deploy.sh`)

1. Built assets are compiled using Vite 
2. Assets are transferred to the production server via Rsync
3. Permissions are set to ensure proper access
4. Nginx configuration is updated if needed

#### Server Deployment (`deploy_server.sh`)

1. Server code is built with Node.js
2. Dependencies are installed with npm
3. Files are transferred to production using Rsync
4. The server is started/restarted using PM2

### Server Configuration

The server uses the following configuration approach:

1. **Environment Variables**: Configuration for ports, secrets, and environment-specific settings
2. **PM2 Process Management**: For monitoring, automatic restarts, and log management
3. **Nginx as Reverse Proxy**: For SSL termination, caching, and routing

### Continuous Deployment

The deployment scripts can be integrated into a CI/CD pipeline:

1. Code changes are pushed to the repository
2. Tests are run to ensure functionality
3. Deployment scripts are triggered on successful tests
4. Server is updated with minimal downtime

## Performance Optimization

The game implements several performance optimizations:

1. **Asset Loading**: Progressive loading of game assets
2. **Level of Detail (LOD)**: Simplified models at distance
3. **Render Distance Management**: Only rendering visible elements
4. **Client-Side Prediction**: For smooth multiplayer experience
5. **Caching**: Asset caching for faster loading

## Monitoring and Maintenance

The system includes monitoring capabilities:

1. **PM2 Monitoring**: For server process health
2. **Log Rotation**: To prevent log files from growing too large
3. **Error Reporting**: Structured error logging
4. **Restart Scripts**: For automatic recovery 

## Developer Guide and Best Practices

### Getting Started

To start working with the Racing Cart codebase:

1. Clone the repository
2. Install dependencies with `npm install` in both root and server directories
3. Start the development server with `npm run dev`
4. Start the API server with `npm run start` in the server directory

### Code Style and Conventions

The project follows these coding conventions:

1. **ES6+ JavaScript**: Modern JavaScript features are used throughout
2. **Modular Design**: Keep files small and focused on a single responsibility
3. **Descriptive Naming**: Use clear, descriptive names for functions and variables
4. **Comments**: Document complex logic and public API interfaces
5. **Error Handling**: Implement proper error handling and logging

### Directory Structure Guidelines

When adding new features, follow these guidelines:

- Place client-side game logic in `src/js/`
- UI components go in `src/js/ui/`
- Server-side logic goes in `server/src/`
- Game assets belong in `assets/`

### Testing Recommendations

For testing new features:

1. Use the testing framework in `test-highscore.js` as a model
2. Test both client and server-side components
3. Verify multiplayer functionality with multiple browsers
4. Check mobile responsiveness on various devices

### Common Pitfalls

Watch out for these common issues:

1. **WebRTC Connection Issues**: Make sure TURN server is properly configured
2. **Game Physics Glitches**: Test collision detection thoroughly
3. **Performance Problems**: Monitor frame rate on lower-end devices
4. **Mobile Input Handling**: Touch controls need special attention

### Contribution Workflow

When contributing to the project:

1. Create a feature branch for your changes
2. Implement and test your changes
3. Update documentation as needed
4. Submit a merge request with a clear description

These guidelines will help maintain code quality and consistency across the project. 