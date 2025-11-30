#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Env, Address, Bytes, Vec};

/// Bir belge için meta bilgiler (hep restricted mode)
#[contracttype]
#[derive(Clone)]
pub struct DocumentMetadata {
    pub allowed_signers: Vec<Address>, // Bu belgeyi imzalayabilecek adresler (kurum + öğrenci vb.)
    pub max_signers: u32,              // İzin verilen maksimum imzalayan sayısı (ör: 2)
}

/// Belge için zincire yazılacak kayıt yapısı
#[contracttype]
#[derive(Clone)]
pub struct DocumentRecord {
    pub doc_hash: Bytes,        // Belge hash'i (backend'de SHA-256'tan geçmiş)
    pub signature: Bytes,       // İmza (hashlenmiş hali de olabilir)
    pub signer: Address,        // İmzalayan Stellar adresi
    pub doc_type: Bytes,        // Belge tipi (örn: "certificate")
    pub timestamp: u64,         // Ledger timestamp
    pub signer_type: u32,       // 0 = user (öğrenci), 1 = business (kurum)
    pub vc_hash: Bytes,         // SHA256(VC)
    pub business_id: Bytes,     // B2B için kurum ID'si veya hash'i
    pub student_name_b64: Bytes // Öğrencinin ad+soyad bilgisinin base64 encode edilmiş hali
}

/// Storage key'lerini ayırmak için enum
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Records(Bytes),   // doc_hash -> Vec<DocumentRecord>
    Metadata(Bytes),  // doc_hash -> DocumentMetadata
}

/// Bazı sınırlar
const MAX_SEALS_PER_DOC_GLOBAL: u32 = 10;  // Her belge için max toplam mühür
const MIN_HASH_LEN: u32 = 32;              // SHA-256 için 32 byte (raw bytes) varsayımı
const MAX_HASH_LEN: u32 = 128;
const MAX_DOC_TYPE_LEN: u32 = 64;
const MAX_BUSINESS_ID_LEN: u32 = 64;
const MAX_STUDENT_NAME_B64_LEN: u32 = 128;

#[contract]
pub struct DocumentSealContract;

#[contractimpl]
impl DocumentSealContract {
    /// Belgeyi mühürler (her zaman "restricted" mod).
    pub fn seal_document(
        env: Env,
        doc_hash: Bytes,
        signature: Bytes,
        signer: Address,
        doc_type: Bytes,
        signer_type: u32,         // 0=user, 1=business
        vc_hash: Bytes,
        business_id: Bytes,
        student_name_b64: Bytes,
        allowed_signers: Vec<Address>, // İlk mühürde anlamlı
        max_signers: u32,              // İlk mühürde anlamlı (ör: 2)
    ) -> u32 {
        // 1) signer gerçekten çağrıyı imzalayan adres mi?
        signer.require_auth();

        // 2) Temel validationlar
        if signer_type > 1 {
            panic!("invalid signer_type: must be 0 (user) or 1 (business)");
        }

        let doc_hash_len = doc_hash.len();
        if doc_hash_len < MIN_HASH_LEN || doc_hash_len > MAX_HASH_LEN {
            panic!("invalid doc_hash length");
        }

        let vc_hash_len = vc_hash.len();
        if vc_hash_len < MIN_HASH_LEN || vc_hash_len > MAX_HASH_LEN {
            panic!("invalid vc_hash length");
        }

        let sig_len = signature.len();
        if sig_len < MIN_HASH_LEN || sig_len > MAX_HASH_LEN {
            panic!("invalid signature length");
        }

        let doc_type_len = doc_type.len();
        if doc_type_len == 0 || doc_type_len > MAX_DOC_TYPE_LEN {
            panic!("invalid doc_type length");
        }

        let business_id_len = business_id.len();
        if business_id_len > 0 && business_id_len > MAX_BUSINESS_ID_LEN {
            panic!("invalid business_id length");
        }
        // student_name_b64 uzunluk kontrolü ilk mühür mantığı içinde yapılıyor.

        // 3) Bu belgeye ait mevcut kayıtlar ve metadata'yı al
        let records_key = DataKey::Records(doc_hash.clone());
        let meta_key = DataKey::Metadata(doc_hash.clone());

        let mut records: Vec<DocumentRecord> = match env.storage().persistent().get(&records_key) {
            Some(existing) => existing,
            None => Vec::new(&env),
        };

        let existing_meta: Option<DocumentMetadata> =
            env.storage().persistent().get(&meta_key);

        let metadata: DocumentMetadata;

        match existing_meta {
            Some(meta) => {
                // İlk mühür DEĞİL.
                metadata = meta;

                // İlk mühür dışındaki çağrılarda student_name_b64 BOŞ olmalı.
                if student_name_b64.len() != 0 {
                    panic!("student_name_b64 must be empty on non-initial seals");
                }
            }
            None => {
                // İlk mühür: mutlaka kurum atmalı
                if signer_type != 1 {
                    panic!("first seal must be done by a business (signer_type = 1)");
                }

                // İlk mühürde öğrencinin ad-soyad bilgisi base64 formatında gönderilmeli
                let student_name_len = student_name_b64.len();
                if student_name_len == 0 {
                    panic!("student_name_b64 must be provided on first (institution) seal");
                }
                if student_name_len > MAX_STUDENT_NAME_B64_LEN {
                    panic!("invalid student_name_b64 length");
                }

                // allowed_signers boş olamaz ve uzunluk kontrolleri
                let n = allowed_signers.len();
                if n == 0 {
                    panic!("first seal requires at least one allowed signer");
                }

                if max_signers == 0 {
                    panic!("max_signers must be > 0");
                }

                if n as u32 > max_signers {
                    panic!("allowed_signers length must be <= max_signers");
                }

                // Kurum (signer) adresi allowed_signers içinde olmalı
                let mut institution_is_allowed = false;
                for s in allowed_signers.iter() {
                    if s == signer {
                        institution_is_allowed = true;
                        break;
                    }
                }
                if !institution_is_allowed {
                    panic!("initial business signer must be included in allowed_signers list");
                }

                // metadata'yı oluştur. allowed_signers vektörünü doğrudan klonla.
                metadata = DocumentMetadata {
                    allowed_signers: allowed_signers.clone(),
                    max_signers,
                };

                // Metadata'yı kaydet
                env.storage().persistent().set(&meta_key, &metadata);
            }
        }

        // 4) Global mühür sayısı limiti (DoS / spam'e karşı)
        let current_len = records.len() as u32;
        if current_len >= MAX_SEALS_PER_DOC_GLOBAL {
            panic!("too many seals stored for this document hash (Global Limit)");
        }

        // 5) Yetki kontrolü + imzalayan sayısı kontrolü

        // signer metadata.allowed_signers içinde mi?
        let mut allowed = false;
        for a in metadata.allowed_signers.iter() {
            if a == signer {
                allowed = true;
                break;
            }
        }
        if !allowed {
            panic!("unauthorized signer for this restricted document (Not in Allowed List)");
        }

        // Aynı signer bir belgeyi birden fazla kez mühürlemesin
        for r in records.iter() {
            if r.signer == signer {
                panic!("this signer has already sealed this document");
            }
        }

        // DÜZELTME: Mevcut mühür sayısı, izin verilen maksimuma ULAŞMIŞSA, yeni mühür atılamaz.
        let current_signers = records.len() as u32;
        if current_signers == metadata.max_signers {
            panic!("maximum number of signers reached for this document");
        }

        // 6) Ledger zamanını al
        let timestamp = env.ledger().timestamp();

        // 7) Yeni kayıt oluştur
        let record = DocumentRecord {
            doc_hash: doc_hash.clone(),
            signature,
            signer,
            doc_type,
            timestamp,
            signer_type,
            vc_hash,
            business_id,
            student_name_b64,
        };

        // 8) Listeye ekle ve storage'a yaz
        records.push_back(record);
        env.storage().persistent().set(&records_key, &records);

        // 9) Toplam mühür sayısını döndür
        records.len() as u32
    }

    /// Verilen doc_hash için tüm mühür kayıtlarını döner.
    pub fn get_documents(env: Env, doc_hash: Bytes) -> Vec<DocumentRecord> {
        let records_key = DataKey::Records(doc_hash);
        match env.storage().persistent().get(&records_key) {
            Some(records) => records,
            None => Vec::new(&env),
        }
    }

    /// Belge metadata'sını döner (allowed_signers, max_signers).
    pub fn get_metadata(env: Env, doc_hash: Bytes) -> Option<DocumentMetadata> {
        let meta_key = DataKey::Metadata(doc_hash);
        env.storage().persistent().get(&meta_key)
    }

    /// Bu hash için hiç kayıt var mı?
    pub fn has_document(env: Env, doc_hash: Bytes) -> bool {
        let records_key = DataKey::Records(doc_hash);
        env.storage().persistent().has(&records_key)
    }

    /// Bu hash için kaç mühür var?
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