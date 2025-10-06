export class CarControls {
    constructor(car) {
        this.car = car;
        
        // Control states
        this.isAccelerating = false;
        this.isBraking = false;
        this.isReversing = false;
        this.isTurningLeft = false;
        this.isTurningRight = false;
        this.reverseTimer = 0;
    }

    update() {
        // This method can be used to update any time-based control logic
        if (!this.isReversing) {
            this.reverseTimer = 0;
        }
    }

    accelerate(accelerating) {
        this.isAccelerating = accelerating;
    }

    brake(braking) {
        this.isBraking = braking;
    }

    reverse(reversing) {
        this.isReversing = reversing;
        if (!reversing) {
            this.reverseTimer = 0;
        }
    }

    turnLeft(turning) {
        this.isTurningLeft = turning;
    }

    turnRight(turning) {
        this.isTurningRight = turning;
    }

    createMobileControls() {
        // Create container for mobile controls
        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'mobile-controls';
        
        // Create D-pad container
        const dpadContainer = document.createElement('div');
        dpadContainer.id = 'dpad-container';
        
        // Create D-pad buttons
        const dpadButtons = ['up', 'down', 'left', 'right'];
        dpadButtons.forEach(direction => {
            const button = document.createElement('div');
            button.id = `dpad-${direction}`;
            button.className = 'dpad-button';
            button.innerHTML = this.getDirectionSymbol(direction);
            dpadContainer.appendChild(button);
        });
        
        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.id = 'buttons-container';
        
        // Create acceleration button with improved design
        const accelerateButton = document.createElement('div');
        accelerateButton.id = 'accelerate-button';
        accelerateButton.className = 'action-button accelerate';
        accelerateButton.textContent = 'GO';
        buttonsContainer.appendChild(accelerateButton);
        
        // Create use item button
        const useItemButton = document.createElement('div');
        useItemButton.id = 'use-item-button';
        useItemButton.className = 'action-button';
        useItemButton.innerHTML = '🎁';
        buttonsContainer.appendChild(useItemButton);
        
        // Add containers to main container
        controlsContainer.appendChild(dpadContainer);
        controlsContainer.appendChild(buttonsContainer);
        
        // Add container to document
        document.body.appendChild(controlsContainer);
        
        // Add CSS for controls with updated styles
        this.addControlStyles();
        
        // Setup touch listeners for the use item button
        useItemButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            useItemButton.classList.add('active');
            this.useItemButton = true;
            this.car.useItem();
            this.updateCarControls();
        }, { passive: false });
        
        useItemButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            useItemButton.classList.remove('active');
            this.useItemButton = false;
            this.updateCarControls();
        }, { passive: false });
    }

    addControlStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #mobile-controls {
                position: fixed;
                bottom: 20px;
                left: 0;
                right: 0;
                display: flex;
                justify-content: space-between;
                padding: 0 20px;
                pointer-events: none;
                z-index: 1000;
            }

            #dpad-container {
                display: grid;
                grid-template-areas:
                    ". up ."
                    "left . right"
                    ". down .";
                gap: 10px;
                pointer-events: all;
            }
            
            #buttons-container {
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: all;
            }

            .dpad-button {
                width: 60px;
                height: 60px;
                background-color: rgba(255, 255, 255, 0.8);
                border-radius: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                user-select: none;
                -webkit-user-select: none;
            }
            
            .action-button {
                width: 60px;
                height: 60px;
                background-color: rgba(255, 255, 255, 0.8);
                border-radius: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                user-select: none;
                -webkit-user-select: none;
                transition: all 0.2s ease;
            }

            #accelerate-button {
                background-color: #4CAF50;
                color: white;
                font-family: 'Arial', sans-serif;
                font-weight: bold;
                font-size: 20px;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                border: 2px solid #45a049;
            }

            .dpad-button.active, .action-button.active {
                background-color: rgba(200, 200, 200, 1);
                transform: scale(0.95);
            }

            #accelerate-button.active {
                background-color: #45a049;
                transform: scale(0.95);
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
        `;
        document.head.appendChild(style);
    }
} 