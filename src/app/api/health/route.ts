import { NextResponse } from 'next/server'

/**
 * Health check endpoint cho deployment verification và load balancer
 * GET /api/health
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'iocm',
    },
    { status: 200 }
  )
}
