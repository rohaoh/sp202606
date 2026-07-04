/**
 * 병렬 물리 시뮬레이션
 * Worker threads를 사용한 다중 객체 동시 시뮬레이션
 */

const { Worker } = require('worker_threads');
const path = require('path');

const workerPath = path.join(__dirname, 'physics-worker.js');

/**
 * 워커 풀 생성
 * @param {number} poolSize - 워커 개수
 * @returns {Object} 워커 풀 인스턴스
 */
function createWorkerPool(poolSize = 4) {
  const workers = [];
  const queue = [];
  let activeWorkers = 0;

  for (let i = 0; i < poolSize; i++) {
    workers.push(null);
  }

  const processQueue = () => {
    if (queue.length === 0 || activeWorkers >= poolSize) return;

    const { sim, resolve, reject } = queue.shift();
    let workerIdx = workers.findIndex(w => w === null);

    if (workerIdx === -1) return;

    activeWorkers++;
    const worker = new Worker(workerPath);

    workers[workerIdx] = worker;

    worker.on('message', (result) => {
      resolve(result);
      worker.terminate();
      workers[workerIdx] = null;
      activeWorkers--;
      processQueue();
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0 && workers[workerIdx]) {
        reject(new Error(`Worker stopped with exit code ${code}`));
        workers[workerIdx] = null;
        activeWorkers--;
        processQueue();
      }
    });

    worker.postMessage(sim);
  };

  return {
    async simulate(simulations) {
      const promises = [];

      for (const sim of simulations) {
        promises.push(
          new Promise((resolve, reject) => {
            queue.push({ sim, resolve, reject });
            processQueue();
          })
        );
      }

      return Promise.all(promises);
    },

    terminate() {
      workers.forEach(w => {
        if (w) w.terminate();
      });
      workers.length = 0;
      queue.length = 0;
    }
  };
}

/**
 * 병렬 시뮬레이션 실행
 * @param {Array} simulations - 시뮬레이션 배열
 * @param {number} poolSize - 워커 풀 크기 (기본값: 4)
 * @returns {Promise<Array>} 결과 배열
 */
async function simulateParallel(simulations, poolSize = 4) {
  const pool = createWorkerPool(poolSize);
  try {
    return await pool.simulate(simulations);
  } finally {
    pool.terminate();
  }
}

module.exports = { createWorkerPool, simulateParallel };
