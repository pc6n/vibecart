import { v4 as uuidv4 } from 'uuid';

export class AIPlayerManager {
    constructor(roomManager) {
        this.roomManager = roomManager;
        this.aiPlayers = new Map(); // Map of aiId -> AI player data
        this.updateInterval = 100; // ms between AI position updates
        this.aiNames = [
            'Speedy', 'Racer', 'Turbo', 'Bolt', 'Flash', 'Zoom', 'Dash',
            'Ace', 'Blitz', 'Max', 'Rocket', 'Thunder', 'Lightning',
            'Viper', 'Striker', 'Drift', 'Apex', 'Rush'
        ];
        this.updateIntervalId = null;
        this.trajectories = this.generateTrajectories();
        this.carTypes = ['classic', 'tesla', 'f1'];
        this.difficulties = ['easy', 'medium', 'hard'];
        
        console.log(`[${new Date().toISOString()}] AIPlayerManager initialized`);
    }
    
    // Start the update loop
    start() {
        if (this.updateIntervalId) return;
        
        this.updateIntervalId = setInterval(() => this.updateAllAI(), this.updateInterval);
        console.log(`[${new Date().toISOString()}] AI update loop started with interval ${this.updateInterval}ms`);
    }
    
    // Stop the update loop
    stop() {
        if (this.updateIntervalId) {
            clearInterval(this.updateIntervalId);
            this.updateIntervalId = null;
            console.log(`[${new Date().toISOString()}] AI update loop stopped`);
        }
    }
    
    // Generate predefined trajectories around the track
    generateTrajectories() {
        // Simple circular track trajectory
        const trackRadius = 20; // Same as server track radius
        const points = 24; // Number of points around the track
        
        const trajectories = [];
        
        // Generate 3 trajectories at different radii (inner, middle, outer lanes)
        const radiusOffsets = [-2, 0, 2]; // Relative to track radius
        
        radiusOffsets.forEach((offset, laneIndex) => {
            const trajectory = [];
            const radius = trackRadius + offset;
            
            for (let i = 0; i < points; i++) {
                const angle = (i / points) * Math.PI * 2;
                trajectory.push({
                    position: {
                        x: Math.cos(angle) * radius,
                        y: 1,
                        z: Math.sin(angle) * radius
                    },
                    rotation: angle + Math.PI / 2, // Tangent to circle
                    index: i
                });
            }
            
            trajectories.push({
                name: `lane${laneIndex + 1}`,
                points: trajectory
            });
        });
        
        console.log(`[${new Date().toISOString()}] Generated ${trajectories.length} AI trajectories`);
        return trajectories;
    }
    
    // Create a new AI player in the specified room
    createAIPlayer(roomId, options = {}) {
        if (!this.roomManager.rooms.has(roomId)) {
            console.error(`[${new Date().toISOString()}] Cannot create AI player: Room ${roomId} not found`);
            return null;
        }
        
        // Generate unique ID for AI player (prefix with 'ai-' to distinguish from human players)
        const aiId = `ai-${uuidv4()}`;
        
        // Determine trajectory (lane)
        const trajectoryIndex = options.trajectoryIndex || Math.floor(Math.random() * this.trajectories.length);
        const trajectory = this.trajectories[trajectoryIndex];
        
        // Determine starting position (random point on trajectory)
        const startPointIndex = options.startPointIndex || Math.floor(Math.random() * trajectory.points.length);
        const startPoint = trajectory.points[startPointIndex];
        
        // Generate name if not provided
        const name = options.name || this.getRandomAIName();
        
        // Determine car type
        const carType = options.carType || this.carTypes[Math.floor(Math.random() * this.carTypes.length)];
        
        // Determine difficulty
        const difficulty = options.difficulty || this.difficulties[Math.floor(Math.random() * this.difficulties.length)];
        
        // Create AI player object
        const aiPlayer = {
            id: aiId,
            name: name,
            isAI: true,
            room: roomId,
            carType: carType,
            difficulty: difficulty,
            trajectory: {
                name: trajectory.name,
                points: trajectory.points,
                currentIndex: startPointIndex,
                nextIndex: (startPointIndex + 1) % trajectory.points.length
            },
            position: { ...startPoint.position },
            rotation: startPoint.rotation,
            speed: 0,
            maxSpeed: this.getDifficultySpeed(difficulty),
            targetSpeed: 0,
            lastUpdate: Date.now(),
            created: Date.now(),
            color: this.getRandomColor(),
            lapCount: 0,
            items: []
        };
        
        // Store AI player
        this.aiPlayers.set(aiId, aiPlayer);
        
        // Register AI player with room manager
        this.roomManager.addAIPlayerToRoom(roomId, aiId, name);
        
        console.log(`[${new Date().toISOString()}] Created AI player "${name}" in room ${roomId} (ID: ${aiId})`);
        
        // If update loop isn't running, start it
        if (!this.updateIntervalId) {
            this.start();
        }
        
        return aiPlayer;
    }
    
    // Remove an AI player
    removeAIPlayer(aiId) {
        const aiPlayer = this.aiPlayers.get(aiId);
        if (!aiPlayer) {
            console.error(`[${new Date().toISOString()}] AI player ${aiId} not found for removal`);
            return false;
        }
        
        // Remove from room
        this.roomManager.removePlayerFromRoom(aiPlayer.room, aiId);
        
        // Remove from AI players map
        this.aiPlayers.delete(aiId);
        
        console.log(`[${new Date().toISOString()}] Removed AI player ${aiPlayer.name} (${aiId})`);
        
        // If no more AI players, stop the update loop
        if (this.aiPlayers.size === 0) {
            this.stop();
        }
        
        return true;
    }
    
    // Remove all AI players from a specific room
    removeAIPlayersFromRoom(roomId) {
        const aiPlayersToRemove = [];
        
        // Find all AI players in the room
        for (const [aiId, aiPlayer] of this.aiPlayers.entries()) {
            if (aiPlayer.room === roomId) {
                aiPlayersToRemove.push(aiId);
            }
        }
        
        // Remove each AI player
        for (const aiId of aiPlayersToRemove) {
            this.removeAIPlayer(aiId);
        }
        
        console.log(`[${new Date().toISOString()}] Removed ${aiPlayersToRemove.length} AI players from room ${roomId}`);
        return aiPlayersToRemove.length;
    }
    
    // Update all AI players
    updateAllAI() {
        const now = Date.now();
        
        for (const [aiId, aiPlayer] of this.aiPlayers.entries()) {
            this.updateAIPlayer(aiId, now);
        }
    }
    
    // Update a single AI player
    updateAIPlayer(aiId, now) {
        const aiPlayer = this.aiPlayers.get(aiId);
        if (!aiPlayer) return;
        
        const deltaTime = (now - aiPlayer.lastUpdate) / 1000; // in seconds
        aiPlayer.lastUpdate = now;
        
        // Get current and next trajectory points
        const currentPoint = aiPlayer.trajectory.points[aiPlayer.trajectory.currentIndex];
        const nextPoint = aiPlayer.trajectory.points[aiPlayer.trajectory.nextIndex];
        
        // Calculate direction to next point
        const direction = {
            x: nextPoint.position.x - aiPlayer.position.x,
            z: nextPoint.position.z - aiPlayer.position.z
        };
        
        // Calculate distance to next point
        const distance = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
        
        // Normalize direction
        const normalizedDirection = {
            x: direction.x / distance,
            z: direction.z / distance
        };
        
        // Set target speed based on difficulty and distance to next point
        // Slow down for sharper turns
        const dotProduct = normalizedDirection.x * Math.cos(aiPlayer.rotation) + 
                          normalizedDirection.z * Math.sin(aiPlayer.rotation);
        const turnSharpness = 1 - Math.abs(dotProduct);
        
        // Adjust speed based on turn sharpness
        aiPlayer.targetSpeed = aiPlayer.maxSpeed * (1 - turnSharpness * 0.7);
        
        // Accelerate or decelerate
        if (aiPlayer.speed < aiPlayer.targetSpeed) {
            aiPlayer.speed += 5 * deltaTime; // Accelerate
            if (aiPlayer.speed > aiPlayer.targetSpeed) {
                aiPlayer.speed = aiPlayer.targetSpeed;
            }
        } else if (aiPlayer.speed > aiPlayer.targetSpeed) {
            aiPlayer.speed -= 10 * deltaTime; // Decelerate (brake)
            if (aiPlayer.speed < aiPlayer.targetSpeed) {
                aiPlayer.speed = aiPlayer.targetSpeed;
            }
        }
        
        // Calculate new position based on speed and direction
        const moveDistance = aiPlayer.speed * deltaTime;
        
        // Move towards next point
        aiPlayer.position.x += normalizedDirection.x * moveDistance;
        aiPlayer.position.z += normalizedDirection.z * moveDistance;
        
        // Calculate new rotation (face direction of movement)
        aiPlayer.rotation = Math.atan2(normalizedDirection.z, normalizedDirection.x) + Math.PI / 2;
        
        // Check if we've reached the next point
        if (distance < 1) {
            // Move to next point
            aiPlayer.trajectory.currentIndex = aiPlayer.trajectory.nextIndex;
            aiPlayer.trajectory.nextIndex = (aiPlayer.trajectory.nextIndex + 1) % aiPlayer.trajectory.points.length;
            
            // Count laps
            if (aiPlayer.trajectory.currentIndex === 0) {
                aiPlayer.lapCount++;
                console.log(`[${new Date().toISOString()}] AI player ${aiPlayer.name} completed lap ${aiPlayer.lapCount}`);
            }
        }
        
        // Broadcast the AI player's position
        this.broadcastAIUpdate(aiPlayer);
        
        // Occasionally simulate item pickups
        this.simulateItemPickups(aiPlayer, now);
    }
    
    // Broadcast AI player update to all players in the room
    broadcastAIUpdate(aiPlayer) {
        if (!this.roomManager.io) return;
        
        this.roomManager.io.to(aiPlayer.room).emit('peer-update', {
            peerId: aiPlayer.id,
            position: aiPlayer.position,
            rotation: aiPlayer.rotation,
            timestamp: Date.now()
        });
    }
    
    // Simulate AI player picking up items
    simulateItemPickups(aiPlayer, now) {
        // Only attempt item pickup occasionally (random chance)
        if (Math.random() > 0.1) return;
        
        // Get items in the room
        const itemManager = this.roomManager.roomItemManagers.get(aiPlayer.room);
        if (!itemManager) return;
        
        const items = itemManager.getAllItems();
        
        // Check if any items are close to the AI
        for (const item of items) {
            const dx = item.position.x - aiPlayer.position.x;
            const dz = item.position.z - aiPlayer.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // If item is close enough, collect it
            if (distance < 2) {
                const collectedItem = itemManager.collectItem(item.id);
                if (collectedItem) {
                    // Add item to AI inventory
                    aiPlayer.items.push(collectedItem.type);
                    
                    // Broadcast item collection
                    this.roomManager.io.to(aiPlayer.room).emit('item-collected', {
                        itemId: item.id,
                        collectedBy: aiPlayer.id
                    });
                    
                    console.log(`[${new Date().toISOString()}] AI player ${aiPlayer.name} collected ${collectedItem.type}`);
                    
                    // Occasionally use the item
                    if (Math.random() > 0.5) {
                        setTimeout(() => this.useAIItem(aiPlayer), 1000 + Math.random() * 3000);
                    }
                    
                    break; // Only collect one item at a time
                }
            }
        }
    }
    
    // Simulate AI player using an item
    useAIItem(aiPlayer) {
        if (aiPlayer.items.length === 0) return;
        
        // Get the first item
        const itemType = aiPlayer.items.shift();
        
        if (itemType === 'banana') {
            // Simulate throwing banana
            this.roomManager.io.to(aiPlayer.room).emit('banana-thrown', {
                position: { ...aiPlayer.position },
                rotation: aiPlayer.rotation,
                velocity: { x: 0, y: 0, z: -10 }, // Throw backward
                throwerId: aiPlayer.id,
                timestamp: Date.now()
            });
            
            console.log(`[${new Date().toISOString()}] AI player ${aiPlayer.name} threw a banana`);
        } else if (itemType === 'speedBoost') {
            // Simulate speed boost (no broadcast needed, just increase speed)
            aiPlayer.maxSpeed *= 1.5;
            
            // Reset speed boost after a few seconds
            setTimeout(() => {
                aiPlayer.maxSpeed = this.getDifficultySpeed(aiPlayer.difficulty);
            }, 3000);
            
            console.log(`[${new Date().toISOString()}] AI player ${aiPlayer.name} used speed boost`);
        }
    }
    
    // Get a random unused AI name
    getRandomAIName() {
        // Get all used names
        const usedNames = Array.from(this.aiPlayers.values()).map(player => player.name);
        
        // Filter out used names
        const availableNames = this.aiNames.filter(name => !usedNames.includes(name));
        
        if (availableNames.length === 0) {
            // If all names are used, create a numbered name
            return `${this.aiPlayers.size + 1}`;
        }
        
        // Pick a random available name
        return availableNames[Math.floor(Math.random() * availableNames.length)];
    }
    
    // Get max speed based on difficulty
    getDifficultySpeed(difficulty) {
        switch(difficulty) {
            case 'easy': return 10;
            case 'medium': return 15;
            case 'hard': return 20;
            default: return 12;
        }
    }
    
    // Get a random color for AI car
    getRandomColor() {
        const colors = [
            '#FF5733', // Orange-red
            '#33FF57', // Green
            '#3357FF', // Blue
            '#F3FF33', // Yellow
            '#FF33F3', // Pink
            '#33FFF3', // Cyan
            '#8033FF'  // Purple
        ];
        
        return colors[Math.floor(Math.random() * colors.length)];
    }
} 