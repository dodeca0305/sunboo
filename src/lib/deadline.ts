function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function calculateEventDeadline(
  timingData: Record<string, unknown> | null,
  eventDate?: string,
): { label: string | null; date: string | null } {
  if (!eventDate) return { label: null, date: null };
  const daysFromEvent = timingData?.days_from_event as number | undefined;
  if (daysFromEvent === undefined) return { label: null, date: null };
  const base = new Date(`${eventDate}T00:00:00`);
  const deadline = new Date(base.getTime() + daysFromEvent * 86400000);
  return {
    label: `${deadline.getFullYear()}年${deadline.getMonth() + 1}月${deadline.getDate()}日`,
    date: toIsoDate(deadline),
  };
}

export function calculateEventNextMonthDeadline(
  timingData: Record<string, unknown> | null,
  eventDate?: string,
): { label: string | null; date: string | null } {
  if (!eventDate) return { label: null, date: null };
  const event = new Date(`${eventDate}T00:00:00`);
  if (Number.isNaN(event.getTime())) return { label: null, date: null };
  const day = (timingData?.day as number) ?? 10;
  const deadline = new Date(event.getFullYear(), event.getMonth() + 1, day);
  return {
    label: `${deadline.getFullYear()}年${deadline.getMonth() + 1}月${deadline.getDate()}日`,
    date: toIsoDate(deadline),
  };
}
