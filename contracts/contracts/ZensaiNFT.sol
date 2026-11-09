// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// ============================================================
// ZENSAI — 3,333 16-bit pixel bonsai NFT
// ERC-721, BNB Smart Chain Mainnet (Chain ID 56)
// ------------------------------------------------------------
// Concept from PanduAGENT (panduagent.vercel.app), look
// deliberately DIFFERENT (calm zen garden, not street):
// - Two lanes. FREE mint (#1 per wallet) is for Agent ID
//   holders only, via their agent. PAID mints are open
//   to EVERYONE (no Agent ID needed), from this page
//   with any wallet or via an agent.
// - Sequential token IDs 1..3333. The token ID decides
//   the variant — no gacha deck, no deckHash, no shuffle.
//   Rarity is a pure function of the ID range:
//     Common    1-1667    Pine Bonsai        1,667
//     Uncommon  1668-2500 Juniper Bonsai       833
//     Rare      2501-3000 Sakura Bonsai         500
//     Epic      3001-3217 Wisteria Bonsai       217
//     Legendary 3218-3333 Golden Pine Bonsai    116
//   Reveal is instant: what you mint is what you get.
// - PRICE LADDER PER WALLET (locked, no setter):
//     mint #1 (no free) : 0.0002 BNB
//     mint #2-10        : 0.0002 BNB each
//     mint #11-20       : 0.0004 BNB each
//     mint #21-30       : 0.0008 BNB each
//     mint #31+         : REVERTS (max 30 per wallet)
//   The #1 FREE mint is a choice (useFree), 1 per wallet,
//   Agent ID required. In a bulk mint the free mint lands
//   on the HIGHEST-priced slot in the batch.
//   Ladder math (slot = wallet's mint index, 1-based):
//   30 paid mints = 10x0.0002 + 10x0.0004 + 10x0.0008
//   = 0.014 BNB. With the free mint on the highest-priced
//   slot: 0.014 - 0.0008 = 0.0132 BNB for 30 tokens.
//   Max per wallet is therefore 0.014 BNB (30 paid,
//   no free) or 0.0132 BNB (30 with free). Do NOT quote
//   0.0138 as the max: that figure was 29 paid + 1 free
//   under a different counting (9x0.0002+10x0.0004+
//   10x0.0008). Contract kept as built and tested;
//   this is a copy correction only, no logic change.)
// - $ZSAI BONUS: every PAID mint also mints 120,000 $ZSAI
//   to the minter (free mint: 0), via ZensaiToken.sol.
//   Max per wallet 29 paid + free = 3,480,000 $ZSAI;
//   worst case 30 paid = 3,600,000. Worst case for the
//   whole collection: 3,333 x 120,000 = 399,960,000,
//   inside the 540,000,000 bonus pool. $ZSAI has NO
//   price, NO liquidity pool, NO guaranteed value.
// - BULK MINT: mint(quantity, useFree) mints 1-30 in ONE
//   transaction. No one-by-one minting needed.
// - Agent ID check uses a low-level staticcall on the
//   public SPACE ID registry (same as Zigzoo v2 / THYRK):
//   0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F.
//   It gates ONLY the free mint. Paid mints are public.
// - NO NoContracts check: paid mints must work from
//   browser wallets and smart wallets alike.
// - Funds: each paid mint forwards the exact batch price
//   DIRECTLY to the revenue wallet (Binance Agentic
//   Wallet) in the same mint() call. Mint payments NEVER
//   sit in this contract. Overpayment is refunded in
//   the same call. withdraw() is only a safety valve
//   for BNB that arrives outside mint().
// - Royalty: ERC-2981, 5%, receiver = Agentic Wallet.
// - Owner = Bryan's My Wallet. Revenue = Agentic Wallet.
// - NO bonus token in v1. No burn / upgrade / redeem.
//   A token can be added later as a separate contract.
//
// This contract is SOURCE-VERIFIABLE on BscScan.
// It is NOT an independent audit.
// ============================================================

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./ZensaiToken.sol";

contract ZensaiNFT is ERC721, ERC721Royalty, Ownable, ReentrancyGuard {
    using Strings for uint256;

    uint8 public constant RARITY_COMMON = 0;
    uint8 public constant RARITY_UNCOMMON = 1;
    uint8 public constant RARITY_RARE = 2;
    uint8 public constant RARITY_EPIC = 3;
    uint8 public constant RARITY_LEGENDARY = 4;

    uint256 public constant MAX_SUPPLY = 3333;
    uint256 public constant MAX_PER_WALLET = 30;

    uint256 public constant PRICE_1_10 = 0.0002 ether;
    uint256 public constant PRICE_11_20 = 0.0004 ether;
    uint256 public constant PRICE_21_30 = 0.0008 ether;

    uint96 public constant ROYALTY_BPS = 500; // 5%

    /// @notice $ZSAI bonus per PAID mint. Free mint earns 0.
    uint256 public constant MINT_BONUS = 120000 ether;

    address public constant DEFAULT_AGENT_ID_REGISTRY =
        0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    // Tier ID ranges (inclusive).
    uint256 public constant COMMON_START = 1;
    uint256 public constant COMMON_END = 1667;
    uint256 public constant UNCOMMON_START = 1668;
    uint256 public constant UNCOMMON_END = 2500;
    uint256 public constant RARE_START = 2501;
    uint256 public constant RARE_END = 3000;
    uint256 public constant EPIC_START = 3001;
    uint256 public constant EPIC_END = 3217;
    uint256 public constant LEGENDARY_START = 3218;
    uint256 public constant LEGENDARY_END = 3333;

    bool public mintActive;
    address public immutable revenueWallet;
    ZensaiToken public immutable zensaiToken;
    address public agentIdRegistry;
    bool public agentIdCheckRequired = true;

    string private _baseTokenURI;
    uint256 private _nextTokenId = 1;

    mapping(address => uint256) public mintCount;
    mapping(address => bool) public freeUsed;

    event Minted(address indexed minter, uint256 indexed tokenId, uint256 price, uint8 rarity, bool isFree);
    event MintActiveChanged(bool active);
    event BaseURIUpdated(string baseURI);
    event AgentIdRegistryUpdated(address indexed agentIdRegistry);
    event AgentIdCheckChanged(bool required);
    event Withdrawn(address indexed revenueWallet, uint256 amount);

    error MintInactive();
    error ExceedsMaxSupply();
    error SoldOut();
    error IncorrectPayment(uint256 expected, uint256 received);
    error InvalidAddress();
    error NoFunds();
    error NoAgentId();
    error MaxPerWallet();
    error PaymentForwardFailed();
    error RefundFailed();
    error FreeAlreadyUsed();

    constructor(
        address initialOwner,
        address revenueWallet_,
        address agentIdRegistry_,
        string memory baseURI_,
        address zensaiToken_
    ) ERC721("ZENSAI", "ZSAI") Ownable(initialOwner) {
        if (initialOwner == address(0) || revenueWallet_ == address(0) || agentIdRegistry_ == address(0) || zensaiToken_ == address(0)) {
            revert InvalidAddress();
        }
        revenueWallet = revenueWallet_;
        agentIdRegistry = agentIdRegistry_;
        zensaiToken = ZensaiToken(zensaiToken_);
        _baseTokenURI = baseURI_;
        _setDefaultRoyalty(revenueWallet_, ROYALTY_BPS);
    }

    // ---------- read-only ----------

    function totalSupply() public view returns (uint256) {
        return _nextTokenId - 1;
    }

    function remainingSupply() public view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    /// @notice Price of a wallet's Nth mint slot (count = already minted).
    function priceForCount(uint256 count) public pure returns (uint256) {
        if (count < 10) return PRICE_1_10;
        if (count < 20) return PRICE_11_20;
        return PRICE_21_30;
    }

    function priceFor(address wallet) public view returns (uint256) {
        uint256 count = mintCount[wallet];
        if (count >= MAX_PER_WALLET) revert MaxPerWallet();
        return priceForCount(count);
    }

    function currentPrice() public view returns (uint256) {
        if (totalSupply() >= MAX_SUPPLY) revert SoldOut();
        return priceFor(msg.sender);
    }

    function quoteBulk(address wallet, uint256 quantity, bool useFree)
        external
        view
        returns (uint256 totalPrice, uint256 freeSlot)
    {
        return _quoteBulk(wallet, quantity, useFree);
    }

    function _quoteBulk(address wallet, uint256 quantity, bool useFree)
        internal
        view
        returns (uint256 totalPrice, uint256 freeSlot)
    {
        if (quantity == 0 || quantity > MAX_PER_WALLET) revert MaxPerWallet();
        uint256 count = mintCount[wallet];
        if (count + quantity > MAX_PER_WALLET) revert MaxPerWallet();
        if (totalSupply() + quantity > MAX_SUPPLY) revert SoldOut();
        if (useFree && freeUsed[wallet]) revert FreeAlreadyUsed();
        uint256 maxPrice;
        freeSlot = type(uint256).max;
        for (uint256 i = 0; i < quantity; i++) {
            uint256 p = priceForCount(count + i);
            totalPrice += p;
            if (useFree && p >= maxPrice) {
                maxPrice = p;
                freeSlot = i;
            }
        }
        if (useFree) totalPrice -= maxPrice;
    }

    /// @notice Rarity of a token ID by its range. Works for unminted IDs too.
    function rarityOf(uint256 tokenId) public pure returns (uint8) {
        if (tokenId == 0 || tokenId > MAX_SUPPLY) revert ExceedsMaxSupply();
        if (tokenId <= COMMON_END) return RARITY_COMMON;
        if (tokenId <= UNCOMMON_END) return RARITY_UNCOMMON;
        if (tokenId <= RARE_END) return RARITY_RARE;
        if (tokenId <= EPIC_END) return RARITY_EPIC;
        return RARITY_LEGENDARY;
    }

    function variantOf(uint256 tokenId) public pure returns (string memory) {
        if (tokenId == 0 || tokenId > MAX_SUPPLY) revert ExceedsMaxSupply();
        if (tokenId <= COMMON_END) return "Pine Bonsai";
        if (tokenId <= UNCOMMON_END) return "Juniper Bonsai";
        if (tokenId <= RARE_END) return "Sakura Bonsai";
        if (tokenId <= EPIC_END) return "Wisteria Bonsai";
        return "Golden Pine Bonsai";
    }

    function tierRange(uint8 rarity) public pure returns (uint256 start, uint256 end) {
        if (rarity == RARITY_COMMON) return (COMMON_START, COMMON_END);
        if (rarity == RARITY_UNCOMMON) return (UNCOMMON_START, UNCOMMON_END);
        if (rarity == RARITY_RARE) return (RARE_START, RARE_END);
        if (rarity == RARITY_EPIC) return (EPIC_START, EPIC_END);
        if (rarity == RARITY_LEGENDARY) return (LEGENDARY_START, LEGENDARY_END);
        revert ExceedsMaxSupply();
    }

    function holdsAgentId(address wallet) public view returns (bool) {
        if (agentIdRegistry == address(0)) return false;
        (bool ok, bytes memory data) = agentIdRegistry.staticcall(
            abi.encodeWithSelector(IERC721.balanceOf.selector, wallet)
        );
        if (!ok || data.length < 32) return false;
        return abi.decode(data, (uint256)) > 0;
    }

    // ---------- minting ----------

    /// @notice Mint `quantity` ZENSAI (1-30) in ONE transaction.
    /// useFree spends the wallet's 1 free mint (Agent ID
    /// required) on the highest-priced slot in the batch.
    /// Paid mints are open to everyone — no Agent ID needed.
    function mint(uint256 quantity, bool useFree) external payable nonReentrant {
        if (!mintActive) revert MintInactive();
        if (useFree && agentIdCheckRequired && !holdsAgentId(msg.sender)) revert NoAgentId();

        (uint256 totalPrice, uint256 freeSlot) = _quoteBulk(msg.sender, quantity, useFree);
        if (msg.value < totalPrice) revert IncorrectPayment(totalPrice, msg.value);

        for (uint256 i = 0; i < quantity; i++) {
            bool isFree = useFree && (i == freeSlot);
            uint256 tokenId = _nextTokenId++;
            uint256 slotPrice = isFree ? 0 : priceForCount(mintCount[msg.sender]);
            mintCount[msg.sender]++;
            if (isFree) {
                freeUsed[msg.sender] = true;
            } else {
                zensaiToken.mint(msg.sender, MINT_BONUS);
            }
            _mint(msg.sender, tokenId);
            emit Minted(msg.sender, tokenId, slotPrice, rarityOf(tokenId), isFree);
        }

        if (totalPrice > 0) {
            (bool ok, ) = revenueWallet.call{value: totalPrice}("");
            if (!ok) revert PaymentForwardFailed();
        }
        uint256 excess = msg.value - totalPrice;
        if (excess > 0) {
            (bool rok, ) = msg.sender.call{value: excess}("");
            if (!rok) revert RefundFailed();
        }
    }

    // ---------- metadata ----------

    function baseURI() public view returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert ERC721NonexistentToken(tokenId);
        return string.concat(_baseTokenURI, tokenId.toString(), ".json");
    }

    // ---------- owner-only ----------

    function setMintActive(bool active) external onlyOwner {
        mintActive = active;
        emit MintActiveChanged(active);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    function setAgentIdRegistry(address agentIdRegistry_) external onlyOwner {
        if (agentIdRegistry_ == address(0)) revert InvalidAddress();
        agentIdRegistry = agentIdRegistry_;
        emit AgentIdRegistryUpdated(agentIdRegistry_);
    }

    function setAgentIdCheckRequired(bool required) external onlyOwner {
        agentIdCheckRequired = required;
        emit AgentIdCheckChanged(required);
    }

    function withdraw() external onlyOwner nonReentrant {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NoFunds();
        (bool ok, ) = revenueWallet.call{value: amount}("");
        if (!ok) revert("Withdraw failed");
        emit Withdrawn(revenueWallet, amount);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Royalty)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
