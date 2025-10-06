import * as THREE from 'three';
import { SpeedBoost } from './SpeedBoost.js';
import { BananaItem } from './BananaItem.js';
import { ShellItem } from './ShellItem.js';

export class ItemManager {
    constructor(scene, track, multiplayer = null) {
        console.log('[ITEMS] Constructing ItemManager');
        if (!scene) {
            console.error('[ITEMS] No scene provided to ItemManager!');
            return;
        }
        this.scene = scene;
        this.track = track;
        this.multiplayer = multiplayer;
        this.items = new Map(); // Map of itemId -> item instance
        this.localCar = null; // Store reference to local car
        this.thrownShells = []; // Initialize array for thrown shells
        
        console.log('[ITEMS] ItemManager initialized with multiplayer:', !!multiplayer);
        
        if (this.multiplayer) {
            this.setupNetworkHandlers();
        }
    }

    setupNetworkHandlers() {
        console.log('[ITEMS] Setting up network handlers');
        
        // Handle new items spawned by server
        this.multiplayer.socket.on('item-spawned', (itemData) => {
            console.log('[ITEMS] Received new item from server:', itemData);
            
            // Add debug data about socket
            console.log(`[ITEMS] Socket ID: ${this.multiplayer.socket.id}, connected: ${this.multiplayer.socket.connected}`);
            
            // Only spawn if we don't already have this item
            if (!this.items.has(itemData.id)) {
                this.handleNewItem(itemData);
            } else {
                console.log(`[ITEMS] Item ${itemData.id} already exists, not spawning again`);
            }
        });

        // Handle item collection by other players
        this.multiplayer.socket.on('item-collected', ({ itemId, collectedBy }) => {
            console.log('[ITEMS] Item collected by another player:', { itemId, collectedBy });
            this.removeItem(itemId);
        });

        // Handle banana collisions from other players
        this.multiplayer.socket.on('banana-collision', (data) => {
            console.log('[ITEMS] Received banana collision event:', data);
            const { bananaPosition } = data;
            
            // Find and remove the banana that was hit
            if (this.bananas) {
                for (let i = this.bananas.length - 1; i >= 0; i--) {
                    const banana = this.bananas[i];
                    const pos = banana.position;
                    
                    // Compare positions (with some tolerance for floating point differences)
                    if (Math.abs(pos.x - bananaPosition[0]) < 0.1 && 
                        Math.abs(pos.z - bananaPosition[2]) < 0.1) {
                        
                        // Remove the banana
                        if (banana.mesh) {
                            this.scene.remove(banana.mesh);
                            banana.mesh.traverse((child) => {
                                if (child.isMesh) {
                                    if (child.geometry) child.geometry.dispose();
                                    if (child.material) {
                                        if (Array.isArray(child.material)) {
                                            child.material.forEach(material => material.dispose());
                                        } else {
                                            child.material.dispose();
                                        }
                                    }
                                }
                            });
                        }
                        this.bananas.splice(i, 1);
                        console.log('[ITEMS] Removed collided banana');
                        break;
                    }
                }
            }
        });
    }

    /**
     * Enhance the visibility of an item by adding effects
     * @param {Object} item - The item to enhance
     * @param {number} color - The color to use for the particle effect
     */
    enhanceItemVisibility(item, color) {
        if (!item || !item.mesh) return;
        
        // Make the item larger
        item.mesh.scale.set(2, 2, 2);
        
        // Add a subtle point light
        const light = new THREE.PointLight(color, 0.5, 10);
        light.position.copy(item.mesh.position);
        item.light = light;
        this.scene.add(light);
        
        // Increase the glow effect
        if (item.mesh.material) {
            item.mesh.material.emissiveIntensity = 0.8;
        }
        
        console.log('[ITEMS] Enhanced visibility for item:', item.id);
    }

    removeItem(item) {
        if (!item) return;

        console.log('[ITEMS] Removing item:', item.id);

        // Remove the mesh from the scene
        if (item.mesh) {
            this.scene.remove(item.mesh);
            if (item.mesh.geometry) item.mesh.geometry.dispose();
            if (item.mesh.material) item.mesh.material.dispose();
            
            // Remove debug sphere if it exists
            if (item.mesh.debugSphere) {
                this.scene.remove(item.mesh.debugSphere);
                if (item.mesh.debugSphere.geometry) item.mesh.debugSphere.geometry.dispose();
                if (item.mesh.debugSphere.material) item.mesh.debugSphere.material.dispose();
            }
        }

        // Remove from items map
        this.items.delete(item.id);
    }

    update(deltaTime) {
        // Update existing items
        this.items.forEach((item, id) => {
            if (!item.update) {
                item.update = (deltaTime) => this.updateItem(id, deltaTime);
            }
            item.update(deltaTime);
        });

        if (this.localCar) {
            this.checkBananaCollisions(this.localCar);
            // Use the original methods
            this.updateShells(deltaTime);
            this.checkShellCollisions();
        }
    }

    updateItem(itemId, deltaTime) {
        const item = this.items.get(itemId);
        if (!item || !item.mesh) return;

        // Hover animation
        const time = performance.now() * 0.001;
        const hoverHeight = 0.2;
        const hoverSpeed = 2;
        
        // Calculate new Y position with sine wave
        const newY = item.mesh.userData.originalY + Math.sin(time * hoverSpeed) * hoverHeight;
        item.mesh.position.y = newY;
        
        // Rotate the item
        item.mesh.rotation.y += deltaTime * 2;
    }

    checkCollisions(car) {
        if (!car || !car.mesh) return;

        // Skip collision check if car already has an active item
        if (car.currentItem) {
            // Flash the item indicator to remind player they already have an item
            this.flashItemIndicator(car);
            return;
        }

        const carPosition = car.mesh.position;
        const collisionDistance = 2;

        this.items.forEach((item, id) => {
            if (!item.mesh) return;

            const itemPosition = item.mesh.position;
            const distance = carPosition.distanceTo(itemPosition);

            if (distance < collisionDistance) {
                console.log('[ITEMS] Car collected item:', {
                    type: item.type,
                    id: item.id,
                    position: itemPosition
                });

                // Set the item type on the car before applying effects
                car.currentItem = item.type;
                car.itemManager = this;  // Pass the ItemManager reference
                
                // Apply immediate effects for speed boost without showing the inventory icon
                if (item.type === 'speedBoost') {
                    // Skip pickupItem() call to avoid showing inventory icon
                    car.activateSpeedBoost();
                    car.currentItem = null;  // Clear immediately used items
                } else {
                    // For other items like bananas, show the indicator
                    car.pickupItem();
                }

                // Save position for respawn
                const oldPosition = item.mesh ? item.mesh.position.clone() : null;
                const oldItem = {...item};
                
                // Notify server about collection
                if (this.multiplayer && this.multiplayer.socket) {
                    console.log('[ITEMS] Notifying server about item collection:', item.id);
                    this.multiplayer.socket.emit('item-collected', { itemId: item.id });
                    // In multiplayer, server handles respawning
                } else {
                    // In single player, handle respawn immediately
                    setTimeout(() => this.respawnItem(oldItem), 200);
                }

                // Remove the item locally
                this.removeItem(item);
            }
        });
    }

    // Flash the item indicator to provide feedback when trying to collect with full inventory
    flashItemIndicator(car) {
        if (car.isRemote || !car.currentItem) return;
        
        // Get the item indicator
        const indicator = document.getElementById('item-indicator');
        if (!indicator) return;
        
        // Already flashing
        if (indicator.classList.contains('flashing')) return;
        
        // Add flashing effect
        indicator.classList.add('flashing');
        
        // Add style if it doesn't exist yet
        if (!document.getElementById('item-indicator-flash-style')) {
            const style = document.createElement('style');
            style.id = 'item-indicator-flash-style';
            style.textContent = `
                @keyframes flash {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.3); }
                    100% { transform: scale(1); }
                }
                .flashing {
                    animation: flash 0.3s ease-in-out 2;
                }
            `;
            document.head.appendChild(style);
        }
        
        // Remove class after animation finishes
        setTimeout(() => {
            indicator.classList.remove('flashing');
        }, 600); // Slightly longer than animation duration
    }

    dispose() {
        this.items.forEach(item => item.dispose());
        this.items.clear();
    }

    handleItemSync(items) {
        
        // Clear existing items
        this.items.forEach(item => this.removeItem(item));
        this.items.clear();

        // Create new items
        items.forEach(itemData => {
            const mesh = this.createItemMesh(itemData.type, itemData.position);
            const item = {
                id: itemData.id,
                mesh: mesh,
                type: itemData.type
            };
            this.items.set(itemData.id, item);
        });
    }

    handleNewItem(itemData) {
        // Check if we already have an item close to this position
        const isOverlapping = this.isPositionOverlapping(itemData.position);
        if (isOverlapping) {
            console.log(`[ITEMS] Rejecting item ${itemData.id} - too close to existing item`);
            // Tell the server this item is overlapping so it can remove it
            if (this.multiplayer && this.multiplayer.socket) {
                this.multiplayer.socket.emit('item-overlap-detected', { itemId: itemData.id });
            }
            return;
        }
        
        const mesh = this.createItemMesh(itemData.type, itemData.position);
        const item = {
            id: itemData.id,
            mesh: mesh,
            type: itemData.type
        };
        this.items.set(itemData.id, item);
    }

    // Check if a position is too close to any existing item
    isPositionOverlapping(serverPosition) {
        // Convert server position to client position
        const SERVER_TRACK_RADIUS = 20;
        const scaleFactor = this.track ? (this.track.trackRadius / SERVER_TRACK_RADIUS) : 5;
        
        const clientPosition = new THREE.Vector3(
            serverPosition.x * scaleFactor,
            serverPosition.y,
            serverPosition.z * scaleFactor
        );
        
        const MIN_DISTANCE = 3; // Minimum distance between items (adjusted for client scale)
        
        // Check against all existing items
        for (const item of this.items.values()) {
            if (item.mesh) {
                const distance = clientPosition.distanceTo(item.mesh.position);
                if (distance < MIN_DISTANCE) {
                    console.log(`[ITEMS] Found overlapping item at distance ${distance.toFixed(2)}`);
                    return true;
                }
            }
        }
        
        return false;
    }

    addDebugHelpers() {
        // Add a grid helper
        const gridHelper = new THREE.GridHelper(30, 30);
        this.scene.add(gridHelper);

        // Add circles to visualize different radii
        [5, 10, 15, 20].forEach(radius => {
            const points = [];
            const segments = 32;
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                points.push(new THREE.Vector3(
                    Math.cos(angle) * radius,
                    0.1,
                    Math.sin(angle) * radius
                ));
            }
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ 
                color: radius === 10 ? 0xff0000 : 0x0000ff 
            });
            const circle = new THREE.Line(geometry, material);
            this.scene.add(circle);
        });
    }

    createSpeedBoostMesh(position) {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.userData.originalY = position.y;
        return mesh;
    }

    createBananaMesh(position) {
        // Use same size as speed boost (2 units)
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshPhongMaterial({ color: 0xffff00 }); // Yellow color
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.userData.originalY = position.y;
        return mesh;
    }

    // Create a thrown banana from another player
    createThrownBanana(position, rotation, velocity) {
        // Create banana peel model
        const bananaGroup = new THREE.Group();
        
        // Create a curved, flattened banana peel shape - further increased dimensions
        const bananaGeometry = new THREE.CylinderGeometry(0.6, 0.5, 1.8, 8, 1, true, 0, Math.PI * 1.5);
        // Flatten the peel but keep it thick enough to be visible
        bananaGeometry.scale(1.5, 0.25, 1.5);
        bananaGeometry.translate(0, 0, 0);
        
        // Bend the cylinder to create banana peel curve
        const vertices = bananaGeometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i);
            const y = vertices.getY(i);
            const z = vertices.getZ(i);
            
            // More pronounced curve for the peel
            const bendAmount = 0.5;
            const newZ = z - Math.pow(y, 2) * bendAmount;
            // Add some random variation to make it look like a used peel
            const randomBend = (Math.random() - 0.5) * 0.1;
            
            vertices.setZ(i, newZ + randomBend);
            // Slightly curl the edges of the peel
            if (Math.abs(x) > 0.2) {
                vertices.setY(i, y + Math.abs(x) * 0.15);
            }
        }
        
        // Slightly darker, more matte banana peel material
        const bananaMaterial = new THREE.MeshPhongMaterial({
            color: 0xEBC334, // Slightly darker yellow
            shininess: 30,
            specular: 0x111111,
            side: THREE.DoubleSide // Show both sides of the peel
        });
        const bananaBody = new THREE.Mesh(bananaGeometry, bananaMaterial);
        bananaBody.rotation.x = Math.PI / 2; // Rotate to proper orientation
        bananaGroup.add(bananaBody);
        
        // Set position and rotation
        bananaGroup.position.copy(position);
        bananaGroup.rotation.y = rotation;
        
        // Add to scene
        this.scene.add(bananaGroup);
        
        // Track the banana
        const banana = {
            mesh: bananaGroup,
            position: bananaGroup.position.clone(),
            velocity: velocity.clone()
        };
        
        // Add to bananas array if it exists, or create it
        if (!this.bananas) this.bananas = [];
        this.bananas.push(banana);
        
        
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
        
        return bananaGroup;
    }

    createItemMesh(type, serverPosition) {
        // Scale factor to convert server coordinates to client coordinates
        const SERVER_TRACK_RADIUS = 20;
        const scaleFactor = this.track ? (this.track.trackRadius / SERVER_TRACK_RADIUS) : 5;
        
        // Convert position to Vector3 if it isn't already
        let position;
        if (serverPosition instanceof THREE.Vector3) {
            position = serverPosition.clone().multiplyScalar(scaleFactor);
        } else {
            position = new THREE.Vector3(
                serverPosition.x * scaleFactor,
                serverPosition.y,
                serverPosition.z * scaleFactor
            );
        }

        // Debug sphere to show exact position
        const debugGeometry = new THREE.SphereGeometry(0.2);
        const debugMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const debugSphere = new THREE.Mesh(debugGeometry, debugMaterial);
        debugSphere.position.copy(position);
        this.scene.add(debugSphere);

        // Create the actual item mesh based on type
        let mesh;
        switch(type) {
            case 'speedBoost':
                mesh = this.createSpeedBoostMesh(position);
                break;
            case 'banana':
                mesh = this.createBananaMesh(position);
                break;
            case 'shell':
                mesh = this.createShellMesh(position);
                break;
            default:
                console.error('[ITEMS] Unknown item type:', type);
                return null;
        }
        
        if (!mesh) {
            console.error('[ITEMS] Failed to create mesh for type:', type);
            return null;
        }
            
        // Store debug sphere reference
        mesh.debugSphere = debugSphere;
        
        // Add to scene
        this.scene.add(mesh);
        
        return mesh;
    }

    createShellMesh(position) {
        // Create a red shell item with the same box geometry as other items
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshPhongMaterial({ 
            color: 0xff0000, // Bright red
            emissive: 0x330000,
            emissiveIntensity: 0.3,
            shininess: 80
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.userData.originalY = position.y;
        mesh.userData.type = 'shell';
        
        return mesh;
    }

    // Helper method to create a complete item object
    createItem(id, type, position) {
        console.log('[ITEMS] Creating item:', { id, type, position });
        
        if (!this.scene) {
            console.error('[ITEMS] Cannot create item - no scene available');
            return null;
        }

        const mesh = this.createItemMesh(type, position);
        if (!mesh) {
            console.error('[ITEMS] Failed to create mesh');
            return null;
        }

        return {
            id,
            type,
            position: new THREE.Vector3(position.x, position.y, position.z),
            mesh,
            update: (deltaTime) => this.updateItem(id, deltaTime)
        };
    }

    debugPositions() {
        console.log('[ITEMS] Debug positions:');
        this.items.forEach((item, id) => {
            if (item.mesh) {
                console.log(`Item ${id}:`, {
                    position: item.mesh.position.toArray(),
                    type: item.type,
                    inScene: this.scene.children.includes(item.mesh)
                });
            }
        });
    }

    clearItems() {
        this.items.forEach(item => {
            if (item.mesh) {
                this.scene.remove(item.mesh);
            }
        });
        this.items.clear();
    }

    throwBanana(car) {
        if (!car || !car.mesh) return;
        
        console.log('[ITEMS] Throwing banana');

        // Create banana peel model
        const bananaGroup = new THREE.Group();
        
        // Create a curved, flattened banana peel shape - further increased dimensions
        const bananaGeometry = new THREE.CylinderGeometry(0.6, 0.5, 1.8, 8, 1, true, 0, Math.PI * 1.5);
        // Flatten the peel but keep it thick enough to be visible
        bananaGeometry.scale(1.5, 0.25, 1.5);
        bananaGeometry.translate(0, 0, 0);
        
        // Bend the cylinder to create banana peel curve
        const vertices = bananaGeometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i);
            const y = vertices.getY(i);
            const z = vertices.getZ(i);
            
            // More pronounced curve for the peel
            const bendAmount = 0.5;
            const newZ = z - Math.pow(y, 2) * bendAmount;
            // Add some random variation to make it look like a used peel
            const randomBend = (Math.random() - 0.5) * 0.1;
            
            vertices.setZ(i, newZ + randomBend);
            // Slightly curl the edges of the peel
            if (Math.abs(x) > 0.2) {
                vertices.setY(i, y + Math.abs(x) * 0.15);
            }
        }
        
        // Slightly darker, more matte banana peel material
        const bananaMaterial = new THREE.MeshPhongMaterial({
            color: 0xEBC334, // Slightly darker yellow
            shininess: 30,
            specular: 0x111111,
            side: THREE.DoubleSide // Show both sides of the peel
        });
        const bananaBody = new THREE.Mesh(bananaGeometry, bananaMaterial);
        bananaBody.rotation.x = Math.PI / 2; // Rotate to proper orientation
        bananaGroup.add(bananaBody);
        
        // Position banana behind the car
        const behindCar = car.direction.clone().multiplyScalar(-4);
        bananaGroup.position.copy(car.position).add(behindCar);
        bananaGroup.position.y = 0.3; // Slightly above ground
        
        // Add to scene and track
        this.scene.add(bananaGroup);
        if (!this.bananas) this.bananas = [];
        this.bananas.push({
            mesh: bananaGroup,
            position: bananaGroup.position.clone()
        });

        // Broadcast the throw if in multiplayer
        if (this.multiplayer) {
            console.log('[ITEMS] Broadcasting banana throw');
            const throwVelocity = car.direction.clone().negate().multiplyScalar(10);
            this.multiplayer.broadcastThrownBanana(
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

    checkBananaCollisions(car) {
        if (!car || !car.mesh || car.isRemote) return;

        const carPosition = car.position.clone();
        carPosition.y = 0; // Ignore height difference

        for (let i = this.bananas?.length - 1; i >= 0; i--) {
            const banana = this.bananas[i];
            const bananaPosition = banana.position.clone();
            bananaPosition.y = 0;

            if (carPosition.distanceTo(bananaPosition) < 3.0) {
                // Collision detected
                this.handleBananaCollision(car);

                // Notify other players about the collision
                if (this.multiplayer && this.multiplayer.socket) {
                    this.multiplayer.socket.emit('banana-collision', {
                        bananaPosition: bananaPosition.toArray(),
                        collidedBy: this.multiplayer.socket.id
                    });
                }

                // Clean up the banana properly
                if (banana.mesh) {
                    // Dispose of geometries and materials
                    banana.mesh.traverse((child) => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(material => material.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });
                    // Remove from scene
                    this.scene.remove(banana.mesh);
                }

                // Remove from tracking array
                this.bananas.splice(i, 1);
            }
        }
    }

    handleBananaCollision(car) {
        // Don't create a new animation loop with requestAnimationFrame
        // Instead, store the spin data and let the car's update handle it
        
        // Set up spin properties on the car
        car.spinStartTime = performance.now();
        car.spinDuration = 1000; // 1 second
        car.spinStartRotation = car.rotation;
        car.spinAmount = Math.PI * 2; // Full 360-degree spin
        car.isSpinning = true;
        
        // Reduce speed
        car.speed *= 0.3;
        
        // The car's update method will need to handle the spinning
        // We'll add code to car.js to handle this
    }

    setLocalCar(car) {
        this.localCar = car;
        console.log('[ITEMS] Local car reference set');
    }

    throwShell(car) {
        if (!car || !car.mesh) return;
        
        console.log('[ITEMS] Throwing shell from car:', car.id || 'player car');

        // Create shell object
        const shellGroup = new THREE.Group();
        
        // Create the main shell body
        const shellGeometry = new THREE.SphereGeometry(0.6, 16, 16);
        const shellMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0x330000,
            emissiveIntensity: 0.3,
            shininess: 80,
            specular: 0x444444
        });
        
        const shellBody = new THREE.Mesh(shellGeometry, shellMaterial);
        shellGroup.add(shellBody);
        
        // Add spikes to make it look like the red shells from Mario Kart
        for (let i = 0; i < 5; i++) {
            const spikeGeometry = new THREE.ConeGeometry(0.2, 0.4, 8);
            const spikeMaterial = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                emissive: 0x330000,
                emissiveIntensity: 0.3,
                shininess: 80
            });
            
            const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
            
            // Distribute spikes around the shell
            const angle = (i / 5) * Math.PI * 2;
            const x = Math.cos(angle) * 0.6;
            const y = Math.sin(angle) * 0.6;
            spike.position.set(x, y, 0);
            
            // Point spikes outward
            spike.lookAt(shellBody.position.clone().add(new THREE.Vector3(x * 2, y * 2, 0)));
            
            shellGroup.add(spike);
        }
        
        // Position shell in front of the car
        const forwardCar = car.direction.clone().multiplyScalar(4);
        shellGroup.position.copy(car.position).add(forwardCar);
        shellGroup.position.y = 1.5; // Higher than bananas so it can fly
        
        // Increased velocity for the shell - much faster than before
        const velocity = car.direction.clone().multiplyScalar(80); // Reduced from 100 to 80 for better balance
        
        // Add to scene and track
        this.scene.add(shellGroup);
        if (!this.shells) this.shells = [];
        this.shells.push({
            mesh: shellGroup,
            position: shellGroup.position.clone(),
            velocity: velocity,
            startTime: performance.now(),
            active: true,
            targetHit: false,
            thrower: car // Store reference to the car that threw it
        });
        
        // Broadcast the throw if in multiplayer
        if (this.multiplayer) {
            console.log('[ITEMS] Broadcasting shell throw');
            this.multiplayer.broadcastThrownShell(
                shellGroup.position,
                shellGroup.rotation.y,
                velocity
            );
        }
        
        // Create a target finding effect - red glowing trail
        const trailInterval = setInterval(() => {
            const shell = this.shells.find(s => s.mesh === shellGroup);
            if (!shell || !shell.active || shell.targetHit) {
                clearInterval(trailInterval);
                return;
            }
            
            // Create a small glowing particle
            const trailGeometry = new THREE.SphereGeometry(0.2, 8, 8);
            const trailMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.7
            });
            
            const trail = new THREE.Mesh(trailGeometry, trailMaterial);
            trail.position.copy(shellGroup.position);
            this.scene.add(trail);
            
            // Fade and remove the trail
            setTimeout(() => {
                this.scene.remove(trail);
                trail.geometry.dispose();
                trail.material.dispose();
            }, 250); // Adjusted from 200ms to 250ms for better visuals at the new speed
        }, 40); // Adjusted from 35ms to 40ms for trail particles at the new speed
        
        // Remove shell after 10 seconds if it hasn't hit anything
        setTimeout(() => {
            const index = this.shells.findIndex(s => s.mesh === shellGroup);
            if (index !== -1) {
                const shell = this.shells[index];
                if (shell.active && !shell.targetHit) {
                    this.scene.remove(shellGroup);
                    shellGroup.traverse((child) => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(material => material.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });
                    this.shells.splice(index, 1);
                }
            }
        }, 10000);
    }

    updateShells(deltaTime) {
        if (!this.shells) return;
        
        for (let i = this.shells.length - 1; i >= 0; i--) {
            const shell = this.shells[i];
            if (!shell.active || !shell.mesh) continue;
            
            // Move the shell forward
            shell.position.add(shell.velocity.clone().multiplyScalar(deltaTime));
            shell.mesh.position.copy(shell.position);
            
            // Rotate the shell as it flies
            shell.mesh.rotation.x += deltaTime * 5;
            shell.mesh.rotation.y += deltaTime * 3;
            
            // Auto-target the nearest car in front
            this.findTargetForShell(shell, deltaTime);
        }
    }

    findTargetForShell(shell, deltaTime) {
        // Find all cars in the scene
        const cars = [];
        this.scene.traverse(object => {
            // Look for objects that are Groups and have a car reference
            if (object.userData && object.userData.car) {
                const car = object.userData.car;
                if (car) {
                    // Skip the car that threw the shell
                    if (shell.thrower && car === shell.thrower) {
                        console.log('[ITEMS] Skipping thrower car:', car.playerName || 'player car');
                        return;
                    }
                    cars.push(car);
                }
            }
        });
        
        if (cars.length === 0) {
            // Log if no cars found
            console.log('[ITEMS] No cars found to target');
            return;
        }
        
        // Log all found cars for debugging
        console.log(`[ITEMS] Found ${cars.length} potential target cars`);
        
        // Find the nearest car in front of the shell
        let nearestCar = null;
        let nearestDistance = Infinity;
        
        for (const car of cars) {
            // Log all available cars for targeting
            console.log('[ITEMS] Potential target car:', car.playerName || 'AI car', 'at distance', shell.position.distanceTo(car.position));
            
            const distance = shell.position.distanceTo(car.position);
            // Use a wider detection range
            if (distance < nearestDistance && distance < 100) {
                // We'll target any car, not just those ahead of the shell
                nearestCar = car;
                nearestDistance = distance;
            }
        }
        
        if (nearestCar) {
            // Debug information
            console.log('[ITEMS] Shell targeting car:', nearestCar.playerName || 'AI car', 'at distance', nearestDistance);
            
            // Get the direction to the target
            const targetDir = nearestCar.position.clone().sub(shell.position).normalize();
            
            // Keep the same speed but change direction more aggressively
            const speed = shell.velocity.length();
            const newVelocity = targetDir.multiplyScalar(speed);
            
            // More aggressive steering toward the target
            shell.velocity.lerp(newVelocity, deltaTime * 6); // Adjusted from 8 to 6 for better tracking at the new speed
        }
    }

    // Helper method to visualize targeting
    drawDebugLine(from, to) {
        // Create a line geometry between the shell and its target
        const geometry = new THREE.BufferGeometry().setFromPoints([
            from.clone(),
            to.clone()
        ]);
        
        const material = new THREE.LineBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.5
        });
        
        const line = new THREE.Line(geometry, material);
        this.scene.add(line);
        
        // Remove the line after 100ms
        setTimeout(() => {
            this.scene.remove(line);
            geometry.dispose();
            material.dispose();
        }, 100);
    }

    checkShellCollisions() {
        if (!this.shells) return;
        
        // Need to find the player car for impact effects
        let playerCar = null;
        
        // Clear any existing debug lines
        if (this.debugLines && this.debugLines.length > 0) {
            for (const line of this.debugLines) {
                this.scene.remove(line);
                line.geometry.dispose();
                line.material.dispose();
            }
            this.debugLines = [];
        }
        
        // Get all cars in the scene
        const cars = [];
        this.scene.traverse(object => {
            // FIXED: Check for userData.car instead of userData.type === 'car' and userData.carInstance
            if (object.userData && object.userData.car) {
                const car = object.userData.car;
                if (car) {
                    cars.push(car);
                    
                    // Identify the player car for impact effects
                    if (!car.isRemote && !car.isAI) {
                        playerCar = car;
                    }
                }
            }
        });
                
        // Loop through each shell
        for (let i = this.shells.length - 1; i >= 0; i--) {
            const shell = this.shells[i];
            if (!shell.active || shell.targetHit) continue;
            
            // Log shell position
            
            // Check for collision with any car
            for (const car of cars) {
                // Skip the car that threw the shell
                if (shell.thrower === car) continue;
                
                // Check distance between shell and car
                const distance = shell.position.distanceTo(car.position);
                
                // Shell hits when it gets close to the car
                if (distance < 3) { // Increased from 2 to 3 for more generous hitbox
                    shell.targetHit = true;
                    shell.active = false;
                    
                    
                    // Apply impact to car
                    this.handleShellCollision(car, shell);
                    
                    // Create explosion effect
                    this.createExplosion(shell.position);
                    
                    // Apply screen shake if player car is hit or nearby
                    if (playerCar) {
                        const distanceToPlayer = shell.position.distanceTo(playerCar.position);
                        if (distanceToPlayer < 30) {
                            // Shake intensity based on distance
                            const shakeIntensity = Math.max(0.2, 1 - (distanceToPlayer / 30));
                            this.applyScreenShake(shakeIntensity);
                        }
                    }
                    
                    // Broadcast collision to other players
                    if (this.multiplayer && this.multiplayer.socket) {
                        console.log('[ITEMS] Broadcasting shell collision');
                        
                        // Get the hit car's ID (if it's a remote car)
                        let hitCarId = null;
                        if (car.isRemote && car.carInstanceId) {
                            hitCarId = car.carInstanceId;
                        }
                        
                        // Get the thrower's ID (if available)
                        let throwerId = null;
                        if (shell.thrower && shell.thrower.carInstanceId) {
                            throwerId = shell.thrower.carInstanceId;
                        }
                        
                        // Broadcast the collision
                        this.multiplayer.broadcastShellCollision({
                            position: shell.position.toArray(),
                            hitCarId: hitCarId, 
                            throwerId: throwerId,
                            timestamp: Date.now()
                        });
                    }
                    
                    // Remove the shell after hit
                    this.scene.remove(shell.mesh);
                    shell.mesh.traverse((child) => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(material => material.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });
                    this.shells.splice(i, 1);
                    break;
                }
            }
        }
    }

    handleShellCollision(car, shell) {
        // Make the car spin out more dramatically than a banana collision
        car.spinStartTime = performance.now();
        car.spinDuration = 2000; // 2 seconds
        car.spinStartRotation = car.rotation;
        car.spinAmount = Math.PI * 4; // Two full 360-degree spins
        car.isSpinning = true;
        
        // Significantly reduce speed
        car.speed *= 0.2;
    }

    createExplosion(position) {
        // Create particle effect for explosion
        const particleCount = 30;
        const particles = new THREE.Group();
        
        for (let i = 0; i < particleCount; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.2, 8, 8);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: 0xff3300,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Random position within explosion radius
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 2;
            particle.position.set(
                position.x + Math.cos(angle) * radius,
                position.y + Math.random() * 2,
                position.z + Math.sin(angle) * radius
            );
            
            // Random velocity
            particle.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                Math.random() * 5,
                (Math.random() - 0.5) * 10
            );
            
            particles.add(particle);
        }
        
        this.scene.add(particles);
        
        // Add a flash of light
        const light = new THREE.PointLight(0xff5500, 5, 10);
        light.position.copy(position);
        this.scene.add(light);
        
        // Animate the explosion
        let time = 0;
        const explosionInterval = setInterval(() => {
            time += 0.05;
            
            particles.children.forEach(particle => {
                // Move particle based on its velocity
                particle.position.add(particle.userData.velocity.clone().multiplyScalar(0.05));
                
                // Add gravity effect
                particle.userData.velocity.y -= 0.2;
                
                // Fade out
                if (particle.material.opacity > 0) {
                    particle.material.opacity -= 0.02;
                }
            });
            
            // Fade out light
            if (light.intensity > 0) {
                light.intensity -= 0.25;
            }
            
            // End animation after 1 second
            if (time >= 1) {
                clearInterval(explosionInterval);
                this.scene.remove(particles);
                this.scene.remove(light);
                
                // Dispose of all particle resources
                particles.traverse((child) => {
                    if (child.isMesh) {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) child.material.dispose();
                    }
                });
            }
        }, 50);
    }
    
    // Add screen shake effect when a shell hits
    applyScreenShake(intensity = 1.0) {
        // Find the camera
        const camera = this.scene.getObjectByProperty('type', 'PerspectiveCamera');
        if (!camera) return;
        
        // Store original position
        const originalPosition = camera.position.clone();
        
        // Apply shake effect
        let time = 0;
        const shakeDuration = 500; // ms
        const startTime = performance.now();
        
        const shakeInterval = setInterval(() => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / shakeDuration, 1.0);
            
            if (progress < 1.0) {
                // Calculate decreasing intensity over time
                const currentIntensity = intensity * (1.0 - progress);
                
                // Apply random offsets to camera
                const offsetX = (Math.random() - 0.5) * currentIntensity * 0.5;
                const offsetY = (Math.random() - 0.5) * currentIntensity * 0.5;
                const offsetZ = (Math.random() - 0.5) * currentIntensity * 0.5;
                
                // Move camera
                camera.position.set(
                    originalPosition.x + offsetX,
                    originalPosition.y + offsetY,
                    originalPosition.z + offsetZ
                );
            } else {
                // Reset to original position and clear interval
                camera.position.copy(originalPosition);
                clearInterval(shakeInterval);
            }
        }, 16); // About 60fps
    }

    /**
     * Create a shell thrown by another player from network data
     * @param {THREE.Vector3} position - The initial position of the shell
     * @param {number} rotation - The initial rotation of the shell
     * @param {THREE.Vector3} velocity - The initial velocity of the shell
     * @param {Object} thrower - The car that threw the shell (optional)
     * @returns {Object} The created shell object
     */
    createThrownShell(position, rotation, velocity, thrower = null) {
        console.log('[ITEMS] Creating shell from remote player at position:', position.toArray());
        
        // Create shell object
        const shellGroup = new THREE.Group();
        
        // Create the main shell body
        const shellGeometry = new THREE.SphereGeometry(0.6, 16, 16);
        const shellMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0x330000,
            emissiveIntensity: 0.3,
            shininess: 80,
            specular: 0x444444
        });
        
        const shellBody = new THREE.Mesh(shellGeometry, shellMaterial);
        shellGroup.add(shellBody);
        
        // Add spikes to make it look like the red shells from Mario Kart
        for (let i = 0; i < 5; i++) {
            const spikeGeometry = new THREE.ConeGeometry(0.2, 0.4, 8);
            const spikeMaterial = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                emissive: 0x330000,
                emissiveIntensity: 0.3,
                shininess: 80
            });
            
            const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
            
            // Distribute spikes around the shell
            const angle = (i / 5) * Math.PI * 2;
            const x = Math.cos(angle) * 0.6;
            const y = Math.sin(angle) * 0.6;
            spike.position.set(x, y, 0);
            
            // Point spikes outward
            spike.lookAt(shellBody.position.clone().add(new THREE.Vector3(x * 2, y * 2, 0)));
            
            shellGroup.add(spike);
        }
        
        // Set position and rotation from network data
        shellGroup.position.copy(position);
        shellGroup.position.y = 1.5; // Ensure consistent height
        shellGroup.rotation.y = rotation;
        
        // Add to scene and track
        this.scene.add(shellGroup);
        if (!this.shells) this.shells = [];
        
        // Create the shell object with data from network
        const shell = {
            mesh: shellGroup,
            position: shellGroup.position.clone(),
            velocity: velocity.clone(),
            startTime: performance.now(),
            active: true,
            targetHit: false,
            thrower: thrower // Store reference to the car that threw it
        };
        
        this.shells.push(shell);
        
        // Create a target finding effect - red glowing trail
        const trailInterval = setInterval(() => {
            const shellIndex = this.shells.findIndex(s => s.mesh === shellGroup);
            if (shellIndex === -1 || !this.shells[shellIndex].active || this.shells[shellIndex].targetHit) {
                clearInterval(trailInterval);
                return;
            }
            
            // Create a small glowing particle
            const trailGeometry = new THREE.SphereGeometry(0.2, 8, 8);
            const trailMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.7
            });
            
            const trail = new THREE.Mesh(trailGeometry, trailMaterial);
            trail.position.copy(shellGroup.position);
            this.scene.add(trail);
            
            // Fade and remove the trail
            setTimeout(() => {
                this.scene.remove(trail);
                trail.geometry.dispose();
                trail.material.dispose();
            }, 250); // Adjusted from 200ms to 250ms for better visuals at the new speed
        }, 40); // Adjusted from 35ms to 40ms for trail particles at the new speed
        
        // Remove shell after 10 seconds if it hasn't hit anything
        setTimeout(() => {
            const index = this.shells.findIndex(s => s.mesh === shellGroup);
            if (index !== -1 && this.shells[index].active && !this.shells[index].targetHit) {
                this.scene.remove(shellGroup);
                shellGroup.traverse((child) => {
                    if (child.isMesh) {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(material => material.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    }
                });
                this.shells.splice(index, 1);
            }
        }, 10000);
        
        return shell;
    }

    // Add a method to respawn an item immediately at a different location
    respawnItem(oldItem) {
        // Only handle respawn in single-player mode
        // In multiplayer, the server handles respawning
        if (this.multiplayer) return;
        
        console.log('[ITEMS] Respawning item to replace collected one');
        
        // Generate a new position away from the collected one
        const position = this.getNewItemPosition(oldItem.mesh.position);
        if (!position) {
            console.warn('[ITEMS] Could not find valid respawn position');
            return;
        }
        
        // Create a unique ID for the new item
        const itemId = `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Randomly select item type
        const itemType = this.getRandomItemType();
        
        // Create the item and add it to the game
        const itemMesh = this.createItemMesh(itemType, position);
        if (itemMesh) {
            const item = {
                id: itemId,
                type: itemType,
                mesh: itemMesh
            };
            this.items.set(itemId, item);
            console.log(`[ITEMS] Respawned ${itemType} at position:`, position);
        }
    }
    
    // Helper method to get a random item type
    getRandomItemType() {
        const randomValue = Math.random();
        if (randomValue < 0.4) {
            return 'speedBoost';
        } else if (randomValue < 0.8) {
            return 'banana';
        } else {
            return 'shell';
        }
    }
    
    // Helper method to find a new position for an item
    getNewItemPosition(avoidPosition) {
        if (!this.track) return null;
        
        const trackRadius = this.track.trackRadius;
        
        // Try 10 times to find a valid position
        for (let attempt = 0; attempt < 10; attempt++) {
            // Generate a random angle
            const angle = Math.random() * Math.PI * 2;
            
            // Generate random radius with preference for different lanes
            // Inner lane, middle lane, outer lane
            const laneOptions = [
                trackRadius - 2, // Inner lane
                trackRadius,     // Middle lane
                trackRadius + 2  // Outer lane
            ];
            const radius = laneOptions[Math.floor(Math.random() * laneOptions.length)];
            
            // Calculate position
            const position = new THREE.Vector3(
                Math.cos(angle) * radius,
                1, // Slightly above ground
                Math.sin(angle) * radius
            );
            
            // Ensure it's not too close to the collected item
            if (avoidPosition && position.distanceTo(avoidPosition) < 10) {
                continue; // Too close, try again
            }
            
            // Check if position is far enough from other items
            if (this.isPositionValid(position)) {
                return position;
            }
        }
        
        // If all attempts failed, return a fallback position
        return new THREE.Vector3(
            (Math.random() - 0.5) * trackRadius * 0.8,
            1,
            (Math.random() - 0.5) * trackRadius * 0.8
        );
    }
    
    // Check if a position is valid (not too close to existing items)
    isPositionValid(position) {
        const MIN_DISTANCE = 5; // Minimum distance between items
        
        // Check against all existing items
        for (const item of this.items.values()) {
            if (item.mesh) {
                const distance = position.distanceTo(item.mesh.position);
                if (distance < MIN_DISTANCE) {
                    return false;
                }
            }
        }
        
        return true;
    }
} 