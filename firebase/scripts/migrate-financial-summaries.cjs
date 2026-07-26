const { authenticatedClients, listDocuments } = require("./firebase-cli-auth.cjs");

const projectId = process.argv[2];
if (!projectId) {
  console.error("Informe o ID do projeto.");
  process.exit(1);
}

function emptySummary() {
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

function integer(field) {
  return Number(field?.integerValue || 0);
}

function addBooking(summary, fields) {
  const payment = fields.paymentMethod?.stringValue;
  let status = fields.status?.stringValue;
  if (status === "no_show") status = "cancelled";
  if (status === "completed" && !["pix", "cash", "card"].includes(payment)) status = "pending";
  const price = integer(fields.priceCentsSnapshot);
  if (status === "completed") {
    summary.completedRevenueCents += price;
    summary.completedAppointments += 1;
    if (payment === "pix") summary.pixRevenueCents += price;
    if (payment === "cash") summary.cashRevenueCents += price;
    if (payment === "card") summary.cardRevenueCents += price;
  }
  if (status === "confirmed") {
    summary.expectedRevenueCents += price;
    summary.confirmedAppointments += 1;
  }
  if (status === "cancelled") summary.cancelledAppointments += 1;
}

function firestoreFields(summary) {
  const fields = Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [key, { integerValue: String(value) }]),
  );
  fields.updatedAt = { timestampValue: new Date().toISOString() };
  return fields;
}

async function main() {
  const { firestore } = await authenticatedClients(projectId);
  const [bookings, existingSummaries] = await Promise.all([
    listDocuments(firestore, projectId, "bookings"),
    listDocuments(firestore, projectId, "financialSummaries"),
  ]);
  const summaries = new Map();
  existingSummaries.forEach(document => summaries.set(document.name.split("/").pop(), emptySummary()));
  for (const booking of bookings) {
    const dateKey = booking.fields?.dateKey?.stringValue;
    if (!dateKey || dateKey.length < 7) continue;
    const month = dateKey.slice(0, 7);
    if (!summaries.has(month)) summaries.set(month, emptySummary());
    addBooking(summaries.get(month), booking.fields || {});
  }
  for (const [month, summary] of summaries) {
    await firestore.patch(
      `/projects/${projectId}/databases/(default)/documents/financialSummaries/${month}`,
      { fields: firestoreFields(summary) },
    );
  }
  console.log(`Resumos migrados: ${summaries.size} mês(es), ${bookings.length} agendamento(s) processado(s).`);
}

main().catch(reason => {
  console.error(reason instanceof Error ? reason.message : reason);
  process.exit(1);
});
