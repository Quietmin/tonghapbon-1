import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS failure_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    report_type TEXT DEFAULT '고장상보',
    branch TEXT,
    heat_facility TEXT,
    equipment_name TEXT,
    device_name TEXT,
    failure_field TEXT,
    status TEXT DEFAULT '조치중',
    occurred_at TEXT,
    recovered_at TEXT,
    apt_count TEXT,
    building_count TEXT,
    interruption_duration TEXT,
    interruption_period TEXT,
    cause_manager_raw TEXT,
    cause_owner_raw TEXT,
    situation TEXT,
    alarm_status TEXT,
    cause_4m1e TEXT,
    impact_heat_loss TEXT,
    impact_duration TEXT,
    emergency_action TEXT,
    recovery_detail TEXT,
    recurrence_prevention TEXT,
    reporter TEXT,
    source TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    failure_id INTEGER NOT NULL REFERENCES failure_history(id),
    file_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

/** Adds a column to an existing table if it isn't there yet (for schema changes after first release). */
function ensureColumn(table: string, column: string, type: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

ensureColumn("failure_history", "heat_facility", "TEXT");
ensureColumn("failure_history", "content_summary", "TEXT");

/** Wipes all failure history rows, attachments, and uploaded files. */
export function resetAllData(): void {
  db.exec("DELETE FROM attachments;");
  db.exec("DELETE FROM failure_history;");
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('attachments', 'failure_history');");

  for (const fileName of fs.readdirSync(UPLOADS_DIR)) {
    fs.unlinkSync(path.join(UPLOADS_DIR, fileName));
  }
}

export interface FailureHistoryInput {
  title?: string;
  branch?: string;
  heatFacility?: string;
  equipmentName?: string;
  deviceName?: string;
  failureField?: string;
  status?: string;
  occurredAt?: string;
  recoveredAt?: string;
  aptCount?: string;
  buildingCount?: string;
  interruptionDuration?: string;
  interruptionPeriod?: string;
  causeManagerRaw?: string;
  causeOwnerRaw?: string;
  situation?: string;
  alarmStatus?: string;
  cause4m1e?: string;
  impactHeatLoss?: string;
  impactDuration?: string;
  emergencyAction?: string;
  recoveryDetail?: string;
  recurrencePrevention?: string;
  contentSummary?: string;
  reporter?: string;
  source?: string;
  attachments?: { fileName: string; storedName: string }[];
}

export interface FailureHistoryRow {
  id: number;
  title: string | null;
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

export interface AttachmentRow {
  id: number;
  failure_id: number;
  file_name: string;
  stored_name: string;
  created_at: string;
}

export function createFailureHistory(input: FailureHistoryInput): number {
  const insert = db.prepare(`
    INSERT INTO failure_history
      (title, branch, heat_facility, equipment_name, device_name, failure_field, status, occurred_at, recovered_at,
       apt_count, building_count, interruption_duration, interruption_period,
       cause_manager_raw, cause_owner_raw, situation, alarm_status, cause_4m1e,
       impact_heat_loss, impact_duration, emergency_action, recovery_detail, recurrence_prevention,
       content_summary, reporter, source, updated_at)
    VALUES
      (@title, @branch, @heatFacility, @equipmentName, @deviceName, @failureField, @status, @occurredAt, @recoveredAt,
       @aptCount, @buildingCount, @interruptionDuration, @interruptionPeriod,
       @causeManagerRaw, @causeOwnerRaw, @situation, @alarmStatus, @cause4m1e,
       @impactHeatLoss, @impactDuration, @emergencyAction, @recoveryDetail, @recurrencePrevention,
       @contentSummary, @reporter, @source, datetime('now'))
  `);

  const result = insert.run({
    title: input.title ?? "",
    branch: input.branch ?? "",
    heatFacility: input.heatFacility ?? "",
    equipmentName: input.equipmentName ?? "",
    deviceName: input.deviceName ?? "",
    failureField: input.failureField ?? "",
    status: input.status ?? "조치중",
    occurredAt: input.occurredAt ?? "",
    recoveredAt: input.recoveredAt ?? "",
    aptCount: input.aptCount ?? "",
    buildingCount: input.buildingCount ?? "",
    interruptionDuration: input.interruptionDuration ?? "",
    interruptionPeriod: input.interruptionPeriod ?? "",
    causeManagerRaw: input.causeManagerRaw ?? "",
    causeOwnerRaw: input.causeOwnerRaw ?? "",
    situation: input.situation ?? "",
    alarmStatus: input.alarmStatus ?? "",
    cause4m1e: input.cause4m1e ?? "",
    impactHeatLoss: input.impactHeatLoss ?? "",
    impactDuration: input.impactDuration ?? "",
    emergencyAction: input.emergencyAction ?? "",
    recoveryDetail: input.recoveryDetail ?? "",
    recurrencePrevention: input.recurrencePrevention ?? "",
    contentSummary: input.contentSummary ?? "",
    reporter: input.reporter ?? "",
    source: input.source ?? "manual",
  });

  const failureId = Number(result.lastInsertRowid);

  if (input.attachments?.length) {
    const insertAttachment = db.prepare(
      `INSERT INTO attachments (failure_id, file_name, stored_name) VALUES (@failureId, @fileName, @storedName)`,
    );
    for (const att of input.attachments) {
      insertAttachment.run({ failureId, fileName: att.fileName, storedName: att.storedName });
    }
  }

  return failureId;
}

/** Inserts many rows in a single transaction (used by the Excel migration import). */
export function bulkCreateFailureHistory(inputs: FailureHistoryInput[]): number {
  const insertAll = db.transaction((items: FailureHistoryInput[]) => {
    for (const item of items) createFailureHistory(item);
  });
  insertAll(inputs);
  return inputs.length;
}

export interface FailureHistoryFilters {
  branch?: string;
  status?: string;
  failureField?: string;
  from?: string;
  to?: string;
  q?: string;
}

const SEARCHABLE_COLUMNS = [
  "title",
  "branch",
  "heat_facility",
  "equipment_name",
  "device_name",
  "situation",
  "cause_4m1e",
  "recovery_detail",
  "recurrence_prevention",
  "content_summary",
];

export function listFailureHistory(filters: FailureHistoryFilters = {}): FailureHistoryRow[] {
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (filters.branch) {
    // Prefix match, not exact: registered records often store the full label
    // (e.g. "청주지사") while the filter list uses the short branch name (e.g. "청주").
    conditions.push("branch LIKE @branch");
    params.branch = `${filters.branch}%`;
  }
  if (filters.status) {
    conditions.push("status = @status");
    params.status = filters.status;
  }
  if (filters.failureField) {
    conditions.push("failure_field = @failureField");
    params.failureField = filters.failureField;
  }
  if (filters.from) {
    conditions.push("occurred_at >= @from");
    params.from = filters.from;
  }
  if (filters.to) {
    conditions.push("occurred_at <= @to");
    params.to = `${filters.to}T23:59`;
  }
  if (filters.q) {
    conditions.push(`(${SEARCHABLE_COLUMNS.map((col) => `${col} LIKE @q`).join(" OR ")})`);
    params.q = `%${filters.q}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM failure_history ${where} ORDER BY id DESC`).all(params) as FailureHistoryRow[];
}

export function getFailureHistoryById(id: number): FailureHistoryRow | undefined {
  return db.prepare("SELECT * FROM failure_history WHERE id = ?").get(id) as FailureHistoryRow | undefined;
}

/** Maps FailureHistoryInput keys (camelCase) to their failure_history columns (snake_case). */
const FIELD_COLUMN_MAP: Record<string, string> = {
  title: "title",
  branch: "branch",
  heatFacility: "heat_facility",
  equipmentName: "equipment_name",
  deviceName: "device_name",
  failureField: "failure_field",
  status: "status",
  occurredAt: "occurred_at",
  recoveredAt: "recovered_at",
  aptCount: "apt_count",
  buildingCount: "building_count",
  interruptionDuration: "interruption_duration",
  interruptionPeriod: "interruption_period",
  causeManagerRaw: "cause_manager_raw",
  causeOwnerRaw: "cause_owner_raw",
  situation: "situation",
  alarmStatus: "alarm_status",
  cause4m1e: "cause_4m1e",
  impactHeatLoss: "impact_heat_loss",
  impactDuration: "impact_duration",
  emergencyAction: "emergency_action",
  recoveryDetail: "recovery_detail",
  recurrencePrevention: "recurrence_prevention",
  contentSummary: "content_summary",
  reporter: "reporter",
};

/**
 * Partial update — only columns whose key is present on `input` are touched,
 * so callers can send either a full edit form or a small patch (e.g. just
 * `{ status, recoveredAt }` for the "mark as complete" action).
 */
export function updateFailureHistory(id: number, input: Partial<FailureHistoryInput>): void {
  const setClauses: string[] = [];
  const params: Record<string, string | number> = { id };

  for (const [key, column] of Object.entries(FIELD_COLUMN_MAP)) {
    if (key in input) {
      setClauses.push(`${column} = @${key}`);
      params[key] = (input as Record<string, string | undefined>)[key] ?? "";
    }
  }

  if (setClauses.length > 0) {
    db.prepare(`UPDATE failure_history SET ${setClauses.join(", ")}, updated_at = datetime('now') WHERE id = @id`).run(params);
  }

  if (input.attachments?.length) {
    const insertAttachment = db.prepare(
      `INSERT INTO attachments (failure_id, file_name, stored_name) VALUES (@failureId, @fileName, @storedName)`,
    );
    for (const att of input.attachments) {
      insertAttachment.run({ failureId: id, fileName: att.fileName, storedName: att.storedName });
    }
  }
}

export function getAttachmentsByFailureId(id: number): AttachmentRow[] {
  return db.prepare("SELECT * FROM attachments WHERE failure_id = ? ORDER BY id ASC").all(id) as AttachmentRow[];
}

export function getAttachmentById(id: number): AttachmentRow | undefined {
  return db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as AttachmentRow | undefined;
}

/** Persists an uploaded file's bytes under a random name and returns that name. */
export function saveUploadedFile(buffer: Buffer, originalName: string): string {
  const ext = path.extname(originalName);
  const storedName = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, storedName), buffer);
  return storedName;
}

export function getUploadedFilePath(storedName: string): string {
  return path.join(UPLOADS_DIR, storedName);
}

export interface DashboardStats {
  totalCount: number;
  thisMonthCount: number;
  ytdCount: number;
  inProgressCount: number;
  topEquipmentName: string | null;
  topEquipmentCount: number;
  monthlyTrend: { month: string; count: number }[];
  failureFieldBreakdown: { field: string; count: number }[];
  branchBreakdown: { branch: string; count: number }[];
  topEquipment: { name: string; count: number }[];
  recent: FailureHistoryRow[];
}

function countWhere(sql: string, param?: string): number {
  const row = param ? db.prepare(sql).get(param) : db.prepare(sql).get();
  return (row as { c: number }).c;
}

/** All figures are computed live from failure_history — no sample/mock data. */
export function getDashboardStats(): DashboardStats {
  const now = new Date();
  const thisYear = String(now.getFullYear());
  const thisMonthKey = `${thisYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const totalCount = countWhere("SELECT COUNT(*) as c FROM failure_history");
  const thisMonthCount = countWhere("SELECT COUNT(*) as c FROM failure_history WHERE substr(occurred_at, 1, 7) = ?", thisMonthKey);
  const ytdCount = countWhere("SELECT COUNT(*) as c FROM failure_history WHERE substr(occurred_at, 1, 4) = ?", thisYear);
  const inProgressCount = countWhere("SELECT COUNT(*) as c FROM failure_history WHERE status = '조치중'");

  const monthlyTrend: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyTrend.push({
      month: `${String(d.getMonth() + 1).padStart(2, "0")}월`,
      count: countWhere("SELECT COUNT(*) as c FROM failure_history WHERE substr(occurred_at, 1, 7) = ?", key),
    });
  }

  const failureFieldBreakdown = db
    .prepare(
      `SELECT COALESCE(NULLIF(failure_field, ''), '미분류') as field, COUNT(*) as count
       FROM failure_history GROUP BY field ORDER BY count DESC`,
    )
    .all() as { field: string; count: number }[];

  const branchBreakdown = db
    .prepare(
      `SELECT COALESCE(NULLIF(branch, ''), '미상') as branch, COUNT(*) as count
       FROM failure_history GROUP BY branch ORDER BY count DESC LIMIT 10`,
    )
    .all() as { branch: string; count: number }[];

  const topEquipment = db
    .prepare(
      `SELECT COALESCE(NULLIF(equipment_name, ''), '미상') as name, COUNT(*) as count
       FROM failure_history GROUP BY name ORDER BY count DESC LIMIT 10`,
    )
    .all() as { name: string; count: number }[];

  const recent = db.prepare("SELECT * FROM failure_history ORDER BY id DESC LIMIT 5").all() as FailureHistoryRow[];

  return {
    totalCount,
    thisMonthCount,
    ytdCount,
    inProgressCount,
    topEquipmentName: topEquipment[0]?.name ?? null,
    topEquipmentCount: topEquipment[0]?.count ?? 0,
    monthlyTrend,
    failureFieldBreakdown,
    branchBreakdown,
    topEquipment,
    recent,
  };
}

export interface EquipmentSummaryRow {
  branch: string;
  equipmentName: string;
  count: number;
  lastOccurredAt: string | null;
  lastStatus: string | null;
}

/** Equipment isn't a managed entity yet (PRD open issue) — this aggregates
 * distinct branch+설비명 pairs straight out of registered failure history. */
export function listEquipmentSummary(branch?: string): EquipmentSummaryRow[] {
  const branchClause = branch ? "AND f1.branch LIKE @branch" : "";
  return db
    .prepare(
      `SELECT f1.branch as branch,
              f1.equipment_name as equipmentName,
              COUNT(*) as count,
              MAX(f1.occurred_at) as lastOccurredAt,
              (SELECT status FROM failure_history f2
                 WHERE f2.branch = f1.branch AND f2.equipment_name = f1.equipment_name
                 ORDER BY f2.occurred_at DESC LIMIT 1) as lastStatus
       FROM failure_history f1
       WHERE f1.equipment_name IS NOT NULL AND f1.equipment_name != '' ${branchClause}
       GROUP BY f1.branch, f1.equipment_name
       ORDER BY count DESC`,
    )
    .all(branch ? { branch: `${branch}%` } : {}) as EquipmentSummaryRow[];
}
