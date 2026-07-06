// preload.js가 contextBridge로 노출하는 렌더러 전역 API 및
// Electron이 확장하는 Node.js Process 필드에 대한 타입 선언.
export {};

// cmake-js로 빌드되는 네이티브 addon(physics.node)은 타입 선언이 없으므로 any로 취급.
declare module '*.node';

declare global {
  interface Window {
    physics: {
      getFallingObjects: () => Promise<any>;
      getTargetObjects: () => Promise<any>;
      simulate: (input: any) => Promise<any>;
      computeFracture: (impact: any, target: any, r: any) => Promise<any>;
      stepFragments: (dt: number, gravity: number) => Promise<any>;
      copyToAssets: (name: string, bytes: any) => Promise<any>;
    };
    appBridge: {
      sendSnapshot: (snap: any) => void;
      showResults: (data: any) => void;
      openWindow: (panel: string) => void;
      onFilePicked: (cb: (p: any) => void) => void;
      onSettingsApply: (cb: (c: any) => void) => void;
      onResultsAction: (cb: (a: any) => void) => void;
      onResultsRequest: (cb: () => void) => void;
      exportXlsx: (payload: any) => Promise<any>;
    };
  }
  namespace NodeJS {
    interface Process {
      /** Electron이 패키지된 앱에서 추가하는 리소스 경로(devDependency @types/node 기본형에는 없음) */
      resourcesPath?: string;
    }
  }
}
