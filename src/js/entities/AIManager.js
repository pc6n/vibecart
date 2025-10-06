import * as THREE from 'three';
import { AICar } from './AICar.js';

export class AIManager {
    constructor(game) {
        this.game = game;
        this.aiCars = [];
        this.aiNames = [
            'Speedy', 'Racer', 'Turbo', 'Bolt', 'Flash', 'Zoom', 'Dash',
            'Ace', 'Blitz', 'Max', 'Rocket', 'Thunder', 'Lightning',
            'Viper', 'Striker', 'Drift King', 'Apex', 'Rush'
        ];
        this.maxAICars = 5;
        this.isEnabled = false;
        this.isMultiplayer = false;
        
        // Timer for periodic AI car updates
        this.updateInterval = null;
        
        // Debug settings
        this.showDebugVisuals = false;
        this.waypointMarkers = [];
        
        console.log('[AI] AIManager initialized');
    }
    
    // Method to handle track changes
    onTrackChanged(newTrack) {
        console.log('[AI] Track changed, resetting AI cars');
        
        // Remove all existing AI cars
        this.removeAllAICars();
        
        // If AI is enabled, respawn cars for the new track
        if (this.isEnabled) {
            // Get current desired count from UI
            const aiCountSlider = document.getElementById('ai-count');
            const count = aiCountSlider ? parseInt(aiCountSlider.value) : 3;
            
            // Recreate AI cars for new track
            setTimeout(() => {
                this.spawnRandomAICars(count);
                console.log(`[AI] Spawned ${count} AI cars for new track`);
            }, 1000); // Small delay to ensure track is fully loaded
        }
    }
    
    // Method to set multiplayer mode
    setMultiplayerMode(isMultiplayer) {
        this.isMultiplayer = isMultiplayer;
        
        // If AI is force-disabled for a private room, don't change any settings
        if (this._forceDisabled || this._isPrivateRoom) {
            console.log('[AI] AI manager is force-disabled for private room - ignoring setMultiplayerMode call');
            // Make sure maxAICars stays at 0
            this.maxAICars = 0;
            // Make sure all AI cars are removed
            this.removeAllAICars();
            return;
        }
        
        // Adjust AI parameters for multiplayer
        if (isMultiplayer) {
            // Store the previous max cars value
            const previousMaxCars = this.maxAICars;
            
            // Check if we're in a private room by checking the room ID
            let isPrivateRoom = this.maxAICars === 0;
            
            // Double-check the room ID if available
            if (this.game && this.game.multiplayer && this.game.multiplayer.roomId) {
                if (this.game.multiplayer.roomId.startsWith('private-')) {
                    isPrivateRoom = true;
                    console.log('[AI] Private room detected by ID in setMultiplayerMode, disabling AI cars');
                    this.disableForPrivateRoom();
                    return;
                }
            }
            
            if (!isPrivateRoom) {
                // Limit max cars in standard multiplayer to reduce network load
                this.maxAICars = 3;
                console.log('[AI] Set to multiplayer mode with max 3 AI cars');
            } else {
                console.log('[AI] Private room detected in AIManager, keeping maxAICars at 0');
            }
            
            // Set all AI cars to local-only mode for performance
            this.setLocalOnlyMode(true);
            console.log('[AI] AI cars set to local-only mode for performance improvement');
            
            // If we have more AI cars than the new max, remove excess cars
            if (this.aiCars.length > this.maxAICars) {
                console.log(`[AI] Removing excess AI cars (${this.aiCars.length} -> ${this.maxAICars})`);
                
                // Sort cars by difficulty - keep harder ones for more challenge
                const sortedCars = [...this.aiCars].sort((a, b) => {
                    const difficultyOrder = { 'easy': 0, 'medium': 1, 'hard': 2 };
                    return difficultyOrder[b.difficulty] - difficultyOrder[a.difficulty];
                });
                
                // Keep the top 'maxAICars' cars, remove the rest
                const carsToKeep = sortedCars.slice(0, this.maxAICars);
                const carsToRemove = sortedCars.slice(this.maxAICars);
                
                // Remove excess cars
                for (const car of carsToRemove) {
                    this.removeAICar(car);
                }
                
                console.log(`[AI] Kept ${carsToKeep.length} AI cars, removed ${carsToRemove.length}`);
            } 
            // If we have no AI cars yet in multiplayer AND it's not a private room, spawn some
            else if (this.aiCars.length === 0 && this.maxAICars > 0) {
                console.log('[AI] No AI cars found in multiplayer, spawning default amount');
                this.spawnRandomAICars(Math.min(2, this.maxAICars));
                
                // Set the newly spawned cars to local-only mode
                this.setLocalOnlyMode(true);
            }
            
            // Update user counter with new AI car count
            if (window.userCounter) {
                window.userCounter.updateAICars(this.aiCars.length);
            }
        } else {
            // Reset to normal in single-player
            this.maxAICars = 5;
            console.log('[AI] Set to single-player mode with max 5 AI cars');
            
            // Disable local-only mode for single player
            this.setLocalOnlyMode(false);
        }
    }
    
    // Set all AI cars to local-only mode (not shared over the network)
    setLocalOnlyMode(isLocalOnly) {
        for (const aiCar of this.aiCars) {
            aiCar.isLocalOnly = isLocalOnly;
            
            // If car is local-only, also ensure it doesn't broadcast
            if (isLocalOnly) {
                // Define a dummy broadcastPosition method that does nothing
                aiCar.originalBroadcastPosition = aiCar.broadcastPosition;
                aiCar.broadcastPosition = function() {
                    // Do nothing - prevents network traffic
                    return;
                };
            } else {
                // Restore original broadcast method if it exists
                if (aiCar.originalBroadcastPosition) {
                    aiCar.broadcastPosition = aiCar.originalBroadcastPosition;
                    delete aiCar.originalBroadcastPosition;
                }
            }
        }
        
        console.log(`[AI] Set ${this.aiCars.length} AI cars to ${isLocalOnly ? 'local-only' : 'networked'} mode`);
    }
    
    enable() {
        this.isEnabled = true;
        
        // Start update loop
        if (!this.updateInterval) {
            this.updateInterval = setInterval(() => this.updateAICars(), 500);
        }
        
        console.log('[AI] AIManager enabled');
    }
    
    disable() {
        this.isEnabled = false;
        
        // Clear update interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // Remove all AI cars
        this.removeAllAICars();
        
        console.log('[AI] AIManager disabled');
    }
    
    updateAICars() {
        if (!this.isEnabled) return;
        
        // This is called periodically to manage AI cars
        // Check if any AI cars have fallen off the track or are stuck
        this.checkForStuckAICars();
        
        // Item pickup simulation
        this.simulateItemPickups();
    }
    
    addAICar(options = {}) {
        if (!this.game || !this.game.scene || !this.game.track) {
            console.error('[AI] Cannot add AI car: game, scene or track is missing');
            return null;
        }
        
        if (this.aiCars.length >= this.maxAICars) {
            console.warn('[AI] Maximum number of AI cars reached');
            return null;
        }
        
        // Set default options
        const defaultOptions = {
            scene: this.game.scene,
            track: this.game.track,
            game: this.game,  // Add game reference for multiplayer
            aiName: this.getRandomAIName(),
            playerName: null, // Default to null, will be set from aiName if not provided
            difficulty: 'medium',
            carType: this.getRandomCarType(),
            canUseItems: true,
            canThrowBananas: !this.isMultiplayer,  // Disable banana throwing in multiplayer
            aggressiveness: 0.5 + Math.random() * 0.5,  // 0.5 to 1.0
            positionOffset: { x: 0, z: -10 },  // Default offset behind start line
            color: 0xFF0000,  // Default to red if no color specified
            stayOnTrack: true  // Enable track boundary handling
        };
        
        // Merge options
        const aiOptions = { ...defaultOptions, ...options };
        
        // Ensure playerName is set from aiName if not provided
        if (!aiOptions.playerName && aiOptions.aiName) {
            aiOptions.playerName = aiOptions.aiName;
        }
        
        console.log(`[AI] Creating AI car with name: ${aiOptions.playerName}`);
        
        // Create the AI car
        const aiCar = new AICar(aiOptions);
        aiCar.isAI = true; // Mark as AI car
        aiCar.isActive = true; // Explicitly mark as active to ensure it moves
        
        // If in multiplayer mode, set car to local-only mode
        if (this.isMultiplayer) {
            aiCar.isLocalOnly = true;
            
            // Replace broadcastPosition with a dummy function that does nothing
            aiCar.originalBroadcastPosition = aiCar.broadcastPosition;
            aiCar.broadcastPosition = function() {
                // Do nothing - prevents network traffic
                return;
            };
            
            console.log(`[AI] AI car ${aiCar.playerName} set to local-only mode for performance`);
        }
        
        // Configure the AI car with improved settings
        this.configureAICar(aiCar);
        
        // Generate a unique ID for this AI car
        aiCar.id = 'ai-' + Math.random().toString(36).substr(2, 9);
        
        // Position the car at an offset from the start position
        const startPos = this.game.track.getStartPosition();
        if (startPos) {
            // Use the position offset from options
            const offset = new THREE.Vector3(
                aiOptions.positionOffset.x,
                0,
                aiOptions.positionOffset.z
            );
            
            // Rotate offset based on start rotation
            const rotation = startPos.rotation;
            const rotatedX = offset.x * Math.cos(rotation) - offset.z * Math.sin(rotation);
            const rotatedZ = offset.x * Math.sin(rotation) + offset.z * Math.cos(rotation);
            
            // Apply rotated offset to start position
            aiCar.position.set(
                startPos.position.x + rotatedX,
                startPos.position.y,
                startPos.position.z + rotatedZ
            );
            
            // Set rotation to match start
            aiCar.rotation = startPos.rotation;
            
            console.log(`[AI] Positioned car at offset (${offset.x.toFixed(1)}, ${offset.z.toFixed(1)}) from start`);
        }
        
        // Set car color
        aiCar.setCarColor(aiOptions.color);
        
        // Initialize the car
        aiCar.init().then(() => {
            console.log(`[AI] AI car ${aiCar.playerName} initialized with color #${aiOptions.color.toString(16)}`);
            
            // Add to scene if needed
            if (aiCar.mesh && !this.game.scene.getObjectById(aiCar.mesh.id)) {
                // Set userData properties for identification
                aiCar.mesh.userData.isAICar = true;
                aiCar.mesh.userData.aiId = aiCar.id;
                aiCar.mesh.userData.playerName = aiCar.playerName;
                aiCar.mesh.userData.carType = aiCar.carType;
                
                // Add the mesh to the scene
                this.game.scene.add(aiCar.mesh);
                console.log(`[AI] Added AI car mesh to scene: ${aiCar.playerName}`);
            }
            
            // Ensure the name tag is positioned correctly
            if (aiCar.nameTag) {
                aiCar.nameTag.position.set(0, 3, 0);
                // Make sure the name tag always faces the camera
                const updateNameTag = () => {
                    if (aiCar.nameTag && this.game.camera) {
                        aiCar.nameTag.lookAt(this.game.camera.position);
                    }
                };
                // Add to update loop
                aiCar.updateCallbacks = aiCar.updateCallbacks || [];
                aiCar.updateCallbacks.push(updateNameTag);
            }
            
            // Double check that car is active to ensure it moves
            aiCar.isActive = true;
            
            // Notify user
            if (this.game.showNotification) {
                this.game.showNotification(`${aiCar.playerName} joined the race! 🤖`);
            }
        }).catch(error => {
            console.error(`[AI] Error initializing AI car ${aiCar.playerName}:`, error);
            // Still ensure car is active even if there was an error
            aiCar.isActive = true;
        });
        
        // Add a safety timeout to ensure the car starts moving even if the init promise hasn't resolved
        setTimeout(() => {
            if (!aiCar.isActive) {
                console.log(`[AI] Forcing activation for ${aiCar.playerName} that might be stuck`);
                aiCar.isActive = true;
            }
            
            // Give car an initial speed to get it moving
            if (aiCar.speed === 0) {
                aiCar.speed = 5;
                console.log(`[AI] Giving initial speed to ${aiCar.playerName}`);
            }
        }, 2000);
        
        // Add to AI cars array
        this.aiCars.push(aiCar);
        
        console.log(`[AI] Added AI car: ${aiCar.playerName} (${aiCar.difficulty})`);
        
        // Update user counter with new AI car count
        if (window.userCounter) {
            window.userCounter.updateAICars(this.aiCars.length);
        }
        
        return aiCar;
    }
    
    removeAICar(aiCar) {
        if (!aiCar) return;
        
        console.log(`[AI] Removing AI car: ${aiCar.playerName}`);
        
        // Mark as inactive first to prevent updates during cleanup
        aiCar.isActive = false;
        
        // Remove from scene
        if (aiCar.mesh && this.game.scene) {
            this.game.scene.remove(aiCar.mesh);
            
            // Properly dispose of geometries and materials
            if (aiCar.mesh.traverse) {
                aiCar.mesh.traverse((object) => {
                    if (object.geometry) {
                        object.geometry.dispose();
                    }
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(material => material.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                });
            }
        }
        
        // Remove from aiCars array
        const index = this.aiCars.indexOf(aiCar);
        if (index !== -1) {
            this.aiCars.splice(index, 1);
        }
        
        // Update user counter with new AI car count
        if (window.userCounter) {
            window.userCounter.updateAICars(this.aiCars.length);
        }
    }
    
    removeAllAICars() {
        // Make a copy of array since we're modifying it during iteration
        const carsToRemove = [...this.aiCars];
        
        for (const car of carsToRemove) {
            this.removeAICar(car);
        }
        
        this.aiCars = [];
        console.log('[AI] All AI cars removed');
        
        // Update user counter to show zero AI cars
        if (window.userCounter) {
            window.userCounter.updateAICars(0);
        }
    }
    
    spawnRandomAICars(count = 1) {
        // Don't spawn any cars if we're in a private room
        if (this._isPrivateRoom || this._forceDisabled || this.maxAICars === 0) {
            console.log('[AI] Not spawning AI cars - private room mode is active or forced disable is on');
            return;
        }
        
        // Additional safety check - if this is called from a private multiplayer room, block it
        if (this.isMultiplayer && this.game && this.game.multiplayer && 
            this.game.multiplayer.roomId && this.game.multiplayer.roomId.startsWith('private-')) {
            console.log('[AI] Blocking AI car spawn in private room:', this.game.multiplayer.roomId);
            return;
        }
        
        const difficulty = ['easy', 'medium', 'hard'];
        const carTypes = ['classic', 'tesla'];
        
        // Clear any existing AI cars if we're starting fresh
        if (this.aiCars.length === 0) {
            console.log('[AI] Starting fresh with new AI cars');
        } else {
            console.log(`[AI] Adding ${count} additional AI cars to existing ${this.aiCars.length}`);
        }

        // Calculate positions with more spread behind the starting line
        const startPos = this.game.track.getStartPosition();
        
        // Create a set of distinctive colors for AI cars
        const aiColors = [
            0xFF0000, // Red
            0x00FF00, // Green
            0x0000FF, // Blue
            0xFFFF00, // Yellow
            0xFF00FF, // Magenta
            0x00FFFF, // Cyan
            0xFFA500, // Orange
            0x800080  // Purple
        ];
        
        for (let i = 0; i < count; i++) {
            // Ensure we don't exceed the maximum
            if (this.aiCars.length >= this.maxAICars) {
                console.log(`[AI] Maximum AI cars (${this.maxAICars}) reached, stopping spawn`);
                break;
            }
            
            // Pick random difficulty and car type
            const randomDifficulty = difficulty[Math.floor(Math.random() * difficulty.length)];
            const randomCarType = carTypes[Math.floor(Math.random() * carTypes.length)];
            
            // Calculate position offset based on index
            // Create a grid-like pattern behind the starting line
            const row = Math.floor(i / 2);  // 2 cars per row
            const col = i % 2;              // 0 or 1 for columns
            
            const offsetX = (col * 6) - 3;  // -3 or +3 from center
            const offsetZ = (row * -8) - 10; // -10, -18, -26, etc. (behind starting line)
            
            // Pick a color from our distinctive color set
            const colorIndex = (this.aiCars.length + i) % aiColors.length;
            const color = aiColors[colorIndex];
            
            // Get a unique AI name for this car
            const aiName = this.getRandomAIName();
            
            this.addAICar({
                difficulty: randomDifficulty,
                carType: randomCarType,
                positionOffset: { x: offsetX, z: offsetZ },
                color: color,
                playerName: aiName,  // Pass AI name directly as playerName
                aiName: aiName       // Keep aiName as a backup
            });
        }
        
        console.log(`[AI] Spawned ${Math.min(count, this.maxAICars - this.aiCars.length + count)} new AI cars, total: ${this.aiCars.length}`);
    }
    
    getRandomAIName() {
        const usedNames = this.aiCars.map(car => car.playerName);
        
        // Filter out names already in use
        const availableNames = this.aiNames.filter(name => !usedNames.includes(name));
        
        if (availableNames.length === 0) {
            // If all names are used, generate a numbered name
            return `${this.aiCars.length + 1}`;
        }
        
        // Pick a random available name
        return availableNames[Math.floor(Math.random() * availableNames.length)];
    }
    
    getRandomCarType() {
        const carTypes = ['classic', 'tesla', 'f1'];
        return carTypes[Math.floor(Math.random() * carTypes.length)];
    }
    
    checkForStuckAICars() {
        if (!this.isEnabled || !this.game || !this.game.track) return;
        
        // Only check one AI car every frame to distribute processing
        if (!this._stuckCheckIndex) this._stuckCheckIndex = 0;
        
        // Get current car to check
        const aiCar = this.aiCars[this._stuckCheckIndex];
        
        // Move to next car for next check
        this._stuckCheckIndex = (this._stuckCheckIndex + 1) % this.aiCars.length;
        
        // Skip if car doesn't exist or is inactive
        if (!aiCar || !aiCar.mesh || !aiCar.isActive) return;
        
        // First check if car is severely off-track (optimization: most expensive check last)
        const isStuck = this.checkIfStuck(aiCar);
        
        if (isStuck) {
            const isOffTrack = this.checkOffTrack(aiCar);
            
            // Only reset if both stuck AND off-track to minimize disruption
            if (isOffTrack) {
                this.resetAICarPosition(aiCar);
            } else {
                // If just stuck but on track, just give it a small boost
                aiCar.speed += 5;
            }
        }
    }
    
    // Separate method to check if a car is off track
    checkOffTrack(aiCar) {
        if (!this.game.track || !this.game.track.isPointInsideTrack) return false;
        
        // Simple track boundary check
        return !this.game.track.isPointInsideTrack(aiCar.position);
    }
    
    // Separate method to check if a car is stuck
    checkIfStuck(aiCar) {
        // Initialize position tracking if needed
        if (!aiCar.lastCheckedPosition) {
            aiCar.lastCheckedPosition = aiCar.position.clone();
            aiCar.lastMovementTime = performance.now();
            aiCar.stuckCheckCount = 0;
            return false;
        }
        
        const distance = aiCar.position.distanceTo(aiCar.lastCheckedPosition);
        const now = performance.now();
        const timeSinceLastCheck = now - aiCar.lastMovementTime;
        
        // Update position less frequently (every 2 seconds) to avoid excessive updates
        if (timeSinceLastCheck > 2000) {
            // If car has moved a reasonable distance, it's not stuck
            if (distance > 3.0) {
                // Reset stuck counter and update reference position
                aiCar.stuckCheckCount = 0;
                aiCar.lastCheckedPosition.copy(aiCar.position);
                aiCar.lastMovementTime = now;
                return false;
            }
            
            // Update reference position but increment stuck counter
            aiCar.lastCheckedPosition.copy(aiCar.position);
            aiCar.lastMovementTime = now;
            aiCar.stuckCheckCount = (aiCar.stuckCheckCount || 0) + 1;
            
            // Only consider a car stuck after multiple checks (8+ seconds of minimal movement)
            return aiCar.stuckCheckCount >= 4;
        }
        
        return false;
    }
    
    resetAICarPosition(aiCar) {
        // Reset to a random waypoint
        if (aiCar.waypoints && aiCar.waypoints.length) {
            const randomWaypointIndex = Math.floor(Math.random() * aiCar.waypoints.length);
            const waypoint = aiCar.waypoints[randomWaypointIndex];
            
            // Position slightly above waypoint to avoid collisions
            aiCar.position.copy(waypoint.position).add(new THREE.Vector3(0, 0.5, 0));
            
            // Calculate rotation to face next waypoint
            const nextWaypointIndex = (randomWaypointIndex + 1) % aiCar.waypoints.length;
            const nextWaypoint = aiCar.waypoints[nextWaypointIndex];
            
            const direction = nextWaypoint.position.clone().sub(waypoint.position).normalize();
            aiCar.rotation = Math.atan2(direction.x, direction.z);
            
            // Reset speed
            aiCar.speed = 0;
            aiCar.velocity.set(0, 0, 0);
            
            // Update waypoint tracking
            aiCar.lastWaypointIndex = randomWaypointIndex;
            aiCar.nextWaypointIndex = nextWaypointIndex;
            
            console.log(`[AI] Reset ${aiCar.playerName} to waypoint ${randomWaypointIndex}`);
        }
    }
    
    simulateItemPickups() {
        // Simulate AI cars picking up items based on their position
        if (!this.game.itemManager) return;
        
        const items = this.game.itemManager.items;
        
        for (const aiCar of this.aiCars) {
            // Skip if AI already has an item
            if (aiCar.currentItem) continue;
            
            for (const item of items) {
                // Skip if item is not active
                if (!item.active) continue;
                
                // Check distance to item
                const distanceToItem = aiCar.position.distanceTo(item.position);
                
                // Pickup range is quite generous for AI
                if (distanceToItem < 4) {
                    // 50% chance to pick up the item when in range
                    if (Math.random() < 0.5) {
                        // Simulate item pickup
                        aiCar.pickupItem({
                            type: item.type,
                            id: item.id
                        });
                        
                        // Notify item manager
                        this.game.itemManager.collectItem(item.id);
                        
                        // Break inner loop since we picked up an item
                        break;
                    }
                }
            }
        }
    }
    
    // Add a proper update method to be called from the main game loop
    update(deltaTime) {
        // Don't process AI cars if disabled (or in a private room)
        if (!this.isEnabled || this._isPrivateRoom || this._forceDisabled) {
            return;
        }
        
        // Double-check if we're in a private room (in case flag not properly set)
        if (this.game && this.game.multiplayer && this.game.multiplayer.roomId && 
            this.game.multiplayer.roomId.startsWith('private-')) {
            console.log('[AI] Detected private room in update, disabling AI:', this.game.multiplayer.roomId);
            this.disableForPrivateRoom();
            return;
        }
        
        // Skip further AI updates if there are no AI cars or if waiting for first spawn
        if (this.aiCars.length === 0) {
            if (!this._hasShownSpawnMessage && this.autoSpawnEnabled && this.firstSpawnTimer === null) {
                console.log('[AI] No AI cars yet, considering auto-spawn...');
                this._hasShownSpawnMessage = true;
                
                if (this.isMultiplayer) {
                    // In multiplayer, check if there are other players already
                    const otherPlayers = this.game.remotePlayers ? this.game.remotePlayers.size : 0;
                    
                    console.log(`[AI] Multiplayer mode with ${otherPlayers} other players`);
                    
                    if (otherPlayers === 0 && this.autoSpawnEnabled) {
                        console.log('[AI] No other players found in multiplayer, spawning default amount');
                        this.spawnRandomAICars(this.maxAICars);
                    } else if (otherPlayers > 0) {
                        // Don't auto-spawn if there are already other players
                        console.log('[AI] Other players exist, not auto-spawning AI cars');
                    }
                } else if (this.autoSpawnEnabled) {
                    // If in single player, spawn default number of AI cars
                    console.log('[AI] Single player mode, spawning default amount');
                    this.spawnRandomAICars(this.maxAICars);
                }
            }
            return;
        }
        
        // Process each AI car
        for (const aiCar of this.aiCars) {
            if (aiCar && aiCar.isActive) {
                aiCar.update(deltaTime);
            }
        }
    }
    
    // Check if AI car is outside track boundaries with optimized performance
    checkTrackBoundaries(aiCar) {
        if (!this.game.track || !aiCar) return;
        
        // Calculate distance from center as a quick first check
        const trackCenter = new THREE.Vector3(0, 0, 0);
        const distanceFromCenter = aiCar.position.distanceTo(trackCenter);
        const trackRadius = this.game.track.trackRadius || 100;
        const trackWidth = this.game.track.trackWidth || 10;
        const outerLimit = trackRadius + trackWidth * 0.6;
        const innerLimit = trackRadius - trackWidth * 0.6;
        
        // Quick check based on distance from center - most cars will pass this test
        if (distanceFromCenter < outerLimit && distanceFromCenter > innerLimit) {
            // Car is likely inside track based on distance, no need for expensive check
            return;
        }
        
        // Only do the more expensive isPointInsideTrack check if the quick check fails
        if (typeof this.game.track.isPointInsideTrack === 'function') {
            const isInside = this.game.track.isPointInsideTrack(aiCar.position);
            
            if (!isInside) {
                // Apply a modest slowdown if outside to help car return to track
                aiCar.speed *= 0.85;
                
                // If way outside the track, reset the car's position
                if (distanceFromCenter > outerLimit + 20) {
                    this.resetAICarPosition(aiCar);
                }
            }
        }
    }
    
    // Reset AI car position to a valid track position
    resetAICarPosition(aiCar) {
        const startPos = this.game.track.getStartPosition();
        if (!startPos) return;
        
        // Position at a random offset from start
        const offset = new THREE.Vector3(
            (Math.random() * 10 - 5),  // Random x offset
            0,
            -15 - Math.random() * 10   // Behind start line
        );
        
        // Rotate offset based on start rotation
        const rotation = startPos.rotation;
        const rotatedX = offset.x * Math.cos(rotation) - offset.z * Math.sin(rotation);
        const rotatedZ = offset.x * Math.sin(rotation) + offset.z * Math.cos(rotation);
        
        // Apply rotated offset to start position
        aiCar.position.set(
            startPos.position.x + rotatedX,
            startPos.position.y,
            startPos.position.z + rotatedZ
        );
        
        // Reset car physics
        aiCar.speed = 0;
        aiCar.rotation = startPos.rotation;
        
        console.log(`[AI] Reset ${aiCar.playerName}'s position`);
    }
    
    // Check collisions between AI cars
    checkCarCollisions(aiCar) {
        // Temporarily disabled car collision handling as requested
        // Just log collisions for debugging purposes without trying to handle them
        
        // Check collision with player car
        if (this.game.car) {
            const playerPos = this.game.car.getPosition();
            const distance = aiCar.position.distanceTo(playerPos);
            
            // If too close, log it but don't try to handle
            if (distance < 5) {
                // Log collision for debugging
                console.log(`[AI] ${aiCar.playerName} is close to player (${distance.toFixed(2)})`);
                
                // Simple avoidance - slow down slightly when near player
                aiCar.speed *= 0.9;
            }
        }
        
        // Check collision with other AI cars - just for logging
        for (const otherCar of this.aiCars) {
            if (otherCar === aiCar) continue;
            
            const distance = aiCar.position.distanceTo(otherCar.position);
            if (distance < 4) {
                // Log collision for debugging
                console.log(`[AI] ${aiCar.playerName} is close to ${otherCar.playerName} (${distance.toFixed(2)})`);
                
                // Simple avoidance - slow down
                aiCar.speed *= 0.85;
            }
        }
    }
    
    // Add a method to toggle debug visuals
    toggleDebugVisuals() {
        this.showDebugVisuals = !this.showDebugVisuals;
        
        if (this.showDebugVisuals) {
            this.createDebugVisuals();
            console.log('[AI] Debug visuals enabled');
        } else {
            this.removeDebugVisuals();
            console.log('[AI] Debug visuals disabled');
        }
        
        return this.showDebugVisuals;
    }
    
    // Create visual markers for AI waypoints and paths
    createDebugVisuals() {
        // Remove existing visuals first
        this.removeDebugVisuals();
        
        if (!this.game || !this.game.scene) return;
        
        // Create materials for waypoint markers
        const waypointMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const geometry = new THREE.SphereGeometry(0.5, 8, 8);
        
        // Create markers for each AI car's waypoints
        for (const aiCar of this.aiCars) {
            if (!aiCar.waypoints) continue;
            
            for (const waypoint of aiCar.waypoints) {
                const marker = new THREE.Mesh(geometry, waypointMaterial);
                marker.position.copy(waypoint.position);
                this.game.scene.add(marker);
                this.waypointMarkers.push(marker);
                
                // Add waypoint index text
                const indexSprite = this.createTextSprite(waypoint.index.toString());
                indexSprite.position.copy(waypoint.position).add(new THREE.Vector3(0, 1, 0));
                this.game.scene.add(indexSprite);
                this.waypointMarkers.push(indexSprite);
            }
        }
    }
    
    // Create a text sprite for debugging
    createTextSprite(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;
        
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.font = '48px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2, 2, 1);
        
        return sprite;
    }
    
    // Remove all debug visuals
    removeDebugVisuals() {
        if (!this.game || !this.game.scene) return;
        
        for (const marker of this.waypointMarkers) {
            this.game.scene.remove(marker);
            if (marker.material) {
                marker.material.dispose();
            }
            if (marker.geometry) {
                marker.geometry.dispose();
            }
        }
        
        this.waypointMarkers = [];
    }
    
    /**
     * Configure AI car with improved settings for staying on track
     * @param {AICar} aiCar - The AI car to configure
     */
    configureAICar(aiCar) {
        if (!aiCar) return;
        
        // Ensure the car knows to respect track boundaries
        aiCar.stayOnTrack = true;
        
        // Set appropriate handling parameters based on difficulty
        if (aiCar.difficulty === 'easy') {
            // Much more focus on center line tracking
            aiCar.boundaryAwareness = 0.95;  // Increased from 0.85
            aiCar.trackCenterBias = 0.9;     // Increased from 0.75
        } else if (aiCar.difficulty === 'medium') {
            // Better balance with stronger center tracking
            aiCar.boundaryAwareness = 0.85;   // Increased from 0.7
            aiCar.trackCenterBias = 0.75;     // Increased from 0.6
        } else if (aiCar.difficulty === 'hard') {
            // Still aggressive driving but better center focus
            aiCar.boundaryAwareness = 0.7;    // Increased from 0.5
            aiCar.trackCenterBias = 0.6;      // Increased from 0.4
        }
        
        // Additional parameters for smooth driving
        aiCar.steadiness = 0.9;              // Increased from 0.85 for even smoother steering
        aiCar.recoverySpeed = 0.9;           // Increased from 0.8 for quicker recovery from collisions
        
        // Set up waypoints with perfect precision
        setTimeout(() => {
            if (aiCar.waypoints && aiCar.waypoints.length > 0) {
                // Make sure waypoints are precisely on track
                const trackRadius = this.game.track.trackRadius || 100;
                
                // Ensure waypoints are EXACTLY on the center line with zero variation
                for (let i = 0; i < aiCar.waypoints.length; i++) {
                    const waypoint = aiCar.waypoints[i];
                    
                    // Calculate exact angle based on index and total waypoints
                    const totalWaypoints = aiCar.waypoints.length;
                    const angle = Math.PI * 2 - (i * (Math.PI * 2 / totalWaypoints));
                    
                    // Set position exactly on center line with absolute precision
                    waypoint.x = Math.sin(angle) * trackRadius;
                    waypoint.z = Math.cos(angle) * trackRadius;
                    waypoint.y = 0.5; // Standard height
                }
                
                console.log(`[AI] Precisely positioned ${aiCar.waypoints.length} waypoints on exact center line for ${aiCar.playerName}`);
            }
        }, 100);
        
        // Apply a smaller speed boost (3-8%) for better control
        const speedBoost = 1.03 + (Math.random() * 0.05);
        aiCar.maxSpeed *= speedBoost;
        
        console.log(`[AI] Configured ${aiCar.playerName} with center bias: ${aiCar.trackCenterBias.toFixed(2)}, boundary awareness: ${aiCar.boundaryAwareness.toFixed(2)}, speed boost: ${(speedBoost*100-100).toFixed(1)}%`);
    }
    
    // Completely disable AI for private room
    disableForPrivateRoom() {
        console.log('[AI] Completely disabling AI for private room');
        
        // Set maxAICars to 0 to prevent any spawning
        this.maxAICars = 0;
        
        // Remove all existing AI cars
        this.removeAllAICars();
        
        // Add a safeguard to prevent any new AI cars from being added
        this._isPrivateRoom = true;
        
        // Add a force disable flag that can't be overridden
        this._forceDisabled = true;
        
        // Override enable method to prevent re-enabling
        this._originalEnable = this.enable;
        this.enable = () => {
            if (this._forceDisabled) {
                console.log('[AI] Cannot enable AI - it has been forcibly disabled for private room');
                return;
            }
            this._originalEnable();
        };
        
        console.log('[AI] AI completely disabled for private room');
    }
} 