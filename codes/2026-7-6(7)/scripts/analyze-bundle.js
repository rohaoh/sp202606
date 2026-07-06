/**
 * 번들 크기 분석 스크립트
 * renderer.bundle.js 크기 분석 및 최적화 제안
 */

const fs = require('fs');
const path = require('path');

console.log('📊 번들 크기 분석\n');

const root = path.join(__dirname, '..');
const bundlePath = path.join(root, 'renderer.bundle.js');

if (!fs.existsSync(bundlePath)) {
  console.error('❌ renderer.bundle.js를 찾을 수 없습니다.');
  console.log('먼저 npm run bundle을 실행하세요.');
  process.exit(1);
}

const stats = fs.statSync(bundlePath);
const bundleSize = stats.size;
const bundleSizeMB = (bundleSize / 1024 / 1024).toFixed(2);

console.log(`📦 renderer.bundle.js: ${bundleSizeMB} MB (${bundleSize} bytes)`);

// 주요 라이브러리 크기 추정
const content = fs.readFileSync(bundlePath, 'utf-8');
const libraries = [
  { name: 'three.js', pattern: /three\.js|three\/addons/gi },
  { name: 'firebase', pattern: /firebase/gi },
  { name: 'three-loaders', pattern: /GLTFLoader|STLLoader/gi },
];

console.log('\n📚 포함된 라이브러리:');
libraries.forEach(lib => {
  const matches = (content.match(lib.pattern) || []).length;
  if (matches > 0) {
    console.log(`  ✓ ${lib.name} (참조: ${matches})`);
  }
});

// 최적화 제안
console.log('\n💡 최적화 제안:');
console.log('1. Tree-shaking: 미사용 코드 자동 제거 (esbuild minify 사용)');
console.log('2. Code-split: 번들을 작은 청크로 분할');
console.log('3. Lazy loading: 필요할 때만 모듈 로드');
console.log('4. Compression: gzip 압축 (배포 시)');

if (bundleSize > 3000000) {
  console.log('\n⚠️  번들 크기 경고: 3MB 초과');
  console.log('   → npm run bundle 실행 시 --minify 옵션 고려');
}

console.log('\n✅ 분석 완료');
