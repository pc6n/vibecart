// Script to load environment variables for client-side use
// This should be included in the HTML before other scripts

(function() {
    // Default values for development
    const defaultEnv = {
        SERVER_URL: 'http://localhost:1337',
        CLIENT_SECRET: 'rc23',
        TURN_SERVER_URL: 'turn:localhost:3478',
        TURN_USERNAME: 'racingcart',
        TURN_CREDENTIAL: 'racingcart2024'
    };

    // Try to load from a global env object (set by build process)
    if (typeof window.ENV !== 'undefined') {
        Object.assign(window, window.ENV);
    } else {
        // Fallback to default values
        Object.assign(window, defaultEnv);
    }

    // Make environment variables available globally
    window.SERVER_URL = window.SERVER_URL || defaultEnv.SERVER_URL;
    window.CLIENT_SECRET = window.CLIENT_SECRET || defaultEnv.CLIENT_SECRET;
    window.TURN_SERVER_URL = window.TURN_SERVER_URL || defaultEnv.TURN_SERVER_URL;
    window.TURN_USERNAME = window.TURN_USERNAME || defaultEnv.TURN_USERNAME;
    window.TURN_CREDENTIAL = window.TURN_CREDENTIAL || defaultEnv.TURN_CREDENTIAL;

    console.log('[ENV] Environment variables loaded:', {
        SERVER_URL: window.SERVER_URL,
        CLIENT_SECRET: window.CLIENT_SECRET ? '[HIDDEN]' : 'undefined',
        TURN_SERVER_URL: window.TURN_SERVER_URL,
        TURN_USERNAME: window.TURN_USERNAME,
        TURN_CREDENTIAL: window.TURN_CREDENTIAL ? '[HIDDEN]' : 'undefined'
    });
})();
