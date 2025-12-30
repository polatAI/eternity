async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeHexSignature(signature) {
  if (!signature || typeof signature !== "string") return "";
  let hex = signature.trim().toLowerCase();
  if (hex.match(/^[a-f0-9]+$/i)) return hex;
  try {
    const bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    return "";
  }
}

const contractIdEl = document.getElementById("contractId");
if (contractIdEl && window.SOROBAN_CONFIG?.CONTRACT_ID) {
  contractIdEl.textContent = window.SOROBAN_CONFIG.CONTRACT_ID;
}

const rpcUrlEl = document.getElementById("rpcUrl");
if (rpcUrlEl && window.SOROBAN_CONFIG?.RPC_URL) {
  rpcUrlEl.textContent = window.SOROBAN_CONFIG.RPC_URL;
}

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

const fileInput = document.getElementById("fileInput");
if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    document.getElementById("fileLabel").innerText = file ? file.name : "Bir dosya seç veya sürükle";
  });
}

async function sealDocument() {
  const file = document.getElementById("fileInput").files[0];
  if (!file) return alert("Lütfen bir dosya seçin.");

  if (!window.connectedPublicKey) {
    return alert("Önce Freighter cüzdanınızı bağlayın.");
  }

  const resultBox = document.getElementById("sealResult");
  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `<div>Dosya hashleniyor ve zincire mühürleme hazırlanıyor...</div>`;

  try {
    const fileBuffer = await file.arrayBuffer();
    const certHash = await sha256Hex(fileBuffer);

    const docType = document.getElementById("docType").value || "certificate";
    const notes = (document.getElementById("vcInput")?.value || "").trim();
    const businessId = (document.getElementById("businessId")?.value || "eternity-seal").trim();
    const studentName = (document.getElementById("studentName")?.value || "").trim();

    if (!studentName) {
      throw new Error("Öğrenci / alıcı adı zorunludur.");
    }

    let signatureHex = certHash;
    try {
      if (window.freighterApi?.signMessage) {
        const sig = await window.freighterApi.signMessage(certHash);
        signatureHex = normalizeHexSignature(sig) || certHash;
      } else if (window.freighterApi?.sign) {
        const sig = await window.freighterApi.sign(certHash);
        signatureHex = normalizeHexSignature(sig) || certHash;
      }
    } catch (err) {
      console.warn("İmza alınamadı, sertifika hash'i kullanılacak.");
      signatureHex = certHash;
    }

    const payload = {
      doc_hash: certHash,
      doc_type: docType,
      student_name: studentName,
      business_id: businessId,
      notes,
    };

    const chainRes = await submitSealTransaction(payload, window.connectedPublicKey);
    const txHash = chainRes?.sendRes?.hash || "";
    const explorerBase = "https://stellar.expert/explorer/testnet";
    const txUrl = txHash ? `${explorerBase}/tx/${txHash}` : "";
    const contractUrl = window.SOROBAN_CONFIG?.CONTRACT_ID
      ? `${explorerBase}/contract/${window.SOROBAN_CONFIG.CONTRACT_ID}`
      : "";

    resultBox.innerHTML = `
      <div style="color: #4ade80;">
        <strong>Zincir üstü mühürleme tamamlandı.</strong><br>
        Hash: <code>${certHash.substring(0, 16)}...</code><br>
        İmzalayan: <code>${shortAddr(window.connectedPublicKey)}</code><br>
      </div>
      <div class="hash-actions">
        ${txUrl ? `<a href="${txUrl}" target="_blank" rel="noopener">İşlemi görüntüle</a>` : ""}
        ${contractUrl ? `<a href="${contractUrl}" target="_blank" rel="noopener">Sözleşmeyi görüntüle</a>` : ""}
      </div>
      <div style="margin-top: 12px;">
        <button type="button" class="ghost-btn small" onclick="navigator.clipboard.writeText('${certHash}')">
          Hash kopyala
        </button>
        ${txHash ? `<button type="button" class="ghost-btn small" onclick="navigator.clipboard.writeText('${txHash}')">Tx hash kopyala</button>` : ""}
      </div>
    `;

    try {
      await fetch("/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cert_hash: certHash,
          signature: signatureHex,
          signer: window.connectedPublicKey,
          cert_data: {
            file_name: file.name,
            file_size: file.size,
            business_id: businessId,
            student_name: studentName,
            created_at: new Date().toISOString(),
            doc_type: docType,
            notes,
            on_chain_tx: txHash,
            contract_id: window.SOROBAN_CONFIG?.CONTRACT_ID || "",
          },
        }),
      });
    } catch (err) {
      console.warn("Arka uç kayıt başarısız:", err);
    }
  } catch (err) {
    console.error("Seal error:", err);
    resultBox.innerHTML = `
      <div style="color:#ff8a8a">
        <strong>Hata:</strong> ${err.message}<br>
        <small>Freighter cüzdanınız Testnet'te bağlı ve fonlanmış olmalı.</small>
      </div>
    `;
  }
}
