// Edge function "babygpt" — responde perguntas sobre a primeira infância
// (0 a 3 anos) para o site BabyGPT, uma realização da Free School.
//
// verify_jwt: OFF de propósito — o site é público e sem login. As proteções
// reais são: CORS restrito aos domínios do site, limite por IP por hora e
// teto global diário (proteção de custo da API). Toda pergunta/resposta é
// gravada em public.babygpt_perguntas (RLS sem políticas; só a service role).
// Segredo reaproveitado do projeto: ANTHROPIC_API_KEY (o mesmo do whatsapp-bot).

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MODELO = "claude-sonnet-5";
const MAX_TOKENS = 700;
const MAX_PERGUNTA = 500; // caracteres
const LIMITE_IP_HORA = 8;
const LIMITE_GLOBAL_DIA = 400;

const SYSTEM = `Você é o BabyGPT, um assistente que responde perguntas de pais e cuidadores sobre a primeira infância — bebês e crianças de 0 a 3 anos. É uma realização da Free School.

COMO RESPONDER
- Português do Brasil, tom acolhedor e direto, sem julgamento e sem alarmismo.
- Curto: no máximo 200 palavras. Parágrafos curtos; use lista quando ajudar.
- Prático: o que dá para fazer hoje, em casa. Lembre que cada criança tem o próprio ritmo.
- Sem jargão técnico e no máximo um emoji por resposta.

LIMITES (invioláveis)
- Você NÃO é médico: nunca dê diagnóstico, dose de remédio nem conduta clínica. Dúvida de saúde é sempre conversa para o pediatra da criança.
- Sinais de urgência (bebê com menos de 3 meses com febre, dificuldade para respirar, convulsão, engasgo, queda seguida de vômito ou sonolência, sinais de desidratação, criança muito mole ou apática): oriente a procurar atendimento médico IMEDIATAMENTE, antes de qualquer outra orientação.
- Não invente estatísticas, estudos, nomes ou instituições. Não cite prêmios nem organismos internacionais como autoridade.
- Fora do tema 0 a 3 anos (e da parentalidade próxima a ele): diga com gentileza que o BabyGPT é focado na primeira infância e volte ao tema.
- Não peça dados pessoais; se a pessoa incluir dados sensíveis, não os repita na resposta.
- Se perguntarem sobre creche ou escola: explique o que observar numa boa creche (proporção de adultos por criança, adaptação gradual, ambiente seguro, pouca ou nenhuma tela), sem citar nomes de escolas.

Quando fizer sentido, termine devolvendo confiança a quem cuida: quem pergunta já está cuidando.`;

function corsOrigem(origin: string | null): string | null {
  if (!origin) return null;
  const exatos = [
    "https://babygpt.com.br",
    "https://www.babygpt.com.br",
  ];
  if (exatos.includes(origin)) return origin;
  // pré-produção: os deploys do projeto na Vercel (babygpt.vercel.app, previews)
  if (/^https:\/\/babygpt[a-z0-9-]*\.vercel\.app$/.test(origin)) return origin;
  return null;
}

async function contar(filtro: string): Promise<number> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/babygpt_perguntas?select=id&${filtro}`,
    {
      method: "HEAD",
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        prefer: "count=exact",
      },
    },
  );
  const total = parseInt((r.headers.get("content-range") ?? "").split("/")[1] ?? "", 10);
  return Number.isFinite(total) ? total : 0;
}

function json(corpo: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(corpo), { status, headers });
}

Deno.serve(async (req: Request) => {
  const cors = corsOrigem(req.headers.get("origin"));
  const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  if (cors) {
    headers["access-control-allow-origin"] = cors;
    headers["access-control-allow-headers"] = "content-type";
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["vary"] = "origin";
  }
  if (req.method === "OPTIONS") return new Response(null, { status: cors ? 204 : 403, headers });
  if (!cors || req.method !== "POST") return json({ erro: "forbidden" }, 403, headers);

  let pergunta = "";
  try {
    pergunta = String((await req.json())?.pergunta ?? "").trim();
  } catch { /* corpo inválido cai no vazio */ }
  if (!pergunta) return json({ erro: "Escreva uma pergunta primeiro." }, 400, headers);
  pergunta = pergunta.slice(0, MAX_PERGUNTA);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";
  const umaHoraAtras = new Date(Date.now() - 3_600_000).toISOString();
  const umDiaAtras = new Date(Date.now() - 86_400_000).toISOString();
  const [porIp, global] = await Promise.all([
    contar(`ip=eq.${encodeURIComponent(ip)}&criado_em=gte.${umaHoraAtras}`),
    contar(`criado_em=gte.${umDiaAtras}`),
  ]);
  if (porIp >= LIMITE_IP_HORA) {
    return json({ erro: "Você fez várias perguntas seguidas. Respire, teste as dicas — e volte em uma horinha. 💛" }, 429, headers);
  }
  if (global >= LIMITE_GLOBAL_DIA) {
    return json({ erro: "O BabyGPT recebeu muitas perguntas hoje e foi descansar. Volte amanhã!" }, 429, headers);
  }

  let texto = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages: [{ role: "user", content: pergunta }],
      }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}`);
    const dados = await r.json();
    texto = (dados.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();
  } catch (_e) {
    return json({ erro: "Não consegui responder agora. Tente de novo em instantes." }, 502, headers);
  }
  if (!texto) return json({ erro: "Não consegui responder agora. Tente de novo em instantes." }, 502, headers);

  // Grava ANTES de responder: é o insert que alimenta os contadores de limite.
  await fetch(`${SUPABASE_URL}/rest/v1/babygpt_perguntas`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ pergunta, resposta: texto.slice(0, 4000), ip, origem: req.headers.get("origin") }),
  }).catch(() => {});

  return json({ resposta: texto }, 200, headers);
});
