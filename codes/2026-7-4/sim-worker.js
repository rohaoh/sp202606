/**
 * 다중 물체 병렬 물리 시뮬레이션 워커
 * 물체 1개당 1개 워커가 배정되어 physics-core.js의 순수 계산을
 * 메인 스레드와 별도의 스레드에서 동시에 수행한다(F11 다중 물체 낙하 가속).
 */
importScripts('physics-core.js');

self.onmessage = function (e) {
  try {
    const result = runFallSimulation(e.data);
    self.postMessage(result);
  } catch (err) {
    self.postMessage({ error: err.message || String(err) });
  }
};
