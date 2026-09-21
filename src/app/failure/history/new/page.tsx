import Link from "next/link";
import { Icon } from "@/shared/components/ui";
import FailureHistoryForm from "@/modules/failure/components/FailureHistoryForm";

export const metadata = { title: "수기 등록 — 유지보수 마스터" };

export default function FailureHistoryNewPage() {
  return (
    <>
      <section className="pt-2">
        <Link
          href="/failure"
          className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface mb-2"
        >
          <Icon name="arrow_back" className="text-base" />
          고장관리 홈
        </Link>
        <h1 className="text-display-lg text-on-surface">수기 등록</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          PDF 없이 발생일시·설비명·상황 등 항목을 직접 입력해 고장이력을 등록합니다.
        </p>
      </section>

      <FailureHistoryForm />
    </>
  );
}
