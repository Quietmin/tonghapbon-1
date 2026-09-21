// 등급 이력에서 반복 패턴을 찾아 미래 등급을 추정한다.
//
// 원칙: "같은 주기(P)마다 등급 순서가 완전히 똑같이 되풀이되는 게 최소 두 바퀴는
// 확인될 때"만 패턴으로 인정한다. 그렇지 않으면(등급이 들쭉날쭉하거나 이력이
// 짧으면) null을 돌려주고, 호출하는 쪽은 그 미래 연도를 "확인 필요"로 남긴다.
// 안전한 쪽으로 치우친 판단이다 — 틀린 추정을 보여주는 것보다 비워 두는 게 낫다.
export interface GradePattern {
  /** 되풀이 주기 (몇 개 단위로 반복되는지) */
  period: number;
  /** 그 주기의 한 바퀴 — 다음 값들은 이 배열을 순서대로 반복한다 */
  unit: string[];
}

/**
 * grades: 실제 보수가 있었던 연도만 뽑아 시간순으로 나열한 등급 문자열 배열.
 * (주기상 보수가 없던 해는 이미 빠져 있어야 한다 — 이 함수는 "몇 번째 보수인가"만 본다)
 *
 * 가장 작은 주기부터 검사해서, 배열 전체에서 그 주기로 어긋남 없이 맞아떨어지고
 * 최소 두 바퀴(n >= 2*p) 이상 반복이 확인되는 첫 주기를 돌려준다.
 */
export function detectGradePattern(grades: string[]): GradePattern | null {
  const n = grades.length;
  for (let p = 1; p <= Math.floor(n / 2); p++) {
    let ok = true;
    for (let i = 0; i + p < n; i++) {
      if (grades[i] !== grades[i + p]) {
        ok = false;
        break;
      }
    }
    if (ok) return { period: p, unit: grades.slice(n - p) };
  }
  return null;
}
