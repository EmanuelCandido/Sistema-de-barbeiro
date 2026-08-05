import {
  collection,
  deleteField,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type DocumentData,
  type Unsubscribe,
  type UpdateData,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { addDays, dateKey } from "../lib/format";
import type { Booking, BookingStatus, FinancialSummary, PaymentMethod, PublicAvailability, Service } from "../types";

const legacyInactiveStatus = ["no", "show"].join("_");
const bookingRetentionDays = 180;
type SummaryValues = Omit<FinancialSummary, "updatedAt">;

function normalizeStatus(status: unknown, paymentMethod?: unknown): BookingStatus {
  if (status === "completed" && !["pix", "cash", "card"].includes(String(paymentMethod))) return "pending";
  return status === legacyInactiveStatus ? "cancelled" : status as BookingStatus;
}

function bookingFromData(id: string, data: Record<string, unknown>): Booking {
  return { id, ...data, status: normalizeStatus(data.status, data.paymentMethod) } as Booking;
}

function occupiedMap(data: Partial<PublicAvailability> | undefined): Record<string, boolean> {
  if (Array.isArray(data?.occupiedSlotKeys)) {
    return Object.fromEntries(data.occupiedSlotKeys.map(slot => [slot, true]));
  }
  return { ...(data?.occupiedSlots ?? {}) };
}

function availabilityMutation(occupied: Record<string, boolean>, lastMutationId: string) {
  return {
    occupiedSlotKeys: Object.keys(occupied).filter(slot => occupied[slot] === true).sort(),
    lastMutationId,
    updatedAt: serverTimestamp(),
  };
}

function weekQuery(weekStart: Date) {
  const from = dateKey(weekStart);
  const to = dateKey(addDays(weekStart, 7));
  return query(
    collection(db, "bookings"),
    where("dateKey", ">=", from),
    where("dateKey", "<", to),
    orderBy("dateKey"),
    orderBy("startTime"),
    limit(200),
  );
}

export async function getWeekBookings(weekStart: Date) {
  const snapshot = await getDocs(weekQuery(weekStart));
  return snapshot.docs.map(item => bookingFromData(item.id, item.data()));
}

export function subscribeWeekBookings(
  weekStart: Date,
  onData: (bookings: Booking[]) => void,
  onError?: (reason: Error) => void,
): Unsubscribe {
  return onSnapshot(
    weekQuery(weekStart),
    snapshot => onData(snapshot.docs.map(item => bookingFromData(item.id, item.data()))),
    reason => onError?.(reason),
  );
}

export async function getMonthBookings(month: string) {
  const start = `${month}-01`;
  const endDate = new Date(`${start}T12:00:00-03:00`);
  endDate.setMonth(endDate.getMonth() + 1);
  const end = dateKey(endDate);
  const snapshot = await getDocs(query(
    collection(db, "bookings"),
    where("dateKey", ">=", start),
    where("dateKey", "<", end),
    orderBy("dateKey"),
  ));
  return snapshot.docs.map(item => bookingFromData(item.id, item.data()));
}

export async function purgeExpiredBookings() {
  const snapshot = await getDocs(query(
    collection(db, "bookings"),
    where("expiresAt", "<=", Timestamp.now()),
    limit(100),
  ));
  if (snapshot.empty) return 0;
  const batch = writeBatch(db);
  snapshot.docs.forEach(item => batch.delete(item.ref));
  await batch.commit();
  return snapshot.size;
}

function zeroSummary(): SummaryValues {
  return {
    completedRevenueCents: 0,
    expectedRevenueCents: 0,
    completedAppointments: 0,
    confirmedAppointments: 0,
    cancelledAppointments: 0,
    pixRevenueCents: 0,
    cashRevenueCents: 0,
    cardRevenueCents: 0,
  };
}

function contribution(
  status: BookingStatus,
  paymentMethod: PaymentMethod | undefined,
  priceCents: number,
): SummaryValues {
  const values = zeroSummary();
  if (status === "completed") {
    values.completedRevenueCents = priceCents;
    values.completedAppointments = 1;
    if (paymentMethod === "pix") values.pixRevenueCents = priceCents;
    if (paymentMethod === "cash") values.cashRevenueCents = priceCents;
    if (paymentMethod === "card") values.cardRevenueCents = priceCents;
  }
  if (status === "confirmed") {
    values.expectedRevenueCents = priceCents;
    values.confirmedAppointments = 1;
  }
  if (status === "cancelled") values.cancelledAppointments = 1;
  return values;
}

function deltaBetween(previous: SummaryValues, next: SummaryValues): SummaryValues {
  return {
    completedRevenueCents: next.completedRevenueCents - previous.completedRevenueCents,
    expectedRevenueCents: next.expectedRevenueCents - previous.expectedRevenueCents,
    completedAppointments: next.completedAppointments - previous.completedAppointments,
    confirmedAppointments: next.confirmedAppointments - previous.confirmedAppointments,
    cancelledAppointments: next.cancelledAppointments - previous.cancelledAppointments,
    pixRevenueCents: next.pixRevenueCents - previous.pixRevenueCents,
    cashRevenueCents: next.cashRevenueCents - previous.cashRevenueCents,
    cardRevenueCents: next.cardRevenueCents - previous.cardRevenueCents,
  };
}

function summaryMutation(values: SummaryValues) {
  return {
    completedRevenueCents: increment(values.completedRevenueCents),
    expectedRevenueCents: increment(values.expectedRevenueCents),
    completedAppointments: increment(values.completedAppointments),
    confirmedAppointments: increment(values.confirmedAppointments),
    cancelledAppointments: increment(values.cancelledAppointments),
    pixRevenueCents: increment(values.pixRevenueCents),
    cashRevenueCents: increment(values.cashRevenueCents),
    cardRevenueCents: increment(values.cardRevenueCents),
    noShowAppointments: deleteField(),
    updatedAt: serverTimestamp(),
  };
}

export async function changeBookingStatus(booking: Booking, newStatus: BookingStatus, paymentMethod?: PaymentMethod) {
  await runTransaction(db, async transaction => {
    const bookingRef = doc(db, "bookings", booking.id);
    const current = await transaction.get(bookingRef);
    if (!current.exists()) throw new Error("Agendamento não encontrado.");
    const data = current.data() as Booking;
    const summaryRef = doc(db, "financialSummaries", data.dateKey.slice(0, 7));
    const lockRef = doc(db, "customerBookingLocks", data.createdByUid);
    const availabilityRef = doc(db, "publicAvailability", data.dateKey);
    const availability = await transaction.get(availabilityRef);
    const occupied = occupiedMap(availability.exists() ? availability.data() : undefined);
    const currentStatus = normalizeStatus(data.status, data.paymentMethod);
    const wasBlocking = currentStatus !== "cancelled";
    const willBlock = newStatus !== "cancelled";

    if (!wasBlocking && willBlock) {
      if (data.occupiedSlotKeys.some(slot => occupied[slot])) {
        throw new Error("O horário já foi ocupado por outro atendimento. Reagende antes de reativar.");
      }
      data.occupiedSlotKeys.forEach(slot => { occupied[slot] = true; });
      transaction.set(availabilityRef, availabilityMutation(occupied, `admin_${booking.id}`), { merge: false });
    } else if (wasBlocking && !willBlock) {
      data.occupiedSlotKeys.forEach(slot => { delete occupied[slot]; });
      transaction.set(availabilityRef, availabilityMutation(occupied, `admin_${booking.id}`), { merge: false });
    }

    const nextPayment = paymentMethod ?? data.paymentMethod;
    const summaryDelta = deltaBetween(
      contribution(currentStatus, data.paymentMethod, data.priceCentsSnapshot),
      contribution(newStatus, nextPayment, data.priceCentsSnapshot),
    );
    transaction.update(bookingRef, {
      status: newStatus,
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(["cancelled", "completed"].includes(newStatus) ? { expiresAt: retentionExpiry() } : { expiresAt: deleteField() }),
      updatedAt: serverTimestamp(),
    });
    if (newStatus === "cancelled" || newStatus === "completed") {
      transaction.delete(lockRef);
    } else if (!wasBlocking) {
      transaction.set(lockRef, lockMutation(booking.id), { merge: false });
    }
    transaction.set(summaryRef, summaryMutation(summaryDelta), { merge: true });
  });
}

export async function completeBooking(
  booking: Booking,
  paymentMethod: PaymentMethod,
  services: Service[],
  interval: number,
) {
  const service = combinedServices(services);

  await runTransaction(db, async transaction => {
    const bookingRef = doc(db, "bookings", booking.id);
    const currentSnap = await transaction.get(bookingRef);
    if (!currentSnap.exists()) throw new Error("Agendamento não encontrado.");
    const current = { id: booking.id, ...currentSnap.data() } as Booking;
    const lockRef = doc(db, "customerBookingLocks", current.createdByUid);
    const startMinutes = Number(current.startTime.slice(0, 2)) * 60 + Number(current.startTime.slice(3));
    const endMinutes = startMinutes + service.durationMinutesSnapshot;
    if (endMinutes >= 24 * 60) throw new Error("O atendimento ultrapassa o fim do dia.");
    const endTime = toTime(endMinutes);
    const occupiedSlotKeys = occupiedSlotsForService(startMinutes, service.durationMinutesSnapshot, interval);
    const availabilityRef = doc(db, "publicAvailability", current.dateKey);
    const availabilitySnap = await transaction.get(availabilityRef);
    const currentStatus = normalizeStatus(current.status, current.paymentMethod);
    const occupied = occupiedMap(availabilitySnap.exists() ? availabilitySnap.data() : undefined);
    if (currentStatus !== "cancelled") {
      current.occupiedSlotKeys.forEach(slot => { delete occupied[slot]; });
    }
    if (occupiedSlotKeys.some(slot => occupied[slot])) {
      throw new Error("O tempo dos serviços realizados ocupa outro atendimento.");
    }
    occupiedSlotKeys.forEach(slot => { occupied[slot] = true; });

    const summaryRef = doc(db, "financialSummaries", current.dateKey.slice(0, 7));
    const summaryDelta = deltaBetween(
      contribution(currentStatus, current.paymentMethod, current.priceCentsSnapshot),
      contribution("completed", paymentMethod, service.priceCentsSnapshot),
    );

    const endAt = Timestamp.fromDate(new Date(`${current.dateKey}T${endTime}:00-03:00`));
    transaction.update(bookingRef, {
      ...service,
      serviceIds: deleteField(),
      endTime,
      endAt,
      expiresAt: retentionExpiry(),
      occupiedSlotKeys,
      status: "completed",
      paymentMethod,
      updatedAt: serverTimestamp(),
    });
    transaction.delete(lockRef);
    transaction.set(availabilityRef, availabilityMutation(occupied, `admin_${booking.id}`), { merge: false });
    transaction.set(summaryRef, summaryMutation(summaryDelta), { merge: true });
  });
}

function combinedServices(services: Service[]) {
  if (!services.length) throw new Error("Selecione pelo menos um serviço.");
  const serviceId = services.map(service => service.id).join("+");
  const serviceNameSnapshot = services.map(service => service.name.trim()).join(" + ");
  const durationMinutesSnapshot = services.reduce((total, service) => total + service.durationMinutes, 0);
  const priceCentsSnapshot = services.reduce((total, service) => total + service.priceCents, 0);
  if (
    serviceId.length > 128 ||
    serviceNameSnapshot.length > 320 ||
    !Number.isInteger(durationMinutesSnapshot) ||
    durationMinutesSnapshot < 5 ||
    durationMinutesSnapshot > 480 ||
    !Number.isInteger(priceCentsSnapshot) ||
    priceCentsSnapshot < 0 ||
    priceCentsSnapshot > 10_000_000
  ) {
    throw new Error("A combinação de serviços ultrapassa os limites permitidos.");
  }
  return { serviceId, serviceNameSnapshot, durationMinutesSnapshot, priceCentsSnapshot };
}

function toTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export async function rescheduleBooking(
  booking: Booking,
  newDate: string,
  newStart: string,
  newEnd: string,
  newSlots: string[],
  services: Service[],
) {
  const service = combinedServices(services);
  await runTransaction(db, async transaction => {
    const bookingRef = doc(db, "bookings", booking.id);
    const currentSnap = await transaction.get(bookingRef);
    if (!currentSnap.exists()) throw new Error("Agendamento não encontrado.");

    const current = { id: booking.id, ...currentSnap.data() } as Booking;
    const lockRef = doc(db, "customerBookingLocks", current.createdByUid);
    const oldAvailabilityRef = doc(db, "publicAvailability", current.dateKey);
    const newAvailabilityRef = doc(db, "publicAvailability", newDate);
    const oldAvailability = await transaction.get(oldAvailabilityRef);
    const newAvailability = current.dateKey === newDate
      ? oldAvailability
      : await transaction.get(newAvailabilityRef);
    const currentStatus = normalizeStatus(current.status, current.paymentMethod);
    const sourceSlots = occupiedMap(oldAvailability.exists() ? oldAvailability.data() : undefined);
    if (currentStatus !== "cancelled") {
      current.occupiedSlotKeys.forEach(slot => { delete sourceSlots[slot]; });
    }
    const targetSlots = newDate === current.dateKey
      ? sourceSlots
      : occupiedMap(newAvailability.exists() ? newAvailability.data() : undefined);
    if (newSlots.some(slot => targetSlots[slot])) throw new Error("O novo horário já está ocupado.");
    newSlots.forEach(slot => { targetSlots[slot] = true; });

    const newEndAt = Timestamp.fromDate(new Date(`${newDate}T${newEnd}:00-03:00`));
    const data: UpdateData<DocumentData> = {
      ...service,
      serviceIds: deleteField(),
      dateKey: newDate,
      startTime: newStart,
      endTime: newEnd,
      startAt: Timestamp.fromDate(new Date(`${newDate}T${newStart}:00-03:00`)),
      endAt: newEndAt,
      expiresAt: deleteField(),
      occupiedSlotKeys: newSlots,
      status: "pending" as BookingStatus,
      paymentMethod: deleteField(),
      updatedAt: serverTimestamp(),
    };
    const summaryDelta = deltaBetween(
      contribution(currentStatus, current.paymentMethod, current.priceCentsSnapshot),
      contribution("pending", undefined, service.priceCentsSnapshot),
    );
    const summaryRef = doc(db, "financialSummaries", current.dateKey.slice(0, 7));

    transaction.update(bookingRef, data);
    transaction.set(lockRef, lockMutation(booking.id), { merge: false });
    if (newDate === current.dateKey) {
      transaction.set(oldAvailabilityRef, availabilityMutation(targetSlots, `admin_${booking.id}`), { merge: false });
    } else {
      transaction.set(oldAvailabilityRef, availabilityMutation(sourceSlots, `admin_${booking.id}`), { merge: false });
      transaction.set(newAvailabilityRef, availabilityMutation(targetSlots, `admin_${booking.id}`), { merge: false });
    }
    transaction.set(summaryRef, summaryMutation(summaryDelta), { merge: true });
  });
}

export async function editBookingDetails(
  booking: Booking,
  clientName: string,
  clientPhone: string,
  clientNote: string,
  services: Service[],
  interval: number,
) {
  const service = combinedServices(services);

  await runTransaction(db, async transaction => {
    const bookingRef = doc(db, "bookings", booking.id);
    const currentSnap = await transaction.get(bookingRef);
    if (!currentSnap.exists()) throw new Error("Agendamento não encontrado.");
    const current = { id: booking.id, ...currentSnap.data() } as Booking;
    const lockRef = doc(db, "customerBookingLocks", current.createdByUid);
    const startMinutes = Number(current.startTime.slice(0, 2)) * 60 + Number(current.startTime.slice(3));
    const endMinutes = startMinutes + service.durationMinutesSnapshot;
    if (endMinutes >= 24 * 60) throw new Error("O atendimento ultrapassa o fim do dia.");
    const occupiedSlotKeys = occupiedSlotsForService(startMinutes, service.durationMinutesSnapshot, interval);
    const endTime = toTime(endMinutes);
    const availabilityRef = doc(db, "publicAvailability", current.dateKey);
    const availabilitySnap = await transaction.get(availabilityRef);
    const occupied = occupiedMap(availabilitySnap.exists() ? availabilitySnap.data() : undefined);
    const currentStatus = normalizeStatus(current.status, current.paymentMethod);
    const blocking = currentStatus !== "cancelled";
    if (blocking) {
      current.occupiedSlotKeys.forEach(slot => { delete occupied[slot]; });
    }
    if (blocking && occupiedSlotKeys.some(slot => occupied[slot])) {
      throw new Error("O novo tempo de atendimento ocupa um horário já reservado.");
    }
    if (blocking) {
      occupiedSlotKeys.forEach(slot => { occupied[slot] = true; });
      transaction.set(availabilityRef, availabilityMutation(occupied, `admin_${booking.id}`), { merge: false });
    }

    const summaryDelta = deltaBetween(
      contribution(currentStatus, current.paymentMethod, current.priceCentsSnapshot),
      contribution(currentStatus, current.paymentMethod, service.priceCentsSnapshot),
    );
    const summaryRef = doc(db, "financialSummaries", current.dateKey.slice(0, 7));
    const endAt = Timestamp.fromDate(new Date(`${current.dateKey}T${endTime}:00-03:00`));
    transaction.update(bookingRef, {
      clientName: clientName.trim(),
      clientPhone: clientPhone.replace(/\D/g, ""),
      clientNote: clientNote.trim(),
      ...service,
      serviceIds: deleteField(),
      endTime,
      endAt,
      occupiedSlotKeys,
      updatedAt: serverTimestamp(),
    });
    if (["pending", "confirmed"].includes(currentStatus)) {
      transaction.set(lockRef, lockMutation(booking.id), { merge: false });
    }
    transaction.set(summaryRef, summaryMutation(summaryDelta), { merge: true });
  });
}

function occupiedSlotsForService(startMinutes: number, durationMinutes: number, interval: number) {
  if (!Number.isInteger(interval) || interval < 5 || interval > 120) {
    throw new Error("O intervalo configurado para a agenda é inválido.");
  }
  const count = Math.ceil(durationMinutes / interval);
  if (count < 1 || count > 8) {
    throw new Error("A duração selecionada ocupa intervalos demais para este agendamento.");
  }
  return Array.from({ length: count }, (_, index) => toTime(startMinutes + index * interval));
}

function retentionExpiry() {
  return Timestamp.fromMillis(Date.now() + bookingRetentionDays * 24 * 60 * 60 * 1000);
}

function lockMutation(bookingId: string) {
  return { bookingId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}

export async function rebuildMonthSummary(month: string) {
  const bookings = await getMonthBookings(month);
  const summary = zeroSummary();
  for (const item of bookings) {
    const itemContribution = contribution(item.status, item.paymentMethod, item.priceCentsSnapshot);
    (Object.keys(summary) as Array<keyof SummaryValues>).forEach(key => {
      summary[key] += itemContribution[key];
    });
  }
  await setDoc(doc(db, "financialSummaries", month), { ...summary, updatedAt: serverTimestamp() });
  return summary;
}
