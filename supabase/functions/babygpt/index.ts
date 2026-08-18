// Edge function "babygpt" — responde perguntas sobre a primeira infância
// (0 a 3 anos) para o site BabyGPT, uma realização da Free School.
//
// verify_jwt: OFF de propósito — o site é público e sem login.
// PROTEÇÃO DE CUSTO = os limites por IP e global, que se apoiam nas linhas de
// public.babygpt_perguntas. O CORS NÃO protege o bolso (Origin é forjável fora
// do navegador); ele só protege o usuário no navegador. Por isso os dois
// caminhos de contagem falham FECHADO: se não dá para contar ou para gravar,
// a chamada paga à Anthropic não acontece.
// Segredo reaproveitado do projeto: ANTHROPIC_API_KEY (o mesmo do whatsapp-bot).

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MODELO = "claude-sonnet-5";
const MAX_TOKENS = 1000;
const MAX_PERGUNTA = 500; // caracteres
const LIMITE_IP_HORA = 8;
const LIMITE_GLOBAL_DIA = 400;

const SYSTEM = `Você é o BabyGPT, um assistente que responde perguntas de pais e cuidadores sobre a primeira infância — bebês e crianças de 0 a 3 anos. É uma realização da Free School.

COMO RESPONDER
- Português do Brasil, tom acolhedor e direto, sem julgamento e sem alarmismo.
- CURTO: no máximo 200 palavras, sempre. Prefira 3 ou 4 tópicos práticos a um texto longo — resposta cortada no meio é pior que resposta curta.
- Prático: o que dá para fazer hoje, em casa. Lembre que cada criança tem o próprio ritmo.
- Sem jargão técnico e no máximo um emoji por resposta.

LIMITES (invioláveis)
- Você NÃO é médico: nunca dê diagnóstico, dose de remédio nem conduta clínica. Dúvida de saúde é sempre conversa para o pediatra da criança.
- Sinais de urgência (bebê com menos de 3 meses com febre, dificuldade para respirar, convulsão, engasgo, queda seguida de vômito ou sonolência, sinais de desidratação, criança muito mole ou apática): oriente a procurar atendimento médico IMEDIATAMENTE, antes de qualquer outra orientação.
- SOFRIMENTO DE QUEM CUIDA NUNCA É "FORA DO TEMA". Tristeza profunda, desespero, exaustão extrema, pensamentos de se machucar ou de machucar o bebê: acolha sem julgamento, diga que isso acontece com muita gente e tem tratamento, oriente procurar ajuda hoje (CVV 188, gratuito e 24h; ou pronto-socorro / a própria equipe do pré-natal ou do posto de saúde) e peça que não fique sozinha agora. Não emende dicas de rotina nessa resposta.
- SACUDIR bebê ou criança pequena nunca é seguro, em nenhuma intensidade — diga isso com clareza. Se já aconteceu e a criança apresenta vômito, sonolência, irritabilidade ou qualquer mudança, atendimento médico IMEDIATO.
- Suspeita de violência ou maus-tratos contra a criança: acolha sem julgar quem contou e oriente o Disque 100 ou o Conselho Tutelar da cidade.
- Gestação e pós-parto imediato não são o seu tema: acolha em uma frase e encaminhe ao pré-natal, obstetra ou parteira, sem orientação clínica. Nunca se apresente como quem cobre gravidez.
- Não invente estatísticas, estudos, nomes ou instituições. Não cite prêmios nem organismos internacionais como autoridade.
- Fora do tema 0 a 3 anos (e da parentalidade próxima a ele): diga com gentileza que o BabyGPT é focado na primeira infância e volte ao tema. Isso vale para assuntos alheios — NUNCA para o sofrimento de quem cuida.
- Não peça dados pessoais; se a pessoa incluir dados sensíveis, não os repita na resposta.
- Se perguntarem sobre creche ou escola: explique o que observar numa boa creche (proporção de adultos por criança, adaptação gradual, ambiente seguro, pouca ou nenhuma tela), sem citar nomes de escolas.

Quando fizer sentido, termine devolvendo confiança a quem cuida: quem pergunta já está cuidando.`;

function corsOrigem(origin: string | null): string | null {
  if (!origin) return null;
  const exatos = [
    "https://babygpt.com.br",
    "https://www.babygpt.com.br",
    "https://babygpt-one.vercel.app",
    "https://babygpt.vercel.app",
  ];
  return exatos.includes(origin) ? origin : null;
}

/**
 * IP de quem chamou. Usa o ÚLTIMO valor do x-forwarded-for: os anteriores são
 * o que o cliente mandou (forjável), o último é o que a plataforma acrescentou.
 * Sem isso, um script troca o header a cada request e nunca bate no limite.
 */
function ipDoPedido(req: Request): string {
  const partes = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return partes.length ? partes[partes.length - 1] : "desconhecido";
}

/** Conta linhas; devolve null quando NÃO foi possível contar (falha fechado). */
async function contar(filtro: string): Promise<number | null> {
  try {
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
    if (!r.ok) {
      console.error("babygpt: contagem falhou", r.status, filtro);
      return null;
    }
    const total = parseInt((r.headers.get("content-range") ?? "").split("/")[1] ?? "", 10);
    if (!Number.isFinite(total)) {
      console.error("babygpt: content-range ilegivel", r.headers.get("content-range"));
      return null;
    }
    return total;
  } catch (e) {
    console.error("babygpt: contagem com erro de rede", String(e));
    return null;
  }
}

/**
 * Grava a pergunta e devolve o id da linha (null se falhou). É esse insert que
 * alimenta os contadores: se falhar, o limite não funcionaria — então ninguém
 * pergunta. O id volta para anexar a resposta depois, sem depender de ordem.
 */
async function registrar(linha: Record<string, unknown>): Promise<number | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/babygpt_perguntas?select=id`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify(linha),
    });
    if (!r.ok) {
      console.error("babygpt: insert falhou", r.status, (await r.text()).slice(0, 300));
      return null;
    }
    const linhas = await r.json();
    const id = Array.isArray(linhas) ? linhas[0]?.id : null;
    return typeof id === "number" ? id : null;
  } catch (e) {
    console.error("babygpt: insert com erro de rede", String(e));
    return null;
  }
}

function json(corpo: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(corpo), { status, headers });
}

const INDISPONIVEL = "Não consegui responder agora. Tente de novo em instantes.";

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
    const corpo = await req.json();
    if (corpo && typeof corpo === "object" && !Array.isArray(corpo)) {
      pergunta = String((corpo as { pergunta?: unknown }).pergunta ?? "").trim();
    }
  } catch { /* corpo inválido cai no vazio */ }
  if (!pergunta) return json({ erro: "Escreva uma pergunta primeiro." }, 400, headers);
  pergunta = pergunta.slice(0, MAX_PERGUNTA);

  const ip = ipDoPedido(req);
  const umaHoraAtras = new Date(Date.now() - 3_600_000).toISOString();
  const umDiaAtras = new Date(Date.now() - 86_400_000).toISOString();
  const [porIp, global] = await Promise.all([
    contar(`ip=eq.${encodeURIComponent(ip)}&criado_em=gte.${umaHoraAtras}`),
    contar(`criado_em=gte.${umDiaAtras}`),
  ]);
  // Falha fechado: sem contagem confiável, não gasta chamada paga.
  if (porIp === null || global === null) return json({ erro: INDISPONIVEL }, 503, headers);
  if (porIp >= LIMITE_IP_HORA) {
    return json({ erro: "Você fez várias perguntas seguidas. Respire, teste as dicas — e volte em uma horinha. 💛" }, 429, headers);
  }
  if (global >= LIMITE_GLOBAL_DIA) {
    return json({ erro: "O BabyGPT recebeu muitas perguntas hoje e foi descansar. Volte amanhã!" }, 429, headers);
  }

  // Reserva a vaga ANTES de chamar a API: é essa linha que faz o contador andar.
  // Se a gravação falhar, o limite não funcionaria — então nem chamamos a Anthropic.
  const idLinha = await registrar({ pergunta, ip, origem: req.headers.get("origin") });
  if (idLinha === null) return json({ erro: INDISPONIVEL }, 503, headers);

  let texto = "";
  let cortada = false;
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
    cortada = dados.stop_reason === "max_tokens";
    texto = (dados.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();
  } catch (e) {
    console.error("babygpt: anthropic", String(e));
    return json({ erro: INDISPONIVEL }, 502, headers);
  }
  if (!texto) return json({ erro: INDISPONIVEL }, 502, headers);

  // Resposta truncada no limite de tokens: corta no último fim de frase para
  // não terminar no meio de uma palavra, e avisa que ficou pela metade.
  if (cortada) {
    const fim = Math.max(texto.lastIndexOf("\n"), texto.lastIndexOf(". "), texto.lastIndexOf("! "), texto.lastIndexOf("? "));
    if (fim > 200) texto = texto.slice(0, fim + 1).trim();
    texto += "\n\n(Ficou grande e precisei parar por aqui — se quiser, pergunte de novo focando em um ponto.)";
  }

  await fetch(`${SUPABASE_URL}/rest/v1/babygpt_perguntas?id=eq.${idLinha}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ resposta: texto.slice(0, 4000) }),
  }).catch((e) => console.error("babygpt: patch da resposta", String(e)));

  return json({ resposta: texto }, 200, headers);
});
