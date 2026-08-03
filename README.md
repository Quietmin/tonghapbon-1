# Plant Ops Hub — 공정·고장이력·정비문서 통합 웹앱

기존에 따로 개발되던 3개 프로그램을 **하나의 단일 앱**으로 합친 것입니다.

| 메인 메뉴 | 하는 일 | 원본 |
|---|---|---|
| **오버홀 공정관리** | 설계내역서 엑셀 업로드 → 작업항목 자동 추출, 물량 기준 공정률·지연 위험·공정표·보고서 | PlantSync Pro (Vite SPA) |
| **고장이력 관리** | 열원설비 고장 이력 등록·검색·통계, 고장상보 일괄 업로드 | 열원설비 고장이력 관리 (Next 16 + SQLite) |
| **정비 챗봇** | 태그명·고장 증상으로 준공도서/벤더프린트 검색, 근거 문서와 원문 발췌 제시 | 천재따소미 (FastAPI + ChromaDB) |

세 모듈은 **공통 설비 마스터**(설비 → 기기·태그)를 함께 참조합니다. 설비 하나를 열면 진행 중인
오버홀 작업, 과거 고장 이력, 관련 준공도서가 한 화면에 모입니다.

## 실행 방법

```bash
npm install
```

```bash
cp .env.local.example .env.local   # Supabase URL·키를 채운 뒤
npm run dev                        # http://localhost:3000
```

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Storage)

- **배포**: Vercel (프론트·API Route) + Supabase (DB·파일)
- **인증**: 없음 (개발 단계 결정)
- **챗봇 검색**: 태그 정확일치 + `pg_trgm` 유사도. **LLM·외부 API를 사용하지 않습니다.**
- **디자인**: PlantSync Pro의 Stitch "Lumina Overhaul Director" 토큰을 Tailwind 4 `@theme`으로 이식
  ([src/app/globals.css](src/app/globals.css))

## 폴더 구조 — 담당자별 작업 영역

메인 메뉴 3개가 그대로 모듈 경계이며, 담당자끼리 건드리는 폴더가 겹치지 않습니다.

```
src/
├─ app/
│   ├─ overhaul/     ← 오버홀 공정관리 담당
│   ├─ failure/      ← 고장이력 관리 담당
│   ├─ chatbot/      ← 정비 챗봇 담당
│   ├─ equipment/    ← 설비 마스터 (공통)
│   └─ api/{overhaul,failure,chatbot}/
├─ modules/{overhaul,failure,chatbot}/   각 모듈의 로직·컴포넌트
└─ shared/                               공통 — 레이아웃·UI·설비 마스터·supabase 클라이언트
                                         (여기를 고칠 때만 담당자 간 협의 필요)
```

## `legacy/` 폴더

통합 전 원본 3개가 **참고용으로 동결**되어 있습니다.

```
legacy/
├─ plantsync/          PlantSync Pro 원본 (Vite)
├─ 고장이력(7.21)/      열원설비 고장이력 원본 (Next 16 + better-sqlite3)
└─ CheonJae-DDasomi/   천재따소미 원본 (FastAPI + Next 14)
```

> **여기서 개발하지 마세요.** 저장소가 SQLite/IndexedDB/ChromaDB에서 Supabase로 바뀌었기 때문에
> legacy 코드의 변경분은 통합 앱으로 그대로 옮겨지지 않습니다. 로직을 참고할 때만 열어보세요.

## 문서

- [docs/OH WEB APP PRD.md](docs/OH%20WEB%20APP%20PRD.md) — 오버홀 공정관리 PRD
- [legacy/고장이력(7.21)/docs/PRD.md](legacy/고장이력\(7.21\)/docs/PRD.md) — 고장이력 PRD
- [supabase/schema.sql](supabase/schema.sql) — 통합 DB 스키마
