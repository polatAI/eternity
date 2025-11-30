# Eternity Seal

Hash, seal, and verify documents on Soroban testnet with a Freighter-connected web UI and a Flask demo backend.

## Features
- Upload any file, SHA-256 hash it, and seal on-chain via the Soroban contract `CACQ43FUQT5RKIM5ALUEJ2RD63G6P7VAMN67JZZAXUWXHLAUMPAGHV5T`.
- Enforce contract-side rules: allowed signers list, max signers, first-seal requirements (business signer + student name).
- Verify by document hash, metadata, signer, or VC hash.
- Live UI preview, Freighter wallet connect, and testnet explorer links.

## Project Structure
- `app.py`: Flask server with `/seal` and `/verify` endpoints mirroring contract validation (in-memory demo storage).
- `templates/`: Jinja templates for layout, navbar, home, seal, and verify pages (English).
- `static/js/`: Frontend logic (`soroban.js`, `muhurle.js`, `dogrula.js`, `script.js`).
- `static/css` & root CSS: styling and component buttons.
- `lib.rs`: Soroban contract source (not deployed by this app; address configured above).

## Prerequisites
- Python 3.10+
- Node/web browser with Freighter extension installed (TESTNET network).
- Stellar SDK 14.3.3 available via CDN (local fallback `static/js/stellar-sdk.min.js` if present).

## Running locally
```bash
python app.py
# visit http://localhost:5000
```

## Usage
1. Connect Freighter (TESTNET).
2. Go to `/muhurle`:
   - First seal: check “first seal”, enter student name, allowed signers (G-addresses), set max signers. Business signer is required on first seal.
   - Subsequent seals: uncheck “first seal”; student name empty.
3. Submit; transaction hash links to Stellar Expert.
4. Verify via `/dogrula` using hash/file/signer/VC hash.

## Notes
- Backend is demo-only (in-memory). Restart wipes stored metadata/records.
- Contract rules still apply on-chain; client validations align but the chain is the source of truth.
