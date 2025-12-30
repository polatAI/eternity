// Soroban + Stellar SDK helper (browser)

const SOROBAN_CONFIG = {
  CONTRACT_ID: "CA2TXD7QNQHYBCRRJ6UDW4RDINTSQIMP5BMIOJWYZTRSGQATLVWTB3EZ",
  RPC_URL: "https://soroban-testnet.stellar.org",
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  ENABLE_SERVICE_FEE: false,
  SERVICE_FEE_DEST: "GAFFDFIPDOJMYC4AHXUHMHXYPKB3T6GJ2I4JCFGQHQX3DFJVT4TGNNBB",
  SERVICE_FEE_AMOUNT: "1",
};

window.SOROBAN_CONFIG = SOROBAN_CONFIG;

const SDK_FALLBACKS = [
  "/static/js/stellar-sdk.min.js?v=1443",
  "https://cdn.jsdelivr.net/npm/@stellar/stellar-sdk@14.4.3/dist/stellar-sdk.min.js",
  "https://unpkg.com/@stellar/stellar-sdk@14.4.3/dist/stellar-sdk.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/stellar-sdk/14.4.3/stellar-sdk.min.js",
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

function getRpcNamespace(SDK) {
  return SDK?.SorobanRpc || SDK?.rpc || SDK?.Rpc;
}

function hasRpc(SDK) {
  const rpc = getRpcNamespace(SDK);
  return Boolean((rpc && rpc.Server) || SDK?.RpcServer);
}

async function ensureSdk() {
  if (window.StellarSdk && hasRpc(window.StellarSdk)) return window.StellarSdk;
  if (!sdkPromise) {
    sdkPromise = (async () => {
      for (const url of SDK_FALLBACKS) {
        try {
          await loadScript(url);
          if (window.StellarSdk && hasRpc(window.StellarSdk)) return window.StellarSdk;
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
    const rpc = getRpcNamespace(SDK);
    if (rpc?.Server) {
      sorobanServer = new rpc.Server(SOROBAN_CONFIG.RPC_URL, { allowHttp: false });
    } else if (SDK.RpcServer) {
      sorobanServer = new SDK.RpcServer(SOROBAN_CONFIG.RPC_URL, { allowHttp: false });
    } else {
      throw new Error("Soroban RPC sınıfı bulunamadı.");
    }
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

function bytesToHex(bytes) {
  return [...(bytes || [])].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function scBytesVal(SDK, hex) {
  return SDK.nativeToScVal(hexToBytes(hex), { type: "bytes" });
}

function scStringVal(SDK, str) {
  return SDK.nativeToScVal(str || "", { type: "string" });
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
  if (!window.freighterApi && !window.freighter && !window.Freighter) {
    throw new Error("Freighter tarayıcı uzantısı bulunamadı.");
  }
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
      scStringVal(SDK, payload.doc_type || "document"),
      scStringVal(SDK, payload.student_name || ""),
      scStringVal(SDK, payload.business_id || ""),
      scStringVal(SDK, payload.notes || "")
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

  const freighter = window.freighterApi || window.freighter || window.Freighter;
  const signRes = await freighter.signTransaction(
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

async function getDocumentsForHash(docHash, signerPubKey) {
  const SDK = await ensureSdk();
  const server = await getSorobanServer();
  const account = await server.getAccount(signerPubKey);
  const contract = new SDK.Contract(SOROBAN_CONFIG.CONTRACT_ID);
  const fee = SDK.BASE_FEE.toString();

  let tx = new SDK.TransactionBuilder(account, {
    fee,
    networkPassphrase: SOROBAN_CONFIG.NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get_documents", scBytesVal(SDK, docHash)))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (sim.error || !sim.result || !sim.result.retval) {
    return [];
  }

  try {
    const records = SDK.scValToNative(sim.result.retval) || [];
    return records.map((r) => ({
      doc_hash: r?.doc_hash ? bytesToHex(r.doc_hash) : "",
      doc_type: r?.doc_type || "",
      student_name: r?.student_name || "",
      business_id: r?.business_id || "",
      notes: r?.notes || "",
      timestamp: typeof r?.timestamp === "bigint" ? Number(r.timestamp) : r?.timestamp,
    }));
  } catch (e) {
    console.warn("getDocumentsForHash decode error:", e);
    return [];
  }
}

window.checkHasDocument = checkHasDocument;
window.getDocumentsForHash = getDocumentsForHash;
window.submitSealTransaction = submitSealTransaction;

// UI Fixes: Logo size and navbar adjustments
document.addEventListener("DOMContentLoaded", () => {
  const logoContainer = document.querySelector(".nav-logo");
  const logoImg = document.querySelector(".logo-img");

  if (logoContainer) {
    logoContainer.style.height = "60px";
    logoContainer.style.width = "auto";
    logoContainer.style.overflow = "visible";
    logoContainer.style.position = "relative";
    logoContainer.style.zIndex = "2000";
  }

  if (logoImg) {
    logoImg.style.height = "150px";
    logoImg.style.width = "auto";
    logoImg.style.maxHeight = "unset";
  }

  if (!logoContainer && !logoImg) {
    const imgs = document.querySelectorAll("img");
    imgs.forEach((img) => {
      if ((img.src && img.src.toLowerCase().includes("logo")) || (img.alt && img.alt.toLowerCase().includes("logo"))) {
        img.style.height = "150px";
        img.style.width = "auto";
        img.style.maxHeight = "unset";
        if (img.parentElement) {
          img.parentElement.style.height = "60px";
          img.parentElement.style.overflow = "visible";
          img.parentElement.style.zIndex = "2000";
          img.parentElement.style.position = "relative";
        }
      }
    });
  }
});
