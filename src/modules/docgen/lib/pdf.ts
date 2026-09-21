/**
 * A4 미리보기 DOM → PDF.
 *
 * 원본(legacy Photo-Report)과 같은 방식이다: 화면에 실제 A4 크기(210mm)로 그린 뒤
 * html2canvas 로 래스터화해서 jsPDF 에 넣는다. 레이아웃 계산을 두 번(화면용/PDF용)
 * 하지 않으므로 "미리보기와 출력이 다르다"는 문제가 생기지 않는다.
 *
 * 라이브러리는 번들 크기가 크므로 호출 시점에 동적 import 한다
 * (문서 자동생성 화면에 들어오지 않은 사용자는 내려받지 않는다).
 */
const A4_WIDTH_MM = 210;

/**
 * html2canvas 는 캡처 시점에 아직 안 받아진 <img> 를 빈 칸으로 그린다.
 * 배너·공사 로고는 /public 에서 새로 받아 오므로, 미리보기를 띄우자마자 [PDF 출력]을
 * 누르면 머리 부분만 통째로 비어 나온다 — 그리기 전에 다 받아졌는지 확인한다.
 * 못 받은 이미지는 기다리지 않고 넘어간다(끊긴 이미지 하나로 출력이 막히면 안 된다).
 */
async function waitForImages(el: HTMLElement): Promise<void> {
  const pending = Array.from(el.querySelectorAll("img")).filter((img) => !img.complete);
  await Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
}

/** 페이지 하나를 캔버스로. 두 출력 경로(다운로드/보관함)가 같은 방식을 쓰도록 묶어 둔다. */
async function renderPage(
  html2canvas: typeof import("html2canvas").default,
  pageEl: HTMLElement,
): Promise<HTMLCanvasElement> {
  await waitForImages(pageEl);
  return html2canvas(pageEl, {
    // 2배로 그려야 인쇄 시 사진 위 글자가 뭉개지지 않는다
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });
}

export async function exportPagesToPdf(pageEls: HTMLElement[], fileName: string): Promise<void> {
  if (pageEls.length === 0) throw new Error("출력할 페이지가 없습니다.");

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  let pdf: import("jspdf").jsPDF | null = null;

  for (const pageEl of pageEls) {
    const canvas = await renderPage(html2canvas, pageEl);

    // 페이지 높이는 실제 렌더된 비율을 따른다 — 사진이 적은 마지막 페이지가
    // 억지로 297mm 로 늘어나 아래쪽이 비어 보이는 것을 막는다(원본과 동일).
    const heightMM = (canvas.height / canvas.width) * A4_WIDTH_MM;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    if (!pdf) {
      pdf = new jsPDF({ unit: "mm", format: [A4_WIDTH_MM, heightMM], orientation: "portrait" });
    } else {
      pdf.addPage([A4_WIDTH_MM, heightMM], "portrait");
    }
    pdf.addImage(imgData, "JPEG", 0, 0, A4_WIDTH_MM, heightMM);
  }

  pdf!.save(`${fileName || "문서"}.pdf`);
}

/** jsPDF 인스턴스를 파일로 내리지 않고 Blob 으로 받는다 (보관함 업로드용) */
export async function renderPagesToBlob(pageEls: HTMLElement[]): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  let pdf: import("jspdf").jsPDF | null = null;

  for (const pageEl of pageEls) {
    const canvas = await renderPage(html2canvas, pageEl);
    const heightMM = (canvas.height / canvas.width) * A4_WIDTH_MM;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    if (!pdf) {
      pdf = new jsPDF({ unit: "mm", format: [A4_WIDTH_MM, heightMM], orientation: "portrait" });
    } else {
      pdf.addPage([A4_WIDTH_MM, heightMM], "portrait");
    }
    pdf.addImage(imgData, "JPEG", 0, 0, A4_WIDTH_MM, heightMM);
  }

  return pdf!.output("blob");
}
