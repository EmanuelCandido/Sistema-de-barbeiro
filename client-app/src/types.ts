import type { Timestamp } from "firebase/firestore";

export type Period = { start: string; end: string };
export type WeeklySchedule = Record<string, Period[]>;

export interface PublicSettings {
  businessName: string;
  publicPhone: string;
  timezone: "America/Recife";
  slotIntervalMinutes: number;
  minimumNoticeMinutes: number;
  bookingAdvanceDays: number;
  weeklySchedule: WeeklySchedule;
  updatedAt?: Timestamp;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  iconKey?: "none" | "complete" | "scissors-comb" | "scissors" | "shaver" | "beard";
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  sortOrder: number;
}

export interface DateException {
  closed: boolean;
  customPeriods?: Period[];
  reason?: string;
}

export interface PublicAvailability {
  occupiedSlots: Record<string, boolean>;
  occupiedSlotKeys?: string[];
  lastMutationId?: string;
  lastMutationType?: "create" | "cancel" | "reschedule-same" | "reschedule-source" | "reschedule-target";
}

export interface ClientDetails { name: string; phone: string; note: string }

export interface BookingConfirmation {
  bookingId: string;
  serviceName: string;
  durationMinutes: number;
  priceCents: number;
  dateKey: string;
  startTime: string;
  endTime: string;
  clientName: string;
  businessName: string;
  publicPhone: string;
}

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

export interface CustomerBooking {
  id: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  startAt: Timestamp;
  endAt: Timestamp;
  occupiedSlotKeys: string[];
  serviceId: string;
  serviceIds?: string[];
  serviceNameSnapshot: string;
  durationMinutesSnapshot: number;
  priceCentsSnapshot: number;
  clientName: string;
  clientPhone: string;
  clientNote?: string;
  status: BookingStatus;
  lastCustomerMutation?: "create" | "cancel" | "reschedule";
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
