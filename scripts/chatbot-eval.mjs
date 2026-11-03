// 따소미 챗봇 모델·추론 강도 비교 평가 — 개발 서버(npm run dev)에 실제 대화 흐름을 그대로 흘려 보낸다.
//
//   node scripts/chatbot-eval.mjs [baseUrl]        (기본 http://localhost:3000)
//
// 개발 서버에서만 요청 헤더 x-chat-model / x-chat-reasoning 으로 모델을 바꿀 수 있다(운영에서는 무시).
// 화면(ChatbotDock → ddasomiChat)과 같은 순서로 호출한다: 공정 요약(snapshot) → 문서 검색(필요한 질문만)
// → /api/overhaul/chatbot 에 대화 기록(history)과 함께 질문. 결과는 scripts/chatbot-eval-out/ 에 남는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] || "http://localhost:3000";
const BRANCH = "판교지사";
const COOKIE = `oh_branch=${encodeURIComponent(BRANCH)}`;

/** 100만 토큰당 달러 (2026-11 공식 가격표: 입력 / 캐시 입력 / 출력) */
const PRICE = {
  "gpt-6.1-terra": { in: 1, cached: 0.05, out: 5 },
  "gpt-6-luna": { in: 0.1, cached: 0.01, out: 0.5 },
};

const CONFIGS = [
  { model: "gpt-6.1-terra", reasoning: "medium" },
  { model: "gpt-6.1-terra", reasoning: "high" },
  { model: "gpt-6-luna", reasoning: "medium" },
  { model: "gpt-6-luna", reasoning: "high" },
];

/**
 * 대화 흐름 — 각 턴의 expect 는 자동 점검 항목(도구·범위). 답변 품질은 사람이 결과 파일을 읽고 판단한다.
 * search: 화면이 이 질문으로 보관함 문서 검색을 먼저 하는 경우(후속 질문은 하지 않는다)
 */
const SCENARIOS = [
  {
    name: "인사·소개",
    turns: [{ q: "안녕" }, { q: "너는 어떤 걸 조회할 수 있어?" }],
  },
  {
    name: "고장이력 후속 질문",
    turns: [
      { q: "판교지사 최근 고장이력 알려줘", expect: { tool: "search_failure_history", scope: "판교지사" } },
      { q: "첫 번째 건 응급조치 내용 자세히 알려줘", expect: { tool: "read_failure_report", scope: "판교지사" } },
      { q: "그 설비 점검주기나 보수계획도 있어?", expect: { tool: "search_longterm_plan" } },
    ],
  },
  {
    name: "조회 범위 유지·전환",
    turns: [
      { q: "광교지사 현황 이슈 알려줘", expect: { tool: "list_status_issues", scope: "광교지사" } },
      { q: "그 중 미완료는 몇 건이야?", expect: { tool: "list_status_issues", scope: "광교지사" } },
      { q: "그럼 전 지사 기준으로는 미완료가 몇 건이야?", expect: { tool: "list_status_issues", scope: "전 지사" } },
    ],
  },
  {
    name: "문서 근거 후속 질문",
    turns: [
      { q: "윤활유 펌프 고장 보고서 찾아줘", search: true },
      { q: "아까 그 보고서에서 조치사항만 정리해줘", expect: { tool: "read_document" } },
    ],
  },
  {
    name: "매뉴얼 근거 후속 질문",
    turns: [
      { q: "6.9kV 차단기 점검 매뉴얼 있어?", search: true },
      { q: "그 매뉴얼에서 점검 순서 알려줘", expect: { tool: "read_document" } },
    ],
  },
  {
    name: "공정률 이어 묻기",
    turns: [{ q: "전체 공정률 알려줘" }, { q: "그럼 전기 분야는?" }],
  },
  {
    name: "대상 전환",
    turns: [
      { q: "급수펌프 #1 고장 상황 알려줘", expect: { tool: "search_failure_history" } },
      { q: "주변압기는?", expect: { tool: "search_failure_history" } },
    ],
  },
];

async function getJson(url, init) {
  const res = await fetch(url, { ...init, headers: { cookie: COOKIE, ...(init?.headers ?? {}) } });
  return res.json();
}

async function runScenario(cfg, sc, snapshot) {
  const history = [];
  const out = [];
  for (const turn of sc.turns) {
    let documents;
    if (turn.search) {
      const s = await getJson(`${BASE}/api/docgen/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: turn.q }),
      });
      if (s?.ok) {
        documents = s.matches.slice(0, 5).map((m) => ({
          id: m.id,
          title: m.title,
          docType: m.docType,
          branch: m.branch,
          field: m.field,
          snippet: m.snippet,
        }));
      }
    }
    const t0 = Date.now();
    const r = await getJson(`${BASE}/api/overhaul/chatbot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-chat-model": cfg.model, "x-chat-reasoning": cfg.reasoning },
      body: JSON.stringify({ message: turn.q, context: snapshot, documents, history }),
    });
    const ms = Date.now() - t0;
    const tools = (r.memory?.lookups ?? []).map((l) => l.tool);
    const checks = [];
    if (turn.expect?.tool) checks.push({ what: `도구 ${turn.expect.tool}`, pass: tools.includes(turn.expect.tool) });
    if (turn.expect?.scope) checks.push({ what: `범위 ${turn.expect.scope}`, pass: r.scope === turn.expect.scope });
    out.push({
      q: turn.q,
      ok: r.ok,
      reason: r.reason,
      answer: r.answer,
      scope: r.scope,
      tools,
      lookups: r.memory?.lookups,
      ms,
      usage: r.meta?.usage,
      checks,
    });
    history.push({ role: "user", text: turn.q });
    if (r.ok) history.push({ role: "assistant", text: r.answer, memory: r.memory });
  }
  return { scenario: sc.name, turns: out };
}

function cost(model, u) {
  const p = PRICE[model];
  if (!p || !u) return 0;
  return ((u.input - u.cached) * p.in + u.cached * p.cached + u.output * p.out) / 1e6;
}

async function main() {
  const snap = await getJson(`${BASE}/api/overhaul/chatbot/snapshot`);
  const snapshot = snap?.snapshot;
  console.log("snapshot:", snapshot?.dataSource, snapshot?.overall);

  const results = await Promise.all(
    CONFIGS.map(async (cfg) => {
      const scenarios = [];
      for (const sc of SCENARIOS) scenarios.push(await runScenario(cfg, sc, snapshot));
      return { ...cfg, scenarios };
    }),
  );

  const lines = ["| 모델 · 추론 | 턴 | 실패 | 자동점검 통과 | 평균 응답(초) | 최대(초) | 출력 토큰(추론) | 비용($) |", "|---|---|---|---|---|---|---|---|"];
  for (const r of results) {
    const turns = r.scenarios.flatMap((s) => s.turns);
    const checks = turns.flatMap((t) => t.checks);
    const u = turns.reduce(
      (a, t) => ({
        input: a.input + (t.usage?.input ?? 0),
        cached: a.cached + (t.usage?.cached ?? 0),
        output: a.output + (t.usage?.output ?? 0),
        reasoning: a.reasoning + (t.usage?.reasoning ?? 0),
      }),
      { input: 0, cached: 0, output: 0, reasoning: 0 },
    );
    const avg = turns.reduce((n, t) => n + t.ms, 0) / turns.length / 1000;
    const max = Math.max(...turns.map((t) => t.ms)) / 1000;
    lines.push(
      `| ${r.model} · ${r.reasoning} | ${turns.length} | ${turns.filter((t) => !t.ok).length} | ${checks.filter((c) => c.pass).length}/${checks.length} | ${avg.toFixed(1)} | ${max.toFixed(1)} | ${u.output} (${u.reasoning}) | ${cost(r.model, u).toFixed(4)} |`,
    );
  }
  const summary = lines.join("\n");
  console.log(summary);

  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "chatbot-eval-out");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ base: BASE, branch: BRANCH, summary, results }, null, 2));
  console.log("saved:", file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
