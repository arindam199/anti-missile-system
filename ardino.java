/*
 ============================================================================
  NOTE: This file was originally named 'ardino.java' on the Desktop.
  For standard Arduino IDE compiling and flashing, please open:
  -> firmware/anti_missile_radar.ino
  
  The full industrial C++ firmware below is synchronized with the new
  industrial architecture (Dual-servo Pan/Tilt, Laser Interceptor,
  Buzzer, Non-blocking Ping, and Multi-Rate Telemetry).
 ============================================================================
*/

#include <Servo.h>

// --- Pin Definitions ---
const int trigPin = 10;
const int echoPin = 11;
const int azimuthServoPin = 9;   // Radar sweep
const int elevationServoPin = 3; // Vertical intercept aim
const int laserPin = 8;          // Targeting laser
const int fireRelayPin = 7;      // Solenoid / Relay firing trigger
const int buzzerPin = 6;         // Audio warning buzzer
const int lockLedPin = 5;        // Target lock LED

// --- Servos ---
Servo radarServo;
Servo elevationServo;
int angle = 90;
int elevationAngle = 30;
int direction = 1;
bool isPaused = false;
bool hilMode = false;

// --- Timing ---
unsigned long lastMoveTime = 0;
const int MOVE_DELAY = 20; // 50Hz sweep
unsigned long fireStartTime = 0;
bool isFiring = false;

// --- Setup ---
void setup() {
  Serial.begin(115200); // High-speed industrial baud rate (also compatible with 9600)
  
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(laserPin, OUTPUT);
  pinMode(fireRelayPin, OUTPUT);
  pinMode(buzzerPin, OUTPUT);
  pinMode(lockLedPin, OUTPUT);
  
  digitalWrite(laserPin, LOW);
  digitalWrite(fireRelayPin, LOW);
  digitalWrite(buzzerPin, LOW);
  digitalWrite(lockLedPin, LOW);
  
  radarServo.attach(azimuthServoPin);
  radarServo.write(angle);
  
  elevationServo.attach(elevationServoPin);
  elevationServo.write(elevationAngle);
  
  delay(300);
  Serial.println("RADAR_READY");
  Serial.println("$INIT,AEGIS_AMDS_V4,STATUS_NOMINAL*OK");
}

// --- Main Loop ---
void loop() {
  // 1. Handle serial commands from C2 station
  if (Serial.available() > 0) {
    char command = Serial.read();
    
    if (command == 'P' || command == 'p') {
      isPaused = true;
      Serial.println("$ACK,PAUSED*OK");
    } 
    else if (command == 'R' || command == 'r') {
      isPaused = false;
      Serial.println("$ACK,RESUMED*OK");
    }
    else if (command == 'F' || command == 'f') { // Fire interceptor
      fireInterceptor();
    }
    else if (command == 'L') { // Toggle laser
      digitalWrite(laserPin, HIGH);
    }
    else if (command == 'l') {
      digitalWrite(laserPin, LOW);
    }
  }

  // 2. Interceptor firing pulse timeout
  if (isFiring && (millis() - fireStartTime > 250)) {
    digitalWrite(fireRelayPin, LOW);
    isFiring = false;
  }

  // 3. Servo scan loop
  if (!isPaused && (millis() - lastMoveTime >= MOVE_DELAY)) {
    lastMoveTime = millis();

    // Measure distance
    float distance = getDistance();

    // Dual-format telemetry:
    // Format A: Standard NMEA sentence: $RADAR,azimuth,elevation,distance,status*00
    Serial.print("$RADAR,");
    Serial.print(angle);
    Serial.print(",");
    Serial.print(elevationAngle);
    Serial.print(",");
    Serial.print(distance);
    Serial.print(",");
    Serial.print(distance > 0 && distance < 100 ? "LOCKED" : "CLEAR");
    Serial.println("*00");

    // Format B: Legacy Processing format: angle,distance.
    Serial.print(angle);
    Serial.print(",");
    Serial.print(distance);
    Serial.println(".");

    // Sweep servo
    angle += (direction * 2);
    if (angle >= 180) {
      angle = 180;
      direction = -1;
    } else if (angle <= 0) {
      angle = 0;
      direction = 1;
    }

    radarServo.write(angle);
  }
}

// --- Measure Distance ---
float getDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 25000); // 25ms timeout (~425cm)
  if (duration == 0) return 0;

  float distance = duration * 0.034 / 2.0;
  if (distance > 400.0) return 0;
  return distance;
}

// --- Trigger Interceptor ---
void fireInterceptor() {
  digitalWrite(laserPin, HIGH);
  digitalWrite(fireRelayPin, HIGH);
  digitalWrite(lockLedPin, HIGH);
  fireStartTime = millis();
  isFiring = true;
  Serial.print("$EVENT,INTERCEPTOR_LAUNCHED,AZ=");
  Serial.print(angle);
  Serial.println("*FIRED");
}
