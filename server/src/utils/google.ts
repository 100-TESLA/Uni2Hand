import { OAuth2Client, TokenPayload } from 'google-auth-library'
import 'dotenv/config'

const getGoogleClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  return new OAuth2Client(clientId)
}

export interface GoogleUserPayload {
  email: string
  email_verified?: boolean
  name?: string
  picture?: string
  sub: string // Google user ID
  given_name?: string
  family_name?: string
}

/**
 * Verifies a Google ID token and returns the decoded token payload.
 * Checks signature, issuer, expiration, and audience (must match GOOGLE_CLIENT_ID).
 * Throws an error if any check fails or the payload cannot be retrieved.
 */
export const verifyGoogleIdToken = async (idToken: string): Promise<TokenPayload> => {
  if (!idToken) {
    throw new Error('Google ID token is required')
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured in server environment')
  }

  const client = getGoogleClient()

  // verifyIdToken internally checks:
  // 1. Cryptographic signature with Google's public certificates
  // 2. Issuer (must be accounts.google.com or https://accounts.google.com)
  // 3. Expiration time (now <= exp + clockSkew)
  // 4. Audience matching requiredAudience (must match clientId)
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId
  })

  const payload = ticket.getPayload()
  if (!payload) {
    throw new Error('Invalid Google ID token: empty payload')
  }

  // Defense-in-depth: Explicit audience validation
  if (payload.aud !== clientId) {
    throw new Error(`Token audience mismatch: expected ${clientId}, got ${payload.aud}`)
  }

  // Defense-in-depth: Issuer validation
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    throw new Error(`Invalid token issuer: ${payload.iss}`)
  }

  return payload
}
