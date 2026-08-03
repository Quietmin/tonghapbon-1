import { Suspense } from "react";
import PerformanceEntry from "@/modules/overhaul/components/PerformanceEntry";

export default function OverhaulEntryPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>}>
      <PerformanceEntry />
    </Suspense>
  );
}
