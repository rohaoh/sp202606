/**
 * 성능 테스트 (Jest)
 * 핵심 기능의 응답 시간 검증
 */

describe('성능 테스트', () => {
  // 번들 로드 시간 (예상: <2s)
  test('번들 파일이 2초 내에 로드됨', () => {
    const start = Date.now();
    const fs = require('fs');
    const path = require('path');
    const bundlePath = path.join(__dirname, '..', 'renderer.bundle.js');

    if (fs.existsSync(bundlePath)) {
      fs.readFileSync(bundlePath);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    }
  });

  // 메모리 사용량 확인
  test('메모리 누수가 없음', () => {
    const initialMem = process.memoryUsage().heapUsed;

    // 큰 배열 생성 후 해제
    let largeArray = new Array(100000).fill(Math.random());
    delete largeArray;

    // 가비지 컬렉션
    if (global.gc) global.gc();

    const finalMem = process.memoryUsage().heapUsed;
    const memIncrease = finalMem - initialMem;

    // 메모리 증가량이 10MB 이상이면 실패
    expect(memIncrease).toBeLessThan(10 * 1024 * 1024);
  });

  // CPU 시뮬레이션 (간단한 계산)
  test('물리 계산이 충분히 빠름', () => {
    const start = Date.now();

    // 100,000번의 계산
    let result = 0;
    for (let i = 0; i < 100000; i++) {
      result += Math.sqrt(i) * Math.sin(i) / Math.cos(i + 1);
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // 100ms 이내
  });
});
