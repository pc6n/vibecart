import * as THREE from 'three';

/**
 * SceneryManager - Responsible for adding and removing scenery elements
 * This class uses composition to add scenery to any track type
 */
export class SceneryManager {
  constructor(scene) {
    this.scene = scene;
    this.trees = [];
    this.mountains = [];
    this.stands = [];
    this.decorations = [];
  }
  
  /**
   * Add trees around a track
   * @param {number} trackRadius - Radius of the track (for circular tracks)
   * @param {number} trackWidth - Width of the track
   * @param {number} groundSize - Size of the ground plane
   */
  addTrees(trackRadius, trackWidth, groundSize = 500) {
    // Define tree clusters outside the track
    const treePositions = [
      { x: -trackRadius * 1.5, z: 0, count: 5, radius: 20 },
      { x: trackRadius * 1.5, z: 0, count: 8, radius: 30 },
      { x: 0, z: -trackRadius * 1.5, count: 6, radius: 25 },
      { x: 0, z: trackRadius * 1.5, count: 7, radius: 35 }
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
          Math.random() > 0.3 ? this.createPalmTree(x, z) : this.createTree(x, z);
        }
      }
    });

    // Place some random trees off the track
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * (groundSize / 2 - 20);
      
      if (Math.abs(distance - trackRadius) < trackWidth + 5) {
        continue;
      }
      
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      Math.random() > 0.3 ? this.createPalmTree(x, z) : this.createTree(x, z);
    }
  }
  
  /**
   * Create a regular tree
   * @param {number} x - X position
   * @param {number} z - Z position
   */
  createTree(x, z) {
    // Create tree trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 5, 8);
    const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, 2.5, z);
    trunk.castShadow = true;
    trunk.name = 'tree_trunk';
    
    // Create tree top (leaves)
    const leavesGeometry = new THREE.ConeGeometry(2, 6, 8);
    const leavesMaterial = new THREE.MeshPhongMaterial({ color: 0x2E8B57 });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.set(0, 5, 0);
    leaves.castShadow = true;
    leaves.name = 'tree_leaves';
    
    // Group tree parts together
    const tree = new THREE.Group();
    tree.add(trunk);
    tree.add(leaves);
    tree.name = 'tree';
    
    // Add to scene and keep track of it
    this.scene.add(tree);
    this.trees.push(tree);
    
    return tree;
  }
  
  /**
   * Create a palm tree
   * @param {number} x - X position
   * @param {number} z - Z position
   */
  createPalmTree(x, z) {
    // Create tree trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 7, 8);
    const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, 3.5, z);
    trunk.castShadow = true;
    trunk.name = 'palm_trunk';
    
    // Create tree top (palm leaves)
    const leavesGroup = new THREE.Group();
    leavesGroup.position.y = 7;
    
    const leafCount = 5 + Math.floor(Math.random() * 3);
    const leafMaterial = new THREE.MeshPhongMaterial({ color: 0x32CD32 });
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      
      // Create a leaf shape
      const leafGeometry = new THREE.PlaneGeometry(3, 1.5);
      
      // Deform the geometry to make it look more like a palm leaf
      const vertices = leafGeometry.attributes.position.array;
      for (let j = 0; j < vertices.length; j += 3) {
        const x = vertices[j];
        if (x > 0) {
          vertices[j+1] = (x * 0.2); // Curve the leaf upward
        }
      }
      
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      leaf.rotation.y = angle;
      leaf.rotation.z = -Math.PI / 3; // Tilt leaves outward
      leaf.castShadow = true;
      leaf.name = 'palm_leaf';
      
      leavesGroup.add(leaf);
    }
    
    // Group tree parts together
    const tree = new THREE.Group();
    tree.add(trunk);
    tree.add(leavesGroup);
    tree.name = 'palm_tree';
    
    // Add to scene and keep track of it
    this.scene.add(tree);
    this.trees.push(tree);
    
    return tree;
  }
  
  /**
   * Create mountains in the background
   */
  createMountains() {
    const mountainCount = 5;
    const mountainRadius = 250;
    
    for (let i = 0; i < mountainCount; i++) {
      const angle = (i / mountainCount) * Math.PI * 2;
      const distance = mountainRadius;
      
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      
      // Create mountain
      const height = 20 + Math.random() * 30;
      const radius = 25 + Math.random() * 15;
      const geometry = new THREE.ConeGeometry(radius, height, 16);
      const material = new THREE.MeshPhongMaterial({
        color: 0x808080,
        flatShading: true
      });
      
      const mountain = new THREE.Mesh(geometry, material);
      mountain.position.set(x, height / 2, z);
      mountain.castShadow = true;
      mountain.receiveShadow = true;
      mountain.name = 'mountain';
      
      // Add snow cap
      const snowCapGeometry = new THREE.ConeGeometry(radius * 0.4, height * 0.2, 16);
      const snowMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
      const snowCap = new THREE.Mesh(snowCapGeometry, snowMaterial);
      snowCap.position.y = height * 0.4;
      snowCap.name = 'snow_cap';
      
      mountain.add(snowCap);
      
      // Add to scene and keep track of it
      this.scene.add(mountain);
      this.mountains.push(mountain);
    }
  }
  
  /**
   * Add grandstands around the track
   * @param {number} trackRadius - Radius of the track
   * @param {number} trackWidth - Width of the track
   */
  addGrandstands(trackRadius, trackWidth) {
    const standPositions = [
      { x: trackRadius + trackWidth, z: 10, rotation: -Math.PI / 2, width: 20 },
      { x: -trackRadius - trackWidth, z: -10, rotation: Math.PI / 2, width: 20 }
    ];
    
    standPositions.forEach(pos => {
      const stand = this.createGrandstand(pos.width, pos.x, pos.z, pos.rotation);
      this.stands.push(stand);
    });
  }
  
  /**
   * Create a grandstand
   * @param {number} width - Width of the grandstand
   * @param {number} x - X position
   * @param {number} z - Z position
   * @param {number} rotation - Y rotation
   */
  createGrandstand(width, x, z, rotation) {
    // Create grandstand group
    const stand = new THREE.Group();
    stand.position.set(x, 0, z);
    stand.rotation.y = rotation;
    stand.name = 'grandstand';
    
    // Base platform
    const baseGeometry = new THREE.BoxGeometry(width, 0.5, 6);
    const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.25;
    base.receiveShadow = true;
    stand.add(base);
    
    // Seat rows (3 rows)
    for (let i = 0; i < 3; i++) {
      const rowGeometry = new THREE.BoxGeometry(width, 0.5, 1.5);
      const rowMaterial = new THREE.MeshPhongMaterial({ color: 0x444444 });
      const row = new THREE.Mesh(rowGeometry, rowMaterial);
      
      // Position each row higher and further back
      row.position.y = 0.75 + i * 1;
      row.position.z = -1 - i * 1.5;
      row.receiveShadow = true;
      row.castShadow = true;
      stand.add(row);
      
      // Add crowd (simplified as colored boxes)
      for (let j = 0; j < width / 2; j++) {
        if (Math.random() > 0.3) { // Some seats empty
          const personGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
          
          // Random person color
          const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
          const personColor = colors[Math.floor(Math.random() * colors.length)];
          const personMaterial = new THREE.MeshPhongMaterial({ color: personColor });
          
          const person = new THREE.Mesh(personGeometry, personMaterial);
          person.position.x = j * 2 - width / 2 + 0.5;
          person.position.y = 1.5 + i * 1;
          person.position.z = -1 - i * 1.5;
          person.castShadow = true;
          person.name = 'spectator';
          
          stand.add(person);
        }
      }
    }
    
    // Roof
    const roofGeometry = new THREE.BoxGeometry(width, 0.5, 6);
    const roofMaterial = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 4;
    roof.position.z = -3;
    roof.castShadow = true;
    stand.add(roof);
    
    // Support pillars
    for (let i = 0; i < 3; i++) {
      const pillarGeometry = new THREE.BoxGeometry(0.5, 4, 0.5);
      const pillarMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
      const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
      
      pillar.position.x = width / 3 * i - width / 2 + width / 6;
      pillar.position.y = 2;
      pillar.position.z = -5;
      pillar.castShadow = true;
      stand.add(pillar);
    }
    
    // Add to scene
    this.scene.add(stand);
    
    return stand;
  }
  
  /**
   * Add decorative elements to the scene
   * @param {object} params - Parameters for decorations
   */
  addDecorations(params = {}) {
    // Add flags, signs, etc. based on params
    const { addFlags = true, addSigns = true, addLights = true } = params;
    
    if (addFlags) {
      this.addFlags();
    }
    
    if (addSigns) {
      this.addSigns();
    }
    
    if (addLights) {
      this.addLights();
    }
  }
  
  /**
   * Add flags to the scene
   */
  addFlags() {
    // Implementation for adding flags
  }
  
  /**
   * Add signs to the scene
   */
  addSigns() {
    // Implementation for adding signs
  }
  
  /**
   * Add lights to the scene
   */
  addLights() {
    // Implementation for adding lights
  }
  
  /**
   * Remove all scenery elements from the scene
   */
  cleanup() {
    // Remove all trees
    this.trees.forEach(tree => {
      this.scene.remove(tree);
    });
    this.trees = [];
    
    // Remove all mountains
    this.mountains.forEach(mountain => {
      this.scene.remove(mountain);
    });
    this.mountains = [];
    
    // Remove all grandstands
    this.stands.forEach(stand => {
      this.scene.remove(stand);
    });
    this.stands = [];
    
    // Remove all decorations
    this.decorations.forEach(decoration => {
      this.scene.remove(decoration);
    });
    this.decorations = [];
  }
} 