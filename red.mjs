import { Client as BotClient, GatewayIntentBits, Events, EmbedBuilder, AuditLogEvent } from "discord.js";
import { Client as UserClient } from "discord.js-selfbot-v13";

const BOT_TOKEN = "MTUyNTc3NjUyNTIwOTYzMjg3OQ.GO2zr5.Ojhz7-cWMpKGztd4ctSUS9-uE40paOGE9ln7PA";
const USER_TOKEN = "MTE0OTUwMjM4MTIxODg3MzQyNQ.GqzO5u.q9FtFcDBqYpbfRGgzHVKTN2IdDMzeg9ZFRWHs4";
const GROQ_API_KEY = "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";

const BOT_CHAT_CHANNEL_ID = "1527300945384313065";
const BOT_LOG_CHANNEL_ID = "1529068062140006490";

const chatMemory = new Map();

async function askGroqAIWithHistory(channelId, prompt, systemPrompt) {
  try {
    if (!chatMemory.has(channelId)) {
      chatMemory.set(channelId, []);
    }
    const history = chatMemory.get(channelId);

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: prompt }
    ];

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        temperature: 0.2,
        max_tokens: 500
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) throw new Error("API Error");
    const data = await res.json();
    const replyText = data.choices[0]?.message?.content || "ไม่สามารถสร้างคำตอบได้ครับ";

    history.push({ role: "user", content: prompt });
    history.push({ role: "assistant", content: replyText });

    if (history.length > 10) {
      chatMemory.set(channelId, history.slice(-10));
    }

    return replyText;
  } catch (err) {
    return "เกิดข้อผิดพลาดในการประมวลผลครับ";
  }
}

const bot = new BotClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ]
});

bot.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.channel.id !== BOT_CHAT_CHANNEL_ID) return;

  const prompt = message.content.trim();
  if (!prompt) return;

  const systemInstruction = `คุณคือ Red Flash 5.7
หน้าที่สำคัญของคุณ:
1. อ่านวิเคราะห์ประวัติการคุยเดิมและความต้องการที่แท้จริงของผู้ใช้อย่างถี่ถ้วนก่อนตอบ
2. ตอบคำถามภาษาไทยให้ออกมาตรงประเด็น ถูกต้อง สั้น กระชับ คุยต่อเนื่องจากบทสนทนาเดิมได้
3. ใช้หางเสียงลงท้ายด้วย "ครับ" เท่านั้น ห้ามใช้ "ค่ะ" หรือ "คะ" เด็ดขาด`;

  const answer = await askGroqAIWithHistory(message.channel.id, prompt, systemInstruction);
  await message.reply(answer);
});

bot.on(Events.MessageDelete, async (message) => {
  if (!message.guild || message.author?.bot) return;
  try {
    const logChannel = await message.guild.channels.fetch(BOT_LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) return;

    let deleter = "เจ้าของข้อความ (ลบเอง)";
    let reason = "ไม่ได้ระบุเหตุผล";

    const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete }).catch(() => null);
    const deletionLog = fetchedLogs?.entries.first();

    if (deletionLog) {
      const { executor, target, reason: logReason, createdTimestamp } = deletionLog;
      if (target.id === message.author?.id && (Date.now() - createdTimestamp < 5000)) {
        deleter = `${executor} (${executor.tag})`;
        if (logReason) reason = logReason;
      }
    }

    const now = new Date();
    const dateString = now.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Bangkok" });
    const timeString = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" });
    const contentText = message.content ? message.content : "*(ไม่พบข้อความตัวหนังสือ)*";

    const embed = new EmbedBuilder()
      .setTitle("🗑️ มีข้อความถูกลบ!")
      .setColor(0xFF0000)
      .addFields(
        { name: "📅 วันที่และเวลา", value: `${dateString} เวลา ${timeString} น.`, inline: false },
        { name: "👤 ผู้ส่งข้อความ (แท็ก)", value: `${message.author ? message.author : "ไม่ทราบผู้ส่ง"} (${message.author ? message.author.tag : "N/A"})`, inline: true },
        { name: "🔨 ผู้ลบข้อความ", value: `${deleter}`, inline: true },
        { name: "💬 ช่องทาง", value: `<#${message.channel.id}>`, inline: true },
        { name: "📝 เหตุผลการลบ", value: `${reason}`, inline: false },
        { name: "📄 ข้อความที่ถูกลบ", value: `\`\`\`\n${contentText}\n\`\`\``, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: "Red Flash 5.7 Audit System" });

    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Delete Log Error:", err);
  }
});

const userClient = new UserClient({
  checkUpdate: false,
  ws: {
    properties: {
      $os: "android",
      $browser: "Discord Android",
      $device: "Discord Android"
    }
  }
});

function updateStatus() {
  const now = new Date();
  const timeString = now.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok"
  });
  const dateString = now.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok"
  });

  userClient.user.setPresence({
    activities: [
      {
        name: `เวลา: ${timeString} | 📅 ${dateString}`,
        type: "WATCHING"
      }
    ],
    status: "online"
  });
}

userClient.on("ready", () => {
  console.log(`📱 User Mobile Status พร้อมทำงานแล้ว: ${userClient.user.tag}`);
  updateStatus();
  setInterval(updateStatus, 10000);
});

bot.once(Events.ClientReady, (c) => console.log(`⚡️ Bot Red พร้อมใช้งานแล้ว! — ${c.user.tag}`));

bot.login(BOT_TOKEN);
userClient.login(USER_TOKEN);
       
