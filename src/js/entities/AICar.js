import * as THREE from 'three';
import { Car } from '../car.js';

/**
 * Class representing an AI-controlled car
 * @extends Car
 */
export class AICar extends Car {
    /**
     * Create an AI car
     * @param {Object} options - Constructor options
     * @param {string} options.playerName - The name of the AI player
     * @param {string} options.difficulty - AI difficulty: 'easy', 'medium', or 'hard'
     * @param {Object} options.track - The track the AI will race on
     * @param {Object} options.game - Reference to the game object
     */
    constructor(options = {}) {
        // Ensure playerName from aiName is properly passed to Car class
        const aiName = options.aiName || 'Driver';
        // Make a copy of options to avoid modifying the original
        const carOptions = { ...options };
        
        // Set playerName if not explicitly provided
        if (!carOptions.playerName) {
            carOptions.playerName = aiName;
        }
        
        console.log(`[AICAR] Creating AI car with name: ${carOptions.playerName}`);
        
        super(carOptions);
        
        // Set car as active by default
        this.isActive = true;
        
        // AI properties - Use the name from options or aiName
        this.playerName = carOptions.playerName;
        this.difficulty = options.difficulty || 'hard';
        this.track = options.track;
        this.game = options.game;
        
        // AI performance factors based on difficulty
        this.setupDifficulty();
        
        // Initialize AI control inputs with default values to start moving immediately
        this.steering = (Math.random() * 0.2 - 0.1);  // Small random initial steering
        this.throttle = 0.7;                          // Start with 70% throttle
        this.targetSpeed = this.maxSpeed * 0.5;       // Target 50% of max speed initially
        this.speed = 3;                               // Start with some initial speed
        
        // Navigation
        this.waypoints = [];
        this.currentWaypointIndex = 0;
        
        // Update interval
        this.updateInterval = 100;  // AI decision frequency in ms
        this.lastUpdateTime = 0;
        
        // Network update interval (for multiplayer)
        this.broadcastInterval = 100;
        this.lastBroadcastTime = 0;
        
        // Store previous position for collision handling
        this.previousPosition = new THREE.Vector3();
        
        // Setup AI with track
        if (options.track) {
            this.track = options.track;
            
            // Set default track direction if not defined
            if (!this.track.trackDirection) {
                // Change default to clockwise
                this.track.trackDirection = 'clockwise';
                console.log('[AI] No track direction specified, defaulting to clockwise');
            }
            
            // Log track information
            console.log(`[AI] Track assigned: radius=${this.track.trackRadius}, width=${this.track.trackWidth}`);
            console.log(`[AI] Track direction: ${this.track.trackDirection}`);
            
            // Generate waypoints
            this.generateWaypoints();
            
            // Position car at the start line just like player cars
            this.positionAtStartLine();
        }
        
        console.log(`[AI] Created ${this.difficulty} AI car: ${this.playerName}`);
    }
    
    /**
     * Set up AI performance factors based on difficulty
     */
    setupDifficulty() {
        // Base parameters - increase base speed and acceleration
        const baseParams = {
            maxSpeed: 45,           // Increased from 40
            acceleration: 18,       // Increased from 16
            braking: -22,           // Increased from -20
            turnResponsiveness: 1.2  // Increased from 1.0
        };
        
        // Difficulty multipliers - more consistent and less extreme differences
        const difficultyMultipliers = {
            easy: {
                maxSpeed: 0.85,        // 38.25 km/h
                acceleration: 0.85,    // 15.3 acceleration
                braking: 0.85,         // -18.7 braking
                turnResponsiveness: 0.9 // 1.08 turning
            },
            medium: {
                maxSpeed: 1.0,         // 45 km/h
                acceleration: 1.0,     // 18 acceleration
                braking: 1.0,          // -22 braking
                turnResponsiveness: 1.0 // 1.2 turning
            },
            hard: {
                maxSpeed: 1.15,        // 51.75 km/h
                acceleration: 1.15,    // 20.7 acceleration
                braking: 1.15,         // -25.3 braking
                turnResponsiveness: 1.1 // 1.32 turning
            }
        };
        
        // Get multipliers for current difficulty
        const multipliers = difficultyMultipliers[this.difficulty] || difficultyMultipliers.medium;
        
        // Apply multipliers to base parameters
        this.maxSpeed = baseParams.maxSpeed * multipliers.maxSpeed;
        this.acceleration = baseParams.acceleration * multipliers.acceleration;
        this.braking = baseParams.braking * multipliers.braking;
        this.turnResponsiveness = baseParams.turnResponsiveness * multipliers.turnResponsiveness;
        
        // Common properties - reduce drag for less deceleration
        this.drag = 0.25;  // Reduced from 0.3 for less natural deceleration
        
        // Add a small random variation to each car (±5% max) for more natural driving
        // This creates small differences between cars of the same difficulty
        const randomVariation = () => 1 + (Math.random() * 0.1 - 0.05);
        this.maxSpeed *= randomVariation();
        this.acceleration *= randomVariation();
        this.braking *= randomVariation();
        
        // Give each car a slightly different driving style
        // Some cars might be better at cornering, others at straight-line speed
        const drivingStyle = Math.random();
        if (drivingStyle > 0.6) { // Increased chance of cornering specialists
            // Better cornering car
            this.turnResponsiveness *= 1.15;
            this.maxSpeed *= 0.95;
            console.log(`[AI] ${this.playerName} specializes in cornering`);
        } else if (drivingStyle < 0.3) {
            // Better straight-line car
            this.turnResponsiveness *= 0.9;
            this.maxSpeed *= 1.08; // Slightly bigger speed boost
            console.log(`[AI] ${this.playerName} specializes in straight-line speed`);
        }
        
        console.log(`[AI] ${this.playerName} difficulty set to ${this.difficulty}: maxSpeed=${this.maxSpeed.toFixed(1)}, accel=${this.acceleration.toFixed(1)}`);
    }
    
    /**
     * Position the AI car at the start line
     */
    positionAtStartLine() {
        if (!this.track) return;
        
        // FORCE clockwise direction for ALL cars (as requested)
        this.track.trackDirection = 'clockwise';
        console.log(`[AI] ${this.playerName} (${this.carType}) ENFORCING clockwise direction at start`);
        
        // Use track's start position if available
        if (this.track.startPosition) {
            // Clone the start position
            this.position.copy(this.track.startPosition);
            
            // Add a slight offset to avoid collisions with player cars
            this.position.x += (Math.random() - 0.5) * 2;
            this.position.z += (Math.random() - 0.5) * 2;
            
            // ALWAYS use tangential direction for clockwise movement
            // For clockwise, we need to face left (-PI/2) at the start
            this.rotation = -Math.PI / 2; // -90 degrees - faces left side of track
            
            console.log(`[AI] ${this.playerName} using track start position with fixed rotation: ${this.rotation.toFixed(2)}`);
        } else {
            // Default position at radius
            const angle = 0; // Start at (0, 0, trackRadius)
            const trackRadius = this.track.trackRadius || 100;
            
            this.position.x = Math.sin(angle) * trackRadius; // Should be 0
            this.position.y = 0.5;
            this.position.z = Math.cos(angle) * trackRadius; // Should be trackRadius
            
            // ALWAYS face tangent to track for clockwise direction
            this.rotation = -Math.PI / 2; // -90 degrees - faces left side of track
            
            console.log(`[AI] ${this.playerName} using default start position with fixed rotation: ${this.rotation.toFixed(2)}`);
        }
        
        // Initialize direction vector based on rotation
        this.direction.x = Math.sin(this.rotation);
        this.direction.z = Math.cos(this.rotation);
        
        // Logging for debugging
        console.log(`[AI] ${this.playerName} (${this.carType}) direction vector: (${this.direction.x.toFixed(2)}, ${this.direction.z.toFixed(2)})`);
        
        // Update model position and rotation
        if (this.model) {
            this.model.position.copy(this.position);
            this.model.rotation.y = this.rotation;
        }
        
        console.log(`[AI] ${this.playerName} (${this.carType}) positioned at start: (${this.position.x.toFixed(2)}, ${this.position.z.toFixed(2)}), rotation: ${this.rotation.toFixed(2)}`);
    }
    
    /**
     * Generate waypoints for AI navigation precisely along the center line
     * with no variation to ensure center-line driving
     */
    generateWaypoints() {
        if (!this.track) {
            console.warn('[AI] Cannot generate waypoints: no track assigned');
            return;
        }

        const trackRadius = this.track.trackRadius;
        const numWaypoints = 48; // Increased from 36 for more precise tracking
        const angleStep = (Math.PI * 2) / numWaypoints;

        this.waypoints = [];

        // Force clockwise direction for ALL car types
        const direction = 'clockwise';
        this.track.trackDirection = direction;
        
        console.log(`[AI] ${this.playerName} (${this.carType}) FORCING ${direction} direction`);

        // Generate waypoints EXACTLY on the center line with NO variation
        for (let i = 0; i < numWaypoints; i++) {
            // For clockwise: decreasing angle (2π, 2π-step, 2π-2*step, ...)
            const angle = Math.PI * 2 - (i * angleStep);
            
            // Calculate exact center line position for clockwise direction
            // Use the exact track radius with no variation
            const waypoint = new THREE.Vector3(
                Math.sin(angle) * trackRadius,
                0.5, // Standard height
                Math.cos(angle) * trackRadius
            );
            
            this.waypoints.push(waypoint);
        }

        // Set current waypoint index
        this.currentWaypointIndex = 0;
        
        console.log(`[AI] ${this.playerName} (${this.carType}) generated ${this.waypoints.length} waypoints exactly on center line`);
    }
    
    /**
     * Update method called once per frame
     * @param {number} deltaTime - Time elapsed since last update in seconds
     */
    update(deltaTime) {
        // Skip processing if delta time is too high (likely tab was inactive)
        if (deltaTime > 0.1) {
            return;
        }
        
        // Skip updates if the car isn't active
        if (!this.isActive) {
            return;
        }
        
        // Store previous position for collision recovery
        this.previousPosition.copy(this.position);

        // Update AI behavior to set steering and throttle values
        this.updateAIBehavior(deltaTime);

        // Calculate physics with deltaTime clamping for stability
        const clampedDelta = Math.min(deltaTime, 0.05); // Never process more than 50ms in one step

        // Apply steering with smoother turn rate
        if (this.steering !== 0) {
            // Convert steering value to rotation change
            const steeringFactor = this.turnResponsiveness * clampedDelta;
            this.rotation += this.steering * steeringFactor;
            
            // Update direction based on new rotation
            this.direction.x = Math.sin(this.rotation);
            this.direction.z = Math.cos(this.rotation);
        }

        // Apply throttle/braking with consistent physics
        if (this.throttle > 0) {
            // Accelerate with clamped acceleration to prevent jumps
            const accelForce = this.acceleration * this.throttle * clampedDelta;
            this.speed += accelForce;
            
            // Cap at max speed based on difficulty
            this.speed = Math.min(this.speed, this.maxSpeed);
        } else if (this.throttle < 0) {
            // Brake with controlled force
            const brakeForce = this.braking * Math.abs(this.throttle) * clampedDelta;
            this.speed += brakeForce;
        } else {
            // Coast - apply natural deceleration
            this.speed *= (1 - this.drag * clampedDelta);
        }

        // Ensure speed is non-negative and capped
        this.speed = Math.max(0, Math.min(this.speed, this.maxSpeed * 1.1));

        // Move the car based on speed and direction with constant movement
        const movement = this.direction.clone().multiplyScalar(this.speed * clampedDelta);
        this.position.add(movement);

        // Check track boundaries - optimize with less frequent checks
        if (!this._lastBoundaryCheck || performance.now() - this._lastBoundaryCheck > 100) {
            this.checkTrackBoundaries();
            this._lastBoundaryCheck = performance.now();
        }

        // Update car model position and rotation
        if (this.model) {
            this.model.position.copy(this.position);
            this.model.rotation.y = this.rotation;
        }

        // Update visuals but throttle for performance
        this.updateVisuals();
        
        // Remove broadcasting of AI car positions in multiplayer mode for performance
        // In multiplayer mode, AI cars are now local-only and not shared with other players
        /* 
        if (this.game && this.game.isMultiplayer && this.game.playManager) {
            const now = performance.now();
            // Broadcast based on speed - faster cars broadcast more frequently
            const broadcastInterval = Math.max(200, 500 - (this.speed * 5));
            
            if (now - this.lastBroadcastTime > broadcastInterval) {
                this.broadcastPosition();
                this.lastBroadcastTime = now;
            }
        }
        */
    }
    
    /**
     * Update AI behavior for driving, steering, and maintaining center line position
     * @param {number} deltaTime - Time elapsed since last update
     */
    updateAIBehavior(deltaTime) {
        // Skip if no track or waypoints
        if (!this.track || !this.waypoints || this.waypoints.length === 0) {
            return;
        }

        // Force track direction to be consistent
        this.track.trackDirection = 'clockwise';

        // Calculate track center and radius 
        const trackRadius = this.track.trackRadius;
        const currentAngle = Math.atan2(this.position.x, this.position.z);
        
        // Calculate exact center line position at current angle
        const idealX = Math.sin(currentAngle) * trackRadius;
        const idealZ = Math.cos(currentAngle) * trackRadius;
        const idealPosition = new THREE.Vector3(idealX, 0.5, idealZ);
        
        // Calculate deviation from center line
        const deviationFromCenter = this.position.distanceTo(idealPosition);
        
        // SIMPLIFIED: Just steer toward tangent direction at center point
        const tangentAngle = currentAngle - Math.PI / 2; // For clockwise
        
        // Set target rotation to be tangent to circle at current angle
        const rotationDiff = this.normalizeAngle(tangentAngle - this.rotation);
        
        // Apply rotation directly with strong correction
        this.rotation += rotationDiff * 0.25;
        this.direction.x = Math.sin(this.rotation);
        this.direction.z = Math.cos(this.rotation);
        
        // Constantly apply correction toward center line
        const dirToCenter = idealPosition.clone().sub(this.position).normalize();
        const correctionStrength = Math.min(0.5, deviationFromCenter / 10);
        const correction = dirToCenter.clone().multiplyScalar(correctionStrength * deltaTime * 20);
        this.position.add(correction);
        
        // Set throttle based on speed
        if (this.speed < this.maxSpeed * 0.8) {
            this.throttle = 1.0;
        } else {
            this.throttle = 0.7;
        }
        
        // Simplified steering value for animation
        this.steering = rotationDiff;
        
        // For performance, throttle waypoint checks
        const now = performance.now();
        if (!this._lastWaypointCheck || now - this._lastWaypointCheck > 500) {
            this._lastWaypointCheck = now;
            
            // Update current waypoint - just for progress tracking
            const nextWaypoint = this.waypoints[this.currentWaypointIndex];
            if (nextWaypoint) {
                const distanceToWaypoint = this.position.distanceTo(nextWaypoint);
                if (distanceToWaypoint < 3) {
                    this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
                }
            }
        }
    }
    
    handleItems() {
        // If we have an item, consider using it
        if (this.canUseItems && this.currentItem) {
            // Use speedboost immediately
            if (this.currentItem === 'speedBoost') {
                this.useItem();
                return;
            }
            
            // Throw bananas occasionally if we have them and we're allowed
            if (this.currentItem === 'banana' && this.canThrowBananas) {
                if (Math.random() < 0.1 * this.aggressiveness) {
                    this.useItem();
                    return;
                }
            }
        }
    }
    
    // Override item pickup to simulate AI picking up items
    pickupItem(itemData) {
        super.pickupItem(itemData);
        
        // Log item pickup
        console.log(`[AI] ${this.playerName} picked up ${itemData.type}`);
        
        // Use speed boosts immediately
        if (itemData.type === 'speedBoost') {
            this.useItem();
        }
    }
    
    // Add a method to improve collision avoidance with other cars
    calculateCollisionAvoidance() {
        const result = {
            needsAvoidance: false,
            avoidanceAngle: 0,
            speedMultiplier: 1.0
        };
        
        // Skip collision avoidance if no scene or mesh
        if (!this.mesh || !this.mesh.parent) return result;
        
        const scene = this.mesh.parent;
        const cars = [];
        
        // Find all cars in the scene
        scene.traverse(object => {
            if (object.userData && object.userData.car) {
                // Skip our own car
                if (object.userData.car === this) return;
                
                cars.push({
                    position: object.position.clone(),
                    car: object.userData.car
                });
            }
        });
        
        // Check for cars ahead
        const lookaheadDistance = 15; // Look ahead 15 units for collision avoidance
        const avoidanceWidth = 3;     // Width of avoidance detection
        
        // Calculate forward direction and sideways direction
        const forwardDirection = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);
        const rightDirection = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);
        
        // Check each car for potential collision
        for (const otherCar of cars) {
            // Vector from AI to other car
            const toOtherCar = otherCar.position.clone().sub(this.position);
            
            // Project this vector onto the forward direction to get distance ahead/behind
            const distanceAhead = toOtherCar.dot(forwardDirection);
            
            // Only avoid cars ahead of us up to lookaheadDistance
            if (distanceAhead > 0 && distanceAhead < lookaheadDistance) {
                // Project onto right direction to see if car is to the left/right
                const distanceSideways = toOtherCar.dot(rightDirection);
                
                // Only avoid if car is within our path (based on avoidanceWidth)
                if (Math.abs(distanceSideways) < avoidanceWidth) {
                    result.needsAvoidance = true;
                    
                    // Determine avoidance direction (steer away from other car)
                    result.avoidanceAngle = distanceSideways > 0 ? -0.3 : 0.3;
                    
                    // Slow down more if very close
                    const proximityFactor = 1 - (distanceAhead / lookaheadDistance);
                    result.speedMultiplier = Math.max(0.5, 1 - proximityFactor);
                    
                    break; // Only avoid the nearest car ahead
                }
            }
        }
        
        return result;
    }
    
    // Method to broadcast AI car position to other players in multiplayer mode
    broadcastPosition() {
        if (!this.game || !this.game.playManager || !this.game.playManager.multiplayerManager) {
            return;
        }
        
        // Only broadcast if we have moved
        const multiplayerManager = this.game.playManager.multiplayerManager;
        
        // Create AI update data
        const updateData = {
            isAI: true,
            aiId: this.carInstanceId,
            position: this.position.toArray(),
            rotation: this.rotation,
            aiName: this.playerName,
            carType: this.carType,
            timestamp: Date.now()
        };
        
        // Broadcast using the AI update event
        multiplayerManager.socket.emit('ai-car-update', updateData);
    }
    
    // Override handleCollision method from Car class
    handleCollision() {
        // Throttle collisions to prevent rapid repeated handling
        const now = performance.now();
        if (!this.lastCollisionTime) this.lastCollisionTime = 0;
        if (now - this.lastCollisionTime < 300) { // Reduced from 500ms to 300ms
            return;
        }
        this.lastCollisionTime = now;
        
        // Find center of track
        if (!this.track || !this.track.trackRadius) return;
        
        const trackCenter = new THREE.Vector3(0, 0, 0);
        const trackRadius = this.track.trackRadius;
        const trackWidth = this.track.trackWidth || 10;
        
        // Calculate current angle around track (polar coordinates)
        const currentAngle = Math.atan2(this.position.x, this.position.z);
        
        // Calculate ideal position on track (center line)
        const idealX = Math.sin(currentAngle) * trackRadius;
        const idealZ = Math.cos(currentAngle) * trackRadius;
        const idealPosition = new THREE.Vector3(idealX, this.position.y, idealZ);
        
        // Calculate distance from ideal center line position
        const distanceFromIdeal = this.position.distanceTo(idealPosition);
        
        // Calculate distance from center to detect inner vs outer wall collision
        const distanceFromCenter = this.position.distanceTo(trackCenter);
        const isOutsideCollision = distanceFromCenter > trackRadius;
        
        // Calculate direction toward center line (not track center)
        const toCenterLine = new THREE.Vector3();
        toCenterLine.subVectors(idealPosition, this.position).normalize();
        
        // Calculate tangential direction (along track)
        // For clockwise: tangent is perpendicular to radius, rotated clockwise
        const tangentDirection = new THREE.Vector3(
            -Math.cos(currentAngle), // x component of tangent
            0,
            Math.sin(currentAngle)   // z component of tangent
        );
        
        // Calculate rotation to orient car along track
        let targetRotation;
        
        if (isOutsideCollision) {
            // Outer wall collision - aim more inward
            // Blend tangent direction with more inward direction (60/40 split)
            const blendedDirection = new THREE.Vector3()
                .addScaledVector(tangentDirection, 0.6) // Reduced from 0.7
                .addScaledVector(toCenterLine, 0.4)     // Increased from 0.3
                .normalize();
                
            targetRotation = Math.atan2(blendedDirection.x, blendedDirection.z);
        } else {
            // Inner wall collision - aim more outward
            // Blend tangent direction with more outward direction (60/40 split)
            const outwardDirection = toCenterLine.clone().multiplyScalar(-1);
            
            const blendedDirection = new THREE.Vector3()
                .addScaledVector(tangentDirection, 0.6) // Reduced from 0.7
                .addScaledVector(outwardDirection, 0.4) // Increased from 0.3
                .normalize();
                
            targetRotation = Math.atan2(blendedDirection.x, blendedDirection.z);
        }
        
        // Apply rotation more aggressively - don't snap immediately but move faster
        const rotationDiff = this.normalizeAngle(targetRotation - this.rotation);
        this.rotation += rotationDiff * 0.6; // Increased from 0.5 to 0.6 for faster correction
        
        // Update direction based on new rotation
        this.direction.x = Math.sin(this.rotation);
        this.direction.z = Math.cos(this.rotation);
        
        // Calculate push force based on how far off track - stronger push
        const pushStrength = Math.min(1.0, distanceFromIdeal / (trackWidth * 0.35)); // Reduced from 0.4 to 0.35
        const pushDistance = 3.0 + (pushStrength * 5.0); // Increased from 2-6 to 3-8 units of push
        
        // Push back toward center line of track with stronger force
        const pushVector = toCenterLine.clone().multiplyScalar(pushDistance);
        this.position.add(pushVector);
        
        // For even mildly extreme cases, provide stronger correction
        if (distanceFromIdeal > trackWidth * 0.6) { // Reduced from 0.75 to 0.6
            // Move car closer to ideal position with stronger correction
            const recoveryFactor = 0.9; // Increased from 0.8 to 0.9 for stronger recovery
            const idealOffset = this.position.clone().sub(idealPosition).multiplyScalar(1.0 - recoveryFactor);
            this.position.copy(idealPosition).add(idealOffset);
            
            // Log repositioning
            console.log(`[AI] ${this.playerName} repositioned after going off track`);
        }
        
        // Reduce speed based on collision severity, but maintain minimum speed
        const speedReduction = 0.3 + (pushStrength * 0.4); // 30-70% reduction
        this.speed *= (1.0 - speedReduction);
        
        // Add a small boost to keep car moving - higher minimum speed
        if (this.speed < 8) { // Increased from 5 to 8
            this.speed = 8;
        }
        
        // Reset any stuck counters
        this.collisionCount = 0;
        this.stuckCheckCount = 0;
    }

    /**
     * Normalize an angle to the range [-PI, PI]
     * @param {number} angle - The angle to normalize
     * @return {number} The normalized angle
     */
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }

    /**
     * Check if the car is within track boundaries and handle collisions
     */
    checkTrackBoundaries() {
        if (!this.track) return false;
        
        // Skip frequent checks if we just handled a collision
        const now = performance.now();
        if (this.lastCollisionTime && (now - this.lastCollisionTime < 300)) {
            return false;
        }
        
        // Check if the car is outside the track using center-based distance
        const trackCenter = new THREE.Vector3(0, 0, 0);
        const distanceFromCenter = this.position.distanceTo(trackCenter);
        
        // Get track dimensions
        const trackRadius = this.track.trackRadius || 100;
        const trackWidth = this.track.trackWidth || 10;
        
        // Calculate inner and outer boundaries with stricter limits
        const outerLimit = trackRadius + (trackWidth * 0.45); // Reduced from 0.5
        const innerLimit = trackRadius - (trackWidth * 0.45); // Reduced from 0.5
        
        // Calculate current position angle for directional checks
        const currentAngle = Math.atan2(this.position.x, this.position.z);
        
        // Calculate exact center line position at current angle
        const idealX = Math.sin(currentAngle) * trackRadius;
        const idealZ = Math.cos(currentAngle) * trackRadius;
        const idealPosition = new THREE.Vector3(idealX, 0.5, idealZ);
        
        // Calculate deviation from center line
        const deviationFromCenter = this.position.distanceTo(idealPosition);
        
        // Calculate direction vectors
        const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
        const tangent = new THREE.Vector3(
            Math.sin(currentAngle - Math.PI/2), // Tangent for clockwise
            0,
            Math.cos(currentAngle - Math.PI/2)
        );
        
        // Direction to center line
        const dirToCenter = new THREE.Vector3().subVectors(idealPosition, this.position).normalize();
        
        // Check if car is near track boundary but not quite - more aggressive threshold
        const isNearOuterBoundary = distanceFromCenter > outerLimit - 3; // Increased from 2
        const isNearInnerBoundary = distanceFromCenter < innerLimit + 3; // Increased from 2
        
        // If the car is getting close to a boundary, provide early correction
        if (isNearOuterBoundary || isNearInnerBoundary) {
            // Calculate how close we are to boundary
            const distanceToLimit = isNearOuterBoundary ? 
                outerLimit - distanceFromCenter : 
                distanceFromCenter - innerLimit;
            
            // More aggressive slowdown when close to boundary
            const slowdownFactor = Math.max(0.65, Math.min(0.9, distanceToLimit / 3)); // More aggressive reduction
            
            // Apply even when moving at moderate speeds
            if (this.speed > 5) { // Reduced from 10
                this.speed *= slowdownFactor;
            }
            
            // Add steering correction toward center line
            const angleToCenter = Math.atan2(dirToCenter.x, dirToCenter.z);
            const currentRotation = this.rotation;
            const angleDiff = this.normalizeAngle(angleToCenter - currentRotation);
            
            // Apply stronger correction based on distance from boundary
            const correctionStrength = Math.min(0.3, (3 - distanceToLimit) / 10);
            this.rotation += angleDiff * correctionStrength;
            
            // Update direction based on new rotation
            this.direction.x = Math.sin(this.rotation);
            this.direction.z = Math.cos(this.rotation);
        }
        
        // More aggressive deviation threshold - correct even for moderate deviations
        if (deviationFromCenter > trackWidth * 0.3) { // Reduced from implicit 0.4-0.5
            // Apply mild correction without full collision handling
            // Nudge toward center line
            const correctionForce = Math.min(0.15, deviationFromCenter / 50);
            const correction = dirToCenter.clone().multiplyScalar(correctionForce);
            this.position.add(correction);
            
            // Slightly reduce speed
            this.speed *= 0.95;
        }
        
        // First check: distance-based boundary check
        const isOutsideOuter = distanceFromCenter > outerLimit;
        const isInsideInner = distanceFromCenter < innerLimit;
        
        // If we're clearly outside track boundaries based on distance, handle collision
        if (isOutsideOuter || isInsideInner) {
            this.handleCollision();
            return true;
        }
        
        // Second check: use track's precise boundary detection if available
        if (typeof this.track.isPointInsideTrack === 'function') {
            // Check more frequently (every 3 frames instead of 4)
            if (!this.boundaryCheckCounter) this.boundaryCheckCounter = 0;
            this.boundaryCheckCounter++;
            
            if (this.boundaryCheckCounter % 3 === 0) {
                const isInside = this.track.isPointInsideTrack(this.position);
                
                if (!isInside) {
                    this.handleCollision();
                    return true;
                }
            }
            
            // Additional check: predict position ahead and check if it's inside track
            // Look ahead further and check more frequently
            if ((this.speed > 15 || isNearOuterBoundary || isNearInnerBoundary) && 
                this.boundaryCheckCounter % 3 === 0) { // Changed from 5 to 3
                
                // Look ahead based on current speed - even further for prediction
                const lookAheadDistance = Math.min(6, this.speed * 0.2); // Increased from 5 and 0.15
                const predictedPosition = this.position.clone().add(
                    forward.clone().multiplyScalar(lookAheadDistance)
                );
                
                const isPredictedPositionInside = this.track.isPointInsideTrack(predictedPosition);
                
                if (!isPredictedPositionInside) {
                    // Stronger slowdown
                    this.speed *= 0.7; // Reduced from 0.8
                    
                    // For fast-moving cars or very close to boundary, stronger correction
                    if (this.speed > 12 || isNearOuterBoundary || isNearInnerBoundary) { // Reduced from 15
                        // Turn more sharply toward track center to avoid imminent collision
                        const idealX = Math.sin(currentAngle) * trackRadius;
                        const idealZ = Math.cos(currentAngle) * trackRadius;
                        const idealPosition = new THREE.Vector3(idealX, 0.5, idealZ);
                        
                        // Calculate direction to center line
                        const toCenterLine = idealPosition.clone().sub(this.position).normalize();
                        
                        // Adjust steering to turn toward center line more aggressively
                        const angleToCenter = Math.atan2(toCenterLine.x, toCenterLine.z);
                        this.rotation = this.rotation * 0.7 + angleToCenter * 0.3; // Increased from 0.2 to 0.3
                        
                        // Update direction based on new rotation
                        this.direction.x = Math.sin(this.rotation);
                        this.direction.z = Math.cos(this.rotation);
                    }
                }
            }
        }
        
        return false;
    }

    // Method to handle collision with another car
    handleCollisionWith(otherCar) {
        return;
        // Simple collision response - just slow down
        this.speed *= 0.8;
        
        // If we have a position to restore to, use it
        if (this.previousPosition) {
            // Move slightly back from previous position
            const restoredPosition = this.previousPosition.clone();
            this.position.copy(restoredPosition);
        }
        
        // Log the collision
        const otherName = otherCar.playerName || 'Player';
        console.log(`[AI] ${this.playerName} collided with ${otherName}, slowing down`);
    }
}

// Helper function to get random AI car color
function getRandomAICarColor() {
    // Define a set of colors for AI cars
    const aiColors = [
        0x3498db, // Blue
        0xe74c3c, // Red
        0x2ecc71, // Green
        0xf39c12, // Orange
        0x9b59b6, // Purple
        0x1abc9c, // Teal
        0xd35400, // Dark Orange
        0x2c3e50  // Navy
    ];
    
    return aiColors[Math.floor(Math.random() * aiColors.length)];
}

// Helper function to set decision noise based on difficulty
function getDecisionNoiseForDifficulty(difficulty) {
    // How much randomness to add to AI decisions
    switch (difficulty) {
        case 'easy':
            return { turning: 0.2, speed: 0.15 };
        case 'medium':
            return { turning: 0.1, speed: 0.08 };
        case 'hard':
            return { turning: 0.05, speed: 0.04 };
        default:
            return { turning: 0.1, speed: 0.1 };
    }
} 