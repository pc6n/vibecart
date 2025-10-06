import { MultiplayerManager } from './MultiplayerManager.js';

export class PlayManager {
    constructor(game) {
        this.game = game;
        this.multiplayerManager = null;
        this.autoRoomPrefix = 'public-';
        this.maxRetries = 3;
        this.maxPlayersPerRoom = 8;
        
        // Set the server URL based on the current hostname
        this.serverUrl = window.SERVER_URL || (window.location.hostname === 'localhost'
            ? `http://${window.location.hostname}:1337`   // Development
            : 'https://api.example.com');   
            
        this.sessionKey = 'racingcart_session';
        this.initializationTimeout = 30000; // 30 seconds timeout for initialization
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.gameInitialized = false;
    }

    /**
     * Start playing in multiplayer mode
     * @param {string} playerName - The player's name
     */
    async start(playerName) {
        console.log('[PLAY] Starting play mode for player:', playerName);
        
        // Store the player name and use a default if none is provided
        this.playerName = playerName || this.getDefaultPlayerName();
        
        // Clear any stale sessions first
        this.clearSession();
        
        // Keep track of what resources need to be cleaned up in case of an error
        let createdManager = false;
        
        try {
            // Check if server is available
            console.log('[PLAY] Checking server availability...');
            let serverData = null;
            
            try {
                const response = await fetch(`${this.serverUrl}/api/status`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    // Use AbortController for a better timeout mechanism
                    signal: AbortSignal.timeout(5000) // 5 second timeout
                });
                
                if (!response.ok) {
                    throw new Error(`Server returned error status: ${response.status}`);
                }
                
                serverData = await response.json();
                console.log('[PLAY] Server is available:', serverData);
            } catch (serverError) {
                console.error('[PLAY] Server availability check failed:', serverError);
                // Include more specific error info
                const errorMessage = serverError.name === 'AbortError' 
                    ? 'Game server connection timed out. Please check your internet connection and try again.'
                    : 'Game server is currently unavailable. Please try again later.';
                throw new Error(errorMessage);
            }
            
            // Initialize multiplayer manager
            if (!this.multiplayerManager) {
                this.multiplayerManager = new MultiplayerManager(this.game);
                createdManager = true;
            }
            
            // Connect to the master room with the appropriate room ID from server data
            const masterRoomId = serverData && serverData.masterRoomId ? serverData.masterRoomId : 'public-master';
            try {
                console.log(`[PLAY] Connecting to ${masterRoomId} room as ${this.playerName}`);
                await this.multiplayerManager.connect(masterRoomId, this.playerName);
                console.log('[PLAY] Successfully connected to master room');
            } catch (connectionError) {
                console.error('[PLAY] Failed to connect to master room:', connectionError);
                
                // Get a more specific error message based on the type of error
                let errorMessage = 'Unable to connect to multiplayer. Please check your connection and try again.';
                
                if (connectionError.message.includes('timeout')) {
                    errorMessage = 'Connection to game server timed out. Please check your internet connection and try again.';
                } else if (connectionError.message.includes('rejected')) {
                    errorMessage = 'Connection was rejected by game server. The server may be under maintenance.';
                } else if (connectionError.message.includes('Socket')) {
                    errorMessage = 'WebSocket connection failed. Please ensure your network allows WebSocket connections.';
                }
                
                throw new Error(errorMessage);
            }
            
            console.log('[PLAY] Successfully started play mode');
            return this.multiplayerManager;
            
        } catch (error) {
            console.error('[PLAY] Failed to start play mode:', error);
            
            // Clean up any resources - perform each cleanup separately to avoid cascading errors
            if (this.multiplayerManager) {
                try {
                    // Only call disconnect if we successfully created the manager
                    // and if the socket was actually created and connected
                    if (this.multiplayerManager.socket) {
                        await this.multiplayerManager.disconnect();
                    }
                } catch (disconnectError) {
                    console.warn('[PLAY] Error during disconnect cleanup:', disconnectError);
                }
                
                // Only null out the manager if we created it in this method
                if (createdManager) {
                    this.multiplayerManager = null;
                }
            }
            
            // Always clear session data on failure
            this.clearSession();
            
            // Re-throw with the original error to preserve the call stack
            throw error;
        }
    }
    
    /**
     * Get a default player name if none is provided
     * @private
     * @returns {string} A default player name 
     */
    getDefaultPlayerName() {
        // Try to get from localStorage first
        const savedName = localStorage.getItem('playerName');
        if (savedName) {
            return savedName;
        }
        
        // Generate a random player name as fallback
        return `Player${Math.floor(Math.random() * 1000)}`;
    }

    async waitForGameInitialization() {
        console.log('[PLAY] Waiting for game initialization...');
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            // Check if already initialized
            if (this.game.car) {
                console.log('[PLAY] Game already initialized');
                this.gameInitialized = true;
                resolve();
                return;
            }
            
            // Set up initialization check interval
            const checkInterval = setInterval(() => {
                if (this.game.car) {
                    console.log('[PLAY] Game initialization complete');
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    this.gameInitialized = true;
                    resolve();
                }
                
                // Log progress every second
                if ((Date.now() - startTime) % 1000 < 100) {
                    console.log('[PLAY] Still waiting for game initialization...');
                }
            }, 100);
            
            // Set up timeout
            const timeoutId = setTimeout(() => {
                clearInterval(checkInterval);
                const error = new Error('Game initialization timeout');
                console.error('[PLAY]', error.message);
                this.gameInitialized = false;
                reject(error);
            }, this.initializationTimeout);
        });
    }

    async createRoom(roomId, playerName) {
        const response = await fetch(`${this.serverUrl}/api/rooms`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ playerName }) // roomId is no longer needed
        });
        
        if (!response.ok) {
            throw new Error(`Failed to join room: ${response.status}`);
        }
        
        return await response.json();
    }

    generatePublicRoomId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 5);
        const roomId = `${this.autoRoomPrefix}${timestamp}-${random}`;
        console.log('[PLAY] Generated room ID:', roomId);
        return roomId;
    }

    saveSession(roomId, playerName) {
        const session = {
            roomId,
            playerName,
            timestamp: Date.now()
        };
        localStorage.setItem(this.sessionKey, JSON.stringify(session));
        localStorage.setItem('activePublicRoom', roomId);
    }

    loadSession() {
        const sessionData = localStorage.getItem(this.sessionKey);
        if (!sessionData) return null;
        
        try {
            const session = JSON.parse(sessionData);
            // Check if session is still valid (less than 24 hours old)
            if (Date.now() - session.timestamp > 24 * 60 * 60 * 1000) {
                this.clearSession();
                return null;
            }
            return session;
        } catch (error) {
            console.error('[PLAY] Error loading session:', error);
            this.clearSession();
            return null;
        }
    }

    clearSession() {
        localStorage.removeItem(this.sessionKey);
        localStorage.removeItem('activePublicRoom');
    }

    async restoreSession(session, currentPlayerName) {
        console.log('[PLAY] Attempting to restore session for room:', session.roomId);
        
        // Wait for game initialization first
        await this.waitForGameInitialization();
        
        // Create new multiplayer manager
        this.multiplayerManager = new MultiplayerManager(this.game);
        
        // Attempt to rejoin the room
        await this.multiplayerManager.connect(session.roomId, currentPlayerName);
        console.log('[PLAY] Successfully restored session');
        
        // Update session with new timestamp
        this.saveSession(session.roomId, currentPlayerName);
        return true;
    }

    disconnect() {
        console.log('[PLAY] Disconnecting from current session');
        
        try {
            // Safely disconnect if multiplayerManager exists
            if (this.multiplayerManager) {
                // Safely call disconnect with proper error handling
                try {
                    this.multiplayerManager.disconnect();
                } catch (error) {
                    console.warn('[PLAY] Error during multiplayerManager disconnect:', error);
                }
                
                // Clear the reference
                this.multiplayerManager = null;
            } else {
                console.log('[PLAY] No multiplayer manager to disconnect');
            }
            
            // Always clean up the session regardless of disconnection success
            this.clearSession();
            
            return true;
        } catch (error) {
            console.error('[PLAY] Error during session disconnection:', error);
            // Still try to clear the session
            this.clearSession();
            return false;
        }
    }

    async updatePlayerName(playerName) {
        if (!this.multiplayerManager) return;
        
        this.multiplayerManager.playerName = playerName;
        
        if (this.multiplayerManager.socket) {
            this.multiplayerManager.socket.emit('player-name-update', { playerName });
        }
    }
} 