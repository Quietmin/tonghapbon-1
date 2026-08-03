"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import type { ExtractedFailureFields } from "@/lib/parseFailureReport";
import { formatDatetimeDisplay } from "@/lib/datetime";

const ALLOWED_EXTENSIONS = ["pdf", "hwp", "hwpx"];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

type EntryStatus = "pending" | "processing" | "done" | "error";

interface FileEntry {
  key: string;
  file: File;
  status: EntryStatus;
  message?: string;
  resultId?: number;
  summary?: { branch?: string; equipmentName?: string; occurredAt?: string };
}

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

/** PDF reports don't carry an explicit title field, so build a readable one from what was extracted. */
function buildTitle(fields: Partial<ExtractedFailureFields>, fallback: string): string {
  const parts = [fields.branch, fields.equipmentName, fields.deviceName].filter(Boolean);
  return parts.length > 0 ? `${parts.join(" ")} 고장` : fallback;
}

export default function BulkUploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const updateEntry = (key: string, patch: Partial<FileEntry>) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  };

  const processFiles = async (files: File[]) => {
    const newEntries: FileEntry[] = files.map((file) => {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      const ext = getExtension(file.name);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { key, file, status: "error" as const, message: "PDF/HWP 파일만 지원합니다." };
      }
      if (file.size > MAX_FILE_SIZE) {
        return { key, file, status: "error" as const, message: "파일 용량은 최대 20MB까지 지원합니다." };
      }
      return { key, file, status: "pending" as const };
    });

    setEntries((prev) => [...prev, ...newEntries]);

    for (const entry of newEntries) {
      if (entry.status !== "pending") continue;
      updateEntry(entry.key, { status: "processing" });

      try {
        const extractBody = new FormData();
        extractBody.append("file", entry.file);
        const extractRes = await fetch("/api/extract-failure-report", { method: "POST", body: extractBody });
        const extractData = await extractRes.json();

        if (!extractRes.ok) {
          updateEntry(entry.key, { status: "error", message: extractData.error ?? "추출에 실패했습니다." });
          continue;
        }

        const fields: Partial<ExtractedFailureFields> = extractData.fields ?? {};
        const title = buildTitle(fields, entry.file.name.replace(/\.[^.]+$/, ""));

        const createRes = await fetch("/api/failure-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...fields,
            title,
            status: fields.recoveredAt ? "조치완료" : "조치중",
            source: "parsed",
            attachments: extractData.attachment ? [extractData.attachment] : [],
          }),
        });
        const createData = await createRes.json();

        if (!createRes.ok) {
          updateEntry(entry.key, { status: "error", message: createData.error ?? "등록에 실패했습니다." });
          continue;
        }

        updateEntry(entry.key, {
          status: "done",
          resultId: createData.id,
          summary: { branch: fields.branch, equipmentName: fields.equipmentName, occurredAt: fields.occurredAt },
        });
      } catch {
        updateEntry(entry.key, { status: "error", message: "처리 중 오류가 발생했습니다." });
      }
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void processFiles(files);
  };

  const doneCount = entries.filter((e) => e.status === "done").length;
  const errorCount = entries.filter((e) => e.status === "error").length;

  return (
    <div>
      <Header title="고장상보 일괄등록" />
      <main className="p-container-padding max-w-[1600px] mx-auto w-full space-y-gutter">
        <div className="bg-surface-container-low border border-border-subtle rounded-lg p-6 flex items-start gap-4">
          <span className="material-symbols-outlined text-primary-container mt-1">info</span>
          <div>
            <h3 className="text-primary font-bold text-body-md mb-2">여러 건을 한 번에 등록합니다</h3>
            <p className="text-secondary text-body-sm leading-relaxed">
              고장상보 PDF(또는 HWP) 파일을 여러 개 선택하거나 드래그하면, 파일마다 자동으로 항목을 추출해
              검토 없이 바로 고장이력으로 등록합니다. 등록 전에 내용을 검토하고 싶다면{" "}
              <Link href="/history/new" className="text-primary underline font-bold">
                신규 등록
              </Link>{" "}
              화면에서 한 건씩 처리해주세요.
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.hwp,.hwpx"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void processFiles(files);
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
          className={`bg-white border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
            isDragging ? "border-primary bg-primary-container/10" : "border-outline-variant hover:bg-primary/5"
          }`}
        >
          <span className="material-symbols-outlined text-3xl text-primary/60 mb-4">upload_file</span>
          <h4 className="text-title-sm font-bold text-primary mb-1">고장상보 PDF/HWP 여러 개 업로드</h4>
          <p className="text-on-surface-variant text-body-sm">파일을 드래그하거나 클릭하여 여러 개 선택하세요 (파일당 최대 20MB)</p>
        </div>

        {entries.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white border border-border-subtle rounded-lg p-4">
                <p className="text-xs font-label-caps text-outline mb-1">총 파일수</p>
                <p className="text-2xl font-bold text-primary">{entries.length}건</p>
              </div>
              <div className="bg-white border border-border-subtle rounded-lg p-4 border-l-4 border-l-status-success">
                <p className="text-xs font-label-caps text-outline mb-1">등록 완료</p>
                <p className="text-2xl font-bold text-status-success">{doneCount}건</p>
              </div>
              <div className="bg-white border border-border-subtle rounded-lg p-4 border-l-4 border-l-status-critical">
                <p className="text-xs font-label-caps text-outline mb-1">실패</p>
                <p className="text-2xl font-bold text-status-critical">{errorCount}건</p>
              </div>
            </div>

            <div className="bg-white border border-border-subtle rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-table-header border-b border-border-subtle">
                    <th className="px-4 py-3 text-label-caps text-on-surface-variant">파일명</th>
                    <th className="px-4 py-3 text-label-caps text-on-surface-variant">지사 / 설비명</th>
                    <th className="px-4 py-3 text-label-caps text-on-surface-variant">발생일시</th>
                    <th className="px-4 py-3 text-label-caps text-on-surface-variant">상태</th>
                    <th className="px-4 py-3 text-label-caps text-on-surface-variant text-right">결과</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-body-sm">
                  {entries.map((entry) => (
                    <tr key={entry.key}>
                      <td className="px-4 py-3 truncate max-w-[200px]">{entry.file.name}</td>
                      <td className="px-4 py-3">
                        {entry.summary ? [entry.summary.branch, entry.summary.equipmentName].filter(Boolean).join(" / ") || "-" : "-"}
                      </td>
                      <td className="px-4 py-3 font-data-mono text-secondary">{formatDatetimeDisplay(entry.summary?.occurredAt)}</td>
                      <td className="px-4 py-3">
                        {entry.status === "pending" && <span className="text-on-surface-variant">대기 중</span>}
                        {entry.status === "processing" && (
                          <span className="text-primary flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>처리 중
                          </span>
                        )}
                        {entry.status === "done" && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-status-success">등록됨</span>
                        )}
                        {entry.status === "error" && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-status-critical">실패</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {entry.status === "done" && entry.resultId && (
                          <Link href={`/history/${entry.resultId}`} className="text-primary font-bold hover:underline">
                            상세보기 →
                          </Link>
                        )}
                        {entry.status === "error" && <span className="text-status-critical text-xs">{entry.message}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
