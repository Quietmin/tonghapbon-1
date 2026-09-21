"use client";

/**
 * 임시저장 — 작성 중인 문서를 이 브라우저에 보관한다.
 * 원본 legacy Photo-Report 의 draft.js 를 이식했다.
 *
 * localStorage 대신 IndexedDB 를 쓰는 이유(원본 주석): 사진 30장을 담으면 수 MB 가
 * 되는데 localStorage 한도는 보통 5~10MB 라 바로 넘친다.
 * 여기서는 원본과 달리 data URL 로 바꾸지 않고 File 을 그대로 넣는다 —
 * IndexedDB 는 구조화 복제로 Blob/File 을 그대로 저장할 수 있어서, base64 로
 * 부풀리지 않아 용량과 시간이 모두 준다.
 *
 * 서버로 올리지 않으므로 다른 기기·다른 브라우저에서는 보이지 않는다.
 *
 * 원본은 문서가 한 종류씩만 열렸지만 통합앱은 고장보고서·매뉴얼·사진대장이 각자
 * 다른 경로에 있다. 종류별로 키를 나눠, 매뉴얼을 쓰다 저장한 게 고장보고서 임시본을
 * 덮어쓰지 않게 한다.
 */
import type { DocMode } from "./constants";
import type { Stroke } from "./types";

const DB_NAME = "docgen-draft";
const STORE = "drafts";
const VERSION = 1;

const payloadKey = (mode: DocMode) => `payload:${mode}`;
const metaKey = (mode: DocMode) => `meta:${mode}`;

export interface DraftPhotoItem {
  kind: "photo";
  id: string;
  file: File;
  width: number;
  height: number;
  strokes: Stroke[];
  desc: string;
  rotation: number;
}

export interface DraftTextItem {
  kind: "text";
  id: string;
  body: string;
}

export type DraftItem = DraftPhotoItem | DraftTextItem;

export interface DraftPayload {
  savedAt: string;
  mode: DocMode;
  fileName: string;
  author: string;
  /** 모드별 머리말 값 — 저장할 때 DocEditor 가 받은 saveMeta 를 그대로 넣는다 */
  meta: Record<string, unknown>;
  items: DraftItem[];
}

/** 안내 줄에 쓸 요약 — 작아서 빨리 읽힌다 (원본과 같은 분리) */
export interface DraftMeta {
  savedAt: string;
  mode: DocMode;
  fileName: string;
  photoCount: number;
}

export function isDraftEnabled(): boolean {
  try {
    return typeof indexedDB !== "undefined" && !!indexedDB;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isDraftEnabled()) {
      reject(new Error("이 브라우저에서는 임시저장을 사용할 수 없습니다."));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("임시저장 저장소를 열지 못했습니다."));
    // 다른 탭이 예전 버전을 붙들고 있으면 upgrade 가 멈춘다 (원본 주석)
    req.onblocked = () =>
      reject(new Error("다른 탭에서 이 앱이 열려 있습니다. 닫고 다시 시도해 주세요."));
  });
}

/*
 * 읽기/쓰기 한 번을 트랜잭션으로 감싼다. 요청 결과는 oncomplete 시점에 이미
 * 채워져 있으므로, 요청 객체를 들고 있다가 완료될 때 값을 꺼낸다. (원본과 동일)
 */
function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(STORE, mode);
        } catch (e) {
          db.close();
          reject(e);
          return;
        }
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req && typeof req.result !== "undefined" ? req.result : null);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("임시저장 처리에 실패했습니다."));
        };
      }),
  );
}

export async function saveDraft(payload: DraftPayload): Promise<void> {
  const meta: DraftMeta = {
    savedAt: payload.savedAt,
    mode: payload.mode,
    fileName: payload.fileName,
    photoCount: payload.items.filter((it) => it.kind === "photo").length,
  };
  try {
    await withStore("readwrite", (store) => {
      store.put(payload, payloadKey(payload.mode));
      store.put(meta, metaKey(payload.mode));
    });
  } catch (e) {
    // 용량 초과는 사진이 너무 많을 때 생긴다 — 원인을 알려 준다 (원본 주석)
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      throw new Error("저장 공간이 부족해 임시저장하지 못했습니다. 사진을 줄여 주세요.");
    }
    throw e;
  }
}

/** 임시저장이 있는지만 가볍게 확인 — 실패해도 앱이 멈추면 안 되므로 null 로 삼킨다 */
export function peekDraft(mode: DocMode): Promise<DraftMeta | null> {
  return withStore<DraftMeta>("readonly", (store) => store.get(metaKey(mode))).catch(() => null);
}

export function loadDraft(mode: DocMode): Promise<DraftPayload | null> {
  return withStore<DraftPayload>("readonly", (store) => store.get(payloadKey(mode)));
}

export function clearDraft(mode: DocMode): Promise<void> {
  return withStore("readwrite", (store) => {
    store.delete(payloadKey(mode));
    store.delete(metaKey(mode));
  })
    .then(() => undefined)
    .catch(() => undefined); // 지우기 실패는 조용히 넘긴다 (원본과 동일)
}

/** "2026. 9. 21. 15:42" 처럼 사람이 읽는 형태로 (원본 formatSavedAt) */
export function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${p(d.getHours())}:${p(d.getMinutes())}`;
}
