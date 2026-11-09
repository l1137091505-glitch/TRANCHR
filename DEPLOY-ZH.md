# TRANCHR 部署步骤

## 1. 部署合约

1. 打开 Remix，确认钱包已经切换到 BOT Chain Mainnet。
2. 在 `contracts` 文件夹中新建 `Tranchr.sol`，复制 `contracts/src/Tranchr.sol` 的全部内容。
3. Solidity Compiler 选择 `0.8.24`，点击 **Compile Tranchr.sol**。
4. 打开 **Deploy & Run Transactions**：
   - Environment 选择 **Browser Extension**。
   - 钱包网络必须是 BOT Chain Mainnet，Chain ID 为 `677`。
   - Contract 选择 `Tranchr`。
   - 构造函数没有参数，直接点击 **Deploy**。
5. 在钱包里确认部署交易，等待成功。
6. 在 Remix 的 **Deployed Contracts** 中复制完整合约地址。合约地址是公开信息，不要设为 Secret；绝对不要上传钱包私钥或助记词。

## 2. 上传 GitHub

1. GitHub 新建一个空仓库，例如 `tranchr`。不要额外创建 README、License 或 `.gitignore`。
2. 解压 `TRANCHR-GITHUB-UPLOAD.zip`。
3. 在仓库中选择 **Add file → Upload files**，上传解压后的全部文件。
4. Commit message 可填写 `Initial TRANCHR project`，然后点击 **Commit changes**。

## 3. 在 Vercel 部署

1. 在 Vercel 选择 **Add New → Project**，导入新的 GitHub 仓库。
2. Project Name 必须使用小写，例如 `tranchr`。
3. Root Directory 选择 `frontend`。
4. Framework Preset 选择 **Vite**。
5. 在 Environment Variables 添加：

```text
VITE_TRANCHR_ADDRESS=0x完整合约地址
```

6. 类型选择 **Config**，Environment 选择 **Production**，点击保存。
7. 点击 **Deploy**。
8. 如果环境变量是在首次部署后才添加：进入 Deployments，选择最新生产部署，点击 **Redeploy**，不要勾选旧的 Build Cache。

## 4. 网页交互顺序

1. 点击 **Connect a wallet**，在选择器中点自己的钱包。
2. 如果当前网络不对，钱包会提示切换或添加 BOT Chain Mainnet。
3. 首次使用点击 **Claim demo credits**，领取 1,000 TRCH 演示积分。
4. 填写 1–10 行发票：
   - Invoice reference：只填正整数，且同一批不能重复。
   - Recipient address：完整 EVM 地址。
   - Amount in TRCH：大于 0，最多 6 位小数。
   - Private note：只在浏览器中保存；链上只记录它的哈希。
5. 点击 **Approve the total**，在钱包确认精确的批次总额授权。
6. 授权确认后，点击 **Settle the batch**，再次在钱包确认结算。
7. 交易成功后，网页会自动把交易哈希放入验证区并读取链上凭证。
8. 其他人无需连接钱包，直接在 **Verify a settlement without a wallet** 中粘贴交易哈希即可验真，并可导出 JSON。

## 5. 钱包兼容说明

- 页面使用 EIP-6963 获取多个钱包，不会把 MetaMask 之外的钱包误当成同一个注入对象。
- 钱包只会在用户主动选择后请求账户权限，不会在页面加载时弹窗。
- 同时兼容 `window.ethereum.providers` 旧式多钱包注入。
- 手机没有扩展钱包时，可使用 **Open this page in MetaMask** 深链。
- 页面会监听账户切换、网络切换和断开事件。
- 发送交易前会检查 Chain ID、当前账户和合约字节码，避免把确认请求发到错误网络或空地址。

## 6. 常见错误

- **点击钱包没有反应**：检查浏览器是否安装并解锁钱包扩展；刷新页面后，在钱包选择器中点对应钱包，不要依赖浏览器默认注入顺序。
- **Request already pending**：钱包扩展已有待处理窗口，打开扩展完成或取消旧请求。
- **Preview mode**：Vercel 没读到 `VITE_TRANCHR_ADDRESS`，添加后重新部署 Production。
- **Configured contract does not exist**：环境变量地址不是 BOT Chain Mainnet 上的合约，或地址复制不完整。
- **Insufficient allowance**：批次内容改变后总额也改变，需要重新授权当前精确总额。
- **Invoice already settled**：同一钱包不能再次结算相同发票编号，请使用新的编号。
- **Missing revert data**：通常是网络、合约地址、余额或授权不匹配；网页会提示逐项检查。

