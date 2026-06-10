**운영 가이드**

이 문서는 vuln-patch 대시보드 및 로컬 패키지 관리 API의 배포, 구성, 운영, 보안 권장사항 및 간단한 사용법을 정리합니다.

**목적**: 로컬 시스템의 패키지 현황을 확인하고(스캔/리포트 기반) 원격으로 설치/제거/업그레이드 작업을 안전하게 실행하기 위한 운영 가이드입니다.

**전제 조건**
- **운영체제**: Debian/Ubuntu 계열 (apt/dpkg 기반 명령 사용). 다른 배포판은 명령어 및 권한 정책을 조정해야 합니다.
- **권한**: 패키지 변경(install/remove/upgrade)은 root 권한이 필요합니다. 서비스는 systemd 등으로 root 또는 권한 위임된 환경에서 실행하세요.
- **런타임**: Node.js 실행 환경 (dashboard는 Express + Vite 사용). 패키지 설치가 실제 시스템 변경을 일으키므로 테스트 환경에서 먼저 검증하세요.

**구성 파일 및 환경 변수**
- 우선순위: `process.env` (환경 변수, 또는 `.env`로 로드) > `config.json` 파일
- 주요 환경 변수
  - `NVD_API_KEY`: NVD API 키 (있으면 우선 사용)
  - `PATCH_AGENT_FE_CONFIG`: 외부 config.json 경로(있으면 우선 읽음)
  - `PATCH_AGENT_DATA_ROOT` 또는 `PATCH_AGENT_DATA_DIR`: 데이터 루트 경로
  - `PATCH_AGENT_FE_PORT` 또는 `PORT`: 서버 포트

- 기본 config 파일 위치: `<dataRoot>/config.json` 또는 실행 시 지정된 `PATCH_AGENT_FE_CONFIG`
- `.env` 파일: 프로젝트 루트(`dashboard` 상위 `projectRoot` 위치) 또는 data root의 `.env`를 읽어 `process.env`에 로드합니다. 민감값은 `.gitignore`에 추가하세요.

**주요 파일/경로**
- 감사 로그: 기본 경로는 `dataRoot/log/vuln-patch-agent/audit.log` (설정에 따라 달라질 수 있음)
- 스캔/리포트: `latest_scan.json`, `latest_report.json` (기본 data root 아래 log 디렉터리)
- 대시보드 서버: [dashboard/server/index.js](dashboard/server/index.js)
- 운영 문서 파일: [docs/operation-guide.md](docs/operation-guide.md)

**서비스 실행 방법**

- 개발 모드(빠른 확인):
  1. `cd dashboard`
  2. `npm install`
  3. `npm run dev`  # `NODE_ENV=development node server/index.js` 실행

- 프로덕션(간단):
  1. `cd dashboard`
  2. `npm install --production`
  3. `npm run build`  # Vite로 빌드
  4. `NODE_ENV=production node server/index.js`

- systemd 서비스 예시 (간단 템플릿):
```
[Unit]
Description=vuln-patch-dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vuln-patch-dashboard
ExecStart=/usr/bin/node server/index.js
Environment=NODE_ENV=production
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

**API 스펙(주요 엔드포인트 및 사용 예)**
- `GET /api/health`
  - 응답: `{ ok: true }`

- `GET /api/config`
  - 런타임 구성과 파일 존재 상태를 리턴

- `GET /api/settings`
  - 반환 예: `{ ok: true, configPath, fileConfig, envKeyPresent, nvdApiKeySource }`
  - `envKeyPresent`가 true이면 `NVD_API_KEY`가 `.env` 또는 환경변수에 존재함을 의미

- `POST /api/settings/nvd-key`
  - 바디: `{ "apiKey": "<YOUR_KEY>" }`
  - 동작: 프로젝트 루트의 `.env`에 `NVD_API_KEY=<YOUR_KEY>`를 기록하고 파일 모드를 `0600`으로 설정

- 패키지 관련(시스템 변경): 주의해서 사용
  - `GET /api/packages` — 설치된 패키지 목록
    - 예: `curl http://localhost:4173/api/packages`
  - `GET /api/package/:name` — `apt-cache policy` 원시 출력
  - `POST /api/packages/install` — 바디 `{ "name": "pkg" }` (사전에 `apt-get update` 수행)
  - `POST /api/packages/remove` — 바디 `{ "name": "pkg" }`
  - `POST /api/packages/upgrade` — 바디 `{ "name": "pkg" }` 또는 빈 바디로 전체 업그레이드
  - `POST /api/packages/update-cache` — `apt-get update`

예시: NVD 키 설정
```
curl -X POST http://localhost:4173/api/settings/nvd-key \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"MY_KEY"}'
```

예시: 패키지 설치(주의: 실제 변경)
```
curl -X POST http://localhost:4173/api/packages/install \
  -H "Content-Type: application/json" \
  -d '{"name":"sl"}'
```

**감사 로그 및 모니터링**
- 모든 설치/제거/업그레이드/설정 변경 요청은 `audit.log`에 JSON 라인으로 기록됩니다.
- 예시 항목: `{ timestamp, event, details }`
- 로그 로테이션을 적용하세요 (logrotate 또는 systemd-journal 정책 추천).

**보안 권장사항**
- 외부에 직접 노출하지 마세요. 내부 네트워크 전용 또는 프록시 뒤에 배치하세요.
- 인증 및 권한 검증을 반드시 도입하세요(단순 토큰이라도 초기 단계에서 적용).
- `NVD_API_KEY` 및 다른 민감정보는 `.env`에 저장할 경우 `0600` 권한을 유지하고 Git에 커밋하지 마세요.
- 가능한 경우 비밀관리 솔루션(예: HashiCorp Vault, AWS Secrets Manager) 사용을 권장합니다.

**문제 해결(FAQ)**
- `dpkg-query` 또는 `apt-get` 명령이 실패하면 권한(최소 root)과 네트워크(apt 소스 접근)를 확인하세요.
- `.env`에서 키가 적용되지 않으면 서버를 재시작하거나 `GET /api/settings`로 `envKeyPresent` 상태를 확인하세요.

**패키징 및 배포 참고**
- 이미 리포지토리에 Debian 패키지 템플릿(`vuln-patch-agent_0.1.0/`)이 포함되어 있습니다. 서비스 파일, postinst/postrm 스크립트를 검토하고 `ExecStart` 경로를 배포 환경에 맞게 조정하세요.

**Debian 패키지 빌드 예시**
1. 패키지 루트에서 빌드할 때는 `dpkg-deb`를 사용할 수 있습니다:
  ```bash
  cd vuln-patch-agent_0.1.0
  dpkg-deb --build . ../vuln-patch-agent_0.1.0.deb
  ```
2. 생성된 `.deb`는 `sudo dpkg -i ../vuln-patch-agent_0.1.0.deb`로 설치합니다.
3. 패키지 설치 후 systemd 타이머가 활성화되어 매일 실행됩니다. 수동으로 한 번 실행하려면:
  ```bash
  sudo systemctl start vuln-patch-agent.service
  sudo systemctl status vuln-patch-agent.timer
  ```

**참고**: 빌드 시스템에서 `dpkg-deb`가 없거나 더 복잡한 패키징(버전/유니트 파일 프리/포스트 스크립트 검증 등)이 필요한 경우 `debhelper` 및 `fakeroot` 기반 빌드를 고려하세요.

**다음 권장 작업(우선순위)**
- 인증 미들웨어 추가(토큰 기반 또는 OAuth 프록시)
- 비동기 작업 큐로 설치/제거 작업 이동(작업 ID, 상태 조회 API 추가)
- 운영 문서에 백업/롤백 절차 추가

---
문서 및 가이드 추가/수정 요청이 있으면 알려주세요.
