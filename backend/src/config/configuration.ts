export interface AppConfig {
  nodeEnv: string;
  port: number;
  cookieSecret: string;
  mongoUri: string;
  session: {
    idleTimeoutMinutes: number;
    absoluteTimeoutHours: number;
  };
  argon2: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };
  login: {
    maxAttempts: number;
    windowMinutes: number;
    lockoutMinutes: number;
  };
  company: {
    legalName: string;
    state: string;
    gstin: string;
    currentFy: string;
  };
  corsOrigins: string[];
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  cookieSecret: process.env.COOKIE_SECRET ?? '',
  mongoUri: process.env.MONGO_URI ?? '',
  session: {
    idleTimeoutMinutes: parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? '60', 10),
    absoluteTimeoutHours: parseInt(process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS ?? '12', 10),
  },
  argon2: {
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST ?? '19456', 10),
    timeCost: parseInt(process.env.ARGON2_TIME_COST ?? '2', 10),
    parallelism: parseInt(process.env.ARGON2_PARALLELISM ?? '1', 10),
  },
  login: {
    maxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS ?? '5', 10),
    windowMinutes: parseInt(process.env.LOGIN_WINDOW_MINUTES ?? '15', 10),
    lockoutMinutes: parseInt(process.env.LOGIN_LOCKOUT_MINUTES ?? '15', 10),
  },
  company: {
    legalName: process.env.COMPANY_LEGAL_NAME ?? 'Demo Garment Co',
    state: process.env.COMPANY_STATE ?? 'Maharashtra',
    gstin: process.env.COMPANY_GSTIN ?? '',
    currentFy: process.env.CURRENT_FINANCIAL_YEAR ?? '26-27',
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },
});
