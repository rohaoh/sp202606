# 기여 가이드

물리 시뮬레이터 프로젝트에 기여해주셔서 감사합니다!

## 개발 환경 설정

### 1. 필수 도구 설치
```bash
# 설치 확인
npm run doctor
```

- Node.js 16+ 
- CMake 3.15+
- Visual Studio Build Tools (Windows)

### 2. 저장소 클론 및 설정
```bash
git clone https://github.com/rohaoh/sp202606.git
cd sp202606/codes/2026-6-30
npm install
npm run build-addon
```

## 커밋 규칙

### 커밋 메시지 형식
```
<type>: <subject>

<body>

Co-Authored-By: <name> <email>
```

### Type 종류
- `feat`: 새 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 수정
- `refactor`: 코드 리팩토링
- `test`: 테스트 추가
- `perf`: 성능 최적화
- `chore`: 빌드, 의존성 등

### 예시
```
feat: physics 엔진에 Magnus 효과 추가

Magnus 양력을 계산하는 공식을 구현했습니다.
이제 회전하는 물체의 궤적이 더 정확합니다.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

## 코드 스타일

모든 코드는 자동으로 검사됩니다:

```bash
# 린트 검사
npm run lint

# 자동 포맷팅
npm run format
```

### ESLint 규칙
- 들여쓰기: 2 spaces
- 따옴표: 단일 따옴표 (')
- 세미콜론: 필수
- 미사용 변수: 경고 (`_`로 시작하면 무시)

## 테스트

```bash
npm run test        # 테스트 실행
npm run test:watch  # 파일 변경 시 자동 재실행
```

## PR 체크리스트

- [ ] `npm run doctor` 통과
- [ ] `npm run lint` 통과 (또는 `npm run format` 실행)
- [ ] `npm run test` 통과
- [ ] `npm run build-addon` 통과
- [ ] README.md 업데이트 (필요한 경우)
- [ ] 커밋 메시지가 규칙을 따름

## 주의사항

### 금지 사항
- ❌ `.env` 파일 커밋 (`.env.example`만 수정)
- ❌ 민감한 정보 (API 키, 비밀번호) 커밋
- ❌ `node_modules` 커밋
- ❌ 소리 관련 기능 추가
- ❌ 권한 없이 서드파티 라이브러리 추가

### 기능 개발 시
- 모든 새 기능은 **토글 가능**해야 함 (UI에서 켜고 끌 수 있음)
- C++ 물리 코드 변경 시 `npm run build-addon` 재실행 필수
- 새 의존성 추가 시 README.md에 "npm install" 안내 추가

## 도움이 필요하신가요?

- 버그 리포트: GitHub Issues
- 질문: GitHub Discussions
- 코드 리뷰: Pull Requests

감사합니다! 🙏
