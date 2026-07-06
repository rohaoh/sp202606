// 물리 핵심 계산 단위 테스트 (독립 실행형 — cmake-js/N-API 빌드 없이 g++만으로 실행 가능)
// 컴파일/실행: g++ -std=c++17 -O2 -o /tmp/test_physics physics/tests/test_physics_core.cpp && /tmp/test_physics
// physics.cpp를 직접 #include하여 파일 스코프 static 헬퍼 함수까지 검증한다.
#define _USE_MATH_DEFINES
#include <cstdio>
#include <cmath>
#include <string>
#include "../physics.cpp"

static int g_pass = 0, g_fail = 0;

#define CHECK(cond, msg) do { \
    if (cond) { g_pass++; } \
    else { g_fail++; std::printf("  [FAIL] %s (line %d)\n", msg, __LINE__); } \
} while (0)

#define CHECK_NEAR(a, b, eps, msg) CHECK(std::fabs((a) - (b)) < (eps), msg)

int main() {
    std::printf("물리 핵심 계산 단위 테스트 시작...\n\n");

    // ── calcAirDensity ──
    double rho0 = PhysicsEngine::calcAirDensity(0, 0, 50);
    CHECK(rho0 > 1.15 && rho0 < 1.25, "해수면 공기밀도가 표준 대기(약 1.2 kg/m^3) 범위 안에 있어야 함");
    double rho11k = PhysicsEngine::calcAirDensity(11000, 0, 50);
    CHECK(rho11k < rho0, "고도가 높아지면 공기밀도가 감소해야 함");

    // ── getAtmosphereName ──
    CHECK(PhysicsEngine::getAtmosphereName(5000) == "Troposphere", "5km는 Troposphere");
    CHECK(PhysicsEngine::getAtmosphereName(15000) == "Lower Stratosphere", "15km는 Lower Stratosphere");
    CHECK(PhysicsEngine::getAtmosphereName(25000) == "Upper Stratosphere", "25km는 Upper Stratosphere");
    CHECK(PhysicsEngine::getAtmosphereName(90000) == "Near Vacuum", "90km는 Near Vacuum");

    // ── simulate() 종단속도 (공개 API를 통한 자기 일관성 검증) ──
    FallingObject bowling{"Bowling Ball", 7.0, 0.47, 0.0573, 0.135};
    TargetObject ground{"Ground", 250.0, 100.0, "concrete", "fracture"};
    SimInput sim{};
    sim.falling = bowling; sim.target = ground;
    sim.height = 500.0; sim.gravity = 9.81; sim.v0 = 0.0;
    sim.windX = 0; sim.windZ = 0; sim.tempOffset = 0; sim.humidity = 50;
    sim.spinRate = 0; sim.spinAxisX = 0; sim.spinAxisY = 0; sim.spinAxisZ = 1;
    sim.launchAngle = 90; sim.launchAzimuth = 0; sim.terrainSlope = 0;
    sim.waterDepth = 0; sim.bounceDamping = 0; sim.latitude = 0;
    ImpactResult res = PhysicsEngine::simulate(sim);
    double rho = PhysicsEngine::calcAirDensity(0, 0, 50);
    double expectedVt = std::sqrt((2.0 * bowling.mass * 9.81) / (rho * bowling.cd * bowling.area));
    CHECK_NEAR(res.terminalVelocity, expectedVt, 1e-9, "종단속도 공식이 sqrt(2mg/(rho*Cd*A))과 일치해야 함");
    // impactVelocity는 하강 방향(음수) 부호를 그대로 유지한다(JS 쪽에서 표시할 때만 abs() 적용).
    CHECK(res.impactVelocity < 0, "500m 낙하 후 충돌 속도는 하강 방향(음수)이어야 함");
    CHECK(std::fabs(res.impactVelocity) <= res.terminalVelocity + 1e-6, "충돌 속도의 크기는 종단속도를 넘을 수 없어야 함(등가속 낙하 없음)");

    // ── calcReynoldsNumber ──
    double re1 = calcReynoldsNumber(10.0, 0.1, 1.225, 0);
    double re2 = calcReynoldsNumber(20.0, 0.1, 1.225, 0);
    CHECK(re1 > 0, "속도>0이면 Reynolds 수도 양수");
    CHECK_NEAR(re2, re1 * 2.0, re1 * 0.01, "Reynolds 수는 속도에 선형 비례해야 함");
    CHECK(calcReynoldsNumber(0, 0.1, 1.225, 0) == 0.0, "속도 0이면 Reynolds 수도 0");

    // ── adjustCdForReynolds ──
    CHECK_NEAR(adjustCdForReynolds(0.47, 5000.0), 0.47, 1e-9, "Re>=1000이면 기본 Cd 그대로 반환");
    CHECK(adjustCdForReynolds(0.47, 0.5) > 0.47, "저 Reynolds 수(Re<1)에서는 Cd가 커져야 함(점성 저항 증가)");

    // ── calcWaterDrag ──
    CHECK(calcWaterDrag(5.0, 0.0, 1000.0) == 0.0, "수심 0이면 물 저항 없음");
    CHECK(calcWaterDrag(5.0, 0.5, 1000.0) > 0.0, "낙하 방향(양의 속도) 물 저항은 양수");
    CHECK(calcWaterDrag(-5.0, 0.5, 1000.0) < 0.0, "반대 방향(음의 속도) 물 저항은 음수(반대 방향으로 작용)");
    CHECK(calcWaterDrag(5.0, 0.5, 1000.0) < calcWaterDrag(5.0, 1.0, 1000.0), "수심이 깊을수록(1m까지) 물 저항 증가");

    // ── calcCoriolisAccel ──
    CHECK(calcCoriolisAccel(10.0, 0.0, 0) == 0.0, "적도(0도)에서 축0 Coriolis 가속은 0");
    CHECK_NEAR(calcCoriolisAccel(10.0, 90.0, 0), 2.0 * 7.2921e-5 * 10.0, 1e-8, "극지방(90도)에서 축0 Coriolis 가속이 최대치와 일치");
    CHECK(calcCoriolisAccel(10.0, 45.0, 2) == 0.0, "정의되지 않은 축(2)은 항상 0 반환");

    // ── calcGravityAtAltitude ──
    CHECK_NEAR(calcGravityAtAltitude(0.0, 0.0), 9.780318, 1e-9, "적도 해수면 중력 기준값과 일치");
    CHECK(calcGravityAtAltitude(0.0, 90.0) > calcGravityAtAltitude(0.0, 0.0), "극지방 중력이 적도보다 커야 함");
    CHECK(calcGravityAtAltitude(10000.0, 0.0) < calcGravityAtAltitude(0.0, 0.0), "고도가 높아지면 중력이 감소해야 함");

    std::printf("\n결과: %d개 통과, %d개 실패\n", g_pass, g_fail);
    return g_fail > 0 ? 1 : 0;
}
