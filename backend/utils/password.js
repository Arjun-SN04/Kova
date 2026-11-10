// Rules for login passwords, shared by sign-up, reset and change
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 128 // bcrypt only reads the first 72 bytes; this stops huge bodies

// An error message, or null when the password is fine
export const passwordError = (password) => {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters`
  if (password.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters`
  return null
}
