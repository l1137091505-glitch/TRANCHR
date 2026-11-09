# TRANCHR

TRANCHR is an original invoice-linked batch settlement demo for BOT Chain Mainnet. It is inspired by the workflow of the reference product, but uses a new name, new contract, new interface, and new information architecture.

## What is included

- A Vite + TypeScript frontend in `frontend/`.
- One Solidity 0.8.24 contract in `contracts/src/Tranchr.sol`.
- EIP-6963 wallet discovery with an explicit provider picker.
- Fallback support for legacy injected wallets and mobile MetaMask deep links.
- BOT Chain network switching and network addition.
- One-time demo-credit claim, exact ERC-20 allowance, atomic settlement for 1–10 invoices, CSV import, local drafts, public receipt verification, and JSON proof export.
- A visible preview mode when no contract address is configured. Preview mode never simulates successful transactions.

TRCH is a demo credit with no cash value, no fiat peg, and no redemption promise. BOT Chain gas uses real BOT. The contract is experimental and unaudited.

## Local development

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Set `VITE_TRANCHR_ADDRESS` after the contract is deployed.

## Validation completed

- Frontend TypeScript and Vite production build passed.
- `Tranchr.sol` compiled with Solidity 0.8.24; creation bytecode is 7,820 bytes.
- Design copy lint passed with 0 failures and 0 warnings.
- The dealt `cursor-spotlight` moment passed the moment checker.
- The final headless browser gate could not start Chrome in this Windows environment. It reported no failure in the checks that ran, but consistency and layout screenshots were not produced.

