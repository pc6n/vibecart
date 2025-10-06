import * as THREE from 'three';
import { CarPhysics } from './components/CarPhysics';
import { CarVisuals } from './components/CarVisuals';
import { CarControls } from './components/CarControls';
import { CarItems } from './components/CarItems';
import { CarCollision } from './components/CarCollision';
import { CarEffects } from './components/CarEffects';

export class Car {
    constructor(scene, track, isRemote = false) {
        this.carInstanceId = Math.random().toString(36).substring(2, 10);
        this.scene = scene;
        this.track = track;
        this.isRemote = isRemote;
        
        // Initialize components
        this.physics = new CarPhysics(this);
        this.visuals = new CarVisuals(this);
        this.controls = new CarControls(this);
        this.items = new CarItems(this);
        this.collision = new CarCollision(this);
        this.effects = new CarEffects(this);
        
        // Initialize state
        this.position = new THREE.Vector3(this.track.trackRadius, 0.5, 0);
        this.previousPosition = this.position.clone();
        this.direction = new THREE.Vector3(0, 0, 1);
        this.rotation = 0;
        
        // Create the car mesh
        this.visuals.createCar();
    }

    update(delta) {
        if (this.isRemote) {
            this.visuals.updateVisuals();
            return;
        }

        const previousPosition = this.position.clone();
        const previousRotation = this.rotation;
        const previousSpeed = this.physics.speed;

        this.previousPosition.copy(this.position);

        // Update components
        this.physics.update(delta);
        this.controls.update();
        this.items.update();
        
        // Check collisions
        if (this.track.checkCollision(this.position)) {
            this.collision.handleCollision();
        }
        
        // Update track-related logic if track exists
        if (this.track) {
            // Updated to call with position and direction parameters
            this.track.checkLapProgress(this.position, this.direction);
        }

        // Notify of state changes
        this.notifyStateChangeIfNeeded(previousPosition, previousRotation, previousSpeed);
        
        // Update visuals
        this.visuals.updateVisuals();
    }

    notifyStateChangeIfNeeded(previousPosition, previousRotation, previousSpeed) {
        if (!this.onStateChange) return;
        
        const positionChanged = !previousPosition.equals(this.position);
        const rotationChanged = previousRotation !== this.rotation;
        const speedChanged = previousSpeed !== this.physics.speed;
        
        if (positionChanged || rotationChanged || speedChanged) {
            this.onStateChange();
        }
    }

    updateRemoteState(position, rotation) {
        this.position.copy(position);
        this.rotation = rotation;
        this.direction.x = Math.sin(rotation);
        this.direction.z = Math.cos(rotation);
        this.visuals.updateVisuals();
    }

    // Delegate methods to components
    setCarType(type) { this.visuals.setCarType(type); }
    setCarColor(color) { this.visuals.setCarColor(color); }
    setPlayerName(name) { this.visuals.setPlayerName(name); }
    
    // Control methods
    accelerate(accelerating) { this.controls.accelerate(accelerating); }
    brake(braking) { this.controls.brake(braking); }
    reverse(reversing) { this.controls.reverse(reversing); }
    turnLeft(turning) { this.controls.turnLeft(turning); }
    turnRight(turning) { this.controls.turnRight(turning); }
    
    // Item methods
    useItem() { this.items.useItem(); }
    pickupItem() { this.items.pickupItem(); }
} 