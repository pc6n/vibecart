/**
 * Cleanup all items and resources
 */
cleanup() {
    console.log('[ITEM-MANAGER] Cleaning up all items');
    
    // Clean up all active items
    this.activeItems.forEach(item => {
        this.removeItem(item.id);
    });
    
    // Clean up all item spawners
    this.itemSpawners.forEach(spawner => {
        if (spawner.mesh) {
            this.scene.remove(spawner.mesh);
            if (spawner.mesh.geometry) spawner.mesh.geometry.dispose();
            if (spawner.mesh.material) {
                if (Array.isArray(spawner.mesh.material)) {
                    spawner.mesh.material.forEach(m => m.dispose());
                } else {
                    spawner.mesh.material.dispose();
                }
            }
        }
    });
    
    this.activeItems = [];
    this.itemSpawners = [];
    this.initialized = false;
    
    console.log('[ITEM-MANAGER] All items cleaned up');
};

/**
 * Initialize item spawners around the track
 */
initSpawners() {
    // Only initialize once
    if (this.initialized) {
        console.log('[ITEM-MANAGER] Item spawners already initialized');
        return;
    }
    
    console.log('[ITEM-MANAGER] Initializing item spawners');
    
    // Create item spawners around the track
    const numSpawners = 5; // Adjust based on track size
    const radius = this.track.trackRadius;
    
    for (let i = 0; i < numSpawners; i++) {
        const angle = (i / numSpawners) * Math.PI * 2;
        
        // Calculate position on the track
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        // Create spawner slightly inside the track
        const spawnerPos = new THREE.Vector3(
            x * 0.85, // Inside the track radius
            1.5,      // Slightly above ground
            z * 0.85
        );
        
        this.createItemSpawner(spawnerPos, `spawner-${i}`);
    }
    
    this.initialized = true;
    console.log(`[ITEM-MANAGER] Created ${this.itemSpawners.length} item spawners`);
};

/**
 * Create an item spawner at the specified position
 */
createItemSpawner(position, id) {
    // Check if spawner with this ID already exists
    if (this.itemSpawners.some(spawner => spawner.id === id)) {
        console.log(`[ITEM-MANAGER] Spawner ${id} already exists, skipping creation`);
        return;
    }
    
    // Create a floating question mark box
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({ 
        color: 0xffff00,
        emissive: 0x444400,
        shininess: 100,
        transparent: true,
        opacity: 0.9
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.userData.isItemSpawner = true;
    mesh.userData.spawnerId = id;
    
    // Add to scene
    this.scene.add(mesh);
    
    // Store spawner
    this.itemSpawners.push({
        id,
        position,
        mesh,
        lastSpawnTime: 0,
        respawnCooldown: 10000, // 10 seconds cooldown
        active: true
    });
    
    return mesh;
}

/**
 * Update all items and spawners
 */
update(deltaTime) {
    // Update active items
    this.activeItems.forEach(item => {
        if (item.update) {
            item.update(deltaTime);
        }
    });
    
    // Check if we need to spawn new items
    const currentTime = Date.now();
    
    this.itemSpawners.forEach(spawner => {
        if (!spawner.active) return;
        
        // Check if cooldown has passed
        if ((currentTime - spawner.lastSpawnTime) > spawner.respawnCooldown) {
            // Animate the spawner
            if (spawner.mesh) {
                spawner.mesh.rotation.y += deltaTime * 2;
                spawner.mesh.position.y = 1.5 + Math.sin(currentTime / 500) * 0.2;
            }
            
            // Spawn a new item if there's no item at this spawner
            const itemAtSpawner = this.activeItems.some(item => 
                item.position && 
                spawner.position.distanceTo(item.position) < 2
            );
            
            if (!itemAtSpawner && Math.random() < 0.02) { // 2% chance per frame
                this.spawnRandomItem(spawner);
                spawner.lastSpawnTime = currentTime;
            }
        } else {
            // Hide the spawner during cooldown
            if (spawner.mesh) {
                spawner.mesh.visible = false;
            }
        }
    });
    
    // Check for items that need cleanup
    this.activeItems.forEach(item => {
        if (item.lifetime && (currentTime - item.createdTime) > item.lifetime) {
            this.removeItem(item.id);
        }
    });
} 