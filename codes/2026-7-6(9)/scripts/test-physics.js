/**
 * C++ 물리 핵심 계산 단위 테스트 실행기
 * g++(Linux/macOS/MinGW)로 컴파일 후 실행한다. cmake-js/N-API 빌드나
 * Electron 헤더와 무관하게 physics.cpp의 순수 계산 함수만 독립적으로 검증한다.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const testSrc = path.join(root, 'physics', 'tests', 'test_physics_core.cpp');
const outDir = path.join(root, 'build');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outBin = path.join(outDir, process.platform === 'win32' ? 'test_physics.exe' : 'test_physics');

console.log('🧪 물리 핵심 계산 단위 테스트 컴파일 중...\n');

try {
  execSync(`g++ -std=c++17 -O2 -o "${outBin}" "${testSrc}"`, { stdio: 'inherit' });
} catch (e) {
  console.error('\n✗ g++로 컴파일하지 못했습니다.');
  console.error('  Windows라면 "Developer Command Prompt for VS"에서 아래를 직접 실행해 보세요:');
  console.error(`  cl /std:c++17 /EHsc /Fe:test_physics.exe "${testSrc}"\n`);
  process.exit(1);
}

console.log('\n실행:\n');
try {
  execSync(`"${outBin}"`, { stdio: 'inherit' });
  console.log('\n✅ 물리 핵심 계산 테스트 통과');
} catch (e) {
  console.error('\n✗ 물리 핵심 계산 테스트 실패');
  process.exit(1);
}
