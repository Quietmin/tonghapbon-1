import { redirect } from "next/navigation";

/**
 * 문서 관리는 통합 후 보관함(/docgen/archive)이 맡는다 — 매뉴얼·고장 보고서·사진대장을
 * 한 화면에서 조회하고, 업로드한 문서의 텍스트 청크는 챗봇 RAG 검색에 색인된다.
 * 옛 주소로 들어오면 보관함으로 보낸다.
 */
export default function ChatbotDocumentsPage() {
  redirect("/docgen/archive");
}
