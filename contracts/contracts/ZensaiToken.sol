// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// ============================================================
// $ZSAI — the ZENSAI bonus token (BEP-20 / ERC-20)
// BNB Smart Chain Mainnet (Chain ID 56)
// ------------------------------------------------------------
// - Name "Zensai Token", symbol "ZSAI", 18 decimals.
// - Max supply 1,000,000,000, enforced on-chain by
//   ERC20Capped. NOTHING may mint above the cap.
// - Allocation (mirrors PanduAGENT's $PNDX split):
//     Treasury    460,000,000 — pre-minted to the owner
//                   at deploy (constructor).
//     Bonus pool  540,000,000 — minted ONLY by the
//                   ZensaiNFT contract, 120,000 $ZSAI
//                   per PAID mint, free mint earns 0.
//                   Tracked on-chain as bonusMinted;
//                   mint() reverts past the pool.
// - Worst case for the pool: every one of the 3,333
//   NFTs is a paid mint: 3,333 x 120,000 = 399,960,000
//   $ZSAI — inside the 540,000,000 pool, with
//   140,040,000 unminted headroom. Max per wallet:
//   29 paid + 1 free = 3,480,000; 30 paid (no free)
//   = 3,600,000.
// - $ZSAI is a BONUS for minters, not a promise: it has
//   NO price, NO liquidity pool, and NO guaranteed value.
//   If a pool ever exists, it will be announced — never
//   assumed.
// - Minting is restricted to authorized minters (the
//   ZensaiNFT contract). The owner manages the minter
//   list; the owner itself cannot mint. Deploy order:
//   (1) deploy ZensaiToken, (2) deploy ZensaiNFT with
//   the token address, (3) owner calls
//   token.setMinter(nftAddress, true). Until step (3),
//   every PAID mint reverts (NotMinter) — by design,
//   so a deploy that skips it fails loudly instead of
//   silently paying no bonus.
// - Owner = Bryan's My Wallet
//   0x0262e8e5E4584D8AB840fD950a6E2E0A414d4097.
//
// This contract is SOURCE-VERIFIABLE on BscScan.
// It is NOT an independent audit.
// ============================================================

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ZensaiToken is ERC20, ERC20Burnable, ERC20Capped, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;
    uint256 public constant TREASURY = 460_000_000 ether;
    uint256 public constant BONUS_POOL = 540_000_000 ether;

    /// @notice $ZSAI per PAID NFT mint (mirrors the NFT side).
    uint256 public constant BONUS_PER_PAID_MINT = 120_000 ether;

    mapping(address => bool) public minters;

    /// @notice $ZSAI minted from the bonus pool so far.
    uint256 public bonusMinted;

    event MinterSet(address indexed minter, bool allowed);

    error NotMinter();
    error BonusPoolExhausted();

    constructor(address initialOwner)
        ERC20("Zensai Token", "ZSAI")
        ERC20Capped(MAX_SUPPLY)
        Ownable(initialOwner)
    {
        _mint(initialOwner, TREASURY);
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped)
    {
        super._update(from, to, value);
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    /// @notice Mint $ZSAI to `to`. Only authorized minters
    /// (ZensaiNFT, per paid mint). Enforces the bonus pool
    /// on top of the ERC20Capped total cap.
    function mint(address to, uint256 amount) external {
        if (!minters[msg.sender]) revert NotMinter();
        if (bonusMinted + amount > BONUS_POOL) revert BonusPoolExhausted();
        bonusMinted += amount;
        _mint(to, amount);
    }

    /// @notice Bonus pool still unminted.
    function bonusRemaining() public view returns (uint256) {
        return BONUS_POOL - bonusMinted;
    }
}
