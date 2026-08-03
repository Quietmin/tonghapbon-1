import Header from "@/components/Header";
import { listEquipmentSummary } from "@/lib/db";
import { formatDatetimeDisplay } from "@/lib/datetime";
import { BRANCH_OPTIONS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function statusClass(status: string | null): string {
  return status === "조치완료" ? "bg-green-100 text-status-success" : "bg-red-100 text-status-critical";
}

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const rows = listEquipmentSummary(branch);

  return (
    <div>
      <Header title="설비 목록 관리" />
      <main className="p-container-padding">
        <p className="mb-stack-md text-body-sm text-on-surface-variant">
          별도의 설비 마스터 없이, 등록된 고장이력에서 지사·설비명을 집계해 보여줍니다.
        </p>
        <form action="/equipment" method="GET" className="mb-stack-lg bg-white p-6 rounded-lg border border-border-subtle shadow-sm flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-label-caps text-on-surface-variant uppercase">지사 선택</label>
            <select name="branch" defaultValue={branch ?? ""} className="border border-border-subtle rounded-lg px-4 py-2">
              <option value="">전체 지사</option>
              {BRANCH_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="h-10 px-4 flex items-center gap-2 bg-primary text-white rounded-lg font-semibold text-body-sm">
            <span className="material-symbols-outlined text-sm">filter_list</span>필터 적용
          </button>
        </form>
        <div className="bg-white rounded-lg border border-border-subtle shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant">집계할 고장이력 데이터가 없습니다.</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-table-header border-b border-border-subtle">
                  <th className="px-6 py-4 text-label-caps text-on-surface-variant">설비명</th>
                  <th className="px-6 py-4 text-label-caps text-on-surface-variant">지사</th>
                  <th className="px-6 py-4 text-label-caps text-on-surface-variant text-center">고장이력</th>
                  <th className="px-6 py-4 text-label-caps text-on-surface-variant">최근 발생일</th>
                  <th className="px-6 py-4 text-label-caps text-on-surface-variant text-right">최근 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((row) => (
                  <tr key={`${row.branch}-${row.equipmentName}`} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-6 py-4 font-semibold text-primary">{row.equipmentName}</td>
                    <td className="px-6 py-4">{row.branch || "-"}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex px-2 py-1 bg-primary-fixed text-on-primary-fixed rounded-full text-xs font-bold">
                        {row.count}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-data-mono text-secondary">{formatDatetimeDisplay(row.lastOccurredAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`px-2 py-1 rounded text-[11px] font-bold ${statusClass(row.lastStatus)}`}>{row.lastStatus || "-"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
