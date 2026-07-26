const { Client } = require("firebase-tools/lib/apiv2");
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const auth = require("firebase-tools/lib/auth");

async function authenticatedClients(projectId) {
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error("Entre no Firebase CLI antes de executar esta manutenção.");
  await requireAuth({ project: projectId, user: account.user, tokens: account.tokens });
  return {
    firestore: new Client({ urlPrefix: "https://firestore.googleapis.com", apiVersion: "v1" }),
    identity: new Client({ urlPrefix: "https://identitytoolkit.googleapis.com", apiVersion: "v1" }),
  };
}

async function listDocuments(client, projectId, collectionId) {
  const documents = [];
  let pageToken;
  do {
    const response = await client.get(
      `/projects/${projectId}/databases/(default)/documents/${collectionId}`,
      { queryParams: { pageSize: 1000, ...(pageToken ? { pageToken } : {}) } },
    );
    documents.push(...(response.body.documents || []));
    pageToken = response.body.nextPageToken;
  } while (pageToken);
  return documents;
}

module.exports = { authenticatedClients, listDocuments };
