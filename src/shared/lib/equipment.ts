import { query, queryOne } from "./db";

/**
 * 설비 마스터 — 세 모듈(오버홀·고장이력·챗봇)이 공용으로 참조하는 기준 데이터.
 * 별도 등록 화면 없이도, 엑셀을 올리거나 고장이력을 등록할 때 이름으로 자동 생성된다.
 */

export interface Equipment {
  id: string;
  name: string;
  /** GT / ST / HRSG / DH / 발전기 / 전기설비 / 제어설비 / 펌프·밸브 / 배관 / 비계 / 기타 */
  type: string | null;
  /** 기계 / 전기 / 제어 / 전산 */
  field: string | null;
  branch: string | null;
  note: string | null;
}

export interface EnsureEquipmentInput {
  name: string;
  type?: string | null;
  field?: string | null;
  branch?: string | null;
}

/**
 * 이름으로 설비를 찾고 없으면 만든다. 설비 id를 돌려준다.
 *
 * 이미 있는 설비의 값은 덮어쓰지 않는다 — 나중에 들어온 자동 분류값이
 * 사람이 손으로 고쳐둔 값을 지워버리면 안 되기 때문. 비어 있는 칸만 채운다.
 */
export async function ensureEquipment(input: EnsureEquipmentInput): Promise<string> {
  const name = input.name?.trim();
  if (!name) throw new Error("설비명이 비어 있습니다.");

  const row = await queryOne<{ id: string }>(
    `insert into equipment (name, type, field, branch)
     values ($1, $2, $3, $4)
     on conflict (lower(btrim(name))) do update
       set type   = coalesce(equipment.type,   excluded.type),
           field  = coalesce(equipment.field,  excluded.field),
           branch = coalesce(equipment.branch, excluded.branch)
     returning id`,
    [name, input.type ?? null, input.field ?? null, input.branch ?? null],
  );

  if (!row) throw new Error(`설비를 만들지 못했습니다: ${name}`);
  return row.id;
}

/**
 * 여러 설비를 한 번에 확보한다. 같은 이름이 여러 번 나와도 한 번만 처리한다.
 * 엑셀 한 장에 같은 설비가 수백 줄 나오는 경우를 위한 것.
 * 반환값은 `이름(소문자·trim) → id` 맵.
 */
export async function ensureEquipments(
  inputs: EnsureEquipmentInput[],
): Promise<Map<string, string>> {
  const key = (n: string) => n.trim().toLowerCase();
  const unique = new Map<string, EnsureEquipmentInput>();

  for (const input of inputs) {
    if (!input.name?.trim()) continue;
    const k = key(input.name);
    const prev = unique.get(k);
    // 같은 설비가 여러 줄에 나오면 값이 채워진 쪽을 남긴다
    if (!prev) unique.set(k, input);
    else
      unique.set(k, {
        name: prev.name,
        type: prev.type ?? input.type,
        field: prev.field ?? input.field,
        branch: prev.branch ?? input.branch,
      });
  }

  const out = new Map<string, string>();
  for (const [k, input] of unique) {
    out.set(k, await ensureEquipment(input));
  }
  return out;
}

export async function listEquipment(): Promise<Equipment[]> {
  return query<Equipment>(
    `select id, name, type, field, branch, note from equipment order by name`,
  );
}

export async function findEquipmentByName(name: string): Promise<Equipment | null> {
  return queryOne<Equipment>(
    `select id, name, type, field, branch, note
       from equipment
      where lower(btrim(name)) = lower(btrim($1))`,
    [name],
  );
}
