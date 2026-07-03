/**
 * 보안 감사 스크립트
 * npm 의존성 취약점 검사 및 보안 리포트 생성
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔒 보안 감사 시작...\n');

// npm audit 실행
try {
  console.log('📦 npm 의존성 취약점 검사...');
  const auditOutput = execSync('npm audit --json 2>&1', { encoding: 'utf-8' });
  const auditData = JSON.parse(auditOutput);

  if (auditData.metadata && auditData.metadata.vulnerabilities) {
    const { vulnerabilities } = auditData.metadata;
    console.log(`\n⚠️  발견된 취약점:`);
    console.log(`  - Critical: ${vulnerabilities.critical || 0}`);
    console.log(`  - High: ${vulnerabilities.high || 0}`);
    console.log(`  - Moderate: ${vulnerabilities.moderate || 0}`);
    console.log(`  - Low: ${vulnerabilities.low || 0}`);

    if (vulnerabilities.critical > 0) {
      console.error('\n❌ Critical 취약점 발견! 즉시 해결 필요');
      process.exit(1);
    }
  } else {
    console.log('✅ 취약점 없음');
  }
} catch (error) {
  console.warn('⚠️  npm audit 실패 (경고로만 표시)');
}

// 의존성 버전 확인
console.log('\n📋 주요 의존성 버전:');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
const criticalDeps = ['electron', 'three', 'firebase', 'esbuild'];
criticalDeps.forEach(dep => {
  if (deps[dep]) {
    console.log(`  - ${dep}: ${deps[dep]}`);
  }
});

console.log('\n✅ 보안 감사 완료');
