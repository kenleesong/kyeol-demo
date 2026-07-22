import { BrowserProvider, Contract, formatEther, id, isAddress, parseEther } from "./vendor/ethers.min.js";

const CHAIN_ID = 91342;
const DEFAULT_ESCROW = "0xE75b2A70bc323436A211e117Ba221EE468B208Cc";
const DEMO_TRANSLATOR = "0xa875095456a3c53c386f6836a963cf7afef01237";
const DOJANG = "0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9";
const DEMO_ATTESTER = "0xaa92f8c143657dde575de430aecaea6ca91f2e6072339b16932d426895d8d678";
const REVIEW_PERIOD = 7 * 24 * 60 * 60;
const STATES = ["NONE", "FUNDED", "ACCEPTED", "SUBMITTED", "PAID", "REFUNDED"];
const ABI = [
  "function createJob(address,uint64,bytes32) payable returns (uint256)",
  "function jobs(uint256) view returns (address client,address translator,uint64 deadline,uint128 amount,uint8 state,bytes32 briefHash,bytes32 deliveryHash,uint64 submittedAt)",
  "function credits(address) view returns (uint256)",
  "function accept(uint256)", "function submit(uint256,bytes32)", "function approve(uint256)",
  "function claimAfterReview(uint256)", "function refund(uint256)", "function withdraw()",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed translator, uint256 amount)",
  "error Unauthorized()", "error InvalidState()", "error InvalidInput()",
  "error TransferFailed()", "error TranslatorNotVerified()", "error NothingToWithdraw()"
];
const DOJANG_ABI = ["function isVerified(address,bytes32) view returns (bool)"];
const $ = (id) => document.getElementById(id);

let provider, signer, account, escrow, currentJobId;

function message(text, error = false) {
  $("status").textContent = text;
  $("status").className = error ? "error" : "success";
}

const REVERT_KO = {
  Unauthorized: "이 지갑에는 권한이 없는 행동입니다.",
  InvalidState: "현재 계약 상태에서는 할 수 없는 행동입니다.",
  InvalidInput: "입력값이 유효하지 않습니다.",
  TransferFailed: "송금에 실패했습니다.",
  TranslatorNotVerified: "Dojang Verified Address가 없어 수락할 수 없습니다.",
  NothingToWithdraw: "인출할 금액이 없습니다."
};

// 커스텀 에러는 전부 무인자이므로 selector = keccak("Name()")의 앞 4바이트로 정확히 식별된다.
export const REVERT_SELECTORS = Object.fromEntries(
  Object.keys(REVERT_KO).map((name) => [id(`${name}()`).slice(0, 10), name])
);

// 지갑의 eth_estimateGas 실패는 revert 데이터를 error.revert가 아니라 error.info.error.data 같은
// 중첩 위치에 문자열로 담아 보낸다. 알려진 selector prefix와 일치할 때만 채택한다
// (현재 앱 ABI와 검증 케이스에서는 오탐을 확인하지 못했다).
export function findRevertName(value, seen = new Set(), depth = 0) {
  if (value == null || depth > 6) return undefined;
  if (typeof value === "string") {
    for (const hex of value.match(/0x[0-9a-fA-F]{8,}/g) ?? []) {
      const name = REVERT_SELECTORS[hex.slice(0, 10).toLowerCase()];
      if (name) return name;
    }
    return undefined;
  }
  if (typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  for (const nested of Object.values(value)) {
    const name = findRevertName(nested, seen, depth + 1);
    if (name) return name;
  }
  return undefined;
}

export function describeError(error) {
  const name = error?.revert?.name ?? findRevertName(error);
  if (name && REVERT_KO[name]) return `${REVERT_KO[name]} (${name})`;
  return error?.shortMessage ?? error?.reason ?? error?.message ?? String(error);
}

async function connect() {
  if (!window.ethereum) return message("브라우저 지갑이 필요합니다.", true);
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const hexId = `0x${CHAIN_ID.toString(16)}`;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (error) {
      if (error.code !== 4902) throw error;
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
        chainId: hexId, chainName: "GIWA Sepolia", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://sepolia-rpc.giwa.io"], blockExplorerUrls: ["https://sepolia-explorer.giwa.io"]
      }] });
    }
    provider = new BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    account = (await signer.getAddress()).toLowerCase();
    $("connect").textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
    bindContract();
    await refreshCredit();
    if (currentJobId !== undefined) await loadJob();
    message("GIWA Sepolia에 연결됐습니다.");
  } catch (error) { message(describeError(error), true); }
}

function bindContract() {
  escrow = signer && isAddress(DEFAULT_ESCROW) ? new Contract(DEFAULT_ESCROW, ABI, signer) : undefined;
}

async function ensureReady() {
  if (!signer) throw new Error("먼저 지갑을 연결하세요.");
  if (!escrow) throw new Error("유효한 에스크로 컨트랙트 주소를 저장하세요.");
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(CHAIN_ID)) {
    throw new Error(`GIWA Sepolia(Chain ID ${CHAIN_ID})가 아닌 네트워크입니다. 지갑에서 네트워크를 전환하세요.`);
  }
  if (await provider.getCode(escrow.target) === "0x") {
    throw new Error("이 주소에는 컨트랙트 코드가 없습니다. 네트워크와 에스크로 주소를 확인하세요.");
  }
}

async function run(label, action) {
  try {
    await ensureReady();
    message(`${label} 요청을 확인하는 중…`);
    const tx = await action();
    message(`${label} 처리 중 · ${tx.hash.slice(0, 10)}…`);
    const receipt = await tx.wait();
    message(`${label} 완료`);
    if (currentJobId !== undefined) await loadJob();
    await refreshCredit();
    return receipt;
  } catch (error) { message(describeError(error), true); }
}

async function loadJob() {
  await ensureReady();
  const job = await escrow.jobs(currentJobId);
  if (Number(job.state) === 0) throw new Error("존재하지 않는 Job ID입니다.");
  const now = Number((await provider.getBlock("latest")).timestamp);
  const mine = account ?? "";
  const isClient = mine === job.client.toLowerCase();
  const isTranslator = mine === job.translator.toLowerCase();
  const verified = await new Contract(DOJANG, DOJANG_ABI, provider).isVerified(job.translator, DEMO_ATTESTER);

  $("empty").hidden = true; $("job").hidden = false;
  $("state").textContent = STATES[Number(job.state)];
  $("verified").textContent = verified ? "✓ DOJANG VERIFIED" : "UNVERIFIED";
  $("verified").className = `verified ${verified ? "ok" : ""}`;
  $("client").textContent = job.client;
  $("translatorName").textContent = job.translator.toLowerCase() === DEMO_TRANSLATOR ? "ken.up.id" : "";
  $("jobTranslator").textContent = job.translator;
  $("jobAmount").textContent = `${formatEther(job.amount)} ETH`;
  $("jobDeadline").textContent = new Date(Number(job.deadline) * 1000).toLocaleString();
  $("deliveryHash").textContent = job.deliveryHash === `0x${"0".repeat(64)}` ? "아직 제출되지 않음" : job.deliveryHash;

  ["accept", "refund", "submitForm", "approve", "claim"].forEach((name) => $(name).hidden = true);
  $("notice").textContent = "현재 연결된 지갑에서 가능한 행동이 없습니다.";
  const state = Number(job.state);
  if (state === 1 && isTranslator && now < Number(job.deadline)) { $("accept").hidden = false; $("notice").textContent = verified ? "검증된 지갑입니다. 작업을 수락할 수 있습니다." : "Dojang 검증이 없어 수락할 수 없습니다."; }
  if (state === 1 && isTranslator && now >= Number(job.deadline)) { $("notice").textContent = "마감이 지나 수락할 수 없습니다."; }
  if (state === 1 && isClient) { $("refund").hidden = false; $("notice").textContent = "로컬라이저가 수락하기 전까지 환불할 수 있습니다."; }
  if (state === 2 && isTranslator && now <= Number(job.deadline)) { $("submitForm").hidden = false; $("notice").textContent = "납품 파일 또는 게시 URL을 제출하세요."; }
  if (state === 2 && isClient) { $("notice").textContent = now > Number(job.deadline) ? "마감이 지났습니다. 미제출 계약을 환불할 수 있습니다." : "작업이 진행 중이며 마감 전에는 환불할 수 없습니다."; $("refund").hidden = now <= Number(job.deadline); }
  if (state === 3 && isClient) {
    const unlock = Number(job.submittedAt) + REVIEW_PERIOD;
    $("approve").hidden = false;
    $("notice").textContent = `제출된 결과를 검토하세요. 이 상태에서는 일방 환불할 수 없으며, ${new Date(unlock * 1000).toLocaleString()}까지 승인하지 않으면 로컬라이저가 직접 지급을 확정할 수 있습니다.`;
  }
  if (state === 3 && isTranslator) {
    const unlock = Number(job.submittedAt) + REVIEW_PERIOD;
    $("claim").hidden = now < unlock;
    $("notice").textContent = now >= unlock ? "7일 리뷰 기간이 끝났습니다. 지급을 확정할 수 있습니다." : `의뢰자 검토 중 · ${new Date(unlock * 1000).toLocaleString()} 이후 직접 확정 가능`;
  }
  if (state === 4 || state === 5) $("notice").textContent = state === 4 ? "계약이 완료됐습니다. 수행 이력이 온체인에 남았습니다." : "계약이 환불됐습니다.";
}

async function refreshCredit() {
  if (!escrow || !account) return;
  const value = await escrow.credits(account);
  $("credit").textContent = `${formatEther(value)} ETH`;
  $("withdraw").disabled = value === 0n;
}

$("connect").onclick = connect;
$("createForm").onsubmit = async (event) => {
  event.preventDefault();
  const translator = $("translator").value.trim();
  const deadline = Math.floor(new Date($("deadline").value).getTime() / 1000);
  const receipt = await run("계약 생성", () => escrow.createJob(translator, deadline, id($("brief").value.trim()), { value: parseEther($("amount").value) }));
  if (!receipt) return;
  const created = receipt.logs
    .map((log) => { try { return escrow.interface.parseLog(log); } catch { return null; } })
    .find((parsed) => parsed?.name === "JobCreated");
  if (created) {
    currentJobId = created.args.jobId;
    $("jobId").value = currentJobId.toString();
    await loadJob();
    message(`계약 생성 완료 · Job #${currentJobId} — 이 번호를 로컬라이저에게 전달하세요.`);
  }
};
$("loadForm").onsubmit = async (event) => { event.preventDefault(); try { currentJobId = BigInt($("jobId").value); await loadJob(); message(`Job #${currentJobId}를 불러왔습니다.`); } catch (error) { message(describeError(error), true); } };
$("accept").onclick = () => run("작업 수락", () => escrow.accept(currentJobId));
$("refund").onclick = () => run("환불", () => escrow.refund(currentJobId));
$("submitForm").onsubmit = (event) => { event.preventDefault(); run("결과물 제출", () => escrow.submit(currentJobId, id($("delivery").value.trim()))); };
$("approve").onclick = () => run("납품 승인", () => escrow.approve(currentJobId));
$("claim").onclick = () => run("지급 확정", () => escrow.claimAfterReview(currentJobId));
$("withdraw").onclick = () => run("인출", () => escrow.withdraw());

if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", () => connect());
  window.ethereum.on?.("chainChanged", () => window.location.reload());
}
