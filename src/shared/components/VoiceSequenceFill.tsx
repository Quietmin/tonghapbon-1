"use client";

/**
 * 칸을 순서대로 도는 음성 받아쓰기 — "매뉴얼 종류 → 분야 → 지사 → … → 주의사항"처럼
 * 화면 위에서 아래로 여러 칸을 한 번에 채울 때 쓴다(매뉴얼 작성·고장보고서 작성·
 * 현황 작성 머리말). 사진 설명칸처럼 "버튼 하나 = 칸 하나"면 VoiceDictationButton
 * 을 대신 쓴다.
 *
 * 동작 방식 — 전부 "사용자가 직접 확인한 동작"만 한다(자동으로 넘어가지 않는다):
 *   1. 빨간 녹음 버튼을 눌러 한 칸을 녹음하고, 다시 눌러 멈춘다.
 *   2. 멈추면 그 구간을 OpenAI STT로 한 번에 받아쓰고(api/voice/transcribe), 칸
 *      맥락에 맞게 GPT가 정리한 값을 그 칸에 그대로 채운다 — 화면의 실제 입력칸에
 *      바로 보이므로, 사용자가 직접 타이핑으로 고칠 수도 있다.
 *   3. 내용을 확인한 뒤 "다음"을 눌러야만 다음 칸으로 넘어간다. "이전"을 누르면
 *      한 칸 되돌아간다(값은 그대로 두니 다시 녹음하면 덮어써진다).
 *
 * 예전에는 브라우저 Web Speech API를 연속 인식 모드로 돌리면서 "몇 초 멈추면 자동으로
 * 다음 칸" 같은 타이머를 뒀는데, 그 엔진이 같은 구간을 중복으로 확정해 텍스트가
 * 반복되고, 사용자가 말을 끝내기도 전에 제멋대로 다음 칸으로 넘어가 조절하기 어려웠다
 * (사용자가 실제로 겪은 문제). "녹음 한 번 = 전사 한 번, 전진은 사용자가 직접"으로
 * 바꿔서 둘 다 없앴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dialog, { DialogHeader } from "./Dialog";
import { Button, Icon } from "./ui";
import { isVoiceRecordingSupported, useAudioRecorder, transcribeAudio } from "@/shared/lib/voiceRecording";

export type VoiceFieldKind = "short" | "long";

export interface VoiceField {
  key: string;
  /** 설명 팝업·진행 표시에 쓰는 이름 */
  label: string;
  kind: VoiceFieldKind;
  setValue: (text: string) => void;
  /** select 류 칸이면 후보를 준다 — GPT가 이 중 하나만 고르도록 요청한다 */
  options?: readonly string[];
  /** 이 칸으로 넘어갈 때 화면에 보이도록 스크롤·포커스할 엘리먼트 */
  getElement?: () => HTMLElement | null;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

/** 서버가 보기 중 하나를 그대로 돌려줬는지 마지막으로 한 번 더 확인한다(안전망) —
 *  못 찾으면 null 을 돌려주고, 호출부는 그 값을 칸에 넣지 않는다(엉뚱한 값이
 *  select 상태로 들어가는 것을 막는다). */
function matchOption(heard: string, options: readonly string[]): string | null {
  const h = normalize(heard);
  if (!h) return null;
  const exact = options.find((o) => normalize(o) === h);
  if (exact) return exact;
  const partial = options.find((o) => {
    const no = normalize(o);
    return h.includes(no) || no.includes(h);
  });
  return partial ?? null;
}

type Phase = "idle" | "explain" | "active";

/** 지금 음성으로 채우는 중인 칸에 둘러서, 여러 칸 중 "지금 이 칸"을 한눈에 알아보게 한다 */
const HIGHLIGHT_CLASSES = ["ring-2", "ring-red-500", "rounded-lg"];

export default function VoiceSequenceFill({
  fields,
  title = "음성으로 한 번에 입력하기",
}: {
  fields: VoiceField[];
  title?: string;
}) {
  // 처음 그릴 때는 무조건 false 로 시작한다 — 서버·클라이언트 첫 그림을 맞춰
  // 하이드레이션 경고를 막는다(VoiceDictationButton.tsx 와 같은 이유).
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(isVoiceRecordingSupported());
  }, []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useAudioRecorder();

  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;
  // 직전 칸에 둘렀던 빨간 테두리 — 다음 칸으로 넘어가면 떼어 내야 한다
  const highlightedRef = useRef<HTMLElement | null>(null);

  const clearHighlight = useCallback(() => {
    highlightedRef.current?.classList.remove(...HIGHLIGHT_CLASSES);
    highlightedRef.current = null;
  }, []);

  const scrollToField = useCallback(
    (field: VoiceField | undefined) => {
      clearHighlight();
      const el = field?.getElement?.();
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLElement) {
        el.focus?.({ preventScroll: true });
        el.classList.add(...HIGHLIGHT_CLASSES);
        highlightedRef.current = el;
      }
    },
    [clearHighlight],
  );

  const begin = useCallback(() => {
    if (!supported) return;
    setError(null);
    setNotice(null);
    setPhase("explain");
  }, [supported]);

  const confirmStart = useCallback(() => {
    setActiveIndex(0);
    setNotice(null);
    setError(null);
    setPhase("active");
    scrollToField(fieldsRef.current[0]);
  }, [scrollToField]);

  const finish = useCallback((msg?: string) => {
    recorder.cancel();
    clearHighlight();
    setPhase("idle");
    if (msg) setNotice(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToNext = useCallback(() => {
    setNotice(null);
    const list = fieldsRef.current;
    const next = activeIndexRef.current + 1;
    if (next >= list.length) {
      finish(`"${list[list.length - 1]?.label ?? ""}"까지 모두 입력했어요.`);
      return;
    }
    setActiveIndex(next);
    scrollToField(list[next]);
  }, [finish, scrollToField]);

  const goToPrevious = useCallback(() => {
    if (activeIndexRef.current === 0) return;
    setNotice(null);
    const prevIndex = activeIndexRef.current - 1;
    setActiveIndex(prevIndex);
    scrollToField(fieldsRef.current[prevIndex]);
  }, [scrollToField]);

  async function toggleRecord() {
    setError(null);
    if (recorder.isRecording) {
      const blob = await recorder.stop();
      if (!blob) return;
      setProcessing(true);
      const field = fieldsRef.current[activeIndexRef.current];
      const result = await transcribeAudio(blob, { label: field.label, kind: field.kind, options: field.options });
      setProcessing(false);
      if (!field) return;
      if (!result) {
        setNotice("음성을 텍스트로 바꾸지 못했어요. 다시 녹음하거나 직접 입력해 주세요.");
        return;
      }
      if (!result.text) {
        setNotice(
          result.raw
            ? `"${result.raw}"라고 들었는데 "${field.label}"에 들어갈 내용을 못 찾았어요. 다시 녹음하거나 직접 입력해 주세요.`
            : "알아듣지 못했어요. 다시 녹음해 주세요.",
        );
        return;
      }
      if (field.options) {
        const matched = matchOption(result.text, field.options);
        if (!matched) {
          setNotice(`"${result.text}"라고 들었는데 "${field.label}"에서 맞는 항목을 못 찾았어요. 직접 골라 주세요.`);
          return;
        }
        field.setValue(matched);
      } else {
        field.setValue(result.text);
      }
      setNotice(null);
      return;
    }
    const ok = await recorder.start();
    if (!ok) setError("마이크 권한이 꺼져 있어요. 브라우저 주소창 옆 자물쇠 아이콘에서 허용해 주세요.");
    else setNotice(null);
  }

  // 언마운트되면(화면 이동 등) 녹음을 반드시 끈다 — 안 그러면 마이크가 계속 켜져 있다.
  // 둘러 둔 빨간 테두리도 같이 뗀다(화면이 그대로 남는 경우를 대비한 안전망).
  useEffect(() => {
    return () => {
      recorder.cancel();
      clearHighlight();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeField = fields[activeIndex];
  const isLast = activeIndex >= fields.length - 1;
  const fieldList = useMemo(() => fields.map((f) => f.label).join(" → "), [fields]);
  const busy = recorder.isRecording || processing;

  if (!supported) return null;

  return (
    <>
      {phase === "idle" && (
        <button
          type="button"
          onClick={begin}
          className="h-10 px-3.5 rounded-full border border-border-subtle bg-surface-container-lowest text-sm font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
        >
          <Icon name="mic" className="text-base text-red-500" />
          음성 입력
        </button>
      )}

      {notice && phase === "idle" && (
        <p className="w-full text-xs text-on-surface-variant mt-1">{notice}</p>
      )}
      {error && phase === "idle" && (
        <p className="w-full text-xs text-status-error-text mt-1">{error}</p>
      )}

      {phase === "explain" && (
        <Dialog onClose={() => setPhase("idle")} labelledBy="voiceSeqTitle" size="sm">
          <DialogHeader id="voiceSeqTitle" title={title} onClose={() => setPhase("idle")} />
          <p className="text-sm font-bold text-on-surface leading-relaxed break-keep">{fieldList}</p>
          <ul className="text-sm text-on-surface-variant leading-relaxed list-disc pl-4 flex flex-col gap-1.5">
            <li>빨간 버튼 누르면 녹음, 다시 누르면 멈추고 자동 입력</li>
            <li>확인 후 "다음"을 눌러야 다음 칸으로 이동</li>
            <li>칸 이름을 같이 말해도 OK(예: "작성자는 홍길동")</li>
            <li>다시 녹음하면 덮어쓰기, "이전"으로 되돌아가기</li>
          </ul>
          <div className="flex justify-end gap-2 mt-1">
            <Button variant="ghost" onClick={() => setPhase("idle")}>
              취소
            </Button>
            <Button variant="primary" onClick={confirmStart}>
              <Icon name="mic" className="text-base" />
              입력 시작
            </Button>
          </div>
        </Dialog>
      )}

      {phase === "active" && (
        <div
          role="dialog"
          aria-label="음성으로 입력 중"
          className="fixed top-20 right-4 md:top-24 md:right-6 z-[210] w-[min(92vw,340px)] rounded-2xl bg-surface-container-highest border border-border-subtle shadow-2xl p-4 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-on-surface truncate">
              입력단계 {activeIndex + 1}/{fields.length} · {activeField?.label ?? ""}
            </span>
            <button
              type="button"
              onClick={() => finish()}
              aria-label="음성 입력 끄기"
              className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high"
            >
              <Icon name="close" className="text-base" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-2 py-1">
            <button
              type="button"
              onClick={() => void toggleRecord()}
              disabled={processing}
              aria-pressed={recorder.isRecording}
              aria-label={recorder.isRecording ? "녹음 중지" : "녹음 시작"}
              className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-transform disabled:opacity-50 ${
                recorder.isRecording ? "bg-red-600 animate-pulse scale-105" : "bg-red-500 hover:bg-red-600"
              }`}
            >
              <Icon name={recorder.isRecording ? "stop" : processing ? "hourglass_top" : "mic"} className="text-3xl" />
            </button>
            <p className="text-xs text-center text-on-surface-variant min-h-[1.2em] break-keep">
              {processing
                ? "인식하는 중…"
                : recorder.isRecording
                  ? "말씀하고, 다 하셨으면 다시 눌러 멈추세요."
                  : "눌러서 이 칸을 녹음하세요."}
            </p>
          </div>

          {notice && <p className="text-xs text-status-error-text break-keep">{notice}</p>}
          {error && <p className="text-xs text-status-error-text break-keep">{error}</p>}

          <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
            <button
              type="button"
              onClick={goToPrevious}
              disabled={busy || activeIndex === 0}
              className="flex-1 h-9 rounded-lg text-xs font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high disabled:opacity-40 inline-flex items-center justify-center gap-1"
            >
              <Icon name="arrow_back" className="text-sm" />
              이전
            </button>
            <button
              type="button"
              onClick={goToNext}
              disabled={busy}
              className="flex-1 h-9 rounded-lg text-xs font-bold text-on-primary bg-primary hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-1"
            >
              {isLast ? "완료" : "다음"}
              <Icon name={isLast ? "check" : "arrow_forward"} className="text-sm" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
