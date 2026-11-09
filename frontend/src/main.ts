import {
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  formatUnits,
  getAddress,
  isAddress,
  isHexString,
  keccak256,
  parseUnits,
  toUtf8Bytes,
  type Eip1193Provider,
  type Log,
} from "ethers";

const CHAIN_ID = 677;
const CHAIN_HEX = "0x2a5";
const RPC_URL = "https://rpc.botchain.ai";
const EXPLORER_URL = "https://scan.botchain.ai";
const DECIMALS = 6;
const MAX_ROWS = 10;
const CONTRACT_ADDRESS = String(import.meta.env.VITE_TRANCHR_ADDRESS || "").trim();
const contractConfigured = isAddress(CONTRACT_ADDRESS);

const ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function hasClaimed(address) view returns (bool)",
  "function claimDemoCredits()",
  "function approve(address,uint256) returns (bool)",
  "function settleBatch(uint256[],address[],uint256[],bytes32[]) returns (bytes32)",
  "event BatchSettled(bytes32 indexed batchId,address indexed payer,uint256 total,uint256 count)",
  "event InvoiceSettled(bytes32 indexed batchId,address indexed payer,uint256 indexed invoiceId,address recipient,uint256 amount,bytes32 noteHash)",
  "event DemoCreditsClaimed(address indexed account,uint256 amount)",
] as const;

const iface = new Interface(ABI);
const readProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });

type ProviderInfo = {
  uuid: string;
  name: string;
  icon?: string;
  rdns?: string;
};

type ProviderDetail = { info: ProviderInfo; provider: Eip1193Provider };

type InvoiceDraft = {
  invoice: string;
  recipient: string;
  amount: string;
  note: string;
};

type VerifiedReceipt = {
  transactionHash: string;
  network: string;
  contract: string;
  payer: string;
  blockNumber: number;
  status: number;
  batchId: string;
  total: string;
  count: number;
  invoices: Array<{ invoiceId: string; recipient: string; amount: string; noteHash: string }>;
  verifiedAt: string;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      providers?: Eip1193Provider[];
      isMetaMask?: boolean;
      isCoinbaseWallet?: boolean;
      isBraveWallet?: boolean;
    };
  }
}

const $ = <T extends HTMLElement>(selector: string) => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
};

const walletButton = $("#walletButton") as HTMLButtonElement;
const walletDialog = $("#walletDialog") as HTMLDialogElement;
const walletOptions = $("#walletOptions");
const mobileWalletLink = $("#mobileWalletLink") as HTMLAnchorElement;
const invoiceRows = $("#invoiceRows");
const rowTemplate = $("#invoiceRowTemplate") as HTMLTemplateElement;
const addRowButton = $("#addRow") as HTMLButtonElement;
const addRowBottom = $("#addRowBottom") as HTMLButtonElement;
const claimButton = $("#claimButton") as HTMLButtonElement;
const approveButton = $("#approveButton") as HTMLButtonElement;
const settleButton = $("#settleButton") as HTMLButtonElement;
const verifyButton = $("#verifyButton") as HTMLButtonElement;
const exportReceipt = $("#exportReceipt") as HTMLButtonElement;
const statusLine = $("#statusLine");
const previewNotice = $("#previewNotice");
const footerContract = $("#footerContract");

let providers: ProviderDetail[] = [];
let selectedProvider: Eip1193Provider | null = null;
let browserProvider: BrowserProvider | null = null;
let account = "";
let currentChain = 0;
let balance = 0n;
let allowance = 0n;
let verifiedReceipt: VerifiedReceipt | null = null;
let busy = false;

const draftKey = () => `tranchr:draft:${account || "guest"}`;
const historyKey = () => `tranchr:history:${CHAIN_ID}:${account.toLowerCase()}`;

function shortAddress(value: string, left = 6, right = 4) {
  return value ? `${value.slice(0, left)}…${value.slice(-right)}` : "—";
}

function setStatus(message: string, state: "neutral" | "success" | "error" = "neutral") {
  statusLine.textContent = message;
  statusLine.classList.toggle("success", state === "success");
  statusLine.classList.toggle("error", state === "error");
}

function friendlyError(error: unknown) {
  const candidate = error as { code?: number | string; shortMessage?: string; message?: string; info?: { error?: { message?: string } } };
  const code = candidate?.code;
  const raw = candidate?.shortMessage || candidate?.info?.error?.message || candidate?.message || String(error);
  if (code === 4001 || /user rejected|user denied/i.test(raw)) return "The wallet request was cancelled. No account or token state was changed.";
  if (code === 4100 || /unauthori[sz]ed/i.test(raw)) return "This wallet has not authorised account access. Connect it again and approve the account request.";
  if (code === -32002 || /already pending/i.test(raw)) return "Your wallet request is already open. Finish it in the extension.";
  if (/AlreadyClaimed/i.test(raw)) return "This wallet has already claimed its demo credits.";
  if (/InsufficientAllowance/i.test(raw)) return "The approved amount is lower than this batch total. Approve the exact total first.";
  if (/InsufficientBalance/i.test(raw)) return "The wallet does not hold enough TRCH demo credits for this batch.";
  if (/InvoiceAlreadySettled/i.test(raw)) return "One invoice reference in this batch was already settled by this wallet.";
  if (/missing revert data/i.test(raw)) return "The contract rejected this call without readable revert data. Check the network, contract address, allowance, and wallet balance.";
  return raw.replace(/^Error:\s*/i, "").slice(0, 360);
}

function providerName(provider: Eip1193Provider, index: number) {
  const candidate = provider as Eip1193Provider & { isMetaMask?: boolean; isCoinbaseWallet?: boolean; isBraveWallet?: boolean };
  if (candidate.isBraveWallet) return "Brave Wallet";
  if (candidate.isCoinbaseWallet) return "Coinbase Wallet";
  if (candidate.isMetaMask) return "MetaMask";
  return index ? `Browser wallet ${index + 1}` : "Browser wallet";
}

function addProvider(detail: ProviderDetail) {
  if (providers.some((item) => item.info.uuid === detail.info.uuid || item.provider === detail.provider)) return;
  providers.push(detail);
  renderWalletOptions();
}

function discoverProviders() {
  window.addEventListener("eip6963:announceProvider", ((event: CustomEvent<ProviderDetail>) => addProvider(event.detail)) as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  const injected = window.ethereum;
  const fallbacks = injected?.providers?.length ? injected.providers : injected ? [injected] : [];
  fallbacks.forEach((provider, index) => addProvider({
    info: { uuid: `legacy-${index}`, name: providerName(provider, index) },
    provider,
  }));
  setTimeout(renderWalletOptions, 350);
}

function renderWalletOptions() {
  walletOptions.replaceChildren();
  if (!providers.length) {
    const empty = document.createElement("div");
    empty.className = "wallet-option";
    empty.innerHTML = "<div><strong>No injected wallet found</strong><span>Install a compatible extension or use the wallet browser link below.</span></div>";
    walletOptions.append(empty);
    return;
  }
  providers.forEach((detail) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wallet-option";
    const icon = detail.info.icon && /^data:image\//.test(detail.info.icon) ? `<img src="${detail.info.icon}" alt="">` : "";
    button.innerHTML = `${icon}<div><strong>${detail.info.name}</strong><span>${detail.info.rdns || "Injected browser provider"}</span></div>`;
    button.addEventListener("click", () => connectProvider(detail.provider));
    walletOptions.append(button);
  });
}

async function ensureBotChain(provider: Eip1193Provider) {
  const chainHex = await provider.request({ method: "eth_chainId" }) as string;
  if (Number.parseInt(chainHex, 16) === CHAIN_ID) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902 && code !== -32603) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CHAIN_HEX,
        chainName: "BOT Chain Mainnet",
        nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
        rpcUrls: [RPC_URL],
        blockExplorerUrls: [EXPLORER_URL],
      }],
    });
  }
}

function attachProviderEvents(provider: Eip1193Provider) {
  const eventProvider = provider as Eip1193Provider & {
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  };
  eventProvider.on?.("accountsChanged", async (accounts: unknown) => {
    const list = accounts as string[];
    account = list?.[0] ? getAddress(list[0]) : "";
    if (!account) {
      disconnectWallet("The wallet disconnected its active account.");
      return;
    }
    await refreshWalletState();
    renderWalletButton();
  });
  eventProvider.on?.("chainChanged", async (value: unknown) => {
    currentChain = Number.parseInt(String(value), 16);
    renderWalletButton();
    if (currentChain === CHAIN_ID) await refreshWalletState();
  });
  eventProvider.on?.("disconnect", () => disconnectWallet("The wallet provider disconnected."));
}

async function connectProvider(provider: Eip1193Provider) {
  if (busy) return;
  busy = true;
  try {
    selectedProvider = provider;
    await ensureBotChain(provider);
    const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
    if (!accounts?.length) throw new Error("This wallet returned no authorised account.");
    browserProvider = new BrowserProvider(provider, "any");
    account = getAddress(accounts[0]);
    currentChain = Number((await browserProvider.getNetwork()).chainId);
    attachProviderEvents(provider);
    walletDialog.close();
    renderWalletButton();
    await refreshWalletState();
    restoreDraft();
    setStatus(`Connected ${shortAddress(account)} on BOT Chain Mainnet.`, "success");
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    busy = false;
  }
}

function disconnectWallet(message = "Wallet disconnected from this page.") {
  selectedProvider = null;
  browserProvider = null;
  account = "";
  currentChain = 0;
  balance = 0n;
  allowance = 0n;
  renderWalletButton();
  updateReview();
  setStatus(message);
}

function renderWalletButton() {
  if (!account) {
    walletButton.textContent = "Connect a wallet";
    walletButton.title = "Choose an injected wallet";
    return;
  }
  walletButton.textContent = currentChain === CHAIN_ID ? shortAddress(account) : "Switch to BOT Chain";
  walletButton.title = currentChain === CHAIN_ID ? `Connected account ${account}. Click to change wallet.` : "Click to switch network";
}

async function assertContract() {
  if (!contractConfigured) throw new Error("Preview mode: deploy the contract and configure VITE_TRANCHR_ADDRESS first.");
  const code = await readProvider.getCode(CONTRACT_ADDRESS);
  if (code === "0x") throw new Error("The configured contract does not exist on BOT Chain Mainnet.");
}

async function refreshWalletState() {
  if (!account || !contractConfigured) {
    updateReview();
    return;
  }
  try {
    await assertContract();
    const contract = new Contract(CONTRACT_ADDRESS, ABI, readProvider);
    [balance, allowance] = await Promise.all([
      contract.balanceOf(account) as Promise<bigint>,
      contract.allowance(account, CONTRACT_ADDRESS) as Promise<bigint>,
    ]);
    updateReview();
  } catch (error) {
    setStatus(friendlyError(error), "error");
  }
}

function getRows(): InvoiceDraft[] {
  return [...invoiceRows.querySelectorAll<HTMLElement>(".invoice-row")].map((row) => ({
    invoice: (row.querySelector<HTMLInputElement>(".invoice-id")?.value || "").trim(),
    recipient: (row.querySelector<HTMLInputElement>(".recipient")?.value || "").trim(),
    amount: (row.querySelector<HTMLInputElement>(".amount")?.value || "").trim(),
    note: (row.querySelector<HTMLInputElement>(".note")?.value || "").trim(),
  }));
}

function appendRow(data: Partial<InvoiceDraft> = {}) {
  if (invoiceRows.children.length >= MAX_ROWS) {
    setStatus(`A payment run can contain at most ${MAX_ROWS} invoices.`, "error");
    return;
  }
  const fragment = rowTemplate.content.cloneNode(true) as DocumentFragment;
  const row = fragment.querySelector<HTMLElement>(".invoice-row")!;
  row.querySelector<HTMLInputElement>(".invoice-id")!.value = data.invoice || "";
  row.querySelector<HTMLInputElement>(".recipient")!.value = data.recipient || "";
  row.querySelector<HTMLInputElement>(".amount")!.value = data.amount || "";
  row.querySelector<HTMLInputElement>(".note")!.value = data.note || "";
  row.addEventListener("input", handleDraftChange);
  row.querySelector(".remove-row")?.addEventListener("click", () => {
    if (invoiceRows.children.length === 1) {
      row.querySelectorAll<HTMLInputElement>("input").forEach((input) => input.value = "");
    } else {
      row.remove();
    }
    renumberRows();
    saveDraft();
    updateReview();
  });
  invoiceRows.append(fragment);
  renumberRows();
  updateReview();
}

function renumberRows() {
  [...invoiceRows.querySelectorAll<HTMLElement>(".invoice-row")].forEach((row, index) => {
    const number = row.querySelector(".row-number");
    if (number) number.textContent = String(index + 1).padStart(2, "0");
  });
  const atLimit = invoiceRows.children.length >= MAX_ROWS;
  addRowButton.disabled = atLimit;
  addRowBottom.toggleAttribute("hidden", atLimit);
}

function handleDraftChange() {
  saveDraft();
  updateReview();
}

function saveDraft() {
  localStorage.setItem(draftKey(), JSON.stringify(getRows()));
  setStatus("Draft saved on this device.");
}

function restoreDraft() {
  const raw = localStorage.getItem(draftKey()) || localStorage.getItem("tranchr:draft:guest");
  if (!raw) return;
  try {
    const rows = JSON.parse(raw) as InvoiceDraft[];
    if (!Array.isArray(rows) || !rows.length) return;
    invoiceRows.replaceChildren();
    rows.slice(0, MAX_ROWS).forEach(appendRow);
  } catch {
    localStorage.removeItem(draftKey());
  }
}

function validateRows(mark = false) {
  const rows = getRows();
  const ids = new Set<string>();
  let validRecipients = true;
  let validAmounts = true;
  let validInvoices = true;
  let total = 0n;

  [...invoiceRows.querySelectorAll<HTMLElement>(".invoice-row")].forEach((element, index) => {
    const row = rows[index];
    const invoiceInput = element.querySelector<HTMLInputElement>(".invoice-id")!;
    const recipientInput = element.querySelector<HTMLInputElement>(".recipient")!;
    const amountInput = element.querySelector<HTMLInputElement>(".amount")!;
    const invoiceOkay = /^\d+$/.test(row.invoice) && BigInt(row.invoice || "0") > 0n && !ids.has(row.invoice);
    const recipientOkay = isAddress(row.recipient) && row.recipient !== "0x0000000000000000000000000000000000000000";
    let amountOkay = false;
    try {
      const parsed = parseUnits(row.amount || "0", DECIMALS);
      amountOkay = parsed > 0n;
      if (amountOkay) total += parsed;
    } catch {
      amountOkay = false;
    }
    if (/^\d+$/.test(row.invoice)) ids.add(row.invoice);
    validInvoices &&= invoiceOkay;
    validRecipients &&= recipientOkay;
    validAmounts &&= amountOkay;
    if (mark) {
      invoiceInput.classList.toggle("invalid", !invoiceOkay);
      recipientInput.classList.toggle("invalid", !recipientOkay);
      amountInput.classList.toggle("invalid", !amountOkay);
    }
  });

  return { rows, validRecipients, validAmounts, validInvoices, total, all: validRecipients && validAmounts && validInvoices };
}

function updateReview() {
  const validation = validateRows(false);
  $("#invoiceCount").textContent = `${validation.rows.length} / ${MAX_ROWS}`;
  $("#batchTotal").textContent = `${formatUnits(validation.total, DECIMALS)} TRCH`;
  $("#walletBalance").textContent = account ? `${formatUnits(balance, DECIMALS)} TRCH` : "Connect wallet";
  $("#walletAllowance").textContent = account ? `${formatUnits(allowance, DECIMALS)} TRCH` : "Connect wallet";
  const states: Record<string, boolean> = {
    recipient: validation.validRecipients,
    amount: validation.validAmounts,
    invoice: validation.validInvoices,
    balance: !!account && balance >= validation.total && validation.total > 0n,
  };
  Object.entries(states).forEach(([key, okay]) => {
    document.querySelector(`[data-check="${key}"]`)?.classList.toggle("ok", okay);
  });
  $("#reviewState").textContent = validation.all && states.balance ? "Ready" : "Draft";
  claimButton.disabled = !account || currentChain !== CHAIN_ID || !contractConfigured || busy;
  approveButton.disabled = !account || !validation.all || validation.total === 0n || currentChain !== CHAIN_ID || !contractConfigured || busy;
  settleButton.disabled = !account || !validation.all || validation.total === 0n || balance < validation.total || allowance < validation.total || currentChain !== CHAIN_ID || !contractConfigured || busy;
}

async function writeContract(action: "claim" | "approve" | "settle") {
  if (busy) return;
  busy = true;
  updateReview();
  try {
    if (!browserProvider || !account || !selectedProvider) throw new Error("Connect a wallet before sending a transaction.");
    await ensureBotChain(selectedProvider);
    await assertContract();
    const signer = await browserProvider.getSigner();
    if (getAddress(await signer.getAddress()) !== getAddress(account)) throw new Error("The active wallet account changed. Reconnect before continuing.");
    const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);

    if (action === "claim") {
      setStatus("Confirm the demo-credit claim in your wallet.");
      const tx = await contract.claimDemoCredits();
      setStatus(`Claim submitted: ${shortAddress(tx.hash, 10, 8)}. Waiting for confirmation.`);
      await tx.wait();
      setStatus("Demo credits claimed.", "success");
    }

    if (action === "approve") {
      const validation = validateRows(true);
      if (!validation.all || validation.total === 0n) throw new Error("Complete every invoice row before approval.");
      setStatus(`Confirm an exact allowance of ${formatUnits(validation.total, DECIMALS)} TRCH in your wallet.`);
      const tx = await contract.approve(CONTRACT_ADDRESS, validation.total);
      setStatus(`Approval submitted: ${shortAddress(tx.hash, 10, 8)}. Waiting for confirmation.`);
      await tx.wait();
      setStatus("Approval confirmed.", "success");
    }

    if (action === "settle") {
      const validation = validateRows(true);
      if (!validation.all || validation.total === 0n) throw new Error("Complete every invoice row before settlement.");
      if (allowance < validation.total) throw new Error("The approved amount is lower than this batch total. Approve the exact total first.");
      const invoiceIds = validation.rows.map((row) => BigInt(row.invoice));
      const recipients = validation.rows.map((row) => getAddress(row.recipient));
      const amounts = validation.rows.map((row) => parseUnits(row.amount, DECIMALS));
      const noteHashes = validation.rows.map((row) => keccak256(toUtf8Bytes(row.note)));
      setStatus(`Confirm settlement of ${formatUnits(validation.total, DECIMALS)} TRCH across ${validation.rows.length} invoices.`);
      const tx = await contract.settleBatch(invoiceIds, recipients, amounts, noteHashes);
      setStatus(`Settlement submitted: ${shortAddress(tx.hash, 10, 8)}. Waiting for confirmation.`);
      await tx.wait();
      const history = JSON.parse(localStorage.getItem(historyKey()) || "[]") as string[];
      localStorage.setItem(historyKey(), JSON.stringify([tx.hash, ...history.filter((item) => item !== tx.hash)].slice(0, 20)));
      ($("#txHash") as HTMLInputElement).value = tx.hash;
      setStatus("Settlement confirmed. The receipt is ready to verify.", "success");
      await verifyTransaction(tx.hash);
    }
    await refreshWalletState();
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    busy = false;
    updateReview();
  }
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

async function importCsvFile(file: File) {
  const text = await file.text();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("The CSV contains no invoice rows.");
  const headers = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
  const required = ["invoice", "recipient", "amount", "note"];
  if (!required.every((key) => headers.includes(key))) throw new Error("The CSV needs invoice, recipient, amount, and note columns.");
  const rows = lines.slice(1, MAX_ROWS + 1).map((line) => {
    const cells = parseCsvLine(line);
    const pick = (key: string) => cells[headers.indexOf(key)] || "";
    return { invoice: pick("invoice"), recipient: pick("recipient"), amount: pick("amount"), note: pick("note") };
  });
  invoiceRows.replaceChildren();
  rows.forEach(appendRow);
  saveDraft();
  updateReview();
  setStatus("CSV imported. Review every recipient address before approval.", "success");
}

function download(name: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function verifyTransaction(hash?: string) {
  const value = hash || ($("#txHash") as HTMLInputElement).value.trim();
  if (!isHexString(value, 32)) {
    setStatus("Enter a complete 32-byte transaction hash.", "error");
    return;
  }
  verifyButton.disabled = true;
  try {
    await assertContract();
    setStatus("Reading the BOT Chain transaction receipt.");
    const [receipt, transaction] = await Promise.all([
      readProvider.getTransactionReceipt(value),
      readProvider.getTransaction(value),
    ]);
    if (!receipt || !transaction) throw new Error("No confirmed BOT Chain transaction was found for this hash.");
    if (!transaction.to || getAddress(transaction.to) !== getAddress(CONTRACT_ADDRESS)) throw new Error("This transaction was not sent to the configured contract.");

    const parsed = receipt.logs.map((log: Log) => {
      try { return iface.parseLog(log); } catch { return null; }
    }).filter(Boolean);
    const batch = parsed.find((item) => item?.name === "BatchSettled");
    const invoices = parsed.filter((item) => item?.name === "InvoiceSettled");
    if (!batch || !invoices.length) throw new Error("No TRANCHR settlement events were found in this receipt.");

    verifiedReceipt = {
      transactionHash: value,
      network: "BOT Chain Mainnet (677)",
      contract: getAddress(CONTRACT_ADDRESS),
      payer: getAddress(String(batch.args.payer)),
      blockNumber: receipt.blockNumber,
      status: Number(receipt.status),
      batchId: String(batch.args.batchId),
      total: formatUnits(batch.args.total as bigint, DECIMALS),
      count: Number(batch.args.count),
      invoices: invoices.map((item) => ({
        invoiceId: String(item!.args.invoiceId),
        recipient: getAddress(String(item!.args.recipient)),
        amount: formatUnits(item!.args.amount as bigint, DECIMALS),
        noteHash: String(item!.args.noteHash),
      })),
      verifiedAt: new Date().toISOString(),
    };
    renderVerifiedReceipt();
    setStatus("Receipt verified against BOT Chain Mainnet.", "success");
  } catch (error) {
    verifiedReceipt = null;
    exportReceipt.disabled = true;
    $("#proofBadge").textContent = "Verification failed";
    $("#proofStatus").textContent = "Failed";
    setStatus(friendlyError(error), "error");
  } finally {
    verifyButton.disabled = false;
  }
}

function renderVerifiedReceipt() {
  if (!verifiedReceipt) return;
  $("#proofBadge").textContent = "Verified on-chain";
  $("#proofContract").textContent = shortAddress(verifiedReceipt.contract, 10, 8);
  $("#proofPayer").textContent = shortAddress(verifiedReceipt.payer, 10, 8);
  $("#proofBlock").textContent = verifiedReceipt.blockNumber.toLocaleString();
  $("#proofTotal").textContent = `${verifiedReceipt.total} TRCH`;
  $("#proofCount").textContent = String(verifiedReceipt.count);
  $("#proofStatus").textContent = verifiedReceipt.status === 1 ? "Confirmed" : "Reverted";
  const events = $("#proofEvents");
  events.replaceChildren();
  verifiedReceipt.invoices.forEach((invoice) => {
    const row = document.createElement("div");
    row.className = "proof-event";
    row.innerHTML = `<strong>#${invoice.invoiceId}</strong><span>${shortAddress(invoice.recipient, 8, 6)}</span><span>${invoice.amount} TRCH</span>`;
    events.append(row);
  });
  exportReceipt.disabled = false;
}

function initialise() {
  if (!contractConfigured) previewNotice.hidden = false;
  footerContract.textContent = contractConfigured ? shortAddress(CONTRACT_ADDRESS, 10, 8) : "Not configured";
  mobileWalletLink.href = `https://metamask.app.link/dapp/${location.host}${location.pathname}`;
  discoverProviders();
  appendRow();
  restoreDraft();
  updateReview();

  walletButton.addEventListener("click", async () => {
    if (account && selectedProvider && currentChain !== CHAIN_ID) {
      try { await ensureBotChain(selectedProvider); } catch (error) { setStatus(friendlyError(error), "error"); }
      return;
    }
    walletDialog.showModal();
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  });
  addRowButton.addEventListener("click", () => appendRow());
  addRowBottom.addEventListener("click", () => appendRow());
  claimButton.addEventListener("click", () => writeContract("claim"));
  approveButton.addEventListener("click", () => writeContract("approve"));
  settleButton.addEventListener("click", () => writeContract("settle"));
  verifyButton.addEventListener("click", () => verifyTransaction());
  $("#txHash").addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") verifyTransaction(); });

  const csvInput = $("#csvInput") as HTMLInputElement;
  $("#importCsv").addEventListener("click", () => csvInput.click());
  csvInput.addEventListener("change", async () => {
    const file = csvInput.files?.[0];
    if (!file) return;
    try { await importCsvFile(file); } catch (error) { setStatus(friendlyError(error), "error"); }
    csvInput.value = "";
  });
  $("#downloadCsv").addEventListener("click", () => download("tranchr-invoices.csv", "invoice,recipient,amount,note\n4081,0x0000000000000000000000000000000000000001,25.00,Service milestone\n", "text/csv"));
  exportReceipt.addEventListener("click", () => {
    if (verifiedReceipt) download(`tranchr-${verifiedReceipt.transactionHash.slice(2, 10)}.json`, JSON.stringify(verifiedReceipt, null, 2), "application/json");
  });
  $("#copyContract").addEventListener("click", async () => {
    if (!contractConfigured) { setStatus("No contract address is configured yet.", "error"); return; }
    await navigator.clipboard.writeText(CONTRACT_ADDRESS);
    setStatus("Contract address copied.", "success");
  });
}

initialise();
