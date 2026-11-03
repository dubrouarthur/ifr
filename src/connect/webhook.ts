// School webhook: POST debriefs as JSON to a configured URL.
import { store } from '../ui/dom';

export interface WebhookCfg {
  url: string;
  auto: boolean;
}
export const webhookCfg = (): WebhookCfg => store.get<WebhookCfg>('ifr.webhook', { url: '', auto: false });

export async function postWebhook(payload: unknown): Promise<string> {
  const cfg = webhookCfg();
  if (!cfg.url) return 'No webhook URL configured';
  try {
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    return r.ok ? `Sent (${r.status})` : `Server answered ${r.status}`;
  } catch (e) {
    return `Failed: ${String(e).slice(0, 80)} (check CORS on the receiving side)`;
  }
}

