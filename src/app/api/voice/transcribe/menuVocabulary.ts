// 음성 입력의 "메뉴별 이전 기록 용어집" — 서버 전용.
//
// [지침 — 2026-11 사용자 요청] 현황 작성·고장보고서 작성·매뉴얼 작성에서 음성으로 받아쓴 말을 글로
// 옮길 때는, 그 메뉴(현황 관리·고장 관리·매뉴얼 관리)에서 이전에 작성·출력된 글에 실제로 쓰인 용어를
// 기준으로 추론하고 맥락을 판단해 표기를 정한다. 예: 예전 현황에 "2호기 BFP-A 메카니컬 씰"로 적혀
// 있으면, 이번에 "이호기 비에프피 에이 메카니컬 실"이라고 들려도 같은 표기로 맞춘다.
//
// 여기서는 메뉴마다 이전 기록을 읽어
//   - phrases: 설비명·기기명·문서 제목처럼 통째로 쓰이는 이름(자주 쓰인 순)
//   - terms:   본문에 두 번 이상 나온 낱말(조사를 뗀 형태, 자주 쓰인 순)
// 을 뽑아 둔다. 받아쓰기(STT) 힌트 낱말과 정리 단계 프롬프트가 이 목록을 쓴다(route.ts).
// 기록을 못 읽어도(DB·보관함 연결 실패) 음성 입력은 그대로 동작해야 하므로 빈 목록으로 넘어간다.
import { query } from "@/shared/lib/db";

export type VoiceMenu = "status" | "fault" | "manual" | "report";

export const VOICE_MENU_LABELS: Record<VoiceMenu, string> = {
  status: "설비 현황 관리(현황 작성·조치 갱신)",
  fault: "고장 관리(고장보고서 작성)",
  manual: "매뉴얼 관리(매뉴얼 작성)",
  report: "사진대장 작성",
};

export function parseVoiceMenu(v: unknown): VoiceMenu | null {
  return v === "status" || v === "fault" || v === "manual" || v === "report" ? v : null;
}

export interface MenuVocabulary {
  phrases: string[];
  terms: string[];
}

const EMPTY: MenuVocabulary = { phrases: [], terms: [] };
/** 같은 메뉴를 연달아 말할 때마다 DB 를 읽지 않게 잠깐 들고 있는다 — 새 기록은 길어야 10분 뒤 반영된다 */
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<VoiceMenu, { at: number; vocab: Promise<MenuVocabulary> }>();

const MAX_PHRASES = 40;
const MAX_TERMS = 60;
const MAX_PHRASE_LEN = 40;

/** 낱말 끝에 붙은 조사·어미를 떼어 같은 낱말끼리 세어지게 한다(긴 것부터 검사) */
const SUFFIXES = [
  "으로부터", "에서는", "으로는", "에서도", "까지는", "에게서", "이라고", "에서", "으로", "까지", "부터", "에게",
  "하여", "하고", "했음", "하였음", "되어", "되었음", "했고", "됐음", "이며", "이고", "은", "는", "이", "가", "을", "를",
  "에", "의", "로", "과", "와", "도", "만", "함", "됨", "임",
];
/** 용어로서 의미 없는 흔한 말 — 목록 자리를 차지하지 않게 뺀다 */
const STOPWORDS = new Set([
  "있음", "없음", "있어", "없어", "확인", "필요", "예정", "완료", "진행", "조치", "현황", "내용", "관련", "발생", "상태",
  "작업", "점검", "이상", "부분", "부위", "사항", "경우", "때문", "정도", "이후", "이전", "현재", "금일", "당일",
  "그리고", "그래서", "하지만", "또는", "및", "등", "후", "전", "중", "시", "약", "각",
]);

/** 시험 삼아 넣은 글(aa, asdf, ㅁㅁ 같은) — 용어로 쓸 수 없으니 거른다. 한글 낱자(자모)가 섞였거나,
 *  한글 두 글자·영문 대문자 두 글자·영문+숫자 같은 "설비 이름다운" 모양이 하나도 없으면 버린다 */
function looksLikeTerm(v: string): boolean {
  if (/[ㄱ-ㅎㅏ-ㅣ]/.test(v)) return false;
  return /[가-힣]{2}|[A-Z]{2}|[A-Za-z][\w]*[-#\s]?\d|\d+[A-Za-z가-힣]/.test(v);
}

function stripSuffix(word: string): string {
  if (!/[가-힣]$/.test(word)) return word;
  for (const s of SUFFIXES) {
    if (word.length > s.length + 1 && word.endsWith(s)) return word.slice(0, -s.length);
  }
  return word;
}

function topByCount(counts: Map<string, number>, max: number, minCount = 1): string[] {
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .slice(0, max)
    .map(([w]) => w);
}

/** phraseSources: 통째로 쓰는 이름들, texts: 본문 글들 */
export function buildVocabulary(phraseSources: unknown[], texts: unknown[]): MenuVocabulary {
  const phraseCounts = new Map<string, number>();
  for (const p of phraseSources) {
    if (typeof p !== "string") continue;
    const v = p.replace(/\s+/g, " ").trim();
    if (v.length < 2 || v.length > MAX_PHRASE_LEN || !looksLikeTerm(v)) continue;
    phraseCounts.set(v, (phraseCounts.get(v) ?? 0) + 1);
  }
  const termCounts = new Map<string, number>();
  for (const t of [...phraseSources, ...texts]) {
    if (typeof t !== "string") continue;
    for (const raw of t.split(/[^가-힣A-Za-z0-9#\-]+/)) {
      const w = stripSuffix(raw.replace(/^-+|-+$/g, ""));
      if (w.length < 2 || w.length > 20 || /^\d+$/.test(w) || STOPWORDS.has(w) || !looksLikeTerm(w)) continue;
      termCounts.set(w, (termCounts.get(w) ?? 0) + 1);
    }
  }
  const phrases = topByCount(phraseCounts, MAX_PHRASES);
  const phraseSet = new Set(phrases);
  const terms = topByCount(termCounts, MAX_TERMS + phrases.length, 2).filter((t) => !phraseSet.has(t)).slice(0, MAX_TERMS);
  return { phrases, terms };
}

/** docgen 보관함(별도 Supabase, anon 읽기)에서 그 종류 문서의 메타·본문 조각을 읽는다 */
async function loadDocgen(docType: "fault" | "manual" | "report"): Promise<{ phrases: unknown[]; texts: unknown[] }> {
  const url = process.env.NEXT_PUBLIC_DOCGEN_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_DOCGEN_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { phrases: [], texts: [] };
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  const docRes = await fetch(
    `${url}/rest/v1/docgen_documents?select=id,title,facility,fault_content&doc_type=eq.${docType}&order=created_at.desc&limit=150`,
    { headers, signal: AbortSignal.timeout(5000), cache: "no-store" },
  );
  if (!docRes.ok) return { phrases: [], texts: [] };
  const docs = (await docRes.json()) as { id: string; title?: string; facility?: string; fault_content?: string }[];
  const phrases = docs.flatMap((d) => [d.facility, d.fault_content]);
  const texts: unknown[] = docs.map((d) => d.title);
  const ids = docs.slice(0, 60).map((d) => d.id).filter((id) => /^[0-9a-f-]{8,40}$/i.test(String(id)));
  if (ids.length) {
    const chunkRes = await fetch(
      `${url}/rest/v1/docgen_document_chunks?select=chunk_text&document_id=in.(${ids.join(",")})&limit=400`,
      { headers, signal: AbortSignal.timeout(5000), cache: "no-store" },
    ).catch(() => null);
    if (chunkRes?.ok) {
      const chunks = (await chunkRes.json()) as { chunk_text?: string }[];
      for (const c of chunks) texts.push(c.chunk_text?.slice(0, 600));
    }
  }
  return { phrases, texts };
}

async function loadVocabulary(menu: VoiceMenu): Promise<MenuVocabulary> {
  const phrases: unknown[] = [];
  const texts: unknown[] = [];
  const settle = async (job: () => Promise<void>) => {
    try {
      await job();
    } catch (err) {
      console.warn(`[voice/menuVocabulary] ${menu} 이전 기록을 못 읽음:`, err instanceof Error ? err.message : err);
    }
  };

  if (menu === "status") {
    await settle(async () => {
      const rows = await query<{ equipment_name: string | null; content: string | null; action_note: string | null }>(
        `select equipment_name, content, action_note from status_issue order by created_at desc limit 300`,
      );
      for (const r of rows) {
        phrases.push(r.equipment_name);
        texts.push(r.content, r.action_note);
      }
    });
  } else if (menu === "fault") {
    await Promise.all([
      settle(async () => {
        const rows = await query<Record<string, string | null>>(
          `select title, equipment_name, device_name, situation, emergency_action, recovery_detail
             from failure_history order by occurred_at desc nulls last limit 200`,
        );
        for (const r of rows) {
          phrases.push(r.equipment_name, r.device_name);
          texts.push(r.title, r.situation?.slice(0, 600), r.emergency_action?.slice(0, 400), r.recovery_detail?.slice(0, 400));
        }
      }),
      settle(async () => {
        const d = await loadDocgen("fault");
        phrases.push(...d.phrases);
        texts.push(...d.texts);
      }),
    ]);
  } else {
    await settle(async () => {
      const d = await loadDocgen(menu);
      phrases.push(...d.phrases);
      texts.push(...d.texts);
    });
  }
  return buildVocabulary(phrases, texts);
}

export function getMenuVocabulary(menu: VoiceMenu | null): Promise<MenuVocabulary> {
  if (!menu) return Promise.resolve(EMPTY);
  const hit = cache.get(menu);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.vocab;
  const vocab = loadVocabulary(menu).catch(() => EMPTY);
  cache.set(menu, { at: Date.now(), vocab });
  return vocab;
}
