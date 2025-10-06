import { v4 as uuidv4 } from 'uuid';
import { ServerItemManager } from './ItemManager.js';

export class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();
        this.playerRooms = new Map(); // Track which room each player is in
        this.maxPlayersPerRoom = 8;
        this.roomCleanupInterval = 1000 * 60 * 60; // 1 hour
        this.MASTER_ROOM_ID = 'public-master';
        
        // Create item managers for each room
        this.roomItemManagers = new Map();
        
        // Start room cleanup interval
        setInterval(() => this.cleanupInactiveRooms(), this.roomCleanupInterval);
        
        // Start item update interval
        setInterval(() => this.updateItems(), 1000);
        
        // Create master room in constructor
        this.createMasterRoom();
        console.log(`[${new Date().toISOString()}] RoomManager initialized with io:`, !!this.io);
    }
    
    createMasterRoom() {
        try {
            if (!this.rooms.has(this.MASTER_ROOM_ID)) {
                const room = {
                    id: this.MASTER_ROOM_ID,
                    players: new Map(),
                    created: Date.now(),
                    lastActivity: Date.now(),
                    isPublic: true,
                    isMasterRoom: true
                };
                this.rooms.set(this.MASTER_ROOM_ID, room);
                
                // Create item manager for master room
                const itemManager = new ServerItemManager();
                this.roomItemManagers.set(this.MASTER_ROOM_ID, itemManager);
                
                // Initialize items in the master room
                itemManager.initialSpawn();
                
                console.log(`[${new Date().toISOString()}] Master room created with ItemManager and initial items`);
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Failed to create master room:`, error);
        }
    }
    
    createRoom(roomId = null, creatorName = null) {
        roomId = roomId || `room-${uuidv4()}`;
        
        if (this.rooms.has(roomId)) {
            throw new Error('Room already exists');
        }
        
        const room = {
            id: roomId,
            players: new Map(),
            created: Date.now(),
            lastActivity: Date.now(),
            isPublic: roomId.startsWith('public-')
        };
        
        // Store the room first
        this.rooms.set(roomId, room);
        
        // Create item manager for the room and spawn initial items
        const itemManager = new ServerItemManager();
        itemManager.initialSpawn();
        this.roomItemManagers.set(roomId, itemManager);
        
        // Then add the creator if provided
        let creator = null;
        if (creatorName) {
            const playerId = uuidv4();
            creator = this.addPlayerToRoom(roomId, playerId, creatorName);
        }
        
        const roomInfo = this.getRoomInfo(room);
        return roomInfo;
    }
    
    getRoom(roomId) {
        try {
            if (!roomId) {
                console.log(`[${new Date().toISOString()}] Attempted to get room with null/undefined roomId`);
                // If master room ID is requested but doesn't exist, try to create it
                if (roomId === this.MASTER_ROOM_ID) {
                    this.createMasterRoom();
                } else {
                    throw new Error('Invalid roomId: null or undefined');
                }
            }
            
            const room = this.rooms.get(roomId);
            if (!room) {
                console.log(`[${new Date().toISOString()}] Room not found: ${roomId}`);
                
                // If master room is requested but doesn't exist, create it
                if (roomId === this.MASTER_ROOM_ID) {
                    console.log(`[${new Date().toISOString()}] Creating missing master room`);
                    this.createMasterRoom();
                    return this.getRoomInfo(this.rooms.get(this.MASTER_ROOM_ID));
                }
                
                throw new Error(`Room not found: ${roomId}`);
            }
            
            return this.getRoomInfo(room);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error in getRoom:`, error);
            
            // For master room, create it if there's an error
            if (roomId === this.MASTER_ROOM_ID) {
                console.log(`[${new Date().toISOString()}] Creating master room after error`);
                this.createMasterRoom();
                return this.getRoomInfo(this.rooms.get(this.MASTER_ROOM_ID));
            }
            
            throw error;
        }
    }
    
    addPlayerToRoom(roomId, playerId, playerName) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }
        
        if (room.players.size >= this.maxPlayersPerRoom) {
            throw new Error('Room is full');
        }
        
        // Remove player from any other room first
        this.removePlayerFromCurrentRoom(playerId);
        
        const player = {
            id: playerId,
            name: playerName,
            joined: Date.now(),
            lastActivity: Date.now()
        };
        
        room.players.set(playerId, player);
        this.playerRooms.set(playerId, roomId);
        room.lastActivity = Date.now();
        
        return player;
    }
    
    removePlayerFromRoom(roomId, playerId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        
        room.players.delete(playerId);
        this.playerRooms.delete(playerId);
        room.lastActivity = Date.now();
        
        // Clean up empty rooms, but never delete the master room
        if (room.players.size === 0 && !room.isMasterRoom) {
            this.rooms.delete(roomId);
            this.roomItemManagers.delete(roomId);
        }
        
        // If we deleted the master room by accident, recreate it
        if (roomId === this.MASTER_ROOM_ID && !this.rooms.has(this.MASTER_ROOM_ID)) {
            this.createMasterRoom();
        }
    }
    
    removePlayerFromCurrentRoom(playerId) {
        const currentRoomId = this.playerRooms.get(playerId);
        if (currentRoomId) {
            this.removePlayerFromRoom(currentRoomId, playerId);
        }
    }
    
    updatePlayerActivity(playerId) {
        const roomId = this.playerRooms.get(playerId);
        if (!roomId) return;
        
        const room = this.rooms.get(roomId);
        if (!room) return;
        
        const player = room.players.get(playerId);
        if (!player) return;
        
        player.lastActivity = Date.now();
        room.lastActivity = Date.now();
    }
    
    getPublicRooms() {
        return Array.from(this.rooms.values())
            .filter(room => room.isPublic)
            .map(room => this.getRoomInfo(room));
    }
    
    getRoomInfo(room) {
        try {
            // Safety check for null/undefined room
            if (!room) {
                console.error(`[${new Date().toISOString()}] Attempted to get info for null/undefined room`);
                return {
                    id: 'unknown',
                    players: [],
                    created: Date.now(),
                    lastActivity: Date.now(),
                    isPublic: false,
                    isMasterRoom: false,
                    error: 'Invalid room object'
                };
            }
            
            // Safety check for players property
            if (!room.players || typeof room.players.values !== 'function') {
                console.error(`[${new Date().toISOString()}] Room has invalid players property:`, room.id);
                return {
                    id: room.id || 'unknown',
                    players: [],
                    created: room.created || Date.now(),
                    lastActivity: room.lastActivity || Date.now(),
                    isPublic: room.isPublic || false,
                    isMasterRoom: room.isMasterRoom || false,
                    error: 'Invalid players property'
                };
            }
            
            // Get player info safely
            let playerInfo = [];
            try {
                playerInfo = Array.from(room.players.values()).map(player => ({
                    id: player.id,
                    name: player.name,
                    joined: player.joined
                }));
            } catch (playerError) {
                console.error(`[${new Date().toISOString()}] Error processing players:`, playerError);
                playerInfo = [];
            }
            
            return {
                id: room.id,
                players: playerInfo,
                created: room.created,
                lastActivity: room.lastActivity,
                isPublic: room.isPublic,
                isMasterRoom: room.isMasterRoom || false
            };
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error in getRoomInfo:`, error);
            return {
                id: room?.id || 'error',
                players: [],
                created: Date.now(),
                lastActivity: Date.now(),
                isPublic: false,
                isMasterRoom: false,
                error: error.message
            };
        }
    }
    
    cleanupInactiveRooms() {
        const now = Date.now();
        const inactivityThreshold = 1000 * 60 * 30; // 30 minutes
        
        for (const [roomId, room] of this.rooms.entries()) {
            // Skip master room cleanup
            if (room.isMasterRoom) {
                continue;
            }
            
            if (now - room.lastActivity > inactivityThreshold) {
                // Remove all players from the room
                room.players.forEach((_, playerId) => {
                    this.removePlayerFromRoom(roomId, playerId);
                });
                // Room will be automatically deleted when empty
            }
        }
    }

    updateItems() {
        for (const [roomId, itemManager] of this.roomItemManagers) {
            const room = this.rooms.get(roomId);
            if (!room || room.players.size === 0) continue;

            const newItem = itemManager.update();
            if (newItem) {
                console.log(`[${new Date().toISOString()}] [ITEMS] Spawning new item in room ${roomId}:`, newItem);
                this.broadcastToRoom(roomId, 'item-spawned', newItem);
            }
        }
    }

    joinRoom(socket, roomId = this.MASTER_ROOM_ID, playerName) {
        console.log(`[${new Date().toISOString()}] [ROOM] Player ${socket.id} joining room ${roomId}`);
        
        // Get the room or create it if it doesn't exist
        let room = this.rooms.get(roomId);
        if (!room) {
            try {
                // Create a new room with proper initialization
                room = {
                    id: roomId,
                    players: new Map(),
                    created: Date.now(),
                    lastActivity: Date.now(),
                    isPublic: roomId.startsWith('public-')
                };
                this.rooms.set(roomId, room);
                
                // Create item manager for the room and spawn initial items
                const itemManager = new ServerItemManager();
                itemManager.initialSpawn();
                this.roomItemManagers.set(roomId, itemManager);
                
                console.log(`[${new Date().toISOString()}] [ROOM] Created new room ${roomId}`);
            } catch (error) {
                console.error(`[${new Date().toISOString()}] [ROOM] Error creating room:`, error);
                throw new Error(`Failed to create room: ${error.message}`);
            }
        }
        
        // Ensure players is a Map (defensive programming)
        if (!room.players || !(room.players instanceof Map)) {
            console.log(`[${new Date().toISOString()}] [ROOM] Fixing players Map for room ${roomId}`);
            room.players = new Map();
        }
        
        // Check if player already exists in the room
        if (room.players.has(socket.id)) {
            const existingPlayer = room.players.get(socket.id);
            if (playerName) {
                existingPlayer.name = playerName;
                existingPlayer.lastActivity = Date.now();
            }
            return room;
        }
        
        // Create new player only if they don't exist
        const player = {
            id: socket.id,
            name: playerName || 'New Player',
            joined: Date.now(),
            lastActivity: Date.now()
        };
        
        room.players.set(socket.id, player);
        this.playerRooms.set(socket.id, roomId);
        room.lastActivity = Date.now();
        
        console.log(`[${new Date().toISOString()}] [ROOM] Room ${roomId} now has ${room.players.size} players`);

        // Send current items to the joining player
        const itemManager = this.roomItemManagers.get(roomId);
        if (itemManager) {
            const currentItems = itemManager.getAllItems();
            socket.emit('items-sync', currentItems);
        }

        return room;
    }

    leaveRoom(socketId) {
        const roomId = this.playerRooms.get(socketId);
        if (roomId) {
            const room = this.rooms.get(roomId);
            if (room) {
                room.players.delete(socketId);
                if (room.players.size === 0 && roomId !== this.MASTER_ROOM_ID) {
                    this.rooms.delete(roomId);
                    this.roomItemManagers.delete(roomId);
                }
            }
            this.playerRooms.delete(socketId);
        }
    }

    collectItem(roomId, itemId, socketId) {
        console.log("collect-item")
        const itemManager = this.roomItemManagers.get(roomId);
        if (!itemManager) return null;

        const item = itemManager.collectItem(itemId);
        if (item) {
            // Broadcast item collection to all players in the room
            this.broadcastToRoom(roomId, 'item-collected', { itemId, collectedBy: socketId });
        }
        return item;
    }

    removeOverlappingItem(roomId, itemId) {
        const itemManager = this.roomItemManagers.get(roomId);
        if (!itemManager) return false;
        
        // Check if the item exists
        if (!itemManager.items.has(itemId)) {
            console.log(`[${new Date().toISOString()}] [ITEMS] Item ${itemId} not found for overlap removal`);
            return false;
        }
        
        // Remove the item from the item manager
        itemManager.items.delete(itemId);
        console.log(`[${new Date().toISOString()}] [ITEMS] Removed overlapping item ${itemId}`);
        
        // Broadcast to all clients that this item has been removed
        this.broadcastToRoom(roomId, 'item-collected', { itemId, collectedBy: 'server-overlap' });
        
        // Schedule a new item spawn if needed
        setTimeout(() => {
            if (itemManager.items.size < itemManager.maxItems) {
                const newItem = itemManager.spawnRandomItem(false);
                if (newItem && itemManager.io) {
                    itemManager.io.to(roomId).emit('item-spawned', newItem);
                }
            }
        }, 500);
        
        return true;
    }

    broadcastToRoom(roomId, event, data) {
        if (!this.io) {
            console.error(`[${new Date().toISOString()}] [BROADCAST] Cannot broadcast - io not initialized`);
            return;
        }
        
        const room = this.rooms.get(roomId);
        if (!room) {
            console.error(`[${new Date().toISOString()}] [BROADCAST] Cannot broadcast - room ${roomId} not found`);
            return;
        }
        
        console.log(`[${new Date().toISOString()}] [BROADCAST] Broadcasting ${event} to room ${roomId}:`, data);
        this.io.to(roomId).emit(event, data);
    }

    getRoomForPlayer(playerId) {
        const roomId = this.playerRooms.get(playerId);
        console.log(`[${new Date().toISOString()}] [ROOM] Getting room for player ${playerId}:`, roomId);
        return roomId;
    }

    updatePlayerName(roomId, playerId, newName) {
        const room = this.rooms.get(roomId);
        if (!room) return false;

        const player = room.players.get(playerId);
        if (!player) return false;

        player.name = newName;
        player.lastActivity = Date.now();
        room.lastActivity = Date.now();
        
        return true;
    }
} 