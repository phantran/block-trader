import {Connection} from "@solana/web3.js";

const QUICK_NODE_HTTP_URL = 'https://virulent-virulent-sun.solana-mainnet.quiknode.pro/511ad4ee3dc8186998b8c414080a5ac3eb22e643/';
const QUICK_NODE_WEBSOCKET_URL = 'wss://virulent-virulent-sun.solana-mainnet.quiknode.pro/511ad4ee3dc8186998b8c414080a5ac3eb22e643/';
const SESSION_HASH_PREFIX = 'QNDEMO'

function initPublicSolanaConnection(): Connection {
    const SESSION_HASH = 'QNDEMO' + Math.ceil(Math.random() * 1e9); // Random unique identifier for your session
    // Replace HTTP_URL & WSS_URL with QuickNode HTTPS and WSS Solana Mainnet endpoint
    return new Connection('https://api.mainnet-beta.solana.com', {
        wsEndpoint: `ws://api.mainnet-beta.solana.com`,
        httpHeaders: {"x-session-hash": SESSION_HASH}
    });
}

function initQuickNodeSolanaConnection(): Connection {
    // Random unique identifier for your session
    const SESSION_HASH = SESSION_HASH_PREFIX + Math.ceil(Math.random() * 1e9);
    // Replace HTTP_URL & WSS_URL with QuickNode HTTPS and WSS Solana Mainnet endpoint
    return new Connection(QUICK_NODE_HTTP_URL, {
        wsEndpoint: QUICK_NODE_WEBSOCKET_URL,
        httpHeaders: {"x-session-hash": SESSION_HASH}
    });
}

export const solPublicConnection: Connection = initPublicSolanaConnection()
export const solPrivateConnection: Connection = initQuickNodeSolanaConnection()
