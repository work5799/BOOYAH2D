// BOOYAH 2D - Game Engine Script

// --- CONSTANTS & CONFIGURATION ---
const WORLD_SIZE = 2400; // Map dimension (2400x2400 pixels)
const VIEWPORT_BUFFER = 100; // Render buffer outside viewport
const COLLISION_RECURSION_LIMIT = 3;

// Weapons Configuration
const WEAPONS = {
    pistol: {
        name: "Desert Eagle",
        damage: 18,
        fireRate: 180,      // Faster fire rate (was 350)
        reloadTime: 800,    // Faster reload (was 1200)
        magazineSize: 12,   // More capacity (was 7)
        reserveAmmo: 60,
        range: 500,
        bulletSpeed: 24,    // Faster bullet speed (was 12)
        spread: 0.04,
        pellets: 1,
        color: "#9ca3af",
        length: 22,
        width: 6,
        sfx: 'pistol'
    },
    rifle: {
        name: "M4A1 Assault Rifle",
        damage: 24,
        fireRate: 75,       // High-speed automatic fire (was 140)
        reloadTime: 1200,   // Faster reload (was 2000)
        magazineSize: 45,   // More capacity (was 30)
        reserveAmmo: 135,
        range: 700,
        bulletSpeed: 32,    // High velocity (was 16)
        spread: 0.07,
        pellets: 1,
        color: "#fbbf24",
        length: 30,
        width: 8,
        sfx: 'rifle'
    },
    shotgun: {
        name: "M1887 Shotgun",
        damage: 14,
        fireRate: 450,      // Faster firing (was 850)
        reloadTime: 1400,   // Faster reload (was 2400)
        magazineSize: 8,    // More capacity (was 5)
        reserveAmmo: 24,
        range: 320,
        bulletSpeed: 20,    // Faster pellets (was 10)
        spread: 0.25,
        pellets: 6,
        color: "#f97316",
        length: 26,
        width: 10,
        sfx: 'shotgun'
    }
};

// Item Types
const ITEM_TYPES = {
    weapon: 'weapon',
    ammo: 'ammo',
    medkit: 'medkit',
    shield: 'shield'
};

// Game States
const STATES = {
    START_SCREEN: 'start',
    PLAYING: 'playing',
    VICTORY: 'victory',
    GAMEOVER: 'gameover'
};

// Premium Character Colors list
const CHARACTER_COLORS = [
    { body: "#3b82f6", hand: "#93c5fd" }, // Blue
    { body: "#10b981", hand: "#6ee7b7" }, // Green
    { body: "#f59e0b", hand: "#fde047" }, // Orange/Yellow
    { body: "#8b5cf6", hand: "#c4b5fd" }, // Purple
    { body: "#ec4899", hand: "#fbcfe8" }, // Pink
    { body: "#06b6d4", hand: "#67e8f9" }, // Cyan
    { body: "#ef4444", hand: "#fca5a5" }, // Red
    { body: "#14b8a6", hand: "#5eead4" }, // Teal
    { body: "#f97316", hand: "#ffedd5" }, // Deep Orange
    { body: "#84cc16", hand: "#bef264" }, // Lime
    { body: "#6366f1", hand: "#c7d2fe" }  // Indigo
];


// --- AUDIO SYNTHESIZER (Web Audio API) ---
class SoundSynth {
    constructor() {
        this.ctx = null;
        this.masterVolume = null;
    }

    init() {
        if (this.ctx) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
            this.masterVolume = this.ctx.createGain();
            this.masterVolume.gain.setValueAtTime(0.3, this.ctx.currentTime); // Master volume at 30%
            this.masterVolume.connect(this.ctx.destination);
        } catch (e) {
            console.error("Web Audio API not supported", e);
        }
    }

    playShoot(type) {
        if (!this.ctx) return;
        const time = this.ctx.currentTime;

        // Custom synthesizer sounds for different gun types
        if (type === 'shotgun') {
            // Shotgun: heavy explosion (white noise + low pitch oscillator)
            for (let i = 0; i < 4; i++) {
                this.noiseBurst(0.18, 0.02, 1.2 - i*0.2);
            }
            this.oscTone(80, 40, 0.25, 'triangle', 0.8);
        } else if (type === 'rifle') {
            // Rifle: medium rapid fire pop
            this.noiseBurst(0.08, 0.01, 1.0);
            this.oscTone(180, 80, 0.08, 'sawtooth', 0.4);
        } else {
            // Pistol: quick clean snap
            this.noiseBurst(0.06, 0.005, 0.8);
            this.oscTone(250, 100, 0.1, 'triangle', 0.5);
        }
    }

    noiseBurst(duration, decay, volume) {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration - decay);

        // Simple high pass filter to simulate gunshot snap
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(800, this.ctx.currentTime);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterVolume);
        
        noise.start();
    }

    oscTone(startFreq, endFreq, duration, type, volume) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);

        gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(this.masterVolume);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playReload() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        // Two clicks representing magazine out and in
        this.oscTone(300, 150, 0.08, 'triangle', 0.2);
        
        setTimeout(() => {
            this.oscTone(200, 400, 0.12, 'sine', 0.25);
        }, 300);
    }

    playHeal() {
        if (!this.ctx) return;
        // Ascending harmonic sweep
        const now = this.ctx.currentTime;
        this.oscTone(300, 600, 0.6, 'sine', 0.3);
        setTimeout(() => {
            this.oscTone(450, 900, 0.4, 'sine', 0.2);
        }, 150);
    }

    playShield() {
        if (!this.ctx) return;
        // Sci-fi shield charge sound
        this.oscTone(200, 800, 0.5, 'triangle', 0.25);
    }

    playDamage() {
        if (!this.ctx) return;
        // Low harsh buzz
        this.oscTone(120, 50, 0.15, 'sawtooth', 0.4);
    }

    playKill() {
        if (!this.ctx) return;
        // Double ding
        const now = this.ctx.currentTime;
        this.oscTone(880, 880, 0.1, 'sine', 0.3);
        setTimeout(() => {
            this.oscTone(1320, 1320, 0.2, 'sine', 0.3);
        }, 100);
    }

    playStormAlert() {
        if (!this.ctx) return;
        // Low siren warning
        this.oscTone(150, 180, 0.4, 'sawtooth', 0.25);
        setTimeout(() => {
            this.oscTone(150, 180, 0.4, 'sawtooth', 0.25);
        }, 500);
    }

    playVictory() {
        if (!this.ctx) return;
        // Glorious fanfare chords
        const tempo = 120;
        const note = (freq, start, duration) => {
            setTimeout(() => {
                this.oscTone(freq, freq, duration, 'triangle', 0.35);
            }, start * 1000);
        };

        note(261.63, 0.0, 0.2); // C4
        note(329.63, 0.2, 0.2); // E4
        note(392.00, 0.4, 0.2); // G4
        note(523.25, 0.6, 0.5); // C5
        
        note(392.00, 0.8, 0.15); // G4
        note(523.25, 1.0, 0.8); // C5
    }

    playDefeat() {
        if (!this.ctx) return;
        // Sad descending notes
        const note = (freq, start, duration) => {
            setTimeout(() => {
                this.oscTone(freq, freq * 0.9, duration, 'sawtooth', 0.35);
            }, start * 1000);
        };

        note(220.00, 0.0, 0.4); // A3
        note(207.65, 0.4, 0.4); // Ab3
        note(196.00, 0.8, 0.8); // G3
    }
}

const sfx = new SoundSynth();

// --- ENTITIES & CLASSES ---

// Base Entity class
class Entity {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.active = true;
    }
}

// Bullets
class Bullet extends Entity {
    constructor(x, y, vx, vy, damage, owner, range, color) {
        super(x, y, 4);
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.owner = owner; // reference to shooter
        this.rangeRemaining = range;
        this.color = color;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        const speed = Math.hypot(this.vx, this.vy);
        this.rangeRemaining -= speed;
        if (this.rangeRemaining <= 0) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.restore();
    }
}

// Items scattered on the map
class Item extends Entity {
    constructor(x, y, type, detail = null) {
        super(x, y, 16);
        this.type = type; // 'weapon', 'ammo', 'medkit', 'shield'
        this.detail = detail; // weapon key (e.g. 'rifle') or null
        this.spawnTime = Date.now();
        this.pulse = 0;
        
        // Define clean labels and details
        if (type === ITEM_TYPES.weapon) {
            this.name = WEAPONS[detail].name;
            this.color = WEAPONS[detail].color;
        } else if (type === ITEM_TYPES.ammo) {
            this.name = detail ? `${WEAPONS[detail].name} Ammo` : "Ammo Box";
            this.color = "#10b981";
        } else if (type === ITEM_TYPES.medkit) {
            this.name = "First Aid Kit";
            this.color = "#ef4444";
        } else if (type === ITEM_TYPES.shield) {
            this.name = "Armor Vest";
            this.color = "#06b6d4";
        }
    }

    draw(ctx) {
        this.pulse += 0.05;
        const bounceRadius = this.radius + Math.sin(this.pulse) * 2;

        ctx.save();
        // Glow effect
        ctx.beginPath();
        ctx.arc(this.x, this.y, bounceRadius + 4, 0, Math.PI * 2);
        ctx.fillStyle = this.color + "15"; // Very transparent
        ctx.fill();

        // Outer Ring
        ctx.beginPath();
        ctx.arc(this.x, this.y, bounceRadius, 0, Math.PI * 2);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner item icon/indicator
        ctx.beginPath();
        ctx.arc(this.x, this.y, bounceRadius - 7, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        // Visual labels inside the circle
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let symbol = "";
        if (this.type === ITEM_TYPES.weapon) symbol = "W";
        else if (this.type === ITEM_TYPES.ammo) symbol = "A";
        else if (this.type === ITEM_TYPES.medkit) symbol = "+";
        else if (this.type === ITEM_TYPES.shield) symbol = "S";

        ctx.fillText(symbol, this.x, this.y);
        ctx.restore();
    }
}

// Obstacles (Trees, Crates, Rock/Walls)
class Obstacle {
    constructor(x, y, w, h, type) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.type = type; // 'wall', 'crate', 'tree'
        this.health = type === 'crate' ? 80 : 99999; // Crates are destructible!
        this.active = true;
    }

    takeDamage(amount) {
        if (this.type === 'crate') {
            this.health -= amount;
            if (this.health <= 0) {
                this.active = false;
                // Maybe drop random item
                return true; // was destroyed
            }
        }
        return false;
    }

    draw(ctx) {
        ctx.save();
        if (this.type === 'wall') {
            // Sleek brick/concrete block
            ctx.fillStyle = "#374151";
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.strokeStyle = "#4b5563";
            ctx.lineWidth = 3;
            ctx.strokeRect(this.x, this.y, this.w, this.h);
            // Block texture lines
            ctx.strokeStyle = "#1f2937";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + this.h / 2);
            ctx.lineTo(this.x + this.w, this.y + this.h / 2);
            ctx.moveTo(this.x + this.w / 2, this.y);
            ctx.lineTo(this.x + this.w / 2, this.y + this.h);
            ctx.stroke();
        } else if (this.type === 'crate') {
            // Wooden shipping crate
            ctx.fillStyle = "#78350f";
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.strokeStyle = "#92400e";
            ctx.lineWidth = 4;
            ctx.strokeRect(this.x, this.y, this.w, this.h);
            
            // X border on crate
            ctx.strokeStyle = "#b45309";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.x + 4, this.y + 4);
            ctx.lineTo(this.x + this.w - 4, this.y + this.h - 4);
            ctx.moveTo(this.x + this.w - 4, this.y + 4);
            ctx.lineTo(this.x + 4, this.y + this.h - 4);
            ctx.stroke();

            // Cracks if damaged
            if (this.health < 80) {
                ctx.strokeStyle = "rgba(0,0,0,0.5)";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(this.x + this.w/3, this.y + 2);
                ctx.lineTo(this.x + this.w/2, this.y + this.h/3);
                ctx.lineTo(this.x + this.w/4, this.y + this.h*0.6);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // Trees have a separate layer: trunk is solid obstacle drawn below character.
    // Leaves are drawn after/above characters to allow hiding under canopy.
    drawTrunk(ctx) {
        if (this.type !== 'tree') return;
        ctx.save();
        ctx.beginPath();
        // Trunk is centered in the tree bounding box
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fillStyle = "#5c4033";
        ctx.fill();
        ctx.strokeStyle = "#3d2b22";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    drawLeaves(ctx) {
        if (this.type !== 'tree') return;
        ctx.save();
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        // Glowing leaves
        ctx.beginPath();
        ctx.arc(cx, cy, 55, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(22, 101, 52, 0.85)"; // Semi-translucent green
        ctx.fill();
        ctx.strokeStyle = "#14532d";
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Inner leaf detail
        ctx.beginPath();
        ctx.arc(cx - 10, cy - 10, 20, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(21, 128, 61, 0.9)";
        ctx.fill();
        ctx.restore();
    }
}

// Particle system for bleeding/bullet hit effects
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = (Math.random() - 0.5) * 5;
        this.radius = Math.random() * 3 + 1;
        this.color = color;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
        this.active = true;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.life -= this.decay;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
}

// Floating Damage Numbers
class DamageText {
    constructor(x, y, text, color = "#ef4444") {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.vy = -1.5;
        this.life = 1.0;
        this.decay = 0.025;
        this.active = true;
    }

    update() {
        this.y += this.vy;
        this.life -= this.decay;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.font = "bold 14px 'Space Grotesk', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// --- BASE CHARACTER (Player and Bot extend this) ---
class Character extends Entity {
    constructor(x, y, name, isBot = true) {
        super(x, y, 20);
        this.name = name;
        this.health = 100;
        this.maxHealth = 100;
        this.shield = 50;
        this.maxShield = 100;
        this.speed = 3.6;
        this.rotation = 0; // facing direction in radians
        
        this.isBot = isBot;
        this.kills = 0;
        this.damageDealt = 0;
        this.survivalTimeStart = Date.now();
        this.spawnProtectionTimer = 5000; // 5 seconds invincibility on spawn

        // Assign a unique random color set
        const colorSet = CHARACTER_COLORS[Math.floor(Math.random() * CHARACTER_COLORS.length)];
        this.bodyColor = colorSet.body;
        this.handColor = colorSet.hand;

        // Unique ID for state synchronization
        this.id = isBot 
            ? `bot_${Math.random().toString(36).substr(2, 9)}`
            : `player_${Math.random().toString(36).substr(2, 9)}`;

        // Weapon inventory (2 slots)
        this.weapons = ['pistol', null]; // Starts with Pistol in Slot 1
        this.activeWeaponIndex = 0;
        
        // Ammo matching each weapon
        this.ammoInMag = {
            pistol: WEAPONS.pistol.magazineSize,
            rifle: 0,
            shotgun: 0
        };
        this.reserveAmmo = {
            pistol: 28,
            rifle: 0,
            shotgun: 0
        };

        this.isReloading = false;
        this.reloadTimer = 0;
        this.lastShotTime = 0;
        this.isStunned = false; // brief hit stun
    }

    get activeWeapon() {
        const wKey = this.weapons[this.activeWeaponIndex];
        return wKey ? WEAPONS[wKey] : null;
    }

    takeDamage(amount, sourceName) {
        if (!this.active || this.spawnProtectionTimer > 0) return 0;
        
        let initialHealth = this.health;
        let finalDamage = amount;

        // Armor shield absorbs 60% of damage
        if (this.shield > 0) {
            const shieldAbsorb = Math.min(this.shield, amount * 0.6);
            this.shield -= shieldAbsorb;
            finalDamage = amount - shieldAbsorb;
        }

        this.health = Math.max(0, this.health - finalDamage);

        if (this.isBot) {
            sfx.playDamage();
        }

        // Damage Text notification
        game.damageTexts.push(new DamageText(this.x, this.y - 10, `-${Math.round(amount)}`));

        // Bleed particles
        for (let i = 0; i < 8; i++) {
            game.particles.push(new Particle(this.x, this.y, "#ef4444"));
        }

        if (this.health <= 0) {
            this.active = false;
            this.health = 0;
            // Trigger death sequence
            game.handleElimination(this, sourceName);
        }

        return initialHealth - this.health;
    }

    heal(amount) {
        if (this.health >= this.maxHealth) return false;
        this.health = Math.min(this.maxHealth, this.health + amount);
        if (!this.isBot) {
            sfx.playHeal();
            if (game.networkRole === 'host') game.broadcastSFX('heal');
        }
        game.damageTexts.push(new DamageText(this.x, this.y - 15, `+${amount} HP`, "#10b981"));
        return true;
    }

    shieldUp(amount) {
        if (this.shield >= this.maxShield) return false;
        this.shield = Math.min(this.maxShield, this.shield + amount);
        if (!this.isBot) {
            sfx.playShield();
            if (game.networkRole === 'host') game.broadcastSFX('shield');
        }
        game.damageTexts.push(new DamageText(this.x, this.y - 15, `+${amount} Armor`, "#06b6d4"));
        return true;
    }

    shoot() {
        if (game.networkRole === 'client') {
            const weapon = this.activeWeapon;
            if (weapon && !this.isReloading && this.ammoInMag[this.weapons[this.activeWeaponIndex]] > 0) {
                const now = Date.now();
                if (now - this.lastShotTime >= weapon.fireRate) {
                    this.lastShotTime = now;
                    this.ammoInMag[this.weapons[this.activeWeaponIndex]]--;
                    sfx.playShoot(weapon.sfx);
                    game.mouse.clickTriggered = true; // flag to transmit input
                }
            }
            return false;
        }

        const weapon = this.activeWeapon;
        if (!weapon || this.isReloading) return false;

        const wKey = this.weapons[this.activeWeaponIndex];
        if (this.ammoInMag[wKey] <= 0) {
            this.reload();
            return false;
        }

        const now = Date.now();
        if (now - this.lastShotTime < weapon.fireRate) return false;

        this.lastShotTime = now;
        this.ammoInMag[wKey]--;

        // Play SFX
        if (!this.isBot) {
            sfx.playShoot(weapon.sfx);
            if (game.networkRole === 'host') {
                game.broadcastSFX(weapon.sfx);
            }
        }

        // Spawn bullets based on pellets (e.g. shotgun fires multiple pellets)
        for (let i = 0; i < weapon.pellets; i++) {
            // Apply weapon aim spread
            const angleOffset = (Math.random() - 0.5) * weapon.spread;
            const bulletAngle = this.rotation + angleOffset;

            const vx = Math.cos(bulletAngle) * weapon.bulletSpeed;
            const vy = Math.sin(bulletAngle) * weapon.bulletSpeed;

            // Spawn from end of barrel
            const barrelLength = this.radius + weapon.length;
            const bx = this.x + Math.cos(this.rotation) * barrelLength;
            const by = this.y + Math.sin(this.rotation) * barrelLength;

            game.bullets.push(new Bullet(bx, by, vx, vy, weapon.damage, this, weapon.range, weapon.color));
        }

        // Fire kickback muzzle particles
        const barrelLength = this.radius + weapon.length;
        const bx = this.x + Math.cos(this.rotation) * barrelLength;
        const by = this.y + Math.sin(this.rotation) * barrelLength;
        for (let i = 0; i < 4; i++) {
            const p = new Particle(bx, by, weapon.color);
            p.vx = Math.cos(this.rotation + (Math.random() - 0.5) * 0.4) * (Math.random() * 4 + 2);
            p.vy = Math.sin(this.rotation + (Math.random() - 0.5) * 0.4) * (Math.random() * 4 + 2);
            game.particles.push(p);
        }

        return true;
    }

    reload() {
        if (game.networkRole === 'client') {
            const wKey = this.weapons[this.activeWeaponIndex];
            const weapon = this.activeWeapon;
            if (weapon && !this.isReloading && this.ammoInMag[wKey] < weapon.magazineSize) {
                sfx.playReload();
                this.isReloading = true;
                this.reloadTimer = weapon.reloadTime;
                document.getElementById('reload-indicator').classList.remove('hidden');
            }
            return;
        }

        const wKey = this.weapons[this.activeWeaponIndex];
        const weapon = this.activeWeapon;
        if (!weapon || this.isReloading || this.ammoInMag[wKey] === weapon.magazineSize) return;

        // Check if reserve ammo is available (except infinite reserve on pistol for simple safety)
        const isInfinite = wKey === 'pistol';
        if (!isInfinite && this.reserveAmmo[wKey] <= 0) return;

        this.isReloading = true;
        this.reloadTimer = weapon.reloadTime;

        if (!this.isBot) {
            sfx.playReload();
            document.getElementById('reload-indicator').classList.remove('hidden');
            if (game.networkRole === 'host') {
                game.broadcastSFX('reload');
            }
        }
    }

    updateReload(deltaTime) {
        if (!this.isReloading) return;

        this.reloadTimer -= deltaTime;
        if (this.reloadTimer <= 0) {
            this.isReloading = false;
            const wKey = this.weapons[this.activeWeaponIndex];
            const weapon = this.activeWeapon;
            
            if (wKey === 'pistol') {
                this.ammoInMag[wKey] = weapon.magazineSize;
            } else {
                const needed = weapon.magazineSize - this.ammoInMag[wKey];
                const transfer = Math.min(needed, this.reserveAmmo[wKey]);
                this.ammoInMag[wKey] += transfer;
                this.reserveAmmo[wKey] -= transfer;
            }

            if (!this.isBot) {
                document.getElementById('reload-indicator').classList.add('hidden');
                game.updateHUD();
            }
        }
    }

    switchWeapon(slotIdx) {
        if (slotIdx === this.activeWeaponIndex || this.isReloading) return;
        if (slotIdx >= this.weapons.length) return;
        
        this.activeWeaponIndex = slotIdx;
        if (!this.isBot) {
            game.updateHUD();
        }
    }

    draw(ctx) {
        ctx.save();
        
        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;

        // Player/Bot body rotation matrix
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Draw Gun first (behind hand/body lines)
        const weapon = this.activeWeapon;
        if (weapon) {
            ctx.fillStyle = weapon.color;
            // Draw gun barrel protruding
            ctx.fillRect(this.radius - 2, -weapon.width / 2, weapon.length, weapon.width);
            
            // Reloading indicator band
            if (this.isReloading) {
                ctx.fillStyle = "rgba(255, 157, 0, 0.7)";
                const progress = (weapon.reloadTime - this.reloadTimer) / weapon.reloadTime;
                ctx.fillRect(this.radius - 2, -weapon.width/2, weapon.length * progress, weapon.width);
            }
        }

        // Draw Body (Outer circle ring + center base)
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.bodyColor || (this.isBot ? "#ef4444" : "#3b82f6");
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Draw Hands holding gun
        ctx.beginPath();
        ctx.arc(this.radius - 2, -this.radius / 2 - 2, 6, 0, Math.PI * 2); // left hand
        ctx.arc(this.radius - 2, this.radius / 2 + 2, 6, 0, Math.PI * 2); // right hand
        ctx.fillStyle = this.handColor || (this.isBot ? "#fca5a5" : "#93c5fd");
        ctx.fill();
        ctx.stroke();

        // Draw Facing Eyes (two small dots looking forward)
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(8, -6, 3, 0, Math.PI * 2);
        ctx.arc(8, 6, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Draw Character Name and Health Bar above head (if within screen view)
        ctx.save();
        ctx.font = "600 11px 'Space Grotesk', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = this.isBot ? "#f87171" : "#93c5fd";
        ctx.fillText(this.name, this.x, this.y - this.radius - 16);

        // Simple small overhead Health / Armor bar
        const barWidth = 36;
        const barHeight = 4;
        const bx = this.x - barWidth / 2;
        const by = this.y - this.radius - 10;
        
        // Background
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(bx, by, barWidth, barHeight);

        // Health fill
        const hpFill = (this.health / this.maxHealth) * barWidth;
        ctx.fillStyle = "#10b981";
        ctx.fillRect(bx, by, hpFill, barHeight);

        // Shield fill (above health if shield active)
        if (this.shield > 0) {
            const shFill = (this.shield / this.maxShield) * barWidth;
            ctx.fillStyle = "#06b6d4";
            ctx.fillRect(bx, by - 2, shFill, 2);
        }

        ctx.restore();
    }
}

// --- PLAYER CONTROLLER ---
class Player extends Character {
    constructor(x, y, name) {
        super(x, y, name, false);
    }
}

// --- BOT AI CONTROLLER ---
class Bot extends Character {
    constructor(x, y, name, difficulty = 'medium') {
        super(x, y, name, true);
        this.difficulty = difficulty;
        this.waypointX = x;
        this.waypointY = y;
        this.aiState = 'patrol'; // 'patrol', 'combat', 'run_to_zone', 'loot'
        this.targetEnemy = null;
        this.stateTimer = 0;
        this.reactionTimer = 0;
        
        // Difficulty adjustments
        if (difficulty === 'easy') {
            this.speed = 2.0;           // Very slow movement (was 2.8)
            this.aimError = 0.42;       // Very poor aim (was 0.22)
            this.viewDistance = 260;    // Short sight (was 380)
            this.shootInterval = 1500;  // Shoots very slowly
        } else if (difficulty === 'medium') {
            this.speed = 2.6;           // Slower movement (was 3.3)
            this.aimError = 0.28;       // Much worse aim (was 0.12)
            this.viewDistance = 340;    // Shorter sight range (was 480)
            this.shootInterval = 1000;  // Slower fire rate (was 600)
        } else { // Hard
            this.speed = 3.0;           // Slower than before (was 3.8)
            this.aimError = 0.14;       // Worse aim (was 0.04)
            this.viewDistance = 450;    // Shorter sight (was 600)
            this.shootInterval = 550;   // Slower fire rate (was 300)
        }

        this.newWaypoint();
    }

    newWaypoint() {
        // Pick random spot around them or inside safe zone
        const zone = game.safeZone;
        const radius = zone.r * Math.random();
        const angle = Math.random() * Math.PI * 2;
        this.waypointX = zone.x + Math.cos(angle) * radius;
        this.waypointY = zone.y + Math.sin(angle) * radius;
        
        // Keep within map boundaries
        this.waypointX = Math.max(100, Math.min(WORLD_SIZE - 100, this.waypointX));
        this.waypointY = Math.max(100, Math.min(WORLD_SIZE - 100, this.waypointY));
    }

    updateAI(deltaTime) {
        if (!this.active) return;
        this.stateTimer += deltaTime;
        
        const distToPlayer = Math.hypot(game.player.x - this.x, game.player.y - this.y);
        
        // Priority 1: Check if outside Storm Zone -> Move to safe zone
        const distToZoneCenter = Math.hypot(game.safeZone.x - this.x, game.safeZone.y - this.y);
        const isSafe = distToZoneCenter < game.safeZone.r - 20;

        if (!isSafe) {
            this.aiState = 'run_to_zone';
        } else {
            // Priority 2: Combat check (Scan for enemies: Player or other Bots)
            let closestEnemy = null;
            let closestDist = this.viewDistance;

            // Player seen?
            if (game.player.active && distToPlayer < closestDist) {
                closestEnemy = game.player;
                closestDist = distToPlayer;
            }

            // Other Bots seen?
            for (let b of game.bots) {
                if (b === this || !b.active) continue;
                const d = Math.hypot(b.x - this.x, b.y - this.y);
                if (d < closestDist) {
                    closestEnemy = b;
                    closestDist = d;
                }
            }

            if (closestEnemy) {
                this.targetEnemy = closestEnemy;
                this.aiState = 'combat';
            } else if (this.aiState === 'combat') {
                this.targetEnemy = null;
                this.aiState = 'patrol';
                this.newWaypoint();
            }
        }

        // --- Execute AI State ---
        switch (this.aiState) {
            case 'run_to_zone':
                // Aim & run directly to safe zone center
                const zoneAngle = Math.atan2(game.safeZone.x - this.x, game.safeZone.y - this.y);
                this.rotation = Math.atan2(game.safeZone.y - this.y, game.safeZone.x - this.x);
                this.moveTowards(game.safeZone.x, game.safeZone.y);

                // Attack while running if they spot player/bots
                if (game.player.active && distToPlayer < this.viewDistance) {
                    this.aimAndFire(game.player);
                }
                break;

            case 'combat':
                if (!this.targetEnemy || !this.targetEnemy.active) {
                    this.aiState = 'patrol';
                    this.targetEnemy = null;
                    this.newWaypoint();
                    break;
                }

                // Turn to enemy and aim
                const combatAngle = Math.atan2(this.targetEnemy.y - this.y, this.targetEnemy.x - this.x);
                this.rotation = combatAngle + (Math.random() - 0.5) * this.aimError;

                // Move closer/orbit enemy
                const enemyDist = Math.hypot(this.targetEnemy.x - this.x, this.targetEnemy.y - this.y);
                if (enemyDist > this.activeWeapon.range * 0.7) {
                    // Chase
                    this.moveTowards(this.targetEnemy.x, this.targetEnemy.y);
                } else if (enemyDist < 120) {
                    // Back up
                    this.moveTowards(this.x - Math.cos(combatAngle)*100, this.y - Math.sin(combatAngle)*100);
                } else {
                    // Strafe/orbit
                    this.moveTowards(this.x + Math.sin(combatAngle)*100, this.y - Math.cos(combatAngle)*100);
                }

                // Fire gun (with fire rate handling)
                if (this.ammoInMag[this.weapons[this.activeWeaponIndex]] <= 0) {
                    this.reload();
                } else {
                    this.shoot();
                }
                break;

            case 'patrol':
            default:
                // Move to current patrol waypoint
                const distToWay = Math.hypot(this.waypointX - this.x, this.waypointY - this.y);
                if (distToWay < 30 || this.stateTimer > 8000) {
                    this.newWaypoint();
                    this.stateTimer = 0;
                }

                this.rotation = Math.atan2(this.waypointY - this.y, this.waypointX - this.x);
                this.moveTowards(this.waypointX, this.waypointY);

                // Auto heal if safety is verified and health is low
                if (this.health < 60 && Math.random() < 0.01) {
                    this.heal(30);
                }

                // Auto loot nearby items if close
                let closestItem = null;
                let itemDist = 120; // Search radius for loot
                for (let item of game.items) {
                    if (!item.active) continue;
                    const d = Math.hypot(item.x - this.x, item.y - this.y);
                    if (d < itemDist) {
                        closestItem = item;
                        itemDist = d;
                    }
                }

                if (closestItem) {
                    this.moveTowards(closestItem.x, closestItem.y);
                    if (itemDist < this.radius + closestItem.radius + 5) {
                        this.aiLootItem(closestItem);
                    }
                }
                break;
        }
    }

    moveTowards(tx, ty) {
        const angle = Math.atan2(ty - this.y, tx - this.x);
        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;
    }

    aimAndFire(enemy) {
        this.rotation = Math.atan2(enemy.y - this.y, enemy.x - this.x) + (Math.random() - 0.5) * this.aimError;
        if (this.ammoInMag[this.weapons[this.activeWeaponIndex]] <= 0) {
            this.reload();
        } else {
            this.shoot();
        }
    }

    aiLootItem(item) {
        if (!item.active) return;
        
        let looted = false;
        
        if (item.type === ITEM_TYPES.weapon) {
            // If secondary slot is empty, put it there. Otherwise replace primary if rifle/shotgun
            if (!this.weapons[1]) {
                this.weapons[1] = item.detail;
                this.ammoInMag[item.detail] = WEAPONS[item.detail].magazineSize;
                this.reserveAmmo[item.detail] = WEAPONS[item.detail].reserveAmmo;
                looted = true;
            } else if (item.detail !== 'pistol') {
                // Bots prefer non-pistols as active
                this.weapons[this.activeWeaponIndex] = item.detail;
                this.ammoInMag[item.detail] = WEAPONS[item.detail].magazineSize;
                this.reserveAmmo[item.detail] = WEAPONS[item.detail].reserveAmmo;
                looted = true;
            }
        } else if (item.type === ITEM_TYPES.ammo) {
            const wKey = item.detail || this.weapons[this.activeWeaponIndex];
            this.reserveAmmo[wKey] = (this.reserveAmmo[wKey] || 0) + 30;
            looted = true;
        } else if (item.type === ITEM_TYPES.medkit) {
            looted = this.heal(35);
        } else if (item.type === ITEM_TYPES.shield) {
            looted = this.shieldUp(50);
        }

        if (looted) {
            item.active = false;
        }
    }
}

// --- CORE GAME ENGINE MANAGER ---
class GameEngine {
    constructor() {
        this.state = STATES.START_SCREEN;
        this.canvas = null;
        this.ctx = null;
        this.minimapCanvas = null;
        this.minimapCtx = null;

        // Entities arrays
        this.player = null;
        this.bots = [];
        this.bullets = [];
        this.items = [];
        this.obstacles = [];
        this.particles = [];
        this.damageTexts = [];

        // Game controllers
        this.inputs = {
            w: false, a: false, s: false, d: false,
            f: false, e: false, r: false,
            1: false, 2: false, loot: false
        };
        this.mouse = { x: 0, y: 0 };
        this.viewport = { x: 0, y: 0, w: 0, h: 0 };

        // Storm / Ring Zone System
        this.safeZone = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: WORLD_SIZE / 2 };
        this.nextZone = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: WORLD_SIZE / 3 };
        this.stormTimer = 45; // seconds per phase
        this.stormPhase = 1;
        this.isZoneShrinking = false;
        this.stormWarningActive = false;
        this.zoneTimerInterval = null;

        // Statistics
        this.aliveCount = 0;
        this.totalParticipants = 0;
        this.matchStartTime = 0;
        this.killFeed = [];

        // Game Mode & Respawns
        this.gameMode = 'br';
        this.matchDuration = 180;
        this.respawnQueue = [];

        // Network P2P multiplayer configurations
        this.networkRole = 'single'; // 'single', 'host', 'client'
        this.net = null; // initialized in init()

        // Last loop stamp
        this.lastTime = 0;
    }

    init() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Keyboard & Mouse Listeners
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        this.canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (this.state === STATES.PLAYING && e.button === 0) {
                // Shoot trigger
                if (this.player && this.player.active) {
                    if (this.networkRole === 'client') {
                        this.mouse.clickTriggered = true;
                    } else {
                        this.player.shoot();
                    }
                }
            }
        });

        // Start Screen Buttons
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        const replayBtns = document.querySelectorAll('.replay-btn');
        replayBtns.forEach(btn => {
            btn.addEventListener('click', () => this.resetToMenu());
        });

        // Game Mode dropdown handler
        const gameModeSelect = document.getElementById('game-mode');
        const durationGroup = document.getElementById('duration-group');
        gameModeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'deathmatch') {
                durationGroup.classList.remove('hidden');
            } else {
                durationGroup.classList.add('hidden');
            }
        });

        // Tab buttons toggle logic
        const tabSingle = document.getElementById('tab-singleplayer');
        const tabMulti = document.getElementById('tab-multiplayer');
        const panelSingle = document.getElementById('singleplayer-settings');
        const panelMulti = document.getElementById('multiplayer-settings');

        tabSingle.addEventListener('click', () => {
            tabSingle.classList.add('active');
            tabMulti.classList.remove('active');
            panelSingle.classList.remove('hidden');
            panelMulti.classList.add('hidden');
            // Show controls guide in singleplayer tab
            document.querySelector('.controls-guide').style.display = '';
            this.networkRole = 'single';
        });

        tabMulti.addEventListener('click', () => {
            tabMulti.classList.add('active');
            tabSingle.classList.remove('active');
            panelMulti.classList.remove('hidden');
            panelSingle.classList.add('hidden');
            // Hide controls guide to save space in multiplayer tab
            document.querySelector('.controls-guide').style.display = 'none';
            this.networkRole = 'multi';
        });

        // Initialize Network Manager
        this.net = new NetworkManager(this);

        // Multiplayer Game Mode dropdown: show/hide duration row
        const mpGameMode = document.getElementById('mp-game-mode');
        const mpDurationRow = document.getElementById('mp-duration-row');
        if (mpGameMode && mpDurationRow) {
            mpGameMode.addEventListener('change', (e) => {
                mpDurationRow.style.display = (e.target.value === 'deathmatch') ? 'flex' : 'none';
            });
        }

        // Host button click
        document.getElementById('host-btn').addEventListener('click', () => {
            this.net.hostRoom();
        });

        // Start Multiplayer Button (Host starts)
        document.getElementById('start-multiplayer-btn').addEventListener('click', () => {
            this.startMultiplayerGame();
        });

        // Join button click
        document.getElementById('join-btn').addEventListener('click', () => {
            const roomCode = document.getElementById('join-room-id').value.trim();
            if (roomCode.length > 0) {
                this.net.joinRoom(roomCode);
            } else {
                alert("Please enter a Room Code");
            }
        });

        // Allow pressing Enter in join room input to connect
        document.getElementById('join-room-id').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('join-btn').click();
            }
        });

        // Copy Room Code button handler
        document.getElementById('copy-code-btn').addEventListener('click', () => {
            const code = document.getElementById('generated-room-id').textContent;
            if (code && code !== '-----') {
                navigator.clipboard.writeText(code).then(() => {
                    const btn = document.getElementById('copy-code-btn');
                    btn.classList.add('copied');
                    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> COPIED!';
                    setTimeout(() => {
                        btn.classList.remove('copied');
                        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> COPY';
                    }, 2000);
                }).catch(() => {
                    // Fallback: select and copy
                    const el = document.getElementById('generated-room-id');
                    const range = document.createRange();
                    range.selectNode(el);
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);
                    document.execCommand('copy');
                    window.getSelection().removeAllRanges();
                });
            }
        });
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.viewport.w = this.canvas.width;
        this.viewport.h = this.canvas.height;
    }

    handleKeyDown(e) {
        const key = e.key.toLowerCase();
        if (key in this.inputs) {
            this.inputs[key] = true;
        }

        if (this.state !== STATES.PLAYING || !this.player || !this.player.active) return;

        // Loot action keys
        if (key === 'f' || key === 'e') {
            if (this.networkRole === 'client') {
                this.inputs.loot = true;
            } else {
                this.checkLootAction();
            }
        }

        // Reload key
        if (key === 'r') {
            this.player.reload();
        }

        // Weapon Slot swaps
        if (key === '1') {
            this.player.switchWeapon(0);
        }
        if (key === '2') {
            if (this.player.weapons[1]) {
                this.player.switchWeapon(1);
            }
        }
    }

    handleKeyUp(e) {
        const key = e.key.toLowerCase();
        if (key in this.inputs) {
            this.inputs[key] = false;
        }
    }

    startGame() {
        // Initialize synthetic audio context
        sfx.init();

        const nameInput = document.getElementById('player-name').value.trim();
        const playerName = nameInput || "Survivor";

        // Read bot counts dynamically based on networkRole
        const botCount = this.networkRole === 'host'
            ? parseInt((document.getElementById('mp-bot-count') || { value: 10 }).value)
            : parseInt(document.getElementById('bot-count').value);

        // Override bot difficulty to easy in multiplayer to make them weak, or read select in singleplayer
        const difficulty = this.networkRole === 'host'
            ? 'easy'
            : document.getElementById('difficulty').value;

        // Fetch new game mode options
        this.gameMode = this.networkRole === 'host'
            ? (document.getElementById('mp-game-mode') || { value: 'br' }).value
            : document.getElementById('game-mode').value;

        this.matchDuration = this.networkRole === 'host'
            ? parseInt((document.getElementById('mp-match-duration') || { value: 180 }).value)
            : parseInt(document.getElementById('match-duration').value);

        // Clear screens
        document.getElementById('screen-blur').classList.add('fade-out');
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('respawn-overlay').classList.remove('active');
        document.getElementById('vic-scoreboard-card').classList.add('hidden');
        document.getElementById('det-scoreboard-card').classList.add('hidden');
        document.querySelector('.killer-info').classList.remove('hidden');

        // Reset and clear arrays first (so obstacles is populated before spawning characters)
        this.bullets = [];
        this.items = [];
        this.obstacles = [];
        this.particles = [];
        this.damageTexts = [];
        this.respawnQueue = [];

        // Generate environment obstacles first
        this.generateMapObstacles();

        // Setup Host Player at a random safe spawn point
        const hostSpawn = this.getRandomSpawnPoint(20);
        this.player = new Player(hostSpawn.x, hostSpawn.y, playerName);
        this.player.id = 'host';
        this.player.spawnProtectionTimer = 5000;
        
        // Preserve client players in multiplayer host mode and spawn them at distinct safe spawn points
        const joinedClients = this.bots.filter(b => !b.isBot);
        this.bots = [];
        this.spawnPoints = {}; // Dictionary of remote client spawn coordinates
        joinedClients.forEach(c => {
            const clientSpawn = this.getRandomSpawnPoint(20);
            c.x = clientSpawn.x;
            c.y = clientSpawn.y;
            c.active = true;
            c.health = c.maxHealth;
            c.shield = c.maxShield;
            c.kills = 0;
            c.deaths = 0;
            c.weapons = ['pistol', null];
            c.activeWeaponIndex = 0;
            c.spawnProtectionTimer = 5000;
            if (c.peerConn) {
                c.id = c.peerConn.peer; // Ensure remote client ID matches their connection peer ID
                this.spawnPoints[c.peerConn.peer] = { x: c.x, y: c.y };
            }
            this.bots.push(c);
        });

        // Spawn Bots
        this.spawnBots(botCount, difficulty);

        // Spawn Scattered Loot
        this.spawnScatteredLoot(botCount * 4 + 30);

        // Setup Storm / Safe Zone Circle
        this.safeZone = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: WORLD_SIZE / 2 };
        this.stormPhase = 1;
        this.stormTimer = this.gameMode === 'deathmatch' ? this.matchDuration : 45;
        this.isZoneShrinking = false;

        // Stats setup
        this.aliveCount = botCount + 1 + (this.networkRole === 'host' ? joinedClients.length : 0);
        this.totalParticipants = this.aliveCount;
        this.matchStartTime = Date.now();
        this.killFeed = [];
        document.getElementById('kill-feed').innerHTML = '';

        this.updateHUD();

        // Reset inputs
        for (let k in this.inputs) this.inputs[k] = false;

        // Start timer intervals
        if (this.zoneTimerInterval) clearInterval(this.zoneTimerInterval);
        this.zoneTimerInterval = setInterval(() => this.updateStormTimer(), 1000);

        this.state = STATES.PLAYING;
        this.lastTime = performance.now();
        
        // Boot gameloop
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    getRandomSpawnPoint(radius = 20) {
        let rx = WORLD_SIZE / 2;
        let ry = WORLD_SIZE / 2;
        let ok = false;
        let limit = 0;

        const sz = this.safeZone || { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: WORLD_SIZE / 2 };
        const maxDist = Math.max(50, sz.r - 60);

        while (!ok && limit < 150) {
            limit++;
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * maxDist;
            rx = sz.x + Math.cos(angle) * dist;
            ry = sz.y + Math.sin(angle) * dist;

            // Constrain within map boundaries (excluding outer wall pad)
            rx = Math.max(120, Math.min(WORLD_SIZE - 120, rx));
            ry = Math.max(120, Math.min(WORLD_SIZE - 120, ry));

            if (!this.checkCollidesWithObstacles(rx, ry, radius)) {
                ok = true;
            }
        }
        return { x: rx, y: ry };
    }

    resetToMenu() {
        // Reset screens
        document.getElementById('screen-blur').classList.remove('fade-out');
        document.getElementById('victory-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('start-screen').classList.add('active');
        this.state = STATES.START_SCREEN;
        if (this.zoneTimerInterval) clearInterval(this.zoneTimerInterval);
    }

    // --- MAP GENERATION ---
    generateMapObstacles() {
        // Create solid outer border walls
        const wallThickness = 40;
        this.obstacles.push(new Obstacle(0, 0, WORLD_SIZE, wallThickness, 'wall')); // top
        this.obstacles.push(new Obstacle(0, 0, wallThickness, WORLD_SIZE, 'wall')); // left
        this.obstacles.push(new Obstacle(0, WORLD_SIZE - wallThickness, WORLD_SIZE, wallThickness, 'wall')); // bottom
        this.obstacles.push(new Obstacle(WORLD_SIZE - wallThickness, 0, wallThickness, WORLD_SIZE, 'wall')); // right

        // Place random obstacle structures: Walls, crates, trees
        const count = 50;
        for (let i = 0; i < count; i++) {
            const rx = Math.random() * (WORLD_SIZE - 300) + 150;
            const ry = Math.random() * (WORLD_SIZE - 300) + 150;

            // Don't spawn close to initial center player spawn (300px radius safety)
            if (Math.hypot(WORLD_SIZE / 2 - rx, WORLD_SIZE / 2 - ry) < 250) {
                continue;
            }

            const typeRand = Math.random();
            if (typeRand < 0.25) {
                // Block walls
                const w = Math.random() * 80 + 60;
                const h = Math.random() * 40 + 30;
                this.obstacles.push(new Obstacle(rx, ry, w, h, 'wall'));
            } else if (typeRand < 0.6) {
                // Crates (destructible)
                this.obstacles.push(new Obstacle(rx, ry, 50, 50, 'crate'));
                // Drop duplicate side-by-side crates sometimes
                if (Math.random() < 0.5) {
                    this.obstacles.push(new Obstacle(rx + 52, ry, 50, 50, 'crate'));
                }
            } else {
                // Trees
                this.obstacles.push(new Obstacle(rx, ry, 40, 40, 'tree'));
            }
        }
    }

    spawnBots(count, difficulty) {
        const names = [
            "Bot_Wolf", "NoobSlayer", "SniperGod", "Bot_Phantom", "Cobra_Striker",
            "GhostRider", "Bot_Viper", "Agent_47", "Bot_Falcon", "Deadshot",
            "Terminator", "Challenger", "Matrix", "Reaper", "ShadowWalk",
            "Bot_Rex", "Warlord", "Bot_Titan", "Ravage", "Gladiator",
            "TriggerHappy", "Bot_Blaze", "Fury", "Alpha", "Bot_Helix",
            "StormBringer", "Sentinel", "Vanguard", "Rogue", "Bot_Kestrel",
            "ZeroSum", "Bot_Echo", "Enigma", "Apex", "Bot_Vector"
        ];

        for (let i = 0; i < count; i++) {
            const spawn = this.getRandomSpawnPoint(20);
            const botName = names[i % names.length] + `_${Math.floor(Math.random() * 90 + 10)}`;
            this.bots.push(new Bot(spawn.x, spawn.y, botName, difficulty));
        }
    }

    spawnScatteredLoot(count) {
        const types = [ITEM_TYPES.weapon, ITEM_TYPES.ammo, ITEM_TYPES.medkit, ITEM_TYPES.shield];
        const weaponKeys = ['rifle', 'shotgun']; // Pistol is default, don't scatter much pistol

        for (let i = 0; i < count; i++) {
            let rx, ry;
            let ok = false;
            while (!ok) {
                rx = Math.random() * (WORLD_SIZE - 160) + 80;
                ry = Math.random() * (WORLD_SIZE - 160) + 80;
                if (!this.checkCollidesWithObstacles(rx, ry, 15)) {
                    ok = true;
                }
            }

            const randType = types[Math.floor(Math.random() * types.length)];
            let detail = null;

            if (randType === ITEM_TYPES.weapon) {
                detail = weaponKeys[Math.floor(Math.random() * weaponKeys.length)];
            } else if (randType === ITEM_TYPES.ammo) {
                // Scatter ammo matching either weapon
                detail = Math.random() < 0.5 ? 'rifle' : 'shotgun';
            }

            this.items.push(new Item(rx, ry, randType, detail));
        }
    }

    spawnLootAt(x, y, forcedType = null) {
        const types = [ITEM_TYPES.ammo, ITEM_TYPES.medkit, ITEM_TYPES.shield];
        const weaponKeys = ['rifle', 'shotgun'];
        
        let type = forcedType || types[Math.floor(Math.random() * types.length)];
        let detail = null;
        
        if (type === ITEM_TYPES.weapon) {
            detail = weaponKeys[Math.floor(Math.random() * weaponKeys.length)];
        } else if (type === ITEM_TYPES.ammo) {
            detail = Math.random() < 0.5 ? 'rifle' : 'shotgun';
        }
        this.items.push(new Item(x, y, type, detail));
    }

    // Collision check helper
    checkCollidesWithObstacles(x, y, radius) {
        for (let obs of this.obstacles) {
            if (!obs.active) continue;
            // Tree leaves are transparent, only trunk is solid
            let ox = obs.x;
            let oy = obs.y;
            let ow = obs.w;
            let oh = obs.h;

            if (obs.type === 'tree') {
                // Circle-circle collision with trunk
                const tx = obs.x + obs.w / 2;
                const ty = obs.y + obs.h / 2;
                if (Math.hypot(tx - x, ty - y) < radius + 14) {
                    return true;
                }
                continue;
            }

            // Circle-AABB overlap
            const closestX = Math.max(ox, Math.min(x, ox + ow));
            const closestY = Math.max(oy, Math.min(y, oy + oh));
            const dist = Math.hypot(x - closestX, y - closestY);
            if (dist < radius) return true;
        }
        return false;
    }

    // --- GAME LOOP & UPDATES ---
    gameLoop(timestamp) {
        if (this.state !== STATES.PLAYING) return;

        let deltaTime = timestamp - this.lastTime;
        if (deltaTime > 100) deltaTime = 16.66; // cap slow frames
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    update(deltaTime) {
        if (this.networkRole === 'client') {
            this.sendClientInputs();

            // --- CLIENT-SIDE PREDICTION: locally move player so camera is smooth ---
            if (this.player && this.player.active) {
                let dx = 0, dy = 0;
                if (this.inputs.w) dy -= 1;
                if (this.inputs.s) dy += 1;
                if (this.inputs.a) dx -= 1;
                if (this.inputs.d) dx += 1;
                if (dx !== 0 && dy !== 0) {
                    const len = Math.hypot(dx, dy);
                    dx /= len; dy /= len;
                }
                this.player.x += dx * this.player.speed;
                this.player.y += dy * this.player.speed;
                // Keep within map boundaries
                const pad = 40 + this.player.radius;
                this.player.x = Math.max(pad, Math.min(WORLD_SIZE - pad, this.player.x));
                this.player.y = Math.max(pad, Math.min(WORLD_SIZE - pad, this.player.y));
                // Update local aim rotation for HUD
                const mdx = this.mouse.x - (this.canvas.width / 2);
                const mdy = this.mouse.y - (this.canvas.height / 2);
                this.player.rotation = Math.atan2(mdy, mdx);
            }

            // Client only runs local particles and floating text updates
            for (let i = this.particles.length - 1; i >= 0; i--) {
                this.particles[i].update();
                if (!this.particles[i].active) this.particles.splice(i, 1);
            }
            for (let i = this.damageTexts.length - 1; i >= 0; i--) {
                this.damageTexts[i].update();
                if (!this.damageTexts[i].active) this.damageTexts.splice(i, 1);
            }
            return;
        }

        // 1. Update Player position and rotation based on keys/mouse
        if (this.player.active) {
            this.updatePlayerMovement();
            this.updatePlayerRotation();
            this.player.updateReload(deltaTime);
            this.player.isStunned = false; // decay stun
            if (this.player.spawnProtectionTimer > 0) {
                this.player.spawnProtectionTimer -= deltaTime;
            }
        }

        // 2. Update Bots AI and actions
        for (let bot of this.bots) {
            if (bot.active) {
                if (bot.spawnProtectionTimer > 0) {
                    bot.spawnProtectionTimer -= deltaTime;
                }
                if (!bot.isBot && bot.inputs) {
                    // Update connected client player movement on host
                    let dx = 0;
                    let dy = 0;
                    if (bot.inputs.w) dy -= 1;
                    if (bot.inputs.s) dy += 1;
                    if (bot.inputs.a) dx -= 1;
                    if (bot.inputs.d) dx += 1;
                    
                    if (dx !== 0 && dy !== 0) {
                         const len = Math.hypot(dx, dy);
                         dx /= len;
                         dy /= len;
                    }
                    bot.x += dx * bot.speed;
                    bot.y += dy * bot.speed;
                    bot.updateReload(deltaTime);
                    this.resolveObstacleCollisions(bot);
                } else if (bot.isBot) {
                    bot.updateAI(deltaTime);
                    bot.updateReload(deltaTime);
                    this.resolveObstacleCollisions(bot);
                }
            }
        }

        // 3. Resolve Player collisions with map obstacles
        if (this.player.active) {
            this.resolveObstacleCollisions(this.player);
        }

        // 4. Update Projectiles / Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            let bullet = this.bullets[i];
            bullet.update();

            // Collision: Bullet vs Obstacles
            let hitObstacle = false;
            for (let obs of this.obstacles) {
                if (!obs.active) continue;

                if (obs.type === 'tree') {
                    // check trunk only
                    const tx = obs.x + obs.w / 2;
                    const ty = obs.y + obs.h / 2;
                    if (Math.hypot(tx - bullet.x, ty - bullet.y) < bullet.radius + 14) {
                        hitObstacle = true;
                        break;
                    }
                    continue;
                }

                if (bullet.x >= obs.x && bullet.x <= obs.x + obs.w &&
                    bullet.y >= obs.y && bullet.y <= obs.y + obs.h) {
                    hitObstacle = true;
                    // Do damage to crate
                    if (obs.type === 'crate') {
                        const destroyed = obs.takeDamage(bullet.damage);
                        if (destroyed) {
                            sfx.playDamage();
                            if (this.networkRole === 'host') this.broadcastSFX('damage');
                            // Spawn random loot on crate destruction
                            if (Math.random() < 0.6) {
                                this.spawnLootAt(obs.x + obs.w/2, obs.y + obs.h/2);
                            }
                        }
                    }
                    break;
                }
            }

            if (hitObstacle) {
                // Bullet hit sparks
                for (let k = 0; k < 3; k++) {
                    this.particles.push(new Particle(bullet.x, bullet.y, "#9ca3af"));
                }
                bullet.active = false;
            }

            if (!bullet.active) {
                this.bullets.splice(i, 1);
                continue;
            }

            // Collision: Bullet vs Characters
            let hitCharacter = null;
            if (this.player.active && bullet.owner !== this.player) {
                const d = Math.hypot(this.player.x - bullet.x, this.player.y - bullet.y);
                if (d < this.player.radius + bullet.radius) {
                    hitCharacter = this.player;
                }
            }

            if (!hitCharacter) {
                for (let bot of this.bots) {
                    if (!bot.active || bullet.owner === bot) continue;
                    const d = Math.hypot(bot.x - bullet.x, bot.y - bullet.y);
                    if (d < bot.radius + bullet.radius) {
                        hitCharacter = bot;
                        break;
                    }
                }
            }

            if (hitCharacter) {
                const dealt = hitCharacter.takeDamage(bullet.damage, bullet.owner.name);
                bullet.owner.damageDealt += dealt;
                bullet.active = false;
                this.bullets.splice(i, 1);
            }
        }

        // 5. Update Particles and Floating text
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (!this.particles[i].active) this.particles.splice(i, 1);
        }

        for (let i = this.damageTexts.length - 1; i >= 0; i--) {
            this.damageTexts[i].update();
            if (!this.damageTexts[i].active) this.damageTexts.splice(i, 1);
        }

        // 6. Update Storm Ring position and damage
        this.updateStormZone(deltaTime);

        // 6.5. Update Respawns for Deathmatch mode
        if (this.gameMode === 'deathmatch') {
            this.updateRespawns(deltaTime);
        }

        // 7. Auto check loot hover for action prompt display
        if (this.player.active) {
            this.updateActionPrompt();
        }

        // 7.5. Host state broadcast update
        if (this.networkRole === 'host') {
            this.broadcastCounter = (this.broadcastCounter || 0) + 1;
            if (this.broadcastCounter % 2 === 0) {
                this.broadcastState();
            }
        }
    }

    updatePlayerMovement() {
        let dx = 0;
        let dy = 0;

        if (this.inputs.w) dy -= 1;
        if (this.inputs.s) dy += 1;
        if (this.inputs.a) dx -= 1;
        if (this.inputs.d) dx += 1;

        if (dx !== 0 && dy !== 0) {
            // normalize diagonal speed
            const length = Math.hypot(dx, dy);
            dx /= length;
            dy /= length;
        }

        // Apply movement
        this.player.x += dx * this.player.speed;
        this.player.y += dy * this.player.speed;
    }

    updatePlayerRotation() {
        // Aim direction is centered on player screen coordinate
        const screenPx = this.player.x + this.viewport.x;
        const screenPy = this.player.y + this.viewport.y;

        const dx = this.mouse.x - (this.canvas.width / 2);
        const dy = this.mouse.y - (this.canvas.height / 2);
        
        this.player.rotation = Math.atan2(dy, dx);
    }

    resolveObstacleCollisions(char) {
        // Multi-pass sliding collision detection to solve corner friction
        for (let step = 0; step < COLLISION_RECURSION_LIMIT; step++) {
            let collisionFound = false;

            for (let obs of this.obstacles) {
                if (!obs.active) continue;

                if (obs.type === 'tree') {
                    // Tree Trunk is circular obstacle
                    const tx = obs.x + obs.w / 2;
                    const ty = obs.y + obs.h / 2;
                    const dist = Math.hypot(tx - char.x, ty - char.y);
                    const minDist = char.radius + 14;

                    if (dist < minDist) {
                        const overlap = minDist - dist;
                        const angle = Math.atan2(char.y - ty, char.x - tx);
                        char.x += Math.cos(angle) * overlap;
                        char.y += Math.sin(angle) * overlap;
                        collisionFound = true;
                    }
                    continue;
                }

                // Circle vs AABB (Rectangle)
                const cx = Math.max(obs.x, Math.min(char.x, obs.x + obs.w));
                const cy = Math.max(obs.y, Math.min(char.y, obs.y + obs.h));
                const dist = Math.hypot(char.x - cx, char.y - cy);

                if (dist < char.radius) {
                    const overlap = char.radius - dist;
                    let pushX = 0;
                    let pushY = 0;

                    if (dist > 0.001) {
                        // Push out vector
                        pushX = ((char.x - cx) / dist) * overlap;
                        pushY = ((char.y - cy) / dist) * overlap;
                    } else {
                        // center collision, push in arbitrary axis
                        pushX = char.radius;
                    }

                    char.x += pushX;
                    char.y += pushY;
                    collisionFound = true;
                }
            }

            if (!collisionFound) break;
        }

        // Lock within outer boundary wall limits
        const wallPad = 40 + char.radius;
        char.x = Math.max(wallPad, Math.min(WORLD_SIZE - wallPad, char.x));
        char.y = Math.max(wallPad, Math.min(WORLD_SIZE - wallPad, char.y));
    }

    updateActionPrompt() {
        const prompt = document.getElementById('action-prompt');
        const text = document.getElementById('prompt-text');
        
        let nearestItem = null;
        let minDist = 75; // proximity check

        for (let item of this.items) {
            if (!item.active) continue;
            const dist = Math.hypot(item.x - this.player.x, item.y - this.player.y);
            if (dist < minDist) {
                nearestItem = item;
                minDist = dist;
            }
        }

        if (nearestItem) {
            prompt.classList.remove('hidden');
            let lootLabel = nearestItem.name;
            if (nearestItem.type === ITEM_TYPES.weapon) {
                lootLabel = `Pick up ${nearestItem.name}`;
            } else {
                lootLabel = `Loot ${nearestItem.name}`;
            }
            text.textContent = lootLabel;
        } else {
            prompt.classList.add('hidden');
        }
    }

    checkLootAction() {
        if (this.player && this.player.active) {
            this.checkCharacterLoot(this.player);
        }
    }

    checkCharacterLoot(char) {
        let nearestItem = null;
        let minDist = 75;

        for (let item of this.items) {
            if (!item.active) continue;
            const dist = Math.hypot(item.x - char.x, item.y - char.y);
            if (dist < minDist) {
                nearestItem = item;
                minDist = dist;
            }
        }

        if (!nearestItem) return;

        let looted = false;
        
        if (nearestItem.type === ITEM_TYPES.weapon) {
            const wKey = nearestItem.detail;
            
            // If primary slot is empty or pistol, replace it.
            if (char.weapons[0] === 'pistol' && wKey !== 'pistol') {
                char.weapons[0] = wKey;
                char.ammoInMag[wKey] = WEAPONS[wKey].magazineSize;
                char.reserveAmmo[wKey] = WEAPONS[wKey].reserveAmmo;
                looted = true;
            } else if (!char.weapons[1]) {
                char.weapons[1] = wKey;
                char.ammoInMag[wKey] = WEAPONS[wKey].magazineSize;
                char.reserveAmmo[wKey] = WEAPONS[wKey].reserveAmmo;
                looted = true;
                char.activeWeaponIndex = 1; // auto-equip
            } else {
                // Drop current weapon on ground and replace it
                const currentEquipped = char.weapons[char.activeWeaponIndex];
                
                char.weapons[char.activeWeaponIndex] = wKey;
                char.ammoInMag[wKey] = WEAPONS[wKey].magazineSize;
                char.reserveAmmo[wKey] = WEAPONS[wKey].reserveAmmo;
                looted = true;
                
                // Spawn old gun back on ground
                if (currentEquipped) {
                    this.items.push(new Item(char.x, char.y, ITEM_TYPES.weapon, currentEquipped));
                }
            }
        } else if (nearestItem.type === ITEM_TYPES.ammo) {
            const wKey = nearestItem.detail || char.weapons[char.activeWeaponIndex];
            char.reserveAmmo[wKey] = (char.reserveAmmo[wKey] || 0) + 30;
            looted = true;
            if (!char.isBot) {
                if (char.peerConn) {
                    char.peerConn.send({ type: 'sfx', sfx: 'reload' });
                } else {
                    sfx.playReload();
                }
            }
        } else if (nearestItem.type === ITEM_TYPES.medkit) {
            looted = char.heal(40);
        } else if (nearestItem.type === ITEM_TYPES.shield) {
            looted = char.shieldUp(50);
        }

        if (looted) {
            nearestItem.active = false;
            if (!char.isBot && !char.peerConn) {
                this.updateHUD();
            }
        }
    }

    // --- STORM ZONE (SAFE ZONE) LOGIC ---
    updateStormTimer() {
        if (this.state !== STATES.PLAYING) return;

        if (this.gameMode === 'deathmatch') {
            if (this.stormTimer > 0) {
                this.stormTimer--;
            } else {
                // Game over by timeout!
                this.endGame(STATES.GAMEOVER); // rank calculated in endGame
                return;
            }

            // Format timer string
            const mins = Math.floor(this.stormTimer / 60);
            const secs = this.stormTimer % 60;
            const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            document.getElementById('storm-timer').textContent = timeStr;
            document.getElementById('storm-status-text').textContent = "TIME REMAINING";
            document.getElementById('storm-timer').classList.remove('danger-text');
            return;
        }

        if (this.stormTimer > 0) {
            this.stormTimer--;
            
            // Pulse warning if closing in 10s
            if (this.stormTimer <= 10 && this.stormTimer > 0) {
                sfx.playStormAlert();
                this.triggerAlert("STORM CLOSING IN!", `Get to the safe zone in ${this.stormTimer}s`);
            }
        } else {
            // Trigger zone contraction
            this.isZoneShrinking = true;
            this.stormTimer = 45; // reload for next timer
            
            // Advance Phase
            this.stormPhase++;
            
            // Calculate next safe circle target
            this.calculateNextZone();
            this.triggerAlert("STORM SHRINKING!", "Safe zone is contracting!");
        }

        // Format timer string
        const mins = Math.floor(this.stormTimer / 60);
        const secs = this.stormTimer % 60;
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        document.getElementById('storm-timer').textContent = timeStr;

        if (this.isZoneShrinking) {
            document.getElementById('storm-status-text').textContent = "SAFE ZONE CONTRACTING";
            document.getElementById('storm-timer').classList.add('danger-text');
        } else {
            document.getElementById('storm-status-text').textContent = "SAFE ZONE SHRINKING IN";
            document.getElementById('storm-timer').classList.remove('danger-text');
        }
    }

    calculateNextZone() {
        // Next circle is 60% of previous size
        const currentR = this.safeZone.r;
        const targetR = Math.max(40, currentR * 0.55);

        // Keep target center within previous circle bounds
        const maxOffset = currentR - targetR;
        const angle = Math.random() * Math.PI * 2;
        const offset = Math.random() * maxOffset;

        this.nextZone = {
            x: this.safeZone.x + Math.cos(angle) * offset,
            y: this.safeZone.y + Math.sin(angle) * offset,
            r: targetR
        };

        // Clamp centers inside outer border limits
        const wallBoundary = 100;
        this.nextZone.x = Math.max(wallBoundary + targetR, Math.min(WORLD_SIZE - wallBoundary - targetR, this.nextZone.x));
        this.nextZone.y = Math.max(wallBoundary + targetR, Math.min(WORLD_SIZE - wallBoundary - targetR, this.nextZone.y));
    }

    updateStormZone(deltaTime) {
        if (this.gameMode === 'deathmatch') {
            // Keep safe zone locked at full size
            this.safeZone.x = WORLD_SIZE / 2;
            this.safeZone.y = WORLD_SIZE / 2;
            this.safeZone.r = WORLD_SIZE / 2 + 100;
            return;
        }

        // If zone is shrinking, interpolate center and radius to next zone targets
        if (this.isZoneShrinking) {
            const shrinkSpeed = 0.4 * (deltaTime / 16.66); // speed coefficient scaled

            // Interpolate Radius
            if (this.safeZone.r > this.nextZone.r) {
                this.safeZone.r -= shrinkSpeed;
            } else {
                this.safeZone.r = this.nextZone.r;
            }

            // Interpolate Center
            const dx = this.nextZone.x - this.safeZone.x;
            const dy = this.nextZone.y - this.safeZone.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 1) {
                this.safeZone.x += (dx / dist) * shrinkSpeed * 0.7;
                this.safeZone.y += (dy / dist) * shrinkSpeed * 0.7;
            } else {
                this.safeZone.x = this.nextZone.x;
                this.safeZone.y = this.nextZone.y;
            }

            // End shrink phase if targets reached
            if (Math.abs(this.safeZone.r - this.nextZone.r) < 2 && dist < 2) {
                this.isZoneShrinking = false;
                this.safeZone.r = this.nextZone.r;
                this.safeZone.x = this.nextZone.x;
                this.safeZone.y = this.nextZone.y;
            }
        }

        // Apply storm outside damage every 1.5 seconds (roughly)
        const now = Date.now();
        if (!this.lastStormDamageTime) this.lastStormDamageTime = now;

        if (now - this.lastStormDamageTime > 1500) {
            this.lastStormDamageTime = now;

            // Damage Player if outside safe zone
            if (this.player.active) {
                const distToCenter = Math.hypot(this.player.x - this.safeZone.x, this.player.y - this.safeZone.y);
                if (distToCenter > this.safeZone.r) {
                    const dmg = 4 + (this.stormPhase * 2); // gets deadlier in late stages
                    this.player.takeDamage(dmg, "The Storm");
                    this.updateHUD();
                    sfx.playDamage();
                    this.triggerAlert("OUTSIDE SAFE ZONE!", `Taking storm damage (-${dmg} HP)`);
                }
            }

            // Damage Bots if outside
            for (let bot of this.bots) {
                if (!bot.active) continue;
                const distToCenter = Math.hypot(bot.x - this.safeZone.x, bot.y - this.safeZone.y);
                if (distToCenter > this.safeZone.r) {
                    const dmg = 4 + (this.stormPhase * 2);
                    bot.takeDamage(dmg, "The Storm");
                }
            }
        }
    }

    // --- GAME EVENT ELIMINATIONS & SCOREBOARD ---
    handleElimination(killedChar, killerName) {
        // Dead animation trigger: splash extra blood particles
        for (let i = 0; i < 20; i++) {
            this.particles.push(new Particle(killedChar.x, killedChar.y, "#991b1b"));
        }

        // If killed character had weapons, drop their active weapon + ammo box on ground
        const activeWeapon = killedChar.weapons[killedChar.activeWeaponIndex];
        if (activeWeapon) {
            this.items.push(new Item(killedChar.x, killedChar.y, ITEM_TYPES.weapon, activeWeapon));
            this.items.push(new Item(killedChar.x + 12, killedChar.y - 12, ITEM_TYPES.ammo, activeWeapon));
        }
        
        // Always drop at least one medkit or shield vest on death box
        if (Math.random() < 0.5) {
            this.items.push(new Item(killedChar.x - 12, killedChar.y + 12, ITEM_TYPES.medkit));
        } else {
            this.items.push(new Item(killedChar.x - 12, killedChar.y + 12, ITEM_TYPES.shield));
        }

        // Increment killer stat
        if (killerName === this.player.name) {
            this.player.kills++;
            this.updateHUD();
            sfx.playKill();
            this.triggerAlert("ELIMINATION!", `You eliminated ${killedChar.name}`);
        } else {
            // Find bot matching killer
            for (let b of this.bots) {
                if (b.name === killerName) {
                    b.kills++;
                    break;
                }
            }
        }

        // Push to Kill Feed
        this.pushKillFeed(killerName, killedChar.name, activeWeapon ? WEAPONS[activeWeapon].name : "Melee");

        if (this.gameMode === 'deathmatch') {
            killedChar.deaths = (killedChar.deaths || 0) + 1;
            killedChar.active = false;
            
            if (killedChar === this.player) {
                document.getElementById('respawn-overlay').classList.add('active');
                document.getElementById('respawn-countdown').textContent = "3";
            }
            this.respawnQueue.push({ char: killedChar, timer: 3000 });
            
            this.aliveCount = 1 + this.bots.length;
            document.getElementById('hud-alive').textContent = this.aliveCount;
        } else {
            this.aliveCount = (this.player.active ? 1 : 0) + this.bots.filter(b => b.active).length;
            document.getElementById('hud-alive').textContent = this.aliveCount;

            // End Game Checks
            if (!this.player.active) {
                // Defeat!
                this.endGame(STATES.GAMEOVER, killerName);
            } else if (this.aliveCount <= 1) {
                // Player won!
                this.endGame(STATES.VICTORY);
            }
        }
    }

    pushKillFeed(killer, victim, weaponName) {
        const feed = document.getElementById('kill-feed');
        const item = document.createElement('div');
        item.className = 'kill-feed-item';
        
        const pName = this.player ? this.player.name : "";
        if (killer === pName) {
            item.className += ' player-kill';
        } else if (victim === pName) {
            item.className += ' player-death';
        }

        item.innerHTML = `
            <span class="killer">${killer}</span>
            <span class="eliminated"> eliminated ${victim}</span>
            <span class="weapon-tag">${weaponName}</span>
        `;
        
        feed.appendChild(item);

        // Auto remove from DOM after 5s
        setTimeout(() => {
            if (item && item.parentNode) {
                item.parentNode.removeChild(item);
            }
        }, 5000);
    }

    triggerAlert(title, desc) {
        const alertDiv = document.getElementById('hud-alert');
        const alertTitle = document.getElementById('hud-alert-title');
        const alertDesc = document.getElementById('hud-alert-desc');

        alertTitle.textContent = title;
        alertDesc.textContent = desc;

        // Highlight alerts specifically
        if (title.includes("ZONE") || title.includes("STORM")) {
            alertDiv.querySelector('.hud-alert-inner').style.borderColor = "var(--secondary)";
            alertTitle.style.color = "var(--secondary)";
        } else {
            alertDiv.querySelector('.hud-alert-inner').style.borderColor = "var(--primary)";
            alertTitle.style.color = "var(--primary)";
        }

        alertDiv.classList.add('active');

        // Clear warning after 2.5s
        if (this.alertTimeout) clearTimeout(this.alertTimeout);
        this.alertTimeout = setTimeout(() => {
            alertDiv.classList.remove('active');
        }, 2500);
    }

    updateHUD() {
        if (!this.player) return;

        // Health & Shield Bars
        const hpFill = document.getElementById('hud-health-fill');
        const hpVal = document.getElementById('hud-health-val');
        const shFill = document.getElementById('hud-shield-fill');
        const shVal = document.getElementById('hud-shield-val');

        hpFill.style.width = `${this.player.health}%`;
        hpVal.textContent = Math.round(this.player.health);

        shFill.style.width = `${this.player.shield}%`;
        shVal.textContent = Math.round(this.player.shield);

        // Kills & Alive HUD values
        document.getElementById('hud-kills').textContent = this.player.kills;
        document.getElementById('hud-alive').textContent = this.aliveCount;

        // Inventory display slots
        for (let i = 0; i < 2; i++) {
            const slot = document.getElementById(`slot-${i+1}`);
            const nameEl = document.getElementById(`slot-${i+1}-name`);
            const ammoEl = document.getElementById(`slot-${i+1}-ammo`);

            const wKey = this.player.weapons[i];
            if (wKey) {
                const weapon = WEAPONS[wKey];
                nameEl.textContent = weapon.name;
                const activeAmmo = this.player.ammoInMag[wKey];
                const reserve = wKey === 'pistol' ? '∞' : (this.player.reserveAmmo[wKey] || 0);
                ammoEl.textContent = `${activeAmmo}/${reserve}`;
            } else {
                nameEl.textContent = "EMPTY";
                ammoEl.textContent = "-";
            }

            // equip active tag
            if (this.player.activeWeaponIndex === i) {
                slot.classList.add('active');
            } else {
                slot.classList.remove('active');
            }
        }

        // Active Weapon Detailed display bottom right
        const activeWKey = this.player.weapons[this.player.activeWeaponIndex];
        if (activeWKey) {
            const weapon = WEAPONS[activeWKey];
            document.getElementById('hud-active-ammo').textContent = this.player.ammoInMag[activeWKey];
            document.getElementById('hud-reserve-ammo').textContent = activeWKey === 'pistol' ? '∞' : (this.player.reserveAmmo[activeWKey] || 0);
            document.getElementById('hud-weapon-type').textContent = weapon.name.toUpperCase();
        }
    }

    endGame(endState, killerName = "") {
        this.state = endState;
        if (this.zoneTimerInterval) clearInterval(this.zoneTimerInterval);

        // Clear any active respawn screen overlay
        document.getElementById('respawn-overlay').classList.remove('active');

        // Fade blurred background back in
        document.getElementById('screen-blur').classList.remove('fade-out');

        const duration = Math.floor((Date.now() - this.matchStartTime) / 1000);
        const min = Math.floor(duration / 60);
        const sec = duration % 60;
        const timeString = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

        if (this.gameMode === 'deathmatch') {
            // Timed Deathmatch Mode: Scoreboard-based game end
            const participants = [this.player, ...this.bots];
            participants.sort((a, b) => b.kills - a.kills);
            const playerIndex = participants.findIndex(p => p === this.player);
            
            const buildScoreboard = (listElementId) => {
                const listEl = document.getElementById(listElementId);
                listEl.innerHTML = '';
                // Take top 6 survivors by kills
                const topP = participants.slice(0, 6);
                topP.forEach((p, idx) => {
                    const row = document.createElement('div');
                    row.className = 'scoreboard-row';
                    if (p === this.player) row.className += ' highlight-row';
                    const d = p.deaths || 0;
                    row.innerHTML = `
                        <div class="rank-name">
                            <span class="rank-num">#${idx + 1}</span>
                            <span class="name-val">${p.name}</span>
                        </div>
                        <div class="stats-val">
                            <span class="kills-val">${p.kills} Kills</span>
                            <span class="deaths-val" style="margin-left: 10px; color: var(--text-muted); font-size: 0.8rem;">(${d} D)</span>
                        </div>
                    `;
                    listEl.appendChild(row);
                });
            };

            const isPlayerWinner = playerIndex === 0;
            if (isPlayerWinner) {
                endState = STATES.VICTORY;
                this.state = STATES.VICTORY;
                sfx.playVictory();
                
                document.getElementById('victory-screen').classList.add('active');
                document.getElementById('vic-scoreboard-card').classList.remove('hidden');
                buildScoreboard('vic-scoreboard-list');

                document.getElementById('vic-kills').textContent = this.player.kills;
                document.getElementById('vic-survival-time').textContent = timeString;
                document.getElementById('vic-damage').textContent = Math.round(this.player.damageDealt);
            } else {
                endState = STATES.GAMEOVER;
                this.state = STATES.GAMEOVER;
                sfx.playDefeat();
                
                document.getElementById('game-over-screen').classList.add('active');
                document.getElementById('det-scoreboard-card').classList.remove('hidden');
                document.querySelector('.killer-info').classList.add('hidden');
                buildScoreboard('det-scoreboard-list');

                // Update text elements on defeat/gameover screen
                document.querySelector('#game-over-screen .defeat-banner h1').textContent = "MATCH OVER";
                document.querySelector('#game-over-screen .defeat-banner .subtitle').textContent = "Show your skills next time!";

                document.getElementById('det-kills').textContent = this.player.kills;
                document.getElementById('det-survival-time').textContent = timeString;
                document.getElementById('det-damage').textContent = Math.round(this.player.damageDealt);
                document.getElementById('det-rank').textContent = `#${playerIndex + 1}`;
            }
        } else {
            // Classic Battle Royale Mode: Standard game end
            // Reset gameover headers just in case they were modified
            document.querySelector('#game-over-screen .defeat-banner h1').textContent = "ELIMINATED";
            document.querySelector('#game-over-screen .defeat-banner .subtitle').textContent = "Better luck next time!";
            document.querySelector('.killer-info').classList.remove('hidden');

            if (endState === STATES.VICTORY) {
                sfx.playVictory();
                
                document.getElementById('victory-screen').classList.add('active');
                document.getElementById('vic-kills').textContent = this.player.kills;
                document.getElementById('vic-survival-time').textContent = timeString;
                document.getElementById('vic-damage').textContent = Math.round(this.player.damageDealt);
            } else {
                sfx.playDefeat();
                
                document.getElementById('game-over-screen').classList.add('active');
                document.getElementById('det-kills').textContent = this.player.kills;
                document.getElementById('det-survival-time').textContent = timeString;
                document.getElementById('det-damage').textContent = Math.round(this.player.damageDealt);
                
                // Rank placement
                document.getElementById('det-rank').textContent = `#${this.aliveCount + 1}`;
                
                // Killer designation
                document.getElementById('det-killer').textContent = killerName || "The Storm";
            }
        }
    }

    updateRespawns(deltaTime) {
        for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
            let item = this.respawnQueue[i];
            item.timer -= deltaTime;

            if (item.char === this.player) {
                const displaySecs = Math.max(1, Math.ceil(item.timer / 1000));
                document.getElementById('respawn-countdown').textContent = displaySecs;
            }

            if (item.timer <= 0) {
                // Respawn character!
                this.respawnCharacter(item.char);
                this.respawnQueue.splice(i, 1);
            }
        }
    }

    respawnCharacter(char) {
        // Find safe spawn spot using the helper
        const spawn = this.getRandomSpawnPoint(char.radius);
        
        char.x = spawn.x;
        char.y = spawn.y;
        char.active = true;
        char.health = char.maxHealth;
        char.shield = char.maxShield;
        char.spawnProtectionTimer = 5000;

        // Reset starting weapons
        char.weapons = ['pistol', null];
        char.activeWeaponIndex = 0;
        char.ammoInMag.pistol = WEAPONS.pistol.magazineSize;
        char.reserveAmmo.pistol = WEAPONS.pistol.reserveAmmo;
        char.isReloading = false;

        if (char === this.player) {
            // Hide respawn screen overlay
            document.getElementById('respawn-overlay').classList.remove('active');
            // Hide reloading indicator if they died reloading
            document.getElementById('reload-indicator').classList.add('hidden');
            this.updateHUD();
            this.triggerAlert("RESPAWNED!", "Back in the action!");
        }
    }

    startMultiplayerGame() {
        // Collect host configurations from new mp-* elements (with fallbacks)
        const botCount = parseInt(
            (document.getElementById('mp-bot-count') || document.getElementById('bot-count')).value
        );
        const difficulty = (document.getElementById('difficulty') || { value: 'medium' }).value;
        const mode = (document.getElementById('mp-game-mode') || document.getElementById('game-mode')).value;
        const duration = parseInt(
            (document.getElementById('mp-match-duration') || document.getElementById('match-duration')).value || 180
        );

        // First generate obstacles list deterministically or locally on start
        this.startGame();

        // Notify all clients to start game with the configurations
        this.net.connections.forEach(conn => {
            conn.send({
                type: 'start',
                config: {
                    botCount,
                    difficulty,
                    gameMode: mode,
                    matchDuration: duration,
                    obstacles: this.obstacles.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, type: o.type })),
                    clientNames: this.net.getClientNames(),
                    spawnPoints: this.spawnPoints || {}
                }
            });
        });
    }

    startClientGame(config) {
        sfx.init();

        this.gameMode = config.gameMode;
        this.matchDuration = config.matchDuration;

        // Clear overlays
        document.getElementById('screen-blur').classList.add('fade-out');
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('respawn-overlay').classList.remove('active');
        document.getElementById('vic-scoreboard-card').classList.add('hidden');
        document.getElementById('det-scoreboard-card').classList.add('hidden');

        // Setup local player character at authoritative spawn point sent by host
        const mySpawn = (config.spawnPoints && this.net.peer && config.spawnPoints[this.net.peer.id]) || { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
        const pName = document.getElementById('player-name').value.trim() || "Survivor";
        this.player = new Player(mySpawn.x, mySpawn.y, pName);
        if (this.net && this.net.peer) {
            this.player.id = this.net.peer.id;
        }

        this.bots = [];
        this.bullets = [];
        this.items = [];
        this.particles = [];
        this.damageTexts = [];
        this.respawnQueue = [];

        // Synchronize map obstacles from host
        this.obstacles = config.obstacles.map(o => new Obstacle(o.x, o.y, o.w, o.h, o.type));
        this.net.clientNames = config.clientNames;

        // Stats setup
        this.aliveCount = config.botCount + 1 + Object.keys(config.clientNames).length;
        this.totalParticipants = this.aliveCount;
        this.matchStartTime = Date.now();
        this.killFeed = [];
        document.getElementById('kill-feed').innerHTML = '';

        this.updateHUD();

        // Reset inputs
        for (let k in this.inputs) this.inputs[k] = false;

        this.state = STATES.PLAYING;
        this.lastTime = performance.now();

        // Boot client loop
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    migrateToOfflineMode() {
        if (this.networkRole !== 'client') return;

        // 1. Convert to local Singleplayer mode
        this.networkRole = 'single';

        // 2. Morph remote players into active local bots
        this.bots.forEach(b => {
            if (!b.isBot) {
                b.isBot = true;
                b.difficulty = 'easy';
                b.waypointX = b.x;
                b.waypointY = b.y;
                b.aiState = 'patrol';
                b.targetEnemy = null;
                b.stateTimer = 0;
                b.reactionTimer = 0;
                b.speed = 2.0;
                b.aimError = 0.42;
                b.viewDistance = 260;
                b.shootInterval = 1500;

                // Copy prototype methods to character instance
                b.updateAI = Bot.prototype.updateAI;
                b.newWaypoint = Bot.prototype.newWaypoint;
                b.moveTowards = Bot.prototype.moveTowards;
                b.aimAndFire = Bot.prototype.aimAndFire;
                b.aiLootItem = Bot.prototype.aiLootItem;
            }
        });

        // 3. Start local storm zones loops
        if (this.zoneTimerInterval) clearInterval(this.zoneTimerInterval);
        this.zoneTimerInterval = setInterval(() => this.updateStormTimer(), 1000);

        this.triggerAlert("DISCONNECTED", "Connection lost! Host disconnected. Game converted to local offline mode.");
    }

    syncClientState(state) {
        if (this.networkRole !== 'client') return;

        try {
            const myPeerId = (this.net && this.net.peer) ? this.net.peer.id : null;
            const myId = (this.player && this.player.id) ? this.player.id : myPeerId;

            // Find matching player entity representing client by ID or peer ID fallback
            const myState = state.players.find(p => p.id === myId || p.peerId === myPeerId);
            if (myState) {
                if (this.player) {
                    // Server reconciliation: only snap position if we are far off (>80px)
                    // Otherwise let client prediction handle smooth movement
                    const distSq = (this.player.x - myState.x) ** 2 + (this.player.y - myState.y) ** 2;
                    if (distSq > 80 * 80 || !myState.active) {
                        this.player.x = myState.x;
                        this.player.y = myState.y;
                    }
                    this.player.health = myState.health;
                    this.player.shield = myState.shield;
                    this.player.kills = myState.kills;
                    this.player.deaths = myState.deaths;
                    this.player.active = myState.active;

                    // Sync inventory, active slot index, and colors authoritative states
                    if (myState.weapons) this.player.weapons = myState.weapons;
                    this.player.activeWeaponIndex = myState.activeWeaponIndex;
                    this.player.bodyColor = myState.bodyColor;
                    this.player.handColor = myState.handColor;
                }

                // Sync HUD items
                const hFill = document.getElementById('hud-health-fill');
                const hVal = document.getElementById('hud-health-val');
                const sFill = document.getElementById('hud-shield-fill');
                const sVal = document.getElementById('hud-shield-val');

                if (hFill) hFill.style.width = `${myState.health}%`;
                if (hVal) hVal.textContent = Math.round(myState.health);
                if (sFill) sFill.style.width = `${myState.shield}%`;
                if (sVal) sVal.textContent = Math.round(myState.shield);

                const hKills = document.getElementById('hud-kills');
                const hAlive = document.getElementById('hud-alive');
                if (hKills) hKills.textContent = myState.kills;
                if (hAlive) hAlive.textContent = state.aliveCount;

                // Sync active weapon text
                const hActiveAmmo = document.getElementById('hud-active-ammo');
                const hReserveAmmo = document.getElementById('hud-reserve-ammo');
                if (hActiveAmmo) hActiveAmmo.textContent = myState.ammo;
                if (hReserveAmmo) hReserveAmmo.textContent = myState.reserve;

                // Update slot HUD displays locally
                for (let i = 0; i < 2; i++) {
                    const slot = document.getElementById(`slot-${i+1}`);
                    const nameEl = document.getElementById(`slot-${i+1}-name`);
                    const ammoEl = document.getElementById(`slot-${i+1}-ammo`);

                    if (this.player && this.player.weapons) {
                        const wKey = this.player.weapons[i];
                        if (wKey) {
                            const weapon = WEAPONS[wKey];
                            if (nameEl && weapon) nameEl.textContent = weapon.name;
                            if (ammoEl) {
                                const activeAmmo = this.player.ammoInMag[wKey];
                                const reserve = wKey === 'pistol' ? '∞' : (this.player.reserveAmmo[wKey] || 0);
                                ammoEl.textContent = `${activeAmmo}/${reserve}`;
                            }
                        } else {
                            if (nameEl) nameEl.textContent = "EMPTY";
                            if (ammoEl) ammoEl.textContent = "-";
                        }
                    }

                    if (slot && this.player) {
                        if (this.player.activeWeaponIndex === i) {
                            slot.classList.add('active');
                        } else {
                            slot.classList.remove('active');
                        }
                    }
                }

                // Respawn screen display toggle
                const respawnOverlay = document.getElementById('respawn-overlay');
                if (respawnOverlay) {
                    if (!myState.active) {
                        respawnOverlay.classList.add('active');
                    } else {
                        respawnOverlay.classList.remove('active');
                    }
                }
            }

            // Sync active timer
            const mins = Math.floor((state.stormTimer || 0) / 60);
            const secs = (state.stormTimer || 0) % 60;
            const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            const stormTimerEl = document.getElementById('storm-timer');
            if (stormTimerEl) stormTimerEl.textContent = timeStr;

            const stormStatusEl = document.getElementById('storm-status-text');
            if (stormStatusEl) {
                if (this.gameMode === 'deathmatch') {
                    stormStatusEl.textContent = "TIME REMAINING";
                } else {
                    stormStatusEl.textContent = state.isZoneShrinking ? "SAFE ZONE CONTRACTING" : "SAFE ZONE SHRINKING IN";
                }
            }

            // Populate all entities for drawing
            this.bots = [];

            // Draw host player safely
            if (state.host) {
                const hostChar = new Character(state.host.x, state.host.y, "Host", false);
                hostChar.id = state.host.id || 'host';
                hostChar.rotation = state.host.rotation || 0;
                hostChar.health = state.host.health || 100;
                hostChar.shield = state.host.shield || 50;
                hostChar.active = state.host.active;
                hostChar.activeWeaponIndex = state.host.activeWeaponIndex || 0;
                hostChar.bodyColor = state.host.bodyColor;
                hostChar.handColor = state.host.handColor;
                this.bots.push(hostChar);
            }

            // Draw other clients safely
            const playersList = state.players || [];
            playersList.forEach(p => {
                if (p.id === myId || p.peerId === myPeerId) return;
                const name = (this.net && this.net.clientNames && this.net.clientNames[p.peerId]) || "Player";
                const char = new Character(p.x, p.y, name, false);
                char.id = p.id;
                char.rotation = p.rotation || 0;
                char.health = p.health || 100;
                char.shield = p.shield || 50;
                char.active = p.active;
                char.activeWeaponIndex = p.activeWeaponIndex || 0;
                char.bodyColor = p.bodyColor;
                char.handColor = p.handColor;
                this.bots.push(char);
            });

            // Draw bots safely
            const botsList = state.bots || [];
            botsList.forEach(b => {
                const char = new Character(b.x, b.y, b.name, true);
                char.id = b.id;
                char.rotation = b.rotation || 0;
                char.health = b.health || 100;
                char.shield = b.shield || 50;
                char.active = b.active;
                char.activeWeaponIndex = b.activeWeaponIndex || 0;
                char.bodyColor = b.bodyColor;
                char.handColor = b.handColor;
                this.bots.push(char);
            });

            // Sync bullets safely
            const bulletsList = state.bullets || [];
            this.bullets = bulletsList.map(b => new Bullet(b.x, b.y, 0, 0, 0, null, 100, b.color));

            // Sync items safely
            const itemsList = state.items || [];
            this.items = itemsList.map(i => new Item(i.x, i.y, i.type, i.detail));

            // Sync safe zone positions safely
            if (state.safeZone) this.safeZone = state.safeZone;
            if (state.nextZone) this.nextZone = state.nextZone;
            if (state.aliveCount !== undefined) this.aliveCount = state.aliveCount;

        } catch (error) {
            console.error("Error in syncClientState:", error);
        }
    }

    broadcastState() {
        if (this.networkRole !== 'host') return;

        // Build state snapshot
        const state = {
            players: this.bots.filter(b => !b.isBot).map(p => {
                const activeWeaponKey = p.weapons[p.activeWeaponIndex];
                return {
                    id: p.id || (p.peerConn ? p.peerConn.peer : null),
                    peerId: p.peerConn ? p.peerConn.peer : null,
                    x: p.x,
                    y: p.y,
                    rotation: p.rotation,
                    health: p.health,
                    shield: p.shield,
                    activeWeaponIndex: p.activeWeaponIndex,
                    weapons: p.weapons,
                    ammo: activeWeaponKey ? (p.ammoInMag[activeWeaponKey] || 0) : 0,
                    reserve: activeWeaponKey ? (p.reserveAmmo[activeWeaponKey] || 0) : 0,
                    kills: p.kills,
                    deaths: p.deaths || 0,
                    active: p.active,
                    bodyColor: p.bodyColor,
                    handColor: p.handColor
                };
            }),
            host: {
                id: this.player.id || 'host',
                x: this.player.x,
                y: this.player.y,
                rotation: this.player.rotation,
                health: this.player.health,
                shield: this.player.shield,
                activeWeaponIndex: this.player.activeWeaponIndex,
                ammo: this.player.weapons[this.player.activeWeaponIndex] ? (this.player.ammoInMag[this.player.weapons[this.player.activeWeaponIndex]] || 0) : 0,
                reserve: this.player.weapons[this.player.activeWeaponIndex] ? (this.player.reserveAmmo[this.player.weapons[this.player.activeWeaponIndex]] || 0) : 0,
                kills: this.player.kills,
                deaths: this.player.deaths || 0,
                active: this.player.active,
                bodyColor: this.player.bodyColor,
                handColor: this.player.handColor
            },
            bots: this.bots.filter(b => b.isBot).map(b => ({
                id: b.id,
                name: b.name,
                x: b.x,
                y: b.y,
                rotation: b.rotation,
                health: b.health,
                shield: b.shield,
                activeWeaponIndex: b.activeWeaponIndex,
                active: b.active,
                bodyColor: b.bodyColor,
                handColor: b.handColor
            })),
            bullets: this.bullets.map(bul => ({
                x: bul.x,
                y: bul.y,
                color: bul.color
            })),
            items: this.items.filter(item => item.active).map(item => ({
                x: item.x,
                y: item.y,
                type: item.type,
                detail: item.detail
            })),
            safeZone: {
                x: this.safeZone.x,
                y: this.safeZone.y,
                r: this.safeZone.r
            },
            nextZone: {
                x: this.nextZone.x,
                y: this.nextZone.y,
                r: this.nextZone.r
            },
            stormTimer: this.stormTimer,
            isZoneShrinking: this.isZoneShrinking,
            aliveCount: this.aliveCount
        };

        this.net.connections.forEach(conn => {
            conn.send({
                type: 'state',
                state: state
            });
        });
    }

    broadcastSFX(sfxType) {
        if (this.networkRole !== 'host') return;
        this.net.connections.forEach(conn => {
            conn.send({
                type: 'sfx',
                sfx: sfxType
            });
        });
    }

    broadcastAlert(title, desc) {
        if (this.networkRole !== 'host') return;
        this.net.connections.forEach(conn => {
            conn.send({
                type: 'alert',
                title: title,
                desc: desc
            });
        });
    }

    sendClientInputs() {
        if (this.networkRole !== 'client' || !this.net.hostConn) return;

        // Throttle to max 20 packets/second (every 50ms) to avoid flooding PeerJS
        const now = performance.now();
        if (now - (this._lastInputSend || 0) < 50) return;
        this._lastInputSend = now;

        const dx = this.mouse.x - (this.canvas.width / 2);
        const dy = this.mouse.y - (this.canvas.height / 2);
        const rotation = Math.atan2(dy, dx);

        this.net.hostConn.send({
            type: 'input',
            inputs: {
                w: this.inputs.w,
                a: this.inputs.a,
                s: this.inputs.s,
                d: this.inputs.d
            },
            rotation: rotation,
            weaponIndex: this.player ? this.player.activeWeaponIndex : 0,
            shoot: this.mouse.clickTriggered || false,
            reload: this.inputs.r || false,
            loot: this.inputs.loot || false
        });

        this.mouse.clickTriggered = false;
        this.inputs.loot = false;
    }

    // Handle incoming data on the client side from the host
    handleClientData(data) {
        if (data.type === 'state') {
            this.syncClientState(data.state);
        } else if (data.type === 'sfx') {
            sfx.init();
            switch (data.sfx) {
                case 'pistol':   sfx.playShoot('pistol'); break;
                case 'rifle':    sfx.playShoot('rifle'); break;
                case 'shotgun':  sfx.playShoot('shotgun'); break;
                case 'damage':   sfx.playDamage(); break;
                case 'heal':     sfx.playHeal(); break;
                case 'shield':   sfx.playShield(); break;
                case 'reload':   sfx.playReload(); break;
            }
        } else if (data.type === 'alert') {
            this.triggerAlert(data.title, data.desc);
        } else if (data.type === 'lobby') {
            this.net.updateClientLobbyUI(data.players);
        } else if (data.type === 'handshake_ack') {
            this.net.handleHandshakeAck(data);
        } else if (data.type === 'start') {
            this.startClientGame(data.config);
        } else if (data.type === 'gameover') {
            // Host ended the game
            this.endGame(STATES.GAMEOVER, "Host ended the match");
        }
    }

    // Reset back to the main menu start screen
    resetToMenu() {
        // Stop the game loop
        this.state = STATES.START_SCREEN;

        // Clear timer intervals
        if (this.zoneTimerInterval) {
            clearInterval(this.zoneTimerInterval);
            this.zoneTimerInterval = null;
        }

        // Clear alert timeout
        if (this.alertTimeout) {
            clearTimeout(this.alertTimeout);
        }

        // Reset entities
        this.player = null;
        this.bots = [];
        this.bullets = [];
        this.items = [];
        this.obstacles = [];
        this.particles = [];
        this.damageTexts = [];
        this.respawnQueue = [];

        // Reset network role
        this.networkRole = 'single';

        // Hide HUD
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('respawn-overlay').classList.remove('active');
        document.getElementById('victory-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.remove('active');

        // Show start screen with blur
        document.getElementById('screen-blur').classList.remove('fade-out');
        document.getElementById('start-screen').classList.add('active');

        // Reset lobby UI to default singleplayer tab
        document.getElementById('tab-singleplayer').classList.add('active');
        document.getElementById('tab-multiplayer').classList.remove('active');
        document.getElementById('singleplayer-settings').classList.remove('hidden');
        document.getElementById('multiplayer-settings').classList.add('hidden');

        // Reset multiplayer lobby UI state
        document.getElementById('host-btn').classList.remove('hidden');
        document.getElementById('host-details').classList.add('hidden');
        document.getElementById('generated-room-id').textContent = '-----';
        document.getElementById('join-details').classList.add('hidden');
        document.getElementById('join-room-id').value = '';
        document.getElementById('join-btn').removeAttribute('disabled');
    }

    // --- CANVAS GRAPHICS RENDER ---
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Center camera viewport on the player
        this.viewport.x = (this.canvas.width / 2) - this.player.x;
        this.viewport.y = (this.canvas.height / 2) - this.player.y;

        this.ctx.save();
        // Translate view mapping to player center
        this.ctx.translate(this.viewport.x, this.viewport.y);

        // 1. Draw Ground Base
        this.drawGroundGrid();

        // 2. Draw Items/Loot
        for (let item of this.items) {
            if (item.active && this.isInViewport(item)) {
                item.draw(this.ctx);
            }
        }

        // 3. Draw Obstacles: Lower Solid Layer (Trunk layer + wall/crate solid)
        for (let obs of this.obstacles) {
            if (obs.active && this.isInViewport(obs)) {
                if (obs.type === 'tree') {
                    obs.drawTrunk(this.ctx);
                } else {
                    obs.draw(this.ctx);
                }
            }
        }

        // 4. Draw Characters (Player and bots)
        for (let bot of this.bots) {
            if (bot.active && this.isInViewport(bot)) {
                bot.draw(this.ctx);
            }
        }

        if (this.player.active) {
            this.player.draw(this.ctx);
        }

        // 5. Draw Obstacles Upper Leaf Layer (allows characters to hide underneath)
        for (let obs of this.obstacles) {
            if (obs.active && obs.type === 'tree' && this.isInViewport(obs)) {
                obs.drawLeaves(this.ctx);
            }
        }

        // 6. Draw Bullets Projectiles
        for (let bullet of this.bullets) {
            if (this.isInViewport(bullet)) {
                bullet.draw(this.ctx);
            }
        }

        // 7. Draw Blood Particles & Floating Text
        for (let p of this.particles) {
            p.draw(this.ctx);
        }

        for (let dt of this.damageTexts) {
            dt.draw(this.ctx);
        }

        // 8. Draw Storm Ring overlay
        this.drawStormRing();

        this.ctx.restore();

        // 9. Draw Minimap in top-right HUD
        this.drawMinimap();
    }

    drawGroundGrid() {
        const gridGap = 80;
        
        // Ground green base
        this.ctx.fillStyle = "#1b212c";
        this.ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

        // Grid lines drawing
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
        this.ctx.lineWidth = 1;

        this.ctx.beginPath();
        for (let x = 0; x <= WORLD_SIZE; x += gridGap) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, WORLD_SIZE);
        }
        for (let y = 0; y <= WORLD_SIZE; y += gridGap) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(WORLD_SIZE, y);
        }
        this.ctx.stroke();

        // Draw visual map center landmark
        this.ctx.beginPath();
        this.ctx.arc(WORLD_SIZE / 2, WORLD_SIZE / 2, 80, 0, Math.PI * 2);
        this.ctx.strokeStyle = "rgba(255, 157, 0, 0.1)";
        this.ctx.lineWidth = 4;
        this.ctx.stroke();
    }

    drawStormRing() {
        // Draw blue safe circle border
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(this.safeZone.x, this.safeZone.y, this.safeZone.r, 0, Math.PI * 2);
        this.ctx.strokeStyle = "#00e5ff";
        this.ctx.lineWidth = 4;
        this.ctx.shadowColor = "#00e5ff";
        this.ctx.shadowBlur = 10;
        this.ctx.stroke();
        this.ctx.restore();

        // Draw translucent red storm zone outside the circle
        this.ctx.save();
        this.ctx.fillStyle = "rgba(239, 68, 68, 0.16)"; // translucent red overlay
        
        // Render storm as donut path (outside safe circle)
        this.ctx.beginPath();
        // outer rectangle box bounding map
        this.ctx.rect(0, 0, WORLD_SIZE, WORLD_SIZE);
        // inner safe circle (anti-clockwise to carve it out)
        this.ctx.arc(this.safeZone.x, this.safeZone.y, this.safeZone.r, 0, Math.PI * 2, true);
        this.ctx.fill();
        this.ctx.restore();

        // If zone is shrinking, draw next zone circle as dotted gold guideline
        if (this.isZoneShrinking) {
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(this.nextZone.x, this.nextZone.y, this.nextZone.r, 0, Math.PI * 2);
            this.ctx.strokeStyle = "rgba(251, 191, 36, 0.7)";
            this.ctx.setLineDash([5, 5]);
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.restore();
        }
    }

    drawMinimap() {
        const mw = this.minimapCanvas.width;
        const mh = this.minimapCanvas.height;
        const mctx = this.minimapCtx;

        mctx.clearRect(0, 0, mw, mh);

        // Scale factors mapping WORLD_SIZE to minimap size
        const sx = mw / WORLD_SIZE;
        const sy = mh / WORLD_SIZE;

        // Draw base ground
        mctx.fillStyle = "#111827";
        mctx.fillRect(0, 0, mw, mh);

        // Draw Storm Circle on Minimap
        mctx.beginPath();
        mctx.arc(this.safeZone.x * sx, this.safeZone.y * sy, this.safeZone.r * sx, 0, Math.PI * 2);
        mctx.strokeStyle = "#00e5ff";
        mctx.lineWidth = 1.5;
        mctx.stroke();
        
        // Next zone dot circle
        if (this.isZoneShrinking) {
            mctx.beginPath();
            mctx.arc(this.nextZone.x * sx, this.nextZone.y * sy, this.nextZone.r * sx, 0, Math.PI * 2);
            mctx.strokeStyle = "rgba(251, 191, 36, 0.6)";
            mctx.lineWidth = 1;
            mctx.stroke();
        }

        // Draw Obstacles (Walls only in gray dots to save space)
        mctx.fillStyle = "#4b5563";
        for (let obs of this.obstacles) {
            if (obs.active && obs.type === 'wall') {
                mctx.fillRect(obs.x * sx, obs.y * sy, obs.w * sx, obs.h * sy);
            }
        }

        // Draw Player position as glowing yellow dot
        if (this.player.active) {
            mctx.beginPath();
            mctx.arc(this.player.x * sx, this.player.y * sy, 4, 0, Math.PI * 2);
            mctx.fillStyle = "#fbbf24";
            mctx.fill();
        }

        // Draw Bots as red dots (optional: only if within storm or close to map limits, let's draw all to make it exciting)
        mctx.fillStyle = "#ef4444";
        for (let bot of this.bots) {
            if (bot.active) {
                mctx.beginPath();
                mctx.arc(bot.x * sx, bot.y * sy, 2, 0, Math.PI * 2);
                mctx.fill();
            }
        }
    }

    // Viewport camera frustum culling to optimize rendering
    isInViewport(entity) {
        const px = entity.x;
        const py = entity.y;
        const radius = entity.radius || Math.max(entity.w, entity.h) || 20;

        const left = this.player.x - (this.canvas.width / 2) - VIEWPORT_BUFFER;
        const right = this.player.x + (this.canvas.width / 2) + VIEWPORT_BUFFER;
        const top = this.player.y - (this.canvas.height / 2) - VIEWPORT_BUFFER;
        const bottom = this.player.y + (this.canvas.height / 2) + VIEWPORT_BUFFER;
        return (px + radius >= left && px - radius <= right &&
                py + radius >= top && py - radius <= bottom);
    }
}

class NetworkManager {
    constructor(game) {
        this.game = game;
        this.peer = null;
        this.connections = [];
        this.hostConn = null;
        this.roomId = '';
        this.clientNames = {};
        this.handshakeTimeout = null;
    }

    hostRoom() {
        const code = Math.floor(10000 + Math.random() * 90000).toString();
        this.roomId = 'BYH' + code;

        const hostBtn = document.getElementById('host-btn');
        const originalText = hostBtn.innerHTML;
        hostBtn.setAttribute('disabled', 'true');
        hostBtn.innerHTML = 'CREATING ROOM...';

        // Connect using secure parameters explicitly for maximum reliability
        this.peer = new Peer(this.roomId, {
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            secure: true,
            debug: 1
        });

        this.peer.on('open', (id) => {
            this.game.networkRole = 'host';
            hostBtn.classList.add('hidden');
            hostBtn.removeAttribute('disabled');
            hostBtn.innerHTML = originalText;

            document.getElementById('host-details').classList.remove('hidden');
            document.getElementById('generated-room-id').textContent = this.roomId;

            // Hide join options and center host lobby
            const lobbyGrid = document.getElementById('mp-lobby-grid');
            const lobbyDivider = document.getElementById('mp-lobby-divider');
            const joinCol = document.getElementById('mp-join-col');
            if (lobbyGrid) lobbyGrid.classList.add('single-col');
            if (lobbyDivider) lobbyDivider.classList.add('hidden');
            if (joinCol) joinCol.classList.add('hidden');

            const list = document.getElementById('host-member-list');
            list.innerHTML = '<li class="mp-player-self"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg> You (Host)</li>';
        });

        this.peer.on('connection', (conn) => {
            this.connections.push(conn);
            conn.on('data', (data) => {
                this.handleHostData(conn, data);
            });
            conn.on('close', () => {
                this.removeClient(conn);
            });
            conn.on('error', (err) => {
                console.error('Host connection error:', err);
                this.removeClient(conn);
            });
        });

        this.peer.on('error', (err) => {
            console.error('Peer host error:', err);
            alert('Could not host room. Network error or Room ID already taken.');
            hostBtn.removeAttribute('disabled');
            hostBtn.innerHTML = originalText;
            this.resetLobbyUI();
        });
    }

    resetLobbyUI() {
        document.getElementById('host-btn').classList.remove('hidden');
        document.getElementById('host-details').classList.add('hidden');
        document.getElementById('join-btn').removeAttribute('disabled');
        document.getElementById('join-details').classList.add('hidden');

        // Restore lobby layout grid and elements
        const lobbyGrid = document.getElementById('mp-lobby-grid');
        const lobbyDivider = document.getElementById('mp-lobby-divider');
        const hostCol = document.getElementById('mp-host-col');
        const joinCol = document.getElementById('mp-join-col');
        const joinPre = document.getElementById('join-pre');
        if (lobbyGrid) lobbyGrid.classList.remove('single-col');
        if (lobbyDivider) lobbyDivider.classList.remove('hidden');
        if (hostCol) hostCol.classList.remove('hidden');
        if (joinCol) joinCol.classList.remove('hidden');
        if (joinPre) joinPre.classList.remove('hidden');

        this.game.networkRole = 'single';
        this.roomId = '';
        if (this.handshakeTimeout) {
            clearTimeout(this.handshakeTimeout);
            this.handshakeTimeout = null;
        }
    }

    handleHostData(conn, data) {
        if (data.type === 'handshake') {
            this.clientNames[conn.peer] = data.name;

            // Remove any existing character with the same peer ID to prevent duplicates
            this.game.bots = this.game.bots.filter(b => b.id !== conn.peer);

            // Spawn remote player Character
            const rx = WORLD_SIZE / 2 + (Math.random() - 0.5) * 80;
            const ry = WORLD_SIZE / 2 + (Math.random() - 0.5) * 80;
            const remotePlayer = new Character(rx, ry, data.name, false);
            remotePlayer.peerConn = conn;
            remotePlayer.id = conn.peer;

            this.game.bots.push(remotePlayer);
            this.game.pushKillFeed("Lobby", `${data.name} connected`, "System");
            this.game.broadcastAlert("PLAYER JOINED", `${data.name} joined the room`);

            // Send acknowledgement back to client to confirm connection
            conn.send({
                type: 'handshake_ack',
                success: true
            });

            this.updateHostLobbyUI();

            document.getElementById('start-multiplayer-btn').removeAttribute('disabled');
        } else if (data.type === 'input') {
            try {
                const char = this.game.bots.find(b => b.id === conn.peer || (b.peerConn && b.peerConn.peer === conn.peer));
                if (char && char.active) {
                    char.inputs = data.inputs;
                    char.rotation = data.rotation;
                    char.activeWeaponIndex = data.weaponIndex;
                    if (data.shoot) {
                        char.shoot(); // Shoot handler already triggers broadcastSFX internally
                    }
                    if (data.reload) {
                        char.reload(); // Reload handler already triggers broadcastSFX internally
                    }
                    if (data.loot) {
                        this.game.checkCharacterLoot(char);
                    }
                }
            } catch (err) {
                console.error("Error processing host input:", err);
            }
        }
    }

    updateHostLobbyUI() {
        const list = document.getElementById('host-member-list');
        list.innerHTML = '<li class="mp-player-self"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg> You (Host)</li>';
        
        const playerNames = ["Host (" + (document.getElementById('player-name').value.trim() || "Survivor") + ")"];

        this.connections.forEach(conn => {
            const name = this.clientNames[conn.peer] || "Player";
            const li = document.createElement('li');
            li.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg> ${name}`;
            list.appendChild(li);
            playerNames.push(name);
        });

        // Broadcast current lobby player list to all clients
        this.connections.forEach(conn => {
            conn.send({
                type: 'lobby',
                players: playerNames
            });
        });
    }

    updateClientLobbyUI(players) {
        const list = document.getElementById('join-member-list');
        if (!list) return;
        list.innerHTML = '';
        players.forEach((name, idx) => {
            const li = document.createElement('li');
            li.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg> ${name}`;
            
            const pName = document.getElementById('player-name').value.trim() || "Survivor";
            if (name === pName && idx > 0) {
                li.className = "mp-player-self";
            } else if (idx === 0) {
                // Host highlight style
                li.style.color = "var(--primary)";
                li.style.fontWeight = "700";
            }
            list.appendChild(li);
        });
    }

    handleHandshakeAck(data) {
        if (this.handshakeTimeout) {
            clearTimeout(this.handshakeTimeout);
            this.handshakeTimeout = null;
        }
        this.isFullyConnected = true; // Mark connection as successfully authenticated
        const status = document.getElementById('join-status-text');
        status.textContent = "Connected. Waiting for host...";
        status.className = "status-connected";
    }

    removeClient(conn) {
        const idx = this.connections.indexOf(conn);
        if (idx !== -1) {
            this.connections.splice(idx, 1);
        }

        const charIdx = this.game.bots.findIndex(b => b.id === conn.peer || (b.peerConn && b.peerConn.peer === conn.peer));
        if (charIdx !== -1) {
            const char = this.game.bots[charIdx];
            this.game.pushKillFeed("Lobby", `${char.name} disconnected`, "System");
            this.game.bots.splice(charIdx, 1);
        }

        this.updateHostLobbyUI();

        if (this.connections.length === 0) {
            document.getElementById('start-multiplayer-btn').setAttribute('disabled', 'true');
        }
    }

    joinRoom(roomId) {
        this.roomId = roomId.trim().toUpperCase();
        this.game.networkRole = 'client';
        this.isFullyConnected = false; // Reset connection state

        if (this.handshakeTimeout) {
            clearTimeout(this.handshakeTimeout);
        }

        // Hide host options, divider, and code inputs for clients
        const lobbyGrid = document.getElementById('mp-lobby-grid');
        const lobbyDivider = document.getElementById('mp-lobby-divider');
        const hostCol = document.getElementById('mp-host-col');
        const joinPre = document.getElementById('join-pre');
        if (lobbyGrid) lobbyGrid.classList.add('single-col');
        if (lobbyDivider) lobbyDivider.classList.add('hidden');
        if (hostCol) hostCol.classList.add('hidden');
        if (joinPre) joinPre.classList.add('hidden');

        document.getElementById('join-btn').setAttribute('disabled', 'true');
        document.getElementById('join-details').classList.remove('hidden');

        const status = document.getElementById('join-status-text');
        status.textContent = "Connecting to signaling server...";
        status.className = "status-connecting";

        this.peer = new Peer({
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            secure: true,
            debug: 1
        });

        this.peer.on('open', (id) => {
            status.textContent = "Connecting to host...";
            this.hostConn = this.peer.connect(this.roomId);
            this.setupClientConnection(this.hostConn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer join error:', err);
            status.textContent = "Room not found or network error";
            status.className = "status-error";
            document.getElementById('join-btn').removeAttribute('disabled');
        });
    }

    setupClientConnection(conn) {
        const onOpen = () => {
            const status = document.getElementById('join-status-text');
            status.textContent = "Sending handshake...";
            status.className = "status-connecting";

            const pName = document.getElementById('player-name').value.trim() || "Survivor";
            conn.send({
                type: 'handshake',
                name: pName
            });

            // Start handshake response timeout (4 seconds)
            this.handshakeTimeout = setTimeout(() => {
                console.warn("Handshake timeout: Host did not respond.");
                status.textContent = "Host is offline or room doesn't exist.";
                status.className = "status-error";
                conn.close();
                document.getElementById('join-btn').removeAttribute('disabled');
            }, 4000);
        };

        // PeerJS timing safeguard: run handler immediately if connection is already open
        if (conn.open) {
            onOpen();
        } else {
            conn.on('open', onOpen);
        }

        conn.on('data', (data) => {
            this.game.handleClientData(data);
        });

        conn.on('close', () => {
            if (this.handshakeTimeout) {
                clearTimeout(this.handshakeTimeout);
                this.handshakeTimeout = null;
            }
            
            if (this.isFullyConnected) {
                this.game.migrateToOfflineMode();
            } else {
                const status = document.getElementById('join-status-text');
                if (status) {
                    status.textContent = "Host is offline or room doesn't exist.";
                    status.className = "status-error";
                }
                document.getElementById('join-btn').removeAttribute('disabled');
            }
        });

        conn.on('error', (err) => {
            console.error('Client data connection error:', err);
            if (this.handshakeTimeout) {
                clearTimeout(this.handshakeTimeout);
                this.handshakeTimeout = null;
            }
            
            if (this.isFullyConnected) {
                this.game.migrateToOfflineMode();
            } else {
                const status = document.getElementById('join-status-text');
                if (status) {
                    status.textContent = "Failed to connect to Host.";
                    status.className = "status-error";
                }
                document.getElementById('join-btn').removeAttribute('disabled');
            }
        });
    }

    getClientNames() {
        return this.clientNames;
    }
}

// Global Game Reference & Autostart hook
let game;
window.addEventListener('DOMContentLoaded', () => {
    game = new GameEngine();
    game.init();
});
