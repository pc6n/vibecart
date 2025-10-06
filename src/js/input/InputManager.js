export class InputManager {
  constructor(game) {
    this.game = game;
    this.isAccelerating = false;
    this.isBraking = false;
    this.isTurningLeft = false;
    this.isTurningRight = false;
    this.isUsingItem = false;
    this.isReversing = false;
    
    // Set up input handlers
    this.setupKeyboardControls();
    
    console.log('[INPUT] InputManager initialized');
  }
  
  setupKeyboardControls() {
    // Basic driving controls
    document.addEventListener('keydown', (event) => {
      this.handleKeyDown(event);
    });
    
    document.addEventListener('keyup', (event) => {
      this.handleKeyUp(event);
    });
  }
  
  handleKeyDown(event) {
    // Prevent default for arrow keys and space to avoid page scrolling
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    
    switch (event.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.isAccelerating = true;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.isBraking = true;
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.isTurningLeft = true;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.isTurningRight = true;
        break;
      case ' ':
        this.isUsingItem = true;
        break;
      case 'r':
      case 'R':
        this.isReversing = true;
        break;
      case 'c':
      case 'C':
        // Toggle camera
        if (this.game && typeof this.game.toggleCamera === 'function') {
          this.game.toggleCamera();
        }
        break;
      case 'l':
      case 'L':
        // Toggle center line visibility
        if (this.game && this.game.track && typeof this.game.track.toggleCenterLine === 'function') {
          this.game.track.toggleCenterLine();
        }
        break;
    }
  }
  
  handleKeyUp(event) {
    switch (event.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.isAccelerating = false;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.isBraking = false;
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.isTurningLeft = false;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.isTurningRight = false;
        break;
      case ' ':
        this.isUsingItem = false;
        break;
      case 'r':
      case 'R':
        this.isReversing = false;
        break;
    }
  }
  
  // Get the current input state for use by Car class
  getInputState() {
    return {
      isAccelerating: this.isAccelerating,
      isBraking: this.isBraking,
      isTurningLeft: this.isTurningLeft,
      isTurningRight: this.isTurningRight,
      isUsingItem: this.isUsingItem,
      isReversing: this.isReversing
    };
  }
  
  // Reset all input states (useful when switching scenes or pausing)
  resetInputs() {
    this.isAccelerating = false;
    this.isBraking = false;
    this.isTurningLeft = false;
    this.isTurningRight = false;
    this.isUsingItem = false;
    this.isReversing = false;
  }
} 