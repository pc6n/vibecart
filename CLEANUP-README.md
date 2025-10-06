# Security Cleanup for Public Release

This branch contains a cleaned-up version of the Racing Cart game with all sensitive information removed for public release.

## 🔒 Security Changes Made

### Removed Files
- `deploy.sh` - Deployment script with server credentials
- `deploy_server.sh` - Server deployment script
- `deploy-nginx.sh` - Nginx deployment script  
- `setup-turn-server.sh` - TURN server setup with credentials
- `test-turn-server.sh` - TURN server testing script
- `test-turn-server.js` - TURN server test file
- `nginx/racingcart.conf` - Server-specific nginx config
- `racingcart.conf` - Server-specific nginx config

### Environment Variables
- Created `.env.example` template for configuration
- Created `.env` for local development
- Updated all hardcoded URLs to use environment variables
- Updated all hardcoded secrets to use environment variables

### Code Changes
- Replaced hardcoded domain `vibecart.ch` with `api.example.com`
- Replaced hardcoded secrets with environment variable references
- Added environment variable loading script for client-side
- Updated server code to use `process.env` variables

## 🚀 Local Development

The game should still run locally with the following setup:

1. **Install dependencies:**
   ```bash
   npm install
   cd server && npm install
   ```

2. **Start the server:**
   ```bash
   cd server
   npm run dev
   ```

3. **Start the client:**
   ```bash
   npm run dev
   ```

## 📝 Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `SERVER_URL` - API server URL
- `CLIENT_SECRET` - Secret for score validation
- `TURN_SERVER_URL` - WebRTC TURN server URL
- `TURN_USERNAME` - TURN server username
- `TURN_CREDENTIAL` - TURN server password

## ⚠️ Important Notes

- **Deployment scripts removed** - You'll need to create your own deployment process
- **Server credentials removed** - Use your own server infrastructure
- **Domain names anonymized** - Replace with your own domains
- **Secrets moved to environment** - Configure via environment variables

## 🔧 For Production Deployment

1. Set up your own server infrastructure
2. Configure environment variables for your domain
3. Set up your own TURN server for WebRTC
4. Create your own deployment scripts
5. Configure SSL certificates for your domain

## 🎮 Game Features Preserved

All game functionality remains intact:
- Single player racing
- Multiplayer racing
- AI cars
- Power-ups and items
- High score system
- Private rooms with friends
- WebRTC peer-to-peer connections

The game is now safe for public release while maintaining all its features!
