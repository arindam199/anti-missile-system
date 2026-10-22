/**
 * ============================================================================
 * AEGIS-SHIELD // TACTICAL C2 MASTER APPLICATION CONTROLLER
 * Web Serial Driver, Extended Kalman Filter (EKF), TEWA, & Fire Control
 * ============================================================================
 */

class TacticalC2App {
  constructor() {
    this.serialPort = null;
    this.serialReader = null;
    this.serialWriter = null;
    this.isConnected = false;

    // Operational State
    this.roeMode = 'auto'; // 'manual', 'semi', 'auto'
    this.systemState = 'SCANNING'; // 'STANDBY', 'SCANNING', 'TRACKING', 'LOCKED', 'INTERCEPTING'
    this.currentSweepAngle = 90;
    this.currentElevation = 30;
    this.interceptorInventory = 12;
    this.laserActive = false;
    this.isEStopped = false;
    this.lastFireTime = 0;
    this.activeView = '2d'; // '2d' or '3d'

    // Radar & Tracking
    this.radar2D = null;
    this.tactical3D = null;
    this.trackedTargets = new Map(); // Track ID -> EKF Track
    this.primaryThreat = null;
    this.fireControlSolution = null;

    // Flight Blackbox Log
    this.telemetryLog = [];

    this.init();
  }

  init() {
    // Initialize Renderers
    this.radar2D = new Radar2DRenderer('radar2d-canvas');
    this.tactical3D = new Tactical3DRenderer('tactical3d-canvas');

    // Bind UI controls
    this.bindDOMEvents();

    // Start Simulation Wave
    if (window.tacticalSim) {
      window.tacticalSim.spawnScenarioWave();
    }

    // Main 60 FPS Tactical Loop
    requestAnimationFrame((t) => this.tacticalLoop(t));

    // Initial system voice
    setTimeout(() => {
      if (window.tacticalAudio) {
        window.tacticalAudio.speakTactical('AEGIS Air Defense Tactical Operations Center initialized. All systems nominal.');
      }
      this.logEvent('SYSTEM BOOT: AEGIS-SHIELD Tactical C2 v4.0 Online', 'sys');
    }, 1000);
  }

  bindDOMEvents() {
    // 1. Web Serial Connect Button
    const btnConnect = document.getElementById('btn-connect-serial');
    if (btnConnect) {
      btnConnect.addEventListener('click', () => this.toggleSerialConnection());
    }

    // 2. Fire Interceptor Button
    const btnFire = document.getElementById('btn-fire');
    if (btnFire) {
      btnFire.addEventListener('click', () => this.commandFireInterceptor());
    }

    // 3. Laser Toggle Button
    const btnLaser = document.getElementById('btn-laser');
    if (btnLaser) {
      btnLaser.addEventListener('click', () => this.toggleTargetingLaser());
    }

    // 4. Emergency Stop
    const btnEstop = document.getElementById('btn-estop');
    if (btnEstop) {
      btnEstop.addEventListener('click', () => this.triggerEmergencyStop());
    }

    // 5. Reset Tracks
    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => this.resetTracks());
    }

    // 6. View Tabs (2D vs 3D)
    const tab2d = document.getElementById('tab-2d');
    const tab3d = document.getElementById('tab-3d');
    const canvas2d = document.getElementById('radar2d-canvas');
    const canvas3d = document.getElementById('tactical3d-canvas');

    if (tab2d && tab3d) {
      tab2d.addEventListener('click', () => {
        this.activeView = '2d';
        tab2d.classList.add('active');
        tab3d.classList.remove('active');
        canvas2d.style.display = 'block';
        canvas3d.style.display = 'none';
        this.radar2D.resize();
      });
      tab3d.addEventListener('click', () => {
        this.activeView = '3d';
        tab3d.classList.add('active');
        tab2d.classList.remove('active');
        canvas2d.style.display = 'none';
        canvas3d.style.display = 'block';
      });
    }

    // 7. ROE Mode Selection
    document.querySelectorAll('.roe-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.roe-btn').forEach(b => b.classList.remove('active'));
        const mode = btn.dataset.roe;
        btn.classList.add('active');
        this.roeMode = mode;
        this.logEvent(`R.O.E. CHANGED: Switched to ${mode.toUpperCase()} defense mode`, 'warn');
        if (window.tacticalAudio) {
          window.tacticalAudio.speakTactical(`Rules of engagement set to ${mode}`);
        }
      });
    });

    // 8. Scenario Selector
    const selScenario = document.getElementById('sel-scenario');
    if (selScenario) {
      selScenario.addEventListener('change', (e) => {
        if (window.tacticalSim) {
          window.tacticalSim.setScenario(e.target.value);
          this.logEvent(`SCENARIO LOADED: ${e.target.options[e.target.selectedIndex].text}`, 'sys');
        }
      });
    }

    // 9. Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F' || e.key === ' ') {
        this.commandFireInterceptor();
      } else if (e.key === 'l' || e.key === 'L') {
        this.toggleTargetingLaser();
      } else if (e.key === 'Escape') {
        this.triggerEmergencyStop();
      }
    });

    // Audio & Voice Toggles
    const chkSfx = document.getElementById('chk-sfx');
    if (chkSfx) chkSfx.addEventListener('change', (e) => {
      if (window.tacticalAudio) window.tacticalAudio.sfxEnabled = e.target.checked;
    });

    const chkVoice = document.getElementById('chk-voice');
    if (chkVoice) chkVoice.addEventListener('change', (e) => {
      if (window.tacticalAudio) window.tacticalAudio.voiceEnabled = e.target.checked;
    });

    // Export Telemetry
    const btnExport = document.getElementById('btn-export-log');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.exportTelemetryLog());
    }
  }

  // ==========================================================================
  // WEB SERIAL DRIVER (PLUG & PLAY HARDWARE)
  // ==========================================================================
  async toggleSerialConnection() {
    if (this.isConnected) {
      await this.disconnectSerial();
      return;
    }

    if (!('serial' in navigator)) {
      alert('Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.');
      return;
    }

    try {
      this.serialPort = await navigator.serial.requestPort();
      const baud = parseInt(document.getElementById('sel-baud')?.value || '115200');
      await this.serialPort.open({ baudRate: baud });
      this.isConnected = true;

      const btn = document.getElementById('btn-connect-serial');
      if (btn) {
        btn.textContent = 'DISCONNECT HARDWARE';
        btn.style.background = '#ff2a4b';
        btn.style.color = '#fff';
      }

      this.logEvent(`SERIAL CONNECTED: Bound to COM port at ${baud} baud`, 'sys');
      if (window.tacticalAudio) {
        window.tacticalAudio.speakTactical('Hardware link established. Live telemetry active.');
      }

      this.readSerialStream();
    } catch (err) {
      console.error('Serial connection error:', err);
      this.logEvent(`SERIAL ERROR: ${err.message}`, 'crit');
    }
  }

  async readSerialStream() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.serialPort.readable.pipeTo(textDecoder.writable);
    this.serialReader = textDecoder.readable.getReader();

    let buffer = '';
    try {
      while (true) {
        const { value, done } = await this.serialReader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep partial line in buffer

          for (const line of lines) {
            this.parseSerialLine(line.trim());
          }
        }
      }
    } catch (err) {
      console.warn('Serial stream read ended:', err);
    } finally {
      this.serialReader.releaseLock();
    }
  }

  parseSerialLine(line) {
    if (!line) return;

    // Format A: Standard NMEA $RADAR,az,el,dist,flags*00
    if (line.startsWith('$RADAR')) {
      const parts = line.split(',');
      if (parts.length >= 4) {
        const az = parseFloat(parts[1]);
        const el = parseFloat(parts[2]);
        const dist = parseFloat(parts[3]);
        this.handleSensorMeasurement(az, el, dist);
      }
    }
    // Format B: Legacy format "angle,distance."
    else if (line.endsWith('.')) {
      const clean = line.slice(0, -1);
      const parts = clean.split(',');
      if (parts.length === 2) {
        const az = parseFloat(parts[0]);
        const dist = parseFloat(parts[1]);
        this.handleSensorMeasurement(az, 30, dist);
      }
    }
  }

  async sendSerialCommand(cmd) {
    if (!this.isConnected || !this.serialPort) return;
    try {
      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(this.serialPort.writable);
      const writer = textEncoder.writable.getWriter();
      await writer.write(cmd + '\n');
      writer.releaseLock();
    } catch (e) {
      console.warn('Failed to send serial command:', e);
    }
  }

  async disconnectSerial() {
    if (this.serialReader) {
      await this.serialReader.cancel();
    }
    if (this.serialPort) {
      await this.serialPort.close();
    }
    this.isConnected = false;
    this.serialPort = null;
    const btn = document.getElementById('btn-connect-serial');
    if (btn) {
      btn.textContent = 'CONNECT ARDUINO USB';
      btn.style.background = '';
      btn.style.color = '';
    }
    this.logEvent('SERIAL DISCONNECTED: Switched to HIL simulation', 'warn');
  }

  // ==========================================================================
  // SENSOR MEASUREMENT & EXTENDED KALMAN FILTER (EKF)
  // ==========================================================================
  handleSensorMeasurement(azimuth, elevation, distance) {
    this.currentSweepAngle = azimuth;
    this.currentElevation = elevation;
    this.radar2D.setSweep(azimuth);

    if (distance > 5 && distance < 380) {
      this.radar2D.addBlip(azimuth, distance);
      this.updateTrackFilter(azimuth, distance);
    }
  }

  updateTrackFilter(azimuth, distance) {
    const rad = (180 - azimuth) * (Math.PI / 180);
    const mx = Math.cos(rad) * distance;
    const my = -Math.sin(rad) * distance;

    let matchedTrack = null;
    let minResidual = 35; // correlation gate radius in cm

    for (const [id, track] of this.trackedTargets) {
      const dx = mx - track.x;
      const dy = my - track.y;
      const res = Math.sqrt(dx * dx + dy * dy);
      if (res < minResidual) {
        minResidual = res;
        matchedTrack = track;
        break;
      }
    }

    const now = Date.now();

    if (matchedTrack) {
      // EKF Measurement Update
      const dt = Math.max(0.02, (now - matchedTrack.lastUpdate) / 1000);
      const alpha = 0.65; // Kalman gain weight

      const rawVx = (mx - matchedTrack.x) / dt;
      const rawVy = (my - matchedTrack.y) / dt;

      matchedTrack.vx = (matchedTrack.vx * (1 - alpha)) + (rawVx * alpha);
      matchedTrack.vy = (matchedTrack.vy * (1 - alpha)) + (rawVy * alpha);
      matchedTrack.x = (matchedTrack.x * (1 - alpha)) + (mx * alpha);
      matchedTrack.y = (matchedTrack.y * (1 - alpha)) + (my * alpha);
      matchedTrack.range = Math.sqrt(matchedTrack.x * matchedTrack.x + matchedTrack.y * matchedTrack.y);
      matchedTrack.azimuth = azimuth;
      matchedTrack.speed = Math.sqrt(matchedTrack.vx * matchedTrack.vx + matchedTrack.vy * matchedTrack.vy);
      matchedTrack.lastUpdate = now;
      matchedTrack.hits++;

      matchedTrack.trail.push({ azimuth, range: matchedTrack.range });
      if (matchedTrack.trail.length > 20) matchedTrack.trail.shift();
    } else {
      // Track Initiation
      const newId = Math.floor(Math.random() * 800) + 100;
      this.trackedTargets.set(newId, {
        id: newId,
        x: mx,
        y: my,
        z: 60,
        vx: 0,
        vy: 0,
        range: distance,
        azimuth: azimuth,
        speed: 0,
        lastUpdate: now,
        hits: 1,
        trail: [{ azimuth, range: distance }]
      });
    }
  }

  // ==========================================================================
  // THREAT EVALUATION & WEAPON ASSIGNMENT (TEWA)
  // ==========================================================================
  evaluateThreats() {
    const now = Date.now();
    let highestThreat = null;
    let shortestTTI = 9999;

    // Ingest simulated targets if hardware is not feeding tracks
    const allTargets = [];
    if (window.tacticalSim && window.tacticalSim.targets) {
      window.tacticalSim.targets.forEach(t => {
        if (t.active) allTargets.push(t);
      });
    }
    for (const [id, trk] of this.trackedTargets) {
      if (now - trk.lastUpdate < 3000) {
        allTargets.push(trk);
      } else {
        this.trackedTargets.delete(id);
      }
    }

    allTargets.forEach(tgt => {
      // Closing speed: dot product of velocity towards base
      const r = tgt.range || Math.sqrt(tgt.x * tgt.x + tgt.y * tgt.y);
      const vx = tgt.vx || 0;
      const vy = tgt.vy || 0;
      const closingSpeed = Math.max(0.1, -(tgt.x * vx + tgt.y * vy) / (r || 1));
      const tti = r / (closingSpeed * 10); // seconds to impact
      tgt.tti = tti;

      if (r < 250 && tti < shortestTTI) {
        shortestTTI = tti;
        highestThreat = tgt;
      }
    });

    this.primaryThreat = highestThreat;

    // Calculate Fire Control Solution for primary threat
    if (this.primaryThreat) {
      this.computeFireControlSolution(this.primaryThreat);
    } else {
      this.fireControlSolution = null;
    }
  }

  computeFireControlSolution(tgt) {
    const interceptorSpeed = 4.8; // cm/frame or m/s scaled
    const tgtSpeed = tgt.speed || 1.8;
    const tgtDist = tgt.range;

    // Lead Angle Intercept
    const timeToIntercept = tgtDist / (interceptorSpeed + tgtSpeed);
    const predictedX = tgt.x + (tgt.vx || 0) * (timeToIntercept * 15);
    const predictedY = tgt.y + (tgt.vy || 0) * (timeToIntercept * 15);
    const predictedZ = Math.max(20, (tgt.z || 60) - 10);

    const solAngleRad = Math.atan2(-predictedY, predictedX);
    let solAzimuth = 180 - (solAngleRad * (180 / Math.PI));
    if (solAzimuth < 0) solAzimuth += 360;

    const solRange = Math.sqrt(predictedX * predictedX + predictedY * predictedY);

    this.fireControlSolution = {
      targetId: tgt.id,
      azimuth: solAzimuth,
      elevation: 35,
      range: solRange,
      predictedX,
      predictedY,
      predictedZ,
      timeToIntercept,
      active: true
    };
  }

  // ==========================================================================
  // AUTONOMOUS CIWS & WEAPON RELEASE
  // ==========================================================================
  checkAutonomousEngagement() {
    if (this.isEStopped || this.interceptorInventory <= 0) return;

    if (this.primaryThreat && this.fireControlSolution) {
      const now = Date.now();
      const isCritical = this.primaryThreat.range < 140 && this.primaryThreat.tti < 5.0;

      if (this.roeMode === 'auto' && isCritical && (now - this.lastFireTime > 2500)) {
        this.commandFireInterceptor();
      }
    }
  }

  commandFireInterceptor() {
    if (this.interceptorInventory <= 0) {
      this.logEvent('FIRE REJECTED: Magazine depleted (0 countermeasures left)', 'warn');
      return;
    }
    if (this.isEStopped) {
      this.logEvent('FIRE REJECTED: Emergency Stop is active!', 'crit');
      return;
    }

    this.lastFireTime = Date.now();
    this.interceptorInventory--;
    this.laserActive = true;

    // 1. Send hardware fire command to Arduino
    if (this.isConnected) {
      if (this.fireControlSolution) {
        this.sendSerialCommand(`SETPOS ${Math.round(this.fireControlSolution.azimuth)} 35`);
      }
      this.sendSerialCommand('FIRE');
      this.sendSerialCommand('LASER 1');
    }

    // 2. Dispatch simulated interceptor
    if (window.tacticalSim && this.fireControlSolution) {
      window.tacticalSim.launchInterceptor(this.fireControlSolution);
    }

    // 3. Audio & Voice
    if (window.tacticalAudio) {
      window.tacticalAudio.playRocketLaunch();
      window.tacticalAudio.speakTactical('Fox Two. Countermeasure in flight.');
    }

    this.logEvent(`INTERCEPTOR LAUNCHED! Engaging Track TGT-${this.fireControlSolution ? this.fireControlSolution.targetId : 'PRIMARY'}`, 'sys');
  }

  toggleTargetingLaser() {
    this.laserActive = !this.laserActive;
    if (this.isConnected) {
      this.sendSerialCommand(this.laserActive ? 'LASER 1' : 'LASER 0');
    }
    this.logEvent(`LASER DESIGNATOR: ${this.laserActive ? 'ENERGIZED' : 'OFFLINE'}`, 'warn');
  }

  triggerEmergencyStop() {
    this.isEStopped = true;
    this.laserActive = false;
    if (this.isConnected) {
      this.sendSerialCommand('ESTOP');
    }
    if (window.tacticalAudio) {
      window.tacticalAudio.speakTactical('Emergency Stop engaged! All weapons halted.', true);
    }
    this.logEvent('EMERGENCY STOP (ESTOP) ACTIVATED!', 'crit');
  }

  resetTracks() {
    this.isEStopped = false;
    this.trackedTargets.clear();
    this.primaryThreat = null;
    this.fireControlSolution = null;
    this.interceptorInventory = 12;
    if (this.isConnected) {
      this.sendSerialCommand('RESET');
    }
    if (window.tacticalSim) {
      window.tacticalSim.spawnScenarioWave();
    }
    this.logEvent('TACTICAL RESET: Tracks cleared & magazines reloaded', 'sys');
  }

  // ==========================================================================
  // MAIN LOOP & TELEMETRY UI BINDINGS
  // ==========================================================================
  tacticalLoop(timestamp) {
    // 1. Advance Physics Simulation if running
    if (window.tacticalSim) {
      window.tacticalSim.update(1.0);

      // If not connected to hardware, feed simulated radar sweep
      if (!this.isConnected) {
        this.currentSweepAngle += 2;
        if (this.currentSweepAngle > 180) this.currentSweepAngle = 0;
        this.radar2D.setSweep(this.currentSweepAngle);

        // Blip generation from simulated targets
        window.tacticalSim.targets.forEach(t => {
          if (t.active && Math.abs(t.azimuth - this.currentSweepAngle) < 3.5) {
            this.radar2D.addBlip(t.azimuth, t.range);
          }
        });
      }
    }

    // 2. Threat Evaluation & Weapon Assignment
    this.evaluateThreats();

    // 3. Autonomous CIWS Decision Check
    this.checkAutonomousEngagement();

    // 4. Render Active View
    const simTargets = window.tacticalSim ? window.tacticalSim.targets.filter(t => t.active) : [];
    const simInterceptors = window.tacticalSim ? window.tacticalSim.interceptors.filter(i => i.active) : [];
    const simExplosions = window.tacticalSim ? window.tacticalSim.explosions : [];

    if (this.activeView === '2d' && this.radar2D) {
      this.radar2D.render(simTargets, this.fireControlSolution, simExplosions, simInterceptors);
    } else if (this.activeView === '3d' && this.tactical3D) {
      this.tactical3D.render(simTargets, simInterceptors, simExplosions, this.laserActive, this.currentSweepAngle);
    }

    // 5. Update UI Telemetry Panels
    this.updateHUDReadouts();

    requestAnimationFrame((t) => this.tacticalLoop(t));
  }

  updateHUDReadouts() {
    // Header telemetry
    const elAz = document.getElementById('val-cur-az');
    if (elAz) elAz.textContent = `${this.currentSweepAngle.toFixed(0)}°`;

    const elInv = document.getElementById('val-interceptor-count');
    if (elInv) elInv.textContent = `${this.interceptorInventory}/12`;

    const elDefcon = document.getElementById('defcon-banner');
    const elDefconText = document.getElementById('defcon-text');
    if (elDefcon && elDefconText) {
      if (this.primaryThreat) {
        elDefcon.classList.add('threat-active');
        elDefconText.textContent = 'DEFCON 1 // AIR RAID ALERT';
      } else {
        elDefcon.classList.remove('threat-active');
        elDefconText.textContent = 'DEFCON 5 // SECTOR CLEAR';
      }
    }

    // Threat Panel
    const cardThreat = document.getElementById('threat-matrix-card');
    if (cardThreat) {
      if (this.primaryThreat) {
        cardThreat.classList.remove('clear');
        cardThreat.innerHTML = `
          <div class="metric-row">
            <span class="metric-label">TARGET ID</span>
            <span class="target-badge">TGT-${this.primaryThreat.id}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">CLASSIFICATION</span>
            <span class="metric-value" style="color:var(--accent-red)">${this.primaryThreat.type || 'HOSTILE MISSILE'}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">SLANT RANGE</span>
            <span class="metric-value">${this.primaryThreat.range.toFixed(1)} cm</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">BEARING</span>
            <span class="metric-value">${this.primaryThreat.azimuth.toFixed(0)}°</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">CLOSING VELOCITY</span>
            <span class="metric-value">${((this.primaryThreat.speed || 1.8) * 10).toFixed(1)} cm/s</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">TIME TO IMPACT (TTI)</span>
            <span class="metric-value" style="color:${this.primaryThreat.tti < 4 ? 'var(--accent-red)' : 'var(--accent-yellow)'}">${this.primaryThreat.tti.toFixed(1)}s</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">LEAD ANGLE SOLUTION</span>
            <span class="metric-value" style="color:var(--accent-cyan)">${this.fireControlSolution ? this.fireControlSolution.azimuth.toFixed(0) + '°' : 'COMPUTING...'}</span>
          </div>
        `;
      } else {
        cardThreat.classList.add('clear');
        cardThreat.innerHTML = `
          <div style="color:var(--accent-green); text-align:center; padding: 25px 0;">
            <div style="font-size:24px; margin-bottom:8px;">✔</div>
            <strong>NO ACTIVE THREATS IN SECTOR</strong>
            <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">Surveillance Radar Operating Nominally</div>
          </div>
        `;
      }
    }
  }

  logEvent(msg, type = 'sys') {
    const timeStr = new Date().toTimeString().split(' ')[0];
    const logBox = document.getElementById('event-log-container');
    if (!logBox) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${timeStr}]</span><span class="log-msg ${type}">${msg}</span>`;

    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;

    this.telemetryLog.push({ timestamp: new Date().toISOString(), message: msg, type: type });
  }

  exportTelemetryLog() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.telemetryLog, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `aegis_blackbox_telemetry_${Date.now()}.json`);
    dlAnchor.click();
    this.logEvent('TELEMETRY EXPORTED: Saved mission blackbox JSON', 'sys');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new TacticalC2App();
});
