import { BaseTrack } from './BaseTrack.js';
import { CircularTrack } from './CircularTrack.js';
import { ModelTrack } from './ModelTrack.js';
import { SilverstoneTrack } from './SilverstoneTrack.js';

/**
 * TrackFactory - Factory class for creating different track types
 * This helps manage track creation in a more modular way
 */
export class TrackFactory {
  /**
   * Create a track of the specified type
   * @param {string} trackType - Type of track to create
   * @param {THREE.Scene} scene - Three.js scene to add the track to
   * @param {object} game - Game instance
   * @param {object} options - Options for the track
   * @returns {BaseTrack} Created track instance
   */
  static createTrack(trackType, scene, game, options = {}) {
    let track;
    
    switch(trackType.toLowerCase()) {
      case 'base':
        track = new BaseTrack(scene, game, options);
        break;
        
      case 'circular':
        track = new CircularTrack(scene, game, options);
        break;
        
      case 'model':
        track = new ModelTrack(scene, game, options);
        break;
        
      case 'silverstone':
        track = new SilverstoneTrack(scene, game);
        break;
        
      default:
        console.warn(`Unknown track type: ${trackType}, defaulting to CircularTrack`);
        track = new CircularTrack(scene, game, options);
    }
    
    // Don't initialize the track here, let the game handle it
    // This allows for better async control and error handling
    return track;
  }
  
  /**
   * Create a track from configuration object
   * @param {object} config - Track configuration
   * @param {THREE.Scene} scene - Three.js scene to add the track to
   * @param {object} game - Game instance
   * @returns {BaseTrack} Created track instance
   */
  static createTrackFromConfig(config, scene, game) {
    const { type, options = {} } = config;
    return this.createTrack(type, scene, game, options);
  }
  
  /**
   * Get list of available track types
   * @returns {Array} List of available track types
   */
  static getAvailableTrackTypes() {
    return [
      {
        id: 'circular',
        name: 'Circular Track',
        description: 'Simple circular race track'
      },
      {
        id: 'silverstone',
        name: 'Silverstone Circuit',
        description: 'Famous British racing circuit'
      }
    ];
  }
  
  /**
   * Get default track configuration
   * @returns {object} Default track configuration
   */
  static getDefaultTrack() {
    return {
      type: 'circular',
      options: {
        radius: 100,
        width: 20,
        useScenery: true
      }
    };
  }
} 