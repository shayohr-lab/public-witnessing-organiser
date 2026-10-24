import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Content-Security-Policy for the published app. GitHub Pages cannot send
 * security headers, so the policy goes in a <meta> tag. It is added to the
 * production build only, because the dev server needs inline scripts.
 * It stops injected scripts from running and only lets the app talk to its
 * own Supabase project, Google Fonts and the OpenStreetMap embed.
 */
function contentSecurityPolicy(supabaseUrl: string | undefined): Plugin {
  let host = "";
  try {
    host = supabaseUrl ? new URL(supabaseUrl).host : "";
  } catch {
    host = "";
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self'${host ? ` https://${host} wss://${host}` : ""}`,
    "frame-src https://www.openstreetmap.org",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" },
      { tag: "meta", attrs: { name: "referrer", content: "strict-origin-when-cross-origin" }, injectTo: "head-prepend" },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    // GitHub Pages serves the app from /<repo-name>/; other hosts use "/"
    base: process.env.BASE_PATH || "/",
    server: { host: "::", port: 8080 },
    plugins: [react(), contentSecurityPolicy(env.VITE_SUPABASE_URL)],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  };
});
