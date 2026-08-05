const { Client } = require("firebase-tools/lib/apiv2");
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const auth = require("firebase-tools/lib/auth");

const projectId = process.argv[2] || "barbearia-c9246";
if (projectId !== "barbearia-c9246") throw new Error("Projeto inesperado. A configuração foi interrompida.");

async function main() {
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error("Entre no Firebase CLI antes de configurar a autenticação.");
  await requireAuth({ project: projectId, user: account.user, tokens: account.tokens });
  const identity = new Client({
    urlPrefix: "https://identitytoolkit.googleapis.com",
    apiVersion: "admin/v2",
  });
  await identity.patch(`/projects/${projectId}/config`, {
    passwordPolicyConfig: {
      passwordPolicyEnforcementState: "ENFORCE",
      forceUpgradeOnSignin: false,
      passwordPolicyVersions: [{ customStrengthOptions: {
        containsUppercaseCharacter: true,
        containsLowercaseCharacter: true,
        containsNonAlphanumericCharacter: true,
        containsNumericCharacter: true,
        minPasswordLength: 12,
        maxPasswordLength: 128,
      } }],
    },
    mfa: {
      providerConfigs: [{
        state: "ENABLED",
        totpProviderConfig: { adjacentIntervals: 5 },
      }],
    },
  }, { queryParams: { updateMask: "passwordPolicyConfig,mfa" } });

  const response = await identity.get(`/projects/${projectId}/config`);
  const policy = response.body.passwordPolicyConfig;
  const totp = response.body.mfa?.providerConfigs?.find((provider) => provider.totpProviderConfig);
  const strength = policy?.passwordPolicyVersions?.[0]?.customStrengthOptions;
  if (policy?.passwordPolicyEnforcementState !== "ENFORCE" || strength?.minPasswordLength !== 12 || totp?.state !== "ENABLED") {
    throw new Error("A verificação da política de autenticação não corresponde ao esperado.");
  }
  console.log("Política de senha forte e TOTP MFA habilitados e verificados.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
