from __future__ import annotations

import base64
import re
import time
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# ------------------ Contract-aligned constants (lib.rs) ------------------ #
MAX_SEALS_PER_DOC_GLOBAL = 10
MIN_HASH_LEN_BYTES = 32
MAX_HASH_LEN_BYTES = 128
MAX_DOC_TYPE_LEN = 64
MAX_BUSINESS_ID_LEN = 64
MAX_STUDENT_NAME_B64_LEN = 128
ADDRESS_REGEX = re.compile(r"^G[A-Z0-9]{55}$")

# ------------------ In-memory demo stores ------------------ #
documents: Dict[str, List[Dict[str, Any]]] = {}
metadata_store: Dict[str, Dict[str, Any]] = {}


# ------------------ Helpers ------------------ #
def error(msg: str, code: int = 400) -> Tuple[Any, int]:
    return jsonify({"ok": False, "error": msg}), code


def is_hex(s: str) -> bool:
    try:
        int(s, 16)
        return len(s) % 2 == 0
    except ValueError:
        return False


def validate_hash(hex_str: str, name: str) -> Optional[str]:
    if not hex_str:
        return f"{name} cannot be empty"
    if not is_hex(hex_str):
        return f"{name} must be valid hex (even-length)"
    byte_len = len(hex_str) // 2
    if byte_len < MIN_HASH_LEN_BYTES or byte_len > MAX_HASH_LEN_BYTES:
        return f"{name} length invalid (byte: {byte_len}, expected: {MIN_HASH_LEN_BYTES}-{MAX_HASH_LEN_BYTES})"
    return None


def validate_address(addr: str, field: str) -> Optional[str]:
    if not ADDRESS_REGEX.match(addr):
        return f"{field} invalid Stellar address"
    return None


def base64_len_ok(b64_str: str) -> bool:
    try:
        decoded = base64.b64decode(b64_str.encode("utf-8"), validate=True)
        return 0 < len(decoded) <= MAX_STUDENT_NAME_B64_LEN
    except Exception:
        return False


# ------------------ Data models ------------------ #
@dataclass
class DocumentMetadata:
    allowed_signers: List[str]
    max_signers: int


@dataclass
class DocumentRecord:
    doc_hash: str
    signature: str
    signer: str
    doc_type: str
    timestamp: int
    signer_type: int
    vc_hash: str
    business_id: str
    student_name_b64: str


# ------------------ Pages ------------------ #
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/muhurle")
def muhurle():
    return render_template("muhurle.html")


@app.route("/dogrula")
def dogrula():
    return render_template("dogrula.html")


# ------------------ API ------------------ #
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/seal")
def seal_document():
    """
    Backend validations aligned with the contract's seal_document.
    No persistent DB; demo keeps data in memory.
    """
    payload = request.get_json(force=True, silent=True) or {}

    doc_hash = str(payload.get("doc_hash", "")).strip()
    signature = str(payload.get("signature", "")).strip()
    signer = str(payload.get("signer", "")).strip()
    doc_type = str(payload.get("doc_type", "")).strip()
    signer_type_raw = payload.get("signer_type", 0)
    vc_hash = str(payload.get("vc_hash", "")).strip()
    business_id = str(payload.get("business_id", "")).strip()
    student_name_b64 = str(payload.get("student_name_b64", "")).strip()
    allowed_signers = payload.get("allowed_signers") or []
    max_signers = payload.get("max_signers", 0)

    # signer_type int'e cevir
    try:
        signer_type = int(signer_type_raw)
    except Exception:
        return error("signer_type must be numeric", 400)

    # Temel hash/imza kontrolleri
    for field_name, hex_val in [
        ("doc_hash", doc_hash),
        ("signature", signature),
        ("vc_hash", vc_hash),
    ]:
        err = validate_hash(hex_val, field_name)
        if err:
            return error(err, 400)

    # Diger alan kontrolleri
    if not doc_type or len(doc_type.encode("utf-8")) > MAX_DOC_TYPE_LEN:
        return error(f"doc_type empty or length invalid (max {MAX_DOC_TYPE_LEN} bytes)", 400)

    if len(business_id.encode("utf-8")) > MAX_BUSINESS_ID_LEN:
        return error(f"business_id length invalid (max {MAX_BUSINESS_ID_LEN} bytes)", 400)

    addr_err = validate_address(signer, "signer")
    if addr_err:
        return error(addr_err, 400)

    if signer_type not in (0, 1):
        return error("signer_type must be 0 (student) or 1 (business)", 400)

    if student_name_b64 and not base64_len_ok(student_name_b64):
        return error("student_name_b64 invalid base64 or too long", 400)

    # Mevcut kayit/metadata
    existing_records = documents.get(doc_hash, [])
    existing_meta = metadata_store.get(doc_hash)

    current_allowed_signers: List[str] = []
    current_max_signers = 0

    # Ilk muhur
    if existing_meta is None:
        if signer_type != 1:
            return error("First seal must be business (signer_type=1)", 400)

        if not student_name_b64:
            return error("student_name_b64 required on first seal", 400)

        if not isinstance(allowed_signers, list) or len(allowed_signers) == 0:
            return error("allowed_signers required and cannot be empty", 400)

        if not isinstance(max_signers, int):
            try:
                max_signers = int(max_signers)
            except Exception:
                return error("max_signers must be numeric", 400)
        if max_signers <= 0:
            return error("max_signers must be > 0", 400)

        if len(allowed_signers) > max_signers:
            return error("allowed_signers length cannot exceed max_signers", 400)

        normalized_allowed: List[str] = []
        institution_in_list = False
        for addr in allowed_signers:
            addr = str(addr).strip()
            addr_err = validate_address(addr, "allowed_signer")
            if addr_err:
                return error(addr_err, 400)
            if addr == signer:
                institution_in_list = True
            normalized_allowed.append(addr)

        if not institution_in_list:
            return error("Initial business signer must be in allowed_signers", 400)

        metadata_store[doc_hash] = asdict(
            DocumentMetadata(allowed_signers=normalized_allowed, max_signers=max_signers)
        )
        current_allowed_signers = normalized_allowed
        current_max_signers = max_signers
    # Sonraki muhurler
    else:
        if student_name_b64:
            return error("student_name_b64 must be empty on subsequent seals", 400)
        current_allowed_signers = existing_meta["allowed_signers"]
        current_max_signers = existing_meta["max_signers"]

    # On-kontroller
    if len(existing_records) >= MAX_SEALS_PER_DOC_GLOBAL:
        return error(f"Global seal limit exceeded for this document ({MAX_SEALS_PER_DOC_GLOBAL})", 400)

    if signer not in current_allowed_signers:
        return error("Signer not in allowed_signers list", 403)

    if any(r["signer"] == signer for r in existing_records):
        return error("This signer has already sealed", 400)

    if len(existing_records) >= current_max_signers:
        return error(f"Maximum number of signers reached ({current_max_signers})", 400)

    timestamp = int(time.time())

    record = asdict(
        DocumentRecord(
            doc_hash=doc_hash,
            signature=signature,
            signer=signer,
            doc_type=doc_type,
            timestamp=timestamp,
            signer_type=int(signer_type),
            vc_hash=vc_hash,
            business_id=business_id,
            student_name_b64=student_name_b64,
        )
    )

    existing_records.append(record)
    documents[doc_hash] = existing_records

    return jsonify(
        {
            "ok": True,
            "total_records": len(existing_records),
            "doc_hash": doc_hash,
            "record": record,
            "metadata": metadata_store.get(doc_hash),
        }
    )


@app.post("/verify")
def verify():
    payload = request.get_json(force=True, silent=True) or {}
    mode = payload.get("mode")

    if mode == "doc_verify":
        doc_hash = str(payload.get("doc_hash", "")).strip()
        if not doc_hash:
            return error("doc_hash required", 400)
        err = validate_hash(doc_hash, "doc_hash")
        if err:
            return error(err, 400)
        records = documents.get(doc_hash)
        if not records:
            return error("No records found for this doc_hash", 404)
        return jsonify({"ok": True, "records": records})

    if mode == "records":
        doc_hash = str(payload.get("doc_hash", "")).strip()
        if not doc_hash:
            return error("doc_hash required", 400)
        return jsonify({"ok": True, "records": documents.get(doc_hash, [])})

    if mode == "metadata":
        doc_hash = str(payload.get("doc_hash", "")).strip()
        if not doc_hash:
            return error("doc_hash required", 400)
        return jsonify({"ok": True, "metadata": metadata_store.get(doc_hash)})

    if mode == "signer":
        signer = str(payload.get("signer", "")).strip()
        if not signer:
            return error("signer required", 400)
        related = []
        for recs in documents.values():
            for r in recs:
                if r["signer"] == signer:
                    related.append(r)
        return jsonify({"ok": True, "records": related})

    if mode == "vc":
        vc_hash = str(payload.get("vc_hash", "")).strip()
        if not vc_hash:
            return error("vc_hash required", 400)
        matched = []
        for recs in documents.values():
            matched.extend([r for r in recs if r["vc_hash"] == vc_hash])
        return jsonify({"ok": True, "records": matched})

    return error("invalid mode", 400)


if __name__ == "__main__":
    app.run(debug=True)
