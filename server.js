import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200).end(JSON.stringify({
      ok: true,
      service: "Solana AI Scanner API",
      message: "API is running. Use /health to check status and /api/wallet-activity?address=PUBLIC_SOLANA_WALLET to retrieve recent public wallet activity."
    }));
    return;
  }
  if (url.pathname === "/health" && req.method === "GET") {
    res.writeHead(200).end(JSON.stringify({ ok: true, service: "solana-ai-scanner-api" }));
    return;
  }
  if (url.pathname !== "/api/wallet-activity" || req.method !== "GET") {
    res.writeHead(404).end(JSON.stringify({ error: "Not found" }));
    return;
  }
  const address = url.searchParams.get("address") || "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    res.writeHead(400).end(JSON.stringify({ error: "A valid public Solana wallet address is required." }));
    return;
  }
  if (!HELIUS_API_KEY) {
    res.writeHead(503).end(JSON.stringify({ error: "Server Helius API key is not configured." }));
    return;
  }

  try {
    const endpoint = new URL(`https://api.helius.xyz/v0/addresses/${encodeURIComponent(address)}/transactions`);
    endpoint.searchParams.set("api-key", HELIUS_API_KEY);
    endpoint.searchParams.set("limit", "100");
    const upstream = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
    if (!upstream.ok) {
      res.writeHead(502).end(JSON.stringify({ error: "Transaction provider request failed.", status: upstream.status }));
      return;
    }
    const transactions = await upstream.json();
    const activity = Array.isArray(transactions) ? transactions.map(tx => ({
      signature: tx.signature,
      timestamp: tx.timestamp || null,
      type: tx.type || "UNKNOWN",
      source: tx.source || null,
      description: tx.description || "",
      tokenTransfers: (tx.tokenTransfers || []).map(t => ({
        mint: t.mint || null,
        tokenAmount: t.tokenAmount ?? null,
        fromUserAccount: t.fromUserAccount || null,
        toUserAccount: t.toUserAccount || null
      }))
    })) : [];
    res.writeHead(200).end(JSON.stringify({ address, count: activity.length, activity }));
  } catch {
    res.writeHead(504).end(JSON.stringify({ error: "Transaction provider timed out or could not be reached." }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Solana AI Scanner API listening on port ${PORT}`);
});
