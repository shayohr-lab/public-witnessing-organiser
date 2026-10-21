/** Where a signed-in person belongs, based on their approval status. */
export function homeFor(status?: string | null): string {
  if (status === "approved") return "/home";
  if (status) return "/pending";
  return "/";
}
