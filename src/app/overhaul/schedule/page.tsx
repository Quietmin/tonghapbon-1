import { redirect } from "next/navigation";

/** 옛 주소 — 공정표는 작업·공정의 하위 탭(/overhaul/tasks/schedule)으로 합쳤다 */
export default function OverhaulScheduleRedirect() {
  redirect("/overhaul/tasks/schedule");
}
