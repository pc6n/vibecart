export class Controls {
    constructor(car) {
        this.car = car;
        this.isMobile = this.checkIfMobile();
        
        // Initialize keys Set to track pressed keys
        this.keys = new Set();
        
        // Mobile control states
        this.dpad = {
            up: false,
            down: false,
            left: false,
            right: false
        };
        this.accelerateButton = false;
        this.useItemButton = false;
        
        // Setup controls
        this.setupKeyboardControls();
        if (this.isMobile) {
            this.setupMobileControls();
            this.setupOrientationHandler();
        }
        this.setupScreenTapControl();
        
        // Enable debug mode
        this.debugControls = true;
    }
    
    checkIfMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    setupKeyboardControls() {
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
        document.addEventListener('keyup', (event) => this.handleKeyUp(event));
    }
    
    setupMobileControls() {
        // Create mobile control elements
        this.createMobileControls();
    }
    
    createMobileControls() {
        // Remove any existing mobile controls to prevent duplicates
        const existingControls = document.getElementById('mobile-controls');
        if (existingControls) {
            existingControls.remove();
        }
        
        // Create container for mobile controls
        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'mobile-controls';
        
        // Create left side container for direction buttons
        const directionWrapper = document.createElement('div');
        directionWrapper.id = 'left-container';
        directionWrapper.className = 'control-wrapper';
        
        // Create left/right arrow buttons instead of joystick
        const leftButton = document.createElement('div');
        leftButton.id = 'left-button';
        leftButton.className = 'direction-button';
        leftButton.innerHTML = '&#9664;'; // Left arrow
        leftButton.setAttribute('aria-label', 'Turn left');
        leftButton.setAttribute('role', 'button');
        
        const rightButton = document.createElement('div');
        rightButton.id = 'right-button';
        rightButton.className = 'direction-button';
        rightButton.innerHTML = '&#9654;'; // Right arrow
        rightButton.setAttribute('aria-label', 'Turn right');
        rightButton.setAttribute('role', 'button');
        
        // Add direction buttons to wrapper
        directionWrapper.appendChild(leftButton);
        directionWrapper.appendChild(rightButton);
        
        // Create drive controls container (right side)
        const driveButtonsWrapper = document.createElement('div');
        driveButtonsWrapper.id = 'drive-container';
        driveButtonsWrapper.className = 'control-wrapper';
        
        // Create Drive button
        const driveButton = document.createElement('div');
        driveButton.id = 'drive-button';
        driveButton.className = 'drive-button';
        driveButton.textContent = 'D';
        driveButton.setAttribute('aria-label', 'Accelerate');
        driveButton.setAttribute('role', 'button');
        driveButtonsWrapper.appendChild(driveButton);
        
        // Create Reverse button
        const reverseButton = document.createElement('div');
        reverseButton.id = 'reverse-button';
        reverseButton.className = 'drive-button';
        reverseButton.textContent = 'R';
        reverseButton.setAttribute('aria-label', 'Reverse');
        reverseButton.setAttribute('role', 'button');
        driveButtonsWrapper.appendChild(reverseButton);
        
        // Add containers to main container
        controlsContainer.appendChild(directionWrapper);
        controlsContainer.appendChild(driveButtonsWrapper);
        
        // Add container to document
        document.body.appendChild(controlsContainer);
        
        // Add CSS for controls
        this.addControlStyles();
        
        // Setup touch listeners
        this.setupMobileButtonListeners();
        
        // Log that mobile controls were created
        console.debug('[CONTROLS] Mobile controls created with directional buttons');
    }
    
    setupMobileButtonListeners() {
        // Setup drive button
        const driveButton = document.getElementById('drive-button');
        driveButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            driveButton.classList.add('active');
            this.car.accelerate(true);
            this.car.reverse(false);
        }, { passive: false });

        driveButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            driveButton.classList.remove('active');
            this.car.accelerate(false);
        }, { passive: false });

        // Setup reverse button
        const reverseButton = document.getElementById('reverse-button');
        reverseButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            reverseButton.classList.add('active');
            this.car.reverse(true);
            this.car.accelerate(false);
        }, { passive: false });

        reverseButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            reverseButton.classList.remove('active');
            this.car.reverse(false);
        }, { passive: false });
        
        // Setup left and right buttons
        const leftButton = document.getElementById('left-button');
        leftButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            leftButton.classList.add('active');
            this.car.turnLeft(true);
            this.car.turnRight(false);
        }, { passive: false });
        
        leftButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            leftButton.classList.remove('active');
            this.car.turnLeft(false);
        }, { passive: false });
        
        const rightButton = document.getElementById('right-button');
        rightButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            rightButton.classList.add('active');
            this.car.turnRight(true);
            this.car.turnLeft(false);
        }, { passive: false });
        
        rightButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            rightButton.classList.remove('active');
            this.car.turnRight(false);
        }, { passive: false });
    }
    
    getDirectionSymbol(direction) {
        switch(direction) {
            case 'up': return '⬆';
            case 'down': return '⬇';
            case 'left': return '⬅';
            case 'right': return '➡';
            default: return '';
        }
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        
        // Process new touches without resetting existing ones
        Array.from(e.changedTouches).forEach(touch => {
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!element) return;
            
            // Handle D-pad buttons
            if (element.className === 'dpad-button') {
                element.classList.add('active');
                const direction = element.id.replace('dpad-', '');
                this.dpad[direction] = true;
            }
            
            // Handle accelerate button
            if (element.id === 'accelerate-button') {
                element.classList.add('active');
                this.accelerateButton = true;
            }
        });
        
        this.updateCarControls();
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        
        // Create a map of currently active touches
        const activeTouches = new Map();
        Array.from(e.touches).forEach(touch => {
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            if (element) {
                activeTouches.set(touch.identifier, element);
            }
        });
        
        // Reset only controls that have no active touches
        const dpadButtons = ['up', 'down', 'left', 'right'];
        dpadButtons.forEach(direction => {
            const buttonElement = document.getElementById(`dpad-${direction}`);
            let isButtonTouched = false;
            
            activeTouches.forEach((element) => {
                if (element === buttonElement) {
                    isButtonTouched = true;
                    element.classList.add('active');
                    this.dpad[direction] = true;
                }
            });
            
            if (!isButtonTouched) {
                buttonElement.classList.remove('active');
                this.dpad[direction] = false;
            }
        });
        
        // Handle accelerate button separately
        const accelerateButton = document.getElementById('accelerate-button');
        let isAccelerateTouched = false;
        
        activeTouches.forEach((element) => {
            if (element === accelerateButton) {
                isAccelerateTouched = true;
                element.classList.add('active');
                this.accelerateButton = true;
            }
        });
        
        if (!isAccelerateTouched) {
            accelerateButton.classList.remove('active');
            this.accelerateButton = false;
        }
        
        this.updateCarControls();
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        this.resetMobileControls();
        this.updateCarControls();
    }
    
    resetMobileControls() {
        // Reset D-pad
        Object.keys(this.dpad).forEach(direction => {
            this.dpad[direction] = false;
            const element = document.getElementById(`dpad-${direction}`);
            if (element) element.classList.remove('active');
        });
        
        // Reset accelerate button
        this.accelerateButton = false;
        const accelerateButton = document.getElementById('accelerate-button');
        if (accelerateButton) accelerateButton.classList.remove('active');
    }
    
    updateCarControls() {
        // Reset all car controls
        this.car.turnLeft(false);
        this.car.turnRight(false);
        this.car.accelerate(false);
        this.car.reverse(false);
        
        // Apply D-pad controls
        if (this.dpad.left) this.car.turnLeft(true);
        if (this.dpad.right) this.car.turnRight(true);
        if (this.dpad.up) this.car.accelerate(true);
        if (this.dpad.down) {
            this.car.reverse(true);
            // Ensure accelerate is false when reversing
            this.car.accelerate(false);
        }
        
        // Apply accelerate button only if not reversing
        if (this.accelerateButton && !this.dpad.down) {
            this.car.accelerate(true);
        }
    }
    
    handleKeyDown(event) {
        if (event.repeat) return;
        
        switch (event.key.toLowerCase()) {
            case 'w':
            case 'arrowup':
                this.car.accelerate(true);
                break;
            case 's':
            case 'arrowdown':
                this.car.reverse(true);
                break;
            case 'a':
            case 'arrowleft':
                this.car.turnLeft(true);
                break;
            case 'd':
            case 'arrowright':
                this.car.turnRight(true);
                break;
            case ' ':
            case 'e':
                this.car.useItem();
                break;
        }
    }
    
    handleKeyUp(event) {
        this.keys.delete(event.key);
        
        switch (event.key.toLowerCase()) {
            case 'arrowup':
            case 'w':
                this.car.accelerate(false);
                break;
            case 'arrowdown':
            case 's':
                this.car.reverse(false);
                break;
            case 'arrowleft':
            case 'a':
                this.car.turnLeft(false);
                break;
            case 'arrowright':
            case 'd':
                this.car.turnRight(false);
                break;
            case ' ':
                this.car.brake(false);
                break;
        }
    }

    addControlStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #mobile-controls {
                position: fixed;
                bottom: 50px;
                left: 0;
                right: 0;
                display: flex;
                justify-content: space-between;
                padding: 0 30px;
                pointer-events: none;
                z-index: 1000;
            }

            #left-container {
                display: flex;
                flex-direction: row;
                gap: 15px;
                pointer-events: all;
                justify-content: center;
                margin-right: 20px;
                position: absolute;
                left: 20px;
                bottom: 20px;
            }

            .direction-button {
                width: 70px;
                height: 70px;
                background-color: rgba(50, 50, 50, 0.8);
                border: 3px solid rgba(255, 255, 255, 0.9);
                border-radius: 15px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 30px;
                color: white;
                user-select: none;
                -webkit-user-select: none;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5), 0 0 10px rgba(255, 255, 255, 0.3);
                transition: transform 0.1s, box-shadow 0.2s;
            }
            
            .direction-button.active {
                transform: scale(0.93);
                background-color: rgba(70, 130, 180, 1);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 255, 255, 0.4);
            }
            
            #drive-container {
                display: flex;
                flex-direction: column;
                gap: 20px;
                pointer-events: all;
                margin-bottom: 10px;
                position: absolute;
                right: 20px;
                bottom: 20px;
            }
            
            .drive-button {
                width: 80px;
                height: 80px;
                background-color: rgba(255, 255, 255, 0.1);
                border-radius: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 26px;
                font-weight: bold;
                user-select: none;
                -webkit-user-select: none;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), 0 0 15px rgba(255, 255, 255, 0.2);
                transition: transform 0.1s, box-shadow 0.2s;
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
            }

            #drive-button {
                background-color: rgba(76, 175, 80, 0.9);
                color: white;
                border: 3px solid rgba(255, 255, 255, 0.9);
            }

            #reverse-button {
                background-color: rgba(255, 165, 0, 0.9);
                color: white;
                border: 3px solid rgba(255, 255, 255, 0.9);
            }

            .drive-button.active {
                transform: scale(0.93);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 255, 255, 0.4);
            }

            #drive-button.active {
                background-color: rgba(60, 150, 60, 1);
            }

            #reverse-button.active {
                background-color: rgba(230, 140, 0, 1);
            }
            
            /* Mobile widget specific adjustments */
            .game-widget {
                pointer-events: none !important;
            }
            
            /* Responsive adjustments for different screen sizes */
            @media (max-height: 600px) {
                #mobile-controls {
                    bottom: 20px;
                }
                
                #left-container {
                    bottom: 15px;
                }
                
                #drive-container {
                    bottom: 15px;
                }
                
                .direction-button {
                    width: 60px;
                    height: 60px;
                    font-size: 26px;
                }
                
                .drive-button {
                    width: 70px;
                    height: 70px;
                    border-radius: 35px;
                    font-size: 22px;
                }
            }
            
            /* Larger screens */
            @media (min-height: 800px) {
                #mobile-controls {
                    bottom: 70px;
                }
                
                #left-container {
                    bottom: 30px;
                }
                
                #drive-container {
                    bottom: 30px;
                }
                
                .direction-button {
                    width: 80px;
                    height: 80px;
                    font-size: 36px;
                }
                
                .drive-button {
                    width: 90px;
                    height: 90px;
                    border-radius: 45px;
                    font-size: 28px;
                }
            }
            
            /* Landscape mode - move controls to sides and corners */
            @media (orientation: landscape) {
                #mobile-controls {
                    bottom: 20px;
                    padding: 0 10px;
                }
                
                #left-container {
                    left: 20px;
                    bottom: 20px;
                }
                
                #drive-container {
                    right: 20px;
                    bottom: 20px;
                }
                
                /* Ensure controls don't overlap with HUD in landscape */
                #game-hud {
                    right: auto !important;
                    max-width: 40% !important;
                }
            }
            
            /* Small landscape mode (phones) */
            @media (max-height: 450px) and (orientation: landscape) {
                #mobile-controls {
                    bottom: 10px;
                }
                
                #left-container {
                    left: 10px;
                    bottom: 10px;
                }
                
                #drive-container {
                    right: 10px;
                    bottom: 10px;
                }
                
                .direction-button {
                    width: 50px;
                    height: 50px;
                    font-size: 24px;
                }
                
                .drive-button {
                    width: 60px;
                    height: 60px;
                    border-radius: 30px;
                    font-size: 20px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    setupScreenTapControl() {
        // Add tap handler for the entire screen (except control buttons)
        document.addEventListener('touchstart', (event) => {
            // Check if the tap is not on any control buttons
            const target = event.target;
            if (!target.closest('.control-button') && !target.closest('#mobile-controls')) {
                this.car.useItem();
            }
        });
    }

    setupOrientationHandler() {
        // Track the current orientation to avoid unnecessary rebuilds
        let currentOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
        
        // Handle orientation changes and window resizes
        const handleResize = () => {
            // Get screen dimensions
            const width = window.innerWidth;
            const height = window.innerHeight;
            const isLandscape = width > height;
            const newOrientation = isLandscape ? 'landscape' : 'portrait';
            
            // Adjust controls based on orientation
            const controlsContainer = document.getElementById('mobile-controls');
            if (!controlsContainer) return;
            
            // If orientation has changed, recreate the mobile controls completely
            if (newOrientation !== currentOrientation) {
                currentOrientation = newOrientation;
                
                
                // Use setTimeout to ensure the browser has completed layout adjustments
                setTimeout(() => {
                    try {
                        // Recreate all mobile controls with proper sizing
                        this.createMobileControls();
                    } catch (error) {
                        console.error('[CONTROLS] Error recreating controls after orientation change:', error);
                    }
                }, 300);
            }
        };
        
        // Initial setup - with a small delay to ensure DOM is ready
        setTimeout(handleResize, 100);
        
        // Debounce function to avoid excessive updates
        let resizeTimeout;
        const debouncedResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(handleResize, 150);
        };
        
        // Add event listener for orientation change and resize
        window.addEventListener('resize', debouncedResize);
        window.addEventListener('orientationchange', () => {
            // Changing orientation needs a longer delay to ensure
            // the browser has completed its own reflow
            setTimeout(handleResize, 500);
        });
    }
} 