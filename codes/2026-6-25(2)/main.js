const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// ── 커스텀 앱 프로토콜 (app://) ──
// 패키지된 앱을 file:// 로 로드하면 중첩 import 가 있는 ES 모듈(GLTFLoader 등)을
// Chromium 이 동적 import 하지 못해 "Failed to fetch dynamically imported module" 가 난다.
// standard + secure 커스텀 프로토콜로 로드하면 http 처럼 동작해 ESM 모듈 그래프가 정상 로드된다.
const APP_SCHEME = 'app';
protocol.registerSchemesAsPrivileged([{
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

// app://bundle/<상대경로> → __dirname 아래 실제 파일을 안전하게 서빙
function registerAppProtocol() {
    protocol.handle(APP_SCHEME, async (request) => {
        try {
            const url = new URL(request.url);
            let rel = decodeURIComponent(url.pathname);
            if (!rel || rel === '/') rel = '/index.html';
            const filePath = path.normalize(path.join(__dirname, rel));
            // 경로 탈출 방지: __dirname 밖이면 거부
            if (filePath !== __dirname && !filePath.startsWith(__dirname + path.sep)) {
                return new Response('Forbidden', { status: 403 });
            }
            const buf = await fs.promises.readFile(filePath);
            const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
            return new Response(buf, { headers: { 'content-type': mime } });
        } catch (e) {
            return new Response('Not Found: ' + e.message, { status: 404 });
        }
    });
}

// cmake-js는 환경/생성기에 따라 .node 파일을 build/Release, build/Debug,
// 혹은 build/ 바로 아래에 만든다. 여러 후보 경로를 차례로 시도한다.
function loadPhysics() {
    const candidates = [
        path.join(__dirname, 'build', 'Release', 'physics.node'),
        path.join(__dirname, 'build', 'Debug', 'physics.node'),
        path.join(__dirname, 'build', 'physics.node'),
    ];
    if (process.resourcesPath) {
        candidates.push(path.join(process.resourcesPath, 'physics.node'));
    }
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return require(p);
        }
    }
    throw new Error(
        'physics.node 네이티브 모듈을 찾을 수 없습니다.\n' +
        '"npm run build-addon" 을 먼저 실행하세요.\n\n' +
        '확인한 경로:\n' + candidates.join('\n')
    );
}

let physics;
try {
    physics = loadPhysics();
} catch (err) {
    const { dialog } = require('electron');
    app.whenReady().then(() => {
        dialog.showErrorBox('네이티브 모듈 로드 실패', err.message);
        app.quit();
    });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 860,
        minWidth: 1000,
        minHeight: 650,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'Physics Simulator',
        backgroundColor: '#0d1117',
    });
    // file:// 대신 커스텀 app:// 프로토콜로 로드 (ESM 동적 import 안정화)
    win.loadURL(`${APP_SCHEME}://bundle/index.html`);
}

app.whenReady().then(() => {
    registerAppProtocol();
    createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('get-falling-objects', () => physics.getFallingObjects());
ipcMain.handle('get-target-objects',  () => physics.getTargetObjects());

ipcMain.handle('simulate', (_e, input) => {
    try { return { ok: true, data: physics.simulate(input) }; }
    catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('compute-fracture', (_e, impact, target, radius) => {
    try { return { ok: true, data: physics.computeFracture(impact, target, radius) }; }
    catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('step-fragments', (_e, dt, gravity) => {
    try { return physics.stepFragments(dt, gravity); }
    catch (e) { return []; }
});
