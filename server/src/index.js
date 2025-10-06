import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { RoomManager } from './RoomManager.js';
import { SignalingManager } from './SignalingManager.js';
import { HighScoreManager } from './HighScoreManager.js';
import { UserStatsManager } from './UserStatsManager.js';
import { v4 as uuidv4 } from 'uuid';
import { BinarySerializer } from './utils/BinarySerializer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add timestamp to logs
const log = (message, ...args) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, ...args);
};

const app = express();
const httpServer = createServer(app);

// Set up session middleware
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'racing-cart-secret',
    name: 'racing.sid',
    cookie: {
        httpOnly: true,
        secure: false, // Set to false for development
        sameSite: 'lax', // Changed from strict to lax for development
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    resave: true, // Changed to true to ensure session is saved
    saveUninitialized: true // Changed to true to create session for all requests
});

// Use session middleware for Express
app.use(sessionMiddleware);

// Debug middleware for session tracking
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] Session ID: ${req.session.id}, Has game session: ${!!req.session.gameStartTime}`);
    next();
});

// Initialize user stats manager with our logger
const userStatsManager = new UserStatsManager({
    logger: log
});

// Use the user counter middleware
app.use(userStatsManager.createMiddleware());

// Enable CORS for development
app.use(cors({
    origin: 'http://localhost:8080', // Your frontend URL
    credentials: true, // Important for sessions
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Create Socket.IO server
const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
        origin: 'http://localhost:8080',
        methods: ['*'],
        credentials: true
    }
});

// Allow Socket.IO to access session data
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Helper function to handle player updates (used by both binary and JSON handlers)
function handlePlayerUpdate(socket, data) {
    const socketId = socket.id;
    const roomId = roomManager.playerRooms.get(socketId);
    
    if (!roomId) {
        return;
    }
    
    // Update last seen timestamp
    roomManager.updatePlayerActivity(socketId);
    
    // Forward the update to all other players in the room
    // For binary messages, we can just forward the binary data directly
    if (data._binary) {
        socket.to(roomId).emit('peer-update-binary', data._binaryData);
    } else {
        // For regular JSON, serialize and send as binary for efficiency
        const serializedData = BinarySerializer.serialize(data);
        socket.to(roomId).emit('peer-update-binary', serializedData);
    }
}

// Track socket connections for more accurate user counts
io.on('connection', (socket) => {
    userStatsManager.handleSocketConnection(socket);

    // Inside the io.on('connection', callback) setup - add binary event handlers
    socket.on('player-update-binary', (binaryData) => {
        try {
            // Skip if binaryData is null or undefined
            if (binaryData === null || binaryData === undefined) {
                console.error(`[${new Date().toISOString()}] Received null or undefined data in player-update-binary`);
                return;
            }
            
            // Convert to a Buffer or Uint8Array for consistent handling if it's ArrayBuffer
            if (binaryData instanceof ArrayBuffer) {
                console.debug(`[${new Date().toISOString()}] Converting ArrayBuffer to Buffer`);
                binaryData = Buffer.from(binaryData);
            }
            
            // Log type information for debugging
            console.debug(`[${new Date().toISOString()}] Received binary data type:`, {
                type: typeof binaryData,
                constructor: binaryData.constructor ? binaryData.constructor.name : 'unknown',
                length: binaryData.length || binaryData.byteLength || 'N/A',
                isBuffer: Buffer.isBuffer(binaryData),
                isArrayBuffer: binaryData instanceof ArrayBuffer,
                isUint8Array: binaryData instanceof Uint8Array
            });
            
            // Deserialize data regardless of format
            const data = BinarySerializer.deserialize(binaryData);
            
            // Skip if data is invalid
            if (!data || !data.peerId) {
                console.error(`[${new Date().toISOString()}] Deserialized player update has invalid format:`, data);
                return;
            }
            
            // Find the room for this socket
            const socketId = socket.id;
            const roomId = roomManager.playerRooms.get(socketId);
            
            if (!roomId) {
                console.debug(`[${new Date().toISOString()}] Socket ${socketId} not in any room, skipping update`);
                return;
            }
            
            // Add the binary data to be forwarded directly
            data._binary = true;
            
            // Convert the original binary data to a Buffer if needed 
            // (for consistent forwarding)
            if (Buffer.isBuffer(binaryData) || binaryData instanceof Uint8Array) {
                data._binaryData = binaryData;
            } else {
                // This should rarely happen as we've already handled ArrayBuffer above
                console.warn(`[${new Date().toISOString()}] Converting unusual binary data format for forwarding`);
                data._binaryData = Buffer.from(binaryData);
            }
            
            // Forward to all other clients in the room
            socket.to(roomId).emit('peer-update-binary', data._binaryData);
            
            // Update last seen timestamp
            roomManager.updatePlayerActivity(socketId);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing binary player update:`, error);
        }
    });

    // Keep the existing handlers for backward compatibility
    socket.on('player-update', (data) => {
        try {
            // Skip if data is null/undefined
            if (!data) {
                console.error(`[${new Date().toISOString()}] Received invalid data in player-update`);
                return;
            }
            
            handlePlayerUpdate(socket, data);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing JSON player update:`, error);
        }
    });

    socket.on('banana-thrown-binary', (binaryData) => {
        try {
            // Skip if binaryData is null/undefined
            if (!binaryData) {
                console.error(`[${new Date().toISOString()}] Received invalid binary data in banana-thrown-binary`);
                return;
            }
            
            const data = BinarySerializer.deserialize(binaryData);
            
            // Skip if data is invalid
            if (!data) {
                console.error(`[${new Date().toISOString()}] Deserialized banana throw has invalid format`);
                return;
            }
            
            const roomId = roomManager.playerRooms.get(socket.id);
            
            if (roomId) {
                // Forward to all other clients in room
                socket.to(roomId).emit('banana-thrown-binary', binaryData);
                
                // Also handle server-side banana logic
                const itemManager = roomManager.roomItemManagers.get(roomId);
                if (itemManager) {
                    itemManager.handleThrownBanana(roomId, data);
                }
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing binary banana throw:`, error);
        }
    });

    socket.on('shell-thrown-binary', (binaryData) => {
        try {
            // Skip if binaryData is null/undefined
            if (!binaryData) {
                console.error(`[${new Date().toISOString()}] Received invalid binary data in shell-thrown-binary`);
                return;
            }
            
            const data = BinarySerializer.deserialize(binaryData);
            
            // Skip if data is invalid
            if (!data) {
                console.error(`[${new Date().toISOString()}] Deserialized shell throw has invalid format`);
                return;
            }
            
            const roomId = roomManager.playerRooms.get(socket.id);
            
            if (roomId) {
                // Forward to all other clients in room
                socket.to(roomId).emit('shell-thrown-binary', binaryData);
                
                // Also handle server-side shell logic
                const itemManager = roomManager.roomItemManagers.get(roomId);
                if (itemManager) {
                    itemManager.handleThrownShell(roomId, data);
                }
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing binary shell throw:`, error);
        }
    });

    socket.on('shell-collision-binary', (binaryData) => {
        try {
            // Skip if binaryData is null/undefined
            if (!binaryData) {
                console.error(`[${new Date().toISOString()}] Received invalid binary data in shell-collision-binary`);
                return;
            }
            
            const data = BinarySerializer.deserialize(binaryData);
            
            // Skip if data is invalid
            if (!data) {
                console.error(`[${new Date().toISOString()}] Deserialized shell collision has invalid format`);
                return;
            }
            
            const roomId = roomManager.playerRooms.get(socket.id);
            
            if (roomId) {
                // Forward to all other clients in room
                socket.to(roomId).emit('shell-collision-binary', binaryData);
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing binary shell collision:`, error);
        }
    });

    socket.on('ai-car-update-binary', (binaryData) => {
        try {
            // Skip if binaryData is null/undefined
            if (!binaryData) {
                console.error(`[${new Date().toISOString()}] Received invalid binary data in ai-car-update-binary`);
                return;
            }
            
            const data = BinarySerializer.deserialize(binaryData);
            
            // Skip if data is invalid
            if (!data) {
                console.error(`[${new Date().toISOString()}] Deserialized AI car update has invalid format`);
                return;
            }
            
            const socketId = socket.id;
            const roomId = roomManager.playerRooms.get(socketId);
            
            if (!roomId) {
                return;
            }
            
            // Forward to other clients in the room as a binary message
            socket.to(roomId).emit('ai-car-update-binary', binaryData);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing binary AI car update:`, error);
        }
    });

    socket.on('ai-cars-batch-update-binary', (binaryData) => {
        try {
            // Skip if binaryData is null/undefined
            if (!binaryData) {
                console.error(`[${new Date().toISOString()}] Received invalid binary data in ai-cars-batch-update-binary`);
                return;
            }
            
            const data = BinarySerializer.deserialize(binaryData);
            
            // Skip if data is invalid
            if (!data) {
                console.error(`[${new Date().toISOString()}] Deserialized AI cars batch update has invalid format`);
                return;
            }
            
            const socketId = socket.id;
            const roomId = roomManager.playerRooms.get(socketId);
            
            if (!roomId) {
                return;
            }
            
            // Forward the batch update to all other clients in the room
            socket.to(roomId).emit('ai-cars-batch-update-binary', binaryData);
            
            // We could add server-side validation or processing here if needed
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing AI cars batch update:`, error);
        }
    });
});

// Initialize managers
const roomManager = new RoomManager(io);
const signalingManager = new SignalingManager(io, roomManager);
const highScoreManager = new HighScoreManager();

// Log all requests
app.use((req, res, next) => {
    log(`${req.method} ${req.url}`);
    next();
});

// REST endpoints
app.get('/api/status', (req, res) => {
    log('Status check requested');
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        masterRoomId: roomManager.getRoom(roomManager.MASTER_ROOM_ID).id 
    });
});

// User statistics endpoint
app.get('/api/stats', (req, res) => {
    log('User statistics requested');
    
    try {
        // Get the master room to check active players
        let activePlayers = 0;
        let masterRoom = null;
        
        try {
            masterRoom = roomManager.getRoom(roomManager.MASTER_ROOM_ID);
            activePlayers = masterRoom && masterRoom.players ? masterRoom.players.size : 0;
            log(`Found master room with ${activePlayers} players`);
        } catch (roomError) {
            log(`Error accessing master room: ${roomError.message}`);
            // Handle the error gracefully and continue
        }
        
        // Adjust stats based on room manager state
        let gameStats = userStatsManager.adjustStatsForRoom(roomManager, req);
        
        // Double-check that activePlayers is not null/undefined and is a valid number
        if (gameStats.activePlayers === null || gameStats.activePlayers === undefined || isNaN(gameStats.activePlayers)) {
            const isLocalDevelopment = userStatsManager.isLocalDevelopment(req);
            gameStats.activePlayers = isLocalDevelopment ? Math.max(1, activePlayers) : activePlayers;
            log(`Fixing invalid activePlayers value (was ${gameStats.activePlayers}, fixed to ${gameStats.activePlayers})`);
        }
        
        // Ensure activePlayers is never null, undefined, or NaN
        gameStats = {
            ...gameStats,
            activePlayers: typeof gameStats.activePlayers === 'number' ? gameStats.activePlayers : 0,
            roomCount: typeof gameStats.roomCount === 'number' ? gameStats.roomCount : 0
        };
        
        res.json({
            server: {
                startTime: userStatsManager.stats.resetTime,
                uptime: Math.floor((Date.now() - userStatsManager.stats.resetTime) / 1000), // in seconds
            },
            users: userStatsManager.getBasicStats(),
            game: gameStats
        });
    } catch (error) {
        log(`Error fetching stats: ${error.message}`);
        
        // Check if this is a local development request
        const isLocalDevelopment = userStatsManager.isLocalDevelopment(req);
        
        // Return stats without game info if there's an error
        res.json({
            server: {
                startTime: userStatsManager.stats.resetTime,
                uptime: Math.floor((Date.now() - userStatsManager.stats.resetTime) / 1000),
            },
            users: userStatsManager.getBasicStats(),
            game: {
                activePlayers: isLocalDevelopment ? 1 : 0,
                roomCount: 0
            }
        });
    }
});

// Admin-only detailed statistics
app.get('/api/stats/detailed', (req, res) => {
    // In a production app, you'd add authentication here
    log('Detailed user statistics requested');
    
    res.json({
        server: {
            startTime: new Date(userStatsManager.stats.resetTime).toISOString(),
            uptime: Math.floor((Date.now() - userStatsManager.stats.resetTime) / 1000), // in seconds
        },
        users: userStatsManager.getDetailedStats()
    });
});

// Developer-only endpoint to reset statistics
app.get('/api/stats/reset', (req, res) => {
    // Only allow this in development environment
    if (!userStatsManager.isLocalDevelopment(req)) {
        return res.status(403).json({
            error: "This endpoint is only available in development mode"
        });
    }
    
    log('RESETTING ALL STATISTICS');
    userStatsManager.resetStats();
    
    res.json({
        success: true,
        message: "All statistics have been reset",
        timestamp: new Date().toISOString()
    });
});

// Developer-only endpoint to add a test player
app.get('/api/stats/add-test-player', (req, res) => {
    // Only allow this in development environment
    if (!userStatsManager.isLocalDevelopment(req)) {
        return res.status(403).json({
            error: "This endpoint is only available in development mode"
        });
    }
    
    try {
        // Generate a random player name
        const testPlayerName = `TestPlayer-${Math.floor(Math.random() * 1000)}`;
        const testPlayerId = uuidv4();
        
        // Add player to master room
        const masterRoom = roomManager.getRoom(roomManager.MASTER_ROOM_ID);
        roomManager.addPlayerToRoom(roomManager.MASTER_ROOM_ID, testPlayerId, testPlayerName);
        
        log(`Added test player ${testPlayerName} (${testPlayerId}) to master room. Total players: ${masterRoom.players.size}`);
        
        // Also increment user stats using the stats manager
        const testUser = userStatsManager.addTestPlayer();
        
        res.json({
            success: true,
            message: `Added test player ${testPlayerName}`,
            player: {
                id: testPlayerId,
                name: testPlayerName
            },
            stats: {
                activePlayers: masterRoom.players.size,
                activeUsers: userStatsManager.stats.currentlyActive
            }
        });
    } catch (error) {
        log(`Error adding test player: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Developer-only endpoint to increment active users (for testing)
app.get('/api/stats/increment-active', (req, res) => {
    // Only allow this in development environment
    if (!userStatsManager.isLocalDevelopment(req)) {
        return res.status(403).json({
            error: "This endpoint is only available in development mode"
        });
    }
    
    // Get amount to increment from query param (default to 1)
    const amount = parseInt(req.query.amount) || 1;
    
    // Use the stats manager to increment active users
    const updatedStats = userStatsManager.incrementActiveUsers(amount);
    
    res.json({
        success: true,
        message: `Incremented active users by ${amount}`,
        stats: updatedStats
    });
});

app.get('/api/rooms', (req, res) => {
    try {
        const masterRoom = roomManager.getRoom(roomManager.MASTER_ROOM_ID);
        log(`Fetching master room with ${masterRoom.players.size} players`);
        res.json([masterRoom]); // Only return the master room
    } catch (error) {
        log(`Error fetching master room: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/rooms', (req, res) => {
    const { playerName } = req.body;
    log(`Adding player ${playerName} to master room`);
    try {
        // Always add to master room, ignore any roomId in the request
        const room = roomManager.getRoom(roomManager.MASTER_ROOM_ID);
        const updatedRoom = roomManager.addPlayerToRoom(roomManager.MASTER_ROOM_ID, req.body.playerId || uuidv4(), playerName);
        log(`Player added successfully to master room. Total players: ${room.players.size}`);
        res.json(room);
    } catch (error) {
        log(`Error adding player to master room: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    log(`Fetching room: ${roomId}`);
    try {
        const room = roomManager.getRoom(roomId);
        log(`Room ${roomId} found with ${room.players.size} players`);
        res.json(room);
    } catch (error) {
        log(`Room ${roomId} not found: ${error.message}`);
        res.status(404).json({ error: error.message });
    }
});

// High Score endpoints
app.get('/api/highscores', (req, res) => {
    const trackId = req.query.trackId;
    log(`Fetching high scores${trackId ? ` for track ${trackId}` : ' for all tracks'}`);
    
    try {
        if (trackId) {
            const scores = highScoreManager.getTopScores(trackId);
            res.json(scores);
        } else {
            const allScores = highScoreManager.getAllHighScores();
            res.json(allScores);
        }
    } catch (error) {
        log(`Error fetching high scores: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/game/start', (req, res) => {
    // Start a new game session
    req.session.gameStartTime = Date.now();
    req.session.trackId = req.body.trackId;
    log(`New game session started for track ${req.body.trackId}`);
    res.json({ success: true });
});

app.post('/api/highscores', async (req, res) => {
    log(`High score submission from session ${req.session.id}`);
    
    try {
        const result = await highScoreManager.submitScore(req.body, req.session);
        
        if (result.success) {
            log(`High score submitted successfully. Rank: ${result.rank}, Top 3: ${result.isTopThree}`);
            return res.json(result);
        } else {
            log(`High score submission rejected: ${result.error}`);
            return res.status(400).json({ error: result.error });
        }
    } catch (error) {
        log(`Error processing high score: ${error.message}`);
        return res.status(500).json({ error: error.message });
    }
});

// Add this new endpoint to see all connected players
app.get('/api/players', (req, res) => {
    try {
        const masterRoom = roomManager.getRoom(roomManager.MASTER_ROOM_ID);
        const players = Array.from(masterRoom.players.values()).map(player => ({
            id: player.id,
            name: player.name,
            joined: player.joined,
            lastActivity: player.lastActivity
        }));
        
        log(`Current players in master room: ${players.length}`);
        res.json(players);
    } catch (error) {
        log(`Error fetching players: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Add a more detailed debug endpoint for admins
app.get('/api/debug/rooms', (req, res) => {
    try {
        const rooms = Array.from(roomManager.rooms.entries()).map(([roomId, room]) => ({
            id: roomId,
            playerCount: room.players.size,
            players: Array.from(room.players.values()).map(player => ({
                id: player.id,
                name: player.name,
                joined: player.joined,
                lastActivity: player.lastActivity
            })),
            created: room.created,
            lastActivity: room.lastActivity,
            isPublic: room.isPublic,
            isMasterRoom: room.isMasterRoom
        }));

        log(`Debug room info requested - ${rooms.length} rooms found`);
        res.json(rooms);
    } catch (error) {
        log(`Error fetching debug room info: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Developer endpoint to get and manage game state
app.get('/api/debug/game', (req, res) => {
    // Only allow this in development environment
    if (!userStatsManager.isLocalDevelopment(req)) {
        return res.status(403).json({
            error: "This endpoint is only available in development mode"
        });
    }
    
    try {
        // Get action from query parameter
        const action = req.query.action;
        
        // Get master room data
        const masterRoom = roomManager.getRoom(roomManager.MASTER_ROOM_ID);
        
        // If adding a test player
        if (action === 'add-player') {
            const count = parseInt(req.query.count) || 1;
            const addedPlayers = [];
            
            for (let i = 0; i < count; i++) {
                // Generate a random player name
                const testPlayerName = `TestPlayer-${Math.floor(Math.random() * 1000)}`;
                const testPlayerId = uuidv4();
                
                // Add player to master room
                roomManager.addPlayerToRoom(roomManager.MASTER_ROOM_ID, testPlayerId, testPlayerName);
                
                // Track the added player
                addedPlayers.push({
                    id: testPlayerId,
                    name: testPlayerName
                });
                
                // Also update the user stats
                userStatsManager.addTestPlayer();
            }
            
            log(`Added ${count} test player(s) to master room. Total players: ${masterRoom.players.size}`);
            
            return res.json({
                success: true,
                action: 'add-player',
                addedPlayers: addedPlayers,
                total: masterRoom.players.size,
                players: Array.from(masterRoom.players.values()).map(player => ({
                    id: player.id,
                    name: player.name,
                    joined: player.joined,
                    lastActivity: player.lastActivity
                }))
            });
        }
        
        // If removing all players
        if (action === 'clear-players') {
            const prevCount = masterRoom.players.size;
            
            // Remove all players
            const playerIds = Array.from(masterRoom.players.keys());
            for (const playerId of playerIds) {
                roomManager.removePlayerFromRoom(roomManager.MASTER_ROOM_ID, playerId);
            }
            
            log(`Removed all ${prevCount} players from master room`);
            
            return res.json({
                success: true,
                action: 'clear-players',
                previousCount: prevCount,
                current: masterRoom.players.size
            });
        }
        
        // Default: just return game state info
        return res.json({
            masterRoom: {
                id: masterRoom.id,
                playerCount: masterRoom.players.size,
                players: Array.from(masterRoom.players.values()).map(player => ({
                    id: player.id,
                    name: player.name,
                    joined: player.joined,
                    lastActivity: player.lastActivity
                })),
                created: masterRoom.created,
                lastActivity: masterRoom.lastActivity
            },
            userStats: userStatsManager.getBasicStats(),
            roomCount: roomManager.rooms.size,
            actions: [
                { name: 'add-player', description: 'Add a test player', url: '/api/debug/game?action=add-player' },
                { name: 'add-player&count=5', description: 'Add 5 test players', url: '/api/debug/game?action=add-player&count=5' },
                { name: 'clear-players', description: 'Remove all players', url: '/api/debug/game?action=clear-players' }
            ]
        });
    } catch (error) {
        log(`Error in game debug endpoint: ${error.message}`);
        res.status(500).json({ 
            error: error.message,
            stack: error.stack 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    log('Error:', err.message);
    log('Stack:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 1337;
httpServer.listen(PORT, () => {
    log('='.repeat(50));
    log(`Server started successfully`);
    log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    log(`Port: ${PORT}`);
    log(`Socket.IO path: ${io.path()}`);
    log(`CORS enabled: ${app.get('cors')}`);
    
    log('='.repeat(50));
});

// Handle server shutdown
process.on('SIGTERM', () => {
    log('SIGTERM received. Shutting down gracefully...');
    httpServer.close(() => {
        log('Server closed');
        process.exit(0);
    });
}); 