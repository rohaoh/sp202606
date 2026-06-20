#pragma once
#include <string>
#include <vector>

// 낙하 물체 종류별 파라미터
struct FallingObject {
    std::string name;
    double mass;        // kg
    double cd;          // 항력계수 (drag coefficient)
    double area;        // 단면적 m²
    double radius;      // 대표 반지름 m (충격 면적 계산용)
};

// 충돌 대상 물체
struct TargetObject {
    std::string name;
    double yieldStrength;   // 항복강도 MPa (파괴 기준)
    double thickness;       // 두께 m
};

// 시뮬레이션 입력
struct SimInput {
    FallingObject falling;
    TargetObject  target;
    double height;          // 낙하 높이 m
    double airDensity;      // 공기 밀도 kg/m³ (기본 1.225)
    double gravity;         // 중력 m/s² (기본 9.81)
};

// 한 프레임의 상태
struct PhysicsFrame {
    double time;        // 경과 시간 s
    double velocity;    // 속도 m/s
    double altitude;    // 고도 m
    double dragForce;   // 공기저항 N
    double netForce;    // 알짜힘 N
};

// 최종 충돌 결과
struct ImpactResult {
    double terminalVelocity;    // 종단속도 m/s
    double impactVelocity;      // 실제 충돌 속도 m/s (종단속도에 수렴)
    double impactMomentum;      // 충격량 kg·m/s
    double impactForce;         // 평균 충격력 N (충돌 시간 0.01s 가정)
    double impactPressure;      // 충격 압력 MPa
    double destructionRatio;    // 파괴율 0.0 ~ 1.0
    std::string destructionLevel; // "무손상" / "경미" / "중파" / "완파"
    std::vector<PhysicsFrame> trajectory; // 낙하 궤적 (애니메이션용)
};

class PhysicsEngine {
public:
    // 사전 정의된 낙하 물체 목록
    static std::vector<FallingObject> getPresetFallingObjects();
    // 사전 정의된 충돌 대상 목록
    static std::vector<TargetObject>  getPresetTargetObjects();

    // 메인 시뮬레이션 실행
    static ImpactResult simulate(const SimInput& input);

private:
    static double calcTerminalVelocity(const FallingObject& obj, double airDensity, double gravity);
    static ImpactResult calcImpact(const SimInput& input, double impactVelocity, const std::vector<PhysicsFrame>& traj);
};
