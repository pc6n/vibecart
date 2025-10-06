import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BaseTrack } from './BaseTrack.js';

/**
 * ModelTrack - A track implementation that loads a 3D model
 * Extends BaseTrack with model loading capabilities
 */
export class ModelTrack extends BaseTrack {
  constructor(scene, game, options = {}) {
    super(scene, game);
    
    // Override base properties
    this.id = options.id || 'model_track';
    this.name = options.name || 'Model Track';
    this.description = options.description || 'Track based on a 3D model';
    
    // Model properties
    this.modelPath = options.modelPath || '';
    this.model = null;
    this.modelScale = options.modelScale || 1;
    this.modelOffset = options.modelOffset || new THREE.Vector3(0, 0, 0);
    this.modelRotation = options.modelRotation || new THREE.Euler(0, 0, 0);
    this.showModel = options.showModel !== undefined ? options.showModel : true;
    
    // Metadata
    this.metadataPath = options.metadataPath || '';
    this.metadata = null;
    this.metadataLoaded = false;
    
    // Track analysis
    this.dimensions = {
      minX: 0, maxX: 0, 
      minY: 0, maxY: 0, 
      minZ: 0, maxZ: 0,
      width: 0, height: 0, depth: 0
    };
    this.keyPoints = {};
    
    // Debug options
    this.debug = {
      showCheckpoints: options.showCheckpoints || false,
      showBoundingBox: options.showBoundingBox || false,
      showAxes: options.showAxes || false
    };
    
    // Debug panel
    this.debugPanelVisible = false;
    this.debugPanel = null;
  }
  
  /**
   * Initialize the track, load model and metadata
   */
  async init() {
    console.log(`Initializing model track: ${this.name}`);
    
    // Load metadata if available
    if (this.metadataPath) {
      await this.loadMetadata();
    }
    
    // Load the model
    if (this.modelPath) {
      await this.loadModel();
    }
    
    // Setup gameplay elements
    await this.createFinishLineTrigger();
    await this.createCheckpoints();
    
    // Create debug panel for model analysis
    this.createDebugPanel();
    
    return this;
  }
  
  /**
   * Load metadata for the track if available
   * @returns {Promise} Promise that resolves when metadata is loaded
   */
  async loadMetadata() {
    if (!this.metadataPath) {
      console.log('No metadata path specified');
      return null;
    }
    
    try {
      console.log(`Loading metadata from ${this.metadataPath}`);
      const response = await fetch(this.metadataPath);
      if (!response.ok) {
        throw new Error(`Failed to load metadata: ${response.statusText}`);
      }
      
      this.metadata = await response.json();
      this.metadataLoaded = true;
      
      console.log('Metadata loaded successfully:', this.metadata);
      
      // Extract important information
      if (this.metadata.dimensions) {
        this.dimensions = this.metadata.dimensions;
      }
      
      if (this.metadata.keyPoints) {
        this.keyPoints = this.metadata.keyPoints;
        
        // Update start and finish positions if available
        if (this.keyPoints.startPosition) {
          this.startPosition = new THREE.Vector3(
            this.keyPoints.startPosition.x,
            this.keyPoints.startPosition.y,
            this.keyPoints.startPosition.z
          );
        }
        
        if (this.keyPoints.finishLine) {
          this.finishLinePosition = new THREE.Vector3(
            this.keyPoints.finishLine.x,
            this.keyPoints.finishLine.y,
            this.keyPoints.finishLine.z
          );
        }
        
        if (this.keyPoints.startRotation !== undefined) {
          this.startRotation = this.keyPoints.startRotation;
        }
      }
      
      return this.metadata;
    } catch (error) {
      console.error('Error loading metadata:', error);
      return null;
    }
  }
  
  /**
   * Load the track model
   * @returns {Promise} Promise that resolves when model is loaded
   */
  async loadModel() {
    console.log(`[ModelTrack] Loading model for ${this.name} from ${this.modelPath}`);
    
    try {
      // Use GLTFLoader directly instead of loaderService
      const loader = new GLTFLoader();
      
      // Use a Promise to load the model
      const gltf = await new Promise((resolve, reject) => {
        loader.load(
          this.modelPath,
          (gltf) => resolve(gltf),
          (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            console.log(`[ModelTrack] Loading progress: ${percent.toFixed(2)}%`);
          },
          (error) => reject(error)
        );
      });
      
      this.model = gltf.scene;
      
      // Set model scale
      this.model.scale.set(this.modelScale, this.modelScale, this.modelScale);
      
      // Apply model offset if specified
      if (this.modelOffset) {
        this.model.position.x = this.modelOffset.x || 0;
        this.model.position.y = this.modelOffset.y || 0;
        this.model.position.z = this.modelOffset.z || 0;
      }
      
      // Set visibility based on the showModel property
      this.model.visible = true; // Always make visible for now for debugging
      
      // Debug model visibility
      let visibleMeshCount = 0;
      let totalMeshCount = 0;
      this.model.traverse(child => {
        if (child.isMesh) {
          totalMeshCount++;
          if (child.visible) {
            visibleMeshCount++;
          }
        }
      });
      
      console.log(`[ModelTrack] Model loaded - visible: ${this.model.visible}, meshes: ${visibleMeshCount}/${totalMeshCount}`);
      
      // Calculate bounding box to help with debugging
      const box = new THREE.Box3().setFromObject(this.model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      
      console.log(`[ModelTrack] Model bounds: 
        size: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})
        center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})
        min: (${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)})
        max: (${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)})
      `);
      
      // Add model to scene
      this.scene.add(this.model);
      this.modelLoaded = true;
      
      // Determine the start position and track bounds
      // (don't wait for metadata if we can analyze the model)
      if (!this.metadataLoaded) {
        this.analyzeModel();
      }
      
      // Create visual markers for key points
      this.createVisualMarkers();
      
      return this.model;
    } catch (error) {
      console.error(`[ModelTrack] Error loading model for ${this.name}:`, error);
      this.fallbackToSimpleTrack();
      
      return null;
    }
  }
  
  /**
   * Creates a simple fallback track when the model fails to load
   * This ensures we at least have something visible in the scene
   */
  fallbackToSimpleTrack() {
    console.log('[ModelTrack] Creating fallback track');
    
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
    
    console.log('[ModelTrack] Fallback track created');
  }
  
  /**
   * Analyze the loaded model to determine dimensions and key points
   */
  analyzeModel() {
    if (!this.model) {
      console.warn('Cannot analyze model: No model loaded');
      return;
    }
    
    console.log('Analyzing model...');
    
    // Initialize metadata if not loaded from file
    if (!this.metadata) {
      this.metadata = {
        asset: { version: "1.0", generator: "Model Analyzer" },
        nodes: [],
        materials: [],
        dimensions: { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity },
        keyPoints: {},
        extensions: {},
        extras: {}
      };
    }
    
    // Calculate bounding box for the entire model
    const boundingBox = new THREE.Box3().setFromObject(this.model);
    
    // Store dimensions
    this.dimensions.minX = boundingBox.min.x;
    this.dimensions.maxX = boundingBox.max.x;
    this.dimensions.minY = boundingBox.min.y;
    this.dimensions.maxY = boundingBox.max.y;
    this.dimensions.minZ = boundingBox.min.z;
    this.dimensions.maxZ = boundingBox.max.z;
    this.dimensions.width = boundingBox.max.x - boundingBox.min.x;
    this.dimensions.height = boundingBox.max.y - boundingBox.min.y;
    this.dimensions.depth = boundingBox.max.z - boundingBox.min.z;
    
    // Update metadata
    this.metadata.dimensions = this.dimensions;
    
    // Look for key elements in the model based on naming
    this.model.traverse((node) => {
      // Save node information
      if (node.isMesh) {
        this.metadata.nodes.push({
          name: node.name,
          type: 'Mesh',
          position: { x: node.position.x, y: node.position.y, z: node.position.z },
          scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
          rotation: { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z }
        });
        
        // Save material information
        if (node.material) {
          const materialInfo = {
            name: node.material.name || 'unnamed',
            type: node.material.type,
            color: node.material.color ? '#' + node.material.color.getHexString() : null,
            transparent: node.material.transparent || false,
            opacity: node.material.opacity !== undefined ? node.material.opacity : 1
          };
          
          this.metadata.materials.push(materialInfo);
        }
        
        // Look for special node names to identify key points
        const nameLower = node.name.toLowerCase();
        
        if (nameLower.includes('start') || nameLower.includes('player_start')) {
          this.keyPoints.startPosition = { 
            x: node.position.x, 
            y: node.position.y + 1, // Lift it above ground
            z: node.position.z 
          };
          
          // Look for rotation information
          if (node.rotation.y !== undefined) {
            this.keyPoints.startRotation = node.rotation.y;
          }
        }
        
        if (nameLower.includes('finish') || nameLower.includes('finishline')) {
          this.keyPoints.finishLine = { 
            x: node.position.x, 
            y: node.position.y, 
            z: node.position.z 
          };
        }
        
        if (nameLower.includes('checkpoint')) {
          const checkpointId = parseInt(nameLower.replace(/\D/g, ''), 10) || this.metadata.keyPoints.checkpoints?.length || 0;
          if (!this.keyPoints.checkpoints) {
            this.keyPoints.checkpoints = [];
          }
          
          this.keyPoints.checkpoints.push({
            id: checkpointId,
            position: { x: node.position.x, y: node.position.y, z: node.position.z }
          });
        }
      }
    });
    
    // If no start position found in model, use center of track
    if (!this.keyPoints.startPosition) {
      this.keyPoints.startPosition = {
        x: (this.dimensions.minX + this.dimensions.maxX) / 2,
        y: this.dimensions.maxY + 1, // Above the highest point
        z: (this.dimensions.minZ + this.dimensions.maxZ) / 2
      };
    }
    
    // If no finish line found, create one in front of start position
    if (!this.keyPoints.finishLine) {
      this.keyPoints.finishLine = {
        x: this.keyPoints.startPosition.x,
        y: this.keyPoints.startPosition.y - 0.5,
        z: this.keyPoints.startPosition.z + 5
      };
    }
    
    // Update start and finish positions
    this.startPosition = new THREE.Vector3(
      this.keyPoints.startPosition.x,
      this.keyPoints.startPosition.y,
      this.keyPoints.startPosition.z
    );
    
    this.finishLinePosition = new THREE.Vector3(
      this.keyPoints.finishLine.x,
      this.keyPoints.finishLine.y,
      this.keyPoints.finishLine.z
    );
    
    // Update metadata
    this.metadata.keyPoints = this.keyPoints;
    
    console.log('Model analysis complete:', this.metadata);
  }
  
  /**
   * Create visual markers for key points
   */
  createVisualMarkers() {
    // Only create visual markers in debug mode
    if (!this.debug.showCheckpoints) {
      return;
    }
    
    console.log('Creating visual markers for key points');
    
    // Create start position marker
    if (this.keyPoints.startPosition) {
      const markerGeometry = new THREE.ConeGeometry(1, 2, 8);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      
      marker.position.set(
        this.keyPoints.startPosition.x,
        this.keyPoints.startPosition.y,
        this.keyPoints.startPosition.z
      );
      
      marker.name = 'start_marker';
      this.scene.add(marker);
    }
    
    // Create finish line marker
    if (this.keyPoints.finishLine) {
      const markerGeometry = new THREE.BoxGeometry(5, 0.5, 0.5);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      
      marker.position.set(
        this.keyPoints.finishLine.x,
        this.keyPoints.finishLine.y,
        this.keyPoints.finishLine.z
      );
      
      marker.name = 'finish_marker';
      this.scene.add(marker);
    }
    
    // Create checkpoint markers
    if (this.keyPoints.checkpoints) {
      this.keyPoints.checkpoints.forEach((checkpoint, index) => {
        const markerGeometry = new THREE.SphereGeometry(1, 16, 16);
        const markerMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x0000ff,
          transparent: true,
          opacity: 0.5
        });
        
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        
        marker.position.set(
          checkpoint.position.x,
          checkpoint.position.y,
          checkpoint.position.z
        );
        
        marker.name = `checkpoint_marker_${index}`;
        this.scene.add(marker);
      });
    }
  }
  
  /**
   * Create checkpoints based on model analysis or metadata
   */
  createCheckpoints() {
    // Clear existing checkpoints
    this.checkpoints.forEach(checkpoint => {
      this.scene.remove(checkpoint);
    });
    this.checkpoints = [];
    
    // If no checkpoints data, create default ones
    if (!this.keyPoints.checkpoints || this.keyPoints.checkpoints.length === 0) {
      // Create a basic set of checkpoints around the track
      const centerX = (this.dimensions.minX + this.dimensions.maxX) / 2;
      const centerZ = (this.dimensions.minZ + this.dimensions.maxZ) / 2;
      const radius = Math.min(this.dimensions.width, this.dimensions.depth) / 2.5;
      
      const checkpointCount = 4;
      for (let i = 0; i < checkpointCount; i++) {
        const angle = (i / checkpointCount) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius;
        const z = centerZ + Math.sin(angle) * radius;
        
        const checkpointGeometry = new THREE.BoxGeometry(10, 2, 10);
        const checkpointMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x00ff00,
          transparent: true,
          opacity: this.debug.showCheckpoints ? 0.3 : 0
        });
        
        const checkpoint = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
        checkpoint.position.set(x, this.dimensions.maxY / 2, z);
        checkpoint.name = `checkpoint_${i}`;
        
        this.checkpoints.push(checkpoint);
        this.scene.add(checkpoint);
      }
    } else {
      // Create checkpoints from keypoints data
      this.keyPoints.checkpoints.forEach((checkpointData, index) => {
        const checkpointGeometry = new THREE.BoxGeometry(10, 2, 10);
        const checkpointMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x00ff00,
          transparent: true,
          opacity: this.debug.showCheckpoints ? 0.3 : 0
        });
        
        const checkpoint = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
        checkpoint.position.set(
          checkpointData.position.x,
          checkpointData.position.y,
          checkpointData.position.z
        );
        checkpoint.name = `checkpoint_${index}`;
        
        this.checkpoints.push(checkpoint);
        this.scene.add(checkpoint);
      });
    }
    
    console.log(`Created ${this.checkpoints.length} checkpoints`);
    return this.checkpoints;
  }
  
  /**
   * Create a finish line trigger based on model analysis or metadata
   */
  createFinishLineTrigger() {
    // Remove existing trigger if any
    if (this.finishLineTrigger) {
      this.scene.remove(this.finishLineTrigger);
    }
    
    // Create a trigger box for the finish line
    const triggerGeometry = new THREE.BoxGeometry(10, 5, 2);
    const triggerMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,
      transparent: true,
      opacity: this.debug.showCheckpoints ? 0.3 : 0
    });
    
    this.finishLineTrigger = new THREE.Mesh(triggerGeometry, triggerMaterial);
    
    // Position at finish line position
    this.finishLineTrigger.position.copy(this.finishLinePosition);
    this.finishLineTrigger.position.y += 2.5; // Elevate it a bit
    
    this.finishLineTrigger.name = 'finish_line_trigger';
    this.scene.add(this.finishLineTrigger);
    
    console.log('Created finish line trigger');
    return this.finishLineTrigger;
  }
  
  /**
   * Create a debug panel for the model track
   */
  createDebugPanel() {
    // Create panel container
    const panel = document.createElement('div');
    panel.id = `debug-panel-${this.id}`;
    panel.className = 'debug-panel';
    panel.style.position = 'absolute';
    panel.style.top = '10px';
    panel.style.right = '10px';
    panel.style.width = '300px';
    panel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    panel.style.color = 'white';
    panel.style.padding = '10px';
    panel.style.borderRadius = '5px';
    panel.style.fontFamily = 'monospace';
    panel.style.zIndex = '1000';
    panel.style.maxHeight = '80vh';
    panel.style.overflowY = 'auto';
    panel.style.display = 'none'; // Hidden by default
    
    // Create toggle button
    const toggleButton = document.createElement('button');
    toggleButton.textContent = this.metadataLoaded ? 'Show Model Info (Metadata)' : 'Show Model Info (Analyzed)';
    toggleButton.style.position = 'absolute';
    toggleButton.style.top = '10px';
    toggleButton.style.right = '10px';
    toggleButton.style.zIndex = '1001';
    toggleButton.style.padding = '5px 10px';
    toggleButton.style.backgroundColor = this.metadataLoaded ? '#4CAF50' : '#2196F3';
    toggleButton.style.color = 'white';
    toggleButton.style.border = 'none';
    toggleButton.style.borderRadius = '3px';
    toggleButton.style.cursor = 'pointer';
    
    // Update panel content
    const updatePanelContent = () => {
      let content = `<h2>${this.name} - Model Info</h2>`;
      
      // Show metadata source
      content += `<p>Source: ${this.metadataLoaded ? 'Loaded from file' : 'Analyzed from model'}</p>`;
      
      // Model dimensions
      content += '<h3>Model Dimensions</h3>';
      content += `<p>Width: ${this.dimensions.width.toFixed(2)}</p>`;
      content += `<p>Height: ${this.dimensions.height.toFixed(2)}</p>`;
      content += `<p>Depth: ${this.dimensions.depth.toFixed(2)}</p>`;
      
      // Key points
      content += '<h3>Key Points</h3>';
      
      // Start position
      if (this.keyPoints.startPosition) {
        content += '<details>';
        content += '<summary>Start Position</summary>';
        content += `<p>X: ${this.keyPoints.startPosition.x.toFixed(2)}</p>`;
        content += `<p>Y: ${this.keyPoints.startPosition.y.toFixed(2)}</p>`;
        content += `<p>Z: ${this.keyPoints.startPosition.z.toFixed(2)}</p>`;
        if (this.keyPoints.startRotation !== undefined) {
          content += `<p>Rotation: ${this.keyPoints.startRotation.toFixed(2)}</p>`;
        }
        content += '</details>';
      }
      
      // Finish line
      if (this.keyPoints.finishLine) {
        content += '<details>';
        content += '<summary>Finish Line</summary>';
        content += `<p>X: ${this.keyPoints.finishLine.x.toFixed(2)}</p>`;
        content += `<p>Y: ${this.keyPoints.finishLine.y.toFixed(2)}</p>`;
        content += `<p>Z: ${this.keyPoints.finishLine.z.toFixed(2)}</p>`;
        content += '</details>';
      }
      
      // Nodes
      if (this.metadata.nodes && this.metadata.nodes.length > 0) {
        content += '<details>';
        content += `<summary>Nodes (${this.metadata.nodes.length})</summary>`;
        content += '<ul>';
        this.metadata.nodes.slice(0, 10).forEach(node => {
          content += `<li>${node.name} (${node.type})</li>`;
        });
        if (this.metadata.nodes.length > 10) {
          content += `<li>...and ${this.metadata.nodes.length - 10} more</li>`;
        }
        content += '</ul>';
        content += '</details>';
      }
      
      // Materials
      if (this.metadata.materials && this.metadata.materials.length > 0) {
        content += '<details>';
        content += `<summary>Materials (${this.metadata.materials.length})</summary>`;
        content += '<ul>';
        this.metadata.materials.slice(0, 10).forEach(material => {
          content += `<li>${material.name} (${material.color || 'no color'})</li>`;
        });
        if (this.metadata.materials.length > 10) {
          content += `<li>...and ${this.metadata.materials.length - 10} more</li>`;
        }
        content += '</ul>';
        content += '</details>';
      }
      
      // Export button
      content += '<h3>Actions</h3>';
      
      // Export metadata
      const exportButton = document.createElement('button');
      exportButton.textContent = 'Export Metadata as JSON';
      exportButton.style.display = 'block';
      exportButton.style.margin = '10px 0';
      exportButton.style.padding = '5px 10px';
      
      // Position car at start
      const positionButton = document.createElement('button');
      positionButton.textContent = 'Position Car at Start';
      positionButton.style.display = 'block';
      positionButton.style.margin = '10px 0';
      positionButton.style.padding = '5px 10px';
      
      panel.innerHTML = content;
      panel.appendChild(exportButton);
      panel.appendChild(positionButton);
      
      // Add button event listeners
      exportButton.addEventListener('click', this.exportMetadata.bind(this));
      positionButton.addEventListener('click', this.positionCarAtStart.bind(this));
    };
    
    // Toggle button click handler
    toggleButton.addEventListener('click', () => {
      this.debugPanelVisible = !this.debugPanelVisible;
      panel.style.display = this.debugPanelVisible ? 'block' : 'none';
      
      // Update content when showing
      if (this.debugPanelVisible) {
        updatePanelContent();
      }
    });
    
    // Save references
    this.debugPanel = panel;
    
    // Add to document
    document.body.appendChild(toggleButton);
    document.body.appendChild(panel);
  }
  
  /**
   * Export metadata as JSON file
   */
  exportMetadata() {
    if (!this.metadata) {
      console.warn('No metadata to export');
      return;
    }
    
    // Create a blob with the JSON data
    const data = JSON.stringify(this.metadata, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    
    // Create a link element to download the file
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.id}_metadata.json`;
    
    // Append to body, click and remove
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  }
  
  /**
   * Position car at the starting position
   */
  positionCarAtStart() {
    if (!this.game || !this.game.car) {
      console.warn('Game or car not available');
      return;
    }
    
    // Get start position
    const startPos = this.getStartPosition();
    
    // Update car position and rotation
    this.game.car.setPosition(startPos.position);
    this.game.car.setRotation(startPos.rotation);
    
    console.log('Car positioned at start:', startPos);
  }
  
  /**
   * Check if a point is inside the track model
   * Uses raycasting to determine if a point is above the track surface
   * @param {THREE.Vector3} position - Position to check
   * @returns {boolean} True if the position is above the track surface
   */
  isPointInsideTrack(position) {
    if (!this.model) {
      return true; // No track model, assume inside
    }
    
    // Create raycaster pointing down
    const raycaster = new THREE.Raycaster();
    raycaster.set(
      new THREE.Vector3(position.x, position.y + 1, position.z),
      new THREE.Vector3(0, -1, 0)
    );
    
    // Get all intersections with the track model
    const intersects = raycaster.intersectObject(this.model, true);
    
    // Point is inside track if there's at least one intersection below it
    return intersects.length > 0;
  }
  
  /**
   * Check collision with track model
   * @param {THREE.Vector3} position - Position to check
   * @returns {boolean} True if collision occurred
   */
  checkCollision(position) {
    return !this.isPointInsideTrack(position);
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    // Call parent cleanup
    super.cleanup();
    
    // Remove model
    if (this.model) {
      this.scene.remove(this.model);
      this.model = null;
    }
    
    // Remove debug panel
    if (this.debugPanel) {
      if (this.debugPanel.parentNode) {
        this.debugPanel.parentNode.removeChild(this.debugPanel);
      }
      
      // Also remove the toggle button (which is the previous sibling)
      const toggleButton = document.querySelector(`button[data-target="${this.debugPanel.id}"]`);
      if (toggleButton && toggleButton.parentNode) {
        toggleButton.parentNode.removeChild(toggleButton);
      }
    }
    
    console.log(`Cleaned up model track: ${this.name}`);
  }
  
  /**
   * Override createTrack to prevent base Track class from creating the default track
   * ModelTrack loads a 3D model instead of creating a procedural track
   */
  createTrack() {
    console.log('[DEBUG] ModelTrack.createTrack() called - IGNORING - should not create procedural track');
    // Do nothing here - we don't want to create a procedural track
    // The model will be loaded instead
    return;
  }
  
  /**
   * Override addScenery to prevent default scenery
   */
  addScenery() {
    console.log('[DEBUG] ModelTrack.addScenery() called - IGNORING - no default scenery needed');
    // Do nothing here - we don't want to add any default scenery
    return;
  }
  
  /**
   * Override createTrackBoundaries to prevent default track boundaries
   */
  createTrackBoundaries() {
    console.log('[DEBUG] ModelTrack.createTrackBoundaries() called - IGNORING - no default boundaries needed');
    // Do nothing here - we don't want to add any default track boundaries
    return;
  }
  
  /**
   * Get the starting position for this track
   * Either uses the start position from metadata or a default fallback
   * @returns {Object} Object with position (Vector3) and rotation (Number)
   */
  getStartPosition() {
    // Create fallback position based on track dimensions
    const fallbackPosition = new THREE.Vector3(
      (this.dimensions.minX + this.dimensions.maxX) / 2,
      Math.max(1, this.dimensions.minY + 1),
      (this.dimensions.minZ + this.dimensions.maxZ) / 2
    );
    
    // Use metadata-defined start position if available
    const position = this.startPosition || fallbackPosition;
    const rotation = this.startRotation || 0;
    
    console.log(`[DEBUG] ModelTrack.getStartPosition: Using position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) with rotation ${rotation.toFixed(2)}`);
    
    return {
      position: position,
      rotation: rotation
    };
  }
} 