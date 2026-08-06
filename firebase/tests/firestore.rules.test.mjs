import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const projectId = "barbearia-rules-test";
const bookingId = "opaqueBookingClient01";
const otherBookingId = "opaqueBookingOther001";
let env;

const futureKey = keyFromNow(7);
const secondFutureKey = keyFromNow(8);
const service = {
  name: "Corte tradicional",
  description: "Corte completo",
  durationMinutes: 60,
  priceCents: 3500,
  active: true,
  sortOrder: 1,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
};
const inactiveService = { ...service, name: "Serviço oculto", active: false, sortOrder: 2 };
const beardService = {
  ...service,
  name: "Barba",
  description: "Modelagem de barba",
  durationMinutes: 30,
  priceCents: 2000,
  sortOrder: 3,
};
const finishService = {
  ...service,
  name: "Acabamento",
  description: "Acabamento final",
  durationMinutes: 30,
  priceCents: 1500,
  sortOrder: 4,
};
const spaService = {
  ...service,
  name: "Hidratação",
  description: "Tratamento capilar",
  durationMinutes: 30,
  priceCents: 1000,
  sortOrder: 5,
};
const eyebrowService = {
  ...service,
  name: "Sobrancelha",
  description: "Acabamento da sobrancelha",
  durationMinutes: 30,
  priceCents: 800,
  sortOrder: 6,
};
const dailyPeriods = [{ start: "08:00", end: "18:00" }];
const settings = {
  businessName: "Barbearia Exemplo",
  publicPhone: "81999999999",
  timezone: "America/Recife",
  slotIntervalMinutes: 30,
  minimumNoticeMinutes: 60,
  bookingAdvanceDays: 30,
  weeklySchedule: {
    sunday: dailyPeriods,
    monday: dailyPeriods,
    tuesday: dailyPeriods,
    wednesday: dailyPeriods,
    thursday: dailyPeriods,
    friday: dailyPeriods,
    saturday: dailyPeriods,
  },
  updatedAt: Timestamp.now(),
};
const summary = {
  completedRevenueCents: 3500,
  expectedRevenueCents: 0,
  completedAppointments: 1,
  confirmedAppointments: 0,
  cancelledAppointments: 0,
  pixRevenueCents: 3500,
  cashRevenueCents: 0,
  cardRevenueCents: 0,
  updatedAt: Timestamp.now(),
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});
after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "services", "active"), service);
    await setDoc(doc(db, "services", "inactive"), inactiveService);
    await setDoc(doc(db, "services", "beard"), beardService);
    await setDoc(doc(db, "services", "finish"), finishService);
    await setDoc(doc(db, "services", "spa"), spaService);
    await setDoc(doc(db, "services", "eyebrow"), eyebrowService);
    await setDoc(doc(db, "settings", "public"), settings);
    await setDoc(doc(db, "exceptions", secondFutureKey), {
      closed: false,
      customPeriods: [{ start: "09:00", end: "12:00" }],
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, "publicAvailability", secondFutureKey), {
      occupiedSlots: { "10:00": true },
      lastMutationId: "seed",
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, "users", "owner"), {
      role: "owner",
      name: "Dono",
      active: true,
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, "users", "disabled"), {
      role: "owner",
      name: "Desativado",
      active: false,
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, "users", "common"), {
      role: "user",
      name: "Comum",
      active: true,
      createdAt: Timestamp.now(),
    });
  });
});

function booking(uid = "client", overrides = {}) {
  return {
    dateKey: futureKey,
    startTime: "09:00",
    endTime: "10:00",
    startAt: at(futureKey, "09:00"),
    endAt: at(futureKey, "10:00"),
    occupiedSlotKeys: ["09:00", "09:30"],
    serviceId: "active",
    serviceIds: ["active"],
    serviceNameSnapshot: "Corte tradicional",
    durationMinutesSnapshot: 60,
    priceCentsSnapshot: 3500,
    clientName: "Cliente Teste",
    clientPhone: "81999999999",
    status: "pending",
    lastCustomerMutation: "create",
    createdByUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function seedBooking(id = bookingId, data = booking(), occupiedSlots = { "09:00": true, "09:30": true }) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "bookings", id), {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    if (["pending", "confirmed"].includes(data.status)) {
      await setDoc(doc(db, "customerBookingLocks", data.createdByUid), {
        bookingId: id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
    await setDoc(doc(db, "publicAvailability", data.dateKey), {
      occupiedSlots,
      lastMutationId: "seed",
      updatedAt: Timestamp.now(),
    });
  });
}

async function atomicCreate(context, id = bookingId, data = booking(), oldSlots = {}) {
  const db = context.firestore();
  const batch = writeBatch(db);
  const occupiedSlots = { ...oldSlots };
  data.occupiedSlotKeys.forEach((slot) => { occupiedSlots[slot] = true; });
  batch.set(doc(db, "bookings", id), data);
  batch.set(doc(db, "customerBookingLocks", data.createdByUid), {
    bookingId: id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "publicAvailability", data.dateKey), {
    occupiedSlotKeys: Object.keys(occupiedSlots).sort(),
    lastMutationId: id,
    lastMutationType: "create",
    updatedAt: serverTimestamp(),
  });
  return batch.commit();
}

async function atomicCancel(context, id = bookingId) {
  const db = context.firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "bookings", id), {
    status: "cancelled",
    lastCustomerMutation: "cancel",
    paymentMethod: deleteField(),
    expiresAt: expires(Timestamp.now()),
    updatedAt: serverTimestamp(),
  });
  batch.delete(doc(db, "customerBookingLocks", "client"));
  batch.set(doc(db, "publicAvailability", futureKey), {
    occupiedSlotKeys: [],
    lastMutationId: id,
    lastMutationType: "cancel",
    updatedAt: serverTimestamp(),
  });
  return batch.commit();
}

async function atomicReschedule(
  context,
  {
    id = bookingId,
    targetDate = futureKey,
    targetTime = "10:00",
    targetSlots = ["10:00", "10:30"],
    targetOccupied = {},
  } = {},
) {
  const db = context.firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "bookings", id), {
    dateKey: targetDate,
    startTime: targetTime,
    endTime: "11:00",
    startAt: at(targetDate, targetTime),
    endAt: at(targetDate, "11:00"),
    occupiedSlotKeys: targetSlots,
    status: "pending",
    lastCustomerMutation: "reschedule",
    paymentMethod: deleteField(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "customerBookingLocks", "client"), {
    updatedAt: serverTimestamp(),
  });
  if (targetDate === futureKey) {
    batch.set(doc(db, "publicAvailability", futureKey), {
      occupiedSlotKeys: Object.keys({ ...targetOccupied, "10:00": true, "10:30": true }).sort(),
      lastMutationId: id,
      lastMutationType: "reschedule-same",
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(doc(db, "publicAvailability", futureKey), {
      occupiedSlotKeys: [],
      lastMutationId: id,
      lastMutationType: "reschedule-source",
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "publicAvailability", targetDate), {
      occupiedSlotKeys: Object.keys({ ...targetOccupied, "10:00": true, "10:30": true }).sort(),
      lastMutationId: id,
      lastMutationType: "reschedule-target",
      updatedAt: serverTimestamp(),
    });
  }
  return batch.commit();
}

async function atomicServiceChange(context, overrides = {}) {
  const db = context.firestore();
  const batch = writeBatch(db);
  const servicePatch = {
    serviceId: "active+beard",
    serviceIds: ["active", "beard"],
    serviceNameSnapshot: "Corte tradicional + Barba",
    durationMinutesSnapshot: 90,
    priceCentsSnapshot: 5500,
    endTime: "10:30",
    endAt: at(futureKey, "10:30"),
    occupiedSlotKeys: ["09:00", "09:30", "10:00"],
    status: "pending",
    lastCustomerMutation: "reschedule",
    paymentMethod: deleteField(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
  batch.update(doc(db, "bookings", bookingId), servicePatch);
  batch.update(doc(db, "customerBookingLocks", "client"), {
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "publicAvailability", futureKey), {
    occupiedSlotKeys: servicePatch.occupiedSlotKeys,
    lastMutationId: bookingId,
    lastMutationType: "reschedule-same",
    updatedAt: serverTimestamp(),
  });
  return batch.commit();
}

describe("leitura pública mínima", () => {
  it("cliente lê serviço ativo e não lê inativo", async () => {
    const db = env.authenticatedContext("client", { firebase: { sign_in_provider: "anonymous" } }).firestore();
    await assertSucceeds(getDoc(doc(db, "services", "active")));
    await assertFails(getDoc(doc(db, "services", "inactive")));
    const result = await assertSucceeds(getDocs(query(
      collection(db, "services"),
      where("active", "==", true),
    )));
    assert.equal(result.size, 5);
  });

  it("cliente consulta disponibilidade e exceções por intervalo", async () => {
    const db = env.authenticatedContext("client").firestore();
    const range = [
      where(documentId(), ">=", futureKey),
      where(documentId(), "<=", secondFutureKey),
    ];
    const availability = await assertSucceeds(getDocs(query(collection(db, "publicAvailability"), ...range)));
    const exceptions = await assertSucceeds(getDocs(query(collection(db, "exceptions"), ...range)));
    assert.equal(availability.size, 1);
    assert.equal(exceptions.size, 1);
  });

  it("cliente lê somente agendamentos do próprio UID", async () => {
    await seedBooking(bookingId, booking("client"));
    await seedBooking(otherBookingId, booking("other"));
    const db = env.authenticatedContext("client").firestore();
    await assertSucceeds(getDoc(doc(db, "bookings", bookingId)));
    await assertFails(getDoc(doc(db, "bookings", otherBookingId)));
    const own = await assertSucceeds(getDocs(query(
      collection(db, "bookings"),
      where("createdByUid", "==", "client"),
    )));
    assert.equal(own.size, 1);
    await assertFails(getDocs(collection(db, "bookings")));
    await assertFails(getDoc(doc(db, "financialSummaries", futureKey.slice(0, 7))));
  });
});

describe("criação atômica no plano gratuito", () => {
  it("cria reserva própria e ocupa exatamente os intervalos", async () => {
    const context = env.authenticatedContext("client");
    await assertSucceeds(atomicCreate(context));
    const db = context.firestore();
    const savedBooking = await getDoc(doc(db, "bookings", bookingId));
    const availability = await getDoc(doc(db, "publicAvailability", futureKey));
    assert.equal(savedBooking.data().createdByUid, "client");
    assert.deepEqual(availability.data().occupiedSlotKeys, ["09:00", "09:30"]);
  });

  it("cria reserva com vários serviços usando duração e preço oficiais", async () => {
    const context = env.authenticatedContext("client");
    await assertSucceeds(atomicCreate(context, bookingId, booking("client", {
      endTime: "10:30",
      endAt: at(futureKey, "10:30"),
      occupiedSlotKeys: ["09:00", "09:30", "10:00"],
      serviceId: "active+beard",
      serviceIds: ["active", "beard"],
      serviceNameSnapshot: "Corte tradicional + Barba",
      durationMinutesSnapshot: 90,
      priceCentsSnapshot: 5500,
    })));
    const saved = (await getDoc(doc(context.firestore(), "bookings", bookingId))).data();
    assert.deepEqual(saved.serviceIds, ["active", "beard"]);
    assert.equal(saved.priceCentsSnapshot, 5500);
  });

  it("cria reserva com quatro serviços usando duração e preço oficiais", async () => {
    const context = env.authenticatedContext("client");
    await assertSucceeds(atomicCreate(context, bookingId, booking("client", {
      endTime: "11:30",
      endAt: at(futureKey, "11:30"),
      occupiedSlotKeys: ["09:00", "09:30", "10:00", "10:30", "11:00"],
      serviceId: "active+beard+finish+spa",
      serviceIds: ["active", "beard", "finish", "spa"],
      serviceNameSnapshot: "Corte tradicional + Barba + Acabamento + Hidratação",
      durationMinutesSnapshot: 150,
      priceCentsSnapshot: 8000,
    })));
    const saved = (await getDoc(doc(context.firestore(), "bookings", bookingId))).data();
    assert.deepEqual(saved.serviceIds, ["active", "beard", "finish", "spa"]);
    assert.equal(saved.priceCentsSnapshot, 8000);
  });

  it("bloqueia a seleção pública acima de quatro serviços", async () => {
    await assertFails(atomicCreate(env.authenticatedContext("client"), bookingId, booking("client", {
      endTime: "12:00",
      endAt: at(futureKey, "12:00"),
      occupiedSlotKeys: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"],
      serviceId: "active+beard+finish+spa+eyebrow",
      serviceIds: ["active", "beard", "finish", "spa", "eyebrow"],
      serviceNameSnapshot: "Corte tradicional + Barba + Acabamento + Hidratação + Sobrancelha",
      durationMinutesSnapshot: 180,
      priceCentsSnapshot: 8800,
    })));
  });

  it("bloqueia um segundo horário futuro para o mesmo cliente", async () => {
    const context = env.authenticatedContext("client");
    await assertSucceeds(atomicCreate(context));
    await assertFails(atomicCreate(context, otherBookingId, booking("client", {
      startTime: "11:00",
      endTime: "12:00",
      startAt: at(futureKey, "11:00"),
      endAt: at(futureKey, "12:00"),
      occupiedSlotKeys: ["11:00", "11:30"],
    }), { "09:00": true, "09:30": true }));
  });

  it("permite novo horário depois de cancelar o atual", async () => {
    const context = env.authenticatedContext("client");
    await seedBooking();
    await assertSucceeds(atomicCancel(context));
    await assertSucceeds(atomicCreate(context, otherBookingId, booking("client", {
      startTime: "11:00",
      endTime: "12:00",
      startAt: at(futureKey, "11:00"),
      endAt: at(futureKey, "12:00"),
      occupiedSlotKeys: ["11:00", "11:30"],
    })));

  });

  it("continua bloqueando novo horário até a barbearia finalizar", async () => {
    const context = env.authenticatedContext("client");
    const pastStart = Timestamp.fromMillis(Date.now() - 60_000);
    await seedBooking(bookingId, booking("client", { startAt: pastStart }));
    await assertFails(atomicCreate(context, otherBookingId, booking("client", {
      startTime: "11:00",
      endTime: "12:00",
      startAt: at(futureKey, "11:00"),
      endAt: at(futureKey, "12:00"),
      occupiedSlotKeys: ["11:00", "11:30"],
    }), { "09:00": true, "09:30": true }));
  });

  it("bloqueia colisão, snapshot de preço adulterado e disponibilidade isolada", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "publicAvailability", futureKey), {
        occupiedSlots: { "09:00": true },
        lastMutationId: "seed",
        updatedAt: Timestamp.now(),
      });
    });
    await assertFails(atomicCreate(
      env.authenticatedContext("client"),
      bookingId,
      booking(),
      { "09:00": true },
    ));
    await assertFails(atomicCreate(
      env.authenticatedContext("client"),
      bookingId,
      booking("client", { priceCentsSnapshot: 1 }),
      { "09:00": true },
    ));
    await assertFails(atomicCreate(
      env.authenticatedContext("client"),
      bookingId,
      booking("client", {
        serviceId: "active+inactive",
        serviceIds: ["active", "inactive"],
        serviceNameSnapshot: "Corte tradicional + Serviço oculto",
        durationMinutesSnapshot: 120,
        priceCentsSnapshot: 7000,
      }),
    ));
    const db = env.authenticatedContext("client").firestore();
    await assertFails(setDoc(doc(db, "publicAvailability", futureKey), {
      occupiedSlotKeys: ["12:00"],
      lastMutationId: bookingId,
      lastMutationType: "create",
      updatedAt: serverTimestamp(),
    }));
  });

  it("bloqueia criação em nome de outro UID e campos extras", async () => {
    await assertFails(atomicCreate(
      env.authenticatedContext("client"),
      bookingId,
      booking("other"),
    ));
    await assertFails(atomicCreate(
      env.authenticatedContext("client"),
      bookingId,
      booking("client", { admin: true }),
    ));
  });

  it("bloqueia intervalos não sequenciais, horário fechado e timestamp divergente", async () => {
    const context = env.authenticatedContext("client");
    await assertFails(atomicCreate(
      context,
      bookingId,
      booking("client", { occupiedSlotKeys: ["09:00", "09:45"] }),
    ));
    await assertFails(atomicCreate(
      context,
      bookingId,
      booking("client", {
        startTime: "07:00",
        endTime: "08:00",
        startAt: at(futureKey, "07:00"),
        endAt: at(futureKey, "08:00"),
        occupiedSlotKeys: ["07:00", "07:30"],
      }),
    ));
    await assertFails(atomicCreate(
      context,
      bookingId,
      booking("client", {
        startAt: at(futureKey, "10:00"),
        endAt: at(futureKey, "11:00"),
      }),
    ));

    await env.withSecurityRulesDisabled(async (adminContext) => {
      await setDoc(doc(adminContext.firestore(), "exceptions", futureKey), {
        closed: true,
        updatedAt: Timestamp.now(),
      });
    });
    await assertFails(atomicCreate(context));
  });
});

describe("cancelamento protegido", () => {
  it("cliente cancela o próprio horário e libera os intervalos atomicamente", async () => {
    await seedBooking();
    const context = env.authenticatedContext("client");
    await assertSucceeds(atomicCancel(context));
    const db = context.firestore();
    assert.equal((await getDoc(doc(db, "bookings", bookingId))).data().status, "cancelled");
    assert.deepEqual((await getDoc(doc(db, "publicAvailability", futureKey))).data().occupiedSlotKeys, []);
  });

  it("bloqueia cancelamento sem liberar vaga, de outro UID ou com alteração de preço", async () => {
    await seedBooking();
    const clientDb = env.authenticatedContext("client").firestore();
    await assertFails(updateDoc(doc(clientDb, "bookings", bookingId), {
      status: "cancelled",
      updatedAt: serverTimestamp(),
    }));
    await assertFails(atomicCancel(env.authenticatedContext("other")));

    const batch = writeBatch(clientDb);
    batch.update(doc(clientDb, "bookings", bookingId), {
      status: "cancelled",
      priceCentsSnapshot: 1,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(clientDb, "publicAvailability", futureKey), {
      occupiedSlotKeys: [],
      lastMutationId: bookingId,
      lastMutationType: "cancel",
      updatedAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });
});

describe("reagendamento protegido", () => {
  it("reagenda no mesmo dia com troca exata dos intervalos", async () => {
    await seedBooking();
    const context = env.authenticatedContext("client");
    await assertSucceeds(atomicReschedule(context));
    const db = context.firestore();
    const saved = (await getDoc(doc(db, "bookings", bookingId))).data();
    assert.equal(saved.startTime, "10:00");
    assert.deepEqual(
      (await getDoc(doc(db, "publicAvailability", futureKey))).data().occupiedSlotKeys,
      ["10:00", "10:30"],
    );
  });

  it("reagenda entre datas liberando a origem e ocupando o destino", async () => {
    await seedBooking();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "publicAvailability", secondFutureKey), {
        occupiedSlots: {},
        lastMutationId: "seed",
        updatedAt: Timestamp.now(),
      });
    });
    const context = env.authenticatedContext("client");
    await assertSucceeds(atomicReschedule(context, { targetDate: secondFutureKey }));
    const db = context.firestore();
    assert.deepEqual(
      (await getDoc(doc(db, "publicAvailability", futureKey))).data().occupiedSlotKeys,
      [],
    );
    assert.deepEqual(
      (await getDoc(doc(db, "publicAvailability", secondFutureKey))).data().occupiedSlotKeys,
      ["10:00", "10:30"],
    );
  });

  it("adiciona serviço e amplia os intervalos no mesmo agendamento", async () => {
    await seedBooking();
    const context = env.authenticatedContext("client");
    await assertSucceeds(atomicServiceChange(context));
    const db = context.firestore();
    const saved = (await getDoc(doc(db, "bookings", bookingId))).data();
    assert.deepEqual(saved.serviceIds, ["active", "beard"]);
    assert.equal(saved.durationMinutesSnapshot, 90);
    assert.deepEqual(
      (await getDoc(doc(db, "publicAvailability", futureKey))).data().occupiedSlotKeys,
      ["09:00", "09:30", "10:00"],
    );
  });

  it("altera o agendamento para quatro serviços com valores oficiais", async () => {
    await seedBooking();
    const context = env.authenticatedContext("client");
    await assertSucceeds(atomicServiceChange(context, {
      serviceId: "active+beard+finish+spa",
      serviceIds: ["active", "beard", "finish", "spa"],
      serviceNameSnapshot: "Corte tradicional + Barba + Acabamento + Hidratação",
      durationMinutesSnapshot: 150,
      priceCentsSnapshot: 8000,
      endTime: "11:30",
      endAt: at(futureKey, "11:30"),
      occupiedSlotKeys: ["09:00", "09:30", "10:00", "10:30", "11:00"],
    }));
    const saved = (await getDoc(doc(context.firestore(), "bookings", bookingId))).data();
    assert.deepEqual(saved.serviceIds, ["active", "beard", "finish", "spa"]);
    assert.equal(saved.durationMinutesSnapshot, 150);
    assert.deepEqual(
      (await getDoc(doc(context.firestore(), "publicAvailability", futureKey))).data().occupiedSlotKeys,
      ["09:00", "09:30", "10:00", "10:30", "11:00"],
    );
  });

  it("altera serviços e data na mesma transação protegida", async () => {
    await seedBooking();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "publicAvailability", secondFutureKey), {
        occupiedSlots: {},
        lastMutationId: "seed",
        updatedAt: Timestamp.now(),
      });
    });
    const context = env.authenticatedContext("client");
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, "bookings", bookingId), {
      dateKey: secondFutureKey,
      startTime: "09:00",
      endTime: "10:30",
      startAt: at(secondFutureKey, "09:00"),
      endAt: at(secondFutureKey, "10:30"),
      occupiedSlotKeys: ["09:00", "09:30", "10:00"],
      serviceId: "active+beard",
      serviceIds: ["active", "beard"],
      serviceNameSnapshot: "Corte tradicional + Barba",
      durationMinutesSnapshot: 90,
      priceCentsSnapshot: 5500,
      status: "pending",
      lastCustomerMutation: "reschedule",
      paymentMethod: deleteField(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, "customerBookingLocks", "client"), {
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "publicAvailability", futureKey), {
      occupiedSlotKeys: [],
      lastMutationId: bookingId,
      lastMutationType: "reschedule-source",
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "publicAvailability", secondFutureKey), {
      occupiedSlotKeys: ["09:00", "09:30", "10:00"],
      lastMutationId: bookingId,
      lastMutationType: "reschedule-target",
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it("bloqueia serviço duplicado, inativo e preço combinado adulterado", async () => {
    await seedBooking();
    const context = env.authenticatedContext("client");
    await assertFails(atomicServiceChange(context, {
      serviceId: "active+active",
      serviceIds: ["active", "active"],
      serviceNameSnapshot: "Corte tradicional + Corte tradicional",
      durationMinutesSnapshot: 120,
      priceCentsSnapshot: 7000,
      endTime: "11:00",
      endAt: at(futureKey, "11:00"),
      occupiedSlotKeys: ["09:00", "09:30", "10:00", "10:30"],
    }));
    await assertFails(atomicServiceChange(context, {
      serviceId: "active+beard+finish+finish",
      serviceIds: ["active", "beard", "finish", "finish"],
      serviceNameSnapshot: "Corte tradicional + Barba + Acabamento + Acabamento",
      durationMinutesSnapshot: 150,
      priceCentsSnapshot: 8500,
      endTime: "11:30",
      endAt: at(futureKey, "11:30"),
      occupiedSlotKeys: ["09:00", "09:30", "10:00", "10:30", "11:00"],
    }));
    await assertFails(atomicServiceChange(context, {
      serviceId: "active+inactive",
      serviceIds: ["active", "inactive"],
      serviceNameSnapshot: "Corte tradicional + Serviço oculto",
      durationMinutesSnapshot: 120,
      priceCentsSnapshot: 7000,
      endTime: "11:00",
      endAt: at(futureKey, "11:00"),
      occupiedSlotKeys: ["09:00", "09:30", "10:00", "10:30"],
    }));
    await assertFails(atomicServiceChange(context, { priceCentsSnapshot: 1 }));
  });

  it("bloqueia vaga ocupada, mutação parcial e adulteração do cliente", async () => {
    await seedBooking();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "publicAvailability", secondFutureKey), {
        occupiedSlots: { "10:00": true },
        lastMutationId: "seed",
        updatedAt: Timestamp.now(),
      });
    });
    await assertFails(atomicReschedule(
      env.authenticatedContext("client"),
      { targetDate: secondFutureKey, targetOccupied: { "10:00": true } },
    ));

    const db = env.authenticatedContext("client").firestore();
    await assertFails(updateDoc(doc(db, "bookings", bookingId), {
      dateKey: secondFutureKey,
      startTime: "10:00",
      endTime: "11:00",
      startAt: at(secondFutureKey, "10:00"),
      endAt: at(secondFutureKey, "11:00"),
      occupiedSlotKeys: ["10:00", "10:30"],
      updatedAt: serverTimestamp(),
    }));

    const batch = writeBatch(db);
    batch.update(doc(db, "bookings", bookingId), {
      clientName: "Nome adulterado",
      dateKey: secondFutureKey,
      startTime: "10:00",
      endTime: "11:00",
      startAt: at(secondFutureKey, "10:00"),
      endAt: at(secondFutureKey, "11:00"),
      occupiedSlotKeys: ["10:00", "10:30"],
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, "customerBookingLocks", "client"), {
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "publicAvailability", futureKey), {
      occupiedSlotKeys: [],
      lastMutationId: bookingId,
      lastMutationType: "reschedule-source",
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "publicAvailability", secondFutureKey), {
      occupiedSlotKeys: ["10:00", "10:30"],
      lastMutationId: bookingId,
      lastMutationType: "reschedule-target",
      updatedAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });
});

describe("papéis administrativos", () => {
  it("owner cria agendamento sem WhatsApp", async () => {
    const db = env.authenticatedContext("owner").firestore();
    await assertSucceeds(setDoc(doc(db, "bookings", "admin-booking-without-phone"), booking("admin_booking_without_phone", {
      clientPhone: "",
      lastCustomerMutation: "create",
    })));
  });

  it("owner ativo acessa dados privados e grava resumos", async () => {
    const db = env.authenticatedContext("owner").firestore();
    await assertSucceeds(getDocs(collection(db, "bookings")));
    await assertSucceeds(setDoc(doc(db, "financialSummaries", futureKey.slice(0, 7)), {
      ...summary,
      updatedAt: serverTimestamp(),
    }));
  });

  it("claim isolada, usuário comum e owner desativado são bloqueados", async () => {
    for (const uid of ["claim-owner", "common", "disabled"]) {
      const db = env.authenticatedContext(uid, { owner: true }).firestore();
      await assertFails(getDocs(collection(db, "bookings")));
      await assertFails(setDoc(doc(db, "financialSummaries", futureKey.slice(0, 7)), summary));
    }
  });

  it("owner salva serviço sem ícone", async () => {
    const db = env.authenticatedContext("owner").firestore();
    await assertSucceeds(setDoc(doc(db, "services", "sem-icone"), {
      ...service,
      iconKey: "none",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });

  it("owner salva todas as opções de ícone disponíveis", async () => {
    const db = env.authenticatedContext("owner").firestore();
    const iconKeys = ["none", "complete", "scissors-comb", "scissors", "shaver", "beard", "mustache", "brush", "chair", "spray"];
    for (const [index, iconKey] of iconKeys.entries()) {
      await assertSucceeds(setDoc(doc(db, "services", `icone-${index}`), {
        ...service,
        iconKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    }
  });

  it("owner não salva uma chave de ícone desconhecida", async () => {
    const db = env.authenticatedContext("owner").firestore();
    await assertFails(setDoc(doc(db, "services", "icone-invalido"), {
      ...service,
      iconKey: "unknown",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });

  it("owner salva até três períodos ordenados e bloqueia sobreposição", async () => {
    const db = env.authenticatedContext("owner").firestore();
    await assertSucceeds(setDoc(doc(db, "exceptions", futureKey), {
      closed: false,
      customPeriods: [
        { start: "08:00", end: "10:00" },
        { start: "10:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
      updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(db, "exceptions", futureKey), {
      closed: false,
      customPeriods: [
        { start: "08:00", end: "12:00" },
        { start: "11:30", end: "14:00" },
      ],
      updatedAt: serverTimestamp(),
    }));
  });
});

describe("fluxos administrativos completos", () => {
  it("owner salva as configuracoes e os horarios completos", async () => {
    const db = env.authenticatedContext("owner").firestore();
    await assertSucceeds(setDoc(doc(db, "settings", "public"), {
      ...settings,
      minimumNoticeMinutes: 5,
      weeklySchedule: {
        ...settings.weeklySchedule,
        friday: [
          { start: "08:00", end: "12:00" },
          { start: "14:00", end: "19:00" },
          { start: "19:01", end: "23:00" },
        ],
      },
      updatedAt: serverTimestamp(),
    }));
  });

  it("owner salva tres periodos em todos os dias sem exceder o limite das regras", async () => {
    const db = env.authenticatedContext("owner").firestore();
    const maximumPeriods = [
      { start: "08:00", end: "10:00" },
      { start: "10:00", end: "12:00" },
      { start: "14:00", end: "18:00" },
    ];
    await assertSucceeds(setDoc(doc(db, "settings", "public"), {
      ...settings,
      weeklySchedule: Object.fromEntries(
        Object.keys(settings.weeklySchedule).map(day => [day, maximumPeriods]),
      ),
      updatedAt: serverTimestamp(),
    }));
  });

  it("owner atualiza um servico existente", async () => {
    const db = env.authenticatedContext("owner").firestore();
    await assertSucceeds(updateDoc(doc(db, "services", "active"), {
      name: "Corte atualizado",
      description: "Descricao atualizada",
      iconKey: "scissors",
      durationMinutes: 45,
      priceCents: 4000,
      active: true,
      sortOrder: 1,
      updatedAt: serverTimestamp(),
    }));
  });

  it("owner cancela um agendamento e atualiza os documentos relacionados", async () => {
    await seedBooking();
    const db = env.authenticatedContext("owner").firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, "bookings", bookingId), {
      status: "cancelled",
      expiresAt: expires(Timestamp.now()),
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(db, "customerBookingLocks", "client"));
    batch.set(doc(db, "publicAvailability", futureKey), {
      occupiedSlotKeys: [],
      lastMutationId: `admin_${bookingId}`,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "financialSummaries", futureKey.slice(0, 7)), {
      completedRevenueCents: increment(0),
      expectedRevenueCents: increment(0),
      completedAppointments: increment(0),
      confirmedAppointments: increment(0),
      cancelledAppointments: increment(1),
      pixRevenueCents: increment(0),
      cashRevenueCents: increment(0),
      cardRevenueCents: increment(0),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await assertSucceeds(batch.commit());
  });

  it("owner conclui um agendamento e registra o financeiro", async () => {
    await seedBooking();
    const db = env.authenticatedContext("owner").firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, "bookings", bookingId), {
      status: "completed",
      paymentMethod: "pix",
      expiresAt: expires(Timestamp.now()),
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(db, "customerBookingLocks", "client"));
    batch.set(doc(db, "publicAvailability", futureKey), {
      occupiedSlotKeys: ["09:00", "09:30"],
      lastMutationId: `admin_${bookingId}`,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "financialSummaries", futureKey.slice(0, 7)), {
      completedRevenueCents: increment(3500),
      expectedRevenueCents: increment(0),
      completedAppointments: increment(1),
      confirmedAppointments: increment(0),
      cancelledAppointments: increment(0),
      pixRevenueCents: increment(3500),
      cashRevenueCents: increment(0),
      cardRevenueCents: increment(0),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await assertSucceeds(batch.commit());
  });

  it("owner reagenda um agendamento e troca a disponibilidade", async () => {
    await seedBooking();
    const db = env.authenticatedContext("owner").firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, "bookings", bookingId), {
      dateKey: secondFutureKey,
      startTime: "09:00",
      endTime: "10:00",
      startAt: at(secondFutureKey, "09:00"),
      endAt: at(secondFutureKey, "10:00"),
      occupiedSlotKeys: ["09:00", "09:30"],
      status: "pending",
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "customerBookingLocks", "client"), {
      bookingId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "publicAvailability", futureKey), {
      occupiedSlotKeys: [],
      lastMutationId: `admin_${bookingId}`,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "publicAvailability", secondFutureKey), {
      occupiedSlotKeys: ["09:00", "09:30", "10:00"],
      lastMutationId: `admin_${bookingId}`,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "financialSummaries", futureKey.slice(0, 7)), {
      completedRevenueCents: increment(0),
      expectedRevenueCents: increment(0),
      completedAppointments: increment(0),
      confirmedAppointments: increment(0),
      cancelledAppointments: increment(0),
      pixRevenueCents: increment(0),
      cashRevenueCents: increment(0),
      cardRevenueCents: increment(0),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await assertSucceeds(batch.commit());
  });
});

function keyFromNow(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function at(key, time) {
  return Timestamp.fromDate(new Date(`${key}T${time}:00-03:00`));
}

function expires(endAt) {
  return Timestamp.fromMillis(endAt.toMillis() + 180 * 24 * 60 * 60 * 1000);
}
