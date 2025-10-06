import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
import { ClassicCarModel } from '../models/ClassicCarModel';
import { TeslaCarModel } from '../models/TeslaCarModel';
import { F1CarModel } from '../models/F1CarModel';

export class CarVisuals {
    constructor(car) {
        this.car = car;
        this.carType = 'classic';
        this.carColor = new THREE.Color(0xff0000);
        this.f1Model = null;
        this.f1Materials = null;
        this.nameTag = null;
        this.bodyMaterial = null;
        this.roofMaterial = null;
    }

    async createCar() {
        if (this.car.mesh) {
            if (this.nameTag) {
                this.car.mesh.remove(this.nameTag);
            }
            this.car.scene.remove(this.car.mesh);
            this.car.mesh = null;
        }

        switch (this.carType) {
            case 'tesla':
                this.createTeslaModel();
                break;
            case 'f1':
                await this.createF1Model();
                break;
            default:
                this.createClassicModel();
                break;
        }

        if (this.car.mesh) {
            this.car.mesh.position.copy(this.car.position);
            this.car.mesh.rotation.y = this.car.rotation;
            this.car.scene.add(this.car.mesh);
            this.createPlayerNameTag();
        }
    }

    setCarType(type) {
        this.carType = type;
        this.createCar();
    }

    setCarColor(color) {
        this.carColor = new THREE.Color(color);
        if (this.car.mesh) {
            this.car.mesh.traverse((child) => {
                if (child.isMesh && child.material.color) {
                    if (child.material === this.bodyMaterial) {
                        child.material.color.copy(this.carColor);
                    } else if (child.material === this.roofMaterial) {
                        const darkerColor = this.carColor.clone().multiplyScalar(0.8);
                        child.material.color.copy(darkerColor);
                    }
                }
            });
        }
    }

    createClassicModel() {
        const model = new ClassicCarModel(this.carColor);
        this.car.mesh = model.create();
        this.bodyMaterial = model.bodyMaterial;
        this.roofMaterial = model.roofMaterial;
        this.car.wheels = model.wheels;
    }

    createTeslaModel() {
        const model = new TeslaCarModel(this.carColor);
        this.car.mesh = model.create();
        this.bodyMaterial = model.bodyMaterial;
        this.roofMaterial = model.roofMaterial;
        this.car.wheels = model.wheels;
    }

    async createF1Model() {
        const model = new F1CarModel();
        this.car.mesh = await model.create();
        this.f1Model = model.f1Model;
        this.f1Materials = model.f1Materials;
    }

    updateVisuals() {
        if (!this.car.mesh) return;
        
        this.car.mesh.position.copy(this.car.position);
        this.car.mesh.rotation.y = this.car.rotation;
        
        this.updateWheels();
        this.updateNameTag();
        
        this.car.mesh.updateMatrix();
        this.car.mesh.updateMatrixWorld(true);
    }

    updateWheels() {
        if (!this.car.wheels || this.car.wheels.length === 0) return;
        
        const speed = this.car.physics.isInReverse() ? -this.car.physics.speed : this.car.physics.speed;
        const rotationSpeed = speed / 0.5; // wheelRadius = 0.5

        // Front wheels
        if (this.car.wheels[0] && this.car.wheels[1]) {
            const steeringAngle = this.car.controls.isTurningLeft ? Math.PI / 8 : 
                                this.car.controls.isTurningRight ? -Math.PI / 8 : 0;
            
            this.car.wheels[0].rotation.y = steeringAngle;
            this.car.wheels[1].rotation.y = steeringAngle;
            
            this.car.wheels[0].rotation.x += rotationSpeed * 0.01;
            this.car.wheels[1].rotation.x += rotationSpeed * 0.01;
        }
        
        // Rear wheels
        if (this.car.wheels[2] && this.car.wheels[3]) {
            this.car.wheels[2].rotation.x += rotationSpeed * 0.01;
            this.car.wheels[3].rotation.x += rotationSpeed * 0.01;
        }
    }

    createPlayerNameTag() {
        if (!this.car.mesh) return;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;

        context.fillStyle = 'rgba(0, 0, 0, 0.6)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        context.strokeStyle = '#000000';
        context.lineWidth = 4;
        context.strokeText(this.car.playerName, canvas.width/2, canvas.height/2);
        
        context.fillStyle = '#ffffff';
        context.fillText(this.car.playerName, canvas.width/2, canvas.height/2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        if (this.nameTag) {
            this.car.mesh.remove(this.nameTag);
        }

        this.nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
        this.nameTag.scale.set(2.5, 0.6, 1);
        this.nameTag.position.set(0, 3, 0);
        
        this.car.mesh.add(this.nameTag);
    }

    updateNameTag() {
        if (!this.nameTag) return;
        
        this.nameTag.position.set(0, 3, 0);
        
        const camera = this.car.scene.getObjectByProperty('type', 'PerspectiveCamera');
        if (camera) {
            this.nameTag.lookAt(camera.position);
            this.nameTag.rotation.x = 0;
            this.nameTag.rotation.z = 0;
        }
    }

    setPlayerName(name) {
        this.car.playerName = name;
        localStorage.setItem('playerName', name);
        this.createPlayerNameTag();
    }
} 