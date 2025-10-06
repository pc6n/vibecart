import * as THREE from 'three';

export class Scenery {
    constructor(scene) {
        this.scene = scene;
        this.clouds = [];
        this.lastCloudUpdate = 0;
    }

    /**
     * Update method to animate all scenery elements
     * @param {number} deltaTime - Time since last frame
     */
    update(deltaTime) {
        // Animate clouds
        this.animateClouds(deltaTime);
    }

    addTrees(trackRadius, trackWidth, groundSize) {
        // Define tree clusters outside the track
        const treePositions = [
            { x: -trackRadius * 1.5, z: 0, count: 10, radius: 30 },
            { x: trackRadius * 1.5, z: 0, count: 12, radius: 35 },
            { x: 0, z: -trackRadius * 1.5, count: 12, radius: 35 },
            { x: 0, z: trackRadius * 1.5, count: 14, radius: 40 },
            // Add more clusters around the track
            { x: trackRadius * 1.2, z: trackRadius * 1.2, count: 8, radius: 25 },
            { x: -trackRadius * 1.2, z: trackRadius * 1.2, count: 8, radius: 25 },
            { x: trackRadius * 1.2, z: -trackRadius * 1.2, count: 8, radius: 25 },
            { x: -trackRadius * 1.2, z: -trackRadius * 1.2, count: 8, radius: 25 }
        ];

        // Add tree clusters
        treePositions.forEach(cluster => {
            for (let i = 0; i < cluster.count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * cluster.radius;
                const x = cluster.x + Math.cos(angle) * distance;
                const z = cluster.z + Math.sin(angle) * distance;
                
                // Make sure the tree is not on the track
                const distFromCenter = Math.sqrt(x * x + z * z);
                const trackMinRadius = trackRadius - trackWidth / 2 - 2;
                const trackMaxRadius = trackRadius + trackWidth / 2 + 2;
                
                if (distFromCenter < trackMinRadius || distFromCenter > trackMaxRadius) {
                    // Check if the tree would be in grandstand areas (near the start/finish line)
                    const isNearGrandstand = this.isNearGrandstand(x, z, trackRadius, trackWidth);
                    
                    if (!isNearGrandstand) {
                        // Choose tree type with more variety
                        const treeType = Math.random();
                        if (treeType > 0.7) {
                            this.createPalmTree(x, z);
                        } else if (treeType > 0.4) {
                            this.createTree(x, z);
                        } else {
                            this.createTallTree(x, z);
                        }
                    }
                }
            }
        });

        // Place more random trees off the track
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            // Vary distance to place trees throughout the environment
            const distance = 20 + Math.random() * (groundSize / 2 - 40);
            
            // Skip if too close to track
            if (Math.abs(distance - trackRadius) < trackWidth + 5) {
                continue;
            }
            
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            
            // Check if the tree would be in grandstand areas
            const isNearGrandstand = this.isNearGrandstand(x, z, trackRadius, trackWidth);
            
            if (!isNearGrandstand) {
                // Choose tree type with more variety
                const treeType = Math.random();
                if (treeType > 0.7) {
                    this.createPalmTree(x, z);
                } else if (treeType > 0.4) {
                    this.createTree(x, z);
                } else {
                    this.createTallTree(x, z);
                }
            }
        }
        
        // Add some smaller bushes and vegetation around the track edges
        this.addTrackEdgeVegetation(trackRadius, trackWidth);
    }
    
    // Helper to check if a position is near a grandstand
    isNearGrandstand(x, z, trackRadius, trackWidth) {
        // Grandstand positions from Grandstand.js
        const innerRadius = trackRadius - trackWidth / 2;
        const outerRadius = trackRadius + trackWidth / 2;
        const offset = 40; // Use a larger distance than the grandstand offset to give more clearance
        
        // Inner grandstand position (at angle 0 - start line)
        const innerGrandstandX = (innerRadius - offset) * Math.cos(0);
        const innerGrandstandZ = (innerRadius - offset) * Math.sin(0);
        
        // Outer grandstand position (at angle PI - directly opposite)
        const outerGrandstandX = (outerRadius + offset) * Math.cos(Math.PI);
        const outerGrandstandZ = (outerRadius + offset) * Math.sin(Math.PI);
        
        // Size of exclusion zone around grandstands
        const grandstandWidth = 60; // Slightly larger than the actual width
        const grandstandDepth = 30; // Slightly larger than the actual depth
        
        // Check if position is within the inner grandstand area
        const innerDist = Math.sqrt(
            Math.pow(x - innerGrandstandX, 2) + 
            Math.pow(z - innerGrandstandZ, 2)
        );
        
        // Check if position is within the outer grandstand area
        const outerDist = Math.sqrt(
            Math.pow(x - outerGrandstandX, 2) + 
            Math.pow(z - outerGrandstandZ, 2)
        );
        
        // Return true if position is inside either exclusion zone
        return innerDist < grandstandWidth || outerDist < grandstandWidth;
    }
    
    // Add vegetation along track edges
    addTrackEdgeVegetation(trackRadius, trackWidth) {
        // Increase the offset from track edges (from 3 to 8 units)
        const innerRadius = trackRadius - trackWidth / 2 - 8;
        const outerRadius = trackRadius + trackWidth / 2 + 8;
        
        // Add some bushes/small vegetation along track edges
        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            
            // Randomly place on inner or outer edge
            const useInnerEdge = Math.random() > 0.5;
            
            const radius = useInnerEdge ? innerRadius : outerRadius;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            // Check if near grandstand
            const isNearGrandstand = this.isNearGrandstand(x, z, trackRadius, trackWidth);
            
            if (!isNearGrandstand) {
                this.createBush(x, z);
            }
        }
    }
    
    createBush(x, z) {
        // Create a bush group
        const bushGroup = new THREE.Group();
        bushGroup.position.set(x, 0, z);
        bushGroup.name = "bush";
        bushGroup.userData.type = "vegetation";
        
        // Base size for the bush
        const baseSize = 0.8 + Math.random() * 0.6;
        
        // Create multiple sphere clusters for a more natural bush shape
        const clusterCount = 3 + Math.floor(Math.random() * 3); // 3-5 clusters
        
        for (let i = 0; i < clusterCount; i++) {
            // Vary the size of each cluster
            const clusterSize = baseSize * (0.7 + Math.random() * 0.6);
            
            // Create geometry with more segments for smoother look
            const clusterGeometry = new THREE.SphereGeometry(clusterSize, 8, 6);
            
            // Create a richer green color with slight variations
            const hue = 0.33 + (Math.random() * 0.05 - 0.025); // Green hue with slight variation
            const saturation = 0.6 + Math.random() * 0.2; // Higher saturation
            const lightness = 0.25 + Math.random() * 0.15; // Darker for more depth
            const bushColor = new THREE.Color().setHSL(hue, saturation, lightness);
            
            const clusterMaterial = new THREE.MeshPhongMaterial({ 
                color: bushColor,
                flatShading: true,
                shininess: 0 // Reduce shininess for a more natural look
            });
            
            const cluster = new THREE.Mesh(clusterGeometry, clusterMaterial);
            
            // Position each cluster slightly offset from center
            const angle = (i / clusterCount) * Math.PI * 2;
            const radius = clusterSize * 0.3; // Overlap clusters for density
            cluster.position.set(
                Math.cos(angle) * radius,
                clusterSize * 0.8, // Raise slightly off ground
                Math.sin(angle) * radius
            );
            
            // Random slight rotation for variety
            cluster.rotation.x = Math.random() * 0.4 - 0.2;
            cluster.rotation.z = Math.random() * 0.4 - 0.2;
            
            // Add some vertex displacement for a more natural look
            const positions = cluster.geometry.attributes.position.array;
            for (let j = 0; j < positions.length; j += 3) {
                positions[j] += (Math.random() - 0.5) * 0.3;
                positions[j + 1] += (Math.random() - 0.5) * 0.3;
                positions[j + 2] += (Math.random() - 0.5) * 0.3;
            }
            cluster.geometry.computeVertexNormals();
            
            // Add shadows
            cluster.castShadow = true;
            cluster.receiveShadow = true;
            
            bushGroup.add(cluster);
        }
        
        // Add some smaller detail clusters
        const detailCount = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < detailCount; i++) {
            const detailSize = baseSize * 0.4;
            const detailGeometry = new THREE.SphereGeometry(detailSize, 6, 4);
            
            // Slightly darker color for depth
            const hue = 0.33 + (Math.random() * 0.05 - 0.025);
            const saturation = 0.6 + Math.random() * 0.2;
            const lightness = 0.2 + Math.random() * 0.1;
            const detailColor = new THREE.Color().setHSL(hue, saturation, lightness);
            
            const detailMaterial = new THREE.MeshPhongMaterial({
                color: detailColor,
                flatShading: true,
                shininess: 0
            });
            
            const detail = new THREE.Mesh(detailGeometry, detailMaterial);
            
            // Position details around the main clusters
            const angle = (i / detailCount) * Math.PI * 2;
            const radius = baseSize * 0.8;
            detail.position.set(
                Math.cos(angle) * radius,
                baseSize * (0.6 + Math.random() * 0.4),
                Math.sin(angle) * radius
            );
            
            detail.castShadow = true;
            detail.receiveShadow = true;
            
            bushGroup.add(detail);
        }
        
        this.scene.add(bushGroup);
    }

    createTallTree(x, z) {
        // Create a taller, more slender tree
        const height = 8 + Math.random() * 4;
        const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.6, height, 8);
        const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(x, height/2, z);
        trunk.name = "tall_tree_trunk";
        trunk.userData.type = "tree";
        trunk.castShadow = true;
        
        // Multiple foliage sections for a more realistic tree
        const foliageCount = 2 + Math.floor(Math.random() * 3);
        const foliageSize = 2.5;
        const foliageSpacing = height / (foliageCount + 1);
        
        // Vary the green color
        const greenShade = 0.1 + Math.random() * 0.2;
        
        for (let i = 0; i < foliageCount; i++) {
            const foliageY = height - foliageSpacing * i;
            const foliageGeometry = new THREE.SphereGeometry(foliageSize * (1 - i * 0.1), 8, 8);
            const foliageMaterial = new THREE.MeshPhongMaterial({ 
                color: new THREE.Color(0.1, 0.5 + greenShade, 0.1),
                flatShading: true
            });
            
            const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
            foliage.position.set(x, foliageY, z);
            foliage.name = "tall_tree_foliage_" + i;
            foliage.userData.type = "tree";
            foliage.castShadow = true;
            
            this.scene.add(foliage);
        }
        
        this.scene.add(trunk);
    }

    createTree(x, z) {
        const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 5, 8);
        const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(x, 2.5, z);
        trunk.name = "tree_trunk";
        trunk.userData.type = "tree";
        trunk.castShadow = true;
        
        // Vary the green color
        const greenShade = Math.random() * 0.3;
        
        const foliageGeometry = new THREE.ConeGeometry(2, 4, 8);
        const foliageMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color(0.1, 0.6 + greenShade, 0.1)
        });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.set(x, 6, z);
        foliage.name = "tree_foliage";
        foliage.userData.type = "tree";
        foliage.castShadow = true;
        
        this.scene.add(trunk);
        this.scene.add(foliage);
    }

    createPalmTree(x, z) {
        // Trunk - increased height by 1.0 units to fully reach the fronds
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 9.0, 8);
        const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(x, 4.5, z); // Adjusted y-position to account for taller trunk
        trunk.name = "palm_tree_trunk";
        trunk.userData.type = "palm_tree";
        this.scene.add(trunk);
        
        // Create a group for fronds - keep at same position
        const frondGroup = new THREE.Group();
        frondGroup.position.set(x, 7.6, z);
        frondGroup.name = "palm_tree_fronds";
        frondGroup.userData.type = "palm_tree";
        
        // Add palm fronds (leaf-like structures)
        const frondCount = 7;
        const frondLength = 5;
        const frondMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x3A5F0B,
            side: THREE.DoubleSide
        });
        
        for (let i = 0; i < frondCount; i++) {
            const angle = (i / frondCount) * Math.PI * 2;
            const angleOffset = Math.random() * 0.3;
            
            // Wider fronds
            const frondGeometry = new THREE.BoxGeometry(0.7, 0.1, frondLength);
            
            // Taper frond width from base to tip
            const positions = frondGeometry.attributes.position.array;
            for (let j = 0; j < positions.length; j += 3) {
                const z = positions[j+2];
                if (z > 0) {
                    // Taper width as we go further from base
                    const scaleFactor = 1 - (z / frondLength) * 0.7;
                    positions[j] *= scaleFactor; // Scale x (width)
                }
            }
            
            const frond = new THREE.Mesh(frondGeometry, frondMaterial);
            
            // Position frond with slight offset so it starts at the center
            frond.position.set(0, 0, frondLength / 2 - 0.2);
            
            // Rotate frond to point DOWNWARD instead of upward
            frond.rotation.x = Math.PI / 4; // 45 degrees down
            
            // Create a container to rotate around Y axis
            const frondContainer = new THREE.Group();
            frondContainer.rotation.y = angle + angleOffset;
            frondContainer.add(frond);
            frondContainer.name = `palm_tree_frond_${i}`;
            frondContainer.userData.type = "palm_tree";
            
            frondGroup.add(frondContainer);
        }
        
        this.scene.add(frondGroup);
    }

    createMountains() {
        const mountainPositions = [
            { x: 200, z: 200, height: 100, width: 150 },
            { x: -200, z: 200, height: 120, width: 180 },
            { x: 200, z: -200, height: 80, width: 130 },
            { x: -200, z: -200, height: 150, width: 200 }
        ];

        mountainPositions.forEach(pos => {
            const mountainGeometry = new THREE.ConeGeometry(pos.width / 2, pos.height, 4);
            const mountainMaterial = new THREE.MeshPhongMaterial({ 
                color: 0x808080, 
                flatShading: true 
            });
            const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
            mountain.position.set(pos.x, pos.height / 2, pos.z);
            mountain.castShadow = true;
            this.scene.add(mountain);
        });
    }

    createClouds(groundSize) {
        // Create a group to hold all clouds
        const cloudGroup = new THREE.Group();
        cloudGroup.name = "clouds";
        
        // Create several clouds at random positions
        const cloudCount = 12;
        const minHeight = 40;
        const maxHeight = 60;
        
        for (let i = 0; i < cloudCount; i++) {
            // Random position within bounds
            const angle = Math.random() * Math.PI * 2;
            const radius = (groundSize * 0.3) + Math.random() * (groundSize * 0.2);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = minHeight + Math.random() * (maxHeight - minHeight);
            
            const cloud = this.createSingleCloud();
            cloud.position.set(x, y, z);
            
            // Random rotation
            cloud.rotation.y = Math.random() * Math.PI * 2;
            
            // Add some random movement parameters
            cloud.userData.speed = 0.2 + Math.random() * 0.3;
            cloud.userData.radius = radius;
            cloud.userData.angle = angle;
            cloud.userData.heightVariation = Math.random() * 2;
            cloud.userData.heightPhase = Math.random() * Math.PI * 2;
            
            cloudGroup.add(cloud);
            this.clouds.push(cloud);
        }
        
        this.scene.add(cloudGroup);
    }
    
    createSingleCloud() {
        const cloudGroup = new THREE.Group();
        cloudGroup.name = "cloud";
        
        // Create multiple segments for each cloud
        const segmentCount = 3 + Math.floor(Math.random() * 3);
        const baseSize = 4 + Math.random() * 2;
        
        for (let i = 0; i < segmentCount; i++) {
            // Create a slightly different size for each segment
            const size = baseSize * (0.8 + Math.random() * 0.4);
            const height = size * 0.6;
            
            // Use BoxGeometry for a more stylized look
            const geometry = new THREE.BoxGeometry(size, height, size);
            
            // Use MeshBasicMaterial for pure white unaffected by lighting
            const cloudMaterial = new THREE.MeshBasicMaterial({
                color: 0xFFFFFF,
                transparent: true,
                opacity: 0.98
            });
            
            const segment = new THREE.Mesh(geometry, cloudMaterial);
            
            // Position segments relative to each other
            const angle = (i / segmentCount) * Math.PI * 2;
            const radius = size * 0.3;
            segment.position.set(
                Math.cos(angle) * radius,
                (Math.random() - 0.5) * height * 0.3,
                Math.sin(angle) * radius
            );
            
            // Random rotation for variety
            segment.rotation.y = Math.random() * Math.PI * 0.25;
            
            // Add some vertex displacement for a more natural look
            const positions = segment.geometry.attributes.position.array;
            for (let j = 0; j < positions.length; j += 3) {
                positions[j] += (Math.random() - 0.5) * 0.2 * size;
                positions[j + 1] += (Math.random() - 0.5) * 0.2 * height;
                positions[j + 2] += (Math.random() - 0.5) * 0.2 * size;
            }
            segment.geometry.computeVertexNormals();
            
            cloudGroup.add(segment);
        }
        
        return cloudGroup;
    }
    
    // Add this method to animate clouds
    animateClouds(deltaTime) {
        if (!this.clouds.length) return;
        
        this.clouds.forEach(cloud => {
            // Update cloud position at 1/3 the previous speed
            cloud.userData.angle += deltaTime * cloud.userData.speed * 0.03; // Reduced from 0.1
            const newX = Math.cos(cloud.userData.angle) * cloud.userData.radius;
            const newZ = Math.sin(cloud.userData.angle) * cloud.userData.radius;
            
            // Update height with a gentler wave motion
            cloud.userData.heightPhase += deltaTime * 0.2; // Reduced from 0.5
            const heightOffset = Math.sin(cloud.userData.heightPhase) * cloud.userData.heightVariation;
            
            cloud.position.set(newX, cloud.position.y + heightOffset * deltaTime * 0.3, newZ); // Reduced vertical movement
            
            // Gentler rotation
            cloud.rotation.y += deltaTime * 0.03; // Reduced from 0.1
        });
    }

    /**
     * Remove all trees and clouds from the scene
     */
    removeAllTrees() {
        console.log('[DEBUG] Removing all trees and clouds from scene');
        
        // Find all objects with tree/vegetation/cloud names
        const objectsToRemove = [];
        this.scene.traverse(object => {
            if (object.name && (
                object.name.includes('tree') || 
                object.name.includes('palm') || 
                object.name.includes('Tree') || 
                object.name.includes('Palm') ||
                object.name.includes('bush') ||
                object.name.includes('vegetation') ||
                object.name.includes('cloud') ||
                object.name.includes('Cloud') ||
                object.userData?.type === 'tree' ||
                object.userData?.type === 'vegetation'
            )) {
                objectsToRemove.push(object);
            }
        });
        
        // Remove them
        console.log(`[DEBUG] Found ${objectsToRemove.length} objects to remove`);
        objectsToRemove.forEach(obj => {
            // Remove from parent
            if (obj.parent) {
                obj.parent.remove(obj);
            } else {
                this.scene.remove(obj);
            }
            
            // Dispose of resources
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
        
        // Clear clouds array
        this.clouds = [];
    }
    
    /**
     * Remove all mountains from the scene
     */
    removeAllMountains() {
        console.log('[DEBUG] Removing all mountains from scene');
        
        // Find all objects with mountain names
        const mountainsToRemove = [];
        this.scene.traverse(object => {
            if (object.name && (
                object.name.includes('mountain') || 
                object.name.includes('Mountain')
            )) {
                mountainsToRemove.push(object);
            }
        });
        
        // Remove them
        console.log(`[DEBUG] Found ${mountainsToRemove.length} mountains to remove`);
        mountainsToRemove.forEach(mountain => {
            // Remove from parent
            if (mountain.parent) {
                mountain.parent.remove(mountain);
            } else {
                this.scene.remove(mountain);
            }
            
            // Dispose of resources
            if (mountain.geometry) mountain.geometry.dispose();
            if (mountain.material) {
                if (Array.isArray(mountain.material)) {
                    mountain.material.forEach(m => m.dispose());
                } else {
                    mountain.material.dispose();
                }
            }
        });
    }
}
