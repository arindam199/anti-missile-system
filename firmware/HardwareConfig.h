#ifndef HARDWARE_CONFIG_H
#define HARDWARE_CONFIG_H

#include <Arduino.h>

// ============================================================================
// AEGIS-SHIELD / AMDS INDUSTRIAL FIRMWARE - HARDWARE CONFIGURATION
// Target: Arduino Uno / Nano / Mega / ESP32 (ATmega328P / ATmega2560)
// ============================================================================

// --- SENSOR INTERFACES ---
const uint8_t PIN_TRIG              = 10;   // Ultrasonic HC-SR04 Trigger / LiDAR Strobe
const uint8_t PIN_ECHO              = 11;   // Ultrasonic HC-SR04 Echo / Pulse
const uint32_t ULTRASONIC_TIMEOUT_US = 25000; // 25ms timeout (~425 cm max distance)
const float AMBIENT_TEMP_C          = 22.0f;// Ambient temperature for sound speed calibration
// Speed of sound: v = 331.3 + 0.606 * Temp_C (m/s) -> cm/us conversion factor
const float SOUND_SPEED_CM_US       = (331.3f + 0.606f * AMBIENT_TEMP_C) * 0.0001f;

// --- GIMBAL / SERVO ACTUATORS ---
const uint8_t PIN_AZIMUTH_SERVO     = 9;    // Azimuth (Pan / Horizontal Sweep)
const uint8_t PIN_ELEVATION_SERVO   = 3;    // Elevation (Tilt / Intercept Pitch)

const int16_t AZIMUTH_MIN_DEG       = 0;
const int16_t AZIMUTH_MAX_DEG       = 180;
const int16_t AZIMUTH_HOME_DEG      = 90;

const int16_t ELEVATION_MIN_DEG     = 0;
const int16_t ELEVATION_MAX_DEG     = 90;
const int16_t ELEVATION_HOME_DEG    = 30;

// Sweep step & interval
const int16_t SWEEP_STEP_DEG        = 2;    // Degrees per scanning step
const uint16_t SWEEP_INTERVAL_MS    = 20;   // 50Hz servo update loop

// --- FIRE CONTROL & COUNTERMEASURE ACTUATORS ---
const uint8_t PIN_TARGETING_LASER   = 8;    // High-power laser designator / target illuminator
const uint8_t PIN_FIRE_INTERCEPTOR  = 7;    // Firing trigger (Relay / Solenoid / Coilgun igniter)
const uint8_t PIN_AUDIO_BUZZER      = 6;    // Piezo acoustic siren (PWM or tone)
const uint8_t PIN_LOCK_LED          = 5;    // Target lock indicator LED
const uint8_t PIN_ESTOP_BUTTON      = 2;    // Hardware Emergency Stop (INT0 external interrupt)

// --- COMMUNICATION & TIMING ---
const uint32_t PRIMARY_BAUD_RATE    = 115200; // Industrial high-speed telemetry
const uint32_t LEGACY_BAUD_RATE     = 9600;   // Legacy backwards-compatible baud
const uint16_t HEARTBEAT_TIMEOUT_MS = 3000;   // Auto safe-stow if C2 communication lost

// --- SAFETY LIMITS ---
const uint16_t FIRE_PULSE_DURATION_MS = 250;  // Interceptor trigger pulse duration
const float MIN_ENGAGE_DISTANCE_CM   = 5.0f;  // Minimum safety blind zone
const float MAX_ENGAGE_DISTANCE_CM   = 400.0f;// Maximum engagement envelope

#endif // HARDWARE_CONFIG_H
