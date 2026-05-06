import { initializeResponse } from "../src/server.mjs";
const response = initializeResponse(1);
if (!response.result.capabilities.documentFormattingProvider) {
  throw new Error("missing formatting capability");
}
console.log("sley-lsp smoke ok");
