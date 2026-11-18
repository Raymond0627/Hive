/**
 * Loads `.env` once, before any module that reads configuration.
 * The workspaces run with cwd=server, so the repo-root file is `../.env`.
 */
import { config } from 'dotenv'

config({ path: ['../.env', '.env'] })
