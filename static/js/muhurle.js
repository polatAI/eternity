const docTypeHints = {
  certificate: "Seal the certificate with student name, VC hash, and business info.",
  diploma: "Diploma requires student name and VC hash.",
  transcript: "Transcripts require student name and VC hash.",
  vc: "Directly seal a Verifiable Credential hash.",
  institution_doc: "Institution documents use business ID and authorized signers.",
};

async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function onDocTypeChange() {
  const type = document.getElementById("docType").value;
  document.getElementById("docTypeHint").innerText = docTypeHints[type] || "";
  renderDynamicFields(type);
}

// Dynamic fields
function renderDynamicFields(docType) {
  const container = document.getElementById("dynamicFields");
  let html = `
    <div class="input-group">
      <label>First seal (institution)</label>
      <label class="checkbox-inline">
        <input id="firstSeal" type="checkbox" checked onchange="toggleFirstSeal()">
        <span>This is the first (institution) seal for this document</span>
      </label>
      <small class="hint">First seal must be done by the institution and student name is required.</small>
    </div>
    <div class="input-group">
      <label>Signer type</label>
      <select id="signerType" class="modern-select">
        <option value="1">Business / Institution</option>
        <option value="0">Student / User</option>
      </select>
      <small class="hint">First seal automatically uses business (1).</small>
    </div>
  `;

  if (["certificate", "diploma", "transcript"].includes(docType)) {
    html += `
      <div class="input-group">
        <label>Student full name</label>
        <input id="studentName" type="text" placeholder="e.g., John Doe">
      </div>
    `;
  }

  html += `
    <div class="input-group">
      <label>VC Content (JSON / Text)</label>
      <textarea id="vcInput" placeholder='{ "course": "Blockchain", "status": "completed" }'></textarea>
      <small class="hint">The SHA-256 of this text is sent as <strong>vc_hash</strong>.</small>
    </div>
  `;

  if (["certificate", "diploma", "transcript", "institution_doc"].includes(docType)) {
    html += `
      <div class="input-group">
        <label>Business ID / Hash</label>
        <input id="businessId" type="text" placeholder="e.g., metaverse-academy-01">
      </div>
    `;
  }

  html += `
    <div class="input-group">
      <label>Allowed Signers (Public Key List)</label>
      <textarea id="allowedSigners" placeholder="One Stellar address per line"></textarea>
      <small class="hint">Required for the first seal. Ignored for later seals.</small>
    </div>

    <div class="input-group">
      <label>Max signers</label>
      <input id="maxSigners" type="number" min="1" max="10" value="2">
    </div>
  `;

  container.innerHTML = html;
  toggleFirstSeal();
}

function toggleFirstSeal() {
  const isFirst = document.getElementById("firstSeal")?.checked;
  const signerTypeSel = document.getElementById("signerType");
  if (!signerTypeSel) return;
  if (isFirst) {
    signerTypeSel.value = "1";
    signerTypeSel.disabled = true;
  } else {
    signerTypeSel.disabled = false;
  }
}

// File label
document.getElementById("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  document.getElementById("fileLabel").innerText = file ? file.name : "Choose or drag a file";
});

async function fetchMetadata(docHash) {
  try {
    const res = await fetch("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "metadata", doc_hash: docHash }),
    });
    const data = await res.json();
    if (data && data.ok && data.metadata) {
      return data.metadata;
    }
  } catch (e) {
    console.warn("Metadata fetch failed:", e);
  }
  return null;
}

// Submit form
async function sealDocument() {
  const docType = document.getElementById("docType").value;

  const file = document.getElementById("fileInput").files[0];
  if (!file) return alert("Please select a file.");

  if (!window.connectedPublicKey) {
    return alert("Wallet not connected. Please connect first.");
  }

  const vcText = document.getElementById("vcInput")?.value || "";
  const businessId = document.getElementById("businessId")?.value || "";
  const studentName = document.getElementById("studentName")?.value || "";
  const allowedSignersRaw = document.getElementById("allowedSigners")?.value || "";
  const maxSigners = Number(document.getElementById("maxSigners")?.value || 0);
  const signerTypeInput = Number(document.getElementById("signerType")?.value || 0);

  const allowedSigners = allowedSignersRaw
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  const invalidAddr = allowedSigners.find((a) => !a.startsWith("G") || a.length !== 56);
  if (invalidAddr) {
    return alert(`Invalid Stellar address: ${invalidAddr}`);
  }

  if (!allowedSigners.includes(window.connectedPublicKey)) {
    allowedSigners.push(window.connectedPublicKey);
  }

  const fileBuffer = await file.arrayBuffer();
  const docHash = await sha256Hex(fileBuffer);

  // Decide first/next seal based on user toggle (authoritative)
  const isFirstSeal = document.getElementById("firstSeal")?.checked;
  toggleFirstSeal();

  if (isFirstSeal) {
    if (!studentName) return alert("Student name is required for the first seal.");
    if (!allowedSigners.length) return alert("At least one allowed signer is required for the first seal.");
    if (!maxSigners || maxSigners < allowedSigners.length) {
      return alert(`Max signers (${maxSigners}) cannot be less than allowed signers (${allowedSigners.length}).`);
    }
  }

  const vcHash = await sha256Hex(new TextEncoder().encode(vcText || "vc-placeholder"));

  const studentNameB64 =
    isFirstSeal && studentName ? btoa(unescape(encodeURIComponent(studentName))) : "";

  const payload = {
    doc_hash: docHash,
    signature: docHash,
    signer: window.connectedPublicKey,
    doc_type: docType || "document",
    signer_type: isFirstSeal ? 1 : signerTypeInput,
    vc_hash: vcHash,
    business_id: businessId,
    student_name_b64: studentNameB64,
    allowed_signers: allowedSigners,
    max_signers: maxSigners,
  };

  const resultBox = document.getElementById("sealResult");

  try {
    const chainRes = await submitSealTransaction(payload, window.connectedPublicKey);
    const hash = chainRes.sendRes.hash;
    resultBox.classList.remove("hidden");
    resultBox.innerHTML = `
      <div><strong>Transaction Hash</strong></div>
      <div class="hash-line">${hash}</div>
      <div class="hash-actions">
        <a href="https://stellar.expert/explorer/testnet/tx/${hash}" target="_blank">Open in explorer</a>
        <button type="button" class="ghost-btn small" onclick="navigator.clipboard.writeText('${hash}')">Copy</button>
      </div>
    `;
    console.log("Seal chain response", chainRes);
  } catch (err) {
    console.error("Seal error", err);
    resultBox.classList.remove("hidden");
    resultBox.innerHTML = `<div style="color:#ff8a8a">Submit error: ${err.message}</div>`;
  }
}

// Initial render
onDocTypeChange();
