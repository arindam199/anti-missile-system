/**
 * ============================================================================
 * AEGIS-SHIELD // HIGH-PRECISION 2D PLAN POSITION INDICATOR (PPI) RADAR
 * Phosphor Decay, Track Symbology, Velocity Vectors & Intercept Visualizer
 * ============================================================================
 */

class Radar2DRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.sweepAngle = 90;
    this.sweepDirection = 1;
    this.blips = [];
    this.maxScaleRange = 380; // cm max range scale
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
  }

  setSweep(angle) {
    this.sweepAngle = angle;
  }

  addBlip(angle, distance) {
    if (distance <= 5 || distance > this.maxScaleRange) return;
    this.blips.push({
      angle: angle,
      distance: distance,
      alpha: 1.0,
      timestamp: Date.now()
    });
    if (this.blips.length > 150) this.blips.shift();
  }

  render(tracks, interceptSolution, explosions, interceptors) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const centerX = w / 2;
    const centerY = h - 60; // Radar station anchored at bottom center
    const maxRadius = Math.min(w * 0.45, h - 100);

    // 1. Semi-transparent dark trail for authentic phosphor decay
    ctx.fillStyle = 'rgba(4, 9, 14, 0.22)';
    ctx.fillRect(0, 0, w, h);

    // 2. Range Rings & Grid
    ctx.save();
    ctx.translate(centerX, centerY);

    const ringDistances = [50, 100, 150, 200, 300];
    ringDistances.forEach(dist => {
      const r = (dist / this.maxScaleRange) * maxRadius;
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 255, 115, 0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Range label
      ctx.fillStyle = 'rgba(0, 255, 115, 0.6)';
      ctx.font = `${Math.round(11 * window.devicePixelRatio)}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${dist}cm`, 0, -r + 14);
    });

    // 3. Azimuth Rays
    for (let a = 0; a <= 180; a += 15) {
      const rad = (180 - a) * (Math.PI / 180);
      const x = Math.cos(rad) * maxRadius;
      const y = -Math.sin(rad) * maxRadius;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(x, y);
      ctx.strokeStyle = (a % 45 === 0) ? 'rgba(0, 255, 115, 0.35)' : 'rgba(0, 255, 115, 0.1)';
      ctx.stroke();

      // Degree label on perimeter
      ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
      ctx.font = `${Math.round(10 * window.devicePixelRatio)}px Consolas, monospace`;
      ctx.fillText(`${a}°`, x * 1.05, y * 1.05);
    }

    // 4. Defended Base Asset Perimeter
    const baseR = (50 / this.maxScaleRange) * maxRadius;
    ctx.beginPath();
    ctx.arc(0, 0, baseR, Math.PI, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 42, 75, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 42, 75, 0.08)';
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 42, 75, 0.85)';
    ctx.font = `${Math.round(10 * window.devicePixelRatio)}px Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('PROTECTED ASSET ZONE', 0, -baseR * 0.5);

    // 5. Radar Baseline
    ctx.beginPath();
    ctx.moveTo(-maxRadius * 1.05, 0);
    ctx.lineTo(maxRadius * 1.05, 0);
    ctx.strokeStyle = 'rgba(0, 255, 115, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 6. Draw Persistent Blips
    const now = Date.now();
    for (let i = this.blips.length - 1; i >= 0; i--) {
      const b = this.blips[i];
      const age = (now - b.timestamp) / 1000;
      if (age > 4.0) {
        this.blips.splice(i, 1);
        continue;
      }
      const alpha = Math.max(0, 1 - age / 4.0);
      const rad = (180 - b.angle) * (Math.PI / 180);
      const r = (b.distance / this.maxScaleRange) * maxRadius;
      const bx = Math.cos(rad) * r;
      const by = -Math.sin(rad) * r;

      ctx.beginPath();
      ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 255, 115, ${alpha * 0.9})`;
      ctx.shadowColor = '#00ff73';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 7. Rotating Radar Sweep Fan & Leading Beam
    const sweepRad = (180 - this.sweepAngle) * (Math.PI / 180);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius);
    grad.addColorStop(0, 'rgba(0, 255, 115, 0.3)');
    grad.addColorStop(1, 'rgba(0, 255, 115, 0.02)');

    // Phosphor trailing sector
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, maxRadius, sweepRad - 0.25, sweepRad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Sharp scanning beam line
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(sweepRad) * maxRadius, -Math.sin(sweepRad) * maxRadius);
    ctx.strokeStyle = '#a6ffd0';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 8. Draw Active Hostile Targets & EKF Tracks
    tracks.forEach(t => {
      const rad = (180 - t.azimuth) * (Math.PI / 180);
      const r = (t.range / this.maxScaleRange) * maxRadius;
      const tx = Math.cos(rad) * r;
      const ty = -Math.sin(rad) * r;

      // Draw breadcrumb history
      if (t.trail && t.trail.length > 1) {
        ctx.beginPath();
        t.trail.forEach((pt, idx) => {
          const ptRad = (180 - pt.azimuth) * (Math.PI / 180);
          const ptR = (pt.range / this.maxScaleRange) * maxRadius;
          const px = Math.cos(ptRad) * ptR;
          const py = -Math.sin(ptRad) * ptR;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = 'rgba(255, 42, 75, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Hostile NATO Diamond Symbol
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = '#ff2a4b';
      ctx.lineWidth = 2;
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();

      // Velocity Leader Vector
      if (t.vx || t.vy) {
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + (t.vx * 15), ty + (t.vy * 15));
        ctx.strokeStyle = '#ff2a4b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Tactical Target Tag
      ctx.fillStyle = '#ff2a4b';
      ctx.font = `bold ${Math.round(11 * window.devicePixelRatio)}px Consolas, monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(`TGT-${t.id} [${t.type || 'HOSTILE'}]`, tx + 14, ty - 8);
      ctx.fillStyle = '#e0f4ff';
      ctx.font = `${Math.round(10 * window.devicePixelRatio)}px Consolas, monospace`;
      ctx.fillText(`R: ${Math.round(t.range)}cm | V: ${(t.speed * 10).toFixed(1)}cm/s`, tx + 14, ty + 6);
      if (t.tti !== undefined) {
        ctx.fillStyle = t.tti < 4.0 ? '#ff2a4b' : '#ffb700';
        ctx.fillText(`TTI: ${t.tti.toFixed(1)}s`, tx + 14, ty + 20);
      }
    });

    // 9. Draw Interceptor Flyout
    if (interceptors) {
      interceptors.forEach(itc => {
        const rad = Math.atan2(-itc.y, itc.x);
        const r = (Math.sqrt(itc.x * itc.x + itc.y * itc.y) / this.maxScaleRange) * maxRadius;
        const ix = Math.cos(rad) * r;
        const iy = Math.sin(rad) * r;

        // Rocket icon & flame
        ctx.beginPath();
        ctx.arc(ix, iy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // 10. Fire Control Intercept Solution Reticle
    if (interceptSolution && interceptSolution.active) {
      const sol = interceptSolution;
      const rad = (180 - sol.azimuth) * (Math.PI / 180);
      const r = (sol.range / this.maxScaleRange) * maxRadius;
      const ix = Math.cos(rad) * r;
      const iy = -Math.sin(rad) * r;

      // Solution ray
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ix, iy);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Intercept Reticle Crosshair
      ctx.beginPath();
      ctx.arc(ix, iy, 14, 0, Math.PI * 2);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ix - 18, iy); ctx.lineTo(ix + 18, iy);
      ctx.moveTo(ix, iy - 18); ctx.lineTo(ix, iy + 18);
      ctx.stroke();

      ctx.fillStyle = '#00e5ff';
      ctx.font = `bold ${Math.round(10 * window.devicePixelRatio)}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`SOLUTION LOCKED (AZ: ${sol.azimuth.toFixed(0)}°)`, ix, iy - 22);
    }

    // 11. Explosions on 2D Screen
    if (explosions) {
      explosions.forEach(exp => {
        const rad = Math.atan2(-exp.y, exp.x);
        const r = (Math.sqrt(exp.x * exp.x + exp.y * exp.y) / this.maxScaleRange) * maxRadius;
        const ex = Math.cos(rad) * r;
        const ey = Math.sin(rad) * r;
        const expRadius = (exp.radius / this.maxScaleRange) * maxRadius * 3;

        ctx.beginPath();
        ctx.arc(ex, ey, expRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 140, 0, ${exp.alpha * 0.6})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ex, ey, expRadius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 240, 200, ${exp.alpha * 0.9})`;
        ctx.fill();
      });
    }

    // Center Radar Emitter Station
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff73';
    ctx.shadowColor = '#00ff73';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}

window.Radar2DRenderer = Radar2DRenderer;
