#!/bin/sh
set -ex
# Add Teia's IPFS node
ipfs bootstrap add /dnsaddr/ipfs.teia.art/p2p/12D3KooWP84PmvN2ncA2vDCzoea2DGgBsEgxRreiMWpvZdpEgtrq
(sleep 5 && ipfs swarm peering add /p2p/12D3KooWP84PmvN2ncA2vDCzoea2DGgBsEgxRreiMWpvZdpEgtrq)&
(sleep 5 && ipfs swarm connect /p2p/12D3KooWP84PmvN2ncA2vDCzoea2DGgBsEgxRreiMWpvZdpEgtrq)&