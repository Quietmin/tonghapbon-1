// 2026 시연 데이터 다듬기 — UI와 같은 HTTP API만 쓴다.
//
//   SEED_BASE=http://localhost:3001 node fix-2026-demo.js cleanup   회차 정리(전 지사 동일 구성)
//   SEED_BASE=... node fix-2026-demo.js gangnam                     미래 일정을 과거로 당겨 완료 처리
//   SEED_BASE=... node fix-2026-demo.js gwanggyo                    광교 비우기(현장 시연용)
//   SEED_BASE=... node fix-2026-demo.js pangyo                      판교를 진행 중(≈50%)으로 + 사진
//   SEED_BASE=... node fix-2026-demo.js all                         위 네 가지를 순서대로
//
// 왜 필요한가:
//  - 오늘(TODAY) 이후 일정까지 "완료"로 찍혀 있으면 앞뒤가 안 맞는다 → 과거로 당긴다
//  - 지사마다 빈 회차가 남아 화면 구성이 제각각이었다 → 작업이 있는 회차 하나로 통일
//  - 광교는 현장 시연에서 직접 올릴 것이라 공정 데이터를 비워 둔다
//  - 판교는 "지금 돌아가는 현장"을 보여줘야 해서 진행 중(완료·진행·지연·대기 혼재)으로 둔다
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.SEED_BASE || "http://localhost:3001";
const TODAY = "2026-11-03";
const PHOTO = (f) => path.join(__dirname, "photos", f);
const PROJECT_NAME = "2026년 정기 오버홀";

// ── 쿠키 저장소 + API ────────────────────────────────────────────────────────
const jar = {};
function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
}
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function api(method, url, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + url, {
      method,
      headers: { Cookie: cookieHeader(), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    storeCookies(res);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
    if (res.ok && json.ok !== false) return json;
    if (attempt >= 3) throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

const d = (iso) => new Date(iso + "T00:00:00Z");
const addDays = (iso, n) => { const t = d(iso); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((d(b) - d(a)) / 86400000);
const minDate = (a, b) => (a < b ? a : b);
// date 컬럼이 "2026-09-30T15:00:00.000Z"(KST 자정의 UTC)로 올 수 있다 — +9h 보정
const toDate = (v) => {
  if (!v) return null;
  const s = String(v);
  if (!s.includes("T")) return s.slice(0, 10);
  return new Date(new Date(s).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
};
const dataUrl = (file) => "data:image/jpeg;base64," + fs.readFileSync(file).toString("base64");

function detailFor(name, phase) {
  if (/비계/.test(name)) return phase === "end" ? "비계 설치·해체 완료, 안전점검 승인" : "비계 자재 반입 및 조립";
  if (/분해|Overhaul|오버홀/.test(name)) return phase === "end" ? "분해점검 완료, 측정치 양호 — 조립 복구 완료" : "분해 및 내부 육안점검 진행";
  if (/교정/.test(name)) return phase === "end" ? "교정 완료, 성적서 발행" : "기준기 연결, 교정 진행 중";
  if (/시험|시운전|성능/.test(name)) return phase === "end" ? "시험 완료, 판정 합격" : "시험 준비 및 사전 점검";
  if (/측정|진단|탐상|검사/.test(name)) return phase === "end" ? "측정 완료, 전 개소 판정 양호" : "측정 진행 중, 중간 판독 이상 없음";
  if (/교체/.test(name)) return phase === "end" ? "교체 완료, 누설·작동 확인" : "기존품 철거, 신품 반입 검수";
  if (/세정|청소|세관/.test(name)) return phase === "end" ? "세정 완료, 차압 정상 확인" : "세정 작업 진행 중";
  if (/용접|보수/.test(name)) return phase === "end" ? "보수 완료, 비파괴검사 합격" : "결함부 제거 및 용접 보수 중";
  return phase === "end" ? "점검 완료, 특이사항 없음" : "점검 진행 중, 특이사항 없음";
}

const midQty = (plan, frac) =>
  Math.max(1, Math.min(plan - (plan > 1 ? 1 : 0), Math.round(plan * frac)));

const setBranch = (branch) => api("POST", "/api/overhaul/branch", { branch });

async function listProjects() {
  const { projects = [] } = await api("GET", "/api/overhaul/project");
  return projects;
}

async function mainProject(branch) {
  const projects = await listProjects();
  // 작업이 붙어 있는 회차가 본 회차다 — 이름은 제각각일 수 있어 작업 수로 고른다
  let best = null;
  for (const p of projects) {
    const r = await api("GET", `/api/overhaul/schedule?projectId=${p.id}`);
    const n = (r.rows ?? []).length;
    if (!best || n > best.count) best = { project: p, count: n };
  }
  if (!best) throw new Error(`${branch}: 회차가 없다`);
  return best;
}

async function getRows(projectId) {
  const r = await api("GET", `/api/overhaul/schedule?projectId=${projectId}`);
  return r.rows ?? [];
}

async function clearEntries(taskId) {
  const { entries = [] } = await api("GET", `/api/overhaul/entries?taskId=${taskId}`);
  for (const e of entries) {
    const date = toDate(e.entry_date ?? e.date);
    if (date) await api("DELETE", `/api/overhaul/entries?taskId=${taskId}&date=${date}`);
  }
  return entries.length;
}

const postEntry = (taskId, date, cumulative, workDetail, delayReason = "", nextPlan = "", photos) =>
  api("POST", "/api/overhaul/entries", {
    taskId, date, cumulative, workDetail, delayReason, nextPlan,
    ...(photos ? { photos } : {}),
  });

// ── ① 회차 정리 — 전 지사가 같은 구성이 되게 한다 ───────────────────────────
async function cleanup(branches) {
  for (const branch of branches) {
    await setBranch(branch);
    const projects = await listProjects();
    const withCount = [];
    for (const p of projects) {
      withCount.push({ p, n: (await getRows(p.id)).length });
    }
    const main = withCount.slice().sort((a, b) => b.n - a.n)[0];
    if (!main) { console.log(`  ${branch}: 회차 없음`); continue; }

    // 이름 통일 — 어느 지사를 열어도 회차 띠에 같은 이름이 보이게
    if (main.p.name !== PROJECT_NAME) {
      await api("PATCH", "/api/overhaul/project", { id: main.p.id, name: PROJECT_NAME });
    }
    // 빈 회차 제거 (마지막 하나는 지울 수 없으므로 본 회차는 항상 남는다)
    let removed = 0;
    for (const { p, n } of withCount) {
      if (p.id === main.p.id || n > 0) continue;
      try { await api("DELETE", `/api/overhaul/project?id=${p.id}`); removed++; }
      catch (e) { console.log(`    (${p.name} 삭제 실패: ${e.message.slice(0, 60)})`); }
    }
    await api("POST", "/api/overhaul/project/active", { id: main.p.id });
    console.log(`  ${branch}: 본 회차 "${PROJECT_NAME}"(작업 ${main.n}) · 빈 회차 ${removed}개 정리`);
  }
}

// ── ② 미래 일정 → 과거로 당겨 완료 ──────────────────────────────────────────
// 오늘 이후까지 걸쳐 있는 회차는 "이미 끝난 공사"로 보이게 통째로 앞당긴다.
async function shiftToPast(branch, endGap = 11) {
  await setBranch(branch);
  const { project } = await mainProject(branch);
  const start = toDate(project.start_date);
  const end = toDate(project.end_date);
  if (!start || !end) { console.log(`  ${branch}: 기간이 없어 건너뜀`); return; }
  if (end < TODAY) { console.log(`  ${branch}: 이미 과거(${start}~${end})`); return; }

  const shift = daysBetween(addDays(TODAY, -endGap), end); // 며칠 당길지
  const newStart = addDays(start, -shift);
  const newEnd = addDays(end, -shift);
  await api("PATCH", "/api/overhaul/project", { id: project.id, start_date: newStart, end_date: newEnd });

  const rows = await getRows(project.id);
  let moved = 0;
  for (const t of rows) {
    const s = toDate(t.sch?.plannedStartStr);
    const e = toDate(t.sch?.plannedEndStr);
    if (!s || !e) continue;
    await api("PATCH", "/api/overhaul/tasks", {
      id: t.id, patch: { plan_start: addDays(s, -shift), plan_end: addDays(e, -shift) },
    });
    moved++;
  }

  // 실적도 새 일정에 맞춰 다시 — 날짜가 키라 옮기는 대신 지우고 넣는다
  let done = 0;
  for (const t of await getRows(project.id)) {
    await clearEntries(t.id);
    const planQty = Number(t.planQty) || 1;
    const s = toDate(t.sch?.plannedStartStr) ?? newStart;
    const e = minDate(toDate(t.sch?.plannedEndStr) ?? newEnd, newEnd);
    const span = daysBetween(s, e);
    if (span >= 3 && planQty > 1) {
      await postEntry(t.id, addDays(s, Math.round(span * 0.55)), midQty(planQty, 0.6), detailFor(t.name, "mid"));
    }
    await postEntry(t.id, e, planQty, detailFor(t.name, "end"));
    done++;
  }
  console.log(`  ${branch}: ${start}~${end} → ${newStart}~${newEnd} (작업 ${moved}건 이동, ${done}건 완료)`);
}

// ── ③ 광교 비우기 — 현장 시연에서 직접 올린다 ───────────────────────────────
async function emptyGwanggyo() {
  const branch = "광교지사";
  await setBranch(branch);
  const { project } = await mainProject(branch);
  const rows = await getRows(project.id);
  for (const t of rows) await api("DELETE", `/api/overhaul/tasks?id=${t.id}`);
  // 빈 회차만 남겨 두면 시연 때 엑셀 업로드부터 바로 이어진다
  console.log(`  광교: 작업 ${rows.length}건 삭제 (회차 "${project.name}" ${toDate(project.start_date)}~${toDate(project.end_date)} 는 유지)`);
}

// ── ④ 판교 — 지금 돌아가는 현장(≈50%) ──────────────────────────────────────
// 기간 가운데에 오늘이 오도록 통째로 옮기고, 완료·진행·지연·대기를 섞는다.
async function pangyoInProgress() {
  const branch = "판교지사";
  await setBranch(branch);
  const { project } = await mainProject(branch);
  const start = toDate(project.start_date);
  const end = toDate(project.end_date);
  const total = daysBetween(start, end);
  // 공정률이 ≈50%가 되는 지점에 오늘을 둔다. 날짜 경과율과 물량 공정률이
  // 비례하지 않아(물량이 큰 작업이 특정 구간에 몰려 있다) 실측으로 맞춘 값이다:
  // 0.50→32% · 0.53→50% · 0.56→67% · 0.66→93%. 데이터가 바뀌면 다시 재어야 한다.
  const ELAPSED = Number(process.env.PANGYO_ELAPSED || 0.53);
  const newStart = addDays(TODAY, -Math.round(total * ELAPSED));
  const shift = daysBetween(start, newStart);
  const newEnd = addDays(end, shift);
  await api("PATCH", "/api/overhaul/project", { id: project.id, start_date: newStart, end_date: newEnd });

  for (const t of await getRows(project.id)) {
    const s = toDate(t.sch?.plannedStartStr);
    const e = toDate(t.sch?.plannedEndStr);
    if (!s || !e) continue;
    await api("PATCH", "/api/overhaul/tasks", {
      id: t.id, patch: { plan_start: addDays(s, shift), plan_end: addDays(e, shift) },
    });
  }

  const rows = await getRows(project.id);
  // 지연 6건 — 기한이 지났는데 아직 안 끝난 작업. 설비가 겹치지 않게 이름으로 고른다
  const overdue = rows.filter((t) => toDate(t.sch?.plannedEndStr) && toDate(t.sch?.plannedEndStr) < TODAY);
  const delayPick = [];
  for (const re of [/HRSG/, /전동기|차단기|변압기/, /DCS|제어|밸브/, /펌프/, /열교환|세관/, /배관|밸브실/]) {
    const hit = overdue.find((t) => re.test(t.name) && !delayPick.includes(t.id));
    if (hit) delayPick.push(hit.id);
  }
  const delayReasons = [
    "교체 부품 입고 지연 — 납기 재확인 중",
    "선행 작업(비계) 지연으로 착수가 밀림",
    "정밀측정 결과 재시행 필요",
    "작업 중 추가 결함 발견 — 범위 조정 협의",
    "우천으로 옥외 작업 중단",
    "협력사 인력 수급 지연",
  ];

  // 사진 — 분해점검 계열 완료 작업 4건에 전/후를 붙인다
  const photoPairs = [
    ["photo-before.jpg", "photo-after.jpg"],
    ["photo-step1.jpg", "photo-step2.jpg"],
    ["photo-before.jpg", "photo-step2.jpg"],
    ["photo-step1.jpg", "photo-after.jpg"],
  ];
  const photoTargets = [];
  for (const re of [/베어링/, /분해점검/, /로터|회전자/, /세관|세정/]) {
    const hit = overdue.find(
      (t) => re.test(t.name) && !delayPick.includes(t.id) && !photoTargets.includes(t.id),
    );
    if (hit) photoTargets.push(hit.id);
  }

  let done = 0, prog = 0, wait = 0, delayed = 0, photos = 0;
  for (const t of rows) {
    await clearEntries(t.id);
    const planQty = Number(t.planQty) || 1;
    const s = toDate(t.sch?.plannedStartStr);
    const e = toDate(t.sch?.plannedEndStr);
    if (!s || !e) { wait++; continue; }

    const di = delayPick.indexOf(t.id);
    if (di >= 0) {
      const frac = [0.5, 0.4, 0.6, 0.45, 0.55, 0.35][di] ?? 0.5;
      const cum = midQty(planQty, frac);
      const mid = addDays(s, Math.max(1, Math.round(daysBetween(s, e) * 0.5)));
      if (daysBetween(s, mid) >= 1) {
        await postEntry(t.id, mid, Math.max(1, Math.round(cum * 0.6)), detailFor(t.name, "mid"));
      }
      await postEntry(t.id, addDays(TODAY, -1), cum, detailFor(t.name, "mid"),
        delayReasons[di], "만회 계획 수립 — 주말 연장작업 투입");
      delayed++;
      continue;
    }

    if (e < TODAY) {
      const span = daysBetween(s, e);
      if (span >= 3 && planQty > 1) {
        await postEntry(t.id, addDays(s, Math.round(span * 0.55)), midQty(planQty, 0.6), detailFor(t.name, "mid"));
      }
      const pi = photoTargets.indexOf(t.id);
      const photoArg = pi >= 0
        ? {
            keepIds: [],
            add: [
              { slot: "before", dataUrl: dataUrl(PHOTO(photoPairs[pi][0])) },
              { slot: "after", dataUrl: dataUrl(PHOTO(photoPairs[pi][1])) },
            ],
          }
        : undefined;
      await postEntry(t.id, e, planQty, detailFor(t.name, "end"), "", "", photoArg);
      if (photoArg) photos++;
      done++;
    } else if (s <= TODAY) {
      const frac = Math.min(0.9, Math.max(0.25, daysBetween(s, TODAY) / Math.max(1, daysBetween(s, e))));
      await postEntry(t.id, addDays(TODAY, -1), midQty(planQty, frac), detailFor(t.name, "mid"),
        "", "계획대로 진행 — 익일 후속 공정 착수");
      prog++;
    } else {
      wait++;
    }
  }

  const after = await api("GET", `/api/overhaul/schedule?projectId=${project.id}`);
  const rowsAfter = after.rows ?? [];
  const pct = Math.round(
    rowsAfter.reduce((a, t) => a + (Number(t.planQty) || 1) * (t.actual ?? 0), 0) /
    Math.max(1, rowsAfter.reduce((a, t) => a + (Number(t.planQty) || 1), 0)),
  );
  console.log(`  판교: ${newStart}~${newEnd} · 완료 ${done} · 진행 ${prog} · 지연 ${delayed} · 대기 ${wait} · 사진 ${photos}건 → 공정률 약 ${pct}%`);
}

// ── ⑤ 청주 — 일정 없는 작업에 일정을 깔고 분야를 맞춘다 ────────────────────
// 수량산출서만 올라와 있어 plan_start가 전부 비어 있었다. 일정이 없으면 공정표·
// 지연 판정이 그려지지 않아 이 지사만 화면 구성이 달라 보인다.
async function fixCheongju() {
  const branch = "청주지사";
  await setBranch(branch);
  const { project } = await mainProject(branch);
  const start = toDate(project.start_date);
  const end = toDate(project.end_date);
  const total = Math.max(1, daysBetween(start, end));

  let rows = await getRows(project.id);
  const fields = new Set(rows.map((t) => t.field).filter(Boolean));

  // 제어 분야가 비어 있으면 다른 지사와 같은 묶음을 채워 넣는다
  if (!fields.has("제어")) {
    const ctrl = [
      ["DCS 제어카드·전원 이중화 점검", "제어카드 34EA", "EA", 34, 0.55, 10],
      ["제어밸브 분해점검", "TCV·PCV 10대", "대", 10, 0.62, 11],
      ["현장계기 교정", "압력·온도·유량 58점", "점", 58, 0.70, 12],
      ["가스누설검지기 교정", "검지기 12대", "대", 12, 0.80, 6],
    ];
    const who = ["서현진", "한지훈"];
    let i = 0;
    for (const [name, spec, unit, qty, at, dur] of ctrl) {
      const s = addDays(start, Math.round(total * at));
      await api("POST", "/api/overhaul/tasks", {
        name, field: "제어", equipment_type: "제어설비", spec, unit, plan_qty: qty,
        plan_start: s, plan_end: minDate(addDays(s, dur), end), assignee: who[i++ % who.length],
      });
    }
    console.log(`  청주: 제어 작업 ${ctrl.length}건 추가`);
    rows = await getRows(project.id);
  }

  // 일정을 DB에 굳힌다.
  //
  // 공정표(schedule API)는 plan_start가 비어 있으면 회차 기간에 자동 배치한 날짜를
  // 돌려준다 — 그래서 화면에는 그려지지만 DB는 비어 있고, 작업 편집·내려받기에서는
  // 일정 칸이 빈 채로 보인다. 이 지사만 그런 상태라 화면 구성이 달라 보였다.
  // 이미 보이고 있는 그 배치를 그대로 써넣어 다른 지사와 같게 만든다.
  const ORDER = { 기계: 0, 전기: 1, 제어: 2 };
  const ordered = rows
    .slice()
    .sort((a, b) => (ORDER[a.field] ?? 3) - (ORDER[b.field] ?? 3) || a.name.localeCompare(b.name, "ko"));
  let placed = 0;
  for (let i = 0; i < ordered.length; i++) {
    const t = ordered[i];
    let s = toDate(t.sch?.plannedStartStr);
    let e = toDate(t.sch?.plannedEndStr);
    if (!s || !e) {
      // 자동 배치조차 못 한 작업 — 분야 순서대로 기간에 고르게 퍼뜨린다
      const ratio = ordered.length > 1 ? i / (ordered.length - 1) : 0;
      s = addDays(start, Math.round(total * ratio * 0.82));
      e = minDate(addDays(s, 5 + (i % 8)), end);
    }
    await api("PATCH", "/api/overhaul/tasks", {
      id: t.id, patch: { plan_start: s, plan_end: minDate(e, end) },
    });
    placed++;
    if (placed % 80 === 0) console.log(`    일정 ${placed}/${ordered.length}`);
  }

  // 일정이 바뀌었으니 실적도 그 일정 위에 다시 깐다 (전 작업 완료)
  let done = 0;
  for (const t of await getRows(project.id)) {
    await clearEntries(t.id);
    const planQty = Number(t.planQty) || 1;
    const s = toDate(t.sch?.plannedStartStr) ?? start;
    const e = minDate(toDate(t.sch?.plannedEndStr) ?? end, end);
    const span = daysBetween(s, e);
    if (span >= 3 && planQty > 1) {
      await postEntry(t.id, addDays(s, Math.round(span * 0.55)), midQty(planQty, 0.6), detailFor(t.name, "mid"));
    }
    await postEntry(t.id, e, planQty, detailFor(t.name, "end"));
    done++;
    if (done % 60 === 0) console.log(`    …${done}건`);
  }
  console.log(`  청주: 일정 ${placed}건 배치 · 실적 ${done}건 재작성 (${start}~${end})`);
}

// ---------------------------------------------------------------------------
const BRANCHES = [
  "중앙지사", "강남지사", "파주지사", "삼송지사", "고양사업소", "화성지사", "동탄지사",
  "판교지사", "광교지사", "용인지사", "분당사업소", "평택지사", "광주전남지사", "양산지사",
  "대구지사", "세종지사", "김해사업소", "청주지사", "수원사업소",
];

(async () => {
  const mode = process.argv[2] ?? "all";
  console.log(`대상 서버: ${BASE} (오늘=${TODAY})`);
  if (mode === "cleanup" || mode === "all") {
    console.log("\n■ 회차 정리");
    await cleanup(BRANCHES);
  }
  if (mode === "gangnam" || mode === "all") {
    console.log("\n■ 미래 일정 → 과거 완료");
    for (const b of BRANCHES) {
      if (b === "판교지사" || b === "광교지사") continue; // 따로 다룬다
      await shiftToPast(b);
    }
  }
  if (mode === "gwanggyo" || mode === "all") {
    console.log("\n■ 광교 비우기");
    await emptyGwanggyo();
  }
  if (mode === "pangyo" || mode === "all") {
    console.log("\n■ 판교 진행 중");
    await pangyoInProgress();
  }
  if (mode === "cheongju" || mode === "all") {
    console.log("\n■ 청주 일정·분야 맞추기");
    await fixCheongju();
  }
  console.log("\n끝.");
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
