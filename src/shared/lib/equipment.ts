import { query, queryOne, execute } from "./db";

/**
 * 설비 마스터 — 세 모듈(오버홀·고장이력·챗봇)이 공용으로 참조하는 기준 데이터.
 * 설비 마스터 화면(/equipment)에서 직접 관리하고, 엑셀 업로드·고장이력 등록 때도
 * 이름으로 자동 생성된다.
 *
 * 설비는 지사에 속한다 — 유지보수 업무가 지사별 독립 운영이라, 설비명 유일성도
 * 지사 안에서만 건다 (equipment_branch_name_key). 그래서 이 파일의 모든 함수는
 * 지사를 요구한다. 기본 지사를 깔지 않는 정책(activeBranch.ts)과 같은 이유로,
 * 지사 없이 설비를 만들면 남의 지사 데이터와 섞인다.
 */

export interface Equipment {
  id: string;
  name: string;
  /** EQUIPMENT_TYPES 참고 (equipmentMeta.ts) */
  type: string | null;
  /** EQUIPMENT_FIELDS 참고 (equipmentMeta.ts) */
  field: string | null;
  branch: string | null;
  note: string | null;
}

/** 목록 화면용 — 딸린 기기·태그 수를 함께 센다 */
export interface EquipmentWithCount extends Equipment {
  device_count: number;
}

export interface Device {
  id: string;
  equipment_id: string;
  tag: string;
  name: string | null;
  spec: string | null;
}

export interface EnsureEquipmentInput {
  name: string;
  branch: string;
  type?: string | null;
  field?: string | null;
}

/** unique 위반을 사람이 읽을 수 있는 메시지로 바꾸기 위한 판별 */
function isDuplicate(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("duplicate key") || msg.includes("23505");
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
  if (!input.branch) throw new Error("지사를 먼저 선택하세요.");

  const row = await queryOne<{ id: string }>(
    `insert into equipment (name, type, field, branch)
     values ($1, $2, $3, $4)
     on conflict (branch, lower(btrim(name))) do update
       set type  = coalesce(equipment.type,  excluded.type),
           field = coalesce(equipment.field, excluded.field)
     returning id`,
    [name, input.type ?? null, input.field ?? null, input.branch],
  );

  if (!row) throw new Error(`설비를 만들지 못했습니다: ${name}`);
  return row.id;
}

/**
 * 여러 설비를 한 번에 확보한다. 같은 이름이 여러 번 나와도 한 번만 처리한다.
 * 엑셀 한 장에 같은 설비가 수백 줄 나오는 경우를 위한 것.
 * 반환값은 `이름(소문자·trim) → id` 맵. (한 번의 호출은 한 지사의 업로드라
 * 이름만으로 충분하다.)
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
        branch: prev.branch,
        type: prev.type ?? input.type,
        field: prev.field ?? input.field,
      });
  }

  const out = new Map<string, string>();
  for (const [k, input] of unique) {
    out.set(k, await ensureEquipment(input));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 설비 CRUD — 설비 마스터 화면(/equipment)이 쓴다
// ---------------------------------------------------------------------------

export async function listEquipment(branch: string): Promise<EquipmentWithCount[]> {
  return query<EquipmentWithCount>(
    `select e.id, e.name, e.type, e.field, e.branch, e.note,
            count(d.id)::int as device_count
       from equipment e
       left join device d on d.equipment_id = e.id
      where e.branch = $1
      group by e.id
      order by e.name`,
    [branch],
  );
}

export async function findEquipmentByName(
  branch: string,
  name: string,
): Promise<Equipment | null> {
  return queryOne<Equipment>(
    `select id, name, type, field, branch, note
       from equipment
      where branch = $1 and lower(btrim(name)) = lower(btrim($2))`,
    [branch, name],
  );
}

export interface EquipmentPatch {
  name?: string;
  type?: string | null;
  field?: string | null;
  note?: string | null;
}

export async function createEquipment(input: {
  branch: string;
  name: string;
  type?: string | null;
  field?: string | null;
  note?: string | null;
}): Promise<{ id: string }> {
  const name = input.name?.trim();
  if (!name) throw new Error("설비명을 입력하세요.");
  try {
    const row = await queryOne<{ id: string }>(
      `insert into equipment (branch, name, type, field, note)
       values ($1, $2, $3, $4, $5) returning id`,
      [input.branch, name, input.type || null, input.field || null, input.note || null],
    );
    if (!row) throw new Error("설비를 만들지 못했습니다.");
    return row;
  } catch (e) {
    if (isDuplicate(e)) throw new Error(`이 지사에 이미 같은 이름의 설비가 있습니다: ${name}`);
    throw e;
  }
}

export async function updateEquipment(id: string, patch: EquipmentPatch): Promise<void> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === "name" && !(v as string)?.trim()) throw new Error("설비명을 입력하세요.");
    cols.push(`${k} = $${cols.length + 1}`);
    vals.push(v === "" ? null : v);
  }
  if (!cols.length) return;
  vals.push(id);
  try {
    await execute(`update equipment set ${cols.join(", ")} where id = $${vals.length}`, vals);
  } catch (e) {
    if (isDuplicate(e)) throw new Error("이 지사에 이미 같은 이름의 설비가 있습니다.");
    throw e;
  }
}

/** 설비 삭제 — 딸린 기기·태그는 함께 지워지고(cascade), 보수계획·작업의 참조는 끊긴다(set null) */
export async function deleteEquipment(id: string): Promise<number> {
  return execute(`delete from equipment where id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// 기기·태그 CRUD — 설비에 딸린 2단
// ---------------------------------------------------------------------------

export async function listDevices(equipmentId: string): Promise<Device[]> {
  return query<Device>(
    `select id, equipment_id, tag, name, spec
       from device
      where equipment_id = $1
      order by tag`,
    [equipmentId],
  );
}

export async function createDevice(input: {
  equipmentId: string;
  tag: string;
  name?: string | null;
  spec?: string | null;
}): Promise<{ id: string }> {
  const tag = input.tag?.trim();
  if (!tag) throw new Error("태그를 입력하세요.");
  try {
    // 지사는 소속 설비에서 복사한다 — 기기가 설비와 다른 지사에 있을 수 없다.
    const row = await queryOne<{ id: string }>(
      `insert into device (equipment_id, branch, tag, name, spec)
       select e.id, e.branch, $2, $3, $4 from equipment e where e.id = $1
       returning id`,
      [input.equipmentId, tag, input.name || null, input.spec || null],
    );
    if (!row) throw new Error("설비를 찾을 수 없습니다.");
    return row;
  } catch (e) {
    if (isDuplicate(e)) throw new Error(`이 지사에 이미 같은 태그가 있습니다: ${tag}`);
    throw e;
  }
}

export interface DevicePatch {
  tag?: string;
  name?: string | null;
  spec?: string | null;
}

export async function updateDevice(id: string, patch: DevicePatch): Promise<void> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === "tag" && !(v as string)?.trim()) throw new Error("태그를 입력하세요.");
    cols.push(`${k} = $${cols.length + 1}`);
    vals.push(v === "" ? null : v);
  }
  if (!cols.length) return;
  vals.push(id);
  try {
    await execute(`update device set ${cols.join(", ")} where id = $${vals.length}`, vals);
  } catch (e) {
    if (isDuplicate(e)) throw new Error("이 지사에 이미 같은 태그가 있습니다.");
    throw e;
  }
}

export async function deleteDevice(id: string): Promise<number> {
  return execute(`delete from device where id = $1`, [id]);
}
