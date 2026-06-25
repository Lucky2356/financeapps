// Verifies a Tauri updater signature (.sig) against the public key baked into
// src-tauri/tauri.conf.json — the SAME key installed clients use to verify
// updates. Run in the release workflow BEFORE publishing: if it fails, the new
// build is NOT verifiable by existing installs and must not be released.
//
// Pure Node (no minisign binary): minisign = Ed25519 over BLAKE2b-512 of the file.
//
// Usage: node scripts/verify-updater-signature.mjs <file> <file.sig> [pubkeyB64]

import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";

function fail(msg) {
  console.error(`✗ updater signature: ${msg}`);
  process.exit(1);
}

function minisignBlock(text) {
  // A minisign file is: "comment line\n<base64 payload>\n...". Return the first
  // base64 payload (line 2) decoded to bytes.
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) fail("malformed minisign block");
  return Buffer.from(lines[1], "base64");
}

function ed25519KeyFromRaw(raw32) {
  // Wrap a raw 32-byte Ed25519 public key in an SPKI DER envelope.
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({
    key: Buffer.concat([prefix, raw32]),
    format: "der",
    type: "spki"
  });
}

const [, , filePath, sigPath, pubkeyArg] = process.argv;
if (!filePath || !sigPath) fail("usage: <file> <file.sig> [pubkeyB64]");

// Public key: from arg or from tauri.conf.json.
let pubkeyB64 = pubkeyArg;
if (!pubkeyB64) {
  const conf = JSON.parse(
    readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")
  );
  pubkeyB64 = conf?.plugins?.updater?.pubkey;
}
if (!pubkeyB64) fail("no public key found");

const pub = minisignBlock(Buffer.from(pubkeyB64, "base64").toString("utf8"));
// pubkey payload: 2-byte alg + 8-byte keyId + 32-byte ed25519 key
const pubKeyId = pub.subarray(2, 10);
const pubKey = ed25519KeyFromRaw(pub.subarray(10, 42));

// Signature: the tauri .sig file content is base64 of a minisign signature file.
const sigFileText = Buffer.from(readFileSync(sigPath, "utf8"), "base64").toString("utf8");
const sig = minisignBlock(sigFileText);
const sigAlg = sig.subarray(0, 2).toString("utf8"); // "ED" = prehashed, "Ed" = legacy
const sigKeyId = sig.subarray(2, 10);
const signature = sig.subarray(10, 74);

if (!pubKeyId.equals(sigKeyId)) {
  fail(
    `key id mismatch — signature ${sigKeyId.toString("hex")} vs baked pubkey ${pubKeyId.toString("hex")}. ` +
      `Installed clients CANNOT verify this build.`
  );
}

const fileBytes = readFileSync(filePath);
const message = sigAlg === "ED" ? createHash("blake2b512").update(fileBytes).digest() : fileBytes;

if (!verify(null, message, pubKey, signature)) {
  fail("Ed25519 verification failed — installed clients cannot verify this build.");
}

console.log(
  `✓ updater signature verifies against baked pubkey (key id ${pubKeyId.toString("hex")}). ` +
    `Existing installs can auto-update to this build.`
);
