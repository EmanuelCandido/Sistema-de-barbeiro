import { FirebaseError } from "firebase/app";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { BookingInputError, buildValidatedSlot } from "../lib/bookingValidation";
import type {
  ClientDetails,
  CustomerBooking,
  DateException,
  PublicAvailability,
  PublicSettings,
  Service,
} from "../types";

const activeBookingKey = "activeBookingId";
const activeStatuses = new Set(["pending", "confirmed"]);

export class SlotUnavailableError extends Error {}
export class BookingAccessError extends Error {}

type CreateBookingResult = {
  bookingId: string;
  endTime: string;
  serviceName: string;
  durationMinutes: number;
  priceCents: number;
};

export async function createBooking(
  services: Service[],
  key: string,
  startTime: string,
  client: ClientDetails,
) {
  const uid = requireUid();
  const cleanClient = validateClientDetails(client);
  const requestedServiceIds = validateRequestedServices(services);
  const bookingRef = doc(collection(db, "bookings"));
  const serviceRefs = requestedServiceIds.map((serviceId) => doc(db, "services", serviceId));
  const settingsRef = doc(db, "settings", "public");
  const exceptionRef = doc(db, "exceptions", key);
  const availabilityRef = doc(db, "publicAvailability", key);

  try {
    const result = await runTransaction(db, async (transaction): Promise<CreateBookingResult> => {
      const [settingsSnapshot, exceptionSnapshot, availabilitySnapshot, ...serviceSnapshots] = await Promise.all([
        transaction.get(settingsRef),
        transaction.get(exceptionRef),
        transaction.get(availabilityRef),
        ...serviceRefs.map((serviceRef) => transaction.get(serviceRef)),
      ]);
      if (serviceSnapshots.some((snapshot) => !snapshot.exists() || snapshot.data().active !== true)) {
        throw new BookingInputError("Este serviço não está mais disponível.");
      }
      if (!settingsSnapshot.exists()) throw new BookingInputError("Configuração da agenda indisponível.");

      const currentServices = serviceSnapshots.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as Service));
      const service = combinedServices(currentServices);
      const slot = buildValidatedSlot({
        key,
        startTime,
        settings: settingsSnapshot.data() as PublicSettings,
        exception: exceptionSnapshot.exists() ? exceptionSnapshot.data() as DateException : null,
        durationMinutes: service.durationMinutesSnapshot,
      });
      const occupiedSlots = availabilitySnapshot.exists()
        ? availabilityMap(availabilitySnapshot.data() as Partial<PublicAvailability>)
        : {};
      if (slot.occupiedSlotKeys.some((slotKey) => occupiedSlots[slotKey] === true)) {
        throw new SlotUnavailableError("Esse horário acabou de ser reservado.");
      }
      slot.occupiedSlotKeys.forEach((slotKey) => { occupiedSlots[slotKey] = true; });

      transaction.set(bookingRef, {
        dateKey: key,
        startTime,
        endTime: slot.endTime,
        startAt: Timestamp.fromDate(slot.startAt),
        endAt: Timestamp.fromDate(slot.endAt),
        occupiedSlotKeys: slot.occupiedSlotKeys,
        ...service,
        clientName: cleanClient.name,
        clientPhone: cleanClient.phone,
        ...(cleanClient.note ? { clientNote: cleanClient.note } : {}),
        status: "pending",
        lastCustomerMutation: "create",
        createdByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(availabilityRef, availabilityMutation(occupiedSlots, bookingRef.id, "create"));
      return {
        bookingId: bookingRef.id,
        endTime: slot.endTime,
        serviceName: service.serviceNameSnapshot,
        durationMinutes: service.durationMinutesSnapshot,
        priceCents: service.priceCentsSnapshot,
      };
    });
    rememberBookingAccess(result.bookingId);
    return result;
  } catch (reason) {
    throw bookingError(reason);
  }
}

export async function rescheduleCustomerBooking(
  bookingId: string,
  key: string,
  startTime: string,
  services?: Service[],
) {
  const uid = requireUid();
  if (!validBookingId(bookingId)) throw new BookingInputError("Agendamento inválido.");
  const requestedServiceIds = services ? validateRequestedServices(services) : [];
  const bookingRef = doc(db, "bookings", bookingId);
  const settingsRef = doc(db, "settings", "public");
  const exceptionRef = doc(db, "exceptions", key);
  const serviceRefs = requestedServiceIds.map((serviceId) => doc(db, "services", serviceId));

  try {
    const result = await runTransaction(db, async (transaction) => {
      const [bookingSnapshot, settingsSnapshot, exceptionSnapshot, ...serviceSnapshots] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(settingsRef),
        transaction.get(exceptionRef),
        ...serviceRefs.map((serviceRef) => transaction.get(serviceRef)),
      ]);
      if (!bookingSnapshot.exists()) throw new BookingAccessError("Agendamento não encontrado.");
      const current = bookingFromSnapshot(bookingSnapshot);
      assertManageableBooking(current, uid);
      if (!settingsSnapshot.exists()) throw new BookingInputError("Configuração da agenda indisponível.");
      if (serviceSnapshots.some((snapshot) => !snapshot.exists() || snapshot.data().active !== true)) {
        throw new BookingInputError("Um dos serviços selecionados não está mais disponível.");
      }
      const service = serviceSnapshots.length
        ? combinedServices(serviceSnapshots.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as Service)))
        : null;

      const slot = buildValidatedSlot({
        key,
        startTime,
        settings: settingsSnapshot.data() as PublicSettings,
        exception: exceptionSnapshot.exists() ? exceptionSnapshot.data() as DateException : null,
        durationMinutes: service?.durationMinutesSnapshot ?? current.durationMinutesSnapshot,
      });
      if (current.dateKey === key && current.startTime === startTime && !service) {
        return {
          bookingId,
          dateKey: current.dateKey,
          startTime: current.startTime,
          endTime: current.endTime,
          startAtMillis: current.startAt.toMillis(),
          occupiedSlotKeys: current.occupiedSlotKeys,
          status: "pending" as const,
          service: null,
        };
      }

      const oldAvailabilityRef = doc(db, "publicAvailability", current.dateKey);
      const newAvailabilityRef = doc(db, "publicAvailability", key);
      const oldAvailabilitySnapshot = await transaction.get(oldAvailabilityRef);
      const newAvailabilitySnapshot = current.dateKey === key
        ? oldAvailabilitySnapshot
        : await transaction.get(newAvailabilityRef);
      if (!oldAvailabilitySnapshot.exists()) throw inconsistentAvailabilityError();

      const sourceSlots = availabilityMap(oldAvailabilitySnapshot.data() as Partial<PublicAvailability>);
      if (current.occupiedSlotKeys.some((slotKey) => sourceSlots[slotKey] !== true)) {
        throw inconsistentAvailabilityError();
      }
      current.occupiedSlotKeys.forEach((slotKey) => { delete sourceSlots[slotKey]; });
      const targetSlots = current.dateKey === key
        ? sourceSlots
        : newAvailabilitySnapshot.exists()
          ? availabilityMap(newAvailabilitySnapshot.data() as Partial<PublicAvailability>)
          : {};
      if (slot.occupiedSlotKeys.some((slotKey) => targetSlots[slotKey] === true)) {
        throw new SlotUnavailableError("O novo horário acabou de ser reservado.");
      }
      slot.occupiedSlotKeys.forEach((slotKey) => { targetSlots[slotKey] = true; });

      transaction.update(bookingRef, {
        ...(service ?? {}),
        dateKey: key,
        startTime,
        endTime: slot.endTime,
        startAt: Timestamp.fromDate(slot.startAt),
        endAt: Timestamp.fromDate(slot.endAt),
        occupiedSlotKeys: slot.occupiedSlotKeys,
        status: "pending",
        lastCustomerMutation: "reschedule",
        paymentMethod: deleteField(),
        updatedAt: serverTimestamp(),
      });
      if (current.dateKey === key) {
        transaction.set(oldAvailabilityRef, availabilityMutation(targetSlots, bookingId, "reschedule-same"));
      } else {
        transaction.set(oldAvailabilityRef, availabilityMutation(sourceSlots, bookingId, "reschedule-source"));
        transaction.set(newAvailabilityRef, availabilityMutation(targetSlots, bookingId, "reschedule-target"));
      }
      return {
        bookingId,
        dateKey: key,
        startTime,
        endTime: slot.endTime,
        startAtMillis: slot.startAt.getTime(),
        occupiedSlotKeys: slot.occupiedSlotKeys,
        status: "pending" as const,
        service,
      };
    });
    rememberBookingAccess(bookingId);
    return result;
  } catch (reason) {
    throw bookingError(reason);
  }
}

export async function cancelCustomerBooking(bookingId: string) {
  const uid = requireUid();
  if (!validBookingId(bookingId)) throw new BookingInputError("Agendamento inválido.");
  const bookingRef = doc(db, "bookings", bookingId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const bookingSnapshot = await transaction.get(bookingRef);
      if (!bookingSnapshot.exists()) throw new BookingAccessError("Agendamento não encontrado.");
      const current = bookingFromSnapshot(bookingSnapshot);
      assertManageableBooking(current, uid);

      const availabilityRef = doc(db, "publicAvailability", current.dateKey);
      const availabilitySnapshot = await transaction.get(availabilityRef);
      if (!availabilitySnapshot.exists()) throw inconsistentAvailabilityError();
      const occupiedSlots = availabilityMap(availabilitySnapshot.data() as Partial<PublicAvailability>);
      if (current.occupiedSlotKeys.some((slotKey) => occupiedSlots[slotKey] !== true)) {
        throw inconsistentAvailabilityError();
      }
      current.occupiedSlotKeys.forEach((slotKey) => { delete occupiedSlots[slotKey]; });

      transaction.update(bookingRef, {
        status: "cancelled",
        lastCustomerMutation: "cancel",
        paymentMethod: deleteField(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(availabilityRef, availabilityMutation(occupiedSlots, bookingId, "cancel"));
      return { bookingId, status: "cancelled" as const };
    });
    forgetBookingAccess(bookingId);
    return result;
  } catch (reason) {
    throw bookingError(reason);
  }
}

export async function getCustomerBooking(bookingId: string): Promise<CustomerBooking | null> {
  if (!validBookingId(bookingId)) return null;
  const snapshot = await getDoc(doc(db, "bookings", bookingId));
  if (!snapshot.exists()) return null;
  return bookingFromSnapshot(snapshot);
}

export async function getActiveCustomerBooking(): Promise<CustomerBooking | null> {
  const remembered = readRememberedBookingId();
  if (remembered) {
    try {
      const booking = await getCustomerBooking(remembered);
      if (booking && isActiveFutureBooking(booking)) return booking;
      forgetBookingAccess(remembered);
    } catch {
      forgetBookingAccess(remembered);
    }
  }

  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snapshot = await getDocs(query(
    collection(db, "bookings"),
    where("createdByUid", "==", uid),
    where("status", "in", ["pending", "confirmed"]),
    where("startAt", ">", Timestamp.now()),
    orderBy("startAt", "asc"),
    limit(1),
  ));
  const booking = snapshot.docs[0] ? bookingFromSnapshot(snapshot.docs[0]) : null;
  if (booking) rememberBookingAccess(booking.id);
  return booking;
}

export function rememberBookingAccess(bookingId: string) {
  if (validBookingId(bookingId)) localStorage.setItem(activeBookingKey, bookingId);
}

function readRememberedBookingId() {
  const value = localStorage.getItem(activeBookingKey);
  return value && validBookingId(value) ? value : null;
}

function forgetBookingAccess(bookingId: string) {
  if (localStorage.getItem(activeBookingKey) === bookingId) localStorage.removeItem(activeBookingKey);
}

function bookingFromSnapshot(snapshot: DocumentSnapshot<DocumentData>): CustomerBooking {
  const data = snapshot.data() as Omit<CustomerBooking, "id">;
  const serviceIds = Array.isArray(data.serviceIds)
    ? data.serviceIds
    : data.serviceId.split("+").filter(Boolean);
  return { id: snapshot.id, ...data, serviceIds };
}

function isActiveFutureBooking(booking: CustomerBooking) {
  return activeStatuses.has(booking.status) && booking.startAt.toMillis() > Date.now();
}

function validBookingId(value: string) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function bookingError(reason: unknown) {
  if (reason instanceof SlotUnavailableError || reason instanceof BookingInputError || reason instanceof BookingAccessError) {
    return reason;
  }
  if (reason instanceof FirebaseError) {
    if (reason.code === "already-exists" || reason.code === "aborted") {
      return new SlotUnavailableError("Esse horário acabou de ser reservado.");
    }
    if (reason.code === "permission-denied") {
      return new BookingAccessError("Esta sessão não tem permissão para alterar o agendamento.");
    }
    const allowedCodes = [
      "invalid-argument",
      "failed-precondition",
      "not-found",
      "unauthenticated",
      "resource-exhausted",
      "unavailable",
    ];
    if (allowedCodes.includes(reason.code)) return new Error(cleanFirebaseMessage(reason.message));
  }
  return reason instanceof Error ? reason : new Error("Não foi possível concluir a operação.");
}

function cleanFirebaseMessage(message: string) {
  return message.replace(/^FirebaseError:\s*/i, "").replace(/^\[[^\]]+\]\s*/, "");
}

function requireUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new BookingAccessError("Sessão de agendamento inválida.");
  return uid;
}

function validateClientDetails(value: ClientDetails) {
  const name = value.name.trim();
  const phone = value.phone.replace(/\D/g, "");
  const note = value.note.trim();
  if (name.length < 2 || name.length > 80) throw new BookingInputError("Informe um nome entre 2 e 80 caracteres.");
  if (!/^\d{10,11}$/.test(phone)) throw new BookingInputError("Informe um WhatsApp com DDD.");
  if (note.length > 300) throw new BookingInputError("A observação deve ter no máximo 300 caracteres.");
  return { name, phone, note };
}

function assertManageableBooking(booking: CustomerBooking, uid: string) {
  if (booking.createdByUid !== uid) throw new BookingAccessError("Você não tem acesso a este agendamento.");
  if (!activeStatuses.has(booking.status)) throw new BookingInputError("Este agendamento não pode mais ser alterado.");
  if (booking.startAt.toMillis() <= Date.now()) throw new BookingInputError("O horário deste agendamento já começou.");
}

function availabilityMutation(
  occupiedSlots: Record<string, boolean>,
  bookingId: string,
  lastMutationType: NonNullable<PublicAvailability["lastMutationType"]>,
) {
  return {
    occupiedSlotKeys: Object.keys(occupiedSlots).filter((key) => occupiedSlots[key] === true).sort(),
    lastMutationId: bookingId,
    lastMutationType,
    updatedAt: serverTimestamp(),
  };
}

function inconsistentAvailabilityError() {
  return new BookingAccessError("A disponibilidade deste agendamento está inconsistente. Fale com a barbearia.");
}

function availabilityMap(data: Partial<PublicAvailability>) {
  if (Array.isArray(data.occupiedSlotKeys)) {
    return Object.fromEntries(data.occupiedSlotKeys.map((key) => [key, true]));
  }
  return { ...(data.occupiedSlots ?? {}) };
}

function validateRequestedServices(services: Service[]) {
  const ids = services.map((service) => service.id);
  if (ids.length < 1) throw new BookingInputError("Selecione pelo menos um serviço.");
  if (ids.length > 2) throw new BookingInputError("Selecione no máximo 2 serviços por agendamento.");
  if (new Set(ids).size !== ids.length || ids.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
    throw new BookingInputError("Seleção de serviços inválida.");
  }
  return ids;
}

function combinedServices(services: Service[]) {
  const serviceIds = services.map((service) => service.id);
  const serviceId = serviceIds.join("+");
  const serviceNameSnapshot = services.map((service) => service.name.trim()).join(" + ");
  const durationMinutesSnapshot = services.reduce((total, service) => total + service.durationMinutes, 0);
  const priceCentsSnapshot = services.reduce((total, service) => total + service.priceCents, 0);
  if (
    serviceNameSnapshot.length < 2 ||
    serviceNameSnapshot.length > 320 ||
    serviceId.length > 128 ||
    !Number.isInteger(durationMinutesSnapshot) ||
    durationMinutesSnapshot < 5 ||
    durationMinutesSnapshot > 480 ||
    !Number.isInteger(priceCentsSnapshot) ||
    priceCentsSnapshot < 0 ||
    priceCentsSnapshot > 10_000_000
  ) {
    throw new BookingInputError("A combinação de serviços ultrapassa os limites permitidos.");
  }
  return {
    serviceId,
    serviceIds,
    serviceNameSnapshot,
    durationMinutesSnapshot,
    priceCentsSnapshot,
  };
}
