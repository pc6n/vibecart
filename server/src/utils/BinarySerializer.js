import msgpack from 'msgpack-lite';

/**
 * Utility class for binary serialization/deserialization using MessagePack on server side
 */
export class BinarySerializer {
    /**
     * Serialize data to binary format using MessagePack
     * @param {Object} data - The data to serialize
     * @returns {Buffer} - Binary encoded data
     */
    static serialize(data) {
        if (!data) {
            console.error(`[${new Date().toISOString()}] [BinarySerializer] Attempted to serialize null or undefined data`);
            return msgpack.encode({}); // Return empty object instead of failing
        }
        return msgpack.encode(data);
    }

    /**
     * Deserialize binary data back to JavaScript object
     * @param {Buffer|Uint8Array|Object|string} binaryData - The data to deserialize
     * @returns {Object} - Deserialized JavaScript object
     */
    static deserialize(binaryData) {
        if (binaryData === null || binaryData === undefined) {
            console.error(`[${new Date().toISOString()}] [BinarySerializer] Attempted to deserialize null or undefined data`);
            return {}; // Return empty object instead of throwing error
        }
        
        try {
            // If the input is already an object (but not binary), just return it
            if (typeof binaryData === 'object' && !(binaryData instanceof Uint8Array) && !(binaryData instanceof ArrayBuffer) && !(binaryData instanceof Buffer)) {
                // Check if it has socket.io specific properties that indicate it's already deserialized
                if (binaryData.peerId || binaryData.aiCarId || binaryData.throwerId) {
                    console.log(`[${new Date().toISOString()}] [BinarySerializer] Data appears to be already deserialized, returning as-is`);
                    return binaryData;
                }
            }
            
            // If we received a JSON string, try to parse it
            if (typeof binaryData === 'string') {
                try {
                    const jsonData = JSON.parse(binaryData);
                    console.log(`[${new Date().toISOString()}] [BinarySerializer] Successfully parsed string as JSON`);
                    return jsonData;
                } catch (jsonError) {
                    console.warn(`[${new Date().toISOString()}] [BinarySerializer] Failed to parse string as JSON, attempting msgpack decode`);
                    // Fall through to msgpack decode
                }
            }
            
            // If we received an ArrayBuffer, convert it to Uint8Array first
            // This is crucial because msgpack-lite can't directly handle ArrayBuffer
            if (binaryData instanceof ArrayBuffer) {
                binaryData = new Uint8Array(binaryData);
            }
            
            // If we got here, attempt binary deserialization with msgpack
            return msgpack.decode(binaryData);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] [BinarySerializer] Error deserializing data:`, error);
            // Return an empty object instead of throwing
            return {};
        }
    }
} 