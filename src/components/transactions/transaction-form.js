import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  useAccount,
  useWriteContract,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import {
  createPublicClient,
  getAddress,
  http,
  parseAbiItem,
  parseEther,
} from "viem";
import {
  ERC20_CONTRACT_ADDRESS,
  ENCRYPTED_ERC20_CONTRACT_ADDRESS,
  ERC20ABI,
  ENCRYPTEDERC20ABI,
} from "@/utils/contracts";
import loadingAnimation from "@/utils/transaction-animation.json";
import { useChainBalance } from "@/hooks/use-chain-balance";
import { toast } from "sonner";
import Image from "next/image";
import { baseSepolia } from "viem/chains";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export const TransactionForm = ({
  mode,
  selectedAsset: defaultSelectedAsset,
  handleClose,
  currentBalance,
}) => {
  const [amount, setAmount] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(defaultSelectedAsset);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);

  const [decryptAmount, setDecryptAmount] = useState(null);

  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const publicClient = usePublicClient();
  const walletClient = useWalletClient();

  const {
    nativeBalance,
    tokenBalance,
    encryptedBalance,
    isEncryptedLoading,
    encryptedError,
    refreshBalances,
    fetchEncryptedBalance,
    isConnected,
  } = useChainBalance();

  const handleRefreshEncrypted = (w0) => fetchEncryptedBalance(w0);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isDropdownOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleShield = async () => {
    if (!amount || !address) return;
    setError("");
    setIsProcessing(true);
    setIsApproving(true);

    try {
      const amountWithDecimals = parseEther(amount.toString());

      if (mode === "shield") {
        if (true) {
          setIsApproving(true);

          try {
            const approveHash = await writeContractAsync({
              address: ERC20_CONTRACT_ADDRESS,
              abi: ERC20ABI,
              functionName: "approve",
              args: [ENCRYPTED_ERC20_CONTRACT_ADDRESS, amountWithDecimals],
            });

            const transaction = await publicClient.waitForTransactionReceipt({
              hash: approveHash,
            });

            if (transaction.status !== "success") {
              throw new Error("Transaction failed");
            }

            const wrapTxHash = await writeContractAsync({
              address: ENCRYPTED_ERC20_CONTRACT_ADDRESS,
              abi: ENCRYPTEDERC20ABI,
              functionName: "wrap",
              args: [amountWithDecimals],
            });

            const txn = await publicClient.waitForTransactionReceipt({
              hash: wrapTxHash,
            });

            if (txn.status !== "success") {
              throw new Error("Transaction failed");
            }

            toast.success("Wrap Complete");
            handleClose(mode);
          } catch (error) {
            console.error("Transaction failed:", error);
            if (
              error.message.includes(
                "try switching contract to Existing Shield from dropdown"
              )
            ) {
              setError(error.message);
            } else setError("Transaction failed. Please try again.");
          } finally {
            setIsApproving(false);
            await refreshBalances(["token"]);
            await handleRefreshEncrypted(walletClient);
          }
        }
      }
    } catch (error) {
      console.error("Transaction failed:", error);
      setError("Transaction failed. Please try again.");
    } finally {
      setIsApproving(false);
      setIsProcessing(false);
    }
  };

  const handleUnshield = async () => {
    setIsApproving(true);
    setIsProcessing(true);
    setError("");

    try {
      if (!decryptAmount) {
        setError("No encrypted balance available.");
        return;
      }

      const amountWithDecimals = parseEther(decryptAmount.toString());

      const hash = await writeContractAsync({
        address: ENCRYPTED_ERC20_CONTRACT_ADDRESS,
        abi: ENCRYPTEDERC20ABI,
        functionName: "unwrap",
        args: [amountWithDecimals],
      });

      const transaction = await publicClient.waitForTransactionReceipt({
        hash,
      });

      if (transaction.status !== "success") {
        setError("Transaction failed");
        return;
      }

      const privateRPC = process.env.BASE_SEPOLIA_RPC;

      const pubClient = createPublicClient({
        transport: http(privateRPC),
        chain: baseSepolia,
      });

      const eventPromise = new Promise((resolve, reject) => {
        const unwatch = pubClient.watchEvent({
          address: ENCRYPTED_ERC20_CONTRACT_ADDRESS,
          event: parseAbiItem(
            "event Unwrap(address indexed account, uint256 amount)"
          ),
          onLogs: (logs) => {
            console.log("🎉 Unwrap Event:", logs);
            unwatch(); // cleanup
            resolve(logs); // return the event data
          },
        });

        setTimeout(() => {
          unwatch();
          resolve(null);
          // reject(new Error("⏳ Event not detected within timeout"));
        }, 20000);
      });

      await eventPromise;
      toast.success("Unwrap Complete");
      handleClose(mode);
    } catch (error) {
      console.error("Transaction failed:", error);
      setError("Transaction failed. Please try again.");
    } finally {
      await refreshBalances(["token"]);
      await handleRefreshEncrypted(walletClient);
      setIsApproving(false);
      setIsProcessing(false);
    }
  };

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9.]/g, "");
    if (value.split(".").length > 2) return;
    setAmount(value);

    if (Number(value) > Number(currentBalance)) {
      setError(
        `Insufficient balance. Maximum available: ${selectedAsset?.amount} ${selectedAsset?.name}`
      );
    } else {
      setError("");
    }
  };

  const handleMaxClick = (e) => {
    // Prevent event from bubbling up to parent elements
    e.stopPropagation();
    setAmount(tokenBalance?.data?.formatted);
    setError("");
  };

  const toggleDropdown = (e) => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const isAmountValid =
    Number(amount) > 0 &&
    Number(amount) <= Number(tokenBalance?.data?.formatted);

  return (
    <div className="relative pb-8">
      {/* <div className="flex items-center gap-3 mb-4">{renderDestination()}</div> */}

      {isApproving && isProcessing && (
        <div>
          <div className=" rounded-xl md:h-48 p-6 mb-6 text-center grid place-items-center">
            <div className="flex flex-col items-center">
              <div className="w-56 h-56 mb-2 pb-12">
                <Lottie
                  animationData={loadingAnimation}
                  loop={true}
                  autoplay={true}
                />
                <p className="font-medium text-[#AFAFAF] dark:text-gray-400">
                  {isApproving ? "Approving transaction..." : "Processing..."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isApproving && !isProcessing && (
        <div className="relative">
          {mode === "withdraw" && (
            <div>
              <div className="w-full border rounded-xl md:h-64 p-6 mb-6 text-center grid place-items-center">
                <div>
                  <div className="grid place-items-center gap-6">
                    <Image
                      src={"/tokens/confidential/usdc-base.png"}
                      alt={selectedAsset?.name}
                      width={64}
                      height={64}
                    />

                    <div className="text-3xl flex gap-2 items-center font-semibold mb-1 bg-transparent text-center w-full text-black dark:text-white disabled:opacity-50">
                      <input
                        type="text"
                        placeholder="0"
                        value={decryptAmount}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, "");
                          if (value.split(".").length > 2) return;
                          setDecryptAmount(value);
                        }}
                        className="w-full max-w-[120px] bg-transparent focus:outline-none text-center"
                      />
                    </div>
                  </div>

                  <div className="text-[#AFAFAF] dark:text-gray-400">
                    {decryptAmount || "0"} c{selectedAsset?.name}
                  </div>
                  {error && (
                    <div className="text-red-500 dark:text-red-400 text-sm mt-2">
                      {error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {mode === "shield" && (
            <div
              ref={triggerRef}
              onClick={toggleDropdown}
              className="p-4 border rounded-xl mb-4"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Image
                    src={selectedAsset?.icon}
                    alt={selectedAsset?.name}
                    width={40}
                    height={40}
                  />
                  <div>
                    <p className="dark:text-white">{selectedAsset?.name}</p>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Balance:{" "}
                      {tokenBalance?.data?.formatted
                        ? parseFloat(tokenBalance.data.formatted).toFixed(4)
                        : "0.0000"}{" "}
                      {selectedAsset?.name}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Max button that stops propagation */}
                  <div
                    onClick={handleMaxClick}
                    className="h-8 px-3 text-sm text-blue-500 dark:text-blue-400 cursor-pointer transition-colors hover:bg-blue-50 dark:hover:bg-blue-900 bg-[#E7EEFE] dark:bg-[#1E293B] rounded-full inline-flex items-center justify-center"
                  >
                    Max
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!isApproving && !isProcessing && (
        <>
          {mode === "shield" && (
            <div className="border rounded-xl md:h-48 p-6 mb-6 text-center grid place-items-center">
              <div>
                <div>
                  <input
                    type="text"
                    value={amount}
                    onChange={handleAmountChange}
                    className="text-3xl font-semibold mb-1 bg-transparent text-center w-full focus:outline-none text-black dark:text-white disabled:opacity-50"
                    placeholder="0"
                    disabled={isProcessing}
                  />
                </div>

                <div className="text-[#AFAFAF] dark:text-gray-400">
                  {amount || "0"} {selectedAsset?.name}
                </div>
                {error && (
                  <div className="text-red-500 dark:text-red-400 text-sm mt-2">
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {!isApproving && !isProcessing && (
        <div className="grid gap-4">
          {mode === "shield" ? (
            <Button
              className="w-full rounded-full dark:bg-[#3673F5] dark:text-white dark:hover:bg-[#3673F5]/80"
              disabled={!isAmountValid || isProcessing}
              onClick={handleShield}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isApproving ? "Approving..." : "Processing..."}
                </>
              ) : (
                <>Shield</>
              )}
            </Button>
          ) : (
            <Button
              className="w-full rounded-full dark:bg-[#3673F5] dark:text-white dark:hover:bg-[#3673F5]/80"
              disabled={!decryptAmount || decryptAmount === "0" || isProcessing}
              onClick={handleUnshield}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isApproving ? "Approving..." : "Processing..."}
                </>
              ) : (
                <>{mode === "shield" ? "Shield" : "Unshield"}</>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionForm;
