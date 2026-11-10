import { test } from "node:test"
import assert from "node:assert/strict"
import { passwordError, MIN_PASSWORD } from "../utils/password.js"

test("password rules", () => {
  assert.ok(passwordError("short"))
  assert.ok(passwordError(undefined))
  assert.ok(passwordError({ $gt: "" }))
  assert.ok(passwordError("x".repeat(500)))
  assert.equal(passwordError("x".repeat(MIN_PASSWORD)), null)
})
