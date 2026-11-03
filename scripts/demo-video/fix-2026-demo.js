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

// 중간 실적 수량 — 항상 계획보다 작아야 "진행 중"으로 보인다.
// 수량 1(식)짜리를 정수로 반올림하면 1/1 = 100%가 돼 진행 중·지연 작업이 완료로
// 찍힌다. 그래서 수량이 작으면 소수(0.1 단위)로 넣는다 — done_qty는 소수를 받는다.
const midQty = (plan, frac) => {
  if (plan >= 3) return Math.max(1, Math.min(plan - 1, Math.round(plan * frac)));
  const v = Math.round(plan * frac * 10) / 10;
  return Math.min(plan - 0.1, Math.max(0.1, v));
};

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
// 지연 6건 — 기한이 지났는데 아직 안 끝난 작업. 설비가 겹치지 않게 이름으로 고른다.
// 공정률 예측(simulate)과 실제 쓰기가 같은 작업을 고르도록 함수 하나로 둔다.
const DELAY_FRAC = [0.5, 0.4, 0.6, 0.45, 0.55, 0.35];

// 분해 전/후 사진 — 작업 이름에 맞는 실사를 붙인다 (photos/real, 출처는 그 폴더 CREDITS.md).
// 예전 일러스트 사진은 "6.9kV 차단기" 같은 글자가 박혀 있어 가스터빈 작업에 붙으면 어색했다.
const PHOTO_RULES = [
  [/베어링/, "bearing"],
  [/터닝기어|기어/, "gear"],
  [/로터|회전자/, "rotor"],
  [/압축기|블레이드/, "compressor"],
];
function pickPhotoTasks(overdue, delayPick) {
  const photoTargets = [], photoPairs = [];
  for (const [re, key] of PHOTO_RULES) {
    const hit = overdue.find((t) => re.test(t.name) && !delayPick.includes(t.id) && !photoTargets.includes(t.id));
    if (hit) { photoTargets.push(hit.id); photoPairs.push(key); }
  }
  return { photoTargets, photoPairs };
}
const photoPayload = (key) => ({
  keepIds: [],
  add: [
    { slot: "before", dataUrl: dataUrl(PHOTO(`real/${key}-before.jpg`)) },
    { slot: "after", dataUrl: dataUrl(PHOTO(`real/${key}-after.jpg`)) },
  ],
});

// 사진만 바꾼다 — 실적·공정률은 그대로 두고, 사진이 붙어 있던 실적의 사진을 교체한다
async function replacePangyoPhotos() {
  const branch = "판교지사";
  await setBranch(branch);
  const { project } = await mainProject(branch);
  const rows = await getRows(project.id);
  let replaced = 0;
  for (const [re, key] of PHOTO_RULES) {
    for (const t of rows.filter((r) => re.test(r.name))) {
      const { entries = [] } = await api("GET", `/api/overhaul/entries?taskId=${t.id}`);
      const withPhoto = entries.find((e) => (e.photos || []).length);
      if (!withPhoto) continue;
      await postEntry(t.id, toDate(withPhoto.entry_date), Number(withPhoto.done_qty),
        withPhoto.work_detail || "", withPhoto.delay_reason || "", withPhoto.next_plan || "", photoPayload(key));
      console.log(`  판교: "${t.name}" 사진 → ${key}`);
      replaced++;
    }
  }
  console.log(`  판교: 사진 ${replaced}건 교체`);
}
function pickDelays(overdue) {
  const picked = [];
  for (const re of [/HRSG/, /전동기|차단기|변압기/, /DCS|제어|밸브/, /펌프/, /열교환|세관/, /배관|밸브실/]) {
    const hit = overdue.find((t) => re.test(t.name) && !picked.includes(t.id));
    if (hit) picked.push(hit.id);
  }
  return picked;
}

// 기간 가운데에 오늘이 오도록 통째로 옮기고, 완료·진행·지연·대기를 섞는다.
async function pangyoInProgress() {
  const branch = "판교지사";
  await setBranch(branch);
  const { project } = await mainProject(branch);
  const start = toDate(project.start_date);
  const end = toDate(project.end_date);
  const total = daysBetween(start, end);

  // 오늘이 기간의 어디쯤 와야 공정률이 목표(기본 50%)가 되는지 미리 계산한다.
  // 날짜 경과율과 물량 공정률은 비례하지 않아서(물량이 큰 작업이 특정 구간에 몰려
  // 있다) 고정 비율로는 32%·93%처럼 크게 빗나갔다. 아래 실적 규칙을 그대로 흉내 내
  // 후보 비율마다 공정률을 계산하고, 목표에 가장 가까운 비율을 고른다.
  const TARGET = Number(process.env.PANGYO_TARGET || 50);
  const rows0 = await getRows(project.id);
  const simulate = (E) => {
    const sh = daysBetween(start, addDays(TODAY, -Math.round(total * E)));
    const ts = rows0.map((t) => {
      const s0 = toDate(t.sch?.plannedStartStr), e0 = toDate(t.sch?.plannedEndStr);
      return { id: t.id, name: t.name, q: Number(t.planQty) || 1,
        s: s0 && addDays(s0, sh), e: e0 && addDays(e0, sh) };
    });
    const picks = pickDelays(ts.filter((t) => t.e && t.e < TODAY));
    let num = 0, den = 0;
    for (const t of ts) {
      den += t.q;
      if (!t.s || !t.e) continue;
      const di = picks.indexOf(t.id);
      if (di >= 0) num += midQty(t.q, DELAY_FRAC[di] ?? 0.5);
      else if (t.e < TODAY) num += t.q;
      else if (t.s <= TODAY) {
        num += midQty(t.q, Math.min(0.9, Math.max(0.25, daysBetween(t.s, TODAY) / Math.max(1, daysBetween(t.s, t.e)))));
      }
    }
    return (100 * num) / Math.max(1, den);
  };
  let ELAPSED = Number(process.env.PANGYO_ELAPSED || 0);
  if (!ELAPSED) {
    let best = { e: 0.5, gap: Infinity };
    for (let e = 0.35; e <= 0.85; e += 0.005) {
      const gap = Math.abs(simulate(e) - TARGET);
      if (gap < best.gap) best = { e, gap };
    }
    ELAPSED = best.e;
    console.log(`  판교: 목표 ${TARGET}% → 경과 비율 ${ELAPSED.toFixed(3)} (예상 ${simulate(ELAPSED).toFixed(1)}%)`);
  }
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
  const overdue = rows.filter((t) => toDate(t.sch?.plannedEndStr) && toDate(t.sch?.plannedEndStr) < TODAY);
  const delayPick = pickDelays(overdue);
  const delayReasons = [
    "교체 부품 입고 지연 — 납기 재확인 중",
    "선행 작업(비계) 지연으로 착수가 밀림",
    "정밀측정 결과 재시행 필요",
    "작업 중 추가 결함 발견 — 범위 조정 협의",
    "우천으로 옥외 작업 중단",
    "협력사 인력 수급 지연",
  ];

  // 사진 — 완료 작업 4건에 그 설비의 분해 전/후 실사를 붙인다
  const { photoTargets, photoPairs } = pickPhotoTasks(overdue, delayPick);

  let done = 0, prog = 0, wait = 0, delayed = 0, photos = 0;
  for (const t of rows) {
    await clearEntries(t.id);
    const planQty = Number(t.planQty) || 1;
    const s = toDate(t.sch?.plannedStartStr);
    const e = toDate(t.sch?.plannedEndStr);
    if (!s || !e) { wait++; continue; }

    const di = delayPick.indexOf(t.id);
    if (di >= 0) {
      const frac = DELAY_FRAC[di] ?? 0.5;
      const cum = midQty(planQty, frac);
      const mid = addDays(s, Math.max(1, Math.round(daysBetween(s, e) * 0.5)));
      if (daysBetween(s, mid) >= 1) {
        const first = cum >= 2 ? Math.max(1, Math.round(cum * 0.6)) : Math.max(0.1, Math.round(cum * 6) / 10);
        await postEntry(t.id, mid, first, detailFor(t.name, "mid"));
      }
      // 최근 실적은 오늘 날짜로 — 일일보고서의 "금일 주요 실적"이 비지 않게
      await postEntry(t.id, TODAY, cum, detailFor(t.name, "mid"),
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
      const photoArg = pi >= 0 ? photoPayload(photoPairs[pi]) : undefined;
      await postEntry(t.id, e, planQty, detailFor(t.name, "end"), "", "", photoArg);
      if (photoArg) photos++;
      done++;
    } else if (s <= TODAY) {
      const frac = Math.min(0.9, Math.max(0.25, daysBetween(s, TODAY) / Math.max(1, daysBetween(s, e))));
      await postEntry(t.id, TODAY, midQty(planQty, frac), detailFor(t.name, "mid"),
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

// ── ⑥ 자동 추출이 남긴 "확인 필요" 정리 ────────────────────────────────────
// 엑셀 자동 추출이 수량을 못 읽은 작업은 계획수량 0 + "확인 필요"로 남는다.
// 완료된 회차인데 수량 0이 지연 위험으로 잡혀 경고가 뜨고, 작업 목록에 "확인 필요"
// 필터가 생겨 다른 완료 지사와 화면이 달라진다. 사람이 검토를 마친 것처럼
// 수량 미기재는 1식으로 두고 표시를 내린다(작업 편집 폼이 보내는 것과 같은 patch).
async function settleReview(branch) {
  await setBranch(branch);
  const { project } = await mainProject(branch);
  await api("POST", "/api/overhaul/project/active", { id: project.id });
  let cleared = 0, qtyFixed = 0;
  for (let guard = 0; guard < 200; guard++) {
    const r = await api("GET", `/api/overhaul/tasks?needsReview=1&page=1&projectId=${project.id}`);
    const list = r.rows ?? [];
    if (!list.length) break;
    for (const t of list) {
      const patch = { needs_review: false };
      if (!(Number(t.plan_qty) > 0)) { patch.plan_qty = 1; qtyFixed++; }
      await api("PATCH", "/api/overhaul/tasks", { id: t.id, patch });
      cleared++;
    }
  }
  // 표시는 없지만 수량이 0인 작업도 같은 기준으로
  for (const t of await getRows(project.id)) {
    if (Number(t.planQty) > 0) continue;
    await api("PATCH", "/api/overhaul/tasks", { id: t.id, patch: { plan_qty: 1 } });
    qtyFixed++;
  }
  // 수량을 1로 올린 작업은 완료 실적(1)이 이미 있으면 그대로 100%가 된다 — 없으면 채운다.
  // 끝난 회차에서만 한다: 진행 중 회차(판교)의 미완료는 지연·진행 중이라는 의도된 상태다.
  let topped = 0;
  const projEnd = toDate(project.end_date);
  if (projEnd && projEnd < TODAY) {
    for (const t of await getRows(project.id)) {
      if ((t.actual ?? 0) >= 100) continue;
      const e = minDate(toDate(t.sch?.plannedEndStr) ?? projEnd, projEnd);
      await postEntry(t.id, e, Number(t.planQty) || 1, detailFor(t.name, "end"));
      topped++;
    }
  }
  console.log(`  ${branch}: 확인 필요 ${cleared}건 해제 · 수량 미기재 ${qtyFixed}건 → 1식 · 완료 실적 보충 ${topped}건`);
}

// ── ⑦ 판교 재구성 — 실제 업무 흐름대로 처음부터 다시 쌓는다 ─────────────────
// 보수계획 업로드 → 2026년 판정 "필수"로 확정 내역서 → 시공사가 일정을 채운 수량산출서
// 업로드 → 공정 진행. 이렇게 쌓아야 설비 마스터·수량산출·공정관리가 같은 설비를 본다.
// (예전 판교는 보수계획 설비와 작업 분류 설비가 따로 놀아 "발전기"가 빈 줄로 떴고,
//  진행 중인 공사인데 2026년 보수가 이미 끝난 것으로 이력에 반영돼 있었다.)
const PANGYO_SEED = path.join(__dirname, "seed", "판교재구성");
const PANGYO_PERIOD = { start: "2026-09-28", end: "2026-12-04" };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function apiForm(url, files, extra = {}) {
  const fd = new FormData();
  for (const f of files) fd.append("file", new Blob([fs.readFileSync(f)], { type: XLSX_MIME }), path.basename(f));
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  const res = await fetch(BASE + url, { method: "POST", headers: { Cookie: cookieHeader() }, body: fd });
  storeCookies(res);
  const text = await res.text();
  const json = JSON.parse(text);
  if (!res.ok || json.ok === false) throw new Error(`POST ${url} → ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

// 설비 마스터 "유형" — 보수계획 대분류 이름은 유형을 모르므로 채워 준다
const TYPE_BY_NAME = [
  [/가스터빈/, "GT"], [/배열회수/, "HRSG"], [/증기터빈/, "ST"], [/발전기/, "발전기"],
  [/지역난방/, "DH"], [/복수·급수/, "펌프/밸브"], [/배관·밸브/, "배관"],
  [/수전|고압|저압|직류|보호계전|케이블/, "전기설비"],
  [/분산제어|터빈·보일러|계측|제어밸브|분석|안전계장|계장공기/, "제어설비"],
  [/첨두부하|냉각|수처리/, "기타"],
];

async function rebuildPangyo() {
  const XLSX = require("xlsx");
  if (!fs.existsSync(path.join(PANGYO_SEED, "기계_01_중장기보수계획.xlsx"))) {
    fs.mkdirSync(PANGYO_SEED, { recursive: true });
    require("node:child_process").execFileSync(process.execPath, [
      path.join(__dirname, "make-pangyo-sample.js"), PANGYO_SEED, PANGYO_PERIOD.start, PANGYO_PERIOD.end,
    ], { stdio: "inherit" });
  }
  const branch = "판교지사";
  await setBranch(branch);
  const { project } = await mainProject(branch);
  await api("POST", "/api/overhaul/project/active", { id: project.id });
  await api("PATCH", "/api/overhaul/project", { id: project.id, start_date: PANGYO_PERIOD.start, end_date: PANGYO_PERIOD.end });

  // 1) 지우기 — 작업(업로드 파일째) · 확정 내역서 · 보수계획(등급·이력 포함) · 설비
  const { sources = [] } = await api("GET", `/api/overhaul/sources?projectId=${project.id}`);
  for (const s of sources) await api("DELETE", `/api/overhaul/sources?id=${s.id}`);
  for (const t of await getRows(project.id)) await api("DELETE", `/api/overhaul/tasks?id=${t.id}`);
  const { statements = [] } = await api("GET", "/api/overhaul/plan/statement");
  for (const s of statements) await api("DELETE", `/api/overhaul/plan/statement?id=${s.id}`);
  const plan0 = await api("GET", "/api/overhaul/plan?year=2026");
  for (const s of plan0.sources ?? []) await api("DELETE", `/api/overhaul/plan?sourceId=${s.id}`);
  await api("DELETE", "/api/equipment?all=1");
  console.log(`  판교: 지움 — 업로드 ${sources.length} · 내역서 ${statements.length} · 보수계획 파일 ${(plan0.sources ?? []).length} · 설비 전체`);

  // 2) 보수계획 업로드 → 대분류가 설비로, 태그번호가 기기·태그로 자동 등록된다
  for (const field of ["기계", "전기", "제어"]) {
    await apiForm("/api/overhaul/plan/upload", [path.join(PANGYO_SEED, `${field}_01_중장기보수계획.xlsx`)], { field });
  }
  const { items: equip = [] } = await api("GET", "/api/equipment");
  for (const e of equip) {
    const hit = TYPE_BY_NAME.find(([re]) => re.test(e.name));
    if (hit && !e.type) await api("PATCH", "/api/equipment", { id: e.id, patch: { type: hit[1] } });
  }
  console.log(`  판교: 보수계획 업로드 — 설비 ${equip.length}개 · 기기 ${equip.reduce((n, e) => n + e.device_count, 0)}개`);

  // 3) 2026년 "필수"로 확정 내역서 — 수량·단위는 시공사 수량산출서의 같은 태그 줄을 따른다
  const qtyByTag = new Map();
  for (const field of ["기계", "전기", "제어"]) {
    const wb = XLSX.readFile(path.join(PANGYO_SEED, `${field}_02_수량산출서.xlsx`));
    for (const name of wb.SheetNames.slice(1)) {
      for (const r of XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 })) {
        if (r[4]) qtyByTag.set(String(r[4]), { qty: Number(r[2]) || 1, unit: r[3] || "식" });
      }
    }
  }
  const { rows: judged = [] } = await api("GET", "/api/overhaul/plan?year=2026");
  let stItems = 0;
  for (const field of ["기계", "전기", "제어"]) {
    // 이번 공사 범위 = 수량산출서에 실린 항목. 필수라도 수량산출서에 없는 것(주요점검 MI처럼
    // 다음 회차로 미룬 것)까지 넣으면 내역서와 공정 작업이 어긋난다.
    const items = judged
      .filter((r) => r.field === field && r.judge?.classification === "필수" && qtyByTag.has(r.tag_no ?? ""))
      .map((r) => {
        const q = qtyByTag.get(r.tag_no ?? "") ?? { qty: 1, unit: "식" };
        return {
          planId: r.id, category: r.category ?? "", name: r.name, spec: r.spec ?? "",
          qty: q.qty, unit: q.unit, grade: r.plannedGrade ?? "A", note: r.tag_no ?? "", classification: "필수",
        };
      });
    if (!items.length) continue;
    await api("POST", "/api/overhaul/plan/statement", {
      targetYear: 2026, field, title: `2026년도 판교지사 정기점검보수공사 (${field})`, items,
    });
    stItems += items.length;
  }
  console.log(`  판교: 확정 내역서 3건 · 항목 ${stItems}건`);

  // 4) 시공사가 일정을 채워 돌려준 수량산출서 업로드 → 태그로 보수계획 설비에 이어진다
  const files = ["기계", "전기", "제어"].map((f) => path.join(PANGYO_SEED, `${f}_02_수량산출서.xlsx`));
  const up = await apiForm(`/api/overhaul/upload?projectId=${project.id}`, files, { fieldHint: "자동" });
  const rows = await getRows(project.id);
  console.log(`  판교: 수량산출서 업로드 — 작업 ${rows.length}건 (${(up.results ?? []).map((x) => x.extractedCount).join("+")})`);

  // 5) 담당자 — 엑셀에는 없어 "미지정"으로 들어온다. 분야별로 나눠 맡긴다
  const POOL = { 기계: ["김정훈", "박성민", "이도현"], 전기: ["최윤석", "정해진"], 제어: ["한상우", "오지현"] };
  const seen = {};
  for (const t of rows) {
    const pool = POOL[t.field] ?? POOL["기계"];
    const k = (seen[t.field] = (seen[t.field] ?? -1) + 1);
    await api("PATCH", "/api/overhaul/tasks", { id: t.id, patch: { assignee: pool[k % pool.length] } });
  }
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
  if (mode === "pangyo-rebuild") {
    console.log("\n■ 판교 재구성");
    await rebuildPangyo();
    await pangyoInProgress();
  }
  if (mode === "photos") {
    console.log("\n■ 판교 사진 교체");
    await replacePangyoPhotos();
  }
  if (mode === "review" || mode === "all") {
    console.log("\n■ 확인 필요·수량 미기재 정리");
    for (const b of BRANCHES) {
      if (b === "광교지사") continue; // 현장 시연용으로 비워 둔 지사
      await settleReview(b);
    }
  }
  console.log("\n끝.");
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
