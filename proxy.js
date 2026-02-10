import { NextResponse } from "next/server"

/**
 * Proxy configuration to ensure static assets, icons, and favicons bypass any
 * authentication or authorization checks.
 *
 * FIXES: GET 401 /icon-light-32x32.png spam in logs
 */
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico   (favicon)
     * - icon*         (app icons)
     * - apple-icon*   (Apple touch icons)
     * - *.svg, *.png, *.jpg, *.jpeg, *.gif, *.webp, *.ico (image assets)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icon.*|apple-icon.*|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$|.*\\.ico$).*)",
  ],
}

export default async function middleware(request) {
  // All requests that reach this middleware pass through unmodified.
  // The `config.matcher` above ensures this middleware only runs on
  // routes that actually need it (API routes), and explicitly EXCLUDES
  // static assets, icons, and public files.
  return NextResponse.next()
}
