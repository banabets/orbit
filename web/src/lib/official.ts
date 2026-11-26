/**
 * Wallets that get the blue "verified" check across Orbit. The check is tied to the exact address,
 * never to a name, so nobody can copy it by renaming themselves.
 */
const OFFICIAL = new Set([
  '0xac8a891e80cafb019484547352e53e81d1723375', // Orbit developer (deployed PaidInbox, receives the 5% treasury fee)
])
export const isOfficial = (address?: string | null) => !!address && OFFICIAL.has(address.toLowerCase())
/** Fixed display name for official wallets (nobody else can pick names on Orbit). */
export const OFFICIAL_NAME = 'Orbit'

/**
 * The official Orbit coin on pons. Empty until it launches: then put its TOKEN address here (from its pons page)
 * and Orbit shows the "Buy $ORBIT" button at the top and the blue check next to the coin everywhere it is listed.
 * Buying always happens on pons; Orbit never trades.
 */
export const ORBIT_TOKEN: string = ''
export const ORBIT_SYMBOL = 'ORBIT'
export const isOfficialToken = (token?: string | null) => !!ORBIT_TOKEN && !!token && token.toLowerCase() === ORBIT_TOKEN.toLowerCase()
export const orbitBuyUrl = () => `https://ponsfamily.com/launchpad/${ORBIT_TOKEN.toLowerCase()}`
