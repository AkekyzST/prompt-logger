import { CodeChallengeMethod, OAuth2Client, type OAuth2Tokens } from 'arctic';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Generic OIDC client built on arctic's OAuth2Client + PKCE. There is
 * intentionally no provider-specific code here: we rely entirely on the
 * issuer's `.well-known/openid-configuration` document to discover endpoints.
 *
 * The discovery document is fetched lazily on first use and cached for the
 * lifetime of the process. A failed fetch is not cached — a subsequent call
 * will retry.
 */

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
}

export interface UserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
}

let discoveryPromise: Promise<DiscoveryDocument> | null = null;

function buildDiscoveryUrl(issuer: string): string {
  const trimmed = issuer.replace(/\/+$/, '');
  return `${trimmed}/.well-known/openid-configuration`;
}

async function fetchDiscovery(): Promise<DiscoveryDocument> {
  const url = buildDiscoveryUrl(config.OIDC_ISSUER);
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText} from ${url}`);
  }
  const doc = (await res.json()) as Partial<DiscoveryDocument>;
  if (
    typeof doc.issuer !== 'string' ||
    typeof doc.authorization_endpoint !== 'string' ||
    typeof doc.token_endpoint !== 'string' ||
    typeof doc.userinfo_endpoint !== 'string'
  ) {
    throw new Error(`OIDC discovery document from ${url} is missing required fields`);
  }
  logger.info({ issuer: doc.issuer }, 'OIDC discovery loaded');
  return doc as DiscoveryDocument;
}

export async function getDiscovery(): Promise<DiscoveryDocument> {
  if (!discoveryPromise) {
    discoveryPromise = fetchDiscovery().catch((err) => {
      // Invalidate so a later call can retry.
      discoveryPromise = null;
      throw err;
    });
  }
  return discoveryPromise;
}

/**
 * Test hook: override the cached discovery document. Never call from
 * production code.
 */
export function __setDiscoveryForTesting(doc: DiscoveryDocument | null): void {
  discoveryPromise = doc === null ? null : Promise.resolve(doc);
}

let clientInstance: OAuth2Client | null = null;
function getClient(): OAuth2Client {
  if (!clientInstance) {
    clientInstance = new OAuth2Client(
      config.OIDC_CLIENT_ID,
      config.OIDC_CLIENT_SECRET,
      config.OIDC_REDIRECT_URI
    );
  }
  return clientInstance;
}

function getScopes(): string[] {
  return config.OIDC_SCOPES.split(/\s+/).filter((s) => s.length > 0);
}

/**
 * Build the authorization URL with PKCE (S256). The caller must persist the
 * provided `state` and `codeVerifier` in a short-lived, signed cookie and
 * validate them in the callback.
 */
export async function createAuthorizationURL(state: string, codeVerifier: string): Promise<URL> {
  const discovery = await getDiscovery();
  return getClient().createAuthorizationURLWithPKCE(
    discovery.authorization_endpoint,
    state,
    CodeChallengeMethod.S256,
    codeVerifier,
    getScopes()
  );
}

export async function validateAuthorizationCode(
  code: string,
  codeVerifier: string
): Promise<OAuth2Tokens> {
  const discovery = await getDiscovery();
  return getClient().validateAuthorizationCode(discovery.token_endpoint, code, codeVerifier);
}

/**
 * Fetch userinfo. Requires `openid email` scopes; `profile` is needed for
 * `name`. `sub` and `email` are treated as required by this project.
 */
export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const discovery = await getDiscovery();
  const res = await fetch(discovery.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`OIDC userinfo failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  const sub = typeof raw.sub === 'string' ? raw.sub : null;
  const email = typeof raw.email === 'string' ? raw.email : null;
  if (!sub || !email) {
    throw new Error('OIDC userinfo response is missing sub or email');
  }
  return {
    sub,
    email,
    email_verified: typeof raw.email_verified === 'boolean' ? raw.email_verified : undefined,
    name:
      typeof raw.name === 'string'
        ? raw.name
        : typeof raw.preferred_username === 'string'
          ? raw.preferred_username
          : undefined,
  };
}

export { generateCodeVerifier, generateState } from 'arctic';
