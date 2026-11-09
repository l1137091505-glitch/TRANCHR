# TRANCHR

## First screen

Invoice batch settlement for BOT Chain operators.

Prepare up to 10 invoice-linked demo transfers. Every transfer settles together, or the whole batch reverts.

Primary: Prepare a batch
Secondary: Verify a receipt

Network: BOT Chain Mainnet · 677
Asset: TRCH demo credits · no cash value

## Batch workspace

### Build the payment run.

Each row needs an invoice reference, a recipient address, and an amount. Notes are hashed before settlement and are never sent as plain text.

Fields: Invoice reference; Recipient address; Amount in TRCH; Private note
Actions: Add an invoice; Import a CSV; Download the template; Remove row

Review: Invoice count; Batch total; Wallet balance; Current allowance
Readiness: Valid recipient; Positive amount; Unique invoice; Sufficient balance

Primary: Review the batch

### Approve the exact total.

Approval and settlement are two separate wallet confirmations. TRANCHR requests only the current batch total.

Primary: Approve the total

### Settle every invoice.

The contract checks the entire batch before moving any demo credits. A failed row reverts the transaction.

Primary: Settle the batch

## Receipt proof

### Verify a settlement without a wallet.

Paste a transaction hash. TRANCHR reads the BOT Chain receipt, confirms the contract, and reconstructs the invoice events.

Field: Transaction hash
Primary: Verify the receipt
Secondary: Export verified JSON

Results: Network; Contract; Payer; Block; Batch total; Invoice events; Transaction status

## Protocol

### Three checks before the receipt.

1. Prepare — The browser validates every row and keeps the draft on this device.
2. Approve — The wallet grants the contract only the batch total.
3. Settle — The contract transfers every invoice atomically and emits public evidence.

## Safety

### Demo credits are not money.

TRCH has no cash value, no fiat peg, and no redemption promise. BOT Chain gas uses real BOT. Review the network, contract address, recipients, and total in your wallet before confirming.

The contract is experimental and unaudited. Use small test amounts.

Actions: Open the block explorer; Copy the contract address

## Wallet and system states

Connect a wallet
Choose a wallet
Change wallet
Switch to BOT Chain
Open in MetaMask
Copy address
Disconnect

No injected wallet was found. Install a compatible wallet or open this page in a wallet browser.
Your wallet request is already open. Finish it in the extension.
Connection was cancelled. No account was changed.
This wallet has not authorised account access.
The selected network is not BOT Chain Mainnet.
The configured contract does not exist on BOT Chain Mainnet.
Preview mode: deploy the contract and set VITE_TRANCHR_ADDRESS before sending transactions.

Claim demo credits
Demo credits claimed.
This wallet has already claimed its demo credits.

Draft saved on this device.
CSV imported.
The CSV needs invoice, recipient, amount, and note columns.
Review every imported address before approval.

Approval confirmed.
Settlement confirmed.
The transaction reverted. No invoice in this batch was settled.
Receipt verified.
This transaction was not sent to the configured contract.
No TRANCHR settlement events were found in this receipt.

