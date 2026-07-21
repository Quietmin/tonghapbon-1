import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import CompleteStatusAction from "@/components/CompleteStatusAction";
import { getAttachmentsByFailureId, getFailureHistoryById } from "@/lib/db";
import { formatDatetimeDisplay } from "@/lib/datetime";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-label-caps text-on-surface-variant mb-1 uppercase">{label}</p>
      <p className="font-bold">{value || "-"}</p>
    </div>
  );
}

function Section({
  icon,
  iconClass,
  title,
  children,
}: {
  icon: string;
  iconClass?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-border-subtle rounded-xl overflow-hidden shadow-sm">
      <div className="bg-table-header px-6 py-3 border-b border-border-subtle flex items-center gap-2">
        <span className={`material-symbols-outlined ${iconClass ?? "text-primary"}`}>{icon}</span>
        <h4 className="font-bold">{title}</h4>
      </div>
      <div className="p-6 text-on-surface whitespace-pre-line">{children}</div>
    </section>
  );
}

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const failure = getFailureHistoryById(Number(id));

  if (!failure) {
    notFound();
  }

  const attachments = getAttachmentsByFailureId(failure.id);
  const isResolved = failure.status === "조치완료";

  return (
    <div>
      <Header title="고장이력 상세보기" />
      <main className="p-container-padding">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-stack-lg">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`px-3 py-1 rounded text-label-caps font-bold flex items-center gap-1 ${
                  isResolved ? "bg-green-100 text-status-success" : "bg-error-container text-on-error-container"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">priority_high</span>
                {failure.status || "상태 미상"}
              </span>
              <span className="text-outline text-body-sm">ID: {failure.id}</span>
            </div>
            <h2 className="text-display-lg font-display-lg text-primary mb-2">{failure.title || "(제목 없음)"}</h2>
            <div className="flex items-center gap-6 text-on-surface-variant">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                <span className="font-bold">발생: {formatDatetimeDisplay(failure.occurred_at)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">history</span>
                <span className="font-bold">복구: {formatDatetimeDisplay(failure.recovered_at)}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            {!isResolved && <CompleteStatusAction failureId={failure.id} />}
            <Link
              href={`/history/${failure.id}/edit`}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary text-primary font-bold hover:bg-primary/5"
            >
              <span className="material-symbols-outlined text-[20px]">edit</span>수정
            </Link>
            <Link
              href="/history"
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-outline text-on-surface font-bold hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-[20px]">list</span>목록으로
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter mb-stack-lg">
          <div className="lg:col-span-2 bg-white border border-border-subtle rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6 text-primary">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                info
              </span>
              <h3 className="font-title-sm text-title-sm">기본 정보</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-4">
              <Field label="지사" value={failure.branch} />
              <Field label="설비명" value={failure.equipment_name} />
              <Field label="기기명(고장위치)" value={failure.device_name} />
              <Field label="고장분야" value={failure.failure_field} />
            </div>
          </div>
          <div className="bg-white border border-border-subtle rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6 text-status-critical">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                block
              </span>
              <h3 className="font-title-sm text-title-sm">공급중단 현황</h3>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-surface-container">
                <span>APT 세대수</span>
                <span className="font-headline-md text-primary">{failure.apt_count || "-"} 세대</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-surface-container">
                <span>건물 개소</span>
                <span className="font-headline-md text-primary">{failure.building_count || "-"} 개소</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-surface-container">
                <span>중단시간</span>
                <span className="font-headline-md text-status-critical">{failure.interruption_duration || "-"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Section icon="badge" title="담당자">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="고장원인 담당자" value={failure.cause_manager_raw} />
              <Field label="고장원인 책임자" value={failure.cause_owner_raw} />
            </div>
          </Section>
          <Section icon="sensors" title="고장 상황 (Scenario)">
            {failure.situation || "등록된 상황 내용이 없습니다."}
          </Section>
          <Section icon="warning" iconClass="text-status-warning" title="보안·경보장치 동작상태">
            {failure.alarm_status || "-"}
          </Section>
          <Section icon="psychology" title="원인 분석 (4M+1)">
            {failure.cause_4m1e || "등록된 원인 분석 내용이 없습니다."}
          </Section>
          <Section icon="bolt" iconClass="text-status-warning" title="장애현황">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="고장지장열(전력)량" value={failure.impact_heat_loss} />
              <Field label="고장 지장 기간" value={failure.impact_duration} />
              <Field label="응급처리" value={failure.emergency_action} />
            </div>
          </Section>
          <Section icon="build" title="복구내용">
            {failure.recovery_detail || "등록된 복구 내용이 없습니다."}
          </Section>
          <Section icon="verified" title="재발 방지 대책">
            {failure.recurrence_prevention || "등록된 재발 방지 대책이 없습니다."}
          </Section>
          <section className="bg-white border border-border-subtle rounded-xl overflow-hidden shadow-sm">
            <div className="bg-table-header px-6 py-3 border-b border-border-subtle flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">attach_file</span>
              <h4 className="font-bold">첨부파일</h4>
            </div>
            <div className="p-6">
              {attachments.length === 0 ? (
                <p className="text-on-surface-variant text-body-sm">첨부된 파일이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {attachments.map((att) => (
                    <li key={att.id} className="flex items-center gap-2 text-body-sm">
                      <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                      <a href={`/api/attachments/${att.id}`} className="text-primary hover:underline" download>
                        {att.file_name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
