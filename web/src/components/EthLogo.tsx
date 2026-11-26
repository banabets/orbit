/** Ethereum mark (official diamond on the brand blue). */
export function EthLogo({ size = 16 }: { size?: number }) {
  return (
    <svg className="eth" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="ETH">
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <g fill="#fff">
        <path fillOpacity=".6" d="M16.5 4v8.87l7.5 3.35z" /><path d="M16.5 4 9 16.22l7.5-3.35z" />
        <path fillOpacity=".6" d="M16.5 21.97V28L24 17.62z" /><path d="M16.5 28v-6.03L9 17.62z" />
        <path fillOpacity=".2" d="m16.5 20.57 7.5-4.35-7.5-3.35z" /><path fillOpacity=".6" d="m9 16.22 7.5 4.35v-7.7z" />
      </g>
    </svg>
  )
}
