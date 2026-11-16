// « Assistant IA » — the call to Claude, from the instructor's browser with their own key (key.ts). The official
// SDK is loaded with a dynamic import() (only when the assistant opens). One streamed request: Claude Opus 5.5 at
// high effort, adaptive thinking (the model's default: no `thinking` field), the server-side refusal fallback, a
// cached system prompt and the request last, and a structured output (the DECK PLAN schema). The JSON is validated
// here with the same Zod schema (never trusted as is). The client factory is injected so tests run offline.
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { L10n } from "../types";
import { DeckPlanZ, parsePlan, partialTitles, type DeckPlan } from "./schema";
import { systemPrompt, userMessage, type AiRequest } from "./prompt";
import { keyLooksValid } from "./key";

export const AI_MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type SdkModule = typeof import("@anthropic-ai/sdk");
export type ClientFactory = (apiKey: string) => Promise<Anthropic>;

/** The SDK, downloaded the first time the assistant needs it. */
export const loadSdk = (): Promise<SdkModule> => import("@anthropic-ai/sdk");
/** The browser client: the key goes only to api.anthropic.com, in its header. */
export const browserClient: ClientFactory = async (apiKey) => {
  const sdk = await loadSdk();
  return new sdk.default({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });
};

const L = (en: string, fr: string): L10n => ({ en, fr });

/** The JSON schema sent as output_config.format (the SDK's transform for the API's limits; parsed here, not by the
 *  stream helper, so a cut-off answer still reports its stop reason). */
let FORMAT: { type: "json_schema"; schema: Record<string, unknown> } | null =
  null;
function outputFormat() {
  if (!FORMAT) {
    const f = betaZodOutputFormat(DeckPlanZ);
    FORMAT = { type: "json_schema", schema: f.schema };
  }
  return FORMAT;
}

/** The request, exactly as sent. */
export function requestParams(r: AiRequest) {
  return {
    model: AI_MODEL,
    max_tokens: 64000,
    betas: [FALLBACK_BETA],
    fallbacks: "default" as const,
    output_config: { effort: "high" as const, format: outputFormat() },
    system: [
      {
        type: "text" as const,
        text: systemPrompt(),
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user" as const, content: userMessage(r) }],
  };
}

export type GenResult =
  | { ok: true; plan: DeckPlan }
  | {
      ok: false;
      reason: "key" | "refusal" | "tooLong" | "invalid" | "aborted" | "api";
      message: L10n;
    };

/** An SDK error in the instructor's words (typed classes, most specific first). */
export function errorMessage(
  e: unknown,
  sdk: Pick<
    SdkModule,
    | "AuthenticationError"
    | "PermissionDeniedError"
    | "RateLimitError"
    | "APIConnectionError"
    | "APIError"
  >,
): L10n {
  if (
    e instanceof sdk.AuthenticationError ||
    e instanceof sdk.PermissionDeniedError
  )
    return L("Key refused", "Clé refusée");
  if (e instanceof sdk.RateLimitError)
    return L(
      "Too many requests, try again in a moment",
      "Trop de demandes, réessayez dans un instant",
    );
  if (e instanceof sdk.APIConnectionError)
    return L("No connection", "Pas de connexion");
  const status = e instanceof sdk.APIError && e.status ? ` (${e.status})` : "";
  return L(
    `The assistant could not answer${status}. Try again.`,
    `L’assistant n’a pas pu répondre${status}. Réessayez.`,
  );
}

const isAbort = (e: unknown, sdk: SdkModule | null, signal?: AbortSignal) =>
  !!signal?.aborted ||
  (sdk ? e instanceof sdk.APIUserAbortError : false) ||
  (e instanceof Error && e.name === "AbortError");

/** Generate a deck plan. Never throws. */
export async function generatePlan(
  r: AiRequest,
  o: {
    apiKey: string;
    clientFactory?: ClientFactory;
    signal?: AbortSignal;
    /** the slide titles read so far from the stream */
    onTitles?: (titles: string[]) => void;
  },
): Promise<GenResult> {
  if (!keyLooksValid(o.apiKey))
    return {
      ok: false,
      reason: "key",
      message: L(
        "Enter a Claude API key first",
        "Saisissez d’abord une clé API Claude",
      ),
    };
  let sdk: SdkModule | null = null;
  try {
    sdk = await loadSdk();
    const client = await (o.clientFactory ?? browserClient)(o.apiKey.trim());
    if (o.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const stream = client.beta.messages.stream(requestParams(r), {
      ...(o.signal ? { signal: o.signal } : {}),
    });
    let shown = 0;
    stream.on("text", (_delta, snapshot) => {
      if (!o.onTitles) return;
      const t = partialTitles(snapshot);
      if (t.length !== shown) {
        shown = t.length;
        o.onTitles(t);
      }
    });
    const msg = await stream.finalMessage();
    // check why it stopped before reading the content
    if (msg.stop_reason === "refusal")
      return {
        ok: false,
        reason: "refusal",
        message: L(
          "The assistant could not generate this content. Rephrase the request and try again.",
          "L’assistant n’a pas pu générer ce contenu. Reformulez la demande et réessayez.",
        ),
      };
    if (msg.stop_reason === "max_tokens")
      return {
        ok: false,
        reason: "tooLong",
        message: L(
          "The deck was too long to finish. Ask for fewer slides.",
          "Le cours était trop long pour être terminé. Demandez moins de diapos.",
        ),
      };
    // after a fallback, only the model that finished speaks
    const blocks = msg.content;
    let from = 0;
    blocks.forEach((b, i) => {
      if (b.type === "fallback") from = i + 1;
    });
    const text = blocks
      .slice(from)
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const p = parsePlan(text);
    if (!p.ok)
      return {
        ok: false,
        reason: "invalid",
        message: L(
          "The answer was not a usable deck. Try again.",
          "La réponse n’était pas un cours utilisable. Réessayez.",
        ),
      };
    if (!p.plan.slides.length)
      return {
        ok: false,
        reason: "invalid",
        message: L(
          "The answer had no slide. Try again.",
          "La réponse ne contenait aucune diapo. Réessayez.",
        ),
      };
    return { ok: true, plan: p.plan };
  } catch (e) {
    if (isAbort(e, sdk, o.signal))
      return {
        ok: false,
        reason: "aborted",
        message: L("Cancelled", "Annulé"),
      };
    const m = sdk
      ? errorMessage(e, sdk)
      : L(
          "The assistant could not be loaded",
          "L’assistant n’a pas pu être chargé",
        );
    return { ok: false, reason: "api", message: m };
  }
}

/** « Vérifier »: one cheap call (the model's card, no tokens) that says whether the key works. */
export async function verifyKey(
  apiKey: string,
  clientFactory: ClientFactory = browserClient,
): Promise<{ ok: true } | { ok: false; message: L10n }> {
  if (!keyLooksValid(apiKey))
    return {
      ok: false,
      message: L(
        "This does not look like a Claude API key (sk-ant-…)",
        "Ce n’est pas une clé API Claude (sk-ant-…)",
      ),
    };
  try {
    const client = await clientFactory(apiKey.trim());
    await client.models.retrieve(AI_MODEL);
    return { ok: true };
  } catch (e) {
    const sdk = await loadSdk().catch(() => null);
    return {
      ok: false,
      message: sdk
        ? errorMessage(e, sdk)
        : L("No connection", "Pas de connexion"),
    };
  }
}
