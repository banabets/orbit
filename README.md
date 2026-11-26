# Orbit

Radar en vivo de los lanzamientos de pons en Robinhood Chain, con correo entre wallets que se paga en PONS o ETH.

## Qué funciona

| Parte | Red | Estado |
|---|---|---|
| **Radar** (Clásico y Tarjetas) | Robinhood Chain **mainnet** (4663) | Lanzamientos, trades, ballenas, graduaciones, logos, precio, market cap y progreso de curva, en vivo cada 1.5 s |
| **Página de token** | mainnet | Gráfica de línea o velas; debajo, todos los trades de la curva con el nombre de cada cuenta (como en pons), top traders e info. **Ganancias del creador** = suma del impuesto de creador (`tax`) de cada compra y venta en la curva |
| **Carrera a la graduación** | mainnet | Tokens ordenados por progreso real de su curva |
| **Ficha del creador** (`#/creador/0x…`) | mainnet | Todos sus lanzamientos desde que existe pons v2, cuántos graduó, cuánto aún tiene de cada token y cuánto vendió y compró en cada curva |
| **Cartera** (`#/cartera/0x…`) | mainnet | Saldo de cualquier wallet en los ~8,500 tokens de pons (≈2 s), valor actual y ganancia según sus trades; marca si la dirección es un contrato |
| **Ranking** | mainnet | Traders por volumen en 24 h, creadores con más graduados, «cazadores» que entran primero en los que se gradúan |
| **Alertas** | mainnet | Notificaciones del navegador para tokens y creadores que sigues (cruces de curva, graduación, venta del creador, compras grandes). Funcionan con una pestaña de Orbit abierta |
| **Correo** (`PaidInbox` v2) | red local **o mainnet con tu wallet** | Paga en **PONS o ETH**, depósito de 72 h, reglas Devolver / Quedármelo / 50-50, comisión 5 %, mensajes cifrados en el navegador |

## Nombres de cuenta

Iguales a los de ponsfamily.com: si la wallet creó perfil en pons, su nombre viene de la API de identidades de pons (`/api/identities`); si no, se usa el seudónimo que pons deriva de la dirección (adjetivo + color + sustantivo, p. ej. *SlowNeonThrush*), implementado en `web/src/lib/names.ts`. Esa API no envía cabeceras CORS: en desarrollo pasa por el proxy `/pons-api` de Vite; en producción hay que poner el mismo reenvío en el hosting.

## Qué cubre y qué no

Orbit lee el factory **v2** de pons (`0x7eD5…EC7e`, tokens con curva). pons también tiene lanzamientos de **primera generación** (factory `0xa5aa…1feb`) que operan en pools de Uniswap v3, como PONS o NovaAI. Esos aún no aparecen en Orbit.

## Monedas de par

No todos los tokens de pons se compran con ETH: unos 1,200 usan **USDG** (6 decimales) o tokens de acciones de Robinhood (NVDA, TSLA, SPY…). Orbit lee el par de cada lanzamiento y muestra montos en su moneda. En dólares solo convierte ETH (precio de Coinbase) y USDG ($1); los pares en acciones no se suman a totales en dólares.

## Límites del RPC público

- `eth_getLogs` con una dirección y un solo tema por posición: 10 M de bloques. Con varios temas: 100 k. Sin dirección: 30 k.
- Las respuestas agrupadas muy grandes se rechazan y las ráfagas devuelven 429 (en el navegador se ve como «Failed to fetch»). Las lecturas de historial van sin agrupar, con concurrencia limitada y reintentos.

## Arrancar

```bash
npm run setup   # solo la primera vez
npm run dev     # red local + despliegue de PaidInbox y PONS (dev) + web en http://localhost:5173
npm test        # 16 pruebas del contrato
```

## Contrato `PaidInbox` v2

- Cada wallet elige qué monedas acepta y a qué precio: `configure(open, rule, encKey, assets[], amounts[])`.
  ETH es `address(0)`; PONS en mainnet es `0x39dBED3a2bd333467115dE45665cC57F813C4571`.
- `send(to, asset, ciphertext)`: si hace falta pagar, cobra en el activo elegido (para PONS primero se aprueba).
- `reply(id, ciphertext)`: el destinatario responde y se liquida según su regla; quedan como contactos (gratis desde entonces).
- `refund(id)`: cualquiera devuelve un pago vencido (72 h).
- Soporta tokens con comisión de transferencia: guarda en depósito lo que realmente llegó.

## Pasar el correo a mainnet

En la web, **Correo → Mainnet**:

1. **Conectar wallet** (MetaMask u otra compatible). Si falta, agrega Robinhood Chain (4663) y cambia de red sola.
2. **Tesorería**: la dirección que cobra el 5 %. Es inmutable, así que lo ideal es una multisig.
3. **Desplegar PaidInbox**: tu wallet muestra el costo y tú firmas. Orbit nunca toca llaves privadas.
4. Para que todos usen el mismo contrato, pon su dirección en `web/src/contracts/mainnet.json`. Sin ese archivo, cada navegador usa el que desplegó o el que pegó en «usa uno que ya desplegó tu equipo».

Alternativa desde la terminal (también escribe `mainnet.json`):

```bash
cd contracts
DEPLOYER_KEY=... TREASURY=0xTuMultisig npx hardhat run scripts/deploy.cjs --network robinhood --config hardhat.config.cjs
```

Antes de anunciarlo: **auditoría externa** de `PaidInbox.sol`, porque guarda dinero de otras personas. Luego: XMTP para que los mensajes se lean desde cualquier dispositivo (hoy la clave de cifrado vive en el navegador).

Si cambias el contrato: `npx hardhat compile` y `node scripts/export-artifact.cjs` (en `contracts/`) para actualizar el bytecode que usa la web.

## Estructura

```
contracts/           PaidInbox.sol (v2), MockERC20 (tests y PONS dev), pruebas, despliegue
web/src/lib/pons.ts      lectura de pons v2: eventos, curvas, logos IPFS, precios
web/src/lib/usePons.ts   fuente en vivo única de toda la app
web/src/lib/inbox.ts     cliente del contrato (red local o mainnet), despliegue, monedas y cifrado
web/src/lib/wallet.ts    conexión con MetaMask (EIP-6963), cambio a Robinhood Chain
web/src/components/      Home (Clásico/Tarjetas), TokenPage + Chart, Race, Mail
```
