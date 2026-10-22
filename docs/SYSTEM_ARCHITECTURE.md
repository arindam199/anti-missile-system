# AEGIS-SHIELD // Anti-Missile Defense System (AMDS-V4)
## Industrial System Architecture & Operational Doctrine

```
                      +------------------------------------------+
                      |       AEGIS-SHIELD COMMAND & CONTROL     |
                      |     Tactical Operations Center (TOC)     |
                      +------------------------------------------+
                                    |              ^
                 Bidirectional Telemetry           | Telecommands
             (115200 Baud / Web Serial API)        | (FIRE / SETPOS / ROE)
                                    v              |
                      +------------------------------------------+
                      |    EMBEDDED RADAR & FIRE CONTROL (MCU)   |
                      |          Arduino Uno / Nano / Mega       |
                      +------------------------------------------+
                           /              |             \
                          /               |              \
                         v                v               v
            +-------------------+  +--------------+  +-------------------+
            | DETECTION SENSOR  |  | 2-AXIS GIMBAL|  | FIRE CONTROL      |
            | Ultrasonic HC-SR04|  | Pan (Azimuth)|  | Laser Designator  |
            | / ToF LiDAR       |  | Tilt (Pitch) |  | Interceptor Relay |
            +-------------------+  +--------------+  | Acoustic Klaxon   |
                                                     +-------------------+
```

---

## 1. Executive Summary & Design Doctrine

The **AEGIS-SHIELD AMDS-V4** is a modern, modular, industrial-grade Counter-Rocket, Artillery, and Mortar (C-RAM) / Anti-Missile Air Defense System modeled after operational military air defense architectures (Aegis Combat System, Iron Dome, and Phalanx CIWS).

The system transitions the original hobby-grade prototype into a multi-tiered tactical combat system featuring:
1. **Real-time Non-Blocking Firmware**: Deterministic 50Hz sensor acquisition with hardware interrupts, smooth servo acceleration profiling, and fail-safe watchdog timeouts.
2. **Extended Kalman Filter (EKF) Tracker**: Multi-state digital tracking in polar and Cartesian frames ($[x, y, \dot{x}, \dot{y}]$) with false-alarm rejection and clutter gating.
3. **Threat Evaluation & Weapon Assignment (TEWA)**: Trajectory extrapolation, Defended Asset Zone impact verification, closing velocity calculation ($v_r$), and real-time Time-to-Impact (TTI) scoring.
4. **Predictive Fire Control Computer (FCC)**: Lead-angle interception and Proportional Navigation (PN) solutions.
5. **Modern Tactical Operations Center (TOC) C2 Console**: Dual 2D PPI phosphor radar and 3D WebGL battlefield intercept theater with Web Serial direct hardware integration, tactical voice annunciator, and procedural military sound synthesis.

---

## 2. Sensor Acquisition & Signal Processing

### 2.1 Non-Blocking Microsecond Scheduling
Standard Arduino ultrasonic implementations freeze CPU execution for up to 30ms during `pulseIn()`. The AMDS-V4 firmware replaces blocking routines with bounded acquisition ($25,000\,\mu\text{s}$ ceiling) and state-machine scheduling:
- **Maximum Detection Range**: $425\,\text{cm}$ ($4.25\,\text{m}$ lab scale).
- **Temperature Compensation**: Speed of sound is calibrated dynamically:
  $$v_{sound} = 331.3 + 0.606 \times T_{\text{ambient}}\,(\text{m/s})$$

### 2.2 Extended Kalman Filter (EKF) Tracking State
For target positions reported in polar coordinates $(\theta, r)$, the tracking computer maps blips into Cartesian space:
$$x = r \cos(180^\circ - \theta), \quad y = -r \sin(180^\circ - \theta)$$

The discrete Kalman update estimates the velocity state:
$$v_x(k) = (1 - \alpha) v_x(k-1) + \alpha \frac{x(k) - x(k-1)}{\Delta t}$$
$$v_y(k) = (1 - \alpha) v_y(k-1) + \alpha \frac{y(k) - y(k-1)}{\Delta t}$$

where $\alpha \approx 0.65$ balances sensor responsiveness with noise rejection.

---

## 3. Threat Evaluation & Weapon Assignment (TEWA)

The system continuously tracks all targets in the surveillance sector and prioritizes threats based on ballistic trajectory:

### 3.1 Radial Closing Velocity ($v_r$)
$$v_r = -\frac{x \cdot v_x + y \cdot v_y}{\sqrt{x^2 + y^2}}$$

### 3.2 Time-to-Impact (TTI)
$$TTI = \frac{R}{v_r}$$

### 3.3 Defended Asset Zone Verification
The system evaluates whether the target's projected ground intercept intersects the Defended Asset Zone (Radius $R_{base} = 50\,\text{cm}$):
- **CRITICAL INBOUND**: Target closing on asset with $TTI < 5.0\,\text{s}$ and Range $< 150\,\text{cm}$.
- **ELEVATED TRACK**: Target detected inside $250\,\text{cm}$, vector towards perimeter.
- **ROUTINE / CLUTTER**: Target stationary or moving tangential/away from defended perimeter.

---

## 4. Fire Control Solution & Guidance

The Fire Control Computer solves the predictive intercept triangle between target position $\vec{P}_{tgt}$, target velocity $\vec{V}_{tgt}$, and interceptor speed $V_{int}$:

$$\| \vec{P}_{tgt} + \vec{V}_{tgt} \cdot t_{flight} \| = V_{int} \cdot t_{flight}$$

Solving for flight time $t_{flight}$:
$$t_{flight} \approx \frac{R_{tgt}}{V_{int} + v_r}$$

The predicted intercept point is:
$$\vec{P}_{intercept} = \vec{P}_{tgt} + \vec{V}_{tgt} \cdot t_{flight}$$

The gimbal azimuth is commanded directly to the lead intercept angle:
$$\theta_{lead} = 180^\circ - \text{atan2}(-P_{y, int}, P_{x, int})$$

---

## 5. Rules of Engagement (ROE) Doctrine

1. **MANUAL RELEASE**: The system displays target track, range, velocity, and computed intercept solution. Weapon release requires operator confirmation (`[SPACEBAR]` or `[F]`).
2. **SEMI-AUTONOMOUS**: The gimbal and laser automatically slew to lock onto the highest-priority threat; operator holds fire authorize.
3. **AUTONOMOUS CIWS (Iron Dome Mode)**: Full autonomous engagement. When a hostile target breaches $120\,\text{cm}$ with $TTI < 5.0\,\text{s}$, the system:
   - Locks gimbal on lead azimuth.
   - Energizes laser designator.
   - Pulses firing relay ($250\,\text{ms}$) to dispatch countermeasure.
   - Synthesizes tactical voice warning.
