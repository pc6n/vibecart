export class CarCollision {
    constructor(car) {
        this.car = car;
    }

    handleCollision() {
        const currentSpeed = this.car.physics.speed;
        const isReversing = this.car.physics.isInReverse();
        
        this.reduceSpeedAfterCollision(isReversing);
        this.applyBounceEffect(currentSpeed);
        this.showCollisionFeedback(currentSpeed);
    }
    
    reduceSpeedAfterCollision(isReversing) {
        if (isReversing) {
            this.car.physics.speed = 0;
        } else {
            this.car.physics.speed *= 0.3;
        }
    }
    
    applyBounceEffect(currentSpeed) {
        const bounceDirection = this.car.direction.clone().negate();
        this.car.physics.applyBounce(bounceDirection, 0.5);
    }
    
    showCollisionFeedback(speed) {
        this.showCollisionNotification(speed);
        
        if (Math.abs(speed) > 5) {
            this.car.effects.shakeCamera(speed / this.car.physics.maxSpeed);
        }
    }
    
    showCollisionNotification(speed) {
        let container = document.getElementById('collision-notifications');
        if (!container) {
            container = document.createElement('div');
            container.id = 'collision-notifications';
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.right = '20px';
            container.style.zIndex = '1000';
            document.body.appendChild(container);
        }

        const notification = document.createElement('div');
        notification.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '5px';
        notification.style.marginBottom = '10px';
        notification.style.fontFamily = 'Arial, sans-serif';
        notification.style.fontSize = '16px';
        notification.style.fontWeight = 'bold';
        notification.style.transition = 'opacity 0.5s';
        
        const impact = Math.abs(speed);
        let message = 'Light bump!';
        if (impact > 20) {
            message = 'Heavy crash!';
        } else if (impact > 10) {
            message = 'Medium collision!';
        }
        
        notification.textContent = `${message} (${Math.round(impact * 3.6)} km/h)`;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                container.removeChild(notification);
                if (container.children.length === 0) {
                    document.body.removeChild(container);
                }
            }, 500);
        }, 2000);
    }
} 