"use client";

/**
 * 칸을 순서대로 도는 음성 받아쓰기 — "매뉴얼 종류 → 분야 → 지사 → … → 주의사항"처럼
 * 화면 위에서 아래로 여러 칸을 한 번에 채울 때 쓴다(매뉴얼 작성·고장보고서 작성·
 * 현황 등록 머리말). 사진 설명칸처럼 "버튼 하나 = 칸 하나"면 VoiceDictationButton
 * 을 대신 쓴다.
 *
 * 쓰는 법: 칸 목록(VoiceField[])을 만들어 <VoiceSequenceFill fields={...} /> 를
 * 화면 오른쪽 위(헤더 action 자리)에 놓으면 끝 — 버튼·설명 팝업·"녹음 중" 표시·
 * 다음 칸 넘기기·되돌리기까지 이 컴포넌트 하나가 다 한다.
 *
 * 동작 방식(브라우저 엔진이 하는 일을 그대로 활용한다 — 직접 "몇 초 멈췄다"를
 * 재지 않는다):
 *   - 말을 한 번 끊을 때마다(한 호흡) 브라우저가 "확정된 결과"를 하나씩 던져 준다.
 *   - 짧은 칸(매뉴얼 종류·분야·지사·파일명·작성자·개정번호 등)은 그 첫 토막을
 *     그대로 넣고 바로 다음 칸으로 넘어간다 — 한 단어/한 구절로 끝나는 칸이라서.
 *   - 긴 칸(목적·준비물·주의사항·이슈 내용 등)은 여러 토막을 이어 붙인다. 넘어갈
 *     때는 "다음"이라고 말하거나, 새 토막이 일정 시간(LONG_FIELD_SILENCE_MS)
 *     안 들어오면(다 말했다고 보고) 자동으로 다음 칸으로 넘어간다.
 *   - 더블클릭(또는 더블탭)하면 한 칸 뒤로 돌아간다 — 그 칸은 비워서 다시 말하면
 *     덮어쓰도록 한다(사용자가 확인한 동작).
 *
 * 나중에 ChatGPT 같은 LLM API 로 "한 번에 길게 말해도 알아서 칸을 나눠 채우는"
 * 더 똑똑한 버전으로 바꿀 수 있다 — 그때는 handleFinalResult 안의 분배 로직만
 * LLM 호출로 바꾸면 되고, 칸 목록(VoiceField[])·팝업·표시 UI는 그대로 재사용된다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dialog, { DialogHeader } from "./Dialog";
import { Button, Icon } from "./ui";
import { useSpeechDictation, isSpeechDictationSupported } from "@/shared/lib/speechDictation";

export type VoiceFieldKind = "short" | "long";

export interface VoiceField {
  key: string;
  /** 설명 팝업·"지금 듣는 중" 표시에 쓰는 이름 */
  label: string;
  kind: VoiceFieldKind;
  setValue: (text: string) => void;
  /** select 류 칸이면 후보를 준다 — 들은 말과 가장 가까운 후보를 찾아 넣는다 */
  options?: readonly string[];
  /** 이 칸으로 넘어갈 때 화면에 보이도록 스크롤·포커스할 엘리먼트 */
  getElement?: () => HTMLElement | null;
}

/** 긴 칸(목적·이슈 내용 등)에서 이만큼 새 토막이 안 들어오면 "다 말했다"로 보고 다음 칸으로 넘어간다 */
const LONG_FIELD_SILENCE_MS = 3500;
/** "다음"이라고 말해 넘기는 걸로 인정할 말들 */
const NEXT_COMMANDS = ["다음", "다음칸", "다음 칸", "다음으로", "넘어가", "넘어가줘", "스킵"];

function normalize(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

/** 들은 말과 가장 가까운 후보를 고른다 — 못 찾으면 null(그 칸은 비워 두고 다음으로 넘어간다) */
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

type Phase = "idle" | "explain" | "listening";

export default function VoiceSequenceFill({
  fields,
  title = "음성으로 한 번에 입력하기",
}: {
  fields: VoiceField[];
  title?: string;
}) {
  // 처음 그릴 때는 무조건 false 로 시작한다 — 이유는 VoiceDictationButton.tsx 의
  // 같은 패턴 주석 참고(서버·클라이언트 첫 그림을 맞춰 하이드레이션 경고를 막는다).
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(isSpeechDictationSupported());
  }, []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;
  const bufferRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const scrollToField = useCallback((field: VoiceField | undefined) => {
    const el = field?.getElement?.();
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el instanceof HTMLElement) el.focus?.({ preventScroll: true });
  }, []);

  const finish = useCallback((msg?: string) => {
    clearSilenceTimer();
    bufferRef.current = "";
    setInterim("");
    setPhase("idle");
    dictationRef.current?.stop();
    if (msg) setNotice(msg);
  }, [clearSilenceTimer]);

  const advance = useCallback(() => {
    clearSilenceTimer();
    bufferRef.current = "";
    setInterim("");
    const list = fieldsRef.current;
    const next = activeIndexRef.current + 1;
    if (next >= list.length) {
      finish(`"${list[list.length - 1]?.label ?? ""}"까지 모두 받아 적었어요.`);
      return;
    }
    setActiveIndex(next);
    scrollToField(list[next]);
  }, [clearSilenceTimer, finish, scrollToField]);

  const armLongFieldSilence = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      advance();
    }, LONG_FIELD_SILENCE_MS);
  }, [advance, clearSilenceTimer]);

  const handleFinalResult = useCallback(
    (text: string) => {
      const list = fieldsRef.current;
      const field = list[activeIndexRef.current];
      if (!field) return;

      if (NEXT_COMMANDS.includes(normalize(text))) {
        advance();
        return;
      }

      if (field.kind === "short") {
        if (field.options) {
          const matched = matchOption(text, field.options);
          if (matched) {
            field.setValue(matched);
          } else {
            setNotice(`"${text}"라고 들었는데 "${field.label}"에서 맞는 항목을 못 찾았어요. 직접 골라 주세요.`);
          }
        } else {
          field.setValue(text);
        }
        advance();
      } else {
        const sep = bufferRef.current && !/\s$/.test(bufferRef.current) ? " " : "";
        bufferRef.current += sep + text;
        field.setValue(bufferRef.current);
        armLongFieldSilence();
      }
    },
    [advance, armLongFieldSilence],
  );

  const dictation = useSpeechDictation({
    onFinalResult: handleFinalResult,
    onInterimResult: setInterim,
    onError: (e) => {
      if (e === "not-allowed" || e === "service-not-allowed") {
        setError("마이크 권한이 꺼져 있어요. 브라우저 주소창 옆 자물쇠 아이콘에서 허용해 주세요.");
        finish();
      }
    },
  });
  // 콜백 안에서 최신 dictation.stop 을 쓰려고(finish 가 useCallback 의존성 루프에
  // 걸리지 않도록) ref 로 한 번 더 들고 있는다
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;

  const begin = useCallback(() => {
    if (!supported) return;
    setError(null);
    setNotice(null);
    setPhase("explain");
  }, [supported]);

  const confirmStart = useCallback(() => {
    bufferRef.current = "";
    setInterim("");
    setActiveIndex(0);
    setPhase("listening");
    dictation.start();
    scrollToField(fieldsRef.current[0]);
  }, [dictation, scrollToField]);

  const cancel = useCallback(() => {
    clearSilenceTimer();
    dictation.stop();
    setPhase("idle");
  }, [clearSilenceTimer, dictation]);

  const goToPrevious = useCallback(() => {
    if (activeIndexRef.current === 0) return;
    clearSilenceTimer();
    bufferRef.current = "";
    setInterim("");
    const prevIndex = activeIndexRef.current - 1;
    const prevField = fieldsRef.current[prevIndex];
    // 되돌아간 칸은 비워서, 다시 말하면 그대로 덮어써지게 한다(사용자가 고른 동작)
    prevField?.setValue("");
    setActiveIndex(prevIndex);
    scrollToField(prevField);
  }, [clearSilenceTimer, scrollToField]);

  // 언마운트되면(화면 이동 등) 듣기를 반드시 끈다 — 안 그러면 마이크가 계속 켜져 있다
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      dictationRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeField = fields[activeIndex];
  const fieldList = useMemo(() => fields.map((f) => f.label).join(" → "), [fields]);

  if (!supported) return null;

  return (
    <>
      {phase === "idle" && (
        <button
          type="button"
          onClick={begin}
          className="h-10 px-3.5 rounded-full border border-border-subtle bg-surface-container-lowest text-sm font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors inline-flex items-center gap-1.5"
        >
          <Icon name="mic" className="text-base" />
          음성 입력
        </button>
      )}

      {notice && phase === "idle" && (
        <p className="w-full text-xs text-on-surface-variant mt-1">{notice}</p>
      )}
      {error && (
        <p className="w-full text-xs text-status-error-text mt-1">{error}</p>
      )}

      {phase === "explain" && (
        <Dialog onClose={cancel} labelledBy="voiceSeqTitle" size="sm">
          <DialogHeader id="voiceSeqTitle" title={title} onClose={cancel} />
          <p className="text-sm text-on-surface-variant leading-relaxed">
            버튼을 누르면 마이크가 켜져요. 화면을 아래로 내리면서 이 순서대로 말하면
            해당 칸에 그대로 채워집니다.
          </p>
          <p className="text-sm font-bold text-on-surface leading-relaxed break-keep">{fieldList}</p>
          <ul className="text-xs text-on-surface-variant leading-relaxed list-disc pl-4 flex flex-col gap-1">
            <li>목적·준비물·주의사항처럼 긴 칸은 "다음"이라고 말하거나 잠깐 멈추면 다음 칸으로 넘어가요.</li>
            <li>잘못 넘어갔으면 오른쪽 위 녹음 표시를 두 번 눌러 이전 칸으로 되돌아가요(그 칸은 다시 비워져요).</li>
          </ul>
          <div className="flex justify-end gap-2 mt-1">
            <Button variant="ghost" onClick={cancel}>
              취소
            </Button>
            <Button variant="primary" onClick={confirmStart}>
              <Icon name="mic" className="text-base" />
              입력 시작
            </Button>
          </div>
        </Dialog>
      )}

      {phase === "listening" && (
        <div
          role="status"
          onDoubleClick={goToPrevious}
          title="두 번 누르면 이전 칸으로 돌아가요"
          className="fixed top-20 right-4 md:top-24 md:right-6 z-[210] max-w-[min(90vw,320px)] rounded-2xl bg-status-error text-on-primary shadow-2xl px-4 py-3 flex flex-col gap-1.5 cursor-pointer select-none"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              녹음 중 — {activeField?.label ?? ""}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cancel();
              }}
              aria-label="음성 입력 끄기"
              className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center hover:bg-white/20"
            >
              <Icon name="close" className="text-base" />
            </button>
          </div>
          <p className="text-xs opacity-90 min-h-[1.2em] break-keep">{interim || "말씀해 주세요…"}</p>
          <p className="text-[11px] opacity-75">두 번 누르면 이전 칸으로</p>
        </div>
      )}
    </>
  );
}
