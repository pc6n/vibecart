import { GameModes } from '../constants/GameModes';

/**
 * Handles the UI for creating and joining private rooms with friends
 */
export class FriendsRoomUI {
    /**
     * Creates a new FriendsRoomUI instance
     * @param {Object} gameUI - Reference to main GameUI for accessing name input and callbacks
     * @param {Object} game - Reference to the game instance
     */
    constructor(gameUI, game) {
        this.gameUI = gameUI;
        this.game = game;
        this.container = null;
    }

    /**
     * Shows the friends room UI
     */
    async show() {
        console.log('[DEBUG-UI] Showing friends room UI');
        
        // Check for room ID in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        
        if (roomId) {
            console.log('[DEBUG-UI] Found room ID in URL:', roomId);
            try {
                // Get player name from storage or prompt
                let playerName = localStorage.getItem('playerName');
                if (!playerName) {
                    // If no name stored, show the UI to get the name first
                    this.container = document.createElement('div');
                    this.container.className = 'friends-room-container';
                    this.container.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background-color: rgba(0, 0, 0, 0.9);
                        border: 2px solid #0ff;
                        border-radius: 10px;
                        padding: 20px;
                        color: white;
                        z-index: 1000;
                    `;
                    
                    this.container.innerHTML = `
                        <h3>Enter Your Name</h3>
                        <input type="text" id="quick-name-input" placeholder="Your name" style="
                            padding: 8px;
                            margin: 10px 0;
                            width: 200px;
                            border-radius: 4px;
                            border: none;
                        ">
                        <button id="quick-join-btn" style="
                            background-color: #2196F3;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            padding: 8px 16px;
                            cursor: pointer;
                        ">Join Game</button>
                    `;
                    
                    document.body.appendChild(this.container);
                    
                    // Setup quick join button
                    const quickJoinBtn = this.container.querySelector('#quick-join-btn');
                    const quickNameInput = this.container.querySelector('#quick-name-input');
                    
                    quickJoinBtn.addEventListener('click', async () => {
                        playerName = quickNameInput.value.trim();
                        if (!playerName) {
                            this.gameUI.showErrorMessage('Please enter your name first');
                            return;
                        }
                        localStorage.setItem('playerName', playerName);
                        this.container.remove();
                        await this.autoJoinRoom(roomId, playerName);
                    });
                    
                    return;
                }
                
                // If we have a name, join directly
                await this.autoJoinRoom(roomId, playerName);
                return;
            } catch (error) {
                console.error('[DEBUG-UI] Error auto-joining room:', error);
                this.gameUI.showErrorMessage('Failed to join room automatically. Please try again.');
            }
        }
        
        // If no room ID in URL or auto-join failed, show normal UI
        this.container = document.createElement('div');
        this.container.className = 'friends-room-container';
        this.container.style.cssText = `
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
        
        this.container.innerHTML = this.getHtml();
        document.body.appendChild(this.container);
        
        this.setupEventListeners();
    }

    /**
     * Automatically joins a room and starts the game
     * @param {string} roomId - The room ID to join
     * @param {string} playerName - The player's name
     */
    async autoJoinRoom(roomId, playerName) {
        console.log('[DEBUG-UI] Auto-joining room:', roomId, 'as:', playerName);
        await this.game.joinMultiplayerGame(roomId, playerName);
        this.gameUI.container.remove();
        this.gameUI.onStart('friends', playerName);
    }

    /**
     * Generates the HTML for the UI
     * @returns {string} HTML content
     */
    getHtml() {
        return `
            <div class="friends-room-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0;">Play with Friends</h2>
                <button class="close-btn" style="background: none; border: none; color: #0ff; font-size: 24px; cursor: pointer; padding: 0 5px;">×</button>
            </div>
            <div class="friends-room-content">
                <div class="options-container" style="display: flex; margin-bottom: 20px;">
                    <button id="create-option-btn" class="option-btn" style="
                        flex: 1;
                        background-color: #FF9800;
                        color: white;
                        border: none;
                        border-radius: 5px 0 0 5px;
                        padding: 10px;
                        font-size: 16px;
                        cursor: pointer;
                        transition: background-color 0.3s;
                        border-bottom: 3px solid #E65100;
                    ">New Room</button>
                    <button id="join-option-btn" class="option-btn" style="
                        flex: 1;
                        background-color: rgba(255, 255, 255, 0.2);
                        color: white;
                        border: none;
                        border-radius: 0 5px 5px 0;
                        padding: 10px;
                        font-size: 16px;
                        cursor: pointer;
                        transition: background-color 0.3s;
                    ">Join Room</button>
                </div>
                
                <!-- Create Room UI -->
                <div id="create-room-ui" class="room-info">
                    <p style="margin-bottom: 20px; font-size: 16px;">Create a private room and share the code with your friends!</p>
                    <button id="create-room-btn" class="create-room-btn" style="
                        background-color: #FF9800;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        padding: 12px 20px;
                        font-size: 16px;
                        cursor: pointer;
                        transition: background-color 0.3s;
                        width: 100%;
                        margin-bottom: 15px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">
                        <span style="margin-right: 8px; font-size: 20px;">➕</span>
                        <span>Create Room</span>
                    </button>
                </div>
                
                <!-- Join Room UI (initially hidden) -->
                <div id="join-room-ui" class="room-info" style="display: none;">
                    <p style="margin-bottom: 20px; font-size: 16px;">Enter the room code shared by your friend:</p>
                    <div style="display: flex; margin-bottom: 15px;">
                        <input id="room-code-input" type="text" placeholder="Enter room code" style="
                            flex-grow: 1;
                            padding: 12px;
                            border-radius: 5px 0 0 5px;
                            border: none;
                            font-size: 16px;
                            font-family: monospace;
                        ">
                        <button id="join-room-btn" style="
                            background-color: #2196F3;
                            color: white;
                            border: none;
                            border-radius: 0 5px 5px 0;
                            padding: 12px 20px;
                            font-size: 16px;
                            cursor: pointer;
                            transition: background-color 0.3s;
                            display: flex;
                            align-items: center;
                        ">
                            <span style="margin-right: 8px; font-size: 18px;">→</span>
                            <span>Join</span>
                        </button>
                    </div>
                </div>
                
                <!-- Room Code Container (shown after room creation) -->
                <div class="room-code-container" style="display: none; margin-top: 20px;">
                    <p style="margin-bottom: 10px; font-size: 16px;">Share this code with your friends:</p>
                    <div class="room-code" style="
                        display: flex;
                        background-color: rgba(255, 255, 255, 0.1);
                        border-radius: 5px;
                        padding: 10px;
                        margin-bottom: 15px;
                    ">
                        <span id="room-code-text" style="
                            flex-grow: 1;
                            font-family: monospace;
                            font-size: 18px;
                            padding: 5px;
                        "></span>
                        <button id="copy-room-code" class="copy-btn" style="
                            background-color: #4CAF50;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            padding: 5px 15px;
                            cursor: pointer;
                            transition: background-color 0.3s;
                            display: flex;
                            align-items: center;
                            gap: 5px;
                        ">
                            <span style="font-size: 16px;">📋</span>
                            <span>Copy</span>
                        </button>
                    </div>

                    <!-- Share buttons section -->
                    <div class="share-buttons" style="
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                        margin-bottom: 20px;
                    ">
                        <button id="share-whatsapp" class="share-btn" style="
                            background-color: #25D366;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            padding: 8px 12px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 5px;
                            font-size: 14px;
                        ">
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                <path d="M11.5 1c-5.8 0-10.5 4.7-10.5 10.5 0 1.8.5 3.5 1.3 5l-1.2 3.5 3.7-1.2c1.4.8 3 1.2 4.7 1.2 5.8 0 10.5-4.7 10.5-10.5s-4.7-10.5-10.5-10.5zm0 19c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3.1 1 1-3.1-.2-.3c-.8-1.4-1.3-2.9-1.3-4.5 0-4.9 4-8.8 8.8-8.8s8.8 3.9 8.8 8.8-3.9 8.8-8.7 8.8"/>
                            </svg>
                            <span>WhatsApp</span>
                        </button>
                        <button id="share-telegram" class="share-btn" style="
                            background-color: #0088cc;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            padding: 8px 12px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 5px;
                            font-size: 14px;
                        ">
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="currentColor">
                                <path d="M12 22c5.514 0 10-4.486 10-10s-4.486-10-10-10-10 4.486-10 10 4.486 10 10 10zm-3.5-7.5l9-4.5-9-4.5v3.5l4 1-4 1v3.5z"/>
                            </svg>
                            <span>Telegram</span>
                        </button>
                        <button id="native-share" class="share-btn" style="
                            background-color: #E91E63;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            padding: 8px 12px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 5px;
                            font-size: 14px;
                        ">
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="currentColor">
                                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                            </svg>
                            <span>Share</span>
                        </button>
                    </div>

                    <button id="start-game-btn" class="start-game-btn" style="
                        background-color: #2196F3;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        padding: 12px 20px;
                        font-size: 16px;
                        cursor: pointer;
                        transition: background-color 0.3s;
                        width: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                    ">
                        <span style="font-size: 18px;">🏁</span>
                        <span>Start Game</span>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Sets up all event listeners for the UI
     */
    setupEventListeners() {
        // Close button
        const closeBtn = this.container.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => {
            this.container.remove();
        });

        // Tab switching between create and join
        const createOption = this.container.querySelector('#create-option-btn');
        const joinOption = this.container.querySelector('#join-option-btn');
        const createUI = this.container.querySelector('#create-room-ui');
        const joinUI = this.container.querySelector('#join-room-ui');

        createOption.addEventListener('click', () => {
            createOption.style.backgroundColor = '#FF9800';
            createOption.style.borderBottom = '3px solid #E65100';
            joinOption.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            joinOption.style.borderBottom = 'none';
            createUI.style.display = 'block';
            joinUI.style.display = 'none';
        });

        joinOption.addEventListener('click', () => {
            joinOption.style.backgroundColor = '#2196F3';
            joinOption.style.borderBottom = '3px solid #0D47A1';
            createOption.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            createOption.style.borderBottom = 'none';
            joinUI.style.display = 'block';
            createUI.style.display = 'none';
        });

        // Create room button
        const createRoomBtn = this.container.querySelector('#create-room-btn');
        createRoomBtn.addEventListener('click', async () => {
            // Use the new createPrivateRoom method
            await this.createPrivateRoom();
        });

        // Join room button
        const joinRoomBtn = this.container.querySelector('#join-room-btn');
        const roomCodeInput = this.container.querySelector('#room-code-input');
        
        joinRoomBtn.addEventListener('click', async () => {
            // Get code from input
            const roomId = roomCodeInput.value.trim();
            
            if (!roomId) {
                this.showError('Please enter a room code');
                return;
            }
            
            // Get player name
            const playerName = this.gameUI.nameInput.value.trim() || localStorage.getItem('playerName') || 'Player';
            
            if (!playerName) {
                this.showError('Please enter your name first');
                return;
            }
            
            this.setLoading(true, 'Joining room...');
            
            try {
                // Join room
                await this.game.joinMultiplayerGame(roomId, playerName);
                
                // Close UI and start game
                this.gameUI.container.remove();
                this.container.remove();
                this.gameUI.onStart('friends', playerName);
                
                console.log('[DEBUG-UI] Joined room:', roomId);
            } catch (error) {
                console.error('[DEBUG-UI] Error joining room:', error);
                this.showError(`Failed to join room: ${error.message}`);
                this.setLoading(false);
            }
        });
    }

    /**
     * Sets up hover effects for all buttons
     */
    setupButtonHoverEffects() {
        const buttons = this.container.querySelectorAll('button');
        buttons.forEach(button => {
            if (button.className === 'close-btn') return;
            
            button.addEventListener('mouseenter', () => {
                if (button.id === 'create-room-btn') {
                    button.style.backgroundColor = '#FFB74D';
                } else if (button.id === 'copy-room-code') {
                    button.style.backgroundColor = '#66BB6A';
                } else if (button.id === 'start-game-btn') {
                    button.style.backgroundColor = '#64B5F6';
                } else if (button.id === 'join-room-btn') {
                    button.style.backgroundColor = '#64B5F6';
                }
            });
            
            button.addEventListener('mouseleave', () => {
                if (button.id === 'create-room-btn') {
                    button.style.backgroundColor = '#FF9800';
                } else if (button.id === 'copy-room-code') {
                    button.style.backgroundColor = '#4CAF50';
                } else if (button.id === 'start-game-btn') {
                    button.style.backgroundColor = '#2196F3';
                } else if (button.id === 'join-room-btn') {
                    button.style.backgroundColor = '#2196F3';
                }
            });
        });
    }

    /**
     * Sets up the create room button functionality
     */
    setupCreateRoomButton() {
        const createRoomBtn = this.container.querySelector('#create-room-btn');
        const createRoomUI = this.container.querySelector('#create-room-ui');
        const joinRoomUI = this.container.querySelector('#join-room-ui');
        
        createRoomBtn.addEventListener('click', async () => {
            try {
                const playerName = this.gameUI.nameInput.value.trim();
                if (!playerName) {
                    this.gameUI.showErrorMessage('Please enter your name first');
                    return;
                }
                
                this.setLoading(true, 'Creating room...');
                
                // Create multiplayer room
                const roomId = await this.game.startMultiplayerGame(playerName, true);
                
                // Store the room ID for sharing
                this.currentRoomId = roomId;
                
                // Update UI to show room code
                this.showRoomCode(roomId);
                
                // Important: DO NOT start the game yet - allow user to share and wait for friends
                // The waiting room UI will be shown when they click Start Game button
                this.setLoading(false);
                
                // Log status
                console.log('[DEBUG-UI] Created private room:', roomId);
            } catch (error) {
                console.error('[DEBUG-UI] Error creating private room:', error);
                this.showError(`Failed to create room: ${error.message}`);
                this.setLoading(false);
            }
        });
    }

    /**
     * Sets up the join room button functionality
     */
    setupJoinRoomButton() {
        const joinRoomBtn = this.container.querySelector('#join-room-btn');
        const roomCodeInput = this.container.querySelector('#room-code-input');
        const joinRoomUI = this.container.querySelector('#join-room-ui');
        
        joinRoomBtn.addEventListener('click', async () => {
            try {
                const playerName = this.gameUI.nameInput.value.trim();
                if (!playerName) {
                    this.gameUI.showErrorMessage('Please enter your name first');
                    return;
                }
                
                const roomCode = roomCodeInput.value.trim();
                if (!roomCode) {
                    this.showRoomError('Please enter a room code', joinRoomUI);
                    return;
                }
                
                // Join the private room
                await this.game.joinMultiplayerGame(roomCode, playerName);
                
                // Close the UI and start the game
                document.body.removeChild(this.container);
                this.gameUI.container.remove();
                this.gameUI.onStart('friends', playerName);
                
            } catch (error) {
                console.error('[DEBUG-UI] Error joining room:', error);
                this.showRoomError('Failed to join room. Please check the code and try again.', joinRoomUI);
            }
        });
        
        // Allow pressing Enter in the room code input field
        roomCodeInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                joinRoomBtn.click();
            }
        });
    }

    /**
     * Shows an error message in the room UI
     * @param {string} message - The error message to display
     * @param {HTMLElement} parent - The parent element to append the error to
     */
    showRoomError(message, parent) {
        const errorMsg = document.createElement('div');
        errorMsg.textContent = message;
        errorMsg.style.color = '#ff4d4d';
        errorMsg.style.fontSize = '14px';
        errorMsg.style.marginTop = '5px';
        
        // Remove any existing error
        const existingError = parent.querySelector('.room-code-error');
        if (existingError) {
            existingError.remove();
        }
        
        errorMsg.className = 'room-code-error';
        parent.appendChild(errorMsg);
    }

    /**
     * Sets up the copy button functionality
     * @param {string} roomId - The room ID to copy
     */
    setupCopyButton(roomId) {
        const copyBtn = this.container.querySelector('#copy-room-code');
        const whatsappBtn = this.container.querySelector('#share-whatsapp');
        const telegramBtn = this.container.querySelector('#share-telegram');
        const nativeShareBtn = this.container.querySelector('#native-share');
        const startGameBtn = this.container.querySelector('#start-game-btn');
        
        // Create a complete URL with the room ID
        const baseUrl = window.location.origin;
        const shareableUrl = `${baseUrl}?room=${roomId}`;
        const shareText = `Join my racing game! Click this link to play together: `;
        
        // Start Game button setup
        if (startGameBtn) {
            startGameBtn.addEventListener('click', () => {
                // Get player name
                const playerName = this.gameUI.nameInput ? 
                    this.gameUI.nameInput.value.trim() : 
                    localStorage.getItem('playerName') || 'Player';
                
                // Remove the UI containers
                if (this.container && this.container.parentNode) {
                    this.container.remove();
                }
                
                if (this.gameUI.container && this.gameUI.container.parentNode) {
                    this.gameUI.container.remove();
                }
                
                // Initialize the game with the room, but it will show waiting room instead of starting right away
                this.gameUI.onStart('friends', playerName);
            });
        }
        
        // Copy button
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(shareableUrl);
                    const originalHTML = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<span style="font-size: 16px;">✓</span><span>Copied!</span>';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalHTML;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy room URL:', err);
                }
            });
        }
        
        // WhatsApp sharing
        if (whatsappBtn) {
            whatsappBtn.addEventListener('click', () => {
                const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + shareableUrl)}`;
                window.open(whatsappUrl, '_blank');
            });
        }
        
        // Telegram sharing
        if (telegramBtn) {
            telegramBtn.addEventListener('click', () => {
                const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareableUrl)}&text=${encodeURIComponent(shareText)}`;
                window.open(telegramUrl, '_blank');
            });
        }
        
        // Native sharing (Web Share API - works great on mobile)
        if (nativeShareBtn) {
            if (navigator.share) {
                nativeShareBtn.addEventListener('click', async () => {
                    try {
                        await navigator.share({
                            title: 'Join my racing game!',
                            text: shareText,
                            url: shareableUrl
                        });
                        console.log('Shared successfully');
                    } catch (err) {
                        console.error('Error sharing:', err);
                    }
                });
            } else {
                // Hide native share button if not supported
                nativeShareBtn.style.display = 'none';
            }
        }
    }

    /**
     * Sets up the start game button functionality
     * @param {string} playerName - The player's name
     */
    setupStartGameButton(playerName) {
        const startGameBtn = this.container.querySelector('#start-game-btn');
        if (!startGameBtn) return;
        
        startGameBtn.addEventListener('click', () => {
            console.log('[DEBUG-UI] Start Game button clicked');
            
            // Remove the FriendsRoomUI container
            if (this.container && this.container.parentNode) {
                this.container.remove();
            }
            
            // Remove the GameUI container if it exists
            if (this.gameUI.container && this.gameUI.container.parentNode) {
                this.gameUI.container.remove();
            }
            
            // Start the game UI (this will initialize the game but not start the race)
            this.gameUI.onStart('friends', playerName);
            
            // The waiting room UI will be shown in game.js
            console.log('[DEBUG-UI] Game initialized, waiting room should appear');
        });
    }

    createTabs() {
        const tabContainer = document.createElement('div');
        tabContainer.classList.add('room-tabs');
        
        // Create New Tab
        const createTab = document.createElement('div');
        createTab.classList.add('room-tab');
        createTab.textContent = 'New Room';
        createTab.dataset.tab = 'create';
        createTab.addEventListener('click', () => this.showTab('create'));
        
        // Join Tab
        const joinTab = document.createElement('div');
        joinTab.classList.add('room-tab');
        joinTab.textContent = 'Join Room';
        joinTab.dataset.tab = 'join';
        joinTab.addEventListener('click', () => this.showTab('join'));
        
        // Add tabs to container
        tabContainer.appendChild(createTab);
        tabContainer.appendChild(joinTab);
        
        // Add tabs to modal
        this.modalContent.appendChild(tabContainer);
        
        // Set default tab
        this.showTab('create');
    }

    createCreateRoomTab() {
        const createContent = document.createElement('div');
        createContent.classList.add('tab-content', 'create-content');
        
        const createDescription = document.createElement('p');
        createDescription.textContent = 'Create a private room and share the code with your friends!';
        createContent.appendChild(createDescription);
        
        // Create Room button with icon
        const createRoomButton = document.createElement('button');
        createRoomButton.classList.add('action-button', 'create-room-button');
        
        // Add icon to button
        const buttonIcon = document.createElement('span');
        buttonIcon.classList.add('button-icon');
        buttonIcon.innerHTML = '➕';
        createRoomButton.appendChild(buttonIcon);
        
        // Add text to button
        const buttonText = document.createElement('span');
        buttonText.textContent = 'Create Room';
        createRoomButton.appendChild(buttonText);
        
        createRoomButton.addEventListener('click', () => this.createRoom());
        createContent.appendChild(createRoomButton);
        
        const createInfo = document.createElement('p');
        createInfo.classList.add('room-info');
        createInfo.textContent = 'Create a private room to play with friends';
        createContent.appendChild(createInfo);
        
        return createContent;
    }

    createModalContent() {
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            /* Existing styles */
            
            /* Updated tab styles to look more like tabs */
            .room-tabs {
                display: flex;
                border-bottom: 2px solid #444;
                margin-bottom: 20px;
            }
            
            .room-tab {
                padding: 10px 20px;
                cursor: pointer;
                background-color: #333;
                border-radius: 6px 6px 0 0;
                margin-right: 5px;
                border: 2px solid #444;
                border-bottom: none;
                transition: all 0.3s ease;
            }
            
            .room-tab.active {
                background-color: #f5a742;
                color: #000;
                border-color: #f5a742;
                font-weight: bold;
            }
            
            /* Action button distinct styling */
            .action-button {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 12px 24px;
                font-size: 18px;
                gap: 8px;
            }
            
            .button-icon {
                font-size: 20px;
            }
        `;
        
        // ... rest of existing code ...
    }

    async createPrivateRoom() {
        try {
            const playerName = this.gameUI.nameInput.value.trim() || localStorage.getItem('playerName') || 'Player';
            
            if (!playerName) {
                this.showError('Please enter your name first');
                return;
            }
            
            this.setLoading(true, 'Creating room...');
            
            // Create multiplayer room
            const roomId = await this.game.startMultiplayerGame(playerName, true);
            
            // Store the room ID for sharing
            this.currentRoomId = roomId;
            
            console.log('[DEBUG-UI] Room created successfully:', roomId);
            console.log('[DEBUG-UI] Multiplayer status:', this.game.isMultiplayer);
            console.log('[DEBUG-UI] Room creator status:', this.game.multiplayer?.isRoomCreator);
            
            // Close UI containers
            if (this.gameUI.container && this.gameUI.container.parentNode) {
                this.gameUI.container.remove();
            }
            
            if (this.container && this.container.parentNode) {
                this.container.remove();
            }
            
            // Start the game logic - this will also show the waiting room UI
            this.gameUI.onStart('friends', playerName);
            
            // Log status
            console.log('[DEBUG-UI] Created private room:', roomId);
        } catch (error) {
            console.error('[DEBUG-UI] Error creating private room:', error);
            this.showError(`Failed to create room: ${error.message}`);
            this.setLoading(false);
        }
    }

    showRoomCode(roomId) {
        // Show room code in UI
        const roomCodeContainer = this.container.querySelector('.room-code-container');
        const roomCodeText = this.container.querySelector('#room-code-text');
        
        if (roomCodeText) {
            roomCodeText.textContent = roomId;
        }
        
        if (roomCodeContainer) {
            roomCodeContainer.style.display = 'block';
        }
        
        // Hide create room UI and join room UI
        const createRoomUI = this.container.querySelector('#create-room-ui');
        const joinRoomUI = this.container.querySelector('#join-room-ui');
        
        if (createRoomUI) {
            createRoomUI.style.display = 'none';
        }
        
        if (joinRoomUI) {
            joinRoomUI.style.display = 'none';
        }
        
        // Hide options container
        const optionsContainer = this.container.querySelector('.options-container');
        if (optionsContainer) {
            optionsContainer.style.display = 'none';
        }
        
        // Add copy functionality
        this.setupCopyButton(roomId);
    }
    
    setLoading(isLoading, message = 'Loading...') {
        // Create or update loading indicator
        let loadingIndicator = this.container.querySelector('.loading-indicator');
        
        if (isLoading) {
            if (!loadingIndicator) {
                loadingIndicator = document.createElement('div');
                loadingIndicator.className = 'loading-indicator';
                loadingIndicator.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.7);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    z-index: 100;
                `;
                
                const spinner = document.createElement('div');
                spinner.style.cssText = `
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3498db;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    animation: spin 2s linear infinite;
                    margin-bottom: 10px;
                `;
                
                const messageElement = document.createElement('div');
                messageElement.className = 'loading-message';
                messageElement.textContent = message;
                
                loadingIndicator.appendChild(spinner);
                loadingIndicator.appendChild(messageElement);
                this.container.appendChild(loadingIndicator);
                
                // Add keyframes for spinner animation
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            } else {
                // Update existing loading indicator
                const messageElement = loadingIndicator.querySelector('.loading-message');
                if (messageElement) {
                    messageElement.textContent = message;
                }
                loadingIndicator.style.display = 'flex';
            }
        } else if (loadingIndicator) {
            // Hide loading indicator
            loadingIndicator.style.display = 'none';
        }
    }
    
    showError(message) {
        // Create error message
        const errorContainer = document.createElement('div');
        errorContainer.style.cssText = `
            background-color: rgba(255, 0, 0, 0.8);
            color: white;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 15px;
            text-align: center;
        `;
        errorContainer.textContent = message;
        
        // Add to container
        const header = this.container.querySelector('.friends-room-header');
        if (header && header.nextSibling) {
            this.container.insertBefore(errorContainer, header.nextSibling);
        } else {
            this.container.prepend(errorContainer);
        }
        
        // Remove after 5 seconds
        setTimeout(() => {
            errorContainer.remove();
        }, 5000);
    }
} 