import * as THREE from 'three';

/**
 * BaseTrack - Core track functionality
 * This base class contains minimal logic needed for all track types
 * It focuses on gameplay elements rather than visual elements
 */
export class BaseTrack {
  constructor(scene, game) {
    // Essential properties
    this.scene = scene;
    this.game = game;
    this.id = 'base_track';
    this.name = 'Base Track';
    this.description = 'Basic track with no visuals';
    
    // Gameplay elements
    this.checkpoints = [];
    this.finishLineTrigger = null;
    this.finishLinePosition = new THREE.Vector3(0, 0, 0);
    this.startPosition = new THREE.Vector3(0, 0.5, 0);
    this.startRotation = 0;
    
    // Track boundaries for collision detection
    this.trackBoundaries = [];
    
    // Lap tracking
    this.totalLaps = 3;
    this.isMultiplayer = false;
    
    // Debug properties
    this.debug = {
      showCheckpoints: false,
      showTrackBoundaries: false
    };
  }
  
  /**
   * Initialize the track
   * This should be called after constructor
   */
  init() {
    console.log(`[DEBUG] BaseTrack.init() called for track: ${this.name} (${this.constructor.name})`);
    this.createCheckpoints();
    this.createFinishLineTrigger();
    // createRaceArchway is now handled in Track.js
    return this;
  }
  
  /**
   * Create checkpoints for lap validation
   * Default implementation creates a single checkpoint
   * Override in specific track implementations
   */
  createCheckpoints() {
    // Default: create a single checkpoint 
    const checkpoint = new THREE.Mesh(
      new THREE.BoxGeometry(10, 2, 10),
      new THREE.MeshBasicMaterial({ 
        color: 0x00ff00, 
        transparent: true, 
        opacity: this.debug.showCheckpoints ? 0.3 : 0
      })
    );
    
    checkpoint.position.set(0, 1, 20);
    checkpoint.name = 'checkpoint';
    this.checkpoints.push(checkpoint);
    this.scene.add(checkpoint);
    
    console.log(`Created ${this.checkpoints.length} checkpoints`);
    return this.checkpoints;
  }
  
  /**
   * Create finish line trigger for lap counting
   */
  createFinishLineTrigger() {
    // Create a trigger box for the finish line
    const triggerGeometry = new THREE.BoxGeometry(10, 5, 1);
    const triggerMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, 
      transparent: true, 
      opacity: this.debug.showCheckpoints ? 0.3 : 0
    });
    
    this.finishLineTrigger = new THREE.Mesh(triggerGeometry, triggerMaterial);
    this.finishLineTrigger.position.copy(this.finishLinePosition);
    this.finishLineTrigger.position.y = 2.5; // Place it above the ground
    this.finishLineTrigger.name = 'finish_line_trigger';
    
    this.scene.add(this.finishLineTrigger);
    console.log('Created finish line trigger');
    return this.finishLineTrigger;
  }
  
  /**
   * Check if a point is inside the track
   * @param {THREE.Vector3} position - Position to check
   * @returns {boolean} True if the position is inside the track
   */
  isPointInsideTrack(position) {
    // Default implementation - assume inside if no boundaries
    if (this.trackBoundaries.length === 0) {
      return true;
    }
    
    // Basic implementation - check if point is within any track boundary
    for (const boundary of this.trackBoundaries) {
      // Assuming boundary is a Box3 or similar
      if (boundary.containsPoint(position)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get the start position for the car
   * @returns {Object} Start position and rotation
   */
  getStartPosition() {
    return {
      position: this.startPosition.clone(),
      rotation: this.startRotation
    };
  }
  
  /**
   * Set the multiplayer mode flag
   * @param {boolean} isMultiplayer - Whether this is a multiplayer game
   */
  setMultiplayerMode(isMultiplayer) {
    this.isMultiplayer = isMultiplayer;
    console.log(`Track set to ${isMultiplayer ? 'multiplayer' : 'single player'} mode`);
  }
  
  /**
   * Check if the car has passed through a checkpoint
   * @param {THREE.Vector3} carPosition - The car's position
   * @param {number} checkpointIndex - Current checkpoint index
   * @returns {boolean} True if checkpoint was passed
   */
  checkCheckpointCollision(carPosition, checkpointIndex) {
    if (!this.checkpoints[checkpointIndex]) {
      return false;
    }
    
    // Simple collision detection - check if car is within the checkpoint
    const checkpoint = this.checkpoints[checkpointIndex];
    const distance = carPosition.distanceTo(checkpoint.position);
    
    // Adjust threshold based on checkpoint size
    const threshold = 5; 
    return distance < threshold;
  }
  
  /**
   * Check if the car has crossed the finish line
   * @param {THREE.Vector3} carPosition - The car's position
   * @returns {boolean} True if finish line was crossed
   */
  checkFinishLineCollision(carPosition) {
    if (!this.finishLineTrigger) return false;
    
    const carBox = new THREE.Box3();
    const carSize = new THREE.Vector3(2, 2, 4);
    carBox.setFromCenterAndSize(carPosition, carSize);
    
    const finishBox = new THREE.Box3().setFromObject(this.finishLineTrigger);
    
    return carBox.intersectsBox(finishBox);
  }
  
  /**
   * Check for lap progress and handle lap completion
   * Called by the car during its update
   * @param {THREE.Vector3} carPosition - The position of the car
   * @param {THREE.Vector3} carDirection - The direction the car is facing
   */
  checkLapProgress(carPosition, carDirection) {
    // Skip if finish line trigger doesn't exist
    if (!this.finishLineTrigger) return;
    
    // Add a property to track if this is the first time we're checking laps
    // This prevents immediate lap completion when first loading a track
    if (this.initialLapCheck === undefined) {
      this.initialLapCheck = true;
      this.lastLapCheckTime = performance.now();
      this.lapCooldownPeriod = 2000; // 2 second cooldown after track loads
      console.log("[TRACK] Initial lap check - setting cooldown");
      return; // Skip the first check to prevent immediate finish
    }
    
    // Add a cooldown to prevent immediate finish when track changes
    const now = performance.now();
    if (this.initialLapCheck && now - this.lastLapCheckTime < this.lapCooldownPeriod) {
      // Still in cooldown period, don't check for laps yet
      return;
    } else if (this.initialLapCheck) {
      // Cooldown period has passed, now consider this track "started"
      this.initialLapCheck = false;
      console.log("[TRACK] Lap cooldown ended, now tracking laps normally");
    }
    
    // Check for checkpoint crossings first (if the track has any)
    if (this.checkpoints && this.checkpoints.length > 0) {
      // Find the next checkpoint index
      const nextCheckpointIndex = this.game && this.game.lastCheckpointPassed !== undefined ? 
        (this.game.lastCheckpointPassed + 1) % this.checkpoints.length : 0;
      
      // Check if car has passed the next checkpoint
      if (this.checkCheckpointCollision(carPosition, nextCheckpointIndex)) {
        if (this.game) {
          this.game.lastCheckpointPassed = nextCheckpointIndex;
          console.log(`[TRACK] Passed checkpoint ${nextCheckpointIndex}`);
        }
      }
    }
    
    // Check finish line crossing
    const isAtFinishLine = this.checkFinishLineCollision(carPosition);
    
    // Only process finish line if game is available
    if (isAtFinishLine && this.game) {
      // Calculate if car is moving in the right direction (simplified check)
      const isMovingForward = carDirection.z >= 0;
      
      if (isMovingForward && !this.game.hasPassedFinishLine) {
        console.log("[TRACK] Finish line crossed");
        this.game.hasPassedFinishLine = true;
        
        // Check if all checkpoints have been passed (if game implements this)
        const validLap = this.game.hasPassedAllRequiredCheckpoints ? 
          this.game.hasPassedAllRequiredCheckpoints() : true;
        
        if (validLap) {
          console.log(`[TRACK] Completing lap ${this.game.currentLap || 0}`);
          
          // If game has lap completion handling, use it
          if (typeof this.game.onLapComplete === 'function') {
            this.game.onLapComplete();
          }
          
          // Increment lap counter if it exists
          if (this.game.currentLap !== undefined) {
            this.game.currentLap++;
          }
        } else {
          console.log("[TRACK] Lap not valid - missing required checkpoints");
        }
      } else if (!isAtFinishLine && this.game.hasPassedFinishLine) {
        this.game.hasPassedFinishLine = false;
      }
    }
  }
  
  /**
   * Update method called every frame
   * @param {number} deltaTime - Time since last frame in seconds
   */
  update(deltaTime) {
    // Track-specific update logic
    
    // Animate grandstands if they exist
    if (this.grandstand && typeof this.grandstand.animate === 'function') {
      this.grandstand.animate(deltaTime);
    }
  }
  
  /**
   * Clean up track resources
   * Important for proper track switching
   */
  cleanup() {
    // Remove finish line trigger
    if (this.finishLineTrigger) {
      this.scene.remove(this.finishLineTrigger);
      this.finishLineTrigger = null;
    }
    
    // Remove checkpoints
    if (this.checkpoints && this.checkpoints.length > 0) {
      this.checkpoints.forEach(checkpoint => {
        this.scene.remove(checkpoint);
      });
      this.checkpoints = [];
    }
    
    // Reset other properties
    this.checkpointTriggers = [];
    
    // Clear track boundaries
    this.trackBoundaries = [];
    
    console.log(`Cleaned up track: ${this.name}`);
  }
  
  /**
   * Log debug information
   * @param {string} message - Debug message
   */
  log(message) {
    console.log(`[Track:${this.id}] ${message}`);
  }
} 