import { v4 as uuidv4 } from 'uuid';

export class ServerItemManager {
    constructor() {
        this.items = new Map(); // Map of itemId -> item data
        this.spawnInterval = 2000;
        this.maxItems = 20;
        this.lastSpawnTime = Date.now();
        this.io = null; // Store Socket.IO instance
        this.roomId = null; // Store room ID
        
        console.log(`[${new Date().toISOString()}] ServerItemManager initialized with maxItems=${this.maxItems}, spawnInterval=${this.spawnInterval}ms`);
        // Track spawn points (similar to client but simplified)
        this.spawnPoints = this.generateSpawnPoints();
        this.respawnIntervalAfterCollection = 100; // Almost immediate respawn after collection
        this.minDistanceBetweenItems = 2; // Minimum distance between items (squared internally)
    }

    generateSpawnPoints() {
        const points = [];
        const segments = 8;
        const trackRadius = 20; // Server track radius
        
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            // Create three spawn points at different radiuses for each angle
            const radiuses = [
                trackRadius - 2, // Inner lane
                trackRadius,     // Middle lane
                trackRadius + 2  // Outer lane
            ];
            
            radiuses.forEach(radius => {
                points.push({
                    position: {
                        x: Math.cos(angle) * radius,
                        y: 1,
                        z: Math.sin(angle) * radius
                    },
                    lastUsed: 0
                });
            });
        }
        
        console.log(`[ITEMS] Generated ${points.length} spawn points around track`);
        return points;
    }

    initialSpawn() {
        console.log('[ITEMS] Starting initial item spawn');
        this.spawnPoints = this.generateSpawnPoints();
        const initialItemCount = 10; // Number of items to start with

        for (let i = 0; i < initialItemCount; i++) {
            this.spawnRandomItem();
        }

        console.log(`[ITEMS] Initial spawn complete. Total items: ${this.items.size}`);
    }

    update() {
        // Only spawn new items if we're below maxItems (replacement logic)
        // We're handling immediate respawns with setTimeout in collectItem method
        // This method now focuses on maintaining the desired item count
        if (this.items.size < this.maxItems) {
            const now = Date.now();
            if (now - this.lastSpawnTime > this.spawnInterval) {
                const newItem = this.spawnRandomItem(false);
                this.lastSpawnTime = now;
                if (newItem) {
                    // Broadcast the new item to all clients in the room
                    if (this.io && this.roomId) {
                        console.log(`[${new Date().toISOString()}] [ITEMS] Broadcasting replacement item:`, {
                            id: newItem.id,
                            type: newItem.type,
                            position: newItem.position
                        });
                        this.io.to(this.roomId).emit('item-spawned', newItem);
                    }
                }
                return newItem;
            }
        }
        return null;
    }

    // Add method to set up Socket.IO integration
    setupSocketIO(io, roomId) {
        this.io = io;
        this.roomId = roomId;
        console.log(`[${new Date().toISOString()}] [ITEMS] Socket.IO setup for room ${roomId}`);
    }

    // Method to sync items with a specific client
    syncItemsWithClient(socket) {
        const items = this.getAllItems();
        console.log(`[${new Date().toISOString()}] [ITEMS] Syncing items with client ${socket.id}:`, {
            itemCount: items.length,
            items: items.map(item => ({
                id: item.id,
                type: item.type,
                position: item.position
            }))
        });
        socket.emit('items-sync', items);
    }

    // Method to broadcast new item to all clients in room
    broadcastNewItem(item) {
        if (this.io && this.roomId) {
            console.log(`[${new Date().toISOString()}] [ITEMS] Broadcasting new item:`, {
                id: item.id,
                type: item.type,
                position: item.position
            });
            this.io.to(this.roomId).emit('item-spawned', item);
        }
    }

    spawnRandomItem(isInitialSpawn = false) {
        // Find available spawn points
        const now = Date.now();
        const availablePoints = this.spawnPoints.filter(point => 
            isInitialSpawn ? point.lastUsed === 0 : (now - point.lastUsed > 15000)
        );

        if (availablePoints.length === 0) {
            console.log(`[${new Date().toISOString()}] [ITEMS] No available spawn points ${isInitialSpawn ? 'for initial spawn' : 'for replacement'}`);
            return null;
        }

        // Filter out points that already have items nearby
        const itemFreePoints = availablePoints.filter(point => {
            // Check if any existing item is too close to this spawn point
            return !Array.from(this.items.values()).some(item => {
                const dx = item.position.x - point.position.x;
                const dz = item.position.z - point.position.z;
                const distanceSquared = dx * dx + dz * dz;
                return distanceSquared < (this.minDistanceBetweenItems * this.minDistanceBetweenItems);
            });
        });

        if (itemFreePoints.length === 0) {
            console.log(`[${new Date().toISOString()}] [ITEMS] No spawn points without nearby items available`);
            return null;
        }

        // Choose random spawn point from item-free points
        const spawnPoint = itemFreePoints[Math.floor(Math.random() * itemFreePoints.length)];
        spawnPoint.lastUsed = now;

        // Create new item with a chance for each type
        const itemId = uuidv4();
        
        // Randomly select item type with weighted probabilities
        // - Speed boosts: 40%
        // - Bananas: 40% 
        // - Shells: 20% (rarer as they're more powerful)
        const randomValue = Math.random();
        let type;
        
        if (randomValue < 0.4) {
            type = 'speedBoost';
        } else if (randomValue < 0.8) {
            type = 'banana';
        } else {
            type = 'shell';
        }
        
        const item = {
            id: itemId,
            type: type,
            position: spawnPoint.position,
            createdAt: now
        };

        this.items.set(itemId, item);
        this.broadcastNewItem(item);
        
        console.log(`[${new Date().toISOString()}] [ITEMS] Spawned ${type} at position:`, spawnPoint.position);
        return item;
    }

    collectItem(itemId) {
        const item = this.items.get(itemId);
        if (item) {
            console.log(`[${new Date().toISOString()}] [ITEMS] Collecting item:`, {
                id: itemId,
                type: item.type
            });
            
            // Store item position to make sure we don't spawn at the same spot immediately
            const position = {...item.position};
            
            // Remove the item
            this.items.delete(itemId);
            
            // Reset the lastSpawnTime to trigger immediate replacement
            this.lastSpawnTime = 0;
            
            // Schedule a new item spawn with a slight delay to ensure proper client sync
            setTimeout(() => {
                if (this.items.size < this.maxItems) {
                    this.spawnRandomItem(false);
                }
            }, this.respawnIntervalAfterCollection);
            
            return item;
        }
        console.log(`[${new Date().toISOString()}] [ITEMS] Item not found for collection: ${itemId}`);
        return null;
    }

    getAllItems() {
        const items = Array.from(this.items.values());
        console.log(`[${new Date().toISOString()}] [ITEMS] Getting all items:`, {
            count: items.length,
            items: items.map(item => ({
                id: item.id,
                type: item.type,
                position: item.position
            }))
        });
        return items;
    }
}