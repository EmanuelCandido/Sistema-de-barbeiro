import type { DateException, Period, PublicSettings } from "../types";
import { dateKey } from "./format";

const WEEK_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function getPeriods(date: Date, settings: PublicSettings, exception?: DateException | null): Period[] {
  if (exception?.closed) return [];
  if (exception?.customPeriods) return exception.customPeriods;
  return settings.weeklySchedule[WEEK_KEYS[date.getDay()]] ?? [];
}

export function buildAvailableTimes(
  date: Date,
  settings: PublicSettings,
  duration: number,
  occupied: Record<string, boolean>,
  exception?: DateException | null,
) {
  const times: string[] = [];
  const key = dateKey(date);
  const minimum = Date.now() + settings.minimumNoticeMinutes * 60_000;
  for (const period of getPeriods(date, settings, exception)) {
    const begin = timeToMinutes(period.start);
    const end = timeToMinutes(period.end);
    for (let cursor = begin; cursor + duration <= end; cursor += settings.slotIntervalMinutes) {
      const time = minutesToTime(cursor);
      const slots = Array.from(
        { length: Math.ceil(duration / settings.slotIntervalMinutes) },
        (_, index) => minutesToTime(cursor + index * settings.slotIntervalMinutes),
      );
      const timestamp = new Date(`${key}T${time}:00-03:00`).getTime();
      if (timestamp >= minimum && slots.every(slot => !occupied[slot])) times.push(time);
    }
  }
  return times;
}
