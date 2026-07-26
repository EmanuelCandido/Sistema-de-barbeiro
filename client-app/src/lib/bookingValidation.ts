import type { DateException, PublicSettings } from "../types";

const weekKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export class BookingInputError extends Error {}

export function buildValidatedSlot({
  key,
  startTime,
  settings,
  exception,
  durationMinutes,
  now = new Date(),
}: {
  key: string;
  startTime: string;
  settings: PublicSettings;
  exception?: DateException | null;
  durationMinutes: number;
  now?: Date;
}) {
  if (!datePattern.test(key) || !isRealDateKey(key)) throw new BookingInputError("Data inválida.");
  if (!timePattern.test(startTime)) throw new BookingInputError("Horário inválido.");
  if (settings.timezone !== "America/Recife") throw new BookingInputError("Configuração de agenda inválida.");

  const interval = settings.slotIntervalMinutes;
  const minimumNotice = settings.minimumNoticeMinutes;
  const advanceDays = settings.bookingAdvanceDays;
  if (!Number.isInteger(interval) || interval < 5 || interval > 120) throw new BookingInputError("Intervalo da agenda inválido.");
  if (!Number.isInteger(minimumNotice) || minimumNotice < 0 || minimumNotice > 10_080) throw new BookingInputError("Antecedência da agenda inválida.");
  if (!Number.isInteger(advanceDays) || advanceDays < 1 || advanceDays > 180) throw new BookingInputError("Janela da agenda inválida.");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
    throw new BookingInputError("Duração do serviço inválida.");
  }

  const today = dateKeyInTimezone(now, settings.timezone);
  if (key < today || key > addDaysToKey(today, advanceDays)) {
    throw new BookingInputError("A data está fora da janela disponível para agendamento.");
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + durationMinutes;
  if (endMinutes >= 24 * 60) throw new BookingInputError("O atendimento ultrapassa o fim do dia.");
  const endTime = minutesToTime(endMinutes);
  const periods = getPeriods(key, settings, exception);
  const fitsPeriod = periods.some((period) => {
    if (!timePattern.test(period.start) || !timePattern.test(period.end)) return false;
    const begin = timeToMinutes(period.start);
    const end = timeToMinutes(period.end);
    return startMinutes >= begin && endMinutes <= end && (startMinutes - begin) % interval === 0;
  });
  if (!fitsPeriod) throw new BookingInputError("Este horário não está disponível.");

  const startAt = localDateTime(key, startTime);
  const endAt = localDateTime(key, endTime);
  if (startAt.getTime() < now.getTime() + minimumNotice * 60_000) {
    throw new BookingInputError("Este horário não respeita a antecedência mínima.");
  }

  const count = Math.ceil(durationMinutes / interval);
  if (count < 1 || count > 8) {
    throw new BookingInputError("Este serviço ocupa intervalos demais para o agendamento online.");
  }
  const occupiedSlotKeys = Array.from(
    { length: count },
    (_, index) => minutesToTime(startMinutes + index * interval),
  );
  return { startAt, endAt, endTime, occupiedSlotKeys };
}

function getPeriods(key: string, settings: PublicSettings, exception?: DateException | null) {
  if (exception?.closed) return [];
  if (exception?.customPeriods) return exception.customPeriods;
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  return settings.weeklySchedule[weekKeys[weekday]] ?? [];
}

function localDateTime(key: string, time: string) {
  const value = new Date(`${key}T${time}:00-03:00`);
  if (Number.isNaN(value.getTime())) throw new BookingInputError("Data ou horário inválido.");
  return value;
}

function dateKeyInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToKey(key: string, amount: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isRealDateKey(key: string) {
  const date = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
