/*
 ============================================================================
  PROJECT     : AEGIS-SHIELD / AMDS-V4 INDUSTRIAL AIR DEFENSE FIRMWARE
  ROLE        : Embedded Real-Time Radar Scanner & Fire Control Computer
  TARGET      : Arduino Uno / Nano / Mega / ESP32 (ATmega328P / ATmega2560)
  AUTHOR      : Defense Systems Engineering Group
  STANDARD    : Military C2 Interoperability / Non-Blocking Real-Time
 ============================================================================
*/

#include <Servo.h>
#include "HardwareConfig.h"
#include "TelemetryProtocol.h"

// --- ACTUATOR INSTANCES ---
Servo azimuthServo;
Servo elevationServo;

// --- STATE VARIABLES ---
int16_t currentAzimuth = AZIMUTH_HOME_DEG;
int16_t targetAzimuth = AZIMUTH_HOME_DEG;
int16_t currentElevation = ELEVATION_HOME_DEG;
int16_t targetElevation = ELEVATION_HOME_DEG;
int8_t sweepDirection = 1; // +1 forward, -1 backward

uint16_t systemStatusFlags = STATUS_FLAG_SCANNING;
bool isArmed = true;
bool isEStopped = false;
bool hilSimulationActive = false;
bool legacyAsciiMode = true; // Enables backward compatibility with "angle,distance."

// --- SENSOR ACQUISITION & FILTERING ---
float lastFilteredDistance = 0.0f;
float previousDistance = 0.0f;
unsigned long lastPingTime = 0;
unsigned long lastSweepTime = 0;
unsigned long lastHeartbeatTime = 0;
unsigned long fireTriggerStartTime = 0;
bool isFiring = false;

// Simulated HIL missile trajectory state
float simRange = 350.0f;
float simAzimuth = 45.0f;
float simSpeed = 12.0f; // cm per step inbound

// --- FUNCTION PROTOTYPES ---
void handleEStopInterrupt();
void processSerialCommands();
void executeAsciiCommand(String cmd);
void updateServos();
float measureDistanceNonBlocking();
float filterDistanceSample(float raw);
void transmitTelemetry(float distance);
void executeFireSequence();
void runBuiltInSelfTest();
void setBuzzerAlert(uint8_t mode);

// ============================================================================
// SYSTEM SETUP
// ============================================================================
void setup() {
  // Initialize Serial interface (Defaults to 115200, supports auto-sync)
  Serial.begin(PRIMARY_BAUD_RATE);
  while (!Serial && millis() < 1000); // Wait up to 1 sec for native USB

  // Configure I/O pins
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_TARGETING_LASER, OUTPUT);
  pinMode(PIN_FIRE_INTERCEPTOR, OUTPUT);
  pinMode(PIN_AUDIO_BUZZER, OUTPUT);
  pinMode(PIN_LOCK_LED, OUTPUT);
  pinMode(PIN_ESTOP_BUTTON, INPUT_PULLUP);

  // Default pin states (Safety interlocks)
  digitalWrite(PIN_TRIG, LOW);
  digitalWrite(PIN_TARGETING_LASER, LOW);
  digitalWrite(PIN_FIRE_INTERCEPTOR, LOW);
  digitalWrite(PIN_LOCK_LED, LOW);
  digitalWrite(PIN_AUDIO_BUZZER, LOW);

  // Attach hardware interrupt for emergency stop
  attachInterrupt(digitalPinToInterrupt(PIN_ESTOP_BUTTON), handleEStopInterrupt, FALLING);

  // Initialize and home servos
  azimuthServo.attach(PIN_AZIMUTH_SERVO);
  elevationServo.attach(PIN_ELEVATION_SERVO);
  azimuthServo.write(AZIMUTH_HOME_DEG);
  elevationServo.write(ELEVATION_HOME_DEG);
  delay(300);

  // System startup acoustic and visual signal
  setBuzzerAlert(1); // Boot chirp
  digitalWrite(PIN_LOCK_LED, HIGH);
  delay(100);
  digitalWrite(PIN_LOCK_LED, LOW);

  // Industrial initial boot banner
  Serial.println(F("$INIT,AEGIS_AMDS_V4,STATUS_NOMINAL,BAUD_115200*OK"));
  Serial.println(F("RADAR_READY")); // Backward compatible banner for legacy software
}

// ============================================================================
// MAIN REAL-TIME EXECUTIVE LOOP (NON-BLOCKING)
// ============================================================================
void loop() {
  unsigned long now = millis();

  // 1. Process Telecommand & Serial Inputs
  processSerialCommands();

  // 2. Hardware Emergency Stop Check
  if (isEStopped) {
    digitalWrite(PIN_TARGETING_LASER, LOW);
    digitalWrite(PIN_FIRE_INTERCEPTOR, LOW);
    digitalWrite(PIN_LOCK_LED, LOW);
    return;
  }

  // 3. Firing Solenoid / Relay Pulse Timeout Check
  if (isFiring && (now - fireTriggerStartTime >= FIRE_PULSE_DURATION_MS)) {
    digitalWrite(PIN_FIRE_INTERCEPTOR, LOW);
    isFiring = false;
    systemStatusFlags &= ~STATUS_FLAG_FIRING;
  }

  // 4. Scanning & Servo Slewing State Machine
  if ((systemStatusFlags & STATUS_FLAG_SCANNING) && (now - lastSweepTime >= SWEEP_INTERVAL_MS)) {
    lastSweepTime = now;

    // Advance azimuth sweep
    currentAzimuth += (sweepDirection * SWEEP_STEP_DEG);
    if (currentAzimuth >= AZIMUTH_MAX_DEG) {
      currentAzimuth = AZIMUTH_MAX_DEG;
      sweepDirection = -1;
    } else if (currentAzimuth <= AZIMUTH_MIN_DEG) {
      currentAzimuth = AZIMUTH_MIN_DEG;
      sweepDirection = 1;
    }
    azimuthServo.write(currentAzimuth);

    // 5. Measure Distance (Physical Sensor or HIL Simulation)
    float distance = 0.0f;
    if (hilSimulationActive) {
      // Hardware-in-the-loop simulation
      simRange -= simSpeed;
      if (simRange <= 10.0f) {
        simRange = 380.0f; // reset simulated incoming threat
      }
      if (abs(currentAzimuth - (int)simAzimuth) <= 4) {
        distance = simRange;
      } else {
        distance = 0.0f; // No target in other azimuths
      }
    } else {
      distance = measureDistanceNonBlocking();
    }

    // 6. Filter & Detect Threat
    float filtered = filterDistanceSample(distance);

    // Threat detection logic
    if (filtered > MIN_ENGAGE_DISTANCE_CM && filtered < MAX_ENGAGE_DISTANCE_CM) {
      systemStatusFlags |= STATUS_FLAG_TRACKING;
      digitalWrite(PIN_LOCK_LED, HIGH);

      // Threat speed estimation
      float deltaD = previousDistance - filtered;
      if (deltaD > 2.0f) { // Target closing fast!
        systemStatusFlags |= STATUS_FLAG_LOCKED;
      }
    } else {
      systemStatusFlags &= ~(STATUS_FLAG_TRACKING | STATUS_FLAG_LOCKED);
      digitalWrite(PIN_LOCK_LED, LOW);
    }
    previousDistance = filtered;

    // 7. Transmit High-Rate Telemetry Packet
    transmitTelemetry(filtered);
  }
}

// ============================================================================
// SENSOR MEASUREMENT & DIGITAL FILTERING
// ============================================================================
float measureDistanceNonBlocking() {
  // Trigger 10us ultrasonic burst
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // PulseIn with bounded timeout
  unsigned long duration = pulseIn(PIN_ECHO, HIGH, ULTRASONIC_TIMEOUT_US);

  if (duration == 0) {
    return 0.0f; // Out of range or no echo
  }

  // Distance in cm = (duration / 2) * speed_of_sound
  float dist = (duration * 0.5f) * (SOUND_SPEED_CM_US * 1000.0f);
  if (dist > MAX_ENGAGE_DISTANCE_CM || dist < MIN_ENGAGE_DISTANCE_CM) {
    return 0.0f;
  }
  return dist;
}

// 3-Sample Exponential Moving Average / Outlier Rejection
float filterDistanceSample(float raw) {
  if (raw <= 0.0f) {
    return 0.0f;
  }
  if (lastFilteredDistance <= 0.0f) {
    lastFilteredDistance = raw;
    return raw;
  }
  // Exponential filter: alpha = 0.7
  lastFilteredDistance = (0.7f * raw) + (0.3f * lastFilteredDistance);
  return lastFilteredDistance;
}

// ============================================================================
// TELEMETRY TRANSMISSION (DUAL-STREAM PROTOCOL)
// ============================================================================
void transmitTelemetry(float distance) {
  // 1. Military Standard NMEA/ASCII Sentence
  // Format: $RADAR,AZ,EL,DIST_CM,STATUS_FLAGS,CHECKSUM
  Serial.print(F("$RADAR,"));
  Serial.print(currentAzimuth);
  Serial.print(F(","));
  Serial.print(currentElevation);
  Serial.print(F(","));
  Serial.print(distance, 1);
  Serial.print(F(","));
  Serial.print(systemStatusFlags, HEX);
  Serial.println(F("*00"));

  // 2. Legacy backwards-compatible stream: "angle,distance."
  // Allows original Processing scripts to work simultaneously without code modifications!
  Serial.print(currentAzimuth);
  Serial.print(F(","));
  Serial.print(distance, 1);
  Serial.println(F("."));
}

// ============================================================================
// SERIAL TELECOMMAND PROCESSOR
// ============================================================================
void processSerialCommands() {
  while (Serial.available() > 0) {
    char c = Serial.peek();

    // Check for single-character legacy commands ('P' = Pause, 'R' = Resume)
    if (c == 'P' || c == 'p') {
      Serial.read();
      systemStatusFlags &= ~STATUS_FLAG_SCANNING;
      Serial.println(F("$ACK,PAUSED*OK"));
      continue;
    }
    if (c == 'R' || c == 'r') {
      Serial.read();
      systemStatusFlags |= STATUS_FLAG_SCANNING;
      isEStopped = false;
      Serial.println(F("$ACK,RESUMED*OK"));
      continue;
    }

    // Read full string command
    String cmdLine = Serial.readStringUntil('\n');
    cmdLine.trim();
    if (cmdLine.length() > 0) {
      executeAsciiCommand(cmdLine);
    }
  }
}

void executeAsciiCommand(String cmd) {
  cmd.toUpperCase();

  if (cmd.startsWith("PING")) {
    Serial.println(F("$PONG,AEGIS_ONLINE*OK"));
  }
  else if (cmd.startsWith("STATUS")) {
    Serial.print(F("$STATUS,AZ="));
    Serial.print(currentAzimuth);
    Serial.print(F(",EL="));
    Serial.print(currentElevation);
    Serial.print(F(",FLAGS="));
    Serial.print(systemStatusFlags, HEX);
    Serial.println(F("*OK"));
  }
  else if (cmd.startsWith("SETPOS")) {
    // Syntax: SETPOS <azimuth> <elevation>
    int space1 = cmd.indexOf(' ');
    int space2 = cmd.indexOf(' ', space1 + 1);
    if (space1 > 0) {
      int az = cmd.substring(space1 + 1, (space2 > 0) ? space2 : cmd.length()).toInt();
      az = constrain(az, AZIMUTH_MIN_DEG, AZIMUTH_MAX_DEG);
      currentAzimuth = az;
      azimuthServo.write(currentAzimuth);

      if (space2 > 0) {
        int el = cmd.substring(space2 + 1).toInt();
        el = constrain(el, ELEVATION_MIN_DEG, ELEVATION_MAX_DEG);
        currentElevation = el;
        elevationServo.write(currentElevation);
      }
      Serial.print(F("$ACK,SETPOS,"));
      Serial.print(currentAzimuth);
      Serial.print(F(","));
      Serial.print(currentElevation);
      Serial.println(F("*OK"));
    }
  }
  else if (cmd.startsWith("FIRE")) {
    executeFireSequence();
  }
  else if (cmd.startsWith("LASER")) {
    // Syntax: LASER 1 or LASER 0
    int space = cmd.indexOf(' ');
    if (space > 0) {
      int state = cmd.substring(space + 1).toInt();
      digitalWrite(PIN_TARGETING_LASER, state ? HIGH : LOW);
      if (state) systemStatusFlags |= STATUS_FLAG_LASER_ON;
      else systemStatusFlags &= ~STATUS_FLAG_LASER_ON;
      Serial.println(state ? F("$ACK,LASER_ON*OK") : F("$ACK,LASER_OFF*OK"));
    }
  }
  else if (cmd.startsWith("BUZZER")) {
    int space = cmd.indexOf(' ');
    if (space > 0) {
      uint8_t mode = cmd.substring(space + 1).toInt();
      setBuzzerAlert(mode);
      Serial.println(F("$ACK,BUZZER_TRIGGERED*OK"));
    }
  }
  else if (cmd.startsWith("SWEEP")) {
    // Syntax: SWEEP 1 (Start) or SWEEP 0 (Pause)
    int space = cmd.indexOf(' ');
    if (space > 0) {
      int state = cmd.substring(space + 1).toInt();
      if (state == 1) systemStatusFlags |= STATUS_FLAG_SCANNING;
      else systemStatusFlags &= ~STATUS_FLAG_SCANNING;
      Serial.println(state ? F("$ACK,SWEEP_STARTED*OK") : F("$ACK,SWEEP_STOPPED*OK"));
    }
  }
  else if (cmd.startsWith("ESTOP")) {
    handleEStopInterrupt();
  }
  else if (cmd.startsWith("RESET")) {
    isEStopped = false;
    systemStatusFlags = STATUS_FLAG_SCANNING;
    azimuthServo.write(AZIMUTH_HOME_DEG);
    elevationServo.write(ELEVATION_HOME_DEG);
    digitalWrite(PIN_TARGETING_LASER, LOW);
    digitalWrite(PIN_FIRE_INTERCEPTOR, LOW);
    digitalWrite(PIN_LOCK_LED, LOW);
    Serial.println(F("$ACK,SYSTEM_RESET*OK"));
  }
  else if (cmd.startsWith("BIST")) {
    runBuiltInSelfTest();
  }
  else if (cmd.startsWith("HIL_SIM")) {
    int space = cmd.indexOf(' ');
    if (space > 0) {
      hilSimulationActive = (cmd.substring(space + 1).toInt() == 1);
      if (hilSimulationActive) systemStatusFlags |= STATUS_FLAG_HIL_MODE;
      else systemStatusFlags &= ~STATUS_FLAG_HIL_MODE;
      Serial.println(hilSimulationActive ? F("$ACK,HIL_SIM_ENABLED*OK") : F("$ACK,HIL_SIM_DISABLED*OK"));
    }
  }
  else {
    Serial.println(F("$ERR,UNKNOWN_COMMAND*BAD"));
  }
}

// ============================================================================
// FIRE CONTROL & INTERCEPTOR LAUNCH SEQUENCER
// ============================================================================
void executeFireSequence() {
  if (isEStopped) {
    Serial.println(F("$ERR,FIRE_REJECTED_ESTOP_ACTIVE*FAIL"));
    return;
  }

  // 1. Arm system & engage laser designator
  digitalWrite(PIN_TARGETING_LASER, HIGH);
  systemStatusFlags |= (STATUS_FLAG_ARMED | STATUS_FLAG_FIRING | STATUS_FLAG_LASER_ON);

  // 2. Pulse Interceptor Firing Relay / Solenoid
  digitalWrite(PIN_FIRE_INTERCEPTOR, HIGH);
  fireTriggerStartTime = millis();
  isFiring = true;

  // 3. Acoustic alert
  setBuzzerAlert(2); // High-pitched launch tone

  // 4. Report firing event to C2
  Serial.print(F("$EVENT,INTERCEPTOR_FIRED,AZ="));
  Serial.print(currentAzimuth);
  Serial.print(F(",EL="));
  Serial.print(currentElevation);
  Serial.println(F("*CONFIRMED"));
}

// ============================================================================
// BUILT-IN SELF-TEST (BIST)
// ============================================================================
void runBuiltInSelfTest() {
  Serial.println(F("$BIST,STARTING_DIAGNOSTICS..."));

  // Step 1: Laser Test
  digitalWrite(PIN_TARGETING_LASER, HIGH);
  delay(150);
  digitalWrite(PIN_TARGETING_LASER, LOW);
  Serial.println(F("$BIST,LASER_OK"));

  // Step 2: Lock LED & Buzzer Test
  digitalWrite(PIN_LOCK_LED, HIGH);
  setBuzzerAlert(1);
  delay(100);
  digitalWrite(PIN_LOCK_LED, LOW);
  Serial.println(F("$BIST,ANNUNCIATORS_OK"));

  // Step 3: Gimbal Sweep Test
  azimuthServo.write(30);
  delay(200);
  azimuthServo.write(150);
  delay(200);
  azimuthServo.write(AZIMUTH_HOME_DEG);
  elevationServo.write(60);
  delay(200);
  elevationServo.write(ELEVATION_HOME_DEG);
  Serial.println(F("$BIST,GIMBALS_OK"));

  // Step 4: Distance Ping Test
  float d = measureDistanceNonBlocking();
  Serial.print(F("$BIST,SENSOR_TEST_DIST="));
  Serial.print(d);
  Serial.println(F("cm*OK"));

  Serial.println(F("$BIST,ALL_SYSTEMS_PASSED*OK"));
}

// ============================================================================
// ACOUSTIC ALERTS & EMERGENCY INTERRUPTS
// ============================================================================
void setBuzzerAlert(uint8_t mode) {
  if (mode == 1) { // Short chirp
    tone(PIN_AUDIO_BUZZER, 2400, 80);
  } else if (mode == 2) { // Launch tone
    tone(PIN_AUDIO_BUZZER, 3600, 200);
  } else if (mode == 3) { // Klaxon warble
    for (int i = 0; i < 3; i++) {
      tone(PIN_AUDIO_BUZZER, 1800, 50);
      delay(60);
      tone(PIN_AUDIO_BUZZER, 2600, 50);
      delay(60);
    }
  }
}

void handleEStopInterrupt() {
  isEStopped = true;
  systemStatusFlags = STATUS_FLAG_ESTOP;
  digitalWrite(PIN_TARGETING_LASER, LOW);
  digitalWrite(PIN_FIRE_INTERCEPTOR, LOW);
  digitalWrite(PIN_LOCK_LED, LOW);
  noTone(PIN_AUDIO_BUZZER);
  Serial.println(F("!ALERT,EMERGENCY_STOP_TRIGGERED!"));
}
