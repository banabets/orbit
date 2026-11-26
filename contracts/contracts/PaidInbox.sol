// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PaidInbox v2
/// @notice Wallet-to-wallet messages where strangers pay the recipient's price to reach them.
///         The recipient chooses which assets they accept (native ETH = address(0), or ERC-20
///         tokens such as PONS or USDG) and the price for each. Payment is escrowed until the
///         recipient replies (settled by their rule) or the message expires (refundable by anyone).
///         Message bodies are ciphertext produced client-side; the contract never sees plaintext.
contract PaidInbox {
    enum Rule {
        Refund, // recipient replies -> sender gets 100% back
        Keep, // recipient replies -> recipient keeps payment minus fee
        Split // recipient replies -> 50% back to sender, 50% to recipient minus fee
    }

    enum Status {
        None,
        Pending,
        Settled,
        Refunded
    }

    struct Inbox {
        bool registered;
        bool open; // anyone may write for free
        Rule rule;
        bytes32 encKey; // X25519 public key for client-side encryption
    }

    struct Payment {
        address from;
        address to;
        address asset; // address(0) = ETH
        uint256 amount;
        uint64 expiresAt;
        Status status;
    }

    address public constant ETH = address(0);
    uint256 public constant FEE_BPS = 500; // 5% of what the recipient keeps
    uint256 public constant TTL = 72 hours;

    address public immutable treasury;
    uint256 public nextId = 1;
    uint256 private messageCount;
    uint256 private locked = 1;

    mapping(address => Inbox) public inboxes;
    /// owner => asset => accepted
    mapping(address => mapping(address => bool)) public accepts;
    /// owner => asset => price in that asset's smallest unit
    mapping(address => mapping(address => uint256)) public prices;
    mapping(uint256 => Payment) public payments;
    /// recipient => sender => may write for free
    mapping(address => mapping(address => bool)) public isContact;

    event InboxSet(address indexed owner, bool open, Rule rule, bytes32 encKey);
    event PriceSet(address indexed owner, address indexed asset, uint256 price, bool accepted);
    event Message(uint256 indexed id, address indexed from, address indexed to, uint256 paymentId, bytes ciphertext);
    event MessagePaid(
        uint256 indexed paymentId, address indexed from, address indexed to, address asset, uint256 amount, uint64 expiresAt
    );
    event Settled(uint256 indexed paymentId, address asset, uint256 toRecipient, uint256 toSender, uint256 fee);
    event Refunded(uint256 indexed paymentId, address asset, uint256 amount);

    error NotRegistered();
    error NotAccepted(address asset);
    error WrongPayment(uint256 required, uint256 sent);
    error UnexpectedEth();
    error NotRecipient();
    error NotPending();
    error Expired();
    error NotExpired();
    error TransferFailed();
    error SelfMessage();

    modifier nonReentrant() {
        require(locked == 1, "reentrant");
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address treasury_) {
        treasury = treasury_;
    }

    /* ---------------- configuration ---------------- */

    function setInbox(bool open, Rule rule, bytes32 encKey) external {
        inboxes[msg.sender] = Inbox({registered: true, open: open, rule: rule, encKey: encKey});
        emit InboxSet(msg.sender, open, rule, encKey);
    }

    /// @notice Accept (or stop accepting) an asset at a given price.
    function setPrice(address asset, uint256 price, bool accepted) external {
        accepts[msg.sender][asset] = accepted;
        prices[msg.sender][asset] = price;
        emit PriceSet(msg.sender, asset, price, accepted);
    }

    /// @notice Convenience for first-time setup: inbox + up to several prices in one transaction.
    function configure(bool open, Rule rule, bytes32 encKey, address[] calldata assets, uint256[] calldata amounts)
        external
    {
        inboxes[msg.sender] = Inbox({registered: true, open: open, rule: rule, encKey: encKey});
        emit InboxSet(msg.sender, open, rule, encKey);
        for (uint256 i; i < assets.length; i++) {
            accepts[msg.sender][assets[i]] = true;
            prices[msg.sender][assets[i]] = amounts[i];
            emit PriceSet(msg.sender, assets[i], amounts[i], true);
        }
    }

    /* ---------------- views ---------------- */

    /// @notice Amount `from` must pay in `asset` to message `to` right now (0 if free).
    ///         Reverts with NotAccepted if payment is required and the asset is not accepted.
    function quote(address from, address to, address asset) public view returns (uint256) {
        Inbox memory ib = inboxes[to];
        if (!ib.registered) revert NotRegistered();
        if (ib.open || isContact[to][from]) return 0;
        if (!accepts[to][asset]) revert NotAccepted(asset);
        return prices[to][asset];
    }

    /* ---------------- messaging ---------------- */

    /// @notice Send a message, paying in `asset` when required. For ERC-20 the sender must
    ///         approve this contract for at least the quoted amount first.
    function send(address to, address asset, bytes calldata ciphertext)
        external
        payable
        nonReentrant
        returns (uint256 paymentId)
    {
        if (to == msg.sender) revert SelfMessage();
        uint256 required = quote(msg.sender, to, asset);

        if (required == 0) {
            if (msg.value != 0) revert UnexpectedEth();
        } else {
            uint256 received;
            if (asset == ETH) {
                if (msg.value != required) revert WrongPayment(required, msg.value);
                received = msg.value;
            } else {
                if (msg.value != 0) revert UnexpectedEth();
                received = _pull(asset, msg.sender, required);
            }
            paymentId = nextId++;
            uint64 expiresAt = uint64(block.timestamp + TTL);
            payments[paymentId] = Payment({
                from: msg.sender, to: to, asset: asset, amount: received, expiresAt: expiresAt, status: Status.Pending
            });
            emit MessagePaid(paymentId, msg.sender, to, asset, received, expiresAt);
        }
        emit Message(++messageCount, msg.sender, to, paymentId, ciphertext);
    }

    /// @notice Recipient answers a paid message. Settles by the recipient's rule and
    ///         makes both wallets contacts (future messages between them are free).
    function reply(uint256 paymentId, bytes calldata ciphertext) external nonReentrant {
        Payment storage p = payments[paymentId];
        if (p.status != Status.Pending) revert NotPending();
        if (msg.sender != p.to) revert NotRecipient();
        if (block.timestamp > p.expiresAt) revert Expired();

        p.status = Status.Settled;
        isContact[p.to][p.from] = true;
        isContact[p.from][p.to] = true;

        uint256 amount = p.amount;
        Rule rule = inboxes[p.to].rule;
        uint256 toSender;
        uint256 kept;
        if (rule == Rule.Refund) {
            toSender = amount;
        } else if (rule == Rule.Keep) {
            kept = amount;
        } else {
            toSender = amount / 2;
            kept = amount - toSender;
        }
        uint256 fee = (kept * FEE_BPS) / 10_000;
        uint256 toRecipient = kept - fee;

        emit Settled(paymentId, p.asset, toRecipient, toSender, fee);
        emit Message(++messageCount, msg.sender, p.from, 0, ciphertext);

        _pay(p.asset, p.from, toSender);
        _pay(p.asset, p.to, toRecipient);
        _pay(p.asset, treasury, fee);
    }

    /// @notice Anyone can return an expired, unanswered payment to its sender.
    function refund(uint256 paymentId) external nonReentrant {
        Payment storage p = payments[paymentId];
        if (p.status != Status.Pending) revert NotPending();
        if (block.timestamp <= p.expiresAt) revert NotExpired();
        p.status = Status.Refunded;
        emit Refunded(paymentId, p.asset, p.amount);
        _pay(p.asset, p.from, p.amount);
    }

    /* ---------------- asset movement ---------------- */

    /// Pulls `amount` of an ERC-20 and returns what actually arrived (handles fee-on-transfer tokens).
    function _pull(address token, address from, uint256 amount) private returns (uint256) {
        uint256 before = _balanceOf(token);
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(0x23b872dd, from, address(this), amount)); // transferFrom
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        return _balanceOf(token) - before;
    }

    function _pay(address asset, address to, uint256 amount) private {
        if (amount == 0) return;
        if (asset == ETH) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            (bool ok, bytes memory data) = asset.call(abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer
            if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        }
    }

    function _balanceOf(address token) private view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
        if (!ok || data.length < 32) revert TransferFailed();
        return abi.decode(data, (uint256));
    }
}
