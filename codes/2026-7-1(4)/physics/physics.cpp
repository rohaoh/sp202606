#define _USE_MATH_DEFINES
#include "physics.h"
#include <cmath>
#include <algorithm>
#include <stdexcept>
#include <random>

std::vector<FallingObject> PhysicsEngine::getPresetFallingObjects() {
    return {
        {"Bowling Ball",     7.0,    0.47, 0.0573, 0.135},
        {"Human (Freefall)", 70.0,   1.0,  0.70,   0.30},
        {"Small Car",        1200.0, 0.30, 2.20,   0.90},
        {"Meteor (1m)",      2000.0, 0.47, 0.785,  0.50},
        {"Piano",            300.0,  1.20, 1.50,   0.70},
        {"Refrigerator",     80.0,   1.05, 0.60,   0.40},
        {"Iron Ball (50cm)", 500.0,  0.47, 0.196,  0.25},
    };
}

std::vector<TargetObject> PhysicsEngine::getPresetTargetObjects() {
    return {
        {"Wooden Board",   40.0,  0.10, "wood",     "fracture"},
        {"Concrete Floor", 30.0,  0.40, "concrete", "fracture"},
        {"Steel Plate",    250.0, 0.02, "steel",    "deform"},
        {"Glass",          7.0,   0.012,"glass",    "shatter"},
        {"Brick Wall",     10.0,  0.40, "brick",    "fracture"},
        {"Car Roof",       180.0, 0.004,"steel",    "deform"},
    };
}

double PhysicsEngine::calcAirDensity(double alt, double tempOffset, double humidity) {
    if (alt < 0) alt = 0;
    const double Rd = 287.05, g = 9.80665, L0 = 0.0065;
    const double T0 = 288.15 + tempOffset;
    const double P0 = 101325.0;
    double T = 0.0, P = 0.0;
    if (alt <= 11000.0) {
        T = T0 - L0 * alt;
        P = P0 * std::pow(T / T0, g / (Rd * L0));
    } else if (alt <= 20000.0) {
        double T11 = T0 - L0 * 11000.0;
        double P11 = P0 * std::pow(T11 / T0, g / (Rd * L0));
        T = T11;
        P = P11 * std::exp(-g * (alt - 11000.0) / (Rd * T11));
    } else if (alt <= 32000.0) {
        double T11 = T0 - L0 * 11000.0;
        double P11 = P0 * std::pow(T11 / T0, g / (Rd * L0));
        double P20 = P11 * std::exp(-g * 9000.0 / (Rd * T11));
        double T20 = T11;  // 20km temp = end of isothermal layer at 11km (matches JS)
        double L2  = 0.001;
        T = T20 + L2 * (alt - 20000.0);
        P = P20 * std::pow(T / T20, -g / (Rd * L2));
    } else if (alt <= 47000.0) {
        // ISA layer 3: Upper Stratosphere, lapse rate +2.8°C/km (warming)
        double rho32 = calcAirDensity(32000.0, tempOffset, 0.0);
        // Use barometric formula with scale height approximation
        double scaleH = 6500.0;
        return rho32 * std::exp(-(alt - 32000.0) / scaleH);
    } else if (alt <= 80000.0) {
        double rho47 = calcAirDensity(47000.0, tempOffset, 0.0);
        double scaleH = 7000.0;
        return rho47 * std::exp(-(alt - 47000.0) / scaleH);
    } else {
        return 1e-5;
    }
    double rho = P / (Rd * T);
    if (humidity > 0.0 && T > 200.0) {
        double Tc  = T - 273.15;
        double e_s = 611.2 * std::exp(17.67 * Tc / (Tc + 243.04));
        double e   = (humidity / 100.0) * e_s;
        rho *= (1.0 - 0.378 * e / P);
    }
    return std::max(rho, 1e-5);
}

std::string PhysicsEngine::getAtmosphereName(double alt) {
    if (alt < 0)     return "Underground";
    if (alt < 11000) return "Troposphere";
    if (alt < 20000) return "Lower Stratosphere";
    if (alt < 32000) return "Upper Stratosphere";
    if (alt < 47000) return "Stratopause Region";
    if (alt < 80000) return "Mesosphere";
    return "Near Vacuum";
}

double PhysicsEngine::calcTerminalVelocityAtAlt(
    const FallingObject& obj, double altitude, double gravity,
    double tempOffset, double humidity)
{
    double rho = calcAirDensity(altitude, tempOffset, humidity);
    if (rho < 1e-10) return 1e9;
    return std::sqrt((2.0 * obj.mass * gravity) / (rho * obj.cd * obj.area));
}

// ─── 새로운 헬퍼 함수들 ───

// Reynolds 수 계산
static double calcReynoldsNumber(double velocity, double diameter, double rho, double tempOffset) {
    if (rho < 1e-10) return 1e-5;
    // 동점성 계수 (m²/s) at sea level, 15°C
    double T = 288.15 + tempOffset;
    double mu = 1.81e-5 * std::pow(T / 288.15, 1.5) * (288.15 + 110.4) / (T + 110.4);
    double nu = mu / rho;
    return std::abs(velocity) * diameter / nu;
}

// Reynolds 수 기반 드래그 계수 조정
static double adjustCdForReynolds(double baseCd, double Re) {
    // 저 Reynolds 수에서는 드래그가 더 크다
    if (Re < 1.0) return baseCd * (24.0 / (Re + 0.1) + 0.5);
    if (Re < 1000.0) {
        double correction = 1.0 + 0.15 * std::pow(Re, 0.681);
        return baseCd * correction;
    }
    return baseCd; // 고 Reynolds 수에서는 기본값
}

// 물 저항 계산
static double calcWaterDrag(double velocity, double depth, double rho) {
    if (depth <= 0) return 0.0;
    double waterRho = 1000.0; // 물의 밀도
    double submerged = std::min(1.0, depth / 1.0); // 최대 1m 침수로 정규화
    double waterDragFactor = 20.0 * submerged; // 공기 저항보다 20배 크다
    return waterDragFactor * waterRho * velocity * std::abs(velocity);
}

// Coriolis 효과 계산
static double calcCoriolisAccel(double velocity, double latitude, int axis) {
    const double OMEGA_EARTH = 7.2921e-5; // 지구 자전각속도 (rad/s)
    double lat_rad = latitude * M_PI / 180.0;
    double Omega_z = OMEGA_EARTH * std::sin(lat_rad);
    double Omega_x = OMEGA_EARTH * std::cos(lat_rad);

    if (axis == 0) return 2.0 * Omega_z * velocity; // X 축 (동쪽) 편향
    if (axis == 1) return -2.0 * Omega_x * velocity; // Y 축 (남/북)
    return 0.0;
}

// 고도별 중력 변화 (중요하지 않지만 정확성 향상)
static double calcGravityAtAltitude(double alt, double lat) {
    double lat_rad = lat * M_PI / 180.0;
    double g0 = 9.780318 + 0.0053024 * std::sin(lat_rad) * std::sin(lat_rad);
    g0 -= 0.0000058 * std::sin(2.0 * lat_rad) * std::sin(2.0 * lat_rad);
    g0 -= 0.000000003 * alt;
    return g0;
}

ImpactResult PhysicsEngine::simulate(const SimInput& input) {
    if (input.height <= 0)
        throw std::invalid_argument("Height must be greater than 0.");

    const FallingObject& obj = input.falling;
    const double dt  = 0.05;
    const double Wx  = input.windX;
    const double Wz  = input.windZ;

    // [F13] Projectile: decompose initial velocity into components
    const double launchRad = input.launchAngle * M_PI / 180.0;
    const double azimRad   = input.launchAzimuth * M_PI / 180.0;
    double vy = -(input.v0 * std::sin(launchRad));
    double vx =   input.v0 * std::cos(launchRad) * std::sin(azimRad);
    double vz =   input.v0 * std::cos(launchRad) * std::cos(azimRad);

    // [F12] Slope: add gravity component along slope direction
    const double slopeRad    = input.terrainSlope * M_PI / 180.0;
    const double g_vert_eff  = input.gravity * std::cos(slopeRad);
    const double g_slope     = input.gravity * std::sin(slopeRad);

    double altitude = input.height;
    double posX = 0.0, posZ = 0.0;
    double spinRate = input.spinRate;
    double t = 0.0;
    double totalEnergyLoss = 0.0;

    std::vector<PhysicsFrame> traj;
    traj.reserve(20000);

    while (altitude > 0.0 && t < 7200.0) {
        double rho = calcAirDensity(altitude, input.tempOffset, input.humidity);
        // 신규: 고도별 중력 변화
        double g_local = calcGravityAtAltitude(altitude, input.latitude);

        // Use total relative velocity for drag
        double vRelX   = vx - Wx;
        double vRelY   = vy;
        double vRelZ   = vz - Wz;
        double vRelMag = std::sqrt(vRelX*vRelX + vRelY*vRelY + vRelZ*vRelZ);

        // 신규: Reynolds 수 기반 드래그 계수 조정
        double Re = calcReynoldsNumber(vRelMag, obj.radius * 2.0, rho, input.tempOffset);
        double adjustedCd = adjustCdForReynolds(obj.cd, Re);
        double dragBase = 0.5 * rho * adjustedCd * obj.area * vRelMag;

        // 신규: 물 저항 추가
        double waterDepth = std::max(0.0, input.waterDepth - (input.height - altitude));
        double waterDragForce = 0.0;
        if (waterDepth > 0.0) {
            waterDragForce = calcWaterDrag(vRelMag, waterDepth, rho) / obj.mass;
            dragBase += waterDragForce; // 물 저항을 드래그에 포함
        }

        double accel_x = -(dragBase * vRelX) / obj.mass + g_slope;
        double accel_y = -(dragBase * vRelY) / obj.mass - g_local;
        double accel_z = -(dragBase * vRelZ) / obj.mass;

        // 신규: Coriolis 효과
        accel_x += calcCoriolisAccel(vy, input.latitude, 0);
        accel_y += calcCoriolisAccel(vx, input.latitude, 1);

        // [F7] Magnus effect: F = 0.5 * C_L * rho * A * omega * (spinAxis × v)
        // 신규: 회전 감쇠 추가
        if (spinRate > 0.001) {
            const double CL = 0.25;
            double sx = input.spinAxisX, sy = input.spinAxisY, sz = input.spinAxisZ;
            double fscale = 0.5 * CL * rho * obj.area * spinRate / obj.mass;
            accel_x += fscale * (sy * vz - sz * vy);
            accel_y += fscale * (sz * vx - sx * vz);
            accel_z += fscale * (sx * vy - sy * vx);

            // 신규: 공기 저항으로 인한 회전 감쇠
            spinRate *= std::exp(-rho * obj.area * dt / (obj.mass * 0.5));
        }

        PhysicsFrame frame;
        frame.time         = t;
        frame.velocity     = vy;
        frame.altitude     = altitude;
        frame.dragForce    = dragBase * vRelMag;
        frame.netForce     = obj.mass * accel_y;
        frame.airDensity   = rho;
        frame.atmosphere   = getAtmosphereName(altitude);
        frame.posX         = posX;
        frame.posZ         = posZ;
        frame.spinRate     = spinRate;
        frame.reynoldsNumber = Re;
        frame.energyLoss   = totalEnergyLoss;
        traj.push_back(frame);

        // 신규: 에너지 손실 추적
        double energyBefore = 0.5 * obj.mass * (vx*vx + vy*vy + vz*vz);

        vy       += accel_y * dt;
        altitude -= vy * dt;
        vx       += accel_x * dt;
        vz       += accel_z * dt;
        posX     += vx * dt;
        posZ     += vz * dt;

        double energyAfter = 0.5 * obj.mass * (vx*vx + vy*vy + vz*vz);
        totalEnergyLoss += std::max(0.0, energyBefore - energyAfter);

        t        += dt;
    }

    double impactV = traj.empty() ? vy : traj.back().velocity;
    ImpactResult result = calcImpact(input, impactV, traj);
    result.totalEnergyLoss = totalEnergyLoss;
    result.coriolisDeflection = posX; // 동쪽 편향
    return result;
}

ImpactResult PhysicsEngine::calcImpact(
    const SimInput& input, double impactVelocity,
    const std::vector<PhysicsFrame>& traj)
{
    const FallingObject& obj    = input.falling;
    const TargetObject&  target = input.target;

    double J = obj.mass * impactVelocity;

    // Collision time decreases at higher impact velocities — faster impacts generate
    // shorter force pulses, which raises peak force for the same momentum.
    double baseTime = 0.001 + 0.009 * (target.yieldStrength / 250.0);
    double velFactor = std::max(0.15, std::min(1.0, 20.0 / (std::abs(impactVelocity) + 1e-6)));
    double collisionTime = std::clamp(baseTime * velFactor, 0.0002, 0.02);
    double F_avg = J / collisionTime;

    double contactArea   = M_PI * obj.radius * obj.radius;
    if (contactArea < 1e-6) contactArea = 1e-6;
    double pressure_Pa   = F_avg / contactArea;
    double pressure_MPa  = pressure_Pa / 1e6;

    // Thickness-based effective yield: sqrt scale relative to 10 cm reference
    const double refThickness = 0.1;
    double thicknessRatio  = target.thickness / refThickness;
    if (thicknessRatio < 0.05) thicknessRatio = 0.05;
    double thicknessFactor = std::sqrt(thicknessRatio);

    // Brittle materials (shatter mode) fail at much lower average pressure due to
    // low fracture toughness and stress concentration under dynamic impact.
    double brittleFactor = (target.fractureMode == "shatter") ? 8.0 : 1.0;
    double effectiveYield  = target.yieldStrength * thicknessFactor / brittleFactor;

    double rawRatio = pressure_MPa / effectiveYield;
    double destructionRatio;
    if (rawRatio <= 1.0) {
        destructionRatio = 0.0;
    } else {
        destructionRatio = 1.0 - std::exp(-1.1 * (rawRatio - 1.0));
    }
    destructionRatio = std::clamp(destructionRatio, 0.0, 1.0);

    std::string level;
    if (destructionRatio <= 0.001)     level = "Withstood";
    else if (destructionRatio < 0.30)  level = "Minor Damage";
    else if (destructionRatio < 0.55)  level = "Moderate Damage";
    else if (destructionRatio < 0.80)  level = "Severe Damage";
    else                               level = "Total Destruction";

    // 신규: 바운스 물리
    double bounceVelocity = 0.0;
    double bounceCount = 0.0;
    double bounceDamping = std::clamp(input.bounceDamping, 0.0, 1.0);

    // 바운스 계수 (파괴도에 따라 감소)
    double coefficientOfRestitution = (1.0 - destructionRatio * 0.8) * (1.0 - bounceDamping);
    if (coefficientOfRestitution > 0.05) {
        bounceVelocity = std::abs(impactVelocity) * coefficientOfRestitution;
        bounceCount = 1.0;

        // 연쇄 바운스 (0.05 이하가 될 때까지)
        double currentV = bounceVelocity;
        while (currentV > 0.5 && bounceCount < 10.0) {
            currentV *= coefficientOfRestitution;
            bounceCount += 1.0;
        }
    }

    ImpactResult result;
    result.terminalVelocity = calcTerminalVelocityAtAlt(
        input.falling, 0, input.gravity, input.tempOffset, input.humidity);
    result.impactVelocity   = impactVelocity;
    result.impactMomentum   = J;
    result.impactForce      = F_avg;
    result.impactPressure   = pressure_MPa;
    result.impactEnergy     = 0.5 * obj.mass * impactVelocity * impactVelocity;
    result.destructionRatio = destructionRatio;
    result.destructionLevel = level;
    result.trajectory       = traj;
    result.bounceVelocity   = bounceVelocity;
    result.bounceCount      = bounceCount;
    return result;
}

std::vector<float> PhysicsEngine::buildConvexFragment(float cx, float cy, float cz, float size, int seed) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> jitter(-size*0.35f, size*0.35f);
    std::uniform_real_distribution<float> sc(0.5f, 1.0f);
    std::vector<float> verts;
    int faces = 6+(seed%5);
    for (int i = 0; i < faces; i++) {
        float theta = (float)i/faces*2.0f*(float)M_PI;
        for (int j = 0; j < 3; j++) {
            float phi = ((float)j/3.0f-0.5f)*(float)M_PI;
            float r   = size*sc(rng);
            verts.push_back(cx+r*std::cos(phi)*std::cos(theta)+jitter(rng));
            verts.push_back(cy+r*std::sin(phi)+jitter(rng));
            verts.push_back(cz+r*std::cos(phi)*std::sin(theta)+jitter(rng));
        }
    }
    return verts;
}

std::vector<unsigned int> PhysicsEngine::buildFragmentIndices(int vertexCount) {
    std::vector<unsigned int> idx;
    for (int i = 0; i < vertexCount-2; i++) {
        idx.push_back(0); idx.push_back(i+1); idx.push_back(i+2);
    }
    return idx;
}

FractureResult PhysicsEngine::computeShatter(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "shatter";
    int count = (int)(impact.destructionRatio*100)+20;
    // Seed varies with simulation so each run produces unique fragment patterns
    unsigned int seed = (unsigned int)(impact.impactVelocity * 1000.0 + impact.destructionRatio * 99991.0);
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> pos(-radius*1.5f, radius*1.5f);
    std::uniform_real_distribution<float> vel(-12.0f, 12.0f);
    std::uniform_real_distribution<float> avel(-8.0f, 8.0f);
    for (int i = 0; i < count; i++) {
        float cx = pos(rng), cz = pos(rng);
        float size = radius*0.2f*(0.4f+(float)(rng()%100)/100.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, (int)(seed % 10000) + i);
        frag.indices   = buildFragmentIndices((int)frag.vertices.size()/3);
        frag.position  = {cx, 0.0f, cz};
        frag.velocity  = {vel(rng), std::abs(vel(rng))*2.5f+3.0f, vel(rng)};
        frag.angularVelocity = {avel(rng), avel(rng), avel(rng)};
        frag.rotation  = {0.0f, 0.0f, 0.0f, 1.0f};
        frag.mass      = size*size*0.5f;
        frag.active    = true;
        result.fragments.push_back(frag);
    }
    result.dustParticleCount = count*4;
    return result;
}

FractureResult PhysicsEngine::computeFractureMode(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "fracture";
    int count = (int)(impact.destructionRatio*20)+5;
    unsigned int seed = (unsigned int)(impact.impactEnergy * 0.01 + impact.destructionRatio * 99991.0);
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> pos(-radius*1.2f, radius*1.2f);
    std::uniform_real_distribution<float> vel(-6.0f, 6.0f);
    std::uniform_real_distribution<float> avel(-4.0f, 4.0f);
    for (int i = 0; i < count; i++) {
        float cx = pos(rng), cz = pos(rng);
        float size = radius*0.4f*(0.5f+(float)(rng()%100)/100.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, (int)(seed % 10000) + i + 100);
        frag.indices   = buildFragmentIndices((int)frag.vertices.size()/3);
        frag.position  = {cx, 0.0f, cz};
        frag.velocity  = {vel(rng), std::abs(vel(rng))*1.5f+1.5f, vel(rng)};
        frag.angularVelocity = {avel(rng), avel(rng), avel(rng)};
        frag.rotation  = {0.0f, 0.0f, 0.0f, 1.0f};
        frag.mass      = size*size*2.0f;
        frag.active    = true;
        result.fragments.push_back(frag);
    }
    result.dustParticleCount = count*6;
    return result;
}

FractureResult PhysicsEngine::computeDeform(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "deform";
    float depth = (float)(impact.destructionRatio*radius*1.2f);
    int ring = 10;
    for (int i = 0; i <= ring; i++) {
        float r    = (float)i/ring*radius;
        float disp = -depth*std::exp(-3.0f*r/radius);
        int pts    = std::max(1, i*4);
        for (int j = 0; j < pts; j++) {
            float angle = (float)j/pts*2.0f*(float)M_PI;
            DeformVertex dv;
            dv.index = i*10+j;
            dv.dx    = r*std::cos(angle)*0.05f;
            dv.dy    = disp;
            dv.dz    = r*std::sin(angle)*0.05f;
            result.deformations.push_back(dv);
        }
    }
    result.dustParticleCount = (int)(impact.destructionRatio*40);
    return result;
}

// Metal-like fracture: splits into a small number of large chunks flying outward.
FractureResult PhysicsEngine::computeSplit(const ImpactResult& impact, const TargetObject& target, float radius, int pieces) {
    FractureResult result;
    result.mode = "split";
    if (pieces < 2) pieces = 2;
    unsigned int seed = (unsigned int)(impact.impactForce * 0.001 + pieces * 7);
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> jit(-radius*0.25f, radius*0.25f);
    std::uniform_real_distribution<float> avel(-3.0f, 3.0f);
    for (int i = 0; i < pieces; i++) {
        float angle = (float)i/pieces*2.0f*(float)M_PI + 0.3f;
        float dist  = radius*0.5f;
        float cx = std::cos(angle)*dist + jit(rng);
        float cz = std::sin(angle)*dist + jit(rng);
        float size = radius*0.7f*(0.8f+(float)(rng()%100)/300.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, i*37+3);
        frag.indices   = buildFragmentIndices((int)frag.vertices.size()/3);
        frag.position  = {cx, 0.0f, cz};
        float outV = 3.0f + impact.destructionRatio*4.0f;
        frag.velocity  = {std::cos(angle)*outV, std::abs(avel(rng))*0.6f+2.0f, std::sin(angle)*outV};
        frag.angularVelocity = {avel(rng), avel(rng), avel(rng)};
        frag.rotation  = {0.0f, 0.0f, 0.0f, 1.0f};
        frag.mass      = size*size*3.0f;
        frag.active    = true;
        result.fragments.push_back(frag);
    }
    result.dustParticleCount = pieces*3;
    return result;
}

FractureResult PhysicsEngine::computeFracture(const ImpactResult& impact, const TargetObject& target, float objectRadius) {
    if (impact.destructionRatio < 0.03f) {
        FractureResult r; r.mode="none"; r.dustParticleCount=0; return r;
    }
    if (target.fractureMode == "shatter")  return computeShatter(impact, target, objectRadius);
    if (target.fractureMode == "split")    return computeSplit(impact, target, objectRadius, 3);
    if (target.fractureMode == "deform") {
        if (impact.destructionRatio >= 0.6f) return computeSplit(impact, target, objectRadius, 3);
        return computeDeform(impact, target, objectRadius);
    }
    return computeFractureMode(impact, target, objectRadius);
}

std::vector<FragmentState> PhysicsEngine::stepFragments(
    std::vector<Fragment>& fragments, double dt, double gravity)
{
    // Simple air drag coefficient for fragments (rho=1.225, cd=0.47, area estimated from mass)
    const float AIR_DRAG = 0.5f * 1.225f * 0.47f;
    std::vector<FragmentState> states;
    for (auto& frag : fragments) {
        if (!frag.active) { states.push_back({frag.position, frag.rotation, false}); continue; }

        // Air drag on fragments: F = 0.5 * rho * cd * A * v^2, A estimated from mass
        float estArea = frag.mass * 0.05f; // rough cross-section estimate
        if (estArea < 0.001f) estArea = 0.001f;
        float vx = frag.velocity[0], vy_f = frag.velocity[1], vz_f = frag.velocity[2];
        float vMag = std::sqrt(vx*vx + vy_f*vy_f + vz_f*vz_f);
        if (vMag > 0.01f && frag.mass > 1e-6f) {
            float dragAcc = AIR_DRAG * estArea * vMag / frag.mass;
            frag.velocity[0] -= dragAcc * vx * (float)dt;
            frag.velocity[1] -= dragAcc * vy_f * (float)dt;
            frag.velocity[2] -= dragAcc * vz_f * (float)dt;
        }

        frag.velocity[1] -= (float)(gravity*dt);
        frag.position[0] += frag.velocity[0]*(float)dt;
        frag.position[1] += frag.velocity[1]*(float)dt;
        frag.position[2] += frag.velocity[2]*(float)dt;
        if (frag.position[1] < -0.5f) {
            frag.position[1]  = -0.5f;
            frag.velocity[1] *= -0.35f;
            frag.velocity[0] *= 0.65f;
            frag.velocity[2] *= 0.65f;
            frag.angularVelocity[0] *= 0.5f;
            frag.angularVelocity[2] *= 0.5f;
            if (std::abs(frag.velocity[1]) < 0.1f) frag.active = false;
        }
        float ax=frag.angularVelocity[0]*(float)dt, ay=frag.angularVelocity[1]*(float)dt, az=frag.angularVelocity[2]*(float)dt;
        float qx=frag.rotation[0], qy=frag.rotation[1], qz=frag.rotation[2], qw=frag.rotation[3];
        frag.rotation[0] = qx+(qw*ax-qz*ay+qy*az)*0.5f;
        frag.rotation[1] = qy+(qz*ax+qw*ay-qx*az)*0.5f;
        frag.rotation[2] = qz+(-qy*ax+qx*ay+qw*az)*0.5f;
        frag.rotation[3] = qw+(-qx*ax-qy*ay-qz*az)*0.5f;
        float len = std::sqrt(frag.rotation[0]*frag.rotation[0]+frag.rotation[1]*frag.rotation[1]+frag.rotation[2]*frag.rotation[2]+frag.rotation[3]*frag.rotation[3]);
        if (len > 0) { frag.rotation[0]/=len; frag.rotation[1]/=len; frag.rotation[2]/=len; frag.rotation[3]/=len; }
        states.push_back({frag.position, frag.rotation, frag.active});
    }
    return states;
}
