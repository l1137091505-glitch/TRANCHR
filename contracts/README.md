# TRANCHR contract

Compile `src/Tranchr.sol` with Solidity 0.8.24 and deploy it to BOT Chain Mainnet (chain ID 677). The constructor has no parameters.

The contract is both the demo ERC-20 token and the atomic batch settler, so the frontend needs one public address only. Each wallet can call `claimDemoCredits()` once for 1,000 TRCH. TRCH is a test credit with no cash value, no redemption right, and no fiat peg.

After deployment, set `VITE_TRANCHR_ADDRESS` to the complete contract address in Vercel, select Production, save, and redeploy without the old build cache.

Never upload a wallet private key. The public contract address is not a secret.
