import { createPublicClient, http } from 'viem';
import * as Chains from 'viem/chains';

export const MAX_INT = 2 ** 255 - 1;
export const BIG_INT = 2 ** 31 - 1;
// export const wei = 1000000000000000000n;
// export const gwei = 1000000000n;
// export const ether = 1n;

const chains = {};
for (const chain in Chains) {
  chains[Chains[chain].id] = Chains[chain];
}

export const CHAINS = chains;

// https://ipfs.github.io/public-gateway-checker/
export const IPFS_URLS = [
  'ipfs.io',
  'cf-ipfs.com', // cloudflare
  'cloudflare-ipfs.com', // cloudflare
  'gateway.ipfs.io',
  'nftstorage.link',
  'dweb.link',
  '4everland.io',
];

export function createProvider(chain) {
  const chainId = findChain(chain);
  const provider = chains[chainId];
  const rpc = provider.rpcUrls.default.http[0];
  return createPublicClient({
    chain: provider,
    transport: http(rpc),
  });
}

export function scanAddress(chain, address) {
  return `${chains[findChain(chain)].blockExplorers.default.url}/address/${address}`;
}

export function findChain(chain) {
  const str = chain.toString().toLowerCase();
  const int = parseInt(str);
  if (!chains[int]) throw new Error('Chain not found');
  return chains[int].id;
}

export const MINI_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'uint256', name: 'index', type: 'uint256' },
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// class TransactionChecker {
//   constructor(address, chainId) {
//     this.address = address;
//     this.web3 = getProvider(chainId);
//   }
//   async checkBlock() {
//     let block = await this.web3.eth.getBlock('latest', true);
//     let number = block.number;
//     let transactions = block.transactions;
//     console.log(`Search Block ${number}: ` + JSON.stringify(transactions));

//     if (block != null && block.transactions != null) {
//       for (let txHash of block.transactions) {
//         let tx = await this.web3.eth.getTransaction(txHash);
//         console.log(tx);
//         if (this.address === tx.to) {
//           console.log('from: ' + tx.from + ' to: ' + tx.to + ' value: ' + tx.value);
//         }
//       }
//     }
//   }
// }
