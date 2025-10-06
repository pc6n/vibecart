import { GameModes } from '../constants/GameModes';
import { FriendsRoomUI } from './FriendsRoomUI';

export class GameUI {
    constructor(onStart, game) {
        console.log('[DEBUG-UI] Initializing GameUI');
        this.onStart = onStart;
        this.game = game;  // Store game instance
        this.container = null;
        this.nameInput = null;  // Store reference to name input
        
        // Check for room ID in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        
        if (roomId) {
            console.log('[DEBUG-UI] Found room ID in URL:', roomId);
            // Get player name from storage
            const playerName = localStorage.getItem('playerName');
            
            if (playerName) {
                console.log('[DEBUG-UI] Found saved name, auto-joining room');
                // Create minimal UI for room joining
                this.container = document.createElement('div');
                this.container.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.8);
                    padding: 20px;
                    border-radius: 10px;
                    color: white;
                    text-align: center;
                    font-family: Arial, sans-serif;
                    z-index: 1000;
                `;
                
                this.container.innerHTML = `
                    <h2>Joining Room</h2>
                    <p>Room ID: ${roomId}</p>
                    <p>Player: ${playerName}</p>
                    <button id="quick-join-btn" style="
                        background-color: #2196F3;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        padding: 12px 20px;
                        font-size: 16px;
                        cursor: pointer;
                        margin-top: 15px;
                        width: 200px;
                    ">Join Game</button>
                `;
                
                document.body.appendChild(this.container);
                
                // Setup quick join button
                const quickJoinBtn = this.container.querySelector('#quick-join-btn');
                quickJoinBtn.addEventListener('click', async () => {
                    this.container.remove();
                    const friendsRoomUI = new FriendsRoomUI(this, this.game);
                    await friendsRoomUI.autoJoinRoom(roomId, playerName);
                });
                
                return;
            }
        }
        
        this.createUI();
    }

    createUI() {
        console.log('[DEBUG-UI] Creating UI elements');
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            padding: 20px;
            border-radius: 10px;
            color: white;
            text-align: center;
            font-family: Arial, sans-serif;
        `;

        const title = document.createElement('h1');
        title.textContent = 'Vibe Cart';
        title.style.marginBottom = '20px';

        // Create name input
        const nameLabel = document.createElement('label');
        nameLabel.htmlFor = 'player-name';
        nameLabel.textContent = 'Your Name:';
        nameLabel.style.cssText = `
            display: block;
            margin-bottom: 5px;
            font-size: 14px;
            color: #ccc;
        `;
        
        this.nameInput = document.createElement('input');
        this.nameInput.type = 'text';
        this.nameInput.id = 'player-name';
        this.nameInput.placeholder = 'Enter your name';
        this.nameInput.maxLength = 16; // Limit name length
        
        // Load saved name if exists
        const savedName = localStorage.getItem('playerName');
        console.log('[DEBUG-UI] Loaded saved name:', savedName || 'none');
        
        // Clear localStorage if we detect an object
        if (savedName && (savedName.includes('[object') || savedName === 'undefined')) {
            console.log('[DEBUG-UI] Clearing invalid name from storage');
            localStorage.removeItem('playerName');
            savedName = '';
        }
        
        if (savedName && savedName.trim()) {
            this.nameInput.value = savedName;
        } else {
            this.nameInput.value = ''; // Ensure empty string instead of undefined
        }
        
        this.nameInput.style.cssText = `
            display: block;
            margin: 0 auto 15px;
            padding: 12px;
            width: 220px;
            border-radius: 5px;
            border: none;
            font-size: 16px;
            background-color: rgba(255, 255, 255, 0.9);
            text-align: center;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        `;

        // Add input validation and auto-save
        this.nameInput.addEventListener('input', (event) => {
            const name = event.target.value.trim();
            if (name && name !== 'undefined') {
                localStorage.setItem('playerName', name);
                console.log('[DEBUG-UI] Saved name:', name);
            } else {
                localStorage.removeItem('playerName');
            }
        });

        const createButtons = () => {
            const buttonStyles = `
                display: block;
                margin: 10px auto;
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                width: 220px;
                font-size: 16px;
                transition: background-color 0.3s;
                color: white;
            `;

            const buttons = [
                {
                    text: '🎮 Play (Multiplayer)',
                    mode: GameModes.PLAY,
                    color: '#4CAF50',
                    description: 'Join a public game instantly'
                },
                {
                    text: '👥 Play with Friends',
                    mode: 'friends',
                    color: '#FF9800',
                    description: 'Create a private room to play with friends',
                    disabled: false
                },
/*                 {
                    text: '🎯 Practice',
                    mode: GameModes.PRACTICE,
                    color: '#2196F3',
                    description: 'Race alone to improve your skills'
                }, */
                {
                    text: '🏆 High Scores',
                    mode: 'highscores',
                    color: '#9C27B0',
                    description: 'View the top lap times'
                },
/*                 {
                    text: '⚙️ Settings',
                    mode: 'settings',
                    color: '#607D8B',
                    description: 'Game options and controls'
                } */
            ];

            buttons.forEach(({ text, mode, color, description, disabled }) => {
                const buttonContainer = document.createElement('div');
                buttonContainer.style.marginBottom = '15px';

                const button = document.createElement('button');
                button.textContent = text;
                button.style.cssText = buttonStyles + `background-color: ${color};`;
                
                if (disabled) {
                    button.disabled = true;
                    button.style.opacity = '0.6';
                    button.style.cursor = 'not-allowed';
                    button.title = 'This feature is coming soon';
                }
                
                const desc = document.createElement('div');
                desc.textContent = description;
                desc.style.cssText = `
                    font-size: 12px;
                    color: #aaa;
                    margin-top: 5px;
                `;
                
                button.addEventListener('mouseenter', () => {
                    if (!disabled) {
                        button.style.backgroundColor = this.lightenColor(color, 20);
                    }
                });
                
                button.addEventListener('mouseleave', () => {
                    button.style.backgroundColor = color;
                });
                
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    if (!disabled) {
                        this.handleButtonClick(mode);
                    }
                });
                
                buttonContainer.appendChild(button);
                buttonContainer.appendChild(desc);
                this.container.appendChild(buttonContainer);
            });
        };

        this.container.appendChild(title);
        this.container.appendChild(nameLabel);
        this.container.appendChild(this.nameInput);
        createButtons();
        document.body.appendChild(this.container);
        
        // Focus the name input
        this.nameInput.focus();
        console.log('[DEBUG-UI] UI created and name input focused');
    }

    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return `#${(1 << 24 | (R < 255 ? R : 255) << 16 | (G < 255 ? G : 255) << 8 | (B < 255 ? B : 255)).toString(16).slice(1)}`;
    }

    // Add a method to show error messages
    showErrorMessage(message) {
        // Remove any existing error message
        const existingError = document.getElementById('name-error');
        if (existingError) {
            existingError.remove();
        }
        
        // Create error message element
        const errorElement = document.createElement('div');
        errorElement.id = 'name-error';
        errorElement.textContent = message;
        errorElement.style.cssText = `
            color: #ff4d4d;
            font-size: 14px;
            margin: 5px 0 10px;
            font-weight: bold;
        `;
        
        // Insert after the name input
        this.nameInput.parentNode.insertBefore(errorElement, this.nameInput.nextSibling);
        
        // Highlight the input with red border
        this.nameInput.style.border = '2px solid #ff4d4d';
        
        // Add event listener to remove error when typing
        const removeError = () => {
            const error = document.getElementById('name-error');
            if (error) {
                error.remove();
                this.nameInput.style.border = 'none';
                this.nameInput.removeEventListener('input', removeError);
            }
        };
        
        this.nameInput.addEventListener('input', removeError);
    }

    async handleButtonClick(mode) {
        // Get player name from input and clean it
        const playerName = this.nameInput.value.trim();
        
        // If high scores button was clicked, show high scores and return
        if (mode === 'highscores') {
            // Create high score container
            const container = document.createElement('div');
            container.className = 'high-score-container';
            container.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: rgba(0, 0, 0, 0.9);
                border: 2px solid #0ff;
                border-radius: 10px;
                width: 80%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                z-index: 1000;
                padding: 20px;
                color: white;
            `;
            
            container.innerHTML = `
                <div class="high-score-header">
                    <h2>High Scores</h2>
                    <button class="close-btn">×</button>
                </div>
                <div class="high-score-content">
                    <div class="loading">Loading high scores...</div>
                </div>
            `;
            
            document.body.appendChild(container);
            
            // Add event listener to close button
            const closeBtn = container.querySelector('.close-btn');
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(container);
            });
            
            // Load high scores
            this.loadPreGameHighScores(container);
            return;
        }
        
        // If settings button was clicked, show settings and return
        if (mode === 'settings') {
            this.showSettings();
            return;
        }
        
        // If play with friends button was clicked, show private room UI
        if (mode === 'friends') {
            this.showFriendsRoomUI();
            return;
        }
        
        // For game modes, validate name
        if (!playerName || playerName === 'undefined' || playerName.length < 1) {
            this.showErrorMessage('Please enter your name to play');
            if (playerName === 'undefined') {
                this.nameInput.value = '';
                localStorage.removeItem('playerName');
            }
            return;
        }
        
        // Save valid player name
        if (typeof playerName === 'string' && !playerName.includes('[object')) {
            localStorage.setItem('playerName', playerName);
        } else {
            console.error('[DEBUG-UI] Invalid player name detected:', playerName);
            localStorage.removeItem('playerName');
        }
        
        // Start the game immediately
        console.log('[DEBUG-UI] Starting game with mode:', mode, 'player:', playerName);
        this.container.remove(); // Remove the container completely instead of just hiding it
        this.onStart(mode, playerName);
    }

    showHighScores() {
        console.log('[DEBUG-UI] Showing high scores');
        
        // Create a generic high score container
        const container = document.createElement('div');
        container.className = 'high-score-container';
        container.innerHTML = `
            <div class="high-score-header">
                <h2>High Scores</h2>
                <button class="close-btn">×</button>
            </div>
            <div class="high-score-content">
                <div class="loading">Loading high scores...</div>
            </div>
        `;
        
        document.body.appendChild(container);
        
        // Add event listener to close button
        const closeBtn = container.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(container);
        });
        
        // If the game is active, use the track's high score display
        if (window.game && window.game.track) {
            window.game.track.loadHighScores(container);
        } else {
            // If no game is active, fetch high scores directly
            this.loadPreGameHighScores(container);
        }
    }

    // Method to load high scores when game hasn't started yet
    async loadPreGameHighScores(container) {
        try {
            // Update the baseUrl to point to the correct API server
            const baseUrl = window.SERVER_URL || (window.location.hostname === 'localhost' 
                ? `http://${window.location.hostname}:1337`   // Development
                : 'https://api.example.com');     // Production - Use your actual API server
            
            const apiUrl = `${baseUrl}/api/highscores`;
            console.log("[DEBUG-UI] Loading pregame high scores from:", apiUrl);
            
            const response = await fetch(apiUrl, {
                credentials: 'include'  // Important for cookies
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[DEBUG-UI] Failed to fetch high scores: Status ${response.status}`, errorText);
                throw new Error(`Failed to fetch high scores: ${response.statusText}`);
            }
            
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                console.error("[DEBUG-UI] API response is not JSON:", text.substring(0, 100) + "...");
                throw new Error("API response is not JSON");
            }
            
            const allHighScores = await response.json();
            console.log("[DEBUG-UI] Retrieved all high scores:", allHighScores);
            
            const content = container.querySelector('.high-score-content');
            
            // If no high scores available or it's not an object
            if (!allHighScores || typeof allHighScores !== 'object' || Object.keys(allHighScores).length === 0) {
                content.innerHTML = '<div class="no-scores">No high scores recorded yet!</div>';
                return;
            }
            
            // Debug log the available track IDs
            console.log("[DEBUG-UI] Available track IDs:", Object.keys(allHighScores));
            
            // Only show default track
            const defaultTrackId = 'default';
            const scores = allHighScores[defaultTrackId];
            
            // Debug log the scores for the default track
            console.log("[DEBUG-UI] Scores for track", defaultTrackId, ":", scores);
            
            if (!Array.isArray(scores) || scores.length === 0) {
                content.innerHTML = '<div class="no-scores">No high scores for this track yet!</div>';
                return;
            }
            
            let html = `
                <table class="high-score-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th>Time</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            scores.forEach((score, index) => {
                html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${this.escapeHtml(score.name)}</td>
                        <td>${score.time.toFixed(2)}s</td>
                        <td>${new Date(score.timestamp).toLocaleDateString()}</td>
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
            console.error("[DEBUG-UI] Error loading high scores:", error);
        }
    }

    // Helper method to escape HTML
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Placeholder for settings
    showSettings() {
        console.log('[DEBUG-UI] Showing settings');
        const container = document.createElement('div');
        container.className = 'high-score-container';
        container.innerHTML = `
            <div class="high-score-header">
                <h2>Settings</h2>
                <button class="close-btn">×</button>
            </div>
            <div class="high-score-content">
                <p>Settings will be available in a future update.</p>
            </div>
        `;
        
        document.body.appendChild(container);
        
        const closeBtn = container.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(container);
        });
    }

    // Placeholder for showing friends room UI
    showFriendsRoomUI() {
        console.log('[DEBUG-UI] Showing friends room UI');
        const friendsRoomUI = new FriendsRoomUI(this, this.game);
        friendsRoomUI.show();
    }

    async startMultiplayerGame(roomId, playerName) {
        console.log('[DEBUG-UI] Starting multiplayer game with room:', roomId);
        
        try {
            // Save the player name if valid
            if (typeof playerName === 'string' && !playerName.includes('[object')) {
                localStorage.setItem('playerName', playerName);
            }

            // Remove UI elements
            if (this.container) {
                this.container.remove();
            }
            const friendsRoomUI = document.querySelector('.friends-room-container');
            if (friendsRoomUI) {
                friendsRoomUI.remove();
            }

            // Ensure we're disconnected from any existing rooms
            if (this.game.multiplayerManager) {
                console.log('[DEBUG-UI] Disconnecting from any existing rooms...');
                await this.game.multiplayerManager.disconnect();
            }

            // First start the game in friends mode
            console.log('[DEBUG-UI] Starting game in friends mode');
            this.onStart('friends', playerName);

            // Wait for game initialization
            const waitForGameInit = async () => {
                const maxAttempts = 10;
                const delayMs = 100;
                
                for (let i = 0; i < maxAttempts; i++) {
                    if (this.game.gameInitialized && this.game.car && this.game.track) {
                        console.log('[DEBUG-UI] Game initialized successfully');
                        return true;
                    }
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                throw new Error('Game initialization timeout');
            };

            await waitForGameInit();

            // Now join the multiplayer room
            console.log('[DEBUG-UI] Joining private room:', roomId);
            await this.game.joinMultiplayerGame(roomId, playerName);
            console.log('[DEBUG-UI] Successfully joined multiplayer room');

        } catch (error) {
            console.error('[DEBUG-UI] Error in startMultiplayerGame:', error);
            
            // Recreate UI if needed
            if (!this.container) {
                this.createUI();
            }
            this.showErrorMessage('Failed to join room. Please try again.');
        }
    }
}