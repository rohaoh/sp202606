/**
 * 메모리 누수 감지
 * 힙 스냅샷과 가비지 컬렉션 모니터링
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const root = path.join(__dirname, '..');
const reportsDir = path.join(root, 'memory-reports');

// 리포트 디렉토리 생성
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

/**
 * 메모리 사용량 스냅샷
 */
function captureMemorySnapshot() {
  const mem = process.memoryUsage();
  return {
    timestamp: Date.now(),
    rss: mem.rss,
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers || 0
  };
}

/**
 * 메모리 누수 분석
 * @param {Array} snapshots - 시간대별 스냅샷 배열
 * @returns {Object} 분석 결과
 */
function analyzeMemoryTrend(snapshots) {
  if (snapshots.length < 2) return null;

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const timeDiff = last.timestamp - first.timestamp;

  const heapGrowth = last.heapUsed - first.heapUsed;
  const rssGrowth = last.rss - first.rss;
  const avgHeapGrowthPerSec = (heapGrowth / timeDiff) * 1000;

  const isLeaking = avgHeapGrowthPerSec > 1024 * 100; // 100KB/sec 이상

  return {
    duration: timeDiff,
    heapGrowth,
    rssGrowth,
    avgHeapGrowthPerSec,
    isLeaking,
    severity: calculateSeverity(avgHeapGrowthPerSec)
  };
}

/**
 * 누수 심각도 계산
 */
function calculateSeverity(growthRate) {
  const kb = growthRate / 1024;
  if (kb > 500) return 'CRITICAL';
  if (kb > 200) return 'HIGH';
  if (kb > 100) return 'MEDIUM';
  if (kb > 50) return 'LOW';
  return 'MINIMAL';
}

/**
 * 메모리 모니터링 시작
 * @param {number} duration - 모니터링 시간 (밀리초)
 * @param {number} interval - 수집 간격 (밀리초)
 * @returns {Promise<Object>} 모니터링 결과
 */
async function monitorMemory(duration = 10000, interval = 1000) {
  console.log(`📊 메모리 모니터링 시작 (${duration / 1000}초)...\n`);

  const snapshots = [];
  const startTime = Date.now();

  // 강제 GC
  if (global.gc) global.gc();

  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      const snapshot = captureMemorySnapshot();
      snapshots.push(snapshot);

      const elapsed = Date.now() - startTime;
      const heapMB = (snapshot.heapUsed / 1024 / 1024).toFixed(2);
      console.log(`  [${Math.floor(elapsed / 1000)}s] Heap: ${heapMB} MB`);

      if (elapsed >= duration) {
        clearInterval(intervalId);

        // 강제 GC
        if (global.gc) global.gc();

        const finalSnapshot = captureMemorySnapshot();
        snapshots.push(finalSnapshot);

        const analysis = analyzeMemoryTrend(snapshots);

        console.log('\n📈 분석 결과:');
        console.log(`  Heap 증가: ${(analysis.heapGrowth / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  RSS 증가: ${(analysis.rssGrowth / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  평균 성장률: ${(analysis.avgHeapGrowthPerSec / 1024).toFixed(2)} KB/s`);
        console.log(`  누수 심각도: ${analysis.severity}`);

        if (analysis.isLeaking) {
          console.log('\n⚠️  경고: 메모리 누수 가능성 감지됨');
        } else {
          console.log('\n✅ 정상: 메모리 누수 없음');
        }

        // 결과 저장
        const report = {
          timestamp: new Date().toISOString(),
          duration,
          snapshots,
          analysis
        };

        const reportFile = path.join(
          reportsDir,
          `memory-report-${new Date().toISOString().split('T')[0]}.json`
        );

        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        console.log(`\n📁 리포트 저장: ${path.basename(reportFile)}\n`);

        resolve(analysis);
      }
    }, interval);
  });
}

/**
 * 객체 보유 분석 (간단한 추적)
 */
function analyzeObjectRetention() {
  const globalObjects = {};

  // 글로벌 스코프의 모든 객체 추적
  for (const key in global) {
    try {
      const val = global[key];
      if (typeof val === 'object' && val !== null) {
        globalObjects[key] = {
          type: val.constructor.name,
          size: JSON.stringify(val).length
        };
      }
    } catch (e) {
      // 순환 참조나 접근 불가 객체 무시
    }
  }

  return globalObjects;
}

/**
 * 메모리 누수 감지 리포트 생성
 */
async function generateMemoryLeakReport() {
  console.log('🔍 메모리 누수 감지 분석 시작\n');

  const analysis = await monitorMemory(10000, 1000);
  const retainedObjects = analyzeObjectRetention();

  const fullReport = {
    timestamp: new Date().toISOString(),
    analysis,
    retainedObjects: Object.keys(retainedObjects).slice(0, 20), // 상위 20개만
    recommendation: analysis.isLeaking
      ? '메모리 누수가 감지되었습니다. 이벤트 리스너, 타이머, 또는 순환 참조를 확인하세요.'
      : '메모리 사용량이 정상 범위입니다.'
  };

  const reportFile = path.join(
    reportsDir,
    `leak-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );

  fs.writeFileSync(reportFile, JSON.stringify(fullReport, null, 2));

  console.log(`\n✅ 분석 완료: ${path.basename(reportFile)}`);
}

// CLI 실행
if (require.main === module) {
  generateMemoryLeakReport().catch(console.error);
}

module.exports = {
  captureMemorySnapshot,
  analyzeMemoryTrend,
  monitorMemory,
  analyzeObjectRetention,
  generateMemoryLeakReport
};
