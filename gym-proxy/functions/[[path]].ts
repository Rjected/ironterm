// Custom-domain front door for when your domain's DNS is NOT on Cloudflare (a Worker custom
// domain needs a Cloudflare zone; Pages accepts external DNS via a plain CNAME). Every request is handed
// to the hevy-terminal Worker over a service binding, untouched (same host, path, cookies),
// so the Worker sees your domain as its origin and does its own Google sign-in.
interface Env { APP: Fetcher }

export const onRequest: PagesFunction<Env> = ({ request, env }) => env.APP.fetch(request);
