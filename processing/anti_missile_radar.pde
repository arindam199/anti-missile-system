/*
 ============================================================================
  PROJECT : AEGIS-SHIELD / AMDS INDUSTRIAL PROCESSING TACTICAL RADAR HUD
  ROLE    : Tactical Radar Display, Threat Tracking & Fire Control System
  TARGET  : Processing 3 / Processing 4 (Java Mode)
 ============================================================================
*/

import processing.serial.*;

Serial arduinoPort;
boolean serialConnected = false;
String rawData = "";

// System & Radar State
float currentAngle = 90;
float currentDistance = 0;
boolean isPaused = false;
boolean autonomousCIWS = true; // Auto-fire on critical inbound threats!
boolean laserActive = false;
int interceptorCount = 10;
int lastFireTime = 0;

// Threat Tracking System
ArrayList<TrackedTarget> activeTracks = new ArrayList<TrackedTarget>();
int maxTrackHistory = 100;
TrackedTarget primaryThreat = null;

// Tactical Colors
color colRadarGreen   = color(0, 255, 120);
color colRadarGlow    = color(0, 255, 120, 40);
color colWarningRed   = color(255, 40, 40);
color colCautionYellow= color(255, 200, 0);
color colInterceptCyan= color(0, 220, 255);
color colDarkBg       = color(8, 14, 22);
color colPanelBg      = color(12, 22, 35, 220);

void setup() {
  size(1280, 820);
  surface.setTitle("AEGIS-SHIELD // Tactical Air Defense & Anti-Missile C2");
  smooth(4);
  textFont(createFont("Courier New Bold", 14));
  
  println("--------------------------------------------------");
  println("AEGIS-SHIELD ANTI-MISSILE DEFENSE SYSTEM INITIALIZED");
  println("Available Serial COM Ports:");
  printArray(Serial.list());
  println("--------------------------------------------------");

  // Try to connect to first available port, otherwise run in simulation mode
  if (Serial.list().length > 0) {
    try {
      String portName = Serial.list()[0];
      // Supports 115200 (modern) and 9600 baud
      arduinoPort = new Serial(this, portName, 115200);
      arduinoPort.bufferUntil('\n');
      serialConnected = true;
      println("Connected to Arduino on: " + portName + " @ 115200 baud");
    } catch (Exception e) {
      println("Could not bind serial port. Running in SIMULATION mode.");
      serialConnected = false;
    }
  } else {
    println("No physical Arduino detected. Running in SIMULATION mode. Press 'S' to spawn missile!");
  }
}

void draw() {
  background(colDarkBg);
  
  // Update internal simulation if in simulated mode
  if (!serialConnected) {
    updateSimulatedRadar();
  }
  
  // 1. Draw Radar Center PPI Display
  pushMatrix();
  translate(width/2 - 120, height - 90);
  drawRadarGrid();
  drawRadarSweep();
  drawActiveTracks();
  drawInterceptSolution();
  popMatrix();
  
  // 2. Draw Tactical Top Bar
  drawTopTacticalBar();
  
  // 3. Draw Side Information Panels (Threat Matrix & Fire Control)
  drawThreatMatrixPanel();
  drawFireControlPanel();
  drawInstructionsBar();
  
  // 4. Autonomous CIWS Engagement Logic
  checkAutonomousFireLogic();
}

// ============================================================================
// RADAR PPI DISPLAY RENDERING
// ============================================================================
void drawRadarGrid() {
  strokeWeight(1);
  noFill();
  
  // Draw range rings (25cm, 50cm, 75cm, 100cm, 150cm, 200cm, 300cm scaled)
  int[] ranges = {50, 100, 150, 200, 300};
  for (int i = 0; i < ranges.length; i++) {
    float r = map(ranges[i], 0, 350, 0, 480);
    stroke(colRadarGlow);
    arc(0, 0, r * 2, r * 2, PI, TWO_PI); // Upper semicircle
    
    // Distance label
    fill(colRadarGreen, 140);
    textAlign(CENTER, CENTER);
    textSize(11);
    text(ranges[i] + "cm", 0, -r + 12);
  }
  
  // Draw Azimuth Radial Rays (Every 15 degrees)
  for (int a = 0; a <= 180; a += 15) {
    float rad = radians(180 - a); // 0 deg is right, 180 deg is left
    float x = cos(rad) * 490;
    float y = -sin(rad) * 490;
    
    stroke((a % 45 == 0) ? color(0, 255, 120, 80) : color(0, 255, 120, 30));
    line(0, 0, x, y);
    
    // Angle labels along outer perimeter
    fill(colRadarGreen, 160);
    textSize(10);
    text(a + "°", x * 1.05, y * 1.05);
  }
  
  // Defended Asset Zone (Military Base Perimeter)
  stroke(colWarningRed, 120);
  strokeWeight(2);
  noFill();
  arc(0, 0, 120, 120, PI, TWO_PI);
  fill(colWarningRed, 40);
  arc(0, 0, 120, 120, PI, TWO_PI);
  fill(colWarningRed);
  textSize(10);
  text("[DEFENDED BASE ZONE]", 0, -25);
  
  // Radar Baseline
  stroke(colRadarGreen, 200);
  strokeWeight(2);
  line(-500, 0, 500, 0);
  
  // Radar Center Station
  fill(colRadarGreen);
  ellipse(0, 0, 12, 12);
}

void drawRadarSweep() {
  if (isPaused) return;
  
  float rad = radians(180 - currentAngle);
  
  // Phosphor sweep fan
  for (int i = 0; i < 20; i++) {
    float trailAngle = rad - (i * 0.015);
    float alpha = map(i, 0, 20, 150, 0);
    stroke(0, 255, 120, alpha);
    strokeWeight(2);
    line(0, 0, cos(trailAngle) * 480, -sin(trailAngle) * 480);
  }
  
  // Leading scan beam
  stroke(220, 255, 240);
  strokeWeight(2.5);
  line(0, 0, cos(rad) * 480, -sin(rad) * 480);
}

void drawActiveTracks() {
  primaryThreat = null;
  float closestDist = 9999;
  
  for (int i = activeTracks.size() - 1; i >= 0; i--) {
    TrackedTarget t = activeTracks.get(i);
    t.age++;
    
    if (t.age > maxTrackHistory) {
      activeTracks.remove(i);
      continue;
    }
    
    float rad = radians(180 - t.angle);
    float screenR = map(t.distance, 0, 350, 0, 480);
    float x = cos(rad) * screenR;
    float y = -sin(rad) * screenR;
    
    // Evaluate if closing threat
    boolean isHostile = (t.distance < 120 && t.closingSpeed > 1.0);
    
    if (isHostile && t.distance < closestDist) {
      closestDist = t.distance;
      primaryThreat = t;
    }
    
    // Draw target symbol
    float alpha = map(t.age, 0, maxTrackHistory, 255, 30);
    
    if (isHostile) {
      // Hostile Diamond (NATO Symbol)
      stroke(colWarningRed, alpha);
      strokeWeight(2);
      noFill();
      pushMatrix();
      translate(x, y);
      rotate(PI/4);
      rectMode(CENTER);
      rect(0, 0, 14, 14);
      popMatrix();
      
      // Pulsing threat ring
      float pulse = 18 + sin(frameCount * 0.3) * 6;
      stroke(colWarningRed, 180);
      ellipse(x, y, pulse, pulse);
      
      // Target Data Tag
      fill(colWarningRed, alpha);
      textAlign(LEFT, CENTER);
      textSize(10);
      text("TGT-" + t.id + " [INBOUND]", x + 12, y - 10);
      text("R: " + nf(t.distance, 0, 1) + "cm", x + 12, y + 2);
      text("V: " + nf(t.closingSpeed, 0, 1) + "cm/s", x + 12, y + 14);
      
      // Velocity vector stick
      stroke(colWarningRed, 200);
      line(x, y, x - cos(rad) * (t.closingSpeed * 4), y + sin(rad) * (t.closingSpeed * 4));
    } else {
      // Standard detected object dot
      fill(colCautionYellow, alpha);
      noStroke();
      ellipse(x, y, 7, 7);
    }
  }
}

void drawInterceptSolution() {
  if (primaryThreat != null) {
    float rad = radians(180 - primaryThreat.angle);
    float screenR = map(primaryThreat.distance, 0, 350, 0, 480);
    float tgtX = cos(rad) * screenR;
    float tgtY = -sin(rad) * screenR;
    
    // Predictive lead intercept vector
    float tti = (primaryThreat.closingSpeed > 0.5) ? (primaryThreat.distance / primaryThreat.closingSpeed) : 9.9;
    float interceptDist = max(20, primaryThreat.distance - (primaryThreat.closingSpeed * 1.5));
    float interceptR = map(interceptDist, 0, 350, 0, 480);
    float intX = cos(rad) * interceptR;
    float intY = -sin(rad) * interceptR;
    
    // Draw Cyan Intercept Guidance Vector
    stroke(colInterceptCyan, 200);
    strokeWeight(2);
    line(0, 0, intX, intY);
    
    // Intercept Reticle
    stroke(colInterceptCyan);
    noFill();
    ellipse(intX, intY, 20, 20);
    line(intX - 14, intY, intX + 14, intY);
    line(intX, intY - 14, intX, intY + 14);
    
    fill(colInterceptCyan);
    textAlign(CENTER, BOTTOM);
    textSize(10);
    text("INTERCEPT BASKET (TTI: " + nf(tti, 0, 1) + "s)", intX, intY - 14);
  }
}

// ============================================================================
// TACTICAL HUD PANELS & MENUS
// ============================================================================
void drawTopTacticalBar() {
  fill(colPanelBg);
  stroke(colRadarGreen, 100);
  strokeWeight(1);
  rect(10, 10, width - 20, 50, 6);
  
  // Title
  fill(colRadarGreen);
  textAlign(LEFT, CENTER);
  textSize(18);
  text("AEGIS-SHIELD // C-RAM AIR DEFENSE TACTICAL TOC", 25, 35);
  
  // DEFCON Status
  if (primaryThreat != null) {
    fill(colWarningRed);
    textAlign(CENTER, CENTER);
    textSize(18);
    text("● DEFCON 1 - AIR RAID ALERT (HOSTILE INBOUND)", width/2 + 60, 35);
  } else {
    fill(colRadarGreen);
    textAlign(CENTER, CENTER);
    textSize(16);
    text("● DEFCON 5 - SECTOR SECURE // SURVEILLANCE NOMINAL", width/2 + 60, 35);
  }
  
  // Link status
  textAlign(RIGHT, CENTER);
  textSize(12);
  if (serialConnected) {
    fill(colRadarGreen);
    text("HARDWARE: CONNECTED (USB)", width - 30, 35);
  } else {
    fill(colCautionYellow);
    text("MODE: HIL SIMULATION", width - 30, 35);
  }
}

void drawThreatMatrixPanel() {
  int panelX = width - 280;
  int panelY = 70;
  int panelW = 265;
  int panelH = 340;
  
  fill(colPanelBg);
  stroke(colRadarGreen, 120);
  rect(panelX, panelY, panelW, panelH, 6);
  
  fill(colRadarGreen);
  textAlign(LEFT, TOP);
  textSize(13);
  text("THREAT EVALUATION (TEWA)", panelX + 15, panelY + 12);
  stroke(colRadarGreen, 60);
  line(panelX + 15, panelY + 32, panelX + panelW - 15, panelY + 32);
  
  if (primaryThreat != null) {
    float tti = (primaryThreat.closingSpeed > 0.5) ? (primaryThreat.distance / primaryThreat.closingSpeed) : 0;
    
    fill(colWarningRed);
    textSize(15);
    text("STATUS: CRITICAL THREAT", panelX + 15, panelY + 45);
    
    fill(255);
    textSize(12);
    text("Target ID       : TGT-" + primaryThreat.id, panelX + 15, panelY + 75);
    text("Bearing         : " + nf(primaryThreat.angle, 0, 1) + "°", panelX + 15, panelY + 100);
    text("Slant Range     : " + nf(primaryThreat.distance, 0, 1) + " cm", panelX + 15, panelY + 125);
    text("Closing Velocity: " + nf(primaryThreat.closingSpeed, 0, 1) + " cm/s", panelX + 15, panelY + 150);
    
    fill(colWarningRed);
    textSize(14);
    text("TIME TO IMPACT  : " + nf(tti, 0, 1) + " SEC", panelX + 15, panelY + 185);
    
    fill(colInterceptCyan);
    text("FIRE SOLUTION   : COMPUTED", panelX + 15, panelY + 215);
    text("LEAD BEARING    : " + nf(primaryThreat.angle, 0, 1) + "°", panelX + 15, panelY + 235);
    
    // Warning Bar
    fill(colWarningRed, 80 + sin(frameCount * 0.2) * 60);
    rect(panelX + 15, panelY + 270, panelW - 30, 45, 4);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(12);
    text("ENGAGEMENT BASKET ACTIVE", panelX + panelW/2, panelY + 292);
  } else {
    fill(colRadarGreen, 180);
    textSize(13);
    text("STATUS: NO ACTIVE THREATS", panelX + 15, panelY + 55);
    
    fill(160, 200, 230);
    textSize(12);
    text("Sector Surveillance  : ACTIVE", panelX + 15, panelY + 90);
    text("Current Azimuth Sweep: " + nf(currentAngle, 0, 1) + "°", panelX + 15, panelY + 115);
    text("Last Range Ping      : " + nf(currentDistance, 0, 1) + " cm", panelX + 15, panelY + 140);
    text("Active Clutter Tracks: " + activeTracks.size(), panelX + 15, panelY + 165);
    text("Protected Asset Zone : 60 cm", panelX + 15, panelY + 190);
  }
}

void drawFireControlPanel() {
  int panelX = width - 280;
  int panelY = 425;
  int panelW = 265;
  int panelH = 310;
  
  fill(colPanelBg);
  stroke(colRadarGreen, 120);
  rect(panelX, panelY, panelW, panelH, 6);
  
  fill(colRadarGreen);
  textAlign(LEFT, TOP);
  textSize(13);
  text("WEAPON & FIRE CONTROL (C2)", panelX + 15, panelY + 12);
  stroke(colRadarGreen, 60);
  line(panelX + 15, panelY + 32, panelX + panelW - 15, panelY + 32);
  
  // ROE Mode
  fill(255);
  textSize(12);
  text("R.O.E. Mode     : ", panelX + 15, panelY + 45);
  if (autonomousCIWS) {
    fill(colWarningRed);
    text("AUTONOMOUS CIWS", panelX + 125, panelY + 45);
  } else {
    fill(colCautionYellow);
    text("MANUAL RELEASE", panelX + 125, panelY + 45);
  }
  
  fill(255);
  text("Interceptors Left: " + interceptorCount, panelX + 15, panelY + 75);
  text("Targeting Laser : " + (laserActive ? "ILLUMINATING" : "STANDBY"), panelX + 15, panelY + 100);
  text("Launch Solenoid : READY", panelX + 15, panelY + 125);
  
  // Manual Fire Button
  fill((millis() - lastFireTime < 800) ? colWarningRed : color(40, 70, 90));
  stroke(colRadarGreen);
  rect(panelX + 15, panelY + 160, panelW - 30, 50, 6);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(14);
  text((millis() - lastFireTime < 800) ? "MISSILE LAUNCHED!" : "[F] FIRE COUNTERMEASURE", panelX + panelW/2, panelY + 185);
  
  // System Scan State
  fill(isPaused ? colWarningRed : colRadarGreen);
  textAlign(CENTER, CENTER);
  textSize(12);
  text(isPaused ? "● SCANNER PAUSED" : "● SCANNER SWEEPING", panelX + panelW/2, panelY + 245);
}

void drawInstructionsBar() {
  fill(12, 22, 35);
  stroke(colRadarGreen, 80);
  rect(10, height - 40, width - 20, 32, 4);
  
  fill(170, 220, 255);
  textAlign(LEFT, CENTER);
  textSize(12);
  text("CONTROLS: [F] Fire Interceptor  |  [A] Toggle Autonomous CIWS  |  [P] Pause  |  [R] Resume  |  [L] Laser  |  [S] Spawn Missile Sim", 25, height - 24);
}

// ============================================================================
// AUTONOMOUS DEFENSE & SERIAL HANDLERS
// ============================================================================
void checkAutonomousFireLogic() {
  if (autonomousCIWS && primaryThreat != null && interceptorCount > 0) {
    // If threat inside 90cm and closing at speed, fire countermeasure automatically!
    if (primaryThreat.distance < 90 && primaryThreat.closingSpeed > 1.0 && (millis() - lastFireTime > 2500)) {
      triggerFireSequence();
    }
  }
}

void triggerFireSequence() {
  if (interceptorCount <= 0) return;
  lastFireTime = millis();
  interceptorCount--;
  laserActive = true;
  println(">>> FIRE COMMAND DISPATCHED! Intercepting target! <<<");
  
  if (serialConnected && arduinoPort != null) {
    arduinoPort.write('F'); // Sends Fire command to Arduino
    arduinoPort.write('L'); // Turns on laser
  }
}

void serialEvent(Serial port) {
  try {
    rawData = port.readStringUntil('\n');
    if (rawData == null) return;
    rawData = trim(rawData);
    
    // Parse legacy "angle,distance." or standard NMEA "$RADAR,az,el,dist,flags*00"
    if (rawData.startsWith("$RADAR")) {
      String[] parts = split(rawData, ',');
      if (parts.length >= 4) {
        currentAngle = float(parts[1]);
        currentDistance = float(parts[3]);
        ingestRadarBlip(currentAngle, currentDistance);
      }
    } else if (rawData.endsWith(".")) {
      // Legacy format "angle,distance."
      String clean = rawData.substring(0, rawData.length() - 1);
      String[] parts = split(clean, ',');
      if (parts.length == 2) {
        currentAngle = float(parts[0]);
        currentDistance = float(parts[1]);
        ingestRadarBlip(currentAngle, currentDistance);
      }
    }
  } catch (Exception e) {
    // Ignore transient framing noise
  }
}

void ingestRadarBlip(float ang, float dist) {
  if (dist > 5 && dist < 350) {
    // Check if correlates with existing track
    boolean correlated = false;
    for (TrackedTarget t : activeTracks) {
      if (abs(t.angle - ang) < 10) {
        t.update(ang, dist);
        correlated = true;
        break;
      }
    }
    if (!correlated) {
      activeTracks.add(new TrackedTarget(ang, dist));
    }
  }
}

// Simulated radar sweep when hardware is offline
float simAngle = 0;
int simDir = 1;
float simMissileR = 300;
float simMissileA = 60;

void updateSimulatedRadar() {
  simAngle += simDir * 2;
  if (simAngle >= 180) { simAngle = 180; simDir = -1; }
  else if (simAngle <= 0) { simAngle = 0; simDir = 1; }
  currentAngle = simAngle;
  
  // Advance simulated missile
  simMissileR -= 0.6;
  if (simMissileR <= 15) { simMissileR = 320; }
  
  if (abs(simAngle - simMissileA) <= 3) {
    currentDistance = simMissileR;
    ingestRadarBlip(simMissileA, simMissileR);
  }
}

void keyPressed() {
  if (key == 'f' || key == 'F') {
    triggerFireSequence();
  } else if (key == 'a' || key == 'A') {
    autonomousCIWS = !autonomousCIWS;
    println("Autonomous CIWS mode: " + (autonomousCIWS ? "ENABLED" : "DISABLED"));
  } else if (key == 'p' || key == 'P') {
    isPaused = true;
    if (serialConnected) arduinoPort.write('P');
  } else if (key == 'r' || key == 'R') {
    isPaused = false;
    if (serialConnected) arduinoPort.write('R');
  } else if (key == 'l' || key == 'L') {
    laserActive = !laserActive;
    if (serialConnected) arduinoPort.write(laserActive ? 'L' : 'l');
  } else if (key == 's' || key == 'S') {
    // Spawn fresh simulated missile
    simMissileR = 300;
    simMissileA = random(30, 150);
    println("Spawned simulated missile at bearing " + simMissileA + "°");
  }
}

// ============================================================================
// TRACKED TARGET CLASS
// ============================================================================
static int trackCounter = 1;
class TrackedTarget {
  int id;
  float angle;
  float distance;
  float previousDistance;
  float closingSpeed = 0;
  int age = 0;
  
  TrackedTarget(float a, float d) {
    this.id = trackCounter++;
    this.angle = a;
    this.distance = d;
    this.previousDistance = d;
  }
  
  void update(float a, float d) {
    this.angle = (this.angle * 0.3) + (a * 0.7);
    this.closingSpeed = max(0, (this.distance - d) * 15.0); // estimated velocity in cm/s
    this.previousDistance = this.distance;
    this.distance = d;
    this.age = 0; // refreshed
  }
}
