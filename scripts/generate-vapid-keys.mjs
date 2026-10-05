// Génère une paire de clés VAPID pour les notifications push de l'espace gérant.
// Usage : node scripts/generate-vapid-keys.mjs
// Copiez les valeurs dans les secrets de l'hébergement (jamais dans le dépôt git).
const toB64Url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const publicKey = toB64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
const webhookSecret = toB64Url(crypto.getRandomValues(new Uint8Array(24)));

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
console.log(`VAPID_SUBJECT=mailto:contact@exemple.com`);
console.log(`PUSH_WEBHOOK_SECRET=${webhookSecret}`);
