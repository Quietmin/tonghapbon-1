import { notFound } from "next/navigation";
import FailureHistoryForm, { type FormState } from "@/components/FailureHistoryForm";
import { getAttachmentsByFailureId, getFailureHistoryById, type FailureHistoryRow } from "@/lib/db";

export const dynamic = "force-dynamic";

function toFormState(row: FailureHistoryRow): FormState {
  return {
    title: row.title ?? "",
    failureField: row.failure_field ?? "",
    status: row.status ?? "조치중",
    occurredAt: row.occurred_at ?? "",
    branch: row.branch ?? "",
    equipmentName: row.equipment_name ?? "",
    deviceName: row.device_name ?? "",
    aptCount: row.apt_count ?? "",
    buildingCount: row.building_count ?? "",
    interruptionDuration: row.interruption_duration ?? "",
    interruptionPeriod: row.interruption_period ?? "",
    causeManagerRaw: row.cause_manager_raw ?? "",
    causeOwnerRaw: row.cause_owner_raw ?? "",
    situation: row.situation ?? "",
    alarmStatus: row.alarm_status ?? "",
    cause4m1e: row.cause_4m1e ?? "",
    impactHeatLoss: row.impact_heat_loss ?? "",
    impactDuration: row.impact_duration ?? "",
    emergencyAction: row.emergency_action ?? "",
    recoveredAt: row.recovered_at ?? "",
    recoveryDetail: row.recovery_detail ?? "",
    recurrencePrevention: row.recurrence_prevention ?? "",
  };
}

export default async function EditHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const failure = getFailureHistoryById(Number(id));

  if (!failure) {
    notFound();
  }

  const attachments = getAttachmentsByFailureId(failure.id).map((a) => ({ id: a.id, fileName: a.file_name }));

  return (
    <FailureHistoryForm
      mode="edit"
      failureId={failure.id}
      headerTitle="고장이력 수정"
      initialValues={toFormState(failure)}
      initialAttachments={attachments}
    />
  );
}
