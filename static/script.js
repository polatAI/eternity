// ---------------- FREIGHTER WALLET CONNECTION ---------------- //

let connectedPublicKey = null;
window.connectedPublicKey = null;

window.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("connectWallet");
  if (!button) {
    console.error("connectWallet button not found");
    return;
  }

  button.addEventListener("click", async (e) => {
    e.preventDefault();

    if (!window.freighterApi) {
      alert("Freighter API not found. Is the Freighter extension installed?");
      console.error("window.freighterApi undefined");
      return;
    }

    try {
      const isConnected = await window.freighterApi.isConnected();
      if (!isConnected) {
        alert("Freighter not installed or disabled. Please install/enable the extension.");
        return;
      }

      const net = await window.freighterApi.getNetwork();
      if (net.network !== "TESTNET") {
        alert(`Freighter network: ${net.network}. Please switch to TESTNET in Freighter.`);
      }

      const access = await window.freighterApi.requestAccess();
      const pubKey = (access && (access.address || access.publicKey)) || access;
      if (!pubKey || typeof pubKey !== "string") {
        console.error("requestAccess returned unexpected format:", access);
        alert("Wallet access denied or unexpected response.");
        return;
      }

      connectedPublicKey = pubKey;
      window.connectedPublicKey = connectedPublicKey;
      const short = `${connectedPublicKey.slice(0, 6)}...${connectedPublicKey.slice(-4)}`;

      button.innerHTML = `
        <span class="nav-text">
          <span class="nav-text-inner">✓ ${short}</span>
          <span class="nav-text-clone">✓ ${short}</span>
        </span>
      `;
    } catch (err) {
      console.error("Wallet connection error:", err);
      alert("Error while connecting wallet. Check console.");
    }
  });
});

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
