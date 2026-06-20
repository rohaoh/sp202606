// renderer.js
// Three.js는 node_modules에서 ESM import 대신 script 태그 없이
// require 방식으로 쓰기 위해 CDN 대신 로컬 사용.
// Electron renderer에서는 require 가능 (preload에서 contextIsolation=true라도
// window.physics는 이미 노출되어 있음)

// Three.js를 동적 import (ESM)
// index.html에서 <script src="renderer.js"> 로 로드되므로 top-level await 불가.
// IIFE로 감싸서 사용.

(async () => {
  // ── Three.js 동적 로드 ─────────────────────────
  // node_modules/three/build/three.module.js 사용
  const THREE = await import('./node_modules/three/build/three.module.js');

  // ── DOM 참조 ───────────────────────────────────
  const selFalling  = document.getElementById('sel-falling');
  const selTarget   = document.getElementById('sel-target');
  const heightRange = document.getElementById('height-range');
  const heightDisp  = document.getElementById('height-display');
  const airRange    = document.getElementById('air-range');
  const airDisp     = document.getElementById('air-display');
  const btnRun      = document.getElementById('btn-run');
  const container   = document.getElementById('canvas-container');
  const statusBadge = document.getElementById('status-badge');
  const overlayInfo = document.getElementById('overlay-info');
  const liveT       = document.getElementById('live-t');
  const liveH       = document.getElementById('live-h');
  const liveV       = document.getElementById('live-v');

  // 결과 DOM
  const resultPlaceholder = document.getElementById('result-placeholder');
  const resultContent     = document.getElementById('result-content');
  const rVt    = document.getElementById('r-vt');
  const rVi    = document.getElementById('r-vi');
  const rJ     = document.getElementById('r-j');
  const rF     = document.getElementById('r-f');
  const rP     = document.getElementById('r-p');
  const rLevel = document.getElementById('r-level');
  const barFill = document.getElementById('bar-fill');
  const trajCanvas = document.getElementById('traj-canvas');

  // ── 프리셋 목록 로드 ───────────────────────────
  const fallingObjects = await window.physics.getFallingObjects();
  const targetObjects  = await window.physics.getTargetObjects();

  fallingObjects.forEach((o, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${o.name}  (${o.mass} kg)`;
    selFalling.appendChild(opt);
  });
  targetObjects.forEach((o, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${o.name}  (항복강도 ${o.yieldStrength} MPa)`;
    selTarget.appendChild(opt);
  });

  // ── 슬라이더 실시간 표시 ───────────────────────
  heightRange.addEventListener('input', () => {
    heightDisp.textContent = Number(heightRange.value).toLocaleString();
  });
  airRange.addEventListener('input', () => {
    airDisp.textContent = Number(airRange.value).toFixed(3);
  });

  // ── Three.js 씬 셋업 ───────────────────────────
  const scene    = new THREE.Scene();
  const camera   = new THREE.PerspectiveCamera(50, 1, 0.1, 50000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // 조명
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(0x7eb3ff, 1.2);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  // 바닥 그리드
  const grid = new THREE.GridHelper(200, 40, 0x1e2d45, 0x1e2d45);
  scene.add(grid);

  // 바닥 면 (충돌 대상 표현)
  const groundGeo  = new THREE.PlaneGeometry(200, 200);
  const groundMat  = new THREE.MeshStandardMaterial({
    color: 0x1a2435, transparent: true, opacity: 0.7
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // 낙하 물체 (구로 대표)
  const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
  const sphereMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3, metalness: 0.4 });
  const sphere    = new THREE.Mesh(sphereGeo, sphereMat);
  scene.add(sphere);
  sphere.visible = false;

  // 충격 파티클 (간단한 폭발 효과)
  let particles = null;

  function createImpactEffect(destructionRatio) {
    if (particles) { scene.remove(particles); particles = null; }
    const count   = Math.floor(destructionRatio * 80) + 10;
    const geo     = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i*3]   = 0;
      positions[i*3+1] = 0;
      positions[i*3+2] = 0;
      velocities.push({
        x: (Math.random()-0.5)*8*destructionRatio,
        y: Math.random()*10*destructionRatio,
        z: (Math.random()-0.5)*8*destructionRatio,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xf59e0b, size: 0.5, transparent: true, opacity: 0.9 });
    particles = new THREE.Points(geo, mat);
    particles._vel = velocities;
    particles._age = 0;
    scene.add(particles);
  }

  // 리사이즈 대응
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(container);

  // ── 애니메이션 상태 ────────────────────────────
  let animState = null;   // null: idle / object: animating
  let frameId   = null;

  function renderLoop() {
    frameId = requestAnimationFrame(renderLoop);

    if (animState) {
      const { trajectory, startTime, scaleY, result } = animState;
      const elapsed = (performance.now() - startTime) / 1000; // 실제 경과 초

      // 시뮬레이션 시간 기준으로 현재 프레임 찾기
      // 실제 시간을 3배 느리게 보여줌 (시각화)
      const simTime = elapsed * (trajectory[trajectory.length-1].time / Math.max(elapsed * 3, 0.001));
      const playTime = elapsed / 3 * trajectory[trajectory.length-1].time; // 재생 속도 조절

      const frame = trajectory.find(f => f.time >= playTime) || trajectory[trajectory.length-1];
      const done  = playTime >= trajectory[trajectory.length-1].time;

      if (!done) {
        sphere.visible = true;
        sphere.position.y = frame.altitude * scaleY;

        // 카메라: 물체를 따라 부드럽게 이동
        const targetCamY = sphere.position.y + 8;
        camera.position.y += (targetCamY - camera.position.y) * 0.05;

        // 오버레이 업데이트
        liveT.textContent = frame.time.toFixed(2);
        liveH.textContent = frame.altitude.toFixed(1);
        liveV.textContent = frame.velocity.toFixed(2);
      } else {
        // 충돌!
        sphere.visible = false;
        if (!animState.impacted) {
          animState.impacted = true;
          createImpactEffect(result.destructionRatio);
          camera.position.set(20, 10, 20);
          camera.lookAt(0, 0, 0);
          statusBadge.textContent = `충돌! — ${result.destructionLevel}`;
        }
      }

      // 파티클 업데이트
      if (particles) {
        particles._age += 0.016;
        const pos = particles.geometry.attributes.position.array;
        for (let i = 0; i < particles._vel.length; i++) {
          pos[i*3]   += particles._vel[i].x * 0.05;
          pos[i*3+1] += particles._vel[i].y * 0.05 - 0.1;
          pos[i*3+2] += particles._vel[i].z * 0.05;
        }
        particles.geometry.attributes.position.needsUpdate = true;
        particles.material.opacity = Math.max(0, 0.9 - particles._age * 0.3);
        if (particles._age > 3) { scene.remove(particles); particles = null; }
      }
    }

    renderer.render(scene, camera);
  }

  // 초기 카메라 위치
  camera.position.set(20, 30, 40);
  camera.lookAt(0, 0, 0);
  renderLoop();

  // ── 결과 표시 ─────────────────────────────────
  function showResults(result) {
    resultPlaceholder.style.display = 'none';
    resultContent.style.display     = 'flex';

    rVt.textContent = result.terminalVelocity.toFixed(2);
    rVi.textContent = result.impactVelocity.toFixed(2);
    rJ.textContent  = result.impactMomentum.toFixed(1);
    rF.textContent  = (result.impactForce / 1000).toFixed(2);
    rP.textContent  = result.impactPressure.toFixed(3);
    rLevel.textContent = result.destructionLevel;

    // 파괴율 바
    const pct = (result.destructionRatio * 100).toFixed(1);
    barFill.style.width = pct + '%';
    barFill.className = 'bar-fill' + (result.destructionRatio > 0.6 ? ' danger' : '');

    // 파괴 레벨 색상
    const levelMap = { '무손상': 0, '경미한 손상': 1, '중파': 2, '심각한 파손': 3, '완전 파괴': 4 };
    rLevel.className = `destruction-level level-${levelMap[result.destructionLevel] ?? 2}`;

    // 궤적 그래프 (속도 – 시간)
    drawTrajectoryGraph(result.trajectory);
  }

  function drawTrajectoryGraph(trajectory) {
    const dpr = window.devicePixelRatio || 1;
    const W = trajCanvas.offsetWidth, H = trajCanvas.offsetHeight;
    trajCanvas.width  = W * dpr;
    trajCanvas.height = H * dpr;
    const ctx = trajCanvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const maxT = trajectory[trajectory.length-1].time;
    const maxV = Math.max(...trajectory.map(f => f.velocity));
    const pad  = { l: 36, r: 10, t: 10, b: 24 };
    const gW   = W - pad.l - pad.r;
    const gH   = H - pad.t - pad.b;

    // 배경
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);

    // 그리드
    ctx.strokeStyle = '#1e2d45';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + gH * (1 - i/4);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + gW, y); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '9px Consolas';
      ctx.fillText((maxV * i/4).toFixed(0), 2, y + 3);
    }

    // 속도 곡선
    const grad = ctx.createLinearGradient(pad.l, 0, pad.l + gW, 0);
    grad.addColorStop(0, '#3b82f6');
    grad.addColorStop(1, '#f59e0b');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    trajectory.forEach((f, i) => {
      const x = pad.l + (f.time / maxT) * gW;
      const y = pad.t + gH * (1 - f.velocity / maxV);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 축 레이블
    ctx.fillStyle = '#64748b';
    ctx.font = '9px Consolas';
    ctx.fillText('v (m/s)', 2, pad.t + 6);
    ctx.fillText('t (s)', pad.l + gW - 20, H - 4);
    ctx.fillText('0', pad.l - 10, H - pad.b + 3);
    ctx.fillText(maxT.toFixed(1), pad.l + gW - 18, H - pad.b + 12);
  }

  // ── 실행 버튼 ─────────────────────────────────
  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    btnRun.textContent = '⏳ 계산 중...';
    statusBadge.textContent = '물리 계산 중...';
    overlayInfo.style.display = 'block';

    const falling = fallingObjects[+selFalling.value];
    const target  = targetObjects[+selTarget.value];
    const height  = +heightRange.value;
    const airDensity = +airRange.value;

    const response = await window.physics.simulate({
      falling, target, height, airDensity, gravity: 9.81
    });

    btnRun.disabled = false;
    btnRun.textContent = '▶ 시뮬레이션 실행';

    if (!response.ok) {
      alert('오류: ' + response.error);
      return;
    }

    const result = response.data;
    showResults(result);

    // 물체 크기 조정 (반지름 기반)
    const r = falling.radius;
    sphere.scale.setScalar(r);
    sphere.position.set(0, height, 0);

    // 카메라 초기화
    const camDist = Math.max(height * 0.5, 30);
    camera.position.set(camDist * 0.5, height + 10, camDist);
    camera.lookAt(0, height / 2, 0);

    // 시각적 높이 스케일 (너무 높으면 압축)
    const scaleY = height > 200 ? 200 / height : 1;
    sphere.position.y = height * scaleY;

    // 애니메이션 시작
    animState = {
      trajectory: result.trajectory,
      startTime:  performance.now(),
      scaleY,
      result,
      impacted: false,
    };

    statusBadge.textContent = '낙하 중...';
  });

})();
