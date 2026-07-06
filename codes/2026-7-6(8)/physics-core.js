/**
 * 공유 순수 물리 계산 모듈
 * UI/DOM에 의존하지 않는 순수 함수만 포함하며, 메인 렌더러 스레드와
 * sim-worker.js(Web Worker) 양쪽에서 동일한 코드로 로드되어 사용됩니다.
 * (전역 스크립트 — index.html의 <script> 태그와 sim-worker.js의 importScripts
 * 양쪽에서 로드되므로 import/export 문법을 쓰지 않습니다.)
 */

// 대기압/밀도는 고도가 높아질수록 지수함수적으로 감소한다(barometric formula).
// 층마다 온도가 달라 스케일 하이트(H = R*T/g)도 달라지므로, 경계에서 이전 층 값을
// 이어받아 그 층 고유의 스케일 하이트로 연속적으로 지수 감소시킨다(physics.cpp와 동일).
function pcAirDensity(alt, tempOffset, humidity, atmosphereOn) {
  if (!atmosphereOn) return 1.225;
  if (alt < 0) alt = 0;
  const R = 287.05, grav = 9.80665, L0 = 0.0065;
  const T0 = 288.15 + tempOffset, P0 = 101325;
  let T, P;
  if (alt <= 11000) {
    T = T0 - L0 * alt;
    const H0 = R * T0 / grav;
    P = P0 * Math.exp(-alt / H0);
  } else {
    const T11 = T0 - L0 * 11000;
    const H0 = R * T0 / grav;
    const P11 = P0 * Math.exp(-11000 / H0);
    if (alt <= 20000) {
      T = T11; P = P11 * Math.exp(-grav * (alt - 11000) / (R * T11));
    } else {
      const P20 = P11 * Math.exp(-grav * 9000 / (R * T11));
      if (alt <= 32000) {
        const L2 = 0.001; T = T11 + L2 * (alt - 20000);
        const H20 = R * T11 / grav; // T20 == T11 (20km 온도 = 11km 등온층 종료 온도)
        P = P20 * Math.exp(-(alt - 20000) / H20);
      } else if (alt <= 47000) {
        // physics.cpp와 동일한 2단 스케일 하이트(32-47km, 47-80km)를 쓴다.
        // 이전에는 32-80km 전체를 스케일 하이트 10000m 하나로 뭉뚱그려 C++쪽과
        // 값이 어긋났음.
        return pcAirDensity(32000, tempOffset, 0, atmosphereOn) * Math.exp(-(alt - 32000) / 6500);
      } else if (alt <= 80000) {
        return pcAirDensity(47000, tempOffset, 0, atmosphereOn) * Math.exp(-(alt - 47000) / 7000);
      } else { return 1e-5; }
    }
  }
  let rho = P / (R * T);
  if (humidity > 0 && alt < 20000) {
    const Tc = T - 273.15, es = 611.2 * Math.exp(17.67 * Tc / (Tc + 243.04)), e = (humidity / 100) * es;
    rho *= (1 - 0.378 * e / P);
  }
  return Math.max(rho, 1e-5);
}

function pcAtmName(alt, atmosphereOn) {
  if (!atmosphereOn) return 'Troposphere';
  if (alt < 11000) return 'Troposphere';
  if (alt < 20000) return 'Lower Stratosphere';
  if (alt < 32000) return 'Upper Stratosphere';
  if (alt < 50000) return 'Stratopause';
  if (alt < 80000) return 'Mesosphere';
  return 'Near Vacuum';
}

// 균등 stride 다운샘플. 첫·마지막 프레임은 항상 포함해 시작/충돌 시점을 보존한다.
function pcDownsampleFrames(frames, maxN) {
  const n = frames.length;
  if (n <= maxN) return frames;
  const stride = Math.ceil(n / maxN);
  const out = [];
  for (let i = 0; i < n; i += stride) out.push(frames[i]);
  if (out[out.length - 1] !== frames[n - 1]) out.push(frames[n - 1]);
  return out;
}

const PC_DT_SIM = 0.05;
const PC_DISP_FRAME_CAP = 3000;

/**
 * 낙하 물리 시뮬레이션 (순수 함수, UI 상태에 의존하지 않음)
 * @param {Object} p - {mass,area,cd,h0,v0,g,wx,wz,tempOff,hum,launchAngle,launchAzimuth,
 *                       slopeDeg,omega,spinAxis,atmosphereOn,heatOn}
 * @returns {Object} {frames,terminalVelocity,impactVelocity,fallTime,timeToTerminal,driftX,driftZ,maxMagnusF}
 */
function runFallSimulation(p) {
  const m = p.mass, A = p.area, Cd = p.cd;
  const h0 = p.h0, v0 = p.v0, g = p.g;
  const wx = p.wx || 0, wz = p.wz || 0;
  const tempOff = p.tempOff || 0, hum = p.hum ?? 50;
  const launchRad = (p.launchAngle ?? 90) * Math.PI / 180;
  const azimRad = (p.launchAzimuth || 0) * Math.PI / 180;
  let vy = -(v0 * Math.sin(launchRad));
  let vx = v0 * Math.cos(launchRad) * Math.sin(azimRad);
  let vz = v0 * Math.cos(launchRad) * Math.cos(azimRad);
  const slopeRad = (p.slopeDeg || 0) * Math.PI / 180;
  const gVert = g * Math.cos(slopeRad), gSlope = g * Math.sin(slopeRad);
  const omega = p.omega || 0;
  const CL = 0.25, spinAxis = p.spinAxis || [0, 0, 1];
  const sx = spinAxis[0], sy = spinAxis[1], sz = spinAxis[2];
  const atmosphereOn = !!p.atmosphereOn, heatOn = !!p.heatOn;
  let h = h0, posX = 0, posZ = 0, t = 0;
  const frames = []; let ttReached = null; let maxMagnusF = 0;
  const rhoSea = pcAirDensity(0, tempOff, hum, atmosphereOn);
  const vtSea = Math.sqrt((2 * m * gVert) / (rhoSea * Cd * A));
  while (h > 0 && t < 7200) {
    const rho = pcAirDensity(h, tempOff, hum, atmosphereOn);
    const vRelX = vx - wx, vRelY = vy, vRelZ = vz - wz;
    const vRelMag = Math.sqrt(vRelX * vRelX + vRelY * vRelY + vRelZ * vRelZ);
    const dragCoeff = 0.5 * rho * Cd * A * vRelMag;
    let ax = gSlope - (dragCoeff * vRelX) / m;
    let ay = gVert - (dragCoeff * vRelY) / m;
    let az = -(dragCoeff * vRelZ) / m;
    if (omega > 0.001) {
      const fs = 0.5 * CL * rho * A * omega / m;
      const mAx = fs * (sy * vz - sz * vy), mAy = fs * (sz * vx - sx * vz), mAz = fs * (sx * vy - sy * vx);
      ax += mAx; ay += mAy; az += mAz;
      maxMagnusF = Math.max(maxMagnusF, m * Math.hypot(mAx, mAy, mAz));
    }
    const vtL = rho > 1e-10 ? Math.sqrt((2 * m * gVert) / (rho * Cd * A)) : 1e9;
    const speed = Math.sqrt(vy * vy + vx * vx + vz * vz);
    const T_atm = Math.max(180, 288.15 + tempOff - 0.0065 * Math.max(h, 0));
    const c_sound = Math.sqrt(1.4 * 287 * T_atm);
    const Ma = speed / c_sound;
    const T_stag = T_atm * (1 + 0.2 * Ma * Ma);
    const R_nose = Math.sqrt(A / Math.PI);
    const heatFlux = heatOn && rho > 1e-10
      ? 1.83e-4 * speed * speed * speed * Math.sqrt(rho / Math.max(R_nose, 0.01)) : 0;
    const T_rad = heatFlux > 0 ? Math.pow(heatFlux / (5.67e-8 * 0.9), 0.25) : 0;
    const T_surface = Math.max(T_atm, T_rad, T_stag) - 273.15;
    frames.push({ t, v: vy, h, a: ay, rho, atm: pcAtmName(h, atmosphereOn), px: posX, pz: posZ, heatFlux, T_surface });
    if (!ttReached && Math.abs(vy) >= vtL * 0.99) ttReached = t;
    vy += ay * PC_DT_SIM; h -= vy * PC_DT_SIM;
    vx += ax * PC_DT_SIM; posX += vx * PC_DT_SIM;
    vz += az * PC_DT_SIM; posZ += vz * PC_DT_SIM;
    t = Math.round((t + PC_DT_SIM) * 1000) / 1000;
  }
  const last = frames[frames.length - 1];
  const dispFrames = pcDownsampleFrames(frames, PC_DISP_FRAME_CAP);
  return {
    frames: dispFrames, terminalVelocity: vtSea, impactVelocity: Math.abs(last.v),
    fallTime: last.t, timeToTerminal: ttReached ?? last.t,
    driftX: last.px, driftZ: last.pz, maxMagnusF
  };
}
