import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

describe("test harness smoke test", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });

  it("loadDomainModule executes a plain global script and exposes its globals", () => {
    const sandbox = loadDomainModule("tests/fixtures/smoke-fixture.js");
    expect(sandbox.answer()).toBe(42);
  });
});
