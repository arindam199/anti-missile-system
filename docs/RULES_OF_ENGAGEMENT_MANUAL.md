# AEGIS-SHIELD // Standard Operating Procedures & Rules of Engagement (ROE)

## 1. Readiness Levels (DEFCON Scale)

| Defense Condition | Title | Status Criteria | System Actions |
| :---: | :--- | :--- | :--- |
| **DEFCON 5** | NORMAL READINESS | All sectors clear. No active tracks inside 250cm. | Green HUD status. Radar conducts standard 50Hz sweep. |
| **DEFCON 4** | CAUTION / MONITOR | Track acquired between 150cm - 250cm. | Yellow caution symbology. EKF track initiation. Velocity calculation active. |
| **DEFCON 3** | ELEVATED READINESS | Track inside 150cm with closing velocity. | Gimbal tracking lock. Tactical voice alert annunciated. Fire solution computed. |
| **DEFCON 2** | ARMED & TARGETED | Track inside 100cm, closing velocity > 1.0cm/s. | Red pulsing diamond. Laser designator energized. Solution reticle locked. |
| **DEFCON 1** | AIR RAID / ENGAGE | Hostile confirmed inside engagement basket with TTI < 5.0s. | Klaxon siren triggers. Autonomous CIWS dispatches interceptor countermeasure. |

---

## 2. Engagement Modes & Operator Doctrine

### 2.1 Autonomous CIWS (Iron Dome Mode) - [RECOMMENDED]
- Used for high-speed missile defense where human cognitive reaction time (~250ms–500ms) would result in defended asset breach.
- The system automatically transitions from track initiation to fire authorization in under **40 milliseconds**.
- Safety interlock: Only targets with confirmed negative range-rate (closing towards base) inside the defined engagement corridor are engaged.

### 2.2 Semi-Autonomous Mode
- The system automates target acquisition, radar slewing, and laser illumination.
- The operator retains fire authorization and must confirm release by pressing `[SPACEBAR]` or clicking `AUTHORIZE INTERCEPT`.

### 2.3 Manual Mode
- Complete operator control. Gimbal position, laser activation, and missile launch are gated by human commands.

---

## 3. Emergency Stop (ESTOP) Procedure

In the event of hardware misalignment, cable entanglement, or range safety hazard:
1. **Physical ESTOP**: Press the momentary red push button wired to Arduino **Pin 2**. An external interrupt immediately:
   - Shuts down the targeting laser diode.
   - De-energizes the interceptor firing relay.
   - Halts all servo PWM pulses.
   - Sounds the warning tone.
2. **Software ESTOP**: Press the `[ESC]` key in the Tactical Operations Center or click **EMERGENCY STOP**.
3. **Recovery**: Clear the physical hazard and click **RESET TRACKS** or send `RESET\n` via serial.
