# AEGIS-SHIELD // Hardware Wiring & Electrical Integration Guide

## 1. Bill of Materials (BOM)

| Component | Quantity | Specification / Model | Function |
| :--- | :---: | :--- | :--- |
| **Microcontroller** | 1 | Arduino Uno R3 / R4 / Nano / Mega 2560 | Embedded Radar & Fire Control Unit |
| **Distance Sensor** | 1 | HC-SR04 Ultrasonic or VL53L1X ToF LiDAR | Range measurement & echo detection |
| **Pan Servo (Azimuth)** | 1 | SG90 (Micro) or MG996R (Metal Gear) | Horizontal 0°-180° radar sweep |
| **Tilt Servo (Elevation)**| 1 | SG90 or MG996R | Vertical 0°-90° intercept pitch |
| **Targeting Laser** | 1 | 5V 650nm Red Dot Laser Diode module | Optical lock-on designator |
| **Firing Actuator** | 1 | 5V 1-Channel Relay Module or Solenoid | Interceptor launch trigger |
| **Acoustic Annunciator** | 1 | 5V Active Piezo Buzzer | Tactical sound alert siren |
| **Lock Indicator LED** | 1 | 5mm High-Intensity Red/Green LED + 220Ω | Visual target lock cue |
| **Emergency Stop Button**| 1 | Normally-Open Momentary Push Button | Hardware external interrupt (Pin 2) |
| **External Power Supply**| 1 | 5V DC 2A - 3A Regulated Power Supply | Dedicated servo power rail |

---

## 2. Microcontroller Pinout Matrix

| Pin | Direction | Signal Name | Connected Hardware Component |
| :---: | :---: | :--- | :--- |
| **D2** | INPUT_PULLUP | `PIN_ESTOP_BUTTON` | Hardware Emergency Stop Button (to GND) |
| **D3** | OUTPUT (PWM) | `PIN_ELEVATION_SERVO` | Elevation (Tilt) Servo Signal (Orange wire) |
| **D5** | OUTPUT | `PIN_LOCK_LED` | Target Lock LED (+ via 220Ω resistor) |
| **D6** | OUTPUT (PWM) | `PIN_AUDIO_BUZZER` | Piezo Alarm Buzzer (+) |
| **D7** | OUTPUT | `PIN_FIRE_INTERCEPTOR`| Firing Relay Control Pin (IN) |
| **D8** | OUTPUT | `PIN_TARGETING_LASER` | Laser Diode module (Signal / +5V) |
| **D9** | OUTPUT (PWM) | `PIN_AZIMUTH_SERVO` | Azimuth (Pan) Servo Signal (Orange wire) |
| **D10**| OUTPUT | `PIN_TRIG` | HC-SR04 Ultrasonic Trigger Pin |
| **D11**| INPUT | `PIN_ECHO` | HC-SR04 Ultrasonic Echo Pin |
| **5V** | POWER | Logic 5V | Sensor logic VCC |
| **GND**| POWER | Common Ground | Common GND (must be shared with external 5V!) |

---

## 3. Power Distribution Schematic (CRITICAL)

> [!IMPORTANT]
> **DO NOT** power the two servos directly from the Arduino 5V header. During rapid slewing, servos draw 500mA–1.5A peak current, which will cause the Arduino voltage regulator to brown out and reset.

```
       +---------------------------------------------+
       |   5V 2A-3A REGULATED DC POWER SUPPLY        |
       +---------------------------------------------+
               | (+) 5V DC              | (-) GND
               |                        |
               +------------+           +-------------+
               |            |           |             |
           Servo 1      Servo 2         |         Common GND
          (VCC Red)    (VCC Red)        |             |
                                        +======> [Arduino GND]
                                                      |
    [Arduino USB 5V] --------------> [Arduino 5V]     |
                                          |           |
                                   HC-SR04 VCC    HC-SR04 GND
                                   Relay VCC      Relay GND
                                   Laser VCC      Laser GND
```

---

## 4. Pan/Tilt Gimbal Assembly

1. Mount the **Azimuth Servo** to a stable acrylic, wood, or 3D-printed base facing vertically.
2. Affix the servo horn to the **Elevation Servo** bracket.
3. Mount the **HC-SR04 sensor** and the **Targeting Laser Diode** parallel to each other on the elevation platform facing forward.
4. Verify that the wires have sufficient slack to rotate $0^\circ$ to $180^\circ$ horizontally and $0^\circ$ to $90^\circ$ vertically without tension or snagging.

---

## 5. Built-in Hardware Self-Test (BIST) Verification

Once wired, verify the entire electrical assembly:
1. Open the Arduino Serial Monitor at **115200 baud**.
2. Send command: `BIST`
3. Observe the automated sequence:
   - Laser blinks for 150ms.
   - Buzzer sounds a high-pitch test chirp.
   - Azimuth sweeps to 30°, then 150°, then homes to 90°.
   - Elevation pitches up to 60°, then homes to 30°.
   - Ultrasonic sensor sends test ping and outputs distance.
   - Terminal prints: `$BIST,ALL_SYSTEMS_PASSED*OK`.
