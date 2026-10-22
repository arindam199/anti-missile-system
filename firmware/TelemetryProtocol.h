#ifndef TELEMETRY_PROTOCOL_H
#define TELEMETRY_PROTOCOL_H

#include <Arduino.h>

// ============================================================================
// AEGIS-SHIELD / AMDS INDUSTRIAL TELEMETRY & COMMAND PROTOCOL
// Supports both Military Framed Binary (with CRC16) & Human-Readable ASCII
// ============================================================================

#define FRAME_SYNC_1 0xAA
#define FRAME_SYNC_2 0x55
#define FRAME_END_1  0x0D
#define FRAME_END_2  0x0A

enum MessageType : uint8_t {
  MSG_TELEMETRY   = 0x01, // Periodic radar scan data
  MSG_ALERT_LOCK  = 0x02, // Active hostile lock & tracking
  MSG_FIRE_EVENT  = 0x03, // Countermeasure launch event
  MSG_SYSTEM_HEALTH = 0x04, // BIST / Voltage / Temperature / Status
  MSG_CMD_ACK     = 0x05, // Command acknowledgement
  MSG_HEARTBEAT   = 0x06  // Link keep-alive
};

enum CommandOpCode : uint8_t {
  CMD_PING        = 0x10,
  CMD_SETPOS      = 0x11, // Azimuth & Elevation slewing
  CMD_FIRE        = 0x12, // Interceptor launch trigger
  CMD_LASER_CTRL  = 0x13, // Target illuminator laser (1=on, 0=off)
  CMD_SWEEP_CTRL  = 0x14, // 0=Stop, 1=AutoSweep, 2=TargetTrack
  CMD_ESTOP       = 0x15, // Immediate hardware shutdown
  CMD_BIST        = 0x16, // Built-In Self-Test
  CMD_HIL_SIM     = 0x17  // Hardware-in-the-loop simulation toggle
};

// System status flags (16-bit bitfield)
#define STATUS_FLAG_SCANNING    (1 << 0)
#define STATUS_FLAG_TRACKING    (1 << 1)
#define STATUS_FLAG_LOCKED      (1 << 2)
#define STATUS_FLAG_ARMED       (1 << 3)
#define STATUS_FLAG_FIRING      (1 << 4)
#define STATUS_FLAG_LASER_ON    (1 << 5)
#define STATUS_FLAG_ESTOP       (1 << 6)
#define STATUS_FLAG_HIL_MODE    (1 << 7)
#define STATUS_FLAG_SENSOR_ERR  (1 << 8)

// --- CRC16-CCITT IMPLEMENTATION ---
inline uint16_t calculateCRC16(const uint8_t* data, size_t length) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < length; i++) {
    crc ^= (uint16_t)data[i] << 8;
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  return crc;
}

#endif // TELEMETRY_PROTOCOL_H
