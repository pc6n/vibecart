import * as THREE from 'three';

export class CarPhysics {
    constructor(car) {
        this.car = car;
        
        // Physics properties
        this.speed = 0;
        this.maxSpeed = 55.28; // m/s (equivalent to 199 km/h)
        this.maxReverseSpeed = 20; // m/s (about 72 km/h)
        this.acceleration = 50;
        this.reverseAcceleration = 40;
        this.deceleration = 25;
        this.brakeDeceleration = 50;
        this.turnSpeed = Math.PI * 0.6;
        this.turnSmoothing = 0.8;
        this.currentTurnRate = 0;
        
        // Bounce properties
        this.bounceStrength = 5;
        this.bounceDecay = 0.8;
        this.bounceVelocity = new THREE.Vector3();
    }

    update(delta) {
        this.updateSpeed(delta);
        this.updateRotation(delta);
        this.updatePosition(delta);
    }

    updateSpeed(delta) {
        const acceleration = this.calculateAcceleration();
        this.speed += acceleration * delta;
        this.speed = Math.max(-this.maxReverseSpeed, Math.min(this.speed, this.maxSpeed));
        
        if (Math.abs(this.speed) < 0.1) {
            this.speed = 0;
        }
    }

    calculateAcceleration() {
        const controls = this.car.controls;
        
        if (controls.isAccelerating && !controls.isReversing) {
            return this.speed < this.maxSpeed ? this.acceleration : 0;
        }
        
        if (controls.isReversing && !controls.isAccelerating) {
            return this.speed > -this.maxReverseSpeed ? -this.reverseAcceleration : 0;
        }
        
        if (Math.abs(this.speed) > 0) {
            return this.speed > 0 ? -this.deceleration : this.deceleration;
        }
        
        return 0;
    }

    updateRotation(delta) {
        if (this.speed === 0) {
            this.currentTurnRate *= this.turnSmoothing;
            return;
        }

        const turnFactor = this.speed / this.maxSpeed;
        let targetTurnRate = 0;
        
        if (this.car.controls.isTurningLeft) {
            targetTurnRate = this.turnSpeed * Math.sign(this.speed) * Math.abs(turnFactor);
        } else if (this.car.controls.isTurningRight) {
            targetTurnRate = -this.turnSpeed * Math.sign(this.speed) * Math.abs(turnFactor);
        }
        
        this.currentTurnRate = this.currentTurnRate * this.turnSmoothing + 
                             targetTurnRate * (1 - this.turnSmoothing);
        
        this.car.rotation += this.currentTurnRate * delta;
        
        this.car.direction.x = Math.sin(this.car.rotation);
        this.car.direction.z = Math.cos(this.car.rotation);
    }

    updatePosition(delta) {
        const finalSpeed = this.getSpeed();
        
        const movement = this.car.direction.clone().multiplyScalar(finalSpeed * delta);
        this.car.position.add(movement);
        this.car.position.add(this.bounceVelocity.clone().multiplyScalar(delta));
        
        this.bounceVelocity.multiplyScalar(this.bounceDecay);
    }

    getSpeed() {
        if (this.car.effects.speedBoostActive) {
            return this.speed * this.car.effects.speedBoostFactor;
        }
        return this.speed;
    }

    getAbsoluteSpeed() {
        return Math.abs(this.getSpeed());
    }

    isInReverse() {
        return this.speed < 0;
    }

    applyBounce(direction, intensity) {
        const bounceSpeed = Math.abs(this.speed) / this.maxSpeed;
        const bounceFactor = this.bounceStrength * bounceSpeed * intensity;
        
        this.bounceVelocity.x = direction.x * bounceFactor;
        this.bounceVelocity.z = direction.z * bounceFactor;
    }
} 