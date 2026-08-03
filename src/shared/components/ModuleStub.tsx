import { Card, Icon } from "./ui";

/**
 * 통합 스캐폴드 단계의 임시 화면.
 * 각 모듈 포팅이 끝나면 실제 화면으로 교체된다 (교체 시 이 컴포넌트 참조가 사라짐).
 */
export default function ModuleStub({
  title,
  from,
  note,
}: {
  title: string;
  /** 이식 원본 경로 (legacy/ 기준) */
  from: string;
  note?: string;
}) {
  return (
    <>
      <h1 className="text-display-lg text-on-surface pt-2">{title}</h1>
      <Card className="p-card-padding" lift={false}>
        <div className="flex items-start gap-3">
          <Icon name="construction" className="text-status-warning text-2xl" />
          <div>
            <p className="text-title-sm text-on-surface">포팅 예정 화면</p>
            <p className="text-sm text-on-surface-variant mt-1">
              이식 원본: <code className="font-mono-data">{from}</code>
            </p>
            {note && <p className="text-sm text-on-surface-variant mt-2">{note}</p>}
          </div>
        </div>
      </Card>
    </>
  );
}
