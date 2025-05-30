import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { X, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useMediaQuery } from "@/hooks/use-media-query";
import { assets } from "@/utils/constants";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import { encryptValue, SELECTED_NETWORK } from "@/utils/inco-lite";
import { getContract, parseEther } from "viem";
import {
  ENCRYPTED_ERC20_CONTRACT_ADDRESS,
  ENCRYPTEDERC20ABI,
} from "@/utils/contracts";
import { getConfig } from "@/utils/inco-lite";
import { useChainBalance } from "@/hooks/use-chain-balance";
import Image from "next/image";

const ConfidentialSendDialog = () => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [txResult, setTxResult] = useState(null);
  const [addressError, setAddressError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [confidentialSendFailed, setConfidentialSendFailed] = useState(false);
  const [sendErrorMessage, setSendErrorMessage] = useState("");

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

  const balance = encryptedBalance || 0;

  const { address: userAddress } = useAccount();

  const [selectedAsset, setSelectedAsset] = useState({
    name: "USDC",
    icon: "/icons/usdc.svg",
    amount: balance,
    chain: "USDC",
    value: "12,000 USDC",
  });

  const isMobile = useMediaQuery("(max-width: 640px)");
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9.]/g, "");
    if (value.split(".").length > 2) return;
    setAmount(value);
  };

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const walletClient = useWalletClient();
  const chainId = useChainId();

  const confidentialSend = async () => {
    try {
      setTxResult(null); // reset
      setSendErrorMessage(""); // reset
      setConfidentialSendFailed(false); // reset

      // if (selectedContract?.type !== "Existing Shield") {
      //   setSendErrorMessage(
      //     "Invalid contract type. Please switch to 'Existing Shield'."
      //   );
      //   throw new Error("Invalid contract type.");
      // }

      const config = getConfig(chainId);
      const { inputCt } = await encryptValue({
        value: parseEther(amount.toString()),
        address: userAddress,
        config: config,
        contractAddress: ENCRYPTED_ERC20_CONTRACT_ADDRESS,
      });

      if (!walletClient.data.account) {
        setSendErrorMessage(
          "Wallet not connected. Please reconnect your wallet."
        );
        throw new Error("Wallet not connected.");
      }

      const hash = await writeContractAsync({
        address: ENCRYPTED_ERC20_CONTRACT_ADDRESS,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "to", type: "address" },
              { internalType: "bytes", name: "encryptedAmount", type: "bytes" },
            ],
            name: "transfer",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        functionName: "transfer",
        args: [address, inputCt.ciphertext.value],
      });

      const transaction = await publicClient.waitForTransactionReceipt({
        hash,
      });

      const success = transaction.status === "success";
      setTxResult({ success, hash });
      setConfidentialSendFailed(!success);

      await fetchEncryptedBalance(walletClient);

      if (!success) {
        setSendErrorMessage("Transaction failed. Please try again later.");
        throw new Error("Transaction failed");
      }

      toast.success("Send successful");
    } catch (error) {
      console.error("Transaction failed:", error);
      setTxResult({ success: false, hash: null });
      if (!sendErrorMessage) {
        setSendErrorMessage("An unexpected error occurred during send.");
      }
      setConfidentialSendFailed(true); // mark tx as failed
      toast.error("Send failed");
    }
  };

  const handleSend = async () => {
    setAddressError("");
    setAmountError("");

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setAddressError("Enter a valid wallet address.");
      return;
    }

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      setAmountError("Enter a valid amount.");
      return;
    }

    try {
      setIsLoading(true);
      await confidentialSend();
      setAmount("");
      setAddress("");
    } catch (error) {
      console.error("Send failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const DialogComponent = isMobile ? Sheet : Dialog;
  const DialogContentComponent = isMobile ? SheetContent : DialogContent;
  const DialogHeaderComponent = isMobile ? SheetHeader : DialogHeader;
  const DialogTitleComponent = isMobile ? SheetTitle : DialogTitle;

  const isValid = amount && Number(amount) > 0 && address;

  return (
    <>
      <button
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full border dark:border-gray-700"
        onClick={() => setOpen(true)}
      >
        {isDarkMode ? (
          <Image
            alt="Send Button"
            src="/dark/send.svg"
            height={20}
            width={20}
          />
        ) : (
          <Image
            alt="Send Button"
            src="/icons/send.svg"
            height={20}
            width={20}
          />
        )}
      </button>

      <DialogComponent open={open} onOpenChange={setOpen}>
        <DialogContentComponent
          className={`grid gap-0 ${
            isMobile ? "w-full rounded-t-2xl" : "w-[400px]"
          } p-0 `}
          side={isMobile ? "bottom" : undefined}
        >
          <DialogHeaderComponent className="px-6 py-4 flex-row flex items-center justify-between">
            <DialogTitleComponent className="text-lg font-semibold dark:text-white">
              Send Confidential Amount
            </DialogTitleComponent>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogHeaderComponent>

          <div className="px-6 pb-6 space-y-6">
            <div className="space-y-1">
              <label className="text-sm text-gray-500 dark:text-gray-400">
                To:
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={`w-full p-2 text-sm border rounded-lg focus:outline-none dark:text-white ${
                  addressError
                    ? "border-red-500 focus:ring-red-500"
                    : "focus:ring-blue-500 dark:focus:ring-blue-600/20"
                }`}
                placeholder="0xYourWalletAddressHere"
              />
              {addressError && (
                <p className="text-red-500 text-sm">{addressError}</p>
              )}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <div className="p-3 border rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Image
                        src={"/tokens/confidential/usdc-base.png"}
                        width={40}
                        height={40}
                        alt={selectedAsset.name}
                        // className="w-8 h-8"
                      />
                      <div>
                        <p className="font-medium dark:text-white">
                          cUSDC
                          {/* {selectedAsset.name} */}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {encryptedBalance} c{selectedAsset.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {encryptedBalance && (
                        <Badge
                          variant="secondary"
                          className="h-7 px-3 text-sm text-blue-500 dark:text-blue-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900 bg-[#E7EEFE] dark:bg-[#1E293B] rounded-full"
                          onClick={() => setAmount(encryptedBalance)}
                        >
                          Max
                        </Badge>
                      )}
                      {/* <ChevronDown className="h-5 w-5 dark:text-gray-400" /> */}
                    </div>
                  </div>
                </div>
              </PopoverTrigger>
            </Popover>

            <div className="border rounded-xl p-6 text-center space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  className={`text-3xl font-medium bg-transparent dark:text-white text-center w-full focus:outline-none ${
                    amountError ? "text-red-500" : ""
                  }`}
                  placeholder="0"
                  disabled={isLoading}
                />
              </div>
              <p className="text-gray-500 dark:text-gray-400">
                {amount || "0"} c{selectedAsset.name}
              </p>
              <div className="flex items-center justify-center mt-1">
                <span className="bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 font-mono px-3 py-1 rounded-md text-xs uppercase tracking-wider">
                  encrypted amount
                </span>
              </div>
              {amountError && (
                <p className="text-red-500 text-sm">{amountError}</p>
              )}
            </div>

            <div>
              <Button
                className="w-full rounded-full h-12 dark:bg-[#3673F5] dark:text-white dark:hover:bg-[#3673F5]/80"
                disabled={!isValid || isLoading}
                onClick={handleSend}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send"
                )}
              </Button>

              {sendErrorMessage && (
                <div className=" text-red-700 dark:text-red-300 p-3 rounded-lg text-sm text-center">
                  {sendErrorMessage}
                </div>
              )}

              {txResult?.success && (
                <div className="text-sm text-center mt-6">
                  <p
                    className={`font-medium ${
                      txResult.success ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    Transaction Successful
                  </p>
                  {txResult.hash && (
                    <a
                      href={`https://sepolia.basescan.org/tx/${txResult.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-blue-500 mt-1 inline-block"
                    >
                      View on Base Sepolia
                    </a>
                  )}
                </div>
              )}
            </div>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              Your send amount will be hidden onchain.
            </p>
          </div>
        </DialogContentComponent>
      </DialogComponent>
    </>
  );
};

export default ConfidentialSendDialog;
