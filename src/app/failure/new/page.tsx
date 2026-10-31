import FaultReportEditor, { type FaultReportInitial } from "@/modules/docgen/components/FaultReportEditor";
import { BRANCHES } from "@/modules/docgen/lib/constants";

export const metadata = { title: "고장보고서 등록 — 유지보수 마스터" };

/**
 * 고장보고서 등록 — 원래 /docgen/fault-report 였던 화면 그대로.
 * 편집기 본체는 modules/docgen 에 있고 여기는 경로만 준다.
 *
 * 현황 이슈의 "고장보고서 등록" 버튼에서 넘어오면 주소의 값(branch·facility·content·occurred)으로
 * 지사·설비명·고장내용·발생일시를 미리 채워 같은 내용을 다시 적지 않게 한다. 주소는 누구나 만들 수 있으니
 * 지사는 목록에 있는 값만, 나머지는 길이를 잘라 받는다.
 */
export default async function FailureNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : undefined;
  };

  const branch = one("branch");
  const initial: FaultReportInitial = {
    branch: branch && BRANCHES.includes(branch) ? branch : undefined,
    facility: one("facility")?.slice(0, 120),
    faultContent: one("content")?.slice(0, 600),
    occurredAt: one("occurred")?.slice(0, 40),
  };
  const hasInitial = Object.values(initial).some(Boolean);

  return <FaultReportEditor initial={hasInitial ? initial : undefined} />;
}
