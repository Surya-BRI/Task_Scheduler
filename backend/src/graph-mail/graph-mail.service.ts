import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderUserId: string;
}

const GRAPH_SCOPE = ['https://graph.microsoft.com/.default'];

/**
 * Sends workflow notification emails via Microsoft Graph's sendMail endpoint, using
 * app-only OAuth (client-credentials flow). No-ops silently when GRAPH_* env vars
 * aren't configured, so Graph outages/misconfiguration never block a caller's mutation.
 */
@Injectable()
export class GraphMailService {
  private readonly logger = new Logger(GraphMailService.name);
  private readonly config: GraphConfig;
  private msalApp: ConfidentialClientApplication | null = null;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.config = {
      tenantId: configService.get<string>('graph.tenantId') ?? '',
      clientId: configService.get<string>('graph.clientId') ?? '',
      clientSecret: configService.get<string>('graph.clientSecret') ?? '',
      senderUserId: configService.get<string>('graph.senderUserId') ?? '',
    };
  }

  isConfigured(): boolean {
    const { tenantId, clientId, clientSecret, senderUserId } = this.config;
    return Boolean(tenantId && clientId && clientSecret && senderUserId);
  }

  private getMsalApp(): ConfidentialClientApplication {
    if (!this.msalApp) {
      this.msalApp = new ConfidentialClientApplication({
        auth: {
          clientId: this.config.clientId,
          authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
          clientSecret: this.config.clientSecret,
        },
      });
    }
    return this.msalApp;
  }

  private async getGraphToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.value;
    }
    const result = await this.getMsalApp().acquireTokenByClientCredential({ scopes: GRAPH_SCOPE });
    if (!result?.accessToken) {
      throw new Error('Graph token acquisition returned no access token');
    }
    this.cachedToken = {
      value: result.accessToken,
      expiresAt: result.expiresOn ? result.expiresOn.getTime() : Date.now() + 5 * 60_000,
    };
    return this.cachedToken.value;
  }

  /** Resolves distinct, non-empty email addresses for a set of ERP userIds via ErpMasterEmployee. */
  async resolveEmails(userIds: Array<string | bigint>): Promise<string[]> {
    const ids = [...new Set(userIds.map((id) => BigInt(id)))];
    if (ids.length === 0) return [];
    const rows = await this.prisma.live.$queryRaw<Array<{ emailId: string | null }>>(Prisma.sql`
      SELECT DISTINCT emailId
      FROM ErpMasterEmployee
      WHERE userId IN (${Prisma.join(ids)})
        AND isActive = 1
        AND isDeleted = 0
        AND emailId IS NOT NULL
        AND LTRIM(RTRIM(emailId)) <> ''
    `);
    return rows.map((row) => row.emailId!.trim()).filter(Boolean);
  }

  private static escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Converts a plain-text body (blank line = paragraph break, single newline = line break)
   * into minimal HTML, so Graph renders the same line breaks as the in-app notification text
   * instead of collapsing them into one line.
   */
  private static renderEmailHtml(_subject: string, bodyText: string): string {
    const paragraphs = bodyText
      .split(/\n{2,}/)
      .map((block) => GraphMailService.escapeHtml(block).split('\n').join('<br>'))
      .filter(Boolean)
      .map((block) => `<p style="margin:0 0 12px;">${block}</p>`)
      .join('');

    return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#1e293b;">${paragraphs}</div>`;
  }

  private async sendMail(to: string[], subject: string, bodyText: string): Promise<void> {
    const token = await this.getGraphToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.senderUserId)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'HTML', content: GraphMailService.renderEmailHtml(subject, bodyText) },
            toRecipients: to.map((address) => ({ emailAddress: { address } })),
          },
          saveToSentItems: false,
        }),
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Graph sendMail failed (${response.status}): ${text}`);
    }
  }

  /**
   * Fire-and-forget entry point: resolves userIds to emails and sends via Graph.
   * No-op when Graph isn't configured or no recipient has a resolvable email.
   * Callers should chain `.catch()` rather than await, so a Graph failure never
   * blocks the caller's own request/transaction.
   */
  async notify(userIds: Array<string | bigint>, subject: string, bodyText: string): Promise<void> {
    if (!this.isConfigured() || userIds.length === 0) return;
    const emails = await this.resolveEmails(userIds);
    if (emails.length === 0) {
      this.logger.warn(`No resolvable email addresses for userIds [${userIds.join(', ')}] — skipping Graph email`);
      return;
    }
    await this.sendMail(emails, subject, bodyText);
  }
}
