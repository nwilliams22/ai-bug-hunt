export interface Token {
  value: string;
  /** ms since epoch, from the issuer's `expires_in`. */
  expiresAt: number;
}

interface Clock {
  now(): number;
}

/**
 * Holds the service-to-service access token and mints a new one before the
 * current one expires. One instance is shared by every outbound call in the
 * process, and concurrent callers join the mint already in flight rather than
 * each starting their own.
 */
export class TokenSource {
  private token: Token | null = null;
  private inflight: Promise<Token> | null = null;

  constructor(
    private readonly mint: () => Promise<Token>,
    private readonly clock: Clock = Date,
    private readonly skewMs = 30_000,
  ) {}

  /** A token that is valid now, minting one if the current one is near expiry. */
  async get(): Promise<string> {
    if (this.token && this.token.expiresAt - this.skewMs > this.clock.now()) {
      return this.token.value;
    }

    if (!this.inflight) {
      this.inflight = this.mint();
    }

    const token = await this.inflight;
    this.token = token;
    return token.value;
  }

  /** Called when a downstream returns 401, to force a mint on the next call. */
  invalidate(): void {
    this.token = null;
  }
}
