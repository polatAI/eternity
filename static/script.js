// ---------------- FREIGHTER WALLET CONNECTION & DEMO MODE ---------------- //

let connectedPublicKey = null;
window.connectedPublicKey = null;

const DEMO_ADDRESSES = [
  "GDCWF7623SOL6DAZMPYHH745SKPBHPGHBIC5QREJZ3OQGQXDIGKUFQIG",
  "GDVVLS4Y24WA3DDG6AHZD5KTCPEXK56CWMFQGPUFJAJO2ZSEXRK6P5CX",
];

function getFreighterApi() {
  return window.freighterApi || window.freighter || window.Freighter;
}

function initWalletButton() {
  const button = document.getElementById("connectWallet");
  if (!button) {
    console.error("connectWallet butonu bulunamadı.");
    return;
  }

  button.addEventListener("click", (e) => {
    e.preventDefault();
    startWalletConnect(e);
  });
}

function startWalletConnect(e) {
  if (e && typeof e.preventDefault === "function") {
    e.preventDefault();
  }
  return connectWallet();
}

window.startWalletConnect = startWalletConnect;

async function connectWallet() {
  const button = document.getElementById("connectWallet");
  if (!button) return false;

  const freighter = getFreighterApi();
  if (!freighter) {
    offerDemoMode(button);
    return false;
  }

  try {
    if (typeof freighter.getNetwork === "function") {
      const net = await freighter.getNetwork();
      if (net && net.network && net.network !== "TESTNET") {
        alert(`Freighter ağı: ${net.network}. Lütfen Freighter'da TESTNET'e geçin.`);
        return false;
      }
    }

    let access = null;
    if (typeof freighter.requestAccess === "function") {
      access = await freighter.requestAccess();
    }

    let pubKey = (access && (access.address || access.publicKey)) || access || null;

    if (!pubKey && typeof freighter.getPublicKey === "function") {
      pubKey = await freighter.getPublicKey();
    }

    if (!pubKey || typeof pubKey !== "string") {
      alert("Cüzdan erişimi reddedildi veya beklenmeyen yanıt alındı.");
      return false;
    }

    setConnectedAddress(pubKey, button);
    return true;
  } catch (err) {
    console.error("Freighter hatası:", err);
    offerDemoMode(button);
    return false;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWalletButton);
} else {
  initWalletButton();
}

document.addEventListener("click", (e) => {
  const target = e.target && e.target.closest && e.target.closest("#connectWallet");
  if (target) {
    e.preventDefault();
    startWalletConnect(e);
  }
});

function offerDemoMode(button) {
  const choice = confirm(
    "Freighter cüzdanı bulunamadı.\n\nTest için DEMO MODU kullanılsın mı? (Test adresleri kullanır)\n\nTamam: demo, İptal: Freighter yükle."
  );
  if (choice) {
    setConnectedAddress(DEMO_ADDRESSES[0], button);
  } else {
    alert("Lütfen Freighter eklentisini yükleyin: https://freighter.app");
  }
}

function setConnectedAddress(pubKey, button) {
  connectedPublicKey = pubKey;
  window.connectedPublicKey = connectedPublicKey;
  const short = `${connectedPublicKey.slice(0, 6)}...${connectedPublicKey.slice(-4)}`;

  button.innerHTML = `
    <span class="nav-text">
      <span class="nav-text-inner">Cüzdan: ${short}</span>
      <span class="nav-text-clone">Cüzdan: ${short}</span>
    </span>
  `;

  const freighter = getFreighterApi();
  if (freighter) {
    const methods = Object.keys(freighter);
    console.log("Freighter bağlandı!");
    console.log("Available methods:", methods.join(", "));
  }

  console.log("Bağlı adres:", connectedPublicKey);
}

// ---------------- NAVBAR ANIMATION (GSAP) ---------------- //

if (window.gsap) {
  gsap.set(".nav-item", {
    y: 40,
    opacity: 0,
    scale: 0.95,
  });

  gsap.to(".nav-item", {
    y: 0,
    opacity: 1,
    scale: 1,
    duration: 0.8,
    stagger: 0.08,
    delay: 0.2,
    ease: "power2.out",
  });
}
