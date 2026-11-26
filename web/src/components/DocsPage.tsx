import { useEffect, useMemo, useRef, useState } from 'react'
import { useT, type Lang } from '../lib/i18n'
import { GIcon, type Concept } from './Icon'
import { WIDGETS } from './DocsWidgets'
import '../docs.css'

type Sec = { id: string; icon: Concept; title: string; intro: string; steps?: string[]; tips?: string[] }
type Doc = { title: string; sub: string; contents: string; sections: Sec[]; glossaryTitle: string; glossary: [string, string][]; faqTitle: string; faq: [string, string][] }

/* Plain-language guide. Written for someone who has never used crypto tools before. */
const DOCS: Record<Lang, Doc> = {
  en: {
    title: 'How Orbit works',
    sub: 'A simple guide. No experience needed. Read it top to bottom or jump to what you need.',
    contents: 'Contents',
    sections: [
      { id: 'what', icon: 'radar', title: 'What is Orbit?', intro: 'Orbit is a live window into pons, the token launchpad on Robinhood Chain. It shows every new token, every buy and sell, and every token that “graduates”, a few seconds after it happens. Everything comes straight from the blockchain, so nobody can fake it.' },
      { id: 'wallet', icon: 'wallet', title: 'Connect your wallet', intro: 'Your wallet is your account. You don’t need an email or a password.', steps: ['On a computer: install MetaMask (or another browser wallet), press “Connect wallet” at the top right and approve in your wallet. If it asks to add or switch to Robinhood Chain, approve that too.', 'On a phone: phone browsers and apps added to your home screen have no wallet inside. Press “Connect” and choose MetaMask, Trust Wallet or Coinbase Wallet: Orbit opens inside that app and connects in one tap.', 'To switch accounts, tap your address at the top right and choose “Disconnect”, then connect again with the account you want.'], tips: ['Orbit never asks for your secret phrase or private key. If anyone asks for it, it is a scam.', 'Connecting is free. Only actions that send money (like paying for a message) cost a small network fee, and your wallet always shows it first.', 'If your wallet popup was closed without answering, Orbit stops waiting after a few seconds so you can try again.'] },
      { id: 'radar', icon: 'radar', title: 'Radar (the home page)', intro: 'The Radar is the pulse of pons in one screen.', steps: ['Circles at the top: the newest tokens (with a “NEW” tag) and the most traded ones. Swipe or use the arrows to see more. Tap one to open it.', 'Biggest on pons: the tokens with the largest market cap.', 'Live curves: tokens being traded right now, with how far each one is on its curve, its market cap and a small price chart.', 'Latest buys: every purchase as it happens: which coin, how much, and who.', 'Big buys: purchases of $250 or more. A dolphin 🐬 is $250 or more, a whale 🐋 is $1,000 or more.'] },
      { id: 'token', icon: 'trades', title: 'A token’s page', intro: 'Open any token to see everything about it.', steps: ['The chart shows market cap in dollars (or switch to price). Choose “Candles” or “Line” and the time range.', 'The curve bar shows how close the token is to graduating.', 'Creator earnings: how much the creator has earned from the small fee on every trade.', 'Trades: every buy and sell with the buyer’s name and labels (see “Wallet labels”).', 'Story (on phones): the key moments of the token, from launch to graduation, with a button to share it on X.', 'The bell 🔔 sets a price alert. “Follow” adds the token to your watchlist. “Trade on pons” opens it on ponsfamily.com to buy or sell.'] },
      { id: 'launches', icon: 'launch', title: 'Curves & graduation', intro: 'Every token starts on a “bonding curve”: the more people buy, the higher the price. When it collects enough money it graduates and moves to a normal trading pool.', steps: ['The bar under each token shows how full its curve is.', 'On the Radar, filter by “On curve”, “New” or “Graduated”.', 'A token graduates when its curve collects its goal.', 'Graduated tokens keep trading on a Uniswap pool.'] },
      { id: 'labels', icon: 'bot', title: 'Wallet labels', intro: 'Next to a buyer’s name, Orbit can show what that wallet does on pons. The labels come from real trades on the chain.', steps: ['🎯 Sniper: bought in the first minute after the token launched.', '🤖 Bot: traded 12 or more different tokens (or 60+ times) in the last hour. On the phone you can hide bots from the live feed.', '🛠 Creator: launched this token, or two or more tokens.', '🐋 Whale: bought $1,000 or more in the last hour.', '💎 Diamond hands: bought this token more than 6 hours ago and never sold any.'], tips: ['Labels describe behaviour, not intentions. Always do your own research.'] },
      { id: 'leaderboard', icon: 'trophy', title: 'Leaderboard', intro: 'Who is winning on pons.', steps: ['Creator rewards: creators who earned the most from their tokens, with their main coin.', 'Traders: wallets with the most trading volume in the last 24 hours.', 'Most graduations: creators whose tokens graduated the most.', 'Early hunters: wallets that bought first in tokens that later graduated.'] },
      { id: 'portfolio', icon: 'wallet', title: 'Portfolio', intro: 'See what any wallet holds on pons: its tokens, what they are worth now and its profit or loss.', steps: ['Connect your wallet to see your own, or paste any address to look at someone else’s. Every wallet is public on a blockchain.'] },
      { id: 'alerts', icon: 'alerts', title: 'Alerts', intro: 'Orbit can tap you on the shoulder when something happens.', steps: ['Follow tokens (from their page) and creators (from their profile).', 'Choose what to be told about: a token near graduation, a graduation, the creator selling, a new launch from a creator you follow, or any big buy.', 'Price alerts: on a token’s page tap the bell 🔔 and choose a market cap. Orbit tells you once when the token goes above or drops below it. You can see and remove them in Alerts → My rules.', 'Press “Allow notifications” so your computer or phone can show them.'], tips: ['Today alerts work while Orbit is open on that device, even in the background.'] },
      { id: 'mail', icon: 'mail', title: 'Mail: paid messages between wallets', intro: 'Send a private message to any wallet, for example a token’s creator. To stop spam, you pay a small amount in PONS or ETH to reach people who set a price.', steps: ['The first time, “Unlock your mail” asks your wallet for one free signature (not a transaction, no gas). That creates your encryption key, and the same wallet unlocks the same inbox on any device.', 'Activate your inbox to receive messages: choose your price in PONS and/or ETH and what happens to the payment when you reply (refund it, keep it, or split 50/50).', 'When you write to someone who charges, your payment waits in a safe box (escrow) inside the contract.', 'If they reply within 72 hours, the payment is settled by their rule. If they don’t, anyone can press “Refund” and you get 100% back.', 'After the first reply you are contacts: messaging is free from then on.'], tips: ['Messages are encrypted in your browser. The blockchain only stores scrambled text.', 'When you pay in PONS, Orbit only approves the exact amount of that message, never an unlimited allowance.', 'Orbit keeps 5% of what the receiver keeps. Refunds and free messages have no fee.', 'Mail runs on the PaidInbox contract 0xdc6f8bdff78411323e85d8bfc581eafe6c875fb9 on Robinhood Chain. It passed its tests but has not had an external audit yet: start with small amounts.'] },
      { id: 'install', icon: 'new', title: 'Use it as an app or on your phone', intro: 'Orbit has its own phone version and can be installed like an app.', steps: ['On a phone, Orbit becomes an app with a bottom bar: Radar, Live buys, Mail (the center button), Ranks and Me.', 'To install it: open orbiteth.sbs in the browser, then “Share → Add to Home Screen” (iPhone) or “Install app” (Android).', 'On a computer: in Chrome or Edge, click the install icon in the address bar (or the menu → “Install Orbit”).', 'Orbit updates itself: when there is a new version it loads it the next time you open it.'] },
      { id: 'safety', icon: 'crown', title: 'Staying safe', intro: 'A few rules that protect your money on Orbit and anywhere in crypto.', steps: ['The only official site is orbiteth.sbs, and the only official account is @Orbitpons on X. Bookmark them and be careful with copies that use a similar name or link.', 'Orbit never asks for your secret phrase, private key or passwords, and never sends you direct messages asking for money.', 'Read what your wallet shows before you approve anything: the network should say Robinhood Chain and the amount should match what you expect.', 'Everything Orbit shows comes from public data. A label, a chart or a big buy is information, not advice.'] },
    ],
    glossaryTitle: 'Words you will see',
    glossary: [['Market cap', 'The price of one token multiplied by all the tokens that exist (1 billion on pons). It tells you how big a token is.'], ['Bonding curve', 'The automatic price machine every new token starts on. Buying pushes the price up, selling pulls it down.'], ['Graduation', 'When a curve reaches its goal, the token moves to a Uniswap trading pool.'], ['Pair', 'What the token is bought with: ETH, USDG (a dollar coin) or a stock token like NVDA.'], ['Creator tax', 'A small percent of every trade that goes to the token’s creator.'], ['Whale / Dolphin', 'A big buyer. Dolphin: $250 or more in one buy. Whale: $1,000 or more.'], ['Escrow', 'Money held by a contract until a condition is met, like a reply within 72 hours.'], ['Wallet', 'Your account on the blockchain. It holds your coins and signs your actions.']],
    faqTitle: 'Questions',
    faq: [['Is it safe?', 'Orbit only reads public blockchain data. It never asks for your secret phrase or private key, and every payment needs your approval in your own wallet.'], ['Where does the data come from?', 'From Robinhood Chain itself. Names and profile pictures come from pons. The ETH price comes from Coinbase.'], ['Why is a logo missing?', 'Some tokens have no logo, or the creator used an image link that no longer works. Orbit then shows the token’s initials.'], ['I can’t connect my wallet on my phone', 'Phone browsers and home-screen apps have no wallet inside. Press “Connect” and open Orbit in MetaMask, Trust Wallet or Coinbase Wallet.'], ['Does Orbit cost anything?', 'Looking is free. Only paid messages cost what the receiver asks, plus the network fee.']],
  },
  es: {
    title: 'Cómo funciona Orbit',
    sub: 'Una guía sencilla. No necesitas experiencia. Léela de arriba abajo o salta a lo que necesites.',
    contents: 'Contenido',
    sections: [
      { id: 'what', icon: 'radar', title: '¿Qué es Orbit?', intro: 'Orbit es una ventana en vivo a pons, la plataforma de lanzamiento de tokens en Robinhood Chain. Muestra cada token nuevo, cada compra y venta, y cada token que se «gradúa», segundos después de que pasa. Todo viene directo de la blockchain, así que nadie puede falsearlo.' },
      { id: 'wallet', icon: 'wallet', title: 'Conecta tu wallet', intro: 'Tu wallet es tu cuenta. No necesitas correo ni contraseña.', steps: ['En la computadora: instala MetaMask (u otra wallet de navegador), toca «Connect wallet» arriba a la derecha y aprueba en tu wallet. Si te pide agregar o cambiar a Robinhood Chain, apruébalo también.', 'En el celular: los navegadores del teléfono y las apps agregadas a la pantalla de inicio no tienen wallet adentro. Toca «Connect» y elige MetaMask, Trust Wallet o Coinbase Wallet: Orbit se abre dentro de esa app y conecta con un toque.', 'Para cambiar de cuenta, toca tu dirección arriba a la derecha, elige «Disconnect» y conecta de nuevo con la cuenta que quieras.'], tips: ['Orbit nunca te pide tu frase secreta ni tu llave privada. Si alguien te la pide, es una estafa.', 'Conectar es gratis. Solo las acciones que mueven dinero (como pagar un mensaje) cuestan una pequeña comisión de red, y tu wallet siempre te la muestra antes.', 'Si cerraste la ventana de tu wallet sin responder, Orbit deja de esperar a los pocos segundos para que puedas intentar de nuevo.'] },
      { id: 'radar', icon: 'radar', title: 'Radar (la página de inicio)', intro: 'El Radar es el pulso de pons en una sola pantalla.', steps: ['Círculos de arriba: los tokens más nuevos (con la etiqueta «NEW») y los más tradeados. Deslízalos o usa las flechas. Toca uno para abrirlo.', 'Biggest on pons: los tokens con mayor market cap.', 'Live curves: los tokens que se están tradeando ahora, con cuánto llevan de su curva, su market cap y una mini gráfica.', 'Latest buys: cada compra en el momento: qué moneda, cuánto y quién.', 'Big buys: compras de $250 o más. Un delfín 🐬 es $250 o más, una ballena 🐋 es $1,000 o más.'] },
      { id: 'token', icon: 'trades', title: 'La página de un token', intro: 'Abre cualquier token para ver todo sobre él.', steps: ['La gráfica muestra el market cap en dólares (o cambia a precio). Elige «Velas» o «Línea» y el rango de tiempo.', 'La barra de curva muestra qué tan cerca está de graduarse.', 'Ganancias del creador: cuánto ha ganado el creador con la pequeña comisión de cada trade.', 'Trades: cada compra y venta con el nombre del comprador y sus etiquetas (mira «Etiquetas de wallets»).', 'Historia (en el celular): los momentos clave del token, del lanzamiento a la graduación, con un botón para compartirla en X.', 'La campana 🔔 crea una alerta de precio. «Follow» lo agrega a tu lista. «Trade on pons» lo abre en ponsfamily.com para comprar o vender.'] },
      { id: 'launches', icon: 'launch', title: 'Curvas y graduación', intro: 'Todo token empieza en una «curva»: mientras más gente compra, más sube el precio. Cuando junta suficiente dinero se gradúa y pasa a un pool normal.', steps: ['La barra bajo cada token muestra qué tan llena está su curva.', 'En el Radar puedes filtrar por «On curve», «New» o «Graduated».', 'Un token se gradúa cuando su curva junta su meta.', 'Los tokens graduados siguen tradeándose en un pool de Uniswap.'] },
      { id: 'labels', icon: 'bot', title: 'Etiquetas de wallets', intro: 'Junto al nombre de quien compra, Orbit puede mostrar qué hace esa wallet en pons. Las etiquetas salen de trades reales en la cadena.', steps: ['🎯 Sniper: compró en el primer minuto después del lanzamiento.', '🤖 Bot: tradeó 12 o más tokens distintos (o más de 60 veces) en la última hora. En el celular puedes ocultar los bots del feed en vivo.', '🛠 Creator: lanzó este token, o dos o más tokens.', '🐋 Whale: compró $1,000 o más en la última hora.', '💎 Diamond hands: compró este token hace más de 6 horas y nunca vendió.'], tips: ['Las etiquetas describen comportamiento, no intenciones. Investiga siempre por tu cuenta.'] },
      { id: 'leaderboard', icon: 'trophy', title: 'Leaderboard', intro: 'Quién está ganando en pons.', steps: ['Creator rewards: los creadores que más ganaron con sus tokens, con su moneda principal.', 'Traders: las wallets con más volumen en las últimas 24 horas.', 'Más graduaciones: los creadores cuyos tokens más se graduaron.', 'Cazadores tempranos: wallets que compraron primero en tokens que luego se graduaron.'] },
      { id: 'portfolio', icon: 'wallet', title: 'Portafolio', intro: 'Mira qué tiene cualquier wallet en pons: sus tokens, cuánto valen hoy y su ganancia o pérdida.', steps: ['Conecta tu wallet para ver la tuya, o pega cualquier dirección para ver la de otra persona. Toda wallet es pública en una blockchain.'] },
      { id: 'alerts', icon: 'alerts', title: 'Alertas', intro: 'Orbit puede avisarte cuando pasa algo.', steps: ['Sigue tokens (desde su página) y creadores (desde su perfil).', 'Elige de qué quieres enterarte: un token cerca de graduarse, una graduación, que el creador venda, un lanzamiento nuevo de un creador que sigues o cualquier compra grande.', 'Alertas de precio: en la página de un token toca la campana 🔔 y elige un market cap. Orbit te avisa una vez cuando el token lo supera o baja de él. Las ves y las borras en Alertas → Mis reglas.', 'Toca «Permitir notificaciones» para que tu computadora o celular las muestre.'], tips: ['Por ahora las alertas funcionan mientras Orbit esté abierto en ese dispositivo, aunque sea en segundo plano.'] },
      { id: 'mail', icon: 'mail', title: 'Correo: mensajes pagados entre wallets', intro: 'Manda un mensaje privado a cualquier wallet, por ejemplo al creador de un token. Para frenar el spam, pagas un monto pequeño en PONS o ETH para llegar a quien pone un precio.', steps: ['La primera vez, «Desbloquea tu correo» le pide a tu wallet una firma gratis (no es una transacción, sin gas). Eso crea tu llave de cifrado, y la misma wallet abre el mismo buzón en cualquier dispositivo.', 'Activa tu buzón para recibir mensajes: elige tu precio en PONS y/o ETH y qué pasa con el pago cuando respondes (devolverlo, quedártelo o mitad y mitad).', 'Cuando le escribes a alguien que cobra, tu pago espera en una caja segura (escrow) dentro del contrato.', 'Si responde dentro de 72 horas, el pago se reparte según su regla. Si no, cualquiera puede tocar «Reembolsar» y recuperas el 100%.', 'Después de la primera respuesta quedan como contactos: desde ahí escribir es gratis.'], tips: ['Los mensajes se cifran en tu navegador. La blockchain solo guarda texto revuelto.', 'Cuando pagas con PONS, Orbit solo aprueba el monto exacto de ese mensaje, nunca un permiso ilimitado.', 'Orbit se queda con el 5% de lo que se queda quien recibe. Los reembolsos y los mensajes gratis no pagan comisión.', 'El correo funciona con el contrato PaidInbox 0xdc6f8bdff78411323e85d8bfc581eafe6c875fb9 en Robinhood Chain. Pasó sus pruebas pero todavía no tiene auditoría externa: empieza con montos chicos.'] },
      { id: 'install', icon: 'new', title: 'Úsalo como app o en tu celular', intro: 'Orbit tiene su propia versión para celular y se puede instalar como app.', steps: ['En el celular, Orbit se vuelve una app con barra abajo: Radar, Live buys, Correo (el botón del centro), Ranks y Yo.', 'Para instalarla: abre orbiteth.sbs en el navegador y luego «Compartir → Agregar a inicio» (iPhone) o «Instalar app» (Android).', 'En la computadora: en Chrome o Edge, haz clic en el ícono de instalar en la barra de direcciones (o menú → «Instalar Orbit»).', 'Orbit se actualiza solo: cuando hay una versión nueva, la carga la próxima vez que lo abras.'] },
      { id: 'safety', icon: 'crown', title: 'Cómo cuidarte', intro: 'Algunas reglas que protegen tu dinero en Orbit y en cualquier lugar de crypto.', steps: ['El único sitio oficial es orbiteth.sbs y la única cuenta oficial es @Orbitpons en X. Guárdalos en favoritos y cuidado con copias que usan un nombre o enlace parecido.', 'Orbit nunca te pide tu frase secreta, tu llave privada ni contraseñas, y nunca te escribe por privado pidiendo dinero.', 'Lee lo que muestra tu wallet antes de aprobar: la red debe decir Robinhood Chain y el monto debe ser el que esperas.', 'Todo lo que muestra Orbit viene de datos públicos. Una etiqueta, una gráfica o una compra grande es información, no un consejo.'] },
    ],
    glossaryTitle: 'Palabras que vas a ver',
    glossary: [['Market cap', 'El precio de un token multiplicado por todos los tokens que existen (mil millones en pons). Te dice qué tan grande es un token.'], ['Curva (bonding curve)', 'La máquina de precio automática donde empieza todo token nuevo. Comprar sube el precio, vender lo baja.'], ['Graduación', 'Cuando una curva llega a su meta, el token pasa a un pool de Uniswap.'], ['Par', 'Con qué se compra el token: ETH, USDG (una moneda dólar) o un token de acción como NVDA.'], ['Impuesto del creador', 'Un pequeño porcentaje de cada trade que va al creador del token.'], ['Ballena / Delfín', 'Un comprador grande. Delfín: $250 o más en una compra. Ballena: $1,000 o más.'], ['Escrow', 'Dinero guardado por un contrato hasta que se cumple una condición, como una respuesta dentro de 72 horas.'], ['Wallet', 'Tu cuenta en la blockchain. Guarda tus monedas y firma tus acciones.']],
    faqTitle: 'Preguntas',
    faq: [['¿Es seguro?', 'Orbit solo lee datos públicos de la blockchain. Nunca te pide tu frase secreta ni tu llave privada, y cada pago necesita tu aprobación en tu propia wallet.'], ['¿De dónde salen los datos?', 'De Robinhood Chain directamente. Los nombres y fotos de perfil vienen de pons. El precio de ETH viene de Coinbase.'], ['¿Por qué falta un logo?', 'Algunos tokens no tienen logo, o el creador usó un link de imagen que ya no funciona. Entonces Orbit muestra las iniciales del token.'], ['No puedo conectar mi wallet en el celular', 'Los navegadores del teléfono y las apps de la pantalla de inicio no tienen wallet adentro. Toca «Connect» y abre Orbit en MetaMask, Trust Wallet o Coinbase Wallet.'], ['¿Orbit cuesta algo?', 'Mirar es gratis. Solo los mensajes pagados cuestan lo que pide quien recibe, más la comisión de red.']],
  },
  zh: {
    title: 'Orbit 使用指南',
    sub: '一份简单的指南，无需任何经验。可以从头读到尾，也可以直接跳到你需要的部分。',
    contents: '目录',
    sections: [
      { id: 'what', icon: 'radar', title: 'Orbit 是什么？', intro: 'Orbit 是 pons（Robinhood Chain 上的代币发射平台）的实时窗口。它会在几秒内显示每个新代币、每笔买卖以及每个“毕业”的代币。所有数据都直接来自区块链，无法造假。' },
      { id: 'wallet', icon: 'wallet', title: '连接钱包', intro: '钱包就是你的账户，不需要邮箱或密码。', steps: ['电脑上：安装 MetaMask（或其他浏览器钱包），点击右上角的“Connect wallet”并在钱包中批准。如果提示添加或切换到 Robinhood Chain，也请批准。', '手机上：手机浏览器和添加到主屏幕的应用里没有钱包。点击“Connect”并选择 MetaMask、Trust Wallet 或 Coinbase Wallet：Orbit 会在该应用中打开，一键即可连接。', '要切换账户，点击右上角的地址，选择“Disconnect”，然后用你想要的账户重新连接。'], tips: ['Orbit 永远不会索要你的助记词或私钥。任何索要的人都是骗子。', '连接是免费的。只有转移资金的操作（例如付费消息）才需要少量网络费用，钱包总会先显示给你。', '如果你没有回应就关闭了钱包弹窗，Orbit 会在几秒后停止等待，你可以重试。'] },
      { id: 'radar', icon: 'radar', title: '雷达（首页）', intro: '雷达在一个屏幕里展示 pons 的脉搏。', steps: ['顶部圆圈：最新的代币（带“NEW”标签）和交易最多的代币。滑动或使用箭头查看更多，点击即可打开。', 'Biggest on pons：市值最大的代币。', 'Live curves：正在交易的代币，显示曲线进度、市值和迷你价格图。', 'Latest buys：每一笔实时买入：哪个币、多少钱、谁买的。', 'Big buys：$250 或以上的买入。海豚 🐬 为 $250 或以上，巨鲸 🐋 为 $1,000 或以上。'] },
      { id: 'token', icon: 'trades', title: '代币页面', intro: '打开任意代币即可查看它的全部信息。', steps: ['图表以美元显示市值（也可切换为价格）。选择“K线”或“折线”以及时间范围。', '曲线进度条显示代币离毕业还有多远。', '创作者收益：创作者从每笔交易的小额费用中赚了多少。', '交易：每笔买卖，带买家名字和标签（见“钱包标签”）。', '历程（手机上）：代币从发射到毕业的关键时刻，可一键分享到 X。', '铃铛 🔔 设置价格提醒。“Follow”加入关注列表。“Trade on pons”在 ponsfamily.com 打开以买卖。'] },
      { id: 'launches', icon: 'launch', title: '曲线与毕业', intro: '每个代币都从“联合曲线”开始：买的人越多，价格越高。募集到足够资金后就会毕业，进入普通交易池。', steps: ['每个代币下方的进度条显示它的曲线完成了多少。', '在雷达上可以按“On curve”、“New”或“Graduated”筛选。', '曲线募集到目标金额时，代币就会毕业。', '毕业后的代币继续在 Uniswap 池中交易。'] },
      { id: 'labels', icon: 'bot', title: '钱包标签', intro: 'Orbit 会在买家名字旁显示这个钱包在 pons 上的行为。标签来自链上的真实交易。', steps: ['🎯 狙击手：在代币发射后第一分钟内买入。', '🤖 机器人：过去一小时内交易了 12 个以上不同代币（或超过 60 次）。手机上可以在实时动态中隐藏机器人。', '🛠 创作者：发射了这个代币，或发射过两个以上代币。', '🐋 巨鲸：过去一小时内买入 $1,000 或以上。', '💎 钻石手：超过 6 小时前买入该代币且从未卖出。'], tips: ['标签描述的是行为，而不是意图。请务必自行研究。'] },
      { id: 'leaderboard', icon: 'trophy', title: '排行榜', intro: '谁在 pons 上领先。', steps: ['创作者奖励：从代币中赚得最多的创作者及其主要代币。', '交易者：过去 24 小时交易量最大的钱包。', '毕业最多：代币毕业次数最多的创作者。', '早期猎手：最早买入后来毕业的代币的钱包。'] },
      { id: 'portfolio', icon: 'wallet', title: '资产', intro: '查看任意钱包在 pons 上持有什么：它的代币、当前价值以及盈亏。', steps: ['连接你的钱包查看自己的资产，或粘贴任意地址查看他人的。区块链上的每个钱包都是公开的。'] },
      { id: 'alerts', icon: 'alerts', title: '提醒', intro: '有事发生时，Orbit 可以提醒你。', steps: ['关注代币（在代币页面）和创作者（在其主页）。', '选择想收到的提醒：代币接近毕业、毕业、创作者卖出、你关注的创作者发射新币，或任意大额买入。', '价格提醒：在代币页面点击铃铛 🔔 并选择一个市值。当代币突破或跌破该值时，Orbit 会提醒你一次。可在 提醒 → 我的规则 中查看和删除。', '点击“允许通知”，让电脑或手机显示提醒。'], tips: ['目前提醒只在该设备上打开 Orbit 时有效（后台也可以）。'] },
      { id: 'mail', icon: 'mail', title: '邮件：钱包之间的付费消息', intro: '给任意钱包发送私信，例如代币的创作者。为防止垃圾信息，联系设置了价格的人需要支付少量 PONS 或 ETH。', steps: ['第一次使用时，“解锁你的邮件”会请求钱包进行一次免费签名（不是交易，无 gas）。这会生成你的加密密钥，同一个钱包在任何设备上都能打开同一个收件箱。', '激活你的收件箱以接收消息：设置 PONS 和/或 ETH 价格，以及回复时如何处理付款（退还、保留或五五分）。', '给收费的人写信时，你的付款会存放在合约内的托管中。', '如果对方在 72 小时内回复，付款按其规则结算。如果没有，任何人都可以点击“退款”，你会拿回 100%。', '第一次回复后你们就成为联系人：之后发消息免费。'], tips: ['消息在你的浏览器中加密，区块链上只保存乱码。', '用 PONS 支付时，Orbit 只批准这条消息的确切金额，绝不批准无限额度。', 'Orbit 收取接收方所得部分的 5%。退款和免费消息不收费。', '邮件运行在 Robinhood Chain 上的 PaidInbox 合约 0xdc6f8bdff78411323e85d8bfc581eafe6c875fb9。它已通过测试，但尚未经过外部审计：请从小额开始。'] },
      { id: 'install', icon: 'new', title: '作为应用或在手机上使用', intro: 'Orbit 有专门的手机版，并且可以像应用一样安装。', steps: ['在手机上，Orbit 是一个带底部导航栏的应用：雷达、实时买入、邮件（中间按钮）、排行和我的。', '安装方法：在浏览器中打开 orbiteth.sbs，然后选择“分享 → 添加到主屏幕”（iPhone）或“安装应用”（Android）。', '电脑上：在 Chrome 或 Edge 中，点击地址栏中的安装图标（或菜单 → “安装 Orbit”）。', 'Orbit 会自动更新：有新版本时，下次打开就会加载。'] },
      { id: 'safety', icon: 'crown', title: '保护自己', intro: '几条在 Orbit 以及整个加密世界中保护资金的规则。', steps: ['唯一的官方网站是 orbiteth.sbs，唯一的官方账号是 X 上的 @Orbitpons。请收藏它们，并小心名称或链接相似的仿冒网站。', 'Orbit 绝不会索要你的助记词、私钥或密码，也绝不会私信向你要钱。', '批准任何操作前先看清钱包显示的内容：网络应为 Robinhood Chain，金额应与你预期一致。', 'Orbit 显示的一切都来自公开数据。标签、图表或大额买入只是信息，不是建议。'] },
    ],
    glossaryTitle: '常见词汇',
    glossary: [['市值', '一个代币的价格乘以所有代币的数量（pons 上为 10 亿）。它说明一个代币有多大。'], ['联合曲线', '每个新代币开始时的自动定价机制。买入推高价格，卖出拉低价格。'], ['毕业', '曲线达到目标后，代币进入 Uniswap 交易池。'], ['交易对', '用什么买这个代币：ETH、USDG（美元币）或 NVDA 这样的股票代币。'], ['创作者税', '每笔交易中归代币创作者的一小部分。'], ['巨鲸 / 海豚', '大额买家。海豚：单笔 $250 或以上。巨鲸：$1,000 或以上。'], ['托管', '由合约保管的资金，直到满足条件，例如 72 小时内回复。'], ['钱包', '你在区块链上的账户。它保管你的代币并签署你的操作。']],
    faqTitle: '常见问题',
    faq: [['安全吗？', 'Orbit 只读取公开的区块链数据。它从不索要你的助记词或私钥，每笔付款都需要你在自己的钱包中批准。'], ['数据从哪里来？', '直接来自 Robinhood Chain。名字和头像来自 pons，ETH 价格来自 Coinbase。'], ['为什么缺少某个 logo？', '有些代币没有 logo，或者创作者使用的图片链接已失效。这时 Orbit 会显示代币的首字母。'], ['我在手机上无法连接钱包', '手机浏览器和主屏幕应用里没有钱包。点击“Connect”，在 MetaMask、Trust Wallet 或 Coinbase Wallet 中打开 Orbit。'], ['使用 Orbit 要花钱吗？', '浏览是免费的。只有付费消息需要支付接收方设定的价格以及网络费用。']],
  },
}

/* What changed lately, added to the matching sections in each language */
const EXTRA: Record<Lang, Record<string, string[]>> = {
  en: {
    token: ['Zoom the chart with the mouse wheel or by pinching, drag it to go back in time, and double-click to reset.', 'A green “Claimed” check next to creator earnings means the creator already collected them on pons. The amount is the same pons shows.'],
    launches: ['After graduation the price and the chart keep going with the pool’s trades, the same numbers pons shows.'],
    alerts: ['Price alerts: press the bell on a token (computer or phone) and pick a market cap.', 'Turn on “With Orbit closed” in Alerts to get Mail pings even when Orbit is not open. On iPhone, add Orbit to the Home Screen first.'],
  },
  es: {
    token: ['Haz zoom en la gráfica con la rueda del mouse o pellizcando, arrástrala para ver el pasado y haz doble clic para volver.', 'Un check verde «Cobrado» junto a las ganancias del creador significa que ya las cobró en pons. El monto es el mismo que muestra pons.'],
    launches: ['Después de graduarse, el precio y la gráfica siguen con los trades del pool, con los mismos números que pons.'],
    alerts: ['Alertas de precio: toca la campana en un token (computadora o celular) y elige un market cap.', 'Activa «Con Orbit cerrado» en Alertas para recibir avisos del Correo aunque Orbit no esté abierto. En iPhone, primero agrega Orbit a la pantalla de inicio.'],
  },
  zh: {
    token: ['用鼠标滚轮或双指缩放图表，拖动查看过去，双击恢复。', '创作者收益旁的绿色“已领取”表示创作者已在 pons 上领取。金额与 pons 显示的一致。'],
    launches: ['毕业后，价格和图表继续显示池中的交易，与 pons 的数字一致。'],
    alerts: ['价格提醒：在代币页面（电脑或手机）点击铃铛并选择市值。', '在提醒中开启“Orbit 关闭时也通知”，即使没打开 Orbit 也能收到邮件提醒。iPhone 需先把 Orbit 添加到主屏幕。'],
  },
}

const GROUPS: { id: 'start' | 'market' | 'act'; ids: string[] }[] = [
  { id: 'start', ids: ['what', 'wallet', 'install'] },
  { id: 'market', ids: ['radar', 'token', 'launches', 'labels', 'leaderboard', 'portfolio'] },
  { id: 'act', ids: ['alerts', 'mail', 'safety'] },
]
const groupOf = (id: string) => GROUPS.find((g) => g.ids.includes(id))

const loadSet = (k: string) => { try { return new Set<string>(JSON.parse(localStorage.getItem(k) || '[]')) } catch { return new Set<string>() } }
const saveSet = (k: string, s: Set<string>) => { try { localStorage.setItem(k, JSON.stringify([...s])) } catch { /* private mode */ } }

function usePhoneLayout() {
  const q = '(max-width: 760px)'
  const [m, setM] = useState(() => typeof window !== 'undefined' && matchMedia(q).matches)
  useEffect(() => { const mq = matchMedia(q), on = () => setM(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on) }, [])
  return m
}

export function DocsPage() {
  const { lang, t } = useT()
  const d = DOCS[lang]
  const phone = usePhoneLayout()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [read, setRead] = useState(() => loadSet('orbit:docs-read'))
  const [done, setDone] = useState(() => loadSet('orbit:docs-done'))
  const [chip, setChip] = useState<'all' | 'start' | 'market' | 'act'>('all')
  const [view, setView] = useState<string | null>(null) // phone: the open topic
  const [active, setActive] = useState<string>(d.sections[0]?.id ?? '')
  const search = useRef<HTMLInputElement>(null)
  const GL: Record<string, string> = { start: t('Start'), market: t('Read the market'), act: t('Act') }
  const glabel = (id: string) => GL[groupOf(id)?.id ?? ''] ?? ''

  const sections = useMemo(() => d.sections.map((s) => ({ ...s, tips: [...(s.tips ?? []), ...(EXTRA[lang][s.id] ?? [])] })), [d, lang])
  const needle = q.trim().toLowerCase()
  const match = (s: Sec) => !needle || [s.title, s.intro, ...(s.steps ?? []), ...(s.tips ?? [])].join(' ').toLowerCase().includes(needle)
  const shown = sections.filter(match)

  const markRead = (id: string) => setRead((r) => { if (r.has(id)) return r; const n = new Set(r); n.add(id); saveSet('orbit:docs-read', n); return n })
  const toggleStep = (key: string) => setDone((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); saveSet('orbit:docs-done', n); return n })

  // "/" jumps to the search box
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); search.current?.focus() } }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [])
  // desktop: a topic counts as read once it has been on screen; the index follows the one in view
  useEffect(() => {
    if (phone) return
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { const id = e.target.id.slice(3); markRead(id); setActive(id) }
    }, { rootMargin: '-20% 0px -55% 0px' })
    document.querySelectorAll('.dc-sec[id^="dc-"]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [phone, needle, lang])
  useEffect(() => { if (phone && view) markRead(view) }, [phone, view])

  const readCount = sections.filter((s) => read.has(s.id)).length
  const progress = (
    <div className="dc-progress"><span>{t('{n} of {m} read', { n: readCount, m: sections.length })}</span><span className="dc-bar"><i style={{ width: `${(readCount / Math.max(1, sections.length)) * 100}%` }} /></span></div>
  )

  const body = (s: Sec & { tips: string[] }) => {
    const W = WIDGETS[s.id]
    return (
      <>
        <p className="dc-intro">{s.intro}</p>
        {W && <div className="dc-try"><span className="dc-eyebrow">{t('Try it')}</span><W /></div>}
        {s.steps && <ol className="dc-steps">{s.steps.map((x, k) => { const key = `${s.id}:${k}`, ok = done.has(key); return (
          <li key={k} className={ok ? 'ok' : ''}><button type="button" className="mono" onClick={() => toggleStep(key)} aria-pressed={ok} aria-label={ok ? t('Mark as not done') : t('Mark as done')} title={ok ? t('Done') : t('Mark as done')}>{ok ? '✓' : k + 1}</button><p>{x}</p></li>) })}</ol>}
        {s.tips.length > 0 && <div className="dc-tips">{s.tips.map((x, k) => <p key={k}>💡 {x}</p>)}</div>}
      </>
    )
  }
  const glossary = <dl className="dc-gloss">{d.glossary.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  const faq = d.faq.map(([qq, a]) => (
    <div key={qq} className="dc-faq">
      <button aria-expanded={open === qq} onClick={() => setOpen(open === qq ? null : qq)}>{qq}<span>{open === qq ? '−' : '+'}</span></button>
      {open === qq && <p>{a}</p>}
    </div>
  ))

  /* ---------------- phone: topic cards, one topic at a time ---------------- */
  if (phone) {
    if (view) {
      const s = sections.find((x) => x.id === view)
      return (
        <div className="dcm">
          <div className="dcm-top"><button className="dcm-back" onClick={() => setView(null)} aria-label={t('Back')}>‹</button><span>{glabel(view) || 'Docs'}</span></div>
          {view === 'glossary' ? <><h1>{d.glossaryTitle}</h1>{glossary}</>
            : view === 'faq' ? <><h1>{d.faqTitle}</h1>{faq}</>
            : s && <><h1>{s.title}</h1>{body(s)}</>}
          <div style={{ height: 110 }} />
        </div>
      )
    }
    const list = shown.filter((s) => chip === 'all' || groupOf(s.id)?.id === chip)
    return (
      <div className="dcm">
        <h1 className="dcm-h">Docs</h1>
        <input ref={search} className="dcm-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search: fee, refund, sniper…')} aria-label={t('Search docs')} />
        <div className="dcm-chips" role="group">{([['all', t('All')], ...GROUPS.map((g) => [g.id, GL[g.id]])] as [typeof chip, string][]).map(([k, l]) => <button key={k} aria-pressed={chip === k} onClick={() => setChip(k)}>{l}</button>)}</div>
        <div className="dcm-hero"><b>{t('Your progress')}</b>{progress}</div>
        {list.map((s) => (
          <button key={s.id} className="dcm-tile" onClick={() => setView(s.id)}>
            <span className={'dcm-ic' + (read.has(s.id) ? ' read' : '')}><GIcon name={s.icon} size={22} /></span>
            <span className="tx"><b>{s.title}</b><small>{s.intro}</small></span>
            {WIDGETS[s.id] && <span className="dcm-try">{t('Try it')}</span>}
            <span className="go" aria-hidden="true">›</span>
          </button>
        ))}
        {!list.length && <p className="dcm-none">{t('No topic matches “{q}”.', { q })}</p>}
        {!needle && <>
          <button className="dcm-tile" onClick={() => setView('glossary')}><span className="dcm-ic"><GIcon name="new" size={22} /></span><span className="tx"><b>{d.glossaryTitle}</b><small>{d.glossary.map(([k]) => k).slice(0, 4).join(' · ')}</small></span><span className="go">›</span></button>
          <button className="dcm-tile" onClick={() => setView('faq')}><span className="dcm-ic"><GIcon name="alerts" size={22} /></span><span className="tx"><b>{d.faqTitle}</b><small>{d.faq[0]?.[0]}</small></span><span className="go">›</span></button>
        </>}
        <div style={{ height: 110 }} />
      </div>
    )
  }

  /* ---------------- desktop: index with search and progress, every topic on one page ---------------- */
  const go = (id: string) => document.getElementById('dc-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="page docs">
      <header className="dc-head"><h1>{d.title}</h1><p>{d.sub}</p></header>
      <div className="dc-grid">
        <nav className="dc-toc" aria-label={d.contents}>
          <label className="dc-q"><input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search docs')} aria-label={t('Search docs')} /><kbd>/</kbd></label>
          {GROUPS.map((g) => {
            const items = shown.filter((s) => g.ids.includes(s.id))
            if (!items.length) return null
            return (
              <div key={g.id} className="dc-grp">
                <b>{GL[g.id]}</b>
                {items.map((s) => <a key={s.id} href="/docs" className={(active === s.id ? 'on ' : '') + (read.has(s.id) ? 'read' : '')} onClick={(e) => { e.preventDefault(); go(s.id) }}><span className="dc-dot" aria-hidden="true" />{s.title}</a>)}
              </div>
            )
          })}
          {!needle && <div className="dc-grp"><b>{t('More')}</b><a href="/docs" onClick={(e) => { e.preventDefault(); go('glossary') }}><span className="dc-dot" aria-hidden="true" />{d.glossaryTitle}</a><a href="/docs" onClick={(e) => { e.preventDefault(); go('faq') }}><span className="dc-dot" aria-hidden="true" />{d.faqTitle}</a></div>}
          {progress}
        </nav>
        <div className="dc-body">
          {!shown.length && <p className="dc-none">{t('No topic matches “{q}”.', { q })}</p>}
          {shown.map((s) => (
            <section key={s.id} id={'dc-' + s.id} className="dc-sec">
              <span className="dc-eyebrow">{glabel(s.id)}</span>
              <div className="dc-sec-h"><GIcon name={s.icon} size={26} /><h2>{s.title}</h2>{read.has(s.id) && <span className="dc-read" title={t('Read')}>✓</span>}</div>
              {body(s)}
            </section>
          ))}
          {!needle && <>
            <section id="dc-glossary" className="dc-sec"><div className="dc-sec-h"><h2>{d.glossaryTitle}</h2></div>{glossary}</section>
            <section id="dc-faq" className="dc-sec"><div className="dc-sec-h"><h2>{d.faqTitle}</h2></div>{faq}</section>
          </>}
        </div>
      </div>
    </div>
  )
}
