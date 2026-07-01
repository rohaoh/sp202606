/**
 * 전역 에러 핸들러
 * 미처리 예외 및 프로미스 거부를 잡아서 로깅
 */

const fs = require('fs');
const path = require('path');

// 로그 디렉토리 생성
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

/**
 * 에러 로그 기록
 * @param {Error} error - 에러 객체
 * @param {string} type - 에러 타입 (uncaught-exception, unhandled-rejection 등)
 */
function logError(error, type = 'unknown') {
  const timestamp = new Date().toISOString();
  const logFile = path.join(logDir, `errors-${new Date().toISOString().split('T')[0]}.log`);

  const errorMessage = `
[${timestamp}] ${type.toUpperCase()}
Message: ${error.message || error}
Stack: ${error.stack || 'No stack trace'}
---
`;

  fs.appendFileSync(logFile, errorMessage);
  console.error(`❌ 에러 발생 (${type}): ${error.message}`);
}

/**
 * 전역 에러 핸들러 설정
 * Node.js 에러와 Electron 에러 모두 처리
 */
function setupGlobalErrorHandlers() {
  // 미처리 예외 핸들러
  process.on('uncaughtException', (error) => {
    logError(error, 'uncaught-exception');
    console.error('앱이 종료됩니다.');
    process.exit(1);
  });

  // 미처리 프로미스 거부 핸들러
  process.on('unhandledRejection', (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logError(error, 'unhandled-rejection');
  });

  // Electron 앱 에러 핸들러
  if (global.isElectron) {
    const { app, dialog } = require('electron');

    app.on('render-process-gone', (event, webContents, details) => {
      console.error('렌더 프로세스 충돌:', details);
      logError(new Error(`Renderer crash: ${details.reason}`), 'renderer-crash');
    });

    process.on('uncaughtException', (error) => {
      dialog.showErrorBox('오류', `예상치 못한 오류가 발생했습니다.\n${error.message}`);
      logError(error, 'electron-exception');
    });
  }
}

module.exports = { setupGlobalErrorHandlers, logError };
