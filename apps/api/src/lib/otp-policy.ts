/**
 * Whether the API may return an OTP in its response instead of only sending it.
 *
 * - Local development (devMode): always, for convenience.
 * - Public demo (demoMode): only for household numbers, so visitors can try the
 *   booking flow without SMS. Admin OTPs are never revealed — otherwise anyone
 *   could log in as staff.
 */
export function mayRevealOtp(opts: { devMode: boolean; demoMode: boolean; isAdminPhone: boolean }): boolean {
  if (opts.devMode) return true;
  return opts.demoMode && !opts.isAdminPhone;
}
