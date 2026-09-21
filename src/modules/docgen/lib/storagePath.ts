/**
 * Storage 오브젝트 키 생성. 원본 legacy Photo-Report archive.js 를 그대로 이식.
 *
 * Supabase Storage 는 오브젝트 키에 ASCII 외 문자(한글 포함)를 허용하지 않는다
 * (서버가 \w — 즉 [A-Za-z0-9_] — 와 일부 기호만 통과시킨다). 그래서 한글은
 * 로마자(발음)로 바꿔 저장 경로에 넣는다. 화면에 보이는 한글 원문은 documents
 * 테이블의 branch·title·file_name 컬럼에 그대로 저장되므로 조회 화면은 안 바뀐다.
 * (원본 주석 유지)
 *
 * 경로 규칙은 원본과 동일하게 유지한다 — 나중에 뚝 DOC 보관함 데이터를 이 앱으로
 * 옮기거나 대조할 때 경로가 1:1 로 맞아야 한다. 버킷·프로젝트가 다르므로 파일이
 * 섞일 일은 없다.
 */
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

const CHO = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
const JUNG = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
const JONG = ["","k","k","k","n","n","n","t","l","k","m","l","l","l","p","l","m","p","p","t","t","ng","j","ch","k","t","p","h"];

/** 완성형 한글 음절 한 글자를 로마자로 (국립국어원 로마자 표기법 간이 버전) */
function romanizeHangulSyllable(ch: string): string {
  const code = ch.charCodeAt(0) - HANGUL_BASE;
  const jong = code % 28;
  const jung = ((code - jong) / 28) % 21;
  const cho = ((code - jong) / 28 - jung) / 21;
  return CHO[cho] + JUNG[jung] + JONG[jong];
}

/** Storage 키로 안전한 문자(영문·숫자·밑줄, 공백, 일부 기호)만 남긴다 */
const SAFE_KEY_CHAR = /[\w\-.'() &$@=;:+,]/;

/**
 * pdf_path 에 그대로 들어가는 경로용 새니타이즈.
 * 로컬 다운로드 파일명용(sanitizeFileName, '_'로 치환)과는 별개다. (원본 주석)
 */
export function sanitizeForStoragePath(name: string | undefined | null): string {
  const s = String(name ?? "")
    // OS에서도 꺼리는 문자 — 안전을 위해 우선 제거
    .replace(/[\\/?#%:*"<>|]/g, "")
    // eslint-disable-next-line no-control-regex -- 제어문자 제거가 목적
    .replace(/[\x00-\x1f\x7f]/g, "");

  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += romanizeHangulSyllable(ch);
    } else if (SAFE_KEY_CHAR.test(ch)) {
      out += ch;
    }
    // 그 외 한글 자모·한자·이모지 등은 버린다(Storage가 거부하므로)
  }
  return out.trim();
}

/**
 * documents/{지사}/{연도}/{분야}/{manual|fault|photo}/({매뉴얼종류}/){제목}.pdf
 * 지사·분야·매뉴얼종류·제목은 로마자로 변환됨. 매뉴얼만 종류별 폴더가 한 단계
 * 더 있고, 고장 보고서는 분야 아래 바로 fault 폴더로 들어간다. (원본 주석)
 */
export function buildStoragePath(opts: {
  docType: string;
  branch?: string;
  field?: string;
  manualType?: string;
  title: string;
  year: number;
}): string {
  const safeBranch = sanitizeForStoragePath(opts.branch) || "unknown";
  const safeField = sanitizeForStoragePath(opts.field) || "unknown";
  const safeTitle = sanitizeForStoragePath(opts.title) || "document";

  const parts: (string | number)[] = [safeBranch, opts.year, safeField, opts.docType];
  if (opts.docType === "manual") {
    parts.push(sanitizeForStoragePath(opts.manualType) || "unknown");
  }
  parts.push(`${safeTitle}.pdf`);
  return parts.join("/");
}

/** 확장자 앞에 (n)을 끼워 넣는다: "제목.pdf" -> "제목(2).pdf" */
export function withSuffix(path: string, n: number): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return `${path}(${n})`;
  return `${path.slice(0, dot)}(${n})${path.slice(dot)}`;
}
