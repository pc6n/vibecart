import * as THREE from 'three';
import { BaseTrack } from './BaseTrack.js';
import { SceneryManager } from '../environment/SceneryManager.js';

/**
 * CircularTrack - A simple circular track implementation
 * Extends BaseTrack with circular track visuals
 */
export class CircularTrack extends BaseTrack {
  constructor(scene, game, options = {}) {
    super(scene, game);
    
    // Override base properties
    this.id = options.id || 'circular_track';
    this.name = options.name || 'Circular Track';
    this.description = options.description || 'A simple circular race track';
    
    // Track properties
    this.trackRadius = options.radius || 100;
    this.trackWidth = options.width || 20;
    this.trackColor = options.color || 0x555555;
    this.trackSegments = options.segments || 64;
    this.trackBanking = options.banking || 0; // Banking angle in radians
    
    // References to track objects
    this.trackMesh = null;
    this.innerBoundary = null;
    this.outerBoundary = null;
    this.finishLineDecoration = null;
    
    // Start position
    this.startPosition = new THREE.Vector3(0, 0.5, this.trackRadius);
    this.startRotation = -Math.PI / 2; // Facing tangent to the circle
    
    // Finish line position
    this.finishLinePosition = new THREE.Vector3(this.trackWidth / 2, 0, this.trackRadius);
    
    // Optional scenery
    this.useScenery = options.useScenery !== undefined ? options.useScenery : true;
    this.scenery = this.useScenery ? new SceneryManager(scene) : null;
    
    // Optional ground plane
    this.useGroundPlane = options.useGroundPlane !== undefined ? options.useGroundPlane : true;
    this.groundSize = options.groundSize || 500;
    this.groundColor = options.groundColor || 0x336633;
    this.groundMesh = null;
  }
  
  /**
   * Initialize the track
   */
  init() {
    console.log(`Initializing circular track: ${this.name}`);
    
    // Create the track
    this.createTrack();
    
    // Add ground plane if enabled
    if (this.useGroundPlane) {
      this.createGroundPlane();
    }
    
    // Add scenery if enabled
    if (this.useScenery && this.scenery) {
      this.addScenery();
    }
    
    // Create finish line and checkpoint triggers
    this.createFinishLineTrigger();
    this.createCheckpoints();
    
    // Create visible finish line decoration
    this.createFinishLineDecoration();
    
    return this;
  }
  
  /**
   * Create the circular track
   */
  createTrack() {
    // Create the track shape
    const trackShape = new THREE.Shape();
    
    // Create a ring shape
    const innerRadius = this.trackRadius - this.trackWidth / 2;
    const outerRadius = this.trackRadius + this.trackWidth / 2;
    
    // Define the outer circle
    trackShape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
    
    // Define the inner circle (hole)
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
    trackShape.holes.push(holePath);
    
    // Create track geometry
    const trackGeometry = new THREE.ShapeGeometry(trackShape, this.trackSegments);
    
    // Rotate the geometry to be horizontal
    trackGeometry.rotateX(-Math.PI / 2);
    
    // Apply banking if specified
    if (this.trackBanking !== 0) {
      const vertices = trackGeometry.attributes.position.array;
      for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const z = vertices[i + 2];
        
        // Calculate distance from center
        const distanceFromCenter = Math.sqrt(x * x + z * z);
        
        // Calculate banking angle based on distance from center
        const bankingAngle = this.trackBanking * (distanceFromCenter - innerRadius) / this.trackWidth;
        
        // Apply banking
        const y = vertices[i + 1];
        const angle = Math.atan2(z, x);
        
        // Adjust Y based on banking
        vertices[i + 1] = y + Math.sin(bankingAngle) * Math.cos(angle) * this.trackWidth;
      }
      
      // Update geometry
      trackGeometry.attributes.position.needsUpdate = true;
      trackGeometry.computeVertexNormals();
    }
    
    // Create track material
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: this.trackColor,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    
    // Create track mesh
    this.trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    this.trackMesh.receiveShadow = true;
    this.trackMesh.name = 'circular_track';
    
    // Add track to scene
    this.scene.add(this.trackMesh);
    
    // Create track boundaries for collision detection
    this.createTrackBoundaries();
    
    console.log('Created circular track');
    return this.trackMesh;
  }
  
  /**
   * Create track boundaries for collision detection
   */
  createTrackBoundaries() {
    // Clear existing boundaries
    this.trackBoundaries = [];
    
    // Inner boundary - invisible wall to prevent cutting through center
    const innerGeometry = new THREE.CylinderGeometry(
      this.trackRadius - this.trackWidth / 2 - 2,
      this.trackRadius - this.trackWidth / 2 - 2,
      10,
      32
    );
    
    const boundaryMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: this.debug.showTrackBoundaries ? 0.3 : 0,
      side: THREE.DoubleSide
    });
    
    this.innerBoundary = new THREE.Mesh(innerGeometry, boundaryMaterial);
    this.innerBoundary.position.y = 5;
    this.innerBoundary.name = 'inner_boundary';
    
    // Outer boundary
    const outerGeometry = new THREE.CylinderGeometry(
      this.trackRadius + this.trackWidth / 2 + 2,
      this.trackRadius + this.trackWidth / 2 + 2,
      10,
      32,
      1,
      true // Open ended
    );
    
    this.outerBoundary = new THREE.Mesh(outerGeometry, boundaryMaterial.clone());
    this.outerBoundary.position.y = 5;
    this.outerBoundary.name = 'outer_boundary';
    
    // Add boundaries to scene and track
    this.scene.add(this.innerBoundary);
    this.scene.add(this.outerBoundary);
    
    // Store for collision detection
    this.trackBoundaries.push(this.innerBoundary);
    this.trackBoundaries.push(this.outerBoundary);
    
    console.log('Created track boundaries');
  }
  
  /**
   * Create a ground plane
   */
  createGroundPlane() {
    const groundGeometry = new THREE.PlaneGeometry(this.groundSize, this.groundSize);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: this.groundColor,
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = -0.1; // Slightly below track to avoid z-fighting
    this.groundMesh.receiveShadow = true;
    this.groundMesh.name = 'ground_plane';
    
    this.scene.add(this.groundMesh);
    console.log('Created ground plane');
    
    return this.groundMesh;
  }
  
  /**
   * Add scenery around the track
   */
  addScenery() {
    if (!this.scenery) {
      return;
    }
    
    // Add trees
    this.scenery.addTrees(this.trackRadius, this.trackWidth, this.groundSize);
    
    // Add mountains in the background
    this.scenery.createMountains();
    
    // Add grandstands
    this.scenery.addGrandstands(this.trackRadius, this.trackWidth);
    
    console.log('Added scenery around track');
  }
  
  /**
   * Create checkpoints around the track
   */
  createCheckpoints() {
    // Clear existing checkpoints
    this.checkpoints.forEach(checkpoint => {
      this.scene.remove(checkpoint);
    });
    this.checkpoints = [];
    
    // Create evenly spaced checkpoints around the track
    const checkpointCount = 4;
    
    for (let i = 0; i < checkpointCount; i++) {
      // Calculate position around the circle
      const angle = (i / checkpointCount) * Math.PI * 2;
      const x = Math.cos(angle) * this.trackRadius;
      const z = Math.sin(angle) * this.trackRadius;
      
      // Create checkpoint geometry
      const checkpointGeometry = new THREE.BoxGeometry(this.trackWidth, 5, 5);
      
      // Create checkpoint material - invisible unless in debug mode
      const checkpointMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: this.debug.showCheckpoints ? 0.3 : 0
      });
      
      // Create checkpoint mesh
      const checkpoint = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
      checkpoint.position.set(x, 2.5, z);
      
      // Rotate to face tangent to the circle
      checkpoint.rotation.y = angle + Math.PI / 2;
      
      checkpoint.name = `checkpoint_${i}`;
      
      // Add to scene and checkpoints array
      this.scene.add(checkpoint);
      this.checkpoints.push(checkpoint);
    }
    
    console.log(`Created ${this.checkpoints.length} checkpoints`);
    return this.checkpoints;
  }
  
  /**
   * Create finish line trigger for lap counting
   */
  createFinishLineTrigger() {
    // Create a trigger box for the finish line
    const triggerGeometry = new THREE.BoxGeometry(this.trackWidth, 5, 5);
    const triggerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: this.debug.showCheckpoints ? 0.3 : 0
    });
    
    this.finishLineTrigger = new THREE.Mesh(triggerGeometry, triggerMaterial);
    this.finishLineTrigger.position.copy(this.finishLinePosition);
    this.finishLineTrigger.position.y = 2.5; // Place it above the ground
    
    // Rotate to face tangent to the circle
    this.finishLineTrigger.rotation.y = Math.PI / 2;
    
    this.finishLineTrigger.name = 'finish_line_trigger';
    
    this.scene.add(this.finishLineTrigger);
    console.log('Created finish line trigger');
    
    return this.finishLineTrigger;
  }
  
  /**
   * Create a visible finish line decoration
   */
  createFinishLineDecoration() {
    // Create a checkered pattern at the finish line
    const finishLineGeometry = new THREE.PlaneGeometry(this.trackWidth, 5);
    
    // Create a checkered pattern material
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Draw checkered pattern
    const squareSize = 64;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#ffffff';
    for (let x = 0; x < canvas.width; x += squareSize) {
      for (let y = 0; y < canvas.height; y += squareSize) {
        if ((x / squareSize + y / squareSize) % 2 === 0) {
          ctx.fillRect(x, y, squareSize, squareSize);
        }
      }
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    const finishLineMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.5,
      metalness: 0.2
    });
    
    this.finishLineDecoration = new THREE.Mesh(finishLineGeometry, finishLineMaterial);
    this.finishLineDecoration.position.copy(this.finishLinePosition);
    this.finishLineDecoration.position.y = 0.05; // Slightly above track
    
    // Rotate to lie flat and face tangent to the circle
    this.finishLineDecoration.rotation.x = -Math.PI / 2;
    this.finishLineDecoration.rotation.z = Math.PI / 2;
    
    this.finishLineDecoration.receiveShadow = true;
    this.finishLineDecoration.name = 'finish_line_decoration';
    
    this.scene.add(this.finishLineDecoration);
    console.log('Created finish line decoration');
    
    return this.finishLineDecoration;
  }
  
  /**
   * Check if a point is inside the track
   * @param {THREE.Vector3} position - Position to check
   * @returns {boolean} True if position is inside the track
   */
  isPointInsideTrack(position) {
    // Calculate distance from center
    const distance = Math.sqrt(position.x * position.x + position.z * position.z);
    
    // Check if point is within track bounds
    const innerBound = this.trackRadius - this.trackWidth / 2;
    const outerBound = this.trackRadius + this.trackWidth / 2;
    
    return distance >= innerBound && distance <= outerBound;
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    // Call parent cleanup
    super.cleanup();
    
    // Remove track mesh
    if (this.trackMesh) {
      this.scene.remove(this.trackMesh);
      this.trackMesh = null;
    }
    
    // Remove track boundaries
    if (this.innerBoundary) {
      this.scene.remove(this.innerBoundary);
      this.innerBoundary = null;
    }
    
    if (this.outerBoundary) {
      this.scene.remove(this.outerBoundary);
      this.outerBoundary = null;
    }
    
    // Remove finish line decoration
    if (this.finishLineDecoration) {
      this.scene.remove(this.finishLineDecoration);
      this.finishLineDecoration = null;
    }
    
    // Remove ground plane
    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
      this.groundMesh = null;
    }
    
    // Clean up scenery
    if (this.scenery) {
      this.scenery.cleanup();
    }
    
    console.log(`Cleaned up circular track: ${this.name}`);
  }
} 