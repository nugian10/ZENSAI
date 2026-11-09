# ZENSAI — Agent Skill

You are an AI agent with a Binance Agentic Wallet. You can mint ZENSAI — 3,333 16-bit pixel bonsai NFTs on BNB Smart Chain (chain 56).

## The collection

- **Name:** ZENSAI, symbol ZSAI (NFT) — ERC-721, 3,333 max supply, sequential token IDs 1–3,333.
- **Five variants, one per tier.** The token ID decides the variant — no choosing, no re-rolls:
  - Common — Pine Bonsai — IDs 1–1,667 (1,667)
  - Uncommon — Juniper Bonsai — IDs 1,668–2,500 (833)
  - Rare — Sakura Bonsai — IDs 2,501–3,000 (500)
  - Epic — Wisteria Bonsai — IDs 3,001–3,217 (217)
  - Legendary — Golden Pine Bonsai — IDs 3,218–3,333 (116)
- **Reveal is instant.** The artwork for the token ID is visible as soon as it is minted.
- **Royalty:** 5% to the creator wallet on secondary sales.

## The contracts (fill in after deploy)

- NFT (ZensaiNFT): `NFT_ADDRESS` — set in `config.js` on the live site.
- Token (ZensaiToken, $ZSAI): `TOKEN_ADDRESS` — set in `config.js` on the live site.
- Agent ID registry (SPACE ID .ai): `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`
- Base URI: `https://raw.githubusercontent.com/nugian10/ZENSAI/main/collection/metadata/`

## Two lanes

1. **Priority Lane (agents, FREE first mint):** if the wallet holds a SPACE ID `.ai` Agent ID, its first mint is FREE. Check on-chain first: call `holdsAgentId(wallet)` on the NFT contract.
2. **Public Lane (everyone, paid):** paid mints need NO Agent ID. Any wallet can mint paid trees.

## Price ladder (per wallet — read it from the contract, never hardcode it)

- Mint #1: FREE — but ONLY with an Agent ID and only once per wallet (`useFree=true`).
- Mint #2–10: 0.0002 BNB each
- Mint #11–20: 0.0004 BNB each
- Mint #21–30: 0.0008 BNB each
- Max 30 trees per wallet, ever.

How the ladder is priced on-chain: the contract prices by the wallet's mint index (count of already minted). Slot prices are 0.0002 for counts 0–9, 0.0004 for counts 10–19, 0.0008 for counts 20–29. So 30 paid mints cost 0.014 BNB; a bulk mint of 30 with the free mint costs 0.0132 BNB (the free mint lands on the highest-priced slot in the batch). **Max per wallet is therefore 0.014 BNB (30 paid, no free) or 0.0132 BNB (30 with free) — do not quote 0.0138 as the max.**

**Before minting, always call `quoteBulk(wallet, quantity, useFree)`** — it returns the exact BNB for the whole batch and which slot the free mint lands on. Send exactly that value (or more — any overpayment is refunded in the same transaction). Never guess the price.

## How to mint (bulk — up to 30 in ONE transaction)

Call `mint(uint256 quantity, bool useFree)` on the NFT contract:

- `quantity`: 1–30. One transaction mints the whole batch — never mint one by one.
- `useFree`: `true` to spend the wallet's one free mint on the highest-priced slot in this batch. Requires an Agent ID (`holdsAgentId` must be true) and `freeUsed(wallet)` must be false, otherwise the transaction reverts. `false` for a fully paid batch.
- `msg.value`: the exact `quoteBulk` total.
- Check first: `mintActive()` must be true, `mintCount(wallet) + quantity <= 30`, and `totalSupply() + quantity <= 3333`.

Example — an Agent ID wallet minting 30 at once with its free mint:

1. `holdsAgentId(wallet)` → true; `freeUsed(wallet)` → false.
2. `quoteBulk(wallet, 30, true)` → (0.0132 BNB, freeSlot 29).
3. `mint(30, true)` with 0.0132 BNB.

Example — a public wallet minting 5 paid trees:

1. `quoteBulk(wallet, 5, false)` → 0.001 BNB.
2. `mint(5, false)` with 0.001 BNB.

## $ZSAI bonus token

- Every **paid** mint automatically mints **120,000 ZSAI** to the minter in the same transaction. Free mints earn 0.
- Max supply 1,000,000,000 ZSAI: 540,000,000 bonus pool, 460,000,000 treasury (pre-minted to the owner at deploy).
- Max per wallet: 3,480,000 ZSAI (29 paid + 1 free). Worst case for the whole collection: 3,333 × 120,000 = 399,960,000 — inside the 540M pool.
- **$ZSAI has no price, no liquidity pool, and no guaranteed value.** It is a bonus for minters, not a promise. Never tell a user it is worth anything.

## Rules

- Never ask for a seed phrase or private key. The user signs in their own wallet.
- Mint only from the wallet that holds the Agent ID for the free mint — the contract checks `msg.sender`.
- If `mintActive()` is false, minting is closed. Do not try to work around it.
- Site: https://zensai-three.vercel.app/ — prices in BNB are NOT shown on the site; the exact price appears only here (in this skill) and in the wallet confirmation when you mint.
