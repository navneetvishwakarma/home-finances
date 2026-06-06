import { describe, expect, test } from "vitest";
import {
  buildTokenSignature,
  isLearnableTokenSignature,
  tokenizeTransactionMemory
} from "@/modules/classification/classification-memory";

describe("classification memory text intelligence", () => {
  test("builds the same high-signal signature for similar merchant descriptions", () => {
    const first = buildTokenSignature(tokenizeTransactionMemory("UPI/BIGBASKET/ORDER123"));
    const second = buildTokenSignature(tokenizeTransactionMemory("UPI BIGBASKET ORDER999"));

    expect(first).toBe("bigbasket");
    expect(second).toBe(first);
  });

  test("removes dynamic references, amounts, dates, UTRs, and account-like numbers", () => {
    const signature = buildTokenSignature(
      tokenizeTransactionMemory(
        "NEFT Ref:UTR123456789012 amount: INR 1,250.00 2026-04-01 AC 123456789012 SWIGGY ORDER987654321"
      )
    );

    expect(signature).toBe("swiggy");
  });

  test("rejects generic transfer signatures as not learnable", () => {
    const signature = buildTokenSignature(tokenizeTransactionMemory("NEFT TRANSFER TO SELF REF 1234567890"));

    expect(signature).toBe("");
    expect(isLearnableTokenSignature(signature)).toBe(false);
  });
});
