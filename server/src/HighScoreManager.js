import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Client secret from environment variables
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'rc23';

/**
 * Manages the high score system with session-based validation
 */
export class HighScoreManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data');
        this.highScoresPath = path.join(this.dataPath, 'highscores.json');
        
        // Create data directory if it doesn't exist
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }
        
        // Initialize high scores
        this.highScores = this.loadHighScores();
        
        // Rate limiting for score submissions (IP-based)
        this.submitLimiter = {};
    }
    
    /**
     * Load high scores from disk
     */
    loadHighScores() {
        try {
            if (fs.existsSync(this.highScoresPath)) {
                const data = fs.readFileSync(this.highScoresPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading high scores:', error);
        }
        
        // Return empty object if no file exists
        return {};
    }
    
    /**
     * Save high scores to disk
     */
    saveHighScores() {
        try {
            fs.writeFileSync(this.highScoresPath, JSON.stringify(this.highScores, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Error saving high scores:', error);
            return false;
        }
    }
    
    /**
     * Check if a new score qualifies for top 3
     */
    isTopThreeScore(trackId, lapTime) {
        // Initialize track scores if needed
        if (!this.highScores[trackId]) {
            this.highScores[trackId] = [];
            return true;
        }
        
        // Get existing scores for this track
        const trackScores = this.highScores[trackId];
        
        // If less than 3 scores, always qualifies
        if (trackScores.length < 3) {
            return true;
        }
        
        // Sort scores and check if new score is better than 3rd place
        const sortedScores = [...trackScores].sort((a, b) => a.time - b.time);
        return lapTime < (sortedScores[2]?.time || Infinity);
    }
    
    /**
     * Get rank of a score (1-based)
     */
    getScoreRank(trackId, lapTime) {
        if (!this.highScores[trackId]) {
            return 1;
        }
        
        const trackScores = this.highScores[trackId];
        const sortedScores = [...trackScores].sort((a, b) => a.time - b.time);
        
        // Find position where this time would fit
        let rank = 1;
        for (const score of sortedScores) {
            if (lapTime <= score.time) {
                break;
            }
            rank++;
        }
        
        return rank;
    }
    
    /**
     * Check if submission rate limit is exceeded for an IP
     */
    checkRateLimit(ip) {
        const now = Date.now();
        const hourAgo = now - 3600000; // 1 hour
        
        // Initialize or clean old entries
        if (!this.submitLimiter[ip]) {
            this.submitLimiter[ip] = [];
        } else {
            this.submitLimiter[ip] = this.submitLimiter[ip].filter(time => time > hourAgo);
        }
        
        // Check if over limit (max 10 submissions per hour)
        if (this.submitLimiter[ip].length >= 10) {
            return false;
        }
        
        // Add current time
        this.submitLimiter[ip].push(now);
        return true;
    }
    
    /**
     * Verify the payload hash
     */
    verifyPayloadHash(scoreData) {
        const { hash, ...dataToVerify } = scoreData;
        if (!hash) return false;

        // Create hash of the payload using SHA-256
        const message = JSON.stringify(dataToVerify);
        const hasher = crypto.createHash('sha256');
        hasher.update(message);
        const expectedHash = hasher.digest('hex');

        return hash === expectedHash;
    }
    
    /**
     * Validate gameplay metrics and signature
     */
    validateGameplay(scoreData) {
        // First verify the payload hash
        if (!this.verifyPayloadHash(scoreData)) {
            console.log('Payload hash verification failed:', scoreData);
            return false;
        }

        // Basic validation
        if (scoreData.time < 3 || scoreData.time > 600) { // Between 3 and 600 seconds
            return false;
        }
        
        return true;
    }
    
    /**
     * Submit a new high score
     */
    async submitScore(submission, session) {
        try {
            console.log('Starting score submission process...');
            
            // Verify that there's an active game session
            if (!session || !session.gameStartTime) {
                console.log('No active game session');
                return { 
                    success: false, 
                    error: 'No active game session. You need to start a new game session before submitting another score.', 
                    needsNewSession: true 
                };
            }

            // Verify submission format
            if (!submission || !submission.data || !submission.hash || !submission.v) {
                console.log('Invalid submission format');
                return { success: false, error: 'Invalid submission format' };
            }

            // Decrypt and parse the payload
            let scoreData;
            try {
                const jsonStr = Buffer.from(submission.data, 'base64').toString();
                scoreData = JSON.parse(jsonStr);
            } catch (error) {
                console.error('Failed to decrypt/parse submission:', error);
                return { success: false, error: 'Invalid payload format' };
            }

            // Verify the hash
            console.log('Server received scoreData:', scoreData);
            console.log('Server received hash:', submission.hash);
            
            const encoder = new TextEncoder();
            const jsonToHash = JSON.stringify(scoreData);
            console.log('Server JSON string to hash:', jsonToHash);
            
            const data = encoder.encode(jsonToHash);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const calculatedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            console.log('Server calculated hash:', calculatedHash);

            if (calculatedHash !== submission.hash) {
                console.error('Hash verification failed');
                return { success: false, error: 'Invalid hash' };
            }

            console.log('Hash verification passed');

            // Verify timestamp is recent (within last 10 minutes)
            const now = Date.now();
            console.log('Current time:', now);
            console.log('Score timestamp:', scoreData.timestamp);
            console.log('Time difference (ms):', now - scoreData.timestamp);
            
            if (!scoreData.timestamp || now - scoreData.timestamp > 600000) { // 10 minutes (600000ms)
                console.log('Submission expired due to timestamp');
                return { success: false, error: 'Submission expired' };
            }

            console.log('Timestamp verification passed');

            // Verify track ID matches session
            console.log('Session track ID:', session.trackId);
            console.log('Score track ID:', scoreData.trackId);
            
            if (scoreData.trackId !== session.trackId) {
                console.log('Track ID mismatch');
                return { success: false, error: 'Track ID mismatch' };
            }

            console.log('Track ID verification passed');
            console.log('All verifications passed, proceeding with score submission');

            // Load existing scores for this track
            const trackScores = this.highScores[scoreData.trackId] || [];
            
            // Add the new score
            const newScore = {
                name: scoreData.name,
                time: scoreData.time,
                trackId: scoreData.trackId,
                timestamp: scoreData.timestamp,
                email: scoreData.email || null,
                verified: true
            };
            
            // Insert the new score
            trackScores.push(newScore);
            
            // Sort scores by time (ascending)
            trackScores.sort((a, b) => a.time - b.time);
            
            // Keep only top scores
            if (trackScores.length > 10) {
                trackScores.length = 10;
            }
            
            // Update scores for this track
            this.highScores[scoreData.trackId] = trackScores;
            
            // Save scores to file
            this.saveHighScores();
            
            // Calculate rank
            const rank = trackScores.findIndex(score => score === newScore) + 1;
            const isTopThree = rank <= 3;
            
            // Clear game session after successful submission
            session.gameStartTime = null;
            session.trackId = null;
            
            console.log('Score submitted successfully. Rank:', rank);
            
            return {
                success: true,
                rank,
                isTopThree
            };
        } catch (error) {
            console.error('Error submitting score:', error);
            return { success: false, error: 'Internal server error' };
        }
    }
    
    /**
     * Get top scores for a track
     */
    getTopScores(trackId) {
        if (!this.highScores[trackId]) {
            return [];
        }
        
        // Return sanitized scores (remove emails, hashes, etc.)
        return this.highScores[trackId]
            .sort((a, b) => a.time - b.time)
            .map(score => ({
                name: score.name,
                time: score.time,
                timestamp: score.timestamp,
                verified: score.verified
            }));
    }
    
    /**
     * Get all high scores
     */
    getAllHighScores() {
        const result = {};
        
        for (const trackId in this.highScores) {
            result[trackId] = this.getTopScores(trackId);
        }
        
        return result;
    }
    
    // Helper methods
    
    sanitizeName(name) {
        // Truncate and remove HTML tags
        return name.slice(0, 20).replace(/<[^>]*>/g, '');
    }
    
    hashEmail(email) {
        return crypto.createHash('sha256').update(email).digest('hex');
    }
} 