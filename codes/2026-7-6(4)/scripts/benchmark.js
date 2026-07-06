/**
 * 성능 벤치마크 스크립트
 * 빌드 시간, 번들 크기, 런타임 성능 측정
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('⚡ 성능 벤치마크 시작...\n');

const benchmarks = {};
const root = path.join(__dirname, '..');

// 1. 빌드 시간 측정
console.log('📦 번들링 시간 측정...');
const bundleStart = Date.now();
try {
  execSync('npm run bundle', { stdio: 'ignore' });
  benchmarks.bundleTime = Date.now() - bundleStart;
  console.log(`  ✓ 번들링: ${benchmarks.bundleTime}ms`);
} catch (e) {
  console.log('  ✗ 번들링 실패');
}

// 2. 번들 크기
const bundlePath = path.join(root, 'renderer.bundle.js');
if (fs.existsSync(bundlePath)) {
  const stats = fs.statSync(bundlePath);
  benchmarks.bundleSize = stats.size;
  console.log(`\n📊 번들 크기: ${(benchmarks.bundleSize / 1024 / 1024).toFixed(2)} MB`);
}

// 3. 파일별 크기
console.log('\n📁 주요 파일 크기:');
const files = ['main.js', 'renderer.js', 'package.json'];
files.forEach(file => {
  const filePath = path.join(root, file);
  if (fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size;
    console.log(`  - ${file}: ${(size / 1024).toFixed(1)} KB`);
  }
});

// 4. 벤치마크 결과 저장
const benchmarkFile = path.join(root, 'benchmark-results.json');
const results = {
  timestamp: new Date().toISOString(),
  benchmarks
};

fs.writeFileSync(benchmarkFile, JSON.stringify(results, null, 2));
console.log(`\n✅ 벤치마크 결과: benchmark-results.json`);

// 5. 성능 목표 확인
console.log('\n📈 성능 목표 확인:');
const targets = {
  bundleTime: 2000,    // ms
  bundleSize: 3145728  // 3MB
};

if (benchmarks.bundleTime > targets.bundleTime) {
  console.log(`⚠️  번들링 시간: ${benchmarks.bundleTime}ms (목표: <${targets.bundleTime}ms)`);
}
if (benchmarks.bundleSize > targets.bundleSize) {
  console.log(`⚠️  번들 크기: ${(benchmarks.bundleSize / 1024 / 1024).toFixed(2)}MB (목표: <3MB)`);
}

console.log('\n✅ 벤치마크 완료');
