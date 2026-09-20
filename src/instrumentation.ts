export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureIndexer } = await import("./lib/indexer");
    ensureIndexer();
  }
}
