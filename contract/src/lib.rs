#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Bytes, Env, String, Vec};

#[contracttype]
#[derive(Clone)]
pub struct DocumentRecord {
    pub doc_hash: Bytes,
    pub doc_type: String,
    pub student_name: String,
    pub business_id: String,
    pub notes: String,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Records(Bytes),
}

const MAX_SEALS_PER_DOC_GLOBAL: u32 = 10;
const MIN_HASH_LEN: u32 = 32;
const MAX_HASH_LEN: u32 = 128;
const MAX_DOC_TYPE_LEN: u32 = 64;
const MAX_BUSINESS_ID_LEN: u32 = 64;
const MAX_STUDENT_NAME_LEN: u32 = 128;
const MAX_NOTES_LEN: u32 = 256;

#[contract]
pub struct DocumentSealContract;

#[contractimpl]
impl DocumentSealContract {
    /// Simple 5-input seal: doc_hash, doc_type, student_name, business_id, notes.
    pub fn seal_document(
        env: Env,
        doc_hash: Bytes,
        doc_type: String,
        student_name: String,
        business_id: String,
        notes: String,
    ) -> u32 {
        let doc_hash_len = doc_hash.len();
        if doc_hash_len < MIN_HASH_LEN || doc_hash_len > MAX_HASH_LEN {
            panic!("invalid doc_hash length");
        }

        let doc_type_len = doc_type.len();
        if doc_type_len == 0 || doc_type_len > MAX_DOC_TYPE_LEN {
            panic!("invalid doc_type length");
        }

        let student_name_len = student_name.len();
        if student_name_len == 0 || student_name_len > MAX_STUDENT_NAME_LEN {
            panic!("invalid student_name length");
        }

        let business_id_len = business_id.len();
        if business_id_len == 0 || business_id_len > MAX_BUSINESS_ID_LEN {
            panic!("invalid business_id length");
        }

        let notes_len = notes.len();
        if notes_len > MAX_NOTES_LEN {
            panic!("invalid notes length");
        }

        let records_key = DataKey::Records(doc_hash.clone());
        let mut records: Vec<DocumentRecord> = match env.storage().persistent().get(&records_key) {
            Some(existing) => existing,
            None => Vec::new(&env),
        };

        let current_len = records.len() as u32;
        if current_len >= MAX_SEALS_PER_DOC_GLOBAL {
            panic!("too many seals stored for this document hash (Global Limit)");
        }

        let timestamp = env.ledger().timestamp();

        let record = DocumentRecord {
            doc_hash: doc_hash.clone(),
            doc_type,
            student_name,
            business_id,
            notes,
            timestamp,
        };

        records.push_back(record);
        env.storage().persistent().set(&records_key, &records);

        records.len() as u32
    }

    pub fn get_documents(env: Env, doc_hash: Bytes) -> Vec<DocumentRecord> {
        let records_key = DataKey::Records(doc_hash);
        match env.storage().persistent().get(&records_key) {
            Some(records) => records,
            None => Vec::new(&env),
        }
    }

    pub fn has_document(env: Env, doc_hash: Bytes) -> bool {
        let records_key = DataKey::Records(doc_hash);
        env.storage().persistent().has(&records_key)
    }

    pub fn count_documents(env: Env, doc_hash: Bytes) -> u32 {
        let records_key = DataKey::Records(doc_hash);
        let records_opt: Option<Vec<DocumentRecord>> =
            env.storage().persistent().get(&records_key);
        match records_opt {
            Some(records) => records.len() as u32,
            None => 0,
        }
    }
}
