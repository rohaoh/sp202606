/**
 * 번들 스크립트 기본 테스트
 */

describe('Bundle Script', () => {
  test('번들 파일 경로가 유효한 형식', () => {
    const path = require('path');
    const bundleScript = path.join(__dirname, '..', 'scripts', 'bundle.js');
    expect(bundleScript).toMatch(/bundle\.js$/);
  });

  test('주요 파일들이 존재해야 함', () => {
    const fs = require('fs');
    const path = require('path');
    const files = [
      path.join(__dirname, '..', 'renderer.js'),
      path.join(__dirname, '..', 'main.js'),
      path.join(__dirname, '..', 'package.json'),
    ];
    files.forEach(file => {
      expect(fs.existsSync(file)).toBe(true);
    });
  });
});
