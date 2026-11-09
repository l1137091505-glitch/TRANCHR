// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TRANCHR
/// @notice Experimental invoice-linked batch settlement with demo-only credits.
/// @dev TRCH has no cash value, no redemption right, and no fiat peg.
contract Tranchr {
    string public constant name = "TRANCHR Demo Credit";
    string public constant symbol = "TRCH";
    uint8 public constant decimals = 6;
    uint256 public constant CLAIM_AMOUNT = 1_000 * 10 ** decimals;
    uint256 public constant MAX_BATCH = 10;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public hasClaimed;
    mapping(address => mapping(uint256 => bool)) public invoiceSettled;

    error AlreadyClaimed();
    error InvalidBatch();
    error InvalidRecipient(uint256 index);
    error InvoiceAlreadySettled(uint256 invoiceId);
    error InsufficientBalance();
    error InsufficientAllowance();
    error TransferFailed();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event DemoCreditsClaimed(address indexed account, uint256 amount);
    event BatchSettled(bytes32 indexed batchId, address indexed payer, uint256 total, uint256 count);
    event InvoiceSettled(
        bytes32 indexed batchId,
        address indexed payer,
        uint256 indexed invoiceId,
        address recipient,
        uint256 amount,
        bytes32 noteHash
    );

    constructor() {
        _mint(msg.sender, 10_000 * 10 ** decimals);
    }

    function claimDemoCredits() external {
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        hasClaimed[msg.sender] = true;
        _mint(msg.sender, CLAIM_AMOUNT);
        emit DemoCreditsClaimed(msg.sender, CLAIM_AMOUNT);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 current = allowance[from][msg.sender];
        if (current < value) revert InsufficientAllowance();
        if (current != type(uint256).max) {
            allowance[from][msg.sender] = current - value;
            emit Approval(from, msg.sender, current - value);
        }
        _transfer(from, to, value);
        return true;
    }

    function settleBatch(
        uint256[] calldata invoiceIds,
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32[] calldata noteHashes
    ) external returns (bytes32 batchId) {
        uint256 count = invoiceIds.length;
        if (
            count == 0 || count > MAX_BATCH || recipients.length != count ||
            amounts.length != count || noteHashes.length != count
        ) revert InvalidBatch();

        uint256 total;
        for (uint256 i; i < count; ++i) {
            if (recipients[i] == address(0) || amounts[i] == 0) revert InvalidRecipient(i);
            if (invoiceSettled[msg.sender][invoiceIds[i]]) revert InvoiceAlreadySettled(invoiceIds[i]);
            total += amounts[i];
        }

        if (balanceOf[msg.sender] < total) revert InsufficientBalance();
        uint256 current = allowance[msg.sender][address(this)];
        if (current < total) revert InsufficientAllowance();

        allowance[msg.sender][address(this)] = current - total;
        emit Approval(msg.sender, address(this), current - total);

        batchId = keccak256(abi.encode(block.chainid, address(this), msg.sender, block.number, invoiceIds, total));
        for (uint256 i; i < count; ++i) {
            invoiceSettled[msg.sender][invoiceIds[i]] = true;
            _transfer(msg.sender, recipients[i], amounts[i]);
            emit InvoiceSettled(batchId, msg.sender, invoiceIds[i], recipients[i], amounts[i], noteHashes[i]);
        }
        emit BatchSettled(batchId, msg.sender, total, count);
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (to == address(0)) revert TransferFailed();
        uint256 balance = balanceOf[from];
        if (balance < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = balance - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}
