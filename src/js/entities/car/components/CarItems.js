import * as THREE from 'three';
import { isMobile } from '../../../utils/deviceDetection';

export class CarItems {
    constructor(car) {
        this.car = car;
        this.currentItem = null;
        this.bananas = [];
        this.pulseInterval = null;
    }

    handleItemPickup(car) {
        // 70% chance for banana, 30% for speed boost
        const itemType = Math.random() < 0.7 ? 'banana' : 'speedBoost';
        car.currentItem = itemType;
        console.log('[ITEMS] Picked up item:', itemType);
        return itemType;
    }

    update() {
        this.checkBananaCollision();
    }

    useItem() {
        if (!this.currentItem) return;

        if (this.currentItem === 'banana') {
            this.throwBanana();
        } else if (this.currentItem === 'speedBoost') {
            this.car.effects.applySpeedBoost();
        }

        this.currentItem = null;
        this.hideItemIndicator();
    }

    throwBanana() {
        if (!this.car.mesh) return;

        // Debug log for multiplayer status
        console.log('[ITEMS] Throwing banana, multiplayer status:', {
            hasGame: !!this.car.game,
            hasMultiplayer: !!(this.car.game && this.car.game.multiplayer),
            isConnected: !!(this.car.game && this.car.game.multiplayer && this.car.game.multiplayer.isConnected),
            socketId: this.car.game?.multiplayer?.socket?.id
        });

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
        bananaBody.rotation.x = Math.PI / 2;
        bananaGroup.add(bananaBody);
        
        // Position banana behind the car
        const behindCar = this.car.direction.clone().multiplyScalar(-4);
        bananaGroup.position.copy(this.car.position).add(behindCar);
        bananaGroup.position.y = 0.3;
        
        // Add to scene and track
        this.car.scene.add(bananaGroup);
        this.bananas.push({
            mesh: bananaGroup,
            position: bananaGroup.position.clone()
        });

        // Broadcast banana throw in multiplayer
        if (this.car.game?.multiplayer?.isConnected) {
            const velocity = this.car.direction.clone().multiplyScalar(-5); // Throw backwards
            console.log('[ITEMS] Broadcasting thrown banana:', {
                position: bananaGroup.position.toArray(),
                rotation: this.car.rotation,
                velocity: velocity.toArray(),
                socketId: this.car.game.multiplayer.socket.id
            });
            
            this.car.game.multiplayer.broadcastThrownBanana(
                bananaGroup.position,
                this.car.rotation,
                velocity
            );
        } else {
            console.warn('[ITEMS] Cannot broadcast thrown banana - no multiplayer connection available', {
                hasGame: !!this.car.game,
                hasMultiplayer: !!(this.car.game?.multiplayer),
                isConnected: !!(this.car.game?.multiplayer?.isConnected)
            });
        }

        // Remove banana after 30 seconds
        setTimeout(() => {
            const index = this.bananas.findIndex(b => b.mesh === bananaGroup);
            if (index !== -1) {
                this.car.scene.remove(bananaGroup);
                this.bananas.splice(index, 1);
                bananaBody.geometry.dispose();
                bananaBody.material.dispose();
            }
        }, 30000);
    }

    checkBananaCollision() {
        if (!this.car.mesh || this.car.isRemote) return;

        const carPosition = this.car.position.clone();
        carPosition.y = 0;

        for (let i = this.bananas.length - 1; i >= 0; i--) {
            const banana = this.bananas[i];
            const bananaPosition = banana.position.clone();
            bananaPosition.y = 0;

            if (carPosition.distanceTo(bananaPosition) < 3.0) {
                this.handleBananaCollision();
                
                if (banana.mesh) {
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
                    
                    this.car.scene.remove(banana.mesh);
                }
                
                this.bananas.splice(i, 1);
            }
        }
    }

    handleBananaCollision() {
        const currentRotation = this.car.rotation;
        const spinDuration = 1000;
        const startTime = Date.now();
        const spinAmount = Math.PI * 2;

        const spin = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / spinDuration;

            if (progress < 1) {
                this.car.rotation = currentRotation + (spinAmount * progress);
                requestAnimationFrame(spin);
            } else {
                this.car.rotation = currentRotation + spinAmount;
            }
        };

        spin();
        this.car.physics.speed *= 0.3;
    }

    showItemIndicator() {
        if (this.car.isRemote) return;
        
        let indicator = document.getElementById('item-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'item-indicator';
            indicator.style.position = 'fixed';
            indicator.style.bottom = '100px';
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
            
            if (!isMobile()) {
                const label = document.createElement('div');
                label.id = 'item-indicator-label';
                label.style.position = 'fixed';
                label.style.bottom = '80px';
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
        }

        if (this.currentItem === 'banana') {
            indicator.textContent = '🍌';
            indicator.style.backgroundColor = 'rgba(255, 255, 0, 0.8)';
        } else {
            indicator.textContent = '⚡';
            indicator.style.backgroundColor = 'rgba(0, 255, 0, 0.8)';
        }
        
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
        if (label) label.style.display = isMobile() ? 'none' : 'block';
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
} 