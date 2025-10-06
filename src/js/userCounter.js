/**
 * User Counter Module
 * Displays real-time user statistics on the page
 */

export class UserCounter {
    constructor(options = {}) {
        this.apiUrl = options.apiUrl || 'http://localhost:1337/api/stats';
        this.updateInterval = options.updateInterval || 30000; // 30 seconds
        this.position = options.position || 'top-left';
        this.showDetailed = options.showDetailed || false;
        this.debugMode = options.debugMode || false;
        this.keyboardShortcut = options.keyboardShortcut || 'ctrl+u';
        this.resetShortcut = options.resetShortcut || 'ctrl+shift+r';
        this.playMode = options.playMode || false; // New property to detect play mode
        
        this.stats = {
            currentlyActive: 0,
            totalConnections: 0,
            dailyVisitors: 0,
            aiCars: 0 // Add AI cars count
        };
        
        this.visible = !this.debugMode; // Initially hidden in debug mode
        this.initialized = false;
        this.intervalId = null;
        this.keyboardListener = null;
    }
    
    init() {
        if (this.initialized) return;
        
        // Create counter element
        this.createCounterElement();
        
        // Set initial visibility
        this.setVisibility(this.visible);
        
        // Fetch initial data
        this.fetchStats();
        
        // Set up interval for updates
        this.intervalId = setInterval(() => this.fetchStats(), this.updateInterval);
        
        // Set up keyboard shortcut in debug mode
        if (this.debugMode) {
            this.setupKeyboardShortcut();
        }
        
        this.initialized = true;
    }
    
    setupKeyboardShortcut() {
        // Parse the keyboard shortcuts
        this.keyboardListener = (event) => {
            // Toggle visibility shortcut
            const toggleParts = this.keyboardShortcut.toLowerCase().split('+');
            const toggleKey = toggleParts[toggleParts.length - 1];
            const toggleNeedsCtrl = toggleParts.includes('ctrl');
            const toggleNeedsShift = toggleParts.includes('shift');
            const toggleNeedsAlt = toggleParts.includes('alt');
            
            // Reset shortcut
            const resetParts = this.resetShortcut.toLowerCase().split('+');
            const resetKey = resetParts[resetParts.length - 1];
            const resetNeedsCtrl = resetParts.includes('ctrl');
            const resetNeedsShift = resetParts.includes('shift');
            const resetNeedsAlt = resetParts.includes('alt');
            
            // Check for toggle shortcut
            if (event.key.toLowerCase() === toggleKey && 
                toggleNeedsCtrl === event.ctrlKey && 
                toggleNeedsShift === event.shiftKey && 
                toggleNeedsAlt === event.altKey) {
                event.preventDefault();
                this.toggleVisibility();
            }
            
            // Check for reset shortcut
            if (event.key.toLowerCase() === resetKey && 
                resetNeedsCtrl === event.ctrlKey && 
                resetNeedsShift === event.shiftKey && 
                resetNeedsAlt === event.altKey) {
                event.preventDefault();
                this.resetStats();
            }
        };
        
        document.addEventListener('keydown', this.keyboardListener);
    }
    
    createCounterElement() {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'user-counter';
        this.container.id = 'user-counter';
        
        // Style based on position
        let positionStyle = '';
        
        // If in play mode, use a position that doesn't conflict with game UI
        if (this.playMode) {
            positionStyle = 'bottom: 10px; left: 10px;'; // Use bottom-left in play mode to avoid conflicts
        } else {
            // Use the configured position
            if (this.position === 'top-right') {
                positionStyle = 'top: 10px; right: 10px;';
            } else if (this.position === 'bottom-left') {
                positionStyle = 'bottom: 10px; left: 10px;';
            } else if (this.position === 'bottom-right') {
                positionStyle = 'bottom: 10px; right: 10px;';
            } else { // Default to top-left
                positionStyle = 'top: 10px; left: 10px;';
            }
        }
        
        // Apply styles
        this.container.style.cssText = `
            position: fixed;
            ${positionStyle}
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 8px 12px;
            border-radius: 5px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            z-index: 1000;
            transition: opacity 0.3s;
            user-select: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;
        
        // Create counter content
        this.content = document.createElement('div');
        this.content.className = 'user-counter-content';
        this.container.appendChild(this.content);
        
        // Add click handler to toggle detailed view
        this.container.addEventListener('click', () => {
            this.toggleDetailed();
        });
        
        // Add to page
        document.body.appendChild(this.container);
        
        // Update content
        this.updateDisplay();
    }
    
    async fetchStats() {
        try {
            const response = await fetch(this.apiUrl);
            if (!response.ok) {
                console.error('Failed to fetch user stats:', response.statusText);
                return;
            }
            
            const data = await response.json();
            
            // Update local stats
            this.stats = {
                currentlyActive: data.users.currentlyActive || 0,
                totalConnections: data.users.totalConnections || 0,
                dailyVisitors: data.users.dailyVisitors || 0,
                aiCars: data.users.aiCars || 0,
                // Add other stats if needed
            };
            
            // Update display
            this.updateDisplay();
        } catch (error) {
            console.error('Error fetching user stats:', error);
        }
    }
    
    updateDisplay() {
        if (!this.content) return;
        
        if (this.showDetailed) {
            this.content.innerHTML = `
                <div>🏎️ <b>Users Online:</b> ${this.stats.currentlyActive}</div>
                <div>🤖 <b>AI Cars:</b> ${this.stats.aiCars}</div>
                <div>🌟 <b>Today:</b> ${this.stats.dailyVisitors}</div>
                <div>🏁 <b>Total:</b> ${this.stats.totalConnections}</div>
            `;
        } else {
            this.content.innerHTML = `
                <div>🏎️ <b>Users Online:</b> ${this.stats.currentlyActive} + 🤖 ${this.stats.aiCars}</div>
            `;
        }
    }
    
    toggleDetailed() {
        this.showDetailed = !this.showDetailed;
        this.updateDisplay();
    }
    
    toggleVisibility() {
        this.visible = !this.visible;
        this.setVisibility(this.visible);
    }
    
    setVisibility(visible) {
        if (this.container) {
            this.container.style.display = visible ? 'block' : 'none';
        }
        this.visible = visible;
    }
    
    setPosition(position) {
        this.position = position;
        
        // If in play mode, always force bottom-left to avoid UI conflicts
        let positionStyle = '';
        
        if (this.playMode) {
            positionStyle = 'bottom: 10px; left: 10px; top: auto; right: auto;';
        } else {
            // Update position based on setting
            switch (position) {
                case 'top-right':
                    positionStyle = 'top: 10px; right: 10px; bottom: auto; left: auto;';
                    break;
                case 'bottom-left':
                    positionStyle = 'bottom: 10px; left: 10px; top: auto; right: auto;';
                    break;
                case 'bottom-right':
                    positionStyle = 'bottom: 10px; right: 10px; top: auto; left: auto;';
                    break;
                default: // top-left
                    positionStyle = 'top: 10px; left: 10px; bottom: auto; right: auto;';
            }
        }
        
        if (this.container) {
            this.container.style.cssText = this.container.style.cssText + positionStyle;
        }
    }
    
    /**
     * Set whether the counter is in play mode
     * This will adjust positioning to avoid conflicts with game UI
     */
    setPlayMode(isPlayMode) {
        this.playMode = isPlayMode;
        
        // Update position based on play mode
        if (this.container) {
            let positionStyle = '';
            
            if (this.playMode) {
                // Use bottom-left in play mode to avoid conflicts with all UI elements
                positionStyle = 'bottom: 10px; left: 10px; top: auto; right: auto;';
            } else {
                // Use the configured position
                switch (this.position) {
                    case 'top-right':
                        positionStyle = 'top: 10px; right: 10px; bottom: auto; left: auto;';
                        break;
                    case 'bottom-left':
                        positionStyle = 'bottom: 10px; left: 10px; top: auto; right: auto;';
                        break;
                    case 'bottom-right':
                        positionStyle = 'bottom: 10px; right: 10px; top: auto; left: auto;';
                        break;
                    default: // top-left
                        positionStyle = 'top: 10px; left: 10px; bottom: auto; right: auto;';
                }
            }
            
            // Update container style with new position
            const existingStyle = this.container.style.cssText.replace(/((top|bottom|left|right): [^;]+;)/g, '');
            this.container.style.cssText = existingStyle + positionStyle;
        }
    }
    
    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        if (this.keyboardListener) {
            document.removeEventListener('keydown', this.keyboardListener);
        }
        
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        this.initialized = false;
    }
    
    async resetStats() {
        try {
            const baseUrl = this.apiUrl.substring(0, this.apiUrl.lastIndexOf('/'));
            const resetUrl = `${baseUrl}/stats/reset`;
            
            const response = await fetch(resetUrl);
            if (!response.ok) {
                console.error('Failed to reset stats:', response.statusText);
                return;
            }
            
            const data = await response.json();
            console.log('Stats reset successfully:', data);
            
            // Show feedback
            this.showResetFeedback();
            
            // Refetch stats immediately
            this.fetchStats();
        } catch (error) {
            console.error('Error resetting stats:', error);
        }
    }
    
    showResetFeedback() {
        // Create a temporary message element
        const message = document.createElement('div');
        message.style.cssText = `
            position: absolute;
            top: -40px;
            left: 0;
            right: 0;
            background-color: #4CAF50;
            color: white;
            text-align: center;
            padding: 6px;
            border-radius: 4px;
            transition: all 0.3s ease;
            font-size: 12px;
            font-weight: bold;
            z-index: 1001;
        `;
        message.textContent = 'Statistics Reset!';
        
        // Add to counter
        if (this.container) {
            this.container.style.position = 'relative';
            this.container.appendChild(message);
            
            // Animate in
            setTimeout(() => {
                message.style.top = '-30px';
            }, 10);
            
            // Remove after showing
            setTimeout(() => {
                message.style.top = '-40px';
                message.style.opacity = '0';
                setTimeout(() => message.remove(), 300);
            }, 2000);
        }
    }
    
    // New method to update the AI car count
    updateAICars(count) {
        this.stats.aiCars = count || 0;
        this.updateDisplay();
    }
} 