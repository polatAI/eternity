function setVerifyMode(mode, self) {
  document.getElementById("verifyMode").value = mode;

  document.querySelectorAll(".section-card").forEach((c) => c.classList.remove("active"));
  self.classList.add("active");

  renderFields();
}

async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function renderFields() {
  const mode = document.getElementById("verifyMode").value;
  const box = document.getElementById("dynamicFields");
  let html = "";

  if (mode === "by_hash") {
    html = `
      <div class="input-group">
        <label>Belge Hash'i</label>
        <input id="certHash" type="text" placeholder="Dosyanızın SHA-256 hash'i">
        <small class="hint">Ya da dosya sürükleyip otomatik hashleyin</small>
      </div>
      <label class="file-drop" for="certFile"><span id="certFileLabel">Dosya sürükle veya tıkla</span></label>
      <input id="certFile" type="file" hidden>
    `;
  } else if (mode === "by_signer") {
    html = `
      <div class="input-group">
        <label>İmzalayan Adres</label>
        <input id="signerAddress" type="text" placeholder="G... (Stellar adresi)">
        <small class="hint">Arka uç indeksini kullanır (zincir dışı).</small>
      </div>
    `;
  }

  box.innerHTML = html;

  const f = document.getElementById("certFile");
  if (f) {
    f.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById("certFileLabel").innerText = file.name;
        const buf = await file.arrayBuffer();
        const hash = await sha256Hex(buf);
        document.getElementById("certHash").value = hash;
      }
    });
  }
}

renderFields();

function formatUnixTime(seconds) {
  if (!seconds) return "Bilinmiyor";
  return new Date(Number(seconds) * 1000).toLocaleString();
}

async function runVerify() {
  const mode = document.getElementById("verifyMode").value;
  const resultBox = document.getElementById("verifyResult");
  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `<div>Belge aranıyor...</div>`;

  try {
    let payload = {};

    if (mode === "by_hash") {
      const hash = document.getElementById("certHash").value.trim();
      if (!hash || hash.length !== 64) {
        throw new Error("Geçersiz belge hash'i (64 hex karakter olmalı)");
      }
      if (!window.connectedPublicKey) {
        throw new Error("Zincir üstü kayıtları sorgulamak için Freighter cüzdanınızı bağlayın.");
      }
      payload = { cert_hash: hash };
    } else if (mode === "by_signer") {
      const signer = document.getElementById("signerAddress").value.trim();
      if (!signer || !signer.startsWith("G") || signer.length !== 56) {
        throw new Error("Geçersiz Stellar adresi");
      }
      payload = { signer };
    } else {
      throw new Error("Geçersiz mod");
    }

    if (mode === "by_hash") {
      const records = await window.getDocumentsForHash(payload.cert_hash, window.connectedPublicKey);
      if (!records || records.length === 0) {
        throw new Error("Bu hash için zincir üstü kayıt bulunamadı.");
      }

      const explorerBase = "https://stellar.expert/explorer/testnet";
      const contractUrl = window.SOROBAN_CONFIG?.CONTRACT_ID
        ? `${explorerBase}/contract/${window.SOROBAN_CONFIG.CONTRACT_ID}`
        : "";

      let html = `
        <div class="cert-card">
          <h3>Zincir Üstü Kayıtlar</h3>
          <div class="cert-info">
            <div class="cert-row">
              <span class="label">Belge Hash'i:</span>
              <span class="value"><code>${payload.cert_hash.substring(0, 16)}...${payload.cert_hash.substring(48)}</code></span>
            </div>
            <div class="cert-row">
              <span class="label">Kayıt sayısı:</span>
              <span class="value">${records.length}</span>
            </div>
            ${contractUrl ? `
            <div class="cert-row">
              <span class="label">Sözleşme:</span>
              <span class="value"><a href="${contractUrl}" target="_blank" rel="noopener">Stellar Expert'te görüntüle</a></span>
            </div>
            ` : ""}
          </div>
        </div>
      `;

      records.forEach((record, i) => {
        html += `
          <div class="cert-item">
            <div class="cert-header">
              <span class="cert-number">#${i + 1}</span>
              <span class="cert-time">${formatUnixTime(record.timestamp)}</span>
            </div>
            <div class="cert-row">
              <span class="label">Belge Tipi:</span>
              <span class="value">${record.doc_type || "belge"}</span>
            </div>
            ${record.business_id ? `
            <div class="cert-row">
              <span class="label">Kurum ID:</span>
              <span class="value">${record.business_id}</span>
            </div>
            ` : ""}
            ${record.student_name ? `
            <div class="cert-row">
              <span class="label">Öğrenci:</span>
              <span class="value">${record.student_name}</span>
            </div>
            ` : ""}
            ${record.notes ? `
            <div class="cert-row">
              <span class="label">Notlar:</span>
              <span class="value">${record.notes}</span>
            </div>
            ` : ""}
            <div class="cert-btn-group">
              <button class="ghost-btn small" onclick="navigator.clipboard.writeText('${record.doc_hash}')">
                Hash kopyala
              </button>
            </div>
          </div>
        `;
      });

      resultBox.innerHTML = html;
      return;
    }

    const res = await fetch("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Belge bulunamadı");
    }

    const certs = data.certificates || [];
    if (certs.length === 0) {
      resultBox.innerHTML = `<div style="color: #fbbf24;">Bu imzalayan için indeksli belge bulunamadı.</div>`;
      return;
    }

    let html = `
      <div class="cert-list">
        <h3>İndeksli belgeler: ${data.signer.substring(0, 20)}...</h3>
        <p class="muted">Toplam: ${data.count} belge - zincir dışı indeks</p>
    `;

    certs.forEach((cert, i) => {
      html += `
        <div class="cert-item">
          <div class="cert-header">
            <span class="cert-number">#${i + 1}</span>
            <span class="cert-time">${new Date(cert.timestamp * 1000).toLocaleString()}</span>
          </div>
          <div class="cert-hash">
            <code>${cert.cert_hash.substring(0, 24)}...${cert.cert_hash.substring(56)}</code>
          </div>
          <div class="cert-btn-group">
            <button class="ghost-btn small" onclick="navigator.clipboard.writeText('${cert.cert_hash}')">
              Hash kopyala
            </button>
            <button class="ghost-btn small" onclick="verifyCertByHash('${cert.cert_hash}')">
              Zincir üstünde görüntüle
            </button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    resultBox.innerHTML = html;
  } catch (err) {
    console.error("Verify error:", err);
    resultBox.innerHTML = `
      <div style="color: #ff8a8a;">
        <strong>Hata:</strong> ${err.message}
      </div>
    `;
  }
}

function verifyCertByHash(hash) {
  document.getElementById("verifyMode").value = "by_hash";
  renderFields();
  document.getElementById("certHash").value = hash;
  document.querySelectorAll(".section-card").forEach((c) => c.classList.remove("active"));
  document.querySelectorAll(".section-card")[0].classList.add("active");
  setTimeout(() => runVerify(), 100);
}

const contractIdEl = document.getElementById("contractId");
if (contractIdEl && window.SOROBAN_CONFIG?.CONTRACT_ID) {
  contractIdEl.textContent = window.SOROBAN_CONFIG.CONTRACT_ID;
}

const rpcUrlEl = document.getElementById("rpcUrl");
if (rpcUrlEl && window.SOROBAN_CONFIG?.RPC_URL) {
  rpcUrlEl.textContent = window.SOROBAN_CONFIG.RPC_URL;
}
