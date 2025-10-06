export class SignalingManager {
    constructor(io, roomManager) {
        this.io = io;
        this.roomManager = roomManager;
        this.setupSocketHandlers();
    }
    
    log(socketId, event, message, data = null) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [Socket: ${socketId}] [${event}] ${message}`;
        if (data) {
            console.log(logMessage, data);
        } else {
            console.log(logMessage);
        }
    }
    
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            this.log(socket.id, 'CONNECT', '🟢 New client connected');
            
            // Track if socket has already joined a room
            let hasJoinedRoom = false;
            
            // Handle explicit Socket.IO room joining
            socket.on('join', (roomId, callback) => {
                try {
                    socket.join(roomId);
                    this.log(socket.id, 'JOIN', `Socket joined room ${roomId}`);
                    callback();
                } catch (error) {
                    this.log(socket.id, 'ERROR', `Failed to join room ${roomId}: ${error.message}`);
                    callback(error);
                }
            });
            
            socket.on('join-room', async (data) => {
                try {
                    let { roomId, playerName } = data;
                    
                    // If roomId is undefined or null, use the master room
                    if (!roomId) {
                        roomId = this.roomManager.MASTER_ROOM_ID;
                    }
                    
                    // Check if player is already in the room
                    const existingRoomId = this.roomManager.playerRooms.get(socket.id);
                    if (existingRoomId === roomId) {
                        // If player is already in the room, just update the name if provided
                        if (playerName) {
                            const room = this.roomManager.rooms.get(roomId);
                            if (room && room.players.has(socket.id)) {
                                const player = room.players.get(socket.id);
                                player.name = playerName;
                                
                                socket.to(roomId).emit('peer-name-updated', {
                                    peerId: socket.id,
                                    playerName: playerName
                                });
                            }
                        }
                        return;
                    }
                    
                    this.log(socket.id, 'JOIN_ROOM', `Player "${playerName}" attempting to join room "${roomId}"`);
                    
                    // Use joinRoom instead of addPlayerToRoom to handle both data and Socket.IO aspects
                    const room = this.roomManager.joinRoom(socket, roomId, playerName);
                    this.log(socket.id, 'JOIN_ROOM', `Player joined room successfully`);
                    
                    // Notify others in the room
                    socket.to(roomId).emit('peer-joined', {
                        peerId: socket.id,
                        playerName: playerName
                    });
                    this.log(socket.id, 'JOIN_ROOM', `Other players notified about new peer`);
                    
                    // Get existing peers with their correct names
                    const peers = Array.from(room.players.entries())
                        .filter(([id, _]) => id !== socket.id)
                        .map(([id, player]) => ({
                            id: id,
                            name: player.name
                        }));
                        
                    // Send room info to the joining player
                    socket.emit('room-joined', {
                        roomId,
                        peers
                    });
                    this.log(socket.id, 'JOIN_ROOM', `Room info sent to new player with ${peers.length} existing peers`);
                    
                    // Mark that this socket has joined a room
                    hasJoinedRoom = true;
                    
                } catch (error) {
                    this.log(socket.id, 'ERROR', `Failed to join room: ${error.message}`);
                    socket.emit('error', { message: error.message });
                }
            });
            
            socket.on('disconnect', () => {
                this.log(socket.id, 'DISCONNECT', '🔴 Client disconnected');
                try {
                    // Find and remove player from their room
                    const roomId = this.roomManager.playerRooms.get(socket.id);
                    if (roomId) {
                        this.log(socket.id, 'DISCONNECT', `Removing player from room "${roomId}"`);
                    }
                    
                    this.roomManager.removePlayerFromCurrentRoom(socket.id);
                    
                    // Notify others in all rooms
                    this.io.emit('peer-left', { peerId: socket.id });
                    this.log(socket.id, 'DISCONNECT', 'Other players notified about peer departure');
                    
                } catch (error) {
                    this.log(socket.id, 'ERROR', `Error handling disconnect: ${error.message}`);
                }
            });
            
            // Handle game state updates
            socket.on('player-update', (data) => {
                try {
                    const { position, rotation, timestamp } = data;
                    
                    // Log position updates (1% of the time to avoid spam)
                    if (Math.random() < 0.01) {
                        this.log(socket.id, 'STATE', `Player position update`, {
                            position,
                            rotation,
                            timestamp
                        });
                    }
                    
                    // Update player's last activity
                    this.roomManager.updatePlayerActivity(socket.id);
                    
                    // Get player's room
                    const roomId = this.roomManager.playerRooms.get(socket.id);
                    if (!roomId) {
                        this.log(socket.id, 'WARNING', 'Player update received but player not in any room');
                        return;
                    }
                    
                    // Broadcast update to others in the room
                    socket.to(roomId).emit('peer-update', {
                        peerId: socket.id,
                        position,
                        rotation,
                        timestamp
                    });
                    
                } catch (error) {
                    this.log(socket.id, 'ERROR', `Error handling player update: ${error.message}`);
                }
            });

            // Handle banana throws
            socket.on('banana-thrown', (data) => {
                try {
                    const { position, rotation, velocity, throwerId, timestamp } = data;
                    
                    this.log(socket.id, 'BANANA', `Player threw banana`, {
                        position,
                        rotation,
                        velocity,
                        throwerId
                    });
                    
                    // Get player's room
                    const roomId = this.roomManager.playerRooms.get(socket.id);
                    if (!roomId) {
                        this.log(socket.id, 'WARNING', 'Banana throw received but player not in any room');
                        return;
                    }
                    
                    // Broadcast banana throw to others in the room
                    socket.to(roomId).emit('banana-thrown', {
                        position,
                        rotation,
                        velocity,
                        throwerId,
                        timestamp
                    });
                    
                } catch (error) {
                    this.log(socket.id, 'ERROR', `Error handling banana throw: ${error.message}`);
                }
            });

            socket.on('item-collected', (data) => {
                const roomId = this.roomManager.getRoomForPlayer(socket.id);
                if (!roomId) {
                    this.log(socket.id, 'ERROR', 'Player not in a room');
                    return;
                }

                const item = this.roomManager.collectItem(roomId, data.itemId, socket.id);
                if (!item) {
                    this.log(socket.id, 'ERROR', `Item ${data.itemId} not found or already collected`);
                    return;
                }

                this.log(socket.id, 'ITEMS', `Item ${data.itemId} collected successfully`);
            });
            
            // Handle client detection of overlapping items
            socket.on('item-overlap-detected', (data) => {
                const roomId = this.roomManager.getRoomForPlayer(socket.id);
                if (!roomId) {
                    this.log(socket.id, 'ERROR', 'Player not in a room when reporting item overlap');
                    return;
                }

                const { itemId } = data;
                this.log(socket.id, 'ITEMS', `Client reported overlapping item: ${itemId}`);
                
                // Remove the overlapping item from the server
                const removed = this.roomManager.removeOverlappingItem(roomId, itemId);
                if (removed) {
                    this.log(socket.id, 'ITEMS', `Removed overlapping item ${itemId} as requested by client`);
                } else {
                    this.log(socket.id, 'ERROR', `Failed to remove overlapping item ${itemId}`);
                }
            });

            // Handle banana collisions
            socket.on('banana-collision', (data) => {
                const roomId = this.roomManager.getRoomForPlayer(socket.id);
                if (!roomId) return;
                
                // Broadcast the collision to all other players in the room
                socket.to(roomId).emit('banana-collision', {
                    bananaPosition: data.bananaPosition,
                    collidedBy: socket.id
                });
            });

            // Handle shell throws
            socket.on('shell-thrown', (data) => {
                try {
                    const { position, rotation, velocity, throwerId, timestamp } = data;
                    
                    this.log(socket.id, 'SHELL', `Player threw shell`, {
                        position,
                        rotation,
                        velocity,
                        throwerId
                    });
                    
                    // Get player's room
                    const roomId = this.roomManager.playerRooms.get(socket.id);
                    if (!roomId) {
                        this.log(socket.id, 'WARNING', 'Shell throw received but player not in any room');
                        return;
                    }
                    
                    // Broadcast shell throw to others in the room
                    socket.to(roomId).emit('shell-thrown', {
                        position,
                        rotation,
                        velocity,
                        throwerId,
                        timestamp
                    });
                    
                } catch (error) {
                    this.log(socket.id, 'ERROR', `Error handling shell throw: ${error.message}`);
                }
            });

            // Handle shell collisions
            socket.on('shell-collision', (data) => {
                try {
                    const { position, hitCarId, throwerId, timestamp } = data;
                    
                    this.log(socket.id, 'SHELL', `Shell collision reported`, {
                        position,
                        hitCarId,
                        throwerId
                    });
                    
                    // Get player's room
                    const roomId = this.roomManager.playerRooms.get(socket.id);
                    if (!roomId) {
                        this.log(socket.id, 'WARNING', 'Shell collision received but player not in any room');
                        return;
                    }
                    
                    // Broadcast shell collision to others in the room
                    socket.to(roomId).emit('shell-collision', {
                        position,
                        hitCarId,
                        throwerId,
                        timestamp
                    });
                    
                } catch (error) {
                    this.log(socket.id, 'ERROR', `Error handling shell collision: ${error.message}`);
                }
            });

            // Add new handler for player name updates
            socket.on('player-name-update', (data) => {
                try {
                    const { playerName } = data;
                    const roomId = this.roomManager.playerRooms.get(socket.id);
                    if (!roomId) return;

                    const room = this.roomManager.rooms.get(roomId);
                    if (room && room.players.has(socket.id)) {
                        const player = room.players.get(socket.id);
                        player.name = playerName;
                        
                        // Notify other players
                        socket.to(roomId).emit('peer-name-updated', {
                            peerId: socket.id,
                            playerName: playerName
                        });
                    }
                } catch (error) {
                    this.log(socket.id, 'ERROR', `Error handling name update: ${error.message}`);
                }
            });

            // Inside the setupSocketHandlers method, add handler for AI car updates
            socket.on('ai-car-update', (data) => {
                try {
                    // Get player's room
                    const roomId = this.roomManager.playerRooms.get(socket.id);
                    if (!roomId) {
                        this.log(socket.id, 'WARNING', 'AI car update received but player not in any room');
                        return;
                    }
                    
                    // Add the controlling player ID to the data
                    data.controllingPlayer = socket.id;
                    
                    // Broadcast AI car position to others in the room
                    socket.to(roomId).emit('ai-car-update', data);
                    
                    // Log updates occasionally to avoid spam (only 0.1% of updates)
                    if (Math.random() < 0.001) {
                        this.log(socket.id, 'AI', `AI car ${data.aiName} position update`, {
                            position: data.position,
                            rotation: data.rotation
                        });
                    }
                } catch (error) {
                    this.log(socket.id, 'ERROR', `Error handling AI car update: ${error.message}`);
                }
            });
        });
    }
} 