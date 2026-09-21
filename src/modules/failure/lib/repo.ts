import { query, queryOne } from "@/shared/lib/db";
import { ensureEquipment } from "@/shared/lib/equipment";

/**
 * 고장이력 관리의 DB 접근 계층.
 * 화면과 API Route는 여기만 부르고 SQL을 직접 쓰지 않는다.
 */

export interface FailureHistoryRow {
  id: string;
  equipment_id: string | null;
  title: string | null;
  report_type: string | null;
  branch: string | null;
  heat_facility: string | null;
  equipment_name: string | null;
  device_name: string | null;
  failure_field: string | null;
  status: string | null;
  occurred_at: string | null;
  recovered_at: string | null;
  apt_count: string | null;
  building_count: string | null;
  interruption_duration: string | null;
  interruption_period: string | null;
  cause_manager_raw: string | null;
  cause_owner_raw: string | null;
  situation: string | null;
  alarm_status: string | null;
  cause_4m1e: string | null;
  impact_heat_loss: string | null;
  impact_duration: string | null;
  emergency_action: string | null;
  recovery_detail: string | null;
  recurrence_prevention: string | null;
  content_summary: string | null;
  reporter: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

const FAILURE_COLUMNS = `id, equipment_id, title, report_type, branch, heat_facility, equipment_name,
  device_name, failure_field, status, occurred_at, recovered_at, apt_count, building_count,
  interruption_duration, interruption_period, cause_manager_raw, cause_owner_raw, situation,
  alarm_status, cause_4m1e, impact_heat_loss, impact_duration, emergency_action, recovery_detail,
  recurrence_prevention, content_summary, reporter, source,
  created_at::text, updated_at::text`;

export interface FailureHistoryInput {
  title?: string | null;
  branch?: string | null;
  heatFacility?: string | null;
  equipmentName?: string | null;
  deviceName?: string | null;
  failureField?: string | null;
  status?: string | null;
  occurredAt?: string | null;
  recoveredAt?: string | null;
  aptCount?: string | null;
  buildingCount?: string | null;
  interruptionDuration?: string | null;
  interruptionPeriod?: string | null;
  causeManagerRaw?: string | null;
  causeOwnerRaw?: string | null;
  situation?: string | null;
  alarmStatus?: string | null;
  cause4m1e?: string | null;
  impactHeatLoss?: string | null;
  impactDuration?: string | null;
  emergencyAction?: string | null;
  recoveryDetail?: string | null;
  recurrencePrevention?: string | null;
  contentSummary?: string | null;
  reporter?: string | null;
  source?: string | null;
}

/** null/undefined/빈문자열이면 컬럼 기본값에 맡기도록 null로 통일 */
function orNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export interface AttachmentInput {
  fileName: string;
  /** data:<mime>;base64,<...> — 파일을 로컬 디스크가 아니라 DB에 직접 담는다(Vercel 안전) */
  dataUrl: string;
}

export interface AttachmentRow {
  id: string;
  file_name: string;
  created_at: string;
}

/**
 * 고장이력 한 건을 등록한다. equipmentName이 있으면 설비 마스터에 upsert하고
 * equipment_id로 연결한다 — 마스터 연결이 실패해도 원문(equipment_name)은 그대로 남는다.
 * attachment가 있으면(수기 등록 화면에서 PDF를 함께 올린 경우) 같은 트랜잭션 없이도
 * 순서대로 붙인다 — 첨부 저장이 실패해도 이력 자체는 이미 저장된 채로 남는다.
 */
export async function createFailure(
  input: FailureHistoryInput,
  attachment?: AttachmentInput,
): Promise<{ id: string }> {
  const equipmentName = orNull(input.equipmentName);
  let equipmentId: string | null = null;
  if (equipmentName) {
    try {
      equipmentId = await ensureEquipment({ name: equipmentName, field: orNull(input.failureField) });
    } catch {
      // 설비 마스터 연결 실패는 등록 자체를 막지 않는다 — equipment_name 원문은 그대로 저장된다.
    }
  }

  const row = await queryOne<{ id: string }>(
    `insert into failure_history
       (equipment_id, title, branch, heat_facility, equipment_name, device_name, failure_field,
        status, occurred_at, recovered_at, apt_count, building_count, interruption_duration,
        interruption_period, cause_manager_raw, cause_owner_raw, situation, alarm_status,
        cause_4m1e, impact_heat_loss, impact_duration, emergency_action, recovery_detail,
        recurrence_prevention, content_summary, reporter, source)
     values
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     returning id::text`,
    [
      equipmentId,
      orNull(input.title),
      orNull(input.branch),
      orNull(input.heatFacility),
      equipmentName,
      orNull(input.deviceName),
      orNull(input.failureField),
      orNull(input.status) ?? "조치중",
      orNull(input.occurredAt),
      orNull(input.recoveredAt),
      orNull(input.aptCount),
      orNull(input.buildingCount),
      orNull(input.interruptionDuration),
      orNull(input.interruptionPeriod),
      orNull(input.causeManagerRaw),
      orNull(input.causeOwnerRaw),
      orNull(input.situation),
      orNull(input.alarmStatus),
      orNull(input.cause4m1e),
      orNull(input.impactHeatLoss),
      orNull(input.impactDuration),
      orNull(input.emergencyAction),
      orNull(input.recoveryDetail),
      orNull(input.recurrencePrevention),
      orNull(input.contentSummary),
      orNull(input.reporter),
      orNull(input.source) ?? "manual",
    ],
  );

  if (!row) throw new Error("고장이력을 저장하지 못했습니다.");

  if (attachment) {
    await addAttachment(row.id, attachment);
  }

  return { id: row.id };
}

export async function getFailure(id: string): Promise<FailureHistoryRow | null> {
  return queryOne<FailureHistoryRow>(`select ${FAILURE_COLUMNS} from failure_history where id = $1`, [id]);
}

export async function listFailures(limit = 20): Promise<FailureHistoryRow[]> {
  return query<FailureHistoryRow>(
    `select ${FAILURE_COLUMNS} from failure_history order by id desc limit $1`,
    [limit],
  );
}

export async function addAttachment(failureId: string, input: AttachmentInput): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `insert into failure_attachment (failure_id, file_name, data) values ($1,$2,$3) returning id::text`,
    [failureId, input.fileName, input.dataUrl],
  );
  if (!row) throw new Error("첨부파일을 저장하지 못했습니다.");
  return { id: row.id };
}

export async function listAttachments(failureId: string): Promise<AttachmentRow[]> {
  return query<AttachmentRow>(
    `select id::text, file_name, created_at::text from failure_attachment where failure_id = $1 order by id`,
    [failureId],
  );
}

/** 스트리밍 라우트용 — base64 data URL 그대로 돌려준다 */
export async function getAttachmentData(id: string): Promise<{ file_name: string; data: string } | null> {
  return queryOne<{ file_name: string; data: string }>(
    `select file_name, data from failure_attachment where id = $1`,
    [id],
  );
}
