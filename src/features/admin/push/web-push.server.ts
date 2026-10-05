/**
 * Envoi de notifications Web Push (RFC 8030) avec chiffrement « aes128gcm » (RFC 8291)
 * et authentification VAPID (RFC 8292).
 *
 * Écrit uniquement avec WebCrypto pour fonctionner sur Cloudflare Workers, où la
 * bibliothèque `web-push` (basée sur les modules Node `https` et `crypto`) ne marche pas.
 */

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

export type VapidKeys = {
  /** Clé publique P-256 non compressée (65 octets), en base64url. */
  publicKey: string;
  /** Clé privée P-256 (32 octets), en base64url. */
  privateKey: string;
  /** Contact de l'expéditeur, ex. « mailto:contact@exemple.com ». */
  subject: string;
};

const encoder = new TextEncoder();

/** Octets adossés à un ArrayBuffer classique (ce qu'attend WebCrypto). */
type Bytes = Uint8Array<ArrayBuffer>;

export function base64UrlToBytes(value: string): Bytes {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Bytes[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hmac(key: Bytes, data: Bytes) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data));
}

/** JWK d'une clé P-256 à partir de sa clé publique brute (65 octets) et, si fournie, privée. */
function p256Jwk(publicRaw: Bytes, privateRaw?: Bytes): JsonWebKey {
  return {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(publicRaw.slice(1, 33)),
    y: bytesToBase64Url(publicRaw.slice(33, 65)),
    ...(privateRaw ? { d: bytesToBase64Url(privateRaw) } : {}),
    ext: true,
  };
}

/** Options internes, uniquement pour vérifier le chiffrement avec les vecteurs de test RFC. */
type EncryptOverrides = { salt?: Bytes; serverPublic?: Bytes; serverPrivate?: Bytes };

/** Chiffre `payload` pour un abonnement donné (RFC 8291, un seul enregistrement). */
export async function encryptPayload(
  payload: string,
  keys: { p256dh: string; auth: string },
  overrides: EncryptOverrides = {},
): Promise<Bytes> {
  const uaPublic = base64UrlToBytes(keys.p256dh);
  const authSecret = base64UrlToBytes(keys.auth);
  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));

  // Clé éphémère du serveur
  let asPrivateKey: CryptoKey;
  let asPublic: Bytes;
  if (overrides.serverPrivate && overrides.serverPublic) {
    asPublic = overrides.serverPublic;
    asPrivateKey = await crypto.subtle.importKey(
      "jwk",
      p256Jwk(asPublic, overrides.serverPrivate),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
  } else {
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    asPrivateKey = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  }

  const uaPublicKey = await crypto.subtle.importKey(
    "jwk",
    p256Jwk(uaPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, asPrivateKey, 256),
  );

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(
    encoder.encode("WebPush: info\0") as Bytes,
    uaPublic,
    asPublic,
    new Uint8Array([1]),
  );
  const ikm = (await hmac(prkKey, keyInfo)).slice(0, 32);

  // CEK et nonce dérivés du sel
  const prk = await hmac(salt, ikm);
  const cek = (
    await hmac(
      prk,
      concat(encoder.encode("Content-Encoding: aes128gcm\0") as Bytes, new Uint8Array([1])),
    )
  ).slice(0, 16);
  const nonce = (
    await hmac(
      prk,
      concat(encoder.encode("Content-Encoding: nonce\0") as Bytes, new Uint8Array([1])),
    )
  ).slice(0, 12);

  // Un seul enregistrement : contenu suivi du délimiteur 0x02
  const plaintext = concat(encoder.encode(payload) as Bytes, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext),
  );

  // En-tête : sel (16) | taille d'enregistrement (4, = 4096) | longueur de clé (1) | clé publique
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

/** En-tête Authorization VAPID pour le service push de `endpoint`. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys) {
  const publicRaw = base64UrlToBytes(vapid.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    p256Jwk(publicRaw, base64UrlToBytes(vapid.privateKey)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  // WebCrypto renvoie déjà la signature au format JOSE (r || s, 64 octets).
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${vapid.publicKey}`;
}

export type PushResult = { endpoint: string; ok: boolean; status: number; expired: boolean };

/** Envoie une notification ; `expired` indique un abonnement à supprimer (404 / 410). */
export async function sendPush(
  subscription: PushSubscriptionKeys,
  payload: unknown,
  vapid: VapidKeys,
  options: { ttlSeconds?: number; urgency?: "normal" | "high"; topic?: string } = {},
): Promise<PushResult> {
  const body = await encryptPayload(JSON.stringify(payload), subscription);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(options.ttlSeconds ?? 24 * 60 * 60),
      Urgency: options.urgency ?? "high",
      ...(options.topic ? { Topic: options.topic } : {}),
    },
    body,
  });
  return {
    endpoint: subscription.endpoint,
    ok: response.ok,
    status: response.status,
    expired: response.status === 404 || response.status === 410,
  };
}
