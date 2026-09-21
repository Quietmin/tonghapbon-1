import Link from "next/link";
import MaintenanceMatrix from "@/modules/overhaul/components/MaintenanceMatrix";

/**
 * 전체 현황 — 설비별 연도 축 매트릭스.
 *
 * "언제 어떤 장비를 점검했는지"를 한 장으로 본다. 중장기 보수계획 엑셀의 연도별
 * 등급표와 같은 모양이고, 오버홀 실적이 쌓이면 그만큼 과거 구간이 채워진다.
 * 회차와 무관하게 설비의 전 이력을 보는 화면이라 회차 띠를 붙이지 않는다
 * (app/overhaul/layout.tsx 참고).
 */
export default function OverhaulMatrixPage() {
  return (
    <>
      <div>
        <h1 className="text-display-lg text-on-surface pt-2">전체 현황</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          설비별로 어느 해에 무엇을 보수했는지 한 장으로 봅니다. 과거는 자료가 있는 첫 해부터
          전부, 앞으로는 점검주기로 계산한 예정 연도까지 보여줍니다. 표의 근거가 되는 설비 목록은{" "}
          <Link href="/overhaul/plan" className="text-primary font-semibold hover:underline">
            보수계획
          </Link>
          에서 중장기 관리계획 엑셀을 등록하면 채워집니다.
        </p>
      </div>
      <MaintenanceMatrix />
    </>
  );
}
