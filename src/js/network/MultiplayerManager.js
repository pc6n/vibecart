export class MultiplayerManager {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.playerName = null;
        this.peers = new Map(); // peerId -> { name, lastUpdate }
        this.handlers = new Map(); // eventType -> handler
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    async connect(roomId = 'public-master', playerName) {
        this.roomId = roomId;
        this.playerName = playerName;

        console.log('[MULTIPLAYER] Setting up socket connection...');
        
        // Connect to server
        const serverUrl = process.env.NODE_ENV === 'production' 
            ? 'https://vibecart.ch'
            : 'http://localhost:3001';

        this.socket = io(serverUrl, {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 3,
            timeout: 20000
        });

        // Set up socket event handlers
        this.setupSocketHandlers();

        // Join room
        return new Promise((resolve, reject) => {
            this.socket.once('connect', () => {
                console.log('[MULTIPLAYER] Connected to server');
                this.socket.emit('join-room', { roomId, playerName });
            });

            this.socket.once('room-joined', (data) => {
                console.log('[MULTIPLAYER] Successfully joined room:', data);
                this.isConnected = true;
                
                // Set up peers from room data
                data.peers.forEach(peer => {
                    this.peers.set(peer.id, {
                        name: peer.name,
                        lastUpdate: Date.now()
                    });
                });

                resolve(data);
            });

            this.socket.once('error', (error) => {
                console.error('[MULTIPLAYER] Failed to join room:', error);
                reject(error);
            });
        });
    }

    setupSocketHandlers() {
        // Handle peer updates (position, rotation, etc.)
        this.socket.on('peer-update', (data) => {
            const handler = this.handlers.get('peer-update');
            if (handler) {
                handler(data);
            }
        });

        // Handle new peer joining
        this.socket.on('peer-joined', (data) => {
            console.log('[MULTIPLAYER] New peer joined:', data);
            this.peers.set(data.peerId, {
                name: data.playerName,
                lastUpdate: Date.now()
            });

            const handler = this.handlers.get('peer-joined');
            if (handler) {
                handler(data);
            }
        });

        // Handle peer leaving
        this.socket.on('peer-left', (data) => {
            console.log('[MULTIPLAYER] Peer left:', data);
            this.peers.delete(data.peerId);

            const handler = this.handlers.get('peer-left');
            if (handler) {
                handler(data);
            }
        });

        // Handle disconnection
        this.socket.on('disconnect', () => {
            console.log('[MULTIPLAYER] Disconnected from server');
            this.isConnected = false;
        });

        // Handle reconnection
        this.socket.on('reconnect', () => {
            console.log('[MULTIPLAYER] Reconnected to server');
            if (this.roomId && this.playerName) {
                this.socket.emit('join-room', {
                    roomId: this.roomId,
                    playerName: this.playerName
                });
            }
        });
    }

    // Send game state update to server
    broadcastState(state) {
        if (!this.isConnected) return;
        
        this.socket.emit('player-update', {
            position: state.position,
            rotation: state.rotation,
            timestamp: Date.now()
        });
    }

    // Register event handlers
    on(eventType, handler) {
        this.handlers.set(eventType, handler);
    }

    // Clean up resources
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.peers.clear();
        this.handlers.clear();
        this.isConnected = false;
    }

    // Update method called by game loop
    update() {
        // No need for update logic with Socket.IO
        // Everything is event-driven
    }
} 