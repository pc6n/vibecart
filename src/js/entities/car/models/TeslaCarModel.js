import * as THREE from 'three';

export class TeslaCarModel {
    constructor(carColor) {
        this.carColor = carColor;
        this.wheels = [];
        this.bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: this.carColor,
            shininess: 100
        });
        this.roofMaterial = new THREE.MeshPhongMaterial({ 
            color: this.carColor.clone().multiplyScalar(0.8),
            shininess: 100
        });
    }

    create() {
        const carGroup = new THREE.Group();
    
        // Main body: a sleek, low profile box
        const bodyGeometry = new THREE.BoxGeometry(1.85, 0.5, 4.7);
        const body = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
        body.position.y = 0.5;
        carGroup.add(body);
    
        // Curved roof using BufferGeometry
        const roofGeometry = new THREE.BoxGeometry(1.85, 0.3, 2.2);
        const positionAttribute = roofGeometry.getAttribute('position');
        const positions = positionAttribute.array;
        
        // Modify the top vertices to create a curve
        for (let i = 0; i < positions.length; i += 3) {
            const y = positions[i + 1];
            if (y > 0) {
                const x = positions[i];
                const normalizedX = (x + 0.925) / 1.85;
                positions[i + 1] = y + Math.sin(normalizedX * Math.PI) * 0.2;
            }
        }
        
        positionAttribute.needsUpdate = true;
        roofGeometry.computeVertexNormals();
        
        const roof = new THREE.Mesh(roofGeometry, this.roofMaterial);
        roof.position.y = 0.8;
        roof.position.z = -1.0;
        carGroup.add(roof);
    
        this.addWindshields(carGroup);
        this.addLights(carGroup);
        this.addWheels(carGroup);
    
        carGroup.castShadow = true;
        carGroup.receiveShadow = true;
        
        return carGroup;
    }

    addWindshields(carGroup) {
        const windshieldGeometry = new THREE.PlaneGeometry(1.8, 1.0);
        const windshieldMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x84afdb,
            transparent: true,
            opacity: 0.7,
            shininess: 100,
            side: THREE.DoubleSide
        });

        // Front windshield
        const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
        windshield.position.set(0, 0.95, -1.7);
        windshield.rotation.x = -Math.PI / 4;
        carGroup.add(windshield);
    
        // Rear windshield
        const rearWindshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
        rearWindshield.position.set(0, 0.95, 1.7);
        rearWindshield.rotation.x = Math.PI / 4;
        carGroup.add(rearWindshield);
    }

    addLights(carGroup) {
        // Headlights
        const headlightGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16);
        const headlightMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.5
        });

        const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        leftHeadlight.rotation.z = Math.PI / 2;
        leftHeadlight.position.set(-0.4, 0.55, -2.35);
        carGroup.add(leftHeadlight);

        const rightHeadlight = leftHeadlight.clone();
        rightHeadlight.position.x = 0.4;
        carGroup.add(rightHeadlight);
    
        // Taillights
        const taillightGeometry = new THREE.BoxGeometry(0.15, 0.1, 0.05);
        const taillightMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5
        });

        const leftTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        leftTaillight.position.set(-0.5, 0.55, 2.35);
        carGroup.add(leftTaillight);

        const rightTaillight = leftTaillight.clone();
        rightTaillight.position.x = 0.5;
        carGroup.add(rightTaillight);
    }

    addWheels(carGroup) {
        const wheelRadius = 0.45;
        const wheelWidth = 0.3;
        const y = 0.3;
        const xOffset = 0.9;
        const frontZ = -1.7;
        const rearZ = 1.7;
    
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