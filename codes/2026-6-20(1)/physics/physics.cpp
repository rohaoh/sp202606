#include "physics.h"
#include <cmath>
#include <algorithm>
#include <stdexcept>

// ─────────────────────────────────────────────
//  프리셋 데이터
// ─────────────────────────────────────────────

std::vector<FallingObject> PhysicsEngine::getPresetFallingObjects() {
    return {
        // name,         mass(kg), Cd,   area(m²),  radius(m)
        {"볼링공",         7.0,    0.47,  0.0573,    0.135},
        {"사람 (자유낙하)", 70.0,   1.0,   0.70,      0.30},
        {"소형 자동차",    1200.0,  0.30,  2.20,      0.90},
        {"운석 (1m급)",   2000.0,  0.47,  0.785,     0.50},
        {"피아노",         300.0,  1.20,  1.50,      0.70},
        {"냉장고",         80.0,   1.05,  0.60,      0.40},
        {"철구 (50cm)",   500.0,   0.47,  0.196,     0.25},
    };
}

std::vector<TargetObject> PhysicsEngine::getPresetTargetObjects() {
    return {
        // name,       yieldStrength(MPa), thickness(m)
        {"나무 판자",       40.0,   0.05},
        {"콘크리트 바닥",   30.0,   0.20},
        {"강철판",         250.0,   0.01},
        {"유리",             7.0,   0.006},
        {"벽돌 벽",         10.0,   0.20},
        {"자동차 지붕",     180.0,  0.002},
    };
}

// ─────────────────────────────────────────────
//  핵심 물리 계산
// ─────────────────────────────────────────────

double PhysicsEngine::calcTerminalVelocity(
    const FallingObject& obj, double airDensity, double gravity)
{
    // v_t = sqrt( 2mg / (ρ * Cd * A) )
    return std::sqrt(
        (2.0 * obj.mass * gravity) /
        (airDensity * obj.cd * obj.area)
    );
}

ImpactResult PhysicsEngine::simulate(const SimInput& input) {
    if (input.height <= 0)
        throw std::invalid_argument("높이는 0보다 커야 합니다.");

    const double g   = input.gravity;
    const double rho = input.airDensity;
    const FallingObject& obj = input.falling;

    // ── 1. 종단속도 ──────────────────────────────
    double vt = calcTerminalVelocity(obj, rho, g);

    // ── 2. 수치 적분으로 낙하 궤적 계산 (Euler method, dt=0.05s) ──
    //      F_net = mg - 0.5 * rho * Cd * A * v²
    //      a = F_net / m
    const double dt   = 0.05;   // 시간 스텝 (s)
    double v          = 0.0;    // 초기 속도
    double altitude   = input.height;
    double t          = 0.0;

    std::vector<PhysicsFrame> traj;
    traj.reserve(static_cast<int>(input.height / (v + 1) * 20) + 200);

    while (altitude > 0.0) {
        double drag    = 0.5 * rho * obj.cd * obj.area * v * v;
        double netF    = obj.mass * g - drag;
        double accel   = netF / obj.mass;

        PhysicsFrame frame;
        frame.time      = t;
        frame.velocity  = v;
        frame.altitude  = altitude;
        frame.dragForce = drag;
        frame.netForce  = netF;
        traj.push_back(frame);

        // 다음 스텝
        v        += accel * dt;
        altitude -= v * dt;
        t        += dt;

        // 종단속도의 99.9%에 수렴하면 이후는 등속으로 처리
        if (v >= vt * 0.999) {
            v = vt;
            while (altitude > 0.0) {
                PhysicsFrame f2;
                f2.time      = t;
                f2.velocity  = vt;
                f2.altitude  = altitude;
                f2.dragForce = obj.mass * g; // 평형
                f2.netForce  = 0.0;
                traj.push_back(f2);
                altitude -= vt * dt;
                t        += dt;
            }
            break;
        }
    }

    // 마지막 프레임 속도가 실제 충돌 속도
    double impactV = traj.empty() ? v : traj.back().velocity;

    return calcImpact(input, impactV, traj);
}

ImpactResult PhysicsEngine::calcImpact(
    const SimInput& input, double impactVelocity,
    const std::vector<PhysicsFrame>& traj)
{
    const FallingObject& obj    = input.falling;
    const TargetObject&  target = input.target;

    // ── 3. 충격량 J = m * v ──────────────────────
    double J = obj.mass * impactVelocity;

    // ── 4. 평균 충격력 F = J / Δt ────────────────
    //      충돌 시간 Δt: 단단한 표면일수록 짧음
    //      항복강도 비례로 0.001s ~ 0.05s 사이로 추정
    double collisionTime = 0.05 / (1.0 + target.yieldStrength / 50.0);
    collisionTime = std::clamp(collisionTime, 0.001, 0.05);

    double F_avg = J / collisionTime;

    // ── 5. 충격 압력 P = F / (π * r²) → MPa ─────
    double contactArea = M_PI * obj.radius * obj.radius;  // m²
    double pressure_Pa = F_avg / contactArea;
    double pressure_MPa = pressure_Pa / 1e6;

    // ── 6. 파괴율 계산 ────────────────────────────
    //      압력 / 항복강도 비율, 1.0에서 포화
    double rawRatio = pressure_MPa / target.yieldStrength;
    // 로지스틱 함수로 부드럽게 0~1 범위로 매핑
    // ratio가 1이면 ~0.73, 2이면 ~0.88, 5이면 ~0.99
    double destructionRatio = 1.0 / (1.0 + std::exp(-2.5 * (rawRatio - 1.0)));

    // ── 7. 파괴 레벨 ──────────────────────────────
    std::string level;
    if (destructionRatio < 0.20)       level = "무손상";
    else if (destructionRatio < 0.45)  level = "경미한 손상";
    else if (destructionRatio < 0.70)  level = "중파";
    else if (destructionRatio < 0.90)  level = "심각한 파손";
    else                               level = "완전 파괴";

    ImpactResult result;
    result.terminalVelocity  = calcTerminalVelocity(input.falling, input.airDensity, input.gravity);
    result.impactVelocity    = impactVelocity;
    result.impactMomentum    = J;
    result.impactForce       = F_avg;
    result.impactPressure    = pressure_MPa;
    result.destructionRatio  = destructionRatio;
    result.destructionLevel  = level;
    result.trajectory        = traj;

    return result;
}
