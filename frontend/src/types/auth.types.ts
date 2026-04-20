export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'HOD' | 'DESIGNER';
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}
