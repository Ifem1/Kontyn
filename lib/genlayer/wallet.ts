"use client";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { chain, chainName } from "./config";
const KEY = "kontyn.browser-wallet.v1";
type Provider = { request(a: { method: string; params?: unknown[] }): Promise<unknown> };
export type WalletState = { address: string; mode: "injected" | "browser"; warning: boolean };
export async function connectInjected(): Promise<WalletState> {
  const provider = (window as Window & { ethereum?: Provider }).ethereum;
  if (!provider) throw new Error("No injected wallet found. Install or unlock a compatible wallet.");
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  if (!accounts[0]) throw new Error("Wallet did not return an account.");
  const client = createClient({ chain, account: accounts[0] as `0x${string}`, provider });
  await client.connect(chainName); return { address: accounts[0], mode: "injected", warning: false };
}
export function browserWallet(): WalletState {
  let key = localStorage.getItem(KEY); if (!key) { key = generatePrivateKey(); localStorage.setItem(KEY, key); }
  return { address: createAccount(key as `0x${string}`).address, mode: "browser", warning: true };
}
export function writeClient(wallet: WalletState) {
  if (wallet.mode === "browser") { const key = localStorage.getItem(KEY); if (!key) throw new Error("Browser wallet key unavailable."); return createClient({ chain, account: createAccount(key as `0x${string}`) }); }
  const provider = (window as Window & { ethereum?: Provider }).ethereum; if (!provider) throw new Error("Injected wallet unavailable.");
  return createClient({ chain, account: wallet.address as `0x${string}`, provider });
}
export function exportBrowserWallet() { return localStorage.getItem(KEY); }
export function importBrowserWallet(key: string) { if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Invalid private key."); localStorage.setItem(KEY, key); return browserWallet(); }
