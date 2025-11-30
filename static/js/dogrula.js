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

  if (mode === "doc_verify") {
    html = `
      <div class="input-group">
        <label>Document file (optional)</label>
        <label class="file-drop" for="docFile"><span id="docFileLabel">Choose file</span></label>
        <input id="docFile" type="file" hidden>
      </div>

      <div class="input-group">
        <label>doc_hash</label>
        <input id="docHash" type="text">
      </div>
    `;
  } else if (mode === "records") {
    html = `
      <div class="input-group">
        <label>doc_hash</label>
        <input id="recordsDocHash" type="text">
      </div>
    `;
  } else if (mode === "metadata") {
    html = `
      <div class="input-group">
        <label>doc_hash</label>
        <input id="metaDocHash" type="text">
      </div>
    `;
  } else if (mode === "signer") {
    html = `
      <div class="input-group">
        <label>Signer (G...)</label>
        <input id="signerAddress" type="text">
      </div>
    `;
  } else if (mode === "vc") {
    html = `
      <div class="input-group">
        <label>VC Content</label>
        <textarea id="vcText"></textarea>
      </div>
    `;
  }

  box.innerHTML = html;

  const f = document.getElementById("docFile");
  if (f) {
    f.addEventListener("change", (e) => {
      const file = e.target.files[0];
      document.getElementById("docFileLabel").innerText = file ? file.name : "Choose file";
    });
  }
}

renderFields();

async function runVerify() {
  const mode = document.getElementById("verifyMode").value;
  const payload = { mode };

  if (mode === "doc_verify") {
    const file = document.getElementById("docFile")?.files[0];
    let hash = document.getElementById("docHash").value.trim();

    if (file) {
      const buf = await file.arrayBuffer();
      hash = await sha256Hex(buf);
    }

    payload.doc_hash = hash;
  }

  if (mode === "records") {
    payload.doc_hash = document.getElementById("recordsDocHash").value.trim();
  }

  if (mode === "metadata") {
    payload.doc_hash = document.getElementById("metaDocHash").value.trim();
  }

  if (mode === "signer") {
    payload.signer = document.getElementById("signerAddress").value.trim();
  }

  if (mode === "vc") {
    const vc = document.getElementById("vcText").value;
    payload.vc_hash = await sha256Hex(new TextEncoder().encode(vc));
  }

  const res = await fetch("/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  const box = document.getElementById("verifyResult");
  box.classList.remove("hidden");
  box.innerHTML = `
    <pre>${JSON.stringify(data, null, 2)}</pre>
  `;
}
