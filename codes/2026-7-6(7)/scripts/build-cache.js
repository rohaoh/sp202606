/**
 * 빌드 캐싱 시스템
 * 변경된 파일만 재빌드하여 빌드 시간 최적화
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const cacheFile = path.join(root, '.build-cache.json');

/**
 * 파일 해시 계산
 * @param {string} filePath - 파일 경로
 * @returns {string} SHA256 해시
 */
function calculateHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 캐시 로드
 * @returns {Object} 이전 빌드 캐시
 */
function loadCache() {
  if (!fs.existsSync(cacheFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * 캐시 저장
 * @param {Object} cache - 캐시 데이터
 */
function saveCache(cache) {
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}

/**
 * 파일이 변경되었는지 확인
 * @param {string} filePath - 파일 경로
 * @param {Object} cache - 캐시 데이터
 * @returns {boolean} 변경 여부
 */
function hasChanged(filePath, cache) {
  const newHash = calculateHash(filePath);
  const oldHash = cache[filePath];
  return newHash !== oldHash;
}

/**
 * 빌드 필요 여부 확인
 * @returns {boolean} 빌드 필요 여부
 */
function needsBuild() {
  const cache = loadCache();
  const sourceFiles = [
    path.join(root, 'renderer.js'),
    path.join(root, 'main.js'),
    path.join(root, 'index.html'),
    path.join(root, 'package.json'),
  ];

  return sourceFiles.some(file => hasChanged(file, cache));
}

/**
 * 캐시 업데이트
 */
function updateCache() {
  const cache = loadCache();
  const sourceFiles = [
    path.join(root, 'renderer.js'),
    path.join(root, 'main.js'),
    path.join(root, 'index.html'),
    path.join(root, 'package.json'),
  ];

  sourceFiles.forEach(file => {
    cache[file] = calculateHash(file);
  });

  saveCache(cache);
}

/** C++ 물리 엔진 소스 목록 (cmake-js 네이티브 컴파일 대상) */
function nativeFiles() {
  return [
    path.join(root, 'physics', 'physics.cpp'),
    path.join(root, 'physics', 'physics.h'),
    path.join(root, 'physics', 'binding.cpp'),
    path.join(root, 'CMakeLists.txt'),
  ];
}

/**
 * 네이티브(C++) 빌드가 필요한지 확인.
 * physics.node 산출물이 없거나, 소스 해시가 이전 빌드와 다르면 true.
 * @returns {boolean} 네이티브 재빌드 필요 여부
 */
function needsNativeBuild() {
  const built = [
    path.join(root, 'build', 'Release', 'physics.node'),
    path.join(root, 'build', 'Debug', 'physics.node'),
    path.join(root, 'build', 'physics.node'),
  ];
  if (!built.some(p => fs.existsSync(p))) return true;

  const cache = loadCache();
  return nativeFiles().some(file => hasChanged(file, cache));
}

/**
 * 네이티브 소스 캐시 업데이트 (build-addon 성공 직후 호출)
 */
function updateNativeCache() {
  const cache = loadCache();
  nativeFiles().forEach(file => {
    cache[file] = calculateHash(file);
  });
  saveCache(cache);
}

module.exports = { needsBuild, updateCache, needsNativeBuild, updateNativeCache, loadCache, saveCache };
