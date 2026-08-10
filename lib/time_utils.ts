import { format, parseISO, addDays, isBefore, isSameDay, isAfter, startOfDay } from 'date-fns';

export function getTimezone(): string {
  return process.env.NEXT_PUBLIC_APP_TIMEZONE || 'Asia/Jakarta';
}

export function nowLocal(): Date {
  return new Date();
}

export function nowLabel(): string {
  const tz = getTimezone();
  const now = nowLocal();
  const formattedDate = format(now, "EEEE, yyyy-MM-dd HH:mm");
  return `${formattedDate} (${tz})`;
}

export function parseDueDate(text: string | null | undefined): string | null {
  if (!text || !text.trim()) return null;
  try {
    const dt = new Date(text);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  } catch {
    return null;
  }
}

export function humanizeDue(dueIso: string | null | undefined): string | null {
  if (!dueIso) return null;
  
  try {
    const due = parseISO(dueIso);
    if (isNaN(due.getTime())) return dueIso;

    const now = nowLocal();
    const today = startOfDay(now);
    const dueDay = startOfDay(due);

    const hasTime = !(due.getHours() === 0 && due.getMinutes() === 0);
    const timePart = hasTime ? ` ${format(due, 'HH:mm')}` : '';

    if (isBefore(dueDay, today)) {
      return `Overdue (${format(due, 'MMM dd')}${timePart})`;
    }
    if (isSameDay(dueDay, today)) {
      return `Today${timePart}`;
    }
    if (isSameDay(dueDay, addDays(today, 1))) {
      return `Tomorrow${timePart}`;
    }
    if (isBefore(dueDay, addDays(today, 7))) {
      return format(due, 'EEEE') + timePart;
    }
    return format(due, 'MMM dd') + timePart;
  } catch {
    return dueIso;
  }
}
