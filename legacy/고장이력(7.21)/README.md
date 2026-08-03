# 열원설비 고장이력 관리 시스템

발전/플랜트 열원설비(보일러, 열교환기 등)의 과거 고장 이력을 등록·검색·통계화하는
사내용 웹 애플리케이션 프로젝트입니다.

## 폴더 구조

| 폴더 | 내용 |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | 제품 요구사항 정의서 — 배경, 범위, 데이터 모델, 오픈 이슈 |
| [`docs/SCREEN_DESIGN.md`](docs/SCREEN_DESIGN.md) | 화면 설계 가이드 (Stitch 목업 프롬프트) |
| [`stitch-export/`](stitch-export/) | Stitch로 만든 초기 화면 목업 원본 |
| [`web/`](web/) | 실제 동작하는 Next.js 애플리케이션 (여기서 실행) |

## 시작하기

실제 앱은 `web/` 폴더 안에 있습니다.

```bash
cd web
npm install
npm run dev
```

자세한 실행 방법과 기술 스택은 [`web/README.md`](web/README.md)를 참고하세요.

## 참고

- 이 프로젝트는 Stitch로 만든 화면 목업을 실제 Next.js + SQLite 애플리케이션으로 옮긴 것입니다.
- `web/data/`, `web/uploads/`에는 실제 등록된 회사 데이터(고장이력, 첨부파일)가 저장되며
  Git에 커밋되지 않습니다. 여러 사람이 같은 데이터를 공유하려면 한 대의 서버에 배포해서
  다같이 그 주소로 접속해야 합니다 (자세한 내용은 `docs/PRD.md`의 비기능 요구사항 참고).
