import type { Timestamp } from "firebase/firestore";
export type BookingStatus = "pending"|"confirmed"|"completed"|"cancelled";
export type PaymentMethod = "pix"|"cash"|"card";
export interface Booking { id:string; dateKey:string; startTime:string; endTime:string; startAt:Timestamp; endAt:Timestamp; expiresAt?:Timestamp; occupiedSlotKeys:string[]; serviceId:string; serviceIds?:string[]; serviceNameSnapshot:string; durationMinutesSnapshot:number; priceCentsSnapshot:number; clientName:string; clientPhone:string; clientNote?:string; status:BookingStatus; paymentMethod?:PaymentMethod; lastCustomerMutation?:"create"|"cancel"|"reschedule"; createdByUid:string; createdAt:Timestamp; updatedAt:Timestamp }
export type ServiceIconKey="none"|"complete"|"scissors-comb"|"scissors"|"shaver"|"beard"|"mustache"|"brush"|"chair"|"spray";
export interface Service { id:string; name:string; description?:string; iconKey?:ServiceIconKey; durationMinutes:number; priceCents:number; active:boolean; sortOrder:number; createdAt?:Timestamp; updatedAt?:Timestamp }
export interface Period { start:string; end:string }
export interface PublicSettings { businessName:string; publicPhone:string; timezone:"America/Recife"; slotIntervalMinutes:number; minimumNoticeMinutes:number; bookingAdvanceDays:number; weeklySchedule:Record<string,Period[]>; updatedAt?:Timestamp }
export interface DateException { id:string; closed:boolean; customPeriods?:Period[]; reason?:string; updatedAt?:Timestamp }
export interface PublicAvailability { occupiedSlotKeys?:string[]; occupiedSlots?:Record<string,boolean> }
export interface FinancialSummary {
  completedRevenueCents:number;
  expectedRevenueCents:number;
  completedAppointments:number;
  confirmedAppointments:number;
  cancelledAppointments:number;
  pixRevenueCents:number;
  cashRevenueCents:number;
  cardRevenueCents:number;
  updatedAt?:Timestamp;
}
export interface AdminUser { role:"owner"; name:string; active:boolean; createdAt:Timestamp }
