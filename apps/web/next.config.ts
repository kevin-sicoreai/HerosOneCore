import type { NextConfig } from "next"

// Dev-time same-origin proxy to the backend services. The browser only talks to
// the Next origin (avoiding cross-origin/CORS and localhost/IPv6 issues); Next
// forwards to each service. This is a stand-in for the gateway.
const nextConfig: NextConfig = {
  // Next 16 blocks dev resources (incl. HMR websocket) from hosts not listed
  // here. Allow both loopback names so localhost and 127.0.0.1 both work.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  async rewrites() {
    return [
      { source: "/api/data/:path*", destination: "http://127.0.0.1:8000/:path*" },
      { source: "/api/pipeline/:path*", destination: "http://127.0.0.1:8001/:path*" },
      { source: "/api/ontology/:path*", destination: "http://127.0.0.1:8003/:path*" },
      { source: "/api/governance/:path*", destination: "http://127.0.0.1:8004/:path*" },
      { source: "/api/auth/:path*", destination: "http://127.0.0.1:8005/:path*" },
      { source: "/api/assist/:path*", destination: "http://127.0.0.1:8006/:path*" },
      { source: "/api/analysis/:path*", destination: "http://127.0.0.1:8008/:path*" },
      { source: "/api/app-builder/:path*", destination: "http://127.0.0.1:8002/:path*" },
    ]
  },
}

export default nextConfig
