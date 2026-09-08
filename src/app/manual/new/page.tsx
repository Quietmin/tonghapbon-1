import ManualEditor from "@/modules/docgen/components/ManualEditor";

export const metadata = { title: "매뉴얼 작성 — 유지보수 마스터" };

/**
 * 매뉴얼 작성 — 원래 /docgen/manual 이던 화면 그대로.
 * 편집기 본체는 modules/docgen 에 있고 여기는 경로만 준다.
 */
export default function ManualNewPage() {
  return <ManualEditor />;
}
