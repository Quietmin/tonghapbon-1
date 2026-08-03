# Plant Ops Manager (열원설비 고장이력 관리 시스템)

발전/플랜트 열원설비의 고장 이력을 등록·검색·통계화하는 사내용 웹 애플리케이션입니다.
전체 기획 배경과 요구사항은 [`../docs/PRD.md`](../docs/PRD.md)를 참고하세요.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속.

처음 실행하면 `data/`, `uploads/` 폴더가 자동으로 생성되며, 등록된 고장이력이 하나도 없는
빈 상태로 시작합니다. **이 두 폴더는 Git에 커밋되지 않습니다** (`.gitignore` 참고) — 실제
회사 데이터가 저장되는 곳이라 저장소를 통해 공유되지 않고, 실행하는 PC마다 독립적으로 쌓입니다.
여러 명이 같은 데이터를 보려면 한 대의 서버에 배포해서 그 주소로 다같이 접속해야 합니다
(로컬에서 각자 `npm run dev`로 띄우면 서로 다른 데이터를 보게 됩니다).

## 기술 스택

- **프레임워크**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **DB**: SQLite (`better-sqlite3`), 파일 위치 `data/app.db`
- **문서 처리**: `pdf-parse` (고장상보 PDF 텍스트 추출)
- **폼**: `@tailwindcss/forms`

## 폴더 구조

```
src/
  app/                  라우트 (App Router)
    page.tsx            대시보드
    history/            고장이력 목록·상세·등록·수정·일괄업로드
    equipment/          설비 목록 (고장이력에서 집계)
    api/                라우트 핸들러 (DB 접근, 파일 업로드/파싱)
  components/           공용 UI 컴포넌트 (Sidebar, Header, 등록/수정 폼 등)
  lib/                  DB 접근(db.ts), PDF 파싱, 날짜 포맷, 상수
data/                   SQLite DB 파일 (gitignore 처리, 최초 실행 시 자동 생성)
uploads/                업로드된 고장상보 원본 파일 (gitignore 처리)
```

## 주요 기능

- 고장이력 등록/수정/검색 (지사·고장분야·상태·기간·통합검색 필터)
- 고장상보 PDF/HWP 업로드 시 자동 항목 추출 (개별 등록 + 여러 파일 일괄 등록)
- 실데이터 기반 대시보드(월별 추이, 분야별/지사별 통계, 다발 설비)
- 설비 목록 (별도 설비 마스터 없이 고장이력에서 집계)
- 전체 리셋 기능 (사이드바 하단)

현재 남아있는 제약사항과 향후 계획은 [`../docs/PRD.md`](../docs/PRD.md)의 "오픈 이슈" 항목을 참고하세요.
