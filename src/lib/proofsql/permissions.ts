export type Role = "admin" | "analyst" | "viewer";
export const mayApprove = (roles: readonly Role[]) => roles.includes("admin") || roles.includes("analyst");
export const mayManageAccess = (roles: readonly Role[]) => roles.includes("admin");