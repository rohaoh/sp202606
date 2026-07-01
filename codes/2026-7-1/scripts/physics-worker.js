/**
 * 물리 시뮬레이션 워커 스레드
 * 각 워커는 독립적으로 객체 시뮬레이션 수행
 */

const { parentPort } = require('worker_threads');

parentPort.on('message', (simulation) => {
  try {
    // 시뮬레이션 데이터 처리
    const { id, input, frames } = simulation;

    // 물리 엔진 모듈 동적 로드 (네이티브 바인딩)
    let physics;
    try {
      physics = require('../build/Release/physics.node');
    } catch (e) {
      // 폴백: 간단한 시뮬레이션 (테스트용)
      physics = createMockPhysics();
    }

    const result = {
      id,
      success: true,
      frames: [],
      metadata: {
        startTime: Date.now(),
        completedAt: null
      }
    };

    // 각 프레임 시뮬레이션
    for (let frame = 0; frame < frames; frame++) {
      const frameData = physics.simulate(input, frame);
      result.frames.push(frameData);
    }

    result.metadata.completedAt = Date.now();
    result.metadata.duration = result.metadata.completedAt - result.metadata.startTime;

    parentPort.postMessage(result);
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * 물리 엔진 없을 때 테스트용 모의 객체
 */
function createMockPhysics() {
  return {
    simulate(input, frame) {
      return {
        frame,
        position: { x: 0, y: -9.81 * frame * frame * 0.5, z: 0 },
        velocity: { x: 0, y: -9.81 * frame, z: 0 },
        time: frame * 0.016
      };
    }
  };
}
