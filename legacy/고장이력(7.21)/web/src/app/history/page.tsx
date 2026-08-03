import Link from "next/link";
import Header from "@/components/Header";
import HistoryTable from "@/components/HistoryTable";
import { listFailureHistory } from "@/lib/db";
import { BRANCH_OPTIONS, FAILURE_FIELD_OPTIONS, STATUS_OPTIONS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const FIELD_BASE = "rounded-lg border border-border-subtle bg-white px-3 py-2 text-body-md focus:ring-2 focus:ring-primary";

export default async function HistoryListPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; status?: string; failureField?: string; from?: string; to?: string; q?: string }>;
}) {
  const params = await searchParams;
  const rows = listFailureHistory(params);
  const hasActiveFilter = Boolean(
    params.branch || params.status || params.failureField || params.from || params.to || params.q,
  );

  return (
    <form action="/history" method="GET">
      <Header title="고장이력 관리" />
      <div className="p-container-padding space-y-gutter max-w-[1600px] mx-auto w-full">
        <section className="bg-white p-6 rounded-lg border border-border-subtle shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-label-caps text-secondary font-bold uppercase">지사</label>
              <select name="branch" defaultValue={params.branch ?? ""} className={`w-full ${FIELD_BASE}`}>
                <option value="">전체</option>
                {BRANCH_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-label-caps text-secondary font-bold uppercase">고장분야</label>
              <select name="failureField" defaultValue={params.failureField ?? ""} className={`w-full ${FIELD_BASE}`}>
                <option value="">전체</option>
                {FAILURE_FIELD_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-label-caps text-secondary font-bold uppercase">상태</label>
              <select name="status" defaultValue={params.status ?? ""} className={`w-full ${FIELD_BASE}`}>
                <option value="">전체</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-label-caps text-secondary font-bold uppercase">발생기간</label>
              <div className="flex items-center gap-2">
                <input name="from" defaultValue={params.from ?? ""} className={`flex-1 min-w-0 ${FIELD_BASE}`} type="date" />
                <span className="text-on-surface-variant shrink-0">~</span>
                <input name="to" defaultValue={params.to ?? ""} className={`flex-1 min-w-0 ${FIELD_BASE}`} type="date" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="통합검색 - 제목·지사·설비·상황·원인 등 전체 검색"
              className={`flex-1 min-w-0 ${FIELD_BASE}`}
            />
            <button
              type="submit"
              className="shrink-0 px-6 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primary-container flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">search</span>
              조회하기
            </button>
            <Link
              href="/history/new"
              className="shrink-0 px-4 py-2 border border-primary text-primary rounded-lg font-bold hover:bg-primary/5 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              신규 등록
            </Link>
          </div>
        </section>
        <section className="bg-white rounded-lg border border-border-subtle shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <HistoryTable
              rows={rows}
              emptyMessage={hasActiveFilter ? "조건에 맞는 고장이력이 없습니다." : undefined}
            />
          </div>
        </section>
      </div>
    </form>
  );
}
