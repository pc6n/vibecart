import * as THREE from 'three';

/**
 * Class representing an airplane with a trailing advertising banner
 */
export class Airplane {
    /**
     * Create an airplane that flies over the track with a banner
     * @param {THREE.Scene} scene - The Three.js scene to add the airplane to
     * @param {Object} options - Configuration options
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.options = {
            flyHeight: options.flyHeight || 50,
            speed: options.speed || 10,
            bannerText: options.bannerText || 'PLAY WITH FRIENDS!',
            bannerColor: options.bannerColor || '#FFFF00',
            bannerTextColor: options.bannerTextColor || '#000000',
            path: options.path || this.generateCircularPath(200, 200),
            ...options
        };
        
        this.airplane = null;
        this.banner = null;
        this.bannerRopes = [];
        this.pathPosition = 0;
        this.propellerRotation = 0;
        this.enabled = true;
    }
    
    /**
     * Initialize the airplane and banner
     */
    async init() {
        // Create airplane group
        this.airplane = new THREE.Group();
        
        // Create airplane body (simple shape for better performance)
        const fuselageGeometry = new THREE.CylinderGeometry(1.5, 1.5, 9, 8);
        fuselageGeometry.rotateX(Math.PI / 2);
        const fuselageMaterial = new THREE.MeshPhongMaterial({ color: 0xCCCCCC });
        const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
        this.airplane.add(fuselage);
        
        // Create wings
        const wingGeometry = new THREE.BoxGeometry(18, 0.3, 3);
        const wingMaterial = new THREE.MeshPhongMaterial({ color: 0xCCCCCC });
        const wing = new THREE.Mesh(wingGeometry, wingMaterial);
        wing.position.y = 0.3;
        this.airplane.add(wing);
        
        // Create tail
        const tailGeometry = new THREE.BoxGeometry(4.5, 3, 0.3);
        const tailMaterial = new THREE.MeshPhongMaterial({ color: 0xCCCCCC });
        const tail = new THREE.Mesh(tailGeometry, tailMaterial);
        tail.position.set(0, 1.5, -3.75);
        this.airplane.add(tail);
        
        // Create propeller
        const propellerGeometry = new THREE.BoxGeometry(0.3, 4.5, 0.3);
        const propellerMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
        this.propeller = new THREE.Mesh(propellerGeometry, propellerMaterial);
        this.propeller.position.set(0, 0, 4.5);
        this.airplane.add(this.propeller);
        
        // Create banner
        await this.createBanner();
        
        // Position initially - start at the front of the track (positive X)
        this.pathPosition = 30; // Start closer to the front (was 25)
        const startPos = this.options.path[Math.floor(this.pathPosition)];
        this.airplane.position.set(startPos.x, this.options.flyHeight, startPos.z);
        
        // Scale the entire airplane group up
        this.airplane.scale.set(1.5, 1.5, 1.5);
        
        this.scene.add(this.airplane);
    }
    
    /**
     * Create the advertising banner behind the airplane
     */
    async createBanner() {
        // Create banner canvas and texture
        const bannerCanvas = document.createElement('canvas');
        const bannerSize = this.calculateBannerSize();
        bannerCanvas.width = bannerSize.width;
        bannerCanvas.height = bannerSize.height;
        
        const ctx = bannerCanvas.getContext('2d');
        
        // Draw banner background
        ctx.fillStyle = this.options.bannerColor;
        ctx.fillRect(0, 0, bannerCanvas.width, bannerCanvas.height);
        
        // Draw banner border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 20;
        ctx.strokeRect(10, 10, bannerCanvas.width - 20, bannerCanvas.height - 20);
        
        // Draw banner text
        ctx.fillStyle = this.options.bannerTextColor;
        ctx.font = 'bold 240px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TOOLFOLIO.COM', bannerCanvas.width / 2, bannerCanvas.height / 2);
        
        // Create texture from canvas
        const bannerTexture = new THREE.CanvasTexture(bannerCanvas);
        bannerTexture.minFilter = THREE.LinearFilter;
        bannerTexture.magFilter = THREE.LinearFilter;
        
        // Create banner mesh with larger size
        const bannerGeometry = new THREE.PlaneGeometry(50, 7.5);
        const bannerMaterial = new THREE.MeshBasicMaterial({ 
            map: bannerTexture, 
            side: THREE.DoubleSide,
            transparent: true
        });
        
        this.banner = new THREE.Mesh(bannerGeometry, bannerMaterial);
        this.banner.position.set(0, 0, -22.5);
        
        // Create single rope connecting airplane to banner
        this.createBannerRope();
        
        // Group banner with rope
        this.bannerGroup = new THREE.Group();
        this.bannerGroup.add(this.banner);
        this.bannerGroup.add(this.bannerRopes[0]);
        
        // Add banner group to scene
        this.airplane.add(this.bannerGroup);
        
        // Apply minimal physics for stability
        this.bannerPoints = [];
        const segments = 2;
        for (let i = 0; i < segments; i++) {
            this.bannerPoints.push({
                offset: new THREE.Vector3(0, Math.sin(i * 0.2) * 0.1, -i * 3),
                velocity: new THREE.Vector3(0, 0, 0)
            });
        }
    }
    
    /**
     * Create single rope connecting airplane to banner
     */
    createBannerRope() {
        this.bannerRopes = []; // Clear existing ropes
        
        // Create a single rope from the back of the airplane to the banner
        const ropeLength = 20; // Slightly shorter for direct connection
        const ropeGeometry = new THREE.CylinderGeometry(0.05, 0.05, ropeLength, 4);
        ropeGeometry.rotateX(Math.PI / 2);
        const ropeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        // Single rope attached to the back center of the airplane
        const rope = new THREE.Mesh(ropeGeometry, ropeMaterial);
        rope.position.set(0, 0, -10); // Position at the back center of the airplane
        
        this.bannerRopes.push(rope);
    }
    
    /**
     * Calculate banner size based on text
     * @returns {Object} Width and height in pixels
     */
    calculateBannerSize() {
        const textLength = 'TOOLFOLIO.COM'.length;
        return {
            width: Math.max(2048, textLength * 220),
            height: 512
        };
    }
    
    /**
     * Generate a circular path for the airplane
     * @param {number} width - Width of ellipse
     * @param {number} depth - Depth of ellipse
     * @param {number} points - Number of points in path
     * @returns {Array} Array of Vector3 positions
     */
    generateCircularPath(width = 200, depth = 200, points = 100) {
        const path = [];
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const x = Math.cos(angle) * width;
            const z = Math.sin(angle) * depth;
            path.push(new THREE.Vector3(x, this.options.flyHeight, z));
        }
        return path;
    }
    
    /**
     * Update airplane position and animation
     * @param {number} deltaTime - Time since last frame
     */
    update(deltaTime) {
        if (!this.enabled || !this.airplane) return;
        
        // Move along path
        this.pathPosition += deltaTime * this.options.speed * 0.1;
        
        // Handle path position wrapping smoothly
        while (this.pathPosition >= this.options.path.length) {
            this.pathPosition -= this.options.path.length;
        }
        
        // Get current and next positions
        const index = Math.floor(this.pathPosition) % this.options.path.length;
        const nextIndex = (index + 1) % this.options.path.length;
        
        const currentPos = this.options.path[index];
        const nextPos = this.options.path[nextIndex];
        
        // Interpolate between positions
        const fraction = this.pathPosition - Math.floor(this.pathPosition);
        const newX = currentPos.x + (nextPos.x - currentPos.x) * fraction;
        const newZ = currentPos.z + (nextPos.z - currentPos.z) * fraction;
        
        this.airplane.position.set(newX, this.options.flyHeight, newZ);
        
        // Rotate airplane to face direction of travel
        const direction = new THREE.Vector3(
            nextPos.x - currentPos.x,
            0,
            nextPos.z - currentPos.z
        ).normalize();
        
        // Calculate target rotation
        const targetRotation = Math.atan2(direction.x, direction.z);
        
        // Smoothly rotate to target
        const currentRotation = this.airplane.rotation.y;
        const rotationDiff = targetRotation - currentRotation;
        
        // Handle angle wrapping
        let adjustedRotationDiff = rotationDiff;
        if (rotationDiff > Math.PI) adjustedRotationDiff = rotationDiff - Math.PI * 2;
        if (rotationDiff < -Math.PI) adjustedRotationDiff = rotationDiff + Math.PI * 2;
        
        // Apply rotation with smooth interpolation
        this.airplane.rotation.y += adjustedRotationDiff * Math.min(deltaTime * 3, 1);
        
        // Rotate propeller
        this.propellerRotation += deltaTime * 20;
        this.propeller.rotation.z = this.propellerRotation;
        
        // Update banner with minimal movement to maintain stability
        if (this.banner && this.bannerPoints) {
            const windEffect = Math.sin(Date.now() * 0.0001) * 0.01; // Very subtle movement
            
            // Apply minimal physics to banner
            this.bannerPoints.forEach((point, i) => {
                // Add very subtle wave movement
                const waveHeight = Math.sin(Date.now() * 0.0003 + i * 0.05) * 0.02;
                
                // Apply to banner vertices
                const section = this.banner.geometry.attributes.position.count / this.bannerPoints.length;
                for (let j = 0; j < section; j++) {
                    const vertex = i * section + j;
                    if (vertex < this.banner.geometry.attributes.position.count) {
                        // Only modify y position for wave effect
                        const y = this.banner.geometry.attributes.position.getY(vertex);
                        // Add strong damping to keep banner stable
                        const dampedEffect = (waveHeight + windEffect) * 0.5;
                        this.banner.geometry.attributes.position.setY(vertex, y + dampedEffect);
                    }
                }
            });
            
            this.banner.geometry.attributes.position.needsUpdate = true;
            
            // Keep banner aligned with airplane's direction
            this.banner.rotation.y = Math.PI; // Keep text readable
        }
    }
    
    /**
     * Enable or disable the airplane
     * @param {boolean} enabled - Whether to enable or disable
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (this.airplane) {
            this.airplane.visible = enabled;
        }
    }
    
    /**
     * Change the banner text
     * @param {string} text - New text for the banner
     */
    setBannerText(text) {
        this.options.bannerText = text;
        // Recreate the banner with new text
        if (this.banner) {
            this.airplane.remove(this.bannerGroup);
            this.banner = null;
            this.bannerRopes = [];
            this.createBanner();
        }
    }
    
    /**
     * Remove the airplane from the scene
     */
    remove() {
        if (this.airplane) {
            this.scene.remove(this.airplane);
        }
    }
} 