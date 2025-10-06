import * as THREE from 'three';
import { Scenery } from './environment/Scenery';
import { Grandstand } from './environment/Grandstand';
import { BaseTrack } from './tracks/BaseTrack';

export class Track extends BaseTrack {
  constructor(scene, game) {
    super(scene, game);
    
    // Set track ID
    this.id = 'default';
    
    // Track properties
    this.trackRadius = 100;
    this.trackWidth = 20;
    
    this.groundSize = 500;
    this.groundColor = 0x336633;
    
    this.trackBoundaries = [];
    this.checkpoints = [];
    this.finishLineTrigger = null;
    
    this.keypoints = [];
    this.items = [];
    
    this.scenery = new Scenery(scene);
    this.grandstand = new Grandstand(scene);
    
    // For performance tracking
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.frameRate = 0;
    
    // Lap counting
    this.currentLap = 0;
    this.lastCheckpointPassed = -1;
    this.checkpointCount = 4; // We'll use 4 checkpoints around the track
    this.hasPassedFinishLine = false;
    this.lapTimes = [];
    this.lapStartTime = performance.now(); // Use performance.now() for high-precision timing
    this.raceFinished = false;
    this.totalLaps = 3;
    this.finishLineCooldown = false; // Add cooldown flag
    this.cooldownDuration = 5000; // 5 seconds cooldown in milliseconds
    this.requiredCheckpoints = [0, 1, 2, 3]; // Must pass these in order
    this.checkpointsPassedThisLap = []; // Track which checkpoints we've passed
    
    // Speed stripes properties
    this.speedStripes = [];
    this.stripeAnimationTime = 0;
    
    // Debug settings
    this.debugMode = false; // Enable debug mode to see what's happening
    
    // For multiplayer
    this.isMultiplayer = false;
    
    // Initialize sound system
    this.setupSoundSystem();
    
    this.log("Track initialized with lap start time:", this.lapStartTime);
  }
  
  /**
   * Initialize the track asynchronously
   * @returns {Promise} Promise that resolves when track is fully initialized
   */
  async init() {
    try {
      this.log("Initializing track...");
      
      // Create the track
      this.createTrack();
      
      // Create checkpoints and finish line
      this.createCheckpoints();
      this.createFinishLineTrigger();
      
      // Create the VIBEJAM 2025 archway at the start/finish line
      this.createRaceArchway();
      
      // Create speed-reducing stripes
      this.createSpeedStripes();
      
      // Start playing background music at a low volume
      this.playBackgroundMusic();
      
      // Style the HUD
      this.styleHUD();
      
      // Call parent class initialization
      await super.init();
      
      this.log("Track initialization complete");
      return this;
    } catch (error) {
      console.error("Error initializing track:", error);
      throw error;
    }
  }

  // Logger function that only outputs if debug mode is enabled
  log(message, ...args) {
    if (this.debugMode) {
      console.log(message, ...args);
    }
  }

  createTrack() {
    // Create ground plane
    const groundGeometry = new THREE.PlaneGeometry(this.groundSize, this.groundSize);
    const groundMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x1e8449,
      side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Create a circular track
    this.createCircularTrack();

    // Create track boundaries
    this.createTrackBoundaries();

    // Create checkpoints for lap validation
    this.createCheckpoints();

    // Add scenery
    this.addScenery();

    // Add starting grid positions
    this.createStartingGrid();

    // Create finish line trigger as an invisible item
    const finishLineGeometry = new THREE.BoxGeometry(this.trackWidth + 2, 4, 2);
    const finishLineMaterial = new THREE.MeshBasicMaterial({
        visible: false,
        transparent: true,
        opacity: 0.3,
        color: 0xff0000
    });
    this.finishLineTrigger = new THREE.Mesh(finishLineGeometry, finishLineMaterial);
    this.finishLineTrigger.position.set(this.trackRadius, 0.5, 0);
    this.finishLineTrigger.updateMatrix();
    this.finishLineTrigger.updateMatrixWorld(true);
    this.scene.add(this.finishLineTrigger);
    
    this.finishLineItem = {
        mesh: this.finishLineTrigger,
        position: this.finishLineTrigger.position,
        type: 'finishLine'
    };
  }

  createStartingGrid() {
    const gridGroup = new THREE.Group();
    gridGroup.name = "starting_grid";

    // Starting positions will be behind the start line
    const startLineX = this.trackRadius;
    const rowSpacing = 6; // Space between rows
    const lateralSpacing = 4; // Space between cars side-to-side
    const totalPositions = 6; // Reduced from 8 to 6 positions
    const rows = Math.ceil(totalPositions / 2); // Two cars per row
    const rightOffset = -2; // Move the whole grid 2 units to the right

    // Calculate track angle at start line for proper alignment
    const trackAngle = Math.PI / 2; // 90 degrees, perpendicular to start line

    for (let row = 0; row < rows; row++) {
        // Calculate base position for this row
        const distanceBehindStart = row * rowSpacing + 10; // Increased from 8 to 10 units behind line
        
        // Create two positions side by side
        for (let col = 0; col < 2; col++) {
            const position = row * 2 + col;
            if (position >= totalPositions) break;

            // Calculate lateral offset (left-right position)
            const lateralOffset = (col === 0 ? -lateralSpacing : lateralSpacing);

            // Calculate final position - move back from start line
            const x = startLineX;
            const z = -distanceBehindStart;

            // Create U-shaped marker with three separate lines
            const lineWidth = 0.1;
            const boxWidth = 2;
            const boxLength = 3;

            // Create front line (parallel to track)
            const frontLineGeometry = new THREE.BoxGeometry(boxWidth, lineWidth, lineWidth);
            const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const frontLine = new THREE.Mesh(frontLineGeometry, lineMaterial);

            // Create left line (perpendicular to track)
            const sideLineGeometry = new THREE.BoxGeometry(lineWidth, lineWidth, boxLength);
            const leftLine = new THREE.Mesh(sideLineGeometry, lineMaterial);
            leftLine.position.x = -boxWidth/2;
            leftLine.position.z = -boxLength/2; // Move back instead of forward

            // Create right line (perpendicular to track)
            const rightLine = new THREE.Mesh(sideLineGeometry, lineMaterial);
            rightLine.position.x = boxWidth/2;
            rightLine.position.z = -boxLength/2; // Move back instead of forward

            // Create a group for the three lines
            const marker = new THREE.Group();
            marker.add(frontLine);
            marker.add(leftLine);
            marker.add(rightLine);

            // Position the marker (no rotation needed as lines are already oriented correctly)
            marker.position.set(x + lateralOffset + rightOffset, 0.05, z);

            // Store starting position in userData
            marker.userData = {
                type: 'starting_position',
                position: position + 1,
                coordinates: { x: x + lateralOffset + rightOffset, z }
            };

            gridGroup.add(marker);
        }
    }

    this.scene.add(gridGroup);
    
    // Store starting positions for later use
    this.startingPositions = gridGroup.children
        .filter(child => child.userData?.type === 'starting_position')
        .map(marker => ({
            position: marker.userData.position,
            coordinates: marker.userData.coordinates
        }));
  }

  createCircularTrack() {
    // Materials for track and edge lines
    const trackMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const edgeLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const startLineMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    const checkeredMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });

    // Define inner and outer radii for the track
    const innerRadius = this.trackRadius - this.trackWidth / 2;
    const outerRadius = this.trackRadius + this.trackWidth / 2;
    const segments = 64; // More segments for a smooth circle

    // Create the track surface using a ring geometry
    const trackGeometry = new THREE.RingGeometry(innerRadius, outerRadius, segments);
    const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.y = 0.01; // Slightly above ground
    this.scene.add(trackMesh);

    // Add inner edge line
    const lineWidth = 0.5;
    const innerLineGeometry = new THREE.RingGeometry(innerRadius, innerRadius + lineWidth, segments);
    const innerLineMesh = new THREE.Mesh(innerLineGeometry, edgeLineMaterial);
    innerLineMesh.rotation.x = -Math.PI / 2;
    innerLineMesh.position.y = 0.02;
    this.scene.add(innerLineMesh);

    // Add outer edge line
    const outerLineGeometry = new THREE.RingGeometry(outerRadius - lineWidth, outerRadius, segments);
    const outerLineMesh = new THREE.Mesh(outerLineGeometry, edgeLineMaterial);
    outerLineMesh.rotation.x = -Math.PI / 2;
    outerLineMesh.position.y = 0.02;
    this.scene.add(outerLineMesh);

    // Create start/finish line with checkered pattern
    const startLineWidth = this.trackWidth;
    const startLineLength = 4;
    const checkerSize = startLineWidth / 8;

    // Create checkered pattern
    const startLineGroup = new THREE.Group();
    const checkerGeometry = new THREE.PlaneGeometry(checkerSize, checkerSize);
    const checkerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffffff,
        side: THREE.DoubleSide
    });
    const blackCheckerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        side: THREE.DoubleSide
    });

    // Create a grid of checkers
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 8; col++) {
            const material = (row + col) % 2 === 0 ? checkerMaterial : blackCheckerMaterial;
            const checker = new THREE.Mesh(checkerGeometry, material);
            checker.position.set(
                col * checkerSize - startLineWidth/2 + checkerSize/2,
                0.02,
                row * checkerSize - startLineLength/2 + checkerSize/2
            );
            checker.rotation.x = -Math.PI / 2;
            startLineGroup.add(checker);
        }
    }

    // Position the start line at the beginning of the track
    startLineGroup.position.set(this.trackRadius, 0, 0);
    this.scene.add(startLineGroup);

    // Add track markers every quarter of the track
    const markerCount = 4;
    const markerWidth = 2;
    const markerLength = this.trackWidth * 0.8;
    
    for (let i = 1; i < markerCount; i++) {
        const angle = (i * Math.PI * 2) / markerCount;
        const markerGeometry = new THREE.PlaneGeometry(markerWidth, markerLength);
        const marker = new THREE.Mesh(markerGeometry, checkerMaterial);
        
        const midRadius = (innerRadius + outerRadius) / 2;
        marker.position.set(
            Math.cos(angle) * midRadius,
            0.02,
            Math.sin(angle) * midRadius
        );
        marker.rotation.x = -Math.PI / 2;
        marker.rotation.z = angle;
        this.scene.add(marker);
    }
  }

  createTrackBoundaries() {
    // Create visible walls along the circular boundaries for debugging
    const wallHeight = 1;
    const wallMaterial = new THREE.MeshBasicMaterial({
      visible: true,
      transparent: true,
      opacity: 0.2,
      color: 0x00ff00
    });

    // Add a larger buffer to the track width to make the boundaries more forgiving
    const buffer = 3; // Increased buffer for visual boundaries
    const innerRadius = this.trackRadius - this.trackWidth / 2 - buffer;
    const outerRadius = this.trackRadius + this.trackWidth / 2 + buffer;
    const segments = 64;
    const angleStep = (2 * Math.PI) / segments;

    // Clear existing boundaries
    this.trackBoundaries.forEach(wall => this.scene.remove(wall));
    this.trackBoundaries = [];

    for (let i = 0; i < segments; i++) {
      const angle1 = i * angleStep;
      const angle2 = (i + 1) * angleStep;

      // Inner boundary wall segment
      const innerStart = new THREE.Vector3(Math.cos(angle1) * innerRadius, 0, Math.sin(angle1) * innerRadius);
      const innerEnd = new THREE.Vector3(Math.cos(angle2) * innerRadius, 0, Math.sin(angle2) * innerRadius);
      this.createBoundaryWall(innerStart, innerEnd, wallHeight, wallMaterial);

      // Outer boundary wall segment
      const outerStart = new THREE.Vector3(Math.cos(angle1) * outerRadius, 0, Math.sin(angle1) * outerRadius);
      const outerEnd = new THREE.Vector3(Math.cos(angle2) * outerRadius, 0, Math.sin(angle2) * outerRadius);
      this.createBoundaryWall(outerStart, outerEnd, wallHeight, wallMaterial);
    }
  }

  createBoundaryWall(start, end, height, material) {
    // Calculate direction and length of the wall segment
    const direction = end.clone().sub(start);
    const length = direction.length();
    direction.normalize();

    const wallGeometry = new THREE.BoxGeometry(0.2, height, length); // Made walls even thinner (0.3 -> 0.2)
    const wall = new THREE.Mesh(wallGeometry, material);
    wall.position.set((start.x + end.x) / 2, height / 2, (start.z + end.z) / 2);

    // Align the wall with the segment direction
    const angle = Math.atan2(direction.x, direction.z);
    wall.rotation.y = angle;

    this.scene.add(wall);
    this.trackBoundaries.push(wall);
    return wall;
  }

  addScenery() {
    // Add trees and other vegetation
    this.scenery.addTrees(this.trackRadius, this.trackWidth, this.groundSize);
    
    // Add clouds to the sky
    this.scenery.createClouds(this.groundSize);
    
    // Add grandstands
    this.grandstand.addGrandstands(this.trackRadius, this.trackWidth);
  }

  // Collision detection with track boundaries
  checkCollision(carPosition) {
    // Get the car's actual dimensions and rotation
    const cars = this.scene.children.filter(obj => obj.type === 'Group' && obj.userData.car);
    if (cars.length === 0) return false;

    const carMesh = cars[0];
    const car = carMesh.userData.car;
    
    // Calculate the car's corners based on its rotation
    const carWidth = 1.8; // Slightly reduced collision width
    const carLength = 3.8; // Slightly reduced collision length
    const rotation = car.rotation;
    
    // Calculate the car's corners
    const corners = [
      new THREE.Vector3(
        carPosition.x - Math.cos(rotation) * carWidth/2 - Math.sin(rotation) * carLength/2,
        0,
        carPosition.z - Math.sin(rotation) * carWidth/2 + Math.cos(rotation) * carLength/2
      ),
      new THREE.Vector3(
        carPosition.x + Math.cos(rotation) * carWidth/2 - Math.sin(rotation) * carLength/2,
        0,
        carPosition.z + Math.sin(rotation) * carWidth/2 + Math.cos(rotation) * carLength/2
      ),
      new THREE.Vector3(
        carPosition.x - Math.cos(rotation) * carWidth/2 + Math.sin(rotation) * carLength/2,
        0,
        carPosition.z - Math.sin(rotation) * carWidth/2 - Math.cos(rotation) * carLength/2
      ),
      new THREE.Vector3(
        carPosition.x + Math.cos(rotation) * carWidth/2 + Math.sin(rotation) * carLength/2,
        0,
        carPosition.z + Math.sin(rotation) * carWidth/2 - Math.cos(rotation) * carLength/2
      )
    ];

    // Check if any corner is outside the track boundaries
    for (const corner of corners) {
      const distanceFromCenter = Math.sqrt(
        corner.x * corner.x + 
        corner.z * corner.z
      );

      // Use the same buffer as visual walls (3 units) for consistent physical boundaries
      const buffer = 3;
      const innerLimit = this.trackRadius - (this.trackWidth / 2) - buffer; // Match inner wall
      const outerLimit = this.trackRadius + (this.trackWidth / 2) + buffer; // Match outer wall

      if (distanceFromCenter < innerLimit || distanceFromCenter > outerLimit) {
        return true;
      }
    }

    return false;
  }

  styleHUD() {
    const gameHUD = document.createElement('div');
    gameHUD.id = 'game-hud';
    gameHUD.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        color: white;
        font-family: 'Arial', sans-serif;
        font-size: 18px;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        pointer-events: none;
        z-index: 1000;
        user-select: none;
        transition: opacity 0.3s ease;
        opacity: 0; /* Start hidden */
        visibility: hidden; /* Completely hide it */
    `;
    
    // Add each component to the HUD
    const speedDisplay = document.createElement('div');
    speedDisplay.id = 'speed';
    speedDisplay.className = 'hud-speed';
    speedDisplay.style.cssText = `
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 5px;
      font-family: 'Courier New', monospace; /* Use monospace font for consistent character width */
      width: 180px; /* Fixed width */
    `;
    
    const timeDisplay = document.createElement('div');
    timeDisplay.id = 'time';
    timeDisplay.className = 'hud-time';
    timeDisplay.style.cssText = `
      white-space: pre-line;
      margin-bottom: 10px;
      width: 180px; /* Fixed width */
      font-family: 'Courier New', monospace; /* Use monospace font for consistent character width */
    `;

    // Add high score button
    const highScoreButton = document.createElement('button');
    highScoreButton.id = 'high-score-button';
    highScoreButton.className = 'hud-button';
    highScoreButton.textContent = '🏆 High Scores';
    highScoreButton.style.cssText = `
      background-color: rgba(0, 0, 0, 0.6);
      color: white;
      border: 2px solid white;
      border-radius: 5px;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 16px;
      pointer-events: auto;
      margin-bottom: 10px;
      transition: background-color 0.2s;
      width: 180px; /* Fixed width */
      text-align: center;
    `;
    highScoreButton.addEventListener('mouseover', () => {
      highScoreButton.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    });
    highScoreButton.addEventListener('mouseout', () => {
      highScoreButton.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    });
    highScoreButton.addEventListener('click', () => {
      this.showHighScores();
    });
    
    // Create checkpoint indicator
    const checkpointDisplay = document.createElement('div');
    checkpointDisplay.id = 'checkpoint-indicator';
    checkpointDisplay.className = 'hud-checkpoints';
    checkpointDisplay.style.cssText = `
      margin-top: 10px;
      display: flex;
      gap: 5px;
      justify-content: center;
      width: 180px; /* Fixed width */
    `;
    
    // Add checkpoint icons
    for (let i = 0; i < 4; i++) {
      const checkpointIcon = document.createElement('div');
      checkpointIcon.id = `checkpoint-${i}`;
      checkpointIcon.className = 'checkpoint-icon';
      checkpointIcon.style.cssText = `
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background-color: gray;
        border: 2px solid white;
        opacity: 0.5;
      `;
      checkpointDisplay.appendChild(checkpointIcon);
    }
    
    // Append all elements to the HUD
    gameHUD.appendChild(speedDisplay);
    gameHUD.appendChild(timeDisplay);
    gameHUD.appendChild(highScoreButton);
    gameHUD.appendChild(checkpointDisplay);
    
    document.body.appendChild(gameHUD);
    
    // Add CSS for the lap completed message and responsive styles
    const style = document.createElement('style');
    style.textContent = `
      .lap-completed-message {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 20px 40px;
        font-family: 'Arial', sans-serif;
        font-size: 24px;
        border-radius: 10px;
        z-index: 10000;
        animation: fade-in 0.5s ease-out;
      }
      
      .lap-completed-message span {
        color: #00ff00;
        font-weight: bold;
      }
      
      .fade-out {
        animation: fade-out 0.5s ease-in;
      }
      
      @keyframes fade-in {
        from { opacity: 0; transform: translate(-50%, -70%); }
        to { opacity: 1; transform: translate(-50%, -50%); }
      }
      
      @keyframes fade-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      
      /* Responsive styles for mobile */
      @media (max-width: 768px) {
        #game-hud {
          font-size: 16px;
        }
        
        .hud-speed {
          font-size: 24px !important;
        }
        
        .hidden-on-mobile {
          display: none !important;
        }
      }
      
      /* Landscape mode adjustments */
      @media (max-width: 768px) and (orientation: landscape) {
        #game-hud {
          top: 10px;
          left: 10px;
        }
        
        #game-hud.landscape {
          right: auto;
          left: 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Update the checkpoint indicators in the UI
  updateCheckpointIndicators() {
    for (let i = 0; i < 4; i++) {
      const indicator = document.getElementById(`checkpoint-${i}`);
      if (indicator) {
        if (this.checkpointsPassedThisLap.includes(i)) {
          indicator.style.backgroundColor = '#00ff00';
          indicator.style.opacity = '1';
        } else {
          indicator.style.backgroundColor = 'gray';
          indicator.style.opacity = '0.5';
        }
      }
    }
  }

  createCheckpoints() {
    this.log("Creating track checkpoints");
    
    // Clear existing checkpoints
    for (const checkpoint of this.checkpoints) {
        if (checkpoint.mesh) {
            this.scene.remove(checkpoint.mesh);
        }
    }
    this.checkpoints = [];
    
    // Create 4 checkpoint triggers around the circular track
    // Make them much wider to be easier to hit
    const checkpointGeometry = new THREE.BoxGeometry(this.trackWidth * 2.5, 5, 12);
    const checkpointMaterial = new THREE.MeshBasicMaterial({ 
        visible: false
        // For debugging:
        // visible: true,
        // color: 0x00ff00,
        // transparent: true,
        // opacity: 0.5
    });
    
    // Create 4 checkpoints evenly spaced around the track
    for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i; // 90 degree spacing (0, 90, 180, 270 degrees)
        const x = Math.cos(angle) * this.trackRadius;
        const z = Math.sin(angle) * this.trackRadius;
        
        const checkpointMesh = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
        checkpointMesh.position.set(x, 1, z);
        
        // Rotate the checkpoint to be perpendicular to the track
        checkpointMesh.rotation.y = angle + Math.PI / 2;
        
        this.scene.add(checkpointMesh);
        
        this.checkpoints.push({
            id: i,
            mesh: checkpointMesh,
            position: new THREE.Vector3(x, 1, z)
        });
        
        this.log(`Created checkpoint ${i} at position:`, x, 1, z);
    }
  }

  // Check if the car has passed any checkpoints
  checkCheckpointsPassed(carPosition) {
    const carBox = new THREE.Box3();
    const carSize = new THREE.Vector3(2, 2, 4);
    carBox.setFromCenterAndSize(carPosition, carSize);
    
    let checkpointPassed = false;
    
    for (const checkpoint of this.checkpoints) {
        if (!checkpoint.mesh) continue;
        
        const checkpointBox = new THREE.Box3().setFromObject(checkpoint.mesh);
        
        if (carBox.intersectsBox(checkpointBox)) {
            // If we haven't already passed this checkpoint this lap
            if (!this.checkpointsPassedThisLap.includes(checkpoint.id)) {
                // Only log to console if debugging is important for this message
                if (this.debugMode) {
                    console.log(`Checkpoint ${checkpoint.id} passed`);
                }
                this.checkpointsPassedThisLap.push(checkpoint.id);
                checkpointPassed = true;
            }
        }
    }
    
    // If checkpoint status changed, update UI
    if (checkpointPassed) {
        this.updateCheckpointIndicators();
        
        // Play a checkpoint sound if available
        if (this.checkpointSound) {
            this.checkpointSound.play();
        }
    }
  }
  
  // Check if all required checkpoints have been passed in this lap
  hasPassedAllRequiredCheckpoints() {
    this.log("Checking passed checkpoints:", this.checkpointsPassedThisLap);
    
    // We need at least 2 of the 4 checkpoints for a valid lap (very forgiving)
    if (this.checkpointsPassedThisLap.length < 2) {
      this.log("Not enough checkpoints passed:", this.checkpointsPassedThisLap.length);
      return false;
    }
    
    // At least some forward progress is required (checkpoint 0 and checkpoint 2 opposite sides)
    const hasPassedZero = this.checkpointsPassedThisLap.includes(0);
    const hasPassedTwo = this.checkpointsPassedThisLap.includes(2);
    
    // Must have passed either checkpoint 0 or checkpoint 2 (opposite sides of track)
    // This ensures some forward progress around the track
    if (!(hasPassedZero || hasPassedTwo)) {
      this.log("Missing critical checkpoints: needs either 0 or 2");
      return false;
    }
    
    this.log("Lap validation passed!");
    return true;
  }
  
  // Reset checkpoints for the next lap
  resetCheckpoints() {
    this.log("Resetting checkpoints for next lap");
    this.checkpointsPassedThisLap = [];
    this.updateCheckpointIndicators();
  }

  checkLapProgress(carPosition, carDirection) {
    if (!this.finishLineItem || !this.finishLineItem.mesh) return;
    
    // Check for checkpoint collisions first
    this.checkCheckpointsPassed(carPosition);
    
    // Project the car's position onto the finish line plane
    const carX = carPosition.x;
    const carZ = carPosition.z;
    const finishX = this.finishLineItem.position.x;
    const finishZ = this.finishLineItem.position.z;
    
    // Calculate distance along track (z-axis) to finish line
    const distanceToFinishZ = Math.abs(carZ - finishZ);
    // Calculate distance from center of track (x-axis)
    const distanceFromCenterX = Math.abs(carX - finishX);
    
    // Debug output
    if (this.debugMode) {
        console.log('Distance to finish (Z):', distanceToFinishZ.toFixed(2));
        console.log('Distance from center (X):', distanceFromCenterX.toFixed(2));
    }
    
    // Check if car is within finish line bounds
    const zCollisionDistance = 2; // Distance threshold for crossing finish line
    const xCollisionDistance = this.trackWidth * 1.25; // Half width of track plus buffer
    
    // Check if car is moving forward
    const directionToFinish = this.finishLineItem.position.clone().sub(carPosition).normalize();
    const isMovingForward = carDirection.dot(directionToFinish) > 0;
    
    // Check for finish line crossing
    if (distanceToFinishZ < zCollisionDistance && 
        distanceFromCenterX < xCollisionDistance && 
        isMovingForward && 
        !this.recentlyCompletedLap) {
                
        // Check if all required checkpoints have been passed
        const validLap = this.hasPassedAllRequiredCheckpoints();
        
        if (validLap) {
            console.log(`Completing lap ${this.currentLap} - All checkpoints passed`);
            
            if (!this.isMultiplayer && this.currentLap + 1 >= this.totalLaps) {
                this.currentLap++;
                this.finishRace();
            } else {
                this.onLapComplete();
                this.currentLap++;
                console.log(`Lap incremented: now on lap ${this.currentLap}`);
                this.resetCheckpoints();
            }
            
            // Set cooldown
            this.recentlyCompletedLap = true;
            setTimeout(() => {
                this.recentlyCompletedLap = false;
                console.log("Finish line cooldown ended");
            }, 2000);
        } else {
            console.log("Finish line crossed, but not all checkpoints passed - not counting as a lap");
        }
    }
  }

  finishRace() {
    this.raceFinished = true;
    
    // Create finish message
    const finishScreen = document.createElement('div');
    finishScreen.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 30px;
        border-radius: 15px;
        font-family: Arial, sans-serif;
        text-align: center;
        z-index: 10000;
    `;

    // Calculate best lap
    const bestLap = Math.min(...this.lapTimes);
    const totalTime = this.lapTimes.reduce((a, b) => a + b, 0);

    finishScreen.innerHTML = `
        <h1 style="color: #00ff00; margin-bottom: 20px;">Race Complete!</h1>
        <div style="font-size: 18px; margin-bottom: 10px;">Total Time: ${totalTime.toFixed(2)}s</div>
        <div style="font-size: 18px; margin-bottom: 10px;">Best Lap: ${bestLap.toFixed(2)}s</div>
        <button onclick="location.reload()" style="
            background-color: #00ff00;
            color: black;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 20px;
            font-size: 16px;
        ">Race Again</button>
    `;

    document.body.appendChild(finishScreen);
  }

  updateLapDisplay() {
    const speedElement = document.getElementById('speed');
    const timeElement = document.getElementById('time');

    // Get current time and format it
    const currentTime = performance.now();
    
    // Calculate session time, ensuring lapStartTime is valid
    let sessionTime = 0;
    if (this.lapStartTime && this.lapStartTime > 0) {
        sessionTime = Math.max(0, (currentTime - this.lapStartTime) / 1000);
    } else {
        // If lapStartTime is invalid, set it now
        this.lapStartTime = currentTime;
        console.log("Reset invalid lap start time in updateLapDisplay:", this.lapStartTime);
    }

    // Format the current lap time with minutes, seconds and milliseconds
    const minutes = Math.floor(sessionTime / 60);
    const seconds = Math.floor(sessionTime % 60);
    const milliseconds = Math.floor((sessionTime % 1) * 1000);
    
    // Format with leading zeros
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;

    // Update time display
    if (timeElement) {
        let timeDisplay = `Lap ${this.currentLap}/${this.totalLaps}\nTime: ${timeStr}`;
        
        // Add best lap time if available
        if (this.lapTimes.length > 0) {
            const bestLap = Math.min(...this.lapTimes);
            
            // Format best lap time
            const bestMinutes = Math.floor(bestLap / 60);
            const bestSeconds = Math.floor(bestLap % 60);
            const bestMilliseconds = Math.floor((bestLap % 1) * 1000);
            
            const bestTimeStr = `${bestMinutes.toString().padStart(2, '0')}:${bestSeconds.toString().padStart(2, '0')}.${bestMilliseconds.toString().padStart(3, '0')}`;
            
            timeDisplay += `\nBest: ${bestTimeStr}`;
        }
        
        timeElement.innerHTML = timeDisplay;
    }

    // Update speed display
    if (speedElement) {
        let speed = 0;
        let speedBoostActive = false;
        const cars = this.scene.children.filter(obj => obj.type === 'Group' && obj.userData.car);
        if (cars.length > 0) {
            const car = cars[0].userData.car;
            speed = Math.abs(car.getSpeed() * 3.6);
            speedBoostActive = car.speedBoostActive || false;
        }

        // Format speed to always be the same width
        // Use monospace font tricks to ensure consistent width
        const speedFixed = speed.toFixed(1);
        
        if (speedBoostActive) {
            speedElement.textContent = `Speed: ${speedFixed} ⚡ km/h`;
        } else {
            speedElement.textContent = `Speed: ${speedFixed} km/h`;
        }
    }
  }

  /**
   * Called when player completes a lap
   */
  async onLapComplete() {
    // Record lap time
    const currentTime = performance.now();
    
    if (!this.lapStartTime) {
        this.lapStartTime = currentTime;
        this.log("Setting initial lap start time:", this.lapStartTime);
        return;
    }
    
    // Calculate elapsed time in seconds since lap start
    const lapTime = (currentTime - this.lapStartTime) / 1000;
    console.log(`Lap completed in ${lapTime.toFixed(2)} seconds`);
    
    // Sanity check - if lap time is unreasonably high or low, it's probably wrong
    if (lapTime > 600 || lapTime < 1) { // More than 10 minutes or less than 1 second
        console.error(`Invalid lap time detected: ${lapTime}s`);
        return;
    }
    
    this.lapTimes.push(lapTime);
    
    // Keep only the last 3 lap times
    if (this.lapTimes.length > 3) {
        this.lapTimes.shift();
    }
    
    // Show lap completed message
    this.showLapCompletedMessage(lapTime);
    
    // Update lap display
    this.updateLapDisplay();
    
    // Make sure track ID is set
    if (!this.id) {
        this.id = 'track1'; // Default track ID
        this.log("Setting default track ID for high score submission");
    }
    
    // Start a new game session for the next lap
    this.log("[DEBUG] Starting new game session for next lap");
    try {
        await this.startGameSession();
    } catch (error) {
        console.error("Failed to start new game session:", error);
        // Continue anyway to avoid blocking lap progression
    }
    
    // Check if this is a potential high score
    this.checkAndSubmitHighScore(lapTime);
    
    // Reset lap start time for the next lap
    this.lapStartTime = currentTime;
    this.log("Resetting lap start time to:", this.lapStartTime);
    
    // Update current lap - is now done in checkLapProgress for better control
    // Advance currently selected item to make room for new one
    if (this.player && this.player.currentItem) {
        this.player.useCurrentItem();
    }
  }

  /**
   * Check if lap time qualifies as high score and submit it
   */
  async checkAndSubmitHighScore(lapTime) {
    try {
        // Validate lap time before proceeding
        if (!lapTime || lapTime > 600 || lapTime < 1) {
            console.error(`Invalid lap time detected for high score: ${lapTime}s, aborting submission`);
            return; // Don't submit unreasonable times
        }
        
        console.log("Checking if lap time qualifies as high score:", lapTime);
        
        // First, make sure we're using the correct API endpoint
        const baseUrl = window.SERVER_URL || (window.location.hostname === 'localhost' 
            ? `http://${window.location.hostname}:1337`   // Development
            : 'https://api.example.com');     // Production - Use your actual API server
        
        const apiUrl = `${baseUrl}/api/highscores`;
        console.log("Using API URL:", apiUrl);
        
        const checkResponse = await fetch(`${apiUrl}?trackId=${this.id}`);
        
        // Check if the response is OK (status 200-299)
        if (!checkResponse.ok) {
            const errorText = await checkResponse.text();
            console.error(`Failed to fetch high scores: Status ${checkResponse.status}`, errorText);
            throw new Error(`Failed to fetch high scores: ${checkResponse.statusText}`);
        }
        
        // Verify the response is JSON before parsing
        const contentType = checkResponse.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await checkResponse.text();
            console.error("API response is not JSON:", text.substring(0, 100) + "...");
            throw new Error("API response is not JSON");
        }
        
        const highScores = await checkResponse.json();
        console.log("Retrieved high scores:", highScores);
        
        // Determine if it's a top 3 score
        let isTopThree = false;
        
        if (!Array.isArray(highScores)) {
            console.error("High scores response is not an array:", highScores);
            throw new Error("Invalid high scores format");
        }
        
        if (highScores.length < 3) {
            isTopThree = true;
        } else {
            // Sort scores
            const sortedScores = [...highScores].sort((a, b) => a.time - b.time);
            if (lapTime < sortedScores[2].time) {
                isTopThree = true;
            }
        }
        
        // Get player name - add safer access with multiple fallbacks
        let playerName = "Anonymous";
        
        // Try to access playerName through various paths with careful null checking
        if (this.scene && this.scene.game && this.scene.game.playerName) {
            playerName = this.scene.game.playerName;
        } else if (window.game && window.game.playerName) {
            playerName = window.game.playerName;
        } else if (typeof localStorage !== 'undefined') {
            // Try to get from localStorage as last resort
            const storedName = localStorage.getItem('playerName');
            if (storedName) {
                playerName = storedName;
            }
        }
        
        console.log("Using player name:", playerName);
        
        // Prepare score data
        const scoreData = {
            name: playerName,
            time: lapTime,
            trackId: this.id
        };
        
        if (isTopThree) {
            // Show email collection UI for top 3 scores
            this.showEmailCollectionUI(scoreData);
        } else {
            // Submit without email for non-top-3 scores
            this.submitHighScore(scoreData);
        }
    } catch (error) {
        console.error("Error checking high scores:", error);
        // Continue game without high score functionality
    }
  }

  /**
   * Show UI to collect email for top 3 scores
   */
  showEmailCollectionUI(scoreData) {
    // Validate lap time to make sure it's reasonable
    let displayTime = scoreData.time;
    
    // If time is unreasonably large (like a timestamp), use a placeholder
    if (displayTime > 600) {
        console.error(`Invalid lap time detected in UI: ${displayTime}s`);
        displayTime = 60; // Default to reasonable time
        // Also fix the scoreData for submission
        scoreData.time = displayTime;
    }
    
    // Create the email collection container
    const container = document.createElement('div');
    container.className = 'high-score-email-container';
    container.innerHTML = `
        <div class="high-score-email-content">
            <h2>Congratulations! Top 3 Score!</h2>
            <p>Your lap time of ${displayTime.toFixed(2)}s is among the top 3 lap times for this track!</p>
            <p>Enter your email to be contacted about your achievement:</p>
            <form id="email-form">
                <input type="email" id="player-email" placeholder="your@email.com" required />
                <div class="button-row">
                    <button type="submit" id="submit-email">Submit</button>
                    <button type="button" id="skip-email">Skip</button>
                </div>
            </form>
        </div>
    `;
    
    // Add to DOM
    document.body.appendChild(container);
    
    // Add event listeners
    const form = container.querySelector('#email-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = container.querySelector('#player-email').value;
        scoreData.email = email;
        this.submitHighScore(scoreData);
        document.body.removeChild(container);
    });
    
    const skipButton = container.querySelector('#skip-email');
    skipButton.addEventListener('click', () => {
        this.submitHighScore(scoreData);
        document.body.removeChild(container);
    });
  }

  /**
   * Create a simple hash of the score data
   * This is a basic implementation - the server will have a more complex verification
   */
  createScoreHash(scoreData) {
    const timestamp = Date.now();
    const secret = window.CLIENT_SECRET || 'rc23'; // Client-side salt from environment
    const dataToHash = `${scoreData.name}-${scoreData.time}-${scoreData.trackId}-${timestamp}-${secret}`;
    
    // Create hash using a simple algorithm
    let hash = 0;
    for (let i = 0; i < dataToHash.length; i++) {
      const char = dataToHash.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return {
      hash: hash.toString(16),
      timestamp
    };
  }

  /**
   * Submit high score to server
   */
  async submitHighScore(scoreData) {
    try {
        // Validate required fields
        if (!scoreData.name || typeof scoreData.name !== 'string' || scoreData.name.length < 1) {
            throw new Error('Invalid player name');
        }
        if (!scoreData.time || typeof scoreData.time !== 'number' || scoreData.time <= 0) {
            throw new Error('Invalid lap time');
        }
        if (!scoreData.trackId || typeof scoreData.trackId !== 'string') {
            throw new Error('Invalid track ID');
        }

        // Format and sanitize the data
        const formattedScoreData = {
            name: scoreData.name.trim().substring(0, 50), // Limit name length
            time: Math.round(scoreData.time * 100) / 100, // Round to 2 decimal places
            trackId: scoreData.trackId.trim()
        };

        // Only add email if it's provided and valid
        if (scoreData.email && typeof scoreData.email === 'string' && scoreData.email.includes('@')) {
            formattedScoreData.email = scoreData.email.trim().toLowerCase();
        }

        // Add timestamp for replay protection
        formattedScoreData.timestamp = Date.now();

        // Create a hash of the payload using SHA-256
        const message = JSON.stringify(formattedScoreData);
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Encrypt the payload
        const encryptedPayload = btoa(message); // Base64 encode the JSON string

        // Create the final submission object
        const submission = {
            data: encryptedPayload,
            hash: hash,
            v: 1 // Version number for future compatibility
        };
        
        const baseUrl = window.SERVER_URL || (window.location.hostname === 'localhost' 
            ? `http://${window.location.hostname}:1337`   // Development
            : 'https://api.example.com');     // Production - Use your actual API server
        
        const apiUrl = `${baseUrl}/api/highscores`;
        console.log("[DEBUG] Submitting encrypted score");
        
        let response = await fetch(apiUrl, {
            method: 'POST',
            credentials: 'include',  // Important for cookies
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(submission)
        });
        
        // If we get a 400 error, check if it's due to no active session
        if (response.status === 400) {
            const errorData = await response.json().catch(() => ({}));
            
            if (errorData.error && errorData.error.includes('No active game session')) {
                console.log("[DEBUG] No active game session. Starting a new one and retrying...");
                
                // Start a new game session
                await this.startGameSession();
                
                // Retry the submission
                console.log("[DEBUG] Retrying submission after starting new session");
                response = await fetch(apiUrl, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(submission)
                });
            }
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null) || await response.text();
            console.error('[DEBUG] Server response:', errorData);
            throw new Error(`Server rejected high score: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log("[DEBUG] High score submission successful:", result);
        
        // Show notification of high score rank
        if (result.success) {
            this.showHighScoreRankMessage(result.rank);
        }
    } catch (error) {
        console.error("[DEBUG] Error submitting high score:", error);
        // Show user-friendly error message
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-notification';
        errorMessage.textContent = 'Failed to submit high score. Please try again.';
        document.body.appendChild(errorMessage);
        
        setTimeout(() => {
            errorMessage.remove();
        }, 3000);
    }
  }

  /**
   * Show high score rank notification
   */
  showHighScoreRankMessage(rank) {
    if (!rank || rank < 1) {
      console.warn(`Invalid rank value received: ${rank}`);
      return;
    }
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'high-score-notification';
    notification.innerHTML = `New High Score! Rank #${rank}`;
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 1000);
    }, 3000);
  }

  // Add method to show high scores
  showHighScores() {
    // Create the high score container with explicit styling
    const container = document.createElement('div');
    container.className = 'high-score-container';
    container.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 20px;
        border-radius: 10px;
        font-family: Arial, sans-serif;
        min-width: 300px;
        max-width: 80%;
        max-height: 80vh;
        overflow-y: auto;
        z-index: 10000;
    `;
    
    container.innerHTML = `
        <div class="high-score-header" style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        ">
            <h2 style="margin: 0; color: white;">Top 10 Lap Times</h2>
            <button class="close-btn" style="
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 5px 10px;
            ">×</button>
        </div>
        <div class="high-score-content" style="
            color: white;
        ">
            <div class="loading" style="text-align: center;">Loading high scores...</div>
        </div>
    `;
    
    // Add to DOM
    document.body.appendChild(container);
    
    // Add event listener to close button
    const closeBtn = container.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(container);
    });
    
    // Load high scores
    this.loadHighScores(container);
  }

  /**
   * Load high scores from the server
   */
  async loadHighScores(container) {
    try {
        // Make sure trackId is defined
        if (!this.id) {
            this.id = 'track1'; // Default track ID if not set
            console.log("Using default track ID: track1");
        }
        
        // Update the baseUrl to point to the correct API server
        const baseUrl = window.SERVER_URL || (window.location.hostname === 'localhost' 
            ? `http://${window.location.hostname}:1337`   // Development
            : 'https://api.example.com');     // Production - Use your actual API server
        
        const apiUrl = `${baseUrl}/api/highscores`;
        console.log("Loading high scores from:", apiUrl);
        
        const response = await fetch(`${apiUrl}?trackId=${this.id}`, {
            credentials: 'include'  // Important for cookies
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to fetch high scores: Status ${response.status}`, errorText);
            throw new Error(`Failed to fetch high scores: ${response.statusText}`);
        }
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await response.text();
            console.error("API response is not JSON:", text.substring(0, 100) + "...");
            throw new Error("API response is not JSON");
        }
        
        const highScores = await response.json();
        console.log("Retrieved high scores for display:", highScores);
        
        const content = container.querySelector('.high-score-content');
        
        if (!Array.isArray(highScores) || highScores.length === 0) {
            content.innerHTML = '<div class="no-scores">No high scores recorded yet!</div>';
            return;
        }
        
        // Get current player name with same safety checks
        let playerName = "Anonymous";
        if (this.scene && this.scene.game && this.scene.game.playerName) {
            playerName = this.scene.game.playerName;
        } else if (window.game && window.game.playerName) {
            playerName = window.game.playerName;
        } else if (typeof localStorage !== 'undefined') {
            const storedName = localStorage.getItem('playerName');
            if (storedName) {
                playerName = storedName;
            }
        }
        
        // Format high scores table
        let html = `
            <table class="high-score-table" style="
                width: 100%;
                border-collapse: collapse;
                color: white;
            ">
                <thead>
                    <tr style="border-bottom: 1px solid #444;">
                        <th style="padding: 8px; text-align: left;">Rank</th>
                        <th style="padding: 8px; text-align: left;">Player</th>
                        <th style="padding: 8px; text-align: left;">Time</th>
                        <th style="padding: 8px; text-align: left;">Date</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        highScores.forEach((score, index) => {
            const isCurrentPlayer = score.name === playerName;
            html += `
                <tr style="
                    ${isCurrentPlayer ? 'background-color: rgba(0, 255, 0, 0.2);' : ''}
                    border-bottom: 1px solid #333;
                ">
                    <td style="padding: 8px;">${index + 1}</td>
                    <td style="padding: 8px;">${this.escapeHtml(score.name)}</td>
                    <td style="padding: 8px;">${score.time.toFixed(2)}s</td>
                    <td style="padding: 8px;">${new Date(score.timestamp).toLocaleDateString()}</td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        content.innerHTML = html;
    } catch (error) {
        const content = container.querySelector('.high-score-content');
        content.innerHTML = '<div class="error">Error loading high scores. Please try again later.</div>';
        console.error("Error loading high scores:", error);
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
  }

  // New method to set multiplayer mode from the game
  setMultiplayerMode(isMultiplayer) {
    this.isMultiplayer = isMultiplayer;
    // Update display if needed
    this.updateLapDisplay();
  }

  /**
   * Show lap completed message with visual feedback
   */
  showLapCompletedMessage(lapTime) {
    // Add visual feedback when completing a lap
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(255, 255, 255, 0.3);
        pointer-events: none;
        z-index: 9999;
        animation: flash 0.5s ease-out;
    `;
    
    // Add the flash animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes flash {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(flash);
    
    // Display lap time message
    const message = document.createElement('div');
    message.className = 'lap-completed-message';
    message.innerHTML = `Lap Completed: <span>${lapTime.toFixed(2)}s</span>`;
    document.body.appendChild(message);
    
    // Remove the elements after animation
    setTimeout(() => {
        document.body.removeChild(flash);
        document.head.removeChild(style);
        
        message.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(message);
        }, 500);
    }, 500);
  }

  /**
   * Start a new game session with the server
   */
  async startGameSession() {
    try {
        // Make sure we have a track ID
        if (!this.id) {
            this.id = 'track1';
            this.log('[DEBUG] Using default track ID:', this.id);
        }

        const baseUrl = window.SERVER_URL || (window.location.hostname === 'localhost' 
            ? `http://${window.location.hostname}:1337`   // Development
            : 'https://api.example.com');     // Production - Use your actual API server
        
        const apiUrl = `${baseUrl}/api/game/start`;
        this.log('[DEBUG] Starting game session at:', apiUrl);
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            credentials: 'include',  // Important for cookies
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                trackId: this.id
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null) || await response.text();
            console.error('[DEBUG] Game session start failed:', errorData);
            throw new Error(`Failed to start game session: ${response.statusText}`);
        }
        
        const result = await response.json();
        this.log('[DEBUG] Game session started successfully:', result);
        
        // Wait a moment to ensure session is established
        await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
        console.error('[DEBUG] Error starting game session:', error);
    }
  }

  // Add method to show/hide HUD
  showHUD() {
    const gameHUD = document.getElementById('game-hud');
    if (gameHUD) {
        gameHUD.style.visibility = 'visible';
        
        // Add special class for mobile devices to handle layout adjustments
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            gameHUD.classList.add('with-controls');
            
            // Add additional class for landscape mode
            if (window.innerWidth > window.innerHeight) {
                gameHUD.classList.add('landscape');
            } else {
                gameHUD.classList.remove('landscape');
            }
            
            // Add listener for orientation changes
            const handleOrientationChange = () => {
                if (window.innerWidth > window.innerHeight) {
                    gameHUD.classList.add('landscape');
                } else {
                    gameHUD.classList.remove('landscape');
                }
            };
            
            // Add orientation change listener
            window.addEventListener('orientationchange', () => {
                setTimeout(handleOrientationChange, 300);
            });
            
            // Hide the original car and camera buttons on mobile
            this.hideButtonsOnMobile();
        }
        
        // Use setTimeout to ensure the visibility change happens before the opacity transition
        setTimeout(() => {
            gameHUD.style.opacity = '1';
        }, 10);
    }
  }
  
  // Hide car and camera switcher buttons on mobile
  hideButtonsOnMobile() {
    // Find the original car and camera switcher buttons
    const carSwitcher = document.getElementById('car-switcher');
    const cameraSwitcher = document.getElementById('camera-switcher');
    const trackSwitcher = document.getElementById('track-switcher');
    
    // Add a class to track elements being hidden by our code
    const addHiddenClass = (element) => {
        if (element) {
            element.classList.add('hidden-on-mobile');
            element.style.display = 'none';
        }
    };
    
    // Hide the buttons
    addHiddenClass(carSwitcher);
    addHiddenClass(cameraSwitcher);
    addHiddenClass(trackSwitcher);
    
    // Add a style for tablets and larger devices to show these elements again
    const style = document.createElement('style');
    style.textContent = `
        @media (min-width: 768px) {
            .hidden-on-mobile {
                display: block !important;
            }
        }
    `;
    document.head.appendChild(style);
  }

  hideHUD() {
    const gameHUD = document.getElementById('game-hud');
    if (gameHUD) {
        gameHUD.style.opacity = '0';
        // Hide completely after the fade out animation
        setTimeout(() => {
            gameHUD.style.visibility = 'hidden';
        }, 300); // Match the transition duration
    }
  }

  /**
   * Clean up track resources
   * This is called when changing tracks to ensure proper resource disposal
   */
  cleanup() {
    console.log('[DEBUG] Cleaning up original Track resources');
    
    // Remove track mesh
    if (this.trackMesh) {
      this.scene.remove(this.trackMesh);
      this.trackMesh = null;
    }
    
    // Remove ground
    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
      this.groundMesh = null;
    }
    
    // Clean up checkpoints
    if (this.checkpoints && this.checkpoints.length) {
      this.checkpoints.forEach(checkpoint => {
        if (checkpoint) this.scene.remove(checkpoint);
      });
      this.checkpoints = [];
    }
    
    // Remove finish line trigger
    if (this.finishLineTrigger) {
      this.scene.remove(this.finishLineTrigger);
      this.finishLineTrigger = null;
    }
    
    // Remove track boundaries
    if (this.trackBoundaries && this.trackBoundaries.length) {
      this.trackBoundaries.forEach(boundary => {
        if (boundary && boundary.wall) this.scene.remove(boundary.wall);
      });
      this.trackBoundaries = [];
    }
    
    // Clean up scenery
    if (this.scenery) {
      // Call scenery cleanup if available
      if (typeof this.scenery.cleanup === 'function') {
        this.scenery.cleanup();
      } else {
        // Manual cleanup
        this.scene.remove(this.scenery);
      }
      this.scenery = null;
    }
    
    // Clean up grandstands
    if (this.grandstands) {
      // Call grandstand cleanup if available
      if (typeof this.grandstands.cleanup === 'function') {
        this.grandstands.cleanup();
      } else {
        // Manual cleanup
        this.scene.remove(this.grandstands);
      }
      this.grandstands = null;
    }
    
    // Clean up any remaining items
    if (this.items && this.items.length) {
      this.items.forEach(item => {
        if (item) this.scene.remove(item);
      });
      this.items = [];
    }
    
    // Remove any HUD elements
    this.hideHUD();
    const hudElement = document.getElementById('race-hud');
    if (hudElement && hudElement.parentNode) {
      hudElement.parentNode.removeChild(hudElement);
    }
    
    // Stop and clean up audio
    this.cleanupAudio();
    
    // Remove volume controls
    const volumeControls = document.getElementById('volume-controls');
    if (volumeControls) {
      volumeControls.remove();
    }
    
    // Remove play button if it exists
    const playButton = document.getElementById('music-play-button');
    if (playButton) {
      playButton.remove();
    }
    
    // Remove archway if it exists
    if (this.archway) {
      this.scene.remove(this.archway);
      this.archway = null;
    }
    
    console.log('[DEBUG] Original Track cleanup completed');
  }
  
  /**
   * Clean up audio resources
   */
  cleanupAudio() {
    // Stop and clean up THREE.js Audio
    if (this.backgroundMusic) {
      if (this.backgroundMusic.isPlaying) {
        this.backgroundMusic.stop();
      }
      this.backgroundMusic.disconnect();
      this.backgroundMusic = null;
    }
    
    // Stop and clean up HTML5 Audio
    if (this.htmlAudio) {
      this.htmlAudio.pause();
      this.htmlAudio.src = '';
      this.htmlAudio = null;
    }
    
    this.isMusicPlaying = false;
  }

    // Add isPointInsideTrack method to Track class
  /**
   * Check if a point is inside the track
   * @param {THREE.Vector3} position - Position to check
   * @returns {boolean} True if position is inside the track
   */
  isPointInsideTrack(position) {
    // Calculate distance from center
    const distanceFromCenter = Math.sqrt(
      position.x * position.x + 
      position.z * position.z
    );
    
    // Use a small buffer (3 units) for consistent physical boundaries
    const buffer = 3;
    const innerLimit = this.trackRadius - (this.trackWidth / 2) - buffer;
    const outerLimit = this.trackRadius + (this.trackWidth / 2) + buffer;
    
    // Return true if inside track boundaries
    return distanceFromCenter >= innerLimit && distanceFromCenter <= outerLimit;
  }

  // Create a visible center line to show where AI cars should drive
  createCenterLine() {
    // Center line visualization property
    if (this.centerLine) {
      this.scene.remove(this.centerLine);
    }
    
    // Set default value if it doesn't exist
    if (this.showCenterLine === undefined) {
      this.showCenterLine = false;
    }
    
    if (this.showCenterLine) {
      // Create a new center line using circle segments
      const segments = 64;
      const centerPoints = [];
      
      // Create points around the center of the track
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * this.trackRadius;
        const z = Math.sin(angle) * this.trackRadius;
        centerPoints.push(new THREE.Vector3(x, 0.2, z)); // Slightly above the track surface
      }
      
      // Create a line geometry from the points
      const centerLineGeometry = new THREE.BufferGeometry().setFromPoints(centerPoints);
      const centerLineMaterial = new THREE.LineBasicMaterial({ 
        color: 0xffff00, // Yellow color for visibility
        linewidth: 2  // Note: linewidth > 1 may not work in all browsers
      });
      
      this.centerLine = new THREE.Line(centerLineGeometry, centerLineMaterial);
      this.scene.add(this.centerLine);
      
      console.log('Center line created for AI driving path visualization');
    }
  }
  
  // Add this method to toggle the center line visibility
  toggleCenterLine() {
    // Initialize this.showCenterLine if it doesn't exist
    if (this.showCenterLine === undefined) {
      this.showCenterLine = false;
    }
    
    this.showCenterLine = !this.showCenterLine;
    
    if (this.centerLine) {
      this.centerLine.visible = this.showCenterLine;
    } else if (this.showCenterLine) {
      this.createCenterLine();
    }
    
    console.log(`Center line visibility: ${this.showCenterLine ? 'shown' : 'hidden'}`);
  }

  // Helper method to determine if this is the player's car
  isPlayerCar(carPosition) {
    // We no longer need this method since we always use the player car position directly
    // Simply return true to maintain compatibility with existing code
    return true;
  }

  /**
   * Create an advertising archway over the start/finish line
   * Displays alternating text on top including player name
   */
  createRaceArchway() {
    // Group to hold all archway elements
    const archway = new THREE.Group();
    
    // For the track, we need the width for proper scaling
    const trackWidth = this.trackWidth || 20;
    const archHeight = 12; // Height of the arch
    const pillarWidth = 1.5; // Width of the support pillars
    const crossbeamHeight = 2; // Height of the top crossbeam
    
    // Create left pillar
    const pillarGeometry = new THREE.BoxGeometry(pillarWidth, archHeight, pillarWidth);
    const pillarMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x444444,
      shininess: 50,
      specular: 0x333333
    });
    
    const leftPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    leftPillar.position.set(-(trackWidth/2 + 1), archHeight/2, 0);
    leftPillar.castShadow = true;
    leftPillar.receiveShadow = true;
    archway.add(leftPillar);
    
    // Create right pillar
    const rightPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    rightPillar.position.set(trackWidth/2 + 1, archHeight/2, 0);
    rightPillar.castShadow = true;
    rightPillar.receiveShadow = true;
    archway.add(rightPillar);
    
    // Create top crossbeam
    const crossbeamGeometry = new THREE.BoxGeometry(trackWidth + 4, crossbeamHeight, pillarWidth * 1.5);
    const crossbeamMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x333333,
      shininess: 40,
      specular: 0x555555
    });
    
    const crossbeam = new THREE.Mesh(crossbeamGeometry, crossbeamMaterial);
    crossbeam.position.set(0, archHeight, 0);
    crossbeam.castShadow = true;
    crossbeam.receiveShadow = true;
    archway.add(crossbeam);
    
    // Create dynamic text banner
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    
    // Initial drawing
    this.drawBannerText(canvas, context, 'VIBEJAM 2025');
    
    // Create texture and material
    const texture = new THREE.CanvasTexture(canvas);
    const textMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true
    });
    
    const textGeometry = new THREE.PlaneGeometry(trackWidth + 2, (trackWidth + 2) / 4);
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.set(0, archHeight + crossbeamHeight/2 + 1, 0);
    
    // Rotate text to face outward from center
    textMesh.rotation.y = Math.PI; 
    
    textMesh.castShadow = false;
    textMesh.receiveShadow = false;
    archway.add(textMesh);
    
    // Position the archway at the finish line position where the trigger is
    // Matches the position set in createTrack: (this.trackRadius, 0.5, 0)
    archway.position.set(this.trackRadius, 0, 0);
    
    // Rotate to have it span across the track correctly (perpendicular to track direction)
    // Current rotation has it aligned along the track, need to rotate 90 degrees
    archway.rotation.y = 0; // This will make the archway cross over the track
    
    archway.name = 'race_start_archway';
    this.archway = archway; // Store reference for cleanup
    
    // Add the archway to the scene
    this.scene.add(archway);
    console.log('Created dynamic archway at the start/finish line');
    
    // Set up animation for alternating text
    this.setupArchTextAnimation(canvas, context, texture);
    
    return archway;
  }
  
  /**
   * Draw banner text with gradient background and glow effects
   */
  drawBannerText(canvas, context, text) {
    // Fill background with gradient
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#ff00cc');    // Vibrant pink
    gradient.addColorStop(0.5, '#8a2be2');  // Purple
    gradient.addColorStop(1, '#00bfff');    // Deep sky blue
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Adjust font size for text
    const fontSize = text.length > 12 ? 110 : 130;
    
    // Add text
    context.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Add outline to text
    context.strokeStyle = 'black';
    context.lineWidth = 8;
    context.strokeText(text, canvas.width/2, canvas.height/2);
    
    // Fill text
    context.fillStyle = 'white';
    context.fillText(text, canvas.width/2, canvas.height/2);
    
    // Add a glowing effect
    context.shadowColor = 'rgba(255, 255, 255, 0.8)';
    context.shadowBlur = 15;
    context.fillText(text, canvas.width/2, canvas.height/2);
  }
  
  /**
   * Set up animation to alternate between messages on the archway
   */
  setupArchTextAnimation(canvas, context, texture) {
    let currentMessage = 0;
    const messages = [
      'VIBEJAM 2025',
      "LET'S GO!"
    ];
    
    // Update interval (in milliseconds)
    const updateInterval = 2000; // Switch message every 3 seconds
    
    // Start animation cycle
    const updateText = () => {
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
      
      // Draw the message
      this.drawBannerText(canvas, context, message);
      
      // Update texture
      texture.needsUpdate = true;
      
      // Cycle to next message
      currentMessage = (currentMessage + 1) % messages.length;
    };
    
    // Set interval to update periodically
    setInterval(updateText, updateInterval);
  }

  /**
   * Set up sound system for background music and sound effects
   */
  setupSoundSystem() {
    // Use existing audio listener from game if available, or create new one
    if (this.game && this.game.getAudioListener) {
      console.log("Getting audio listener from game");
      this.audioListener = this.game.getAudioListener();
    } else {
      // Create audio listener as fallback
      console.log("Creating new audio listener (no game reference available)");
      this.audioListener = new THREE.AudioListener();
    }
    
    // Get the WebAudio context and flag that it needs user interaction
    if (this.audioListener && this.audioListener.context) {
      this.audioContext = this.audioListener.context;
      this.needsAudioContextResume = this.audioContext.state === 'suspended';
      console.log(`AudioContext state: ${this.audioContext.state}`);
      
      // Add a global click handler to resume AudioContext if needed
      if (this.needsAudioContextResume) {
        console.log("AudioContext suspended - adding click handler to resume");
        this.setupAudioContextResumeHandlers();
      }
    }
    
    // Create the audio objects
    this.backgroundMusic = new THREE.Audio(this.audioListener);
    this.lapCompleteSound = new THREE.Audio(this.audioListener);
    
    // Audio loader for loading sound files
    this.audioLoader = new THREE.AudioLoader();
    
    // Flag for tracking if music is playing
    this.isMusicPlaying = false;
    
    // Add volume control to game UI
    this.addVolumeControl();
    
    console.log("Sound system initialized");
  }
  
  /**
   * Set up event handlers to resume AudioContext on user interaction
   */
  setupAudioContextResumeHandlers() {
    const resumeAudioContext = () => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        console.log("Resuming AudioContext after user interaction");
        this.audioContext.resume().then(() => {
          console.log(`AudioContext resumed, state: ${this.audioContext.state}`);
          this.needsAudioContextResume = false;
          
          // Try playing music again if buffer is loaded
          if (this.backgroundMusic && this.backgroundMusic.buffer && !this.backgroundMusic.isPlaying) {
            console.log("Attempting to play audio again after context resumed");
            this.safePlayAudio();
          }
        }).catch(err => {
          console.warn("Failed to resume AudioContext:", err);
        });
      }
    };
    
    // Add event listeners to common user interactions
    const bodyElement = document.body;
    
    // Use passive listeners to avoid performance warnings
    bodyElement.addEventListener('click', resumeAudioContext, { passive: true, once: false });
    bodyElement.addEventListener('touchend', resumeAudioContext, { passive: true, once: false });
    
    // Also attach to volume control and mute button once they're created
    const setupVolumeControlHandlers = () => {
      const volumeControls = document.getElementById('volume-controls');
      const muteButton = document.getElementById('mute-button');
      
      if (volumeControls) {
        volumeControls.addEventListener('click', resumeAudioContext, { passive: true });
      }
      
      if (muteButton) {
        muteButton.addEventListener('click', resumeAudioContext, { passive: true });
      }
    };
    
    // If DOM is loaded, setup handlers now, otherwise wait for DOMContentLoaded
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setupVolumeControlHandlers();
    } else {
      document.addEventListener('DOMContentLoaded', setupVolumeControlHandlers);
    }
    
    // Also set up a timeout as a fallback
    setTimeout(setupVolumeControlHandlers, 1000);
  }
  
  /**
   * Safely play audio with proper error handling
   */
  safePlayAudio() {
    if (!this.backgroundMusic || !this.backgroundMusic.buffer) return;
    
    try {
      // In some THREE.js versions, play() doesn't return a promise
      // We need to handle both cases safely
      this.isMusicPlaying = true;
      
      // Update the mute button to show the correct state
      this.updateMuteButtonState();
      
      // If the AudioContext is suspended, don't try to play yet
      if (this.audioContext && this.audioContext.state === 'suspended') {
        console.log("AudioContext suspended, waiting for user interaction");
        return;
      }
      
      // Method 1: Try with promise handling if available
      try {
        const playResult = this.backgroundMusic.play();
        
        // Check if play() returned a promise-like object
        if (playResult && typeof playResult.then === 'function') {
          playResult.then(() => {
            console.log("Audio playback successfully started");
            // Make sure the UI reflects the playing state
            this.isMusicPlaying = true;
            this.updateMuteButtonState();
          }).catch(error => {
            console.warn("THREE.js audio play promise rejected:", error);
            // Fall back to HTML5 Audio
            this.loadHTML5AudioFallback();
          });
        } else {
          // THREE.js audio started without a promise
          console.log("Audio started playing (non-promise)");
          // Make sure the UI reflects the playing state
          this.updateMuteButtonState();
        }
      } catch (error) {
        // Method 2: Fallback for older THREE.js versions
        console.warn("Error with promise-based play, trying direct play():", error);
        try {
          // Try direct play as a fallback
          this.backgroundMusic.play();
          console.log("Audio started with direct play");
          // Make sure the UI reflects the playing state
          this.updateMuteButtonState();
        } catch (directError) {
          console.warn("Both play methods failed:", directError);
          // Fall back to HTML5 Audio
          this.loadHTML5AudioFallback();
        }
      }
    } catch (error) {
      console.warn("Error playing audio:", error);
      this.loadHTML5AudioFallback();
    }
  }
  
  /**
   * Play background music at low volume
   */
  playBackgroundMusic() {
    if (!this.backgroundMusic) return;
    
    // Audio file paths with fallbacks - try both with and without leading slash to handle different deployment setups
    const audioFormats = [
      'audio/dizzy_racing.ogg',
      'audio/dizzy_racing.m4a',
      'audio/dizzy_racing.mp3',
      'audio/dizzy_racing.wav',
      '/audio/dizzy_racing.ogg',
      '/audio/dizzy_racing.m4a',
      '/audio/dizzy_racing.mp3',
      '/audio/dizzy_racing.wav',
      'public/audio/dizzy_racing.ogg',
      'public/audio/dizzy_racing.m4a',
      'public/audio/dizzy_racing.mp3',
      'public/audio/dizzy_racing.wav',
      '/public/audio/dizzy_racing.ogg',
      '/public/audio/dizzy_racing.m4a',
      '/public/audio/dizzy_racing.mp3',
      '/public/audio/dizzy_racing.wav'
    ];
    
    console.log("Attempting to load background music from multiple formats and paths");
    
    // First check which audio formats are supported by this browser
    const supportedFormats = this.getSupportedAudioFormats();
    
    // Filter to only supported formats and try them in order
    const supportedAudioFiles = audioFormats.filter(path => {
      const extension = path.split('.').pop().toLowerCase();
      return supportedFormats[extension] && supportedFormats[extension] !== '';
    });
    
    if (supportedAudioFiles.length === 0) {
      console.warn("No supported audio formats available. Audio playback disabled.");
      return;
    }
    
    // Try each format in sequence until one works
    this.loadAudioWithFallbacks(supportedAudioFiles, 0);
  }
  
  /**
   * Load audio with fallback to different formats
   * @param {Array} formatPaths - Array of audio file paths to try
   * @param {number} index - Current index in the array
   */
  loadAudioWithFallbacks(formatPaths, index) {
    if (index >= formatPaths.length) {
      console.warn("All audio formats failed to load. Trying HTML5 Audio as last resort.");
      this.loadHTML5AudioFallback();
      return;
    }
    
    const currentPath = formatPaths[index];
    console.log(`Attempting to load audio format ${index + 1}/${formatPaths.length}: ${currentPath}`);
    
    this.audioLoader.load(
      currentPath,
      // Success callback
      (buffer) => {
        console.log(`Successfully loaded audio: ${currentPath}`);
        this.backgroundMusic.setBuffer(buffer);
        this.backgroundMusic.setLoop(true);
        this.backgroundMusic.setVolume(0.2);
        
        // Use the safer play method
        this.safePlayAudio();
      },
      // Progress callback
      (xhr) => {
        if (xhr.total > 0) {
          const percent = (xhr.loaded / xhr.total * 100).toFixed(0);
        } else {
          console.log(`Music loading: ${xhr.loaded} bytes`);
        }
      },
      // Error callback - try next format
      (error) => {
        console.warn(`Failed to load format ${currentPath}:`, error);
        // Try next format
        this.loadAudioWithFallbacks(formatPaths, index + 1);
      }
    );
  }
  
  /**
   * Fallback to HTML5 Audio API
   */
  loadHTML5AudioFallback() {
    console.log("Falling back to HTML5 Audio API");
    
    // Clean up any existing HTML audio
    if (this.htmlAudio) {
      this.htmlAudio.pause();
      this.htmlAudio.src = '';
      this.htmlAudio = null;
    }
    
    // Create and configure HTML5 Audio element
    const audio = new Audio();
    
    // First check which formats are supported
    const supportedFormats = this.getSupportedAudioFormats();
    console.log("Supported audio formats:", supportedFormats);
    
    // Get the base URL of the page to help with absolute paths
    const baseUrl = window.location.origin;
    console.log("Base URL:", baseUrl);
    
    // Try different path patterns to handle various deployment setups
    const possiblePaths = [
      // Relative paths
      'audio/dizzy_racing.',
      './audio/dizzy_racing.',
      
      // Root-relative paths 
      '/audio/dizzy_racing.',
      
      // Absolute paths with origin
      `${baseUrl}/audio/dizzy_racing.`,
      
      // With public prefix
      'public/audio/dizzy_racing.',
      '/public/audio/dizzy_racing.',
      
      // Absolute with origin and public prefix
      `${baseUrl}/public/audio/dizzy_racing.`,
      
      // Try parent directory in case of nested deployment
      '../audio/dizzy_racing.',
    ];
    
    console.log("Trying the following paths:", possiblePaths);
    
    let audioSrc = '';
    
    // Try all combinations of paths and formats until we find one that exists
    for (const basePath of possiblePaths) {
      if (audioSrc) break; // Stop if we already found a valid source
      
      console.log(`Trying path pattern: ${basePath}`);
      
      if (supportedFormats.ogg) {
        audioSrc = basePath + 'ogg';
        console.log(`Testing OGG format: ${audioSrc}`);
        if (this.checkAudioFileExists(audioSrc)) break;
      }
      
      if (supportedFormats.m4a) {
        audioSrc = basePath + 'm4a';
        console.log(`Testing M4A format: ${audioSrc}`);
        if (this.checkAudioFileExists(audioSrc)) break;
      }
      
      if (supportedFormats.mp3) {
        audioSrc = basePath + 'mp3';
        console.log(`Testing MP3 format: ${audioSrc}`);
        if (this.checkAudioFileExists(audioSrc)) break;
      }
      
      if (supportedFormats.wav) {
        audioSrc = basePath + 'wav';
        console.log(`Testing WAV format: ${audioSrc}`);
        if (this.checkAudioFileExists(audioSrc)) break;
      }
      
      // If we get here and audioSrc is set but not confirmed valid, reset it
      audioSrc = '';
    }
    
    // If we couldn't find a valid source, try the most likely one as a last resort
    if (!audioSrc) {
      console.warn("Could not determine best audio source, trying default MP3 path");
      audioSrc = 'audio/dizzy_racing.mp3';
    }
    
    console.log("Attempting to use HTML5 Audio with source:", audioSrc);
    audio.src = audioSrc;
    audio.loop = true;
    audio.volume = 0.2;
    audio.preload = 'auto';
    
    // Add a specific error handler for source not found
    audio.addEventListener('error', (e) => {
      const errorCode = audio.error ? audio.error.code : 'unknown';
      console.error(`HTML5 Audio error (${errorCode}) with source: ${audio.src}`);
      
      if (errorCode === 4) { // MEDIA_ERR_SRC_NOT_SUPPORTED
        console.error("Media source not supported or not found");
      }
      
      // Ensure the volume control is visible
      this.addVolumeControl();
    }, { passive: true });
    
    // Add event listeners - making sure they're all passive where possible
    audio.addEventListener('canplaythrough', () => {
      console.log("HTML5 Audio loaded successfully:", audioSrc);
      
      try {
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("HTML5 Audio playing");
              this.isMusicPlaying = true;
              
              // Update the mute button if it exists
              this.updateMuteButtonState();
            })
            .catch(error => {
              console.warn("Autoplay prevented by browser:", error);
              this.isMusicPlaying = false;
              
              // Ensure the volume control is visible
              this.addVolumeControl();
            });
        }
      } catch (error) {
        console.error("Error playing HTML5 Audio:", error);
        this.isMusicPlaying = false;
        
        // Ensure the volume control is visible
        this.addVolumeControl();
      }
    }, { passive: true });
    
    // Store the audio element for later use
    this.htmlAudio = audio;
  }
  
  /**
   * Detect supported audio formats in the current browser
   */
  getSupportedAudioFormats() {
    const audio = document.createElement('audio');
    
    return {
      mp3: audio.canPlayType('audio/mpeg'),
      ogg: audio.canPlayType('audio/ogg; codecs="vorbis"'),
      m4a: audio.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
      wav: audio.canPlayType('audio/wav; codecs="1"')
    };
  }
  
  /**
   * Add volume control to game UI
   */
  addVolumeControl() {
    // Check if volume controls already exist, remove if they do
    const existingControls = document.getElementById('volume-controls');
    if (existingControls) {
      existingControls.remove();
    }
    
    // Remove any play button if it exists
    const playButton = document.getElementById('music-play-button');
    if (playButton) {
      playButton.remove();
    }
    
    // Create a container for the volume control
    const volumeContainer = document.createElement('div');
    volumeContainer.id = 'volume-controls';
    
    // Check if we're on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // On mobile, we'll start with just the button visible
    const initialMobileState = isMobile ? 'collapsed' : 'expanded';
    
    volumeContainer.style.cssText = `
      position: fixed;
      ${isMobile ? 'top: 15px; right: 15px;' : 'bottom: 20px; right: 20px;'}
      background-color: rgba(0, 0, 0, 0.5);
      padding: ${isMobile ? '6px' : '10px'};
      border-radius: 5px;
      display: flex;
      align-items: center;
      z-index: 1000;
      ${isMobile ? 'box-shadow: 0 2px 5px rgba(0,0,0,0.3);' : ''}
      ${isMobile ? 'transform: scale(0.8);' : ''}
      ${isMobile ? 'transform-origin: top right;' : ''}
      transition: all 0.2s ease-out;
    `;
    
    // Determine current playing state
    // Check if music is actually playing by looking at audio objects
    let isCurrentlyPlaying = this.isMusicPlaying;
    
    // Also verify against actual audio objects, as sometimes isMusicPlaying gets out of sync
    if (this.backgroundMusic && this.backgroundMusic.isPlaying) {
      isCurrentlyPlaying = true;
      this.isMusicPlaying = true; // Ensure the flag matches reality
    } else if (this.htmlAudio && !this.htmlAudio.paused) {
      isCurrentlyPlaying = true;
      this.isMusicPlaying = true; // Ensure the flag matches reality
    }
    
    console.log(`Creating volume control with playing state: ${isCurrentlyPlaying}`);
    
    // Create the mute/unmute button
    const muteButton = document.createElement('button');
    muteButton.id = 'mute-button';
    muteButton.innerHTML = isCurrentlyPlaying ? '🔊' : '🔇';
    muteButton.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: ${isMobile ? '20px' : '20px'};
      cursor: pointer;
      margin-right: ${isMobile ? '2px' : '10px'};
      ${isMobile ? 'padding: 2px;' : ''}
      ${isMobile ? 'min-width: 28px; min-height: 28px;' : ''}
      ${isMobile ? 'touch-action: manipulation;' : ''}
    `;
    
    // Create the volume slider
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = '20';
    volumeSlider.id = 'volume-slider';
    volumeSlider.style.cssText = `
      width: ${isMobile ? '50px' : '100px'};
      ${isMobile ? 'height: 18px;' : ''}
      ${isMobile ? 'margin: 0 2px;' : ''}
      ${isMobile ? 'touch-action: manipulation;' : ''}
      ${initialMobileState === 'collapsed' && isMobile ? 'display: none;' : 'display: block;'}
    `;
    
    // Add event listeners
    muteButton.addEventListener('click', () => {
      if (isMobile) {
        // On mobile, toggle between showing/hiding the slider
        if (volumeSlider.style.display === 'none') {
          volumeSlider.style.display = 'block';
          volumeContainer.classList.add('expanded');
        } else {
          this.toggleBackgroundMusic();
          muteButton.innerHTML = this.isMusicPlaying ? '🔊' : '🔇';
        }
      } else {
        // On desktop, just toggle mute
        this.toggleBackgroundMusic();
        muteButton.innerHTML = this.isMusicPlaying ? '🔊' : '🔇';
      }
    });
    
    // Long press on mobile to toggle mute without expanding
    if (isMobile) {
      let longPressTimer;
      let wasMoved = false;
      
      muteButton.addEventListener('touchstart', (e) => {
        wasMoved = false;
        longPressTimer = setTimeout(() => {
          if (!wasMoved) {
            this.toggleBackgroundMusic();
            muteButton.innerHTML = this.isMusicPlaying ? '🔊' : '🔇';
            // Add vibration feedback if available
            if (navigator.vibrate) {
              navigator.vibrate(50);
            }
          }
        }, 500); // 500ms for long press
      }, { passive: true }); // Add passive flag
      
      muteButton.addEventListener('touchmove', () => {
        wasMoved = true;
        clearTimeout(longPressTimer);
      }, { passive: true }); // Add passive flag
      
      muteButton.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
      }, { passive: true }); // Add passive flag
      
      // Close expanded view when clicking outside
      document.addEventListener('click', (e) => {
        if (volumeSlider.style.display === 'block' && 
            !volumeContainer.contains(e.target)) {
          volumeSlider.style.display = 'none';
          volumeContainer.classList.remove('expanded');
        }
      });
    }
    
    volumeSlider.addEventListener('input', (e) => {
      const volume = e.target.value / 100;
      this.setMusicVolume(volume);
      
      // Update mute button based on volume
      muteButton.innerHTML = volume > 0 ? '🔊' : '🔇';
    });
    
    // Add elements to the container
    volumeContainer.appendChild(muteButton);
    volumeContainer.appendChild(volumeSlider);
    
    // Set current volume if audio is available
    if (this.backgroundMusic || this.htmlAudio) {
      const currentVolume = this.backgroundMusic ? 
        this.backgroundMusic.getVolume() : 
        this.htmlAudio ? this.htmlAudio.volume : 0.2;
      
      volumeSlider.value = Math.round(currentVolume * 100);
    }
    
    // Add the container to the page
    document.body.appendChild(volumeContainer);
    
    // Add custom CSS to make sure the volume control is visible on all track themes
    this.addVolumeControlStyles();
  }
  
  /**
   * Toggle background music on/off
   */
  toggleBackgroundMusic() {
    // Resume AudioContext if suspended
    if (this.audioContext && this.audioContext.state === 'suspended') {
      console.log("Resuming AudioContext during toggle");
      this.audioContext.resume().catch(err => {
        console.warn("Failed to resume AudioContext during toggle:", err);
      });
    }

    // First try THREE.js Audio object
    if (this.backgroundMusic && this.backgroundMusic.buffer) {
      if (this.isMusicPlaying) {
        try {
          this.backgroundMusic.pause();
          this.isMusicPlaying = false;
          // Update the mute button immediately
          this.updateMuteButtonState();
        } catch (error) {
          console.warn("Error pausing THREE.js audio:", error);
        }
      } else {
        // Use our safe play method which will update the mute button
        this.safePlayAudio();
      }
      console.log(`Background music ${this.isMusicPlaying ? 'resumed' : 'paused'}`);
      return;
    }
    
    // Then try HTML5 Audio fallback
    this.tryPlayHTML5Audio();
  }
  
  /**
   * Try to play or pause HTML5 audio
   */
  tryPlayHTML5Audio() {
    if (this.htmlAudio) {
      if (this.isMusicPlaying) {
        try {
          this.htmlAudio.pause();
          this.isMusicPlaying = false;
          // Update the mute button immediately
          this.updateMuteButtonState();
        } catch (error) {
          console.warn("Error pausing HTML5 audio:", error);
        }
      } else {
        try {
          const playPromise = this.htmlAudio.play();
          this.isMusicPlaying = true;
          // Update the mute button immediately
          this.updateMuteButtonState();
          
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.catch(error => {
              console.warn("Could not play HTML5 audio:", error);
              this.isMusicPlaying = false;
              this.updateMuteButtonState();
              // Ensure the volume control is visible
              this.addVolumeControl();
            });
          }
        } catch (error) {
          console.warn("Error playing HTML5 audio:", error);
          this.isMusicPlaying = false;
          this.updateMuteButtonState();
          // Ensure the volume control is visible
          this.addVolumeControl();
        }
      }
      console.log(`Background music (HTML5) ${this.isMusicPlaying ? 'resumed' : 'paused'}`);
    }
  }
  
  /**
   * Set music volume
   * @param {number} volume - Volume level from 0.0 to 1.0
   */
  setMusicVolume(volume) {
    // Ensure volume is between 0 and 1
    const newVolume = Math.min(1, Math.max(0, volume));
    
    // Set volume on THREE.js Audio if available
    if (this.backgroundMusic) {
      this.backgroundMusic.setVolume(newVolume);
    }
    
    // Set volume on HTML5 Audio fallback if available
    if (this.htmlAudio) {
      this.htmlAudio.volume = newVolume;
    }
    
    console.log(`Music volume set to ${newVolume}`);
  }

  /**
   * Check if an audio file exists
   * @param {string} url - URL of the audio file to check
   * @returns {boolean} True if the file exists and can be loaded
   */
  checkAudioFileExists(url) {
    // Modern browsers restrict fetch/XHR for media files
    // We're logging the attempt for debugging purposes
    console.log(`Trying audio source: ${url}`);
    
    // Create an audio element to test if the source can be loaded
    const testAudio = new Audio();
    testAudio.src = url;
    
    // Listen for error events to catch any issues
    const errorHandler = () => {
      console.warn(`Failed to load: ${url}`);
      testAudio.removeEventListener('error', errorHandler);
    };
    
    testAudio.addEventListener('error', errorHandler, { once: true });
    
    // Return true to allow the code to try this URL
    return true;
  }

  /**
   * Add responsive styles for volume control
   */
  addVolumeControlStyles() {
    // Check if styles are already added
    if (document.getElementById('volume-control-styles')) return;

    // Check if we're on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Create a style element
    const style = document.createElement('style');
    style.id = 'volume-control-styles';
    
    style.textContent = `
      /* Base styles for volume controls */
      #volume-controls {
        transition: all 0.2s ease-out;
      }
      
      /* Make range inputs more touch-friendly on mobile */
      ${isMobile ? `
      @media (max-width: 768px) {
        #volume-controls {
          opacity: 0.8;
        }
        
        #volume-controls:hover,
        #volume-controls.expanded {
          opacity: 1;
        }
        
        #volume-controls.expanded {
          background-color: rgba(0, 0, 0, 0.7);
        }
        
        #volume-controls input[type="range"] {
          -webkit-appearance: none;
          height: 18px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          padding: 0 2px;
        }
        
        #volume-controls input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
        }
        
        #volume-controls input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          background: white;
          border: none;
          border-radius: 50%;
        }
        
        /* Handle landscape orientation */
        @media (orientation: landscape) {
          #volume-controls {
            top: 10px !important;
            right: 10px !important;
            transform: scale(0.75) !important;
          }
        }
        
        /* Make even smaller on very small screens */
        @media (max-width: 360px) {
          #volume-controls {
            transform: scale(0.7) !important;
            top: 10px !important;
            right: 10px !important;
          }
        }
      }
      ` : ''}
    `;
    
    // Add the style to the document head
    document.head.appendChild(style);
  }

  /**
   * Update the mute button state to match the current playing state
   */
  updateMuteButtonState() {
    const muteButton = document.getElementById('mute-button');
    if (muteButton) {
      muteButton.innerHTML = this.isMusicPlaying ? '🔊' : '🔇';
      console.log(`Updated mute button to ${this.isMusicPlaying ? 'unmuted' : 'muted'} state`);
    }
  }

  /**
   * Create speed-reducing stripes on the track
   */
  createSpeedStripes() {
    console.log('[TRACK] Creating speed-reducing dirt patches');
    
    // Clear any existing speed stripes
    this.speedStripes.forEach(stripe => this.scene.remove(stripe.mesh));
    this.speedStripes = [];
    
    // Create stripes at specific locations - avoid start line at 0/360 degrees
    const stripeAngles = [Math.PI/2, Math.PI, Math.PI*3/2]; // 90, 180, 270 degrees
    
    // Dirt/mud color instead of red
    const dirtColor = 0x8B4513; // Brown/dirt color
    
    // Place dirt patches at specific angles, avoiding the start line at 0/360 degrees
    for (let i = 0; i < stripeAngles.length; i++) {
      const sectionAngle = stripeAngles[i];
      
      // Place all dirt patches on the inner side of the track
      const radialOffset = -this.trackWidth * 0.35; // Inner lane position (negative means inner side)
      
      // Create a dirt patch (elliptical shape rather than rectangular)
      const patchWidth = 6; // Wider for a dirt patch
      const patchLength = this.trackWidth * 0.35; // Smaller - 35% of track width (reduced from 45%)
      
      // Use circular geometry for more natural dirt patch look
      const patchGeometry = new THREE.CircleGeometry(patchLength/2, 12);
      
      // Create a material that looks like dirt
      const patchMaterial = new THREE.MeshBasicMaterial({
        color: dirtColor,
        side: THREE.DoubleSide,
        roughness: 1.0  // Maximum roughness for a dirt-like appearance
      });
      
      const patch = new THREE.Mesh(patchGeometry, patchMaterial);
      
      // Make it slightly oval by scaling (smaller overall)
      patch.scale.set(1.3, 1, 1); // Reduced from 1.5 to 1.3
      
      // Position the patch - increased height to ensure visibility
      const trackCenter = this.trackRadius;
      const patchHeight = 0.05; // Increased from 0.02 to ensure visibility
      patch.position.set(
        Math.cos(sectionAngle) * (trackCenter + radialOffset),
        patchHeight, // Higher above track surface to avoid z-fighting
        Math.sin(sectionAngle) * (trackCenter + radialOffset)
      );
      
      // Rotate to align with track
      patch.rotation.x = -Math.PI / 2; // Make horizontal
      patch.rotation.z = sectionAngle; // Align with track direction
      
      // Add to scene and store reference
      this.scene.add(patch);
      this.speedStripes.push({
        mesh: patch,
        angle: sectionAngle,
        radius: trackCenter + radialOffset,
        originalY: patchHeight, // Store the new higher position
        color: dirtColor
      });
    }
    
    console.log(`[TRACK] Created ${this.speedStripes.length} speed-reducing dirt patches`);
  }
  
  /**
   * Animate and update speed stripes
   * @param {number} deltaTime - Time since last frame
   */
  updateSpeedStripes(deltaTime) {
    if (!this.speedStripes || this.speedStripes.length === 0) return;
    
    // Update animation time
    this.stripeAnimationTime += deltaTime;
    
    // Simple pulsing animation for stripes
    for (let i = 0; i < this.speedStripes.length; i++) {
      const stripe = this.speedStripes[i];
      
      // Smaller, more subtle hover animation
      const hoverHeight = Math.sin(this.stripeAnimationTime * 1.5 + i * 0.2) * 0.02;
      
      // Ensure Y position never goes below the original height to maintain visibility
      stripe.mesh.position.y = Math.max(stripe.originalY, stripe.originalY + hoverHeight);
    }
  }
  
  /**
   * Check if a car is on a speed stripe and should be slowed
   * @param {THREE.Vector3} carPosition - Position of the car
   * @returns {boolean} - True if car should be slowed
   */
  isCarOnSpeedStripe(carPosition) {
    if (!this.speedStripes || this.speedStripes.length === 0) return false;
    
    // Calculate distance from center of track
    const distance = Math.sqrt(carPosition.x * carPosition.x + carPosition.z * carPosition.z);
    
    // Calculate angle of car relative to center
    const carAngle = Math.atan2(carPosition.z, carPosition.x);
    
    // Normalize angle to 0-2π range
    const normalizedCarAngle = carAngle < 0 ? carAngle + Math.PI * 2 : carAngle;
    
    // Check each stripe
    for (const stripe of this.speedStripes) {
      // Normalize stripe angle
      const normalizedStripeAngle = stripe.angle < 0 ? stripe.angle + Math.PI * 2 : stripe.angle;
      
      // Calculate angular distance (accounting for wrap-around)
      const angleDiff = Math.abs(normalizedCarAngle - normalizedStripeAngle);
      const wrappedAngleDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
      
      // Calculate radial distance
      const radialDiff = Math.abs(distance - stripe.radius);
      
      // Check if car is close enough to stripe (both angular and radial distance)
      if (wrappedAngleDiff < 0.08 && radialDiff < 2) {
        // Highlight the stripe when car is on it (make it a bit higher)
        stripe.mesh.position.y = stripe.originalY + 0.05;
        
        // Create dirt smoke effect when car is on the dirt
        this.createDirtSmoke(carPosition);
        
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Create a dirt smoke particle effect at the given position
   * @param {THREE.Vector3} position - Position to create the smoke
   */
  createDirtSmoke(position) {
    // Don't create too many particles
    const now = performance.now();
    if (!this.lastSmokeTime || now - this.lastSmokeTime > 100) { // Limit to one smoke puff every 100ms
      this.lastSmokeTime = now;
      
      // Create a small group of particles
      const particleCount = 8;
      
      for (let i = 0; i < particleCount; i++) {
        // Create a single dirt particle
        const size = 0.3 + Math.random() * 0.4; // Random size between 0.3 and 0.7
        const geometry = new THREE.PlaneGeometry(size, size);
        
        // Brown smoke with some random variation
        const brown = 0x8B4513;
        const colorVariation = Math.floor(Math.random() * 0x303030);
        const colorWithVariation = brown + colorVariation;
        
        const material = new THREE.MeshBasicMaterial({
          color: colorWithVariation,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide
        });
        
        const particle = new THREE.Mesh(geometry, material);
        
        // Position slightly above the ground, with some random offset
        particle.position.set(
          position.x + (Math.random() - 0.5) * 1.0,
          0.1 + Math.random() * 0.2,
          position.z + (Math.random() - 0.5) * 1.0
        );
        
        // Random rotation to make it look more natural
        particle.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
        particle.rotation.z = Math.random() * Math.PI * 2;
        
        // Add to scene
        this.scene.add(particle);
        
        // Store particle data for animation
        if (!this.dirtParticles) this.dirtParticles = [];
        
        this.dirtParticles.push({
          mesh: particle,
          life: 1.0, // Life counter (1.0 = full life, 0.0 = dead)
          speed: {
            x: (Math.random() - 0.5) * 2,
            y: 0.5 + Math.random() * 1.0,
            z: (Math.random() - 0.5) * 2,
            rotation: (Math.random() - 0.5) * 0.2
          }
        });
      }
    }
  }
  
  /**
   * Update and animate dirt smoke particles
   * @param {number} deltaTime - Time since last frame
   */
  updateDirtSmoke(deltaTime) {
    if (!this.dirtParticles || this.dirtParticles.length === 0) return;
    
    // Process each particle
    for (let i = this.dirtParticles.length - 1; i >= 0; i--) {
      const particle = this.dirtParticles[i];
      
      // Update life
      particle.life -= deltaTime * 1.5; // Particles live for ~0.7 seconds
      
      if (particle.life <= 0) {
        // Remove dead particles
        this.scene.remove(particle.mesh);
        this.dirtParticles.splice(i, 1);
      } else {
        // Update position and opacity
        particle.mesh.position.x += particle.speed.x * deltaTime;
        particle.mesh.position.y += particle.speed.y * deltaTime;
        particle.mesh.position.z += particle.speed.z * deltaTime;
        
        // Slow down as it rises
        particle.speed.x *= 0.95;
        particle.speed.y *= 0.95;
        particle.speed.z *= 0.95;
        
        // Rotate particle
        particle.mesh.rotation.z += particle.speed.rotation;
        
        // Fade out
        particle.mesh.material.opacity = particle.life * 0.7;
        
        // Grow slightly as it rises
        const scale = 1.0 + (1.0 - particle.life) * 0.5;
        particle.mesh.scale.set(scale, scale, scale);
      }
    }
  }

  /**
   * Update method called by game loop to animate track elements
   * @param {number} deltaTime - Time in seconds since last frame
   */
  update(deltaTime) {
    // Update speed stripes animation
    this.updateSpeedStripes(deltaTime);
    
    // Update dirt smoke particles
    this.updateDirtSmoke(deltaTime);
    
    // Animate grandstands if they exist
    if (this.grandstand && typeof this.grandstand.animate === 'function') {
      this.grandstand.animate(deltaTime);
    }
    
    // Animate clouds
    if (this.scenery && typeof this.scenery.animateClouds === 'function') {
      this.scenery.animateClouds(deltaTime);
    }
    
    // Call parent update if it exists
    if (typeof super.update === 'function') {
      super.update(deltaTime);
    }
  }
  
  /**
   * Get the size of the track for external use (like airplane paths)
   * @returns {Object} Object with width and depth properties
   */
  getTrackSize() {
    return {
      width: this.trackRadius * 2,
      depth: this.trackRadius * 2,
      radius: this.trackRadius
    };
  }
}