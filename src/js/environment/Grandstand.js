import * as THREE from 'three';

export class Grandstand {
    constructor(scene) {
        this.scene = scene;
        this.grandstandObjects = [];
        
        // Create and cache textures
        this.textures = {
            metal: this.createMetalTexture(),
            concrete: this.createConcreteTexture(),
            fabric: this.createFabricTexture()
        };
    }

    // Create simple procedural textures
    createMetalTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Base metal color
        ctx.fillStyle = '#888888';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add some noise for metal grain
        for (let i = 0; i < 10000; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const brightness = 0.9 + Math.random() * 0.2;
            ctx.fillStyle = `rgba(200, 200, 200, ${brightness * 0.05})`;
            ctx.fillRect(x, y, 1, 1);
        }
        
        // Add some scratches
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const length = 5 + Math.random() * 30;
            const angle = Math.random() * Math.PI * 2;
            ctx.strokeStyle = 'rgba(150, 150, 150, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(
                x + Math.cos(angle) * length,
                y + Math.sin(angle) * length
            );
            ctx.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        return texture;
    }
    
    createConcreteTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Base concrete color
        ctx.fillStyle = '#aaaaaa';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add noise and speckles
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const size = 1 + Math.random() * 2;
            const shade = 80 + Math.random() * 40;
            ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
            ctx.fillRect(x, y, size, size);
        }
        
        // Add some cracks
        for (let i = 0; i < 10; i++) {
            const startX = Math.random() * canvas.width;
            const startY = Math.random() * canvas.height;
            
            ctx.strokeStyle = 'rgba(60, 60, 60, 0.2)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            
            let x = startX;
            let y = startY;
            let segments = 3 + Math.floor(Math.random() * 5);
            
            for (let j = 0; j < segments; j++) {
                const angle = Math.random() * Math.PI * 2;
                const length = 10 + Math.random() * 20;
                x += Math.cos(angle) * length;
                y += Math.sin(angle) * length;
                ctx.lineTo(x, y);
            }
            
            ctx.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        return texture;
    }
    
    createFabricTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // Base color
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Create fabric texture pattern
        for (let y = 0; y < canvas.height; y += 2) {
            for (let x = 0; x < canvas.width; x += 2) {
                if ((x + y) % 4 === 0) {
                    ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(10, 10);
        return texture;
    }

    addGrandstands(trackRadius, trackWidth) {
        // Clean up any existing grandstands
        this.removeAll();
        
        // Position grandstands near the start/finish area.
        const innerRadius = trackRadius - trackWidth / 2;
        const outerRadius = trackRadius + trackWidth / 2;
        
        // Simplified approach - just create two grandstands at the start line
        // One on each side of the track
        
        // Calculate positions - use a safe distance from track
        const offset = 30; // Increased offset for safety
        
        // Inner grandstand (inside the track circle) - looking outward
        const innerX = (innerRadius - offset) * Math.cos(0); // At angle 0 (start line)
        const innerZ = (innerRadius - offset) * Math.sin(0);
        
        // Outer grandstand (outside the track circle) - looking inward
        const outerX = (outerRadius + offset) * Math.cos(Math.PI); // At angle PI (180 degrees, directly opposite)
        const outerZ = (outerRadius + offset) * Math.sin(Math.PI);
        
        // Set dimensions for grandstands
        const width = 50;
        const depth = 20;
        const height = 12;
        
        console.log(`Track: radius=${trackRadius}, width=${trackWidth}`);
        console.log(`Inner position: (${innerX}, ${innerZ}), looking outward`);
        console.log(`Outer position: (${outerX}, ${outerZ}), looking inward`);
        
        // Inner grandstand - needs to face toward the track
        this.createGrandstand({
            x: innerX, 
            z: innerZ, 
            width: width, 
            depth: depth, 
            height: height,
            // Rotate 270 degrees (180+90) to face the track correctly
            rotation: Math.PI + Math.PI/2,
            withRoof: true,
            name: "Start Line Grandstand"
        });
        
        // Outer grandstand - needs to face toward the track
        this.createGrandstand({
            x: outerX, 
            z: outerZ, 
            width: width, 
            depth: depth, 
            height: height,
            // Rotate -90 degrees to face the track
            rotation: -Math.PI / 2,
            withRoof: true,
            name: "Finish Line Grandstand"
        });
        
        // Add scoreboard/event sign to the front of the OUTER grandstand
        this.addScoreboard(outerX, outerZ, -Math.PI / 2);
    }

    createGrandstand({ x, z, width, depth, height, rotation = 0, withRoof = true, name }) {
        // Create a group to hold all grandstand components
        const grandstandGroup = new THREE.Group();
        grandstandGroup.position.set(x, 0, z);
        grandstandGroup.rotation.y = rotation;
        grandstandGroup.name = name;
        grandstandGroup.userData.type = 'grandstand';
        
        // Create concrete foundation
        this.createFoundation(grandstandGroup, width, depth, height);
        
        // Create rows of seats with steps
        this.createSeatRows(grandstandGroup, width, depth, height);
        
        // Add spectators
        this.addSpectators(grandstandGroup, width, depth, height);
        
        // Add roof if specified
        if (withRoof) {
            this.addRoof(grandstandGroup, width, depth, height);
        }
        
        // Add some structural supports
        this.addSupports(grandstandGroup, width, depth, height);
        
        // Add group to the scene
        this.scene.add(grandstandGroup);
        this.grandstandObjects.push(grandstandGroup);
        
        return grandstandGroup;
    }
    
    createFoundation(group, width, depth, height) {
        // Create concrete foundation
        const foundationGeometry = new THREE.BoxGeometry(width, 1, depth);
        const foundationMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xaaaaaa,
            map: this.textures.concrete,
            bumpMap: this.textures.concrete,
            bumpScale: 0.05
        });
        
        const foundation = new THREE.Mesh(foundationGeometry, foundationMaterial);
        foundation.position.y = 0.5;
        foundation.castShadow = true;
        foundation.receiveShadow = true;
        group.add(foundation);
        
        // Add stairs on the front
        this.addStairs(group, width, depth);
    }
    
    addStairs(group, width, depth) {
        // Create stairs at the front of the grandstand
        const stairWidth = width * 0.4;
        const stairDepth = 5;
        const stepHeight = 0.4;
        const stepCount = 6;
        
        const stairGroup = new THREE.Group();
        stairGroup.position.set(0, 0, depth/2 + stairDepth/2);
        
        const stairMaterial = new THREE.MeshPhongMaterial({
            color: 0x999999,
            map: this.textures.concrete,
            bumpMap: this.textures.concrete,
            bumpScale: 0.02
        });
        
        for (let i = 0; i < stepCount; i++) {
            const stepWidth = stairWidth - (i * 0.5);
            const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stairDepth/stepCount);
            const step = new THREE.Mesh(stepGeometry, stairMaterial);
            
            // Position each step
            step.position.y = (i + 1) * stepHeight;
            step.position.z = stairDepth/2 - (i + 0.5) * (stairDepth/stepCount);
            
            step.castShadow = true;
            step.receiveShadow = true;
            stairGroup.add(step);
        }
        
        group.add(stairGroup);
    }
    
    createSeatRows(group, width, depth, height) {
        // Each row will be at a different height and angle for stadium seating
        const rowCount = 8;
        const seatColors = [0xcc0000, 0x0044cc, 0xffcc00, 0x555555, 0x006600];
        
        // Create a container for all seat rows
        const seatingGroup = new THREE.Group();
        seatingGroup.position.y = 1; // Starting above the foundation
        
        // Spacing and angles for stadium seating
        const rowDepth = (depth - 4) / rowCount;
        const rowHeight = (height - 2) / rowCount;
        const totalAngle = Math.PI / 8; // Angled upward for better visibility
        
        for (let row = 0; row < rowCount; row++) {
            // Each row is progressively higher and angled
            const rowAngle = (row / rowCount) * totalAngle;
            const rowY = row * rowHeight;
            const rowZ = -depth/2 + 2 + row * rowDepth;
            
            // Create the row platform (concrete/metal mix)
            const rowGeometry = new THREE.BoxGeometry(width - 2, 0.5, rowDepth);
            const rowMaterial = new THREE.MeshPhongMaterial({
                color: 0x999999,
                map: this.textures.concrete
            });
            
            const rowMesh = new THREE.Mesh(rowGeometry, rowMaterial);
            rowMesh.position.set(0, rowY, rowZ);
            rowMesh.rotation.x = rowAngle;
            rowMesh.castShadow = true;
            rowMesh.receiveShadow = true;
            seatingGroup.add(rowMesh);
            
            // Get seat color for this row
            const seatColor = seatColors[row % seatColors.length];
            
            // Create individual seats on this row
            this.createSeatsForRow(seatingGroup, width, rowDepth, rowY, rowZ, rowAngle, seatColor);
        }
        
        group.add(seatingGroup);
    }
    
    createSeatsForRow(group, rowWidth, rowDepth, rowY, rowZ, rowAngle, seatColor) {
        // Create individual seats with backs
        const seatWidth = 0.9;
        const seatHeight = 0.8;
        const seatDepth = 0.7;
        const spacing = 0.1;
        const seatCount = Math.floor((rowWidth - 2) / (seatWidth + spacing));
        
        // Create material for seats - MeshPhongMaterial doesn't support roughness/metalness
        const seatMaterial = new THREE.MeshPhongMaterial({
            color: seatColor,
            shininess: 30,      // Use shininess instead of roughness
            specular: 0x333333, // Use specular instead of metalness
            map: this.textures.fabric
        });
        
        // Container for all seats in this row
        const seatGroup = new THREE.Group();
        seatGroup.position.set(0, rowY + 0.25, rowZ);
        seatGroup.rotation.x = rowAngle;
        
        for (let i = 0; i < seatCount; i++) {
            // Only add some seats (random distribution for realism - some empty seats)
            if (Math.random() > 0.15) {
                const seat = new THREE.Group();
                
                // Seat bottom
                const seatBottomGeometry = new THREE.BoxGeometry(seatWidth, 0.1, seatDepth);
                const seatBottom = new THREE.Mesh(seatBottomGeometry, seatMaterial);
                seatBottom.position.y = 0;
                seatBottom.castShadow = true;
                seat.add(seatBottom);
                
                // Seat back
                const seatBackGeometry = new THREE.BoxGeometry(seatWidth, seatHeight, 0.1);
                const seatBack = new THREE.Mesh(seatBackGeometry, seatMaterial);
                seatBack.position.set(0, seatHeight/2, -seatDepth/2);
                seatBack.castShadow = true;
                seat.add(seatBack);
                
                // Position seat relative to row
                const xPos = (i - seatCount/2) * (seatWidth + spacing);
                seat.position.set(xPos, 0, 0);
                
                seatGroup.add(seat);
            }
        }
        
        group.add(seatGroup);
    }
    
    addSpectators(group, width, depth, height) {
        // Add simplified spectators
        const rowCount = 8;
        const spectatorColors = [
            0x2244ff, 0xff4422, 0xffcc22, 0x22ff44, 0xff22ff,
            0x224499, 0xcc3322, 0xddaa22, 0x229933, 0xdd22dd
        ];
        
        // Track positions used to prevent overlap
        const usedPositions = new Set();
        
        // Spectator density based on depth - fewer in upper rows
        const maxDensity = 0.7;
        const spectatorCount = Math.floor(width * depth * maxDensity / 4);
        
        for (let i = 0; i < spectatorCount; i++) {
            // Random row
            const row = Math.floor(Math.random() * rowCount);
            
            // Realistic positioning
            const rowY = 1.5 + row * (height - 2) / rowCount;
            const rowZ = -depth/2 + 2 + row * (depth - 4) / rowCount;
            
            // Random position within row
            const xPos = (Math.random() - 0.5) * (width - 4);
            
            // Generate a unique position key
            const posKey = `${Math.floor(xPos)}_${row}`;
            
            // Skip if position already used
            if (usedPositions.has(posKey)) continue;
            usedPositions.add(posKey);
            
            // Random spectator color
            const colorIndex = Math.floor(Math.random() * spectatorColors.length);
            const spectatorColor = spectatorColors[colorIndex];
            
            // Create spectator
            this.createSpectator(group, xPos, rowY, rowZ, spectatorColor);
        }
    }
    
    createSpectator(group, x, y, z, color) {
        // Create a simple spectator figure
        const spectator = new THREE.Group();
        const spectatorHeight = 0.7 + Math.random() * 0.4;
        
        // Body material with some randomization
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: color,
            shininess: 30,
            specular: 0x222222
        });
        
        // Skin tone with slight randomization
        const skinTone = new THREE.Color(0xddbb99);
        skinTone.r += (Math.random() - 0.5) * 0.2;
        skinTone.g += (Math.random() - 0.5) * 0.2;
        skinTone.b += (Math.random() - 0.5) * 0.2;
        
        const headMaterial = new THREE.MeshPhongMaterial({
            color: skinTone,
            shininess: 20
        });
        
        // Body (torso)
        const bodyGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.3);
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = spectatorHeight - 0.3;
        spectator.add(body);
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = spectatorHeight + 0.1;
        spectator.add(head);
        
        // Position the spectator
        spectator.position.set(x, y, z);
        
        // Random rotation (some looking around)
        spectator.rotation.y = (Math.random() - 0.5) * Math.PI * 0.5;
        
        // Add some random animation
        if (Math.random() > 0.7) {
            // Add arm-waving animation data
            spectator.userData.animated = true;
            spectator.userData.animPhase = Math.random() * Math.PI * 2;
            
            // Arms
            const armGeometry = new THREE.BoxGeometry(0.1, 0.4, 0.1);
            const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
            leftArm.position.set(0.25, spectatorHeight - 0.3, 0);
            spectator.userData.leftArm = leftArm;
            spectator.add(leftArm);
            
            const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
            rightArm.position.set(-0.25, spectatorHeight - 0.3, 0);
            spectator.userData.rightArm = rightArm;
            spectator.add(rightArm);
        }
        
        group.add(spectator);
    }
    
    addRoof(group, width, depth, height) {
        // Create a modern curved roof
        const curveSegments = 8;
        const roofHeight = 3;
        const roofWidth = width + 2;
        const roofDepth = depth * 0.7;
        
        // Create roof support beams
        const beamMaterial = new THREE.MeshPhongMaterial({
            color: 0x555555,
            map: this.textures.metal,
            shininess: 100,    // Use shininess instead of metalness
            specular: 0x999999 // Use specular instead of roughness
        });
        
        // Main support beams
        for (let i = -1; i <= 1; i += 2) {
            const beamGeometry = new THREE.BoxGeometry(0.5, height + roofHeight, 0.5);
            const beam = new THREE.Mesh(beamGeometry, beamMaterial);
            beam.position.set(i * (width/2 - 1), (height + roofHeight)/2, -depth/2 + 2);
            beam.castShadow = true;
            group.add(beam);
        }
        
        // Create curved roof surface
        const roofPointsZ = [];
        const roofPointsY = [];
        
        // Generate points for a curve
        for (let i = 0; i <= curveSegments; i++) {
            const t = i / curveSegments;
            
            // Quadratic curve for roof
            const z = -depth/2 + (1 - t) * roofDepth;
            const y = height + roofHeight * Math.sin(t * Math.PI);
            
            roofPointsZ.push(z);
            roofPointsY.push(y);
        }
        
        // Create roof panels
        const panelWidth = roofWidth / 4;
        const panelMaterial = new THREE.MeshPhongMaterial({
            color: 0xdddddd,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        
        for (let p = 0; p < 4; p++) {
            for (let i = 0; i < curveSegments; i++) {
                // Create a panel between each segment
                const panelShape = new THREE.Shape();
                
                // Panel corners
                const z1 = roofPointsZ[i];
                const y1 = roofPointsY[i];
                const z2 = roofPointsZ[i+1];
                const y2 = roofPointsY[i+1];
                
                // Create panel geometry
                const panelGeometry = new THREE.BufferGeometry();
                const vertices = new Float32Array([
                    // First triangle
                    -panelWidth/2, y1, z1,
                    panelWidth/2, y1, z1,
                    -panelWidth/2, y2, z2,
                    
                    // Second triangle
                    panelWidth/2, y1, z1,
                    panelWidth/2, y2, z2,
                    -panelWidth/2, y2, z2
                ]);
                
                panelGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                panelGeometry.computeVertexNormals();
                
                const panel = new THREE.Mesh(panelGeometry, panelMaterial);
                panel.position.x = (p - 1.5) * panelWidth;
                panel.castShadow = true;
                
                group.add(panel);
            }
        }
    }
    
    addSupports(group, width, depth, height) {
        // Add structural supports and details
        const supportMaterial = new THREE.MeshPhongMaterial({
            color: 0x444444,
            map: this.textures.metal,
            shininess: 100,    // Use shininess instead of metalness
            specular: 0x999999 // Use specular instead of roughness
        });
        
        // Add diagonal supports
        const supportCount = 4;
        for (let i = 0; i < supportCount; i++) {
            const xPos = (i / (supportCount - 1) - 0.5) * width;
            
            // Diagonal support beam
            const supportGeometry = new THREE.CylinderGeometry(0.2, 0.2, Math.sqrt(height*height + (depth/2)*(depth/2)), 8);
            const support = new THREE.Mesh(supportGeometry, supportMaterial);
            
            // Position and rotate to form diagonal
            const angle = Math.atan2(height, depth/2);
            support.rotation.x = Math.PI/2 - angle;
            
            // Position at end of grandstand
            support.position.set(xPos, height/2, -depth/4);
            
            support.castShadow = true;
            group.add(support);
        }
        
        // Add handrails
        const railingMaterial = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            map: this.textures.metal
        });
        
        // Create railings for each level
        const railingHeight = 1.0;
        const railingLevels = 3;
        const levelHeight = height / railingLevels;
        
        for (let level = 1; level <= railingLevels; level++) {
            const y = level * levelHeight;
            const z = -depth/2 + depth * (level / railingLevels);
            
            // Horizontal railing
            const railingGeometry = new THREE.CylinderGeometry(0.05, 0.05, width - 2, 8);
            railingGeometry.rotateZ(Math.PI/2);
            const railing = new THREE.Mesh(railingGeometry, railingMaterial);
            railing.position.set(0, y + railingHeight, z);
            group.add(railing);
            
            // Vertical posts
            const postCount = 8;
            for (let i = 0; i <= postCount; i++) {
                const xPos = (i / postCount - 0.5) * (width - 2);
                const postGeometry = new THREE.CylinderGeometry(0.03, 0.03, railingHeight, 8);
                const post = new THREE.Mesh(postGeometry, railingMaterial);
                post.position.set(xPos, y + railingHeight/2, z);
                group.add(post);
            }
        }
    }

    // Animation method - call this in the animation loop
    animate(deltaTime) {
        // Animate any spectators with animation data
        this.grandstandObjects.forEach(grandstand => {
            grandstand.traverse(object => {
                if (object.userData && object.userData.animated) {
                    // Simple arm-waving animation
                    object.userData.animPhase += deltaTime * 2;
                    
                    if (object.userData.leftArm) {
                        object.userData.leftArm.rotation.x = Math.sin(object.userData.animPhase) * 0.5;
                    }
                    
                    if (object.userData.rightArm) {
                        object.userData.rightArm.rotation.x = Math.sin(object.userData.animPhase + Math.PI) * 0.5;
                    }
                }
            });
        });
    }

    /**
     * Remove all grandstands from the scene
     */
    removeAll() {
        console.log('[DEBUG] Removing all grandstands');
        
        // Find all grandstand objects
        const grandstandsToRemove = [];
        this.scene.traverse(object => {
            if (object.name && (
                object.name.includes('grandstand') || 
                object.name.includes('Grandstand') ||
                (object.userData && object.userData.type === 'grandstand')
            )) {
                grandstandsToRemove.push(object);
            }
            
            // If we didn't name them, look for geometries with the right dimensions
            if (object.geometry && object.geometry.type === 'BoxGeometry') {
                // Assume grandstands are large rectangular objects positioned above ground
                if (object.position.y > 1 && object.geometry.parameters.width >= 10) {
                    grandstandsToRemove.push(object);
                }
            }
        });
        
        // Remove them all
        console.log(`[DEBUG] Found ${grandstandsToRemove.length} grandstands to remove`);
        grandstandsToRemove.forEach(grandstand => {
            // Remove from parent
            if (grandstand.parent) {
                grandstand.parent.remove(grandstand);
            } else {
                this.scene.remove(grandstand);
            }
            
            // Dispose of resources
            if (grandstand.geometry) grandstand.geometry.dispose();
            if (grandstand.material) {
                if (Array.isArray(grandstand.material)) {
                    grandstand.material.forEach(m => m.dispose());
                } else {
                    grandstand.material.dispose();
                }
            }
        });
        
        // Clear the tracking array
        this.grandstandObjects = [];
    }
    
    // Add a cleanup method to properly dispose resources
    cleanup() {
        this.removeAll();
        
        // Dispose of textures
        for (let key in this.textures) {
            if (this.textures[key]) {
                this.textures[key].dispose();
            }
        }
    }

    // New method to add a scoreboard or event sign
    addScoreboard(x, z, rotation) {
        // Create a scoreboard structure - increase size by 25%
        const baseWidth = 25; // Increased from 20
        const baseHeight = 12.5; // Increased from 10
        const baseDepth = 2.5; // Increased from 2
        
        // Create the main board
        const boardGeometry = new THREE.BoxGeometry(baseWidth, baseHeight, baseDepth);
        const boardMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
        const board = new THREE.Mesh(boardGeometry, boardMaterial);
        
        // Create the screen part
        const screenWidth = baseWidth * 0.8;
        const screenHeight = baseHeight * 0.5;
        const screenGeometry = new THREE.PlaneGeometry(screenWidth, screenHeight);
        
        // Create a canvas for the screen texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Fill background
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add initial text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 72px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('follow @pat_codes', canvas.width/2, canvas.height/2);
        
        // Create texture and material
        const screenTexture = new THREE.CanvasTexture(canvas);
        const screenMaterial = new THREE.MeshBasicMaterial({ 
            map: screenTexture,
            // MeshBasicMaterial doesn't support emissive
            // Remove emissive properties and use a brighter color if needed
            color: 0xffffff
        });
        
        const screen = new THREE.Mesh(screenGeometry, screenMaterial);
        
        // Position everything
        const standHeight = 18; // Increased from 15
        const standGeometry = new THREE.BoxGeometry(baseWidth * 0.2, standHeight, baseDepth);
        const standMaterial = new THREE.MeshPhongMaterial({ color: 0x111111 });
        const stand = new THREE.Mesh(standGeometry, standMaterial);
        
        // Position elements
        board.position.set(0, standHeight + baseHeight/2, 0);
        screen.position.set(0, standHeight + baseHeight/2, baseDepth/2 + 0.1);
        stand.position.set(0, standHeight/2, 0);
        
        // Create a group for the scoreboard
        const scoreboardGroup = new THREE.Group();
        scoreboardGroup.add(board);
        scoreboardGroup.add(screen);
        scoreboardGroup.add(stand);
        
        // Position and rotate the entire group
        // Move it significantly further from the grandstand to prevent clipping
        const offsetDistance = 50; // Increased from 20 to 50 to avoid clipping
        const offsetX = 20; // Add a sideways offset to position it better
        
        // Position with both z and x offsets to avoid clipping with the grandstand
        scoreboardGroup.position.set(x + offsetX, 0, z - offsetDistance); 
        
        // Rotate in the opposite direction (-60 degrees instead of +60 degrees)
        scoreboardGroup.rotation.y = rotation + Math.PI - Math.PI/3; 
        
        // Add to scene
        this.scene.add(scoreboardGroup);
        
        // Set up animation to alternate text
        this.setupSignAnimation(canvas, ctx, screenTexture);
    }
    
    // Animate the scoreboard text to alternate between messages
    setupSignAnimation(canvas, ctx, texture) {
        let currentMessage = 0;
        const messages = [
            'follow @pat_codes',
            "LET'S GO!"  // Simplified base message
        ];
        
        // Update interval (in milliseconds)
        const updateInterval = 3000; // Switch message every 3 seconds (was 5 seconds)
        
        // Start animation cycle
        const updateSign = () => {
            // Clear canvas
            ctx.fillStyle = '#ff00ff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Write text
            ctx.fillStyle = 'white';
            ctx.font = 'bold 72px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Get current message
            let message = messages[currentMessage];
            
            // If it's the "LET'S GO" message and we have a player name, add it
            if (message === "LET'S GO!") {
                // Try to get player name from localStorage if available
                const playerName = localStorage.getItem('playerName');
                if (playerName && playerName.trim() !== '') {
                    message = `LET'S GO ${playerName.toUpperCase()}!`;
                }
            }
            
            // Handle text that's too long by reducing font size
            if (message.length > 12) {
                ctx.font = 'bold 56px Arial';
            }
            
            ctx.fillText(message, canvas.width/2, canvas.height/2);
            
            // Update texture
            texture.needsUpdate = true;
            
            // Cycle to next message
            currentMessage = (currentMessage + 1) % messages.length;
        };
        
        // Initial update
        updateSign();
        
        // Set interval to update periodically
        setInterval(updateSign, updateInterval);
    }
} 