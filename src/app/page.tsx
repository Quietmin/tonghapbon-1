import HomeByDepartment from "@/modules/home/components/HomeByDepartment";

/**
 * 첫 화면 — 폰과 PC가 같은 화면이다. 내 부서에 따라 운영부 / 유지보수(계전부·기계부·공무부)
 * 화면이 갈리고, 부서를 아직 안 골랐으면 설비관리 대시보드가 나온다(HomeByDepartment).
 *
 * 예전 폰 첫 화면은 챕터 카드 목록이었지만, 챕터 이동은 하단 탭으로 언제든 할 수 있어 PC와
 * 같은 현황 화면을 폰에서도 바로 보이게 했다.
 */
export default async function HomePage() {
  return <HomeByDepartment />;
}
