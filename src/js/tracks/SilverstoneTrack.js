import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { ModelTrack } from './ModelTrack.js';

/**
 * SilverstoneTrack - Silverstone racing circuit
 * Uses a 3D model to represent the track
 */
export class SilverstoneTrack extends ModelTrack {
  constructor(scene, game) {
    console.log('[DEBUG] Creating SilverstoneTrack with scene:', !!scene);
    
    // Set some proper defaults for Silverstone in case model loading fails
    const options = {
      id: 'silverstone',
      name: 'Silverstone Circuit',
      description: 'Famous British racing circuit',
      modelPath: 'models/silverstone/silverstone.glb',
      metadataPath: 'models/silverstone/silverstone_metadata.json',
      modelScale: 1.0,
      modelOffset: new THREE.Vector3(0, 0, 0),
      useScenery: false  // We won't use the default scenery
    };
    
    // Make sure we have valid paths to the model and metadata
    console.log('[DEBUG] Silverstone model path:', options.modelPath);
    console.log('[DEBUG] Silverstone metadata path:', options.metadataPath);
    
    // Configure the base ModelTrack class with Silverstone-specific options
    super(scene, game, options);
    
    // Silverstone-specific properties
    this.totalLaps = 3;
    this.startMarker = null;
    this.finishLineMarker = null;
    
    // Flag to track whether the model is visible for debugging
    this.modelVisible = true;
    
    // Debug helpers
    this.debug.showCheckpoints = true;  // Show checkpoint triggers for debugging
    
    // Set a fallback position in case something goes wrong with loading
    this.fallbackStartPosition = new THREE.Vector3(678.51, -200.75, 7876.94);
    this.fallbackStartRotation = Math.PI / 2; // 90 degrees (east)
  }
  
  /**
   * Initialize the track
   */
  async init() {
    try {
      console.log('Initializing Silverstone Track with scene:', this.scene);
      
      // Create a reference grid to help with orientation
      // this.createReferenceGrid();
      
      // Continue with normal initialization
      return await super.init();
    } catch (error) {
      console.error('[SilverstoneTrack] Error initializing track:', error);
      // Create a fallback track if initialization fails
      this.createFallbackTrack();
      return this;
    }
  }
  
  /**
   * Creates a reference grid to help with orientation and debugging
   */
  createReferenceGrid() {
    // Create a grid helper for reference
    const gridSize = 1000;
    const gridDivisions = 100;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions);
    this.scene.add(gridHelper);
    
    // Add coordinate system reference (XYZ axes)
    const axesHelper = new THREE.AxesHelper(50);
    this.scene.add(axesHelper);
    
    // Add a simple ground plane for reference
    const groundGeometry = new THREE.PlaneGeometry(2000, 2000);
    const groundMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x444444, 
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide 
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = Math.PI / 2; // Rotate to lie flat
    ground.position.y = -1;
    this.scene.add(ground);
    
    console.log('Created reference grid and coordinate system');
  }
  
  /**
   * Create a simple fallback track if the model loading fails
   * This ensures we at least have something visible in the scene
   */
  createFallbackTrack() {
    console.log('[DEBUG] Creating fallback track');
    
    // Create a simple circular track with radius 100
    const trackRadius = 100;
    const trackWidth = 20;
    
    // Create a ring geometry for the track
    const trackGeometry = new THREE.RingGeometry(trackRadius - trackWidth/2, trackRadius + trackWidth/2, 64);
    const trackMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    
    // Rotate to be flat on the ground
    trackMesh.rotation.x = -Math.PI / 2;
    
    // Position at y=0
    trackMesh.position.y = 0.1; // Just slightly above ground
    
    // Add to scene
    this.scene.add(trackMesh);
    
    // Set as model
    this.model = trackMesh;
    
    // Update start position to be on the track
    this.startPosition = new THREE.Vector3(trackRadius, 1, 0);
    this.startRotation = Math.PI / 2; // 90 degrees
    
    // Create simple checkpoints
    this.createCheckpoints();
    
    console.log('[DEBUG] Fallback track created');
  }
  
  /**
   * Override loadMetadata to specifically look for Silverstone start lines
   */
  async loadMetadata() {
    // First call the parent method to load the metadata file
    await super.loadMetadata();
    
    // Now set the confirmed Silverstone start position
    console.log('[DEBUG] Setting confirmed Silverstone start position');
    
    // Use the validated start_line_main coordinates (the red marker that was correct)
    const startPos = {
      x: 17.23, 
      y: -5.14 + 1.5, // Add a small offset to ensure car is above ground
      z: 200.07
    };
    
    // Use this position
    this.keyPoints.startPosition = startPos;
    this.startPosition = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    this.startRotation = Math.PI / 2; // 90 degrees (east) - confirmed direction
    this.keyPoints.startRotation = this.startRotation;
    
    console.log('[DEBUG] Using confirmed Silverstone start position:', 
      `x: ${this.startPosition.x.toFixed(2)}, ` +
      `y: ${this.startPosition.y.toFixed(2)}, ` +
      `z: ${this.startPosition.z.toFixed(2)}, ` +
      `rotation: ${this.startRotation.toFixed(2)}`
    );
    
    // Create a visual marker only in debug mode
    if (this.debug.showCheckpoints) {
      this.createStartMarker();
    }
    
    return this.metadata;
  }
  
  /**
   * Create a visual marker at the start position
   * This is helpful for debugging the correct start position
   */
  createStartMarker() {
    // Remove existing marker if any
    if (this.startMarker) {
      this.scene.remove(this.startMarker);
      this.startMarker = null;
    }
    
    // Create a visible marker at the start position
    const markerGeometry = new THREE.ConeGeometry(5, 10, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red color
    
    this.startMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.startMarker.position.copy(this.startPosition);
    
    // Rotate to point in the direction of travel
    this.startMarker.rotation.y = this.startRotation;
    
    // Add a small platform to make it more visible
    const platformGeometry = new THREE.BoxGeometry(10, 1, 10);
    const platformMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow color
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = -5; // Place it underneath the cone
    
    this.startMarker.add(platform);
    
    // Add a direction arrow
    const arrowGeometry = new THREE.BoxGeometry(20, 1, 1);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green color
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.position.z = 15; // Point forward
    
    this.startMarker.add(arrow);
    
    // Add to scene
    this.scene.add(this.startMarker);
    console.log('Created start position marker at:', this.startPosition);
  }
  
  /**
   * Create checkpoints based on the track layout
   * Called by the parent class after the model is loaded
   */
  createCheckpoints() {
    // If we have checkpoint data from metadata, use the parent method
    if (this.metadataLoaded && this.metadata.keyPoints && this.metadata.keyPoints.checkpoints) {
      return super.createCheckpoints();
    }
    
    // Otherwise, create custom checkpoints for Silverstone
    console.log('[DEBUG] Creating custom checkpoints for Silverstone circuit');
    
    // Clear existing checkpoints
    this.checkpoints.forEach(checkpoint => {
      this.scene.remove(checkpoint);
    });
    this.checkpoints = [];
    
    // Define checkpoint positions based on our validated start position
    // Place checkpoints along the Silverstone track layout
    const checkpointPositions = [
      // First checkpoint after the start line
      { x: 100, y: 1, z: 200 },
      // Second checkpoint - into first corner
      { x: 200, y: 1, z: 300 },
      // Third checkpoint - mid track
      { x: 100, y: 1, z: 300 },
      // Fourth checkpoint - coming back toward finish line
      { x: 0, y: 1, z: 250 },
    ];
    
    // Create each checkpoint
    checkpointPositions.forEach((pos, index) => {
      const checkpointSize = 25; // Make checkpoints larger to ensure they're hit
      const checkpointGeometry = new THREE.BoxGeometry(checkpointSize, 10, checkpointSize);
      const checkpointMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: this.debug.showCheckpoints ? 0.3 : 0
      });
      
      const checkpoint = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
      checkpoint.position.set(pos.x, pos.y, pos.z);
      checkpoint.name = `silverstone_checkpoint_${index}`;
      
      // Add a visible marker to show checkpoint index in debug mode
      if (this.debug.showCheckpoints) {
        const textCanvas = document.createElement('canvas');
        textCanvas.width = 128;
        textCanvas.height = 128;
        const ctx = textCanvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.font = 'bold 80px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(index + 1, 64, 96); // Display 1-based checkpoint number
        
        const texture = new THREE.CanvasTexture(textCanvas);
        const labelMaterial = new THREE.SpriteMaterial({ map: texture });
        const label = new THREE.Sprite(labelMaterial);
        label.position.y = 10;
        label.scale.set(10, 10, 1);
        
        checkpoint.add(label);
      }
      
      this.checkpoints.push(checkpoint);
      this.scene.add(checkpoint);
      
      console.log(`[DEBUG] Created checkpoint ${index} at:`, pos);
    });
    
    console.log(`[DEBUG] Created ${this.checkpoints.length} checkpoints for Silverstone circuit`);
    return this.checkpoints;
  }
  
  /**
   * Create a debug panel specific to Silverstone
   * Extends the ModelTrack debug panel with additional Silverstone-specific functionality
   */
  createDebugPanel() {
    // Call the parent method to create the base debug panel
    super.createDebugPanel();
    
    // Add a button to toggle model visibility
    if (this.debugPanel) {
      const toggleModelButton = document.createElement('button');
      toggleModelButton.textContent = 'Toggle Model Visibility';
      toggleModelButton.style.display = 'block';
      toggleModelButton.style.margin = '10px 0';
      toggleModelButton.style.padding = '5px 10px';
      
      toggleModelButton.addEventListener('click', () => {
        this.toggleModelVisibility();
      });
      
      this.debugPanel.appendChild(toggleModelButton);
    }
  }
  
  /**
   * Toggle the visibility of the track model
   * Useful for debugging and seeing what's underneath
   */
  toggleModelVisibility() {
    if (!this.model) {
      console.warn('No model to toggle visibility');
      return;
    }
    
    this.modelVisible = !this.modelVisible;
    
    // Make all meshes in the model visible/invisible
    this.model.traverse(child => {
      if (child.isMesh) {
        child.visible = this.modelVisible;
      }
    });
    
    console.log(`Model visibility set to: ${this.modelVisible}`);
  }
  
  /**
   * Clean up resources specific to Silverstone
   */
  cleanup() {
    // Call the parent cleanup method first
    super.cleanup();
    
    // Clean up Silverstone-specific resources
    if (this.startMarker) {
      this.scene.remove(this.startMarker);
      this.startMarker = null;
    }
    
    if (this.finishLineMarker) {
      this.scene.remove(this.finishLineMarker);
      this.finishLineMarker = null;
    }
    
    console.log('Cleaned up Silverstone track');
  }
  
  /**
   * Get the starting position for cars on this track
   * @returns {Object} Object with position (Vector3) and rotation (Number)
   */
  getStartPosition() {
    console.log('[DEBUG] SilverstoneTrack.getStartPosition called');
    
    // Check if the start position is far from the origin, which might indicate an issue
    if (this.startPosition && (
        Math.abs(this.startPosition.x) > 1000 || 
        Math.abs(this.startPosition.y) > 1000 || 
        Math.abs(this.startPosition.z) > 1000)) {
      console.warn('[DEBUG] Start position seems very far from the origin, this might cause visibility issues');
      
      // Create a safer fallback position
      if (this.model) {
        const boundingBox = new THREE.Box3().setFromObject(this.model);
        const centerPosition = new THREE.Vector3(
          (boundingBox.min.x + boundingBox.max.x) / 2,
          (boundingBox.min.y + boundingBox.max.y) / 2 + 5, // Lift above ground
          (boundingBox.min.z + boundingBox.max.z) / 2
        );
        
        console.log('[DEBUG] Using center of model as start position instead:', centerPosition);
        return {
          position: centerPosition,
          rotation: this.startRotation || Math.PI / 2
        };
      }
    }
    
    // Use the correct position from metadata if available
    // Otherwise fall back to a safe default position
    const defaultPosition = new THREE.Vector3(0, 5, 0); // Safe default at origin
    const defaultRotation = Math.PI / 2; // 90 degrees (east)
    
    // Get the position and rotation
    const position = this.startPosition || defaultPosition;
    const rotation = this.startRotation !== undefined ? this.startRotation : defaultRotation;
    
    console.log(`[DEBUG] SilverstoneTrack.getStartPosition: Using position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) with rotation ${rotation.toFixed(2)}`);
    
    // Create a visual marker at the start position if not already created
    this.createStartMarker();
    
    return {
      position: position,
      rotation: rotation
    };
  }
  
  /**
   * Override styleHUD to prevent default styling
   */
  styleHUD() {
    console.log('[DEBUG] SilverstoneTrack.styleHUD() called - IGNORING - using custom styling');
    // Do nothing here - we don't want to apply the default styling
    return;
  }
  
  /**
   * Override createVisualMarkers to create specific visual markers for Silverstone
   * This is called by the parent ModelTrack class after model loading
   */
  createVisualMarkers() {
    console.log('[SilverstoneTrack] Creating visual markers');
    
    // Only create markers in debug mode
    if (!this.debug.showCheckpoints) {
      return;
    }
    
    // Create start marker at the confirmed position
    this.createStartMarker();
    
    // Create a grid helper and axes for reference
    const gridHelper = new THREE.GridHelper(50, 10);
    gridHelper.position.copy(this.startPosition);
    gridHelper.position.y -= 1; // Position slightly below the start point
    this.scene.add(gridHelper);
    
    const axesHelper = new THREE.AxesHelper(20);
    axesHelper.position.copy(this.startPosition);
    this.scene.add(axesHelper);
  }
} 