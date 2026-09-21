import Link from "next/link";
import { Icon } from "@/shared/components/ui";
import BulkUploadQueue from "@/modules/failure/components/BulkUploadQueue";

export const metadata = { title: "일괄 업로드 — 유지보수 마스터" };

export default function FailureBulkUploadPage() {
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
        <h1 className="text-display-lg text-on-surface">일괄 업로드</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          과거 "고장상보" PDF를 여러 개 올려 한 건씩 확인하고 등록합니다.
        </p>
      </section>

      <BulkUploadQueue />
    </>
  );
}
