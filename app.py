from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Tuple

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

MIN_HASH_LEN_BYTES = 32
MAX_HASH_LEN_BYTES = 128
MAX_DOC_TYPE_LEN = 64
MAX_BUSINESS_ID_LEN = 64
MAX_STUDENT_NAME_LEN = 128
MAX_NOTES_LEN = 256
ADDRESS_REGEX = re.compile(r"^G[A-Z0-9]{55}$")

documents_by_hash: Dict[str, List[Dict[str, Any]]] = {}
documents_by_signer: Dict[str, List[Dict[str, Any]]] = {}


def error(msg: str, code: int = 400) -> Tuple[Any, int]:
    return jsonify({"ok": False, "error": msg}), code


def is_hex(s: str) -> bool:
    try:
        int(s, 16)
        return len(s) % 2 == 0
    except ValueError:
        return False


def validate_hash(hex_str: str, name: str) -> str | None:
    if not hex_str:
        return f"{name} cannot be empty"
    if not is_hex(hex_str):
        return f"{name} must be valid hex (even-length)"
    byte_len = len(hex_str) // 2
    if byte_len < MIN_HASH_LEN_BYTES or byte_len > MAX_HASH_LEN_BYTES:
        return f"{name} length invalid (bytes: {byte_len})"
    return None


def validate_len(value: str, max_bytes: int, field: str, required: bool = True) -> str | None:
    if required and not value:
        return f"{field} is required"
    if len(value.encode("utf-8")) > max_bytes:
        return f"{field} length invalid (max {max_bytes} bytes)"
    return None


def validate_address(addr: str, field: str) -> str | None:
    if not ADDRESS_REGEX.match(addr):
        return f"{field} invalid Stellar address"
    return None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/muhurle")
def muhurle():
    return render_template("muhurle.html")


@app.route("/dogrula")
def dogrula():
    return render_template("dogrula.html")


@app.route("/video")
def video():
    return render_template("video.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/sign")
def sign():
    payload = request.get_json(force=True, silent=True) or {}

    cert_hash = str(payload.get("cert_hash", "")).strip()
    signature = str(payload.get("signature", "")).strip()
    signer = str(payload.get("signer", "")).strip()
    cert_data = payload.get("cert_data") or {}

    doc_type = str(cert_data.get("doc_type", "")).strip()
    student_name = str(cert_data.get("student_name", "")).strip()
    business_id = str(cert_data.get("business_id", "")).strip()
    notes = str(cert_data.get("notes", "")).strip()

    err = validate_hash(cert_hash, "cert_hash")
    if err:
        return error(err, 400)

    addr_err = validate_address(signer, "signer")
    if addr_err:
        return error(addr_err, 400)

    for field, value, limit, required in [
        ("doc_type", doc_type, MAX_DOC_TYPE_LEN, True),
        ("student_name", student_name, MAX_STUDENT_NAME_LEN, True),
        ("business_id", business_id, MAX_BUSINESS_ID_LEN, True),
        ("notes", notes, MAX_NOTES_LEN, False),
    ]:
        length_err = validate_len(value, limit, field, required=required)
        if length_err:
            return error(length_err, 400)

    record = {
        "cert_hash": cert_hash,
        "signature": signature or cert_hash,
        "signer": signer,
        "doc_type": doc_type,
        "student_name": student_name,
        "business_id": business_id,
        "notes": notes,
        "file_name": cert_data.get("file_name"),
        "file_size": cert_data.get("file_size"),
        "created_at": cert_data.get("created_at"),
        "on_chain_tx": cert_data.get("on_chain_tx"),
        "contract_id": cert_data.get("contract_id"),
        "timestamp": int(time.time()),
    }

    documents_by_hash.setdefault(cert_hash, []).append(record)
    documents_by_signer.setdefault(signer, []).append(record)

    return jsonify({"ok": True, "record": record})


@app.post("/verify")
def verify():
    payload = request.get_json(force=True, silent=True) or {}
    cert_hash = str(payload.get("cert_hash", "")).strip()
    signer = str(payload.get("signer", "")).strip()

    if cert_hash:
        err = validate_hash(cert_hash, "cert_hash")
        if err:
            return error(err, 400)
        records = documents_by_hash.get(cert_hash, [])
        return jsonify({"ok": True, "count": len(records), "certificates": records})

    if signer:
        addr_err = validate_address(signer, "signer")
        if addr_err:
            return error(addr_err, 400)
        records = documents_by_signer.get(signer, [])
        return jsonify({"ok": True, "signer": signer, "count": len(records), "certificates": records})

    return error("cert_hash or signer required", 400)


if __name__ == "__main__":
    app.run(debug=True)
