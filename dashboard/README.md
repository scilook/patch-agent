# vuln-patch dashboard

로컬 React 대시보드입니다. patch-agent가 생성한 JSON 파일과 audit.log를 읽어서 설치 패키지, 취약점, 업데이트 후보, 감사 로그를 시각화합니다.

## 실행

```bash
npm install
npm run dev
```

기본값은 샘플 데이터 디렉터리입니다. 실제 patch-agent 출력물을 보려면 아래처럼 바꿉니다.

```bash
PATCH_AGENT_DATA_ROOT=/var npm run dev
```

또는 JSON 설정 파일을 사용할 수 있습니다.

```json
{
  "dataRoot": "/var",
  "port": 4173
}
```

환경 변수 `PATCH_AGENT_FE_CONFIG` 에 위 파일 경로를 넣으면 됩니다.