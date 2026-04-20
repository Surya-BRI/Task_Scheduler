export interface ApiError {
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
}
