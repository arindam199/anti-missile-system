/**
 * ============================================================================
 * AEGIS-SHIELD // 3D TACTICAL BATTLEFIELD & MISSILE INTERCEPT THEATER
 * Supports Three.js WebGL with Automatic Native Canvas 3D Isometric Fallback
 * ============================================================================
 */

class Tactical3DRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.useThree = typeof THREE !== 'undefined';
    this.init();
  }

  init() {
    if (!this.canvas) return;

    if (this.useThree) {
      try {
        this.initThreeJS();
        return;
      } catch (e) {
        console.warn('Three.js initialization failed, falling back to Canvas 3D:', e);
        this.useThree = false;
      }
    }
    this.initCanvas3D();
  }

  initThreeJS() {
    const width = this.canvas.clientWidth || 800;
    const height = this.canvas.clientHeight || 500;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060a10, 0.0015);

    this.camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
    this.camera.position.set(0, 240, 420);
    this.camera.lookAt(0, 40, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Ambient & Tactical Lighting
    const ambientLight = new THREE.AmbientLight(0x1a334d, 1.2);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00e5ff, 1.5);
    dirLight.position.set(150, 300, 200);
    this.scene.add(dirLight);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(800, 40, 0x00ff73, 0x14324a);
    gridHelper.position.y = 0;
    this.scene.add(gridHelper);

    // Defended Base Center Model
    const baseGeo = new THREE.CylinderGeometry(40, 50, 15, 32);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x112233, wireframe: false });
    this.baseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.baseMesh.position.y = 7.5;
    this.scene.add(this.baseMesh);

    // Radar Dome
    const domeGeo = new THREE.SphereGeometry(18, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const domeMat = new THREE.MeshPhongMaterial({ color: 0x00e5ff, wireframe: true });
    this.radarDome = new THREE.Mesh(domeGeo, domeMat);
    this.radarDome.position.y = 15;
    this.scene.add(this.radarDome);

    // Targeting Laser Line
    const laserMat = new THREE.LineBasicMaterial({ color: 0xff0044, linewidth: 2 });
    const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 15, 0), new THREE.Vector3(0, 15, 0)]);
    this.laserLine = new THREE.Line(laserGeo, laserMat);
    this.laserLine.visible = false;
    this.scene.add(this.laserLine);

    this.missileMeshes = new Map();
    this.interceptorMeshes = new Map();

    window.addEventListener('resize', () => {
      if (!this.canvas) return;
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  initCanvas3D() {
    this.ctx = this.canvas.getContext('2d');
    this.rotY = -0.3;
    this.pitch = 0.55;
    this.zoom = 1.3;
  }

  project(x, y, z, cx, cy) {
    // 3D Isometric Projection
    const cosY = Math.cos(this.rotY);
    const sinY = Math.sin(this.rotY);
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;

    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const y2 = y * cosP - z1 * sinP;
    const z2 = y * sinP + z1 * cosP;

    const scale = (600 / (z2 + 800)) * this.zoom;
    return {
      x: cx + x1 * scale,
      y: cy - y2 * scale,
      scale: scale
    };
  }

  render(targets, interceptors, explosions, laserActive, sweepAngle) {
    if (this.useThree && this.renderer) {
      this.renderThreeJS(targets, interceptors, explosions, laserActive, sweepAngle);
    } else {
      this.renderCanvas3D(targets, interceptors, explosions, laserActive, sweepAngle);
    }
  }

  renderThreeJS(targets, interceptors, explosions, laserActive, sweepAngle) {
    // Rotate radar dome with sweep
    if (this.radarDome) {
      this.radarDome.rotation.y = (sweepAngle * Math.PI) / 180;
    }

    // Dynamic targeting laser
    const activeTarget = targets.find(t => t.active);
    if (laserActive && activeTarget && this.laserLine) {
      this.laserLine.visible = true;
      const positions = this.laserLine.geometry.attributes.position.array;
      positions[0] = 0; positions[1] = 15; positions[2] = 0;
      positions[3] = activeTarget.x;
      positions[4] = activeTarget.z;
      positions[5] = -activeTarget.y;
      this.laserLine.geometry.attributes.position.needsUpdate = true;
    } else if (this.laserLine) {
      this.laserLine.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }

  renderCanvas3D(targets, interceptors, explosions, laserActive, sweepAngle) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
    const h = this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
    const cx = w / 2;
    const cy = h * 0.65;

    ctx.fillStyle = '#060a10';
    ctx.fillRect(0, 0, w, h);

    // 1. Draw 3D Grid Planes
    ctx.strokeStyle = 'rgba(20, 50, 74, 0.4)';
    ctx.lineWidth = 1;
    for (let i = -300; i <= 300; i += 60) {
      const p1 = this.project(i, 0, -300, cx, cy);
      const p2 = this.project(i, 0, 300, cx, cy);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const p3 = this.project(-300, 0, i, cx, cy);
      const p4 = this.project(300, 0, i, cx, cy);
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.stroke();
    }

    // 2. Defended Base Center
    const baseP = this.project(0, 0, 0, cx, cy);
    ctx.beginPath();
    ctx.arc(baseP.x, baseP.y, 16 * baseP.scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.2)';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // 3. Draw 3D Targets & Smoke Trails
    targets.forEach(t => {
      if (!t.active) return;
      const tp = this.project(t.x, t.z, -t.y, cx, cy);
      const shadowP = this.project(t.x, 0, -t.y, cx, cy);

      // Shadow on ground
      ctx.beginPath();
      ctx.arc(shadowP.x, shadowP.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();

      // Altitude line
      ctx.beginPath();
      ctx.moveTo(shadowP.x, shadowP.y);
      ctx.lineTo(tp.x, tp.y);
      ctx.strokeStyle = 'rgba(255, 42, 75, 0.4)';
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Missile Body & Flare
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 6 * tp.scale, 0, Math.PI * 2);
      ctx.fillStyle = '#ff2a4b';
      ctx.shadowColor = '#ff2a4b';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = '#ff2a4b';
      ctx.font = `bold ${Math.round(11 * window.devicePixelRatio)}px monospace`;
      ctx.fillText(`TGT-${t.id} [ALT: ${Math.round(t.z)}m]`, tp.x + 10, tp.y - 6);

      // Laser Designator Beam
      if (laserActive) {
        ctx.beginPath();
        ctx.moveTo(baseP.x, baseP.y - 10);
        ctx.lineTo(tp.x, tp.y);
        ctx.strokeStyle = 'rgba(255, 0, 80, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // 4. Draw Interceptor Flyout
    if (interceptors) {
      interceptors.forEach(itc => {
        if (!itc.active) return;
        const ip = this.project(itc.x, itc.z, -itc.y, cx, cy);

        ctx.beginPath();
        ctx.arc(ip.x, ip.y, 5 * ip.scale, 0, Math.PI * 2);
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#00e5ff';
        ctx.font = `bold ${Math.round(10 * window.devicePixelRatio)}px monospace`;
        ctx.fillText(`SAM-${itc.id}`, ip.x + 8, ip.y - 6);
      });
    }

    // 5. Explosions
    if (explosions) {
      explosions.forEach(exp => {
        const ep = this.project(exp.x, exp.z, -exp.y, cx, cy);
        ctx.beginPath();
        ctx.arc(ep.x, ep.y, exp.radius * ep.scale * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 140, 0, ${exp.alpha * 0.7})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ep.x, ep.y, exp.radius * ep.scale * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 220, ${exp.alpha * 0.9})`;
        ctx.fill();
      });
    }
  }
}

window.Tactical3DRenderer = Tactical3DRenderer;
