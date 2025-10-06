import * as THREE from 'three';

export class ShellItem {
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
        // Create a red shiny shell item
        const geometry = new THREE.SphereGeometry(0.6, 16, 16);
        
        // Shell material - shiny red
        const material = new THREE.MeshPhongMaterial({
            color: 0xff0000, // Bright red
            emissive: 0x330000,
            emissiveIntensity: 0.3,
            shininess: 80,
            specular: 0x444444,
            transparent: true,
            opacity: 0.9
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.mesh.userData.type = 'shell';
        
        // Add a "spike" on top to make it look more like a shell
        const spikeGeometry = new THREE.ConeGeometry(0.2, 0.4, 8);
        const spikeMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0x330000,
            emissiveIntensity: 0.3,
            shininess: 80
        });
        
        const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
        spike.position.y = 0.5;
        this.mesh.add(spike);
        
        // Add to scene
        this.scene.add(this.mesh);
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
            const flash = new THREE.PointLight(0xff0000, 5, 10); // Red flash
            flash.position.copy(this.mesh.position);
            this.scene.add(flash);

            // Remove the flash after 200ms
            setTimeout(() => {
                this.scene.remove(flash);
            }, 200);

            // Remove the item
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
            this.mesh = null;
        }
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.traverse((child) => {
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
            this.mesh = null;
        }
    }
} 