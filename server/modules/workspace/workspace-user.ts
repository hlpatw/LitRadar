export function getAuthenticatedUserId(request: any): string {
  return request.user.userId;
}
