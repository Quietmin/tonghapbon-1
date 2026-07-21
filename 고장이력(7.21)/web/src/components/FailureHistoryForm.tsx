"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import type { ExtractedFailureFields } from "@/lib/parseFailureReport";
import { FAILURE_FIELD_OPTIONS, STATUS_OPTIONS } from "@/lib/constants";

const ALLOWED_EXTENSIONS = ["pdf", "hwp", "hwpx"];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export type FormState = Required<ExtractedFailureFields> & {
  title: string;
  failureField: string;
  status: string;
};

export const EMPTY_FORM: FormState = {
  title: "",
  failureField: "",
  status: "조치중",
  occurredAt: "",
  branch: "",
  equipmentName: "",
  deviceName: "",
  aptCount: "",
  buildingCount: "",
  interruptionDuration: "",
  interruptionPeriod: "",
  causeManagerRaw: "",
  causeOwnerRaw: "",
  situation: "",
  alarmStatus: "",
  cause4m1e: "",
  impactHeatLoss: "",
  impactDuration: "",
  emergencyAction: "",
  recoveredAt: "",
  recoveryDetail: "",
  recurrencePrevention: "",
};

type UploadState = "idle" | "uploading" | "done" | "error";
type SaveState = "idle" | "saving" | "error";
interface NewAttachment {
  fileName: string;
  storedName: string;
}
export interface ExistingAttachment {
  id: number;
  fileName: string;
}

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

/** Blank fields get a dashed amber border + tint so they're easy to spot before saving. */
function fieldClass(value: string): string {
  const isEmpty = !value || !value.trim();
  return isEmpty
    ? "w-full rounded-lg border-2 border-dashed border-status-warning bg-status-warning/5"
    : "w-full rounded-lg border border-border-subtle bg-white";
}

export default function FailureHistoryForm({
  mode,
  failureId,
  headerTitle,
  initialValues,
  initialAttachments = [],
}: {
  mode: "create" | "edit";
  failureId?: number;
  headerTitle: string;
  initialValues?: FormState;
  initialAttachments?: ExistingAttachment[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(initialValues ?? EMPTY_FORM);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [newAttachments, setNewAttachments] = useState<NewAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const setField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleFile = async (file: File) => {
    const extension = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setUploadState("error");
      setUploadMessage("엑셀, 한글(HWP), PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadState("error");
      setUploadMessage("파일 용량은 최대 20MB까지 지원합니다.");
      return;
    }

    setUploadState("uploading");
    setUploadMessage(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/extract-failure-report", { method: "POST", body });
      const data = await res.json();

      // The file is saved server-side for parsing regardless of outcome, so
      // keep it attached even when field extraction itself failed.
      if (data.attachment) {
        setNewAttachments((prev) => [...prev, data.attachment as NewAttachment]);
      }

      if (!res.ok) {
        setUploadState("error");
        setUploadMessage(data.error ?? "업로드 중 오류가 발생했습니다. 다시 시도해주세요.");
        return;
      }

      const fields: ExtractedFailureFields = data.fields ?? {};
      setForm((prev) => {
        const next = { ...prev };
        (Object.keys(fields) as (keyof ExtractedFailureFields)[]).forEach((key) => {
          const value = fields[key];
          if (value) next[key] = value;
        });
        return next;
      });
      setUploadState("done");
      setUploadMessage(data.warning ?? "자동 추출 완료 - 내용을 검토하고 저장해주세요");
    } catch {
      setUploadState("error");
      setUploadMessage("업로드 중 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.");
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleSave = async () => {
    if (!form.title.trim() && !form.equipmentName.trim()) {
      setSaveState("error");
      setSaveError("고장제목 또는 설비명 중 하나는 입력해주세요.");
      return;
    }

    setSaveState("saving");
    setSaveError(null);

    const url = mode === "create" ? "/api/failure-history" : `/api/failure-history/${failureId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, attachments: newAttachments }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSaveState("error");
        setSaveError(data.error ?? "저장 중 오류가 발생했습니다.");
        return;
      }

      router.push(`/history/${mode === "create" ? data.id : failureId}`);
    } catch {
      setSaveState("error");
      setSaveError("저장 중 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.");
    }
  };

  return (
    <div>
      <Header title={headerTitle} />
      <main className="p-container-padding max-w-[1600px] mx-auto w-full space-y-gutter">
        <section className="bg-white border border-border-subtle rounded-xl p-8 text-center space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.hwp,.hwpx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-lg p-10 transition-all cursor-pointer group ${
              isDragging ? "border-primary bg-primary-container/10" : "border-outline-variant hover:bg-primary-container/5"
            }`}
          >
            <span className="material-symbols-outlined text-primary/40 text-5xl mb-4 group-hover:scale-110 transition-transform block">
              {uploadState === "uploading" ? "hourglass_top" : "upload_file"}
            </span>
            <h3 className="text-title-sm font-title-sm text-primary">PDF/HWP 파일을 올리면 자동으로 내용을 채워줍니다</h3>
            <p className="text-on-surface-variant text-body-sm mt-2">파일을 드래그하거나 클릭하여 선택하세요 (PDF, HWP, 최대 20MB)</p>
          </div>
          {uploadState === "uploading" && (
            <div className="bg-surface-container-low border border-border-subtle text-on-surface-variant px-6 py-4 rounded-lg flex items-center gap-3">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span className="font-bold">업로드 및 분석 중...</span>
            </div>
          )}
          {uploadState === "done" && (
            <div className="bg-secondary-container/50 border border-secondary text-on-secondary-container px-6 py-4 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-status-success">check_circle</span>
                <span className="font-bold">{uploadMessage}</span>
              </div>
            </div>
          )}
          {uploadState === "error" && (
            <div className="bg-error-container/50 border border-error text-on-error-container px-6 py-4 rounded-lg flex items-center gap-3">
              <span className="material-symbols-outlined text-status-critical">error</span>
              <span className="font-bold">{uploadMessage}</span>
            </div>
          )}
        </section>

        <form className="space-y-gutter" onSubmit={(e) => e.preventDefault()}>
          <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-status-warning bg-status-warning/5" />
            점선으로 표시된 항목은 아직 비어있습니다
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            <div className="bg-white border border-border-subtle rounded-lg p-gutter md:col-span-2">
              <div className="flex items-center gap-2 mb-6 border-b border-border-subtle pb-3">
                <span className="material-symbols-outlined text-primary">info</span>
                <h2 className="text-title-sm font-bold">기본 정보</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-stack-md">
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block">고장제목</label>
                  <input className={fieldClass(form.title)} value={form.title} onChange={setField("title")} placeholder="예: HP Drum Level LL로 인한 불시정지" />
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block">지사</label>
                  <input className={fieldClass(form.branch)} value={form.branch} onChange={setField("branch")} placeholder="예: 청주지사" />
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block">설비명</label>
                  <input className={fieldClass(form.equipmentName)} value={form.equipmentName} onChange={setField("equipmentName")} placeholder="예: GT" />
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block">기기명(고장위치)</label>
                  <input className={fieldClass(form.deviceName)} value={form.deviceName} onChange={setField("deviceName")} placeholder="예: GT Turning Motor" />
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block">고장분야</label>
                  <select className={fieldClass(form.failureField)} value={form.failureField} onChange={setField("failureField")}>
                    <option value="">선택</option>
                    {FAILURE_FIELD_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block">상태</label>
                  <select className="w-full rounded-lg border border-border-subtle bg-white" value={form.status} onChange={setField("status")}>
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block">발생일시</label>
                  <input type="datetime-local" className={fieldClass(form.occurredAt)} value={form.occurredAt} onChange={setField("occurredAt")} />
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block">복구일시</label>
                  <input type="datetime-local" className={fieldClass(form.recoveredAt)} value={form.recoveredAt} onChange={setField("recoveredAt")} />
                </div>
              </div>
            </div>
            <div className="bg-white border border-border-subtle rounded-lg p-gutter">
              <div className="flex items-center gap-2 mb-6 border-b border-border-subtle pb-3">
                <span className="material-symbols-outlined text-status-critical">report_problem</span>
                <h2 className="text-title-sm font-bold">공급중단 현황</h2>
              </div>
              <div className="grid grid-cols-2 gap-stack-md">
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block uppercase">APT 세대수</label>
                  <input className={fieldClass(form.aptCount)} value={form.aptCount} onChange={setField("aptCount")} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block uppercase">건물 개소</label>
                  <input className={fieldClass(form.buildingCount)} value={form.buildingCount} onChange={setField("buildingCount")} placeholder="0" />
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block uppercase">중단시간</label>
                  <input className={fieldClass(form.interruptionDuration)} value={form.interruptionDuration} onChange={setField("interruptionDuration")} placeholder="0" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
            <div className="bg-white border border-border-subtle rounded-lg p-gutter">
              <div className="flex items-center gap-2 mb-6 border-b border-border-subtle pb-3">
                <span className="material-symbols-outlined text-primary">badge</span>
                <h2 className="text-title-sm font-bold">담당자</h2>
              </div>
              <div className="space-y-stack-md">
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block">고장원인 담당자</label>
                  <input className={fieldClass(form.causeManagerRaw)} value={form.causeManagerRaw} onChange={setField("causeManagerRaw")} placeholder="예: 계전부 제어 김영수" />
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block">고장원인 책임자</label>
                  <input className={fieldClass(form.causeOwnerRaw)} value={form.causeOwnerRaw} onChange={setField("causeOwnerRaw")} placeholder="예: 계전부 이용하" />
                </div>
              </div>
            </div>
            <div className="bg-white border border-border-subtle rounded-lg p-gutter">
              <div className="flex items-center gap-2 mb-6 border-b border-border-subtle pb-3">
                <span className="material-symbols-outlined text-status-warning">bolt</span>
                <h2 className="text-title-sm font-bold">장애현황</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-stack-md">
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block uppercase">고장지장열(전력)량</label>
                  <input className={fieldClass(form.impactHeatLoss)} value={form.impactHeatLoss} onChange={setField("impactHeatLoss")} placeholder="Gcal / MWh" />
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block uppercase">고장 지장 기간</label>
                  <input className={fieldClass(form.impactDuration)} value={form.impactDuration} onChange={setField("impactDuration")} placeholder="~" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-label-caps font-bold text-on-surface-variant block uppercase">응급처리</label>
                  <input className={fieldClass(form.emergencyAction)} value={form.emergencyAction} onChange={setField("emergencyAction")} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-border-subtle rounded-lg p-gutter space-y-stack-md">
            <div className="flex items-center gap-2 mb-2 border-b border-border-subtle pb-3">
              <span className="material-symbols-outlined text-primary">sensors</span>
              <h2 className="text-title-sm font-bold">상세 서술</h2>
            </div>
            <div className="space-y-2">
              <label className="text-label-caps font-bold text-on-surface-variant block">상황 (운전자/목격자 진술 포함)</label>
              <textarea className={fieldClass(form.situation)} rows={4} value={form.situation} onChange={setField("situation")} />
            </div>
            <div className="space-y-2">
              <label className="text-label-caps font-bold text-on-surface-variant block">보안·경보장치 동작상태</label>
              <textarea className={fieldClass(form.alarmStatus)} rows={2} value={form.alarmStatus} onChange={setField("alarmStatus")} />
            </div>
            <div className="space-y-2">
              <label className="text-label-caps font-bold text-on-surface-variant block">원인 (4M+1분석)</label>
              <textarea className={fieldClass(form.cause4m1e)} rows={4} value={form.cause4m1e} onChange={setField("cause4m1e")} />
            </div>
            <div className="space-y-2">
              <label className="text-label-caps font-bold text-on-surface-variant block">복구내용</label>
              <textarea className={fieldClass(form.recoveryDetail)} rows={4} value={form.recoveryDetail} onChange={setField("recoveryDetail")} />
            </div>
            <div className="space-y-2">
              <label className="text-label-caps font-bold text-on-surface-variant block">재발 방지 대책</label>
              <textarea className={fieldClass(form.recurrencePrevention)} rows={3} value={form.recurrencePrevention} onChange={setField("recurrencePrevention")} />
            </div>
          </div>

          {(initialAttachments.length > 0 || newAttachments.length > 0) && (
            <div className="bg-white border border-border-subtle rounded-lg p-gutter">
              <div className="flex items-center gap-2 mb-4 border-b border-border-subtle pb-3">
                <span className="material-symbols-outlined text-primary">attach_file</span>
                <h2 className="text-title-sm font-bold">첨부파일</h2>
              </div>
              <ul className="space-y-2">
                {initialAttachments.map((att) => (
                  <li key={`existing-${att.id}`} className="flex items-center gap-2 text-body-sm">
                    <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                    <a href={`/api/attachments/${att.id}`} className="text-primary hover:underline" download>
                      {att.fileName}
                    </a>
                  </li>
                ))}
                {newAttachments.map((att) => (
                  <li key={`new-${att.storedName}`} className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[18px]">description</span>
                    {att.fileName} <span className="text-xs">(신규)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {saveState === "error" && saveError && (
            <div className="bg-error-container/50 border border-error text-on-error-container px-6 py-4 rounded-lg flex items-center gap-3">
              <span className="material-symbols-outlined text-status-critical">error</span>
              <span className="font-bold">{saveError}</span>
            </div>
          )}

          <div className="flex justify-end gap-stack-md pt-stack-lg">
            <button
              type="button"
              onClick={() => router.push(mode === "edit" ? `/history/${failureId}` : "/history")}
              className="px-8 py-3 rounded-lg border border-primary text-primary font-bold"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="px-10 py-3 rounded-lg bg-primary text-on-primary font-bold shadow-lg disabled:opacity-60"
            >
              {saveState === "saving" ? "저장 중..." : "최종 저장"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
