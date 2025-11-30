// Soroban + Stellar SDK helper (browser)

const SOROBAN_CONFIG = {
  CONTRACT_ID: "CACQ43FUQT5RKIM5ALUEJ2RD63G6P7VAMN67JZZAXUWXHLAUMPAGHV5T",
  RPC_URL: "https://soroban-testnet.stellar.org",
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  ENABLE_SERVICE_FEE: false,
  SERVICE_FEE_DEST: "GAFFDFIPDOJMYC4AHXUHMHXYPKB3T6GJ2I4JCFGQHQX3DFJVT4TGNNBB",
  SERVICE_FEE_AMOUNT: "1",
};

// Yerel dosya eski olabilir; bu yüzden önce CDN 14.3.3, en sona yerel
const SDK_FALLBACKS = [
  "https://cdn.jsdelivr.net/npm/@stellar/stellar-sdk@14.3.3/dist/stellar-sdk.min.js",
  "https://unpkg.com/@stellar/stellar-sdk@14.3.3/dist/stellar-sdk.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/stellar-sdk/14.3.3/stellar-sdk.min.js",
  "/static/js/stellar-sdk.min.js",
];

let sdkPromise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("SDK load failed: " + src));
    document.head.appendChild(s);
  });
}

async function ensureSdk() {
  if (window.StellarSdk && window.StellarSdk.SorobanRpc) return window.StellarSdk;
  if (!sdkPromise) {
    sdkPromise = (async () => {
      for (const url of SDK_FALLBACKS) {
        try {
          await loadScript(url);
          if (window.StellarSdk && window.StellarSdk.SorobanRpc) return window.StellarSdk;
        } catch (e) {
          console.warn(e.message);
        }
      }
      throw new Error("StellarSdk/SorobanRpc yüklenemedi (yerel dosya veya CDN erişilemedi).");
    })();
  }
  return sdkPromise;
}

let sorobanServer = null;
async function getSorobanServer() {
  const SDK = await ensureSdk();
  if (!sorobanServer) {
    sorobanServer = new SDK.SorobanRpc.Server(SOROBAN_CONFIG.RPC_URL, { allowHttp: false });
  }
  return sorobanServer;
}

function hexToBytes(hex) {
  if (!hex) return new Uint8Array();
  const clean = hex.replace(/^0x/i, "").trim();
  if (clean.length % 2 !== 0) throw new Error("Hex uzunluğu çift olmalı");
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    arr[i / 2] = parseInt(clean.substr(i, 2), 16);
  }
  return arr;
}

// SCVal yardımcıları (nativeToScVal kullanarak union hatalarını önler)
function scBytesVal(SDK, hex) {
  return SDK.nativeToScVal(hexToBytes(hex), { type: "bytes" });
}
function scStrBytesVal(SDK, str) {
  return SDK.nativeToScVal(new TextEncoder().encode(str || ""), { type: "bytes" });
}
function scU32Val(SDK, n) {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
    throw new Error("scU32 için geçersiz değer: " + n);
  }
  return SDK.nativeToScVal(n >>> 0, { type: "u32" });
}
function scAddressVal(SDK, addr) {
  return new SDK.Address(addr).toScVal();
}
function scVecAddressVal(SDK, addrs) {
  const addrObjs = (addrs || []).map((a) => new SDK.Address(a));
  return SDK.nativeToScVal(addrObjs, { type: "array" });
}

async function pollTransaction(hash, maxTries = 20, delayMs = 1500) {
  const server = await getSorobanServer();
  for (let i = 0; i < maxTries; i++) {
    const res = await server.getTransaction(hash);
    if (res.status === "SUCCESS") return res;
    if (res.status === "FAILED") throw new Error("Transaction failed. RPC loglarını kontrol edin.");
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Transaction timeout");
}

// simulate -> prepare -> sign (Freighter) -> send
async function submitSealTransaction(payload, signerPubKey) {
  if (!window.freighterApi) throw new Error("Freighter tarayıcı uzantısı bulunamadı.");
  const SDK = await ensureSdk();
  const server = await getSorobanServer();

  const account = await server.getAccount(signerPubKey);
  const opCount = 1 + (SOROBAN_CONFIG.ENABLE_SERVICE_FEE ? 1 : 0);
  const fee = (opCount * Number(SDK.BASE_FEE)).toString();

  const contract = new SDK.Contract(SOROBAN_CONFIG.CONTRACT_ID);
  let builder = new SDK.TransactionBuilder(account, {
    fee,
    networkPassphrase: SOROBAN_CONFIG.NETWORK_PASSPHRASE,
  });

  if (
    SOROBAN_CONFIG.ENABLE_SERVICE_FEE &&
    SOROBAN_CONFIG.SERVICE_FEE_DEST &&
    SOROBAN_CONFIG.SERVICE_FEE_DEST.startsWith("G")
  ) {
    builder = builder.addOperation(
      SDK.Operation.payment({
        destination: SOROBAN_CONFIG.SERVICE_FEE_DEST,
        asset: SDK.Asset.native(),
        amount: SOROBAN_CONFIG.SERVICE_FEE_AMOUNT || "1",
      })
    );
  }

  builder = builder.addOperation(
    contract.call(
      "seal_document",
      scBytesVal(SDK, payload.doc_hash),
      scBytesVal(SDK, payload.signature || payload.doc_hash),
      scAddressVal(SDK, payload.signer),
      scStrBytesVal(SDK, payload.doc_type || "document"),
      scU32Val(SDK, payload.signer_type || 1),
      scBytesVal(SDK, payload.vc_hash),
      scStrBytesVal(SDK, payload.business_id || ""),
      scStrBytesVal(SDK, payload.student_name_b64 || ""),
      scVecAddressVal(SDK, payload.allowed_signers || []),
      scU32Val(SDK, payload.max_signers)
    )
  );

  let tx = builder.setTimeout(180).build();

  const sim = await server.simulateTransaction(tx);
  if (sim.error) {
    throw new Error("Simulation failed: " + JSON.stringify(sim.error));
  }

  tx = await server.prepareTransaction(tx, sim);

  const unsignedXdr =
    (tx && typeof tx.toEnvelope === "function" && tx.toEnvelope().toXDR("base64")) ||
    (tx && typeof tx.toXDR === "function" && tx.toXDR("base64"));

  if (!unsignedXdr) {
    throw new Error("Transaction XDR üretilemedi.");
  }

  const signRes = await window.freighterApi.signTransaction(
    unsignedXdr,
    {
      networkPassphrase: SOROBAN_CONFIG.NETWORK_PASSPHRASE,
      accountToSign: signerPubKey,
    },
    { address: signerPubKey, network: SOROBAN_CONFIG.NETWORK_PASSPHRASE }
  );

  const signedXdr =
    typeof signRes === "string"
      ? signRes
      : signRes?.signedTxXdr || signRes?.signedXdr || signRes?.xdr || signRes?.transaction;

  if (!signedXdr || typeof signedXdr !== "string") {
    throw new Error("Freighter beklenmeyen imza yanıtı: " + JSON.stringify(signRes));
  }

  const signedTx = SDK.TransactionBuilder.fromXDR(signedXdr, SOROBAN_CONFIG.NETWORK_PASSPHRASE);
  const sendRes = await server.sendTransaction(signedTx);

  if (sendRes.errorResultXdr || sendRes.status === "FAILED") {
    throw new Error("Send failed: " + JSON.stringify(sendRes));
  }

  const finalRes = await pollTransaction(sendRes.hash);
  if (finalRes.status !== "SUCCESS") {
    throw new Error("Transaction failed: " + JSON.stringify(finalRes));
  }

  return { sendRes, finalRes };
}

// Zincirde bu doc_hash için kayıt var mı? (readonly simulate)
async function checkHasDocument(docHash, signerPubKey) {
  const SDK = await ensureSdk();
  const server = await getSorobanServer();
  const account = await server.getAccount(signerPubKey);
  const contract = new SDK.Contract(SOROBAN_CONFIG.CONTRACT_ID);
  const fee = SDK.BASE_FEE.toString();

  let tx = new SDK.TransactionBuilder(account, {
    fee,
    networkPassphrase: SOROBAN_CONFIG.NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("has_document", scBytesVal(SDK, docHash)))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (sim.error || !sim.result || !sim.result.retval) {
    return null;
  }
  try {
    return SDK.scValToNative(sim.result.retval);
  } catch (e) {
    console.warn("checkHasDocument decode error:", e);
    return null;
  }
}

window.checkHasDocument = checkHasDocument;
