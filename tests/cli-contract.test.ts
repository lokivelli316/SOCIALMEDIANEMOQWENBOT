import assert from "node:assert/strict";
import test from "node:test";
import { parsePublishFlags, publishExitCode } from "../src/core/cli-contract.js";

test("CLI publish exit taxonomy treats async acceptance as success", () => {
  assert.equal(publishExitCode("published"), 0);
  assert.equal(publishExitCode("submitted"), 0);
  assert.equal(publishExitCode("hold"), 2);
  assert.equal(publishExitCode("verifying"), 2);
  assert.equal(publishExitCode("planned"), 2);
  assert.equal(publishExitCode("failed"), 3);
});

test("CLI publish flags are strict and support dry-run without inventing aliases", () => {
  assert.deepEqual(parsePublishFlags(["--approve", "--retry", "--dry-run"]), {
    approve: true,
    retry: true,
    dryRun: true
  });
  assert.throws(
    () => parsePublishFlags(["--approv", "--retrys"]),
    /Unknown publish flag/
  );
});
