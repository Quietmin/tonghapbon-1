"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Icon } from "@/shared/components/ui";
import { BRANCHES, FAULT_FIELDS, sortKorean } from "@/modules/docgen/lib/constants";
import type { AttachmentInput, FailureHistoryInput } from "@/modules/failure/lib/repo";

const STATUS_OPTIONS = ["조치중", "조치완료"];
const BRANCH_OPTIONS = sortKorean(BRANCHES);

type FormState = Required<{ [K in keyof FailureHistoryInput]: string }>;

const EMPTY: FormState = {
  title: "",
  branch: "",
  heatFacility: "",
  equipmentName: "",
  deviceName: "",
  failureField: "",
  status: "조치중",
  occurredAt: "",
  recoveredAt: "",
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
  recoveryDetail: "",
  recurrencePrevention: "",
  contentSummary: "",
  reporter: "",
  source: "",
};

/** 빈 칸에 붙이는 공통 표시 — PDF로 못 채운 칸과 원래부터 안 채운 칸을 같은 방식으로 알려준다 */
const EMPTY_FIELD_CLASS = "border-status-warning/50 bg-status-warning/5";

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-on-surface-variant">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input ${value.trim() ? "" : EMPTY_FIELD_CLASS}`}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "선택",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input ${value.trim() ? "" : EMPTY_FIELD_CLASS}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-on-surface-variant">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`input ${value.trim() ? "" : EMPTY_FIELD_CLASS}`}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card lift={false} className="p-6 flex flex-col gap-4">
      <h3 className="text-title-sm font-bold text-on-surface">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </Card>
  );
}

const FIELD_KEYS = Object.keys(EMPTY) as (keyof FormState)[];

export interface FailureHistoryFormProps {
  /** 일괄 업로드 큐에서 이미 추출된 값으로 미리 채울 때 쓴다 (null은 빈 문자열로 처리) */
  initialForm?: Partial<FailureHistoryInput>;
  initialAttachment?: AttachmentInput | null;
  /** 큐에서 검토용으로 펼쳤을 때는 드롭존을 다시 보여줄 필요가 없다 (기본값 true) */
  showDropzone?: boolean;
  /** 있으면 저장 후 내부 완료 화면 대신 이걸 부른다 — 큐 목록이 자기 상태를 갱신하도록 */
  onSaved?: (id: string) => void;
  /** 큐에서 검토 패널을 접을 때 쓰는 취소 버튼 (없으면 안 보임) */
  onCancel?: () => void;
}

/**
 * 고장이력 수기 등록.
 *
 * PDF를 올리면(드래그앤드롭 또는 파일 선택) "고장상보" 양식에서 뽑아낼 수 있는
 * 항목만 채우고, 못 뽑아낸 칸은 비워 둔 채 노란 음영으로 표시한다 — 그 칸들이
 * 사람이 직접 채워야 할 곳이다. PDF 없이 처음부터 전부 손으로 입력해도 된다
 * (그 경우엔 안 채운 칸이 전부 음영으로 보인다).
 *
 * 일괄 업로드 큐 목록에서 파일 하나를 검토할 때도 이 폼을 그대로 쓴다
 * (initialForm/initialAttachment로 미리 채우고, showDropzone=false로 드롭존만 숨김).
 */
export default function FailureHistoryForm({
  initialForm,
  initialAttachment = null,
  showDropzone = true,
  onSaved,
  onCancel,
}: FailureHistoryFormProps = {}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => {
    const next = { ...EMPTY };
    for (const key of FIELD_KEYS) {
      const v = initialForm?.[key];
      if (typeof v === "string") next[key] = v;
    }
    return next;
  });
  const [attachment, setAttachment] = useState<AttachmentInput | null>(initialAttachment);
  const [extracting, setExtracting] = useState(false);
  const [extractWarning, setExtractWarning] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFile(file: File) {
    setExtracting(true);
    setExtractWarning(null);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/failure/extract", { method: "POST", body });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "PDF를 처리하지 못했습니다.");

      // 뽑아낸 값만 덮어쓴다 — 못 뽑은 칸은 손대지 않아 이미 입력해 둔 내용을 지우지 않는다.
      setForm((prev) => {
        const next = { ...prev };
        for (const key of FIELD_KEYS) {
          const v = data.fields?.[key];
          if (typeof v === "string" && v.trim()) next[key] = v;
        }
        return next;
      });
      setAttachment(data.attachment ?? null);
      if (data.warning) setExtractWarning(data.warning);
    } catch (e) {
      setExtractWarning(e instanceof Error ? e.message : "PDF를 처리하지 못했습니다.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!form.title.trim() && !form.equipmentName.trim()) {
      setError("고장제목 또는 설비명 중 하나는 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/failure/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, attachment }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "저장에 실패했습니다.");
      if (onSaved) onSaved(data.id);
      else setSavedId(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (savedId) {
    return (
      <Card className="p-8 flex flex-col items-center text-center gap-3">
        <Icon name="check_circle" className="text-4xl text-status-success" />
        <p className="text-title-sm font-bold text-on-surface">고장이력이 등록되었습니다.</p>
        <p className="text-sm text-on-surface-variant">
          {form.equipmentName || form.title} · {form.occurredAt || "발생일시 미입력"}
        </p>
        <div className="flex gap-2 mt-2">
          <Button
            variant="ghost"
            onClick={() => {
              setForm(EMPTY);
              setAttachment(null);
              setExtractWarning(null);
              setSavedId(null);
            }}
          >
            <Icon name="add" className="text-base" /> 새로 등록
          </Button>
          <Button variant="primary" onClick={() => router.push("/failure")}>
            고장관리 홈으로
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {showDropzone && (
      <Card
        lift={false}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`p-6 flex flex-col items-center gap-2 text-center cursor-pointer border-2 border-dashed transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border-subtle"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <Icon name={extracting ? "hourglass_top" : "upload_file"} className="text-3xl text-on-surface-variant" />
        <p className="text-sm font-bold text-on-surface">
          {extracting
            ? "PDF에서 항목을 읽는 중…"
            : attachment
              ? `첨부됨: ${attachment.fileName} (다른 파일로 교체하려면 클릭)`
              : "고장상보 PDF를 여기로 끌어놓거나 클릭해서 선택하세요"}
        </p>
        <p className="text-xs text-on-surface-variant">
          뽑아낼 수 있는 항목만 자동으로 채워집니다. PDF 없이 아래에서 직접 입력해도 됩니다.
        </p>
      </Card>
      )}

      {extractWarning && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-status-warning/10 text-status-warning text-sm">
          <Icon name="info" className="text-base" />
          {extractWarning}
        </div>
      )}

      <Section title="기본 정보">
        <Field label="고장제목" value={form.title} onChange={(v) => set("title", v)} placeholder="예: IP Drum Level HH 트립" />
        <Select label="지사" value={form.branch} onChange={(v) => set("branch", v)} options={BRANCH_OPTIONS} />
        <Field label="설비명" value={form.equipmentName} onChange={(v) => set("equipmentName", v)} placeholder="예: GT" />
        <Field label="기기명(고장위치)" value={form.deviceName} onChange={(v) => set("deviceName", v)} />
        <Select label="고장분야" value={form.failureField} onChange={(v) => set("failureField", v)} options={FAULT_FIELDS} />
        <Select label="상태" value={form.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} placeholder="선택 안 함" />
        <Field label="발생일시" type="datetime-local" value={form.occurredAt} onChange={(v) => set("occurredAt", v)} />
        <Field label="복구일시" type="datetime-local" value={form.recoveredAt} onChange={(v) => set("recoveredAt", v)} />
        <Field label="열공급시설" value={form.heatFacility} onChange={(v) => set("heatFacility", v)} />
      </Section>

      <Section title="공급중단 현황">
        <Field label="APT(세대)" value={form.aptCount} onChange={(v) => set("aptCount", v)} />
        <Field label="건물(개소)" value={form.buildingCount} onChange={(v) => set("buildingCount", v)} />
        <Field label="중단시간" value={form.interruptionDuration} onChange={(v) => set("interruptionDuration", v)} />
        <Field label="기간" value={form.interruptionPeriod} onChange={(v) => set("interruptionPeriod", v)} />
      </Section>

      <Section title="담당자">
        <Field label="고장원인 담당자" value={form.causeManagerRaw} onChange={(v) => set("causeManagerRaw", v)} placeholder="예: 복합운영4과 안효원" />
        <Field label="고장원인 책임자" value={form.causeOwnerRaw} onChange={(v) => set("causeOwnerRaw", v)} placeholder="예: 복합운영부 송승현" />
      </Section>

      <Section title="상황·원인">
        <div className="sm:col-span-2">
          <TextArea label="상황 (운전자/목격자 진술 포함)" value={form.situation} onChange={(v) => set("situation", v)} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="보안·경보장치 동작상태" value={form.alarmStatus} onChange={(v) => set("alarmStatus", v)} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="원인 (4M+1분석)" value={form.cause4m1e} onChange={(v) => set("cause4m1e", v)} />
        </div>
      </Section>

      <Section title="장애현황·복구">
        <Field label="고장지장열(전력)량" value={form.impactHeatLoss} onChange={(v) => set("impactHeatLoss", v)} placeholder="예: Gcal / MWh" />
        <Field label="고장 지장 기간" value={form.impactDuration} onChange={(v) => set("impactDuration", v)} />
        <div className="sm:col-span-2">
          <TextArea label="응급처리" value={form.emergencyAction} onChange={(v) => set("emergencyAction", v)} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="복구내용" value={form.recoveryDetail} onChange={(v) => set("recoveryDetail", v)} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="재발 방지 대책" value={form.recurrencePrevention} onChange={(v) => set("recurrencePrevention", v)} />
        </div>
      </Section>

      <Section title="기타">
        <div className="sm:col-span-2">
          <TextArea label="비고·요약" value={form.contentSummary} onChange={(v) => set("contentSummary", v)} rows={2} />
        </div>
        <Field label="작성자" value={form.reporter} onChange={(v) => set("reporter", v)} />
      </Section>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-status-error/10 text-status-error text-sm">
          <Icon name="error" className="text-base" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pb-6">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            취소
          </Button>
        )}
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중…" : "등록"}
        </Button>
      </div>
    </div>
  );
}
