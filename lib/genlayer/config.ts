import { createAccount, createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

const chains = { studionet, localnet, testnetAsimov, testnetBradbury } as const;
export const chainName = (process.env.NEXT_PUBLIC_GENLAYER_CHAIN ?? "studionet") as keyof typeof chains;
export const chain = chains[chainName] ?? studionet;
export const contractAddress = process.env.NEXT_PUBLIC_KONTYN_CONTRACT_ADDRESS as `0x${string}` | undefined;
export const readClient = createClient({ chain, account: createAccount() });
export const explorerBase = "https://explorer-studio.genlayer.com";
