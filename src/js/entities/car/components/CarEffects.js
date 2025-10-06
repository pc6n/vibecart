import * as THREE from 'three';

export class CarEffects {
    constructor(car) {
        this.car = car;
        
        // Speed boost properties
        this.speedBoostActive = false;
        this.speedBoostFactor = 2.0;
        this.speedBoostDuration = 3000;
        this.speedBoostTimeout = null;
        this.boostParticles = null;
    }

    applySpeedBoost() {
        if (this.speedBoostActive) {
            this.extendSpeedBoost();
        } else {
            this.activateSpeedBoost();
        }
    }
    
    activateSpeedBoost() {
        this.speedBoostActive = true;
        this.speedBoostFactor = 1.41;
        
        this.showBoostEffect();
        this.showSpeedBoostIndicator();
        
        this.speedBoostTimeout = setTimeout(() => {
            this.deactivateSpeedBoost();
        }, this.speedBoostDuration);
    }
    
    extendSpeedBoost() {
        if (this.speedBoostTimeout) {
            clearTimeout(this.speedBoostTimeout);
        }
        
        this.speedBoostTimeout = setTimeout(() => {
            this.deactivateSpeedBoost();
        }, this.speedBoostDuration);
    }
    
    deactivateSpeedBoost() {
        this.speedBoostActive = false;
        this.speedBoostFactor = 1.0;
        
        this.hideBoostEffect();
        this.hideSpeedBoostIndicator();
        
        if (this.speedBoostTimeout) {
            clearTimeout(this.speedBoostTimeout);
            this.speedBoostTimeout = null;
        }
    }

    showBoostEffect() {
        if (!this.car.mesh) return;

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
        this.car.mesh.add(this.boostParticles);
    }

    hideBoostEffect() {
        if (this.boostParticles) {
            if (this.car.mesh) {
                this.car.mesh.remove(this.boostParticles);
            }
            if (this.car.scene) {
                this.car.scene.remove(this.boostParticles);
            }
            this.boostParticles.geometry.dispose();
            this.boostParticles.material.dispose();
            this.boostParticles = null;
        }
    }

    showSpeedBoostIndicator() {
        if (this.car.isRemote) return;
        const indicator = document.getElementById('speed-boost-indicator');
        if (indicator) {
            indicator.style.opacity = '1';
        }
    }

    hideSpeedBoostIndicator() {
        if (this.car.isRemote) return;
        const indicator = document.getElementById('speed-boost-indicator');
        if (indicator) {
            indicator.style.opacity = '0';
        }
    }

    shakeCamera(intensity) {
        const camera = this.car.scene.getObjectByProperty('type', 'PerspectiveCamera');
        if (camera) {
            const shake = new THREE.Vector3(
                (Math.random() - 0.5) * intensity,
                (Math.random() - 0.5) * intensity,
                (Math.random() - 0.5) * intensity
            );
            camera.position.add(shake);
            
            setTimeout(() => {
                camera.position.sub(shake);
            }, 100);
        }
    }
} 