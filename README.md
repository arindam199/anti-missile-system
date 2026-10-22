# 🛡️ AEGIS-SHIELD // Tactical Air Defense & Anti-Missile System (AMDS-V4)
### Industrial-Grade C-RAM / Counter-Missile Command, Control & Fire Interception System

[![System State](https://img.shields.io/badge/Defense_Status-OPERATIONAL-00ff73?style=flat-square)](#)
[![Firmware](https://img.shields.io/badge/Firmware-Arduino_C%2B%2B_V4-00e5ff?style=flat-square)](#)
[![Tactical C2](https://img.shields.io/badge/C2_Dashboard-HTML5_WebGL_WebSerial-ff2a4b?style=flat-square)](#)
[![Tracking](https://img.shields.io/badge/Tracker-Extended_Kalman_Filter_(EKF)-ffb700?style=flat-square)](#)

---

## 🚀 Overview

**AEGIS-SHIELD (AMDS-V4)** is an industrial-level defense project modeled after operational military air defense architectures (such as the Aegis Combat System, Iron Dome, and Phalanx CIWS).

The project upgrades the original prototype into a multi-tiered tactical combat system with real-time target tracking, ballistic trajectory prediction, Threat Evaluation and Weapon Assignment (TEWA), predictive lead-angle interception, and a Tactical Operations Center (TOC) C2 ground station.

---

## ⚡ What Was Upgraded?

| Feature | Original Prototype | Industrial AEGIS-SHIELD (AMDS-V4) |
| :--- | :--- | :--- |
| **Firmware Timing** | Blocking `pulseIn(30000)` (30ms CPU stall) | **Non-blocking deterministic 50Hz state machine** |
| **Gimbal Actuation**| 1 single servo (azimuth only) | **Dual-Servo Pan & Tilt Gimbal** (Azimuth + Elevation) |
| **Weapon System** | None (Display only) | **Targeting Laser + Interceptor Solenoid/Relay Trigger** |
| **Safety Interlocks**| None | **Hardware Interrupt Emergency Stop (`ESTOP`) + BIST** |
| **Target Tracking** | Raw momentary dots on screen | **Extended Kalman Filter (EKF)** state estimation ($x, y, v_x, v_y$) |
| **Threat Assessment**| Hardcoded non-functioning check | **TEWA Engine**: Ballistic trajectory, Time-to-Impact (TTI), threat scoring |
| **Fire Control** | None | **Predictive Lead-Angle Intercept & Proportional Navigation (PN)** |
| **Rules of Engagement**| None | **3 ROE Modes**: Manual, Semi-Autonomous, Autonomous CIWS |
| **Tactical Display** | Basic 2D Processing sketch (requires Java) | **Dual 2D Phosphor CRT PPI Radar + 3D WebGL Battlefield Theater** |
| **Hardware Link** | Desktop-dependent serial code | **Direct Web Serial API** (connects in Chrome/Edge with 1 click) |
| **Simulation Mode** | None (Fails if no Arduino plugged in) | **5 Realistic Ballistic Scenarios & Hardware-in-the-Loop (HIL)** |
| **Audio Subsystem** | None | **Web Audio synthesizer** (klaxon, missile whoosh, flak boom) + **Tactical Voice Annunciator** |

---

## 📁 Repository Structure

```
anti missile/
├── Launch_Tactical_C2.bat             <-- 1-Click launcher for Tactical C2 Dashboard!
├── ardino.java                        <-- Synchronized Arduino source (compatibility)
├── processing.java                    <-- Synchronized Processing source (compatibility)
│
├── c2_ground_station/                 <-- Flagship Tactical Operations Center (TOC)
│   ├── index.html                     <-- Tactical C2 HUD & Command Console
│   ├── app.js                         <-- Web Serial, EKF tracker, TEWA & fire control
│   ├── radar2d.js                     <-- 2D PPI Phosphor radar renderer (Canvas 2D)
│   ├── tactical3d.js                  <-- 3D Battlefield Theater (Three.js WebGL + Canvas fallback)
│   ├── simulation_engine.js           <-- 6-DoF Ballistic & interceptor physics simulator
│   ├── audio_synth.js                 <-- Procedural military sound & voice engine
│   └── styles.css                     <-- Military-grade tactical HUD aesthetic
│
├── firmware/                          <-- Production Embedded Firmware (C++)
│   ├── anti_missile_radar.ino          <-- Main Arduino sketch (open in Arduino IDE)
│   ├── HardwareConfig.h               <-- Pinouts, servo limits, speed of sound calibration
│   └── TelemetryProtocol.h            <-- Telemetry packet structure & CRC16 checksum
│
├── python_c2_bridge/                  <-- Edge Telemetry & Python Terminal C2
│   ├── anti_missile_c2.py             <-- Headless serial reader, EKF engine, CLI HUD
│   ├── requirements.txt               <-- Python dependencies (pyserial)
│   └── run_c2.bat                     <-- 1-click batch launcher for Python C2
│
├── processing/                        <-- Modernized Processing IDE Sketch
│   └── anti_missile_radar.pde         <-- Enhanced tactical radar sketch for Processing 3/4
│
└── docs/                              <-- Industrial Defense Documentation
    ├── SYSTEM_ARCHITECTURE.md         <-- Operational doctrine, EKF math, TEWA algorithms
    ├── HARDWARE_WIRING_GUIDE.md       <-- Schematics, pinouts, power rail safety & BOM
    ├── SERIAL_INTERFACE_ICD.md        <-- NMEA $RADAR sentence & telecommands specification
    └── RULES_OF_ENGAGEMENT_MANUAL.md  <-- DEFCON levels, safety rules & ESTOP manual
```

---

## 🕹️ Quick Start Guide

### 1. Launch the Tactical Operations Center (Recommended)
1. Double-click **`Launch_Tactical_C2.bat`** (or open `c2_ground_station/index.html` in Google Chrome or Microsoft Edge).
2. The Tactical Operations Center opens immediately with full audio and visual systems online:
   - **No hardware needed for testing!** The built-in simulation engine automatically simulates incoming ballistic missiles.
   - Switch between **2D PPI Radar** and **3D Battlefield Theater** tabs at the top.
   - Test the 5 built-in scenarios using the dropdown: *Ballistic Missile, Saturation Salvo, Cruise Missile, Hypersonic Strike, and Clutter*.
   - Use the **`[SPACEBAR]`** or click **`AUTHORIZE INTERCEPT`** to fire countermeasures manually, or set ROE to **`AUTONOMOUS CIWS`** to watch the system lock on and intercept targets automatically!
   - When ready with real hardware, plug in your Arduino USB cable and click **`CONNECT ARDUINO USB`** to stream live physical sensor telemetry with zero driver installation!

### 2. Flashing the Arduino Firmware
1. Open the [Arduino IDE](https://www.arduino.cc/).
2. Open **`firmware/anti_missile_radar.ino`**.
3. Select your board (Arduino Uno, Nano, or Mega) and COM port.
4. Click **Upload** (Ctrl + U).
5. Open the Serial Monitor at **115200 baud** to observe the boot banner:
   ```text
   $INIT,AEGIS_AMDS_V4,STATUS_NOMINAL,BAUD_115200*OK
   RADAR_READY
   ```

### 3. Running via Python Terminal (Optional)
If running on a headless terminal, field laptop, or Raspberry Pi:
```powershell
cd "python_c2_bridge"
python anti_missile_c2.py --simulate
```

### 4. Running via Processing IDE (Optional)
Open **`processing/anti_missile_radar.pde`** in Processing 3 or Processing 4 and click **Run**.

---

## 🔌 Hardware Wiring Summary

| Arduino Pin | Hardware Component | Function |
| :---: | :--- | :--- |
| **D2** | Emergency Stop Pushbutton (to GND) | Hardware Interrupt (`ESTOP`) |
| **D3** | Elevation (Tilt) Servo Signal (Orange) | Vertical Pitch Gimbal ($0^\circ-90^\circ$) |
| **D5** | Target Lock LED (+ via 220Ω) | Target Lock Visual Annunciator |
| **D6** | Piezo Buzzer (+) | Acoustic Tactical Alarm Siren |
| **D7** | 5V Relay Module (IN) | Interceptor Launch Solenoid / Igniter |
| **D8** | Targeting Laser Diode (+) | Optical Lock-on Designator Beam |
| **D9** | Azimuth (Pan) Servo Signal (Orange) | Horizontal Sweep Gimbal ($0^\circ-180^\circ$) |
| **D10** | HC-SR04 `TRIG` | Ultrasonic Transmitter Strobe |
| **D11** | HC-SR04 `ECHO` | Ultrasonic Receiver Echo |
| **5V / GND** | External 5V 2A Power Rail | Servo Power (*Share GND with Arduino!*) |

*For complete wiring schematics, voltage protection, and power distribution guidelines, consult [HARDWARE_WIRING_GUIDE.md](docs/HARDWARE_WIRING_GUIDE.md).*

---

## 🔒 Safety Interlocks & Emergency Stop

- **Physical ESTOP**: A push-button connected between **Pin 2** and **GND** triggers an immediate hardware interrupt that instantly cuts power to the laser, de-energizes the firing relay, and halts servos.
- **Software ESTOP**: Press the **`[ESC]`** key in the C2 console at any time.

---

## 📄 License & Standards Compliance
Designed in accordance with military C2 architectural patterns and modern IEEE/ANSI embedded development practices.
