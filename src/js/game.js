import * as THREE from 'three';

/* 
 * Racing Game
 * A 3D browser-based racing game using Three.js
 * Play it here: https://racing-game.vercel.app/
 */

import { Car } from './car';
import { Track } from './track';
import { Controls } from './controls';
import { GameUI } from './ui/GameUI';
import { GameModes } from './constants/GameModes';
import { PlayManager } from './multiplayer/PlayManager';
import { ItemManager } from './items/ItemManager';
import { TrackFactory } from './tracks/TrackFactory.js';
import { SilverstoneTrack } from './tracks/SilverstoneTrack.js';
import { AIManager } from './entities/AIManager.js';
import { Airplane } from './entities/Airplane.js';

export class RacingGame {
    constructor() {
        console.log('[DEBUG] Constructor called');
        
        // Store a global reference to the game instance for debugging
        window.game = this;
        
        // Only set up variables first
        this.initializeVariables();
        
        // Start preloading and connect to multiplayer immediately with a temporary ID
        this.preloadGameInBackground();
        this.initialSocketId = null;  // Add this to track our initial connection
        this.connectToMultiplayerAsync();
        
        // Show UI (but game will be loading in background)
        console.log('[DEBUG] Creating GameUI');
        new GameUI((mode, playerName) => {
            console.log('[DEBUG] GameUI callback triggered with mode:', mode, 'player:', playerName);
            this.startGame(mode, playerName);
        }, this);  // Pass game instance
        
        console.log('[DEBUG] Constructor finished');
        
        // Performance optimization
        this.targetFPS = 60;
        this.frameTimeLimit = 1000 / 30; // 33ms max frame time (30fps minimum)
        this.lastFrameTime = 0;
        this.frameTimes = []; // Keep track of recent frame times
        this.consecutiveSlowFrames = 0;
        this.performanceMode = false;
        this.performanceModeAICars = 3; // Default number of AI cars in performance mode
        
        // Throttle expensive operations 
        this.lastCheckpointCheckTime = 0;
        this.lastBoundaryCheckTime = 0;
        
        // Performance monitoring
        this.frameTimeHistory = [];
        this.frameTimeHistoryLimit = 60; // Track last 60 frames
    }
    
    initializeVariables() {
        // Only set up variables, don't initialize anything yet
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.car = null;
        this.track = null;
        this.controls = null;
        this.isGameRunning = false;
        this.clock = new THREE.Clock();
        this.playerName = null;
        this.cameraMode = 'follow';
        this.gameInitialized = false;  // Add flag to track initialization
        
        // Track and lap information
        this.track = null;
        this.currentLap = 0;
        this.totalLaps = 3;
        this.lastCheckpointPassed = -1;
        this.lapTimes = [];
        this.lapStartTime = performance.now();
        this.lastLapCompleteTime = 0;
        this.raceFinished = false;
        this.hasPassedFinishLine = false;
        
        console.log('[DEBUG] Setting up variables');
        
        // Multiplayer related
        this.isMultiplayer = false;
        this.multiplayer = null;
        this.playManager = null;
        this.remotePlayers = new Map();
        this.remoteCarsAdded = 0;
        this.remoteCarsRemoved = 0;
        
        // Item manager
        this.itemManager = null;
        
        // Set up debug commands
        this.setupDebugCommands();
        
        // Add AIManager variable
        this.aiManager = null;
    }
    
    async preloadGameInBackground() {
        try {
            console.log('[DEBUG] Starting background initialization');
            
            // Initialize Three.js scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x87CEEB);
            
            // Setup lighting
            this.setupLighting();
            
            // Setup camera
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.set(0, 15, -30);
            this.camera.lookAt(0, 0, 0);
            
            // Setup renderer and add to document
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true;
            document.body.appendChild(this.renderer.domElement);
            
            // Set renderer's canvas to be behind UI
            this.renderer.domElement.style.position = 'fixed';
            this.renderer.domElement.style.top = '0';
            this.renderer.domElement.style.left = '0';
            this.renderer.domElement.style.zIndex = '-1';
            
            // Create and initialize track
            console.log('[DEBUG] Pre-initializing track');
            this.track = new Track(this.scene);
            await this.track.init();
            
            // Add the track's audio listener to the camera if it exists
            if (this.track.audioListener) {
                // Check if the listener is already attached to the camera
                const existingListeners = this.camera.children.filter(child => child instanceof THREE.AudioListener);
                if (existingListeners.length === 0) {
                    this.camera.add(this.track.audioListener);
                    console.log('[DEBUG] Audio listener attached to camera');
                } else {
                    console.log('[DEBUG] Camera already has an audio listener');
                }
            }
            
            // Pre-initialize car (but don't add to scene yet)
            this.car = new Car(this.scene, this.track);
            await this.car.init();
            
            // Initialize item manager
            this.itemManager = new ItemManager(this.scene, this.track, null);
            
            this.preloadComplete = true;
            console.log('[DEBUG] Background initialization complete');

            // Start background animation
            this.animateBackground();
        } catch (error) {
            console.error('[DEBUG] Error in background initialization:', error);
            this.preloadComplete = false;
        }
    }
    
    animate() {
        // Handle exceptions to prevent game from crashing completely
        try {
            // Request next frame immediately to keep animation loop going
            // even if this frame takes a long time to process
            const animationId = requestAnimationFrame(() => this.animate());
            
            // Measure frame time
            const now = performance.now();
            const frameDelta = now - this.lastFrameTime;
            
            // If we're running too fast, throttle to save power
            if (frameDelta < (1000 / this.targetFPS)) {
                return;
            }
            
            // Record frame start time
            this.lastFrameTime = now;
            
            // Calculate time since last successful frame
            const deltaTime = Math.min(frameDelta / 1000, 0.1); // Cap at 100ms to prevent physics issues
            
            // Track frame time for performance monitoring
            this.frameTimes.push(frameDelta);
            if (this.frameTimes.length > 60) { // Keep last 60 frames
                this.frameTimes.shift();
            }
            
            // Check for performance issues
            if (frameDelta > 50) { // More than 50ms (less than 20fps)
                this.consecutiveSlowFrames++;
                
                // If we have multiple consecutive slow frames, enable performance mode
                if (this.consecutiveSlowFrames > 5 && !this.performanceMode) {
                    console.log(`[PERFORMANCE] Enabling performance mode after ${this.consecutiveSlowFrames} slow frames (${frameDelta.toFixed(1)}ms)`);
                    this.enablePerformanceMode();
                }
            } else {
                // Reset consecutive slow frames counter
                this.consecutiveSlowFrames = 0;
            }
            
            // Update and render game
            this.update(deltaTime);
            this.renderer.render(this.scene, this.camera);
            
        } catch (error) {
            console.error('[GAME] Animation loop error:', error);
            // Don't cancel animation completely, but log the error
        }
    }
    
    animateBackground() {
        if (this.gameInitialized) return;

        // Rotate camera around track with higher elevation and larger radius
        const time = Date.now() * 0.0001;
        const radius = 40;  // Increased from 30 to 40
        this.camera.position.x = Math.cos(time) * radius;
        this.camera.position.z = Math.sin(time) * radius;
        this.camera.position.y = 25;  // Increased from 15 to 25 for higher perspective

        // Tilt the camera down more
        this.camera.lookAt(0, -5, 0);  // Changed from (0, 0, 0) to look slightly downward

        // Render the scene
        this.renderer.render(this.scene, this.camera);
        
        // Continue animation
        requestAnimationFrame(() => this.animateBackground());
    }

    // Add new method for initial multiplayer connection
    async connectToMultiplayerAsync() {
        try {
            console.log('[DEBUG] Starting background multiplayer connection');
            this.playManager = new PlayManager(this);
            
            // Connect with a temporary connection
            const connection = await this.playManager.start('Connecting...');
            this.initialSocketId = this.playManager.multiplayerManager.socket.id;
            console.log('[DEBUG] Background multiplayer connection established with ID:', this.initialSocketId);
        } catch (error) {
            console.warn('[DEBUG] Background multiplayer connection failed:', error);
        }
    }

    // Modify startGame to update the player name instead of creating new connection
    async startGame(mode, playerName) {
        console.log(`[DEBUG] StartGame called with mode: ${mode}, player: ${playerName}`);
        
        if (this.gameInitialized) {
            console.warn('[DEBUG] Game already initialized!');
            return;
        }

        try {
            // Start showing the game immediately
            await this.initializeGameVisuals();

            // Set our car's name immediately
            if (this.car) {
                console.log('[DEBUG] Setting local car name to:', playerName);
                this.car.setPlayerName(playerName);
                this.playerName = playerName;
            }

            // Handle multiplayer connection
            if (mode === GameModes.PLAY) {
                if (this.playManager && this.playManager.multiplayerManager) {
                    await this.playManager.updatePlayerName(playerName);
                } else {
                    await this.connectToMultiplayerAsync(mode, playerName);
                }
                
                // Start game loop immediately for public multiplayer
                this.gameInitialized = true;
                this.isGameRunning = true;
                this.isRaceStarted = true;
                this.clock.start();
                this.animate();
            } else if (mode === 'friends') {
                // For private room mode (friends), don't start the race yet
                console.log('[DEBUG] Friends mode detected - initializing game without starting race');
                
                this.gameInitialized = true;
                this.isGameRunning = true; 
                this.isRaceStarted = false; // Don't start the race immediately
                
                // Disable car controls until race starts
                if (this.car) {
                    this.car.disableControls();
                }
                
                // Start the game loop
                this.clock.start();
                this.animate();
                
                // IMPORTANT: Always show the waiting room for friends mode
                console.log('[DEBUG] Showing waiting room for friends mode');
                this.showWaitingRoom();
            } else {
                // Regular single-player mode
                this.gameInitialized = true;
                this.isGameRunning = true;
                this.isRaceStarted = true;
                this.clock.start();
                this.animate();
            }
        } catch (error) {
            console.error('[DEBUG] Failed to start game:', error);
            alert('Failed to start game. Please refresh the page to try again.');
        }
    }

    async initializeGameVisuals() {
        // Wait for preload if it's not done yet
        if (!this.preloadComplete) {
            console.log('[DEBUG] Waiting for preload to complete...');
            await this.preloadGameInBackground();
        }

        // Create game container and add renderer
        const container = document.createElement('div');
        container.id = 'game-container';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        document.body.appendChild(container);
        container.appendChild(this.renderer.domElement);

        // Set player name and position car
        this.car.setPlayerName(this.playerName);
        this.positionCarForTrack();

        // Setup controls
        this.controls = new Controls(this.car);

        // Initialize AI Manager
        this.initializeAI();
        
        // Add airplane with flyby effect across player's view
        this.addAirplane(true);

        // Add AI cars by default in single player mode
        if (!this.isMultiplayer) {
            console.log('[DEBUG] Adding AI cars to the race in single-player mode');
            
            // Ensure we add AI cars after a short delay to let the scene initialize fully
            const addAICars = () => {
                // Clear any existing AI cars first
                if (this.aiManager.aiCars.length > 0) {
                    console.log('[DEBUG] Removing existing AI cars before adding new ones');
                    this.aiManager.removeAllAICars();
                }
                
                // Then spawn new ones - default 5 for single player
                const aiCarCount = 5;
                this.aiManager.spawnRandomAICars(aiCarCount);
                
                // Log the AI cars to verify they were created
                console.log(`[DEBUG] Added ${this.aiManager.aiCars.length} AI cars:`, 
                    this.aiManager.aiCars.map(car => ({
                        name: car.playerName,
                        carType: car.carType,
                        position: car.position ? [car.position.x, car.position.y, car.position.z] : null
                    }))
                );
                
                // Show notification to let the user know
                this.showNotification(`${this.aiManager.aiCars.length} AI cars have joined the race! 🏎️`);
            };
            
            // Add cars after a small delay to ensure track is loaded
            setTimeout(addAICars, 1000);
            
            // Add a backup timer to check and add cars if they weren't added
            setTimeout(() => {
                if (this.aiManager.aiCars.length === 0 && !this.isMultiplayer) {
                    console.log('[DEBUG] No AI cars detected after initial spawn, trying again');
                    addAICars();
                }
            }, 3000);
        } else {
            // In multiplayer, let the AIManager handle spawning the appropriate number of cars
            this.aiManager.setMultiplayerMode(true);
            console.log('[DEBUG] Setting AI manager to multiplayer mode');
        }

        // Add UI elements
        this.addCarSwitcher();
        this.addCameraSwitcher();

        // Setup event listeners
        window.addEventListener('resize', () => this.onWindowResize());

        // Set the local car reference in ItemManager
        this.itemManager.setLocalCar(this.car);

        // Initialize items on track for single-player mode
        if (!this.isMultiplayer) {
            this.initializeItems();
        }

        // Show the HUD
        if (this.track) {
            this.track.showHUD();
        }
    }

    // New method to initialize items in single-player mode
    initializeItems() {
        console.log('[DEBUG] Initializing items in single-player mode');
        
        // Create 10 random items around the track
        const trackRadius = this.track.trackRadius;
        const segments = 8;
        const createSinglePlayerItems = () => {
            for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                
                // Create three items at different radiuses for each angle
                const radiuses = [
                    trackRadius - 2, // Inner lane
                    trackRadius,     // Middle lane
                    trackRadius + 2  // Outer lane
                ];
                
                radiuses.forEach(radius => {
                    // Only place an item with 50% chance to avoid too many
                    if (Math.random() < 0.5) {
                        return;
                    }
                    
                    const position = new THREE.Vector3(
                        Math.cos(angle) * radius,
                        1, // Slightly above ground
                        Math.sin(angle) * radius
                    );
                    
                    // Randomly select item type
                    const itemType = this.getRandomItemType();
                    
                    // Create a unique ID for the item
                    const itemId = `item-${i}-${radius}-${Date.now()}`;
                    
                    // Create the item and add it to the game
                    const itemMesh = this.itemManager.createItemMesh(itemType, position);
                    if (itemMesh) {
                        const item = {
                            id: itemId,
                            type: itemType,
                            mesh: itemMesh
                        };
                        this.itemManager.items.set(itemId, item);
                        console.log(`[DEBUG] Created ${itemType} at position:`, position);
                    }
                });
            }
            
            console.log(`[DEBUG] Created ${this.itemManager.items.size} items in single-player mode`);
            
            // Debug items after creation
            setTimeout(() => {
                if (this.itemManager.items.size === 0) {
                    console.warn('[DEBUG] No items were created, trying again');
                    createSinglePlayerItems();
                } else {
                    console.log(`[DEBUG] Items in scene: ${this.itemManager.items.size}`);
                    this.itemManager.items.forEach((item, id) => {
                        console.log(`Item ${id}:`, item.type, item.mesh ? 'with mesh' : 'no mesh');
                    });
                }
            }, 1000);
        };
        
        // Add items after a small delay to ensure track is loaded
        setTimeout(createSinglePlayerItems, 1500);
    }

    // Helper method to get a random item type
    getRandomItemType() {
        const randomValue = Math.random();
        if (randomValue < 0.4) {
            return 'speedBoost';
        } else if (randomValue < 0.8) {
            return 'banana';
        } else {
            return 'shell';
        }
    }

    async connectToMultiplayerAsync(mode, playerName) {
        try {
            console.log('[DEBUG] Starting multiplayer connection in background');
            
            // Create loading indicator for multiplayer
            const connectingMessage = document.createElement('div');
            connectingMessage.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                font-family: Arial, sans-serif;
                z-index: 1000;
            `;
            connectingMessage.textContent = 'Connecting to multiplayer...';
            document.body.appendChild(connectingMessage);

            // Initialize PlayManager
            this.playManager = new PlayManager(this);
            await this.playManager.start(playerName);
            this.isMultiplayer = true;
            this.multiplayer = this.playManager.multiplayerManager;

            // Set multiplayer mode on track if it exists
            if (this.track) {
                this.track.setMultiplayerMode(true);
            }

            // Set multiplayer mode on AIManager if it exists
            if (this.aiManager) {
                this.aiManager.setMultiplayerMode(true);
                // In multiplayer, limit the number of AI cars
                this.aiManager.maxAICars = 3; // Fewer AI cars in multiplayer
            }

            // Connect the ItemManager to multiplayer
            if (this.itemManager && this.multiplayer) {
                console.log('[DEBUG] Connecting ItemManager to multiplayer');
                this.itemManager.multiplayer = this.multiplayer;
                this.itemManager.setupNetworkHandlers();
            }

            // Show success message
            connectingMessage.textContent = 'Connected!';
            connectingMessage.style.backgroundColor = 'rgba(0, 128, 0, 0.7)';
            setTimeout(() => {
                connectingMessage.remove();
            }, 2000);

        } catch (error) {
            console.error('[DEBUG] Failed to connect to multiplayer:', error);
            
            // Show error message
            const errorMessage = document.createElement('div');
            errorMessage.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background-color: rgba(255, 0, 0, 0.7);
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                font-family: Arial, sans-serif;
                z-index: 1000;
            `;
            errorMessage.textContent = 'Failed to connect to multiplayer. Playing in single player mode.';
            document.body.appendChild(errorMessage);
            
            setTimeout(() => {
                errorMessage.remove();
            }, 5000);

            // Fall back to single player
            this.isMultiplayer = false;
            if (this.track) {
                this.track.setMultiplayerMode(false);
            }
        }
    }
    
    addCarSwitcher() {
        const switcherButton = document.createElement('button');
        switcherButton.id = 'car-switcher';
        switcherButton.innerHTML = '🏎️ Select Car';
        switcherButton.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            background-color: rgba(255, 255, 255, 0.8);
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            z-index: 1000;
            transition: all 0.3s;
        `;
        
        // Create car selection menu
        const menu = document.createElement('div');
        menu.id = 'car-menu';
        menu.style.cssText = `
            position: fixed;
            top: 20px;
            right: 150px;
            background-color: rgba(0, 0, 0, 0.9);
            border-radius: 5px;
            padding: 10px;
            display: none;
            z-index: 1001;
        `;
        
        const cars = [
            { id: 'kart', name: '🏎️ Racing Kart', color: '#ff4444' },
            { id: 'classic', name: '🚗 Classic Car', color: '#4a4a4a' },
            { id: 'tesla', name: '🚙 Model 3', color: '#2c3e50' }
        ];
        
        cars.forEach(car => {
            const option = document.createElement('div');
            option.style.cssText = `
                padding: 10px 20px;
                color: white;
                cursor: pointer;
                transition: background-color 0.3s;
                border-radius: 3px;
                margin: 2px 0;
            `;
            option.innerHTML = car.name;
            
            option.addEventListener('mouseover', () => {
                option.style.backgroundColor = car.color;
            });
            
            option.addEventListener('mouseout', () => {
                option.style.backgroundColor = 'transparent';
            });
            
            option.addEventListener('click', () => {
                this.car.setCarType(car.id);
                switcherButton.innerHTML = car.name;
                menu.style.display = 'none';
                localStorage.setItem('selectedCar', car.id);
            });
            
            menu.appendChild(option);
        });
        
        // Toggle menu on button click
        switcherButton.addEventListener('click', () => {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== switcherButton) {
                menu.style.display = 'none';
            }
        });
        
        // Add hover effect to button
        switcherButton.addEventListener('mouseover', () => {
            switcherButton.style.backgroundColor = 'rgba(255, 255, 255, 1)';
        });
        
        switcherButton.addEventListener('mouseout', () => {
            switcherButton.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        });
        
        // Load previously selected car
        const savedCar = localStorage.getItem('selectedCar');
        if (savedCar) {
            const car = cars.find(c => c.id === savedCar);
            if (car) {
                this.car.setCarType(savedCar);
                switcherButton.innerHTML = car.name;
            }
        }
        
        document.body.appendChild(switcherButton);
        document.body.appendChild(menu);
    }
    
    addCameraSwitcher() {
        const switcherButton = document.createElement('button');
        switcherButton.id = 'camera-switcher';
        switcherButton.innerHTML = '🎥 Camera: Follow';
        switcherButton.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            padding: 10px 20px;
            background-color: rgba(255, 255, 255, 0.8);
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            z-index: 1000;
            transition: background-color 0.3s;
        `;
        
        const modes = [
            { id: 'follow', label: 'Follow', emoji: '🎥' },
            { id: 'top', label: 'Top View', emoji: '️' },
            { id: 'cockpit', label: 'Cockpit', emoji: '🏎️' },
            { id: 'side', label: 'Side', emoji: '👁️' }
        ];
        
        let currentModeIndex = 0;
        
        switcherButton.addEventListener('click', () => {
            currentModeIndex = (currentModeIndex + 1) % modes.length;
            const mode = modes[currentModeIndex];
            this.cameraMode = mode.id;
            switcherButton.innerHTML = `${mode.emoji} Camera: ${mode.label}`;
        });
        
        switcherButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            switcherButton.click();
        });
        
        // Add hover effect
        switcherButton.addEventListener('mouseover', () => {
            switcherButton.style.backgroundColor = 'rgba(255, 255, 255, 1)';
        });
        
        switcherButton.addEventListener('mouseout', () => {
            switcherButton.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        });
        
        document.body.appendChild(switcherButton);
    }
    
    addTrackSelector() {
        const switcherButton = document.createElement('button');
        switcherButton.id = 'track-switcher';
        switcherButton.innerHTML = '🏁 Track: Default';
        switcherButton.style.cssText = `
            position: fixed;
            top: 120px;
            right: 20px;
            padding: 10px 20px;
            background-color: rgba(255, 255, 255, 0.8);
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            z-index: 1000;
            transition: all 0.3s;
        `;
        
        // Track toggle state
        let currentTrack = 'default';
        let isChangingTrack = false;
        
        // Toggle between tracks on click
        switcherButton.addEventListener('click', async () => {
            // Prevent multiple clicks during track change
            if (isChangingTrack) {
                console.log('[DEBUG] Track change already in progress, ignoring click');
                return;
            }
            
            try {
                isChangingTrack = true;
                switcherButton.disabled = true;
                switcherButton.style.opacity = '0.5';
                
                if (currentTrack === 'default') {
                    currentTrack = 'silverstone';
                    switcherButton.innerHTML = '🔄 Loading Silverstone...';
                    await this.changeTrack('silverstone');
                    switcherButton.innerHTML = '🏎️ Track: Silverstone';
                } else {
                    currentTrack = 'default';
                    switcherButton.innerHTML = '🔄 Loading Default...';
                    await this.changeTrack('default');
                    switcherButton.innerHTML = '🏁 Track: Default';
                }
            } catch (error) {
                console.error('[DEBUG] Error changing track:', error);
                alert(`Failed to change track: ${error.message}`);
                // Reset to previous state on error
                currentTrack = currentTrack === 'default' ? 'silverstone' : 'default';
                switcherButton.innerHTML = currentTrack === 'default' ? '🏁 Track: Default' : '🏎️ Track: Silverstone';
            } finally {
                isChangingTrack = false;
                switcherButton.disabled = false;
                switcherButton.style.opacity = '1';
            }
        });
        
        // Add hover effect
        switcherButton.addEventListener('mouseover', () => {
            if (!isChangingTrack) {
                switcherButton.style.backgroundColor = 'rgba(255, 255, 255, 1)';
            }
        });
        
        switcherButton.addEventListener('mouseout', () => {
            if (!isChangingTrack) {
                switcherButton.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            }
        });
        
        document.body.appendChild(switcherButton);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    updateCamera() {
        const carPosition = this.car.getPosition();
        const carDirection = this.car.getDirection();
        
        switch (this.cameraMode) {
            case 'follow':
                // Standard follow camera
                this.camera.position.x = carPosition.x - carDirection.x * 15;
                this.camera.position.y = carPosition.y + 7;
                this.camera.position.z = carPosition.z - carDirection.z * 15;
                
                this.camera.lookAt(
                    carPosition.x + carDirection.x * 10,
                    carPosition.y + 2,
                    carPosition.z + carDirection.z * 10
                );
                break;
                
            case 'top':
                // Bird's eye view (Vogelperspektive)
                this.camera.position.x = carPosition.x;
                this.camera.position.y = carPosition.y + 50;
                this.camera.position.z = carPosition.z;
                
                this.camera.lookAt(carPosition);
                break;
                
            case 'cockpit':
                // First-person view from car cockpit
                this.camera.position.x = carPosition.x + carDirection.x * 0.5;
                this.camera.position.y = carPosition.y + 1.5;
                this.camera.position.z = carPosition.z + carDirection.z * 0.5;
                
                this.camera.lookAt(
                    carPosition.x + carDirection.x * 10,
                    carPosition.y + 1.5,
                    carPosition.z + carDirection.z * 10
                );
                break;
                
            case 'side':
                // Side view
                const sideVector = new THREE.Vector3(-carDirection.z, 0, carDirection.x).normalize();
                this.camera.position.x = carPosition.x + sideVector.x * 15;
                this.camera.position.y = carPosition.y + 5;
                this.camera.position.z = carPosition.z + sideVector.z * 15;
                
                this.camera.lookAt(carPosition);
                break;
        }
    }
    
    updateHUD() {
        if (this.isGameRunning) {
            // Get absolute speed and convert m/s to km/h
            const speed = Math.round(this.car.getAbsoluteSpeed() * 3.6);
            
            // Show direction indicator (R for reverse)
            const direction = this.car.isInReverse() ? 'R' : 'D';
            
            // Add color to direction indicator
            const directionColor = this.car.isInReverse() ? 'red' : 'green';
            
            // Safely update speed element
            const speedElement = document.getElementById('speed');
            if (speedElement) {
                speedElement.innerHTML = `Speed: ${speed} km/h <span style="color: ${directionColor};">(${direction})</span>`;
            }
            
            const time = Math.floor(this.clock.getElapsedTime());
            const minutes = Math.floor(time / 60).toString().padStart(2, '0');
            const seconds = (time % 60).toString().padStart(2, '0');
            
            // Safely update time element
            const timeElement = document.getElementById('time');
            if (timeElement) {
                timeElement.textContent = `Time: ${minutes}:${seconds}`;
            }
        }
    }
    
    update(deltaTime) {
        // Skip updates that would take too long to process
        if (deltaTime > 0.1) {
            console.warn(`[PERFORMANCE] Skipping large delta update: ${deltaTime.toFixed(3)}s`);
            return;
        }
        
        if (!this.gameInitialized) {
            console.warn('[DEBUG] Update called before game initialization!');
            return;
        }
        
        const delta = this.clock.getDelta();
        
        if (this.isGameRunning) {
            // Update local car
            this.car.update(delta);
            
            // Throttle expensive operations based on performance mode
            const now = performance.now();
            const boundaryCheckInterval = this.performanceMode ? 100 : 33; // 30fps in normal mode, 10fps in performance mode
            const checkpointCheckInterval = this.performanceMode ? 200 : 100; // 10fps or 5fps
            
            // Broadcast our position in multiplayer mode
            if (this.isMultiplayer && this.multiplayer && this.multiplayer.isConnected && this.car) {
                const state = {
                    position: this.car.getPosition(),
                    rotation: this.car.getRotation()
                };
                this.multiplayer.broadcastState(state);
            }
            
            // Check track collision for car with throttling
            if (this.track && now - this.lastBoundaryCheckTime > boundaryCheckInterval) {
                this.lastBoundaryCheckTime = now;
                
                // Use the track's collision detection if available
                if (typeof this.track.checkCollision === 'function') {
                    // Legacy method support
                    if (this.track.checkCollision(this.car.position)) {
                        this.handleCarCollision();
                    }
                } else if (typeof this.track.isPointInsideTrack === 'function') {
                    // New method - check if NOT inside track
                    if (!this.track.isPointInsideTrack(this.car.position)) {
                        this.handleCarCollision();
                    }
                }
            }
            
            // Check checkpoint and lap progress with throttling
            if (now - this.lastCheckpointCheckTime > checkpointCheckInterval) {
                this.lastCheckpointCheckTime = now;
                this.checkRaceProgress();
            }
            
            // Update items and check for collisions
            if (this.itemManager) {
                this.itemManager.update(delta);
                this.itemManager.checkCollisions(this.car);
            }
            
            // Update airplane if it exists
            if (this.airplane) {
                this.airplane.update(delta);
            }
            
            // Update AI cars and ensure they exist
            if (this.aiManager) {
                this.aiManager.update(delta);
                
                // Check if we need to spawn AI cars
                if (this.aiManager.aiCars.length === 0 && !this.isMultiplayer) {
                    // No AI cars found in single player mode, create them now after the game has started
                    console.log('[DEBUG] No AI cars detected in update loop, spawning 5 new AI cars');
                    this.aiManager.spawnRandomAICars(5);
                    
                    // Log the newly created cars
                    setTimeout(() => {
                        console.log(`[DEBUG] After respawn: ${this.aiManager.aiCars.length} AI cars`);
                        
                        // Check if AI cars are in the scene
                        let aiCarsInScene = 0;
                        this.scene.traverse(obj => {
                            if (obj.userData && obj.userData.isAICar) {
                                aiCarsInScene++;
                            }
                        });
                        console.log(`[DEBUG] AI cars detected in scene: ${aiCarsInScene}`);
                        
                        // Show notification to the user
                        if (this.aiManager.aiCars.length > 0) {
                            this.showNotification(`${this.aiManager.aiCars.length} AI cars have joined the race! 🏎️`);
                        }
                        
                        // Update the user counter with AI car count
                        if (window.userCounter) {
                            window.userCounter.updateAICars(this.aiManager.aiCars.length);
                        }
                    }, 500);
                } else if (this.aiManager.aiCars.length === 0 && this.isMultiplayer) {
                    // If we're in multiplayer with no cars, check maxAICars
                    if (this.aiManager.maxAICars > 0) {
                        // Only spawn AI cars if maxAICars > 0 (not a private room)
                        console.log(`[DEBUG] Multiplayer with maxAICars=${this.aiManager.maxAICars}, spawning AI cars`);
                        const aiCount = Math.min(2, this.aiManager.maxAICars);
                        if (aiCount > 0) {
                            this.aiManager.spawnRandomAICars(aiCount);
                        }
                    } else {
                        console.log('[DEBUG] No AI cars will be spawned (maxAICars=0, likely a private room)');
                    }
                } else {
                    // Update user counter with current AI car count every few seconds
                    const now = performance.now();
                    if (!this._lastUserCounterUpdate || now - this._lastUserCounterUpdate > 3000) {
                        if (window.userCounter) {
                            window.userCounter.updateAICars(this.aiManager.aiCars.length);
                        }
                        this._lastUserCounterUpdate = now;
                    }
                }
                
                // Ensure AI cars are updated and correctly positioned
                for (const aiCar of this.aiManager.aiCars) {
                    if (aiCar && aiCar.mesh) {
                        // Make sure the mesh is in the scene
                        if (!this.scene.getObjectById(aiCar.mesh.id)) {
                            console.log(`[DEBUG] Adding missing AI car mesh to scene: ${aiCar.playerName}`);
                            this.scene.add(aiCar.mesh);
                        }
                        
                        // Ensure name tag is visible
                        if (aiCar.nameTag) {
                            aiCar.nameTag.lookAt(this.camera.position);
                        }
                    }
                }
            }
            
            // Update track and its elements
            if (this.track) {
                this.track.update(delta);
            }
            
            // Update remote cars
            this.remotePlayers.forEach((remoteCar) => {
                remoteCar.update(delta);
            });
            
            // Update camera
            this.updateCamera();
            
            // Update HUD
            this.updateHUD();
            
            // Render scene
            this.renderer.render(this.scene, this.camera);
        }
    }

    // Add multiplayer methods
    async startMultiplayerGame(playerName, isPrivate = false) {
        try {
            console.log(`[DEBUG] Starting multiplayer game - playerName: ${playerName}, isPrivate: ${isPrivate}`);
            
            const { MultiplayerManager } = await import('./multiplayer/MultiplayerManager.js');
            this.isMultiplayer = true;
            this.multiplayer = new MultiplayerManager(this);
            const roomId = await this.multiplayer.createRoom(playerName, isPrivate);
            this.playerName = playerName;
            
            console.log(`[DEBUG] Room created with ID: ${roomId}`);
            
            // Set multiplayer mode on track if it exists
            if (this.track) {
                this.track.setMultiplayerMode(true);
            }
            
            // Handle AI cars based on room type
            if (this.aiManager) {
                if (isPrivate) {
                    // For private rooms (Play with Friends), completely disable AI cars
                    console.log('[DEBUG] Private room detected - disabling all AI cars');
                    this.aiManager.disableForPrivateRoom();
                    
                    // Extra safety by forcing these properties
                    this.aiManager.maxAICars = 0;
                    this.aiManager._forceDisabled = true;
                    this.aiManager._isPrivateRoom = true;
                    
                    // Force remove any AI cars that may have been created
                    this.aiManager.removeAllAICars();
                    
                    // IMPORTANT: Do NOT start the race right away for private rooms
                    // The UI flow for private rooms is:
                    // 1. Create Room (we're here)
                    // 2. Share room code with friends (handled by FriendsRoomUI)
                    // 3. When player clicks "Start Game" button, the game initializes (startGame method)
                    // 4. The game immediately shows the waiting room (in startGame method)
                    // 5. When host clicks "Start Race" button in waiting room, race starts
                    console.log('[DEBUG] Private room created but NOT starting race yet');
                } else {
                    // For public rooms, limit the number of AI cars
                    this.aiManager.setMultiplayerMode(true);
                    this.aiManager.maxAICars = 3; // Fewer AI cars in multiplayer
                    
                    // Start race immediately for public rooms
                    this.isRaceStarted = true;
                    if (this.car) {
                        this.car.enableControls();
                    }
                    this.lapStartTime = performance.now();
                }
            }
            
            return roomId;
        } catch (error) {
            console.error('Failed to start multiplayer game:', error);
            throw error;
        }
    }

    async joinMultiplayerGame(roomId, playerName) {
        try {
            const { MultiplayerManager } = await import('./multiplayer/MultiplayerManager.js');
            this.isMultiplayer = true;
            this.multiplayer = new MultiplayerManager(this);
            await this.multiplayer.connect(roomId, playerName);
            this.playerName = playerName;
            
            // Set multiplayer mode on track if it exists
            if (this.track) {
                this.track.setMultiplayerMode(true);
            }
            
            // Check if this is a private room (roomId starts with 'private-')
            const isPrivateRoom = roomId.startsWith('private-');
            
            // Set multiplayer mode on AIManager if it exists
            if (this.aiManager) {
                console.log('[DEBUG] Setting AIManager to multiplayer mode with current cars:', this.aiManager.aiCars.length);
                this.aiManager.setMultiplayerMode(true);
                
                if (isPrivateRoom) {
                    // For private rooms, completely disable AI cars
                    console.log('[DEBUG] Joined private room - disabling all AI cars');
                    this.aiManager.disableForPrivateRoom();
                    
                    // Extra safety by forcing these properties
                    this.aiManager.maxAICars = 0;
                    this.aiManager._forceDisabled = true;
                    this.aiManager._isPrivateRoom = true;
                    
                    // Force remove any AI cars that may have been created
                    this.aiManager.removeAllAICars();
                    
                    // For private rooms, don't start the race right away - show waiting room instead
                    this.isRaceStarted = false;
                    if (this.car) {
                        this.car.disableControls();
                    }
                    
                    // Show waiting room UI for private rooms
                    this.showWaitingRoom();
                } else {
                    // For public rooms, ensure we have some AI cars
                    console.log('[DEBUG] After setting multiplayer mode, AI cars count:', this.aiManager.aiCars.length);
                    
                    // Explicitly check if we need to spawn AI cars for this session
                    if (this.aiManager.aiCars.length === 0) {
                        console.log('[DEBUG] No AI cars found after joining multiplayer, ensuring some are created');
                        const aiCount = Math.min(2, this.aiManager.maxAICars);
                        this.aiManager.spawnRandomAICars(aiCount);
                        console.log('[DEBUG] Spawned', aiCount, 'AI cars for multiplayer');
                    }
                    
                    // Start race immediately for public rooms
                    this.isRaceStarted = true;
                    if (this.car) {
                        this.car.enableControls();
                    }
                    this.lapStartTime = performance.now();
                }
            }
            
            // Connect the ItemManager to multiplayer
            if (this.itemManager && this.multiplayer) {
                console.log('[DEBUG] Connecting ItemManager to multiplayer');
                this.itemManager.multiplayer = this.multiplayer;
                this.itemManager.setupNetworkHandlers();
            }
        } catch (error) {
            console.error('Failed to join multiplayer game:', error);
            throw error;
        }
    }

    // Add this function to check the scene for car objects
    countSceneCars() {
        const cars = [];
        this.scene.traverse(object => {
            if (object.userData && object.userData.carInstanceId) {
                cars.push({
                    id: object.userData.carInstanceId,
                    meshId: object.id,
                    isVisible: object.visible,
                    position: object.position.toArray()
                });
            }
        });
        return cars;
    }
    
    // Add notification banner system at the top of the class
    showNotification(message, duration = 3000) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 16px;
            z-index: 1000;
            transition: opacity 0.3s;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        // Fade out and remove after duration
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, duration);
    }

    // Modify addRemotePlayer to accept playerName
    async addRemotePlayer(peerId, playerName, position = null, rotation = null) {
        console.log(`[GAME] Adding remote player: ${playerName}`);
        
        // First, safely remove any existing player
        if (this.remotePlayers.has(peerId)) {
            await this.removeRemotePlayer(peerId);
        }
        
        // Create remote car instance
        const remoteCar = new Car(this.scene, this.track, true);
        
        // Store initialization promise for safety
        remoteCar.initPromise = (async () => {
            try {
                // Set initial properties
                remoteCar.setPlayerName(playerName);
                
                // Assign color based on peerId
                const hashCode = Array.from(peerId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const colors = [0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
                const colorIndex = Math.abs(hashCode) % colors.length;
                remoteCar.setCarColor(colors[colorIndex]);
                
                // Set initial position with offset
                remoteCar.position = position || new THREE.Vector3(
                    this.track.trackRadius + (Math.random() * 2 - 1) * 5,
                    0.5,
                    (Math.random() * 2 - 1) * 5
                );
                remoteCar.rotation = rotation || 0;
                
                // Initialize the car
                await remoteCar.init();
                
                // Safety check: ensure player hasn't disconnected during initialization
                if (!this.remotePlayers.has(peerId)) {
                    throw new Error('Player disconnected during initialization');
                }
                
                // Safety check: ensure this is still the current car for this peer
                if (this.remotePlayers.get(peerId) !== remoteCar) {
                    throw new Error('Car was replaced during initialization');
                }
                
                // Set name again after initialization for visibility
                remoteCar.setPlayerName(playerName);
                
                // Verify and add mesh to scene if needed
                if (remoteCar.mesh && !this.scene.getObjectById(remoteCar.mesh.id)) {
                    this.scene.add(remoteCar.mesh);
                }
                
                return remoteCar;
            } catch (error) {
                console.error(`[GAME] Failed to initialize remote player ${peerId}:`, error);
                // Clean up on failure
                if (remoteCar.mesh) {
                    this.scene.remove(remoteCar.mesh);
                }
                this.remotePlayers.delete(peerId);
                throw error;
            }
        })();
        
        try {
            // Add to players map first so it can be found during initialization
            this.remotePlayers.set(peerId, remoteCar);
            
            // Wait for initialization to complete
            await remoteCar.initPromise;
            
            // Show join notification only after successful initialization
            this.showNotification(`${playerName} joined the race! 🏎️`);
            
            return remoteCar;
        } catch (error) {
            // Final cleanup if something went wrong
            this.remotePlayers.delete(peerId);
            throw error;
        }
    }

    // Modify removeRemotePlayer to show leave notification
    async removeRemotePlayer(peerId) {
        const remoteCar = this.remotePlayers.get(peerId);
        if (remoteCar) {
            // Show leave notification with the player's name
            const playerName = remoteCar.playerName || `Player ${peerId.slice(0, 4)}`;
            this.showNotification(`${playerName} left the race 👋`);
        }
        
        console.log(`[GAME][${peerId}] 🗑️ REMOVING REMOTE PLAYER at ${new Date().toISOString()}`);
        
        if (!remoteCar) {
            console.warn(`[GAME][${peerId}] ⚠️ Not found in remotePlayers map`);
            return;
        }
        
        // Wait for any pending initialization to complete
        if (remoteCar.initPromise) {
            try {
                await remoteCar.initPromise;
            } catch (error) {
                console.warn(`[GAME][${peerId}] Error waiting for initialization:`, error);
            }
        }
        
        console.log(`[GAME][${peerId}] Found car object to remove`);
        
        // Remove the mesh from the scene
        if (remoteCar.mesh) {
            console.log(`[GAME][${peerId}] Removing mesh from scene, id: ${remoteCar.mesh.id}`);
            
            // Disconnect all resources
            if (remoteCar.wheels && remoteCar.wheels.length > 0) {
                remoteCar.wheels.forEach((wheel, index) => {
                    if (wheel && wheel.parent) {
                        console.log(`[GAME][${peerId}] Removing wheel ${index}`);
                        wheel.parent.remove(wheel);
                        if (wheel.geometry) wheel.geometry.dispose();
                        if (wheel.material) wheel.material.dispose();
                    }
                });
                remoteCar.wheels = [];
            }
            
            // Remove name tag
            if (remoteCar.nameTag) {
                if (remoteCar.nameTag.parent) {
                    console.log(`[GAME][${peerId}] Removing name tag`);
                    remoteCar.nameTag.parent.remove(remoteCar.nameTag);
                }
                if (remoteCar.nameTag.material) remoteCar.nameTag.material.dispose();
                remoteCar.nameTag = null;
            }
            
            // Remove car body mesh and dispose of resources
            this.scene.remove(remoteCar.mesh);
            if (remoteCar.mesh.geometry) remoteCar.mesh.geometry.dispose();
            if (remoteCar.mesh.material) {
                if (Array.isArray(remoteCar.mesh.material)) {
                    remoteCar.mesh.material.forEach(mat => mat.dispose());
                } else {
                    remoteCar.mesh.material.dispose();
                }
            }
            remoteCar.mesh = null;
        }
        
        // Remove from remotePlayers map
        this.remotePlayers.delete(peerId);
        
        // Track car removal
        this.remoteCarsRemoved++;
        console.log(`[GAME][${peerId}] Total cars removed during game: ${this.remoteCarsRemoved}`);
        
        // Force a scene update
        this.renderer.renderLists.dispose();
        
        console.log(`[GAME][${peerId}] ✅ FINISHED REMOVING REMOTE PLAYER`);
    }

    updateRemotePlayer(peerId, position, rotation) {
        // Check if this remote player exists
        if (!this.remotePlayers.has(peerId)) {
            console.warn(`[GAME][${peerId}] ⚠️ Cannot update - not found in remotePlayers map`);
            return;
        }

        const remoteCar = this.remotePlayers.get(peerId);
        
        // Wait for initialization if needed
        if (remoteCar.initPromise && !remoteCar.mesh) {
            console.log(`[GAME][${peerId}] Waiting for initialization before updating position`);
            remoteCar.initPromise.then(() => {
                this.updateRemotePlayer(peerId, position, rotation);
            });
            return;
        }
        
        // Ensure position is a Vector3
        if (!position.isVector3) {
            // If position is an array
            if (Array.isArray(position)) {
                position = new THREE.Vector3(position[0], position[1], position[2]);
            } 
            // If position is an object with x, y, z properties
            else if (position.x !== undefined && position.y !== undefined && position.z !== undefined) {
                position = new THREE.Vector3(position.x, position.y, position.z);
            } else {
                console.error(`[GAME][${peerId}] Invalid position format:`, position);
                return;
            }
        }
        
        // Ensure remoteCar.position is a Vector3
        if (!remoteCar.position || !remoteCar.position.isVector3) {
            console.log(`[GAME][${peerId}] Initializing car position as Vector3`);
            remoteCar.position = new THREE.Vector3();
        }
        
        // Update the car's position and rotation
        remoteCar.position.copy(position);
        remoteCar.rotation = rotation;
        
        // Update the car's direction based on rotation
        remoteCar.direction = new THREE.Vector3(
            Math.sin(rotation),
            0,
            Math.cos(rotation)
        );
        
        // Update mesh position and rotation if it exists
        if (remoteCar.mesh) {
            remoteCar.mesh.position.copy(position);
            remoteCar.mesh.rotation.y = rotation;
            
            // Update name tag position if it exists
            if (remoteCar.nameTag) {
                remoteCar.nameTag.position.set(0, 3, 0);
                remoteCar.nameTag.lookAt(this.camera.position);
                // Keep name tag upright
                remoteCar.nameTag.rotation.x = 0;
                remoteCar.nameTag.rotation.z = 0;
            }
            
            // Update wheels
            if (remoteCar.wheels && remoteCar.wheels.length > 0) {
                remoteCar.updateWheels();
            }
            
            // Force a render update
            this.needsRender = true;
        } else {
            console.warn(`[GAME][${peerId}] ⚠️ No mesh available for position update`);
        }
    }

    cleanup() {
        console.log('[DEBUG] Cleaning up game resources');
        
        // Dispose of multiplayer connections
        if (this.multiplayer) {
            this.multiplayer.disconnect();
            this.multiplayer = null;
        }
        
        this.isMultiplayer = false;
        
        // Update track multiplayer mode
        if (this.track) {
            this.track.setMultiplayerMode(false);
        }
        
        // Remove event listeners
        window.removeEventListener('resize', this.onWindowResizeBound);
        window.removeEventListener('keydown', this.onKeyDownBound);
        window.removeEventListener('keyup', this.onKeyUpBound);
        
        // Dispose of the controls
        if (this.controls) {
            this.controls.dispose();
        }
        
        // Dispose of the car
        if (this.car) {
            // Car cleanup logic if needed
        }
        
        // Remove all remote cars
        this.removeAllRemoteCars();
        
        // Stop the animation loop
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // Clean up ItemManager if it exists
        if (this.itemManager) {
            this.itemManager.dispose();
            this.itemManager = null;
        }
        
        // Clean up Three.js resources
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.scene) {
            this.scene.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        }
        
        console.log('[DEBUG] Cleaning up game resources completed');
    }

    setupDebugCommands() {
        window.racingCartDebug = {
            getState: () => {
                if (!this.isMultiplayer || !this.multiplayer) {
                    console.log('Multiplayer not active');
                    return { 
                        isMultiplayer: false,
                        remotePlayers: Array.from(this.remotePlayers.keys())
                    };
                }
                
                const state = this.multiplayer.getDebugState();
                console.table({
                    peers: `${state.peersCount} - ${state.peersList.join(', ')}`,
                    remotePlayers: `${state.remotePlayersCount} - ${state.remotePlayersList.join(', ')}`,
                    webrtcConnections: `${state.webrtcConnectionsCount} - ${state.webrtcConnectionsList.join(', ')}`,
                    dataChannels: `${state.dataChannelsCount} - ${state.dataChannelsList.join(', ')}`
                });
                
                return state;
            },
            
            cleanupGhostCars: () => {
                console.log('[DEBUG] Cleaning up ghost cars...');
                
                // First detect ghost cars - cars that exist in remotePlayers but not in peers
                if (this.isMultiplayer && this.multiplayer) {
                    const remoteCars = new Set(this.remotePlayers.keys());
                    const peers = new Set(this.multiplayer.peers.keys());
                    
                    // Find cars that don't have corresponding peers
                    const ghostCars = [...remoteCars].filter(carId => !peers.has(carId));
                    
                    console.log(`[DEBUG] Found ${ghostCars.length} ghost cars`);
                    ghostCars.forEach(carId => {
                        console.log(`[DEBUG] Removing ghost car: ${carId}`);
                        this.removeRemotePlayer(carId);
                    });
                    
                    return ghostCars;
                } else {
                    // If not in multiplayer, just remove all remote cars
                    const allCars = Array.from(this.remotePlayers.keys());
                    allCars.forEach(carId => {
                        this.removeRemotePlayer(carId);
                    });
                    return allCars;
                }
            },
            
            logScene: () => {
                // Log all objects in the scene
                console.log('[DEBUG] Scene objects:');
                this.scene.traverse(obj => {
                    console.log(`[DEBUG] ${obj.type} - ID: ${obj.id}, Name: ${obj.name}`);
                });
                return this.scene.children.length;
            },
            
            checkConnectionHealth: () => {
                if (!this.isMultiplayer || !this.multiplayer) {
                    console.log('[DEBUG] Multiplayer not active');
                    return { isMultiplayer: false };
                }
                
                return this.multiplayer.checkConnectionHealth();
            },
            
            forceReconnect: () => {
                if (!this.isMultiplayer || !this.multiplayer) {
                    console.log('[DEBUG] Multiplayer not active');
                    return false;
                }
                
                // First clean up any ghost cars
                this.racingCartDebug.cleanupGhostCars();
                
                // Disconnect and reconnect multiplayer
                const roomId = this.multiplayer.roomId;
                const playerName = "Player"; // Use default name if needed
                
                console.log('[DEBUG] Forcing reconnection to room:', roomId);
                
                // Disconnect current multiplayer
                this.multiplayer.disconnect();
                
                // Reconnect with same room ID
                setTimeout(() => {
                    this.joinMultiplayerGame(roomId, playerName);
                    console.log('[DEBUG] Reconnection initiated');
                }, 1000);
                
                return true;
            },
            
            // Add a new method to count all cars in the scene
            countCars: () => {
                const cars = this.countSceneCars();
                console.log('[DEBUG] Cars in scene:', cars);
                
                // Count how many of each type
                const remoteCars = cars.filter(car => {
                    const obj = this.scene.getObjectById(car.meshId);
                    return obj && obj.userData && obj.userData.isRemote;
                });
                
                console.log(`[DEBUG] Found ${cars.length} total cars in scene (${remoteCars.length} remote)`);
                console.log(`[DEBUG] Car tracking stats: Added=${this.remoteCarsAdded}, Removed=${this.remoteCarsRemoved}`);
                
                return {
                    total: cars.length,
                    remote: remoteCars.length,
                    details: cars,
                    added: this.remoteCarsAdded,
                    removed: this.remoteCarsRemoved
                };
            },
            
            // Add a function to kill all remote cars
            resetAllCars: () => {
                console.log('[DEBUG] Resetting all cars...');
                
                // Remove all remote players
                Array.from(this.remotePlayers.keys()).forEach(id => {
                    this.removeRemotePlayer(id);
                });
                
                // Find and remove any orphaned car objects in the scene
                const orphanedCars = [];
                this.scene.traverse(object => {
                    if (object.userData && object.userData.carInstanceId) {
                        orphanedCars.push(object);
                    }
                });
                
                console.log(`[DEBUG] Found ${orphanedCars.length} orphaned car objects in scene`);
                orphanedCars.forEach(car => {
                    console.log(`[DEBUG] Removing orphaned car: ${car.userData.carInstanceId}`);
                    this.scene.remove(car);
                });
                
                return {
                    removedPlayers: this.remotePlayers.size,
                    removedOrphans: orphanedCars.length
                };
            }
        };
        
        console.log('[DEBUG] Debug commands available:');
        console.log('- window.racingCartDebug.getState() - See current state');
        console.log('- window.racingCartDebug.cleanupGhostCars() - Remove ghost cars');
        console.log('- window.racingCartDebug.logScene() - Log all scene objects');
        console.log('- window.racingCartDebug.checkConnectionHealth() - Check WebRTC connections');
        console.log('- window.racingCartDebug.forceReconnect() - Force reconnection to room');
        console.log('- window.racingCartDebug.countCars() - Count all cars in the scene');
        console.log('- window.racingCartDebug.resetAllCars() - Reset all remote cars');
    }

    // Clean up all resources and reset the scene
    cleanupScene() {
        console.log("[DEBUG] Performing deep scene cleanup");
        
        // Keep track of objects to preserve
        const preserveObjects = [];
        
        // Always preserve camera, lights, and cars
        this.scene.traverse(object => {
            // Essential scene elements
            if (
                object instanceof THREE.Camera ||
                object instanceof THREE.AmbientLight ||
                object instanceof THREE.DirectionalLight ||
                object instanceof THREE.HemisphereLight
            ) {
                preserveObjects.push(object);
                return;
            }
            
            // Preserve the player's car
            if (this.car && this.car.mesh) {
                if (
                    object === this.car.mesh || 
                    (object.parent === this.car.mesh) ||
                    (object.userData && object.userData.carInstanceId === this.car.id)
                ) {
                    preserveObjects.push(object);
                    return;
                }
            }
            
            // Preserve remote player cars
            if (this.remotePlayers && this.remotePlayers.size > 0) {
                for (const remoteCar of this.remotePlayers.values()) {
                    if (remoteCar.mesh && (
                        object === remoteCar.mesh || 
                        (object.parent === remoteCar.mesh) ||
                        (object.userData && object.userData.carInstanceId === remoteCar.id)
                    )) {
                        preserveObjects.push(object);
                        return;
                    }
                }
            }
        });
        
        console.log(`[DEBUG] Found ${preserveObjects.length} essential objects to preserve`);
        
        // Temporary remove essential objects from scene to avoid them being cleared
        preserveObjects.forEach(obj => {
            if (obj.parent === this.scene) {
                this.scene.remove(obj);
            }
        });
        
        // First method: Use while loop to remove all remaining children
        const childCount = this.scene.children.length;
        console.log(`[DEBUG] Removing ${childCount} objects from scene`);
        
        // Use the direct approach to clear all remaining children
        const objectsToRemove = [...this.scene.children]; // Create a copy of the array
        objectsToRemove.forEach(obj => {
            this.disposeObject(obj);
            this.scene.remove(obj);
        });
        
        // Alternative method using apply (commented out - could be used instead)
        // if (this.scene.children.length > 0) {
        //     console.log(`[DEBUG] Using scene.remove.apply to remove ${this.scene.children.length} objects`);
        //     this.scene.children.forEach(obj => this.disposeObject(obj));
        //     this.scene.remove.apply(this.scene, this.scene.children);
        // }
        
        // Make sure the scene is actually empty now
        if (this.scene.children.length > 0) {
            console.log(`[DEBUG] Warning: Scene still has ${this.scene.children.length} children after cleanup`);
            console.log(this.scene.children);
        }
        
        // Add back the essential objects
        preserveObjects.forEach(obj => {
            if (obj.parent === null) {
                this.scene.add(obj);
            }
        });
        
        console.log(`[DEBUG] Restored ${preserveObjects.length} essential objects`);
        
        // Force a Three.js garbage collection
        if (this.renderer) {
            this.renderer.renderLists.dispose();
        }
    }
    
    // Helper to recursively dispose of object resources
    disposeObject(object) {
        if (!object) return;
        
        // Log what we're disposing
        console.log(`[DEBUG] Disposing: ${object.name || object.type || 'unnamed object'}`);
        
        // Recursively dispose of children
        if (object.children && object.children.length > 0) {
            // Create a copy of children array since we'll be modifying it
            const children = [...object.children];
            for (const child of children) {
                this.disposeObject(child);
            }
        }
        
        // Dispose of geometry
        if (object.geometry) {
            object.geometry.dispose();
        }
        
        // Dispose of materials
        if (object.material) {
            if (Array.isArray(object.material)) {
                for (const material of object.material) {
                    if (material.map) material.map.dispose();
                    if (material.lightMap) material.lightMap.dispose();
                    if (material.bumpMap) material.bumpMap.dispose();
                    if (material.normalMap) material.normalMap.dispose();
                    if (material.specularMap) material.specularMap.dispose();
                    if (material.envMap) material.envMap.dispose();
                    material.dispose();
                }
            } else {
                if (object.material.map) object.material.map.dispose();
                if (object.material.lightMap) object.material.lightMap.dispose();
                if (object.material.bumpMap) object.material.bumpMap.dispose();
                if (object.material.normalMap) object.material.normalMap.dispose();
                if (object.material.specularMap) object.material.specularMap.dispose();
                if (object.material.envMap) object.material.envMap.dispose();
                object.material.dispose();
            }
        }
        
        // Check for any specific type of object that might need special handling
        if (object.isSprite) {
            object.material.dispose();
        }
        
        // Remove from parent
        if (object.parent) {
            object.parent.remove(object);
        }
    }

    /**
     * Change the current track
     * This now completely recreates the Three.js scene to ensure a clean state
     */
    async changeTrack(trackId) {
        console.log(`Changing track to: ${trackId}`);
        
        try {
            // Show loading indicator
            this.showLoadingIndicator('Changing track...');
            
            // Save current game state that we need to preserve
            const carType = this.car ? this.car.type : 'default';
            const playerName = this.playerName;
            const cameraMode = this.cameraMode;
            const isMultiplayer = this.isMultiplayer;
            const remotePlayers = this.remotePlayers ? [...this.remotePlayers] : [];
            
            // Clean up old track resources
            if (this.track) {
                console.log('[DEBUG] Cleaning up old track resources');
                // Safely call cleanup method if it exists
                if (typeof this.track.cleanup === 'function') {
                    this.track.cleanup();
                } else if (typeof this.track.clearTrack === 'function') {
                    // Try alternative cleanup method if available
                    this.track.clearTrack();
                } else {
                    console.log('[DEBUG] No cleanup method found on track, skipping cleanup');
                }
            }
            
            // Clear lap and race state
            this.resetGameState();
            
            // Store renderer settings before disposing
            const oldSize = {
                width: this.renderer ? this.renderer.domElement.width : window.innerWidth,
                height: this.renderer ? this.renderer.domElement.height : window.innerHeight
            };
            
            // Stop animation loop
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            
            // Dispose of current renderer
            console.log('[DEBUG] Disposing of old renderer and clearing scene');
            if (this.renderer) {
                this.renderer.dispose();
            }
            
            // Remove old game container
            if (this.container && this.container.parentNode) {
                console.log('[DEBUG] Removing old game container');
                this.container.parentNode.removeChild(this.container);
            }
            
            // Create fresh scene and objects
            console.log('[DEBUG] Creating new scene and renderer');
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x87CEEB); // Sky blue background
            
            // Setup lighting
            this.setupLighting();
            
            // Create new renderer
            this.setupRenderer(oldSize.width, oldSize.height);
            
            // Create new game container
            this.container = document.createElement('div');
            this.container.id = 'game-container';
            this.container.style.position = 'fixed';
            this.container.style.top = '0';
            this.container.style.left = '0';
            this.container.style.width = '100%';
            this.container.style.height = '100%';
            document.body.appendChild(this.container);
            this.container.appendChild(this.renderer.domElement);
            
            // Create new track instance based on track ID
            console.log(`[DEBUG] Creating new track: ${trackId}`);
            this.track = this.createTrackInstance(trackId);
            await this.track.init();
            
            // Add the track's audio listener to the camera if it exists
            if (this.track.audioListener) {
                // Check if the listener is already attached to the camera
                const existingListeners = this.camera.children.filter(child => child instanceof THREE.AudioListener);
                if (existingListeners.length === 0) {
                    this.camera.add(this.track.audioListener);
                    console.log('[DEBUG] Audio listener attached to camera');
                } else {
                    console.log('[DEBUG] Camera already has an audio listener');
                }
            }
            
            // Ensure car is created if needed
            if (!this.car) {
                console.log('[DEBUG] Creating new car');
                this.createCar(carType);
            } else {
                console.log('[DEBUG] Repositioning existing car');
                // Get start position from the track
                const startPos = this.track.getStartPosition();
                // Update car position and rotation based on the track's start position
                this.car.setPosition(startPos.position);
                this.car.setRotation(startPos.rotation);
                
                // Also update the car's direction vector based on rotation
                const rotation = startPos.rotation;
                const directionX = Math.sin(rotation);
                const directionZ = Math.cos(rotation);
                this.car.direction = new THREE.Vector3(directionX, 0, directionZ);
                
                console.log(`[DEBUG] Car positioned at: x:${startPos.position.x.toFixed(2)}, y:${startPos.position.y.toFixed(2)}, z:${startPos.position.z.toFixed(2)}, rotation:${startPos.rotation.toFixed(2)}`);
            }
            
            // Setup controls
            this.setupControls(this.car);
            
            // Reset camera
            this.setupCamera();
            this.setCameraMode(cameraMode || 'follow');
            
            // Restore player name
            this.playerName = playerName;
            
            // Reset multiplayer state if applicable
            if (isMultiplayer) {
                console.log('[DEBUG] Restoring multiplayer state');
                this.setMultiplayerMode(true);
                
                // Recreate remote players if needed
                remotePlayers.forEach(player => {
                    if (player.id !== this.playerId) {
                        this.addRemotePlayer(player.id, player.name, player.car ? player.car.position : null, player.car ? player.car.rotation : null);
                    }
                });
            }
            
            // Recreate UI elements
            console.log("[DEBUG] Recreating UI elements");
            this.addCarSwitcher();
            this.addCameraSwitcher();
            this.addTrackSelector();
            
            // Notify AI manager of track change
            if (this.aiManager) {
                console.log("[DEBUG] Notifying AI manager of track change");
                this.aiManager.onTrackChanged(this.track);
            }
            
            // Reattach window resize event
            window.addEventListener('resize', () => this.onWindowResize());
            
            // Start animation loop
            this.animate();
            
            // Hide loading indicator
            this.hideLoadingIndicator();
            
            console.log(`[DEBUG] Track change completed: ${trackId}`);
            return true;
        } catch (error) {
            console.error('Error changing track:', error);
            this.hideLoadingIndicator();
            throw error;
        }
    }
    
    // Helper method to reset game state for a new track
    resetGameState() {
        console.log("[DEBUG] Resetting game state for new track");
        this.currentLap = 0;
        this.totalLaps = this.track.totalLaps || 3;
        this.lastCheckpointPassed = -1;
        this.lapTimes = [];
        this.lapStartTime = performance.now();
        this.lastLapCompleteTime = 0;
        this.raceFinished = false;
        this.hasPassedFinishLine = false;
        
        // Make sure track's properties are reset too
        if (this.track) {
            // Reset tracking flags in track if they exist
            if (typeof this.track.initialLapCheck !== 'undefined') {
                this.track.initialLapCheck = true;
                this.track.lastLapCheckTime = performance.now();
            }
        }
        
        // Reset any other game state variables
        this.updateLapCounter();
        console.log("[DEBUG] Game state reset completed");
    }
    
    // Update the UI for the new track
    updateUI() {
        // Update lap counter
        this.updateLapCounter();
        
        // If the track has a special HUD style, apply it
        if (typeof this.track.styleHUD === 'function') {
            this.track.styleHUD();
        }
    }

    positionCarForTrack() {
        // Position car based on current track type
        if (this.track instanceof SilverstoneTrack) {
            // Silverstone track - use the analyzed start position if available
            if (this.track.startPosition) {
                console.log("Using analyzed start position for Silverstone track", this.track.startPosition);
                this.car.position = this.track.startPosition.clone();
                // Use the track's start rotation
                this.car.rotation = this.track.startRotation || 0;
                // Update direction vector based on rotation
                this.car.direction = new THREE.Vector3(
                    Math.sin(this.car.rotation),
                    0,
                    Math.cos(this.car.rotation)
                );
                console.log("Set car rotation to:", this.car.rotation);
            } else {
                // Fallback to default position if analysis not complete
                console.log("Using default start position for Silverstone track");
                this.car.position = new THREE.Vector3(0, 2, -25);
                this.car.direction = new THREE.Vector3(0, 0, 1);
                this.car.rotation = 0;
            }
        } else {
            // Default track - use first starting grid position
            if (this.track.startingPositions && this.track.startingPositions.length > 0) {
                // Get the first starting position (pole position)
                const startPos = this.track.startingPositions[0];
                const coords = startPos.coordinates;
                
                // Set car position with a small offset back (-2 units in Z)
                this.car.position = new THREE.Vector3(coords.x, 0.5, coords.z - 2);
                // Face forward along the track
                this.car.direction = new THREE.Vector3(0, 0, 1);
                this.car.rotation = 0;
                
                console.log("Positioned car in starting grid position 1:", coords);
            } else {
                // Fallback to default start line position
                this.car.position = new THREE.Vector3(this.track.trackRadius, 0.5, 0);
                this.car.direction = new THREE.Vector3(0, 0, 1);
                this.car.rotation = 0;
            }
        }
        
        this.car.previousPosition = this.car.position.clone();
        
        // Update camera
        this.camera.position.copy(this.car.position);
        this.camera.position.y += 5;
        this.camera.position.z -= 10;
        this.camera.lookAt(this.car.position);
    }

    // Check race progress including checkpoints and laps
    checkRaceProgress() {
        if (!this.track || !this.car) return;
        
        // Check if car has passed a checkpoint
        const nextCheckpointIndex = (this.lastCheckpointPassed + 1) % this.track.checkpoints.length;
        
        // Use the track's checkpoint collision detection if available
        if (typeof this.track.checkCheckpointCollision === 'function') {
            if (this.track.checkCheckpointCollision(this.car.position, nextCheckpointIndex)) {
                this.lastCheckpointPassed = nextCheckpointIndex;
                console.log(`Passed checkpoint ${nextCheckpointIndex}`);
            }
        }
        
        // Check if car has crossed the finish line to complete a lap
        if (typeof this.track.checkFinishLineCollision === 'function') {
            if (this.track.checkFinishLineCollision(this.car.position)) {
                // Only count lap if all checkpoints have been passed
                if (this.lastCheckpointPassed === this.track.checkpoints.length - 1 || 
                    (this.lastCheckpointPassed === -1 && this.currentLap > 0)) {
                    this.completeLap();
                }
            }
        }
    }
    
    /**
     * Check if the player has passed all required checkpoints for a valid lap
     * This is called by BaseTrack.checkLapProgress() to validate lap completion
     * @returns {boolean} Whether the lap is valid
     */
    hasPassedAllRequiredCheckpoints() {
        // If no checkpoints in the track, any lap is valid
        if (!this.track || !this.track.checkpoints || this.track.checkpoints.length === 0) {
            return true;
        }
        
        // For a valid lap, we need to have passed at least the last checkpoint
        // This is a simple implementation that can be extended for more complex validation
        const totalCheckpoints = this.track.checkpoints.length;
        
        // When switching to a new track, we may start near the finish line without having passed any checkpoints.
        // In this case, we should not allow immediate completion of laps.
        // We'll require having passed at least one checkpoint for the first lap
        if (this.currentLap === 0 && this.lastCheckpointPassed < 0) {
            console.log('[DEBUG] Cannot complete lap - no checkpoints passed yet');
            return false;
        }
        
        // For normal progress, we should have passed the last checkpoint
        if (this.lastCheckpointPassed === totalCheckpoints - 1) {
            return true;
        }
        
        // If we have skipped some checkpoints, require at least half to be valid
        const requiredCheckpoints = Math.max(1, Math.floor(totalCheckpoints / 2));
        const isValid = this.lastCheckpointPassed >= requiredCheckpoints - 1;
        
        if (!isValid) {
            console.log(`[DEBUG] Lap not valid - passed ${this.lastCheckpointPassed + 1}/${totalCheckpoints} checkpoints (need ${requiredCheckpoints})`);
        }
        
        return isValid;
    }
    
    // Reset checkpoint tracking for a new lap
    resetCheckpointTracking() {
        this.lastCheckpointPassed = -1;
        console.log('[DEBUG] Checkpoint tracking reset for new lap');
    }
    
    // Handle lap completion
    completeLap() {
        // Avoid multiple triggers in quick succession
        const now = performance.now();
        if (now - this.lastLapCompleteTime < 3000) return;
        this.lastLapCompleteTime = now;
        
        // Calculate lap time
        const lapTime = (now - this.lapStartTime) / 1000;
        this.lapTimes.push(lapTime);
        this.lapStartTime = now;
        
        // Update lap count
        this.currentLap++;
        console.log(`Completed lap ${this.currentLap} in ${lapTime.toFixed(2)} seconds`);
        
        // Reset checkpoint tracking
        this.resetCheckpointTracking();
        
        // Update UI
        this.updateLapCounter();
        this.updateLapTimes();
        
        // Check if race is finished
        if (this.currentLap >= this.totalLaps) {
            this.finishRace();
        }
    }
    
    // Handle car collision with track boundary
    handleCarCollision() {
        // Set collision flag
        this.car.isColliding = true;
        
        // Reduce speed as penalty
        this.car.speed *= 0.7;
        
        // Optional: Add visual or sound effect for collision
    }
    
    // Update lap counter in UI
    updateLapCounter() {
        const lapCounter = document.getElementById('lap-counter');
        if (lapCounter) {
            lapCounter.textContent = `Lap ${this.currentLap + 1}/${this.totalLaps}`;
        }
    }
    
    // Update lap times display
    updateLapTimes() {
        const lapTimesElement = document.getElementById('lap-times');
        if (lapTimesElement && this.lapTimes.length > 0) {
            let lapTimesHtml = '<h3>Lap Times</h3>';
            this.lapTimes.forEach((time, index) => {
                lapTimesHtml += `<p>Lap ${index + 1}: ${time.toFixed(2)}s</p>`;
            });
            lapTimesElement.innerHTML = lapTimesHtml;
        }
    }
    
    // Handle race finish
    finishRace() {
        if (this.raceFinished) return;
        
        this.raceFinished = true;
        console.log('Race finished!');
        
        // Calculate total time
        const totalTime = this.lapTimes.reduce((sum, time) => sum + time, 0);
        console.log(`Total time: ${totalTime.toFixed(2)}s`);
        
        // Show race complete UI
        this.showRaceCompleteUI(totalTime);
    }

    // Show race complete UI
    showRaceCompleteUI(totalTime) {
        // Create or show race complete UI
        let raceCompleteUI = document.getElementById('race-complete');
        
        if (!raceCompleteUI) {
            // Create race complete UI
            raceCompleteUI = document.createElement('div');
            raceCompleteUI.id = 'race-complete';
            raceCompleteUI.style.position = 'absolute';
            raceCompleteUI.style.top = '50%';
            raceCompleteUI.style.left = '50%';
            raceCompleteUI.style.transform = 'translate(-50%, -50%)';
            raceCompleteUI.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            raceCompleteUI.style.color = 'white';
            raceCompleteUI.style.padding = '20px';
            raceCompleteUI.style.borderRadius = '5px';
            raceCompleteUI.style.textAlign = 'center';
            raceCompleteUI.style.zIndex = '1000';
            document.body.appendChild(raceCompleteUI);
        }
        
        // Set content
        let content = `<h2>Race Complete!</h2>`;
        content += `<p>Total time: ${totalTime.toFixed(2)}s</p>`;
        content += `<h3>Lap Times:</h3>`;
        
        this.lapTimes.forEach((time, index) => {
            content += `<p>Lap ${index + 1}: ${time.toFixed(2)}s</p>`;
        });
        
        content += `<button id="restart-button">Restart Race</button>`;
        
        raceCompleteUI.innerHTML = content;
        
        // Add event listener to restart button
        document.getElementById('restart-button').addEventListener('click', () => {
            this.restartRace();
            raceCompleteUI.style.display = 'none';
        });
    }
    
    // Restart the race
    restartRace() {
        // Reset game state
        this.resetGameState();
        
        // Reset car position
        if (this.car) {
            const startInfo = this.track.getStartPosition();
            this.car.setPosition(startInfo.position);
            this.car.setRotation(startInfo.rotation);
            this.car.reset();
        }
        
        console.log('Race restarted');
    }

    // Add an additional method to find and remove any specific objects by name or type
    removeObjectsByProperties(properties) {
        console.log(`[DEBUG] Looking for objects with specific properties: ${JSON.stringify(properties)}`);
        const objectsToRemove = [];
        
        // Define the search depth (how deep in the hierarchy to look)
        const searchAllChildren = (parent, depth = 0, maxDepth = 10) => {
            if (depth > maxDepth) return; // Prevent infinite recursion
            
            // Check each child
            if (parent.children && parent.children.length > 0) {
                parent.children.forEach(child => {
                    let shouldRemove = false;
                    
                    // Check if object matches any of the search criteria
                    if (properties.names && properties.names.some(name => 
                        child.name && child.name.toLowerCase().includes(name.toLowerCase()))) {
                        shouldRemove = true;
                    }
                    
                    if (properties.types && properties.types.some(type => 
                        child.userData && child.userData.type === type)) {
                        shouldRemove = true;
                    }
                    
                    if (properties.geometryTypes && child.geometry && 
                        properties.geometryTypes.includes(child.geometry.type)) {
                        shouldRemove = true;
                    }
                    
                    if (shouldRemove) {
                        objectsToRemove.push(child);
                    } else {
                        // Continue searching in children
                        searchAllChildren(child, depth + 1, maxDepth);
                    }
                });
            }
        };
        
        // Start search from scene
        searchAllChildren(this.scene);
        
        // Remove the found objects
        console.log(`[DEBUG] Found ${objectsToRemove.length} objects matching criteria`);
        objectsToRemove.forEach(obj => {
            if (obj.parent) {
                obj.parent.remove(obj);
                this.disposeObject(obj);
                console.log(`[DEBUG] Removed object: ${obj.name || obj.type || 'unnamed'}`);
            }
        });
        
        return objectsToRemove.length;
    }
    
    // Call this after the main cleanup to catch any lingering trees/scenery
    removeLingeringScenery() {
        // First look for palm trees specifically
        const treesRemoved = this.removeObjectsByProperties({
            names: ['tree', 'palm', 'Tree', 'Palm'],
            types: ['tree', 'palm_tree']
        });
        
        // Look for mountains
        const mountainsRemoved = this.removeObjectsByProperties({
            names: ['mountain', 'Mountain'],
            types: ['mountain']
        });
        
        // Look for grandstands
        const grandstandsRemoved = this.removeObjectsByProperties({
            names: ['grandstand', 'Grandstand'],
            types: ['grandstand']
        });
        
        // Look for any track-related elements
        const trackElementsRemoved = this.removeObjectsByProperties({
            names: ['track', 'road', 'Track', 'Road', 'boundary', 'Boundary']
        });
        
        console.log(`[DEBUG] Removed lingering scenery: ${treesRemoved} trees, ${mountainsRemoved} mountains, ${grandstandsRemoved} grandstands, ${trackElementsRemoved} track elements`);
    }

    /**
     * Show a loading indicator during operations like track changes
     * @param {string} message - Message to display in the loading indicator
     */
    showLoadingIndicator(message = 'Loading...') {
        // Remove any existing loading indicator
        this.hideLoadingIndicator();
        
        // Create loading indicator element
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'game-loading-indicator';
        loadingIndicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 20px;
            border-radius: 5px;
            z-index: 1000;
            font-family: Arial, sans-serif;
            text-align: center;
            min-width: 200px;
        `;
        
        // Add loader animation
        const loader = document.createElement('div');
        loader.style.cssText = `
            border: 5px solid #f3f3f3;
            border-top: 5px solid #3498db;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 2s linear infinite;
            margin: 10px auto;
        `;
        
        // Add keyframes for spinner animation
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
        // Add message text
        const text = document.createElement('div');
        text.textContent = message;
        
        // Assemble and add to document
        loadingIndicator.appendChild(loader);
        loadingIndicator.appendChild(text);
        document.body.appendChild(loadingIndicator);
        
        this.loadingIndicator = loadingIndicator;
    }

    /**
     * Hide the loading indicator
     */
    hideLoadingIndicator() {
        const existingIndicator = document.getElementById('game-loading-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        this.loadingIndicator = null;
    }

    /**
     * Create a track instance based on track ID
     * @param {string} trackId - The ID of the track to create
     * @returns {BaseTrack} The track instance
     */
    createTrackInstance(trackId) {
        console.log(`[DEBUG] Creating track instance for: ${trackId}`);
        
        // Create track based on ID
        let track;
        
        switch (trackId.toLowerCase()) {
            case 'default':
                // Create default track
                track = new Track(this.scene, this);
                break;
            case 'silverstone':
                // Create Silverstone track
                track = new SilverstoneTrack(this.scene, this);
                break;
            case 'oval':
                // Create oval track (if available)
                if (typeof OvalTrack !== 'undefined') {
                    track = new OvalTrack(this.scene, this);
                } else {
                    console.warn(`[DEBUG] OvalTrack class not found, falling back to default`);
                    track = new Track(this.scene, this);
                }
                break;
            default:
                console.warn(`[DEBUG] Unknown track ID: ${trackId}, using default track`);
                track = new Track(this.scene, this);
        }
        
        console.log(`[DEBUG] Created track instance: ${track.name || trackId}`);
        return track;
    }

    /**
     * Setup scene lighting
     * Creates ambient and directional lights for the scene
     */
    setupLighting() {
        console.log('[DEBUG] Setting up scene lighting');
        
        // Setup ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        // Setup directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(200, 500, 300);
        this.scene.add(directionalLight);
    }

    /**
     * Setup renderer with specified dimensions
     * @param {number} width - Width in pixels
     * @param {number} height - Height in pixels
     */
    setupRenderer(width, height) {
        console.log('[DEBUG] Setting up renderer');
        
        // Use provided dimensions or fallback to window size
        const rendererWidth = width || window.innerWidth;
        const rendererHeight = height || window.innerHeight;
        
        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(rendererWidth, rendererHeight);
        this.renderer.shadowMap.enabled = true;
    }

    static async preloadAssets() {
        // Load your assets here
        // For example:
        const textureLoader = new THREE.TextureLoader();
        const modelLoader = new GLTFLoader();
        
        // Start loading all assets in parallel
        await Promise.all([
            textureLoader.loadAsync('path/to/texture.jpg'),
            modelLoader.loadAsync('path/to/model.glb'),
            // etc...
        ]);
    }

    // Add this new method for performance optimizations
    enablePerformanceMode() {
        if (this.performanceMode) return; // Already in performance mode
        
        this.performanceMode = true;
        console.log('[PERFORMANCE] Switching to performance mode to improve frame rate');
        
        // Reduce visual quality
        if (this.renderer) {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
            this.renderer.shadowMap.enabled = false;
        }
        
        // Reduce number of AI cars if we have an AI manager
        if (this.aiManager && this.aiManager.aiCars.length > this.performanceModeAICars) {
            const carsToRemove = this.aiManager.aiCars.length - this.performanceModeAICars;
            console.log(`[PERFORMANCE] Reducing AI cars from ${this.aiManager.aiCars.length} to ${this.performanceModeAICars}`);
            
            // Remove excess cars
            for (let i = 0; i < carsToRemove; i++) {
                if (this.aiManager.aiCars.length > this.performanceModeAICars) {
                    // Always remove the last car in the array (most recently added)
                    const carToRemove = this.aiManager.aiCars[this.aiManager.aiCars.length - 1];
                    this.aiManager.removeAICar(carToRemove);
                }
            }
        }
        
        // Update UI to indicate performance mode
        const notification = 'Performance mode enabled to improve gameplay';
        if (this.showNotification) {
            this.showNotification(notification, 5000);
        }
    }

    async initializeAI() {
        // Create AIManager if it doesn't exist
        if (!this.aiManager) {
            this.aiManager = new AIManager(this);
            this.aiManager.enable();
        }
        
        // Remove existing AI cars if any
        if (this.aiManager.aiCars.length > 0) {
            console.log('[DEBUG] Removing existing AI cars');
            this.aiManager.removeAllAICars();
        }
        
        // Spawn new AI cars with optimal count for performance
        const optimalCount = this.getOptimalAICarCount();
        this.aiManager.maxAICars = optimalCount;
        this.aiManager.spawnRandomAICars(optimalCount);
        
        console.log(`[DEBUG] Added ${this.aiManager.aiCars.length} AI cars:`, 
            this.aiManager.aiCars.map(car => ({
                name: car.playerName,
                type: car.carType,
                difficulty: car.difficulty
            }))
        );
        
        // Update the user counter with the initial AI car count
        if (window.userCounter) {
            window.userCounter.updateAICars(this.aiManager.aiCars.length);
        }
    }

    /**
     * Get the camera's audio listener or create one if it doesn't exist
     * This can be called by Track to get the audio listener
     * @returns {THREE.AudioListener} The camera's audio listener
     */
    getAudioListener() {
        // Check if camera exists
        if (!this.camera) {
            console.warn("Camera not initialized yet, creating temporary audio listener");
            return new THREE.AudioListener();
        }
        
        // Check if camera already has an audio listener
        const existingListeners = this.camera.children.filter(child => child instanceof THREE.AudioListener);
        
        if (existingListeners.length > 0) {
            return existingListeners[0];
        }
        
        // If no listener exists, create one and attach it
        const listener = new THREE.AudioListener();
        this.camera.add(listener);
        console.log('[DEBUG] Created and attached new audio listener to camera');
        
        return listener;
    }

    // Set up multiplayer mode
    enterMultiplayerMode() {
        if (this.isMultiplayer) {
            console.log('[DEBUG] Already in multiplayer mode');
            return;
        }

        this.isMultiplayer = true;
        console.log('[DEBUG] Entering multiplayer mode');

        // In multiplayer, limit the number of AI cars
        this.aiManager.maxAICars = 3; // Fewer AI cars in multiplayer
        
        // Set AI cars to local-only mode (not shared with other players)
        if (this.aiManager && this.aiManager.aiCars) {
            console.log('[DEBUG] Setting AI cars to local-only mode for performance');
            for (const aiCar of this.aiManager.aiCars) {
                // Mark AI cars as local-only
                aiCar.isLocalOnly = true;
            }
        }

        // Set up the multiplayer manager if it doesn't exist
        if (!this.playManager.multiplayerManager) {
            this.playManager.initMultiplayerManager();
        }

        // Connect to multiplayer server
        if (this.playManager.multiplayerManager) {
            this.playManager.multiplayerManager.connect()
                .then(() => {
                    console.log('[DEBUG] Connected to multiplayer server');
                    
                    // Set up any other multiplayer-specific settings
                    this.setupMultiplayerSettings();
                    
                    // Show connection success notification
                    this.showNotification('Connected to multiplayer server! 🎮');
                })
                .catch(error => {
                    console.error('Error connecting to multiplayer server:', error);
                    this.showNotification('Failed to connect to multiplayer server. Check console for details.', 'error');
                    
                    // Revert to single-player mode on connection failure
                    this.isMultiplayer = false;
                });
        }
    }

    /**
     * Get the optimal number of AI cars based on performance considerations
     * @returns {number} The optimal number of AI cars
     */
    getOptimalAICarCount() {
        // Check if we're already in performance mode
        if (this.performanceMode) {
            return this.performanceModeAICars; // Default is 3 (defined in constructor)
        }
        
        // Check device capabilities
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Check if we are in multiplayer mode
        if (this.isMultiplayer) {
            // Fewer AI cars in multiplayer
            return isMobile ? 2 : 3;
        }
        
        // In single player mode, return more AI cars for desktop
        return isMobile ? 3 : 5;
    }

    // Add new method to create and initialize the airplane with player flyby
    async addAirplane(initialFlyby = false) {
        try {
            // Create custom path based on player position if it's an initial flyby
            let airplanePath;
            let bannerOptions = {
                text: 'TOOLFOLIO',
                color: '#FF9900',
                textColor: '#000000'
            };
            let flyHeight = 60; // Default height
            let speed = 15; // Default speed
            
            if (initialFlyby && this.car) {
                // Get player position
                const playerPos = this.car.getPosition();
                const playerDirection = this.car.getDirection();
                
                // Create a path that crosses in front of the player's view
                airplanePath = this.generatePlayerFlybyPath(playerPos, playerDirection);
                
                // Faster speed and lower height for dramatic effect
                flyHeight = 40;
                speed = 25;
            } else {
                // Regular circular path around the track
                const trackSize = this.track.getTrackSize();
                const width = Math.max(trackSize.width + 50, 200);
                const depth = Math.max(trackSize.depth + 50, 200);
                airplanePath = this.generateAirplanePath(width, depth);
            }
            
            // Create the airplane instance
            this.airplane = new Airplane(this.scene, {
                flyHeight: flyHeight,
                speed: speed,
                bannerText: bannerOptions.text,
                bannerColor: bannerOptions.color,
                bannerTextColor: bannerOptions.textColor,
                path: airplanePath
            });
            
            // Initialize airplane
            await this.airplane.init();
            
            console.log('[DEBUG] Airplane with banner added to scene');
            
            // If this is a flyby, schedule transition to regular circular path
            if (initialFlyby) {
                // After the flyby, switch to normal circular path
                setTimeout(() => {
                    const trackSize = this.track.getTrackSize();
                    const width = Math.max(trackSize.width + 50, 200);
                    const depth = Math.max(trackSize.depth + 50, 200);
                    
                    // Generate new circular path
                    const circularPath = this.generateAirplanePath(width, depth);
                    
                    // Smoothly transition to new path and reduced speed
                    this.transitionAirplanePath(circularPath, 15, 60);
                    
                }, 10000); // 10 seconds for initial flyby
            }
        } catch (error) {
            console.error('[DEBUG] Error adding airplane:', error);
        }
    }
    
    // Generate a path for a dramatic flyby in front of the player
    generatePlayerFlybyPath(playerPos, playerDirection) {
        const path = [];
        
        // Determine entry and exit points for flyby
        // Entry point: Far to the left of player, slightly ahead
        const entryPoint = {
            x: playerPos.x - playerDirection.z * 80 - playerDirection.x * 40,
            z: playerPos.z + playerDirection.x * 80 - playerDirection.z * 40
        };
        
        // Crossing point: Directly in front of player's view, somewhat close
        const crossingPoint = {
            x: playerPos.x + playerDirection.x * 50,
            z: playerPos.z + playerDirection.z * 50
        };
        
        // Exit point: Far to the right of player, further ahead
        const exitPoint = {
            x: playerPos.x + playerDirection.z * 80 + playerDirection.x * 100,
            z: playerPos.z - playerDirection.x * 80 + playerDirection.z * 100
        };
        
        // Create a smooth path with more points for the dramatic flyby
        // We'll use 50 points to make a smooth transition
        const points = 50;
        
        // First segment: Entry to crossing
        for (let i = 0; i < points / 2; i++) {
            const t = i / (points / 2);
            path.push({
                x: entryPoint.x + t * (crossingPoint.x - entryPoint.x),
                z: entryPoint.z + t * (crossingPoint.z - entryPoint.z)
            });
        }
        
        // Second segment: Crossing to exit
        for (let i = 0; i <= points / 2; i++) {
            const t = i / (points / 2);
            path.push({
                x: crossingPoint.x + t * (exitPoint.x - crossingPoint.x),
                z: crossingPoint.z + t * (exitPoint.z - crossingPoint.z)
            });
        }
        
        return path;
    }
    
    // Transition airplane to a new path smoothly
    transitionAirplanePath(newPath, newSpeed, newHeight) {
        if (!this.airplane) return;
        
        // Store current settings
        const oldSpeed = this.airplane.options.speed;
        const oldHeight = this.airplane.options.flyHeight;
        
        // Transition duration in milliseconds
        const duration = 5000;
        const startTime = Date.now();
        
        // Flag that transition is in progress
        this.airplane._isTransitioning = true;
        
        // Create transition animation
        const transitionInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            
            // Ease function for smooth transition
            const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            
            // Update values
            this.airplane.options.speed = oldSpeed + easeT * (newSpeed - oldSpeed);
            this.airplane.options.flyHeight = oldHeight + easeT * (newHeight - oldHeight);
            
            // If transition complete
            if (t >= 1) {
                // Set final values
                this.airplane.options.speed = newSpeed;
                this.airplane.options.flyHeight = newHeight;
                this.airplane.options.path = newPath;
                this.airplane.pathPosition = 0; // Reset path position
                
                // End transition
                this.airplane._isTransitioning = false;
                clearInterval(transitionInterval);
                
                console.log('[DEBUG] Airplane transition complete');
            }
        }, 50);
    }
    
    // Generate a circular path for the airplane that encompasses the track
    generateAirplanePath(width, depth) {
        // Create an elliptical path around the track
        const path = [];
        const points = 100;
        
        // Add some randomness to make it more interesting
        const centerOffsetX = (Math.random() - 0.5) * 40;
        const centerOffsetZ = (Math.random() - 0.5) * 40;
        
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const x = Math.cos(angle) * width + centerOffsetX;
            const z = Math.sin(angle) * depth + centerOffsetZ;
            path.push({ x, z });
        }
        
        return path;
    }
    
    // Get random banner options
    getRandomBannerOptions() {
        const options = [
            { text: 'PLAY WITH FRIENDS!', color: '#FFFF00', textColor: '#000000' },
            { text: 'RACE TOGETHER!', color: '#FF9900', textColor: '#000000' },
            { text: 'INVITE YOUR FRIENDS!', color: '#00CCFF', textColor: '#000000' },
            { text: 'JOIN THE RACE!', color: '#FF66CC', textColor: '#000000' },
            { text: 'CREATE PRIVATE ROOMS!', color: '#99FF33', textColor: '#000000' }
        ];
        
        return options[Math.floor(Math.random() * options.length)];
    }

    startRaceCountdown() {
        // Check if we're in a private room
        const isPrivateRoom = this.multiplayer && this.multiplayer.roomId && this.multiplayer.roomId.startsWith('private-');

        // If not in a private room, start race immediately
        if (!isPrivateRoom) {
            this.isRaceStarted = true;
            if (this.car) {
                this.car.enableControls();
            }
            this.lapStartTime = performance.now();
            return;
        }

        // Only continue with countdown for private rooms
        if (this.countdownActive) return;
        this.countdownActive = true;
        this.isRaceStarted = false;

        // Disable car controls during countdown
        if (this.car) {
            this.car.disableControls();
        }

        // Create countdown overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 100px;
            color: white;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            z-index: 1000;
            font-family: Arial, sans-serif;
            text-align: center;
        `;
        document.body.appendChild(overlay);

        // Start countdown sequence
        let count = 3;
        const countInterval = setInterval(() => {
            if (count > 0) {
                overlay.textContent = count;
                count--;
            } else if (count === 0) {
                overlay.textContent = 'GO!';
                overlay.style.color = '#00ff00';
                count--;

                // Enable car controls
                if (this.car) {
                    this.car.enableControls();
                }

                this.isRaceStarted = true;
                this.lapStartTime = performance.now();
            } else {
                clearInterval(countInterval);
                overlay.remove();
                this.countdownActive = false;
            }
        }, 1000);
    }

    // Add waiting room UI
    showWaitingRoom() {
        // Remove any existing waiting room
        const existingWaitingRoom = document.getElementById('waiting-room');
        if (existingWaitingRoom) existingWaitingRoom.remove();
        
        const waitingRoom = document.createElement('div');
        waitingRoom.id = 'waiting-room';
        waitingRoom.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0, 0, 0, 0.9);
            border: 2px solid #0ff;
            border-radius: 10px;
            padding: 20px;
            color: white;
            text-align: center;
            font-family: Arial, sans-serif;
            z-index: 1000;
            min-width: 350px;
            max-width: 90%;
        `;

        // Only show start button for room creator
        const isRoomCreator = this.multiplayer && this.multiplayer.isRoomCreator;
        const roomId = this.multiplayer ? this.multiplayer.roomId : 'Unknown';
        
        console.log('[DEBUG] Room creator status:', isRoomCreator);
        console.log('[DEBUG] Room ID:', roomId);
        
        // Create a complete URL with the room ID for sharing
        const baseUrl = window.location.origin;
        const shareableUrl = `${baseUrl}?room=${roomId}`;
        
        waitingRoom.innerHTML = `
            <h2>Waiting Room</h2>
            
            <!-- Room Code Section -->
            <div style="
                background-color: rgba(255, 255, 255, 0.1);
                border-radius: 5px;
                padding: 10px;
                margin: 15px 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
            ">
                <div style="
                    font-family: monospace;
                    font-size: 16px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    padding-right: 10px;
                ">${roomId}</div>
                <button id="copy-room-code" style="
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 5px 10px;
                    cursor: pointer;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                ">
                    <span style="font-size: 14px;">📋</span>
                    <span>Copy</span>
                </button>
            </div>
            
            <!-- Share section -->
            <div style="margin: 15px 0;">
                <div style="color: #aaa; font-size: 14px; margin-bottom: 10px;">Share with friends:</div>
                <div style="display: flex; justify-content: center; gap: 10px;">
                    <button id="share-whatsapp" style="
                        background-color: #25D366;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        padding: 5px 10px;
                        cursor: pointer;
                    ">WhatsApp</button>
                    <button id="share-telegram" style="
                        background-color: #0088cc;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        padding: 5px 10px;
                        cursor: pointer;
                    ">Telegram</button>
                    <button id="share-native" style="
                        background-color: #ff9800;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        padding: 5px 10px;
                        cursor: pointer;
                    ">Share</button>
                </div>
            </div>
            
            <!-- Players list -->
            <div id="players-section" style="
                background-color: rgba(255, 255, 255, 0.05);
                border-radius: 5px;
                padding: 15px;
                margin: 15px 0;
                text-align: left;
                max-height: 200px;
                overflow-y: auto;
            ">
                <h3 style="margin-top: 0; margin-bottom: 10px;">Players:</h3>
                <ul id="connected-players" style="list-style: none; padding: 0; margin: 0;"></ul>
            </div>
            
            <!-- Start button or waiting message -->
            ${isRoomCreator ? `
                <button id="start-race-btn" style="
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 12px 20px;
                    font-size: 16px;
                    cursor: pointer;
                    margin-top: 10px;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                ">
                    <span style="font-size: 18px;">🏁</span>
                    <span>Start Race</span>
                </button>
            ` : `
                <p style="
                    color: #aaa;
                    background-color: rgba(255, 255, 255, 0.05);
                    padding: 10px;
                    border-radius: 5px;
                    margin-top: 15px;
                ">Waiting for host to start the race...</p>
            `}
        `;

        document.body.appendChild(waitingRoom);

        // Update players list initially
        this.updateWaitingRoomPlayers();
        
        // Set up regular refresh of player list (every 3 seconds)
        const playerListInterval = setInterval(() => {
            if (document.getElementById('waiting-room')) {
                this.updateWaitingRoomPlayers();
            } else {
                clearInterval(playerListInterval);
            }
        }, 3000);

        // Set up copy button functionality
        const copyBtn = waitingRoom.querySelector('#copy-room-code');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(shareableUrl);
                    const originalText = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<span style="font-size: 14px;">✓</span><span>Copied!</span>';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalText;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                    alert('Failed to copy. Please copy the URL manually.');
                }
            });
        }
        
        // Set up share buttons
        const whatsappBtn = waitingRoom.querySelector('#share-whatsapp');
        if (whatsappBtn) {
            whatsappBtn.addEventListener('click', () => {
                const shareText = 'Join my racing game! Click this link to play together:';
                const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareableUrl)}`;
                window.open(whatsappUrl, '_blank');
            });
        }
        
        const telegramBtn = waitingRoom.querySelector('#share-telegram');
        if (telegramBtn) {
            telegramBtn.addEventListener('click', () => {
                const shareText = 'Join my racing game! Click this link to play together:';
                const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareableUrl)}&text=${encodeURIComponent(shareText)}`;
                window.open(telegramUrl, '_blank');
            });
        }
        
        const nativeShareBtn = waitingRoom.querySelector('#share-native');
        if (nativeShareBtn) {
            if (navigator.share) {
                nativeShareBtn.addEventListener('click', async () => {
                    try {
                        await navigator.share({
                            title: 'Join my racing game!',
                            text: 'Join my racing game! Click this link to play together:',
                            url: shareableUrl
                        });
                    } catch (err) {
                        console.error('Error sharing:', err);
                    }
                });
            } else {
                // Hide if Web Share API is not available
                nativeShareBtn.style.display = 'none';
            }
        }

        // Add event listener for start button if room creator
        if (isRoomCreator) {
            const startButton = waitingRoom.querySelector('#start-race-btn');
            if (startButton) {
                console.log('[DEBUG] Adding start button click handler');
                startButton.addEventListener('click', () => {
                    console.log('[DEBUG] Start button clicked');
                    
                    // Disable the button to prevent multiple clicks
                    startButton.disabled = true;
                    startButton.style.opacity = '0.7';
                    startButton.innerHTML = `<span style="font-size: 18px;">⏱️</span><span>Starting...</span>`;
                    
                    // Broadcast race start event
                    if (this.multiplayer) {
                        console.log('[DEBUG] Broadcasting race start...');
                        this.multiplayer.broadcastStartRace();
                    }
                    
                    // Start the race after a short delay to allow the event to propagate
                    setTimeout(() => {
                        this.startPrivateRace();
                    }, 500);
                });
            } else {
                console.error('[DEBUG] Start button not found in waiting room');
            }
        }

        // Listen for race start events
        if (this.multiplayer) {
            console.log('[DEBUG] Setting up multiplayer event listeners');
            
            // Clear any existing 'startRace' listeners to avoid duplicate handling
            if (this._startRaceListener) {
                this.multiplayer.off('startRace', this._startRaceListener);
            }
            
            // Create and store the handler for future removal
            this._startRaceListener = () => {
                console.log('[DEBUG] Start race event received from host');
                this.startPrivateRace();
            };
            
            // Register event handlers
            this.multiplayer.on('playerJoined', () => {
                this.updateWaitingRoomPlayers();
            });
            
            this.multiplayer.on('playerLeft', () => {
                this.updateWaitingRoomPlayers();
            });
            
            this.multiplayer.on('startRace', this._startRaceListener);
        } else {
            console.error('[DEBUG] Multiplayer not available for event setup');
        }
    }

    // Update the players list in waiting room
    updateWaitingRoomPlayers() {
        const playersList = document.querySelector('#connected-players');
        if (!playersList) {
            console.warn('[DEBUG] Could not find players list element');
            return;
        }

        playersList.innerHTML = '';
        
        // Get remote players from both the remotePlayers Map and the multiplayer peers Map
        const players = [];
        
        // Add players from remotePlayers Map (cars that have been created)
        if (this.remotePlayers && this.remotePlayers.size > 0) {
            console.log('[DEBUG] Reading players from remotePlayers:', this.remotePlayers.size);
            this.remotePlayers.forEach((player, peerId) => {
                if (player && player.playerName) {
                    players.push({
                        id: peerId,
                        name: player.playerName,
                        isLocal: false,
                        isHost: false // We'll determine host status later
                    });
                }
            });
        }
        
        // Add players from multiplayer peers Map (may include players without cars yet)
        if (this.multiplayer && this.multiplayer.peers && this.multiplayer.peers.size > 0) {
            console.log('[DEBUG] Reading players from multiplayer.peers:', this.multiplayer.peers.size);
            this.multiplayer.peers.forEach((peer, peerId) => {
                // Only add if not already in the list
                if (!players.some(p => p.id === peerId)) {
                    players.push({
                        id: peerId,
                        name: peer.name || `Player ${peerId.slice(0, 4)}`,
                        isLocal: false,
                        isHost: false
                    });
                }
            });
        }
        
        // Add local player (always first in the list)
        if (this.playerName) {
            const localPlayerId = this.multiplayer ? this.multiplayer.socket?.id : 'local';
            const isHost = this.multiplayer && this.multiplayer.isRoomCreator;
            
            // Add at the beginning of the array
            players.unshift({
                id: localPlayerId,
                name: this.playerName,
                isLocal: true,
                isHost: isHost
            });
        }
        
        console.log(`[DEBUG] Total players for display: ${players.length}`, players);

        if (players.length === 0) {
            // Fallback if no players detected
            const li = document.createElement('li');
            li.style.cssText = 'padding: 8px 0; color: #aaa;';
            li.innerHTML = 'Waiting for players to join...';
            playersList.appendChild(li);
        } else {
            // Add each player to the list
            players.forEach(player => {
                const li = document.createElement('li');
                li.style.cssText = `
                    padding: 8px;
                    margin-bottom: 5px;
                    background-color: ${player.isLocal ? 'rgba(33, 150, 243, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                `;
                
                // Player icon based on status
                let icon = '👤';
                if (player.isHost) {
                    icon = '👑'; // Crown for host
                }
                
                // Player display with status
                let playerDisplay = `<span style="margin-right: 8px;">${icon}</span>${player.name}`;
                
                // Add status indicator
                if (player.isLocal) {
                    playerDisplay += ' <span style="margin-left: auto; font-size: 12px; color: #4CAF50;">(You)</span>';
                } 
                
                if (player.isHost && !player.isLocal) {
                    playerDisplay += ' <span style="margin-left: auto; font-size: 12px; color: #FFC107;">(Host)</span>';
                }
                
                li.innerHTML = playerDisplay;
                playersList.appendChild(li);
            });
        }

        // Update player count display
        const existingCountDisplay = playersList.parentNode.querySelector('.player-count-display');
        if (existingCountDisplay) {
            existingCountDisplay.remove();
        }
        
        const playerCount = players.length;
        const countDisplay = document.createElement('div');
        countDisplay.className = 'player-count-display';
        countDisplay.style.cssText = 'text-align: right; font-size: 12px; color: #aaa; margin-top: 8px;';
        countDisplay.innerHTML = `${playerCount} ${playerCount === 1 ? 'player' : 'players'} in the room`;
        playersList.parentNode.appendChild(countDisplay);
        
        // If we're the host, make sure start button is available and working
        if (this.multiplayer && this.multiplayer.isRoomCreator) {
            const startButton = document.getElementById('start-race-btn');
            if (startButton) {
                // Remove any existing event listeners and add a new one
                const newStartButton = startButton.cloneNode(true);
                startButton.parentNode.replaceChild(newStartButton, startButton);
                
                newStartButton.addEventListener('click', () => {
                    console.log('[DEBUG] Start button clicked by host');
                    if (this.multiplayer) {
                        console.log('[DEBUG] Broadcasting race start by host...');
                        this.multiplayer.broadcastStartRace();
                    }
                    this.startPrivateRace();
                });
                
                console.log('[DEBUG] Start button configured for host');
            }
        }
    }

    // Start the race in a private room
    startPrivateRace() {
        console.log('[DEBUG] Starting private race');
        
        // Remove waiting room UI
        const waitingRoom = document.getElementById('waiting-room');
        if (waitingRoom) {
            waitingRoom.remove();
        }
        
        // Make sure all cars are ready
        if (this.car) {
            // Reset car position to start line if needed
            this.car.reset();
            // Ensure controls are disabled until countdown finishes
            this.car.disableControls();
        }
        
        // Reset game state
        this.isRaceStarted = false;
        this.lapStartTime = performance.now();
        this.currentLap = 0;
        this.lastCheckpointPassed = -1;
        this.lapTimes = [];
        
        // Update UI to show 0 laps
        this.updateLapCounter();
        
        // Log the start of the race and participants
        console.log(`[DEBUG] Race starting with ${this.remotePlayers.size + 1} players`);
        const playersList = ['You (local player)'];
        this.remotePlayers.forEach(player => {
            playersList.push(player.playerName || 'Unknown player');
        });
        console.log('[DEBUG] Players in race:', playersList);
        
        // Start countdown with forced parameter set to true
        setTimeout(() => {
            this.startRaceCountdown(true);
        }, 500); // Small delay to ensure UI is updated
    }

    // Modified startRaceCountdown to handle private rooms properly
    startRaceCountdown(forceCountdown = false) {
        console.log('[DEBUG] Starting race countdown, force:', forceCountdown);
        
        // If not in a private room and not forced, start race immediately
        const isPrivateRoom = this.multiplayer && this.multiplayer.roomId && this.multiplayer.roomId.startsWith('private-');
        
        if (!forceCountdown && !isPrivateRoom) {
            console.log('[DEBUG] Not a private room, starting race immediately');
            this.isRaceStarted = true;
            if (this.car) {
                this.car.enableControls();
            }
            this.lapStartTime = performance.now();
            return;
        }

        // Only continue with countdown for private rooms
        if (this.countdownActive) {
            console.log('[DEBUG] Countdown already active, ignoring');
            return;
        }
        
        console.log('[DEBUG] Starting countdown sequence');
        this.countdownActive = true;
        this.isRaceStarted = false;

        // Disable car controls during countdown
        if (this.car) {
            this.car.disableControls();
        }

        // Create countdown overlay
        const overlay = document.createElement('div');
        overlay.id = 'countdown-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 100px;
            color: white;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            z-index: 1000;
            font-family: Arial, sans-serif;
            text-align: center;
        `;
        document.body.appendChild(overlay);

        // Start countdown sequence
        let count = 3;
        overlay.textContent = count.toString();
        
        const countInterval = setInterval(() => {
            count--;
            
            if (count > 0) {
                // Still counting down
                overlay.textContent = count.toString();
            } else if (count === 0) {
                // GO!
                overlay.textContent = 'GO!';
                overlay.style.color = '#00ff00';
                
                // Enable car controls
                if (this.car) {
                    this.car.enableControls();
                }

                this.isRaceStarted = true;
                this.lapStartTime = performance.now();
            } else {
                // Cleanup
                clearInterval(countInterval);
                
                if (overlay && overlay.parentNode) {
                    overlay.remove();
                }
                
                this.countdownActive = false;
            }
        }, 1000);
    }
} 