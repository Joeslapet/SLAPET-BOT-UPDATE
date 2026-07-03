/**
 * Knight Bot - A WhatsApp Bot
 * Copyright (c) 2024 Professor
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const express = require('express')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Web server for pairing code UI
const app = express()
const sitePort = process.env.PORT || 3000
let pairingSocket = null

app.use(express.json())

const renderHomePage = () => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SLAPET BOT Pairing</title>
  <style>
    * { box-sizing: border-box; }
    :root { color-scheme: dark; --bg: #090b12; --panel: rgba(20, 27, 44, 0.95); --surface: rgba(255, 255, 255, 0.04); --border: rgba(255, 255, 255, 0.08); --text: #e6edf7; --muted: #9fb3cc; --primary: #7b9eff; --accent: #66d9ef; --success: #5fdcd8; --danger: #f46c75; --shadow: 0 28px 80px rgba(0, 0, 0, 0.35); }
    html, body { margin: 0; min-height: 100%; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: radial-gradient(circle at top, rgba(112, 125, 255, 0.12), transparent 25%), radial-gradient(circle at 20% 10%, rgba(102, 217, 239, 0.08), transparent 20%), var(--bg); color: var(--text); }
    body { display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .container { width: min(100%, 900px); padding: 2rem; border-radius: 32px; background: linear-gradient(180deg, rgba(18, 26, 49, 0.98), rgba(14, 20, 38, 0.98)); border: 1px solid var(--border); box-shadow: var(--shadow); backdrop-filter: blur(20px); }
    .topbar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem; align-items: center; }
    .brand { display: grid; gap: 0.4rem; }
    .brand h1 { margin: 0; font-size: clamp(2rem, 2.5vw, 2.8rem); letter-spacing: -0.04em; }
    .brand p { margin: 0; color: var(--muted); max-width: 520px; }
    .status-pill { padding: 0.85rem 1.4rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.035); color: var(--success); font-weight: 700; }
    .grid { display: grid; gap: 1.5rem; margin-top: 2rem; }
    .card { padding: 1.6rem; border-radius: 24px; background: var(--surface); border: 1px solid var(--border); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02); }
    .card h2 { margin: 0 0 1rem; font-size: 1.05rem; letter-spacing: -0.02em; }
    .card p { margin: 0; color: var(--muted); line-height: 1.7; }
    .input-group { display: grid; gap: 1rem; }
    input[type='text'] { width: 100%; border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 1rem 1.1rem; background: rgba(255,255,255,0.03); color: var(--text); font-size: 1rem; }
    input[type='text']::placeholder { color: rgba(255,255,255,0.45); }
    button { display: inline-flex; align-items: center; justify-content: center; padding: 1rem 1.4rem; border: none; border-radius: 18px; background: linear-gradient(135deg, rgba(123, 158, 255, 0.95), rgba(102, 217, 239, 0.95)); color: #071a35; font-weight: 700; cursor: pointer; transition: transform 0.25s ease, box-shadow 0.25s ease; }
    button:hover { transform: translateY(-1px); box-shadow: 0 18px 40px rgba(102, 217, 239, 0.2); }
    .output { min-height: 4.5rem; display: flex; align-items: center; padding: 1rem 1.2rem; border-radius: 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--text); font-size: 1rem; gap: 0.5rem; }
    .badge { display: inline-flex; align-items: center; justify-content: center; padding: 0.4rem 0.75rem; border-radius: 999px; background: rgba(102, 217, 239, 0.12); color: var(--accent); font-size: 0.95rem; font-weight: 700; }
    .footer { margin-top: 2rem; display: grid; gap: 0.75rem; color: var(--muted); font-size: 0.95rem; }
    .footer a { color: var(--text); text-decoration: none; border-bottom: 1px dashed rgba(255,255,255,0.25); }
    @media (max-width: 640px) { .container { padding: 1.5rem; } .topbar { gap: 1rem; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="topbar">
      <div class="brand">
        <h1>SLAPET BOT Pairing</h1>
        <p>Connecte ton compte WhatsApp avec le bot via un code sécurisé. Interface moderne et épurée, servie depuis Node.</p>
      </div>
      <div class="status-pill" id="connectionStatus">Chargement...</div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>✓ Vérifier le statut</h2>
        <p>Le bot doit être démarré pour pouvoir générer un code. Si le bot est déjà enregistré, il faudra réinitialiser la session.</p>
      </div>

      <div class="card">
        <h2>✓ Générer le code</h2>
        <div class="input-group">
          <label for="number">Numéro WhatsApp international</label>
          <input id="number" type="text" placeholder="22892864375" />
          <button id="requestButton">Obtenir le code</button>
        </div>
      </div>

      <div class="card">
        <h2>✓ Résultat</h2>
        <div class="output" id="status">Chargement du statut du bot...</div>
      </div>
    </div>

    <div class="footer">
      <p>Cette interface est servie entièrement par Node via Express. Aucune ressource HTML/CSS externe n’est requise.</p>
      <p>Dans WhatsApp : Appareils liés → Lier un appareil → entrer le code.</p>
    </div>
  </div>

  <script>
    const statusBox = document.getElementById('status');
    const connectionPill = document.getElementById('connectionStatus');
    const requestButton = document.getElementById('requestButton');
    const numberInput = document.getElementById('number');

    async function refreshStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        connectionPill.textContent = data.connected ? 'Bot prêt' : 'Bot indisponible';
        connectionPill.style.color = data.connected ? '#0d1829' : '#f46c75';
        connectionPill.style.background = data.connected ? 'rgba(97, 227, 221, 0.16)' : 'rgba(244, 108, 117, 0.16)';
        statusBox.innerHTML = `<span class="badge">Connexion</span> ${data.connected ? 'en ligne' : 'hors ligne'}<br><span class="badge">Enregistré</span> ${data.registered ? 'oui' : 'non'}<br><span class="badge">Utilisateur</span> ${data.user || 'aucun'}`;
      } catch (err) {
        connectionPill.textContent = 'Erreur réseau';
        connectionPill.style.color = '#f46c75';
        connectionPill.style.background = 'rgba(244, 108, 117, 0.16)';
        statusBox.innerText = 'Impossible de joindre le bot. Vérifie que le service est démarré.';
      }
    }

    requestButton.addEventListener('click', async () => {
      const number = numberInput.value.trim();
      if (!number) return alert('Merci de saisir un numéro');
      statusBox.textContent = 'Demande en cours...';
      try {
        const res = await fetch(`/code?number=${encodeURIComponent(number)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur serveur');
        statusBox.innerHTML = `<span class="badge">Code</span> ${data.code}`;
      } catch (err) {
        statusBox.innerHTML = `<span class="badge">Erreur</span> ${err.message}`;
      }
    });

    refreshStatus();
    setInterval(refreshStatus, 10000);
  </script>
</body>
</html>`

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html;charset=UTF-8')
    res.send(renderHomePage())
})

app.get('/status', (req, res) => {
    const registered = pairingSocket?.authState?.creds?.registered || false
    const user = pairingSocket?.user?.id || null
    res.json({ connected: !!pairingSocket, registered, user })
})

app.get('/code', async (req, res) => {
    try {
        const number = (req.query.number || '').replace(/[^0-9]/g, '')
        if (!number) return res.status(400).json({ error: 'Missing or invalid number' })
        if (!pairingSocket) return res.status(503).json({ error: 'Bot is not ready yet' })
        if (pairingSocket.authState?.creds?.registered) return res.status(400).json({ error: 'Bot is already registered' })

        const pn = new PhoneNumber('+' + number)
        if (!pn.isValid()) {
            return res.status(400).json({ error: 'Invalid phone number' })
        }

        const code = await pairingSocket.requestPairingCode(number)
        return res.json({ code })
    } catch (error) {
        console.error('Pairing code API error:', error)
        return res.status(500).json({ error: 'Failed to generate pairing code' })
    }
})

app.listen(sitePort, () => {
    console.log(`🌐 Pairing site running on port ${sitePort}`)
})

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000) // every 1 minute

// Memory monitoring - Restart if RAM gets too high
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log('⚠️ RAM too high (>400MB), restarting bot...')
        process.exit(1) // Panel will auto-restart
    }
}, 30_000) // check every 30 seconds

let phoneNumber = process.env.PAIRING_NUMBER || ''
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "KNIGHT BOT"
global.themeemoji = "•"
const pairingCode = process.argv.includes("--pairing-code") || process.env.PAIRING_CODE === 'true'
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In non-interactive environment, use ownerNumber from settings
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}


async function startXeonBotInc() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Save credentials when they update
        XeonBotInc.ev.on('creds.update', saveCreds)

    store.bind(XeonBotInc.ev)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            // In private mode, only block non-group messages (allow groups for moderation)
            // Note: XeonBotInc.public is not synced, so we check mode in main.js instead
            // This check is kept for backward compatibility but mainly blocks DMs
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return // Block DMs in private mode, but allow group messages
            }
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            // Clear message retry cache to prevent memory bloat
            if (XeonBotInc?.msgRetryCounterCache) {
                XeonBotInc.msgRetryCounterCache.clear()
            }

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                // Only try to send error message if we have a valid chatId
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: '❌ An error occurred while processing your message.',
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363161513685998@newsletter',
                                newsletterName: 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // Add these event handlers for better functionality
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Handle pairing code
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 6281376552730 (without + or spaces) : `)))
        }

        // Clean the phone number - remove any non-digit characters
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        // Validate the phone number using awesome-phonenumber
        const pn = require('awesome-phonenumber');
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, etc.) without + or spaces.'));
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                let code = await XeonBotInc.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
            } catch (error) {
                console.error('Error requesting pairing code:', error)
                console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
            }
        }, 3000)
    }

    // Connection handling
pairingSocket = XeonBotInc
        XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        
        if (qr) {
            console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.'))
        }
        
        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
        }
        
        if (connection == "open") {
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

            try {
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                await XeonBotInc.sendMessage(botNumber, {
                    text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!\n\n✅Make sure to join below channel`,
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363161513685998@newsletter',
                            newsletterName: 'KnightBot MD',
                            serverMessageId: -1
                        }
                    }
                });
            } catch (error) {
                console.error('Error sending connection message:', error.message)
            }

            await delay(1999)
            console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'KNIGHT BOT'} ]`)}\n\n`))
            console.log(chalk.cyan(`< ================================================== >`))
            console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: MR UNIQUE HACKER`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: mrunqiuehacker`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: MR UNIQUE HACKER`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
            console.log(chalk.blue(`Bot Version: ${settings.version}`))
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            const statusCode = lastDisconnect?.error?.output?.statusCode
            
            console.log(chalk.red(`Connection closed due to ${lastDisconnect?.error}, reconnecting ${shouldReconnect}`))
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try {
                    rmSync('./session', { recursive: true, force: true })
                    console.log(chalk.yellow('Session folder deleted. Please re-authenticate.'))
                } catch (error) {
                    console.error('Error deleting session:', error)
                }
                console.log(chalk.red('Session logged out. Please re-authenticate.'))
            }
            
            if (shouldReconnect) {
                console.log(chalk.yellow('Reconnecting...'))
                await delay(5000)
                startXeonBotInc()
            }
        }
    })

    // Track recently-notified callers to avoid spamming messages
    const antiCallNotified = new Set();

    // Anticall handler: block callers when enabled
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // First: attempt to reject the call if supported
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                            await XeonBotInc.rejectCall(call.id, callerJid);
                        } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                            await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                        }
                    } catch {}

                    // Notify the caller only once within a short window
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                    }
                } catch {}
                // Then: block after a short delay to ensure rejection and message are processed
                setTimeout(async () => {
                    try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                }, 800);
            }
        } catch (e) {
            // ignore
        }
    });

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
    } catch (error) {
        console.error('Error in startXeonBotInc:', error)
        await delay(5000)
        startXeonBotInc()
    }
}


// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})