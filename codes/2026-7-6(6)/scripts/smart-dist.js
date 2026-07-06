/**
 * 캐시 기반 스마트 배포 빌드
 * C++ 물리 엔진 소스(physics/*.cpp, physics/*.h, CMakeLists.txt)가 변경되지
 * 않았으면 시간이 오래 걸리는 build-addon(cmake-js compile)을 건너뛴다.
 * renderer 번들링과 electron-builder 패키징은 매번 실행한다(빠름).
 */
const { execSync } = require('child_process');
const { needsNativeBuild, updateNativeCache, updateCache } = require('./build-cache');

function run(cmd) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

console.log('🧠 스마트 빌드 시작 (변경된 부분만 재빌드)\n');

if (needsNativeBuild()) {
  console.log('⚙️  C++ 물리 엔진 변경 감지 (또는 최초 빌드) → build-addon 실행');
  run('npm run build-addon');
  updateNativeCache();
} else {
  console.log('✓ C++ 물리 엔진 변경 없음 → build-addon 건너뜀 (npm run build-addon 재실행 불필요)');
}

run('node scripts/bundle.js');
run('npx electron-builder --win --x64');
updateCache();

console.log('\n✅ 스마트 빌드 완료');
