import app from '../src/index.js'
import { handle } from 'hono/vercel'

export const runtime = 'nodejs'

const handler = handle(app)

export default handler
export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
