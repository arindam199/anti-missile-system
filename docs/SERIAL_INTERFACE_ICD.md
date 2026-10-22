# AEGIS-SHIELD // Serial Interface Control Document (ICD)
## Document Ref: ICD-AMDS-401 Rev C

---

## 1. Physical & Data Link Layer

- **Physical Layer**: Universal Serial Bus (USB) via USB-to-UART bridge (CH340, FTDI, CP2102, or Native ATmega16U2/SAMD).
- **Default Baud Rate**: `115200 bps`
- **Legacy Fallback Baud Rate**: `9600 bps`
- **Data Bits**: `8`
- **Parity**: `None`
- **Stop Bits**: `1`
- **Flow Control**: `None`

---

## 2. Downlink Telemetry Protocol (Firmware to C2)

The firmware transmits dual-stream telemetry simultaneously to ensure compatibility with modern C2 stations while preserving backward compatibility with legacy scripts.

### 2.1 Standard Industrial Telemetry Sentence (`$RADAR`)

Format:
```text
$RADAR,<Azimuth>,<Elevation>,<Distance_cm>,<Status_Flags>*<Checksum>\r\n
```

**Field Descriptions**:
1. `$RADAR`: Sentence identifier header.
2. `Azimuth`: Current radar sweep angle ($0^\circ$ to $180^\circ$, integer).
3. `Elevation`: Current targeting pitch angle ($0^\circ$ to $90^\circ$, integer).
4. `Distance_cm`: Filtered distance measurement in centimeters ($1$ decimal place). Returns `0.0` when no target echo is present.
5. `Status_Flags`: 16-bit hexadecimal bitfield:
   - `0x01` (`STATUS_FLAG_SCANNING`): Radar sweep actively sweeping.
   - `0x02` (`STATUS_FLAG_TRACKING`): Target acquired inside perimeter.
   - `0x04` (`STATUS_FLAG_LOCKED`): Target closing fast; fire lock-on established.
   - `0x08` (`STATUS_FLAG_ARMED`): Fire control circuit armed.
   - `0x10` (`STATUS_FLAG_FIRING`): Interceptor pulse actively discharging.
   - `0x20` (`STATUS_FLAG_LASER_ON`): Targeting laser designator active.
   - `0x40` (`STATUS_FLAG_ESTOP`): Hardware Emergency Stop active.
   - `0x80` (`STATUS_FLAG_HIL_MODE`): Hardware-in-the-loop simulation mode.
6. `*<Checksum>`: 8-bit XOR checksum delimiter and value (NMEA style).

**Example**:
```text
$RADAR,78,35,42.5,0027*00
```

### 2.2 Legacy Backwards-Compatible Sentence

Format:
```text
<Angle>,<Distance>.\r\n
```

**Example**:
```text
78,42.5.
```

---

## 3. Uplink Telecommand Protocol (C2 to Firmware)

Commands are transmitted as ASCII strings terminated with `\n` (LF) or `\r\n` (CRLF).

| Command | Arguments | Description | Example |
| :--- | :--- | :--- | :--- |
| `PING` | None | Link heartbeat check | `PING\n` -> `$PONG,AEGIS_ONLINE*OK` |
| `STATUS` | None | Queries full internal telemetry bitfield | `STATUS\n` |
| `SETPOS` | `<az> <el>` | Slews gimbal to absolute target angles | `SETPOS 45 30\n` |
| `FIRE` | None | Pulses interceptor relay for 250ms & fires | `FIRE\n` |
| `LASER` | `1` or `0` | Turns targeting laser designator ON / OFF | `LASER 1\n` |
| `BUZZER` | `<mode>` | Sounds acoustic alert: `1`=Chirp, `2`=Launch, `3`=Klaxon | `BUZZER 2\n` |
| `SWEEP` | `1` or `0` | Starts (`1`) or halts (`0`) the continuous radar sweep | `SWEEP 1\n` |
| `ESTOP` | None | Triggers emergency stop & shuts down all outputs | `ESTOP\n` |
| `RESET` | None | Clears emergency stop and re-homes gimbals | `RESET\n` |
| `BIST` | None | Runs complete hardware Built-In Self-Test | `BIST\n` |
| `HIL_SIM`| `1` or `0` | Enables/Disables internal simulated target generator | `HIL_SIM 1\n` |
| `P` | None | Legacy single-character pause sweep | `P` |
| `R` | None | Legacy single-character resume sweep | `R` |
| `F` | None | Legacy single-character fire countermeasure | `F` |
| `L` / `l` | None | Legacy single-character laser ON (`L`) / OFF (`l`) | `L` |
