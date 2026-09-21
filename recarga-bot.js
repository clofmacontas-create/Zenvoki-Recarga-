require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.SIMVA_CLIENT_BOT_TOKEN;

if (!TOKEN) {
  throw new Error("SIMVA_CLIENT_BOT_TOKEN não configurado no .env");
}

const bot = new TelegramBot(TOKEN, { polling: true });
const pedidosEmAndamento = new Map();

setInterval(async () => {
  for (const [chatId, pedido] of pedidosEmAndamento.entries()) {
    if (!pedido.pixId || pedido.pixStatus === "paid") continue;

    try {
      const pix = await consultarPix(pedido.pixId);
      const status = String(pix.status || "").toLowerCase();

      console.log(`💳 PIX ${pedido.pixId}: ${status}`);

      pedido.pixStatus = status;
      pedidosEmAndamento.set(chatId, pedido);

      if (["paid", "completed", "confirmed"].includes(status)) {
        pedido.pixStatus = "paid";
        pedidosEmAndamento.set(chatId, pedido);

        await bot.sendMessage(
          chatId,
          `✅ PAGAMENTO CONFIRMADO!

📡 Operadora: ${pedido.operadora}
💰 Recarga: R$ ${pedido.recarga}
📱 Número: ${pedido.numero}

💳 PIX confirmado com sucesso.

⏱️ Sua recarga será processada em até 24 horas.
Você receberá o comprovante assim que for concluída.`
        );

        console.log(`✅ PIX pago: ${pedido.pixId}`);
      }

    } catch (error) {
      console.error(
        `❌ Erro ao consultar PIX ${pedido.pixId}:`,
        error.message
      );
    }
  }
}, 10000);


async function consultarPix(pixId) {
  const token = process.env.PIX_DIRECT_TOKEN;

  if (!token) {
    throw new Error("PIX_DIRECT_TOKEN não configurado");
  }

  const resposta = await fetch(
    `https://pix.direct/v1/deposits/${pixId}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  const data = await resposta.json();

  if (!resposta.ok) {
    throw new Error(`Pix.direct HTTP ${resposta.status}`);
  }

  return data;
}


const MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "📲 Recargas", callback_data: "recargas" },
        { text: "📡 eSIM", callback_data: "esim" }
      ],
      [
        { text: "🎬 Streaming", callback_data: "streaming" },
        { text: "💰 Valores e serviços", callback_data: "valores" }
      ],
      [
        { text: "👨‍💻 Atendimento", callback_data: "atendimento" }
      ]
    ]
  }
};

bot.onText(/^\/start$/, async (msg) => {
  console.log("📩 /start recebido");

  const db = require("./db.json");

  const botoes = [];

  if (db.operadoras?.TIM) {
    botoes.push([
      { text: "💙 TIM", callback_data: "operadora_TIM" }
    ]);
  }

  if (db.operadoras?.CLARO) {
    botoes.push([
      { text: "❤️ CLARO", callback_data: "operadora_CLARO" }
    ]);
  }

  if (db.operadoras?.VIVO) {
    botoes.push([
      { text: "💜 VIVO", callback_data: "operadora_VIVO" }
    ]);
  }

  await bot.sendMessage(
    msg.chat.id,
    `📲 RECARGA 8B RECARGAS

Escolha sua operadora:`,
    {
      reply_markup: {
        inline_keyboard: botoes
      }
    }
  );
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const pedido = pedidosEmAndamento.get(chatId);

  if (!pedido) return;

  const numero = msg.text.replace(/\D/g, "");

  if (numero.length < 10 || numero.length > 11) {
    await bot.sendMessage(
      chatId,
      "❌ Número inválido. Digite um número com DDD, por exemplo: 85999999999"
    );
    return;
  }

  pedido.numero = numero;
  pedidosEmAndamento.set(chatId, pedido);

  await bot.sendMessage(
    chatId,
    `✅ Dados da recarga

📡 Operadora: ${pedido.operadora}
💰 Valor: R$ ${pedido.recarga}
📱 Número: ${numero}

Os dados estão corretos?`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirmar", callback_data: "confirmar_recarga" },
            { text: "❌ Corrigir", callback_data: "corrigir_numero" }
          ]
        ]
      }
    }
  );
});

bot.on("callback_query", async (query) => {
  const chatId = query.from.id;
  const acao = query.data;

  await bot.answerCallbackQuery(query.id);

  if (acao.startsWith("operadora_")) {
    const operadora = acao.replace("operadora_", "");
    const db = require("./db.json");

    if (!db.operadoras?.[operadora]) {
      await bot.sendMessage(
        chatId,
        "❌ Essa operadora está temporariamente indisponível."
      );
      return;
    }

    const valores = db.recharges?.[operadora] || {};
    const botoes = [];

    for (const [recarga, dados] of Object.entries(valores)) {
      if (dados.ativo) {
        botoes.push([
          {
            text: `📲 R$ ${recarga} → R$ ${dados.preco}`,
            callback_data: `recarga_${operadora}_${recarga}`
          }
        ]);
      }
    }

    botoes.push([
      { text: "🔙 Voltar", callback_data: "voltar_operadoras" }
    ]);

    await bot.sendMessage(
      chatId,
      `📲 ${operadora}

Escolha o valor da recarga:`,
      {
        reply_markup: {
          inline_keyboard: botoes
        }
      }
    );

    return;
  }

  if (acao.startsWith("recarga_")) {
    const partes = acao.split("_");
    const operadora = partes[1];
    const recarga = partes[2];

    const db = require("./db.json");
    const preco = db.recharges?.[operadora]?.[recarga]?.preco;

    pedidosEmAndamento.set(chatId, {
      operadora,
      recarga,
      preco
    });

    await bot.sendMessage(
      chatId,
      `📲 ${operadora} — R$ ${recarga}

Digite o número que receberá a recarga:`
    );

    return;
  }

  if (acao === "confirmar_recarga") {
    const pedido = pedidosEmAndamento.get(chatId);

    if (!pedido || !pedido.numero) {
      await bot.sendMessage(
        chatId,
        "❌ Não encontrei os dados dessa recarga. Comece novamente com /start."
      );
      return;
    }

    await bot.sendMessage(
      chatId,
      "⏳ Gerando seu pagamento via PIX..."
    );

    try {
      const resposta = await fetch("https://zenvoki.onrender.com/api/pix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          operadora: pedido.operadora,
          recarga: pedido.recarga,
          preco: Number(pedido.preco || 0),
          numero: pedido.numero
        })
      });

      const data = await resposta.json();

      if (!resposta.ok || !data.success) {
        console.error("Erro ao gerar PIX:", data);

        await bot.sendMessage(
          chatId,
          "❌ Não foi possível gerar o PIX agora. Tente novamente em alguns instantes."
        );
        return;
      }

      pedido.pedidoId = data.pedido.id;
      pedido.pixId = data.pix.id;
      pedido.pixCopiaCola = data.pixCopiaCola;

      pedidosEmAndamento.set(chatId, pedido);

      await bot.sendMessage(
        chatId,
        `💳 *PAGAMENTO VIA PIX*

━━━━━━━━━━━━━━━━━━
📡 *Operadora:* ${pedido.operadora}
💰 *Recarga:* R$ ${pedido.recarga}
📱 *Número:* ${pedido.numero}
━━━━━━━━━━━━━━━━━━

💵 *VALOR PARA PAGAMENTO*
*R$ ${(data.pix.amount_cents / 100).toFixed(2)}*

📋 *PIX COPIA E COLA*

\`\`\`
${data.pixCopiaCola}
\`\`\`

⚠️ *Após realizar o pagamento, aguarde a confirmação automática.*
━━━━━━━━━━━━━━━━━━`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📋 COPIAR PIX",
                  copy_text: {
                    text: data.pixCopiaCola
                  }
                }
              ]
            ]
          }
        }
      );

    } catch (error) {
      console.error("Erro ao conectar com a API PIX:", error);

      await bot.sendMessage(
        chatId,
        "❌ Não foi possível conectar ao sistema de pagamento. Tente novamente."
      );
    }

    return;
  }

  if (acao === "corrigir_numero") {
    const pedido = pedidosEmAndamento.get(chatId);

    if (!pedido) {
      await bot.sendMessage(
        chatId,
        "❌ Pedido não encontrado. Comece novamente com /start."
      );
      return;
    }

    await bot.sendMessage(
      chatId,
      "📱 Digite novamente o número que receberá a recarga:"
    );

    return;
  }

  if (acao === "voltar_operadoras") {
    const db = require("./db.json");
    const botoes = [];

    if (db.operadoras?.CLARO) {
      botoes.push([
        { text: "❤️ CLARO", callback_data: "operadora_CLARO" }
      ]);
    }

    if (db.operadoras?.VIVO) {
      botoes.push([
        { text: "💜 VIVO", callback_data: "operadora_VIVO" }
      ]);
    }

    await bot.sendMessage(
      chatId,
      "📲 RECARGA 8B RECARGAS\n\nEscolha sua operadora:",
      {
        reply_markup: {
          inline_keyboard: botoes
        }
      }
    );
  }
});

if (process.env.RUN_TELEGRAM_BOT !== "false") bot.startPolling();

console.log("🤖 8B RECARGAS Bot iniciado!");
