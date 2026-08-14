/**
 * @sentra/config is the only place permitted to read `process.env`. Everything else
 * receives an already-validated {@link AppConfig}, which makes configuration errors a
 * startup failure rather than a runtime surprise.
 */
export { envSchema, type RawEnv } from './env';
export {
  loadConfig,
  loadEnv,
  describeConfig,
  resetConfigForTesting,
  type AppConfig,
} from './config';
export { parseDotEnv, loadDotEnvFile, resetDotEnvLoaderForTesting } from './dotenv';
