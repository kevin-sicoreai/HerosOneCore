import type { NextConfig } from "next"

// Same-origin proxy to the backend services. The browser only talks to the
// Next origin (avoiding cross-origin/CORS and localhost/IPv6 issues); Next
// forwards to each service. This is a stand-in for the gateway.
//
// Destinations come from the unified config (*_API_URL keys in
// config/<profile>.env, loaded via `source scripts/env.sh [dev|prod]` — see
// scripts/services/start_web.sh). Bare 127.0.0.1 defaults keep a plain
// `npm run dev` working without a profile.
const svc = (url: string | undefined, port: number) =>
  url ?? `http://127.0.0.1:${port}`

const nextConfig: NextConfig = {
  // Next 16 blocks dev resources (incl. HMR websocket) from hosts not listed
  // here. Allow both loopback names so localhost and 127.0.0.1 both work.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  async rewrites() {
    return [
      { source: "/api/data/:path*", destination: `${svc(process.env.DATA_API_URL, 8000)}/:path*` },
      { source: "/api/pipeline/:path*", destination: `${svc(process.env.PIPELINE_API_URL, 8001)}/:path*` },
      { source: "/api/ontology/:path*", destination: `${svc(process.env.ONTOLOGY_API_URL, 8003)}/:path*` },
      { source: "/api/governance/:path*", destination: `${svc(process.env.GOV_API_URL, 8004)}/:path*` },
      { source: "/api/auth/:path*", destination: `${svc(process.env.AUTH_API_URL, 8005)}/:path*` },
      { source: "/api/assist/:path*", destination: `${svc(process.env.ASSIST_API_URL, 8006)}/:path*` },
      { source: "/api/analysis/:path*", destination: `${svc(process.env.ANALYSIS_API_URL, 8008)}/:path*` },
    ]
  },
}

export default nextConfig
