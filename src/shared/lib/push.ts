import webpush from "web-push";
import { execute, query } from "./db";
import { OPERATIONS_DEPARTMENT } from "./departments";
import type { StatusIssueRow } from "@/modules/status/lib/repo";

/**
 * 웹 푸시 발송 — 현황 등록·조치완료를 해당 지사의 담당 부서 기기들로 알린다.
 *
 * 구독(어느 기기로 보낼지)은 push_subscription 테이블에 지사·부서와 함께 담겨 있고
 * (db/schema.sql), 등록·해제는 /api/push 가 한다. 이 파일은 "누구에게 무엇을
 * 보낼지"만 안다.
 *
 * VAPID 키(환경변수 세 개)가 없으면 모든 함수가 조용히 아무 일도 하지 않는다 —
 * 알림은 부가 기능이라, 키가 빠졌다고 현황 등록 자체가 실패해서는 안 된다.
 * 같은 이유로 발송 실패도 던지지 않는다(만료된 구독은 지운다).
 *
 * 서버 전용이다 (web-push, db).
 */

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 서비스 워커(sw.js push 핸들러)가 받는 payload 모양 */
interface PushPayload {
  title: string;
  body: string;
  /** 알림을 눌렀을 때 열 주소 (앱 내 경로) */
  url: string;
  /** 같은 tag 의 알림은 겹치지 않고 갱신된다 */
  tag: string;
}

let vapidReady = false;

function ensureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", publicKey, privateKey);
    vapidReady = true;
  }
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** 구독 등록/갱신 — 같은 기기(endpoint)가 지사·부서를 바꿔 다시 등록하면 그 행이 갱신된다 */
export async function saveSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  branch: string;
  department: string;
}): Promise<void> {
  await execute(
    `insert into push_subscription (endpoint, p256dh, auth, branch, department)
     values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update
       set p256dh = excluded.p256dh, auth = excluded.auth,
           branch = excluded.branch, department = excluded.department`,
    [input.endpoint, input.p256dh, input.auth, input.branch, input.department],
  );
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await execute(`delete from push_subscription where endpoint = $1`, [endpoint]);
}

/** 대상 기기들에 보낸다. 만료된 구독(404/410)은 그 자리에서 지운다 */
async function sendTo(subs: SubscriptionRow[], payload: PushPayload): Promise<void> {
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24 },
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await deleteSubscription(s.endpoint).catch(() => {});
        }
      }
    }),
  );
}

async function subscriptionsFor(branch: string | null, department: string): Promise<SubscriptionRow[]> {
  if (!branch) return [];
  return query<SubscriptionRow>(
    `select endpoint, p256dh, auth from push_subscription where branch = $1 and department = $2`,
    [branch, department],
  );
}

/** 긴 이슈 내용이 알림 한 장을 다 차지하지 않게 줄인다 */
function clip(text: string, max = 90): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * 운영부가 현황을 등록했다 → 그 지사의 담당부서(계전부·기계부·공무부) 기기들로.
 * 구독 테이블이 아직 없는 DB(마이그레이션 전)에서도 등록이 깨지지 않도록 전체를 삼킨다.
 */
export async function notifyIssueCreated(row: StatusIssueRow): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const subs = await subscriptionsFor(row.branch, row.department);
    await sendTo(subs, {
      title: `[${row.branch}] 현황 등록 — ${row.department} 조치 필요`,
      body: `${row.equipment_name} · ${clip(row.content)} (작성 ${row.reporter})`,
      url: `/status?issue=${row.id}`,
      tag: `issue-${row.id}`,
    });
  } catch (e) {
    console.error("푸시 발송 실패(현황 등록):", e instanceof Error ? e.message : e);
  }
}

/** 유지보수가 조치완료로 바꿨다 → 그 지사의 운영부 기기들로 */
export async function notifyIssueResolved(row: StatusIssueRow): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const subs = await subscriptionsFor(row.branch, OPERATIONS_DEPARTMENT);
    const by = row.handled_by ? ` (조치 ${row.handled_by})` : "";
    await sendTo(subs, {
      title: `[${row.branch}] 조치 완료 — ${row.department}`,
      body: `${row.equipment_name} · ${clip(row.action_note || row.content)}${by}`,
      url: `/status?issue=${row.id}`,
      tag: `issue-${row.id}`,
    });
  } catch (e) {
    console.error("푸시 발송 실패(조치 완료):", e instanceof Error ? e.message : e);
  }
}
