import { v4 as uuidv4 } from 'uuid';

/**
 * Manages user statistics tracking for the application
 */
export class UserStatsManager {
    constructor(options = {}) {
        this.stats = {
            totalConnections: 0,
            currentlyActive: 0,
            uniqueIps: new Set(),
            uniqueSessions: new Set(),
            dailyVisitors: new Set(),
            connectionHistory: [],
            resetTime: Date.now()
        };

        // Set up reset timer for daily visitors
        this.setupResetTimer();
        
        // Log method
        this.log = options.logger || console.log;
    }

    /**
     * Set up timer to reset daily visitors at midnight
     */
    setupResetTimer() {
        // Reset daily visitors at midnight
        const resetDailyVisitors = () => {
            const now = new Date();
            if (now.getHours() === 0 && now.getMinutes() === 0) {
                this.log(`Resetting daily visitors count. Previous count: ${this.stats.dailyVisitors.size}`);
                this.stats.dailyVisitors = new Set();
            }
        };

        // Check for reset every minute
        setInterval(resetDailyVisitors, 60000);
    }

    /**
     * Create Express middleware to track user visits
     * @returns {Function} Express middleware
     */
    createMiddleware() {
        return (req, res, next) => {
            try {
                // Skip counting for only asset types and internal requests
                if (req.path === '/favicon.ico' || 
                    req.path.includes('.js') || 
                    req.path.includes('.css') || 
                    req.path.includes('.map') ||
                    req.path.includes('.png') ||
                    req.path.includes('.jpg') ||
                    req.path.includes('.svg') ||
                    req.path.includes('.json')) {
                    return next();
                }

                // Skip counting for the stats endpoint itself to avoid recursion
                if (req.path === '/api/stats' || req.path === '/api/stats/detailed') {
                    return next();
                }

                // Localhost development check
                const isLocalDevelopment = this.isLocalDevelopment(req);
                
                // Optional: Reset counts in development mode to avoid inflated numbers
                if (isLocalDevelopment && req.query.resetStats === 'true') {
                    this.log('Resetting stats counters for development');
                    this.resetStats();
                    return next();
                }

                // Count unique session (now for all requests including API calls)
                if (!this.stats.uniqueSessions.has(req.session.id)) {
                    this.stats.uniqueSessions.add(req.session.id);
                    this.stats.totalConnections++;
                    
                    // Record connection for history
                    this.stats.connectionHistory.push({
                        time: Date.now(),
                        sessionId: req.session.id,
                        ip: req.ip || 'unknown',
                        path: req.path,
                        userAgent: req.get('User-Agent') || 'unknown'
                    });
                    
                    // Trim history if too large
                    if (this.stats.connectionHistory.length > 1000) {
                        this.stats.connectionHistory = this.stats.connectionHistory.slice(-500);
                    }
                    
                    this.log(`New unique visitor: ${req.session.id} (path: ${req.path})`);
                }
                
                // Count daily unique visitors by session
                if (!this.stats.dailyVisitors.has(req.session.id)) {
                    this.stats.dailyVisitors.add(req.session.id);
                }
                
                // Track unique IPs
                if (req.ip && !this.stats.uniqueIps.has(req.ip)) {
                    this.stats.uniqueIps.add(req.ip);
                }
                
                // Special handling for local development - always count as active
                if (isLocalDevelopment && req.path === '/') {
                    this.stats.currentlyActive = Math.max(1, this.stats.currentlyActive);
                    this.log(`Local development detected - ensuring active count is at least 1`);
                }
                
                // For API requests, we don't increment/decrement the active count
                // as this is handled by socket.io connections
                const isApiRequest = req.path.startsWith('/api/');
                
                // Mark visitor as active (only for non-API requests to avoid double counting)
                if (!isApiRequest) {
                    this.stats.currentlyActive++;
                    
                    // Clean up active count after response
                    res.on('finish', () => {
                        // For local development, keep at least 1 active user
                        if (isLocalDevelopment) {
                            this.stats.currentlyActive = Math.max(1, this.stats.currentlyActive - 1);
                        } else {
                            this.stats.currentlyActive = Math.max(0, this.stats.currentlyActive - 1);
                        }
                    });
                }
                
                next();
            } catch (error) {
                // Ensure the middleware never breaks the application
                console.error('Error in user tracking middleware:', error);
                next();
            }
        };
    }

    /**
     * Create Socket.IO middleware for tracking user connections
     * @param {Socket} socket - Socket.IO socket instance
     */
    handleSocketConnection(socket) {
        try {
            // Check if this is a real user connection (not polling or background API call)
            const referer = socket.handshake.headers.referer || '';
            const userAgent = socket.handshake.headers['user-agent'] || '';
            
            // More thorough check for real user connections
            const isRealUserConnection = 
                // Has a referer that's not an API endpoint
                (referer && !referer.includes('/api/')) || 
                // Socket handshake contains query parameters (often from client connection)
                Object.keys(socket.handshake.query || {}).length > 0 ||
                // Check for common browser user agents (simple check)
                (userAgent && 
                  (userAgent.includes('Mozilla') || 
                   userAgent.includes('Chrome') || 
                   userAgent.includes('Safari') || 
                   userAgent.includes('Firefox') || 
                   userAgent.includes('Edge')));
            
            // Also check if this is a local development connection
            const isLocalDevelopment = 
                socket.handshake.address === '127.0.0.1' || 
                socket.handshake.address === '::1' || 
                socket.handshake.address === '::ffff:127.0.0.1';
            
            // Log connection info for debugging
            this.log(`Socket connection from ${socket.handshake.address}: referer=${referer}, isReal=${isRealUserConnection}, isLocal=${isLocalDevelopment}`);
            
            if (isRealUserConnection || isLocalDevelopment) {
                // Add to active users count
                this.stats.currentlyActive++;
                
                // If we have session info on the socket, count as unique session
                if (socket.request && socket.request.session) {
                    const sessionId = socket.request.session.id;
                    if (sessionId && !this.stats.uniqueSessions.has(sessionId)) {
                        this.stats.uniqueSessions.add(sessionId);
                        this.stats.totalConnections++;
                        
                        // Also track as daily visitor
                        this.stats.dailyVisitors.add(sessionId);
                        
                        this.log(`New unique visitor via Socket.IO: ${sessionId}`);
                    }
                } else if (isLocalDevelopment) {
                    // For local development without session, create a temp session ID
                    const tempSessionId = `socket-${socket.id}`;
                    if (!this.stats.uniqueSessions.has(tempSessionId)) {
                        this.stats.uniqueSessions.add(tempSessionId);
                        this.stats.dailyVisitors.add(tempSessionId);
                        this.log(`Added temp session for local socket: ${tempSessionId}`);
                    }
                }
                
                this.log(`Socket connected: ${socket.id}, Active users: ${this.stats.currentlyActive}`);
                
                // Decrement when user disconnects - but only if we counted them
                socket.on('disconnect', () => {
                    // For local development, never let active users drop below 1
                    if (isLocalDevelopment) {
                        this.stats.currentlyActive = Math.max(1, this.stats.currentlyActive - 1);
                    } else {
                        this.stats.currentlyActive = Math.max(0, this.stats.currentlyActive - 1);
                    }
                    this.log(`Socket disconnected: ${socket.id}, Active users: ${this.stats.currentlyActive}`);
                });
            }
        } catch (error) {
            this.log(`Error handling socket connection: ${error.message}`);
        }
    }

    /**
     * Check if the request is from a local development environment
     * @param {Request} req - Express request object
     * @returns {boolean} True if local development
     */
    isLocalDevelopment(req) {
        return req.hostname === 'localhost' || 
               req.hostname === '127.0.0.1' ||
               req.ip === '127.0.0.1' || 
               req.ip === '::1' ||
               req.ip === '::ffff:127.0.0.1';
    }

    /**
     * Reset all statistics
     */
    resetStats() {
        this.stats.totalConnections = 0;
        this.stats.currentlyActive = 0;
        this.stats.uniqueIps = new Set();
        this.stats.uniqueSessions = new Set();
        this.stats.dailyVisitors = new Set();
        this.stats.connectionHistory = [];
        this.stats.resetTime = Date.now();
    }

    /**
     * Add a test player to statistics
     * @returns {Object} Stats and player information
     */
    addTestPlayer() {
        const testPlayerName = `TestPlayer-${Math.floor(Math.random() * 1000)}`;
        const testPlayerId = uuidv4();
        
        // Increment user stats
        this.stats.currentlyActive++;
        this.stats.totalConnections++;
        this.stats.uniqueSessions.add(`test-session-${testPlayerId}`);
        this.stats.dailyVisitors.add(`test-session-${testPlayerId}`);
        
        this.log(`Added test user ${testPlayerName} (${testPlayerId})`);
        
        return {
            player: {
                id: testPlayerId,
                name: testPlayerName
            },
            currentStats: this.getBasicStats()
        };
    }

    /**
     * Increment active users count by a specified amount
     * @param {number} amount - Amount to increment by
     * @returns {Object} Updated statistics
     */
    incrementActiveUsers(amount = 1) {
        // Increment the active user count
        this.stats.currentlyActive += amount;
        
        // If totalConnections is less than currentlyActive, adjust it
        if (this.stats.totalConnections < this.stats.currentlyActive) {
            this.stats.totalConnections = this.stats.currentlyActive;
        }
        
        // Add a test session if we don't have enough
        while (this.stats.uniqueSessions.size < this.stats.currentlyActive) {
            const testSessionId = `test-session-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
            this.stats.uniqueSessions.add(testSessionId);
            this.stats.dailyVisitors.add(testSessionId);
        }
        
        this.log(`Manually incremented active users by ${amount}. Current count: ${this.stats.currentlyActive}`);
        
        return this.getBasicStats();
    }

    /**
     * Get basic statistics
     * @returns {Object} Basic statistics
     */
    getBasicStats() {
        return {
            totalConnections: this.stats.totalConnections,
            currentlyActive: this.stats.currentlyActive,
            uniqueIps: this.stats.uniqueIps.size,
            uniqueSessions: this.stats.uniqueSessions.size,
            dailyVisitors: this.stats.dailyVisitors.size,
        };
    }

    /**
     * Get detailed statistics
     * @returns {Object} Detailed statistics including recent connections
     */
    getDetailedStats() {
        // Get the last hour of connections
        const lastHour = Date.now() - (60 * 60 * 1000);
        const recentConnections = this.stats.connectionHistory
            .filter(conn => conn.time > lastHour)
            .map(conn => ({
                time: new Date(conn.time).toISOString(),
                path: conn.path,
                // Mask IP for privacy in logs
                ip: conn.ip.split('.').slice(0, 2).join('.') + '.xxx.xxx'
            }));
        
        return {
            ...this.getBasicStats(),
            recentConnections: recentConnections
        };
    }

    /**
     * Adjust the stats based on the room manager state
     * @param {Object} roomManager - The room manager instance
     * @param {Object} req - Express request object (optional)
     */
    adjustStatsForRoom(roomManager, req = null) {
        try {
            // Make sure we have a valid room manager
            if (!roomManager || !roomManager.getRoom || typeof roomManager.MASTER_ROOM_ID === 'undefined') {
                this.log('Warning: Invalid room manager provided to adjustStatsForRoom');
                return {
                    activePlayers: 0,
                    roomCount: 0
                };
            }
            
            let masterRoom;
            try {
                masterRoom = roomManager.getRoom(roomManager.MASTER_ROOM_ID);
            } catch (roomError) {
                this.log(`Error getting master room: ${roomError.message}`);
                const isLocalDevelopment = req ? this.isLocalDevelopment(req) : false;
                return {
                    activePlayers: isLocalDevelopment ? 1 : 0,
                    roomCount: roomManager.rooms ? roomManager.rooms.size : 0
                };
            }
            
            const isLocalDevelopment = req ? this.isLocalDevelopment(req) : false;
            
            // Make sure we have a valid room with players
            if (!masterRoom || !masterRoom.players) {
                this.log('Warning: Could not access master room or players property');
                return {
                    activePlayers: isLocalDevelopment ? 1 : 0,
                    roomCount: roomManager.rooms ? roomManager.rooms.size : 0
                };
            }
            
            // Get player count, safely handling if players is not iterable
            let playerCount = 0;
            try {
                playerCount = masterRoom.players.size || 0;
            } catch (countError) {
                this.log(`Error getting player count: ${countError.message}`);
                // Default to current active count for safety
                playerCount = this.stats.currentlyActive;
            }
            
            // In case there are more players in the room than our active user count,
            // we should update our active count to match
            if (playerCount > this.stats.currentlyActive) {
                this.stats.currentlyActive = playerCount;
                this.log(`Adjusting active users count to match player count: ${this.stats.currentlyActive}`);
            }
            
            // For local development, always show at least 1 active user
            if (isLocalDevelopment && this.stats.currentlyActive === 0) {
                this.stats.currentlyActive = 1;
                this.log(`Local development - ensuring active users count is at least 1`);
                
                // Also ensure we have at least one unique session and daily visitor for consistency
                if (this.stats.uniqueSessions.size === 0) {
                    const devSessionId = `dev-session-${Date.now()}`;
                    this.stats.uniqueSessions.add(devSessionId);
                    this.stats.dailyVisitors.add(devSessionId);
                    this.stats.totalConnections = Math.max(1, this.stats.totalConnections);
                    this.log(`Adding development session to stats`);
                }
            }

            // Always ensure we return the active players count as a number
            const activePlayers = isLocalDevelopment ? Math.max(1, playerCount || 0) : (playerCount || 0);
            const roomCount = roomManager.rooms ? roomManager.rooms.size : 0;
            
            this.log(`Stats adjusted: Active users=${this.stats.currentlyActive}, Active players=${activePlayers}, Rooms=${roomCount}`);
            
            return {
                activePlayers: activePlayers,
                roomCount: roomCount
            };
        } catch (error) {
            this.log(`Error adjusting stats for room: ${error.message}`);
            // For development, always return at least 1 active player
            const isLocalDevelopment = req ? this.isLocalDevelopment(req) : false;
            
            return {
                activePlayers: isLocalDevelopment ? 1 : 0,
                roomCount: 0
            };
        }
    }
} 