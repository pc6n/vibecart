export class MultiplayerUI {
    constructor(game) {
        this.game = game;
        this.container = null;
        this.createUI();
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'multiplayer-ui';
        this.container.style.position = 'fixed';
        this.container.style.top = '20px';
        this.container.style.left = '50%';
        this.container.style.transform = 'translateX(-50%)';
        this.container.style.zIndex = '1000';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.container.style.alignItems = 'center';
        this.container.style.gap = '10px';

        document.body.appendChild(this.container);

        this.createMainMenu();
    }

    createMainMenu() {
        this.clearContainer();

        const title = document.createElement('h2');
        title.textContent = 'Multiplayer Racing';
        title.style.color = 'white';
        title.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        this.container.appendChild(title);

        const createButton = this.createButton('Create Game');
        createButton.onclick = () => this.showCreateGame();

        const joinButton = this.createButton('Join Game');
        joinButton.onclick = () => this.showJoinGame();

        this.container.appendChild(createButton);
        this.container.appendChild(joinButton);
    }

    showCreateGame() {
        this.clearContainer();

        const nameInput = this.createInput('Enter your name');
        const createButton = this.createButton('Create Room');

        createButton.onclick = async () => {
            const playerName = nameInput.value.trim() || 'Player';
            const roomId = await this.game.startMultiplayerGame(playerName);
            this.showGameRoom(roomId);
        };

        this.container.appendChild(nameInput);
        this.container.appendChild(createButton);
        this.container.appendChild(this.createBackButton());
    }

    showJoinGame() {
        this.clearContainer();

        const nameInput = this.createInput('Enter your name');
        const roomInput = this.createInput('Enter room code');
        const joinButton = this.createButton('Join Room');

        joinButton.onclick = async () => {
            const playerName = nameInput.value.trim() || 'Player';
            const roomId = roomInput.value.trim();
            if (roomId) {
                await this.game.joinMultiplayerGame(roomId, playerName);
                this.showGameRoom(roomId);
            }
        };

        this.container.appendChild(nameInput);
        this.container.appendChild(roomInput);
        this.container.appendChild(joinButton);
        this.container.appendChild(this.createBackButton());
    }

    showGameRoom(roomId) {
        this.clearContainer();

        const roomInfo = document.createElement('div');
        roomInfo.style.backgroundColor = 'rgba(0,0,0,0.7)';
        roomInfo.style.padding = '10px 20px';
        roomInfo.style.borderRadius = '5px';
        roomInfo.style.color = 'white';
        roomInfo.innerHTML = `Room Code: <strong>${roomId}</strong>`;

        const leaveButton = this.createButton('Leave Game');
        leaveButton.onclick = () => {
            this.game.cleanup();
            this.createMainMenu();
        };

        this.container.appendChild(roomInfo);
        this.container.appendChild(leaveButton);
    }

    createButton(text) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.padding = '10px 20px';
        button.style.fontSize = '16px';
        button.style.borderRadius = '5px';
        button.style.border = 'none';
        button.style.backgroundColor = '#4CAF50';
        button.style.color = 'white';
        button.style.cursor = 'pointer';
        button.style.transition = 'background-color 0.3s';

        button.onmouseover = () => {
            button.style.backgroundColor = '#45a049';
        };
        button.onmouseout = () => {
            button.style.backgroundColor = '#4CAF50';
        };

        return button;
    }

    createInput(placeholder) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        input.style.padding = '10px';
        input.style.fontSize = '16px';
        input.style.borderRadius = '5px';
        input.style.border = '1px solid #ddd';
        input.style.width = '200px';
        return input;
    }

    createBackButton() {
        const button = this.createButton('Back');
        button.onclick = () => this.createMainMenu();
        return button;
    }

    clearContainer() {
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    }
} 