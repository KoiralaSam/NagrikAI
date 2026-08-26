#!/bin/bash
# Host firewall for the NagrikAI VM.
# Public: SSH (rate-limited) and HTTP :80 (rate-limited).
# Drop new inbound TCP/UDP to every other port, including 11434/5432/8080.
set -euo pipefail

CHAIN=NAGRIKAI_IN

ensure_chain() {
  local ipt=$1
  $ipt -n -L "$CHAIN" >/dev/null 2>&1 || $ipt -N "$CHAIN"
  $ipt -F "$CHAIN"
  $ipt -C INPUT -j "$CHAIN" 2>/dev/null || $ipt -I INPUT 1 -j "$CHAIN"
}

apply() {
  local ipt=$1

  ensure_chain "$ipt"

  $ipt -A "$CHAIN" -i lo -j ACCEPT
  $ipt -A "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  $ipt -A "$CHAIN" -p icmp -m limit --limit 5/sec --limit-burst 10 -j ACCEPT

  $ipt -A "$CHAIN" -p tcp --dport 22 -m conntrack --ctstate NEW \
    -m hashlimit --hashlimit-name nagrikai-ssh --hashlimit-mode srcip \
    --hashlimit-upto 6/min --hashlimit-burst 4 -j ACCEPT
  $ipt -A "$CHAIN" -p tcp --dport 22 -m conntrack --ctstate NEW -j DROP

  $ipt -A "$CHAIN" -p tcp --dport 80 -m conntrack --ctstate NEW \
    -m hashlimit --hashlimit-name nagrikai-http --hashlimit-mode srcip \
    --hashlimit-upto 40/min --hashlimit-burst 20 -j ACCEPT
  $ipt -A "$CHAIN" -p tcp --dport 80 -m conntrack --ctstate NEW -j DROP

  $ipt -A "$CHAIN" -p tcp --dport 443 -m conntrack --ctstate NEW -j DROP
  $ipt -A "$CHAIN" -p tcp -m conntrack --ctstate NEW -j DROP
  $ipt -A "$CHAIN" -p udp -m conntrack --ctstate NEW -j DROP
}

apply iptables
if command -v ip6tables >/dev/null 2>&1; then
  apply ip6tables
fi
