const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/forgot-password', '/admin/reset-password'];
export function isPublicAdminPath(path: string) { return PUBLIC_ADMIN_PATHS.includes(path); }
