"use client";

/**
 * 브라우저 내장 음성 인식(Web Speech API) 얇은 래퍼.
 *
 * 서버로 음성을 보내지 않는다 — 전부 브라우저(크롬/엣지 계열)가 자체적으로 처리한다.
 * 그래서 별도 백엔드·API 키 없이 바로 쓸 수 있지만, 그만큼 한계도 뚜렷하다:
 *   - Safari(맥·아이폰)·Firefox 는 지원하지 않거나 매우 제한적이다. isSupported 로
 *     미리 확인해서, 지원 안 하면 버튼 자체를 숨기거나 안내만 보여준다.
 *   - continuous:true 로 켜 둬도 브라우저가 몇십 초 침묵이 이어지면 스스로 멈춘다 —
 *     사용자가 끄기 전까지는 onend 에서 자동으로 다시 시작해(keepAliveRef) 한 번
 *     켠 뒤로는 "계속 듣고 있다"는 경험을 유지한다.
 *   - 지금은 이 브라우저 엔진이 들리는 대로만 글자로 바꾼다("똑똑하게 알아듣기"는
 *     안 한다). 나중에 더 자연스러운 이해가 필요해지면(예: 문장을 통째로 던지고
 *     알아서 칸에 나눠 채우기) 이 훅의 onFinalResult 콜백에서 받은 글을 그대로
 *     쓰는 대신, ChatGPT 같은 LLM API 에 보내 분류·분배시키는 식으로 바꿀 수 있다 —
 *     지금 구조(결과가 날 때마다 콜백 하나 호출)를 바꾸지 않고 콜백 안쪽 로직만
 *     바꾸면 되므로, 나중에 그렇게 확장하기 쉽게 지금은 일부러 더 단순하게 둔다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** 표준 타입 선언이 아직 lib.dom 에 없어 최소한만 직접 선언한다 */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechDictationSupported(): boolean {
  return getCtor() !== null;
}

export interface UseSpeechDictationOptions {
  /** 말을 한 번 끊었을 때(브라우저가 확정한 구간) 호출된다 — 받아쓰기 한 토막 */
  onFinalResult: (text: string) => void;
  /** 아직 확정 전, 지금 듣고 있는 중간 글자 — 화면에 실시간으로 보여줄 때만 쓴다 */
  onInterimResult?: (text: string) => void;
  onError?: (error: string) => void;
  lang?: string;
}

export interface SpeechDictationController {
  isSupported: boolean;
  isListening: boolean;
  start: () => void;
  stop: () => void;
}

export function useSpeechDictation(opts: UseSpeechDictationOptions): SpeechDictationController {
  const { onFinalResult, onInterimResult, onError, lang = "ko-KR" } = opts;
  const [isListening, setIsListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const keepAliveRef = useRef(false);
  const Ctor = getCtor();

  // 최신 콜백을 ref 로 들고 있는다 — 매번 recognition 인스턴스를 새로 만들지 않기 위해
  const onFinalRef = useRef(onFinalResult);
  onFinalRef.current = onFinalResult;
  const onInterimRef = useRef(onInterimResult);
  onInterimRef.current = onInterimResult;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const ensureRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (!Ctor) return null;
    if (recRef.current) return recRef.current;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const transcript = r[0].transcript;
        if (r.isFinal) {
          const trimmed = transcript.trim();
          if (trimmed) onFinalRef.current(trimmed);
        } else {
          interim += transcript;
        }
      }
      if (interim) onInterimRef.current?.(interim);
    };
    rec.onerror = (ev) => {
      // no-speech(침묵)는 흔히 생기고 onend 가 뒤따라와 자동 재시작되므로 에러로 띄우지 않는다
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      onErrorRef.current?.(ev.error);
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        keepAliveRef.current = false;
        setIsListening(false);
      }
    };
    rec.onend = () => {
      if (keepAliveRef.current) {
        // 침묵이 길어지면 브라우저가 스스로 멈춘다 — 사용자가 끄기 전까진 바로 재시작해
        // "계속 듣고 있다"는 경험을 유지한다
        try {
          rec.start();
          return;
        } catch {
          /* 이미 시작된 상태 등으로 실패해도 아래에서 멈춤 처리 */
        }
      }
      setIsListening(false);
    };
    recRef.current = rec;
    return rec;
  }, [Ctor, lang]);

  const start = useCallback(() => {
    const rec = ensureRecognition();
    if (!rec) return;
    keepAliveRef.current = true;
    try {
      rec.start();
      setIsListening(true);
    } catch {
      /* 이미 시작돼 있으면 무시 */
    }
  }, [ensureRecognition]);

  const stop = useCallback(() => {
    keepAliveRef.current = false;
    recRef.current?.stop();
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      keepAliveRef.current = false;
      recRef.current?.abort();
    };
  }, []);

  return { isSupported: Ctor !== null, isListening, start, stop };
}
