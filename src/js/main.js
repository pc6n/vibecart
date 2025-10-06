import { RacingGame } from './game';
import { UserCounter } from './userCounter';

// Global debug flag - can be controlled via URL parameter or localStorage
const DEBUG = {
    enabled: false,
    init() {
        // Check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('debug')) {
            this.enabled = urlParams.get('debug') !== 'false';
            // Store in localStorage if explicitly set in URL
            localStorage.setItem('racingcart_debug', this.enabled ? 'true' : 'false');
        } else {
            // Check localStorage for saved preference
            const savedDebug = localStorage.getItem('racingcart_debug');
            if (savedDebug !== null) {
                this.enabled = savedDebug === 'true';
            }
        }
        
        console.log(`Debug mode: ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
        
        // Set up global keyboard shortcut to toggle debug mode
        document.addEventListener('keydown', (event) => {
            // Check for Ctrl+D
            if (event.ctrlKey && event.key.toLowerCase() === 'd') {
                event.preventDefault(); // Prevent browser's bookmark dialog
                this.toggle();
                
                // Update UI components that depend on debug mode
                if (window.userCounter) {
                    window.userCounter.setVisibility(this.enabled);
                }
                
                // Show feedback toast
                showDebugToast(`Debug mode ${this.enabled ? 'enabled' : 'disabled'}`);
            }
        });
        
        // Expose debug controls globally
        window.DEBUG = this;
        return this.enabled;
    },
    enable() {
        this.enabled = true;
        localStorage.setItem('racingcart_debug', 'true');
        console.log('Debug mode enabled');
        return true;
    },
    disable() {
        this.enabled = false;
        localStorage.setItem('racingcart_debug', 'false');
        console.log('Debug mode disabled');
        return false;
    },
    toggle() {
        return this.enabled ? this.disable() : this.enable();
    }
};

// Simple toast notification for debug messages
function showDebugToast(message, duration = 2000) {
    const toast = document.createElement('div');
    
    // Handle multi-line messages
    const formattedMessage = message.includes('\n') ? 
        message.split('\n').map(line => line.trim()).join('<br>') : 
        message;
    
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: #fff;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 9999;
        font-family: 'Arial', sans-serif;
        font-size: 14px;
        transition: opacity 0.3s, transform 0.3s;
        opacity: 0;
        pointer-events: none;
        text-align: left;
        max-width: 400px;
        line-height: 1.5;
    `;
    toast.innerHTML = formattedMessage;
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);
    
    // Remove after specified duration
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// Initialize debug mode
DEBUG.init();

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize user counter - hidden by default in debug mode
        const userCounter = new UserCounter({
            position: 'top-right',
            // Use the correct server URL in production - this assumes the same origin
            apiUrl: window.location.origin.includes('localhost') 
                ? 'http://localhost:1337/api/stats'
                : `${window.location.origin}/api/stats`,
            debugMode: true, // Always use debug mode for counter
            keyboardShortcut: 'ctrl+u', // Use Ctrl+U to toggle visibility
            resetShortcut: 'ctrl+shift+r', // Use Ctrl+Shift+R to reset stats
            playMode: true // Always use play mode positioning to avoid UI conflicts
        });
        userCounter.init();
        
        // Make it accessible globally for debugging
        window.userCounter = userCounter;
        
        // Show counter immediately if debug mode is enabled
        if (DEBUG.enabled) {
            userCounter.setVisibility(true);
            
            // Show help toast for debug controls
            setTimeout(() => {
                showDebugToast(
                    `Debug Controls:\n` +
                    `Ctrl+D: Toggle debug mode\n` +
                    `Ctrl+U: Toggle user counter\n` +
                    `Ctrl+Shift+R: Reset statistics\n` +
                    `Click counter: Toggle detailed view`,
                    5000
                );
            }, 1000);
        }
        
        // Create new game instance which will initialize the GameUI
        new RacingGame();
    } catch (error) {
        console.error('Failed to initialize game:', error);
        const loading = document.getElementById('loading');
        loading.classList.add('visible');
        loading.innerHTML = `
            <div style="color: #ff4444">Failed to load game</div>
            <div style="font-size: 16px; margin-top: 10px;">Please refresh the page to try again</div>
        `;
    }
}); 