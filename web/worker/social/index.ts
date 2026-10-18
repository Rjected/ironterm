// Ironterm social (docs/social/PROTOCOL.md): friends across self-hosted servers.
//   peer.ts   /.well-known/ironterm and the signed /social/v1/* endpoints (no login, signature required)
//   owner.ts  /api/social/* for the web UI and apps (behind the normal login)
//   build.ts  profile + feed filtered by share level
//   sign.ts   Ed25519 request signing, shared with the directory

import type { SocialEnv } from "./net";
import { normOrigin } from "./sign";

export { handlePeer, type SocialCtx } from "./peer";
export { handleOwner } from "./owner";
export type { SocialEnv } from "./net";

/** This server's canonical origin: SOCIAL_ORIGIN when set, else the request's (proxies already set X-Forwarded-*). */
export function socialOrigin(env: SocialEnv, url: URL): string {
  return (env.SOCIAL_ORIGIN && normOrigin(env.SOCIAL_ORIGIN, true)) || url.origin;
}

export const isPeerPath = (path: string) => path === "/.well-known/ironterm" || path.startsWith("/social/");
export { ensureSocialSchema } from "./db";
