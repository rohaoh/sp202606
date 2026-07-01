/**
 * 빌드 환경 헬스 체크 스크립트
 * 필수 도구 설치 여부를 검증합니다.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const checks = [];

function checkCommand(name, command, minVersion = null) {
  try {
    const output = execSync(`${command} --version`, { encoding: 'utf-8' }).split('\n')[0];
    const status = minVersion ? '✓' : '✓';
    console.log(`${status} ${name}: ${output.trim()}`);
    checks.push({ name, status: 'ok' });
  } catch (_) {
    console.log(`✗ ${name}: 설치되지 않음`);
    checks.push({ name, status: 'fail' });
  }
}

function checkFile(name, filePath) {
  if (fs.existsSync(filePath)) {
    console.log(`✓ ${name}: 존재`);
    checks.push({ name, status: 'ok' });
  } else {
    console.log(`✗ ${name}: 없음 (${filePath})`);
    checks.push({ name, status: 'fail' });
  }
}

console.log('🏥 빌드 환경 검사\n');

// 필수 도구
console.log('필수 도구:');
checkCommand('Node.js', 'node');
checkCommand('npm', 'npm');
checkCommand('CMake', 'cmake', '3.15');
checkCommand('git', 'git');

console.log('\n개발 도구:');
checkCommand('ESLint', 'npx eslint --version');
checkCommand('Prettier', 'npx prettier --version');

console.log('\n프로젝트 파일:');
checkFile('package.json', path.join(__dirname, '..', 'package.json'));
checkFile('CMakeLists.txt', path.join(__dirname, '..', 'CMakeLists.txt'));

const failed = checks.filter(c => c.status === 'fail');
console.log(`\n${checks.length}개 중 ${checks.length - failed.length}개 통과`);

if (failed.length > 0) {
  console.error(`\n❌ 설치 필요: ${failed.map(c => c.name).join(', ')}`);
  process.exit(1);
} else {
  console.log('\n✅ 모든 검사 통과! npm install 후 npm start를 실행하세요.');
  process.exit(0);
}
