import { Wallet } from "@project-serum/anchor";
import {Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58"
import {WalletInfo} from "./types/types";
import {solPublicConnection} from "./connections";

export class WalletContainer {
    readonly wallet: Wallet;

    constructor(
    ) {
        this.wallet = new Wallet(
            Keypair.fromSecretKey(bs58.decode(
                process.env.WALLET_PRIVATE_KEY!!
            )));

    }

    async  getSolBalance() {
        return await solPublicConnection.getBalance(this.wallet.publicKey);
    }

    async fetchWalletInfo(): Promise<WalletInfo|undefined> {
        try {
            const connection = new Connection('https://api.mainnet-beta.solana.com');
            const balance = await connection.getBalance(this.wallet.publicKey);
            const accountInfo = await connection.getAccountInfo(this.wallet.publicKey);
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                this.wallet.publicKey,
                { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') });

            return {
                walletAddress: this.wallet.publicKey.toBase58(),
                balance: balance,
                accountInfo: accountInfo,
                tokenAccounts: tokenAccounts
            } as WalletInfo
        } catch (error) {
            console.error('Error fetching wallet info:', error);
        }
    }
}
