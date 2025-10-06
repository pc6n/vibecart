import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';

export class F1CarModel {
    constructor() {
        this.f1Model = null;
        this.f1Materials = null;
    }

    async create() {
        if (!this.f1Model) {
            await this.loadModel();
        }

        // Clone the loaded model for this instance
        const mesh = this.f1Model.clone();
        
        // Scale and position adjustments for F1
        mesh.scale.set(0.015, 0.015, 0.015);
        
        // Create a container group for the F1 model
        const f1Group = new THREE.Group();
        f1Group.add(mesh);
        
        // Apply initial rotation to the model inside the group
        mesh.rotation.y = Math.PI/2;
        
        // Add shadow casting
        f1Group.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        return f1Group;
    }

    async loadModel() {
        // Load materials first
        const mtlLoader = new MTLLoader();
        const textureLoader = new THREE.TextureLoader();
        
        try {
            // First load all textures
            const [diffuseMap, normalMap, specularMap] = await Promise.all([
                this.loadTexture(textureLoader, '/models/f1/textures/formula1_DefaultMaterial_Diffuse.png'),
                this.loadTexture(textureLoader, '/models/f1/textures/formula1_DefaultMaterial_Normal.png'),
                this.loadTexture(textureLoader, '/models/f1/textures/formula1_DefaultMaterial_Specular.png')
            ]);

            // Load materials
            this.f1Materials = await this.loadMaterials(mtlLoader, diffuseMap, normalMap, specularMap);
            
            // Load the model
            this.f1Model = await this.loadObj();
            
            return this.f1Model;
        } catch (error) {
            console.error('Error loading F1 model:', error);
            throw error;
        }
    }

    loadTexture(loader, path) {
        return new Promise((resolve) => loader.load(path, resolve));
    }

    loadMaterials(mtlLoader, diffuseMap, normalMap, specularMap) {
        return new Promise((resolve, reject) => {
            mtlLoader.setPath('/models/f1/');
            mtlLoader.load(
                'f1.mtl',
                (materials) => {
                    materials.preload();
                    Object.values(materials.materials).forEach(material => {
                        material.map = diffuseMap;
                        material.normalMap = normalMap;
                        material.specularMap = specularMap;
                    });
                    resolve(materials);
                },
                undefined,
                reject
            );
        });
    }

    loadObj() {
        const objLoader = new OBJLoader();
        objLoader.setMaterials(this.f1Materials);
        objLoader.setPath('/models/f1/');
        
        return new Promise((resolve, reject) => {
            objLoader.load(
                'f1.obj',
                resolve,
                undefined,
                reject
            );
        });
    }
} 