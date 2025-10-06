import * as THREE from 'three';
import { io } from 'socket.io-client';

export class WebRTCManager {
    constructor() {
        this.connections = new Map(); // peerId -> RTCPeerConnection
        this.dataChannels = new Map(); // peerId -> RTCDataChannel
        this.handlers = new Map(); // eventType -> handler
        this.localId = crypto.randomUUID();
        this.isHost = false;
        this.socket = null;
        this.roomId = null;
        this.playerName = null;
        this.pendingIceCandidates = new Map(); // peerId -> candidate[]
        this.forceTurn = false;
        
        // Add log level control
        this.logLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'info';
        this.healthCheckInterval = 5000; // 5 seconds between health checks
        this.lastHealthCheckLog = 0;
        
        // Add more STUN/TURN servers for better connectivity
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ];
        
        // Create debug log UI with reduced default visibility
        this.createDebugLogUI(false);
        this.addDebugControls();
        
        this.log('debug', 'WebRTC Manager initialized');
    }
    
    async connect(roomId, playerName) {
        this.roomId = roomId;
        this.playerName = playerName;
        
        // Connect to signaling server
        const serverUrl = process.env.NODE_ENV === 'production' 
            ? 'https://vibecart.ch'
            : 'http://localhost:3001';
            
        this.log('info', `Connecting to signaling server at ${serverUrl}`);
        this.socket = io(serverUrl, {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 3,
            timeout: 20000
        });
        
        // Set up socket event handlers
        this.setupSocketHandlers();
        
        // Join room
        this.socket.emit('join-room', { roomId, playerName });
        
        return new Promise((resolve, reject) => {
            this.socket.once('connect', () => {
                this.log('debug', '[WebRTC] Connected to signaling server');
                
                // Send any pending ICE candidates
                this.pendingIceCandidates.forEach((candidates, peerId) => {
                    candidates.forEach(candidate => {
                        this.socket.emit('ice-candidate', {
                            to: peerId,
                            candidate
                        });
                    });
                });
                this.pendingIceCandidates.clear();
            });
            
            this.socket.once('room-joined', (data) => {
                this.log('debug', `[WebRTC] Joined room ${roomId} with ${data.peers.length} peers`);
                resolve(data);
            });
            
            this.socket.once('error', (error) => {
                this.log('error', `[WebRTC] Failed to join room: ${error.message}`, error);
                reject(error);
            });
        });
    }
    
    setupSocketHandlers() {
        this.socket.on('peer-joined', async (data) => {
            console.log(`[WebRTC] Peer joined: ${data.peerId}`);
            const pc = await this.createPeerConnection(data.peerId);
            
            // Create and send offer only if we're the initiator (the one who was in the room first)
            if (this.isHost || this.socket.id < data.peerId) {
                try {
                    // Create data channel before creating offer
                    const dataChannel = pc.createDataChannel(`data-${data.peerId}`, {
                        ordered: true,
                        maxRetransmits: 3
                    });
                    await this.setupDataChannel(dataChannel, data.peerId);
                    
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    console.log(`[WebRTC] Sending offer to peer ${data.peerId}`);
                    this.socket.emit('offer', { to: data.peerId, offer });
                } catch (error) {
                    console.error(`[WebRTC] Error creating offer:`, error);
                }
            }
        });
        
        this.socket.on('offer', async (data) => {
            console.log(`[WebRTC] Received offer from ${data.from}`);
            try {
                const pc = await this.createPeerConnection(data.from);
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                
                // Create answer
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                console.log(`[WebRTC] Sending answer to peer ${data.from}`);
                this.socket.emit('answer', { to: data.from, answer });
            } catch (error) {
                console.error(`[WebRTC] Error handling offer:`, error);
            }
        });
        
        this.socket.on('answer', async (data) => {
            console.log(`[WebRTC] Received answer from ${data.from}`);
            try {
                const pc = this.connections.get(data.from);
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    console.log(`[WebRTC] Connection established with ${data.from}`);
                }
            } catch (error) {
                console.error(`[WebRTC] Error handling answer:`, error);
            }
        });
        
        this.socket.on('ice-candidate', async (data) => {
            try {
                const pc = this.connections.get(data.from);
                if (pc) {
                    if (pc.remoteDescription) {
                        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                        console.log(`[WebRTC] Added ICE candidate from peer ${data.from}`);
                    } else {
                        // Queue the candidate if remote description is not set yet
                        if (!this.pendingIceCandidates.has(data.from)) {
                            this.pendingIceCandidates.set(data.from, []);
                        }
                        this.pendingIceCandidates.get(data.from).push(data.candidate);
                        console.log(`[WebRTC] Queued ICE candidate for peer ${data.from}`);
                    }
                }
            } catch (error) {
                console.error(`[WebRTC] Error adding ICE candidate:`, error);
            }
        });

        this.socket.on('peer-left', (data) => {
            console.log(`[WebRTC] Peer left: ${data.peerId}`);
            this.removePeerConnection(data.peerId);
        });
    }
    
    async createPeerConnection(peerId) {
        // If we already have a connection, close it first
        if (this.connections.has(peerId)) {
            console.log(`[WebRTC] Closing existing connection for ${peerId}`);
            const existingConn = this.connections.get(peerId);
            existingConn.close();
            this.connections.delete(peerId);
            
            // Also clean up any existing data channel
            if (this.dataChannels.has(peerId)) {
                const existingChannel = this.dataChannels.get(peerId);
                existingChannel.close();
                this.dataChannels.delete(peerId);
            }
        }
        
        console.log(`[WebRTC] Creating new peer connection for ${peerId}`);
        
        const pc = new RTCPeerConnection({
            iceServers: this.iceServers,
            iceTransportPolicy: this.forceTurn ? 'relay' : 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceCandidatePoolSize: 10
        });
        
        // Store the connection
        this.connections.set(peerId, pc);
        
        // ICE candidate handling
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`[WebRTC] New ICE candidate for peer ${peerId}:`, {
                    type: event.candidate.type,
                    protocol: event.candidate.protocol,
                    address: event.candidate.address
                });
                
                if (this.socket?.connected) {
                    this.socket.emit('ice-candidate', {
                        to: peerId,
                        candidate: event.candidate
                    });
                } else {
                    if (!this.pendingIceCandidates.has(peerId)) {
                        this.pendingIceCandidates.set(peerId, []);
                    }
                    this.pendingIceCandidates.get(peerId).push(event.candidate);
                }
            } else {
                console.log(`[WebRTC] All ICE candidates gathered for peer ${peerId}`);
            }
        };
        
        // ICE gathering state monitoring
        pc.onicegatheringstatechange = () => {
            console.log(`[WebRTC] ICE gathering state with ${peerId}: ${pc.iceGatheringState}`);
        };
        
        // ICE connection state monitoring
        pc.oniceconnectionstatechange = () => {
            console.log(`[WebRTC] ICE connection state with ${peerId}: ${pc.iceConnectionState}`);
            
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                // Create data channel after successful ICE connection
                this.createDataChannelIfNeeded(peerId).catch(error => {
                    console.error(`[WebRTC] Failed to create data channel:`, error);
                });
            } else if (pc.iceConnectionState === 'failed') {
                console.log(`[WebRTC] ICE connection failed with ${peerId}, enabling TURN...`);
                this.forceTurn = true;
                this.handleConnectionFailure(peerId);
            }
        };
        
        // Connection state monitoring
        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Connection state with ${peerId}: ${pc.connectionState}`);
            
            if (pc.connectionState === 'connected') {
                this.emit('peerConnected', peerId);
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.emit('peerDisconnected', peerId);
                // Clean up failed connection
                if (pc.connectionState === 'failed') {
                    this.handleConnectionFailure(peerId);
                }
            }
        };
        
        // Handle incoming data channels
        pc.ondatachannel = (event) => {
            console.log(`[WebRTC] Received data channel from peer ${peerId}`);
            this.setupDataChannel(event.channel, peerId);
        };
        
        return pc;
    }
    
    async createDataChannelIfNeeded(peerId) {
        if (!this.connections.has(peerId)) {
            throw new Error(`No connection exists for peer ${peerId}`);
        }
        
        // Check if we already have a working channel
        if (this.dataChannels.has(peerId)) {
            const existingChannel = this.dataChannels.get(peerId);
            if (existingChannel.readyState === 'open') {
                return existingChannel;
            }
            // Close non-open channel
            existingChannel.close();
            this.dataChannels.delete(peerId);
        }
        
        const pc = this.connections.get(peerId);
        const isIceConnected = pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed';
        
        if (!isIceConnected) {
            console.log(`[WebRTC] Waiting for ICE connection before creating data channel for peer ${peerId}. Current state: ${pc.iceConnectionState}`);
            return new Promise((resolve, reject) => {
                let timeoutId;
                const checkInterval = setInterval(() => {
                    const newState = pc.iceConnectionState;
                    if (newState === 'connected' || newState === 'completed') {
                        clearInterval(checkInterval);
                        clearTimeout(timeoutId);
                        this.createDataChannelIfNeeded(peerId).then(resolve).catch(reject);
                    } else if (newState === 'failed' || newState === 'closed' || newState === 'disconnected') {
                        clearInterval(checkInterval);
                        clearTimeout(timeoutId);
                        reject(new Error(`ICE connection failed for peer ${peerId}`));
                    }
                }, 100);
                
                // Timeout after 10 seconds
                timeoutId = setTimeout(() => {
                    clearInterval(checkInterval);
                    reject(new Error(`Timeout waiting for ICE connection with peer ${peerId}`));
                }, 10000);
            });
        }
        
        try {
            console.log(`[WebRTC] Creating new data channel for peer ${peerId}`);
            const channel = pc.createDataChannel(`data-${peerId}`, {
                ordered: true,
                maxRetransmits: 3
            });
            
            await this.setupDataChannel(channel, peerId);
            return channel;
            
        } catch (error) {
            console.error(`[WebRTC] Failed to create data channel for peer ${peerId}:`, error);
            throw error;
        }
    }
    
    async setupDataChannel(channel, peerId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Data channel setup timeout'));
            }, 5000);
            
            channel.onopen = () => {
                clearTimeout(timeout);
                console.log(`[WebRTC] Data channel opened with peer ${peerId}`);
                this.dataChannels.set(peerId, channel);
                this.emit('dataChannelOpen', peerId);
                resolve(channel);
            };
            
            channel.onclose = () => {
                console.log(`[WebRTC] Data channel closed with peer ${peerId}`);
                this.dataChannels.delete(peerId);
                this.emit('dataChannelClose', peerId);
            };
            
            channel.onerror = (error) => {
                console.error(`[WebRTC] Data channel error with peer ${peerId}:`, error);
                this.emit('dataChannelError', { peerId, error });
            };
            
            channel.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.emit(data.type, data.payload, peerId);
                } catch (error) {
                    console.error(`[WebRTC] Failed to parse message from ${peerId}:`, error);
                }
            };
        });
    }
    
    async handleConnectionFailure(peerId) {
        console.log(`[WebRTC] Handling connection failure for peer ${peerId}`);
        
        // Remove existing connection and data channel
        this.removePeerConnection(peerId);
        
        // Wait a moment before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Attempt to recreate the connection with TURN enabled
        try {
            this.forceTurn = true;
            const pc = await this.createPeerConnection(peerId);
            console.log(`[WebRTC] Successfully recreated connection for peer ${peerId} with TURN enabled`);
            
            // Create a new offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            // Emit the offer through the signaling server
            if (this.socket && this.socket.connected) {
                this.socket.emit('offer', {
                    to: peerId,
                    offer: pc.localDescription
                });
            }
        } catch (error) {
            console.error(`[WebRTC] Failed to recreate connection for peer ${peerId}:`, error);
        }
    }

    async handleDataChannelFailure(peerId) {
        console.log(`[WebRTC] Handling data channel failure for peer ${peerId}`);
        
        const pc = this.connections.get(peerId);
        if (!pc) return;
        
        // Try to recreate the data channel
        try {
            const channel = pc.createDataChannel('gameState', {
                ordered: true,
                maxRetransmits: 3,
                negotiated: true,
                id: 0
            });
            await this.setupDataChannel(channel, peerId);
            console.log(`[WebRTC] Successfully recreated data channel for peer ${peerId}`);
        } catch (error) {
            console.error(`[WebRTC] Failed to recreate data channel for peer ${peerId}:`, error);
        }
    }

    removePeerConnection(peerId) {
        console.log(`[WebRTC] Removing peer connection for ${peerId}`);
        
        try {
            // Close and remove RTCPeerConnection
            const pc = this.connections.get(peerId);
            if (pc) {
                // Remove all event listeners to avoid memory leaks
                pc.onicecandidate = null;
                pc.onconnectionstatechange = null;
                pc.oniceconnectionstatechange = null;
                pc.onsignalingstatechange = null;
                pc.ondatachannel = null;
                
                // Close the connection
                pc.close();
                this.connections.delete(peerId);
                console.log(`[WebRTC] Closed RTCPeerConnection for ${peerId}`);
            }
            
            // Close and remove data channel
            const channel = this.dataChannels.get(peerId);
            if (channel) {
                // Remove all event listeners
                channel.onopen = null;
                channel.onclose = null;
                channel.onerror = null;
                channel.onmessage = null;
                
                // Close the channel
                if (channel.readyState !== 'closed') {
                    channel.close();
                }
                this.dataChannels.delete(peerId);
                console.log(`[WebRTC] Closed data channel for ${peerId}`);
            }
            
            // Clean up pending ICE candidates
            if (this.pendingIceCandidates.has(peerId)) {
                this.pendingIceCandidates.delete(peerId);
                console.log(`[WebRTC] Cleared pending ICE candidates for ${peerId}`);
            }
            
            // Emit disconnection event for this peer only
            const handler = this.handlers.get('peer-disconnected');
            if (handler) {
                handler({ peerId });
            }
            
            console.log(`[WebRTC] Successfully removed all resources for peer ${peerId}`);
        } catch (error) {
            console.error(`[WebRTC] Error while removing peer connection for ${peerId}:`, error);
        }
    }
    
    on(eventType, handler) {
        this.handlers.set(eventType, handler);
    }
    
    emit(eventType, data) {
        this.dataChannels.forEach(channel => {
            if (channel.readyState === 'open') {
                channel.send(JSON.stringify({ type: eventType, ...data }));
            }
        });
    }
    
    // Add method to broadcast to all peers
    broadcastToAll(type, payload) {
        const message = JSON.stringify({ type, payload });
        let successCount = 0;
        let failCount = 0;
        let pendingChannels = [];

        this.dataChannels.forEach((channel, peerId) => {
            try {
                if (channel.readyState === 'open') {
                    channel.send(message);
                    successCount++;
                } else if (channel.readyState === 'connecting') {
                    pendingChannels.push(peerId);
                } else {
                    // Only attempt to recreate channel if we haven't tried recently
                    const now = Date.now();
                    const lastAttempt = this._lastChannelAttempt?.get(peerId) || 0;
                    if (now - lastAttempt >= 1000) {
                        this.createDataChannelIfNeeded(peerId).catch(err => {
                            console.error(`[WebRTC] Failed to recreate data channel for ${peerId}:`, err);
                        });
                    }
                    failCount++;
                }
            } catch (error) {
                console.error(`[WebRTC] Error sending to peer ${peerId}:`, error);
                failCount++;
            }
        });

        // Only log if there were actual failures (not just pending connections)
        if (failCount > 0) {
            console.log(`[WebRTC] Broadcast stats - Success: ${successCount}, Failed: ${failCount}, Pending: ${pendingChannels.length}`);
        }

        return { successCount, failCount, pendingChannels };
    }
    
    // Add method to send to specific peer
    sendToPeer(peerId, eventType, data) {
        const channel = this.dataChannels.get(peerId);
        if (channel && channel.readyState === 'open') {
            try {
                channel.send(JSON.stringify({ type: eventType, ...data }));
                this.log('debug', `[WebRTC] Sent ${eventType} to peer ${peerId}`);
            } catch (error) {
                this.log('error', `[WebRTC] Failed to send to peer ${peerId}: ${error.message}`, 'error');
            }
        } else {
            this.log('warn', `[WebRTC] Cannot send to peer ${peerId}, channel not ready`, 'warning');
        }
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.connections.forEach(pc => pc.close());
        this.connections.clear();
        
        this.dataChannels.forEach(channel => channel.close());
        this.dataChannels.clear();
        
        // Reset host status on disconnect
        this.isHost = false;
    }
    
    setAsHost(isHost) {
        this.log('debug', `[WebRTC] Setting host status to: ${isHost}`);
        this.isHost = isHost;
    }
    
    // Debug UI methods remain unchanged
    createDebugLogUI(visible = false) {
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            max-width: 400px;
            max-height: 200px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            border-radius: 5px;
            overflow-y: auto;
            z-index: 9999;
            display: ${visible ? 'block' : 'none'};
        `;
        
        // Create log content
        const content = document.createElement('div');
        content.id = 'webrtc-debug-log';
        container.appendChild(content);
        
        // Add minimize/maximize button
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '−';
        toggleBtn.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            background: none;
            border: none;
            color: #fff;
            cursor: pointer;
            font-size: 16px;
            padding: 0 5px;
        `;
        
        let isMinimized = false;
        toggleBtn.onclick = () => {
            isMinimized = !isMinimized;
            content.style.display = isMinimized ? 'none' : 'block';
            toggleBtn.textContent = isMinimized ? '+' : '−';
            container.style.height = isMinimized ? 'auto' : '';
        };
        
        container.appendChild(toggleBtn);
        document.body.appendChild(container);
        this.debugLogElement = content;
    }
    
    log(level, message, data = null) {
        const levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };

        const levelColors = {
            debug: '#808080',
            info: '#00C851',
            warn: '#ffbb33',
            error: '#ff4444'
        };

        if (levels[level] >= levels[this.logLevel]) {
            const formattedMessage = `[WebRTC] ${message}`;
            if (data) {
                console.log(formattedMessage, data);
            } else {
                console.log(formattedMessage);
            }

            // Update UI log if enabled
            if (this.debugLogElement) {
                const entry = document.createElement('div');
                entry.style.marginBottom = '5px';
                entry.style.borderLeft = `3px solid ${levelColors[level]}`;
                entry.style.paddingLeft = '5px';
                entry.textContent = formattedMessage;
                this.debugLogElement.appendChild(entry);

                while (this.debugLogElement.children.length > 20) {
                    this.debugLogElement.removeChild(this.debugLogElement.firstChild);
                }
                this.debugLogElement.scrollTop = this.debugLogElement.scrollHeight;
            }
        }
    }
    
    addDebugControls() {
        if (typeof window !== 'undefined') {
            window.debugWebRTC = {
                ...window.debugWebRTC,
                setLogLevel: (level) => this.setLogLevel(level),
                showDebugUI: (show = true) => {
                    if (this.debugLogElement) {
                        this.debugLogElement.parentElement.style.display = show ? 'block' : 'none';
                    }
                },
                forceTurn: (value = true) => {
                    this.forceTurn = value;
                    console.log(`[WebRTC Debug] Force TURN relay set to: ${value}`);
                    
                    if (value) {
                        console.log('[WebRTC Debug] Next connections will use iceTransportPolicy: relay');
                        console.log('[WebRTC Debug] This forces the use of TURN servers as relays');
                    } else {
                        console.log('[WebRTC Debug] Next connections will use iceTransportPolicy: all');
                    }
                    
                    return `TURN relay forced: ${value}`;
                },
                getStats: async () => {
                    const stats = [];
                    for (const [peerId, conn] of this.connections.entries()) {
                        try {
                            const peerStats = await conn.getStats();
                            const statsData = {};
                            peerStats.forEach(report => {
                                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                                    statsData.activePair = report;
                                }
                                if (report.type === 'local-candidate') {
                                    statsData.localCandidate = statsData.localCandidate || [];
                                    statsData.localCandidate.push(report);
                                }
                                if (report.type === 'remote-candidate') {
                                    statsData.remoteCandidate = statsData.remoteCandidate || [];
                                    statsData.remoteCandidate.push(report);
                                }
                            });
                            stats.push({ peerId, stats: statsData });
                        } catch (e) {
                            console.error(`Failed to get stats for peer ${peerId}:`, e);
                        }
                    }
                    console.table(stats);
                    return stats;
                }
            };
            this.log('debug', 'Debug commands available in window.debugWebRTC');
        }
    }

    createDataChannel(peerId) {
        try {
            const connection = this.connections.get(peerId);
            if (!connection) {
                console.error(`[WebRTC] Cannot create data channel: no connection for peer ${peerId}`);
                return null;
            }

            // Create data channel with specific options for reliable game state
            const dataChannel = connection.createDataChannel('gameState', {
                ordered: true,
                maxRetransmits: 1  // Allow one retry for lost packets
            });

            this.setupDataChannelHandlers(dataChannel, peerId);
            this.dataChannels.set(peerId, dataChannel);
            
            console.log(`[WebRTC] Created data channel for peer ${peerId}`);
            return dataChannel;
        } catch (error) {
            console.error(`[WebRTC] Error creating data channel for peer ${peerId}:`, error);
            return null;
        }
    }

    setupDataChannelHandlers(channel, peerId) {
        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type && this.handlers.has(data.type)) {
                    this.handlers.get(data.type)(data.payload, peerId);
                }
            } catch (error) {
                this.log('error', `Error processing message from peer ${peerId}:`, error);
            }
        };

        channel.onerror = (error) => {
            this.log('error', `Data channel error for peer ${peerId}:`, error);
            this.emit('dataChannelError', { peerId, error });
        };

        channel.onclose = () => {
            this.log('warn', `Data channel closed for peer ${peerId}`);
            this.dataChannels.delete(peerId);
            this.emit('dataChannelClose', { peerId });
        };
    }

    // Add method to control log level
    setLogLevel(level) {
        if (['debug', 'info', 'warn', 'error'].includes(level)) {
            this.logLevel = level;
            this.log('info', `Log level set to: ${level}`);
        }
    }
}