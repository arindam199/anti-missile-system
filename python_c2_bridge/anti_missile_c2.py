#!/usr/bin/env python3
"""
===============================================================================
PROJECT : AEGIS-SHIELD // INDUSTRIAL ANTI-MISSILE DEFENSE SYSTEM (AMDS-V4)
MODULE  : Python Edge C2 Telemetry Server & EKF Fire Control Computer
===============================================================================
"""

import sys
import time
import math
import argparse
import json
import csv
from datetime import datetime

try:
    import serial
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False

# Default Defense Config
DEFAULT_BAUD = 115200
ASSET_DEFENSE_RADIUS = 60.0  # cm / meters
CRITICAL_TTI_THRESHOLD = 5.0 # seconds


class ExtendedKalmanTracker:
    """
    2D Extended Kalman Filter for target state estimation:
    State: [x, y, vx, vy]
    """
    def __init__(self, track_id, x, y):
        self.track_id = track_id
        self.x = x
        self.y = y
        self.vx = 0.0
        self.vy = 0.0
        self.last_update = time.time()
        self.hits = 1
        self.alpha = 0.7  # Kalman filter innovation weight

    def update(self, mx, my):
        now = time.time()
        dt = max(0.01, now - self.last_update)

        raw_vx = (mx - self.x) / dt
        raw_vy = (my - self.y) / dt

        self.vx = (1.0 - self.alpha) * self.vx + self.alpha * raw_vx
        self.vy = (1.0 - self.alpha) * self.vy + self.alpha * raw_vy
        self.x = (1.0 - self.alpha) * self.x + self.alpha * mx
        self.y = (1.0 - self.alpha) * self.y + self.alpha * my

        self.last_update = now
        self.hits += 1

    @property
    def range(self):
        return math.sqrt(self.x**2 + self.y**2)

    @property
    def azimuth(self):
        rad = math.atan2(-self.y, self.x)
        deg = 180.0 - math.degrees(rad)
        return (deg + 360.0) % 360.0

    @property
    def speed(self):
        return math.sqrt(self.vx**2 + self.vy**2)

    @property
    def time_to_impact(self):
        r = self.range
        if r <= 0.1:
            return 0.0
        closing_speed = -(self.x * self.vx + self.y * self.vy) / r
        if closing_speed <= 0.2:
            return 99.9
        return r / closing_speed


class ThreatEvaluationWeaponAssignment:
    """
    Evaluates tracks, classifies hostiles, and computes predictive lead-angle intercepts.
    """
    @staticmethod
    def evaluate(tracks):
        primary_threat = None
        min_tti = 999.0

        for trk in tracks:
            tti = trk.time_to_impact
            if trk.range < 250.0 and tti < min_tti:
                min_tti = tti
                primary_threat = trk

        return primary_threat

    @staticmethod
    def compute_fire_solution(target, interceptor_speed=45.0):
        """
        Solves for lead-angle intercept point.
        """
        tti = target.time_to_impact
        flight_time = target.range / (interceptor_speed + target.speed + 0.1)

        pred_x = target.x + target.vx * flight_time
        pred_y = target.y + target.vy * flight_time

        sol_rad = math.atan2(-pred_y, pred_x)
        sol_az = (180.0 - math.degrees(sol_rad) + 360.0) % 360.0
        sol_range = math.sqrt(pred_x**2 + pred_y**2)

        return {
            'target_id': target.track_id,
            'lead_azimuth': sol_az,
            'elevation': 35.0,
            'intercept_range': sol_range,
            'flight_time': flight_time
        }


class AntiMissileC2Bridge:
    def __init__(self, port=None, baud=DEFAULT_BAUD, simulate=False):
        self.port = port
        self.baud = baud
        self.simulate = simulate
        self.serial_conn = None
        self.tracks = {}
        self.is_running = True
        self.autonomous_ciws = True
        self.last_fire_time = 0.0

    def connect_serial(self):
        if not HAS_SERIAL:
            print("[WARN] pyserial library not available. Forcing simulation mode.")
            self.simulate = True
            return

        if not self.port:
            ports = list(serial.tools.list_ports.comports())
            if ports:
                self.port = ports[0].device
                print(f"[INFO] Auto-detected serial port: {self.port}")
            else:
                print("[WARN] No active COM ports found. Falling back to SIMULATION mode.")
                self.simulate = True
                return

        try:
            self.serial_conn = serial.Serial(self.port, self.baud, timeout=0.1)
            print(f"[INFO] Successfully connected to {self.port} at {self.baud} baud.")
        except Exception as e:
            print(f"[ERR] Failed to open {self.port}: {e}. Switching to SIMULATION mode.")
            self.simulate = True

    def run(self):
        print("=" * 70)
        print("   AEGIS-SHIELD // INDUSTRIAL ANTI-MISSILE TACTICAL C2 TERMINAL")
        print("=" * 70)

        if not self.simulate:
            self.connect_serial()

        try:
            while self.is_running:
                if self.simulate:
                    self.run_sim_step()
                else:
                    self.run_hardware_step()

                time.sleep(0.04) # 25 Hz update loop
        except KeyboardInterrupt:
            print("\n[INFO] System shutdown initiated by operator.")
        finally:
            if self.serial_conn and self.serial_conn.is_open:
                self.serial_conn.close()

    def run_hardware_step(self):
        if not self.serial_conn or not self.serial_conn.is_open:
            return

        try:
            while self.serial_conn.in_waiting > 0:
                raw_line = self.serial_conn.readline().decode('utf-8', errors='ignore').strip()
                if not raw_line:
                    continue

                az, dist = None, None
                if raw_line.startswith('$RADAR'):
                    parts = raw_line.split(',')
                    if len(parts) >= 4:
                        az = float(parts[1])
                        dist = float(parts[3])
                elif raw_line.endswith('.'):
                    parts = raw_line[:-1].split(',')
                    if len(parts) == 2:
                        az = float(parts[0])
                        dist = float(parts[1])

                if az is not None and dist is not None:
                    self.ingest_measurement(az, dist)
        except Exception as e:
            print(f"[WARN] Serial read glitch: {e}")

    sim_az = 0.0
    sim_dir = 1.0
    sim_target_r = 340.0
    sim_target_az = 60.0

    def run_sim_step(self):
        self.sim_az += self.sim_dir * 2.5
        if self.sim_az >= 180.0:
            self.sim_az = 180.0
            self.sim_dir = -1.0
        elif self.sim_az <= 0.0:
            self.sim_az = 0.0
            self.sim_dir = 1.0

        # Advance simulated inbound missile
        self.sim_target_r -= 1.8
        if self.sim_target_r <= 15.0:
            self.sim_target_r = 360.0 # Respawn missile

        if abs(self.sim_az - self.sim_target_az) < 3.5:
            self.ingest_measurement(self.sim_target_az, self.sim_target_r)

    def ingest_measurement(self, az, dist):
        if dist <= 5.0 or dist > 380.0:
            return

        rad = math.radians(180.0 - az)
        mx = math.cos(rad) * dist
        my = -math.sin(rad) * dist

        matched = None
        for trk in self.tracks.values():
            if math.hypot(mx - trk.x, my - trk.y) < 35.0:
                matched = trk
                break

        if matched:
            matched.update(mx, my)
        else:
            trk_id = len(self.tracks) + 101
            self.tracks[trk_id] = ExtendedKalmanTracker(trk_id, mx, my)

        self.evaluate_tactical_situation()

    def evaluate_tactical_situation(self):
        now = time.time()
        # Clean stale tracks
        active_tracks = [t for t in self.tracks.values() if (now - t.last_update) < 3.0]

        threat = ThreatEvaluationWeaponAssignment.evaluate(active_tracks)

        if threat:
            sol = ThreatEvaluationWeaponAssignment.compute_fire_solution(threat)
            tti = threat.time_to_impact

            status_str = f"ALERT DEFCON 1 | TGT-{threat.track_id} | R={threat.range:.1f}cm | Az={threat.azimuth:.0f}° | TTI={tti:.1f}s | SolAz={sol['lead_azimuth']:.0f}°"
            print(f"\r\033[91m[!] {status_str}\033[0m", end="", flush=True)

            # Autonomous CIWS Fire Release Check
            if self.autonomous_ciws and threat.range < 120.0 and tti < CRITICAL_TTI_THRESHOLD:
                if now - self.last_fire_time > 3.0:
                    self.dispatch_fire_command(sol)
        else:
            print(f"\r\033[92m[+] DEFCON 5 // SURVEILLANCE NOMINAL | ACTIVE TRACKS: {len(active_tracks)}\033[0m", end="", flush=True)

    def dispatch_fire_command(self, sol):
        self.last_fire_time = time.time()
        print(f"\n\033[93m>>> [FIRE] INTERCEPTOR LAUNCHED! Slewing to {sol['lead_azimuth']:.0f} deg <<<\033[0m")
        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.write(f"SETPOS {int(sol['lead_azimuth'])} 35\n".encode())
                self.serial_conn.write(b"FIRE\n")
            except Exception as e:
                print(f"[ERR] Failed to send fire command: {e}")


def main():
    parser = argparse.ArgumentParser(description="AEGIS Industrial Anti-Missile Defense C2 Terminal")
    parser.add_argument("--port", type=str, default=None, help="Serial COM port (e.g. COM3 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help="Baud rate (default: 115200)")
    parser.add_argument("--simulate", action="store_true", help="Run in pure tactical simulation mode")
    args = parser.parse_args()

    c2 = AntiMissileC2Bridge(port=args.port, baud=args.baud, simulate=args.simulate)
    c2.run()


if __name__ == "__main__":
    main()
