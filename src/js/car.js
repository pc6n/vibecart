import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';

export class Car {
    constructor(sceneOrOptions, track, isRemote = false) {
        // Handle both old-style positional params and new options object
        let scene, options = {};
        
        // Check if first argument is an object (new style) or the scene (old style)
        if (sceneOrOptions && typeof sceneOrOptions === 'object' && !(sceneOrOptions instanceof THREE.Scene)) {
            // New style: options object
            options = sceneOrOptions;
            scene = options.scene;
            track = options.track;
            isRemote = options.isRemote !== undefined ? options.isRemote : false;
        } else {
            // Old style: positional parameters
            scene = sceneOrOptions;
        }
        
        // Generate a unique ID for each car instance
        this.carInstanceId = options.carInstanceId || Math.random().toString(36).substring(2, 10);
        console.log(`[CAR-TRACKING] Creating new car instance ${this.carInstanceId}, isRemote: ${isRemote}`);
        
        this.scene = scene;
        this.track = track;
        this.mesh = null;
        this.wheels = [];
        this.clock = new THREE.Clock();
        this.wheelRadius = 0.5;
        this.speed = 0;
        this.maxSpeed = 55.28; // m/s (equivalent to 199 km/h)
        this.maxReverseSpeed = 20; // m/s (about 72 km/h)
        this.acceleration = 50; // Increased for better responsiveness
        this.reverseAcceleration = 40; // Adjusted for better reverse control
        this.deceleration = 25; // Increased for better stopping
        this.brakeDeceleration = 50; // Increased for better braking
        this.turnSpeed = Math.PI * 0.6; // Reduced for smoother turning
        this.turnSmoothing = 0.8; // New: smoothing factor for turning (0-1)
        this.currentTurnRate = 0; // New: track current turn rate for smoothing
        
        // Always initialize Vectors as THREE.Vector3 objects to prevent type issues
        // Position the car safely (even if track is not available)
        this.position = new THREE.Vector3();
        if (this.track && this.track.trackRadius !== undefined) {
            this.position.set(this.track.trackRadius, 0.5, 0);
        } else {
            // Default position when track is not available
            this.position.set(0, 0.5, 0);
        }
        
        this.previousPosition = this.position.clone();
        this.direction = new THREE.Vector3(0, 0, 1);
        this.rotation = 0;
        
        // Flag to distinguish between local and remote cars
        this.isRemote = isRemote;
        
        // Only set up controls for local cars
        if (!isRemote) {
            this.isAccelerating = false;
            this.isBraking = false;
            this.isReversing = false;
            this.isTurningLeft = false;
            this.isTurningRight = false;
        }
        
        // Add bounce effect properties
        this.bounceStrength = 5;
        this.bounceDecay = 0.8;
        this.bounceVelocity = new THREE.Vector3(0, 0, 0);
        
        // Current velocity for smoother acceleration
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Add car model type and color
        this.carType = options.carType || 'classic'; // Default to classic car
        this.carColor = new THREE.Color(options.color || 0xff0000); // Default red
        
        // Enhanced interpolation properties
        this.targetPosition = new THREE.Vector3();
        this.targetRotation = 0;
        this.previousTargetPosition = new THREE.Vector3();
        this.previousTargetRotation = 0;
        this.interpolationFactor = 0;
        this.interpolationDuration = 0.05; // Reduced from 0.1 to 0.05 for more frequent updates
        this.lastUpdateTime = performance.now();
        this.estimatedSpeed = 0;
        
        // Add network jitter handling properties for remote cars
        if (isRemote) {
            this.predictionStrength = 0.5;    // How much to predict position based on velocity (0-1)
            this.updateIntervals = [];        // Array of recent update intervals (ms)
            this.maxExpectedInterval = 200;   // Maximum expected time between updates (ms)
            this.consecutivePacketDrops = 0;  // Counter for lost packets
            this.lastPacketDropTime = 0;      // Time of last detected packet drop
            this.receivedUpdates = 0;         // Counter for received updates
        }
        
        // Add F1 model cache
        this.f1Model = null;
        this.f1Materials = null;
        
        // Set player name from options or localStorage with special handling for AI
        // If this car is an AI car or remote car, don't use localStorage to avoid name conflicts
        if (options.playerName) {
            // Explicitly provided name takes priority
            this.playerName = options.playerName;
            console.log(`[CAR] Using provided player name: ${this.playerName}`);
        } else if (!isRemote && !options.isAI) {
            // Only use localStorage for local player cars (not AI or remote)
            this.playerName = localStorage.getItem('playerName') || 'Player';
            console.log(`[CAR] Using localStorage player name: ${this.playerName}`);
        } else {
            // Default fallback
            this.playerName = 'Player';
            console.log(`[CAR] Using default player name: ${this.playerName}`);
        }
        
        // Add state change callback
        this._onStateChange = null;

        // Exhaust cloud properties
        this.exhaustCloud = null;
        this.exhaustParticles = [];
        this.exhaustLastEmit = 0;
        this.exhaustEmitInterval = 120; // Much less frequent emissions
        this.exhaustParticleLifetime = 1200; // Even shorter lifetime
        this.smokeTexture = this.createSmokeTexture();
        
        // Add speed boost properties
        this.speedBoostActive = false;
        this.speedBoostFactor = 2.0; // Double speed when boosted
        this.speedBoostDuration = 3000; // 3 seconds
        this.speedBoostTimeout = null;
        
        // Add item properties
        this.currentItem = null;
        this.bananas = [];
        
        // Track if the car has been initialized
        this.initialized = false;
        
        // Create car only if we have a scene
        if (this.scene) {
            this.createCar();
            this.createPlayerNameTag();
        }

        this.lastCollisionTime = 0;  // Add this line at the beginning of constructor
        this.COLLISION_COOLDOWN = 1000;  // 1 second cooldown between notifications
        this.controlsEnabled = true;
    }

    // Create a smoke texture for exhaust particles
    createSmokeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(
            canvas.width / 2,
            canvas.height / 2,
            0,
            canvas.width / 2,
            canvas.height / 2,
            canvas.width / 2
        );
        
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.2, 'rgba(240, 240, 240, 0.9)');
        gradient.addColorStop(0.5, 'rgba(200, 200, 200, 0.7)');
        gradient.addColorStop(0.8, 'rgba(180, 180, 180, 0.3)');
        gradient.addColorStop(1, 'rgba(180, 180, 180, 0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        return new THREE.CanvasTexture(canvas);
    }
    
    setCarType(type) {
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }
        this.carType = type;
        this.createCar();
    }
    
    setCarColor(color) {
        this.carColor = new THREE.Color(color);
        if (this.mesh) {
            // Update all car parts with the new color
            this.mesh.traverse((child) => {
                if (child.isMesh && child.material.color) {
                    if (child.material === this.bodyMaterial) {
                        child.material.color.copy(this.carColor);
                    } else if (child.material === this.roofMaterial) {
                        // Make roof slightly darker
                        const darkerColor = this.carColor.clone().multiplyScalar(0.8);
                        child.material.color.copy(darkerColor);
                    }
                }
            });
        }
    }
    
    async createCar() {
        console.log(`[CAR-TRACKING] Creating car mesh for car ${this.carInstanceId}, type: ${this.carType}`);
        
        // Remove existing car if it exists
        if (this.mesh) {
            if (this.nameTag) {
                this.mesh.remove(this.nameTag);
            }
            this.scene.remove(this.mesh);
            this.mesh = null;
        }

        console.log(`Creating car of type: ${this.carType}`);
        if (this.carType === 'tesla') {
            this.createTeslaModel();
        } else if (this.carType === 'f1') {
            await this.createF1Model();
        } else {
            this.createClassicModel();
        }

        // Ensure the mesh is added to the scene
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.rotation.y = this.rotation;
            this.scene.add(this.mesh);
            console.log('Car mesh added to scene');
            
            // Recreate name tag after mesh is added
            this.createPlayerNameTag();
            
            this.mesh.userData.carInstanceId = this.carInstanceId;
            console.log(`[CAR-TRACKING] Car mesh created for ${this.carInstanceId}, mesh ID: ${this.mesh.id}`);
            
            // Count cars in the scene with the same ID pattern
            const remoteCars = [];
            this.scene.traverse(object => {
                if (object.userData && object.userData.carInstanceId) {
                    remoteCars.push({
                        id: object.userData.carInstanceId,
                        meshId: object.id,
                        isVisible: object.visible,
                        position: object.position.toArray()
                    });
                }
            });
            console.log(`[CAR-TRACKING] Scene now has ${remoteCars.length} cars:`, remoteCars);
        } else {
            console.error(`[CAR-TRACKING] Failed to create mesh for car ${this.carInstanceId}`);
        }
    }
    
    createClassicModel() {
        const carGroup = new THREE.Group();
        
        // Store materials as instance properties
        this.bodyMaterial = new THREE.MeshPhongMaterial({ color: this.carColor });
        this.roofMaterial = new THREE.MeshPhongMaterial({ 
            color: this.carColor.clone().multiplyScalar(0.8) 
        });
        
        // Car body
        const bodyGeometry = new THREE.BoxGeometry(2, 1, 4);
        const body = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
        body.position.y = 0.5;
        carGroup.add(body);
        
        // Car roof
        const roofGeometry = new THREE.BoxGeometry(1.5, 0.7, 2);
        const roof = new THREE.Mesh(roofGeometry, this.roofMaterial);
        roof.position.y = 1.35;
        roof.position.z = -0.5;
        carGroup.add(roof);
        
        this.addWheels(carGroup);
        
        // Add car to scene
        this.mesh = carGroup;
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.userData.car = this; // Store reference to car instance
        this.scene.add(this.mesh);
    }
    
    createTeslaModel() {
        const carGroup = new THREE.Group();
    
        // Store materials as instance properties
        this.bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: this.carColor,
            shininess: 100
        });
        this.roofMaterial = new THREE.MeshPhongMaterial({ 
            color: this.carColor.clone().multiplyScalar(0.8),
            shininess: 100
        });
    
        // Main body: a sleek, low profile box
        const bodyGeometry = new THREE.BoxGeometry(1.85, 0.5, 4.7);
        const body = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
        body.position.y = 0.5;
        carGroup.add(body);
    
        // Curved roof using BufferGeometry
        const roofGeometry = new THREE.BoxGeometry(1.85, 0.3, 2.2);
        const positionAttribute = roofGeometry.getAttribute('position');
        const positions = positionAttribute.array;
        
        // Modify the top vertices to create a curve
        for (let i = 0; i < positions.length; i += 3) {
            const y = positions[i + 1];
            if (y > 0) {
                const x = positions[i];
                const normalizedX = (x + 0.925) / 1.85;
                positions[i + 1] = y + Math.sin(normalizedX * Math.PI) * 0.2;
            }
        }
        
        positionAttribute.needsUpdate = true;
        roofGeometry.computeVertexNormals();
        
        const roof = new THREE.Mesh(roofGeometry, this.roofMaterial);
        roof.position.y = 0.8;
        roof.position.z = -1.0;
        carGroup.add(roof);
    
        // Windshields: large, slightly tilted for that panoramic look
        const windshieldGeometry = new THREE.PlaneGeometry(1.8, 1.0);
        const windshieldMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x84afdb,
            transparent: true,
            opacity: 0.7,
            shininess: 100,
            side: THREE.DoubleSide
        });
        const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
        windshield.position.set(0, 0.95, -1.7);
        windshield.rotation.x = -Math.PI / 4;
        carGroup.add(windshield);
    
        // Rear windshield (mirrored tilt)
        const rearWindshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
        rearWindshield.position.set(0, 0.95, 1.7);
        rearWindshield.rotation.x = Math.PI / 4;
        carGroup.add(rearWindshield);
    
        // Headlights: subtle LED-like cylinders
        const headlightGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16);
        const headlightMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.5
        });
        const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        leftHeadlight.rotation.z = Math.PI / 2;
        leftHeadlight.position.set(-0.4, 0.55, -2.35);
        carGroup.add(leftHeadlight);
        const rightHeadlight = leftHeadlight.clone();
        rightHeadlight.position.x = 0.4;
        carGroup.add(rightHeadlight);
    
        // Taillights: slim and subtle
        const taillightGeometry = new THREE.BoxGeometry(0.15, 0.1, 0.05);
        const taillightMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5
        });
        const leftTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        leftTaillight.position.set(-0.5, 0.55, 2.35);
        carGroup.add(leftTaillight);
        const rightTaillight = leftTaillight.clone();
        rightTaillight.position.x = 0.5;
        carGroup.add(rightTaillight);
    
        // Wheels: adjust size and position for a Model 3 feel
        this.addWheels(carGroup, {
            wheelRadius: 0.45,
            wheelWidth: 0.3,
            frontZ: -1.7,
            rearZ: 1.7,
            y: 0.3,
            xOffset: 0.9
        });
    
        // Finalize the car mesh
        this.mesh = carGroup;
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.userData.car = this; // Store reference to car instance
        this.scene.add(this.mesh);
    }
    
    addWheels(carGroup, options = {}) {
        const wheelRadius = options.wheelRadius || 0.5;
        const wheelWidth = options.wheelWidth || 0.4;
        const y = options.y || 0.3;
        const xOffset = options.xOffset || 1.1;
        const frontZ = options.frontZ || -1.3;
        const rearZ = options.rearZ || 1.3;
    
        const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16);
        const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    
        const positions = [
            { x: -xOffset, y: y, z: frontZ },
            { x: xOffset, y: y, z: frontZ },
            { x: -xOffset, y: y, z: rearZ },
            { x: xOffset, y: y, z: rearZ }
        ];
    
        this.wheels = positions.map(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.position.set(pos.x, pos.y, pos.z);
            wheel.rotation.z = Math.PI / 2;
            carGroup.add(wheel);
            return wheel;
        });
    }
    
    
    accelerate(accelerating) {
        const previousState = this.isAccelerating;
        this.isAccelerating = accelerating;
    }
    
    brake(braking) {
        const previousState = this.isBraking;
        this.isBraking = braking;
    }
    
    reverse(reversing) {
        const previousState = this.isReversing;
        this.isReversing = reversing;
        
        // Log if the state has changed
        if (previousState !== reversing) {
            console.debug(`[CAR] Reverse set to ${reversing} for car ${this.carInstanceId}`);
        }
        
        // Reset reverse timer when reverse is released
        if (!reversing) {
            this.reverseTimer = 0;
        }
    }
    
    turnLeft(turning) {
        const previousState = this.isTurningLeft;
        this.isTurningLeft = turning;
    }
    
    turnRight(turning) {
        const previousState = this.isTurningRight;
        this.isTurningRight = turning;
    }
    
    update(delta) {
        if (!this.controlsEnabled) return;
        // Safety check and initialization
        if (!this.position || !this.position.isVector3) {
            this.position = new THREE.Vector3();
            console.warn('[CAR] Initialized missing position as Vector3');
        }
        
        if (!this.previousPosition || !this.previousPosition.isVector3) {
            this.previousPosition = new THREE.Vector3();
            console.warn('[CAR] Initialized missing previousPosition as Vector3');
        }
        
        if (!this.direction || !this.direction.isVector3) {
            this.direction = new THREE.Vector3(0, 0, 1);
            console.warn('[CAR] Initialized missing direction as Vector3');
        }
        
        if (!this.bounceVelocity || !this.bounceVelocity.isVector3) {
            this.bounceVelocity = new THREE.Vector3();
            console.warn('[CAR] Initialized missing bounceVelocity as Vector3');
        }
        
        // Remote car update path
        if (this.isRemote) {
            // Ensure target position and previous target position are Vector3s
            if (!this.targetPosition || !this.targetPosition.isVector3) {
                this.targetPosition = new THREE.Vector3();
                console.warn('[CAR] Initialized missing targetPosition as Vector3');
            }
            
            if (!this.previousTargetPosition || !this.previousTargetPosition.isVector3) {
                this.previousTargetPosition = new THREE.Vector3();
                console.warn('[CAR] Initialized missing previousTargetPosition as Vector3');
            }
            
            if (!this.velocity || !this.velocity.isVector3) {
                this.velocity = new THREE.Vector3();
                console.warn('[CAR] Initialized missing velocity as Vector3');
            }
            
            // Check for packet loss (no updates for too long)
            const now = performance.now();
            const timeSinceLastUpdate = (now - this.lastUpdateTime) / 1000; // Convert to seconds
            
            // If we haven't received an update in a while, increase prediction strength
            if (this.maxExpectedInterval && timeSinceLastUpdate > this.maxExpectedInterval / 1000) {
                // Possible packet loss detected
                if (!this.consecutivePacketDrops) this.consecutivePacketDrops = 0;
                
                if (!this.lastPacketDropTime || now - this.lastPacketDropTime > this.maxExpectedInterval) {
                    // New drop after normal operation
                    this.consecutivePacketDrops = 1;
                } else {
                    // Consecutive drop
                    this.consecutivePacketDrops++;
                }
                this.lastPacketDropTime = now;
                
                
                // Use more prediction during packet loss
                this.predictionStrength = Math.min(0.9, 0.5 + (this.consecutivePacketDrops * 0.1));
            }
            
            // Interpolate remote car position and rotation
            if (this.interpolationFactor < 1) {
                this.interpolationFactor += delta / this.interpolationDuration;
                
                // Calculate estimated velocity based on position change
                if (this.interpolationFactor > 1) {
                    this.interpolationFactor = 1;
                    // Store current position as previous for next update
                    this.previousTargetPosition.copy(this.targetPosition);
                    this.previousTargetRotation = this.targetRotation;
                }

                try {
                    // Create a safe clone of target position
                    const safeTargetPosition = this.targetPosition.clone();
                    
                    // Create a safe velocity clone for prediction
                    const safeVelocity = this.velocity.clone();
                    
                    // Apply more prediction during packet loss
                    let predictionFactor = 1.0;
                    if (this.consecutivePacketDrops && this.consecutivePacketDrops > 0) {
                        predictionFactor = Math.min(2.0, 1.0 + (this.consecutivePacketDrops * 0.2));
                    }
                    
                    // Calculate prediction based on velocity and packet loss
                    const predictedPosition = safeTargetPosition.add(
                        safeVelocity.multiplyScalar(delta * predictionFactor * this.predictionStrength)
                    );

                    // Adaptive interpolation factor based on distance and packet loss
                    let adaptiveFactor = this.interpolationFactor;
                    const distance = this.position.distanceTo(predictedPosition);
                    
                    // Teleport on extremely large distances
                    if (distance > 10) {
                        console.log(`[CAR-REMOTE] Large position change detected (${distance.toFixed(2)} units), teleporting`);
                        this.position.copy(predictedPosition);
                        this.rotation = this.targetRotation;
                        this.updateVisuals();
                        return;
                    } 
                    // For large distances, move faster
                    else if (distance > 5) {
                        adaptiveFactor = Math.min(1, this.interpolationFactor * 3); 
                    }
                    
                    // Smooth interpolation with prediction and adaptive factor
                    this.position.lerpVectors(
                        this.previousTargetPosition,
                        predictedPosition,
                        adaptiveFactor
                    );
                } catch (error) {
                    console.error('[CAR] Error in remote car position interpolation:', error);
                    // Fallback to simple update if interpolation fails
                    if (this.targetPosition && this.targetPosition.isVector3) {
                        this.position.copy(this.targetPosition);
                    }
                }
                
                // Improved rotation interpolation with shortest path
                let rotationDiff = this.targetRotation - this.previousTargetRotation;
                // Ensure we take the shortest path around the circle
                if (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
                if (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
                
                this.rotation = this.previousTargetRotation + (rotationDiff * this.interpolationFactor);
                
                // Update direction based on interpolated rotation
                this.direction.x = Math.sin(this.rotation);
                this.direction.z = Math.cos(this.rotation);
            }
            
            this.updateVisuals();
            return;
        }
        
        // Handle spinning from banana collision
        if (this.isSpinning) {
            const now = performance.now();
            const elapsed = now - this.spinStartTime;
            const progress = Math.min(elapsed / this.spinDuration, 1.0);
            
            if (progress < 1) {
                // Update rotation based on spin progress
                this.rotation = this.spinStartRotation + (this.spinAmount * progress);
            } else {
                // Spin complete
                this.rotation = this.spinStartRotation + this.spinAmount;
                this.isSpinning = false;
            }
            
            // Update direction based on current rotation
            this.direction.x = Math.sin(this.rotation);
            this.direction.z = Math.cos(this.rotation);
        } else {
            // Normal update if not spinning
            // Store previous state for change detection
            const previousPosition = this.position.clone();
            const previousRotation = this.rotation;
            const previousSpeed = this.speed;

            // Store previous position for collision resolution
            this.previousPosition.copy(this.position);

            // Check if car is on a speed-reducing stripe
            if (this.track && typeof this.track.isCarOnSpeedStripe === 'function') {
                const isOnSpeedStripe = this.track.isCarOnSpeedStripe(this.position);
                
                // Set the slowdown flag for use in speed calculations
                if (isOnSpeedStripe && !this.isOnSpeedStripe) {
                    console.log('[CAR] Entered speed-reducing stripe');
                    this.isOnSpeedStripe = true;
                } else if (!isOnSpeedStripe && this.isOnSpeedStripe) {
                    console.log('[CAR] Exited speed-reducing stripe');
                    this.isOnSpeedStripe = false;
                }
            }

            // Update physics
            this.updateSpeed(delta);
            this.updateRotation(delta);
            this.updatePosition(delta);
            
            // Check for collision with track boundaries
            if (this.track.checkCollision(this.position)) {
                this.handleCollision();
            }
            
            // Update track progress if track is available
            if (this.track) {
                // Check lap progress with parameters
                this.track.checkLapProgress(this.position, this.direction);
            }

            // Notify of state change if needed
            this.notifyStateChangeIfNeeded(previousPosition, previousRotation, previousSpeed);
        }

        // Update exhaust cloud
        this.updateExhaustCloud(delta);
        
        // Always update visuals
        this.updateVisuals();
    }
    
    updateSpeed(delta) {
        // Calculate acceleration based on input
        const acceleration = this.calculateAcceleration();
        
        // Apply acceleration
        this.speed += acceleration * delta;
        
        // Clamp speed between max reverse and max forward
        this.speed = Math.max(-this.maxReverseSpeed, Math.min(this.speed, this.maxSpeed));
        
        // If speed is very close to zero, set it to exactly zero
        if (Math.abs(this.speed) < 0.1) {
            this.speed = 0;
        }
    }
    
    calculateAcceleration() {
        // Forward acceleration
        if (this.isAccelerating && !this.isReversing) {
            return this.speed < this.maxSpeed ? this.acceleration : 0;
        }
        
        // Reverse acceleration
        if (this.isReversing && !this.isAccelerating) {
            return this.speed > -this.maxReverseSpeed ? -this.reverseAcceleration : 0;
        }
        
        // Natural deceleration when no input
        if (Math.abs(this.speed) > 0) {
            return this.speed > 0 ? -this.deceleration : this.deceleration;
        }
        
        return 0;
    }
    
    updateRotation(delta) {
        if (this.speed === 0) {
            // Gradually reduce turn rate when not moving
            this.currentTurnRate *= this.turnSmoothing;
            return;
        }
        
        // Calculate target turn rate based on input
        const turnFactor = this.speed / this.maxSpeed; // Will be negative when reversing
        let targetTurnRate = 0;
        
        if (this.isTurningLeft) {
            targetTurnRate = this.turnSpeed * Math.sign(this.speed) * Math.abs(turnFactor);
        } else if (this.isTurningRight) {
            targetTurnRate = -this.turnSpeed * Math.sign(this.speed) * Math.abs(turnFactor);
        }
        
        // Smoothly interpolate between current and target turn rate
        this.currentTurnRate = this.currentTurnRate * this.turnSmoothing + 
                             targetTurnRate * (1 - this.turnSmoothing);
        
        // Apply the smoothed rotation
        this.rotation += this.currentTurnRate * delta;
        
        // Update direction vector
        this.direction.x = Math.sin(this.rotation);
        this.direction.z = Math.cos(this.rotation);
    }
    
    updatePosition(delta) {
        // Get final speed (including boost if active)
        const finalSpeed = this.getSpeed();
        
        // Update position with movement and bounce
        const movement = this.direction.clone().multiplyScalar(finalSpeed * delta);
        this.position.add(movement);
        this.position.add(this.bounceVelocity.clone().multiplyScalar(delta));
        
        // Apply bounce decay
        this.bounceVelocity.multiplyScalar(this.bounceDecay);
    }
    
    notifyStateChangeIfNeeded(previousPosition, previousRotation, previousSpeed) {
        if (!this._onStateChange) {
            return;
        }
        
        // Add thresholds to avoid triggering state changes for tiny movements
        const MIN_POSITION_CHANGE = 0.05; // 5cm minimum movement to trigger update
        const MIN_ROTATION_CHANGE = 0.01; // Small minimum rotation change
        const MIN_SPEED_CHANGE = 0.5; // 0.5 m/s minimum speed change
        
        // Check if position changed significantly
        const positionDelta = previousPosition.distanceTo(this.position);
        const positionChanged = positionDelta > MIN_POSITION_CHANGE;
        
        // Check if rotation changed significantly
        const rotationDelta = Math.abs(previousRotation - this.rotation);
        const rotationChanged = rotationDelta > MIN_ROTATION_CHANGE;
        
        // Check if speed changed significantly
        const speedDelta = Math.abs(previousSpeed - this.speed);
        const speedChanged = speedDelta > MIN_SPEED_CHANGE;
        
        // Debug logging to track state changes (1% of the time)
        if (Math.random() < 0.01) {
            console.debug('[CAR] State change check:', {
                carId: this.carInstanceId,
                positionChanged,
                positionDelta: positionDelta.toFixed(3),
                position: this.position.toArray().map(v => v.toFixed(2)),
                prevPosition: previousPosition.toArray().map(v => v.toFixed(2)),
                rotationChanged,
                rotationDelta: rotationDelta.toFixed(3),
                rotation: this.rotation.toFixed(2),
                prevRotation: previousRotation.toFixed(2),
                speedChanged,
                speedDelta: speedDelta.toFixed(2),
                speed: this.speed.toFixed(2),
                prevSpeed: previousSpeed.toFixed(2)
            });
        }
        
        if (positionChanged || rotationChanged || speedChanged) {
            this._onStateChange();
        }
    }
    
    updateVisuals() {
        if (!this.mesh) return;
        
        // Update the main car mesh
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;
        
        // Update wheels
        this.updateWheels();
        
        // Update name tag if it exists
        this.updateNameTag();
        
        // Force the mesh to update its matrix
        this.mesh.updateMatrix();
        this.mesh.updateMatrixWorld(true);
    }
    
    updateNameTag() {
        if (!this.nameTag) return;
        
        // Name tag position is relative to car mesh
        this.nameTag.position.set(0, 3, 0);
        
        // Make name tag always face the camera if available
        const camera = this.scene.getObjectByProperty('type', 'PerspectiveCamera');
        if (camera) {
            this.nameTag.lookAt(camera.position);
            // Ensure the name tag stays upright
            this.nameTag.rotation.x = 0;
            this.nameTag.rotation.z = 0;
        }
    }
    
    // NEW: Define reduceSpeedAfterCollision to handle speed reduction upon collision.
    reduceSpeedAfterCollision(isReversing) {
        if (isReversing) {
            // When reversing, stop completely.
            this.speed = 0;
        } else {
            // When going forward, reduce speed (e.g., keep 30% of current speed)
            this.speed *= 0.3;
        }
    }
    
    handleCollision() {
        // Compute the collision normal.
        // For a circular track (assumed center at (0,0,0)), the normal is the normalized position vector.
        // If the car is outside the track boundary, the normal points outward.
        // We then invert it so that the car is nudged back toward the track.
        let collisionNormal = this.position.clone().setY(0).normalize();
        if (this.position.length() > this.track.trackRadius) {
            collisionNormal.negate();
        }
        
        // Reposition the car slightly away from the wall
        const safeOffset = 0.5; // adjust as needed
        this.position.add(collisionNormal.clone().multiplyScalar(safeOffset));
        
        // Apply appropriate speed reduction
        this.reduceSpeedAfterCollision(this.isInReverse());
        
        // Apply bounce effect using the collision normal
        this.applyBounceEffect(collisionNormal);
        
        // Add visual and feedback effects
        this.showCollisionFeedback(this.speed);
    }
    
    applyBounceEffect(collisionNormal) {
        // Calculate a bounce factor based on current speed.
        const bounceSpeed = Math.abs(this.speed) / this.maxSpeed;
        const bounceFactor = this.bounceStrength * bounceSpeed * 0.5;
        
        // Use the collision normal for bounce direction.
        this.bounceVelocity.copy(collisionNormal.multiplyScalar(bounceFactor));
    }
    
    showCollisionFeedback(currentSpeed) {
        // Show collision notification
        this.showCollisionNotification(currentSpeed);
        
        // Add screen shake effect only for harder collisions
        if (Math.abs(currentSpeed) > 5) {
            this.shakeCamera();
        }
    }
    
    showCollisionNotification(speed) {
        // Check if enough time has passed since last collision
        const now = performance.now();
        if (now - this.lastCollisionTime < this.COLLISION_COOLDOWN) {
            return;  // Skip if we're still in cooldown
        }
        this.lastCollisionTime = now;

        // Get or create container (only create if we're actually showing a notification)
        let container = document.getElementById('collision-notifications');
        if (!container) {
            container = document.createElement('div');
            container.id = 'collision-notifications';
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.right = '20px';
            container.style.zIndex = '1000';
            document.body.appendChild(container);
        }

        // Remove any existing notifications
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '5px';
        notification.style.marginBottom = '10px';
        notification.style.fontFamily = 'Arial, sans-serif';
        notification.style.fontSize = '16px';
        notification.style.fontWeight = 'bold';
        notification.style.transition = 'opacity 0.5s';
        
        // Calculate impact force (simplified)
        const impact = Math.abs(speed);
        let message = 'Light bump!';
        if (impact > 20) {
            message = 'Heavy crash!';
        } else if (impact > 10) {
            message = 'Medium collision!';
        }
        
        notification.textContent = `${message} (${Math.round(impact * 3.6)} km/h)`; // Convert to km/h
        
        // Add to container
        container.appendChild(notification);
        
        // Fade out and remove after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                // Remove container if it's empty
                if (container.children.length === 0 && container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            }, 500);
        }, 2000);
    }
    
    shakeCamera() {
        // Implement camera shake effect
        const camera = this.scene.getObjectByProperty('type', 'PerspectiveCamera');
        if (camera) {
            const intensity = this.speed / this.maxSpeed;
            const shake = new THREE.Vector3(
                (Math.random() - 0.5) * intensity,
                (Math.random() - 0.5) * intensity,
                (Math.random() - 0.5) * intensity
            );
            camera.position.add(shake);
            
            // Reset camera position after shake
            setTimeout(() => {
                camera.position.sub(shake);
            }, 100);
        }
    }
    
    getPosition() {
        return this.mesh ? this.mesh.position : this.position;
    }
    
    getRotation() {
        return this.mesh ? this.mesh.rotation.y : this.rotation;
    }
    
    getDirection() {
        return this.direction;
    }
    
    getSpeed() {
        // Apply any active speed modifiers
        let finalSpeed = this.speed;
        
        // Apply boost if active
        if (this.speedBoostActive) {
            finalSpeed *= this.speedBoostFactor;
        }
        
        // Apply slowdown if on a speed-reducing stripe
        if (this.isOnSpeedStripe) {
            finalSpeed *= 0.5; // Reduce speed to 50% when on stripe
            
            // Visual indication - could add particles or other effects here
            if (this.exhaustCloud && Math.random() < 0.1) {
                // Increase exhaust smoke for visual feedback
                this.exhaustCloud.addParticle && this.exhaustCloud.addParticle();
            }
        }
        
        return finalSpeed;
    }
    
    // Add a method to get the absolute speed (for display purposes)
    getAbsoluteSpeed() {
        return Math.abs(this.getSpeed());
    }
    
    // Add a method to check if the car is in reverse
    isInReverse() {
        return this.speed < 0;
    }

    createPlayerNameTag() {
        if (!this.mesh) {
            console.error('Cannot create name tag - no car mesh');
            return;
        }

        // Create canvas for the name tag
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;

        // Set up the text style
        context.fillStyle = 'rgba(0, 0, 0, 0.6)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Draw text outline
        context.strokeStyle = '#000000';
        context.lineWidth = 4;
        context.strokeText(this.playerName, canvas.width/2, canvas.height/2);
        
        // Draw text
        context.fillStyle = '#ffffff';
        context.fillText(this.playerName, canvas.width/2, canvas.height/2);

        // Create texture and sprite
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        // Remove existing name tag if it exists
        if (this.nameTag) {
            this.mesh.remove(this.nameTag);
        }

        // Create new name tag
        this.nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
        this.nameTag.scale.set(2.5, 0.6, 1);
        this.nameTag.position.set(0, 3, 0);  // Position relative to car mesh
        
        // Add to car mesh
        this.mesh.add(this.nameTag);
        console.log('Name tag created and added to car mesh');
    }

    setPlayerName(name) {
        // Update the name
        this.playerName = name;
        
        // Only store in localStorage if this is a local player car (not AI or remote)
        if (!this.isRemote && !this.isAI) {
            localStorage.setItem('playerName', name);
            console.log(`[CAR] Updated localStorage player name to: ${name}`);
        }
        
        // Update the name tag visual
        if (this.nameTag && this.mesh) {
            this.mesh.remove(this.nameTag);
            this.createPlayerNameTag();
        }
    }

    async init() {
        // Only initialize if not already initialized
        if (this.initialized) {
            console.log(`[CAR-TRACKING] Car ${this.carInstanceId} already initialized`);
            return this;
        }
        
        console.log(`[CAR-TRACKING] Initializing car ${this.carInstanceId}`);
        
        // Track time for performance measuring
        const startTime = performance.now();
        
        try {
            // Initialize the car's visual components if not already created
            if (!this.mesh && this.scene) {
                await this.createCar();
                this.createPlayerNameTag();
            }
            
            const endTime = performance.now();
            console.log(`[CAR-TRACKING] Car ${this.carInstanceId} initialized in ${(endTime - startTime).toFixed(2)}ms`);
            
            this.initialized = true;
            return this;
        } catch (error) {
            console.error(`[CAR-TRACKING] Error initializing car ${this.carInstanceId}:`, error);
            throw error;
        }
    }

    updateWheels() {
        if (!this.wheels || this.wheels.length === 0) return;
        
        const speed = this.isInReverse() ? -this.speed : this.speed;
        const rotationSpeed = speed / this.wheelRadius;

        // Front wheels
        if (this.wheels[0] && this.wheels[1]) {
            const steeringAngle = this.isTurningLeft ? Math.PI / 8 : 
                                 this.isTurningRight ? -Math.PI / 8 : 0;
            
            // Apply steering to front wheels
            this.wheels[0].rotation.y = steeringAngle;
            this.wheels[1].rotation.y = steeringAngle;
            
            // Apply rotation based on speed
            this.wheels[0].rotation.x += rotationSpeed * 0.01;
            this.wheels[1].rotation.x += rotationSpeed * 0.01;
        }
        
        // Rear wheels - just rotate based on speed, no steering
        if (this.wheels[2] && this.wheels[3]) {
            this.wheels[2].rotation.x += rotationSpeed * 0.01;
            this.wheels[3].rotation.x += rotationSpeed * 0.01;
        }
        
        // Update boost particles if they exist
        if (this.boostParticles) {
            this.boostParticles.rotation.y += 0.02; // Constant rotation for visual effect
        }
    }

    async loadModel() {
        return new Promise((resolve) => {
            // Create the car based on type
            if (this.carType === 'tesla') {
                this.createTeslaModel();
            } else {
                this.createClassicModel();
            }
            resolve();
        });
    }

    initPhysics() {
        // Initialize physics properties
        this.velocity = new THREE.Vector3();
        this.acceleration = new THREE.Vector3();
        this.angularVelocity = 0;
        this.mass = 1000; // kg
        this.inertia = 1500; // kg*m^2
        this.wheelbase = 2.5; // meters
        this.trackWidth = 1.5; // meters
    }

    applySpeedBoost() {
        if (this.speedBoostActive) {
            // If already active, extend duration
            this.extendSpeedBoost();
        } else {
            // Activate new speed boost
            this.activateSpeedBoost();
        }
    }
    
    activateSpeedBoost() {
        // Clear any existing boost first
        this.deactivateSpeedBoost();
        
        // Apply boost effect
        this.speedBoostActive = true;
        this.speedBoostFactor = 1.41; // Increases speed to approximately 280 km/h from 199 km/h
        
        // Show visual boost effects
        this.showBoostEffect();
        this.showSpeedBoostIndicator();
        
        // Auto-deactivate after duration
        const self = this;
        this.speedBoostTimeout = setTimeout(() => {
            this.deactivateSpeedBoost();
        }, this.speedBoostDuration);
    }
    
    extendSpeedBoost() {
        // Clear existing timeout
        if (this.speedBoostTimeout) {
            clearTimeout(this.speedBoostTimeout);
        }
        
        // Set new timeout for full duration
        const self = this; // Store reference to this for use in timeout function
        this.speedBoostTimeout = setTimeout(function() {
            self.deactivateSpeedBoost();
        }, this.speedBoostDuration);
    }
    
    deactivateSpeedBoost() {
        this.speedBoostActive = false;
        this.speedBoostFactor = 1.0;
        
        // Hide visual effects
        this.hideBoostEffect();
        this.hideSpeedBoostIndicator();
        
        // Clear the timeout and reference
        if (this.speedBoostTimeout) {
            clearTimeout(this.speedBoostTimeout);
            this.speedBoostTimeout = null;
        }
    }

    hideBoostEffect() {
        // Remove all boost particles
        if (this.boostParticles) {
            // First remove from car mesh if it's a child
            if (this.mesh && this.boostParticles.parent === this.mesh) {
                this.mesh.remove(this.boostParticles);
            }
            // Then remove from scene if it was added directly
            else if (this.scene && this.boostParticles.parent === this.scene) {
                this.scene.remove(this.boostParticles);
            }
            
            // Clean up geometry and material
            if (this.boostParticles.geometry) {
                this.boostParticles.geometry.dispose();
            }
            if (this.boostParticles.material) {
                this.boostParticles.material.dispose();
            }
            
            // Clear the reference
            this.boostParticles = null;
        }
    }

    showSpeedBoostIndicator() {
        if (this.isRemote) return;
        const indicator = document.getElementById('speed-boost-indicator');
        if (indicator) {
            indicator.style.opacity = '1';
        }
    }

    hideSpeedBoostIndicator() {
        if (this.isRemote) return;
        const indicator = document.getElementById('speed-boost-indicator');
        if (indicator) {
            indicator.style.opacity = '0';
        }
    }

    showBoostEffect() {
        if (!this.mesh) return;

        // Clean up any existing boost effect first
        this.hideBoostEffect();

        // Create particle effect for speed boost
        const particleCount = 50;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 2;
            positions[i + 1] = (Math.random() - 0.5) * 2;
            positions[i + 2] = -2 - Math.random() * 2;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0x00ff00,
            size: 0.1,
            transparent: true,
            opacity: 0.6
        });

        this.boostParticles = new THREE.Points(geometry, material);
        this.mesh.add(this.boostParticles);
    }

    updateRemoteState(position, rotation) {
        const now = performance.now();
        const timeDelta = (now - this.lastUpdateTime) / 1000; // Convert to seconds
        
        // Store previous values for velocity calculation
        const hadPreviousUpdate = this.receivedUpdates > 0;
        const prevPosition = this.targetPosition.clone();
        
        // Reset packet drop counters since we received an update
        if (this.consecutivePacketDrops && this.consecutivePacketDrops > 0) {
            this.consecutivePacketDrops = 0;
        }
        
        // Store previous state
        this.previousTargetPosition.copy(this.position);
        this.previousTargetRotation = this.rotation;
        
        // Update targets
        this.targetPosition.copy(position);
        this.targetRotation = rotation;
        this.lastUpdateTime = now;
        
        // Track received updates count
        if (!this.receivedUpdates) this.receivedUpdates = 0;
        this.receivedUpdates++;
        
        // Calculate velocity based on position change
        if (timeDelta > 0 && hadPreviousUpdate) {
            // Calculate instantaneous velocity
            const instantVelocity = new THREE.Vector3().subVectors(position, prevPosition).divideScalar(timeDelta);
            
            // Calculate current velocity magnitude
            const currentSpeed = this.velocity.length();
            const newSpeed = instantVelocity.length();
            
            // Check for sudden large velocity changes that might indicate network issues
            if (currentSpeed > 0.5 && newSpeed > 0.5) {
                // Compare velocity directions to detect sudden changes
                const currentDir = this.velocity.clone().normalize();
                const newDir = instantVelocity.clone().normalize();
                const directionChange = currentDir.dot(newDir);
                
                // If direction changed significantly (more than ~90 degrees), adapt faster
                if (directionChange < 0.5) {
                    // Direction change detected, smooth less (adapt more quickly)
                    this.velocity.lerp(instantVelocity, 0.9);
                } else {
                    // Normal smoothing
                    this.velocity.lerp(instantVelocity, 0.8);
                }
            } else {
                // Low speed or first update, just use the new velocity
                this.velocity.lerp(instantVelocity, 0.8);
            }
            
            this.estimatedSpeed = this.velocity.length();
            
            // Update the network jitter measurement
            if (!this.updateIntervals) this.updateIntervals = [];
            this.updateIntervals.push(timeDelta * 1000); // Store in milliseconds
            if (this.updateIntervals.length > 10) this.updateIntervals.shift();
            
            // Periodically calibrate network parameters
            if (this.receivedUpdates % 20 === 0) {
                this.calibrateNetworkParameters();
            }
        }
        
        // Reset interpolation
        this.interpolationFactor = 0;
        
        // Log significant movements for debugging
        if (this.previousTargetPosition.distanceTo(position) > 3) {
            console.debug(`[CAR-REMOTE] Significant movement detected:`, {
                distance: this.previousTargetPosition.distanceTo(position).toFixed(2),
                speed: this.estimatedSpeed.toFixed(2),
                timeDelta: timeDelta.toFixed(3)
            });
        }
    }
    
    // New method to calibrate prediction parameters based on network conditions
    calibrateNetworkParameters() {
        if (!this.isRemote || !this.updateIntervals || this.updateIntervals.length < 3) return;
        
        // Calculate average update interval and jitter
        const avgInterval = this.updateIntervals.reduce((sum, val) => sum + val, 0) / this.updateIntervals.length;
        
        // Calculate jitter (standard deviation of intervals)
        const jitter = Math.sqrt(
            this.updateIntervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) 
            / this.updateIntervals.length
        );
        
        // Update maxExpectedInterval based on observed network conditions
        this.maxExpectedInterval = Math.max(150, avgInterval * 1.5 + jitter);
        
        // Calculate jitter factor - higher means more unstable network
        const jitterFactor = jitter / avgInterval;
        
        // Adjust interpolation parameters based on network quality
        if (jitterFactor > 0.5) {
            // High jitter - slower interpolation for smoother movement
            this.interpolationDuration = 0.08;
            this.predictionStrength = 0.6;
        } else if (jitterFactor > 0.2) {
            // Medium jitter
            this.interpolationDuration = 0.06;
            this.predictionStrength = 0.5;
        } else {
            // Low jitter - faster interpolation for responsiveness
            this.interpolationDuration = 0.04;
            this.predictionStrength = 0.4;
        }
        
        // Only log when values change significantly
        if (this.receivedUpdates % 100 === 0) {
            console.log(`[CAR-REMOTE] Network stats: avgInterval=${avgInterval.toFixed(0)}ms, jitter=${jitter.toFixed(0)}ms, jitterFactor=${jitterFactor.toFixed(2)}`);
            console.log(`[CAR-REMOTE] Prediction parameters: strength=${this.predictionStrength.toFixed(2)}, interpolationDuration=${this.interpolationDuration.toFixed(3)}s`);
        }
    }

    async createF1Model() {
        if (!this.f1Model) {
            // Load materials first
            const mtlLoader = new MTLLoader();
            const textureLoader = new THREE.TextureLoader();
            
            try {
                // First load all textures
                const [diffuseMap, normalMap, specularMap] = await Promise.all([
                    new Promise((resolve) => textureLoader.load('/models/f1/textures/formula1_DefaultMaterial_Diffuse.png', resolve)),
                    new Promise((resolve) => textureLoader.load('/models/f1/textures/formula1_DefaultMaterial_Normal.png', resolve)),
                    new Promise((resolve) => textureLoader.load('/models/f1/textures/formula1_DefaultMaterial_Specular.png', resolve))
                ]);

                // Load materials
                this.f1Materials = await new Promise((resolve, reject) => {
                    mtlLoader.setPath('/models/f1/');
                    mtlLoader.load(
                        'f1.mtl',
                        (materials) => {
                            materials.preload();
                            // Apply textures to materials
                            Object.values(materials.materials).forEach(material => {
                                material.map = diffuseMap;
                                material.normalMap = normalMap;
                                material.specularMap = specularMap;
                            });
                            resolve(materials);
                        },
                        undefined,
                        reject
                    );
                });
                
                // Load the model
                const objLoader = new OBJLoader();
                objLoader.setMaterials(this.f1Materials);
                objLoader.setPath('/models/f1/');
                
                this.f1Model = await new Promise((resolve, reject) => {
                    objLoader.load(
                        'f1.obj',
                        resolve,
                        undefined,
                        reject
                    );
                });
            } catch (error) {
                console.error('Error loading F1 model:', error);
                // Fallback to classic model if loading fails
                this.createClassicModel();
                return;
            }
        }

        // Clone the loaded model for this instance
        this.mesh = this.f1Model.clone();
        
        // Scale and position adjustments for F1
        this.mesh.scale.set(0.015, 0.015, 0.015); // Reduced scale for better size
        
        // Create a container group for the F1 model
        const f1Group = new THREE.Group();
        f1Group.add(this.mesh);
        
        // Apply initial rotation to the model inside the group
        this.mesh.rotation.y = Math.PI/2; // Rotate to face away from player
        
        // Set the group as our main mesh
        this.mesh = f1Group;
        
        // Add shadow casting
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Store reference to car instance
        this.mesh.userData.car = this;
    }

    // Add methods for item handling
    pickupItem() {
        // The item type is already determined by the server and handled in ItemManager's checkCollisions
        if (this.currentItem) {
            this.showItemIndicator();
        }
    }

    useItem() {
        console.log('[CAR] Using item:', this.currentItem);
        if (!this.currentItem) return;

        if (this.currentItem === 'speedBoost') {
            this.applySpeedBoost();
        } else if (this.currentItem === 'banana') {
            if (this.itemManager) {
                console.log('[CAR] Throwing banana through ItemManager');
                this.itemManager.throwBanana(this);
            } else {
                console.warn('[CAR] Could not find ItemManager to throw banana');
            }
        } else if (this.currentItem === 'shell') {
            if (this.itemManager) {
                console.log('[CAR] Throwing shell through ItemManager');
                this.itemManager.throwShell(this);
            } else {
                console.warn('[CAR] Could not find ItemManager to throw shell');
            }
        }

        this.currentItem = null;
        this.hideItemIndicator();
    }

    showItemIndicator() {
        if (this.isRemote) return;
        
        // First, add responsive styles if they don't exist yet
        this.addItemIndicatorStyles();
        
        // Create or update item indicator
        let indicator = document.getElementById('item-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'item-indicator';
            indicator.style.position = 'fixed';
            
            // Position higher on mobile devices to avoid overlap with drive button
            const isMobile = this.isMobile();
            indicator.style.bottom = isMobile ? '350px' : '200px'; // Increased from 280px to 350px on mobile
            
            indicator.style.right = '20px';
            indicator.style.width = '60px';
            indicator.style.height = '60px';
            indicator.style.borderRadius = '50%';
            indicator.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            indicator.style.color = '#000';
            indicator.style.fontSize = '30px';
            indicator.style.display = 'flex';
            indicator.style.justifyContent = 'center';
            indicator.style.alignItems = 'center';
            indicator.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
            indicator.style.transition = 'transform 0.2s ease-in-out';
            indicator.style.zIndex = '1000'; // Ensure it appears above other elements
            
            // Add a label only for desktop
            if (!this.isMobile()) {
                const label = document.createElement('div');
                label.id = 'item-indicator-label';
                label.style.position = 'fixed';
                label.style.bottom = '180px';
                label.style.right = '20px';
                label.style.width = '60px';
                label.style.textAlign = 'center';
                label.style.color = 'white';
                label.style.fontSize = '12px';
                label.style.fontFamily = 'Arial, sans-serif';
                label.textContent = 'Space/E';
                document.body.appendChild(label);
            }
            
            document.body.appendChild(indicator);
        } else {
            // Update position in case device orientation changed
            indicator.style.bottom = this.isMobile() ? '350px' : '200px';
        }

        // Set content based on item type
        if (this.currentItem === 'banana') {
            indicator.textContent = '🍌';
            indicator.style.backgroundColor = 'rgba(255, 255, 0, 0.8)';
        } else if (this.currentItem === 'shell') {
            indicator.textContent = '🐢';  // Shell emoji
            indicator.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';  // Red background
        } else {
            indicator.textContent = '⚡';
            indicator.style.backgroundColor = 'rgba(0, 255, 0, 0.8)';
        }
        
        // Add a pulsing animation
        const pulse = () => {
            indicator.style.transform = 'scale(1.1)';
            setTimeout(() => {
                indicator.style.transform = 'scale(1)';
            }, 500);
        };
        
        pulse();
        this.pulseInterval = setInterval(pulse, 1000);
        
        indicator.style.display = 'flex';
        const label = document.getElementById('item-indicator-label');
        if (label) label.style.display = this.isMobile() ? 'none' : 'block';
    }

    // Add responsive styles for the item indicator
    addItemIndicatorStyles() {
        // Check if styles already exist
        if (document.getElementById('item-indicator-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'item-indicator-styles';
        style.textContent = `
            /* Responsive styles for the item indicator */
            @media (max-width: 768px) {
                #item-indicator {
                    bottom: 350px !important; /* Much higher position to avoid all buttons */
                }
                
                /* Landscape mode needs different positioning */
                @media (orientation: landscape) {
                    #item-indicator {
                        bottom: auto !important; 
                        top: 20px !important;
                        right: 20px !important;
                        width: 50px !important;
                        height: 50px !important;
                        font-size: 24px !important;
                    }
                }
                
                /* Small screens need smaller indicator */
                @media (max-width: 360px) {
                    #item-indicator {
                        width: 50px !important;
                        height: 50px !important;
                        font-size: 24px !important;
                    }
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    hideItemIndicator() {
        const indicator = document.getElementById('item-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
        
        const label = document.getElementById('item-indicator-label');
        if (label) {
            label.style.display = 'none';
        }
        
        if (this.pulseInterval) {
            clearInterval(this.pulseInterval);
            this.pulseInterval = null;
        }
    }

    // Add helper method to check if on mobile
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Set the car's position
     * @param {THREE.Vector3} position - New position for the car
     */
    setPosition(position) {
        this.position.copy(position);
        this.previousPosition = this.position.clone();
        this.mesh.position.copy(this.position);
        
        console.log(`Car position set to: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`);
    }
    
    /**
     * Set the car's rotation
     * @param {number} rotationY - Y rotation in radians
     */
    setRotation(rotationY) {
        this.rotation = rotationY;
        this.mesh.rotation.y = rotationY;
        
        // Update direction vector based on rotation
        this.direction.set(
            Math.sin(this.rotation),
            0,
            Math.cos(this.rotation)
        );
        
        console.log(`Car rotation set to: ${rotationY.toFixed(2)} radians`);
    }
    
    /**
     * Reset the car to default state
     */
    reset() {
        this.speed = 0;
        this.acceleration = 0;
        this.isBraking = false;
        this.isAccelerating = false;
        this.isReversing = false;
        this.isSteering = false;
        this.steeringAngle = 0;
        this.isColliding = false;
        
        console.log('Car reset to default state');
    }

    // Add a debug method to the Car prototype to track onStateChange setting
    set onStateChange(callback) {
        console.debug(`[CAR] Setting onStateChange for car ${this.carInstanceId}`);
        
        // Wrap the callback to add stack trace for debugging
        if (callback) {
            const originalCallback = callback;
            this._onStateChange = () => {
                console.debug(`[CAR-TRACE] State change handler called for car ${this.carInstanceId}`);
                // Add stack trace every 10th call
                if (Math.random() < 0.1) {
                    console.debug("[CAR-TRACE] State change stack trace:");
                    console.trace();
                }
                return originalCallback();
            };
        } else {
            this._onStateChange = callback;
        }
    }
    
    get onStateChange() {
        return this._onStateChange;
    }
    
    // Add a debug method to help track state changes
    debugStateChanges() {
        // Log current state
        console.log(`[CAR-DEBUG] Current state for car ${this.carInstanceId}:`);
        console.log(`- Position: (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)})`);
        console.log(`- Rotation: ${this.rotation.toFixed(2)}`);
        console.log(`- Speed: ${this.speed.toFixed(2)}`);
        console.log(`- Has onStateChange handler: ${!!this._onStateChange}`);
        console.log(`- Is remote: ${this.isRemote}`);
        
        // Monitor for changes over the next 5 seconds
        let changeCount = 0;
        const startTime = Date.now();
        
        // Backup original handler
        const originalHandler = this._onStateChange;
        
        // Replace handler with monitored version
        this._onStateChange = () => {
            changeCount++;
            console.log(`[CAR-DEBUG] State change #${changeCount} at ${(Date.now() - startTime)}ms`);
            if (originalHandler) {
                originalHandler();
            }
        };
        
        // Restore original handler after 5 seconds
        setTimeout(() => {
            this._onStateChange = originalHandler;
            console.log(`[CAR-DEBUG] State change monitoring complete - ${changeCount} changes in 5 seconds`);
        }, 5000);
        
        return `Monitoring state changes for 5 seconds...`;
    }

    throwBanana() {
        if (!this.mesh) return;

        console.log('[CAR] Throwing banana');

        // Create banana model - a more realistic banana shape
        const bananaGroup = new THREE.Group();
        
        // Main banana body
        const bananaGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8);
        bananaGeometry.translate(0, 0, 0);
        
        // Bend the cylinder to create banana curve
        const vertices = bananaGeometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i);
            const y = vertices.getY(i);
            const z = vertices.getZ(i);
            
            // Apply a curve to make it banana-shaped
            const bendAmount = 0.3;
            const newZ = z - Math.pow(y, 2) * bendAmount;
            vertices.setZ(i, newZ);
        }
        
        const bananaMaterial = new THREE.MeshPhongMaterial({
            color: 0xFFD700,
            shininess: 50,
            specular: 0x111111
        });
        const bananaBody = new THREE.Mesh(bananaGeometry, bananaMaterial);
        bananaBody.rotation.x = Math.PI / 2; // Rotate to proper orientation
        bananaGroup.add(bananaBody);
        
        // Position banana behind the car
        const behindCar = this.direction.clone().multiplyScalar(-2);
        bananaGroup.position.copy(this.position).add(behindCar);
        bananaGroup.position.y = 0.3; // Slightly above ground
        
        // Add to scene and track
        this.scene.add(bananaGroup);
        this.bananas.push({
            mesh: bananaGroup,
            position: bananaGroup.position.clone()
        });

        // Broadcast the throw if in multiplayer
        if (this.game && this.game.multiplayer) {
            console.log('[CAR] Broadcasting banana throw');
            const throwVelocity = this.direction.clone().negate().multiplyScalar(10);
            this.game.multiplayer.broadcastThrownBanana(
                bananaGroup.position,
                bananaGroup.rotation.y,
                throwVelocity
            );
        }
        
        // Remove banana after 30 seconds
        setTimeout(() => {
            const index = this.bananas.findIndex(b => b.mesh === bananaGroup);
            if (index !== -1) {
                this.scene.remove(bananaGroup);
                this.bananas.splice(index, 1);
                bananaBody.geometry.dispose();
                bananaBody.material.dispose();
            }
        }, 30000);
    }

    updateExhaustCloud(delta) {
        // Create exhaust cloud if it doesn't exist
        if (!this.exhaustCloud) {
            this.exhaustCloud = new THREE.Group();
            this.scene.add(this.exhaustCloud);
        }
        
        // Position the exhaust cloud lower and further behind the car
        const behindCar = new THREE.Vector3(
            -Math.sin(this.rotation) * 2.5,
            0,
            -Math.cos(this.rotation) * 2.5
        );
        
        const exhaustPosition = this.position.clone().add(behindCar);
        exhaustPosition.y += 0.3; // Even closer to the ground
        this.exhaustCloud.position.copy(exhaustPosition);
        
        // Check if it's time to emit new particles
        const now = Date.now();
        
        // Different behavior for speed boost
        if (this.speedBoostActive) {
            // More frequent emissions during speed boost
            const boostEmitInterval = this.exhaustEmitInterval / 3;
            
            if (now - this.exhaustLastEmit > boostEmitInterval) {
                // More particles during boost
                const particleCount = 2 + Math.floor(Math.random() * 3);
                
                for (let i = 0; i < particleCount; i++) {
                    this.emitBoostExhaustParticle();
                }
                this.exhaustLastEmit = now;
            }
        } else {
            // Normal emission logic
            if (now - this.exhaustLastEmit > this.exhaustEmitInterval && 
                (Math.abs(this.speed) > 5 || this.isAccelerating)) { // Higher speed threshold
                // Just 1 particle most of the time, occasional 2nd particle at high speeds
                const particleCount = Math.random() < 0.7 ? 1 : 1 + Math.floor(Math.min(Math.abs(this.speed) / 30, 1));
                
                for (let i = 0; i < particleCount; i++) {
                    this.emitExhaustParticle();
                }
                this.exhaustLastEmit = now;
            }
        }
        
        // Update existing particles
        for (let i = this.exhaustParticles.length - 1; i >= 0; i--) {
            const particle = this.exhaustParticles[i];
            const age = now - particle.userData.creationTime;
            const progress = age / particle.userData.lifetime;
            
            if (progress >= 1) {
                // Remove expired particles
                this.exhaustCloud.remove(particle);
                this.exhaustParticles.splice(i, 1);
                particle.material.dispose();
            } else {
                // Update particle position
                particle.position.add(particle.userData.velocity);
                
                // Gradually increase scale with more horizontal spread
                const scaleX = particle.userData.initialScale + 
                             (particle.userData.finalScaleX - particle.userData.initialScale) * progress;
                const scaleY = particle.userData.initialScale + 
                             (particle.userData.finalScaleY - particle.userData.initialScale) * progress;
                
                particle.scale.set(scaleX, scaleY, 1);
                
                // Fade out opacity faster
                particle.material.opacity = particle.userData.initialOpacity * (1 - (progress * progress * 1.5));
                
                // Color transition for boost particles
                if (particle.userData.isBoostParticle) {
                    // Transition from orange to red (less bright, more fire-like)
                    const color = new THREE.Color();
                    if (progress < 0.3) {
                        // Start with darker orange (no white/yellow)
                        color.setRGB(0.8, 0.3, 0.1);
                    } else if (progress < 0.6) {
                        // Transition to deeper orange-red
                        color.setRGB(0.8 - (progress - 0.3), 0.3 - (progress - 0.3) * 0.5, 0.1);
                    } else {
                        // Fade to darker red
                        color.setRGB(0.6 - (progress - 0.6) * 0.6, 0.15 - (progress - 0.6) * 0.15, 0);
                    }
                    particle.material.color.copy(color);
                }
            }
        }
    }
    
    // New method for boost exhaust particles
    emitBoostExhaustParticle() {
        // Create sprite material with our texture but with appropriate colors for fire
        const spriteMaterial = new THREE.SpriteMaterial({
            map: this.smokeTexture,
            transparent: true,
            opacity: 0.7, // Slightly lower opacity
            color: 0xcc3300, // Deeper orange-red, less bright
            blending: THREE.AdditiveBlending // Add additive blending for glow effect
        });
        
        // Create the sprite
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Slightly larger scale for boost particles
        const initialScale = 0.6 + Math.random() * 0.4;
        sprite.scale.set(initialScale, initialScale, initialScale);
        
        // More focused positioning with slight randomness
        sprite.position.set(
            (Math.random() - 0.5) * 0.3, // Tighter horizontal spread
            Math.random() * 0.1,         // Very low height variation
            (Math.random() - 0.5) * 0.3  // Tighter horizontal spread
        );
        
        // Store particle properties for animation
        sprite.userData = {
            creationTime: Date.now(),
            lifetime: this.exhaustParticleLifetime * 0.7, // Shorter lifetime
            initialScale: initialScale,
            finalScaleX: initialScale * 3 + Math.random(), // More horizontal stretch
            finalScaleY: initialScale * 2 + Math.random(), // More vertical growth too
            initialOpacity: 0.7 + Math.random() * 0.2, // Slightly lower initial opacity
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.03,        // Slight horizontal drift
                0.005 + Math.random() * 0.01,        // More upward movement
                -0.02 - Math.random() * 0.03         // More backward movement
            ),
            isBoostParticle: true // Flag to identify boost particles
        };
        
        // Set initial opacity
        sprite.material.opacity = sprite.userData.initialOpacity;
        
        // Add to exhaust cloud and tracking array
        this.exhaustCloud.add(sprite);
        this.exhaustParticles.push(sprite);
    }
    
    emitExhaustParticle() {
        // Create sprite material with our texture
        const spriteMaterial = new THREE.SpriteMaterial({
            map: this.smokeTexture,
            transparent: true,
            opacity: 0.4, // Much lower opacity
            color: 0xcccccc // Even lighter gray
        });
        
        // Create the sprite
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Even smaller initial scale
        const initialScale = 0.4 + Math.random() * 0.3;
        sprite.scale.set(initialScale, initialScale, initialScale);
        
        // Add some random offset - more horizontal, less vertical
        sprite.position.set(
            (Math.random() - 0.5) * 0.4, // Less horizontal spread
            Math.random() * 0.15,        // Even less height variation
            (Math.random() - 0.5) * 0.4  // Less horizontal spread
        );
        
        // Store particle properties for animation
        sprite.userData = {
            creationTime: Date.now(),
            lifetime: this.exhaustParticleLifetime + Math.random() * 200,
            initialScale: initialScale,
            finalScaleX: initialScale * 2.5 + Math.random(), // Less horizontal growth
            finalScaleY: initialScale * 1.2 + Math.random(), // Minimal vertical growth
            initialOpacity: 0.35 + Math.random() * 0.15, // Very low opacity
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.02,          // Less horizontal drift
                0.002 + Math.random() * 0.005,         // Almost no upward movement
                -0.008 - Math.random() * 0.012         // Less backward drift
            )
        };
        
        // Set initial opacity
        sprite.material.opacity = sprite.userData.initialOpacity;
        
        // Add to exhaust cloud and tracking array
        this.exhaustCloud.add(sprite);
        this.exhaustParticles.push(sprite);
    }

    disableControls() {
        this.controlsEnabled = false;
        // Reset all movement
        this.throttle = 0;
        this.brake = 0;
        this.steering = 0;
        this.speed = 0;
        this.velocity.set(0, 0, 0);
    }

    enableControls() {
        this.controlsEnabled = true;
    }
}

