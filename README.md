# Eternity Seal - Zincir Üstü Belge Mühürleme

**English Version Below** | [English](#english-version)

## 🔐 Türkçe Açıklama

Eternity Seal, Stellar blockchain'in Soroban akıllı kontratı üzerinde çalışan, belgelerin SHA-256 hashini zincire yazarak değiştirilmez dijital imza ve doğrulama sağlayan bir uygulamadır.

### ✨ Özellikler

- **Zincir Üstü Mühürleme**: Belgelerin hashini Soroban kontratına yazarak kalıcı kayıt oluşturma
- **Anlık Doğrulama**: Hash ile belgenin zincirdeki varlığını doğrulama
- **Metaveri Desteği**: Belge tipi, öğrenci adı, kurum ID ve notlar saklanması
- **Freighter Cüzdan Entegrasyonu**: Stellar Testnet üzerinde güvenli imza
- **Responsive Tasarım**: Mobil ve masaüstü uyumlu arayüz

### 🏗️ Teknoloji Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Python Flask
- **Blockchain**: Rust (Soroban SDK 21.3.0), Stellar Testnet
- **SDK**: Stellar SDK 14.4.3

### 📋 Gereksinimler

#### Backend
- Python 3.8+
- Flask
- pip bağımlılıkları (requirements.txt)

#### Blockchain (İsteğe Bağlı)
- Rust 1.70+
- Cargo
- Soroban SDK

### 🚀 Kurulum ve Çalıştırma

#### 1. Backend Kurulumu

```bash
cd eternity
pip install -r requirements.txt
python app.py
```

Backend varsayılan olarak `http://localhost:5000` adresinde çalışır.

#### 2. Testnet Bağlantısı

Freighter wallet kurulumu:
1. Tarayıcı uzantılarından "Freighter" yükle
2. Testnet ağını seç
3. Test adresi ile para yükle (testnet faucet)

### 📖 Kullanım

#### Belge Mühürleme
1. "Mühürle" sayfasına git
2. Belge dosyasını yükle (PDF, JPG, PNG, TXT)
3. Belge tipi, öğrenci adı ve kurum ID'sini gir
4. "Mühürle" butonuna tıkla
5. Freighter ile işlemi imzala

#### Belge Doğrulama
1. "Doğrula" sayfasına git
2. İki yöntemden birini seç:
   - **Hash ile Doğrula**: Belge hashini yapıştır
   - **İmzalayan ile Ara**: Kurum ID veya Stellar adresini gir
3. Sonuçları görüntüle

### 🔗 API Endpoints

#### POST /sign
Belge mühürlemesini kaydet.

```json
{
  "cert_hash": "hex string (64 karakter)",
  "signature": "hex string",
  "signer": "Stellar adresi",
  "cert_data": {
    "doc_type": "Sertifika",
    "student_name": "Ad Soyad",
    "business_id": "Kurum Kodu",
    "notes": "İsteğe bağlı notlar"
  }
}
```

#### POST /verify
Belge doğrulama sorgusu.

```json
{
  "cert_hash": "hex string"
}
// veya
{
  "signer": "Stellar adresi"
}
```

### 📁 Proje Yapısı

```
eternity/
├── app.py                 # Flask backend
├── requirements.txt       # Python bağımlılıkları
├── contract/              # Soroban kontrat kaynağı
├── static/
│   ├── js/               # JavaScript mantığı
│   └── *.css             # Stil dosyaları
└── templates/            # HTML şablonları
```

### 🔍 Kontrat Detayları

**Contract ID**: `CA2TXD7QNQHYBCRRJ6UDW4RDINTSQIMP5BMIOJWYZTRSGQATLVWTB3EZ`

**Network**: Stellar Testnet

**RPC**: `https://soroban-testnet.stellar.org`

### 🧪 Test

Demo mod aktif - Freighter yüklü değilse test adresleriyle test edebilirsiniz.

### 📝 Lisans

MIT License

---

# Eternity Seal - On-Chain Document Sealing

Eternity Seal is a web application that leverages the Stellar blockchain's Soroban smart contract to provide immutable digital signatures and verification by writing document SHA-256 hashes to the blockchain.

### ✨ Features

- **On-Chain Sealing**: Write document hashes to Soroban contract for permanent records
- **Instant Verification**: Verify document existence on-chain using hash
- **Metadata Support**: Store document type, student name, institution ID, and notes
- **Freighter Wallet Integration**: Secure signing on Stellar Testnet
- **Responsive Design**: Mobile and desktop compatible interface

### 🏗️ Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Python Flask
- **Blockchain**: Rust (Soroban SDK 21.3.0), Stellar Testnet
- **SDK**: Stellar SDK 14.4.3

### 📋 Requirements

#### Backend
- Python 3.8+
- Flask
- pip dependencies (requirements.txt)

#### Blockchain (Optional)
- Rust 1.70+
- Cargo
- Soroban SDK

### 🚀 Installation & Running

#### 1. Backend Setup

```bash
cd eternity
pip install -r requirements.txt
python app.py
```

Backend runs on `http://localhost:5000` by default.

#### 2. Testnet Connection

Freighter wallet setup:
1. Install "Freighter" browser extension
2. Select Testnet network
3. Fund with test account (testnet faucet)

### 📖 Usage

#### Sealing Documents
1. Navigate to "Mühürle" (Seal) page
2. Upload document file (PDF, JPG, PNG, TXT)
3. Enter document type, student name, and institution ID
4. Click "Mühürle" button
5. Sign transaction with Freighter

#### Verifying Documents
1. Navigate to "Doğrula" (Verify) page
2. Choose verification method:
   - **By Hash**: Paste document hash
   - **By Signer**: Enter institution ID or Stellar address
3. View results

### 🔗 API Endpoints

#### POST /sign
Save document seal record.

```json
{
  "cert_hash": "hex string (64 chars)",
  "signature": "hex string",
  "signer": "Stellar address",
  "cert_data": {
    "doc_type": "Certificate",
    "student_name": "Full Name",
    "business_id": "Institution Code",
    "notes": "Optional notes"
  }
}
```

#### POST /verify
Query document verification.

```json
{
  "cert_hash": "hex string"
}
// or
{
  "signer": "Stellar address"
}
```

### 📁 Project Structure

```
eternity/
├── app.py                 # Flask backend
├── requirements.txt       # Python dependencies
├── contract/              # Soroban contract source
├── static/
│   ├── js/               # JavaScript logic
│   └── *.css             # Style files
└── templates/            # HTML templates
```

### 🔍 Contract Details

**Contract ID**: `CA2TXD7QNQHYBCRRJ6UDW4RDINTSQIMP5BMIOJWYZTRSGQATLVWTB3EZ`

**Network**: Stellar Testnet

**RPC**: `https://soroban-testnet.stellar.org`

### 🧪 Testing

Demo mode active - Test with demo addresses if Freighter is not installed.

### 📝 License

MIT License
