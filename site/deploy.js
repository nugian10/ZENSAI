// ZENSAI — browser-wallet deploy page logic (owner tool).
// Uses ONLY the connected browser wallet to sign. This page NEVER asks for,
// accepts, or handles a seed phrase or private key. Every transaction needs
// the user's explicit click + wallet confirmation.
//
// Deploys TWO contracts in order: ZensaiToken first, then ZensaiNFT (which
// needs the token address). The deployer wallet pays gas ONLY — the owner of
// both contracts is Bryan's My Wallet, passed as a constructor argument,
// while mint payments and the 5% royalty go to the Binance Agentic Wallet.
// Steps 5-6 (setMinter, activate) are owner-only: they run in-page when the
// connected wallet IS the owner (My Wallet).
//
// Requires ethers v6 (UMD) loaded from CDN, and zensai-artifact.json
// (ABI + bytecode) next to deploy.html. See scripts/sync-deploy-artifact.py.
(function () {
  "use strict";
  var OWNER = "0x0262e8e5E4584D8AB840fD950a6E2E0A414d4097";
  var REVENUE = "0x89c37649Ba3BAA9E1ce028612b7DE4e9c3a947B7";
  var REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
  var BASE_URI = "https://raw.githubusercontent.com/nugian10/ZENSAI/main/collection/metadata/";
  var BSC_CHAIN_HEX = "0x38";
  var MEASURED_TOKEN_GAS = 863838;
  var MEASURED_NFT_GAS = 2583921;
  var BNB_IDR_REF = 12365888; // CoinGecko, 9 Nov 2026 — reference only

  var provider = null, signer = null, account = null, artifact = null;
  var tokenAddress = null, nftAddress = null;

  function $(id) { return document.getElementById(id); }
  function setText(id, t) { var el = $(id); if (el) el.textContent = t; }
  function show(id) { var el = $(id); if (el) el.classList.remove("hidden"); }
  function hide(id) { var el = $(id); if (el) el.classList.add("hidden"); }
  function setStep(n, state) {
    var el = $("step-" + n); if (!el) return;
    el.classList.remove("todo", "active", "done", "blocked"); el.classList.add(state);
  }
  function note(msg, kind) {
    var el = $("note"); if (!el) return;
    el.textContent = msg; el.className = "note-box " + (kind || "info"); show("note");
  }
  function isOwner() { return !!(account && account.toLowerCase() === OWNER.toLowerCase()); }
  function fmtBnb(wei) { try { return ethers.formatEther(wei); } catch (e) { return "?"; } }
  function fmtIdr(wei) {
    try { return "Rp " + Math.round(parseFloat(ethers.formatEther(wei)) * BNB_IDR_REF).toLocaleString("en-US"); }
    catch (e) { return "—"; }
  }

  async function boot() {
    setStep(1, "active");
    if (typeof ethers === "undefined") { note("Could not load ethers.js from the CDN. Check your internet connection and reload.", "error"); return; }
    try {
      var res = await fetch("zensai-artifact.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      artifact = await res.json();
      if (!artifact.token || !artifact.nft || !artifact.token.abi || !artifact.token.bytecode || !artifact.nft.abi || !artifact.nft.bytecode) {
        throw new Error("artifact file is missing token/nft abi/bytecode");
      }
      setText("artifact-status", "Loaded — ZensaiToken (" + artifact.token.abi.length + " ABI entries) + ZensaiNFT (" + artifact.nft.abi.length + " ABI entries)");
    } catch (e) {
      note("Could not load zensai-artifact.json (" + e.message + "). Open this page through a web server (or the deployed site), not directly from disk. Nothing has been sent anywhere.", "error");
      return;
    }
    if (!window.ethereum) { note("No browser wallet found. Install MetaMask, then reload. This page will never ask for your seed phrase or private key.", "error"); return; }
    window.ethereum.on("accountsChanged", function () { connect({ silent: true }); });
    window.ethereum.on("chainChanged", function () { connect({ silent: true }); });
    setText("wallet-status", "Wallet detected. Click “Connect Wallet”.");
    updateCosts();
  }

  async function updateCosts() {
    if (typeof ethers === "undefined") return;
    try {
      var p = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
      var gp = await p.getFeeData().then(function (f) { return f.gasPrice || 0n; });
      var total = BigInt(MEASURED_TOKEN_GAS + MEASURED_NFT_GAS) * gp;
      setText("gas-price", ethers.formatUnits(gp, "gwei") + " gwei (live BSC)");
      setText("cost-bnb", fmtBnb(total) + " BNB");
      setText("cost-idr", fmtIdr(total) + " — plus setMinter + setMintActive (~100k gas)");
    } catch (e) { setText("cost-bnb", "≈ 0.00035 BNB at 0.1 gwei (measured 3,447,759 gas)"); }
  }

  async function connect(opts) {
    opts = opts || {};
    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      var net = await provider.getNetwork();
      if (net.chainId !== 56n) {
        show("switch-row");
        if (!opts.silent) note("You are not on BNB Smart Chain (56). Click “Switch to BNB Smart Chain”.", "warn");
        return;
      }
      hide("switch-row");
      signer = await provider.getSigner();
      account = await signer.getAddress();
      setText("wallet-status", "Connected.");
      setText("wallet-address", account);
      show("wallet-address-row");
      setText("chain-status", "BNB Smart Chain (56) ✓");
      setStep(1, "done"); setStep(2, "active");
      if (!isOwner()) note("Connected wallet is NOT My Wallet (the owner). You can still deploy (you pay gas), but setMinter and setMintActive afterwards must be done from My Wallet. The contracts' owner will still be My Wallet.", "warn");
      updateSteps();
    } catch (e) { note("Connection failed: " + (e.message || e), "error"); }
  }

  function updateSteps() {
    var ready = !!(provider && signer && account && artifact);
    $("deploy-token-btn").disabled = !ready || !!tokenAddress;
    $("deploy-nft-btn").disabled = !ready || !tokenAddress || !!nftAddress;
    $("minter-btn").disabled = !ready || !tokenAddress || !nftAddress || !isOwner();
    $("activate-btn").disabled = !ready || !nftAddress || !isOwner();
    if (tokenAddress) { setStep(3, "done"); setStep(4, "active"); }
    if (nftAddress) { setStep(4, "done"); setStep(5, "active"); }
  }

  async function deployToken() {
    if (!provider || !signer || !artifact) return;
    setStep(3, "active");
    try {
      var factory = new ethers.ContractFactory(artifact.token.abi, artifact.token.bytecode, signer);
      var contract = await factory.deploy(OWNER);
      setText("token-tx", "Sent: " + contract.deploymentTransaction().hash);
      await contract.waitForDeployment();
      tokenAddress = await contract.getAddress();
      setText("token-address", tokenAddress);
      show("token-address-row");
      note("ZensaiToken deployed at " + tokenAddress + ". Next: deploy the NFT contract.", "ok");
      updateSteps();
    } catch (e) { setStep(3, "blocked"); note("Token deploy failed: " + (e.reason || e.message || e), "error"); }
  }

  async function deployNft() {
    if (!provider || !signer || !artifact || !tokenAddress) return;
    setStep(4, "active");
    try {
      var factory = new ethers.ContractFactory(artifact.nft.abi, artifact.nft.bytecode, signer);
      var contract = await factory.deploy(OWNER, REVENUE, REGISTRY, BASE_URI, tokenAddress);
      setText("nft-tx", "Sent: " + contract.deploymentTransaction().hash);
      await contract.waitForDeployment();
      nftAddress = await contract.getAddress();
      setText("nft-address", nftAddress);
      show("nft-address-row");
      setText("minter-call", "ZensaiToken(" + tokenAddress + ").setMinter(" + nftAddress + ", true)");
      note("ZensaiNFT deployed at " + nftAddress + ". Next: authorize it as a $ZSAI minter (owner only).", "ok");
      updateSteps();
    } catch (e) { setStep(4, "blocked"); note("NFT deploy failed: " + (e.reason || e.message || e), "error"); }
  }

  async function setMinter() {
    if (!provider || !signer || !artifact || !tokenAddress || !nftAddress) return;
    setStep(5, "active");
    try {
      var token = new ethers.Contract(tokenAddress, artifact.token.abi, signer);
      var tx = await token.setMinter(nftAddress, true);
      setText("minter-tx", "Sent: " + tx.hash);
      await tx.wait();
      setStep(5, "done"); setStep(6, "active");
      note("Minter authorized. Paid mints will now earn 120,000 $ZSAI each. Last step: activate minting when ready.", "ok");
      updateSteps();
    } catch (e) { setStep(5, "blocked"); note("setMinter failed: " + (e.reason || e.message || e), "error"); }
  }

  async function activate() {
    if (!provider || !signer || !artifact || !nftAddress) return;
    setStep(6, "active");
    try {
      var nft = new ethers.Contract(nftAddress, artifact.nft.abi, signer);
      var tx = await nft.setMintActive(true);
      setText("activate-tx", "Sent: " + tx.hash);
      await tx.wait();
      setStep(6, "done");
      show("done-box");
      setText("done-token", tokenAddress);
      setText("done-nft", nftAddress);
      $("done-token-link").href = "https://bscscan.com/address/" + tokenAddress;
      $("done-nft-link").href = "https://bscscan.com/address/" + nftAddress;
      note("MINT IS LIVE. Update site/config.js with both addresses, then verify both contracts on BscScan.", "ok");
    } catch (e) { setStep(6, "blocked"); note("Activation failed: " + (e.reason || e.message || e), "error"); }
  }

  document.addEventListener("DOMContentLoaded", function () {
    boot();
    $("connect-btn").addEventListener("click", function () { connect({}); });
    $("switch-btn").addEventListener("click", async function () {
      try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_HEX }] }); connect({ silent: true }); }
      catch (e) { note("Switch failed: " + (e.message || e), "error"); }
    });
    $("deploy-token-btn").addEventListener("click", deployToken);
    $("deploy-nft-btn").addEventListener("click", deployNft);
    $("minter-btn").addEventListener("click", setMinter);
    $("activate-btn").addEventListener("click", activate);
  });
})();
