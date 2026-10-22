/**
 * ============================================================================
 * AEGIS-SHIELD // TACTICAL SIMULATION ENGINE (BALLISTIC & INTERCEPTOR DYNAMICS)
 * Provides 6-DoF Physics Trajectories for Targets, Countermeasures & Clutter
 * ============================================================================
 */

class TacticalSimEngine {
  constructor() {
    this.targets = [];
    this.interceptors = [];
    this.explosions = [];
    this.nextTargetId = 101;
    this.scenarioType = 'ballistic';
    this.active = true;
    this.lastSpawnTime = 0;
  }

  setScenario(type) {
    this.scenarioType = type;
    this.targets = [];
    this.interceptors = [];
    this.explosions = [];
    this.spawnScenarioWave();
  }

  spawnScenarioWave() {
    const now = Date.now();
    this.lastSpawnTime = now;

    if (this.scenarioType === 'ballistic') {
      // Single High-Speed Ballistic Missile
      this.spawnMissile({
        type: 'BALLISTIC',
        startRange: 380, // cm in lab scale / meters in theater
        startAngle: 45 + (Math.random() * 20 - 10),
        altitude: 180,
        speed: 1.8,
        heading: 225,
        diveAngle: 0.25,
        targetAsset: { x: 0, y: 0 }
      });
    } 
    else if (this.scenarioType === 'salvo') {
      // Saturation Salvo: 3 Incoming Missiles
      const bearings = [35, 75, 120];
      bearings.forEach((b, idx) => {
        setTimeout(() => {
          this.spawnMissile({
            type: 'SALVO',
            startRange: 360 + (idx * 20),
            startAngle: b,
            altitude: 150 + (idx * 15),
            speed: 1.6 + (idx * 0.2),
            heading: 180 + b,
            diveAngle: 0.2,
            targetAsset: { x: 0, y: 0 }
          });
        }, idx * 1200);
      });
    }
    else if (this.scenarioType === 'cruise') {
      // Low-Altitude Evasive Cruise Missile
      this.spawnMissile({
        type: 'CRUISE',
        startRange: 340,
        startAngle: 110,
        altitude: 25, // Hugging the ground
        speed: 2.2,
        evasive: true,
        evasiveFreq: 0.05,
        evasiveAmp: 25,
        targetAsset: { x: 0, y: 0 }
      });
    }
    else if (this.scenarioType === 'hypersonic') {
      // Hypersonic Strike
      this.spawnMissile({
        type: 'HYPERSONIC',
        startRange: 420,
        startAngle: 90,
        altitude: 280,
        speed: 4.5,
        diveAngle: 0.55,
        targetAsset: { x: 0, y: 0 }
      });
    }
    else if (this.scenarioType === 'clutter') {
      // Decoys & Bird Clutter (Non-threatening)
      for (let i = 0; i < 4; i++) {
        this.spawnMissile({
          type: 'CLUTTER',
          startRange: 150 + Math.random() * 150,
          startAngle: 20 + Math.random() * 140,
          altitude: 10 + Math.random() * 30,
          speed: 0.15 + Math.random() * 0.2, // Very slow
          wandering: true,
          targetAsset: { x: 9999, y: 9999 }
        });
      }
    }
  }

  spawnMissile(config) {
    const rad = (180 - config.startAngle) * (Math.PI / 180);
    const x = Math.cos(rad) * config.startRange;
    const y = -Math.sin(rad) * config.startRange; // 2D ground projection
    const z = config.altitude || 100; // 3D altitude

    const target = {
      id: this.nextTargetId++,
      type: config.type,
      x: x,
      y: y,
      z: z,
      range: config.startRange,
      azimuth: config.startAngle,
      speed: config.speed,
      vx: -(x / config.startRange) * config.speed,
      vy: -(y / config.startRange) * config.speed,
      vz: config.diveAngle ? -config.speed * config.diveAngle : -0.2,
      evasive: config.evasive || false,
      evasiveTick: 0,
      active: true,
      destroyed: false,
      trail: []
    };

    this.targets.push(target);
    if (window.tacticalAudio) {
      window.tacticalAudio.playKlaxon();
      window.tacticalAudio.speakTactical(`Warning! Hostile inbound detected, bearing ${Math.round(target.azimuth)} degrees.`);
    }
    if (window.logTacticalEvent) {
      window.logTacticalEvent(`TRACK ACQUIRED: TGT-${target.id} [${target.type}] at R=${Math.round(target.range)}cm, Az=${Math.round(target.azimuth)}°`, 'warn');
    }
  }

  launchInterceptor(interceptSol) {
    const interceptor = {
      id: Math.floor(Math.random() * 900) + 100,
      x: 0,
      y: 0,
      z: 0, // Launcher pad at radar center
      targetId: interceptSol.targetId,
      targetX: interceptSol.predictedX,
      targetY: interceptSol.predictedY,
      targetZ: interceptSol.predictedZ || 60,
      speed: 4.8, // Faster than incoming missile
      active: true,
      trail: [],
      launchTime: Date.now()
    };

    this.interceptors.push(interceptor);
    if (window.tacticalAudio) {
      window.tacticalAudio.playRocketLaunch();
      window.tacticalAudio.speakTactical(`Countermeasure dispatched for track ${interceptSol.targetId}.`);
    }
    if (window.logTacticalEvent) {
      window.logTacticalEvent(`INTERCEPTOR LAUNCHED: SAM-${interceptor.id} engaging TGT-${interceptor.targetId}`, 'sys');
    }
  }

  update(delta = 1.0) {
    // 1. Update Targets
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      if (!t.active) continue;

      // Evasive maneuver sinusoidal perturbation
      if (t.evasive) {
        t.evasiveTick += 0.08;
        t.x += Math.sin(t.evasiveTick) * 1.4;
      }

      t.x += t.vx * delta;
      t.y += t.vy * delta;
      t.z += t.vz * delta;

      // Update polar coordinates
      t.range = Math.sqrt(t.x * t.x + t.y * t.y);
      const angleRad = Math.atan2(-t.y, t.x);
      let deg = 180 - (angleRad * (180 / Math.PI));
      if (deg < 0) deg += 360;
      t.azimuth = deg;

      // Add to breadcrumb trail
      t.trail.push({ x: t.x, y: t.y, z: t.z });
      if (t.trail.length > 30) t.trail.shift();

      // Impact on ground / defended base
      if (t.range <= 25 || t.z <= 0) {
        t.active = false;
        this.createExplosion(t.x, t.y, Math.max(0, t.z), 'IMPACT');
        if (window.tacticalAudio) {
          window.tacticalAudio.playExplosion();
          window.tacticalAudio.speakTactical(`Impact breach in defended zone. Sector alert!`, true);
        }
        if (window.logTacticalEvent) {
          window.logTacticalEvent(`CRITICAL BREACH: TGT-${t.id} impacted defended zone!`, 'crit');
        }
      }
    }

    // 2. Update Interceptors (Proportional Navigation)
    for (let i = this.interceptors.length - 1; i >= 0; i--) {
      const itc = this.interceptors[i];
      if (!itc.active) continue;

      // Find locked target
      const target = this.targets.find(t => t.id === itc.targetId && t.active);
      let aimX = itc.targetX;
      let aimY = itc.targetY;
      let aimZ = itc.targetZ;

      if (target) {
        aimX = target.x;
        aimY = target.y;
        aimZ = target.z;
      }

      const dx = aimX - itc.x;
      const dy = aimY - itc.y;
      const dz = aimZ - itc.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 18) {
        // DIRECT HIT / MID-AIR INTERCEPTION!
        itc.active = false;
        if (target) {
          target.active = false;
          target.destroyed = true;
        }
        this.createExplosion(itc.x, itc.y, itc.z, 'INTERCEPT');
        if (window.tacticalAudio) {
          window.tacticalAudio.playExplosion();
          window.tacticalAudio.speakTactical(`Target neutralized. Intercept successful.`);
        }
        if (window.logTacticalEvent) {
          window.logTacticalEvent(`INTERCEPT CONFIRMED: TGT-${itc.targetId} destroyed at R=${Math.round(dist)}cm!`, 'sys');
        }
        continue;
      }

      // Fly towards target
      itc.x += (dx / dist) * itc.speed * delta;
      itc.y += (dy / dist) * itc.speed * delta;
      itc.z += (dz / dist) * itc.speed * delta;

      itc.trail.push({ x: itc.x, y: itc.y, z: itc.z });
      if (itc.trail.length > 25) itc.trail.shift();

      // Lost lock timeout
      if (Date.now() - itc.launchTime > 8000) {
        itc.active = false;
      }
    }

    // 3. Update Explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.age += delta;
      exp.radius += 2.5 * delta;
      exp.alpha -= 0.03 * delta;
      if (exp.alpha <= 0) {
        this.explosions.splice(i, 1);
      }
    }

    // Respawn wave if all targets destroyed/impacted
    const activeTargets = this.targets.filter(t => t.active);
    if (activeTargets.length === 0 && (Date.now() - this.lastSpawnTime > 6000)) {
      this.spawnScenarioWave();
    }
  }

  createExplosion(x, y, z, type) {
    this.explosions.push({
      x: x,
      y: y,
      z: z,
      radius: 8,
      maxRadius: type === 'INTERCEPT' ? 45 : 30,
      alpha: 1.0,
      age: 0,
      type: type
    });
  }
}

window.tacticalSim = new TacticalSimEngine();
