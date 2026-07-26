import type { DateException, Period, PublicSettings } from "../types";

const WEEK_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function addDays(base: Date, amount: number): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + amount);
  return date;
}

export function getPeriods(date: Date, settings: PublicSettings, exception?: DateException | null): Period[] {
  if (exception?.closed) return [];
  if (exception?.customPeriods) return exception.customPeriods;
  return settings.weeklySchedule[WEEK_KEYS[date.getDay()]] ?? [];
}

export function slotsForRange(startTime: string, duration: number, interval: number): string[] {
  const start = timeToMinutes(startTime);
  const count = Math.ceil(duration / interval);
  return Array.from({ length: count }, (_, index) => minutesToTime(start + index * interval));
}

export function buildAvailableTimes(
  date: Date,
  settings: PublicSettings,
  duration: number,
  occupied: Record<string, boolean>,
  exception?: DateException | null,
): string[] {
  const interval = settings.slotIntervalMinutes;
  const minimum = Date.now() + settings.minimumNoticeMinutes * 60_000;
  const key = dateKey(date);
  const times: string[] = [];
  for (const period of getPeriods(date, settings, exception)) {
    const begin = timeToMinutes(period.start);
    const end = timeToMinutes(period.end);
    for (let cursor = begin; cursor + duration <= end; cursor += interval) {
      const time = minutesToTime(cursor);
      const timestamp = new Date(`${key}T${time}:00-03:00`).getTime();
      const required = slotsForRange(time, duration, interval);
      if (timestamp >= minimum && required.every((slot) => !occupied[slot])) times.push(time);
    }
  }
  return times;
}

export function formatDateLong(key: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${key}T12:00:00Z`));
}

export const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
