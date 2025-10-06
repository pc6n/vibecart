import * as THREE from 'three';

export class ClassicCarModel {
    constructor(carColor) {
        this.carColor = carColor;
        this.wheels = [];
        this.bodyMaterial = new THREE.MeshPhongMaterial({ color: this.carColor });
        this.roofMaterial = new THREE.MeshPhongMaterial({ 
            color: this.carColor.clone().multiplyScalar(0.8) 
        });
    }

    create() {
        const carGroup = new THREE.Group();
        
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
        
        carGroup.castShadow = true;
        carGroup.receiveShadow = true;
        
        return carGroup;
    }

    addWheels(carGroup) {
        const wheelRadius = 0.5;
        const wheelWidth = 0.4;
        const y = 0.3;
        const xOffset = 1.1;
        const frontZ = -1.3;
        const rearZ = 1.3;
    
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
} 