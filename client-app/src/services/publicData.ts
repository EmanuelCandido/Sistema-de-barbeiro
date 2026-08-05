import { collection, doc, documentId, getDoc, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { DateException, PublicAvailability, PublicSettings, Service } from "../types";

let servicesCache: Service[] | null = null;
let settingsCache: PublicSettings | null = null;
type CalendarDay = { availability: PublicAvailability; exception: DateException | null };
let calendarCache: { fromKey: string; toKey: string; loadedAt: number; days: Record<string, CalendarDay> } | null = null;
const calendarRequests = new Map<string, Promise<Record<string, CalendarDay>>>();
const calendarCacheTtlMs = 60_000;
const dateLookupTimeoutMs = 10_000;

export async function getPublicSettings(): Promise<PublicSettings> {
  if (settingsCache) return settingsCache;
  const snapshot = await getDoc(doc(db, "settings", "public"));
  if (!snapshot.exists()) throw new Error("Configurações públicas não encontradas.");
  settingsCache = snapshot.data() as PublicSettings;
  return settingsCache;
}

export async function getActiveServices(): Promise<Service[]> {
  if (servicesCache) return servicesCache;
  const snapshot = await getDocs(query(collection(db, "services"), where("active", "==", true), orderBy("sortOrder", "asc")));
  servicesCache = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Service));
  return servicesCache;
}

export async function getAvailabilityForDate(key: string): Promise<PublicAvailability> {
  const snapshot = await getDoc(doc(db, "publicAvailability", key));
  return snapshot.exists() ? normalizeAvailability(snapshot.data()) : { occupiedSlots: {} };
}

export async function getExceptionForDate(key: string): Promise<DateException | null> {
  const snapshot = await getDoc(doc(db, "exceptions", key));
  return snapshot.exists() ? snapshot.data() as DateException : null;
}

export async function getCalendarDayForDate(key: string): Promise<CalendarDay> {
  const cached = getCachedCalendarDay(key);
  if (cached) return cached;

  const lookup = Promise.all([
    getAvailabilityForDate(key),
    getExceptionForDate(key),
  ]).then(([availability, exception]) => ({ availability, exception }));
  const day = await withTimeout(lookup, dateLookupTimeoutMs);
  updateCachedCalendarAvailability(key, day.availability);
  return day;
}

export async function getCalendarDays(fromKey: string, toKey: string): Promise<Record<string, CalendarDay>> {
  if (
    calendarCache &&
    calendarCache.fromKey === fromKey &&
    calendarCache.toKey === toKey &&
    Date.now() - calendarCache.loadedAt < calendarCacheTtlMs
  ) return calendarCache.days;
  const requestKey = `${fromKey}:${toKey}`;
  const pendingRequest = calendarRequests.get(requestKey);
  if (pendingRequest) return pendingRequest;

  const range = [
    where(documentId(), ">=", fromKey),
    where(documentId(), "<=", toKey),
  ];
  const request = Promise.all([
    getDocs(query(collection(db, "publicAvailability"), ...range)),
    getDocs(query(collection(db, "exceptions"), ...range)),
  ]).then(([availabilitySnapshot, exceptionSnapshot]) => {
    const days: Record<string, CalendarDay> = {};
    availabilitySnapshot.docs.forEach(item => {
      days[item.id] = { availability: normalizeAvailability(item.data()), exception: null };
    });
    exceptionSnapshot.docs.forEach(item => {
      const current = days[item.id];
      days[item.id] = {
        availability: current?.availability ?? { occupiedSlots: {} },
        exception: item.data() as DateException,
      };
    });
    calendarCache = { fromKey, toKey, loadedAt: Date.now(), days };
    return days;
  }).finally(() => {
    if (calendarRequests.get(requestKey) === request) calendarRequests.delete(requestKey);
  });
  calendarRequests.set(requestKey, request);
  return request;
}

export function getCachedCalendarDay(key:string):CalendarDay|null {
  if(!calendarCache||Date.now()-calendarCache.loadedAt>=calendarCacheTtlMs||key<calendarCache.fromKey||key>calendarCache.toKey)return null;
  return calendarCache.days[key]??{availability:{occupiedSlots:{}},exception:null};
}

export function updateCachedCalendarAvailability(key:string,availability:PublicAvailability) {
  if(!calendarCache||key<calendarCache.fromKey||key>calendarCache.toKey)return;
  const current=calendarCache.days[key];
  calendarCache.days[key]={availability,exception:current?.exception??null};
}

function normalizeAvailability(data: Record<string, unknown>): PublicAvailability {
  const occupiedSlotKeys = Array.isArray(data.occupiedSlotKeys)
    ? data.occupiedSlotKeys.filter((value): value is string => typeof value === "string")
    : Object.entries(data.occupiedSlots && typeof data.occupiedSlots === "object" ? data.occupiedSlots : {})
      .filter(([, value]) => value === true)
      .map(([key]) => key);
  return {
    ...data,
    occupiedSlotKeys,
    occupiedSlots: Object.fromEntries(occupiedSlotKeys.map((key) => [key, true])),
  } as PublicAvailability;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("A consulta da data demorou além do esperado.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
