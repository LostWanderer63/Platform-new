const TONES: Record<string, string> = {
  ACTIVE: "bg-ok/15 text-ok",
  COMPLETED: "bg-ok/15 text-ok",
  PAUSED: "bg-warn/15 text-warn",
  PENDING: "bg-warn/15 text-warn",
  MAINTENANCE: "bg-accent2/15 text-accent2",
  DISABLED: "bg-mut/15 text-mut",
  SUSPENDED: "bg-bad/15 text-bad",
  SELF_EXCLUDED: "bg-bad/15 text-bad",
  FAILED: "bg-bad/15 text-bad",
  High: "bg-bad/15 text-bad",
  Med: "bg-warn/15 text-warn",
};

export function StatusChip({ value }: { value: string }) {
  return <span className={`chip ${TONES[value] ?? "bg-panel2 text-mut"}`}>{value}</span>;
}
