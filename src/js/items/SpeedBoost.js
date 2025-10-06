import * as THREE from 'three';

export class SpeedBoost {
    constructor(scene, position) {
        this.scene = scene;
        this.mesh = null;
        this.rotationSpeed = 2;
        this.floatAmplitude = 0.3;
        this.floatSpeed = 2;
        this.initialY = position.y;
        this.createMesh(position);
    }

    createMesh(position) {
        // Create a glowing box for the speed boost
        console.log('[SPEED-BOOST] Creating mesh at position:', position);
        
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00ff00,
            emissive: 0x00ff00,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.mesh.userData.type = 'speedBoost';
        
        // Add to scene
        this.scene.add(this.mesh);
        console.log('[SPEED-BOOST] Mesh added to scene with ID:', this.mesh.id);
    }

    update(deltaTime) {
        if (!this.mesh) return;

        // Rotate the item
        this.mesh.rotation.y += this.rotationSpeed * deltaTime;

        // Make it float up and down
        const floatOffset = Math.sin(Date.now() * 0.002 * this.floatSpeed) * this.floatAmplitude;
        this.mesh.position.y = this.initialY + floatOffset;
    }

    collect() {
        if (this.mesh) {
            // Create a flash effect
            const flash = new THREE.PointLight(0x00ff00, 10, 10);
            flash.position.copy(this.mesh.position);
            this.scene.add(flash);

            // Remove the flash after 200ms
            setTimeout(() => {
                this.scene.remove(flash);
            }, 200);

            // Remove the item
            this.scene.remove(this.mesh);
            this.mesh = null;
        }
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
            this.mesh = null;
        }
    }
} 