import ModuleStub from "@/shared/components/ModuleStub";

export default function ChatbotPage() {
  return (
    <ModuleStub
      title="정비 챗봇"
      from="legacy/CheonJae-DDasomi/frontend/app/page.tsx"
      note="FastAPI + ChromaDB 검색을 Next API Route + Postgres(태그 정확일치 + pg_trgm 유사도)로 대체합니다. LLM·외부 API는 사용하지 않습니다."
    />
  );
}
