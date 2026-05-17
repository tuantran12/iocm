import NextAuth from "next-auth"
import { NextResponse } from "next/server"
import { authConfig } from "@/lib/auth.config"

/**
 * Edge-safe middleware. Uses authConfig (no Prisma, no bcrypt) so it can run
 * in the Edge runtime. The full auth (with Credentials provider) lives in
 * src/lib/auth.ts and is invoked by the API route handlers.
 */
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth

  // Public paths that don't require authentication
  const publicPaths = ["/login", "/api/auth", "/forgot-password", "/reset-password"]
  const isPublicPath = publicPaths.some((path) =>
    nextUrl.pathname.startsWith(path)
  )

  if (isPublicPath) {
    if (isLoggedIn && nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/founding", nextUrl))
    }
    return NextResponse.next()
  }

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl)
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
}
