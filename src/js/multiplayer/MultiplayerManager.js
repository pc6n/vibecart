import * as THREE from 'three';
import { io } from 'socket.io-client';
import { BinarySerializer } from '../utils/BinarySerializer.js';

export class MultiplayerManager {
    constructor(game) {
        this.game = game;
        this.socket = null;
        this.roomId = null;
        this.playerName = null;
        this.peers = new Map(); // peerId -> { name, lastUpdate }
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this._lastBroadcastTime = null;
        this._lastHeartbeatTime = 0;
        this._heartbeatInterval = 5000; // Force update every 5 seconds
        this.ownId = null;
        this.cachedState = null;
        this.isRoomCreator = false;
        this.eventHandlers = new Map();
        
        // Initialize these as empty Maps to avoid undefined errors when clearing
        this.dataChannels = new Map();
        this.webrtcConnections = new Map();
    }

    /**
     * Set up the socket connection to the server
     * @returns {Promise} A promise that resolves when the connection is established
     */
    setupSocketConnection() {
        console.log('[MULTIPLAYER] Setting up socket connection...');
        
        return new Promise((resolve, reject) => {
            // Connect to server
            const serverUrl = window.SERVER_URL || (window.location.hostname === 'localhost' 
                ? `http://${window.location.hostname}:1337`   // Development
                : 'https://api.example.com');   
                
            // Initialize socket with explicit configuration
            this.socket = io(serverUrl, {
                path: '/socket.io',
                transports: ['websocket', 'polling'],
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: 5,
                timeout: 10000,
                autoConnect: true,
                forceNew: true,
                // Add query parameters to identify private room connections
                query: {
                    isPrivate: this.roomId && this.roomId.startsWith('private-'),
                    roomId: this.roomId,
                    // Add a timestamp to ensure a truly fresh connection
                    _t: Date.now()
                }
            });

            // Set up socket event handlers before connecting
            this.setupSocketHandlers();
            
            // Set up connection listeners
            this.socket.on('connect', () => {
                console.log('[MULTIPLAYER] Socket connected successfully with ID:', this.socket.id);
                clearTimeout(connectionTimeout);
                resolve();
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('[MULTIPLAYER] Socket connection error:', error);
                // Let the timeout handle the rejection
            });
            
            this.socket.on('connect_timeout', () => {
                console.error('[MULTIPLAYER] Socket connection timeout');
                // Let the timeout handle the rejection
            });
            
            // Set a timeout for initial connection
            const connectionTimeout = setTimeout(() => {
                if (!this.socket.connected) {
                    console.error('[MULTIPLAYER] Socket connection timeout after 15 seconds');
                    
                    // Try to reconnect once before giving up
                    if (this.retryCount < 1) {
                        this.retryCount++;
                        console.log(`[MULTIPLAYER] Retrying connection (attempt ${this.retryCount})...`);
                        
                        // Cleanup existing socket
                        if (this.socket) {
                            this.socket.removeAllListeners();
                            this.socket.disconnect();
                        }
                        
                        // Try again with a short delay
                        setTimeout(() => {
                            this.setupSocketConnection()
                                .then(resolve)
                                .catch(reject);
                        }, 1000);
                    } else {
                        reject(new Error('Failed to connect after retry'));
                    }
                }
            }, 15000);
        });
    }

    /**
     * Join a multiplayer room
     * @param {string} roomId - The ID of the room to join
     * @param {string} playerName - The player's name
     * @returns {Promise} A promise that resolves when the room is joined
     */
    async joinRoom(roomId, playerName) {
        console.log(`[MULTIPLAYER] Joining room ${roomId} as ${playerName}`);
        
        // Join room
        return new Promise((resolve, reject) => {
            // Set timeout for room joining
            const joinTimeout = setTimeout(() => {
                this.socket.off('room-joined');
                this.socket.off('error');
                reject(new Error('Room join timeout - server did not respond in 15 seconds'));
            }, 15000); // 15 second timeout
            
            // Store our own socket ID for filtering
            this.ownId = this.socket.id;
            
            console.log(`[MULTIPLAYER] Our socket ID is: ${this.ownId}`);
            
            // Before joining a new room, explicitly leave any existing rooms including the master room
            // This helps prevent the issue where a player appears in multiple rooms
            this.socket.rooms?.forEach(room => {
                if (room !== this.socket.id) { // Skip the default room (own ID)
                    console.log(`[MULTIPLAYER] Leaving previous Socket.IO room: ${room}`);
                    this.socket.emit('leave', room);
                    this.socket.emit('leave-room', { roomId: room });
                }
            });
            
            // Explicitly join the Socket.IO room first 
            this.socket.emit('join', roomId, (error) => {
                if (error) {
                    clearTimeout(joinTimeout);
                    console.error('[MULTIPLAYER] Failed to join Socket.IO room:', error);
                    reject(error);
                    return;
                }
                console.log('[MULTIPLAYER] Successfully joined Socket.IO room:', roomId);
                
                // If we're joining a private room, explicitly ensure we've left the master room
                if (roomId.startsWith('private-')) {
                    console.log('[MULTIPLAYER] Joining private room, ensuring we\'ve left the master room');
                    this.socket.emit('leave', 'public-master');
                    this.socket.emit('leave-room', { roomId: 'public-master' });
                }
                
                // Now emit join-room for game logic with our name
                this.socket.emit('join-room', { 
                    roomId, 
                    playerName,
                    socketId: this.socket.id,
                    timestamp: Date.now()
                });
                
                console.log('[MULTIPLAYER] join-room event sent, waiting for room-joined event');
            });

            this.socket.once('room-joined', (data) => {
                clearTimeout(joinTimeout);
                console.log('[MULTIPLAYER] Successfully joined room:', data);
                this.isConnected = true;
                
                // Process existing peers
                if (data.peers && Array.isArray(data.peers)) {
                    console.log(`[MULTIPLAYER] Room has ${data.peers.length} existing peers`);
                    
                    if (data.peers.length > 0) {
                        data.peers.forEach(peer => {
                            if (peer && peer.id) {
                                if (peer.id === this.ownId) {
                                    console.log(`[MULTIPLAYER] Skipping adding self as peer: ${peer.id}`);
                                } else {
                                    console.log(`[MULTIPLAYER] Adding existing peer: ${peer.id} (${peer.name || 'Unknown'})`);
                                    this.addPeer(peer.id, peer.name || `Player ${peer.id.substring(0, 5)}`);
                                }
                            } else {
                                console.warn(`[MULTIPLAYER] Received invalid peer data:`, peer);
                            }
                        });
                    } else {
                        console.log('[MULTIPLAYER] No existing peers in room');
                    }
                } else {
                    console.log('[MULTIPLAYER] No existing peers in room or invalid peer data');
                }

                resolve(data);
            });

            this.socket.once('error', (error) => {
                clearTimeout(joinTimeout);
                console.error('[MULTIPLAYER] Failed to join room:', error);
                reject(error);
            });
        });
    }

    setupSocketHandlers() {
        // Set up item handlers first
        if (this.game && this.game.itemManager) {
            
            // Handle initial item sync
            this.socket.on('items-sync', (items) => {
                if (this.game.itemManager) {
                    console.log('[MULTIPLAYER] Received items sync with', items.length, 'items');
                    
                    // Filter out items we already have to prevent unnecessary deletions/recreations
                    if (this.game.itemManager.items && this.game.itemManager.items.size > 0) {
                        const existingItemIds = new Set([...this.game.itemManager.items.keys()]);
                        
                        // Sort items into new ones and existing ones
                        const newItems = [];
                        const existingItems = [];
                        
                        items.forEach(item => {
                            if (existingItemIds.has(item.id)) {
                                existingItems.push(item.id);
                            } else {
                                newItems.push(item);
                            }
                        });
                        
                        // Log the breakdown
                        console.log(`[MULTIPLAYER] Items sync: ${newItems.length} new, ${existingItems.length} existing, ${this.game.itemManager.items.size} total local`);
                        
                        // Only add new items without removing existing ones
                        if (newItems.length > 0) {
                            newItems.forEach(itemData => {
                                this.game.itemManager.handleNewItem(itemData);
                            });
                        }
                    } else {
                        // If we don't have any items, use the full sync
                        this.game.itemManager.handleItemSync(items);
                    }
                }
            });

            // Handle banana thrown by other players
            this.socket.on('banana-thrown', (data) => {
                const { position, rotation, velocity, throwerId } = data;
                
                // Skip if we're the thrower
                if (throwerId === this.socket.id) {
                    return;
                }
                
                console.log('[MULTIPLAYER] Received banana thrown by another player:', {
                    throwerId,
                    position,
                    rotation
                });

                // Create the banana in our game
                if (this.game.itemManager) {
                    // We need to find the thrower car instance if possible
                    let throwerCar = null;
                    if (this.game.remotePlayers && this.game.remotePlayers.has(throwerId)) {
                        throwerCar = this.game.remotePlayers.get(throwerId);
                    }
                    
                    // Use the ItemManager's method to create and track the banana
                    if (typeof this.game.itemManager.createThrownBanana === 'function') {
                        this.game.itemManager.createThrownBanana(
                            new THREE.Vector3(position[0], position[1], position[2]),
                            rotation,
                            new THREE.Vector3(velocity[0], velocity[1], velocity[2]),
                            throwerCar
                        );
                    } else {
                        console.warn('[MULTIPLAYER] ItemManager does not have createThrownBanana method');
                    }
                }
            });
            
            // Handle shell thrown by other players
            this.socket.on('shell-thrown', (data) => {
                const { position, rotation, velocity, throwerId } = data;
                
                // Skip if we're the thrower
                if (throwerId === this.socket.id) {
                    return;
                }
                
                console.log('[MULTIPLAYER] Received shell thrown by another player:', {
                    throwerId,
                    position,
                    rotation
                });

                // Create the shell in our game
                if (this.game.itemManager) {
                    // We need to find the thrower car instance if possible
                    let throwerCar = null;
                    if (this.game.remotePlayers && this.game.remotePlayers.has(throwerId)) {
                        throwerCar = this.game.remotePlayers.get(throwerId);
                    }
                    
                    // Use the ItemManager's method to create and track the shell
                    if (typeof this.game.itemManager.createThrownShell === 'function') {
                        this.game.itemManager.createThrownShell(
                            new THREE.Vector3(position[0], position[1], position[2]),
                            rotation,
                            new THREE.Vector3(velocity[0], velocity[1], velocity[2]),
                            throwerCar
                        );
                    } else {
                        console.warn('[MULTIPLAYER] ItemManager does not have createThrownShell method');
                    }
                }
            });
            
            // Handle shell collision events from other players
            this.socket.on('shell-collision', (data) => {
                const { position, hitCarId, throwerId, timestamp } = data;
                
                console.log('[MULTIPLAYER] Received shell collision event:', {
                    hitCarId,
                    throwerId,
                    position
                });
                
                // Skip if we're the thrower (we already handled this locally)
                if (throwerId === this.socket.id) {
                    return;
                }
                
                // Apply collision effects if we're the one being hit
                if (hitCarId === this.socket.id && this.game.car) {
                    console.log('[MULTIPLAYER] Our car was hit by a shell!');
                    
                    // Apply spin effect to our car
                    if (this.game.itemManager) {
                        this.game.itemManager.handleShellCollision(this.game.car, {
                            position: new THREE.Vector3(position[0], position[1], position[2])
                        });
                        
                        // Create explosion effect
                        this.game.itemManager.createExplosion(
                            new THREE.Vector3(position[0], position[1], position[2])
                        );
                        
                        // Apply screen shake
                        this.game.itemManager.applyScreenShake(1.0); // Full intensity for direct hit
                    }
                } else {
                    // If we're not the one being hit, just show visual effects
                    if (this.game.itemManager) {
                        console.log('[MULTIPLAYER] Creating remote shell collision effect');
                        // Create explosion at the collision point
                        this.game.itemManager.createExplosion(
                            new THREE.Vector3(position[0], position[1], position[2])
                        );
                        
                        // Apply mild screen shake for nearby explosions
                        this.game.itemManager.applyScreenShake(0.3); // Reduced intensity for distant hit
                        
                        // If we know which car was hit, apply spin effect to it
                        if (hitCarId && this.game.remotePlayers && this.game.remotePlayers.has(hitCarId)) {
                            const hitCar = this.game.remotePlayers.get(hitCarId);
                            if (hitCar) {
                                this.game.itemManager.handleShellCollision(hitCar, {
                                    position: new THREE.Vector3(position[0], position[1], position[2])
                                });
                            }
                        }
                    }
                }
            });

            // Handle new items spawned
            this.socket.on('item-spawned', (itemData) => {
                if (this.game.itemManager && !this.game.itemManager.items.has(itemData.id)) {
                    this.game.itemManager.handleNewItem(itemData);
                }
            });

            // Handle item collection with detailed logging
            this.socket.on('item-collected', (data) => {
                const currentSocketId = this.socket.id;
                console.log('[MULTIPLAYER] Received item-collected event:', {
                    itemId: data.itemId,
                    collectedBy: data.collectedBy,
                    currentSocketId: currentSocketId,
                    isCollector: data.collectedBy === currentSocketId
                });
                
                // Skip if we're the collector
                if (data.collectedBy === currentSocketId) {
                    console.log('[MULTIPLAYER] Skipping item collection - we were the collector');
                    return;
                }

                // Remove the item from the game
                if (this.game && this.game.itemManager) {
                    const item = this.game.itemManager.items.get(data.itemId);
                    if (item) {
                        console.log('[MULTIPLAYER] Removing collected item from scene:', {
                            itemId: data.itemId,
                            itemType: item.type,
                            collectedBy: data.collectedBy,
                            currentSocketId: currentSocketId
                        });
                        this.game.itemManager.removeItem(item);
                    } else {
                        console.warn('[MULTIPLAYER] Item not found in manager:', {
                            itemId: data.itemId,
                            availableItems: Array.from(this.game.itemManager.items.keys())
                        });
                    }
                } else {
                    console.warn('[MULTIPLAYER] No itemManager available to handle collection');
                }
            });
        } else {
            console.warn('[MULTIPLAYER] No itemManager available during socket handler setup');
        }

        // Handle peer updates (position, rotation, etc.)
        this.socket.on('peer-update', (data) => {
            // Support different property naming formats
            const peerId = data.peerId || data.id;
            const { position, rotation, timestamp } = data;
            
            // Validate peer ID
            if (!peerId) {
                console.warn(`[MULTIPLAYER] Received update for invalid peer ID, ignoring:`, data);
                return;
            }
            
            // Ensure we have this peer
            if (!this.peers.has(peerId)) {
                console.warn(`[MULTIPLAYER] Received update for unknown peer ${peerId}, waiting for peer-joined event`);
                return;
            }

            // Process position data safely
            let positionObj = null;
            if (position && Array.isArray(position) && position.length >= 3) {
                positionObj = {
                    x: parseFloat(position[0]),
                    y: parseFloat(position[1]),
                    z: parseFloat(position[2])
                };
            } else if (position && typeof position === 'object') {
                positionObj = position;
            }
            
            // Update the remote car if game is available
            if (this.game && this.game.updateRemotePlayer) {
                try {
                    if (!this.game.remotePlayers.has(peerId)) {
                        // Remote player doesn't exist yet, create it first
                        const playerName = this.peers.get(peerId).name;
                        this.addPeer(peerId, playerName).then(() => {
                            // After creation, update with the position and rotation
                            if (positionObj) {
                                this.game.updateRemotePlayer(peerId, positionObj, rotation);
                            }
                        });
                    } else {
                        // Player exists, just update position and rotation
                        this.game.updateRemotePlayer(peerId, positionObj, rotation);
                    }
                } catch (error) {
                    console.error(`[MULTIPLAYER] Error updating remote player ${peerId}:`, error);
                }
            } else {
                console.warn('[MULTIPLAYER] Cannot update remote player - game or updateRemotePlayer not available');
            }

            // Update last update time
            const peer = this.peers.get(peerId);
            peer.lastUpdate = timestamp || Date.now();
        });
        
        // Handle binary serialized peer updates (performance optimized)
        this.socket.on('peer-update-binary', (binaryData) => {
            try {
                // Skip processing if binaryData is null or undefined
                if (!binaryData) {
                    console.warn('[MULTIPLAYER] Received null or undefined binary data');
                    return;
                }
                
                // Deserialize the binary data
                const data = BinarySerializer.deserialize(binaryData);
                
                // Support different property naming formats
                const peerId = data.peerId || data.id;
                const { position, rotation, timestamp } = data;
                
                // Validate peer ID
                if (!peerId) {
                    console.warn(`[MULTIPLAYER] Received binary update for invalid peer ID, ignoring`);
                    return;
                }
                
                // Ensure we have this peer
                if (!this.peers.has(peerId)) {
                    console.warn(`[MULTIPLAYER] Received binary update for unknown peer ${peerId}, waiting for peer-joined event`);
                    return;
                }

                // Process position data safely
                let positionObj = null;
                if (position && Array.isArray(position) && position.length >= 3) {
                    positionObj = {
                        x: parseFloat(position[0]),
                        y: parseFloat(position[1]),
                        z: parseFloat(position[2])
                    };
                } else if (position && typeof position === 'object') {
                    positionObj = position;
                }
                
                // Update the remote car if game is available
                if (this.game && this.game.updateRemotePlayer) {
                    try {
                        if (!this.game.remotePlayers.has(peerId)) {
                            // Remote player doesn't exist yet, create it first
                            const playerName = this.peers.get(peerId).name;
                            this.addPeer(peerId, playerName).then(() => {
                                // After creation, update with the position and rotation
                                if (positionObj) {
                                    this.game.updateRemotePlayer(peerId, positionObj, rotation);
                                }
                            });
                        } else {
                            // Player exists, just update position and rotation
                            this.game.updateRemotePlayer(peerId, positionObj, rotation);
                        }
                    } catch (error) {
                        console.error(`[MULTIPLAYER] Error updating remote player ${peerId} from binary data:`, error);
                    }
                }

                // Update last update time
                const peer = this.peers.get(peerId);
                peer.lastUpdate = timestamp || Date.now();
            } catch (error) {
                console.error('[MULTIPLAYER] Error processing binary peer update:', error);
            }
        });

        // Manually broadcast a player-joined event when we detect a new peer
        this.socket.on('peer-joined', (data) => {
            if (data && data.id && data.name) {
                console.log(`[MULTIPLAYER] Peer joined: ${data.name} (${data.id})`);
                
                // Add the peer to our local peers map
                if (!this.peers.has(data.id)) {
                    this.peers.set(data.id, {
                        id: data.id,
                        name: data.name,
                        lastUpdate: Date.now()
                    });
                }
                
                // Broadcast player joined event to our own game
                this.emit('playerJoined', {
                    id: data.id,
                    name: data.name
                });
            }
        });

        // When we join a room, broadcast our presence to other players
        this.socket.on('room-joined', (data) => {
            // Broadcast our player info to all peers in the room
            setTimeout(() => {
                console.log('[MULTIPLAYER] Broadcasting our presence to room');
                this.socket.emit('announce-player', {
                    roomId: this.roomId,
                    id: this.socket.id,
                    name: this.playerName
                });
            }, 1000);
            
            // Process existing peers from the room-joined data
            if (data && data.peers && Array.isArray(data.peers)) {
                data.peers.forEach(peer => {
                    if (peer && peer.id && peer.id !== this.socket.id) {
                        // Add peer to our peers map
                        this.peers.set(peer.id, {
                            id: peer.id,
                            name: peer.name || `Player ${peer.id.slice(0, 4)}`,
                            lastUpdate: Date.now()
                        });
                        
                        // Trigger player joined event
                        this.emit('playerJoined', {
                            id: peer.id,
                            name: peer.name || `Player ${peer.id.slice(0, 4)}`
                        });
                    }
                });
            }
        });
        
        // Handle announcements from other players
        this.socket.on('player-announcement', (data) => {
            if (data && data.id && data.id !== this.socket.id) {
                console.log(`[MULTIPLAYER] Player announcement from: ${data.name} (${data.id})`);
                
                // Add to peers if not already there
                if (!this.peers.has(data.id)) {
                    this.peers.set(data.id, {
                        id: data.id,
                        name: data.name,
                        lastUpdate: Date.now()
                    });
                    
                    // Broadcast player joined event
                    this.emit('playerJoined', {
                        id: data.id,
                        name: data.name
                    });
                }
            }
        });

        // Handle peer leaving
        this.socket.on('peer-left', (data) => {
            console.log('[MULTIPLAYER] Peer left:', data);
            
            // Support different formats (string ID or object with id/peerId property)
            let peerId;
            if (typeof data === 'string') {
                peerId = data;
            } else if (typeof data === 'object') {
                peerId = data.peerId || data.id;
            }
            
            if (peerId) {
                this.removePeer(peerId);
            } else {
                console.warn('[MULTIPLAYER] Received invalid peer-left event:', data);
            }
        });

        // Handle disconnection
        this.socket.on('disconnect', () => {
            console.log('[MULTIPLAYER] Disconnected from server');
            this.isConnected = false;
            
            // Show a subtle disconnection message to the user
            if (this.game && this.game.showNotification) {
                this.game.showNotification('Connection lost, attempting to reconnect...', 3000);
            }
            
            // Cache current game state for smoother reconnection
            this.cacheGameState();
        });

        // Handle reconnection
        this.socket.on('reconnect', () => {
            console.log('[MULTIPLAYER] Reconnected to server');
            
            // Show reconnection message
            if (this.game && this.game.showNotification) {
                this.game.showNotification('Reconnected successfully!', 2000);
            }
            
            // Rejoin the room with any cached data
            if (this.roomId && this.playerName) {
                this.socket.emit('join-room', {
                    roomId: this.roomId,
                    playerName: this.playerName,
                    // Include player position for smoother reconnection
                    position: this.getCachedPosition(),
                    rotation: this.getCachedRotation()
                });
            }
            
            // Restore the connection flag
            this.isConnected = true;
        });

        // Add debug logging for all incoming events
        this.socket.onAny((eventName, ...args) => {
            // Log all events except frequent updates
            if (!eventName.includes('update')) {
                console.log(`[MULTIPLAYER] Received event '${eventName}':`, {
                    args,
                    socketId: this.socket.id,
                    roomId: this.roomId,
                    isConnected: this.isConnected
                });
            }
        });

        this.socket.on('peer-name-updated', (data) => {
            const { peerId, playerName } = data;
            if (this.game && this.game.remotePlayers.has(peerId)) {
                const remoteCar = this.game.remotePlayers.get(peerId);
                if (remoteCar) {
                    remoteCar.setPlayerName(playerName);
                }
            }
        });

        // Handle AI car updates
        this.socket.on('ai-car-update', (data) => {
            // Skip all AI car updates as we're using local-only AI cars for performance
            console.debug('[MULTIPLAYER] Ignoring AI car update - using local-only AI cars for performance');
            return;
        });

        // Handle room creation response
        this.socket.on('room-created', (data) => {
            console.log('[MULTIPLAYER] Room created:', data);
            this.isRoomCreator = true;
            this.roomId = data.roomId;
        });

        // Handle race start
        this.socket.on('start-race', () => {
            console.log('[MULTIPLAYER] Race start received');
            this.emit('startRace');
        });

        // Handle player joined
        this.socket.on('player-joined', (data) => {
            console.log('[MULTIPLAYER] Player joined:', data);
            this.emit('playerJoined', data);
        });

        // Handle player left
        this.socket.on('player-left', (data) => {
            console.log('[MULTIPLAYER] Player left:', data);
            this.emit('playerLeft', data);
        });
    }

    async addPeer(peerId, playerName) {
        // Validate peer ID
        if (!peerId) {
            console.error(`[MULTIPLAYER] Cannot add peer: Invalid peer ID (${peerId})`);
            return;
        }
        
        // Validate player name and ensure it's a string
        if (!playerName || typeof playerName === 'object') {
            playerName = `Player ${peerId.substring(0, 5)}`;
            console.log(`[MULTIPLAYER] Invalid player name for peer ${peerId}, using default: ${playerName}`);
        }
        // Ensure playerName is a string
        playerName = String(playerName);
        
        console.log(`[MULTIPLAYER] Adding peer ${peerId} with name ${playerName}`);
        
        // Skip adding ourselves as a peer
        if (peerId === this.ownId) {
            console.log(`[MULTIPLAYER] Skipping adding self (${peerId}) as a peer`);
            return;
        }
        
        // Add to peers map
        this.peers.set(peerId, {
            name: playerName,
            lastUpdate: Date.now()
        });

        // Create remote car if game is available
        if (!this.game) {
            console.warn('[MULTIPLAYER] Game not available, cannot create remote car');
            return;
        }
        
        // Check if remote player already exists
        if (this.game.remotePlayers.has(peerId)) {
            console.log(`[MULTIPLAYER] Remote player ${peerId} already exists, updating name`);
            const remotePlayer = this.game.remotePlayers.get(peerId);
            if (remotePlayer && remotePlayer.car) {
                remotePlayer.name = playerName;
                remotePlayer.car.setPlayerName(playerName);
            }
            return;
        }
        
        console.log(`[MULTIPLAYER] Creating remote car for peer ${peerId}`);
        
        try {
            // Create properly structured player data
            const playerData = {
                name: playerName,
                // Default position near start if track exists
                position: this.game.track ? {
                    x: this.game.track.trackRadius,
                    y: 0.5,
                    z: 0
                } : { x: 0, y: 0.5, z: 0 }
            };
            
            const remoteCar = await this.game.addRemotePlayer(peerId, playerData.name);
            
            if (!remoteCar) {
                console.error(`[MULTIPLAYER] Failed to create remote car for peer ${peerId}`);
            } else {
                console.log(`[MULTIPLAYER] Successfully created remote car for peer ${peerId}`);
            }
        } catch (error) {
            console.error(`[MULTIPLAYER] Failed to initialize remote car:`, error);
        }
    }

    removePeer(peerId) {
        // Validate peer ID
        if (!peerId) {
            console.error(`[MULTIPLAYER] Cannot remove peer: Invalid peer ID (${peerId})`);
            return;
        }
        
        // Remove from peers map
        this.peers.delete(peerId);

        // Remove remote car
        if (this.game) {
            this.game.removeRemotePlayer(peerId).catch(error => {
                console.error('[MULTIPLAYER] Error removing remote car:', error);
            });
        }
    }

    // Send game state update to server
    broadcastState(state) {
        if (!this.isConnected || !this.socket) {
            console.warn('[MULTIPLAYER] Cannot broadcast state - not connected');
            return;
        }
        
        try {
            // Check if position and rotation are valid before sending
            if (!state || !state.position || typeof state.rotation === 'undefined') {
                console.warn('[MULTIPLAYER] Cannot broadcast state - invalid position or rotation data:', state);
                return;
            }
            
            // Format position data as array if it's not already
            let positionArray;
            if (Array.isArray(state.position)) {
                positionArray = state.position;
            } else if (state.position.toArray && typeof state.position.toArray === 'function') {
                positionArray = state.position.toArray();
            } else if (state.position.x !== undefined) {
                positionArray = [state.position.x, state.position.y, state.position.z];
            } else {
                console.warn('[MULTIPLAYER] Cannot broadcast state - invalid position format:', state.position);
                return;
            }
            
            // Validate data before sending
            if (!positionArray || !Array.isArray(positionArray) || positionArray.length < 3) {
                console.warn('[MULTIPLAYER] Cannot broadcast state - position array is invalid:', positionArray);
                return;
            }
            
            // Ensure all position values are numbers
            const finalPosition = positionArray.map(value => {
                const num = parseFloat(value);
                return isNaN(num) ? 0 : num; // Convert NaN to 0 to avoid errors
            });
            
            // Create update data object
            const updateData = {
                peerId: this.socket.id,
                position: finalPosition,
                rotation: state.rotation,
                timestamp: Date.now()
            };
            
            // Use MessagePack for binary serialization of remote car updates
            try {
                // Serialize the update data to binary format using MessagePack
                const binaryData = BinarySerializer.serialize(updateData);
                
                // Send binary update
                this.socket.emit('player-update-binary', binaryData);
                
                // Set last broadcast time
                this._lastBroadcastTime = Date.now();
            } catch (error) {
                console.error('[MULTIPLAYER] Error serializing state update:', error);
                
                // Fallback to regular JSON in case of error
                console.log('[MULTIPLAYER] Falling back to regular JSON update');
                this.socket.emit('player-update', updateData);
                this._lastBroadcastTime = Date.now();
            }
            
            // Additional debug logging if broadcast frequency is very low
            if (!this._lastBroadcastTime || Date.now() - this._lastBroadcastTime > 10000) {
                console.warn('[MULTIPLAYER] First broadcast or no broadcasts in last 10 seconds');
            }
            
        } catch (error) {
            console.error('[MULTIPLAYER] Error broadcasting state:', error);
        }
    }

    /**
     * Disconnect from the current room and server
     */
    async disconnect() {
        console.log('[MULTIPLAYER] Disconnecting from server and room:', this.roomId);
        
        try {
            // First, leave any rooms we're in
            if (this.socket && this.socket.connected) {
                // Leave the current room
                if (this.roomId) {
                    console.log('[MULTIPLAYER] Leaving room:', this.roomId);
                    // Leave both the game room and the Socket.IO room
                    this.socket.emit('leave-room', { roomId: this.roomId });
                    this.socket.emit('leave', this.roomId);
                    
                    // If we're in a private room, also ensure we leave the public master room
                    if (this.roomId.startsWith('private-')) {
                        console.log('[MULTIPLAYER] Also leaving public-master room');
                        this.socket.emit('leave-room', { roomId: 'public-master' });
                        this.socket.emit('leave', 'public-master');
                    }
                    
                    // Wait a moment for the leave events to be processed
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            // Clear all peers
            if (this.peers) {
                this.peers.forEach((_, peerId) => {
                    try {
                        this.removePeer(peerId);
                    } catch (error) {
                        console.warn(`[MULTIPLAYER] Error removing peer ${peerId}:`, error);
                    }
                });
                this.peers.clear();
            }
            
            // Close all data channels
            if (this.dataChannels) {
                this.dataChannels.forEach(channel => {
                    if (channel && channel.readyState !== 'closed') {
                        channel.close();
                    }
                });
                this.dataChannels.clear();
            }
            
            // Close all WebRTC connections
            if (this.webrtcConnections) {
                this.webrtcConnections.forEach(connection => {
                    if (connection) {
                        connection.close();
                    }
                });
                this.webrtcConnections.clear();
            }
            
            // Finally disconnect the socket
            if (this.socket) {
                this.socket.removeAllListeners();
                this.socket.disconnect();
                this.socket = null;
            }
            
            // Reset state
            this.isConnected = false;
            this.roomId = null;
            this.playerName = null;
            
            console.log('[MULTIPLAYER] Successfully disconnected and cleaned up');
            
        } catch (error) {
            console.error('[MULTIPLAYER] Error during disconnect:', error);
            // Still reset state even if there was an error
            this.isConnected = false;
            this.roomId = null;
            this.playerName = null;
            throw error;
        }
    }

    // Update method called by game loop
    update(deltaTime) {
        // Check if we need to send a heartbeat broadcast
        const currentTime = Date.now();
        if (currentTime - this._lastHeartbeatTime > this._heartbeatInterval) {
            this._lastHeartbeatTime = currentTime;
            this.sendHeartbeat();
        }
    }
    
    // Send a heartbeat update to ensure position data keeps flowing
    sendHeartbeat() {
        if (!this.isConnected || !this.socket || !this.game || !this.game.car) {
            return;
        }
        
        const state = {
            position: this.game.car.getPosition(),
            rotation: this.game.car.getRotation()
        };
        
        console.debug('[MULTIPLAYER] Sending position heartbeat');
        this.broadcastState(state);
    }

    // Debug helper
    getDebugState() {
        return {
            isConnected: this.isConnected,
            peersCount: this.peers.size,
            peersList: Array.from(this.peers.keys()),
            remotePlayersCount: this.game ? this.game.remotePlayers.size : 0,
            remotePlayersList: this.game ? Array.from(this.game.remotePlayers.keys()) : []
        };
    }

    // Broadcast thrown shell to other players
    broadcastThrownShell(position, rotation, velocity) {
        if (!this.isConnected || !this.socket) {
            console.warn('[MULTIPLAYER] Cannot broadcast thrown shell - not connected');
            return;
        }

        try {
            // Convert position and velocity to arrays for network transmission
            const positionArray = position.toArray ? position.toArray() : [position.x, position.y, position.z];
            const velocityArray = velocity.toArray ? velocity.toArray() : [velocity.x, velocity.y, velocity.z];

            console.log('[MULTIPLAYER] Broadcasting thrown shell:', {
                position: positionArray,
                rotation,
                velocity: velocityArray
            });

            this.socket.emit('shell-thrown', {
                position: positionArray,
                rotation,
                velocity: velocityArray,
                throwerId: this.socket.id,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('[MULTIPLAYER] Error broadcasting thrown shell:', error);
        }
    }
    
    // Broadcast thrown banana to other players
    broadcastThrownBanana(position, rotation, velocity) {
        if (!this.isConnected || !this.socket) {
            console.warn('[MULTIPLAYER] Cannot broadcast thrown banana - not connected');
            return;
        }

        try {
            // Convert position and velocity to arrays for network transmission
            const positionArray = position.toArray ? position.toArray() : [position.x, position.y, position.z];
            const velocityArray = velocity.toArray ? velocity.toArray() : [velocity.x, velocity.y, velocity.z];

            console.log('[MULTIPLAYER] Broadcasting thrown banana:', {
                position: positionArray,
                rotation,
                velocity: velocityArray
            });

            const itemData = {
                position: positionArray,
                rotation,
                velocity: velocityArray,
                throwerId: this.socket.id,
                timestamp: Date.now()
            };

            try {
                // Serialize the banana data using MessagePack
                const binaryData = BinarySerializer.serialize(itemData);
                
                // Send the binary data
                this.socket.emit('banana-thrown-binary', binaryData);
            } catch (error) {
                console.error('[MULTIPLAYER] Error serializing banana data:', error);
                
                // Fallback to JSON if serialization fails
                this.socket.emit('banana-thrown', itemData);
            }
        } catch (error) {
            console.error('[MULTIPLAYER] Error broadcasting thrown banana:', error);
        }
    }

    /**
     * Broadcast a shell collision event to other players
     * @param {Object} collisionData - Data about the collision
     */
    broadcastShellCollision(collisionData) {
        if (!this.isConnected || !this.socket) {
            console.warn('[MULTIPLAYER] Cannot broadcast shell collision - not connected');
            return;
        }

        try {
            console.log('[MULTIPLAYER] Broadcasting shell collision:', collisionData);

            this.socket.emit('shell-collision', {
                position: collisionData.position,
                hitCarId: collisionData.hitCarId,
                throwerId: collisionData.throwerId || this.socket.id,
                timestamp: collisionData.timestamp || Date.now()
            });
        } catch (error) {
            console.error('[MULTIPLAYER] Error broadcasting shell collision:', error);
        }
    }

    // Cache current game state for smoother reconnection
    cacheGameState() {
        // Save player's current state
        if (this.game && this.game.car) {
            this.cachedState = {
                position: this.game.car.getPosition().clone(),
                rotation: this.game.car.rotation,
                timestamp: Date.now()
            };
        }
    }
    
    // Get cached position for reconnection
    getCachedPosition() {
        if (this.cachedState && this.cachedState.position) {
            // Only use cached position if it's recent (within 5 seconds)
            if (Date.now() - this.cachedState.timestamp < 5000) {
                return this.cachedState.position.toArray();
            }
        }
        
        // Return null if no cached position or too old
        return null;
    }
    
    // Get cached rotation for reconnection
    getCachedRotation() {
        if (this.cachedState && this.cachedState.rotation !== undefined) {
            // Only use cached rotation if it's recent (within 5 seconds)
            if (Date.now() - this.cachedState.timestamp < 5000) {
                return this.cachedState.rotation;
            }
        }
        
        // Return null if no cached rotation or too old
        return null;
    }

    async createRoom(playerName, isPrivate = false) {
        try {
            // Generate a unique room ID
            const roomId = isPrivate ? `private-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` : `public-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            
            console.log(`[MULTIPLAYER] Creating new ${isPrivate ? 'private' : 'public'} room: ${roomId}`);
            
            // Disconnect from any existing rooms first (especially if connected to public-master)
            if (this.isConnected) {
                await this.disconnect();
            }
            
            // Connect to the new room
            await this.connect(roomId, playerName);
            
            // For private rooms, remove all AI cars immediately to be absolutely sure
            if (isPrivate && this.game && this.game.aiManager) {
                console.log('[MULTIPLAYER] This is a private room - completely disabling AI cars');
                this.game.aiManager.removeAllAICars();
                this.game.aiManager.maxAICars = 0;
            }
            
            return roomId;
        } catch (error) {
            console.error('[MULTIPLAYER] Failed to create room:', error);
            throw error;
        }
    }

    /**
     * Connect to a multiplayer room
     * @param {string} roomId - The ID of the room to connect to
     * @param {string} playerName - The player's name
     */
    async connect(roomId = 'public-master', playerName) {
        console.log(`[MULTIPLAYER] Connecting to room ${roomId} as ${playerName}...`);
        
        this.roomId = roomId;
        this.playerName = playerName;
        
        // Set a special flag for room creator depending on room ID
        this.isRoomCreator = roomId.startsWith('private-') && roomId.includes(this.generateUniqueId());
        console.log(`[MULTIPLAYER] Room creator status: ${this.isRoomCreator}`);
        
        // Set up socket connection
        await this.setupSocketConnection();
        
        // Join the room
        const joinResult = await this.joinRoom(roomId, playerName);
        
        // Send announcement to room to make sure everyone sees us
        setTimeout(() => {
            this.socket.emit('announce-player', {
                roomId: roomId,
                id: this.socket.id,
                name: playerName
            });
            console.log('[MULTIPLAYER] Sent player announcement to room');
        }, 1500);
        
        return joinResult;
    }

    // Add helper to generate a unique ID for room creation
    generateUniqueId() {
        // Use the device fingerprint or some random value
        const randomValue = Math.floor(Math.random() * 1000000).toString(36);
        const timestamp = Date.now().toString(36);
        return `${timestamp}-${randomValue}`;
    }

    // Add event listener
    on(event, callback) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(callback);
    }

    // Remove event listener
    off(event, callback) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).delete(callback);
        }
    }

    // Trigger event
    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(callback => callback(data));
        }
    }

    // Broadcast race start to all players
    broadcastStartRace() {
        console.log('[MULTIPLAYER] Broadcasting race start event');
        
        // Check if connected
        if (!this.socket || !this.socket.connected) {
            console.error('[MULTIPLAYER] Cannot broadcast race start - not connected');
            return;
        }
        
        // Check if in a room
        if (!this.roomId) {
            console.error('[MULTIPLAYER] Cannot broadcast race start - not in a room');
            return;
        }
        
        // Only allow room creator to start the race
        // If we're not tracking isRoomCreator correctly, allow anyway but log a warning
        if (!this.isRoomCreator) {
            console.warn('[MULTIPLAYER] Non-room creator attempting to start race, allowing anyway');
        }
        
        // Broadcast the start race event to all players in the room
        console.log('[MULTIPLAYER] Emitting start-race event for room:', this.roomId);
        this.socket.emit('start-race', { roomId: this.roomId, timestamp: Date.now() });
    }
} 